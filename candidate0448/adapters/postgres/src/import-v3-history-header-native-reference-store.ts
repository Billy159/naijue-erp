import { checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import { validatePreparedHistoryHeaderNativeReferenceChunk } from '../../../packages/application/src/import-v3-history-header-native-reference.ts';
import type { HistoryHeaderNativeReferenceStore, PreparedHistoryHeaderNativeReferenceChunk } from '../../../packages/application/src/import-v3-history-header-native-reference.ts';
import type { PgSalesPool, PgSalesClient } from './sales-unit-of-work.ts';
const require=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
/** Exact immutable SQL row payloads, shared with same-transaction native-intent guards. */
export function historyHeaderNativeReferenceEvidence(chunk:PreparedHistoryHeaderNativeReferenceChunk,index:number):{source:Record<string,unknown>;reference:Record<string,unknown>} {
  require(Number.isSafeInteger(index)&&index>=0&&index<chunk.rows.length,'HISTORY_HEADER_REFERENCE_ROW_INDEX');
  const row=structuredClone(chunk.rows[index]!);
  validatePreparedHistoryHeaderNativeReferenceChunk({...chunk,rows:[row]});
  const p=row.prepared,s=p.source,provenance={...p.fieldProvenance,history_header_reference_staging:{validator_version:'V3_HISTORY_HEADER_NATIVE_REFERENCE_STAGE_1',fingerprint:p.fingerprint,selection:chunk.selection}};
      const evidence={id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,
        source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:provenance};
      const reference={batch_id:chunk.batchId,entity_type:p.entity,source_key:s.sourceKey,source_row_id:s.id,
        native_hall_id:p.entity==='HALL'?p.nativeId:null,native_customer_id:p.entity==='CUSTOMER'?p.nativeId:null,native_staff_id:p.entity==='STAFF'?p.nativeId:null,
        native_snapshot:p.nativeSnapshot,native_version:p.nativeVersion,validator_version:'V3_HISTORY_HEADER_NATIVE_REFERENCE_1'};
  return {source:evidence,reference};
}

/** Binds EXISTING natives only. Snapshot equality is point-in-time, never a freeze on future native edits. */
export class PostgresV3HistoryHeaderNativeReferenceStore implements HistoryHeaderNativeReferenceStore {
  private readonly pool:PgSalesPool;
  private readonly runtime26:NativeRuntime26Capability|undefined;
  constructor(pool:PgSalesPool,runtime26?:NativeRuntime26Capability){this.pool=pool;this.runtime26=checkedNativeRuntime26Capability(runtime26);}
  async stage(input:PreparedHistoryHeaderNativeReferenceChunk):Promise<{inserted:number;replayed:number}>{
    const chunk=structuredClone(input);validatePreparedHistoryHeaderNativeReferenceChunk(chunk);
    const client=await this.pool.connect();let began=false,commitAttempted=false,discard:Error|undefined;
    try{
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
      const result=await insertValidatedHistoryHeaderNativeReferences(client,chunk,this.runtime26);commitAttempted=true;await client.query('COMMIT');return result;
    }catch(error){
      if(!began||commitAttempted)discard=error instanceof Error?error:Error('HISTORY_HEADER_REFERENCE_UNKNOWN_OUTCOME');
      if(began&&!commitAttempted)try{await client.query('ROLLBACK');}catch(rollback){discard=rollback instanceof Error?rollback:Error('HISTORY_HEADER_REFERENCE_ROLLBACK_FAILED');throw new AggregateError([error,rollback],'Native reference staging failed; connection discarded');}
      throw error;
    }finally{client.release(discard);}
  }
}
/** Reusable in an existing native-import transaction. Never BEGINs/COMMITs/ROLLBACKs.
 * Caller owns the transaction and must acquire cutoff -> batch before native creation/locks.
 * Reentrant cutoff/batch locks are rechecked; all native locks precede source/reference access.
 * No automatic retries. Caller must discard its connection on an uncertain COMMIT.
 */
export async function insertValidatedHistoryHeaderNativeReferences(client:PgSalesClient,input:PreparedHistoryHeaderNativeReferenceChunk,runtime26?:NativeRuntime26Capability):Promise<{inserted:number;replayed:number}>{
    const chunk=structuredClone(input);validatePreparedHistoryHeaderNativeReferenceChunk(chunk);
    const verified=checkedNativeRuntime26Capability(runtime26);
    require((chunk.selection.source!=='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'&&!chunk.rows.some(row=>row.input.schemaProfile==='EXACT26'))||verified!==undefined,'HISTORY_HEADER_REFERENCE_EXACT26_REQUIRED');
    if(verified)await verified.assertReady(client,'IMPORT_STAGE');
    await client.query('/* history-header-reference:global-lock */ SELECT naijue_erp.cutoff_import_lock()');
    const batches=(await client.query(`/* history-header-reference:batch */ SELECT mapping_version,status,source_hash,source_name FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[chunk.batchId])).rows;
    const batch=batches[0];require(batches.length===1&&batch?.mapping_version===chunk.mappingVersion&&['STAGED','VALIDATING'].includes(String(batch.status))
      &&batch.source_hash===chunk.selection.selectionSha256&&batch.source_name===chunk.fixedSourceNamespace,'HISTORY_HEADER_REFERENCE_BATCH_NOT_OPEN_OR_BOUND');
    // Global chunk lock order: cutoff -> batch -> ALL natives -> source/reference evidence.
    const targets=new Map<string,{table:string;id:string;snapshot?:unknown;entity?:string}>();
    for(const {input,prepared:p} of chunk.rows){
      const table=p.entity==='HALL'?'hall':p.entity==='CUSTOMER'?'customer':'staff';
      targets.set(`${table}:${p.nativeId}`,{table,id:p.nativeId,snapshot:p.nativeSnapshot,entity:p.entity});
      for(const [field,binding] of Object.entries(input.bindings)){if(!binding)continue;
        const relationTable=field==='默认销货仓来源编号'?'warehouse':field==='默认客户来源编号'?'customer':'hall';
        const key=`${relationTable}:${binding.nativeId}`;if(!targets.has(key))targets.set(key,{table:relationTable,id:binding.nativeId});
      }
    }
    const nativeMatches=new Map<string,boolean>();
    for(const [,target] of [...targets.entries()].sort(([a],[b])=>a.localeCompare(b))){
      if(target.snapshot){
        const natives=(await client.query(`/* history-header-reference:native */ SELECT id,
          to_jsonb(n) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.${target.table},$2::jsonb)) AS native_equal
          FROM naijue_erp.${target.table} n WHERE id=$1::uuid FOR SHARE`,[target.id,JSON.stringify(target.snapshot)])).rows;
        require(natives.length===1,'HISTORY_HEADER_REFERENCE_NATIVE_MISSING');nativeMatches.set(`${target.entity}:${target.id}`,natives[0]!.native_equal===true);
      }else{
        const locked=(await client.query(`/* history-header-reference:relation-native */ SELECT id FROM naijue_erp.${target.table} WHERE id=$1::uuid FOR SHARE`,[target.id])).rows;
        require(locked.length===1,'HISTORY_HEADER_REFERENCE_RELATION_NATIVE_MISSING');
      }
    }
    let inserted=0,replayed=0;
    for(const [index,{input,prepared:p}] of chunk.rows.entries()){
      const s=p.source,{source:evidence,reference}=historyHeaderNativeReferenceEvidence(chunk,index);
      const previous=(await client.query(`/* history-header-reference:replay */ SELECT
        to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,$2::jsonb)) AS source_equal,
        to_jsonb(r) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_header_native_reference,$3::jsonb)) AS reference_equal
        FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.import_header_native_reference r ON r.source_row_id=s.id AND r.batch_id=s.batch_id
        WHERE s.id=$1::uuid OR (s.batch_id=$4::uuid AND ((s.entity_type=$5 AND s.source_key=$6)
          OR (s.source_file_sha256=$7 AND s.sheet=$8 AND s.row_no=$9::bigint)))`,
        [s.id,JSON.stringify(evidence),JSON.stringify(reference),chunk.batchId,s.entityType,s.sourceKey,s.sourceFileSha256,s.sheet,s.rowNo])).rows;
      if(previous.length){require(previous.length===1&&previous[0]!.source_equal===true&&previous[0]!.reference_equal===true,'HISTORY_HEADER_REFERENCE_REPLAY_CONFLICT');replayed++;continue;}
      require(nativeMatches.get(`${p.entity}:${p.nativeId}`)===true,'HISTORY_HEADER_REFERENCE_NATIVE_SNAPSHOT_CHANGED');
      for(const [field,binding] of Object.entries(input.bindings)){
        if(!binding)continue;
        if(field==='默认销货仓来源编号'){
          const found=(await client.query(`/* history-header-reference:relation */ SELECT id FROM naijue_erp.import_record
            WHERE import_batch_id=$1::uuid AND target_type='WAREHOUSE' AND source_entity_type='WAREHOUSE' AND status='IMPORTED'
              AND source_key=$2 AND target_id=$3::uuid FOR SHARE`,[chunk.batchId,binding.sourceKey,binding.nativeId])).rows;
          require(found.length===1,'HISTORY_HEADER_REFERENCE_RELATION_BINDING_MISSING');
        }else{
          const entity=field==='默认客户来源编号'?'CUSTOMER':'HALL',column=entity==='CUSTOMER'?'native_customer_id':'native_hall_id';
          const found=(await client.query(`/* history-header-reference:relation */ SELECT r.source_row_id FROM naijue_erp.import_header_native_reference r
            JOIN naijue_erp.import_source_row s ON s.id=r.source_row_id AND s.batch_id=r.batch_id AND s.entity_type=r.entity_type AND s.source_key=r.source_key
            WHERE r.batch_id=$1::uuid AND r.entity_type=$2 AND r.source_key=$3 AND r.${column}=$4::uuid FOR SHARE OF r,s`,[chunk.batchId,entity,binding.sourceKey,binding.nativeId])).rows;
          require(found.length===1,'HISTORY_HEADER_REFERENCE_RELATION_BINDING_MISSING');
        }
      }
      const source=await client.query(`/* history-header-reference:source */ INSERT INTO naijue_erp.import_source_row SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id`,[JSON.stringify(evidence)]);
      require(source.rowCount===1&&source.rows[0]?.id===s.id,'HISTORY_HEADER_REFERENCE_SOURCE_INSERT');
      const saved=await client.query(`/* history-header-reference:reference */ INSERT INTO naijue_erp.import_header_native_reference SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_header_native_reference,$1::jsonb) r RETURNING source_row_id`,[JSON.stringify(reference)]);
      require(saved.rowCount===1&&saved.rows[0]?.source_row_id===s.id,'HISTORY_HEADER_REFERENCE_INSERT');inserted++;
    }
    return {inserted,replayed};

}
