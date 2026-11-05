import { invalidSalesQuery, parseSalesListQuery } from './sales-query-validation.ts';
import { invalidTransferQuery, parseTransferListQuery } from './transfer-query-validation.ts';
import type { OrdinarySalesTotalsQuery, OrdinaryTransferTotalsQuery } from './ordinary-document-query-ports.ts';
function envelope(value: unknown, invalid: () => never): { filter: unknown; expectedRevision: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 2 || !Object.hasOwn(row, 'filter') || !Object.hasOwn(row, 'expectedRevision')
    || typeof row.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(row.expectedRevision)) invalid();
  return { filter: row.filter, expectedRevision: row.expectedRevision as string };
}
export function parseOrdinarySalesTotalsQuery(value: unknown): OrdinarySalesTotalsQuery {
  const row = envelope(value, invalidSalesQuery);
  return Object.freeze({ filter: parseSalesListQuery({ filter: row.filter, page: 1, pageSize: 20 }).filter, expectedRevision: row.expectedRevision });
}
export function parseOrdinaryTransferTotalsQuery(value: unknown): OrdinaryTransferTotalsQuery {
  const row = envelope(value, invalidTransferQuery);
  return Object.freeze({ filter: parseTransferListQuery({ filter: row.filter, page: 1, pageSize: 20 }).filter, expectedRevision: row.expectedRevision });
}
