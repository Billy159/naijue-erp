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
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { readInventoryKeyAdmissions } from "./inventory-key-admission-reader.ts";

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
async function publishedKey(query: Query, warehouseId: string, skuId: string, runtime26: NativeRuntime26Capability | undefined): Promise<string> {
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
  if (!runtime26) requireDomain(booleanValue(row.warehouse_published) && booleanValue(row.sku_published), "INVENTORY_NOT_READY", "Exact inventory key publication is unavailable");
  integrity(booleanValue(one(await query(GUARD_CAPABILITY)).integrity_guards_present), "Native inventory publication guards are unavailable");
  const batchId = id("operation", row.id);
  if (runtime26) {
    const [admission] = await readInventoryKeyAdmissions({ query }, [{ warehouseId, skuId }]);
    requireDomain(admission!.admitted, "INVENTORY_NOT_READY", "Exact inventory key is outside the approved creation/cutoff scope");
    integrity(admission!.publishedBatchId === batchId, "Inventory key admission differs from the published cutoff");
  }
  return batchId;
}
function decodeEntry(row: Row, publishedBatchId: string): InventoryLedgerEntry {
  let source: InventoryLedgerSource;
  if (row.event_kind === "HISTORY_REVISION") {
    integrity(row.source_sales_line_id === null && row.source_transfer_line_id === null && row.source_import_batch_id === null && row.source_sales_id === null && row.source_transfer_id === null,
      "Historical revision cannot use live or baseline provenance");
    integrity(row.source_history_revision_id !== null && row.history_revision_id === row.source_history_revision_id && row.history_revision_operation_id === row.operation_id
      && row.history_revision_version === row.source_document_version && Number.isInteger(row.history_revision_version) && Number(row.history_revision_version) > 1,
      "Exact historical revision operation/version is unavailable");
    const revisionId = id("operation", row.source_history_revision_id);
    if (row.history_document_kind === "SALES") {
      integrity(row.source_history_sales_line_id !== null && row.source_history_transfer_line_id === null && row.history_transfer_id === null && row.history_revision_transfer_id === null
        && row.history_sales_id === row.history_revision_sales_id && row.history_sales_batch_id === publishedBatchId, "Exact historical sales line/revision/batch is unavailable");
      source = { kind: "HISTORY_REVISION", documentKind: "SALES", revisionId, salesId: id("sales", row.history_sales_id), salesLineId: id("salesLine", row.source_history_sales_line_id), endpoint: row.endpoint as "SALES_WAREHOUSE" };
    } else {
      integrity(row.history_document_kind === "TRANSFER" && row.source_history_sales_line_id === null && row.source_history_transfer_line_id !== null && row.history_sales_id === null && row.history_revision_sales_id === null
        && row.history_transfer_id === row.history_revision_transfer_id && row.history_transfer_batch_id === publishedBatchId, "Exact historical transfer line/revision/batch is unavailable");
      source = { kind: "HISTORY_REVISION", documentKind: "TRANSFER", revisionId, transferId: id("transfer", row.history_transfer_id), transferLineId: id("transferLine", row.source_history_transfer_line_id), endpoint: row.endpoint as "FROM" | "TO" };
    }
  } else if (row.source_sales_line_id !== null) {
    integrity(row.source_transfer_line_id === null && row.source_import_batch_id === null && row.source_transfer_id === null, "Native ledger source is not a closed sales variant");
    source = { kind: "SALES", salesId: id("sales", row.source_sales_id), salesLineId: id("salesLine", row.source_sales_line_id), endpoint: row.endpoint as "SALES_WAREHOUSE" };
  } else if (row.source_transfer_line_id !== null) {
    integrity(row.source_import_batch_id === null && row.source_sales_id === null, "Native ledger source is not a closed transfer variant");
    source = { kind: "TRANSFER", transferId: id("transfer", row.source_transfer_id), transferLineId: id("transferLine", row.source_transfer_line_id), endpoint: row.endpoint as "FROM" | "TO" };
  } else {
    integrity(row.source_sales_id === null && row.source_transfer_id === null && row.source_import_batch_id === publishedBatchId, "Baseline source is not the published native cutoff");
    source = { kind: "CUTOFF_BASELINE", importBatchId: publishedBatchId, endpoint: row.endpoint as "IMPORT_BASELINE" };
  }
  if (row.event_kind !== "HISTORY_REVISION") integrity(row.source_history_revision_id === null && row.source_history_sales_line_id === null && row.source_history_transfer_line_id === null, "Nonrevision ledger has historical provenance");
  // The application response checker independently validates exact enums, quantity, timestamp and closed-source invariants.
  return { id: id("ledger", row.id), operationId: id("operation", row.operation_id), eventKind: row.event_kind as InventoryLedgerEntry["eventKind"],
    quantityDelta: stringValue(row.quantity_delta), source, sourceDocumentVersion: row.source_document_version as number | null,
    reversesEntryId: row.reverses_entry_id === null ? null : id("ledger", row.reverses_entry_id), businessDate: row.business_date as InventoryLedgerEntry["businessDate"], postedAt: stringValue(row.posted_at) };
}
/** Inert injected driver seam. No pool construction, listener, migrations or database connection on construction. */
function displayEntry(row: Row): NonNullable<InventoryLedgerEntry["display"]> {
  return {
    date: stringValue(row.display_date), businessType: stringValue(row.display_business_type) as NonNullable<InventoryLedgerEntry["display"]>["businessType"],
    sourceNumber: row.display_source_number === null ? null : stringValue(row.display_source_number),
    operator: { accountId: row.display_operator_account_id === null ? null : id("account", row.display_operator_account_id),
      name: row.display_operator_name === null ? null : stringValue(row.display_operator_name), labelBasis: "CURRENT_REFERENCE" },
    balanceTransition: { state: "UNKNOWN", before: null, after: null, reason: "NO_RECORDED_BALANCE_TRANSITION" }, navigation: "NOT_CHECKED"
  };
}

