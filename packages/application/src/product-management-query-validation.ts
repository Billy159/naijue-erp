import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { EntityKind } from "../../domain/src/values.ts";
import type { ProductManagementCandidateKind, ProductManagementCandidatePage, ProductManagementCandidateQuery, ProductManagementListPage,
  ProductManagementListQuery, ProductManagementReadGrant } from "./product-management-query-ports.ts";

export const PRODUCT_MANAGEMENT_MAX_SELECTIONS = 200;

export function invalidProductManagementQuery(): never { throw new DomainError("INVALID_PRODUCT_MANAGEMENT_QUERY", "Invalid product management read parameters"); }
export function productManagementRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) invalidProductManagementQuery();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) invalidProductManagementQuery();
  return value;
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value); }
function id(kind: EntityKind, value: unknown): string { try { return entityId(kind, text(value, 36)); } catch { return invalidProductManagementQuery(); } }
function year(value: unknown): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < -2147483648 || Number(value) > 2147483647) invalidProductManagementQuery();
  return value;
}
function values(value: unknown, parse: (value: unknown) => string, maximum = PRODUCT_MANAGEMENT_MAX_SELECTIONS): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) invalidProductManagementQuery();
  const result = value.map(parse); if (new Set(result).size !== result.length) invalidProductManagementQuery();
  return Object.freeze(result);
}
function page(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) invalidProductManagementQuery(); return value;
}
function pageSize(value: unknown): 100 | 200 | 500 { if (value !== 100 && value !== 200 && value !== 500) invalidProductManagementQuery(); return value; }
const kinds = ["product", "category", "year", "season", "supplier", "fit", "thickness", "shape"] as const;
function candidateKind(value: unknown): ProductManagementCandidateKind { if (!kinds.includes(value as ProductManagementCandidateKind)) invalidProductManagementQuery(); return value as ProductManagementCandidateKind; }
function candidateId(kind: ProductManagementCandidateKind, value: unknown): string {
  return kind === "year" ? year(value) : kind === "thickness" || kind === "shape" ? text(value, 100) : id(kind, value);
}
export function parseProductManagementListQuery(value: unknown): ProductManagementListQuery {
  const row = productManagementRecord(value, ["filter", "page", "pageSize"]);
  const filter = productManagementRecord(row.filter, ["productIds", "categoryIds", "years", "seasonIds", "supplierIds", "fitIds", "thicknesses", "shapeCodes"]);
  return Object.freeze({ page: page(row.page), pageSize: pageSize(row.pageSize), filter: Object.freeze({
    productIds: values(filter.productIds, value => id("product", value)), categoryIds: values(filter.categoryIds, value => id("category", value)),
    years: values(filter.years, year), seasonIds: values(filter.seasonIds, value => id("season", value)),
    supplierIds: values(filter.supplierIds, value => id("supplier", value)), fitIds: values(filter.fitIds, value => id("fit", value)),
    thicknesses: values(filter.thicknesses, value => text(value, 100)), shapeCodes: values(filter.shapeCodes, value => text(value, 100))
  }) });
}
export function parseProductManagementCandidateQuery(value: unknown): ProductManagementCandidateQuery {
  const row = productManagementRecord(value, ["kind", "search", "selectedIds", "page", "pageSize"]), kind = candidateKind(row.kind);
  if (typeof row.search !== "string" || row.search.length > 100 || /[\u0000-\u001f\u007f]/.test(row.search) || row.pageSize !== 20) invalidProductManagementQuery();
  const selectedIds = values(row.selectedIds, value => candidateId(kind, value));
  if (selectedIds.length && row.search !== "") invalidProductManagementQuery();
  return Object.freeze({ kind, search: row.search, selectedIds, page: page(row.page), pageSize: 20 });
}
export function checkedProductManagementGrant(value: unknown): ProductManagementReadGrant {
  try {
    if (!value || typeof value !== "object" || !("kind" in value)) throw new Error();
    const row = productManagementRecord(value, value.kind === "all" ? ["kind", "totalStock"] : ["kind", "productIds", "totalStock"]);
    if ((row.kind !== "all" && row.kind !== "products") || (row.totalStock !== "unavailable" && row.totalStock !== "all-warehouses")) throw new Error();
    if (row.kind === "all") return Object.freeze({ kind: "all", totalStock: row.totalStock });
    const productIds = values(row.productIds, value => id("product", value), 10_000); if (!productIds.length) throw new Error();
    return Object.freeze({ kind: "products", productIds, totalStock: row.totalStock });
  } catch { throw new DomainError("FORBIDDEN", "No explicit product management grant"); }
}
export function activeProductManagementRead(signal: AbortSignal): void {
  if (signal.aborted) throw new DomainError("PRODUCT_MANAGEMENT_READ_ABORTED", "Product management read is no longer active");
}
function exactTotal(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidProductManagementQuery(); return value; }
function exactQuantity(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 100 || !/^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value)) invalidProductManagementQuery(); return value;
}
function retailPrice(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)) invalidProductManagementQuery(); return value;
}
export function checkedProductManagementListPage(value: unknown): ProductManagementListPage {
  const row = productManagementRecord(value, ["page", "pageSize", "exactTotal", "items"]), size = pageSize(row.pageSize), total = exactTotal(row.exactTotal);
  const pageNumber = page(row.page);
  if (!Array.isArray(row.items) || row.items.length !== Math.min(size, Math.max(0, total - (pageNumber - 1) * size))) invalidProductManagementQuery();
  const items = row.items.map(value => {
    const item = productManagementRecord(value, ["id", "code", "name", "categoryLabel", "year", "seasonLabel", "supplierLabel", "fits", "thickness", "retailPrice", "totalStock"]);
    if (!Array.isArray(item.fits) || item.fits.length > 1000) invalidProductManagementQuery();
    const fits = item.fits.map(value => { const fit = productManagementRecord(value, ["id", "label"]); return Object.freeze({ id: id("fit", fit.id), label: text(fit.label) }); });
    if (new Set(fits.map(fit => fit.id)).size !== fits.length || (item.year !== null && (typeof item.year !== "number" || String(Number(year(String(item.year)))) !== String(item.year)))) invalidProductManagementQuery();
    return Object.freeze({ id: id("product", item.id), code: text(item.code), name: text(item.name), categoryLabel: nullableText(item.categoryLabel),
      year: item.year as number | null, seasonLabel: nullableText(item.seasonLabel), supplierLabel: nullableText(item.supplierLabel), fits: Object.freeze(fits),
      thickness: nullableText(item.thickness), retailPrice: retailPrice(item.retailPrice), totalStock: exactQuantity(item.totalStock) });
  });
  if (new Set(items.map(item => item.id)).size !== items.length) invalidProductManagementQuery();
  return Object.freeze({ page: pageNumber, pageSize: size, exactTotal: total, items: Object.freeze(items) });
}
export function checkedProductManagementCandidatePage(value: unknown, kind: ProductManagementCandidateKind): ProductManagementCandidatePage {
  const row = productManagementRecord(value, ["page", "pageSize", "exactTotal", "items"]), total = exactTotal(row.exactTotal);
  const pageNumber = page(row.page);
  if (row.pageSize !== 20 || !Array.isArray(row.items) || row.items.length !== Math.min(20, Math.max(0, total - (pageNumber - 1) * 20))) invalidProductManagementQuery();
  const items = row.items.map(value => {
    const optionalCategoryKeys = kind === "category" && value && typeof value === "object" ? ["parentLabel", "depth"].filter(key => Object.hasOwn(value, key)) : [];
    const keys = kind === "product" ? ["id", "label", "code", "name"] : kind === "category" ? ["id", "label", "parentId", ...optionalCategoryKeys] : ["id", "label"];
    const item = productManagementRecord(value, keys), base = { id: candidateId(kind, item.id), label: text(item.label) };
    if (kind === "category" && Object.hasOwn(item, "depth") && item.depth !== 0 && item.depth !== 1) invalidProductManagementQuery();
    return Object.freeze(kind === "product" ? { ...base, code: text(item.code), name: text(item.name) }
      : kind === "category" ? { ...base, parentId: item.parentId === null ? null : id("category", item.parentId),
        ...(Object.hasOwn(item, "parentLabel") ? { parentLabel: text(item.parentLabel) } : {}),
        ...(Object.hasOwn(item, "depth") ? { depth: item.depth as 0 | 1 } : {}) } : base);
  });
  if (new Set(items.map(item => item.id)).size !== items.length) invalidProductManagementQuery();
  return Object.freeze({ page: pageNumber, pageSize: 20, exactTotal: total, items: Object.freeze(items) });
}
