import {historicalSettlementRetentionWire} from './unified-historical-settlement-retention.ts';
import type {HistoricalSettlementRetentionApproval} from './unified-historical-settlement-retention.ts';
import {isHistoricalSalesHallSourceProfile} from './unified-import-contract.ts';
import {historicalSalesHallApprovalWire} from "./unified-historical-sales-hall-evidence.ts";
import type {HistoricalSalesHallApproval} from "./unified-historical-sales-hall-evidence.ts";
import type {CurrentEffectiveAlignmentEvidence} from "./unified-current-effective-alignment.ts";
import {createStandardSourceRegistration,assertStandardSourceRegistration} from './unified-source-registration.ts';
import {hasInventoryApprovalDescriptor,explicitZeroApprovalDescriptor,explicitZeroApprovalCount} from './unified-explicit-zero-approval.ts';
import type {ExplicitZeroApproval} from './unified-explicit-zero-approval.ts';
import { assertWholeSalesAdmissionV1 } from '../../../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import { historicalStaffHallApprovalWire } from "./unified-historical-staff-hall-approval.ts";
import type { HistoricalStaffHallApproval } from "./unified-historical-staff-hall-approval.ts";
import { stableImportId } from './inventory-cutoff-import.ts';
import { requestHash } from './request-hash.ts';
import { HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256, TABLE_SCHEMAS, validateUnifiedPackage, sha256, parseStrictJson, decodeUtf8, validateOffsetInstant, validateQuantityString, validateInt32, findCredentialPath } from './unified-import-contract.ts';
import type { UnifiedPackage, StandardRecord, IdentityEntry, PackageIssue } from './unified-import-contract.ts';

export const STANDARD_IMPORT_PROTOCOL='STANDARD_IMPORT_SQL_V1' as const;
export const STANDARD_IMPORT_PLAN_VERSION='UNIFIED_STANDARD_EXECUTION_PLAN_V1' as const;
export class UnifiedImportExecutionError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.name='UnifiedImportExecutionError';this.code=code;}
}
function requireInput(ok:unknown,code:string):asserts ok {if(!ok)throw new UnifiedImportExecutionError(code);}
export interface StandardImportTarget {system_identifier:string;database_oid:string;database_name:string;catalog_sha256:string;protocol:typeof STANDARD_IMPORT_PROTOCOL;}
export interface StandardImportInspection extends StandardImportTarget {current_user:string;session_user:string;role_mode:string;proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN';}
export interface StandardImportRegistration {batch_id:string;source_namespace:string;source_metadata_sha256:string;cutoff_at:string;}
/** Recorded repository identity only; NOT original-file truth or execution
 * authority. Future real batches require an explicitly reviewed registration. */
export const CURRENT_REAL_TPLUS_REGISTRATION:Readonly<StandardImportRegistration>=Object.freeze({batch_id:'11b111ed-f128-09a0-b6cd-f153ef926fa5',source_namespace:'naijue:tplus:20261102',source_metadata_sha256:'c2021a66b4e97448f958615514cc8206a9dbf3cd3da1fdccc4c6bf80f06f292e',cutoff_at:'2026-11-02T04:00:00Z'});
export function assertCurrentRealSourceRegistration(registration:StandardImportRegistration):void {
  const selected=CURRENT_REAL_TPLUS_REGISTRATION;
  requireInput(registration.batch_id===selected.batch_id&&registration.source_namespace===selected.source_namespace&&registration.source_metadata_sha256===selected.source_metadata_sha256&&sameOffsetInstant(registration.cutoff_at,selected.cutoff_at),'UNREGISTERED_REAL_SOURCE_METADATA');
}
export interface StandardImportOccurrence {table:string;record:StandardRecord;identity:IdentityEntry|null;source_record_id:string;}
export interface UnifiedImportPlan {
  format_version:typeof STANDARD_IMPORT_PLAN_VERSION;protocol:typeof STANDARD_IMPORT_PROTOCOL;
  source_namespace:string;manifest_sha256:string;registry_sha256:string;source_metadata_sha256:string;
  cutoff_at:string;baseline_batch_id:string;document_batch_id:string;target:StandardImportTarget|null;
  package_kind:'REAL'|'SYNTHETIC';plan_sha256:string;historical_settlement_retention_approval?:{utf8:string;sha256:string};explicit_zero_approval?:ReturnType<typeof explicitZeroApprovalDescriptor>;historical_staff_hall_approval?:{utf8:string;sha256:string};historical_hall_approval?:{utf8:string;sha256:string};
  counts:{master_files:number;master_occurrences:number;explicit_keys:number;sales_headers:number;transfer_headers:number;sales_lines:number;transfer_lines:number;sales_settlements:number};
  master_rows:StandardImportOccurrence[];baseline_rows:StandardRecord[];document_rows:Record<string,StandardRecord[]>;
  admission_issues:PackageIssue[];identity_registry:IdentityEntry[];table_files:Record<string,string>;alignment_sha256:string;
}
export interface BuildUnifiedImportPlanInput {historicalSettlementRetentionApproval?:HistoricalSettlementRetentionApproval;historicalSalesHallApproval?:HistoricalSalesHallApproval;currentEffectiveAlignmentEvidence?:CurrentEffectiveAlignmentEvidence;pkg:UnifiedPackage;manifestBytes:Uint8Array;expectedManifestSha256:string;allowSynthetic?:boolean;historicalSalesAdmission?:object;explicitZeroApproval?:ExplicitZeroApproval;historicalStaffHallApproval?:HistoricalStaffHallApproval;registration?:StandardImportRegistration;target?:StandardImportTarget;}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Preserve PostgreSQL's six fractional digits; Date is used only on the exact
 * whole-second offset instant, never on a fractional input. */
function offsetInstantMicroseconds(value:unknown):bigint|null {
  if(!validateOffsetInstant(value))return null;
  const match=/^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)!;
  const milliseconds=Date.parse(match[1]!+match[3]!);
  return Number.isSafeInteger(milliseconds)?BigInt(milliseconds)*1000n+BigInt((match[2]??'').padEnd(6,'0')):null;
}
function sameOffsetInstant(a:unknown,b:unknown):boolean {const left=offsetInstantMicroseconds(a),right=offsetInstantMicroseconds(b);return left!==null&&right!==null&&left===right;}
const documents=['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'] as const;
export const STANDARD_MASTER_TABLES=Object.freeze(Object.keys(TABLE_SCHEMAS).filter(t=>!documents.includes(t as typeof documents[number])&&t!=='inventory_baseline').sort());
export function standardImportTargetIdentity(t:StandardImportTarget):StandardImportTarget{return{protocol:t.protocol,system_identifier:t.system_identifier,database_oid:t.database_oid,database_name:t.database_name,catalog_sha256:t.catalog_sha256};}
export function sameStandardImportTarget(a:StandardImportTarget,b:StandardImportTarget):boolean{return requestHash(standardImportTargetIdentity(a))===requestHash(standardImportTargetIdentity(b));}
export function validateStandardImportTarget(t:StandardImportTarget):void {
  requireInput(t!==null&&typeof t==='object'&&Object.keys(t).sort().join(',')==='catalog_sha256,database_name,database_oid,protocol,system_identifier'&&t.protocol===STANDARD_IMPORT_PROTOCOL&&typeof t.system_identifier==='string'&&/^\d+$/.test(t.system_identifier)&&typeof t.database_oid==='string'&&/^\d+$/.test(t.database_oid)&&typeof t.database_name==='string'&&t.database_name.length>0&&digest(t.catalog_sha256),'TARGET_PROOF_INVALID');
}
/** Pure compiler over the ONLY ordinary package contract. Never opens raw sources or a database. */
export function buildUnifiedImportPlan(input:BuildUnifiedImportPlanInput):UnifiedImportPlan {
  return buildSourcePlan(input,input=>input.registration,assertCurrentRealSourceRegistration);
}
/** Whole-package source compilation only. This fully validates the same package,
 * manifest and historical admission, but accepts its exact source declaration.
 * Legacy V1/V2 entrypoints never select this resolver; no caller skip flag exists. */
