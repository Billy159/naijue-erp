import type { PartyReadAuthorization } from "./party-read-ports.ts";
import { checkedPartyActor, partyKind } from "./party-maintenance-validation.ts";
import { activePartyRead } from "./party-read-service.ts";
import { requireDomain } from "../../domain/src/errors.ts";
/** Explicit opt-in source role policy. A candidate grant never grants directory maintenance. */
export function createSourcePartyReadAuthorization(): PartyReadAuthorization {
  const policy: PartyReadAuthorization = { async authorize(actor, intent, signal) {
    activePartyRead(signal); const current = checkedPartyActor(actor), kind = partyKind(intent.kind);
    requireDomain(["LIST", "DETAIL", "CANDIDATES"].includes(intent.operation), "FORBIDDEN", "Only party reads may be authorized");
    requireDomain(intent.operation === "CANDIDATES" || current.role === "ADMIN" || current.role === "WAREHOUSE", "FORBIDDEN", "Party directory role required");
    return Object.freeze({ kind, operation: intent.operation, targetId: intent.operation === "DETAIL" ? intent.id : null });
  } };
  return Object.freeze(policy);
}
