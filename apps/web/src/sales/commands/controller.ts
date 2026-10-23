import { HttpQueryError } from '../../transport/http-query.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
import { parseNativeSalesSaveProposal, type NativeSalesSaveProposal } from '../../../../../packages/application/src/native-sales-preparation.ts';
import { salesDetailResponse } from '../response-validation.ts';
import type { SalesDetailDto } from '../contracts.ts';
import { SalesCommandError, type SalesCommandDto, type SalesCommandEditor, type SalesCommandReceiptDto, type SalesCommandResultDto,
  type SalesCommandSnapshot, type SalesCommandWorkspaceOptions, type SalesCommandWriteState, type SalesDraftDto } from './contracts.ts';
import { draftFromSalesDetail, frozenSnapshot, settlementBalanced, validRequestKey, validSalesId, validateSalesCommand, validateSalesDraft, validateSalesReceipt, validateSalesResult } from './validation.ts';

const idle = (): SalesCommandWriteState => Object.freeze({ phase: 'idle', command: null, result: null, receipt: null, recovery: 'unqueried', error: null });
const unresolved = (write: SalesCommandWriteState) => ['submitting', 'checking', 'replaying', 'uncertain'].includes(write.phase);
const busy = (write: SalesCommandWriteState) => ['submitting', 'checking', 'replaying'].includes(write.phase);
function safeReadError(error: unknown): SalesCommandError {
  if (error instanceof SalesCommandError) return error;
  if (error instanceof HttpQueryError && ['unauthenticated', 'forbidden'].includes(error.kind)) return new SalesCommandError(error.kind as 'unauthenticated' | 'forbidden', error.code, 'read', error.status);
  return new SalesCommandError('server', 'DETAIL_READ_FAILED', 'read');
}

/** One bounded, session-owned document workspace. The host retains it across route
 * detach and disposes on identity/permission change. No reads at construction. */
