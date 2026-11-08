import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {requestHash} from '../packages/application/src/request-hash.ts';
import {withReviewedWholeSession} from '../tools/unified-import/whole-host-session.mjs';
import {inspectWholePackage} from '../tools/unified-import/whole-package-inspect.ts';
import {createWholePackageSqlKernel} from '../tools/unified-import/whole-package-sql-kernel.ts';
const stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
// Executes the actual authority/guard source with explicitly modeled protected
// OS metadata and context. This does not mint genuine physical admission.
async function model(){
 const dir=await fs.mkdtemp(join(tmpdir(),'retained-inspection-')),path=join(dir,'inspection.json');
 const source=await fs.readFile(new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),'utf8');
 let body=source.slice(source.indexOf('export const FRESH35_PRODUCTION_IMPORT_AUTHORIZATION_PATH='),source.indexOf('const ordinaryAdmissions='));
 body=body.replace(/export const FRESH35_PRODUCTION_INSPECTION_PATH=.*?;/,`export const FRESH35_PRODUCTION_INSPECTION_PATH=${JSON.stringify(path)};`);
 const url=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const prefix=`import * as fs from 'node:fs/promises';import {constants} from 'node:fs';import {createHash} from 'node:crypto';
 import {parseStrictJson} from ${url('../packages/application/src/unified-import-contract.ts')};
 import {requestHash} from ${url('../packages/application/src/request-hash.ts')};
 import {requestHashIncremental} from ${url('../tools/unified-import/stream-typed-hash.mjs')};
 import {validateStandardImportRequest} from ${url('../packages/application/src/unified-import-execution.ts')};
 import {isNodeScryptPasswordHash} from ${url('../packages/authentication/src/passwords.ts')};
 const contexts=new WeakMap(),need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)},hash=b=>createHash('sha256').update(b).digest('hex');
 let current=true,root=true;export function revoke(){current=false}export function notRoot(){root=false}
 const normalized=s=>Object.create(s,{uid:{value:root?0n:501n}});
 async function open(p,flags){const f=await fs.open(p,flags);return{stat:async o=>normalized(await f.stat(o)),readFile:()=>f.readFile(),close:()=>f.close()}}
 async function lstat(p,o){return normalized(await fs.lstat(p,o))}async function assertTrustedRootPath(){}
 function fresh35HostContext(t){need(contexts.has(t),'GENUINE_FIXED_CONTEXT_REQUIRED');return contexts.get(t)}
 async function assertFresh35ProtectedRecordSnapshotCurrent(){need(current,'MODEL_RECORD_CHANGED')}
 async function assertFresh35HostCurrent(t){await assertFresh35ProtectedRecordSnapshotCurrent();return fresh35HostContext(t)}
 const describeFresh35CombinedTarget=t=>t;
 const operation={};const window={parametersSha256:'f'.repeat(64),value:{startsAt:Date.now()-10000,expiresAt:Date.now()+60000,authorizationReference:'MODEL READ ONLY'}};
 function installedRealWindowData(token){need(token===operation,'GENUINE_WINDOW_REQUIRED');return window}
 async function assertInstalledRealWindowCurrent(token){installedRealWindowData(token);need(current,'MODEL_WINDOW_CHANGED')}
 function assertInstalledRealBinding(token,b){installedRealWindowData(token);need(b.format==='FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1'&&b.installationRecordSha256==='1'.repeat(64)&&b.manifestSha256==='b'.repeat(64),'EXACT_REAL_BINDING_DIFFERS')}
 export function seed(){const token={};contexts.set(token,{productionImport:true,operation,envelope:{},recordFileSha256:'1'.repeat(64),target:{physical:{systemIdentifier:'123',databaseOid:'42'},proposal:{database:'synthetic',host:'127.0.0.1',port:57639,controller:'MODEL_CONTROLLER'}},record:{programSha256:'2'.repeat(64),catalogSha256:'a'.repeat(64),binding:{sourceSetSha256:'3'.repeat(64)}}});return token}
 export {fresh35HostContext,assertFresh35HostCurrent,installedRealWindowData};
 `;
 const moduleURL=stub(prefix+body),api=await import(moduleURL),context=api.seed(),id={batchId:'11111111-1111-4111-8111-111111111111',documentBatchId:'22222222-2222-4222-8222-222222222222',packageSha256:'b'.repeat(64),planSha256:'a'.repeat(64),namespace:'SYNTHETIC_INSPECT',cutoffAt:'2026-11-02T04:00:00Z'};
 const initialize={protocol:'STANDARD_IMPORT_SQL_V1',operation_id:'00000000-0000-4000-8000-000000000001',request_key:'original-key',batch_id:id.batchId,plan_sha256:id.planSha256,package_manifest_sha256:id.packageSha256,namespace:id.namespace,cutoff_at:id.cutoffAt,payload:{document_batch_id:id.documentBatchId}};
 const prepared={packageKind:'REAL',identity:id,initialize,encodedScrypt:'naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128),preflight:{summarySha256:'c'.repeat(64),indexSha256:'d'.repeat(64),indexBytes:4096}};
 const binding={format:'FRESH35_PRODUCTION_REAL_IMPORT_BINDING_V1',installationRecordSha256:'1'.repeat(64),installProgramSha256:'2'.repeat(64),sourceSetSha256:'3'.repeat(64),targetSha256:'4'.repeat(64),catalogSha256:'5'.repeat(64),manifestSha256:id.packageSha256,planSha256:id.planSha256,initializerSha256:requestHash({initialize,encodedScrypt:prepared.encodedScrypt}),stepsSha256:'6'.repeat(64),stepCount:7,sourceNamespace:id.namespace,cutoffAt:id.cutoffAt,baselineBatchId:id.batchId,documentBatchId:id.documentBatchId,initializerOperationId:initialize.operation_id,initializerRequestKey:initialize.request_key};
 const description=()=>({format:'FRESH35_PRODUCTION_INSPECTION_V1',decision:'INSPECT_EXACT_ORIGINAL_REAL_BATCH_READ_ONLY',binding:{...binding},preflight:{...prepared.preflight},operationParametersSha256:'f'.repeat(64),startsAt:Date.now()-1000,expiresAt:Date.now()+30000,authorizationReference:'MODEL READ ONLY'});
 const write=a=>fs.writeFile(path,JSON.stringify(a),{mode:0o600});
 const authorize=async()=>{await write(description());const token=await api.loadFresh35ProductionInspectionAuthorization(context,prepared);return api.fresh35ProductionImportQueryGuard(context,token,prepared)};
 return{api,moduleURL,context,prepared,binding,description,write,authorize,path,close:()=>fs.rm(dir,{recursive:true,force:true})};
}
const begin='BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY',role='SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2',inspect='SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json';
test('independent finite read-only description binds original initializer/index and never renews writer authority (OS model)',async()=>{
 const m=await model();try{
  const guard=await m.authorize();assert.deepEqual(guard.binding,m.binding);
  await guard.check(begin);await guard.check(role);await guard.check(inspect,[JSON.stringify(m.prepared.initialize),m.prepared.encodedScrypt]);
  for(const sql of ['BEGIN ISOLATION LEVEL READ COMMITTED','COMMIT','SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2','SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json','SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json'])await assert.rejects(guard.check(sql,[]),/INSPECTION_SQL_NOT_ALLOWED/);
  const changed=structuredClone(m.prepared.initialize);changed.request_key='other';await assert.rejects(guard.check(inspect,[JSON.stringify(changed),m.prepared.encodedScrypt]),/INITIALIZER_BINDING_DIFFERS/);
  m.api.revoke();await assert.rejects(guard.check(inspect,[]),/MODEL_WINDOW_CHANGED/);await guard.check('ROLLBACK');await guard.close();
 }finally{await m.close()}
});
test('read-only description rejects wrong epoch/window, source, original key/hash, preflight and owner (OS model)',async()=>{
 const m=await model();try{
  for(const mutate of [a=>a.decision='AUTHORIZE_EXACT_REAL_BATCH_IMPORT_AND_READBACK',a=>a.operationParametersSha256='0'.repeat(64),a=>a.expiresAt=Date.now()-1,a=>a.preflight.indexSha256='0'.repeat(64),a=>a.preflight.summarySha256='0'.repeat(64),a=>a.binding.initializerRequestKey='other',a=>a.binding.initializerOperationId='00000000-0000-4000-8000-000000000099',a=>a.binding.planSha256='0'.repeat(64),a=>a.binding.initializerSha256='0'.repeat(64),a=>a.binding.installationRecordSha256='0'.repeat(64)]){
   const a=m.description();mutate(a);await m.write(a);await assert.rejects(m.api.loadFresh35ProductionInspectionAuthorization(m.context,m.prepared));
  }
  await m.write(m.description());await assert.rejects(m.api.loadFresh35ProductionInspectionAuthorization({},m.prepared),/GENUINE_FIXED_CONTEXT/);
  m.api.notRoot();await assert.rejects(m.api.loadFresh35ProductionInspectionAuthorization(m.context,m.prepared),/PROTECTED_DESCRIPTION/);
 }finally{await m.close()}
});
test('description replacement invalidates the same read-only guard but retains rollback cleanup (OS model)',async()=>{
 const m=await model();try{const g=await m.authorize();await fs.rename(m.path,m.path+'.old');await m.write(m.description());await assert.rejects(g.check(begin),/AUTHORIZATION_CHANGED/);await g.check('ROLLBACK')}finally{await m.close()}
});
// Transport frames only: no socket, PG, real catalog, or physical admission.
test('actual controlled wire/kernel inspect rolls back and closes after committed, absent, conflict or lost rollback ACK (wire model)',async()=>{
 for(const outcome of ['ABSENT','COMMITTED','CONFLICT','BAD_ROLLBACK']){
  const m=await model();try{
   const guard=await m.authorize(),{Client}=await import('pg'),c=new Client({pipeline:false}),connection=c.connection,sent=[];let closed=0;
   c.on('error',()=>{});c._attachListeners(connection);c._connecting=true;connection.emit('readyForQuery',{status:'I'});
   const end=c.end.bind(c);c.end=(...a)=>{closed++;return end(...a)};
   // Parameter binding is checked by the actual guard/kernel above; transport
   // frames model only SQL completion and ReadyForQuery, without a socket.
   const nativeQuery=c.query;c.query=sql=>nativeQuery.call(c,sql);
   connection.query=sql=>{sent.push(sql);queueMicrotask(()=>{
    const command=sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET ')?'SET':sql.startsWith('SELECT ')?'SELECT':outcome==='BAD_ROLLBACK'&&sql==='ROLLBACK'&&sent.filter(x=>x==='ROLLBACK').length===2?'COMMIT':sql;
    connection.emit('commandComplete',{text:command});connection.emit('readyForQuery',{status:command==='ROLLBACK'||command==='COMMIT'?'I':'T'});
   })};
   // The controlled wire is real; the one SQL result is modeled without
   // injecting arbitrary rows or pretending a database closure was verified.
   const proof={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123',database_oid:'42',database_name:'synthetic',catalog_sha256:'a'.repeat(64)};
   const r=await withReviewedWholeSession(c,{},proof,proof,async controlled=>{
    const observer={discard:()=>controlled.discard(),async query(sql,values){const ack=await controlled.query(sql,values);if(sql!==inspect)return ack;if(outcome==='CONFLICT')throw Error('MODELED_CONFLICT');return{...ack,rows:[{result_json:JSON.stringify(outcome==='COMMITTED'?{state:'COMMITTED',packageSha256:m.prepared.identity.packageSha256,planSha256:m.prepared.identity.planSha256,summary:{}}:{state:'ABSENT'})}]}}};
    return inspectWholePackage(observer,m.prepared.identity,m.prepared.initialize,createWholePackageSqlKernel(m.prepared.encodedScrypt));
   },()=>proof,'FRESH35_RETIRED152_V1',{fresh35ExpiresAt:guard.expiresAt,authorizedQuery:guard.check});
   assert.equal(r.result.state,({ABSENT:'ABSENT',COMMITTED:'COMMITTED_RECEIPT_FOUND',CONFLICT:'INSPECT_FAILED',BAD_ROLLBACK:'UNKNOWN'})[outcome]);assert.equal(r.cleanup,'CLOSED');assert.equal(closed,1);
   assert.equal(sent.filter(x=>x==='ROLLBACK').length,2);assert(!sent.includes('COMMIT'));assert(!sent.some(x=>/_prepare_v2|_step_v2|_finish_v2/.test(x)));
  }finally{await m.close()}
 }
});

test('original physical factory chooses the read-only consumer without full-step binding or writer authorization (OS/wire model)',async()=>{
 const m=await model();try{
  await m.write(m.description());
  let body=(await fs.readFile(new URL('../tools/unified-import/whole-host-session.mjs',import.meta.url),'utf8')).split('export async function openReviewedFresh35ProductionPhysicalHost(')[1];
  body='export async function openReviewedFresh35ProductionPhysicalHost('+body;
  const host=stub(`import * as api from ${JSON.stringify(m.moduleURL)};const context=api.seed();export const fresh35HostContext=api.fresh35HostContext,assertFresh35HostCurrent=api.assertFresh35HostCurrent,loadFresh35ProductionInspectionAuthorization=api.loadFresh35ProductionInspectionAuthorization,fresh35ProductionImportQueryGuard=api.fresh35ProductionImportQueryGuard;export async function loadFresh35ProductionImportContext(){return context}export async function loadFresh35HostContext(){throw Error('WRONG_CONTEXT')}export async function verifyFresh35InstalledV1(){return{live_catalog_sha256:'a'.repeat(64),source_profile_sha256:'b'.repeat(64)}}export async function describeFresh35ProductionImportBinding(){throw Error('STEPS_BINDING_FORBIDDEN')}export async function loadFresh35ProductionImportAuthorization(){throw Error('WRITER_AUTHORIZATION_FORBIDDEN')}`);
  body=body.replace("'./fresh35-host-session.mjs'",JSON.stringify(host)).replace("'../../scripts/release/unified-install/fresh35-combined-target-v1.mjs'",JSON.stringify(stub('export const describeFresh35CombinedTarget=t=>t;'))).replace("'../../scripts/release/unified-install/whole-sales-admission-v1.mjs'",JSON.stringify(stub("export const WHOLE_SALES_ADMISSION_MODULE_SHA256='MODEL';export async function withVerifiedFresh35AdmissionV1(v,g,c,t,work){return work({modelAdmission:true})}"))).replace("'../../scripts/release/unified-install/fresh35-combined-source-v1.mjs'",JSON.stringify(stub("export function describeFresh35CombinedSource(){return{currentSourcePins:[{path:'tools/unified-import/whole-host-session.mjs',sha256:'MODEL'},{path:'scripts/release/unified-install/whole-sales-admission-v1.mjs',sha256:'MODEL'}]}}"))).replace("const {Client}=await import('pg');",'const Client=ModelClient;');
  const prefix=`import {withReviewedWholeSession,closePhysical,markWholeHostFailure} from ${JSON.stringify(new URL('../tools/unified-import/whole-host-session.mjs',import.meta.url).href)};import {validateStandardImportTarget} from ${JSON.stringify(new URL('../packages/application/src/unified-import-execution.ts',import.meta.url).href)};import {installedRealWindowData} from ${JSON.stringify(m.moduleURL)};const loadedPhysicalHostSha256='MODEL';export const clients=[];const explicitZeroApprovalDescriptor=()=>{throw Error('UNUSED')};
  class ModelClient{constructor(){this.state='I';this.calls=[];this.closed=0;this.readyForQuery=true;this._queryable=true;this._ending=false;this.pipeline=false;this._activeQuery=null;this._queryQueue=[];this._sentQueryQueue=[];this.connection={};clients.push(this)}on(){}async connect(){}async end(){this.closed++;this._ending=true}getTransactionStatus(){return this.state}async query(sql){this.calls.push(sql);const command=sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET ')?'SET':sql.startsWith('SELECT ')?'SELECT':sql;this.state=command==='ROLLBACK'?'I':'T';return{command,rows:[{result_json:'{"state":"ABSENT"}'}]}}}
  const runWholeSession=(c,s,r,t,w,v,p,_trusted,o)=>withReviewedWholeSession(c,s,r,t,w,v,p,o);`;
  const api=await import(stub(prefix+body)),target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123',database_oid:'42',database_name:'synthetic',catalog_sha256:'a'.repeat(64)};
  const r=await api.openReviewedFresh35ProductionPhysicalHost({host:'127.0.0.1',port:57639,database:'synthetic',user:'MODEL_CONTROLLER',password:'MODEL_PRIVATE'},'/model',target,async admission=>{assert.equal(admission.modelAdmission,true);return m.prepared},c=>inspectWholePackage(c,m.prepared.identity,m.prepared.initialize,createWholePackageSqlKernel(m.prepared.encodedScrypt)),{inspectOnly:true});
  assert.equal(r.result.state,'ABSENT');assert.equal(r.cleanup,'CLOSED');assert.equal(api.clients[0].closed,1);assert.deepEqual(api.clients[0].calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK',begin,role,inspect,'ROLLBACK']);
  await assert.rejects(api.openReviewedFresh35ProductionPhysicalHost({},'/model',target,()=>{},()=>{},{inspectOnly:true,prepareOnly:true}),/OPTIONS_INVALID/);
 }finally{await m.close()}
});
