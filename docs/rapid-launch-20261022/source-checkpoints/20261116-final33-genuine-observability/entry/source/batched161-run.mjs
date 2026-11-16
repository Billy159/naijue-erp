/** Describe or apply exactly one reviewed DB05 routine successor. */
import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {lstat,mkdir,open,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual as equal,types} from 'node:util';


// Closed observations for the existing start_owned_describe parser only.
const describeStages=Object.freeze(['IMPORT_BEGIN','IMPORT_END','TRUST_BEGIN','TRUST_END','SOURCE_LOAD_BEGIN','SOURCE_LOAD_END','TARGET_BEGIN','TARGET_END','COMPILE_BEGIN','COMPILE_END']);
const describeErrorTypes=new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','AssertionError','AggregateError','OTHER']);
const describeSystemCodes=new Set(['ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ENOENT','EACCES','EPERM','ENOTDIR','ELOOP','EMFILE','ENFILE','OTHER']);
const describeGuardCodes=new Set(['FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS','FRESH35_COMBINED_CURRENT_SOURCE_CHANGED']);
const describeSafeCodes=new Set(["DB05_COMMAND_ACTUAL_LOGIN_DIFFERS","DB05_COMMAND_AMBIENT_CONFIG_REFUSED","DB05_COMMAND_CANONICAL_FILE_REQUIRED","DB05_COMMAND_CATALOG_161_REQUIRED","DB05_COMMAND_CATALOG_MODEL_LINEAGE_DIFFERS","DB05_COMMAND_CATALOG_PACKET_REQUIRED","DB05_COMMAND_CURRENT_C_REQUIRED","DB05_COMMAND_EXACT_ROUTINE_DIFFERS","DB05_COMMAND_FILE_CHANGED","DB05_COMMAND_FINAL_ENTRY_DIFFERS","DB05_COMMAND_FINAL_ORIGINAL_IDENTITY_REQUIRED","DB05_COMMAND_FINAL_ORIGINAL_TARGET_DIFFERS","DB05_COMMAND_FINAL_REVIEW_REQUIRED","DB05_COMMAND_FINITE_ADMIN_REQUIRED","DB05_COMMAND_FIXED_ENTRY_REQUIRED","DB05_COMMAND_FIXED_ROOT_PROCESS_REQUIRED","DB05_COMMAND_FUNCTION_ACL_OR_ATTRIBUTES_CHANGED","DB05_COMMAND_INNER_AUTHORITY_CHANGED","DB05_COMMAND_INNER_BINDING_DIFFERS","DB05_COMMAND_INPUT_BOUND","DB05_COMMAND_NATIVE_ACK_REQUIRED","DB05_COMMAND_ONE_REVIEWED_DO_REQUIRED","DB05_COMMAND_OUTER_BINDING_DIFFERS","DB05_COMMAND_PREFLIGHT_REFUSED","DB05_COMMAND_PROTECTED_FILE_REQUIRED","DB05_COMMAND_READBACK_ACL_OR_ATTRIBUTES_CHANGED","DB05_COMMAND_REVIEWED_INPUT_BYTES_DIFFER","DB05_COMMAND_REVIEWED_SINGLE_FUNCTION_REQUIRED","DB05_COMMAND_SQL_BYTES_DIFFER"]);
const describeStartedAt=process.hrtime.bigint();
function describeStage(stage,describe){
 if(!describe||!describeStages.includes(stage))return;
 const elapsedMilliseconds=Number((process.hrtime.bigint()-describeStartedAt)/1000000n);
 try{process.stderr.write('T45_DESCRIBE_STAGE '+JSON.stringify({stage,elapsedMilliseconds})+'\n')}catch{/* Observations never replace a validation result. */}
}
function describeOwnData(error,key){
 if(error===null||(typeof error!=='object'&&typeof error!=='function')||types.isProxy(error))return undefined;
 try{const d=Object.getOwnPropertyDescriptor(error,key);return d&&Object.hasOwn(d,'value')?d.value:undefined}catch{return undefined}
}
function describeErrorType(error){
 try{
  for(let value=error,depth=0;value!==null&&(typeof value==='object'||typeof value==='function')&&depth<4;value=Object.getPrototypeOf(value),depth++){
   if(types.isProxy(value))return 'OTHER';
   const name=describeOwnData(value,'name');
   if(typeof name==='string')return describeErrorTypes.has(name)?name:'OTHER';
  }
 }catch{/* No arbitrary getters or error text are serialized. */}
 return 'OTHER';
}
function describePreflightFailure(error){
 const message=describeOwnData(error,'message'),code=describeOwnData(error,'code');
 const guard=typeof message==='string'?message.split(':',1)[0]:null;
 return {requestKey:REQUEST,state:'UNKNOWN',
  safeCode:describeSafeCodes.has(message)?message:'DB05_COMMAND_PREFLIGHT_REFUSED',
  connectionCleanup:'NOT_OPENED',automaticReplay:false,
  errorType:describeErrorType(error),
  systemCode:typeof code==='string'?(describeSystemCodes.has(code)?code:'OTHER'):null,
  guardCode:describeGuardCodes.has(guard)?guard:null};
}

