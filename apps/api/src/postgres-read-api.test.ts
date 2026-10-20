/** SYNTHETIC Fastify.inject + scripted pg protocol only. Real adapters/service/Node scrypt,
 * but no actual PostgreSQL SQL, listener, network, account seeding or credentials access. */
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import inject from "light-my-request";
import test from "node:test";
import type { TestContext } from "node:test";
import type { BoundedPostgresConfig, BoundedPostgresResult, PostgresDriverClient, PostgresPoolDriverFactory } from "../../../adapters/postgres/src/bounded-pool.ts";
import type { AuthenticationSession } from "../../../packages/authentication/src/ports.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import { createSourceConfirmedTransferQueryAuthorization } from "../../../packages/application/src/transfer-query-service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import type { SalesListQuery } from "../../../packages/application/src/sales-query-ports.ts";
import { createPostgresReadApi } from "./postgres-read-api.ts";
import type { PostgresReadApiOptions } from "./postgres-read-api.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";

const ORIGIN = "https://synthetic-erp.invalid";
const TIME = "2026-10-20T12:00:00.000Z";
const TOKEN = Buffer.alloc(32, 23).toString("base64url");
const PASSWORD = "SYNTHETIC only password";
const SALT = Buffer.alloc(16, 19);
const HASH = `naijue:scrypt:1:32768:8:1:${SALT.toString("hex")}:${scryptSync(PASSWORD, SALT, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const inventoryInput = () => ({ filter: { products: [], category: null, warehouses: [], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 100 });
const salesInput = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null,
  hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null }, page: 1, pageSize: 20 });
const transferInput = () => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 });
const warehouse = { id: ids.warehouse, hallId: ids.hall, label: "SYNTHETIC warehouse" };
const postgres = (): BoundedPostgresConfig => ({ target: { host: "synthetic-never-connected.invalid", port: 5432, database: "SYNTHETIC_NOT_REAL", user: "SYNTHETIC_ONLY",
  password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false }, max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000,
  queryTimeoutMillis: 1000, statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000,
  disposeGraceMillis: 0, disposeTimeoutMillis: 1000 });
function options(): PostgresReadApiOptions {
  return { postgres: postgres(), authentication: { trustedOrigin: ORIGIN, now: () => TIME, policy: createSourceAuthenticationPolicy(900) }, authorization: {
    inventory: { async authorize() { return { hallIds: [ids.hall], warehouses: [warehouse] }; } },
    sales: { async authorize(actor) { assert.equal(actor.hallId, ids.hall); return { kind: "restricted", clauses: [{ hallId: actor.hallId! }] }; } },
    transfers: createSourceConfirmedTransferQueryAuthorization(), products: { async authorize(_actor, intent) { return { productId: intent.parameters.productId }; } }
  }, productMedia: null };
}
type Call = { readonly sql: string; readonly values: unknown[] };
class ScriptedDriver extends EventEmitter {
  connects = 0; ends = 0; releases: (Error | boolean | undefined)[] = []; calls: Call[] = [];
  failEnd = false; failBusiness = false; loginEnabled = true;
  business: ((sql: string, values: unknown[]) => BoundedPostgresResult | Promise<BoundedPostgresResult>) | undefined;
  readonly account = { account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee", password_hash: HASH,
    login_enabled: true, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall };
  readonly sessions = new Map<string, AuthenticationSession>([[sessionTokenHash(TOKEN)!, { tokenHash: sessionTokenHash(TOKEN)!, accountId: ids.account,
    authVersion: 1, createdAt: TIME, expiresAt: "2026-10-20T12:15:00.000Z", revokedAt: null }]]);
  readonly factory: PostgresPoolDriverFactory = config => {
    assert.equal(config.host, "synthetic-never-connected.invalid"); assert.equal(config.max, 2);
    return this;
  };
  async connect(): Promise<PostgresDriverClient> {
    this.connects++; const events = new EventEmitter();
    return Object.assign(events, { query: async (sql: string, values: unknown[] = []) => {
      this.calls.push({ sql, values: structuredClone(values) }); return this.query(sql, values);
    }, release: (error?: Error | boolean) => { this.releases.push(error); } });
  }
  async end(): Promise<void> { this.ends++; if (this.failEnd) throw new Error("SYNTHETIC private driver disposal error"); }
  private async query(sql: string, values: unknown[]): Promise<BoundedPostgresResult> {
    const rows = (value: Record<string, unknown>[]): BoundedPostgresResult => ({ rows: value, rowCount: value.length });
    if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
    if (sql.includes("FROM naijue_erp.user_account a JOIN")) {
      const matches = sql.includes("a.login_name = $1") ? values[0] === this.account.login_name : values[0] === this.account.account_id;
      return rows(matches ? [{ ...this.account, login_enabled: this.loginEnabled }] : []);
    }
    if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
    if (sql.includes("FROM naijue_erp.auth_session WHERE") || sql.includes("FROM naijue_erp.auth_session\n")) {
      const session = this.sessions.get(String(values[0]));
      return rows(session && (values.length === 1 || values[1] === session.accountId) ? [{ token_hash: session.tokenHash, account_id: session.accountId,
        auth_version: session.authVersion, created_at: session.createdAt, expires_at: session.expiresAt, revoked_at: session.revokedAt }] : []);
    }
    if (sql.startsWith("INSERT INTO naijue_erp.auth_session")) {
      const [tokenHash, accountId, authVersion, createdAt, expiresAt, revokedAt] = values;
      this.sessions.set(String(tokenHash), { tokenHash, accountId, authVersion, createdAt, expiresAt, revokedAt } as AuthenticationSession);
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE naijue_erp.auth_session SET revoked_at")) {
      const session = this.sessions.get(String(values[0])); if (session) this.sessions.set(session.tokenHash, { ...session, revokedAt: String(values[1]) });
      return { rows: [], rowCount: session ? 1 : 0 };
    }
    if (this.failBusiness) throw new Error("SYNTHETIC private SQL/parameter/credential failure");
    if (this.business) return this.business(sql, values);
    if (sql.includes("/* inventory:publication */")) return rows([]); // Explicitly unpublished fixture; never invent stock zero.
    if (sql.includes("/* inventory-ledger:warehouse */")) return rows([{ id: warehouse.id, hall_id: warehouse.hallId, name: warehouse.label }]);
    if (sql.includes("/* inventory-ledger:sku */")) return rows([]);
    if (/SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.(sales_header|transfer_header|warehouse)/.test(sql)) return rows([{ exact_total: "0" }]);
    if (/SELECT h\.id, h\.number/.test(sql) && /FROM naijue_erp\.(sales_header|transfer_header)/.test(sql)) return rows([]);
    if (sql.includes("FROM naijue_erp.product p") || sql.includes("FROM naijue_erp.product_image i")) return rows([]);
    throw new Error("SYNTHETIC scripted protocol does not recognize this query");
  }
}
async function setup(t: TestContext, value = options(), driver = new ScriptedDriver()) {
  const api = await createPostgresReadApi(value, driver.factory); t.after(() => api.close());
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => api.app.inject({ method: "POST", url, payload: JSON.stringify(payload),
    headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-naijue_session=${TOKEN}`, ...headers } });
  return { ...api, driver, post };
}
test("SYNTHETIC composition: one lazy owned pool, 19 native auth/read routes, no business writes/listener", async t => {
  const f = await setup(t); assert.equal(f.driver.connects, 0); assert.equal(f.app.server.listening, false);
  const posts = ["/auth/login", "/auth/logout", "/auth/password", "/inventory/query", "/inventory/candidates/query", "/inventory/ledger/query",
    "/sales/query", "/sales/references/query", "/sales/detail/query", "/sales/history/query", "/sales/settlement-statistics/query", "/transfers/query",
    "/transfers/detail/query", "/transfers/warehouses/query", "/products/basics/query", "/products/specifications/query", "/products/images/query", "/products/image/query"];
  for (const url of posts) assert.ok(f.app.hasRoute({ method: "POST", url }), url);
  assert.ok(f.app.hasRoute({ method: "GET", url: "/auth/session" }));
  for (const url of ["/sales/commands", "/transfers/commands", "/customers/commands", "/suppliers/commands", "/accounts", "/products/commands"])
    assert.equal((await f.post(url, {})).statusCode, 404, url);
  assert.equal(f.driver.connects, 0); assert.equal(f.postgresBackgroundFailureCount, 0);
  await f.close(); await f.close(); assert.equal(f.driver.ends, 1); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC composition: explicit origin/policy/media and bounded configuration fail closed", async () => {
  const invalid: PostgresReadApiOptions[] = [
    { ...options(), authentication: { ...options().authentication, trustedOrigin: "http://synthetic.invalid" } },
    { ...options(), authentication: { ...options().authentication, trustedOrigin: `${ORIGIN}/` } },
    { ...options(), authorization: {} } as PostgresReadApiOptions,
    { ...options(), productMedia: undefined } as unknown as PostgresReadApiOptions,
    { ...options(), productMedia: { deliveryOrigin: ORIGIN } } as PostgresReadApiOptions,
    { ...options(), postgres: { ...postgres(), max: 0 } }
  ];
  for (const value of invalid) { const driver = new ScriptedDriver(); await assert.rejects(createPostgresReadApi(value, driver.factory)); assert.equal(driver.connects, 0); assert.equal(driver.ends, 0); }
});
test("SYNTHETIC composition: failed authentication-policy construction cleans its pool without a connection", async () => {
  const driver = new ScriptedDriver(); const value = options();
  await assert.rejects(createPostgresReadApi({ ...value, authentication: { ...value.authentication, policy: { ...value.authentication.policy, sessionTtlSeconds: 0 } } }, driver.factory),
    /complete policy/);
  assert.equal(driver.connects, 0); assert.equal(driver.ends, 1);
});
test("SYNTHETIC composition: real Node scrypt login/store/session/logout wiring never exposes token in JSON", async t => {
  const f = await setup(t);
  const login = await f.post("/auth/login", { loginName: f.driver.account.login_name, password: PASSWORD });
  assert.equal(login.statusCode, 200); assert.equal(login.json().principal.accountId, ids.account); assert.equal(login.json().principal.role, "SALESPERSON");
  const cookie = login.headers["set-cookie"]; assert.equal(typeof cookie, "string");
  assert.match(String(cookie), /HttpOnly; Secure; SameSite=Strict/); const credential = String(cookie).split(";")[0]!;
  assert.equal(login.body.includes(credential.split("=")[1]!), false); assert.equal(f.driver.sessions.size, 2);
  const session = await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: credential } });
  assert.equal(session.statusCode, 200); assert.equal(session.json().principal.hallId, ids.hall);
  const logout = await f.post("/auth/logout", {}, { cookie: credential }); assert.equal(logout.statusCode, 204); assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/);
  const cleared = await f.app.inject({ method: "GET", url: "/auth/session", headers: { cookie: credential } }); assert.deepEqual(cleared.json(), { principal: null });
  assert.equal(f.app.server.listening, false); assert.ok(f.driver.calls.some(call => call.sql.startsWith("INSERT INTO naijue_erp.auth_session")));
});
test("SYNTHETIC composition: all read families resolve the same current PG session; native adapters retain isolated failures", async t => {
  const f = await setup(t); const productId = sid("product", 121);
  const cases = [["/sales/query", salesInput(), 200], ["/transfers/query", transferInput(), 200],
    ["/products/basics/query", { productId }, 200], ["/products/specifications/query", { productId }, 200], ["/products/images/query", { productId }, 200],
    ["/products/image/query", { productId, imageId: sid("operation", 122) }, 404], ["/inventory/query", inventoryInput(), 503],
    ["/inventory/candidates/query", { kind: "warehouse", search: "", page: 1, pageSize: 20, selectedIds: [], categoryId: null }, 503],
    ["/inventory/ledger/query", { warehouseId: ids.warehouse, skuId: ids.sku, pageSize: 20, after: null }, 404]] as const;
  for (const [url, payload, status] of cases) {
    const response = await f.post(url, payload); assert.equal(response.statusCode, status, `${url}: ${response.body}`);
    assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers.pragma, "no-cache");
    if (url === "/sales/query" || url === "/transfers/query") assert.deepEqual(response.json(), { page: 1, pageSize: 20, exactTotal: "0", items: [] });
  }
  const transferSql = f.driver.calls.find(call => call.sql.includes("COUNT(*)") && call.sql.includes("naijue_erp.transfer_header")); assert.ok(transferSql);
  assert.ok(transferSql.sql.includes("created_role")); assert.deepEqual(transferSql.values, [ids.hall, ids.hall, ids.hall, "SALESPERSON"]);
  assert.equal(f.driver.calls.filter(call => call.sql === "BEGIN ISOLATION LEVEL READ COMMITTED").length, cases.length);
  assert.equal(f.driver.calls.filter(call => call.sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY").length, cases.length);
  assert.equal(f.driver.releases.length, cases.length * 2);
});
test("SYNTHETIC composition: missing/stale/cross-site credentials cannot reach policies or business SQL", async t => {
  const value = options(); let policyCalls = 0; const f = await setup(t, { ...value, authorization: { ...value.authorization,
    products: { async authorize() { policyCalls++; throw new Error("SYNTHETIC must not execute"); } } } });
  for (const headers of [{ cookie: "" }, { cookie: "__Host-naijue_session=bad" }, { origin: "https://other.invalid" }, { origin: "" },
    { authorization: `Bearer ${TOKEN}` }, { "sec-fetch-site": "cross-site" }, { cookie: `__Host-naijue_session=${TOKEN}; __Host-naijue_session=${TOKEN}` }])
    assert.equal((await f.post("/products/basics/query", { productId: sid("product", 123) }, headers)).statusCode, 401);
  assert.equal(f.driver.connects, 0); assert.equal(policyCalls, 0);
  f.driver.loginEnabled = false;
  assert.equal((await f.post("/products/basics/query", { productId: sid("product", 123) })).statusCode, 401);
  assert.equal(policyCalls, 0); assert.equal(f.driver.calls.some(call => call.sql.includes("FROM naijue_erp.product p")), false);
});
test("SYNTHETIC composition: hall policy is mandatory, denied inventory/ledger and product reads do not obtain business leases", async t => {
  const value = options(); let calls = 0;
  const f = await setup(t, { ...value, authorization: { ...value.authorization, inventory: { async authorize(actor) {
    calls++; assert.deepEqual(actor, { accountId: ids.account, hallId: ids.hall }); throw new DomainError("FORBIDDEN", "SYNTHETIC private scope");
  } }, products: { async authorize() { calls++; throw new DomainError("FORBIDDEN", "SYNTHETIC private product grant"); } } } });
  for (const [url, payload] of [["/inventory/query", inventoryInput()], ["/inventory/ledger/query", { warehouseId: ids.warehouse, skuId: ids.sku, pageSize: 20, after: null }],
    ["/products/basics/query", { productId: sid("product", 124) }]] as const) {
    const response = await f.post(url, payload); assert.equal(response.statusCode, 403); assert.equal(response.body.includes("SYNTHETIC"), false);
  }
  assert.equal(calls, 3); assert.equal(f.driver.calls.some(call => call.sql.includes("REPEATABLE READ")), false);
});
test("SYNTHETIC composition: sanitized provider failures remain local to their read plugin", async t => {
  const f = await setup(t); f.driver.failBusiness = true;
  const failed = await f.post("/products/basics/query", { productId: sid("product", 125) });
  assert.equal(failed.statusCode, 500); assert.deepEqual(failed.json(), { error: { code: "INTERNAL_ERROR", message: "The product read could not be completed" } });
  f.driver.failBusiness = false;
  const sales = await f.post("/sales/query", salesInput()); assert.equal(sales.statusCode, 200);
  const inventory = await f.post("/inventory/query", inventoryInput()); assert.equal(inventory.statusCode, 503); assert.equal(inventory.json().error.code, "INVENTORY_NOT_READY");
  assert.ok(f.driver.releases.some(error => error === true));
});
test("SYNTHETIC composition: explicit raw aborted event in a pending policy does not cancel a sibling read", async t => {
  const value = options(); const signals: AbortSignal[] = []; let enter!: () => void; let resume!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }); const hold = new Promise<void>(resolve => { resume = resolve; });
  const f = await setup(t, { ...value, authorization: { ...value.authorization, products: { async authorize(_actor, intent, signal) {
    signals.push(signal); if (signals.length === 1) { enter(); await hold; } return { productId: intent.parameters.productId };
  } } } });
  let raw: IncomingMessage | undefined;
  // Capture the injected raw request to exercise the installed abort handler only.
  // This synthetic event is NOT evidence of actual HTTP/network or pg-wire cancellation.
  const cancelled = inject((request, reply) => { raw = request; f.app.routing(request, reply); }, {
    method: "POST", url: "/products/basics/query", payload: { productId: sid("product", 126) },
    headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-naijue_session=${TOKEN}` }
  });
  await entered; raw!.emit("aborted");
  const sibling = await f.post("/products/basics/query", { productId: sid("product", 127) }); assert.equal(sibling.statusCode, 200);
  resume(); const cancelledResponse = await cancelled; assert.equal(cancelledResponse.statusCode, 408);
  assert.equal(signals.length, 2); assert.equal(signals[0]!.aborted, true); assert.equal(signals[1]!.aborted, false); assert.notEqual(signals[0], signals[1]);
  assert.equal(f.driver.calls.filter(call => call.sql.includes("FROM naijue_erp.product p")).length, 1);
});
test("SYNTHETIC composition: caller method replacement cannot widen captured policy after construction", async t => {
  const value = options(); const f = await setup(t, value); let replaced = 0;
  Object.assign(value.authorization.products, { authorize: async () => { replaced++; throw new Error("SYNTHETIC replaced provider"); } });
  const response = await f.post("/products/basics/query", { productId: sid("product", 128) }); assert.equal(response.statusCode, 200); assert.equal(replaced, 0);
});
test("SYNTHETIC composition: pool disposal errors reject shutdown and never repeat driver end", async () => {
  const driver = new ScriptedDriver(); driver.failEnd = true; const f = await createPostgresReadApi(options(), driver.factory);
  await assert.rejects(f.close(), { code: "PG_DISPOSE_FAILED" }); assert.equal(driver.ends, 1); assert.equal(driver.connects, 0);
});
test("SYNTHETIC composition source: no ambient configuration, startup, migration or business command registration", () => {
  const source = readFileSync(new URL("./postgres-read-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|dotenv|\.listen\s*\(|readFile|createSalesHttpPlugin|createTransferHttpPlugin|createPartyMaintenanceHttpPlugin/);
  assert.equal((source.match(/new BoundedPostgresPool\(/g) ?? []).length, 1);
  assert.equal((source.match(/app\.register\(/g) ?? []).length, 6);
});
