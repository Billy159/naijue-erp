import { TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES, TRANSFER_PREPARE_MAX_LINES, TRANSFER_PREPARE_MAX_NOTE_LENGTH } from '../../../../packages/application/src/transfer-payload-budget.ts';
import type { NativeTransferCreateProposal } from '../../../../packages/application/src/native-transfer-preparation.ts';
import { businessDate, entityId, quantity } from '../../../../packages/domain/src/values.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';
import { TransferCommandWorkspace } from '../transfers/commands/controller.ts';
import type { TransferDraftDto } from '../transfers/commands/contracts.ts';
import { validateTransferDraft, frozenSnapshot } from '../transfers/commands/validation.ts';
import { TransferProposalSession, type TransferProposal } from './transfer-proposal.ts';
export interface TransferCreatePreparation { prepareCreate(proposal: NativeTransferCreateProposal, signal: AbortSignal): Promise<TransferDraftDto> }
export function transferPreparationIntent(proposal: TransferProposal): NativeTransferCreateProposal {
  if (!proposal.from || !proposal.to) throw new TypeError('Select both warehouses.');
  return frozenSnapshot({ businessDate: proposal.businessDate, note: proposal.note === '' ? null : proposal.note,
    fromWarehouseId: proposal.from.id, toWarehouseId: proposal.to.id,
    lines: proposal.lines.map(row => { if (!row.sku) throw new TypeError('Local specifications require native SAVE.'); return { skuId: row.sku.id, quantity: row.quantity }; }) });
}
function checkedIntent(input: NativeTransferCreateProposal): NativeTransferCreateProposal {
  const value = structuredClone(input);
  if (!value || Object.keys(value).sort().join() !== 'businessDate,fromWarehouseId,lines,note,toWarehouseId'
    || value.note !== null && (typeof value.note !== 'string' || value.note.length > TRANSFER_PREPARE_MAX_NOTE_LENGTH)) throw new TypeError('Invalid create proposal.');
  businessDate(value.businessDate); entityId('warehouse', value.fromWarehouseId); entityId('warehouse', value.toWarehouseId);
  if (value.fromWarehouseId === value.toWarehouseId || !Array.isArray(value.lines) || !value.lines.length || value.lines.length > TRANSFER_PREPARE_MAX_LINES) throw new TypeError('Invalid create proposal.');
  const ids = new Set<string>();
  for (const row of value.lines) {
    if (!row || Object.keys(row).sort().join() !== 'quantity,skuId' || ids.has(row.skuId) || !/^[1-9]\d{0,18}$/.test(row.quantity) || quantity(row.quantity) <= 0n) throw new TypeError('Invalid create proposal.');
    entityId('sku', row.skuId); ids.add(row.skuId);
  }
  return frozenSnapshot(value);
}
function checkedPreparation(value: unknown, intent: NativeTransferCreateProposal): TransferDraftDto {
  const draft = validateTransferDraft(value), h = draft.header;
  if (h.businessDate !== intent.businessDate || h.note !== intent.note || h.fromWarehouseId !== intent.fromWarehouseId || h.toWarehouseId !== intent.toWarehouseId
    || draft.lines.length !== intent.lines.length || draft.lines.some((row, index) => row.skuId !== intent.lines[index]!.skuId || row.quantity !== intent.lines[index]!.quantity
      || row.lineNo !== index + 1 || typeof row.snapshot.barcode !== 'string' || !row.snapshot.barcode.trim())) throw new TypeError('Preparation does not match the selected intent.');
  return draft;
}
/** Preparation endpoint is read-only: no document, receipt or inventory is written.
 * Native SAVE still uses its separate uncertain-write-aware command client. */
export function createTransferPreparationHttpClient(options: HttpQueryOptions): TransferCreatePreparation {
  const http = createHttpJsonQuery({ ...options, maxResponseBytes: Math.min(options.maxResponseBytes ?? TRANSFER_PREPARED_RESPONSE_MAX_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES) }, TRANSFER_PREPARE_MAX_REQUEST_BYTES);
  return Object.freeze({ prepareCreate(input: NativeTransferCreateProposal, signal: AbortSignal) {
    const intent = checkedIntent(input);
    return http.post('/transfers/prepare-create', intent, signal, value => checkedPreparation(value, intent));
  } });
}
export { createTransferExistingPreparationHttpClient } from './existing-document-preparation.ts';
export type { TransferExistingPreparation } from './existing-document-preparation.ts';
export interface TransferCreateSnapshot { readonly preparing: boolean; readonly notice: string | null; readonly disposed: boolean; readonly nativeHandoff: boolean }
/** One explicit click hands the validated proposal through native preparation to
 * the existing SAVE lifecycle. The workspace owns uncertain outcomes thereafter. */
