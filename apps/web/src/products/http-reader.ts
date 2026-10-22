import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import { checkedProductManagementCandidates, checkedProductManagementResponse } from './query-controller.ts';
import type { ProductManagementReader } from './contracts.ts';

/** Inert construction, real authenticated same-origin POST reads only; no fixture fallback. */
export function createProductManagementHttpReader(options: HttpQueryOptions): ProductManagementReader {
  const query = createHttpJsonQuery(options);
  return Object.freeze<ProductManagementReader>({
    readList: read => query.post('/product-management/query', read.parameters, read.signal, value => checkedProductManagementResponse(value, read.parameters)),
    readCandidates: read => query.post('/product-management/candidates/query', read.parameters, read.signal, value => checkedProductManagementCandidates(value, read.parameters)),
  });
}
