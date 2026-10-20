import type { Pool } from "pg";
import type { TransferLineRow } from "../../../packages/domain/src/documents.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { businessDate, entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { RuntimeTransferHeader } from "../../../packages/application/src/transfer-ports.ts";
import type { TransferDetail, TransferDetailQuery, TransferListPage, TransferListQuery, TransferReadScope, TransferReferenceNames, TransferScopedRead, TransferSummary, TrustedTransferSnapshotReader } from "../../../packages/application/src/transfer-query-ports.ts";
import { activeTransferRead, checkedTransferReadScope, parseTransferDetailQuery, parseTransferListQuery } from "../../../packages/application/src/transfer-query-validation.ts";
import { booleanValue, integerValue, nullableString, quantityFromSql, stringValue, versionFromSql } from "./codec.ts";

export interface PgTransferQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgTransferQueryClient { query(text: string, values?: unknown[]): Promise<PgTransferQueryResult>; release(error?: Error | boolean): void }
export interface PgTransferQueryPool { connect(): Promise<PgTransferQueryClient> }
type PgPoolCompatibility = Pool extends PgTransferQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true; void pgPoolCompatibility;
/** Technical response bound only. Overflow is rejected, never returned as a truncated document. */
export const TRANSFER_DETAIL_MAX_CURRENT_LINES = 2000;
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted transfer enum"); return value as T;
}
function count(value: unknown): bigint {
  requireDomain(typeof value === "string" && /^(0|[1-9]\d*)$/.test(value), "INVALID_DATABASE_VALUE", "An exact nonnegative SQL count is required"); return BigInt(value);
}
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const SUMMARY_COLUMNS = `h.id, h.number, to_char(h.business_date, 'YYYY-MM-DD') AS business_date,
  h.from_warehouse_id, h.to_warehouse_id, h.status, h.version, h.created_by_account_id, ${stamp("h.created_at")} AS created_at`;
const HEADER_COLUMNS = `${SUMMARY_COLUMNS}, h.note, h.created_hall_id, h.created_role, ${stamp("h.updated_at")} AS updated_at,
  h.approved_by_account_id, ${stamp("h.approved_at")} AS approved_at, h.stock_basis`;
const REFERENCES = `fw.name AS from_warehouse_name, tw.name AS to_warehouse_name, fh.name AS from_hall_name, th.name AS to_hall_name,
  creator.name AS created_by_name, approver.name AS approved_by_name`;
/** Count and page use the SAME native relation joins; a missing reference is not a fabricated display label. */
const RELATIONS = `FROM naijue_erp.transfer_header h
  JOIN naijue_erp.warehouse fw ON fw.id = h.from_warehouse_id JOIN naijue_erp.warehouse tw ON tw.id = h.to_warehouse_id
  JOIN naijue_erp.hall fh ON fh.id = fw.hall_id JOIN naijue_erp.hall th ON th.id = tw.hall_id
  JOIN naijue_erp.user_account ca ON ca.id = h.created_by_account_id JOIN naijue_erp.staff creator ON creator.id = ca.staff_id
  LEFT JOIN naijue_erp.user_account aa ON aa.id = h.approved_by_account_id LEFT JOIN naijue_erp.staff approver ON approver.id = aa.staff_id`;
