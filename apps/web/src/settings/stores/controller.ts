import { LatestQuery, type QueryRead } from '../../loading/latest-query.ts';
import { ReadScope } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import { parseStoreSettingsDetailQuery, validateStoreSettingsDetail, validateStoreSettingsPage } from '../../../../../packages/application/src/store-settings-read-validation.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage, StoreSettingsPageProps } from './contracts.ts';
export const initialStoreSettingsQuery: StoreSettingsListQuery = Object.freeze({ search: '', status: 'normal', hallId: null, page: 1, pageSize: 20 });
let sequence = 0;
/** A disposable leaf identity owner, never the caller's parent scope. Each detail
 * target has a fresh LatestQuery. Revocation clears list, directory and modal
 * synchronously BEFORE notifying the trusted host. Cancelled/late denials do not
 * invalidate a newer identity or request. Construction makes no network request. */
export class StoreSettingsReadController {
  readonly props: StoreSettingsPageProps;
  readonly kind: StoreSettingsKind;
  readonly scope: ReadScope;
  readonly list: LatestQuery<StoreSettingsListQuery, StoreSettingsPage>;
  readonly hallDirectory: LatestQuery<StoreSettingsListQuery, StoreSettingsPage>;
  detail: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail> | null = null;
  #accessFailure: 'unauthenticated' | 'forbidden' | null = null;
  constructor(props: StoreSettingsPageProps, kind: StoreSettingsKind) {
    this.props = props; this.kind = kind;
    const parent = props.scope, aborted = () => this.scope.dispose();
    this.scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:store-settings:${++sequence}`, null, () => parent.signal.removeEventListener('abort', aborted));
    parent.signal.addEventListener('abort', aborted, { once: true }); if (!parent.active) this.scope.dispose();
    this.list = new LatestQuery({ scope: this.scope, execute: read => this.guarded(read, async () => validateStoreSettingsPage(await props.reader.readList(kind, read), kind, { ...read.parameters })) });
    this.hallDirectory = new LatestQuery({ scope: this.scope, execute: read => this.guarded(read, async () => validateStoreSettingsPage(await props.reader.readList('stores', read), 'stores', { ...read.parameters })) });
  }
  get accessFailure() { return this.#accessFailure; }
  private async guarded<P, D>(read: QueryRead<P>, execute: () => Promise<D>): Promise<D> {
    try { return await execute(); } catch (error) {
      if (this.scope.active && !read.signal.aborted && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
        const workspace = this.props.maintenance?.workspace;
        // A later read denial cannot prove that an already-dispatched command rolled back.
        // Keep the authenticated session editor reachable; 401 still invalidates all facts.
        if (error.kind === 'forbidden' && workspace?.matches(this.props.scope) && workspace.hasUnresolvedWrite()) throw error;
        if (error.kind === 'unauthenticated' && workspace?.matches(this.props.scope)) workspace.dispose();
        this.#accessFailure = error.kind; this.dispose(); try { this.props.onAccessFailure(error.kind); } catch { /* Facts already cleared. */ }
      }
      throw error;
    }
  }
  queryList(parameters: StoreSettingsListQuery) { this.closeDetail(); this.hallDirectory.cancel(); return this.list.run(parameters); }
  queryHalls(parameters: StoreSettingsListQuery) {
    if (!this.props.allowHallDirectoryRead || !this.scope.active) return;
    return this.hallDirectory.run({ ...parameters, hallId: null, status: 'all' });
  }
  openDetail(id: string) {
    const parameters = parseStoreSettingsDetailQuery({ id }); this.closeDetail();
    const query = new LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail>({ scope: this.scope,
      execute: read => this.guarded(read, async () => validateStoreSettingsDetail(await this.props.reader.readDetail(this.kind, read), this.kind, { ...read.parameters })) });
    this.detail = query; void query.run(parameters); return query;
  }
  closeDetail() { this.detail?.dispose(); this.detail = null; }
  dispose() { this.scope.dispose(); this.list?.dispose(); this.hallDirectory?.dispose(); this.closeDetail(); }
}
