import { PostgresPostingBalances } from "./inventory-posting-balances.ts";
import { loadNativeTransferSnapshots } from "./native-transfer-snapshots.ts";
import type { Pool } from "pg";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import type { TransferAuditRow, TransferDocument, TransferReceiptRow, TransferResult, TransferTransaction, TransferUnitOfWork, StoredTransfer, RuntimeTransferHeader, TransferWarehouseFact, TransferSkuFact } from "../../../packages/application/src/transfer-ports.ts";
import type { TransferLineRow } from "../../../packages/domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../../packages/domain/src/inventory.ts";
import { requireDomain } from "../../../packages/domain/src/errors.ts";
import { businessDate, entityId } from "../../../packages/domain/src/values.ts";
import type { EntityId, EntityKind, Version } from "../../../packages/domain/src/values.ts";
import type { PgSalesClient, PgSalesPool, PgSalesResult } from "./sales-unit-of-work.ts";
import { auditJson, booleanValue, integerValue, jsonObject, nullableString, quantityFromSql, stringValue, versionFromSql, versionToSql } from "./codec.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";

type PgPoolCompatibility = Pool extends PgSalesPool ? true : never;
const compatible: PgPoolCompatibility = true; void compatible;
const id = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown): EntityId<K> | null => value === null ? null : id(kind, value);
const stamp = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  requireDomain(typeof value === "string" && choices.includes(value as T), "INVALID_DATABASE_VALUE", "Unexpected persisted enum");
  return value as T;
}
function header(row: Record<string, unknown>): RuntimeTransferHeader {
  return { id: id("transfer", row.id), number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)),
    fromWarehouseId: id("warehouse", row.from_warehouse_id), toWarehouseId: id("warehouse", row.to_warehouse_id),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), version: versionFromSql(row.version), note: nullableString(row.note),
    createdByAccountId: id("account", row.created_by_account_id), createdHallId: nullableId("hall", row.created_hall_id),
    createdRole: choice(row.created_role, ["ADMIN", "WAREHOUSE", "SALESPERSON"]), createdAt: stringValue(row.created_at), updatedAt: stringValue(row.updated_at),
    approvedByAccountId: nullableId("account", row.approved_by_account_id), approvedAt: nullableString(row.approved_at) };
}
function line(row: Record<string, unknown>): TransferLineRow {
  return { id: id("transferLine", row.id), transferId: id("transfer", row.transfer_id), lineNo: integerValue(row.line_no), skuId: id("sku", row.sku_id),
    quantity: quantityFromSql(row.quantity), isCurrent: booleanValue(row.is_current), snapshot: {
      productCode: stringValue(row.product_code_snapshot), productName: stringValue(row.product_name_snapshot), colorName: stringValue(row.color_name_snapshot),
      fitName: stringValue(row.fit_name_snapshot), sizeName: stringValue(row.size_name_snapshot), barcode: nullableString(row.barcode_snapshot) } };
}

