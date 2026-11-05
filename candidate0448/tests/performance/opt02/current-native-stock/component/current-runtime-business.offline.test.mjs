/** Pure input/oracle/negative-boundary tests ONLY. No fake issuer success,
 * engine, LOGIN, SQL execution, CREATE receipt or performance result is claimed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { buildReferenceFixture } from './fixture.mjs';
import { assertCurrentRuntimePool } from './current-runtime-host.mjs';
import { createNativeRuntime26Issuer } from '../../../../../adapters/postgres/src/native-import-accounting-capability.ts';
import { createCurrentRuntimeBusinessPlan, assertCurrentRuntimeStockEvidence, runCurrentRuntimeBusiness,
  BUSINESS_SCOPE, BUSINESS_PURPOSES, REQUIRED_OBSERVATION, createBusinessStageObserver,
  runCurrentRuntimeBusinessWithContext, assertCurrentRuntimeBusinessContext, currentRuntimeBusinessContextData } from './current-runtime-business.mjs';
import { parsePartyCommand } from '../../../../../packages/application/src/party-maintenance-validation.ts';
import { parseProductMaintenanceCommandV2 } from '../../../../../packages/application/src/product-maintenance-validation.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../../packages/application/src/catalogue-price-input.ts';

function observation() {
  const fixture = buildReferenceFixture(), plan = createCurrentRuntimeBusinessPlan(fixture);
  const page = { page: 1, pageSize: 100, exactTotal: 3, items: plan.expected.map(row => ({ id: row.id, code: row.code,
    totalStock: row.stock, retailPrice: row.price, supplierLabel: row.id === plan.ids.product ? plan.supplierName : null,
    seasonLabel: row.id === plan.ids.product ? plan.seasonName : null })) };
  const admissions = plan.warehouseIds.map(warehouseId => ({ warehouseId, skuId: plan.ids.sku, admitted: true,
    publishedBatchId: plan.batchId, warehouseBasis: 'CUTOFF_MEMBER', warehouseCreatedOperationId: null,
    skuBasis: 'POST_CUTOFF_CREATED', skuCreatedOperationId: plan.ids.productOperation }));
  const stored = [{ id: plan.ids.sku, product_id: plan.ids.product, created_operation_id: plan.ids.productOperation,
    cutoff_member: false, balance_rows: '0', creation_operation_ledger_rows: '0' }];
  return { fixture, plan, page, admissions, stored };
}
function input() {
  let connects = 0;
  return { args: { pool: { async connect() { connects++; throw new Error('OFFLINE_MUST_NOT_CONNECT'); } },
    fixture: buildReferenceFixture(), reviewRef: { path: '/tmp/NEVER_PRESENT_CURRENT_RUNTIME_BUSINESS_REVIEW.json', sha256: 'a'.repeat(64) },
    budget: { remaining() { return 1000; } }, signal: new AbortController().signal }, connects: () => connects };
}

test('finite plan uses real fixture brand and original typed Supplier/ProductV2 parsers without writing source', () => {
  const f = buildReferenceFixture(), before = structuredClone(f), plan = createCurrentRuntimeBusinessPlan(f);
  assert.equal(plan.scope, BUSINESS_SCOPE); assert.equal(Object.isFrozen(plan.product.values.prices), true);
  assert.deepEqual(parsePartyCommand(plan.supplier, { ...plan.actor, role: 'ADMIN' }, 'SUPPLIER'),
    { ...plan.supplier, kind: 'SUPPLIER', actor: { ...plan.actor, role: 'ADMIN' } });
  assert.deepEqual(parseProductMaintenanceCommandV2(plan.product), plan.product);
  assert.equal(plan.product.values.supplierId, plan.ids.supplier);
  assert.deepEqual(plan.product.values.seasonIds, [f.season.id]);
  assert.equal(plan.product.values.defaultBarcodeSchemeId, f.scheme.id);
  assert.equal(plan.product.skus.length, 1); assert.equal(plan.product.barcodes.length, 0);
  assert.deepEqual(f, before); assert.equal(new Set(Object.values(plan.ids)).size, 7);
  assert.throws(() => createCurrentRuntimeBusinessPlan(structuredClone(f)), /ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED/);
});

test('all nine prices and required supplier/season/scheme stay explicit; no missing or floating money fallback', () => {
  const { plan } = observation();
  assert.deepEqual(Object.keys(plan.product.values.prices).sort(), [...CATALOGUE_PRICE_KEYS].sort());
  assert.equal(plan.product.values.prices.retail_price, '19.99'); assert.equal(plan.product.values.prices.minimum_price, null);
  for (const mutate of [
    x => { delete x.values.prices.minimum_price; }, x => { x.values.prices.retail_price = 19.99; },
    x => { x.values.supplierId = null; }, x => { x.values.seasonIds = null; },
    x => { x.values.defaultBarcodeSchemeId = null; }, x => { x.skus[0].expectedVersion = 1; },
  ]) {
    const bad = structuredClone(plan.product); mutate(bad); assert.throws(() => parseProductMaintenanceCommandV2(bad));
  }
});

test('stock assertion only validates supplied observations; exact full scope16/5/0 and unknown source labels retained', () => {
  const { plan, page, admissions, stored } = observation();
  assert.doesNotThrow(() => assertCurrentRuntimeStockEvidence(plan, page, admissions, stored));
  assert.throws(() => assertCurrentRuntimeStockEvidence(structuredClone(plan), page, admissions, stored), /ORIGINAL_FINITE_BUSINESS_PLAN_REQUIRED/);
});

test('missing/null/compensating total or duplicate/partial product pages cannot be called lawful new zero', () => {
  for (const mutate of [
    x => { x.items.find(row => row.totalStock === '0').totalStock = null; },
    x => { x.items[0].totalStock = '17'; x.items[1].totalStock = '4'; },
    x => { x.items.pop(); }, x => { x.items[1] = { ...x.items[0] }; },
    x => { x.exactTotal = 4; }, x => { x.items.find(row => row.totalStock === '0').seasonLabel = null; },
    x => { x.items.find(row => row.totalStock !== '0').supplierLabel = 'invented'; },
  ]) {
    const { plan, page, admissions, stored } = observation(); mutate(page);
    assert.throws(() => assertCurrentRuntimeStockEvidence(plan, page, admissions, stored));
  }
});

test('each actual warehouse needs original POST_CUTOFF_CREATED decision and exact creation operation', () => {
  for (const mutate of [
    x => x.pop(), x => { x[1] = { ...x[0] }; }, x => { x[0].admitted = false; },
    x => { x[0].skuBasis = 'CUTOFF_MEMBER'; }, x => { x[0].skuCreatedOperationId = null; },
    x => { x[0].publishedBatchId = null; }, x => { x[0].warehouseBasis = 'POST_CUTOFF_CREATED'; },
  ]) {
    const { plan, page, admissions, stored } = observation(); mutate(admissions);
    assert.throws(() => assertCurrentRuntimeStockEvidence(plan, page, admissions, stored));
  }
});

test('new SKU stays outside cutoff without stored balance; original creation operation has no ledger posting', () => {
  for (const patch of [{ cutoff_member: true }, { created_operation_id: null }, { balance_rows: '1' }, { creation_operation_ledger_rows: '1' }, { id: 'wrong' }]) {
    const { plan, page, admissions, stored } = observation(); Object.assign(stored[0], patch);
    assert.throws(() => assertCurrentRuntimeStockEvidence(plan, page, admissions, stored));
  }
});

test('caller cannot inject fake issuer/service/authority or extra target switches', async () => {
  for (const field of ['issuer', 'services', 'authorization', 'ownerPool', 'newId']) {
    const f = input(); f.args[field] = {};
    await assert.rejects(runCurrentRuntimeBusiness(f.args)); assert.equal(f.connects(), 0);
  }
});

test('pre-cancel and host budget errors propagate before any issuer connection; no retry/fake PASS', async () => {
  const f = input(), controller = new AbortController(); controller.abort(); f.args.signal = controller.signal;
  await assert.rejects(runCurrentRuntimeBusiness(f.args), { code: 'CURRENT_RUNTIME_BUSINESS_ABORTED' }); assert.equal(f.connects(), 0);
  const g = input(), original = new Error('ORIGINAL_HOST_BUDGET_EXHAUSTED'); g.args.budget.remaining = () => { throw original; };
  await assert.rejects(runCurrentRuntimeBusiness(g.args), error => error === original); assert.equal(g.connects(), 0);
});

test('actual original issuer independently refuses malformed pinned file; no fake brand success', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'current-business-negative-'));
  try {
    const file = path.join(directory, 'not-a-review.json'), bytes = '{}\n';
    await writeFile(file, bytes, { mode: 0o600 });
    const f = input(); f.args.reviewRef = { path: file, sha256: createHash('sha256').update(bytes).digest('hex') };
    await assert.rejects(createNativeRuntime26Issuer(f.args.pool, { reviewFile: file, trustedReviewSha256: f.args.reviewRef.sha256,
      requiredObservation: REQUIRED_OBSERVATION })); assert.equal(f.connects(), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('composition source stays inert and uses original issuer/capacity/authorization/readers with three explicit purposes', async () => {
  const source = await readFile(new URL('./current-runtime-business.mjs', import.meta.url), 'utf8');
  assert.deepEqual(BUSINESS_PURPOSES, ['PRODUCT_MAINTENANCE', 'INVENTORY_ADMISSION', 'PRODUCT_SEASONS_READ']);
  assert.equal(REQUIRED_OBSERVATION, 'HISTORY_DRAFT_SEQUENCE_SYSTEM_ACL_V1');
  for (const original of ['createNativeRuntime26Issuer(rawPool', 'new PostgresPartyUnitOfWork(issuer.pool, null)',
    'new PostgresMaintenanceCommandUnitOfWork(issuer.pool)', 'createSourceConfirmedProductCapacityFactory(issuer.pool, issuer.runtime26)',
    'createSourceConfirmedApplicationReadAuthorization(issuer.pool).productManagement',
    'new PostgresProductManagementQueryReader(issuer.pool, issuer.catalogueRetainedDelete, issuer.productSeasonArray, issuer.runtime26)',
    'sourceConfirmedReadIdentityOn', 'readInventoryKeyAdmissions']) assert.ok(source.includes(original));
  assert.doesNotMatch(source, /new (?:Client|Pool)\s*\(|\b(?:CREATE ROLE|CREATE DATABASE|GRANT ALL|SET ROLE|DISABLE TRIGGER)\b/);
  assert.doesNotMatch(source, /process\.argv|\.listen\s*\(|rawPool\.connect\s*\(/);
});

// E002-only factory identity negatives. No new target, fixture or successful
// issuer is fabricated; original host v3 owns positive factory registration.
test('factory pool brand rejects copied/accessor method shapes before any SQL or getter', async () => {
  let connects = 0; const shape = Object.freeze({ async connect() { connects++; throw Error('MUST_NOT_CONNECT'); } });
  assert.throws(() => assertCurrentRuntimePool(shape), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  assert.throws(() => assertCurrentRuntimePool({ ...shape }), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  let getterReads = 0; const accessor = Object.defineProperty({}, 'connect', { get() { getterReads++; throw Error('MUST_NOT_READ_CONNECT_GETTER'); } });
  const f = input(); f.args.pool = accessor;
  await assert.rejects(runCurrentRuntimeBusiness(f.args), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  assert.equal(getterReads, 0); assert.equal(connects, 0);
});

test('factory pool brand rejects a foreign prototype instance at business boundary before issuer acquisition', async () => {
  const f = input(), foreign = Object.create(f.args.pool); f.args.pool = foreign;
  await assert.rejects(runCurrentRuntimeBusiness(f.args), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  assert.equal(f.connects(), 0);
});

// Finite source-column contract: this custom diagnostic must not expand the
// source335 role just to read its oracle. This is not an actual ACL observation.
test('custom ledger diagnostic uses only source-allowed operation_id and does not claim an all-SKU scan', async () => {
  const source = await readFile(new URL('./current-runtime-business.mjs', import.meta.url), 'utf8');
  const marker = source.indexOf('/* current-business:new-sku-no-synthetic-zero */');
  assert.ok(marker > 0); const diagnostic = source.slice(marker, source.indexOf('])).rows;', marker) + 9);
  const allowed = new Set(['quantity_before', 'quantity_after', 'operation_id']);
  const used = [...diagnostic.matchAll(/\bl\.([a-z_]+)/g)].map(match => match[1]);
  assert.deepEqual(used, ['operation_id']); assert.ok(used.every(column => allowed.has(column)));
  assert.match(diagnostic, /l\.operation_id=\$3::uuid/); assert.doesNotMatch(diagnostic, /l\.sku_id/);
  assert.match(diagnostic, /AS creation_operation_ledger_rows/);
  assert.match(diagnostic, /\[plan\.ids\.sku, fixture\.batchId, plan\.ids\.productOperation\]/);
  assert.ok(source.includes('NOT an all-SKU ledger scan'));
});

