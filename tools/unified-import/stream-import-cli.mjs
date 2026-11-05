import {readHistoricalSettlementRetentionCliApproval} from './historical-settlement-retention-cli-input.mjs';
import{openReviewedFresh35Host,openReviewedFresh35ProductionHost}from'./fresh35-host-session.mjs';
import{loadFresh35CombinedRecordEnvelope}from'../../scripts/release/unified-install/fresh35-combined-record-v1.mjs';
import {readHistoricalLineAmountCliEvidence} from './historical-line-amount-cli-input.mjs';
import {readHistoricalHallCliApproval} from './historical-hall-cli-input.mjs';
import {readCurrentEffectiveAlignmentCliEvidence} from './current-effective-alignment-cli-input.mjs';
import{openReviewedWholeSalesHost}from'./whole-sales-host.mjs';
import{reconcileWholePackage}from'./whole-package-reconcile.mjs';
import{open,lstat,realpath}from'node:fs/promises';import{constants}from'node:fs';import{resolve,join,relative,sep}from'node:path';import{fileURLToPath}from'node:url';import{parseStrictJson,decodeUtf8,sha256,isHistoricalSalesHallSourceProfile,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256}from'../../packages/application/src/unified-import-contract.ts';import{isNodeScryptPasswordHash}from'../../packages/authentication/src/passwords.ts';import{streamPreflight}from'./stream-preflight.mjs';import{prepareStreamPlan}from'./stream-plan.mjs';import{buildStreamProgram}from'./stream-program.mjs';import{openReviewedWholeHost}from'./whole-package-host.mjs';import{executeWholePackage}from'./whole-package-client.ts';import{inspectWholePackage}from'./whole-package-inspect.ts';import{createWholePackageSqlKernel}from'./whole-package-sql-kernel.ts';import{assertPublicValuesExcludePrivateInputs}from'./execution-client.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const SAFE_CODES=new Set(['FRESH35_HOST_REAL_PREPARED_PROGRAM_REQUIRED','FRESH35_HOST_PRODUCTION_V2_RECORD_REQUIRED','FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_REQUIRED','FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_FORMAT_REQUIRED','FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_BINDING_DIFFERS','FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_WINDOW_EXPIRED','FRESH35_HOST_PRODUCTION_BATCH_AUTHORIZATION_CHANGED','FRESH35_HOST_PRODUCTION_INITIALIZER_BINDING_DIFFERS','FRESH35_HOST_PRODUCTION_ORIGINAL_STEP_REQUIRED','FRESH35_HOST_PRODUCTION_COMPLETE_ORIGINAL_STEPS_REQUIRED','FRESH35_HOST_WINDOW_EXPIRED','FRESH35_PROTECTED_RECORD_REQUIRED','FRESH35_HOST_WINDOW_EXPIRED','FRESH35_HOST_TARGET_BINDING_MISMATCH','FRESH35_HOST_OPTIONS_INVALID','FRESH35_HOST_FIXED_RECORD_CHANGED','FRESH35_HOST_RUNTIME_CATALOG_NOT_WIRED','FRESH35_TARGET_PROFILE_REQUIRED','FRESH35_SOURCE_PROFILE_REQUIRED','HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND','HISTORICAL_LINE_AMOUNT_PROFILE_REQUIRED','HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED','HISTORICAL_LINE_AMOUNT_EVIDENCE_OUTSIDE_PACKAGE_REQUIRED','HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH','HISTORICAL_LINE_AMOUNT_EVIDENCE_SOURCE','HISTORICAL_LINE_AMOUNT_EVIDENCE_LINE','HISTORICAL_LINE_AMOUNT_EVIDENCE_SIZE','HISTORICAL_LINE_AMOUNT_STREAM_REQUIRED','HISTORICAL_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED','HISTORICAL_HALL_APPROVAL_SIZE','HISTORICAL_HALL_APPROVAL_HASH','HISTORICAL_HALL_APPROVAL_SHAPE','HISTORICAL_HALL_APPROVAL_SOURCE','HISTORICAL_HALL_APPROVAL_RECORDS','HISTORICAL_HALL_APPROVAL_RECORD','HISTORICAL_HALL_APPROVAL_REQUIRED','HISTORICAL_HALL_SOURCE_PROFILE_NOT_ADMITTED','HISTORICAL_HALL_PROFILE_OFFLINE_ONLY','CURRENT_EFFECTIVE_ALIGNMENT_OUTSIDE_PACKAGE_REQUIRED','CURRENT_EFFECTIVE_ALIGNMENT_SIZE','CURRENT_EFFECTIVE_ALIGNMENT_HASH','CURRENT_EFFECTIVE_ALIGNMENT_FACT','CURRENT_EFFECTIVE_ALIGNMENT_BINDING_INVALID','CURRENT_EFFECTIVE_ALIGNMENT_REQUIRED','CURRENT_EFFECTIVE_ALIGNMENT_UNVERIFIED','WHOLE_SQL_PARAMETERS_INVALID','MANIFEST_HASH_MISMATCH','EXPLICIT_ZERO_APPROVAL_OUTSIDE_PACKAGE_REQUIRED','EXPLICIT_ZERO_APPROVAL_SIZE','EXPLICIT_ZERO_APPROVAL_HASH','EXPLICIT_ZERO_APPROVAL_BINDING','EXPLICIT_ZERO_APPROVAL_COUNT','EXPLICIT_ZERO_APPROVAL_FACT','EXPLICIT_ZERO_APPROVAL_DUPLICATE','EXPLICIT_ZERO_APPROVAL_UNVERIFIED','EXPLICIT_ZERO_APPROVAL_BINDING_INVALID','EXPLICIT_ZERO_IDENTITY_UNKNOWN','EXPLICIT_ZERO_ALREADY_LISTED','INPUT_FILE_INVALID','INPUT_FILE_CHANGED','INPUT_FILE_TOO_LARGE','PREFLIGHT_REJECTED','INDEX_HASH_MISMATCH','INDEX_CHANGED','INDEX_SIDECAR_PRESENT','STREAM_PLAN_BINDING_INVALID','STREAM_PLAN_MANIFEST_MISMATCH','STREAM_PLAN_ADMIN_INVALID','STREAM_INITIALIZATION_IDENTITY_MISMATCH','STREAM_PLAN_SUMMARY_MISMATCH','STREAM_PLAN_NOT_ACTIVE','STREAM_MASTER_CHUNK_TOO_LARGE','STREAM_MASTER_COMPONENT_TOO_LARGE','STREAM_DOCUMENT_REQUEST_TOO_LARGE','STREAM_BASELINE_REQUEST_TOO_LARGE','REGISTERED_SOURCE_MISMATCH','REGISTRATION_DECLARATION_MISMATCH','WHOLE_INSTALLATION_RECORD_UNTRUSTED','WHOLE_TARGET_BINDING_MISMATCH','WHOLE_CONNECTION_CONFIG_INVALID','WHOLE_CONNECTION_FAILED','WHOLE_CONNECTION_CLEANUP_FAILED','AMBIENT_DATABASE_CONFIGURATION_PROHIBITED','PRIVATE_CREDENTIAL_FORMAT_INVALID','WHOLE_SALES_INSTALLATION_RECORD_UNTRUSTED','WHOLE_SALES_ADMISSION_REQUIRED','WHOLE_SALES_ADMISSION_TARGET_DIFFERS','STAFF_HALL_APPROVAL_OUTSIDE_PACKAGE_REQUIRED','STAFF_HALL_APPROVAL_HASH','STAFF_HALL_APPROVAL_SOURCE','STAFF_HALL_APPROVAL_RECORD','STAFF_HALL_APPROVAL_RECORDS','STAFF_HALL_APPROVAL_SIZE','STAFF_HALL_APPROVAL_DUPLICATE_REF','STAFF_HALL_APPROVAL_BINDING_INVALID']);
/** This is route advice only, never validation/admission. Keep the existing small
 * package reader's exact byte limits; raw source_files are not materialized. */