function result(value: unknown): TransferResult {
  const row = jsonObject(value);
  requireDomain(Array.isArray(row.ledgerEntryIds), "INVALID_DATABASE_VALUE", "Receipt ledger identities must be an array");
  return { operationId: id("operation", row.operationId), transferId: id("transfer", row.transferId), version: versionFromSql(row.version),
    status: choice(row.status, ["DRAFT", "APPROVED", "VOID"]), ledgerEntryIds: row.ledgerEntryIds.map(value => id("ledger", value)) };
}
/** Real pg protocol adapter, never an implicit pool, retry, credential, server or migration runner. */
export class PostgresTransferUnitOfWork implements TransferUnitOfWork {
  private readonly pool: PgSalesPool;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgSalesPool, options?: { readonly runtime26: NativeRuntime26Capability }) {
    this.pool = pool;
    if (options !== undefined) {
      const descriptor = options && Object.getOwnPropertyDescriptor(options, "runtime26");
      if (!options || Object.getPrototypeOf(options) !== Object.prototype || Reflect.ownKeys(options).length !== 1
        || !descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined)
        throw new TypeError("Explicit closed exact26 transfer runtime options required");
      this.runtime26 = checkedNativeRuntime26Capability(descriptor.value);
    }
  }
  async transaction<T>(work: (tx: TransferTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect(); let tx: PostgresTransferTransaction | undefined;
    let began = false; let commitAttempted = false; let discard: Error | undefined;
    try {
      tx = new PostgresTransferTransaction(client, this.runtime26);
      if (this.runtime26) await this.runtime26.assertReady(client, "INVENTORY_ADMISSION");
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      if (this.runtime26) await this.runtime26.assertReady(client, "INVENTORY_ADMISSION");
      const value = await work(tx);
      tx.close();
      if (this.runtime26) await this.runtime26.assertReady(client, "INVENTORY_ADMISSION");
      commitAttempted = true; await client.query("COMMIT"); return value;
    } catch (error) {
      tx?.close();
      if (!began || commitAttempted) discard = error instanceof Error ? error : new Error("PostgreSQL transaction failed");
      // Never issue a misleading rollback after an uncertain COMMIT response.
      if (began && !commitAttempted) try { await client.query("ROLLBACK"); }
      catch (rollbackError) {
        discard = rollbackError instanceof Error ? rollbackError : new Error("PostgreSQL rollback failed");
        throw new AggregateError([error, rollbackError], "PostgreSQL transaction and rollback failed; connection discarded");
      }
      throw error;
    } finally { client.release(discard); }
  }
}
class PostgresTransferTransaction implements TransferTransaction {
  async getCurrentTransferSnapshots(skuIds: readonly EntityId<"sku">[]) {
    requireDomain(this.loaded !== undefined, "TRANSACTION_SCOPE", "Load the target document before snapshot facts");
    return loadNativeTransferSnapshots((sql, values) => this.query(sql, values), skuIds);
  }
  private active = true;
  private loaded: { readonly id: EntityId<"transfer">; readonly version: Version | null; readonly stockBasis: StoredTransfer["stockBasis"] } | undefined;
  private receiptKey: string | undefined;
  private receiptActor: EntityId<"account"> | undefined;
  private balancesLocked = false;
  private readonly balances: PostgresPostingBalances;
  private readonly previousLines = new Map<EntityId<"transferLine">, TransferLineRow>();
  private readonly warehouseFacts = new Map<string, TransferWarehouseFact | undefined>();
  private readonly skuFacts = new Map<string, TransferSkuFact | undefined>();
  private readonly client: PgSalesClient;
  constructor(client: PgSalesClient, runtime26?: NativeRuntime26Capability) {
    this.client = client; this.balances = runtime26 === undefined ? new PostgresPostingBalances((sql, values) => this.query(sql, values))
      : PostgresPostingBalances.forRuntime26(client, runtime26, () => requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot be used after its callback completes"));
  }
  close(): void { this.active = false; }
  private assertNumberScope(input: RuntimeDocumentNumberInput): void {
    requireDomain(this.active && input.kind === "TRANSFER" && input.actorAccountId === this.receiptActor
      && this.loaded?.id === input.documentId && this.loaded.version === null,
    "TRANSACTION_SCOPE", "Number allocation requires the original actor and new transfer target");
  }
  async reserveRuntimeDocumentNumber(input: RuntimeDocumentNumberInput): Promise<string> {
    this.assertNumberScope(input);
    const number = await reserveRuntimeDocumentNumber((sql, values) => this.query(sql, values), input);
    this.assertNumberScope(input); return number;
  }
  async assertRuntimeDocumentNumber(input: RuntimeDocumentNumberInput & { readonly number: string }): Promise<void> {
    this.assertNumberScope(input);
    await assertRuntimeDocumentNumber((sql, values) => this.query(sql, values), input);
    this.assertNumberScope(input);
  }
  private query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    requireDomain(this.active, "TRANSACTION_CLOSED", "Transaction handle cannot escape its callback");
    return this.client.query(sql, values);
  }
  async getReceipt(actor: EntityId<"account">, requestKey: string): Promise<TransferReceiptRow | undefined> {
    const identity = JSON.stringify([actor, requestKey]);
    requireDomain(this.receiptKey === undefined || this.receiptKey === identity, "TRANSACTION_SCOPE", "One command key per transaction");
    this.receiptKey = identity;
    this.receiptActor = actor;
    // Deliberately shared with sales: actor/key uniqueness is global, not scoped by document kind.
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:receipt:${identity}`]);
    const row = (await this.query(`SELECT id, actor_account_id, request_key, request_hash, action, target_type, target_id, status, result_data,
      ${stamp("completed_at")} AS completed_at FROM naijue_erp.operation_receipt WHERE actor_account_id = $1 AND request_key = $2`, [actor, requestKey])).rows[0];
    if (!row) return undefined;
    requireDomain(row.target_type === "TRANSFER", "IDEMPOTENCY_CONFLICT", "The original actor/key belongs to another document kind");
    return { id: id("operation", row.id), actorAccountId: id("account", row.actor_account_id), requestKey: stringValue(row.request_key), requestHash: stringValue(row.request_hash),
      action: choice(row.action, ["SAVE", "APPROVE", "UNAPPROVE", "VOID"]), targetTransferId: id("transfer", row.target_id), status: choice(row.status, ["COMMITTED"]),
      result: result(row.result_data), completedAt: stringValue(row.completed_at) };
  }
  async getTransfer(transferId: EntityId<"transfer">): Promise<StoredTransfer | undefined> {
    requireDomain(this.loaded === undefined, "TRANSACTION_SCOPE", "Load exactly one transfer per command");
    await this.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`naijue:transfer:${transferId}`]);
    const row = (await this.query(`SELECT id, number, to_char(business_date, 'YYYY-MM-DD') AS business_date, from_warehouse_id, to_warehouse_id, status, version, note,
      created_by_account_id, created_hall_id, created_role, ${stamp("created_at")} AS created_at, ${stamp("updated_at")} AS updated_at,
      approved_by_account_id, ${stamp("approved_at")} AS approved_at, stock_basis FROM naijue_erp.transfer_header WHERE id = $1 FOR UPDATE`, [transferId])).rows[0];
    if (!row) { this.loaded = { id: transferId, version: null, stockBasis: "RUNTIME_LEDGER" }; return undefined; }
    const h = header(row); const stockBasis = choice(row.stock_basis, ["RUNTIME_LEDGER", "CUTOFF_HISTORY"]);
    this.loaded = { id: transferId, version: h.version, stockBasis };
    const lines = (await this.query(`SELECT id, transfer_id, line_no, sku_id, quantity::text, product_code_snapshot, product_name_snapshot,
      color_name_snapshot, fit_name_snapshot, size_name_snapshot, barcode_snapshot, is_current FROM naijue_erp.transfer_line WHERE transfer_id = $1 ORDER BY line_no, id`, [transferId])).rows.map(line);
    for (const value of lines) this.previousLines.set(value.id, structuredClone(value));
    return { document: { header: h, lines }, stockBasis };
  }
  async getWarehouseFact(warehouseId: EntityId<"warehouse">): Promise<TransferWarehouseFact | undefined> {
    requireDomain(this.active && this.loaded, "TRANSACTION_SCOPE", "Load the transfer before reference facts");
    if (this.warehouseFacts.has(warehouseId)) return structuredClone(this.warehouseFacts.get(warehouseId));
    const row = (await this.query(`SELECT w.id, w.hall_id, w.enabled, h.enabled AS hall_enabled,
      EXISTS (SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id = w.id AND b.quantity <> 0) AS has_nonzero_inventory
      FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id = w.hall_id WHERE w.id = $1 FOR SHARE OF w, h`, [warehouseId])).rows[0];
    const fact = row ? { id: id("warehouse", row.id), hallId: id("hall", row.hall_id), enabled: booleanValue(row.enabled),
      hallEnabled: booleanValue(row.hall_enabled), hasNonzeroInventory: booleanValue(row.has_nonzero_inventory) } : undefined;
    this.warehouseFacts.set(warehouseId, fact); return structuredClone(fact);
  }
  async getSkuFact(skuId: EntityId<"sku">): Promise<TransferSkuFact | undefined> {
    requireDomain(this.active && this.loaded, "TRANSACTION_SCOPE", "Load the transfer before reference facts");
    if (this.skuFacts.has(skuId)) return structuredClone(this.skuFacts.get(skuId));
    const row = (await this.query(`SELECT s.id, (s.enabled AND p.enabled AND c.enabled AND f.enabled
      AND EXISTS (SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id = p.size_group_id AND m.size_id = s.size_id)) AS enabled
      FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id = s.product_id JOIN naijue_erp.color c ON c.id = s.color_id
      JOIN naijue_erp.fit f ON f.id = s.fit_id WHERE s.id = $1 FOR SHARE OF s, p, c, f`, [skuId])).rows[0];
    const fact = row ? { id: id("sku", row.id), enabled: booleanValue(row.enabled) } : undefined;
    this.skuFacts.set(skuId, fact); return structuredClone(fact);
  }
  async lockBalances(keys: readonly { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku"> }[]): Promise<void> {
    requireDomain(this.loaded && !this.balancesLocked && keys.length > 0, "TRANSACTION_SCOPE", "Lock the complete posting set exactly once");
    this.balancesLocked = true;
    await this.balances.lock(keys);
  }
  async getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined> {
    requireDomain(this.active && this.balancesLocked, "TRANSACTION_SCOPE", "Lock the complete posting set before reading balances");
    return this.balances.get(warehouseId, skuId);
  }
  async assertAbsentBalanceIsPublishedZero(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<void> {
    requireDomain(this.active && this.loaded?.stockBasis === "RUNTIME_LEDGER" && this.balancesLocked,
      "TRANSACTION_SCOPE", "Only the loaded runtime transfer may prove first use");
    await this.balances.assertZero(warehouseId, skuId);
  }
  async putBalance(row: InventoryBalanceRow): Promise<void> { await this.balances.put(row); }
  async listTransferLedger(transferId: EntityId<"transfer">): Promise<readonly InventoryLedgerRow[]> {
    requireDomain(this.loaded?.id === transferId, "TRANSACTION_SCOPE", "Ledger must match loaded transfer");
    return (await this.query(`SELECT l.id, l.operation_id, l.event_kind, l.warehouse_id, l.sku_id, l.quantity_delta::text, tl.transfer_id, l.source_transfer_line_id,
      l.endpoint, l.source_document_version, l.reverses_entry_id, to_char(l.business_date, 'YYYY-MM-DD') AS business_date, ${stamp("l.posted_at")} AS posted_at
      FROM naijue_erp.inventory_ledger l JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
      WHERE tl.transfer_id = $1 ORDER BY l.source_document_version, l.id`, [transferId])).rows.map(row => ({
        id: id("ledger", row.id), operationId: id("operation", row.operation_id), eventKind: choice(row.event_kind, ["APPROVE", "UNAPPROVE"]),
        warehouseId: id("warehouse", row.warehouse_id), skuId: id("sku", row.sku_id), quantityDelta: quantityFromSql(row.quantity_delta),
        source: { kind: "TRANSFER", transferId: id("transfer", row.transfer_id), transferLineId: id("transferLine", row.source_transfer_line_id), endpoint: choice(row.endpoint, ["FROM", "TO"]) },
        sourceDocumentVersion: versionFromSql(row.source_document_version), reversesEntryId: nullableId("ledger", row.reverses_entry_id), businessDate: businessDate(stringValue(row.business_date)), postedAt: stringValue(row.posted_at) }));
  }
  async appendLedger(row: InventoryLedgerRow): Promise<void> {
    requireDomain(row.source.kind === "TRANSFER" && row.source.transferId === this.loaded?.id, "TRANSACTION_SCOPE", "Only the loaded transfer may post");
    this.balances.assertCanAppend(row);
    const written = await this.query(`INSERT INTO naijue_erp.inventory_ledger (id, operation_id, event_kind, warehouse_id, sku_id, quantity_delta,
      source_transfer_line_id, endpoint, source_document_version, reverses_entry_id, business_date, posted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.id, row.operationId, row.eventKind, row.warehouseId, row.skuId, row.quantityDelta.toString(), row.source.transferLineId, row.source.endpoint,
        versionToSql(row.sourceDocumentVersion), row.reversesEntryId, row.businessDate, row.postedAt]);
    requireDomain(written.rowCount === 1, "INVENTORY_INTEGRITY_FAILED", "Exact native inventory effect was not appended");
    this.balances.didAppend(row);
  }
  async putRuntimeTransfer(document: TransferDocument): Promise<void> {
    const h = document.header; const loaded = this.loaded;
    requireDomain(loaded?.id === h.id, "TRANSACTION_SCOPE", "Transfer must be read before writing");
    requireDomain(loaded.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED", "Cutoff history is not a runtime posting");
    requireDomain(h.version === (loaded.version === null ? 1 : loaded.version + 1), "VERSION_CONFLICT", "Transfer version must advance exactly once");
    const values: unknown[] = [h.id,h.number,h.businessDate,h.fromWarehouseId,h.toWarehouseId,h.status,versionToSql(h.version),h.note,h.createdByAccountId,h.createdHallId,h.createdRole,h.createdAt,h.updatedAt,h.approvedByAccountId,h.approvedAt];
    const columns = "id, number, business_date, from_warehouse_id, to_warehouse_id, status, version, note, created_by_account_id, created_hall_id, created_role, created_at, updated_at, approved_by_account_id, approved_at";
    const written = loaded.version === null
      ? await this.query(`INSERT INTO naijue_erp.transfer_header (${columns}, stock_basis) VALUES (${values.map((_v,i) => `$${i+1}`).join(",")}, 'RUNTIME_LEDGER') ON CONFLICT (id) DO NOTHING`, values)
      : await this.query(`UPDATE naijue_erp.transfer_header SET ${columns.split(", ").slice(1).map((field,i) => `${field} = $${i+2}`).join(", ")} WHERE id = $1 AND version = $16 AND stock_basis = 'RUNTIME_LEDGER'`, [...values,versionToSql(loaded.version)]);
    requireDomain(written.rowCount === 1, "VERSION_CONFLICT", "Transfer compare-and-swap failed");
    // Sparse audit reflects actual row transitions. Deferred current-position uniqueness
    // permits swaps without transient deactivate-all/rewrite-all mutations.
    for (const l of document.lines) {
      const previous = this.previousLines.get(l.id);
      if (previous !== undefined && requestHash(previous) === requestHash(l)) continue;
      requireDomain(l.transferId === h.id, "FOREIGN_LINE_ID", "Transfer line cannot move across owners"); const s = l.snapshot;
      const row = await this.query(`INSERT INTO naijue_erp.transfer_line (id,transfer_id,line_no,sku_id,quantity,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot,is_current)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET line_no=EXCLUDED.line_no, sku_id=EXCLUDED.sku_id,
        quantity=EXCLUDED.quantity, product_code_snapshot=EXCLUDED.product_code_snapshot, product_name_snapshot=EXCLUDED.product_name_snapshot,
        color_name_snapshot=EXCLUDED.color_name_snapshot, fit_name_snapshot=EXCLUDED.fit_name_snapshot, size_name_snapshot=EXCLUDED.size_name_snapshot,
        barcode_snapshot=EXCLUDED.barcode_snapshot, is_current=EXCLUDED.is_current WHERE transfer_line.transfer_id = EXCLUDED.transfer_id`,
        [l.id,l.transferId,l.lineNo,l.skuId,l.quantity.toString(),s.productCode,s.productName,s.colorName,s.fitName,s.sizeName,s.barcode,l.isCurrent]);
      requireDomain(row.rowCount === 1, "FOREIGN_LINE_ID", "Transfer line identity belongs to another document");
    }
  }
  async appendAudit(row: TransferAuditRow): Promise<void> {
    requireDomain(row.transferId === this.loaded?.id, "TRANSACTION_SCOPE", "Audit must match transfer");
    await this.query(`INSERT INTO naijue_erp.audit_change (id,operation_id,actor_account_id,object_type,object_id,action,occurred_at,old_version,new_version,before_values,after_values)
      VALUES ($1,$2,$3,'TRANSFER',$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`, [row.id,row.operationId,row.actorAccountId,row.transferId,row.action,row.occurredAt,row.before?.header.version ?? null,
        versionToSql(row.after.header.version),row.before === null ? null : auditJson(row.before),auditJson(row.after)]);
  }
  async insertReceipt(row: TransferReceiptRow): Promise<void> {
    requireDomain(this.receiptKey === JSON.stringify([row.actorAccountId,row.requestKey]) && row.targetTransferId === this.loaded?.id, "TRANSACTION_SCOPE", "Receipt must match locked original key and transfer");
    await this.query(`INSERT INTO naijue_erp.operation_receipt (id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
      VALUES ($1,$2,$3,$4,$5,'TRANSFER',$6,$7,$8::jsonb,$9)`, [row.id,row.actorAccountId,row.requestKey,row.requestHash,row.action,row.targetTransferId,row.status,JSON.stringify(row.result),row.completedAt]);
  }
}
import { reserveRuntimeDocumentNumber, assertRuntimeDocumentNumber } from "./runtime-document-number.ts";
import type { RuntimeDocumentNumberInput } from "../../../packages/application/src/runtime-document-number.ts";
