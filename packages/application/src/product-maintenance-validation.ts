import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { validateCompleteCataloguePrices } from "./catalogue-price-input.ts";
import { partyName, partyObject, partyRequestKey } from "./party-maintenance-validation.ts";
import type { ProductBarcodeInput, ProductMaintenanceCandidateQuery, ProductMaintenanceCommand, ProductMaintenanceCommandV2, ProductSkuInput, ProductWriteValues, ProductWriteValuesV2 } from "./product-maintenance-ports.ts";
import type { ProductImageChange, ProductMaintenanceMediaCommandV2, ProductMaintenanceImageMetadata } from "./product-maintenance-ports.ts";
export const PRODUCT_MAINTENANCE_MAX_SKUS = 5000, PRODUCT_MAINTENANCE_MAX_BARCODES = 20000;
function invalid(): never { throw new DomainError("INVALID_PRODUCT_MAINTENANCE", "Invalid product maintenance command"); }
function bag(input: unknown, keys: readonly string[]) { try { return partyObject(input, keys); } catch { return invalid(); } }
function id(input: unknown, nullable = false): string | null {
  if (nullable && input === null) return null;
  try { if (typeof input !== "string") invalid(); return entityId("product", input); } catch { return invalid(); }
}
function text(input: unknown, nullable = false): string | null {
  if (nullable && input === null) return null; try { return partyName(input); } catch { return invalid(); }
}
export function productMaintenanceVersion(input: unknown): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > 2147483647) invalid(); return input;
}
function bool(input: unknown): boolean { if (typeof input !== "boolean") invalid(); return input; }
export function parseProductMaintenanceCandidates(input: unknown): ProductMaintenanceCandidateQuery {
  const r = bag(input, ["kind", "search", "page", "pageSize"]);
  if (typeof r.kind !== "string" || !["categories", "suppliers", "seasons", "size-groups", "colors", "fits", "barcode-schemes", "years", "thicknesses", "collar-pants-types"].includes(r.kind)
    || typeof r.search !== "string" || r.search.length > 200 || r.search.includes("\0") || typeof r.page !== "number" || !Number.isSafeInteger(r.page) || r.page < 1
    || (r.pageSize !== 20 && r.pageSize !== 50 && r.pageSize !== 100) || !Number.isSafeInteger((r.page - 1) * r.pageSize)) invalid();
  return { kind: r.kind as ProductMaintenanceCandidateQuery["kind"], search: r.search, page: r.page, pageSize: r.pageSize };
}
/** Reject malformed sets before sorting; no deduplication, coercion or unknown-to-empty conversion. */
export function parseProductSeasonIds(input: unknown): readonly string[] | null {
  if (input === null) return null;
  if (!Array.isArray(input) || Object.keys(input).length !== input.length) invalid();
  const result: string[] = [], seen = new Set<string>();
  for (const value of input) { const key = id(value)!; if (seen.has(key)) invalid(); seen.add(key); result.push(key); }
  return Object.freeze(result.sort());
}
function values(input: unknown, version: 1 | 2): ProductWriteValues | ProductWriteValuesV2 {
  const r = bag(input, ["productCode", "name", "categoryId", "supplierId", version === 2 ? "seasonIds" : "seasonId", "sizeGroupId", "year", "systemItemCode", "thickness", "collarPantsType", "defaultBarcodeSchemeId", "enabled", "prices"]);
  if (r.year !== null && (typeof r.year !== "number" || !Number.isInteger(r.year) || r.year < -2147483648 || r.year > 2147483647)) invalid();
  return Object.freeze({ productCode: text(r.productCode)!, name: text(r.name)!, categoryId: id(r.categoryId)!, supplierId: id(r.supplierId, true),
    ...(version === 2 ? { seasonIds: parseProductSeasonIds(r.seasonIds) } : { seasonId: id(r.seasonId, true) }), sizeGroupId: id(r.sizeGroupId)!, year: r.year as number | null, systemItemCode: text(r.systemItemCode, true),
    thickness: text(r.thickness, true), collarPantsType: text(r.collarPantsType, true), defaultBarcodeSchemeId: id(r.defaultBarcodeSchemeId, true),
    enabled: bool(r.enabled), prices: validateCompleteCataloguePrices(r.prices) });
}
function parseCommand(input: unknown, version: 1 | 2): ProductMaintenanceCommand | ProductMaintenanceCommandV2 {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid(); const action = (input as Record<string, unknown>).action;
  if (!["CREATE", "EDIT", "DISABLE", "RESTORE", "DELETE"].includes(action as string)) invalid();
  const full = action === "CREATE" || action === "EDIT";
  const keys = ["action", "requestKey", ...(action === "CREATE" ? [] : ["id", "expectedVersion"]), ...(full ? ["values", "skus", "barcodes"] : [])];
  const r = bag(input, keys), requestKey = partyRequestKey(r.requestKey);
  if (!full) return { action: action as "DISABLE" | "RESTORE" | "DELETE", requestKey, id: id(r.id)!, expectedVersion: productMaintenanceVersion(r.expectedVersion) };
  const data = values(r.values, version);
  requireDomain(action !== "CREATE" || !("seasonIds" in data) || data.seasonIds !== null, "INVALID_PRODUCT_MAINTENANCE", "CREATE requires an explicit season array");
  requireDomain(action !== "CREATE" || data.defaultBarcodeSchemeId !== null, "PRODUCT_SCHEME_REQUIRED", "New product requires an explicit real default scheme");
  requireDomain(action !== "CREATE" || (/^[A-Za-z0-9_-]+$/.test(data.productCode) && data.supplierId !== null && ("seasonIds" in data || data.seasonId !== null)
    && data.year !== null && data.systemItemCode !== null), "PRODUCT_REQUIRED_FIELDS", "New product requires the frozen Demo's code, supplier, year, season and system code");
  if (!Array.isArray(r.skus) || !Array.isArray(r.barcodes)) invalid();
  requireDomain(r.skus.length <= PRODUCT_MAINTENANCE_MAX_SKUS && r.barcodes.length <= PRODUCT_MAINTENANCE_MAX_BARCODES,
    "PRODUCT_MAINTENANCE_TOO_LARGE", "Product command exceeds technical bound");
  const coordinates = new Set<string>(), skuIds = new Set<string>();
  const skus: ProductSkuInput[] = r.skus.map(value => {
    const s = bag(value, ["id", "expectedVersion", "skuCode", "colorId", "fitId", "sizeId", "enabled"]), skuId = id(s.id, true);
    if ((skuId === null) !== (s.expectedVersion === null)) invalid();
    const colorId = id(s.colorId)!, fitId = id(s.fitId)!, sizeId = id(s.sizeId)!, key = JSON.stringify([colorId, fitId, sizeId]);
    requireDomain(!coordinates.has(key) && (skuId === null || !skuIds.has(skuId)), "PRODUCT_SPEC_CONFLICT", "Repeated actual SKU identity/coordinate");
    coordinates.add(key); if (skuId !== null) skuIds.add(skuId);
    return { id: skuId, expectedVersion: s.expectedVersion === null ? null : productMaintenanceVersion(s.expectedVersion), skuCode: text(s.skuCode)!, colorId, fitId, sizeId, enabled: bool(s.enabled) };
  });
  requireDomain(action !== "CREATE" || skus.length > 0, "PRODUCT_SPEC_REQUIRED", "New product requires an explicit actual SKU");
  const raw = new Set<string>(), barcodeIds = new Set<string>();
  const barcodes: ProductBarcodeInput[] = r.barcodes.map(value => {
    const b = bag(value, ["id", "barcode", "colorId", "fitId", "sizeId", "kind", "schemeId", "enabled"]), barcodeId = id(b.id, true);
    if (typeof b.barcode !== "string" || b.barcode.length === 0 || b.barcode.includes("\0") || !["MAIN", "CONFIRMED_OLD"].includes(b.kind as string)) invalid();
    requireDomain(!raw.has(b.barcode) && (barcodeId === null || !barcodeIds.has(barcodeId)), "BARCODE_CONFLICT", "Repeated raw barcode identity");
    raw.add(b.barcode); if (barcodeId !== null) barcodeIds.add(barcodeId);
    return { id: barcodeId, barcode: b.barcode, colorId: id(b.colorId)!, fitId: id(b.fitId)!, sizeId: id(b.sizeId)!, kind: b.kind as "MAIN" | "CONFIRMED_OLD", schemeId: id(b.schemeId, true), enabled: bool(b.enabled) };
  });
  if (action === "CREATE") return { action, requestKey, values: data, skus, barcodes } as ProductMaintenanceCommand | ProductMaintenanceCommandV2;
  return { action: "EDIT", requestKey, id: id(r.id)!, expectedVersion: productMaintenanceVersion(r.expectedVersion), values: data, skus, barcodes } as ProductMaintenanceCommand | ProductMaintenanceCommandV2;
}

