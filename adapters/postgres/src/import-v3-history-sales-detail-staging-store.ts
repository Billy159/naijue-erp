import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { assertReviewedNativeImportSchema } from "../../../packages/application/src/native-import-schema-contract.ts";
import { HISTORY_SALES_DETAIL_VERSION, validatePreparedHistorySalesDetailChunk } from "../../../packages/application/src/import-v3-history-sales-detail.ts";
import type { HistorySalesDetailStagingStore, PreparedHistorySalesDetailChunk, PreparedHistorySalesDetailRow, HistorySalesHeaderBinding, HistorySalesSkuBinding } from "../../../packages/application/src/import-v3-history-sales-detail.ts";
import type { JsonObject } from "../../../packages/application/src/history-storage-contract.ts";
import type { PgSalesPool, PgSalesClient } from "./sales-unit-of-work.ts";
const must=(ok:unknown,code:string,message:string):void=>requireDomain(ok,code,message);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function evidence(chunk:PreparedHistorySalesDetailChunk,row:PreparedHistorySalesDetailRow):JsonObject{
  const s=row.source;return {id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,
    source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,
    field_provenance:{...row.fieldProvenance,history_sales_detail_staging:{validator_version:HISTORY_SALES_DETAIL_VERSION,fingerprint:row.fingerprint,
      selection:{...chunk.input.selection},header:{...row.header},sku:{...row.sku}}}};
}
async function assertBinding(client:PgSalesClient,scope:{batchId:string;selectionSha256:string},h:HistorySalesHeaderBinding,k:HistorySalesSkuBinding,locks:boolean):Promise<void>{
    const bindings=(await client.query(`/* sales-detail:${locks?"new-bindings":"resolver-check"} */ SELECT h.id FROM naijue_erp.history_sales_header h
      JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
      JOIN naijue_erp.sku k ON k.id=$8::uuid
      JOIN naijue_erp.import_sku_alias a ON a.batch_id=h.batch_id AND a.canonical_sku_id=k.id AND a.source_row_id=$9::uuid
      JOIN naijue_erp.import_source_row als ON als.batch_id=a.batch_id AND als.id=a.source_row_id
      JOIN naijue_erp.import_record r ON r.import_batch_id=h.batch_id AND r.id=$12::uuid
      JOIN naijue_erp.import_source_row cs ON cs.batch_id=r.import_batch_id AND cs.entity_type='SKU' AND cs.source_key=r.source_key
      WHERE h.batch_id=$1::uuid AND h.id=$2::uuid AND hs.id=$3::uuid AND hs.source_key=$4 AND hs.entity_type='SALES_HEADER'
        AND hs.source_file_sha256=$5 AND hs.row_sha256=$6 AND h.version=$7::integer
        AND (hs.raw_fields->>'来源编号')=hs.source_key AND (hs.normalized_fields->>'来源编号')=hs.source_key
        AND hs.field_provenance->'history_header_mapping'->>'validator_version'='V3_HISTORY_HEADER_1'
        AND hs.field_provenance->'history_header_staging'->>'validator_version'='V3_HISTORY_HEADER_STAGE_1'
        AND (hs.field_provenance->'history_header_staging'->'selection'->>'selectionSha256')=$13
        AND a.old_source_sku_id=$10 AND a.canonical_source_key=$11 AND length(btrim(a.mapping_basis))>0
        AND als.entity_type='SKU' AND als.source_key=$10 AND (als.raw_fields->>'来源编号')=$10
        AND als.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
        AND (als.field_provenance->'native_sku_import'->>'native_sku_id')=k.id::text
        AND (als.field_provenance->'native_sku_import'->>'canonical_source_key')=a.canonical_source_key
        AND (als.field_provenance->'native_sku_import'->'selection'->>'selectionSha256')=$13
        AND (als.field_provenance->'native_sku_import'->'mapping'->>'oldSourceSkuId')=a.old_source_sku_id
        AND (als.field_provenance->'native_sku_import'->'mapping'->>'canonicalSourceSkuId')=a.canonical_source_key
        AND (als.field_provenance->'native_sku_import'->'mapping'->>'mappingBasis')=a.mapping_basis
        AND (als.field_provenance->'native_sku_import'->'native_sku'->>'product_id')=k.product_id::text
        AND (als.field_provenance->'native_sku_import'->'native_sku'->>'color_id')=k.color_id::text
        AND (als.field_provenance->'native_sku_import'->'native_sku'->>'fit_id')=k.fit_id::text
        AND (als.field_provenance->'native_sku_import'->'native_sku'->>'size_id')=k.size_id::text
        AND r.source_entity_type='SKU' AND r.source_key=$11 AND r.target_type='SKU' AND r.target_id=k.id AND r.status='IMPORTED'
        AND r.source_record_hash=cs.row_sha256 AND r.source_file_ref=cs.file_ref
        AND cs.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
        AND (cs.field_provenance->'native_sku_import'->>'native_sku_id')=k.id::text
        AND (cs.raw_fields->>'来源编号')=r.source_key
      ${locks?"FOR SHARE OF h,hs,k,a,als,r,cs":""}`,[scope.batchId,h.nativeId,h.sourceRowId,h.sourceKey,h.sourceFileSha256,h.rowSha256,h.version,
        k.nativeId,k.aliasSourceRowId,k.oldSourceSkuKey,k.canonicalSourceKey,k.importRecordId,scope.selectionSha256])).rows;
    must(bindings.length===1,"HISTORY_SALES_DETAIL_NATIVE_BINDING","Exact selected header and same-batch creator-backed old alias/canonical source/imported SKU required; a bare import_record cannot adopt an existing SKU");
}
/** Only immutable SALES_LINE source+typed row INSERTs. No settlement, live native,
 * stock, progress counter, receipt/action, batch UPDATE or publication writes. */
