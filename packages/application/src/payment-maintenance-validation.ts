import { DomainError, requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import { partyName, partyObject, partyRequestKey } from "./party-maintenance-validation.ts";
import type { PaymentMaintenanceCommand, PaymentMaintenanceKind, PaymentValues, PaymentAccountValues } from "./payment-maintenance-ports.ts";
export function paymentKind(value: unknown): PaymentMaintenanceKind {
  requireDomain(value === "PAYMENT_METHOD" || value === "PAYMENT_ACCOUNT", "INVALID_PAYMENT_COMMAND", "Unknown payment family"); return value;
}
function invalid(): never { throw new DomainError("INVALID_PAYMENT_COMMAND", "Invalid payment maintenance input"); }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> { try { return partyObject(input, keys); } catch { return invalid(); } }
export function paymentVersion(input: unknown): number { if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > 2147483647) invalid(); return input; }
function id(input: unknown): string { try { if (typeof input !== "string") invalid(); return entityId("paymentAccount", input); } catch { return invalid(); } }
export function parsePaymentCommand(kindInput: PaymentMaintenanceKind, input: unknown): PaymentMaintenanceCommand {
  const kind = paymentKind(kindInput); if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const action = (input as Record<string, unknown>).action; if (!["CREATE", "EDIT", "DISABLE", "RESTORE"].includes(action as string)) invalid();
  const full = action === "CREATE" || action === "EDIT";
  const r = object(input, ["action", "requestKey", ...(action === "CREATE" ? [] : ["id", "expectedVersion"]), ...(full ? ["values"] : [])]);
  const requestKey = partyRequestKey(r.requestKey);
  if (!full) return { action: action as "DISABLE" | "RESTORE", requestKey, id: id(r.id), expectedVersion: paymentVersion(r.expectedVersion) };
  const v = object(r.values, kind === "PAYMENT_METHOD" ? ["name", "enabled"] : ["name", "enabled", "paymentMethodId", "hallIds"]);
  if (typeof v.enabled !== "boolean") invalid(); let values: PaymentValues | PaymentAccountValues = { name: partyName(v.name), enabled: v.enabled };
  if (kind === "PAYMENT_ACCOUNT") {
    if (!Array.isArray(v.hallIds)) invalid(); requireDomain(v.hallIds.length <= 5000, "PAYMENT_RELATION_TOO_LARGE", "Hall relation exceeds technical bound");
    const hallIds = v.hallIds.map(id); requireDomain(new Set(hallIds).size === hallIds.length, "INVALID_PAYMENT_COMMAND", "Duplicate hall association");
    values = { ...values, paymentMethodId: id(v.paymentMethodId), hallIds: hallIds.sort() };
  }
  return action === "CREATE" ? { action, requestKey, values } : { action: "EDIT", requestKey, id: id(r.id), expectedVersion: paymentVersion(r.expectedVersion), values };
}
