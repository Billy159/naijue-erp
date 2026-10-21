/** Independent connection-free tests: scripted pg protocol and synthetic only. No engine claims. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createSalesActionAuthorization, assertSalesActionAllowed } from '../../packages/application/src/sales-authorization.ts';
import { createSalesService } from '../../packages/application/src/sales-service.ts';
import { PostgresSalesUnitOfWork } from '../../adapters/postgres/src/sales-unit-of-work.ts';
import { createSalesHttpPlugin, exactJson } from '../../apps/api/src/sales-http.ts';
import { SyntheticStore } from '../../tests/support/synthetic-store.ts';
import { actor, ids, sid, syntheticDraft, SYNTHETIC_RULES } from '../../tests/support/synthetic-fixtures.ts';
import { version, quantity } from '../../packages/domain/src/values.ts';
const time = '2026-10-21T00:00:00Z';
const other = { accountId: sid('account', 7901), hallId: actor.hallId };
const otherHall = sid('hall', 7902);
const identity = (context = actor, change = {}) => ({ accountId: context.accountId, staffId: sid('staff', context === other ? 7903 : 7904), loginEnabled: true, role: 'SALESPERSON', employmentStatus: '在职', hallId: context.hallId, hallEnabled: context.hallId === null ? null : true, ...change });
const document = (change = {}) => ({ ...syntheticDraft(), header: { ...syntheticDraft().header, status: 'DRAFT', version: version(1), createdByAccountId: actor.accountId, createdHallId: actor.hallId, createdAt: time, updatedAt: time, approvedByAccountId: null, approvedAt: null, ...change } });
const actionPolicy = createSalesActionAuthorization();
function synthetic() {
  const store = new SyntheticStore(); const calls = [];
  store.seedIdentity(identity()); store.seedIdentity(identity(other));
  for (const skuId of [ids.sku, ids.sku2]) store.seedBalance({ warehouseId: ids.warehouse, skuId, quantity: quantity('0'), version: version(1), lastOperationId: null, updatedAt: time });
  let sequence = 7950;
  const dependencies = { unitOfWork: store, rules: SYNTHETIC_RULES,
    authorization: { async assertAllowed(context, action, row, tx) {
      assert.equal(typeof tx?.getCurrentSalesIdentity, 'function'); calls.push({ action, row: structuredClone(row), tx });
      return actionPolicy.assertAllowed(context, action, row, tx);
    } }, now: () => time, newId: kind => sid(kind, sequence++) };
  const service = createSalesService(dependencies);
  const current = () => { const state = store.snapshot(); return { header: state.headers.get(ids.sales), lines: [...state.lines.values()].filter(r => r.salesId === ids.sales), settlements: [...state.settlements.values()].filter(r => r.salesId === ids.sales) }; };
  return { store, service, dependencies, calls, current };
}
const save = (requestKey = 'save', context = actor, draft = syntheticDraft(), expectedVersion = null) => ({ action: 'SAVE', actor: context, requestKey, draft, expectedVersion });
const command = (action, expectedVersion, requestKey = action, context = actor) => ({ action, actor: context, requestKey, salesId: ids.sales, expectedVersion: version(expectedVersion) });

test('independent SYNTHETIC: full confirmed action matrix and state-independent receipt authorization', () => {
  for (const role of ['ADMIN', 'WAREHOUSE', 'SALESPERSON']) for (const action of ['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID']) for (const hall of [ids.hall, otherHall]) for (const creator of [actor.accountId, other.accountId]) for (const status of ['DRAFT', 'APPROVED', 'VOID']) {
    const row = document({ hallId: hall, createdByAccountId: creator, status });
    const allowed = role !== 'SALESPERSON' || hall === ids.hall && action !== 'UNAPPROVE' && (action !== 'APPROVE' || creator === actor.accountId);
    if (allowed) assert.doesNotThrow(() => assertSalesActionAllowed(actor, action, row, identity(actor, { role })));
    else assert.throws(() => assertSalesActionAllowed(actor, action, row, identity(actor, { role })), { code: 'FORBIDDEN' });
  }
});
test('independent SYNTHETIC: unknown/missing/stale identity facts fail closed', () => {
  for (const facts of [undefined, identity(actor, { role: 'UNKNOWN' }), identity(actor, { employmentStatus: '离职' }), identity(actor, { loginEnabled: false }), identity(actor, { hallEnabled: false }), identity(actor, { hallId: otherHall }), identity(actor, { staffId: 'bad' }), identity(actor, { accountId: other.accountId }), identity(actor, { hallId: null, hallEnabled: null })]) {
    assert.throws(() => assertSalesActionAllowed(actor, 'SAVE', syntheticDraft(), facts), { code: 'FORBIDDEN' });
  }
  assert.throws(() => assertSalesActionAllowed(actor, 'EXPORT', syntheticDraft(), identity()), { code: 'FORBIDDEN' });
});
test('independent SYNTHETIC: own-hall editing never changes real creator or grants another creator approval', async () => {
  const f = synthetic();
  const forgedNew = syntheticDraft(); forgedNew.header.createdByAccountId = actor.accountId;
  await f.service.execute(save('other-created', other, forgedNew));
  assert.equal(f.current().header.createdByAccountId, other.accountId);
  const forgedEdit = syntheticDraft(); forgedEdit.header.createdByAccountId = actor.accountId; forgedEdit.header.createdHallId = otherHall; forgedEdit.header.createdAt = '1900-01-01T00:00:00Z'; forgedEdit.header.salespersonId = identity().staffId;
  f.calls.length = 0;
  await f.service.execute(save('my-edit', actor, forgedEdit, version(1)));
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].tx, f.calls[1].tx);
  assert.equal(f.current().header.createdByAccountId, other.accountId); assert.equal(f.current().header.createdHallId, actor.hallId); assert.equal(f.current().header.createdAt, time);
  const before = f.store.snapshot();
  await assert.rejects(f.service.execute(command('APPROVE', 2, 'forged-approval')), { code: 'FORBIDDEN' }); assert.deepEqual(f.store.snapshot(), before);
  assert.equal((await f.service.execute(command('APPROVE', 2, 'real-approval', other))).status, 'APPROVED');
});
test('independent SYNTHETIC: all four auth call sites receive tx and SAVE receipt survives later approval', async t => {
  const f = synthetic(); const original = save(); const saved = await f.service.execute(original);
  await f.service.execute(command('APPROVE', 1));
  f.calls.length = 0; const before = f.store.snapshot();
  assert.deepEqual(await f.service.execute(original), saved); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].row.header.status, 'APPROVED'); assert.deepEqual(f.store.snapshot(), before);
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createSalesHttpPlugin({ authenticate: async () => actor, dependencies: f.dependencies })); await app.ready();
  assert.equal(app.server.listening, false);
  f.calls.length = 0; const response = await app.inject({ method: 'GET', url: '/sales/receipts/save' });
  assert.equal(response.statusCode, 200, response.body); assert.deepEqual(response.json().result, saved); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].row.header.status, 'APPROVED'); assert.deepEqual(f.store.snapshot(), before);
  f.store.seedIdentity(identity(actor, { loginEnabled: false })); const revoked = f.store.snapshot();
  assert.equal((await app.inject({ method: 'GET', url: '/sales/receipts/save' })).statusCode, 403);
  await assert.rejects(f.service.execute(original), { code: 'FORBIDDEN' }); assert.deepEqual(f.store.snapshot(), revoked);
});
test('independent SYNTHETIC: denied identity/action and cross-hall move produce no writes', async () => {
  for (const change of [{ loginEnabled: false }, { employmentStatus: '离职' }, { role: 'OWNER' }, { hallEnabled: false }, { hallId: otherHall }]) {
    const f = synthetic(); f.store.seedIdentity(identity(actor, change)); const before = f.store.snapshot();
    await assert.rejects(f.service.execute(save()), { code: 'FORBIDDEN' }); assert.deepEqual(f.store.snapshot(), before);
  }
  const f = synthetic(); await f.service.execute(save()); const before = f.store.snapshot();
  const moved = syntheticDraft(); moved.header.hallId = otherHall;
  await assert.rejects(f.service.execute(save('move', actor, moved, version(1))), { code: 'FORBIDDEN' }); assert.deepEqual(f.store.snapshot(), before);
  await f.service.execute(command('APPROVE', 1)); const approved = f.store.snapshot();
  await assert.rejects(f.service.execute(command('UNAPPROVE', 2)), { code: 'FORBIDDEN' }); assert.deepEqual(f.store.snapshot(), approved);
});
test('independent SYNTHETIC: state, settlement, CAS, history and privileged inverse still gate after auth', async () => {
  const f = synthetic(); await f.service.execute(save());
  const before = f.store.snapshot(); await assert.rejects(f.service.execute(command('APPROVE', 2)), { code: 'VERSION_CONFLICT' }); assert.deepEqual(f.store.snapshot(), before);
  await f.service.execute(command('APPROVE', 1)); const posted = f.store.snapshot();
  await assert.rejects(f.service.execute(save('approved-edit', actor, syntheticDraft(), version(2))), { code: 'INVALID_STATE' }); assert.deepEqual(f.store.snapshot(), posted);
  f.store.seedIdentity(identity(actor, { role: 'WAREHOUSE' })); await f.service.execute(command('UNAPPROVE', 2));
  assert.equal(f.store.snapshot().ledger.length, 2); assert.equal([...f.store.snapshot().balances.values()][0].quantity, 0n);
  const bad = synthetic(); const draft = syntheticDraft(); draft.settlements[0].amount = 1n; await bad.service.execute(save('unbalanced', actor, draft)); const badBefore = bad.store.snapshot();
  await assert.rejects(bad.service.execute(command('APPROVE', 1)), { code: 'SETTLEMENT_MISMATCH' }); assert.deepEqual(bad.store.snapshot(), badBefore);
  const hist = synthetic(); hist.store.seedCutoffHistory(document()); const histBefore = hist.store.snapshot();
  await assert.rejects(hist.service.execute(save('history', actor, syntheticDraft(), version(1))), { code: 'HISTORICAL_POSTING_NOT_IMPLEMENTED' }); assert.deepEqual(hist.store.snapshot(), histBefore);
});

class ProtocolClient {
  calls = []; releases = []; identityRow = { account_id: actor.accountId, staff_id: sid('staff', 7980), login_enabled: true, role: 'SALESPERSON', employment_status: '在职', hall_id: actor.hallId };
  hallRows = [{ id: actor.hallId, enabled: true }]; onIdentity; onHall; failRollback; header;
  async query(sql, values = []) {
    this.calls.push({ sql, values: structuredClone(values) });
    if (sql === 'ROLLBACK' && this.failRollback) throw this.failRollback;
    if (/^BEGIN|^COMMIT$|^ROLLBACK$|^SELECT pg_advisory_xact_lock/u.test(sql)) return { rows: [], rowCount: 0 };
    if (/FROM naijue_erp.operation_receipt WHERE/u.test(sql)) return { rows: [], rowCount: 0 };
    if (/FROM naijue_erp.sales_header WHERE/u.test(sql)) return { rows: this.header ? [this.header] : [], rowCount: this.header ? 1 : 0 };
    if (/FROM naijue_erp.sales_line WHERE|FROM naijue_erp.sales_settlement WHERE/u.test(sql)) return { rows: [], rowCount: 0 };
    if (/sales-authorization:identity/u.test(sql)) { if (this.onIdentity) return this.onIdentity(); return { rows: this.identityRow ? [structuredClone(this.identityRow)] : [], rowCount: this.identityRow ? 1 : 0 }; }
    if (/sales-authorization:hall/u.test(sql)) { if (this.onHall) return this.onHall(); return { rows: structuredClone(this.hallRows), rowCount: this.hallRows.length }; }
    assert.fail(`Unexpected SQL, especially mutation: ${sql}`);
  }
  release(error) { this.releases.push(error); }
}
function native(client) { let connects = 0; const uow = new PostgresSalesUnitOfWork({ async connect() { connects++; return client; } }); return { uow, connects: () => connects }; }
async function bind(tx) { await tx.getReceipt(actor.accountId, 'independent-key'); await tx.getSales(ids.sales); }
const identityCalls = client => client.calls.filter(c => /sales-authorization:identity/u.test(c.sql));
const noWrites = client => assert.equal(client.calls.some(c => /^(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP)\b/u.test(c.sql)), false);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('independent PG PROTOCOL: one lease, explicit SHARE locks, non-secret identity and active/account-bound per-tx cache', async () => {
  const client = new ProtocolClient(); const n = native(client); let escaped;
  await n.uow.transaction(async tx => {
    escaped = tx; await assert.rejects(tx.getCurrentSalesIdentity(actor.accountId), { code: 'TRANSACTION_SCOPE' });
    await bind(tx); const facts = await tx.getCurrentSalesIdentity(actor.accountId);
    assert.equal(Object.isFrozen(facts), true); assert.equal(facts.role, 'SALESPERSON'); assert.deepEqual(await tx.getCurrentSalesIdentity(actor.accountId), facts);
    const count = client.calls.length; await assert.rejects(tx.getCurrentSalesIdentity(other.accountId), { code: 'TRANSACTION_SCOPE' }); assert.equal(client.calls.length, count);
  });
  const count = client.calls.length; await assert.rejects(escaped.getCurrentSalesIdentity(actor.accountId), { code: 'TRANSACTION_CLOSED' }); assert.equal(client.calls.length, count);
  assert.equal(n.connects(), 1); assert.equal(identityCalls(client).length, 1); assert.match(identityCalls(client)[0].sql, /FOR SHARE OF a, s/u);
  assert.match(client.calls.find(c => /sales-authorization:hall/u.test(c.sql)).sql, /FOR SHARE/u); assert.deepEqual(identityCalls(client)[0].values, [actor.accountId]);
  assert.doesNotMatch(identityCalls(client)[0].sql, /password|token|session|auth_version|login_name/iu);
  client.identityRow.role = 'WAREHOUSE'; await n.uow.transaction(async tx => { await bind(tx); assert.equal((await tx.getCurrentSalesIdentity(actor.accountId)).role, 'WAREHOUSE'); });
  assert.equal(identityCalls(client).length, 2); assert.equal(n.connects(), 2); assert.equal(client.releases.length, 2); noWrites(client);
});
test('independent PG PROTOCOL: waiting identity lock returning revoked facts denies before any write', async () => {
  const client = new ProtocolClient(); const wait = deferred(); const entered = deferred();
  client.onIdentity = async () => { entered.resolve(); await wait.promise; return { rows: [{ ...client.identityRow, login_enabled: false }], rowCount: 1 }; };
  const n = native(client); const pending = n.uow.transaction(async tx => { await bind(tx); await actionPolicy.assertAllowed(actor, 'SAVE', syntheticDraft(), tx); });
  await entered.promise; assert.equal(client.calls.some(c => c.sql === 'COMMIT'), false); wait.resolve();
  await assert.rejects(pending, { code: 'FORBIDDEN' }); assert.equal(client.calls.at(-1).sql, 'ROLLBACK'); assert.deepEqual(client.releases, [undefined]); noWrites(client);
});
test('independent PG PROTOCOL: waiting hall lock returning disabled facts also denies', async () => {
  const client = new ProtocolClient(); const wait = deferred(); const entered = deferred();
  client.onHall = async () => { entered.resolve(); await wait.promise; return { rows: [{ id: actor.hallId, enabled: false }], rowCount: 1 }; };
  const n = native(client); const pending = n.uow.transaction(async tx => { await bind(tx); await actionPolicy.assertAllowed(actor, 'SAVE', syntheticDraft(), tx); });
  await entered.promise; wait.resolve(); await assert.rejects(pending, { code: 'FORBIDDEN' }); assert.equal(client.calls.at(-1).sql, 'ROLLBACK'); noWrites(client);
});
test('independent PG PROTOCOL: in-flight escaped identity lookup cannot return a grant after callback close', async () => {
  const client = new ProtocolClient(); const wait = deferred(); const entered = deferred(); let pending;
  client.onIdentity = async () => { entered.resolve(); await wait.promise; return { rows: [client.identityRow], rowCount: 1 }; };
  const n = native(client);
  await n.uow.transaction(async tx => { await bind(tx); pending = tx.getCurrentSalesIdentity(actor.accountId); pending.catch(() => undefined); await entered.promise; });
  const count = client.calls.length; wait.resolve(); await assert.rejects(pending, { code: 'TRANSACTION_CLOSED' }); assert.equal(client.calls.length, count); noWrites(client);
});
test('independent PG PROTOCOL: lookup failure rolls back once; rollback failure discards once without retry', async () => {
  for (const rollbackFailure of [undefined, new Error('SYNTHETIC rollback failure')]) {
    const client = new ProtocolClient(); const failure = new Error('SYNTHETIC identity timeout'); client.onIdentity = async () => { throw failure; }; client.failRollback = rollbackFailure;
    const n = native(client); const pending = n.uow.transaction(async tx => { await bind(tx); await tx.getCurrentSalesIdentity(actor.accountId); });
    if (rollbackFailure) await assert.rejects(pending, error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure);
    else await assert.rejects(pending, error => error === failure);
    assert.equal(identityCalls(client).length, 1); assert.equal(client.calls.filter(c => c.sql === 'ROLLBACK').length, 1); assert.equal(client.releases.length, 1); assert.equal(client.releases[0], rollbackFailure); noWrites(client);
  }
});
test('independent PG PROTOCOL: null-hall privileged identities work; missing/malformed identities never write', async () => {
  for (const role of ['ADMIN', 'WAREHOUSE']) {
    const client = new ProtocolClient(); client.identityRow = { ...client.identityRow, role, hall_id: null }; const n = native(client);
    await n.uow.transaction(async tx => { await bind(tx); await actionPolicy.assertAllowed({ ...actor, hallId: null }, 'UNAPPROVE', document({ hallId: otherHall }), tx); });
    assert.equal(client.calls.some(c => /sales-authorization:hall/u.test(c.sql)), false); noWrites(client);
  }
  for (const change of [null, { account_id: other.accountId }, { staff_id: 'BAD' }, { login_enabled: 'true' }, { role: 'UNKNOWN' }]) {
    const client = new ProtocolClient(); client.identityRow = change === null ? null : { ...client.identityRow, ...change }; const n = native(client);
    await assert.rejects(n.uow.transaction(async tx => { await bind(tx); await actionPolicy.assertAllowed(actor, 'SAVE', syntheticDraft(), tx); })); assert.equal(client.calls.at(-1).sql, 'ROLLBACK'); noWrites(client);
  }
});
test('independent PG PROTOCOL: absent/duplicate/wrong/disabled hall facts reject without writes', async () => {
  for (const halls of [[], [{ id: otherHall, enabled: true }], [{ id: actor.hallId, enabled: false }], [{ id: actor.hallId, enabled: true }, { id: actor.hallId, enabled: true }]]) {
    const client = new ProtocolClient(); client.hallRows = halls; const n = native(client);
    await assert.rejects(n.uow.transaction(async tx => { await bind(tx); await actionPolicy.assertAllowed(actor, 'SAVE', syntheticDraft(), tx); })); assert.equal(client.calls.at(-1).sql, 'ROLLBACK'); noWrites(client);
  }
});
function headerRow(row) {
  const h = row.header;
  return { id: h.id, number: h.number, business_type: h.businessType, business_date: h.businessDate, hall_id: h.hallId, customer_id: h.customerId, salesperson_id: h.salespersonId,
    warehouse_id: h.warehouseId, status: h.status, version: h.version, gross_amount: '2.50', order_discount: '0.00', net_due: '2.50', note: h.note,
    created_by_account_id: h.createdByAccountId, created_hall_id: h.createdHallId, created_at: h.createdAt, updated_at: h.updatedAt, approved_by_account_id: null, approved_at: null, stock_basis: 'RUNTIME_LEDGER' };
}
test('independent PG PROTOCOL: loaded creation facts cannot be mutated through returned alias or a new document', async () => {
  for (const field of ['createdByAccountId', 'createdHallId', 'createdAt']) {
    const client = new ProtocolClient(); client.header = headerRow(document()); const n = native(client);
    await assert.rejects(n.uow.transaction(async tx => {
      await tx.getReceipt(actor.accountId, 'creator'); const stored = await tx.getSales(ids.sales);
      stored.document.header.version = version(2);
      stored.document.header[field] = field === 'createdByAccountId' ? other.accountId : field === 'createdHallId' ? otherHall : '1900-01-01T00:00:00Z';
      await tx.putRuntimeSales(stored.document);
    }), { code: 'IMMUTABLE_CREATION_FACTS' }); noWrites(client);
  }
  const client = new ProtocolClient(); const n = native(client);
  await assert.rejects(n.uow.transaction(async tx => { await bind(tx); await tx.putRuntimeSales(document({ createdByAccountId: other.accountId })); }), { code: 'IMMUTABLE_CREATION_FACTS' }); noWrites(client);
});
