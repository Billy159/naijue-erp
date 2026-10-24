import type { ActorContext } from "./ports.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
import type { ProductQuery } from "./product-query-ports.ts";

export type ProductDetailsPageSize = 20 | 50 | 100;
export interface ProductDetailsPageQuery extends ProductQuery { readonly page: number; readonly pageSize: ProductDetailsPageSize }
export interface ProductBarcodeRecordQuery extends ProductDetailsPageQuery { readonly skuId?: string; readonly view?: never }
export interface ProductBarcodeSkuQuery extends ProductDetailsPageQuery { readonly view: "SKU"; readonly skuId?: never }
export type ProductBarcodeQuery = ProductBarcodeRecordQuery | ProductBarcodeSkuQuery;
export type ProductDetailsReadIntent =
  | { readonly kind: "prices"; readonly parameters: ProductQuery }
  | { readonly kind: "barcodes"; readonly parameters: ProductBarcodeQuery }
  | { readonly kind: "stock"; readonly parameters: ProductDetailsPageQuery };
/** Explicit per-tab authority. A basics/drawer/candidate grant does not imply nine-price access. */
export interface ProductDetailsReadGrant { readonly kind: ProductDetailsReadIntent["kind"]; readonly productId: string }
export interface ProductDetailsQueryAuthorization {
  authorize(actor: ActorContext, intent: ProductDetailsReadIntent, signal: AbortSignal): Promise<ProductDetailsReadGrant>;
}
export interface ProductDetailsScopedRead<P extends ProductQuery = ProductQuery> {
  readonly actor: ActorContext; readonly intent: ProductDetailsReadIntent;
  readonly grant: ProductDetailsReadGrant; readonly parameters: P; readonly signal: AbortSignal;
}
export interface ProductPriceDetails {
  readonly productId: string; readonly version: number; readonly prices: CompleteCataloguePrices;
}
export interface ProductBarcodeDetails {
  readonly id: string; readonly barcode: string; readonly skuId: string; readonly skuCode: string;
  readonly colorId: string; readonly fitId: string; readonly sizeId: string;
  readonly kind: "MAIN" | "CONFIRMED_OLD"; readonly schemeId: string | null; readonly enabled: boolean;
}
export type ProductDefaultScheme =
  | { readonly state: "UNAVAILABLE"; readonly reason: "NO_PRODUCT_SCHEME_FIELD" }
  | { readonly state: "AVAILABLE"; readonly schemeId: string }
  | { readonly state: "NOT_SET" };
export interface ProductBarcodePage {
  readonly productId: string; readonly version: number; readonly page: number; readonly pageSize: ProductDetailsPageSize;
  readonly total: number; readonly items: readonly ProductBarcodeDetails[];
  /** Legacy schema1–19 is unavailable; verified native reads preserve the actual product FK or NULL. */
  readonly defaultScheme: ProductDefaultScheme;
  /** Present only for an explicitly SKU-scoped request, after verifying product membership. */
  readonly skuId?: string;
}
export type ProductBarcodeSummary = Pick<ProductBarcodeDetails, "id" | "barcode" | "kind" | "schemeId" | "enabled">;
export interface ProductBarcodeSkuRow {
  readonly skuId: string; readonly skuCode: string; readonly skuEnabled: boolean;
  readonly colorId: string; readonly colorLabel: string | null;
  readonly fitId: string; readonly fitLabel: string | null;
  readonly sizeId: string; readonly sizeLabel: string | null;
  readonly bindingCount: number; readonly main: ProductBarcodeSummary | null;
  readonly disabledMainCount: number; readonly confirmedOldCount: number; readonly firstConfirmedOld: ProductBarcodeSummary | null;
}
export interface ProductBarcodeSkuPage {
  readonly kind: "SKU_PAGE"; readonly productId: string; readonly version: number;
  readonly page: number; readonly pageSize: ProductDetailsPageSize; readonly totalSkus: number;
  readonly defaultScheme: ProductDefaultScheme; readonly items: readonly ProductBarcodeSkuRow[];
}
export type ProductBarcodeQueryResult = ProductBarcodePage | ProductBarcodeSkuPage;
export interface ProductWarehouseStockItem {
  readonly warehouseId: string; readonly warehouseName: string; readonly skuId: string;
  readonly quantity: string | null; readonly state: "KNOWN" | "UNKNOWN" | "MISSING" | "UNMAPPED" | "READ_FAILED";
}
export interface ProductWarehouseStockPage {
  readonly productId: string; readonly page: number; readonly pageSize: ProductDetailsPageSize;
  readonly total: number; readonly items: readonly ProductWarehouseStockItem[];
}
/** Whole authorized-warehouse overview, independent of the warehouse×SKU page. */
export interface ProductStockOverviewQuery extends ProductQuery { readonly warehouseMode: "NON_ZERO" | "ALL" }
export interface ProductStockOverviewScopedRead {
  readonly actor: ActorContext;
  readonly intent: { readonly kind: "stock-overview"; readonly parameters: ProductStockOverviewQuery };
  /** Original stock-tab authorization; overview does not widen the host's permission vocabulary. */
  readonly grant: ProductDetailsReadGrant;
  readonly parameters: ProductStockOverviewQuery; readonly signal: AbortSignal;
}
export interface ProductStockOverviewItem {
  readonly warehouseId: string; readonly warehouseName: string;
  readonly state: "KNOWN" | "UNKNOWN"; readonly quantity: string | null; readonly unknownSkuCount: number;
}
export interface ProductStockOverviewResult {
  readonly kind: "PRODUCT_STOCK_OVERVIEW_V1"; readonly productId: string;
  readonly warehouseMode: "NON_ZERO" | "ALL";
  readonly readReference: string; readonly coverage: "ALL_BUSINESS_WAREHOUSES" | "AUTHORIZED_SUBSET";
  readonly counts: { readonly authorizedWarehouses: number; readonly nonZeroWarehouses: number; readonly zeroWarehouses: number;
    readonly unknownWarehouses: number; readonly returnedWarehouses: number };
  readonly total: { readonly state: "KNOWN" | "UNKNOWN"; readonly quantity: string | null; readonly unknownSkuWarehouseKeys: number };
  readonly items: readonly ProductStockOverviewItem[];
}
export interface ProductDetailsSnapshotReader {
  readPrices(read: ProductDetailsScopedRead<ProductQuery>): Promise<ProductPriceDetails | null>;
  readBarcodes(read: ProductDetailsScopedRead<ProductBarcodeQuery>): Promise<ProductBarcodeQueryResult | null>;
}
/** D3-owned reader. It MUST independently authorize the current inventory/warehouse scope and
 * certify SKU membership/publication/admission before returning a known zero. A product grant
 * alone grants no warehouse access. D2 never implements stock SQL or synthesizes absent rows. */
export interface ProductWarehouseStockReader {
  readStock(read: ProductDetailsScopedRead<ProductDetailsPageQuery>): Promise<ProductWarehouseStockPage | null>;
  /** Optional for existing providers only. Missing overview returns 503; never aggregate old pages. */
  readOverview?(read: ProductStockOverviewScopedRead): Promise<ProductStockOverviewResult | null>;
}
export interface ProductDetailsQueryDependencies {
  readonly authorization: ProductDetailsQueryAuthorization; readonly reader: ProductDetailsSnapshotReader;
  /** Explicit availability; null produces 503 rather than fabricated inventory. */
  readonly stockReader: ProductWarehouseStockReader | null;
}
