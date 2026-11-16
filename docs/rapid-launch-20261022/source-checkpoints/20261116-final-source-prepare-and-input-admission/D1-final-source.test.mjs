import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {requestHash} from './work/packages/application/src/request-hash.ts';
import {stableImportId} from './work/packages/application/src/inventory-cutoff-import.ts';
import {FINAL_R3_SOURCE,describeFinalR3InputBinding,buildFinalR3PreparationBinding,buildFinalR3ExecutionBinding,prepareCliBatchedState,
 openCliBatchedState,describeCliBatchedContents,verifyFinalR3PersistedProgram,checkFinalR3PreparationQuery} from './work/tools/unified-import/batched-stream-cli-state.mjs';
import {validateFresh35BatchedPreparationAuthorization} from './work/scripts/release/unified-install/fresh35-admin154-record-v1.mjs';
import {restoreFresh35FinalPreparedImport,assertFresh35RetainedOriginalInitializer} from './work/tools/unified-import/fresh35-host-session.mjs';
const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'1000000000000000001',database_oid:'16384',database_name:'erp_fresh35_20261110_r3',catalog_sha256:'7e10755bbc434732a08dd69899a8f668701c504cfc1e26f117c8abc472614c88'};
const admin={staff_id:'71000000-0000-0000-0000-000000000001',account_id:'72000000-0000-0000-0000-000000000001',staff_name:'SYNTHETIC',login_name:'synthetic'};
const provision={operation_id:'73000000-0000-0000-0000-000000000001',request_sha256:'a'.repeat(64)};
const encoded='naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128);
const binding={manifestSha256:FINAL_R3_SOURCE.manifestSha256,target,admin,registration:{batch_id:'9629d837-776e-7f61-4fd4-0cebd4e1a097',source_namespace:'naijue:tplus:20261102',source_metadata_sha256:'f9488a2a0e148483fb985a73b177b923daf89b86df0c00179b4756fa097a098c',cutoff_at:'2026-11-16T11:40:00+08:00'},sourceOptions:{
 '--target-profile':'FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2',
 '--historical-settlement-retention-approval-sha256':'b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05',
 '--historical-line-amount-evidence-sha256':'e6f76ffd32f7d807e433e85bd2228b65281a6dc83ec3205117661bea13fdc710',
 '--historical-hall-approval-sha256':'a2e0893e36dc3260613a0e585c896aac6dd57939da2f7345d77561dcdf5a1a42',
 '--current-effective-alignment-sha256':'5a359f66aa5d6163fbb81dd23039395afdb81c8e30ed31d308dd5418f0d3b9ab',
 '--explicit-zero-approval-sha256':'669c0e4228ee2f7d8929bcc92a1bdf4cea9d491028e518d379818a64a775b566',
 '--staff-hall-approval-sha256':'4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40'}};
