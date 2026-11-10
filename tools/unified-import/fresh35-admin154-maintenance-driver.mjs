/** Original T45 root-job adapter. Private stdin only; no DSN, arbitrary SQL,
 * credential generation, authority issuer, final-record writer or retry path. */
import {open,lstat,stat,realpath,readdir,mkdir,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const SOURCE='/app/backend/native35-source',REFERENCE='/opt/naijue-erp/fresh35-combined-v1/reference-inputs',JOB='/run/t45-admin154/job';
const PROOF='/etc/naijue-erp/fresh35-current-production-service-v2-service-04.json',HOST_PROOF='/run/naijue-rewrite/current-production-service.json';
const SOURCE_SHA='fdf29cd82bc54110a91d224a970537216417168792bc83b4b8f73c17a559da75';
const UPGRADE_SHA='506fc66b6b1360f562672cebe8333a3c53145638e96a5024405e4e2433f1aa34';
const RECORD_SHA='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e',OLD_SOURCE='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16';
const physical={systemIdentifier:'7706545564479176741',databaseOid:'16393',serverVersionNum:'170011'};
const ownPath=fileURLToPath(import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('ADMIN154_DRIVER_'+code);};
const safeCode=(error,fallback)=>{const message=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:null;return typeof message==='string'&&/^ADMIN154_DRIVER_[A-Z0-9_]+$/.test(message)?message:fallback;};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys=(v,names)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...names].sort().join(',');
const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const moduleAt=name=>import(pathToFileURL(join(SOURCE,name)).href);
async function protectedBytes(path,privateFile=false){
 need(resolve(path)===path&&await realpath(path)===path,'CANONICAL_INPUT_REQUIRED');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const s=await f.stat({bigint:true});need(s.isFile()&&s.uid===0n&&s.gid===0n&&s.nlink===1n&&(s.mode&0o022n)===0n&&(!privateFile||(s.mode&0o077n)===0n)&&s.size>0n&&s.size<=65536n,'PROTECTED_INPUT_REQUIRED');
  const bytes=Buffer.alloc(Number(s.size)+1);let used=0;
  while(used<bytes.length){const r=await f.read(bytes,used,bytes.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead;}
  need(BigInt(used)===s.size&&identity(s)===identity(await f.stat({bigint:true}))&&identity(s)===identity(await lstat(path,{bigint:true})),'INPUT_CHANGED');
  return {path,bytes:bytes.subarray(0,used),sha256:hash(bytes.subarray(0,used)),identity:identity(s)};
 }finally{await f.close();}
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
async function unchanged(captured){const actual=await protectedBytes(captured.path,true);need(actual.identity===captured.identity&&actual.sha256===captured.sha256,'AUTHORITY_OR_RESERVATION_CHANGED');}
function validatePacket(p){
 const common=['phase','jobDirectory','sourceRoot','referenceDirectory','connection','currentService'];
 need(keys(p,[...common,...(p?.phase==='ADMIN_PROVISION_ONLY'?['request','encodedScrypt','successorRecordSha256']:[])])&&['UPGRADE','ADMIN_PROVISION_ONLY'].includes(p.phase),'EXACT_PACKET_REQUIRED');
 need(p.jobDirectory===JOB&&p.sourceRoot===SOURCE&&p.referenceDirectory===REFERENCE&&keys(p.currentService,['path','sha256'])&&p.currentService.path===PROOF&&digest(p.currentService.sha256),'FIXED_REFERENCES_REQUIRED');
 const c=p.connection,role=p.phase==='UPGRADE'?'erp35_owner_20261110_r3':'erp35_controller_20261110_r3';
 need(keys(c,['host','port','database','user','password','ssl'])&&c.host==='127.0.0.1'&&c.port===56791&&c.database==='erp_fresh35_20261110_r3'&&c.user===role&&c.ssl===false
  &&typeof c.password==='string'&&c.password.length>0&&Buffer.byteLength(c.password)<=4096,'FIXED_PRIVATE_CONNECTION_REQUIRED');
 if(p.phase==='ADMIN_PROVISION_ONLY')need(digest(p.successorRecordSha256)&&p.request?.admin?.login_name==='admin'&&p.request.admin.staff_name==='系统管理员'&&typeof p.encodedScrypt==='string','EXPLICIT_ADMIN_INPUT_REQUIRED');
}
function validateGrant(a,p,inputSha,authorizationSha,ownSha){
 const fields=['format','phase','requestKey','jobDirectory','inputSha256','currentServiceSha256','sourceSetSha256','driverSha256','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference','binding'];
 need(keys(a,[...fields,...(p.phase==='ADMIN_PROVISION_ONLY'?['operationAuthoritySha256']:[])])&&a.format==='T45_R3_ADMIN154_MAINTENANCE_NODE_AUTHORIZATION_V1'
  &&a.phase===p.phase&&a.jobDirectory===JOB&&a.requestKey===(p.phase==='UPGRADE'?'t45-r3-admin154-upgrade-20261111-01':'t45-r3-admin154-admin-provision-20261111-01')
  &&a.inputSha256===inputSha&&a.currentServiceSha256===p.currentService.sha256&&a.sourceSetSha256===SOURCE_SHA&&a.driverSha256===ownSha
  &&digest(authorizationSha)&&digest(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.trim().length>0
  &&a.binding&&Object.getPrototypeOf(a.binding)===Object.prototype&&(p.phase!=='ADMIN_PROVISION_ONLY'||digest(a.operationAuthoritySha256)),'EXACT_EXTERNAL_AUTHORITY_REQUIRED');
 need(Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)&&a.startsAt<=Date.now()&&Date.now()<a.expiresAt-45000,'AUTHORITY_WINDOW_REQUIRED');
}
function validateProof(v,a,validateInstant){
 need(keys(v,['format','requestKey','authorizationSha256','checkedAt','installationRecordSha256','targetSha256','sourceSetSha256','serviceReceiptSha256','dataDirectory','dataDirectoryIdentity','physical','sharedPostgresNamespace','postmaster','guardian','runtimeRole','runtimeLoginValidUntil'])
  &&v.format==='FRESH35_CURRENT_PRODUCTION_SERVICE_V2'&&v.requestKey==='t45-first-r3-native-service-start-20261111-04'
  &&v.installationRecordSha256===RECORD_SHA&&v.sourceSetSha256===OLD_SOURCE&&digest(v.targetSha256)&&digest(v.authorizationSha256)&&digest(v.serviceReceiptSha256)
  &&keys(v.physical,[...Object.keys(physical),'postmasterStart'])&&Object.entries(physical).every(([k,x])=>v.physical[k]===x)
  &&typeof v.physical.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?\+00$/.test(v.physical.postmasterStart)
  &&validateInstant(v.physical.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'))
  &&Date.parse(v.physical.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'))<=v.checkedAt
  &&v.runtimeRole==='erp35_runtime_20261110_r3'&&v.runtimeLoginValidUntil===null&&Number.isSafeInteger(v.checkedAt)&&v.checkedAt<=Date.now()
  &&v.sharedPostgresNamespace?.creationOperationId===v.requestKey&&v.sharedPostgresNamespace.container?.name==='t45-fresh35-first-production-20261110-r3-service-04'
  &&Number.isSafeInteger(v.sharedPostgresNamespace.serviceLeaseExpiresAt)&&v.sharedPostgresNamespace.serviceLeaseExpiresAt>=a.expiresAt,'CURRENT04_PROOF_REQUIRED');
}

async function openJob(p,rawInput,authorizationSha,m){
 const inputSha=hash(rawInput),jobIdentity=await privateDirectory(JOB,m.trust);
 const auth=await protectedBytes(join(JOB,'maintenance-node-authorization.json'),true),a=freeze(m.parse(auth.bytes.toString('utf8')));
 need(auth.sha256===authorizationSha,'AUTHORITY_RAW_SHA_DIFFERS');
 const self=await protectedBytes(ownPath);validateGrant(a,p,inputSha,authorizationSha,self.sha256);
 const {proof,alias,value:v}=await readCurrentService(p,a,m);
 const entries=await readdir(JOB);need(entries.length===1&&entries[0]==='maintenance-node-authorization.json','JOB_ALREADY_USED');
 const reservation=await writeDurable(join(JOB,'maintenance-node-reservation.json'),Buffer.from(JSON.stringify({format:'T45_R3_ADMIN154_NODE_RESERVATION_V1',phase:p.phase,requestKey:a.requestKey,inputSha256:inputSha,authorizationSha256:auth.sha256,at:new Date().toISOString()})+'\n'));
 await mkdir(join(JOB,'events'),{mode:0o700});
 const parent=await open(JOB,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}
 need(await privateDirectory(JOB,m.trust)===jobIdentity,'JOB_GENERATION_CHANGED');
 const eventIdentity=await privateDirectory(join(JOB,'events'),m.trust);let index=0,previous=null;
 const fileCurrent=async()=>{need(await privateDirectory(JOB,m.trust)===jobIdentity&&await privateDirectory(join(JOB,'events'),m.trust)===eventIdentity,'JOB_GENERATION_CHANGED');await unchanged(auth);await unchanged(reservation);
  const actual=await protectedBytes(PROOF),currentAlias=await protectedBytes(HOST_PROOF);need(actual.identity===proof.identity&&actual.sha256===proof.sha256&&currentAlias.identity===alias.identity&&currentAlias.sha256===alias.sha256,'CURRENT04_PROOF_CHANGED');};
 const privateValues=[p.connection.password,...(p.phase==='ADMIN_PROVISION_ONLY'?[p.encodedScrypt]:[])];
 const emit=async event=>{m.exclude(event,privateValues);await fileCurrent();const bytes=Buffer.from(JSON.stringify({format:'T45_R3_ADMIN154_NODE_EVENT_V1',index:++index,previousSha256:previous,at:new Date().toISOString(),event})+'\n');
  const written=await writeDurable(join(JOB,'events',String(index).padStart(6,'0')+'.json'),bytes);previous=written.sha256;};
 const current=async()=>{await fileCurrent();need(Date.now()>=a.startsAt&&Date.now()<a.expiresAt-45000,'AUTHORITY_EXPIRED');};
 const authorized=async binding=>{await current();
  const expectedBinding=structuredClone(binding);if(p.phase==='UPGRADE'){need(expectedBinding.authorizationSha256===auth.sha256,'UPGRADE_AUTHORITY_DIFFERS');delete expectedBinding.authorizationSha256;}
  need(m.requestHash(expectedBinding)===m.requestHash(a.binding),'EXACT_BINDING_DIFFERS');};
 await emit({state:'NODE_RESERVATION_DURABLE',phase:p.phase,inputSha256:inputSha,authorizationSha256:auth.sha256});
 return {a,proof:v,emit,authorized,current,fileCurrent,privateValues};
}
async function runUpgrade(p,j,m){
 const leaf=join(dirname(ownPath),'fresh35-admin154-upgrade.mjs'),pin=await protectedBytes(leaf);need(pin.sha256===UPGRADE_SHA,'FIXED_UPGRADE_LEAF_REQUIRED');
 const {runFresh35Admin154Upgrade}=await import(pathToFileURL(leaf).href);
 const {closePhysical}=await moduleAt('tools/unified-import/whole-host-session.mjs');m.close=closePhysical;
 const require=createRequire(pathToFileURL(join(SOURCE,'package.json'))),{Client}=require('pg');need(require('pg/package.json').version==='8.23.1','PG_VERSION_REQUIRED');
 const created=new Set(),closing=new Map();let handed=false,client;
 const close=c=>{if(!closing.has(c))closing.set(c,m.close(c));return closing.get(c);};
 const connect=async()=>{const timeout=Math.min(5000,j.a.expiresAt-45000-Date.now());need(timeout>0,'AUTHORITY_EXPIRED');
  const c=new Client({...p.connection,password:()=>p.connection.password,application_name:'t45-admin154-maintenance-upgrade',connectionTimeoutMillis:timeout,query_timeout:45000,
   options:'-c search_path=pg_catalog -c TimeZone=UTC -c lock_timeout=5000 -c statement_timeout=40000'});created.add(c);c.on('error',()=>{});
  try{await c.connect();return c;}catch(error){await close(c);created.delete(c);throw error;}};
 try{
  await j.current();
  client=await connect();handed=true;
  return await runFresh35Admin154Upgrade({sourceRoot:SOURCE,referenceDirectory:REFERENCE,client,openReadback:connect,postmasterStart:j.proof.physical.postmasterStart,
   authorizationSha256:j.aHash,startsAt:j.a.startsAt,expiresAt:j.a.expiresAt,assertAuthorized:j.authorized,emit:j.emit});
 }catch(error){let cleanup='CLOSED';for(const c of created)if(c._ended!==true){if(c._ending===true){c.connection?.stream?.destroy();cleanup='UNKNOWN';}else try{await close(c);}catch{cleanup='UNKNOWN';}}
  return {state:handed?'COMMIT_OUTCOME_UNKNOWN':'NOT_STARTED',code:'ADMIN154_DRIVER_UPGRADE_CALL_FAILED',connectionCleanup:cleanup,recordPublished:false,automaticRetry:false};}
}

async function readCurrentService(p,window,m){
 const proof=await protectedBytes(PROOF),alias=await protectedBytes(HOST_PROOF);need(proof.sha256===p.currentService.sha256&&alias.sha256===proof.sha256,'CURRENT04_PROOF_ALIAS_DIFFERS');
 const value=freeze(m.parse(proof.bytes.toString('utf8')));validateProof(value,window,m.validateInstant);
 const ns=await stat('/proc/self/ns/net',{bigint:true}),expected=value.sharedPostgresNamespace.container.networkNamespace;
 need(expected&&ns.dev===BigInt(expected.device)&&ns.ino===BigInt(expected.inode),'CURRENT04_NAMESPACE_DIFFERS');return {proof,alias,value};
}
async function packetModules(rawInput){
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536,'PRIVATE_INPUT_BOUND');
 need(process.platform==='linux'&&process.version==='v24.21.0'&&process.getuid?.()===0&&process.geteuid?.()===0&&process.getgid?.()===0
  &&!Object.keys(process.env).some(k=>k==='DATABASE_URL'||k.startsWith('PG')||['NODE_OPTIONS','NODE_PATH'].includes(k)||k.startsWith('LD_')||k.startsWith('DYLD_')),'PINNED_ROOT_RUNTIME_REQUIRED');
 const contract=await moduleAt('packages/application/src/unified-import-contract.ts'),trust=await moduleAt('scripts/release/unified-install/trusted-install-path.mjs');
 await trust.assertTrustedRootTree(SOURCE);await trust.assertTrustedRootPath(ownPath);await trust.assertTrustedRootPath(process.execPath);
 const p=freeze(contract.parseStrictJson(rawInput.toString('utf8')));validatePacket(p);
 const [{requestHash},{assertPublicValuesExcludePrivateInputs:exclude}]=await Promise.all([moduleAt('packages/application/src/request-hash.ts'),moduleAt('tools/unified-import/execution-client.ts')]);
 return {p,m:{trust,parse:contract.parseStrictJson,validateInstant:contract.validateOffsetInstant,requestHash,exclude}};
}
async function preparationBinding(p,window,proof,m){
 if(p.phase==='ADMIN_PROVISION_ONLY'){
  m.host=await moduleAt('tools/unified-import/fresh35-host-session.mjs');m.record=await moduleAt('scripts/release/unified-install/fresh35-admin154-record-v1.mjs');
  const actual=await protectedBytes(m.record.ADMIN154_RECORD_PATH);need(actual.sha256===p.successorRecordSha256,'PUBLISHED_RECORD_SHA_DIFFERS');
  const context=await m.host.loadFresh35Admin154Context(SOURCE,REFERENCE,{sha256:p.currentService.sha256,capacityExpiresAt:window.expiresAt},p.successorRecordSha256);
  return m.host.describeFresh35Admin154SetupBinding(context,{purpose:'ADMIN_PROVISION_ONLY',request:p.request,encodedScrypt:p.encodedScrypt});
 }
 const names=['source','target','catalog','record'],modules=await Promise.all(names.map(n=>moduleAt('scripts/release/unified-install/fresh35-combined-'+n+'-v1.mjs'))),[sources,targets,catalogs,records]=modules;
 const envelope=await records.loadFresh35CombinedRecordEnvelope(),snapshot=records.describeFresh35ProtectedRecordSnapshot(envelope);
 need(snapshot.sha256===RECORD_SHA&&envelope.binding.sourceSetSha256===OLD_SOURCE,'ORIGINAL_RECORD_REQUIRED');
 const target=await targets.reconstructFresh35InstalledProductionTargetV2(envelope),t=targets.describeFresh35CombinedTarget(target),paths=await sources.resolveFresh35ReferenceInputPaths(REFERENCE);
 const source=await sources.loadFresh35Admin154Source(SOURCE,paths),s=sources.describeFresh35CombinedSource(source),catalog=await catalogs.buildFresh35Admin154Catalog(source,target,paths),d=catalogs.describeFresh35CombinedCatalog(catalog);
 need(s.sourceSetSha256===SOURCE_SHA&&s.currentSourcePins.length===219,'FIXED_SOURCE_REQUIRED');
 const oldRoot='/opt/naijue-erp/fresh35-combined-v1';await m.trust.assertTrustedRootTree(oldRoot);const old=await Promise.all(['source','target','catalog','lifecycle','record'].map(n=>import(pathToFileURL(join(oldRoot,'scripts/release/unified-install/fresh35-combined-'+n+'-v1.mjs')).href)));
 const [os,ot,oc,op,or]=old,oe=await or.loadFresh35CombinedRecordEnvelope();need(or.describeFresh35ProtectedRecordSnapshot(oe).sha256===snapshot.sha256,'HISTORICAL_RECORD_DIFFERS');
 const oldPaths=await os.resolveFresh35ReferenceInputPaths(REFERENCE),oldSource=await os.loadFresh35CombinedSource(oldRoot,oldPaths),oldTarget=await ot.reconstructFresh35InstalledProductionTargetV2(oe),oldCatalog=await oc.buildFresh35CombinedCatalog(oldSource,oldTarget,oldPaths);
 const record=or.validateFresh35CombinedRecord(oe,await op.compileFresh35CombinedProgram({source:oldSource,target:oldTarget,catalog:oldCatalog}));
 need(d.predecessorModelSha256===oc.describeFresh35CombinedCatalog(oldCatalog).modelSha256,'HISTORICAL_MODEL_DIFFERS');
 return {format:'FRESH35_ADMIN154_SQL36_UPGRADE_BINDING_V1',predecessor:{recordSha256:snapshot.sha256,sourceSetSha256:record.binding.sourceSetSha256,programSha256:record.programSha256,catalogSha256:record.catalogSha256,targetSha256:record.binding.targetSha256},
  successor:{patchSqlSha256:d.patchSqlSha256,sourceSetSha256:d.sourceSetSha256,catalogSpecSha256:d.catalogSpecSha256,modelSha256:d.modelSha256},
  physical:{...physical,database:t.proposal.database,postmasterStart:proof.physical.postmasterStart},owner:t.proposal.owner,host:t.proposal.host,port:t.proposal.port,startsAt:window.startsAt,expiresAt:window.expiresAt};
}

/** Read-only preparation, not an approval: no pg require/client, job claim,
 * journal, final publication or operation-authority file is opened/created. */
export async function describeFresh35Admin154MaintenancePreparation(rawInput,window){
 try{
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536,'PRIVATE_INPUT_BOUND');rawInput=Buffer.from(rawInput);window={...window};
 need(keys(window,['startsAt','expiresAt'])&&Number.isSafeInteger(window.startsAt)&&Number.isSafeInteger(window.expiresAt)&&window.startsAt<window.expiresAt&&Date.now()<window.expiresAt-45000,'EXPLICIT_PREPARATION_WINDOW_REQUIRED');
 const {p,m}=await packetModules(rawInput),{value:proof}=await readCurrentService(p,window,m),binding=await preparationBinding(p,window,proof,m);
 const self=await protectedBytes(ownPath),result={state:'READ_ONLY_PREPARATION_NOT_AUTHORIZATION',phase:p.phase,requestKey:p.phase==='UPGRADE'?'t45-r3-admin154-upgrade-20261111-01':'t45-r3-admin154-admin-provision-20261111-01',
  inputSha256:hash(rawInput),currentServiceSha256:p.currentService.sha256,sourceSetSha256:SOURCE_SHA,driverSha256:self.sha256,binding,
  ...(p.phase==='ADMIN_PROVISION_ONLY'?{operationAuthorityBinding:{format:'FRESH35_A53_ADMIN154_EXECUTION_AUTHORIZATION_V1',decision:'AUTHORIZE_EXACT_ADMIN_PROVISION_ONLY',binding,startsAt:window.startsAt,expiresAt:window.expiresAt}}:{})};
 m.exclude(result,[p.connection.password,...(p.phase==='ADMIN_PROVISION_ONLY'?[p.encodedScrypt]:[])]);return freeze(result);
 }catch(error){throw Error(safeCode(error,'ADMIN154_DRIVER_PREPARATION_METADATA_FAILED'));}
}
async function runAdmin(p,j,m){
 const record=await protectedBytes(m.record.ADMIN154_RECORD_PATH);need(record.sha256===p.successorRecordSha256,'PUBLISHED_RECORD_SHA_DIFFERS');
 const context=await m.host.loadFresh35Admin154Context(SOURCE,REFERENCE,{sha256:p.currentService.sha256,capacityExpiresAt:j.a.expiresAt},p.successorRecordSha256);
 const prepared={purpose:'ADMIN_PROVISION_ONLY',request:p.request,encodedScrypt:p.encodedScrypt};
 const binding=await m.host.describeFresh35Admin154SetupBinding(context,prepared);await j.authorized(binding);
 const authority=await m.record.loadFresh35Admin154Authorization(binding,'ADMIN_PROVISION_ONLY',j.a.expiresAt),actual=await m.record.assertFresh35Admin154AuthorizationCurrent(authority);
 need(actual.sha256===j.a.operationAuthoritySha256,'A_OPERATION_AUTHORITY_DIFFERS');
 await j.emit({state:'A_PUBLISHED_RECORD_AND_AUTHORITY_VERIFIED',recordSha256:record.sha256,binding});
 const c=p.connection,config={host:c.host,port:c.port,database:c.database,user:c.user,password:c.password};
 let response;
 try{response=await m.host.runFresh35Admin154Setup(config,SOURCE,{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:physical.systemIdentifier,database_oid:physical.databaseOid,
  database_name:c.database,catalog_sha256:binding.catalogSha256},p.request,p.encodedScrypt,{referenceDirectory:REFERENCE,successorSha256:p.successorRecordSha256,
  currentService:{sha256:p.currentService.sha256,capacityExpiresAt:j.a.expiresAt},prepareOnly:false});}
 catch{return {state:'UNKNOWN',code:'ADMIN154_DRIVER_A_CALL_FAILED',connection_cleanup:'UNKNOWN',automaticRetry:false};}
 const r=response.result;return {...r,connection_cleanup:response.cleanup,host_verification:response.host_verification,
  ...(['COMMITTED','ALREADY_COMMITTED'].includes(r?.state)?{provision_origin:{operation_id:r.receipt.operationId,request_sha256:r.request_sha256}}:{}),automaticRetry:false};
}

/** argv contains ONLY externally pinned raw input/authorization hashes.
 * All actual facts and credentials arrive once via the original private stdin. */
export async function runMaintenanceDriver(rawInput,inputSha,authorizationSha){
 need(Buffer.isBuffer(rawInput)&&rawInput.length>0&&rawInput.length<=65536&&digest(inputSha)&&digest(authorizationSha)&&hash(rawInput)===inputSha,'PRIVATE_INPUT_SHA_REQUIRED');rawInput=Buffer.from(rawInput);
 let packet;try{packet=await packetModules(rawInput);}catch(error){return {state:'NOT_STARTED',code:safeCode(error,'ADMIN154_DRIVER_PRIVATE_PACKET_FAILED'),automaticRetry:false};}
 const {p,m}=packet,exclude=m.exclude;
 let j,result;
 try{
  j=await openJob(p,rawInput,authorizationSha,m);j.aHash=authorizationSha;
  if(p.phase==='UPGRADE')result=await runUpgrade(p,j,m);
  else{m.host=await moduleAt('tools/unified-import/fresh35-host-session.mjs');m.record=await moduleAt('scripts/release/unified-install/fresh35-admin154-record-v1.mjs');result=await runAdmin(p,j,m);}
  try{exclude(result,j.privateValues);}catch{result={state:result?.state??'UNKNOWN',code:'PUBLIC_OUTPUT_REDACTED',summary_redacted:true,connectionCleanup:result?.connectionCleanup,connection_cleanup:result?.connection_cleanup,automaticRetry:false};}
  try{await j.emit({state:'NODE_CALL_FINISHED',phase:p.phase,result});}catch{result.journal='UNCONFIRMED';delete result.record;delete result.recordJson;delete result.recordSha256;}
  return result;
 }catch(error){
  result={state:'NOT_STARTED',code:safeCode(error,'ADMIN154_DRIVER_PREPARATION_FAILED'),automaticRetry:false};
  if(j)try{await j.emit(result);}catch{result.journal='UNCONFIRMED';}return result;
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  need(process.argv.length===4,'HASH_ARGUMENTS_REQUIRED');let length=0;const chunks=[];
  for await(const chunk of process.stdin){length+=chunk.length;need(length<=65536,'PRIVATE_INPUT_BOUND');chunks.push(chunk);}
  const r=await runMaintenanceDriver(Buffer.concat(chunks,length),process.argv[2],process.argv[3]);process.stdout.write(JSON.stringify(r)+'\n');
  const success=r.state==='COMMITTED_UNPUBLISHED'&&r.catalogReadback==='VERIFIED'&&r.connectionCleanup==='CLOSED'&&r.record
   ||['COMMITTED','ALREADY_COMMITTED'].includes(r.state)&&r.connection_cleanup==='CLOSED';
  process.exitCode=success&&r.journal!=='UNCONFIRMED'&&!r.summary_redacted?0:['UNKNOWN','COMMIT_OUTCOME_UNKNOWN','ROLLBACK_UNCONFIRMED'].includes(r.state)?2:1;
 }catch{process.stdout.write(JSON.stringify({state:'NOT_STARTED',code:'ADMIN154_DRIVER_INPUT_FAILED',automaticRetry:false})+'\n');process.exitCode=1;}
}
