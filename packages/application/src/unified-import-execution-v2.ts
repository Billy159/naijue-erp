import {sha256} from './unified-import-contract.ts';
import {requestHash} from './request-hash.ts';
import {stableImportId} from './inventory-cutoff-import.ts';
import {TABLE_SCHEMAS,findCredentialPath} from './unified-import-contract.ts';
import {buildUnifiedImportPlan,buildWholePackageSourcePlan,materializeStandardImportProgram,STANDARD_IMPORT_PLAN_VERSION,STANDARD_IMPORT_PROTOCOL,STANDARD_MASTER_TABLES,validateStandardImportTarget,UnifiedImportExecutionError} from './unified-import-execution.ts';
import type {BuildUnifiedImportPlanInput,UnifiedImportPlan,StandardImportCurrentAdmin,StandardImportRequest,StandardImportProgram} from './unified-import-execution.ts';
import {MASTER_CHUNK_PLAN_V2,planMasterChunksV2} from './unified-import-master-chunks-v2.ts';
import type {MasterChunkPlanV2} from './unified-import-master-chunks-v2.ts';

export const STANDARD_IMPORT_PLAN_VERSION_V2='UNIFIED_STANDARD_EXECUTION_PLAN_V2' as const;
export const STANDARD_IMPORT_COMPILER_V2='DEPENDENCY_ORDERED_STANDARD_PROGRAM_V2' as const;
const mode='NEW_EMPTY_V2' as const,scope='OFFLINE_V2_NOT_DATABASE' as const;
const maxInt=2147483647;
function need(v:unknown,code:string):asserts v {if(!v)throw new UnifiedImportExecutionError(code);}
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const plain=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keys=(v:object,expected:string)=>Object.keys(v).sort().join(',')===expected;
const freeze=<T>(value:T):T=>{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export interface V2ProgressBounds {baseline_cursor:number;document_cursor:number;baseline_final_sequence:number;document_final_sequence:number;}
export function checkV2ProgressBounds(c:{master:number;keys:number;effects:number;document_rows:number;document_aggregates:number;master_chunks:number;key_chunks:number}):V2ProgressBounds {
 need(plain(c)&&keys(c,'document_aggregates,document_rows,effects,key_chunks,keys,master,master_chunks')&&Object.values(c).every(n=>Number.isSafeInteger(n)&&n>=0&&n<=maxInt)&&c.effects<=c.keys&&c.master_chunks<=c.master&&c.key_chunks===Math.ceil(c.keys/100)&&c.document_aggregates<=c.document_rows,'V2_PROGRESS_COUNTER_INVALID');
 const baseline=BigInt(c.master)+BigInt(c.keys)+BigInt(c.effects)+2n,documents=BigInt(c.document_rows)+1n,baselineSequence=BigInt(c.master_chunks)+BigInt(c.key_chunks)+1n,documentSequence=BigInt(c.document_aggregates)+1n;
 // audit_change.new_version is checkpoint.sequence+1 (existing int32 column).
 need([baseline,documents].every(n=>n<=BigInt(maxInt))&&[baselineSequence,documentSequence].every(n=>n<=BigInt(maxInt-1)),'V2_PROGRESS_COUNTER_OVERFLOW');
 return{baseline_cursor:Number(baseline),document_cursor:Number(documents),baseline_final_sequence:Number(baselineSequence),document_final_sequence:Number(documentSequence)};
}
export interface UnifiedImportPlanV2 extends Omit<UnifiedImportPlan,'format_version'> {
 format_version:typeof STANDARD_IMPORT_PLAN_VERSION_V2;execution_mode:typeof mode;compiler_version:typeof STANDARD_IMPORT_COMPILER_V2;scheduler_version:typeof MASTER_CHUNK_PLAN_V2;
 source_plan_sha256:string;initialization_identity:StandardImportCurrentAdmin;max_master_chunk_rows:number;master_schedule_layout:string[][];master_schedule_layout_sha256:string;progress_bounds:V2ProgressBounds;
}
export interface BuildUnifiedImportPlanInputV2 extends BuildUnifiedImportPlanInput {initialization_identity:StandardImportCurrentAdmin;max_master_chunk_rows?:number;}
export interface StandardImportProgramV2 extends StandardImportProgram {format_version:'UNIFIED_STANDARD_EXECUTION_PROGRAM_V2';execution_scope:typeof scope;master_schedule:MasterChunkPlanV2;program_sha256:string;}
function validateIdentityAndReferences(source:Pick<UnifiedImportPlan,'master_rows'|'document_rows'|'admission_issues'>,identity:StandardImportCurrentAdmin):void {
 need(plain(identity)&&keys(identity,'account_id,login_name,staff_id,staff_name')&&uuid(identity.staff_id)&&uuid(identity.account_id)&&typeof identity.login_name==='string'&&identity.login_name.trim().length>0&&Buffer.byteLength(identity.login_name,'utf8')<=256&&!identity.login_name.includes('\0')&&typeof identity.staff_name==='string'&&identity.staff_name.trim().length>0&&!identity.staff_name.includes('\0')&&!findCredentialPath(identity),'V2_INITIALIZATION_IDENTITY_INVALID');
 need(source.admission_issues.length===0,'TARGET_PROFILE_ADMISSION_BLOCKED');
 need(!source.master_rows.some(r=>r.table==='staff'&&r.record.fields.id===identity.staff_id),'V2_INITIALIZATION_STAFF_SOURCE_COLLISION');
 const rows=[...source.master_rows.map(r=>({table:r.table,record:r.record})),...Object.entries(source.document_rows).flatMap(([table,records])=>records.map(record=>({table,record})))];
 // A new technical administrator is never an alias/proof for a historical actor.
 for(const {table,record}of rows)for(const [field,rule]of Object.entries(TABLE_SCHEMAS[table]!))if(rule.reference==='user_account')need(record.fields[field]===null,'V2_HISTORICAL_ACCOUNT_REFERENCE_UNSUPPORTED');
}
function scheduleFor(plan:Pick<UnifiedImportPlanV2,'source_namespace'|'manifest_sha256'|'baseline_batch_id'|'master_rows'|'max_master_chunk_rows'>,executionHash:string):MasterChunkPlanV2 {
 return planMasterChunksV2({format_version:MASTER_CHUNK_PLAN_V2,source_namespace:plan.source_namespace,package_manifest_sha256:plan.manifest_sha256,execution_plan_sha256:executionHash,baseline_batch_id:plan.baseline_batch_id,master_rows:plan.master_rows,max_chunk_rows:plan.max_master_chunk_rows});
}
function progressFor(source:Pick<UnifiedImportPlan,'master_rows'|'baseline_rows'|'document_rows'|'counts'>,chunks:number):V2ProgressBounds {
 return checkV2ProgressBounds({master:source.master_rows.length,keys:source.baseline_rows.length,effects:source.baseline_rows.filter(r=>r.fields.quantity!=='0').length,document_rows:Object.values(source.document_rows).reduce((n,rows)=>n+rows.length,0),document_aggregates:source.counts.sales_headers+source.counts.transfer_headers,master_chunks:chunks,key_chunks:Math.ceil(source.baseline_rows.length/100)});
}
/** Same standard V1 intake; V2 versions execution identity ONLY, never data rules. */
export function buildUnifiedImportPlanV2(input:BuildUnifiedImportPlanInputV2):UnifiedImportPlanV2 {
 return buildV2FromValidatedSource(buildUnifiedImportPlan(input),input);
}
/** Explicit whole compiler only; default V2 retains the legacy source restriction. */
export function buildWholePackageSourcePlanV2(input:BuildUnifiedImportPlanInputV2):UnifiedImportPlanV2 {
 return buildV2FromValidatedSource(buildWholePackageSourcePlan(input),input);
}
function buildV2FromValidatedSource(source:UnifiedImportPlan,input:BuildUnifiedImportPlanInputV2):UnifiedImportPlanV2 {
 const bound=input.max_master_chunk_rows??500;
 // Validate the original object before cloning can erase a non-plain prototype.
 validateIdentityAndReferences(source,input.initialization_identity);
 const identity=structuredClone(input.initialization_identity);
 // Only the row layout from this valid source-base digest is retained. Provisional
 // chunk IDs/digest are discarded; they are never requests or final plan inputs.
 const first=scheduleFor({...source,max_master_chunk_rows:bound},source.plan_sha256),layout=first.chunks.map(c=>c.rows.map(r=>r.source_record_id));
 const {plan_sha256:sourceHash,format_version:_oldFormat,...facts}=source;
 const payload={...facts,format_version:STANDARD_IMPORT_PLAN_VERSION_V2,execution_mode:mode,compiler_version:STANDARD_IMPORT_COMPILER_V2,scheduler_version:MASTER_CHUNK_PLAN_V2,source_plan_sha256:sourceHash,initialization_identity:identity,max_master_chunk_rows:bound,master_schedule_layout:layout,master_schedule_layout_sha256:requestHash(layout),progress_bounds:progressFor(source,first.chunks.length)};
 const plan:UnifiedImportPlanV2={...payload,plan_sha256:requestHash(payload)};validateAndSchedule(plan);return freeze(plan);
}
function validateAndSchedule(plan:UnifiedImportPlanV2):MasterChunkPlanV2 {
 need(plain(plan)&&keys(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='historical_staff_hall_approval'&&key!=='historical_hall_approval'&&key!=='explicit_zero_approval')),'admission_issues,alignment_sha256,baseline_batch_id,baseline_rows,compiler_version,counts,cutoff_at,document_batch_id,document_rows,execution_mode,format_version,identity_registry,initialization_identity,manifest_sha256,master_rows,master_schedule_layout,master_schedule_layout_sha256,max_master_chunk_rows,package_kind,plan_sha256,progress_bounds,protocol,registry_sha256,scheduler_version,source_metadata_sha256,source_namespace,source_plan_sha256,table_files,target'),'V2_PLAN_SHAPE_INVALID');
 if(plan.explicit_zero_approval!==undefined){const a=plan.explicit_zero_approval;need(plain(a)&&keys(a,'cutoff_at,format_version,inventory_file_sha256,merkle_root_sha256,record_count,sha256,source_namespace')&&a.format_version==='EXPLICIT_ZERO_APPROVAL_MERKLE_V1'&&digest(a.sha256)&&digest(a.inventory_file_sha256)&&digest(a.merkle_root_sha256)&&a.cutoff_at===plan.cutoff_at&&a.source_namespace===plan.source_namespace&&Number.isSafeInteger(a.record_count)&&a.record_count>0,'EXPLICIT_ZERO_APPROVAL_BINDING_INVALID');}
 if(plan.historical_staff_hall_approval!==undefined){const approval=plan.historical_staff_hall_approval;need(plain(approval)&&keys(approval,'sha256,utf8')&&typeof approval.utf8==='string'&&digest(approval.sha256)&&sha256(Buffer.from(approval.utf8,'utf8'))===approval.sha256,'STAFF_HALL_APPROVAL_HASH');}
 if(plan.historical_hall_approval!==undefined){const approval=plan.historical_hall_approval;need(plain(approval)&&keys(approval,'sha256,utf8')&&typeof approval.utf8==='string'&&digest(approval.sha256)&&sha256(Buffer.from(approval.utf8,'utf8'))===approval.sha256,'HISTORICAL_HALL_APPROVAL_HASH');}
 const {plan_sha256,...payload}=plan;
 need(plan.format_version===STANDARD_IMPORT_PLAN_VERSION_V2&&plan.execution_mode===mode&&plan.compiler_version===STANDARD_IMPORT_COMPILER_V2&&plan.scheduler_version===MASTER_CHUNK_PLAN_V2&&plan.protocol===STANDARD_IMPORT_PROTOCOL&&digest(plan_sha256)&&requestHash(payload)===plan_sha256&&!findCredentialPath(plan),'V2_PLAN_CONTENT_MISMATCH');
 const {format_version:_version,execution_mode:_mode,compiler_version:_compiler,scheduler_version:_scheduler,source_plan_sha256,initialization_identity,max_master_chunk_rows:_bound,master_schedule_layout:_layout,master_schedule_layout_sha256:_layoutHash,progress_bounds:_progress,...facts}=payload;
 need(digest(source_plan_sha256)&&requestHash({...facts,format_version:STANDARD_IMPORT_PLAN_VERSION})===source_plan_sha256,'V2_SOURCE_PLAN_BINDING_MISMATCH');
 if(plan.target!==null)validateStandardImportTarget(plan.target);
 validateIdentityAndReferences(plan,initialization_identity);
 const c=plan.counts;
 need(c.master_files===STANDARD_MASTER_TABLES.length&&c.master_occurrences===plan.master_rows.length&&c.explicit_keys===plan.baseline_rows.length&&c.sales_headers===plan.document_rows.sales_header!.length&&c.sales_lines===plan.document_rows.sales_line!.length&&c.sales_settlements===plan.document_rows.sales_settlement!.length&&c.transfer_headers===plan.document_rows.transfer_header!.length&&c.transfer_lines===plan.document_rows.transfer_line!.length,'V2_PLAN_COUNTS_MISMATCH');
 const schedule=scheduleFor(plan,plan_sha256),layout=schedule.chunks.map(c=>c.rows.map(r=>r.source_record_id));
 need(requestHash(layout)===plan.master_schedule_layout_sha256&&requestHash(plan.master_schedule_layout)===plan.master_schedule_layout_sha256,'V2_MASTER_LAYOUT_MISMATCH');
 need(requestHash(progressFor(plan,schedule.chunks.length))===requestHash(plan.progress_bounds),'V2_PROGRESS_BOUND_MISMATCH');return schedule;
}
export function assertUnifiedImportPlanV2(plan:UnifiedImportPlanV2):void {validateAndSchedule(plan);}
/** Pure OFFLINE compiler. Current SQL/client execution remains V1-only and capped
 * at500 total masters. These requests are not a DB execution capability. */
