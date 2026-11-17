/** Fixed final-source preparation and persisted-plan consumption; no issuer. */
import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual as equal,types} from 'node:util';
import {AssertionError} from 'node:assert';


// Closed diagnostic values only: never emit arbitrary message, stack, path or error properties.
const FAILURE_STAGES=Object.freeze(['PREFLIGHT','BIND_INPUTS','PREPARE_READERS','PREPARE_CALL','PREPARE_RESULT','EXECUTION_BINDING','WRITER_SCOPE','WRITER_CALL','WRITER_READBACK']);
const FAILURE_SYSTEM_CODES=Object.freeze(['ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_OUT_OF_RANGE','ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_ACCESS_DENIED','EACCES','EPERM','ENOENT','ELOOP','ENOTDIR','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','EADDRINUSE']);
const FAILURE_SQLSTATES=Object.freeze(['42601','42702','42501','42P01','42703','42883','23502','23503','23505','23514','22012','22P02','40001','40P01','57014','55P03','55000','P0001','28P01','3D000','53300','57P01','08006']);
const FAILURE_GUARDS=Object.freeze(["FINAL33_APPROVAL_CANONICAL_REQUIRED","FINAL33_APPROVAL_OUTSIDE_PACKAGE_REQUIRED","FINAL33_CANONICAL_INPUT_REQUIRED","FINAL33_CURRENT_SERVICE_DIFFERS","FINAL33_ENV_REFUSED","FINAL33_FINITE_AUTHORITY_REQUIRED","FINAL33_FIXED_CONTROLLER_REQUIRED","FINAL33_FIXED_PROCESS_REQUIRED","FINAL33_INITIALIZER_BOUND","FINAL33_INPUT_CHANGED","FINAL33_NATIVE_OUTCOME_UNCONFIRMED","FINAL33_ORIGINAL_PREPARE_BINDING_REQUIRED","FINAL33_PERSISTED_INITIALIZER_BINDING_DIFFERS","FINAL33_PERSISTED_SCOPE_BINDING_DIFFERS","FINAL33_PREFLIGHT_REFUSED","FINAL33_PRIVATE_INPUT_BOUND","FINAL33_PRIVATE_PLAN_DIRECTORY_REQUIRED","FINAL33_PROTECTED_INPUT_REQUIRED","FINAL33_PROTECTED_PARENT_REQUIRED","FINAL33_RESTORED_SCOPE_DIFFERS","FINAL33_SCRATCH_REQUIRED","FINAL33_SOURCE_MATERIALIZATION_DIFFERS"]);
export function describeFailure(error,stage){
 const native=types.isNativeError(error);
 const own=key=>{try{const d=Object.getOwnPropertyDescriptor(error,key);return d&&'value'in d?d.value:undefined}catch{return undefined}};
 const pick=(values,value)=>typeof value==='string'&&values.includes(value)?value:'UNKNOWN';
 const code=native?own('code'):undefined,message=native?own('message'):undefined;
 const errorType=!native?'UNKNOWN':error instanceof AssertionError?'AssertionError':error instanceof TypeError?'TypeError':error instanceof RangeError?'RangeError':error instanceof SyntaxError?'SyntaxError':error instanceof ReferenceError?'ReferenceError':Object.getPrototypeOf(error)===Error.prototype?'Error':'UNKNOWN';
 return {format:'FINAL33_FAILURE_DIAGNOSTIC_V1',stage:pick(FAILURE_STAGES,stage),errorType,
  systemCode:pick(FAILURE_SYSTEM_CODES,code),guardCode:pick(FAILURE_GUARDS,message),
  sqlstate:FAILURE_SQLSTATES.includes(code)?code:null};
}

