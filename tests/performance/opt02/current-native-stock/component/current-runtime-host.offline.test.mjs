/** Faults use fake wire callbacks / mocked pg.connect only. No SQL, target,
 * physical cluster, source publication or issuer acceptance is established. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { createBudget } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { LOGICAL, compileFinitePolicy } from '../reference-compiler-cohort-v2/universe.mjs';
import { compileAliasFourReadPolicy } from '../reference-compiler-alias4-v1/alias4-policy.mjs';
import { loadPairedSourcePlan } from '../reference-compiler-cohort-v2/source-cohort.mjs';
import { buildReferenceFixture } from './fixture.mjs';
import { REFERENCE_BALANCES_SQL } from './source-verification.mjs';
import { createCurrentRuntimeQueryMetrics } from './current-runtime-query-metrics.mjs';
import { createCapturedQueryBoundary, createCurrentRuntimeSession, renderOwnerPublicationGuard,
  assertCurrentRuntimePool, runOriginalPublicationAndClose, preparePublishedCurrentReference, preparePublishedCurrentReferenceAlias4,
  verifyPublishedReferenceState, PUBLISHED_REFERENCE_STATE_SQL, DIRECT_RUNTIME_IDENTITY_SQL, HOST_STATUS } from './current-runtime-host.mjs';

const budget = () => createBudget(Date.now());
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fakeClient(pid, query) { return { processID: pid, query, ends: 0, async end() { this.ends++; } }; }
function target() {
  const startsAt = Date.now();
  return { systemIdentifier: '7703999999999999999', database: LOGICAL.database, databaseOid: '30001',
    admin: LOGICAL.admin, owner: LOGICAL.sourceOwner, sentinel: LOGICAL.sentinel, prepare: LOGICAL.preparation,
    runtime: LOGICAL.runtime, port: 55449, postmasterStart: '2026-11-01 05:00:00+00', startsAt, expiresAt: startsAt + 1200000 };
}
function identity(t, pid, role = t.runtime) {
  return { acting_role: role, session_role: role, database: t.database, pid, address_match: true,
    port: t.port, postmaster_start: t.postmasterStart, server_version: '170011', replication_role: 'origin' };
}

test('optional metrics only sample captured runtime wire calls; setup/admin/config/result never enter report', async () => {
  const metrics = createCurrentRuntimeQueryMetrics(), b = createCapturedQueryBoundary({ budget: budget(), queryMetrics: metrics }), sent = [];
  const clients = ['admin', 'owner-setup-writer', 'runtime'].map((kind, i) => {
    const c = fakeClient(49001 + i, async config => { sent.push([kind, config.text]); return { rows: [{ password: 'NO_RESULT_LOG' }] }; }); b.capture(c, kind); return c;
  });
  await b.query(clients[2], 'SELECT 0');
  await metrics.sampleService('host-fake', async () => { for (const c of clients) await b.query(c, 'SELECT 1'); });
  const r = metrics.takeSample(); assert.equal(r.status, 'VALID_SAMPLE'); assert.equal(r.queryCount, 2); assert.equal(r.events[0].kind, 'HOST_TIMEOUT_SET'); assert.equal(r.events[1].sql, 'SELECT 1'); assert.equal(JSON.stringify(r).includes('NO_RESULT_LOG'), false);
  assert.equal(sent.length, 8); await b.closeAll();
  assert.throws(() => createCapturedQueryBoundary({ budget: budget(), queryMetrics: { ...metrics } }), /ORIGINAL_CURRENT_RUNTIME_QUERY_METRICS_REQUIRED/);
});

test('enabled metrics cannot send a continuation after global quarantine or swallow unknown COMMIT', async () => {
  const metrics = createCurrentRuntimeQueryMetrics(), b = createCapturedQueryBoundary({ budget: budget(), queryMetrics: metrics }), ready = deferred(), release = deferred(), sent = [];
  const c = fakeClient(49004, async config => { sent.push(config.text); ready.resolve(); await release.promise; return { rows: [] }; }); b.capture(c, 'runtime');
  const sample = metrics.sampleService('quarantine-fake', () => b.query(c, 'SELECT MUST_NOT_SEND'));
  await ready.promise; const cause = Error('unknown COMMIT'); await assert.rejects(b.commit(async () => { throw cause; }), e => e === cause); release.resolve(); await assert.rejects(sample, /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/);
  assert.equal(sent.length, 1); assert.match(sent[0], /^SET statement_timeout=/); assert.equal(metrics.takeSample().status, 'INVALID_SAMPLE'); await b.closeAll(); assert.equal(c.ends, 1);
});

test('metrics preserve the genuine leased pool unknown-COMMIT error/close-only behavior', async t => {
  const tr = target(), metrics = createCurrentRuntimeQueryMetrics(), b = createCapturedQueryBoundary({ budget: budget(), queryMetrics: metrics }), sent = [], cause = Error('lost COMMIT ACK');
  const admin = fakeClient(49005, async config => { sent.push(['admin', config.text]); return { rows: [] }; }); b.capture(admin, 'admin');
  t.mock.method(Client.prototype, 'connect', async function () { this.processID = 49006; });
  t.mock.method(Client.prototype, 'end', async function () {});
  t.mock.method(Client.prototype, 'query', async function (config) { sent.push(['runtime', config.text]); if (config.text === 'COMMIT') throw cause; return { rows: config.text === DIRECT_RUNTIME_IDENTITY_SQL ? [identity(tr, this.processID)] : [] }; });
  const session = createCurrentRuntimeSession({ target: tr, budget: budget(), queryBoundary: b, adminClient: admin,
    runtimePassword: 'MOCK_PASSWORD_ONLY_NEVER_SAMPLED_123456789', verifyPhysical: async () => {}, verifySources: async () => {}, verifyPublished: async () => {} });
  let originalUnknown;
  await assert.rejects(metrics.sampleService('lease-commit-fake', async () => {
    const lease = await session.pool.connect(); try { await lease.query('COMMIT'); }
    catch (error) { originalUnknown = error; throw error; } finally { lease.release(); }
  }), e => e === originalUnknown && e.cause === cause && e.message.startsWith('COMPONENT_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY:'));
  const last = sent.length; await assert.rejects(session.pool.connect()); await session.close(); assert.equal(sent.length, last);
  assert.equal(sent.at(-1)[1], 'COMMIT'); assert.equal(session.gate.quarantined(), true);
  const r = metrics.takeSample(); assert.equal(r.status, 'INVALID_SAMPLE'); assert.equal(JSON.stringify(r).includes('MOCK_PASSWORD'), false); assert.ok(r.events.every(e => !e.sql || !e.sql.startsWith('DO ')));
});

test('shared physical fence blocks BOTH pending timeout SET continuations after one unknown COMMIT', async () => {
  const b = createCapturedQueryBoundary({ budget: budget() }), pending = [], sent = [];
  for (const [kind, pid] of [['admin', 41001], ['runtime', 41002]]) {
    const ready = deferred(), release = deferred();
    const client = fakeClient(pid, async config => { sent.push([kind, config.text]); ready.resolve(); await release.promise; return { rows: [] }; });
    b.capture(client, kind);
    const attempt = b.query(client, 'SELECT MUST_NOT_SEND_AFTER_PENDING_SET');
    pending.push({ client, ready, release, attempt });
  }
  await Promise.all(pending.map(p => p.ready.promise));
  const cause = new Error('failed original COMMIT acknowledgement');
  await assert.rejects(b.commit(async () => { throw cause; }), error => error === cause);
  for (const p of pending) p.release.resolve();
  for (const p of pending) await assert.rejects(p.attempt, /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/);
  assert.equal(sent.length, 2); assert.ok(sent.every(([, sql]) => sql.startsWith('SET statement_timeout=')));
  await assert.rejects(b.query(pending[0].client, 'ROLLBACK'), /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/);
  assert.equal(sent.length, 2);
  const closed = await b.closeAll(); assert.equal(closed.length, 2); assert.ok(closed.every(r => r.confirmed));
  assert.ok(pending.every(p => p.client.ends === 1));
});

test('a failed sent COMMIT is quarantined globally; close is idempotent and sends no cleanup SQL', async () => {
  const b = createCapturedQueryBoundary({ budget: budget() }), sql = [], cause = new Error('COMMIT transport lost');
  const client = fakeClient(41003, async config => { sql.push(config.text); if (config.text === 'COMMIT') throw cause; return { rows: [] }; });
  b.capture(client, 'admin'); await assert.rejects(b.query(client, 'COMMIT'), error => error === cause);
  await assert.rejects(b.query(client, 'ROLLBACK'), /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/);
  assert.equal(sql.at(-1), 'COMMIT'); assert.equal(b.gate.quarantined(), true);
  await b.closeClient(client); await b.closeClient(client); await b.closeAll(); assert.equal(client.ends, 1);
  assert.equal(b.receipts().length, 1); assert.equal(sql.at(-1), 'COMMIT');
});

test('mocked transport exercises genuine pg.Client direct LOGIN, no owner fallback, and confirmed closes', async t => {
  const tr = target(), sent = [], checks = [], admin = fakeClient(41001, async config => { sent.push(['admin', config.text]); return { rows: [] }; });
  t.mock.method(Client.prototype, 'connect', async function () {
    assert.equal(this.connectionParameters.options, '-c search_path=pg_catalog',
      'ordinary LOGIN must not SET the forbidden session_replication_role parameter, even to origin');
    this.processID = 41002;
  });
  t.mock.method(Client.prototype, 'end', async function () { checks.push('runtime-end'); });
  t.mock.method(Client.prototype, 'query', async function (config) {
    sent.push(['runtime', config.text]);
    return { rows: config.text === DIRECT_RUNTIME_IDENTITY_SQL ? [identity(tr, this.processID)] : [], rowCount: 0 };
  });
  const session = createCurrentRuntimeSession({ target: tr, budget: budget(), adminClient: admin,
    runtimePassword: 'FAKE_RAM_ONLY_NEVER_A_REAL_DATABASE_PASSWORD_123456',
    verifyPhysical: async () => { checks.push('physical'); }, verifySources: async () => { checks.push('source'); },
    verifyPublished: async () => { checks.push('published'); } });
  assert.equal(assertCurrentRuntimePool(session.pool), session.pool);
  assert.throws(() => assertCurrentRuntimePool({ ...session.pool }), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  assert.throws(() => assertCurrentRuntimePool({ connect: session.pool.connect }), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  const lease = await session.pool.connect(); await lease.query('SELECT ORIGINAL_APPLICATION_QUERY');
  await assert.rejects(lease.query('SET ROLE "owner"'), /NO_OWNER_OR_SET_ROLE_BUSINESS_FALLBACK/);
  lease.release(); await session.pool.awaitIdle(); const closed = await session.close();
  assert.equal(session.sessions().length, 1); assert.equal(session.sessions()[0].acting_role, LOGICAL.runtime);
  assert.ok(checks.includes('physical') && checks.includes('source') && checks.includes('published'));
  assert.equal(closed.length, 2); assert.ok(closed.every(row => row.confirmed)); assert.equal(admin.ends, 1);
  assert.equal(checks.filter(x => x === 'runtime-end').length, 1);
  assert.ok(!sent.some(([, sql]) => /SET ROLE|RESET ROLE/.test(sql) && !sql.startsWith('DO ')));
});

test('mocked owner identity is rejected and a connecting lease closes after quarantine without more wire SQL', async t => {
  const tr = target(), sent = [], connecting = deferred(), release = deferred(); let failRole = true, ends = 0;
  t.mock.method(Client.prototype, 'connect', async function () {
    this.processID = 41002; if (!failRole) { connecting.resolve(); await release.promise; }
  });
  t.mock.method(Client.prototype, 'end', async () => { ends++; });
  t.mock.method(Client.prototype, 'query', async function (config) {
    sent.push(config.text); return { rows: config.text === DIRECT_RUNTIME_IDENTITY_SQL ? [identity(tr, this.processID, tr.owner)] : [] };
  });
  const make = () => createCurrentRuntimeSession({ target: tr, budget: budget(),
    adminClient: fakeClient(41001, async config => { sent.push(config.text); return { rows: [] }; }),
    runtimePassword: 'FAKE_RAM_ONLY_NEVER_A_REAL_DATABASE_PASSWORD_123456',
    verifySources: async () => {}, verifyPhysical: async () => {}, verifyPublished: async () => {} });
  const owner = make(); await assert.rejects(owner.pool.connect(), /ACTUAL_DIRECT_NONOWNER_RUNTIME_LOGIN_REQUIRED/);
  await owner.close(); assert.equal(ends, 1);
  failRole = false; const late = make(), acquisition = late.pool.connect(); await connecting.promise;
  late.gate.quarantine(new Error('other pool COMMIT acknowledgement unknown')); const before = sent.length; release.resolve();
  await assert.rejects(acquisition, /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/); await late.close();
  assert.equal(sent.length, before); assert.equal(ends, 2);
  assert.equal(HOST_STATUS, 'CAPTURED_CLIENT_BOUNDARY_ONLY_BOOTSTRAP_AND_ENGINE_NOT_YET_WIRED');
});

test('source-paired publication guard changes only the single-admin clause to exact two captured setup PIDs', async () => {
  const { plan, cohort } = await loadPairedSourcePlan({ sourceRoot: process.env.NAIJUE_SOURCE_COHORT_ROOT });
  const { runtime: _runtime, ...fourRoleTarget } = target();
  const before = cohort.sourcePlan.targetGuard(fourRoleTarget);
  const result = renderOwnerPublicationGuard(plan, fourRoleTarget, 41001, 41002);
  const clause = "AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())";
  const parts = before.split(clause); assert.equal(parts.length, 2);
  assert.ok(result.startsWith(parts[0])); assert.ok(result.endsWith(parts[1]));
  assert.ok(result.includes('pg_backend_pid()=41001'));
  assert.ok(result.includes("backend_type='client backend' AND pid IN(41001,41002))=2"));
  assert.ok(result.includes('pid NOT IN(41001,41002)'));
  assert.ok(result.includes("usename<>'" + LOGICAL.admin + "'"));
  assert.ok(result.includes("datname<>'" + LOGICAL.database + "'"));
  assert.equal(cohort.sourcePlan.targetGuard(fourRoleTarget), before, 'original guard was never modified');
  assert.throws(() => renderOwnerPublicationGuard(plan, fourRoleTarget, 41001, 41001), /DISTINCT_CAPTURED_SETUP_PIDS/);
  assert.throws(() => renderOwnerPublicationGuard(plan, fourRoleTarget, 41001, '41002'), /DISTINCT_CAPTURED_SETUP_PIDS/);
});

test('published source guard binds batch/checkpoint/balances without rejecting legitimate new native product identities', async () => {
  const fixture = buildReferenceFixture();
  const original = { status: 'IMPORTED', source_name: fixture.commands[0].sourceName,
    source_manifest_ref: fixture.commands[0].sourceManifestRef, source_hash: fixture.commands[0].sourceHash,
    inventory_mode: 'CUTOFF_STOCK_BASELINE', checkpoint: fixture.checkpoints[3],
    cutoff_at: fixture.cutoffAt.slice(0, -1) + '000Z', history_expected_counts: null, history_payload_hash: null };
  const balances = fixture.baselines.map(row => ({ warehouse_id: row.warehouseId, sku_id: row.skuId,
    quantity: row.quantity, version: 1, last_operation_id: fixture.expectedResults[2].operationId }))
    .sort((a, b) => a.warehouse_id.localeCompare(b.warehouse_id, 'en') || a.sku_id.localeCompare(b.sku_id, 'en'));
  const makeQuery = batch => {
    const calls = [];
    return { calls, async query(text, values) {
      calls.push(text);
      if (text === PUBLISHED_REFERENCE_STATE_SQL) { assert.deepEqual(values, [fixture.batchId]); return { rows: [batch] }; }
      assert.equal(text, REFERENCE_BALANCES_SQL); return { rows: balances };
    } };
  };
  const good = makeQuery(original), result = await verifyPublishedReferenceState(good.query, fixture);
  assert.equal(result.additionalNativeProductSkuIdsForbidden, false);
  assert.deepEqual(good.calls, [PUBLISHED_REFERENCE_STATE_SQL, REFERENCE_BALANCES_SQL]);
  assert.ok(good.calls.every(sql => !/count\(\*\).*\b(product|sku)\b/i.test(sql)), 'not a global native-row prohibition');
  for (const change of [b => { b.status = 'VALIDATING'; }, b => { b.source_hash = '0'.repeat(64); },
    b => { b.source_name += ':other'; }, b => { b.source_manifest_ref += ':other'; }, b => { b.inventory_mode = 'OTHER'; },
    b => { b.checkpoint.cursor++; }, b => { b.cutoff_at = '2026-11-02T00:00:00.000000Z'; },
    b => { b.history_expected_counts = {}; }, b => { b.history_payload_hash = '0'.repeat(64); }]) {
    const batch = structuredClone(original); change(batch); const failed = makeQuery(batch);
    await assert.rejects(verifyPublishedReferenceState(failed.query, fixture), /CURRENT_PUBLISHED_REFERENCE_SOURCE_OR_CHECKPOINT_CHANGED/);
    assert.equal(failed.calls.length, 1, 'no following source query after rejection');
  }
});

test('all three bootstrap database autocommit revocations quarantine a lost ACK before ANY following wire SQL', async () => {
  const source = await readFile(new URL('./current-runtime-host.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("for (const database of ['postgres', 'template0', 'template1']) await boundary.commit(() => query(`REVOKE ALL ON DATABASE ${identifier(database)} FROM PUBLIC`));"),
    'actual preparation must bind each autocommit REVOKE to the shared outcome boundary');
  for (const failedDatabase of ['postgres', 'template0', 'template1']) {
    const sent = [], cause = new Error('unknown autocommit REVOKE acknowledgement: ' + failedDatabase);
    const client = fakeClient(41001, async config => {
      sent.push(config.text);
      if (config.text === `REVOKE ALL ON DATABASE "${failedDatabase}" FROM PUBLIC`) throw cause;
      return { rows: [] };
    });
    const boundary = createCapturedQueryBoundary({ budget: budget() }); boundary.capture(client, 'admin');
    await assert.rejects((async () => {
      for (const database of ['postgres', 'template0', 'template1'])
        await boundary.commit(() => boundary.query(client, `REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`));
      await boundary.query(client, 'SELECT MUST_NOT_FOLLOW_UNKNOWN_AUTOCOMMIT');
    })(), error => error === cause);
    const last = sent.at(-1); assert.equal(last, `REVOKE ALL ON DATABASE "${failedDatabase}" FROM PUBLIC`);
    await assert.rejects(boundary.query(client, 'ROLLBACK'), /NO_PHYSICAL_SQL_AFTER_UNKNOWN_COMMIT/);
    assert.equal(sent.at(-1), last); assert.equal(boundary.gate.quarantined(), true);
    await boundary.closeAll(); assert.equal(client.ends, 1); assert.equal(sent.at(-1), last);
  }
});


test('publication failure and captured-close failure retain BOTH original causes without retry or extra query', async () => {
  const first = new Error('original COMMIT acknowledgement unknown'), close = new Error('captured physical close unconfirmed');
  const calls = [];
  await assert.rejects(runOriginalPublicationAndClose(async () => { calls.push('work'); throw first; },
    async () => { calls.push('close-only'); throw close; }), error => error instanceof AggregateError
      && error.cause === first && error.errors.length === 2 && error.errors[0] === first && error.errors[1] === close);
  assert.deepEqual(calls, ['work', 'close-only']);
  await assert.rejects(runOriginalPublicationAndClose(async () => { throw first; }, async () => {}), error => error === first);
  await assert.rejects(runOriginalPublicationAndClose(async () => 'ok', async () => { throw close; }), error => error === close);
  assert.equal(await runOriginalPublicationAndClose(async () => 'ok', async () => {}), 'ok');
});

// Pure fixed-profile routing only. Invalid captured boundary stops every path
// before physical identity, schema, SQL or publication; no fake issuer success.
let sourcePolicies;
async function finiteSourcePolicies(){
 if(!sourcePolicies)sourcePolicies=(async()=>{
  const {plan}=await loadPairedSourcePlan({sourceRoot:process.env.NAIJUE_SOURCE_COHORT_ROOT});
  const material=new URL('../../../../../../development-results-20261031/current-runtime-feasibility-independent-review/',import.meta.url);
  const read=name=>readFile(new URL(name,material),'utf8');
  const base=await compileFinitePolicy(plan,{materialText:await read('PLANNED-CURRENT-ISSUER-CREATE-STOCK-ACL-v1.json'),addendumText:await read('SOURCE-CLOSURE-AND-LOCK-SELECTION-ADDENDUM-v1.json'),closureText:await read('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json'),universeText:await read('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json')});
  const alias=compileAliasFourReadPolicy(base,{addendumText:await readFile(new URL('../reference-compiler-alias4-v1/ALIAS4-SOURCE-ADDENDUM.json',import.meta.url),'utf8'),maintenanceSourceText:await readFile(new URL('../../../../../adapters/postgres/src/product-maintenance-store.ts',import.meta.url),'utf8'),schemaSourceText:await readFile(new URL('../../../../../adapters/postgres/migrations/0011_history_storage.sql',import.meta.url),'utf8')});
  return {plan,base,alias};})();return sourcePolicies;
}
test('fixed host profiles retain original335 and accept only genuine new339 in separately named entry before captured-boundary gate',async()=>{
 const {plan,base,alias}=await finiteSourcePolicies();let calls=0;
 const options=policy=>({plan,policy,target:target(),budget:budget(),queryBoundary:{},adminClient:{processID:41001},adminPassword:'MOCK_ONLY_NEVER_DATABASE_SECRET_1234567890',artifactRoot:'/tmp/NOT_CREATED_ALIAS4_HOST_PROFILE',verifyPhysical:()=>{calls++;},verifySources:()=>{calls++;},registerSecret:()=>{calls++;},save:()=>{calls++;}});
 await assert.rejects(preparePublishedCurrentReference(options(alias)),/ORIGINAL_SOURCE_COMPILED_FINITE_POLICY_REQUIRED/);
 await assert.rejects(preparePublishedCurrentReferenceAlias4(options(base)),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
 await assert.rejects(preparePublishedCurrentReferenceAlias4(options({...alias})),/ORIGINAL_ALIAS4_POLICY_REQUIRED/);
 await assert.rejects(preparePublishedCurrentReference(options(base)),/ONE_SHARED_CAPTURED_ADMIN_QUERY_BOUNDARY_REQUIRED/);
 await assert.rejects(preparePublishedCurrentReferenceAlias4(options(alias)),/ONE_SHARED_CAPTURED_ADMIN_QUERY_BOUNDARY_REQUIRED/);
 assert.equal(calls,0);
});
test('new host cannot accept callerprofile/render/function/SQL/role switches or getters',async()=>{
 const {plan,alias}=await finiteSourcePolicies();let calls=0;
 const options={plan,policy:alias,target:target(),budget:budget(),queryBoundary:{},adminClient:{processID:41001},adminPassword:'MOCK_ONLY_NEVER_DATABASE_SECRET_1234567890',artifactRoot:'/tmp/NOT_CREATED_ALIAS4_HOST_PROFILE',verifyPhysical:()=>{calls++;},verifySources:()=>{calls++;},registerSecret:()=>{calls++;},save:()=>{calls++;}};
 for(const key of ['profile','renderGrants','assertPolicy','sql','role'])await assert.rejects(preparePublishedCurrentReferenceAlias4({...options,[key]:()=>{calls++;}}));
 const getter={...options};Object.defineProperty(getter,'policy',{enumerable:true,get(){calls++;return alias;}});await assert.rejects(preparePublishedCurrentReferenceAlias4(getter));assert.equal(calls,0);
});
