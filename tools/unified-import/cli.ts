#!/usr/bin/env node
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {FRESH35_RECEIVER_CAPABILITY} from './fresh35-receiver-diagnostics.ts';
import {V2CommittedReplyError,source49CheckpointMap,admitSource49Target,validateSource49TargetProof,admitUnifiedImportV2,executeUnifiedImportStepV2,resumeUnifiedImportStepV2,initializeUnifiedImportV2,recoverUnifiedImportOperationV2,verifyUnifiedImportReceiptsV2,verifyUnifiedImportStateV2} from '../../packages/application/src/unified-import-execution-v2-client.ts';
import type {Source49TargetProof} from '../../packages/application/src/unified-import-execution-v2-client.ts';
import {assertSource49SourceFiles} from './execution-v2-admission.ts';
import { isNodeScryptPasswordHash } from "../../packages/authentication/src/passwords.ts";
import { constants } from "node:fs";
import { mkdir, writeFile, realpath, readFile, open, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join, sep, basename, dirname } from "node:path";
import { connectStandardImportClient, validateStandardImportConnectionConfig, StandardImportTransportError, assertPublicValuesExcludePrivateInputs, assertStandardImportPackageScope } from "./execution-client.ts";
import { compileStandardImportProgram, executeUnifiedImportPlan, recoverUnifiedImportOperation, verifyUnifiedImportReceipts, verifyUnifiedImportState, resumeUnifiedImportStep, resumeUnifiedImportInitialization, admitReviewedStandardImportSuccessor, validateReviewedStandardImportSuccessorProof, REVIEWED_STANDARD44_TRANSITION, REVIEWED_STANDARD45_TRANSITION, REVIEWED_STANDARD46_TRANSITION, REVIEWED_STANDARD47_TRANSITION, assertReviewedStandardImportSuccessorCommand, UnifiedImportExecutionError, decodeStandardImportReply } from "../../packages/application/src/unified-import-execution.ts";
import type { StandardImportRequest, StandardImportCurrentAdmin, StandardImportReviewedSuccessorProof } from "../../packages/application/src/unified-import-execution.ts";
import {compileStandardImportProgramV2,STANDARD_IMPORT_PLAN_VERSION_V2} from "../../packages/application/src/unified-import-execution-v2.ts";
import { loadUnifiedImportPlan, loadUnifiedImportPlanV2 } from "./execution-plan.ts";
import type { StandardImportRegistration, StandardImportTarget } from "../../packages/application/src/unified-import-execution.ts";
import { parseStrictJson, decodeUtf8, findCredentialPath, sha256 } from "../../packages/application/src/unified-import-contract.ts";
import { inspectPackageDirectory } from "./package-reader.ts";
import type { DirectoryValidationOptions } from "./package-reader.ts";
// @ts-ignore Bounded read-only JavaScript CLI adapters, shared with stream-preflight.
import { readBoundedCliFile } from "./explicit-zero-cli-input.mjs";
// @ts-ignore This adapter validates an externally pinned review; it grants no execution authority.
import { readHistoricalHallCliApproval } from "./historical-hall-cli-input.mjs";
// @ts-ignore This adapter preserves reviewed original line values for offline reception only.
import { readHistoricalLineAmountCliEvidence } from "./historical-line-amount-cli-input.mjs";
// @ts-ignore This adapter verifies cutoff/document binding without inventing export time.
import { readCurrentEffectiveAlignmentCliEvidence } from "./current-effective-alignment-cli-input.mjs";
import { UNIFIED_PACKAGE_VERSION, WORK_PACKAGES, TABLE_SCHEMAS, STAFF_DEPARTURE_TABLE_SCHEMAS, STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256, HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS, HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256, NUMERIC_FIT_TABLE_SCHEMAS, NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256, SCHEMA_BASELINE_COMMIT, SCHEMA_DECLARATIONS_SHA256 } from "../../packages/application/src/unified-import-contract.ts";

