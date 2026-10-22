import { SETTINGS_AUDIT_FIELDS, type SettingsAuditField } from '../../../../../packages/application/src/settings-audit-ports.ts';
import { createHttpJsonQuery, HttpQueryError, type HttpQueryOptions } from '../../transport/http-query.ts';
import { auditActions, auditModules, type SettingsAuditItem, type SettingsAuditPage, type SettingsAuditQuery, type SettingsAuditReader, type SettingsAuditValue } from './contracts.ts';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string' && v.length <= 32768 && !v.includes('\0');
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const version = (v: unknown): v is number | null => v === null || integer(v) && v >= 1 && v <= 2147483647;
function exact(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new TypeError('Invalid audit shape');
  const row = v as Record<string, unknown>; if (Reflect.ownKeys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) throw new TypeError('Invalid audit shape'); return row;
}
export function validAuditDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function parseSettingsAuditQuery(value: unknown): SettingsAuditQuery {
  const row = exact(value, ['module', 'objectId', 'objectSearch', 'actorSearch', 'action', 'dateFrom', 'dateTo', 'page', 'pageSize']);
  if (row.module !== 'ALL' && !auditModules.includes(row.module as typeof auditModules[number]) || row.objectId !== null && (!uuid(row.objectId) || row.module === 'ALL')
    || typeof row.objectSearch !== 'string' || row.objectSearch.length > 200 || /[\x00-\x1f\x7f]/.test(row.objectSearch)
    || typeof row.actorSearch !== 'string' || row.actorSearch.length > 200 || /[\x00-\x1f\x7f]/.test(row.actorSearch)
    || row.action !== 'ALL' && !auditActions.includes(row.action as typeof auditActions[number])
    || row.dateFrom !== null && !validAuditDate(row.dateFrom) || row.dateTo !== null && !validAuditDate(row.dateTo)
    || typeof row.dateFrom === 'string' && typeof row.dateTo === 'string' && row.dateFrom > row.dateTo
    || !integer(row.page) || row.page < 1 || row.pageSize !== 20 && row.pageSize !== 50 && row.pageSize !== 100 || !Number.isSafeInteger((row.page - 1) * row.pageSize)) throw new TypeError('Invalid settings audit query');
  return { module: row.module as SettingsAuditQuery['module'], objectId: row.objectId as string | null, objectSearch: row.objectSearch, actorSearch: row.actorSearch,
    action: row.action as SettingsAuditQuery['action'], dateFrom: row.dateFrom as string | null, dateTo: row.dateTo as string | null, page: row.page, pageSize: row.pageSize };
}
function value(input: unknown): SettingsAuditValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid audit value');
  const state = (input as { state?: unknown }).state;
  const row = exact(input, state === 'ABSENT' || state === 'NULL' ? ['state'] : ['state', 'value']);
  if (state === 'ABSENT' || state === 'NULL') return Object.freeze({ state });
  if (state === 'VALUE' && (typeof row.value === 'string' || typeof row.value === 'boolean' || integer(row.value))) return Object.freeze({ state, value: row.value });
  if (state === 'IDS' && Array.isArray(row.value) && row.value.length <= 1000 && row.value.every(uuid) && new Set(row.value).size === row.value.length) return Object.freeze({ state, value: Object.freeze([...row.value]) });
  if (state === 'ROW_COUNT' && integer(row.value) && row.value >= 0) return Object.freeze({ state, value: row.value });
  throw new TypeError('Invalid audit value');
}
const timestamp = (v: unknown): v is string | null => v === null || typeof v === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 19) === v.slice(0, 19);
/** W13 safe projection only. Field vocabulary is bound below to the backend's closed schema. */
export function validateSettingsAuditPage(input: unknown, query: SettingsAuditQuery): SettingsAuditPage {
  const page = exact(input, ['items', 'total', 'page', 'pageSize']);
  if (!integer(page.total) || page.total < 0 || page.page !== query.page || page.pageSize !== query.pageSize || !Array.isArray(page.items)
    || page.items.length !== Math.min(query.pageSize, Math.max(0, page.total - (query.page - 1) * query.pageSize))) throw new TypeError('Invalid audit page');
  const items = page.items.map((input: unknown): SettingsAuditItem => {
    const row = exact(input, ['id', 'operationId', 'occurredAt', 'module', 'object', 'actor', 'action', 'oldVersion', 'newVersion', 'changes', 'credentialActions']);
    const object = exact(row.object, ['id', 'name', 'code']), actor = exact(row.actor, ['accountId', 'staffId', 'name', 'loginName']);
    if (!uuid(row.id) || !uuid(row.operationId) || !timestamp(row.occurredAt) || !auditModules.includes(row.module as typeof auditModules[number])
      || query.module !== 'ALL' && row.module !== query.module || !uuid(object.id) || query.objectId !== null && object.id !== query.objectId
      || !nullableText(object.name) || !nullableText(object.code) || actor.accountId !== null && !uuid(actor.accountId) || actor.staffId !== null && !uuid(actor.staffId)
      || !nullableText(actor.name) || !nullableText(actor.loginName) || row.action !== null && !auditActions.includes(row.action as typeof auditActions[number])
      || query.action !== 'ALL' && row.action !== query.action || !version(row.oldVersion) || !version(row.newVersion) || !Array.isArray(row.changes)
      || !Array.isArray(row.credentialActions) || row.credentialActions.length > 1000 || row.module !== 'STAFF' && row.module !== 'ACCOUNT' && row.credentialActions.length !== 0 || !row.credentialActions.every(action => action === 'CREATE' || action === 'RESET_PASSWORD')) throw new TypeError('Invalid audit item');
    const inputModule = row.module;
    const changes = row.changes.map((input: unknown) => {
      const row = exact(input, ['field', 'label', 'before', 'after']);
      if (typeof row.field !== 'string' || typeof row.label !== 'string') throw new TypeError('Invalid audit change');
      const before = value(row.before), after = value(row.after);
      assertSafeChange((inputModule as SettingsAuditItem['module']), row.field, row.label, before, after);
      return Object.freeze({ field: row.field, label: row.label, before, after });
    });
    if (new Set(changes.map(change => change.field)).size !== changes.length) throw new TypeError('Duplicate audit field');
    return Object.freeze({ id: row.id, operationId: row.operationId, occurredAt: row.occurredAt, module: row.module as SettingsAuditItem['module'],
      object: Object.freeze({ id: object.id, name: object.name, code: object.code }), actor: Object.freeze({ accountId: actor.accountId as string | null, staffId: actor.staffId as string | null, name: actor.name, loginName: actor.loginName }),
      action: row.action as SettingsAuditItem['action'], oldVersion: row.oldVersion, newVersion: row.newVersion, changes: Object.freeze(changes), credentialActions: Object.freeze([...row.credentialActions]) });
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new TypeError('Duplicate audit identity');
  return Object.freeze({ items: Object.freeze(items), total: page.total, page: query.page, pageSize: query.pageSize });
}
/** Validate each typed safe value against D2's same closed vocabulary used by SQL projection. */
function assertSafeChange(module: SettingsAuditItem['module'], field: string, label: string, before: SettingsAuditValue, after: SettingsAuditValue): void {
  const definition = SETTINGS_AUDIT_FIELDS[module].find(item => item.key === field);
  if (!definition || label !== definition.label || before.state === 'ABSENT' && after.state === 'ABSENT') throw new TypeError('Uncontrolled audit field');
  checkFieldValue(definition, before); checkFieldValue(definition, after);
}
function checkFieldValue(field: SettingsAuditField, item: SettingsAuditValue): void {
  if (item.state === 'ABSENT' || item.state === 'NULL') return;
  if (field.format === 'rows') { if (item.state !== 'ROW_COUNT') throw new TypeError('Invalid audit rows'); return; }
  if (field.format === 'ids') { if (item.state !== 'IDS') throw new TypeError('Invalid audit IDs'); return; }
  if (item.state !== 'VALUE') throw new TypeError('Invalid audit scalar');
  const v = item.value;
  if (field.valueType === 'boolean') { if (typeof v !== 'boolean') throw new TypeError('Invalid audit boolean'); return; }
  if (field.valueType === 'integer') { if (!integer(v)) throw new TypeError('Invalid audit integer'); return; }
  if (typeof v !== 'string' || !nullableText(v)) throw new TypeError('Invalid audit text');
  if (field.valueType === 'uuid' && !uuid(v) || field.valueType === 'money' && !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(v)
    || field.valueType === 'timestamp' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v)))) throw new TypeError('Invalid typed audit text');
}
export function createSettingsAuditHttpReader(options: HttpQueryOptions): SettingsAuditReader {
  const http = createHttpJsonQuery(options, 8192);
  return Object.freeze<SettingsAuditReader>({ readQuery(read) {
    let query: SettingsAuditQuery;
    try { query = parseSettingsAuditQuery(read.parameters); } catch { return Promise.reject(new HttpQueryError('invalid-request', 'INVALID_SETTINGS_AUDIT_QUERY')); }
    return http.post('/settings/audit/query', query, read.signal, value => validateSettingsAuditPage(value, query));
  } });
}
