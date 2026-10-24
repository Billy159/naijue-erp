import { DomainError } from '../../domain/src/errors.ts';
import { entityId } from '../../domain/src/values.ts';
import type { ActorContext } from './ports.ts';
import { storeSettingsPageSizes, type StoreSettingsDetail, type StoreSettingsDetailQuery, type StoreSettingsEntry, type StoreSettingsKind, type StoreSettingsListQuery, type StoreSettingsPage, type StoreSettingsReadGrant, type StoreSettingsReadIntent, type StoreSettingsReference, type StoreSettingsScope } from './store-settings-read-ports.ts';

export function invalidStoreSettingsQuery(): never { throw new DomainError('STORE_SETTINGS_INVALID_QUERY', 'Invalid store settings read parameters'); }
function invalidResponse(): never { throw new DomainError('STORE_SETTINGS_INVALID_RESPONSE', 'Invalid store settings response'); }
function forbidden(): never { throw new DomainError('STORE_SETTINGS_FORBIDDEN', 'No grant for requested store settings read'); }
function record(value: unknown, keys: readonly string[], reject: () => never): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) reject();
  return value as Record<string, unknown>;
}
export function storeSettingsId(value: unknown): string {
  if (typeof value !== 'string') return invalidStoreSettingsQuery();
  try { return entityId('hall', value); } catch { return invalidStoreSettingsQuery(); }
}
export function parseStoreSettingsListQuery(value: unknown, kind: StoreSettingsKind): StoreSettingsListQuery {
  const row = record(value, ['search', 'status', 'hallId', 'page', 'pageSize'], invalidStoreSettingsQuery);
  if (typeof row.search !== 'string' || row.search.length > 200 || /[\u0000-\u001f\u007f]/u.test(row.search) || !['normal', 'disabled', 'all'].includes(row.status as string)
    || (kind === 'stores' && row.hallId !== null) || !Number.isSafeInteger(row.page) || (row.page as number) < 1 || !storeSettingsPageSizes.includes(row.pageSize as never)
    || !Number.isSafeInteger(((row.page as number) - 1) * (row.pageSize as number))) invalidStoreSettingsQuery();
  return Object.freeze({ search: row.search as string, status: row.status as StoreSettingsListQuery['status'], hallId: row.hallId === null ? null : storeSettingsId(row.hallId), page: row.page as number, pageSize: row.pageSize as StoreSettingsListQuery['pageSize'] });
}
export function parseStoreSettingsDetailQuery(value: unknown): StoreSettingsDetailQuery { const row = record(value, ['id'], invalidStoreSettingsQuery); return Object.freeze({ id: storeSettingsId(row.id) }); }
export function checkedStoreSettingsIntent(value: StoreSettingsReadIntent): StoreSettingsReadIntent {
  const row = record(value, ['kind', 'operation', 'parameters'], invalidStoreSettingsQuery);
  if (row.kind !== 'stores' && row.kind !== 'warehouses') invalidStoreSettingsQuery();
  if (row.operation === 'list') return Object.freeze({ kind: row.kind, operation: 'list', parameters: parseStoreSettingsListQuery(row.parameters, row.kind) });
  if (row.operation === 'detail') return Object.freeze({ kind: row.kind, operation: 'detail', parameters: parseStoreSettingsDetailQuery(row.parameters) });
  return invalidStoreSettingsQuery();
}
export function checkedStoreSettingsActor(value: ActorContext): ActorContext {
  try { if (!value || !Object.hasOwn(value, 'hallId')) throw new Error(); return Object.freeze({ accountId: entityId('account', value.accountId), hallId: value.hallId === null ? null : entityId('hall', value.hallId) }); }
  catch { throw new Error('Invalid trusted store settings actor'); }
}
export function checkedStoreSettingsGrant(value: StoreSettingsReadGrant, intent: StoreSettingsReadIntent): StoreSettingsReadGrant {
  const row = record(value, ['kind', 'operation', 'scope', 'references', 'targetId'], forbidden);
  if (row.kind !== intent.kind || row.operation !== intent.operation || (row.references !== 'NONE' && row.references !== 'REFERENCES') || row.targetId !== (intent.operation === 'detail' ? intent.parameters.id : null)) forbidden();
  const scopeInput = row.scope as StoreSettingsScope;
  let scope: StoreSettingsScope;
  if (scopeInput?.kind === 'ALL') { record(scopeInput, ['kind'], forbidden); scope = Object.freeze({ kind: 'ALL' }); }
  else if (scopeInput?.kind === 'CORE_MEMBERS') {
    const input = record(scopeInput, ['kind', 'hallIds', 'warehouseIds'], forbidden);
    if (!Array.isArray(input.hallIds) || input.hallIds.length !== 22 || !Array.isArray(input.warehouseIds) || input.warehouseIds.length !== 22) forbidden();
    let hallIds: string[], warehouseIds: string[];
    try { hallIds = (input.hallIds as unknown[]).map(storeSettingsId); warehouseIds = (input.warehouseIds as unknown[]).map(storeSettingsId); } catch { return forbidden(); }
    if (new Set(hallIds).size !== 22 || new Set(warehouseIds).size !== 22) forbidden();
    scope = Object.freeze({ kind: 'CORE_MEMBERS', hallIds: Object.freeze(hallIds), warehouseIds: Object.freeze(warehouseIds) });
  }
  else {
    const input = record(scopeInput, ['kind', 'hallIds'], forbidden);
    if (input.kind !== 'HALL_IDS' || !Array.isArray(input.hallIds) || input.hallIds.length > 5000) forbidden();
    let hallIds: string[];
    try { hallIds = (input.hallIds as unknown[]).map(storeSettingsId); } catch { return forbidden(); }
    if (new Set(hallIds).size !== hallIds.length) forbidden();
    scope = Object.freeze({ kind: 'HALL_IDS', hallIds: Object.freeze(hallIds) });
  }
  return Object.freeze({ kind: intent.kind, operation: intent.operation, scope, references: row.references as StoreSettingsReadGrant['references'], targetId: row.targetId as string | null });
}
export function activeStoreSettingsRead(signal: AbortSignal): void { if (!(signal instanceof AbortSignal)) throw new TypeError('Explicit store settings AbortSignal required'); if (signal.aborted) throw new DomainError('STORE_SETTINGS_READ_ABORTED', 'Store settings read aborted'); }
function id(value: unknown): string { try { return storeSettingsId(value); } catch { return invalidResponse(); } }
function text(value: unknown): string { if (typeof value !== 'string') invalidResponse(); return value as string; }
function integer(value: unknown, minimum: number): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) invalidResponse(); return value as number; }
function reference(value: unknown): StoreSettingsReference { const row = record(value, ['id', 'name'], invalidResponse); return Object.freeze({ id: id(row.id), name: row.name === null ? null : text(row.name) }); }
export function validateStoreSettingsEntry(value: unknown, kind: StoreSettingsKind): StoreSettingsEntry {
  const keys = ['kind', 'id', 'name', 'enabled', 'version', 'createdAt', 'updatedAt', ...(kind === 'stores' ? ['defaultCustomer', 'defaultWarehouse'] : ['hall', 'stockFacts'])];
  const row = record(value, keys, invalidResponse);
  if (row.kind !== kind || typeof row.enabled !== 'boolean' || row.createdAt !== null || row.updatedAt !== null) invalidResponse();
  const base = { id: id(row.id), name: text(row.name), enabled: row.enabled as boolean, version: integer(row.version, 1), createdAt: null, updatedAt: null } as const;
  if (kind === 'stores') return Object.freeze({ ...base, kind: 'stores', defaultCustomer: row.defaultCustomer === null ? null : reference(row.defaultCustomer), defaultWarehouse: row.defaultWarehouse === null ? null : reference(row.defaultWarehouse) });
  if (row.stockFacts !== null) invalidResponse();
  return Object.freeze({ ...base, kind: 'warehouses', hall: reference(row.hall), stockFacts: null });
}
function checkGrant(entry: StoreSettingsEntry, grant: StoreSettingsReadGrant): void {
  const hallId = entry.kind === 'stores' ? entry.id : entry.hall.id;
  if (grant.scope.kind === 'HALL_IDS' && !grant.scope.hallIds.includes(hallId)) invalidResponse();
  if (grant.scope.kind === 'CORE_MEMBERS') {
    const ids = entry.kind === 'stores' ? grant.scope.hallIds : grant.scope.warehouseIds;
    if (!ids.includes(entry.id)) invalidResponse();
    // Preserve actual FK identities; CORE authorizes names only inside its exact
    // hall/warehouse sets, never an unrelated directory through a default FK.
    const reference = entry.kind === 'stores' ? entry.defaultWarehouse : entry.hall;
    const referenceIds = entry.kind === 'stores' ? grant.scope.warehouseIds : grant.scope.hallIds;
    if (reference !== null && reference.name !== null && !referenceIds.includes(reference.id)) invalidResponse();
  }
  const references = entry.kind === 'stores' ? [entry.defaultCustomer, entry.defaultWarehouse] : [entry.hall];
  if (grant.references === 'NONE' && references.some(reference => reference !== null && reference.name !== null)) invalidResponse();
}
export function validateStoreSettingsPage(value: unknown, kind: StoreSettingsKind, parameters: StoreSettingsListQuery, grant?: StoreSettingsReadGrant): StoreSettingsPage {
  const query = parseStoreSettingsListQuery(parameters, kind), row = record(value, ['page', 'pageSize', 'total', 'items'], invalidResponse);
  const total = integer(row.total, 0), page = integer(row.page, 1);
  if (grant?.scope.kind === 'CORE_MEMBERS' && total > (kind === 'stores' ? grant.scope.hallIds.length : grant.scope.warehouseIds.length)) invalidResponse();
  if (page !== query.page || row.pageSize !== query.pageSize || !Array.isArray(row.items) || row.items.length !== Math.max(0, Math.min(query.pageSize, total - (page - 1) * query.pageSize))) invalidResponse();
  const items = (row.items as unknown[]).map(value => validateStoreSettingsEntry(value, kind));
  if (new Set(items.map(item => item.id)).size !== items.length) invalidResponse();
  for (const item of items) { if (query.status !== 'all' && item.enabled !== (query.status === 'normal')) invalidResponse(); if (query.hallId !== null && item.kind === 'warehouses' && item.hall.id !== query.hallId) invalidResponse(); if (grant) checkGrant(item, grant); }
  return Object.freeze({ page, pageSize: query.pageSize, total, items: Object.freeze(items) });
}
export function validateStoreSettingsDetail(value: unknown, kind: StoreSettingsKind, parameters: StoreSettingsDetailQuery, grant?: StoreSettingsReadGrant): StoreSettingsDetail {
  const query = parseStoreSettingsDetailQuery(parameters), row = record(value, ['item'], invalidResponse);
  const item = row.item === null ? null : validateStoreSettingsEntry(row.item, kind);
  if (item !== null) { if (item.id !== query.id) invalidResponse(); if (grant) checkGrant(item, grant); }
  return Object.freeze({ item });
}
