/** New finite TEST workload: original Supplier CREATE + Product CREATE101SKU.
 * No PG/role/target/issuer/review can be injected or constructed on import.
 * Host still owns genuine pool, fixed339, metadata, physical fence and budget. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { freeze, need } from './fixture.mjs';
import { assertScaledFixture } from './scaled-fixture.mjs';
import { assertCurrentRuntimePool } from './current-runtime-host.mjs';
import { BUSINESS_PURPOSES, REQUIRED_OBSERVATION, createBusinessStageObserver } from './current-runtime-business.mjs';
import { createPlannedIdAllocator, assertExactScaledSourcePlan } from '../../scaled-retained-native-source/scaled-source.mjs';
import { awaitFiniteSnapshotCommit, finiteSnapshotFailureDisposition } from './current-runtime-snapshot-admission-sampling.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
import { createPartyMaintenanceService } from '../../../../../packages/application/src/party-maintenance-service.ts';
import { createSourcePartyAuthorization } from '../../../../../packages/application/src/party-maintenance-policy.ts';
import { createApprovedPartyCodeAllocator } from '../../../../../packages/application/src/party-numbering.ts';
import { createProductMaintenanceService } from '../../../../../packages/application/src/product-maintenance-service.ts';
import { createProductManagementQueryService } from '../../../../../packages/application/src/product-management-query-service.ts';
import { checkedProductManagementListPage, parseProductManagementListQuery } from '../../../../../packages/application/src/product-management-query-validation.ts';
import { createNativeRuntime26Issuer } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { sourceConfirmedReadIdentityOn } from '../../../../../adapters/postgres/src/source-confirmed-read-authorization.ts';
import { PostgresPartyUnitOfWork } from '../../../../../adapters/postgres/src/party-maintenance-store.ts';
import { PostgresMaintenanceCommandUnitOfWork, maintenanceContextClient } from '../../../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { PostgresProductMaintenanceUnitOfWork } from '../../../../../adapters/postgres/src/product-maintenance-store.ts';
import { PostgresProductManagementQueryReader } from '../../../../../adapters/postgres/src/product-management-query-reader.ts';
import { readInventoryKeyAdmissions } from '../../../../../adapters/postgres/src/inventory-key-admission-reader.ts';
import { createSourceConfirmedProductCapacityFactory, createSourceConfirmedApplicationReadAuthorization } from '../../../../../apps/api/src/postgres-read-api.ts';

export const SCALED_BUSINESS_STATUS = 'PASS_SCALED_CURRENT_RUNTIME_BUSINESS_ONLY_NOT_PERFORMANCE';
export { BUSINESS_PURPOSES };
const contexts = new WeakMap();
export function scaledCurrentRuntimeBusinessContextData(context) {
  need(contexts.has(context), 'ORIGINAL_VERIFIED_SCALED_BUSINESS_CONTEXT_REQUIRED'); return contexts.get(context);
}
const orderId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function scaledBusinessQueries(fixture) {
  const f = assertScaledFixture(fixture), plan = f.sourcePlan;
  return freeze({ page1: plan.native.queries[0], page2: plan.native.queries[1],
    narrow: parseProductManagementListQuery({ ...plan.native.queries[0], filter: { ...plan.native.queries[0].filter, productIds: [f.reference.productId] } }) });
}

/** Pure assertions only. Expected fields originate in pre-frozen source plan,
 * never acceptance-target observations. No mock row becomes a receipt/brand. */
export function assertScaledProductEvidence(fixture, product, receipt, detail, supplier) {
  const f = assertScaledFixture(fixture), n = f.sourcePlan.native;
  assert.deepEqual(product, { operationId: n.ids.productOperation, kind: 'PRODUCT', targetId: n.ids.product, version: 1 });
  assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.action, 'CREATE'); assert.equal(receipt.requestKey, n.product.requestKey);
  need(typeof receipt.completedAt === 'string' && Number.isFinite(Date.parse(receipt.completedAt)), 'ACTUAL_SCALED_COMMITTED_RECEIPT_TIME_REQUIRED');
  assert.deepEqual(receipt.result, product); assert.equal(detail.productId, n.ids.product); assert.equal(detail.version, 1);
  assert.deepEqual(detail.values, n.product.values);
  assert.equal(detail.skus.length, 101); assert.equal(detail.barcodes.length, 101);
  const skuExpected = n.allocations.map((a, i) => ({ ...n.product.skus[i], id: a.skuId, expectedVersion: 1 }));
  assert.deepEqual(detail.skus, skuExpected.sort(orderId), 'All101 saved SKU IDs/axes/codes/flags/version, original id order');
  assert.deepEqual(detail.barcodes, n.allocations.map(a => ({ id: a.barcodeId, barcode: a.predictedMainBarcode,
    colorId: a.colorId, fitId: a.fitId, sizeId: a.sizeId, kind: 'MAIN', schemeId: f.scheme.id, enabled: true })).sort(orderId), 'All101 original generated MAIN, no guessed/padded/duplicate binding');
  assert.deepEqual(detail.references.supplier, { id: n.ids.supplier, name: n.supplier.name, enabled: true });
  assert.equal(supplier.partyId, n.ids.supplier); assert.equal(detail.deletedAt, null);
  assert.deepEqual(detail.references.seasons, [{ id: f.season.id, name: f.season.name }]);
}

