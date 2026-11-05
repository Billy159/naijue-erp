/** Pure contracts only: no target, PG client, issuer, metadata approval or timer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyOriginalStockReadinessBridge, finiteSamplingQueries, assertFiniteSamplingPage,
  assertFiniteAdmissionRowsEqual, assertFiniteSnapshotObservation, finiteSnapshotFailureDisposition, awaitFiniteSnapshotCommit,
  createFiniteSamplingObserver, runFiniteSnapshotAdmissionSampling, SAMPLING_STATUS } from './current-runtime-snapshot-admission-sampling.mjs';
import { stockReadiness, stockAdditionEvidence, matched, listValues } from './original-stock-readiness-bridge.ts';
import { buildReferenceFixture } from './fixture.mjs';
import { createCurrentRuntimeBusinessPlan } from './current-runtime-business.mjs';
import { createCurrentRuntimeQueryMetrics } from './current-runtime-query-metrics.mjs';
import { prototypeStatements } from '../../snapshot-admission-prototype/snapshot-admission.mjs';

const fixture = buildReferenceFixture(), plan = createCurrentRuntimeBusinessPlan(fixture);
const items = plan.expected.map(row => ({ id: row.id, code: row.code, name: 'SYNTHETIC ' + row.id,
  categoryLabel: 'SYNTHETIC CATEGORY', year: null, seasonLabel: row.id === plan.ids.product ? plan.seasonName : null,
  supplierLabel: row.id === plan.ids.product ? plan.supplierName : null,
  fits: [{ id: fixture.reference.fitId, label: 'SYNTHETIC FIT' }], thickness: null, retailPrice: row.price, totalStock: row.stock }));
const page = { page: 1, pageSize: 100, exactTotal: 3, items };
const data = { fixture, plan, result: { allWarehousePage: page, productReceipt: { result: { targetId: plan.ids.product } } } };
const disabled = { id: fixture.reference.disabledProductId, code: fixture.reference.expectedProductCode + '-DISABLED',
  name: 'SYNTHETIC PRODUCT-DISABLED', categoryLabel: 'SYNTHETIC CATEGORY', year: null, seasonLabel: null,
  supplierLabel: null, fits: [], thickness: null, retailPrice: '1.25', totalStock: '0' };
const all = { page: 1, pageSize: 100, exactTotal: 4, items: [...items, disabled].sort((a, b) => a.code < b.code ? -1 : 1) };
const clone = x => structuredClone(x);

test('complete bridge is original byte source except fixed imports and exactly4 exports; no loader or body edits', () => {
  const verified = verifyOriginalStockReadinessBridge();
  assert.equal(verified.proof.reader.sha256, '7021ca6733160465e726b55fde62bf164de780ccdb302ff92a589d1babf872d1');
  assert.equal(verified.proof.bridge.originalBodyParity, true);
  assert.deepEqual(verified.proof.bridge.privateExports, ['stockReadiness', 'stockAdditionEvidence', 'matched', 'listValues']);
  const source = readFileSync(new URL('./original-stock-readiness-bridge.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('from "../../../packages'), false);
  assert.equal(source.includes('from "../../../../../packages'), true);
});

test('fixed finite scope has3 narrow/4 all and page2 empty, full100 cap unchanged', () => {
  const queries = finiteSamplingQueries(fixture, plan);
  assert.deepEqual(queries.map(q => q.label), ['narrow', 'all', 'page2']);
  assert.deepEqual(queries[0].parameters, plan.query);
  assert.ok(Object.values(queries[1].parameters.filter).every(v => v.length === 0));
  assert.equal(queries[2].parameters.page, 2);
  assert.ok(queries.every(q => q.parameters.pageSize === 100));
  assert.throws(() => finiteSamplingQueries(clone(fixture), plan), /ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED/);
});

test('strict complete pages retain all original prices/fits/names/order and disabled noSKU zero', () => {
  assert.deepEqual(assertFiniteSamplingPage(page, 'narrow', data), page);
  assert.deepEqual(assertFiniteSamplingPage(all, 'all', data), all);
  assert.deepEqual(assertFiniteSamplingPage({ ...all, page: 2, items: [] }, 'page2', data), { ...all, page: 2, items: [] });
  assert.deepEqual(assertFiniteSamplingPage(clone(page), 'narrow', data, page), page);
});

test('unknown/missing/duplicate/reordered/rounded stock and lost full metadata never compare as success', () => {
  for (const change of [p => p.items[0].totalStock = null, p => delete p.items[0].totalStock,
    p => p.items[0].totalStock = 16, p => p.items[0].totalStock = '123', p => p.items[0].retailPrice = '1.2',
    p => p.items.reverse(), p => p.items[0].name = 'DRIFT', p => p.items[0].fits = [],
    p => p.items[1].id = p.items[0].id, p => p.exactTotal = 2]) {
    const changed = clone(page); change(changed); assert.throws(() => assertFiniteSamplingPage(changed, 'narrow', data));
  }
  const missingDisabled = clone(all); missingDisabled.items.pop();
  assert.throws(() => assertFiniteSamplingPage(missingDisabled, 'all', data));
  assert.throws(() => assertFiniteSamplingPage({ ...all, page: 2, items: [all.items[0]] }, 'page2', data));
});

test('sample callback sees detached frozen JSON; return cannot replace raw result', async () => {
  const events = [], original = { status: 'ACTUAL', rows: [{ value: '16' }] };
  const observer = createFiniteSamplingObserver(event => { events.push(event); return { status: 'FAKE' }; }, () => {});
  assert.equal(await observer.run('BASELINE', 'narrow:first', async () => original), original);
  original.rows[0].value = 'CHANGED';
  assert.equal(events[0].result.rows[0].value, '16'); assert.equal(events[0].sequence, 1);
  assert.equal(Object.isFrozen(events[0].result.rows[0]), true);
  assert.throws(() => events[0].result.rows.push({ value: '0' }));
});

test('sample callback omission leaves actual result; invalid phase/label never invokes work', async () => {
  const observer = createFiniteSamplingObserver(undefined, () => {}); let calls = 0;
  assert.equal(await observer.run('PLAN', 'separate-phase:finite', async () => 'raw'), 'raw');
  for (const [phase, label] of [['WRITE', 'finite'], ['PLAN', '../arbitrary']]) await assert.rejects(observer.run(phase, label, async () => calls++));
  assert.equal(calls, 0); assert.throws(() => createFiniteSamplingObserver({}, () => {}));
});

test('original SQL/service failure is exact primary, FAILED event is preserved, no retry', async () => {
  const events = [], failure = Object.assign(Error('original'), { code: '42501' }); let calls = 0;
  const observer = createFiniteSamplingObserver(e => events.push(e), () => {});
  await assert.rejects(observer.run('DIFFERENTIAL', 'same-snapshot:finite', async () => { calls++; throw failure; }), e => e === failure);
  assert.equal(calls, 1); assert.deepEqual(events[0].result, { status: 'FAILED', errorCode: '42501', diagnostic: null });
});

test('logger plus original error retains both causes; logger success cannot turn failure into pass', async () => {
  const original = Error('query'), logger = Error('disk');
  const observer = createFiniteSamplingObserver(() => { throw logger; }, () => {});
  await assert.rejects(observer.run('PLAN', 'separate-phase:finite', async () => { throw original; }), e =>
    e instanceof AggregateError && e.cause === original && e.errors[0] === original && e.errors[1] === logger);
  await assert.rejects(observer.run('BASELINE', 'all:first', async () => ({ status: 'RETURNED' })), e => e === logger);
});

test('cancellation before work sends nothing; late cancellation cannot make next sample run', async () => {
  let cancelled = false, calls = 0; const abort = Error('cancelled');
  const observer = createFiniteSamplingObserver(() => { cancelled = true; }, () => { if (cancelled) throw abort; });
  await assert.rejects(observer.run('BASELINE', 'narrow:first', async () => { calls++; return { status: 'RETURNED' }; }), e => e === abort);
  await assert.rejects(observer.run('BASELINE', 'narrow:repeat1', async () => calls++), e => e === abort);
  assert.equal(calls, 1);
});

test('late cancellation plus failed persistence preserves cancellation primary and both errors', async () => {
  const cancelled = Error('cancelled'), logger = Error('disk'); let late = false;
  const observer = createFiniteSamplingObserver(() => { late = true; throw logger; }, () => { if (late) throw cancelled; });
  await assert.rejects(observer.run('BASELINE', 'all:first', async () => ({ status: 'RETURNED' })), error =>
    error instanceof AggregateError && error.cause === cancelled && error.errors[0] === cancelled && error.errors[1] === logger);
});

test('fake/serialized/cross-kind context cannot touch any pool or fake metric method', async () => {
  let touched = 0;
  for (const context of [{}, { format: 'RAM_ONLY_VERIFIED_FINITE_BUSINESS_CONTEXT_V1' }, { issuer: { pool: { connect() { touched++; } } } }]) {
    await assert.rejects(runFiniteSnapshotAdmissionSampling({ context, metrics: { sampleService() { touched++; } },
      budget: { remaining() { touched++; } }, signal: new AbortController().signal }), /ORIGINAL_VERIFIED_FINITE_BUSINESS_CONTEXT_REQUIRED/);
  }
  assert.equal(touched, 0); assert.equal(SAMPLING_STATUS, 'PASS_FINITE_SNAPSHOT_ADMISSION_ONLY_NOT_OPT02_ACCEPTANCE');
});

function originalDouble({ coverage = {}, publication = true, firstIssue = null, queryError } = {}) {
  const calls = [];
  const query = async (sql, bindings = []) => {
    calls.push({ sql, bindings }); if (queryError) throw queryError;
    if (sql.startsWith('/* product-management:publication */')) return { rows: publication ? [{ id: fixture.batchId,
      checkpoint: fixture.checkpoints.at(-1), completed: true, final_approval: true }] : [] };
    if (sql.startsWith('/* product-management:stock-coverage */')) return { rows: [{ uncovered_warehouse: false, uncovered_sku: true,
      invalid_size: false, missing_sizes: false, invalid_balance: false, ...coverage }] };
    if (sql.startsWith('/* product-management:stock-warehouse-witness */')) return { rows: [{ id: fixture.warehouses[0].id }] };
    if (sql.startsWith('/* product-management:stock-additional-sku-proof */')) return { rows: [{ identity_count: '1', first_issue: firstIssue }] };
    return { rows: [{ integrity_guards_present: true }] };
  };
  return { calls, query };
}
const values = listValues({ kind: 'all', totalStock: 'all-warehouses' }, plan.query);
test('actual original helper bridge executes exact5 read calls once-publication and full SKU bindings (mock only)', async () => {
  const d = originalDouble(); await stockReadiness(d.query, values, matched(true, true), {});
  assert.equal(d.calls.length, 5); assert.equal(d.calls.filter(c => c.sql.startsWith('/* product-management:publication */')).length, 1);
  assert.deepEqual(d.calls.at(-1).bindings, [...values, fixture.batchId, fixture.warehouses[0].id]);
  const sources = verifyOriginalStockReadinessBridge().sources;
  assert.equal(d.calls.at(-1).sql, sources.originalSku.replace('${matchedSql}', matched(true, true)));
  const candidate = prototypeStatements(sources, { retainedDelete: true, seasonArray: true }).skus;
  assert.ok(candidate.includes('a.published_batch_id=$11::uuid'));
  assert.equal(candidate.includes('FROM naijue_erp.inventory_key_admission'), false);
});

