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
export type SalesProposalReader = Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readSalesReferences' | 'readProducts' | 'readProductSkus'>
  & Partial<Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readBarcode'>>;
export type SalesProposalPicker = CurrentSalesReferenceQuery['kind'] | 'product' | 'sku';
export interface SalesProposalLine {
  readonly key: string;
  readonly sku: CurrentFormSku; readonly product: CurrentFormProduct; readonly quantity: string; readonly dealPrice: string;
  readonly sourceSnapshot?: SalesDraftDto['lines'][number]['snapshot'];
  readonly pricingRule: 'UNIT_PRICE' | 'DISCOUNT'; readonly discount: string; readonly isGift: boolean; readonly zeroConfirmed: boolean;
}
export interface SalesSpecChoice { readonly id: string; readonly name: string }
export interface SalesProposalEntry {
  readonly product: CurrentFormProduct | null; readonly sku: CurrentFormSku | null;
  readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly skuPage: number;
  readonly query: string; readonly quantity: string; readonly dealPrice: string;
}
const emptyEntry = (direction: 'IN' | 'OUT'): SalesProposalEntry => ({ product: null, sku: null, color: null, fit: null, skuPage: 1, query: '', quantity: direction === 'IN' ? '-1' : '1', dealPrice: '' });
const emptyEntries = () => ({ IN: emptyEntry('IN'), OUT: emptyEntry('OUT') });
export interface SalesProposal {
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
  readonly entries: Readonly<Record<'IN' | 'OUT', SalesProposalEntry>>;
  /** A pending identity change never mutates the original draft line. */
  readonly lineEdit: { readonly key: string; readonly original: SalesProposalLine; readonly product: CurrentFormProduct; readonly sku: CurrentFormSku | null; readonly color: SalesSpecChoice | null; readonly fit: SalesSpecChoice | null; readonly skuPage: number } | null;
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
/** Display projection only. Missing/invalid input stays unknown, never a saved
 * zero, price authority or an approval decision. Uses the same integer money rules. */
export function salesProposalMoney(draft: SalesProposal): { readonly grossMinor: string; readonly netDueMinor: string; readonly orderDiscountMinor: string;
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
      if (!row.method || !row.account || row.account.paymentMethodId !== row.method.id || row.direction !== 'RECEIVE' && row.direction !== 'REFUND') throw Error();
      return sum + (row.direction === 'RECEIVE' ? 1n : -1n) * amount(row.amount);
    }, 0n); } catch { settled = null; }
    return { grossMinor: gross.toString(), netDueMinor: net.toString(), orderDiscountMinor: discount.toString(), settledMinor: settled?.toString() ?? null,
      differenceMinor: settled === null ? null : (net - settled).toString(), balanced: settled !== null && net === settled };
  } catch { return null; }
}
/** Local sales/independent return/exchange proposals. Never creates native numbers/IDs, barcode facts,
 * minimum-price authority, approval eligibility, inventory effects or commands. */
