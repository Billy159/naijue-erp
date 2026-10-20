import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import type { InventoryLedgerEntry, InventoryLedgerScopedRead, InventoryLedgerSnapshot, InventoryLedgerSource, TrustedInventoryLedgerSnapshotReader } from "../../../packages/application/src/inventory-ledger-query-contracts.ts";
import { activeInventoryLedgerRead, checkedInventoryLedgerSnapshot, parseInventoryLedgerQuery } from "../../../packages/application/src/inventory-ledger-query-validation.ts";
import { checkedInventoryActor } from "../../../packages/application/src/inventory-query-service.ts";
import { checkedInventoryScope } from "../../../packages/application/src/inventory-query-validation.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { decodeImportCheckpoint } from "./inventory-cutoff-import-store.ts";
import { GUARD_CAPABILITY } from "./inventory-publication-guards.ts";
import { booleanValue, stringValue } from "./codec.ts";

export interface PgInventoryLedgerQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgInventoryLedgerQueryClient { query(text: string, values?: unknown[]): Promise<PgInventoryLedgerQueryResult>; release(error?: Error | boolean): void }
export interface PgInventoryLedgerQueryPool { connect(): Promise<PgInventoryLedgerQueryClient> }
type PgPoolCompatibility = Pool extends PgInventoryLedgerQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
type Query = (sql: string, values?: unknown[]) => Promise<PgInventoryLedgerQueryResult>;
type Row = Record<string, unknown>;
function integrity(condition: unknown, message: string): asserts condition { requireDomain(condition, "INVENTORY_INTEGRITY_FAILED", message); }
function one(result: PgInventoryLedgerQueryResult): Row { integrity(result.rows.length === 1, "Expected one exact native inventory ledger fact"); return result.rows[0]!; }
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const stamp = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Only constant-size publication evidence and exact key membership, not a history/source reconciliation. */
async function publishedKey(query: Query, warehouseId: string, skuId: string): Promise<string> {
  const rows = (await query(`/* inventory-ledger:publication */ SELECT b.id, b.checkpoint, b.completed_at IS NOT NULL AS completed,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
      AND r.target_type = 'IMPORT_BATCH' AND r.target_id = b.id AND r.source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
      AND r.source_key = 'FINAL_COMPLETE_SCOPE' AND r.decision_reason = $3 AND r.source_record_hash = b.source_hash
      AND r.source_file_ref = b.source_manifest_ref) AS final_approval,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
      AND r.target_type = 'WAREHOUSE' AND r.target_id = $1::uuid) AS warehouse_published,
    EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED'
      AND r.target_type = 'SKU' AND r.target_id = $2::uuid) AS sku_published
    FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE'
    ORDER BY b.id LIMIT 2`, [warehouseId, skuId, COMPLETE_SCOPE_DECISION])).rows;
  requireDomain(rows.length > 0, "INVENTORY_NOT_READY", "Published inventory facts are unavailable");
  integrity(rows.length === 1, "Multiple published cutoffs are not legal"); const row = rows[0]!;
  integrity(booleanValue(row.completed) && booleanValue(row.final_approval), "Published inventory final approval is unavailable");
  const checkpoint = decodeImportCheckpoint(row.checkpoint);
  integrity(checkpoint.sequence > 0 && Object.entries(checkpoint.expected).every(([kind, expected]) => checkpoint.counts[kind as keyof typeof checkpoint.counts] === expected)
    && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, value) => sum + value, 0), "Published inventory checkpoint is incomplete");
  requireDomain(booleanValue(row.warehouse_published) && booleanValue(row.sku_published), "INVENTORY_NOT_READY", "Exact inventory key publication is unavailable");
  integrity(booleanValue(one(await query(GUARD_CAPABILITY)).integrity_guards_present), "Native inventory publication guards are unavailable");
  return id("operation", row.id);
}
function decodeEntry(row: Row, publishedBatchId: string): InventoryLedgerEntry {
  let source: InventoryLedgerSource;
  if (row.source_sales_line_id !== null) {
    integrity(row.source_transfer_line_id === null && row.source_import_batch_id === null && row.source_transfer_id === null, "Native ledger source is not a closed sales variant");
    source = { kind: "SALES", salesId: id("sales", row.source_sales_id), salesLineId: id("salesLine", row.source_sales_line_id), endpoint: row.endpoint as "SALES_WAREHOUSE" };
  } else if (row.source_transfer_line_id !== null) {
    integrity(row.source_import_batch_id === null && row.source_sales_id === null, "Native ledger source is not a closed transfer variant");
    source = { kind: "TRANSFER", transferId: id("transfer", row.source_transfer_id), transferLineId: id("transferLine", row.source_transfer_line_id), endpoint: row.endpoint as "FROM" | "TO" };
  } else {
    integrity(row.source_sales_id === null && row.source_transfer_id === null && row.source_import_batch_id === publishedBatchId, "Baseline source is not the published native cutoff");
    source = { kind: "CUTOFF_BASELINE", importBatchId: publishedBatchId, endpoint: row.endpoint as "IMPORT_BASELINE" };
  }
  // The application response checker independently validates exact enums, quantity, timestamp and closed-source invariants.
  return { id: id("ledger", row.id), operationId: id("operation", row.operation_id), eventKind: row.event_kind as InventoryLedgerEntry["eventKind"],
    quantityDelta: stringValue(row.quantity_delta), source, sourceDocumentVersion: row.source_document_version as number | null,
    reversesEntryId: row.reverses_entry_id === null ? null : id("ledger", row.reverses_entry_id), businessDate: row.business_date as InventoryLedgerEntry["businessDate"], postedAt: stringValue(row.posted_at) };
}
/** Inert injected driver seam. No pool construction, listener, migrations or database connection on construction. */
export class PostgresInventoryLedgerQueryReader implements TrustedInventoryLedgerSnapshotReader {
  private readonly pool: PgInventoryLedgerQueryPool;
  constructor(pool: PgInventoryLedgerQueryPool) {
    if (typeof pool?.connect !== "function") throw new TypeError("Inventory ledger reader requires an explicit PostgreSQL pool"); this.pool = pool;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query) => Promise<T>): Promise<T> {
    activeInventoryLedgerRead(signal); const client = await this.pool.connect(); let began = false; let committing = false; let committed = false; let discard: Error | undefined;
    const query: Query = async (sql, values = []) => { activeInventoryLedgerRead(signal); return client.query(sql, values); };
    try {
      activeInventoryLedgerRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query); activeInventoryLedgerRead(signal); committing = true; await query("COMMIT"); committed = true;
      // A late abort suppresses publication, but a confirmed completed read transaction needs no rollback/discard.
      activeInventoryLedgerRead(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : new Error("Inventory ledger snapshot failed");
      if (began && !committed) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("Inventory ledger rollback failed");
          throw new AggregateError([error, rollbackError], "Inventory ledger read and rollback failed; client discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readLedger(read: InventoryLedgerScopedRead): Promise<InventoryLedgerSnapshot> {
    checkedInventoryActor(read.actor); const parameters = parseInventoryLedgerQuery(read.parameters); const supplied = checkedInventoryScope(read.scope);
    const warehouse = supplied.warehouses.find(item => item.id === parameters.warehouseId);
    requireDomain(warehouse, "FORBIDDEN", "Requested warehouse is outside authorized inventory scope");
    const scope = checkedInventoryScope({ hallIds: [warehouse.hallId], warehouses: [warehouse] });
    return this.snapshot(read.signal, async query => {
      const warehouses = await query(`/* inventory-ledger:warehouse */ SELECT w.id, w.hall_id, w.name FROM naijue_erp.warehouse w
        JOIN naijue_erp.hall h ON h.id = w.hall_id WHERE w.id = $1::uuid AND w.hall_id = $2::uuid LIMIT 2`, [parameters.warehouseId, warehouse.hallId]);
      requireDomain(warehouses.rows.length > 0, "FORBIDDEN", "Authorized inventory warehouse is unavailable");
      const w = one(warehouses); integrity(w.id === warehouse.id && w.hall_id === warehouse.hallId && w.name === warehouse.label, "Trusted warehouse/hall facts are stale");
      const skus = await query(`/* inventory-ledger:sku */ SELECT s.id, s.sku_code, p.id AS product_id, p.product_code, p.name AS product_name,
        s.color_id, c.name AS color_name, s.fit_id, f.code AS fit_code, f.name AS fit_name,
        p.size_group_id, g.name AS size_group_name, s.size_id, z.code AS size_code, z.name AS size_name,
        EXISTS (SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id) AS size_member
        FROM naijue_erp.sku s LEFT JOIN naijue_erp.product p ON p.id = s.product_id
        LEFT JOIN naijue_erp.color c ON c.id = s.color_id LEFT JOIN naijue_erp.fit f ON f.id = s.fit_id
        LEFT JOIN naijue_erp.size_group g ON g.id = p.size_group_id LEFT JOIN naijue_erp.size z ON z.id = s.size_id
        WHERE s.id = $1::uuid LIMIT 2`, [parameters.skuId]);
      requireDomain(skus.rows.length > 0, "SKU_NOT_FOUND", "Exact inventory SKU is unavailable");
      const s = one(skus); integrity(s.id === parameters.skuId && booleanValue(s.size_member), "Invalid canonical SKU/size-group identity");
      const batchId = await publishedKey(query, parameters.warehouseId, parameters.skuId);
      const rows = (await query(`/* inventory-ledger:entries */ SELECT l.id, l.operation_id, l.event_kind, l.warehouse_id, l.sku_id,
        l.quantity_delta::text AS quantity_delta, l.source_sales_line_id, sl.sales_id AS source_sales_id,
        l.source_transfer_line_id, tl.transfer_id AS source_transfer_id, l.source_import_batch_id, l.endpoint,
        l.source_document_version, l.reverses_entry_id, to_char(l.business_date, 'YYYY-MM-DD') AS business_date, ${stamp("l.posted_at")} AS posted_at
        FROM naijue_erp.inventory_ledger l JOIN naijue_erp.warehouse w ON w.id = l.warehouse_id
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.warehouse_id = $1::uuid AND w.hall_id = $2::uuid AND l.sku_id = $3::uuid
          AND ($4::timestamptz IS NULL OR (l.posted_at, l.id) < ($4::timestamptz, $5::uuid))
        ORDER BY l.posted_at DESC, l.id DESC LIMIT $6`, [parameters.warehouseId, warehouse.hallId, parameters.skuId,
        parameters.after?.postedAt ?? null, parameters.after?.entryId ?? null, parameters.pageSize + 1])).rows;
      integrity(rows.length <= parameters.pageSize + 1, "Inventory ledger driver exceeded bounded page");
      // Validate the look-ahead row too: malformed/unpublished facts cannot become a mere hasMore hint.
      integrity(rows.every(row => row.warehouse_id === parameters.warehouseId && row.sku_id === parameters.skuId), "Ledger facts escaped their exact key");
      const entries = rows.map(row => decodeEntry(row, batchId));
      const all = checkedInventoryLedgerSnapshot({ readReference: randomUUID(), readiness: "ready", data: {
        pageSize: parameters.pageSize + 1, labelBasis: "CURRENT_REFERENCE", warehouse: { id: w.id, hallId: w.hall_id, label: w.name },
        sku: { id: s.id, code: s.sku_code, product: { id: s.product_id, code: s.product_code, name: s.product_name }, color: { id: s.color_id, label: s.color_name },
          fit: { id: s.fit_id, code: s.fit_code, label: s.fit_name }, sizeGroup: { id: s.size_group_id, label: s.size_group_name }, size: { id: s.size_id, code: s.size_code, label: s.size_name } },
        entries, nextCursor: null
      } }, { ...parameters, pageSize: parameters.pageSize + 1 }, scope);
      const visible = all.data.entries.slice(0, parameters.pageSize); const last = visible.at(-1);
      return checkedInventoryLedgerSnapshot({ ...all, data: { ...all.data, pageSize: parameters.pageSize, entries: visible,
        nextCursor: entries.length > parameters.pageSize && last ? { postedAt: last.postedAt, entryId: last.id } : null } }, parameters, scope);
    });
  }
}
