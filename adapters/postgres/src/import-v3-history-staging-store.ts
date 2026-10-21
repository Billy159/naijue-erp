import { validatePreparedHistoryChunk } from '../../../packages/application/src/import-v3-history-staging.ts';
import type { HistoryStagingStore, PreparedHistoryChunk } from '../../../packages/application/src/import-v3-history-staging.ts';
import type { PgSalesPool, PgSalesClient } from './sales-unit-of-work.ts';
const require = (ok: unknown, code: string): void => { if (!ok) throw Error(code); };
/** No connection until explicitly invoked. Existing reviewed schema-11 batch/headers/SKU aliases required.
 * Lock order: cutoff -> batch -> existing header/SKU -> immutable evidence+line. No publication path. */
export class PostgresV3HistoryStagingStore implements HistoryStagingStore {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async stage(input: PreparedHistoryChunk): Promise<{inserted:number;replayed:number}> {
    const chunk = structuredClone(input); validatePreparedHistoryChunk(chunk);
    const client = await this.pool.connect(); let began = false, commitAttempted = false, discard: Error | undefined;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
      const result = await this.write(client,chunk);
      commitAttempted = true; await client.query('COMMIT'); return result;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : Error('HISTORY_STAGING_UNKNOWN_OUTCOME');
      if (began) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : Error('HISTORY_STAGING_ROLLBACK_FAILED');
        throw new AggregateError([error,rollback],'History staging failed; connection discarded');
      }
      throw error;
    } finally { client.release(discard); }
  }
  private async write(client: PgSalesClient, chunk: PreparedHistoryChunk): Promise<{inserted:number;replayed:number}> {
    await client.query('/* history-stage:global-lock */ SELECT naijue_erp.cutoff_import_lock()');
    const batches = (await client.query(`/* history-stage:batch */ SELECT id, mapping_version, status, source_hash, source_name
      FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`,[chunk.batchId])).rows;
    const batch = batches[0];
    require(batches.length === 1 && batch?.mapping_version === chunk.mappingVersion && ['STAGED','VALIDATING'].includes(String(batch.status))
      && batch.source_hash === chunk.selection.selectionSha256 && batch.source_name === chunk.fixedSourceNamespace,'HISTORY_STAGING_BATCH_NOT_OPEN_OR_BOUND');
    let inserted = 0, replayed = 0;
    for (const row of chunk.rows) {
      const s = row.source, n = s.normalizedFields;
      const bindings = (await client.query(`/* history-stage:bindings */ SELECT h.id FROM naijue_erp.history_transfer_header h
        JOIN naijue_erp.import_source_row hs ON hs.id=h.source_row_id AND hs.batch_id=h.batch_id
        JOIN naijue_erp.sku k ON k.id=$3::uuid
        WHERE h.id=$1::uuid AND h.batch_id=$2::uuid AND hs.entity_type='TRANSFER_HEADER' AND hs.source_key=$4
        AND EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id=$2::uuid AND a.canonical_sku_id=k.id AND a.canonical_source_key=$5 AND a.old_source_sku_id=$6)
        FOR SHARE OF h, hs, k`,[row.line.header_id,chunk.batchId,row.line.sku_id,n['单据来源编号'],n['SKU来源编号'],s.rawFields['SKU来源编号']])).rows;
      require(bindings.length === 1,'HISTORY_STAGING_NATIVE_BINDING_MISSING');
      const provenance = {...s.fieldProvenance, history_staging:{validator_version:'V3_TRANSFER_LINE_STAGE_1',fingerprint:row.fingerprint,selection:chunk.selection}};
      const evidence = { id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,
        row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:provenance };
      const previous = (await client.query(`/* history-stage:replay */ SELECT
        (to_jsonb(s) || jsonb_build_object('row_no',s.row_no::text))=$2::jsonb AS source_equal,
        (to_jsonb(l) || jsonb_build_object('quantity',l.quantity::text))=$3::jsonb AS line_equal
        FROM naijue_erp.import_source_row s LEFT JOIN naijue_erp.history_transfer_line l ON l.source_row_id=s.id AND l.batch_id=s.batch_id
        WHERE s.id=$1::uuid`,[s.id,JSON.stringify(evidence),JSON.stringify(row.line)])).rows;
      if (previous.length) {
        require(previous.length === 1 && previous[0]!.source_equal === true && previous[0]!.line_equal === true,'HISTORY_STAGING_REPLAY_CONFLICT'); replayed++; continue;
      }
      const source = await client.query(`/* history-stage:source */ INSERT INTO naijue_erp.import_source_row
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id`,[JSON.stringify(evidence)]);
      require(source.rowCount === 1 && source.rows[0]?.id === s.id,'HISTORY_STAGING_SOURCE_INSERT');
      const line = await client.query(`/* history-stage:line */ INSERT INTO naijue_erp.history_transfer_line
        SELECT r.* FROM jsonb_populate_record(NULL::naijue_erp.history_transfer_line,$1::jsonb) r RETURNING id`,[JSON.stringify(row.line)]);
      require(line.rowCount === 1 && line.rows[0]?.id === row.line.id,'HISTORY_STAGING_LINE_INSERT'); inserted++;
    }
    return {inserted,replayed};
  }
}
