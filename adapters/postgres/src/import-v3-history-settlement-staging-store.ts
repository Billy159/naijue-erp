import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import { HISTORY_SETTLEMENT_VERSION,historySettlementRequestHash,validatePreparedHistorySettlementChunk } from "../../../packages/application/src/import-v3-history-settlement.ts";
import type { HistoryPaymentBinding,HistorySettlementStagingStore,PreparedHistorySettlementChunk,PreparedHistorySettlementRow } from "../../../packages/application/src/import-v3-history-settlement.ts";
import type { HistorySalesHeaderBinding } from "../../../packages/application/src/import-v3-history-sales-detail.ts";
import type { JsonObject } from "../../../packages/application/src/history-storage-contract.ts";
import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import type { PgSalesPool,PgSalesClient } from "./sales-unit-of-work.ts";
type Scope={batchId:string;fixedSourceNamespace:string;selectionSha256:string};
const must=(ok:unknown,message:string):void=>requireDomain(ok,"HISTORY_SETTLEMENT_STORE",message);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function sourceEvidence(chunk:PreparedHistorySettlementChunk,row:PreparedHistorySettlementRow):JsonObject {
 const s=row.source;return {id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,
  field_provenance:{...row.fieldProvenance,history_settlement_staging:{validator_version:HISTORY_SETTLEMENT_VERSION,fingerprint:row.fingerprint,selection:{...chunk.input.selection},header:{...row.header},account:{...row.account},method:row.method?{...row.method}:null}}};
}
async function schema(client:PgSalesClient,resolver=false):Promise<void>{
 const rows=(await client.query(`/* settlement:${resolver?"resolver-schema":"schema"} */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration`)).rows;
 must(rows.length===1,"Exact reviewed native payment schema required");assertReviewedNativeImportSchema(rows[0]!.versions,{minimumVersion:17,errorCode:"HISTORY_SETTLEMENT_SCHEMA_NOT_READY"});await assertNativeImportAccountingGuards(client);
}
async function checkHeader(client:PgSalesClient,scope:Scope,h:HistorySalesHeaderBinding,locks:boolean):Promise<void>{
 const rows=(await client.query(`/* settlement:check-header */ SELECT h.id FROM naijue_erp.history_sales_header h
  JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
  WHERE h.batch_id=$1::uuid AND h.id=$2::uuid AND s.id=$3::uuid AND s.source_key=$4 AND s.entity_type='SALES_HEADER'
    AND s.source_file_sha256=$5 AND s.row_sha256=$6 AND h.version=1
    AND s.raw_fields->>'来源编号'=s.source_key AND s.normalized_fields->>'来源编号'=s.source_key
    AND s.field_provenance->'history_header_mapping'->>'validator_version'='V3_HISTORY_HEADER_1'
    AND s.field_provenance->'history_header_staging'->>'validator_version'='V3_HISTORY_HEADER_STAGE_1'
    AND s.field_provenance->'history_header_staging'->'selection'->>'selectionSha256'=$7 ${locks?"FOR SHARE OF h,s":""}`,
  [scope.batchId,h.nativeId,h.sourceRowId,h.sourceKey,h.sourceFileSha256,h.rowSha256,scope.selectionSha256])).rows;
 must(rows.length===1,"Exact immutable selected same-batch historical header required");
}
async function checkPayment(client:PgSalesClient,scope:Scope,p:HistoryPaymentBinding,locks:boolean):Promise<void>{
 const account=p.entity==="PAYMENT_ACCOUNT",column=account?"native_payment_account_id":"native_payment_method_id",table=account?"payment_account":"payment_method";
 const rows=(await client.query(`/* settlement:check-payment */ SELECT n.id FROM naijue_erp.import_native_payment_binding b
  JOIN naijue_erp.import_source_row s ON s.batch_id=b.batch_id AND s.id=b.source_row_id JOIN naijue_erp.${table} n ON n.id=b.${column}
  WHERE b.batch_id=$1::uuid AND n.id=$2::uuid AND b.source_row_id=$3::uuid AND b.source_key=$4
    AND s.source_file_sha256=$5 AND s.row_sha256=$6 AND b.evidence_fingerprint=$7 AND b.native_snapshot=$8::jsonb
    AND b.entity_type=$10 AND s.entity_type=b.entity_type AND s.source_key=b.source_key
    AND s.raw_fields->>'来源编号'=s.source_key AND s.normalized_fields->>'来源编号'=s.source_key
    AND b.validator_version='NATIVE_PAYMENT_IMPORT_V1'
    AND s.field_provenance->'native_payment_import'->>'validator_version'=b.validator_version
    AND s.field_provenance->'native_payment_import'->>'evidence_fingerprint'=b.evidence_fingerprint
    AND s.field_provenance->'native_payment_import'->'native_snapshot'=b.native_snapshot
    AND s.field_provenance->'native_payment_import'->'selection'->>'selectionSha256'=$9 ${locks?"FOR SHARE OF b,s,n":""}`,
  [scope.batchId,p.nativeId,p.sourceRowId,p.sourceKey,p.sourceFileSha256,p.rowSha256,p.fingerprint,JSON.stringify(p.nativeSnapshot),scope.selectionSha256,p.entity])).rows;
 // Native identity existence only. Today's account.method/name/enabled never rewrites or invalidates original history snapshots.
 must(rows.length===1,"Exact immutable typed same-batch payment creation/source binding required");
}
/** Only original source + typed historical settlement. No native payment writes, stock, progress, receipt or publication. */
export class PostgresHistorySettlementStagingStore implements HistorySettlementStagingStore {
 private readonly pool:PgSalesPool;constructor(pool:PgSalesPool){if(typeof pool?.connect!=="function")throw TypeError("Explicit settlement pool required");this.pool=pool;}
 async stage(original:PreparedHistorySettlementChunk):Promise<{inserted:number;replayed:number}>{
  validatePreparedHistorySettlementChunk(original);const chunk=structuredClone(original),client=await this.pool.connect();let began=false,committing=false,discard:Error|undefined;
  try{await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");began=true;const result=await this.write(client,chunk);committing=true;await client.query("COMMIT");return result;}
  catch(error){if(!began||committing)discard=error instanceof Error?error:Error("Settlement outcome unknown");else try{await client.query("ROLLBACK");}catch(rollback){discard=rollback instanceof Error?rollback:Error("Settlement rollback failed");throw new AggregateError([error,rollback],"Settlement staging and rollback failed; client discarded");}throw error;}
  finally{client.release(discard);}
 }
 private async identity(client:PgSalesClient,chunk:PreparedHistorySettlementChunk,row:PreparedHistorySettlementRow):Promise<"NEW"|"REPLAY">{
  const s=row.source,v=row.settlement;
  const sources=(await client.query(`/* settlement:source-replay */ SELECT s.id,(to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$7::jsonb source_equal
   FROM naijue_erp.import_source_row s JOIN naijue_erp.import_batch b ON b.id=s.batch_id WHERE s.id=$1::uuid
    OR (b.source_name=$8 AND s.entity_type='SETTLEMENT' AND s.source_key=$3)
    OR (s.batch_id=$2::uuid AND s.source_file_sha256=$4 AND s.sheet=$5 AND s.row_no=$6::bigint) ORDER BY s.id FOR SHARE OF s`,
   [s.id,s.batchId,s.sourceKey,s.sourceFileSha256,s.sheet,s.rowNo,JSON.stringify(sourceEvidence(chunk,row)),chunk.input.fixedSourceNamespace])).rows;
  const typed=(await client.query(`/* settlement:typed-replay */ SELECT x.id,to_jsonb(x)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.history_sales_settlement,$5::jsonb)) settlement_equal
   FROM naijue_erp.history_sales_settlement x WHERE x.id=$1::uuid OR x.source_row_id=$2::uuid OR (x.header_id=$3::uuid AND x.line_no=$4::integer) ORDER BY x.id FOR SHARE OF x`,
   [v.id,s.id,v.header_id,v.line_no,JSON.stringify(v)])).rows;
  if(!sources.length&&!typed.length)return "NEW";
  must(sources.length===1&&typed.length===1&&sources[0]!.id===s.id&&typed[0]!.id===v.id&&sources[0]!.source_equal===true&&typed[0]!.settlement_equal===true,"Changed/partial/orphan/alternate settlement source or projection cannot be adopted");return "REPLAY";
 }
 private async write(client:PgSalesClient,chunk:PreparedHistorySettlementChunk){
  const input=chunk.input,scope={batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,selectionSha256:input.selection.selectionSha256};
  await client.query("/* settlement:cutoff */ SELECT naijue_erp.cutoff_import_lock()");await schema(client);
  const batches=(await client.query(`/* settlement:batch */ SELECT id,mapping_version,status,source_hash,source_name,EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') already_published
   FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[input.batchId])).rows,b=batches[0];
  must(batches.length===1&&b?.id===input.batchId&&b.mapping_version===chunk.mappingVersion&&(b.status==="STAGED"||b.status==="VALIDATING")&&b.source_hash===scope.selectionSha256&&b.source_name===scope.fixedSourceNamespace&&b.already_published===false,"Exact selected open unpublished batch required");
  const targets=[['headers','history_sales_header',chunk.rows.map(r=>r.header.nativeId)],['methods','payment_method',chunk.rows.flatMap(r=>r.method?[r.method.nativeId]:[])],['accounts','payment_account',chunk.rows.map(r=>r.account.nativeId)]] as const;
  for(const [label,table,values] of targets){const ids=[...new Set(values)].sort(compare);if(!ids.length)continue;
   const rows=(await client.query(`/* settlement:lock-${label} */ SELECT id FROM naijue_erp.${table} WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`,[ids])).rows;
   must(rows.length===ids.length&&rows.every((r,i)=>r.id===ids[i]),"Stable historical header/payment native identities must exist");
  }
  const rows=[...chunk.rows].sort((a,b)=>compare(a.source.sourceKey,b.source.sourceKey));
  for(const row of rows)await client.query("/* settlement:source-lock */ SELECT naijue_erp.import_source_key_lock($1,$2,$3)",[scope.fixedSourceNamespace,"SETTLEMENT",row.source.sourceKey]);
  const fresh:PreparedHistorySettlementRow[]=[];let replayed=0;
  for(const row of rows)if(await this.identity(client,chunk,row)==="NEW")fresh.push(row);else replayed++;
  for(const row of fresh){await checkHeader(client,scope,row.header,true);await checkPayment(client,scope,row.account,true);if(row.method)await checkPayment(client,scope,row.method,true);}
  for(const row of fresh){
   const source=await client.query("/* settlement:insert-source */ INSERT INTO naijue_erp.import_source_row SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id",[JSON.stringify(sourceEvidence(chunk,row))]);
   must(source.rowCount===1&&source.rows[0]?.id===row.source.id,"Exact original settlement source INSERT required");
   const typed=await client.query("/* settlement:insert-typed */ INSERT INTO naijue_erp.history_sales_settlement SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.history_sales_settlement,$1::jsonb) r RETURNING id",[JSON.stringify(row.settlement)]);
   must(typed.rowCount===1&&typed.rows[0]?.id===row.settlement.id,"Exact historical settlement INSERT required");
  }
  for(const row of rows)must(await this.identity(client,chunk,row)==="REPLAY","Full original source + typed settlement readback required before COMMIT");
  return {inserted:fresh.length,replayed};
 }
}
/** Same selected open scope captured as PhaseA. Reads only, never authenticates file bytes itself. */
export function createPostgresHistorySettlementBindingResolver(pool:PgSalesPool,options:Scope){
 historySettlementRequestHash(options);const scope=structuredClone(options);entityId("operation",scope.batchId);
 must(Object.keys(scope).sort().join(",")==="batchId,fixedSourceNamespace,selectionSha256"&&/^[a-z][a-z0-9_.:-]{0,127}$/.test(scope.fixedSourceNamespace)&&/^[a-f0-9]{64}$/.test(scope.selectionSha256),"Explicit fixed selected resolver scope required");
 return async(query:{entity:"SETTLEMENT";sourceKey:string;rawFields:JsonObject;normalizedFields:JsonObject}):Promise<{header:HistorySalesHeaderBinding;account:HistoryPaymentBinding;method:HistoryPaymentBinding|null}>=>{
  historySettlementRequestHash(query);const q=structuredClone(query),raw=q.rawFields,n=q.normalizedFields,methodField="原收款方式来源编号",present=Object.hasOwn(raw,methodField);
  must(q.entity==="SETTLEMENT"&&typeof q.sourceKey==="string"&&q.sourceKey.length>0&&raw.来源编号===q.sourceKey&&n.来源编号===q.sourceKey
   &&["单据来源编号","账户来源编号"].every(k=>typeof n[k]==="string"&&(n[k] as string).length>0&&raw[k]===n[k])
   &&present===Object.hasOwn(n,methodField)&&(!present||typeof raw[methodField]==="string"&&raw[methodField]===n[methodField]),"Original settlement/header/account/method source identities must agree before connection");
  const client=await pool.connect();let began=false,committing=false,discard:Error|undefined;
  try{await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");began=true;await schema(client,true);
   const batch=(await client.query(`/* settlement:resolver-batch */ SELECT id FROM naijue_erp.import_batch WHERE id=$1::uuid AND source_name=$2 AND source_hash=$3 AND mapping_version='V2_HISTORY_NULLABLE_1'
    AND status IN ('STAGED','VALIDATING') AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')`,[scope.batchId,scope.fixedSourceNamespace,scope.selectionSha256])).rows;must(batch.length===1,"Actual selected open batch required");
   const headers=(await client.query(`/* settlement:resolver-header */ SELECT h.id,s.id source_row_id,s.source_file_sha256,s.row_sha256,h.version
    FROM naijue_erp.history_sales_header h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id WHERE h.batch_id=$1::uuid AND s.entity_type='SALES_HEADER' AND s.source_key=$2 AND h.version=1`,[scope.batchId,n.单据来源编号])).rows;
   must(headers.length===1,"Unique original historical sales header required");const h=headers[0]!;
   const header:HistorySalesHeaderBinding={sourceKey:n.单据来源编号 as string,nativeId:String(h.id),sourceRowId:String(h.source_row_id),sourceFileSha256:String(h.source_file_sha256),rowSha256:String(h.row_sha256),version:1};
   const load=async(entity:"PAYMENT_ACCOUNT"|"PAYMENT_METHOD",key:string):Promise<HistoryPaymentBinding>=>{
    const column=entity==="PAYMENT_ACCOUNT"?"native_payment_account_id":"native_payment_method_id";
    const rows=(await client.query(`/* settlement:resolver-payment */ SELECT b.${column} native_id,b.source_row_id,s.source_file_sha256,s.row_sha256,b.evidence_fingerprint,b.native_snapshot
     FROM naijue_erp.import_native_payment_binding b JOIN naijue_erp.import_source_row s ON s.batch_id=b.batch_id AND s.id=b.source_row_id WHERE b.batch_id=$1::uuid AND b.entity_type=$2 AND b.source_key=$3`,[scope.batchId,entity,key])).rows;
    must(rows.length===1,"Unique actual typed original payment binding required");const p=rows[0]!;
    return {entity,sourceKey:key,nativeId:String(p.native_id),sourceRowId:String(p.source_row_id),sourceFileSha256:String(p.source_file_sha256),rowSha256:String(p.row_sha256),fingerprint:String(p.evidence_fingerprint),nativeSnapshot:p.native_snapshot as JsonObject};
   };
   const account=await load("PAYMENT_ACCOUNT",n.账户来源编号 as string),method=present&&n[methodField]!==""?await load("PAYMENT_METHOD",n[methodField] as string):null;
   await checkHeader(client,scope,header,false);await checkPayment(client,scope,account,false);if(method)await checkPayment(client,scope,method,false);
   committing=true;await client.query("COMMIT");return {header,account,method};
  }catch(error){if(!began||committing)discard=error instanceof Error?error:Error("Settlement resolver outcome unknown");else try{await client.query("ROLLBACK");}catch(rollback){discard=rollback instanceof Error?rollback:Error("Settlement resolver rollback failed");throw new AggregateError([error,rollback],"Settlement resolver rollback failed; client discarded");}throw error;}
  finally{client.release(discard);}
 };
}
