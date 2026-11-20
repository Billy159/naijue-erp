import { requireDomain } from "../../domain/src/errors.ts";
import { checkedProductActor } from "./product-query-validation.ts";
import { activeSettingsAudit, parseSettingsAuditQuery, projectSettingsAuditItem, settingsAuditModulesFor } from "./settings-audit-validation.ts";
import type { ActorContext } from "./ports.ts";
import type { SettingsAuditPage, SettingsAuditReader } from "./settings-audit-ports.ts";
export function createSettingsAuditService(reader: SettingsAuditReader) {
  if (typeof reader?.read !== "function") throw new TypeError("Settings logs require an explicit authorized reader");
  return Object.freeze({ async query(actorInput: ActorContext, input: unknown, signal: AbortSignal): Promise<SettingsAuditPage> {
    const actor = checkedProductActor(actorInput), query = parseSettingsAuditQuery(input); activeSettingsAudit(signal);
    const raw = await reader.read(actor, query, signal); activeSettingsAudit(signal); const modules = settingsAuditModulesFor(raw.role, query);
    requireDomain(typeof raw.total === "string" && /^(?:0|[1-9]\d*)$/.test(raw.total) && BigInt(raw.total) <= BigInt(Number.MAX_SAFE_INTEGER), "INVALID_SETTINGS_AUDIT_DATA", "Invalid exact log count");
    const total = Number(raw.total); requireDomain(Array.isArray(raw.items) && raw.items.length === Math.min(query.pageSize, Math.max(0, total - (query.page - 1) * query.pageSize)), "INVALID_SETTINGS_AUDIT_DATA", "Inconsistent bounded log page");
    const ids = new Set<string>(), items = raw.items.map(projectSettingsAuditItem);
    for (const item of items) { requireDomain(!ids.has(item.id) && modules.includes(item.module) && (query.objectId === null || item.object.id === query.objectId), "INVALID_SETTINGS_AUDIT_DATA", "Log scope differs from authorized query"); ids.add(item.id); }
    return { items, total, page: query.page, pageSize: query.pageSize };
  } });
}
