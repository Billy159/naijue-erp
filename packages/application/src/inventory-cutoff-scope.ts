import { requireDomain } from "../../domain/src/errors.ts";
import type { InventoryBalanceRow } from "../../domain/src/inventory.ts";
import { entityId, quantity } from "../../domain/src/values.ts";
import type { EntityId, Quantity } from "../../domain/src/values.ts";
import type { CutoffImportBatch } from "./inventory-cutoff-import.ts";

const publishedScopeProof: unique symbol = Symbol("published-cutoff-scope");
export interface PublishedCutoffScope {
  readonly [publishedScopeProof]: true;
  readonly batchId: string; readonly warehouseIds: readonly EntityId<"warehouse">[]; readonly skuIds: readonly EntityId<"sku">[];
  assertKey(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">): void;
}
/** Adapter evidence is checked once for the entire consistent snapshot, never per-cell UNKNOWN. */
export function publishedCutoffScope(batch: CutoffImportBatch, members: readonly { readonly targetType: "WAREHOUSE" | "SKU"; readonly targetId: string; readonly targetExists: boolean }[],
  integrityGuardsPresent: boolean): PublishedCutoffScope {
  requireDomain(batch.status === "IMPORTED" && batch.completedAt !== null && batch.inventoryMode === "CUTOFF_STOCK_BASELINE",
    "INVENTORY_NOT_READY", "Only a completely published takeover proves absent stock is zero");
  requireDomain(integrityGuardsPresent, "INVENTORY_INTEGRITY_FAILED", "Native sparse inventory integrity guards are unavailable");
  const warehouses = new Set<EntityId<"warehouse">>(); const skus = new Set<EntityId<"sku">>();
  for (const member of members) {
    requireDomain(member.targetExists === true, "INVENTORY_INTEGRITY_FAILED", "Published scope contains a missing formal identity");
    if (member.targetType === "WAREHOUSE") {
      const id = entityId("warehouse", member.targetId); requireDomain(!warehouses.has(id), "INVENTORY_INTEGRITY_FAILED", "Duplicate warehouse scope identity"); warehouses.add(id);
    } else {
      requireDomain(member.targetType === "SKU", "INVENTORY_INTEGRITY_FAILED", "Unexpected scope member kind");
      const id = entityId("sku", member.targetId); requireDomain(!skus.has(id), "INVENTORY_INTEGRITY_FAILED", "Duplicate SKU scope identity"); skus.add(id);
    }
  }
  const { counts, expected } = batch.checkpoint;
  requireDomain(warehouses.size === expected.WAREHOUSE && skus.size === expected.SKU && counts.WAREHOUSE === expected.WAREHOUSE
    && counts.SKU === expected.SKU && counts.INVENTORY_LEDGER === expected.INVENTORY_LEDGER && counts.IMPORT_BATCH === 1 && expected.IMPORT_BATCH === 1
    && batch.checkpoint.cursor === Object.values(counts).reduce((sum, count) => sum + count, 0),
  "INVENTORY_INTEGRITY_FAILED", "Published complete-scope counts do not reconcile");
  return Object.freeze({ [publishedScopeProof]: true as const, batchId: batch.id, warehouseIds: Object.freeze([...warehouses]), skuIds: Object.freeze([...skus]),
    assertKey(warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">) {
      requireDomain(warehouses.has(warehouseId) && skus.has(skuId), "INVENTORY_NOT_READY", "Formal identities are outside the completely proven takeover scope");
    } });
}
/** A real, proven key may be absent. Unavailable/invalid scope must throw before any response is emitted. */
export function sparseInventoryQuantity(scope: PublishedCutoffScope, warehouseId: EntityId<"warehouse">, skuId: EntityId<"sku">,
  balance: InventoryBalanceRow | undefined): Quantity {
  requireDomain(scope[publishedScopeProof] === true, "INVENTORY_NOT_READY", "A complete published-scope proof is required before reading stock");
  scope.assertKey(warehouseId, skuId);
  if (balance === undefined) return quantity("0");
  requireDomain(balance.warehouseId === warehouseId && balance.skuId === skuId && balance.lastOperationId !== null
    && Number.isSafeInteger(balance.version) && balance.version > 0,
  "INVENTORY_INTEGRITY_FAILED", "Persisted balance is inconsistent with its requested formal key");
  return quantity(balance.quantity.toString());
}
