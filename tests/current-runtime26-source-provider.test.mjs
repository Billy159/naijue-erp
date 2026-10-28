import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as module from './integration/current-runtime26-source-provider.mjs';
import { captureNativeSourceProvider26 } from '../scripts/import-v3/production-source-host.mjs';
import { stableImportId } from '../packages/application/src/inventory-cutoff-import.ts';
import { historySettlementRequestHash } from '../packages/application/src/import-v3-history-settlement.ts';
import { buildCurrentRuntime26SalesBlueprint, CURRENT_SALES_QA_TARGET } from './integration/current-runtime26-sales-fixture.ts';
import { buildCurrentRuntime26FullSourceFixture } from './integration/current-runtime26-full-source-fixture.ts';
const sha=s=>createHash('sha256').update(s).digest('hex'),H=c=>c.repeat(64),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const binding=()=>({version:'NATIVE_IMPORT_EXECUTION_26_V1',phase:'FULL_SOURCE_CONTINUATION_26_V1',batchId:'e2dfa367-7cda-42d2-9726-f7cc52124cf1',actorAccountId:id(1),fixedSourceNamespace:'synthetic.qa897.sales.20261029',cutoffAt:'2026-10-29T00:00:00.000Z',selectionSha256:H('2'),authorizedPayloadHash:H('3'),coreReceiptId:id(2),coreSourceDigest:H('4'),target:{database:CURRENT_SALES_QA_TARGET,role:'SYNTHETIC_PREPARATION_ROLE',serverAddress:'127.0.0.1',serverPort:5432,postmasterStartedAt:'synthetic'}});
const sourceFixture=buildCurrentRuntime26FullSourceFixture(buildCurrentRuntime26SalesBlueprint({database:CURRENT_SALES_QA_TARGET,batchId:binding().batchId,now:binding().cutoffAt,pins:{baseManifestSha256:H('1'),selectionSha256:H('2'),approvalSha256:H('3'),occurrenceContractSha256:H('4')}}));
async function scratch(t){const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-qa897-source-provider-'));t.after(()=>rm(dir,{recursive:true,force:true}));let n=0;const save=async(value,name)=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value)),path=join(dir,name??`${n++}.json`);await writeFile(path,bytes);return {path,bytes:bytes.length,sha256:sha(bytes)};};return {dir,save};}
async function capture(t,entity,mutate){
 const f=await sourceFixture,b=binding(),s=await scratch(t),input=structuredClone(entity==='BARCODE'?f.barcodeInput:f.salesHeaderInput),original=structuredClone(input),source=original.source;
 const sourceFile={logicalPath:source.fileRef,...await s.save(f.sourceFiles[source.fileRef].utf8)};
 const originals=await s.save([{rawLine:f.rawArtifacts[entity+':'+source.sourceKey].utf8.trimEnd(),sourceFile}]);
 const canonicalCsv=await s.save(f.sources[entity].utf8);
 const references=entity==='BARCODE'?{sku:original.sku,scheme:original.scheme}:{bindings:original.bindings,creatorHallOverlay:original.creatorHallOverlay,temporalEvidence:original.temporalEvidence??{}};
 const nativeBindings=await s.save([{sourceKey:source.sourceKey,sourceRowId:source.id,nativeId:entity==='BARCODE'?original.nativeBarcodeId:f.prepared.salesHeaders.rows[0].prepared.header.id,references}]);
 if(mutate)mutate(input);
 const records=await s.save([input]);
 // Temporary component review fixtures test the source-only consumer. They
 // confer no real C execution grant and never reach a database or publisher.
 const independentReview=await s.save({result:'PASS',scope:'UNIT_SOURCE_PROTOCOL_ONLY_NOT_EXECUTION',recordsSha256:records.sha256,originalsSha256:originals.sha256,nativeBindingsSha256:nativeBindings.sha256});
 const review=await s.save({version:'C_QA897_CAPTURE_SOURCE26_REVIEW_V1',decision:'ACCEPT_EXACT_SOURCE_NATIVE_PROJECTIONS',binding:{batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,cutoffAt:b.cutoffAt,selectionSha256:b.selectionSha256},entity,records,originals,canonicalCsv,nativeBindings,independentReview,realImportExecutionAuthorized:false});
 return {...s,fixture:f,b,recipe:{mode:'QA_CAPTURE',review,records,originals,canonicalCsv,nativeBindings},sourceFile,input};
}
const collect=async iterator=>{const rows=[];for await(const row of iterator)rows.push(row);return rows;};
const scope=b=>({batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,authorizedPayloadHash:b.authorizedPayloadHash});

test('QA22 provider exposes exact original host protocol and rejects broader targets/purposes',()=>{
 const captured=captureNativeSourceProvider26(module,'FULL_SOURCE_CONTINUATION_26_V1');assert.equal(captured.sourceGroups.length,11);assert.equal(captured.openSourceSession,module.openSourceSession);
 module.validateQa22Binding(binding());
 for(const change of [{phase:'CORE_INITIALIZATION_26_V1'},{batchId:id(9)},{fixedSourceNamespace:'production'},{authorizedPayloadHash:binding().coreSourceDigest},{target:{...binding().target,database:'production'}}])assert.throws(()=>module.validateQa22Binding({...binding(),...change}));
});
test('QA22 source session requires an external execution pin before any factory/CORE/DB access',async t=>{
 let borrowed=0;const context={binding:binding(),sources:{},database:{ready(){borrowed++;throw Error('MUST_NOT_ACTIVATE');}},signal:new AbortController().signal};
 await assert.rejects(module.createQa22SourceSession(context),/EXTERNAL_PINS/);assert.equal(borrowed,0);
 const s=await scratch(t),producers=Object.fromEntries(module.sourceGroups.map(g=>[g,{}]));
 const input={version:'QA897_FULL_SOURCE_PROVIDER26_INPUT_V1',binding:binding(),core:{},closureScope:{},warehouses:[],producers,productEvidence:{},coreProjection:{},initialization:{},preparation:{},money:{},executionAuthorization:{path:join(s.dir,'NOT_OPENED'),bytes:1,sha256:H('b')}};
 const ref=await s.save(input);
 await assert.rejects(module.createQa22SourceSession({...context,inputFile:ref.path,trustedInputSha256:ref.sha256,executionAuthorizationSha256:H('c')}),/C_EXECUTION_PIN/);assert.equal(borrowed,0);
 const changed=await s.save({...input,executionAuthorization:{path:join(s.dir,'NOT_OPENED'),bytes:1,sha256:H('b')}});
 await assert.rejects(module.createQa22SourceSession({...context,inputFile:changed.path,trustedInputSha256:H('d'),executionAuthorizationSha256:H('b')}),/FILE_CHANGED/);assert.equal(borrowed,0);
});
test('QA22 literal barcode capture rederives original source/canonical/native binding and six real schemes',async t=>{
 const f=await capture(t,'BARCODE'),signal=new AbortController(),r=await module.openReviewedQa22Capture(f.recipe,f.b,signal.signal);t.after(()=>r.close());
 const rows=await collect(r.rows());assert.equal(rows.length,1);await r.authorize(rows[0]);assert.equal(rows[0].nativeBarcode.barcode,'897000000000001');
 const c=await r.openClosure(scope(f.b),{group:'BARCODES',signal:signal.signal});assert.equal((await collect(c.sourceRows())).length,1);assert.equal((await collect(c.typedRows())).length,7);await c.close();
 const wrong=structuredClone(rows[0]);wrong.nativeBarcode.sku_id=id(999);await assert.rejects(r.authorize(wrong));
 await r.close();await assert.rejects(r.authorize(rows[0]),/CLOSED/);
});
test('QA22 source review/record hash cannot substitute altered raw cells or native identities',async t=>{
 for(const mutate of [i=>{i.source.rawFields.条码='changed';},i=>{i.sku.nativeId=id(999);}]){
  const f=await capture(t,'BARCODE',mutate);await assert.rejects(module.openReviewedQa22Capture(f.recipe,f.b,new AbortController().signal),/ORIGINAL_CHANGED|NATIVE_BINDING/);
 }
});
test('QA22 capture fails on physical original changes and cancellation without exposing a target',async t=>{
 const f=await capture(t,'BARCODE'),controller=new AbortController(),r=await module.openReviewedQa22Capture(f.recipe,f.b,controller.signal);t.after(()=>r.close());
 await writeFile(f.sourceFile.path,'tampered original');await assert.rejects(r.verify(),/FILE_CHANGED/);
 const second=await capture(t,'BARCODE'),cancel=new AbortController(),reader=await module.openReviewedQa22Capture(second.recipe,second.b,cancel.signal);t.after(()=>reader.close());cancel.abort();await assert.rejects(reader.authorize(second.fixture.prepared.barcode),/CLOSED/);
});
test('QA22 sales header is source-backed DRAFT16.00 with literal hall/customer/staff and real document closure',async t=>{
 const f=await capture(t,'SALES_HEADER'),controller=new AbortController(),r=await module.openReviewedQa22Capture(f.recipe,f.b,controller.signal);t.after(()=>r.close());
 const chunks=await collect(r.chunks());assert.equal(chunks.length,1);await r.authorize(chunks[0]);const h=chunks[0].rows[0].prepared.header;assert.equal(h.sourceStatus,'DRAFT');assert.equal(h.grossAmount,'16.00');assert.equal(h.approvedLocalAt,null);
 const child=await r.openClosure(scope(f.b),{group:'HEADERS',signal:controller.signal});assert.equal((await collect(child.sourceRows())).length,1);assert.equal((await collect(child.typedRows())).length,1);assert.equal((await collect(child.documents())).length,1);await child.close();
 await assert.rejects(r.openClosure({...scope(f.b),batchId:id(100)},{group:'HEADERS',signal:controller.signal}),/CLOSURE_SCOPE/);
});

/** Pure command-selector fixtures only. These never represent an observed
 * CORE transaction; the real provider has no caller-supplied progress port. */
function continuation(bound){
 const b=binding(),counts={WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected={WAREHOUSE:22,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:1},birth={sequence:1,cursor:22,counts,expected:{}},init={...birth,sequence:2},fullBinding={source:'UNIT_COMMAND_SELECTOR_ONLY',inventoryExpectedCounts:expected};
 const commands=[{action:'IMPORT_BIND_FULL_SOURCE',actorAccountId:b.actorAccountId,batchId:b.batchId,requestKey:'UNIT-BIND',expectedSequence:2,expectedCursor:22,fullBinding},{action:'IMPORT_CHUNK',actorAccountId:b.actorAccountId,batchId:b.batchId,requestKey:'UNIT-ACCOUNT',expectedSequence:3,expectedCursor:22,items:[]},{action:'IMPORT_PUBLISH',actorAccountId:b.actorAccountId,batchId:b.batchId,requestKey:'UNIT-PUBLISH',expectedSequence:4,expectedCursor:24}];
 const coreClaims=Array.from({length:22},(_,i)=>({importBatchId:b.batchId,importRecordId:id(100+i),targetType:'WAREHOUSE',targetId:id(200+i),operationId:b.coreReceiptId,checkpointSequence:1}));
 const records=coreClaims.map((c,i)=>({importRecordId:c.importRecordId,targetType:'WAREHOUSE',targetId:c.targetId,sourceEntityType:'WAREHOUSE',sourceKey:'UNIT-WH-'+i,sourceRecordHash:H('a'),sourceFileRef:'UNIT_SOURCE'}));
 const committedOperations=[{action:'IMPORT_INITIALIZE_BARCODE_SCHEMES',operationId:id(999),requestKey:'UNIT-INIT',requestHash:H('a'),beforeCheckpoint:birth,checkpoint:init,result:{}}];
 if(bound)committedOperations.push({action:'IMPORT_BIND_FULL_SOURCE',operationId:stableImportId('operation',b.actorAccountId,commands[0].requestKey),requestKey:commands[0].requestKey,requestHash:historySettlementRequestHash(commands[0]),beforeCheckpoint:init,checkpoint:{...init,sequence:3,expected},result:{operationId:stableImportId('operation',b.actorAccountId,commands[0].requestKey),batchId:b.batchId,sequence:3,cursor:22}});
 const progress={actorAccountId:b.actorAccountId,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,committedOperations,claims:coreClaims,records,coreClaims,coreWarehouses:Array(22).fill({unit:true}),warehouses:Array(22).fill({unit:true}),status:'STAGED',checkpoint:bound?{...init,sequence:3,expected}:init,fullBinding:bound?fullBinding:null};
 return {b,commands,progress};
}
test('QA22 reuses original selector: actual-bound branch cannot schedule prefix staging again',()=>{
 const f=continuation(true),plan=module.qa22ContinuationPlan(f.b,f.commands,f.progress);assert.equal(plan.prefixRequired,false);assert.deepEqual(plan.prefixGroups,[]);let visited=0;for(const group of plan.prefixGroups){visited++;throw Error('BOUND_PREFIX_REENTERED:'+group);}assert.equal(visited,0);assert.deepEqual(plan.selected.remaining.map(c=>c.action),['IMPORT_CHUNK','IMPORT_PUBLISH']);
 const unbound=continuation(false);assert.deepEqual(module.qa22ContinuationPlan(unbound.b,unbound.commands,unbound.progress).prefixGroups,['PRODUCTS','SKUS','STOCK_CONTRIBUTORS','HEADERS','TRANSFER_LINES']);
 const bad=continuation(true);bad.progress.committedOperations[1].requestHash=H('f');assert.throws(()=>module.qa22ContinuationPlan(bad.b,bad.commands,bad.progress));
});
test('QA22 pending metadata cannot pretend to be actual CORE or an imported completion',()=>{
 const f=continuation(true);assert.throws(()=>module.qa22ContinuationPlan(f.b,f.commands,{...f.progress,coreClaims:[]}));assert.throws(()=>module.qa22ContinuationPlan(f.b,f.commands,{...f.progress,status:'IMPORTED'}));
});

test('QA22 preparation-only decision cannot activate an execution source session',async t=>{
 const s=await scratch(t);let borrowed=0;
 const grant=await s.save({version:'C_PRODUCTION_SOURCE_EXECUTION26_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_REGISTERED_FULL_SOURCE_EXECUTION',issuingAuthority:'C',realImportExecutionAuthorized:false,job:{},sourceInputDigest:H('a'),groups:module.sourceGroups,mainCommands:{}});
 const input={version:'QA897_FULL_SOURCE_PROVIDER26_INPUT_V1',binding:binding(),core:{},closureScope:{},warehouses:[],producers:Object.fromEntries(module.sourceGroups.map(g=>[g,{}])),productEvidence:{},coreProjection:{},initialization:{},preparation:{},money:{},executionAuthorization:grant};
 const ref=await s.save(input);await assert.rejects(module.createQa22SourceSession({inputFile:ref.path,trustedInputSha256:ref.sha256,executionAuthorizationSha256:grant.sha256,binding:binding(),sources:{},database:{ready(){borrowed++;throw Error('MUST_NOT_ACTIVATE');}},signal:new AbortController().signal}),/C_EXECUTION_SCOPE/);assert.equal(borrowed,0);
});