export const PREPARE='t45-r3-final33-plan-prepare-20261116-05';
export const LOGICAL_PREPARE='t45-r3-final33-plan-prepare-20261116-01';
const PREPARATION_IDENTITY_MAPPING=Object.freeze({"batchPlanPath":"/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3/reports/t45-r3-final33-plan-prepare-20261116-05/batched-plan.sqlite","businessWriterRequestKey":"t45-r3-batched-real-execute-20261115-01","nativeLogicalPreparationKey":"t45-r3-final33-plan-prepare-20261116-01","outerPreparationAttemptKey":"t45-r3-final33-plan-prepare-20261116-05"});
export const WRITER='t45-r3-batched-real-after43-execute-20261118-01';
const STATE='/var/lib/naijue-erp/fresh35-production';
const INPUT=STATE+'/r3-final33-private-import-input-20261116-01/package';
const PACKAGE=INPUT+'/standard-ready-20261116-1140-r1';
const PLAN_DIR=STATE+'/real-first-20261110-r3/reports/'+PREPARE;
const PLAN=PLAN_DIR+'/batched-plan.sqlite';
const OPERATOR_ROOT='installed-real-operation-batched-root08-20261117-01';
const OPERATOR=STATE+'/'+OPERATOR_ROOT+'/operation';
const ROLE='erp35_controller_20261110_r3';
const WORK_ROOT=STATE+'/final33-private';
const mount=dirname(fileURLToPath(import.meta.url));
const KEY=mount.split('/').at(-1);
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const need=(v,c)=>{if(!v)throw Error(c)};
const load=rel=>import(pathToFileURL(OPERATOR+'/'+rel).href);
const INPUT_PINS=Object.freeze({
 manifest:'7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
 summary:'6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d',
 profile:'b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b',
});
export const REGISTRATION=Object.freeze({batch_id:'9629d837-776e-7f61-4fd4-0cebd4e1a097',
 source_namespace:'naijue:tplus:20261102',source_metadata_sha256:'f9488a2a0e148483fb985a73b177b923daf89b86df0c00179b4756fa097a098c',
 cutoff_at:'2026-11-16T11:40:00+08:00'});
const APPROVALS=Object.freeze([
 ['readHistoricalSettlementRetentionCliApproval','historicalSettlementRetentionApproval','final-approval-20261116-1140-r1/historical-settlement24.json','b97826567240e9509b60a263ba62d35bc08135b57cce84cc184debc83b1d6a05','--historical-settlement-retention-approval-sha256'],
 ['readHistoricalLineAmountCliEvidence','historicalLineAmountEvidence','final-approval-20261116-1140-r1/historical-line-amount6.json','e6f76ffd32f7d807e433e85bd2228b65281a6dc83ec3205117661bea13fdc710','--historical-line-amount-evidence-sha256'],
 ['readHistoricalHallCliApproval','historicalSalesHallApproval','final-approval-20261116-1140-r1/historical-sales-hall.json','a2e0893e36dc3260613a0e585c896aac6dd57939da2f7345d77561dcdf5a1a42','--historical-hall-approval-sha256'],
 ['readCurrentEffectiveAlignmentCliEvidence','currentEffectiveAlignmentEvidence','final-approval-20261116-1140-r1/current-effective-alignment.json','5a359f66aa5d6163fbb81dd23039395afdb81c8e30ed31d308dd5418f0d3b9ab','--current-effective-alignment-sha256'],
 ['readExplicitZeroCliApproval','explicitZeroApproval','current-materialized-r1/review/baseline-scope-review/inventory-baseline-scope.jsonl','669c0e4228ee2f7d8929bcc92a1bdf4cea9d491028e518d379818a64a775b566','--explicit-zero-approval-sha256'],
 ['readStaffHallCliApproval','historicalStaffHallApproval','final-approval-20261116-1140-r1/historical-staff-null-hall.json','4dec9cf865099dd8a74564202fddf9ebb37648ade6f6e0e1a55b1fbf45f9bb40','--staff-hall-approval-sha256'],
]);
export function finalBatchBinding(target,admin){
 const sourceOptions={'--target-profile':'FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2'};
 for(const row of APPROVALS)sourceOptions[row[4]]=row[3];
 return {manifestSha256:INPUT_PINS.manifest,target,admin,registration:{...REGISTRATION},sourceOptions};
}
export function finalHostOptions(service,proof){return {
 referenceDirectory:'/opt/naijue-erp/fresh35-combined-v1/reference-inputs',sourceProfileSha256:INPUT_PINS.profile,
 currentService:{sha256:service.proofSha256,capacityExpiresAt:proof.sharedPostgresNamespace.serviceLeaseExpiresAt},
 parentPins:{sha256:'96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e',
  sourceSetSha256:'d69cae66caf44473cd6c578943852e0f8eb4af38064135d2c0fcebc368aa3afe',
  catalogSpecSha256:'811c3cf6df32c6cfabc77071812f7e3abd43a0ea64b9f7b4d982b8ccae791d67'},
 successorSha256:'d18f80cec591b3740f7aeceb14f1148bdea4ce867feba4e5ff3465dbdb8d231e'};}