const REQUEST='t45-r3-batched161-command-successor-20261116-01';
const START='t45-first-r3-native-service-start-20261116-33';
const OPERATOR='/var/lib/naijue-erp/fresh35-production/installed-real-operation-batched-root06-20261116-01/operation';
const SERVICE='/run/naijue-rewrite/current-production-service.json';
const INNER='/etc/naijue-erp/fresh35-batched161-command-successor-v1.json';
const SIGNATURE='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)';
const SQL='adapters/postgres/patches/0028_batched_history_hall_provenance.sql';
const REVIEWED_INPUT_SHA256='849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7';
const INSTALLED=Object.freeze({
 sourceSetSha256:'b7aa9fa8766d53d06ab9bd335d047fe9830cc95e8df31333e942193221ba7269',
 catalogSpecSha256:'4be30c87bfea605a313e48a5a94e158f8cb7bb90d6d78aa00e4a0d28dfd14b26',
 modelSha256:'6e0a0e039eead7714d4e2ec6c995678860dee16d35e7282245bc5748eb565e85',
});
const need=(value,code)=>{if(!value)throw Error('DB05_COMMAND_'+code)};
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const pin=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const load=leaf=>import(pathToFileURL(join(OPERATOR,'scripts/release/unified-install',leaf+'.mjs')));
const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');

async function protectedBytes(path,limit){
 need(await realpath(path)===path,'CANONICAL_FILE_REQUIRED');
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const a=await fd.stat({bigint:true});
  need(a.isFile()&&a.uid===0n&&a.nlink===1n&&(a.mode&0o022n)===0n&&a.size>0n&&a.size<=BigInt(limit),'PROTECTED_FILE_REQUIRED');
  const bytes=await fd.readFile();
  need(BigInt(bytes.length)===a.size&&identity(a)===identity(await fd.stat({bigint:true}))
   &&identity(a)===identity(await lstat(path,{bigint:true})),'FILE_CHANGED');
  return bytes;
 }finally{await fd.close()}
}

async function protectedJson(path,limit=65536){return JSON.parse(await protectedBytes(path,limit))}

async function readInput(){
 const chunks=[];let bytes=0;
 try{
  for await(const chunk of process.stdin){bytes+=chunk.length;need(bytes<=65536,'INPUT_BOUND');chunks.push(chunk)}
  const raw=Buffer.concat(chunks);
  try{return JSON.parse(raw)}finally{raw.fill(0)}
 }finally{chunks.forEach(chunk=>chunk.fill(0))}
}

function catalogPins(module,catalog){
 const {sourceSetSha256,catalogSpecSha256,modelSha256,routineCount}=module.describeFresh35CombinedCatalog(catalog);
 need(routineCount===161&&[sourceSetSha256,catalogSpecSha256,modelSha256].every(pin),'CATALOG_161_REQUIRED');
 return {sourceSetSha256,catalogSpecSha256,modelSha256};
}