test('actual original helper denial/SQL exception propagates before any candidate; pure outcome is not PG', async () => {
  for (const [options, code] of [[{ publication: false }, 'PRODUCT_MANAGEMENT_STOCK_NOT_READY'],
    [{ firstIssue: 'NOT_READY' }, 'PRODUCT_MANAGEMENT_STOCK_NOT_READY'], [{ firstIssue: 'INTEGRITY' }, 'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],
    [{ coverage: { invalid_size: true } }, 'PRODUCT_MANAGEMENT_INTEGRITY_FAILED']]) {
    const d = originalDouble(options); await assert.rejects(stockReadiness(d.query, values, matched(true, true), {}), e => e.code === code);
    assert.equal(d.calls.some(c => c.sql.includes('admission_decisions AS MATERIALIZED')), false);
  }
  const failure = Object.assign(Error('db'), { code: '42501' }), d = originalDouble({ queryError: failure });
  await assert.rejects(stockReadiness(d.query, values, matched(true, true), {}), e => e === failure); assert.equal(d.calls.length, 1);
});

test('empty and malformed original aggregate/NULL never become confirmed zero or equal success', () => {
  for (const rows of [[], [{ identity_count: '0', first_issue: null }], [{ identity_count: null, first_issue: null }],
    [{ identity_count: '1', first_issue: 'UNKNOWN' }], [{ identity_count: '1', first_issue: 'NOT_READY' }]]) assert.throws(() => stockAdditionEvidence(rows));
  assert.doesNotThrow(() => stockAdditionEvidence([{ identity_count: '1', first_issue: null }]));
});

test('actual differential assertion rejects unequal exact counts/extra fields/returned denial/empty/duplicate rows', () => {
  const original = [{ identity_count: '1', first_issue: null }];
  assert.doesNotThrow(() => assertFiniteAdmissionRowsEqual(original, clone(original)));
  for (const candidate of [[{ identity_count: '2', first_issue: null }], [{ identity_count: '1', first_issue: null, extra: true }],
    [{ identity_count: '1', first_issue: 'NOT_READY' }], [], [...original, ...original], [{ identity_count: '0', first_issue: null }]]) {
    assert.throws(() => assertFiniteAdmissionRowsEqual(original, candidate));
  }
});

test('genuine metrics requires host captured events; a callback returning rows is NOT a measurement', async () => {
  const metrics = createCurrentRuntimeQueryMetrics({ safeSourceTextValues: [] });
  let returned; assert.equal(await metrics.sampleService('narrow:first', async () => { returned = page; return page; }), undefined);
  assert.equal(returned, page); const measurement = metrics.takeSample();
  assert.equal(measurement.status, 'INVALID_SAMPLE'); assert.equal(measurement.queryCount, null);
  assert.ok(measurement.reasons.includes('NO_CAPTURED_RUNTIME_QUERY_IN_WINDOW'));
});

test('actual snapshot assertion requires RR/read-only/exact snapshot and same ordinary nonowner directLOGIN', () => {
  const row = { isolation: 'repeatable read', read_only: 'on', snapshot: '123:456:124,125', current_role: 'synthetic_runtime',
    session_role: 'synthetic_runtime', database_owner: false, ordinary_login: true };
  assert.deepEqual(assertFiniteSnapshotObservation([row]), row);
  assert.deepEqual(assertFiniteSnapshotObservation([clone(row)], row), row);
  assert.doesNotThrow(() => assertFiniteSnapshotObservation([{ ...row, snapshot: '123:456:' }]));
  for (const patch of [{ isolation: 'read committed' }, { read_only: 'off' }, { snapshot: null }, { snapshot: '' },
    { current_role: 'owner' }, { session_role: 'owner' }, { database_owner: true }, { ordinary_login: false }]) {
    assert.throws(() => assertFiniteSnapshotObservation([{ ...row, ...patch }]));
  }
  for (const patch of [{ snapshot: '124:456:125' }, { current_role: 'other_runtime', session_role: 'other_runtime' }]) {
    assert.throws(() => assertFiniteSnapshotObservation([{ ...row, ...patch }], row));
  }
  assert.throws(() => assertFiniteSnapshotObservation([])); assert.throws(() => assertFiniteSnapshotObservation([row, row]));
});

test('FAILED artifact persists consumed partial metrics while preserving original service error identity', async () => {
  const events = [], failure = Object.assign(Error('original'), { code: '42501' });
  const metrics = createCurrentRuntimeQueryMetrics({ safeSourceTextValues: [] });
  const observer = createFiniteSamplingObserver(e => events.push(e), () => {});
  await assert.rejects(observer.run('BASELINE', 'narrow:first', async recordFailure => {
    try { await metrics.sampleService('narrow:first', async () => { throw failure; }); }
    catch (original) { recordFailure({ measurement: metrics.takeSample() }); throw original; }
  }), e => e === failure);
  assert.equal(events[0].result.status, 'FAILED');
  assert.equal(events[0].result.diagnostic.measurement.status, 'INVALID_SAMPLE');
  assert.ok(events[0].result.diagnostic.measurement.reasons.includes('ORIGINAL_SERVICE_ERROR'));
  assert.equal(events[0].result.diagnostic.measurement.queryCount, null);
  assert.throws(() => metrics.takeSample(), /ONE_COMPLETED_SAMPLE_REQUIRED/);
});

test('unknown COMMIT error wins concurrent abort; disposition never adds ROLLBACK/retry SQL', async () => {
  const abort = new AbortController(), original = Object.assign(Error('COMMIT ACK unknown'), { code: 'TEST_UNKNOWN_COMMIT' });
  let rejectAck;
  const pending = new Promise((resolve, reject) => { rejectAck = reject; });
  const wait = awaitFiniteSnapshotCommit(pending); abort.abort(); rejectAck(original);
  await assert.rejects(wait, error => error === original);
  for (const began of [true, false]) for (const aborted of [true, false]) {
    assert.equal(finiteSnapshotFailureDisposition({ committing: true, aborted, began }), 'DISCARD_ORIGINAL');
  }
  assert.equal(finiteSnapshotFailureDisposition({ committing: false, aborted: true, began: true }), 'DISCARD_CANCELLED');
  assert.equal(finiteSnapshotFailureDisposition({ committing: false, aborted: true, began: false }), 'DISCARD_CANCELLED');
  assert.equal(finiteSnapshotFailureDisposition({ committing: false, aborted: false, began: true }), 'ROLLBACK_ORIGINAL');
  assert.equal(finiteSnapshotFailureDisposition({ committing: false, aborted: false, began: false }), 'DISCARD_ORIGINAL');
  assert.throws(() => finiteSnapshotFailureDisposition({ committing: 'true', aborted: true, began: true }));
});

test('known returned COMMIT ACK is not converted before actual settlement by an abort race', async () => {
  const abort = new AbortController(); let resolveAck, settled = false;
  const pending = new Promise(resolve => { resolveAck = resolve; });
  const wait = awaitFiniteSnapshotCommit(pending).then(value => { settled = true; return value; });
  abort.abort(); await Promise.resolve(); assert.equal(settled, false);
  const actual = { rows: [], rowCount: null }; resolveAck(actual); assert.equal(await wait, actual);
  // The actual snapshot then runs its original active() check. No new work is
  // allowed after cancellation, even though this ACK is now known rather than
  // replaced with a fabricated unknown outcome.
  assert.equal(abort.signal.aborted, true);
  assert.equal(finiteSnapshotFailureDisposition({ committing: false, aborted: true, began: false }), 'DISCARD_CANCELLED', 'Known ACK then cancel is not unknown COMMIT');
});
