import { BoundedReadPool,readCompleteSkuPages } from '../loading/bounded-read-pool.ts';
import type { DictionarySizeGroup } from '../../../../packages/application/src/dictionary-read-ports.ts';
import type { SalesDraftDto } from '../sales/commands/contracts.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentSalesReferenceItem, CurrentSalesReferenceQuery } from '../../../../packages/application/src/current-form-ports.ts';
import { businessDate, entityId, minorAmount, quantity } from '../../../../packages/domain/src/values.ts';
import { allocateSalesDiscount, discountUnitPrice } from '../../../../packages/domain/src/sales-money.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';
import { currentBusinessDate } from './business-date.ts';
import { DocumentScanController } from '../components/document-scan-controller.ts';
import { salesBusinessMode, salesBusinessType, type SalesBusinessMode } from './sales-business-mode.ts';
import { parseNativeSalesSaveProposal, type NativeSalesSaveProposal } from '../../../../packages/application/src/native-sales-preparation.ts';
export type SalesProposalReader = Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readSalesReferences' | 'readProducts' | 'readProductSkus'>
  & Partial<Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readBarcode' | 'readSizeGroups'>>;
export type SalesProposalPicker = CurrentSalesReferenceQuery['kind'] | 'product' | 'sku';
interface SalesProposalLineFields {
  readonly key: string;
  readonly product: CurrentFormProduct; readonly quantity: string; readonly dealPrice: string;
  readonly sourceSnapshot?: SalesDraftDto['lines'][number]['snapshot'];
  readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT'; readonly discount: string; readonly isGift: boolean; readonly zeroConfirmed: boolean;
}
export interface SalesProposalSpecification {
  readonly color: SalesSpecChoice; readonly fit: SalesSpecChoice; readonly size: SalesSpecChoice; readonly sizeGroup: SalesSpecChoice;
}
export type SalesProposalLine = SalesProposalLineFields & ({ readonly sku: CurrentFormSku; readonly specification?: never } | { readonly sku: null; readonly specification: SalesProposalSpecification });
export type SalesProposalPricingLine = Omit<SalesProposalLine, 'sku' | 'specification' | 'sourceSnapshot'>;
export interface SalesSpecChoice { readonly id: string; readonly name: string }
export function salesProposalLineSelection(line: SalesProposalLine) {
  return line.sku ? { color: { id: line.sku.colorId, name: line.sku.colorName }, fit: { id: line.sku.fitId, name: line.sku.fitName }, size: { id: line.sku.sizeId, name: line.sku.sizeName }, sizeGroup: null } : line.specification;
}
export interface SalesProposalEntry {
  readonly key: string; readonly order: number | null; readonly pricingRule: SalesProposalLine['pricingRule']; readonly discount: string; readonly isGift: boolean; readonly zeroConfirmed: boolean;
  readonly product: CurrentFormProduct | null; readonly sku: CurrentFormSku | null;
  readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly size: SalesSpecChoice | null; readonly sizeGroup: SalesSpecChoice | null; readonly skuPage: number;
  readonly query: string; readonly quantity: string; readonly dealPrice: string;
}
const emptyEntry = (direction: 'IN' | 'OUT', key: string): SalesProposalEntry => ({ key, order: null, product: null, sku: null, color: null, fit: null, size: null, sizeGroup: null, skuPage: 1, query: '', quantity: direction === 'IN' ? '-1' : '1', dealPrice: '', pricingRule: 'UNIT_PRICE', discount: '', isGift: false, zeroConfirmed: false });
const emptyEntries = () => ({ IN: [emptyEntry('IN', 'entry-IN-0')], OUT: [emptyEntry('OUT', 'entry-OUT-0')] });
export interface SalesProposal {
  readonly responsible?: { readonly id: string; readonly name: string };
  readonly businessType: 'SALE' | 'RETURN' | 'EXCHANGE'; readonly businessDate: string; readonly note: string; readonly orderDiscount: string;
  readonly hall: CurrentSalesReferenceItem | null; readonly customer: CurrentSalesReferenceItem | null;
  readonly salesperson: CurrentSalesReferenceItem | null; readonly warehouse: CurrentSalesReferenceItem | null;
  readonly lines: readonly SalesProposalLine[];
  readonly settlements: readonly { readonly key: string; readonly method: CurrentSalesReferenceItem | null; readonly account: CurrentSalesReferenceItem | null; readonly direction: 'RECEIVE' | 'REFUND'; readonly amount: string }[];
}
type Candidate = CurrentSalesReferenceItem | CurrentFormProduct | CurrentFormSku;
export interface SalesProposalSnapshot {
  readonly draft: SalesProposal; readonly dirty: boolean; readonly disposed: boolean; readonly errors: readonly string[]; readonly notice: string | null;
  readonly totals: { readonly grossMinor: string; readonly netDueMinor: string; readonly settledMinor: string; readonly balanced: boolean } | null;
  readonly entries: Readonly<Record<'IN' | 'OUT', readonly SalesProposalEntry[]>>;
  /** A pending identity change never mutates the original draft line. */
  readonly lineEdit: Pick<SalesProposalLine, 'quantity' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift' | 'zeroConfirmed'> & { readonly key: string; readonly original: SalesProposalLine; readonly product: CurrentFormProduct; readonly sku: CurrentFormSku | null; readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly size: SalesSpecChoice | null; readonly sizeGroup: SalesSpecChoice | null; readonly skuPage: number } | null;
  readonly sizeGroups: { readonly phase: 'unavailable' | 'ready'; readonly groups: readonly DictionarySizeGroup[] };
  readonly picker: { readonly kind: SalesProposalPicker; readonly search: string; readonly page: number;
    readonly product: CurrentFormProduct | null; readonly method: CurrentSalesReferenceItem | null;
    readonly phase: 'loading' | 'ready' | 'error'; readonly result: CurrentFormPage<Candidate> | null; readonly specSkus?: readonly CurrentFormSku[] } | null;
}
const empty = (): SalesProposal => ({ businessType: 'SALE', businessDate: currentBusinessDate(), note: '', orderDiscount: '0.00', hall: null, customer: null, salesperson: null, warehouse: null, lines: [], settlements: [] });
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function amount(raw: string): bigint {
  const value = raw.trim(); if (value.length > 102 || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw Error();
  const [whole, fraction = ''] = value.split('.'); const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result.toString().length > 100) throw Error(); return result;
}
/** Unfocused order-discount presentation only. Its minus is never raw money or SAVE input.
 * Never coerce unfinished, signed or invalid input into zero or a valid amount. */
export function salesProposalMoneyInputDisplay(raw:string):string {
 try {const value=amount(raw);return `${value===0n?'':'-'}${value/100n}.${(value%100n).toString().padStart(2,'0')}`;}catch{return raw;}
}
/** Display projection only. Missing/invalid input stays unknown, never a saved
 * zero, price authority or an approval decision. Uses the same integer money rules. */
