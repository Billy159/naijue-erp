/** SYNTHETIC Fastify injection, no listener, real session/policy or PostgreSQL. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import Fastify from 'fastify';
import { createCatalogueSettingsReadHttpPlugin, type CatalogueSettingsReadHttpOptions } from './catalogue-settings-read-http.ts';
import type { CatalogueSettingsReadAuthorization, CatalogueSettingsReadDependencies } from '../../../packages/application/src/catalogue-settings-read-ports.ts';
import { DomainError } from '../../../packages/domain/src/errors.ts';
import { actor, sid } from '../../../tests/support/synthetic-fixtures.ts';
const parameters = { search: '', page: 1, pageSize: 20 }, id = sid('category', 1101);
const paths = ['/catalogue-settings-read/categories/query', '/catalogue-settings-read/colors/query', '/catalogue-settings-read/fits/query'] as const;
const category = { id, parentId: null, name: '2026 is only a category name', displayOrder: -9, version: 1, code: null, productCount: null, childCount: 0 };
const entry = { id: sid('color', 1102), code: 'ORIGINAL-CODE', name: 'SYNTHETIC ONLY', enabled: false, version: 4 };
async function fixture(t: TestContext, options: { authenticate?: CatalogueSettingsReadHttpOptions['authenticate']; authorize?: CatalogueSettingsReadAuthorization['authorize']; failure?: Error; malformed?: boolean; productCount?: number | null } = {}) {
  let policyCalls = 0, readCalls = 0; const check = () => { readCalls++; if (options.failure) throw options.failure; };
  const dependencies: CatalogueSettingsReadDependencies = { authorization: { async authorize(a, intent, signal) {
    policyCalls++; assert.deepEqual(a, actor); assert.ok(signal instanceof AbortSignal);
    return options.authorize ? options.authorize(a, intent, signal) : intent.kind === 'categories' ? { kind: 'categories', operation: 'tree', productCounts: 'NONE' } : { kind: intent.kind, operation: 'list' };
  } }, reader: {
    async readCategories() { check(); return { total: 1, items: [{ ...category, productCount: options.productCount ?? null }] }; },
    async readColors() { check(); return { page: 1, pageSize: 20, total: options.malformed ? 2 : 1, items: [entry] }; },
    async readFits() { check(); return { page: 1, pageSize: 20, total: 1, items: [entry] }; }
  } };
  const app = Fastify({ logger: false }); app.register(createCatalogueSettingsReadHttpPlugin({ authenticate: options.authenticate ?? (async () => actor), dependencies })); t.after(() => app.close()); await app.ready();
  return { app, counts: () => ({ policyCalls, readCalls }), post: (url: string, body: unknown) => app.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) };
}
test('catalogue HTTP exposes only three explicit same-session POST reads with no-store and native unknowns; no listener', async t => {
  let authentications = 0;
  const f = await fixture(t, { authenticate: async input => { authentications++; assert.equal(input.method, 'POST'); assert.ok(input.url.startsWith('/catalogue-settings-read/')); return actor; } });
  for (const path of paths) {
    const response = await f.post(path, path === paths[0] ? {} : parameters); assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers.pragma, 'no-cache');
    if (path === paths[0]) { assert.equal(response.json().items[0].code, null); assert.equal(response.json().items[0].productCount, null); assert.equal(response.json().items[0].displayOrder, -9); }
    else { assert.equal(response.json().items[0].code, 'ORIGINAL-CODE'); assert.equal(response.json().items[0].enabled, false); assert.equal(response.json().items[0].version, 4); }
  }
  assert.equal(authentications, 3); assert.deepEqual(f.counts(), { policyCalls: 3, readCalls: 3 }); assert.equal(f.app.server.listening, false);
  const noWrites = await fixture(t); for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) for (const path of paths) assert.equal((await noWrites.app.inject({ method, url: path })).statusCode, 404);
});
test('current host authentication and exact per-directory grants reject before native reader, with sanitized errors', async t => {
  assert.throws(() => createCatalogueSettingsReadHttpPlugin({} as never), /explicit trusted authentication/);
  const unauthenticated = await fixture(t, { authenticate: async () => null }); for (const path of paths) assert.equal((await unauthenticated.post(path, path === paths[0] ? {} : parameters)).statusCode, 401); assert.deepEqual(unauthenticated.counts(), { policyCalls: 0, readCalls: 0 });
  const broken = await fixture(t, { authenticate: async () => { throw new Error('PRIVATE AUTHENTICATION'); } }); const error = await broken.post(paths[0], {}); assert.equal(error.statusCode, 500); assert.ok(!error.body.includes('PRIVATE')); assert.equal(broken.counts().policyCalls, 0);
  for (const authorize of [async () => { throw new DomainError('FORBIDDEN', 'PRIVATE POLICY'); }, async () => ({ kind: 'fits' as const, operation: 'list' as const }), async () => ({ kind: 'categories' as const, operation: 'tree' as const } as never)]) {
    const f = await fixture(t, { authorize }); const response = await f.post(paths[0], {}); assert.equal(response.statusCode, 403, response.body); assert.ok(!response.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 0);
  }
});
test('category product-count capability is independent and enforced even against injected readers; NONE never leaks counts', async t => {
  const none = await fixture(t, { productCount: 12 }); const response = await none.post(paths[0], {}); assert.equal(response.statusCode, 500); assert.ok(!response.body.includes('12'));
  const all = await fixture(t, { authorize: async () => ({ kind: 'categories', operation: 'tree', productCounts: 'ALL' }), productCount: 0 }); const complete = await all.post(paths[0], {}); assert.equal(complete.statusCode, 200, complete.body); assert.equal(complete.json().items[0].productCount, 0);
  const missing = await fixture(t, { authorize: async () => ({ kind: 'categories', operation: 'tree', productCounts: 'ALL' }) }); assert.equal((await missing.post(paths[0], {})).statusCode, 500);
});
test('strict JSON/query/body budgets reject forged authority and writes before policy; supported Origin delegated to mandatory host', async t => {
  const f = await fixture(t);
  for (const input of [{ ...parameters, actor }, { ...parameters, role: 'ADMIN' }, { ...parameters, enabled: true }, { ...parameters, grant: { productCounts: 'ALL' } }, { ...parameters, pageSize: 5000 }, {}, null]) assert.equal((await f.post(paths[1], input)).statusCode, 400);
  for (const input of [{ productCounts: 'ALL' }, { search: '' }, { page: 1 }, null]) assert.equal((await f.post(paths[0], input)).statusCode, 400);
  assert.equal((await f.post(`${paths[1]}?role=ADMIN`, parameters)).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[1], payload: '{', headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[1], payload: '', headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await f.app.inject({ method: 'POST', url: paths[1], payload: 'x', headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await f.post(paths[1], { ...parameters, search: 'x'.repeat(9000) })).statusCode, 413); assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
  const origin = await fixture(t, { authenticate: async input => input.headers.origin === 'https://synthetic-authorized.test' ? actor : null });
  assert.equal((await origin.post(paths[0], {})).statusCode, 401);
  assert.equal((await origin.app.inject({ method: 'POST', url: paths[0], payload: '{}', headers: { 'content-type': 'application/json', origin: 'https://synthetic-authorized.test' } })).statusCode, 200);
});
test('malformed responses and backend failures are sanitized; overflow/abort are explicit and never auto-retried', async t => {
  for (const options of [{ failure: new Error('PRIVATE DATABASE ERROR') }, { malformed: true }]) { const f = await fixture(t, options), response = await f.post(paths[1], parameters); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, 'INTERNAL_ERROR'); assert.ok(!response.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 1); }
  for (const [code, status] of [['CATALOGUE_SETTINGS_READ_ABORTED', 408], ['CATALOGUE_SETTINGS_READ_TOO_LARGE', 413]] as const) { const f = await fixture(t, { failure: new DomainError(code, 'PRIVATE') }), response = await f.post(paths[0], {}); assert.equal(response.statusCode, status); assert.ok(!response.body.includes('PRIVATE')); assert.equal(f.counts().readCalls, 1); }
});
