import { allocateSalesDiscount, discountUnitPrice } from '../../../../../packages/domain/src/sales-money.ts';
import { minorAmount, quantity } from '../../../../../packages/domain/src/values.ts';
import type { SalesDraftDto } from './contracts.ts';
import { frozenSnapshot, validateSalesDraft } from './validation.ts';

/** Raw inputs are retained separately from the last valid native command. An
 * unfinished decimal must never silently save the previous valid price. */
export interface SalesFormInput {
  readonly businessDate: string; readonly note: string; readonly orderDiscount: string;
  readonly lines: readonly { readonly id: string; readonly quantity: string; readonly dealPrice: string;
    readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT'; readonly discount: string; readonly isGift: boolean; readonly zeroConfirmed: boolean }[];
  readonly settlements: readonly { readonly id: string; readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string }[];
}
export type SalesFormResult = { readonly ok: true; readonly draft: SalesDraftDto }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

export function salesInputMoney(value: string): string {
  const signed = BigInt(value), magnitude = signed < 0n ? -signed : signed;
  return `${signed < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}
export function salesFormInput(draft: SalesDraftDto): SalesFormInput {
  draft = validateSalesDraft(draft);
  return frozenSnapshot({ businessDate: draft.header.businessDate, note: draft.header.note ?? '', orderDiscount: salesInputMoney(draft.header.orderDiscount),
    lines: draft.lines.map(line => ({ id: line.id, quantity: line.quantity, dealPrice: salesInputMoney(line.dealPrice), pricingRule: line.pricingRule,
      discount: line.discountTenths === null ? '' : `${Math.trunc(line.discountTenths / 10)}.${line.discountTenths % 10}`, isGift: line.isGift, zeroConfirmed: line.zeroConfirmed })),
    settlements: draft.settlements.map(row => ({ id: row.id, direction: row.direction as 'RECEIVE' | 'REFUND', amount: salesInputMoney(row.amount) })) });
}
function amount(raw: string): string {
  const value = raw.trim();
  if (value.length > 102 || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error();
  const [whole, fraction = ''] = value.split('.');
  const result = (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
  if (result.length > 100) throw new Error(); return result;
}
function discount(raw: string): number {
  const value = raw.trim();
  if (!/^\d{1,2}(?:\.\d)?$/.test(value)) throw new Error();
  const [whole, fraction = '0'] = value.split('.'); const tenths = Number(whole) * 10 + Number(fraction);
  if (tenths > 100) throw new Error(); return tenths;
}

/** This bounded editor changes or explicitly removes existing native rows only. Current reference,
 * product eligibility/minimum prices and permissions remain server authority.
 * Original IDs, barcodes, snapshots, row order and reference-price facts survive. */
export function compileSalesForm(base: SalesDraftDto, input: SalesFormInput): SalesFormResult {
  const errors: Record<string, string> = {};
  const retainedSubset = <T extends { readonly id: string }>(original: readonly T[], rows: readonly { readonly id: string }[]) => {
    let previous = -1; const retained: T[] = [];
    for (const row of rows) { const index = original.findIndex(item => item.id === row.id); if (index <= previous) return null; retained.push(original[index]!); previous = index; }
    return retained;
  };
  const retainedLines = retainedSubset(base.lines, input.lines), retainedSettlements = retainedSubset(base.settlements, input.settlements);
  if (!retainedLines || !retainedSettlements)
    return { ok: false, errors: Object.freeze({ form: '原行身份或顺序无效，请重新读取；不能合并、替换或伪造原行。' }) };
  if (!retainedLines.length) return { ok: false, errors: Object.freeze({ form: '请至少保留一条实际商品明细。' }) };
  let orderDiscount = '0';
  try { orderDiscount = amount(input.orderDiscount); if (base.header.businessType !== 'SALE' && orderDiscount !== '0') throw new Error(); }
  catch { errors.orderDiscount = base.header.businessType === 'SALE' ? '请输入非负金额，最多两位小数。' : '独立退货 / 换货不能使用整单优惠。'; }
  const lines = retainedLines.map((line, index) => {
    const raw = input.lines[index]!; let q = line.quantity, price = line.dealPrice, tenths: number | null = null;
    try {
      if (raw.quantity.length > 21 || !/^-?\d+$/.test(raw.quantity.trim())) throw new Error();
      q = quantity(BigInt(raw.quantity.trim()).toString()).toString();
      if (q === '0' || base.header.businessType === 'SALE' && BigInt(q) < 0n) throw new Error();
    } catch { errors[`line:${line.id}:quantity`] = base.header.businessType === 'SALE' ? '销售数量必须是正整数。' : '退回用负整数，换出用正整数，数量不能为零。'; }
    try {
      if (raw.pricingRule !== 'UNIT_PRICE' && raw.pricingRule !== 'DISCOUNT') throw new Error();
      if (raw.pricingRule === 'DISCOUNT') {
        tenths = discount(raw.discount);
        if (!raw.isGift && line.referencePrice === null) throw new Error();
        price = raw.isGift ? '0' : discountUnitPrice(minorAmount(line.referencePrice!), tenths).toString();
      } else price = raw.isGift ? '0' : amount(raw.dealPrice);
      if (raw.isGift) price = '0';
      if (!raw.isGift && price === '0' && !raw.zeroConfirmed) { errors[`line:${line.id}:zeroConfirmed`] = '普通商品零价须明确确认，仍须通过服务端最低价校验。'; }
    } catch { errors[`line:${line.id}:price`] = raw.pricingRule === 'DISCOUNT' ? '折扣须为 0～10 折、最多一位小数，并有明确参考价。' : '请输入非负成交单价，最多两位小数。'; }
    return { ...line, quantity: q, dealPrice: price, pricingRule: raw.pricingRule, discountTenths: tenths,
      zeroConfirmed: raw.zeroConfirmed, isGift: raw.isGift, lineAmount: (BigInt(q) * BigInt(price)).toString() };
  });
  const settlements = retainedSettlements.map((row, index) => {
    const raw = input.settlements[index]!; let value = row.amount;
    try { value = amount(raw.amount); if (!['RECEIVE', 'REFUND'].includes(raw.direction)) throw new Error(); }
    catch { errors[`settlement:${row.id}`] = '请输入非负收退金额，最多两位小数。'; }
    return { ...row, direction: raw.direction, amount: value };
  });
  if (Object.keys(errors).length) return { ok: false, errors: Object.freeze(errors) };
  try {
    const gross = lines.reduce((sum, line) => sum + BigInt(line.lineAmount), 0n);
    const shares = base.header.businessType === 'SALE'
      ? allocateSalesDiscount(lines.map(line => minorAmount(line.lineAmount)), minorAmount(orderDiscount)) : lines.map(() => 0n);
    return { ok: true, draft: validateSalesDraft({ header: { ...base.header, businessDate: input.businessDate, note: input.note === '' ? null : input.note,
      orderDiscount, grossAmount: gross.toString(), netDue: (gross - BigInt(orderDiscount)).toString() },
    lines: lines.map((line, index) => ({ ...line, allocatedDiscount: shares[index]!.toString() })), settlements }) };
  } catch { return { ok: false, errors: Object.freeze({ form: '请检查有效日期、整单优惠不超过销售金额，以及当前明细金额。' }) }; }
}
