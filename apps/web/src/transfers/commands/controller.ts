import { HttpQueryError } from '../../transport/http-query.ts';
import { TransferExistingDocumentSession } from '../../current-form/transfer-existing-document.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
import { transferDetailResponse } from '../response-validation.ts';
import type { TransferDetailDto } from '../contracts.ts';
import { TransferCommandError, type TransferCommandDto, type TransferCommandEditor, type TransferCommandReceiptDto, type TransferCommandResultDto,
  type TransferCommandSnapshot, type TransferCommandWorkspaceOptions, type TransferCommandWriteState, type TransferDraftDto, type TransferFormInput } from './contracts.ts';
import { draftFromTransferDetail, frozenSnapshot, validRequestKey, validTransferId, validateTransferCommand, validateTransferDraft, validateTransferReceipt, validateTransferResult, inputFromTransferDraft, draftFromTransferInput } from './validation.ts';

const idle = (): TransferCommandWriteState => Object.freeze({ phase: 'idle', command: null, result: null, receipt: null, recovery: 'unqueried', error: null });
const unresolved = (write: TransferCommandWriteState) => ['submitting', 'checking', 'replaying', 'uncertain'].includes(write.phase);
const busy = (write: TransferCommandWriteState) => ['submitting', 'checking', 'replaying'].includes(write.phase);
function safeReadError(error: unknown): TransferCommandError {
  if (error instanceof TransferCommandError) return error;
  if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) return new TransferCommandError(error.kind as 'unauthenticated' | 'forbidden', error.code, 'read', error.status);
  return new TransferCommandError('server', 'DETAIL_READ_FAILED', 'read');
}

/** One bounded, session-owned document workspace. The host retains it across route
 * detach and disposes on identity/permission change. No reads at construction. */
