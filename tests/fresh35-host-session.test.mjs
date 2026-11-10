import {createFresh35BootstrapNetworkModel,prepareFresh35CatalogProgramModel,rewriteFresh35ModelModule} from './fixtures/fresh35-bootstrap-network-model.mjs';
import {after} from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadFresh35CombinedRecordEnvelope,validateFresh35CombinedRecord,publishFresh35CombinedRecord} from '../scripts/release/unified-install/fresh35-combined-record-v1.mjs';
import {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog} from '../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs';
import {compileFresh35CombinedProgram,describeFresh35CombinedProgram} from '../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
import {openReviewedFresh35Host,verifyFresh35InstalledV1,consumeFresh35VerificationV1,fresh35HostContext} from '../tools/unified-import/fresh35-host-session.mjs';
import {withReviewedWholeSession,sameActiveWholeHostSession} from '../tools/unified-import/whole-host-session.mjs';
import {withVerifiedFresh35AdmissionV1,assertWholeSalesAdmissionV1} from '../scripts/release/unified-install/whole-sales-admission-v1.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const proof={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'7703999999999999999',database_oid:'16384',database_name:'synthetic_fresh35_20261105_r9',catalog_sha256:'a'.repeat(64)};
// Actual pinned pg Client handlers, with transport frames only: no socket,
// database, catalog admission or SQL-kernel execution is asserted here.
async function nativeErrorCleanup(mode){
 const {Client}=await import('pg'),{executeWholePackage,describeWholePackageFailure}=await import('../tools/unified-import/whole-package-client.ts');
 const c=new Client({pipeline:false}),connection=c.connection,sent=[],rejections=[],frames=[];let closed=0,timer;
 c.on('error',()=>{});c._attachListeners(connection);c._connecting=true;connection.emit('readyForQuery',{status:'I'});
 const listenerCounts=()=>['readyForQuery','end','error'].map(name=>connection.listenerCount(name)),initialListeners=listenerCounts();
 const end=c.end.bind(c);c.end=(...args)=>{closed++;return end(...args)};
 connection.query=sql=>{sent.push(sql);queueMicrotask(()=>{
  if(sql.startsWith('SELECT ')){
   connection.emit('errorMessage',Object.assign(Error('synthetic ambiguous reference'),{code:'42702'}));
   assert.equal(c.readyForQuery,false);assert.equal(c.getTransactionStatus(),'T');
   const ready=()=>{
    if(mode==='end')connection.emit('end');
    else if(mode==='error')connection.emit('error',Error('synthetic transport loss'));
    else{if(mode==='driver-replaced'){const query=c.query;c.query=(...args)=>query.apply(c,args)}const status=mode==='idle'?'I':mode==='invalid-status'?'?':'E';connection.emit('readyForQuery',{status});frames.push(status)}
   };
   if(mode==='same-batch')ready();else if(mode!=='missing-ready')timer=setTimeout(ready,5);
  }else{const command=sql.startsWith('BEGIN')?'BEGIN':mode==='bad-ack'&&sql==='ROLLBACK'&&sent.filter(s=>s==='ROLLBACK').length===2?'COMMIT':sql;connection.emit('commandComplete',{text:command});connection.emit('readyForQuery',{status:command==='BEGIN'?'T':'I'})}
 })};
 const meta={batchId:'11111111-1111-4111-8111-111111111111',documentBatchId:'22222222-2222-4222-8222-222222222222',packageSha256:'a'.repeat(64),planSha256:'b'.repeat(64),namespace:'synthetic',cutoffAt:'2026-11-02T04:00:00Z'};
 const initialize={protocol:'STANDARD_IMPORT_SQL_V1',operation_id:'00000000-0000-4000-8000-000000000001',request_key:'native-ready-proof',batch_id:meta.batchId,plan_sha256:meta.planSha256,package_manifest_sha256:meta.packageSha256,namespace:meta.namespace,cutoff_at:meta.cutoffAt,payload:{admin:{},document_batch_id:meta.documentBatchId}};
 try{
  const output=await withReviewedWholeSession(c,{},proof,proof,async controlled=>{
   const observer={async query(sql,values){try{return await controlled.query(sql,values)}catch(error){rejections.push({sql,message:error.code?null:error.message,ready:c.readyForQuery});throw error}},discard:()=>controlled.discard()};
   const kernel={async lockAndInspect(){return{state:'ABSENT'}},async initialize(client){await client.query('SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json')},async applyStep(){throw Error('UNEXPECTED_STEP')},async summarize(){throw Error('UNEXPECTED_SUMMARIZE')}};
   const result=await executeWholePackage(observer,meta,initialize,(async function*(){})(),kernel);
   assert.deepEqual(describeWholePackageFailure(result),{stage:'INITIALIZE',sqlState:'42702',staticCode:null});
   if(result.state==='ROLLED_BACK')await assert.rejects(controlled.query('ROLLBACK'),/CONNECTION_UNAVAILABLE/);
   return result;
  },()=>proof,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+(mode==='missing-ready'?30:1000)});
  assert.equal(closed,1);assert.equal(sent.includes('COMMIT'),false);assert.deepEqual(listenerCounts(),initialListeners);
  return{...output,sent,rejections,frames};
 }finally{clearTimeout(timer);connection.stream.destroy()}
}
test('native ErrorResponse cleanup waits for delayed ReadyForQuery on the same wire and sends one acknowledged rollback',async()=>{
 for(const mode of ['same-batch','delayed']){
  const result=await nativeErrorCleanup(mode);
  assert.deepEqual(result.result,{state:'ROLLED_BACK',code:'IMPORT_FAILED'});assert.equal(result.cleanup,'CLOSED');
  assert.equal(result.sent.filter(sql=>sql==='ROLLBACK').length,2,'one catalog rollback and exactly one application rollback');
  assert.deepEqual(result.frames,['E']);assert.equal(result.rejections.some(r=>r.message==='WHOLE_WIRE_STATE_INVALID'),false);
 }
});
test('native ErrorResponse cleanup retains unknown on lost wire, deadline, wrong state or missing rollback ACK',async()=>{
 for(const mode of ['error','end','missing-ready','idle','invalid-status','driver-replaced','bad-ack']){
  const result=await nativeErrorCleanup(mode);
  assert.deepEqual(result.result,{state:'UNKNOWN',code:'TRANSACTION_OUTCOME_UNKNOWN'},mode);assert.equal(result.cleanup,'CLOSED');
  assert.equal(result.sent.filter(sql=>sql==='ROLLBACK').length,mode==='bad-ack'?2:1,'no cleanup SQL before a valid ReadyForQuery and no retry after a bad ACK');
 }
});
function client(){let status='I',closed=0;const calls=[];return {calls,get closed(){return closed},on(){},readyForQuery:true,_queryable:true,_ending:false,pipeline:false,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],getTransactionStatus(){return status},async query(sql){calls.push(sql);if(sql.startsWith('BEGIN')){status='T';return {command:'BEGIN'}}if(sql==='ROLLBACK'||sql==='COMMIT'){status='I';return {command:sql}}return {command:'SELECT'}},async end(){closed++}}}
let cached,legacyNetworkModel;after(async()=>{await legacyNetworkModel?.close()});async function binding(){return cached??=(async()=>{
 const m=legacyNetworkModel=await createFresh35BootstrapNetworkModel({proposalDate:'20261105'}),target=m.target,paths=await resolveFresh35ReferenceInputPaths(resolve(root,'../reference-inputs'));
 const source=await loadFresh35CombinedSource(root,paths),graph=await prepareFresh35CatalogProgramModel(m,source,paths),program=graph.program,d=graph.lifecycleAPI.describeFresh35CombinedProgram(program);
 const record={format:'FRESH35_COMBINED_INSTALLATION_RECORD_V1',installedAt:new Date().toISOString(),binding:{sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256},target:m.api.describeFresh35CombinedTarget(target),transactionReceipt:{nonce:'a'.repeat(48),database:proof.database_name,actor:'fresh35_owner_20261105_r9',transactionId:'123',backendPid:1234},programSha256:d.programSha256,catalogSpecSha256:d.catalogSha256,catalogSha256:proof.catalog_sha256,authorizationSha256:'b'.repeat(64),state:'COMMITTED_AND_CATALOG_CHECKED'};
 const recordURL=await rewriteFresh35ModelModule(m,'../../scripts/release/unified-install/fresh35-combined-record-v1.mjs',[['./fresh35-combined-lifecycle-v1.mjs',graph.lifecycleURL],['./fresh35-combined-target-v1.mjs',m.moduleURL]]),recordAPI=await import(recordURL);
 const stub=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
 const recordHash=(await import('node:crypto')).createHash('sha256').update(await m.fs.readFile(new URL('../scripts/release/unified-install/fresh35-combined-record-v1.mjs',import.meta.url))).digest('hex');
 const protectedRecordModel=stub(`import {validateFresh35CombinedRecord} from ${JSON.stringify(recordURL)};export {validateFresh35CombinedRecord};const record=${JSON.stringify(record)};export async function loadFresh35CombinedRecordEnvelope(){return record}export const FRESH35_COMBINED_RECORD_PATH='/EXPLICIT_MODEL_RECORD',FRESH35_COMBINED_RECORD_MODULE_SHA256=${JSON.stringify(recordHash)};export function describeFresh35ProtectedRecordSnapshot(){throw Error('NOT_USED_V1_MODEL')}export async function assertFresh35ProtectedRecordSnapshotCurrent(){throw Error('NOT_USED_V1_MODEL')}`);
 const hostURL=await rewriteFresh35ModelModule(m,'../../tools/unified-import/fresh35-host-session.mjs',[['../../scripts/release/unified-install/fresh35-combined-target-v1.mjs',m.moduleURL],['../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs',graph.catalogURL],['../../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs',graph.lifecycleURL],['../../scripts/release/unified-install/fresh35-combined-record-v1.mjs',protectedRecordModel]]),hostAPI=await import(hostURL);
 const hostContext=await hostAPI.loadFresh35HostContext(root,resolve(root,'../reference-inputs'));
 return {program,record,target,validateRecord:recordAPI.validateFresh35CombinedRecord,hostAPI,hostContext,model:m};
 })()}
