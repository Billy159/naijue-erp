import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { SettingsErrors } from '../settings/stores/maintenance-contracts.ts';
import { AccountClientError, type AccountCommand, type AccountCommandClient, type AccountCommandResult, type AccountIntent, type AccountReceiptIdentity,
  type AccountSettingsDraft, type AccountSettingsReader, type AccountSettingsRecord, type AccountStaffCandidate, type StaffSettingsReader } from './contracts.ts';
import { accountStaffCandidate, accountReceiptIdentity, mayEnableLogin, safeAccountRecord, validateAccountCommand, validateAccountReadback, validateAccountReceipt, validateAccountResult, validLoginName, validPassword } from './response-validation.ts';

export interface AccountWriteState {
  readonly phase: 'idle' | 'checking' | 'submitting' | 'uncertain' | 'recovering' | 'rejected' | 'committed';
  readonly original: AccountReceiptIdentity | null; readonly result: AccountCommandResult | null; readonly error: AccountClientError | null;
}
export interface AccountEditorSnapshot {
  readonly draft: Readonly<AccountSettingsDraft> | null; readonly errors: SettingsErrors; readonly dirty: boolean; readonly closePrompt: boolean; readonly disposed: boolean;
  readonly passwordIntent: boolean; readonly needsPasswordReentry: boolean; readonly write: AccountWriteState;
  readonly readback: { readonly phase: 'idle' | 'loading' | 'ready' | 'error'; readonly record: AccountSettingsRecord | null; readonly error: AccountClientError | null };
}
export interface AccountEditorOptions {
  readonly client: AccountCommandClient; readonly reader: AccountSettingsReader; readonly staffReader: StaffSettingsReader;
  readonly newRequestKey: () => string; readonly writesEnabled: () => boolean;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onCommitted?: (result: AccountCommandResult) => void; readonly hasOtherUnresolvedWrite?: () => boolean;
}
function immutable<T>(value: T): T { const copy = structuredClone(value); const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } }; freeze(copy); return copy; }
const emptyWrite = (): AccountWriteState => ({ phase: 'idle', original: null, result: null, error: null });
const emptyRead = (): AccountEditorSnapshot['readback'] => ({ phase: 'idle', record: null, error: null });
export class AccountSettingsController {
  readonly scope: ReadScope; readonly intent: AccountIntent; readonly #options: AccountEditorOptions | undefined;
  #record: AccountSettingsRecord | null; #baseline: Readonly<AccountSettingsDraft> | null; #snapshot: AccountEditorSnapshot;
  readonly #controller = new AbortController(); readonly #listeners = new Set<() => void>(); readonly #abort = () => this.dispose();
  constructor(scope: ReadScope, record: AccountSettingsRecord | null, intent: AccountIntent = record ? 'EDIT' : 'CREATE', options?: AccountEditorOptions) {
    if ((intent === 'CREATE') !== (record === null)) throw new TypeError('Account action requires its current native detail');
    this.scope = scope; this.intent = intent; this.#options = options; this.#record = record ? immutable(safeAccountRecord(record)) : null;
    this.#baseline = immutable({ staff: this.#record ? { ...this.#record.staff, hasAccount: true } : null, loginName: record?.loginName ?? '', loginEnabled: record?.loginEnabled ?? true });
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false, passwordIntent: false, needsPasswordReentry: false, write: Object.freeze(emptyWrite()), readback: Object.freeze(emptyRead()) });
    scope.signal.addEventListener('abort', this.#abort, { once: true }); if (!scope.active) this.dispose();
  }
  getSnapshot = (): AccountEditorSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { if (this.#snapshot.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get record(): AccountSettingsRecord | null { return this.#record; }
  get writesEnabled(): boolean { return this.#alive() && this.#options?.writesEnabled() === true; }
  get hasUnresolvedWrite(): boolean { return ['checking', 'submitting', 'uncertain', 'recovering'].includes(this.#snapshot.write.phase); }
  get locked(): boolean { return this.hasUnresolvedWrite || this.#snapshot.write.phase === 'committed'; }
  update(patch: Partial<Pick<AccountSettingsDraft, 'loginName' | 'loginEnabled'>>): void {
    if (!this.#alive() || !this.#snapshot.draft || this.locked || !['CREATE', 'EDIT'].includes(this.intent)) return;
    const old = this.#snapshot.draft, draft = immutable({ staff: old.staff, loginName: patch.loginName ?? old.loginName, loginEnabled: patch.loginEnabled ?? old.loginEnabled });
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), closePrompt: false, dirty: this.#snapshot.passwordIntent || JSON.stringify(draft) !== JSON.stringify(this.#baseline) });
  }
  selectStaff(value: AccountStaffCandidate): void {
    if (!this.#alive() || this.locked || !this.#snapshot.draft || this.intent !== 'CREATE' || value.hasAccount) return;
    const staff = { id: value.id, name: value.name, role: value.role, employmentStatus: value.employmentStatus, hallId: value.hallId, hasAccount: value.hasAccount };
    this.#publish({ ...this.#snapshot, draft: immutable({ ...this.#snapshot.draft, staff }), dirty: true, errors: Object.freeze({}) });
  }
  setPasswordIntent(present: boolean): void {
    if (typeof present !== 'boolean' || !this.#alive() || this.locked || !['CREATE', 'RESET_PASSWORD'].includes(this.intent)) return;
    this.#publish({ ...this.#snapshot, passwordIntent: present, needsPasswordReentry: false, errors: Object.freeze({}), dirty: present || JSON.stringify(this.#snapshot.draft) !== JSON.stringify(this.#baseline) });
  }
  passwordInputDetached(): void { if (this.#alive() && !this.locked && this.#snapshot.passwordIntent) this.#publish({ ...this.#snapshot, needsPasswordReentry: true }); }
  validate(hasPassword = false): SettingsErrors {
    const draft = this.#snapshot.draft; if (!draft || !this.#alive()) return Object.freeze({});
    const errors: Record<string, string> = {};
    if (this.intent === 'CREATE' || this.intent === 'EDIT') {
      if (!validLoginName(draft.loginName)) errors.loginName = '请输入有效登录账号（最多256字节，不含空字符）。';
      if (draft.loginEnabled && draft.staff && !mayEnableLogin(draft.staff)) errors.loginEnabled = '开通登录需要在职员工、有效角色及所需营业厅。';
    }
    if (this.intent === 'CREATE' && (!draft.staff || draft.staff.hasAccount)) errors.staff = '请选择尚未开通账号的实际员工。';
    if ((this.intent === 'CREATE' || this.intent === 'RESET_PASSWORD') && !hasPassword) errors.password = this.#snapshot.needsPasswordReentry ? '上次密码已清除，请重新输入。' : '请输入新密码。';
    if (this.intent === 'DISABLE' && !this.record?.loginEnabled || this.intent === 'RESTORE' && this.record?.loginEnabled) errors.state = '账号状态已改变，请关闭并重新读取。';
    if (this.intent === 'RESTORE' && this.record && !mayEnableLogin(this.record.staff)) errors.state = '员工当前不能开通登录，请先核对员工资料。';
    this.#publish({ ...this.#snapshot, errors: Object.freeze(errors) }); return errors;
  }
  /** Password is an ephemeral call parameter only. No snapshot, local storage or retry payload contains it. */
  async submit(password = ''): Promise<void> {
    const options = this.#options;
    if (!options || !this.#snapshot.draft || !this.writesEnabled || this.locked || Object.keys(this.validate(typeof password === 'string' && password.length > 0)).length || this.intent === 'EDIT' && !this.#snapshot.dirty) return;
    const hasPassword = this.intent === 'CREATE' || this.intent === 'RESET_PASSWORD';
    if (hasPassword && !validPassword(password)) { this.#publish({ ...this.#snapshot, errors: Object.freeze({ password: '密码过长或不可用，请重新输入。' }), needsPasswordReentry: true }); return; }
    if (this.intent === 'CREATE') {
      const selectedId = this.#snapshot.draft.staff!.id;
      this.#publish({ ...this.#snapshot, needsPasswordReentry: true, write: { phase: 'checking', original: null, result: null, error: null } });
      try {
        const staff = await options.staffReader.readDetail({ parameters: { id: selectedId }, signal: this.#controller.signal, identity: this.scope.identity, routeInstanceId: this.scope.routeInstanceId, entityId: selectedId });
        if (!this.#alive()) return;
        if (!staff || staff.id !== selectedId || staff.account !== null) throw new AccountClientError('conflict', 'ACCOUNT_REFERENCE_UNAVAILABLE', 'not-sent');
        this.#publish({ ...this.#snapshot, draft: immutable({ ...this.#snapshot.draft!, staff: accountStaffCandidate(staff) }), write: emptyWrite() });
        if (Object.keys(this.validate(true)).length) return;
      } catch (error: unknown) {
        if (!this.#alive()) return;
        const safe = error instanceof AccountClientError ? error : error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')
          ? new AccountClientError(error.kind, error.kind === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'not-sent') : new AccountClientError('server', 'STAFF_READ_FAILED', 'not-sent');
        this.#publish({ ...this.#snapshot, write: { phase: 'rejected', original: null, result: null, error: safe } }); this.#accessFailure(safe); return;
      }
    }
    if (!this.#alive() || !this.writesEnabled) return;
    let command: AccountCommand;
    try { command = this.#command(options.newRequestKey(), password); }
    catch { this.#publish({ ...this.#snapshot, write: { phase: 'rejected', original: null, result: null, error: new AccountClientError('invalid-request', 'INVALID_ACCOUNT_COMMAND', 'not-sent') } }); return; }
    const original = accountReceiptIdentity(command);
    this.#publish({ ...this.#snapshot, passwordIntent: hasPassword, needsPasswordReentry: hasPassword, closePrompt: false, write: { phase: 'submitting', original, result: null, error: null } });
    try { const result = await options.client.execute(command, this.#controller.signal); if (this.#alive()) this.#commit(original, validateAccountResult(result, original)); }
    catch (error: unknown) {
      if (!this.#alive()) return;
      const safe = error instanceof AccountClientError ? error : new AccountClientError('malformed-response', 'INVALID_RESPONSE', 'uncertain');
      this.#publish({ ...this.#snapshot, write: { phase: ['not-sent', 'rejected'].includes(safe.outcome) ? 'rejected' : 'uncertain', original, result: null, error: safe } }); this.#accessFailure(safe);
    }
  }
  #command(requestKey: string, password: string): AccountCommand {
    const draft = this.#snapshot.draft!, record = this.record;
    if (this.intent === 'CREATE') return validateAccountCommand({ action: 'CREATE', requestKey, values: { staffId: draft.staff?.id, loginName: draft.loginName, loginEnabled: draft.loginEnabled, password } });
    const base = { action: this.intent, requestKey, id: record?.id, expectedVersion: record?.version };
    return validateAccountCommand(this.intent === 'EDIT' ? { ...base, values: { loginName: draft.loginName, loginEnabled: draft.loginEnabled } } : this.intent === 'RESET_PASSWORD' ? { ...base, password } : base);
  }
  async recover(): Promise<void> {
    const original = this.#snapshot.write.original, options = this.#options;
    if (!options || !original || !this.#alive() || this.#snapshot.write.phase !== 'uncertain') return;
    this.#publish({ ...this.#snapshot, write: { phase: 'recovering', original, result: null, error: null } });
    try { const receipt = await options.client.receipt(original, this.#controller.signal); if (this.#alive()) this.#commit(original, validateAccountReceipt(receipt, original).result); }
    catch (error: unknown) { if (!this.#alive()) return; const safe = error instanceof AccountClientError ? error : new AccountClientError('malformed-response', 'INVALID_RESPONSE', 'read'); this.#publish({ ...this.#snapshot, write: { phase: 'uncertain', original, result: null, error: safe } }); this.#accessFailure(safe); }
  }
  async readback(): Promise<void> {
    const options = this.#options, result = this.#snapshot.write.result, staffId = this.#snapshot.draft?.staff?.id;
    if (!options || !result || !staffId || !this.#alive() || this.#snapshot.write.phase !== 'committed' || this.#snapshot.readback.phase === 'loading') return;
    this.#publish({ ...this.#snapshot, readback: { phase: 'loading', record: null, error: null } });
    try {
      const record = await options.reader.readDetail({ parameters: { id: result.targetId }, signal: this.#controller.signal, identity: this.scope.identity, routeInstanceId: this.scope.routeInstanceId, entityId: result.targetId });
      if (this.#alive()) this.#publish({ ...this.#snapshot, readback: { phase: 'ready', record: immutable(validateAccountReadback(record, result, staffId)), error: null } });
    } catch (error: unknown) {
      if (!this.#alive()) return;
      const kind = error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden') ? error.kind : 'malformed-response';
      const safe = new AccountClientError(kind, kind === 'unauthenticated' ? 'UNAUTHENTICATED' : kind === 'forbidden' ? 'FORBIDDEN' : 'READBACK_FAILED', 'read');
      this.#publish({ ...this.#snapshot, readback: { phase: 'error', record: null, error: safe } }); this.#accessFailure(safe);
    }
  }
  requestClose(): boolean { if (this.#snapshot.disposed) return true; if (this.hasUnresolvedWrite) return false; if (!this.#snapshot.dirty) { this.dispose(); return true; } this.#publish({ ...this.#snapshot, closePrompt: true }); return false; }
  keepEditing(): void { if (!this.#snapshot.disposed) this.#publish({ ...this.#snapshot, closePrompt: false }); }
  discard(): boolean { if (this.hasUnresolvedWrite) return false; this.dispose(); return true; }
  canLeave(): boolean { return !this.hasUnresolvedWrite && !this.#snapshot.dirty; }
  dispose(): void { if (this.#snapshot.disposed) return; this.scope.signal.removeEventListener('abort', this.#abort); this.#controller.abort(); this.#record = null; this.#baseline = null; this.#publish({ draft: null, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: true, passwordIntent: false, needsPasswordReentry: false, write: emptyWrite(), readback: emptyRead() }); this.#listeners.clear(); }
  #alive(): boolean { return this.scope.active && !this.#snapshot.disposed; }
  #commit(original: AccountReceiptIdentity, result: AccountCommandResult): void { this.#publish({ ...this.#snapshot, dirty: false, closePrompt: false, passwordIntent: false, needsPasswordReentry: false, write: { phase: 'committed', original, result, error: null } }); try { this.#options?.onCommitted?.(result); } catch { /* Refresh cannot undo commit. */ } void this.readback(); }
  #accessFailure(error: AccountClientError): void { if (error.kind !== 'unauthenticated' && error.kind !== 'forbidden') return; if (error.kind === 'forbidden' && (this.hasUnresolvedWrite || this.#options?.hasOtherUnresolvedWrite?.())) return; this.scope.dispose(); try { this.#options?.onAccessFailure(error.kind); } catch { /* Identity cleared. */ } }
  #publish(snapshot: AccountEditorSnapshot): void { this.#snapshot = Object.freeze({ ...snapshot, write: Object.freeze(snapshot.write), readback: Object.freeze(snapshot.readback) }); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Continue cleanup. */ } } }
}
export interface AccountWorkspaceOptions extends AccountEditorOptions { readonly scope: ReadScope }
export function createAccountSettingsWorkspace(options: AccountWorkspaceOptions) {
  let snapshot: AccountSettingsController | null = null; const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Consumer only. */ } } };
  const matches = (scope: ReadScope) => options.scope.active && scope.active && ['accountId', 'sessionRevision', 'permissionRevision'].every(key => options.scope.identity[key as keyof typeof scope.identity] === scope.identity[key as keyof typeof scope.identity]);
  options.scope.signal.addEventListener('abort', () => { snapshot?.dispose(); snapshot = null; notify(); listeners.clear(); }, { once: true });
  return Object.freeze({ scope: options.scope, matches, getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(record: AccountSettingsRecord | null, intent: AccountIntent = record ? 'EDIT' : 'CREATE'): AccountSettingsController | null {
      if (!options.scope.active) return null; if (snapshot && !snapshot.canLeave()) { snapshot.requestClose(); return null; } snapshot?.dispose(); snapshot = new AccountSettingsController(options.scope, record, intent, options); notify(); return snapshot;
    },
    close(): boolean { if (snapshot && !snapshot.getSnapshot().disposed && !snapshot.canLeave()) { snapshot.requestClose(); return false; } if (snapshot && !snapshot.discard()) return false; snapshot = null; notify(); return true; },
    canLeave: () => snapshot?.canLeave() ?? true, hasUnresolvedWrite: () => snapshot?.hasUnresolvedWrite ?? false, dispose: () => options.scope.dispose(),
  });
}
export type AccountSettingsWorkspace = ReturnType<typeof createAccountSettingsWorkspace>;
export function accountRejectionMessage(code: string): string {
  return ({ VERSION_CONFLICT: '账号已被他人修改，请关闭并重新读取，不能强制覆盖。', ACCOUNT_LOGIN_CONFLICT: '登录名已被使用，或所选员工已有账号。', LAST_AVAILABLE_ADMIN: '必须保留至少一名可正常登录的在职管理员。',
    ACCOUNT_REFERENCE_UNAVAILABLE: '员工不存在、已有账号或当前不允许开通登录，请重新读取员工资料。', INVALID_ACCOUNT_STATE: '登录状态已改变，请重新读取。', ACCOUNT_NOT_FOUND: '账号不存在或不可访问。',
    NO_ACCOUNT_CHANGE: '资料没有变化，无需提交。', VERSION_STORAGE_OVERFLOW: '资料版本已达技术上限。', IDEMPOTENCY_CONFLICT: '操作身份已被其他内容使用，请核实后重新准备。',
    INVALID_ACCOUNT_PASSWORD: '密码不符合当前要求，请重新输入。', ACCOUNT_CREDENTIALS_NOT_READY: '账号服务暂未就绪，本次保存未执行。', STAFF_READ_FAILED: '员工资料读取失败，请重试读取后再保存。', HTTPS_REQUIRED: '请通过安全连接提交密码。' } as Readonly<Record<string, string>>)[code] ?? '请求未被接受，请检查填写内容后再提交。';
}
