import type { SkuRow } from "./catalog.ts";
import { requireDomain } from "./errors.ts";
import type { EntityId } from "./values.ts";

export interface SkuBarcodeRow {
  readonly id: EntityId<"barcode">; readonly barcode: string; readonly skuId: EntityId<"sku">;
  readonly kind: "PRIMARY" | "CONFIRMED_HISTORICAL"; readonly enabled: boolean;
}
function assertRawBarcode(value: string): void {
  requireDomain(typeof value === "string" && value.length > 0, "INVALID_BARCODE", "A raw barcode must be a nonempty string, not a number");
}
export function resolveBarcode(rows: readonly SkuBarcodeRow[], skus: readonly SkuRow[], raw: string): SkuRow {
  assertRawBarcode(raw);
  const matches = rows.filter(row => row.barcode === raw);
  requireDomain(matches.length > 0, "BARCODE_NOT_FOUND", "No exact raw barcode match");
  const targets = new Set(matches.map(row => row.skuId));
  requireDomain(targets.size === 1, "BARCODE_CONFLICT", "Conflicting bindings fail closed, including disabled historical bindings");
  requireDomain(matches.some(row => row.enabled), "BARCODE_DISABLED", "Barcode binding is disabled");
  const sku = skus.find(row => row.id === matches[0]?.skuId);
  requireDomain(sku?.enabled, "SKU_UNAVAILABLE", "The canonical SKU must exist and be enabled");
  return sku;
}
export function bindHistoricalBarcode(rows: readonly SkuBarcodeRow[], skus: readonly SkuRow[], input: Omit<SkuBarcodeRow, "kind" | "enabled">): readonly SkuBarcodeRow[] {
  assertRawBarcode(input.barcode);
  requireDomain(skus.some(sku => sku.id === input.skuId && sku.enabled), "SKU_UNAVAILABLE", "Bind directly to an existing enabled canonical SKU");
  const matches = rows.filter(row => row.barcode === input.barcode);
  requireDomain(matches.every(row => row.skuId === input.skuId), "BARCODE_CONFLICT", "One raw barcode cannot be rebound to another SKU");
  if (matches.length > 0) {
    requireDomain(matches.some(row => row.enabled), "BARCODE_DISABLED", "Reactivation requires a separate explicitly approved operation");
    return [...rows];
  }
  requireDomain(!rows.some(row => row.id === input.id), "BARCODE_ID_CONFLICT", "Barcode row identity must be unique");
  return [...rows, { ...input, kind: "CONFIRMED_HISTORICAL", enabled: true }];
}
