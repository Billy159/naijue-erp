import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
/** Host composition with scripted driver only; no engine, listener or network claims. */
import test from "node:test";
import Fastify from "fastify";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPostgresReadApi, createPostgresApplicationApi, createPostgresRuntime26ApplicationApi } from "./postgres-read-api.ts";
import { BoundedPostgresPool } from "../../../adapters/postgres/src/bounded-pool.ts";
import { PostgresAuthenticationStore } from "../../../adapters/postgres/src/auth-store.ts";
import { PostgresImportedHistoryQueryReader } from "../../../adapters/postgres/src/imported-history-query-reader.ts";
import { createAuthenticationService } from "../../../packages/authentication/src/service.ts";
import { createNodeScryptPasswords } from "../../../packages/authentication/src/passwords.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import { createImportedHistoryQueryHttpPlugin } from "./imported-history-query-http.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../../../packages/application/src/source-confirmed-current-form-authorization.ts";
import { createSyntheticV7Fixture } from "../../../tests/support/live-ledger-api-v7-fixtures.ts";
import type { PostgresApplicationApiOptions } from "./postgres-read-api.ts";
import type { PostgresPoolDriverFactory, BoundedPostgresResult } from "../../../adapters/postgres/src/bounded-pool.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";

// Explicit protocol-only resource singleton. This is not a real capacity window or grant.
const testCapacity = () => ({ async acquire() { return { assertValid() {}, release() {} }; }, close() {} });
const origin = "https://synthetic-history.invalid";
const routes = ["/imported-history/sales/query", "/imported-history/sales/detail/query",
  "/imported-history/transfers/query", "/imported-history/transfers/detail/query"];
const base = (): PostgresApplicationApiOptions => ({ capacityAdmission: testCapacity(), postgres: {
  target: { host: "synthetic-not-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
  max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1000,
  statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000,
}, authentication: { trustedOrigin: origin, now: () => "2026-10-22T00:00:00.000Z", policy: createSourceAuthenticationPolicy(900), work:authenticationWork() },
  authorization: { mode: "source-confirmed-native" }, productMedia: null });
const denied = { async authorize(): Promise<never> { throw new DomainError("IMPORTED_HISTORY_FORBIDDEN", "SYNTHETIC denied history scope"); } };
function noReadDriver() {
  let allocations = 0, connects = 0, ends = 0;
  const value = Object.assign(new EventEmitter(), { async connect(): Promise<never> { connects++; throw Error("No unauthenticated database read"); }, async end() { ends++; } });
  const factory: PostgresPoolDriverFactory = () => { allocations++; return value; };
  return { factory, counts: () => ({ allocations, connects, ends }) };
}

test("history composition missing explicit capacity refuses before pool allocation", async () => {
  const { capacityAdmission: _capacity, ...withoutCapacity } = base(), d = noReadDriver();
  await assert.rejects(createPostgresApplicationApi(withoutCapacity, d.factory), /explicit singleton capacity admission/);
  assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
});

test("historical legacy factory/opt-in shapes now refuse the unreviewed non-CORE graph before driver allocation", async () => {
  for (const [factory, enabled] of [[createPostgresReadApi, false], [createPostgresApplicationApi, false], [createPostgresApplicationApi, true]] as const) {
    const d = noReadDriver();
    await assert.rejects(factory({ ...base(), ...(enabled || factory === createPostgresReadApi ? { importedHistoryRead: { authorization: denied } } : {}) }, d.factory),
      /Recorded live ledger pairs require the independently reviewed V7 runtime/);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
});

// The supported V7 graph deliberately selects closed native policies, not the old
// per-family injected policy. This is a NEW fixture, not a relabelled old review.
test("NEW SYNTHETIC V7 HISTORY graph installs four native read routes after full proof, no write or listener", async () => {
  const value = base(), f = createSyntheticV7Fixture(value.postgres.target);
  let allocations = 0, connects = 0, releases = 0, ends = 0;
  const statements: string[] = [];
  const scripted = Object.assign(new EventEmitter(), { async connect() {
    connects++; return Object.assign(new EventEmitter(), { release() { releases++; }, async query(sql: string): Promise<BoundedPostgresResult> {
      statements.push(sql); const proof = f.query(sql); if (proof !== undefined) return proof;
      throw Error("No unauthenticated database read after genuine V7 startup proof");
    } });
  }, async end() { ends++; } });
  const options: PostgresApplicationApiOptions = { ...value, currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() },
    nativeReadExtensions: { profile: "source-confirmed-r1-v1" } };
  try {
    const api = await createPostgresRuntime26ApplicationApi(options, f.review, () => { allocations++; return scripted; });
    try {
      const baseline = { connects, statements: statements.length }; assert.equal(baseline.connects, 2); assert.equal(releases, connects);
      for (const url of routes) {
        assert.equal(api.app.hasRoute({ method: "POST", url }), true);
        assert.equal(api.app.hasRoute({ method: "GET", url }), false);
        const response = await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} });
        assert.equal(response.statusCode, 401, response.body);
      }
      for (const url of ["/sales/commands", "/transfers/commands", "/imported-history/sales/commands"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), false);
      assert.equal(api.app.server.listening, false);
      assert.equal(allocations, 1); assert.equal(connects, baseline.connects); assert.equal(statements.length, baseline.statements);
    } finally { await api.close(); }
    assert.equal(ends, 1); assert.equal(connects, releases);
  } finally { f.cleanup(); }
});

