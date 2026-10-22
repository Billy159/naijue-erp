import type { ActorContext } from "./ports.ts";
import type { CompleteCataloguePrices } from "./catalogue-price-input.ts";
import type { ProductQuery } from "./product-query-ports.ts";

export type ProductDetailsPageSize = 20 | 50 | 100;
export interface ProductDetailsPageQuery extends ProductQuery { readonly page: number; readonly pageSize: ProductDetailsPageSize }
export type ProductDetailsReadIntent =
  | { readonly kind: "prices"; readonly parameters: ProductQuery }
  | { readonly kind: "barcodes" | "stock"; readonly parameters: ProductDetailsPageQuery };
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
export interface ProductBarcodePage {
  readonly productId: string; readonly version: number; readonly page: number; readonly pageSize: ProductDetailsPageSize;
  readonly total: number; readonly items: readonly ProductBarcodeDetails[];
  /** There is no product-level scheme field in schema1–19. Never infer it from a binding. */
  readonly defaultScheme: { readonly state: "UNAVAILABLE"; readonly reason: "NO_PRODUCT_SCHEME_FIELD" };
}
export interface ProductWarehouseStockItem {
  readonly warehouseId: string; readonly warehouseName: string; readonly skuId: string;
  readonly quantity: string | null; readonly state: "KNOWN" | "UNKNOWN" | "MISSING" | "UNMAPPED" | "READ_FAILED";
}
export interface ProductWarehouseStockPage {
  readonly productId: string; readonly page: number; readonly pageSize: ProductDetailsPageSize;
  readonly total: number; readonly items: readonly ProductWarehouseStockItem[];
}
export interface ProductDetailsSnapshotReader {
  readPrices(read: ProductDetailsScopedRead<ProductQuery>): Promise<ProductPriceDetails | null>;
  readBarcodes(read: ProductDetailsScopedRead<ProductDetailsPageQuery>): Promise<ProductBarcodePage | null>;
}
/** D3-owned reader. It MUST independently authorize the current inventory/warehouse scope and
 * certify SKU membership/publication/admission before returning a known zero. A product grant
 * alone grants no warehouse access. D2 never implements stock SQL or synthesizes absent rows. */
export interface ProductWarehouseStockReader {
  readStock(read: ProductDetailsScopedRead<ProductDetailsPageQuery>): Promise<ProductWarehouseStockPage | null>;
}
export interface ProductDetailsQueryDependencies {
  readonly authorization: ProductDetailsQueryAuthorization; readonly reader: ProductDetailsSnapshotReader;
  /** Explicit availability; null produces 503 rather than fabricated inventory. */
  readonly stockReader: ProductWarehouseStockReader | null;
}
