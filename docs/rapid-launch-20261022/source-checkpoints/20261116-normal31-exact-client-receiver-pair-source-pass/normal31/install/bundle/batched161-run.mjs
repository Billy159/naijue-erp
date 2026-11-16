// Exact installer consumer. 'describe' never creates directories or a PG client.
import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {readFile,open,lstat,realpath,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const STATE='/var/lib/naijue-erp/fresh35-production';
const OP=STATE+'/installed-real-operation-batched-root04-20261116-01/operation';
const NEED=(v,c)=>{if(!v)throw Error('BATCHED_INSTALL_'+c)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
async function input(){
 const blocks=[];let bytes=0;
 try{for await(const b of process.stdin){bytes+=b.length;NEED(bytes<=131072,'INPUT_BOUND');blocks.push(b)}
  const b=Buffer.concat(blocks);try{return JSON.parse(b.toString('utf8'))}finally{b.fill(0)}
 }finally{blocks.forEach(b=>b.fill(0))}
}
async function main(){
 NEED(process.platform==='linux'&&process.version==='v24.21.0'&&process.getuid()===0&&process.geteuid()===0
  &&process.getgid()===0&&process.getegid()===0&&fstatSync(0).isFIFO()&&process.argv.length===3
  &&process.execArgv.join(',')==='--no-global-search-paths','FIXED_ROOT_PROCESS_REQUIRED');
 NEED(!Object.keys(process.env).some(k=>/^PG/.test(k)||['DATABASE_URL','NODE_PATH','NODE_OPTIONS'].includes(k)
  ||k.startsWith('LD_')||k.startsWith('DYLD_')),'AMBIENT_CONFIG_REFUSED');
 const mode=process.argv[2],p=await input();
 let traceStart;
 const trace=stage=>{
  if(mode!=='describe')return;
  traceStart??=process.hrtime.bigint();
  const elapsedMilliseconds=Math.round(Number(process.hrtime.bigint()-traceStart)/1000)/1000;
  process.stderr.write('T45_DESCRIBE_STAGE '+JSON.stringify({stage,elapsedMilliseconds})+'\n');
 };
 trace('IMPORT_BEGIN');
 NEED(mode==='describe'||digest(mode),'FIXED_ENTRY_REQUIRED');
 const src=await import(pathToFileURL(OP+'/scripts/release/unified-install/fresh35-combined-source-v1.mjs'));
 const tm=await import(pathToFileURL(OP+'/scripts/release/unified-install/fresh35-combined-target-v1.mjs'));
 const up=await import(pathToFileURL(OP+'/scripts/release/unified-install/fresh35-batched161-upgrade-v1.mjs'));
 const trust=await import(pathToFileURL(OP+'/scripts/release/unified-install/trusted-install-path.mjs'));
 trace('IMPORT_END');trace('TRUST_BEGIN');
 await trust.assertTrustedRootPath(process.execPath);await trust.assertTrustedRootTree(OP);
 trace('TRUST_END');
 const proofBytes=await readFile('/run/naijue-rewrite/current-production-service.json');
 const c=JSON.parse(proofBytes);
 NEED(sha(proofBytes)===p.service.proofSha256&&c.requestKey===p.service.serviceKey
  &&c.requestKey==='t45-first-r3-native-service-start-20261116-31'
  &&c.physical.postmasterStart===p.service.postmasterStart
  &&c.sharedPostgresNamespace.container.id===p.service.containerId
  &&c.sharedPostgresNamespace.container.startedAt===p.service.containerStartedAt,'CURRENT_SERVICE_DIFFERS');
 trace('SOURCE_LOAD_BEGIN');
 const paths=await src.resolveFresh35ReferenceInputPaths('/opt/naijue-erp/fresh35-combined-v1/reference-inputs');
 const source=await src.loadFresh35CompactZeroSource(OP,paths);
 trace('SOURCE_LOAD_END');
 if(mode==='describe'){
  const t0=Date.now();
  p.installStartsAt=t0;
  p.installExpiresAt=Math.min(t0+1200000,p.backupAdminValidUntil,c.sharedPostgresNamespace.serviceLeaseExpiresAt);
 }
 trace('TARGET_BEGIN');
 const target=await tm.loadFresh35Installed154UpgradeTargetV1({source,
  currentServiceSha256:p.service.proofSha256,startsAt:p.installStartsAt,
  expiresAt:p.installExpiresAt,backupAdminValidUntil:p.backupAdminValidUntil});
 trace('TARGET_END');
 const installedTarget=tm.describeFresh35Installed154UpgradeTarget(target);
 trace('COMPILE_BEGIN');
 const program=await up.compileFresh35Batched161Upgrade({source,target,paths,
  currentServiceSha256:p.service.proofSha256,backupAdminValidUntil:p.backupAdminValidUntil});
 trace('COMPILE_END');
 const d=up.describeFresh35Batched161Upgrade(program);
 const batchedCatalog={sourceSetSha256:d.successorSourceSetSha256,
  catalogSpecSha256:d.successorCatalogSpecSha256,modelSha256:d.successorModelSha256};
 NEED(Object.values(batchedCatalog).every(digest),'GENUINE_PROGRAM_CATALOG_EVIDENCE_REQUIRED');
 const facts={batchedCatalog,requestKey:'t45-r3-batched-install-20261115-01',service:p.service,physical:c.physical,
  currentServiceSha256:p.service.proofSha256,sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256,
  successorCatalogSpecSha256:d.successorCatalogSpecSha256,successorModelSha256:d.successorModelSha256,
  backupAdminValidUntil:p.backupAdminValidUntil,actualSharedServiceWorkDeadline:c.sharedPostgresNamespace.serviceLeaseExpiresAt-35000};
 if(mode==='describe')return {state:'PROGRAM_DESCRIBED_NO_PG_OR_WRITE',descriptor:d,liveFacts:facts,
  payload:{service:p.service,backupAdminValidUntil:d.backupAdminValidUntil,installStartsAt:d.startsAt,installExpiresAt:d.expiresAt},
  databaseConnections:0,mutations:0};
 const outer=await readFile(new URL('./install-authorization.json',import.meta.url));
 NEED(sha(outer)===mode&&isDeepStrictEqual(JSON.parse(outer),p.authority),'OUTER_AUTHORITY_DIFFERS');
 NEED(isDeepStrictEqual(d,p.authority.upgradeDescriptor),'PROGRAM_DESCRIPTION_CHANGED');
 const a=await up.loadFresh35Batched161UpgradeAuthorization(program);
 NEED(p.postgres?.host==='127.0.0.1'&&p.postgres.port===56791&&p.postgres.database==='erp_fresh35_20261110_r3'
  &&p.postgres.user==='erp35_admin_20261110_r3'&&p.postgres.ssl===false&&digest(p.postgres.password),'FINITE_ADMIN_CONNECTION_REQUIRED');
 const {Client}=await loadRetainedR3LinuxPgDriver();
 const client=new Client({host:p.postgres.host,port:p.postgres.port,database:p.postgres.database,user:p.postgres.user,
  password:()=>p.postgres.password,ssl:false,application_name:'t45-batched161-upgrade',connectionTimeoutMillis:5000,
  statement_timeout:300000,query_timeout:305000,lock_timeout:5000,options:'-c search_path=pg_catalog'});
 const evidence={requestKey:facts.requestKey,service:p.service,sourceSetSha256:d.sourceSetSha256,
  state:'UNKNOWN',connectionCleanup:'NOT_OPENED',programSha256:d.programSha256,automaticReplay:false};
 let opened=false,connectionError=false;
 client.on('error',()=>{connectionError=true});
 try{
  await client.connect();opened=true;evidence.connectionCleanup='UNKNOWN';NEED(!connectionError,'CONNECTION_UNCONFIRMED');
  const dir=installedTarget.proposal.workspaceDirectory+'/batched161-upgrade';
  await mkdir(dir,{mode:0o700});
  const result=await up.runFresh35Batched161Upgrade({program,authorization:a,client,recordDirectory:dir});
  Object.assign(evidence,result);
  const completion=await readFile(dir+'/completion.json');
  const r=JSON.parse(completion);
  NEED(r.commits.length===13&&r.commits.every(v=>v.commitAcknowledged),'COMPLETION_ACKS_REQUIRED');
  evidence.completionSha256=sha(completion);evidence.acknowledgedLayers=r.commits.length;
  NEED(r.roleRestoreAcknowledged===true&&r.connectionIdentity?.sessionUser==='erp35_admin_20261110_r3'
   &&r.connectionIdentity?.effectiveUser==='erp35_owner_20261110_r3','ACTUAL_ROLE_RESTORE_REQUIRED');
  evidence.connectionIdentity=r.connectionIdentity;evidence.roleRestoreAcknowledged=r.roleRestoreAcknowledged;
  evidence.batchedCatalog=batchedCatalog;
  evidence.successorCatalogSpecSha256=d.successorCatalogSpecSha256;evidence.successorModelSha256=d.successorModelSha256;
 }catch(error){
  if(error.batched161UpgradeFailure)Object.assign(evidence,{state:error.batched161UpgradeFailure.state,upgradeFailure:error.batched161UpgradeFailure});
  evidence.sqlstate=/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null;
  evidence.safeCode=/^[A-Z][A-Z0-9_]{0,159}$/.test(error?.message??'')?error.message:'BATCHED_INSTALL_NATIVE_UNCONFIRMED';
 }finally{
  let timer;
  try{await Promise.race([client.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CLOSE_TIMEOUT')),5000)})]);evidence.connectionCleanup='CLOSED'}
  catch{client.connection?.stream?.destroy();evidence.connectionCleanup=opened?'CLOSE_UNCONFIRMED':'CONNECT_FAILED_CLEANUP_UNCONFIRMED'}
  finally{clearTimeout(timer);p.postgres.password=null}
 }
 return evidence;
}

async function loadRetainedR3LinuxPgDriver(){
 const root='/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules';
 const need=(ok)=>{if(!ok)throw Error('R3_RETAINED_LINUX_DRIVER_DIFFERS')};
 const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.nlink,s.mode,s.size,s.mtimeNs,s.ctimeNs].join(':');
 for(const [leaf,pin,bytes,inode]of [
  ['.package-lock.json','7e2bc5e96f2b95c7404479d2785372696323d8ec9b49ce6e642de2bedf120f7d',49967,13504782n],
  ['pg/esm/index.mjs','5ef4d06556eeb775987759c2c09229dca2139421ee40e819b566612db2b4a8dc',579,13506784n],
 ]){
  const path=root+'/'+leaf;need(await realpath(path)===path);
  for(let directory=dirname(path);;directory=dirname(directory)){
   const s=await lstat(directory),inDeps=directory===root||directory.startsWith(root+'/');
   need(s.isDirectory()&&s.uid===(inDeps?1000:0)&&!(s.mode&0o022)
    &&(directory!==root||(s.dev===66304&&s.ino===13504771&&s.gid===1000&&(s.mode&0o777)===0o755)));
   if(directory==='/')break;
  }
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const before=await file.stat({bigint:true});
   need(before.isFile()&&before.dev===66304n&&before.ino===inode&&before.uid===1000n&&before.gid===1000n
    &&before.nlink===1n&&(before.mode&0o777n)===0o644n&&before.size===BigInt(bytes));
   const buffer=Buffer.alloc(bytes+1);let used=0;
   while(used<buffer.length){const r=await file.read(buffer,used,buffer.length-used,null);if(!r.bytesRead)break;used+=r.bytesRead}
   need(used===bytes&&identity(before)===identity(await file.stat({bigint:true}))
    &&identity(before)===identity(await lstat(path,{bigint:true}))
    &&createHash('sha256').update(buffer.subarray(0,used)).digest('hex')===pin);
  }finally{await file.close()}
 }
 return import(pathToFileURL(root+'/pg/esm/index.mjs').href);
}


// Failure-only metadata. Never publish messages, stack text or input paths.
const ERROR_TYPES=['Error','TypeError','ReferenceError','SyntaxError','RangeError','AssertionError','AggregateError','OTHER'];
const SYSTEM_CODES=['ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ENOENT','EACCES','EPERM','ENOTDIR','ELOOP','EMFILE','ENFILE','OTHER'];
const GUARD_CODES=['FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS','FRESH35_COMBINED_CURRENT_SOURCE_CHANGED'];
const SOURCE_MODULES=new Map([
 ['scripts/release/unified-install/fresh35-batched161-upgrade-v1.mjs','UPGRADE'],
 ['scripts/release/unified-install/fresh35-combined-target-v1.mjs','TARGET'],
 ['scripts/release/unified-install/fresh35-combined-record-v1.mjs','RECORD'],
 ['scripts/release/unified-install/fresh35-combined-source-v1.mjs','SOURCE'],
 ['scripts/release/unified-install/fresh35-combined-catalog-v1.mjs','CATALOG'],
 ['scripts/release/unified-install/fresh35-sql39-catalog-delta.mjs','SQL39_CATALOG_DELTA'],
 ['scripts/release/unified-install/performance155/derive155.mjs','DERIVE155'],
 ['scripts/release/unified-install/performance155/parents/20261115-r3-party-audit-key-pg-local-01/derive155.mjs','DERIVE_PARTY_AUDIT_KEY'],
 ['scripts/release/unified-install/performance155/parents/20261115-r3-party-set-scalar-pg-local-03/derive155.mjs','DERIVE_PARTY_SET_SCALAR'],
 ['scripts/release/unified-install/performance155/parents/20261115-r3-root114-final-combination-local-01/derive155.mjs','DERIVE_ROOT114'],
 ['scripts/release/unified-install/fresh35-retirement-schema.mjs','SCHEMA_PARSER'],
 ['packages/application/src/unified-import-contract.ts','CONTRACT_PARSER'],
]);
function safeErrorFields(error){
 const errorType=ERROR_TYPES.includes(error?.name)?error.name:'OTHER';
 const systemCode=typeof error?.code==='string'?(SYSTEM_CODES.includes(error.code)?error.code:'OTHER'):null;
 const message=typeof error?.message==='string'?error.message:'';
 const prefix=message.includes(':')?message.slice(0,message.indexOf(':')):null;
 const guardCode=GUARD_CODES.includes(prefix)?prefix:null;
 let sourceFrame=null;
 if(typeof error?.stack==='string'){
  const root=OP.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const frame=new RegExp(String.raw`^\s+at (?:[^()\r\n]* \()?((?:file://)?${root}/[^\s():?#]+):([1-9][0-9]*):([1-9][0-9]*)\)?$`);
  for(const line of error.stack.split('\n').slice(1,33)){
   const match=frame.exec(line);if(!match)continue;
   const absolute=match[1].startsWith('file://')?match[1].slice(7):match[1];
   const module=SOURCE_MODULES.get(absolute.slice(OP.length+1)),row=Number(match[2]),column=Number(match[3]);
   if(module&&Number.isSafeInteger(row)&&Number.isSafeInteger(column)&&row>0&&column>0){sourceFrame={module,line:row,column};break;}
  }
 }
 return {errorType,systemCode,guardCode,sourceFrame};
}

try{const result=await main();process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=['PROGRAM_DESCRIBED_NO_PG_OR_WRITE','DB05_CATALOG_INSTALLED_AND_CAPTURED'].includes(result.state)
  &&(result.connectionCleanup===undefined||result.connectionCleanup==='CLOSED')?0:2;
}catch(error){process.stdout.write(JSON.stringify({requestKey:'t45-r3-batched-install-20261115-01',state:'UNKNOWN',
 safeCode:/^[A-Z][A-Z0-9_]{0,159}$/.test(error?.message??'')?error.message:'BATCHED_INSTALL_PREFLIGHT_REFUSED',
 sqlstate:/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null,...safeErrorFields(error),connectionCleanup:'NOT_OPENED',automaticReplay:false})+'\n');process.exitCode=2}
