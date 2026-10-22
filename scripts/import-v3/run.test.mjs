import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPostgresImportExecutor, runImportSteps } from './run.mjs';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { cutoffStage, cutoffTime } from '../../tests/support/synthetic-cutoff-fixtures.ts';

const sha = c => c.repeat(64);
const plan = () => ({ version: 'NATIVE_IMPORT_EXECUTION_19_V1', batchId: cutoffStage.batchId, actorAccountId: cutoffStage.actorAccountId,
  fixedSourceNamespace: 'synthetic-import-driver', cutoffAt: cutoffTime, selectionSha256: sha('a'), authorizedPayloadHash: sha('b'),
  target: { database: 'demo_8877_driver', role: 'synthetic_operator', serverAddress: '127.0.0.1', serverPort: 55555, postmasterStartedAt: '2026-10-22 01:00:00+00' } });
const stage = () => ({ kind: 'MAIN', payload: { ...structuredClone(cutoffStage), sourceName: plan().fixedSourceNamespace,
  sourceHash: plan().selectionSha256, mappingVersion: 'V2_HISTORY_NULLABLE_1',
  historyMetadata: { expectedCounts: Object.fromEntries(['history_sales_header', 'history_sales_line', 'history_sales_settlement', 'history_transfer_header',
    'history_transfer_line', 'import_source_row', 'import_sku_alias', 'import_stock_contributor', 'barcodes'].map(k => [k, 0])), payloadHash: plan().authorizedPayloadHash } } });
function fixture({ reject, target = plan().target, schema = Array.from({ length: 19 }, (_, i) => i + 1), mutate = false } = {}) {
  const calls = [], releases = [], auth = [], events = []; let previous;
  const pool = { async connect() {
    calls.push('CONNECT');
    return { async query(sql) {
      calls.push(sql); let rows = [];
      if (sql.includes('import-executor:target')) rows = [{ database: target.database, role: target.role, server_address: target.serverAddress,
        server_port: target.serverPort, postmaster_started_at: target.postmasterStartedAt }];
      else if (sql.includes('accounting_guards_present')) rows = [{ accounting_guards_present: true }];
      else if (sql.includes('integrity_guards_present')) rows = [{ integrity_guards_present: true }];
      else if (sql.includes('array_agg(version')) rows = [{ versions: schema }];
      else if (sql.includes('FROM naijue_erp.operation_receipt')) rows = previous ? [previous] : [];
      return { rows, rowCount: 1 };
    }, release(error) { releases.push(error); } };
  } };
  const options = { pool, binding: plan(), now: () => cutoffTime, authorization: {
    async assertExecutionAllowed() { auth.push('EXECUTION'); if (reject) throw Object.assign(Error('private refusal detail'), { code: 'SOURCE_REVOKED' }); },
    async authorizeStep(s) { auth.push('STEP'); if (mutate) s.payload.batchId = 'modified'; },
    async assertAllowed() { auth.push('MAIN'); }, async authorizeNativeCommand() { auth.push('NATIVE'); }, async authorizeClosure() { auth.push('CLOSURE'); }
  } };
  return { options, calls, releases, auth, events, replay(result) { previous = { request_hash: requestHash(stage().payload), target_type: 'IMPORT',
    target_id: plan().batchId, action: 'IMPORT_STAGE', result_data: result }; } };
}
function source(steps, onClose = async () => {}) { return { async *steps() { yield* steps; }, close: onClose }; }

