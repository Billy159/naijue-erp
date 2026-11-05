import type { PartyActor } from "../../../packages/application/src/party-maintenance-ports.ts";
import { checkedPartyActor } from "../../../packages/application/src/party-maintenance-validation.ts";
import type { AuthenticationHttpOptions } from "./authentication.ts";
import type { PartyAuthenticationInput } from "./party-maintenance-http.ts";

/** Current server session resolution, preserving the authenticated role. No client role,
 * insecure origin inference, credential fallback or account creation is supported. */
export function createPartySessionAuthenticator(options: AuthenticationHttpOptions): (input: PartyAuthenticationInput) => Promise<PartyActor | null> {
  let origin: URL;
  try { origin = new URL(options?.trustedOrigin); } catch { throw new TypeError("Party sessions require an explicit trusted HTTPS origin"); }
  if (origin.protocol !== "https:" || origin.origin !== options.trustedOrigin || origin.username || origin.password || typeof options?.service?.resolve !== "function") throw new TypeError("Party sessions require an explicit trusted authentication service and HTTPS origin");
  return async input => {
    if (!input || typeof input.method !== "string" || typeof input.url !== "string" || !input.url.startsWith("/") || input.url.startsWith("//")) return null;
    const headers = input.headers;
    if (headers.authorization !== undefined || headers.origin !== undefined && headers.origin !== options.trustedOrigin
      || headers["sec-fetch-site"] !== undefined && headers["sec-fetch-site"] !== "same-origin" && headers["sec-fetch-site"] !== "none"
      || !["GET", "HEAD", "OPTIONS"].includes(input.method) && headers.origin !== options.trustedOrigin) return null;
    const cookies = headers.cookie;
    if (cookies === undefined) return null;
    if (typeof cookies !== "string" || cookies.length > 8192) return null;
    let token: string | null = null;
    for (const part of cookies.split(";")) {
      const equals = part.indexOf("=");
      if (equals < 0 || part.slice(0, equals).trim() !== "__Host-naijue_session") continue;
      if (token !== null) return null;
      token = part.slice(equals + 1).trim(); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    }
    if (token === null) return null;
    const principal = await options.service.resolve(token);
    return principal ? checkedPartyActor({ accountId: principal.accountId, hallId: principal.hallId, role: principal.role as PartyActor["role"] }) : null;
  };
}
