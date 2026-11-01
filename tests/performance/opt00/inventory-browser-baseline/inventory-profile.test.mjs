import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryProfile, routeInventoryProfile, profileDigest, DATASET_VERSION } from './inventory-profile.mjs';
import { createInventoryIdentityMap } from './identity-map.mjs';
import { createSyntheticInventoryReader } from '../../../../apps/web/preview/synthetic-reader.ts';
import { emptyInventoryFilter } from '../../../../apps/web/src/inventory/contracts.ts';
import { createInventoryHttpReader } from '../../../../apps/web/src/transport/inventory-http-reader.ts';
import { inventoryResponse, candidatesResponse } from '../../../../apps/web/src/transport/response-validation.ts';
import { parseInventoryQuery, parseInventoryCandidateQuery } from '../../../../packages/application/src/inventory-query-validation.ts';

const profile = await createInventoryProfile();
const query = (pageSize = 500, page = 1, filter = emptyInventoryFilter()) => ({ filter, page, pageSize });
const candidateQuery = (kind = 'product', page = 1, search = '') => ({ kind, search, page, pageSize: 20, selectedIds: [], categoryIds: [] });
const signal = () => new AbortController().signal;
const read = (parameters, abortSignal = signal()) => ({ parameters, signal: abortSignal,
  identity: { accountId: 'SYNTHETIC-CONTRACT-ONLY', sessionRevision: '1', permissionRevision: '1' }, routeInstanceId: 'NO-DOM-NO-NETWORK', entityId: null });
const clone = value => structuredClone(value);
const selection = ({ id, label }) => ({ id, label });
const route = (endpoint, body, options) => routeInventoryProfile(profile, endpoint, body, options);
function setup({ failure = null, replace = null, onDispatch = () => {} } = {}) {
  const calls = [];
  const reader = createInventoryHttpReader({ origin: 'https://inventory-fixture.invalid', basePath: '/api', fetch: async (input, init) => {
    const url = new URL(input); assert.equal(url.origin, 'https://inventory-fixture.invalid');
    assert.equal(init.method, 'POST'); assert.ok(url.pathname.startsWith('/api/'));
    const endpoint = url.pathname.slice(4), body = JSON.parse(init.body);
    calls.push({ endpoint, body });
    onDispatch();
    const result = await route(endpoint, body, { signal: init.signal, failure });
    return replace ? replace(result) : new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } });
  return { reader, calls };
}

