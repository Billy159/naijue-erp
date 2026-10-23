import type { ReadScope } from '../loading/read-scope.ts';
import type { SettingsErrors, SettingsReference } from '../settings/stores/maintenance-contracts.ts';
import { initialPaymentSettingsQuery, PaymentClientError, type PaymentCommand, type PaymentCommandClient, type PaymentCommandResult, type PaymentSettingsDraft, type PaymentSettingsKind, type PaymentSettingsRecord, type PaymentSettingsQuery } from './contracts.ts';
import { validatePaymentCommand, validatePaymentResult, validatePaymentReceipt, validatePaymentSettingsDraft } from './response-validation.ts';

export interface PaymentWriteState {
  readonly phase: 'idle' | 'submitting' | 'uncertain' | 'recovering' | 'rejected' | 'committed';
  readonly command: PaymentCommand | null; readonly result: PaymentCommandResult | null; readonly error: PaymentClientError | null;
}
export interface PaymentEditorSnapshot {
  readonly draft: Readonly<PaymentSettingsDraft> | null; readonly errors: SettingsErrors;
  readonly dirty: boolean; readonly closePrompt: boolean; readonly disposed: boolean; readonly write: PaymentWriteState;
}
export interface PaymentEditorOptions {
  readonly client: PaymentCommandClient; readonly newRequestKey: () => string;
  /** C/F1 alone may enable this after the backend/PG gate. Defaults to no write composition. */
  readonly writesEnabled: () => boolean;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onCommitted?: (kind: PaymentSettingsKind, result: PaymentCommandResult) => void;
  readonly hasOtherUnresolvedWrite?: () => boolean;
}
function immutable<T>(value: T): T {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => { if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); } };
  freeze(copy); return copy;
}
const emptyWrite = (): PaymentWriteState => Object.freeze({ phase: 'idle', command: null, result: null, error: null });
const unresolved = (write: PaymentWriteState) => ['submitting', 'uncertain', 'recovering'].includes(write.phase);

/** Owns one immutable original command until a strict result/receipt proves its outcome.
 * Route unmount must never dispose a session-owned editor. Identity invalidation must. */
