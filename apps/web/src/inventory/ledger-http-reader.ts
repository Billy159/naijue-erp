import { businessDate, entityId, quantity } from '../../../../packages/domain/src/values.ts';
import { checkedInventoryLedgerTimestamp, inventoryLedgerBefore, parseInventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-validation.ts';
import type { InventoryLedgerCursor, InventoryLedgerEntry, InventoryLedgerPage, InventoryLedgerQuery, InventoryLedgerReader } from './ledger-contracts.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../transport/http-query.ts';

const invalid = (): never => { throw new HttpQueryError('malformed-response', 'INVALID_INVENTORY_LEDGER_RESPONSE'); };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) return invalid();
  return value;
}
function uuid(value: unknown): string { try { return entityId('operation', text(value)); } catch { return invalid(); } }
function selection(value: unknown): void { const row = object(value, ['id', 'label']); uuid(row.id); text(row.label); }
function cursor(value: unknown): InventoryLedgerCursor | null {
  if (value === null) return null;
  const row = object(value, ['postedAt', 'entryId']);
  return { postedAt: checkedInventoryLedgerTimestamp(row.postedAt, invalid), entryId: entityId('ledger', uuid(row.entryId)) };
}
/** Browser shape/target validation, separate from server authorization. No fabricated read scope. */
export function checkedLedgerPage(value: unknown, parameters: InventoryLedgerQuery): InventoryLedgerPage {
  try {
    const row = object(value, ['pageSize', 'labelBasis', 'warehouse', 'sku', 'entries', 'nextCursor']);
    if (row.pageSize !== parameters.pageSize || row.labelBasis !== 'CURRENT_REFERENCE') return invalid();
    const warehouse = object(row.warehouse, ['id', 'label', 'hallId']);
    if (uuid(warehouse.id) !== parameters.warehouseId) return invalid();
    uuid(warehouse.hallId); text(warehouse.label);
    const sku = object(row.sku, ['id', 'code', 'product', 'color', 'fit', 'sizeGroup', 'size']);
    if (uuid(sku.id) !== parameters.skuId) return invalid();
    text(sku.code); selection(sku.color); selection(sku.sizeGroup);
    const product = object(sku.product, ['id', 'code', 'name']); uuid(product.id); text(product.code); text(product.name);
    const fit = object(sku.fit, ['id', 'code', 'label']); uuid(fit.id); text(fit.label);
    if (typeof fit.code !== 'string' || !/^[A-Z]$/.test(fit.code)) return invalid();
    const size = object(sku.size, ['id', 'code', 'label']); uuid(size.id); text(size.label);
    if (size.code !== null && (typeof size.code !== 'string' || size.code.length > 1000 || /[\u0000-\u001f\u007f]/.test(size.code))) return invalid();
    if (!Array.isArray(row.entries) || row.entries.length > parameters.pageSize) return invalid();
    const ids = new Set<string>(); let previous = parameters.after;
    for (const raw of row.entries) {
      const item = object(raw, ['id', 'operationId', 'eventKind', 'quantityDelta', 'source', 'sourceDocumentVersion', 'reversesEntryId', 'businessDate', 'postedAt']);
      const entryId = entityId('ledger', uuid(item.id)); uuid(item.operationId);
      if (!['APPROVE', 'UNAPPROVE', 'CUTOFF_BASELINE', 'HISTORY_REVISION'].includes(item.eventKind as string) || typeof item.quantityDelta !== 'string' || quantity(item.quantityDelta) === 0n) return invalid();
      businessDate(text(item.businessDate));
      const point = { postedAt: checkedInventoryLedgerTimestamp(item.postedAt, invalid), entryId };
      if (ids.has(entryId) || previous && !inventoryLedgerBefore(point, previous)) return invalid();
      ids.add(entryId); previous = point;
      const baseline = item.eventKind === 'CUTOFF_BASELINE';
      const historyRevision = item.eventKind === 'HISTORY_REVISION';
      if (baseline ? item.sourceDocumentVersion !== null : typeof item.sourceDocumentVersion !== 'number' || !Number.isSafeInteger(item.sourceDocumentVersion) || item.sourceDocumentVersion < (historyRevision ? 2 : 1) || item.sourceDocumentVersion > 2147483647) return invalid();
      if ((item.eventKind === 'UNAPPROVE') !== (item.reversesEntryId !== null)) return invalid();
      if (item.reversesEntryId !== null && uuid(item.reversesEntryId) === entryId) return invalid();
      const kind = (item.source as { kind?: unknown } | null)?.kind;
      if ((kind === 'HISTORY_REVISION') !== historyRevision) return invalid();
      if (kind === 'SALES') { const source = object(item.source, ['kind', 'salesId', 'salesLineId', 'endpoint']); uuid(source.salesId); uuid(source.salesLineId); if (baseline || source.endpoint !== 'SALES_WAREHOUSE') return invalid(); }
      else if (kind === 'TRANSFER') { const source = object(item.source, ['kind', 'transferId', 'transferLineId', 'endpoint']); uuid(source.transferId); uuid(source.transferLineId); if (baseline || !['FROM', 'TO'].includes(source.endpoint as string)) return invalid(); }
      else if (kind === 'HISTORY_REVISION') {
        if ((item.source as { documentKind?: unknown }).documentKind === 'SALES') {
          const source = object(item.source, ['kind', 'documentKind', 'revisionId', 'salesId', 'salesLineId', 'endpoint']);
          uuid(source.revisionId); uuid(source.salesId); uuid(source.salesLineId); if (source.endpoint !== 'SALES_WAREHOUSE') return invalid();
        } else {
          const source = object(item.source, ['kind', 'documentKind', 'revisionId', 'transferId', 'transferLineId', 'endpoint']);
          uuid(source.revisionId); uuid(source.transferId); uuid(source.transferLineId); if (source.documentKind !== 'TRANSFER' || !['FROM', 'TO'].includes(source.endpoint as string)) return invalid();
        }
      }
      else if (kind === 'CUTOFF_BASELINE') { const source = object(item.source, ['kind', 'importBatchId', 'endpoint']); uuid(source.importBatchId); if (!baseline || source.endpoint !== 'IMPORT_BASELINE') return invalid(); }
      else return invalid();
    }
    const next = cursor(row.nextCursor);
    if (next && (row.entries.length !== parameters.pageSize || !previous || next.entryId !== previous.entryId || next.postedAt !== previous.postedAt)) return invalid();
    return value as InventoryLedgerPage;
  } catch { return invalid(); }
}
export function createInventoryLedgerHttpReader(options: HttpQueryOptions): InventoryLedgerReader {
  const http = createHttpJsonQuery(options);
  return Object.freeze({ readLedger: read => {
    const { warehouseId, skuId, pageSize, after } = read.parameters;
    const parameters = parseInventoryLedgerQuery({ warehouseId, skuId, pageSize, after: after ? { postedAt: after.postedAt, entryId: after.entryId } : null });
    return http.post('/inventory/ledger/query', parameters, read.signal, value => checkedLedgerPage(value, parameters));
  } } satisfies InventoryLedgerReader);
}
export function createInventoryLedgerQuery(scope: ReadScope, reader: InventoryLedgerReader, denied: (error: HttpQueryError) => void) {
  return new LatestQuery<InventoryLedgerQuery, InventoryLedgerPage>({ scope, execute: async read => {
    try { return checkedLedgerPage(await reader.readLedger(read), read.parameters); }
    catch (error) {
      if (scope.active && !read.signal.aborted && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
        scope.dispose(); denied(error);
      }
      throw error;
    }
  } });
}
export function ledgerSourceLabel(entry: InventoryLedgerEntry): string {
  if (entry.source.kind === 'HISTORY_REVISION') return entry.source.documentKind === 'SALES' ? '历史销货单修订' : entry.source.endpoint === 'FROM' ? '历史调拨出库修订' : '历史调拨入库修订';
  return entry.source.kind === 'SALES' ? '销货单' : entry.source.kind === 'TRANSFER' ? (entry.source.endpoint === 'FROM' ? '调拨出库' : '调拨入库') : '切换库存基线';
}
