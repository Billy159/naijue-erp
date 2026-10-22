import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/transfer-payload-budget.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import { businessDate, quantity } from '../../../../packages/domain/src/values.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';
import { currentBusinessDate } from './business-date.ts';
import { DocumentScanController } from '../components/document-scan-controller.ts';
import type { TransferDraftDto } from '../transfers/commands/contracts.ts';

export type TransferProposalReader = Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readTransferWarehouses' | 'readProducts' | 'readProductSkus'>
  & Partial<Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readBarcode'>>;
export type TransferProposalPicker = 'FROM' | 'TO' | 'PRODUCT' | 'SKU';
type Candidate = CurrentTransferWarehouse | CurrentFormProduct | CurrentFormSku;
export interface TransferProposalLine { readonly sku: CurrentFormSku; readonly quantity: string; readonly product?: CurrentFormProduct; readonly existingLineId?: string; readonly sourceSnapshot?: TransferDraftDto['lines'][number]['snapshot'] }
/** A saved header supplies the original ID/name only. Enabled/hall facts must
 * come from current candidate reads and are never filled from the header. */
export type TransferWarehouseSelection = Pick<CurrentTransferWarehouse, 'id' | 'name'>;
export function transferProposalRowKey(sku: CurrentFormSku): string { return JSON.stringify([sku.productId, sku.colorId, sku.fitId, sku.sizeGroupId]); }
export interface TransferPendingEntry {
  readonly query: string; readonly product: CurrentFormProduct | null;
  readonly color: { readonly id: string; readonly name: string } | null; readonly fit: { readonly id: string; readonly name: string } | null;
  readonly skus: readonly CurrentFormSku[]; readonly page: number; readonly exactTotal: bigint | null;
  readonly phase: 'idle' | 'loading' | 'ready' | 'error'; readonly quantities: Readonly<Record<string, string>>;
  readonly userEdited: boolean; readonly unmapped: readonly { readonly skuId: string; readonly sizeName: string; readonly quantity: string }[];
}
const emptyPending = (): TransferPendingEntry => ({ query: '', product: null, color: null, fit: null, skus: [], page: 1, exactTotal: null, phase: 'idle', quantities: {}, userEdited: false, unmapped: [] });
export interface TransferProposal {
  readonly businessDate: string; readonly note: string;
  readonly from: TransferWarehouseSelection | null; readonly to: TransferWarehouseSelection | null;
  readonly lines: readonly TransferProposalLine[];
}
export interface TransferProposalSnapshot {
  readonly draft: TransferProposal; readonly dirty: boolean; readonly disposed: boolean;
  readonly errors: readonly string[]; readonly notice: string | null;
  readonly pending: TransferPendingEntry;
  readonly replacement: { readonly key: string; readonly originals: readonly TransferProposalLine[]; readonly previousPending: TransferPendingEntry } | null;
  readonly appendRequest: { readonly kind: 'entry' | 'replace'; readonly quantity: string } | null;
  /** Only this successfully read SKU page; blank cells never become draft lines. */
  readonly entry: { readonly product: CurrentFormProduct; readonly skus: readonly CurrentFormSku[]; readonly page: number; readonly exactTotal: bigint } | null;
  readonly picker: { readonly kind: TransferProposalPicker; readonly search: string; readonly page: number;
    readonly product: CurrentFormProduct | null; readonly phase: 'loading' | 'ready' | 'error';
    readonly result: CurrentFormPage<Candidate> | null } | null;
}
const empty = (): TransferProposal => ({ businessDate: currentBusinessDate(), note: '', from: null, to: null, lines: [] });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** A local unsaved proposal, NOT a TransferDraftDto. No document/line number,
 * barcode snapshot, authority, write request or optimistic success is invented.
 * Host must revalidate all facts through trusted preparation before native SAVE. */