export function assertScaledPages(fixture, pages) {
  const f = assertScaledFixture(fixture), p = f.sourcePlan, expected = p.native.expectedProducts;
  const first = checkedProductManagementListPage(pages.page1), second = checkedProductManagementListPage(pages.page2), narrow = checkedProductManagementListPage(pages.narrow);
  assert.equal(first.page, 1); assert.equal(second.page, 2); assert.equal(narrow.page, 1);
  for (const page of [first, second, narrow]) assert.equal(page.pageSize, 100);
  assert.equal(first.exactTotal, 101); assert.equal(second.exactTotal, 101); assert.equal(narrow.exactTotal, 1);
  assert.deepEqual(first.items.map(x => x.id), p.native.page1Ids); assert.deepEqual(second.items.map(x => x.id), p.native.page2Ids);
  assert.deepEqual(second.items.map(x => x.id), [p.native.ids.product], 'Native101SKU root must genuinely occupy nonempty page2, not be omitted by a cap');
  const all = [...first.items, ...second.items];
  assert.deepEqual(all.map(x => ({ id: x.id, code: x.code, stock: x.totalStock, price: x.retailPrice })), expected.map(({ id, code, stock, price }) => ({ id, code, stock, price })));
  for (const row of all) {
    const native = row.id === p.native.ids.product, original = p.retainedProducts.find(x => x.id === row.id);
    assert.equal(row.name, native ? p.native.product.values.name : original.name);
    assert.equal(row.categoryLabel, 'SYNTHETIC CATEGORY'); assert.equal(row.year, native ? 2026 : null);
    assert.equal(row.seasonLabel, native ? f.season.name : null); assert.equal(row.supplierLabel, native ? p.native.supplier.name : null);
    assert.equal(row.thickness, null);
    assert.deepEqual(row.fits, row.id === f.reference.disabledProductId ? [] : [{ id: f.reference.fitId, label: 'SYNTHETIC FIT' }]);
    need(row.totalStock !== null, 'SCALED_UNKNOWN_STOCK_NOT_ZERO');
  }
  assert.deepEqual(narrow.items, [all.find(x => x.id === f.reference.productId)]);
  assert.equal(narrow.items[0].totalStock, '16');
  return freeze({ page1: first, page2: second, narrow });
}

export function assertScaledIdentityAndZeroEvidence(fixture, identities, admissions, stored) {
  const f = assertScaledFixture(fixture), p = f.sourcePlan, n = p.native;
  const expected = [...p.retainedSkus, ...n.allocations.map((a, i) => ({ id: a.skuId, product_id: n.ids.product,
    color_id: a.colorId, fit_id: a.fitId, size_id: a.sizeId, sku_code: n.product.skus[i].skuCode,
    enabled: true, version: 1, created_operation_id: n.ids.productOperation }))].sort(orderId);
  assert.equal(identities.length, 201); assert.deepEqual(identities, expected, 'Whole201 SKU identity/source/axis/version set, not native subset/count only');
  assert.equal(admissions.length, 202); assert.equal(stored.length, 101);
  assert.deepEqual(stored, [...n.allocations].sort((a, b) => a.skuId < b.skuId ? -1 : 1).map(a => ({ id: a.skuId,
    product_id: n.ids.product, created_operation_id: n.ids.productOperation, cutoff_member: false, balance_rows: '0', creation_operation_ledger_rows: '0' })));
  assert.deepEqual(admissions, n.plannedNewAdmissions.map(a => ({ warehouseId: a.warehouseId, skuId: a.skuId,
    admitted: true, publishedBatchId: f.batchId, warehouseBasis: 'CUTOFF_MEMBER', skuBasis: 'POST_CUTOFF_CREATED',
    warehouseCreatedOperationId: null, skuCreatedOperationId: n.ids.productOperation })));
}

