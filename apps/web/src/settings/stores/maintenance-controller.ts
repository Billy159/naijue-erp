import { initialStoreSettingsQuery } from './controller.ts';
import type { StoreSettingsListQuery } from './contracts.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { SettingsErrors } from './maintenance-contracts.ts';

export interface SettingsDraftSnapshot<T> {
  readonly draft: Readonly<T> | null; readonly errors: SettingsErrors;
  readonly dirty: boolean; readonly closePrompt: boolean; readonly disposed: boolean;
}
function immutable<T>(value: T): T {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); }
  };
  freeze(copy); return copy;
}
/** Local editable preparation only. No submit, success, key generation, persistence
 * or speculative write DTO is installed before the B05 contract is frozen. */
export class SettingsDraftController<T extends object> {
  readonly #scope: ReadScope;
  readonly #validate: (draft: Readonly<T>) => SettingsErrors;
  readonly #listeners = new Set<() => void>();
  #baseline: Readonly<T> | null;
  #snapshot: SettingsDraftSnapshot<T>;
  readonly #abort = () => this.dispose();
  constructor(scope: ReadScope, initial: T, validate: (draft: Readonly<T>) => SettingsErrors) {
    this.#scope = scope; this.#validate = validate; this.#baseline = immutable(initial);
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false });
    scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): SettingsDraftSnapshot<T> => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (this.#snapshot.disposed) return () => {};
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  };
  #publish(next: SettingsDraftSnapshot<T>): void {
    this.#snapshot = Object.freeze(next);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Consumer cannot prevent clearing private form state. */ } }
  }
  update(patch: Partial<T>): void {
    if (!this.#scope.active || this.#snapshot.disposed || !this.#snapshot.draft) return;
    const draft = immutable({ ...this.#snapshot.draft, ...patch }) as Readonly<T>;
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), dirty: JSON.stringify(draft) !== JSON.stringify(this.#baseline), closePrompt: false });
  }
  validate(): SettingsErrors {
    if (!this.#scope.active || this.#snapshot.disposed || !this.#snapshot.draft) return Object.freeze({});
    const errors = Object.freeze({ ...this.#validate(this.#snapshot.draft) });
    this.#publish({ ...this.#snapshot, errors }); return errors;
  }
  requestClose(): boolean {
    if (this.#snapshot.disposed) return true;
    if (!this.#snapshot.dirty) { this.dispose(); return true; }
    this.#publish({ ...this.#snapshot, closePrompt: true }); return false;
  }
  keepEditing(): void { if (!this.#snapshot.disposed) this.#publish({ ...this.#snapshot, closePrompt: false }); }
  canLeave(): boolean { return !this.#snapshot.dirty; }
  dispose(): void {
    if (this.#snapshot.disposed) return;
    this.#scope.signal.removeEventListener('abort', this.#abort); this.#baseline = null;
    this.#publish({ draft: null, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: true }); this.#listeners.clear();
  }
}

import type { StoreSettingsEntry, StoreSettingsKind } from './contracts.ts';
import { StoreCommandError, type StoreCommand, type StoreCommandClient, type StoreCommandResult, type StoreMaintenanceDraft } from './maintenance-contracts.ts';
import { storeMaintenanceDraft, validateStoreMaintenanceDraft, validateStoreCommand, validateStoreResult, validateStoreReceipt } from './maintenance-validation.ts';
export interface StoreWriteState {
  readonly phase: 'idle' | 'submitting' | 'uncertain' | 'recovering' | 'rejected' | 'committed';
  readonly command: StoreCommand | null; readonly result: StoreCommandResult | null; readonly error: StoreCommandError | null;
}
export interface StoreEditorSnapshot {
  readonly draft: Readonly<StoreMaintenanceDraft> | null; readonly errors: SettingsErrors;
  readonly dirty: boolean; readonly closePrompt: boolean; readonly disposed: boolean; readonly write: StoreWriteState;
}
export interface StoreEditorOptions {
  readonly client: StoreCommandClient; readonly newRequestKey: () => string;
  /** C/F1 alone may enable this after the backend/PG gate. Defaults to no write composition. */
  readonly writesEnabled: () => boolean;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void;
  readonly onCommitted?: (kind: StoreSettingsKind, result: StoreCommandResult) => void;
  readonly hasOtherUnresolvedWrite?: () => boolean;
}
const emptyWrite = (): StoreWriteState => Object.freeze({ phase: 'idle', command: null, result: null, error: null });
const unresolved = (write: StoreWriteState) => ['submitting', 'uncertain', 'recovering'].includes(write.phase);

/** Owns one immutable original command until a strict result/receipt proves its outcome.
 * Route unmount must never dispose a session-owned editor. Identity invalidation must. */
export class StoreMaintenanceController {
  readonly kind: StoreSettingsKind;
  #record: StoreSettingsEntry | null;
  readonly scope: ReadScope;
  readonly #options: StoreEditorOptions | undefined;
  readonly #listeners = new Set<() => void>();
  #baseline: Readonly<StoreMaintenanceDraft> | null;
  #snapshot: StoreEditorSnapshot;
  readonly #abort = () => this.dispose();
  constructor(scope: ReadScope, kind: StoreSettingsKind, record: StoreSettingsEntry | null, options?: StoreEditorOptions) {
    if (record && record.kind !== kind) throw new TypeError('Store form kind does not match its record');
    this.scope = scope; this.kind = kind; this.#record = immutable(record); this.#options = options;
    this.#baseline = immutable(storeMaintenanceDraft(record));
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false, write: emptyWrite() });
    scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): StoreEditorSnapshot => this.#snapshot;
  get record(): StoreSettingsEntry | null { return this.#record; }
  subscribe = (listener: () => void): (() => void) => { if (this.#snapshot.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get writesEnabled(): boolean { return this.scope.active && !this.#snapshot.disposed && this.#options?.writesEnabled() === true; }
  get hasUnresolvedWrite(): boolean { return unresolved(this.#snapshot.write); }
  get locked(): boolean { return this.hasUnresolvedWrite || this.#snapshot.write.phase === 'committed'; }
  update(patch: Partial<StoreMaintenanceDraft>): void {
    if (!this.scope.active || this.#snapshot.disposed || !this.#snapshot.draft || this.locked) return;
    const draft = immutable({ ...this.#snapshot.draft, ...patch });
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), dirty: JSON.stringify(draft) !== JSON.stringify(this.#baseline), closePrompt: false });
  }
  validate(): SettingsErrors {
    if (!this.#snapshot.draft || this.#snapshot.disposed) return Object.freeze({});
    const errors = Object.freeze({ ...validateStoreMaintenanceDraft(this.kind, this.#snapshot.draft, this.record) });
    this.#publish({ ...this.#snapshot, errors }); return errors;
  }
  async submit(): Promise<void> {
    const options = this.#options, draft = this.#snapshot.draft;
    if (!options || !draft || !this.writesEnabled || this.locked || Object.keys(this.validate()).length) return;
    if (this.record && !this.#snapshot.dirty) return;
    let command: StoreCommand;
    try {
      const values = this.kind === 'stores' ? { name: draft.name, enabled: draft.enabled, defaultCustomerId: draft.customer?.id ?? null, defaultSalesWarehouseId: draft.warehouse?.id ?? null }
        : { name: draft.name, enabled: draft.enabled, hallId: draft.hall?.id };
      command = immutable(validateStoreCommand(this.kind, this.record
        ? { action: 'EDIT', requestKey: options.newRequestKey(), id: this.record.id, expectedVersion: this.record.version, values }
        : { action: 'CREATE', requestKey: options.newRequestKey(), values }));
    } catch {
      this.#publish({ ...this.#snapshot, write: { phase: 'rejected', command: null, result: null, error: new StoreCommandError('invalid-request', 'INVALID_ORGANIZATION_COMMAND', 'not-sent') } }); return;
    }
    this.#publish({ ...this.#snapshot, closePrompt: false, write: { phase: 'submitting', command, result: null, error: null } });
    try {
      const result = await options.client.execute(this.kind, command, this.scope.signal);
      if (!this.scope.active || this.#snapshot.disposed) return;
      this.#commit(command, validateStoreResult(result, this.kind, command));
    } catch (error: unknown) {
      if (!this.scope.active || this.#snapshot.disposed) return;
      const safe = error instanceof StoreCommandError ? error : new StoreCommandError('malformed-response', 'INVALID_RESPONSE', 'uncertain');
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
      this.#commit(command, validateStoreReceipt(result, this.kind, command).result);
    } catch (error: unknown) {
      if (!this.scope.active || this.#snapshot.disposed) return;
      const safe = error instanceof StoreCommandError ? error : new StoreCommandError('malformed-response', 'INVALID_RESPONSE', 'read');
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
  #commit(command: StoreCommand, result: StoreCommandResult): void {
    this.#publish({ ...this.#snapshot, dirty: false, closePrompt: false, write: { phase: 'committed', command, result, error: null } });
    try { this.#options?.onCommitted?.(this.kind, result); } catch { /* A host refresh failure cannot undo a proven commit. */ }
  }
  #accessFailure(error: StoreCommandError): void {
    if (error.kind !== 'unauthenticated' && error.kind !== 'forbidden') return;
    if (error.kind === 'forbidden' && (this.hasUnresolvedWrite || this.#options?.hasOtherUnresolvedWrite?.())) return;
    this.scope.dispose();
    try { this.#options?.onAccessFailure(error.kind); } catch { /* Scope is already cleared. */ }
  }
  #publish(snapshot: StoreEditorSnapshot): void {
    this.#snapshot = Object.freeze({ ...snapshot, write: Object.freeze(snapshot.write) });
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Identity cleanup must still finish. */ } }
  }
}

/** Bounded input context from the frozen App; never stores rows or read owners. */
export interface StoreSettingsQueryUi {
  draft: StoreSettingsListQuery; applied: StoreSettingsListQuery;
  hallSelection: { id: string; name: string } | null;
  readonly tableScroll: { top: number; left: number };
}
export interface StoreSettingsViewState {
  tab: StoreSettingsKind;
  readonly tabs: Record<StoreSettingsKind, StoreSettingsQueryUi>;
}
export function createStoreSettingsViewState(tab: StoreSettingsKind = 'stores'): StoreSettingsViewState {
  const tableScroll = { top: 0, left: 0 };
  const empty = (): StoreSettingsQueryUi => ({ draft: { ...initialStoreSettingsQuery }, applied: { ...initialStoreSettingsQuery }, hallSelection: null, tableScroll });
  return { tab, tabs: { stores: empty(), warehouses: empty() } };
}
export interface StoreWorkspaceOptions extends Omit<StoreEditorOptions, 'hasOtherUnresolvedWrite'> { readonly scope: ReadScope }
/** Two bounded session editors. No localStorage, shared global cache or route-owned command. */
export function createStoreMaintenanceWorkspace(options: StoreWorkspaceOptions) {
  let snapshot: Readonly<Record<StoreSettingsKind, StoreMaintenanceController | null>> = Object.freeze({ stores: null, warehouses: null });
  let viewState: StoreSettingsViewState | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Consumer only. */ } } };
  const matches = (scope: ReadScope) => options.scope.active && scope.active
    && ['accountId', 'sessionRevision', 'permissionRevision'].every(key => options.scope.identity[key as keyof typeof scope.identity] === scope.identity[key as keyof typeof scope.identity]);
  const close = (kind: StoreSettingsKind): boolean => {
    const editor = snapshot[kind];
    if (editor && !editor.getSnapshot().disposed && !editor.canLeave()) { editor.requestClose(); return false; }
    if (editor && !editor.discard()) return false;
    snapshot = Object.freeze({ ...snapshot, [kind]: null }); notify(); return true;
  };
  options.scope.signal.addEventListener('abort', () => { for (const editor of Object.values(snapshot)) editor?.dispose(); snapshot = Object.freeze({ stores: null, warehouses: null }); viewState = null; notify(); listeners.clear(); }, { once: true });
  return Object.freeze({ scope: options.scope, matches, writesEnabled: () => options.scope.active && options.writesEnabled() === true,
    getViewState: (initialTab?: StoreSettingsKind): StoreSettingsViewState | null => options.scope.active ? viewState ??= createStoreSettingsViewState(initialTab) : null,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(kind: StoreSettingsKind, record: StoreSettingsEntry | null): StoreMaintenanceController | null {
      if (!options.scope.active || (kind !== 'stores' && kind !== 'warehouses')) return null;
      const previous = snapshot[kind];
      if (previous && !previous.canLeave()) { previous.requestClose(); return null; }
      previous?.dispose();
      const editor = new StoreMaintenanceController(options.scope, kind, record, { ...options,
        hasOtherUnresolvedWrite: () => Object.values(snapshot).some(item => item?.hasUnresolvedWrite) });
      snapshot = Object.freeze({ ...snapshot, [kind]: editor }); notify(); return editor;
    }, close,
    hasUnresolvedWrite: () => Object.values(snapshot).some(editor => editor?.hasUnresolvedWrite),
    canLeave: () => Object.values(snapshot).every(editor => editor?.canLeave() ?? true),
    dispose: () => options.scope.dispose(),
  });
}
export type StoreMaintenanceWorkspace = ReturnType<typeof createStoreMaintenanceWorkspace>;

export function storeRejectionMessage(code: string): string {
  return ({ VERSION_CONFLICT: '资料已被他人修改。输入已保留，请关闭并重新读取最新资料后再准备，不能强制覆盖。',
    ORGANIZATION_REFERENCE_UNAVAILABLE: '所选营业厅、默认客户或默认出库仓已不可用，或出库仓不属于本厅，请检查后重新选择。',
    WAREHOUSE_DEFAULT_IN_USE: '该仓库仍被营业厅作为默认出库仓引用，不能停用或移到其他营业厅。请先明确调整对应默认设置。',
    NO_ORGANIZATION_CHANGE: '资料没有变化，无需提交。', INVALID_ORGANIZATION_STATE: '使用状态已改变，请重新读取。', VERSION_STORAGE_OVERFLOW: '资料版本已达技术上限，不能变更。',
    IDEMPOTENCY_CONFLICT: '操作身份已被其他内容使用，请核实后重新准备。' } as Readonly<Record<string, string>>)[code] ?? '请求已被拒绝，填写内容已保留。请检查后再提交。';
}