export class PaymentSettingsController {
  readonly kind: PaymentSettingsKind;
  #record: PaymentSettingsRecord | null;
  readonly scope: ReadScope;
  readonly #options: PaymentEditorOptions | undefined;
  readonly #listeners = new Set<() => void>();
  #baseline: Readonly<PaymentSettingsDraft> | null;
  #snapshot: PaymentEditorSnapshot;
  readonly #abort = () => this.dispose();
  constructor(scope: ReadScope, kind: PaymentSettingsKind, record: PaymentSettingsRecord | null, options?: PaymentEditorOptions) {
    if (record && record.kind !== kind) throw new TypeError('Payment form kind does not match its record');
    this.scope = scope; this.kind = kind; this.#record = immutable(record); this.#options = options;
    this.#baseline = immutable({ name: record?.name ?? '', enabled: record?.enabled ?? true,
      method: record?.kind === 'accounts' ? record.paymentMethod : null, halls: record?.kind === 'accounts' ? record.halls : [] });
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false, write: emptyWrite() });
    scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): PaymentEditorSnapshot => this.#snapshot;
  get record(): PaymentSettingsRecord | null { return this.#record; }
  subscribe = (listener: () => void): (() => void) => { if (this.#snapshot.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get writesEnabled(): boolean { return this.scope.active && !this.#snapshot.disposed && this.#options?.writesEnabled() === true; }
  get hasUnresolvedWrite(): boolean { return unresolved(this.#snapshot.write); }
  get locked(): boolean { return this.hasUnresolvedWrite || this.#snapshot.write.phase === 'committed'; }
  update(patch: Partial<PaymentSettingsDraft>): void {
    if (!this.scope.active || this.#snapshot.disposed || !this.#snapshot.draft || this.locked) return;
    const draft = immutable({ ...this.#snapshot.draft, ...patch });
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), dirty: JSON.stringify(draft) !== JSON.stringify(this.#baseline), closePrompt: false });
  }
  validate(): SettingsErrors {
    if (!this.#snapshot.draft || this.#snapshot.disposed) return Object.freeze({});
    const errors = Object.freeze({ ...validatePaymentSettingsDraft(this.kind, this.#snapshot.draft) });
    this.#publish({ ...this.#snapshot, errors }); return errors;
  }
  async submit(): Promise<void> {
    const options = this.#options, draft = this.#snapshot.draft;
    if (!options || !draft || !this.writesEnabled || this.locked || Object.keys(this.validate()).length) return;
    if (this.record && !this.#snapshot.dirty) return;
    let command: PaymentCommand;
    try {
      const values = this.kind === 'methods' ? { name: draft.name, enabled: draft.enabled }
        : { name: draft.name, enabled: draft.enabled, paymentMethodId: draft.method?.id, hallIds: draft.halls.map(hall => hall.id) };
      command = immutable(validatePaymentCommand(this.kind, this.record
        ? { action: 'EDIT', requestKey: options.newRequestKey(), id: this.record.id, expectedVersion: this.record.version, values }
        : { action: 'CREATE', requestKey: options.newRequestKey(), values }));
    } catch {
      this.#publish({ ...this.#snapshot, write: { phase: 'rejected', command: null, result: null, error: new PaymentClientError('invalid-request', 'INVALID_PAYMENT_COMMAND', 'not-sent') } }); return;
    }
    this.#publish({ ...this.#snapshot, closePrompt: false, write: { phase: 'submitting', command, result: null, error: null } });
    try {
      const result = await options.client.execute(this.kind, command, this.scope.signal);
      if (!this.scope.active || this.#snapshot.disposed) return;
      this.#commit(command, validatePaymentResult(result, this.kind, command));
    } catch (error: unknown) {
      if (!this.scope.active || this.#snapshot.disposed) return;
      const safe = error instanceof PaymentClientError ? error : new PaymentClientError('malformed-response', 'INVALID_RESPONSE', 'uncertain');
      const uncertain = !['not-sent', 'rejected'].includes(safe.outcome);
      this.#publish({ ...this.#snapshot, write: { phase: uncertain ? 'uncertain' : 'rejected', command, result: null, error: safe } });
      this.#accessFailure(safe);
    }
  }
  /** Read only. A missing/forbidden/cancelled receipt never proves rollback. */
  async recover(): Promise<void> {
    const options = this.#options, command = this.#snapshot.write.command;
    if (!options || !command || !this.scope.active || this.#snapshot.disposed || this.#snapshot.write.phase !== 'uncertain') return;
    this.#publish({ ...this.#snapshot, write: { phase: 'recovering', command, result: null, error: null } });
    try {
      const result = await options.client.receipt(this.kind, command, this.scope.signal);
      if (!this.scope.active || this.#snapshot.disposed) return;
      this.#commit(command, validatePaymentReceipt(result, this.kind, command).result);
    } catch (error: unknown) {
      if (!this.scope.active || this.#snapshot.disposed) return;
      const safe = error instanceof PaymentClientError ? error : new PaymentClientError('malformed-response', 'INVALID_RESPONSE', 'read');
      this.#publish({ ...this.#snapshot, write: { phase: 'uncertain', command, result: null, error: safe } }); this.#accessFailure(safe);
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
    this.scope.signal.removeEventListener('abort', this.#abort); this.#baseline = null; this.#record = null;
    this.#publish({ draft: null, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: true, write: emptyWrite() }); this.#listeners.clear();
  }
  #commit(command: PaymentCommand, result: PaymentCommandResult): void {
    this.#publish({ ...this.#snapshot, dirty: false, closePrompt: false, write: { phase: 'committed', command, result, error: null } });
    try { this.#options?.onCommitted?.(this.kind, result); } catch { /* A host refresh failure cannot undo a proven commit. */ }
  }
  #accessFailure(error: PaymentClientError): void {
    if (error.kind !== 'unauthenticated' && error.kind !== 'forbidden') return;
    if (error.kind === 'forbidden' && (this.hasUnresolvedWrite || this.#options?.hasOtherUnresolvedWrite?.())) return;
    this.scope.dispose();
    try { this.#options?.onAccessFailure(error.kind); } catch { /* Scope is already cleared. */ }
  }
  #publish(snapshot: PaymentEditorSnapshot): void {
    this.#snapshot = Object.freeze({ ...snapshot, write: Object.freeze(snapshot.write) });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Identity cleanup must still finish. */ } }
  }
}

/** Bounded presentation context owned by the existing authenticated workspace.
 * Route requests/results and DOM stay with the mounted page. */
export interface PaymentSettingsViewState {
  tab: PaymentSettingsKind;
  drafts: Record<PaymentSettingsKind, PaymentSettingsQuery>;
  executed: Record<PaymentSettingsKind, PaymentSettingsQuery>;
  method: SettingsReference | null;
  readonly tableScroll: { top: number; left: number };
}
export function createPaymentSettingsViewState(tab: PaymentSettingsKind = 'methods'): PaymentSettingsViewState {
  return { tab, drafts: { methods: { ...initialPaymentSettingsQuery }, accounts: { ...initialPaymentSettingsQuery } },
    executed: { methods: { ...initialPaymentSettingsQuery }, accounts: { ...initialPaymentSettingsQuery } },
    method: null, tableScroll: { top: 0, left: 0 } };
}
export interface PaymentWorkspaceOptions extends Omit<PaymentEditorOptions, 'hasOtherUnresolvedWrite'> { readonly scope: ReadScope }
/** Two bounded session editors. No localStorage, shared global cache or route-owned command. */
export function createPaymentSettingsWorkspace(options: PaymentWorkspaceOptions) {
  let snapshot: Readonly<Record<PaymentSettingsKind, PaymentSettingsController | null>> = Object.freeze({ methods: null, accounts: null });
  let viewState: PaymentSettingsViewState | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Consumer only. */ } } };
  const matches = (scope: ReadScope) => options.scope.active && scope.active
    && ['accountId', 'sessionRevision', 'permissionRevision'].every(key => options.scope.identity[key as keyof typeof scope.identity] === scope.identity[key as keyof typeof scope.identity]);
  const close = (kind: PaymentSettingsKind): boolean => {
    const editor = snapshot[kind];
    if (editor && !editor.getSnapshot().disposed && !editor.canLeave()) { editor.requestClose(); return false; }
    if (editor && !editor.discard()) return false;
    snapshot = Object.freeze({ ...snapshot, [kind]: null }); notify(); return true;
  };
  options.scope.signal.addEventListener('abort', () => { for (const editor of Object.values(snapshot)) editor?.dispose(); snapshot = Object.freeze({ methods: null, accounts: null }); viewState = null; notify(); listeners.clear(); }, { once: true });
  return Object.freeze({ scope: options.scope, matches,
    getViewState: (initialTab?: PaymentSettingsKind): PaymentSettingsViewState | null => {
      if (!options.scope.active) return null;
      return viewState ??= createPaymentSettingsViewState(initialTab);
    },
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(kind: PaymentSettingsKind, record: PaymentSettingsRecord | null): PaymentSettingsController | null {
      if (!options.scope.active || (kind !== 'methods' && kind !== 'accounts')) return null;
      const previous = snapshot[kind];
      if (previous && !previous.canLeave()) { previous.requestClose(); return null; }
      previous?.dispose();
      const editor = new PaymentSettingsController(options.scope, kind, record, { ...options,
        hasOtherUnresolvedWrite: () => Object.values(snapshot).some(item => item?.hasUnresolvedWrite) });
      snapshot = Object.freeze({ ...snapshot, [kind]: editor }); notify(); return editor;
    }, close,
    hasUnresolvedWrite: () => Object.values(snapshot).some(editor => editor?.hasUnresolvedWrite),
    canLeave: () => Object.values(snapshot).every(editor => editor?.canLeave() ?? true),
    dispose: () => options.scope.dispose(),
  });
}
export type PaymentSettingsWorkspace = ReturnType<typeof createPaymentSettingsWorkspace>;

export function paymentRejectionMessage(code: string): string {
  return ({ VERSION_CONFLICT: '资料已被他人修改。输入已保留，请关闭并重新读取最新资料后再准备，不能强制覆盖。',
    IMMUTABLE_PAYMENT_METHOD: '资金账户不能更换所属收款方式，请新建账户。', PAYMENT_METHOD_IN_USE: '仍有正常使用的资金账户引用此收款方式，不能停用。',
    PAYMENT_REFERENCE_UNAVAILABLE: '所选收款方式或新增营业厅已不可用，请重新选择。', PAYMENT_RELATION_IN_USE: '该营业厅关联被来源记录引用，不能移除。',
    NO_PAYMENT_CHANGE: '资料没有变化，无需提交。', INVALID_PAYMENT_STATE: '使用状态已改变，请重新读取。', VERSION_STORAGE_OVERFLOW: '资料版本已达技术上限，不能变更。',
    IDEMPOTENCY_CONFLICT: '操作身份已被其他内容使用，请核实后重新准备。' } as Readonly<Record<string, string>>)[code] ?? '请求已被拒绝，填写内容已保留。请检查后再提交。';
}
