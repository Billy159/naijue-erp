/** PURE source/input/negative protocol tests. No fake successful issuer, actual
 * CREATE, SQL, PG plan/timing or product101 readiness is claimed by this suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReferenceFixture } from './fixture.mjs';
import { createNativeScalePlan, createNativeScaleBudgetGate, assertNativeScaleProductEvidence,
  assertNativeScalePages, assertNativeScaleZeroEvidence, assertNativeScaleSkuSet, assertNativeScaleContext, nativeScaleContextData,
  runCurrentRuntimeNativeScale, NATIVE_SCALE_BUDGET } from './current-runtime-native-scale.mjs';
import { createBusinessStageObserver } from './current-runtime-business.mjs';
import { parseProductMaintenanceCommandV2 } from '../../../../../packages/application/src/product-maintenance-validation.ts';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
const make = () => { const fixture = buildReferenceFixture(); return { fixture, plan: createNativeScalePlan(fixture) }; };
const allUuid = input => { const set = new Set(); const visit = x => {
  if (typeof x === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)) set.add(x);
  else if (x && typeof x === 'object') Object.values(x).forEach(visit);
}; visit(input); return set; };
function detailObservation(plan, row) {
  const executed = { operationId: row.ids.operation, kind: 'PRODUCT', targetId: row.ids.product, version: 1 };
  const receipt = { requestKey: row.command.requestKey, action: 'CREATE', status: 'COMMITTED', completedAt: '2026-11-01T00:00:00.000Z', result: executed };
  const detail = { version: 1, values: structuredClone(row.command.values),
    skus: [{ ...row.command.skus[0], id: row.ids.sku, expectedVersion: null }],
    references: { supplier: { id: plan.base.ids.supplier, name: plan.base.supplierName, enabled: true } },
    barcodes: [{ id: row.ids.barcode, barcode: row.predictedMainBarcode, colorId: row.command.skus[0].colorId,
      fitId: row.command.skus[0].fitId, sizeId: row.command.skus[0].sizeId, kind: 'MAIN', schemeId: row.command.values.defaultBarcodeSchemeId, enabled: true }] };
  return { executed, receipt, detail, supplier: { partyId: plan.base.ids.supplier } };
}
function pages(plan) { const items = rows => rows.map(row => ({ id: row.id, code: row.code, totalStock: row.stock, retailPrice: row.price,
  supplierLabel: plan.commands.some(c => c.ids.product === row.id) ? plan.base.supplierName : null,
  seasonLabel: plan.commands.some(c => c.ids.product === row.id) ? plan.base.seasonName : null,
  fits: row.noSku ? [] : [{ id: plan.base.product.skus[0].fitId, label: 'SYNTHETIC FIT' }] }));
  return [{ page: 1, pageSize: 100, exactTotal: 101, items: items(plan.expected.slice(0,100)) },
    { page: 2, pageSize: 100, exactTotal: 101, items: items(plan.expected.slice(100)) }]; }
function zeros(plan) { return { stored: plan.commands.map(row => ({ id: row.ids.sku, product_id: row.ids.product,
  created_operation_id: row.ids.operation, cutoff_member: false, balance_rows: '0', creation_operation_ledger_rows: '0' })),
  admissions: plan.commands.flatMap(row => plan.base.warehouseIds.map(warehouseId => ({ warehouseId, skuId: row.ids.sku,
    admitted: true, publishedBatchId: plan.base.batchId, warehouseBasis: 'CUTOFF_MEMBER', warehouseCreatedOperationId: null,
    skuBasis: 'POST_CUTOFF_CREATED', skuCreatedOperationId: row.ids.operation }))) }; }
function offlineInput() { let reads=0; return { input: { pool: Object.defineProperty({}, 'connect', { get() { reads++; throw Error('NO_POOL_GETTER'); } }),
  fixture: buildReferenceFixture(), reviewRef: { path: '/tmp/NEVER_NATIVE_SCALE_ISSUER_REVIEW.json', sha256:'a'.repeat(64) },
  budget: { remaining: () => 1_200_000 }, signal: new AbortController().signal }, reads: () => reads }; }

test('exact101 means retained3 including disabled/noSKU + firstoriginal1 + append97; original pages100+1, not selected3+97', () => {
  const {fixture, plan}=make(); assert.equal(plan.commands.length,98); assert.equal(plan.appendCommandCount,97);
  assert.equal(plan.expectedProducts,101); assert.equal(plan.expectedSkus,101); assert.equal(plan.retainedProductCount,3); assert.equal(plan.retainedSkuCount,3);
  assert.equal(plan.expected.find(row=>row.id===fixture.reference.disabledProductId).noSku,true);
  assert.equal(plan.page1Ids.length,100); assert.equal(plan.page2Ids.length,1); assert.equal(plan.page2Ids[0],plan.commands.at(-1).ids.product);
  assert.deepEqual(Object.values(plan.globalQuery.filter),Array(8).fill([])); assert.equal(plan.globalQuery.pageSize,100);
  assert.equal(plan.base.query.filter.productIds.length,3); assert.equal(plan.base.query.filter.productIds.includes(fixture.reference.disabledProductId),false);
  assert.equal(plan.authority,'NONE'); assert.equal(plan.performanceAcceptance,false); assert.equal(plan.newBalanceRowsToInsert,0);
});

test('planner reproduces draft97 exact commands/IDs/barcode inputs and real parser without retaining external absolute imports', () => {
  const {fixture,plan}=make(), before=structuredClone(fixture);
  assert.deepEqual(createNativeScalePlan(fixture),plan); assert.deepEqual(fixture,before);
  assert.equal(plan.commands[1].command.values.systemItemCode,'8000000'); assert.equal(plan.commands.at(-1).command.values.systemItemCode,'8000096');
  for(const row of plan.commands) { assert.deepEqual(parseProductMaintenanceCommandV2(row.command),row.command);
    assert.equal(row.commandInputSha256,requestHash(row.command)); assert.equal(row.command.barcodes.length,0);
    assert.equal(row.command.values.supplierId,plan.base.ids.supplier); assert.equal(Object.keys(row.command.values.prices).length,9);
    assert.equal(row.predictedMainBarcode,'5A'+row.command.values.systemItemCode+'001900'); assert.equal(row.predictedMainBarcode.length,15);
    assert.equal(Object.isFrozen(row.command.values.prices),true); }
});

test('all388 append allocated IDs/97 requestKeys/product codes/SKU codes/MAINs are unique, disjoint fixture + first seven', () => {
  const {fixture,plan}=make(), held=allUuid(fixture); Object.values(plan.base.ids).forEach(x=>held.add(x));
  const append=plan.commands.slice(1), ids=append.flatMap(row=>Object.values(row.ids));
  assert.equal(ids.length,388); assert.equal(new Set(ids).size,388); assert.ok(ids.every(id=>!held.has(id)));
  for(const field of [r=>r.command.requestKey,r=>r.command.values.productCode,r=>r.command.skus[0].skuCode,r=>r.predictedMainBarcode])
    assert.equal(new Set(plan.commands.map(field)).size,98);
  assert.throws(()=>createNativeScalePlan(structuredClone(fixture)),/ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED/);
});

test('original product return is not COMMITTED until exact original requestKey receipt and detail match', () => {
  const {plan}=make(); for(const row of [plan.commands[0],plan.commands[1],plan.commands.at(-1)]) {
    const o=detailObservation(plan,row); assert.doesNotThrow(()=>assertNativeScaleProductEvidence(plan,row,o.executed,o.receipt,o.detail,o.supplier));
    for(const mutate of [x=>{x.receipt.status='RETURNED';},x=>{x.receipt.requestKey='other';},x=>{x.receipt.action='EDIT';},
      x=>{x.receipt.result={...x.executed,operationId:plan.base.ids.supplierOperation};},x=>{x.detail.barcodes[0].barcode='guessed';},
      x=>{x.detail.skus[0].id=plan.base.ids.sku;},x=>{x.detail.values.prices.retail_price='0.00';},
      x=>{x.detail.references.supplier.enabled=false;},x=>{x.detail.barcodes=[];},x=>{x.receipt.completedAt=null;}]) {
      const bad=structuredClone(o);mutate(bad);
      // First row SKU id already equals base; skip this one no-op mutation case.
      if(JSON.stringify(bad)===JSON.stringify(o))continue;
      assert.throws(()=>assertNativeScaleProductEvidence(plan,row,bad.executed,bad.receipt,bad.detail,bad.supplier));
    }
  }
  const row=plan.commands[1],o=detailObservation(plan,row);
  assert.throws(()=>assertNativeScaleProductEvidence(structuredClone(plan),row,o.executed,o.receipt,o.detail,o.supplier),/ORIGINAL_NATIVE_SCALE_PLAN_REQUIRED/);
  assert.throws(()=>assertNativeScaleProductEvidence(plan,structuredClone(row),o.executed,o.receipt,o.detail,o.supplier),/ORIGINAL_NATIVE_SCALE_COMMAND_ROW_REQUIRED/);
});

test('global original all-scope includes disabled/noSKU row and exact numbered pages/order; no narrowed total or compensating stock', () => {
  const {plan}=make(), p=pages(plan); assert.doesNotThrow(()=>assertNativeScalePages(plan,...p));
  for(const change of [x=>x[0].items.reverse(),x=>{x[1].page=1;},x=>{x[0].exactTotal=100;},x=>{x[1].items=[];},
    x=>{x[0].items[0].totalStock=null;},x=>{x[0].items[0].totalStock='17';x[0].items[1].totalStock='4';},
    x=>{x[0].items.find(r=>r.fits.length===0).fits=[{id:'invented',label:'fit'}];},x=>{x[1].items[0]={...x[0].items[0]};}]) {
    const bad=structuredClone(p);change(bad);assert.throws(()=>assertNativeScalePages(plan,...bad)); }
});

test('all196 actual admissions and98 actual ordered stored rows require each op, lawful0, no cutoff member/balance/ledger',()=>{
  const {plan}=make(),z=zeros(plan);assert.doesNotThrow(()=>assertNativeScaleZeroEvidence(plan,z.admissions,z.stored));
  for(const mutate of [x=>x.admissions.pop(),x=>{x.admissions[1]={...x.admissions[0]};},x=>{x.admissions[100].admitted=false;},
    x=>{x.admissions[100].skuCreatedOperationId=null;},x=>{x.stored[90].balance_rows='1';},x=>{x.stored[90].creation_operation_ledger_rows='1';},
    x=>{x.stored[90].cutoff_member=true;},x=>{x.stored[90].created_operation_id=null;},x=>x.stored.reverse(),x=>{x.stored[0].balance_rows=null;}]) {
    const bad=structuredClone(z);mutate(bad);assert.throws(()=>assertNativeScaleZeroEvidence(plan,bad.admissions,bad.stored)); }
});

test('all101 actual SKU identities must equal retained3 plus service98, with original creation-operation provenance',()=>{
  const {plan}=make();assert.doesNotThrow(()=>assertNativeScaleSkuSet(plan,structuredClone(plan.expectedSkuRows)));
  assert.equal(plan.expectedSkuRows.length,101);assert.equal(plan.expectedSkuRows.filter(r=>r.created_operation_id===null).length,3);
  for(const mutate of [x=>x.pop(),x=>x.push({...x[0]}),x=>x.reverse(),x=>{x[0].created_operation_id='invented';},x=>{x[0].product_id=x[1].product_id;}]) {
    const bad=structuredClone(plan.expectedSkuRows);mutate(bad);assert.throws(()=>assertNativeScaleSkuSet(plan,bad)); }
});

test('budget gate refuses next CREATE below conservative fixed floor; successful current-run cycles only raise threshold',()=>{
  let remaining=1_200_000; const signal=new AbortController().signal,gate=createNativeScaleBudgetGate({budget:{remaining:()=>remaining},signal});
  const floor=NATIVE_SCALE_BUDGET.minimumNextCycleMs+NATIVE_SCALE_BUDGET.finalReserveMs;
  assert.equal(gate.beforeCreate().requiredMs,floor);remaining=floor-1;assert.equal(gate.beforeCreate().mayStart,false);
  remaining=floor;assert.equal(gate.beforeCreate().mayStart,true);gate.completedCycle(100_000);
  assert.equal(gate.beforeCreate().requiredMs,260_000);assert.equal(gate.beforeCreate().mayStart,false);
  remaining=300_000;gate.completedCycle(1);assert.equal(gate.beforeCreate().requiredMs,260_000);
  assert.equal(gate.beforeCreate().successfulCycles,2);assert.equal(gate.beforeCreate().guaranteeAll97Fit,false);
  assert.equal(gate.beforeFinalReads().mayStart,true);remaining=59_999;assert.equal(gate.beforeFinalReads().mayStart,false);
});

test('budget refusal causes no next work; no wall-time extension/retry, partial ACK list is not PASS',async()=>{
  let remaining=180_000, calls=0;const gate=createNativeScaleBudgetGate({budget:{remaining:()=>remaining},signal:new AbortController().signal});
  const observed=[];
  // Pure consumer of exact production helper, NOT an injected successful service/issuer.
  for(let index=0;index<97;index++){if(!gate.beforeCreate().mayStart)break;calls++;observed.push(index);gate.completedCycle(50);remaining=179_999;}
  assert.equal(calls,1);assert.deepEqual(observed,[0]);assert.equal(gate.beforeCreate().mayStart,false);
});

test('expired budget and cancellation remain original errors, not partial READY/NOT_READY; no clock reset',()=>{
  const original=Object.assign(Error('absolute deadline'),{code:'EXPIRED'}),controller=new AbortController();
  const gate=createNativeScaleBudgetGate({budget:{remaining(){throw original;}},signal:controller.signal});
  assert.throws(()=>gate.beforeCreate(),e=>e===original);controller.abort();assert.throws(()=>gate.beforeCreate(),/CURRENT_RUNTIME_BUSINESS_ABORTED/);
  for(const n of [NaN,Infinity,0,-1])assert.throws(()=>createNativeScaleBudgetGate({budget:{remaining:()=>n},signal:new AbortController().signal}).beforeCreate());
});

test('pre-cancelled original stage sends no work; late cancel preserves returned receipt but prohibits next command',async()=>{
  const c=new AbortController(),events=[];let calls=0;
  const active=()=>{if(c.signal.aborted)throw Object.assign(Error('cancelled'),{code:'CANCELLED'});};
  const stages=createBusinessStageObserver(e=>{events.push(e);},active);
  c.abort();await assert.rejects(stages.call('PRODUCT_EXECUTE',async()=>{calls++;}),/cancelled/);assert.equal(calls,0);
  const d=new AbortController(),late=[];let work=0;const second=createBusinessStageObserver(e=>{late.push(e);},()=>{if(d.signal.aborted)throw Error('late cancel');});
  const receipt={status:'COMMITTED',action:'CREATE',operationId:'actual'};
  await assert.rejects(second.call('PRODUCT_RECEIPT',async()=>{work++;d.abort();return receipt;}),/late cancel/);
  assert.equal(late.at(-1).transition,'RETURNED');assert.equal(late.at(-1).receipt.status,'COMMITTED');
  await assert.rejects(second.call('PRODUCT_EXECUTE',async()=>{work++;}),/late cancel/);assert.equal(work,1);
});

test('unknown original COMMIT error and observation error preserve both causes, one invocation, no replay',async()=>{
  const original=Object.assign(Error('lost COMMIT ACK'),{code:'SOURCE_UNKNOWN'}),logging=Error('stage write failed');let calls=0;
  const events=[];const stages=createBusinessStageObserver(e=>{events.push(e);if(e.transition==='FAILED')throw logging;},()=>{});
  await assert.rejects(stages.call('PRODUCT_EXECUTE',async()=>{calls++;throw original;}),e=>e instanceof AggregateError&&e.cause===original&&e.errors[0]===original&&e.errors[1]===logging);
  assert.equal(calls,1);assert.deepEqual(events.map(e=>e.transition),['START','FAILED']);
});

test('stage observer callback cannot replace genuine result, captures no hidden issuer and omitting observer stays original promise',async()=>{
  const actual={operationId:'actual'},hiddenIssuer={secret:'NEVER_IN_RESULT_OR_EVENT'},events=[];
  const stages=createBusinessStageObserver(e=>{events.push(e);return hiddenIssuer;},()=>{});
  assert.equal(await stages.call('PRODUCT_EXECUTE',async()=>actual),actual);
  assert.doesNotMatch(JSON.stringify(events),/NEVER_IN_RESULT_OR_EVENT/);assert.equal(events.at(-1).resultHash,requestHash(actual));
  const original=Promise.resolve(actual);assert.equal(createBusinessStageObserver(undefined,()=>{}).call('PRODUCT_EXECUTE',()=>original),original);
  for(const value of [{format:'RAM_ONLY_ORIGINAL_NATIVE_SCALE_CONTEXT_V1'},null,{},JSON.parse('{"format":"RAM_ONLY_ORIGINAL_NATIVE_SCALE_CONTEXT_V1"}')]) {
    assert.throws(()=>assertNativeScaleContext(value),/ORIGINAL_READY_NATIVE_SCALE_CONTEXT_REQUIRED/);
    assert.throws(()=>nativeScaleContextData(value),/ORIGINAL_READY_NATIVE_SCALE_CONTEXT_REQUIRED/);
  }
});

test('shape-only pool, fixture, review accessors, callbacks and injected services fail BEFORE any connect getter',async()=>{
  for(const change of [x=>{},x=>{x.issuer={};},x=>{x.newId=()=>'';},x=>{x.service={};},x=>{x.fixture=structuredClone(x.fixture);},
    x=>{x.onStage={};},x=>{Object.defineProperty(x,'onStage',{enumerable:true,get(){throw Error('ACCESSOR_MUST_NOT_RUN');}});},
    x=>{Object.defineProperty(x.reviewRef,'sha256',{enumerable:true,get(){throw Error('ACCESSOR_MUST_NOT_RUN');}});}]) {
    const {input,reads}=offlineInput();change(input);await assert.rejects(runCurrentRuntimeNativeScale(input));assert.equal(reads(),0); }
});

test('source remains real once-only issuer/services/registered UOW/capacity; no raw writes/engine or authority injection',async()=>{
  const source=await readFile(new URL('./current-runtime-native-scale.mjs',import.meta.url),'utf8');
  assert.equal((source.match(/await createNativeRuntime26Issuer\(/g)||[]).length,1);
  for(const needed of ['products.executeV2(actor, row.command, signal)','products.receipt(actor, row.command.requestKey)',
    'new PostgresMaintenanceCommandUnitOfWork(issuer.pool)','maintenanceContextClient(context, issuer.pool)',
    'createSourceConfirmedProductCapacityFactory(issuer.pool, issuer.runtime26)','newId: finiteIds({ product: row.ids.product',
    "requiredObservation: REQUIRED_OBSERVATION",'assertCurrentRuntimePool(rawPool)',"status: ready ? 'READY_FINITE_NATIVE_PRODUCT101_NOT_PERFORMANCE'"])
    assert.ok(source.includes(needed),needed);
  assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE naijue_erp|DELETE FROM|GRANT |new (?:Pool|Client)\(|process\.argv|setTimeout\()/);
  assert.ok(source.indexOf('pause = await pauseIfNeeded(); if (pause) return pause;',source.indexOf('for (const row of plan.commands)'))<source.indexOf('products.executeV2'));
  assert.match(source,/contexts\.set\(context, Object\.freeze\(\{ issuer, actor, fixture, plan, result \}\)\)/);assert.doesNotMatch(source,/return (?:freeze\()?\{[^\n]*issuer[,}]/);
});
