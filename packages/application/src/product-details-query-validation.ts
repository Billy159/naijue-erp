import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId, quantity } from "../../domain/src/values.ts";
import { checkedProductActor, parseProductQuery } from "./product-query-validation.ts";
import type { ProductDetailsPageQuery, ProductDetailsReadIntent, ProductDetailsScopedRead, ProductWarehouseStockPage } from "./product-details-query-ports.ts";

export function invalidProductDetailsQuery(): never { throw new DomainError("INVALID_PRODUCT_DETAILS_QUERY", "Invalid product detail parameters"); }
export function parseProductDetailsPageQuery(value: unknown): ProductDetailsPageQuery {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidProductDetailsQuery();
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length !== 3 || !["productId", "page", "pageSize"].every(key => Object.hasOwn(row, key))) invalidProductDetailsQuery();
  const { productId } = parseProductQuery({ productId: row.productId });
  if (typeof row.page !== "number" || !Number.isSafeInteger(row.page) || row.page < 1
    || (row.pageSize !== 20 && row.pageSize !== 50 && row.pageSize !== 100)
    || !Number.isSafeInteger((row.page - 1) * row.pageSize)) invalidProductDetailsQuery();
  return Object.freeze({ productId, page: row.page, pageSize: row.pageSize });
}
export function checkedProductDetailsScope<P extends ProductDetailsScopedRead>(read: P): P {
  checkedProductActor(read.actor);
  requireDomain(read.signal instanceof AbortSignal && !read.signal.aborted, "PRODUCT_READ_ABORTED", "Product read is no longer active");
  const kind = read.intent?.kind;
  requireDomain(kind === "prices" || kind === "barcodes" || kind === "stock", "INVALID_PRODUCT_DETAILS_QUERY", "Invalid product tab");
  const parameters = kind === "prices" ? parseProductQuery(read.parameters) : parseProductDetailsPageQuery(read.parameters);
  const intended = kind === "prices" ? parseProductQuery(read.intent.parameters) : parseProductDetailsPageQuery(read.intent.parameters);
  requireDomain(JSON.stringify(parameters) === JSON.stringify(intended), "FORBIDDEN", "Intent and product parameters differ");
  const grant = read.grant;
  requireDomain(grant && Reflect.ownKeys(grant).length === 2 && Object.hasOwn(grant, "kind") && Object.hasOwn(grant, "productId")
    && grant.kind === kind && grant.productId === parameters.productId, "FORBIDDEN", "Exact per-tab product grant required");
  return read;
}
export function checkedProductStockPage(value: ProductWarehouseStockPage, parameters: ProductDetailsPageQuery): ProductWarehouseStockPage {
  requireDomain(value && value.productId === parameters.productId && value.page === parameters.page && value.pageSize === parameters.pageSize
    && Number.isSafeInteger(value.total) && value.total >= 0 && Array.isArray(value.items)
    && value.items.length === Math.min(parameters.pageSize, Math.max(0, value.total - (parameters.page - 1) * parameters.pageSize)),
  "INVALID_DATABASE_VALUE", "Invalid trusted product stock page");
  const keys = new Set<string>();
  const items = value.items.map(item => {
    entityId("warehouse", item.warehouseId); entityId("sku", item.skuId);
    requireDomain(typeof item.warehouseName === "string" && item.warehouseName.trim().length > 0, "INVALID_DATABASE_VALUE", "Missing warehouse label");
    const key = JSON.stringify([item.warehouseId, item.skuId]);
    requireDomain(!keys.has(key), "INVALID_DATABASE_VALUE", "Duplicate warehouse/SKU stock identity"); keys.add(key);
    if (item.state === "KNOWN") { requireDomain(typeof item.quantity === "string", "INVALID_DATABASE_VALUE", "Exact known quantity required"); quantity(item.quantity); }
    else requireDomain(["UNKNOWN", "MISSING", "UNMAPPED", "READ_FAILED"].includes(item.state) && item.quantity === null, "INVALID_DATABASE_VALUE", "Unknown stock cannot carry a guessed quantity");
    return { warehouseId: item.warehouseId, warehouseName: item.warehouseName, skuId: item.skuId, quantity: item.quantity, state: item.state };
  });
  // Do not serialize additional private provider/driver properties from the inventory adapter.
  return { productId: value.productId, page: value.page, pageSize: value.pageSize, total: value.total, items };
}
export function productDetailsIntent(kind: "prices", parameters: ReturnType<typeof parseProductQuery>): ProductDetailsReadIntent;
export function productDetailsIntent(kind: "barcodes" | "stock", parameters: ProductDetailsPageQuery): ProductDetailsReadIntent;
export function productDetailsIntent(kind: ProductDetailsReadIntent["kind"], parameters: ReturnType<typeof parseProductQuery> | ProductDetailsPageQuery): ProductDetailsReadIntent {
  if (kind === "prices") return Object.freeze({ kind, parameters });
  return Object.freeze({ kind, parameters: parameters as ProductDetailsPageQuery });
}
