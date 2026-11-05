import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { assertReviewedNativeImportSchema, checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { NATIVE_PAYMENT_IMPORT_VERSION, validatePreparedNativePaymentImportChunk } from "../../../packages/application/src/native-payment-import.ts";
import type { NativePaymentEntity, NativePaymentReference, PreparedNativePaymentRow, PreparedNativePaymentImportChunk, NativePaymentImportResult, NativePaymentImportStore } from "../../../packages/application/src/native-payment-import.ts";
import type { JsonObject } from "../../../packages/application/src/history-storage-contract.ts";
import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { PgSalesPool, PgSalesClient } from "./sales-unit-of-work.ts";
const TABLES={PAYMENT_METHOD:"payment_method",PAYMENT_ACCOUNT:"payment_account",PAYMENT_ACCOUNT_HALL:"payment_account_hall"} as const;
const must=(ok:unknown,message:string):void=>requireDomain(ok,"NATIVE_PAYMENT_STORE",message);
export function nativePaymentSourceEvidence(row:PreparedNativePaymentRow):JsonObject {
 const s=row.source;return {id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,
  source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:row.fieldProvenance};
}
export function nativePaymentBindingEvidence(row:PreparedNativePaymentRow):JsonObject {
 const n=row.nativeSnapshot,e=row.entity;return {batch_id:row.source.batchId,entity_type:e,source_key:row.source.sourceKey,source_row_id:row.source.id,
  native_payment_method_id:e==="PAYMENT_METHOD"?n.id!:e==="PAYMENT_ACCOUNT"?n.payment_method_id!:null,
  native_payment_account_id:e==="PAYMENT_ACCOUNT"?n.id!:e==="PAYMENT_ACCOUNT_HALL"?n.payment_account_id!:null,
  native_hall_id:e==="PAYMENT_ACCOUNT_HALL"?n.hall_id!:null,native_snapshot:n,evidence_fingerprint:row.fingerprint,validator_version:NATIVE_PAYMENT_IMPORT_VERSION};
}
const targetPredicate=(e:NativePaymentEntity)=>e==="PAYMENT_ACCOUNT_HALL"?"n.payment_account_id=$1::uuid AND n.hall_id=$3::uuid":"n.id=$1::uuid";
const targetIdentity=(r:PreparedNativePaymentRow)=>JSON.stringify([r.entity,r.nativeSnapshot.id??r.nativeSnapshot.payment_account_id,r.nativeSnapshot.hall_id??null]);
/** Explicit trusted internal creator only. Independent source authorization is mandatory at orchestration.
 * No target adoption/upsert, live command, stock/checkpoint/publication or automatic retry. */
export class PostgresNativePaymentImportStore implements NativePaymentImportStore {
 protected readonly pool:PgSalesPool;constructor(pool:PgSalesPool){if(typeof pool?.connect!=="function")throw TypeError("Explicit payment pool required");this.pool=pool;}
 async stage(original:PreparedNativePaymentImportChunk):Promise<NativePaymentImportResult>{
  validatePreparedNativePaymentImportChunk(original);return this.stageValidated(structuredClone(original));
 }
 protected async stageValidated(chunk:PreparedNativePaymentImportChunk,runtime26?:NativeRuntime26Capability):Promise<NativePaymentImportResult>{
  const client=await this.pool.connect();let began=false,committing=false,discard:Error|undefined;
  try{if(runtime26)await runtime26.assertReady(client,"IMPORT_STAGE");await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");began=true;const result=await this.write(client,chunk,runtime26);committing=true;await client.query("COMMIT");return result;}
  catch(error){if(!began||committing)discard=error instanceof Error?error:Error("Payment outcome unknown");
   else try{await client.query("ROLLBACK");}catch(rollback){discard=rollback instanceof Error?rollback:Error("Payment rollback failed");throw new AggregateError([error,rollback],"Payment failure/rollback; client discarded");}throw error;
  }finally{client.release(discard);}
 }
 private async write(client:PgSalesClient,chunk:PreparedNativePaymentImportChunk,runtime26?:NativeRuntime26Capability):Promise<NativePaymentImportResult>{
  const input=chunk.input;await client.query("/* native-payment:lock */ SELECT naijue_erp.cutoff_import_lock()");
  const schemas=(await client.query("/* native-payment:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration")).rows;
  must(schemas.length===1,"Exact reviewed schema17 required");
  if(runtime26){const versions=schemas[0]!.versions;must(Array.isArray(versions)&&versions.length===26&&versions.every((v,i)=>v===i+1),"Exact successor prefix26 required");}
  else{assertReviewedNativeImportSchema(schemas[0]!.versions,{minimumVersion:17,errorCode:"NATIVE_PAYMENT_SCHEMA_NOT_READY"});await assertNativeImportAccountingGuards(client);}
  const batches=(await client.query(`/* native-payment:batch */ SELECT id,mapping_version,status,source_hash,source_name,
    EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') already_published FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[input.batchId])).rows;
  const b=batches[0];must(batches.length===1&&b?.id===input.batchId&&b.mapping_version===chunk.mappingVersion&&(b.status==="STAGED"||b.status==="VALIDATING")
   &&b.source_hash===input.selection.selectionSha256&&b.source_name===input.fixedSourceNamespace&&b.already_published===false,"Exact open unpublished namespace/selection batch required");
  const sorted=[...chunk.rows].sort((a,b)=>targetIdentity(a)<targetIdentity(b)?-1:targetIdentity(a)>targetIdentity(b)?1:0);
  const targets=new Map<string,{exists:boolean;equal:boolean}>(),refs=new Map<string,NativePaymentReference>(),current=new Map<string,boolean>();
  for(const row of sorted){const n=row.nativeSnapshot;
   const actual=(await client.query(`/* native-payment:target:${row.entity} */ SELECT to_jsonb(n)=$2::jsonb native_equal FROM naijue_erp.${TABLES[row.entity]} n
    WHERE ${targetPredicate(row.entity)} FOR UPDATE`,row.entity==="PAYMENT_ACCOUNT_HALL"?[n.payment_account_id,JSON.stringify(n),n.hall_id]:[n.id,JSON.stringify(n)])).rows;
   must(actual.length<=1,"Repeated native target");targets.set(targetIdentity(row),{exists:actual.length===1,equal:actual.length===0||actual[0]!.native_equal===true});
   for(const ref of Object.values(row.references)){const key=ref.entity+"/"+ref.nativeId,previous=refs.get(key);must(!previous||requestHash(previous)===requestHash(ref),"Conflicting dependency identities in one chunk");refs.set(key,ref);}
  }
  for(const [key,ref] of [...refs].sort(([a],[b])=>a<b?-1:a>b?1:0)){
   const table=ref.entity==="HALL"?"hall":TABLES[ref.entity];
   const actual=(await client.query(`/* native-payment:reference-target */ SELECT to_jsonb(n)=$2::jsonb native_equal FROM naijue_erp.${table} n WHERE id=$1::uuid FOR SHARE`,[ref.nativeId,JSON.stringify(ref.nativeSnapshot)])).rows;
   must(actual.length===1,"Native dependency must exist under stable identity lock");current.set(key,actual[0]!.native_equal===true);
  }
  for(const ref of refs.values()){
   const hall=ref.entity==="HALL",table=hall?"import_header_native_reference":"import_native_payment_binding";
   const column=hall?"native_hall_id":ref.entity==="PAYMENT_METHOD"?"native_payment_method_id":"native_payment_account_id";
   const found=(await client.query(`/* native-payment:reference-binding */ SELECT native_snapshot=$4::jsonb AND ${column}=$5::uuid binding_equal
    FROM naijue_erp.${table} WHERE batch_id=$1::uuid AND entity_type=$2 AND source_key=$3 FOR SHARE`,[input.batchId,ref.entity,ref.sourceKey,JSON.stringify(ref.nativeSnapshot),ref.nativeId])).rows;
   must(found.length===1&&found[0]!.binding_equal===true,"Exact typed same-batch dependency creation proof required");
  }
  const fresh:PreparedNativePaymentRow[]=[];let replayed=0;
  for(const row of sorted){const s=row.source,binding=nativePaymentBindingEvidence(row),source=nativePaymentSourceEvidence(row),e=row.entity;
   const target=e==="PAYMENT_ACCOUNT_HALL"?"x.native_payment_account_id=$6::uuid AND x.native_hall_id=$7::uuid":`x.${e==="PAYMENT_METHOD"?"native_payment_method_id":"native_payment_account_id"}=$6::uuid`;
   const previous=(await client.query(`/* native-payment:binding-replay */ SELECT to_jsonb(x)=$4::jsonb binding_equal FROM naijue_erp.import_native_payment_binding x
    WHERE x.batch_id=$1::uuid AND ((x.entity_type=$2 AND x.source_key=$3) OR x.source_row_id=$5::uuid OR (x.entity_type=$2 AND ${target})) ORDER BY x.entity_type,x.source_key LIMIT 2 FOR SHARE`,
    [input.batchId,e,s.sourceKey,JSON.stringify(binding),s.id,e==="PAYMENT_METHOD"?binding.native_payment_method_id:binding.native_payment_account_id,...(e==="PAYMENT_ACCOUNT_HALL"?[binding.native_hall_id]:[])])).rows;
   const sources=(await client.query(`/* native-payment:source-replay */ SELECT (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$2::jsonb source_equal
    FROM naijue_erp.import_source_row s WHERE s.id=$1::uuid OR (s.batch_id=$3::uuid AND ((s.entity_type=$4 AND s.source_key=$5)
      OR (s.source_file_sha256=$6 AND s.sheet=$7 AND s.row_no=$8::bigint))) ORDER BY s.id LIMIT 2 FOR SHARE`,
    [s.id,JSON.stringify(source),input.batchId,e,s.sourceKey,s.sourceFileSha256,s.sheet,s.rowNo])).rows;
   const t=targets.get(targetIdentity(row))!;
   if(previous.length||sources.length){must(t.exists&&previous.length===1&&previous[0]!.binding_equal===true&&sources.length===1&&sources[0]!.source_equal===true,"Partial/orphan/changed payment replay refused");replayed++;}
   else{must(!t.exists,"Existing native target without exact creation proof cannot be adopted");fresh.push(row);}
  }
  for(const row of fresh)if(row.entity==="PAYMENT_ACCOUNT")for(const ref of Object.values(row.references))must(current.get(ref.entity+"/"+ref.nativeId)===true,"New account requires exact current method snapshot; replay does not grant new creation");
  for(const row of fresh){const table=TABLES[row.entity],n=row.nativeSnapshot;
   const created=await client.query(`/* native-payment:create:${row.entity} */ INSERT INTO naijue_erp.${table} SELECT (jsonb_populate_record(NULL::naijue_erp.${table},$1::jsonb)).* RETURNING to_jsonb(${table}) native_snapshot`,[JSON.stringify(n)]);
   must(created.rowCount===1&&requestHash(created.rows[0]!.native_snapshot)===requestHash(n),"Actual native creation readback differs");
  }
  for(const row of fresh){const s=row.source,source=nativePaymentSourceEvidence(row);
   const created=await client.query(`/* native-payment:source-create */ INSERT INTO naijue_erp.import_source_row(id,batch_id,entity_type,source_key,file_ref,sheet,row_no,source_file_sha256,row_sha256,raw_fields,normalized_fields,field_provenance)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::bigint,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) RETURNING id`,
    [s.id,input.batchId,row.entity,s.sourceKey,s.fileRef,s.sheet,s.rowNo,s.sourceFileSha256,s.rowSha256,JSON.stringify(s.rawFields),JSON.stringify(s.normalizedFields),JSON.stringify(source.field_provenance)]);
   must(created.rowCount===1,"Exactly one immutable original occurrence required");
   const binding=nativePaymentBindingEvidence(row),cols=Object.keys(binding);
   const recorded=await client.query(`/* native-payment:binding-create */ INSERT INTO naijue_erp.import_native_payment_binding(${cols.join(",")}) VALUES(${cols.map((c,i)=>`$${i+1}${c.endsWith("_id")?"::uuid":c==="native_snapshot"?"::jsonb":""}`).join(",")}) RETURNING source_row_id`,cols.map(c=>c==="native_snapshot"?JSON.stringify(binding[c]):binding[c]));
   must(recorded.rowCount===1,"Exactly one typed payment creation binding required");
  }
  return {inserted:fresh.length,replayed,nativeCurrentMatchesCreation:[...targets.values()].every(t=>t.equal)&&[...current.values()].every(Boolean)};
 }
}

/** Unchanged payment facts under an independently reviewed exact26 runtime only. */
export class PostgresNativePaymentImportStore26 extends PostgresNativePaymentImportStore {
 private readonly runtime26:NativeRuntime26Capability;
 constructor(pool:PgSalesPool,runtime26:NativeRuntime26Capability){super(pool);const checked=checkedNativeRuntime26Capability(runtime26);if(!checked)throw TypeError("Actual successor runtime capability required");this.runtime26=checked;}
 override async stage(original:PreparedNativePaymentImportChunk):Promise<NativePaymentImportResult>{validatePreparedNativePaymentImportChunk(original);return this.stageValidated(structuredClone(original),this.runtime26);}
}