const input=describeFinalR3InputBinding(target,admin,provision,binding);
const preparationScope={requestKey:'t45-r3-final33-plan-prepare-20261116-01',batchPlanPath:'/SYNTHETIC_ONLY/final33-plan.sqlite'};
function program(){
 const identity={batchId:'ee6716e0-d983-c718-bff7-98d9f872d116',documentBatchId:binding.registration.batch_id,packageSha256:binding.manifestSha256,planSha256:'1'.repeat(64),namespace:binding.registration.source_namespace,cutoffAt:binding.registration.cutoff_at};
 const req=(key,payload,document=false)=>{const op=stableImportId('synthetic-prepare-test',key);return{protocol:'STANDARD_IMPORT_SQL_V1',operation_id:op,request_key:op,batch_id:document?identity.documentBatchId:identity.batchId,plan_sha256:identity.planSha256,package_manifest_sha256:identity.packageSha256,namespace:identity.namespace,cutoff_at:identity.cutoffAt,payload}};
 const initialize=req('init',{mode:'PROVISIONED_ADMIN_EMPTY_BUSINESS',admin,provision_operation_id:provision.operation_id,provision_request_sha256:provision.request_sha256,document_batch_id:identity.documentBatchId});
 const steps=[{method:'masterChunk',request:req('master',{expected_sequence:0,rows:[]})},{method:'baselineKeys',request:req('keys',{expected_sequence:1,rows:[]})},{method:'publish',request:req('base-close',{phase:'BASELINE',baseline_batch_id:identity.batchId,expected_sequence:2})},{method:'documentChunk',request:req('stage',{mode:'STAGE',expected_sequence:null,rows:[],documents:[]},true)},{method:'publish',request:req('final',{phase:'DOCUMENTS',baseline_batch_id:identity.batchId,expected_sequence:0},true)}];
 return{identity,initialize,steps:{async *[Symbol.asyncIterator](){yield* steps;}}};
}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'d1-final-source-')),path=join(dir,'plan.sqlite'),p=program();
 let state=await prepareCliBatchedState(path,p,binding,{counts:{},manifest_sha256:binding.manifestSha256,schema_declarations_sha256:FINAL_R3_SOURCE.sourceProfileSha256},{});
 const contents=await describeCliBatchedContents(state,p);
 const prepared={format:'FRESH35_COMPACT_ZERO_REAL_IMPORT_BINDING_V2',manifestSha256:p.identity.packageSha256,planSha256:p.identity.planSha256,baselineBatchId:p.identity.batchId,documentBatchId:p.identity.documentBatchId,sourceNamespace:p.identity.namespace,cutoffAt:p.identity.cutoffAt,initializerSha256:requestHash({initialize:p.initialize,encodedScrypt:encoded}),initializerOperationId:p.initialize.operation_id,initializerRequestKey:p.initialize.request_key,finalSourceInputSha256:requestHash(input),...contents};
 return{dir,path,p,prepared,state,close:async()=>{state.close();await rm(dir,{recursive:true,force:true})}};
}
test('exact new batch fixes source/profile/six approvals/registration and real entry identities',()=>{
 assert.equal(input.manifestSha256,FINAL_R3_SOURCE.manifestSha256);
 for(const change of [b=>b.sourceOptions['--historical-hall-approval-sha256']='f'.repeat(64),b=>b.registration.cutoff_at='2026-11-11T10:00:00+08:00',b=>b.admin.account_id=provision.operation_id,b=>b.target.database_name='other',b=>b.registration=null]){
  const bad=structuredClone(binding);change(bad);assert.throws(()=>describeFinalR3InputBinding(target,admin,provision,bad),/SOURCE_BINDING/);
 }
 assert.throws(()=>assertFresh35RetainedOriginalInitializer(program().initialize,encoded),/RETAINED_ORIGINAL_INITIALIZER_DIFFERS/);
});
test('persisted original requests restore without source files; every changed request, descriptor and origin is rejected',async()=>{
 const f=await fixture();try{
  const restored=await verifyFinalR3PersistedProgram(f.state,encoded,target,input,f.prepared);
  assert.deepEqual(restored.initialize,f.p.initialize);assert.deepEqual(restored.identity,f.p.identity);
  assert.equal((await Array.fromAsync(restored.steps)).length,5);
  await assert.rejects(verifyFinalR3PersistedProgram(f.state,encoded+'0',target,input,f.prepared),/PERSISTED_PLAN/);
  await assert.rejects(verifyFinalR3PersistedProgram(f.state,encoded,target,{...input,provisionSha256:'f'.repeat(64)},f.prepared),/INITIALIZER/);
  await assert.rejects(restoreFresh35FinalPreparedImport(f.state,encoded,target,{},input,f.prepared,'FIRST_WRITE'),/WHOLE_SALES_ADMISSION_REQUIRED/);
  for(const sql of ["UPDATE meta SET value=json_set(value,'$.context.totals.synthetic_changed',1) WHERE name='plan'", "UPDATE step SET value=json_set(value,'$.request.payload.synthetic_changed',1) WHERE ordinal=1", "UPDATE batch SET value=json_set(value,'$.predecessor','wrong') WHERE ordinal=1",'DELETE FROM step WHERE ordinal=1',"UPDATE step SET value=json_set(value,'$.request.payload.admin.login_name','changed') WHERE ordinal=0"]){
   const path=join(f.dir,'bad-'+stableImportId('tamper',sql)+'.sqlite');await copyFile(f.path,path);const db=new DatabaseSync(path);db.exec(sql);db.close();const state=await openCliBatchedState(path,binding);
   try{await assert.rejects(verifyFinalR3PersistedProgram(state,encoded,target,input,f.prepared),/PERSISTED_PLAN|DESCRIPTOR|RANGE|INITIALIZER/)}finally{state.close()}
  }
 }finally{await f.close()}
});
test('90-minute credential authority stays inside parent C while one-shot job remains 780/650/130 seconds',()=>{
 const evidence={transactionMode:'BATCHED_V1',batchedDbCandidatePinsSha256:'1'.repeat(64),batchedSourceSetSha256:'2'.repeat(64),batchedCatalogSpecSha256:'3'.repeat(64),batchedModelSha256:'4'.repeat(64)};
 const scope=buildFinalR3PreparationBinding(target,input,'5'.repeat(64),'2026-11-16 03:00:00.123456+00',evidence,preparationScope),now=Date.now();
 const controllerValidUntil=now+90*60000,parentCExpiresAt=now+120*60000;
 const a={format:'FRESH35_BATCHED_PREPARATION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_BATCH_PREPARATION_AND_READONLY_ROOT_INSPECTION',binding:scope,startsAt:now-1000,expiresAt:controllerValidUntil,maximumOperationSeconds:650,maximumCleanupSeconds:130,maximumJobSeconds:780,independentSafetyReviewSha256:'6'.repeat(64),authorizationReference:'LOCAL UNIT ONLY'};
 assert.equal(validateFresh35BatchedPreparationAuthorization(a,scope,parentCExpiresAt,now).maximumOperationSeconds,650);
 assert.equal(a.expiresAt,controllerValidUntil);assert(a.expiresAt-now>780000);
 assert.throws(()=>validateFresh35BatchedPreparationAuthorization(a,scope,controllerValidUntil-1,now),/WINDOW/);
 assert.throws(()=>validateFresh35BatchedPreparationAuthorization(a,scope,parentCExpiresAt,now,now+650001),/WINDOW/);
 assert.throws(()=>validateFresh35BatchedPreparationAuthorization(a,scope,parentCExpiresAt,now,now),/WINDOW/);
 // Source setup consumed 20 seconds: a caller cannot restart its 650-second slice.
 assert.equal(validateFresh35BatchedPreparationAuthorization(a,scope,parentCExpiresAt,now,now+630000).maximumJobSeconds,780);
 assert.throws(()=>buildFinalR3PreparationBinding(target,input,'5'.repeat(64),'2026-11-16 03:00:00.123456+00',evidence,{...preparationScope,requestKey:'another-key'}),/PREPARATION_SCOPE/);
 assert.throws(()=>validateFresh35BatchedPreparationAuthorization({...a,binding:{...scope,preparationScope:{...preparationScope,batchPlanPath:'/OTHER/plan.sqlite'}}},scope,parentCExpiresAt,now),/AUTHORIZATION/);
 for(const change of [a=>a.decision='AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK',a=>a.maximumOperationSeconds=651,a=>a.expiresAt=now+649999,a=>a.expiresAt=parentCExpiresAt+1,a=>a.maximumCleanupSeconds=131,a=>a.maximumJobSeconds=781,a=>a.binding.currentServiceSha256='f'.repeat(64),a=>a.startsAt=now+1,a=>a.binding.inputBinding.manifestSha256='f'.repeat(64)]){
  const bad=structuredClone(a);change(bad);assert.throws(()=>validateFresh35BatchedPreparationAuthorization(bad,scope,parentCExpiresAt,now),/PREPARATION/);
 }
});
test('the real PREPARE SQL consumer allows only read-only CORE inspection and rollback; never mutation or commit',async()=>{
 const f=await fixture();try{
  const core=f.state.batches().next().value,identity={...f.p.identity,rootOperationId:f.p.initialize.operation_id};
  let phase=checkFinalR3PreparationQuery(0,'BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY',undefined,identity,core);
  phase=checkFinalR3PreparationQuery(phase,'SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2',undefined,identity,core);
  const sql='SELECT naijue_erp.standard_batched_import_inspect_v1($1::jsonb,$2::jsonb)::text AS result_json';
  const args=[JSON.stringify(identity),JSON.stringify(core)];
  assert.throws(()=>checkFinalR3PreparationQuery(phase,sql,[JSON.stringify({...identity,packageSha256:'f'.repeat(64)}),args[1]],identity,core),/SQL_REFUSED/);
  phase=checkFinalR3PreparationQuery(phase,sql,args,identity,core);assert.equal(phase,3);
  for(const bad of ['COMMIT','BEGIN ISOLATION LEVEL READ COMMITTED','SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2','SELECT naijue_erp.standard_batched_import_step_v1($1::jsonb,$2::jsonb,$3::integer,$4::text,$5::jsonb,$6::text)::text AS result_json']){
   assert.throws(()=>checkFinalR3PreparationQuery(phase,bad,undefined,identity,core),/SQL_REFUSED/);
  }
  assert.equal(checkFinalR3PreparationQuery(phase,'ROLLBACK',undefined,identity,core),0);
 }finally{await f.close()}
});

