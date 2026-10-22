import type { HttpQueryOptions } from '../transport/http-query.ts';
import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { existingProductFullPageReader, type ProductFullPageReadOnlyReader } from './product-page-contracts.ts';
/** Explicit host composition remains inert and keeps product DTO validators out
 * of startup. Only the selected target/tab's first read loads the existing port. */
export function createProductFullPageHttpReader(options: HttpQueryOptions): ProductFullPageReadOnlyReader {
  const captured = Object.freeze({ ...options });
  let pending: Promise<ProductReadOnlyReader> | null = null;
  const reader = () => pending ??= import('../transport/product-http-reader.ts').then(module => module.createProductHttpReader(captured)).catch(error => { pending = null; throw error; });
  return existingProductFullPageReader({ readProductBasics: async read => (await reader()).readProductBasics(read),
    readProductSpecifications: async read => (await reader()).readProductSpecifications(read),
    readProductImages: async read => (await reader()).readProductImages(read), readProductImage: async read => (await reader()).readProductImage(read) });
}