export class TransferProposalSession {
  readonly #scope: ReadScope; readonly #reader: TransferProposalReader; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined;
  readonly #listeners = new Set<() => void>();
  #request: AbortController | null = null; #sequence = 0; #revision = 0;
  #seeded = false;
  #skuRead: AbortController | null = null; #skuSequence = 0;
  #appendBasis: { draft: TransferProposal; pending: TransferPendingEntry; replacement: TransferProposalSnapshot['replacement'] } | null = null;
  #state: TransferProposalSnapshot = freeze({ draft: empty(), dirty: false, disposed: false, errors: [], notice: null, picker: null, entry: null, pending: emptyPending(), replacement: null, appendRequest: null });
  constructor(scope: ReadScope, reader: TransferProposalReader, onAccessFailure?: (error: HttpQueryError) => void) {
    this.#scope = scope; this.#reader = reader; this.#onAccessFailure = onAccessFailure;
    scope.signal.addEventListener('abort', this.dispose, { once: true });
    if (!scope.active) this.dispose();
  }
  readonly getSnapshot = (): TransferProposalSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  matchesIdentity(scope: ReadScope): boolean {
    const owner = this.#scope.identity, target = scope.identity;
    return !this.#state.disposed && this.#scope.active && scope.active && owner.accountId === target.accountId
      && owner.sessionRevision === target.sessionRevision && owner.permissionRevision === target.permissionRevision;
  }
  initializeFromSaved(value: TransferProposal, dirty = false): boolean {
    if (this.#seeded || this.#state.disposed || this.#state.dirty || this.#state.draft.lines.length || this.#state.picker) return false;
    let draft: TransferProposal;
    try {
      draft = structuredClone(value);
      if (typeof draft.businessDate !== 'string' || typeof draft.note !== 'string' || !draft.from || !draft.to || !Array.isArray(draft.lines) || !draft.lines.length || draft.lines.length > TRANSFER_PREPARE_MAX_LINES || draft.lines.some(row => typeof row.quantity !== 'string' || !row.existingLineId)) return false;
      if (new Set(draft.lines.map(row => row.existingLineId)).size !== draft.lines.length || new Set(draft.lines.map(row => row.sku.id)).size !== draft.lines.length || new Set(draft.lines.map(row => JSON.stringify([transferProposalRowKey(row.sku), row.sku.sizeId]))).size !== draft.lines.length) return false;
      const labels = new Map<string, string>();
      for (const row of draft.lines) { const key = transferProposalRowKey(row.sku), snapshot = row.sourceSnapshot, label = JSON.stringify(snapshot ? [snapshot.productCode, snapshot.productName, snapshot.colorName, snapshot.fitName] : [row.sku.productCode, row.sku.productName, row.sku.colorName, row.sku.fitName]); if (labels.has(key) && labels.get(key) !== label) return false; labels.set(key, label); }
    } catch { return false; }
    this.#seeded = true; this.#revision++; this.#publish({ draft, dirty, errors: [], notice: null }); return true;
  }
  markUnchanged(reference: TransferProposal): boolean {
    if (!this.#seeded || this.#state.disposed || this.#state.draft !== reference || this.#state.replacement || this.#state.pending.product || this.#state.pending.query.trim()) return false;
    this.#publish({ dirty: false, notice: null }); return true;
  }
  #publish(patch: Partial<TransferProposalSnapshot>): void {
    this.#state = freeze({ ...this.#state, ...patch });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Other subscribers still receive invalidation. */ } }
  }
  #cancelRead(): void { this.#sequence++; this.#request?.abort(); this.#request = null; }
  #edit(draft: TransferProposal): boolean {
    if (this.#state.disposed) return false;
    this.#revision++; this.#appendBasis = null;
    this.#publish({ draft, dirty: true, errors: [], notice: null, appendRequest: null }); return true;
  }
  setHeader(patch: Pick<Partial<TransferProposal>, 'businessDate' | 'note'>): boolean {
    return this.#edit({ ...this.#state.draft, ...patch });
  }
  setQuantity(skuId: string, value: string): boolean {
    if (!this.#state.draft.lines.some(row => row.sku.id === skuId)) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.map(row => row.sku.id === skuId ? { ...row, quantity: value } : row) });
  }
  setMatrixQuantity(skuId: string, value: string): boolean {
    if (this.#state.draft.lines.some(row => row.sku.id === skuId)) return this.setQuantity(skuId, value);
    const sku = this.#state.entry?.skus.find(row => row.id === skuId);
    if (!sku || value === '') return false;
    if (this.#state.draft.lines.length >= TRANSFER_PREPARE_MAX_LINES) { this.#publish({ notice: '本草稿最多选择 200 个实际规格。' }); return false; }
    return this.#edit({ ...this.#state.draft, lines: [...this.#state.draft.lines, { sku, quantity: value, ...(this.#state.entry?.product.id === sku.productId ? { product: this.#state.entry.product } : {}) }] });
  }
  removeLine(skuId: string): boolean {
    if (!this.#state.draft.lines.some(row => row.sku.id === skuId)) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => row.sku.id !== skuId) });
  }
  removeGroup(key: string): boolean {
    if (!this.#state.draft.lines.some(row => transferProposalRowKey(row.sku) === key)) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => transferProposalRowKey(row.sku) !== key) });
  }
  #cancelSkuRead(): void { this.#skuSequence++; this.#skuRead?.abort(); this.#skuRead = null; }
  #pending(pending: TransferPendingEntry): void {
    if (this.#state.disposed) return;
    this.#revision++; this.#appendBasis = null;
    this.#publish({ pending, dirty: true, errors: [], notice: null, appendRequest: null });
  }
  setPendingQuery(query: string): void {
    if (this.#state.disposed) return;
    this.#cancelSkuRead(); this.#pending({ ...emptyPending(), query });
  }
  clearPending(): void {
    if (this.#state.disposed) return;
    this.closePicker(); this.#cancelSkuRead();
    if (this.#state.replacement) { this.cancelReplacement(); return; }
    this.#pending(emptyPending());
  }
  async selectPendingProduct(id: string): Promise<boolean> {
    const p = this.#state.picker, product = p?.kind === 'PRODUCT' && p.phase === 'ready' ? p.result?.items.find(row => row.id === id) as CurrentFormProduct | undefined : undefined;
    if (this.#state.disposed || !product) return false;
    this.closePicker(); this.#cancelSkuRead(); this.#pending({ ...emptyPending(), product, query: product.code });
    await this.readPendingSkus(1); return true;
  }
  async readPendingSkus(page = this.#state.pending.page): Promise<void> {
    const pending = this.#state.pending, product = pending.product;
    if (this.#state.disposed || !product || !Number.isSafeInteger(page) || page < 1 || pending.exactTotal !== null && page > 1 && BigInt(page - 1) * 20n >= pending.exactTotal) return;
    this.#cancelSkuRead(); const sequence = this.#skuSequence, request = new AbortController(); this.#skuRead = request;
    const signal = AbortSignal.any([request.signal, this.#scope.signal]); this.#publish({ pending: { ...pending, phase: 'loading', page } });
    try {
      const result = await this.#reader.readProductSkus({ context: { kind: 'TRANSFER' }, productId: product.id, page, pageSize: 20 }, signal);
      if (signal.aborted || this.#state.disposed || sequence !== this.#skuSequence || this.#state.pending.product?.id !== product.id) return;
      const now = this.#state.pending, known = new Map<string, CurrentFormSku>();
      for (const sku of now.skus) if (now.quantities[sku.id] || this.#state.draft.lines.some(row => row.sku.id === sku.id)) known.set(sku.id, sku);
      for (const sku of result.items) { if (sku.productId !== product.id) throw new TypeError('Foreign product SKU.'); known.set(sku.id, sku); }
      if (known.size > TRANSFER_PREPARE_MAX_LINES) throw new TypeError('Pending SKU budget exceeded.');
      for (const sku of now.skus) if (known.size < TRANSFER_PREPARE_MAX_LINES) known.set(sku.id, sku);
      const next = { ...now, phase: 'ready' as const, skus: [...known.values()], page, exactTotal: result.exactTotal };
      this.#publish({ pending: this.#mapReplacement(next) });
    } catch (error) {
      if (signal.aborted || this.#state.disposed || sequence !== this.#skuSequence) return;
      if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* cleared first */ } return; }
      this.#publish({ pending: { ...this.#state.pending, phase: 'error' }, notice: '实际规格未能读取，输入仍保留，可明确重试。' });
    } finally { if (this.#skuRead === request) this.#skuRead = null; }
  }
  #mapReplacement(pending: TransferPendingEntry): TransferPendingEntry {
    const replacement = this.#state.replacement;
    if (!replacement || pending.userEdited) return pending;
    const quantities: Record<string, string> = {}, unmapped: { skuId: string; sizeName: string; quantity: string }[] = [];
    for (const original of replacement.originals) {
      const matches = pending.skus.filter(sku => sku.productId === pending.product?.id && sku.colorId === pending.color?.id && sku.fitId === pending.fit?.id && sku.sizeId === original.sku.sizeId && sku.sizeGroupId === original.sku.sizeGroupId);
      if (matches.length !== 1 || Object.hasOwn(quantities, matches[0]!.id)) unmapped.push({ skuId: original.sku.id, sizeName: original.sku.sizeName, quantity: original.quantity });
      else quantities[matches[0]!.id] = original.quantity;
    }
    return { ...pending, quantities, unmapped };
  }
  selectPendingSpec(kind: 'color' | 'fit', id: string): boolean {
    const pending = this.#state.pending;
    if (this.#state.disposed || !pending.product || pending.phase !== 'ready') return false;
    const sku = pending.skus.find(sku => kind === 'color' ? sku.colorId === id : sku.colorId === pending.color?.id && sku.fitId === id);
    if (!sku) return false;
    if (Object.values(pending.quantities).some(raw => raw !== '') && pending.userEdited) { this.#publish({ notice: '已有尚未完成的数量输入，请先完成、清除或取消当前改选。' }); return false; }
    const next = kind === 'color' ? { ...pending, color: { id: sku.colorId, name: sku.colorName }, fit: null, quantities: {}, userEdited: false }
      : { ...pending, fit: { id: sku.fitId, name: sku.fitName }, quantities: {}, userEdited: false };
    this.#pending(this.#mapReplacement(next)); this.closePicker(); return true;
  }
  setPendingQuantity(skuId: string, raw: string): boolean {
    const pending = this.#state.pending, sku = pending.skus.find(sku => sku.id === skuId);
    if (this.#state.disposed || !sku || sku.colorId !== pending.color?.id || sku.fitId !== pending.fit?.id) return false;
    this.#pending({ ...pending, quantities: { ...pending.quantities, [skuId]: raw }, userEdited: true }); return true;
  }
  beginReplacement(key: string): boolean {
    if (this.#state.disposed || this.#state.replacement) return false;
    const originals = this.#state.draft.lines.filter(row => transferProposalRowKey(row.sku) === key), first = originals[0];
    if (!first) return false;
    this.closePicker(); this.#cancelSkuRead();
    const product: CurrentFormProduct = first.product ?? { id: first.sku.productId, code: first.sku.productCode, name: first.sku.productName, retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
    const previousPending = this.#state.pending;
    this.#publish({ replacement: { key, originals, previousPending } });
    this.#pending({ ...emptyPending(), product, query: product.code, color: { id: first.sku.colorId, name: first.sku.colorName }, fit: { id: first.sku.fitId, name: first.sku.fitName } });
    void this.readPendingSkus(1); return true;
  }
  cancelReplacement(): void {
    const replacement = this.#state.replacement; if (this.#state.disposed || !replacement) return;
    this.closePicker(); this.#cancelSkuRead(); this.#pending(replacement.previousPending); this.#publish({ replacement: null });
  }
  cancelAppend(): void { if (!this.#state.disposed) { this.#appendBasis = null; this.#publish({ appendRequest: null }); } }
  commitPending(confirmAppend = false): boolean {
    const { pending, replacement, draft } = this.#state;
    if (this.#state.disposed || !pending.product || pending.query !== pending.product.code || !pending.color || !pending.fit || pending.phase !== 'ready' || pending.exactTotal === null) return false;
    if (replacement && replacement.originals.some(original => !draft.lines.includes(original))) { this.#publish({ notice: '原行数量已变化，请取消后重新改选。' }); return false; }
    if (replacement && pending.unmapped.length) { this.#publish({ notice: '原规格数量尚未对应到唯一实际规格；请继续读取其他页、调整原行或更换规格。' }); return false; }
    const changes: { sku: CurrentFormSku; quantity: bigint }[] = [];
    try {
      for (const [id, raw] of Object.entries(pending.quantities)) {
        if (raw === '') continue;
        const sku = pending.skus.find(row => row.id === id);
        if (!sku || sku.productId !== pending.product.id || sku.colorId !== pending.color.id || sku.fitId !== pending.fit.id || !/^(?:0|[1-9]\d{0,18})$/.test(raw)) throw Error();
        const count = quantity(raw); if (count < 0n) throw Error(); if (count > 0n) changes.push({ sku, quantity: count });
      }
      if (!changes.length && !replacement) throw Error();
    } catch { this.#publish({ notice: '数量须为范围内的非负整数；至少填写一个正数量，原始输入已保留。' }); return false; }
    const retained = draft.lines.filter(row => !replacement?.originals.includes(row)), duplicates = retained.filter(row => changes.some(change => change.sku.id === row.sku.id));
    if (duplicates.length) {
      if (!confirmAppend) { this.#appendBasis = { draft, pending, replacement }; this.#publish({ appendRequest: { kind: replacement ? 'replace' : 'entry', quantity: changes.reduce((sum, change) => sum + change.quantity, 0n).toString() } }); return false; }
      if (!this.#appendBasis || this.#appendBasis.draft !== draft || this.#appendBasis.pending !== pending || this.#appendBasis.replacement !== replacement) { this.cancelAppend(); this.#publish({ notice: '数量或录入已变化，请重新确认追加。' }); return false; }
    }
    let next = [...retained];
    try {
      for (const change of changes) {
        const previous = next.find(row => row.sku.id === change.sku.id);
        if (previous) { if (!/^[1-9]\d{0,18}$/.test(previous.quantity)) throw Error(); const count = quantity((BigInt(previous.quantity) + change.quantity).toString()); next = next.map(row => row === previous ? { ...row, quantity: count.toString() } : row); }
        else {
          const originals = replacement?.originals.filter(row => row.sku.sizeId === change.sku.sizeId && row.sku.sizeGroupId === change.sku.sizeGroupId) ?? [], original = originals.length === 1 ? originals[0] : undefined;
          next.push({ sku: change.sku, quantity: change.quantity.toString(), product: pending.product, ...(original?.existingLineId ? { existingLineId: original.existingLineId } : {}), ...(original?.sku.id === change.sku.id && original.sourceSnapshot ? { sourceSnapshot: original.sourceSnapshot } : {}) });
        }
      }
      if (next.length > TRANSFER_PREPARE_MAX_LINES) throw Error();
    } catch { this.#publish({ notice: '原行数量无效或已达数量／200个规格上限，输入已保留。' }); return false; }
    this.#cancelSkuRead(); this.closePicker(); const ok = this.#edit({ ...draft, lines: next });
    if (ok) this.#publish({ pending: replacement?.previousPending ?? emptyPending(), replacement: null, appendRequest: null, entry: { product: pending.product, skus: pending.skus, page: pending.page, exactTotal: pending.exactTotal } });
    return ok;
  }
  get canScan(): boolean { return !this.#state.disposed && !!this.#reader.readBarcode && !!this.#state.draft.from && !!this.#state.draft.to; }
  createScanner(): DocumentScanController {
    return new DocumentScanController({ scope: this.#scope, ...(this.#onAccessFailure ? { onAccessFailure: this.#onAccessFailure } : {}),
      target: () => {
        const { from, to } = this.#state.draft;
        return this.canScan && from && to ? { key: String(this.#revision), context: { kind: 'TRANSFER', fromWarehouseId: from.id, toWarehouseId: to.id } } : null;
      },
      resolve: (query, signal) => this.#reader.readBarcode!(query, signal),
      apply: result => {
        const draft = this.#state.draft, existing = draft.lines.find(row => row.sku.id === result.sku.id);
        if (!existing && draft.lines.length >= TRANSFER_PREPARE_MAX_LINES) return { ok: false, message: '本草稿最多 200 个实际规格，未新增明细。' };
        try {
          if (existing && !/^[1-9]\d{0,18}$/.test(existing.quantity)) throw Error();
          const next = existing ? (quantity(existing.quantity) + 1n).toString() : '1'; quantity(next);
          const ok = this.#edit({ ...draft, lines: existing ? draft.lines.map(row => row === existing ? { ...row, quantity: next } : row) : [...draft.lines, { sku: result.sku, quantity: next }] });
          return { ok, message: ok ? `已录入 ${result.sku.skuCode}，数量 ${next}。` : '当前草稿已关闭，未录入。' };
        } catch { return { ok: false, message: '原行数量尚未有效或已达上限，请先修正原行；未覆盖输入。' }; }
      },
    });
  }
  async openPicker(kind: Exclude<TransferProposalPicker, 'SKU'>, search = ''): Promise<void> { await this.#read(kind, search, 1, null); }
  async search(search: string): Promise<void> {
    const picker = this.#state.picker; if (!picker || picker.kind === 'SKU') return;
    await this.#read(picker.kind, search, 1, null);
  }
  async page(page: number): Promise<void> {
    const picker = this.#state.picker;
    if (!picker || picker.phase !== 'ready' || !picker.result || !Number.isSafeInteger(page) || page < 1
      || BigInt(page - 1) * 20n >= picker.result.exactTotal) return;
    await this.#read(picker.kind, picker.search, page, picker.product);
  }
  async retry(): Promise<void> {
    const picker = this.#state.picker; if (picker?.phase === 'error') await this.#read(picker.kind, picker.search, picker.page, picker.product);
  }
  closePicker(): void { this.#cancelRead(); if (!this.#state.disposed) this.#publish({ picker: null }); }
  async #read(kind: TransferProposalPicker, search: string, page: number, product: CurrentFormProduct | null): Promise<void> {
    if (this.#state.disposed) return;
    this.#cancelRead(); const sequence = this.#sequence, request = new AbortController(); this.#request = request;
    const signal = AbortSignal.any([request.signal, this.#scope.signal]);
    this.#publish({ picker: { kind, search, page, product, phase: 'loading', result: null }, notice: null, ...(kind === 'SKU' ? { entry: null } : {}) });
    try {
      const result: CurrentFormPage<Candidate> = kind === 'FROM' || kind === 'TO'
        ? await this.#reader.readTransferWarehouses({ direction: kind, search, page, pageSize: 20 }, signal)
        : kind === 'PRODUCT' ? await this.#reader.readProducts({ context: { kind: 'TRANSFER' }, search, page, pageSize: 20 }, signal)
        : await this.#reader.readProductSkus({ context: { kind: 'TRANSFER' }, productId: product!.id, page, pageSize: 20 }, signal);
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      this.#publish({ picker: { kind, search, page, product, phase: 'ready', result },
        ...(kind === 'SKU' && product ? { entry: { product, skus: result.items as readonly CurrentFormSku[], page, exactTotal: result.exactTotal } } : {}) });
    } catch (error) {
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* Scope already cleared. */ } return; }
      this.#publish({ picker: { kind, search, page, product, phase: 'error', result: null }, notice: '候选读取失败，未改变草稿。可明确重试。' });
    } finally { if (this.#request === request) this.#request = null; }
  }
  /** Selection is confined to the current successfully read page. */
  async select(id: string): Promise<boolean> {
    const picker = this.#state.picker;
    if (this.#state.disposed || picker?.phase !== 'ready') return false;
    const item = picker.result?.items.find(row => row.id === id); if (!item) return false;
    if (picker.kind === 'PRODUCT') { await this.#read('SKU', '', 1, item as CurrentFormProduct); return true; }
    const draft = this.#state.draft;
    if (picker.kind === 'SKU') {
      if (draft.lines.some(row => row.sku.id === id)) { this.#publish({ notice: '该实际规格已在明细中，请修改原行数量。' }); return false; }
      if (draft.lines.length >= TRANSFER_PREPARE_MAX_LINES) { this.#publish({ notice: '本草稿最多选择 200 个实际规格。' }); return false; }
      return this.#edit({ ...draft, lines: [...draft.lines, { sku: item as CurrentFormSku, quantity: '1', ...(picker.product ? { product: picker.product } : {}) }] });
    }
    const selected = item as CurrentTransferWarehouse;
    if ((picker.kind === 'FROM' ? draft.to : draft.from)?.id === id) { this.#publish({ notice: '调出和调入仓库不能相同。' }); return false; }
    this.closePicker(); return this.#edit({ ...draft, ...(picker.kind === 'FROM' ? { from: selected } : { to: selected }) });
  }
  /** Explicit local validation/handoff only. The caller receives proposals, not authority. */
  validate(): TransferProposal | null {
    if (this.#state.disposed) return null;
    if (this.#state.replacement) { this.#publish({ errors: ['请先确认或取消当前行改选。'] }); return null; }
    if (this.#state.pending.product || this.#state.pending.query.trim() || Object.values(this.#state.pending.quantities).some(raw => raw !== '')) { this.#publish({ errors: ['请完成或清除底部尚未完成的录入。'] }); return null; }
    const draft = this.#state.draft, errors: string[] = [];
    try { businessDate(draft.businessDate); } catch { errors.push('请输入有效单据日期。'); }
    if (!draft.from || !draft.to) errors.push('请选择调出和调入仓库。');
    if (draft.from && draft.to && draft.from.id === draft.to.id) errors.push('调出和调入仓库不能相同。');
    if (draft.note.length > TRANSFER_PREPARE_MAX_NOTE_LENGTH) errors.push('备注不能超过 10000 字符。');
    if (!draft.lines.length) errors.push('请至少添加一个实际规格。');
    for (const row of draft.lines) {
      try { if (!/^[1-9]\d{0,18}$/.test(row.quantity) || quantity(row.quantity) <= 0n) throw Error(); }
      catch { errors.push(`${row.sku.productCode} / ${row.sku.colorName} / ${row.sku.fitName} / ${row.sku.sizeName}：数量须为范围内的正整数。`); }
    }
    this.#publish({ errors, notice: errors.length ? '草稿未通过校验，未发送业务命令。' : '本地草稿校验通过；尚未保存。仍需可信准备服务提供已批准编号及原生快照事实。' });
    return errors.length ? null : draft;
  }
  reset(discardConfirmed = false): boolean {
    if (this.#state.disposed || this.#state.dirty && !discardConfirmed) return false;
    this.#cancelRead(); this.#cancelSkuRead(); this.#appendBasis = null; this.#revision++; this.#publish({ draft: empty(), dirty: false, picker: null, entry: null, pending: emptyPending(), replacement: null, appendRequest: null, errors: [], notice: null }); return true;
  }
  cancel(discardConfirmed = false): boolean { if (!this.reset(discardConfirmed)) return false; this.dispose(); return true; }
  /** Route/session owner must dispose on exit; identity invalidation clears all data immediately. */
  readonly dispose = (): void => {
    if (this.#state.disposed) return;
    this.#cancelRead(); this.#cancelSkuRead(); this.#appendBasis = null; this.#scope.signal.removeEventListener('abort', this.dispose);
    this.#publish({ draft: empty(), dirty: false, disposed: true, picker: null, entry: null, pending: emptyPending(), replacement: null, appendRequest: null, errors: [], notice: null }); this.#listeners.clear();
  };
}