export class TransferCommandWorkspace {
  readonly #options: TransferCommandWorkspaceOptions;
  readonly #listeners = new Set<() => void>();
  readonly #usedKeys = new Set<string>();
  #inputBaseline: string | null = null;
  #existing: TransferExistingDocumentSession | null = null; #existingUnsubscribe: (() => void) | null = null;
  #mutationRevision = 0;
  #state: TransferCommandSnapshot = Object.freeze({ editor: null, write: idle(), stale: false, disposed: false, notice: null });
  #baseline: string | null = null;
  #stockBasis: TransferDetailDto['stockBasis'] | null = null;
  #knownDocument: Pick<TransferCommandResultDto, 'version' | 'status'> | null = null;
  #generation = 0;
  #read: AbortController | null = null;
  #write: AbortController | null = null;
  #writeInvoked = false;
  readonly #abort = () => this.dispose();
  constructor(options: TransferCommandWorkspaceOptions) {
    if (!options?.scope?.active || typeof options.client?.execute !== 'function' || typeof options.client.receipt !== 'function'
      || typeof options.reader?.readDetail !== 'function' || typeof options.newRequestKey !== 'function' || typeof options.onAccessFailure !== 'function') throw new TypeError('Explicit current transfer command workspace dependencies are required.');
    this.#options = Object.freeze({ ...options }); options.scope.signal.addEventListener('abort', this.#abort, { once: true });
  }
  readonly getSnapshot = (): TransferCommandSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { if (this.#state.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  /** A view may mark previously-read list facts stale; this is not a DTO update. */
  get mutationRevision(): number { return this.#mutationRevision; }
  matchesIdentity(scope: import('../../loading/read-scope.ts').ReadScope): boolean {
    const owner = this.#options.scope.identity, target = scope.identity;
    return this.#active() && scope.active && owner.accountId === target.accountId && owner.sessionRevision === target.sessionRevision && owner.permissionRevision === target.permissionRevision;
  }
  get hasUnresolvedWrite(): boolean { return unresolved(this.#state.write); }
  get #nativeDirty(): boolean {
    const editor = this.#state.editor;
    return !!editor?.draft && this.#state.write.phase !== 'committed' && (editor.mode === 'CREATE' || JSON.stringify(editor.draft) !== this.#baseline || JSON.stringify(editor.input) !== this.#inputBaseline);
  }
  get hasDirtyDraft(): boolean { return this.#nativeDirty || this.#existing?.hasDirtyDraft === true; }
  canLeave(): boolean { return !this.hasUnresolvedWrite && !this.hasDirtyDraft && this.#existing?.canLeave() !== false; }
  get canUseExistingProposal(): boolean { const editor = this.#state.editor; return !!this.#options.existingPreparation && !!this.#options.existingReader && this.#active() && editor?.mode === 'EXISTING' && !!editor.detail && !!editor.draft && !!editor.input && editor.detail.stockBasis === 'RUNTIME_LEDGER' && editor.detail.document.header.status === 'DRAFT'; }
  get editableExistingProposal(): boolean { const { editor, write, stale } = this.#state; return this.#active() && !!editor?.draft && !!editor.input && editor.phase === 'ready' && !editor.current && !stale && !unresolved(write) && write.phase !== 'committed' && editor.detail?.stockBasis === 'RUNTIME_LEDGER' && editor.detail.document.header.status === 'DRAFT'; }
  get existingDocument(): TransferExistingDocumentSession | null { return this.#existing; }
  prepareExistingDocument(): TransferExistingDocumentSession | null {
    const editor = this.#state.editor;
    if (this.#existing && this.#existing.original === editor?.detail && !this.#existing.getSnapshot().disposed) return this.#existing;
    if (!this.canUseExistingProposal || !this.editableExistingProposal || !editor?.detail || !editor.input) return null;
    const dirty = this.hasDirtyDraft; this.#clearExisting(); const model = new TransferExistingDocumentSession({ owner: this, scope: this.#options.scope, reader: this.#options.existingReader!, preparation: this.#options.existingPreparation!, original: editor.detail, input: editor.input, dirty });
    this.#existing = model; this.#existingUnsubscribe = model.subscribe(() => { if (this.#existing === model && this.#active()) this.#publish({ ...this.#state }); }); return model;
  }
  expireExistingIdentity(): void { this.#access(new TransferCommandError('unauthenticated', 'UNAUTHENTICATED', 'read', 401)); }
  async applyExistingPrepared(model: TransferExistingDocumentSession, response: { readonly expectedVersion: number; readonly draft: TransferDraftDto }, originalInput: TransferFormInput | null, stillCurrent: () => boolean): Promise<boolean> {
    const editor = this.#state.editor;
    if (this.#existing !== model || !this.editableExistingProposal || !editor?.detail || editor.detail !== model.original || response.expectedVersion !== editor.detail.document.header.version || editor.input !== originalInput || !stillCurrent()) return false;
    if (!this.replaceDraft(response.draft) || !stillCurrent()) return false;
    if (!this.#nativeDirty) { if (stillCurrent()) model.markUnchanged(); this.#notice('内容未改变，无需保存。'); return false; }
    const preparedInput = this.#state.editor?.input, preparedDraft = this.#state.editor?.draft;
    return this.#submit('SAVE', () => this.#existing === model && stillCurrent() && this.#state.editor?.input === preparedInput && this.#state.editor?.draft === preparedDraft && this.#state.editor?.detail === model.original);
  }
  /** Complete current-reference/number preparation is mandatory. No picker or number fallback. */
  openCreate(value: TransferDraftDto): boolean {
    if (!this.#canReplace()) return false;
    let draft: TransferDraftDto; try { draft = validateTransferDraft(value); } catch { this.#notice('新单草稿不符合现有合同，未发送请求。'); return false; }
    this.#clearExisting(); this.#detachRead(); this.#baseline = null; this.#inputBaseline = null; this.#stockBasis = 'RUNTIME_LEDGER'; this.#knownDocument = null;
    this.#publish({ editor: Object.freeze({ mode: 'CREATE', transferId: draft.header.id, phase: 'ready', detail: null, draft, input: inputFromTransferDraft(draft), inputError: false, current: null, readError: null }), write: idle(), stale: false, disposed: false, notice: null }); return true;
  }
  async openExisting(transferId: string): Promise<boolean> {
    if (!validTransferId(transferId) || !this.#canReplace()) return false;
    this.#clearExisting(); this.#detachRead(); this.#baseline = null; this.#inputBaseline = null; this.#stockBasis = null; this.#knownDocument = null;
    this.#publish({ editor: Object.freeze({ mode: 'EXISTING', transferId, phase: 'ready', detail: null, draft: null, input: null, inputError: false, current: null, readError: null }), write: idle(), stale: false, disposed: false, notice: null });
    return this.#loadDetail(false);
  }
  /** Never edits approved/void/history. Current warehouse/SKU checks remain server-authoritative. */
  replaceDraft(value: TransferDraftDto): boolean {
    const editor = this.#state.editor;
    if (!this.#active() || !editor || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current
      || editor.detail && (editor.detail.stockBasis !== 'RUNTIME_LEDGER' || editor.detail.document.header.status !== 'DRAFT')) return false;
    let draft: TransferDraftDto; try { draft = validateTransferDraft(value); } catch { this.#notice('草稿不符合现有合同，输入未提交。'); return false; }
    if (draft.header.id !== editor.transferId) return false;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, draft, input: inputFromTransferDraft(draft), inputError: false }), notice: null }); return true;
  }
  updateInput(input: TransferFormInput): boolean {
    const editor = this.#state.editor;
    if (!this.#active() || !editor?.draft || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current || this.#state.stale) return false;
    let draft: TransferDraftDto;
    try { draft = draftFromTransferInput(editor.draft, input); }
    catch { this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, input: frozenSnapshot(input), inputError: true }), notice: '请输入有效日期和正整数调拨数量，非法输入未发送。' }); return false; }
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, draft, input: frozenSnapshot(input), inputError: false }), notice: null }); return true;
  }
  submit(action: TransferCommandDto['action']): Promise<boolean> { return action === 'SAVE' && this.#existing?.getSnapshot().phase === 'ready' ? this.#existing.save() : this.#submit(action); }
  async #submit(action: TransferCommandDto['action'], beforeDispatch?: () => boolean): Promise<boolean> {
    const editor = this.#state.editor;
    if (!this.#active() || !editor || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current || this.#state.stale) return false;
    const detail = editor.detail, header = detail?.document.header;
    if (detail?.stockBasis === 'CUTOFF_HISTORY') { this.#notice('历史单据尚未开放基线感知写入，未发送请求。'); return false; }
    if (header && header.version >= Number.MAX_SAFE_INTEGER) return false;
    if (action === 'SAVE') {
      if (!editor.draft || editor.inputError || header && header.status !== 'DRAFT' || editor.mode === 'EXISTING' && !header || editor.mode === 'EXISTING' && !this.hasDirtyDraft) return false;
    } else {
      if (!header || header.status !== (action === 'UNAPPROVE' ? 'APPROVED' : 'DRAFT')) return false;
      // Mutations must apply to the persisted document, never silently save edits.
      if (this.hasDirtyDraft) { this.#notice('请先保存草稿并重新读取，再执行状态操作。'); return false; }

    }
    let command: TransferCommandDto;
    try {
      const requestKey = this.#options.newRequestKey();
      // Bounded key tombstones avoid accidental reuse across cleared editors. At the
      // technical session limit, no further operation is generated; recovery works.
      if (!validRequestKey(requestKey) || this.#usedKeys.has(requestKey) || this.#usedKeys.size >= 1024) throw new Error();
      command = validateTransferCommand(action === 'SAVE' ? { action, requestKey, expectedVersion: header?.version ?? null, draft: editor.draft! }
        : { action, requestKey, expectedVersion: header!.version, transferId: editor.transferId });
      this.#usedKeys.add(requestKey);
    } catch { this.#notice('无法准备新的操作身份或合同，未发送请求。'); return false; }
    return this.#send(command, false, beforeDispatch);
  }
  async checkReceipt(): Promise<boolean> {
    const original = this.#state.write;
    if (!this.#active() || original.phase !== 'uncertain' || !original.command) return false;
    const generation = ++this.#generation, request = new AbortController(); this.#write = request;
    this.#publish({ ...this.#state, write: Object.freeze({ ...original, phase: 'checking', error: null }) });
    if (!this.#current(generation, request, 'write')) return false;
    try {
      const receipt = validateTransferReceipt(await this.#options.client.receipt(original.command, AbortSignal.any([this.#options.scope.signal, request.signal])), original.command);
      if (!this.#current(generation, request, 'write')) return false;
      this.#accept(receipt.result, original.command, receipt); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'write')) return false;
      const safe = safeReadError(error); this.#access(safe); if (!this.#active()) return false;
      const absent = safe.kind === 'not-found' && safe.code === 'RECEIPT_NOT_FOUND';
      this.#publish({ ...this.#state, write: Object.freeze({ ...original, phase: 'uncertain', error: safe, recovery: absent ? 'absent' : 'failed' }),
        notice: absent ? '暂未查到回执，不代表原操作未提交。请保留原请求核实。' : '回执暂不可确认，原操作仍不确定。' }); return false;
    } finally { if (this.#write === request) this.#write = null; }
  }
  /** User action only. Byte-equivalent prepared payload, same key/target/CAS. */
  replayOriginal(): Promise<boolean> { const write = this.#state.write; return this.#active() && write.phase === 'uncertain' && write.command ? this.#send(write.command, true) : Promise.resolve(false); }
  /** Explicitly stop waiting. Once invoked, server non-commit cannot be inferred. */
  cancelWaiting(): boolean {
    const write = this.#state.write;
    if (!busy(write)) return false;
    const uncertain = write.phase !== 'submitting' || this.#writeInvoked;
    this.#generation++; this.#write?.abort(); this.#write = null;
    this.#publish({ ...this.#state, write: Object.freeze({ ...write, phase: uncertain ? 'uncertain' : 'rejected', error: new TransferCommandError('aborted', 'WAIT_CANCELLED', uncertain ? 'uncertain' : 'not-sent') }),
      notice: uncertain ? '已停止等待，服务端可能已提交。请核实原操作，勿另建重复操作。' : '请求尚未调用，已取消本次提交。' }); return true;
  }
  /** Reads current facts separately. Does not replace the original draft/CAS/result. */
  readCurrent(): Promise<boolean> {
    return this.#active() && !this.hasUnresolvedWrite && (this.#state.editor?.mode === 'EXISTING' || this.#state.write.phase === 'committed') ? this.#loadDetail(true) : Promise.resolve(false);
  }
  /** Explicit reconciliation only, after known rejection or confirmed commit. */
  adoptCurrent(): boolean {
    const editor = this.#state.editor;
    if (!this.#active() || this.hasUnresolvedWrite || !editor?.current || editor.phase !== 'ready') return false;
    const current = editor.current; const draft = this.#editableDraft(current);
    this.#clearExisting();
    this.#baseline = draft ? JSON.stringify(draft) : null; this.#inputBaseline = draft ? JSON.stringify(inputFromTransferDraft(draft)) : null;
    this.#publish({ editor: Object.freeze({ ...editor, mode: 'EXISTING', detail: current, draft, input: draft ? inputFromTransferDraft(draft) : null, inputError: false, current: null }), write: idle(), stale: false, disposed: false,
      notice: '已采用最新单据；原操作回执不代表当前单据内容。' }); return true;
  }
  discardEditor(): boolean {
    if (!this.#active() || this.hasUnresolvedWrite) return false;
    this.#clearExisting(); this.#detachRead(); this.#baseline = null; this.#inputBaseline = null; this.#stockBasis = null; this.#knownDocument = null;
    this.#publish({ editor: null, write: idle(), stale: false, disposed: false, notice: null }); return true;
  }
  /** Route unmount retains one draft and original operation in the session owner. */
  suspend(): void {
    if (!this.#active()) return;
    this.#existing?.cancelPreparation();
    this.cancelWaiting(); this.#detachRead();
    const editor = this.#state.editor;
    if (editor?.phase === 'loading') this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'error', readError: new TransferCommandError('aborted', 'DETAIL_DETACHED', 'read') }) });
  }
  dispose(): void {
    if (this.#state.disposed) return;
    this.#clearExisting();
    this.#generation++; this.#read?.abort(); this.#write?.abort(); this.#read = null; this.#write = null; this.#baseline = null; this.#inputBaseline = null; this.#stockBasis = null; this.#knownDocument = null; this.#usedKeys.clear();
    this.#options.scope.signal.removeEventListener('abort', this.#abort);
    this.#publish({ editor: null, write: idle(), stale: false, disposed: true, notice: '身份或权限已改变，旧身份单据草稿已清除。' }); this.#listeners.clear();
  }
  async #loadDetail(preserve: boolean): Promise<boolean> {
    const editor = this.#state.editor;
    if (!this.#active() || !editor || this.hasUnresolvedWrite) return false;
    const generation = ++this.#generation; this.#read?.abort(); const request = new AbortController(); this.#read = request;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'loading', readError: null }) });
    if (!this.#current(generation, request, 'read')) return false;
    try {
      const parameters = { transferId: entityId('transfer', editor.transferId) };
      const value = await this.#options.reader.readDetail({ parameters, signal: AbortSignal.any([this.#options.scope.signal, request.signal]), identity: this.#options.scope.identity,
        routeInstanceId: this.#options.scope.routeInstanceId, entityId: editor.transferId });
      if (!this.#current(generation, request, 'read')) return false;
      const detail = frozenSnapshot(transferDetailResponse(value, parameters));
      // Stock provenance is immutable. A later DTO cannot promote cutoff history
      // into a writable runtime document (or downgrade a newly committed document).
      if (this.#stockBasis !== null && detail.stockBasis !== this.#stockBasis) throw new TransferCommandError('malformed-response', 'CHANGED_STOCK_BASIS', 'read');
      const minimum = Math.max(editor.detail?.document.header.version ?? 0, editor.current?.document.header.version ?? 0, this.#state.write.result?.version ?? 0, this.#knownDocument?.version ?? 0);
      if (detail.document.header.version < minimum) throw new TransferCommandError('malformed-response', 'REGRESSING_VERSION', 'read');
      const header = detail.document.header, known = this.#knownDocument;
      if (known && (header.version === known.version && header.status !== known.status
        || known.status === 'VOID' && (header.status !== 'VOID' || header.version !== known.version))) throw new TransferCommandError('malformed-response', 'INCONSISTENT_DOCUMENT_STATE', 'read');
      this.#stockBasis = detail.stockBasis;
      this.#knownDocument = Object.freeze({ version: header.version, status: header.status });
      const draft = preserve ? editor.draft : this.#editableDraft(detail);
      if (!preserve) { this.#baseline = draft ? JSON.stringify(draft) : null; this.#inputBaseline = draft ? JSON.stringify(inputFromTransferDraft(draft)) : null; }
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'ready', detail: preserve ? editor.detail : detail, draft, input: preserve ? editor.input : draft ? inputFromTransferDraft(draft) : null, inputError: preserve ? editor.inputError : false, current: preserve ? detail : null, readError: null }), notice: preserve ? '已读取当前单据；请明确采用后再操作，原请求未改变。' : detail.stockBasis === 'CUTOFF_HISTORY' ? '历史单据尚未开放写入。' : null }); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'read')) return false;
      const safe = safeReadError(error); this.#access(safe); if (!this.#active()) return false;
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'error', readError: safe }) }); return false;
    } finally { if (this.#read === request) this.#read = null; }
  }
  async #send(command: TransferCommandDto, replay: boolean, beforeDispatch?: () => boolean): Promise<boolean> {
    if (!this.#active() || busy(this.#state.write)) return false;
    const generation = ++this.#generation, request = new AbortController(); this.#write = request; this.#writeInvoked = false;
    this.#publish({ ...this.#state, write: Object.freeze({ ...idle(), command, phase: replay ? 'replaying' : 'submitting' }), notice: null });
    try {
      // Permit a synchronous close/cancel before invoking even an injected client.
      await Promise.resolve(); if (!this.#current(generation, request, 'write')) return false;
      if (beforeDispatch) { let allowed = false; try { allowed = beforeDispatch() === true; } catch { /* deny before transport */ } if (!this.#current(generation, request, 'write')) return false; if (!allowed) { this.#publish({ ...this.#state, write: Object.freeze({ ...idle(), phase: 'rejected', command, error: new TransferCommandError('invalid-request', 'PROPOSAL_CHANGED_BEFORE_SUBMIT', 'not-sent') }), notice: '输入已变化，未发送保存；请重新准备后保存。' }); return false; } }
      this.#writeInvoked = true;
      const result = validateTransferResult(await this.#options.client.execute(command, AbortSignal.any([this.#options.scope.signal, request.signal])), command);
      if (!this.#current(generation, request, 'write')) return false;
      this.#accept(result, command, null); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'write')) return false;
      const safe = error instanceof TransferCommandError ? error : new TransferCommandError('malformed-response', 'UNCONFIRMED_RESPONSE', 'uncertain');
      this.#access(safe); if (!this.#active()) return false;
      const uncertain = replay || !['not-sent', 'rejected'].includes(safe.outcome);
      this.#publish({ ...this.#state, write: Object.freeze({ ...this.#state.write, phase: uncertain ? 'uncertain' : 'rejected', error: safe }),
        notice: uncertain ? '提交结果不确定。原操作身份、版本和内容已保留，请先核实。' : ({ VERSION_CONFLICT: '版本冲突，草稿已保留。请读取当前单据并明确重新准备，不能强制覆盖。', SKU_UNAVAILABLE: '当前 SKU 已停用或不可用，操作未通过，草稿已保留。', WAREHOUSE_UNAVAILABLE: '当前调拨仓库不可用，操作未通过，草稿已保留。', INVENTORY_NOT_READY: '初始库存尚未准备完成，操作未通过，草稿已保留。', MISSING_POSTING_PROVENANCE: '缺少完整原始双端库存流水，操作未通过，原内容已保留。' } as Readonly<Record<string, string>>)[safe.code] ?? '请求已拒绝，草稿已保留。' }); return false;
    } finally { if (this.#write === request) this.#write = null; }
  }
  #accept(result: TransferCommandResultDto, command: TransferCommandDto, receipt: TransferCommandReceiptDto | null): void {
    const count = this.#state.editor?.detail?.document.lines.length;
    if ((command.action === 'APPROVE' || command.action === 'UNAPPROVE') && count !== undefined && result.ledgerEntryIds.length !== count * 2) throw new TransferCommandError('malformed-response', 'UNCONFIRMED_POSTING_COUNT', 'uncertain');
    this.#mutationRevision++;
    this.#knownDocument = Object.freeze({ version: result.version, status: result.status });
    this.#publish({ ...this.#state, write: Object.freeze({ phase: 'committed', command, result, receipt, recovery: receipt ? 'found' : 'unqueried', error: null }), stale: true,
      notice: '原操作已确认；显示内容不是最新单据，请重新读取并明确采用后继续。' });
  }
  #editableDraft(detail: TransferDetailDto): TransferDraftDto | null { if (detail.stockBasis !== 'RUNTIME_LEDGER' || detail.document.header.status !== 'DRAFT') return null; try { return draftFromTransferDetail(detail); } catch { return null; } }
  #clearExisting(): void { const model = this.#existing; this.#existing = null; this.#existingUnsubscribe?.(); this.#existingUnsubscribe = null; model?.dispose(); }
  #canReplace(): boolean { return this.#active() && !this.hasUnresolvedWrite && !this.hasDirtyDraft; }
  #active(): boolean { return this.#options.scope.active && !this.#state.disposed; }
  #current(generation: number, request: AbortController, kind: 'read' | 'write'): boolean { return this.#active() && generation === this.#generation && !request.signal.aborted && (kind === 'read' ? this.#read : this.#write) === request; }
  #detachRead(): void { this.#generation++; this.#read?.abort(); this.#read = null; }
  #access(error: TransferCommandError): void {
    if (!this.#active() || !['unauthenticated', 'forbidden'].includes(error.kind)) return;
    this.#options.scope.dispose(); try { this.#options.onAccessFailure(error); } catch { /* Already cleared before host notification. */ }
  }
  #notice(notice: string): void { if (this.#active()) this.#publish({ ...this.#state, notice }); }
  #publish(state: TransferCommandSnapshot): void { this.#state = Object.freeze(state); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Consumer failure cannot prevent cleanup. */ } } }
}
