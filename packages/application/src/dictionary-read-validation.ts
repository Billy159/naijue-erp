import { DomainError, requireDomain } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import type { ActorContext } from './ports.ts';
import { dictionaryPageSizes, type DictionaryBarcodeScheme, type DictionaryKind, type DictionaryListQuery, type DictionaryPage, type DictionaryReadGrant, type DictionaryReadIntent, type DictionarySchemeQuery, type DictionarySeason, type DictionarySizeGroup } from './dictionary-read-ports.ts';

export function invalidDictionaryQuery(): never { throw new DomainError('INVALID_DICTIONARY_QUERY', 'Invalid dictionary read parameters'); }
function record(value: unknown, keys: readonly string[], reject: () => never): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) reject();
  return value as Record<string, unknown>;
}
export function dictionaryId(value: unknown): string {
  if (typeof value !== 'string') return invalidDictionaryQuery();
  try { return entityId('product', value); } catch { return invalidDictionaryQuery(); }
}
export function parseDictionaryListQuery(value: unknown): DictionaryListQuery {
  const row = record(value, ['search', 'page', 'pageSize'], invalidDictionaryQuery);
  if (typeof row.search !== 'string' || row.search.length > 200 || /[\u0000-\u001f\u007f]/u.test(row.search)
    || !Number.isSafeInteger(row.page) || (row.page as number) < 1
    || !dictionaryPageSizes.includes(row.pageSize as never) || !Number.isSafeInteger(((row.page as number) - 1) * (row.pageSize as number))) invalidDictionaryQuery();
  return Object.freeze({ search: row.search, page: row.page as number, pageSize: row.pageSize as DictionaryListQuery['pageSize'] });
}
export function parseDictionarySchemeQuery(value: unknown): DictionarySchemeQuery {
  const row = record(value, ['schemeId'], invalidDictionaryQuery); return Object.freeze({ schemeId: dictionaryId(row.schemeId) });
}
export function checkedDictionaryIntent(intent: DictionaryReadIntent): DictionaryReadIntent {
  const row = record(intent, ['kind', 'operation', 'parameters'], invalidDictionaryQuery);
  if (!['size-groups', 'seasons', 'barcode-schemes'].includes(row.kind as string)) invalidDictionaryQuery();
  if (row.operation === 'list') return Object.freeze({ kind: row.kind as DictionaryKind, operation: 'list', parameters: parseDictionaryListQuery(row.parameters) });
  if (row.operation === 'detail' && row.kind === 'barcode-schemes') return Object.freeze({ kind: 'barcode-schemes', operation: 'detail', parameters: parseDictionarySchemeQuery(row.parameters) });
  return invalidDictionaryQuery();
}
export function checkedDictionaryActor(actor: ActorContext): ActorContext {
  try {
    if (!actor || !Object.hasOwn(actor, 'hallId')) throw new Error();
    return Object.freeze({ accountId: entityId('account', actor.accountId), hallId: actor.hallId === null ? null : entityId('hall', actor.hallId) });
  } catch { throw new Error('Invalid trusted dictionary actor'); }
}
export function checkedDictionaryGrant(value: DictionaryReadGrant, intent: DictionaryReadIntent): DictionaryReadGrant {
  try {
    const row = record(value, ['kind', 'targetId'], () => { throw new Error(); });
    if (!['size-groups', 'seasons', 'barcode-schemes'].includes(row.kind as string) || row.targetId !== null && dictionaryId(row.targetId) !== row.targetId) throw new Error();
    if (row.kind !== intent.kind || row.targetId !== (intent.operation === 'detail' ? intent.parameters.schemeId : null)) throw new DomainError('FORBIDDEN', 'No grant for the requested dictionary target');
    return Object.freeze({ kind: row.kind as DictionaryKind, targetId: row.targetId as string | null });
  } catch (error) { if (error instanceof DomainError && error.code === 'FORBIDDEN') throw error; throw new Error('Invalid trusted dictionary grant'); }
}
export function activeDictionaryRead(signal: AbortSignal): void {
  if (!(signal instanceof AbortSignal)) throw new TypeError('An explicit dictionary AbortSignal is required');
  if (signal.aborted) throw new DomainError('DICTIONARY_READ_ABORTED', 'Dictionary read aborted');
}
function invalidResponse(): never { throw new DomainError('INVALID_DICTIONARY_RESPONSE', 'Invalid dictionary read response'); }
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) return invalidResponse(); return value; }
function id(value: unknown): string { try { return dictionaryId(value); } catch { return invalidResponse(); } }
function integer(value: unknown, minimum: number): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) return invalidResponse(); return value as number; }
function uniqueIds<T extends { readonly id: string }>(items: readonly T[]): void { if (new Set(items.map(item => item.id)).size !== items.length) invalidResponse(); }
export function validateDictionaryScheme(value: unknown): DictionaryBarcodeScheme {
  const row = record(value, ['id', 'name', 'barcodeType', 'ruleDescription', 'codeLength', 'ruleVersion', 'status', 'applicability'], invalidResponse);
  if (!['CURRENT', 'HISTORICAL'].includes(row.status as string) || row.applicability !== null) invalidResponse();
  return Object.freeze({ id: id(row.id), name: text(row.name), barcodeType: text(row.barcodeType), ruleDescription: text(row.ruleDescription),
    codeLength: row.codeLength === null ? null : integer(row.codeLength, 1), ruleVersion: text(row.ruleVersion), status: row.status as DictionaryBarcodeScheme['status'], applicability: null });
}
export function validateDictionarySizeGroup(value: unknown): DictionarySizeGroup {
  const row = record(value, ['id', 'name', 'sizes'], invalidResponse); if (!Array.isArray(row.sizes) || row.sizes.length > 1000) invalidResponse();
  const sizes = row.sizes.map(value => { const size = record(value, ['id', 'name', 'displayOrder'], invalidResponse);
    const order = size.displayOrder; if (!Number.isSafeInteger(order)) invalidResponse();
    return Object.freeze({ id: id(size.id), name: text(size.name), displayOrder: order as number }); });
  uniqueIds(sizes);
  for (let index = 1; index < sizes.length; index++) { const previous = sizes[index - 1]!, current = sizes[index]!;
    if (current.displayOrder < previous.displayOrder || current.displayOrder === previous.displayOrder && current.id < previous.id) invalidResponse(); }
  return Object.freeze({ id: id(row.id), name: text(row.name), sizes: Object.freeze(sizes) });
}
export function validateDictionarySeason(value: unknown): DictionarySeason {
  const row = record(value, ['id', 'name'], invalidResponse); return Object.freeze({ id: id(row.id), name: text(row.name) });
}
/** Validates both untrusted wire values and injected trusted readers. Page/total agree with
 * the executed range; an out-of-range page is an explicit empty page, never a silent clamp. */
export function validateDictionaryPage<T extends { readonly id: string }>(value: unknown, query: DictionaryListQuery, item: (value: unknown) => T): DictionaryPage<T> {
  const row = record(value, ['page', 'pageSize', 'total', 'items'], invalidResponse);
  const total = integer(row.total, 0), page = integer(row.page, 1);
  if (page !== query.page || row.pageSize !== query.pageSize || !Array.isArray(row.items)) invalidResponse();
  const expected = Math.max(0, Math.min(query.pageSize, total - (page - 1) * query.pageSize));
  requireDomain(row.items.length === expected, 'INVALID_DICTIONARY_RESPONSE', 'Dictionary page length does not match total/range');
  const items = row.items.map(item); uniqueIds(items);
  return Object.freeze({ page, pageSize: query.pageSize, total, items: Object.freeze(items) });
}