export function buildWholePackageSourcePlan(input:BuildUnifiedImportPlanInput):UnifiedImportPlan {
  return buildSourcePlan(input,input=>input.registration??(input.pkg.manifest.package_kind==='REAL'?createStandardSourceRegistration(input.manifestBytes,input.expectedManifestSha256):undefined),(registration,input)=>{
    try{assertCurrentRealSourceRegistration(registration);}catch{assertStandardSourceRegistration(registration,input.manifestBytes,input.expectedManifestSha256);}
  });
}
// Private policy injection keeps both checked entrypoints on identical validation,
// source facts, approval handling and hash construction. It is never input data.
function buildSourcePlan(input:BuildUnifiedImportPlanInput,resolveRegistration:(input:BuildUnifiedImportPlanInput)=>StandardImportRegistration|undefined,assertRealRegistration:(registration:StandardImportRegistration,input:BuildUnifiedImportPlanInput)=>void):UnifiedImportPlan {
  requireInput(digest(input.expectedManifestSha256)&&sha256(input.manifestBytes)===input.expectedManifestSha256,'MANIFEST_HASH_MISMATCH');
  let manifest:unknown;try{manifest=parseStrictJson(decodeUtf8(input.manifestBytes));}catch{throw new UnifiedImportExecutionError('MANIFEST_INVALID');}
  requireInput(requestHash(manifest)===requestHash(input.pkg.manifest),'MANIFEST_OBJECT_MISMATCH');
  requireInput(!isHistoricalSalesHallSourceProfile(input.pkg.manifest.schema_contract.source_declarations_sha256),'HISTORICAL_HALL_PROFILE_OFFLINE_ONLY');
  const validation=validateUnifiedPackage(input.pkg,{allowSynthetic:input.allowSynthetic===true,...(input.historicalSettlementRetentionApproval?{historicalSettlementRetentionApproval:input.historicalSettlementRetentionApproval}:{}),...(input.historicalSalesHallApproval!==undefined?{historicalSalesHallApproval:input.historicalSalesHallApproval}:{}),...(input.currentEffectiveAlignmentEvidence!==undefined?{currentEffectiveAlignmentEvidence:input.currentEffectiveAlignmentEvidence}:{}),...(input.historicalStaffHallApproval!==undefined?{historicalStaffHallApproval:input.historicalStaffHallApproval}:{}),...(input.explicitZeroApproval!==undefined?{explicitZeroApproval:input.explicitZeroApproval}:{})});
  requireInput(validation.valid&&input.pkg.manifest.stage==='READY','PREFLIGHT_REJECTED');
  if(input.pkg.manifest.schema_contract.source_declarations_sha256===HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256){
    requireInput(input.historicalSalesAdmission!==undefined&&input.target!==undefined,'SOURCE_PROFILE_OFFLINE_ONLY');
    assertWholeSalesAdmissionV1(input.historicalSalesAdmission,input.target!);
  }
  const p=input.pkg,m=p.manifest,cutoff=m.inventory_source.cutoff_at;
  requireInput(validateOffsetInstant(cutoff),'CUTOFF_REQUIRED');
  const headerBatchIds=new Set([...p.records.sales_header!,...p.records.transfer_header!].map(r=>r.fields.import_batch_id));
  requireInput(headerBatchIds.size===1&&uuid([...headerBatchIds][0]),'DOCUMENT_BATCH_ID_REQUIRED');
  const documentBatchId=[...headerBatchIds][0] as string;
  const registration=resolveRegistration(input);
  if(registration)requireInput(Object.keys(registration).sort().join(',')==='batch_id,cutoff_at,source_metadata_sha256,source_namespace'&&uuid(registration.batch_id)&&digest(registration.source_metadata_sha256)&&validateOffsetInstant(registration.cutoff_at),'REGISTERED_SOURCE_INVALID');
  if(m.package_kind==='REAL') {
    requireInput(registration!==undefined,'REGISTERED_SOURCE_METADATA_REQUIRED');
    assertRealRegistration(registration,input);
    requireInput(registration.source_namespace===m.source_namespace&&registration.batch_id===documentBatchId&&digest(registration.source_metadata_sha256)&&sameOffsetInstant(registration.cutoff_at,cutoff),'REGISTERED_SOURCE_MISMATCH');
    requireInput(registration.batch_id===stableImportId('native-import-batch',registration.source_namespace,registration.source_metadata_sha256),'REGISTERED_BATCH_ID_MISMATCH');
  }
  const sourceMetadataHash=registration?.source_metadata_sha256??requestHash({package_kind:'SYNTHETIC',source_namespace:m.source_namespace,source_files:m.source_files,cutoff_at:cutoff});
  requireInput(digest(sourceMetadataHash),'SOURCE_METADATA_HASH_INVALID');
  if(registration)requireInput(registration.source_namespace===m.source_namespace&&registration.batch_id===documentBatchId&&sameOffsetInstant(registration.cutoff_at,cutoff),'REGISTERED_SOURCE_MISMATCH');
  if(input.target)validateStandardImportTarget(input.target);
  const masterRows=STANDARD_MASTER_TABLES.flatMap(table=>p.records[table]!.map(record=>{
    return{table,record:structuredClone(record),identity:structuredClone(p.registry.find(e=>e.entity_type===table.toUpperCase()&&(e.canonical_source_key===record.source_key||e.aliases.includes(record.source_key)))??null),source_record_id:stableImportId('standard-import-record-v1',m.source_namespace,table.toUpperCase(),record.source_key)};
  }));
  // Existing retained business guards stay authoritative. Preserve source facts
  // while marking unsupported fresh-target states; never clear a deletion/default.
  const admissionIssues:PackageIssue[]=[];
  for(const table of ['product_category','color','fit','product'])for(const[index,row]of p.records[table]!.entries())if(row.fields.deleted_at!==null)admissionIssues.push({code:'RETAINED_DELETED_CATALOG_INSERT_UNSUPPORTED',severity:'BLOCK_SCHEMA',path:`${table}[${index}].fields.deleted_at`,message:'The fresh standard profile cannot insert an already-deleted catalog row. Preserve the original fact; no automatic clearing or overwrite is permitted.'});
  const customers=new Map(p.records.customer!.map(row=>[row.fields.id,row]));
  for(const[index,row]of p.records.hall!.entries())if(row.fields.enabled===true&&row.fields.default_customer_id!==null&&customers.get(row.fields.default_customer_id)?.fields.enabled===false)admissionIssues.push({code:'ENABLED_HALL_DISABLED_DEFAULT_CUSTOMER',severity:'BLOCK_REFERENCE',path:`hall[${index}].fields.default_customer_id`,message:'Retained hall rules reject an enabled hall linked to a disabled default customer. Preserve original values and resolve the target-admission exception without guessing a replacement.'});
  const payload={...(input.historicalSettlementRetentionApproval?{historical_settlement_retention_approval:historicalSettlementRetentionWire(input.historicalSettlementRetentionApproval)}:{}),...(input.historicalSalesHallApproval?{historical_hall_approval:historicalSalesHallApprovalWire(input.historicalSalesHallApproval)}:{}),...(input.explicitZeroApproval&&hasInventoryApprovalDescriptor(input.explicitZeroApproval)?{explicit_zero_approval:explicitZeroApprovalDescriptor(input.explicitZeroApproval)}:{}),...(input.historicalStaffHallApproval?{historical_staff_hall_approval:historicalStaffHallApprovalWire(input.historicalStaffHallApproval)}:{}),format_version:STANDARD_IMPORT_PLAN_VERSION,protocol:STANDARD_IMPORT_PROTOCOL,source_namespace:m.source_namespace,manifest_sha256:input.expectedManifestSha256,registry_sha256:m.identity_registry.sha256,source_metadata_sha256:sourceMetadataHash,cutoff_at:cutoff,baseline_batch_id:stableImportId('standard-initial-baseline-v1',m.source_namespace,sourceMetadataHash),document_batch_id:documentBatchId,target:input.target?structuredClone(input.target):null,package_kind:m.package_kind,counts:{master_files:STANDARD_MASTER_TABLES.length,master_occurrences:masterRows.length,explicit_keys:p.records.inventory_baseline!.length,sales_headers:p.records.sales_header!.length,transfer_headers:p.records.transfer_header!.length,sales_lines:p.records.sales_line!.length,transfer_lines:p.records.transfer_line!.length,sales_settlements:p.records.sales_settlement!.length},master_rows:masterRows,baseline_rows:structuredClone(p.records.inventory_baseline!),document_rows:Object.fromEntries(documents.map(t=>[t,structuredClone(p.records[t]!)])),admission_issues:admissionIssues,identity_registry:structuredClone(p.registry),table_files:Object.fromEntries(m.files.map(f=>[f.table,f.relative_path])),alignment_sha256:m.document_cutoff_alignment.evidence_sha256!};
  return{...payload,plan_sha256:requestHash(payload)};
}

