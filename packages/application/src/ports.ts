import type { SalesDocument, SalesDraft, SalesLineRow, DocumentStatus } from "../../domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../domain/src/inventory.ts";
import type { EntityId, EntityKind, Quantity, Version } from "../../domain/src/values.ts";

export type SalesAction = "SAVE" | "APPROVE" | "UNAPPROVE" | "VOID";
export interface ActorContext { readonly accountId: EntityId<"account">; readonly hallId: EntityId<"hall"> | null }
export interface CommandEnvelope { readonly actor: ActorContext; readonly requestKey: string }
export type SalesCommand = CommandEnvelope & (
  { readonly action: "SAVE"; readonly expectedVersion: Version | null; readonly draft: SalesDraft }
  | { readonly action: "APPROVE" | "UNAPPROVE" | "VOID"; readonly salesId: EntityId<"sales">; readonly expectedVersion: Version }
);
export interface SalesResult {
  readonly operationId: EntityId<"operation">; readonly salesId: EntityId<"sales">;
  readonly version: Version; readonly status: DocumentStatus; readonly ledgerEntryIds: readonly EntityId<"ledger">[];
}
export interface OperationReceiptRow {
  readonly id: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly requestKey: string; readonly requestHash: string; readonly action: SalesAction;
  readonly targetSalesId: EntityId<"sales">; readonly status: "COMMITTED"; readonly result: SalesResult; readonly completedAt: string;
}
export interface SalesAuditValues {
  readonly header: Pick<SalesDocument["header"], "number" | "businessType" | "businessDate" | "hallId" | "salespersonId" | "customerId" | "warehouseId" | "status" | "version" | "grossAmount" | "orderDiscount" | "netDue" | "note">;
  readonly lines: readonly Pick<SalesLineRow, "id" | "lineNo" | "skuId" | "quantity" | "referencePrice" | "dealPrice" | "lineAmount" | "allocatedDiscount" | "isGift" | "snapshot" | "isCurrent">[];
  readonly settlements: SalesDocument["settlements"];
}
export interface SalesAuditRow {
  readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly salesId: EntityId<"sales">; readonly action: SalesAction; readonly occurredAt: string;
  readonly before: SalesAuditValues | null; readonly after: SalesAuditValues;
}
/** Adapter metadata, not a chosen historical import schema. Cutoff history must never be reversed as runtime postings. */
export interface StoredSales { readonly document: SalesDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY" }
export interface SalesTransaction {
  getSales(id: EntityId<"sales">): Promise<StoredSales | undefined>;
  putRuntimeSales(document: SalesDocument): Promise<void>;
  getReceipt(actorId: EntityId<"account">, requestKey: string): Promise<OperationReceiptRow | undefined>;
  insertReceipt(row: OperationReceiptRow): Promise<void>;
  getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined>;
  putBalance(row: InventoryBalanceRow): Promise<void>;
  listSalesLedger(salesId: EntityId<"sales">): Promise<readonly InventoryLedgerRow[]>;
  appendLedger(row: InventoryLedgerRow): Promise<void>;
  appendAudit(row: SalesAuditRow): Promise<void>;
}
/** MUST atomically commit/rollback all callback writes; serialize document/receipt/balance conflicts and enforce uniqueness.
 * No PostgreSQL implementation is included. A successful synthetic adapter test is NOT PostgreSQL evidence. */
export interface SalesUnitOfWork { transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> }
/** Required trusted server-side policy. No default production sign/discount/rounding algorithm is guessed. */
export interface SalesBusinessRules {
  assertDraftChange(previous: SalesDocument | undefined, draft: SalesDraft): void;
  assertReferencesAndEconomics(document: SalesDocument): void;
  inventoryDelta(document: SalesDocument, line: SalesLineRow): Quantity;
}
export interface SalesAuthorization {
  /** Check record access AND every proposed hall/warehouse/customer/payment-account reference scope. */
  assertAllowed(actor: ActorContext, action: SalesAction, document: SalesDocument | SalesDraft): Promise<void>;
}
export interface SalesDependencies {
  readonly unitOfWork: SalesUnitOfWork; readonly rules: SalesBusinessRules; readonly authorization: SalesAuthorization;
  readonly now: () => string; readonly newId: <K extends EntityKind>(kind: K) => EntityId<K>;
}
