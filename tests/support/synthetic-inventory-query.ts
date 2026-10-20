import { entityId } from "../../packages/domain/src/values.ts";
import type { EntityKind } from "../../packages/domain/src/values.ts";
import type { ActorContext } from "../../packages/application/src/ports.ts";
import type { InventoryCandidatePage, InventoryCandidateQuery, InventoryQuery, InventoryQueryColorFit, InventoryQueryPage, InventoryQueryProduct, InventoryReadScope, InventoryReadSnapshot, InventoryScopedRead, InventoryStockTotal, TrustedInventorySnapshotReader } from "../../packages/application/src/inventory-query-contracts.ts";

/** Deterministic finite TEST DOUBLE only. Never imported by application/composition code. */
export const inventoryId = <K extends EntityKind>(kind: K, n: number) => entityId(kind, `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
export const inventoryActor: ActorContext = { accountId: inventoryId("account", 1), hallId: inventoryId("hall", 2) };
export const inventoryScope: InventoryReadScope = { hallIds: [inventoryId("hall", 2)], warehouses: [
  { id: inventoryId("warehouse", 3), hallId: inventoryId("hall", 2), label: "SYNTHETIC WAREHOUSE" }
] };
export const inventoryParameters = (page = 1, pageSize = 100) => ({ page, pageSize,
  filter: { products: [], category: null, warehouses: [], suppliers: [], fits: [], seasons: [] } });
export const candidateParameters = (page = 1) => ({ kind: "product", search: "", page, pageSize: 20, selectedIds: [], categoryId: null });
function total(known: bigint, unknown: number): InventoryStockTotal {
  return { knownQuantity: known.toString(), unknownCells: unknown, completeness: unknown ? "incomplete" : "complete" };
}
function syntheticProduct(index: number, scope: InventoryReadScope): InventoryQueryProduct {
  const sizes = [0, 1, 2, 3].map(n => ({ id: inventoryId("size", 10 + n), label: ["160/XS", "165/S", "170/M", "175/L"][n]! }));
  const perSize = Object.fromEntries(sizes.map((size, n) => [size.id, total(n === 0 ? -2n * BigInt(scope.warehouses.length) : 0n, n === 2 ? scope.warehouses.length : 0)]));
  const productTotal = total(-2n * BigInt(scope.warehouses.length), scope.warehouses.length);
  const colorFit: InventoryQueryColorFit = {
    color: { id: inventoryId("color", 20), label: "SYNTHETIC COLOR" }, fit: { id: inventoryId("fit", 21), label: "Y版（修身）" },
    rows: scope.warehouses.map(warehouse => ({ warehouse: { id: warehouse.id, label: warehouse.label }, cells: {
      [sizes[0]!.id]: { state: "known", skuId: inventoryId("sku", 10000 + index * 4), quantity: "-2" },
      [sizes[1]!.id]: { state: "known", skuId: inventoryId("sku", 10001 + index * 4), quantity: "0" },
      [sizes[2]!.id]: { state: "unknown", skuId: inventoryId("sku", 10002 + index * 4), reason: "SYNTHETIC baseline coverage not proven" },
      [sizes[3]!.id]: { state: "not-applicable" }
    }, total: total(-2n, 1) })), sizeTotals: perSize, total: productTotal
  };
  return { id: inventoryId("product", 1000 + index), code: `SYNTHETIC-${String(index).padStart(6, "0")}`, name: `SYNTHETIC PRODUCT ${index}`,
    categoryLabel: "SYNTHETIC CATEGORY", supplierLabel: "", seasonLabel: "", sizeGroup: { id: inventoryId("sizeGroup", 30), label: "SYNTHETIC SOURCE SIZES" },
    sizes, colorFits: [colorFit], sizeTotals: perSize, total: productTotal };
}
export function syntheticInventorySnapshot(read: InventoryScopedRead<InventoryQuery>, count = 1): InventoryReadSnapshot<InventoryQueryPage> {
  const { page, pageSize } = read.parameters; const offset = (page - 1) * pageSize;
  // Generate only the requested page. Full-filter summary is independently known from this finite fixture.
  const products = Array.from({ length: Math.min(pageSize, Math.max(0, count - offset)) }, (_, n) => syntheticProduct(offset + n, read.scope));
  const readReference = "SYNTHETIC-INVENTORY-SNAPSHOT-1";
  const allMatchesTotal = total(-2n * BigInt(count * read.scope.warehouses.length), count * read.scope.warehouses.length);
  return { readReference, readiness: count ? "incomplete" : "ready", data: { page, pageSize, exactTotalProducts: count, products,
    warehouseLabels: read.scope.warehouses.map(row => row.label), allMatchesTotal, readReference } };
}
export function syntheticCandidateSnapshot(read: InventoryScopedRead<InventoryCandidateQuery>): InventoryReadSnapshot<InventoryCandidatePage> {
  const all = read.parameters.kind === "warehouse" ? read.scope.warehouses : Array.from({ length: 23 }, (_, n) => ({ id: inventoryId(read.parameters.kind, 1000 + n), label: `SYNTHETIC CANDIDATE ${n}` }));
  const offset = (read.parameters.page - 1) * 20;
  return { readReference: "SYNTHETIC-CANDIDATE-SNAPSHOT-1", readiness: "incomplete", data: {
    items: all.slice(offset, offset + 20).map(({ id, label }) => ({ id, label })), exactTotal: all.length, page: read.parameters.page
  } };
}
export function syntheticInventoryReader(count = 1): TrustedInventorySnapshotReader {
  return { async readInventory(read) { return syntheticInventorySnapshot(read, count); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } };
}
