import {HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256} from './unified-import-contract.ts';
import { assertWholeSalesAdmissionV1 } from '../../../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import {types} from 'node:util';
import {requestHash} from './request-hash.ts';
import {stableImportId} from './inventory-cutoff-import.ts';
import {SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256} from './unified-import-contract.ts';
import {buildWholePackageSourcePlanV2,assertUnifiedImportPlanV2,STANDARD_IMPORT_PLAN_VERSION_V2,STANDARD_IMPORT_COMPILER_V2} from './unified-import-execution-v2.ts';
import type {BuildUnifiedImportPlanInputV2} from './unified-import-execution-v2.ts';
import {materializeStandardImportProgram,STANDARD_IMPORT_PROTOCOL} from './unified-import-execution.ts';
import type {StandardImportRequest} from './unified-import-execution.ts';
import {MASTER_CHUNK_PLAN_V2,planMasterChunksV2} from './unified-import-master-chunks-v2.ts';
const {isProxy,isUint8Array,isSharedArrayBuffer}=types;
const profile='STANDARD_WHOLE_PACKAGE_PROGRAM_V2' as const;
function fail(code:string):never{throw new Error('WHOLE_PACKAGE_PROFILE_'+code);}
function snapshot<T>(input:T):T{
 const active=new WeakSet<object>();let nodes=0,bytes=0;
 const typedPrototype=Object.getPrototypeOf(Uint8Array.prototype) as object;
 const bufferGetter=Object.getOwnPropertyDescriptor(typedPrototype,'buffer')!.get!;
 const lengthGetter=Object.getOwnPropertyDescriptor(typedPrototype,'length')!.get!;
 function copy(v:unknown,depth:number):unknown{
  if(++nodes>2_000_000||depth>64)fail('INPUT_BOUND');
  if(v===null||typeof v==='string'||typeof v==='boolean'||v===undefined)return v;
  if(typeof v==='number'){if(!Number.isSafeInteger(v))fail('INPUT_NUMBER');return v;}
  if(typeof v!=='object'||isProxy(v))fail('INPUT_DESCRIPTOR');
  if(isUint8Array(v)){
   const proto=Object.getPrototypeOf(v);if(proto!==Uint8Array.prototype&&proto!==Buffer.prototype)fail('INPUT_BYTES');
   const buffer=bufferGetter.call(v);if(isSharedArrayBuffer(buffer))fail('SHARED_BYTES');
   const length=lengthGetter.call(v) as number;bytes+=length;if(bytes>256*1024*1024)fail('INPUT_BOUND');
   const out=new Uint8Array(length);Uint8Array.prototype.set.call(out,v);return out;
  }
  if(active.has(v))fail('INPUT_CYCLE');active.add(v);
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);if(proto!==(array?Array.prototype:Object.prototype))fail('INPUT_DESCRIPTOR');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(v);
  if(array){const length=descriptors.length?.value as unknown;if(!Number.isSafeInteger(length)||Number(length)<0||keys.length!==Number(length)+1)fail('INPUT_DESCRIPTOR');const out:unknown[]=[];
   for(let i=0;i<Number(length);i++){const d=descriptors[String(i)];if(!d||!d.enumerable||!Object.hasOwn(d,'value'))fail('INPUT_DESCRIPTOR');out.push(copy(d.value,depth+1));}active.delete(v);return out;}
  const out:Record<string,unknown>={};for(const key of keys){if(typeof key!=='string')fail('INPUT_DESCRIPTOR');const d=descriptors[key]!;if(!d.enumerable||!Object.hasOwn(d,'value'))fail('INPUT_DESCRIPTOR');Object.defineProperty(out,key,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}active.delete(v);return out;
 }
 return copy(input,0) as T;
}

function freeze<T>(v:T):T{if(v!==null&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
/** Opt-in whole-transaction compiler. The source schema/profile and initializer
 * identity bind the plan BEFORE any operation/request key is constructed.
 * Does not modify V1/V2 programs, install SQL, authenticate or open a connection.
 * Source is an owned descriptor-safe snapshot, not independently verified original
 * spreadsheet bytes. The pre-existing full package validator remains mandatory. */
export function compileStandardWholePackageProfile(input:BuildUnifiedImportPlanInputV2){
 const owned=snapshot(input);
 // Keep the verified, deeply frozen approval capability; snapshot copies cannot authorize.
 if(input.historicalSalesHallApproval)owned.historicalSalesHallApproval=input.historicalSalesHallApproval;
 if(input.currentEffectiveAlignmentEvidence)owned.currentEffectiveAlignmentEvidence=input.currentEffectiveAlignmentEvidence;
 if(input.explicitZeroApproval)owned.explicitZeroApproval=input.explicitZeroApproval;
 if(input.historicalStaffHallApproval)owned.historicalStaffHallApproval=input.historicalStaffHallApproval;
 if(input.historicalSalesAdmission)owned.historicalSalesAdmission=input.historicalSalesAdmission;
 const schema=owned.pkg.manifest.schema_contract.source_declarations_sha256;
 if(schema===HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256)fail('HISTORICAL_HALL_PROFILE_OFFLINE_ONLY');
 if(schema===HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256){if(!owned.historicalSalesAdmission||!owned.target)fail('SOURCE_ONLY');assertWholeSalesAdmissionV1(owned.historicalSalesAdmission,owned.target)}
 if(![SCHEMA_DECLARATIONS_SHA256,NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256].includes(schema))fail('SCHEMA_UNKNOWN');
 const source=buildWholePackageSourcePlanV2(owned);assertUnifiedImportPlanV2(source);
 const binding={format_version:profile,source_plan_sha256:source.plan_sha256,schema_declarations_sha256:schema,document_chunk_rows:500};
 const plan_sha256=requestHash(binding);
 const schedule=planMasterChunksV2({format_version:MASTER_CHUNK_PLAN_V2,source_namespace:source.source_namespace,package_manifest_sha256:source.manifest_sha256,execution_plan_sha256:plan_sha256,baseline_batch_id:source.baseline_batch_id,master_rows:source.master_rows,max_chunk_rows:source.max_master_chunk_rows});
 const request=(kind:string,index:number,payload:Record<string,unknown>,batchId=source.baseline_batch_id):StandardImportRequest=>{
  const operation=kind==='MASTER'?schedule.chunks[index]!.operation_id:stableImportId('standard-whole-package-operation-v2',batchId,plan_sha256,kind,String(index));
  return{protocol:STANDARD_IMPORT_PROTOCOL,operation_id:operation,request_key:operation,batch_id:batchId,plan_sha256,package_manifest_sha256:source.manifest_sha256,namespace:source.source_namespace,cutoff_at:source.cutoff_at,payload:kind==='INITIALIZE'?{...payload,schema_declarations_sha256:schema}:payload};
 };
 const wire=materializeStandardImportProgram(source,source.initialization_identity,{master_chunks:schedule.chunks.map(c=>c.rows),request,document_chunk_rows:500,initialization_execution_contract:{format_version:STANDARD_IMPORT_PLAN_VERSION_V2,compiler_version:STANDARD_IMPORT_COMPILER_V2,scheduler_version:MASTER_CHUNK_PLAN_V2,max_master_chunk_rows:source.max_master_chunk_rows,master_chunks:schedule.chunks.length,master_schedule_layout_sha256:source.master_schedule_layout_sha256,master_chunk_plan_sha256:schedule.chunk_plan_sha256,initialization_identity_sha256:requestHash(source.initialization_identity)}});
 const program={...binding,plan_sha256,...wire,master_schedule:schedule};
 return freeze({...program,program_sha256:requestHash(program)});
}
