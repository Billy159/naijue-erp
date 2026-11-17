/** Current execution envelope only: no preparation, connection, authority or writer. */
import {createHash} from 'node:crypto';
import {constants,fstatSync} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {isDeepStrictEqual as equal,types} from 'node:util';
import {finalHostOptions,WRITER,describeFailure} from './final33-run.mjs';
const SERVICE='t45-first-r3-native-service-start-20261118-45';
const OPERATOR='/var/lib/naijue-erp/fresh35-production/installed-real-operation-batched-root08-20261117-01/operation';
const PROJECTION='/var/lib/naijue-erp/fresh35-production/final33-private/'+SERVICE;
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(v,c)=>{if(!v)throw Error(c)};
const ident=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
async function bytes(path,max,pin){
 need(await realpath(path)===path,'FINAL44_DESCRIBE_CANONICAL_REQUIRED');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const s=await f.stat({bigint:true});
  need(s.isFile()&&s.uid===0n&&s.nlink===1n&&(s.mode&0o022n)===0n&&s.size>0n&&s.size<=BigInt(max),'FINAL44_DESCRIBE_PROTECTED_REQUIRED');
  const b=await f.readFile();need(BigInt(b.length)===s.size&&ident(s)===ident(await f.stat({bigint:true}))&&ident(s)===ident(await lstat(path,{bigint:true}))&&(!pin||sha(b)===pin),'FINAL44_DESCRIBE_INPUT_CHANGED');return b;
 }finally{await f.close()}
}
async function main(){
 need(process.platform==='linux'&&process.version==='v24.21.0'&&[process.getuid(),process.geteuid(),process.getgid(),process.getegid()].every(x=>x===61035)&&process.getgroups().every(x=>x===61035)
  &&process.execArgv.length===1&&process.execArgv[0]==='--no-global-search-paths'&&process.argv.length===3&&process.argv[2]==='describe'
  &&fileURLToPath(import.meta.url)===PROJECTION+'/final-execution-describe.mjs'&&fstatSync(0).isFIFO(),'FINAL44_DESCRIBE_FIXED_ENTRY_REQUIRED');
 need(!Object.keys(process.env).some(k=>k.startsWith('PG')||k.startsWith('LD_')||k.startsWith('DYLD_')||['DATABASE_URL','NODE_OPTIONS','NODE_PATH'].includes(k)),'FINAL44_DESCRIBE_ENV_REFUSED');
 stage='PAYLOAD';const chunks=[];let length=0;for await(const b of process.stdin){length+=b.length;need(length<=65536,'FINAL44_DESCRIBE_INPUT_BOUND');chunks.push(b)}
 const p=JSON.parse(Buffer.concat(chunks));chunks.forEach(b=>b.fill(0));
 need(Object.keys(p).sort().join(',')==='backupAdminValidUntil,service'&&Number.isSafeInteger(p.backupAdminValidUntil),'FINAL44_DESCRIBE_PAYLOAD_REQUIRED');
 stage='CURRENT_SERVICE';const raw=await bytes('/run/naijue-rewrite/current-production-service.json',65536,p.service.proofSha256),proof=JSON.parse(raw);
 const c=proof.sharedPostgresNamespace.container;
 need(proof.requestKey===SERVICE&&p.service.serviceKey===SERVICE&&c.id===p.service.containerId&&c.startedAt===p.service.containerStartedAt&&proof.physical.postmasterStart===p.service.postmasterStart,'FINAL44_DESCRIBE_CURRENT_C_REQUIRED');
 stage='HISTORICAL_INPUT';const historical=JSON.parse(await bytes(PROJECTION+'/historical-prepare05.json',65536,HISTORICAL_WITNESS_PIN));
 stage='SOURCE_IMPORT';
 const api=await import(pathToFileURL(OPERATOR+'/tools/unified-import/r3-service20-entry.mjs'));
 const {requestHash}=await import(pathToFileURL(OPERATOR+'/packages/application/src/request-hash.ts'));
 need(requestHash(historical.inputBinding)===historical.preparedBinding.finalSourceInputSha256,'FINAL44_DESCRIBE_HISTORICAL_INPUT_REQUIRED');
 const h=finalHostOptions(p.service,proof);
 stage='EXECUTION_BINDING';const expectedBinding=await api.describeFresh35FinalExecutionBinding(OPERATOR,h.referenceDirectory,h.currentService,h.parentPins,h.successorSha256,historical.inputBinding,historical.preparedBinding);
 const after={sourceSetSha256:expectedBinding.batchedSourceSetSha256,catalogSpecSha256:expectedBinding.batchedCatalogSpecSha256,modelSha256:expectedBinding.batchedModelSha256};
 need(after.sourceSetSha256==='a5f721749c1c7e59ce532ea6a287a310b2604ccbc77e0f1f2f0d831c5a2f8f6e'&&after.catalogSpecSha256==='aefbfd2ea3425a7cf6f9ad7bd22f8f98d4a946d7a90cc0f3c75ea539fdea4f17'&&after.modelSha256==='ada8f33433c6a4188173e98ea155f840fbd23d4643921b54d89ed777a7b027a9'
  &&expectedBinding.preparedBindingSha256===requestHash(historical.preparedBinding),'FINAL44_DESCRIBE_AFTER42_REQUIRED');
 const dynamic=new Set(['currentServiceSha256','postmasterStart','transactionMode','batchedDbCandidatePinsSha256','batchedSourceSetSha256','batchedCatalogSpecSha256','batchedModelSha256','preparedBindingSha256']);
 need(equal(Object.fromEntries(Object.entries(expectedBinding).filter(([k])=>!dynamic.has(k))),Object.fromEntries(Object.entries(historical.preparedBinding).filter(([k])=>!dynamic.has(k)))),'FINAL44_DESCRIBE_ORIGINAL_PLAN_CHANGED');
 stage='RESULT';const descriptor={format:'FRESH35_FINAL_R3_EXECUTION_DESCRIPTION_V1',requestKey:WRITER,service:p.service,currentServiceSha256:p.service.proofSha256,postmasterStart:p.service.postmasterStart,
  expectedBinding,originalPreparedBindingSha256:requestHash(historical.preparedBinding),historicalNativeResultSha256:historical.nativeResultSha256,
  sourceSetSha256:'ac85caa5b8edc5768ffb8bd0f0668b0b9778b3c4be05c5498bbcd5ce45b1bbc3',batchedCatalog:after};
 const liveFacts={requestKey:WRITER,service:p.service,physical:proof.physical,currentServiceSha256:p.service.proofSha256,postmasterStart:p.service.postmasterStart,
  sourceSetSha256:descriptor.sourceSetSha256,batchedCatalog:after,expectedBinding,backupAdminValidUntil:p.backupAdminValidUntil,
  actualSharedServiceWorkDeadline:proof.sharedPostgresNamespace.serviceLeaseExpiresAt,runnerConservativeWorkDeadline:proof.sharedPostgresNamespace.serviceLeaseExpiresAt-35000};
 need(Date.now()+30000<Math.min(p.backupAdminValidUntil,liveFacts.actualSharedServiceWorkDeadline),'FINAL44_DESCRIBE_FINITE_WINDOW_REQUIRED');
 return {state:'PROGRAM_DESCRIBED_NO_PG_OR_WRITE',databaseConnections:0,mutations:0,descriptor,liveFacts,payload:p};
}
const HISTORICAL_WITNESS_PIN='78fcd3f7811343615343f6c59c841fe06a70aaadeeee3a41a6845abe26d86ee2';
let stage='ENTRY';
const STAGES=Object.freeze(['ENTRY','PAYLOAD','CURRENT_SERVICE','HISTORICAL_INPUT','SOURCE_IMPORT','EXECUTION_BINDING','RESULT']);
const GUARDS=Object.freeze(['FINAL44_DESCRIBE_CANONICAL_REQUIRED','FINAL44_DESCRIBE_PROTECTED_REQUIRED','FINAL44_DESCRIBE_INPUT_CHANGED','FINAL44_DESCRIBE_FIXED_ENTRY_REQUIRED','FINAL44_DESCRIBE_ENV_REFUSED','FINAL44_DESCRIBE_INPUT_BOUND','FINAL44_DESCRIBE_PAYLOAD_REQUIRED','FINAL44_DESCRIBE_CURRENT_C_REQUIRED','FINAL44_DESCRIBE_HISTORICAL_INPUT_REQUIRED','FINAL44_DESCRIBE_AFTER42_REQUIRED','FINAL44_DESCRIBE_ORIGINAL_PLAN_CHANGED','FINAL44_DESCRIBE_FINITE_WINDOW_REQUIRED','FRESH35_COMBINED_RECORD_ORDINARY_RUNTIME_REQUIRED','FRESH35_PROTECTED_RECORD_REQUIRED','FRESH35_COMBINED_RECORD_OS_PROTECTED_RECORD_REQUIRED','FRESH35_COMBINED_CATALOG_BASE_MODEL_CORE_DIFFERS','FRESH35_COMBINED_CURRENT_SOURCE_CHANGED']);
const FRAMES=Object.freeze([
 [PROJECTION+'/final-execution-describe.mjs','DESCRIPTOR'],[PROJECTION+'/final33-run.mjs','HELPER'],
 [OPERATOR+'/tools/unified-import/fresh35-host-session.mjs','HOST'],
 [OPERATOR+'/tools/unified-import/batched-stream-cli-state.mjs','BINDING'],
 [OPERATOR+'/scripts/release/unified-install/fresh35-combined-record-v1.mjs','RECORD'],
 [OPERATOR+'/scripts/release/unified-install/fresh35-combined-target-v1.mjs','TARGET'],
 [OPERATOR+'/scripts/release/unified-install/fresh35-combined-catalog-v1.mjs','CATALOG'],
 [OPERATOR+'/scripts/release/unified-install/fresh35-combined-source-v1.mjs','SOURCE']]);
