import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import { StaffClientError, type StaffCommand, type StaffCommandClient, type StaffCommandResult, type StaffReceiptIdentity,
  type StaffRoleOption, type StaffSettingsDraft, type StaffSettingsReader, type StaffSettingsRecord } from './contracts.ts';
import { safeStaffEditorRecord, staffReceiptIdentity, validateStaffCommand, validateStaffReadback, validateStaffReceipt, validateStaffResult, validateStaffSettingsDraft } from './response-validation.ts';

export type StaffEditorIntent = 'edit' | 'LEAVE' | 'REINSTATE';
export interface StaffWriteState {
  readonly phase: 'idle' | 'submitting' | 'uncertain' | 'recovering' | 'rejected' | 'committed';
  readonly original: StaffReceiptIdentity | null; readonly result: StaffCommandResult | null; readonly error: StaffClientError | null;
}
export interface StaffEditorSnapshot {
  readonly draft: Readonly<StaffSettingsDraft> | null; readonly errors: SettingsErrors; readonly dirty: boolean;
  readonly closePrompt: boolean; readonly disposed: boolean; readonly write: StaffWriteState; readonly needsPasswordReentry: boolean;
  readonly readback: { readonly phase: 'idle' | 'loading' | 'ready' | 'error'; readonly record: StaffSettingsRecord | null; readonly error: StaffClientError | null };
}
export interface StaffEditorOptions {
  readonly client: StaffCommandClient; readonly reader: StaffSettingsReader; readonly newRequestKey: () => string;
  /** Enabled only by C/F1 after the shared backend and real isolated PG gate. */
  readonly writesEnabled: () => boolean;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onCommitted?: (result: StaffCommandResult) => void;
  readonly hasOtherUnresolvedWrite?: () => boolean;
}
function immutable<T>(value: T): T {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => { if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } };
  freeze(copy); return copy;
}
const emptyWrite = (): StaffWriteState => ({ phase: 'idle', original: null, result: null, error: null });
const emptyReadback = (): StaffEditorSnapshot['readback'] => ({ phase: 'idle', record: null, error: null });
const unresolved = (write: StaffWriteState) => ['submitting', 'uncertain', 'recovering'].includes(write.phase);

/** One atomic staff+account command. Only a non-secret identity survives dispatch.
 * Session owner survives route unmount; identity invalidation clears it. */
