import type { Pool } from "pg";
import type { OperationReceiptRow, SalesAuditRow, SalesResult, SalesTransaction, SalesUnitOfWork, StoredSales } from "../../../packages/application/src/ports.ts";
import type { SalesDocument, SalesHeaderRow, SalesLineRow, SalesSettlementRow } from "../../../packages/domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind, Version } from "../../../packages/domain/src/values.ts";
import { auditJson, booleanValue, integerValue, jsonObject, moneyFromSql, moneyToSql, nullableString, quantityFromSql, stringValue, versionFromSql, versionToSql } from "./codec.ts";

export interface PgSalesResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
/** Structural subset of the actual pg PoolClient protocol, also usable by explicitly labelled protocol fakes. */
export interface PgSalesClient {
  query(text: string, values?: unknown[]): Promise<PgSalesResult>;
  release(error?: Error | boolean): void;
}
export interface PgSalesPool { connect(): Promise<PgSalesClient> }
// Compile-time compatibility with the pinned real driver, without constructing a Pool or making a connection.
type PgPoolCompatibility = Pool extends PgSalesPool ? true : never;
const pgPoolCompatibility: PgPoolCompatibility = true;
void pgPoolCompatibility;

const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
const key = (warehouseId: string, skuId: string): string => JSON.stringify([warehouseId, skuId]);
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted enum value");
  return value as T;
}
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const HEADER_SELECT = `SELECT id, number, business_type, to_char(business_date, 'YYYY-MM-DD') AS business_date, hall_id, customer_id, salesperson_id, warehouse_id,
  status, version, gross_amount::text, order_discount::text, net_due::text, note, created_by_account_id, created_hall_id,
  ${stamp("created_at")} AS created_at, ${stamp("updated_at")} AS updated_at,
  approved_by_account_id, ${stamp("approved_at")} AS approved_at, stock_basis
  FROM naijue_erp.sales_header WHERE id = $1 FOR UPDATE`;
const LINE_SELECT = `SELECT id, sales_id, line_no, sku_id, quantity::text, reference_price::text, deal_price::text,
  line_amount::text, allocated_discount::text, is_gift, product_code_snapshot, product_name_snapshot,
  color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current
  FROM naijue_erp.sales_line WHERE sales_id = $1 ORDER BY line_no, id`;
const SETTLEMENT_SELECT = `SELECT id, sales_id, line_no, payment_account_id, direction, amount::text
  FROM naijue_erp.sales_settlement WHERE sales_id = $1 ORDER BY line_no, id`;
const BALANCE_SELECT = `SELECT b.warehouse_id, b.sku_id, b.quantity::text, b.version, b.last_operation_id,
  ${stamp("b.updated_at")} AS updated_at FROM naijue_erp.inventory_balance b
  WHERE b.warehouse_id = $1 AND b.sku_id IN (SELECT sku_id FROM naijue_erp.sales_line WHERE sales_id = $2 AND is_current)
  ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b`;

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
    lineAmount: moneyFromSql(row.line_amount), allocatedDiscount: moneyFromSql(row.allocated_discount), isGift: booleanValue(row.is_gift), isCurrent: booleanValue(row.is_current),
    snapshot: { productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}
function decodeSettlement(row: Record<string, unknown>): SalesSettlementRow {
  return { id: id("settlement", row.id), salesId: id("sales", row.sales_id), lineNo: integerValue(row.line_no), paymentAccountId: id("paymentAccount", row.payment_account_id),
    direction: choice(row.direction, ["RECEIVE", "REFUND"]), amount: moneyFromSql(row.amount) };
}
function decodeBalance(row: Record<string, unknown>): InventoryBalanceRow {
  return { warehouseId: id("warehouse", row.warehouse_id), skuId: id("sku", row.sku_id), quantity: quantityFromSql(row.quantity), version: versionFromSql(row.version),
    lastOperationId: nullableId("operation", row.last_operation_id), updatedAt: stringValue(row.updated_at) };
}
function decodeResult(value: unknown): SalesResult {
  const row = jsonObject(value);
  requireDomain(Array.isArray(row.ledgerEntryIds), "INVALID_DATABASE_VALUE", "Receipt ledger identities must be an array");
  return { operationId: id("operation", row.operationId), salesId: id("sales", row.salesId), version: versionFromSql(row.version),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), ledgerEntryIds: row.ledgerEntryIds.map(value => id("ledger", value)) };
}

