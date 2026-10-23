import type { InventoryPostingTransaction } from "./inventory-posting.ts";
import type { RuntimeDocumentNumberTransaction } from "./runtime-document-number.ts";
import type { DocumentStatus, TransferHeaderRow, TransferLineRow } from "../../domain/src/documents.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../domain/src/inventory.ts";
import type { EntityId, EntityKind, Version } from "../../domain/src/values.ts";
import type { ActorContext } from "./ports.ts";
import type { NativeTransferSaveProposal } from './native-transfer-preparation.ts';
import type { DocumentSpecificationResolution } from './document-specification.ts';

export type TransferAction = "SAVE" | "APPROVE" | "UNAPPROVE" | "VOID";
/** These normalized, source-confirmed roles must be supplied by trusted authentication, never request JSON. */
export type TransferRole = "ADMIN" | "WAREHOUSE" | "SALESPERSON";
export interface TransferActor extends ActorContext { readonly role: TransferRole }
export interface RuntimeTransferHeader extends TransferHeaderRow {
  readonly note: string | null;
  readonly createdByAccountId: EntityId<"account">; readonly createdHallId: EntityId<"hall"> | null;
  readonly createdRole: TransferRole; readonly createdAt: string; readonly updatedAt: string;
  readonly approvedByAccountId: EntityId<"account"> | null; readonly approvedAt: string | null;
}
export interface TransferDocument { readonly header: RuntimeTransferHeader; readonly lines: readonly TransferLineRow[] }
export type TransferDraftHeader = Pick<RuntimeTransferHeader, "id" | "number" | "businessDate" | "fromWarehouseId" | "toWarehouseId" | "note">;
export interface TransferDraft { readonly header: TransferDraftHeader; readonly lines: readonly TransferLineRow[] }
export type LegacyTransferCommand = { readonly actor: TransferActor; readonly requestKey: string } & (
  { readonly action: "SAVE"; readonly expectedVersion: Version | null; readonly draft: TransferDraft }
  | { readonly action: "APPROVE" | "UNAPPROVE" | "VOID"; readonly transferId: EntityId<"transfer">; readonly expectedVersion: Version }
);
export type TransferCommand = LegacyTransferCommand | { readonly actor: TransferActor; readonly requestKey: string;
  readonly action: 'SAVE'; readonly expectedVersion: Version | null; readonly proposal: NativeTransferSaveProposal };
