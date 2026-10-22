import type { CutoffImportBatch } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { publishedCutoffScope } from "../../../packages/application/src/inventory-cutoff-scope.ts";
import type { PublishedCutoffScope } from "../../../packages/application/src/inventory-cutoff-scope.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { booleanValue, nullableString, stringValue } from "./codec.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import type { PgSalesClient, PgSalesPool } from "./sales-unit-of-work.ts";

const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
/** Reusable only inside an already-open consistent snapshot. No source files, old IDs, or history scan. */
export async function readPublishedCutoffScope(client: Pick<PgSalesClient, "query">): Promise<PublishedCutoffScope> {
  const rows = (await client.query(`SELECT id, source_name, source_manifest_ref, source_hash, ${stamp("cutoff_at")} AS cutoff_at,
    mapping_version, inventory_mode, status, checkpoint, ${stamp("created_at")} AS created_at, ${stamp("completed_at")} AS completed_at
    FROM naijue_erp.import_batch WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE' ORDER BY id`)).rows;
  requireDomain(rows.length > 0, "INVENTORY_NOT_READY", "No completely published inventory takeover is available");
  requireDomain(rows.length === 1, "INVENTORY_INTEGRITY_FAILED", "Multiple initial published scopes are not legal");
  const row = rows[0]!;
  requireDomain(row.status === "IMPORTED" && row.inventory_mode === "CUTOFF_STOCK_BASELINE", "INVENTORY_INTEGRITY_FAILED", "Unexpected published scope state");
  const batch: CutoffImportBatch = { id: stringValue(row.id), sourceName: stringValue(row.source_name), sourceManifestRef: stringValue(row.source_manifest_ref),
    sourceHash: stringValue(row.source_hash), cutoffAt: stringValue(row.cutoff_at), mappingVersion: stringValue(row.mapping_version),
    inventoryMode: "CUTOFF_STOCK_BASELINE", status: "IMPORTED", checkpoint: decodeImportCheckpoint(row.checkpoint), createdAt: stringValue(row.created_at), completedAt: nullableString(row.completed_at) };
  const integrity = (await client.query(`SELECT
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'naijue_erp.inventory_ledger'::regclass
      AND conname = 'ledger_retains_balance' AND convalidated AND condeferrable AND confdeltype = 'a')
    AND (SELECT count(*) = 23 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'naijue_erp' AND t.tgenabled = 'O'
      AND t.tgname = ANY(ARRAY['immutable_ledger', 'immutable_import_record', 'immutable_audit', 'immutable_receipt',
        'import_batch_transition', 'import_batch_command_consistency', 'inventory_balance_identity',
        'sparse_balance_final_consistency', 'cutoff_ledger_guard', 'import_record_identity',
        'warehouse_import_identity', 'sku_import_identity', 'import_source_final_consistency', 'baseline_source_final_consistency', 'import_operation_consistency',
        'cutoff_ledger_no_truncate', 'cutoff_balance_no_truncate', 'cutoff_sources_no_truncate', 'cutoff_batch_no_truncate',
        'cutoff_receipts_no_truncate', 'cutoff_audits_no_truncate', 'cutoff_warehouse_no_truncate', 'cutoff_sku_no_truncate'])) AS integrity_guards_present`)).rows[0];
  requireDomain(integrity !== undefined, "INVENTORY_INTEGRITY_FAILED", "Native integrity capability check failed");
  const members = (await client.query(`SELECT r.target_type, r.target_id,
    CASE r.target_type WHEN 'WAREHOUSE' THEN w.id IS NOT NULL WHEN 'SKU' THEN s.id IS NOT NULL ELSE false END AS target_exists
    FROM naijue_erp.import_record r LEFT JOIN naijue_erp.warehouse w ON r.target_type = 'WAREHOUSE' AND w.id = r.target_id
      LEFT JOIN naijue_erp.sku s ON r.target_type = 'SKU' AND s.id = r.target_id
    WHERE r.import_batch_id = $1 AND r.status = 'IMPORTED' AND r.target_type IN ('WAREHOUSE', 'SKU') ORDER BY r.target_type, r.target_id`, [batch.id])).rows;
  return publishedCutoffScope(batch, members.map(member => {
    requireDomain(member.target_type === "WAREHOUSE" || member.target_type === "SKU", "INVENTORY_INTEGRITY_FAILED", "Invalid scope member tag");
    return { targetType: member.target_type, targetId: stringValue(member.target_id), targetExists: booleanValue(member.target_exists) };
  }), booleanValue(integrity.integrity_guards_present));
}
/** Standalone scope inspection; the future inventory PG query must call the helper in its OWN shared snapshot. */
export class PostgresCutoffScopeReader {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async read(): Promise<PublishedCutoffScope> {
    const client = await this.pool.connect(); let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const scope = await readPublishedCutoffScope(client); commitAttempted = true; await client.query("COMMIT"); return scope;
    } catch (error) {
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("Scope read failed");
      if (began && !commitAttempted) try { await client.query("ROLLBACK"); } catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("Scope rollback failed");
        throw new AggregateError([error, rollbackError], "Scope read and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
}
