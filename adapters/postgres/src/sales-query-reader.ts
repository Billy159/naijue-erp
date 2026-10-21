import type { Pool } from "pg";
import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from "../../../packages/domain/src/documents.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { businessDate, decimalToMinor, entityId } from "../../../packages/domain/src/values.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import type { SalesDetail, SalesDetailQuery, SalesFilterReferencePage, SalesFilterReferenceQuery, SalesHistoryPage, SalesHistoryQuery, SalesListPage, SalesListQuery, SalesReadScope, SalesScopedRead, SalesSettlementStatistics, SalesSummary, SalesSummaryQuantities, TrustedSalesSnapshotReader } from "../../../packages/application/src/sales-query-ports.ts";
import { activeSalesRead, checkedSalesReadScope, parseSalesDetailQuery, parseSalesHistoryQuery, parseSalesListQuery } from "../../../packages/application/src/sales-query-validation.ts";
import { parseSalesFilterReferenceQuery } from "../../../packages/application/src/sales-reference-query-validation.ts";
import { booleanValue, integerValue, moneyFromSql, nullableString, quantityFromSql, stringValue, versionFromSql } from "./codec.ts";

export interface PgSalesQueryResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgSalesQueryClient {
  query(text: string, values?: unknown[]): Promise<PgSalesQueryResult>;
  release(error?: Error | boolean): void;
}
export interface PgSalesQueryPool { connect(): Promise<PgSalesQueryClient> }
type PgPoolCompatibility = Pool extends PgSalesQueryPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true;
void pgPoolCompatibility;
/** Technical response bound, not a business maximum; oversized native detail fails, never truncates. */
export const SALES_DETAIL_MAX_CURRENT_LINES = 2000;
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted sales enum"); return value as T;
}
function count(value: unknown): bigint {
  requireDomain(typeof value === "string" && /^(0|[1-9]\d*)$/.test(value), "INVALID_DATABASE_VALUE", "An exact nonnegative SQL count is required"); return BigInt(value);
}
function summaryQuantities(row: Record<string, unknown>): SalesSummaryQuantities {
  requireDomain(typeof row.quantity === "string" && /^(0|[1-9]\d*|-[1-9]\d*)$/.test(row.quantity), "INVALID_DATABASE_VALUE", "An exact signed SQL quantity sum is required");
  const quantity = BigInt(row.quantity); const incomingQuantity = count(row.incoming_quantity); const outgoingQuantity = count(row.outgoing_quantity);
  requireDomain(quantity === outgoingQuantity - incomingQuantity, "INVALID_DATABASE_VALUE", "Sales quantity totals disagree");
  return { quantity, incomingQuantity, outgoingQuantity };
}
/** Aggregates may exceed one decimal(18,2) row. Preserve arbitrary-precision numeric sums, without row caps. */
function aggregateMoney(value: unknown) { return decimalToMinor(stringValue(value), { scale: 2 }); }
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const SUMMARY_COLUMNS = `h.id, h.number, h.business_type, to_char(h.business_date, 'YYYY-MM-DD') AS business_date,
  h.hall_id, h.customer_id, h.salesperson_id, h.warehouse_id, h.status, h.version,
  h.gross_amount::text, h.order_discount::text, h.net_due::text, ${stamp("h.updated_at")} AS updated_at`;
const HEADER_COLUMNS = `${SUMMARY_COLUMNS}, h.note, h.created_by_account_id, h.created_hall_id,
  ${stamp("h.created_at")} AS created_at,
  h.approved_by_account_id, ${stamp("h.approved_at")} AS approved_at, h.stock_basis`;
