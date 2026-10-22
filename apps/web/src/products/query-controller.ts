import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { checkedProductManagementCandidatePage, checkedProductManagementListPage } from '../../../../packages/application/src/product-management-query-validation.ts';
import type { ProductManagementListPage, ProductManagementListQuery, ProductManagementCandidatePage, ProductManagementCandidateQuery, ProductManagementReader } from './contracts.ts';

/** One route-owned scope. A denied list or candidate clears ALL local facts immediately,
 * even if the trusted host has not yet replaced the global authentication identity. */
export function guardedProductManagementReader(scope: ReadScope, reader: ProductManagementReader, onAccessFailure: (error: HttpQueryError) => void): ProductManagementReader {
  async function run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (!scope.active || signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    try { return await work(); }
    catch (error) {
      if (scope.active && !signal.aborted && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
        scope.dispose();
        try { onAccessFailure(error); } catch { /* Identity cleanup cannot be undone by a host callback. */ }
      }
      throw error;
    }
  }
  return Object.freeze<ProductManagementReader>({ readList: read => run(read.signal, async () => checkedProductManagementResponse(await reader.readList(read), read.parameters)),
    readCandidates: read => run(read.signal, async () => checkedProductManagementCandidates(await reader.readCandidates(read), read.parameters)) });
}
export function createProductManagementQuery(scope: ReadScope, reader: ProductManagementReader) {
  return new LatestQuery<ProductManagementListQuery, ProductManagementListPage>({ scope, execute: async read => checkedProductManagementResponse(await reader.readList(read), read.parameters) });
}

/** A valid row shape alone cannot establish that a complete requested page was returned. */
export function checkedProductManagementResponse(value: unknown, parameters: ProductManagementListQuery): ProductManagementListPage {
  const data = checkedProductManagementListPage(value);
  if (data.page !== parameters.page || data.pageSize !== parameters.pageSize || data.items.length !== Math.min(parameters.pageSize, Math.max(0, data.exactTotal - (parameters.page - 1) * parameters.pageSize))) throw new TypeError('Product management pagination does not match the executed request.');
  return data;
}
export function checkedProductManagementCandidates(value: unknown, parameters: ProductManagementCandidateQuery): ProductManagementCandidatePage {
  const data = checkedProductManagementCandidatePage(value, parameters.kind);
  if (data.page !== parameters.page || data.pageSize !== parameters.pageSize || data.items.length !== Math.min(20, Math.max(0, data.exactTotal - (parameters.page - 1) * 20))) throw new TypeError('Product management candidate pagination does not match the executed request.');
  return data;
}
