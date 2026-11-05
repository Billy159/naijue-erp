import { createHash, randomBytes } from "node:crypto";
import { entityId } from "../../domain/src/values.ts";
import type { AuthenticationAccount, AuthenticationReadOnlyStore, AuthenticationDependencies, AuthenticationLoginSnapshot, AuthenticationPrincipal, AuthenticationSession, AuthenticationTransaction, AuthenticationLoginTransaction, BorrowedAuthenticationDependencies, BorrowedAuthenticationCredentials, ProvisionalAuthenticationSession } from "./ports.ts";
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
export interface ReadOnlyAuthenticationResolver {
  /** Current statement snapshot only. Never use for commands/login/password changes. */
  resolveReadOnly(token: string): Promise<AuthenticationPrincipal | null>;
}
export function createAuthenticationService(dependencies: AuthenticationDependencies): AuthenticationService {
  const service=buildAuthenticationService(dependencies);
  return Object.freeze({login:service.login,resolve:service.resolve,logout:service.logout,changeOwnPassword:service.changeOwnPassword});
}
/** Explicit separate query composition. No dummy principal, cache or fallback to
 * locked resolve. The host must keep command authentication on the old service. */
export function createReadOnlyAuthenticationResolver(dependencies: AuthenticationDependencies & {readonly store: AuthenticationReadOnlyStore}): ReadOnlyAuthenticationResolver {
  if(typeof dependencies?.store?.readSessionSnapshot!=='function')throw new TypeError('Explicit read-only authentication snapshot store required');
  const service=buildAuthenticationService(dependencies);
  return Object.freeze({resolveReadOnly:service.resolveReadOnly});
}
type LoginResult = { readonly token: string; readonly principal: AuthenticationPrincipal; readonly expiresAt: string };
interface LoginPorts {
  readSnapshot(loginName: string): Promise<AuthenticationLoginSnapshot | undefined>;
  locked<T>(work: (tx: AuthenticationLoginTransaction) => Promise<T>): Promise<T>;
  admitted(work: (assertValid: () => void) => Promise<LoginResult>, signal?: AbortSignal): Promise<LoginResult>;
  expected?(principal: AuthenticationPrincipal, account: AuthenticationAccount): boolean;
}
async function loginWithPorts(dependencies: Pick<AuthenticationDependencies,'passwords'>, rules: ReturnType<typeof authenticationRules>,
  ports: LoginPorts, loginName: string, password: string, signal?: AbortSignal): Promise<LoginResult> {
  if (typeof loginName !== "string" || !loginName || Buffer.byteLength(loginName, "utf8") > 256) throw new AuthenticationError("INVALID_AUTH_INPUT");
  passwordInput(password);
  assertAuthenticationActive(signal);
  const snapshot=await ports.readSnapshot(loginName);
  assertAuthenticationActive(signal);
  const verified=await dependencies.passwords.verify(password,snapshot?.passwordHash,'login',signal);
  if (!snapshot || snapshot.loginName!==loginName || !verified) throw new AuthenticationError('INVALID_CREDENTIALS');
  assertAuthenticationActive(signal);
  return ports.admitted(async assertValid=>{
    assertAuthenticationActive(signal);assertValid();
    return ports.locked(async tx=>{
      assertAuthenticationActive(signal);
      const account=await tx.getAccount(snapshot.accountId);
      const identity=account&&account.loginName===loginName?rules.principal(account):null;
      if (!account || !identity || !rules.sameCredential(account,snapshot) || ports.expected&&!ports.expected(identity,account)) throw new AuthenticationError("INVALID_CREDENTIALS");
      assertAuthenticationActive(signal);
      const time=rules.clock(),expiresAt=new Date(time.milliseconds+rules.ttlMilliseconds).toISOString();
      const token=randomBytes(32).toString("base64url");
      const row:AuthenticationSession={tokenHash:sessionTokenHash(token)!,accountId:identity.accountId,authVersion:identity.authVersion,
        createdAt:time.text,expiresAt,revokedAt:null};
      assertValid();await tx.insertSession(row);assertAuthenticationActive(signal);assertValid();
      return {token,principal:identity,expiresAt};
    });
  },signal);
}
/** One genuine NEW_EMPTY login in the original transaction. Not a committed login
 * or target-admission capability. Parent owns transaction/connection and capacity
 * permit until its final outcome. Callback must not retain/log/publish the token.
 * Return values are deliberately ignored. Any failure requires outer rollback;
 * unknown outer COMMIT must quarantine, never retry issuance or claim absence. */