function decodeSummary(row: Record<string, unknown>, quantities: SalesSummaryQuantities): SalesSummary {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: id("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version),
    grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due), updatedAt: stringValue(row.updated_at), ...quantities,
    hallName: stringValue(row.hall_name), warehouseName: stringValue(row.warehouse_name), customerName: stringValue(row.customer_name), salespersonName: nullableString(row.salesperson_name) };
}
function decodeHeader(row: Record<string, unknown>): SalesHeaderRow {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: id("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id), status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]),
    version: versionFromSql(row.version), grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due),
    note: nullableString(row.note), createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at), approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at) };
}
function decodeLine(row: Record<string, unknown>): SalesLineRow {
  return { id: id("salesLine", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), skuId: id("sku", row.sku_id),
    quantity: quantityFromSql(row.quantity), referencePrice: row.reference_price === null ? null : moneyFromSql(row.reference_price), dealPrice: moneyFromSql(row.deal_price),
    pricingRule: row.pricing_rule === null ? null : choice(row.pricing_rule, ["UNIT_PRICE", "DISCOUNT"] as const), discountTenths: row.discount_tenths === null ? null : integerValue(row.discount_tenths),
    zeroConfirmed: row.zero_confirmed === null ? null : booleanValue(row.zero_confirmed), lineAmount: moneyFromSql(row.line_amount),
    allocatedDiscount: moneyFromSql(row.allocated_discount), isGift: booleanValue(row.is_gift), isCurrent: booleanValue(row.is_current),
    snapshot: { productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
function decodeSettlement(row: Record<string, unknown>): SalesSettlementRow {
  return { id: id("settlement", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), paymentAccountId: id("paymentAccount", row.payment_account_id), paymentMethodId: nullableId("paymentMethod", row.payment_method_id_snapshot),
    direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: moneyFromSql(row.amount) };
}
/** Only internal static column names enter SQL; every scope/filter value is a driver parameter. */
class Predicate {
  readonly values: unknown[] = [];
  readonly parts: string[] = [];
  parameter(value: unknown): string { this.values.push(value); return `$${this.values.length}`; }
  constructor(scope: SalesReadScope) {
    if (scope.kind === "all") this.parts.push("TRUE");
    else {
      const columns = { hallId: "hall_id", warehouseId: "warehouse_id", salespersonId: "salesperson_id", createdByAccountId: "created_by_account_id", createdHallId: "created_hall_id" } as const;
      this.parts.push(`(${scope.clauses.map(clause => `(${Object.entries(columns).flatMap(([key, column]) => {
        const value = clause[key as keyof typeof columns]; return value === undefined ? [] : [`h.${column} = ${this.parameter(value)}::uuid`];
      }).join(" AND ")})`).join(" OR ")})`);
    }
  }
  filter(query: SalesListQuery): void {
    const f = query.filter;
    for (const [value, expression] of [[f.startDate, "h.business_date >="], [f.endDate, "h.business_date <="]] as const) {
      if (value !== null) this.parts.push(`${expression} ${this.parameter(value)}`);
    }
    // 0001_runtime_sales.sql stores enums as text CHECKs and reference IDs as
    // uuid. One array parameter per dimension keeps work bounded, not N queries.
    for (const [values, column, type] of [[f.statuses, "status", "text"], [f.businessTypes, "business_type", "text"],
      [f.hallIds, "hall_id", "uuid"], [f.salespersonIds, "salesperson_id", "uuid"], [f.customerIds, "customer_id", "uuid"], [f.warehouseIds, "warehouse_id", "uuid"]] as const) {
      if (values.length) this.parts.push(`h.${column} = ANY(${this.parameter(values)}::${type}[])`);
    }
    // Case-insensitive literal inclusion, not LIKE: %, _ and backslashes remain
    // ordinary characters. PostgreSQL lower follows its database locale, not a
    // promise of exact Unicode equivalence to browser toLocaleLowerCase.
    if (f.number !== null) this.parts.push(`strpos(lower(h.number), lower(${this.parameter(f.number)})) > 0`);
  }
  target(salesId: string): void { this.parts.push(`h.id = ${this.parameter(salesId)}::uuid`); }
  where(): string { return this.parts.join(" AND "); }
  page(page: number, pageSize: number): string { return `LIMIT ${this.parameter(pageSize)} OFFSET ${this.parameter(String((page - 1) * pageSize))}::bigint`; }
}
type ReadQuery = (sql: string, values?: unknown[]) => Promise<PgSalesQueryResult>;
function rowOf(result: PgSalesQueryResult): Record<string, unknown> {
  requireDomain(result.rows.length === 1, "INVALID_DATABASE_VALUE", "Expected one SQL aggregate row"); return result.rows[0]!;
}
/** Injected pg protocol reader. It constructs no Pool, starts no listener and never runs a migration.
 * Each public invocation gets one read-only REPEATABLE READ client/snapshot, with fixed query counts.
 * The constructor does not connect. Scripted protocol tests do not prove PostgreSQL SQL execution. */
export class PostgresSalesQueryReader implements TrustedSalesSnapshotReader {
  private readonly pool: PgSalesQueryPool;
  constructor(pool: PgSalesQueryPool) {
    if (typeof pool?.connect !== "function") throw new TypeError("Sales query reader requires an explicit PostgreSQL pool");
    this.pool = pool;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: ReadQuery) => Promise<T>): Promise<T> {
    activeSalesRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let discard: Error | undefined;
    const query: ReadQuery = (sql, values = []) => { activeSalesRead(signal); return client.query(sql, values); };
    try {
      activeSalesRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query); activeSalesRead(signal);
      committing = true; await query("COMMIT"); return result;
    } catch (error) {
      if (!began || committing) discard = error instanceof Error ? error : new Error("Sales snapshot failed");
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("Sales snapshot rollback failed");
          throw new AggregateError([error, rollbackError], "Sales read and rollback failed; client discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
  async readReferences(read: SalesScopedRead<SalesFilterReferenceQuery>): Promise<SalesFilterReferencePage> {
    const parameters = parseSalesFilterReferenceQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope));
    // Closed internal table/column map. EXISTS yields one row per native master PK, irrespective of
    // document count, and retains old disabled references without exposing unused catalog records.
    const references = { hall: ["hall", "hall_id", "hall"], salesperson: ["staff", "salesperson_id", "staff"],
      customer: ["customer", "customer_id", "customer"], warehouse: ["warehouse", "warehouse_id", "warehouse"] } as const;
    const [table, column, kind] = references[parameters.kind];
    const authorized = `EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE ${p.where()} AND h.${column} = r.id)`;
    const search = p.parameter(parameters.search);
    const searched = parameters.kind === "customer" ? `(strpos(r.name, ${search}) > 0 OR strpos(r.code, ${search}) > 0)` : `strpos(r.name, ${search}) > 0`;
    const source = `FROM naijue_erp.${table} r WHERE ${authorized} AND ${searched}`;
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(rowOf(await query(`SELECT COUNT(*)::text AS exact_total ${source}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT r.id, r.name AS label ${source} ORDER BY r.name COLLATE "C", r.id ${paging}`, p.values)).rows;
      const remaining = exactTotal - BigInt(parameters.page - 1) * BigInt(parameters.pageSize);
      const expected = remaining < 0n ? 0n : remaining < BigInt(parameters.pageSize) ? remaining : BigInt(parameters.pageSize);
      requireDomain(BigInt(rows.length) === expected, "INVALID_DATABASE_VALUE", "Sales reference page does not match exact scope");
      const seen = new Set<string>();
      const items = rows.map(row => {
        const referenceId = id(kind, row.id); const label = stringValue(row.label);
        requireDomain(!seen.has(referenceId) && label.trim().length > 0, "INVALID_DATABASE_VALUE", "Invalid sales reference identity or label");
        seen.add(referenceId); return { id: referenceId, label };
      });
      return { page: parameters.page, exactTotal, items };
    });
  }
  async readList(read: SalesScopedRead<SalesListQuery>): Promise<SalesListPage> {
    const parameters = parseSalesListQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope)); p.filter(parameters);
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(rowOf(await query(`SELECT COUNT(*)::text AS exact_total FROM naijue_erp.sales_header h WHERE ${p.where()}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT ${SUMMARY_COLUMNS}, hall.name AS hall_name, wh.name AS warehouse_name, c.name AS customer_name, sp.name AS salesperson_name
        FROM naijue_erp.sales_header h JOIN naijue_erp.hall hall ON hall.id = h.hall_id
        JOIN naijue_erp.warehouse wh ON wh.id = h.warehouse_id JOIN naijue_erp.customer c ON c.id = h.customer_id
        LEFT JOIN naijue_erp.staff sp ON sp.id = h.salesperson_id WHERE ${p.where()}
        ORDER BY h.updated_at DESC, h.number COLLATE "C" ASC, h.id ASC ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotal, "INVALID_DATABASE_VALUE", "Sales page exceeds exact scope");
      // Only authorized, already-paged native IDs enter this one bounded batch.
      // LEFT JOIN returns an explicit zero aggregate for gift-only/empty documents;
      // missing or malformed aggregate rows fail closed, never become guessed zero.
      // Cast before negation so the minimum bigint quantity cannot overflow.
      const pageIds = rows.map(row => id("sales", row.id)); const pageIdSet = new Set(pageIds);
      requireDomain(pageIdSet.size === pageIds.length, "INVALID_DATABASE_VALUE", "Duplicate sales page identity");
      const aggregateRows = pageIds.length === 0 ? [] : (await query(`SELECT page.id AS sales_id,
        COALESCE(SUM(l.quantity::numeric), 0)::text AS quantity,
        COALESCE(SUM(CASE WHEN l.quantity < 0 THEN -(l.quantity::numeric) ELSE 0 END), 0)::text AS incoming_quantity,
        COALESCE(SUM(CASE WHEN l.quantity > 0 THEN l.quantity::numeric ELSE 0 END), 0)::text AS outgoing_quantity
        FROM unnest($1::uuid[]) AS page(id) LEFT JOIN naijue_erp.sales_line l
          ON l.sales_id = page.id AND l.is_current AND NOT l.is_gift GROUP BY page.id`, [pageIds])).rows;
      requireDomain(aggregateRows.length === pageIds.length, "INVALID_DATABASE_VALUE", "Sales quantity batch does not match page");
      const quantities = new Map<string, SalesSummaryQuantities>();
      for (const row of aggregateRows) {
        const salesId = id("sales", row.sales_id);
        requireDomain(pageIdSet.has(salesId) && !quantities.has(salesId), "INVALID_DATABASE_VALUE", "Sales quantity batch contains an unexpected identity");
        quantities.set(salesId, summaryQuantities(row));
      }
      return { ...parametersPage(parameters), exactTotal, items: rows.map((row, index) => decodeSummary(row, quantities.get(pageIds[index]!)!)) };
    });
  }
  async readDetail(read: SalesScopedRead<SalesDetailQuery>): Promise<SalesDetail> {
    const parameters = parseSalesDetailQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope)); p.target(parameters.salesId);
    return this.snapshot(read.signal, async query => {
      const rows = (await query(`SELECT ${HEADER_COLUMNS}, hall.name AS hall_name, wh.name AS warehouse_name, c.name AS customer_name, sp.name AS salesperson_name
        FROM naijue_erp.sales_header h JOIN naijue_erp.hall hall ON hall.id = h.hall_id
        JOIN naijue_erp.warehouse wh ON wh.id = h.warehouse_id JOIN naijue_erp.customer c ON c.id = h.customer_id
        LEFT JOIN naijue_erp.staff sp ON sp.id = h.salesperson_id WHERE ${p.where()}`, p.values)).rows;
      requireDomain(rows.length > 0, "DOCUMENT_NOT_FOUND", "Sales document is unavailable");
      const row = rowOf({ rows, rowCount: rows.length }); const header = decodeHeader(row);
      const lineRows = (await query(`SELECT id, sales_id, line_no, sku_id, quantity::text, reference_price::text, deal_price::text, line_amount::text,
        allocated_discount::text, is_gift, pricing_rule, discount_tenths, zero_confirmed, product_code_snapshot, product_name_snapshot,
        color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current FROM naijue_erp.sales_line
        WHERE sales_id = $1 AND is_current ORDER BY line_no, id LIMIT $2`, [header.id, SALES_DETAIL_MAX_CURRENT_LINES + 1])).rows;
      requireDomain(lineRows.length <= SALES_DETAIL_MAX_CURRENT_LINES, "SALES_READ_TOO_LARGE", "Sales detail exceeds the bounded response limit");
      const settlementRows = (await query(`SELECT s.id, s.sales_id, s.line_no, s.payment_account_id, s.payment_method_id_snapshot, s.direction, s.amount::text,
        s.account_name_snapshot, s.method_name_snapshot, pa.name AS current_account_name, pm.name AS current_method_name
        FROM naijue_erp.sales_settlement s JOIN naijue_erp.payment_account pa ON pa.id = s.payment_account_id
        JOIN naijue_erp.payment_method pm ON pm.id = pa.payment_method_id
        WHERE s.sales_id = $1 ORDER BY s.line_no, s.id LIMIT 4`, [header.id])).rows;
      requireDomain(settlementRows.length <= 3, "INVALID_DATABASE_VALUE", "Sales detail exceeds approved settlement count");
      const document: SalesDocument = { header, lines: lineRows.map(decodeLine), settlements: settlementRows.map(decodeSettlement) };
      return { document, stockBasis: choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]),
        referenceNames: { hallName: stringValue(row.hall_name), warehouseName: stringValue(row.warehouse_name),
          customerName: stringValue(row.customer_name), salespersonName: nullableString(row.salesperson_name) },
        settlementNames: settlementRows.map(settlement => ({ settlementId: id("settlement", settlement.id), paymentAccountId: id("paymentAccount", settlement.payment_account_id),
          accountNameSnapshot: stringValue(settlement.account_name_snapshot), methodNameSnapshot: stringValue(settlement.method_name_snapshot),
          currentAccountName: stringValue(settlement.current_account_name), currentMethodName: stringValue(settlement.current_method_name) })) };
    });
  }
  async readHistory(read: SalesScopedRead<SalesHistoryQuery>): Promise<SalesHistoryPage> {
    const parameters = parseSalesHistoryQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope)); p.target(parameters.salesId);
    return this.snapshot(read.signal, async query => {
      requireDomain((await query(`SELECT h.id FROM naijue_erp.sales_header h WHERE ${p.where()}`, [...p.values])).rows.length === 1, "DOCUMENT_NOT_FOUND", "Sales document is unavailable");
      const source = `FROM naijue_erp.audit_change a JOIN naijue_erp.sales_header h ON h.id = a.object_id WHERE a.object_type = 'SALES' AND ${p.where()}`;
      const exactTotal = count(rowOf(await query(`SELECT COUNT(*)::text AS exact_total ${source}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT a.id, a.operation_id, a.actor_account_id, a.action, ${stamp("a.occurred_at")} AS occurred_at,
        a.old_version, a.new_version ${source} ORDER BY a.occurred_at DESC, a.id DESC ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotal, "INVALID_DATABASE_VALUE", "Sales history exceeds exact scope");
      return { salesId: parameters.salesId, ...parametersPage(parameters), exactTotal, items: rows.map(row => ({ id: id("audit", row.id), operationId: id("operation", row.operation_id),
        actorAccountId: id("account", row.actor_account_id), action: choice(row.action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]),
        occurredAt: stringValue(row.occurred_at), oldVersion: row.old_version === null ? null : versionFromSql(row.old_version), newVersion: versionFromSql(row.new_version) })) };
    });
  }
  async readSettlementStatistics(read: SalesScopedRead<SalesListQuery>): Promise<SalesSettlementStatistics> {
    const parameters = parseSalesListQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope)); p.filter(parameters); p.parts.push("h.status = 'APPROVED'");
    const approved = `SELECT h.id FROM naijue_erp.sales_header h WHERE ${p.where()}`;
    return this.snapshot(read.signal, async query => {
      const row = rowOf(await query(`WITH authorized AS (${approved}), settlement AS (
        SELECT s.payment_account_id, s.direction, s.amount FROM naijue_erp.sales_settlement s JOIN authorized a ON a.id = s.sales_id)
        SELECT (SELECT COUNT(*)::text FROM authorized) AS exact_approved_documents, COUNT(DISTINCT payment_account_id)::text AS exact_total_accounts,
        COALESCE(SUM(CASE WHEN direction = 'RECEIVE' THEN amount ELSE 0 END), 0)::text AS received,
        COALESCE(SUM(CASE WHEN direction = 'REFUND' THEN amount ELSE 0 END), 0)::text AS refunded FROM settlement`, [...p.values]));
      const exactTotalAccounts = count(row.exact_total_accounts); const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT s.payment_account_id,
        COALESCE(SUM(CASE WHEN s.direction = 'RECEIVE' THEN s.amount ELSE 0 END), 0)::text AS received,
        COALESCE(SUM(CASE WHEN s.direction = 'REFUND' THEN s.amount ELSE 0 END), 0)::text AS refunded
        FROM naijue_erp.sales_settlement s JOIN naijue_erp.sales_header h ON h.id = s.sales_id WHERE ${p.where()}
        GROUP BY s.payment_account_id ORDER BY s.payment_account_id ${paging}`, p.values)).rows;
      requireDomain(rows.length <= parameters.pageSize && BigInt(rows.length) <= exactTotalAccounts, "INVALID_DATABASE_VALUE", "Settlement page exceeds exact scope");
      return { ...parametersPage(parameters), exactTotalAccounts, exactApprovedDocuments: count(row.exact_approved_documents), received: aggregateMoney(row.received), refunded: aggregateMoney(row.refunded),
        accounts: rows.map(account => ({ paymentAccountId: id("paymentAccount", account.payment_account_id), received: aggregateMoney(account.received), refunded: aggregateMoney(account.refunded) })) };
    });
  }
}
function parametersPage(parameters: { readonly page: number; readonly pageSize: SalesListQuery["pageSize"] }) { return { page: parameters.page, pageSize: parameters.pageSize }; }
