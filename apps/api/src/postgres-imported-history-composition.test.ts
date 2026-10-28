import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
/** Host composition with scripted driver only; no engine, listener or network claims. */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPostgresReadApi, createPostgresApplicationApi } from "./postgres-read-api.ts";
import type { PostgresApplicationApiOptions } from "./postgres-read-api.ts";
import type { PostgresPoolDriverFactory, BoundedPostgresResult } from "../../../adapters/postgres/src/bounded-pool.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";

const origin = "https://synthetic-history.invalid";
const routes = ["/imported-history/sales/query", "/imported-history/sales/detail/query",
  "/imported-history/transfers/query", "/imported-history/transfers/detail/query"];
const base = (): PostgresApplicationApiOptions => ({ postgres: {
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

test("historical routes require explicit new-host opt-in; old factory ignores it and native profile grants none", async () => {
  for (const [factory, enabled] of [[createPostgresReadApi, false], [createPostgresApplicationApi, false], [createPostgresApplicationApi, true]] as const) {
    const d = noReadDriver(), api = await factory({ ...base(), ...(enabled || factory === createPostgresReadApi ? { importedHistoryRead: { authorization: denied } } : {}) }, d.factory);
    try {
      for (const url of routes) {
        assert.equal(api.app.hasRoute({ method: "POST", url }), enabled);
        assert.equal(api.app.hasRoute({ method: "GET", url }), false);
        if (enabled) {
          const response = await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} });
          assert.equal(response.statusCode, 401, response.body);
        }
      }
      for (const url of ["/sales/commands", "/transfers/commands", "/imported-history/sales/commands"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), false);
      assert.equal(api.app.server.listening, false);
      assert.deepEqual(d.counts(), { allocations: 1, connects: 0, ends: 0 });
    } finally { await api.close(); }
    assert.equal(d.counts().ends, 1);
  }
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

test("history provider is bound before first await; current session and Origin checks precede captured authorization", async () => {
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
  const pending = createPostgresApplicationApi({ ...base(), importedHistoryRead: { authorization } }, () => scripted);
  authorization.authorize = async () => { throw Error("Mutated provider must not replace captured policy"); };
  const api = await pending;
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
