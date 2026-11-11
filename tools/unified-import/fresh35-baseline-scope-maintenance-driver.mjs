/** Versioned 6c6f6b4e/223 T45 adapter; one phase per existing one-use root job.
 * Preserves the frozen08 adapter and never advances phases automatically.
 * Original T45 root-job adapter. Private stdin only; no DSN, arbitrary SQL,
 * credential generation, authority issuer, final-record writer or retry path. */
import {open,lstat,stat,realpath,readdir,mkdir,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const SOURCE='/app/backend/native35-source',REFERENCE='/opt/naijue-erp/fresh35-combined-v1/reference-inputs',JOB='/run/t45-admin154/job';
const CONTROL='/run/t45-admin154/control',WORKER_ID=10001;
const PROOF='/etc/naijue-erp/fresh35-current-production-service-v2-service-08.json',HOST_PROOF='/run/naijue-rewrite/current-production-service.json';
const OPERATION='/etc/naijue-erp/fresh35-admin154-execution-v1.json';
const SOURCE_SHA='e11609061181457b7cd012a32d0b44a5d764586ee2d5353e62ce82f297db16bd';
const UPGRADE_SHA='3470fbf54f9d56ea893dca5de4cf09f02862b3920dd13a20cc1ccf35124b8bae';
const RECORD_SHA='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e',OLD_SOURCE='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16';
const physical={systemIdentifier:'7706545564479176741',databaseOid:'16393',serverVersionNum:'170011'};
const ownPath=fileURLToPath(import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('BASELINE_DRIVER_'+code);};
const safeCode=(error,fallback)=>{const message=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:null;return typeof message==='string'&&/^BASELINE_DRIVER_[A-Z0-9_]+$/.test(message)?message:fallback;};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys=(v,names)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...names].sort().join(',');
const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const moduleAt=name=>import(pathToFileURL(join(SOURCE,name)).href);
async function protectedBytes(path,privateFile=false,group=0n){
 need(resolve(path)===path&&await realpath(path)===path,'CANONICAL_INPUT_REQUIRED');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const s=await f.stat({bigint:true});need(s.isFile()&&s.uid===0n&&s.gid===group&&s.nlink===1n&&(s.mode&0o022n)===0n&&(!privateFile||(s.mode&0o077n)===0n)&&s.size>0n&&s.size<=65536n,'PROTECTED_INPUT_REQUIRED');
  const bytes=Buffer.alloc(Number(s.size)+1);let used=0;
  while(used<bytes.length){const r=await f.read(bytes,used,bytes.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
  need(BigInt(used)===s.size&&identity(s)===identity(await f.stat({bigint:true}))&&identity(s)===identity(await lstat(path,{bigint:true})),'INPUT_CHANGED');
  return {path,bytes:bytes.subarray(0,used),sha256:hash(bytes.subarray(0,used)),identity:identity(s),mode:s.mode};
 }finally{await f.close();}
}
async function sidecarBytes(path){
 const parent=await lstat(dirname(path),{bigint:true});
 need(parent.isDirectory()&&parent.uid===0n&&parent.gid===BigInt(WORKER_ID)&&(parent.mode&0o777n)===0o750n,'SIDECAR_DIRECTORY_REQUIRED');
 const file=await protectedBytes(path,false,BigInt(WORKER_ID));
 need((file.mode&0o777n)===0o440n,'SIDECAR_FILE_REQUIRED');return file;
}
async function privateDirectory(path,trust){
 await trust.assertTrustedRootPath(path);need(await realpath(path)===path,'CANONICAL_DIRECTORY_REQUIRED');
 const s=await lstat(path,{bigint:true});need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0n&&s.gid===0n&&(s.mode&0o777n)===0o700n,'PRIVATE_JOB_DIRECTORY_REQUIRED');
 return [s.dev,s.ino,s.uid,s.gid,s.mode].map(String).join(':');
}
async function writeDurable(path,bytes){
 const f=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400);
 try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
 const directory=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
 const actual=await protectedBytes(path,true);need(actual.sha256===hash(bytes)&&actual.bytes.equals(bytes),'DURABLE_READBACK_DIFFERS');return actual;
}
async function unchanged(captured,privateFile=true,group=0n){const actual=await protectedBytes(captured.path,privateFile,group);need(actual.identity===captured.identity&&actual.sha256===captured.sha256,'AUTHORITY_OR_RESERVATION_CHANGED');}
function validatePacket(p){
 const common=['phase','jobDirectory','sourceRoot','referenceDirectory','connection','currentService'];
 need(keys(p,[...common,...(p?.phase==='ADMIN_PROVISION_ONLY'?['request','encodedScrypt','successorRecordSha256']:p?.phase==='SQL38'?['parentRecordSha256','provisionOrigin','admin']:[])])&&['SQL36','ADMIN_PROVISION_ONLY','SQL38'].includes(p.phase),'EXACT_PACKET_REQUIRED');
 need(p.jobDirectory===JOB&&p.sourceRoot===SOURCE&&p.referenceDirectory===REFERENCE&&keys(p.currentService,['path','sha256'])&&p.currentService.path===PROOF&&digest(p.currentService.sha256),'FIXED_REFERENCES_REQUIRED');
 const c=p.connection,role=p.phase==='ADMIN_PROVISION_ONLY'?'erp35_controller_20261110_r3':'erp35_owner_20261110_r3';
 need(keys(c,['host','port','database','user','password','ssl'])&&c.host==='127.0.0.1'&&c.port===56791&&c.database==='erp_fresh35_20261110_r3'&&c.user===role&&c.ssl===false
  &&typeof c.password==='string'&&c.password.length>0&&Buffer.byteLength(c.password)<=4096,'FIXED_PRIVATE_CONNECTION_REQUIRED');
 if(p.phase==='ADMIN_PROVISION_ONLY')need(digest(p.successorRecordSha256)&&p.request?.admin?.login_name==='admin'&&p.request.admin.staff_name==='系统管理员'&&typeof p.encodedScrypt==='string','EXPLICIT_ADMIN_INPUT_REQUIRED');
 if(p.phase==='SQL38')need(digest(p.parentRecordSha256)&&keys(p.provisionOrigin,['operation_id','request_sha256'])&&typeof p.provisionOrigin.operation_id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.provisionOrigin.operation_id)&&digest(p.provisionOrigin.request_sha256)&&keys(p.admin,['account_id','staff_id','login_name','staff_name'])&&p.admin.login_name==='admin'&&p.admin.staff_name==='系统管理员','ACTUAL_PARENT_AND_A_ORIGIN_REQUIRED');
}
function validateGrant(a,p,inputSha,authorizationSha,ownSha){
 const fields=['format','phase','requestKey','jobDirectory','inputSha256','currentServiceSha256','sourceSetSha256','driverSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference','binding','timing'];
 need(keys(a,[...fields,...(p.phase==='ADMIN_PROVISION_ONLY'?['operationAuthoritySha256']:[])])&&a.format==='T45_R3_BASELINE_SCOPE_MAINTENANCE_NODE_AUTHORIZATION_V1'
  &&a.phase===p.phase&&a.jobDirectory===JOB&&a.requestKey===requestKeyFor(p.phase)
  &&a.inputSha256===inputSha&&a.currentServiceSha256===p.currentService.sha256&&a.sourceSetSha256===SOURCE_SHA&&a.driverSha256===ownSha
  &&digest(authorizationSha)&&digest(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.trim().length>0
  &&keys(a.timing,Object.keys(timingFor(p.phase)))&&Object.entries(timingFor(p.phase)).every(([k,v])=>a.timing[k]===v)&&a.binding&&Object.getPrototypeOf(a.binding)===Object.prototype&&(p.phase!=='ADMIN_PROVISION_ONLY'||digest(a.operationAuthoritySha256)),'EXACT_EXTERNAL_AUTHORITY_REQUIRED');
 need(Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)&&a.startsAt<=Date.now()&&Date.now()<a.expiresAt-timingFor(p.phase).minimumRemainingMs,'AUTHORITY_WINDOW_REQUIRED');
}
function validateProof(v,a,validateInstant){
 need(keys(v,['format','requestKey','authorizationSha256','checkedAt','installationRecordSha256','targetSha256','sourceSetSha256','serviceReceiptSha256','dataDirectory','dataDirectoryIdentity','physical','sharedPostgresNamespace','postmaster','guardian','runtimeRole','runtimeLoginValidUntil'])
  &&v.format==='FRESH35_CURRENT_PRODUCTION_SERVICE_V2'&&v.requestKey==='t45-first-r3-native-service-start-20261111-08'
  &&v.installationRecordSha256===RECORD_SHA&&v.sourceSetSha256===OLD_SOURCE&&digest(v.targetSha256)&&digest(v.authorizationSha256)&&digest(v.serviceReceiptSha256)
  &&keys(v.physical,[...Object.keys(physical),'postmasterStart'])&&Object.entries(physical).every(([k,x])=>v.physical[k]===x)
  &&typeof v.physical.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?\+00$/.test(v.physical.postmasterStart)
  &&validateInstant(v.physical.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'))
  &&Date.parse(v.physical.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'))<=v.checkedAt
  &&v.runtimeRole==='erp35_runtime_20261110_r3'&&v.runtimeLoginValidUntil===null&&Number.isSafeInteger(v.checkedAt)&&v.checkedAt<=Date.now()
  &&v.sharedPostgresNamespace?.creationOperationId===v.requestKey&&v.sharedPostgresNamespace.container?.name==='t45-fresh35-first-production-20261110-r3-service-08'
  &&Number.isSafeInteger(v.sharedPostgresNamespace.serviceLeaseExpiresAt)&&v.sharedPostgresNamespace.serviceLeaseExpiresAt>=a.expiresAt,'CURRENT08_PROOF_REQUIRED');
}

async function openJob(p,inputSha,authorizationSha,m){
 const jobIdentity=await privateDirectory(JOB,m.trust);
 const auth=await protectedBytes(join(JOB,'maintenance-node-authorization.json'),true),a=freeze(m.parse(auth.bytes.toString('utf8')));
 need(auth.sha256===authorizationSha,'AUTHORITY_RAW_SHA_DIFFERS');
 const self=await sidecarBytes(ownPath);validateGrant(a,p,inputSha,authorizationSha,self.sha256);
 const {proof,alias}=await readCurrentService(p,a,m);
 const operation=p.phase==='ADMIN_PROVISION_ONLY'?await protectedBytes(OPERATION,false,BigInt(WORKER_ID)):null;
 if(operation)need((operation.mode&0o777n)===0o440n&&operation.sha256===a.operationAuthoritySha256,'A_OPERATION_AUTHORITY_DIFFERS');
 const entries=await readdir(JOB);need(entries.length===1&&entries[0]==='maintenance-node-authorization.json','JOB_ALREADY_USED');
 const reservation=await writeDurable(join(JOB,'maintenance-node-reservation.json'),Buffer.from(JSON.stringify({format:'T45_R3_BASELINE_SCOPE_NODE_RESERVATION_V1',phase:p.phase,requestKey:a.requestKey,inputSha256:inputSha,authorizationSha256:auth.sha256,at:new Date().toISOString()})+'\n'));
 await mkdir(join(JOB,'events'),{mode:0o700});
 const parent=await open(JOB,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}
 need(await privateDirectory(JOB,m.trust)===jobIdentity,'JOB_GENERATION_CHANGED');
 const eventIdentity=await privateDirectory(join(JOB,'events'),m.trust);let index=0,previous=null;
 const fileCurrent=async()=>{need(await privateDirectory(JOB,m.trust)===jobIdentity&&await privateDirectory(join(JOB,'events'),m.trust)===eventIdentity,'JOB_GENERATION_CHANGED');await unchanged(auth);await unchanged(reservation);
  if(operation)await unchanged(operation,false,BigInt(WORKER_ID));
  const actual=await protectedBytes(PROOF),currentAlias=await protectedBytes(HOST_PROOF);need(actual.identity===proof.identity&&actual.sha256===proof.sha256&&currentAlias.identity===alias.identity&&currentAlias.sha256===alias.sha256,'CURRENT08_PROOF_CHANGED');};
 const emit=async event=>{await fileCurrent();const bytes=Buffer.from(JSON.stringify({format:'T45_R3_BASELINE_SCOPE_NODE_EVENT_V1',index:++index,previousSha256:previous,at:new Date().toISOString(),event})+'\n');
  const written=await writeDurable(join(JOB,'events',String(index).padStart(6,'0')+'.json'),bytes);previous=written.sha256;};
 const current=async()=>{await fileCurrent();need(Date.now()>=a.startsAt&&Date.now()<a.expiresAt-45000,'AUTHORITY_EXPIRED');};
 const expectedBindingSha=m.requestHash(a.binding);
 const authorized=async bindingSha=>{await current();need(bindingSha===expectedBindingSha,'EXACT_BINDING_DIFFERS');};
 await emit({state:'NODE_RESERVATION_DURABLE',phase:p.phase,inputSha256:inputSha,authorizationSha256:auth.sha256});
 return {a,emit,authorized,current};
}
const timingFor=phase=>Object.freeze(phase==='SQL36'?{maxQueryCalls:14,queryTimeoutMs:45000,statementTimeoutMs:40000,cleanupReserveMs:45000,minimumRemainingMs:695000}:phase==='SQL38'?{maxQueryCalls:15,queryTimeoutMs:45000,statementTimeoutMs:40000,cleanupReserveMs:45000,minimumRemainingMs:740000}:{maxQueryCalls:9,queryTimeoutMs:45000,statementTimeoutMs:40000,cleanupReserveMs:45000,minimumRemainingMs:460000});
const requestKeyFor=phase=>({SQL36:'t45-r3-baseline-scope-sql36-20261111-01',ADMIN_PROVISION_ONLY:'t45-r3-baseline-scope-admin-provision-20261111-01',SQL38:'t45-r3-baseline-scope-sql38-20261111-01'})[phase];
async function upgradeLeaf(){
 const leaf=join(dirname(ownPath),'fresh35-baseline-scope-upgrade.mjs'),pin=await sidecarBytes(leaf);need(pin.sha256===UPGRADE_SHA,'FIXED_UPGRADE_LEAF_REQUIRED');return import(pathToFileURL(leaf).href);
}
function upgradeInput(p,window,proof){return {phase:p.phase,sourceRoot:SOURCE,referenceDirectory:REFERENCE,postmasterStart:proof.physical.postmasterStart,startsAt:window.startsAt,expiresAt:window.expiresAt,...(p.phase==='SQL38'?{parentRecordSha256:p.parentRecordSha256,provisionOrigin:p.provisionOrigin,admin:p.admin}:{})};}

async function runUpgrade(p,j,m){
 const {runFresh35BaselineScopeUpgrade}=await upgradeLeaf();
 const {closePhysical}=await moduleAt('tools/unified-import/whole-host-session.mjs');m.close=closePhysical;
 const require=createRequire(pathToFileURL(join(SOURCE,'package.json'))),{Client}=require('pg');need(require('pg/package.json').version==='8.23.1','PG_VERSION_REQUIRED');
 const created=new Set(),closing=new Map();let connected=false,result;
 const close=c=>{if(!closing.has(c))closing.set(c,m.close(c));return closing.get(c);};
 const connect=async()=>{await j.current();const timeout=Math.min(5000,j.a.expiresAt-45000-Date.now());need(timeout>0,'AUTHORITY_EXPIRED');
  const c=new Client({...p.connection,password:()=>p.connection.password,application_name:'t45-admin154-maintenance-upgrade',connectionTimeoutMillis:timeout,query_timeout:45000,
   options:'-c search_path=pg_catalog -c TimeZone=UTC -c lock_timeout=5000 -c statement_timeout=40000'});created.add(c);c.on('error',()=>{});
  try{await c.connect();connected=true;return c;}catch(error){await close(c);created.delete(c);throw error;}};
 try{
  result=await runFresh35BaselineScopeUpgrade({...upgradeInput(p,j.a,j.proof),openClient:connect,authorizationSha256:j.aHash,assertAuthorized:j.authorized,emit:j.emit});
 }catch{result={state:connected?'COMMIT_OUTCOME_UNKNOWN':'NOT_STARTED',code:'BASELINE_DRIVER_UPGRADE_CALL_FAILED',connectionCleanup:'CLOSED',recordPublished:false,automaticRetry:false};}
 for(const c of created)if(c._ended!==true){
  if(c._ending===true){c.connection?.stream?.destroy();result.connectionCleanup='UNKNOWN';}
  else try{await close(c);}catch{result.connectionCleanup='UNKNOWN';}
 }
 if(result.connectionCleanup==='UNKNOWN'){delete result.record;delete result.recordJson;delete result.recordSha256;}
 return result;
}

const currentReadFailed='BASELINE_DRIVER_PREPARATION_CURRENT08_READ_FAILED';
const currentReadErrnos=new Set(['EACCES','EPERM','ENOENT','ENOTDIR','ELOOP','EIO','ESTALE']);
async function readCurrentStep(step,read){
 try{return await read();}catch(error){
  if(safeCode(error,null))throw error;
  const code=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:null;
  const errno=currentReadErrnos.has(code)?code:'UNCLASSIFIED';
  throw Error(`${currentReadFailed}_${step}_${errno}`);
 }
}
async function readCurrentService(p,window,m){
 const proof=await readCurrentStep('PROOF',()=>protectedBytes(PROOF));
 const alias=await readCurrentStep('ALIAS',()=>protectedBytes(HOST_PROOF));
 need(proof.sha256===p.currentService.sha256&&alias.sha256===proof.sha256,'CURRENT08_PROOF_ALIAS_DIFFERS');
 const value=freeze(m.parse(proof.bytes.toString('utf8')));validateProof(value,window,m.validateInstant);
 const ns=await readCurrentStep('PROC_STAT',()=>stat('/proc/self/ns/net',{bigint:true})),expected=value.sharedPostgresNamespace.container.networkNamespace;
 need(expected&&ns.dev===BigInt(expected.device)&&ns.ino===BigInt(expected.inode),'CURRENT08_NAMESPACE_DIFFERS');return {proof,alias,value};
}
async function runtimeModules(uid){
 need(process.platform==='linux'&&process.version==='v24.21.0'&&process.getuid?.()===uid&&process.geteuid?.()===uid&&process.getgid?.()===uid&&process.getegid?.()===uid
  &&!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||['NODE_OPTIONS','NODE_PATH'].includes(k)||k.startsWith('LD_')||k.startsWith('DYLD_')),'PINNED_RUNTIME_IDENTITY_REQUIRED');
 const contract=await moduleAt('packages/application/src/unified-import-contract.ts'),trust=await moduleAt('scripts/release/unified-install/trusted-install-path.mjs');
 await trust.assertTrustedRootTree(SOURCE);await trust.assertTrustedRootPath(ownPath);await trust.assertTrustedRootPath(process.execPath);
 const {requestHash}=await moduleAt('packages/application/src/request-hash.ts');
 return {trust,parse:contract.parseStrictJson,validateInstant:contract.validateOffsetInstant,requestHash};
}
function preparationWindow(window){
 const value={...window};
 need(keys(value,['startsAt','expiresAt'])&&Number.isSafeInteger(value.startsAt)&&Number.isSafeInteger(value.expiresAt)&&value.startsAt<value.expiresAt&&Date.now()<value.expiresAt-45000,'EXPLICIT_PREPARATION_WINDOW_REQUIRED');
 return value;
}

/** Exercise the ordinary worker's fixed proof read without a private packet. */
export async function verifyFresh35BaselineScopeCurrentServiceProof(proofSha256,window){
 let fallback='BASELINE_DRIVER_PREPARATION_RUNTIME_OR_PACKET_FAILED';
 try{
  need(digest(proofSha256),'CURRENT08_PROOF_REQUIRED');
  window=preparationWindow(window);
  const m=await runtimeModules(WORKER_ID);
  fallback=currentReadFailed;
  await readCurrentService({currentService:{sha256:proofSha256}},window,m);
 }catch(error){throw Error(safeCode(error,fallback));}
}
async function packetModules(rawInput){
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536,'PRIVATE_INPUT_BOUND');
 const m=await runtimeModules(WORKER_ID);
 const p=freeze(m.parse(rawInput.toString('utf8')));validatePacket(p);
 const {assertPublicValuesExcludePrivateInputs:exclude}=await moduleAt('tools/unified-import/execution-client.ts');
 return {p,m:{...m,exclude}};
}
async function preparationBinding(p,window,proof,m){
 if(p.phase==='ADMIN_PROVISION_ONLY'){
  m.host=await moduleAt('tools/unified-import/fresh35-host-session.mjs');m.record=await moduleAt('scripts/release/unified-install/fresh35-admin154-record-v1.mjs');
  const actual=await protectedBytes(m.record.ADMIN154_RECORD_PATH);need(actual.sha256===p.successorRecordSha256,'PUBLISHED_RECORD_SHA_DIFFERS');
  const context=await m.host.loadFresh35Admin154Context(SOURCE,REFERENCE,{sha256:p.currentService.sha256,capacityExpiresAt:window.expiresAt},p.successorRecordSha256,'ADMIN_PROVISION_ONLY');
  return m.host.describeFresh35Admin154SetupBinding(context,{purpose:'ADMIN_PROVISION_ONLY',request:p.request,encodedScrypt:p.encodedScrypt});
 }
 const {describeFresh35BaselineScopeUpgrade}=await upgradeLeaf(),meta=await describeFresh35BaselineScopeUpgrade(upgradeInput(p,window,proof));
 need(meta.binding.artifactSourceSetSha256===SOURCE_SHA,'FIXED_ARTIFACT_SOURCE_REQUIRED');return meta.binding;
}

