import { assertNativeImportAccountingGuards } from "./native-import-accounting-capability.ts";
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { assertReviewedNativeImportSchema, checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import { nativePartyStandaloneImportSource, validatePreparedNativePartyImportChunk, NATIVE_PARTY_IMPORT_VERSION } from '../../../packages/application/src/native-party-import.ts';
import type { NativePartyImportStore, PreparedNativePartyImportChunk, PreparedNativePartyImportRow } from '../../../packages/application/src/native-party-import.ts';
import type { JsonObject } from '../../../packages/application/src/history-storage-contract.ts';
import { insertValidatedHistoryHeaderNativeReferences, historyHeaderNativeReferenceEvidence } from './import-v3-history-header-native-reference-store.ts';
import type { PgSalesClient, PgSalesPool } from './sales-unit-of-work.ts';
const check = (ok: unknown, code: string): void => requireDomain(ok, code, code);
const table = (row: PreparedNativePartyImportRow): 'hall' | 'customer' | 'supplier' | 'staff' | 'warehouse' => row.entity.toLowerCase() as 'hall' | 'customer' | 'supplier' | 'staff' | 'warehouse';
function requirePartyRuntime(chunk: PreparedNativePartyImportChunk, runtime26: NativeRuntime26Capability | undefined): void {
  const successor = chunk.selection.source === 'HISTORICAL_CUSTOMER_SUPPLEMENT_V1' || chunk.rows.some(row =>
    row.input.schemaProfile === 'EXACT26' || Object.hasOwn(row.input.source.fieldProvenance.fields as object, 'bootstrap_accounts'));
  check(!successor || runtime26 !== undefined, 'NATIVE_PARTY_EXACT26_REQUIRED');
}
/** Trusted exact reviewed schema-13/14 import adapter, NOT a public command or live PartyService bypass.
 * The caller supplies an explicit pool: no network destination, migration runner, retry,
 * native IDs, codes, account/password/API key or publication authority is invented here.
 */
export class PostgresNativePartyImportStore implements NativePartyImportStore {
  private readonly pool: PgSalesPool;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgSalesPool, runtime26?: NativeRuntime26Capability) { this.pool = pool; this.runtime26 = checkedNativeRuntime26Capability(runtime26); }
  async stage(input: PreparedNativePartyImportChunk): Promise<{ inserted: number; replayed: number }> {
    const chunk = structuredClone(input); validatePreparedNativePartyImportChunk(chunk);
    requirePartyRuntime(chunk, this.runtime26);
    const client = await this.pool.connect(); let began = false, commitAttempted = false, discard: Error | undefined;
    try {
      if (this.runtime26) await this.runtime26.assertReady(client, 'IMPORT_STAGE');
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED'); began = true;
      const result = await new NativePartyTransactionWriter().write(client, chunk, this.runtime26); commitAttempted = true; await client.query('COMMIT'); return result;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : Error('NATIVE_PARTY_UNKNOWN_OUTCOME');
      // COMMIT may have succeeded remotely. Never roll it back, reconnect or automatically retry.
      if (began && !commitAttempted) try { await client.query('ROLLBACK'); } catch (rollback) {
        discard = rollback instanceof Error ? rollback : Error('NATIVE_PARTY_ROLLBACK_FAILED');
        throw new AggregateError([error, rollback], 'Native party import failed; connection discarded');
      }
      throw error;
    } finally { client.release(discard); }
  }

}

/** Borrow the exact MAIN transaction client. This function never connects,
 * begins, commits, rolls back or releases. Original native/source/intent/replay
 * logic is shared with the ordinary stage() adapter, with unchanged validators. */
export async function stageNativePartyImportsOnClient(client: Pick<PgSalesClient, 'query'>, input: PreparedNativePartyImportChunk, runtime26?: NativeRuntime26Capability): Promise<{ inserted: number; replayed: number }> {
  const chunk = structuredClone(input); validatePreparedNativePartyImportChunk(chunk);
  const verified = checkedNativeRuntime26Capability(runtime26); requirePartyRuntime(chunk, verified);
  if (verified) await verified.assertReady(client, 'IMPORT_STAGE');
  // Preserve the actual borrowed object: the issuer binds this exact client.
  // No connection, transaction ownership or release method is used by this writer.
  return new NativePartyTransactionWriter().write(client, chunk, verified);
}

