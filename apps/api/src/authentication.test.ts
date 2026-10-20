/** SYNTHETIC in-process HTTP and scripted pg protocol tests only. No real users, database, network listener or credential files. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scryptSync } from "node:crypto";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createAuthenticationService, AuthenticationError, sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";
import type { AuthenticationAccount, AuthenticationDependencies, AuthenticationSession, AuthenticationStore, AuthenticationTransaction, PasswordCodec } from "../../../packages/authentication/src/ports.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { createNodeScryptPasswords } from "../../../packages/authentication/src/passwords.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { PostgresAuthenticationStore } from "../../../adapters/postgres/src/auth-store.ts";
import type { PgAuthenticationClient, PgAuthenticationResult } from "../../../adapters/postgres/src/auth-store.ts";
import { createAuthenticationHttpPlugin, createSalesSessionAuthenticator } from "./authentication.ts";
import type { AuthenticationHttpOptions } from "./authentication.ts";
import { createSalesHttpPlugin, exactJson } from "./sales-http.ts";
import { fixture, ids, SYNTHETIC_RULES, sid, syntheticDraft } from "../../../tests/support/synthetic-fixtures.ts";

const ORIGIN = "https://synthetic-erp.invalid";
const COOKIE = "__Host-naijue_session";
const OLD_PASSWORD = "SYNTHETIC old password";
const NEW_PASSWORD = "SYNTHETIC new password";
const OLD_HASH = "SYNTHETIC_HASH_FIXTURE_OLD";
const NEW_HASH = "SYNTHETIC_HASH_FIXTURE_NEW";
const ACCOUNT_ID = entityId("account", "00000000-0000-0000-0000-000000000001");
const STAFF_ID = entityId("staff", "00000000-0000-0000-0000-000000000002");
const HALL_ID = ids.hall;
const TIME = "2026-10-20T12:00:00.000Z";
function account(overrides: Partial<AuthenticationAccount> = {}): AuthenticationAccount {
  return { accountId: ACCOUNT_ID, staffId: STAFF_ID, loginName: "SYNTHETIC.employee", passwordHash: OLD_HASH, loginEnabled: true,
    authVersion: 1, role: "SALESPERSON", employmentStatus: "在职", hallId: HALL_ID, hallEnabled: true, ...overrides };
}
// Deliberately finite synthetic fixture codec, not exported or usable as a real password implementation.
const SYNTHETIC_PASSWORDS: PasswordCodec = {
  async verify(password, hash) { return (password === OLD_PASSWORD && hash === OLD_HASH) || (password === NEW_PASSWORD && hash === NEW_HASH); },
  async hash(password) { assert.equal(password, NEW_PASSWORD); return NEW_HASH; }
};
class SyntheticAuthenticationStore implements AuthenticationStore {
  accounts = new Map([[ACCOUNT_ID, account()]]);
  sessions = new Map<string, AuthenticationSession>();
  calls = 0;
  failRevoke = false;
  failChange = false;
  private serial = Promise.resolve();
  async transaction<T>(work: (tx: AuthenticationTransaction) => Promise<T>): Promise<T> {
    this.calls++;
    const previous = this.serial;
    let release!: () => void;
    this.serial = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const accounts = structuredClone(this.accounts), sessions = structuredClone(this.sessions);
    const tx: AuthenticationTransaction = {
      async findAccountByLogin(loginName) { return [...accounts.values()].find(row => row.loginName === loginName); },
      async getAccount(id) { return accounts.get(id); },
      async getSession(hash) { return sessions.get(hash); },
      async lockSession(hash, id) { const row = sessions.get(hash); return row?.accountId === id ? row : undefined; },
      async insertSession(row) { assert.match(row.tokenHash, /^[a-f0-9]{64}$/); assert.equal(sessions.has(row.tokenHash), false); sessions.set(row.tokenHash, row); },
      revokeSession: async (hash, revokedAt) => {
        if (this.failRevoke) throw new Error("SYNTHETIC private storage failure");
        const row = sessions.get(hash); if (row) sessions.set(hash, { ...row, revokedAt: row.revokedAt ?? revokedAt });
      },
      changePassword: async (id, expectedVersion, expectedHash, passwordHash, changedAt) => {
        const row = accounts.get(id);
        if (!row || row.authVersion !== expectedVersion || row.passwordHash !== expectedHash) return false;
        accounts.set(id, { ...row, passwordHash, authVersion: row.authVersion + 1 });
        for (const [hash, session] of sessions) if (session.accountId === id) sessions.set(hash, { ...session, revokedAt: changedAt });
        if (this.failChange) throw new Error("SYNTHETIC failure after mutation");
        return true;
      }
    };
    try { const result = await work(tx); this.accounts = accounts; this.sessions = sessions; return result; }
    finally { release(); }
  }
}
function setupService(options: { account?: AuthenticationAccount; passwords?: PasswordCodec; now?: () => string } = {}) {
  const store = new SyntheticAuthenticationStore();
  if (options.account) store.accounts.set(ACCOUNT_ID, options.account);
  let time = TIME;
  const dependencies: AuthenticationDependencies = { store, now: options.now ?? (() => time), policy: createSourceAuthenticationPolicy(3600), passwords: options.passwords ?? SYNTHETIC_PASSWORDS };
  const service = createAuthenticationService(dependencies);
  return { store, service, dependencies, clock: (value: string) => { time = value; } };
}
async function setupHttp(t: TestContext, provided?: AuthenticationService) {
  const f = setupService();
  const app = Fastify({ logger: false });
  app.register(createAuthenticationHttpPlugin({ service: provided ?? f.service, trustedOrigin: ORIGIN }));
  t.after(() => app.close()); await app.ready();
  const post = (url: string, payload: unknown, cookie?: string, headers: Record<string, string> = {}) => app.inject({ method: "POST", url,
    headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, payload: JSON.stringify(payload) });
  const login = () => post("/auth/login", { loginName: account().loginName, password: OLD_PASSWORD });
  return { ...f, app, post, login };
}
function responseCookie(value: string | string[] | number | undefined): string {
  assert.equal(typeof value, "string"); return String(value).split(";")[0]!;
}
function expectAuthCode(code: string) { return (error: unknown): boolean => error instanceof AuthenticationError && error.code === code; }

test("SYNTHETIC auth configuration fails closed and construction has no storage/credential side effect", () => {
  const f = setupService(); assert.equal(f.store.calls, 0); assert.equal(f.store.sessions.size, 0);
  assert.throws(() => createAuthenticationService({} as AuthenticationDependencies), /explicit trusted/);
  for (const policy of [undefined, { ...f.dependencies.policy, sessionTtlSeconds: 0 }, { ...f.dependencies.policy, roleHallScopes: {} },
    { ...f.dependencies.policy, activeEmploymentStatuses: [] }, { ...f.dependencies.policy, assertNewPassword: undefined }]) {
    assert.throws(() => createAuthenticationService({ ...f.dependencies, policy } as AuthenticationDependencies), /explicit trusted/);
  }
  for (const origin of ["http://synthetic.invalid", "https://synthetic.invalid/path", "https://synthetic.invalid/", "null", ""]) {
    assert.throws(() => createAuthenticationHttpPlugin({ service: f.service, trustedOrigin: origin }), /trusted.*origin/);
  }
  assert.throws(() => createAuthenticationHttpPlugin({} as AuthenticationHttpOptions), /trusted.*origin/);
});
test("SYNTHETIC auth: explicit login issues distinct opaque tokens, stores hashes only, resolves fresh staff identity", async () => {
  const f = setupService();
  const first = await f.service.login(account().loginName, OLD_PASSWORD), second = await f.service.login(account().loginName, OLD_PASSWORD);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(first.token, second.token);
  assert.equal(first.expiresAt, "2026-10-20T13:00:00.000Z"); assert.equal(f.store.sessions.size, 2);
  assert.equal(JSON.stringify([...f.store.sessions]).includes(first.token), false);
  assert.equal(JSON.stringify([...f.store.sessions]).includes(OLD_PASSWORD), false);
  assert.deepEqual(await f.service.resolve(first.token), first.principal);
  assert.equal(Object.hasOwn(first.principal, "passwordHash"), false);
  f.store.accounts.set(ACCOUNT_ID, account({ hallId: null, hallEnabled: null, role: "WAREHOUSE" }));
  assert.equal((await f.service.resolve(first.token))?.hallId, null);
});
for (const [name, patch] of [
  ["disabled account", { loginEnabled: false }], ["resigned employee", { employmentStatus: "离职" }],
  ["unknown employment", { employmentStatus: "UNKNOWN" }], ["unknown role", { role: "UNKNOWN" }],
  ["missing salesperson hall", { hallId: null, hallEnabled: null }], ["disabled hall", { hallEnabled: false }],
  ["unknown hall", { hallEnabled: null }], ["invalid auth version", { authVersion: 0 }]
] as const) test(`SYNTHETIC auth: ${name} rejects login and existing session`, async () => {
  const f = setupService(); const login = await f.service.login(account().loginName, OLD_PASSWORD);
  f.store.accounts.set(ACCOUNT_ID, account(patch));
  await assert.rejects(f.service.login(account().loginName, OLD_PASSWORD), expectAuthCode("INVALID_CREDENTIALS"));
  assert.equal(await f.service.resolve(login.token), null); assert.equal(f.store.sessions.size, 1);
});
test("SYNTHETIC auth: unknown account/wrong password do not create sessions; invalid tokens never query storage", async () => {
  const f = setupService();
  await assert.rejects(f.service.login("SYNTHETIC unknown", OLD_PASSWORD), expectAuthCode("INVALID_CREDENTIALS"));
  await assert.rejects(f.service.login(account().loginName, "SYNTHETIC wrong"), expectAuthCode("INVALID_CREDENTIALS"));
  assert.equal(f.store.sessions.size, 0);
  const calls = f.store.calls;
  for (const token of ["", "bad", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "="]) assert.equal(await f.service.resolve(token), null);
  assert.equal(f.store.calls, calls);
});
test("SYNTHETIC auth: absolute expiry, revocation and authentication version invalidate sessions without auto-login", async () => {
  const f = setupService(); const login = await f.service.login(account().loginName, OLD_PASSWORD);
  f.clock("2026-10-20T13:00:00.000Z"); assert.equal(await f.service.resolve(login.token), null);
  f.clock(TIME); f.store.accounts.set(ACCOUNT_ID, account({ authVersion: 2 })); assert.equal(await f.service.resolve(login.token), null);
  f.store.accounts.set(ACCOUNT_ID, account()); await f.service.logout(login.token); assert.equal(await f.service.resolve(login.token), null);
  await f.service.logout(login.token); assert.equal(f.store.sessions.size, 1);
  assert.equal(f.store.sessions.get(sessionTokenHash(login.token)!)?.revokedAt, TIME);
});
test("SYNTHETIC auth: password change verifies old password, enforces confirmed rules and invalidates every old session atomically", async () => {
  const f = setupService(); const a = await f.service.login(account().loginName, OLD_PASSWORD), b = await f.service.login(account().loginName, OLD_PASSWORD);
  await assert.rejects(f.service.changeOwnPassword(a.token, "SYNTHETIC wrong", NEW_PASSWORD), expectAuthCode("INVALID_CREDENTIALS"));
  await assert.rejects(f.service.changeOwnPassword(a.token, OLD_PASSWORD, "short"), expectAuthCode("PASSWORD_REJECTED"));
  assert.equal(f.store.accounts.get(ACCOUNT_ID)?.authVersion, 1); assert.ok(await f.service.resolve(a.token));
  await f.service.changeOwnPassword(a.token, OLD_PASSWORD, NEW_PASSWORD);
  assert.equal(f.store.accounts.get(ACCOUNT_ID)?.passwordHash, NEW_HASH); assert.equal(f.store.accounts.get(ACCOUNT_ID)?.authVersion, 2);
  assert.equal(await f.service.resolve(a.token), null); assert.equal(await f.service.resolve(b.token), null);
  assert.equal(f.store.sessions.size, 2); // no silent replacement login
  await assert.rejects(f.service.login(account().loginName, OLD_PASSWORD), expectAuthCode("INVALID_CREDENTIALS"));
  assert.equal((await f.service.login(account().loginName, NEW_PASSWORD)).principal.authVersion, 2);
});
test("SYNTHETIC auth: failed password transaction rolls back hash/version/revocations; concurrent changes cannot both succeed", async () => {
  const f = setupService(); const login = await f.service.login(account().loginName, OLD_PASSWORD);
  f.store.failChange = true;
  await assert.rejects(f.service.changeOwnPassword(login.token, OLD_PASSWORD, NEW_PASSWORD), /after mutation/);
  assert.equal(f.store.accounts.get(ACCOUNT_ID)?.authVersion, 1); assert.ok(await f.service.resolve(login.token));
  f.store.failChange = false;
  const results = await Promise.allSettled([f.service.changeOwnPassword(login.token, OLD_PASSWORD, NEW_PASSWORD), f.service.changeOwnPassword(login.token, OLD_PASSWORD, NEW_PASSWORD)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal(f.store.accounts.get(ACCOUNT_ID)?.authVersion, 2);
});
test("SYNTHETIC auth: revocation or expiry committed while waiting for account lock cannot authenticate a stale session", async () => {
  const token = "A".repeat(43), hash = sessionTokenHash(token)!;
  for (const mode of ["revoked", "expired"] as const) {
    let time = TIME;
    let current: AuthenticationSession = { tokenHash: hash, accountId: ACCOUNT_ID, authVersion: 1, createdAt: TIME, expiresAt: "2026-10-20T13:00:00.000Z", revokedAt: null };
    let locked = false;
    const store: AuthenticationStore = { async transaction(work) {
      const tx: AuthenticationTransaction = {
        async getSession() { return { ...current }; },
        async getAccount() {
          // Simulates another transaction completing while this statement waits for its account lock.
          if (mode === "revoked") current = { ...current, revokedAt: TIME };
          else time = "2026-10-20T13:00:00.000Z";
          locked = true; return account();
        },
        async lockSession() { assert.equal(locked, true); return current; },
        async findAccountByLogin() { throw new Error("Not used"); }, async insertSession() { throw new Error("Not used"); },
        async revokeSession() { throw new Error("Not used"); }, async changePassword() { throw new Error("Not used"); }
      };
      return work(tx);
    } };
    const service = createAuthenticationService({ store, now: () => time, policy: createSourceAuthenticationPolicy(3600), passwords: SYNTHETIC_PASSWORDS });
    assert.equal(await service.resolve(token), null);
  }
});
test("SYNTHETIC source password policy uses normal self-change rule, not maintenance six-digit exception", async () => {
  const policy = createSourceAuthenticationPolicy(3600);
  assert.throws(() => policy.assertNewPassword("123456"));
  assert.doesNotThrow(() => policy.assertNewPassword("12345678"));
  assert.doesNotThrow(() => policy.assertNewPassword("a".repeat(1024)));
  assert.throws(() => policy.assertNewPassword("a".repeat(1025)));
  assert.throws(() => policy.assertNewPassword("界".repeat(342)));
});
test("SYNTHETIC Node scrypt: independent fixed vector verifies exactly; altered/unknown/legacy formats fail closed", async () => {
  const passwords = createNodeScryptPasswords();
  const salt = "11".repeat(16);
  const expected = scryptSync(OLD_PASSWORD, Buffer.from(salt, "hex"), 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  const encoded = `naijue:scrypt:1:32768:8:1:${salt}:${expected}`;
  assert.equal(await passwords.verify(OLD_PASSWORD, encoded), true);
  assert.equal(await passwords.verify(OLD_PASSWORD + " ", encoded), false);
  for (const hash of [OLD_PASSWORD, encoded + "\n", encoded.toUpperCase(), encoded.replace(":32768:", ":1048576:"), "pbkdf2-sha256:600000:" + expected]) assert.equal(await passwords.verify(OLD_PASSWORD, hash), false);
  const fresh = await passwords.hash(NEW_PASSWORD); assert.notEqual(fresh, encoded); assert.equal(await passwords.verify(NEW_PASSWORD, fresh), true);
});
test("SYNTHETIC HTTP: login/session/logout use secure HttpOnly cookie only, never expose token/hash/password in JSON", async t => {
  const f = await setupHttp(t);
  assert.equal(f.app.server.listening, false);
  assert.deepEqual((await f.app.inject({ method: "GET", url: "/auth/session" })).json(), { principal: null });
  const login = await f.login(); assert.equal(login.statusCode, 200);
  const cookie = responseCookie(login.headers["set-cookie"]);
  assert.match(String(login.headers["set-cookie"]), /Path=\/; HttpOnly; Secure; SameSite=Strict; Expires=/);
  assert.equal(login.headers["cache-control"], "no-store");
  for (const secret of [cookie.split("=")[1]!, OLD_PASSWORD, OLD_HASH]) assert.equal(login.body.includes(secret), false);
  const session = await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } }); assert.equal(session.json().principal.accountId, ACCOUNT_ID);
  const logout = await f.post("/auth/logout", {}, cookie); assert.equal(logout.statusCode, 204); assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
  assert.equal((await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie } })).json().principal, null);
  assert.equal((await f.post("/auth/logout", {}, cookie)).statusCode, 204);
});
test("SYNTHETIC HTTP: writes reject missing/wrong Origin, cross-site metadata and ambiguous credentials before storage", async t => {
  const f = await setupHttp(t);
  const payload = { loginName: account().loginName, password: OLD_PASSWORD };
  for (const headers of [
    { "content-type": "application/json" },
    { origin: "https://other.invalid", "content-type": "application/json" },
    { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "cross-site" },
    { origin: ORIGIN, "content-type": "application/json", authorization: "Bearer SYNTHETIC" }
  ]) {
    const response = await f.app.inject({ method: "POST", url: "/auth/login", headers, payload: JSON.stringify(payload) }); assert.ok([400, 403].includes(response.statusCode));
  }
  assert.equal(f.store.calls, 0);
  const read = await f.app.inject({ method: "GET", url: "/auth/session", headers: { origin: "https://other.invalid" } }); assert.equal(read.statusCode, 403);
});
test("SYNTHETIC HTTP: duplicate/malformed cookie, unknown identity fields, query secrets and malformed body are rejected", async t => {
  const f = await setupHttp(t); const login = await f.login(); const cookie = responseCookie(login.headers["set-cookie"]);
  for (const bad of [`${cookie}; ${cookie}`, `${COOKIE}=not-a-token`]) assert.equal((await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: bad } })).statusCode, 400);
  assert.equal((await f.post("/auth/login", { loginName: account().loginName, password: OLD_PASSWORD, accountId: ACCOUNT_ID })).statusCode, 400);
  assert.equal((await f.post("/auth/login?password=synthetic", { loginName: account().loginName, password: OLD_PASSWORD })).statusCode, 400);
  assert.equal((await f.post("/auth/password", { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })).statusCode, 401);
  assert.equal((await f.app.inject({ method: "POST", url: "/auth/login", headers: { origin: ORIGIN, "content-type": "application/json" }, payload: "{" })).statusCode, 400);
});
test("SYNTHETIC HTTP: self-change clears cookie and invalidates old sessions, but failed revocation never claims logout", async t => {
  const f = await setupHttp(t); const a = await f.login(), b = await f.login();
  const firstCookie = responseCookie(a.headers["set-cookie"]), secondCookie = responseCookie(b.headers["set-cookie"]);
  const change = await f.post("/auth/password", { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }, firstCookie);
  assert.equal(change.statusCode, 204); assert.match(String(change.headers["set-cookie"]), /Max-Age=0/);
  assert.equal((await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: secondCookie } })).json().principal, null);
  const fresh = await f.post("/auth/login", { loginName: account().loginName, password: NEW_PASSWORD });
  f.store.failRevoke = true;
  const failed = await f.post("/auth/logout", {}, responseCookie(fresh.headers["set-cookie"]));
  assert.equal(failed.statusCode, 500); assert.equal(failed.headers["set-cookie"], undefined); assert.equal(failed.body.includes("private storage"), false);
});
test("SYNTHETIC HTTP: trusted provider failures are sanitized without returning password, cookie or storage details", async t => {
  const privateError = new Error("SYNTHETIC private password/storage/cookie details");
  const f = await setupHttp(t, { async login() { throw privateError; }, async resolve() { throw privateError; }, async logout() { throw privateError; }, async changeOwnPassword() { throw privateError; } });
  const response = await f.login(); assert.equal(response.statusCode, 500); assert.equal(response.body.includes(privateError.message), false);
});
test("SYNTHETIC Sales cookie callback derives actor from session and requires origin for mutations", async t => {
  const f = setupService(); const login = await f.service.login(account().loginName, OLD_PASSWORD);
  const cookie = `${COOKIE}=${login.token}`;
  const authenticate = createSalesSessionAuthenticator({ service: f.service, trustedOrigin: ORIGIN });
  assert.deepEqual(await authenticate({ headers: { cookie, origin: ORIGIN }, ip: "127.0.0.1", method: "POST", url: "/sales/commands" }), { accountId: ACCOUNT_ID, hallId: HALL_ID });
  assert.equal(await authenticate({ headers: { cookie }, ip: "127.0.0.1", method: "POST", url: "/sales/commands" }), null);
  assert.equal(await authenticate({ headers: { cookie, origin: "https://other.invalid" }, ip: "127.0.0.1", method: "GET", url: "/sales/receipts/x" }), null);
  const business = fixture(); const app = Fastify({ logger: false }); let seenActor: unknown;
  app.register(createSalesHttpPlugin({ authenticate, dependencies: { unitOfWork: business.store, rules: SYNTHETIC_RULES,
    authorization: { async assertAllowed(actor) { seenActor = actor; } }, now: () => TIME, newId: kind => sid(kind, 333) } }));
  t.after(() => app.close()); await app.ready();
  const payload = { action: "SAVE", requestKey: "synthetic-authenticated-save", expectedVersion: null, draft: syntheticDraft() };
  const response = await app.inject({ method: "POST", url: "/sales/commands", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, payload: exactJson(payload) });
  assert.equal(response.statusCode, 200); assert.deepEqual(seenActor, { accountId: ACCOUNT_ID, hallId: HALL_ID });
  await f.service.logout(login.token);
  assert.equal((await app.inject({ method: "POST", url: "/sales/commands", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, payload: exactJson(payload) })).statusCode, 401);
});

interface Step { sql: RegExp; rows?: Record<string, unknown>[]; count?: number; error?: Error; inspect?: (values: unknown[], sql: string) => void }
/** Scripted protocol only: does not parse or execute SQL, validate PostgreSQL locks, or prove durability. */
class ProtocolClient implements PgAuthenticationClient {
  readonly steps: Step[];
  readonly released: (Error | boolean | undefined)[] = [];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgAuthenticationResult> {
    const step = this.steps.shift(); assert.ok(step, "Unexpected scripted authentication SQL"); assert.match(sql, step.sql); step.inspect?.(values, sql);
    if (step.error) throw step.error;
    return { rows: step.rows ?? [], rowCount: step.count ?? step.rows?.length ?? 1 };
  }
  release(error?: Error | boolean): void { this.released.push(error); }
  done(): void { assert.equal(this.steps.length, 0); assert.equal(this.released.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL READ COMMITTED$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ });
const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const pgStore = (client: ProtocolClient) => new PostgresAuthenticationStore({ async connect() { return client; } });
function accountRow(): Record<string, unknown> {
  const a = account(); return { account_id: a.accountId, staff_id: a.staffId, login_name: a.loginName, password_hash: a.passwordHash,
    login_enabled: a.loginEnabled, auth_version: a.authVersion, role: a.role, employment_status: a.employmentStatus, hall_id: a.hallId, hall_enabled: a.hallEnabled };
}
test("SCRIPTED pg auth: login is parameterized, account/staff locked, token hash only inserted inside transaction", async () => {
  const client = new ProtocolClient([begin(), { sql: /WHERE a.login_name = \$1 FOR UPDATE OF a, s$/, rows: [accountRow()], inspect(values, sql) { assert.deepEqual(values, [account().loginName]); assert.equal(sql.includes(account().loginName), false); } },
    { sql: /^SELECT enabled FROM naijue_erp.hall WHERE id = \$1 FOR SHARE$/, rows: [{ enabled: true }] },
    { sql: /^INSERT INTO naijue_erp.auth_session/, count: 1, inspect(values) { assert.match(String(values[0]), /^[a-f0-9]{64}$/); assert.deepEqual(values.slice(1), [ACCOUNT_ID, 1, TIME, "2026-10-20T13:00:00.000Z", null]); } }, commit()]);
  const service = createAuthenticationService({ store: pgStore(client), now: () => TIME, policy: createSourceAuthenticationPolicy(3600), passwords: SYNTHETIC_PASSWORDS });
  const result = await service.login(account().loginName, OLD_PASSWORD); assert.match(result.token, /^[A-Za-z0-9_-]{43}$/); client.done();
});
test("SCRIPTED pg auth: password CAS and all-session revocation share the same transaction; closed handles reject", async () => {
  let captured: AuthenticationTransaction | undefined;
  const client = new ProtocolClient([begin(), { sql: /WHERE a.id = \$1 FOR UPDATE OF a, s$/, rows: [accountRow()] },
    { sql: /^SELECT enabled FROM naijue_erp.hall WHERE id = \$1 FOR SHARE$/, rows: [{ enabled: true }] },
    { sql: /^UPDATE naijue_erp.user_account SET password_hash = \$4, auth_version = auth_version \+ 1, version = version \+ 1/, count: 1, inspect(values, sql) {
      assert.deepEqual(values, [ACCOUNT_ID, 1, OLD_HASH, NEW_HASH, TIME]); assert.match(sql, /WHERE id = \$1 AND auth_version = \$2 AND password_hash = \$3/);
    } }, { sql: /^UPDATE naijue_erp.auth_session SET revoked_at = COALESCE\(revoked_at, \$2\) WHERE account_id = \$1$/, inspect(values) { assert.deepEqual(values, [ACCOUNT_ID, TIME]); } }, commit()]);
  const store = pgStore(client);
  await store.transaction(async tx => { captured = tx; await tx.getAccount(ACCOUNT_ID); assert.equal(await tx.changePassword(ACCOUNT_ID, 1, OLD_HASH, NEW_HASH, TIME), true); });
  await assert.rejects(captured!.getSession("11".repeat(32)), /closed/); client.done();
});
test("SCRIPTED pg auth: resolve locks account, fresh hall, then re-reads/locks the same session", async () => {
  const token = "A".repeat(43), hash = sessionTokenHash(token)!;
  const row = { token_hash: hash, account_id: ACCOUNT_ID, auth_version: 1, created_at: TIME, expires_at: "2026-10-20T13:00:00.000Z", revoked_at: null };
  const client = new ProtocolClient([begin(), { sql: /FROM naijue_erp.auth_session WHERE token_hash = \$1$/, rows: [row] },
    { sql: /WHERE a.id = \$1 FOR UPDATE OF a, s$/, rows: [accountRow()] },
    { sql: /^SELECT enabled FROM naijue_erp.hall WHERE id = \$1 FOR SHARE$/, rows: [{ enabled: true }], inspect(values) { assert.deepEqual(values, [HALL_ID]); } },
    { sql: /WHERE token_hash = \$1 AND account_id = \$2 FOR UPDATE$/, rows: [{ ...row, revoked_at: TIME }], inspect(values) { assert.deepEqual(values, [hash, ACCOUNT_ID]); } }, commit()]);
  const service = createAuthenticationService({ store: pgStore(client), now: () => TIME, policy: createSourceAuthenticationPolicy(3600), passwords: SYNTHETIC_PASSWORDS });
  assert.equal(await service.resolve(token), null); client.done();
});
test("SCRIPTED pg auth: newly disabled or missing hall after account lock denies login before session creation", async () => {
  for (const rows of [[{ enabled: false }], []]) {
    const client = new ProtocolClient([begin(), { sql: /WHERE a.login_name = \$1 FOR UPDATE OF a, s$/, rows: [accountRow()] },
      { sql: /^SELECT enabled FROM naijue_erp.hall WHERE id = \$1 FOR SHARE$/, rows }, rollback()]);
    const service = createAuthenticationService({ store: pgStore(client), now: () => TIME, policy: createSourceAuthenticationPolicy(3600), passwords: SYNTHETIC_PASSWORDS });
    await assert.rejects(service.login(account().loginName, OLD_PASSWORD), expectAuthCode("INVALID_CREDENTIALS")); client.done();
  }
});
test("SCRIPTED pg auth: storage/revocation error rolls back; commit failure discards connection; rollback failure aggregates", async () => {
  const failure = new Error("SYNTHETIC database failure");
  const normal = new ProtocolClient([begin(), { sql: /^UPDATE naijue_erp.auth_session/, error: failure }, rollback()]);
  await assert.rejects(pgStore(normal).transaction(tx => tx.revokeSession("11".repeat(32), TIME)), failure); normal.done();
  const uncertain = new ProtocolClient([begin(), { sql: /^COMMIT$/, error: failure }, rollback()]);
  await assert.rejects(pgStore(uncertain).transaction(async () => undefined), failure); uncertain.done(); assert.equal(uncertain.released[0], failure);
  const broken = new ProtocolClient([begin(), { sql: /^ROLLBACK$/, error: failure }]);
  await assert.rejects(pgStore(broken).transaction(async () => { throw new Error("SYNTHETIC callback failed"); }), AggregateError); broken.done(); assert.equal(broken.released[0], failure);
});
test("STATIC schema contract only: migration is additive session schema with no credential seed or backfill", () => {
  const sql = readFileSync(new URL("../../../adapters/postgres/migrations/0003_auth_sessions.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE naijue_erp.auth_session/); assert.match(sql, /token_hash text PRIMARY KEY/); assert.match(sql, /auth_version integer NOT NULL CHECK \(auth_version > 0\)/);
  assert.match(sql, /expires_at > created_at/);
  const metadata = /INSERT INTO naijue_erp\.schema_migration \(version, description\) VALUES \(3, '[^']+'\);/;
  assert.match(sql, metadata); assert.doesNotMatch(sql.replace(metadata, ""), /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