/** Read-only preparation, not an approval: no pg require/client, job claim,
 * journal, final publication or operation-authority file is opened/created. */
export async function describeFresh35BaselineScopeMaintenancePreparation(rawInput,window){
 let fallback='BASELINE_DRIVER_PREPARATION_METADATA_FAILED';
 try{
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536,'PRIVATE_INPUT_BOUND');rawInput=Buffer.from(rawInput);window=preparationWindow(window);
 fallback='BASELINE_DRIVER_PREPARATION_RUNTIME_OR_PACKET_FAILED';
 const {p,m}=await packetModules(rawInput);
 fallback=currentReadFailed;
 const {value:proof}=await readCurrentService(p,window,m);
 fallback='BASELINE_DRIVER_PREPARATION_BINDING_FAILED';
 need(Date.now()<window.expiresAt-timingFor(p.phase).minimumRemainingMs,'MINIMUM_PHASE_REMAINING_REQUIRED');
 const binding=await preparationBinding(p,window,proof,m);
 fallback='BASELINE_DRIVER_PREPARATION_SIDECAR_READ_FAILED';
 const self=await sidecarBytes(ownPath),result={state:'READ_ONLY_PREPARATION_NOT_AUTHORIZATION',phase:p.phase,requestKey:requestKeyFor(p.phase),timing:timingFor(p.phase),
  inputSha256:hash(rawInput),currentServiceSha256:p.currentService.sha256,sourceSetSha256:SOURCE_SHA,driverSha256:self.sha256,binding,
  ...(p.phase==='ADMIN_PROVISION_ONLY'?{operationAuthorityBinding:{format:'FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_ADMIN_PROVISION_ONLY',binding,startsAt:window.startsAt,expiresAt:window.expiresAt-45000}}:{})};
 fallback='BASELINE_DRIVER_PREPARATION_METADATA_FAILED';
 m.exclude(result,[p.connection.password,...(p.phase==='ADMIN_PROVISION_ONLY'?[p.encodedScrypt]:[])]);return freeze(result);
 }catch(error){throw Error(safeCode(error,fallback));}
}
async function runAdmin(p,j,m){
 const record=await protectedBytes(m.record.ADMIN154_RECORD_PATH);need(record.sha256===p.successorRecordSha256,'PUBLISHED_RECORD_SHA_DIFFERS');
 const context=await m.host.loadFresh35Admin154Context(SOURCE,REFERENCE,{sha256:p.currentService.sha256,capacityExpiresAt:j.a.expiresAt},p.successorRecordSha256,'ADMIN_PROVISION_ONLY');
 const prepared={purpose:'ADMIN_PROVISION_ONLY',request:p.request,encodedScrypt:p.encodedScrypt};
 const binding=await m.host.describeFresh35Admin154SetupBinding(context,prepared);await j.authorized(binding);
 const authority=await m.record.loadFresh35Admin154Authorization(binding,'ADMIN_PROVISION_ONLY',j.a.expiresAt-45000),actual=await m.record.assertFresh35Admin154AuthorizationCurrent(authority);
 need(actual.sha256===j.a.operationAuthoritySha256,'A_OPERATION_AUTHORITY_DIFFERS');
 await j.emit({state:'A_PUBLISHED_RECORD_AND_AUTHORITY_VERIFIED',recordSha256:record.sha256,binding});
 need(Date.now()<j.a.expiresAt-timingFor(p.phase).minimumRemainingMs,'MINIMUM_PHASE_REMAINING_REQUIRED');
 const c=p.connection,config={host:c.host,port:c.port,database:c.database,user:c.user,password:c.password,statement_timeout_ms:40000};
 let response;
 try{response=await m.host.runFresh35Admin154Setup(config,SOURCE,{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:physical.systemIdentifier,database_oid:physical.databaseOid,
  database_name:c.database,catalog_sha256:binding.catalogSha256},p.request,p.encodedScrypt,{referenceDirectory:REFERENCE,successorSha256:p.successorRecordSha256,
  currentService:{sha256:p.currentService.sha256,capacityExpiresAt:j.a.expiresAt},prepareOnly:false});}
 catch{return {state:'UNKNOWN',code:'BASELINE_DRIVER_A_CALL_FAILED',connection_cleanup:'UNKNOWN',automaticRetry:false};}
 const r=response.result;return {...r,connection_cleanup:response.cleanup,host_verification:response.host_verification,
  ...(['COMMITTED','ALREADY_COMMITTED'].includes(r?.state)?{provision_origin:{operation_id:r.receipt.operationId,request_sha256:r.request_sha256}}:{}),automaticRetry:false};
}