export function compileStandardImportProgramV2(plan:UnifiedImportPlanV2):StandardImportProgramV2 {
 const schedule=validateAndSchedule(plan);
 const request=(kind:string,index:number,payload:Record<string,unknown>,batchId=plan.baseline_batch_id):StandardImportRequest=>{
  const id=kind==='MASTER'?schedule.chunks[index]!.operation_id:stableImportId('standard-import-operation-v2',batchId,plan.plan_sha256,kind,String(index));
  return{protocol:STANDARD_IMPORT_PROTOCOL,operation_id:id,request_key:id,batch_id:batchId,plan_sha256:plan.plan_sha256,package_manifest_sha256:plan.manifest_sha256,namespace:plan.source_namespace,cutoff_at:plan.cutoff_at,payload};
 };
 const program=materializeStandardImportProgram(plan,plan.initialization_identity,{master_chunks:schedule.chunks.map(c=>c.rows),request,initialization_execution_contract:{format_version:STANDARD_IMPORT_PLAN_VERSION_V2,compiler_version:STANDARD_IMPORT_COMPILER_V2,scheduler_version:MASTER_CHUNK_PLAN_V2,max_master_chunk_rows:plan.max_master_chunk_rows,master_chunks:schedule.chunks.length,master_schedule_layout_sha256:plan.master_schedule_layout_sha256,master_chunk_plan_sha256:schedule.chunk_plan_sha256,initialization_identity_sha256:requestHash(plan.initialization_identity)}});
 const payload={...program,format_version:'UNIFIED_STANDARD_EXECUTION_PROGRAM_V2' as const,execution_scope:scope,master_schedule:schedule};return freeze({...payload,program_sha256:requestHash(payload)});
}
