import { validatePreparedHistoryHeaderChunk } from '../../../packages/application/src/import-v3-history-header-staging.ts';
import type { HistoryHeaderStagingStore, PreparedHistoryHeaderChunk, PreparedHistoryHeaderRow } from '../../../packages/application/src/import-v3-history-header-staging.ts';
import type { HistorySalesHeader } from '../../../packages/application/src/history-storage-contract.ts';
import type { PgSalesPool, PgSalesClient } from './sales-unit-of-work.ts';
const require = (ok: unknown, code: string): void => { if (!ok) throw Error(code); };

function sqlHeader(row: PreparedHistoryHeaderRow): Record<string, unknown> {
  const h = row.prepared.header;
  const common = {id:h.id,source_row_id:h.sourceRowId,batch_id:h.batchId,version:h.version,number:h.number,
    business_date:h.businessDate,source_status:h.sourceStatus,note:h.note,created_by_source_key:h.createdBySourceKey,
    approved_by_source_key:h.approvedBySourceKey,created_hall_id:h.createdHallId,created_hall_provenance:h.createdHallProvenance,
    created_hall_reason:h.createdHallReason,created_local_at:h.createdLocalAt,updated_local_at:h.updatedLocalAt,
    approved_local_at:h.approvedLocalAt,created_instant:h.createdInstant,updated_instant:h.updatedInstant,approved_instant:h.approvedInstant};
  if ('fromWarehouseId' in h) return {...common,from_warehouse_id:h.fromWarehouseId,to_warehouse_id:h.toWarehouseId,created_role_source:h.createdRoleSource};
  const s = h as HistorySalesHeader;
  return {...common,business_type:s.businessType,hall_id:s.hallId,customer_id:s.customerId,warehouse_id:s.warehouseId,
    salesperson_id:s.salespersonId,gross_amount:s.grossAmount,order_discount:s.orderDiscount,net_due:s.netDue};
}
function nativeTargets(row:PreparedHistoryHeaderRow,header:Record<string,unknown>) {
  const targets:Array<{field:string;column:string;entity:'HALL'|'CUSTOMER'|'WAREHOUSE'|'STAFF'}> = row.prepared.entity==='SALES_HEADER'
        ? [{field:'所属厅来源编号',column:'hall_id',entity:'HALL'},{field:'客户来源编号',column:'customer_id',entity:'CUSTOMER'},
          {field:'仓库来源编号',column:'warehouse_id',entity:'WAREHOUSE'},...(header.salesperson_id===null?[]:[{field:'营业员来源编号',column:'salesperson_id',entity:'STAFF' as const}])]
        : [{field:'调出仓来源编号',column:'from_warehouse_id',entity:'WAREHOUSE'},{field:'调入仓来源编号',column:'to_warehouse_id',entity:'WAREHOUSE'}];
  if(header.created_hall_id!==null)targets.push({field:'原创建厅编号',column:'created_hall_id',entity:'HALL'});
  return targets;
}
/** No connection at construction. Only schema-11 immutable staging, never native writes or publication.
 * Warehouse scope uses 0007 import_record; other FKs require 0012's immutable typed native-reference catalogue.
 * Missing catalogue/source bindings fail closed; snapshots are point-in-time, not native maintenance locks.
 * Lock order: global cutoff -> batch -> explicitly source-key-bound native rows -> evidence+header.
 */
