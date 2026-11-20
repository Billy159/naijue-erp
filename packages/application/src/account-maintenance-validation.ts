import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyObject, partyRequestKey } from "./party-maintenance-validation.ts";
import type { AccountMaintenanceCommand } from "./account-maintenance-ports.ts";
function invalid(): never { throw new DomainError("INVALID_ACCOUNT_COMMAND", "Invalid account maintenance command"); }
function object(value: unknown, keys: readonly string[]) { try { return partyObject(value, keys); } catch { return invalid(); } }
function id(value: unknown): string { try { if (typeof value !== "string") invalid(); return entityId("account", value); } catch { return invalid(); } }
export function accountLoginName(value: unknown): string { if (typeof value !== "string" || !value.trim() || value.includes("\0") || Buffer.byteLength(value, "utf8") > 256) invalid(); return value; }
export function accountPassword(value: unknown): string { if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > 1024) invalid(); return value; }
export function parseAccountMaintenanceCommand(input: unknown): AccountMaintenanceCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid(); const action = (input as Record<string, unknown>).action;
  if (action !== "CREATE" && action !== "EDIT" && action !== "DISABLE" && action !== "RESTORE" && action !== "RESET_PASSWORD") invalid();
  const row = object(input, ["action", "requestKey", ...(action === "CREATE" ? [] : ["id", "expectedVersion"]), ...(action === "CREATE" || action === "EDIT" ? ["values"] : action === "RESET_PASSWORD" ? ["password"] : [])]), requestKey = partyRequestKey(row.requestKey);
  const target = action === "CREATE" ? null : id(row.id), version = row.expectedVersion;
  if (action !== "CREATE" && (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > 2147483647)) invalid();
  if (action === "CREATE" || action === "EDIT") {
    const v = object(row.values, action === "CREATE" ? ["staffId", "loginName", "loginEnabled", "password"] : ["loginName", "loginEnabled"]); if (typeof v.loginEnabled !== "boolean") invalid();
    const values = { loginName: accountLoginName(v.loginName), loginEnabled: v.loginEnabled };
    return action === "CREATE" ? { action, requestKey, values: { ...values, staffId: id(v.staffId), password: accountPassword(v.password) } } : { action, requestKey, id: target!, expectedVersion: version as number, values };
  }
  return action === "RESET_PASSWORD" ? { action, requestKey, id: target!, expectedVersion: version as number, password: accountPassword(row.password) } : { action, requestKey, id: target!, expectedVersion: version as number };
}
