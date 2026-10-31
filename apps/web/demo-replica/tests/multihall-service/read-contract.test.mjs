/** Root executes on dot. Actual Fastify/service + synthetic source, NOT PG/save. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiHallReadFixture, createMultiHallSeed, IDS, NAMES, QUERY, ORIGIN } from './fixture.mjs';
const options = () => ({ repoRoot: process.env.MULTIHALL_REPO, expectedCheckpoint: process.env.MULTIHALL_EXPECTED_CHECKPOINT });
async function fixture(t, extra = {}) { const value = await createMultiHallReadFixture({ ...options(), ...extra }); t.after(() => value.close()); return value; }
async function query(f, kind, values = {}) { const result = await f.inject({ kind, body: { ...QUERY, ...values } }); return { ...result, value: JSON.parse(result.body) }; }
const ids = page => page.value.items.map(row => row.id).sort();
const expected = rows => [...rows].sort();

test('actual read HTTP/service: independent two-hall source, same-hall warehouse directory and unknown hall', async t => {
  const f = await fixture(t), before = f.snapshot();
  const all = await query(f, 'HALL'); assert.equal(all.status, 200); assert.deepEqual(ids(all), expected([IDS.hallA, IDS.hallB]));
  for (const [hallId, targets] of [[IDS.hallA, [IDS.warehouseA]], [IDS.hallB, [IDS.warehouseB]], [null, [IDS.warehouseA, IDS.warehouseB]], [IDS.unknown, []]]) {
    const page = await query(f, 'WAREHOUSE', { hallId }); assert.equal(page.status, 200, page.body); assert.deepEqual(ids(page), expected(targets)); assert.equal(page.value.total, targets.length);
    if (hallId !== null) assert.ok(page.value.items.every(row => row.hall.id === hallId));
  }
  const a = await query(f, 'HALL', { hallId: IDS.hallA }); assert.deepEqual(ids(a), [IDS.hallA]);
  assert.equal(a.value.items[0].defaultSalesWarehouse.id, IDS.warehouseA); assert.equal(a.value.items[0].defaultSalesWarehouse.hallId, IDS.hallA);
  for (const row of all.value.items) { assert.equal(row.createdAt, null); assert.equal(row.updatedAt, null); }
  assert.deepEqual(f.snapshot(), before); assert.equal(f.statistics().writeAttempts, 0);
});

test('actual service: account any-hall membership, exact method intersections, complete two-hall refs and genuine empty page', async t => {
  const f = await fixture(t);
  for (const [hallId, paymentMethodId, targets] of [
    [null, null, [IDS.accountA, IDS.accountB, IDS.accountAB]], [IDS.hallA, null, [IDS.accountA, IDS.accountAB]], [IDS.hallB, null, [IDS.accountB, IDS.accountAB]],
    [null, IDS.methodA, [IDS.accountA, IDS.accountAB]], [null, IDS.methodB, [IDS.accountB]], [IDS.hallA, IDS.methodB, []], [IDS.hallB, IDS.methodA, [IDS.accountAB]],
    [IDS.unknown, null, []], [null, IDS.unknown, []],
  ]) {
    const page = await query(f, 'PAYMENT_ACCOUNT', { hallId, paymentMethodId }); assert.equal(page.status, 200, page.body); assert.deepEqual(ids(page), expected(targets)); assert.equal(page.value.total, targets.length);
    const shared = page.value.items.find(row => row.id === IDS.accountAB); if (shared) assert.deepEqual(shared.halls.map(row => row.id), [IDS.hallA, IDS.hallB]);
  }
  const detail = await f.inject({ kind: 'PAYMENT_ACCOUNT', operation: 'detail', body: { id: IDS.accountAB } }); assert.equal(detail.status, 200, detail.body);
  const shared = JSON.parse(detail.body); assert.equal(shared.name, NAMES.accountAB); assert.deepEqual(shared.halls.map(row => [row.id, row.name]), [[IDS.hallA, NAMES.hallA], [IDS.hallB, NAMES.hallB]]);
  assert.equal(shared.paymentMethod.id, IDS.methodA); assert.equal(shared.createdAt, null); assert.equal(shared.updatedAt, null);
  const unknown = await f.inject({ kind: 'PAYMENT_ACCOUNT', operation: 'detail', body: { id: IDS.unknown } }); assert.equal(unknown.status, 200); assert.equal(JSON.parse(unknown.body), null);
  const beyond = await query(f, 'PAYMENT_ACCOUNT', { page: 2 }); assert.equal(beyond.status, 200); assert.equal(beyond.value.total, 3); assert.deepEqual(beyond.value.items, []);
  const literal = await query(f, 'PAYMENT_ACCOUNT', { search: '%_' }); assert.equal(literal.status, 200); assert.equal(literal.value.total, 0);
});

test('actual HTTP boundary: trusted synthetic current identity rechecked, warehouse allowed, salesperson/revocation/hall mismatch denied before source reads', async t => {
  const f = await fixture(t);
  f.selectActor('warehouse'); assert.equal((await query(f, 'PAYMENT_ACCOUNT')).status, 200);
  f.selectActor('salesperson'); let reads = f.statistics().sourceReads;
  for (const kind of ['HALL', 'WAREHOUSE', 'PAYMENT_METHOD', 'PAYMENT_ACCOUNT']) assert.equal((await query(f, kind)).status, 403);
  assert.equal(f.statistics().sourceReads, reads);
  f.selectActor(null); assert.equal((await query(f, 'HALL')).status, 401); assert.equal(f.statistics().sourceReads, reads);
  f.selectActor('admin'); f.patchIdentity('admin', { loginEnabled: false }); assert.equal((await query(f, 'HALL')).status, 403);
  f.patchIdentity('admin', { loginEnabled: true, employmentStatus: '离职' }); assert.equal((await query(f, 'HALL')).status, 403);
  f.patchIdentity('admin', { employmentStatus: '在职' });
  f.selectActor('admin', { accountId: '00000000-0000-4000-8000-000000003700', hallId: IDS.hallA }); assert.equal((await query(f, 'HALL')).status, 403);
  assert.equal(f.statistics().sourceReads, reads); assert.equal(f.statistics().writeAttempts, 0);
});

test('actual parser/HTTP rejects forged scope, malformed identity/filter and URL query; no new store HALL_IDS authority accepted', async t => {
  const f = await fixture(t), before = f.statistics().sourceReads;
  for (const body of [{ ...QUERY, scope: { kind: 'HALL_IDS', hallIds: [IDS.hallA] } }, { ...QUERY, actor: { role: 'ADMIN' } }, { ...QUERY, role: 'ADMIN' }, { ...QUERY, hallId: 'same-name-not-id' }, { ...QUERY, paymentMethodId: 'not-uuid' }, { ...QUERY, page: 0 }, { ...QUERY, pageSize: 2 }]) {
    const r = await f.inject({ kind: 'PAYMENT_ACCOUNT', body }); assert.equal(r.status, 400, r.body);
  }
  assert.equal((await f.inject({ kind: 'PAYMENT_METHOD', body: { ...QUERY, hallId: IDS.hallA } })).status, 400);
  assert.equal((await f.inject({ kind: 'HALL', body: { ...QUERY, paymentMethodId: IDS.methodA } })).status, 400);
  assert.equal((await f.inject({ kind: 'WAREHOUSE', body: QUERY, suffix: '?hallId=x' })).status, 400);
  assert.equal((await f.inject({ kind: 'HALL', operation: 'detail', body: { id: IDS.hallA, scope: 'ALL' } })).status, 400);
  assert.equal((await f.inject({ kind: 'HALL', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal(f.statistics().sourceReads, before);
});

test('negative native sources: duplicate hall association or malformed native reference fails actual service projection; no response override', async t => {
  for (const malformed of ['duplicate', 'name']) {
    const seed = createMultiHallSeed();
    if (malformed === 'duplicate') seed.accounts[2].hallIds.push(IDS.hallA); else seed.halls[0].name = 7;
    const f = await fixture(t, { seed }); const before = f.snapshot();
    const result = await query(f, 'PAYMENT_ACCOUNT'); assert.equal(result.status, 500, result.body); assert.equal(result.value.error.code, 'INTERNAL_ERROR');
    assert.deepEqual(f.snapshot(), before); assert.equal(f.statistics().writeAttempts, 0);
  }
});

test('closed request bridge forwards exact real read results; rejects foreign origin and every write/receipt without persistence', async t => {
  const f = await fixture(t), before = f.snapshot();
  const result = await f.request({ url: ORIGIN + '/api/payment/accounts/detail/query', method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: IDS.accountAB }) });
  assert.equal(result.status, 200); assert.equal(result.headers['x-synthetic-read-source'], 'actual-organization-service-memory'); assert.equal(JSON.parse(result.body).halls.length, 2);
  assert.equal(f.calls().at(-1).source, 'ACTUAL_ORGANIZATION_READ_HTTP_SERVICE_MEMORY');
  await assert.rejects(f.request({ url: 'https://other.invalid/api/payment/accounts/query', method: 'POST', body: '{}' }), /Closed synthetic origin/);
  for (const [method, pathname] of [['POST', '/api/payment/accounts/commands'], ['GET', '/api/payment/accounts/receipts/test-key'], ['POST', '/api/organization/warehouses/commands'], ['POST', '/api/sales/commands']]) {
    const denied = await f.request({ url: ORIGIN + pathname, method, body: '{}' }); assert.equal(denied.status, 501);
  }
  assert.equal(f.statistics().writeAttempts, 4); // Deliberately probed only in this backend denial test; browser requires zero.
  assert.deepEqual(f.snapshot(), before);
});