const historicalSalesLegacyHint=(code:string)=>code==='SOURCE_PROFILE_OFFLINE_ONLY'?{
 state:'NOT_STARTED',business_database_writes:false,required_command:'whole-import',legacy_step_route_supported:false,
 message:'This historical source package requires whole-import with a trusted sales installation. It uses one whole-package transaction and does not run automatically. Legacy step requests and journals cannot be converted or resumed through that route.',
}:{};
const notImplemented=["rehearse","rollback-plan","prepare","dry-run","import","reconcile"];
const output=(value:unknown,status:number)=>{process.stdout.write(JSON.stringify(value,null,2)+"\n");process.exitCode=status;};
/** Conditional SQL49 path. No target is declared installed by a local file. */
async function runV2ExecutionCommand(command:string,args:string[]):Promise<void>{
 let close:(()=>Promise<void>)|undefined,activeOperation:string|null=null,acknowledged=false;
 try{
  const values:Record<string,string>={};let allowSynthetic=false;
  const allowed=['--execution-plan-version','--source49-target-proof','--target-proof','--connection-file','--session-file','--initialization-file','--current-admin-file','--package','--manifest-sha256','--registration','--request','--report'];
  for(let i=0;i<args.length;i++){const k=args[i]!,v=args[i+1];if(k==='--allow-synthetic'&&!allowSynthetic)allowSynthetic=true;else if(allowed.includes(k)&&!values[k]&&v&&!v.startsWith('--'))values[k]=args[++i]!;else throw new UnifiedImportExecutionError('SOURCE49_TARGET_PROFILE_UNVERIFIED');}
  if(values['--execution-plan-version']!=='V2'||!values['--source49-target-proof']||!values['--connection-file'])throw new UnifiedImportExecutionError('SOURCE49_TARGET_PROFILE_UNVERIFIED');
  const read=async(path:string,privateFile=true,limit=8*1024*1024):Promise<unknown>=>{const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>limit||privateFile&&((st.mode&0o077)!==0||typeof process.getuid==='function'&&st.uid!==process.getuid()))throw new UnifiedImportExecutionError('PRIVATE_INPUT_UNSAFE');const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await h.stat(),bytes=await h.readFile(),after=await h.stat();if(before.ino!==st.ino||before.dev!==st.dev||bytes.length!==st.size||after.mtimeMs!==before.mtimeMs)throw new UnifiedImportExecutionError('PRIVATE_INPUT_CHANGED');return parseStrictJson(decodeUtf8(bytes));}finally{await h.close();}};
  const proof=await read(values['--source49-target-proof']) as Source49TargetProof;validateSource49TargetProof(proof);
  await assertSource49SourceFiles(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
  if(values['--target-proof']&&requestHash(await read(values['--target-proof'],false))!==requestHash(proof.target))throw new UnifiedImportExecutionError('SOURCE49_TARGET_PROFILE_UNVERIFIED');
  const config=validateStandardImportConnectionConfig(await read(values['--connection-file']));let token:string|undefined;
  if(values['--session-file']){const raw=await read(values['--session-file']) as Record<string,unknown>;if(Object.keys(raw).join(',')!=='session_token'||typeof raw.session_token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw.session_token))throw new UnifiedImportExecutionError('PRIVATE_SESSION_INVALID');token=raw.session_token;}
  const initializing=['initialize','resume-initialize'].includes(command),input=initializing?await read(values['--initialization-file']??'') as Record<string,unknown>:undefined;
  const admin=command==='inspect-target'?undefined:(input?.admin??await read(values['--current-admin-file']??'')) as StandardImportCurrentAdmin;
  let registration:StandardImportRegistration|undefined;if(values['--registration']){const r=await read(values['--registration'],false) as Record<string,unknown>;registration=r.version==='C_NEW_TPLUS_BATCH_REGISTRATION_V1'?{batch_id:r.batchId as string,source_namespace:r.fixedSourceNamespace as string,source_metadata_sha256:r.sourceMetadataSha256 as string,cutoff_at:r.cutoffAt as string}:r as unknown as StandardImportRegistration;}
  const plan=command==='inspect-target'?undefined:await loadUnifiedImportPlanV2(values['--package']??'',{expectedManifestSha256:values['--manifest-sha256']??'',allowSynthetic,target:proof.target,initialization_identity:admin!,...(registration?{registration}:{})});
  if(plan)assertStandardImportPackageScope(plan.package_kind,config.scope);
  const program=plan?compileStandardImportProgramV2(plan):undefined,original=command==='status'?await read(values['--request']??'',false,32*1024*1024) as StandardImportRequest:undefined;
  assertPublicValuesExcludePrivateInputs({proof,plan:plan??null,program:program??null,original:original??null},[config.password,token,typeof input?.encoded_scrypt==='string'?input.encoded_scrypt:null]);
  if(initializing&&(config.role!=='erp_unified27_initializer_2393dbc6db9581c2'||typeof input?.encoded_scrypt!=='string'||!isNodeScryptPasswordHash(input.encoded_scrypt)||Object.keys(input).sort().join(',')!=='admin,encoded_scrypt'))throw new UnifiedImportExecutionError('INITIALIZER_PRIVATE_INPUT_REQUIRED');
  if(command!=='inspect-target'&&!initializing&&(config.role!=='erp_unified27_importer_2393dbc6db9581c2'||!token))throw new UnifiedImportExecutionError('IMPORTER_PRIVATE_SESSION_REQUIRED');
  if(['initialize','resume-initialize','apply','resume'].includes(command)&&!values['--report'])throw new UnifiedImportExecutionError('EXCLUSIVE_EXECUTION_JOURNAL_REQUIRED');
  const connected=await connectStandardImportClient(config,proof.target,{...(token?{sessionToken:()=>token!}:{}),...(plan?{source49CheckpointBinding:{format_version:'STANDARD_IMPORT_SQL49_CHECKPOINT_BINDING_V1' as const,plan_sha256:plan.plan_sha256,expected:source49CheckpointMap(plan)}}:{})});close=connected.close;
  const client=connected.client,profile=await admitSource49Target(client,proof),labels={execution_scope:'ISOLATED_SET_ROLE_PROOF_ONLY',source49_live_catalog_proven:true,execution_client_implemented:true,execution_engine_validated:false,portable_profile_implemented:false,production_login_capability:false};
  if(command==='inspect-target'){output({...await client.inspectTarget(),...labels},0);return;}
  const admission=await admitUnifiedImportV2(plan!,client,profile,initializing?'INITIALIZE':'IMPORT');
  if(command==='verify'){output({...await verifyUnifiedImportStateV2(plan!,client,admission),...labels,source_truth_certified:false,target_asset_publication_implemented:false},0);return;}
  if(command==='receipt-check'){output({...await verifyUnifiedImportReceiptsV2(plan!,client,admission),...labels,verification_scope:'IMMUTABLE_ORIGINAL_REQUEST_RECEIPTS_ONLY',full_verification:false},0);return;}
  if(command==='status'){output({...await recoverUnifiedImportOperationV2(plan!,client,admission,original!),...labels},0);return;}
  const packageRoot=await realpath(resolve(values['--package']!)),requested=resolve(values['--report']!);let ancestor=requested,tail:string[]=[];
  for(;;){try{ancestor=await realpath(ancestor);break;}catch{const parent=resolve(ancestor,'..');if(parent===ancestor)throw new Error();tail.unshift(basename(ancestor));ancestor=parent;}}
  const intended=join(ancestor,...tail);if(intended===packageRoot||intended.startsWith(packageRoot+sep))throw new UnifiedImportExecutionError('UNSAFE_REPORT_PATH');await mkdir(intended,{recursive:true});const report=await realpath(intended);if(report===packageRoot||report.startsWith(packageRoot+sep))throw new UnifiedImportExecutionError('UNSAFE_REPORT_PATH');
  const persist=async(name:string,value:unknown)=>{assertPublicValuesExcludePrivateInputs(value,[token,config.password,typeof input?.encoded_scrypt==='string'?input.encoded_scrypt:null]);const bytes=JSON.stringify(value,null,2)+'\n';try{await writeFile(join(report,name),bytes,{flag:'wx',mode:0o600});}catch(error){if(!['resume','resume-initialize'].includes(command)||error===null||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST'||JSON.stringify(await read(join(report,name),true,32*1024*1024),null,2)+'\n'!==bytes)throw new UnifiedImportExecutionError(acknowledged?'V2_COMMITTED_ACK_JOURNAL_FAILED':'EXECUTION_JOURNAL_CONFLICT');}};
  const results:unknown[]=[];
  if(initializing){const r=program!.initialize;activeOperation=r.operation_id;await persist(r.operation_id+'.request.json',r);const result=await initializeUnifiedImportV2(plan!,client,admission,input!.encoded_scrypt as string);acknowledged=true;await persist(r.operation_id+'.receipt.json',result);results.push(result);}else for(const step of program!.steps){activeOperation=step.request.operation_id;acknowledged=false;await persist(activeOperation+'.request.json',step.request);const result=command==='resume'?await resumeUnifiedImportStepV2(plan!,client,admission,step):await executeUnifiedImportStepV2(plan!,client,admission,step);acknowledged=true;await persist(activeOperation+'.receipt.json',result);results.push(result);}
  output({state:'COMMITTED',acknowledged_operations:results.length,plan_sha256:plan!.plan_sha256,...labels},0);
 }catch(error){output({code:error instanceof UnifiedImportExecutionError?error.code:'V2_EXECUTION_FAILED_CLOSED',...historicalSalesLegacyHint(error instanceof UnifiedImportExecutionError?error.code:''),operation_id:error instanceof StandardImportTransportError||error instanceof V2CommittedReplyError?error.operation_id:activeOperation,...(error instanceof StandardImportTransportError?{outcome:error.outcome,sqlstate:error.sqlstate}:error instanceof V2CommittedReplyError?{outcome:error.outcome}:acknowledged?{outcome:'COMMITTED_ACKNOWLEDGED_JOURNAL_INCOMPLETE'}:{}),execution_engine_validated:false,production_login_capability:false},1);}finally{if(close)try{await close();}catch{}}
}

const args=process.argv.slice(2),command=args.shift();
const capabilities={fresh35_execution:FRESH35_RECEIVER_CAPABILITY,historical_sales_execution:{ordinary_package_command:'whole-import',whole_package_command:'whole-import',streaming_command:'stream-import',verification_command:'stream-verify',legacy_step_commands_supported:false,installed_record_required:true,public_cli_end_to_end_validated:false},format_version:UNIFIED_PACKAGE_VERSION,tool_version:"0.2.0",schema_contract:{commit:SCHEMA_BASELINE_COMMIT,source_declarations_sha256:SCHEMA_DECLARATIONS_SHA256,proposed_contract_version:UNIFIED_PACKAGE_VERSION},offline:true,database_import_implemented:false,execution_client_implemented:true,v2_conditional_source49_client_implemented:true,v2_engine_validated:false,v2_portable_profile_implemented:false,execution_engine_validated:false,execution_scope:"ISOLATED_SET_ROLE_PROOF_ONLY",production_login_capability:false,stream_preflight_scope:"STANDARD_PACKAGE_OFFLINE_CHECKS_NOT_EXECUTION_ADMISSION",implemented:["stream-preflight","stream-prepare (offline only)","stream-import (PG acceptance not run)","source-registration (declaration only)","validate","plan --offline","inspect-target","initialize","resume-initialize","apply","status","resume","verify","receipt-check","version","capability-report","contract-schema"],not_implemented:notImplemented,work_packages:WORK_PACKAGES};
if(command==="help"||command==="--help"||command===undefined){output({...capabilities,usage:"node tools/unified-import/cli.mjs validate --package <directory> --offline [--report <directory>] [--allow-synthetic] [--manifest-sha256 <externally-frozen-sha256>] [--historical-hall-approval FILE --historical-hall-approval-sha256 SHA] [--historical-line-amount-evidence FILE --historical-line-amount-evidence-sha256 SHA] [--current-effective-alignment FILE --current-effective-alignment-sha256 SHA]",reviewed_evidence_scope:"OFFLINE_ONLY_REQUIRES_MANIFEST_PIN_NOT_SOURCE_TRUTH_CERTIFICATION"},0);}
else if(command==="contract-schema"){
  if(args.length===0) output({...capabilities,tables:TABLE_SCHEMAS},0);
  else if(args.length===2 && args[0]==="--profile" && args[1]==="numeric-fit-v1")
    output({...capabilities,profile:"numeric-fit-v1",schema_contract:{...capabilities.schema_contract,source_declarations_sha256:NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256},tables:NUMERIC_FIT_TABLE_SCHEMAS,numeric_fit_engine_validated:false},0);
  else if(args.length===2 && args[0]==="--profile" && args[1]==="staff-departure-v1")
    output({...capabilities,profile:"staff-departure-v1",schema_contract:{...capabilities.schema_contract,source_declarations_sha256:STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256},tables:STAFF_DEPARTURE_TABLE_SCHEMAS,staff_departure_engine_validated:false},0);
  else if(args.length===2 && args[0]==="--profile" && args[1]==="historical-sales-source-v1")
    output({...capabilities,profile:"historical-sales-source-v1",schema_contract:{...capabilities.schema_contract,source_declarations_sha256:HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256},tables:HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS,historical_sales_source_engine_validated:false,source_classification_is_independent_fact_proof:false},0);
  else output({code:"INVALID_CONTRACT_PROFILE",message:"Unknown contract profile; no import attempted."},1);
}
else if(command==="version"||command==="--version"||command==="capability-report"){output(capabilities,0);}
else if(notImplemented.includes(command)){output({code:"NOT_IMPLEMENTED",command,database_import_implemented:false,message:"This command is not implemented. No database connection or write was attempted."},3);}
else if(['inspect-target','initialize','resume-initialize','apply','status','resume','verify','receipt-check'].includes(command)&&args.includes('--execution-plan-version')){await runV2ExecutionCommand(command,args);}
else if(['inspect-target','initialize','resume-initialize','apply','status','resume','verify','receipt-check'].includes(command)){
  const values:Record<string,string>={};let allowSynthetic=false,error=false;
  const allowed=['--package','--manifest-sha256','--registration','--target-proof','--connection-file','--session-file','--initialization-file','--current-admin-file','--request','--report','--reviewed-successor'];
  for(let i=0;i<args.length;i++){
    const flag=args[i]!,next=args[i+1];
    if(flag==='--allow-synthetic'&&!allowSynthetic)allowSynthetic=true;
    else if(allowed.includes(flag)&&!values[flag]&&next&&!next.startsWith('--'))values[flag]=args[++i]!;
    else error=true;
  }
  let close:(()=>Promise<void>)|undefined;
  try{
    if(error||!values['--target-proof']||!values['--connection-file'])throw new UnifiedImportExecutionError('TARGET_PROFILE_UNVERIFIED');
    const readJson=async(path:string,isPrivate=false):Promise<unknown>=>{
      const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024||isPrivate&&((stat.mode&0o077)!==0||typeof process.getuid==='function'&&stat.uid!==process.getuid()))throw new UnifiedImportExecutionError('PRIVATE_INPUT_UNSAFE');
      const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await h.stat(),bytes=await h.readFile(),after=await h.stat();if(before.ino!==stat.ino||bytes.length!==stat.size||after.mtimeMs!==before.mtimeMs)throw new Error();return parseStrictJson(decodeUtf8(bytes));}finally{await h.close();}
    };
    if(values['--reviewed-successor']&&command==='apply')throw new UnifiedImportExecutionError('SUCCESSOR_RESUME_REQUIRED');
    if(values['--reviewed-successor']&&!['resume','status','verify','receipt-check'].includes(command))throw new UnifiedImportExecutionError('SUCCESSOR_EXISTING_PLAN_ONLY');
    const successor=values['--reviewed-successor']?await readJson(values['--reviewed-successor'],true) as StandardImportReviewedSuccessorProof:undefined;
    if(successor)assertReviewedStandardImportSuccessorCommand(successor,command);
    const target=await readJson(values['--target-proof']) as StandardImportTarget;
    const config=validateStandardImportConnectionConfig(await readJson(values['--connection-file'],true));
    let registration:StandardImportRegistration|undefined;
    if(values['--registration']){const r=await readJson(values['--registration']) as Record<string,unknown>;registration=r.version==='C_NEW_TPLUS_BATCH_REGISTRATION_V1'?{batch_id:r.batchId as string,source_namespace:r.fixedSourceNamespace as string,source_metadata_sha256:r.sourceMetadataSha256 as string,cutoff_at:r.cutoffAt as string}:r as unknown as StandardImportRegistration;}
    const plan=command==='inspect-target'?undefined:await loadUnifiedImportPlan(values['--package']??'',{expectedManifestSha256:values['--manifest-sha256']??'',allowSynthetic,target,...(registration?{registration}:{})});
    if(plan)assertStandardImportPackageScope(plan.package_kind,config.scope);

    if(successor){
      validateReviewedStandardImportSuccessorProof(plan!,successor);
      const sources=[['0027_standard_import_category_alias_successor.sql',REVIEWED_STANDARD44_TRANSITION.source_sha256]];
      if(successor.transition_id!==REVIEWED_STANDARD44_TRANSITION.id)sources.push(['0027_standard_import_settlement_identity_successor.sql',REVIEWED_STANDARD45_TRANSITION.source_sha256]);
      if(successor.transition_id===REVIEWED_STANDARD46_TRANSITION.id||successor.transition_id===REVIEWED_STANDARD47_TRANSITION.id)sources.push(['0027_standard_import_publish_verify_disambiguation_successor.sql',REVIEWED_STANDARD46_TRANSITION.source_sha256]);
      if(successor.transition_id===REVIEWED_STANDARD47_TRANSITION.id)sources.push(['0027_unified_live_history_dispatch_successor.sql',REVIEWED_STANDARD47_TRANSITION.source_sha256]);
      for(const [name,pin] of sources){const sourcePath=resolve(dirname(fileURLToPath(import.meta.url)),'../../adapters/postgres/patches/',name!);if(sha256(await readFile(sourcePath))!==pin)throw new UnifiedImportExecutionError('SUCCESSOR_SOURCE_FILE_PIN_MISMATCH');}
    }
    let secret:string|undefined;
    if(values['--session-file']){const raw=await readJson(values['--session-file'],true) as Record<string,unknown>;if(Object.keys(raw).join(',')!=='session_token'||typeof raw.session_token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw.session_token))throw new UnifiedImportExecutionError('PRIVATE_SESSION_INVALID');secret=raw.session_token;}
    const original=command==='status'?(values['--request']?await readJson(values['--request']) as StandardImportRequest:undefined):undefined;
    if(command==='status'&&!original)throw new UnifiedImportExecutionError('ORIGINAL_REQUEST_REQUIRED');
    const input=['initialize','resume-initialize'].includes(command)?await readJson(values['--initialization-file']??'',true) as Record<string,unknown>:undefined;
    const admin=(['initialize','resume-initialize','apply','resume','verify','receipt-check'].includes(command)||successor!==undefined)?(input?.admin??await readJson(values['--current-admin-file']??'',true)) as StandardImportCurrentAdmin:undefined;
    const program=admin?compileStandardImportProgram(plan!,admin):undefined;
    assertPublicValuesExcludePrivateInputs({plan:plan??null,program:program??null,original:original??null,successor:successor??null},[secret,typeof input?.encoded_scrypt==='string'?input.encoded_scrypt:null,config.password]);
    if(['initialize','resume-initialize'].includes(command)&&(config.role!=='erp_unified27_initializer_2393dbc6db9581c2'||typeof input?.encoded_scrypt!=='string'||!isNodeScryptPasswordHash(input.encoded_scrypt)||Object.keys(input).sort().join(',')!=='admin,encoded_scrypt'))throw new UnifiedImportExecutionError('INITIALIZER_PRIVATE_INPUT_REQUIRED');
    if(['apply','resume','verify','receipt-check'].includes(command)&&(config.role!=='erp_unified27_importer_2393dbc6db9581c2'||!secret))throw new UnifiedImportExecutionError('IMPORTER_PRIVATE_SESSION_REQUIRED');
    if(['initialize','resume-initialize','apply','resume'].includes(command)&&!values['--report'])throw new UnifiedImportExecutionError('EXCLUSIVE_EXECUTION_JOURNAL_REQUIRED');
    const connection=await connectStandardImportClient(config,successor?successor.successor_target:target,secret?{sessionToken:()=>secret!}:{});close=connection.close;const client=connection.client;
    const failed=successor?program!.steps.find(s=>s.request.operation_id===(successor.format_version==='STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1'?successor.publication_operation_id:successor.failed_operation_id)):undefined;
    if(successor&&!failed)throw new UnifiedImportExecutionError('SUCCESSOR_FAILED_REQUEST_NOT_IN_PROGRAM');
    const admission=successor?await admitReviewedStandardImportSuccessor(plan!,client,successor,program!.initialize,failed!.request):undefined;
    if(command==='inspect-target')output({...await client.inspectTarget(),execution_engine_validated:false,production_login_capability:false},0);
    else if(command==='status'){
      if(!values['--request'])throw new UnifiedImportExecutionError('ORIGINAL_REQUEST_REQUIRED');
      output(await recoverUnifiedImportOperation(plan!,client,original!,admission),0);
    }else{
      const requests=[program!.initialize,...program!.steps.map(s=>s.request)];
      if(command==='verify')output({...await verifyUnifiedImportState(plan!,client,program!.steps.at(-1)!.request,admission),package_kind:plan!.package_kind,source_truth_certified:false,target_asset_publication_implemented:false,execution_engine_validated:false,production_login_capability:false},0);
      else if(command==='receipt-check')output({...await verifyUnifiedImportReceipts(plan!,client,requests,new Map(),admission),verification_scope:'IMMUTABLE_ORIGINAL_REQUEST_RECEIPTS_ONLY',native_reconciliation_implemented:false,full_verification:false,production_login_capability:false},0);
      else{
        if(!values['--report'])throw new UnifiedImportExecutionError('EXCLUSIVE_EXECUTION_JOURNAL_REQUIRED');
        const packageRoot=await realpath(resolve(values['--package']!)),requested=resolve(values['--report']);
        let ancestor=requested,tail:string[]=[];for(;;){try{ancestor=await realpath(ancestor);break;}catch{const parent=resolve(ancestor,'..');if(parent===ancestor)throw new Error();tail.unshift(basename(ancestor));ancestor=parent;}}
        const intended=join(ancestor,...tail);if(intended===packageRoot||intended.startsWith(packageRoot+sep))throw new UnifiedImportExecutionError('UNSAFE_REPORT_PATH');
        await mkdir(intended,{recursive:true});const reportRoot=await realpath(intended);if(reportRoot===packageRoot||reportRoot.startsWith(packageRoot+sep))throw new UnifiedImportExecutionError('UNSAFE_REPORT_PATH');
        const persist=async(name:string,data:unknown)=>{const bytes=JSON.stringify(data,null,2)+'\n';try{await writeFile(join(reportRoot,name),bytes,{flag:'wx',mode:0o600});}catch(error){if(!['resume','resume-initialize'].includes(command)||error===null||typeof error!=='object'||!('code' in error)||error.code!=='EEXIST'||JSON.stringify(await readJson(join(reportRoot,name),true),null,2)+'\n'!==bytes)throw new UnifiedImportExecutionError('EXECUTION_JOURNAL_CONFLICT');}};
        const results:unknown[]=[];
        if(['initialize','resume-initialize'].includes(command)){
          if(config.role!=='erp_unified27_initializer_2393dbc6db9581c2'||typeof input?.encoded_scrypt!=='string'||!isNodeScryptPasswordHash(input.encoded_scrypt)||Object.keys(input).sort().join(',')!=='admin,encoded_scrypt')throw new UnifiedImportExecutionError('INITIALIZER_PRIVATE_INPUT_REQUIRED');
          await persist(program!.initialize.operation_id+'.request.json',program!.initialize);
          const result=command==='resume-initialize'?await resumeUnifiedImportInitialization(plan!,client,program!.initialize,input.encoded_scrypt):decodeStandardImportReply(await client.initialize(program!.initialize,input.encoded_scrypt),program!.initialize);
          if(result.state!=='COMMITTED')throw new UnifiedImportExecutionError('INITIALIZATION_NOT_COMMITTED');
          await persist(program!.initialize.operation_id+'.receipt.json',result);results.push(result);
        }else{
          if(config.role!=='erp_unified27_importer_2393dbc6db9581c2'||!secret)throw new UnifiedImportExecutionError('IMPORTER_PRIVATE_SESSION_REQUIRED');
          for(const step of program!.steps){
            await persist(step.request.operation_id+'.request.json',step.request);
            const result=command==='resume'?await resumeUnifiedImportStep(plan!,client,step,admission):(await executeUnifiedImportPlan(plan!,client,[step],admission))[0];
            await persist(step.request.operation_id+'.receipt.json',result);results.push(result);
          }
        }
        output({state:'COMMITTED',acknowledged_operations:results.length,package_kind:plan!.package_kind,plan_sha256:plan!.plan_sha256,...(admission?{reviewed_successor_proof_sha256:admission.proof_sha256,actual_catalog_sha256:admission.actual_target.catalog_sha256}:{}),execution_scope:'ISOLATED_SET_ROLE_PROOF_ONLY',production_login_capability:false},0);
      }
    }
  }catch(error){const code=error instanceof UnifiedImportExecutionError?error.code:'EXECUTION_FAILED_CLOSED';output({code,...(error instanceof StandardImportTransportError?{outcome:error.outcome,operation_id:error.operation_id,sqlstate:error.sqlstate}:{}),message:'Execution did not complete. Resolve original request keys on the exact pinned target; no automatic retry or fallback is performed.',production_login_capability:false,...historicalSalesLegacyHint(code)},1);}
  finally{if(close)try{await close();}catch{}}
}
else if(command==="plan"&&!args.includes("--offline")){output({code:"NOT_IMPLEMENTED",command,database_import_implemented:false,message:"Database-coupled planning is not yet validated. Use plan --offline with a frozen package; no database connection attempted."},3);}
else if(command==="plan"){
  let directory:string|undefined,manifestHash:string|undefined,reportDirectory:string|undefined,registrationPath:string|undefined,targetPath:string|undefined,adminPath:string|undefined,executionVersion:string|undefined,allowSynthetic=false,offline=false,error=false;
  for(let i=0;i<args.length;i++){
    const flag=args[i],next=args[i+1];
    if(flag==="--package"&&!directory&&next&&!next.startsWith("--"))directory=args[++i];
    else if(flag==="--manifest-sha256"&&!manifestHash&&next&&!next.startsWith("--"))manifestHash=args[++i];
    else if(flag==="--report"&&!reportDirectory&&next&&!next.startsWith("--"))reportDirectory=args[++i];
    else if(flag==="--registration"&&!registrationPath&&next&&!next.startsWith("--"))registrationPath=args[++i];
    else if(flag==="--target-proof"&&!targetPath&&next&&!next.startsWith("--"))targetPath=args[++i];
    else if(flag==="--execution-plan-version"&&!executionVersion&&next&&!next.startsWith("--"))executionVersion=args[++i];
    else if(flag==="--current-admin-file"&&!adminPath&&next&&!next.startsWith("--"))adminPath=args[++i];
    else if(flag==="--allow-synthetic"&&!allowSynthetic)allowSynthetic=true;
    else if(flag==="--offline"&&!offline)offline=true;
    else error=true;
  }
  if(error||!directory||!manifestHash||!offline||executionVersion!==undefined&&!["V1","V2"].includes(executionVersion)||(executionVersion==="V2"?!adminPath:adminPath!==undefined))output({code:"INVALID_ARGUMENTS",message:"plan requires --package, --manifest-sha256 and --offline; optional --registration, --target-proof, --report, --allow-synthetic. Explicit --execution-plan-version V2 requires nonsecret --current-admin-file and remains offline-only. DB credentials are prohibited."},2);
  else try{
    const metadata=async(path:string):Promise<unknown>=>{const bytes=await readFile(path);if(bytes.length>65536)throw new Error();const value=parseStrictJson(decodeUtf8(bytes));if(findCredentialPath(value))throw new Error();return value;};
    let registration:StandardImportRegistration|undefined;
    if(registrationPath){const raw=await metadata(registrationPath) as Record<string,unknown>;
      if(raw.version==='C_NEW_TPLUS_BATCH_REGISTRATION_V1')registration={batch_id:raw.batchId as string,source_namespace:raw.fixedSourceNamespace as string,source_metadata_sha256:raw.sourceMetadataSha256 as string,cutoff_at:raw.cutoffAt as string};
      else registration=raw as unknown as StandardImportRegistration;
    }
    const target=targetPath?await metadata(targetPath) as StandardImportTarget:undefined;
    let identity:StandardImportCurrentAdmin|undefined;
    if(adminPath){const st=await lstat(adminPath);if(!st.isFile()||st.isSymbolicLink()||st.size>65536||(st.mode&0o077)!==0||typeof process.getuid==='function'&&st.uid!==process.getuid())throw new Error();const h=await open(adminPath,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await h.stat(),bytes=await h.readFile(),after=await h.stat();if(before.ino!==st.ino||before.dev!==st.dev||bytes.length!==st.size||after.mtimeMs!==before.mtimeMs)throw new Error();const value=parseStrictJson(decodeUtf8(bytes));if(findCredentialPath(value))throw new Error();identity=value as StandardImportCurrentAdmin;}finally{await h.close();}}
    const options={expectedManifestSha256:manifestHash,allowSynthetic,...(registration?{registration}:{}),...(target?{target}:{})};
    const plan=executionVersion==='V2'?await loadUnifiedImportPlanV2(directory,{...options,initialization_identity:identity!}):await loadUnifiedImportPlan(directory,options);
    const program=plan.format_version===STANDARD_IMPORT_PLAN_VERSION_V2?compileStandardImportProgramV2(plan):undefined;
    if(reportDirectory){
      const packageRoot=await realpath(resolve(directory)),requestedRoot=resolve(reportDirectory);
      let ancestor=requestedRoot,tail:string[]=[];
      for(;;){try{ancestor=await realpath(ancestor);break;}catch{const parent=resolve(ancestor,'..');if(parent===ancestor)throw new Error();tail.unshift(basename(ancestor));ancestor=parent;}}
      const intendedRoot=join(ancestor,...tail);if(intendedRoot===packageRoot||intendedRoot.startsWith(packageRoot+sep))throw new Error();
      await mkdir(intendedRoot,{recursive:true});const reportRoot=await realpath(intendedRoot);if(reportRoot===packageRoot||reportRoot.startsWith(packageRoot+sep))throw new Error();
      await writeFile(join(reportRoot,'execution-plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
      if(program){await writeFile(join(reportRoot,'execution-program.json'),JSON.stringify(program,null,2)+'\n',{flag:'wx',mode:0o600});await writeFile(join(reportRoot,'master-chunk-plan.json'),JSON.stringify(program.master_schedule,null,2)+'\n',{flag:'wx',mode:0o600});}
    }
    output({format_version:plan.format_version,protocol:plan.protocol,package_kind:plan.package_kind,plan_sha256:plan.plan_sha256,manifest_sha256:plan.manifest_sha256,source_namespace:plan.source_namespace,cutoff_at:plan.cutoff_at,baseline_batch_id:plan.baseline_batch_id,document_batch_id:plan.document_batch_id,counts:plan.counts,admission_issues:plan.admission_issues,target_bound:plan.target!==null,database_import_implemented:false,execution_engine_validated:false,...(program?{execution_scope:program.execution_scope,master_chunks:program.master_schedule.chunks.length,master_chunk_plan_sha256:program.master_schedule.chunk_plan_sha256,program_sha256:program.program_sha256,initialization_identity_bound:true,server_v2_execution_implemented:false,current_server_master_total_limit:500,target_asset_publication_implemented:false}:{}),message:program?'Offline V2 plan/program compiled from standard V1 bytes. Current SQL/client still reject large apply; no database connection or execution occurred.':'Offline plan compiled from frozen ordinary-package bytes. No database connection or execution occurred.'},plan.admission_issues.length?1:0);
  }catch{output({code:'EXECUTION_PLAN_FAILED_CLOSED',database_import_implemented:false,message:'Package, registration, target proof or exclusive report output failed validation; no database connection attempted.'},1);}
}
else if(command!=="validate"){output({code:"INVALID_ARGUMENTS",message:"Unknown command; use help"},2);}
else {
  let directory:string|undefined,allowSynthetic=false,manifestHash:string|undefined,reportDirectory:string|undefined,error=false,offline=false;
  const evidenceFlags=['historical-hall-approval','historical-line-amount-evidence','current-effective-alignment'];
  const evidenceOptions:Record<string,string>={};
  const evidenceOptionNames=new Set(evidenceFlags.flatMap(flag=>['--'+flag,'--'+flag+'-sha256']));
  for(let i=0;i<args.length;i++){
    const flag=args[i],next=args[i+1];
    if(flag==="--package"&&!directory&&next&&!next.startsWith("--"))directory=args[++i];
    else if(flag==="--allow-synthetic"&&!allowSynthetic)allowSynthetic=true;
    else if(flag==="--offline"&&!offline)offline=true;
    else if(flag==="--report"&&!reportDirectory&&next&&!next.startsWith("--"))reportDirectory=args[++i];
    else if(flag==="--manifest-sha256"&&manifestHash===undefined&&next&&!next.startsWith("--"))manifestHash=args[++i];
    else if(flag&&evidenceOptionNames.has(flag)&&!Object.hasOwn(evidenceOptions,flag)&&next&&!next.startsWith("--"))evidenceOptions[flag]=args[++i]!;
    else error=true;
  }
  const hasEvidence=Object.keys(evidenceOptions).length>0;
  if(evidenceFlags.some(flag=>Boolean(evidenceOptions['--'+flag])!==Boolean(evidenceOptions['--'+flag+'-sha256'])))error=true;
  if(hasEvidence&&(!offline||!manifestHash||!/^[a-f0-9]{64}$/.test(manifestHash)))error=true;
  if(error||!directory)output({code:"INVALID_ARGUMENTS",message:"Expected only offline validation options; each reviewed evidence file requires its separate SHA, --offline and --manifest-sha256. Credentials/DB options are prohibited"},2);
  else try {
    const options:DirectoryValidationOptions={allowSynthetic,...(manifestHash?{expectedManifestSha256:manifestHash}:{})};
    if(hasEvidence){
      const bytes=await readBoundedCliFile(join(directory,'manifest.json'),2*1024*1024);
      if(sha256(bytes)!==manifestHash)throw Error('MANIFEST_HASH_MISMATCH');
      const manifest=parseStrictJson(decodeUtf8(bytes));
      if(evidenceOptions['--historical-hall-approval'])options.historicalSalesHallApproval=await readHistoricalHallCliApproval(directory,manifest,evidenceOptions['--historical-hall-approval'],evidenceOptions['--historical-hall-approval-sha256']);
      if(evidenceOptions['--historical-line-amount-evidence'])options.historicalLineAmountEvidence=await readHistoricalLineAmountCliEvidence(directory,manifest,evidenceOptions['--historical-line-amount-evidence'],evidenceOptions['--historical-line-amount-evidence-sha256']);
      if(evidenceOptions['--current-effective-alignment'])options.currentEffectiveAlignmentEvidence=await readCurrentEffectiveAlignmentCliEvidence(directory,manifest,evidenceOptions['--current-effective-alignment'],evidenceOptions['--current-effective-alignment-sha256']);
    }
    const report=await inspectPackageDirectory(directory,options);
    if(reportDirectory){
      const packageRoot=await realpath(resolve(directory)),requestedRoot=resolve(reportDirectory);
      let ancestor=requestedRoot,tail:string[]=[];
      for(;;){try{ancestor=await realpath(ancestor);break;}catch{const parent=resolve(ancestor,"..");if(parent===ancestor)throw new Error();tail.unshift(basename(ancestor));ancestor=parent;}}
      const intendedRoot=join(ancestor,...tail);
      if(intendedRoot===packageRoot||intendedRoot.startsWith(packageRoot+sep)){output({code:"UNSAFE_REPORT_PATH",message:"Report directory must be outside immutable standard package"},2);}
      else {await mkdir(intendedRoot,{recursive:true});const reportRoot=await realpath(intendedRoot);if(reportRoot===packageRoot||reportRoot.startsWith(packageRoot+sep))throw new Error();try{await writeFile(join(reportRoot,"validation-report.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});output(report,report.valid?0:1);}catch{output({code:"REPORT_NOT_WRITTEN",message:"Report cannot be created; existing reports are never overwritten",database_import_implemented:false},2);}}
    }else output(report,report.valid?0:1);
  }catch{output({code:"PREFLIGHT_FAILED_CLOSED",message:"Unreadable or malformed standard package; no database action attempted",database_import_implemented:false},1);}
}
