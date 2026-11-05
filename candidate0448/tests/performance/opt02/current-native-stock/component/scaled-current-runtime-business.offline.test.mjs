/** Source/typed input/assertion contracts ONLY, not real issuer/CREATE/PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildScaledReferenceFixture } from './scaled-fixture.mjs';
import { buildReferenceFixture } from './fixture.mjs';
import { scaledBusinessQueries, assertScaledProductEvidence, assertScaledPages, assertScaledIdentityAndZeroEvidence,
  scaledCurrentRuntimeBusinessContextData, runScaledCurrentRuntimeBusinessWithContext, SCALED_BUSINESS_STATUS, BUSINESS_PURPOSES } from './scaled-current-runtime-business.mjs';
const f = buildScaledReferenceFixture(), p = f.sourcePlan, n = p.native;
const clone = structuredClone;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function productObservation() {
  const product = { operationId: n.ids.productOperation, kind: 'PRODUCT', targetId: n.ids.product, version: 1 };
  return { product, receipt: { action: 'CREATE', status: 'COMMITTED', requestKey: n.product.requestKey, completedAt: '2026-11-01T00:00:00Z', result: clone(product) },
    supplier: { partyId: n.ids.supplier }, detail: { productId: n.ids.product, version: 1, deletedAt: null, values: clone(n.product.values),
      skus: n.allocations.map((a, i) => ({ ...n.product.skus[i], id: a.skuId, expectedVersion: 1 })).sort(byId),
      barcodes: n.allocations.map(a => ({ id: a.barcodeId, barcode: a.predictedMainBarcode, colorId: a.colorId, fitId: a.fitId, sizeId: a.sizeId,
        kind: 'MAIN', schemeId: f.scheme.id, enabled: true })).sort(byId),
      references: { supplier: { id: n.ids.supplier, name: n.supplier.name, enabled: true }, seasons: [{ id: f.season.id, name: f.season.name }] } } };
}
function pageObservation() {
  const rows = n.expectedProducts.map(x => { const native = x.id === n.ids.product, retained = p.retainedProducts.find(v => v.id === x.id);
    return { id: x.id, code: x.code, name: native ? n.product.values.name : retained.name, categoryLabel: 'SYNTHETIC CATEGORY',
      year: native ? 2026 : null, seasonLabel: native ? f.season.name : null, supplierLabel: native ? n.supplier.name : null,
      fits: x.id === f.reference.disabledProductId ? [] : [{ id: f.reference.fitId, label: 'SYNTHETIC FIT' }], thickness: null,
      retailPrice: x.price, totalStock: x.stock }; });
  return { page1: { page: 1, pageSize: 100, exactTotal: 101, items: rows.slice(0, 100) },
    page2: { page: 2, pageSize: 100, exactTotal: 101, items: rows.slice(100) },
    narrow: { page: 1, pageSize: 100, exactTotal: 1, items: [rows.find(x => x.id === f.reference.productId)] } };
}
function evidenceObservation() {
  return { identities: [...p.retainedSkus, ...n.allocations.map((a, i) => ({ id: a.skuId, product_id: n.ids.product,
    color_id: a.colorId, fit_id: a.fitId, size_id: a.sizeId, sku_code: n.product.skus[i].skuCode, enabled: true, version: 1, created_operation_id: n.ids.productOperation }))].sort(byId),
    admissions: n.plannedNewAdmissions.map(a => ({ warehouseId: a.warehouseId, skuId: a.skuId, admitted: true, publishedBatchId: f.batchId,
      warehouseBasis: 'CUTOFF_MEMBER', skuBasis: 'POST_CUTOFF_CREATED', warehouseCreatedOperationId: null, skuCreatedOperationId: n.ids.productOperation })),
    stored: n.allocations.map(a => ({ id: a.skuId, product_id: n.ids.product, created_operation_id: n.ids.productOperation,
      cutoff_member: false, balance_rows: '0', creation_operation_ledger_rows: '0' })).sort(byId) };
}

test('scaled workload means original oneCREATE101SKU, source100 and numbered100+1 with native last, no cap/filter reduction', () => {
  const q = scaledBusinessQueries(f); assert.equal(p.retainedProducts.length, 100); assert.equal(p.retainedSkus.length, 100);
  assert.equal(n.product.skus.length, 101); assert.equal(n.allocations.length, 101); assert.equal(n.expectedProducts.length, 101);
  assert.equal(q.page1.page, 1); assert.equal(q.page2.page, 2); assert.equal(q.page2.pageSize, 100);
  assert.ok(Object.values(q.page1.filter).every(x => x.length === 0)); assert.deepEqual(n.page2Ids, [n.ids.product]);
  assert.deepEqual(q.narrow.filter.productIds, [f.reference.productId]); assert.equal(n.plannedNewAdmissions.length, 202);
  assert.deepEqual(BUSINESS_PURPOSES, ['PRODUCT_MAINTENANCE', 'INVENTORY_ADMISSION', 'PRODUCT_SEASONS_READ']);
  assert.equal(SCALED_BUSINESS_STATUS, 'PASS_SCALED_CURRENT_RUNTIME_BUSINESS_ONLY_NOT_PERFORMANCE');
});

test('new fixture brand is not old105/shape/sourceplan; reject before any pool getter', async () => {
  for (const fixture of [buildReferenceFixture(), clone(f), p]) {
    assert.throws(() => scaledBusinessQueries(fixture), /ORIGINAL_SCALED_303_FIXTURE_REQUIRED/);
    let touched = 0; const pool = Object.defineProperty({}, 'connect', { get() { touched++; throw Error('NO'); } });
    await assert.rejects(runScaledCurrentRuntimeBusinessWithContext({ pool, fixture, reviewRef: { path: '/tmp/NEVER-REVIEW.json', sha256: 'a'.repeat(64) },
      budget: { remaining: () => 1200000 }, signal: new AbortController().signal }), /ORIGINAL_SCALED_303_FIXTURE_REQUIRED/);
    assert.equal(touched, 0);
  }
});

test('all101 detailSKU versions/axes and original101 MAIN/receipt exactfields are asserted, never RETURNED→COMMITTED', () => {
  const o = productObservation(); assert.doesNotThrow(() => assertScaledProductEvidence(f, o.product, o.receipt, o.detail, o.supplier));
  for (const mutate of [x => x.receipt.status = 'RETURNED', x => x.receipt.action = 'EDIT', x => x.receipt.requestKey = 'wrong',
    x => x.receipt.completedAt = null, x => x.receipt.result.operationId = n.ids.supplierOperation,
    x => x.detail.values.prices.purchase_price = '0.00', x => x.detail.deletedAt = '2026-11-01',
    x => x.detail.skus.pop(), x => x.detail.skus[100].id = x.detail.skus[0].id,
    x => x.detail.skus[0].expectedVersion = null, x => x.detail.skus[0].sizeId = f.reference.sizes[22].id,
    x => x.detail.skus.reverse(), x => x.detail.barcodes.pop(), x => x.detail.barcodes[0].barcode = 'guessed',
    x => x.detail.barcodes[0].sizeId = f.reference.sizes[22].id, x => x.detail.references.supplier.enabled = false,
    x => x.detail.references.seasons = []]) {
    const bad = clone(o); mutate(bad); assert.notDeepEqual(bad, o, 'Every mutation must really differ');
    assert.throws(() => assertScaledProductEvidence(f, bad.product, bad.receipt, bad.detail, bad.supplier));
  }
});

test('full101 product pages preserve every field/order, original16/5, remaining lawful0 and disabled/noSKU', () => {
  const pages = pageObservation(); assert.doesNotThrow(() => assertScaledPages(f, pages));
  assert.equal(pages.page1.items.length, 100); assert.equal(pages.page2.items.length, 1);
  assert.equal(pages.narrow.items[0].totalStock, '16');
  for (const mutate of [x => x.page1.items.reverse(), x => x.page2.items = [], x => x.page1.exactTotal = 100,
    x => x.page2.page = 1, x => x.page1.pageSize = 200, x => x.page2.items[0].totalStock = null,
    x => x.page2.items[0].retailPrice = '0.00', x => x.page1.items[50].name = 'drift',
    x => x.page1.items.find(v => v.id === f.reference.disabledProductId).fits = [{ id: f.reference.fitId, label: 'SYNTHETIC FIT' }],
    x => x.narrow.items[0].totalStock = '0', x => x.page1.items[0].id = x.page2.items[0].id]) {
    const bad = clone(pages); mutate(bad); assert.throws(() => assertScaledPages(f, bad));
  }
});

test('201 global identities +202admissions +101 zero diagnostics require exact originalsource/op/WH/SKU, unknown is not0', () => {
  const e = evidenceObservation(); assert.doesNotThrow(() => assertScaledIdentityAndZeroEvidence(f, e.identities, e.admissions, e.stored));
  for (const mutate of [x => x.identities.pop(), x => x.identities.push(x.identities[0]), x => x.identities[100].product_id = n.ids.supplier,
    x => x.identities[0].created_operation_id = n.ids.productOperation, x => x.admissions.pop(), x => x.admissions[201].admitted = false,
    x => x.admissions[0].skuBasis = 'CUTOFF_MEMBER', x => x.admissions[0].warehouseId = x.admissions[1].warehouseId,
    x => x.stored[100].balance_rows = null, x => x.stored[0].creation_operation_ledger_rows = '1', x => x.stored[0].cutoff_member = true,
    x => x.stored.reverse()]) {
    const bad = clone(e); mutate(bad); assert.notDeepEqual(bad, e, 'No no-op negative');
    assert.throws(() => assertScaledIdentityAndZeroEvidence(f, bad.identities, bad.admissions, bad.stored));
  }
});

test('fakepool/expired budget/abortedsignal fail closed; no injected issuer/service/SQL or context restoration', async () => {
  let touched = 0; const pool = Object.defineProperty({}, 'connect', { get() { touched++; throw Error('NO'); } });
  const input = { pool, fixture: f, reviewRef: { path: '/tmp/NEVER-REVIEW.json', sha256: 'a'.repeat(64) }, budget: { remaining: () => 1200000 }, signal: new AbortController().signal };
  await assert.rejects(runScaledCurrentRuntimeBusinessWithContext(input), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/); assert.equal(touched, 0);
  await assert.rejects(runScaledCurrentRuntimeBusinessWithContext({ ...input, issuer: {} }), /CLOSED_OWN_DATA_REQUIRED/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(runScaledCurrentRuntimeBusinessWithContext({ ...input, signal: abort.signal }), /SCALED_CURRENT_BUSINESS_ABORTED/);
  const expired = Error('originaldeadline'); await assert.rejects(runScaledCurrentRuntimeBusinessWithContext({ ...input, budget: { remaining() { throw expired; } } }), e => e === expired);
  for (const context of [{}, { format: 'RAM_ONLY_VERIFIED_SCALED_BUSINESS_CONTEXT_V1' }, { issuer: {} }]) assert.throws(() => scaledCurrentRuntimeBusinessContextData(context), /ORIGINAL_VERIFIED_SCALED_BUSINESS_CONTEXT_REQUIRED/);
  assert.equal(touched, 0);
});

test('new diagnostics direct15 SELECT cells fit genuine compiled339 vector; no tableGRANT or ledgerSKU read added', async () => {
  const { loadPairedSourcePlan } = await import('../reference-compiler-cohort-v2/source-cohort.mjs');
  const { compileFinitePolicy, cellKey } = await import('../reference-compiler-cohort-v2/universe.mjs');
  const { compileAliasFourReadPolicy } = await import('../reference-compiler-alias4-v1/alias4-policy.mjs');
  assert.equal(typeof process.env.NAIJUE_SOURCE_COHORT_ROOT, 'string');
  const { plan } = await loadPairedSourcePlan({ sourceRoot: process.env.NAIJUE_SOURCE_COHORT_ROOT });
  const material = new URL('../../../../../../development-results-20261031/current-runtime-feasibility-independent-review/', import.meta.url);
  const text = name => readFile(new URL(name, material), 'utf8');
  const base = await compileFinitePolicy(plan, { materialText: await text('PLANNED-CURRENT-ISSUER-CREATE-STOCK-ACL-v1.json'),
    addendumText: await text('SOURCE-CLOSURE-AND-LOCK-SELECTION-ADDENDUM-v1.json'), closureText: await text('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json'),
    universeText: await text('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json') });
  const policy = compileAliasFourReadPolicy(base, { addendumText: await readFile(new URL('../reference-compiler-alias4-v1/ALIAS4-SOURCE-ADDENDUM.json', import.meta.url), 'utf8'),
    maintenanceSourceText: await readFile(new URL('../../../../../adapters/postgres/src/product-maintenance-store.ts', import.meta.url), 'utf8'),
    schemaSourceText: await readFile(new URL('../../../../../adapters/postgres/migrations/0011_history_storage.sql', import.meta.url), 'utf8') });
  assert.equal(policy.runtimeCells.length, 4140); assert.equal(policy.directGrantCells.length, 339);
  const cells = new Map(policy.runtimeCells.map(c => [cellKey(c), c.allowed]));
  const key = (relation, column) => cellKey({ schema: 'naijue_erp', relation, objectKind: 'COLUMN', column, privilege: 'SELECT' });
  const needed = { sku: ['id', 'product_id', 'color_id', 'fit_id', 'size_id', 'sku_code', 'enabled', 'version', 'created_operation_id'],
    import_record: ['import_batch_id', 'status', 'target_type', 'target_id'], inventory_balance: ['sku_id'], inventory_ledger: ['operation_id'] };
  assert.equal(Object.values(needed).flat().length, 15);
  for (const [relation, columns] of Object.entries(needed)) for (const column of columns) assert.equal(cells.get(key(relation, column)), true, relation + '.' + column);
  assert.equal(cells.get(key('inventory_ledger', 'sku_id')), false, 'Creation-operation-only diagnostic never widens ledger read');
});
