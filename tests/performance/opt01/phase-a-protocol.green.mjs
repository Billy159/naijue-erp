/** Additive protocol TDD. Fastify injection has no listening socket; no PG connection. */
import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { phaseLoad, phaseSourceBinding, uid, signal, skus, response } from './phase-a-binding.mjs';
import { stringWireV2 } from './sku-capacity-fixture.mjs';
const { createCurrentFormHttpPlugin } = await phaseLoad('apps/api/src/current-form-http.ts');
const { createCurrentFormHttpReader } = await phaseLoad('apps/web/src/current-form/http-reader.ts');
const { DomainError } = await phaseLoad('packages/domain/src/errors.ts');
const actor = { accountId: uid(1), hallId: null };
const endpoint = '/current-form/saved-edit-sku-batch-v2/query';
const query = { context: { kind: 'TRANSFER' }, skuIds: [uid(10), uid(11), uid(12)] };
const envelope = () => ({ version: 1, skus: skus(), products: [
  { productId: uid(20), state: 'ELIGIBLE', sizeGroupId: uid(30) }, { productId: uid(21), state: 'UNAVAILABLE' },
] });
async function appFor(t, options = {}) {
  const calls = [], unused = async () => { throw Error('Unexpected legacy read.'); };
  const reader = { readSalesReferences: unused, readTransferWarehouses: unused, readProducts: unused, readProductSkus: unused,
    readSkuBatch: async () => skus(), ...(!options.unsupported ? { readSavedEditSkuBatch: async (trusted, parameters, active) => {
      calls.push({ trusted, parameters, active }); if (options.denied) throw new DomainError('FORBIDDEN', 'Private policy reason'); return options.badDomain ?? envelope();
    } } : {}) };
  const app = Fastify({ logger: false });
  app.register(createCurrentFormHttpPlugin({ authenticate: async () => options.unauthenticated ? null : actor, reader }));
  t.after(() => app.close()); await app.ready();
  return { app, calls, post: (url, body) => app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json' }, payload: body }) };
}

test('HTTP additive saved-edit route dispatches explicit method while legacy bare array is unchanged', async t => {
  const f = await appFor(t);
  const result = await f.post(endpoint, query);
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json(), stringWireV2(envelope()));
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].trusted, actor); assert.deepEqual(f.calls[0].parameters, query);
  assert.ok(Object.isFrozen(f.calls[0].trusted)); assert.ok(Object.isFrozen(f.calls[0].parameters));
  const legacy = await f.post('/current-form/sku-batch/query', query);
  assert.equal(legacy.statusCode, 200); assert.deepEqual(legacy.json(), skus()); assert.equal(f.app.server.listening, false);
  t.diagnostic(JSON.stringify(await phaseSourceBinding()));
});
test('HTTP additive saved-edit route fails closed for unsupported provider, denied authority and unauthenticated identity', async t => {
  for (const [options, status] of [[{ unsupported: true }, 503], [{ denied: true }, 403], [{ unauthenticated: true }, 401]]) {
    const f = await appFor(t, options), result = await f.post(endpoint, query);
    assert.equal(result.statusCode, status, result.body); assert.ok(!result.body.includes('Private policy'));
  }
  const f = await appFor(t);
  for (const body of [{ ...query, actor }, { ...query, skuIds: [] }, { ...query, skuIds: [uid(10), uid(10)] }]) {
    assert.equal((await f.post(endpoint, body)).statusCode, 400);
  }
  assert.equal(f.calls.length, 0);
  const tainted = envelope(); tainted.skus[0].enabled = true;
  const malformed = await appFor(t, { badDomain: tainted });
  assert.equal((await malformed.post(endpoint, query)).statusCode, 500, 'Encoder must not hide extra provider fields when packing tuples.');
});

test('browser additive decoder accepts complete explicit optional product metadata and keeps legacy decoder exact', async () => {
  const requests = [], reader = createCurrentFormHttpReader({ origin: 'https://phase-a.invalid', basePath: '/api', fetch: async (url, init) => {
    requests.push({ url, init }); return response(stringWireV2(envelope()));
  } });
  const actual = await reader.readSavedEditSkuBatch(query, signal());
  assert.deepEqual(actual, envelope()); assert.ok(Object.isFrozen(actual.products));
  assert.equal(requests[0].url, `https://phase-a.invalid/api${endpoint}`);
  assert.equal(requests[0].init.credentials, 'same-origin'); assert.equal(requests[0].init.cache, 'no-store');
  await assert.rejects(() => reader.readSkuBatch(query, signal()), { kind: 'malformed-response' });
});
test('browser additive decoder rejects version, keys, SKU/order and product coverage/union/group corruption', async () => {
  const changes = [
    value => { delete value.version; }, value => { value.version = 1; }, value => { value.version = '2'; },
    value => { value.grant = 'all'; }, value => { value.skus.reverse(); }, value => { value.skus.pop(); },
    value => { value.skus[1] = value.skus[0]; }, value => { value.products.reverse(); }, value => { value.products.pop(); },
    value => { value.products.push(value.products[0]); }, value => { value.products[1][0] = uid(99); },
    value => { value.products[0][2] = uid(99); }, value => { value.products[1].push(uid(31)); },
    value => { value.products[0][1] = 'UNKNOWN'; }, value => { value.products[0].pop(); },
    value => { value.products[0].push('extra'); }, value => { value.skus[1][11] = uid(99); value.products[0] = [uid(20), 'UNAVAILABLE']; },
  ];
  for (const change of changes) {
    const value = stringWireV2(envelope()); change(value);
    const reader = createCurrentFormHttpReader({ origin: 'https://phase-a.invalid', basePath: '', fetch: async () => response(value) });
    await assert.rejects(() => reader.readSavedEditSkuBatch(query, signal()), { kind: 'malformed-response' });
  }
});
