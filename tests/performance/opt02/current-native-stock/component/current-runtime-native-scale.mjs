/** TEST ONLY: finite native scale through ORIGINAL services, never raw product
 * INSERT, a performance verdict, a capability substitute or an engine runner.
 * Importing is inert. Host owns one fresh target, real review, deadline, global
 * physical send fence and close/stop. Every CREATE is independent: no retry or
 * compensating transaction after error/unknown acknowledgement. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
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

import { createCurrentRuntimeBusinessPlan, assertCurrentRuntimeStockEvidence, createBusinessStageObserver, BUSINESS_PURPOSES, REQUIRED_OBSERVATION } from './current-runtime-business.mjs';

export const NATIVE_SCALE_SCOPE = 'FINITE_RETAINED3_SERVICE98_PRODUCT101_NOT_PERFORMANCE';
export const NATIVE_SCALE_BUDGET = Object.freeze({ minimumNextCycleMs: 120_000, finalReserveMs: 60_000, observedCycleMultiplier: 2 });
const plans = new WeakSet(), contexts = new WeakMap();
const checkedPlan = value => { need(plans.has(value), 'ORIGINAL_NATIVE_SCALE_PLAN_REQUIRED'); return value; };
const compareC = (a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function uuidValues(value, into = new Set()) {
  if (typeof value === 'string' && uuid.test(value)) into.add(value);
  else if (value && typeof value === 'object') Object.values(value).forEach(item => uuidValues(item, into));
  return into;
}

/** Exact deterministic command set; predicted IDs/barcodes are NOT actual facts.
 * Empty all-product filter follows the original reader: deleted_at exclusion,
 * no enabled/SKU-count filter. Disabled retained product has no SKU, but its row
 * remains in exactTotal/order; this is verified against actual original pages. */