export function wholePackageMaterializationLimit(manifest,manifestBytes){
 if(!manifest||!manifest.identity_registry||!['files','reports','assets'].every(k=>Array.isArray(manifest[k])))return null;
 const pins=[manifest.identity_registry,...manifest.files,...manifest.reports,...manifest.assets];
 if(!pins.every(p=>p&&Number.isSafeInteger(p.bytes)&&p.bytes>=0))return null;
 if(pins.some(p=>p.bytes>64*1024*1024))return 'FILE_BYTES';
 let total=manifestBytes;
 for(const p of pins){total+=p.bytes;if(total>256*1024*1024)return 'PACKAGE_BYTES'}
 return null;
}
async function readBounded(path,max,secret=false){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max||(secret&&(s.mode&0o077)!==0))throw Error('INPUT_FILE_INVALID');const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await f.stat();if(before.dev!==s.dev||before.ino!==s.ino||before.size!==s.size)throw Error('INPUT_FILE_CHANGED');let n=0;const chunks=[];for(;;){const b=Buffer.alloc(Math.min(65536,max+1-n)),r=await f.read(b,0,b.length,null);if(!r.bytesRead)break;n+=r.bytesRead;if(n>max)throw Error('INPUT_FILE_TOO_LARGE');chunks.push(b.subarray(0,r.bytesRead))}const after=await f.stat(),now=await lstat(path);if(n!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||now.dev!==before.dev||now.ino!==before.ino)throw Error('INPUT_FILE_CHANGED');return Buffer.concat(chunks,n)}finally{await f.close()}}
const json=async(p,secret=false)=>parseStrictJson(decodeUtf8(await readBounded(p,65536,secret)));
/** Explicitly operator-initiated whole transaction. The reviewed catalogue file
 * must be independently signed off, not generated by this invocation. The
 * operator must ensure an exclusive DDL/ACL window. Real PG validation pending. */
