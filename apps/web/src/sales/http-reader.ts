import { parseSalesDetailQuery, parseSalesListQuery } from '../../../../packages/application/src/sales-query-validation.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import type { SalesReader } from './contracts.ts';
import { salesDetailResponse, salesListResponse } from './response-validation.ts';

/** Inert, same-origin read-only composition. Never sends identity, role or scope.
 * No candidate endpoint, automatic retry, product hydration or fixture fallback. */
export function createSalesHttpReader(options: HttpQueryOptions): SalesReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readList(read) {
      const f = read.parameters.filter;
      const body = { filter: { startDate: f.startDate, endDate: f.endDate, status: f.status, businessType: f.businessType,
        hallId: f.hallId, salespersonId: f.salespersonId, customerId: f.customerId, warehouseId: f.warehouseId, number: f.number }, page: read.parameters.page, pageSize: read.parameters.pageSize };
      const parsed = parseSalesListQuery(body);
      return http.post('/sales/query', body, read.signal, value => salesListResponse(value, parsed));
    },
    readDetail(read) {
      const parsed = parseSalesDetailQuery({ salesId: read.parameters.salesId });
      return http.post('/sales/detail/query', { salesId: parsed.salesId }, read.signal, value => salesDetailResponse(value, parsed));
    },
  } satisfies SalesReader);
}