export class StaffSettingsController {
  readonly scope: ReadScope; readonly intent: StaffEditorIntent;
  readonly #roles: readonly StaffRoleOption[]; readonly #options: StaffEditorOptions | undefined;
  #record: StaffSettingsRecord | null; #baseline: Readonly<StaffSettingsDraft> | null;
  #snapshot: StaffEditorSnapshot; readonly #listeners = new Set<() => void>();
  readonly #abort = () => this.dispose(); readonly #controller = new AbortController();
  constructor(scope: ReadScope, record: StaffSettingsRecord | null, roles: readonly StaffRoleOption[], options?: StaffEditorOptions, intent: StaffEditorIntent = 'edit') {
    if (intent !== 'edit' && !record) throw new TypeError('Employment action requires a current staff detail');
    this.scope = scope; this.intent = intent; this.#record = record ? immutable(safeStaffEditorRecord(record)) : null; this.#roles = immutable(roles); this.#options = options;
    this.#baseline = immutable({ name: record?.name ?? '', role: record?.role ?? '', hall: record?.hall ?? null,
      contact: record?.contact ?? '', loginName: record?.account?.loginName ?? '', loginEnabled: record ? record.account?.loginEnabled ?? false : true, password: '' });
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false, needsPasswordReentry: false, write: Object.freeze(emptyWrite()), readback: Object.freeze(emptyReadback()) });
    scope.signal.addEventListener('abort', this.#abort, { once: true }); if (!scope.active) this.dispose();
  }
  get record(): StaffSettingsRecord | null { return this.#record; }
  getSnapshot = (): StaffEditorSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { if (this.#snapshot.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get writesEnabled(): boolean { return this.scope.active && !this.#snapshot.disposed && this.#options?.writesEnabled() === true; }
  get hasUnresolvedWrite(): boolean { return unresolved(this.#snapshot.write); }
  get locked(): boolean { return this.hasUnresolvedWrite || this.#snapshot.write.phase === 'committed'; }
  update(patch: Partial<StaffSettingsDraft>): void {
    if (!this.scope.active || this.#snapshot.disposed || !this.#snapshot.draft || this.locked || this.intent !== 'edit') return;
    const draft = immutable({ ...this.#snapshot.draft, ...patch });
    const needsPasswordReentry = this.#snapshot.needsPasswordReentry
      && !(typeof patch.password === 'string' && patch.password.length > 0)
      && !(!this.record?.account && patch.loginEnabled === false);
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), dirty: needsPasswordReentry || JSON.stringify(draft) !== JSON.stringify(this.#baseline), needsPasswordReentry, closePrompt: false });
  }
  /** Existing reset intent cannot silently disappear after a definite rejection. */
  cancelPasswordReset(): void {
    if (!this.record?.account || !this.#snapshot.draft || this.locked || this.#snapshot.disposed) return;
    const draft = immutable({ ...this.#snapshot.draft, password: '' });
    this.#publish({ ...this.#snapshot, draft, needsPasswordReentry: false, errors: Object.freeze({}), dirty: JSON.stringify(draft) !== JSON.stringify(this.#baseline) });
  }
  validate(): SettingsErrors {
    if (!this.#snapshot.draft || this.#snapshot.disposed) return Object.freeze({});
    const errors: Record<string, string> = this.intent === 'edit' ? { ...validateStaffSettingsDraft(this.#snapshot.draft, this.record, this.#roles) } : {};
    if (this.intent !== 'edit' && this.record?.employmentStatus !== (this.intent === 'LEAVE' ? '在职' : '离职')) errors.employment = '员工状态已改变，请关闭并重新读取。';
    if (this.#snapshot.needsPasswordReentry) errors.password = '上次密码已清除，请重新输入，或取消本次改密。';
    this.#publish({ ...this.#snapshot, errors: Object.freeze(errors) }); return errors;
  }
  submit(): Promise<void> {
    const options = this.#options;
    if (!options || !this.#snapshot.draft || !this.writesEnabled || this.locked || Object.keys(this.validate()).length
      || this.intent === 'edit' && this.record && !this.#snapshot.dirty) return Promise.resolve();
    let command: StaffCommand;
    try { command = this.#command(options.newRequestKey()); }
    catch { this.#publish({ ...this.#snapshot, write: { phase: 'rejected', original: null, result: null, error: new StaffClientError('invalid-request', 'INVALID_STAFF_COMMAND', 'not-sent') } }); return Promise.resolve(); }
    const original = staffReceiptIdentity(command), hadPassword = (command.action === 'CREATE' || command.action === 'EDIT') && command.account?.password != null;
    this.#publish({ ...this.#snapshot, draft: immutable({ ...this.#snapshot.draft, password: '' }), needsPasswordReentry: hadPassword,
      closePrompt: false, write: { phase: 'submitting', original, result: null, error: null } });
    // No command captured by settlement callbacks or session state. Transport owns only the in-flight body.
    let pending: Promise<StaffCommandResult>;
    try { pending = options.client.execute(command, this.#controller.signal); }
    catch (error: unknown) { pending = Promise.reject(error); }
    return pending.then(result => {
      if (!this.#alive()) return;
      this.#commit(original, validateStaffResult(result, original));
    }).catch((error: unknown) => {
      if (!this.#alive()) return;
      const safe = error instanceof StaffClientError ? error : new StaffClientError('malformed-response', 'INVALID_RESPONSE', 'uncertain');
      this.#publish({ ...this.#snapshot, write: { phase: ['not-sent', 'rejected'].includes(safe.outcome) ? 'rejected' : 'uncertain', original, result: null, error: safe } });
      this.#accessFailure(safe);
    });
  }
  #command(requestKey: string): StaffCommand {
    const draft = this.#snapshot.draft!, record = this.record;
    if (this.intent !== 'edit') return validateStaffCommand({ action: this.intent, requestKey, id: record?.id, expectedVersion: record?.version });
    const accountChanged = record?.account ? draft.loginName !== record.account.loginName || draft.loginEnabled !== record.account.loginEnabled || draft.password !== '' : draft.loginEnabled;
    const account = accountChanged ? { id: record?.account?.id ?? null, expectedVersion: record?.account?.version ?? null, loginName: draft.loginName, loginEnabled: draft.loginEnabled, password: draft.password || null } : null;
    const values = { name: draft.name, role: draft.role, hallId: draft.hall?.id ?? null,
      contact: record && draft.contact === this.#baseline?.contact ? record.contact : draft.contact === '' ? null : draft.contact };
    return validateStaffCommand(record ? { action: 'EDIT', requestKey, id: record.id, expectedVersion: record.version, values, account } : { action: 'CREATE', requestKey, values, account });
  }
  async recover(): Promise<void> {
    const options = this.#options, original = this.#snapshot.write.original;
    if (!options || !original || !this.#alive() || this.#snapshot.write.phase !== 'uncertain') return;
    this.#publish({ ...this.#snapshot, write: { phase: 'recovering', original, result: null, error: null } });
    try {
      const receipt = await options.client.receipt(original, this.#controller.signal);
      if (this.#alive()) this.#commit(original, validateStaffReceipt(receipt, original).result);
    } catch (error: unknown) {
      if (!this.#alive()) return;
      const safe = error instanceof StaffClientError ? error : new StaffClientError('malformed-response', 'INVALID_RESPONSE', 'read');
      this.#publish({ ...this.#snapshot, write: { phase: 'uncertain', original, result: null, error: safe } }); this.#accessFailure(safe);
    }
  }
  async readback(): Promise<void> {
    const options = this.#options, result = this.#snapshot.write.result;
    if (!options || !result || !this.#alive() || this.#snapshot.write.phase !== 'committed' || this.#snapshot.readback.phase === 'loading') return;
    this.#publish({ ...this.#snapshot, readback: { phase: 'loading', record: null, error: null } });
    try {
      const record = await options.reader.readDetail({ parameters: { id: result.targetId }, signal: this.#controller.signal,
        identity: this.scope.identity, routeInstanceId: this.scope.routeInstanceId, entityId: result.targetId });
      if (!this.#alive()) return;
      this.#publish({ ...this.#snapshot, readback: { phase: 'ready', record: immutable(validateStaffReadback(record, result)), error: null } });
    } catch (error: unknown) {
      if (!this.#alive()) return;
      const kind = error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden') ? error.kind : 'malformed-response';
      const safe = new StaffClientError(kind, kind === 'unauthenticated' ? 'UNAUTHENTICATED' : kind === 'forbidden' ? 'FORBIDDEN' : 'READBACK_FAILED', 'read');
      this.#publish({ ...this.#snapshot, readback: { phase: 'error', record: null, error: safe } }); this.#accessFailure(safe);
    }
  }
  requestClose(): boolean {
    if (this.#snapshot.disposed) return true;
    if (this.hasUnresolvedWrite) return false;
    if (!this.#snapshot.dirty) { this.dispose(); return true; }
    this.#publish({ ...this.#snapshot, closePrompt: true }); return false;
  }
  keepEditing(): void { if (!this.#snapshot.disposed) this.#publish({ ...this.#snapshot, closePrompt: false }); }
  discard(): boolean { if (this.hasUnresolvedWrite) return false; this.dispose(); return true; }
  canLeave(): boolean { return !this.hasUnresolvedWrite && !this.#snapshot.dirty; }
  dispose(): void {
    if (this.#snapshot.disposed) return;
    this.scope.signal.removeEventListener('abort', this.#abort); this.#controller.abort(); this.#record = null; this.#baseline = null;
    this.#publish({ draft: null, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: true, needsPasswordReentry: false, write: emptyWrite(), readback: emptyReadback() }); this.#listeners.clear();
  }
  #alive(): boolean { return this.scope.active && !this.#snapshot.disposed; }
  #commit(original: StaffReceiptIdentity, result: StaffCommandResult): void {
    this.#publish({ ...this.#snapshot, dirty: false, closePrompt: false, needsPasswordReentry: false, write: { phase: 'committed', original, result, error: null } });
    try { this.#options?.onCommitted?.(result); } catch { /* Host refresh cannot undo a confirmed write. */ }
    void this.readback();
  }
  #accessFailure(error: StaffClientError): void {
    if (error.kind !== 'unauthenticated' && error.kind !== 'forbidden') return;
    if (error.kind === 'forbidden' && (this.hasUnresolvedWrite || this.#options?.hasOtherUnresolvedWrite?.())) return;
    this.scope.dispose(); try { this.#options?.onAccessFailure(error.kind); } catch { /* Identity already cleared. */ }
  }
  #publish(snapshot: StaffEditorSnapshot): void {
    this.#snapshot = Object.freeze({ ...snapshot, write: Object.freeze(snapshot.write), readback: Object.freeze(snapshot.readback) });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Cleanup must finish. */ } }
  }
}
export interface StaffWorkspaceOptions extends StaffEditorOptions { readonly scope: ReadScope; readonly roles: readonly StaffRoleOption[] }
export function createStaffSettingsWorkspace(options: StaffWorkspaceOptions) {
  let snapshot: StaffSettingsController | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Consumer only. */ } } };
  const matches = (scope: ReadScope) => options.scope.active && scope.active && ['accountId', 'sessionRevision', 'permissionRevision'].every(key => options.scope.identity[key as keyof typeof scope.identity] === scope.identity[key as keyof typeof scope.identity]);
  options.scope.signal.addEventListener('abort', () => { snapshot?.dispose(); snapshot = null; notify(); listeners.clear(); }, { once: true });
  return Object.freeze({ scope: options.scope, matches, getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(record: StaffSettingsRecord | null, intent: StaffEditorIntent = 'edit'): StaffSettingsController | null {
      if (!options.scope.active) return null;
      if (snapshot && !snapshot.canLeave()) { snapshot.requestClose(); return null; }
      snapshot?.dispose(); snapshot = new StaffSettingsController(options.scope, record, options.roles, options, intent); notify(); return snapshot;
    },
    close(): boolean {
      if (snapshot && !snapshot.getSnapshot().disposed && !snapshot.canLeave()) { snapshot.requestClose(); return false; }
      if (snapshot && !snapshot.discard()) return false;
      snapshot = null; notify(); return true;
    },
    canLeave: () => snapshot?.canLeave() ?? true,
    hasUnresolvedWrite: () => snapshot?.hasUnresolvedWrite ?? false,
    dispose: () => options.scope.dispose(),
  });
}
export type StaffSettingsWorkspace = ReturnType<typeof createStaffSettingsWorkspace>;
export function staffRejectionMessage(code: string): string {
  return ({ VERSION_CONFLICT: '资料已被他人修改，请关闭并重新读取后填写，不能强制覆盖。',
    ACCOUNT_LOGIN_CONFLICT: '登录账号已被使用，请更换账号名称。', LAST_AVAILABLE_ADMIN: '必须保留至少一名可正常登录的在职管理员。',
    INVALID_STAFF_STATE: '员工状态已改变，请重新读取。', INVALID_STAFF_ACCOUNT_STATE: '员工或关联账号状态已改变，请重新读取。',
    STAFF_REFERENCE_UNAVAILABLE: '所选营业厅已不可用，请重新选择。', NO_STAFF_CHANGE: '资料没有变化，无需提交。',
    VERSION_STORAGE_OVERFLOW: '资料版本已达技术上限，不能变更。', IDEMPOTENCY_CONFLICT: '操作身份已被其他内容使用，请核实后重新准备。',
    INVALID_ACCOUNT_PASSWORD: '密码不符合当前要求，请重新输入。', ACCOUNT_CREDENTIALS_NOT_READY: '账号服务暂未就绪，本次保存未执行。',
    STAFF_NOT_FOUND: '员工不存在或已不可访问，请重新读取。', HTTPS_REQUIRED: '请通过安全连接提交密码。' } as Readonly<Record<string, string>>)[code] ?? '请求未被接受，请检查填写内容后再提交。';
}
