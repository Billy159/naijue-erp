import { DomainError } from "../../domain/src/errors.ts";
import { quantity } from "../../domain/src/values.ts";

/** Storage/response facts, never a reconstruction from a current inventory read. */
export type InventoryLedgerBalanceTransition =
  | { readonly state: "UNKNOWN"; readonly before: null; readonly after: null; readonly reason: "NO_RECORDED_BALANCE_TRANSITION" }
  | { readonly state: "KNOWN"; readonly before: string; readonly after: string; readonly reason: "RECORDED_BALANCE_TRANSITION" };
export interface InventoryLedgerBalanceContext {
  readonly eventKind: "APPROVE" | "UNAPPROVE" | "CUTOFF_BASELINE" | "HISTORY_REVISION";
  readonly sourceKind: "SALES" | "TRANSFER" | "CUTOFF_BASELINE" | "HISTORY_REVISION";
  readonly quantityDelta: string;
}
type Reject = () => never;
const invalid: Reject = () => { throw new DomainError("INVALID_INVENTORY_LEDGER_RESPONSE", "Invalid recorded inventory balance transition"); };
const unknown = (): InventoryLedgerBalanceTransition => Object.freeze({ state: "UNKNOWN", before: null, after: null, reason: "NO_RECORDED_BALANCE_TRANSITION" });
function delta(context: InventoryLedgerBalanceContext, reject: Reject): bigint {
  try { const value = quantity(context.quantityDelta); if (value === 0n) reject(); return value; } catch { return reject(); }
}
/** A strict pure consumer contract. This function does not grant source access,
 * prove persistence, or authorize a schema/writer rollout. */
export function checkedInventoryLedgerBalanceTransition(value: unknown, context: InventoryLedgerBalanceContext, reject: Reject = invalid): InventoryLedgerBalanceTransition {
  const change = delta(context, reject);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject();
  const keys = ["state", "before", "after", "reason"];
  if (Reflect.ownKeys(value).length !== keys.length) reject();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) reject();
  }
  const row = value as Record<string, unknown>;
  if (row.state === "UNKNOWN") {
    if (row.before !== null || row.after !== null || row.reason !== "NO_RECORDED_BALANCE_TRANSITION") reject();
    return unknown();
  }
  if (row.state !== "KNOWN" || row.reason !== "RECORDED_BALANCE_TRANSITION"
    || typeof row.before !== "string" || typeof row.after !== "string"
    || (context.eventKind !== "APPROVE" && context.eventKind !== "UNAPPROVE")
    || (context.sourceKind !== "SALES" && context.sourceKind !== "TRANSFER")) reject();
  try {
    // Each endpoint is independently signed-int64 checked; BigInt addition has
    // no intermediate signed-int64 overflow and never rounds through Number.
    if (quantity(row.before) + change !== quantity(row.after)) reject();
  } catch { return reject(); }
  return Object.freeze({ state: "KNOWN", before: row.before, after: row.after, reason: "RECORDED_BALANCE_TRANSITION" });
}
/** Prepared for the future numbered PG projection. Only explicit NULL/NULL is
 * unknown; missing columns, partial NULLs and driver number coercion fail closed.
 * Not wired to SQL until the approved schema/issuer proof exists. */
export function decodeInventoryLedgerBalancePair(before: unknown, after: unknown, context: InventoryLedgerBalanceContext, reject: Reject = invalid): InventoryLedgerBalanceTransition {
  if (before === null && after === null) { delta(context, reject); return unknown(); }
  return checkedInventoryLedgerBalanceTransition({ state: "KNOWN", before, after, reason: "RECORDED_BALANCE_TRANSITION" }, context, reject);
}
