import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId, quantity } from "../../domain/src/values.ts";
import { checkedProductActor, parseProductQuery } from "./product-query-validation.ts";
import type { ProductBarcodePage, ProductBarcodeQuery, ProductDefaultScheme, ProductDetailsPageQuery, ProductDetailsReadIntent, ProductDetailsScopedRead, ProductWarehouseStockPage, ProductStockOverviewQuery, ProductStockOverviewScopedRead, ProductStockOverviewResult, ProductStockOverviewItem } from "./product-details-query-ports.ts";

export function checkedProductDefaultScheme(value: unknown): ProductDefaultScheme {
  requireDomain(value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.hasOwn(value, "state"),
    "INVALID_DATABASE_VALUE", "Invalid product default scheme response");
  const row = value as Record<string, unknown>, keys = Reflect.ownKeys(row);
  if (row.state === "NOT_SET" && keys.length === 1) return { state: "NOT_SET" };
  if (row.state === "UNAVAILABLE" && keys.length === 2 && Object.hasOwn(row, "reason") && row.reason === "NO_PRODUCT_SCHEME_FIELD")
    return { state: "UNAVAILABLE", reason: "NO_PRODUCT_SCHEME_FIELD" };
  requireDomain(row.state === "AVAILABLE" && keys.length === 2 && Object.hasOwn(row, "schemeId") && typeof row.schemeId === "string",
    "INVALID_DATABASE_VALUE", "Invalid product default scheme response");
  return { state: "AVAILABLE", schemeId: entityId("product", row.schemeId) };
}

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
export function parseProductBarcodeQuery(value: unknown): ProductBarcodeQuery {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidProductDetailsQuery();
  const row = value as Record<string, unknown>, filtered = Object.hasOwn(row, "skuId");
  if (Reflect.ownKeys(row).length !== (filtered ? 4 : 3) || !["productId", "page", "pageSize"].every(key => Object.hasOwn(row, key))) invalidProductDetailsQuery();
  const p = parseProductDetailsPageQuery({ productId: row.productId, page: row.page, pageSize: row.pageSize });
  if (!filtered) return p;
  let skuId: string;
  try { if (typeof row.skuId !== "string") return invalidProductDetailsQuery(); skuId = entityId("sku", row.skuId); }
  catch { return invalidProductDetailsQuery(); }
  return Object.freeze({ ...p, skuId });
}
export function checkedProductBarcodeResult(value: ProductBarcodePage, parameters: ProductBarcodeQuery): ProductBarcodePage {
  requireDomain(Object.hasOwn(value, "skuId") === Object.hasOwn(parameters, "skuId")
    && (parameters.skuId === undefined || value.skuId === parameters.skuId && Array.isArray(value.items) && value.items.every(item => item.skuId === parameters.skuId)),
    "INVALID_DATABASE_VALUE", "Barcode response differs from the requested SKU scope");
  return { ...value, defaultScheme: checkedProductDefaultScheme(value.defaultScheme) };
}
export function checkedProductDetailsScope<P extends ProductDetailsScopedRead>(read: P): P {
  checkedProductActor(read.actor);
  requireDomain(read.signal instanceof AbortSignal && !read.signal.aborted, "PRODUCT_READ_ABORTED", "Product read is no longer active");
  const kind = read.intent?.kind;
  requireDomain(kind === "prices" || kind === "barcodes" || kind === "stock", "INVALID_PRODUCT_DETAILS_QUERY", "Invalid product tab");
  const parse = kind === "prices" ? parseProductQuery : kind === "barcodes" ? parseProductBarcodeQuery : parseProductDetailsPageQuery;
  const parameters = parse(read.parameters), intended = parse(read.intent.parameters);
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
export function productDetailsIntent(kind: "barcodes", parameters: ProductBarcodeQuery): ProductDetailsReadIntent;
export function productDetailsIntent(kind: "stock", parameters: ProductDetailsPageQuery): ProductDetailsReadIntent;
export function productDetailsIntent(kind: ProductDetailsReadIntent["kind"], parameters: ReturnType<typeof parseProductQuery> | ProductDetailsPageQuery): ProductDetailsReadIntent {
  if (kind === "prices") return Object.freeze({ kind, parameters });
  return Object.freeze({ kind, parameters: parameters as ProductDetailsPageQuery });
}

export function parseProductStockOverviewQuery(value: unknown): ProductStockOverviewQuery {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidProductDetailsQuery();
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length !== 2 || !["productId", "warehouseMode"].every(key => Object.hasOwn(row, key))
    || (row.warehouseMode !== "NON_ZERO" && row.warehouseMode !== "ALL")) invalidProductDetailsQuery();
  const { productId } = parseProductQuery({ productId: row.productId });
  return Object.freeze({ productId, warehouseMode: row.warehouseMode });
}
export function checkedProductStockOverviewScope(read: ProductStockOverviewScopedRead): ProductStockOverviewScopedRead {
  checkedProductActor(read.actor);
  requireDomain(read.signal instanceof AbortSignal && !read.signal.aborted, "PRODUCT_READ_ABORTED", "Product read is no longer active");
  requireDomain(read.intent?.kind === "stock-overview", "FORBIDDEN", "Explicit stock overview intent required");
  const p = parseProductStockOverviewQuery(read.parameters), intended = parseProductStockOverviewQuery(read.intent.parameters), grant = read.grant;
  requireDomain(p.productId === intended.productId && p.warehouseMode === intended.warehouseMode && grant
    && Reflect.ownKeys(grant).length === 2 && Object.hasOwn(grant, "kind") && Object.hasOwn(grant, "productId")
    && grant.kind === "stock" && grant.productId === p.productId, "FORBIDDEN", "Exact original stock-tab grant required");
  return read;
}
function overviewData(ok: unknown): asserts ok { requireDomain(ok, "INVALID_PRODUCT_STOCK_OVERVIEW_DATA", "Controlled whole-scope stock overview is inconsistent"); }
function overviewObject(value: unknown): Record<string, unknown> {
  overviewData(value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  return value as Record<string, unknown>;
}
function overviewCount(value: unknown, limit: number): number { overviewData(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= limit); return value; }
function overviewQuantity(value: unknown): string {
  overviewData(typeof value === "string" && value.length <= 100 && /^(?:0|-?[1-9]\d*)$/.test(value)); return value;
}
/** Validates the complete producer result without recomputing inventory or guessing missing rows. */
export function checkedProductStockOverviewResult(value: unknown, parameters: ProductStockOverviewQuery): ProductStockOverviewResult {
  const r = overviewObject(value), c = overviewObject(r.counts), t = overviewObject(r.total);
  overviewData(r.kind === "PRODUCT_STOCK_OVERVIEW_V1" && r.productId === parameters.productId && r.warehouseMode === parameters.warehouseMode
    && (r.coverage === "ALL_BUSINESS_WAREHOUSES" || r.coverage === "AUTHORIZED_SUBSET")
    && typeof r.readReference === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(r.readReference));
  const authorizedWarehouses = overviewCount(c.authorizedWarehouses, 1000), nonZeroWarehouses = overviewCount(c.nonZeroWarehouses, 1000),
    zeroWarehouses = overviewCount(c.zeroWarehouses, 1000), unknownWarehouses = overviewCount(c.unknownWarehouses, 1000), returnedWarehouses = overviewCount(c.returnedWarehouses, 1000);
  overviewData(authorizedWarehouses > 0 && authorizedWarehouses === nonZeroWarehouses + zeroWarehouses + unknownWarehouses
    && returnedWarehouses === (parameters.warehouseMode === "ALL" ? authorizedWarehouses : nonZeroWarehouses + unknownWarehouses)
    && Array.isArray(r.items) && r.items.length === returnedWarehouses);
  let knownSum = 0n, actualZero = 0, actualNonZero = 0, actualUnknown = 0, unknownKeys = 0; const ids = new Set<string>();
  const items = r.items.map((input): ProductStockOverviewItem => {
    const i = overviewObject(input); overviewData(typeof i.warehouseId === "string");
    try { entityId("warehouse", i.warehouseId); } catch { overviewData(false); }
    overviewData(!ids.has(i.warehouseId) && typeof i.warehouseName === "string" && i.warehouseName.trim().length > 0
      && i.warehouseName.length <= 2048 && !i.warehouseName.includes("\0")); ids.add(i.warehouseId);
    const unknownSkuCount = overviewCount(i.unknownSkuCount, 1_000_000); let quantity: string | null;
    if (i.state === "KNOWN") {
      overviewData(unknownSkuCount === 0); quantity = overviewQuantity(i.quantity); knownSum += BigInt(quantity);
      if (quantity === "0") actualZero++; else actualNonZero++;
      overviewData(parameters.warehouseMode === "ALL" || quantity !== "0");
    } else {
      overviewData(i.state === "UNKNOWN" && i.quantity === null && unknownSkuCount > 0); quantity = null; actualUnknown++; unknownKeys += unknownSkuCount;
    }
    return { warehouseId: i.warehouseId, warehouseName: i.warehouseName, state: i.state, quantity, unknownSkuCount };
  });
  overviewData(actualNonZero === nonZeroWarehouses && actualUnknown === unknownWarehouses
    && actualZero === (parameters.warehouseMode === "ALL" ? zeroWarehouses : 0));
  const unknownSkuWarehouseKeys = overviewCount(t.unknownSkuWarehouseKeys, 1_000_000);
  overviewData(unknownKeys === unknownSkuWarehouseKeys);
  let quantity: string | null;
  if (unknownWarehouses === 0) { overviewData(t.state === "KNOWN" && unknownSkuWarehouseKeys === 0); quantity = overviewQuantity(t.quantity); overviewData(BigInt(quantity) === knownSum); }
  else { overviewData(t.state === "UNKNOWN" && t.quantity === null && unknownSkuWarehouseKeys > 0); quantity = null; }
  return { kind: "PRODUCT_STOCK_OVERVIEW_V1", productId: parameters.productId, warehouseMode: parameters.warehouseMode,
    readReference: r.readReference, coverage: r.coverage, counts: { authorizedWarehouses, nonZeroWarehouses, zeroWarehouses, unknownWarehouses, returnedWarehouses },
    total: { state: t.state, quantity, unknownSkuWarehouseKeys }, items };
}
