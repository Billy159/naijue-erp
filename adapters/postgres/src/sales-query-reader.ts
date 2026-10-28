import { importedHistoryReadSql } from "./imported-history-query-reader.ts";
import { sourceConfirmedReadIdentityOn } from "./source-confirmed-read-authorization.ts";
import { checkedNativeRuntime26Capability, type NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { DocumentProductSummary, DocumentHistoryCoverage, SalesUnifiedListPage, SalesUnifiedSummary } from "../../../packages/application/src/sales-query-ports.ts";
import type { TransferListQuery, TransferScopedRead } from "../../../packages/application/src/transfer-query-ports.ts";
import type { Pool } from "pg";
import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from "../../../packages/domain/src/documents.ts";
import type { EntityId, EntityKind } from "../../../packages/domain/src/values.ts";
import { businessDate, decimalToMinor, entityId } from "../../../packages/domain/src/values.ts";
import { DomainError, requireDomain } from "../../../packages/domain/src/errors.ts";
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
  h.responsible_staff_id, responsible.name AS responsible_name, creator.name AS created_by_name, h.gross_amount::text, h.order_discount::text, h.net_due::text, ${stamp("h.updated_at")} AS updated_at`;
const HEADER_COLUMNS = `${SUMMARY_COLUMNS}, h.note, h.created_by_account_id, h.created_hall_id,
  ${stamp("h.created_at")} AS created_at,
  h.approved_by_account_id, ${stamp("h.approved_at")} AS approved_at, h.stock_basis`;
function decodeSummary(row: Record<string, unknown>, quantities: SalesSummaryQuantities): SalesSummary {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: id("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version),
    grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due), updatedAt: stringValue(row.updated_at), ...quantities, responsibleStaffId: nullableId("staff", row.responsible_staff_id), responsibleName: nullableString(row.responsible_name), createdByName: stringValue(row.created_by_name),
    hallName: stringValue(row.hall_name), warehouseName: stringValue(row.warehouse_name), customerName: stringValue(row.customer_name), salespersonName: nullableString(row.salesperson_name) };
}
function decodeHeader(row: Record<string, unknown>): SalesHeaderRow {
  return { id: id("sales", row.id), number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]),
    businessDate: businessDate(stringValue(row.business_date)), hallId: id("hall", row.hall_id), customerId: id("customer", row.customer_id),
    salespersonId: nullableId("staff", row.salesperson_id), warehouseId: id("warehouse", row.warehouse_id), status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]),
    version: versionFromSql(row.version), grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due),
    note: nullableString(row.note), responsibleStaffId: nullableId("staff", row.responsible_staff_id), createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
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
  private readonly normalLists: NativeDocumentListOptions | undefined;
  constructor(pool: PgSalesQueryPool, normalLists?: NativeDocumentListOptions) {
    if (normalLists !== undefined) {
      const runtime26 = checkedNativeRuntime26Capability(normalLists.runtime26);
      if (normalLists.profile !== "source-confirmed-normal-document-lists-v1" || runtime26 === undefined) throw new TypeError("Explicit original runtime and normal-list historical policy required");
      this.normalLists = { profile: normalLists.profile, runtime26 };
    }
    if (typeof pool?.connect !== "function") throw new TypeError("Sales query reader requires an explicit PostgreSQL pool");
    this.pool = pool;
  }
  private async snapshot<T>(signal: AbortSignal, work: (query: ReadQuery, client: PgSalesQueryClient) => Promise<T>): Promise<T> {
    activeSalesRead(signal);
    const client = await this.pool.connect(); let began = false; let committing = false; let discard: Error | undefined;
    const query: ReadQuery = (sql, values = []) => { activeSalesRead(signal); return client.query(sql, values); };
    try {
      activeSalesRead(signal); await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); began = true;
      const result = await work(query, client); activeSalesRead(signal);
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
    return this.snapshot(read.signal, async (query,client) => {
      let candidates=authorized;
      if(this.normalLists!==undefined){
        const scoped=await normalDocumentReferenceScopeOn(client,this.normalLists,'sales',read,{scope:p.where(),values:p.values});
        await assertNormalReferenceHistoryOn(scoped);
        candidates=`r.id IN (SELECT h.${column} FROM naijue_erp.sales_header h WHERE ${scoped.liveScope}
          UNION SELECT h.${column} FROM ${scoped.history.headerFrom} WHERE ${scoped.history.publishedPredicate} AND (${scoped.historyScope}))`;
        p.values.splice(0,p.values.length,...scoped.values);
      }
      const source = `FROM naijue_erp.${table} r WHERE ${candidates} AND ${searched}`;
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
  async readList(read: SalesScopedRead<SalesListQuery>): Promise<SalesListPage | SalesUnifiedListPage> {
    const parameters = parseSalesListQuery(read.parameters); const p = new Predicate(checkedSalesReadScope(read.scope));
    if (this.normalLists !== undefined) return this.snapshot(read.signal, async (_query, client) => {
      const result = await normalDocumentListOn(client, this.normalLists!, "sales", { ...read, parameters }, {
        from: `naijue_erp.sales_header h JOIN naijue_erp.hall hall ON hall.id=h.hall_id JOIN naijue_erp.warehouse wh ON wh.id=h.warehouse_id
          JOIN naijue_erp.customer c ON c.id=h.customer_id LEFT JOIN naijue_erp.staff sp ON sp.id=h.salesperson_id
          LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id JOIN naijue_erp.user_account creator_account ON creator_account.id=h.created_by_account_id
          JOIN naijue_erp.staff creator ON creator.id=creator_account.staff_id`,
        columns: `${SUMMARY_COLUMNS},hall.name AS hall_name,wh.name AS warehouse_name,c.name AS customer_name,sp.name AS salesperson_name`, scope: p.where(), values: p.values });
      const items: SalesUnifiedSummary[] = result.rows.map(row => {
        const productSummary = documentProductSummary(row), documentId = id("sales", row.id), effectiveVersion = versionFromSql(row.version);
        if (row.dataset === "LIVE") { requireDomain(row.batch_id === null, "INVALID_DATABASE_VALUE", "LIVE has no import batch");
          return { ...decodeSummary(row, summaryQuantities(row)), dataset: "LIVE", batchId: null, documentId, effectiveVersion, productSummary }; }
        requireDomain(row.dataset === "HISTORY", "INVALID_DATABASE_VALUE", "Exact document dataset required");
        const quantity = normalNullableQuantity(row.quantity), incomingQuantity = normalNullableQuantity(row.incoming_quantity), outgoingQuantity = normalNullableQuantity(row.outgoing_quantity);
        requireDomain(quantity === null && incomingQuantity === null && outgoingQuantity === null || quantity !== null && incomingQuantity !== null && outgoingQuantity !== null && quantity === outgoingQuantity - incomingQuantity, "INVALID_DATABASE_VALUE", "Historical signed quantity totals disagree");
        return { dataset: "HISTORY", batchId: id("operation", row.batch_id), id: documentId, documentId, version: effectiveVersion, effectiveVersion, productSummary,
          number: stringValue(row.number), businessType: choice(row.business_type, ["SALE", "RETURN", "EXCHANGE"]), businessDate: row.business_date === null ? null : businessDate(stringValue(row.business_date)),
          status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), hallId: id("hall", row.hall_id), warehouseId: id("warehouse", row.warehouse_id), customerId: id("customer", row.customer_id),
          salespersonId: nullableId("staff", row.salesperson_id), responsibleStaffId: nullableId("staff", row.responsible_staff_id), responsibleName: nullableString(row.responsible_name), createdByName: nullableString(row.created_by_name),
          hallName: nullableString(row.hall_name), warehouseName: nullableString(row.warehouse_name), customerName: nullableString(row.customer_name), salespersonName: nullableString(row.salesperson_name),
          updatedAt: nullableString(row.updated_at), createdLocalAt: nullableString(row.created_local_at), updatedLocalAt: nullableString(row.updated_local_at),
          quantity, incomingQuantity, outgoingQuantity, grossAmount: normalNullableMoney(row.gross_amount), orderDiscount: normalNullableMoney(row.order_discount), netDue: normalNullableMoney(row.net_due) };
      });
      const t = result.totals;
      return { ...parametersPage(parameters), exactTotal: result.exactTotal, historyCoverage: result.historyCoverage, items,
        totals: { quantity: normalNullableQuantity(t.quantity), incomingQuantity: normalNullableQuantity(t.incoming_quantity), outgoingQuantity: normalNullableQuantity(t.outgoing_quantity),
          grossAmount: normalNullableMoney(t.gross_amount), orderDiscount: normalNullableMoney(t.order_discount), netDue: normalNullableMoney(t.net_due) } };
    });
    p.filter(parameters);
    return this.snapshot(read.signal, async query => {
      const exactTotal = count(rowOf(await query(`SELECT COUNT(*)::text AS exact_total FROM naijue_erp.sales_header h WHERE ${p.where()}`, [...p.values])).exact_total);
      const paging = p.page(parameters.page, parameters.pageSize);
      const rows = (await query(`SELECT ${SUMMARY_COLUMNS}, hall.name AS hall_name, wh.name AS warehouse_name, c.name AS customer_name, sp.name AS salesperson_name
        FROM naijue_erp.sales_header h JOIN naijue_erp.hall hall ON hall.id = h.hall_id
        JOIN naijue_erp.warehouse wh ON wh.id = h.warehouse_id JOIN naijue_erp.customer c ON c.id = h.customer_id
        LEFT JOIN naijue_erp.staff sp ON sp.id = h.salesperson_id LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id JOIN naijue_erp.user_account creator_account ON creator_account.id=h.created_by_account_id JOIN naijue_erp.staff creator ON creator.id=creator_account.staff_id WHERE ${p.where()}
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
        LEFT JOIN naijue_erp.staff sp ON sp.id = h.salesperson_id LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id JOIN naijue_erp.user_account creator_account ON creator_account.id=h.created_by_account_id JOIN naijue_erp.staff creator ON creator.id=creator_account.staff_id WHERE ${p.where()}`, p.values)).rows;
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
        referenceNames: { responsibleName: nullableString(row.responsible_name), createdByName: stringValue(row.created_by_name), hallName: stringValue(row.hall_name), warehouseName: stringValue(row.warehouse_name),
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

/** Exact26 normal lists reuse the original reader lease, source identity and D3
 * publication/effective fragments. This function does not acquire a connection. */
export interface NativeDocumentListOptions { readonly profile: "source-confirmed-normal-document-lists-v1"; readonly runtime26: NativeRuntime26Capability }
export interface NormalDocumentListResult {
  readonly rows: readonly Record<string, unknown>[]; readonly totals: Record<string, unknown>;
  readonly exactTotal: bigint; readonly historyCoverage: DocumentHistoryCoverage;
}
export async function normalDocumentReferenceScopeOn(client: PgSalesQueryClient, options: NativeDocumentListOptions,
 kind: 'sales' | 'transfers', read: { readonly actor: SalesScopedRead<SalesListQuery>['actor']; readonly signal: AbortSignal },
 native: { readonly scope: string; readonly values: readonly unknown[] }) {
  const active = () => { if (read.signal.aborted) throw new DomainError(kind === 'sales' ? 'SALES_READ_ABORTED' : 'TRANSFER_READ_ABORTED', 'Document read aborted'); };
  const query: ReadQuery = async (sql, values = []) => { active(); const result = await client.query(sql, values); active(); return result; };
  active(); await options.runtime26.assertReady(client, 'HISTORY_READ'); active();
  const identity = await sourceConfirmedReadIdentityOn({ query }, read.actor, read.signal);
  const values: unknown[] = [...native.values], bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const history = importedHistoryReadSql(kind, values.length + 1); values.push(...history.values);
  let liveScope = native.scope, historyScope = 'TRUE';
  if (identity.role === 'SALESPERSON') {
    requireDomain(identity.hallId !== null, 'FORBIDDEN', 'Authoritative current hall required');
    const hall = `${bind(identity.hallId)}::uuid`;
    if (kind === 'sales') {
      liveScope = `(${liveScope}) AND h.hall_id=${hall}`;
      historyScope = `h.hall_id=${hall}`;
    } else {
      liveScope = `(${liveScope}) AND (fw.hall_id=${hall} OR tw.hall_id=${hall} OR (h.created_hall_id=${hall} AND h.created_role='SALESPERSON'))`;
      // Explicit approved source rule, independent of LIVE and of the old
      // imported-history HALL_IDS validator (which still rejects transfers).
      historyScope = `((${history.sourceWarehouseBindingsPredicate} AND (
        EXISTS(SELECT 1 FROM naijue_erp.warehouse scope_fw WHERE scope_fw.id=${history.fromWarehouseIdExpression} AND scope_fw.hall_id=${hall}) OR
        EXISTS(SELECT 1 FROM naijue_erp.warehouse scope_tw WHERE scope_tw.id=${history.toWarehouseIdExpression} AND scope_tw.hall_id=${hall}))) OR
        (${history.originalCreatedHallPredicate} AND h.created_hall_id=${hall} AND h.created_role_source='SALESPERSON' AND h.created_by_source_key IS NOT NULL))`;
    }
  }
  return {query,values,bind,history,liveScope,historyScope};
}
export async function assertNormalReferenceHistoryOn(scoped: Awaited<ReturnType<typeof normalDocumentReferenceScopeOn>>): Promise<void> {
 const h=scoped.history;
 // This statement uses only history parameters. Native filters/search/selected
 // IDs belong to later statements; remove those unused slots for pg Parse.
 const sql=`/* normal-reference:validity */ SELECT coalesce(bool_and((${h.headerValidityPredicate}) IS TRUE AND
   NOT EXISTS(SELECT 1 FROM ${h.lineTable} l ${h.lineEffectiveJoins} WHERE l.batch_id=h.batch_id AND l.header_id=h.id AND (${h.lineValidityPredicate}) IS NOT TRUE)),true) AS valid
   FROM ${h.headerFrom} WHERE ${h.publishedPredicate} AND (${scoped.historyScope})`;
 const indices=[...new Set([...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
 const positions=new Map(indices.map((index,i)=>[index,i+1]));
 const row=rowOf(await scoped.query(sql.replace(/\$(\d+)/g,(_,index:string)=>`$${positions.get(Number(index))!}`),indices.map(index=>scoped.values[index-1])));
 requireDomain(row.valid===true,'INVALID_DATABASE_VALUE','Published historical reference facts contradict effective revision');
}
export async function normalDocumentListOn(client: PgSalesQueryClient, options: NativeDocumentListOptions,
  kind: 'sales' | 'transfers', read: SalesScopedRead<SalesListQuery> | TransferScopedRead<TransferListQuery>,
  native: { readonly from: string; readonly columns: string; readonly scope: string; readonly values: readonly unknown[] }): Promise<NormalDocumentListResult> {
  const {query,values,bind,history,liveScope,historyScope}=await normalDocumentReferenceScopeOn(client,options,kind,read,native);
  const names = kind === 'sales'
    ? 'hn.name AS hall_name,wn.name AS warehouse_name,cn.name AS customer_name,spn.name AS salesperson_name'
    : 'fw.name AS from_warehouse_name,tw.name AS to_warehouse_name,fh.name AS from_hall_name,th.name AS to_hall_name';
  const joins = kind === 'sales'
    ? 'LEFT JOIN naijue_erp.hall hn ON hn.id=hb.hall_id LEFT JOIN naijue_erp.warehouse wn ON wn.id=hb.warehouse_id LEFT JOIN naijue_erp.customer cn ON cn.id=hb.customer_id LEFT JOIN naijue_erp.staff spn ON spn.id=hb.salesperson_id'
    : 'LEFT JOIN naijue_erp.warehouse fw ON fw.id=hb.from_warehouse_id LEFT JOIN naijue_erp.warehouse tw ON tw.id=hb.to_warehouse_id LEFT JOIN naijue_erp.hall fh ON fh.id=fw.hall_id LEFT JOIN naijue_erp.hall th ON th.id=tw.hall_id';
  const columns = kind === 'sales'
    ? 'id,number,business_type,business_date,hall_id,customer_id,salesperson_id,warehouse_id,status,version,gross_amount,order_discount,net_due,updated_at,responsible_staff_id,responsible_name,created_by_name,hall_name,warehouse_name,customer_name,salesperson_name,created_local_at,updated_local_at'
    : 'id,number,business_date,from_warehouse_id,to_warehouse_id,status,version,created_by_account_id,created_at,updated_at,responsible_staff_id,responsible_name,from_warehouse_name,to_warehouse_name,from_hall_name,to_hall_name,created_by_name,approved_by_name,created_local_at,updated_local_at';
  const historyColumns = kind === 'sales'
    ? 'hb.id,hb.number,hb.business_type,hb.business_date,hb.hall_id,hb.customer_id,hb.salesperson_id,hb.warehouse_id,hb.source_status AS status,hb.version,hb.gross_amount,hb.order_discount,hb.net_due,hb.updated_instant AS updated_at,hb.responsible_staff_id,hb.responsible_name,creator.name AS created_by_name,' + names + ',hb.created_local_at,hb.updated_local_at'
    : 'hb.id,hb.number,hb.business_date,hb.from_warehouse_id,hb.to_warehouse_id,hb.source_status AS status,hb.version,NULL::uuid AS created_by_account_id,hb.created_instant AS created_at,hb.updated_instant AS updated_at,hb.responsible_staff_id,hb.responsible_name,' + names + ',creator.name AS created_by_name,approver.name AS approved_by_name,hb.created_local_at,hb.updated_local_at';
  // Bind each filter once and apply the same predicate inside both branches,
  // before their materialization and historical display/reference projections.
  // Historical dates/endpoints must use the effective revision, not raw h facts.
  const filter = read.parameters.filter, liveFilters: string[] = [], historyFilters: string[] = [];
  for (const [date, operator] of [[filter.startDate, '>='], [filter.endDate, '<=']] as const) if (date !== null) {
    const parameter = bind(date);
    liveFilters.push(`h.business_date${operator}${parameter}::date`);
    historyFilters.push(`${history.businessDateExpression}${operator}${parameter}::date`);
  }
  const dimensions: readonly (readonly [readonly unknown[], string, string])[] = kind === 'sales'
    ? (() => { const f = (read.parameters as SalesListQuery).filter; return [[f.statuses,'status','text'],[f.businessTypes,'business_type','text'],[f.hallIds,'hall_id','uuid'],[f.salespersonIds,'salesperson_id','uuid'],[f.customerIds,'customer_id','uuid'],[f.warehouseIds,'warehouse_id','uuid']] as const; })()
    : (() => { const f = (read.parameters as TransferListQuery).filter; return [[f.statuses,'status','text'],[f.fromWarehouseIds,'from_warehouse_id','uuid'],[f.toWarehouseIds,'to_warehouse_id','uuid']] as const; })();
  for (const [ids, column, cast] of dimensions) if (ids.length) {
    const parameter = `${bind([...ids])}::${cast}[]`;
    const historicalColumn = column === 'status' ? 'h.source_status'
      : column === 'from_warehouse_id' ? history.fromWarehouseIdExpression
      : column === 'to_warehouse_id' ? history.toWarehouseIdExpression : `h.${column}`;
    liveFilters.push(`h.${column}=ANY(${parameter})`);
    historyFilters.push(`${historicalColumn}=ANY(${parameter})`);
  }
  if (filter.number !== null) {
    const predicate = `strpos(lower(h.number),lower(${bind(filter.number)}::text))>0`;
    liveFilters.push(predicate); historyFilters.push(predicate);
  }
  const candidates = `live_candidates AS MATERIALIZED (SELECT 'LIVE'::text AS dataset,NULL::uuid AS batch_id,${native.columns},NULL::text AS created_local_at,NULL::text AS updated_local_at FROM ${native.from} WHERE (${liveScope}) AND (${liveFilters.join(' AND ') || 'TRUE'})),
    history_base AS MATERIALIZED (SELECT ${history.headerColumns}
      FROM ${history.headerFrom} WHERE ${history.publishedPredicate} AND (${historyScope}) AND (${historyFilters.join(' AND ') || 'TRUE'})),
    history_candidates AS MATERIALIZED (SELECT 'HISTORY'::text AS dataset,hb.batch_id,${historyColumns}
      FROM history_base hb ${joins} LEFT JOIN naijue_erp.staff creator ON creator.id=hb.created_by_staff_id
      LEFT JOIN naijue_erp.staff approver ON approver.id=hb.approved_by_staff_id),
    candidates AS (SELECT dataset,batch_id,${columns} FROM live_candidates UNION ALL SELECT dataset,batch_id,${columns} FROM history_candidates)`;
  const common = `${candidates},matched AS MATERIALIZED (SELECT * FROM candidates)`;
  // Preserve the original all-authorized-history corruption check, even for
  // documents outside the requested filters. Run it once in the totals query;
  // the page uses the same RR snapshot after that check has passed.
  const historyValidity = `history_validity AS (SELECT ${history.headerValidityPredicate} AS effective_valid,
      NOT EXISTS(SELECT 1 FROM ${history.lineTable} l ${history.lineEffectiveJoins}
        WHERE l.batch_id=h.batch_id AND l.header_id=h.id AND (${history.lineValidityPredicate}) IS NOT TRUE) AS lines_valid
      FROM ${history.headerFrom} WHERE ${history.publishedPredicate} AND (${historyScope}))`;
  const liveLine = kind === 'sales' ? 'sales_line' : 'transfer_line', nativeId = kind === 'sales' ? 'sales_id' : 'transfer_id';
  const lines = (headers: string, product: boolean) => `SELECT p.dataset,p.batch_id,p.id AS document_id,l.id AS line_id,l.line_no,l.quantity::numeric AS quantity,${kind === 'sales' ? 'l.is_gift' : 'false'} AS is_gift${product ? ',s.product_id,l.product_code_snapshot,l.product_name_snapshot' : ''}
      FROM ${headers} p JOIN naijue_erp.${liveLine} l ON p.dataset='LIVE' AND l.${nativeId}=p.id AND l.is_current${product ? ' LEFT JOIN naijue_erp.sku s ON s.id=l.sku_id' : ''}
    UNION ALL SELECT p.dataset,p.batch_id,p.id,l.id,l.line_no,coalesce(le.quantity,l.quantity)::numeric,${kind === 'sales' ? 'l.is_gift' : 'false'}${product ? ',s.product_id,l.product_code_snapshot,l.product_name_snapshot' : ''}
      FROM ${headers} p JOIN ${history.lineTable} l ON p.dataset='HISTORY' AND l.batch_id=p.batch_id AND l.header_id=p.id ${history.lineEffectiveJoins}${product ? ' LEFT JOIN naijue_erp.sku s ON s.id=l.sku_id' : ''}`;
  const metrics = (source: string) => `SELECT dataset,batch_id,document_id,
      CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN NOT is_gift THEN quantity ELSE 0 END) END AS quantity,
      CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN NOT is_gift AND quantity<0 THEN -quantity ELSE 0 END) END AS incoming_quantity,
      CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN NOT is_gift AND quantity>0 THEN quantity ELSE 0 END) END AS outgoing_quantity
      FROM ${source} GROUP BY dataset,batch_id,document_id`;
  const metricJoin = 'q.dataset=h.dataset AND q.batch_id IS NOT DISTINCT FROM h.batch_id AND q.document_id=h.id';
  const metricValue = (column: string) => `CASE WHEN q.document_id IS NULL THEN 0 ELSE q.${column} END`;
  const quantityTotals = ['quantity','incoming_quantity','outgoing_quantity'].map(c => `CASE WHEN count(*) FILTER(WHERE ${metricValue(c)} IS NULL)>0 THEN NULL ELSE coalesce(sum(${metricValue(c)}),0) END::text AS ${c}`).join(',');
  const moneyTotals = kind === 'sales' ? ',' + ['gross_amount','order_discount','net_due'].map(c => `CASE WHEN count(*) FILTER(WHERE h.${c} IS NULL)>0 THEN NULL ELSE coalesce(sum(h.${c}::numeric),0) END::text AS ${c}`).join(',') : '';
  const pageValues=[...values,read.parameters.pageSize,String((read.parameters.page-1)*read.parameters.pageSize)];
  const summary = rowOf(await query(`/* normal-document-list:shared */ WITH ${common},${historyValidity},
    all_lines AS (${lines('matched',false)}),total_metrics AS (${metrics('all_lines')}),summary AS MATERIALIZED (
    SELECT count(*)::text AS exact_total,${quantityTotals}${moneyTotals},
      (SELECT coalesce(bool_and(effective_valid IS TRUE AND lines_valid IS TRUE),true) FROM history_validity) AS history_valid,
      EXISTS(SELECT 1 FROM ${history.publicationFrom} WHERE ${history.publishedPredicate}) AS history_published
    FROM matched h LEFT JOIN total_metrics q ON ${metricJoin}),
    page_headers AS MATERIALIZED (
      SELECT * FROM matched ORDER BY updated_at DESC NULLS LAST,id ASC,dataset ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}::bigint),
    page_lines AS MATERIALIZED (${lines('page_headers', true)}),page_metrics AS (${metrics('page_lines')}),
    products AS (SELECT *,row_number() OVER(PARTITION BY dataset,batch_id,document_id,coalesce(product_id::text,'line:'||line_id::text) ORDER BY line_no,line_id) AS identity_row FROM page_lines),
    previews AS (SELECT *,row_number() OVER(PARTITION BY dataset,batch_id,document_id ORDER BY line_no,line_id) AS preview_row FROM products WHERE identity_row=1),
    product_summaries AS (SELECT dataset,batch_id,document_id,
      CASE WHEN count(*) FILTER(WHERE product_id IS NULL)>0 THEN NULL ELSE count(*) END::text AS product_count,
      coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'productCodeSnapshot',product_code_snapshot,'productNameSnapshot',product_name_snapshot) ORDER BY preview_row) FILTER(WHERE preview_row<=3),'[]'::jsonb) AS product_items,
      count(*)>3 AS product_has_more FROM previews GROUP BY dataset,batch_id,document_id),
    page_rows AS (    SELECT h.*,${['quantity','incoming_quantity','outgoing_quantity'].map(c => `${metricValue(c)}::text AS ${c}`).join(',')},
      CASE WHEN ps.document_id IS NULL THEN '0' ELSE ps.product_count END AS product_count,coalesce(ps.product_items,'[]'::jsonb) AS product_items,coalesce(ps.product_has_more,false) AS product_has_more
    FROM page_headers h LEFT JOIN page_metrics q ON ${metricJoin}
      LEFT JOIN product_summaries ps ON ps.dataset=h.dataset AND ps.batch_id IS NOT DISTINCT FROM h.batch_id AND ps.document_id=h.id
    ORDER BY h.updated_at DESC NULLS LAST,h.id ASC,h.dataset ASC)
    SELECT summary.*,coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC NULLS LAST,p.id ASC,p.dataset ASC) FROM page_rows p),'[]'::jsonb) AS items FROM summary`,pageValues));
  requireDomain(summary.history_valid === true && typeof summary.history_published === 'boolean','INVALID_DATABASE_VALUE','Published historical header/line facts contradict their effective revision');
  requireDomain(Array.isArray(summary.items),'INVALID_DATABASE_VALUE','Bounded document items required');
  const rows=summary.items as Record<string,unknown>[],exactTotal=count(summary.exact_total);
  requireDomain(rows.length === Number(exactTotal > BigInt((read.parameters.page - 1) * read.parameters.pageSize)
    ? (exactTotal - BigInt((read.parameters.page - 1) * read.parameters.pageSize) < BigInt(read.parameters.pageSize) ? exactTotal - BigInt((read.parameters.page - 1) * read.parameters.pageSize) : BigInt(read.parameters.pageSize)) : 0n), 'INVALID_DATABASE_VALUE', 'Normal document page differs from its exact union count');
  const identities = rows.map(r => `${r.dataset}:${r.batch_id}:${r.id}`);
  requireDomain(new Set(identities).size === identities.length, 'INVALID_DATABASE_VALUE', 'Repeated normal document identity');
  return { rows, totals: summary, exactTotal, historyCoverage: summary.history_published ? 'PUBLISHED_AUTHORIZED' : 'NOT_PUBLISHED' };
}
export function documentProductSummary(row: Record<string, unknown>): DocumentProductSummary {
  const productCount = row.product_count === null ? null : count(row.product_count);
  requireDomain(Array.isArray(row.product_items) && row.product_items.length <= 3 && typeof row.product_has_more === 'boolean', 'INVALID_DATABASE_VALUE', 'Bounded snapshot product preview required');
  const items = row.product_items.map((item: unknown) => {
    requireDomain(item !== null && typeof item === 'object' && !Array.isArray(item), 'INVALID_DATABASE_VALUE', 'Product snapshot preview required');
    const value = item as Record<string, unknown>;
    return { productId: value.productId === null ? null : id('product', value.productId), productCodeSnapshot: nullableString(value.productCodeSnapshot), productNameSnapshot: nullableString(value.productNameSnapshot) };
  });
  requireDomain(productCount === null || (productCount >= BigInt(items.length) && row.product_has_more === (productCount > 3n)), 'INVALID_DATABASE_VALUE', 'Product preview count mismatch');
  return { productCount, items, hasMore: row.product_has_more };
}
export const normalNullableQuantity = (value: unknown): bigint | null => {
  if (value === null) return null;
  requireDomain(typeof value === 'string' && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value), 'INVALID_DATABASE_VALUE', 'Exact nullable document quantity required');
  return BigInt(value);
};
export const normalNullableMoney = (value: unknown): bigint | null => value === null ? null : decimalToMinor(stringValue(value), { scale: 2 });
