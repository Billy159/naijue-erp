/** Startup/lease lifecycle model using the actual host implementation body.
 * Fixed-record/source/catalog I/O are explicitly synthetic stubs in a private
 * data-URL module; these tests cannot issue a capability in the real module. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename,unlink} from 'node:fs/promises';import {once} from 'node:events';import {tmpdir} from 'node:os';import {join} from 'node:path';
import * as real from '../tools/unified-import/fresh35-host-session.mjs';
const original=await readFile(new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),'utf8');
const role='erp_unified27_runtime_2393dbc6db9581c2';
const firstR3={database:'erp_fresh35_20261110_r3',host:'127.0.0.1',port:56791,
 workspaceDirectory:'/var/lib/naijue-erp/fresh35-production/fresh35-first-production-20261110-r3',
 admin:'erp35_admin_20261110_r3',owner:'erp35_owner_20261110_r3',
 controller:'erp35_controller_20261110_r3',runtime:'erp35_runtime_20261110_r3'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const encodeProof=value=>JSON.stringify(value,(_key,member)=>member&&Object.getPrototypeOf(member)===Object.prototype
 ? Object.fromEntries(Object.keys(member).sort().map(key=>[key,member[key]])) : member)+'\n';
async function model({synthetic=false,recordParentPrivate=false,formal=false,initial=false,normal=false,initialRoleUntil,proposal={}}={}){
 const root=await mkdtemp(join(tmpdir(),'ordinary35-model-')),reference=join(root,synthetic?'reference-inputs':'references');
 const paths={baselineDirectory:join(reference,'baseline'),modelPath:join(reference,'model.json'),functionsPath:join(reference,'functions.json')};
 const networkWorkspace=join(root,'network-workspace'),networkPath=join(networkWorkspace,'bootstrap-network-observation.json');
 if(synthetic){await mkdir(networkWorkspace,{mode:0o711});await writeFile(networkPath,'SYNTHETIC MODEL NETWORK OBSERVATION',{mode:0o444})}
 const recordDirectory=recordParentPrivate?join(root,'authority'):root;if(recordParentPrivate)await mkdir(recordDirectory,{mode:0o711});
 const recordPath=join(recordDirectory,'record.json'),hostPath='tools/unified-import/fresh35-host-session.mjs',recordModulePath='scripts/release/unified-install/fresh35-combined-record-v1.mjs';
 for(const path of [join(root,hostPath),join(root,recordModulePath),paths.modelPath,paths.functionsPath,join(reference,'INDEX.json'),join(paths.baselineDirectory,'source.json')]){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'SYNTHETIC MODEL ONLY');}
 const t={purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{database:'synthetic_model',runtime:'model_login'},physical:{systemIdentifier:'123',databaseOid:'42',serverVersionNum:'170011'},ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.4',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:reference}};
 const now=Date.now(),expiry=now+300000,serviceFile=join(root,'service.json'),oldRoot=join(root,'installed');
 const pgDate=n=>new Date(n).toISOString().replace('T',' ').replace('Z','+00');
 if(formal){
  t.proposal={...firstR3,...proposal};
  t.physical.postmasterStart=pgDate(now-300000);
  t.ordinary={connectHost:t.proposal.host,connectPort:t.proposal.port,serverAddress:t.proposal.host,serverPort:t.proposal.port,
   runtimeLoginValidUntil:new Date(now-2000).toISOString(),referenceDirectory:reference};
  await mkdir(oldRoot);await writeFile(join(oldRoot,'source.mjs'),'SYNTHETIC HISTORICAL SOURCE');
  await mkdir(join(oldRoot,recordModulePath,'..'),{recursive:true});
  await writeFile(join(oldRoot,recordModulePath),'SYNTHETIC HISTORICAL RECORD MODULE');
 }
 if(synthetic){delete t.purpose;t.format='FRESH35_COMBINED_TARGET_BINDING_V1';t.startsAt=now-1000;t.expiresAt=expiry;t.proposal={database:'synthetic_fresh35_20261105_r9',runtime:'fresh35_runtime_20261105_r9',host:'127.0.0.1',port:57639,workspaceDirectory:networkWorkspace};t.physical.postmasterStart='2026-11-05 03:00:00+00';t.ordinary={connectHost:'127.0.0.1',connectPort:57639,serverAddress:'127.0.0.1',serverPort:57639,runtimeLoginValidUntil:null,referenceDirectory:reference};}
 if(initial)t.ordinary.runtimeLoginValidUntil=initialRoleUntil===undefined?new Date(now+120000).toISOString():
  initialRoleUntil==='infinity'?null:initialRoleUntil;
 if(normal)t.ordinary.runtimeLoginValidUntil=null;
 const record={binding:{sourceSetSha256:'b'.repeat(64),...(formal?{targetSha256:hash(JSON.stringify(t))}:{})},synthetic_only:true,
  authorizationSha256:'a'.repeat(64),
  ...(synthetic?{format:'FRESH35_COMBINED_INSTALLATION_RECORD_V1',target:t}:formal?{format:'FRESH35_COMBINED_INSTALLATION_RECORD_V2',target:t}:{})};
 const recordBytes=JSON.stringify(record)+'\n';await writeFile(recordPath,recordBytes);
 const pins={installationRecordSha256:hash(recordBytes),...record.binding};
 const proof={format:'FRESH35_CURRENT_PRODUCTION_SERVICE_V1',requestKey:'t45-first-20261110-r3-recovery-restart-20261110-01',
  oldStopRequestKey:'t45-first-20261110-r3-recovery-stop-20261110-01',authorizationSha256:'a'.repeat(64),
  previousStopReceiptSha256:'c'.repeat(64),previousStopTerminalSha256:'d'.repeat(64),checkedAt:now-300,
  ...pins,dataDirectory:t.proposal.workspaceDirectory+'/data',dataDirectoryIdentity:{device:8,inode:22,uid:61035,gid:61035,mode:448},
  physical:{...t.physical,postmasterStart:pgDate(now-500)},runtimeRole:t.proposal.runtime,runtimeLoginValidUntil:new Date(now+120000).toISOString(),
  sharedPostgresNamespace:{format:'OWNED_POSTGRES_SHARED_NAMESPACE_V1',...pins,creationOperationId:'first-operation',
   serviceLeaseExpiresAt:now+180000,container:{id:'e'.repeat(64),name:'t45-fresh35-first-production-20261110-r3-recovery',imageId:'sha256:'+'f'.repeat(64),
    startedAt:new Date(now-2000).toISOString(),hostPid:100,startTicks:'200',networkNamespace:{device:4,inode:5},
    frontEndpoint:{id:'1'.repeat(64),aliases:['naijue-rewrite-fresh35-first-20261110-r3-app']}}},
  postmaster:{pid:20,starttime:'301',exe:'/usr/bin/postgres'},guardian:{pid:21,starttime:'300',exe:'/usr/bin/python3'}};
 if(initial){
  proof.format='FRESH35_INITIAL_PRODUCTION_SERVICE_V1';
  proof.requestKey='t45-first-r3-native-facts-installed-20261110-01';
  proof.serviceReceiptSha256='9'.repeat(64);
  delete proof.oldStopRequestKey;delete proof.previousStopReceiptSha256;delete proof.previousStopTerminalSha256;
  proof.physical.postmasterStart=t.physical.postmasterStart;
  proof.runtimeLoginValidUntil=initialRoleUntil===undefined?t.ordinary.runtimeLoginValidUntil:initialRoleUntil;
  proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3';
  proof.sharedPostgresNamespace.container.startedAt=new Date(now-400000).toISOString();
 }
 if(normal){
  proof.format='FRESH35_CURRENT_PRODUCTION_SERVICE_V2';
  proof.requestKey='t45-first-r3-native-service-start-20261110-01';
  proof.authorizationSha256='8'.repeat(64);proof.serviceReceiptSha256='9'.repeat(64);
  delete proof.oldStopRequestKey;delete proof.previousStopReceiptSha256;delete proof.previousStopTerminalSha256;
  proof.runtimeLoginValidUntil=null;
  proof.dataDirectoryIdentity.device=66304;proof.dataDirectoryIdentity.inode=13502421;
  proof.sharedPostgresNamespace.creationOperationId=proof.requestKey;
  proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3-service-01';
 }
 const catalogStub='data:text/javascript;base64,'+Buffer.from("export function fresh35CombinedOrdinaryCatalogSql(){return {guardSql:'MODEL_GUARDS',observationSql:'MODEL_OBSERVATION'}};export function validateFresh35CombinedOrdinaryCatalogObservation(raw){if(raw!=='SYNTHETIC_ONLY')throw Error('MODEL_CATALOG_REJECTED')};export const fresh35CombinedSyntheticOrdinaryCatalogSql=fresh35CombinedOrdinaryCatalogSql;export const validateFresh35CombinedSyntheticOrdinaryCatalogObservation=validateFresh35CombinedOrdinaryCatalogObservation").toString('base64');
 const prefix=`import {lstat as nativeLstat,open as nativeOpen,readFile} from 'node:fs/promises';import {watch as nativeWatch,writeFileSync,renameSync,unlinkSync,constants} from 'node:fs';import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
 import {decodeUtf8,parseStrictJson} from ${JSON.stringify(new URL('../packages/application/src/unified-import-contract.ts',import.meta.url).href)};
 const moduleRoot=${JSON.stringify(root)},FRESH35_COMBINED_RECORD_PATH=${JSON.stringify(recordPath)},loadedHostSha256='a'.repeat(64),FRESH35_COMBINED_RECORD_MODULE_SHA256='c'.repeat(64),t=${JSON.stringify(t)},record=${JSON.stringify(record)};
 const serviceFile=${JSON.stringify(serviceFile)},oldRoot=${JSON.stringify(oldRoot)};
 const fileStat=(path,s)=>path===serviceFile?Object.create(s,{uid:{value:0n}}):s;
 const lstat=async(path,options)=>fileStat(path,await nativeLstat(path,options));
 async function open(path,flags){const f=await nativeOpen(path,flags);return {stat:async options=>fileStat(path,await f.stat(options)),readFile:()=>f.readFile(),close:()=>f.close()}}
 async function stat(path){need(path==='/proc/self/ns/net','MODEL_OS_PATH');return netns}
 let netns={dev:4n,ino:5n},historicalModel='same-model';export function replaceNamespace(){netns={dev:4n,ino:6n}}
 export function changeHistoricalModel(){historicalModel='different'}
 const exactImportKeys=(o,keys)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
 const hash=x=>createHash('sha256').update(x).digest('hex'),need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)},ack=(r,tag)=>need(r?.command===tag,'ACK_INVALID');
 let clock=${now};const Date=class extends globalThis.Date{static now(){return clock}};export function expire(){clock=${expiry+1}};export function setTime(value){clock=value};function bindFresh35CombinedTarget(){return {}};
 const snapshots=new WeakMap(),watchers=new Set(),watchedPaths=[];let swap;
 export function setSwap(value){swap=value}export function activeWatchers(){return watchers.size}export function firstWatcher(){return watchers.values().next().value}export function modelWatchedPaths(){return [...watchedPaths]}
 // Finite Linux permission projection only: actualroot0711/ordinary61035 lacks directory read. Other watches remain native.
 function watch(path,callback){watchedPaths.push(path);if(${recordParentPrivate}&&path===dirname(FRESH35_COMBINED_RECORD_PATH))throw Object.assign(Error('MODEL_PRIVATE_RECORD_PARENT_READ_DENIED'),{code:'EACCES'});const w=nativeWatch(path,callback);watchers.add(w);const close=w.close.bind(w);w.close=()=>{watchers.delete(w);return close()};return w}
 const identity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
 const importFileIdentity=identity;
 function changeRecord(stage){if(swap!==stage)return;if(stage.endsWith('delete'))unlinkSync(FRESH35_COMBINED_RECORD_PATH);else if(stage.endsWith('replace')){writeFileSync(FRESH35_COMBINED_RECORD_PATH+'.new','CHANGED GENERATION');renameSync(FRESH35_COMBINED_RECORD_PATH+'.new',FRESH35_COMBINED_RECORD_PATH)}else writeFileSync(FRESH35_COMBINED_RECORD_PATH,'CHANGED SAME INODE')}
 export function modelRelease(){changeRecord('release-replace');if(swap==='release-error')throw Error('MODEL_RELEASE_ERROR')}
 async function assertTrustedRootPath(){}async function assertTrustedRootTree(){}async function loadFresh35CombinedRecordEnvelope(){const before=await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true}),bytes=await readFile(FRESH35_COMBINED_RECORD_PATH);snapshots.set(record,{identity:identity(before),sha256:hash(bytes)});return record}
 function describeFresh35ProtectedRecordSnapshot(e){return snapshots.get(e)}
 async function assertFresh35ProtectedRecordSnapshotCurrent(e,bytes=false){const s=snapshots.get(e);need(s&&identity(await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true}))===s.identity,'PROTECTED_RECORD_GENERATION_CHANGED');if(bytes)need(hash(await readFile(FRESH35_COMBINED_RECORD_PATH))===s.sha256,'PROTECTED_RECORD_BYTES_CHANGED')}
 async function reconstructFresh35InstalledProductionTargetV2(){return {}}function describeFresh35CombinedTarget(){return t}
 async function resolveFresh35ReferenceInputPaths(){return ${JSON.stringify(paths)}}async function loadFresh35CombinedSource(){return {}}function describeFresh35CombinedSource(){return {currentSourcePins:[{path:${JSON.stringify(hostPath)},sha256:loadedHostSha256},{path:${JSON.stringify(recordModulePath)},sha256:FRESH35_COMBINED_RECORD_MODULE_SHA256}]}}
 async function buildFresh35CombinedCatalog(){return {}}function describeFresh35CombinedCatalog(){return {modelSha256:'same-model'}}
 async function compileFresh35CombinedProgram(){return {}}function validateFresh35CombinedRecord(){if(${formal})throw Error('MODEL_CURRENT_PROGRAM_CANNOT_VALIDATE_OLD_RECORD');for(const stage of ['validate-replace','validate-overwrite','validate-delete'])changeRecord(stage);return record}async function assertFresh35CombinedSourcesCurrent(){changeRecord('after-watch-replace')}async function assertFresh35CombinedCatalogCurrent(){}
 async function modelInstalledModule(name){return{
  'fresh35-combined-source-v1.mjs':{resolveFresh35ReferenceInputPaths,async loadFresh35CombinedSource(root){need(root===oldRoot,'MODEL_HISTORICAL_ROOT');return {}},describeFresh35CombinedSource:()=>({sourceSetSha256:record.binding.sourceSetSha256,currentSourcePins:[{path:'source.mjs'},{path:'scripts/release/unified-install/fresh35-combined-record-v1.mjs',sha256:'d'.repeat(64)}]}),assertFresh35CombinedSourcesCurrent},
  'fresh35-combined-target-v1.mjs':{reconstructFresh35InstalledProductionTargetV2},
  'fresh35-combined-catalog-v1.mjs':{buildFresh35CombinedCatalog,describeFresh35CombinedCatalog:()=>({modelSha256:historicalModel}),assertFresh35CombinedCatalogCurrent},
  'fresh35-combined-lifecycle-v1.mjs':{compileFresh35CombinedProgram},
  'fresh35-combined-record-v1.mjs':{loadFresh35CombinedRecordEnvelope,describeFresh35ProtectedRecordSnapshot,validateFresh35CombinedRecord:()=>record,assertFresh35ProtectedRecordSnapshotCurrent,FRESH35_COMBINED_RECORD_MODULE_SHA256:'d'.repeat(64)}
 }[name]}
 `;
 const tail=original.slice(original.indexOf('const ordinaryAdmissions='))
  .replace('function ordinaryPgMicroseconds(', 'export function ordinaryPgMicroseconds(')
  .replace("'../../scripts/release/unified-install/fresh35-combined-catalog-v1.mjs'",JSON.stringify(catalogStub))
  .replace("const ordinaryInstalledSourceRoot='/opt/naijue-erp/fresh35-combined-v1';",'const ordinaryInstalledSourceRoot=oldRoot;')
  .replace("const currentProductionServicePath='/run/naijue-rewrite/current-production-service.json';",'const currentProductionServicePath=serviceFile;')
  .replace(/const installedModule=.*?;/,'const installedModule=modelInstalledModule;');
 const api=await import('data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64'));
 const row={systemIdentifier:'123',databaseOid:'42',database:'synthetic_model',currentUser:'model_login',sessionUser:'model_login',serverAddress:'172.20.0.4',serverPort:5432,postmasterStart:'NEW_ACTUAL_START_NOT_INSTALL_TIME',backendPid:42,serverVersionNum:'170011',rowSecurity:'on',replicationRole:'origin',recovery:false,ordinaryAttributes:true,lifetimeMatches:true,memberships:[[role,false,false,true]]};
 if(synthetic)Object.assign(row,{database:t.proposal.database,currentUser:t.proposal.runtime,sessionUser:t.proposal.runtime,serverAddress:t.proposal.host,serverPort:t.proposal.port,postmasterStart:t.physical.postmasterStart,observedLoginValidUntil:new Date(expiry-1000).toISOString()});
 if(formal)Object.assign(row,{database:t.proposal.database,currentUser:t.proposal.runtime,sessionUser:t.proposal.runtime,
  serverAddress:t.proposal.host,serverPort:t.proposal.port,postmasterStart:proof.physical.postmasterStart});
 const calls=[],clients=[],identityParams=[];let failure,actualLifetime=proof.runtimeLoginValidUntil;
 function client(){let status='I',switched=false,released=false;const c={getTransactionStatus:()=>status,release(error){released=error===true;api.modelRelease()},get released(){return released},async query(sql,values){calls.push(sql);if(sql.includes('pg_control_system')){assert.equal(switched,false,'direct LOGIN permission must precede SET ROLE');if(failure==='identity')throw Error('MODEL_IDENTITY_ERROR');identityParams.push(values[0]);return {command:'SELECT',rows:[{...structuredClone(row),...(formal?{lifetimeMatches:values[0]===actualLifetime}:{})}]};}if(sql.startsWith('BEGIN')){status='T';return {command:'BEGIN'}}if(sql==='ROLLBACK'){status='I';switched=false;return {command:'ROLLBACK'}}if(sql.startsWith('SET LOCAL ROLE')){switched=true;return {command:'SET'}}if(sql==='MODEL_GUARDS'){if(failure==='catalog')throw Error('MODEL_CATALOG_ERROR');return [{command:'DO'},{command:'DO'}]}if(sql==='MODEL_OBSERVATION')return {command:'SELECT',rows:[{catalog_json:'SYNTHETIC_ONLY'}]};throw Error('UNEXPECTED_MODEL_QUERY')}};clients.push(c);return c;}
 const pool={async connect(){return client()}},connection=synthetic||formal?{host:t.proposal.host,port:t.proposal.port,database:t.proposal.database,user:t.proposal.runtime}:{host:'postgres',port:5432,database:'synthetic_model',user:'model_login'};
 async function putProof(bytes=encodeProof(proof)){await writeFile(serviceFile,bytes);return{sha256:hash(bytes),capacityExpiresAt:now+90000}}
 return {api,root,recordPath,networkPath,networkWorkspace,hostPath:join(root,hostPath),pool,connection,row,calls,clients,client,identityParams,
  proof,putProof,setActualLifetime:v=>{actualLifetime=v},now,t,serviceFile,fail:x=>failure=x,dispose:()=>rm(root,{recursive:true,force:true})};
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

test('V2 epoch comparison keeps six fractional digits and canonical calendar validation',async()=>{
 const m=await model();
 try{
  const micros=m.api.ordinaryPgMicroseconds;
  assert(micros('2026-11-10 14:12:37.123457+00')>micros('2026-11-10 14:12:37.123456+00'));
  assert(micros('2026-11-10 14:12:37.123455+00')<micros('2026-11-10 14:12:37.123456+00'));
  assert.equal(micros('2026-11-10 14:12:37.1+00'),micros('2026-11-10 14:12:37.100000+00'));
  assert.equal(micros('2026-11-10 14:12:37+00')+1n,micros('2026-11-10 14:12:37.000001+00'));
  for(const bad of ['2026-02-30 14:12:37+00','2026-11-10 14:12:37.1234567+00','2026-11-10T14:12:37Z'])
   assert.throws(()=>micros(bad),/UTC_REQUIRED/);
 }finally{await m.dispose()}
});

test('normal V2 service admits a new epoch and null role on the original pool and expires at the service or capacity bound',async()=>{
 for(const limitedBy of ['service','capacity']){
  const m=await model({formal:true,normal:true});let cap;
  try{
   const expiry=m.now+60000;
   if(limitedBy==='service')m.proof.sharedPostgresNamespace.serviceLeaseExpiresAt=expiry;
   const input=await m.putProof();if(limitedBy==='capacity')input.capacityExpiresAt=expiry;
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
   const described=m.api.describeFresh35OrdinaryAdmissionV2(cap);
   assert.equal(described.postmasterStart,m.proof.physical.postmasterStart);
   assert.equal(described.expiresAt,expiry);assert.equal(m.clients.length,1);
   assert.deepEqual(m.identityParams,[null,null]);
   assert(m.api.modelWatchedPaths().includes(join(m.root,'installed','source.mjs')));
   await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client());
   m.api.setTime(expiry);
   await assert.rejects(m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/EXPIRED/);
   assert.equal(m.api.activeWatchers(),0);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
 }
});

test('normal02 admits only its matched request and carrier with the original identity and capacity checks',async()=>{
 const m=await model({formal:true,normal:true});let cap;
 try{
  m.proof.requestKey='t45-first-r3-native-service-start-20261110-02';
  m.proof.sharedPostgresNamespace.creationOperationId=m.proof.requestKey;
  m.proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3-service-02';
  const input=await m.putProof();cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
  assert.equal(m.clients.length,1);assert.deepEqual(m.identityParams,[null,null]);
  assert.equal(m.api.describeFresh35OrdinaryAdmissionV2(cap).postmasterStart,m.proof.physical.postmasterStart);
  await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client());
  m.api.setTime(input.capacityExpiresAt);
  await assert.rejects(m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/EXPIRED/);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});

test('normal02 rejects cross01/02 request, namespace and carrier pairs and refuses an unapproved03',async()=>{
 for(const [request,creation,carrier,code] of [
  ['02','01','02','NAMESPACE_DIFFERS'],['01','02','01','NAMESPACE_DIFFERS'],
  ['02','02','01','CARRIER_REQUIRED'],['01','01','02','CARRIER_REQUIRED'],
  ['03','03','03','PROVENANCE_DIFFERS'],
 ]){
  const m=await model({formal:true,normal:true});
  try{
   m.proof.requestKey='t45-first-r3-native-service-start-20261110-'+request;
   m.proof.sharedPostgresNamespace.creationOperationId='t45-first-r3-native-service-start-20261110-'+creation;
   m.proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3-service-'+carrier;
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,await m.putProof()),new RegExp(code));
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('normal V2 service rejects old identities, keys, authority and lease drift before pool checkout',async()=>{
 const cases=[
  m=>{m.proof.requestKey='t45-first-r3-native-service-start-20261110-02'},
  m=>{m.proof.requestKey='t45-first-r3-native-facts-installed-20261110-01'},
  m=>{m.proof.authorizationSha256='a'.repeat(64)},
  m=>{m.proof.sharedPostgresNamespace.creationOperationId='old-install'},
  m=>{m.proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3'},
  m=>{m.proof.sharedPostgresNamespace.container.name='t45-fresh35-first-production-20261110-r3-recovery'},
  m=>{m.proof.dataDirectoryIdentity.inode++},
  m=>{m.proof.dataDirectoryIdentity.device++},
  m=>{m.proof.physical.systemIdentifier='124'},
  m=>{m.proof.physical.databaseOid='43'},
  m=>{m.proof.physical.postmasterStart=m.t.physical.postmasterStart},
  m=>{m.proof.sourceSetSha256='0'.repeat(64)},
  m=>{m.proof.installationRecordSha256='0'.repeat(64)},
  m=>{m.proof.runtimeLoginValidUntil='infinity'},
  m=>{m.proof.runtimeLoginValidUntil=new Date(m.now+120000).toISOString()},
  m=>{m.proof.sharedPostgresNamespace.serviceLeaseExpiresAt='infinity'},
  m=>{m.proof.sharedPostgresNamespace.serviceLeaseExpiresAt=m.now},
  m=>{m.proof.oldStopRequestKey='t45-first-20261110-r3-recovery-stop-20261110-01'},
  m=>{delete m.proof.serviceReceiptSha256},
  m=>{m.api.changeHistoricalModel()},
 ];
 for(const mutate of cases){
  const m=await model({formal:true,normal:true});
  try{mutate(m);const input=await m.putProof();
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input));
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('normal V2 service compares epochs within the same millisecond and checks live drift on every lease',async()=>{
 const m=await model({formal:true,normal:true});let cap;
 try{
  m.proof.physical.postmasterStart=m.t.physical.postmasterStart.replace('+00','001+00');
  m.row.postmasterStart=m.proof.physical.postmasterStart;
  m.proof.sharedPostgresNamespace.container.startedAt=new Date(m.now-400000).toISOString();
  cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,await m.putProof());
  m.row.postmasterStart=m.t.physical.postmasterStart;
  await assert.rejects(m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client()),/PHYSICAL_OR_LOGIN_DIFFERS/);
  assert.equal(m.api.activeWatchers(),0);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});

test('normal V2 service revokes changed login and proof and refuses an expired capacity input',async()=>{
 for(const changed of ['login','proof','capacity']){
  const m=await model({formal:true,normal:true});let cap;
  try{
   const input=await m.putProof();
   if(changed==='capacity'){
    input.capacityExpiresAt=m.now;
    await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input),/WINDOW_REQUIRED/);
    assert.equal(m.clients.length,0);
    continue;
   }
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
   if(changed==='login')m.setActualLifetime(new Date(m.now+60000).toISOString());
   else await writeFile(m.serviceFile+'.next',encodeProof(m.proof)).then(()=>rename(m.serviceFile+'.next',m.serviceFile));
   await assert.rejects(m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client()),/PHYSICAL_OR_LOGIN_DIFFERS|CURRENT_SERVICE_CHANGED|ACTIVE_SAME_POOL_REQUIRED/);
   assert.equal(m.api.activeWatchers(),0);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
 }
});

test('first R3 service reuses historical source and one pool with the exact installed epoch',async()=>{
 const m=await model({formal:true,initial:true});let cap;
 try{
  const input=await m.putProof();
  cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
  assert.equal(m.api.describeFresh35OrdinaryAdmissionV2(cap).postmasterStart,m.t.physical.postmasterStart);
  assert.deepEqual(m.identityParams,[m.proof.runtimeLoginValidUntil,m.proof.runtimeLoginValidUntil]);
  assert.equal(m.clients.length,1);
  assert(m.api.modelWatchedPaths().includes(join(m.root,'installed','source.mjs')));
  await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client());
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});

test('initial unbounded role remains bounded by retained service and process capacity',async()=>{
 for(const initialRoleUntil of [null,'infinity']){
  const m=await model({formal:true,initial:true,initialRoleUntil});let cap;
  try{
   const input=await m.putProof();
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
   assert.deepEqual(m.identityParams,[initialRoleUntil,initialRoleUntil]);
   assert.equal(m.api.describeFresh35OrdinaryAdmissionV2(cap).expiresAt,input.capacityExpiresAt);
   m.api.setTime(input.capacityExpiresAt);
   await assert.rejects(m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/EXPIRED/);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
 }
});

test('initial service refuses epoch drift at microsecond precision and proof-kind crossover',async()=>{
 const cases=[
  m=>{m.proof.format='FRESH35_INITIAL_PRODUCTION_SERVICE_DRAFT'},
  m=>{m.proof.physical.postmasterStart=m.proof.physical.postmasterStart.replace('+00','001+00')},
  m=>{m.proof.physical.postmasterStart=new Date(m.now-500).toISOString().replace('T',' ').replace('Z','+00')},
  m=>{m.proof.format='FRESH35_CURRENT_PRODUCTION_SERVICE_V1'},
  m=>{m.proof.oldStopRequestKey='t45-first-20261110-r3-recovery-stop-20261110-01'},
  m=>{m.proof.requestKey='t45-first-20261110-r3-recovery-restart-20261110-01'},
  m=>{m.proof.sharedPostgresNamespace.container.name+='-recovery'},
  m=>{m.proof.physical.databaseOid='43'},
  m=>{m.proof.runtimeLoginValidUntil=new Date(m.now+120001).toISOString()},
  m=>{m.proof.authorizationSha256='0'.repeat(64)},
  m=>{m.proof.sourceSetSha256='0'.repeat(64)},
  m=>{delete m.proof.serviceReceiptSha256},
  m=>{m.api.changeHistoricalModel()},
 ];
 for(const mutate of cases){
  const m=await model({formal:true,initial:true});
  try{mutate(m);const input=await m.putProof();
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input));
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('initial service requires all sixteen closed fields before pool checkout',async()=>{
 const keys=['format','requestKey','authorizationSha256','checkedAt','installationRecordSha256',
  'targetSha256','sourceSetSha256','serviceReceiptSha256','dataDirectory','dataDirectoryIdentity',
  'physical','sharedPostgresNamespace','postmaster','guardian','runtimeRole','runtimeLoginValidUntil'];
 for(const key of keys){
  const m=await model({formal:true,initial:true,initialRoleUntil:null});
  try{
   assert.deepEqual(Object.keys(m.proof).sort(),[...keys].sort());
   delete m.proof[key];
   const input=await m.putProof();
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input),/FORMAT_REQUIRED/);
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('initial service expires at the earliest role, retained service or capacity deadline',async()=>{
 for(const limit of ['role','service','capacity']){
  const m=await model({formal:true,initial:true});let cap;
  try{
   const deadline=m.now+60000;
   if(limit==='role')m.proof.sharedPostgresNamespace.serviceLeaseExpiresAt=m.now+180000;
   if(limit==='service')m.proof.sharedPostgresNamespace.serviceLeaseExpiresAt=deadline;
   const input=await m.putProof();input.capacityExpiresAt=limit==='capacity'?deadline:m.now+180000;
   const expected=limit==='role'?m.now+120000:deadline;
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
   assert.equal(m.api.describeFresh35OrdinaryAdmissionV2(cap).expiresAt,expected);
   m.api.setTime(expected);
   await assert.rejects(m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/EXPIRED/);
   assert.equal(m.api.activeWatchers(),0);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
 }
});

test('first R3 current service binds historical installation, proven live epoch and the earliest expiry on one pool',async()=>{
 const m=await model({formal:true});let cap;
 try{
  const input=await m.putProof();
  cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
  const description=m.api.describeFresh35OrdinaryAdmissionV2(cap);
  assert.equal(description.postmasterStart,m.proof.physical.postmasterStart);
  assert.equal(description.sourceSetSha256,m.proof.sourceSetSha256);
  assert.equal(description.expiresAt,input.capacityExpiresAt);
  assert.equal(m.clients.length,1);assert.equal(m.clients[0].released,true);
  assert(m.api.modelWatchedPaths().includes(join(m.root,'installed','source.mjs')));
  assert.deepEqual(m.identityParams,[m.proof.runtimeLoginValidUntil,m.proof.runtimeLoginValidUntil]);
  assert(!m.calls.some(sql=>/GRANT|COMMIT/.test(sql)));
  await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client());
  m.api.setTime(input.capacityExpiresAt-1);
  await m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool);
  m.api.setTime(input.capacityExpiresAt);
  await assert.rejects(m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/ORDINARY_CURRENT_SERVICE_EXPIRED/);
  assert.equal(m.api.activeWatchers(),0);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});

test('first R3 current service refuses R1 and mismatched target components before pool checkout',async()=>{
 const r1=Object.fromEntries(Object.entries(firstR3).map(([key,value])=>[key,typeof value==='string'
  ? value.replace('20261110','20261109').replace(/([_-])r3$/,'$1r1') : value]));
 const r2=Object.fromEntries(Object.entries(firstR3).map(([key,value])=>[key,typeof value==='string'?value.replace(/([_-])r3$/,'$1r2'):value]));
 const cases=[r1,r2,{database:r2.database},{runtime:r2.runtime},{workspaceDirectory:r2.workspaceDirectory},{database:r1.database},{workspaceDirectory:r1.workspaceDirectory},
  {admin:r1.admin},{owner:r1.owner},{controller:r1.controller},{runtime:r1.runtime},
  {host:'127.0.0.2'},{port:56792}];
 for(const proposal of cases){
  const m=await model({formal:true,proposal});
  try{
   const input=await m.putProof();
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input),/FIRST_R3_REQUIRED/);
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('first R3 current service rejects wrong protected bytes, closed fields, historical model and namespace before pool checkout',async()=>{
 const cases=[
  [m=>m.putProof().then(input=>({...input,sha256:'0'.repeat(64)})),/SHA_DIFFERS/],
  [m=>m.putProof(JSON.stringify(m.proof)+'\n'),/ENCODING_DIFFERS/],
  [m=>m.putProof(encodeProof(m.proof).replace(/^\{/,'{"checkedAt":1,')),/Duplicate JSON key/],
  [m=>{m.proof.extra=true;return m.putProof()},/FORMAT_REQUIRED/],
  [m=>{delete m.proof.previousStopTerminalSha256;return m.putProof()},/FORMAT_REQUIRED/],
  [m=>{m.proof.installationRecordSha256='0'.repeat(64);return m.putProof()},/PROVENANCE_DIFFERS/],
  [m=>{m.proof.requestKey=m.proof.requestKey.replace('r3-recovery','r1-recovery');return m.putProof()},/PROVENANCE_DIFFERS/],
  [m=>{m.proof.oldStopRequestKey=m.proof.oldStopRequestKey.replace('r3-recovery','r1-recovery');return m.putProof()},/PROVENANCE_DIFFERS/],
  [m=>{m.proof.runtimeRole='erp35_runtime_20261109_r1';return m.putProof()},/PROVENANCE_DIFFERS/],
  [m=>{m.proof.dataDirectory=m.proof.dataDirectory.replace('20261110-r3','20261109-r1');return m.putProof()},/PGDATA_DIFFERS/],
  [m=>{m.proof.dataDirectoryIdentity.extra=true;return m.putProof()},/PGDATA_DIFFERS/],
  [m=>{m.proof.sharedPostgresNamespace.container.name=m.proof.sharedPostgresNamespace.container.name.replace(/-recovery$/,'');return m.putProof()},/CARRIER_REQUIRED/],
  [m=>{m.proof.sharedPostgresNamespace.container.frontEndpoint.aliases=['model-app'];return m.putProof()},/ENDPOINT_REQUIRED/],
  [m=>{m.proof.physical.databaseOid='43';return m.putProof()},/PHYSICAL_DIFFERS/],
  [m=>{m.proof.physical.postmasterStart=m.t.physical.postmasterStart;return m.putProof()},/WINDOW_REQUIRED/],
  [m=>{m.proof.runtimeLoginValidUntil='infinity';return m.putProof()},/UTC_REQUIRED/],
  [m=>{m.api.replaceNamespace();return m.putProof()},/NAMESPACE_DIFFERS/],
  [m=>{m.api.changeHistoricalModel();return m.putProof()},/INSTALLED_MODEL_DIFFERS/],
 ];
 for(const [mutate,code] of cases){
  const m=await model({formal:true});
  try{
   const input=await mutate(m);
   await assert.rejects(m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input),code);
   assert.equal(m.clients.length,0);
  }finally{await m.dispose()}
 }
});

test('first R3 current service refuses live login or epoch drift and revokes a replaced proof',async()=>{
 for(const kind of ['login','epoch','file']){
  const m=await model({formal:true});let cap;
  try{
   const input=await m.putProof();
   cap=await m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection,input);
   if(kind==='login')m.setActualLifetime(m.t.ordinary.runtimeLoginValidUntil);
   if(kind==='epoch')m.row.postmasterStart=m.t.physical.postmasterStart;
   if(kind==='file')await writeFile(m.serviceFile+'.replacement',encodeProof(m.proof)).then(()=>rename(m.serviceFile+'.replacement',m.serviceFile));
   await assert.rejects(m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client()),/PHYSICAL_OR_LOGIN_DIFFERS|CURRENT_SERVICE_CHANGED|ACTIVE_SAME_POOL_REQUIRED/);
   assert.equal(m.api.activeWatchers(),0);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
 }
});

test('first R3 current service launch forwards only the private environment digest with the existing process window',async()=>{
 const main=await readFile(new URL('../apps/api/src/production-main.ts',import.meta.url),'utf8');
 const body=main.slice(main.indexOf('async function launch('),main.indexOf('export async function runProductionMain('));
 const compile=new Function('model','with(model){'+stripTypeScriptTypes(body)+'\nreturn launch;}');
 const filename='/run/naijue-rewrite/runtime.json',sha256='4'.repeat(64),profile='source-confirmed-native-exact35-production-v2';
 const runtime={profile,postgres:{target:{host:firstR3.host,port:firstR3.port,database:firstR3.database,user:firstR3.runtime}}};
 const capacityLaunch={target:{postmasterStart:'approved epoch'},window:{expiresAt:100000}};
 const bytes=Buffer.from(JSON.stringify({...runtime,capacityLaunch}));
 const file={isFile:()=>true,isSymbolicLink:()=>false,size:bytes.length,mode:0o400,dev:1,ino:2,mtimeMs:1,ctimeMs:1};
 const calls=[],processModel={env:{NAIJUE_CURRENT_PRODUCTION_SERVICE_SHA256:sha256},on(){},off(){},once(){}};
 const dependencies={
  async createCapacity(value,config){assert.deepEqual(value,capacityLaunch);assert.deepEqual(config,runtime);return{acquire(){},close(){},async preflight(){calls.push('preflight')}}},
  async createApi(mode,config,_capacity,_tag,target,currentService){
   assert.equal(mode,'r35');assert.deepEqual(config,runtime);assert.deepEqual(target,capacityLaunch.target);
   assert.deepEqual(currentService,{sha256,capacityExpiresAt:capacityLaunch.window.expiresAt});calls.push('createApi');return{async close(){}};
  },
  async startHost(){calls.push('listen');return{publicOrigin:'synthetic',async close(){}}},
  writeStarted(){calls.push('ready')},
 };
 const launch=compile({path:{isAbsolute:()=>true,resolve:value=>value},lstat:async()=>file,realpath:async()=>filename,
  readFile:async()=>bytes,process:processModel,parseProductionRuntime35Configuration:value=>value,
  parseProductionRuntimeConfiguration:value=>value,parseProductionCapacityLaunch:value=>value,
  readProductionStaffCredentialRequestTag:async()=>null});
 await launch('r35',[filename],undefined,dependencies);
 assert.deepEqual(calls,['createApi','preflight','listen','ready']);
 await assert.rejects(launch('legacy',[filename],undefined,dependencies),/Current service digest requires/);
 processModel.env.NAIJUE_CURRENT_PRODUCTION_SERVICE_SHA256='invalid';
 await assert.rejects(launch('r35',[filename],undefined,dependencies),/Current service digest requires/);
 assert.deepEqual(calls,['createApi','preflight','listen','ready']);
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
   await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/ORDINARY_|PROTECTED_RECORD_/);assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose();}
 }
});
test('unprotected JSON capability is rejected by real ordinary entrypoints without a database call',async()=>{
 const fake={profile:'FRESH35_ORDINARY_POOL_ADMISSION_V2'};assert.throws(()=>real.describeFresh35OrdinaryAdmissionV2(fake),/ACTIVE_ADMISSION/);await assert.rejects(()=>real.assertFresh35OrdinaryAdmissionCurrentV2(fake,{}),/SAME_POOL/);
 let connected=false;await assert.rejects(()=>real.admitFresh35OrdinaryPoolV2({async connect(){connected=true}}, {host:'postgres',port:5432,database:'unknown',user:'unknown'}),/PROTECTED_RECORD|ORDINARY_RUNTIME_REQUIRED/);assert.equal(connected,false);
});

test('F01: loader-verified bytes cannot acquire a later record baseline; startup replacements and cleanup races never return a capability',async()=>{
 for(const stage of ['validate-replace','validate-overwrite','validate-delete','after-watch-replace','release-replace','release-error']){
  const m=await model();try{m.api.setSwap(stage);await assert.rejects(()=>m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection),/PROTECTED_RECORD_|ENOENT|ORDINARY_|MODEL_RELEASE_ERROR/);assert.equal(m.api.activeWatchers(),0,stage+' releases every watcher');if(stage.startsWith('release-'))assert.equal(m.clients[0].released,true);else assert.equal(m.clients.length,0,stage+' rejected before connection acquisition');}finally{await m.dispose();}
 }
});


test('synthetic V1 admission uses same real-body pool capability with exact endpoint, finite lifetime and original window',async()=>{
 const m=await model({synthetic:true});let cap;
 try{cap=await m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection);const d=m.api.describeFresh35OrdinaryAdmissionV2(cap);assert.equal(d.purpose,'SYNTHETIC_ISOLATED_ORDINARY_V1');assert.equal(d.database,m.connection.database);assert.equal(m.clients.length,1);assert(m.calls[0].includes('observedLoginValidUntil'));assert(!m.calls.some(s=>/GRANT|COMMIT/.test(s)));assert.equal(m.clients[0].released,true);
 await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.client());await assert.rejects(()=>m.api.assertFresh35OrdinaryLeaseV2(cap,{},m.client()),/SAME_POOL/);
 assert.throws(()=>real.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);m.api.expire();await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/WINDOW_EXPIRED/);assert.equal(m.api.activeWatchers(),0);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});
test('synthetic ordinary rejects non-V1 record, bad real identity/lifetime/membership, missing pg_control access and record races',async()=>{
 const prod=await model();try{await assert.rejects(()=>prod.api.admitFresh35SyntheticOrdinaryPoolV1(prod.pool,prod.connection),/SYNTHETIC_V1_RECORD_REQUIRED/);assert.equal(prod.clients.length,0)}finally{await prod.dispose()}
 for(const delta of [{postmasterStart:'RESTARTED'},{serverAddress:'172.20.0.4'},{serverPort:5432},{sessionUser:'owner'},{memberships:[[role,false,true,true]]},{lifetimeMatches:false},{observedLoginValidUntil:'infinity'},{observedLoginValidUntil:'2100-01-01T00:00:00Z'}]){
  const m=await model({synthetic:true});try{Object.assign(m.row,delta);await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/PHYSICAL_OR_LOGIN_DIFFERS/);assert.equal(m.api.activeWatchers(),0);assert(m.clients.every(c=>c.released))}finally{await m.dispose()}
 }
 for(const failure of ['identity','catalog']){const m=await model({synthetic:true});try{m.fail(failure);await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/MODEL_/);assert.equal(m.api.activeWatchers(),0);assert(m.clients.every(c=>c.released))}finally{await m.dispose()}}
 for(const stage of ['validate-replace','after-watch-replace','release-replace','release-error']){const m=await model({synthetic:true});try{m.api.setSwap(stage);await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/PROTECTED_RECORD_|ORDINARY_|MODEL_RELEASE_ERROR/);assert.equal(m.api.activeWatchers(),0)}finally{await m.dispose()}}
});


test('synthetic capability expires at observed LOGIN cutoff even during an already borrowed transaction',async()=>{
 for(const [check,offset] of ['current','describe','lease'].flatMap(check=>[0,1].map(offset=>[check,offset]))){
  const m=await model({synthetic:true});let cap;const lease=m.client();
  try{
   cap=await m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection);
   await m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,lease);await lease.query('BEGIN ISOLATION LEVEL READ COMMITTED');
   const cutoff=Date.parse(m.row.observedLoginValidUntil),d=m.api.describeFresh35OrdinaryAdmissionV2(cap);
   m.api.setTime(cutoff-1);await m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool);
   m.api.setTime(cutoff+offset);assert.equal(lease.getTransactionStatus(),'T');
   if(check==='describe')assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/WINDOW_EXPIRED/);
   else if(check==='lease'){await lease.query('ROLLBACK');await assert.rejects(()=>m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,lease),/WINDOW_EXPIRED/);}
   else await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/WINDOW_EXPIRED/);
   assert.equal(m.api.activeWatchers(),0);assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);
   assert.equal(d.expiresAt,cutoff,'Public synthetic expiry is the effective earlier deadline');
  }finally{await lease.query('ROLLBACK');if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);lease.release(true);await m.dispose();}
 }
});

test('synthetic ordinary watches fixed readable network proof inode without watching its root0711 parent and revokes on replace (OS/watch model)',async()=>{
 const missing=await model({synthetic:true});try{await rm(missing.networkPath);await assert.rejects(()=>missing.api.admitFresh35SyntheticOrdinaryPoolV1(missing.pool,missing.connection),/ENOENT/);assert.equal(missing.clients.length,0);assert.equal(missing.api.activeWatchers(),0)}finally{await missing.dispose()}
 const m=await model({synthetic:true});let cap;
 try{
  cap=await m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection);
  const watched=m.api.modelWatchedPaths();assert(watched.includes(m.networkPath));assert(!watched.includes(m.networkWorkspace),'root0711 parent is traversable but must not be opened as a directory watcher');
  await writeFile(m.networkPath+'.new','SYNTHETIC REPLACEMENT',{mode:0o444});await rename(m.networkPath+'.new',m.networkPath);await new Promise(r=>setTimeout(r,35));
  await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/ACTIVE_SAME_POOL/);assert.equal(m.api.activeWatchers(),0);
 }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose()}
});

test('synthetic non-listable authority keeps readable record inode watching and revokes on overwrite rename unlink replacement and watcher error',async()=>{
 for(const change of ['overwrite','rename','unlink','replace','watch-error']){
  const m=await model({synthetic:true,recordParentPrivate:true});let cap;
  try{
   cap=await m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection);
   const paths=m.api.modelWatchedPaths();assert.equal(paths[0],m.recordPath);assert(paths.includes(m.recordPath));assert(!paths.includes(join(m.root,'authority')));assert(paths.includes(m.networkPath));assert(!paths.includes(m.networkWorkspace),'bootstrap root0711 parent remains unwatched');assert(paths.includes(m.hostPath));
   const watcher=m.api.firstWatcher();assert(watcher);
   if(change==='watch-error')watcher.emit('error',Error('MODEL_REAL_WATCHER_ERROR'));
   else{
    const event=once(watcher,'change',{signal:AbortSignal.timeout(2000)});
    if(change==='overwrite')await writeFile(m.recordPath,'CHANGED SAME INODE');
    else if(change==='rename')await rename(m.recordPath,m.recordPath+'.moved');
    else if(change==='unlink')await unlink(m.recordPath);
    else{await writeFile(m.recordPath+'.replacement','CHANGED RECORD GENERATION');await rename(m.recordPath+'.replacement',m.recordPath);}
    await event;
   }
   assert.equal(m.api.activeWatchers(),0,change+' closes all watchers at invalidation');
   assert.throws(()=>m.api.describeFresh35OrdinaryAdmissionV2(cap),/ACTIVE_ADMISSION/);
   const count=m.calls.length,clients=m.clients.length;
   await assert.rejects(()=>m.api.assertFresh35OrdinaryAdmissionCurrentV2(cap,m.pool),/ACTIVE_SAME_POOL/);
   await assert.rejects(()=>m.api.assertFresh35OrdinaryLeaseV2(cap,m.pool,m.clients[0]),/ACTIVE_SAME_POOL/);
   await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/EXCLUSIVE_STARTUP/);
   assert.equal(m.calls.length,count);assert.equal(m.clients.length,clients,'revoked pool does not reacquire or silently admit');
  }finally{if(cap)m.api.closeFresh35OrdinaryAdmissionV2(cap,m.pool);await m.dispose();}
 }
});
test('synthetic non-listable authority retains exact startup record generation checks and closes failure resources',async()=>{
 for(const stage of ['validate-replace','validate-delete','after-watch-replace','release-replace','release-error']){
  const m=await model({synthetic:true,recordParentPrivate:true});
  try{m.api.setSwap(stage);await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/PROTECTED_RECORD_|ENOENT|ORDINARY_|MODEL_RELEASE_ERROR/);assert.equal(m.api.activeWatchers(),0);assert(m.clients.every(c=>c.released));await assert.rejects(()=>m.api.admitFresh35SyntheticOrdinaryPoolV1(m.pool,m.connection),/EXCLUSIVE_STARTUP/);}
  finally{await m.dispose();}
 }
});
test('production non-listable authority still fails its directory watch without widening the synthetic exception',async()=>{
 const m=await model({recordParentPrivate:true});
 try{await assert.rejects(()=>m.api.admitFresh35OrdinaryPoolV2(m.pool,m.connection),e=>e.code==='EACCES');assert(m.api.modelWatchedPaths().includes(join(m.root,'authority')));assert.equal(m.clients.length,0);assert.equal(m.api.activeWatchers(),0);}
 finally{await m.dispose();}
});
