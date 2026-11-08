import {requestHashIncremental} from './stream-typed-hash.mjs';
import {explicitZeroApprovalDescriptor} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import type {ExplicitZeroApproval} from '../../packages/application/src/unified-explicit-zero-approval.ts';
import {isNodeScryptPasswordHash} from '../../packages/authentication/src/passwords.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {parseStrictJson} from '../../packages/application/src/unified-import-contract.ts';
import {assertPublicValuesExcludePrivateInputs} from './execution-client.ts';
import type {StandardImportRequest,StandardImportStep} from '../../packages/application/src/unified-import-execution.ts';
import type {WholePackageClient,WholePackageIdentity,WholePackageKernel} from './whole-package-client.ts';
/** Experimental adapter for the versioned SQL candidate. Not wired into CLI.
 * A separately reviewed host must authenticate the controller, verify target,
 * ACL/source pins and SET ROLE authority on the SAME exclusive client. Never
 * log/serialize the private parameter. No SQL installation or grants here. */
const INIT='SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2';
const IMPORTER='SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2';
const sql={inspect:'SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json',prepare:'SELECT naijue_erp.standard_whole_package_prepare_v2($1::jsonb,$2::text)::text AS result_json',step:'SELECT naijue_erp.standard_whole_package_step_v2($1::uuid,$2::integer,$3::text,$4::jsonb)::text AS result_json',finish:'SELECT naijue_erp.standard_whole_package_finish_v2($1::uuid)::text AS result_json'} as const;
function object(v:unknown):v is Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v)}
function sameKeys(v:Record<string,unknown>,names:string){return Object.keys(v).sort().join(',')===names}
async function role<C extends WholePackageClient>(c:C,sqlText:string){const r=await c.query(sqlText);if(r.command!=='SET')throw Error('ROLE_ACK_INVALID')}
async function one<C extends WholePackageClient>(c:C,sqlText:string,values:unknown[]):Promise<Record<string,unknown>>{const r=await c.query(sqlText,values);if(r.command!=='SELECT'||!Array.isArray(r.rows)||r.rows.length!==1||typeof r.rows[0]?.result_json!=='string'||Buffer.byteLength(r.rows[0].result_json)>65536)throw Error('KERNEL_REPLY_INVALID');let x:unknown;try{x=parseStrictJson(r.rows[0].result_json)}catch{throw Error('KERNEL_REPLY_INVALID')}if(!object(x))throw Error('KERNEL_REPLY_INVALID');return x}
function pending(v:Record<string,unknown>,r:StandardImportRequest){if(!sameKeys(v,'batch_id,cursor,operation_id,protocol,receipt,request_sha256,sequence,state')||v.protocol!=='STANDARD_IMPORT_SQL_V1'||v.state!=='PENDING_TRANSACTION'||v.operation_id!==r.operation_id||v.batch_id!==r.batch_id||typeof v.request_sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.request_sha256)||!Number.isSafeInteger(v.sequence)||!Number.isSafeInteger(v.cursor)||Number(v.sequence)<0||Number(v.cursor)<0||!object(v.receipt))throw Error('KERNEL_REPLY_INVALID')}
export function createWholePackageSqlKernel<C extends WholePackageClient>(encodedScrypt:string,options:{explicitZeroApproval?:ExplicitZeroApproval}={}):WholePackageKernel<C>{
 if(!isNodeScryptPasswordHash(encodedScrypt))throw TypeError('PRIVATE_CREDENTIAL_FORMAT_INVALID');
 const approved=options.explicitZeroApproval?explicitZeroApprovalDescriptor(options.explicitZeroApproval):null;
 // Validate the exact serialized public request, not just recognizable field
 // names. Keep an owned snapshot for reply binding across asynchronous SQL.
 const publicRequest=(request:StandardImportRequest)=>{
  const serialized=JSON.stringify(request),snapshot=parseStrictJson(serialized) as StandardImportRequest;
  assertPublicValuesExcludePrivateInputs(snapshot,[encodedScrypt]);
  return {serialized,snapshot};
 };
 const checkApproval=(request:StandardImportRequest)=>{if(requestHash(request.payload.explicit_zero_approval??null)!==requestHash(approved))throw Error('EXPLICIT_ZERO_APPROVAL_BINDING_INVALID');};
 let boundClient:C|null=null;
 let root:string|null=null,initHash:string|null=null,stage:'NEW'|'INSPECTED'|'PREPARED'|'DONE'='NEW';
 return Object.freeze({
  async lockAndInspect(client:C,identity:WholePackageIdentity,initialize:StandardImportRequest){if(stage!=='NEW'||boundClient!==null)throw Error('KERNEL_STATE_INVALID');const owned=publicRequest(initialize);checkApproval(owned.snapshot);if(stage!=='NEW'||boundClient!==null)throw Error('KERNEL_STATE_INVALID');boundClient=client;await role(client,INIT);const r=await one(client,sql.inspect,[owned.serialized,encodedScrypt]);root=owned.snapshot.operation_id;initHash=requestHashIncremental(owned.snapshot);stage='INSPECTED';if(r.state==='ABSENT'&&sameKeys(r,'state'))return {state:'ABSENT' as const};if(r.state==='COMMITTED'&&sameKeys(r,'packageSha256,planSha256,state,summary')&&r.packageSha256===identity.packageSha256&&r.planSha256===identity.planSha256)return{state:'COMMITTED' as const,packageSha256:identity.packageSha256,planSha256:identity.planSha256,summary:r.summary};throw Error('KERNEL_REPLY_INVALID')},
  async initialize(client:C,_identity:WholePackageIdentity,request:StandardImportRequest){if(boundClient!==client||stage!=='INSPECTED')throw Error('KERNEL_STATE_INVALID');const owned=publicRequest(request);checkApproval(owned.snapshot);if(root!==owned.snapshot.operation_id||initHash!==(requestHashIncremental(owned.snapshot)))throw Error('KERNEL_STATE_INVALID');const r=await one(client,sql.prepare,[owned.serialized,encodedScrypt]);pending(r,owned.snapshot);await role(client,IMPORTER);stage='PREPARED'},
  async applyStep(client:C,step:StandardImportStep,ordinal:number){if(boundClient!==client||stage!=='PREPARED'||root===null||!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>2147483647)throw Error('KERNEL_STATE_INVALID');const phase=step.method==='masterChunk'?'MASTER':step.method==='baselineKeys'?'KEYS':step.method==='documentChunk'?'DOCUMENTS':step.method==='publish'?'PUBLISH':null;if(phase===null)throw Error('STEP_INVALID');const owned=publicRequest(step.request);pending(await one(client,sql.step,[root,ordinal,phase,owned.serialized]),owned.snapshot)},
  async summarize(client:C,_identity:WholePackageIdentity){if(boundClient!==client||stage!=='PREPARED'||root===null)throw Error('KERNEL_STATE_INVALID');const r=await one(client,sql.finish,[root]);if(!sameKeys(r,'state,summary')||r.state!=='PENDING_TRANSACTION'||!object(r.summary))throw Error('KERNEL_REPLY_INVALID');stage='DONE';return r.summary}
 });
}
