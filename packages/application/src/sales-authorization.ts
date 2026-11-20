import type { SalesDocument, SalesDraft } from "../../domain/src/documents.ts";
import { requireDomain } from "../../domain/src/errors.ts";
import { entityId } from "../../domain/src/values.ts";
import type { ActorContext, SalesAction, SalesAuthorization, SalesCurrentIdentity } from "./ports.ts";

function validId(kind: "account" | "staff" | "hall", value: unknown): boolean {
  try { return typeof value === "string" && entityId(kind, value) === value; } catch { return false; }
}
/** Pure action policy only. State transitions, references, prices, settlement,
 * versions, inventory provenance and cutoff-history guards remain separate. */
export function assertSalesActionAllowed(actor: ActorContext, action: SalesAction,
  document: SalesDocument | SalesDraft, identity: SalesCurrentIdentity | undefined): void {
  requireDomain(identity && validId("account", actor.accountId) && identity.accountId === actor.accountId
    && validId("staff", identity.staffId) && identity.loginEnabled === true && identity.employmentStatus === "在职"
    && ["ADMIN", "WAREHOUSE", "SALESPERSON"].includes(identity.role)
    && identity.hallId === actor.hallId
    && (identity.hallId === null ? identity.hallEnabled === null : validId("hall", identity.hallId) && identity.hallEnabled === true),
  "FORBIDDEN", "Current account is not authorized for sales actions");
  requireDomain(["SAVE", "APPROVE", "UNAPPROVE", "VOID"].includes(action), "FORBIDDEN", "Unsupported sales action");
  if (identity.role !== "SALESPERSON") return;
  requireDomain(identity.hallId !== null && document.header.hallId === identity.hallId,
    "FORBIDDEN", "Salesperson actions require their current hall");
  requireDomain(action !== "UNAPPROVE", "FORBIDDEN", "Salespeople cannot unapprove sales");
  if (action === "APPROVE") requireDomain("createdByAccountId" in document.header
    && document.header.createdByAccountId === actor.accountId,
  "FORBIDDEN", "Salespeople can approve only a stored document created by their own account");
  // No DRAFT predicate here: replay/receipt access checks the current record but
  // may return an original SAVE/VOID result after later legitimate transitions.
}

/** Explicit opt-in transaction-bound ACTION policy, not the complete production
 * SalesAuthorization/reference or economics assembly. Compose a trusted reference
 * scope provider as well before enabling writes. No pool, session lookup, route,
 * fallback role or cross-request cache is created by this factory. */
export function createSalesActionAuthorization(): SalesAuthorization {
  return Object.freeze<SalesAuthorization>({ async assertAllowed(actor, action, document, tx) {
    requireDomain(tx && typeof tx.getCurrentSalesIdentity === "function", "FORBIDDEN", "Sales action policy requires the command transaction");
    const identity = await tx.getCurrentSalesIdentity(actor.accountId);
    assertSalesActionAllowed(actor, action, document, identity);
  } });
}
