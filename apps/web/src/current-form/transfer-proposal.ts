import { TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/transfer-payload-budget.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import { businessDate, quantity } from '../../../../packages/domain/src/values.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';

export type TransferProposalReader = Pick<ReturnType<typeof createCurrentFormHttpReader>, 'readTransferWarehouses' | 'readProducts' | 'readProductSkus'>;
export type TransferProposalPicker = 'FROM' | 'TO' | 'PRODUCT' | 'SKU';
type Candidate = CurrentTransferWarehouse | CurrentFormProduct | CurrentFormSku;
export interface TransferProposal {
  readonly businessDate: string; readonly note: string;
  readonly from: CurrentTransferWarehouse | null; readonly to: CurrentTransferWarehouse | null;
  readonly lines: readonly { readonly sku: CurrentFormSku; readonly quantity: string }[];
}
export interface TransferProposalSnapshot {
  readonly draft: TransferProposal; readonly dirty: boolean; readonly disposed: boolean;
  readonly errors: readonly string[]; readonly notice: string | null;
  readonly picker: { readonly kind: TransferProposalPicker; readonly search: string; readonly page: number;
    readonly product: CurrentFormProduct | null; readonly phase: 'loading' | 'ready' | 'error';
    readonly result: CurrentFormPage<Candidate> | null } | null;
}
const empty = (): TransferProposal => ({ businessDate: '', note: '', from: null, to: null, lines: [] });
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** A local unsaved proposal, NOT a TransferDraftDto. No document/line number,
 * barcode snapshot, authority, write request or optimistic success is invented.
 * Host must revalidate all facts through trusted preparation before native SAVE. */
export class TransferProposalSession {
  readonly #scope: ReadScope; readonly #reader: TransferProposalReader; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined;
  readonly #listeners = new Set<() => void>();
  #request: AbortController | null = null; #sequence = 0;
  #state: TransferProposalSnapshot = freeze({ draft: empty(), dirty: false, disposed: false, errors: [], notice: null, picker: null });
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
  #publish(patch: Partial<TransferProposalSnapshot>): void {
    this.#state = freeze({ ...this.#state, ...patch });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Other subscribers still receive invalidation. */ } }
  }
  #cancelRead(): void { this.#sequence++; this.#request?.abort(); this.#request = null; }
  #edit(draft: TransferProposal): boolean {
    if (this.#state.disposed) return false;
    this.#publish({ draft, dirty: true, errors: [], notice: null }); return true;
  }
  setHeader(patch: Pick<Partial<TransferProposal>, 'businessDate' | 'note'>): boolean {
    return this.#edit({ ...this.#state.draft, ...patch });
  }
  setQuantity(skuId: string, value: string): boolean {
    if (!this.#state.draft.lines.some(row => row.sku.id === skuId)) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.map(row => row.sku.id === skuId ? { ...row, quantity: value } : row) });
  }
  removeLine(skuId: string): boolean {
    if (!this.#state.draft.lines.some(row => row.sku.id === skuId)) return false;
    return this.#edit({ ...this.#state.draft, lines: this.#state.draft.lines.filter(row => row.sku.id !== skuId) });
  }
  async openPicker(kind: Exclude<TransferProposalPicker, 'SKU'>): Promise<void> { await this.#read(kind, '', 1, null); }
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
    this.#publish({ picker: { kind, search, page, product, phase: 'loading', result: null }, notice: null });
    try {
      const result: CurrentFormPage<Candidate> = kind === 'FROM' || kind === 'TO'
        ? await this.#reader.readTransferWarehouses({ direction: kind, search, page, pageSize: 20 }, signal)
        : kind === 'PRODUCT' ? await this.#reader.readProducts({ context: { kind: 'TRANSFER' }, search, page, pageSize: 20 }, signal)
        : await this.#reader.readProductSkus({ context: { kind: 'TRANSFER' }, productId: product!.id, page, pageSize: 20 }, signal);
      if (signal.aborted || sequence !== this.#sequence || this.#state.disposed) return;
      this.#publish({ picker: { kind, search, page, product, phase: 'ready', result } });
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
      return this.#edit({ ...draft, lines: [...draft.lines, { sku: item as CurrentFormSku, quantity: '1' }] });
    }
    const selected = item as CurrentTransferWarehouse;
    if ((picker.kind === 'FROM' ? draft.to : draft.from)?.id === id) { this.#publish({ notice: '调出和调入仓库不能相同。' }); return false; }
    this.closePicker(); return this.#edit({ ...draft, ...(picker.kind === 'FROM' ? { from: selected } : { to: selected }) });
  }
  /** Explicit local validation/handoff only. The caller receives proposals, not authority. */
  validate(): TransferProposal | null {
    if (this.#state.disposed) return null;
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
    this.#cancelRead(); this.#publish({ draft: empty(), dirty: false, picker: null, errors: [], notice: null }); return true;
  }
  cancel(discardConfirmed = false): boolean { if (!this.reset(discardConfirmed)) return false; this.dispose(); return true; }
  /** Route/session owner must dispose on exit; identity invalidation clears all data immediately. */
  readonly dispose = (): void => {
    if (this.#state.disposed) return;
    this.#cancelRead(); this.#scope.signal.removeEventListener('abort', this.dispose);
    this.#publish({ draft: empty(), dirty: false, disposed: true, picker: null, errors: [], notice: null }); this.#listeners.clear();
  };
}