export class PostgresInventoryLedgerQueryReader implements TrustedInventoryLedgerSnapshotReader {
  private readonly pool: PgInventoryLedgerQueryPool;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgInventoryLedgerQueryPool, runtime26?: NativeRuntime26Capability) {
    if (typeof pool?.connect !== "function") throw new TypeError("Inventory ledger reader requires an explicit PostgreSQL pool"); this.pool = pool; this.runtime26 = checkedNativeRuntime26Capability(runtime26);
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: Query, client: PgInventoryLedgerQueryClient) => Promise<T>): Promise<T> {
    activeInventoryLedgerRead(signal); const client = await this.pool.connect(); let began = false; let committing = false; let committed = false; let discard: Error | undefined;
    const query: Query = async (sql, values = []) => { activeInventoryLedgerRead(signal); return client.query(sql, values); };
    try {
      activeInventoryLedgerRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query, client); activeInventoryLedgerRead(signal); committing = true; await query("COMMIT"); committed = true;
      // A late abort suppresses publication, but a confirmed completed read transaction needs no rollback/discard.
      activeInventoryLedgerRead(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : new Error("Inventory ledger snapshot failed");
      if (began && !committing) {
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
    return this.snapshot(read.signal, async (query, client) => {
      if (this.runtime26) { await this.runtime26.assertReady(client, "INVENTORY_ADMISSION"); activeInventoryLedgerRead(read.signal); }
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
      const batchId = await publishedKey(query, parameters.warehouseId, parameters.skuId, this.runtime26);
      const columns = `l.id, l.operation_id, l.event_kind, l.warehouse_id, l.sku_id,
        l.quantity_delta::text AS quantity_delta, l.source_sales_line_id, sl.sales_id AS source_sales_id,
        l.source_transfer_line_id, tl.transfer_id AS source_transfer_id, l.source_import_batch_id, l.endpoint,
        l.source_history_revision_id, l.source_history_sales_line_id, l.source_history_transfer_line_id,
        hr.id AS history_revision_id, hr.document_kind AS history_document_kind, hr.operation_id AS history_revision_operation_id,
        hr.to_version AS history_revision_version, hr.sales_id AS history_revision_sales_id, hr.transfer_id AS history_revision_transfer_id,
        hsl.header_id AS history_sales_id, hsh.batch_id AS history_sales_batch_id,
        htl.header_id AS history_transfer_id, hth.batch_id AS history_transfer_batch_id,
        l.source_document_version, l.reverses_entry_id, to_char(l.business_date, 'YYYY-MM-DD') AS business_date, ${stamp("l.posted_at")} AS posted_at`;
      const source = `FROM naijue_erp.inventory_ledger l JOIN naijue_erp.warehouse w ON w.id = l.warehouse_id
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        LEFT JOIN naijue_erp.history_revision hr ON hr.id = l.source_history_revision_id
        LEFT JOIN naijue_erp.history_sales_line hsl ON hsl.id = l.source_history_sales_line_id
        LEFT JOIN naijue_erp.history_sales_header hsh ON hsh.id = hsl.header_id
        LEFT JOIN naijue_erp.history_transfer_line htl ON htl.id = l.source_history_transfer_line_id
        LEFT JOIN naijue_erp.history_transfer_header hth ON hth.id = htl.header_id`;
      const exactKey = "l.warehouse_id = $1::uuid AND w.hall_id = $2::uuid AND l.sku_id = $3::uuid";
      let rows: Row[], filteredTotal: string | undefined;
      if (parameters.page !== undefined) {
        const f = parameters.filter!;
        // Each projection uses the real source relation, never the delta sign.
        // This CTE is shared verbatim by count/page within the same RR snapshot.
        const scoped = `WITH ledger_display AS (SELECT ${columns},
          CASE WHEN l.event_kind='CUTOFF_BASELINE' THEN to_char(l.business_date,'YYYY-MM-DD')
            ELSE to_char(l.posted_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') END AS display_date,
          CASE WHEN l.event_kind='CUTOFF_BASELINE' THEN 'BASELINE'
            WHEN (tl.id IS NOT NULL OR htl.id IS NOT NULL) AND l.endpoint='TO' THEN 'TRANSFER_IN'
            WHEN (tl.id IS NOT NULL OR htl.id IS NOT NULL) AND l.endpoint='FROM' THEN 'TRANSFER_OUT'
            WHEN coalesce(sh.business_type,hsh.business_type) IN ('SALE','RETURN','EXCHANGE') THEN coalesce(sh.business_type,hsh.business_type)
            ELSE 'UNKNOWN' END AS display_business_type,
          CASE WHEN l.event_kind='HISTORY_REVISION' THEN coalesce(hsh.number,hth.number)
            ELSE coalesce(sh.number,th.number) END AS display_source_number,
          receipt.actor_account_id AS display_operator_account_id, operator_staff.name AS display_operator_name
          ${source}
          LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
          LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
          LEFT JOIN naijue_erp.operation_receipt receipt ON receipt.id=l.operation_id AND receipt.status='COMMITTED'
          LEFT JOIN naijue_erp.user_account operator_account ON operator_account.id=receipt.actor_account_id
          LEFT JOIN naijue_erp.staff operator_staff ON operator_staff.id=operator_account.staff_id
          WHERE ${exactKey})`;
        const predicate = `($4::date IS NULL OR display_date >= to_char($4::date,'YYYY-MM-DD'))
          AND ($5::date IS NULL OR display_date <= to_char($5::date,'YYYY-MM-DD'))
          AND ($6::text IS NULL OR display_business_type=$6::text)
          AND ($7::text='' OR strpos(lower(coalesce(display_source_number,'')),lower($7::text))>0)`;
        const values = [parameters.warehouseId, warehouse.hallId, parameters.skuId, f.dateFrom, f.dateTo, f.businessType, f.source];
        const total = one(await query(`/* inventory-ledger:filtered-count */ ${scoped} SELECT count(*)::text AS total FROM ledger_display WHERE ${predicate}`, values)).total;
        integrity(typeof total === "string" && /^(0|[1-9]\d{0,127})$/.test(total), "Exact filtered inventory ledger total is unavailable"); filteredTotal = total;
        rows = (await query(`/* inventory-ledger:numbered-entries */ ${scoped} SELECT * FROM ledger_display WHERE ${predicate}
          ORDER BY posted_at DESC, id DESC LIMIT $8 OFFSET $9::bigint`, [...values, parameters.pageSize, ((BigInt(parameters.page)-1n)*20n).toString()])).rows;
      } else {
        rows = (await query(`/* inventory-ledger:entries */ SELECT ${columns} ${source}
        WHERE ${exactKey}
          AND ($4::timestamptz IS NULL OR (l.posted_at, l.id) < ($4::timestamptz, $5::uuid))
        ORDER BY l.posted_at DESC, l.id DESC LIMIT $6`, [parameters.warehouseId, warehouse.hallId, parameters.skuId,
        parameters.after?.postedAt ?? null, parameters.after?.entryId ?? null, parameters.pageSize + 1])).rows;
      }
      integrity(rows.length <= parameters.pageSize + 1, "Inventory ledger driver exceeded bounded page");
      // Validate the look-ahead row too: malformed/unpublished facts cannot become a mere hasMore hint.
      integrity(rows.every(row => row.warehouse_id === parameters.warehouseId && row.sku_id === parameters.skuId), "Ledger facts escaped their exact key");
      const entries = rows.map(row => ({ ...decodeEntry(row, batchId), ...(parameters.page !== undefined ? { display: displayEntry(row) } : {}) }));
      const all = checkedInventoryLedgerSnapshot({ readReference: randomUUID(), readiness: "ready", data: {
        pageSize: parameters.page !== undefined ? parameters.pageSize : parameters.pageSize + 1, labelBasis: "CURRENT_REFERENCE", warehouse: { id: w.id, hallId: w.hall_id, label: w.name },
        sku: { id: s.id, code: s.sku_code, product: { id: s.product_id, code: s.product_code, name: s.product_name }, color: { id: s.color_id, label: s.color_name },
          fit: { id: s.fit_id, code: s.fit_code, label: s.fit_name }, sizeGroup: { id: s.size_group_id, label: s.size_group_name }, size: { id: s.size_id, code: s.size_code, label: s.size_name } },
        entries, nextCursor: null, ...(parameters.page !== undefined ? { page: parameters.page, filteredTotal: filteredTotal! } : {})
      } }, parameters.page !== undefined ? parameters : { ...parameters, pageSize: parameters.pageSize + 1 }, scope);
      if (parameters.page !== undefined) return all;
      const visible = all.data.entries.slice(0, parameters.pageSize); const last = visible.at(-1);
      return checkedInventoryLedgerSnapshot({ ...all, data: { ...all.data, pageSize: parameters.pageSize, entries: visible,
        nextCursor: entries.length > parameters.pageSize && last ? { postedAt: last.postedAt, entryId: last.id } : null } }, parameters, scope);
    });
  }
}