export interface TransferResult {
  readonly operationId: EntityId<"operation">; readonly transferId: EntityId<"transfer">;
  readonly version: Version; readonly status: DocumentStatus; readonly ledgerEntryIds: readonly EntityId<"ledger">[];
}
export interface TransferReceiptRow {
  readonly id: EntityId<"operation">; readonly actorAccountId: EntityId<"account">; readonly requestKey: string;
  readonly requestHash: string; readonly action: TransferAction; readonly targetTransferId: EntityId<"transfer">;
  readonly status: "COMMITTED"; readonly result: TransferResult; readonly completedAt: string;
}
export interface TransferAuditValues {
  readonly header: Pick<RuntimeTransferHeader, "number" | "businessDate" | "fromWarehouseId" | "toWarehouseId" | "status" | "version" | "note">;
  /** Sparse actual changed rows only; unchanged/retained rows are not copied. Posting-only actions have an empty array. */
  readonly lines: readonly Omit<TransferLineRow, "transferId">[];
}
export interface TransferAuditRow {
  readonly id: EntityId<"audit">; readonly operationId: EntityId<"operation">; readonly actorAccountId: EntityId<"account">;
  readonly transferId: EntityId<"transfer">; readonly action: TransferAction; readonly occurredAt: string;
  readonly before: TransferAuditValues | null; readonly after: TransferAuditValues;
}
/** CUTOFF_HISTORY remains an explicit fail-closed marker. It is not runtime posting provenance. */
export interface StoredTransfer { readonly document: TransferDocument; readonly stockBasis: "RUNTIME_LEDGER" | "CUTOFF_HISTORY" }
export interface TransferWarehouseFact {
  readonly id: EntityId<"warehouse">; readonly hallId: EntityId<"hall">; readonly enabled: boolean;
  readonly hallEnabled: boolean; readonly hasNonzeroInventory: boolean;
}
export interface TransferSkuFact { readonly id: EntityId<"sku">; readonly enabled: boolean }
/** Current native identity facts held by the original command transaction. */
export interface TransferCurrentIdentity {
  readonly accountId: EntityId<"account">; readonly staffId: EntityId<"staff">;
  readonly loginEnabled: boolean; readonly role: string; readonly employmentStatus: string;
  readonly hallId: EntityId<"hall"> | null; readonly hallEnabled: boolean | null;
}
export interface TransferTransaction extends InventoryPostingTransaction, RuntimeDocumentNumberTransaction {
  resolveDocumentSkus?(input: DocumentSpecificationResolution): Promise<readonly EntityId<'sku'>[]>;
  /** Native action policy requires this port. Bind the receipt actor and target
   * first; retain account/staff/hall locks until this transaction completes. */
  getCurrentTransferIdentity?(accountId: EntityId<"account">): Promise<TransferCurrentIdentity | undefined>;
  /** Optional native MAIN-barcode snapshots for explicit manual-SKU preparation.
   * Must be loaded/locked through this original transaction, never client labels. */
  getCurrentTransferSnapshots?(skuIds: readonly EntityId<"sku">[]): Promise<ReadonlyMap<EntityId<"sku">, import("../../domain/src/documents.ts").SkuSnapshot>>;
  getTransfer(id: EntityId<"transfer">): Promise<StoredTransfer | undefined>;
  putRuntimeTransfer(document: TransferDocument): Promise<void>;
  getReceipt(actorId: EntityId<"account">, requestKey: string): Promise<TransferReceiptRow | undefined>;
  insertReceipt(row: TransferReceiptRow): Promise<void>;
  /** Fetch trusted current reference facts in this transaction, not UUID syntax or client display snapshots. */
  getWarehouseFact(id: EntityId<"warehouse">): Promise<TransferWarehouseFact | undefined>;
  getSkuFact(id: EntityId<"sku">): Promise<TransferSkuFact | undefined>;
  /** Lock all distinct covered warehouse/SKU keys together in canonical order before any effect is appended. */
  lockBalances(keys: readonly { readonly warehouseId: EntityId<"warehouse">; readonly skuId: EntityId<"sku"> }[]): Promise<void>;
  getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined>;
  putBalance(row: InventoryBalanceRow): Promise<void>;
  listTransferLedger(id: EntityId<"transfer">): Promise<readonly InventoryLedgerRow[]>;
  appendLedger(row: InventoryLedgerRow): Promise<void>;
  appendAudit(row: TransferAuditRow): Promise<void>;
}
/** Atomically commit/rollback callback writes; serialize document/receipt/balance races and enforce uniqueness. */
export interface TransferUnitOfWork { transaction<T>(work: (tx: TransferTransaction) => Promise<T>): Promise<T> }
export interface TransferAuthorization {
  /** Required trusted policy. For SAVE check both persisted and proposed scopes; previous distinguishes edits from creation. */
  assertAllowed(actor: TransferActor, action: TransferAction, document: TransferDocument | TransferDraft, previous?: TransferDocument, tx?: TransferTransaction): Promise<void>;
}
export interface TransferReferences {
  /** Must verify both actual warehouses, disabled-out exception and current formal SKU facts using this transaction. */
  assertValid(tx: TransferTransaction, actor: TransferActor, action: TransferAction, previous: TransferDocument | undefined, proposed: TransferDocument | TransferDraft): Promise<void>;
}
export interface TransferDependencies {
  readonly unitOfWork: TransferUnitOfWork; readonly authorization: TransferAuthorization; readonly references: TransferReferences;
  readonly now: () => string; readonly newId: <K extends EntityKind>(kind: K) => EntityId<K>;
}
