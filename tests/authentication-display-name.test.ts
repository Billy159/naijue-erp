/** Read-contract unit/scripted-protocol checks only; no PostgreSQL, listener or real credentials. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresAuthenticationStore } from "../adapters/postgres/src/auth-store.ts";
import type { PgAuthenticationPool } from "../adapters/postgres/src/auth-store.ts";
import { createAuthenticationService } from "../packages/authentication/src/service.ts";
import type { AuthenticationAccount, AuthenticationSession, AuthenticationStore, AuthenticationTransaction } from "../packages/authentication/src/ports.ts";
import { createSourceAuthenticationPolicy } from "../packages/authentication/src/source-policy.ts";
import { entityId } from "../packages/domain/src/values.ts";

const accountId = entityId("account", "00000000-0000-0000-0000-00000000a021");
const staffId = entityId("staff", "00000000-0000-0000-0000-00000000a022");
const time = "2026-10-24T13:00:00.000Z";
const base: AuthenticationAccount = { accountId, staffId, loginName: "SYNTHETIC_LOGIN_A02", passwordHash: "SYNTHETIC_HASH_A02",
  loginEnabled: true, authVersion: 7, role: "ADMIN", employmentStatus: "在职", hallId: null, hallEnabled: null };
const identity = { accountId, staffId, loginName: base.loginName, role: base.role, hallId: null, authVersion: base.authVersion };
function service(account: AuthenticationAccount) {
  const sessions = new Map<string, AuthenticationSession>();
  const tx: AuthenticationTransaction = {
    async findAccountByLogin(name) { assert.equal(name, base.loginName); return account; },
    async getAccount(id) { assert.equal(id, accountId); return account; },
    async getSession(hash) { return sessions.get(hash); },
    async lockSession(hash, id) { assert.equal(id, accountId); return sessions.get(hash); },
    async insertSession(value) { sessions.set(value.tokenHash, value); },
    async revokeSession() { assert.fail("Display-name reads do not revoke a session"); },
    async changePassword() { assert.fail("Display-name reads do not change a password"); }
  };
  const store: AuthenticationStore = { async transaction(work) { return work(tx); } };
  return { sessions, api: createAuthenticationService({ store, now: () => time, policy: createSourceAuthenticationPolicy(3600),
    passwords: { async verify(value, hash) { assert.equal(value, "SYNTHETIC_PASSWORD_A02"); assert.equal(hash, base.passwordHash); return true; },
      async hash() { assert.fail("No password hashing in this read projection"); } } }) };
}
function scriptedStore(staffName: unknown) {
  const statements: string[] = [], releases: unknown[] = [];
  const pool: PgAuthenticationPool = { async connect() { return { async query(sql, values = []) {
    statements.push(sql);
    if (/^SELECT a.id AS account_id/.test(sql)) {
      assert.match(sql, /s\.name AS staff_name/); assert.match(sql, /WHERE a\.login_name = \$1 FOR UPDATE OF a, s$/);
      assert.deepEqual(values, [base.loginName]);
      return { rows: [{ account_id: accountId, staff_id: staffId, login_name: base.loginName, password_hash: base.passwordHash,
        login_enabled: true, auth_version: 7, role: base.role, employment_status: base.employmentStatus, hall_id: null, staff_name: staffName }], rowCount: 1 };
    }
    assert.ok(["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT", "ROLLBACK"].includes(sql)); return { rows: [], rowCount: 0 };
  }, release(error) { releases.push(error); } }; } };
  return { store: new PostgresAuthenticationStore(pool), statements, releases };
}
test("trusted PG staff name is decoded exactly from the existing locked account/staff join", async () => {
  const f = scriptedStore("奈爵·模拟员工甲");
  const account = await f.store.transaction(tx => tx.findAccountByLogin(base.loginName));
  assert.deepEqual(account, { ...base, staffName: "奈爵·模拟员工甲" });
  assert.equal(f.statements.length, 3); assert.equal(f.statements.at(-1), "COMMIT"); assert.deepEqual(f.releases, [undefined]);
});
test("login and session resolution expose trusted staffName without changing identity or session storage", async () => {
  const f = service({ ...base, staffName: "奈爵·模拟员工甲" });
  const login = await f.api.login(base.loginName, "SYNTHETIC_PASSWORD_A02");
  assert.deepEqual(login.principal, { ...identity, staffName: "奈爵·模拟员工甲" });
  assert.deepEqual(await f.api.resolve(login.token), login.principal);
  assert.equal(f.sessions.size, 1);
  const row = [...f.sessions.values()][0]!;
  assert.deepEqual(Object.keys(row).sort(), ["accountId", "authVersion", "createdAt", "expiresAt", "revokedAt", "tokenHash"]);
  assert.equal(row.accountId, accountId); assert.equal(row.authVersion, 7);
});
test("legacy trusted mocks without staffName keep the exact original principal shape", async () => {
  const f = service(base), login = await f.api.login(base.loginName, "SYNTHETIC_PASSWORD_A02");
  assert.deepEqual(login.principal, identity); assert.equal(Object.hasOwn(login.principal, "staffName"), false);
  assert.deepEqual(await f.api.resolve(login.token), identity);
});
test("malformed supplied display names never become a principal or fall back to the login identifier", async () => {
  for (const staffName of [undefined, null, "", " \t ", "模拟\0员工", 42]) {
    const malformed = { ...base, staffName } as unknown as AuthenticationAccount;
    const f = service(malformed);
    await assert.rejects(f.api.login(base.loginName, "SYNTHETIC_PASSWORD_A02"), { code: "INVALID_CREDENTIALS" });
    assert.equal(f.sessions.size, 0);
  }
});
test("invalid PG display projection rejects and rolls back without inventing staffName", async () => {
  for (const staffName of [null, "", "  ", "模拟\0员工", 42]) {
    const f = scriptedStore(staffName);
    await assert.rejects(f.store.transaction(tx => tx.findAccountByLogin(base.loginName)), { code: "INVALID_DATABASE_VALUE" });
    assert.equal(f.statements.at(-1), "ROLLBACK"); assert.deepEqual(f.releases, [undefined]);
  }
});
