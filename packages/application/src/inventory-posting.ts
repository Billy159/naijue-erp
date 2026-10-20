import { requireDomain } from "../../domain/src/errors.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../../domain/src/inventory.ts";
import { addQuantity, checkedQuantity, nextVersion, version } from "../../domain/src/values.ts";
import type { EntityId } from "../../domain/src/values.ts";

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