export const runStreamImport=argv=>runStreamOperation(argv,false,false);
export const runStreamVerify=argv=>runStreamOperation(argv,true,false);
export const runWholeImport=argv=>runStreamOperation(argv,false,true);
async function runStreamOperation(argv,verifyOnly,whole){
 const command=whole?'whole-import':verifyOnly?'stream-verify':'stream-import';
 if(argv.length===1&&argv[0]==='--help')return{fresh35_execution:(await import('./fresh35-receiver-diagnostics.ts')).FRESH35_RECEIVER_CAPABILITY,fresh35_production_real_import:(await import('./fresh35-receiver-diagnostics.ts')).FRESH35_PRODUCTION_REAL_IMPORT_CAPABILITY,usage:command+' --package DIR --report DIR --manifest-sha256 SHA --target JSON --admin JSON --connection PRIVATE_JSON --scrypt-file PRIVATE_FILE [--registration JSON] [--allow-synthetic] '+(whole?'':'[--coalesce] ')+'[--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA] [--staff-hall-approval FILE --staff-hall-approval-sha256 SHA] [--historical-hall-approval FILE --historical-hall-approval-sha256 SHA] [--current-effective-alignment FILE --current-effective-alignment-sha256 SHA] '+(verifyOnly?'':'[--inspect-only] ')+'[--historical-settlement-retention-approval FILE --historical-settlement-retention-approval-sha256 SHA] [--historical-line-amount-evidence FILE --historical-line-amount-evidence-sha256 SHA] [--target-profile FRESH35_RETIRED152_V1|FRESH35_PRODUCTION_REAL_IMPORT_V1 --fresh35-reference-inputs DIR] [--prepare-only (production REAL stream-import only; no writer)] --ack-exclusive-ddl-window',postgresql_acceptance:'NOT_RUN',scope:'LOCAL_OPERATOR_CONTROLLED',package_loading:whole?'MATERIALIZED_SMALL_PACKAGE':'STREAMED_INDEX_AND_REQUESTS',large_package_command:'stream-import',small_package_limits:{file_bytes:64*1024*1024,package_bytes:256*1024*1024},stream_scope:'One whole-package transaction; bounded index/request iteration, not a claim of unlimited size or live acceptance'};
 const v={},flags=new Set();
 for(let i=0;i<argv.length;i++){
  const k=argv[i];
  if(['--allow-synthetic','--coalesce','--inspect-only','--prepare-only','--ack-exclusive-ddl-window'].includes(k)){if(flags.has(k))throw Error('OPTION_DUPLICATE');flags.add(k);continue}
  if(!['--package','--report','--manifest-sha256','--target','--admin','--registration','--connection','--scrypt-file','--staff-hall-approval','--staff-hall-approval-sha256','--historical-hall-approval','--historical-hall-approval-sha256','--current-effective-alignment','--current-effective-alignment-sha256','--explicit-zero-approval','--explicit-zero-approval-sha256','--target-profile','--fresh35-reference-inputs','--historical-settlement-retention-approval','--historical-settlement-retention-approval-sha256','--historical-line-amount-evidence','--historical-line-amount-evidence-sha256'].includes(k)||Object.hasOwn(v,k)||i+1>=argv.length)throw Error('OPTION_INVALID');v[k]=argv[++i];
 }
 if(verifyOnly&&flags.has('--inspect-only')||whole&&flags.has('--coalesce'))throw Error('OPTION_INVALID');
 // Explicit Fresh35 selection never routes through either historical host.
 const fresh35=Object.hasOwn(v,'--target-profile'),productionReal=v['--target-profile']==='FRESH35_PRODUCTION_REAL_IMPORT_V1';
 if(flags.has('--prepare-only')&&(!productionReal||whole||verifyOnly||flags.has('--inspect-only'))||productionReal&&(whole||flags.has('--allow-synthetic')))throw Error('OPTION_INVALID');
 if(fresh35){
  const diagnostic=await import('./fresh35-receiver-diagnostics.ts');
  if(v['--target-profile']!==diagnostic.FRESH35_RECEIVER_TARGET_PROFILE&&v['--target-profile']!==diagnostic.FRESH35_PRODUCTION_REAL_IMPORT_PROFILE)throw Error('OPTION_INVALID');
  try{await loadFresh35CombinedRecordEnvelope()}catch{return diagnostic.fresh35ReceiverBlocked(v['--target-profile'])}
  if(!v['--fresh35-reference-inputs'])throw Error('OPTION_REQUIRED');
 }else if(v['--fresh35-reference-inputs'])throw Error('OPTION_INVALID');
 if(Boolean(v['--historical-settlement-retention-approval'])!==Boolean(v['--historical-settlement-retention-approval-sha256']))throw Error('OPTION_REQUIRED');
 if(Boolean(v['--historical-line-amount-evidence'])!==Boolean(v['--historical-line-amount-evidence-sha256']))throw Error('OPTION_REQUIRED');
 if(whole&&v['--historical-line-amount-evidence'])throw Error('HISTORICAL_LINE_AMOUNT_STREAM_REQUIRED');
 if(Boolean(v['--historical-hall-approval'])!==Boolean(v['--historical-hall-approval-sha256']))throw Error('OPTION_REQUIRED');
 if(Boolean(v['--current-effective-alignment'])!==Boolean(v['--current-effective-alignment-sha256']))throw Error('OPTION_REQUIRED');
 if(Boolean(v['--explicit-zero-approval'])!==Boolean(v['--explicit-zero-approval-sha256']))throw Error('OPTION_REQUIRED');
 if(Boolean(v['--staff-hall-approval'])!==Boolean(v['--staff-hall-approval-sha256']))throw Error('OPTION_REQUIRED');
 for(const k of ['--package','--report','--manifest-sha256','--target','--admin','--connection','--scrypt-file'])if(!v[k])throw Error('OPTION_REQUIRED');
 if(!flags.has('--ack-exclusive-ddl-window'))throw Error('EXCLUSIVE_DDL_WINDOW_ACK_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(v['--manifest-sha256']))throw Error('MANIFEST_HASH_INVALID');
 const pkg=resolve(v['--package']),report=resolve(v['--report']),manifest=await readBounded(join(pkg,'manifest.json'),2*1024*1024),manifestObject=parseStrictJson(decodeUtf8(manifest)),target=await json(v['--target']),admin=await json(v['--admin']),registration=v['--registration']?await json(v['--registration']):undefined;
 let plan,program,output,executionStarted=false,acknowledgedImport=null,acknowledgedRollback=false;
 try{
  const hallProfile=isHistoricalSalesHallSourceProfile(manifestObject.schema_contract?.source_declarations_sha256);
  if(hallProfile&&!fresh35)throw Error('FRESH35_TARGET_PROFILE_REQUIRED');
  if(fresh35&&!hallProfile)throw Error('FRESH35_SOURCE_PROFILE_REQUIRED');
  if(productionReal&&manifestObject.package_kind!=='REAL')throw Error('FRESH35_HOST_REAL_PREPARED_PROGRAM_REQUIRED');
  const materializationLimit=whole?wholePackageMaterializationLimit(manifestObject,manifest.length):null;
  if(materializationLimit){
   if(sha256(manifest)!==v['--manifest-sha256'])throw Error('MANIFEST_HASH_MISMATCH');
   return output={state:'NOT_STARTED',code:'WHOLE_PACKAGE_MATERIALIZATION_LIMIT',limit:materializationLimit,required_command:'stream-import',automatic_switch:false,business_database_writes:false,message:'Use stream-import explicitly with the same approved inputs and a new report directory. It retains one whole-package transaction; no preflight or host connection was started.'};
  }
  const historicalSettlementRetentionApproval=v['--historical-settlement-retention-approval']?await readHistoricalSettlementRetentionCliApproval(pkg,manifestObject,v['--historical-settlement-retention-approval'],v['--historical-settlement-retention-approval-sha256']):undefined;
  const historicalLineAmountEvidence=v['--historical-line-amount-evidence']?await readHistoricalLineAmountCliEvidence(pkg,manifestObject,v['--historical-line-amount-evidence'],v['--historical-line-amount-evidence-sha256']):undefined;
  let historicalSalesHallApproval;
  if(v['--historical-hall-approval']){
   if(sha256(manifest)!==v['--manifest-sha256'])throw Error('MANIFEST_HASH_MISMATCH');
   historicalSalesHallApproval=await readHistoricalHallCliApproval(pkg,manifestObject,v['--historical-hall-approval'],v['--historical-hall-approval-sha256']);
  }
  let currentEffectiveAlignmentEvidence;
  if(v['--current-effective-alignment']){
   if(sha256(manifest)!==v['--manifest-sha256'])throw Error('MANIFEST_HASH_MISMATCH');
   currentEffectiveAlignmentEvidence=await readCurrentEffectiveAlignmentCliEvidence(pkg,manifestObject,v['--current-effective-alignment'],v['--current-effective-alignment-sha256']);
  }
  let explicitZeroApproval;
  if(v['--explicit-zero-approval']){
   const {readExplicitZeroCliApproval}=await import('./explicit-zero-cli-input.mjs');
   explicitZeroApproval=await readExplicitZeroCliApproval(pkg,manifestObject,v['--explicit-zero-approval'],v['--explicit-zero-approval-sha256']);
  }
  let historicalStaffHallApproval;
  if(v['--staff-hall-approval']){
   const {readStaffHallCliApproval}=await import('./explicit-zero-cli-input.mjs');
   historicalStaffHallApproval=await readStaffHallCliApproval(pkg,manifestObject,v['--staff-hall-approval'],v['--staff-hall-approval-sha256']);
  }
  const summary=await streamPreflight(pkg,report,{expectedManifestSha256:v['--manifest-sha256'],allowSynthetic:flags.has('--allow-synthetic'),...(historicalSettlementRetentionApproval?{historicalSettlementRetentionApproval}:{}),...(historicalLineAmountEvidence?{historicalLineAmountEvidence}:{}),...(historicalSalesHallApproval?{historicalSalesHallApproval}:{}),...(currentEffectiveAlignmentEvidence?{currentEffectiveAlignmentEvidence}:{}),...(historicalStaffHallApproval?{historicalStaffHallApproval}:{}),...(explicitZeroApproval?{explicitZeroApproval}:{})});
  if(!summary.checks_passed||!summary.complete_package_validation)return output={state:'PREFLIGHT_REJECTED',issue_count:summary.issue_count,issues_file:join(report,'issues.jsonl'),business_database_writes:false};
  const options={target,initialization_identity:admin,allowSynthetic:flags.has('--allow-synthetic'),...(historicalSettlementRetentionApproval?{historicalSettlementRetentionApproval}:{}),...(historicalLineAmountEvidence?{historicalLineAmountEvidence}:{}),...(historicalSalesHallApproval?{historicalSalesHallApproval}:{}),...(currentEffectiveAlignmentEvidence?{currentEffectiveAlignmentEvidence}:{}),...(registration?{registration}:{}),...(historicalStaffHallApproval?{historicalStaffHallApproval}:{}),...(explicitZeroApproval?{explicitZeroApproval}:{})};
  const prepare=async historicalSalesAdmission=>{
   const admitted={...options,...(historicalSalesAdmission?{historicalSalesAdmission}:{})};
   plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,manifest,admitted);
   if(whole){
    const {readPinnedPackageForExecution}=await import('./execution-plan.ts');
    const {compileStandardWholePackageProfile}=await import('../../packages/application/src/unified-import-whole-package-profile.ts');
    const compiled=compileStandardWholePackageProfile({...await readPinnedPackageForExecution(pkg,{...admitted,expectedManifestSha256:summary.manifest_sha256}),initialization_identity:admin});
    if(compiled.plan_sha256!==plan.planHash)throw Error('STREAM_PLAN_BINDING_INVALID');
    program={initialize:compiled.initialize,identity:{batchId:compiled.initialize.batch_id,documentBatchId:compiled.initialize.payload.document_batch_id,packageSha256:summary.manifest_sha256,planSha256:compiled.plan_sha256,namespace:compiled.initialize.namespace,cutoffAt:compiled.initialize.cutoff_at},steps:(async function*(){yield* compiled.steps})()};
   }else program=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin,{coalesce:flags.has('--coalesce')});
  };
  const historical=fresh35||manifestObject.schema_contract?.source_declarations_sha256===HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;
  if(!historical)await prepare();
  const config=await json(v['--connection'],true),encoded=decodeUtf8(await readBounded(v['--scrypt-file'],4096,true)).trim();
  if(!isNodeScryptPasswordHash(encoded))throw Error('PRIVATE_CREDENTIAL_FORMAT_INVALID');
  const openHost=fresh35?openReviewedFresh35Host:historical?openReviewedWholeSalesHost:openReviewedWholeHost;
  const execute=async(client,admission)=>{
   if(historical&&!productionReal)await prepare(admission);
   executionStarted=true;
   if(verifyOnly)return reconcileWholePackage(client,program.initialize,encoded,summary.counts,plan.totals);
   const kernel=createWholePackageSqlKernel(encoded,{explicitZeroApproval});
   if(flags.has('--inspect-only'))return{...await inspectWholePackage(client,program.identity,program.initialize,kernel),verification:{state:'NOT_RUN'}};
   const imported=await executeWholePackage(client,program.identity,program.initialize,program.steps,kernel);
   if(imported.state==='ROLLED_BACK')acknowledgedRollback=true;
   if(imported.state==='COMMITTED'||imported.state==='ALREADY_COMMITTED'){acknowledgedImport=imported.state;if(productionReal)return{...imported,verification:{state:'NOT_RUN'}};const verification=await reconcileWholePackage(client,program.initialize,encoded,summary.counts,plan.totals);return{...imported,verification}}
   return{...imported,verification:{state:'NOT_RUN'}};
  };
  const hostOptions={explicitZeroApproval,...(fresh35?{referenceDirectory:resolve(v['--fresh35-reference-inputs']),sourceProfileSha256:manifestObject.schema_contract.source_declarations_sha256}:{})};
  const prepareProduction=async admission=>{
   if(plan)await plan.dispose();await prepare(admission);
   // Independent cursors use the same pinned plan and original request keys.
   // No production stream is materialized or reused after it is exhausted.
   program={...program,steps:{async *[Symbol.asyncIterator](){const original=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin,{coalesce:flags.has('--coalesce')});yield* original.steps;}}};
   return {packageKind:manifestObject.package_kind,initialize:program.initialize,identity:program.identity,steps:program.steps,encodedScrypt:encoded};
  };
  let result=productionReal?await openReviewedFresh35ProductionHost(config,root,target,prepareProduction,execute,{...hostOptions,prepareOnly:flags.has('--prepare-only')}):await openHost(config,root,target,execute,hostOptions);
  if(productionReal&&acknowledgedImport){
   if(result.cleanup!=='CLOSED')return output={state:acknowledgedImport,connection_cleanup:result.cleanup,verification:{state:'VERIFICATION_UNKNOWN'}};
   const readback=await openReviewedFresh35ProductionHost(config,root,target,prepareProduction,client=>reconcileWholePackage(client,program.initialize,encoded,summary.counts,plan.totals),hostOptions);
   result={...result,result:{...result.result,verification:readback.cleanup==='CLOSED'?readback.result:{state:'VERIFICATION_UNKNOWN'},readback_connection_cleanup:readback.cleanup,readback_host_verification:readback.host_verification}};
  }
  const candidate={...result.result,...(productionReal?{target_profile:'FRESH35_PRODUCTION_REAL_IMPORT_V1'}:{}),...(fresh35?{host_verification:result.host_verification}:{}),connection_cleanup:result.cleanup,manifest_sha256:summary.manifest_sha256,plan_sha256:program.identity.planSha256,...(!verifyOnly||result.result?.state==='VERIFIED'?{source_counts:summary.counts,source_totals:plan.totals}:{})};
  try{assertPublicValuesExcludePrivateInputs(candidate,[config.password,encoded])}catch{
   const state=result.result?.state;
   if(acknowledgedRollback)return output={state:'ROLLED_BACK',code:'PUBLIC_OUTPUT_REDACTED',summary_redacted:true,connection_cleanup:result.cleanup,verification:{state:'NOT_RUN'}};
   if(state==='COMMITTED'||state==='ALREADY_COMMITTED')return output={state,summary_redacted:true,connection_cleanup:result.cleanup,verification:{state:'REDACTED'}};
   return output={state:verifyOnly?'VERIFICATION_UNKNOWN':'UNKNOWN',code:'PUBLIC_OUTPUT_REDACTED',connection_cleanup:result.cleanup,verification:{state:'REDACTED'}};
  }
  return output=candidate;
 }catch(error){
  if(acknowledgedRollback)return output={state:'ROLLED_BACK',code:'POST_ROLLBACK_HOST_FAILURE',verification:{state:'NOT_RUN'},connection_cleanup:'FAILED'};
  if(acknowledgedImport)return output={state:acknowledgedImport,code:'POST_COMMIT_HOST_FAILURE',verification:{state:'VERIFICATION_UNKNOWN'},connection_cleanup:'FAILED'};
  return output={state:executionStarted?(verifyOnly?'VERIFICATION_UNKNOWN':'UNKNOWN'):'NOT_STARTED',code:typeof error?.message==='string'&&SAFE_CODES.has(error.message)?error.message:(verifyOnly?'VERIFY_FAILED':'IMPORT_FAILED'),verification:'NOT_RUN'};
 }finally{try{await plan?.dispose()}catch{if(output)output.local_cleanup='FAILED'}}
}
