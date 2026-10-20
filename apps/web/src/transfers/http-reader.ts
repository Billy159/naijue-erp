import { parseTransferDetailQuery, parseTransferListQuery, parseTransferWarehouseQuery } from '../../../../packages/application/src/transfer-query-validation.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import type { TransferReader, TransferWarehouseReader } from './contracts.ts';
import { transferDetailResponse, transferListResponse, transferWarehousesResponse } from './response-validation.ts';

/** Construction is inert. Fixed same-origin read-only POSTs use the existing
 * server session, never browser actor/role/identity/scope, eager catalog or retry. */
export function createTransferHttpReader(options: HttpQueryOptions): TransferReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readList(read) {
      const f = read.parameters.filter;
      const body = { filter: { startDate: f.startDate, endDate: f.endDate, statuses: [...f.statuses], fromWarehouseIds: [...f.fromWarehouseIds], toWarehouseIds: [...f.toWarehouseIds], number: f.number }, page: read.parameters.page, pageSize: read.parameters.pageSize };
      const parameters = parseTransferListQuery(body);
      return http.post('/transfers/query', body, read.signal, value => transferListResponse(value, parameters));
    },
    readDetail(read) {
      const body = { transferId: read.parameters.transferId }; const parameters = parseTransferDetailQuery(body);
      return http.post('/transfers/detail/query', body, read.signal, value => transferDetailResponse(value, parameters));
    },
  } satisfies TransferReader);
}

export function createTransferWarehouseHttpReader(options: HttpQueryOptions): TransferWarehouseReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({ readWarehouses(read) {
    const parameters = parseTransferWarehouseQuery({ search: read.parameters.search, selectedIds: [...read.parameters.selectedIds], page: read.parameters.page, pageSize: read.parameters.pageSize });
    const body = { search: parameters.search, selectedIds: [...parameters.selectedIds], page: parameters.page, pageSize: parameters.pageSize };
    return http.post('/transfers/warehouses/query', body, read.signal, value => transferWarehousesResponse(value, parameters));
  } } satisfies TransferWarehouseReader);
}
