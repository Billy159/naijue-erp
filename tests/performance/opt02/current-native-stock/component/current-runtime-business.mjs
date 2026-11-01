/** Finite TEST case, not a production endpoint or a performance optimization.
 * Importing this module creates no pool, connection, role, target or receipt.
 * The host owns direct LOGIN, physical/source fences, the global COMMIT gate,
 * deadline, independent review, and all close/stop responsibilities.
 * Offline validators below are not evidence that these services ran on PG. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { assertFixture, sourceUuid, freeze, need } from './fixture.mjs';
import { assertCurrentRuntimePool } from './current-runtime-host.mjs';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../../packages/application/src/catalogue-price-input.ts';
import { parsePartyCommand } from '../../../../../packages/application/src/party-maintenance-validation.ts';
import { parseProductMaintenanceCommandV2 } from '../../../../../packages/application/src/product-maintenance-validation.ts';
import { createPartyMaintenanceService } from '../../../../../packages/application/src/party-maintenance-service.ts';
import { createSourcePartyAuthorization } from '../../../../../packages/application/src/party-maintenance-policy.ts';
import { createApprovedPartyCodeAllocator } from '../../../../../packages/application/src/party-numbering.ts';
import { createProductMaintenanceService } from '../../../../../packages/application/src/product-maintenance-service.ts';
import { createProductManagementQueryService } from '../../../../../packages/application/src/product-management-query-service.ts';
import { createNativeRuntime26Issuer } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { sourceConfirmedReadIdentityOn } from '../../../../../adapters/postgres/src/source-confirmed-read-authorization.ts';
import { PostgresPartyUnitOfWork } from '../../../../../adapters/postgres/src/party-maintenance-store.ts';
import { PostgresMaintenanceCommandUnitOfWork, maintenanceContextClient } from '../../../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { PostgresProductMaintenanceUnitOfWork } from '../../../../../adapters/postgres/src/product-maintenance-store.ts';
import { PostgresProductManagementQueryReader } from '../../../../../adapters/postgres/src/product-management-query-reader.ts';
import { readInventoryKeyAdmissions } from '../../../../../adapters/postgres/src/inventory-key-admission-reader.ts';
import { createSourceConfirmedProductCapacityFactory, createSourceConfirmedApplicationReadAuthorization } from '../../../../../apps/api/src/postgres-read-api.ts';

export const BUSINESS_SCOPE = 'FINITE_ORIGINAL_SUPPLIER_PRODUCT_AND_ALL_WAREHOUSE_STOCK_NOT_PERFORMANCE';
export const REQUIRED_OBSERVATION = 'HISTORY_DRAFT_SEQUENCE_SYSTEM_ACL_V1';
export const BUSINESS_PURPOSES = Object.freeze(['PRODUCT_MAINTENANCE', 'INVENTORY_ADMISSION', 'PRODUCT_SEASONS_READ']);
const plans = new WeakSet();
const checkedPlan = plan => { need(plans.has(plan), 'ORIGINAL_FINITE_BUSINESS_PLAN_REQUIRED'); return plan; };

/** This predicts only synthetic command inputs/allocated IDs, NEVER SQL results,
 * current authority, receipt, code counter, or an issuer capability. */
