/** PURE contracts only. No real context/issuer/CREATE/PG/EXPLAIN fabricated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildScaledReferenceFixture } from './scaled-fixture.mjs';
import { buildReferenceFixture } from './fixture.mjs';
import { assertScaledPages } from './scaled-current-runtime-business.mjs';
import { scaledSamplingQueries, assertScaledSamplingPage, assertScaledTriggeredProofs, runScaledSnapshotAdmissionSampling, SCALED_SAMPLING_STATUS } from './scaled-snapshot-admission-sampling.mjs';
import { verifyOriginalStockReadinessBridge, createFiniteSamplingObserver, finiteSnapshotFailureDisposition, awaitFiniteSnapshotCommit,
  assertFiniteSnapshotObservation } from './current-runtime-snapshot-admission-sampling.mjs';
import { stockReadiness, matched, listValues } from './original-stock-readiness-bridge.ts';
const f = buildScaledReferenceFixture(), p = f.sourcePlan, n = p.native;
const clone = structuredClone;
const rows = n.expectedProducts.map(x => { const native = x.id === n.ids.product, original = p.retainedProducts.find(v => v.id === x.id);
  return { id: x.id, code: x.code, name: native ? n.product.values.name : original.name, categoryLabel: 'SYNTHETIC CATEGORY',
    year: native ? 2026 : null, seasonLabel: native ? f.season.name : null, supplierLabel: native ? n.supplier.name : null,
    fits: x.id === f.reference.disabledProductId ? [] : [{ id: f.reference.fitId, label: 'SYNTHETIC FIT' }], thickness: null, retailPrice: x.price, totalStock: x.stock }; });
const pages = assertScaledPages(f, { page1: { page: 1, pageSize: 100, exactTotal: 101, items: rows.slice(0, 100) },
  page2: { page: 2, pageSize: 100, exactTotal: 101, items: rows.slice(100) },
  narrow: { page: 1, pageSize: 100, exactTotal: 1, items: [rows.find(x => x.id === f.reference.productId)] } });
const data = { fixture: f, plan: p, result: { pages } };

test('fixed3 scenarios each first+repeat2 retain global101 page100+1 and genuinely narrow retained source, no warm/cold claim', () => {
  const q = scaledSamplingQueries(f); assert.deepEqual(q.map(x => x.label), ['page1', 'page2', 'narrow']);
  assert.equal(q[0].parameters.page, 1); assert.equal(q[1].parameters.page, 2); assert.equal(q[1].parameters.pageSize, 100);
  assert.ok(Object.values(q[0].parameters.filter).every(x => x.length === 0));
  assert.deepEqual(q[2].parameters.filter.productIds, [f.reference.productId]);
  assert.equal(q.length * 3, 9); assert.throws(() => scaledSamplingQueries(buildReferenceFixture()), /ORIGINAL_SCALED_303_FIXTURE_REQUIRED/);
  assert.equal(SCALED_SAMPLING_STATUS, 'PASS_SCALED_SNAPSHOT_ADMISSION_ONLY_NOT_OPT02_ACCEPTANCE');
});

test('each baseline compares fullDTO with independently verified original business pages, repeated field/order/unknown drift refuses', () => {
  for (const label of ['page1', 'page2', 'narrow']) {
    assert.deepEqual(assertScaledSamplingPage(pages[label], label, data), pages[label]);
    assert.deepEqual(assertScaledSamplingPage(clone(pages[label]), label, data, pages[label]), pages[label]);
    for (const mutate of [x => x.items[0].totalStock = null, x => x.items[0].name = 'DRIFT', x => x.items[0].retailPrice = '0.00',
      x => x.exactTotal--, x => x.items.pop(), x => x.items[0].fits = [], x => x.page = 3]) {
      const bad = clone(pages[label]); mutate(bad); assert.throws(() => assertScaledSamplingPage(bad, label, data));
    }
  }
  const bad = clone(pages.page1); bad.items.reverse(); assert.throws(() => assertScaledSamplingPage(bad, 'page1', data));
  assert.throws(() => assertScaledSamplingPage(pages.page1, 'unknown', data));
});

test('whole-scope proof must qualify101newSKU despite native root off page1; neither1 nor100/duplicate/missing/WH coverage counted as success', () => {
  assert.doesNotThrow(() => assertScaledTriggeredProofs([{ branch: 'skus', rows: [{ identity_count: '101', first_issue: null }] }]));
  for (const proofs of [[], [{ branch: 'warehouses', rows: [{ identity_count: '101', first_issue: null }] }],
    [{ branch: 'skus', rows: [{ identity_count: '1', first_issue: null }] }], [{ branch: 'skus', rows: [{ identity_count: '100', first_issue: null }] }],
    [{ branch: 'skus', rows: [{ identity_count: '101', first_issue: 'NOT_READY' }] }], [{ branch: 'skus', rows: [] }],
    [{ branch: 'skus', rows: [{ identity_count: '101', first_issue: null }] }, { branch: 'skus', rows: [{ identity_count: '101', first_issue: null }] }]]) assert.throws(() => assertScaledTriggeredProofs(proofs));
});

test('actual original bridge uses all-empty-filter matched scope/binds not page1 IDs; original error stops before any candidate (mock only)', async () => {
  const q = scaledSamplingQueries(f)[0].parameters, values = listValues({ kind: 'all', totalStock: 'all-warehouses' }, q), calls = [];
  const query = async (sql, bindings = []) => { calls.push({ sql, bindings });
    if (sql.startsWith('/* product-management:publication */')) return { rows: [{ id: f.batchId, completed: true, final_approval: true, checkpoint: f.checkpoints.at(-1) }] };
    if (sql.startsWith('/* product-management:stock-coverage */')) return { rows: [{ uncovered_warehouse: false, uncovered_sku: true, invalid_size: false, missing_sizes: false, invalid_balance: false }] };
    if (sql.startsWith('/* product-management:stock-warehouse-witness */')) return { rows: [{ id: f.warehouses[0].id }] };
    if (sql.startsWith('/* product-management:stock-additional-sku-proof */')) return { rows: [{ identity_count: '101', first_issue: null }] };
    return { rows: [{ integrity_guards_present: true }] };
  };
  await stockReadiness(query, values, matched(true, true), {});
  assert.deepEqual(values, [true, [], [], [], [], [], [], [], [], []]); assert.equal(calls.length, 5);
  assert.deepEqual(calls.at(-1).bindings, [...values, f.batchId, f.warehouses[0].id]);
  const sources = verifyOriginalStockReadinessBridge().sources;
  assert.equal(calls.at(-1).sql, sources.originalSku.replace('${matchedSql}', matched(true, true)));
  const failure = Object.assign(Error('db'), { code: '42501' }); let failedCalls = 0;
  await assert.rejects(stockReadiness(async () => { failedCalls++; throw failure; }, values, matched(true, true), {}), error => error === failure);
  assert.equal(failedCalls, 1);
});

