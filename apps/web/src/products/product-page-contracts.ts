import type { RouteStylesheet } from '../application/contracts.ts';
import type { ProductReadOnlyReader, ProductParameters } from '../inventory/product-contracts.ts';
import type { QueryRead } from '../loading/latest-query.ts';
import type { ProductBarcodePage, ProductDetailsPageQuery, ProductPriceDetails, ProductWarehouseStockPage } from '../../../../packages/application/src/product-details-query-ports.ts';

export const productReadOnlyPageTabs = ['base', 'specs', 'barcodes', 'prices', 'images', 'stock'] as const;
export type ProductReadOnlyPageTab = typeof productReadOnlyPageTabs[number];
/** Each capability is explicit, target-only and independently authorized by its
 * provider. New ports remain absent until the host explicitly composes them. */
export interface ProductFullPageReadOnlyReader {
  readonly base?: { readonly read: ProductReadOnlyReader['readProductBasics'] };
  readonly specs?: { readonly read: ProductReadOnlyReader['readProductSpecifications'] };
  readonly barcodes?: { readonly read: (read: QueryRead<ProductDetailsPageQuery>) => Promise<ProductBarcodePage | null> };
  readonly prices?: { readonly read: (read: QueryRead<ProductParameters>) => Promise<ProductPriceDetails | null> };
  readonly stock?: { readonly read: (read: QueryRead<ProductDetailsPageQuery>) => Promise<ProductWarehouseStockPage | null> };
  readonly images?: { readonly read: ProductReadOnlyReader['readProductImages']; readonly readImage: ProductReadOnlyReader['readProductImage'] };
}
export interface ProductFullPageConfiguration {
  readonly stylesheet: RouteStylesheet;
  readonly allowedTabs: readonly ProductReadOnlyPageTab[];
  readonly initialTab: ProductReadOnlyPageTab;
  readonly reader: ProductFullPageReadOnlyReader;
}
/** Explicit host adapter for the EXISTING four product reads. It does not
 * manufacture missing ports or imply any new backend permission. */
export function existingProductFullPageReader(reader: ProductReadOnlyReader): ProductFullPageReadOnlyReader {
  return { base: { read: read => reader.readProductBasics(read) }, specs: { read: read => reader.readProductSpecifications(read) },
    images: { read: read => reader.readProductImages(read), readImage: read => reader.readProductImage(read) } };
}
export function productPageTabAvailable(reader: ProductFullPageReadOnlyReader, tab: ProductReadOnlyPageTab): boolean {
  return !!reader[tab];
}