const outcomes=['NOT_STARTED','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','COMMITTED','ALREADY_COMMITTED','UNKNOWN'];
const stages=['BOUND','BEGIN','PREDECESSOR','SQL36','A_PROOF','SQL38','PRECOMMIT_CATALOG','COMMIT','DDL_CLOSE','READBACK_CONNECT','READBACK','RECORD','PREPARE','DRIVER'];
const auditFields={
 state:v=>[...outcomes,'BOUND','A_PUBLISHED_RECORD_AND_AUTHORITY_VERIFIED','PRECOMMIT_CATALOG_CHECKED','COMMIT_PENDING','DDL_CONNECTION_CLOSED','COMMITTED_CATALOG_READBACK_VERIFIED_UNPUBLISHED','NODE_CALL_FINISHED'].includes(v),
 stage:v=>stages.includes(v),code:v=>typeof v==='string'&&/^(?:(?:BASELINE_DRIVER_|BASELINE_UPGRADE_)[A-Z0-9_]{1,72}|PUBLIC_OUTPUT_REDACTED)$/.test(v),
 phase:v=>['SQL36','ADMIN_PROVISION_ONLY','SQL38'].includes(v),resultState:v=>outcomes.includes(v),automaticRetry:v=>v===false,
 bindingSha256:digest,recordSha256:digest,catalogSha256:digest,precommitCatalogSha256:digest,readbackCatalogSha256:digest,
 catalogReadback:v=>['VERIFIED','NOT_VERIFIED'].includes(v),connectionCleanup:v=>['CLOSED','UNKNOWN'].includes(v),recordPublished:v=>v===false,
 receipt:r=>keys(r,['nonce','database','actor','transactionId','backendPid'])&&/^[a-f0-9]{48}$/.test(r.nonce)
  &&r.database==='erp_fresh35_20261110_r3'&&r.actor==='erp35_owner_20261110_r3'&&typeof r.transactionId==='string'&&/^[1-9][0-9]{0,19}$/.test(r.transactionId)
  &&Number.isSafeInteger(r.backendPid)&&r.backendPid>0,
};
function validateAudit(event){
 need(event&&Object.getPrototypeOf(event)===Object.prototype&&auditFields.state(event.state)
  &&Object.entries(event).every(([k,v])=>Object.hasOwn(auditFields,k)&&auditFields[k](v)),'CUSTODY_EVENT_REQUIRED');
}
function bindingDigest(binding,phase,authorizationSha,requestHash){
 if(phase!=='ADMIN_PROVISION_ONLY'){
  const {authorizationSha256,...rest}=binding;need(authorizationSha256===authorizationSha,'UPGRADE_AUTHORITY_DIFFERS');return requestHash(rest);
 }
 return requestHash(binding);
}

