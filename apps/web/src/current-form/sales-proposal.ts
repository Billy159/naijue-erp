import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentSalesReferenceItem, CurrentSalesReferenceQuery } from '../../../../packages/application/src/current-form-ports.ts';
import { businessDate, entityId, minorAmount, quantity } from '../../../../packages/domain/src/values.ts';
import { allocateSalesDiscount, discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';
import { currentBusinessDate } from './business-date.ts';
import { salesBusinessMode, salesBusinessType, type SalesBusinessMode } from './sales-business-mode.ts';
export type SalesProposalReader = Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readSalesReferences' | 'readProducts' | 'readProductSkus'>;
export type SalesProposalPicker = CurrentSalesReferenceQuery['kind'] | 'product' | 'sku';
export interface SalesProposalLine {
  readonly key: string;
  readonly sku: CurrentFormSku; readonly product: CurrentFormProduct; readonly quantity: string; readonly dealPrice: string;
  readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT'; readonly discount: string; readonly isGift: boolean; readonly zeroConfirmed: boolean;
}
export interface SalesProposal {
  readonly businessType: 'SALE' | 'RETURN' | 'EXCHANGE'; readonly businessDate: string; readonly note: string; readonly orderDiscount: string;
  readonly hall: CurrentSalesReferenceItem | null; readonly customer: CurrentSalesReferenceItem | null;
  readonly salesperson: CurrentSalesReferenceItem | null; readonly warehouse: CurrentSalesReferenceItem | null;
  readonly lines: readonly SalesProposalLine[];
  readonly settlements: readonly { readonly key: string; readonly method: CurrentSalesReferenceItem; readonly account: CurrentSalesReferenceItem; readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string }[];
}
type Candidate = CurrentSalesReferenceItem | CurrentFormProduct | CurrentFormSku;
export interface SalesProposalSnapshot {
  readonly draft: SalesProposal; readonly dirty: boolean; readonly disposed: boolean; readonly errors: readonly string[]; readonly notice: string | null;
  readonly totals: { readonly grossMinor: string; readonly netDueMinor: string; readonly settledMinor: string; readonly balanced: boolean } | null;
  readonly picker: { readonly kind: SalesProposalPicker; readonly search: string; readonly page: number;
    readonly product: CurrentFormProduct | null; readonly method: CurrentSalesReferenceItem | null;
    readonly phase: 'loading' | 'ready' | 'error'; readonly result: CurrentFormPage<Candidate> | null } | null;
}
const empty = (): SalesProposal => ({ businessType: 'SALE', businessDate: currentBusinessDate(), note: '', orderDiscount: '0.00', hall: null, customer: null, salesperson: null, warehouse: null, lines: [], settlements: [] });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function amount(raw: string): bigint {
  const value = raw.trim(); if (value.length > 102 || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw Error();
  const [whole, fraction = ''] = value.split('.'); const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result.toString().length > 100) throw Error(); return result;
}
/** Local sales/independent return/exchange proposals. Never creates native numbers/IDs, barcode facts,
 * minimum-price authority, approval eligibility, inventory effects or commands. */
export class SalesProposalSession {
  readonly #scope: ReadScope; readonly #reader: SalesProposalReader; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined; readonly #listeners = new Set<() => void>();
  #request: AbortController | null = null; #sequence = 0; #nextSettlement = 0; #nextLine = 0;
  #state: SalesProposalSnapshot = freeze({ draft: empty(), dirty: false, disposed: false, errors: [], notice: null, totals: null, picker: null });
  constructor(scope: ReadScope, reader: SalesProposalReader, onAccessFailure?: (error: HttpQueryError) => void) { this.#scope = scope; this.#reader = reader; this.#onAccessFailure = onAccessFailure; scope.signal.addEventListener('abort', this.dispose, { once: true }); if (!scope.active) this.dispose(); }
  readonly getSnapshot = (): SalesProposalSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  matchesIdentity(scope: ReadScope): boolean {
    const owner = this.#scope.identity, target = scope.identity;
    return !this.#state.disposed && this.#scope.active && scope.active && owner.accountId === target.accountId && owner.sessionRevision === target.sessionRevision && owner.permissionRevision === target.permissionRevision;
  }
  #publish(patch: Partial<SalesProposalSnapshot>): void { this.#state = freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* continue invalidation */ } } }
  #cancelRead(): void { this.#sequence++; this.#request?.abort(); this.#request = null; }
  #edit(draft: SalesProposal): boolean {
    if (this.#state.disposed) return false;
    const businessType = salesBusinessType(salesBusinessMode(draft.businessType), draft.lines.map(row => row.quantity));
    this.#publish({ draft: { ...draft, businessType }, dirty: true, errors: [], notice: null, totals: null }); return true;
  }
  setHeader(patch: Pick<Partial<SalesProposal>, 'businessDate' | 'note' | 'orderDiscount'>): boolean { return this.#edit({ ...this.#state.draft, ...patch }); }
  setBusinessType(businessType: SalesProposal['businessType']): boolean {
    if (!['SALE', 'RETURN', 'EXCHANGE'].includes(businessType)) return false;
    // Preserve explicit row signs and prices; never silently reverse stock intent.
    return this.#edit({ ...this.#state.draft, businessType, orderDiscount: '0.00' });
  }
  setBusinessMode(mode: SalesBusinessMode): boolean {
    if (mode !== 'SALE' && mode !== 'RETURN_EXCHANGE') return false;
    return this.setBusinessType(salesBusinessType(mode, this.#state.draft.lines.map(row => row.quantity)));
  }
  #lineKey(keyOrUniqueSku: string): string | null {
    const rows = this.#state.draft.lines;
    if (rows.some(row => row.key === keyOrUniqueSku)) return keyOrUniqueSku;
    const matches = rows.filter(row => row.sku.id === keyOrUniqueSku);
    return matches.length === 1 ? matches[0]!.key : null;
  }
  updateLine(keyOrUniqueSku: string, patch: Partial<Pick<SalesProposalLine, 'quantity' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift' | 'zeroConfirmed'>>): boolean {
    const key = this.#lineKey(keyOrUniqueSku); if (!key) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.map(row => row.key === key ? { ...row, ...patch } : row) });
  }
  removeLine(keyOrUniqueSku: string): boolean {
    const key = this.#lineKey(keyOrUniqueSku); if (!key) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => row.key !== key) });
  }
  updateSettlement(key: string, patch: { readonly amount?: string; readonly direction?: 'RECEIVE' | 'REFUND' }): boolean {
    if (!this.#state.draft.settlements.some(row => row.key === key)) return false;
    return this.#edit({ ...this.#state.draft, settlements: this.#state.draft.settlements.map(row => row.key === key ? { ...row, ...patch } : row) });
  }
  removeSettlement(key: string): boolean { return this.#edit({ ...this.#state.draft, settlements: this.#state.draft.settlements.filter(row => row.key !== key) }); }
  clearSalesperson(): boolean { return this.#edit({ ...this.#state.draft, salesperson: null }); }
  async openPicker(kind: Exclude<SalesProposalPicker, 'sku' | 'paymentAccount'>): Promise<void> {
    if (this.#state.disposed) return;
    if (kind !== 'hall' && !this.#state.draft.hall) { this.#publish({ notice: '请先选择营业厅。' }); return; }
    await this.#read(kind, '', 1, null, null);
  }
  async search(search: string): Promise<void> { const p = this.#state.picker; if (p && p.kind !== 'sku') await this.#read(p.kind, search, 1, p.product, p.method); }
  async page(page: number): Promise<void> {
    const p = this.#state.picker;
    if (!p || p.phase !== 'ready' || !p.result || !Number.isSafeInteger(page) || page < 1 || BigInt(page - 1) * 20n >= p.result.exactTotal) return;
    await this.#read(p.kind, p.search, page, p.product, p.method);
  }
  async retry(): Promise<void> { const p = this.#state.picker; if (p?.phase === 'error') await this.#read(p.kind, p.search, p.page, p.product, p.method); }
  closePicker(): void { this.#cancelRead(); if (!this.#state.disposed) this.#publish({ picker: null }); }
  async #read(kind: SalesProposalPicker, search: string, page: number, product: CurrentFormProduct | null, method: CurrentSalesReferenceItem | null): Promise<void> {
    if (this.#state.disposed) return;
    this.#cancelRead(); const sequence = this.#sequence, request = new AbortController(); this.#request = request;
    const signal = AbortSignal.any([request.signal, this.#scope.signal]); const hall = this.#state.draft.hall;
    this.#publish({ picker: { kind, search, page, product, method, phase: 'loading', result: null }, notice: null });
    try {
      const hallId = hall ? entityId('hall', hall.id) : null;
      let result: CurrentFormPage<Candidate>;
      if (kind === 'product') result = await this.#reader.readProducts({ context: { kind: 'SALES', hallId: hallId! }, search, page, pageSize: 20 }, signal);
      else if (kind === 'sku') result = await this.#reader.readProductSkus({ context: { kind: 'SALES', hallId: hallId! }, productId: product!.id, page, pageSize: 20 }, signal);
      else {
        const query: CurrentSalesReferenceQuery = kind === 'hall' ? { kind, hallId: null, search, page, pageSize: 20 }
          : kind === 'paymentAccount' ? { kind, hallId: hallId!, paymentMethodId: entityId('paymentMethod', method!.id), search, page, pageSize: 20 }
          : { kind, hallId: hallId!, search, page, pageSize: 20 };
        result = await this.#reader.readSalesReferences(query, signal);
      }
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      this.#publish({ picker: { kind, search, page, product, method, phase: 'ready', result } });
    } catch (error) {
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* Scope already cleared. */ } return; }
      this.#publish({ picker: { kind, search, page, product, method, phase: 'error', result: null }, notice: '候选读取失败，未改变草稿。可明确重试。' });
    } finally { if (this.#request === request) this.#request = null; }
  }
  async select(id: string): Promise<boolean> {
    const p = this.#state.picker; if (this.#state.disposed || p?.phase !== 'ready') return false;
    const item = p.result?.items.find(row => row.id === id); if (!item) return false;
    if (p.kind === 'product') { await this.#read('sku', '', 1, item as CurrentFormProduct, null); return true; }
    if (p.kind === 'paymentMethod') { await this.#read('paymentAccount', '', 1, null, item as CurrentSalesReferenceItem); return true; }
    const draft = this.#state.draft;
    if (p.kind === 'sku') {
      if (draft.lines.length >= 200) { this.#publish({ notice: '已达 200 行上限。请修改现有行。' }); return false; }
      return this.#edit({ ...draft, lines: [...draft.lines, { key: `local-line-${++this.#nextLine}`, sku: item as CurrentFormSku, product: p.product!, quantity: '1', dealPrice: '', pricingRule: 'UNIT_PRICE', discount: '', isGift: false, zeroConfirmed: false }] });
    }
    if (p.kind === 'paymentAccount') {
      if (draft.settlements.length >= 3) { this.#publish({ notice: '收退明细已达原生单据 3 行上限。' }); return false; }
      this.closePicker(); return this.#edit({ ...draft, settlements: [...draft.settlements, { key: `local-settlement-${++this.#nextSettlement}`, method: p.method!, account: item as CurrentSalesReferenceItem, direction: 'RECEIVE', amount: '' }] });
    }
    if (p.kind === 'hall' && draft.hall?.id !== id && (draft.customer || draft.salesperson || draft.warehouse || draft.lines.length || draft.settlements.length)) {
      this.#publish({ notice: '切换营业厅会改变候选范围。请先确认重置草稿，再选择新厅。' }); return false;
    }
    this.closePicker(); return this.#edit({ ...draft, [p.kind]: item });
  }
  validate(): SalesProposal | null {
    if (this.#state.disposed) return null;
    const draft = this.#state.draft, errors: string[] = [], gross: bigint[] = [];
    try { businessDate(draft.businessDate); } catch { errors.push('请输入有效单据日期。'); }
    if (!draft.hall || !draft.customer || !draft.warehouse) errors.push('请选择营业厅、客户和仓库。');
    if (draft.warehouse && draft.warehouse.hallId !== draft.hall?.id) errors.push('仓库必须属于所选营业厅。');
    if (draft.note.length > 10000) errors.push('备注不能超过 10000 字符。');
    if (!draft.lines.length) errors.push('请至少添加一个实际规格。');
    for (const row of draft.lines) {
      try {
        if (!(draft.businessType === 'SALE' ? /^[1-9]\d{0,18}$/ : /^-?[1-9]\d{0,18}$/).test(row.quantity)) throw Error(); const q = quantity(row.quantity); let price: bigint;
        if (row.isGift) price = 0n;
        else if (row.pricingRule === 'UNIT_PRICE') price = amount(row.dealPrice);
        else {
          if (row.pricingRule !== 'DISCOUNT' || row.product.retailPrice === null || !/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim())) throw Error();
          const [whole, fraction = '0'] = row.discount.trim().split('.');
          price = discountUnitPrice(minorAmount(amount(row.product.retailPrice).toString()), Number(whole) * 10 + Number(fraction));
        }
        if (price === 0n && !row.isGift && !row.zeroConfirmed) throw Error(); gross.push(q * price);
      } catch { errors.push(`${row.sku.skuCode}：请核对${draft.businessType === 'SALE' ? '正整数' : '非零带符号整数'}数量、非负两位单价或有明确参考价的 0～10 折；普通零价须确认。`); }
    }
    let discount = 0n, settled = 0n;
    try { discount = amount(draft.orderDiscount); if (draft.businessType !== 'SALE') { if (discount !== 0n) throw Error(); } else if (gross.length === draft.lines.length) allocateSalesDiscount(gross.map(value => minorAmount(value.toString())), minorAmount(discount.toString())); }
    catch { errors.push(draft.businessType === 'SALE' ? '整单优惠须为非负两位金额，且不超过商品金额。' : '独立退货／换货整单优惠必须为零。'); }
    for (const row of draft.settlements) {
      try {
        if (!['RECEIVE', 'REFUND'].includes(row.direction) || row.account.paymentMethodId !== row.method.id) throw Error();
        settled += (row.direction === 'RECEIVE' ? 1n : -1n) * amount(row.amount);
      } catch { errors.push(`${row.key}：收退金额或方式／账户不匹配。`); }
    }
    const total = gross.reduce((sum, value) => sum + value, 0n), net = total - discount;
    this.#publish({ errors, totals: errors.length ? null : { grossMinor: total.toString(), netDueMinor: net.toString(), settledMinor: settled.toString(), balanced: net === settled },
      notice: errors.length ? '草稿未通过校验，未发送业务命令。' : '本地草稿校验通过；尚未保存。最低价、条码及九价完整性须经原生准备和保存服务再次校验，收退配平不代表可审核。' });
    return errors.length ? null : draft;
  }
  reset(discardConfirmed = false): boolean {
    if (this.#state.disposed || this.#state.dirty && !discardConfirmed) return false;
    this.#cancelRead(); this.#publish({ draft: empty(), dirty: false, picker: null, errors: [], notice: null, totals: null }); return true;
  }
  cancel(discardConfirmed = false): boolean { if (!this.reset(discardConfirmed)) return false; this.dispose(); return true; }
  readonly dispose = (): void => { if (this.#state.disposed) return; this.#cancelRead(); this.#scope.signal.removeEventListener('abort', this.dispose); this.#publish({ draft: empty(), dirty: false, disposed: true, picker: null, errors: [], notice: null, totals: null }); this.#listeners.clear(); };
}
