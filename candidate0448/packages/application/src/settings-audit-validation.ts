import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { businessDate, entityId } from "../../domain/src/values.ts";
import { partyObject } from "./party-maintenance-validation.ts";
import { SETTINGS_AUDIT_ACTIONS, SETTINGS_AUDIT_FIELDS, SETTINGS_AUDIT_MODULES } from "./settings-audit-ports.ts";
import type { SettingsAuditField, SettingsAuditItem, SettingsAuditModule, SettingsAuditQuery, SettingsAuditValue } from "./settings-audit-ports.ts";
function invalid(): never { throw new DomainError("INVALID_SETTINGS_AUDIT_QUERY", "Invalid operation log query"); }
function data(condition: unknown): asserts condition { requireDomain(condition, "INVALID_SETTINGS_AUDIT_DATA", "Invalid controlled operation log data"); }
export function activeSettingsAudit(signal: AbortSignal): void { requireDomain(signal instanceof AbortSignal && !signal.aborted, "SETTINGS_AUDIT_ABORTED", "Operation log read cancelled"); }
export function parseSettingsAuditQuery(input: unknown): SettingsAuditQuery {
  try {
    const r = partyObject(input, ["module", "objectId", "objectSearch", "actorSearch", "action", "dateFrom", "dateTo", "page", "pageSize"]);
    if (r.module !== "ALL" && !SETTINGS_AUDIT_MODULES.includes(r.module as SettingsAuditModule)) invalid();
    if (r.action !== "ALL" && !SETTINGS_AUDIT_ACTIONS.includes(r.action as never)) invalid();
    if (r.objectId !== null && (r.module === "ALL" || typeof r.objectId !== "string")) invalid();
    const objectId = r.objectId === null ? null : entityId("product", r.objectId as string);
    for (const v of [r.objectSearch, r.actorSearch]) if (typeof v !== "string" || v.length > 200 || /[\x00-\x1f\x7f]/.test(v)) invalid();
    const date = (v: unknown) => { if (v === null) return null; if (typeof v !== "string" || v.startsWith("0000")) invalid(); return businessDate(v); };
    const dateFrom = date(r.dateFrom), dateTo = date(r.dateTo);
    if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) invalid();
    if (typeof r.page !== "number" || !Number.isSafeInteger(r.page) || r.page < 1 || ![20, 50, 100].includes(r.pageSize as number)
      || !Number.isSafeInteger((r.page - 1) * (r.pageSize as number))) invalid();
    return Object.freeze({ module: r.module as SettingsAuditQuery["module"], objectId, objectSearch: r.objectSearch as string, actorSearch: r.actorSearch as string,
      action: r.action as SettingsAuditQuery["action"], dateFrom, dateTo, page: r.page, pageSize: r.pageSize as SettingsAuditQuery["pageSize"] });
  } catch { return invalid(); }
}
export function settingsAuditModulesFor(role: string, query: SettingsAuditQuery): readonly SettingsAuditModule[] {
  requireDomain(role === "ADMIN" || role === "WAREHOUSE", "FORBIDDEN", "Current role cannot read settings logs");
  const allowed = SETTINGS_AUDIT_MODULES.filter(kind => role === "ADMIN" || (kind !== "STAFF" && kind !== "ACCOUNT"));
  requireDomain(query.module === "ALL" || allowed.includes(query.module), "FORBIDDEN", "Current role cannot read this module log");
  return query.module === "ALL" ? allowed : [query.module];
}
function object(input: unknown): Record<string, unknown> { data(input !== null && typeof input === "object" && !Array.isArray(input) && Object.getPrototypeOf(input) === Object.prototype); return input as Record<string, unknown>; }
function text(input: unknown): string | null { if (input === null) return null; data(typeof input === "string" && input.length <= 32768 && !input.includes("\0")); return input; }
function id(input: unknown): string { data(typeof input === "string"); try { return entityId("product", input); } catch { throw new DomainError("INVALID_SETTINGS_AUDIT_DATA", "Invalid log identity"); } }
function positive(input: unknown): number | null { if (input === null) return null; data(typeof input === "number" && Number.isInteger(input) && input > 0 && input <= 2147483647); return input; }
function timestamp(input: unknown): string | null { if (input === null) return null; const v = text(input)!; data(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,19) === v.slice(0,19)); return v; }
function fieldValue(source: Record<string, unknown>, f: SettingsAuditField): SettingsAuditValue {
  if (!Object.hasOwn(source, f.key)) return { state: "ABSENT" }; const value = source[f.key];
  if (value === null) return { state: "NULL" };
  if (f.format === "rows") { const r = object(value); data(Object.keys(r).length === 1 && Object.hasOwn(r, "rowCount") && Number.isSafeInteger(r.rowCount) && (r.rowCount as number) >= 0); return { state: "ROW_COUNT", value: r.rowCount as number }; }
  if (f.format === "ids") { data(Array.isArray(value) && value.length <= 1000); const ids = value.map(id); data(new Set(ids).size === ids.length); return { state: "IDS", value: ids }; }
  if (f.valueType === "boolean") data(typeof value === "boolean");
  else if (f.valueType === "integer") data(typeof value === "number" && Number.isSafeInteger(value));
  else {
    data(typeof value === "string"); text(value);
    if (f.valueType === "uuid") id(value);
    if (f.valueType === "money") data(/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value));
    if (f.valueType === "timestamp") data(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
  }
  return { state: "VALUE", value: value as string | boolean | number };
}
export function projectSettingsAuditItem(input: unknown): SettingsAuditItem {
  const r = object(input); data(SETTINGS_AUDIT_MODULES.includes(r.module as SettingsAuditModule)); const module = r.module as SettingsAuditModule;
  const fields = SETTINGS_AUDIT_FIELDS[module], before = r.before_values === null ? {} : object(r.before_values), after = object(r.after_values);
  for (const values of [before, after]) data(Object.keys(values).every(key => fields.some(f => f.key === key)));
  data(r.action === null || SETTINGS_AUDIT_ACTIONS.includes(r.action as never));
  const credentialActions = r.credential_actions; data(Array.isArray(credentialActions) && credentialActions.length <= 1000 && credentialActions.every(a => a === "CREATE" || a === "RESET_PASSWORD"));
  data(module === "STAFF" || module === "ACCOUNT" || credentialActions.length === 0);
  return { id: id(r.id), operationId: id(r.operation_id), occurredAt: timestamp(r.occurred_at), module,
    object: { id: id(r.object_id), name: text(r.object_name), code: text(r.object_code) },
    actor: { accountId: r.actor_account_id === null ? null : id(r.actor_account_id), staffId: r.actor_staff_id === null ? null : id(r.actor_staff_id), name: text(r.actor_name), loginName: text(r.actor_login_name) },
    action: r.action as SettingsAuditItem["action"], oldVersion: positive(r.old_version), newVersion: positive(r.new_version),
    changes: fields.filter(f => Object.hasOwn(before, f.key) || Object.hasOwn(after, f.key)).map(f => ({ field: f.key, label: f.label, before: fieldValue(before, f), after: fieldValue(after, f) })),
    credentialActions: [...credentialActions] as ("CREATE" | "RESET_PASSWORD")[] };
}