async function openControl(root,trust,parse){
 await trust.assertTrustedRootPath(CONTROL);
 const parent=await lstat(CONTROL,{bigint:true});
 need(parent.isDirectory()&&parent.uid===0n&&parent.gid===BigInt(WORKER_ID)&&(parent.mode&0o777n)===0o710n,'CUSTODY_PIPE_REQUIRED');
 async function openPipe(name,mode,readable){
  const path=join(CONTROL,name),before=await lstat(path,{bigint:true});
  need(before.isFIFO()&&before.uid===0n&&before.gid===BigInt(WORKER_ID)&&before.nlink===1n&&(before.mode&0o777n)===mode,'CUSTODY_PIPE_REQUIRED');
  const handle=await open(path,(readable?constants.O_RDONLY:constants.O_WRONLY)|constants.O_NOFOLLOW);
  try{need(identity(before)===identity(await handle.stat({bigint:true})),'CUSTODY_PIPE_REQUIRED');return handle;}
  catch(error){await handle.close();throw error;}
 }
 const request=await openPipe('request',0o620n,root);
 let response;
 try{response=await openPipe('response',0o640n,!root);}catch(error){await request.close();throw error;}
 const input=root?request:response,output=root?response:request,limit=65536;
 const chunk=Buffer.alloc(8192);let pending=Buffer.alloc(0);
 return {
  async receive(){
   for(;;){
    const end=pending.indexOf(10);
    if(end>=0){need(end>0&&end<limit,'CUSTODY_FRAME_REQUIRED');const frame=pending.subarray(0,end);pending=pending.subarray(end+1);return parse(frame.toString('utf8'));}
    need(pending.length<limit,'CUSTODY_FRAME_REQUIRED');
    const {bytesRead}=await input.read(chunk,0,Math.min(chunk.length,limit-pending.length),null);
    if(!bytesRead){need(!pending.length,'CUSTODY_FRAME_REQUIRED');return undefined;}
    pending=Buffer.concat([pending,chunk.subarray(0,bytesRead)]);
   }
  },
  async send(value){
   const bytes=Buffer.from(JSON.stringify(value)+'\n');need(bytes.length<=limit,'CUSTODY_FRAME_REQUIRED');
   let offset=0;
   while(offset<bytes.length){const {bytesWritten}=await output.write(bytes,offset,bytes.length-offset,null);need(bytesWritten>0,'CUSTODY_PIPE_REQUIRED');offset+=bytesWritten;}
  },
  async close(){await Promise.all([request.close(),response.close()]);},
 };
}

