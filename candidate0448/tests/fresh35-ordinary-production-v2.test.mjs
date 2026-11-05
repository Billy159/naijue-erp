/** Startup/lease lifecycle model using the actual host implementation body.
 * Fixed-record/source/catalog I/O are explicitly synthetic stubs in a private
 * data-URL module; these tests cannot issue a capability in the real module. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import * as real from '../tools/unified-import/fresh35-host-session.mjs';
const original=await readFile(new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),'utf8');
const role='erp_unified27_runtime_2393dbc6db9581c2';
async function model(){
 const root=await mkdtemp(join(tmpdir(),'ordinary35-model-')),reference=join(root,'references');
 const paths={baselineDirectory:join(reference,'baseline'),modelPath:join(reference,'model.json'),functionsPath:join(reference,'functions.json')};
 const recordPath=join(root,'record.json'),hostPath='tools/unified-import/fresh35-host-session.mjs',recordModulePath='scripts/release/unified-install/fresh35-combined-record-v1.mjs';
 for(const path of [join(root,hostPath),join(root,recordModulePath),paths.modelPath,paths.functionsPath,join(reference,'INDEX.json'),join(paths.baselineDirectory,'source.json')]){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'SYNTHETIC MODEL ONLY');}
 const t={purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{database:'synthetic_model',runtime:'model_login'},physical:{systemIdentifier:'123',databaseOid:'42',serverVersionNum:'170011'},ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:reference}};
 const record={binding:{sourceSetSha256:'b'.repeat(64)},synthetic_only:true};await writeFile(recordPath,JSON.stringify(record)+'\n');
 const catalogStub='data:text/javascript;base64,'+Buffer.from("export function fresh35CombinedOrdinaryCatalogSql(){return {guardSql:'MODEL_GUARDS',observationSql:'MODEL_OBSERVATION'}};export function validateFresh35CombinedOrdinaryCatalogObservation(raw){if(raw!=='SYNTHETIC_ONLY')throw Error('MODEL_CATALOG_REJECTED')}").toString('base64');
 const prefix=`import {lstat,readFile} from 'node:fs/promises';import {watch} from 'node:fs';import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
 const moduleRoot=${JSON.stringify(root)},FRESH35_COMBINED_RECORD_PATH=${JSON.stringify(recordPath)},loadedHostSha256='a'.repeat(64),FRESH35_COMBINED_RECORD_MODULE_SHA256='c'.repeat(64),t=${JSON.stringify(t)},record=${JSON.stringify(record)};
 const hash=x=>createHash('sha256').update(x).digest('hex'),need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)},ack=(r,tag)=>need(r?.command===tag,'ACK_INVALID');
 async function assertTrustedRootPath(){}async function assertTrustedRootTree(){}async function loadFresh35CombinedRecordEnvelope(){return record}async function reconstructFresh35InstalledProductionTargetV2(){return {}}function describeFresh35CombinedTarget(){return t}
 async function resolveFresh35ReferenceInputPaths(){return ${JSON.stringify(paths)}}async function loadFresh35CombinedSource(){return {}}function describeFresh35CombinedSource(){return {currentSourcePins:[{path:${JSON.stringify(hostPath)},sha256:loadedHostSha256},{path:${JSON.stringify(recordModulePath)},sha256:FRESH35_COMBINED_RECORD_MODULE_SHA256}]}}
 async function buildFresh35CombinedCatalog(){return {}}async function compileFresh35CombinedProgram(){return {}}function validateFresh35CombinedRecord(){return record}async function assertFresh35CombinedSourcesCurrent(){}async function assertFresh35CombinedCatalogCurrent(){}
 `;
 const tail=original.slice(original.indexOf('const ordinaryAdmissions=')).replace("'../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs'",JSON.stringify(catalogStub));
 const api=await import('data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64'));
 const row={systemIdentifier:'123',databaseOid:'42',database:'synthetic_model',currentUser:'model_login',sessionUser:'model_login',serverAddress:'172.20.0.4',serverPort:5432,postmasterStart:'NEW_ACTUAL_START_NOT_INSTALL_TIME',backendPid:42,serverVersionNum:'170011',rowSecurity:'on',replicationRole:'origin',recovery:false,ordinaryAttributes:true,lifetimeMatches:true,memberships:[[role,false,false,true]]};
 const calls=[],clients=[];let failure;
 function client(){let status='I',switched=false,released=false;const c={getTransactionStatus:()=>status,release(error){released=error===true},get released(){return released},async query(sql){calls.push(sql);if(sql.includes('pg_control_system')){assert.equal(switched,false,'direct LOGIN permission must precede SET ROLE');if(failure==='identity')throw Error('MODEL_IDENTITY_ERROR');return {command:'SELECT',rows:[structuredClone(row)]};}if(sql.startsWith('BEGIN')){status='T';return {command:'BEGIN'}}if(sql==='ROLLBACK'){status='I';switched=false;return {command:'ROLLBACK'}}if(sql.startsWith('SET LOCAL ROLE')){switched=true;return {command:'SET'}}if(sql==='MODEL_GUARDS'){if(failure==='catalog')throw Error('MODEL_CATALOG_ERROR');return [{command:'DO'},{command:'DO'}]}if(sql==='MODEL_OBSERVATION')return {command:'SELECT',rows:[{catalog_json:'SYNTHETIC_ONLY'}]};throw Error('UNEXPECTED_MODEL_QUERY')}};clients.push(c);return c;}
 const pool={async connect(){return client()}},connection={host:'postgres',port:5432,database:'synthetic_model',user:'model_login'};
 return {api,root,recordPath,hostPath:join(root,hostPath),pool,connection,row,calls,clients,client,fail:x=>failure=x,dispose:()=>rm(root,{recursive:true,force:true})};
}
test('ordinary startup uses one pool/lease and direct LOGIN identity before interface catalog; business checks do not repeat static scans',async()=>{
 const m=await model();let cap;
 try{cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection);assert.equal(m.clients.length,1);assert.equal(m.clients[0].released,true);assert.equal(m.calls.filter(s=>s==='MODEL_GUARDS').length,1);assert(!m.calls.includes('COMMIT'));
 const description=m.api.describeFresh35OrdinaryAdmissionV2(cap);assert.equal(description.postmasterStart,'NEW_ACTUAL_START_NOT_INSTALL_TIME');assert.equal(description.serverPort,5432);assert(Object.isFrozen(description));assert(!JSON.stringify(description).includes('password'));
 assert.throws(()=>real.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/,'a model module capability cannot authorize the real module');
 const c=m.client();await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,c);const before=m.calls.length;await m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool);assert.equal(m.calls.length,before,'transaction check neither rescans catalog nor calls pg_control_system under SET ROLE');
 await assert.rejects(()=>m.api.assertFresh35OrdinaryLeaseV2(cap,{},c),/SAME_POOL/);await assert.rejects(()=>m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection),/EXCLUSIVE_STARTUP/);
 m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose();}
});
test('new postmaster, wrong physical identity, ordinary role or endpoint invalidates the existing startup proof',async()=>{
 for(const delta of [{postmasterStart:'RESTARTED'},{systemIdentifier:'999'},{databaseOid:'99'},{serverPort:1111},{sessionUser:'owner'},{memberships:[[role,true,false,true]]},{lifetimeMatches:false},{ordinaryAttributes:false}]){
  const m=await model();let cap;try{cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection);Object.assign(m.row,delta);await assert.rejects(()=>m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client()),/PHYSICAL_OR_LOGIN_DIFFERS/);assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);}finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose();}
 }
});
test('record/source changes revoke startup proof; failures roll back and release the original lease',async()=>{
 for(const kind of ['record','source','catalog']){
  const m=await model();let cap;try{
   if(kind==='catalog'){m.fail('catalog');await assert.rejects(()=>m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection),/MODEL_CATALOG_ERROR/);assert.equal(m.calls.at(-1),'ROLLBACK');assert.equal(m.clients[0].released,true);continue;}
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection);await writeFile(kind==='record'?m.recordPath:m.hostPath,'CHANGED MODEL SOURCE');
   if(kind==='source')await new Promise(resolve=>setTimeout(resolve,30));
   await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/ORDINARY_/);assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose();}
 }
});
test('unprotected JSON capability is rejected by real ordinary entrypoints without a database call',async()=>{
 const fake={profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2'};assert.throws(()=>real.describeFresh35OrdinaryAdmissionV2(fake),/ACTIVE_ADMISSION/);await assert.rejects(()=>real.assertFresh35OrdinaryAdmissionCurrentV2(fake,{}),/SAME_POOL/);
 let connected=false;await assert.rejects(()=>real.admitFresh35OrdinaryPoolV2({async connect(){connected=true}}, {host:'postgres',port:5432,database:'unknown',user:'unknown'}),/PROTECTED_RECORD|ORDINARY_RUNTIME_REQUIRED/);assert.equal(connected,false);
});
