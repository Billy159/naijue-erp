import type { NativeTransferExistingProposal } from '../../../../packages/application/src/native-transfer-preparation.ts';
import type { CurrentFormProduct } from '../../../../packages/application/src/current-form-ports.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { createCurrentFormHttpReader } from './http-reader.ts';
import type { TransferDetailDto } from '../transfers/contracts.ts';
import type { TransferCommandWorkspace } from '../transfers/commands/controller.ts';
import type { TransferDraftDto, TransferFormInput } from '../transfers/commands/contracts.ts';
import { frozenSnapshot } from '../transfers/commands/validation.ts';
import { checkedExistingTransferPreparation, type TransferExistingPreparation } from './existing-document-preparation.ts';
import { TransferProposalSession, type TransferProposal } from './transfer-proposal.ts';

type Reader = ReturnType<typeof createCurrentFormHttpReader>;
export interface TransferExistingDocumentSnapshot { readonly phase: 'idle' | 'loading' | 'ready' | 'unavailable'; readonly proposal: TransferProposalSession | null; readonly preparing: boolean; readonly notice: string | null; readonly disposed: boolean }
/** Original saved pointers belong to the original native owner. Matrix rows
 * bind actual SKU reads; duplicate/ambiguous original cells stay native rows. */
export class TransferExistingDocumentSession {
  readonly owner: TransferCommandWorkspace; #original: TransferDetailDto | null;
  get original(): TransferDetailDto | null { return this.#original; }
  readonly #scope: ReadScope; readonly #reader: Reader; readonly #preparation: TransferExistingPreparation;
  #input: TransferFormInput | null; #inputReference: TransferFormInput | null; readonly #initialDirty: boolean;
  readonly #listeners = new Set<() => void>(); #unsubscribe: (() => void) | null = null; #request: AbortController | null = null; #sequence = 0;
  #state: TransferExistingDocumentSnapshot = Object.freeze({ phase: 'idle', proposal: null, preparing: false, notice: null, disposed: false });
  constructor(options: { readonly owner: TransferCommandWorkspace; readonly scope: ReadScope; readonly reader: Reader; readonly preparation: TransferExistingPreparation; readonly original: TransferDetailDto; readonly input: TransferFormInput; readonly dirty: boolean }) {
    this.owner = options.owner; this.#original = options.original; this.#reader = options.reader; this.#preparation = options.preparation; this.#input = frozenSnapshot(options.input); this.#inputReference = options.input; this.#initialDirty = options.dirty;
    this.#scope = new ReadScope(options.scope.identity, `${options.scope.routeInstanceId}:existing-transfer:${options.original.document.header.id}:${options.original.document.header.version}`, options.original.document.header.id, () => {});
    const abort = () => this.dispose(); options.scope.signal.addEventListener('abort', abort, { once: true }); this.#scope.signal.addEventListener('abort', () => options.scope.signal.removeEventListener('abort', abort), { once: true }); if (!options.scope.active) this.dispose();
  }
  readonly getSnapshot = (): TransferExistingDocumentSnapshot => this.#state;
  readonly subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get hasDirtyDraft(): boolean { const state = this.#state.proposal?.getSnapshot(); return !this.#state.disposed && this.owner.getSnapshot().write.phase !== 'committed' && !!state && (state.dirty || !!state.replacement || !!state.pending.product || !!state.pending.query.trim() || Object.values(state.pending.quantities).some(raw => raw !== '')); }
  canLeave(): boolean { return this.owner.getSnapshot().write.phase === 'committed' || !this.#state.preparing && !this.hasDirtyDraft; }
  async initialize(): Promise<void> {
    if (this.#state.disposed || this.#state.phase !== 'idle' || !this.#input || !this.#original) return;
    const document = this.#original.document, input = this.#input;
    if (this.#original.stockBasis !== 'RUNTIME_LEDGER' || document.header.status !== 'DRAFT' || !document.lines.length || document.lines.length > 200 || new Set(document.lines.map(row => row.skuId)).size !== document.lines.length || Object.keys(input.quantities).length !== document.lines.length || document.lines.some(row => typeof input.quantities[row.id] !== 'string')) { this.#unavailable(); return; }
    const request = new AbortController(), sequence = ++this.#sequence; this.#request = request; this.#publish({ phase: 'loading' });
    try {
      const ids = document.lines.map(row => row.skuId), rows = await this.#reader.readSkuBatch({ context: { kind: 'TRANSFER' }, skuIds: ids }, AbortSignal.any([request.signal, this.#scope.signal]));
      if (!this.#current(sequence, request)) return;
      if (this.owner.getSnapshot().editor?.input !== this.#inputReference) { this.#unavailable(); return; }
      if (rows.length !== ids.length || rows.some((row, index) => row.id !== ids[index]) || new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Incomplete actual saved transfer SKU relation.');
      const header = document.header, names = this.#original.references;
      const draft: TransferProposal = { businessDate: input.businessDate, note: input.note, from: { id: header.fromWarehouseId, name: names.fromWarehouseName ?? '仓库名称未提供' }, to: { id: header.toWarehouseId, name: names.toWarehouseName ?? '仓库名称未提供' }, lines: document.lines.map((row, index) => { const sku = rows[index]!, product: CurrentFormProduct = { id: sku.productId, code: sku.productCode, name: sku.productName, retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' }; return { sku, product, quantity: input.quantities[row.id]!, existingLineId: row.id, sourceSnapshot: row.snapshot }; }) };
      const proposal = new TransferProposalSession(this.#scope, this.#reader, error => { if (error.kind === 'unauthenticated') this.owner.expireExistingIdentity(); });
      if (!proposal.initializeFromSaved(draft, this.#initialDirty)) { proposal.dispose(); this.#unavailable(); return; }
      let previous = proposal.getSnapshot();
      this.#unsubscribe = proposal.subscribe(() => { const current = proposal.getSnapshot(); if (current.disposed) { this.dispose(); return; } if (current.draft !== previous.draft || current.pending !== previous.pending || current.replacement !== previous.replacement) { previous = current; this.cancelPreparation(); } else this.#publish({}); });
      this.#publish({ phase: 'ready', proposal, notice: null });
    } catch (error) { if (!this.#current(sequence, request)) return; if (error instanceof HttpQueryError && error.kind === 'unauthenticated') this.owner.expireExistingIdentity(); else this.#unavailable(); }
    finally { if (this.#request === request) this.#request = null; }
  }
  cancelPreparation(): void { this.#sequence++; this.#request?.abort(); this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false, notice: null }); }
  async save(): Promise<boolean> {
    const proposal = this.#state.proposal;
    if (this.#state.disposed || this.#state.phase !== 'ready' || this.#state.preparing || !proposal || !this.owner.editableExistingProposal) return false;
    if (!this.hasDirtyDraft && !this.owner.hasDirtyDraft) { this.#publish({ notice: '内容未改变，无需保存。' }); return false; }
    const value = proposal.validate(); if (!value || !value.from || !value.to || !this.#original) return false;
    const originalIds = new Set<string>(this.#original.document.lines.map(row => row.id));
    if (value.lines.some(row => row.existingLineId !== undefined && !originalIds.has(row.existingLineId))) { this.#publish({ notice: '原行关系已变化，输入已保留；未发送保存。' }); return false; }
    const intent: NativeTransferExistingProposal = frozenSnapshot({ transferId: this.#original.document.header.id, expectedVersion: this.#original.document.header.version, businessDate: value.businessDate, note: value.note === (this.#original.document.header.note ?? '') ? this.#original.document.header.note : value.note, fromWarehouseId: value.from.id, toWarehouseId: value.to.id, lines: value.lines.map(row => ({ existingLineId: row.existingLineId ?? null, skuId: row.sku.id, quantity: row.quantity })) });
    const request = new AbortController(), sequence = ++this.#sequence; this.#request = request; const captured = proposal.getSnapshot(), ownerInput = this.owner.getSnapshot().editor?.input;
    this.#publish({ preparing: true, notice: '正在核实旧单资料，尚未发送保存。' });
    const stillCurrent = () => this.#current(sequence, request) && proposal.getSnapshot().draft === captured.draft && proposal.getSnapshot().pending === captured.pending && proposal.getSnapshot().replacement === captured.replacement;
    try {
      const response = checkedExistingTransferPreparation(await this.#preparation.prepareExisting(intent, AbortSignal.any([request.signal, this.#scope.signal])), intent);
      if (!stillCurrent() || this.owner.getSnapshot().editor?.input !== ownerInput || !this.owner.editableExistingProposal) return false;
      this.#validateOriginalFacts(response.draft, intent);
      return await this.owner.applyExistingPrepared(this, response, ownerInput ?? null, stillCurrent);
    } catch (error) { if (!stillCurrent()) return false; if (error instanceof HttpQueryError && error.kind === 'unauthenticated') this.owner.expireExistingIdentity(); else this.#publish({ notice: error instanceof HttpQueryError && error.kind === 'forbidden' ? '本次提案无权准备，原输入已保留；未采用草稿，也未发送保存。' : '旧单资料准备未完成，输入已保留；请处理资料或版本问题后明确重试。' }); return false; }
    finally { if (this.#request === request) { this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false }); } }
  }
  markUnchanged(): void { const proposal = this.#state.proposal; if (proposal) proposal.markUnchanged(proposal.getSnapshot().draft); this.#publish({ notice: '内容未改变，无需保存。' }); }
  #validateOriginalFacts(draft: TransferDraftDto, intent: NativeTransferExistingProposal): void {
    if (draft.header.number !== this.#original!.document.header.number) throw new TypeError('Existing transfer number changed.');
    const lines = new Map<string, TransferDetailDto['document']['lines'][number]>(this.#original!.document.lines.map(row => [row.id, row]));
    draft.lines.forEach((row, index) => { const selected = intent.lines[index]!, original = selected.existingLineId === null ? undefined : lines.get(selected.existingLineId); if (selected.existingLineId !== null && !original) throw new TypeError('Foreign original line pointer.'); if (original?.skuId === selected.skuId) { if (row.id !== original.id || (['productCode', 'productName', 'colorName', 'fitName', 'sizeName', 'barcode'] as const).some(key => row.snapshot[key] !== original.snapshot[key])) throw new TypeError('Retained transfer identity/snapshot changed.'); } else if (lines.has(row.id)) throw new TypeError('New transfer row reused old identity.'); });
  }
  #unavailable(): void { this.#publish({ phase: 'unavailable', notice: '原单实际规格缺失或原行不能唯一对应矩阵，保留原编辑页；不合并原行，新增和改选暂不可用。' }); }
  #current(sequence: number, request: AbortController): boolean { return !this.#state.disposed && this.#scope.active && sequence === this.#sequence && this.#request === request && !request.signal.aborted; }
  #publish(patch: Partial<TransferExistingDocumentSnapshot>): void { this.#state = Object.freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* owner cleanup still runs */ } } }
  dispose(): void { if (this.#state.disposed) return; this.#sequence++; this.#request?.abort(); this.#request = null; this.#unsubscribe?.(); this.#unsubscribe = null; this.#original = null; this.#input = null; this.#inputReference = null; const proposal = this.#state.proposal; this.#publish({ disposed: true, preparing: false, proposal: null, notice: null }); proposal?.dispose(); this.#scope.dispose(); this.#listeners.clear(); }
}