export function salesProposalMoney(draft: Omit<SalesProposal, 'lines'> & { readonly lines: readonly SalesProposalPricingLine[] }): { readonly grossMinor: string; readonly netDueMinor: string; readonly orderDiscountMinor: string;
  readonly settledMinor: string | null; readonly differenceMinor: string | null; readonly balanced: boolean } | null {
  try {
    const amounts = draft.lines.map(row => {
      if (!/^-?[1-9]\d{0,18}$/.test(row.quantity) || draft.businessType === 'SALE' && row.quantity.startsWith('-')) throw Error();
      let price = 0n;
      if (!row.isGift) {
        if (row.pricingRule === 'UNIT_PRICE') price = amount(row.dealPrice);
        else {
          if (row.product.retailPrice === null || !/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim())) throw Error();
          const [whole, fraction = '0'] = row.discount.trim().split('.');
          price = discountUnitPrice(minorAmount(amount(row.product.retailPrice).toString()), Number(whole) * 10 + Number(fraction));
        }
      }
      return BigInt(row.quantity) * price;
    });
    const discount = amount(draft.orderDiscount);
    if (draft.businessType === 'SALE') allocateSalesDiscount(amounts.map(value => minorAmount(value.toString())), minorAmount(discount.toString()));
    else if (discount !== 0n) throw Error();
    const gross = amounts.reduce((sum, value) => sum + value, 0n), net = gross - discount;
    let settled: bigint | null;
    try { settled = draft.settlements.reduce((sum, row) => {
      // A wholly unused UI row is not a payment or an assumed zero.
      if (!row.method && !row.account && row.amount.trim() === '' && row.direction === 'RECEIVE') return sum;
      if (!row.method || !row.account || row.account.paymentMethodId !== row.method.id || row.direction !== 'RECEIVE' && row.direction !== 'REFUND') throw Error();
      return sum + (row.direction === 'RECEIVE' ? 1n : -1n) * amount(row.amount);
    }, 0n); } catch { settled = null; }
    return { grossMinor: gross.toString(), netDueMinor: net.toString(), orderDiscountMinor: discount.toString(), settledMinor: settled?.toString() ?? null,
      differenceMinor: settled === null ? null : (net - settled).toString(), balanced: settled !== null && net === settled };
  } catch { return null; }
}
/** Visible linked fields only; the original pricingRule remains the SAVE authority.
 * Keep raw unit-price/discount input, including incomplete text, untouched. */
export function salesProposalPriceDisplay(row:SalesProposalPricingLine):{dealPrice:string;discount:string}{
 if(row.isGift)return {dealPrice:'0.00',discount:'0'};
 const yuan=(v:bigint)=>`${v/100n}.${String(v%100n).padStart(2,'0')}`;
 if(row.pricingRule==='DISCOUNT'){
  try{
   if(row.product.retailPrice===null||!/^\d{1,2}(?:\.\d)?$/.test(row.discount.trim()))throw Error();
   const [whole,fraction='0']=row.discount.trim().split('.'),tenths=Number(whole)*10+Number(fraction);
   return {dealPrice:yuan(discountUnitPrice(minorAmount(amount(row.product.retailPrice).toString()),tenths)),discount:row.discount};
  }catch{return {dealPrice:'',discount:row.discount};}
 }
 let discount='';
 try{const reference=row.product.retailPrice===null?0n:amount(row.product.retailPrice);if(reference>0n){const tenths=(amount(row.dealPrice)*100n+reference/2n)/reference;discount=tenths%10n===0n?String(tenths/10n):`${tenths/10n}.${tenths%10n}`;}}catch{/* Unknown input stays blank. */}
 return {dealPrice:row.dealPrice,discount};
}
/** Confirmation affordance only; minimum-price and SAVE authority stay unchanged. */
export function salesProposalNeedsZeroConfirmation(row:SalesProposalPricingLine):boolean {
 if(row.isGift||row.zeroConfirmed)return false;
 try{return amount(salesProposalPriceDisplay(row).dealPrice)===0n;}catch{return false;}
}
/** Local sales/independent return/exchange proposals. Never creates native numbers/IDs, barcode facts,
 * minimum-price authority, approval eligibility, inventory effects or commands. */