export function parseProductMaintenanceCommand(input: unknown): ProductMaintenanceCommand { return parseCommand(input, 1) as ProductMaintenanceCommand; }
export function parseProductMaintenanceCommandV2(input: unknown): ProductMaintenanceCommandV2 { return parseCommand(input, 2) as ProductMaintenanceCommandV2; }

/** Separate explicit extension: the old parser/output/hash never gains a synthesized empty array. */
export function parseProductMaintenanceMediaCommandV2(input: unknown): ProductMaintenanceMediaCommandV2 {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
    const r = input as Record<string, unknown>;
    if (r.action !== "CREATE" && r.action !== "EDIT") invalid();
    bag(r, ["action", "requestKey", ...(r.action === "EDIT" ? ["id", "expectedVersion"] : []), "values", "skus", "barcodes", "imageChanges"]);
    const { imageChanges, ...old } = r, legacy = parseProductMaintenanceCommandV2(old);
    if (legacy.action !== "CREATE" && legacy.action !== "EDIT") invalid();
    if (!Array.isArray(imageChanges) || imageChanges.length > 1000 || Object.keys(imageChanges).length !== imageChanges.length) invalid();
    const seen = new Set<string>();
    const changes: ProductImageChange[] = imageChanges.map(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); const action = (value as Record<string, unknown>).action;
      if (!["ADD", "REPLACE", "EDIT_METADATA", "REMOVE"].includes(action as string)) invalid();
      const v = bag(value, ["action", ...(action !== "ADD" ? ["id", "expectedVersion"] : []), ...(action === "ADD" || action === "REPLACE" ? ["uploadId"] : []), ...(action !== "REMOVE" ? ["role", "colorId", "displayOrder"] : [])]);
      const existing = action === "ADD" ? null : id(v.id)!;
      if (existing !== null) { if (seen.has(existing)) invalid(); seen.add(existing); }
      const base = existing === null ? {} : { id: existing, expectedVersion: productMaintenanceVersion(v.expectedVersion) };
      if (action === "REMOVE") return { action, ...base } as ProductImageChange;
      if (v.role !== null && !["MAIN", "WHITE_BACKGROUND", "HANG_TAG", "DETAIL", "COLOR"].includes(v.role as string) || action === "ADD" && v.role === null) invalid();
      const colorId = id(v.colorId, true);
      if ((v.role === "COLOR") !== (colorId !== null) || typeof v.displayOrder !== "number" || !Number.isInteger(v.displayOrder) || v.displayOrder < -2147483648 || v.displayOrder > 2147483647) invalid();
      return { action, ...base, ...(action === "ADD" || action === "REPLACE" ? { uploadId: id(v.uploadId)! } : {}), role: v.role, colorId, displayOrder: v.displayOrder } as ProductImageChange;
    });
    return { ...legacy, imageChanges: Object.freeze(changes) };
  } catch { throw new DomainError("INVALID_PRODUCT_MEDIA_COMMAND", "Invalid explicit product image changes"); }
}
/** Immediate partial unique indexes permit acyclic moves only; never invent a temporary role. */
export function orderProductImageWrites(before: readonly ProductMaintenanceImageMetadata[], after: readonly ProductMaintenanceImageMetadata[]): readonly ProductMaintenanceImageMetadata[] {
  const old = new Map(before.map(i => [i.id, i])), occupied = new Map(before.filter(i => i.role === "COLOR").map(i => [i.colorId!, i.id]));
  const nextIds = new Set(after.map(i => i.id)); for (const i of before) if (!nextIds.has(i.id) && i.role === "COLOR") occupied.delete(i.colorId!);
  const pending = [...after], ordered: ProductMaintenanceImageMetadata[] = [];
  while (pending.length) {
    const index = pending.findIndex(i => i.role !== "COLOR" || !occupied.has(i.colorId!) || occupied.get(i.colorId!) === i.id);
    requireDomain(index >= 0, "PRODUCT_MEDIA_NOT_READY", "Circular color-image reassignment requires an approved database protocol");
    const i = pending.splice(index, 1)[0]!, previous = old.get(i.id);
    if (previous?.role === "COLOR") occupied.delete(previous.colorId!);
    if (i.role === "COLOR") occupied.set(i.colorId!, i.id); ordered.push(i);
  }
  return ordered;
}