// Observation-only seam cases: the work functions below are pure stand-ins,
// never fabricated successful PG services, receipts or issuer capabilities.
test('stage observer records real returned receipt snapshot/hash without replacing or mutating the work result', async () => {
  const events = [], receipt = { status: 'COMMITTED', action: 'CREATE', result: { operationId: 'original-operation', kind: 'PRODUCT', targetId: 'product', version: 1 } };
  const original = structuredClone(receipt); let calls = 0;
  const stages = createBusinessStageObserver(event => {
    events.push(event); assert.equal(Object.isFrozen(event), true);
    if (event.receipt) { assert.notEqual(event.receipt, receipt); assert.equal(Object.isFrozen(event.receipt.result), true); assert.throws(() => { event.receipt.result.version = 999; }); }
    return { fakeReplacement: true };
  }, () => {});
  const returned = await stages.call('PRODUCT_RECEIPT', async () => { calls++; return receipt; });
  assert.equal(returned, receipt); assert.deepEqual(receipt, original); assert.equal(calls, 1);
  assert.deepEqual(events.map(e => [e.sequence, e.stage, e.transition]), [[1, 'PRODUCT_RECEIPT', 'START'], [2, 'PRODUCT_RECEIPT', 'RETURNED']]);
  assert.equal(events[1].action, 'CREATE'); assert.equal(events[1].operationId, 'original-operation');
  assert.deepEqual(events[1].receipt, original); assert.match(events[1].resultHash, /^[a-f0-9]{64}$/);
  assert.equal(events[0].receipt, null); assert.equal(events[0].resultHash, null);
});
test('omitted stage callback preserves exact original promise and performs no observation hash or added active check', async () => {
  const original = Promise.resolve({ original: true }), stages = createBusinessStageObserver(undefined, () => { assert.fail('legacy observer must be inert'); });
  assert.equal(stages.call('ORIGINAL', () => original), original); await original;
});
test('stage failure rethrows the identical original error when logging succeeds; no retry/next command', async () => {
  const events = [], original = Object.assign(new Error('original42501'), { code: '42501' }); let calls = 0, next = 0;
  const stages = createBusinessStageObserver(e => { events.push(e); }, () => {});
  await assert.rejects((async () => { await stages.call('PRODUCT_DETAIL', async () => { calls++; throw original; }); await stages.call('STOCK', async () => { next++; }); })(), e => e === original);
  assert.equal(calls, 1); assert.equal(next, 0); assert.deepEqual(events.map(e => e.transition), ['START', 'FAILED']);
  assert.deepEqual(events[1].error, { code: '42501', message: 'original42501' });
});
test('original work error and failed observation coexist as AggregateError with original cause, neither is hidden', async () => {
  const original = Object.assign(new Error('original work'), { code: '42501' }), logging = new Error('disk observation failed'); let calls = 0;
  const stages = createBusinessStageObserver(e => { if (e.transition === 'FAILED') throw logging; }, () => {});
  await assert.rejects(stages.call('PRODUCT_DETAIL', async () => { calls++; throw original; }), e => e instanceof AggregateError && e.cause === original && e.errors.length === 2 && e.errors[0] === original && e.errors[1] === logging);
  assert.equal(calls, 1);
});
test('START logging failure sends no work; RETURNED logging failure never duplicates an already acknowledged command', async () => {
  const logging = new Error('stage write failed'); let firstCalls = 0, secondCalls = 0, nextCalls = 0;
  const before = createBusinessStageObserver(() => { throw logging; }, () => {});
  await assert.rejects(before.call('SUPPLIER_EXECUTE', async () => { firstCalls++; }), e => e === logging); assert.equal(firstCalls, 0);
  const after = createBusinessStageObserver(e => { if (e.transition === 'RETURNED') throw logging; }, () => {});
  await assert.rejects((async () => { await after.call('SUPPLIER_EXECUTE', async () => { secondCalls++; return { operationId: 'ack' }; }); await after.call('PRODUCT_EXECUTE', async () => { nextCalls++; }); })(), e => e === logging);
  assert.equal(secondCalls, 1); assert.equal(nextCalls, 0);
});
test('pre-cancelled observation invokes neither callback nor command; cancel during START stops the command', async () => {
  const cancelled = Object.assign(new Error('cancelled'), { code: 'CURRENT_RUNTIME_BUSINESS_ABORTED' });
  const pre = new AbortController(); pre.abort(); let callbacks = 0, calls = 0;
  const active = c => () => { if (c.signal.aborted) throw cancelled; };
  const stages = createBusinessStageObserver(() => { callbacks++; }, active(pre));
  await assert.rejects(stages.call('SUPPLIER_EXECUTE', async () => { calls++; }), e => e === cancelled); assert.equal(callbacks, 0); assert.equal(calls, 0);
  const during = new AbortController(), start = createBusinessStageObserver(e => { assert.equal(e.transition, 'START'); during.abort(); }, active(during));
  await assert.rejects(start.call('SUPPLIER_EXECUTE', async () => { calls++; }), e => e === cancelled); assert.equal(calls, 0);
});
test('late cancellation preserves an actual returned ACK stage but prevents every later command', async () => {
  const controller = new AbortController(), cancelled = new Error('late cancellation'), events = []; let calls = 0, next = 0;
  const stages = createBusinessStageObserver(e => { events.push(e); }, () => { if (controller.signal.aborted) throw cancelled; });
  await assert.rejects((async () => {
    await stages.call('PRODUCT_EXECUTE', async () => { calls++; controller.abort(); return { operationId: 'real-returned-ack', version: 1 }; });
    await stages.call('PRODUCT_RECEIPT', async () => { next++; });
  })(), e => e === cancelled);
  assert.equal(calls, 1); assert.equal(next, 0); assert.deepEqual(events.map(e => e.transition), ['START', 'RETURNED']); assert.equal(events[1].operationId, 'real-returned-ack');
});
test('onStage accessor/nonfunction input refuses without reading getter, connecting, or manufacturing a pool brand', async () => {
  for (const value of [undefined, null, 1, false, {}, 'callback']) { const f = input(); f.args.onStage = value; await assert.rejects(runCurrentRuntimeBusiness(f.args), /TRUSTED_BUSINESS_STAGE_CALLBACK_REQUIRED/); assert.equal(f.connects(), 0); }
  const f = input(); Object.defineProperty(f.args, 'onStage', { enumerable: true, get() { assert.fail('onStage accessor invoked'); } }); await assert.rejects(runCurrentRuntimeBusiness(f.args)); assert.equal(f.connects(), 0);
  const g = input(); let events = 0; g.args.onStage = () => { events++; }; await assert.rejects(runCurrentRuntimeBusiness(g.args), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/); assert.equal(events, 0); assert.equal(g.connects(), 0);
});
test('business stage wiring wraps only original method calls in original order and exposes no issuer/pool/client to callback', async () => {
  const source = await readFile(new URL('./current-runtime-business.mjs', import.meta.url), 'utf8');
  const ordered = ['ISSUER_CREATE', 'IDENTITY_AND_REQUIRED_PURPOSES', 'SUPPLIER_EXECUTE', 'SUPPLIER_RECEIPT', 'PRODUCT_EXECUTE', 'PRODUCT_RECEIPT', 'PRODUCT_DETAIL', 'ALL_WAREHOUSE_STOCK_LIST', 'NEW_SKU_ADMISSION_AND_STORED_ZERO'];
  const offsets = ordered.map(stage => { const index = source.indexOf("stages.call('" + stage + "'"); assert.ok(index > 0, stage); return index; }); assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
  assert.match(source, /await onStage\(event\)/); assert.match(source, /structuredClone\(value\)/); assert.match(source, /receipt: typeof status === 'string' \? snapshot : null/);
  assert.doesNotMatch(source, /onStage\([^)]*(?:issuer|rawPool|client|plan\.ids)/);
});

