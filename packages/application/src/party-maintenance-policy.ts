import { requireDomain } from "../../domain/src/errors.ts";
import { checkedPartyActor, partyKind } from "./party-maintenance-validation.ts";
import type { PartyAuthorization } from "./party-maintenance-ports.ts";

/** Frozen Demo maintenance-role evidence: ordinary basic settings ADMIN + WAREHOUSE.
 * The split customer/supplier decision supersedes Demo dual usage, not these roles.
 * Explicit opt-in policy, not an implicit permissive default. Current auth is mandatory. */
export function createSourcePartyAuthorization(): PartyAuthorization {
  return { async assertAllowed(actor, kind, intent) {
    const current = checkedPartyActor(actor); partyKind(kind);
    requireDomain(intent === "CANDIDATES" || current.role === "ADMIN" || current.role === "WAREHOUSE", "FORBIDDEN", "Party maintenance requires an approved maintenance role");
  } };
}
