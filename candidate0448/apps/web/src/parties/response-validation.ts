import type { PartyCandidate, PartyCandidateSearch, PartyCommand, PartyKind, PartyPage, PartyRecord, PartyReceipt, PartyResult, PartySearch } from './contracts.ts';

function reject(): never { throw new TypeError('Invalid independent party contract.'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) reject();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) reject();
  return row;
}
export function validId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value); }
export function validKey(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value); }
export function validName(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !value.includes('\0'); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 2147483647; }
function code(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && !value.includes('\0'); }
function timestamp(value: unknown): value is string { return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
function nullableTimestamp(value: unknown): value is string | null { return value === null || timestamp(value); }
export function validateKind(kind: unknown): asserts kind is PartyKind { if (kind !== 'CUSTOMER' && kind !== 'SUPPLIER') reject(); }
export function validateCommand(command: PartyCommand): PartyCommand {
  const action = command?.action;
  const row = object(command, action === 'CREATE' ? ['action', 'requestKey', 'name'] : action === 'EDIT' ? ['action', 'requestKey', 'id', 'expectedVersion', 'name', 'enabled'] : ['action', 'requestKey', 'id', 'expectedVersion']);
  if (!['CREATE', 'EDIT', 'DISABLE', 'RESTORE'].includes(action) || !validKey(row.requestKey)) reject();
  if (action !== 'CREATE' && (!validId(row.id) || !version(row.expectedVersion))) reject();
  if ((action === 'CREATE' || action === 'EDIT') && !validName(row.name)) reject();
  if (action === 'EDIT' && typeof row.enabled !== 'boolean') reject();
  return Object.freeze({ ...command });
}
function searchBase(row: Record<string, unknown>): void {
  if (typeof row.search !== 'string' || row.search.length > 200 || row.search.includes('\0') || !Number.isSafeInteger(row.page) || (row.page as number) < 1
    || ![20, 50, 100].includes(row.pageSize as number) || !Number.isSafeInteger(((row.page as number) - 1) * (row.pageSize as number))) reject();
}
export function validateSearch(query: PartySearch): PartySearch {
  const row = object(query, ['search', 'enabled', 'page', 'pageSize']); searchBase(row);
  if (!['ALL', 'ENABLED', 'DISABLED'].includes(row.enabled as string)) reject(); return Object.freeze({ ...query });
}
export function validateCandidateSearch(query: PartyCandidateSearch): PartyCandidateSearch {
  searchBase(object(query, ['search', 'page', 'pageSize'])); return Object.freeze({ ...query });
}
function record(value: unknown): PartyRecord {
  const row = object(value, ['id', 'code', 'name', 'enabled', 'version', 'createdAt', 'updatedAt']);
  if (!validId(row.id) || !code(row.code) || !validName(row.name) || typeof row.enabled !== 'boolean' || !version(row.version) || !nullableTimestamp(row.createdAt) || !nullableTimestamp(row.updatedAt)) reject();
  return Object.freeze({ id: row.id, code: row.code, name: row.name, enabled: row.enabled, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt });
}
export function validateDetail(value: unknown, id: string): PartyRecord { const result = record(value); if (result.id !== id) reject(); return result; }
function page<T>(value: unknown, query: PartyCandidateSearch, decode: (value: unknown) => T & { readonly id: string }): PartyPage<T> {
  const row = object(value, ['items', 'total', 'page', 'pageSize']);
  if (!Number.isSafeInteger(row.total) || (row.total as number) < 0 || row.page !== query.page || row.pageSize !== query.pageSize || !Array.isArray(row.items) || row.items.length > query.pageSize) reject();
  const expectedLength = Math.max(0, Math.min(query.pageSize, (row.total as number) - (query.page - 1) * query.pageSize));
  if (row.items.length !== expectedLength) reject();
  const items = row.items.map(decode); if (new Set(items.map(item => item.id)).size !== items.length) reject();
  return Object.freeze({ items: Object.freeze(items), total: row.total as number, page: query.page, pageSize: query.pageSize });
}
export function validateList(value: unknown, query: PartySearch): PartyPage<PartyRecord> {
  validateSearch(query); const result = page(value, query, record);
  if (result.items.some(item => query.enabled !== 'ALL' && item.enabled !== (query.enabled === 'ENABLED'))) reject(); return result;
}
export function validateCandidates(value: unknown, query: PartyCandidateSearch): PartyPage<PartyCandidate> {
  validateCandidateSearch(query); return page(value, query, value => {
    const row = object(value, ['id', 'code', 'name']); if (!validId(row.id) || !code(row.code) || !validName(row.name)) reject();
    return Object.freeze({ id: row.id, code: row.code, name: row.name });
  });
}
function result(value: unknown, kind: PartyKind): PartyResult {
  const row = object(value, ['operationId', 'kind', 'partyId', 'version', 'code', 'enabled']);
  if (!validId(row.operationId) || row.kind !== kind || !validId(row.partyId) || !version(row.version) || !code(row.code) || typeof row.enabled !== 'boolean') reject();
  return Object.freeze({ operationId: row.operationId, kind, partyId: row.partyId, version: row.version, code: row.code, enabled: row.enabled });
}
export function validateResult(value: unknown, kind: PartyKind, command: PartyCommand): PartyResult {
  validateKind(kind); validateCommand(command); const row = result(value, kind);
  if (command.action === 'CREATE') {
    if (row.version !== 1 || !row.enabled || !(kind === 'CUSTOMER' ? /^KH\d{6,}$/ : /^GYS\d{6,}$/).test(row.code) || /^\D+0+$/.test(row.code)) reject();
  } else if (row.partyId !== command.id || row.version !== command.expectedVersion + 1 || command.action === 'DISABLE' && row.enabled || command.action === 'RESTORE' && !row.enabled || command.action === 'EDIT' && row.enabled !== command.enabled) reject();
  return row;
}
export function validateReceipt(value: unknown, kind: PartyKind, key: string, command?: PartyCommand): PartyReceipt {
  validateKind(kind); if (!validKey(key)) reject();
  const row = object(value, ['requestKey', 'action', 'status', 'completedAt', 'result']);
  if (row.requestKey !== key || !['CREATE', 'EDIT', 'DISABLE', 'RESTORE'].includes(row.action as string) || row.status !== 'COMMITTED' || !timestamp(row.completedAt)
    || command && (command.requestKey !== key || row.action !== command.action)) reject();
  return Object.freeze({ requestKey: key, action: row.action as PartyReceipt['action'], status: 'COMMITTED', completedAt: row.completedAt,
    result: command ? validateResult(row.result, kind, command) : result(row.result, kind) });
}
