import { createHash, randomBytes } from "node:crypto";
import { entityId } from "../../domain/src/values.ts";
import type { AuthenticationAccount, AuthenticationDependencies, AuthenticationLoginSnapshot, AuthenticationPrincipal, AuthenticationSession, AuthenticationTransaction } from "./ports.ts";
import { assertAuthenticationActive } from './password-work-gate.ts';

export class AuthenticationError extends Error {
  readonly code: "INVALID_AUTH_INPUT" | "INVALID_CREDENTIALS" | "UNAUTHENTICATED" | "PASSWORD_REJECTED";
  constructor(code: AuthenticationError["code"]) {
    super(code === "INVALID_AUTH_INPUT" ? "Authentication input is invalid" : code === "PASSWORD_REJECTED" ? "Password change was rejected" : "Authentication required");
    this.name = "AuthenticationError"; this.code = code;
  }
}
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export function sessionTokenHash(token: string): string | null {
  if (typeof token !== "string" || !TOKEN.test(token) || Buffer.from(token, "base64url").toString("base64url") !== token) return null;
  return createHash("sha256").update("naijue-erp:session:v1:").update(token).digest("hex");
}
function passwordInput(value: string): void {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > 1024) throw new AuthenticationError("INVALID_AUTH_INPUT");
}
function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (typeof value !== "string" || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error("Trusted authentication clock/storage returned an invalid timestamp");
  return parsed;
}
export interface AuthenticationService {
  /** Only explicit successful login creates a fresh opaque credential. The raw token must never be persisted or logged. */
  login(loginName: string, password: string, signal?: AbortSignal): Promise<{ readonly token: string; readonly principal: AuthenticationPrincipal; readonly expiresAt: string }>;
  resolve(token: string): Promise<AuthenticationPrincipal | null>;
  logout(token: string): Promise<void>;
  /** Does not silently sign in again: every existing session, including this one, is invalidated. */
  changeOwnPassword(token: string, currentPassword: string, newPassword: string, signal?: AbortSignal): Promise<void>;
}
/** No account seed, listener, environment lookup, credential file, or permissive policy is constructed here. */
export function createAuthenticationService(dependencies: AuthenticationDependencies): AuthenticationService {
  const policy = dependencies?.policy;
  if (typeof dependencies?.store?.transaction !== "function" || typeof dependencies?.store?.readLoginSnapshot !== 'function'
    || typeof dependencies?.store?.readPasswordChangeSnapshot !== 'function' || typeof dependencies?.now !== "function"
    || typeof dependencies?.passwords?.hash !== "function" || typeof dependencies?.passwords?.verify !== "function"
    || typeof policy?.assertNewPassword !== "function" || !Number.isSafeInteger(policy?.sessionTtlSeconds) || policy.sessionTtlSeconds <= 0
    || !Array.isArray(policy.activeEmploymentStatuses) || policy.activeEmploymentStatuses.length === 0
    || policy.activeEmploymentStatuses.some(status => typeof status !== "string" || !status)
    || !policy.roleHallScopes || typeof policy.roleHallScopes !== "object" || Object.keys(policy.roleHallScopes).length === 0
    || Object.entries(policy.roleHallScopes).some(([role, scope]) => !role || !["OPTIONAL_HALL", "REQUIRED_HALL"].includes(scope))) {
    throw new TypeError("Authentication requires explicit trusted storage, clock, password codec, and complete policy");
  }
  const { store, now, passwords } = dependencies;
  const admission = dependencies.sessionAdmission;
  if (admission !== undefined && typeof admission.acquire !== 'function') throw new TypeError('Explicit session capacity admission required');
  const sessionAdmission = admission === undefined ? undefined : {acquire: admission.acquire.bind(admission)};
  // Snapshot mutable host configuration so later accidental mutation cannot widen access.
  const employmentStatuses = new Set(policy.activeEmploymentStatuses);
  const roleHallScopes = new Map(Object.entries(policy.roleHallScopes));
  const ttlMilliseconds = policy.sessionTtlSeconds * 1000;
  if (!Number.isSafeInteger(ttlMilliseconds)) throw new TypeError("Authentication session lifetime is invalid");
  const assertNewPassword = policy.assertNewPassword;
  const clock = (): { text: string; milliseconds: number } => { const text = now(); return { text, milliseconds: timestamp(text) }; };
  const sameCredential = (current: AuthenticationAccount, snapshot: AuthenticationLoginSnapshot): boolean => current.accountId === snapshot.accountId
    && current.loginName === snapshot.loginName && current.passwordHash === snapshot.passwordHash && current.authVersion === snapshot.authVersion;
  const sessionCurrent = (session: AuthenticationSession, account: AuthenticationAccount, hash: string): boolean => {
    const {milliseconds} = clock();
    return session.tokenHash === hash && session.accountId === account.accountId && session.revokedAt === null
      && session.authVersion === account.authVersion && timestamp(session.createdAt) <= milliseconds
      && timestamp(session.expiresAt) > milliseconds && timestamp(session.expiresAt) > timestamp(session.createdAt);
  };
  function principal(account: AuthenticationAccount): AuthenticationPrincipal | null {
    if (account.loginEnabled !== true || !employmentStatuses.has(account.employmentStatus) || !Number.isSafeInteger(account.authVersion) || account.authVersion < 1) return null;
    const scope = roleHallScopes.get(account.role);
    if (!scope || (scope === "REQUIRED_HALL" && account.hallId === null)
      || (account.hallId !== null && account.hallEnabled !== true)
      || (account.hallId === null && account.hallEnabled !== null)) return null;
    try {
      if (typeof account.loginName !== "string" || !account.loginName) return null;
      const hasStaffName = Object.hasOwn(account, "staffName"), staffName = account.staffName;
      if (hasStaffName && (typeof staffName !== "string" || !staffName.trim() || staffName.includes("\0"))) return null;
      return Object.freeze({ accountId: entityId("account", account.accountId), staffId: entityId("staff", account.staffId), loginName: account.loginName,
        role: account.role, hallId: account.hallId === null ? null : entityId("hall", account.hallId), authVersion: account.authVersion,
        ...(hasStaffName && typeof staffName === "string" ? { staffName } : {}) });
    } catch { return null; }
  }
  async function sessionAccount(tx: AuthenticationTransaction, hash: string): Promise<{ account: AuthenticationAccount; principal: AuthenticationPrincipal } | null> {
    const initial = await tx.getSession(hash);
    if (!initial || initial.tokenHash !== hash || initial.revokedAt !== null) return null;
    const account = await tx.getAccount(initial.accountId);
    if (!account || account.accountId !== initial.accountId) return null;
    // Re-read after the account lock, so logout committed while waiting cannot authenticate a stale snapshot.
    const session = await tx.lockSession(hash, account.accountId);
    if (!session || session.tokenHash !== hash || session.accountId !== account.accountId || session.revokedAt !== null) return null;
    // Read time after potentially blocking storage/account locks, not before a transaction wait.
    const { milliseconds } = clock();
    if (timestamp(session.createdAt) > milliseconds || timestamp(session.expiresAt) <= milliseconds
      || timestamp(session.expiresAt) <= timestamp(session.createdAt)) return null;
    if (account.authVersion !== session.authVersion) return null;
    const identity = principal(account);
    return identity ? { account, principal: identity } : null;
  }
  return Object.freeze({
    async login(loginName: string, password: string, signal?: AbortSignal) {
      if (typeof loginName !== "string" || !loginName || Buffer.byteLength(loginName, "utf8") > 256) throw new AuthenticationError("INVALID_AUTH_INPUT");
      passwordInput(password);
      assertAuthenticationActive(signal);
      const snapshot = await store.readLoginSnapshot(loginName);
      assertAuthenticationActive(signal);
      const verified = await passwords.verify(password, snapshot?.passwordHash, 'login', signal);
      if (!snapshot || snapshot.loginName !== loginName || !verified) throw new AuthenticationError('INVALID_CREDENTIALS');
      assertAuthenticationActive(signal);
      const capacity = await sessionAdmission?.acquire(signal).catch(error => { assertAuthenticationActive(signal); throw error; });
      try {
        assertAuthenticationActive(signal);
        capacity?.assertValid();
        return await store.transaction(async tx => {
          assertAuthenticationActive(signal);
          const account = await tx.getAccount(snapshot.accountId);
          const identity = account && account.loginName === loginName ? principal(account) : null;
          if (!account || !identity || !sameCredential(account, snapshot)) throw new AuthenticationError("INVALID_CREDENTIALS");
          assertAuthenticationActive(signal);
          const time = clock();
          const expiresAt = new Date(time.milliseconds + ttlMilliseconds).toISOString();
          const token = randomBytes(32).toString("base64url");
          const row: AuthenticationSession = { tokenHash: sessionTokenHash(token)!, accountId: identity.accountId, authVersion: identity.authVersion,
            createdAt: time.text, expiresAt, revokedAt: null };
          capacity?.assertValid();
          await tx.insertSession(row);
          assertAuthenticationActive(signal);
          capacity?.assertValid();
          return { token, principal: identity, expiresAt };
        });
      } finally { capacity?.release(); }
    },
    async resolve(token: string) {
      const hash = sessionTokenHash(token);
      if (!hash) return null;
      return store.transaction(async tx => (await sessionAccount(tx, hash))?.principal ?? null);
    },
    async logout(token: string) {
      const hash = sessionTokenHash(token);
      if (!hash) return;
      const time = clock();
      await store.transaction(tx => tx.revokeSession(hash, time.text));
    },
    async changeOwnPassword(token: string, currentPassword: string, newPassword: string, signal?: AbortSignal) {
      passwordInput(currentPassword); passwordInput(newPassword);
      const hash = sessionTokenHash(token);
      if (!hash) throw new AuthenticationError("UNAUTHENTICATED");
      assertAuthenticationActive(signal);
      const snapshot = await store.readPasswordChangeSnapshot(hash);
      assertAuthenticationActive(signal);
      if (!snapshot || !sessionCurrent(snapshot.session, snapshot.account, hash) || !principal(snapshot.account)) throw new AuthenticationError('UNAUTHENTICATED');
      if (!await passwords.verify(currentPassword, snapshot.account.passwordHash, 'authenticated', signal)) throw new AuthenticationError('INVALID_CREDENTIALS');
      try { await assertNewPassword(newPassword); }
      catch { throw new AuthenticationError('PASSWORD_REJECTED'); }
      assertAuthenticationActive(signal);
      const passwordHash = await passwords.hash(newPassword, signal);
      assertAuthenticationActive(signal);
      await store.transaction(async tx => {
        assertAuthenticationActive(signal);
        const found = await sessionAccount(tx, hash);
        if (!found || !sameCredential(found.account, snapshot.account)
          || found.account.staffId !== snapshot.account.staffId || found.account.role !== snapshot.account.role
          || found.account.hallId !== snapshot.account.hallId || found.account.hallEnabled !== snapshot.account.hallEnabled
          || found.account.employmentStatus !== snapshot.account.employmentStatus || found.account.loginEnabled !== snapshot.account.loginEnabled) throw new AuthenticationError("UNAUTHENTICATED");
        assertAuthenticationActive(signal);
        const time = clock();
        if (!await tx.changePassword(found.account.accountId, found.account.authVersion, found.account.passwordHash, passwordHash, time.text)) throw new AuthenticationError("UNAUTHENTICATED");
        assertAuthenticationActive(signal);
      });
    }
  });
}