export function createCurrentRuntimeBusinessPlan(input) {
  const fixture = assertFixture(input), r = fixture.reference;
  const id = label => sourceUuid('current-business:' + label);
  const ids = { supplier: id('supplier'), supplierOperation: id('supplier-operation'), supplierAudit: id('supplier-audit'),
    product: id('product'), productOperation: id('product-operation'), sku: id('sku'), barcode: id('barcode') };
  const actor = { ...r.actor }; // Source fixture has ADMIN/null-hall; runtime must independently read this.
  const supplier = { action: 'CREATE', requestKey: fixture.datasetId + ':CURRENT:SUPPLIER:CREATE', name: 'SYNTHETIC CURRENT SERVICE SUPPLIER' };
  const product = { action: 'CREATE', requestKey: fixture.datasetId + ':CURRENT:PRODUCT:CREATE',
    values: { productCode: 'CURRENT_' + fixture.datasetId, name: 'SYNTHETIC CURRENT SERVICE PRODUCT', categoryId: r.categoryId,
      supplierId: ids.supplier, seasonIds: [fixture.season.id], sizeGroupId: r.targetGroupId, year: 2026,
      systemItemCode: '7654321', thickness: null, collarPantsType: null, defaultBarcodeSchemeId: fixture.scheme.id,
      enabled: true, prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === 'retail_price' ? '19.99' : key === 'purchase_price' ? '7.25' : null])) },
    skus: [{ id: null, expectedVersion: null, skuCode: 'CURRENT-SKU-' + fixture.datasetId, colorId: r.colorId,
      fitId: r.fitId, sizeId: r.sizes[0].id, enabled: true }], barcodes: [] };
  // Real original parsers, not a parallel command schema or relaxed input.
  parsePartyCommand(supplier, { ...actor, role: 'ADMIN' }, 'SUPPLIER');
  parseProductMaintenanceCommandV2(product);
  const selected = [r.productId, fixture.alternateProduct.id, ids.product];
  const query = { page: 1, pageSize: 100, filter: { productIds: selected, categoryIds: [], years: [], seasonIds: [],
    supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] } };
  const expected = [{ id: r.productId, code: r.expectedProductCode, stock: '16', price: '1.25' },
    { id: fixture.alternateProduct.id, code: fixture.alternateProduct.code, stock: '5', price: '2.50' },
    { id: ids.product, code: product.values.productCode, stock: '0', price: '19.99' }].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1);
  const plan = freeze({ scope: BUSINESS_SCOPE, ids, actor, supplier, product, query, expected,
    warehouseIds: fixture.warehouses.map(w => w.id), batchId: fixture.batchId,
    supplierName: supplier.name, seasonName: fixture.season.name,
    sourceManifestSha256: fixture.artifacts.at(-1).sha256, commandInputSha256: requestHash({ supplier, product, query }),
    expectedMainBarcode: '5A7654321001900' });
  need(!fixture.skus.some(s => Object.values(ids).includes(s.id)) && new Set(Object.values(ids)).size === 7, 'NEW_FINITE_IDENTITIES_REQUIRED');
  plans.add(plan); return plan;
}

/** Assertion-only seam for offline negative cases; supplied rows do not become
 * admission/receipt brands and no SQL is sent. Runtime calls this AFTER reads. */
export function assertCurrentRuntimeStockEvidence(input, page, admissions, stored) {
  const plan = checkedPlan(input);
  assert.equal(page.page, 1); assert.equal(page.pageSize, 100); assert.equal(page.exactTotal, 3);
  assert.equal(page.items.length, 3);
  assert.deepEqual(page.items.map(row => ({ id: row.id, code: row.code, stock: row.totalStock, price: row.retailPrice })), plan.expected,
    'Exact original16/5 plus lawful new0; NULL/empty/duplicate/reordering is not zero');
  for (const row of page.items) {
    assert.equal(row.supplierLabel, row.id === plan.ids.product ? plan.supplierName : null);
    assert.equal(row.seasonLabel, row.id === plan.ids.product ? plan.seasonName : null);
  }
  assert.equal(admissions.length, plan.warehouseIds.length);
  for (let i = 0; i < admissions.length; i++) {
    const row = admissions[i];
    assert.equal(row.warehouseId, plan.warehouseIds[i]); assert.equal(row.skuId, plan.ids.sku);
    assert.equal(row.admitted, true); assert.equal(row.publishedBatchId, plan.batchId);
    assert.equal(row.warehouseBasis, 'CUTOFF_MEMBER'); assert.equal(row.warehouseCreatedOperationId, null);
    assert.equal(row.skuBasis, 'POST_CUTOFF_CREATED'); assert.equal(row.skuCreatedOperationId, plan.ids.productOperation);
  }
  assert.equal(stored.length, 1); const row = stored[0];
  assert.equal(row.id, plan.ids.sku); assert.equal(row.product_id, plan.ids.product);
  assert.equal(row.created_operation_id, plan.ids.productOperation);
  assert.equal(row.cutoff_member, false); assert.equal(row.balance_rows, '0'); assert.equal(row.creation_operation_ledger_rows, '0');
}

