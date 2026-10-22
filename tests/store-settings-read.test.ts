/** SYNTHETIC contracts only; no current production identity/data or database. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStoreSettingsReadService } from '../packages/application/src/store-settings-read-service.ts';
import type { StoreSettingsEntry, StoreSettingsReadAuthorization, StoreSettingsReadDependencies, StoreSettingsReadGrant, StoreSettingsReadIntent, StoreSettingsScopedRead } from '../packages/application/src/store-settings-read-ports.ts';
import { parseStoreSettingsListQuery, validateStoreSettingsDetail, validateStoreSettingsEntry, validateStoreSettingsPage } from '../packages/application/src/store-settings-read-validation.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const id = sid('hall', 3101), warehouseId = sid('warehouse', 3102), customerId = sid('customer', 3103), otherHall = sid('hall', 3104);
const parameters = { search: '', status: 'normal' as const, hallId: null, page: 1, pageSize: 20 as const };
const store: StoreSettingsEntry = { kind: 'stores', id, name: ' SAME NATIVE NAME ', enabled: true, version: 7, defaultCustomer: { id: customerId, name: null }, defaultWarehouse: { id: warehouseId, name: null }, createdAt: null, updatedAt: null };
const warehouse: StoreSettingsEntry = { kind: 'warehouses', id: warehouseId, name: ' SAME NATIVE NAME ', enabled: true, version: 2, hall: { id, name: null }, createdAt: null, updatedAt: null, stockFacts: null };
const signal = () => new AbortController().signal;
function grant(intent: StoreSettingsReadIntent): StoreSettingsReadGrant { return { kind: intent.kind, operation: intent.operation, scope: { kind: 'HALL_IDS', hallIds: [id] }, references: 'NONE', targetId: intent.operation === 'detail' ? intent.parameters.id : null }; }
function fixture(authorize?: StoreSettingsReadAuthorization['authorize']) {
  const intents: StoreSettingsReadIntent[] = [], reads: StoreSettingsScopedRead[] = [];
  const row = (read: StoreSettingsScopedRead) => read.intent.kind === 'stores' ? store : warehouse;
  const dependencies: StoreSettingsReadDependencies = { authorization: { async authorize(a, intent, s) { assert.deepEqual(a, actor); assert.ok(s instanceof AbortSignal); intents.push(intent); return authorize ? authorize(a, intent, s) : grant(intent); } }, reader: {
    async readList(read) { reads.push(read); if (read.intent.operation !== 'list') throw new Error(); return { page: read.intent.parameters.page, pageSize: read.intent.parameters.pageSize, total: 1, items: [row(read)] }; },
    async readDetail(read) { reads.push(read); return { item: row(read) }; }
  } };
  return { service: createStoreSettingsReadService(dependencies), dependencies, intents, reads };
}
test('inert service requires explicit policy/reader and reauthorizes exact directory/detail scopes and native targets', async () => {
  assert.throws(() => createStoreSettingsReadService({} as never), /explicit trusted/); const f = fixture();
  assert.deepEqual((await f.service.readList(actor, 'stores', parameters, signal())).items, [store]);
  assert.deepEqual((await f.service.readList(actor, 'warehouses', parameters, signal())).items, [warehouse]);
  assert.deepEqual((await f.service.readDetail(actor, 'stores', { id }, signal())).item, store);
  assert.deepEqual((await f.service.readDetail(actor, 'warehouses', { id: warehouseId }, signal())).item, warehouse);
  assert.deepEqual(f.intents.map(intent => [intent.kind, intent.operation]), [['stores', 'list'], ['warehouses', 'list'], ['stores', 'detail'], ['warehouses', 'detail']]);
  for (const transform of [() => undefined, () => ({}), (g: StoreSettingsReadGrant) => ({ ...g, scope: undefined }), (g: StoreSettingsReadGrant) => ({ ...g, kind: 'warehouses' }), (g: StoreSettingsReadGrant) => ({ ...g, operation: 'detail' }), (g: StoreSettingsReadGrant) => ({ ...g, targetId: id }), (g: StoreSettingsReadGrant) => ({ ...g, references: 'CANDIDATES' }), (g: StoreSettingsReadGrant) => ({ ...g, scope: { kind: 'ALL', extra: 'ADMIN' } }), (g: StoreSettingsReadGrant) => ({ ...g, scope: { kind: 'HALL_IDS', hallIds: [id, id] } }), (g: StoreSettingsReadGrant) => ({ ...g, scope: { kind: 'HALL_IDS', hallIds: ['name-not-identity'] } })]) {
    const denied = fixture(async (_a, intent) => transform(grant(intent)) as never); await assert.rejects(() => denied.service.readList(actor, 'stores', parameters, signal()), { code: 'STORE_SETTINGS_FORBIDDEN' }); assert.equal(denied.reads.length, 0);
  }
  const wrongTarget = fixture(async (_a, intent) => ({ ...grant(intent), targetId: otherHall })); await assert.rejects(() => wrongTarget.service.readDetail(actor, 'stores', { id }, signal()), { code: 'STORE_SETTINGS_FORBIDDEN' }); assert.equal(wrongTarget.reads.length, 0);
});
test('strict body rejects forged actor/scope/target, write data, unsafe range and invalid UUID before authorization', async () => {
  const f = fixture();
  for (const query of [{ ...parameters, actor }, { ...parameters, scope: 'ALL' }, { ...parameters, targetId: id }, { ...parameters, enabled: false }, { ...parameters, hallId: id }, { ...parameters, page: 0 }, { ...parameters, page: Number.MAX_SAFE_INTEGER }, { ...parameters, pageSize: 200 }, { ...parameters, search: '\u007f' }, { ...parameters, status: 'ENABLED' }, null, {}]) await assert.rejects(() => f.service.readList(actor, 'stores', query, signal()), { code: 'STORE_SETTINGS_INVALID_QUERY' });
  for (const query of [{ id, scope: 'ALL' }, { id, name: 'WRITE' }, { id: 'SAME NATIVE NAME' }, {}, null]) await assert.rejects(() => f.service.readDetail(actor, 'stores', query, signal()), { code: 'STORE_SETTINGS_INVALID_QUERY' });
  await assert.rejects(() => f.service.readList({ accountId: 'name', hallId: null } as never, 'stores', parameters, signal()), /Invalid trusted store settings actor/); assert.equal(f.intents.length, 0);
  assert.equal(parseStoreSettingsListQuery({ ...parameters, search: '100%_\\原样' }, 'stores').search, '100%_\\原样');
});
test('FK identities and disabled/empty native names survive; unknown creation/stock never become timestamps or zero', () => {
  assert.deepEqual(validateStoreSettingsEntry({ ...store, name: '', enabled: false }, 'stores'), { ...store, name: '', enabled: false });
  assert.equal(validateStoreSettingsEntry(warehouse, 'warehouses').createdAt, null);
  for (const row of [{ ...store, createdAt: '2026-10-21' }, { ...store, updatedAt: '2026-10-21' }, { ...store, id: 'SAME NATIVE NAME' }, { ...store, version: 0 }, { ...store, enabled: 'true' }, { ...store, extra: 'WRITE' }, { ...store, defaultCustomer: { id: customerId } }]) assert.throws(() => validateStoreSettingsEntry(row, 'stores'), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
  assert.throws(() => validateStoreSettingsEntry({ ...warehouse, stockFacts: 0 }, 'warehouses'), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
});
test('injected readers cannot leak out-of-scope rows, ungranted reference names, wrong targets, status or filtered hall', async () => {
  for (const row of [{ ...store, id: otherHall }, { ...store, defaultCustomer: { id: customerId, name: 'PRIVATE' } }, { ...store, enabled: false }]) {
    const f = fixture(); f.dependencies.reader.readList = async () => ({ page: 1, pageSize: 20, total: 1, items: [row] }); await assert.rejects(() => f.service.readList(actor, 'stores', parameters, signal()), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
  }
  const target = fixture(); target.dependencies.reader.readDetail = async () => ({ item: { ...store, id: otherHall } }); await assert.rejects(() => target.service.readDetail(actor, 'stores', { id }, signal()), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
  const filtered = fixture(); await assert.rejects(() => filtered.service.readList(actor, 'warehouses', { ...parameters, hallId: otherHall }, signal()), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
  const names = fixture(async (_a, intent) => ({ ...grant(intent), references: 'REFERENCES' })); names.dependencies.reader.readList = async () => ({ page: 1, pageSize: 20, total: 1, items: [{ ...store, defaultWarehouse: { id: warehouseId, name: 'DISABLED OTHER HALL DEFAULT' } }] }); assert.equal((await names.service.readList(actor, 'stores', parameters, signal())).items.length, 1);
});
test('page/total exact snapshot range, duplicate IDs rejected, explicit out-of-range page retained; null detail not guessed', () => {
  const entry2 = { ...store, id: otherHall };
  assert.equal(validateStoreSettingsPage({ page: 1, pageSize: 20, total: 2, items: [store, entry2] }, 'stores', parameters).items.length, 2);
  for (const value of [{ page: 1, pageSize: 20, total: 2, items: [store] }, { page: 2, pageSize: 20, total: 1, items: [store] }, { page: 1, pageSize: 20, total: 2, items: [store, store] }]) assert.throws(() => validateStoreSettingsPage(value, 'stores', parameters), { code: 'STORE_SETTINGS_INVALID_RESPONSE' });
  assert.deepEqual(validateStoreSettingsPage({ page: 2, pageSize: 20, total: 1, items: [] }, 'stores', { ...parameters, page: 2 }), { page: 2, pageSize: 20, total: 1, items: [] });
  assert.deepEqual(validateStoreSettingsDetail({ item: null }, 'stores', { id }), { item: null });
});
test('pre-abort, policy abort and late reader abort suppress all subsequent stages/publication', async () => {
  const early = new AbortController(); early.abort(); const f = fixture(); await assert.rejects(() => f.service.readList(actor, 'stores', parameters, early.signal), { code: 'STORE_SETTINGS_READ_ABORTED' }); assert.equal(f.intents.length, 0);
  const policyController = new AbortController(), policy = fixture(async (_a, intent) => { policyController.abort(); return grant(intent); }); await assert.rejects(() => policy.service.readList(actor, 'stores', parameters, policyController.signal), { code: 'STORE_SETTINGS_READ_ABORTED' }); assert.equal(policy.reads.length, 0);
  const lateController = new AbortController(), late = fixture(); late.dependencies.reader.readDetail = async () => { lateController.abort(); return { item: store }; }; await assert.rejects(() => late.service.readDetail(actor, 'stores', { id }, lateController.signal), { code: 'STORE_SETTINGS_READ_ABORTED' });
});
