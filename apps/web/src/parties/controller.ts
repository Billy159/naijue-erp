import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { PartyClientError, type PartyAction, type PartyClient, type PartyCommand, type PartyKind, type PartyRecord, type PartyResult, type PartySearch } from './contracts.ts';
import { validId, validKey, validName, validateCommand, validateDetail, validateKind, validateList, validateReceipt, validateResult, validateSearch } from './response-validation.ts';

export interface PartyEditor {
  readonly action: PartyAction; readonly id: string | null; readonly phase: 'loading' | 'ready' | 'error';
  readonly record: PartyRecord | null; readonly draftName: string; readonly draftEnabled: boolean; readonly readError: PartyClientError | null;
  readonly closePrompt: boolean; readonly current: PartyRecord | null;
}
export interface PartyWriteState {
  readonly phase: 'idle' | 'submitting' | 'uncertain' | 'checking' | 'replaying' | 'rejected' | 'committed';
  /** Immutable original bytes/semantic values. Only explicit exact replay may reuse it. */
  readonly command: PartyCommand | null; readonly result: PartyResult | null; readonly error: PartyClientError | null;
  readonly receipt: 'unchecked' | 'absent' | 'failed' | 'found';
}
/** Bounded per-kind UI draft, independent of the last executed list range. */
export interface PartyFilterDraft { readonly search: string; readonly enabled: PartySearch['enabled'] }
export interface PartySnapshot { readonly filterDraft: PartyFilterDraft; readonly editor: PartyEditor | null; readonly write: PartyWriteState; readonly listStale: boolean; readonly disposed: boolean; readonly notice: string | null }
let controllerInstance = 0;
const defaultFilterDraft = (): PartyFilterDraft => Object.freeze({ search: '', enabled: 'ENABLED' });
const initialListQuery = (): PartySearch => ({ ...defaultFilterDraft(), page: 1, pageSize: 20 });
const idleWrite = (): PartyWriteState => Object.freeze({ phase: 'idle', command: null, result: null, error: null, receipt: 'unchecked' });
export interface PartyWorkspaceOptions {
  readonly scope: ReadScope; readonly client: PartyClient;
  /** E.g. crypto.randomUUID. Called ONCE for a fresh user-submitted action, never during recovery. */
  readonly newRequestKey: () => string;
  /** REQUIRED host bridge to trusted auth/session lifecycle, never an automatic login/retry. */
  readonly onAccessFailure: (error: PartyClientError) => void;
}
const unresolved = (write: PartyWriteState): boolean => ['submitting', 'uncertain', 'checking', 'replaying'].includes(write.phase);
function safeReadError(error: unknown): PartyClientError { return error instanceof PartyClientError ? error : new PartyClientError('server', 'READ_FAILED', 'read'); }

/** One session-scoped controller per independent kind. No business read at construction.
 * The workspace owns this beyond route unmount so an uncertain command is not lost. */
