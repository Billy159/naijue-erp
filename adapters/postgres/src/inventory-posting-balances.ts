import type { InventoryBalanceRow, InventoryLedgerRow } from "../../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId } from "../../../packages/domain/src/values.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import { booleanValue, quantityFromSql, stringValue, versionFromSql, versionToSql } from "./codec.ts";
import type { PgSalesResult } from "./sales-unit-of-work.ts";

type Query = (sql: string, values?: unknown[]) => Promise<PgSalesResult>;
interface Key { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku"> }
const key = (warehouse: string, sku: string): string => JSON.stringify([warehouse, sku]);
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const integrity = (condition: unknown, message: string): void => requireDomain(condition, "INVENTORY_INTEGRITY_FAILED", message);
/** Constant-size native capability proof, exact table/trigger pairs. Not protection against a privileged owner bypassing guards. */
const GUARDS = `/* posting:guards */ SELECT
  EXISTS (SELECT 1 FROM naijue_erp.schema_migration WHERE version = 8)
  AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'naijue_erp.inventory_ledger'::regclass
    AND confrelid = 'naijue_erp.inventory_balance'::regclass AND conname = 'ledger_retains_balance'
    AND contype = 'f' AND convalidated AND condeferrable AND confdeltype = 'a')
  AND NOT EXISTS (SELECT 1 FROM (VALUES
    ('inventory_ledger', 'immutable_ledger'), ('import_record', 'immutable_import_record'),
    ('audit_change', 'immutable_audit'), ('operation_receipt', 'immutable_receipt'),
    ('import_batch', 'import_batch_transition'), ('import_batch', 'import_batch_command_consistency'),
    ('inventory_balance', 'inventory_balance_identity'), ('inventory_balance', 'sparse_balance_final_consistency'),
    ('inventory_ledger', 'cutoff_ledger_guard'), ('import_record', 'import_record_identity'),
    ('warehouse', 'warehouse_import_identity'), ('sku', 'sku_import_identity'),
    ('import_record', 'import_source_final_consistency'), ('inventory_ledger', 'baseline_source_final_consistency'),
    ('operation_receipt', 'import_operation_consistency'), ('inventory_ledger', 'cutoff_ledger_no_truncate'),
    ('inventory_balance', 'cutoff_balance_no_truncate'), ('import_record', 'cutoff_sources_no_truncate'),
    ('import_batch', 'cutoff_batch_no_truncate'), ('operation_receipt', 'cutoff_receipts_no_truncate'),
    ('audit_change', 'cutoff_audits_no_truncate'), ('warehouse', 'cutoff_warehouse_no_truncate'), ('sku', 'cutoff_sku_no_truncate'),
    ('inventory_ledger', 'validate_sales_ledger_source'), ('inventory_ledger', 'validate_transfer_ledger_source'),
    ('inventory_ledger', 'ledger_receipt_source_coherence'), ('operation_receipt', 'sales_receipt_final_consistency'),
    ('operation_receipt', 'transfer_receipt_final_consistency')
  ) AS required(table_name, trigger_name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'naijue_erp'
      AND c.relname = required.table_name AND t.tgname = required.trigger_name AND t.tgenabled = 'O'))
  AND NOT EXISTS (SELECT 1 FROM (VALUES ('import_batch', 'import_one_published_cutoff'), ('import_record', 'import_scope_target_once'))
    AS required(table_name, index_name) WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_class x ON x.oid = i.indexrelid WHERE n.nspname = 'naijue_erp' AND c.relname = required.table_name
      AND x.relname = required.index_name AND i.indisunique AND i.indisvalid AND i.indisready)) AS integrity_guards_present`;

/** One command transaction owns this object. No proof/cache survives COMMIT, rollback or callback close. */
export class PostgresPostingBalances {
  private readonly query: Query;
  private locked: Set<string> | undefined;
  private readonly balances = new Map<string, InventoryBalanceRow>();
  private readonly provenZero = new Set<string>();
  private readonly firstEffects = new Map<string, InventoryLedgerRow>();
  private batchId: string | undefined;
  constructor(query: Query) { this.query = query; }
  async lock(keys: readonly Key[]): Promise<void> {
    requireDomain(this.locked === undefined, "TRANSACTION_SCOPE", "Lock the complete posting set exactly once");
    // IDENTICAL binary JSON tuple order and SQL lock namespace to the cutoff importer.
    const unique = [...new Map(keys.map(row => [key(row.warehouseId, row.skuId), row])).entries()]
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    this.locked = new Set(unique.map(([identity]) => identity));
    // Separate awaited calls make evaluation order explicit, independent of a SQL planner's target-list evaluation.
    for (const [, row] of unique) await this.query("SELECT naijue_erp.inventory_key_lock($1::uuid, $2::uuid)", [row.warehouseId, row.skuId]);
    if (unique.length === 0) return;
    const rows = (await this.query(`SELECT b.warehouse_id, b.sku_id, b.quantity::text, b.version, b.last_operation_id, ${stamp("b.updated_at")} AS updated_at
      FROM naijue_erp.inventory_balance b JOIN unnest($1::uuid[], $2::uuid[]) AS k(warehouse_id, sku_id)
      ON k.warehouse_id = b.warehouse_id AND k.sku_id = b.sku_id ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b`,
    [unique.map(([, row]) => row.warehouseId), unique.map(([, row]) => row.skuId)])).rows;
    for (const row of rows) {
      const balance: InventoryBalanceRow = { warehouseId: entityId("warehouse", stringValue(row.warehouse_id)), skuId: entityId("sku", stringValue(row.sku_id)),
        quantity: quantityFromSql(row.quantity), version: versionFromSql(row.version), lastOperationId: row.last_operation_id === null ? null : entityId("operation", stringValue(row.last_operation_id)), updatedAt: stringValue(row.updated_at) };
      const identity = key(balance.warehouseId, balance.skuId);
      integrity(this.locked.has(identity) && !this.balances.has(identity), "Unexpected or duplicate locked balance");
      this.balances.set(identity, balance);
    }
  }
  get(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): InventoryBalanceRow | undefined {
    requireDomain(this.locked?.has(key(warehouseId, skuId)), "TRANSACTION_SCOPE", "Balance must belong to the complete locked posting set");
    return structuredClone(this.balances.get(key(warehouseId, skuId)));
  }
  private async publication(): Promise<string> {
    if (this.batchId !== undefined) return this.batchId;
    const rows = (await this.query(`/* posting:publication */ SELECT b.id, b.checkpoint, b.completed_at IS NOT NULL AS completed,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
        AND r.target_type = 'IMPORT_BATCH' AND r.target_id = b.id AND r.source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
        AND r.source_key = 'FINAL_COMPLETE_SCOPE' AND r.decision_reason = $1 AND r.source_record_hash = b.source_hash
        AND r.source_file_ref = b.source_manifest_ref) AS final_approval
      FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
    requireDomain(rows.length > 0, "INVENTORY_NOT_READY", "No completely published inventory takeover is available");
    integrity(rows.length === 1, "Multiple published initial scopes are not legal");
    const row = rows[0]!;
    integrity(booleanValue(row.completed) && booleanValue(row.final_approval), "Complete immutable scope approval is unavailable");
    const checkpoint = decodeImportCheckpoint(row.checkpoint);
    integrity(checkpoint.sequence > 0 && checkpoint.expected.IMPORT_BATCH === 1
      && Object.entries(checkpoint.expected).every(([kind, expected]) => checkpoint.counts[kind as keyof typeof checkpoint.counts] === expected)
      && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, value) => sum + value, 0), "Published checkpoint is incomplete");
    const guards = (await this.query(GUARDS)).rows;
    integrity(guards.length === 1 && booleanValue(guards[0]!.integrity_guards_present), "Native runtime sparse first-use guards are unavailable");
    this.batchId = entityId("operation", stringValue(row.id));
    return this.batchId;
  }
  async assertZero(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<void> {
    const identity = key(warehouseId, skuId);
    requireDomain(this.locked?.has(identity) && !this.balances.has(identity), "TRANSACTION_SCOPE", "Only an absent locked posting key can acquire a zero proof");
    if (this.provenZero.has(identity)) return;
    const batchId = await this.publication();
    const rows = (await this.query(`/* posting:zero-key */ SELECT w.id AS warehouse_id, s.id AS sku_id,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $3::uuid AND r.status = 'IMPORTED'
        AND r.target_type = 'WAREHOUSE' AND r.target_id = w.id) AS warehouse_published,
      EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = $3::uuid AND r.status = 'IMPORTED'
        AND r.target_type = 'SKU' AND r.target_id = s.id) AS sku_published,
      NOT EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id = w.id AND b.sku_id = s.id) AS balance_absent,
      NOT EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id = w.id AND l.sku_id = s.id) AS ledger_absent,
      m.size_id IS NOT NULL AS valid_size
      FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id = w.hall_id
      JOIN naijue_erp.sku s ON s.id = $2::uuid JOIN naijue_erp.product p ON p.id = s.product_id
      JOIN naijue_erp.color c ON c.id = s.color_id JOIN naijue_erp.fit f ON f.id = s.fit_id
      JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id
      WHERE w.id = $1::uuid FOR SHARE OF w, h, s, p, c, f, m`, [warehouseId, skuId, batchId])).rows;
    requireDomain(rows.length === 1 && rows[0]!.warehouse_id === warehouseId && rows[0]!.sku_id === skuId
      && booleanValue(rows[0]!.warehouse_published) && booleanValue(rows[0]!.sku_published), "INVENTORY_NOT_READY", "Exact native posting key is outside the proven published scope");
    const row = rows[0]!;
    integrity(booleanValue(row.balance_absent) && booleanValue(row.ledger_absent) && booleanValue(row.valid_size), "Missing balance is not a previously unused valid native key");
    this.provenZero.add(identity);
  }
  assertCanAppend(row: InventoryLedgerRow): void {
    const identity = key(row.warehouseId, row.skuId);
    requireDomain(this.locked?.has(identity), "TRANSACTION_SCOPE", "Ledger key must belong to the complete locked posting set");
    requireDomain(this.balances.has(identity) || (this.provenZero.has(identity) && row.eventKind === "APPROVE" && row.reversesEntryId === null),
      "INVENTORY_NOT_READY", "Ledger requires an existing balance or explicit first-approval zero proof");
    requireDomain(!this.firstEffects.has(identity), "TRANSACTION_SCOPE", "Persist the first actual balance before another same-key effect");
  }
  didAppend(row: InventoryLedgerRow): void {
    if (!this.balances.has(key(row.warehouseId, row.skuId))) this.firstEffects.set(key(row.warehouseId, row.skuId), structuredClone(row));
  }
  async put(row: InventoryBalanceRow): Promise<void> {
    const identity = key(row.warehouseId, row.skuId); const previous = this.get(row.warehouseId, row.skuId);
    let result: PgSalesResult;
    if (previous === undefined) {
      const first = this.firstEffects.get(identity);
      requireDomain(this.provenZero.has(identity) && first && row.version === 1 && row.quantity === first.quantityDelta
        && row.lastOperationId === first.operationId && row.updatedAt === first.postedAt,
        "INVENTORY_NOT_READY", "First balance must be the exact appended runtime approval, never a zero placeholder");
      result = await this.query(`INSERT INTO naijue_erp.inventory_balance (warehouse_id, sku_id, quantity, version, last_operation_id, updated_at)
        VALUES ($1, $2, $3::bigint, $4, $5, $6::timestamptz) ON CONFLICT (warehouse_id, sku_id) DO NOTHING`,
      [row.warehouseId, row.skuId, row.quantity.toString(), versionToSql(row.version), row.lastOperationId, row.updatedAt]);
    } else {
      requireDomain(row.version === previous.version + 1, "VERSION_CONFLICT", "Balance must advance exactly once per effect");
      result = await this.query(`UPDATE naijue_erp.inventory_balance SET quantity = $3, version = $4, last_operation_id = $5, updated_at = $6
        WHERE warehouse_id = $1 AND sku_id = $2 AND version = $7`,
      [row.warehouseId, row.skuId, row.quantity.toString(), versionToSql(row.version), row.lastOperationId, row.updatedAt, versionToSql(previous.version)]);
    }
    requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Inventory first-insert or compare-and-swap failed");
    this.balances.set(identity, structuredClone(row)); this.firstEffects.delete(identity);
  }
}
