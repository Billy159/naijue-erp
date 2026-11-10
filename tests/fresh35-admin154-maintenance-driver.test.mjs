/** Explicit root/namespace/module model. Actual file creation, fsync, digest,
 * replacement checks and one-use journal run locally; no PG, credentials or RPC. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as contract from '../packages/application/src/unified-import-contract.ts';
import {requestHash} from '../packages/application/src/request-hash.ts';
import {assertPublicValuesExcludePrivateInputs as exclude} from '../tools/unified-import/execution-client.ts';
const url=new URL('../tools/unified-import/fresh35-admin154-maintenance-driver.mjs',import.meta.url),text=await fs.readFile(url,'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex'),stub=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const sourceSha='fdf29cd82bc54110a91d224a970537216417168792bc83b4b8f73c17a559da75';
const oldSha='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16',recordSha='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e';
async function fixture(phase='UPGRADE'){
 const dir=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'maintenance-driver-model-'))),job=join(dir,'job'),proofPath=join(dir,'proof.json'),alias=join(dir,'host-proof.json'),recordPath=join(dir,'successor.json');await fs.mkdir(job,{mode:0o700});
 const window={startsAt:Date.now()-1000,expiresAt:Date.now()+180000};
 const physical={systemIdentifier:'7706545564479176741',databaseOid:'16393',serverVersionNum:'170011',postmasterStart:new Date(Date.now()-2000).toISOString().replace('T',' ').replace('Z','+00')};
 const proof={format:'FRESH35_CURRENT_PRODUCTION_SERVICE_V2',requestKey:'t45-first-r3-native-service-start-20261111-04',authorizationSha256:'a'.repeat(64),checkedAt:Date.now()-100,
  installationRecordSha256:recordSha,targetSha256:'3'.repeat(64),sourceSetSha256:oldSha,serviceReceiptSha256:'b'.repeat(64),dataDirectory:'/SYNTHETIC_MODEL_ONLY/data',dataDirectoryIdentity:{},physical,
  sharedPostgresNamespace:{creationOperationId:'t45-first-r3-native-service-start-20261111-04',serviceLeaseExpiresAt:window.expiresAt+300000,container:{name:'t45-fresh35-first-production-20261110-r3-service-04',networkNamespace:{device:4,inode:5}}},postmaster:{},guardian:{},runtimeRole:'erp35_runtime_20261110_r3',runtimeLoginValidUntil:null};
 const proofRaw=JSON.stringify(proof);await fs.writeFile(proofPath,proofRaw,{mode:0o444});await fs.writeFile(alias,proofRaw,{mode:0o444});
 const recordRaw=JSON.stringify({SYNTHETIC_PUBLISHED_RECORD_ONLY:true});await fs.writeFile(recordPath,recordRaw,{mode:0o644});
 const packet={phase,jobDirectory:job,sourceRoot:'/MODEL_SOURCE',referenceDirectory:'/MODEL_REFERENCE',connection:{host:'127.0.0.1',port:56791,database:'erp_fresh35_20261110_r3',user:phase==='UPGRADE'?'erp35_owner_20261110_r3':'erp35_controller_20261110_r3',password:'SYNTHETIC_PRIVATE_PASSWORD_DO_NOT_LOG',ssl:false},currentService:{path:proofPath,sha256:hash(proofRaw)},
  ...(phase==='ADMIN_PROVISION_ONLY'?{request:{format_version:'FIRST_ADMIN_SETUP_V1',mode:'ADMIN_PROVISION_ONLY',operation_id:'71000000-0000-0000-0000-000000000001',request_key:'admin-provision-only-v1:71000000-0000-0000-0000-000000000001',admin:{staff_id:'72000000-0000-0000-0000-000000000001',account_id:'73000000-0000-0000-0000-000000000001',staff_name:'系统管理员',login_name:'admin'},installation_record_sha256:recordSha,setup_reference:'SYNTHETIC MODEL'},encodedScrypt:'naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128),successorRecordSha256:hash(recordRaw)}:{})};
 const oldRecord={binding:{sourceSetSha256:oldSha,targetSha256:'3'.repeat(64)},programSha256:'1'.repeat(64),catalogSha256:'2'.repeat(64)};
 const t={purpose:'PRODUCTION_NEW_EMPTY_EXACT35',proposal:{database:packet.connection.database,owner:'erp35_owner_20261110_r3',host:'127.0.0.1',port:56791}};
 const descriptor={sourceSetSha256:sourceSha,patchSqlSha256:'6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b',predecessorModelSha256:'a'.repeat(64),catalogSpecSha256:'b'.repeat(64),modelSha256:'c'.repeat(64)};
 const binding={format:'FRESH35_ADMIN154_SQL36_UPGRADE_BINDING_V1',predecessor:{recordSha256:recordSha,sourceSetSha256:oldSha,programSha256:oldRecord.programSha256,catalogSha256:oldRecord.catalogSha256,targetSha256:oldRecord.binding.targetSha256},successor:{patchSqlSha256:descriptor.patchSqlSha256,sourceSetSha256:sourceSha,catalogSpecSha256:descriptor.catalogSpecSha256,modelSha256:descriptor.modelSha256},physical:{...physical,database:t.proposal.database},owner:t.proposal.owner,host:t.proposal.host,port:t.proposal.port,...window};
 const aBinding={format:'FRESH35_A53_ADMIN154_SETUP_BINDING_V1',catalogSha256:'e'.repeat(64),initializerOperationId:packet.request?.operation_id,initializerSha256:'f'.repeat(64)};
 const ctx={contract,requestHash,exclude,packet,window,binding,aBinding,recordPath,oldRecord,t,descriptor,clients:[],closed:[],aCalls:0,requireCalls:0,authorityLoads:0,aAuthoritySha:'9'.repeat(64),aResult:'COMMITTED'};
 const sources={resolveFresh35ReferenceInputPaths:async()=>({}),loadFresh35Admin154Source:async()=>({}),describeFresh35CombinedSource:()=>({sourceSetSha256:sourceSha,currentSourcePins:Array(219).fill({})})};
 const targets={reconstructFresh35InstalledProductionTargetV2:async()=>({}),describeFresh35CombinedTarget:()=>t};
 const catalogs={buildFresh35Admin154Catalog:async()=>({}),describeFresh35CombinedCatalog:()=>descriptor};
 const records={loadFresh35CombinedRecordEnvelope:async()=>({binding:{sourceSetSha256:oldSha}}),describeFresh35ProtectedRecordSnapshot:()=>({sha256:recordSha})};
 ctx.modules={'packages/application/src/unified-import-contract.ts':contract,'scripts/release/unified-install/trusted-install-path.mjs':{assertTrustedRootPath:async()=>{},assertTrustedRootTree:async()=>{}},'packages/application/src/request-hash.ts':{requestHash},'tools/unified-import/execution-client.ts':{assertPublicValuesExcludePrivateInputs:exclude},'tools/unified-import/whole-host-session.mjs':{closePhysical:async c=>c.end()},
  'scripts/release/unified-install/fresh35-combined-source-v1.mjs':sources,'scripts/release/unified-install/fresh35-combined-target-v1.mjs':targets,'scripts/release/unified-install/fresh35-combined-catalog-v1.mjs':catalogs,'scripts/release/unified-install/fresh35-combined-record-v1.mjs':records,
  'old:source':{...sources,loadFresh35CombinedSource:async()=>({})},'old:target':targets,'old:catalog':{buildFresh35CombinedCatalog:async()=>({}),describeFresh35CombinedCatalog:()=>({modelSha256:descriptor.predecessorModelSha256})},'old:lifecycle':{compileFresh35CombinedProgram:async()=>({})},'old:record':{...records,validateFresh35CombinedRecord:()=>oldRecord},
  'scripts/release/unified-install/fresh35-admin154-record-v1.mjs':{ADMIN154_RECORD_PATH:recordPath,async loadFresh35Admin154Authorization(b,p){assert.deepEqual(b,aBinding);assert.equal(p,'ADMIN_PROVISION_ONLY');ctx.authorityLoads++;return {};},assertFresh35Admin154AuthorizationCurrent:async()=>({sha256:ctx.aAuthoritySha})},
  'tools/unified-import/fresh35-host-session.mjs':{async loadFresh35Admin154Context(_s,_r,_c,sha){assert.equal(sha,packet.successorRecordSha256);return {};},describeFresh35Admin154SetupBinding:async()=>aBinding,async runFresh35Admin154Setup(config,_s,_target,request){ctx.aCalls++;assert.deepEqual(Object.keys(config).sort(),['database','host','password','port','user']);assert.deepEqual(request,packet.request);return {result:ctx.aResult==='UNKNOWN'?{state:'UNKNOWN',code:'TRANSACTION_OUTCOME_UNKNOWN'}:{state:'COMMITTED',receipt:{operationId:packet.request.operation_id,kind:'STAFF',targetId:packet.request.admin.staff_id,version:1},request_sha256:'7'.repeat(64)},cleanup:'CLOSED'};}}};
 const io=stub(`import * as fs from 'node:fs/promises';
 const root=s=>Object.create(s,{uid:{value:0n},gid:{value:0n}});let watched=null,made=false,fail=false;export const order=[];
 export function observe(path,injectFailure){watched=path;made=false;fail=injectFailure;order.length=0;}
 export const realpath=fs.realpath,readdir=fs.readdir,readFile=fs.readFile;
 export async function mkdir(p,o){await fs.mkdir(p,o);if(p===watched+'/events'){made=true;order.push('EVENTS_MKDIR');}}
 export async function lstat(p,o){return root(await fs.lstat(p,o))}
 export async function stat(p,o){if(p==='/proc/self/ns/net')return{dev:4n,ino:5n};return root(await fs.stat(p,o))}
 export async function open(p,f,m){if(watched&&p.startsWith(watched+'/events/'))order.push('EVENT_OPEN');const h=await fs.open(p,f,m);return{stat:async o=>root(await h.stat(o)),read:(...a)=>h.read(...a),writeFile:(...a)=>h.writeFile(...a),async sync(){if(p===watched){order.push(made?'PARENT_SYNC_AFTER_MKDIR':'PARENT_SYNC_BEFORE_MKDIR');if(made&&fail)throw Error('MODEL_PARENT_SYNC_FAILED');}await h.sync();},close:()=>h.close()}}
 `);const ioAPI=await import(io);
 let source=text.replace("'node:fs/promises'",JSON.stringify(io)).replaceAll('import.meta.url',JSON.stringify(url.href));
 for(const [from,to] of [["'/app/backend/native35-source'","'/MODEL_SOURCE'"],["'/opt/naijue-erp/fresh35-combined-v1/reference-inputs'","'/MODEL_REFERENCE'"],["'/run/t45-admin154/job'",JSON.stringify(job)],["'/etc/naijue-erp/fresh35-current-production-service-v2-service-04.json'",JSON.stringify(proofPath)],["'/run/naijue-rewrite/current-production-service.json'",JSON.stringify(alias)]])source=source.replaceAll(from,to);
 source=source.replace(/const moduleAt=.*?;\n/,'const moduleAt=async name=>modelModule(name);\n');
 source=source.replace(/need\(process.platform==='linux'[\s\S]*?'PINNED_ROOT_RUNTIME_REQUIRED'\);/,"need(true,'EXPLICIT_MODEL_RUNTIME_ONLY');");
 source=source.replace("import(pathToFileURL(join(oldRoot,'scripts/release/unified-install/fresh35-combined-'+n+'-v1.mjs')).href)","modelModule('old:'+n)");
 source=source.replace("const {runFresh35Admin154Upgrade}=await import(pathToFileURL(leaf).href);","const runFresh35Admin154Upgrade=modelUpgrade;");
 source=source.replace("const require=createRequire(pathToFileURL(join(SOURCE,'package.json'))),{Client}=require('pg');","const require=modelRequire,{Client}=require('pg');");
 source+=`\nlet selected;export function configure(v){selected=v;}function modelModule(n){if(!selected.modules[n])throw Error('UNEXPECTED_MODEL_MODULE:'+n);return selected.modules[n];}function modelRequire(n){selected.requireCalls++;return n==='pg'?{Client:ModelClient}:{version:'8.23.1'};}class ModelClient{constructor(options){this.options=options;this._ended=false;selected.clients.push(this);selected.order?.push('CLIENT');}on(){}async connect(){if(selected.connectFail)throw Error('SYNTHETIC CONNECT FAILURE');}async end(){this._ended=true;selected.closed.push(this);}}
 async function modelUpgrade(o){try{const b=structuredClone(selected.binding);if(selected.badBinding)b.physical.databaseOid='999';await o.assertAuthorized({...b,authorizationSha256:o.authorizationSha256});await o.emit({state:'MODEL_PRECOMMIT'});if(selected.upgradeUnknown){await o.client.end();return{state:'COMMIT_OUTCOME_UNKNOWN',connectionCleanup:'CLOSED',recordPublished:false,automaticRetry:false};}await o.client.end();const reader=await o.openReadback();if(selected.failReadback){await reader.end();return{state:'COMMITTED_UNPUBLISHED',catalogReadback:'NOT_VERIFIED',connectionCleanup:'CLOSED',recordPublished:false,automaticRetry:false};}await reader.end();if(selected.breakJournal)await modelBreakJournal();return{...(selected.leakResult?{privateLeak:selected.packet.connection.password}:{}),state:'COMMITTED_UNPUBLISHED',catalogReadback:'VERIFIED',connectionCleanup:'CLOSED',record:{SYNTHETIC_MODEL_RECORD:true},recordJson:'SYNTHETIC_MODEL_RECORD',recordSha256:'8'.repeat(64),recordPublished:false,automaticRetry:false};}catch{await o.client.end();return{state:'NOT_STARTED',connectionCleanup:'CLOSED',recordPublished:false,automaticRetry:false};}}
 `;
 source+='\nasync function modelBreakJournal(){const fs=await import("node:fs/promises");await fs.writeFile('+JSON.stringify(join(job,'events','000003.json'))+',"SYNTHETIC_COLLISION",{flag:"wx",mode:0o400});}';
 const api=await import(stub(source));api.configure(ctx);
 const raw=Buffer.from(JSON.stringify(packet)),authPath=join(job,'maintenance-node-authorization.json');
 const authorize=async edits=>{
  const prep=await api.describeFresh35Admin154MaintenancePreparation(raw,window);
  const a={format:'T45_R3_ADMIN154_MAINTENANCE_NODE_AUTHORIZATION_V1',phase,requestKey:prep.requestKey,jobDirectory:job,inputSha256:hash(raw),currentServiceSha256:packet.currentService.sha256,sourceSetSha256:sourceSha,driverSha256:hash(text),...window,independentSafetyReviewSha256:'6'.repeat(64),authorizationReference:'SYNTHETIC MODEL ONLY',binding:prep.binding,...(phase==='ADMIN_PROVISION_ONLY'?{operationAuthoritySha256:ctx.aAuthoritySha}:{}),...edits};
  const bytes=Buffer.from(JSON.stringify(a));await fs.writeFile(authPath,bytes,{mode:0o400});return {inputSha:hash(raw),authorizationSha:hash(bytes),a};
 };
 return {ctx,api,job,raw,proofPath,alias,authPath,recordPath,recordRaw,authorize,observeParent:fail=>{ioAPI.observe(job,fail);ctx.order=ioAPI.order;return ioAPI.order;},run:a=>api.runMaintenanceDriver(raw,a.inputSha,a.authorizationSha),close:()=>fs.rm(dir,{recursive:true,force:true})};
}
test('maintenance preparation reads actual protected model metadata without pg, claim, events, authority or secret output',async()=>{
 for(const phase of ['UPGRADE','ADMIN_PROVISION_ONLY']){const f=await fixture(phase);try{
  const meta=await f.api.describeFresh35Admin154MaintenancePreparation(f.raw,f.ctx.window);assert.equal(meta.state,'READ_ONLY_PREPARATION_NOT_AUTHORIZATION');assert.equal(meta.inputSha256,hash(f.raw));
  assert.deepEqual(meta.binding,phase==='UPGRADE'?f.ctx.binding:f.ctx.aBinding);assert.equal(f.ctx.requireCalls,0);assert.equal(f.ctx.clients.length,0);assert.equal(f.ctx.aCalls,0);assert.equal(f.ctx.authorityLoads,0);assert.deepEqual(await fs.readdir(f.job),[]);
  assert(!JSON.stringify(meta).includes(f.ctx.packet.connection.password));assert(!JSON.stringify(meta).includes(f.ctx.packet.encodedScrypt??'UNUSED_PRIVATE_VALUE'));
 }finally{await f.close();}}
});
test('maintenance upgrade consumes one exact authority, fsyncs readable event chain and never replays the same job',async()=>{
 const f=await fixture();try{const a=await f.authorize(),r=await f.run(a);assert.equal(r.state,'COMMITTED_UNPUBLISHED');assert.equal(r.catalogReadback,'VERIFIED');assert.equal(f.ctx.clients.length,2);assert.equal(f.ctx.closed.length,2);
  const files=(await fs.readdir(join(f.job,'events'))).sort();assert(files.length>=3);let previous=null;
  for(const name of files){const p=join(f.job,'events',name),bytes=await fs.readFile(p),v=JSON.parse(bytes);assert.equal(v.previousSha256,previous);assert.equal((await fs.stat(p)).mode&0o777,0o400);assert(!bytes.includes(f.ctx.packet.connection.password));previous=hash(bytes);}
  assert((await fs.stat(join(f.job,'maintenance-node-reservation.json'))).isFile());const again=await f.run(a);assert.equal(again.state,'NOT_STARTED');assert.equal(again.code,'ADMIN154_DRIVER_JOB_ALREADY_USED');assert.equal(f.ctx.clients.length,2);
 }finally{await f.close();}
});
test('maintenance refuses wrong raw authority, expired grant and mismatched actual binding instead of a constant-true callback',async()=>{
 for(const fault of ['sha','expired','binding']){const f=await fixture();try{const a=await f.authorize(fault==='expired'?{expiresAt:Date.now()-1}:undefined);if(fault==='sha')a.authorizationSha='0'.repeat(64);if(fault==='binding')f.ctx.badBinding=true;
  const r=await f.run(a);assert.equal(r.state,'NOT_STARTED');assert.equal(r.record,undefined);assert.equal(f.ctx.clients.length,fault==='binding'?1:0);assert.equal(f.ctx.closed.length,f.ctx.clients.length);assert(!JSON.stringify(r).includes(f.ctx.packet.connection.password));
 }finally{await f.close();}}
});
test('maintenance requires the real same-hash host proof alias before opening any client',async()=>{
 const f=await fixture();try{const a=await f.authorize();await fs.chmod(f.alias,0o600);await fs.writeFile(f.alias,'SYNTHETIC_CHANGED_PROOF');const r=await f.run(a);assert.equal(r.state,'NOT_STARTED');assert.equal(r.code,'ADMIN154_DRIVER_CURRENT04_PROOF_ALIAS_DIFFERS');assert.equal(f.ctx.clients.length,0);
 }finally{await f.close();}
});
test('maintenance preserves unknown COMMIT and acknowledged-commit/readback failure without returning a candidate or retrying',async()=>{
 for(const fault of ['upgradeUnknown','failReadback']){const f=await fixture();try{f.ctx[fault]=true;const a=await f.authorize(),r=await f.run(a);assert.equal(r.state,fault==='upgradeUnknown'?'COMMIT_OUTCOME_UNKNOWN':'COMMITTED_UNPUBLISHED');assert.equal(r.record,undefined);assert.equal(r.automaticRetry,false);assert.equal(f.ctx.closed.length,f.ctx.clients.length);
 }finally{await f.close();}}
});
test('maintenance A requires a published realpath record and original A authority, delegates once and leaves final record unchanged',async()=>{
 for(const fault of ['none','missingRecord','operationAuthority','unknown']){const f=await fixture('ADMIN_PROVISION_ONLY');try{const a=await f.authorize();if(fault==='missingRecord')await fs.unlink(f.recordPath);if(fault==='operationAuthority')f.ctx.aAuthoritySha='0'.repeat(64);if(fault==='unknown')f.ctx.aResult='UNKNOWN';
  const r=await f.run(a);assert.equal(r.state,fault==='none'?'COMMITTED':fault==='unknown'?'UNKNOWN':'NOT_STARTED');assert.equal(f.ctx.aCalls,fault==='none'||fault==='unknown'?1:0);assert.equal(f.ctx.clients.length,0);
  if(fault!=='missingRecord')assert.equal(await fs.readFile(f.recordPath,'utf8'),f.recordRaw);assert(!JSON.stringify(r).includes(f.ctx.packet.connection.password));assert(!JSON.stringify(r).includes(f.ctx.packet.encodedScrypt));
 }finally{await f.close();}}
});

test('maintenance connect failure closes its client once; durable final-log failure and private result never report success or expose a candidate',async()=>{
 for(const fault of ['connectFail','breakJournal','leakResult']){const f=await fixture();try{
  f.ctx[fault]=true;const a=await f.authorize(),r=await f.run(a);assert.equal(r.state,fault==='connectFail'?'NOT_STARTED':'COMMITTED_UNPUBLISHED');assert.equal(r.record,undefined);assert.equal(f.ctx.closed.length,f.ctx.clients.length);assert.equal(new Set(f.ctx.closed).size,f.ctx.closed.length);
  if(fault==='breakJournal')assert.equal(r.journal,'UNCONFIRMED');if(fault==='leakResult')assert.equal(r.summary_redacted,true);
  assert(!JSON.stringify(r).includes(f.ctx.packet.connection.password));for(const name of await fs.readdir(join(f.job,'events')))assert(!(await fs.readFile(join(f.job,'events',name))).includes(f.ctx.packet.connection.password));
 }finally{await f.close();}}
});

test('maintenance event directory parent entry sync precedes first emit/client; sync failure keeps claim and sends no operation',async()=>{
 for(const fail of [false,true]){const f=await fixture();try{
  const a=await f.authorize(),order=f.observeParent(fail),r=await f.run(a);
  const created=order.indexOf('EVENTS_MKDIR'),synced=order.indexOf('PARENT_SYNC_AFTER_MKDIR');assert(created>=0&&synced>created);
  if(fail){assert.equal(r.state,'NOT_STARTED');assert.equal(f.ctx.clients.length,0);assert(!order.includes('EVENT_OPEN'));assert((await fs.stat(join(f.job,'maintenance-node-reservation.json'))).isFile());const again=await f.run(a);assert.equal(again.code,'ADMIN154_DRIVER_JOB_ALREADY_USED');assert.equal(f.ctx.clients.length,0);}
  else{assert.equal(r.catalogReadback,'VERIFIED');assert(order.indexOf('EVENT_OPEN')>synced);assert(order.indexOf('CLIENT')>synced);}
 }finally{await f.close();}}
});