function finiteIds(values) {
  const used = new Set();
  return kind => { need(Object.hasOwn(values, kind) && !used.has(kind), 'ONE_ORIGINAL_ALLOCATION_PER_FINITE_KIND'); used.add(kind); return values[kind]; };
}

/** Observation-only finite host seam. Events are detached/frozen snapshots;
 * callback results are ignored, never authority, replacement values or retries.
 * Omission returns the original work promise unchanged (legacy harness cadence).
 * A failed observation after a returned command does not undo that command. */
export function createBusinessStageObserver(onStage, active) {
  need(onStage === undefined || typeof onStage === 'function', 'TRUSTED_BUSINESS_STAGE_CALLBACK_REQUIRED');
  need(typeof active === 'function', 'ORIGINAL_BUSINESS_ACTIVE_CHECK_REQUIRED');
  let sequence = 0;
  const own = (value, key) => { const d = value !== null && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined; return d && Object.hasOwn(d, 'value') ? d.value : undefined; };
  const emit = async (stage, transition, value, error) => {
    const snapshot = value === undefined ? undefined : structuredClone(value);
    const originalResult = own(snapshot, 'result'), operationId = own(snapshot, 'operationId') ?? own(originalResult, 'operationId');
    const action = own(snapshot, 'action'), status = own(snapshot, 'status');
    const errorCode = own(error, 'code'), errorMessage = own(error, 'message');
    const event = freeze({ format: 'FINITE_CURRENT_RUNTIME_BUSINESS_STAGE_V1', sequence: ++sequence, stage, transition,
      action: typeof action === 'string' ? action : null, operationId: typeof operationId === 'string' ? operationId : null,
      receipt: typeof status === 'string' ? snapshot : null,
      resultHash: snapshot === undefined ? null : requestHash(snapshot),
      error: error === undefined ? null : { code: typeof errorCode === 'string' ? errorCode : null, message: typeof errorMessage === 'string' ? errorMessage : null } });
    await onStage(event); // Fulfilled return value cannot replace any method result.
  };
  const emitThenActive = async (...args) => {
    let loggingFailed = false, loggingFailure;
    try { await emit(...args); } catch (error) { loggingFailed = true; loggingFailure = error; }
    try { active(); }
    catch (original) {
      if (loggingFailed) throw new AggregateError([original, loggingFailure], 'ORIGINAL_BUSINESS_AND_STAGE_OBSERVATION_FAILED', { cause: original });
      throw original;
    }
    if (loggingFailed) throw loggingFailure;
  };
  return Object.freeze({ call(stage, work) {
    need(typeof stage === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(stage) && typeof work === 'function', 'CLOSED_BUSINESS_STAGE_AND_WORK_REQUIRED');
    if (onStage === undefined) return work(); // No extra await/hash/guard without opt-in.
    return (async () => {
      active(); await emitThenActive(stage, 'START');
      let value;
      try { value = await work(); }
      catch (original) {
        try { await emit(stage, 'FAILED', undefined, original); }
        catch (observation) { throw new AggregateError([original, observation], 'ORIGINAL_BUSINESS_AND_STAGE_OBSERVATION_FAILED', { cause: original }); }
        throw original;
      }
      // Record the actual return FIRST, including a late-cancelled committed ACK.
      // The existing active check then prevents every subsequent stage/command.
      await emitThenActive(stage, 'RETURNED', value); return value;
    })();
  } });
}

/** Host-provided original fenced runtime pool ONLY. This function does not own,
 * close or construct a PG driver, install schema, grant SQL or write reviews.
 * No dependencies/services/issuer can be injected to manufacture success. */
const finiteBusinessContexts = new WeakMap(), retainFiniteBusinessContext = Symbol('private finite business retention');
/** Private, live-RAM provenance only: never serializable authority, a renewed
 * deadline, a replacement runtime capability or permission to reuse a closed
 * target. The host still owns all source/physical/budget fences and cleanup. */
