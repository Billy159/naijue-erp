import { requireDomain } from "../../domain/src/errors.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../domain/src/inventory.ts";
import { addQuantity, checkedQuantity, nextVersion, version } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";

/** C01-v1 / 0024 same-transaction HISTORY delta seam. D3 owns source/effective
 * locks, CAS, authorization, revision/receipt/audit and original-key recovery.
 * D1 owns these balance/ledger writes on that SAME client; no transaction/pool
 * is created by post(). Allocate IDs before inserting revision evidence, then
 * pass those exact IDs here. Only real nonzero effects are supplied. */
export interface HistoryRevisionPostingContext {
  readonly operationId: string; readonly revisionId: string; readonly actorAccountId: string;
  readonly kind: "sales" | "transfers"; readonly documentId: string; readonly toVersion: number;
  /** Exact original business date; never today's/import date. null is valid for
   * amount-only revisions; a stock delta needs an actual date for existing ledger storage. */
  readonly businessDate: string | null; readonly postedAt: string;
}
export interface HistoryRevisionPostingEffect {
  readonly ledgerEntryId: string; readonly lineId: string; readonly warehouseId: string; readonly skuId: string;
  readonly endpoint: "SALES_WAREHOUSE" | "FROM" | "TO"; readonly quantityDelta: string;
}
export interface HistoryRevisionPostingResult { readonly ledgerEntryIds: readonly string[] }
export interface HistoryRevisionPostingPort<TransactionClient> {
  /** Zero effects returns [] without touching ledger/balance. Otherwise require
   * independently validated EXACT24 capability, complete deterministic key locks,
   * explicit admission/no-prior-ledger first-use proof, exact bigint deltas and
   * per-original-line transfer endpoint conservation. SQL still closes source,
   * operation/revision/target/version/receipt/evidence at deferred commit. */
  post(client: TransactionClient, context: HistoryRevisionPostingContext,
    effects: readonly HistoryRevisionPostingEffect[]): Promise<HistoryRevisionPostingResult>;
}

/** An explicit trusted transaction capability, never a client flag or an absent-row default. */
export interface InventoryPostingTransaction {
  getBalance(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<InventoryBalanceRow | undefined>;
  /** Must hold the exact key lock and prove complete immutable publication + native membership + no prior ledger in THIS transaction.
   * Omission deliberately keeps older/unproven adapters closed. Must not write a balance or a zero ledger. */
  assertAbsentBalanceIsPublishedZero?(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): Promise<void>;
  appendLedger(row: InventoryLedgerRow): Promise<void>;
  putBalance(row: InventoryBalanceRow): Promise<void>;
}
async function proveFirstUse(tx: InventoryPostingTransaction, entry: InventoryLedgerRow): Promise<void> {
  requireDomain(entry.eventKind === "APPROVE" && entry.reversesEntryId === null && tx.assertAbsentBalanceIsPublishedZero,
    "INVENTORY_NOT_READY", "Missing balance requires an explicit published-zero proof for first runtime approval");
  await tx.assertAbsentBalanceIsPublishedZero(entry.warehouseId, entry.skuId);
}
/** Validate the whole locked posting set before the first effect. Repeated actual lines remain distinct. */
export async function assertPostingCoverage(tx: InventoryPostingTransaction, entries: readonly InventoryLedgerRow[]): Promise<void> {
  for (const entry of entries) if (await tx.getBalance(entry.warehouseId, entry.skuId) === undefined) await proveFirstUse(tx, entry);
}
export async function applyInventoryEntry(tx: InventoryPostingTransaction, entry: InventoryLedgerRow): Promise<void> {
  const balance = await tx.getBalance(entry.warehouseId, entry.skuId);
  if (balance === undefined) await proveFirstUse(tx, entry);
  const updated: InventoryBalanceRow = balance === undefined
    ? { warehouseId: entry.warehouseId, skuId: entry.skuId, quantity: checkedQuantity(entry.quantityDelta), version: version(1), lastOperationId: entry.operationId, updatedAt: entry.postedAt }
    : { ...balance, quantity: addQuantity(balance.quantity, entry.quantityDelta), version: nextVersion(balance.version), lastOperationId: entry.operationId, updatedAt: entry.postedAt };
  await tx.appendLedger(entry);
  // The first persisted row is the ACTUAL business delta. There is no fabricated version-0/zero placeholder.
  await tx.putBalance(updated);
}