// Exact SQL wire protocol. SQL, not JS, computes jsonb::text request/source digests.
export type StandardImportMethod='initialize'|'masterChunk'|'baselineKeys'|'documentChunk'|'publish';
export interface StandardImportRequest {
  protocol:typeof STANDARD_IMPORT_PROTOCOL;operation_id:string;request_key:string;batch_id:string;
  plan_sha256:string;package_manifest_sha256:string;namespace:string;cutoff_at:string;payload:Record<string,unknown>;
}
export type StandardImportReply={protocol:typeof STANDARD_IMPORT_PROTOCOL;operation_id:string;batch_id:string}&(
  {state:'COMMITTED';request_sha256:string;sequence:number;cursor:number;receipt:Record<string,unknown>}
  |{state:'ABSENT';request_sha256:null;sequence:null;cursor:null;receipt:null}
);
export interface StandardImportExecutionClient {
  readonly protocol:typeof STANDARD_IMPORT_PROTOCOL;
  inspectTarget():Promise<StandardImportInspection>;
  inspectSuccessorCatalog?(captures:readonly StandardImportSuccessorCapture[]):Promise<StandardImportSuccessorObservation>;
  initialize(request:StandardImportRequest,encodedScryptPrivate:string):Promise<StandardImportReply>;
  masterChunk(request:StandardImportRequest):Promise<StandardImportReply>;
  baselineKeys(request:StandardImportRequest):Promise<StandardImportReply>;
  documentChunk(request:StandardImportRequest):Promise<StandardImportReply>;
  publish(request:StandardImportRequest):Promise<StandardImportReply>;
  status(originalRequest:StandardImportRequest):Promise<StandardImportReply>;
  verify(originalFinalPublishRequest:StandardImportRequest):Promise<StandardImportVerification>;
}
export type StandardImportOutcome=Extract<StandardImportReply,{state:'COMMITTED'}>;
export function assertUnifiedImportPlan(plan:UnifiedImportPlan):void {
  const {plan_sha256,...payload}=plan;
  requireInput(plan.format_version===STANDARD_IMPORT_PLAN_VERSION&&digest(plan_sha256)&&requestHash(payload)===plan_sha256,'PLAN_CONTENT_MISMATCH');
  requireInput(plan.target!==null,'TARGET_PROOF_REQUIRED');validateStandardImportTarget(plan.target);
}
export function standardImportRequest(plan:UnifiedImportPlan,kind:string,index:number,payload:Record<string,unknown>,batchId=plan.baseline_batch_id):StandardImportRequest {
  requireInput(Number.isSafeInteger(index)&&index>=0&&/^[A-Z_]+$/.test(kind),'OPERATION_DESCRIPTOR_INVALID');
  const operationId=stableImportId('standard-import-operation-v1',batchId,plan.plan_sha256,kind,String(index));
  return{protocol:STANDARD_IMPORT_PROTOCOL,operation_id:operationId,request_key:operationId,batch_id:batchId,plan_sha256:plan.plan_sha256,package_manifest_sha256:plan.manifest_sha256,namespace:plan.source_namespace,cutoff_at:plan.cutoff_at,payload};
}
export function validateStandardImportRequest(r:StandardImportRequest):void {
  requireInput(r!==null&&typeof r==='object'&&Object.keys(r).sort().join(',')==='batch_id,cutoff_at,namespace,operation_id,package_manifest_sha256,payload,plan_sha256,protocol,request_key'&&r.protocol===STANDARD_IMPORT_PROTOCOL&&uuid(r.operation_id)&&typeof r.request_key==='string'&&r.request_key.length>0&&r.request_key.length<=160&&uuid(r.batch_id)&&digest(r.plan_sha256)&&digest(r.package_manifest_sha256)&&typeof r.namespace==='string'&&r.namespace.trim().length>0&&validateOffsetInstant(r.cutoff_at)&&r.payload!==null&&typeof r.payload==='object'&&!Array.isArray(r.payload),'SQL_REQUEST_INVALID');
}
export function decodeStandardImportReply(value:unknown,r:StandardImportRequest):StandardImportReply {
  requireInput(value!==null&&typeof value==='object'&&!Array.isArray(value),'SQL_RESPONSE_INVALID');
  const v=value as Record<string,unknown>;
  requireInput(Object.keys(v).sort().join(',')==='batch_id,cursor,operation_id,protocol,receipt,request_sha256,sequence,state'&&v.protocol===STANDARD_IMPORT_PROTOCOL&&v.operation_id===r.operation_id&&v.batch_id===r.batch_id,'SQL_RESPONSE_INVALID');
  if(v.state==='ABSENT')requireInput(v.request_sha256===null&&v.sequence===null&&v.cursor===null&&v.receipt===null,'SQL_RESPONSE_INVALID');
  else {
    requireInput(v.state==='COMMITTED'&&digest(v.request_sha256)&&validateInt32(v.sequence)&&v.sequence>=0&&validateInt32(v.cursor)&&v.cursor>=0&&v.receipt!==null&&typeof v.receipt==='object'&&!Array.isArray(v.receipt),'SQL_RESPONSE_INVALID');
    const zeroStage=r.payload.mode==='NEW_EMPTY'||r.payload.mode==='STAGE';
    const expectedSequence=zeroStage?0:validateInt32(r.payload.expected_sequence)?r.payload.expected_sequence+1:null;
    requireInput((expectedSequence===null||v.sequence===expectedSequence)&&(!zeroStage||v.cursor===0),'SQL_RESPONSE_ORIGINAL_CHECKPOINT_MISMATCH');
  }
  return v as unknown as StandardImportReply;
}
async function assertTarget(plan:UnifiedImportPlan,client:StandardImportExecutionClient,admission?:StandardImportSuccessorAdmission):Promise<void>{
  assertUnifiedImportPlan(plan);requireInput(plan.package_kind==='SYNTHETIC','REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE');requireInput(client.protocol===STANDARD_IMPORT_PROTOCOL,'CLIENT_PROTOCOL_MISMATCH');
  const actual=await client.inspectTarget();validateStandardImportTarget(standardImportTargetIdentity(actual));
  if(admission)requireInput(successorAdmissions.has(admission)&&admission.original_plan_sha256===plan.plan_sha256,'SUCCESSOR_ADMISSION_INVALID');
  requireInput(sameStandardImportTarget(admission?admission.actual_target:plan.target!,actual),'TARGET_CHANGED');
}
function committed(r:StandardImportReply):StandardImportOutcome {
  requireInput(r.state==='COMMITTED'&&r.receipt!==null,'OPERATION_NOT_COMMITTED');
  return r;
}
/** Resolve ONLY the original request on the exact original target. ABSENT does not
 * replay here. The separate resume function requires the acknowledged SQL lock barrier. */
export async function recoverUnifiedImportOperation(plan:UnifiedImportPlan,client:StandardImportExecutionClient,originalRequest:StandardImportRequest,admission?:StandardImportSuccessorAdmission):Promise<StandardImportReply>{
  await assertTarget(plan,client,admission);validateStandardImportRequest(originalRequest);
  requireInput(originalRequest.plan_sha256===plan.plan_sha256&&originalRequest.package_manifest_sha256===plan.manifest_sha256&&originalRequest.namespace===plan.source_namespace&&(originalRequest.batch_id===plan.baseline_batch_id||originalRequest.batch_id===plan.document_batch_id),'RECOVERY_REQUEST_MISMATCH');
  return decodeStandardImportReply(await client.status(originalRequest),originalRequest);
}
export interface StandardImportStep {method:Exclude<StandardImportMethod,'initialize'>;request:StandardImportRequest;}
/** Executes precompiled finite steps sequentially. Each step is a separate atomic
 * server transaction. A rejection stops later chunks; prior commits are retained.
 * UNKNOWN throws with the original request identity; it is never retried here. */