const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
async function protectedBytes(path,pin,maximum,exactBytes,groupPrivate=false){
 need(await realpath(path)===path,'FINAL33_CANONICAL_INPUT_REQUIRED');
 for(let d=dirname(path);;d=dirname(d)){
  const st=await lstat(d);
  need(st.isDirectory()&&st.uid===0&&!(st.mode&0o022),'FINAL33_PROTECTED_PARENT_REQUIRED');
  if(d==='/')break;
 }
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const a=await fd.stat({bigint:true});
  need(a.isFile()&&a.uid===0n&&a.nlink===1n&&!(a.mode&0o022n)&&a.size>0n&&a.size<=BigInt(maximum)
   &&(exactBytes===undefined||a.size===BigInt(exactBytes))
   &&(!groupPrivate||a.gid===61035n&&(a.mode&0o777n)===0o440n),'FINAL33_PROTECTED_INPUT_REQUIRED');
  const bytes=await fd.readFile();
  need(BigInt(bytes.length)===a.size&&identity(a)===identity(await fd.stat({bigint:true}))
   &&identity(a)===identity(await lstat(path,{bigint:true}))&&sha(bytes)===pin,'FINAL33_INPUT_CHANGED');
  return bytes;
 }finally{await fd.close()}
}
async function privateInput(){
 const parts=[];let n=0;
 try{
  for await(const b of process.stdin){n+=b.length;need(n<=65536,'FINAL33_PRIVATE_INPUT_BOUND');parts.push(b)}
  const raw=Buffer.concat(parts);
  try{
   const p=JSON.parse(raw);
   need(p?.postgres?.host==='127.0.0.1'&&p.postgres.port===56791&&p.postgres.database==='erp_fresh35_20261110_r3'
    &&p.postgres.user===ROLE&&p.postgres.ssl===false&&digest(p.postgres.password),'FINAL33_FIXED_CONTROLLER_REQUIRED');
   return p;
  }finally{raw.fill(0)}
 }finally{parts.forEach(b=>b.fill(0))}
}
async function retainInitializer(initialize){
 const dir=await lstat(PLAN_DIR);
 need(await realpath(PLAN_DIR)===PLAN_DIR&&dir.isDirectory()&&dir.uid===61035&&dir.gid===61035
  &&(dir.mode&0o777)===0o700,'FINAL33_PRIVATE_PLAN_DIRECTORY_REQUIRED');
 const bytes=Buffer.from(JSON.stringify(initialize)+'\n');
 need(bytes.length>0&&bytes.length<=128*1024*1024,'FINAL33_INITIALIZER_BOUND');
 const fd=await open(PLAN_DIR+'/original-initializer.json',constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(bytes);await fd.sync()}finally{bytes.fill(0);await fd.close()}
}
async function outsidePackage(path){
 need(await realpath(path)===path&&await realpath(PACKAGE)===PACKAGE,'FINAL33_APPROVAL_CANONICAL_REQUIRED');
 const rel=relative(PACKAGE,path);
 need(rel==='..'||rel.startsWith('..'+sep)||rel.startsWith(sep),'FINAL33_APPROVAL_OUTSIDE_PACKAGE_REQUIRED');
}
async function persistedScope(batchBinding,preparedBinding,encodedScrypt){
 const stateApi=await load('tools/unified-import/batched-stream-cli-state.mjs');
 const {requestHash}=await load('packages/application/src/request-hash.ts');
 const approvals=await load('packages/application/src/unified-explicit-zero-approval.ts');
 let state,token;
 try{
  state=await stateApi.openCliBatchedState(PLAN,batchBinding);
  const initialize=state.initialize(),descriptor=initialize.payload?.explicit_zero_approval;
  need(requestHash({initialize,encodedScrypt})===preparedBinding.initializerSha256,
   'FINAL33_PERSISTED_INITIALIZER_BINDING_DIFFERS');
  need(descriptor?.format_version==='INVENTORY_BASELINE_SCOPE_V1'&&descriptor.sha256===APPROVALS[4][3]
   &&descriptor.source_namespace===initialize.namespace&&descriptor.cutoff_at===initialize.cutoff_at,
   'FINAL33_PERSISTED_SCOPE_BINDING_DIFFERS');
  const path=INPUT+'/'+APPROVALS[4][2];await outsidePackage(path);
  const bytes=await protectedBytes(path,APPROVALS[4][3],65536,undefined,true);
  token=await approvals.readExplicitZeroScopeApproval({bytes,trustedSha256:APPROVALS[4][3],directory:dirname(path),
   sourceNamespace:descriptor.source_namespace,inventoryFileSha256:descriptor.inventory_file_sha256,cutoffAt:descriptor.cutoff_at});
  need(requestHash(approvals.explicitZeroApprovalDescriptor(token))===requestHash(descriptor),'FINAL33_RESTORED_SCOPE_DIFFERS');
  return token;
 }catch(error){if(token)await approvals.closeExplicitZeroApproval(token);throw error}
 finally{
  try{state?.close()}catch(error){if(token)await approvals.closeExplicitZeroApproval(token);throw error}
 }
}
export async function main(){
 need(process.platform==='linux'&&process.version==='v24.21.0'&&[process.getuid(),process.geteuid(),process.getgid(),process.getegid()].every(x=>x===61035)
  &&process.getgroups().every(x=>x===61035)&&KEY===WRITER&&mount===WORK_ROOT+'/'+KEY
  &&process.execArgv.length===1&&process.execArgv[0]==='--no-global-search-paths'
  &&process.argv.length===3&&digest(process.argv[2])&&fstatSync(0).isFIFO(),'FINAL33_FIXED_PROCESS_REQUIRED');
 need(!Object.keys(process.env).some(k=>k.startsWith('PG')||['DATABASE_URL','NODE_PATH','NODE_OPTIONS'].includes(k)
  ||k.startsWith('LD_')||k.startsWith('DYLD_')),'FINAL33_ENV_REFUSED');
 need(process.env.TMPDIR===mount+'/scratch'&&process.env.SQLITE_TMPDIR===mount+'/scratch','FINAL33_SCRATCH_REQUIRED');
 const a=JSON.parse(await protectedBytes(mount+'/host-authorization.json',process.argv[2],131072,undefined,true));
 need(equal(a.preparationIdentityMapping,PREPARATION_IDENTITY_MAPPING)&&a.preparationRequestKey===LOGICAL_PREPARE&&a.batchPlanPath===PLAN,'FINAL33_FINITE_AUTHORITY_REQUIRED');
 need(a.requestKey===KEY&&a.phase===(KEY===PREPARE?'PREPARE':'WRITER')&&a.startsAt<=Date.now()
  &&Date.now()+30000<a.expiresAt,'FINAL33_FINITE_AUTHORITY_REQUIRED');
 const proof=JSON.parse(await protectedBytes('/run/naijue-rewrite/current-production-service.json',a.service.proofSha256,65536));
 need(proof.requestKey===a.service.serviceKey&&proof.physical.postmasterStart===a.service.postmasterStart
  &&proof.sharedPostgresNamespace.container.id===a.service.containerId&&proof.sharedPostgresNamespace.container.startedAt===a.service.containerStartedAt
  &&a.expiresAt<=proof.sharedPostgresNamespace.serviceLeaseExpiresAt,'FINAL33_CURRENT_SERVICE_DIFFERS');
 const material=JSON.parse(await protectedBytes(STATE+'/'+OPERATOR_ROOT+'/source-materialization.json',a.operatorReadySha256,65536));
 need(material.state==='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'&&material.sourceFiles===392
  &&material.sourceSetSha256==='ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3'
  &&material.nodeModulesChanged===false&&material.databaseWrites===0,'FINAL33_SOURCE_MATERIALIZATION_DIFFERS');
 await protectedBytes(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs','a36f2a10911f19682e488bd1432924f4616f8e7b5007691e4ac50caafe3a68f6',2048,1075);
 const api=await load('tools/unified-import/r3-service20-entry.mjs');
 const p=await privateInput();let options;let failureStage='BIND_INPUTS';
 const evidence={requestKey:KEY,service:a.service,inputSha256:process.argv[2],phase:a.phase,state:'UNKNOWN',
  connectionCleanup:'NOT_OPENED',automaticReplay:false};
 try{
  const batchBinding=finalBatchBinding(p.target,p.admin),hostOptions=finalHostOptions(a.service,proof);
  const config={host:p.postgres.host,port:p.postgres.port,database:p.postgres.database,user:p.postgres.user,password:p.postgres.password};
  options={target:p.target,initialization_identity:p.admin,allowSynthetic:false,registration:{...REGISTRATION}};
  let result;
  {
   failureStage='WRITER_SCOPE';
   need(p.preparedBinding&&equal(p.preparedBinding,a.originalPreparedBinding),'FINAL33_ORIGINAL_PREPARE_BINDING_REQUIRED');
   const inputBinding=api.describeFinalR3InputBinding(p.target,p.admin,p.provision,batchBinding);
   const expected=await api.describeFresh35FinalExecutionBinding(OPERATOR,hostOptions.referenceDirectory,hostOptions.currentService,hostOptions.parentPins,hostOptions.successorSha256,inputBinding,p.preparedBinding);
   need(equal(expected,a.expectedBinding),'FINAL33_ORIGINAL_PREPARE_BINDING_REQUIRED');
   evidence.executionBinding=expected;
   options.explicitZeroApproval=await persistedScope(batchBinding,p.preparedBinding,p.encodedScrypt);
   const inputs={batchPlanPath:PLAN,batchBinding,options,provision:p.provision,encodedScrypt:p.encodedScrypt,preparedBinding:p.preparedBinding};
   evidence.connectionCleanup='UNKNOWN';
   failureStage='WRITER_CALL';
   result=await api.runFinalR3Writer03(config,OPERATOR,p.target,inputs,hostOptions);
   evidence.nativeResult=result.result;evidence.state=result.result?.state??'UNKNOWN';
   evidence.connectionCleanup=result.cleanup;evidence.localCleanup=result.local_cleanup??null;evidence.hostVerification=result.host_verification??null;
   if(evidence.state==='COMPLETED'&&result.cleanup==='CLOSED'&&!result.local_cleanup){
    failureStage='WRITER_READBACK';
    const verified=await api.runFinalR3Readback03(config,OPERATOR,p.target,inputs,hostOptions);
    evidence.verification={state:verified.result?.state??'UNKNOWN'};evidence.readbackConnectionCleanup=verified.cleanup;
    evidence.readbackHostVerification=verified.host_verification??null;evidence.readbackLocalCleanup=verified.local_cleanup??null;
   }
  }
  evidence.connectionCleanup=result.cleanup;evidence.localCleanup=result.local_cleanup??null;evidence.hostVerification=result.host_verification??null;
 }catch(error){
  evidence.failureDiagnostic=describeFailure(error,failureStage);
  evidence.sqlstate=evidence.failureDiagnostic.sqlstate;
  evidence.safeCode=evidence.failureDiagnostic.guardCode==='UNKNOWN'?'FINAL33_NATIVE_OUTCOME_UNCONFIRMED':evidence.failureDiagnostic.guardCode;
 }finally{
  if(options?.explicitZeroApproval)try{await api.closeExplicitZeroApproval(options.explicitZeroApproval)}catch{evidence.approvalCleanup='UNCONFIRMED'}
  p.encodedScrypt=null;p.postgres.password=null;p.admin=null;p.provision=null;
 }
 return evidence;
}
export function successful(v,key){return v.connectionCleanup==='CLOSED'&&!v.localCleanup&&v.approvalCleanup!=='UNCONFIRMED'
 &&(key===PREPARE?v.state==='BATCHED_IMPORT_PREPARED'&&v.nativeResult?.root_state==='ABSENT'
  &&v.nativeResult?.business_database_writes===false&&v.preparedBinding&&v.executionBinding
  :key===WRITER&&v.state==='COMPLETED'&&v.verification?.state==='VERIFIED'&&v.readbackConnectionCleanup==='CLOSED'&&!v.readbackLocalCleanup);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await main();process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=successful(result,KEY)?0:2}
 catch(error){const failureDiagnostic=describeFailure(error,'PREFLIGHT');process.stdout.write(JSON.stringify({requestKey:KEY,state:'UNKNOWN',connectionCleanup:'NOT_OPENED',
  safeCode:failureDiagnostic.guardCode==='UNKNOWN'?'FINAL33_PREFLIGHT_REFUSED':failureDiagnostic.guardCode,failureDiagnostic})+'\n');process.exitCode=2}
}
