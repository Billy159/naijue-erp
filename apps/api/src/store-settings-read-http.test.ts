/** SYNTHETIC Fastify injection only: no listener, real session, policy or PG. */
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Fastify from 'fastify';
import { createStoreSettingsReadHttpPlugin, type StoreSettingsReadHttpOptions } from './store-settings-read-http.ts';
import type { StoreSettingsEntry, StoreSettingsReadAuthorization, StoreSettingsReadDependencies } from '../../../packages/application/src/store-settings-read-ports.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
import { actor, sid } from '../../../tests/support/synthetic-fixtures.ts';
const id = sid('hall', 3301), warehouseId = sid('warehouse', 3302);
const parameters = { search: '', status: 'normal', hallId: null, page: 1, pageSize: 20 };
const store: StoreSettingsEntry = { kind: 'stores', id, name: 'SYNTHETIC ONLY', enabled: true, version: 7, defaultCustomer: null, defaultWarehouse: { id: warehouseId, name: null }, createdAt: null, updatedAt: null };
const warehouse: StoreSettingsEntry = { kind: 'warehouses', id: warehouseId, name: 'SYNTHETIC ONLY', enabled: true, version: 3, hall: { id, name: null }, createdAt: null, updatedAt: null, stockFacts: null };
const paths = ['/store-settings-read/stores/query', '/store-settings-read/warehouses/query', '/store-settings-read/stores/detail/query', '/store-settings-read/warehouses/detail/query'];
const input = (path: string) => path.includes('/detail/') ? { id: path.includes('/warehouses/') ? warehouseId : id } : parameters;
async function fixture(t: TestContext, options: { authenticate?: StoreSettingsReadHttpOptions['authenticate']; authorize?: StoreSettingsReadAuthorization['authorize']; failure?: Error; malformed?: boolean; leaking?: boolean } = {}) {
  let policyCalls = 0, readCalls = 0;
  const dependencies: StoreSettingsReadDependencies = { authorization: { async authorize(a, intent, signal) { policyCalls++; assert.deepEqual(a, actor); assert.ok(signal instanceof AbortSignal); return options.authorize ? options.authorize(a, intent, signal) : { kind: intent.kind, operation: intent.operation, scope: { kind: 'HALL_IDS', hallIds: [id] }, targetId: intent.operation === 'detail' ? intent.parameters.id : null, references: 'NONE' }; } }, reader: {
    async readList(read) { readCalls++; if (options.failure) throw options.failure; const item = read.intent.kind === 'stores' ? store : warehouse; return { page: 1, pageSize: 20, total: options.malformed ? 2 : 1, items: [options.leaking ? { ...item, name: 'PRIVATE', ...(item.kind === 'stores' ? { defaultWarehouse: { id: warehouseId, name: 'PRIVATE TARGET' } } : {}) } : item] }; },
    async readDetail(read) { readCalls++; if (options.failure) throw options.failure; return { item: read.intent.kind === 'stores' ? store : warehouse }; }
  } };
  const app = Fastify({ logger: false }); app.register(createStoreSettingsReadHttpPlugin({ authenticate: options.authenticate ?? (async () => actor), dependencies })); t.after(() => app.close()); await app.ready();
  return { app, counts: () => ({ policyCalls, readCalls }), post: (url: string, body: unknown) => app.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) };
}
test('four explicit POST reads authenticate+authorize per request, no-store and native unknowns, no write routes/listener', async t => {
  let authentications = 0; const f = await fixture(t, { authenticate: async input => { authentications++; assert.equal(input.method, 'POST'); return actor; } });
  for (const path of paths) { const response = await f.post(path, input(path)); assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers.pragma, 'no-cache'); const item = path.includes('/detail/') ? response.json().item : response.json().items[0]; assert.equal(item.createdAt, null); assert.equal(item.updatedAt, null); if (item.kind === 'warehouses') assert.equal(item.stockFacts, null); else { assert.equal(item.defaultCustomer, null); assert.equal(item.defaultWarehouse.name, null); } }
  assert.equal(authentications, 4); assert.deepEqual(f.counts(), { policyCalls: 4, readCalls: 4 }); assert.equal(f.app.server.listening, false);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) for (const path of paths) assert.equal((await f.app.inject({ method, url: path })).statusCode, 404);
});
test('current authentication, exact scope+operation+target and references grants fail closed before native reads', async t => {
  assert.throws(() => createStoreSettingsReadHttpPlugin({} as never), /explicit trusted authentication/);
  const none = await fixture(t, { authenticate: async () => null }); for (const path of paths) assert.equal((await none.post(path, input(path))).statusCode, 401); assert.deepEqual(none.counts(), { policyCalls: 0, readCalls: 0 });
  const broken = await fixture(t, { authenticate: async () => { throw new Error('PRIVATE AUTH'); } }); const response = await broken.post(paths[0]!, parameters); assert.equal(response.statusCode, 500); assert.ok(!response.body.includes('PRIVATE'));
  for (const authorize of [async () => { throw new DomainError('FORBIDDEN', 'PRIVATE POLICY'); }, async () => ({ kind: 'stores', operation: 'list', scope: { kind: 'ALL' }, references: 'NONE' }), async () => ({ kind: 'stores', operation: 'list', scope: { kind: 'HALL_IDS', hallIds: [id] }, references: 'NONE', targetId: id }), async () => ({ kind: 'stores', operation: 'list', scope: { kind: 'CURRENT_HALL' }, references: 'NONE', targetId: null })]) {
    const f = await fixture(t, { authorize: authorize as unknown as StoreSettingsReadAuthorization['authorize'] }); const denied = await f.post(paths[0]!, parameters); assert.equal(denied.statusCode, 403, denied.body); assert.ok(!denied.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 0);
  }
  const leaking = await fixture(t, { leaking: true }); const denied = await leaking.post(paths[0]!, parameters); assert.equal(denied.statusCode, 500); assert.ok(!denied.body.includes('PRIVATE TARGET'));
});
test('strict JSON/query/body budgets reject forged authority/write fields before policy; Origin delegated to mandatory host', async t => {
  const f = await fixture(t);
  for (const query of [{ ...parameters, actor }, { ...parameters, scope: 'ALL' }, { ...parameters, role: 'ADMIN' }, { ...parameters, enabled: false }, { ...parameters, targetId: id }, { ...parameters, pageSize: 1000 }, {}, null]) assert.equal((await f.post(paths[0]!, query)).statusCode, 400);
  for (const query of [{ id, name: 'WRITE' }, { id, scope: 'ALL' }, {}, null]) assert.equal((await f.post(paths[2]!, query)).statusCode, 400);
  assert.equal((await f.post(`${paths[0]}?scope=ALL`, parameters)).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[0]!, payload: '{', headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[0]!, payload: '', headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[0]!, payload: 'x', headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await f.post(paths[0]!, { ...parameters, search: 'x'.repeat(9000) })).statusCode, 413); assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
  const origin = await fixture(t, { authenticate: async input => input.headers.origin === 'https://synthetic.test' ? actor : null }); assert.equal((await origin.post(paths[0]!, parameters)).statusCode, 401); assert.equal((await origin.app.inject({ method: 'POST', url: paths[0]!, payload: JSON.stringify(parameters), headers: { 'content-type': 'application/json', origin: 'https://synthetic.test' } })).statusCode, 200);
});
test('backend and malformed response failures sanitized, abort explicit, no retry', async t => {
  for (const options of [{ failure: new Error('PRIVATE SQL') }, { malformed: true }]) { const f = await fixture(t, options), response = await f.post(paths[0]!, parameters); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, 'INTERNAL_ERROR'); assert.ok(!response.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 1); }
  const aborted = await fixture(t, { failure: new DomainError('STORE_SETTINGS_READ_ABORTED', 'PRIVATE') }), response = await aborted.post(paths[2]!, { id }); assert.equal(response.statusCode, 408); assert.ok(!response.body.includes('PRIVATE')); assert.equal(aborted.counts().readCalls, 1);
});
