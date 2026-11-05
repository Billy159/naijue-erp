import { DomainError } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyObject, partyName, partyRequestKey } from "./party-maintenance-validation.ts";
import { accountLoginName, accountPassword } from "./account-maintenance-validation.ts";
import type { StaffMaintenanceCommand, StaffWriteValues, StaffAccountInput } from "./staff-maintenance-ports.ts";
function invalid(): never { throw new DomainError("INVALID_STAFF_COMMAND", "Invalid staff maintenance command"); }
function object(value: unknown, keys: readonly string[]) { try { return partyObject(value, keys); } catch { return invalid(); } }
function id(value: unknown): string { try { if (typeof value !== "string") invalid(); return entityId("staff", value); } catch { return invalid(); } }
function version(value: unknown): number { if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) invalid(); return value; }
export function parseStaffMaintenanceCommand(input: unknown): StaffMaintenanceCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid(); const action = (input as Record<string, unknown>).action;
  if (action !== "CREATE" && action !== "EDIT" && action !== "LEAVE" && action !== "REINSTATE") invalid();
  const full = action === "CREATE" || action === "EDIT", r = object(input, ["action", "requestKey", ...(action === "CREATE" ? [] : ["id", "expectedVersion"]), ...(full ? ["values", "account"] : [])]), requestKey = partyRequestKey(r.requestKey);
  const target = action === "CREATE" ? null : id(r.id), expected = action === "CREATE" ? null : version(r.expectedVersion);
  if (!full) return { action, requestKey, id: target!, expectedVersion: expected! };
  const v = object(r.values, ["name", "role", "hallId", "contact"]);
  if (v.role !== "ADMIN" && v.role !== "WAREHOUSE" && v.role !== "SALESPERSON") invalid();
  if (v.contact !== null && (typeof v.contact !== "string" || v.contact.includes("\0") || v.contact.length > 2048)) invalid();
  const values: StaffWriteValues = { name: partyName(v.name), role: v.role, hallId: v.hallId === null ? null : id(v.hallId), contact: v.contact };
  if (values.role === "SALESPERSON" && values.hallId === null) invalid();
  let account: StaffAccountInput | null = null;
  if (r.account !== null) {
    const a = object(r.account, ["id", "expectedVersion", "loginName", "loginEnabled", "password"]); if (typeof a.loginEnabled !== "boolean") invalid();
    const accountId = a.id === null ? null : id(a.id), accountVersion = a.expectedVersion === null ? null : version(a.expectedVersion);
    if ((accountId === null) !== (accountVersion === null) || action === "CREATE" && accountId !== null || accountId === null && a.password === null) invalid();
    account = { id: accountId, expectedVersion: accountVersion, loginName: accountLoginName(a.loginName), loginEnabled: a.loginEnabled, password: a.password === null ? null : accountPassword(a.password) };
  }
  return action === "CREATE" ? { action, requestKey, values, account } : { action, requestKey, id: target!, expectedVersion: expected!, values, account };
}
