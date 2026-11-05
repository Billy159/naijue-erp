/** Source-only new-empty rewrite installation plan. No connections or authority
 * are created by loading a plan. Retained legacy15 is a different lineage. */
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPairedSourcePlan,assertPlan,sourceCohortFor} from '../../../tests/performance/opt02/current-native-stock/reference-compiler-cohort-v2/source-cohort.mjs';
import {captureData} from '../../../tests/integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';

export const BASE=Object.freeze({commit:'e6a03c9fda216a45fb4f904568a28f797c9e94dd',tree:'e62e85e4a5f7ae7e30b382543941b7635c4abcb8'});
export const ROOT=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const plans=new WeakMap();
export const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const nativePath='adapters/postgres/src/native-import-accounting-capability.ts';
export async function sourceFile(root,relative){const full=path.join(root,relative),s=await lstat(full);need(s.isFile()&&!s.isSymbolicLink()&&await realpath(full)===full&&s.size<=8*1024*1024,'CANONICAL_BOUNDED_SOURCE_FILE_REQUIRED');return readFile(full);}
export async function loadUnifiedInstallPlan(input){
 const a=captureData(input,['sourceRoot','baseCommit','baseTree','requestedScope']);
 need(a.baseCommit===BASE.commit&&a.baseTree===BASE.tree,'EXACT_UNIFIED_BASE_REQUIRED');
 need(['SCHEMA_ONLY','COMPONENT339','FULL_APPLICATION'].includes(a.requestedScope),'EXPLICIT_INSTALL_SCOPE_REQUIRED');
 const {plan,cohort}=await loadPairedSourcePlan({sourceRoot:a.sourceRoot});assertPlan(plan);
 // The paired origin keeps its immutable brands/pins. Verify selected SQL also
 // exists byte-for-byte in the new unified base; never repin the old native module.
 for(const f of plan.files)need(hash(await sourceFile(ROOT,f.path))===f.sha256,'UNIFIED_SELECTED_SQL_DIFFERS:'+f.path);
 const native=await sourceFile(ROOT,nativePath);
 need(hash(native)==='87f306e32e78961c3bd7bf6a4ae2a915419402ff7d84e94e1425fc2d7ed884fe','UNIFIED_METADATA_SOURCE_CHANGED');
 const graph=plan.files.map((f,i)=>({ordinal:i+1,path:f.path,sha256:f.sha256,predecessor:i?plan.files[i-1].sha256:null,
  kind:i<26?'REWRITE_MIGRATION':'EXPLICIT_SELECTED_SUCCESSOR_PATCH',migrationId:i<26?i+1:null,
  originalStatements:f.statements.length,specialCarrier:f.path===cohort.sourcePlan.V22?'ORIGINAL_131_PARENT_MEMBER_NEW_TARGET_GUARD':null}));
 const sourceSummary={base:BASE,pairedOrigin:{root:cohort.root,inputBindingSha256:cohort.inputBindingSha256,sourceFingerprint:plan.sourceFingerprint},
  requestedScope:a.requestedScope,lineage:'NEW_EMPTY_REWRITE26_NOT_LEGACY15',graph,
  routines:plan.routines.map(r=>({signature:r.signature,bodySha256:r.bodySha256,source:r.source})),
  expected:{files:40,migrationIds:Array.from({length:26},(_,i)=>i+1),originalLedgerStatements:718,submittedOriginalStatementsExcludingV22:714,v22ParentRoutines:131,finalRoutines:137,userTables:56,userColumns:584},
  metadataSource:{path:nativePath,sha256:hash(native)},
  finalObservationProfile:'HISTORY_DRAFT_SEQUENCE_SYSTEM_ACL_V1',
  sourceProfiles:Object.fromEntries(['V6','V7','V8','HISTORY'].map(k=>[k,{routines:plan.inventory.profiles[k].expectedRoutineCount,probeSha256:plan.inventory.profiles[k].probeSha256,files:plan.inventory.profiles[k].sourceChain.length}])),
  preparationTransitions:[{from:'INDEPENDENTLY_PROVED_V5',to:'V6',api:'renderRuntime26V6Preparation',replayAfterFinal40:false},{from:'INDEPENDENTLY_PROVED_V6_135',to:'V7_137',api:'renderRuntime26V7Preparation',replayAfterFinal40:false},{from:'INDEPENDENTLY_PROVED_V7',to:'V8',api:'renderRuntime26V8Preparation',replayAfterFinal40:false}],
  acl:{schemaPhase:'OWNER_ONLY_NO_RUNTIME_LOGIN_OR_BUSINESS_ACL',component339:'REQUIRES_SEPARATE_TARGET_SPECIFIC_REVIEW_NOT_RENAMED_DOT_POLICY',fullApplication:'NOT_ESTABLISHED_BY_COMPONENT339'},
  missingForRequestedScope:a.requestedScope==='SCHEMA_ONLY'?[]:['TARGET_SPECIFIC_REVIEWED_ACL_SOURCE_AND_COMPLETE_NEGATIVE_MATRIX','GENERIC_RUNTIME_LOGIN_SECRET_REFERENCE_AND_FINAL_ROLE_GUARD','INDEPENDENT_EXACT_TARGET_CATALOG_AND_RUNTIME_PURPOSE_REVIEW',...(a.requestedScope==='FULL_APPLICATION'?['FULL_APPLICATION_SQL_PERMISSION_AND_AUTHENTICATION_ADMISSION']:[])],
  phaseA:{status:'HANDOFF_REPORT_SAYS_RESTORED_AND_STOPPED',reportedReceiptSha256:'503a103fd20ed01e0ee0b8d6ca787dc83d38f906aec1f641be3f306f58de5180',rawReceiptLocallyVerified:false,repeatedRestoreAuthorized:false},
  installed:false,ordinaryLogin:false,erpEmployeeLogin:false,productionAuthorized:false};
 const descriptor=freeze({...sourceSummary,planSha256:hash(JSON.stringify(sourceSummary)),status:a.requestedScope==='SCHEMA_ONLY'?'SOURCE_PLAN_READY_REQUIRES_FRESH_TARGET_AND_EXTERNAL_EXECUTION_APPROVAL':'BLOCKED_REVIEWED_ACL_INPUTS_REQUIRED'});
 const result=Object.freeze({profile:'UNIFIED_SOURCE_INSTALL_PLAN_V1'});plans.set(result,{plan,cohort,descriptor});return result;
}
export function unifiedInstallPlanData(value){need(plans.has(value),'GENUINE_UNIFIED_INSTALL_SOURCE_PLAN_REQUIRED');return plans.get(value);}
export function describeUnifiedInstallPlan(value){return unifiedInstallPlanData(value).descriptor;}
export async function assertUnifiedInstallSources(value){const s=unifiedInstallPlanData(value);await s.cohort.sourcePlan.assertSources(s.plan);for(const f of s.plan.files)need(hash(await sourceFile(ROOT,f.path))===f.sha256,'UNIFIED_SQL_CHANGED:'+f.path);need(hash(await sourceFile(ROOT,nativePath))===s.descriptor.metadataSource.sha256,'UNIFIED_METADATA_SOURCE_CHANGED');}