export function createNativeScalePlan(input) {
  const fixture = assertFixture(input), base = createCurrentRuntimeBusinessPlan(fixture), r = fixture.reference;
  need(fixture.referenceCounts.product === 3 && fixture.skus.length === 3 && fixture.warehouses.length === 2,
    'EXACT_RETAINED3_PRODUCT3_SKU2_WAREHOUSE_SOURCE_REQUIRED');
  need(r.sizes[0].code === '900' && fixture.scheme.id === '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef', 'EXACT_ORIGINAL_MAIN_REFERENCE_INPUT_REQUIRED');
  const held = uuidValues(fixture); Object.values(base.ids).forEach(id => { need(!held.has(id), 'FIRST_SERVICE_ID_COLLISION'); held.add(id); });
  const codes = new Set([r.expectedProductCode, r.expectedProductCode + '-DISABLED', fixture.alternateProduct.code, base.product.values.productCode]);
  const skuCodes = new Set([...fixture.skus.map(row => row.sku_code), base.product.skus[0].skuCode]);
  const keys = new Set([base.supplier.requestKey, base.product.requestKey]), systems = new Set([base.product.values.systemItemCode]);
  const barcodes = new Set([base.expectedMainBarcode]);
  const commands = [{ ordinal: 1, appendOrdinal: null, ids: { product: base.ids.product, operation: base.ids.productOperation,
    sku: base.ids.sku, barcode: base.ids.barcode }, command: base.product, commandInputSha256: requestHash(base.product), predictedMainBarcode: base.expectedMainBarcode }];
  for (let index = 0; index < 97; index++) {
    const token = String(index + 1).padStart(3, '0');
    const ids = Object.fromEntries(['product', 'operation', 'sku', 'barcode'].map(kind => [kind, sourceUuid('product101-append-v1:' + token + ':' + kind)]));
    for (const id of Object.values(ids)) { need(!held.has(id), 'APPEND_ID_COLLISION'); held.add(id); }
    const systemItemCode = String(8000000 + index), productCode = 'ZZOPT02_101_' + fixture.datasetId + '_' + token;
    const skuCode = 'ZZOPT02-SKU101-' + fixture.datasetId + '-' + token, requestKey = fixture.datasetId + ':OPT02:APPEND97:' + token + ':CREATE';
    const predictedMainBarcode = '5A' + systemItemCode + '001900';
    for (const [set, value] of [[codes, productCode], [skuCodes, skuCode], [keys, requestKey], [systems, systemItemCode], [barcodes, predictedMainBarcode]]) {
      need(!set.has(value), 'NATIVE_SCALE_LOGICAL_INPUT_COLLISION'); set.add(value);
    }
    const command = { action: 'CREATE', requestKey, values: { ...base.product.values, productCode,
      name: 'SYNTHETIC OPT02 PAGE101 PRODUCT ' + token, systemItemCode,
      seasonIds: [...base.product.values.seasonIds], prices: { ...base.product.values.prices } },
      skus: [{ ...base.product.skus[0], skuCode }], barcodes: [] };
    assert.deepEqual(parseProductMaintenanceCommandV2(command), command);
    commands.push({ ordinal: index + 2, appendOrdinal: index + 1, ids, command, commandInputSha256: requestHash(command), predictedMainBarcode });
  }
  const retained = [
    { id: r.productId, code: r.expectedProductCode, stock: '16', price: '1.25', noSku: false },
    { id: r.disabledProductId, code: r.expectedProductCode + '-DISABLED', stock: '0', price: '1.25', noSku: true },
    { id: fixture.alternateProduct.id, code: fixture.alternateProduct.code, stock: '5', price: '2.50', noSku: false },
  ];
  const expected = [...retained, ...commands.map(row => ({ id: row.ids.product, code: row.command.values.productCode,
    stock: '0', price: '19.99', noSku: false }))].sort(compareC);
  need(expected.length === 101 && new Set(expected.map(row => row.id)).size === 101, 'EXACT_GLOBAL_101_PRODUCT_SET_REQUIRED');
  const globalQuery = { page: 1, pageSize: 100, filter: Object.fromEntries(Object.keys(base.query.filter).map(key => [key, []])) };
  const result = freeze({ format: 'FINITE_NATIVE_SCALE_COMMAND_PLAN_V1', scope: NATIVE_SCALE_SCOPE, authority: 'NONE',
    fixtureDatasetId: fixture.datasetId, sourceManifestSha256: fixture.artifacts.at(-1).sha256, base, commands, expected,
    globalQuery, secondPageQuery: { ...globalQuery, page: 2 }, expectedProducts: 101, expectedSkus: 101,
    retainedProductCount: 3, retainedSkuCount: 3, serviceProductCount: 98, serviceSkuCount: 98,
    expectedSkuRows: [...fixture.skus.map(row => ({ id: row.id, product_id: row.product_id, created_operation_id: row.created_operation_id })),
      ...commands.map(row => ({ id: row.ids.sku, product_id: row.ids.product, created_operation_id: row.ids.operation }))]
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    appendCommandCount: 97, commandSetHash: requestHash(commands.map(row => ({ ids: row.ids, command: row.command }))),
    newBalanceRowsToInsert: 0, performanceAcceptance: false,
    page1Ids: expected.slice(0, 100).map(row => row.id), page2Ids: expected.slice(100).map(row => row.id) });
  plans.add(result); return result;
}

/** A conservative STOP-SENDING policy, not a worst-case latency guarantee.
 * Uses only this invocation's full successful execute+receipt+detail cycles.
 * The host's unchanged absolute deadline still bounds in-flight work/cleanup.
 * An expired/throwing budget and cancellation remain errors, never NOT_READY. */
