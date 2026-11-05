import { DomainError } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import type { ActorContext } from './ports.ts';
import { CATALOGUE_SETTINGS_MAX_CATEGORIES, catalogueSettingsPageSizes, type CatalogueSettingsCategory, type CatalogueSettingsEntry, type CatalogueSettingsListQuery, type CatalogueSettingsPage, type CatalogueSettingsReadGrant, type CatalogueSettingsReadIntent, type CatalogueSettingsTree, type CatalogueSettingsTreeQuery } from './catalogue-settings-read-ports.ts';

export function invalidCatalogueSettingsQuery(): never { throw new DomainError('CATALOGUE_SETTINGS_INVALID_QUERY', 'Invalid catalogue settings read parameters'); }
function record(value: unknown, keys: readonly string[], reject: () => never): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) reject();
  return value as Record<string, unknown>;
}
export function catalogueSettingsId(value: unknown): string {
  if (typeof value !== 'string') return invalidCatalogueSettingsQuery();
  try { return entityId('product', value); } catch { return invalidCatalogueSettingsQuery(); }
}
export function parseCatalogueSettingsListQuery(value: unknown): CatalogueSettingsListQuery {
  const row = record(value, ['search', 'page', 'pageSize'], invalidCatalogueSettingsQuery);
  if (typeof row.search !== 'string' || row.search.length > 200 || /[\u0000-\u001f\u007f]/u.test(row.search)
    || !Number.isSafeInteger(row.page) || (row.page as number) < 1 || !catalogueSettingsPageSizes.includes(row.pageSize as never)
    || !Number.isSafeInteger(((row.page as number) - 1) * (row.pageSize as number))) invalidCatalogueSettingsQuery();
  return Object.freeze({ search: row.search, page: row.page as number, pageSize: row.pageSize as CatalogueSettingsListQuery['pageSize'] });
}
export function parseCatalogueSettingsTreeQuery(value: unknown): CatalogueSettingsTreeQuery { record(value, [], invalidCatalogueSettingsQuery); return Object.freeze({}); }
export function checkedCatalogueSettingsIntent(value: CatalogueSettingsReadIntent): CatalogueSettingsReadIntent {
  const row = record(value, ['kind', 'operation', 'parameters'], invalidCatalogueSettingsQuery);
  if (row.kind === 'categories' && row.operation === 'tree') return Object.freeze({ kind: 'categories', operation: 'tree', parameters: parseCatalogueSettingsTreeQuery(row.parameters) });
  if ((row.kind === 'colors' || row.kind === 'fits') && row.operation === 'list') return Object.freeze({ kind: row.kind, operation: 'list', parameters: parseCatalogueSettingsListQuery(row.parameters) });
  return invalidCatalogueSettingsQuery();
}
export function checkedCatalogueSettingsActor(actor: ActorContext): ActorContext {
  try {
    if (!actor || !Object.hasOwn(actor, 'hallId')) throw new Error();
    return Object.freeze({ accountId: entityId('account', actor.accountId), hallId: actor.hallId === null ? null : entityId('hall', actor.hallId) });
  } catch { throw new Error('Invalid trusted catalogue settings actor'); }
}
export function checkedCatalogueSettingsGrant(value: CatalogueSettingsReadGrant, intent: CatalogueSettingsReadIntent): CatalogueSettingsReadGrant {
  const forbidden = (): never => { throw new DomainError('CATALOGUE_SETTINGS_FORBIDDEN', 'No grant for requested catalogue enumeration'); };
  const row = record(value, intent.kind === 'categories' ? ['kind', 'operation', 'productCounts'] : ['kind', 'operation'], forbidden);
  if (row.kind !== intent.kind || row.operation !== intent.operation) return forbidden();
  if (intent.kind === 'categories') {
    if (row.productCounts !== 'NONE' && row.productCounts !== 'ALL') return forbidden();
    return Object.freeze({ kind: 'categories', operation: 'tree', productCounts: row.productCounts });
  }
  return Object.freeze({ kind: intent.kind, operation: 'list' });
}
export function activeCatalogueSettingsRead(signal: AbortSignal): void {
  if (!(signal instanceof AbortSignal)) throw new TypeError('An explicit catalogue settings AbortSignal is required');
  if (signal.aborted) throw new DomainError('CATALOGUE_SETTINGS_READ_ABORTED', 'Catalogue settings read aborted');
}
function invalidResponse(): never { throw new DomainError('CATALOGUE_SETTINGS_INVALID_RESPONSE', 'Invalid catalogue settings read response'); }
function text(value: unknown): string { if (typeof value !== 'string') return invalidResponse(); return value; }
function id(value: unknown): string { try { return catalogueSettingsId(value); } catch { return invalidResponse(); } }
function integer(value: unknown, minimum: number): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) return invalidResponse(); return value as number; }
export function validateCatalogueSettingsEntry(value: unknown): CatalogueSettingsEntry {
  const row = record(value, ['id', 'code', 'name', 'enabled', 'version'], invalidResponse);
  if (typeof row.enabled !== 'boolean') invalidResponse();
  return Object.freeze({ id: id(row.id), code: text(row.code), name: text(row.name), enabled: row.enabled as boolean, version: integer(row.version, 1) });
}
export function validateCatalogueSettingsPage(value: unknown, query: CatalogueSettingsListQuery): CatalogueSettingsPage<CatalogueSettingsEntry> {
  const parameters = parseCatalogueSettingsListQuery(query), row = record(value, ['page', 'pageSize', 'total', 'items'], invalidResponse);
  const total = integer(row.total, 0), page = integer(row.page, 1);
  if (page !== parameters.page || row.pageSize !== parameters.pageSize || !Array.isArray(row.items)) invalidResponse();
  const length = Math.max(0, Math.min(parameters.pageSize, total - (page - 1) * parameters.pageSize));
  if (row.items.length !== length) invalidResponse();
  const items = row.items.map(validateCatalogueSettingsEntry);
  if (new Set(items.map(item => item.id)).size !== items.length) invalidResponse();
  return Object.freeze({ page, pageSize: parameters.pageSize, total, items: Object.freeze(items) });
}
export function validateCatalogueSettingsTree(value: unknown): CatalogueSettingsTree {
  const row = record(value, ['total', 'items'], invalidResponse), total = integer(row.total, 0);
  if (total > CATALOGUE_SETTINGS_MAX_CATEGORIES) throw new DomainError('CATALOGUE_SETTINGS_READ_TOO_LARGE', 'Category tree exceeds technical response bound');
  if (!Array.isArray(row.items) || row.items.length !== total) invalidResponse();
  const items: CatalogueSettingsCategory[] = row.items.map(value => {
    const category = record(value, ['id', 'parentId', 'name', 'displayOrder', 'version', 'code', 'productCount', 'childCount'], invalidResponse);
    if (category.code !== null || !Number.isSafeInteger(category.displayOrder)) invalidResponse();
    return Object.freeze({ id: id(category.id), parentId: category.parentId === null ? null : id(category.parentId), name: text(category.name),
      displayOrder: category.displayOrder as number, version: integer(category.version, 1), code: null,
      productCount: category.productCount === null ? null : integer(category.productCount, 0), childCount: integer(category.childCount, 0) });
  });
  const byId = new Map(items.map(item => [item.id, item]));
  if (byId.size !== items.length) invalidResponse();
  const children = new Map<string, number>();
  for (const item of items) {
    if (item.parentId !== null) { if (!byId.has(item.parentId)) invalidResponse(); children.set(item.parentId, (children.get(item.parentId) ?? 0) + 1); }
  }
  // Iterative traversal supports native depth without recursion or silently reparenting corrupt records.
  const complete = new Set<string>();
  for (const item of items) {
    const seen = new Set<string>(); let cursor: CatalogueSettingsCategory | undefined = item;
    while (cursor && !complete.has(cursor.id)) {
      if (seen.has(cursor.id)) invalidResponse(); seen.add(cursor.id);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
    for (const entryId of seen) complete.add(entryId);
    if (item.childCount !== (children.get(item.id) ?? 0)) invalidResponse();
  }
  if (items.some(item => (item.productCount === null) !== (items[0]?.productCount === null))) invalidResponse();
  return Object.freeze({ total, items: Object.freeze(items) });
}
/** Recheck injected readers against the independent product-count grant before serializing. */
export function validateCatalogueSettingsTreeGrant(value: unknown, grant: CatalogueSettingsReadGrant): CatalogueSettingsTree {
  const tree = validateCatalogueSettingsTree(value);
  if (grant.kind !== 'categories' || tree.items.some(item => (item.productCount === null) !== (grant.productCounts === 'NONE'))) invalidResponse();
  return tree;
}