test('fixed record is required before configuration, any connection, or host work',async()=>{
 let accessed=false;const config=new Proxy({},{get(){accessed=true;throw Error('credentials must not be inspected')}});
 await assert.rejects(loadFresh35CombinedRecordEnvelope(),/FRESH35_PROTECTED_RECORD_REQUIRED|ORDINARY_RUNTIME_REQUIRED/);
 await assert.rejects(openReviewedFresh35Host(config,root,proof,()=>{accessed=true},{referenceDirectory:resolve(root,'../reference-inputs')}),/FRESH35_PROTECTED_RECORD_REQUIRED|ORDINARY_RUNTIME_REQUIRED/);
 assert.equal(accessed,false);
});
test('valid-looking record data checks exact source/program/physical receipt without granting authority',async()=>{
 const {record,program,validateRecord,hostAPI,hostContext}=await binding();assert.equal(validateRecord(record,program).catalogSha256,proof.catalog_sha256);assert.equal(hostAPI.fresh35HostContext(hostContext).record.programSha256,record.programSha256);assert.throws(()=>fresh35HostContext(hostContext),/GENUINE_FIXED_CONTEXT/);
 for(const mutate of [r=>r.target={...r.target,physical:{...r.target.physical,databaseOid:'16385'}},r=>r.programSha256='c'.repeat(64),r=>r.binding.sourceSetSha256='c'.repeat(64),r=>r.transactionReceipt.actor='postgres',r=>r.state='STAGED',r=>r.catalogSha256='invalid']){
  const r=structuredClone(record);mutate(r);assert.throws(()=>validateRecord(r,program),/FRESH35_COMBINED_RECORD_/);
 }
 assert.throws(()=>fresh35HostContext(record),/GENUINE_FIXED_CONTEXT_REQUIRED/);
 assert.throws(()=>consumeFresh35VerificationV1(record,{}),/VERIFIED_INSTANCE_REQUIRED/);
 await assert.rejects(publishFresh35CombinedRecord(record),/GENUINE_COMMITTED_COMPLETION/);
});
test('expired record target cannot reconstruct a live host binding',async()=>{
 const {record}=await binding(),{proposal,physical,startsAt,expiresAt}=record.target;
 assert.throws(()=>bindFresh35CombinedTarget({proposal,physical,startsAt,expiresAt},expiresAt),/TWENTY_MINUTE_WINDOW/);
});
test('caller-supplied verifier and model client cannot mint a Fresh35 verification or admission',async()=>{
 const c=client();let called=false;
 await assert.rejects(withReviewedWholeSession(c,{},proof,proof,()=>{called=true},gate=>verifyFresh35InstalledV1(gate,{}),'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+10000}),/PHYSICAL_SESSION_REQUIRED/);
 assert.equal(called,false);assert.equal(c.closed,1);assert.deepEqual(c.calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);
 assert.equal(sameActiveWholeHostSession(c,c),false);
 await assert.rejects(withVerifiedFresh35AdmissionV1({...proof,source_profile_sha256:'a'.repeat(64)},c,c,proof,()=>{called=true}),/VERIFIED_INSTANCE_REQUIRED/);
 assert.throws(()=>assertWholeSalesAdmissionV1({profile:'FRESH35_EXECUTION_ADMISSION_V1'},proof),/ADMISSION_REQUIRED/);
 assert.equal(called,false);
});
test('Fresh35 shared wire owns one cleanup and refuses commit after its original deadline',async()=>{
 const c=client();
 await assert.rejects(withReviewedWholeSession(c,{},proof,proof,async controlled=>{
  await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await new Promise(r=>setTimeout(r,40));
  await controlled.query('COMMIT');
 },()=>proof,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+20}),/WINDOW_EXPIRED|CONNECTION_UNAVAILABLE/);
 assert.equal(c.closed,1);assert.equal(c.calls.includes('COMMIT'),false);
});

test('F01 protected loader retains its original byte hash and nanosecond identity, never a replacement baseline (private OS model)',async()=>{
 const fs=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=await fs.mkdtemp(join(tmpdir(),'record-snapshot-model-')),path=join(dir,'record.json');
 const value={format:'FRESH35_COMBINED_INSTALLATION_RECORD_V1',installedAt:'2026-11-05T00:00:00Z',binding:{},target:{format:'FRESH35_COMBINED_TARGET_BINDING_V1'},transactionReceipt:{},programSha256:'a'.repeat(64),catalogSpecSha256:'b'.repeat(64),catalogSha256:'c'.repeat(64),authorizationSha256:'d'.repeat(64),state:'COMMITTED_AND_CATALOG_CHECKED'};
 const bytes=Buffer.from(JSON.stringify(value)+'\n');await fs.writeFile(path,bytes);
 const source=await fs.readFile(new URL('../scripts/release/unified-install/fresh35-combined-record-v1.mjs',import.meta.url),'utf8'),tail=source.slice(source.indexOf('export async function loadFresh35CombinedRecordEnvelope'));
 const prefix=`import * as fs from 'node:fs/promises';import {constants} from 'node:fs';import {createHash} from 'node:crypto';import {parseStrictJson} from ${JSON.stringify(new URL('../packages/application/src/unified-import-contract.ts',import.meta.url).href)};
 const process={getuid:()=>501,geteuid:()=>501},FRESH35_COMBINED_RECORD_PATH=${JSON.stringify(path)},protectedEnvelopes=new WeakMap();
 const need=(ok,code)=>{if(!ok)throw Error('MODEL_'+code)},hash=b=>createHash('sha256').update(b).digest('hex'),closed=(o,keys)=>need(o&&Object.keys(o).sort().join(',')===[...keys].sort().join(','),'CLOSED');
 async function assertTrustedRootPath(){}const normalized=s=>Object.create(s,{uid:{value:0n},mode:{value:s.mode&~0o022n}});
 async function lstat(p,options){return normalized(await fs.lstat(p,options))}async function open(p,flags){const f=await fs.open(p,flags);return {stat:async options=>normalized(await f.stat(options)),readFile:(...args)=>f.readFile(...args),close:()=>f.close()}}const readFile=(...args)=>fs.readFile(...args);
 `;
 try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64'));
  const envelope=await api.loadFresh35CombinedRecordEnvelope(),snapshot=api.describeFresh35ProtectedRecordSnapshot(envelope),{createHash}=await import('node:crypto');
  assert.equal(snapshot.sha256,createHash('sha256').update(bytes).digest('hex'));assert(Object.isFrozen(snapshot));await api.assertFresh35ProtectedRecordSnapshotCurrent(envelope,true);
  const realRecord=await import('../scripts/release/unified-install/fresh35-combined-record-v1.mjs');assert.throws(()=>realRecord.describeFresh35ProtectedRecordSnapshot(envelope),/FIXED_PROTECTED_ENVELOPE/);
  assert.throws(()=>api.describeFresh35ProtectedRecordSnapshot(structuredClone(envelope)),/FIXED_PROTECTED_ENVELOPE/);
  await fs.writeFile(path+'.new',bytes);await fs.rename(path+'.new',path);await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(envelope),/GENERATION_CHANGED/);assert.equal(api.describeFresh35ProtectedRecordSnapshot(envelope),snapshot);
  const second=await api.loadFresh35CombinedRecordEnvelope();await fs.writeFile(path,'CHANGED');await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(second,true),/GENERATION_CHANGED|BYTES_CHANGED/);
  await fs.writeFile(path,bytes);const third=await api.loadFresh35CombinedRecordEnvelope();await fs.rm(path);await assert.rejects(()=>api.assertFresh35ProtectedRecordSnapshotCurrent(third),/ENOENT/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('REAL production import requires its distinct protected V2 context and never accepts caller authority',async()=>{
 const host=await import('../tools/unified-import/fresh35-host-session.mjs');
 assert.equal(typeof host.loadFresh35ProductionImportContext,'function');
 assert.equal(typeof host.openReviewedFresh35ProductionHost,'function');
 let touched=false;const config=new Proxy({}, {get(){touched=true;throw Error('private configuration must not be read')}});
 await assert.rejects(()=>host.openReviewedFresh35ProductionHost(config,root,proof,()=>{touched=true},()=>{touched=true},{referenceDirectory:resolve(root,'../reference-inputs')}),/PROTECTED_RECORD|ORDINARY_RUNTIME_REQUIRED/);
 assert.equal(touched,false);await assert.rejects(()=>host.describeFresh35ProductionImportBinding({},{}),/GENUINE_FIXED_CONTEXT/);
 await assert.rejects(()=>host.loadFresh35ProductionImportAuthorization({},{}),/GENUINE_FIXED_CONTEXT/);
});

// These tests execute the production authority/query code with explicitly
// modeled OS metadata. They never install a record or grant a real capability.
async function realImportAuthorityModel(){
 const fs=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await fs.mkdtemp(join(tmpdir(),'real-batch-authority-model-')),path=join(dir,'authority.json');
 const source=await fs.readFile(new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),'utf8');
 let block=source.slice(source.indexOf('export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH='),source.indexOf('const ordinaryAdmissions='));
 block=block.replace(/export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH=.*?;/,`export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH=${JSON.stringify(path)};`);
 const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const prefix=`import * as fs from 'node:fs/promises';import {constants} from 'node:fs';import {createHash} from 'node:crypto';
 import {parseStrictJson} from ${url('../packages/application/src/unified-import-contract.ts')};
 import {requestHash} from ${url('../packages/application/src/request-hash.ts')};
 import {canonicalRequestValue} from ${url('../packages/application/src/canonical-request-value.ts')};
 import {validateStandardImportRequest} from ${url('../packages/application/src/unified-import-execution.ts')};
 import {isNodeScryptPasswordHash} from ${url('../packages/authentication/src/passwords.ts')};
 import {streamTypedHash,typedHashArray} from ${url('../tools/unified-import/stream-typed-hash.mjs')};
 const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)},hash=b=>createHash('sha256').update(b).digest('hex');
 const contexts=new WeakMap();let rootOwner=true,recordCurrent=true;export function setRootOwner(v){rootOwner=v}export function revokeRecord(){recordCurrent=false}
 const normalized=s=>Object.create(s,{uid:{value:rootOwner?0n:501n}});
 async function lstat(p,o){return normalized(await fs.lstat(p,o))}async function open(p,flags){const f=await fs.open(p,flags);return {stat:async o=>normalized(await f.stat(o)),readFile:(...a)=>f.readFile(...a),close:()=>f.close()}}
 async function assertTrustedRootPath(){}async function assertFresh35ProtectedRecordSnapshotCurrent(){need(recordCurrent,'MODEL_RECORD_REPLACED')}
 function fresh35HostContext(t){need(contexts.has(t),'GENUINE_FIXED_CONTEXT_REQUIRED');return contexts.get(t)}
 async function assertFresh35HostCurrent(t){const c=fresh35HostContext(t);await assertFresh35ProtectedRecordSnapshotCurrent();need(Date.now()<c.target.expiresAt,'WINDOW_EXPIRED');return c}
 const describeFresh35CombinedTarget=t=>t;
 export function seed(){const t=Object.freeze({model:true}),now=Date.now();contexts.set(t,{productionImport:true,envelope:{},source:{},target:{startsAt:now-1000,expiresAt:now+60000,physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384'},proposal:{database:'synthetic_fresh35_20261105_r9',host:'127.0.0.1',port:57639,controller:'MODEL_CONTROLLER'}},recordFileSha256:'1'.repeat(64),record:{programSha256:'2'.repeat(64),catalogSha256:'3'.repeat(64),binding:{sourceSetSha256:'4'.repeat(64),targetSha256:'5'.repeat(64)}}});return t}
 `;
 const moduleURL='data:text/javascript;base64,'+Buffer.from(prefix+block+'\nexport {fresh35HostContext,assertFresh35HostCurrent};').toString('base64');const api=await import(moduleURL);
 const context=api.seed(),batch='11111111-1111-1111-1111-111111111111',document='22222222-2222-2222-2222-222222222222';
 const request=(n,payload={})=>({protocol:'STANDARD_IMPORT_SQL_V1',operation_id:`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,request_key:'original-key-'+n,batch_id:batch,plan_sha256:'a'.repeat(64),package_manifest_sha256:'b'.repeat(64),namespace:'SYNTHETIC_MODEL_REAL_AUTHORITY',cutoff_at:'2026-11-02T04:00:00Z',payload});
 const initialize=request(1,{document_batch_id:document}),steps=[{method:'masterChunk',request:request(2,{rows:[{name:'MODEL'}]})},{method:'publish',request:request(3,{phase:'BASELINE'})},{method:'documentChunk',request:{...request(4,{mode:'STAGE'}),batch_id:document}},{method:'publish',request:{...request(5,{phase:'DOCUMENTS'}),batch_id:document}}];
 const prepared={packageKind:'REAL',initialize,identity:{batchId:batch,documentBatchId:document,packageSha256:'b'.repeat(64),planSha256:'a'.repeat(64),namespace:initialize.namespace,cutoffAt:initialize.cutoff_at},encodedScrypt:'naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128),steps:{async *[Symbol.asyncIterator](){yield* steps}}};
 const binding=await api.describeFresh35ProductionImportBinding(context,prepared);
 const approval=()=>({format:'FRESH35_PRODUCTION_REAL_IMPORT_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_REAL_BATCH_IMPORT_AND_READBACK',binding:{...binding},startsAt:Date.now()-500,expiresAt:Date.now()+30000,independentSafetyReviewSha256:'e'.repeat(64),authorizationReference:'SYNTHETIC OS MODEL ONLY'});
 const write=async value=>{await fs.writeFile(path,JSON.stringify(value),{mode:0o600});await fs.chmod(path,0o600)};
 const authorize=async()=>{await write(approval());const token=await api.loadFresh35ProductionImportAuthorization(context,binding);return {token,guard:api.fresh35ProductionImportQueryGuard(context,token,prepared)}};
 const sql={inspect:'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json',prepare:'SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json',step:'SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json',finish:'SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json',verify:'SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text)::text AS result_json'};
 const initValues=()=>[JSON.stringify(initialize),prepared.encodedScrypt];
 const sendSteps=async guard=>{for(let i=0;i<steps.length;i++){const s=steps[i];await guard.check(sql.step,[initialize.operation_id,i+1,s.method==='masterChunk'?'MASTER':s.method==='documentChunk'?'DOCUMENTS':'PUBLISH',JSON.stringify(s.request)])}};
 return {api,moduleURL,context,prepared,steps,binding,approval,write,authorize,sql,initValues,sendSteps,path,fs,close:()=>fs.rm(dir,{recursive:true,force:true})};
}

test('REAL exact binding covers every original request key, method, private initialization and genuine context (OS model)',async()=>{
 const m=await realImportAuthorityModel();try{
  assert.equal(m.binding.stepCount,4);assert.equal(Object.isFrozen(m.binding),true);
  assert.doesNotMatch(JSON.stringify(m.binding),/naijue:scrypt|cccccccccccc/);
  const first=m.binding.stepsSha256;m.steps.at(-1).request.request_key+='-changed';
  assert.notEqual((await m.api.describeFresh35ProductionImportBinding(m.context,m.prepared)).stepsSha256,first);
  const changed={...m.prepared,encodedScrypt:m.prepared.encodedScrypt.replace(/d$/,'e')};
  assert.notEqual((await m.api.describeFresh35ProductionImportBinding(m.context,changed)).initializerSha256,m.binding.initializerSha256);
  await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,structuredClone(m.binding)),/GENUINE_PRODUCTION_IMPORT_BINDING/);
  const actual=await import('../tools/unified-import/fresh35-host-session.mjs');
  await assert.rejects(()=>actual.loadFresh35ProductionImportAuthorization(m.context,m.binding),/GENUINE_FIXED_CONTEXT/);
 }finally{await m.close()}
});
test('REAL authority rejects missing, changed bindings, widened windows and writable or non-root files (OS model)',async()=>{
 const m=await realImportAuthorityModel();try{
  await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding),/AUTHORIZATION_REQUIRED/);
  for(const change of [a=>a.extra=true,a=>a.decision='INSTALL_ONLY',a=>a.binding.initializerSha256='0'.repeat(64),a=>a.binding.stepsSha256='0'.repeat(64),a=>a.binding.initializerRequestKey='other',a=>a.expiresAt=Date.now()+120000,a=>a.startsAt=Date.now()+5000,a=>a.authorizationReference='']){
   const a=m.approval();change(a);await m.write(a);await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding),/AUTHORIZATION_/);
  }
  await m.write(m.approval());await m.fs.chmod(m.path,0o622);await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding),/PROTECTED_AUTHORIZATION/);
  await m.fs.chmod(m.path,0o600);m.api.setRootOwner(false);await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding),/PROTECTED_AUTHORIZATION/);m.api.setRootOwner(true);
  await m.fs.rename(m.path,m.path+'.real');await m.fs.symlink(m.path+'.real',m.path);await assert.rejects(()=>m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding),/AUTHORIZATION_REQUIRED/);
 }finally{await m.close()}
});
test('REAL complete original transaction, inspect-only replay and separate verify retain exact binding (OS model)',async()=>{
 const m=await realImportAuthorityModel();try{
  const {guard}=await m.authorize();await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');
  await guard.check(m.sql.inspect,m.initValues());await guard.check(m.sql.prepare,m.initValues());await m.sendSteps(guard);
  await guard.check(m.sql.finish,[m.prepared.initialize.operation_id]);await guard.check('SET CONSTRAINTS ALL IMMEDIATE');await guard.check('COMMIT');
  await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');await guard.check(m.sql.inspect,m.initValues());await guard.check('COMMIT');
  await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');await guard.check(m.sql.verify,m.initValues());await guard.check('ROLLBACK');await guard.close();
 }finally{await m.close()}
});
test('REAL mutated initializer, key, ordinal, phase and incomplete transaction are refused (OS model)',async()=>{
 const m=await realImportAuthorityModel();try{
  for(const mutation of ['initializer','scrypt','key','ordinal','phase','root','early_commit','truncated']){
   const {guard}=await m.authorize();await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');
   if(mutation==='initializer'||mutation==='scrypt'){
    const values=m.initValues();if(mutation==='initializer'){const v=JSON.parse(values[0]);v.request_key='wrong';values[0]=JSON.stringify(v)}else values[1]+='wrong';
    await assert.rejects(()=>guard.check(m.sql.prepare,values),/INITIALIZER_BINDING/);
   }else{
    await guard.check(m.sql.prepare,m.initValues());
    if(mutation==='early_commit')await assert.rejects(()=>guard.check('COMMIT'),/COMPLETE_ORIGINAL_STEPS/);
    else if(mutation==='truncated')await assert.rejects(()=>guard.check(m.sql.finish,[m.prepared.initialize.operation_id]),/COMPLETE_ORIGINAL_STEPS/);
    else {const r=structuredClone(m.steps[0].request);if(mutation==='key')r.request_key='wrong';await assert.rejects(()=>guard.check(m.sql.step,[mutation==='root'?'other':m.prepared.initialize.operation_id,mutation==='ordinal'?2:1,mutation==='phase'?'PUBLISH':'MASTER',JSON.stringify(r)]),/ORIGINAL_STEP_REQUIRED/)}
   }
   await guard.check('ROLLBACK');await guard.close();
  }
 }finally{await m.close()}
});
test('REAL post-authorization stream mutation cannot finish or commit under original signed digest (OS model)',async()=>{
 const m=await realImportAuthorityModel();try{
  const {guard}=await m.authorize();await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');await guard.check(m.sql.prepare,m.initValues());
  m.steps.at(-1).request.request_key='mutated-even-in-expected-cursor';await m.sendSteps(guard);
  await assert.rejects(()=>guard.check(m.sql.finish,[m.prepared.initialize.operation_id]),/ORIGINAL_STEP_REQUIRED/);
  await assert.rejects(()=>guard.check('COMMIT'),/COMPLETE_ORIGINAL_STEPS/);await guard.check('ROLLBACK');
 }finally{await m.close()}
});
test('REAL external authority and installed-record invalidation refuse commit but retain rollback cleanup (OS model)',async()=>{
 for(const action of ['replace','record','expire']){
  const m=await realImportAuthorityModel();try{
   let guard;if(action==='expire'){const a=m.approval();a.expiresAt=Date.now()+120;await m.write(a);const token=await m.api.loadFresh35ProductionImportAuthorization(m.context,m.binding);guard=m.api.fresh35ProductionImportQueryGuard(m.context,token,m.prepared)}else ({guard}=await m.authorize());
   await guard.check('BEGIN ISOLATION LEVEL READ COMMITTED');
   if(action==='replace'){await m.fs.writeFile(m.path+'.new',await m.fs.readFile(m.path),{mode:0o600});await m.fs.rename(m.path+'.new',m.path)}
   if(action==='record')m.api.revokeRecord();if(action==='expire')await new Promise(r=>setTimeout(r,130));
   await assert.rejects(()=>guard.check('COMMIT'),/CHANGED|REPLACED|WINDOW_EXPIRED/);await guard.check('ROLLBACK');await guard.close();
  }finally{await m.close()}
 }
});

test('REAL authorized query failure poisons original wire and preserves acknowledged rollback and single close (wire model)',async()=>{
 const c=client(),checked=[];
 const result=await withReviewedWholeSession(c,{},proof,proof,async controlled=>{
  await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await assert.rejects(()=>controlled.query('SET CONSTRAINTS ALL IMMEDIATE'),/EXACT_AUTHORITY_CHANGED/);
  await assert.rejects(()=>controlled.query('COMMIT'),/CONNECTION_UNAVAILABLE/);
  assert.equal((await controlled.query('ROLLBACK')).command,'ROLLBACK');
  return 'ROLLED_BACK';
 },()=>proof,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:Date.now()+10000,authorizedQuery:async sql=>{checked.push(sql);if(sql==='SET CONSTRAINTS ALL IMMEDIATE')throw Error('EXACT_AUTHORITY_CHANGED')}});
 assert.equal(result.result,'ROLLED_BACK');assert.equal(result.cleanup,'CLOSED');assert.equal(c.closed,1);
 assert.deepEqual(checked,['BEGIN ISOLATION LEVEL READ COMMITTED','SET CONSTRAINTS ALL IMMEDIATE','ROLLBACK']);assert(!c.calls.includes('SET CONSTRAINTS ALL IMMEDIATE'));assert(!c.calls.includes('COMMIT'));
});

async function productionPhysicalFactoryModel(m){
 const source=await m.fs.readFile(new URL('../tools/unified-import/whole-host-session.mjs',import.meta.url),'utf8');
 let body=source.slice(source.indexOf('export async function openReviewedFresh35ProductionPhysicalHost('),source.indexOf('/** Fixed 154 entry'))+source.slice(source.indexOf('async function openFresh35PhysicalHost('));
 const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
 const host=stub(`import * as api from ${JSON.stringify(m.moduleURL)};const context=api.seed();export const fresh35HostContext=api.fresh35HostContext,assertFresh35HostCurrent=api.assertFresh35HostCurrent,describeFresh35ProductionImportBinding=api.describeFresh35ProductionImportBinding,loadFresh35ProductionImportAuthorization=api.loadFresh35ProductionImportAuthorization,fresh35ProductionImportQueryGuard=api.fresh35ProductionImportQueryGuard;export async function loadFresh35ProductionImportContext(){return context}export async function loadFresh35HostContext(){throw Error('OLD_HOST_FORBIDDEN')}export async function verifyFresh35InstalledV1(){return{live_catalog_sha256:'3'.repeat(64),source_profile_sha256:'a'.repeat(64)}}`);
 body=body.replace("'./fresh35-host-session.mjs'",JSON.stringify(host))
 .replace("'../../scripts/release/unified-install/fresh35-combined-target-v1.mjs'",JSON.stringify(stub('export const describeFresh35CombinedTarget=t=>t;')))
 .replace("'../../scripts/release/unified-install/whole-sales-admission-v1.mjs'",JSON.stringify(stub("export const WHOLE_SALES_ADMISSION_MODULE_SHA256='MODEL';export async function withVerifiedFresh35AdmissionV1(v,g,c,t,work){return work({modelPlannerAdmission:true})}")))
 .replace("'../../scripts/release/unified-install/fresh35-combined-source-v1.mjs'",JSON.stringify(stub("export function describeFresh35CombinedSource(){return{currentSourcePins:[{path:'tools/unified-import/whole-host-session.mjs',sha256:'MODEL'},{path:'scripts/release/unified-install/whole-sales-admission-v1.mjs',sha256:'MODEL'}]}}")))
 .replace("const {Client}=await import('pg');",'const Client=ModelClient;');
 const prefix=`import {withReviewedWholeSession,closePhysical} from ${JSON.stringify(new URL('../tools/unified-import/whole-host-session.mjs',import.meta.url).href)};import {validateStandardImportTarget} from ${JSON.stringify(new URL('../packages/application/src/unified-import-execution.ts',import.meta.url).href)};const loadedPhysicalHostSha256='MODEL';export const clients=[];const explicitZeroApprovalDescriptor=()=>{throw Error('UNUSED_MODEL')};class ModelClient{constructor(){const c=(${client.toString()})();const query=c.query;c.query=async sql=>sql.startsWith('SET ')?(c.calls.push(sql),{command:'SET'}):query(sql);c.connect=async()=>{};clients.push(c);return c}}const runWholeSession=(c,s,r,t,w,v,p,_trusted,o)=>withReviewedWholeSession(c,s,r,t,w,v,p,o);`;
 return import(stub(prefix+body));
}

test('REAL original physical factory compiles without writer, refuses missing authority and binds authorized work to original wire (OS/wire model)',async()=>{
 const m=await realImportAuthorityModel();try{
  const api=await productionPhysicalFactoryModel(m),config={host:'127.0.0.1',port:57639,database:proof.database_name,user:'MODEL_CONTROLLER',password:'MODEL_PRIVATE'};
  const target={...proof,catalog_sha256:'3'.repeat(64)};let prepared=0,written=0;
  const prepare=async admission=>{assert.equal(admission.modelPlannerAdmission,true);assert.equal(admission.query,undefined);prepared++;return m.prepared};
  const noWrite=()=>{written++;throw Error('WRITER_MUST_NOT_BE_REACHED')};
  const p=await api.openReviewedFresh35ProductionPhysicalHost(config,root,target,prepare,noWrite,{prepareOnly:true});assert.equal(p.result.state,'PRODUCTION_REAL_IMPORT_PREPARED');assert.equal(p.cleanup,'CLOSED');assert.equal(p.result.business_database_writes,false);assert.equal(written,0);assert.equal(api.clients[0].closed,1);assert.equal(api.clients[0].calls.some(s=>s.includes('standard_whole_package_')),false);
  await assert.rejects(()=>api.openReviewedFresh35ProductionPhysicalHost(config,root,target,prepare,noWrite),/AUTHORIZATION_REQUIRED/);assert.equal(written,0);assert.equal(api.clients[1].closed,1);
  await m.write(m.approval());
  const r=await api.openReviewedFresh35ProductionPhysicalHost(config,root,target,prepare,async c=>{
   written++;await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await c.query(m.sql.prepare,m.initValues());
   for(let i=0;i<m.steps.length;i++){const step=m.steps[i];await c.query(m.sql.step,[m.prepared.initialize.operation_id,i+1,step.method==='masterChunk'?'MASTER':step.method==='documentChunk'?'DOCUMENTS':'PUBLISH',JSON.stringify(step.request)])}
   await c.query(m.sql.finish,[m.prepared.initialize.operation_id]);await c.query('COMMIT');return 'COMMITTED';
  });assert.equal(r.result,'COMMITTED');assert.equal(r.cleanup,'CLOSED');assert.match(r.host_verification.production_import_authorization_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(r.host_verification.production_import_binding,m.binding);assert.equal(prepared,3);assert.equal(written,1);assert.equal(api.clients[2].closed,1);assert.equal(api.clients[2].calls.filter(s=>s==='COMMIT').length,1);
 }finally{await m.close()}
});

test('REAL original physical factory shortens its owned close deadline to the external batch window (OS/wire model)',async()=>{
 const m=await realImportAuthorityModel();try{
  const api=await productionPhysicalFactoryModel(m),a=m.approval();a.expiresAt=Date.now()+160;await m.write(a);
  await assert.rejects(()=>api.openReviewedFresh35ProductionPhysicalHost({host:'127.0.0.1',port:57639,database:proof.database_name,user:'MODEL_CONTROLLER',password:'MODEL_PRIVATE'},root,{...proof,catalog_sha256:'3'.repeat(64)},async()=>m.prepared,async c=>{
   await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await new Promise(r=>setTimeout(r,180));await c.query('COMMIT');
  }),/WINDOW_EXPIRED|CONNECTION_UNAVAILABLE/);
  assert.equal(api.clients[0].closed,1);assert(!api.clients[0].calls.includes('COMMIT'));
 }finally{await m.close()}
});
