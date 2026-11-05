import type { AuthenticationPolicy } from "./ports.ts";

/** Narrow source-confirmed account rules. Session lifetime must still be chosen explicitly by the host.
 * Role hall binding here is NOT authorization to read/change business records in all halls. */
export function createSourceAuthenticationPolicy(sessionTtlSeconds: number): AuthenticationPolicy {
  return Object.freeze({
    sessionTtlSeconds,
    activeEmploymentStatuses: Object.freeze(["在职"]),
    roleHallScopes: Object.freeze({ ADMIN: "OPTIONAL_HALL", WAREHOUSE: "OPTIONAL_HALL", SALESPERSON: "REQUIRED_HALL" } as const),
    assertNewPassword(password: string): void {
      // Standard self-change policy confirmed in frozen server/security/passwords.ts, not its maintenance bootstrap exception.
      if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 1024) throw new Error("Password change rejected");
    }
  });
}