class NativePartyTransactionWriter {
  async write(client: Pick<PgSalesClient, 'query'>, chunk: PreparedNativePartyImportChunk, runtime26: NativeRuntime26Capability | undefined): Promise<{ inserted: number; replayed: number }> {
    await client.query('/* native-party-import:global-lock */ SELECT naijue_erp.cutoff_import_lock()');
    const schema = (await client.query(`/* native-party-import:schema */ SELECT array_agg(version ORDER BY version) AS installed_versions FROM naijue_erp.schema_migration`)).rows;
    check(schema.length === 1, 'NATIVE_PARTY_SCHEMA_NOT_READY');
    if (runtime26) {
      const versions = schema[0]!.installed_versions;
      check(Array.isArray(versions) && versions.length === 26 && versions.every((n, i) => n === i + 1), 'NATIVE_PARTY_SCHEMA_NOT_READY');
    } else {
      const reviewedSchema = assertReviewedNativeImportSchema(schema[0]!.installed_versions, { minimumVersion: 13, errorCode: 'NATIVE_PARTY_SCHEMA_NOT_READY' });
      // These two borrowed helpers only query; their historical type includes release.
      if ((reviewedSchema.versions.length === 18 || reviewedSchema.versions.length === 19)) await assertNativeImportAccountingGuards(client as PgSalesClient);
    }
    const batches = (await client.query(`/* native-party-import:batch */ SELECT mapping_version,status,source_hash,source_name,
      EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') AS already_published FROM naijue_erp.import_batch WHERE id=$1::uuid FOR UPDATE`, [chunk.batchId])).rows;
    const batch = batches[0];
    check(batches.length === 1 && batch?.mapping_version === chunk.mappingVersion && ['STAGED', 'VALIDATING'].includes(String(batch.status))
      && batch.source_hash === chunk.selection.selectionSha256 && batch.source_name === chunk.fixedSourceNamespace && batch.already_published === false, 'NATIVE_PARTY_BATCH_NOT_OPEN_OR_BOUND');
    const rows = [...chunk.rows].sort((a, b) => `${table(a)}:${a.nativeId}`.localeCompare(`${table(b)}:${b.nativeId}`));
    const exists = new Set<string>();
    // Acquire ALL native targets, then ALL explicit relation targets, before any source/evidence access.
    // cutoff lock serializes import writers; normal runtime writes retain their own native locks/unique codes.
    for (const row of rows) {
      const party = row.entity === 'CUSTOMER' || row.entity === 'SUPPLIER';
      const found = (await client.query(`/* native-party-import:target */ SELECT id FROM naijue_erp.${table(row)}
        WHERE id=$1::uuid${party ? ' OR code=$2' : ''} ORDER BY id FOR UPDATE`, party ? [row.nativeId, row.nativeSnapshot.code] : [row.nativeId])).rows;
      check(found.length <= 1 && (found.length === 0 || found[0]!.id === row.nativeId), 'NATIVE_PARTY_NATIVE_ID_OR_CODE_CONFLICT');
      if (found.length) exists.add(row.nativeId);
    }
    const relations = new Map<string, { table: string; id: string }>();
    for (const row of rows) for (const [field, binding] of Object.entries(row.input.bindings)) if (binding) {
      const relationTable = field === '默认客户来源编号' ? 'customer' : field === '默认销货仓来源编号' ? 'warehouse' : 'hall';
      relations.set(`${relationTable}:${binding.nativeId}`, { table: relationTable, id: binding.nativeId });
    }
    for (const [, relation] of [...relations.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const found = (await client.query(`/* native-party-import:relation-native */ SELECT id FROM naijue_erp.${relation.table} WHERE id=$1::uuid FOR SHARE`, [relation.id])).rows;
      check(found.length === 1 || rows.some(row => table(row) === relation.table && row.nativeId === relation.id), 'NATIVE_PARTY_RELATION_NATIVE_MISSING');
    }
    let inserted = 0, replayed = 0;
    const sourcePlans: Array<{ row: PreparedNativePartyImportRow; source: JsonObject }> = [];
    const creations: PreparedNativePartyImportRow[] = [];
    const replayRows: PreparedNativePartyImportRow[] = [];
    for (const row of rows) {
      const source = (row.headerReference ? historyHeaderNativeReferenceEvidence(row.headerReference, 0).source : nativePartyStandaloneImportSource(row)) as JsonObject;
      sourcePlans.push({ row, source });
      const intent: JsonObject = { batch_id: chunk.batchId, source_row_id: row.input.source.id, entity_type: row.entity, source_key: row.input.source.sourceKey,
        native_id: row.nativeId, native_snapshot: row.nativeSnapshot, source_snapshot: source, selection: { ...row.input.selection },
        warehouse_record: row.input.warehouseRecord ? { id: row.input.warehouseRecord.id, reviewedAt: row.input.warehouseRecord.reviewedAt, decisionReason: row.input.warehouseRecord.decisionReason } : null,
        authorization: row.authorization as unknown as JsonObject, row_fingerprint: row.fingerprint, validator_version: NATIVE_PARTY_IMPORT_VERSION };
      const prior = (await client.query(`/* native-party-import:replay */ SELECT
        (to_jsonb(e)-ARRAY['creation_xid','imported_at','native_hall_id','native_customer_id','native_supplier_id','native_staff_id','native_warehouse_id'])=$1::jsonb AS evidence_equal
        FROM naijue_erp.native_party_import_evidence e WHERE source_row_id=$2::uuid OR (batch_id=$3::uuid AND entity_type=$4 AND (source_key=$5 OR native_id=$6::uuid))
          OR (entity_type=$4 AND source_key=$5 AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=e.batch_id AND b.source_name=$7))`,
        [JSON.stringify(intent), row.input.source.id, chunk.batchId, row.entity, row.input.source.sourceKey, row.nativeId, chunk.fixedSourceNamespace])).rows;
      if (prior.length) {
        check(prior.length === 1 && prior[0]!.evidence_equal === true && exists.has(row.nativeId), 'NATIVE_PARTY_REPLAY_CONFLICT'); replayed++; replayRows.push(row);
      } else {
        check(!exists.has(row.nativeId), 'NATIVE_PARTY_EXISTING_NATIVE_NOT_A_CREATION_REPLAY');
        // This same-xact immutable intent is required by the two narrow 0013 native INSERT branches.
        // Its source/native FKs and full source/native equality are enforced at COMMIT.
        const saved = await client.query(`/* native-party-import:intent */ INSERT INTO naijue_erp.native_party_import_evidence
          (batch_id,source_row_id,entity_type,source_key,native_id,native_snapshot,source_snapshot,selection,warehouse_record,"authorization",row_fingerprint,validator_version)
          SELECT r.batch_id,r.source_row_id,r.entity_type,r.source_key,r.native_id,r.native_snapshot,r.source_snapshot,r.selection,r.warehouse_record,r."authorization",r.row_fingerprint,r.validator_version
          FROM jsonb_populate_record(NULL::naijue_erp.native_party_import_evidence,$1::jsonb) r RETURNING source_row_id`, [JSON.stringify(intent)]);
        check(saved.rowCount === 1 && saved.rows[0]?.source_row_id === row.input.source.id, 'NATIVE_PARTY_INTENT_INSERT');
        creations.push(row); inserted++;
      }
    }
    const rank: Record<string, number> = { CUSTOMER: 0, SUPPLIER: 0, HALL: 1, WAREHOUSE: 2, STAFF: 3 };
    for (const row of creations.sort((a, b) => rank[a.entity]! - rank[b.entity]! || a.nativeId.localeCompare(b.nativeId))) {
      // The 0001 FK pair is immediate. Only a NEW hall may temporarily omit its default warehouse
      // inside this transaction; exact final original values are enforced by the deferred intent guard.
      const initial = row.entity === 'HALL' && row.nativeSnapshot.default_sales_warehouse_id !== null
        ? { ...row.nativeSnapshot, default_sales_warehouse_id: null } : row.nativeSnapshot;
      const native = await client.query(`/* native-party-import:create */ INSERT INTO naijue_erp.${table(row)} SELECT r.*
        FROM jsonb_populate_record(NULL::naijue_erp.${table(row)},$1::jsonb) r RETURNING id`, [JSON.stringify(initial)]);
      check(native.rowCount === 1 && native.rows[0]?.id === row.nativeId, 'NATIVE_PARTY_NATIVE_INSERT');
    }
    for (const row of creations) if (row.entity === 'HALL' && row.nativeSnapshot.default_sales_warehouse_id !== null) {
      const restored = await client.query(`/* native-party-import:complete-new-hall */ UPDATE naijue_erp.hall h
        SET default_sales_warehouse_id=$2::uuid WHERE h.id=$1::uuid AND h.version=1 AND h.default_sales_warehouse_id IS NULL
        AND EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.entity_type='HALL' AND e.native_id=h.id
          AND e.creation_xid=pg_current_xact_id() AND e.native_snapshot=$3::jsonb) RETURNING h.id`, [row.nativeId, row.nativeSnapshot.default_sales_warehouse_id, JSON.stringify(row.nativeSnapshot)]);
      check(restored.rowCount === 1 && restored.rows[0]?.id === row.nativeId, 'NATIVE_PARTY_NEW_HALL_COMPLETION');
    }
    for (const row of creations) {
      const oldSources = (await client.query(`/* native-party-import:new-source-identity */ SELECT s.id
        FROM naijue_erp.import_source_row s JOIN naijue_erp.import_batch b ON b.id=s.batch_id
        WHERE s.id=$4::uuid OR (b.source_name=$1 AND ((s.entity_type=$2 AND s.source_key=$3)
          OR (s.source_file_sha256=$5 AND s.sheet=$6 AND s.row_no=$7::bigint))) FOR SHARE OF s`,
        [chunk.fixedSourceNamespace, row.entity, row.input.source.sourceKey, row.input.source.id, row.input.source.sourceFileSha256, row.input.source.sheet, row.input.source.rowNo])).rows;
      check(oldSources.length === 0, 'NATIVE_PARTY_SOURCE_ALREADY_BOUND_RESUME_ORIGINAL_BATCH');
    }
    // The original source/catalogue reads used to establish replay completeness also wait
    // until ALL newly created targets and final HALL defaults have been completed.
    for (const row of replayRows) {
      const complete = (await client.query(`/* native-party-import:replay-complete */ SELECT
        EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=e.batch_id AND s.id=e.source_row_id
          AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) AS source_complete,
        (e.entity_type IN ('SUPPLIER','WAREHOUSE') OR EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference r
          WHERE r.batch_id=e.batch_id AND r.source_row_id=e.source_row_id AND r.entity_type=e.entity_type AND r.source_key=e.source_key
          AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)=e.native_id AND r.native_snapshot=e.native_snapshot AND r.native_version=1)) AS reference_complete,
        (e.entity_type<>'WAREHOUSE' OR EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.id=(e.warehouse_record->>'id')::uuid
          AND r.import_batch_id=e.batch_id AND r.source_entity_type='WAREHOUSE' AND r.source_key=e.source_key
          AND r.source_record_hash=e.source_snapshot->>'row_sha256' AND r.source_file_ref=e.source_snapshot->>'file_ref'
          AND r.target_type='WAREHOUSE' AND r.target_id=e.native_id AND r.status='IMPORTED'
          AND r.decision_reason=e.warehouse_record->>'decisionReason' AND r.reviewed_at=(e.warehouse_record->>'reviewedAt')::timestamptz)) AS record_complete
        FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=$1::uuid AND e.source_row_id=$2::uuid`,
        [chunk.batchId, row.input.source.id])).rows;
      check(complete.length === 1 && complete[0]!.source_complete === true && complete[0]!.reference_complete === true && complete[0]!.record_complete === true,
        'NATIVE_PARTY_REPLAY_INCOMPLETE');
    }
    // Only after ALL new native targets exist do source/reference writers touch immutable originals.
    for (const { row, source } of sourcePlans.sort((a, b) => (a.row.entity === 'WAREHOUSE' ? -1 : rank[a.row.entity]!) - (b.row.entity === 'WAREHOUSE' ? -1 : rank[b.row.entity]!))) {
      if (row.headerReference) await insertValidatedHistoryHeaderNativeReferences(client as PgSalesClient, row.headerReference, runtime26);
      else await this.standaloneSource(client, row, source);
      if (row.entity === 'WAREHOUSE') await this.warehouseRecord(client, row);
    }
    return { inserted, replayed };
  }
  private async standaloneSource(client: Pick<PgSalesClient, 'query'>, row: PreparedNativePartyImportRow, source: JsonObject): Promise<void> {
    const s = row.input.source;
    const prior = (await client.query(`/* native-party-import:supplier-source-replay */ SELECT
      to_jsonb(s) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,$2::jsonb)) AS source_equal
      FROM naijue_erp.import_source_row s WHERE id=$1::uuid OR (batch_id=$3::uuid AND ((entity_type=$8 AND source_key=$4)
        OR (source_file_sha256=$5 AND sheet=$6 AND row_no=$7::bigint)))`, [s.id, JSON.stringify(source), s.batchId, s.sourceKey, s.sourceFileSha256, s.sheet, s.rowNo, row.entity])).rows;
    if (prior.length) { check(prior.length === 1 && prior[0]!.source_equal === true, 'NATIVE_PARTY_SOURCE_REPLAY_CONFLICT'); return; }
    const saved = await client.query(`/* native-party-import:supplier-source */ INSERT INTO naijue_erp.import_source_row SELECT r.*
      FROM jsonb_populate_record(NULL::naijue_erp.import_source_row,$1::jsonb) r RETURNING id`, [JSON.stringify(source)]);
    check(saved.rowCount === 1 && saved.rows[0]?.id === s.id, 'NATIVE_PARTY_SOURCE_INSERT');
  }
  private async warehouseRecord(client: Pick<PgSalesClient, 'query'>, row: PreparedNativePartyImportRow): Promise<void> {
    const s = row.input.source, metadata = row.input.warehouseRecord!;
    const record = { id: metadata.id, import_batch_id: s.batchId, source_entity_type: 'WAREHOUSE', source_key: s.sourceKey,
      source_record_hash: s.rowSha256, source_file_ref: s.fileRef, target_type: 'WAREHOUSE', target_id: row.nativeId, status: 'IMPORTED',
      decision_reason: metadata.decisionReason, reviewed_at: metadata.reviewedAt };
    const prior = (await client.query(`/* native-party-import:warehouse-record-replay */ SELECT
      to_jsonb(r) IS NOT DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_record,$1::jsonb)) AS record_equal
      FROM naijue_erp.import_record r JOIN naijue_erp.import_batch b ON b.id=r.import_batch_id
      WHERE r.id=$2::uuid OR (b.source_name=$3 AND r.source_entity_type='WAREHOUSE' AND r.source_key=$4)
        OR (r.import_batch_id=$5::uuid AND r.target_type='WAREHOUSE' AND r.target_id=$6::uuid)`,
      [JSON.stringify(record), metadata.id, row.input.fixedSourceNamespace, s.sourceKey, s.batchId, row.nativeId])).rows;
    if (prior.length) { check(prior.length === 1 && prior[0]!.record_equal === true, 'NATIVE_PARTY_WAREHOUSE_RECORD_REPLAY_CONFLICT'); return; }
    const saved = await client.query(`/* native-party-import:warehouse-record */ INSERT INTO naijue_erp.import_record SELECT r.*
      FROM jsonb_populate_record(NULL::naijue_erp.import_record,$1::jsonb) r RETURNING id`, [JSON.stringify(record)]);
    check(saved.rowCount === 1 && saved.rows[0]?.id === metadata.id, 'NATIVE_PARTY_WAREHOUSE_RECORD_INSERT');
  }

}