async function serveCustody(rawInput){
 const m=await runtimeModules(0),input=m.parse(rawInput.toString('utf8'));
 need(keys(input,['phase','inputSha256','currentServiceSha256','authorizationSha256'])&&['SQL36','ADMIN_PROVISION_ONLY','SQL38'].includes(input.phase)
  &&[input.inputSha256,input.currentServiceSha256,input.authorizationSha256].every(digest),'CUSTODY_INPUT_REQUIRED');
 const channel=await openControl(true,m.trust,m.parse);
 try{
  const first=await channel.receive();need(keys(first,['op'])&&first.op==='open','CUSTODY_REQUEST_REQUIRED');
  const p={phase:input.phase,currentService:{sha256:input.currentServiceSha256}};
  const job=await openJob(p,input.inputSha256,input.authorizationSha256,m),{startsAt,expiresAt,operationAuthoritySha256}=job.a;
  await channel.send({ok:true,startsAt,expiresAt,...(operationAuthoritySha256?{operationAuthoritySha256}:{})});
  let count=1;
  for(let request;(request=await channel.receive())!==undefined;){
   need(++count<=128,'CUSTODY_REQUEST_LIMIT');
   if(keys(request,['op'])&&request.op==='current')await job.current();
   else if(keys(request,['op','bindingSha256'])&&request.op==='authorize'&&digest(request.bindingSha256))await job.authorized(request.bindingSha256);
   else if(keys(request,['op','event'])&&request.op==='emit'){validateAudit(request.event);await job.emit(request.event);}
   else throw Error('BASELINE_DRIVER_CUSTODY_REQUEST_REQUIRED');
   await channel.send({ok:true});
  }
 }catch(error){try{await channel.send({ok:false,code:safeCode(error,'BASELINE_DRIVER_CUSTODY_FAILED')});}catch{}throw error;}
 finally{await channel.close();}
}