function safeFailure(error){
 const d=describeFailure(error,'EXECUTION_BINDING');
 const own=key=>{try{const v=Object.getOwnPropertyDescriptor(error,key);return v&&'value'in v?v.value:undefined}catch{return undefined}};
 const message=types.isNativeError(error)?own('message'):undefined,stack=types.isNativeError(error)?own('stack'):undefined;
 let sourceFrame=null;
 if(typeof stack==='string'&&stack.length<=65536)for(const line of stack.split('\n').slice(1,33)){
  const frame=line.match(/(?:\(|\s)(?:file:\/\/)?([^\s()]+):(\d+):(\d+)\)?$/);
  if(!frame)continue;
  const module=FRAMES.find(([path])=>path===frame[1])?.[1],row=Number(frame[2]),column=Number(frame[3]);
  if(module&&Number.isSafeInteger(row)&&row>0&&Number.isSafeInteger(column)&&column>0){sourceFrame={module,line:row,column};break}
 }
 return {stage:STAGES.includes(stage)?stage:'UNKNOWN',errorType:d.errorType,systemCode:d.systemCode,
  guardCode:GUARDS.includes(message)?message:'UNKNOWN',sourceFrame};
}
try{process.stdout.write(JSON.stringify(await main())+'\n')}
catch(error){process.stdout.write(JSON.stringify({state:'UNKNOWN',safeCode:'FINAL44_EXECUTION_DESCRIPTION_UNCONFIRMED',databaseConnections:0,mutations:0,...safeFailure(error)})+'\n');process.exitCode=2}