test('current execution envelope pins unchanged original preparation across a C/epoch renewal',async()=>{
 const f=await fixture();try{
  const original={...f.prepared,currentServiceSha256:'a'.repeat(64),postmasterStart:'2026-11-16 03:00:00.123456+00'};
  const before=structuredClone(original),evidence={transactionMode:'BATCHED_V1',batchedDbCandidatePinsSha256:'1'.repeat(64),batchedSourceSetSha256:'2'.repeat(64),batchedCatalogSpecSha256:'3'.repeat(64),batchedModelSha256:'4'.repeat(64)};
  const current=buildFinalR3ExecutionBinding(target,input,original,'b'.repeat(64),'2026-11-16 04:00:00.123456+00',evidence);
  assert.deepEqual(original,before);assert.equal(current.preparedBindingSha256,requestHash(original));
  assert.equal(current.currentServiceSha256,'b'.repeat(64));assert.equal(current.postmasterStart,'2026-11-16 04:00:00.123456+00');
  assert.equal(current.initializerSha256,original.initializerSha256);assert.equal(current.batchedPlanSha256,original.batchedPlanSha256);
  const restored=await verifyFinalR3PersistedProgram(f.state,encoded,target,input,original);assert.deepEqual(restored.initialize,f.p.initialize);
  assert.throws(()=>buildFinalR3ExecutionBinding(target,input,current,'c'.repeat(64),current.postmasterStart,evidence),/ORIGINAL_PREPARED_BINDING/);
  assert.throws(()=>buildFinalR3ExecutionBinding(target,{...input,batchBindingSha256:'f'.repeat(64)},original,'b'.repeat(64),current.postmasterStart,evidence),/ORIGINAL_PREPARED_BINDING/);
 }finally{await f.close()}
});
