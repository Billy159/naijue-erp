import { allocateSalesDiscount, discountUnitPrice } from '../../../../../packages/domain/src/sales-money.ts';
import { minorAmount, quantity } from '../../../../../packages/domain/src/values.ts';
import type { SalesDraftDto } from './contracts.ts';
import { frozenSnapshot, validateSalesDraft } from './validation.ts';

/** Raw inputs are retained separately from the last valid native command. An
 * unfinished decimal must never silently save the previous valid price. */
export interface SalesFormInput {
  readonly businessDate: string; readonly note: string; readonly orderDiscount: string;
  readonly lines: readonly { readonly id: string; readonly quantity: string; readonly dealPrice: string;
    readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT' | null; readonly discount: string; readonly isGift: boolean | null; readonly zeroConfirmed: boolean | null }[];
  readonly settlements: readonly { readonly id: string; readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string }[];
}
export type SalesFormResult = { readonly ok: true; readonly draft: SalesDraftDto }
  | { readonly ok: false; readonly errors: Readonly<Record<string, string>> };

export function salesInputMoney(value: string): string {
  const signed = BigInt(value), magnitude = signed < 0n ? -signed : signed;
  return `${signed < 0n ? '-' : ''}${magnitude / 100n}.${(magnitude % 100n).toString().padStart(2, '0')}`;
}
export function salesFormInput(draft: SalesDraftDto): SalesFormInput {
  draft = validateSalesDraft(draft, { previous: draft });
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
  const originalInput = salesFormInput(base);
  if (base.header.hallId === null && (input.orderDiscount !== originalInput.orderDiscount || JSON.stringify(input.lines) !== JSON.stringify(originalInput.lines) || JSON.stringify(input.settlements) !== JSON.stringify(originalInput.settlements)))
    return { ok: false, errors: Object.freeze({ form: '营业厅归属待核；当前仅可修改备注和日期，原仓库、商品、数量、价格及收退款须保持不变。' }) };
  const signedSale = base.header.businessType === 'SALE' && base.lines.some(line => line.quantity.startsWith('-'));
  const incompleteEconomics = signedSale || base.lines.some(line => line.pricingRule === null || line.zeroConfirmed === null || line.isGift === null || line.allocatedDiscount === null);
  const unchangedEconomics = incompleteEconomics && input.orderDiscount === originalInput.orderDiscount
    && input.lines.length === originalInput.lines.length && input.lines.every((raw, index) => {
      const old = originalInput.lines[index]; return old !== undefined && (['id', 'quantity', 'dealPrice', 'pricingRule', 'discount', 'isGift', 'zeroConfirmed'] as const).every(key => raw[key] === old[key]);
    });
  let orderDiscount = base.header.orderDiscount;
  try { orderDiscount = amount(input.orderDiscount); if (signedSale && orderDiscount !== base.header.orderDiscount) throw new Error(); if (base.header.businessType !== 'SALE' && orderDiscount !== '0') throw new Error(); }
  catch { errors.orderDiscount = base.header.businessType === 'SALE' ? '请输入非负金额，最多两位小数。' : '独立退货 / 换货不能使用整单优惠。'; }
  const lines = retainedLines.map((line, index) => {
    const raw = input.lines[index]!;
    const oldRaw = originalInput.lines.find(row => row.id === raw.id);
    if (oldRaw && (['id', 'quantity', 'dealPrice', 'pricingRule', 'discount', 'isGift', 'zeroConfirmed'] as const).every(key => raw[key] === oldRaw[key])) return line;
    if (typeof raw.isGift !== 'boolean') errors[`line:${line.id}:isGift`] = '请明确选择赠品或普通商品；未知状态不能当作普通商品。';
    if (typeof raw.zeroConfirmed !== 'boolean') errors[`line:${line.id}:zeroConfirmed`] = '请明确确认普通商品的零价意图；原未知事实不会自动补为否。';
    let q = line.quantity, price = line.dealPrice, tenths: number | null = null;
    try {
      if (raw.quantity.length > 21 || !/^-?\d+$/.test(raw.quantity.trim())) throw new Error();
      q = quantity(BigInt(raw.quantity.trim()).toString()).toString();
      if (q === '0') throw new Error();
    } catch { errors[`line:${line.id}:quantity`] = '退回用负整数，售出用正整数，数量不能为零。'; }
    try {
      if (typeof raw.isGift !== 'boolean' || typeof raw.zeroConfirmed !== 'boolean') throw new Error();
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
  const nextSignedSale = base.header.businessType === 'SALE' && lines.some(line => line.quantity.startsWith('-'));
  if (nextSignedSale && !signedSale) {
    if (!lines.some(line => BigInt(line.quantity) > 0n)) errors.form = '仅有负数明细时请选择退货／换货类型。';
    else if (orderDiscount !== '0') errors.orderDiscount = '正负明细混合单不使用整单优惠／抹零，请清除整单优惠。';
  }
  const settlements = retainedSettlements.map((row, index) => {
    const raw = input.settlements[index]!; let value = row.amount;
    try { value = amount(raw.amount); if (!['RECEIVE', 'REFUND'].includes(raw.direction)) throw new Error(); }
    catch { errors[`settlement:${row.id}`] = '请输入非负收退金额，最多两位小数。'; }
    if (row.paymentMethodId === null && (raw.direction !== row.direction || value !== row.amount)) errors[`settlement:${row.id}`] = '原付款方式未知；修改收退明细前须明确实际付款方式。';
    return { ...row, direction: raw.direction, amount: value };
  });
  if (Object.keys(errors).length) return { ok: false, errors: Object.freeze(errors) };
  try {
    const gross = unchangedEconomics ? BigInt(base.header.grossAmount) : lines.reduce((sum, line) => sum + BigInt(line.lineAmount), 0n);
    const shares = unchangedEconomics || signedSale && orderDiscount !== '0' ? null : base.header.businessType === 'SALE' && !nextSignedSale
      ? allocateSalesDiscount(lines.map(line => minorAmount(line.lineAmount)), minorAmount(orderDiscount)) : lines.map(() => 0n);
    return { ok: true, draft: validateSalesDraft({ header: { ...base.header, businessDate: input.businessDate, note: input.note === '' ? null : input.note,
      orderDiscount, grossAmount: gross.toString(), netDue: unchangedEconomics ? base.header.netDue : (gross - BigInt(orderDiscount)).toString() },
    lines: shares === null ? lines : lines.map((line, index) => retainedLines.includes(line) && line.allocatedDiscount === null ? line : ({ ...line, allocatedDiscount: shares[index]!.toString() })), settlements }, { previous: base }) };
  } catch { return { ok: false, errors: Object.freeze({ form: '请检查有效日期、整单优惠不超过销售金额，以及当前明细金额。' }) }; }
}