export async function runScaledCurrentRuntimeBusinessWithContext(input) {
  const { pool: rawPool, fixture: supplied, reviewRef, budget, signal, onStage } = captureData(input,
    ['pool', 'fixture', 'reviewRef', 'budget', 'signal', ...(Object.hasOwn(input ?? {}, 'onStage') ? ['onStage'] : [])]);
  const fixture = assertScaledFixture(supplied), plan = assertExactScaledSourcePlan(fixture.sourcePlan), n = plan.native;
  const ref = captureData(reviewRef, ['path', 'sha256']);
  need(typeof ref.path === 'string' && path.isAbsolute(ref.path) && path.resolve(ref.path) === ref.path && /^[a-f0-9]{64}$/.test(ref.sha256), 'PINNED_CANONICAL_INDEPENDENT_REVIEW_REFERENCE_REQUIRED');
  need(typeof budget?.remaining === 'function' && typeof signal?.aborted === 'boolean' && typeof signal?.addEventListener === 'function', 'ORIGINAL_SCALED_BUDGET_AND_SIGNAL_REQUIRED');
  const active = () => { need(!signal.aborted, 'SCALED_CURRENT_BUSINESS_ABORTED'); budget.remaining(); };
  active(); assertCurrentRuntimePool(rawPool);
  const stages = createBusinessStageObserver(onStage, active); let issuer;
  await stages.call('ISSUER_CREATE', async () => { issuer = await createNativeRuntime26Issuer(rawPool,
    { reviewFile: ref.path, trustedReviewSha256: ref.sha256, requiredObservation: REQUIRED_OBSERVATION }); return { reviewSha256: ref.sha256, requiredObservation: REQUIRED_OBSERVATION }; });
  async function snapshot(work) {
    active(); const client = await issuer.pool.connect(); let began = false, committing = false, discard;
    try {
      active(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      await issuer.runtime26.assertReady(client, 'INVENTORY_ADMISSION'); active();
      const identity = await sourceConfirmedReadIdentityOn(client, plan.actor, signal); active();
      need(identity.role === 'ADMIN' && identity.hallId === plan.actor.hallId, 'ACTUAL_SCALED_ADMIN_AND_HALL_REQUIRED');
      const result = await work(client, identity); active(); committing = true;
      await awaitFiniteSnapshotCommit(client.query('COMMIT')); committing = false; began = false; active(); return result;
    } catch (original) {
      const action = finiteSnapshotFailureDisposition({ committing, aborted: signal.aborted, began });
      if (action === 'DISCARD_ORIGINAL' || action === 'DISCARD_CANCELLED') { discard = original instanceof Error ? original : Error('Scaled snapshot failed'); throw original; }
      try { await client.query('ROLLBACK'); } catch (rollback) { discard = rollback instanceof Error ? rollback : Error('Scaled rollback failed'); throw new AggregateError([original, rollback], 'SCALED_READ_AND_ROLLBACK_FAILED', { cause: original }); }
      throw original;
    } finally { client.release(discard); }
  }
  const identity = await stages.call('IDENTITY_AND_REQUIRED_PURPOSES', () => snapshot(async (client, current) => {
    for (const purpose of BUSINESS_PURPOSES) { await issuer.runtime26.assertReady(client, purpose); active(); } return current;
  }));
  const actor = Object.freeze({ ...plan.actor, role: identity.role });
  const supplierIds = createPlannedIdAllocator(plan, 'SUPPLIER'), productIds = createPlannedIdAllocator(plan, 'PRODUCT');
  const parties = new PostgresPartyUnitOfWork(issuer.pool, null), originalPartyTransaction = parties.transaction.bind(parties);
  parties.transaction = work => originalPartyTransaction(async tx => { active(); const result = await work(tx); active(); return result; });
  const suppliers = createPartyMaintenanceService({ unitOfWork: parties, authorization: createSourcePartyAuthorization(), codes: createApprovedPartyCodeAllocator(),
    now: () => new Date().toISOString(), newId: kind => supplierIds.next(kind) });
  const supplier = await stages.call('SUPPLIER_EXECUTE', () => suppliers.execute({ ...n.supplier, kind: 'SUPPLIER', actor })); active();
  assert.equal(supplier.kind, 'SUPPLIER'); assert.equal(supplier.partyId, n.ids.supplier); assert.equal(supplier.operationId, n.ids.supplierOperation);
  assert.equal(supplier.version, 1); assert.equal(supplier.enabled, true); assert.match(supplier.code, /^GYS\d{6,}$/);
  assert.ok(Object.values(supplierIds.remaining()).every(x => x === 0));
  const supplierReceipt = await stages.call('SUPPLIER_RECEIPT', () => suppliers.receipt(actor, 'SUPPLIER', n.supplier.requestKey)); active();
  assert.equal(supplierReceipt.status, 'COMMITTED'); assert.equal(supplierReceipt.action, 'CREATE'); assert.equal(supplierReceipt.requestKey, n.supplier.requestKey); assert.deepEqual(supplierReceipt.result, supplier);
  const driver = new PostgresMaintenanceCommandUnitOfWork(issuer.pool), transaction = driver.transaction.bind(driver);
  driver.transaction = work => transaction(async context => {
    active(); const client = maintenanceContextClient(context, issuer.pool);
    await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE'); await sourceConfirmedReadIdentityOn(client, actor, signal); active();
    const result = await work(context); active(); await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE'); active(); return result;
  });
  const products = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver,
    { deletionGuard: null, seasonCapability: issuer.productSeasonArray, capacity: createSourceConfirmedProductCapacityFactory(issuer.pool, issuer.runtime26) }),
    now: () => new Date().toISOString(), media: null, newId: kind => productIds.next(kind) });
  const product = await stages.call('PRODUCT_EXECUTE', () => products.executeV2(actor, n.product, signal)); active();
  assert.ok(Object.values(productIds.remaining()).every(x => x === 0));
  const productReceipt = await stages.call('PRODUCT_RECEIPT', () => products.receipt(actor, n.product.requestKey)); active();
  const detail = await stages.call('PRODUCT_DETAIL', () => products.detailV2(actor, { productId: n.ids.product })); active();
  assertScaledProductEvidence(fixture, product, productReceipt, detail, supplier);
  const lists = createProductManagementQueryService({ authorization: createSourceConfirmedApplicationReadAuthorization(issuer.pool).productManagement,
    reader: new PostgresProductManagementQueryReader(issuer.pool, issuer.catalogueRetainedDelete, issuer.productSeasonArray, issuer.runtime26) });
  const queries = scaledBusinessQueries(fixture);
  const pages = await stages.call('ALL_WAREHOUSE_STOCK_LIST', async () => {
    const pages = {}; for (const [key, query] of Object.entries(queries)) { active(); pages[key] = await lists.readList(actor, query, signal); active(); }
    return assertScaledPages(fixture, pages);
  });
  const evidence = await stages.call('NEW_SKU_ADMISSION_AND_STORED_ZERO', () => snapshot(async client => {
    const identities = (await client.query(`/* scaled-business:all201-identities */ SELECT id,product_id,color_id,fit_id,size_id,sku_code,enabled,version,created_operation_id FROM naijue_erp.sku ORDER BY id`)).rows; active();
    const admissions = await readInventoryKeyAdmissions(client, n.plannedNewAdmissions.map(({ warehouseId, skuId }) => ({ warehouseId, skuId }))); active();
    const stored = (await client.query(`/* scaled-business:101-lawful-zero */ SELECT s.id,s.product_id,s.created_operation_id,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$2::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id) AS cutoff_member,
      (SELECT count(*)::text FROM naijue_erp.inventory_balance b WHERE b.sku_id=s.id) AS balance_rows,
      (SELECT count(*)::text FROM naijue_erp.inventory_ledger l WHERE l.operation_id=$3::uuid) AS creation_operation_ledger_rows
      FROM naijue_erp.sku s WHERE s.id=ANY($1::uuid[]) ORDER BY s.id`, [n.allocations.map(a => a.skuId), fixture.batchId, n.ids.productOperation])).rows; active();
    assertScaledIdentityAndZeroEvidence(fixture, identities, admissions, stored); return { identities, admissions, stored };
  }));
  active(); const result = freeze({ format: 'SCALED_CURRENT_RUNTIME_BUSINESS_RESULT_V1', status: SCALED_BUSINESS_STATUS,
    sourceManifestSha256: fixture.artifacts.at(-1).sha256, commandInputSha256: n.commandInputHash, reviewSha256: ref.sha256,
    actualIdentity: { accountId: actor.accountId, hallId: actor.hallId, role: actor.role }, requiredPurposes: BUSINESS_PURPOSES,
    supplierReceipt, productReceipt, productDetail: detail, pages, evidence,
    expectedCounts: plan.expectedCounts, performanceAcceptance: false, creationOperationLedgerOnly: true,
    limitations: ['One native product101SKU after100 retained reference products, not101 separate CREATE commands.',
      'Only current exact339 synthetic role; no warehouse creation/history/write-page performance acceptance.',
      'Ledger diagnostic covers only this actual Product CREATE operation, not all SKU ledger. No timeout/grant extension.'] });
  const context = Object.freeze({ format: 'RAM_ONLY_VERIFIED_SCALED_BUSINESS_CONTEXT_V1' });
  contexts.set(context, Object.freeze({ issuer, actor, fixture, plan, result })); return Object.freeze({ result, context });
}