test('late-cancel/budget original cause is retained alongside a simultaneous stage logger failure', async () => {
  const cancelled = Object.assign(new Error('original late cancel'), { code: 'CURRENT_RUNTIME_BUSINESS_ABORTED' }), logging = new Error('logger failed');
  const controller = new AbortController(); let calls = 0;
  const stages = createBusinessStageObserver(e => { if (e.transition === 'RETURNED') throw logging; }, () => { if (controller.signal.aborted) throw cancelled; });
  await assert.rejects(stages.call('PRODUCT_EXECUTE', async () => { calls++; controller.abort(); return { operationId: 'returned' }; }), e => e instanceof AggregateError && e.cause === cancelled && e.errors[0] === cancelled && e.errors[1] === logging);
  assert.equal(calls, 1);
});

// These are negative/source-wiring proofs only: genuine successful context
// creation requires the actual original issuer and PG flow, not a test mint.
test('finite context rejects primitives, serialized shapes, inherited shapes and proxies without accessing getters', () => {
  let accessed = 0;
  const forged = Object.freeze({ format: 'RAM_ONLY_VERIFIED_FINITE_BUSINESS_CONTEXT_V1' });
  const getter = Object.defineProperty({}, 'format', { get() { accessed++; throw Error('getter'); } });
  const proxy = new Proxy(forged, { get() { accessed++; throw Error('proxy'); } });
  for (const value of [null, undefined, true, 0, '', Symbol('context'), forged,
    JSON.parse(JSON.stringify(forged)), structuredClone(forged), Object.create(forged), getter, proxy]) {
    assert.throws(() => assertCurrentRuntimeBusinessContext(value), /ORIGINAL_VERIFIED_FINITE_BUSINESS_CONTEXT_REQUIRED/);
    assert.throws(() => currentRuntimeBusinessContextData(value), /ORIGINAL_VERIFIED_FINITE_BUSINESS_CONTEXT_REQUIRED/);
  }
  assert.equal(accessed, 0);
});
test('both entry points reject the same forged pool before issuer, connect or events; no context on rejection', async () => {
  for (const run of [runCurrentRuntimeBusiness, runCurrentRuntimeBusinessWithContext]) {
    const f = input(); let events = 0, fulfilled = false;
    f.args.onStage = () => { events++; };
    const promise = run(f.args); assert.ok(promise instanceof Promise);
    await assert.rejects(promise.then(value => { fulfilled = true; return value; }), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
    assert.equal(events, 0); assert.equal(f.connects(), 0); assert.equal(fulfilled, false);
    // Extra public arguments cannot replace the private retention mode or issuer.
    await assert.rejects(run(f.args, { issuer: {}, retainContext: true }), /ORIGINAL_CAPTURED_CURRENT_RUNTIME_POOL_REQUIRED/);
  }
});
test('context forwarding preserves rejected input, original budget error identity and pre-cancellation without work', async () => {
  for (const run of [runCurrentRuntimeBusiness, runCurrentRuntimeBusinessWithContext]) {
    let promise; assert.doesNotThrow(() => { promise = run(undefined); }); await assert.rejects(promise);
    const f = input(), original = new Error('original finite budget failure');
    f.args.budget.remaining = () => { throw original; };
    await assert.rejects(run(f.args), error => error === original); assert.equal(f.connects(), 0);
    const g = input(), abort = new AbortController(); abort.abort(); g.args.signal = abort.signal;
    await assert.rejects(run(g.args), /CURRENT_RUNTIME_BUSINESS_ABORTED/); assert.equal(g.connects(), 0);
  }
});
test('context is minted only after original complete evidence and default returns unchanged result without mint or extra await', async () => {
  const source = await readFile(new URL('./current-runtime-business.mjs', import.meta.url), 'utf8');
  assert.equal(runCurrentRuntimeBusiness.constructor.name, 'AsyncFunction'); assert.equal(runCurrentRuntimeBusiness.name, 'runCurrentRuntimeBusiness'); assert.equal(runCurrentRuntimeBusiness.length, 1);
  assert.match(source, /export function runCurrentRuntimeBusinessWithContext\(input\) \{ return runCurrentRuntimeBusiness\(input, retainFiniteBusinessContext\); \}/);
  assert.equal((source.match(/finiteBusinessContexts\.set\(/g) ?? []).length, 1);
  const evidence = source.lastIndexOf('assertCurrentRuntimeStockEvidence(plan, page, witness.admissions, witness.stored);');
  const originalResult = source.indexOf("const result = freeze({ format: 'FINITE_CURRENT_RUNTIME_BUSINESS_RESULT_V1'");
  const defaultReturn = source.indexOf('if (contextToken !== retainFiniteBusinessContext) return result;');
  const mint = source.indexOf('finiteBusinessContexts.set(');
  assert.ok(evidence > 0 && evidence < originalResult && originalResult < defaultReturn && defaultReturn < mint);
  assert.doesNotMatch(source.slice(evidence), /\bawait\b/);
  assert.match(source.slice(defaultReturn), /Object\.freeze\(\{ format: 'RAM_ONLY_VERIFIED_FINITE_BUSINESS_CONTEXT_V1' \}\)/);
  assert.match(source.slice(defaultReturn), /Object\.freeze\(\{ issuer, actor, fixture, plan, result \}\)/);
  assert.doesNotMatch(source.slice(originalResult, defaultReturn), /(?:context|issuer|rawPool|fixture[, }])/);
});
