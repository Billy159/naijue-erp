import { parseSalesDetailQuery, parseSalesListQuery } from '../../../../packages/application/src/sales-query-validation.ts';
import { parseSalesFilterReferenceQuery } from '../../../../packages/application/src/sales-reference-query-validation.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import type { SalesReader, SalesReferenceReader } from './contracts.ts';
import { salesDetailResponse, salesListResponse, salesReferencesResponse } from './response-validation.ts';

/** Inert, same-origin read-only composition. Never sends identity, role or scope.
 * No automatic retry, product hydration or fixture fallback. */
export function createSalesHttpReader(options: HttpQueryOptions): SalesReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readList(read) {
      const f = read.parameters.filter;
      const body = { filter: { startDate: f.startDate, endDate: f.endDate, statuses: f.statuses, businessTypes: f.businessTypes,
        hallIds: f.hallIds, salespersonIds: f.salespersonIds, customerIds: f.customerIds, warehouseIds: f.warehouseIds, number: f.number }, page: read.parameters.page, pageSize: read.parameters.pageSize };
      const parsed = parseSalesListQuery(body);
      return http.post('/sales/query', parsed, read.signal, value => salesListResponse(value, parsed));
    },
    readDetail(read) {
      const parsed = parseSalesDetailQuery({ salesId: read.parameters.salesId });
      return http.post('/sales/detail/query', { salesId: parsed.salesId }, read.signal, value => salesDetailResponse(value, parsed));
    },
  } satisfies SalesReader);
}

/** Bounded historical SALES FILTER candidates, not new/edit form eligibility.
 * Construction is inert; scope/search/count/order enforcement remains server-owned. */
export function createSalesFilterReferenceHttpReader(options: HttpQueryOptions): SalesReferenceReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readReferences(read) {
      const { kind, search, page, pageSize } = read.parameters;
      const body = { kind, search, page, pageSize };
      const parsed = parseSalesFilterReferenceQuery(body);
      return http.post('/sales/references/query', body, read.signal, value => salesReferencesResponse(value, parsed));
    },
  } satisfies SalesReferenceReader);
}
