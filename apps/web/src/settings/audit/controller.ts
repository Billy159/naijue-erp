import { LatestQuery } from '../../loading/latest-query.ts';
import { ReadScope } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import { auditModules, blankAuditDraft, type SettingsAuditDraft, type SettingsAuditModule, type SettingsAuditPage, type SettingsAuditQuery, type SettingsAuditReader, type SettingsAuditTarget } from './contracts.ts';
import { parseSettingsAuditQuery, validAuditDate, validateSettingsAuditPage } from './http-reader.ts';
export interface SettingsAuditControllerOptions {
  readonly scope: ReadScope; readonly reader?: SettingsAuditReader; readonly allowedModules: readonly SettingsAuditModule[]; readonly target?: SettingsAuditTarget;
  readonly onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void; readonly hasUnresolvedWrite?: () => boolean;
}
export interface SettingsAuditSnapshot { readonly draft: SettingsAuditDraft | null; readonly errors: Readonly<Record<string, string>>; readonly disposed: boolean; readonly readDenied: boolean }
/** One user-opened read layer, independent of every command/recovery workspace. */
export class SettingsAuditController {
  readonly scope: ReadScope; readonly query: LatestQuery<SettingsAuditQuery, SettingsAuditPage>; readonly allowedModules: readonly SettingsAuditModule[];
  readonly #options: SettingsAuditControllerOptions; readonly #listeners = new Set<() => void>(); readonly #initial: SettingsAuditDraft; readonly #unwatchQuery: () => void;
  #snapshot: SettingsAuditSnapshot; #started = false;
  constructor(options: SettingsAuditControllerOptions) {
    if (new Set(options.allowedModules).size !== options.allowedModules.length || options.allowedModules.some(module => !auditModules.includes(module))) throw new TypeError('Invalid explicit audit presentation capabilities');
    this.#options = options; this.allowedModules = Object.freeze([...options.allowedModules]);
    this.scope = new ReadScope(options.scope.identity, `${options.scope.routeInstanceId}:settings-audit`, options.target?.objectId ?? null, () => {});
    this.#initial = Object.freeze({ ...blankAuditDraft, ...(options.target ? { module: options.target.module, objectId: options.target.objectId } : {}) });
    this.#snapshot = Object.freeze({ draft: this.#initial, errors: Object.freeze({}), disposed: false, readDenied: false });
    this.query = new LatestQuery({ scope: this.scope, execute: async read => {
      if (!options.reader) throw new HttpQueryError('not-implemented', 'SETTINGS_AUDIT_NOT_CONFIGURED');
      const page = validateSettingsAuditPage(await options.reader.readQuery(read), read.parameters);
      if (page.items.some(item => !this.allowedModules.includes(item.module))) throw new HttpQueryError('malformed-response', 'INVALID_RESPONSE');
      return page;
    } });
    // Observe before UI listeners: LatestQuery deliberately drops error during retry,
    // while retaining success. Redaction outlives that transient request state.
    this.#unwatchQuery = this.query.subscribe(() => {
      const read = this.query.getSnapshot();
      const readDenied = read.phase === 'success' ? false
        : read.phase === 'error' && read.error instanceof HttpQueryError && read.error.kind === 'forbidden' ? true : this.#snapshot.readDenied;
      if (!this.#snapshot.disposed && readDenied !== this.#snapshot.readDenied) this.#publish({ ...this.#snapshot, readDenied });
    });
    options.scope.signal.addEventListener('abort', this.dispose, { once: true }); if (!options.scope.active) this.dispose();
  }
  getSnapshot = (): SettingsAuditSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { if (this.#snapshot.disposed) return () => {}; this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  get available(): boolean { return this.scope.active && this.#options.scope.active && !this.#snapshot.disposed && !!this.#options.reader && this.allowedModules.length > 0; }
  get targetLocked(): boolean { return this.#options.target !== undefined; }
  update(patch: Partial<Omit<SettingsAuditDraft, 'objectId'>>): void {
    const old = this.#snapshot.draft; if (!old || !this.scope.active || this.#snapshot.disposed) return;
    const module = this.targetLocked ? old.module : patch.module ?? old.module;
    if (module !== 'ALL' && !this.allowedModules.includes(module)) return;
    const draft: SettingsAuditDraft = Object.freeze({ module, objectId: old.objectId, objectSearch: patch.objectSearch ?? old.objectSearch, actorSearch: patch.actorSearch ?? old.actorSearch,
      action: patch.action ?? old.action, dateFrom: patch.dateFrom === undefined ? old.dateFrom : patch.dateFrom, dateTo: patch.dateTo === undefined ? old.dateTo : patch.dateTo });
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}) });
  }
  start(): void { if (this.#started || !this.available) return; this.#started = true; this.apply(); }
  apply(): void { const draft = this.#snapshot.draft; if (!draft || !this.available || !this.#valid(draft)) return; const previous = this.query.getSnapshot(); void this.#run({ ...draft, page: 1, pageSize: previous.success?.parameters.pageSize ?? previous.request?.parameters.pageSize ?? 20 }); }
  reset(): void { if (!this.scope.active || this.#snapshot.disposed) return; this.#publish({ ...this.#snapshot, draft: this.#initial, errors: Object.freeze({}) }); this.apply(); }
  retry(): void { const state = this.query.getSnapshot(); if (this.available && state.phase === 'error' && state.request) void this.#run(state.request.parameters); }
  page(page: number): void {
    const state = this.query.getSnapshot(), success = state.success; if (!this.available || state.phase === 'loading' || !success || !Number.isSafeInteger(page) || page < 1
      || page > Math.max(1, Math.ceil(success.data.total / success.parameters.pageSize))) return;
    void this.#run({ ...success.parameters, page });
  }
  pageSize(pageSize: 20 | 50 | 100): void { const state = this.query.getSnapshot(); if (!this.available || state.phase === 'loading' || ![20, 50, 100].includes(pageSize)) return; void this.#run({ ...(state.success?.parameters ?? state.request?.parameters ?? { ...this.#initial, page: 1, pageSize: 20 }), page: 1, pageSize }); }
  readonly dispose = (): void => { if (this.#snapshot.disposed) return; this.#options.scope.signal.removeEventListener('abort', this.dispose); this.#unwatchQuery(); this.scope.dispose(); this.query.dispose(); this.#publish({ draft: null, errors: Object.freeze({}), disposed: true, readDenied: false }); this.#listeners.clear(); };
  #valid(draft: SettingsAuditDraft): boolean {
    const errors: Record<string, string> = {};
    if (draft.objectSearch.length > 200 || /[\x00-\x1f\x7f]/.test(draft.objectSearch)) errors.objectSearch = '对象搜索最长200字，不能含不可用字符。';
    if (draft.actorSearch.length > 200 || /[\x00-\x1f\x7f]/.test(draft.actorSearch)) errors.actorSearch = '操作人搜索最长200字，不能含不可用字符。';
    if (draft.dateFrom !== null && !validAuditDate(draft.dateFrom)) errors.dateFrom = '请输入有效开始日期。';
    if (draft.dateTo !== null && !validAuditDate(draft.dateTo)) errors.dateTo = '请输入有效结束日期。';
    if (draft.dateFrom && draft.dateTo && !errors.dateFrom && !errors.dateTo && draft.dateFrom > draft.dateTo) errors.dateTo = '结束日期不能早于开始日期。';
    if (draft.module !== 'ALL' && !this.allowedModules.includes(draft.module)) errors.module = '当前未开放此模块的操作记录。';
    try { parseSettingsAuditQuery({ ...draft, page: 1, pageSize: 20 }); } catch { if (!Object.keys(errors).length) errors.query = '筛选条件不可用，请检查后重试。'; }
    this.#publish({ ...this.#snapshot, errors: Object.freeze(errors) }); return !Object.keys(errors).length;
  }
  async #run(parameters: SettingsAuditQuery): Promise<void> {
    if (!this.available || parameters.module !== 'ALL' && !this.allowedModules.includes(parameters.module)) return;
    const result = await this.query.run(parameters);
    if (result.status !== 'error' || !this.scope.active || !(result.error instanceof HttpQueryError) || result.error.kind !== 'unauthenticated' && result.error.kind !== 'forbidden') return;
    if (result.error.kind === 'forbidden' && this.#options.hasUnresolvedWrite?.()) return;
    const kind = result.error.kind;
    try { this.#options.onAccessFailure(kind); }
    catch { /* Parent cleanup still runs if the host callback fails. */ }
    finally { this.#options.scope.dispose(); }
  }
  #publish(snapshot: SettingsAuditSnapshot): void { this.#snapshot = Object.freeze(snapshot); for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Cleanup must finish. */ } } }
}
