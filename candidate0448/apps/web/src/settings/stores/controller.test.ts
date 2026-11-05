/** SYNTHETIC lifecycle tests with deliberately abort-ignoring transports. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import { initialStoreSettingsQuery, StoreSettingsReadController } from './controller.ts';
import type { StoreSettingsBrowserReader, StoreSettingsDetail, StoreSettingsEntry, StoreSettingsKind, StoreSettingsListQuery, StoreSettingsPage } from './contracts.ts';
import type { QueryRead } from '../../loading/latest-query.ts';
const id = '00000000-0000-4000-8000-000000003501', other = '00000000-0000-4000-8000-000000003502';
const entry = (target = id): StoreSettingsEntry => ({ kind: 'stores', id: target, name: 'SYNTHETIC ONLY', enabled: true, version: 7, defaultCustomer: null, defaultWarehouse: null, createdAt: null, updatedAt: null });
const page = (read: QueryRead<StoreSettingsListQuery>): StoreSettingsPage => ({ page: read.parameters.page, pageSize: read.parameters.pageSize, total: 1, items: [entry()] });
function fixture(allowHallDirectoryRead = false) {
  const listReads: { kind: StoreSettingsKind; read: QueryRead<StoreSettingsListQuery>; resolve: (data: StoreSettingsPage) => void; reject: (error: unknown) => void }[] = [];
  const detailReads: { id: string; signal: AbortSignal; resolve: (data: StoreSettingsDetail) => void; reject: (error: unknown) => void }[] = [];
  const failures: string[] = [], identity = { accountId: 'SYNTHETIC', sessionRevision: '1', permissionRevision: '1' }, context = new ReadContext(identity), scope = context.createScope('SYNTHETIC');
  const reader: StoreSettingsBrowserReader = { readList: (kind, read) => new Promise((resolve, reject) => listReads.push({ kind, read, resolve, reject })), readDetail: (_kind, read) => new Promise((resolve, reject) => detailReads.push({ id: read.parameters.id, signal: read.signal, resolve, reject })) };
  const controller = new StoreSettingsReadController({ scope, reader, allowHallDirectoryRead, onAccessFailure: kind => failures.push(kind) }, 'stores');
  return { controller, context, scope, listReads, detailReads, failures, identity };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
test('construction inert; cancelled/superseded list results and late denials never publish or invalidate live identity', async () => {
  const f = fixture(); assert.equal(f.listReads.length, 0);
  const first = f.controller.queryList(initialStoreSettingsQuery); const r1 = f.listReads[0]!; f.controller.list.cancel(); assert.equal(r1.read.signal.aborted, true); r1.reject(new HttpQueryError('forbidden', 'FORBIDDEN', 403)); assert.equal((await first).status, 'discarded'); await settle(); assert.deepEqual(f.failures, []); assert.equal(f.controller.scope.active, true);
  const old = f.controller.queryList(initialStoreSettingsQuery), oldRead = f.listReads[1]!, current = f.controller.queryList({ ...initialStoreSettingsQuery, search: 'NEW' }), currentRead = f.listReads[2]!;
  currentRead.resolve(page(currentRead.read)); assert.equal((await current).status, 'success'); oldRead.resolve({ ...page(oldRead.read), items: [{ ...entry(), name: 'LATE PRIVATE' }] }); assert.equal((await old).status, 'discarded'); await settle(); assert.equal(f.controller.list.getSnapshot().success!.parameters.search, 'NEW'); assert.ok(!JSON.stringify(f.controller.list.getSnapshot()).includes('LATE PRIVATE')); f.controller.dispose(); assert.equal(f.scope.active, true);
});
test('detail target replacement and list refresh abort/clear old facts; no reuse of list clone or inferred IDs', async () => {
  const f = fixture(); const first = f.controller.openDetail(id); assert.equal(f.detailReads[0]!.id, id); const second = f.controller.openDetail(other); assert.equal(first.getSnapshot().phase, 'disposed'); assert.equal(f.detailReads[0]!.signal.aborted, true);
  f.detailReads[1]!.resolve({ item: entry(other) }); await settle(); assert.equal(second.getSnapshot().success?.data.item?.id, other); f.detailReads[0]!.resolve({ item: entry() }); await settle(); assert.equal(second.getSnapshot().success?.data.item?.id, other);
  const refreshed = f.controller.queryList(initialStoreSettingsQuery); assert.equal(second.getSnapshot().phase, 'disposed'); assert.equal(f.controller.detail, null); f.listReads[0]!.resolve(page(f.listReads[0]!.read)); await refreshed; assert.throws(() => f.controller.openDetail('SYNTHETIC ONLY'), { code: 'STORE_SETTINGS_INVALID_QUERY' }); f.controller.dispose();
});
test('current list or detail 401/403 clears all private results before callback, without disposing caller parent', async () => {
  for (const target of ['list', 'detail'] as const) {
    const f = fixture(true), first = f.controller.queryList(initialStoreSettingsQuery); f.listReads[0]!.resolve(page(f.listReads[0]!.read)); await first;
    f.controller.queryHalls(initialStoreSettingsQuery); const detail = f.controller.openDetail(id); f.detailReads[0]!.resolve({ item: entry() }); await settle(); assert.equal(detail.getSnapshot().phase, 'success');
    if (target === 'list') { const next = f.controller.queryList(initialStoreSettingsQuery); f.listReads.at(-1)!.reject(new HttpQueryError('unauthenticated', 'UNAUTHENTICATED', 401)); await next; } else { f.controller.openDetail(other); f.detailReads.at(-1)!.reject(new HttpQueryError('forbidden', 'FORBIDDEN', 403)); await settle(); }
    assert.equal(f.controller.list.getSnapshot().success, null); assert.equal(f.controller.hallDirectory.getSnapshot().success, null); assert.equal(detail.getSnapshot().success, null); assert.equal(f.controller.detail, null); assert.equal(f.controller.scope.active, false); assert.equal(f.scope.active, true); assert.deepEqual(f.failures, [target === 'list' ? 'unauthenticated' : 'forbidden']);
  }
});
test('identity revision, unmount and forbidden hall-directory discovery clear pending results; no permission escalation', async () => {
  const unavailable = fixture(); assert.equal(unavailable.controller.queryHalls(initialStoreSettingsQuery), undefined); assert.equal(unavailable.listReads.length, 0); unavailable.controller.dispose();
  const f = fixture(true); f.controller.queryHalls({ ...initialStoreSettingsQuery, search: 'HALL', page: 2 }); assert.equal(f.listReads[0]!.kind, 'stores'); assert.equal(f.listReads[0]!.read.parameters.status, 'all'); assert.equal(f.listReads[0]!.read.parameters.page, 2);
  f.context.replaceIdentity({ ...f.identity, permissionRevision: '2' }); assert.equal(f.listReads[0]!.read.signal.aborted, true); assert.equal(f.controller.list.getSnapshot().phase, 'disposed'); f.listReads[0]!.resolve({ ...page(f.listReads[0]!.read), page: 2, items: [] }); await settle(); assert.equal(f.controller.hallDirectory.getSnapshot().success, null); assert.deepEqual(f.failures, []);
  const denied = fixture(true); denied.controller.queryHalls(initialStoreSettingsQuery); denied.listReads[0]!.reject(new HttpQueryError('forbidden', 'FORBIDDEN', 403)); await settle(); assert.equal(denied.controller.scope.active, false); assert.deepEqual(denied.failures, ['forbidden']);
});