export class PartyMaintenanceController {
  readonly instanceId = String(++controllerInstance);
  readonly list: LatestQuery<PartySearch, import('./contracts.ts').PartyPage<PartyRecord>>;
  readonly scope: ReadScope;
  readonly client: PartyClient;
  readonly kind: PartyKind;
  /** Same per-kind session owner as filterDraft; presentation only, never a result cache. */
  readonly tableScroll = { top: 0, left: 0 };
  #executedQuery: PartySearch = initialListQuery();
  readonly #options: PartyWorkspaceOptions;
  readonly #hasOtherUnresolvedWrite: () => boolean;
  readonly #listeners = new Set<() => void>();
  #state: PartySnapshot = Object.freeze({ filterDraft: defaultFilterDraft(), editor: null, write: idleWrite(), listStale: false, disposed: false, notice: null });
  #read: AbortController | null = null;
  #write: AbortController | null = null;
  #generation = 0;
  readonly #abort = () => this.dispose();
  /** The workspace supplies only its bounded sibling-kind recovery guard. */
  constructor(kind: PartyKind, options: PartyWorkspaceOptions, hasOtherUnresolvedWrite: () => boolean = () => false) {
    validateKind(kind);
    if (!options.scope.active || typeof options.client?.list !== 'function' || typeof options.client.detail !== 'function' || typeof options.client.execute !== 'function'
      || typeof options.client.receipt !== 'function' || typeof options.client.candidates !== 'function' || typeof options.newRequestKey !== 'function' || typeof options.onAccessFailure !== 'function' || typeof hasOtherUnresolvedWrite !== 'function') throw new TypeError('Explicit current party workspace dependencies are required.');
    this.kind = kind; this.#options = Object.freeze({ ...options }); this.scope = options.scope; this.client = options.client;
    this.#hasOtherUnresolvedWrite = hasOtherUnresolvedWrite;
    this.list = new LatestQuery({ scope: options.scope, execute: async read => {
      try { return validateList(await options.client.list(kind, read.parameters, read.signal), read.parameters); }
      catch (error) { if (!read.signal.aborted) this.#access(error); throw safeReadError(error); }
    } });
    options.scope.signal.addEventListener('abort', this.#abort, { once: true });
  }
  readonly getSnapshot = (): PartySnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => { if (this.#state.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get executedQuery(): PartySearch { return this.#executedQuery; }
  get hasUnresolvedWrite(): boolean { return unresolved(this.#state.write); }
  get hasDirtyDraft(): boolean {
    const editor = this.#state.editor;
    if (this.#state.write.phase === 'committed') return false;
    return !!editor && (editor.action === 'CREATE' ? editor.draftName.length > 0 : editor.action === 'EDIT' && editor.record !== null && (editor.draftName !== editor.record.name || editor.draftEnabled !== editor.record.enabled));
  }
  /** Host must consult this BEFORE navigation; unresolved commands cannot be silently discarded. */
  canLeave(): boolean { return !this.hasUnresolvedWrite && !this.hasDirtyDraft; }
  /** Typing never dispatches a read, changes the applied range or blocks navigation. */
  setFilterDraft(draft: PartyFilterDraft): void {
    if (!this.scope.active || this.#state.disposed || this.#state.editor || typeof draft?.search !== 'string' || draft.search.length > 200 || draft.search.includes('\0') || !['ALL', 'ENABLED', 'DISABLED'].includes(draft.enabled)) return;
    this.#publish({ ...this.#state, filterDraft: Object.freeze({ search: draft.search, enabled: draft.enabled }) });
  }
  async queryList(parameters: PartySearch): Promise<void> {
    const executed = validateSearch(parameters);
    if (!this.scope.active || this.#state.disposed) return;
    this.#executedQuery = executed;
    const result = await this.list.run(executed);
    if (result.status !== 'success' || !this.scope.active) return;
    const pages = Math.max(1, Math.ceil(result.data.total / executed.pageSize));
    if (executed.page > pages) {
      this.#publish({ ...this.#state, notice: '页码已超出当前结果，正在读取最后一页。' });
      this.#executedQuery = { ...executed, page: pages };
      const adjusted = await this.list.run(this.#executedQuery);
      if (adjusted.status !== 'success') return;
    }
    this.#publish({ ...this.#state, listStale: false });
  }
  refreshList(): void { const query = this.list.getSnapshot().success?.parameters; if (query) void this.queryList(query); }
  openCreate(): boolean {
    if (!this.#replaceEditor()) return false;
    this.#publish({ ...this.#state, editor: Object.freeze({ action: 'CREATE', id: null, phase: 'ready', record: null, draftName: '', draftEnabled: true, readError: null, closePrompt: false, current: null }), write: idleWrite(), notice: null }); return true;
  }
  async openExisting(id: string, action: Exclude<PartyAction, 'CREATE'>): Promise<boolean> {
    if (!validId(id) || !['EDIT', 'DISABLE', 'RESTORE'].includes(action) || !this.#replaceEditor()) return false;
    this.#publish({ ...this.#state, editor: Object.freeze({ action, id, phase: 'loading', record: null, draftName: '', draftEnabled: true, readError: null, closePrompt: false, current: null }), write: idleWrite(), notice: null });
    return this.#loadDetail(false);
  }
  editName(name: string): void {
    const editor = this.#state.editor;
    if (!editor || editor.phase !== 'ready' || !['CREATE', 'EDIT'].includes(editor.action) || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || this.#state.disposed) return;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, draftName: name, closePrompt: false }) });
  }
  editEnabled(enabled: boolean): void {
    const editor = this.#state.editor;
    if (!editor || editor.action !== 'EDIT' || editor.phase !== 'ready' || typeof enabled !== 'boolean' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || this.#state.disposed) return;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, draftEnabled: enabled, closePrompt: false }) });
  }
  requestClose(): boolean {
    if (this.hasUnresolvedWrite) { this.#publish({ ...this.#state, notice: '操作结果尚未确认，请先查询回执或重放原请求。关闭请求不代表服务端取消。' }); return false; }
    if (this.hasDirtyDraft && this.#state.write.phase !== 'committed') { this.#publish({ ...this.#state, editor: this.#state.editor ? Object.freeze({ ...this.#state.editor, closePrompt: true }) : null }); return false; }
    return this.discardEditor();
  }
  keepEditing(): void { if (this.#state.editor) this.#publish({ ...this.#state, editor: Object.freeze({ ...this.#state.editor, closePrompt: false }) }); }
  discardEditor(): boolean {
    if (this.hasUnresolvedWrite || this.#state.disposed) return false;
    this.#generation++; this.#read?.abort(); this.#read = null;
    this.#publish({ ...this.#state, editor: null, write: idleWrite(), notice: null }); return true;
  }
  retryDetail(): Promise<boolean> { return this.#loadDetail(this.#state.editor?.record !== null); }
  /** Reads current server facts without replacing the rejected/uncertain draft or CAS. */
  readCurrent(): Promise<boolean> {
    if (this.hasUnresolvedWrite || this.#state.editor?.id === null) return Promise.resolve(false);
    return this.#loadDetail(true);
  }
  /** Explicit user reconciliation after a definitive rejection, never force-overwrite. */
  prepareCurrentVersion(): boolean {
    const editor = this.#state.editor;
    if (!editor?.current || this.hasUnresolvedWrite) return false;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, record: editor.current, current: null, phase: 'ready', readError: null }), write: idleWrite(), notice: '已保留您的名称与使用状态草稿；下次提交将使用刚读取的版本，服务端仍会检查冲突。' }); return true;
  }
  async submit(): Promise<boolean> {
    const editor = this.#state.editor;
    if (!this.scope.active || this.#state.disposed || !editor || editor.phase !== 'ready' || this.hasUnresolvedWrite || this.#state.write.phase === 'committed' || editor.current) return false;
    if ((editor.action === 'CREATE' || editor.action === 'EDIT') && !validName(editor.draftName)) { this.#publish({ ...this.#state, notice: '名称必填，最多 2048 个字符，不能包含空字符。' }); return false; }
    if (editor.action !== 'CREATE' && (!editor.record || editor.record.version >= 2147483647)) return false;
    if (editor.action === 'EDIT' && editor.record?.name === editor.draftName && editor.record.enabled === editor.draftEnabled || editor.action === 'DISABLE' && !editor.record?.enabled || editor.action === 'RESTORE' && editor.record?.enabled) return false;
    let command: PartyCommand;
    try {
      const requestKey = this.#options.newRequestKey(); if (!validKey(requestKey) || requestKey === this.#state.write.command?.requestKey) throw new Error();
      command = validateCommand(editor.action === 'CREATE' ? { action: 'CREATE', requestKey, name: editor.draftName }
        : editor.action === 'EDIT' ? { action: 'EDIT', requestKey, id: editor.record!.id, expectedVersion: editor.record!.version, name: editor.draftName, enabled: editor.draftEnabled }
          : { action: editor.action, requestKey, id: editor.record!.id, expectedVersion: editor.record!.version });
    } catch { this.#publish({ ...this.#state, notice: '无法准备新的操作身份，未发送请求。' }); return false; }
    return this.#send(command, false);
  }
  async checkReceipt(): Promise<boolean> {
    const original = this.#state.write;
    if (!this.scope.active || original.phase !== 'uncertain' || !original.command) return false;
    const generation = ++this.#generation; const request = new AbortController(); this.#write = request;
    this.#publish({ ...this.#state, write: Object.freeze({ ...original, phase: 'checking', error: null }) });
    try {
      const receipt = validateReceipt(await this.client.receipt(this.kind, original.command.requestKey, AbortSignal.any([this.scope.signal, request.signal])), this.kind, original.command.requestKey, original.command);
      if (!this.#current(generation, request, 'write')) return false;
      this.#acceptResult(receipt.result, original.command, 'found'); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'write')) return false;
      const safe = safeReadError(error); this.#access(safe); if (!this.scope.active) return false;
      const absent = safe.code === 'RECEIPT_NOT_FOUND' && safe.kind === 'not-found';
      this.#publish({ ...this.#state, write: Object.freeze({ ...original, phase: 'uncertain', error: safe, receipt: absent ? 'absent' : 'failed' }), notice: absent ? '暂未查到原操作回执，不代表未提交。请保留原请求并核实，或明确重放原请求。' : '回执暂不可读取，原操作仍未确认。' }); return false;
    } finally { if (this.#write === request) this.#write = null; }
  }
  /** Same key, kind, target, expectedVersion and exact name. Never an automatic retry. */
  replayOriginal(): Promise<boolean> {
    const write = this.#state.write;
    return write.phase === 'uncertain' && write.command ? this.#send(write.command, true) : Promise.resolve(false);
  }
  /** Route unmount detaches reads. It does NOT claim to cancel a server transaction. */
  suspend(): void {
    this.list.cancel(); this.#generation++; this.#read?.abort(); this.#read = null; this.#write?.abort(); this.#write = null;
    if (this.#state.editor?.phase === 'loading') this.#publish({ ...this.#state, editor: Object.freeze({ ...this.#state.editor, phase: 'error', readError: new PartyClientError('aborted', 'DETAIL_DETACHED', 'read') }) });
    if (['submitting', 'checking', 'replaying'].includes(this.#state.write.phase)) this.#publish({ ...this.#state, write: Object.freeze({ ...this.#state.write, phase: 'uncertain', error: new PartyClientError('aborted', 'WRITE_DETACHED', 'uncertain') }), notice: '请求已停止等待，服务端可能已提交。请核实原操作，勿另建重复操作。' });
  }
  /** Called only once a legitimate route leave is established. Generic suspend
   * retains recovery; a clean unchanged modal is not a persistent user draft. */
  leaveRoute(): boolean {
    if (this.#state.disposed || this.hasDirtyDraft || this.hasUnresolvedWrite) return false;
    return this.#state.editor ? this.discardEditor() : true;
  }
  dispose(): void {
    if (this.#state.disposed) return;
    this.#generation++; this.#read?.abort(); this.#write?.abort(); this.#read = null; this.#write = null; this.list.dispose();
    this.scope.signal.removeEventListener('abort', this.#abort);
    this.#executedQuery = initialListQuery(); this.tableScroll.top = 0; this.tableScroll.left = 0;
    this.#publish({ filterDraft: defaultFilterDraft(), editor: null, write: idleWrite(), listStale: false, disposed: true, notice: '身份或权限已改变，旧身份资料和草稿已清除。' }); this.#listeners.clear();
  }
  #replaceEditor(): boolean {
    if (!this.scope.active || this.#state.disposed || this.hasUnresolvedWrite) return false;
    if (this.hasDirtyDraft && this.#state.write.phase !== 'committed') { this.requestClose(); return false; }
    this.#generation++; this.#read?.abort(); this.#read = null; return true;
  }
  async #loadDetail(preserveDraft: boolean): Promise<boolean> {
    const editor = this.#state.editor;
    if (!editor?.id || !this.scope.active || this.hasUnresolvedWrite) return false;
    const generation = ++this.#generation; this.#read?.abort(); const request = new AbortController(); this.#read = request;
    this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'loading', readError: null }) });
    try {
      const record = validateDetail(await this.client.detail(this.kind, editor.id, AbortSignal.any([request.signal, this.scope.signal])), editor.id);
      if (!this.#current(generation, request, 'read')) return false;
      if (editor.record && record.version < editor.record.version || this.#state.write.result?.partyId === record.id && record.version < this.#state.write.result.version) throw new PartyClientError('malformed-response', 'REGRESSING_VERSION', 'read');
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'ready', record: preserveDraft ? editor.record : record, draftName: preserveDraft ? editor.draftName : record.name, draftEnabled: preserveDraft ? editor.draftEnabled : record.enabled,
        current: preserveDraft ? record : null, readError: null }) }); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'read')) return false;
      const safe = safeReadError(error); this.#access(safe); if (!this.scope.active) return false;
      this.#publish({ ...this.#state, editor: Object.freeze({ ...editor, phase: 'error', readError: safe }) }); return false;
    } finally { if (this.#read === request) this.#read = null; }
  }
  async #send(command: PartyCommand, replay: boolean): Promise<boolean> {
    if (!this.scope.active || this.#state.disposed || ['submitting', 'checking', 'replaying'].includes(this.#state.write.phase)) return false;
    const generation = ++this.#generation; const request = new AbortController(); this.#write = request;
    this.#publish({ ...this.#state, write: Object.freeze({ phase: replay ? 'replaying' : 'submitting', command, result: null, error: null, receipt: this.#state.write.receipt }), notice: null });
    try {
      const result = validateResult(await this.client.execute(this.kind, command, AbortSignal.any([this.scope.signal, request.signal])), this.kind, command);
      if (!this.#current(generation, request, 'write')) return false;
      this.#acceptResult(result, command, this.#state.write.receipt); return true;
    } catch (error) {
      if (!this.#current(generation, request, 'write')) return false;
      const safe = error instanceof PartyClientError ? error : new PartyClientError('malformed-response', 'UNCONFIRMED_RESPONSE', 'uncertain');
      // A replay rejection cannot prove the original attempt did not commit.
      const uncertain = replay || !['rejected', 'not-sent'].includes(safe.outcome);
      this.#access(safe, uncertain); if (!this.scope.active) return false;
      this.#publish({ ...this.#state, write: Object.freeze({ ...this.#state.write, phase: uncertain ? 'uncertain' : 'rejected', error: safe }), notice: uncertain ? '提交结果不确定。输入和原操作身份已保留；请先核实，不要重复新建。' : rejectionMessage(safe.code) }); return false;
    } finally { if (this.#write === request) this.#write = null; }
  }
  #acceptResult(result: PartyResult, command: PartyCommand, receipt: PartyWriteState['receipt']): void {
    const record = this.#state.editor?.record;
    if (record && (result.code !== record.code)) throw new PartyClientError('malformed-response', 'UNCONFIRMED_RESPONSE', 'uncertain');
    this.list.cancel();
    this.#publish({ ...this.#state, write: Object.freeze({ phase: 'committed', command, result, error: null, receipt }), listStale: this.list.getSnapshot().success !== null,
      notice: '原操作已确认。当前资料可能已有后续变更，请重新读取后再操作。' });
  }
  #current(generation: number, request: AbortController, channel: 'read' | 'write'): boolean {
    return this.scope.active && !this.#state.disposed && generation === this.#generation && !request.signal.aborted && (channel === 'read' ? this.#read : this.#write) === request;
  }
  #access(error: unknown, hasUnresolvedWrite = this.hasUnresolvedWrite): void {
    if (!this.scope.active || !(error instanceof PartyClientError) || !['unauthenticated', 'forbidden'].includes(error.kind)) return;
    // A denied read/replay is not a trusted identity revision or evidence that a
    // previous dispatched command rolled back. Keep its immutable recovery state,
    // including when the denial came from the other kind's independent store.
    // A current 401 or explicit identity/permission invalidation still clears it.
    if (error.kind === 'forbidden' && (hasUnresolvedWrite || this.#hasOtherUnresolvedWrite())) return;
    this.scope.dispose();
    try { this.#options.onAccessFailure(error); } catch { /* Already invalidated; never restore facts on host callback failure. */ }
  }
  #publish(state: PartySnapshot): void {
    this.#state = Object.freeze(state);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Consumer failure cannot prevent identity cleanup. */ } }
  }
}
export function rejectionMessage(code: string): string {
  return ({ VERSION_CONFLICT: '资料已被他人修改。您的输入已保留，请读取最新状态并明确重新准备，不能强制覆盖。', CUSTOMER_DEFAULT_IN_USE: '该客户仍是已启用营业厅的默认客户，不能停用。', INVALID_PARTY_STATE: '当前状态已改变，请读取最新状态。', NO_PARTY_CHANGE: '名称和使用状态均未改变，无需提交。', PARTY_CODE_CONFLICT: '自动编号发生冲突，请由管理员核实原编码；不会修改旧编码。', PARTY_CODE_EXHAUSTED: '自动编号已达技术上限，不能创建。', VERSION_STORAGE_OVERFLOW: '资料版本已达技术上限，不能变更。', IDEMPOTENCY_CONFLICT: '操作身份已被其他内容使用，本次请求被拒绝，请核实后重新准备。' } as Readonly<Record<string, string>>)[code] ?? '请求已被拒绝，输入已保留。请检查后再提交。';
}
/** Session-scoped, two-entry bounded workspace. Preserve it across party route navigation.
 * Identity invalidation clears BOTH independent stores and drafts; never persists to storage. */
export function createPartyWorkspace(options: PartyWorkspaceOptions) {
  const controllers = new Map<PartyKind, PartyMaintenanceController>();
  return Object.freeze({ scope: options.scope, get(kind: PartyKind): PartyMaintenanceController {
    validateKind(kind); if (!options.scope.active) throw new TypeError('An active party workspace scope is required.');
    let controller = controllers.get(kind);
    if (!controller) {
      const created = new PartyMaintenanceController(kind, options, () => controllers.get(kind === 'CUSTOMER' ? 'SUPPLIER' : 'CUSTOMER')?.hasUnresolvedWrite ?? false);
      controllers.set(kind, created); controller = created;
    }
    return controller;
  }, canLeave: () => [...controllers.values()].every(controller => controller.canLeave()),
  hasUnresolvedWrite: () => [...controllers.values()].some(controller => controller.hasUnresolvedWrite),
  dispose: () => { options.scope.dispose(); for (const controller of controllers.values()) controller.dispose(); controllers.clear(); },
  });
}
export type PartyWorkspace = ReturnType<typeof createPartyWorkspace>;
