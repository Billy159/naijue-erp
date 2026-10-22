import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyObject, partyRequestKey } from "./party-maintenance-validation.ts";
import type { CatalogueMaintenanceCommand, CatalogueMaintenanceKind, CategoryWriteValues, CatalogueEntryWriteValues } from "./catalogue-maintenance-ports.ts";
function invalid(): never { throw new DomainError("INVALID_CATALOGUE_COMMAND", "Invalid category/color/fit command"); }
export function catalogueMaintenanceKind(input: unknown): CatalogueMaintenanceKind { if (input !== "CATEGORY" && input !== "COLOR" && input !== "FIT") invalid(); return input; }
function object(value: unknown, keys: readonly string[]) { try { return partyObject(value, keys); } catch { return invalid(); } }
function id(value: unknown): string { try { if (typeof value !== "string") invalid(); return entityId("category", value); } catch { return invalid(); } }
function text(value: unknown, limit: number): string { if (typeof value !== "string" || !value.trim() || value.includes("\0") || value.length > limit) invalid(); return value; }
export function parseCatalogueMaintenanceCommand(kindInput: CatalogueMaintenanceKind, input: unknown): CatalogueMaintenanceCommand {
  const kind = catalogueMaintenanceKind(kindInput); if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const action = (input as Record<string, unknown>).action;
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
