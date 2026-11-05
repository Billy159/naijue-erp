import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyObject, partyRequestKey } from "./party-maintenance-validation.ts";
import type { CatalogueMaintenanceCommand, CatalogueMaintenanceKind, CategoryOrderCommand, CategoryOrderEvidence, CategoryOrderExpected, CategoryOrderResult, CategoryWriteValues, CatalogueEntryWriteValues } from "./catalogue-maintenance-ports.ts";
import { CATALOGUE_SETTINGS_MAX_CATEGORIES } from "./catalogue-settings-read-ports.ts";
function invalid(): never { throw new DomainError("INVALID_CATALOGUE_COMMAND", "Invalid category/color/fit command"); }
export function catalogueMaintenanceKind(input: unknown): CatalogueMaintenanceKind { if (input !== "CATEGORY" && input !== "COLOR" && input !== "FIT") invalid(); return input; }
function object(value: unknown, keys: readonly string[]) { try { return partyObject(value, keys); } catch { return invalid(); } }
function id(value: unknown): string { try { if (typeof value !== "string") invalid(); return entityId("category", value); } catch { return invalid(); } }
function text(value: unknown, limit: number): string { if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > limit) invalid(); return value; }
function version(value: unknown): number { if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) invalid(); return value; }
function order(value: unknown): number { if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) invalid(); return value; }
function expected(value: unknown): readonly CategoryOrderExpected[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > CATALOGUE_SETTINGS_MAX_CATEGORIES) invalid();
  const rows = value.map(v => { const r = object(v, ["id", "expectedVersion"]); return { id: id(r.id), expectedVersion: version(r.expectedVersion) }; });
  if (new Set(rows.map(r => r.id)).size !== rows.length) invalid(); return rows;
}
export function isCategoryOrderCommand(command: CatalogueMaintenanceCommand): command is CategoryOrderCommand { return command.action === "REORDER" || command.action === "UNDO_REORDER"; }
export function checkedCategoryOrderEvidence(value: unknown): CategoryOrderEvidence {
  try {
    const r = object(value, ["parent_id", "moved_id", "undo_of_operation_id", "rows"]);
    if (!Array.isArray(r.rows) || r.rows.length < 2 || r.rows.length > CATALOGUE_SETTINGS_MAX_CATEGORIES) invalid();
    const rows = r.rows.map(v => { const m = object(v, ["id", "version", "display_order"]); return { id: id(m.id), version: version(m.version), display_order: order(m.display_order) }; });
    if (rows.some((m, i) => i > 0 && rows[i - 1]!.id >= m.id)) invalid();
    const moved_id = id(r.moved_id); if (!rows.some(m => m.id === moved_id)) invalid();
    return { parent_id: r.parent_id === null ? null : id(r.parent_id), moved_id, undo_of_operation_id: r.undo_of_operation_id === null ? null : id(r.undo_of_operation_id), rows };
  } catch { throw new DomainError("INVALID_DATABASE_VALUE", "Invalid persisted category order evidence"); }
}
export function checkedCategoryOrderResult(value: unknown): CategoryOrderResult {
  try {
    const r = object(value, ["operationId", "kind", "targetId", "version", "order"]), o = object(r.order, ["parentId", "undoOfOperationId", "members"]);
    if (r.kind !== "CATEGORY" || !Array.isArray(o.members) || o.members.length < 2 || o.members.length > CATALOGUE_SETTINGS_MAX_CATEGORIES) invalid();
    const members = o.members.map(v => { const m = object(v, ["id", "version", "displayOrder"]); return { id: id(m.id), version: version(m.version), displayOrder: order(m.displayOrder) }; });
    if (new Set(members.map(m => m.id)).size !== members.length || members.some((m, i) => i > 0 && (members[i - 1]!.displayOrder > m.displayOrder || members[i - 1]!.displayOrder === m.displayOrder && members[i - 1]!.id >= m.id))) invalid();
    const targetId = id(r.targetId), v = version(r.version); if (!members.some(m => m.id === targetId && m.version === v)) invalid();
    return { operationId: id(r.operationId), kind: "CATEGORY", targetId, version: v, order: { parentId: o.parentId === null ? null : id(o.parentId), undoOfOperationId: o.undoOfOperationId === null ? null : id(o.undoOfOperationId), members } };
  } catch { throw new DomainError("INVALID_DATABASE_VALUE", "Invalid category order result"); }
}
export function parseCatalogueMaintenanceCommand(kindInput: CatalogueMaintenanceKind, input: unknown): CatalogueMaintenanceCommand {
  const kind = catalogueMaintenanceKind(kindInput); if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const action = (input as Record<string, unknown>).action;
  if (action === "REORDER" || action === "UNDO_REORDER") {
    if (kind !== "CATEGORY") invalid();
    const r = object(input, action === "REORDER" ? ["action", "requestKey", "parentId", "movedId", "expectedSiblings", "orderedIds"] : ["action", "requestKey", "originalOperationId", "expectedSiblings"]);
    const requestKey = partyRequestKey(r.requestKey), expectedSiblings = expected(r.expectedSiblings);
    if (action === "UNDO_REORDER") return { action, requestKey, originalOperationId: id(r.originalOperationId), expectedSiblings };
    if (!Array.isArray(r.orderedIds) || r.orderedIds.length !== expectedSiblings.length) invalid();
    const orderedIds = r.orderedIds.map(id), movedId = id(r.movedId), identities = new Set(expectedSiblings.map(m => m.id));
    if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some(key => !identities.has(key)) || !identities.has(movedId)) invalid();
    return { action, requestKey, parentId: r.parentId === null ? null : id(r.parentId), movedId, expectedSiblings, orderedIds };
  }
  if (action !== "CREATE" && action !== "EDIT" && action !== "DELETE" && action !== "DISABLE" && action !== "RESTORE" || kind === "CATEGORY" && (action === "DISABLE" || action === "RESTORE")) invalid();
  const full = action === "CREATE" || action === "EDIT", row = object(input, ["action", "requestKey", ...(action === "CREATE" ? [] : ["id", "expectedVersion"]), ...(full ? ["values"] : [])]), requestKey = partyRequestKey(row.requestKey);
  const target = action === "CREATE" ? null : id(row.id), version = row.expectedVersion;
  if (action !== "CREATE" && (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > 2147483647)) invalid();
  if (!full) return { action, requestKey, id: target!, expectedVersion: version as number };
  const values = object(row.values, kind === "CATEGORY" ? ["name", "parentId", "displayOrder"] : ["name", "code", "enabled"]), name = text(values.name, 40);
  let parsed: CategoryWriteValues | CatalogueEntryWriteValues;
  if (kind === "CATEGORY") {
    if (typeof values.displayOrder !== "number" || !Number.isInteger(values.displayOrder) || values.displayOrder < -2147483648 || values.displayOrder > 2147483647) invalid();
    parsed = { name, parentId: values.parentId === null ? null : id(values.parentId), displayOrder: values.displayOrder };
  } else {
    const code = text(values.code, 12); if (typeof values.enabled !== "boolean" || kind === "FIT" && !/^[A-Z]$/.test(code)) invalid(); parsed = { name, code, enabled: values.enabled };
  }
  return action === "CREATE" ? { action, requestKey, values: parsed } : { action, requestKey, id: target!, expectedVersion: version as number, values: parsed };
}