export function createNativeScaleBudgetGate(input) {
  const { budget, signal } = captureData(input, ['budget', 'signal']);
  need(typeof budget?.remaining === 'function' && typeof signal?.aborted === 'boolean', 'ORIGINAL_SCALE_BUDGET_AND_SIGNAL_REQUIRED');
  let longest = 0, completed = 0;
  const active = () => { need(!signal.aborted, 'CURRENT_RUNTIME_BUSINESS_ABORTED');
    const remaining = budget.remaining(); need(Number.isFinite(remaining) && remaining > 0, 'FINITE_POSITIVE_ORIGINAL_REMAINING_BUDGET_REQUIRED'); return remaining; };
  return Object.freeze({ active,
    beforeCreate() {
      const remainingMs = active(), requiredMs = NATIVE_SCALE_BUDGET.finalReserveMs + Math.max(NATIVE_SCALE_BUDGET.minimumNextCycleMs,
        Math.ceil(longest * NATIVE_SCALE_BUDGET.observedCycleMultiplier));
      return freeze({ mayStart: remainingMs >= requiredMs, remainingMs, requiredMs, successfulCycles: completed,
        longestObservedCycleMs: longest, guaranteeAll97Fit: false });
    },
    beforeFinalReads() { const remainingMs = active(); return freeze({ mayStart: remainingMs >= NATIVE_SCALE_BUDGET.finalReserveMs,
      remainingMs, requiredMs: NATIVE_SCALE_BUDGET.finalReserveMs, guaranteeAll97Fit: false }); },
    completedCycle(elapsedMs) { active(); need(Number.isFinite(elapsedMs) && elapsedMs >= 0, 'FINITE_ACTUAL_CYCLE_DURATION_REQUIRED');
      longest = Math.max(longest, elapsedMs); completed++; },
  });
}

/** Original returned/receipt/detail checks; no row can become authority here. */
export function assertNativeScaleProductEvidence(input, originalRow, executed, receipt, detail, supplier) {
  const plan = checkedPlan(input), row = plan.commands.find(value => value === originalRow);
  need(row, 'ORIGINAL_NATIVE_SCALE_COMMAND_ROW_REQUIRED');
  assert.deepEqual(executed, { operationId: row.ids.operation, kind: 'PRODUCT', targetId: row.ids.product, version: 1 });
  assert.equal(receipt.requestKey, row.command.requestKey); assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.action, 'CREATE');
  assert.equal(typeof receipt.completedAt, 'string'); assert.ok(Number.isFinite(Date.parse(receipt.completedAt))); assert.deepEqual(receipt.result, executed);
  assert.equal(detail.version, 1); assert.deepEqual(detail.values, row.command.values);
  assert.equal(detail.skus.length, 1); assert.equal(detail.skus[0].id, row.ids.sku);
  assert.deepEqual({ ...detail.skus[0], id: null, expectedVersion: null }, row.command.skus[0]);
  assert.equal(detail.references.supplier.id, supplier.partyId); assert.equal(supplier.partyId, plan.base.ids.supplier);
  assert.equal(detail.references.supplier.name, plan.base.supplierName); assert.equal(detail.references.supplier.enabled, true);
  assert.deepEqual(detail.barcodes, [{ id: row.ids.barcode, barcode: row.predictedMainBarcode,
    colorId: row.command.skus[0].colorId, fitId: row.command.skus[0].fitId, sizeId: row.command.skus[0].sizeId,
    kind: 'MAIN', schemeId: row.command.values.defaultBarcodeSchemeId, enabled: true }]);
}

export function assertNativeScalePages(input, first, second) {
  const plan = checkedPlan(input);
  for (const [page, number, expectedIds] of [[first, 1, plan.page1Ids], [second, 2, plan.page2Ids]]) {
    assert.equal(page.page, number); assert.equal(page.pageSize, 100); assert.equal(page.exactTotal, 101);
    assert.deepEqual(page.items.map(row => row.id), expectedIds);
    for (const row of page.items) {
      const expected = plan.expected.find(item => item.id === row.id);
      assert.equal(row.code, expected.code); assert.equal(row.totalStock, expected.stock); assert.equal(row.retailPrice, expected.price);
      const native = plan.commands.some(item => item.ids.product === row.id);
      assert.equal(row.supplierLabel, native ? plan.base.supplierName : null); assert.equal(row.seasonLabel, native ? plan.base.seasonName : null);
      assert.deepEqual(row.fits, expected.noSku ? [] : [{ id: plan.base.product.skus[0].fitId, label: 'SYNTHETIC FIT' }]);
    }
  }
}