test('600 complete original products and all candidate domains are declared before any query', () => {
  assert.equal(profile.facts.datasetVersion, DATASET_VERSION);
  assert.equal(profile.facts.productCount, 600); assert.equal(profile.facts.products.length, 600);
  assert.equal(profile.facts.candidates.product.length, 600);
  assert.deepEqual(Object.fromEntries(Object.entries(profile.facts.candidates).map(([kind, rows]) => [kind, rows.length])), { product: 600, category: 2, warehouse: 2, supplier: 2, fit: 6, season: 2 });
  assert.equal(profile.facts.stockPublication, 'COMPLETE_FINITE_SYNTHETIC_SOURCE_ONLY');
  assert.equal(profile.facts.images, 'NOT_APPLICABLE_NO_INVENTORY_IMAGE_COLUMN');
  assert.ok(profile.identities.entries.length > 4800);
  assert.equal(new Set(profile.identities.entries.map(row => row.wireId)).size, profile.identities.entries.length);
  for (const row of profile.identities.entries) assert.match(row.wireId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('mapping is full-domain, query-order independent, bidirectional and does not rewrite labels', async () => {
  const map = createInventoryIdentityMap({ reordered: [...profile.identities.entries].reverse().map(row => row.logicalId) });
  assert.deepEqual(map.entries, profile.identities.entries);
  const digest = profileDigest(profile);
  for (const q of [query(500, 2), query(100, 6), query(200, 1)]) assert.equal((await route('/inventory/query', q)).status, 200);
  for (const row of map.entries) assert.equal(map.decodeId(map.encodeId(row.logicalId)), row.logicalId);
  assert.deepEqual(map.encode({ name: 'test-label-is-not-an-id', quantity: '-2', code: 'TEST-600' }), { name: 'test-label-is-not-an-id', quantity: '-2', code: 'TEST-600' });
  assert.throws(() => map.encodeId('test-product-601'));
  assert.throws(() => map.decodeId('ffffffff-ffff-4fff-8fff-ffffffffffff'));
  assert.throws(() => map.decodeId(profile.facts.candidates.warehouse[0].id, 'product'));
  assert.equal(profileDigest(profile), digest);
});

test('every declared logical kind rejects every other kind, especially size versus size-group', () => {
  const kinds = ['product', 'size-group', 'size', 'color', 'fit', 'warehouse', 'sku', 'category', 'supplier', 'season'];
  for (const entry of profile.identities.entries) {
    const actual = /^test-(size-group|product|size|color|fit|warehouse|sku|category|supplier|season)-/.exec(entry.logicalId)?.[1];
    assert.ok(actual);
    assert.equal(profile.identities.decodeId(entry.wireId, actual), entry.logicalId);
    for (const wrong of kinds.filter(kind => kind !== actual)) assert.throws(() => profile.identities.decodeId(entry.wireId, wrong), TypeError, `${entry.logicalId} must not decode as${wrong}`);
  }
  const group = profile.identities.encodeId('test-size-group-top');
  assert.throws(() => profile.identities.decodeId(group, 'size'), TypeError);
  assert.throws(() => profile.identities.decodeId(group, 'invented-kind'), TypeError);
});

for (const size of [100, 200, 500]) test(`size${size} pages keep all600 once, original numeric order, full-filter total and original JSON byte bound`, async () => {
  const products = [], totals = [], refs = [], lengths = [];
  for (let page = 1; page <= Math.ceil(600 / size); page++) {
    const q = query(size, page); parseInventoryQuery(q);
    const response = await route('/inventory/query', q); assert.equal(response.status, 200);
    const data = inventoryResponse(response.body, q);
    assert.equal(data.exactTotalProducts, 600); assert.equal(data.products.length, Math.min(size, 600 - (page - 1) * size));
    const bytes = Buffer.byteLength(JSON.stringify(data)); assert.ok(bytes < 8 * 1024 * 1024, `Original8MiB must remain: actual${bytes}`);
    lengths.push(bytes); products.push(...data.products); totals.push(data.allMatchesTotal); refs.push(data.readReference);
  }
  assert.deepEqual(products, profile.facts.products);
  assert.deepEqual(products.map(p => p.code), Array.from({ length: 600 }, (_, i) => `TEST-${String(i + 1).padStart(3, '0')}`));
  const exact = products.reduce((sum, p) => sum + BigInt(p.total.knownQuantity), 0n).toString();
  for (const total of totals) assert.deepEqual(total, { knownQuantity: exact, completeness: 'complete', unknownCells: 0 });
  assert.equal(new Set(refs).size, 1);
  const beyond = await route('/inventory/query', query(size, 99));
  assert.equal(beyond.status, 200); assert.equal(beyond.body.products.length, 0); assert.equal(beyond.body.exactTotalProducts, 600); assert.deepEqual(beyond.body.allMatchesTotal, totals[0]);
  assert.ok(lengths.every(n => n > 0)); // serialized DTO bytes, NOT measured transfer
});

test('actual original factory JSON is unchanged except declared identity projection', async () => {
  const factory = createSyntheticInventoryReader({ productCount: 600, delayMs: 0 });
  const q = query(100), original = inventoryResponse(await factory.readInventory(read(q)), q);
  const projected = await route('/inventory/query', q);
  assert.deepEqual(projected.body, profile.identities.encode(original));
  assert.deepEqual(projected.body.products[0].sizes.map(s => s.label), ['160/XS', '165/S', '170/M', '175/L', '180/XL', '185/2XL', '190/3XL', '195/4XL', '200/5XL', '205/6XL', '无尺码']);
  assert.equal(Object.hasOwn(projected.body.products[0], 'images'), false);
});

test('known0/negative and four non-applicable size cells remain distinct with every original total', async () => {
  const p = (await route('/inventory/query', query(100))).body.products[0], row = p.colorFits[0].rows[0];
  assert.equal(p.colorFits.length, 4); assert.equal(row.cells[p.sizes[1].id].quantity, '-2');
  assert.deepEqual(row.cells[p.sizes[3].id], { state: 'known', skuId: row.cells[p.sizes[3].id].skuId, quantity: '0' });
  for (const group of p.colorFits) for (const r of group.rows) {
    for (const size of p.sizes.slice(7)) assert.deepEqual(r.cells[size.id], { state: 'not-applicable' });
    assert.equal(r.total.knownQuantity, Object.values(r.cells).reduce((sum, cell) => sum + (cell.state === 'known' ? BigInt(cell.quantity) : 0n), 0n).toString());
  }
});

test('filter selections use declared IDs, full matching totals not current page, preserve original warehouse and fit relation', async () => {
  const supplier = profile.facts.candidates.supplier[1];
  const filter = { ...emptyInventoryFilter(), suppliers: [{ id: supplier.id, label: 'Untrusted submitted label must not rewrite facts' }] };
  const data = (await route('/inventory/query', query(100, 2, filter))).body;
  const expected = profile.facts.products.filter(p => p.supplierLabel === supplier.label);
  assert.equal(data.exactTotalProducts, 300); assert.deepEqual(data.products, expected.slice(100, 200));
  assert.equal(data.allMatchesTotal.knownQuantity, expected.reduce((sum, p) => sum + BigInt(p.total.knownQuantity), 0n).toString());
  const first = profile.facts.candidates.product[0], fit = profile.facts.candidates.fit[1], warehouse = profile.facts.candidates.warehouse[1];
  const q = query(500, 1, { ...emptyInventoryFilter(), products: [selection(first)], fits: [fit], warehouses: [warehouse] });
  const narrowed = await route('/inventory/query', q); assert.equal(narrowed.status, 200);
  assert.equal(narrowed.body.exactTotalProducts, 1); assert.equal(narrowed.body.products[0].colorFits.length, 2);
  for (const group of narrowed.body.products[0].colorFits) { assert.equal(group.fit.id, fit.id); assert.deepEqual(group.rows.map(row => row.warehouse.id), [warehouse.id]); }
  assert.deepEqual(narrowed.body.warehouseLabels, [warehouse.label]);
  const impossibleDeclaredCombination = query(100, 1, { ...emptyInventoryFilter(), products: [selection(profile.facts.candidates.product[1])], fits: [fit] });
  const empty = await route('/inventory/query', impossibleDeclaredCombination);
  assert.equal(empty.status, 200); assert.equal(empty.body.exactTotalProducts, 0); assert.deepEqual(empty.body.products, []);
  assert.deepEqual(empty.body.allMatchesTotal, { knownQuantity: '0', unknownCells: 0, completeness: 'complete' });
});

test('original candidate20 pagination, exact product search and category parent identities stay coherent', async () => {
  for (const [page, count] of [[1, 20], [30, 20], [31, 0]]) {
    const q = candidateQuery('product', page); parseInventoryCandidateQuery(q);
    const result = await route('/inventory/candidates/query', q); assert.equal(result.status, 200);
    assert.equal(result.body.exactTotal, 600); assert.equal(result.body.items.length, count);
    candidatesResponse(result.body, q); assert.deepEqual(result.body.items, profile.facts.candidates.product.slice((page - 1) * 20, page * 20));
  }
  const search = await route('/inventory/candidates/query', candidateQuery('product', 1, 'TEST-600'));
  assert.deepEqual(search.body.items, [profile.facts.candidates.product[599]]);
  const categories = await route('/inventory/candidates/query', candidateQuery('category'));
  assert.equal(categories.body.items[1].parentId, categories.body.items[0].id);
  assert.equal(categories.body.items[0].parentId, null);
});

test('actual original HTTP reader is inert until one explicit read, strict body/response and no fallback', async () => {
  const { reader, calls } = setup(); assert.equal(calls.length, 0);
  const data = await reader.readInventory(read(query(500, 2)));
  assert.equal(calls.length, 1); assert.equal(calls[0].endpoint, '/inventory/query'); assert.deepEqual(calls[0].body, query(500, 2));
  assert.deepEqual(data.products, profile.facts.products.slice(500));
  await reader.readCandidates(read(candidateQuery())); assert.equal(calls.length, 2);
  assert.equal(calls[1].endpoint, '/inventory/candidates/query');
});

test('unknown/wrong-kind IDs, duplicate selection, unsupported size and extra identity are invalid not empty0', async () => {
  const unknown = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', label: 'Unknown' }, p = profile.facts.candidates.product[0];
  const bad = [query(20), { ...query(), page: 0 }, { ...query(), actor: 'invented' },
    query(100, 1, { ...emptyInventoryFilter(), products: [unknown] }),
    query(100, 1, { ...emptyInventoryFilter(), products: [profile.facts.candidates.warehouse[0]] }),
    query(100, 1, { ...emptyInventoryFilter(), products: [p, p] })];
  for (const body of bad) { const r = await route('/inventory/query', body); assert.equal(r.status, 400); assert.equal(Object.hasOwn(r.body, 'products'), false); }
  for (const body of [{ ...candidateQuery(), pageSize: 100 }, { ...candidateQuery(), selectedIds: [unknown.id] }, { ...candidateQuery(), categoryIds: [p.id] }]) assert.equal((await route('/inventory/candidates/query', body)).status, 400);
  for (const endpoint of ['/inventory/commands', '/inventory/ledger/query', '/products/images/query', '/auth/password', '/inventory/query/../commands']) assert.equal((await route(endpoint, {})).status, 501);
});

test('original complete response validator rejects unknown/missing/duplicate/inconsistent facts, never repairs0', async () => {
  const q = query(100), good = (await route('/inventory/query', q)).body;
  const mutations = [
    d => { delete d.products[0].colorFits[0].rows[0].cells[d.products[0].sizes[0].id]; },
    d => { d.products[0].colorFits[0].rows[0].cells[d.products[0].sizes[0].id] = { state: 'unknown' }; },
    d => { d.allMatchesTotal = { knownQuantity: '0', unknownCells: 1, completeness: 'partial' }; },
    d => { d.products[1].id = d.products[0].id; },
    d => { d.products[0].colorFits[0].rows[0].cells[d.products[0].sizes[0].id].skuId = d.products[0].colorFits[0].rows[0].cells[d.products[0].sizes[1].id].skuId; },
    d => { d.products[0].colorFits[0].rows[0].total.knownQuantity = '9999'; },
  ];
  for (const mutate of mutations) { const bad = clone(good); mutate(bad); assert.throws(() => inventoryResponse(bad, q)); }
});

test('original HTTP client rejects malformed200, declared503 and500 without success0 or retries', async () => {
  const before = profileDigest(profile);
  const unavailable = setup({ failure: 'not-ready' });
  await assert.rejects(() => unavailable.reader.readInventory(read(query())), { kind: 'unavailable', status: 503 }); assert.equal(unavailable.calls.length, 1);
  const failed = setup({ failure: 'read-failed' });
  await assert.rejects(() => failed.reader.readInventory(read(query())), { kind: 'http', status: 500 }); assert.equal(failed.calls.length, 1);
  const malformed = setup({ replace: result => { const bad = clone(result.body); delete bad.products[0].sizes; return new Response(JSON.stringify(bad), { headers: { 'content-type': 'application/json' } }); } });
  await assert.rejects(() => malformed.reader.readInventory(read(query())), { kind: 'malformed-response' }); assert.equal(malformed.calls.length, 1);
  assert.equal(profileDigest(profile), before);
});

test('pre-cancel does not dispatch; in-flight abort and valid late contract result do not become success', async () => {
  const { reader, calls } = setup(), before = new AbortController(); before.abort();
  await assert.rejects(() => reader.readInventory(read(query(), before.signal)), { kind: 'aborted' }); assert.equal(calls.length, 0);
  let enteredDuring; const reachedTransport = new Promise(resolve => { enteredDuring = resolve; });
  const inflight = setup({ onDispatch: enteredDuring }), during = new AbortController();
  const pending = inflight.reader.readInventory(read(query(), during.signal)); await reachedTransport; during.abort();
  await assert.rejects(() => pending, { kind: 'aborted' }); assert.equal(inflight.calls.length, 1);
  // Separate pure streamed-client cancellation contract. Not a DOM late-attach
  // or actual HTTP/browser test; the fixture never substitutes success0.
  let release, entered; const started = new Promise(resolve => { entered = resolve; });
  const late = createInventoryHttpReader({ origin: 'https://inventory-fixture.invalid', basePath: '/api', fetch: async () => {
    entered(); return new Promise(resolve => { release = resolve; });
  } });
  const abort = new AbortController(), lateRead = late.readInventory(read(query(), abort.signal)); await started; abort.abort();
  await assert.rejects(() => lateRead, { kind: 'aborted' });
  const good = await route('/inventory/query', query()); release(new Response(JSON.stringify(good.body), { headers: { 'content-type': 'application/json' } }));
});

test('facts, every nested quantity and complete identity map are immutable and digest-stable after all operations', () => {
  const before = profileDigest(profile);
  assert.throws(() => { profile.facts.products[0].name = 'rewritten'; }, TypeError);
  assert.throws(() => { profile.facts.products[0].colorFits[0].rows[0].total.knownQuantity = '0'; }, TypeError);
  assert.throws(() => { profile.identities.entries.pop(); }, TypeError);
  assert.equal(profileDigest(profile), before);
  assert.throws(() => profileDigest({ ...profile }));
});