export async function executeUnifiedImportPlan(plan:UnifiedImportPlan,client:StandardImportExecutionClient,steps:readonly StandardImportStep[],admission?:StandardImportSuccessorAdmission):Promise<StandardImportOutcome[]>{
  assertSuccessorWriteAuthority(admission);await assertTarget(plan,client,admission);const results:StandardImportOutcome[]=[];
  for(const step of steps){
    validateStandardImportRequest(step.request);
    requireInput(step.request.plan_sha256===plan.plan_sha256&&step.request.package_manifest_sha256===plan.manifest_sha256&&step.request.namespace===plan.source_namespace&&(step.request.batch_id===plan.baseline_batch_id||step.request.batch_id===plan.document_batch_id),'STEP_PLAN_MISMATCH');
    requireInput(['masterChunk','baselineKeys','documentChunk','publish'].includes(step.method),'STEP_METHOD_INVALID');
    results.push(committed(decodeStandardImportReply(await client[step.method](step.request),step.request)));
  }
  return results;
}

export interface StandardImportCurrentAdmin {staff_id:string;account_id:string;login_name:string;staff_name:string;}
export interface StandardImportProgram {initialize:StandardImportRequest;steps:StandardImportStep[];}
export type StandardImportProgramSource=Pick<UnifiedImportPlan,'master_rows'|'source_namespace'|'identity_registry'|'table_files'|'counts'|'baseline_rows'|'document_rows'|'baseline_batch_id'|'document_batch_id'|'registry_sha256'|'alignment_sha256'|'historical_staff_hall_approval'|'historical_settlement_retention_approval'|'historical_hall_approval'|'explicit_zero_approval'>;
function sourceRow(plan:StandardImportProgramSource,table:string,record:StandardRecord):Record<string,unknown>{
  const identity=plan.identity_registry.find(e=>e.entity_type===table.toUpperCase()&&(e.canonical_source_key===record.source_key||e.aliases.includes(record.source_key)));
  const composite=!TABLE_SCHEMAS[table]!.id;
  requireInput(composite||identity!==undefined,'ROW_REGISTRY_IDENTITY_REQUIRED');
  return{target_id:composite?stableImportId('standard-composite-target-v1',plan.source_namespace,table.toUpperCase(),record.source_key):identity!.target_id,identity_basis:composite?'DERIVED_COMPOSITE':identity!.identity_basis,record_id:stableImportId('standard-import-record-v1',plan.source_namespace,table.toUpperCase(),record.source_key),entity_type:table.toUpperCase(),source_key:record.source_key,file_ref:plan.table_files[table]!,source_refs:structuredClone(record.source_refs),fields:structuredClone(record.fields),...(record.explicit_zero_evidence!==undefined?{explicit_zero_evidence:structuredClone(record.explicit_zero_evidence)}:{}),...(record.historical_hall_evidence!==undefined?{historical_hall_evidence:structuredClone(record.historical_hall_evidence)}:{}),...(record.zero_amount_archive!==undefined?{zero_amount_archive:structuredClone(record.zero_amount_archive)}:{})};
}
/** Actual finite fresh-initialization program. Bounded master/key chunks, but never
 * split a document aggregate or truncate settlements. Existing-baseline adoption
 * is deliberately not inferred from old source labels. */
export function compileStandardImportProgram(plan:UnifiedImportPlan,admin:StandardImportCurrentAdmin):StandardImportProgram {
  assertUnifiedImportPlan(plan);
  requireInput(plan.admission_issues.length===0,'TARGET_PROFILE_ADMISSION_BLOCKED');
  requireInput(uuid(admin.staff_id)&&uuid(admin.account_id)&&typeof admin.login_name==='string'&&admin.login_name.trim().length>0&&typeof admin.staff_name==='string'&&admin.staff_name.trim().length>0&&Object.keys(admin).sort().join(',')==='account_id,login_name,staff_id,staff_name','CURRENT_ADMIN_INPUT_INVALID');
  requireInput(plan.master_rows.length<=500,'MASTER_DEPENDENCY_CHUNKING_NOT_IMPLEMENTED');
  return materializeStandardImportProgram(plan,admin,{master_chunks:[plan.master_rows],request:(kind,index,payload,batchId)=>standardImportRequest(plan,kind,index,payload,batchId)});
}

/** Shared mechanical materializer, not a validator or target capability. Versioned
 * callers must validate their plan/admin/schedule before calling. No second data
 * normalization, row identity, inventory or document business implementation. */
export function materializeStandardImportProgram(plan:StandardImportProgramSource,admin:StandardImportCurrentAdmin,options:{master_chunks:readonly (readonly StandardImportOccurrence[])[];request:(kind:string,index:number,payload:Record<string,unknown>,batchId?:string)=>StandardImportRequest;initialization_execution_contract?:Record<string,unknown>;document_chunk_rows?:number}):StandardImportProgram {
  const chunkSize=100;
  if(options.document_chunk_rows!==undefined)requireInput(Number.isSafeInteger(options.document_chunk_rows)&&options.document_chunk_rows>=1&&options.document_chunk_rows<=500,'DOCUMENT_CHUNK_BOUND_INVALID');
  const expectedDocuments={SALES_HEADER:plan.counts.sales_headers,SALES_LINE:plan.counts.sales_lines,SALES_SETTLEMENT:plan.counts.sales_settlements,TRANSFER_HEADER:plan.counts.transfer_headers,TRANSFER_LINE:plan.counts.transfer_lines,IMPORT_BATCH:1};
  const init=options.request('INITIALIZE',0,{...(plan.historical_settlement_retention_approval?{historical_settlement_retention_approval:structuredClone(plan.historical_settlement_retention_approval)}:{}),...(plan.historical_hall_approval?{historical_hall_approval:structuredClone(plan.historical_hall_approval)}:{}),...(plan.explicit_zero_approval?{explicit_zero_approval:structuredClone(plan.explicit_zero_approval)}:{}),...(plan.historical_staff_hall_approval?{historical_staff_hall_approval:structuredClone(plan.historical_staff_hall_approval)}:{}),mode:'NEW_EMPTY',manifest_ref:'manifest.json',registry_sha256:plan.registry_sha256,alignment_sha256:plan.alignment_sha256,document_batch_id:plan.document_batch_id,namespace_record_id:stableImportId('standard-import-namespace-record-v1',plan.source_namespace,plan.baseline_batch_id),admin:structuredClone(admin),expected:{MASTER:plan.counts.master_occurrences,INVENTORY_KEY:plan.counts.explicit_keys,INVENTORY_EFFECT:plan.baseline_rows.filter(r=>r.fields.quantity!=='0').length,NAMESPACE:1,IMPORT_BATCH:1},expected_master_counts:Object.fromEntries(STANDARD_MASTER_TABLES.map(t=>[t.toUpperCase(),plan.master_rows.filter(r=>r.table===t).length])),expected_documents:expectedDocuments,...(options.initialization_execution_contract?{execution_contract:structuredClone(options.initialization_execution_contract)}:{})});
  const steps:StandardImportStep[]=[];let sequence=0;
  const chunks=<T>(rows:T[]):T[][]=>Array.from({length:Math.ceil(rows.length/chunkSize)},(_,i)=>rows.slice(i*chunkSize,(i+1)*chunkSize));
  for(const [index,rows] of options.master_chunks.entries())steps.push({method:'masterChunk',request:options.request('MASTER',index,{expected_sequence:sequence++,rows:rows.map(r=>sourceRow(plan,r.table,r.record))})});
  for(const [index,rows] of chunks(plan.baseline_rows).entries())steps.push({method:'baselineKeys',request:options.request('KEYS',index,{expected_sequence:sequence++,rows:rows.map(r=>{const {entity_type,target_id,identity_basis,...row}=sourceRow(plan,'inventory_baseline',r);void entity_type;void target_id;void identity_basis;return{...row,ledger_entry_id:r.fields.quantity==='0'?null:stableImportId('standard-baseline-ledger-v1',plan.baseline_batch_id,String(r.fields.warehouse_id),String(r.fields.sku_id))};})})});
  steps.push({method:'publish',request:options.request('BASELINE_PUBLISH',0,{phase:'BASELINE',expected_sequence:sequence,baseline_batch_id:plan.baseline_batch_id,approval_record_id:stableImportId('standard-import-approval-v1',plan.baseline_batch_id)})});
  steps.push({method:'documentChunk',request:options.request('DOCUMENT_STAGE',0,{mode:'STAGE',baseline_batch_id:plan.baseline_batch_id,expected_sequence:null,expected:expectedDocuments,rows:[],documents:[]},plan.document_batch_id)});
  let documentSequence=0,index=0;
  for(const kind of ['SALES','TRANSFER'] as const){
    const headerTable=kind==='SALES'?'sales_header':'transfer_header',lineTable=kind==='SALES'?'sales_line':'transfer_line',ownerField=kind==='SALES'?'sales_id':'transfer_id';
    for(const header of plan.document_rows[headerTable]!){
      const id=header.fields.id as string;
      const aggregate=[sourceRow(plan,headerTable,header),...plan.document_rows[lineTable]!.filter(r=>r.fields[ownerField]===id).map(r=>sourceRow(plan,lineTable,r)),...(kind==='SALES'?plan.document_rows.sales_settlement!.filter(r=>r.fields.sales_id===id).map(r=>sourceRow(plan,'sales_settlement',r)):[])];
      if(options.document_chunk_rows===undefined)requireInput(aggregate.length<=500,'DOCUMENT_AGGREGATE_EXCEEDS_SERVER_BOUND');
      const operationId=stableImportId('standard-document-migration-v1',plan.document_batch_id,kind,id);
      const bound=options.document_chunk_rows??aggregate.length;
      for(let start=0;start<aggregate.length;start+=bound){
       const last=start+bound>=aggregate.length;
       steps.push({method:'documentChunk',request:options.request('DOCUMENT',index++,{mode:'CHUNK',baseline_batch_id:plan.baseline_batch_id,expected_sequence:documentSequence++,expected:expectedDocuments,rows:aggregate.slice(start,start+bound),documents:last?[{kind,id,operation_id:operationId,request_key:operationId,source_record_id:stableImportId('standard-import-record-v1',plan.source_namespace,headerTable.toUpperCase(),header.source_key)}]:[]},plan.document_batch_id)});
      }
    }
  }
  steps.push({method:'publish',request:options.request('DOCUMENT_PUBLISH',0,{phase:'DOCUMENTS',expected_sequence:documentSequence,baseline_batch_id:plan.baseline_batch_id,approval_record_id:stableImportId('standard-import-approval-v1',plan.document_batch_id)},plan.document_batch_id)});
  return{initialize:init,steps};
}