function decodeReferences(row: Record<string, unknown>): TransferReferenceNames {
  return { fromWarehouseName: stringValue(row.from_warehouse_name), toWarehouseName: stringValue(row.to_warehouse_name),
    fromHallName: stringValue(row.from_hall_name), toHallName: stringValue(row.to_hall_name), createdByName: stringValue(row.created_by_name), approvedByName: nullableString(row.approved_by_name) };
}
function decodeSummary(row: Record<string, unknown>): TransferSummary {
  return { id: id("transfer", row.id), number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)),
    fromWarehouseId: id("warehouse", row.from_warehouse_id), toWarehouseId: id("warehouse", row.to_warehouse_id),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version),
    createdByAccountId: id("account", row.created_by_account_id), createdAt: stringValue(row.created_at), ...decodeReferences(row) };
}
function decodeHeader(row: Record<string, unknown>): RuntimeTransferHeader {
  const fromWarehouseId = id("warehouse", row.from_warehouse_id); const toWarehouseId = id("warehouse", row.to_warehouse_id);
  requireDomain(fromWarehouseId !== toWarehouseId, "INVALID_DATABASE_VALUE", "Persisted transfer warehouses must differ");
  return { id: id("transfer", row.id), number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)), fromWarehouseId, toWarehouseId,
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version), note: nullableString(row.note),
    createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdRole: choice(row.created_role, ["ADMIN", "WAREHOUSE", "SALESPERSON"]), createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at),
    approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at) };
}
function decodeLine(row: Record<string, unknown>): TransferLineRow {
  const quantity = quantityFromSql(row.quantity); const lineNo = integerValue(row.line_no); const isCurrent = booleanValue(row.is_current);
  requireDomain(quantity > 0n && lineNo > 0 && isCurrent, "INVALID_DATABASE_VALUE", "Expected positive current actual transfer line");
  return { id: id("transferLine", row.id), transferId: id("transfer", row.transfer_id), lineNo, skuId: id("sku", row.sku_id), quantity, isCurrent,
    snapshot: { productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
/** Only internal static columns enter SQL. All policy/filter/target/pagination values are parameters. */
class Predicate {
  readonly values: unknown[] = []; readonly parts: string[] = [];
  parameter(value: unknown): string { this.values.push(value); return `$${this.values.length}`; }
  constructor(scope: TransferReadScope) {
    if (scope.kind === "all") this.parts.push("TRUE");
    else {
      const columns = { fromHallId: "fw.hall_id", toHallId: "tw.hall_id", fromWarehouseId: "h.from_warehouse_id", toWarehouseId: "h.to_warehouse_id",
        createdByAccountId: "h.created_by_account_id", createdHallId: "h.created_hall_id", createdRole: "h.created_role" } as const;
      this.parts.push(`(${scope.clauses.map(clause => `(${Object.entries(columns).flatMap(([key, column]) => {
        const value = clause[key as keyof typeof columns]; return value === undefined ? [] : [`${column} = ${this.parameter(value)}${key === "createdRole" ? "" : "::uuid"}`];
      }).join(" AND ")})`).join(" OR ")})`);
    }
  }
  filter(query: TransferListQuery): void {
    const f = query.filter;
    for (const [value, expression] of [[f.startDate, "h.business_date >="], [f.endDate, "h.business_date <="], [f.status, "h.status ="],
      [f.fromWarehouseId, "h.from_warehouse_id ="], [f.toWarehouseId, "h.to_warehouse_id ="]] as const) {
      if (value !== null) this.parts.push(`${expression} ${this.parameter(value)}`);
    }
    if (f.number !== null) this.parts.push(`strpos(h.number, ${this.parameter(f.number)}) > 0`);
  }
  target(transferId: string): void { this.parts.push(`h.id = ${this.parameter(transferId)}::uuid`); }
  where(): string { return this.parts.join(" AND "); }
  page(page: number, pageSize: number): string { return `LIMIT ${this.parameter(pageSize)} OFFSET ${this.parameter(String((page - 1) * pageSize))}::bigint`; }
}
type ReadQuery = (sql: string, values?: unknown[]) => Promise<PgTransferQueryResult>;
function one(result: PgTransferQueryResult): Record<string, unknown> {
  requireDomain(result.rows.length === 1, "INVALID_DATABASE_VALUE", "Expected exactly one SQL row"); return result.rows[0]!;
}
/** Injected protocol only. Construction does not create a Pool, connect, migrate, or listen.
 * Each invocation uses one acquired client and one read-only REPEATABLE READ snapshot. */
export class PostgresTransferQueryReader implements TrustedTransferSnapshotReader {
  private readonly pool: PgTransferQueryPool;
  constructor(pool: PgTransferQueryPool) {
    if (typeof pool?.connect !== "function") throw new TypeError("Transfer query reader requires an explicit PostgreSQL pool"); this.pool = pool;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: ReadQuery) => Promise<T>): Promise<T> {
    activeTransferRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let discard: Error | undefined;
    const query: ReadQuery = (sql, values = []) => { activeTransferRead(signal); return client.query(sql, values); };
    try {
      activeTransferRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query); activeTransferRead(signal); committing = true; await query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Transfer snapshot failed");
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("Transfer snapshot rollback failed");
          throw new AggregateError([error, rollbackError], "Transfer read and rollback failed; client discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readList(read: TransferScopedRead<TransferListQuery>): Promise<TransferListPage> {
    const parameters = parseTransferListQuery(read.parameters); const p = new Predicate(checkedTransferReadScope(read.scope)); p.filter(parameters);
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(one(await query(`SELECT COUNT(*)::text AS exact_total ${RELATIONS} WHERE ${p.where()}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT ${SUMMARY_COLUMNS}, ${REFERENCES} ${RELATIONS} WHERE ${p.where()}
        ORDER BY h.business_date DESC, h.id DESC ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotal, "INVALID_DATABASE_VALUE", "Transfer page exceeds exact scope");
      return { page: parameters.page, pageSize: parameters.pageSize, exactTotal, items: rows.map(decodeSummary) };
    });
  }
  async readDetail(read: TransferScopedRead<TransferDetailQuery>): Promise<TransferDetail> {
    const parameters = parseTransferDetailQuery(read.parameters); const p = new Predicate(checkedTransferReadScope(read.scope)); p.target(parameters.transferId);
    return this.snapshot(read.signal, async query => {
      const result = await query(`SELECT ${HEADER_COLUMNS}, ${REFERENCES} ${RELATIONS} WHERE ${p.where()}`, p.values);
      requireDomain(result.rows.length > 0, "DOCUMENT_NOT_FOUND", "Transfer document is unavailable");
      const row = one(result); const header = decodeHeader(row);
      requireDomain(header.id === parameters.transferId, "INVALID_DATABASE_VALUE", "Unexpected transfer target");
      const rows = (await query(`SELECT id, transfer_id, line_no, sku_id, quantity::text, product_code_snapshot, product_name_snapshot,
        color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current FROM naijue_erp.transfer_line
        WHERE transfer_id = $1 AND is_current ORDER BY line_no, id LIMIT $2`, [header.id, TRANSFER_DETAIL_MAX_CURRENT_LINES + 1])).rows;
      requireDomain(rows.length <= TRANSFER_DETAIL_MAX_CURRENT_LINES, "TRANSFER_READ_TOO_LARGE", "Transfer detail exceeds bounded response limit");
      const lines = rows.map(decodeLine); const ids = new Set<string>(); const positions = new Set<number>();
      requireDomain(lines.every(line => { const valid = line.transferId === header.id && !ids.has(line.id) && !positions.has(line.lineNo);
        ids.add(line.id); positions.add(line.lineNo); return valid; }), "INVALID_DATABASE_VALUE", "Invalid transfer line ownership or identity");
      return { document: { header, lines }, stockBasis: choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]), references: decodeReferences(row) };
    });
  }
}