export class TransferNewDocumentSession {
  readonly proposal: TransferProposalSession; readonly workspace: TransferCommandWorkspace;
  readonly #scope: ReadScope; readonly #preparation: TransferCreatePreparation; readonly #onAccessFailure: ((error: HttpQueryError) => void) | undefined;
  readonly #listeners = new Set<() => void>(); #unsubscribe: () => void;
  #request: AbortController | null = null; #sequence = 0;
  #state: TransferCreateSnapshot = Object.freeze({ preparing: false, notice: null, disposed: false, nativeHandoff: false });
  constructor(options: { readonly proposal: TransferProposalSession; readonly workspace: TransferCommandWorkspace; readonly scope: ReadScope; readonly preparation: TransferCreatePreparation; readonly onAccessFailure?: (error: HttpQueryError) => void }) {
    if (!options.workspace.matchesIdentity(options.scope) || !options.proposal.matchesIdentity(options.scope)) throw new TypeError('Preparation and commands must share current identity.');
    this.proposal = options.proposal; this.workspace = options.workspace; this.#scope = options.scope; this.#preparation = options.preparation; this.#onAccessFailure = options.onAccessFailure;
    let previous = this.proposal.getSnapshot();
    this.#unsubscribe = this.proposal.subscribe(() => {
      const state = this.proposal.getSnapshot();
      if (state.disposed) this.dispose();
      else if (state.draft !== previous.draft || state.pending !== previous.pending || state.replacement !== previous.replacement) { previous = state; this.cancelPreparation(); }
    });
    this.#scope.signal.addEventListener('abort', this.dispose, { once: true });
  }
  readonly getSnapshot = (): TransferCreateSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #publish(patch: Partial<TransferCreateSnapshot>): void { this.#state = Object.freeze({ ...this.#state, ...patch }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* preserve cleanup */ } } }
  cancelPreparation(): void { this.#sequence++; this.#request?.abort(); this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false, notice: null }); }
  async save(): Promise<boolean> {
    const command = this.workspace.getSnapshot(), retryRejectedCreate = command.write.phase === 'rejected' && command.write.command?.action === 'SAVE' && command.editor?.mode === 'CREATE';
    if (this.#state.disposed || this.#state.preparing || !this.#scope.active || !retryRejectedCreate && (this.#state.nativeHandoff || command.editor || !this.workspace.canLeave())) return false;
    if (retryRejectedCreate && !(this.proposal.hasSpecificationInputs ? this.proposal.saveProposal(null) : this.proposal.validate())) return false;
    if (retryRejectedCreate) {
      if (!this.workspace.discardEditor()) return false;
      this.#publish({ nativeHandoff: false, notice: null });
    }
    if (this.proposal.hasSpecificationInputs) {
      const intent = this.proposal.saveProposal(null); if (!intent) return false;
      const captured = this.proposal.getSnapshot(), sequence = ++this.#sequence, request = new AbortController(); this.#request = request;
      this.#publish({ preparing: true, notice: null });
      try {
        return await this.workspace.submitProposal(intent, () => !this.#state.disposed && this.#scope.active && !request.signal.aborted && sequence === this.#sequence
          && this.proposal.getSnapshot().draft === captured.draft && this.proposal.getSnapshot().pending === captured.pending && this.proposal.getSnapshot().matrixQuantities === captured.matrixQuantities && this.proposal.getSnapshot().replacement === captured.replacement);
      } finally {
        if (this.#request === request) this.#request = null;
        // Local cancellation may already have cleared #request. The command
        // owner distinguishes not-sent rejection from a dispatched unknown.
        if (!this.#request && !this.#state.disposed) this.#publish({ preparing: false, nativeHandoff: !!this.workspace.getSnapshot().editor || this.workspace.hasUnresolvedWrite, notice: this.workspace.getSnapshot().write.phase === 'rejected' ? this.workspace.getSnapshot().notice : null });
      }
    }
    const proposal = this.proposal.validate(); if (!proposal) return false;
    const intent = checkedIntent(transferPreparationIntent(proposal)), sequence = ++this.#sequence, request = new AbortController(); this.#request = request;
    this.#publish({ preparing: true, notice: '正在读取原生新单准备；尚未发送保存命令。' });
    try {
      const prepared = await this.#preparation.prepareCreate(intent, AbortSignal.any([request.signal, this.#scope.signal]));
      if (request.signal.aborted || sequence !== this.#sequence || this.#state.disposed || !this.#scope.active || this.proposal.getSnapshot().draft !== proposal) return false;
      const draft = checkedPreparation(prepared, intent);
      if (!this.workspace.openCreate(draft)) { this.#publish({ notice: '已有未解决单据，未发送新的保存命令。' }); return false; }
      this.#publish({ preparing: false, notice: null, nativeHandoff: true });
      return await this.workspace.submit('SAVE');
    } catch (error) {
      if (request.signal.aborted || sequence !== this.#sequence || this.#state.disposed || !this.#scope.active) return false;
      if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) { this.#scope.dispose(); try { this.#onAccessFailure?.(error); } catch { /* Scope already cleared. */ } return false; }
      this.#publish({ notice: '原生新单准备失败或不匹配，未发送保存命令；草稿仍保留。请检查服务或当前SKU主条码。' }); return false;
    } finally { if (this.#request === request) { this.#request = null; if (!this.#state.disposed) this.#publish({ preparing: false }); } }
  }
  /** Never clears an uncertain native write; workspace/session owner retains it. */
  readonly dispose = (): void => {
    if (this.#state.disposed) return;
    this.cancelPreparation(); this.#unsubscribe(); this.#scope.signal.removeEventListener('abort', this.dispose);
    this.#publish({ disposed: true, preparing: false, notice: null }); this.#listeners.clear();
  };
}
