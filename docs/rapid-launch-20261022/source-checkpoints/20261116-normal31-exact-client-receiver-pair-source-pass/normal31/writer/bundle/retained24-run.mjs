import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const mount=dirname(fileURLToPath(import.meta.url));
const WRITER='t45-r3-batched-real-execute-20261115-01';
const READER='t45-first-20261110-r3-real-readback-20261114-22-04';
const KEY=mount.split('/').at(-1);
const writing=KEY===WRITER;
const INITIALIZER_BYTES=51225175;
const START='t45-first-r3-native-service-start-20261116-31';
const STATE='/var/lib/naijue-erp/fresh35-production';
const WORK=STATE+'/retained31-private/'+KEY;
const OPERATOR=STATE+'/installed-real-operation-batched-root04-20261116-01/operation';
const REAL=STATE+'/real-first-20261110-r3';
const REPORT=REAL+'/reports/t45-first-20261110-r3-real-prepare-20261114-09/runtime/stream';
const BATCH_PLAN=REAL+'/reports/t45-r3-batched-real-persist-20261115-01/batched-plan.sqlite';
const worker=61035;
const ROLE='erp35_controller_20261110_r3';
const SOURCE=STATE+'/installed-real-operation-51724553-20261114-01/operation';
const linuxDeps=SOURCE+'/node_modules';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function catalogFailureReceipt(error) {
 const failure=error?.catalogFailure;
 const phases=['BEGIN','GUARDS','OBSERVATION','VALIDATION','CATALOG_ROLLBACK'];
 const sqlstate=value=>typeof value==='string'&&/^[0-9A-Z]{5}$/.test(value);
 if(!failure||!phases.includes(failure.phase)
  ||!(failure.staticCode===null||typeof failure.staticCode==='string'&&/^[A-Z][A-Z0-9_]{0,120}$/.test(failure.staticCode))
  ||!(failure.sqlstate===null||sqlstate(failure.sqlstate))
  ||!(failure.rollbackSqlstate===null||sqlstate(failure.rollbackSqlstate))
  ||typeof failure.rollbackAttempted!=='boolean'||typeof failure.rollbackAcknowledged!=='boolean'
  ||(failure.rollbackAcknowledged&&!failure.rollbackAttempted)
  ||!['CLOSED','CLOSE_FAILED'].includes(failure.connectionCleanup))return null;
 return {phase:failure.phase,staticCode:failure.staticCode,sqlstate:failure.sqlstate,
  rollbackAttempted:failure.rollbackAttempted,rollbackAcknowledged:failure.rollbackAcknowledged,
  rollbackSqlstate:failure.rollbackSqlstate,connectionCleanup:failure.connectionCleanup};
}
const APPROVALS=[
 ['readHistoricalSettlementRetentionCliApproval','historicalSettlementRetentionApproval','historical-settlement-retention.UNTRUSTED.DRAFT.private.json','4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b'],
 ['readHistoricalLineAmountCliEvidence','historicalLineAmountEvidence','historical-line-amount-evidence.candidate.json','29c3d14cff036804e4a6ad1d703b4b0b876909d8c84d3aecfa37d2c971d6a7f1'],
 ['readHistoricalHallCliApproval','historicalSalesHallApproval','historical-hall-approval.UNTRUSTED.DRAFT.private.json','01ace8243247ed1053a7a5df0eb0925ff2fe828a86d1bbbfb67c11219fa8e900'],
 ['readCurrentEffectiveAlignmentCliEvidence','currentEffectiveAlignmentEvidence','current-effective-alignment.UNTRUSTED.DRAFT.json','98c88621471a17d605c1556b5c434f2d52179bfb97c911eabfb3c91039d0c8ad'],
 ['readExplicitZeroCliApproval','explicitZeroApproval','zero-approval-candidate.private.jsonl','caec2056f53910f8e574d16e151974681da437bbf36773365bee52f77467d151'],
 ['readStaffHallCliApproval','historicalStaffHallApproval','staff-null-hall-approval.candidate.private.json','4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40'],
];
async function protectedBytes(path, expected, maximum, exactBytes, ordinaryPrivate = false, linuxInode) {
  need(await realpath(path) === path,'READBACK_PROTECTED_PATH_REQUIRED');
  for (let directory = dirname(path);; directory = dirname(directory)) {
    const s = await lstat(directory);
    const inLinuxDeps = linuxInode !== undefined &&
      (directory === linuxDeps || directory.startsWith(linuxDeps+'/'));
    need(s.isDirectory() && s.uid === (inLinuxDeps ? 1000 : 0) && !(s.mode & 0o022) &&
      (directory !== linuxDeps || (s.dev === 66304 && s.ino === 13504771 &&
        s.gid === 1000 && (s.mode & 0o777) === 0o755)),
      'READBACK_PROTECTED_PATH_REQUIRED');
    if (directory === '/') break;
  }
  const file = await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const first = await file.stat({bigint:true});
    need(first.isFile() && first.uid === (linuxInode === undefined ? 0n : 1000n) &&
      first.nlink === 1n && !(first.mode & 0o022n) &&
      (linuxInode === undefined || (first.dev === 66304n && first.ino === linuxInode &&
        first.gid === 1000n && (first.mode & 0o777n) === 0o644n)) &&
      (!ordinaryPrivate || (first.gid === BigInt(worker) && (first.mode & 0o777n) === 0o440n)) &&
      first.size > 0n && first.size <= BigInt(maximum) &&
      (exactBytes === undefined || first.size === BigInt(exactBytes)), 'READBACK_PROTECTED_FILE_REQUIRED');
    const buffer = Buffer.alloc(Number(first.size)+1);
    let used = 0;
    while (used < buffer.length) {
      const {bytesRead} = await file.read(buffer,used,buffer.length-used,null);
      if (!bytesRead) break;
      used += bytesRead;
    }
    const identity = s => [s.dev,s.ino,s.uid,s.gid,s.nlink,s.mode,s.size,s.mtimeNs,s.ctimeNs].join(':');
    const raw = buffer.subarray(0,used);
    need(BigInt(used) === first.size && identity(first) === identity(await file.stat({bigint:true})) &&
      identity(first) === identity(await lstat(path,{bigint:true})) && sha(raw) === expected,
      'READBACK_PROTECTED_BYTES_DIFFER');
    return raw;
  } finally {
    await file.close();
  }
}


