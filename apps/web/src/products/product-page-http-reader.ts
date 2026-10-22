import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import { parseProductDetailsPageQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { existingProductFullPageReader, type ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
/** Explicit host composition remains inert and keeps product DTO validators out
 * of startup. Only the selected target/tab's first read loads the existing port. */
export function createProductFullPageHttpReader(options: HttpQueryOptions, details: readonly ('barcodes' | 'prices' | 'stock')[] = []): ProductFullPageReadOnlyReader {
  if (!Array.isArray(details) || details.some(tab => !['barcodes', 'prices', 'stock'].includes(tab)) || new Set(details).size !== details.length) throw new TypeError('Explicit supported product read tabs are required.');
  const enabled = new Set(details);
  const captured = Object.freeze({ ...options });
  const http = createHttpJsonQuery(captured);
  let pending: Promise<ProductReadOnlyReader> | null = null;
  const reader = () => pending ??= import('../transport/product-http-reader.ts').then(module => module.createProductHttpReader(captured)).catch(error => { pending = null; throw error; });
  const existing = existingProductFullPageReader({ readProductBasics: async read => (await reader()).readProductBasics(read),
    readProductSpecifications: async read => (await reader()).readProductSpecifications(read),
    readProductImages: async read => (await reader()).readProductImages(read), readProductImage: async read => (await reader()).readProductImage(read) });
  return Object.freeze({ ...existing,
    ...(enabled.has('prices') ? { prices: { read: async read => {
      const validation = await import('./product-page-validation.ts');
      return http.post('/products/prices/query', { productId: read.parameters.productId }, read.signal, value => validation.productPricesResponse(value, read.parameters));
    } } } : {}),
    ...(enabled.has('barcodes') ? { barcodes: { read: async read => {
      const parameters = parseProductDetailsPageQuery({ productId: read.parameters.productId, page: read.parameters.page, pageSize: read.parameters.pageSize });
      const validation = await import('./product-page-validation.ts');
      return http.post('/products/barcodes/query', parameters, read.signal, value => validation.productBarcodesResponse(value, parameters));
    } } } : {}),
    ...(enabled.has('stock') ? { stock: { read: async read => {
      const parameters = parseProductDetailsPageQuery({ productId: read.parameters.productId, page: read.parameters.page, pageSize: read.parameters.pageSize });
      const validation = await import('./product-page-validation.ts');
      return http.post('/products/stock/query', parameters, read.signal, value => validation.productStockResponse(value, parameters));
    } } } : {}),
  } satisfies ProductFullPageReadOnlyReader);
}
