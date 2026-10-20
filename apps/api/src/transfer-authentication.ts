import { entityId } from "../../../packages/domain/src/values.ts";
import type { TransferActor, TransferRole } from "../../../packages/application/src/transfer-ports.ts";
import type { AuthenticationHttpOptions } from "./authentication.ts";
import { createPartySessionAuthenticator } from "./party-authentication.ts";
import type { TransferQueryAuthenticationInput } from "./transfer-query-http.ts";

/** Reuse the current role-preserving cookie/session boundary, not party business authorization.
 * Independently map its trusted facts to the exact transfer actor vocabulary. The canonical
 * createSourceConfirmedTransferQueryAuthorization remains an explicit, separate host choice. */
export function createTransferSessionAuthenticator(options: AuthenticationHttpOptions): (input: TransferQueryAuthenticationInput) => Promise<TransferActor | null> {
  const service = options?.service;
  if (typeof service?.resolve !== "function" || typeof service?.login !== "function" || typeof service?.logout !== "function"
    || typeof service?.changeOwnPassword !== "function") throw new TypeError("Transfer sessions require an explicit trusted authentication service");
  // The shared resolver closes over its options. Capture those options and real service
  // methods here so mutation of the caller's origin or method properties cannot replace
  // the HTTPS credential boundary. The underlying service still resolves current facts.
  const authenticateSession = createPartySessionAuthenticator(Object.freeze({ trustedOrigin: options.trustedOrigin, service: Object.freeze({
    resolve: service.resolve.bind(service), login: service.login.bind(service), logout: service.logout.bind(service), changeOwnPassword: service.changeOwnPassword.bind(service)
  }) }));
  return async input => {
    const sessionActor = await authenticateSession(input);
    if (sessionActor === null) return null;
    let role: TransferRole;
    switch (sessionActor.role) {
      case "ADMIN": case "WAREHOUSE": case "SALESPERSON": role = sessionActor.role; break;
      default: throw new Error("Invalid trusted transfer session role");
    }
    try {
      const accountId = entityId("account", sessionActor.accountId);
      const hallId = sessionActor.hallId === null ? null : entityId("hall", sessionActor.hallId);
      // This is also required by the canonical source-confirmed transfer read policy.
      if (role === "SALESPERSON" && hallId === null) return null;
      return Object.freeze({ accountId, hallId, role });
    } catch { throw new Error("Invalid trusted transfer session identity"); }
  };
}