async function workerJob(p,m,channel,authorizationSha,privateValues){
 const call=async request=>{
  await channel.send(request);const ack=await channel.receive();
  if(keys(ack,['ok','code'])&&ack.ok===false)throw Error(safeCode({message:ack.code},'BASELINE_DRIVER_CUSTODY_FAILED'));
  need(ack?.ok===true,'CUSTODY_ACK_REQUIRED');return ack;
 };
 const a=await call({op:'open'}),admin=p.phase==='ADMIN_PROVISION_ONLY';
 need(keys(a,['ok','startsAt','expiresAt',...(admin?['operationAuthoritySha256']:[])])&&Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)
  &&a.startsAt<=Date.now()&&Date.now()<a.expiresAt-45000&&(!admin||digest(a.operationAuthoritySha256)),'CUSTODY_ACK_REQUIRED');
 need(Date.now()<a.expiresAt-timingFor(p.phase).minimumRemainingMs,'MINIMUM_PHASE_REMAINING_REQUIRED');
 const {value:proof}=await readCurrentService(p,a,m);
 const bindingSha=binding=>bindingDigest(binding,p.phase,authorizationSha,m.requestHash);
 const check=async request=>need(keys(await call(request),['ok']),'CUSTODY_ACK_REQUIRED');
 return {a,proof,aHash:authorizationSha,current:()=>check({op:'current'}),authorized:binding=>check({op:'authorize',bindingSha256:bindingSha(binding)}),
  async emit(original){
   m.exclude(original,privateValues);
   const {binding,...event}=original;
   if(binding)event.bindingSha256=bindingSha(binding);
   validateAudit(event);m.exclude(event,privateValues);await check({op:'emit',event});
  },
 };
}