export class PostgresHistorySalesDetailStagingStore implements HistorySalesDetailStagingStore {
  private readonly pool:PgSalesPool;
  constructor(pool:PgSalesPool){this.pool=pool;}
  async stage(original:PreparedHistorySalesDetailChunk):Promise<{inserted:number;replayed:number}>{
    const chunk=structuredClone(original);validatePreparedHistorySalesDetailChunk(chunk);
    const client=await this.pool.connect();let began=false,commitAttempted=false;let discard:Error|undefined;
    try{await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");began=true;const result=await this.write(client,chunk);
      commitAttempted=true;await client.query("COMMIT");return result;
    }catch(error){if(!began||commitAttempted)discard=error instanceof Error?error:new Error("HISTORY_SALES_DETAIL_UNKNOWN_OUTCOME");
      if(began&&!commitAttempted)try{await client.query("ROLLBACK");}catch(rollback){discard=rollback instanceof Error?rollback:new Error("HISTORY_SALES_DETAIL_ROLLBACK_FAILED");
        throw new AggregateError([error,rollback],"Sales-detail staging failed and rollback failed; client discarded");}
      throw error;
    }finally{client.release(discard);}
  }
  private async identity(client:PgSalesClient,chunk:PreparedHistorySalesDetailChunk,row:PreparedHistorySalesDetailRow){
    const s=row.source,expected=evidence(chunk,row);
    const sources=(await client.query(`/* sales-detail:source-replay */ SELECT s.id,
      (to_jsonb(s)||jsonb_build_object('row_no',s.row_no::text))=$7::jsonb AS source_equal
      FROM naijue_erp.import_source_row s JOIN naijue_erp.import_batch sb ON sb.id=s.batch_id
      WHERE s.id=$1::uuid OR (sb.source_name=$8 AND s.entity_type='SALES_LINE' AND s.source_key=$3)
      OR (s.batch_id=$2::uuid AND s.source_file_sha256=$4 AND s.sheet=$5 AND s.row_no=$6::bigint) ORDER BY s.id FOR SHARE OF s`,
      [s.id,s.batchId,s.sourceKey,s.sourceFileSha256,s.sheet,s.rowNo,JSON.stringify(expected),chunk.input.fixedSourceNamespace])).rows;
    const lines=(await client.query(`/* sales-detail:line-replay */ SELECT l.id,
      to_jsonb(l)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.history_sales_line,$5::jsonb)) AS line_equal
      FROM naijue_erp.history_sales_line l WHERE l.id=$1::uuid OR l.source_row_id=$2::uuid OR (l.header_id=$3::uuid AND l.line_no=$4::integer)
      ORDER BY l.id FOR SHARE OF l`,[row.line.id,s.id,row.line.header_id,row.line.line_no,JSON.stringify(row.line)])).rows;
    if(!sources.length&&!lines.length)return "NEW" as const;
    must(sources.length===1&&lines.length===1&&sources[0]!.id===s.id&&lines[0]!.id===row.line.id&&sources[0]!.source_equal===true&&lines[0]!.line_equal===true,
      "HISTORY_SALES_DETAIL_REPLAY_CONFLICT","Partial/orphan/alternate source identity or changed immutable source/typed creation proof cannot be adopted");return "REPLAY" as const;
  }
  private async binding(client:PgSalesClient,chunk:PreparedHistorySalesDetailChunk,row:PreparedHistorySalesDetailRow):Promise<void>{
    return assertBinding(client,{batchId:chunk.input.batchId,selectionSha256:chunk.input.selection.selectionSha256},row.header,row.sku,true);
  }
  private async write(client:PgSalesClient,chunk:PreparedHistorySalesDetailChunk):Promise<{inserted:number;replayed:number}>{
    const input=chunk.input;
    await client.query("/* sales-detail:cutoff */ SELECT naijue_erp.cutoff_import_lock()");
    const versions=(await client.query("/* sales-detail:schema */ SELECT array_agg(version ORDER BY version) AS versions FROM naijue_erp.schema_migration")).rows;
    must(versions.length===1,"HISTORY_SALES_DETAIL_SCHEMA","Reviewed migration registry required");
    const reviewedSchema = assertReviewedNativeImportSchema(versions[0]!.versions,{minimumVersion:11,errorCode:"HISTORY_SALES_DETAIL_SCHEMA"});
    if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
    const batches=(await client.query(`/* sales-detail:batch */ SELECT id,mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[input.batchId])).rows;
    const b=batches[0];must(batches.length===1&&b?.id===input.batchId&&b.mapping_version===chunk.mappingVersion&&["STAGED","VALIDATING"].includes(String(b.status))
      &&b.source_hash===input.selection.selectionSha256&&b.source_name===input.fixedSourceNamespace&&b.already_published===false,
      "HISTORY_SALES_DETAIL_BATCH","Exact selected open unpublished batch required");
    const headers=[...new Set(chunk.rows.map(r=>r.header.nativeId))].sort(compare),skus=[...new Set(chunk.rows.map(r=>r.sku.nativeId))].sort(compare);
    const lockedHeaders=(await client.query("/* sales-detail:lock-headers */ SELECT id FROM naijue_erp.history_sales_header WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",[headers])).rows;
    const lockedSkus=(await client.query("/* sales-detail:lock-skus */ SELECT id FROM naijue_erp.sku WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",[skus])).rows;
    must(lockedHeaders.length===headers.length&&lockedHeaders.every((r,i)=>r.id===headers[i])&&lockedSkus.length===skus.length&&lockedSkus.every((r,i)=>r.id===skus[i]),
      "HISTORY_SALES_DETAIL_TARGET_MISSING","Stable native header/SKU identities must still exist; replay does not overwrite maintenance");
    const rows=[...chunk.rows].sort((a,b)=>compare(a.source.sourceKey,b.source.sourceKey));
    for(const row of rows)await client.query("/* sales-detail:source-lock */ SELECT naijue_erp.import_source_key_lock($1,$2,$3)",[input.fixedSourceNamespace,"SALES_LINE",row.source.sourceKey]);
    const newRows:PreparedHistorySalesDetailRow[]=[];let replayed=0;
    // Classify the entire immutable operation set before INSERT. Pure replay never
    // reapplies first-creation/current dependency checks or updates current natives.
    for(const row of rows){if(await this.identity(client,chunk,row)==="NEW")newRows.push(row);else replayed++;}
    for(const row of newRows)await this.binding(client,chunk,row);
    for(const row of newRows){
      const s=row.source;
      const source=await client.query(`/* sales-detail:insert-source */ INSERT INTO naijue_erp.import_source_row
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id`,[JSON.stringify(evidence(chunk,row))]);
      must(source.rowCount===1&&source.rows[0]?.id===s.id,"HISTORY_SALES_DETAIL_INSERT","Exact source INSERT required");
      const line=await client.query(`/* sales-detail:insert-line */ INSERT INTO naijue_erp.history_sales_line
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.history_sales_line,$1::jsonb) r RETURNING id`,[JSON.stringify(row.line)]);
      must(line.rowCount===1&&line.rows[0]?.id===row.line.id,"HISTORY_SALES_DETAIL_INSERT","Exact typed line INSERT required");
    }
    // Independent SQL typed/source read-back on the same transaction, not counts.
    for(const row of rows)must(await this.identity(client,chunk,row)==="REPLAY","HISTORY_SALES_DETAIL_READBACK","Source and typed line must both read back exactly before COMMIT");
    return {inserted:newRows.length,replayed};
  }
}

/** Independent executable exact-ID resolver for the source reader. It does not
 * authenticate files by itself and cannot stage/publish anything. READ ONLY
 * repeatable snapshot here; STAGE subsequently locks/rechecks the same proof. */
export function createPostgresHistorySalesDetailBindingResolver(pool:PgSalesPool,options:{batchId:string;fixedSourceNamespace:string;selectionSha256:string}){
  const scope=structuredClone(options);
  must(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(scope.batchId)&&/^[a-z][a-z0-9_.:-]{0,127}$/.test(scope.fixedSourceNamespace)
    &&/^[a-f0-9]{64}$/.test(scope.selectionSha256),"HISTORY_SALES_DETAIL_RESOLVER_SCOPE","Explicit fixed batch/namespace/selection scope required");
  return async(query:{entity:"SALES_LINE";sourceKey:string;rawFields:JsonObject;normalizedFields:JsonObject}):Promise<{header:HistorySalesHeaderBinding;sku:HistorySalesSkuBinding}>=>{
    const q=structuredClone(query),headerKey=q.normalizedFields["单据来源编号"],oldSku=q.rawFields["SKU来源编号"],canonical=q.normalizedFields["SKU来源编号"];
    must(q.entity==="SALES_LINE"&&typeof q.sourceKey==="string"&&q.sourceKey.length>0
      &&q.rawFields["来源编号"]===q.sourceKey&&q.normalizedFields["来源编号"]===q.sourceKey&&typeof headerKey==="string"&&headerKey.length>0
      &&q.rawFields["单据来源编号"]===headerKey&&typeof oldSku==="string"&&oldSku.length>0&&typeof canonical==="string"&&canonical.length>0,
      "HISTORY_SALES_DETAIL_RESOLVER_QUERY","Literal original header/old SKU and effective canonical source identities required; no name matching");
    const client=await pool.connect();let began=false,commitAttempted=false;let discard:Error|undefined;
    try{
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");began=true;
      const versions=(await client.query("/* sales-detail:resolver-schema */ SELECT array_agg(version ORDER BY version) AS versions FROM naijue_erp.schema_migration")).rows;
      must(versions.length===1,"HISTORY_SALES_DETAIL_SCHEMA","Reviewed registry required");const reviewedSchema = assertReviewedNativeImportSchema(versions[0]!.versions,{minimumVersion:11,errorCode:"HISTORY_SALES_DETAIL_SCHEMA"});
    if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client);
      const batch=(await client.query(`/* sales-detail:resolver-batch */ SELECT id FROM naijue_erp.import_batch WHERE id=$1::uuid AND source_name=$2
        AND source_hash=$3 AND mapping_version='V2_HISTORY_NULLABLE_1' AND status IN ('STAGED','VALIDATING')
        AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')`,[scope.batchId,scope.fixedSourceNamespace,scope.selectionSha256])).rows;
      must(batch.length===1,"HISTORY_SALES_DETAIL_RESOLVER_SCOPE","Actual selected open batch required");
      const headers=(await client.query(`/* sales-detail:resolver-header */ SELECT h.id,s.id AS source_row_id,s.source_file_sha256,s.row_sha256,h.version
        FROM naijue_erp.history_sales_header h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
        WHERE h.batch_id=$1::uuid AND s.entity_type='SALES_HEADER' AND s.source_key=$2 AND h.version=1`,[scope.batchId,headerKey])).rows;
      const skus=(await client.query(`/* sales-detail:resolver-sku */ SELECT k.id,a.source_row_id,r.id AS import_record_id
        FROM naijue_erp.import_sku_alias a JOIN naijue_erp.sku k ON k.id=a.canonical_sku_id
        JOIN naijue_erp.import_record r ON r.import_batch_id=a.batch_id AND r.target_id=k.id AND r.target_type='SKU'
        AND r.source_entity_type='SKU' AND r.source_key=a.canonical_source_key AND r.status='IMPORTED'
        WHERE a.batch_id=$1::uuid AND a.old_source_sku_id=$2 AND a.canonical_source_key=$3`,[scope.batchId,oldSku,canonical])).rows;
      must(headers.length===1&&skus.length===1,"HISTORY_SALES_DETAIL_RESOLVER_MISSING","Unique actual same-batch header and canonical creator identity required");
      const h=headers[0]!,k=skus[0]!;
      const result={header:{sourceKey:headerKey as string,nativeId:String(h.id),sourceRowId:String(h.source_row_id),sourceFileSha256:String(h.source_file_sha256),rowSha256:String(h.row_sha256),version:1 as const},
        sku:{oldSourceSkuKey:oldSku as string,canonicalSourceKey:canonical as string,nativeId:String(k.id),aliasSourceRowId:String(k.source_row_id),importRecordId:String(k.import_record_id)}};
      await assertBinding(client,scope,result.header,result.sku,false);
      commitAttempted=true;await client.query("COMMIT");return result;
    }catch(error){if(!began||commitAttempted)discard=error instanceof Error?error:new Error("HISTORY_SALES_DETAIL_RESOLVER_UNKNOWN_OUTCOME");
      if(began&&!commitAttempted)try{await client.query("ROLLBACK");}catch(rollback){discard=rollback instanceof Error?rollback:new Error("HISTORY_SALES_DETAIL_RESOLVER_ROLLBACK_FAILED");throw new AggregateError([error,rollback],"Source binding resolver rollback failed; client discarded");}
      throw error;
    }finally{client.release(discard);}
  };
}