export class PostgresV3HistoryHeaderStagingStore implements HistoryHeaderStagingStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedHistoryHeaderChunk): Promise<{inserted:number;replayed:number}> {
    const chunk = structuredClone(input); validatePreparedHistoryHeaderChunk(chunk);
    const client = await this.pool.connect(); let began = false, commitAttempted = false, discard: Error | undefined;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
      const result = await this.write(client,chunk);
      commitAttempted = true; await client.query('COMMIT'); return result;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : Error('HISTORY_HEADER_STAGING_UNKNOWN_OUTCOME');
      // A failed COMMIT may already have committed. Discard immediately; never retry or issue a misleading rollback.
      if (began && !commitAttempted) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : Error('HISTORY_HEADER_STAGING_ROLLBACK_FAILED');
        throw new AggregateError([error,rollback],'Historical header staging failed; connection discarded');
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, chunk: PreparedHistoryHeaderChunk): Promise<{inserted:number;replayed:number}> {
    await client.query('/* history-header-stage:global-lock */ SELECT naijue_erp.cutoff_import_lock()');
    const batches = (await client.query(`/* history-header-stage:batch */ SELECT id,mapping_version,status,source_hash,source_name
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[chunk.batchId])).rows;
    const batch = batches[0];
    require(batches.length === 1 && batch?.mapping_version === chunk.mappingVersion && ['STAGED','VALIDATING'].includes(String(batch.status))
      && batch.source_hash === chunk.rows[0]!.prepared.selection.selectionSha256 && batch.source_name === chunk.fixedSourceNamespace,
      'HISTORY_HEADER_STAGING_BATCH_NOT_OPEN_OR_BOUND');
    // Prelock ALL chunk native targets in deterministic order before any source/reference read.
    const allNative=new Map<string,{table:string;id:unknown}>();
    for(const row of chunk.rows){const h=sqlHeader(row);for(const target of nativeTargets(row,h)){
      const table=target.entity==='HALL'?'hall':target.entity==='CUSTOMER'?'customer':target.entity==='STAFF'?'staff':'warehouse';
      allNative.set(`${table}:${String(h[target.column])}`,{table,id:h[target.column]});
    }}
    for(const [,target] of [...allNative.entries()].sort(([a],[b])=>a.localeCompare(b))){
      const locked=(await client.query(`/* history-header-stage:native */ SELECT id FROM naijue_erp.${target.table} WHERE id=$1::uuid FOR SHARE`,[target.id])).rows;
      require(locked.length===1,'HISTORY_HEADER_STAGING_NATIVE_BINDING_MISSING');
    }
    let inserted = 0, replayed = 0;
    for (const row of chunk.rows) {
      const p = row.prepared, s = p.source, header = sqlHeader(row);
      // Native locks before source/catalogue locks. Never recompare immutable reference snapshots
      // with current editable native facts: the catalogue recorded identity at proof-write time.
      const targets=nativeTargets(row,header);
      for(const target of targets){
        if(target.entity==='WAREHOUSE'){
          const bindings=(await client.query(`/* history-header-stage:bindings */ SELECT r.target_id FROM naijue_erp.import_record r
            WHERE r.import_batch_id=$1::uuid AND r.target_id=$2::uuid AND r.target_type='WAREHOUSE'
              AND r.source_entity_type='WAREHOUSE' AND r.status='IMPORTED' AND r.source_key=$3 FOR SHARE`,
            [chunk.batchId,header[target.column],s.normalizedFields[target.field]])).rows;
          require(bindings.length===1,'HISTORY_HEADER_STAGING_NATIVE_BINDING_MISSING');
        }else{
          const nativeColumn=target.entity==='HALL'?'native_hall_id':target.entity==='CUSTOMER'?'native_customer_id':'native_staff_id';
          const bindings=(await client.query(`/* history-header-stage:catalogue */ SELECT r.source_row_id FROM naijue_erp.import_header_native_reference r
            JOIN naijue_erp.import_source_row e ON e.id=r.source_row_id AND e.batch_id=r.batch_id AND e.entity_type=r.entity_type AND e.source_key=r.source_key
            WHERE r.batch_id=$1::uuid AND r.entity_type=$2 AND r.source_key=$3 AND r.${nativeColumn}=$4::uuid FOR SHARE OF r,e`,
            [chunk.batchId,target.entity,s.normalizedFields[target.field],header[target.column]])).rows;
          require(bindings.length===1,'HISTORY_HEADER_STAGING_NATIVE_CATALOGUE_BINDING_MISSING');
        }
      }
      const provenance = {...p.fieldProvenance,history_header_staging:{validator_version:'V3_HISTORY_HEADER_STAGE_1',fingerprint:p.fingerprint,selection:p.selection}};
      const evidence = {id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,
        row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:provenance};
      const table = p.entity === 'SALES_HEADER' ? 'history_sales_header' : 'history_transfer_header';
      // Cast both expected records through their real SQL types: numeric/date/local timestamp/instant
      // representation differences are not replay conflicts; every persisted column still must match.
      const previous = (await client.query(`/* history-header-stage:replay */ SELECT
        to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,$2::jsonb)) AS source_equal,
        to_jsonb(h) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.${table},$3::jsonb)) AS header_equal
        FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.${table} h ON h.source_row_id=s.id AND h.batch_id=s.batch_id
        WHERE s.id=$1::uuid OR (s.batch_id=$4::uuid AND ((s.entity_type=$5 AND s.source_key=$6)
          OR (s.source_file_sha256=$7 AND s.sheet=$8 AND s.row_no=$9::bigint)))`,
        [s.id,JSON.stringify(evidence),JSON.stringify(header),chunk.batchId,s.entityType,s.sourceKey,s.sourceFileSha256,s.sheet,s.rowNo])).rows;
      if (previous.length) {
        require(previous.length === 1 && previous[0]!.source_equal === true && previous[0]!.header_equal === true,'HISTORY_HEADER_STAGING_REPLAY_CONFLICT');
        replayed++; continue;
      }
      const source = await client.query(`/* history-header-stage:source */ INSERT INTO naijue_erp.import_source_row
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id`,[JSON.stringify(evidence)]);
      require(source.rowCount === 1 && source.rows[0]?.id === s.id,'HISTORY_HEADER_STAGING_SOURCE_INSERT');
      const saved = await client.query(`/* history-header-stage:header */ INSERT INTO naijue_erp.${table}
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.${table},$1::jsonb) r RETURNING id`,[JSON.stringify(header)]);
      require(saved.rowCount === 1 && saved.rows[0]?.id === header.id,'HISTORY_HEADER_STAGING_HEADER_INSERT'); inserted++;
    }
    return {inserted,replayed};
  }
}