test("NEW SYNTHETIC V7 HISTORY entry refuses explicit history-policy override before allocating its owned pool", async () => {
  const value = base(), f = createSyntheticV7Fixture(value.postgres.target), d = noReadDriver();
  try {
    await assert.rejects(createPostgresRuntime26ApplicationApi({ ...value,
      currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() }, nativeReadExtensions: { profile: "source-confirmed-r1-v1" },
      importedHistoryRead: { authorization: denied } }, f.review, d.factory), /Native read extensions require only their exact trusted profile and native identity policy/);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  } finally { f.cleanup(); }
});

test("history option, exact bag and provider accessors fail before pool allocation without invoking getters", async () => {
  let getters = 0;
  const accessor = Object.defineProperty(base(), "importedHistoryRead", { get() { getters++; return { authorization: denied }; } });
  const nested = Object.defineProperty({}, "authorization", { enumerable: true, get() { getters++; return denied; } });
  const provider = Object.defineProperty({}, "authorize", { get() { getters++; return denied.authorize; } });
  const invalid: unknown[] = [accessor,
    Object.assign(Object.create({ importedHistoryRead: { authorization: denied } }), base()),
    ...[undefined, null, {}, { authorization: denied, extra: true }, { authorization: denied, [Symbol("unknown")]: true }, nested, { authorization: provider }, { authorization: {} }]
      .map(importedHistoryRead => ({ ...base(), importedHistoryRead }))];
  for (const options of invalid) {
    const d = noReadDriver();
    await assert.rejects(createPostgresApplicationApi(options as PostgresApplicationApiOptions, d.factory), TypeError);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
  assert.equal(getters, 0);
});

// Closed V7 composition cannot accept an injected HISTORY policy. Preserve the
// original injected-provider capture contract on its actual original HTTP plugin,
// real authentication store/service and bounded pool, rather than relaxing R1.
test("original history HTTP plugin binds provider before first await; real session and Origin checks precede captured authorization", async () => {
  const token = Buffer.alloc(32, 51).toString("base64url"), hash = sessionTokenHash(token)!;
  let enabled = true, providerCalls = 0, ends = 0;
  const statements: string[] = [];
  const rows = (rows: Record<string, unknown>[]): BoundedPostgresResult => ({ rows, rowCount: rows.length });
  const scripted = Object.assign(new EventEmitter(), { async connect() { return Object.assign(new EventEmitter(), {
    release() {}, async query(sql: string): Promise<BoundedPostgresResult> {
      statements.push(sql);
      if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
      if (sql.includes("FROM naijue_erp.auth_session")) return rows([{ token_hash: hash, account_id: ids.account, auth_version: 1,
        created_at: "2026-10-22T00:00:00.000Z", expires_at: "2026-10-22T00:15:00.000Z", revoked_at: null }]);
      if (sql.includes("FROM naijue_erp.user_account a JOIN")) return rows([{ account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee",
        password_hash: "SYNTHETIC_UNUSED_HASH", login_enabled: enabled, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }]);
      if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
      throw Error("Authorization rejection must precede historical SQL");
    },
  }); }, async end() { ends++; } });
  const authorization = { marker: "BOUND", async authorize(): Promise<never> {
    assert.equal(this.marker, "BOUND"); providerCalls++; throw new DomainError("IMPORTED_HISTORY_FORBIDDEN", "SYNTHETIC policy");
  } };
  const value = base(), pool = new BoundedPostgresPool(value.postgres, () => scripted);
  const service = createAuthenticationService({ store: new PostgresAuthenticationStore(pool), now: value.authentication.now,
    policy: value.authentication.policy, passwords: createNodeScryptPasswords() });
  const authenticate = createSalesSessionAuthenticator({ service, trustedOrigin: origin });
  const plugin = createImportedHistoryQueryHttpPlugin({ authenticate, dependencies: { authorization, reader: new PostgresImportedHistoryQueryReader(pool) } });
  authorization.authorize = async () => { throw Error("Mutated provider must not replace captured policy"); };
  const app = Fastify({ logger: false, trustProxy: false }); app.addHook("onClose", async () => { await pool.dispose(); });
  app.register(plugin); await app.ready();
  const api = { app, close: () => app.close() };
  const payload = { batchId: null, number: "", businessDateFrom: null, businessDateTo: null, sourceStatus: null,
    hallId: null, warehouseId: null, customerId: null, salespersonId: null, fromWarehouseId: null, toWarehouseId: null, page: 1, pageSize: 20 };
  const headers = { origin, cookie: `__Host-naijue_session=${token}` };
  try {
    const forbidden = await api.app.inject({ method: "POST", url: routes[0]!, headers, payload });
    assert.equal(forbidden.statusCode, 403, JSON.stringify({ body: forbidden.body, statements })); assert.equal(providerCalls, 1);
    const crossOrigin = await api.app.inject({ method: "POST", url: routes[0]!, headers: { ...headers, origin: "https://other-synthetic.invalid" }, payload });
    // The existing session adapter intentionally reports rejected Origin as no identity.
    assert.equal(crossOrigin.statusCode, 401, crossOrigin.body); assert.equal(providerCalls, 1);
    enabled = false;
    const revoked = await api.app.inject({ method: "POST", url: routes[0]!, headers, payload });
    assert.equal(revoked.statusCode, 401, revoked.body); assert.equal(providerCalls, 1);
    assert.equal(statements.some(sql => /(?:FROM|JOIN) naijue_erp\.(?:history_|import_batch|import_history_)/.test(sql)), false);
  } finally { await api.close(); }
  assert.equal(ends, 1);
});


// Native composition coverage is separate from the original injected-policy
// plugin contract above. Source-native identity denial must stop HISTORY SQL.
test("NEW SYNTHETIC V7 native HISTORY graph authenticates current session and Origin before independent current HISTORY scope", async () => {
  const value = base(), f = createSyntheticV7Fixture(value.postgres.target);
  const token = Buffer.alloc(32, 52).toString("base64url"), hash = sessionTokenHash(token)!;
  let enabled = true, nativeAllowed = false, nativeReads = 0, allocations = 0, connects = 0, releases = 0, ends = 0;
  const statements: string[] = [];
  const rows = (rows: Record<string, unknown>[]): BoundedPostgresResult => ({ rows, rowCount: rows.length });
  const scripted = Object.assign(new EventEmitter(), { async connect() {
    connects++; return Object.assign(new EventEmitter(), { release() { releases++; }, async query(sql: string, values: unknown[] = []): Promise<BoundedPostgresResult> {
      statements.push(sql); const proof = f.query(sql); if (proof !== undefined) return proof;
      if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
      if (sql.includes("/* application-read:identity */")) { nativeReads++; return rows([{ account_id: ids.account, staff_id: sid("staff", 120),
        login_enabled: nativeAllowed, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall, native_hall_id: ids.hall, hall_enabled: true }]); }
      if (sql.includes("FROM naijue_erp.auth_session")) return rows([{ token_hash: hash, account_id: ids.account, auth_version: 1,
        created_at: "2026-10-22T00:00:00.000Z", expires_at: "2026-10-22T00:15:00.000Z", revoked_at: null }]);
      if (sql.includes("FROM naijue_erp.user_account a JOIN")) return rows([{ account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee",
        password_hash: "SYNTHETIC_UNUSED_HASH", login_enabled: enabled, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }]);
      if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
      if (sql.includes("/* imported-history:schema */")) return rows([{ versions: Array.from({ length: 26 }, (_, index) => index + 1) }]);
      if (sql.includes("/* imported-history:list-shared */")) { assert.deepEqual(values[1], [ids.hall], "Current salesperson hall stays an exact parameterized HISTORY scope"); return rows([{ total: "0", items: [] }]); }
      throw Error("Unrecognized native HISTORY protocol SQL");
    } });
  }, async end() { ends++; } });
  try {
    const api = await createPostgresRuntime26ApplicationApi({ ...value, currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() },
      nativeReadExtensions: { profile: "source-confirmed-r1-v1" } }, f.review, () => { allocations++; return scripted; });
    try {
      const baseline = statements.length; assert.equal(connects, 2); assert.equal(connects, releases);
      const payload = { batchId: null, number: "", businessDateFrom: null, businessDateTo: null, sourceStatus: null,
        hallId: null, warehouseId: null, customerId: null, salespersonId: null, fromWarehouseId: null, toWarehouseId: null, page: 1, pageSize: 20 };
      const headers = { origin, cookie: `__Host-naijue_session=${token}` };
      const forbidden = await api.app.inject({ method: "POST", url: routes[0]!, headers, payload });
      assert.equal(forbidden.statusCode, 403, forbidden.body); assert.equal(nativeReads, 1);
      const beforeCrossOrigin = statements.length;
      const crossOrigin = await api.app.inject({ method: "POST", url: routes[0]!, headers: { ...headers, origin: "https://other-synthetic.invalid" }, payload });
      assert.equal(crossOrigin.statusCode, 401, crossOrigin.body); assert.equal(nativeReads, 1); assert.equal(statements.length, beforeCrossOrigin);
      enabled = false;
      const revoked = await api.app.inject({ method: "POST", url: routes[0]!, headers, payload });
      assert.equal(revoked.statusCode, 401, revoked.body); assert.equal(nativeReads, 1);
      assert.equal(statements.slice(baseline).some(sql => /(?:FROM|JOIN) naijue_erp\.(?:history_|import_batch|import_history_)/.test(sql)), false);
      enabled = true; nativeAllowed = true;
      const permitted = await api.app.inject({ method: "POST", url: routes[0]!, headers, payload });
      assert.equal(permitted.statusCode, 200, permitted.body); assert.equal(nativeReads, 2);
      assert.equal(permitted.headers["cache-control"], "no-store"); assert.deepEqual(permitted.json().documents.items, []);
      const list = statements.findLast(sql => sql.includes("/* imported-history:list-shared */")); assert.ok(list); assert.match(list, /h\.hall_id=ANY/);
      assert.equal(allocations, 1); assert.equal(connects, releases); assert.equal(api.app.server.listening, false);
    } finally { await api.close(); }
    assert.equal(ends, 1); assert.equal(connects, releases);
  } finally { f.cleanup(); }
});