test('old/serialized/fake scaled context cannot touch metrics/pool/budget or be restored as newauthority', async () => {
  let touched = 0;
  for (const context of [{}, { format: 'RAM_ONLY_VERIFIED_FINITE_BUSINESS_CONTEXT_V1' }, { format: 'RAM_ONLY_VERIFIED_SCALED_BUSINESS_CONTEXT_V1' }, { issuer: { pool: { connect() { touched++; } } } }]) {
    await assert.rejects(runScaledSnapshotAdmissionSampling({ context, metrics: { sampleService() { touched++; } },
      budget: { remaining() { touched++; } }, signal: new AbortController().signal }), /ORIGINAL_VERIFIED_SCALED_BUSINESS_CONTEXT_REQUIRED/);
  }
  assert.equal(touched, 0);
});

test('scaled source imports original helper boundaries/COMMIT promise; SQL/EXPLAIN cannot be externally injected or mislabeled as candidate service time', () => {
  const source = readFileSync(new URL('./scaled-snapshot-admission-sampling.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("from './current-runtime-snapshot-admission-sampling.mjs'"));
  assert.ok(source.includes('await awaitFiniteSnapshotCommit(client.query(\'COMMIT\'))'));
  assert.ok(source.includes("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "));
  assert.ok(source.includes('parseProductManagementListQuery(plan.native.queries[0])'));
  assert.equal(source.includes('plan.query'), false); assert.equal(source.includes('currentRuntimeBusinessContextData(args.context)'), false);
  assert.ok(source.includes('CURRENT_EXACT339_ONLY_PRODUCTION_CROSS_PERMISSION_EQUIVALENCE_UNPROVEN'));
});

test('reused read-only snapshot/cancel/logger/unknownACK helpers retain exact primary error and no retry', async () => {
  const original = Error('unknownACK'), pending = Promise.reject(original);
  await assert.rejects(awaitFiniteSnapshotCommit(pending), error => error === original);
  assert.equal(finiteSnapshotFailureDisposition({ committing: true, aborted: true, began: true }), 'DISCARD_ORIGINAL');
  const observer = createFiniteSamplingObserver(() => { throw Error('disk'); }, () => {});
  await assert.rejects(observer.run('PLAN', 'separate-phase:scaled', async () => { throw original; }), error => error.cause === original && error.errors[0] === original);
  const row = { isolation: 'repeatable read', read_only: 'on', snapshot: '827:827:', current_role: 'runtime', session_role: 'runtime', database_owner: false, ordinary_login: true };
  assert.doesNotThrow(() => assertFiniteSnapshotObservation([row], row));
  assert.throws(() => assertFiniteSnapshotObservation([{ ...row, snapshot: '828:828:' }], row));
});