/** Receipt readback is deliberately named as such: it proves immutable original-key
 * closure, not current stock balances or a later-mutated ordinary document state. */
export async function verifyUnifiedImportReceipts(plan:UnifiedImportPlan,client:StandardImportExecutionClient,requests:readonly StandardImportRequest[],expected:ReadonlyMap<string,string>=new Map(),admission?:StandardImportSuccessorAdmission):Promise<{state:'RECEIPTS_VERIFIED';verified_operations:number}>{
  await assertTarget(plan,client,admission);
  const seen=new Set<string>();
  for(const request of requests){
    requireInput(!seen.has(request.operation_id),'DUPLICATE_VERIFY_OPERATION');seen.add(request.operation_id);
    const r=await recoverUnifiedImportOperation(plan,client,request,admission);committed(r);
    const pin=expected.get(request.operation_id);if(pin!==undefined)requireInput(r.request_sha256===pin,'ORIGINAL_REQUEST_HASH_CHANGED');
  }
  return{state:'RECEIPTS_VERIFIED',verified_operations:seen.size};
}

/** New bound client only after UNKNOWN connection quarantine. SQL status obtains
 * the SAME cutoff+actor/request locks as the writer and observes READ COMMITTED
 * after waiting. Thus acknowledged ABSENT is an actual original-writer barrier;
 * the next finite call reuses the exact original key and rechecks under lock. */
export async function resumeUnifiedImportStep(plan:UnifiedImportPlan,client:StandardImportExecutionClient,step:StandardImportStep,admission?:StandardImportSuccessorAdmission):Promise<StandardImportOutcome>{
  assertSuccessorWriteAuthority(admission);const prior=await recoverUnifiedImportOperation(plan,client,step.request,admission);
  if(prior.state==='COMMITTED')return committed(prior);
  const [result]=await executeUnifiedImportPlan(plan,client,[step],admission);
  requireInput(result!==undefined,'RESUME_NOT_COMMITTED');return result;
}

export interface StandardImportVerification {
  protocol:typeof STANDARD_IMPORT_PROTOCOL;plan_sha256:string;batch_id:string;baseline_batch_id:string;verified:true;
  documents:{kind:'SALES'|'TRANSFER';id:string;initial_version:number;current_version:number;state:'UNCHANGED'|'VERIFIED_CHANGED_AFTER_IMPORT';audit_steps:number}[];
  source_counts:Record<string,number>;
  inventory_keys:{warehouse_id:string;sku_id:string;coverage:'EXPLICIT_ZERO'|'NONZERO'|'POST_CUTOFF_NATIVE';baseline_quantity:string;ledger_total:string;ledger_entries:number;balance_quantity:string|null;balance_version:number|null;verified:true}[];
  scope:'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED';proof_scope:'SET_ROLE_ONLY_NOT_NONOWNER_LOGIN';
}
const plain=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keys=(v:Record<string,unknown>,names:string)=>Object.keys(v).sort().join(',')===names;
export function decodeStandardImportVerification(value:unknown,request:StandardImportRequest):StandardImportVerification {
  requireInput(plain(value)&&keys(value,'baseline_batch_id,batch_id,documents,inventory_keys,plan_sha256,proof_scope,protocol,scope,source_counts,verified')&&!findCredentialPath(value)&&value.protocol===STANDARD_IMPORT_PROTOCOL&&value.plan_sha256===request.plan_sha256&&value.batch_id===request.batch_id&&uuid(value.baseline_batch_id)&&value.verified===true&&value.scope==='CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED'&&value.proof_scope==='SET_ROLE_ONLY_NOT_NONOWNER_LOGIN'&&Array.isArray(value.documents)&&Array.isArray(value.inventory_keys)&&plain(value.source_counts),'NATIVE_VERIFY_RESPONSE_INVALID');
  const targetTypes=new Set([...STANDARD_MASTER_TABLES,...documents].map(t=>t.toUpperCase()).concat(['INVENTORY_KEY','IMPORT_BATCH']));
  requireInput(Object.keys(value.source_counts).sort().join(',')===[...targetTypes].sort().join(',')&&Object.entries(value.source_counts).every(([type,count])=>targetTypes.has(type)&&validateInt32(count)&&count>=0),'NATIVE_VERIFY_RESPONSE_INVALID');
  requireInput(value.documents.every(d=>plain(d)&&keys(d,'audit_steps,current_version,id,initial_version,kind,state')&&['SALES','TRANSFER'].includes(String(d.kind))&&uuid(d.id)&&validateInt32(d.initial_version)&&d.initial_version>0&&validateInt32(d.current_version)&&d.current_version>=d.initial_version&&validateInt32(d.audit_steps)&&d.audit_steps===d.current_version-d.initial_version&&d.state===(d.audit_steps===0?'UNCHANGED':'VERIFIED_CHANGED_AFTER_IMPORT')),'NATIVE_VERIFY_RESPONSE_INVALID');
  requireInput(value.inventory_keys.every(k=>plain(k)&&keys(k,'balance_quantity,balance_version,baseline_quantity,coverage,ledger_entries,ledger_total,sku_id,verified,warehouse_id')&&uuid(k.warehouse_id)&&uuid(k.sku_id)&&['EXPLICIT_ZERO','NONZERO','POST_CUTOFF_NATIVE'].includes(String(k.coverage))&&validateQuantityString(k.baseline_quantity)&&validateQuantityString(k.ledger_total)&&validateInt32(k.ledger_entries)&&k.ledger_entries>=0&&k.verified===true&&(k.coverage==='NONZERO'?k.baseline_quantity!=='0':k.baseline_quantity==='0')&&(k.balance_quantity===null?k.balance_version===null&&k.ledger_total==='0'&&k.ledger_entries===0:validateQuantityString(k.balance_quantity)&&k.balance_quantity===k.ledger_total&&validateInt32(k.balance_version)&&k.balance_version>0)),'NATIVE_VERIFY_RESPONSE_INVALID');
  return value as unknown as StandardImportVerification;
}
/** Full finite native/source/stock readback. Server fences all affected keys and
 * reconstructs legitimate ordinary edits from immutable migration+runtime audits;
 * it does not require later native facts to remain frozen at import values. */
