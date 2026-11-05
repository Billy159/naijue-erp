import type { ProductReadOnlyReader } from '../inventory/product-contracts.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from './http-query.ts';
import { productBasicsResponse, productImageResponse, productImagesResponse, productSpecificationsResponse } from './response-validation.ts';

/** Target-only reads. Constructing the reader does not read tabs, candidates, or image originals. */
export function createProductHttpReader(options: HttpQueryOptions): ProductReadOnlyReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readProductBasics: read => http.post('/products/basics/query', { productId: read.parameters.productId }, read.signal,
      value => productBasicsResponse(value, read.parameters)),
    readProductSpecifications: read => http.post('/products/specifications/query', { productId: read.parameters.productId }, read.signal,
      value => productSpecificationsResponse(value, read.parameters)),
    readProductImages: read => http.post('/products/images/query', { productId: read.parameters.productId }, read.signal,
      value => productImagesResponse(value, read.parameters)),
    readProductImage: read => http.post('/products/image/query', { productId: read.parameters.productId, imageId: read.parameters.imageId }, read.signal,
      value => productImageResponse(value, read.parameters)),
  } satisfies ProductReadOnlyReader);
}