/** argv contains ONLY externally pinned raw input/authorization hashes.
 * All actual facts and credentials arrive once via the original private stdin. */
export async function runBaselineScopeMaintenanceDriver(rawInput,inputSha,authorizationSha){
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536&&digest(inputSha)&&digest(authorizationSha)&&hash(rawInput)===inputSha,'PRIVATE_INPUT_SHA_REQUIRED');rawInput=Buffer.from(rawInput);
 let packet;try{packet=await packetModules(rawInput);}catch(error){return {state:'NOT_STARTED',code:safeCode(error,'BASELINE_DRIVER_PRIVATE_PACKET_FAILED'),automaticRetry:false};}
 const {p,m}=packet,privateValues=[p.connection.password,...(p.phase==='ADMIN_PROVISION_ONLY'?[p.encodedScrypt]:[])];
 let channel,j,result;
 try{
  channel=await openControl(false,m.trust,m.parse);j=await workerJob(p,m,channel,authorizationSha,privateValues);
  if(p.phase!=='ADMIN_PROVISION_ONLY')result=await runUpgrade(p,j,m);
  else{m.host=await moduleAt('tools/unified-import/fresh35-host-session.mjs');m.record=await moduleAt('scripts/release/unified-install/fresh35-admin154-record-v1.mjs');result=await runAdmin(p,j,m);}
  try{m.exclude(result,privateValues);}catch{result={state:outcomes.includes(result?.state)?result.state:'UNKNOWN',code:'PUBLIC_OUTPUT_REDACTED',summary_redacted:true,automaticRetry:false};}
  try{await j.emit({state:'NODE_CALL_FINISHED',phase:p.phase,resultState:result.state,...(result.recordSha256?{recordSha256:result.recordSha256}:{})});}catch{result.journal='UNCONFIRMED';delete result.record;delete result.recordJson;delete result.recordSha256;}
  return result;
 }catch(error){
  result={state:'NOT_STARTED',code:safeCode(error,'BASELINE_DRIVER_PREPARATION_FAILED'),automaticRetry:false};
  if(j)try{await j.emit(result);}catch{result.journal='UNCONFIRMED';}return result;
 }finally{if(channel)try{await channel.close();}catch{/* The outcome still carries its last durable ACK. */}}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const custody=process.argv.length===3&&process.argv[2]==='--custody';
 try{
  need(custody||process.argv.length===4,'HASH_ARGUMENTS_REQUIRED');let length=0;const chunks=[];
  for await(const chunk of process.stdin){length+=chunk.length;need(length<=65536,'PRIVATE_INPUT_BOUND');chunks.push(chunk);}
  const input=Buffer.concat(chunks,length);
  if(custody)await serveCustody(input);
  else{
   const r=await runBaselineScopeMaintenanceDriver(input,process.argv[2],process.argv[3]);process.stdout.write(JSON.stringify(r)+'\n');
   const success=r.state==='COMMITTED_UNPUBLISHED'&&r.catalogReadback==='VERIFIED'&&r.connectionCleanup==='CLOSED'&&r.record
    ||['COMMITTED','ALREADY_COMMITTED'].includes(r.state)&&r.connection_cleanup==='CLOSED';
   process.exitCode=success&&r.journal!=='UNCONFIRMED'&&!r.summary_redacted?0:['UNKNOWN','COMMIT_OUTCOME_UNKNOWN','ROLLBACK_UNCONFIRMED'].includes(r.state)?2:1;
  }
 }catch(error){
  if(custody)process.stderr.write(safeCode(error,'BASELINE_DRIVER_CUSTODY_FAILED')+'\n');
  else process.stdout.write(JSON.stringify({state:'NOT_STARTED',code:'BASELINE_DRIVER_INPUT_FAILED',automaticRetry:false})+'\n');
  process.exitCode=1;
 }
}
