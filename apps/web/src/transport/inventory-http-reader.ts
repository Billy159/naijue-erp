import type { InventoryReader, Selection } from '../inventory/contracts.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from './http-query.ts';
import { candidatesResponse, inventoryResponse } from './response-validation.ts';

function selection(value: Selection): Selection { return { id: value.id, label: value.label }; }
/** Required host injection, with no default endpoint, prefetch, cache or fixture branch. */
export function createInventoryHttpReader(options: HttpQueryOptions): InventoryReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({
    readInventory(read) {
      const { filter, page, pageSize } = read.parameters;
      // Explicit projection prevents extra client identity/role fields from becoming authorization.
      const body = { filter: { products: filter.products.map(selection), categories: filter.categories.map(selection),
        warehouses: filter.warehouses.map(selection), suppliers: filter.suppliers.map(selection), fits: filter.fits.map(selection), seasons: filter.seasons.map(selection) }, page, pageSize };
      return http.post('/inventory/query', body, read.signal, value => inventoryResponse(value, read.parameters));
    },
    readCandidates(read) {
      const { kind, search, page, pageSize, selectedIds, categoryIds } = read.parameters;
      return http.post('/inventory/candidates/query', { kind, search, page, pageSize, selectedIds: [...selectedIds], categoryIds: [...categoryIds] },
        read.signal, value => candidatesResponse(value, read.parameters));
    },
  } satisfies InventoryReader);
}