async function compile(p,describe){
 need(pin(REVIEWED_INPUT_SHA256),'FINAL_REVIEW_REQUIRED');
 const sr=await protectedBytes(SERVICE,65536),c=JSON.parse(sr),s=p.service;
 const b=c.sharedPostgresNamespace.container;
 need(sha(sr)===s.proofSha256&&c.requestKey===s.serviceKey&&s.serviceKey===START
  &&c.physical.postmasterStart===s.postmasterStart&&b.id===s.containerId&&b.startedAt===s.containerStartedAt,'CURRENT_C_REQUIRED');
 describeStage('IMPORT_BEGIN',describe);
 const [sources,targets,catalogs,trust,publication]=await Promise.all([
  load('fresh35-combined-source-v1'),load('fresh35-combined-target-v1'),
  load('fresh35-combined-catalog-v1'),load('trusted-install-path'),load('publish-installation-record'),
 ]);
 describeStage('IMPORT_END',describe);
 describeStage('TRUST_BEGIN',describe);
 await trust.assertTrustedRootPath(process.execPath);await trust.assertTrustedRootTree(OPERATOR);
 describeStage('TRUST_END',describe);
 const raw=await protectedBytes(OPERATOR+'/scripts/release/unified-install/batched-import-v1/COMMAND-SUCCESSOR-PINS.json',65536);
 need(sha(raw)===REVIEWED_INPUT_SHA256,'REVIEWED_INPUT_BYTES_DIFFER');
 const review=JSON.parse(raw);
 need(review.format==='FRESH35_DB05_COMMAND_SUCCESSOR_PINS_V1'&&review.functionIdentity===SIGNATURE&&review.sqlPath===SQL
  &&[review.sqlSha256,review.before.bodySha256,review.before.definitionSha256,
      review.after.bodySha256,review.after.definitionSha256].every(pin)
  &&review.before.bodySha256!==review.after.bodySha256&&review.before.definitionSha256!==review.after.definitionSha256,
 'REVIEWED_SINGLE_FUNCTION_REQUIRED');
 const sql=await protectedBytes(OPERATOR+'/'+SQL,262144);
 need(sha(sql)===review.sqlSha256,'SQL_BYTES_DIFFER');
 const wrapped=/^--[^\n]*\nBEGIN;\n(DO \$install_hall\$[\s\S]+\nEND \$install_hall\$;)\nCOMMIT;\n$/.exec(sql.toString('utf8'));
 need(wrapped,'ONE_REVIEWED_DO_REQUIRED');
 if(describe){
  p.installStartsAt=Date.now();
  p.installExpiresAt=Math.min(p.installStartsAt+1200000,p.backupAdminValidUntil,c.sharedPostgresNamespace.serviceLeaseExpiresAt);
 }
 describeStage('SOURCE_LOAD_BEGIN',describe);
 const paths=await sources.resolveFresh35ReferenceInputPaths('/opt/naijue-erp/fresh35-combined-v1/reference-inputs');
 const source=await sources.loadFresh35CompactZeroSource(OPERATOR,paths);
 describeStage('SOURCE_LOAD_END',describe);
 describeStage('TARGET_BEGIN',describe);
 const target=await targets.loadFresh35Installed154UpgradeTargetV1({source,currentServiceSha256:s.proofSha256,
  startsAt:p.installStartsAt,expiresAt:p.installExpiresAt,backupAdminValidUntil:p.backupAdminValidUntil});
 const {metadataTarget,descriptor:t}=targets.fresh35Installed154UpgradeTargetData(target);
 describeStage('TARGET_END',describe);
 describeStage('COMPILE_BEGIN',describe);
 const base=await catalogs.buildFresh35CompactZeroCatalog(source,metadataTarget,paths);
 const before=await catalogs.buildFresh35BatchedCatalogV1(source,metadataTarget,base);
 const after=await catalogs.buildFresh35BatchedCommandSuccessorCatalogV1(source,metadataTarget,before);
 const predecessorBatchedCatalog=catalogPins(catalogs,before),batchedCatalog=catalogPins(catalogs,after);
 need(predecessorBatchedCatalog.modelSha256===INSTALLED.modelSha256
  &&batchedCatalog.modelSha256!==predecessorBatchedCatalog.modelSha256,'CATALOG_MODEL_LINEAGE_DIFFERS');
 const d={format:'FRESH35_BATCHED161_COMMAND_SUCCESSOR_PROGRAM_V1',requestKey:REQUEST,functionIdentity:SIGNATURE,
  reviewedInputSha256:REVIEWED_INPUT_SHA256,sqlSha256:review.sqlSha256,beforeRoutine:review.before,afterRoutine:review.after,
  installedBatchedCatalog:INSTALLED,predecessorBatchedCatalog,batchedCatalog,
  sourceSetSha256:sources.describeFresh35CombinedSource(source).sourceSetSha256,
  targetSha256:sha(JSON.stringify(t)),currentServiceSha256:s.proofSha256,postmasterStart:s.postmasterStart,
  startsAt:t.startsAt,expiresAt:t.expiresAt,backupAdminValidUntil:p.backupAdminValidUntil};
 d.programSha256=sha(JSON.stringify(d));
 describeStage('COMPILE_END',describe);
 let finalPreparationBinding;
 if(describe){
  const entry=await protectedBytes(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs',2048);
  need(entry.length===1075&&sha(entry)==='a36f2a10911f19682e488bd1432924f4616f8e7b5007691e4ac50caafe3a68f6','FINAL_ENTRY_DIFFERS');
  const api=await import(pathToFileURL(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs').href);
  const helper=await import(new URL('./final33-run.mjs',import.meta.url));
  const original=await protectedBytes('/etc/naijue-erp/fresh35-compact-zero-successor-v2.json',65536);
  need(sha(original)==='d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e','FINAL_ORIGINAL_TARGET_DIFFERS');
  need(p.finalIdentity&&Object.keys(p.finalIdentity).sort().join(',')==='admin,provision','FINAL_ORIGINAL_IDENTITY_REQUIRED');
  const publicTarget={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'7706545564479176741',database_oid:'16393',
   database_name:'erp_fresh35_20261110_r3',catalog_sha256:JSON.parse(original).successor.catalogSha256};
  const binding=helper.finalBatchBinding(publicTarget,p.finalIdentity.admin);
  const inputBinding=api.describeFinalR3InputBinding(publicTarget,p.finalIdentity.admin,p.finalIdentity.provision,binding);
  const options=helper.finalHostOptions(s,c);
  finalPreparationBinding=await api.describeFresh35FinalPreparationBinding(OPERATOR,options.referenceDirectory,
   options.currentService,options.parentPins,options.successorSha256,inputBinding,
   {requestKey:helper.PREPARE,batchPlanPath:'/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/'+helper.PREPARE+'/batched-plan.sqlite'});
 }
 const liveFacts={...(describe?{finalPreparationBinding}:{}),requestKey:REQUEST,service:s,physical:c.physical,currentServiceSha256:s.proofSha256,
  sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256,installedBatchedCatalog:INSTALLED,predecessorBatchedCatalog,batchedCatalog,
  successorCatalogSpecSha256:batchedCatalog.catalogSpecSha256,successorModelSha256:batchedCatalog.modelSha256,
  backupAdminValidUntil:d.backupAdminValidUntil,actualSharedServiceWorkDeadline:c.sharedPostgresNamespace.serviceLeaseExpiresAt-35000};
 return {descriptor:d,liveFacts,t,before,after,catalogs,targets,target,doSql:wrapped[1],publish:publication.publishInstallationRecord,
  payload:{service:s,backupAdminValidUntil:d.backupAdminValidUntil,installStartsAt:d.startsAt,installExpiresAt:d.expiresAt}};
}

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function ownerGuard(t,d,readOnly){
 return `DO $db05_command_owner$ BEGIN
 IF (current_database()=${quote(t.proposal.database)} AND current_user=${quote(t.proposal.owner)}
 AND session_user=${quote(t.proposal.admin)} AND current_setting('role')=${quote(t.proposal.owner)}
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${quote(t.physical.systemIdentifier)}
 AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${quote(t.physical.databaseOid)}
 AND current_setting('server_version_num')=${quote(t.physical.serverVersionNum)}
 AND pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${quote(t.physical.postmasterStart.replace(/\+00$/,''))}
 AND host(inet_server_addr())=${quote(t.proposal.host)} AND inet_server_port()=${t.proposal.port}
 AND current_setting('transaction_isolation')='read committed' AND current_setting('transaction_read_only')=${quote(readOnly?'on':'off')}
 AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery()
 AND extract(epoch FROM clock_timestamp())*1000>=${d.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${d.expiresAt}
 AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())=${quote(t.proposal.owner)}
 AND EXISTS(SELECT 1 FROM pg_roles WHERE oid=10 AND rolname=session_user AND rolcanlogin AND rolsuper
   AND rolvaliduntil>clock_timestamp() AND extract(epoch FROM rolvaliduntil)*1000=${d.backupAdminValidUntil})
 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolsuper
   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 AND (SELECT count(*) FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database()))=1
 AND NOT EXISTS(SELECT 1 FROM pg_prepared_xacts)) IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'DB05_COMMAND_CURRENT_OWNER_DIFFERS' USING ERRCODE='42501'; END IF;
 END $db05_command_owner$;`;
}

async function runUpdate(p,ready,outerPin){
 const {descriptor:d,t,targets,target,catalogs,before,after,publish,doSql}=ready;
 const outer=await protectedBytes(fileURLToPath(new URL('./catalog-update-authorization.json',import.meta.url)),131072);
 need(sha(outer)===outerPin&&equal(JSON.parse(outer),p.authority)&&equal(p.authority.upgradeDescriptor,d),'OUTER_BINDING_DIFFERS');
 const guard=await protectedBytes(INNER,65536),inner=JSON.parse(guard);
 need(sha(guard)===p.authority.innerAuthoritySha256&&inner.format==='FRESH35_COMBINED_EXECUTION_AUTHORIZATION_V1'
  &&inner.decision==='AUTHORIZE_EXACT_DB05_SIX_ARG_COMMAND_ONLY'
  &&['programSha256','sourceSetSha256','targetSha256','startsAt','expiresAt'].every(k=>inner[k]===d[k]),'INNER_BINDING_DIFFERS');
 const cfg=p.postgres;
 need(cfg?.host==='127.0.0.1'&&cfg.port===56791&&cfg.database===t.proposal.database
  &&cfg.user===t.proposal.admin&&cfg.ssl===false&&pin(cfg.password),'FINITE_ADMIN_REQUIRED');
 const {loadPgDriver}=await import('./catalog-pg-driver.mjs');
 const {Client}=await loadPgDriver();
 const client=new Client({host:cfg.host,port:cfg.port,database:cfg.database,user:cfg.user,password:()=>cfg.password,ssl:false,
  application_name:'t45-batched161-command-update',connectionTimeoutMillis:5000,statement_timeout:120000,query_timeout:125000,
  lock_timeout:5000,options:'-c search_path=pg_catalog'});
 const dir=join(t.proposal.workspaceDirectory,'batched161-command-'+d.programSha256);
 const leaf=dir.split('/').at(-1);
 const out={requestKey:REQUEST,service:p.service,programSha256:d.programSha256,state:'UNKNOWN',
  connectionCleanup:'NOT_OPENED',commitAcknowledged:false,commitOutcomeUnknown:false,postCommitReadback:false,
  roleRestoreAcknowledged:false,automaticReplay:false};
 let connected=false,wireError=false,roleSwitched=false,commitAttempted=false,rollbackConfirmed=false;
 client.on('error',()=>{wireError=true});
 const status=()=>typeof client.getTransactionStatus==='function'?client.getTransactionStatus():Object.getOwnPropertyDescriptor(client,'_txStatus')?.value;
 const send=async(sql,command,next)=>{
  const reply=await client.query(sql);
  need(!wireError&&!Array.isArray(reply)&&reply?.command===command&&status()===next,'NATIVE_ACK_REQUIRED');return reply;
 };
 const current=async()=>{
  await targets.assertFresh35Installed154UpgradeTargetCurrent(target);
  need(sha(await protectedBytes(INNER,65536))===p.authority.innerAuthoritySha256,'INNER_AUTHORITY_CHANGED');
 };
 const observe=async(catalog,routine)=>{
  const statements=catalogs.fresh35Installed154UpgradeCatalogObservation(catalog,target);
  await send(statements.guardSql,'DO','T');
  const response=await send(statements.observationSql,'SELECT','T');
  need(response.rows?.length===1&&typeof response.rows[0].catalog_json==='string','CATALOG_PACKET_REQUIRED');
  const raw=response.rows[0].catalog_json;
  const observed=statements.validate(raw);
  const result=await send(`SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body,
    encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') AS definition,
    encode(sha256(convert_to((to_jsonb(p)-'prosrc')::text,'UTF8')),'hex') AS attributes
    FROM pg_catalog.pg_proc p WHERE oid=${quote(SIGNATURE)}::regprocedure`,'SELECT','T');
  need(result.rows?.length===1&&result.rows[0].body===routine.bodySha256
   &&result.rows[0].definition===routine.definitionSha256&&pin(result.rows[0].attributes),'EXACT_ROUTINE_DIFFERS');
  return {raw,catalogSha256:observed.catalogSha256,routineAttributesSha256:result.rows[0].attributes};
 };
 try{
  await current();await mkdir(dir,{mode:0o700});out.captureDirectoryLeaf=leaf;
  await publish(join(dir,'attempt.json'),JSON.stringify({requestKey:REQUEST,programSha256:d.programSha256,
   service:p.service,innerAuthoritySha256:p.authority.innerAuthoritySha256})+'\n');
  await client.connect();connected=true;out.connectionCleanup='UNKNOWN';
  const id=await send("SELECT session_user::text AS session_user,current_user::text AS current_user,current_setting('role') AS role",'SELECT','I');
  need(id.rows?.length===1&&id.rows[0].session_user===cfg.user&&id.rows[0].current_user===cfg.user&&id.rows[0].role==='none','ACTUAL_LOGIN_DIFFERS');
  await send('SET ROLE "'+t.proposal.owner+'"','SET','I');roleSwitched=true;
  await send('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN','T');
  await send(ownerGuard(t,d,false),'DO','T');
  const pre=await observe(before,d.beforeRoutine);await current();
  await publish(join(dir,'catalog-before.json'),pre.raw+'\n');
  await send(doSql,'DO','T');
  const inTx=await observe(after,d.afterRoutine);
  need(inTx.routineAttributesSha256===pre.routineAttributesSha256,'FUNCTION_ACL_OR_ATTRIBUTES_CHANGED');
  await current();commitAttempted=true;
  await send('COMMIT','COMMIT','I');out.commitAcknowledged=true;
  await publish(join(dir,'commit.json'),JSON.stringify({requestKey:REQUEST,programSha256:d.programSha256,commitAcknowledged:true})+'\n');
  await send('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN','T');
  await send(ownerGuard(t,d,true),'DO','T');
  const post=await observe(after,d.afterRoutine);
  need(post.routineAttributesSha256===pre.routineAttributesSha256,'READBACK_ACL_OR_ATTRIBUTES_CHANGED');
  await send('ROLLBACK','ROLLBACK','I');out.postCommitReadback=true;
  await current();await send('RESET ROLE','RESET','I');out.roleRestoreAcknowledged=true;roleSwitched=false;
  await publish(join(dir,'catalog-after.json'),post.raw+'\n');
  const completion=JSON.stringify({requestKey:REQUEST,service:p.service,programSha256:d.programSha256,
   reviewedInputSha256:d.reviewedInputSha256,sqlSha256:d.sqlSha256,
   commitAcknowledged:true,postCommitReadback:true,beforeCatalogSha256:pre.catalogSha256,catalogSha256:post.catalogSha256,
   routineAttributesSha256:post.routineAttributesSha256,beforeRoutine:d.beforeRoutine,afterRoutine:d.afterRoutine,
   roleRestoreAcknowledged:true,batchedCatalog:d.batchedCatalog,businessImported:false})+'\n';
  await publish(join(dir,'completion.json'),completion);
  Object.assign(out,{state:'DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK',completionSha256:sha(completion),
   beforeCatalogSha256:pre.catalogSha256,catalogSha256:post.catalogSha256,
   routineAttributesSha256:post.routineAttributesSha256,batchedCatalog:d.batchedCatalog});
 }catch(error){
  out.commitOutcomeUnknown=commitAttempted&&!out.commitAcknowledged;
  if(connected&&['T','E'].includes(status()))try{await send('ROLLBACK','ROLLBACK','I');rollbackConfirmed=true}catch{}
  if(roleSwitched&&status()==='I')try{await send('RESET ROLE','RESET','I');out.roleRestoreAcknowledged=true}catch{}
  out.state=out.commitOutcomeUnknown?'COMMIT_OUTCOME_UNKNOWN':out.commitAcknowledged?'COMMIT_ACK_READBACK_INCOMPLETE':'STOPPED_BEFORE_COMMIT';
  out.rollbackAcknowledged=rollbackConfirmed;
  out.sqlstate=/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:null;
  out.safeCode=/^DB05_COMMAND_[A-Z0-9_]{1,120}$/.test(error?.message??'')?error.message:'DB05_COMMAND_NATIVE_UNCONFIRMED';
 }finally{
  let timer;
  try{await Promise.race([client.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CLOSE_TIMEOUT')),5000)})]);out.connectionCleanup='CLOSED'}
  catch{client.connection?.stream?.destroy();out.connectionCleanup='CLOSE_UNCONFIRMED'}
  finally{clearTimeout(timer);cfg.password=null}
 }
 return out;
}

async function main(){
 need(process.platform==='linux'&&process.version==='v24.21.0'&&process.getuid()===0&&process.geteuid()===0
  &&process.getgid()===0&&process.getegid()===0&&fstatSync(0).isFIFO()&&process.argv.length===3
  &&process.execArgv.join(',')==='--no-global-search-paths','FIXED_ROOT_PROCESS_REQUIRED');
 need(!Object.keys(process.env).some(k=>/^PG/.test(k)||['DATABASE_URL','NODE_PATH','NODE_OPTIONS'].includes(k)
  ||k.startsWith('LD_')||k.startsWith('DYLD_')),'AMBIENT_CONFIG_REFUSED');
 const mode=process.argv[2];need(mode==='describe'||pin(mode),'FIXED_ENTRY_REQUIRED');
 const p=await readInput(),ready=await compile(p,mode==='describe');
 if(mode==='describe')return {state:'PROGRAM_DESCRIBED_NO_PG_OR_WRITE',descriptor:ready.descriptor,
  liveFacts:ready.liveFacts,payload:ready.payload,databaseConnections:0,mutations:0};
 return runUpdate(p,ready,mode);
}

try{
 const result=await main();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.state==='PROGRAM_DESCRIBED_NO_PG_OR_WRITE'
  ||result.state==='DB05_COMMAND_SUCCESSOR_APPLIED_AND_READ_BACK'&&result.connectionCleanup==='CLOSED'?0:2;
}catch(error){
 process.stdout.write(JSON.stringify(describePreflightFailure(error))+'\n');
 process.exitCode=2;
}