export function assertCurrentRuntimeBusinessContext(context) {
  need(finiteBusinessContexts.has(context), 'ORIGINAL_VERIFIED_FINITE_BUSINESS_CONTEXT_REQUIRED'); return context;
}
export function currentRuntimeBusinessContextData(context) {
  return finiteBusinessContexts.get(assertCurrentRuntimeBusinessContext(context));
}
// The private token is not an injectable issuer or a serializable capability.
// The original async function/name/arity and Promise path remain unchanged;
// unrelated second arguments still cannot enable retention.
export function runCurrentRuntimeBusinessWithContext(input) { return runCurrentRuntimeBusiness(input, retainFiniteBusinessContext); }
export async function runCurrentRuntimeBusiness(input, contextToken = undefined) {
  const settings = captureData(input, ['pool', 'fixture', 'reviewRef', 'budget', 'signal', ...(Object.hasOwn(input ?? {}, 'onStage') ? ['onStage'] : [])]);
  const { pool: rawPool, fixture: original, reviewRef, budget, signal, onStage } = settings;
  need(!Object.hasOwn(settings, 'onStage') || typeof onStage === 'function', 'TRUSTED_BUSINESS_STAGE_CALLBACK_REQUIRED');
  const fixture = assertFixture(original), plan = createCurrentRuntimeBusinessPlan(fixture);
  const ref = captureData(reviewRef, ['path', 'sha256']);
  need(typeof ref.path === 'string' && path.isAbsolute(ref.path) && path.resolve(ref.path) === ref.path
    && /^[a-f0-9]{64}$/.test(ref.sha256), 'PINNED_CANONICAL_INDEPENDENT_REVIEW_REFERENCE_REQUIRED');
  need(rawPool !== null && typeof rawPool === 'object' && typeof budget?.remaining === 'function'
    && typeof signal?.aborted === 'boolean' && typeof signal.addEventListener === 'function', 'HOST_FENCED_POOL_BUDGET_AND_SIGNAL_REQUIRED');
  const active = () => { need(!signal.aborted, 'CURRENT_RUNTIME_BUSINESS_ABORTED'); budget.remaining(); };
  active();
  // Factory identity excludes shape copies/other module instances. This is NOT
  // physical-target, review, permission or issuer authority; those remain below.
  assertCurrentRuntimePool(rawPool);
  // Original source issuer performs real exact new-profile/target/catalog/ACL
  // verification before exposing its actual leased-client brands. No fake brand.
  const stages = createBusinessStageObserver(onStage, active); let issuer;
  await stages.call('ISSUER_CREATE', async () => {
    issuer = await createNativeRuntime26Issuer(rawPool, { reviewFile: ref.path, trustedReviewSha256: ref.sha256,
      requiredObservation: REQUIRED_OBSERVATION });
    return { reviewSha256: ref.sha256, requiredObservation: REQUIRED_OBSERVATION };
  });
  active();

  async function snapshot(purpose, work) {
    active(); const client = await issuer.pool.connect(); let began = false, committing = false, discard;
    try {
      active(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      await issuer.runtime26.assertReady(client, purpose); active();
      const identity = await sourceConfirmedReadIdentityOn(client, plan.actor, signal); active();
      need(identity.role === 'ADMIN' && identity.hallId === plan.actor.hallId, 'ACTUAL_FIXTURE_ADMIN_AND_HALL_REQUIRED');
      const value = await work(client, identity); active(); committing = true;
      await client.query('COMMIT'); began = false; active(); return value;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error('Current business read failed');
      if (began && !committing) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error('Current business rollback failed');
        throw new AggregateError([error, rollback], 'Current business read/rollback failed');
      }
      throw error; // Preserve ordinary error/unknown-COMMIT; no retry, no new key.
    } finally { client.release(discard); }
  }
  // Check ALL required purposes on one actual issuer lease BEFORE either CREATE.
  // A missing stock/season purpose must not leave an avoidable partial write.
  const identity = await stages.call('IDENTITY_AND_REQUIRED_PURPOSES', () => snapshot('PRODUCT_MAINTENANCE', async (client, value) => {
    for (const purpose of BUSINESS_PURPOSES.slice(1)) { await issuer.runtime26.assertReady(client, purpose); active(); }
    return value;
  }));
  const actor = Object.freeze({ ...plan.actor, role: identity.role });
  // Supplier is physically independent from historical CUSTOMER exclusion.
  const parties = new PostgresPartyUnitOfWork(issuer.pool, null), partyTransaction = parties.transaction.bind(parties);
  parties.transaction = work => partyTransaction(async tx => { active(); const result = await work(tx); active(); return result; });
  const supplierService = createPartyMaintenanceService({ unitOfWork: parties, authorization: createSourcePartyAuthorization(),
    codes: createApprovedPartyCodeAllocator(), now: () => new Date().toISOString(),
    newId: finiteIds({ supplier: plan.ids.supplier, operation: plan.ids.supplierOperation, audit: plan.ids.supplierAudit }) });
  active(); const supplier = await stages.call('SUPPLIER_EXECUTE', () => supplierService.execute({ ...plan.supplier, kind: 'SUPPLIER', actor })); active();
  assert.equal(supplier.kind, 'SUPPLIER'); assert.equal(supplier.partyId, plan.ids.supplier);
  assert.equal(supplier.operationId, plan.ids.supplierOperation); assert.equal(supplier.version, 1); assert.equal(supplier.enabled, true);
  assert.match(supplier.code, /^GYS\d{6,}$/);
  const supplierReceipt = await stages.call('SUPPLIER_RECEIPT', () => supplierService.receipt(actor, 'SUPPLIER', plan.supplier.requestKey)); active();
  assert.equal(supplierReceipt.status, 'COMMITTED'); assert.equal(supplierReceipt.action, 'CREATE');
  assert.deepEqual(supplierReceipt.result, supplier);

  const driver = new PostgresMaintenanceCommandUnitOfWork(issuer.pool), originalTransaction = driver.transaction.bind(driver);
  // Preserve the actual registered driver/context. No structural context copy.
  driver.transaction = work => originalTransaction(async context => {
    active(); const client = maintenanceContextClient(context, issuer.pool);
    await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE');
    await sourceConfirmedReadIdentityOn(client, actor, signal); active();
    const result = await work(context); active();
    await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE'); active(); return result;
  });
  const products = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, {
    deletionGuard: null, seasonCapability: issuer.productSeasonArray,
    capacity: createSourceConfirmedProductCapacityFactory(issuer.pool, issuer.runtime26) }),
    now: () => new Date().toISOString(), newId: finiteIds({ product: plan.ids.product, operation: plan.ids.productOperation,
      sku: plan.ids.sku, barcode: plan.ids.barcode }), media: null });
  active(); const product = await stages.call('PRODUCT_EXECUTE', () => products.executeV2(actor, plan.product, signal)); active();
  assert.deepEqual(product, { operationId: plan.ids.productOperation, kind: 'PRODUCT', targetId: plan.ids.product, version: 1 });
  const productReceipt = await stages.call('PRODUCT_RECEIPT', () => products.receipt(actor, plan.product.requestKey)); active();
  assert.equal(productReceipt.status, 'COMMITTED'); assert.equal(productReceipt.action, 'CREATE'); assert.deepEqual(productReceipt.result, product);
  const detail = await stages.call('PRODUCT_DETAIL', () => products.detailV2(actor, { productId: product.targetId })); active();
  assert.equal(detail.version, 1); assert.deepEqual(detail.values, plan.product.values);
  assert.equal(detail.skus.length, 1); assert.equal(detail.skus[0].id, plan.ids.sku);
  assert.deepEqual({ ...detail.skus[0], id: null, expectedVersion: null }, plan.product.skus[0]);
  assert.equal(detail.references.supplier.id, supplier.partyId); assert.equal(detail.references.supplier.name, plan.supplierName);
  assert.equal(detail.references.supplier.enabled, true);
  assert.deepEqual(detail.barcodes, [{ id: plan.ids.barcode, barcode: plan.expectedMainBarcode,
    colorId: fixture.reference.colorId, fitId: fixture.reference.fitId, sizeId: fixture.reference.sizes[0].id,
    kind: 'MAIN', schemeId: fixture.scheme.id, enabled: true }]);

  // Exact original grant and RR snapshot reader; neither a hand-made ALL grant
  // nor coalesce of an unqualified/missing stock result is introduced here.
  const lists = createProductManagementQueryService({
    authorization: createSourceConfirmedApplicationReadAuthorization(issuer.pool).productManagement,
    reader: new PostgresProductManagementQueryReader(issuer.pool, issuer.catalogueRetainedDelete, issuer.productSeasonArray, issuer.runtime26) });
  const page = await stages.call('ALL_WAREHOUSE_STOCK_LIST', () => lists.readList(actor, plan.query, signal)); active();
  const witness = await stages.call('NEW_SKU_ADMISSION_AND_STORED_ZERO', () => snapshot('INVENTORY_ADMISSION', async client => {
    const admissions = await readInventoryKeyAdmissions(client, plan.warehouseIds.map(warehouseId => ({ warehouseId, skuId: plan.ids.sku })));
    active(); const stored = (await client.query(`/* current-business:new-sku-no-synthetic-zero */ SELECT s.id,s.product_id,s.created_operation_id,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$2::uuid AND r.status='IMPORTED'
        AND r.target_type='SKU' AND r.target_id=s.id) AS cutoff_member,
      (SELECT count(*)::text FROM naijue_erp.inventory_balance b WHERE b.sku_id=s.id) AS balance_rows,
      (SELECT count(*)::text FROM naijue_erp.inventory_ledger l WHERE l.operation_id=$3::uuid) AS creation_operation_ledger_rows
      FROM naijue_erp.sku s WHERE s.id=$1::uuid`, [plan.ids.sku, fixture.batchId, plan.ids.productOperation])).rows;
    return { admissions, stored };
  }));
  assertCurrentRuntimeStockEvidence(plan, page, witness.admissions, witness.stored);
  const result = freeze({ format: 'FINITE_CURRENT_RUNTIME_BUSINESS_RESULT_V1', scope: BUSINESS_SCOPE,
    status: 'PASS_FINITE_CURRENT_RUNTIME_BUSINESS_ONLY_NOT_PERFORMANCE',
    requiredObservation: REQUIRED_OBSERVATION, requiredPurposes: BUSINESS_PURPOSES,
    reviewSha256: ref.sha256, sourceManifestSha256: plan.sourceManifestSha256, commandInputSha256: plan.commandInputSha256,
    actualIdentity: { accountId: actor.accountId, hallId: actor.hallId, role: identity.role },
    supplierReceipt, productReceipt, productDetail: detail, allWarehousePage: page, newSkuAdmission: witness,
    originalSourceStock: ['16', '5'], postCutoffNewSkuStock: '0', newSkuBalanceRowsObserved: 0, creationOperationLedgerRowsObserved: 0,
    realTimingOrScaleAcceptance: false, layoutMs: null, databasePerformanceMs: null,
    limits: ['One original Supplier CREATE and one original Product CREATE/new SKU only; no full-scale performance or full application acceptance.',
      'Ledger diagnostic covers this exact Product CREATE operation only, NOT an all-SKU ledger scan. No extra SELECT/GRANT.',
      'No SAVE/APPROVE/history write or image upload; current identity lookup is not application login/session acceptance; host owns physical fences, review authority and cleanup.',
      'No automatic retry/recovery after any thrown error; partial committed writes require original-key independent readback.'] });
  if (contextToken !== retainFiniteBusinessContext) return result;
  // This is the sole context mint, after all original awaited operations,
  // original receipts/detail assertions and complete finite stock evidence.
  // Nothing in result or onStage receives this issuer or source fixture.
  const context = Object.freeze({ format: 'RAM_ONLY_VERIFIED_FINITE_BUSINESS_CONTEXT_V1' });
  finiteBusinessContexts.set(context, Object.freeze({ issuer, actor, fixture, plan, result }));
  return Object.freeze({ result, context });
}
