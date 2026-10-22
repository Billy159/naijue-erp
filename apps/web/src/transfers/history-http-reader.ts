import type { TransferHistoryEntry, TransferHistoryQuery } from '../../../../packages/application/src/transfer-query-ports.ts';
import { parseTransferHistoryQuery } from '../../../../packages/application/src/transfer-query-validation.ts';
import { entityId, version as nativeVersion } from '../../../../packages/domain/src/values.ts';
import { createHttpJsonQuery, type HttpQueryOptions } from '../transport/http-query.ts';
import type { QueryRead } from '../loading/latest-query.ts';

export interface TransferHistoryPageDto { readonly transferId: string; readonly page: number; readonly pageSize: number; readonly exactTotal: string; readonly items: readonly TransferHistoryEntry[] }
export interface TransferHistoryReader { readHistory(read: QueryRead<TransferHistoryQuery>): Promise<TransferHistoryPageDto> }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new TypeError('Invalid transfer history.');
  return value as Record<string, unknown>;
}
function version(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError('Invalid audit version.'); return nativeVersion(value as number); }
function id(value: unknown) { if (typeof value !== 'string') throw new TypeError('Invalid audit identity.'); return entityId('audit', value); }
export function createTransferHistoryHttpReader(options: HttpQueryOptions): TransferHistoryReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze<TransferHistoryReader>({ readHistory(read) {
    // LatestQuery owns a frozen null-prototype snapshot. Rebuild the plain
    // transport object while retaining every key for the shared strict parser.
    const query = parseTransferHistoryQuery({ ...read.parameters });
    return http.post('/transfers/history/query', query, read.signal, value => {
      const row = object(value, ['transferId', 'page', 'pageSize', 'exactTotal', 'items']);
      if (row.transferId !== query.transferId || row.page !== query.page || row.pageSize !== query.pageSize || typeof row.exactTotal !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(row.exactTotal) || !Array.isArray(row.items)) throw new TypeError('Wrong history target/page.');
      const remaining = BigInt(row.exactTotal) - BigInt(query.page - 1) * BigInt(query.pageSize);
      const count = Number(remaining < 0n ? 0n : remaining > BigInt(query.pageSize) ? BigInt(query.pageSize) : remaining);
      if (row.items.length !== count) throw new TypeError('Incomplete history page.');
      const items = row.items.map((value: unknown): TransferHistoryEntry => {
        const item = object(value, ['id', 'operationId', 'actorAccountId', 'action', 'occurredAt', 'oldVersion', 'newVersion']);
        if (!['SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'].includes(item.action as string) || typeof item.occurredAt !== 'string' || item.occurredAt.length > 64 || !/(?:Z|[+-]\d{2}:\d{2})$/.test(item.occurredAt) || !Number.isFinite(Date.parse(item.occurredAt))) throw new TypeError('Invalid audit action/time.');
        const newVersion = version(item.newVersion), oldVersion = item.oldVersion === null ? null : version(item.oldVersion);
        return Object.freeze({ id: id(item.id), operationId: entityId('operation', id(item.operationId)), actorAccountId: entityId('account', id(item.actorAccountId)),
          action: item.action as TransferHistoryEntry['action'], occurredAt: item.occurredAt, oldVersion, newVersion });
      });
      if (new Set(items.map(item => item.id)).size !== items.length) throw new TypeError('Duplicate audit identity.');
      return Object.freeze({ transferId: query.transferId, page: query.page, pageSize: query.pageSize, exactTotal: row.exactTotal, items: Object.freeze(items) });
    });
  } });
}