export async function verifyUnifiedImportState(plan:UnifiedImportPlan,client:StandardImportExecutionClient,originalFinalPublishRequest:StandardImportRequest,admission?:StandardImportSuccessorAdmission):Promise<StandardImportVerification>{
  await assertTarget(plan,client,admission);validateStandardImportRequest(originalFinalPublishRequest);
  const r=originalFinalPublishRequest;
  requireInput(r.batch_id===plan.document_batch_id&&r.plan_sha256===plan.plan_sha256&&r.package_manifest_sha256===plan.manifest_sha256&&r.namespace===plan.source_namespace&&r.payload.phase==='DOCUMENTS'&&r.payload.baseline_batch_id===plan.baseline_batch_id,'VERIFY_FINAL_PUBLICATION_REQUIRED');
  const v=decodeStandardImportVerification(await client.verify(r),r);
  return validateStandardImportVerificationCoverage(plan,v);
}

/** Shared pure source/native/stock coverage; no target admission or wire rewriting. */
export function validateStandardImportVerificationCoverage(plan:Pick<UnifiedImportPlan,'baseline_batch_id'|'document_rows'|'baseline_rows'|'master_rows'|'counts'>,v:StandardImportVerification):StandardImportVerification {
  requireInput(v.baseline_batch_id===plan.baseline_batch_id,'VERIFY_BASELINE_MISMATCH');
  const expectedDocs=new Map([...plan.document_rows.sales_header!.map(h=>['SALES:'+String(h.fields.id),Number(h.fields.version)] as const),...plan.document_rows.transfer_header!.map(h=>['TRANSFER:'+String(h.fields.id),Number(h.fields.version)] as const)]);
  requireInput(v.documents.length===expectedDocs.size&&new Set(v.documents.map(d=>d.kind+':'+d.id)).size===expectedDocs.size&&v.documents.every(d=>expectedDocs.get(d.kind+':'+d.id)===d.initial_version),'VERIFY_DOCUMENT_COVERAGE_MISMATCH');
  const expectedKeys=new Map(plan.baseline_rows.map(k=>[String(k.fields.warehouse_id)+':'+String(k.fields.sku_id),String(k.fields.quantity)]));
  const actualKeys=new Set<string>();
  for(const k of v.inventory_keys){const key=k.warehouse_id+':'+k.sku_id;requireInput(!actualKeys.has(key),'VERIFY_KEY_COVERAGE_MISMATCH');actualKeys.add(key);const original=expectedKeys.get(key);requireInput(original!==undefined?k.baseline_quantity===original&&k.coverage===(original==='0'?'EXPLICIT_ZERO':'NONZERO'):k.coverage==='POST_CUTOFF_NATIVE','VERIFY_KEY_COVERAGE_MISMATCH');}
  requireInput([...expectedKeys.keys()].every(k=>actualKeys.has(k)),'VERIFY_KEY_COVERAGE_MISMATCH');
  for(const table of [...STANDARD_MASTER_TABLES,...documents]){const expected=STANDARD_MASTER_TABLES.includes(table)?plan.master_rows.filter(r=>r.table===table).length:plan.document_rows[table]!.length;requireInput((v.source_counts[table.toUpperCase()]??0)===expected,'VERIFY_SOURCE_COUNT_MISMATCH');}
  requireInput(v.source_counts.INVENTORY_KEY===plan.counts.explicit_keys&&v.source_counts.IMPORT_BATCH===3,'VERIFY_SOURCE_COUNT_MISMATCH');
  return v;
}

/** Initialization has a separate protected capability and private credential
 * channel. Even after COMMITTED status, replay the SAME initialization request so
 * the server compares the private fingerprint; public status alone cannot do so. */
export async function resumeUnifiedImportInitialization(plan:UnifiedImportPlan,client:StandardImportExecutionClient,originalInitializeRequest:StandardImportRequest,encodedScryptPrivate:string):Promise<StandardImportOutcome>{
  requireInput(originalInitializeRequest.batch_id===plan.baseline_batch_id&&originalInitializeRequest.payload.mode==='NEW_EMPTY','INITIALIZATION_RECOVERY_REQUEST_INVALID');
  await recoverUnifiedImportOperation(plan,client,originalInitializeRequest);
  return committed(decodeStandardImportReply(await client.initialize(originalInitializeRequest,encodedScryptPrivate),originalInitializeRequest));
}

/** One reviewed code-only transition; not a generic catalog override. Source SHA
 * stays fail-closed until the SQL owner's exact44 source has been frozen. */