async function retainedReportSummary(expected){
 const path=REPORT+'/summary.json';
 need(digest(expected)&&await realpath(path)===path,'ORIGINAL_INSPECT_RETAINED_REPORT_PATH_REQUIRED');
 for(let d=dirname(path);;d=dirname(d)){
  const s=await lstat(d),within=d===REAL+'/reports'||d.startsWith(REAL+'/reports/');
  need(s.isDirectory()&&!(s.mode&0o022)&&(s.uid===0||within&&s.uid===worker),
   'ORIGINAL_INSPECT_RETAINED_REPORT_DIRECTORY_DIFFERS');
  if(d==='/')break;
 }
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await fd.stat({bigint:true}),id=x=>[x.dev,x.ino,x.uid,x.gid,x.mode,x.nlink,x.size,x.mtimeNs,x.ctimeNs].join(':');
  need(before.isFile()&&[0n,BigInt(worker)].includes(before.uid)&&before.nlink===1n
    &&!(before.mode&0o022n)&&before.size>0n&&before.size<=67108864n,'ORIGINAL_INSPECT_RETAINED_SUMMARY_METADATA_DIFFERS');
  const raw=await fd.readFile();
  need(BigInt(raw.length)===before.size&&sha(raw)===expected&&id(before)===id(await fd.stat({bigint:true}))
    &&id(before)===id(await lstat(path,{bigint:true})),'ORIGINAL_INSPECT_RETAINED_SUMMARY_CHANGED');
  return raw;
 }finally{await fd.close();}
}
async function privateInput(){
 const chunks=[];let n=0;
 try{
  for await(const b of process.stdin){n+=b.length;need(n<=65536,'RETAINED20_PRIVATE_INPUT_BOUND');chunks.push(b);}
  const raw=Buffer.concat(chunks);
  try{
   const p=JSON.parse(raw.toString('utf8'));
   need(p&&p.postgres?.user===ROLE&&p.postgres.host==='127.0.0.1'&&p.postgres.port===56791
    &&p.postgres.database==='erp_fresh35_20261110_r3'&&p.postgres.ssl===false&&digest(p.postgres.password),
    'RETAINED20_PRIVATE_TARGET_REQUIRED');
   return p;
  }finally{raw.fill(0)}
 }finally{chunks.forEach(b=>b.fill(0))}
}
export function readbackExclusive(raw,expiresAt,evidence){
 const sequence=['BEGIN ISOLATION LEVEL READ COMMITTED',
  'SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2',
  'SELECT naijue_erp.standard_whole_package_verify_v2($1::jsonb,$2::text)::text AS result_json','ROLLBACK'];
 let stage=0,busy=false,poisoned=false,discarded=false;
 return Object.freeze({
  async query(sql,values){
   const rollback=sql==='ROLLBACK'&&stage>0&&stage<4&&!discarded;
   need(!busy&&!discarded&&(rollback||(!poisoned&&Date.now()<expiresAt&&sql===sequence[stage])),
    'RETAINED20_READBACK_SQL_OR_ORDER_REFUSED');
   need(sql===sequence[2]?Array.isArray(values)&&values.length===2:values===undefined,
    'RETAINED20_READBACK_PARAMETERS_REFUSED');
   busy=true;
   try{
    need(raw.readyForQuery===true&&(rollback||raw.getTransactionStatus()===(stage===0?'I':'T')),
     'RETAINED20_READBACK_WIRE_NOT_READY');
    const r=await raw.query(sql,values),command=sql===sequence[0]?'BEGIN':sql===sequence[1]?'SET':sql==='ROLLBACK'?'ROLLBACK':'SELECT';
    need(r?.command===command&&raw.readyForQuery===true
     &&raw.getTransactionStatus()===(sql==='ROLLBACK'?'I':'T'),'RETAINED20_READBACK_ACK_UNCERTAIN');
    evidence.sql.push({stage:command,sqlstate:null});
    if(command==='ROLLBACK'){evidence.rollbackAcknowledged=true;stage=4}else stage++;
    return r;
   }catch(error){poisoned=true;evidence.sql.push({stage:'SQL_ERROR',sqlstate:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:null});throw error;}
   finally{busy=false}
  },
  async discard(){discarded=true;await closeClient(raw,evidence);}
 });
}
async function closeClient(c,e){
 let timer;
 try{await Promise.race([c.end(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RETAINED20_CLOSE_TIMEOUT')),4000)})]);e.connectionCleanup='CLOSED';}
 catch{c.connection?.stream?.destroy();e.connectionCleanup='CLOSE_UNCONFIRMED';}
 finally{clearTimeout(timer)}
}
async function retainInitializer(initialize){
 const raw=Buffer.from(JSON.stringify(initialize)+'\n');
 need(raw.length===INITIALIZER_BYTES,'RETAINED22_EXACT_INITIALIZER_BYTES_REQUIRED');
 const fd=await open(WORK+'/owned-private/original-initializer.json',constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(raw);await fd.sync()}finally{await fd.close();raw.fill(0)}
}
const PHYSICAL=`SELECT (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS sid,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS oid,
 current_database() AS database,current_user AS actor,session_user AS session_actor,
 host(inet_server_addr()) AS address,inet_server_port() AS port,pg_backend_pid() AS pid,
 pg_postmaster_start_time()::text AS epoch,current_setting('server_version_num') AS version,
 current_setting('transaction_read_only') AS readonly,current_setting('row_security') AS row_security,
 current_setting('role') AS active_role,current_setting('session_replication_role') AS replication_role,
 pg_is_in_recovery() AS recovery,r.rolvaliduntil::text AS validuntil,
 (NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole
 AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolcanlogin AND r.rolconnlimit=2) AS boundary,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(parent.rolname,m.admin_option,m.inherit_option,m.set_option)
 ORDER BY parent.rolname),'[]'::jsonb) FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE m.member=r.oid) AS memberships
 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`;
export function exactReaderPhysical(v,a){
 need(v&&v.sid==='7706545564479176741'&&v.oid==='16393'&&v.database==='erp_fresh35_20261110_r3'
  &&v.actor===ROLE&&v.session_actor===ROLE&&v.address==='127.0.0.1'&&v.port===56791
  &&v.version==='170011'&&v.epoch===a.service.postmasterStart&&v.readonly==='off'
  &&v.row_security==='on'&&v.active_role==='none'&&v.replication_role==='origin'
  &&v.recovery===false&&v.boundary===true&&Date.parse(v.validuntil)>=a.expiresAt
  &&same(v.memberships,[['erp_unified27_importer_2393dbc6db9581c2',false,false,true],
    ['erp_unified27_initializer_2393dbc6db9581c2',false,false,true]]),'RETAINED20_READER_PHYSICAL_OR_ROLE_DIFFERS');
}
async function main(){
 need(process.platform==='linux'&&process.version==='v24.21.0'&&process.getuid()===worker
  &&process.geteuid()===worker&&process.getgid()===worker&&process.getegid()===worker
  &&process.getgroups().every(x=>x===worker)&&process.execArgv.length===1
  &&process.execArgv[0]==='--no-global-search-paths'&&process.argv.length===3&&digest(process.argv[2])
  &&KEY===WRITER&&fstatSync(0).isFIFO()&&mount===WORK,'RETAINED20_FIXED_PROCESS_REQUIRED');
 need(!Object.keys(process.env).some(k=>k.startsWith('PG')||k==='DATABASE_URL'||k==='NODE_PATH'
  ||k==='NODE_OPTIONS'||k.startsWith('LD_')||k.startsWith('DYLD_')),'RETAINED20_ENV_REFUSED');
 need(process.env.TMPDIR===WORK+'/scratch'&&process.env.SQLITE_TMPDIR===WORK+'/scratch','RETAINED20_SCRATCH_REQUIRED');
 const a=JSON.parse(await protectedBytes(WORK+'/writer-authorization.json',process.argv[2],131072,undefined,true));
 need(a.requestKey===KEY&&a.phase===(writing?'WRITER':'READBACK')&&a.startsAt<=Date.now()
  &&Date.now()+30000<a.expiresAt,'RETAINED20_FINITE_AUTHORITY_REQUIRED');
 const proof=JSON.parse(await protectedBytes('/run/naijue-rewrite/current-production-service.json',a.service.proofSha256,65536));
 need(proof.requestKey===START&&proof.physical.postmasterStart===a.service.postmasterStart
  &&proof.sharedPostgresNamespace.container.id===a.service.containerId
  &&a.expiresAt<=proof.sharedPostgresNamespace.serviceLeaseExpiresAt,'RETAINED20_SERVICE_DIFFERS');
 need(digest(a.operatorReadySha256),'BATCHED24_MATERIALIZATION_REFERENCE_REQUIRED');
 const material=JSON.parse(await protectedBytes(STATE+'/installed-real-operation-batched-root04-20261116-01/source-materialization.json',a.operatorReadySha256,262144));
 need(material.state==='EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'
  &&material.sourceRoot==='/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root04-20261116-01/operation'
  &&material.nodeModulesChanged===false&&material.databaseWrites===0,'BATCHED24_MATERIALIZATION_DIFFERS');
 await protectedBytes(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs','6c3ec2b2f60746298d1b42e2c1e3e1da8257b9107945acd0dcf7388e406a83a3',1024,695);
 const api=await import(pathToFileURL(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs').href);
 const p=await privateInput();let client,options;
 const evidence={requestKey:KEY,service:a.service,inputSha256:process.argv[2],state:'UNKNOWN',
  connectionCleanup:'NOT_OPENED',automaticReplay:false,sql:[],phase:a.phase,rollbackAcknowledged:false};
 try{
  if(writing){
   const manifestBytes=await protectedBytes(REAL+'/package/manifest.json','f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb',2097152);
   const manifest=JSON.parse(manifestBytes),summary=JSON.parse(await retainedReportSummary('2f688ba6a10d4fe3902ba2fe1e0786aebc947dcbb6c108d540cd2301050d9559'));
   options={target:p.target,initialization_identity:p.admin,allowSynthetic:false};
   for(const[reader,key,name,pin]of APPROVALS)options[key]=await api[reader](REAL+'/package',manifest,REAL+'/approvals/'+name,pin);
   const sourceOptions={
    '--target-profile':'FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2',
    '--historical-settlement-retention-approval-sha256':APPROVALS[0][3],
    '--historical-line-amount-evidence-sha256':APPROVALS[1][3],
    '--historical-hall-approval-sha256':APPROVALS[2][3],
    '--current-effective-alignment-sha256':APPROVALS[3][3],
    '--explicit-zero-approval-sha256':APPROVALS[4][3],
    '--staff-hall-approval-sha256':APPROVALS[5][3],
   };
   const batchBinding={manifestSha256:summary.manifest_sha256,target:p.target,
    admin:p.admin,registration:options.registration??null,sourceOptions};
   const config={host:p.postgres.host,port:p.postgres.port,database:p.postgres.database,user:p.postgres.user,password:p.postgres.password};
   evidence.connectionCleanup='UNKNOWN';
   const value=await api.runOriginalR3Writer03(config,OPERATOR,p.target,
    {indexPath:REPORT+'/index.sqlite',summary,manifestBytes,options,provision:p.provision,encodedScrypt:p.encodedScrypt,batchBinding,batchPlanPath:BATCH_PLAN},
    {transactionMode:'BATCHED_V1',referenceDirectory:'/opt/naijue-erp/fresh35-combined-v1/reference-inputs',
     sourceProfileSha256:manifest.schema_contract.source_declarations_sha256,
     currentService:{sha256:a.service.proofSha256,capacityExpiresAt:proof.sharedPostgresNamespace.serviceLeaseExpiresAt},
     parentPins:{sha256:'96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e',
      sourceSetSha256:'d69cae66caf44473cd6c578943852e0f8eb4af38064135d2c0fcebc368aa3afe',
      catalogSpecSha256:'811c3cf6df32c6cfabc77071812f7e3abd43a0ea64b9f7b4d982b8ccae791d67'},
     successorSha256:'d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e'},retainInitializer);
   evidence.nativeResult=value.result;evidence.state=value.result?.state??'UNKNOWN';
   evidence.connectionCleanup=value.cleanup;evidence.localCleanup=value.local_cleanup??null;
   evidence.hostVerification=value.host_verification??null;

   if(evidence.state==='COMPLETED'&&evidence.connectionCleanup==='CLOSED'&&!evidence.localCleanup){
    const stateApi=await import(pathToFileURL(OPERATOR+'/tools/unified-import/batched-stream-cli-state.mjs').href);
    const host=await import(pathToFileURL(OPERATOR+'/tools/unified-import/fresh35-host-session.mjs').href);
    const batchState=await stateApi.openCliBatchedState(BATCH_PLAN,batchBinding);
    try{
     const prepared=stateApi.retainedCliBatchedProgram(batchState,p.encodedScrypt);
     prepared.batchedPlan=batchState;
     const readback=await host.openReviewedFresh35RetainedCompactZeroHost(config,OPERATOR,p.target,
      async()=>prepared,
      controlled=>api.reconcileOriginalR3Readback20(controlled,{initialize:prepared.initialize,
       encodedScrypt:p.encodedScrypt,sourceCounts:batchState.metadata.context.summary.counts,
       sourceTotals:batchState.metadata.context.totals}),
      {transactionMode:'BATCHED_V1',purpose:'FIRST_REAL_BUSINESS_IMPORT',prepareOnly:false,
       explicitZeroApproval:options.explicitZeroApproval,
       referenceDirectory:'/opt/naijue-erp/fresh35-combined-v1/reference-inputs',
       sourceProfileSha256:manifest.schema_contract.source_declarations_sha256,
       currentService:{sha256:a.service.proofSha256,capacityExpiresAt:proof.sharedPostgresNamespace.serviceLeaseExpiresAt},
       parentPins:{sha256:'96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e',
        sourceSetSha256:'d69cae66caf44473cd6c578943852e0f8eb4af38064135d2c0fcebc368aa3afe',
        catalogSpecSha256:'811c3cf6df32c6cfabc77071812f7e3abd43a0ea64b9f7b4d982b8ccae791d67'},
       successorSha256:'d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e'});
     evidence.verification={state:readback.result?.state??'VERIFICATION_UNKNOWN'};
     evidence.readbackConnectionCleanup=readback.cleanup;
     evidence.readbackHostVerification=readback.host_verification??null;
    }finally{batchState.close()}
   }
  }else throw Error('BATCHED24_FIRST_WRITER_ONLY');
 }catch(error){
  evidence.sqlstate=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:null;
  evidence.safeCode=/^[A-Z][A-Z0-9_]{0,120}$/.test(error?.message??'')?error.message:'RETAINED20_UNCONFIRMED';
  if(writing){
   const failure=catalogFailureReceipt(error);
   if(failure){
    evidence.catalogFailure=failure;
    evidence.connectionCleanup=failure.connectionCleanup;
   }
  }
 }finally{
  if(client)await closeClient(client,evidence);
  if(options?.explicitZeroApproval)try{await api.closeExplicitZeroApproval(options.explicitZeroApproval)}catch{evidence.approvalCleanup='UNCONFIRMED'}
  p.encodedScrypt=null;p.postgres.password=null;p.admin=null;p.provision=null;
 }
 return evidence;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=await main();process.stdout.write(JSON.stringify(r)+'\n');
  process.exitCode=(r.state==='COMPLETED'&&r.verification?.state==='VERIFIED'&&r.readbackConnectionCleanup==='CLOSED')
   &&r.connectionCleanup==='CLOSED'&&!r.localCleanup&&r.approvalCleanup!=='UNCONFIRMED'?0:2;
 }catch{process.stdout.write(JSON.stringify({requestKey:KEY,state:'UNKNOWN',safeCode:'RETAINED20_PREFLIGHT_REFUSED',connectionCleanup:'NOT_OPENED'})+'\n');process.exitCode=2;}
}
