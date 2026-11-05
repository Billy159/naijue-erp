/** SYNTHETIC Fetch only: no real API, cookie, authentication grant or database. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogueSettingsHttpReader } from './http-reader.ts';
import type { QueryRead } from '../../loading/latest-query.ts';
import type { CatalogueSettingsListQuery } from './contracts.ts';
const id = '00000000-0000-4000-8000-000000000001';
const parameters: CatalogueSettingsListQuery = { search: 'literal%_', page: 1, pageSize: 20 };
const read = (): QueryRead<CatalogueSettingsListQuery> => ({ parameters, signal: new AbortController().signal, identity: { accountId: 'NEVER-SEND-IDENTITY', permissionRevision: '1', sessionRevision: '1' }, routeInstanceId: 'SYNTHETIC', entityId: null });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const entry = { id, name: ' SAME NAME ', code: ' 00 ', enabled: false, version: 3 };
test('catalogue browser transport has exact native values and same-origin-only executed parameters', async () => {
  const requests: { input: string; init: RequestInit }[] = [];
  const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (input, init) => { requests.push({ input, init }); return json({ page: 1, pageSize: 20, total: 1, items: [entry] }); } });
  assert.deepEqual((await reader.readColors(read())).items[0], entry);
  await reader.readFits(read());
  assert.deepEqual(requests.map(request => request.input), ['https://synthetic.test/api/catalogue-settings-read/colors/query', 'https://synthetic.test/api/catalogue-settings-read/fits/query']);
  for (const { init } of requests) { assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'same-origin'); assert.deepEqual(JSON.parse(init.body as string), parameters); assert.ok(!String(init.body).includes('NEVER-SEND')); }
  // LatestQuery deliberately snapshots plain parameters into a frozen null-prototype
  // object. The wire is ordinary JSON; response validation must not reject that owner.
  const snapshot = Object.freeze(Object.assign(Object.create(null) as CatalogueSettingsListQuery, parameters));
  assert.deepEqual((await reader.readColors({ ...read(), parameters: snapshot })).items[0], entry);
});
test('catalogue tree sends empty query; unknown code and independently unauthorized counts stay null', async () => {
  const category = { id, name: '', parentId: null, displayOrder: -3, version: 2, code: null, productCount: null, childCount: 0 };
  const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async (input, init) => { assert.match(input, /categories\/query$/); assert.deepEqual(JSON.parse(init.body as string), {}); return json({ total: 1, items: [category] }); } });
  assert.deepEqual((await reader.readCategories({ ...read(), parameters: {} })).items[0], category);
});
test('catalogue rejects malformed range/count/identity/status or invented category code without static fallback', async () => {
  for (const value of [{ page: 2, pageSize: 20, total: 0, items: [] }, { page: 1, pageSize: 20, total: 1, items: [] }, { page: 1, pageSize: 20, total: 1, items: [{ ...entry, enabled: 'false' }] }]) {
    const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json(value) });
    await assert.rejects(() => reader.readFits(read()), { kind: 'malformed-response' });
  }
  for (const category of [{ id, name: 'N', parentId: null, displayOrder: 0, version: 1, code: 'INVENTED', productCount: 0, childCount: 0 }, { id, name: 'N', parentId: id, displayOrder: 0, version: 1, code: null, productCount: null, childCount: 1 }]) {
    const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ total: 1, items: [category] }) });
    await assert.rejects(() => reader.readCategories({ ...read(), parameters: {} }), { kind: 'malformed-response' });
  }
});
test('catalogue permission/overflow/readiness/abort errors are sanitized and never automatically retried', async () => {
  for (const [status, kind] of [[401, 'unauthenticated'], [403, 'forbidden'], [413, 'too-large'], [503, 'unavailable']] as const) {
    let calls = 0;
    const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({ error: { code: 'PRIVATE', message: 'PRIVATE DETAILS' } }, status); } });
    await assert.rejects(() => reader.readColors(read()), error => { assert.equal((error as { kind: string }).kind, kind); assert.doesNotMatch(String(error), /PRIVATE/); return true; }); assert.equal(calls, 1);
  }
  let calls = 0; const controller = new AbortController(); controller.abort();
  const reader = createCatalogueSettingsHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({}); } });
  await assert.rejects(() => reader.readFits({ ...read(), signal: controller.signal }), { kind: 'aborted' }); assert.equal(calls, 0);
});