export const REVIEWED_STANDARD44_TRANSITION=Object.freeze({id:'STANDARD44_FINITE_ALIAS_FIXES',source_sha256:'886e63d9d7c308f1704c60cdd103e1b607180a6e02eb61cd65add7bb1d509bd5',routine_identity:'naijue_erp.assert_standard_import_operation(uuid)',predecessor_catalog_sha256:'357cc19ab54edf2672f5275ce6926b846f7c5755ac36606a5ae7fc28c0b69a16',predecessor_body_sha256:'d2b310a7e902c94721ab7d6e6205284b1fd811a5a78da9334fc53744141bb16b',successor_body_sha256:'aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4',routines:Object.freeze([Object.freeze({"routine_identity": "naijue_erp.assert_standard_import_operation(uuid)", "predecessor_body_sha256": "d2b310a7e902c94721ab7d6e6205284b1fd811a5a78da9334fc53744141bb16b", "successor_body_sha256": "aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4", "predecessor_definition_sha256": "7c3981815ff3e6b8fd888e6d44a0c38cd2deefe715250cd0ead827d62eca7290", "invariant_attributes_sha256": "8843c4cd5e4693ec1feab8b7570e5a8fe31e4219b69ce25fba312958b50eab46"}),Object.freeze({"routine_identity": "naijue_erp.validate_baseline_source_commit()", "predecessor_body_sha256": "1fcb4ab36f3c008ccaa0a53797aec14e7e4f3a54e0f05bf311cae40e1dafd814", "successor_body_sha256": "c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4", "predecessor_definition_sha256": "4881651c070881e6651f8c527eb361365c7f429e56d2dca84e1f5b7a516bdb85", "invariant_attributes_sha256": "503a48751e8a79af7e8b4b1188d1c96126e90ee92626573d154b12be4278a84b"}),Object.freeze({"routine_identity": "naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)", "predecessor_body_sha256": "e1b06e7343ffe2a4b1048f3a5ca55a814ead2fbb4d984344b3491a5924ae2680", "successor_body_sha256": "c5b7a0b4d44748df3e19491c3426d547de331385a58c839a76aea90cd5e1c2ff", "predecessor_definition_sha256": "1d989012fc6c9bfd79430f41273a7873fb7779e2dc4ce90f6f0e48a80ebcb39d", "invariant_attributes_sha256": "323ee3c65a3352d91edb89483ef77f9adf4bca426c09bdd6a1bdb5c7feb5cd83"})])});
/** Reviewed source43→45 finite union. Original44 descriptor/proof stays immutable. */
export const REVIEWED_STANDARD45_TRANSITION=Object.freeze({id:'STANDARD45_FRESH_SETTLEMENT_IDENTITY_FIX',source_sha256:'f360d17b11cdd42b54f55bc9de91426728e5870a6668ba82785c1061bf844190',predecessor_catalog_sha256:REVIEWED_STANDARD44_TRANSITION.predecessor_catalog_sha256,routines:Object.freeze([...REVIEWED_STANDARD44_TRANSITION.routines,Object.freeze({routine_identity:'naijue_erp.guard_retained_settlement_identity()',predecessor_body_sha256:'12c13344ab5c786db30fe3b7bc0af1ad3b270c6433bf6245311de5f9f17c2022',successor_body_sha256:'3bd3d7cb19a1418ffe340cd72eda7fe8ec7b43023461f763b74a2d54b5ddc345',predecessor_definition_sha256:'0b7f5e9ce99e7c1c8d4a94d207aec27439eb0e49fed8eda7eb04a141ecbaf346',invariant_attributes_sha256:'d7daae8e1a092b0f0c6234673d2e8278fe16b0c22ba8ff134c09104393e8694e'})])});
/** Reviewed source43→46 finite union; original44/45 descriptors stay immutable. */
export const REVIEWED_STANDARD46_TRANSITION=Object.freeze({id:'STANDARD46_PUBLISH_VERIFY_DISAMBIGUATION',source_sha256:'df3d3698830dfe38baca73bf3cf71c756357d55b1f473d799cb4252ec51cb9f5',predecessor_catalog_sha256:REVIEWED_STANDARD44_TRANSITION.predecessor_catalog_sha256,routines:Object.freeze([...REVIEWED_STANDARD45_TRANSITION.routines,Object.freeze({routine_identity:'naijue_erp.standard_import_command(jsonb,text,text)',predecessor_body_sha256:'b600d24b88b1a70f6a28b797da3406509a817fd847516681eda6e9711ea6d1d2',successor_body_sha256:'451708aa41f1ffe91ae3008491f1679da19e45d844e06fd054d4108c3215f498',predecessor_definition_sha256:'393f8a763493eb9523930b0c20dcb75573f0a6b0d0de70655a12b97c4143c47f',invariant_attributes_sha256:'b017d792379dbe8d974b3e6e0cec0dd07f288d965b8c898a11c3dfba190f3bfc'}),Object.freeze({routine_identity:'naijue_erp.standard_import_verify(jsonb,text)',predecessor_body_sha256:'250d797ee52b7c5cf1d76ae9c07ba7b4903f8ea4b4f25074c17b1c0b9af70b33',successor_body_sha256:'5ab152bdedb516e2994f1b4201c4803ce837f7b096848c3651ad88ac052c23af',predecessor_definition_sha256:'cd24b1a87f472dc663c467f178dc1359b05272be1a1d90fca10ccd8786cb2a4d',invariant_attributes_sha256:'3ee3dbca4075deda383bfa41f19af14e9d54c866682c326ff06f9e950d686a70'})])});
/** Post-publication verification only; no import write/recovery authority. */
export const REVIEWED_STANDARD47_TRANSITION=Object.freeze({id:'STANDARD47_POST_PUBLICATION_VERIFY_ONLY',source_sha256:'15b400196725446d04757e431f27d815ed586a08b8c95ab73438ea1f1ead726f',predecessor_catalog_sha256:REVIEWED_STANDARD44_TRANSITION.predecessor_catalog_sha256,routines:Object.freeze([...REVIEWED_STANDARD46_TRANSITION.routines,Object.freeze({routine_identity:'naijue_erp.history_numeric_ledger_set_guard()',predecessor_body_sha256:'83d5ef1ec17d817433ac8b19b3921eba86208f2979a41581a198813bc88ddef3',successor_body_sha256:'f94e8788203bc83f35ebf872d7569faf59acc5d1fe1967a9889badf092fc8f16',predecessor_definition_sha256:'7616593650e2960486e073436fc5e07bc4444c0879a2c0fb1076b5fe26a70df1',invariant_attributes_sha256:'4a97039604c1baba01d8d0d12cb55c8194484089c3dd46adf23d3e815209c354'})])});
export interface StandardImportSuccessorCommittedPrefix {operation_id:string;public_request_sha256:string;committed_reply_sha256:string;}
function reviewedSuccessorTransition(id:string){if(id===REVIEWED_STANDARD44_TRANSITION.id)return REVIEWED_STANDARD44_TRANSITION;if(id===REVIEWED_STANDARD45_TRANSITION.id)return REVIEWED_STANDARD45_TRANSITION;if(id===REVIEWED_STANDARD46_TRANSITION.id)return REVIEWED_STANDARD46_TRANSITION;if(id===REVIEWED_STANDARD47_TRANSITION.id)return REVIEWED_STANDARD47_TRANSITION;throw new UnifiedImportExecutionError('SUCCESSOR_PROOF_INVALID');}
export interface StandardImportSuccessorCapture {format_version:'STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1';routine_identity:string;function_oid:string;predecessor_definition:string;predecessor_definition_sha256:string;predecessor_body_sha256:string;invariant_attributes_sha256:string;}
export interface StandardImportSuccessorProof {format_version:'STANDARD_IMPORT_REVIEWED_SUCCESSOR_V1';transition_id:string;source_sha256:string;original_plan_sha256:string;package_manifest_sha256:string;predecessor_target:StandardImportTarget;successor_target:StandardImportTarget;captures:StandardImportSuccessorCapture[];init_operation_id:string;init_public_request_sha256:string;init_committed_request_sha256:string;failed_operation_id:string;failed_public_request_sha256:string;prior_absence_evidence_sha256:string;committed_prefix?:StandardImportSuccessorCommittedPrefix[];}
export interface StandardImportPostPublicationSuccessorProof extends Omit<StandardImportSuccessorProof,'format_version'|'failed_operation_id'|'failed_public_request_sha256'|'prior_absence_evidence_sha256'|'committed_prefix'> {
 format_version:'STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1';committed_prefix:StandardImportSuccessorCommittedPrefix[];init_committed_reply_sha256:string;publication_operation_id:string;publication_public_request_sha256:string;publication_evidence_sha256:string;
}
export type StandardImportReviewedSuccessorProof=StandardImportSuccessorProof|StandardImportPostPublicationSuccessorProof;
/** Only metadata readback is authorized by a post-publication proof. */
export function assertReviewedStandardImportSuccessorCommand(p:StandardImportReviewedSuccessorProof,command:string):void {
 if(p.format_version==='STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1')requireInput(['verify','receipt-check','status'].includes(command),'SUCCESSOR_READ_ONLY');
}
export interface StandardImportSuccessorObservation {current_catalog_sha256:string;counterfactual_catalog_sha256:string;routines:{routine_identity:string;body_sha256:string;invariant_attributes_sha256:string;function_oid:string}[];}
export interface StandardImportSuccessorAdmission {readonly original_plan_sha256:string;readonly actual_target:Readonly<StandardImportTarget>;readonly proof_sha256:string;readonly failed_step_observed_state:'ABSENT'|'COMMITTED';readonly access_mode:'IMPORT_RECOVERY'|'POST_PUBLICATION_READ_ONLY';}
const successorAdmissions=new WeakSet<object>();
function successorProofGuard(ok:unknown):asserts ok {requireInput(ok,'SUCCESSOR_PROOF_INVALID');}
function assertSuccessorWriteAuthority(admission?:StandardImportSuccessorAdmission):void {if(admission){requireInput(successorAdmissions.has(admission),'SUCCESSOR_ADMISSION_INVALID');requireInput(admission.access_mode!=='POST_PUBLICATION_READ_ONLY','SUCCESSOR_READ_ONLY');}}
export function validateReviewedStandardImportSuccessorProof(plan:UnifiedImportPlan,p:StandardImportReviewedSuccessorProof):void {
 assertUnifiedImportPlan(plan);requireInput(plan.package_kind==='SYNTHETIC','REAL_DATA_NOT_AUTHORIZED_FOR_TEST_SCOPE');
 const t=reviewedSuccessorTransition(p?.transition_id);requireInput(digest(t.source_sha256),'SUCCESSOR_TRANSITION_NOT_FROZEN');
 const is47=p.format_version==='STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1';
 const expectedKeys=is47?'captures,committed_prefix,format_version,init_committed_reply_sha256,init_committed_request_sha256,init_operation_id,init_public_request_sha256,original_plan_sha256,package_manifest_sha256,predecessor_target,publication_evidence_sha256,publication_operation_id,publication_public_request_sha256,source_sha256,successor_target,transition_id':(t.id!==REVIEWED_STANDARD44_TRANSITION.id?'captures,committed_prefix,':'captures,')+'failed_operation_id,failed_public_request_sha256,format_version,init_committed_request_sha256,init_operation_id,init_public_request_sha256,original_plan_sha256,package_manifest_sha256,predecessor_target,prior_absence_evidence_sha256,source_sha256,successor_target,transition_id';
 successorProofGuard(plain(p)&&keys(p,expectedKeys)&&p.transition_id===t.id&&(is47?t.id===REVIEWED_STANDARD47_TRANSITION.id:t.id!==REVIEWED_STANDARD47_TRANSITION.id&&p.format_version==='STANDARD_IMPORT_REVIEWED_SUCCESSOR_V1')&&p.source_sha256===t.source_sha256&&p.original_plan_sha256===plan.plan_sha256&&p.package_manifest_sha256===plan.manifest_sha256&&!findCredentialPath(p));
 validateStandardImportTarget(p.predecessor_target);validateStandardImportTarget(p.successor_target);
 successorProofGuard(sameStandardImportTarget(plan.target!,p.predecessor_target)&&p.predecessor_target.catalog_sha256===t.predecessor_catalog_sha256&&p.successor_target.catalog_sha256!==p.predecessor_target.catalog_sha256&&['protocol','system_identifier','database_oid','database_name'].every(k=>p.predecessor_target[k as keyof StandardImportTarget]===p.successor_target[k as keyof StandardImportTarget]));
 successorProofGuard(Array.isArray(p.captures)&&p.captures.every(plain)&&p.captures.length===t.routines.length&&new Set(p.captures.map(c=>c.routine_identity)).size===t.routines.length);
 for(const c of p.captures){const r=t.routines.find(r=>r.routine_identity===c.routine_identity);successorProofGuard(r&&plain(c)&&keys(c,'format_version,function_oid,invariant_attributes_sha256,predecessor_body_sha256,predecessor_definition,predecessor_definition_sha256,routine_identity')&&c.format_version==='STANDARD_IMPORT_SUCCESSOR_PREDECESSOR_V1'&&/^\d+$/.test(c.function_oid)&&typeof c.predecessor_definition==='string'&&Buffer.byteLength(c.predecessor_definition)<=1024*1024&&sha256(c.predecessor_definition)===c.predecessor_definition_sha256&&c.predecessor_definition_sha256===r.predecessor_definition_sha256&&c.predecessor_body_sha256===r.predecessor_body_sha256&&c.invariant_attributes_sha256===r.invariant_attributes_sha256);}
 if(t.id!==REVIEWED_STANDARD44_TRANSITION.id)successorProofGuard(Array.isArray(p.committed_prefix)&&p.committed_prefix.length===(is47?7:t.id===REVIEWED_STANDARD46_TRANSITION.id?6:4)&&p.committed_prefix.every(c=>plain(c)&&keys(c,'committed_reply_sha256,operation_id,public_request_sha256')&&uuid(c.operation_id)&&digest(c.public_request_sha256)&&digest(c.committed_reply_sha256)));
 successorProofGuard(uuid(p.init_operation_id)&&[p.init_public_request_sha256,p.init_committed_request_sha256].every(digest));
 if(is47)successorProofGuard(uuid(p.publication_operation_id)&&[p.publication_public_request_sha256,p.publication_evidence_sha256,p.init_committed_reply_sha256].every(digest));
 else successorProofGuard(uuid(p.failed_operation_id)&&[p.failed_public_request_sha256,p.prior_absence_evidence_sha256].every(digest));
}
/** Read-only proof first. Never changes plan/inspection or generates new request
 * keys. A later exact-original COMMITTED failed step is a safe readback, not a
 * reason to blindly replay or to make previously known absence fake zero. */