export function withAuthenticationInCurrentTransaction(dependencies: BorrowedAuthenticationDependencies,
  credentials: BorrowedAuthenticationCredentials, useSession: (session: ProvisionalAuthenticationSession) => Promise<void>, signal?: AbortSignal): Promise<void> {
  const pending=(async()=>{
  if (typeof dependencies?.store?.runInCurrentTransaction!=='function' || typeof useSession!=='function') throw new TypeError('Explicit borrowed authentication scope required');
  const rules=authenticationRules(dependencies);
  const accountId=entityId('account',credentials?.accountId),staffId=entityId('staff',credentials?.staffId);
  const loginName=credentials?.loginName;let password=credentials?.password;
  const passwords=dependencies.passwords;
  const issuance=dependencies.issuance;
  if (issuance?.kind!=='ISOLATED_SYNTHETIC_NO_CAPACITY_POLICY' && (issuance?.kind!=='PARENT_HELD_CAPACITY'||typeof issuance.assertValid!=='function')) throw new TypeError('Explicit parent-owned issuance policy required');
  const permit=issuance.kind==='PARENT_HELD_CAPACITY'?issuance.assertValid.bind(issuance):undefined;
  const assertValid=()=>{
    const returned:unknown=permit?.();
    if(returned!==undefined) {
      if(returned&&typeof (returned as {then?:unknown}).then==='function')void Promise.resolve(returned).catch(()=>{});
      throw new TypeError('Synchronous parent-held capacity assertion required');
    }
  };
  try {
    await dependencies.store.runInCurrentTransaction(async operations=>{
      const issued=await loginWithPorts({passwords},rules,{
        readSnapshot:name=>operations.readLoginSnapshot(name),locked:work=>operations.withLockedAccount(work),
        admitted:work=>work(assertValid),
        expected:(principal,account)=>principal.accountId===accountId&&principal.staffId===staffId&&principal.loginName===loginName
          &&principal.role==='ADMIN'&&principal.hallId===null&&principal.authVersion===1&&account.employmentStatus==='在职'
      },loginName,password,signal);
      assertAuthenticationActive(signal);assertValid();
      await useSession(Object.freeze({state:'PROVISIONAL_CURRENT_TRANSACTION',...issued}));
      assertAuthenticationActive(signal);assertValid();
    });
  } finally {password='';}
  })();
  // The adapter tracks/drains this whole operation if its caller forgot await.
  // Observe this wrapper's separate Promise too, preserving rejection for any
  // caller that does await it without creating an unhandled rejection.
  void pending.catch(()=>{});return pending;
}
function authenticationRules(dependencies: Pick<AuthenticationDependencies, "now" | "policy" | "passwords">) {
  const policy = dependencies?.policy;
  if (typeof dependencies?.now !== "function"
    || typeof dependencies?.passwords?.hash !== "function" || typeof dependencies?.passwords?.verify !== "function"
    || typeof policy?.assertNewPassword !== "function" || !Number.isSafeInteger(policy?.sessionTtlSeconds) || policy.sessionTtlSeconds <= 0
    || !Array.isArray(policy.activeEmploymentStatuses) || policy.activeEmploymentStatuses.length === 0
    || policy.activeEmploymentStatuses.some(status => typeof status !== "string" || !status)
    || !policy.roleHallScopes || typeof policy.roleHallScopes !== "object" || Object.keys(policy.roleHallScopes).length === 0
    || Object.entries(policy.roleHallScopes).some(([role, scope]) => !role || !["OPTIONAL_HALL", "REQUIRED_HALL"].includes(scope))) {
    throw new TypeError("Authentication requires explicit trusted storage, clock, password codec, and complete policy");
  }
  // Snapshot mutable host configuration so later accidental mutation cannot widen access.
  const employmentStatuses = new Set(policy.activeEmploymentStatuses);
  const roleHallScopes = new Map(Object.entries(policy.roleHallScopes));
  const ttlMilliseconds = policy.sessionTtlSeconds * 1000;
  if (!Number.isSafeInteger(ttlMilliseconds)) throw new TypeError("Authentication session lifetime is invalid");
  const assertNewPassword = policy.assertNewPassword;
  const {now} = dependencies;
  const clock = (): { text: string; milliseconds: number } => { const text = now(); return { text, milliseconds: timestamp(text) }; };
  const sameCredential = (current: AuthenticationAccount, snapshot: AuthenticationLoginSnapshot): boolean => current.accountId === snapshot.accountId
    && current.loginName === snapshot.loginName && current.passwordHash === snapshot.passwordHash && current.authVersion === snapshot.authVersion;
  const sessionCurrent = (session: AuthenticationSession, account: Pick<AuthenticationAccount, "accountId" | "authVersion">, hash: string): boolean => {
    const {milliseconds} = clock();
    return session.tokenHash === hash && session.accountId === account.accountId && session.revokedAt === null
      && session.authVersion === account.authVersion && timestamp(session.createdAt) <= milliseconds
      && timestamp(session.expiresAt) > milliseconds && timestamp(session.expiresAt) > timestamp(session.createdAt);
  };
  function principal(account: Omit<AuthenticationAccount, 'passwordHash'>): AuthenticationPrincipal | null {
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
  return {clock,sameCredential,sessionCurrent,principal,assertNewPassword,ttlMilliseconds};
}
function buildAuthenticationService(dependencies: AuthenticationDependencies): AuthenticationService & ReadOnlyAuthenticationResolver {
  if (typeof dependencies?.store?.transaction !== "function" || typeof dependencies?.store?.readLoginSnapshot !== 'function'
    || typeof dependencies?.store?.readPasswordChangeSnapshot !== 'function') throw new TypeError("Authentication requires explicit trusted storage, clock, password codec, and complete policy");
  const rules=authenticationRules(dependencies);
  const {clock,sameCredential,sessionCurrent,principal,assertNewPassword}=rules;
  const {store,passwords}=dependencies;
  const readSessionSnapshot=store.readSessionSnapshot?.bind(store);
  const admission=dependencies.sessionAdmission;
  if (admission !== undefined && typeof admission.acquire !== 'function') throw new TypeError('Explicit session capacity admission required');
  const sessionAdmission=admission===undefined?undefined:{acquire:admission.acquire.bind(admission)};
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
    login(loginName: string, password: string, signal?: AbortSignal) {
      return loginWithPorts({passwords},rules,{
        readSnapshot: name=>store.readLoginSnapshot(name),
        locked: work=>store.transaction(work),
        async admitted(work,signal) {
          const capacity=await sessionAdmission?.acquire(signal).catch(error=>{assertAuthenticationActive(signal);throw error;});
          try {return await work(()=>capacity?.assertValid());} finally {capacity?.release();}
        }
      },loginName,password,signal);
    },
    async resolveReadOnly(token: string) {
      const hash=sessionTokenHash(token);
      if(!hash)return null;
      if(!readSessionSnapshot)throw new TypeError('Read-only authentication snapshot capability unavailable');
      const snapshot=await readSessionSnapshot(hash);
      // Time is checked after the one-statement read and released lease. This
      // confers no serialization against a later revocation or command write.
      if(!snapshot||!sessionCurrent(snapshot.session,snapshot.account,hash))return null;
      return principal(snapshot.account);
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