/** Real pg transaction adapter. No connection, migration, seed, retry, authorization default or server is created here. */
export class PostgresSalesUnitOfWork implements SalesUnitOfWork {
  private readonly pool: PgSalesPool;
  constructor(pool: PgSalesPool) { this.pool = pool; }
  async transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new PostgresSalesTransaction(client);
    let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      // Explicit READ COMMITTED: a receipt waiter must see the previous holder's committed receipt after its advisory lock.
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      const result = await work(tx);
      tx.close();
      commitAttempted = true; await client.query("COMMIT");
      return result;
    } catch (error) {
      tx.close();
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("PostgreSQL transaction failed");
      if (began) {
        try { await client.query("ROLLBACK"); }
        catch (rollbackError) {
          discard = rollbackError instanceof Error ? rollbackError : new Error("PostgreSQL rollback failed");
          throw new AggregateError([error, rollbackError], "PostgreSQL transaction and rollback failed; connection discarded");
        }
      }
      throw error;
    } finally { client.release(discard); }
  }
}

class PostgresSalesTransaction implements SalesTransaction {
  private active = true;
  private sales: { readonly id: EntityId<"sales">; readonly version: Version | null; readonly stockBasis: StoredSales["stockBasis"] } | undefined;
  private readonly balances = new Map<string, InventoryBalanceRow>();
  private receiptKey: string | undefined;
  close(): void { this.active = false; }
  private readonly client: PgSalesClient;
  constructor(client: PgSalesClient) { this.client = client; }
  private query(text: string, values: unknown[] = []): Promise<PgSalesResult> {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes");
    return this.client.query(text, values);
  }
  async getReceipt(actorId: EntityId<"account">, requestKey: string): Promise<OperationReceiptRow | undefined> {
    const identity = JSON.stringify([actorId, requestKey]);
    requireDomain(this.receiptKey === undefined || this.receiptKey === identity, "TRANSACTION_SCOPE", "One command receipt key is supported per transaction");
    this.receiptKey = identity;
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${identity}`]);
    const row = (await this.query(`SELECT id, actor_account_id, request_key, request_hash, action, target_id AS target_sales_id, status, result_data AS result,
      ${stamp("completed_at")} AS completed_at FROM naijue_erp.operation_receipt WHERE actor_account_id = $1 AND request_key = $2`, [actorId, requestKey])).rows[0];
    if (!row) return undefined;
    return { id: id("operation", row.id), actorAccountId: id("account", row.actor_account_id), requestKey: stringValue(row.request_key), requestHash: stringValue(row.request_hash),
      action: choice(row.action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]), targetSalesId: id("sales", row.target_sales_id), status: choice(row.status, ["COMMITTED"]), result: decodeResult(row.result), completedAt: stringValue(row.completed_at) };
  }
  async getSales(salesId: EntityId<"sales">): Promise<StoredSales | undefined> {
    requireDomain(this.sales === undefined, "TRANSACTION_SCOPE", "Load a single sales target once per command transaction");
    // Covers the absent-row insert race, which SELECT FOR UPDATE alone cannot lock.
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:sales:${salesId}`]);
    const row = (await this.query(HEADER_SELECT, [salesId])).rows[0];
    if (!row) { this.sales = { id: salesId, version: null, stockBasis: "RUNTIME_LEDGER" }; return undefined; }
    const header = decodeHeader(row);
    const stockBasis = choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]);
    this.sales = { id: salesId, version: header.version, stockBasis };
    const lines = (await this.query(LINE_SELECT, [salesId])).rows.map(decodeLine);
    const settlements = (await this.query(SETTLEMENT_SELECT, [salesId])).rows.map(decodeSettlement);
    // Lock every possible posting key in one stable order, not caller line order. No missing balance is manufactured.
    if (stockBasis === "RUNTIME_LEDGER") for (const balance of (await this.query(BALANCE_SELECT, [header.warehouseId, salesId])).rows.map(decodeBalance)) {
      this.balances.set(key(balance.warehouseId, balance.skuId), balance);
    }
    return { document: { header, lines, settlements }, stockBasis };
  }
  async putRuntimeSales(document: SalesDocument): Promise<void> {
    const h = document.header; const loaded = this.sales;
    requireDomain(loaded?.id === h.id, "TRANSACTION_SCOPE", "Document must be read before it is written");
    requireDomain(loaded.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Cutoff history is not a runtime posting");
    requireDomain(h.version === (loaded.version === null ? 1 : loaded.version + 1), "VERSION_CONFLICT", "Document write must advance the loaded version exactly once");
    const values: unknown[] = [h.id, h.number, h.businessType, h.businessDate, h.hallId, h.customerId, h.salespersonId, h.warehouseId, h.status,
      versionToSql(h.version), moneyToSql(h.grossAmount), moneyToSql(h.orderDiscount), moneyToSql(h.netDue), h.note, h.createdByAccountId, h.createdHallId,
      h.createdAt, h.updatedAt, h.approvedByAccountId, h.approvedAt];
    const columns = "id, number, business_type, business_date, hall_id, customer_id, salesperson_id, warehouse_id, status, version, gross_amount, order_discount, net_due, note, created_by_account_id, created_hall_id, created_at, updated_at, approved_by_account_id, approved_at";
    let result: PgSalesResult;
    if (loaded.version === null) {
      result = await this.query(`INSERT INTO naijue_erp.sales_header (${columns}, stock_basis) VALUES (${values.map((_value, index) => `$${index + 1}`).join(", ")}, 'RUNTIME_LEDGER') ON CONFLICT (id) DO NOTHING`, values);
    } else {
      const fields = columns.split(", ");
      result = await this.query(`UPDATE naijue_erp.sales_header SET ${fields.slice(1).map((field, index) => `${field} = $${index + 2}`).join(", ")} WHERE id = $1 AND version = $21 AND stock_basis = 'RUNTIME_LEDGER'`, [...values, versionToSql(loaded.version)]);
    }
    requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Document compare-and-swap failed");
    // Free current positions first, so swapping positions and replacing a retained line do not hit transient uniqueness conflicts.
    await this.query("UPDATE naijue_erp.sales_line SET is_current = false WHERE sales_id = $1", [h.id]);
    for (const line of document.lines) {
      requireDomain(line.salesId === h.id, "FOREIGN_LINE_ID", "Line must belong to this sales document");
      const s = line.snapshot;
      const lineValues = [line.id, line.salesId, line.lineNo, line.skuId, line.quantity.toString(), line.referencePrice === null ? null : moneyToSql(line.referencePrice), moneyToSql(line.dealPrice),
        moneyToSql(line.lineAmount), moneyToSql(line.allocatedDiscount), line.isGift, s.productCode, s.productName, s.colorName, s.fitName, s.sizeName, s.barcode, line.isCurrent];
      const lineColumns = ["id", "sales_id", "line_no", "sku_id", "quantity", "reference_price", "deal_price", "line_amount", "allocated_discount", "is_gift", "product_code_snapshot", "product_name_snapshot", "color_name_snapshot", "fit_name_snapshot", "size_name_snapshot", "barcode_snapshot", "is_current"];
      const written = await this.query(`INSERT INTO naijue_erp.sales_line (${lineColumns.join(", ")}) VALUES (${lineValues.map((_value, index) => `$${index + 1}`).join(", ")})
        ON CONFLICT (id) DO UPDATE SET ${lineColumns.slice(2).map(column => `${column} = EXCLUDED.${column}`).join(", ")} WHERE sales_line.sales_id = EXCLUDED.sales_id`, lineValues);
      requireDomain(written.rowCount === 1, "FOREIGN_LINE_ID", "A retained line identity cannot move between documents");
    }
    await this.query("DELETE FROM naijue_erp.sales_settlement WHERE sales_id = $1 AND NOT (id = ANY($2::uuid[]))", [h.id, document.settlements.map(row => row.id)]);
    for (const row of document.settlements) {
      requireDomain(row.salesId === h.id, "FOREIGN_SETTLEMENT_ID", "Settlement must belong to this sales document");
      const written = await this.query(`INSERT INTO naijue_erp.sales_settlement (id, sales_id, line_no, payment_account_id, direction, amount, account_name_snapshot, method_name_snapshot)
        SELECT $1, $2, $3, pa.id, $5, $6, pa.name, pm.name FROM naijue_erp.payment_account pa
        JOIN naijue_erp.payment_method pm ON pm.id = pa.payment_method_id WHERE pa.id = $4
        ON CONFLICT (id) DO UPDATE SET line_no = EXCLUDED.line_no, payment_account_id = EXCLUDED.payment_account_id,
        direction = EXCLUDED.direction, amount = EXCLUDED.amount,
        account_name_snapshot = CASE WHEN sales_settlement.payment_account_id = EXCLUDED.payment_account_id THEN sales_settlement.account_name_snapshot ELSE EXCLUDED.account_name_snapshot END,
        method_name_snapshot = CASE WHEN sales_settlement.payment_account_id = EXCLUDED.payment_account_id THEN sales_settlement.method_name_snapshot ELSE EXCLUDED.method_name_snapshot END
        WHERE sales_settlement.sales_id = EXCLUDED.sales_id`, [row.id, row.salesId, row.lineNo, row.paymentAccountId, row.direction, moneyToSql(row.amount)]);
      requireDomain(written.rowCount === 1, "INVALID_SETTLEMENT_REFERENCE", "Settlement identity or payment account reference is invalid");
    }
  }
  async getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined> {
    requireDomain(this.active && this.sales, "TRANSACTION_SCOPE", "Read the sales target before posting");
    return structuredClone(this.balances.get(key(warehouseId, skuId)));
  }
  async putBalance(row: InventoryBalanceRow): Promise<void> {
    const identity = key(row.warehouseId, row.skuId); const previous = this.balances.get(identity);
    requireDomain(previous, "INVENTORY_NOT_READY", "Missing coverage is not zero and cannot be inserted by a sales posting");
    requireDomain(row.version === previous.version + 1, "VERSION_CONFLICT", "Balance must advance exactly once per effect");
    const result = await this.query(`UPDATE naijue_erp.inventory_balance SET quantity = $3, version = $4, last_operation_id = $5, updated_at = $6
      WHERE warehouse_id = $1 AND sku_id = $2 AND version = $7`, [row.warehouseId, row.skuId, row.quantity.toString(), versionToSql(row.version), row.lastOperationId, row.updatedAt, versionToSql(previous.version)]);
    requireDomain(result.rowCount === 1, "VERSION_CONFLICT", "Inventory compare-and-swap failed");
    this.balances.set(identity, structuredClone(row));
  }
  async listSalesLedger(salesId: EntityId<"sales">): Promise<readonly InventoryLedgerRow[]> {
    requireDomain(this.sales?.id === salesId, "TRANSACTION_SCOPE", "Ledger must belong to the loaded document");
    return (await this.query(`SELECT l.id, l.operation_id, l.event_kind, l.warehouse_id, l.sku_id, l.quantity_delta::text, sl.sales_id, l.source_sales_line_id AS sales_line_id,
      l.source_document_version, l.reverses_entry_id, to_char(l.business_date, 'YYYY-MM-DD') AS business_date, ${stamp("l.posted_at")} AS posted_at
      FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
      WHERE sl.sales_id = $1 ORDER BY l.source_document_version, l.id`, [salesId])).rows.map(row => ({
        id: id("ledger", row.id), operationId: id("operation", row.operation_id), eventKind: choice(row.event_kind, ["APPROVE", "UNAPPROVE"]), warehouseId: id("warehouse", row.warehouse_id),
        skuId: id("sku", row.sku_id), quantityDelta: quantityFromSql(row.quantity_delta), source: { kind: "SALES", salesId: id("sales", row.sales_id), salesLineId: id("salesLine", row.sales_line_id), endpoint: "SALES_WAREHOUSE" },
        sourceDocumentVersion: versionFromSql(row.source_document_version), reversesEntryId: nullableId("ledger", row.reverses_entry_id), businessDate: businessDate(stringValue(row.business_date)), postedAt: stringValue(row.posted_at) }));
  }
  async appendLedger(row: InventoryLedgerRow): Promise<void> {
    requireDomain(row.source.kind === "SALES" && row.source.salesId === this.sales?.id, "TRANSACTION_SCOPE", "This adapter persists only runtime sales effects, not transfer commands");
    requireDomain(this.balances.has(key(row.warehouseId, row.skuId)), "INVENTORY_NOT_READY", "Posting requires existing locked coverage");
    await this.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_sales_line_id, endpoint, source_document_version, reverses_entry_id, business_date, posted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SALES_WAREHOUSE', $8, $9, $10, $11)`,
      [row.id, row.operationId, row.eventKind, row.warehouseId, row.skuId, row.quantityDelta.toString(), row.source.salesLineId, versionToSql(row.sourceDocumentVersion), row.reversesEntryId, row.businessDate, row.postedAt]);
  }
  async appendAudit(row: SalesAuditRow): Promise<void> {
    requireDomain(row.salesId === this.sales?.id, "TRANSACTION_SCOPE", "Audit must belong to the command target");
    await this.query(`INSERT INTO naijue_erp.audit_change (id, operation_id, actor_account_id, object_type, object_id, action, occurred_at, old_version, new_version, before_values, after_values)
      VALUES ($1, $2, $3, 'SALES', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`, [row.id, row.operationId, row.actorAccountId, row.salesId, row.action, row.occurredAt, row.before?.header.version ?? null, versionToSql(row.after.header.version), row.before === null ? null : auditJson(row.before), auditJson(row.after)]);
  }
  async insertReceipt(row: OperationReceiptRow): Promise<void> {
    requireDomain(this.receiptKey === JSON.stringify([row.actorAccountId, row.requestKey]) && row.targetSalesId === this.sales?.id, "TRANSACTION_SCOPE", "Receipt must match the locked original actor/key and document");
    await this.query(`INSERT INTO naijue_erp.operation_receipt (id, actor_account_id, request_key, request_hash, action, target_type, target_id, status, result_data, completed_at)
      VALUES ($1, $2, $3, $4, $5, 'SALES', $6, $7, $8::jsonb, $9)`, [row.id, row.actorAccountId, row.requestKey, row.requestHash, row.action, row.targetSalesId, row.status, JSON.stringify(row.result), row.completedAt]);
  }
}