export async function admitReviewedStandardImportSuccessor(plan:UnifiedImportPlan,client:StandardImportExecutionClient,p:StandardImportReviewedSuccessorProof,initialization:StandardImportRequest,failed:StandardImportRequest):Promise<StandardImportSuccessorAdmission>{
 validateReviewedStandardImportSuccessorProof(plan,p);
 successorProofGuard(client.protocol===STANDARD_IMPORT_PROTOCOL);
 const is47=p.format_version==='STANDARD_IMPORT_POST_PUBLICATION_SUCCESSOR_V1',barrierOperation=is47?p.publication_operation_id:p.failed_operation_id,barrierRequestHash=is47?p.publication_public_request_sha256:p.failed_public_request_sha256;
 successorProofGuard(initialization.package_manifest_sha256===plan.manifest_sha256&&initialization.namespace===plan.source_namespace&&initialization.cutoff_at===plan.cutoff_at&&initialization.operation_id===p.init_operation_id&&initialization.payload.mode==='NEW_EMPTY'&&initialization.batch_id===plan.baseline_batch_id&&initialization.plan_sha256===plan.plan_sha256&&requestHash(initialization)===p.init_public_request_sha256&&failed.operation_id!==initialization.operation_id&&failed.namespace===plan.source_namespace&&failed.cutoff_at===plan.cutoff_at&&(failed.batch_id===plan.baseline_batch_id||failed.batch_id===plan.document_batch_id)&&failed.operation_id===barrierOperation&&failed.plan_sha256===plan.plan_sha256&&failed.package_manifest_sha256===plan.manifest_sha256&&requestHash(failed)===barrierRequestHash);
 validateStandardImportRequest(initialization);validateStandardImportRequest(failed);
 successorProofGuard(plain(initialization.payload.admin));
 const canonical=compileStandardImportProgram(plan,initialization.payload.admin as unknown as StandardImportCurrentAdmin);
 const t=reviewedSuccessorTransition(p.transition_id),hasPrefix=t.id!==REVIEWED_STANDARD44_TRANSITION.id,barrierIndex=is47||t.id===REVIEWED_STANDARD46_TRANSITION.id?6:hasPrefix?4:0;
 successorProofGuard(requestHash(canonical.initialize)===requestHash(initialization)&&canonical.steps[barrierIndex]!==undefined&&requestHash(canonical.steps[barrierIndex]!.request)===requestHash(failed));
 if(hasPrefix){
  successorProofGuard(canonical.steps.slice(0,4).map(s=>s.method).join(',')==='masterChunk,baselineKeys,publish,documentChunk'&&canonical.steps[3]!.request.payload.mode==='STAGE'&&canonical.steps[4]?.method==='documentChunk'&&canonical.steps[4].request.payload.mode==='CHUNK');
  if(is47||t.id===REVIEWED_STANDARD46_TRANSITION.id)successorProofGuard(canonical.steps.length===7&&canonical.steps[5]?.method==='documentChunk'&&canonical.steps[5].request.payload.mode==='CHUNK'&&canonical.steps[6]?.method==='publish'&&canonical.steps[6].request.payload.phase==='DOCUMENTS');
  for(const [i,c] of p.committed_prefix!.entries())successorProofGuard(c.operation_id===canonical.steps[i]!.request.operation_id&&c.public_request_sha256===requestHash(canonical.steps[i]!.request));
 }else successorProofGuard(canonical.steps[0]?.method==='masterChunk');
 const actual=await client.inspectTarget();successorProofGuard(sameStandardImportTarget(actual,p.successor_target)&&actual.proof_scope==='SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
 requireInput(typeof client.inspectSuccessorCatalog==='function','SUCCESSOR_OBSERVER_NOT_IMPLEMENTED');
 const o=await client.inspectSuccessorCatalog(p.captures);
 successorProofGuard(plain(o)&&keys(o,'counterfactual_catalog_sha256,current_catalog_sha256,routines')&&o.current_catalog_sha256===p.successor_target.catalog_sha256&&o.counterfactual_catalog_sha256===p.predecessor_target.catalog_sha256&&Array.isArray(o.routines)&&o.routines.every(plain)&&o.routines.length===p.captures.length&&new Set(o.routines.map(r=>r.routine_identity)).size===p.captures.length);
 for(const r of o.routines){const capture=p.captures.find(c=>c.routine_identity===r.routine_identity),reviewed=t.routines.find(c=>c.routine_identity===r.routine_identity);successorProofGuard(capture&&reviewed&&plain(r)&&keys(r,'body_sha256,function_oid,invariant_attributes_sha256,routine_identity')&&r.body_sha256===reviewed.successor_body_sha256&&r.invariant_attributes_sha256===capture.invariant_attributes_sha256&&r.function_oid===capture.function_oid);}
 const init=decodeStandardImportReply(await client.status(initialization),initialization);successorProofGuard(init.state==='COMMITTED'&&init.request_sha256===p.init_committed_request_sha256);
 if(is47)successorProofGuard(requestHash(init)===p.init_committed_reply_sha256);
 let publicationReply:StandardImportReply|undefined;
 if(hasPrefix)for(const [i,c] of p.committed_prefix!.entries()){
  const original=canonical.steps[i]!.request,reply=decodeStandardImportReply(await client.status(original),original);
  successorProofGuard(reply.state==='COMMITTED'&&requestHash(reply)===c.committed_reply_sha256);if(is47&&i===6)publicationReply=reply;
 }
 const prior=is47?publicationReply!:decodeStandardImportReply(await client.status(failed),failed);
 if(is47)successorProofGuard(prior?.state==='COMMITTED');
 // Re-read actual current catalog after the lock waits; never reuse a stale view.
 successorProofGuard(sameStandardImportTarget(await client.inspectTarget(),p.successor_target));
 const admission=Object.freeze({original_plan_sha256:plan.plan_sha256,actual_target:Object.freeze(structuredClone(p.successor_target)),proof_sha256:requestHash(p),failed_step_observed_state:prior.state,access_mode:is47?'POST_PUBLICATION_READ_ONLY' as const:'IMPORT_RECOVERY' as const});successorAdmissions.add(admission);return admission;
}
