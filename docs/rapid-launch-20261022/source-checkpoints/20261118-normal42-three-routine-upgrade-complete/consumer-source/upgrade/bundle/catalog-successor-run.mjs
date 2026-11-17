/** Describe or apply exactly one reviewed DB05 routine successor. */
import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {lstat,mkdir,open,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual as equal} from 'node:util';

const REQUEST='t45-r3-settlement24-three-routine-upgrade42-20261117-01'; // Main must bind one actual upgrade job; never an old writer key.
const START='t45-first-r3-native-service-start-20261117-42'; // Actual future maintenance service, not a reconstructed C.
const OPERATOR='/var/lib/naijue-erp/fresh35-production/installed-real-operation-batched-root08-20261117-01/operation';
const SERVICE='/run/naijue-rewrite/current-production-service.json';
const INNER='/etc/naijue-erp/fresh35-settlement24-three-routine-42-v1.json'; // Bound only with actual reviewed finite maintenance authority.
const SIGNATURES=Object.freeze(['naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4,jsonb)','naijue_erp.assert_document_migration(uuid)','naijue_erp.standard_whole_package_verify_v2(jsonb,text)']);
const SQL='adapters/postgres/patches/settlement24-current-wire-successor.sql';
const REVIEWED_INPUT_SHA256='faaa57ae44e67f9d70f43913db121aadc1ed98d64e9a6049f65244a2bf543c19';
const INSTALLED=Object.freeze({
 sourceSetSha256:'cf27add8653a4aa85b8cb10d609e2b85b1c4e55cf02f7fd2f5bf9e60ecb5ce9c',
 catalogSpecSha256:'9f4595dfd24f8c22d95d36725eefb38cda0ac2bd31707e88f9f45b6a723f8c29',
 modelSha256:'626c560485431d38db4b83e1247475af2996a41e980bd7d1db3de9aa91116811',
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
 need(typeof REQUEST==='string'&&typeof START==='string'&&typeof INNER==='string','ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED');
 need(pin(REVIEWED_INPUT_SHA256),'FINAL_REVIEW_REQUIRED');
 const sr=await protectedBytes(SERVICE,65536),c=JSON.parse(sr),s=p.service;
 const b=c.sharedPostgresNamespace.container;
 need(sha(sr)===s.proofSha256&&c.requestKey===s.serviceKey&&s.serviceKey===START
  &&c.physical.postmasterStart===s.postmasterStart&&b.id===s.containerId&&b.startedAt===s.containerStartedAt,'CURRENT_C_REQUIRED');
 const [sources,targets,catalogs,trust,publication]=await Promise.all([
  load('fresh35-combined-source-v1'),load('fresh35-combined-target-v1'),
  load('fresh35-combined-catalog-v1'),load('trusted-install-path'),load('publish-installation-record'),
 ]);
 await trust.assertTrustedRootPath(process.execPath);await trust.assertTrustedRootTree(OPERATOR);
 const raw=await protectedBytes(OPERATOR+'/scripts/release/unified-install/batched-import-v1/SETTLEMENT24-CURRENT-WIRE-PINS.json',65536);
 need(sha(raw)===REVIEWED_INPUT_SHA256,'REVIEWED_INPUT_BYTES_DIFFER');
 const review=JSON.parse(raw);
 need(review.format==='FRESH35_SETTLEMENT24_CURRENT_WIRE_SUCCESSOR_PINS_V1'&&review.sqlPath===SQL
  &&review.sqlSha256==='daf378435cdc532e5e49649cf8a344fc4cf92e0c48f0d9da358d9a1b42108184'
  &&review.changes.length===3&&review.changes.every((r,i)=>r.signature===SIGNATURES[i]
   &&[r.beforeBodySha256,r.beforeDefinitionSha256,r.afterBodySha256,r.afterDefinitionSha256].every(pin)),
 'REVIEWED_EXACT_THREE_FUNCTIONS_REQUIRED');
 const sql=await protectedBytes(OPERATOR+'/'+SQL,262144);
 need(sha(sql)===review.sqlSha256,'SQL_BYTES_DIFFER');
 const wrapped=/^--[^\n]*\n--[^\n]*\nBEGIN ISOLATION LEVEL READ COMMITTED;\n(SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;)\n(SET LOCAL quote_all_identifiers=off;)\n(DO \$settlement24_current_wire\$[\s\S]+\nEND \$settlement24_current_wire\$;)\nCOMMIT;\n$/.exec(sql.toString('utf8'));
 need(wrapped,'EXACT_REVIEWED_TRANSACTION_SOURCE_REQUIRED');
 if(describe){
  p.installStartsAt=Date.now();
  p.installExpiresAt=Math.min(p.installStartsAt+1200000,p.backupAdminValidUntil,c.sharedPostgresNamespace.serviceLeaseExpiresAt);
 }
 const paths=await sources.resolveFresh35ReferenceInputPaths('/opt/naijue-erp/fresh35-combined-v1/reference-inputs');
 const source=await sources.loadFresh35CompactZeroSource(OPERATOR,paths);
 const target=await targets.loadFresh35Installed154UpgradeTargetV1({source,currentServiceSha256:s.proofSha256,
  startsAt:p.installStartsAt,expiresAt:p.installExpiresAt,backupAdminValidUntil:p.backupAdminValidUntil});
 const {metadataTarget,descriptor:t}=targets.fresh35Installed154UpgradeTargetData(target);
 const base=await catalogs.buildFresh35CompactZeroCatalog(source,metadataTarget,paths);
 const batched=await catalogs.buildFresh35BatchedCatalogV1(source,metadataTarget,base);
 const before=await catalogs.buildFresh35BatchedCommandSuccessorCatalogV1(source,metadataTarget,batched);
 const after=await catalogs.buildFresh35Settlement24CurrentWireCatalogV1(source,metadataTarget,before);
 const predecessorBatchedCatalog=catalogPins(catalogs,before),batchedCatalog=catalogPins(catalogs,after);
 need(predecessorBatchedCatalog.modelSha256===INSTALLED.modelSha256
  &&batchedCatalog.modelSha256==='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9','CATALOG_MODEL_LINEAGE_DIFFERS');
 const d={format:'FRESH35_SETTLEMENT24_THREE_ROUTINE_SUCCESSOR_PROGRAM_V1',requestKey:REQUEST,functionIdentities:SIGNATURES,
  reviewedInputSha256:REVIEWED_INPUT_SHA256,sqlSha256:review.sqlSha256,routinePins:review.changes,
  installedBatchedCatalog:INSTALLED,predecessorBatchedCatalog,batchedCatalog,
  sourceSetSha256:sources.describeFresh35CombinedSource(source).sourceSetSha256,
  targetSha256:sha(JSON.stringify(t)),currentServiceSha256:s.proofSha256,postmasterStart:s.postmasterStart,
  startsAt:t.startsAt,expiresAt:t.expiresAt,backupAdminValidUntil:p.backupAdminValidUntil};
 d.programSha256=sha(JSON.stringify(d));
 const liveFacts={requestKey:REQUEST,service:s,physical:c.physical,currentServiceSha256:s.proofSha256,
  sourceSetSha256:d.sourceSetSha256,targetSha256:d.targetSha256,installedBatchedCatalog:INSTALLED,predecessorBatchedCatalog,batchedCatalog,
  successorCatalogSpecSha256:batchedCatalog.catalogSpecSha256,successorModelSha256:batchedCatalog.modelSha256,
  backupAdminValidUntil:d.backupAdminValidUntil,actualSharedServiceWorkDeadline:c.sharedPostgresNamespace.serviceLeaseExpiresAt-35000};
 return {descriptor:d,liveFacts,t,before,after,catalogs,targets,target,doSql:wrapped[3],settings:wrapped.slice(1,3),publish:publication.publishInstallationRecord,
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
 const {descriptor:d,t,targets,target,catalogs,before,after,publish,doSql,settings}=ready;
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
  application_name:'t45-settlement24-three-routine-update',connectionTimeoutMillis:5000,statement_timeout:120000,query_timeout:125000,
  lock_timeout:5000,options:'-c search_path=pg_catalog'});
 const dir=join(t.proposal.workspaceDirectory,'settlement24-three-routine-'+d.programSha256);
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
 const observe=async(catalog,phase)=>{
  const statements=catalogs.fresh35Installed154UpgradeCatalogObservation(catalog,target);
  await send(statements.guardSql,'DO','T');
  const response=await send(statements.observationSql,'SELECT','T');
  need(response.rows?.length===1&&typeof response.rows[0].catalog_json==='string','CATALOG_PACKET_REQUIRED');
  const raw=response.rows[0].catalog_json,observed=statements.validate(raw),attributes={};
  for(const routine of d.routinePins){
   const result=await send(`SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body,
    encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') AS definition,
    encode(sha256(convert_to((to_jsonb(p)-'prosrc')::text,'UTF8')),'hex') AS attributes
    FROM pg_catalog.pg_proc p WHERE oid=${quote(routine.signature)}::regprocedure`,'SELECT','T');
   need(result.rows?.length===1&&result.rows[0].body===routine[phase+'BodySha256']
    &&result.rows[0].definition===routine[phase+'DefinitionSha256']&&pin(result.rows[0].attributes),'EXACT_ROUTINE_DIFFERS');
   attributes[routine.signature]=result.rows[0].attributes;
  }
  return {raw,catalogSha256:observed.catalogSha256,routineAttributesSha256:sha(JSON.stringify(attributes))};
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
  for(const sql of settings)await send(sql,'SET','T');
  await send(ownerGuard(t,d,false),'DO','T');
  const pre=await observe(before,'before');await current();
  await publish(join(dir,'catalog-before.json'),pre.raw+'\n');
  await send(doSql,'DO','T');
  const inTx=await observe(after,'after');
  need(inTx.routineAttributesSha256===pre.routineAttributesSha256,'FUNCTION_ACL_OR_ATTRIBUTES_CHANGED');
  await current();commitAttempted=true;
  await send('COMMIT','COMMIT','I');out.commitAcknowledged=true;
  await publish(join(dir,'commit.json'),JSON.stringify({requestKey:REQUEST,programSha256:d.programSha256,commitAcknowledged:true})+'\n');
  await send('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY','BEGIN','T');
  for(const sql of settings)await send(sql,'SET','T');
  await send(ownerGuard(t,d,true),'DO','T');
  const post=await observe(after,'after');
  need(post.routineAttributesSha256===pre.routineAttributesSha256,'READBACK_ACL_OR_ATTRIBUTES_CHANGED');
  await send('ROLLBACK','ROLLBACK','I');out.postCommitReadback=true;
  await current();await send('RESET ROLE','RESET','I');out.roleRestoreAcknowledged=true;roleSwitched=false;
  await publish(join(dir,'catalog-after.json'),post.raw+'\n');
  const completion=JSON.stringify({requestKey:REQUEST,service:p.service,programSha256:d.programSha256,
   reviewedInputSha256:d.reviewedInputSha256,sqlSha256:d.sqlSha256,
   commitAcknowledged:true,postCommitReadback:true,beforeCatalogSha256:pre.catalogSha256,catalogSha256:post.catalogSha256,
   routineAttributesSha256:post.routineAttributesSha256,routinePins:d.routinePins,
   roleRestoreAcknowledged:true,batchedCatalog:d.batchedCatalog,businessImported:false})+'\n';
  await publish(join(dir,'completion.json'),completion);
  Object.assign(out,{state:'SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK',completionSha256:sha(completion),
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
 need(typeof REQUEST==='string'&&typeof START==='string'&&typeof INNER==='string','ACTUAL_RUNTIME_BINDINGS_STILL_UNISSUED');
 const p=await readInput(),ready=await compile(p,mode==='describe');
 if(mode==='describe')return {state:'PROGRAM_DESCRIBED_NO_PG_OR_WRITE',descriptor:ready.descriptor,
  liveFacts:ready.liveFacts,payload:ready.payload,databaseConnections:0,mutations:0};
 return runUpdate(p,ready,mode);
}

try{
 const result=await main();
 process.stdout.write(JSON.stringify(result)+'\n');
 process.exitCode=result.state==='PROGRAM_DESCRIBED_NO_PG_OR_WRITE'
  ||result.state==='SETTLEMENT24_THREE_ROUTINES_APPLIED_AND_READ_BACK'&&result.connectionCleanup==='CLOSED'?0:2;
}catch(error){
 process.stdout.write(JSON.stringify({requestKey:REQUEST,state:'UNKNOWN',
  safeCode:/^DB05_COMMAND_[A-Z0-9_]{1,120}$/.test(error?.message??'')?error.message:'DB05_COMMAND_PREFLIGHT_REFUSED',
  connectionCleanup:'NOT_OPENED',automaticReplay:false})+'\n');
 process.exitCode=2;
}