export class SalesProposalSession {
  readonly #skuPool=new BoundedReadPool();
  readonly #scope: ReadScope; readonly #reader: SalesProposalReader; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined; readonly #listeners = new Set<() => void>();
  #seeded = false;
  #salespersonDefaultClosed = false;
  readonly #specSkus = new Map<string, readonly CurrentFormSku[]>();
  readonly #dictionaryGroups = new Map<string, DictionarySizeGroup>();
  #savedWarehouse: { readonly hallId: string; readonly warehouseId: string } | null = null;
  readonly #savedLines = new Map<string, { readonly skuId: string; readonly snapshot: SalesDraftDto['lines'][number]['snapshot']; readonly product: CurrentFormProduct }>();
  #request: AbortController | null = null; #sequence = 0; #nextSettlement = 0; #nextLine = 0; #settlementTarget: string | null = null; #revision = 0; #entryTarget: { readonly direction: 'IN' | 'OUT'; readonly key: string } | null = null; #nextEntry = 0; #nextEntryOrder = 0; #inlineSettlement = false;
  #state: SalesProposalSnapshot = freeze({ draft: empty(), dirty: false, disposed: false, errors: [], notice: null, totals: null, sizeGroups: { phase: 'unavailable', groups: [] }, picker: null, lineEdit: null, entries: emptyEntries() });
  constructor(scope: ReadScope, reader: SalesProposalReader, onAccessFailure?: (error: HttpQueryError) => void) { this.#scope = scope; this.#reader = reader; this.#onAccessFailure = onAccessFailure; scope.signal.addEventListener('abort', this.dispose, { once: true }); if (!scope.active) this.dispose(); }
  readonly getSnapshot = (): SalesProposalSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  matchesIdentity(scope: ReadScope): boolean {
    const owner = this.#scope.identity, target = scope.identity;
    return !this.#state.disposed && this.#scope.active && scope.active && owner.accountId === target.accountId && owner.sessionRevision === target.sessionRevision && owner.permissionRevision === target.permissionRevision;
  }
  /** A current-reference candidate matched to the trusted session employee by the
   * caller. No name/role/hall inference; the server still rechecks employment. */
  applyDefaultSalesperson(candidate: CurrentSalesReferenceItem, trustedStaffId: string, expectedDraft: SalesProposal): boolean {
    if (this.#state.disposed || !this.#scope.active || this.#seeded || this.#salespersonDefaultClosed
      || this.#state.draft !== expectedDraft || this.#state.draft.salesperson !== null) return false;
    try {
      if (entityId('staff', trustedStaffId) !== candidate.id || entityId('staff', candidate.id) !== candidate.id
        || typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.code !== null
        || candidate.paymentMethodId !== null || candidate.paymentMethodName !== null
        || (candidate.hallId === null ? candidate.hallName !== null : entityId('hall', candidate.hallId) !== candidate.hallId || typeof candidate.hallName !== 'string')) return false;
    } catch { return false; }
    this.#salespersonDefaultClosed = true;
    this.#revision++;
    this.#publish({ draft: { ...this.#state.draft, salesperson: structuredClone(candidate) }, errors: [], notice: null, totals: null });
    return true;
  }
  /** Cold session initialization from a validated native saved document plus
   * actual current SKU reads. Local presentation only; never a native draft,
   * permission, ID allocation or preparation proof. Raw invalid input survives. */
  initializeFromSaved(value: SalesProposal, dirty = false): boolean {
    if (this.#seeded || this.#state.disposed || this.#state.dirty || this.#state.draft.lines.length || this.#state.picker) return false;
    let draft: SalesProposal;
    try {
      draft = structuredClone(value);
      if (!['SALE', 'RETURN', 'EXCHANGE'].includes(draft.businessType) || !Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > 200 || new Set(draft.lines.map(line => line.key)).size !== draft.lines.length || !Array.isArray(draft.settlements) || draft.settlements.length > 3 || new Set(draft.settlements.map(row => row.key)).size !== draft.settlements.length) return false;
      if (typeof draft.businessDate !== 'string' || typeof draft.note !== 'string' || typeof draft.orderDiscount !== 'string' || draft.lines.some(line => !line.key || !line.sku || line.sku.productId !== line.product.id || typeof line.quantity !== 'string' || typeof line.dealPrice !== 'string')) return false;
    } catch { return false; }
    for (const line of draft.lines) if (line.sku && line.sourceSnapshot) this.#savedLines.set(line.key, Object.freeze({ skuId: line.sku.id, snapshot: line.sourceSnapshot, product: line.product }));
    this.#seeded = true; this.#savedWarehouse = draft.hall && draft.warehouse ? { hallId: draft.hall.id, warehouseId: draft.warehouse.id } : null; this.#revision++;
    this.#publish({ draft, dirty, entries: emptyEntries(), lineEdit: null, errors: [], notice: null, totals: null }); return true;
  }
  markUnchanged(reference: SalesProposal): boolean {
    if (!this.#seeded || this.#state.disposed || this.#state.draft !== reference || this.#state.lineEdit || Object.values(this.#state.entries).flat().some(entry => entry.product || entry.query.trim())) return false;
    this.#publish({ dirty: false, notice: null }); return true;
  }
  #publish(patch: Partial<SalesProposalSnapshot>): void { this.#state = freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* continue invalidation */ } } }
  #cancelRead(): void { this.#sequence++; this.#request?.abort(); this.#request = null; }
  #edit(draft: SalesProposal): boolean {
    if (this.#state.disposed) return false;
    this.#revision++;
    const businessType = salesBusinessType(salesBusinessMode(draft.businessType), draft.lines.map(row => row.quantity));
    this.#publish({ draft: { ...draft, businessType }, dirty: true, errors: [], notice: null, totals: null }); return true;
  }
  setHeader(patch: Pick<Partial<SalesProposal>, 'businessDate' | 'note' | 'orderDiscount'>): boolean { return this.#edit({ ...this.#state.draft, ...patch }); }
  selectResponsibleStaff(value: { readonly id: string; readonly name: string }): boolean {
    try { entityId('staff', value.id); if (typeof value.name !== 'string') return false; } catch { return false; }
    return this.#edit({ ...this.#state.draft, responsible: { id: value.id, name: value.name } });
  }
  setBusinessType(businessType: SalesProposal['businessType']): boolean {
    if (!['SALE', 'RETURN', 'EXCHANGE'].includes(businessType)) return false;
    // SALE has no incoming-entry section. Keep its unfinished input visible in
    // the combined mode until the user completes or explicitly clears it.
    const incoming = this.#state.entries.IN;
    if (businessType === 'SALE' && incoming.some(entry => entry.product || entry.query.trim())) {
      this.#publish({ notice: '退回商品还有未完成录入，请先在“录入退回商品”中完成或清除，再切换销售。' });
      return false;
    }
    // Preserve explicit row signs and prices; never silently reverse stock intent.
    return this.#edit({ ...this.#state.draft, businessType, orderDiscount: '0.00' });
  }
  setBusinessMode(mode: SalesBusinessMode): boolean {
    if (this.#state.disposed || this.#state.lineEdit || mode !== 'SALE' && mode !== 'RETURN_EXCHANGE') return false;
    if (mode === salesBusinessMode(this.#state.draft.businessType)) return true;
    // Frozen sales-current.js changeType applies only after the page confirms:
    // default row directions, no order adjustment/funds, and fresh blank rows.
    // Frozen chooseEntry already puts selected, unfinished work in doc.lines;
    // this session keeps that same work in entries until specs are complete.
    // Keep exact native quantities and identities rather than copying Number().
    const defaultQuantity = (raw: string) => {
      if (!/^[+-]?\d{1,19}$/.test(raw)) return raw;
      const value = BigInt(raw), magnitude = value < 0n ? -value : value;
      return (mode === 'RETURN_EXCHANGE' ? -magnitude : magnitude).toString();
    };
    const lines = this.#state.draft.lines.map(row => ({ ...row, quantity: defaultQuantity(row.quantity) }));
    const selected = Object.values(this.#state.entries).flat().filter(entry => !!entry.product)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(entry => ({ ...entry, quantity: defaultQuantity(entry.quantity) }));
    const entries = emptyEntries();
    if (selected.length) {
      const direction = mode === 'SALE' ? 'OUT' : 'IN';
      for (const key of ['IN', 'OUT'] as const) entries[key] = [emptyEntry(key, `entry-${key}-${++this.#nextEntry}`)];
      entries[direction] = [...selected, ...entries[direction]];
    }
    this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#revision++;
    this.#publish({ draft: { ...this.#state.draft, businessType: salesBusinessType(mode, lines.map(row => row.quantity)), lines, orderDiscount: '0.00', settlements: [] },
      entries, picker: null, dirty: true, errors: [], notice: null, totals: null });
    return true;
  }
  #lineKey(keyOrUniqueSku: string): string | null {
    const rows = this.#state.draft.lines;
    if (rows.some(row => row.key === keyOrUniqueSku)) return keyOrUniqueSku;
    const matches = rows.filter(row => row.sku?.id === keyOrUniqueSku);
    return matches.length === 1 ? matches[0]!.key : null;
  }
  updateLine(keyOrUniqueSku: string, patch: Partial<Pick<SalesProposalLine, 'quantity' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift' | 'zeroConfirmed'>>): boolean {
    const key = this.#lineKey(keyOrUniqueSku); if (!key) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.map(row => row.key === key ? { ...row, ...patch } : row) });
  }
  removeLine(keyOrUniqueSku: string): boolean {
    const key = this.#lineKey(keyOrUniqueSku); if (!key) return false;
    if (this.#state.lineEdit?.key === key) this.cancelLineEdit();
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => row.key !== key) });
  }
  beginLineEdit(key: string): boolean {
    const original = this.#state.draft.lines.find(row => row.key === key);
    if (this.#state.disposed || !original || !this.#state.draft.hall) return false;
    if (this.#state.lineEdit && this.#state.lineEdit.key !== key) { this.#publish({ notice: '请先确认或取消当前行的改选。' }); return false; }
    if (!this.#state.lineEdit) {
      this.closePicker(); this.#settlementTarget = null; this.#entryTarget = null;
      this.#publish({ lineEdit: { key, original, quantity: original.quantity, dealPrice: original.dealPrice, pricingRule: original.pricingRule, discount: original.discount, isGift: original.isGift, zeroConfirmed: original.zeroConfirmed, product: original.product, sku: original.sku, ...salesProposalLineSelection(original), skuPage: 1 } });
    }
    return true;
  }
  async openLinePicker(key: string, kind: 'product' | 'sku' = 'sku'): Promise<void> {
    if (!this.beginLineEdit(key)) return;
    await this.#read(kind, '', kind === 'sku' ? this.#state.lineEdit!.skuPage : 1, kind === 'sku' ? this.#state.lineEdit!.product : null, null);
  }
  confirmLineEdit(): boolean {
    const edit = this.#state.lineEdit, draft = this.#state.draft;
    if (this.#state.disposed || this.#state.picker || !edit) return false;
    const identity = this.#localLineIdentity(edit);
    if (!identity) { this.#publish({ notice: '请选择商品实际组内的完整规格；改选及原单输入均已保留。' }); return false; }
    if (draft.lines.find(row => row.key === edit.key) !== edit.original) { this.#publish({ notice: '原行已变化，请取消改选后重新选择。' }); return false; }
    const changed = this.#edit({ ...draft, lines: draft.lines.map(row => {
      if (row.key !== edit.key) return row;
      const { sourceSnapshot, sku: _oldSku, specification: _oldSpecification, ...retained } = row, original = this.#savedLines.get(row.key), restored = !!identity.sku && original?.skuId === identity.sku.id;
      const { category: _currentCategory, ...currentProduct } = edit.product;
      // A stored reference belongs to the original SKU. A size-only change has
      // no current price read; do not relabel the old reference as a new fact.
      const product = restored ? { ...currentProduct, retailPrice: original.product.retailPrice, ...(original.product.category ? { category: original.product.category } : {}) }
        : sourceSnapshot && edit.product === row.product ? { ...edit.product, retailPrice: null } : edit.product;
      return { ...retained, quantity: edit.quantity, dealPrice: edit.dealPrice, pricingRule: edit.pricingRule, discount: edit.discount, isGift: edit.isGift, zeroConfirmed: edit.zeroConfirmed, ...(restored ? { sourceSnapshot: original!.snapshot } : {}), product, ...identity };
    }) });
    if (changed) this.#publish({ lineEdit: null, ...(this.#state.draft.lines.find(row => row.key === edit.key)?.product.retailPrice === null ? { notice: '新规格参考价尚未读到。可重新选择商品核对参考价，或明确填写成交单价；未确认价格不会保存。' } : {}) });
    return changed;
  }
  updateLineEdit(patch: Partial<Pick<SalesProposalLine, 'quantity' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift' | 'zeroConfirmed'>>): boolean {
    const edit = this.#state.lineEdit; if (!edit || this.#state.disposed) return false;
    this.#publish({ lineEdit: { ...edit, ...patch }, errors: [], notice: null }); return true;
  }
  cancelLineEdit(): void { this.closePicker(); if (!this.#state.disposed) this.#publish({ lineEdit: null }); }
  #entry(direction: 'IN' | 'OUT', key?: string): SalesProposalEntry | undefined {
    const rows = this.#state.entries[direction]; return key === undefined ? rows.at(-1) : rows.find(row => row.key === key);
  }
  #replaceEntry(direction: 'IN' | 'OUT', entry: SalesProposalEntry): void {
    const filled = !!entry.product || !!entry.query.trim();
    entry = { ...entry, order: filled ? entry.order ?? ++this.#nextEntryOrder : null };
    const nextDirection = this.#state.draft.businessType !== 'SALE' && /^-?[1-9]\d{0,18}$/.test(entry.quantity) ? entry.quantity.startsWith('-') ? 'IN' : 'OUT' : direction;
    const entries = { ...this.#state.entries };
    entries[direction] = nextDirection === direction ? entries[direction].map(row => row.key === entry.key ? entry : row) : entries[direction].filter(row => row.key !== entry.key);
    if (nextDirection !== direction) {
      entries[nextDirection] = [entry, ...entries[nextDirection]];
      if (this.#entryTarget?.key === entry.key) this.#entryTarget = { direction: nextDirection, key: entry.key };
    }
    // Frozen entries()/chooseEntry: selected pending rows stay in place, with
    // one further blank row. All input still belongs to this same session.
    for (const key of ['IN', 'OUT'] as const) {
      const blank = key === nextDirection && !filled ? entry : entries[key].find(row => !row.product && !row.query.trim());
      entries[key] = entries[key].filter(row => row.product || row.query.trim() || row === blank);
      if (!blank) entries[key] = [...entries[key], emptyEntry(key, `entry-${key}-${++this.#nextEntry}`)];
    }
    this.#revision++; this.#publish({ entries, dirty: true, errors: [], notice: null });
  }
  updateEntry(direction: 'IN' | 'OUT', patch: Partial<Pick<SalesProposalEntry, 'query' | 'quantity' | 'dealPrice' | 'pricingRule' | 'discount' | 'isGift' | 'zeroConfirmed'>>, key?: string): void {
    const entry = this.#entry(direction, key); if (this.#state.disposed || !entry) return;
    this.#replaceEntry(direction, { ...entry, ...patch, ...(patch.query !== undefined && patch.query !== entry.product?.code ? { product: null, sku: null, color: null, fit: null, size: null, sizeGroup: null, skuPage: 1 } : {}) });
  }
  clearEntry(direction: 'IN' | 'OUT', key?: string): void {
    const entry = this.#entry(direction, key); if (this.#state.disposed || !entry) return;
    this.closePicker(); const rows = this.#state.entries[direction].filter(row => row !== entry);
    if (!rows.some(row => !row.product && !row.query.trim())) rows.push(emptyEntry(direction, `entry-${direction}-${++this.#nextEntry}`));
    this.#revision++; this.#publish({ entries: { ...this.#state.entries, [direction]: rows }, dirty: true, errors: [], notice: null });
  }
  async openEntryPicker(direction: 'IN' | 'OUT', kind: 'product' | 'sku', key?: string): Promise<void> {
    const entry = this.#entry(direction, key);
    if (this.#state.disposed || !entry || !this.#state.draft.hall || this.#state.lineEdit || direction === 'IN' && this.#state.draft.businessType === 'SALE' || kind === 'sku' && !entry.product) return;
    this.#entryTarget = { direction, key: entry.key }; this.#settlementTarget = null; this.#inlineSettlement = false;
    await this.#read(kind, kind === 'product' ? entry.query : '', kind === 'sku' ? entry.skuPage : 1, kind === 'sku' ? entry.product : null, null);
  }
  /** Size membership comes from the complete native dictionary. A selected
   * coordinate is local input until a real SKU matches product/color/fit/size. */
  selectSpec(kind: 'color' | 'fit' | 'size', id: string): boolean {
    const picker = this.#state.picker, target = this.#entryTarget, edit = this.#state.lineEdit;
    const selection = edit ?? (target ? this.#entry(target.direction, target.key) : null);
    if (this.#state.disposed || picker?.kind !== 'sku' || picker.phase !== 'ready' || !selection?.product || picker.product?.id !== selection.product.id) return false;
    const rows = picker.specSkus ?? picker.result!.items as readonly CurrentFormSku[];
    let patch: Partial<Pick<SalesProposalEntry, 'color' | 'fit' | 'size' | 'sizeGroup' | 'sku'>>;
    if (kind === 'size') {
      const legacy = rows.find(row => row.id === id || row.sizeId === id);
      const sizeId = legacy?.sizeId ?? id;
      const group = this.#state.sizeGroups.groups.find(group => group.sizes.some(size => size.id === sizeId));
      const size = group?.sizes.find(size => size.id === sizeId);
      // A current product group is a hard boundary, not a default display group.
      // Legacy synthetic readers may lack the dictionary method; they can bind
      // only an exact returned native SKU, never another dictionary coordinate.
      const chosen = size ?? (!this.#reader.readSizeGroups && legacy ? { id: legacy.sizeId, name: legacy.sizeName } : null);
      if (!chosen || !selection.color || !selection.fit) return false;
      const sku = rows.find(row => row.productId === selection.product!.id && row.colorId === selection.color!.id && row.fitId === selection.fit!.id && row.sizeId === chosen.id) ?? null;
      patch = { size: { id: chosen.id, name: chosen.name }, sizeGroup: group ? { id: group.id, name: group.name } : null, sku };
    } else {
      const row = rows.find(row => kind === 'color' ? row.colorId === id : row.colorId === selection.color?.id && row.fitId === id);
      if (!row) return false;
      patch = kind === 'color' ? { color: { id: row.colorId, name: row.colorName }, fit: null, size: null, sizeGroup: null, sku: null }
        : { fit: { id: row.fitId, name: row.fitName }, size: null, sizeGroup: null, sku: null };
    }
    if (edit) this.#publish({ lineEdit: { ...edit, ...patch, skuPage: picker.page } });
    else if (target) { const entry = this.#entry(target.direction, target.key); if (entry) this.#replaceEntry(target.direction, { ...entry, ...patch, skuPage: picker.page }); }
    this.closePicker(); return true;
  }
  #localLineIdentity(row: { readonly product: CurrentFormProduct; readonly sku: CurrentFormSku | null; readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly size: SalesSpecChoice | null; readonly sizeGroup: SalesSpecChoice | null }): Pick<Extract<SalesProposalLine, { sku: CurrentFormSku }>, 'sku'> | Pick<Extract<SalesProposalLine, { sku: null }>, 'sku' | 'specification'> | null {
    if (row.sku) return row.sku.productId === row.product.id && (!row.color || row.sku.colorId === row.color.id) && (!row.fit || row.sku.fitId === row.fit.id) && (!row.size || row.sku.sizeId === row.size.id) ? { sku: row.sku } : null;
    if (!row.color || !row.fit || !row.size || !row.product.sizeGroupId || row.sizeGroup?.id !== row.product.sizeGroupId || !this.#dictionaryGroups.get(row.product.sizeGroupId)?.sizes.some(size => size.id === row.size!.id)) return null;
    return { sku: null, specification: { color: row.color, fit: row.fit, size: row.size, sizeGroup: row.sizeGroup } };
  }
  get canConfirmLineEdit(): boolean { const edit = this.#state.lineEdit; return !!edit && !this.#state.picker && !!this.#localLineIdentity(edit) && this.#state.draft.lines.find(row => row.key === edit.key) === edit.original; }
  canAppendEntry(direction: 'IN' | 'OUT', key?: string): boolean { const entry = this.#entry(direction, key); return !!entry?.product && entry.query === entry.product.code && !!this.#localLineIdentity({ ...entry, product: entry.product }); }
  appendEntry(direction: 'IN' | 'OUT', key?: string): boolean {
    const entry = this.#entry(direction, key), draft = this.#state.draft;
    const identity = entry?.product ? this.#localLineIdentity({ ...entry, product: entry.product }) : null;
    if (this.#state.disposed || this.#state.lineEdit || !entry?.product || entry.query !== entry.product.code || !identity) {
      this.#publish({ notice: entry?.size && !entry.sku ? `所选 ${entry.product?.code ?? ''} / ${entry.color?.name ?? ''} / ${entry.fit?.name ?? ''} / ${entry.size.name} 尚无真实 SKU；数量、价格及尺码输入已保留。` : '请选择款号、颜色、版型及尺码后完成录入。' }); return false;
    }
    if (draft.lines.length >= 200 || !/^-?[1-9]\d{0,18}$/.test(entry.quantity) || entry.quantity.startsWith('-') !== (direction === 'IN') || direction === 'IN' && draft.businessType === 'SALE') {
      this.#publish({ notice: '请核对当前分区的数量方向及 200 行上限；输入已保留。' }); return false;
    }
    try { quantity(entry.quantity); } catch { this.#publish({ notice: '数量超出可用范围，输入已保留。' }); return false; }
    this.closePicker();
    const ok = this.#edit({ ...draft, lines: [...draft.lines, { key: `local-line-${++this.#nextLine}`, ...identity, product: entry.product, quantity: entry.quantity, dealPrice: entry.dealPrice, pricingRule: entry.pricingRule, discount: entry.discount, isGift: entry.isGift, zeroConfirmed: entry.zeroConfirmed }] });
    if (ok) this.clearEntry(direction, entry.key);
    return ok;
  }
  flushEntries(): boolean {
    for (const direction of ['IN', 'OUT'] as const) for (const entry of this.#state.entries[direction]) {
      if ((entry.product || entry.query.trim()) && !this.appendEntry(direction, entry.key)) return false;
    }
    return true;
  }
  addSettlement(): boolean {
    const draft = this.#state.draft;
    if (this.#state.disposed) return false;
    if (!draft.hall || draft.settlements.length >= 3) { this.#publish({ notice: !draft.hall ? '请先选择营业厅，再添加收退款。' : '最多添加3笔收退款，原输入已保留。' }); return false; }
    try { for (const row of draft.settlements) amount(row.amount); }
    catch { this.#publish({ notice: '请先为已有收退款行填写有效金额，再添加下一笔；原输入已保留。' }); return false; }
    return this.#edit({ ...draft, settlements: [...draft.settlements, { key: `local-settlement-${++this.#nextSettlement}`, method: null, account: null, direction: 'RECEIVE', amount: '' }] });
  }
  async openPaymentPicker(key: string | null, kind: 'paymentMethod' | 'paymentAccount'): Promise<void> {
    const row = this.#state.draft.settlements.find(row => row.key === key);
    if (this.#state.disposed || !this.#state.draft.hall || this.#state.lineEdit || key !== null && !row || kind === 'paymentAccount' && !row?.method) return;
    this.#entryTarget = null; this.#settlementTarget = key; this.#inlineSettlement = true;
    await this.#read(kind, '', 1, null, kind === 'paymentAccount' ? row!.method : null);
  }
  updateSignedSettlement(key: string | null, raw: string): boolean {
    if (key === null) { if (!this.addSettlement()) return false; key = this.#state.draft.settlements.at(-1)!.key; }
    return this.updateSettlement(key, { direction: raw.startsWith('-') ? 'REFUND' : 'RECEIVE', amount: raw.startsWith('-') ? raw.slice(1) : raw });
  }
  updateSettlement(key: string, patch: { readonly amount?: string; readonly direction?: 'RECEIVE' | 'REFUND' }): boolean {
    if (!this.#state.draft.settlements.some(row => row.key === key)) return false;
    return this.#edit({ ...this.#state.draft, settlements: this.#state.draft.settlements.map(row => row.key === key ? { ...row, ...patch } : row) });
  }
  removeSettlement(key: string): boolean { return this.#edit({ ...this.#state.draft, settlements: this.#state.draft.settlements.filter(row => row.key !== key) }); }
  clearReference(kind: 'hall' | 'salesperson' | 'customer' | 'warehouse' | 'paymentMethod' | 'paymentAccount', paymentKey?: string): boolean {
    if (this.#state.disposed) return false;
    this.closePicker();
    const draft = this.#state.draft;
    if (kind === 'salesperson') this.#salespersonDefaultClosed = true;
    if (kind === 'paymentMethod' || kind === 'paymentAccount') return this.#edit({ ...draft, settlements: draft.settlements.map(row => row.key === paymentKey ? { ...row, account: null, ...(kind === 'paymentMethod' ? { method: null } : {}) } : row) });
    if (kind === 'hall') return this.#edit({ ...draft, hall: null, salesperson: null, customer: null, warehouse: null, settlements: draft.settlements.map(row => ({ ...row, method: null, account: null })) });
    return this.#edit({ ...draft, [kind]: null });
  }
  clearSalesperson(): boolean { return this.clearReference('salesperson'); }
  get canScan(): boolean { return !this.#state.disposed && !!this.#reader.readBarcode && !!this.#state.draft.hall && !!this.#state.draft.warehouse; }
  createScanner(direction: 'IN' | 'OUT'): DocumentScanController {
    return new DocumentScanController({ timeoutMs: 3_000, scope: this.#scope, ...(this.#onAccessFailure ? { onAccessFailure: this.#onAccessFailure } : {}),
      target: () => {
        const { hall, warehouse, businessType } = this.#state.draft;
        return this.canScan && !this.#state.lineEdit && hall && warehouse && !(direction === 'IN' && businessType === 'SALE')
          ? { key: `${this.#revision}:${direction}`, context: { kind: 'SALES', hallId: entityId('hall', hall.id), warehouseId: entityId('warehouse', warehouse.id) } } : null;
      },
      resolve: (query, signal) => this.#reader.readBarcode!(query, signal),
      apply: result => {
        const draft = this.#state.draft, matches = draft.lines.filter(row => row.sku?.id === result.sku.id && row.quantity.startsWith('-') === (direction === 'IN'));
        if (matches.length > 1) return { ok: false, message: '同规格有多条明细，请在原行明确修改数量；未选择或合并价格行。' };
        const existing = matches[0];
        if (!existing && draft.lines.length >= 200) return { ok: false, message: '本草稿最多 200 行，未新增明细。' };
        try {
          if (existing && !/^-?[1-9]\d{0,18}$/.test(existing.quantity)) throw Error();
          const next = existing ? (quantity(existing.quantity) + (direction === 'IN' ? -1n : 1n)).toString() : direction === 'IN' ? '-1' : '1'; quantity(next);
          // Exact lookup supplies identity/names only. No retail/transaction price
          // is inferred; the new row waits for an explicit price and native prepare.
          const product: CurrentFormProduct = { id: result.sku.productId, code: result.sku.productCode, name: result.sku.productName, retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
          const ok = this.#edit({ ...draft, lines: existing ? draft.lines.map(row => row === existing ? { ...row, quantity: next } : row)
            : [...draft.lines, { key: `local-line-${++this.#nextLine}`, sku: result.sku, product, quantity: next, dealPrice: '', pricingRule: 'UNIT_PRICE', discount: '', isGift: false, zeroConfirmed: false }] });
          return { ok, message: ok ? `已录入 ${result.sku.skuCode}，数量 ${next}。${existing ? '' : '请填写成交价。'}` : '当前草稿已关闭，未录入。' };
        } catch { return { ok: false, message: '原行数量尚未有效或已达上限，请先修正原行；未覆盖输入。' }; }
      },
    });
  }
  async openPicker(kind: Exclude<SalesProposalPicker, 'sku' | 'paymentAccount'>): Promise<void> {
    if (this.#state.disposed) return;
    if (this.#state.lineEdit) { this.#publish({ notice: '请先确认或取消当前行的改选。' }); return; }
    if (kind === 'salesperson') this.#salespersonDefaultClosed = true;
    if (kind !== 'hall' && kind !== 'salesperson' && !this.#state.draft.hall) { this.#publish({ notice: '请先选择营业厅。' }); return; }
    this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false;
    await this.#read(kind, '', 1, null, null);
  }
  async openSettlementPicker(key: string): Promise<void> {
    if (this.#state.disposed || !this.#state.draft.hall || !this.#state.draft.settlements.some(row => row.key === key)) return;
    if (this.#state.lineEdit) { this.#publish({ notice: '请先确认或取消当前行的改选。' }); return; }
    this.#settlementTarget = key; this.#entryTarget = null; this.#inlineSettlement = false;
    await this.#read('paymentMethod', '', 1, null, null);
  }
  async search(search: string): Promise<void> { const p = this.#state.picker; if (p && p.kind !== 'sku') { if (p.kind === 'product' && this.#entryTarget) this.updateEntry(this.#entryTarget.direction, { query: search }, this.#entryTarget.key); await this.#read(p.kind, search, 1, p.product, p.method); } }
  async page(page: number): Promise<void> {
    const p = this.#state.picker;
    if (!p || p.phase !== 'ready' || !p.result || !Number.isSafeInteger(page) || page < 1 || BigInt(page - 1) * 20n >= p.result.exactTotal) return;
    await this.#read(p.kind, p.search, page, p.product, p.method);
  }
  async retry(): Promise<void> { const p = this.#state.picker; if (p?.phase === 'error' && p.kind === 'sku') { this.#dictionaryGroups.clear();  } if (p?.phase === 'error') await this.#read(p.kind, p.search, p.page, p.product, p.method); }
  closePicker(): void { this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; if (!this.#state.disposed) this.#publish({ picker: null }); }
  async #read(kind: SalesProposalPicker, search: string, page: number, product: CurrentFormProduct | null, method: CurrentSalesReferenceItem | null): Promise<void> {
    if (this.#state.disposed) return;
    this.#cancelRead(); const sequence = this.#sequence, request = new AbortController(); this.#request = request;
    const signal = AbortSignal.any([request.signal, this.#scope.signal]); const hall = this.#state.draft.hall;
    this.#publish({ picker: { kind, search, page, product, method, phase: 'loading', result: null }, ...(kind === 'sku' ? { sizeGroups: { phase: 'unavailable' as const, groups: [] } } : {}), notice: null });
    try {
      const hallId = hall ? entityId('hall', hall.id) : null;
      let result: CurrentFormPage<Candidate>;
      if (kind === 'product') result = await this.#reader.readProducts({ context: { kind: 'SALES', hallId: hallId! }, search, page, pageSize: 20 }, signal);
      else if (kind === 'sku') {
        const query = { context: { kind: 'SALES' as const, hallId: hallId! }, productId: product!.id, page, pageSize: 20 as const };
        this.#specSkus.clear();
        if(!product?.sizeGroupId)throw new Error('CURRENT_PRODUCT_SIZE_GROUP_MISSING');
        const complete=await readCompleteSkuPages(this.#skuPool,signal,(next,operationSignal)=>this.#reader.readProductSkus({...query,page:next},operationSignal),page,product.id,product.sizeGroupId);
        if(signal.aborted||sequence!==this.#sequence||this.#state.disposed)return;
        result=complete.first;
        const key=`${hallId}:${product.id}`;this.#specSkus.set(key,complete.items);
        if (this.#reader.readSizeGroups) {
          const skus = this.#specSkus.get(key) ?? [];
          const declared = product && 'sizeGroupId' in product && typeof product.sizeGroupId === 'string' ? product.sizeGroupId : null;
          const projected = new Set(skus.map(sku => sku.sizeGroupId));
          // Only explicit current product metadata is the hard boundary. An
          // existing SKU, a default group or a complete global dictionary cannot
          // supply missing product metadata, including for zero-SKU products.
          if (!declared) throw new Error('CURRENT_PRODUCT_SIZE_GROUP_MISSING');
          if (projected.size > 1 || [...projected].some(id => id !== declared)) throw new Error('CURRENT_PRODUCT_SIZE_GROUP_CONFLICT');
          const assigned = declared;this.#dictionaryGroups.delete(assigned);
          {
            const groups: DictionarySizeGroup[] = [];
            for (let next = 1; ; next++) {
              const data = await this.#reader.readSizeGroups({ search: '', page: next, pageSize: 100 }, signal);
              if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
              groups.push(...data.items);
              if(data.items.some(group=>group.id===assigned)||next*data.pageSize>=data.total)break;
            }
            for (const group of groups) this.#dictionaryGroups.set(group.id, group);

          }
          if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
          const actual = this.#dictionaryGroups.get(assigned);
          if (!actual) throw new Error('CURRENT_PRODUCT_SIZE_GROUP_MISSING');
          this.#publish({ sizeGroups: { phase: 'ready', groups: [actual] } });
        }
      }
      else {
        const query: CurrentSalesReferenceQuery = kind === 'hall' ? { kind, hallId: null, search, page, pageSize: 20 }
          : kind === 'salesperson' ? { kind, hallId, search, page, pageSize: 20 }
          : kind === 'paymentAccount' ? { kind, hallId: hallId!, paymentMethodId: entityId('paymentMethod', method!.id), search, page, pageSize: 20 }
          : { kind, hallId: hallId!, search, page, pageSize: 20 };
        result = await this.#reader.readSalesReferences(query, signal);
      }
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      this.#publish({ picker: { kind, search, page, product, method, phase: 'ready', result, ...(kind === 'sku' ? { specSkus: this.#specSkus.get(`${hallId}:${product!.id}`) ?? [] } : {}) } });
    } catch (error) {
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* Scope already cleared. */ } return; }
      this.#publish({ picker: { kind, search, page, product, method, phase: 'error', result: null }, notice: error instanceof Error && error.message.startsWith('CURRENT_PRODUCT_SIZE_GROUP_') ? '商品所属尺码组资料缺失或不一致，请重新读取或核对商品资料；未使用其他尺码组，原输入已保留。' : '候选读取失败，未改变草稿。可明确重试。' });
    } finally { if (this.#request === request) this.#request = null; }
  }
  hallChangeRequiresReset(id: string): boolean {
    const { draft } = this.#state;
    return !!(draft.hall && draft.hall.id !== id && (draft.customer || draft.salesperson || draft.warehouse || draft.lines.length || draft.settlements.length || this.#state.lineEdit || Object.values(this.#state.entries).flat().some(entry => entry.product || entry.query.trim())));
  }
  /** Capture a validated candidate before closing its menu; confirmation never trusts a later picker. */
  prepareHallChange(id: string): (() => boolean) | null {
    const { picker, draft, entries, lineEdit } = this.#state;
    if (this.#state.disposed || !this.#scope.active || picker?.kind !== 'hall' || picker.phase !== 'ready' || !this.hallChangeRequiresReset(id)) return null;
    const hall = picker.result?.items.find(row => row.id === id) as CurrentSalesReferenceItem | undefined;
    if (!hall || hall.hallId !== hall.id) return null;
    this.closePicker(); let consumed = false;
    return () => {
      if (consumed || this.#state.disposed || !this.#scope.active || this.#state.draft !== draft || this.#state.entries !== entries || this.#state.lineEdit !== lineEdit || this.#state.picker !== null) return false;
      consumed = true;
      this.#cancelRead(); this.#savedLines.clear(); this.#specSkus.clear(); this.#savedWarehouse = null;
      this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#salespersonDefaultClosed = true; this.#revision++;
      this.#publish({ draft: { ...draft, hall, customer: null, salesperson: null, warehouse: null, lines: [], settlements: [], orderDiscount: '0.00' }, entries: emptyEntries(), lineEdit: null, picker: null, dirty: true, errors: [], notice: null, totals: null });
      return true;
    };
  }
  async select(id: string, initialQuantity: '1' | '-1' = '1'): Promise<boolean> {
    const p = this.#state.picker; if (this.#state.disposed || p?.phase !== 'ready') return false;
    const item = p.result?.items.find(row => row.id === id); if (!item) return false;
    if (p.kind === 'product' && (this.#entryTarget || this.#state.lineEdit)) {
      const product = item as CurrentFormProduct, target = this.#entryTarget;
      if (this.#state.lineEdit) this.#publish({ lineEdit: { ...this.#state.lineEdit, product, sku: null, color: null, fit: null, size: null, sizeGroup: null, skuPage: 1 } });
      else if (target) {
        const entry = this.#entry(target.direction, target.key); if (!entry) return false;
        if (this.#state.draft.lines.length + Object.values(this.#state.entries).flat().filter(row => row.product || row.query.trim()).length > 200) { this.#publish({ notice: '已达 200 行上限。请修改现有行。' }); return false; }
        this.#replaceEntry(target.direction, { ...entry, product, query: product.code, sku: null, color: null, fit: null, size: null, sizeGroup: null, skuPage: 1 });
      }
      this.closePicker(); return true;
    }
    if (p.kind === 'paymentMethod' && this.#inlineSettlement) {
      const target = this.#settlementTarget, draft = this.#state.draft;
      if (target === null && draft.settlements.length >= 3) return false;
      const row = draft.settlements.find(row => row.key === target);
      if (target !== null && !row) return false;
      this.closePicker();
      return this.#edit({ ...draft, settlements: row ? draft.settlements.map(value => value === row ? { ...value, method: item as CurrentSalesReferenceItem, account: null } : value)
        : [...draft.settlements, { key: `local-settlement-${++this.#nextSettlement}`, method: item as CurrentSalesReferenceItem, account: null, direction: 'RECEIVE', amount: '' }] });
    }
    if (p.kind === 'product') {
      if (this.#state.lineEdit) this.#publish({ lineEdit: { ...this.#state.lineEdit, product: item as CurrentFormProduct, sku: null } });
      await this.#read('sku', '', 1, item as CurrentFormProduct, null); return true;
    }
    if (p.kind === 'paymentMethod') { await this.#read('paymentAccount', '', 1, null, item as CurrentSalesReferenceItem); return true; }
    const draft = this.#state.draft;
    if (p.kind === 'sku') {
      if (this.#state.lineEdit) {
        if ((item as CurrentFormSku).productId !== p.product?.id) return false;
        this.#publish({ lineEdit: { ...this.#state.lineEdit, product: p.product!, sku: item as CurrentFormSku, color: { id: (item as CurrentFormSku).colorId, name: (item as CurrentFormSku).colorName }, fit: { id: (item as CurrentFormSku).fitId, name: (item as CurrentFormSku).fitName }, size: { id: (item as CurrentFormSku).sizeId, name: (item as CurrentFormSku).sizeName }, sizeGroup: null } });
        this.closePicker(); return true;
      }
      if (initialQuantity !== '1' && initialQuantity !== '-1' || initialQuantity === '-1' && draft.businessType === 'SALE') return false;
      if (draft.lines.length >= 200) { this.#publish({ notice: '已达 200 行上限。请修改现有行。' }); return false; }
      return this.#edit({ ...draft, lines: [...draft.lines, { key: `local-line-${++this.#nextLine}`, sku: item as CurrentFormSku, product: p.product!, quantity: initialQuantity, dealPrice: '', pricingRule: 'UNIT_PRICE', discount: '', isGift: false, zeroConfirmed: false }] });
    }
    if (p.kind === 'paymentAccount') {
      const target = this.#settlementTarget;
      if (target !== null) {
        if (!draft.settlements.some(row => row.key === target)) { this.closePicker(); return false; }
        this.closePicker();
        return this.#edit({ ...draft, settlements: draft.settlements.map(row => row.key === target ? { ...row, method: p.method!, account: item as CurrentSalesReferenceItem } : row) });
      }
      if (draft.settlements.length >= 3) { this.#publish({ notice: '收退明细已达原生单据 3 行上限。' }); return false; }
      this.closePicker(); return this.#edit({ ...draft, settlements: [...draft.settlements, { key: `local-settlement-${++this.#nextSettlement}`, method: p.method!, account: item as CurrentSalesReferenceItem, direction: 'RECEIVE', amount: '' }] });
    }
    if (p.kind === 'hall' && this.hallChangeRequiresReset(id)) {
      this.#publish({ notice: '切换营业厅会改变候选范围。请先确认重置草稿，再选择新厅。' }); return false;
    }
    if (p.kind === 'salesperson') this.#salespersonDefaultClosed = true;
    this.closePicker(); return this.#edit({ ...draft, [p.kind]: item });
  }
  get hasSpecificationInputs(): boolean {
    return this.#state.draft.lines.some(row => row.sku === null) || !!this.#state.lineEdit && !this.#state.lineEdit.sku || Object.values(this.#state.entries).flat().some(entry => (entry.product || entry.query.trim()) && !entry.sku);
  }
  /** Visible money/quantity intent includes pending coordinates without making a SKU. */
  get pricingLines(): readonly SalesProposalPricingLine[] | null {
    const { draft, lineEdit, entries } = this.#state;
    if (lineEdit && !draft.lines.includes(lineEdit.original)) return null;
    const lines: SalesProposalPricingLine[] = draft.lines.map(row => lineEdit?.key === row.key ? lineEdit : row);
    for (const entry of Object.values(entries).flat().filter(entry => entry.product || entry.query.trim()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (!entry.product) return null;
      lines.push({ ...entry, product: entry.product });
    }
    return lines;
  }
  /** Capture the approved original SAVE body, retaining actual saved pointers only. */
  saveProposal(salesId: string | null, originalLines: ReadonlySet<string> = new Set(), originalSettlements: ReadonlySet<string> = new Set()): NativeSalesSaveProposal | null {
    const { draft, lineEdit, entries } = this.#state;
    if (this.#state.disposed || !this.#scope.active) return null;
    try {
      if (!draft.salesperson) { this.#publish({ errors: ['请选择在职营业员。'], notice: '保存资料未通过校验，原输入已保留，未发送保存。' }); return null; }
      if (!draft.hall || !draft.customer || !draft.warehouse || draft.warehouse.hallId !== draft.hall.id && !(this.#savedWarehouse?.hallId === draft.hall.id && this.#savedWarehouse.warehouseId === draft.warehouse.id)) throw Error();
      const pricing = this.pricingLines; if (!pricing) throw Error();
      const yuan = (raw: string) => { const value = amount(raw); return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`; };
      const tenths = (raw: string) => { if (!/^\d{1,2}(?:\.\d)?$/.test(raw.trim())) throw Error(); const [whole, fraction = '0'] = raw.trim().split('.'), value = Number(whole) * 10 + Number(fraction); if (value > 100) throw Error(); return value; };
      const selection = (row: { readonly product: CurrentFormProduct; readonly sku: CurrentFormSku | null; readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly size: SalesSpecChoice | null; readonly sizeGroup: SalesSpecChoice | null }) => {
        const identity = this.#localLineIdentity(row); if (!identity) throw Error();
        return identity.sku ? { skuId: identity.sku.id } : { spec: { productId: row.product.id, colorId: identity.specification.color.id, fitId: identity.specification.fit.id, sizeId: identity.specification.size.id } };
      };
      const price = (row: SalesProposalPricingLine) => {
        const value = row.isGift ? 0n : row.pricingRule === 'UNIT_PRICE' ? amount(row.dealPrice) : row.product.retailPrice === null ? null : discountUnitPrice(minorAmount(amount(row.product.retailPrice).toString()), tenths(row.discount));
        if (value === null || value === 0n && !row.isGift && !row.zeroConfirmed) throw Error();
        return { quantity: row.quantity, dealPrice: row.isGift ? row.pricingRule === 'DISCOUNT' ? null : '0.00' : `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`, pricingRule: row.pricingRule,
          discountTenths: row.pricingRule === 'DISCOUNT' ? tenths(row.discount) : null, isGift: row.isGift, zeroConfirmed: row.zeroConfirmed };
      };
      const lines: NativeSalesSaveProposal['lines'][number][] = draft.lines.map(row => {
        const edited = lineEdit?.key === row.key ? lineEdit : null;
        if (edited && edited.original !== row) throw Error();
        return { existingLineId: originalLines.has(row.key) ? row.key : null, ...(edited ? selection(edited) : row.sku ? { skuId: row.sku.id } : selection({ product: row.product, sku: null, ...row.specification })), ...price(edited ?? row) };
      });
      for (const direction of ['IN', 'OUT'] as const) for (const entry of entries[direction]) if (entry.product || entry.query.trim()) {
        if (!entry.product || entry.query !== entry.product.code || entry.quantity.startsWith('-') !== (direction === 'IN')) throw Error();
        lines.push({ existingLineId: null, ...selection({ ...entry, product: entry.product }), ...price({ ...entry, product: entry.product }) });
      }
      const businessType = salesBusinessType(salesBusinessMode(draft.businessType), lines.map(row => row.quantity));
      if (!salesProposalMoney({ ...draft, businessType, lines: pricing })) throw Error();
      const proposal = parseNativeSalesSaveProposal({ salesId, businessType, businessDate: draft.businessDate, note: draft.note === '' ? null : draft.note,
        hallId: draft.hall.id, customerId: draft.customer.id, salespersonId: draft.salesperson?.id ?? null, warehouseId: draft.warehouse.id, orderDiscount: yuan(draft.orderDiscount), lines,
        settlements: draft.settlements.map(row => { if (!row.method || !row.account || row.account.paymentMethodId !== row.method.id) throw Error(); return { existingSettlementId: originalSettlements.has(row.key) ? row.key : null,
          paymentAccountId: row.account.id, paymentMethodId: row.method.id, direction: row.direction, amount: yuan(row.amount) }; }) });
      this.#publish({ errors: [], notice: null }); return freeze(proposal);
    } catch { this.#publish({ errors: ['请完成当前商品组内的规格、数量、价格及收退款资料；普通零价须确认。'], notice: '保存资料未通过校验，原输入已保留，未发送保存。' }); return null; }
  }
  validate(): SalesProposal | null {
    if (this.#state.disposed) return null;
    if (!this.flushEntries()) return null;
    if (this.#state.lineEdit) { this.#publish({ errors: ['请先确认或取消当前行的改选。'] }); return null; }
    const draft = this.#state.draft, errors: string[] = [], gross: bigint[] = [];
    try { businessDate(draft.businessDate); } catch { errors.push('请输入有效单据日期。'); }
    if (!draft.hall || !draft.customer || !draft.warehouse) errors.push('请选择营业厅、客户和仓库。');
    if (!draft.salesperson) errors.push('请选择在职营业员。');
    if (draft.warehouse && draft.warehouse.hallId !== draft.hall?.id && !(this.#savedWarehouse?.hallId === draft.hall?.id && this.#savedWarehouse?.warehouseId === draft.warehouse.id)) errors.push('仓库必须属于所选营业厅。');
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
      } catch { errors.push(`${row.sku?.skuCode ?? row.product.code}：请核对${draft.businessType === 'SALE' ? '正整数' : '非零带符号整数'}数量、非负两位单价或有明确参考价的 0～10 折；普通零价须确认。`); }
    }
    let discount = 0n, settled = 0n;
    try { discount = amount(draft.orderDiscount); if (draft.businessType !== 'SALE') { if (discount !== 0n) throw Error(); } else if (gross.length === draft.lines.length) allocateSalesDiscount(gross.map(value => minorAmount(value.toString())), minorAmount(discount.toString())); }
    catch { errors.push(draft.businessType === 'SALE' ? '整单优惠须为非负两位金额，且不超过商品金额。' : '独立退货／换货整单优惠必须为零。'); }
    for (const row of draft.settlements) {
      try {
        if (!row.method || !row.account || !['RECEIVE', 'REFUND'].includes(row.direction) || row.account.paymentMethodId !== row.method.id) throw Error();
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
    this.#salespersonDefaultClosed = false;
    this.#savedLines.clear(); this.#specSkus.clear(); this.#dictionaryGroups.clear();  this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#revision++; this.#publish({ draft: empty(), dirty: false, sizeGroups: { phase: 'unavailable', groups: [] }, picker: null, lineEdit: null, entries: emptyEntries(), errors: [], notice: null, totals: null }); return true;
  }
  cancel(discardConfirmed = false): boolean { if (!this.reset(discardConfirmed)) return false; this.dispose(); return true; }
  readonly dispose = (): void => { if (this.#state.disposed) return; this.#savedLines.clear(); this.#specSkus.clear(); this.#dictionaryGroups.clear();  this.#savedWarehouse = null; this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#scope.signal.removeEventListener('abort', this.dispose); this.#publish({ draft: empty(), dirty: false, disposed: true, sizeGroups: { phase: 'unavailable', groups: [] }, picker: null, lineEdit: null, entries: emptyEntries(), errors: [], notice: null, totals: null }); this.#listeners.clear(); };
}
