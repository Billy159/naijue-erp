/** SYNTHETIC Fetch only: no API, cookies, current server permissions or PG. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createStoreSettingsHttpReader } from './http-reader.ts';
import type { QueryRead } from '../../loading/latest-query.ts';
import type { StoreSettingsDetailQuery, StoreSettingsListQuery } from './contracts.ts';
const id = '00000000-0000-4000-8000-000000003401', warehouseId = '00000000-0000-4000-8000-000000003402';
const parameters: StoreSettingsListQuery = { search: 'literal%_', status: 'normal', hallId: null, page: 1, pageSize: 20 };
const read = <P>(parameters: P): QueryRead<P> => ({ parameters, signal: new AbortController().signal, identity: { accountId: 'NEVER-SEND-IDENTITY', sessionRevision: '1', permissionRevision: '1' }, routeInstanceId: 'SYNTHETIC', entityId: null });
const store = { kind: 'stores', id, name: ' SAME NAME ', enabled: true, version: 3, defaultCustomer: null, defaultWarehouse: { id: warehouseId, name: null }, createdAt: null, updatedAt: null };
const warehouse = { kind: 'warehouses', id: warehouseId, name: ' SAME NAME ', enabled: true, version: 7, hall: { id, name: null }, createdAt: null, updatedAt: null, stockFacts: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
test('exact same-origin session requests send only executed fields, preserving real FK/native unknowns', async () => {
  const requests: { input: string; init: RequestInit }[] = [];
  const reader = createStoreSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (input, init) => { requests.push({ input, init }); const item = input.includes('/warehouses/') ? warehouse : store; return json(input.includes('/detail/') ? { item } : { page: 1, pageSize: 20, total: 1, items: [item] }); } });
  for (const kind of ['stores', 'warehouses'] as const) { const snapshot = Object.freeze(Object.assign(Object.create(null) as StoreSettingsListQuery, parameters)); const result = await reader.readList(kind, read(snapshot)); assert.equal(result.items[0]!.createdAt, null); assert.equal(result.items[0]!.name, ' SAME NAME '); await reader.readDetail(kind, read<StoreSettingsDetailQuery>({ id: kind === 'stores' ? id : warehouseId })); }
  assert.deepEqual(requests.map(request => request.input), ['https://synthetic.test/api/store-settings-read/stores/query', 'https://synthetic.test/api/store-settings-read/stores/detail/query', 'https://synthetic.test/api/store-settings-read/warehouses/query', 'https://synthetic.test/api/store-settings-read/warehouses/detail/query']);
  for (const { init } of requests) { assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin'); assert.ok(!String(init.body).includes('NEVER-SEND')); assert.ok(!String(init.body).includes('scope')); }
});
test('wrong targets/ranges/native fields or invented stock/time fail without any fallback', async () => {
  for (const item of [{ ...warehouse, id }, { ...warehouse, stockFacts: 0 }, { ...warehouse, createdAt: '2026-10-21' }, { ...warehouse, hall: { id: 'HALL NAME', name: 'NAME' } }]) { const reader = createStoreSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ item }) }); await assert.rejects(() => reader.readDetail('warehouses', read({ id: warehouseId })), { kind: 'malformed-response' }); }
  const bad = createStoreSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ page: 1, pageSize: 20, total: 2, items: [store] }) }); await assert.rejects(() => bad.readList('stores', read(parameters)), { kind: 'malformed-response' });
});
test('permission/readiness errors sanitized, no retries, aborted calls never dispatch', async () => {
  for (const [status, kind] of [[401, 'unauthenticated'], [403, 'forbidden'], [503, 'unavailable']] as const) { let calls = 0; const reader = createStoreSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({ error: { code: 'PRIVATE', message: 'PRIVATE SQL' } }, status); } }); await assert.rejects(() => reader.readList('stores', read(parameters)), error => { assert.equal((error as { kind: string }).kind, kind); assert.ok(!String(error).includes('PRIVATE')); return true; }); assert.equal(calls, 1); }
  let calls = 0; const controller = new AbortController(); controller.abort(); const reader = createStoreSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({}); } }); await assert.rejects(() => reader.readList('stores', { ...read(parameters), signal: controller.signal }), { kind: 'aborted' }); assert.equal(calls, 0);
});