export function assertNativeScaleSkuSet(input, actual) {
  const plan = checkedPlan(input); assert.deepEqual(actual, plan.expectedSkuRows, 'EXACT_GLOBAL_RETAINED3_SERVICE98_SKU_SET_REQUIRED');
}

export function assertNativeScaleZeroEvidence(input, admissions, stored) {
  const plan = checkedPlan(input), rows = plan.commands;
  assert.equal(stored.length, 98); assert.equal(admissions.length, 196);
  rows.forEach((row, index) => {
    assert.deepEqual(stored[index], { id: row.ids.sku, product_id: row.ids.product, created_operation_id: row.ids.operation,
      cutoff_member: false, balance_rows: '0', creation_operation_ledger_rows: '0' });
    plan.base.warehouseIds.forEach((warehouseId, j) => {
      const a = admissions[index * 2 + j];
      assert.equal(a.warehouseId, warehouseId); assert.equal(a.skuId, row.ids.sku); assert.equal(a.admitted, true);
      assert.equal(a.publishedBatchId, plan.base.batchId); assert.equal(a.warehouseBasis, 'CUTOFF_MEMBER');
      assert.equal(a.warehouseCreatedOperationId, null); assert.equal(a.skuBasis, 'POST_CUTOFF_CREATED'); assert.equal(a.skuCreatedOperationId, row.ids.operation);
    });
  });
}

function finiteIds(values) {
  const used = new Set(); return kind => { need(Object.hasOwn(values, kind) && !used.has(kind), 'ONE_ORIGINAL_ALLOCATION_PER_FINITE_KIND');
    used.add(kind); return values[kind]; };
}
/** A shape copy cannot restore this RAM-only handle. No handle enters result or
 * events. Only a fully verified ready invocation creates a context. The caller
 * still owns physical fences/cleanup and MUST NOT serialize the returned issuer. */
export function assertNativeScaleContext(context) { need(contexts.has(context), 'ORIGINAL_READY_NATIVE_SCALE_CONTEXT_REQUIRED'); return context; }
export function nativeScaleContextData(context) { return contexts.get(assertNativeScaleContext(context)); }

/** No injectable issuer, service, allocator, reader or SQL is accepted. Each
 * original Product CREATE gets its own registered UOW/capacity and fresh finite
 * allocator; it is NOT a single transaction and failed commands are never replayed. */