export class SalesProposalSession {
  readonly #scope: ReadScope; readonly #reader: SalesProposalReader; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined; readonly #listeners = new Set<() => void>();
  #seeded = false;
  #savedWarehouse: { readonly hallId: string; readonly warehouseId: string } | null = null;
  readonly #savedLines = new Map<string, { readonly skuId: string; readonly snapshot: SalesDraftDto['lines'][number]['snapshot']; readonly product: CurrentFormProduct }>();
  #request: AbortController | null = null; #sequence = 0; #nextSettlement = 0; #nextLine = 0; #settlementTarget: string | null = null; #revision = 0; #entryTarget: 'IN' | 'OUT' | null = null; #inlineSettlement = false;
  #state: SalesProposalSnapshot = freeze({ draft: empty(), dirty: false, disposed: false, errors: [], notice: null, totals: null, picker: null, lineEdit: null, entries: emptyEntries() });
  constructor(scope: ReadScope, reader: SalesProposalReader, onAccessFailure?: (error: HttpQueryError) => void) { this.#scope = scope; this.#reader = reader; this.#onAccessFailure = onAccessFailure; scope.signal.addEventListener('abort', this.dispose, { once: true }); if (!scope.active) this.dispose(); }
  readonly getSnapshot = (): SalesProposalSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  matchesIdentity(scope: ReadScope): boolean {
    const owner = this.#scope.identity, target = scope.identity;
    return !this.#state.disposed && this.#scope.active && scope.active && owner.accountId === target.accountId && owner.sessionRevision === target.sessionRevision && owner.permissionRevision === target.permissionRevision;
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
      if (typeof draft.businessDate !== 'string' || typeof draft.note !== 'string' || typeof draft.orderDiscount !== 'string' || draft.lines.some(line => !line.key || line.sku.productId !== line.product.id || typeof line.quantity !== 'string' || typeof line.dealPrice !== 'string')) return false;
    } catch { return false; }
    for (const line of draft.lines) if (line.sourceSnapshot) this.#savedLines.set(line.key, Object.freeze({ skuId: line.sku.id, snapshot: line.sourceSnapshot, product: line.product }));
    this.#seeded = true; this.#savedWarehouse = draft.hall && draft.warehouse ? { hallId: draft.hall.id, warehouseId: draft.warehouse.id } : null; this.#revision++;
    this.#publish({ draft, dirty, entries: emptyEntries(), lineEdit: null, errors: [], notice: null, totals: null }); return true;
  }
  markUnchanged(reference: SalesProposal): boolean {
    if (!this.#seeded || this.#state.disposed || this.#state.draft !== reference || this.#state.lineEdit || Object.values(this.#state.entries).some(entry => entry.product || entry.query.trim())) return false;
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
  setBusinessType(businessType: SalesProposal['businessType']): boolean {
    if (!['SALE', 'RETURN', 'EXCHANGE'].includes(businessType)) return false;
    // SALE has no incoming-entry section. Keep its unfinished input visible in
    // the combined mode until the user completes or explicitly clears it.
    const incoming = this.#state.entries.IN;
    if (businessType === 'SALE' && (incoming.product || incoming.query.trim())) {
      this.#publish({ notice: '退回商品还有未完成录入，请先在“录入退回商品”中完成或清除，再切换销售。' });
      return false;
    }
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
    if (this.#state.lineEdit?.key === key) this.cancelLineEdit();
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => row.key !== key) });
  }
  async openLinePicker(key: string, kind: 'product' | 'sku' = 'sku'): Promise<void> {
    const original = this.#state.draft.lines.find(row => row.key === key);
    if (this.#state.disposed || !original || !this.#state.draft.hall) return;
    if (this.#state.lineEdit && this.#state.lineEdit.key !== key) { this.#publish({ notice: '请先确认或取消当前行的改选。' }); return; }
    this.#settlementTarget = null;
    if (!this.#state.lineEdit) this.#publish({ lineEdit: { key, original, product: original.product, sku: original.sku, color: { id: original.sku.colorId, name: original.sku.colorName }, fit: { id: original.sku.fitId, name: original.sku.fitName }, skuPage: 1 } });
    this.#entryTarget = null;
    await this.#read(kind, '', kind === 'sku' ? this.#state.lineEdit!.skuPage : 1, kind === 'sku' ? this.#state.lineEdit!.product : null, null);
  }
  confirmLineEdit(): boolean {
    const edit = this.#state.lineEdit, draft = this.#state.draft;
    if (this.#state.disposed || this.#state.picker || !edit?.sku || edit.sku.productId !== edit.product.id) return false;
    if (draft.lines.find(row => row.key === edit.key) !== edit.original) { this.#publish({ notice: '原行已变化，请取消改选后重新选择。' }); return false; }
    const changed = this.#edit({ ...draft, lines: draft.lines.map(row => {
      if (row.key !== edit.key) return row;
      const { sourceSnapshot, ...retained } = row, original = this.#savedLines.get(row.key), restored = original?.skuId === edit.sku!.id;
      const { category: _currentCategory, ...currentProduct } = edit.product;
      // A stored reference belongs to the original SKU. A size-only change has
      // no current price read; do not relabel the old reference as a new fact.
      const product = restored ? { ...currentProduct, retailPrice: original.product.retailPrice, ...(original.product.category ? { category: original.product.category } : {}) }
        : sourceSnapshot && edit.product === row.product ? { ...edit.product, retailPrice: null } : edit.product;
      return { ...retained, ...(restored ? { sourceSnapshot: original.snapshot } : {}), product, sku: edit.sku! };
    }) });
    if (changed) this.#publish({ lineEdit: null, ...(this.#state.draft.lines.find(row => row.key === edit.key)?.product.retailPrice === null ? { notice: '新规格参考价尚未读到。可重新选择商品核对参考价，或明确填写成交单价；未确认价格不会保存。' } : {}) });
    return changed;
  }
  cancelLineEdit(): void { this.closePicker(); if (!this.#state.disposed) this.#publish({ lineEdit: null }); }
  updateEntry(direction: 'IN' | 'OUT', patch: Partial<Pick<SalesProposalEntry, 'query' | 'quantity' | 'dealPrice'>>): void {
    if (this.#state.disposed) return;
    this.#revision++; this.#publish({ entries: { ...this.#state.entries, [direction]: { ...this.#state.entries[direction], ...patch, ...(patch.query !== undefined && patch.query !== this.#state.entries[direction].product?.code ? { product: null, sku: null, color: null, fit: null, skuPage: 1 } : {}) } }, dirty: true, errors: [], notice: null });
  }
  clearEntry(direction: 'IN' | 'OUT'): void {
    if (this.#state.disposed) return;
    this.closePicker(); this.#revision++; this.#publish({ entries: { ...this.#state.entries, [direction]: emptyEntry(direction) } });
  }
  async openEntryPicker(direction: 'IN' | 'OUT', kind: 'product' | 'sku'): Promise<void> {
    const entry = this.#state.entries[direction];
    if (this.#state.disposed || !this.#state.draft.hall || this.#state.lineEdit || direction === 'IN' && this.#state.draft.businessType === 'SALE' || kind === 'sku' && !entry.product) return;
    this.#entryTarget = direction; this.#settlementTarget = null; this.#inlineSettlement = false;
    await this.#read(kind, kind === 'product' ? entry.query : '', kind === 'sku' ? entry.skuPage : 1, kind === 'sku' ? entry.product : null, null);
  }
  /** Each option is projected from the currently read actual SKU page. Color and
   * fit narrow explicitly; only the size choice binds one exact SKU ID. */
  selectSpec(kind: 'color' | 'fit' | 'size', id: string): boolean {
    const picker = this.#state.picker, target = this.#entryTarget, edit = this.#state.lineEdit;
    const selection = edit ?? (target ? this.#state.entries[target] : null);
    if (this.#state.disposed || picker?.kind !== 'sku' || picker.phase !== 'ready' || !selection?.product || picker.product?.id !== selection.product.id) return false;
    const rows = picker.result!.items as readonly CurrentFormSku[];
    const row = rows.find(row => row.productId === selection.product!.id && (kind === 'color' ? row.colorId === id
      : row.colorId === selection.color?.id && (kind === 'fit' ? row.fitId === id : row.fitId === selection.fit?.id && row.id === id)));
    if (!row) return false;
    const patch = kind === 'color' ? { color: { id: row.colorId, name: row.colorName }, fit: null, sku: null }
      : kind === 'fit' ? { fit: { id: row.fitId, name: row.fitName }, sku: null } : { sku: row };
    if (edit) this.#publish({ lineEdit: { ...edit, ...patch, skuPage: picker.page } });
    else if (target) { this.#revision++; this.#publish({ entries: { ...this.#state.entries, [target]: { ...this.#state.entries[target], ...patch, skuPage: picker.page } }, dirty: true }); }
    this.closePicker(); return true;
  }
  appendEntry(direction: 'IN' | 'OUT'): boolean {
    const entry = this.#state.entries[direction], draft = this.#state.draft;
    if (this.#state.disposed || this.#state.lineEdit || !entry.product || entry.query !== entry.product.code || !entry.sku || entry.sku.productId !== entry.product.id || entry.sku.colorId !== entry.color?.id || entry.sku.fitId !== entry.fit?.id) {
      this.#publish({ notice: '请选择款号、颜色、版型及实际尺码后完成录入。' }); return false;
    }
    if (draft.lines.length >= 200 || !/^-?[1-9]\d{0,18}$/.test(entry.quantity) || entry.quantity.startsWith('-') !== (direction === 'IN') || direction === 'IN' && draft.businessType === 'SALE') {
      this.#publish({ notice: '请核对当前分区的数量方向及 200 行上限；输入已保留。' }); return false;
    }
    try { quantity(entry.quantity); } catch { this.#publish({ notice: '数量超出可用范围，输入已保留。' }); return false; }
    this.closePicker();
    const ok = this.#edit({ ...draft, lines: [...draft.lines, { key: `local-line-${++this.#nextLine}`, sku: entry.sku, product: entry.product, quantity: entry.quantity, dealPrice: entry.dealPrice, pricingRule: 'UNIT_PRICE', discount: '', isGift: false, zeroConfirmed: false }] });
    if (ok) this.#publish({ entries: { ...this.#state.entries, [direction]: emptyEntry(direction) } });
    return ok;
  }
  addSettlement(): boolean {
    const draft = this.#state.draft;
    if (this.#state.disposed || !draft.hall || draft.settlements.length >= 3) return false;
    if (draft.settlements.some(row => !row.method || !row.account || row.account.paymentMethodId !== row.method.id || !/^\d+(?:\.\d{1,2})?$/.test(row.amount))) return false;
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
  clearSalesperson(): boolean { return this.#edit({ ...this.#state.draft, salesperson: null }); }
  get canScan(): boolean { return !this.#state.disposed && !!this.#reader.readBarcode && !!this.#state.draft.hall && !!this.#state.draft.warehouse; }
  createScanner(direction: 'IN' | 'OUT'): DocumentScanController {
    return new DocumentScanController({ scope: this.#scope, ...(this.#onAccessFailure ? { onAccessFailure: this.#onAccessFailure } : {}),
      target: () => {
        const { hall, warehouse, businessType } = this.#state.draft;
        return this.canScan && hall && warehouse && !(direction === 'IN' && businessType === 'SALE')
          ? { key: `${this.#revision}:${direction}`, context: { kind: 'SALES', hallId: entityId('hall', hall.id), warehouseId: entityId('warehouse', warehouse.id) } } : null;
      },
      resolve: (query, signal) => this.#reader.readBarcode!(query, signal),
      apply: result => {
        const draft = this.#state.draft, matches = draft.lines.filter(row => row.sku.id === result.sku.id && row.quantity.startsWith('-') === (direction === 'IN'));
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
    if (kind !== 'hall' && !this.#state.draft.hall) { this.#publish({ notice: '请先选择营业厅。' }); return; }
    this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false;
    await this.#read(kind, '', 1, null, null);
  }
  async openSettlementPicker(key: string): Promise<void> {
    if (this.#state.disposed || !this.#state.draft.hall || !this.#state.draft.settlements.some(row => row.key === key)) return;
    if (this.#state.lineEdit) { this.#publish({ notice: '请先确认或取消当前行的改选。' }); return; }
    this.#settlementTarget = key; this.#entryTarget = null; this.#inlineSettlement = false;
    await this.#read('paymentMethod', '', 1, null, null);
  }
  async search(search: string): Promise<void> { const p = this.#state.picker; if (p && p.kind !== 'sku') { if (p.kind === 'product' && this.#entryTarget) this.updateEntry(this.#entryTarget, { query: search }); await this.#read(p.kind, search, 1, p.product, p.method); } }
  async page(page: number): Promise<void> {
    const p = this.#state.picker;
    if (!p || p.phase !== 'ready' || !p.result || !Number.isSafeInteger(page) || page < 1 || BigInt(page - 1) * 20n >= p.result.exactTotal) return;
    await this.#read(p.kind, p.search, page, p.product, p.method);
  }
  async retry(): Promise<void> { const p = this.#state.picker; if (p?.phase === 'error') await this.#read(p.kind, p.search, p.page, p.product, p.method); }
  closePicker(): void { this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; if (!this.#state.disposed) this.#publish({ picker: null }); }
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
  async select(id: string, initialQuantity: '1' | '-1' = '1'): Promise<boolean> {
    const p = this.#state.picker; if (this.#state.disposed || p?.phase !== 'ready') return false;
    const item = p.result?.items.find(row => row.id === id); if (!item) return false;
    if (p.kind === 'product' && (this.#entryTarget || this.#state.lineEdit)) {
      const product = item as CurrentFormProduct, target = this.#entryTarget;
      if (this.#state.lineEdit) this.#publish({ lineEdit: { ...this.#state.lineEdit, product, sku: null, color: null, fit: null, skuPage: 1 } });
      else if (target) { this.#revision++; this.#publish({ entries: { ...this.#state.entries, [target]: { ...this.#state.entries[target], product, query: product.code, sku: null, color: null, fit: null, skuPage: 1, dealPrice: this.#state.entries[target].dealPrice } }, dirty: true }); }
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
        this.#publish({ lineEdit: { ...this.#state.lineEdit, product: p.product!, sku: item as CurrentFormSku, color: { id: (item as CurrentFormSku).colorId, name: (item as CurrentFormSku).colorName }, fit: { id: (item as CurrentFormSku).fitId, name: (item as CurrentFormSku).fitName } } });
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
    if (p.kind === 'hall' && draft.hall?.id !== id && (draft.customer || draft.salesperson || draft.warehouse || draft.lines.length || draft.settlements.length || Object.values(this.#state.entries).some(entry => entry.product || entry.query.trim()))) {
      this.#publish({ notice: '切换营业厅会改变候选范围。请先确认重置草稿，再选择新厅。' }); return false;
    }
    this.closePicker(); return this.#edit({ ...draft, [p.kind]: item });
  }
  validate(): SalesProposal | null {
    if (this.#state.disposed) return null;
    if (Object.values(this.#state.entries).some(entry => entry.product || entry.query.trim())) { this.#publish({ errors: ['请完成或清除表格底部尚未完成的录入。'] }); return null; }
    if (this.#state.lineEdit) { this.#publish({ errors: ['请先确认或取消当前行的改选。'] }); return null; }
    const draft = this.#state.draft, errors: string[] = [], gross: bigint[] = [];
    try { businessDate(draft.businessDate); } catch { errors.push('请输入有效单据日期。'); }
    if (!draft.hall || !draft.customer || !draft.warehouse) errors.push('请选择营业厅、客户和仓库。');
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
      } catch { errors.push(`${row.sku.skuCode}：请核对${draft.businessType === 'SALE' ? '正整数' : '非零带符号整数'}数量、非负两位单价或有明确参考价的 0～10 折；普通零价须确认。`); }
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
    this.#savedLines.clear(); this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#revision++; this.#publish({ draft: empty(), dirty: false, picker: null, lineEdit: null, entries: emptyEntries(), errors: [], notice: null, totals: null }); return true;
  }
  cancel(discardConfirmed = false): boolean { if (!this.reset(discardConfirmed)) return false; this.dispose(); return true; }
  readonly dispose = (): void => { if (this.#state.disposed) return; this.#savedLines.clear(); this.#savedWarehouse = null; this.#cancelRead(); this.#settlementTarget = null; this.#entryTarget = null; this.#inlineSettlement = false; this.#scope.signal.removeEventListener('abort', this.dispose); this.#publish({ draft: empty(), dirty: false, disposed: true, picker: null, lineEdit: null, entries: emptyEntries(), errors: [], notice: null, totals: null }); this.#listeners.clear(); };
}
