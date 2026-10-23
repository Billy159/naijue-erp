import type { NativeSalesReferenceFacts } from "./sales-native-facts.ts";
import type { InventoryPostingTransaction } from "./inventory-posting.ts";
import type { RuntimeDocumentNumberTransaction } from "./runtime-document-number.ts";
import type { SalesDocument, SalesDraft, SalesLineRow, DocumentStatus } from "../../domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../domain/src/inventory.ts";
import type { EntityId, EntityKind, Quantity, Version } from "../../domain/src/values.ts";
import type { NativeSalesSaveProposal } from './native-sales-preparation.ts';
import type { DocumentSpecificationResolution } from './document-specification.ts';

export type SalesAction = "SAVE" | "APPROVE" | "UNAPPROVE" | "VOID";
export interface ActorContext { readonly accountId: EntityId<"account">; readonly hallId: EntityId<"hall"> | null }
export interface CommandEnvelope { readonly actor: ActorContext; readonly requestKey: string }
export type LegacySalesCommand = CommandEnvelope & (
  { readonly action: "SAVE"; readonly expectedVersion: Version | null; readonly draft: SalesDraft }
  | { readonly action: "APPROVE" | "UNAPPROVE" | "VOID"; readonly salesId: EntityId<"sales">; readonly expectedVersion: Version }
);
export type SalesCommand = LegacySalesCommand | (CommandEnvelope & {
  readonly action: 'SAVE'; readonly expectedVersion: Version | null; readonly proposal: NativeSalesSaveProposal;
});
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
  /** Native old/new versions are always present; all other header values are actual changes only. */
  readonly header: Pick<SalesDocument["header"], "version"> & Partial<Pick<SalesDocument["header"],
    "number" | "businessType" | "businessDate" | "hallId" | "salespersonId" | "customerId" | "warehouseId" | "status"
    | "grossAmount" | "orderDiscount" | "netDue" | "note" | "updatedAt" | "approvedByAccountId" | "approvedAt">>;
  /** Complete before/after values of changed rows only, never copies of unchanged retained detail. */
  readonly lines: readonly Pick<SalesLineRow, "id" | "lineNo" | "skuId" | "quantity" | "referencePrice" | "dealPrice" | "pricingRule" | "discountTenths" | "zeroConfirmed" | "lineAmount" | "allocatedDiscount" | "isGift" | "snapshot" | "isCurrent">[];
  readonly settlements: SalesDocument["settlements"];
}
export interface SalesAuditRow {
  readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly salesId: EntityId<"sales">; readonly action: SalesAction; readonly occurredAt: string;
  readonly before: SalesAuditValues | null; readonly after: SalesAuditValues;
}
/** Adapter metadata, not a chosen historical import schema. Cutoff history must never be reversed as runtime postings. */
export interface StoredSales { readonly document: SalesDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY" }
/** Current, non-secret native facts, read and held inside the command transaction.
 * Unknown roles/statuses remain explicit facts for the action policy to reject. */
export interface SalesCurrentIdentity {
  readonly accountId: EntityId<"account">; readonly staffId: EntityId<"staff">;
  readonly loginEnabled: boolean; readonly role: string; readonly employmentStatus: string;
  readonly hallId: EntityId<"hall"> | null; readonly hallEnabled: boolean | null;
}
export interface SalesTransaction extends InventoryPostingTransaction, RuntimeDocumentNumberTransaction {
  resolveDocumentSkus?(input: DocumentSpecificationResolution): Promise<readonly EntityId<'sku'>[]>;
  /** Requires the receipt actor/key and single sales target to have been bound first.
   * Implementations must not open another transaction or expose credentials/session material. */
  getCurrentSalesIdentity(accountId: EntityId<"account">): Promise<SalesCurrentIdentity | undefined>;
  /** Optional capability for compatibility with explicit non-native providers.
   * Native rules require it and fail closed if absent. Reads use this original
   * bound command transaction and an explicit real catalogue completeness verifier. */
  getCurrentSalesReferenceFacts?(document: SalesDraft | SalesDocument): Promise<NativeSalesReferenceFacts>;
  /** Manual creation only: exact enabled MAIN barcode and native labels, on the bound transaction. */
  getCurrentSalesSnapshots?(skuIds: readonly EntityId<"sku">[]): Promise<ReadonlyMap<EntityId<"sku">, SalesLineRow["snapshot"]>>;
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
 * PostgreSQL implementation lives in adapters/postgres; synthetic/protocol tests are NOT real PostgreSQL evidence. */
export interface SalesUnitOfWork { transaction<T>(work: (tx: SalesTransaction) => Promise<T>): Promise<T> }
/** Required trusted server-side policy, never an implicit default. A candidate-source adapter
 * is available in sales-business-rules.ts and still requires verified catalogue/reference facts. */
export interface SalesBusinessRules {
  assertDraftChange(previous: SalesDocument | undefined, draft: SalesDraft, tx?: SalesTransaction): void | Promise<void>;
  assertReferencesAndEconomics(document: SalesDocument, tx?: SalesTransaction): void | Promise<void>;
  inventoryDelta(document: SalesDocument, line: SalesLineRow): Quantity;
}
export interface SalesAuthorization {
  /** The assembled provider must check record/action access AND every proposed
   * hall/warehouse/customer/payment-account reference scope. The optional argument
   * preserves existing explicit test providers; native identity policy requires it. */
  assertAllowed(actor: ActorContext, action: SalesAction, document: SalesDocument | SalesDraft, tx?: SalesTransaction): Promise<void>;
}
export interface SalesDependencies {
  readonly unitOfWork: SalesUnitOfWork; readonly rules: SalesBusinessRules; readonly authorization: SalesAuthorization;
  readonly now: () => string; readonly newId: <K extends EntityKind>(kind: K) => EntityId<K>;
}