export class SalesCommandWorkspace {
  readonly #options: SalesCommandWorkspaceOptions;
  readonly #listeners = new Set<() => void>();
  readonly #usedKeys = new Set<string>();
  #state: SalesCommandSnapshot = Object.freeze({ editor: null, write: idle(), stale: false, disposed: false, notice: null });
  #baseline: string | null = null;
  #stockBasis: SalesDetailDto['stockBasis'] | null = null;
  #knownDocument: Pick<SalesCommandResultDto, 'version' | 'status'> | null = null;
  #generation = 0;
  #read: AbortController | null = null;
  #write: AbortController | null = null;
  #writeInvoked = false;
  readonly #abort = () => this.dispose();
  constructor(options: SalesCommandWorkspaceOptions) {
    if (!options?.scope?.active || typeof options.client?.execute !== 'function' || typeof options.client.receipt !== 'function'
      || typeof options.reader?.readDetail !== 'function' || typeof options.newRequestKey !== 'function' || typeof options.onAccessFailure !== 'function') throw new TypeError('Explicit current sales command workspace dependencies are required.');
    this.#options = Object.freeze({ ...options }); options.scope.signal.addEventListener('abort', this.#abort, { once: true });
  }
  readonly getSnapshot = (): SalesCommandSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { if (this.#state.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get hasUnresolvedWrite(): boolean { return unresolved(this.#state.write); }
  get hasDirtyDraft(): boolean {
    const editor = this.#state.editor;
    return !!editor?.draft && this.#state.write.phase !== 'committed' && (editor.mode === 'CREATE' || JSON.stringify(editor.draft) !== this.#baseline);
  }
  canLeave(): boolean { return !this.hasUnresolvedWrite && !this.hasDirtyDraft; }
  /** Headless caller-supplied preparation only. No native form/picker is enabled. */
  openCreate(value: SalesDraftDto): boolean {
    if (!this.#canReplace()) return false;
    let draft: SalesDraftDto; try { draft = validateSalesDraft(value); } catch { this.#notice('新单草稿不符合现有合同，未发送请求。'); return false; }
    this.#detachRead(); this.#baseline = null; this.#stockBasis = 'RUNTIME_LEDGER'; this.#knownDocument = null;
    this.#publish({ editor: Object.freeze({ mode: 'CREATE', salesId: draft.header.id, phase: 'ready', detail: null, draft, current: null, readError: null }), write: idle(), stale: false, disposed: false, notice: null }); return true;
  }
  async openExisting(salesId: string): Promise<boolean> {
    if (!validSalesId(salesId) || !this.#canReplace()) return false;
    this.#detachRead(); this.#baseline = null; this.#stockBasis = null; this.#knownDocument = null;
    this.#publish({ editor: Object.freeze({ mode: 'EXISTING', salesId, phase: 'ready', detail: null, draft: null, current: null, readError: null }), write: idle(), stale: false, disposed: false, notice: null });
    return this.#loadDetail(false);
  }
  /** Never edits approved/void/history. Product prices remain server-authoritative. */
  replaceDraft(value: SalesDraftDto): boolean {
    const editor = this.#state.editor;
    if (!this.#active() || !editor || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current
      || editor.detail && (editor.detail.stockBasis !== 'RUNTIME_LEDGER' || editor.detail.document.header.status !== 'DRAFT')) return false;
    let draft: SalesDraftDto; try { draft = validateSalesDraft(value); } catch { this.#notice('草稿不符合现有合同，输入未提交。'); return false; }
    if (draft.header.id !== editor.salesId) return false;
    const previousSettlements = new Map<string, SalesDetailDto['document']['settlements'][number]>(editor.detail?.document.settlements.map(row => [row.id, row]));
    if (draft.settlements.some(row => {
      const previous = previousSettlements.get(row.id);
      return previous && previous.paymentAccountId === row.paymentAccountId && previous.paymentMethodId !== row.paymentMethodId;
    })) { this.#notice('保留原收退账户及明细时，不能替换原付款方式编号。'); return false; }
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, draft }), notice: null }); return true;
  }
  submit(action: SalesCommandDto['action']): Promise<boolean> { return this.#submit(action); }
  /** Same SAVE/key/recovery owner. New document/SKU identities stay server-owned. */
  submitProposal(value: NativeSalesSaveProposal, beforeDispatch?: () => boolean): Promise<boolean> {
    const editor = this.#state.editor, header = editor?.detail?.document.header;
    if (!this.#active() || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || this.#state.stale || editor?.current || editor && editor.phase !== 'ready') return Promise.resolve(false);
    let proposal: NativeSalesSaveProposal;
    try { proposal = parseNativeSalesSaveProposal(value); }
    catch { this.#notice('规格及保存资料未通过校验，输入已保留，未发送请求。'); return Promise.resolve(false); }
    if (proposal.salesId === null ? editor !== null : !editor || editor.mode !== 'EXISTING' || proposal.salesId !== editor.salesId || !header || header.status !== 'DRAFT' || editor.detail?.stockBasis !== 'RUNTIME_LEDGER' || header.version >= Number.MAX_SAFE_INTEGER) return Promise.resolve(false);
    let command: SalesCommandDto;
    try {
      const requestKey = this.#options.newRequestKey();
      if (!validRequestKey(requestKey) || this.#usedKeys.has(requestKey) || this.#usedKeys.size >= 1024) throw new Error();
      command = validateSalesCommand({ action: 'SAVE', requestKey, expectedVersion: header?.version ?? null, proposal });
      this.#usedKeys.add(requestKey);
    } catch { this.#notice('无法准备新的操作身份或合同，未发送请求。'); return Promise.resolve(false); }
    return this.#send(command, false, beforeDispatch);
  }
  submitPreparedExistingSave(beforeDispatch: () => boolean): Promise<boolean> {
    return this.#state.editor?.mode === 'EXISTING' && typeof beforeDispatch === 'function' ? this.#submit('SAVE', beforeDispatch) : Promise.resolve(false);
  }
  async #submit(action: SalesCommandDto['action'], beforeDispatch?: () => boolean): Promise<boolean> {
    const editor = this.#state.editor;
    if (!this.#active() || !editor || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current || this.#state.stale) return false;
    const detail = editor.detail, header = detail?.document.header;
    if (detail?.stockBasis === 'CUTOFF_HISTORY') { this.#notice('历史单据尚未开放基线感知写入，未发送请求。'); return false; }
    if (header && header.version >= Number.MAX_SAFE_INTEGER) return false;
    if (action === 'SAVE') {
      if (!editor.draft || header && header.status !== 'DRAFT' || editor.mode === 'EXISTING' && !header || editor.mode === 'EXISTING' && !this.hasDirtyDraft) return false;
    } else {
      if (!header || header.status !== (action === 'UNAPPROVE' ? 'APPROVED' : 'DRAFT')) return false;
      // Mutations must apply to the persisted document, never silently save edits.
      if (this.hasDirtyDraft) { this.#notice('请先保存草稿并重新读取，再执行状态操作。'); return false; }
      if (action === 'APPROVE') {
        let persisted: SalesDraftDto; try { persisted = draftFromSalesDetail(detail!); } catch { this.#notice('已保存单据缺少明确价格事实或原付款方式编号，无法审核。'); return false; }
        if (!settlementBalanced(persisted)) { this.#notice('审核要求收款减退款与应结金额精确配平。'); return false; }
      }
    }
    let command: SalesCommandDto;
    try {
      const requestKey = this.#options.newRequestKey();
      // Bounded key tombstones avoid accidental reuse across cleared editors. At the
      // technical session limit, no further operation is generated; recovery works.
      if (!validRequestKey(requestKey) || this.#usedKeys.has(requestKey) || this.#usedKeys.size >= 1024) throw new Error();
      command = validateSalesCommand(action === 'SAVE' ? { action, requestKey, expectedVersion: header?.version ?? null, draft: editor.draft! }
        : { action, requestKey, expectedVersion: header!.version, salesId: editor.salesId });
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
      const receipt = validateSalesReceipt(await this.#options.client.receipt(original.command, AbortSignal.any([this.#options.scope.signal, request.signal])), original.command);
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
    this.#publish({ ...this.#state, write: Object.freeze({ ...write, phase: uncertain ? 'uncertain' : 'rejected', error: new SalesCommandError('aborted', 'WAIT_CANCELLED', uncertain ? 'uncertain' : 'not-sent') }),
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
    this.#baseline = draft ? JSON.stringify(draft) : null;
    this.#publish({ editor: Object.freeze({ ...editor, mode: 'EXISTING', detail: current, draft, current: null }), write: idle(), stale: false, disposed: false,
      notice: '已采用最新单据；原操作回执不代表当前单据内容。' }); return true;
  }
  discardEditor(): boolean {
    if (!this.#active() || this.hasUnresolvedWrite) return false;
    this.#detachRead(); this.#baseline = null; this.#stockBasis = null; this.#knownDocument = null;
    this.#publish({ editor: null, write: idle(), stale: false, disposed: false, notice: null }); return true;
  }
  /** Route unmount retains one draft and original operation in the session owner. */
  suspend(): void {
    if (!this.#active()) return;
    this.cancelWaiting(); this.#detachRead();
    const editor = this.#state.editor;
    if (editor?.phase === 'loading') this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'error', readError: new SalesCommandError('aborted', 'DETAIL_DETACHED', 'read') }) });
  }
  dispose(): void {
    if (this.#state.disposed) return;
    this.#generation++; this.#read?.abort(); this.#write?.abort(); this.#read = null; this.#write = null; this.#baseline = null; this.#stockBasis = null; this.#knownDocument = null; this.#usedKeys.clear();
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
      const parameters = { salesId: entityId('sales', editor.salesId) };
      const value = await this.#options.reader.readDetail({ parameters, signal: AbortSignal.any([this.#options.scope.signal, request.signal]), identity: this.#options.scope.identity,
        routeInstanceId: this.#options.scope.routeInstanceId, entityId: editor.salesId });
      if (!this.#current(generation, request, 'read')) return false;
      const detail = frozenSnapshot(salesDetailResponse(value, parameters));
      // Stock provenance is immutable. A later DTO cannot promote cutoff history
      // into a writable runtime document (or downgrade a newly committed document).
      if (this.#stockBasis !== null && detail.stockBasis !== this.#stockBasis) throw new SalesCommandError('malformed-response', 'CHANGED_STOCK_BASIS', 'read');
      const minimum = Math.max(editor.detail?.document.header.version ?? 0, editor.current?.document.header.version ?? 0, this.#state.write.result?.version ?? 0, this.#knownDocument?.version ?? 0);
      if (detail.document.header.version < minimum) throw new SalesCommandError('malformed-response', 'REGRESSING_VERSION', 'read');
      const header = detail.document.header, known = this.#knownDocument;
      if (known && (header.version === known.version && header.status !== known.status
        || known.status === 'VOID' && (header.status !== 'VOID' || header.version !== known.version))) throw new SalesCommandError('malformed-response', 'INCONSISTENT_DOCUMENT_STATE', 'read');
      this.#stockBasis = detail.stockBasis;
      this.#knownDocument = Object.freeze({ version: header.version, status: header.status });
      const draft = preserve ? editor.draft : this.#editableDraft(detail);
      if (!preserve) this.#baseline = draft ? JSON.stringify(draft) : null;
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'ready', detail: preserve ? editor.detail : detail, draft, current: preserve ? detail : null, readError: null }), notice: preserve ? '已读取当前单据；请明确采用后再操作，原请求未改变。' : detail.stockBasis === 'CUTOFF_HISTORY' ? '历史单据尚未开放写入。' : null }); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'read')) return false;
      const safe = safeReadError(error); this.#access(safe); if (!this.#active()) return false;
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'error', readError: safe }) }); return false;
    } finally { if (this.#read === request) this.#read = null; }
  }
  async #send(command: SalesCommandDto, replay: boolean, beforeDispatch?: () => boolean): Promise<boolean> {
    if (!this.#active() || busy(this.#state.write)) return false;
    const generation = ++this.#generation, request = new AbortController(); this.#write = request; this.#writeInvoked = false;
    this.#publish({ ...this.#state, write: Object.freeze({ ...idle(), command, phase: replay ? 'replaying' : 'submitting' }), notice: null });
    try {
      // Permit a synchronous close/cancel before invoking even an injected client.
      await Promise.resolve(); if (!this.#current(generation, request, 'write')) return false;
      if (beforeDispatch) { let allowed = false; try { allowed = beforeDispatch() === true; } catch { /* deny before transport */ } if (!this.#current(generation, request, 'write')) return false; if (!allowed) { this.#publish({ ...this.#state, write: Object.freeze({ ...idle(), phase: 'rejected', command, error: new SalesCommandError('invalid-request', 'PROPOSAL_CHANGED_BEFORE_SUBMIT', 'not-sent') }), notice: '输入已变化，未发送保存；请重新准备后保存。' }); return false; } }
      this.#writeInvoked = true;
      const result = validateSalesResult(await this.#options.client.execute(command, AbortSignal.any([this.#options.scope.signal, request.signal])), command);
      if (!this.#current(generation, request, 'write')) return false;
      this.#accept(result, command, null); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'write')) return false;
      const safe = error instanceof SalesCommandError ? error : new SalesCommandError('malformed-response', 'UNCONFIRMED_RESPONSE', 'uncertain');
      this.#access(safe); if (!this.#active()) return false;
      const uncertain = replay || !['not-sent', 'rejected'].includes(safe.outcome);
      this.#publish({ ...this.#state, write: Object.freeze({ ...this.#state.write, phase: uncertain ? 'uncertain' : 'rejected', error: safe }),
        notice: uncertain ? '提交结果不确定。原操作身份、版本和内容已保留，请先核实。' : safe.code === 'VERSION_CONFLICT' ? '版本冲突，草稿已保留。请读取当前单据并明确重新准备，不能强制覆盖。'
          : safe.code === 'SETTLEMENT_METHOD_MISMATCH' ? '当前收退账户与原选付款方式不再匹配，已保留原选择；请重新准备有效收退资料，不能自动换方式。'
            : safe.code === 'IMMUTABLE_SETTLEMENT_METHOD' ? '保留原收退账户及明细时，不能替换原付款方式编号；草稿已保留。' : '请求已拒绝，草稿已保留。' }); return false;
    } finally { if (this.#write === request) this.#write = null; }
  }
  #accept(result: SalesCommandResultDto, command: SalesCommandDto, receipt: SalesCommandReceiptDto | null): void {
    const count = this.#state.editor?.detail?.document.lines.length;
    if ((command.action === 'APPROVE' || command.action === 'UNAPPROVE') && count !== undefined && result.ledgerEntryIds.length !== count) throw new SalesCommandError('malformed-response', 'UNCONFIRMED_POSTING_COUNT', 'uncertain');
    this.#knownDocument = Object.freeze({ version: result.version, status: result.status });
    const editor = this.#state.editor ?? Object.freeze({ mode: 'EXISTING' as const, salesId: result.salesId, phase: 'ready' as const, detail: null, draft: null, current: null, readError: null });
    if (!this.#state.editor) this.#stockBasis = 'RUNTIME_LEDGER';
    this.#publish({ ...this.#state, editor, write: Object.freeze({ phase: 'committed', command, result, receipt, recovery: receipt ? 'found' : 'unqueried', error: null }), stale: true,
      notice: '原操作已确认；显示内容不是最新单据，请重新读取并明确采用后继续。' });
  }
  #editableDraft(detail: SalesDetailDto): SalesDraftDto | null { if (detail.stockBasis !== 'RUNTIME_LEDGER' || detail.document.header.status !== 'DRAFT') return null; try { return draftFromSalesDetail(detail); } catch { return null; } }
  #canReplace(): boolean { return this.#active() && !this.hasUnresolvedWrite && !this.hasDirtyDraft; }
  #active(): boolean { return this.#options.scope.active && !this.#state.disposed; }
  #current(generation: number, request: AbortController, kind: 'read' | 'write'): boolean { return this.#active() && generation === this.#generation && !request.signal.aborted && (kind === 'read' ? this.#read : this.#write) === request; }
  #detachRead(): void { this.#generation++; this.#read?.abort(); this.#read = null; }
  #access(error: SalesCommandError): void {
    if (!this.#active() || !['unauthenticated', 'forbidden'].includes(error.kind)) return;
    this.#options.scope.dispose(); try { this.#options.onAccessFailure(error); } catch { /* Already cleared before host notification. */ }
  }
  #notice(notice: string): void { if (this.#active()) this.#publish({ ...this.#state, notice }); }
  #publish(state: SalesCommandSnapshot): void { this.#state = Object.freeze(state); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Consumer failure cannot prevent cleanup. */ } } }
}