export async function runCurrentRuntimeNativeScale(input) {
  const settings = captureData(input, ['pool', 'fixture', 'reviewRef', 'budget', 'signal', ...(Object.hasOwn(input ?? {}, 'onStage') ? ['onStage'] : [])]);
  const { pool: rawPool, fixture: original, reviewRef, budget, signal, onStage } = settings;
  need(!Object.hasOwn(settings, 'onStage') || typeof onStage === 'function', 'TRUSTED_NATIVE_SCALE_STAGE_CALLBACK_REQUIRED');
  const fixture = assertFixture(original), plan = createNativeScalePlan(fixture), base = plan.base;
  const ref = captureData(reviewRef, ['path', 'sha256']);
  need(typeof ref.path === 'string' && path.isAbsolute(ref.path) && path.resolve(ref.path) === ref.path && /^[a-f0-9]{64}$/.test(ref.sha256),
    'PINNED_CANONICAL_INDEPENDENT_REVIEW_REFERENCE_REQUIRED');
  need(typeof signal?.addEventListener === 'function', 'ORIGINAL_SCALE_ABORT_SIGNAL_REQUIRED');
  const gate = createNativeScaleBudgetGate({ budget, signal }), active = gate.active;
  active(); assertCurrentRuntimePool(rawPool); // Before connect/getter, same active host WeakSet.
  let command = null;
  const stages = createBusinessStageObserver(onStage === undefined ? undefined : event => onStage(freeze({
    format: 'FINITE_NATIVE_SCALE_STAGE_V1', command, observation: event })), active);
  let issuer;
  await stages.call('ISSUER_CREATE', async () => {
    issuer = await createNativeRuntime26Issuer(rawPool, { reviewFile: ref.path, trustedReviewSha256: ref.sha256, requiredObservation: REQUIRED_OBSERVATION });
    return { reviewSha256: ref.sha256, requiredObservation: REQUIRED_OBSERVATION };
  });
  active();
  async function snapshot(purpose, work) {
    active(); const client = await issuer.pool.connect(); let began = false, committing = false, discard;
    try {
      active(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      await issuer.runtime26.assertReady(client, purpose); active();
      const identity = await sourceConfirmedReadIdentityOn(client, base.actor, signal); active();
      need(identity.role === 'ADMIN' && identity.hallId === base.actor.hallId, 'ACTUAL_FIXTURE_ADMIN_AND_HALL_REQUIRED');
      const value = await work(client, identity); active(); committing = true; await client.query('COMMIT'); began = false; active(); return value;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error('Native scale snapshot failed');
      if (began && !committing) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : new Error('Native scale rollback failed');
        throw new AggregateError([error, rollback], 'Native scale read/rollback failed', { cause: error });
      }
      throw error; // Host physical gate suppresses rollback SQL after unknown ACK.
    } finally { client.release(discard); }
  }
  const identity = await stages.call('IDENTITY_AND_REQUIRED_PURPOSES', () => snapshot('PRODUCT_MAINTENANCE', async (client, value) => {
    for (const purpose of BUSINESS_PURPOSES.slice(1)) { await issuer.runtime26.assertReady(client, purpose); active(); } return value;
  }));
  const actor = Object.freeze({ ...base.actor, role: identity.role });
  const committed = []; let supplierReceipt = null, initialFiniteRead = null;
  const finish = (ready, pause, verification = null) => {
    const result = freeze({ format: 'FINITE_NATIVE_SCALE_RESULT_V1', scope: NATIVE_SCALE_SCOPE,
      status: ready ? 'READY_FINITE_NATIVE_PRODUCT101_NOT_PERFORMANCE' : 'NOT_READY_PARTIAL_NATIVE_SCALE_BUDGET', ready,
      performanceAcceptance: false, reviewSha256: ref.sha256, sourceManifestSha256: plan.sourceManifestSha256,
      commandSetHash: plan.commandSetHash, retainedProducts: 3, retainedSkus: 3, plannedServiceProducts: 98,
      acknowledgedProductReceipts: [...committed], acknowledgedServiceProductCount: committed.length,
      supplierReceipt, initialFiniteRead, pause, verification });
    let context = null;
    if (ready) { context = Object.freeze({ format: 'RAM_ONLY_ORIGINAL_NATIVE_SCALE_CONTEXT_V1' }); contexts.set(context, Object.freeze({ issuer, actor, fixture, plan, result })); }
    return Object.freeze({ context, result });
  };
  async function pauseIfNeeded() {
    const decision = gate.beforeCreate(); if (decision.mayStart) return null;
    await stages.call('SCALE_PAUSED', async () => decision); return finish(false, decision);
  }
  let pause = await pauseIfNeeded(); if (pause) return pause;
  command = freeze({ kind: 'SUPPLIER', ordinal: null, requestKey: base.supplier.requestKey, plannedTargetId: base.ids.supplier,
    plannedOperationId: base.ids.supplierOperation });
  const parties = new PostgresPartyUnitOfWork(issuer.pool, null), originalPartyTransaction = parties.transaction.bind(parties);
  parties.transaction = work => originalPartyTransaction(async tx => { active(); const value = await work(tx); active(); return value; });
  const suppliers = createPartyMaintenanceService({ unitOfWork: parties, authorization: createSourcePartyAuthorization(),
    codes: createApprovedPartyCodeAllocator(), now: () => new Date().toISOString(),
    newId: finiteIds({ supplier: base.ids.supplier, operation: base.ids.supplierOperation, audit: base.ids.supplierAudit }) });
  active(); const supplier = await stages.call('SUPPLIER_EXECUTE', () => suppliers.execute({ ...base.supplier, kind: 'SUPPLIER', actor })); active();
  assert.equal(supplier.partyId, base.ids.supplier); assert.equal(supplier.operationId, base.ids.supplierOperation);
  assert.equal(supplier.kind, 'SUPPLIER'); assert.equal(supplier.version, 1); assert.equal(supplier.enabled, true); assert.match(supplier.code, /^GYS\d{6,}$/);
  supplierReceipt = await stages.call('SUPPLIER_RECEIPT', () => suppliers.receipt(actor, 'SUPPLIER', base.supplier.requestKey)); active();
  assert.equal(supplierReceipt.requestKey, base.supplier.requestKey); assert.equal(supplierReceipt.status, 'COMMITTED'); assert.equal(supplierReceipt.action, 'CREATE'); assert.deepEqual(supplierReceipt.result, supplier);
  const lists = createProductManagementQueryService({ authorization: createSourceConfirmedApplicationReadAuthorization(issuer.pool).productManagement,
    reader: new PostgresProductManagementQueryReader(issuer.pool, issuer.catalogueRetainedDelete, issuer.productSeasonArray, issuer.runtime26) });
  for (const row of plan.commands) {
    command = freeze({ kind: 'PRODUCT', ordinal: row.ordinal, requestKey: row.command.requestKey,
      plannedTargetId: row.ids.product, plannedOperationId: row.ids.operation });
    pause = await pauseIfNeeded(); if (pause) return pause;
    const started = performance.now();
    const driver = new PostgresMaintenanceCommandUnitOfWork(issuer.pool), originalTransaction = driver.transaction.bind(driver);
    driver.transaction = work => originalTransaction(async context => {
      active(); const client = maintenanceContextClient(context, issuer.pool);
      await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE'); await sourceConfirmedReadIdentityOn(client, actor, signal); active();
      const value = await work(context); active(); await issuer.runtime26.assertReady(client, 'PRODUCT_MAINTENANCE'); active(); return value;
    });
    const products = createProductMaintenanceService({ unitOfWork: new PostgresProductMaintenanceUnitOfWork(driver, {
      deletionGuard: null, seasonCapability: issuer.productSeasonArray,
      capacity: createSourceConfirmedProductCapacityFactory(issuer.pool, issuer.runtime26) }), now: () => new Date().toISOString(), media: null,
      newId: finiteIds({ product: row.ids.product, operation: row.ids.operation, sku: row.ids.sku, barcode: row.ids.barcode }) });
    active(); const product = await stages.call('PRODUCT_EXECUTE', () => products.executeV2(actor, row.command, signal)); active();
    const receipt = await stages.call('PRODUCT_RECEIPT', () => products.receipt(actor, row.command.requestKey)); active();
    // Receipt is independently read by the ORIGINAL service. RETURNED alone is not COMMITTED.
    assert.equal(receipt.status, 'COMMITTED'); assert.equal(receipt.action, 'CREATE'); assert.deepEqual(receipt.result, product);
    const detail = await stages.call('PRODUCT_DETAIL', () => products.detailV2(actor, { productId: row.ids.product })); active();
    assertNativeScaleProductEvidence(plan, row, product, receipt, detail, supplier);
    committed.push(freeze({ ordinal: row.ordinal, requestKey: row.command.requestKey, commandInputSha256: row.commandInputSha256,
      receipt, detailHash: requestHash(detail) }));
    gate.completedCycle(performance.now() - started);
    if (row.ordinal === 1) {
      const page = await stages.call('INITIAL_FINITE_STOCK_LIST', () => lists.readList(actor, base.query, signal)); active();
      const witness = await stages.call('INITIAL_FINITE_ZERO', () => readZeros([row]));
      assertCurrentRuntimeStockEvidence(base, page, witness.admissions, witness.stored);
      initialFiniteRead = freeze({ page, newSkuAdmission: witness });
    }
  }
  command = null;
  const finalBudget = gate.beforeFinalReads();
  if (!finalBudget.mayStart) { await stages.call('SCALE_PAUSED', async () => finalBudget); return finish(false, finalBudget); }
  const first = await stages.call('GLOBAL_PRODUCT_PAGE_ONE', () => lists.readList(actor, plan.globalQuery, signal)); active();
  const second = await stages.call('GLOBAL_PRODUCT_PAGE_TWO', () => lists.readList(actor, plan.secondPageQuery, signal)); active();
  assertNativeScalePages(plan, first, second);
  const narrow = await stages.call('FINAL_FINITE_STOCK_LIST', () => lists.readList(actor, base.query, signal)); active();
  const zeros = await stages.call('ALL_SERVICE_SKU_ZERO', () => readZeros(plan.commands)); active();
  assertNativeScaleZeroEvidence(plan, zeros.admissions, zeros.stored);
  const skuSet = await stages.call('EXACT_GLOBAL_SKU_SET', () => snapshot('INVENTORY_ADMISSION', async client =>
    (await client.query('/* current-native-scale:exact-global-skus */ SELECT id,product_id,created_operation_id FROM naijue_erp.sku ORDER BY id')).rows));
  active(); assertNativeScaleSkuSet(plan, skuSet);
  assertCurrentRuntimeStockEvidence(base, narrow, zeros.admissions.slice(0, 2), zeros.stored.slice(0, 1));
  return finish(true, null, { firstPage: first, secondPage: second, narrowPage: narrow, allServiceSkuZero: zeros, actualGlobalSkuSet: skuSet });

  async function readZeros(rows) {
    return snapshot('INVENTORY_ADMISSION', async client => {
      const keys = rows.flatMap(row => base.warehouseIds.map(warehouseId => ({ warehouseId, skuId: row.ids.sku })));
      const admissions = await readInventoryKeyAdmissions(client, keys); active();
      // Same source-authorized diagnostic columns as finite business, generalized
      // by exact ordered IDs, never INSERT balance0 or ledger/sku extra privileges.
      const stored = (await client.query(`/* current-native-scale:exact-service-sku-zero */
        SELECT s.id,s.product_id,s.created_operation_id,
          EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$4::uuid AND r.status='IMPORTED'
            AND r.target_type='SKU' AND r.target_id=s.id) AS cutoff_member,
          (SELECT count(*)::text FROM naijue_erp.inventory_balance b WHERE b.sku_id=s.id) AS balance_rows,
          (SELECT count(*)::text FROM naijue_erp.inventory_ledger l WHERE l.operation_id=k.operation_id) AS creation_operation_ledger_rows
        FROM unnest($1::uuid[],$2::uuid[],$3::uuid[]) WITH ORDINALITY k(sku_id,product_id,operation_id,position)
        JOIN naijue_erp.sku s ON s.id=k.sku_id AND s.product_id=k.product_id
        ORDER BY k.position`, [rows.map(row => row.ids.sku), rows.map(row => row.ids.product), rows.map(row => row.ids.operation), fixture.batchId])).rows;
      return { admissions, stored };
    });
  }
}