test('executor construction is inert; missing cutoff/authority/getter never connects or invokes getters', () => {
  const f = fixture(); createPostgresImportExecutor(f.options); assert.deepEqual(f.calls, []);
  assert.throws(() => createPostgresImportExecutor({ ...f.options, binding: { ...plan(), cutoffAt: '' } }), { code: 'IMPORT_EXECUTION_CUTOFF_REQUIRED' });
  assert.throws(() => createPostgresImportExecutor({ ...f.options, authorization: {} }), { code: 'IMPORT_EXECUTION_SHAPE' });
  let gets = 0; const b = Object.defineProperty(plan(), 'cutoffAt', { enumerable: true, get() { gets++; return cutoffTime; } });
  assert.throws(() => createPostgresImportExecutor({ ...f.options, binding: b })); assert.equal(gets, 0); assert.deepEqual(f.calls, []);
});
test('revocation and captured-step mutation reject before any target connection', async () => {
  for (const settings of [{ reject: true }, { mutate: true }]) {
    const f = fixture(settings); await assert.rejects(createPostgresImportExecutor(f.options)(stage())); assert.deepEqual(f.calls, []);
  }
});
test('batch/selection/namespace and legacy unaccounted MAIN reject before authority or SQL', async () => {
  for (const step of [{ ...stage(), kind: 'UNKNOWN' }, { ...stage(), payload: { ...stage().payload, batchId: 'wrong' } },
    { ...stage(), payload: { ...stage().payload, cutoffAt: '2026-10-21T00:00:00Z' } },
    { kind: 'MAIN', payload: { batchId: plan().batchId, actorAccountId: plan().actorAccountId, action: 'IMPORT_CHUNK' } },
    { kind: 'HEADER', payload: { batchId: plan().batchId, fixedSourceNamespace: 'wrong', selection: { selectionSha256: sha('a') } } }]) {
    const f = fixture(); await assert.rejects(createPostgresImportExecutor(f.options)(step)); assert.deepEqual(f.calls, []); assert.deepEqual(f.auth, []);
  }
});
test('wrong actual target or unreviewed schema rejects before any mutation', async () => {
  for (const settings of [{ target: { ...plan().target, database: 'other_database' } }, { schema: Array.from({ length: 20 }, (_, i) => i + 1) }]) {
    const f = fixture(settings); await assert.rejects(createPostgresImportExecutor(f.options)(stage()));
    assert.equal(f.calls.at(-1), 'ROLLBACK'); assert.ok(!f.calls.some(q => /^(INSERT|UPDATE|DELETE)/.test(q)));
    assert.deepEqual(f.releases, [undefined]);
  }
});
test('actual executor reaches existing MAIN store; same-key replay remains authorized and writes nothing twice', async () => {
  const f = fixture(), execute = createPostgresImportExecutor(f.options), result = await execute(stage());
  assert.equal(result.status, 'STAGED'); assert.equal(result.cursor, 0);
  assert.ok(f.calls.some(q => q.startsWith('INSERT INTO naijue_erp.import_batch')));
  assert.ok(f.calls.some(q => q.startsWith('INSERT INTO naijue_erp.operation_receipt')));
  const before = f.calls.length; f.replay(result); assert.deepEqual(await execute(stage()), result);
  assert.ok(f.calls.slice(before).every(q => !/^(INSERT|UPDATE|DELETE)/.test(q)));
  assert.deepEqual(f.auth, ['EXECUTION', 'STEP', 'MAIN', 'EXECUTION', 'STEP', 'MAIN']);
  assert.equal(f.calls.filter(q => q.includes('import-executor:target')).length, 1);
});
test('bounded sequence journals technical results only; awaits close and does not label full import', async () => {
  const events = []; let closed = false;
  const result = await runImportSteps({ source: source([stage()], async () => { await Promise.resolve(); closed = true; }),
    execute: async () => ({ status: 'STAGED', sequence: 0, cursor: 0, privateSource: 'MUST_NOT_LOG' }), append: async x => events.push(x),
    signal: new AbortController().signal, maxSteps: 1 });
  assert.equal(result.status, 'REQUESTED_STEP_SEQUENCE_COMPLETE'); assert.equal(result.publicationReadback, 'NOT_PERFORMED_BY_RUNNER');
  assert.equal(result.completed, 1); assert.equal(closed, true); assert.deepEqual(events.map(x => x.state), ['ATTEMPTING', 'COMMITTED']);
  assert.ok(!JSON.stringify(events).includes('MUST_NOT_LOG') && !JSON.stringify(events).includes('historyMetadata'));
});
test('failed/unknown store outcome stops once, preserves failure and closes source', async () => {
  let calls = 0, closed = 0; const events = [], failure = Object.assign(Error('private SQL path and source'), { code: 'COMMIT_UNCERTAIN' });
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; throw failure; },
    append: async x => events.push(x), signal: new AbortController().signal, maxSteps: 2 }), e => e === failure);
  assert.equal(calls, 1); assert.equal(closed, 1); assert.deepEqual(events.map(x => x.state), ['ATTEMPTING', 'FAILED_OUTCOME_UNVERIFIED']);
  assert.equal(events[1].code, 'COMMIT_UNCERTAIN'); assert.ok(!JSON.stringify(events).includes('private'));
});
test('journal failure before execute does no SQL; step limit/abort never execute extra operation', async () => {
  let calls = 0, closed = 0; const controller = new AbortController(); controller.abort();
  for (const options of [{ append: async () => { throw Error('journal unavailable'); }, signal: new AbortController().signal, maxSteps: 2 },
    { append: async () => {}, signal: controller.signal, maxSteps: 2 }]) {
    await assert.rejects(runImportSteps({ source: source([stage()], async () => { closed++; }), execute: async () => { calls++; return {}; }, ...options }));
  }
  assert.equal(calls, 0); assert.equal(closed, 2);
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; return {}; },
    append: async () => {}, signal: new AbortController().signal, maxSteps: 1 }), { code: 'IMPORT_EXECUTION_STEP_LIMIT' });
  assert.equal(calls, 1); assert.equal(closed, 3);
});
test('journal failure after actual result never retries a possibly committed step', async () => {
  let calls = 0, closed = 0;
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; return { status: 'STAGED' }; },
    append: async event => { if (event.state === 'COMMITTED') throw Error('journal disk full'); }, signal: new AbortController().signal, maxSteps: 2 }), /journal disk full/);
  assert.equal(calls, 1); assert.equal(closed, 1);
});
test('primary and source-close errors both remain visible; no raw error text goes to failure journal', async () => {
  const events = [];
  await assert.rejects(runImportSteps({ source: source([stage()], async () => { throw Error('close'); }), execute: async () => { throw Error('private source'); },
    append: async e => events.push(e), signal: new AbortController().signal, maxSteps: 1 }), e => e instanceof AggregateError && e.errors.length === 2);
  assert.equal(events.at(-1).code, 'IMPORT_EXECUTION_FAILED'); assert.ok(!JSON.stringify(events).includes('private source'));
});
test('CLI with no explicit registered host/cutoff fails without a network or source default', () => {
  const p = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(p.status, 1); assert.deepEqual(JSON.parse(p.stderr), { error: 'IMPORT_EXECUTION_USAGE' }); assert.equal(p.stdout, '');
});
