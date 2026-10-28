import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
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
import { createSourceConfirmedCurrentFormAuthorization } from "../../../packages/application/src/source-confirmed-current-form-authorization.ts";
import type { CurrentFormAuthorization } from "../../../packages/application/src/current-form-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import type { SalesListQuery } from "../../../packages/application/src/sales-query-ports.ts";
import { createPostgresReadApi } from "./postgres-read-api.ts";
import type { PostgresReadApiAuthorization, PostgresReadApiExplicitAuthorization, PostgresReadApiOptions } from "./postgres-read-api.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";

const ORIGIN = "https://synthetic-erp.invalid";
const TIME = "2026-10-20T12:00:00.000Z";
const TOKEN = Buffer.alloc(32, 23).toString("base64url");
const PASSWORD = "SYNTHETIC only password";
const SALT = Buffer.alloc(16, 19);
const HASH = `naijue:scrypt:1:32768:8:1:${SALT.toString("hex")}:${scryptSync(PASSWORD, SALT, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const inventoryInput = () => ({ filter: { products: [], categories: [], warehouses: [], suppliers: [], fits: [], seasons: [] }, page: 1, pageSize: 100 });
const salesInput = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null }, page: 1, pageSize: 20 });
const transferInput = () => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 });
const warehouse = { id: ids.warehouse, hallId: ids.hall, label: "SYNTHETIC warehouse" };
const postgres = (): BoundedPostgresConfig => ({ target: { host: "synthetic-never-connected.invalid", port: 5432, database: "SYNTHETIC_NOT_REAL", user: "SYNTHETIC_ONLY",
  password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false }, max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000,
  queryTimeoutMillis: 1000, statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000,
  disposeGraceMillis: 0, disposeTimeoutMillis: 1000 });
function options(): PostgresReadApiOptions & { readonly authorization: PostgresReadApiExplicitAuthorization } {
  return { postgres: postgres(), authentication: { trustedOrigin: ORIGIN, now: () => TIME, policy: createSourceAuthenticationPolicy(900), work:authenticationWork() }, authorization: {
    inventory: { async authorize() { return { hallIds: [ids.hall], warehouses: [warehouse] }; } },
    sales: { async authorize(actor) { assert.equal(actor.hallId, ids.hall); return { kind: "restricted", clauses: [{ hallId: actor.hallId! }] }; } },
    transfers: createSourceConfirmedTransferQueryAuthorization(), products: { async authorize(_actor, intent) { return { productId: intent.parameters.productId }; } }
  }, productMedia: null };
}
const nativeOptions = (): PostgresReadApiOptions => ({ ...options(), authorization: { mode: "source-confirmed-native" } });
test('P02 actual API refuses missing instance budgets before pool allocation and never silently selects production defaults',async()=>{
  const value=options();const {work:_work,...withoutWork}=value.authentication;const driver=new ScriptedDriver();
  await assert.rejects(createPostgresReadApi({...value,authentication:withoutWork},driver.factory),/explicit shared password work/);
  assert.equal(driver.allocations,0);assert.equal(driver.connects,0);
});
test('P02 actual API CPU overload returns429 after released snapshot, without inserting a session or exposing codec details',async t=>{
  const value=options(),driver=new ScriptedDriver(),gate=value.authentication.work!.passwordGate;
  let entered!:()=>void,finish!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{finish=done;});
  const pending=gate.run('login',async()=>{entered();await held;});await started;
  const api=await createPostgresReadApi(value,driver.factory);t.after(()=>api.close());
  try{
    const response=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:ORIGIN,'content-type':'application/json'},payload:{loginName:driver.account.login_name,password:PASSWORD}});
    assert.equal(response.statusCode,429);assert.equal(response.headers['set-cookie'],undefined);assert.ok(Number(response.headers['retry-after'])>=1);
    assert.equal(driver.calls.filter(call=>call.sql.includes('auth:login-snapshot')).length,1);
    assert.equal(driver.calls.some(call=>call.sql.startsWith('INSERT INTO naijue_erp.auth_session')),false);
    assert.equal(driver.connects,driver.releases.length);
  }finally{finish();await pending;}
});
const currentOptions = (): PostgresReadApiOptions => ({ ...nativeOptions(), currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() } });
const currentRoutes = [
  ["/current-form/sales-references/query", { kind: "hall", hallId: null, search: "", page: 1, pageSize: 20 }],
  ["/current-form/transfer-warehouses/query", { direction: "FROM", search: "", page: 1, pageSize: 20 }],
  ["/current-form/products/query", { context: { kind: "SALES", hallId: ids.hall }, search: "", page: 1, pageSize: 20 }],
  ["/current-form/product-skus/query", { context: { kind: "TRANSFER" }, productId: sid("product", 210), page: 1, pageSize: 20 }],
  ["/current-form/sku-batch/query", { context: { kind: "TRANSFER" }, skuIds: [ids.sku] }]
] as const;
const currentSkuRow = { id: ids.sku, sku_code: "SYNTHETIC_SKU", product_id: sid("product", 210), product_code: "SYNTHETIC_PRODUCT", product_name: "SYNTHETIC ONLY",
  color_id: sid("color", 211), color_name: "SYNTHETIC_COLOR", fit_id: sid("fit", 212), fit_name: "SYNTHETIC_FIT", size_id: sid("size", 213),
  size_name: "SYNTHETIC_SIZE", size_group_id: sid("sizeGroup", 214), member_size_id: sid("size", 213),
  sku_enabled: true, product_enabled: true, color_enabled: true, fit_enabled: true };
type Call = { readonly sql: string; readonly values: unknown[] };
class ScriptedDriver extends EventEmitter {
  allocations = 0; connects = 0; ends = 0; releases: (Error | boolean | undefined)[] = []; calls: Call[] = [];
  failEnd = false; failBusiness = false; loginEnabled = true;
  nativeIdentity: Record<string, unknown> | undefined;
  currentIdentity: Record<string, unknown> | undefined;
  beforeNativeIdentity: (() => Promise<void>) | undefined;
  business: ((sql: string, values: unknown[]) => BoundedPostgresResult | Promise<BoundedPostgresResult>) | undefined;
  readonly account = { account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee", password_hash: HASH,
    login_enabled: true, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall as string | null };
  readonly sessions = new Map<string, AuthenticationSession>([[sessionTokenHash(TOKEN)!, { tokenHash: sessionTokenHash(TOKEN)!, accountId: ids.account,
    authVersion: 1, createdAt: TIME, expiresAt: "2026-10-20T12:15:00.000Z", revokedAt: null }]]);
  readonly factory: PostgresPoolDriverFactory = config => {
    this.allocations++;
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
    if (sql.includes("auth:login-snapshot")) return rows(values[0]===this.account.login_name?[{account_id:this.account.account_id,login_name:this.account.login_name,password_hash:this.account.password_hash,auth_version:this.account.auth_version}]:[]);
    if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
    if (sql.includes("FROM naijue_erp.user_account a JOIN") && !sql.includes("/* read-authorization:identity */") && !sql.includes("/* current-form:identity */")) {
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
    if (sql.includes("/* current-form:identity */")) return rows([this.currentIdentity ?? { account_id: this.account.account_id, staff_id: this.account.staff_id,
      login_enabled: this.loginEnabled, role: this.account.role, employment_status: this.account.employment_status, hall_id: this.account.hall_id,
      native_hall_id: this.account.hall_id, hall_enabled: this.account.hall_id === null ? null : true }]);
    if (sql.includes("/* read-authorization:identity */")) {
      await this.beforeNativeIdentity?.();
      return rows([this.nativeIdentity ?? { account_id: this.account.account_id, staff_id: this.account.staff_id, login_enabled: this.loginEnabled,
        role: this.account.role, employment_status: this.account.employment_status, hall_id: this.account.hall_id,
        native_hall_id: this.account.hall_id, hall_enabled: this.account.hall_id === null ? null : true }]);
    }
    if (sql.includes("/* read-authorization:warehouses */")) return rows([{ id: warehouse.id, hall_id: warehouse.hallId, name: warehouse.label, native_hall_id: warehouse.hallId }]);
    if (this.business) return this.business(sql, values);
    if (sql.includes("/* current-form:sales-hall */")) return rows([{ id: values[0], enabled: true }]);
    if (sql.includes("/* current-form:count */")) return rows([{ total: "0" }]);
    if (sql.includes("/* current-form:page */")) return rows([]);
    if (sql.includes("/* current-form:sku-batch */")) return rows([currentSkuRow]);
    if (sql.includes("/* inventory:publication */")) return rows([]); // Explicitly unpublished fixture; never invent stock zero.
    if (sql.includes("/* inventory-ledger:warehouse */")) return rows([{ id: warehouse.id, hall_id: warehouse.hallId, name: warehouse.label }]);
    if (sql.includes("/* inventory-ledger:sku */")) return rows([]);
    if (/SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.(sales_header|transfer_header|warehouse)/.test(sql)) return rows([{ exact_total: "0" }]);
    if (/SELECT h\.id, h\.number/.test(sql) && /FROM naijue_erp\.(sales_header|transfer_header)/.test(sql)) return rows([]);
    if (sql.includes("FROM naijue_erp.product p") || sql.includes("FROM naijue_erp.product_image i")) return rows([]);
    throw new Error("SYNTHETIC scripted protocol does not recognize this query");
  }
}
async function setup(t: TestContext, value: PostgresReadApiOptions = options(), driver = new ScriptedDriver()) {
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
test("SYNTHETIC native profile: closed host selection rejects unknown/mixed shapes before driver allocation", async () => {
  // Compile-time exclusivity complements runtime checks for untyped server configuration.
  // @ts-expect-error A native selector cannot include arbitrary provider overrides.
  const mixed: PostgresReadApiAuthorization = { mode: "source-confirmed-native", products: options().authorization.products };
  const invalid: unknown[] = [undefined, null, false, [], {}, { mode: undefined }, { mode: "native" },
    mixed, { ...options().authorization, mode: "source-confirmed-native" }, { ...options().authorization, mode: undefined },
    { mode: "source-confirmed-native", extra: undefined }, { mode: "source-confirmed-native", [Symbol("extra")]: true },
    Object.defineProperty({ mode: "source-confirmed-native" }, "products", { value: undefined }),
    Object.create({ mode: "source-confirmed-native" }), Object.assign(Object.create({ products: {} }), { mode: "source-confirmed-native" })];
  for (const authorization of invalid) {
    const driver = new ScriptedDriver();
    await assert.rejects(createPostgresReadApi({ ...options(), authorization } as PostgresReadApiOptions, driver.factory), TypeError);
    assert.equal(driver.allocations, 0); assert.equal(driver.connects, 0); assert.equal(driver.ends, 0);
  }
  for (const value of [
    { ...nativeOptions(), authentication: { ...options().authentication, trustedOrigin: "http://synthetic.invalid" } },
    { ...nativeOptions(), authentication: { ...options().authentication, now: undefined } },
    { ...nativeOptions(), authentication: { ...options().authentication, policy: undefined } },
    { ...nativeOptions(), productMedia: undefined }
  ]) {
    const driver = new ScriptedDriver();
    await assert.rejects(createPostgresReadApi(value as PostgresReadApiOptions, driver.factory)); assert.equal(driver.allocations, 0);
  }
  const driver = new ScriptedDriver();
  const authorization: PostgresReadApiAuthorization = Object.assign(Object.create(null), { mode: "source-confirmed-native" as const });
  const api = await createPostgresReadApi({ ...nativeOptions(), authorization }, driver.factory);
  assert.equal(driver.allocations, 1); assert.equal(driver.connects, 0); await api.close(); assert.equal(driver.ends, 1);
});
test("SYNTHETIC native profile: one lazy pool creates genuine read policies and the canonical transfer policy", async t => {
  const f = await setup(t, nativeOptions());
  assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, 0); assert.equal(f.driver.calls.length, 0);
  assert.equal(f.app.server.listening, false);
  for (const [url, payload, status] of [
    ["/sales/query", salesInput(), 200], ["/transfers/query", transferInput(), 200],
    ["/products/basics/query", { productId: sid("product", 130) }, 200], ["/inventory/query", inventoryInput(), 503],
    ["/inventory/candidates/query", { kind: "warehouse", search: "", page: 1, pageSize: 20, selectedIds: [], categoryIds: [] }, 503],
    ["/inventory/ledger/query", { warehouseId: ids.warehouse, skuId: ids.sku, pageSize: 20, after: null }, 404]
  ] as const) {
    const response = await f.post(url, payload, { "x-role": "ADMIN", "x-hall-id": sid("hall", 131) });
    assert.equal(response.statusCode, status, `${url}: ${response.body}`);
  }
  const identities = f.driver.calls.filter(call => call.sql.includes("/* read-authorization:identity */"));
  assert.equal(identities.length, 5); for (const call of identities) assert.deepEqual(call.values, [ids.account]);
  assert.equal(f.driver.calls.filter(call => call.sql.includes("/* read-authorization:warehouses */")).length, 3);
  const sales = f.driver.calls.find(call => call.sql.includes("COUNT(*)") && call.sql.includes("naijue_erp.sales_header"));
  assert.ok(sales); assert.deepEqual(sales.values, [ids.hall]); assert.match(sales.sql, /h\.hall_id = \$1::uuid/);
  const transfer = f.driver.calls.find(call => call.sql.includes("COUNT(*)") && call.sql.includes("naijue_erp.transfer_header"));
  assert.ok(transfer); assert.deepEqual(transfer.values, [ids.hall, ids.hall, ids.hall, "SALESPERSON"]); assert.match(transfer.sql, /created_role/);
  assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, 17); assert.equal(f.driver.releases.length, 17);
  await f.app.close(); await f.close(); assert.equal(f.driver.ends, 1);
});
test("SYNTHETIC native profile: current trusted ADMIN/WAREHOUSE versus salesperson role and hall map to source scopes", async t => {
  const f = await setup(t, nativeOptions());
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"]) {
    f.driver.account.role = role; f.driver.account.hall_id = role === "SALESPERSON" ? ids.hall : null;
    const offset = f.driver.calls.length;
    assert.equal((await f.post("/sales/query", salesInput())).statusCode, 200);
    assert.equal((await f.post("/transfers/query", transferInput())).statusCode, 200);
    const current = f.driver.calls.slice(offset);
    const sales = current.find(call => call.sql.includes("COUNT(*)") && call.sql.includes("naijue_erp.sales_header"));
    const transfer = current.find(call => call.sql.includes("COUNT(*)") && call.sql.includes("naijue_erp.transfer_header"));
    assert.ok(sales); assert.ok(transfer);
    assert.deepEqual(sales.values, role === "SALESPERSON" ? [ids.hall] : []);
    assert.deepEqual(transfer.values, role === "SALESPERSON" ? [ids.hall, ids.hall, ids.hall, role] : []);
  }
  f.driver.account.hall_id = null;
  const offset = f.driver.calls.length;
  assert.equal((await f.post("/sales/query", salesInput())).statusCode, 401);
  assert.equal((await f.post("/transfers/query", transferInput())).statusCode, 401);
  assert.equal(f.driver.calls.slice(offset).some(call => call.sql.includes("read-authorization:") || call.sql.includes("COUNT(*)")), false);
});
test("SYNTHETIC native profile: fresh identity denial cannot fall back to authenticated or requested grants", async t => {
  const f = await setup(t, nativeOptions());
  const current = { account_id: ids.account, staff_id: f.driver.account.staff_id, login_enabled: true, role: "SALESPERSON",
    employment_status: "在职", hall_id: ids.hall, native_hall_id: ids.hall, hall_enabled: true };
  for (const change of [{ role: "AUDITOR" }, { employment_status: "离职" }, { login_enabled: false },
    { hall_id: sid("hall", 132), native_hall_id: sid("hall", 132) }, { hall_enabled: false }]) {
    f.driver.nativeIdentity = { ...current, ...change }; const offset = f.driver.calls.length;
    const result = await f.post("/products/basics/query", { productId: sid("product", 133) }, { "x-role": "ADMIN" });
    assert.equal(result.statusCode, 403); assert.equal(result.json().error.code, "FORBIDDEN");
    assert.equal(f.driver.calls.slice(offset).some(call => call.sql.includes("FROM naijue_erp.product p")), false);
    assert.equal(f.driver.calls.at(-1)!.sql, "ROLLBACK");
  }
  f.driver.nativeIdentity = undefined;
  const offset = f.driver.calls.length;
  assert.equal((await f.post("/products/basics/query", { productId: sid("product", 133), authorization: { mode: "source-confirmed-native" } })).statusCode, 400);
  assert.equal(f.driver.calls.slice(offset).some(call => call.sql.includes("read-authorization:")), false);
});
test("SYNTHETIC native profile: host choice captures without mutating caller authentication or external providers", async t => {
  const explicit = options(); const provider = explicit.authorization.products; const method = provider.authorize;
  const authentication = Object.freeze({ ...explicit.authentication }); const before = Object.keys(explicit.authorization);
  const selector = { mode: "source-confirmed-native" as const };
  const f = await setup(t, Object.freeze({ ...explicit, authentication, authorization: selector }));
  assert.equal(explicit.authorization.products, provider); assert.equal(provider.authorize, method);
  assert.deepEqual(Object.keys(explicit.authorization), before); assert.equal(authentication.policy, explicit.authentication.policy);
  Object.assign(selector, { mode: "not-a-profile", products: { authorize() { throw new Error("SYNTHETIC replacement must not run"); } } });
  const result = await f.post("/products/basics/query", { productId: sid("product", 134) }); assert.equal(result.statusCode, 200);
  assert.equal(f.driver.calls.filter(call => call.sql.includes("/* read-authorization:identity */")).length, 1);
});
test("SYNTHETIC native profile: policy storage failure is sanitized, cleans its lease and leaves siblings usable", async t => {
  const f = await setup(t, nativeOptions()); f.driver.failBusiness = true;
  const result = await f.post("/products/basics/query", { productId: sid("product", 135) });
  assert.equal(result.statusCode, 500); assert.deepEqual(result.json(), { error: { code: "INTERNAL_ERROR", message: "The product read could not be completed" } });
  assert.equal(result.body.includes("SYNTHETIC"), false); assert.match(f.driver.calls.at(-1)!.sql, /read-authorization:identity/);
  // A fatal driver failure quarantines the lease before rollback SQL can run. We
  // assert discard, not a successful rollback or an invented known SQL outcome.
  assert.equal(f.driver.releases.at(-1), true); assert.equal(f.driver.calls.some(call => call.sql.includes("FROM naijue_erp.product p")), false);
  f.driver.failBusiness = false; assert.equal((await f.post("/sales/query", salesInput())).statusCode, 200);
  await f.close(); assert.equal(f.driver.ends, 1); assert.equal(f.driver.allocations, 1);
});
test("SYNTHETIC native profile: abort during native identity query stops later policy/reader work, not sibling requests", async t => {
  const driver = new ScriptedDriver(); let enter!: () => void; let resume!: () => void; let lookups = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; }); const hold = new Promise<void>(resolve => { resume = resolve; });
  driver.beforeNativeIdentity = async () => { if (++lookups === 1) { enter(); await hold; } };
  const f = await setup(t, nativeOptions(), driver); let raw: IncomingMessage | undefined;
  // A synthetic raw event does not establish browser/network or pg-wire cancellation.
  const cancelled = inject((request, reply) => { raw = request; f.app.routing(request, reply); }, {
    method: "POST", url: "/products/basics/query", payload: { productId: sid("product", 136) },
    headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-naijue_session=${TOKEN}` }
  });
  await entered; raw!.emit("aborted");
  const sibling = await f.post("/products/basics/query", { productId: sid("product", 137) }); assert.equal(sibling.statusCode, 200);
  resume(); assert.equal((await cancelled).statusCode, 408); assert.equal(lookups, 2);
  assert.equal(driver.calls.filter(call => call.sql === "ROLLBACK").length, 1);
  assert.equal(driver.calls.filter(call => call.sql.includes("FROM naijue_erp.product p")).length, 1);
  assert.equal(driver.calls.filter(call => call.sql === "COMMIT").length, 4);
  assert.equal(driver.releases.length, 5); assert.equal(driver.allocations, 1);
});
test("SYNTHETIC composition: failed authentication-policy construction cleans its pool without a connection", async () => {
  for (const value of [options(), nativeOptions(), currentOptions()]) {
    const driver = new ScriptedDriver();
    await assert.rejects(createPostgresReadApi({ ...value, authentication: { ...value.authentication, policy: { ...value.authentication.policy, sessionTtlSeconds: 0 } } }, driver.factory),
      /complete policy/);
    assert.equal(driver.allocations, 1); assert.equal(driver.connects, 0); assert.equal(driver.ends, 1);
  }
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
    ["/inventory/candidates/query", { kind: "warehouse", search: "", page: 1, pageSize: 20, selectedIds: [], categoryIds: [] }, 503],
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
  for (const value of [options(), nativeOptions(), currentOptions()]) {
    const driver = new ScriptedDriver(); driver.failEnd = true; const f = await createPostgresReadApi(value, driver.factory);
    await assert.rejects(f.close(), { code: "PG_DISPOSE_FAILED" }); assert.equal(driver.ends, 1); assert.equal(driver.connects, 0);
    assert.equal(driver.allocations, 1);
  }
});
test("SYNTHETIC composition source: read-only factory selects no application capabilities or unauthorized write routes", async t => {
  const source = readFileSync(new URL("./postgres-read-api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|dotenv|\.listen\s*\(|readFile/);
  assert.equal((source.match(/new BoundedPostgresPool\(/g) ?? []).length, 1);
  // Scope this guard to the read-only factory, not every opted-in factory in the shared module.
  const factory = source.slice(source.indexOf("export async function createPostgresReadApi("),source.indexOf("export async function createPostgresApplicationApi("));
  assert.match(factory,/return composePostgresApi\(options, createDriver, null\)/);
  assert.doesNotMatch(factory,/app\.register|createSalesHttpPlugin|createTransferHttpPlugin|createPartyMaintenanceHttpPlugin/);
  const f = await setup(t);
  for (const url of ["/sales/commands","/transfers/commands","/customers/commands","/suppliers/commands","/products/v2/commands","/catalogue/categories/commands"])
    assert.equal(f.app.hasRoute({method:"POST",url}),false,url);
  for(const url of ["/inventory/query","/sales/query","/transfers/query"]){
    assert.equal(f.app.hasRoute({method:"POST",url}),true,url);
    assert.equal((await f.app.inject({method:"POST",url,payload:{}})).statusCode,401);
  }
});

test("SYNTHETIC CURRENT composition: absent option, including native profile alone, keeps all five routes 404", async t => {
  for (const value of [options(), nativeOptions()]) {
    const f = await setup(t, value);
    for (const [url, payload] of currentRoutes) {
      assert.equal(f.app.hasRoute({ method: "POST", url }), false); assert.equal((await f.post(url, payload)).statusCode, 404);
    }
    assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, 0); assert.equal(f.app.server.listening, false);
  }
});
test("SYNTHETIC CURRENT composition: explicit opt-in adds five native readers with one owned lazy pool and no commands/listener", async t => {
  for (const value of [currentOptions(), { ...options(), currentForms: currentOptions().currentForms! }]) {
    const f = await setup(t, value); assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, 0);
    for (const [url, payload] of currentRoutes) {
      assert.equal(f.app.hasRoute({ method: "POST", url }), true);
      const response = await f.post(url, payload, { "x-role": "ADMIN", "x-hall-id": sid("hall", 215) });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`); assert.equal(response.headers["cache-control"], "no-store");
      if (!url.includes("sku-batch")) assert.deepEqual(response.json(), { page: 1, pageSize: 20, exactTotal: "0", items: [] });
      else assert.equal(response.json()[0].id, ids.sku);
    }
    assert.equal(f.driver.calls.filter(call => call.sql.includes("/* current-form:identity */")).length, 5);
    assert.equal(f.driver.calls.filter(call => call.sql.includes("/* read-authorization:identity */")).length, 0); // No second policy lease.
    assert.equal(f.driver.connects, 10); assert.equal(f.driver.releases.length, 10); // Session + one CURRENT snapshot per request.
    for (const url of ["/sales/commands", "/transfers/commands", "/customers/commands", "/suppliers/commands", "/accounts", "/products/commands",
      "/current-form/commands", "/current-form/sales/commands", "/current-form/transfers/commands"])
      assert.equal((await f.post(url, {})).statusCode, 404, url);
    for (const url of ["/sales/receipts/SYNTHETIC", "/transfers/receipts/SYNTHETIC"])
      assert.equal((await f.app.inject({ method: "GET", url })).statusCode, 404, url);
    assert.equal(f.driver.allocations, 1); assert.equal(f.app.server.listening, false); assert.equal(f.postgresBackgroundFailureCount, 0);
    await f.app.close(); await f.close(); assert.equal(f.driver.ends, 1);
  }
});
test("SYNTHETIC CURRENT composition: malformed explicit provider fails before any pool allocation", async () => {
  const invalid: unknown[] = [undefined, null, false, [], {}, { authorization: null }, { authorization: {} }, { authorization: { authorize: false } },
    { authorization: Object.assign([], { authorize() {} }) }, { authorization: Object.assign(() => {}, { authorize() {} }) },
    { authorization: createSourceConfirmedCurrentFormAuthorization(), extra: undefined },
    Object.create({ authorization: createSourceConfirmedCurrentFormAuthorization() })];
  for (const currentForms of invalid) {
    const driver = new ScriptedDriver();
    await assert.rejects(createPostgresReadApi({ ...options(), currentForms } as PostgresReadApiOptions, driver.factory), TypeError);
    assert.equal(driver.allocations, 0); assert.equal(driver.connects, 0); assert.equal(driver.ends, 0);
  }
  const driver = new ScriptedDriver();
  const inherited = Object.assign(Object.create({ currentForms: currentOptions().currentForms }), options()) as PostgresReadApiOptions;
  await assert.rejects(createPostgresReadApi(inherited, driver.factory), TypeError); assert.equal(driver.allocations, 0);
});
test("SYNTHETIC CURRENT composition: capture and bind provider before first await; later object/method changes cannot replace it", async t => {
  const canonical = createSourceConfirmedCurrentFormAuthorization(); let originalCalls = 0; let replacements = 0;
  const provider: CurrentFormAuthorization & { readonly marker: string } = { marker: "SYNTHETIC_BOUND", async authorize(context, intent, signal) {
    assert.equal(this, provider); assert.equal(this.marker, "SYNTHETIC_BOUND"); originalCalls++;
    assert.equal(Object.isFrozen(context.identity), true); assert.equal(Object.isFrozen(context.actor), true);
    return canonical.authorize(context, intent, signal);
  } };
  const forms = { authorization: provider }; const value = { ...currentOptions(), currentForms: forms };
  const driver = new ScriptedDriver(); const pending = createPostgresReadApi(value, driver.factory);
  const replacement = { async authorize() { replacements++; throw new Error("SYNTHETIC replacement must not run"); } };
  Object.assign(provider, replacement); Object.assign(forms, { authorization: replacement }); Object.assign(value, { currentForms: undefined });
  const api = await pending; t.after(() => api.close());
  const response = await api.app.inject({ method: "POST", url: currentRoutes[0][0], payload: currentRoutes[0][1],
    headers: { origin: ORIGIN, cookie: `__Host-naijue_session=${TOKEN}` } });
  assert.equal(response.statusCode, 200, response.body); assert.equal(originalCalls, 1); assert.equal(replacements, 0); assert.equal(driver.allocations, 1);
});
test("SYNTHETIC CURRENT composition: cookie/origin/bearer spoof fails before proposal auth/read; request roles/grants never select authority", async t => {
  let calls = 0; const canonical = createSourceConfirmedCurrentFormAuthorization();
  const f = await setup(t, { ...currentOptions(), currentForms: { authorization: { async authorize(...args) { calls++; return canonical.authorize(...args); } } } });
  for (const [url, payload] of currentRoutes) for (const headers of [
    { cookie: "" }, { cookie: "__Host-naijue_session=bad" }, { origin: "" }, { origin: "https://other.invalid" },
    { authorization: `Bearer ${TOKEN}` }, { "sec-fetch-site": "cross-site" }, { cookie: `__Host-naijue_session=${TOKEN}; __Host-naijue_session=${TOKEN}` }
  ]) assert.equal((await f.post(url, payload, headers)).statusCode, 401);
  assert.equal(calls, 0); assert.equal(f.driver.connects, 0);
  for (const [url, payload] of currentRoutes) assert.equal((await f.post(url, { ...payload, role: "ADMIN", grant: { kind: "all" } })).statusCode, 400);
  assert.equal(calls, 0); assert.equal(f.driver.calls.some(call => call.sql.includes("/* current-form:")), false);
});
test("SYNTHETIC CURRENT composition: same-snapshot native identity grants own-hall sales, rejects foreign hall and stale native facts", async t => {
  const f = await setup(t, currentOptions()); const url = "/current-form/products/query";
  const payload = { context: { kind: "SALES", hallId: ids.hall }, search: "", page: 1, pageSize: 20 };
  assert.equal((await f.post(url, payload)).statusCode, 200);
  const offset = f.driver.calls.length;
  assert.equal((await f.post(url, { ...payload, context: { kind: "SALES", hallId: sid("hall", 216) } }, { "x-role": "ADMIN" })).statusCode, 403);
  assert.equal(f.driver.calls.slice(offset).some(call => call.sql.includes("current-form:count") || call.sql.includes("current-form:sales-hall")), false);
  assert.equal(f.driver.calls.at(-1)!.sql, "ROLLBACK");
  for (const role of ["ADMIN", "WAREHOUSE"]) {
    f.driver.account.role = role; f.driver.account.hall_id = null;
    assert.equal((await f.post(url, payload)).statusCode, 200);
  }
  f.driver.account.role = "SALESPERSON"; f.driver.account.hall_id = ids.hall;
  const base = { account_id: ids.account, staff_id: f.driver.account.staff_id, login_enabled: true, role: "SALESPERSON", employment_status: "在职",
    hall_id: ids.hall, native_hall_id: ids.hall, hall_enabled: true };
  for (const change of [{ role: "AUDITOR" }, { hall_enabled: false }, { hall_id: null, native_hall_id: null, hall_enabled: null },
    { employment_status: "离职" }, { login_enabled: false }, { account_id: sid("account", 217) }]) {
    f.driver.currentIdentity = { ...base, ...change }; const offset = f.driver.calls.length;
    assert.equal((await f.post(url, payload)).statusCode, 403);
    assert.equal(f.driver.calls.slice(offset).some(call => call.sql.includes("current-form:count")), false);
  }
});
test("SYNTHETIC CURRENT composition: salesperson may propose cross-hall transfer FROM/TO including disabled hall; native endpoint eligibility remains", async t => {
  const driver = new ScriptedDriver(); const foreignHall = sid("hall", 218); let direction: "FROM" | "TO" = "FROM";
  driver.business = sql => {
    if (sql.includes("current-form:count")) return { rows: [{ total: "1" }], rowCount: 1 };
    if (sql.includes("current-form:page")) return { rows: [{ id: sid("warehouse", 219), name: "SYNTHETIC foreign warehouse", hall_id: foreignHall,
      hall_name: "SYNTHETIC disabled foreign hall", enabled: direction === "TO", hall_enabled: false, has_nonzero_inventory: direction === "FROM" }], rowCount: 1 };
    throw new Error("SYNTHETIC unexpected transfer proposal SQL");
  };
  const f = await setup(t, currentOptions(), driver);
  for (const value of ["FROM", "TO"] as const) {
    direction = value; const offset = driver.calls.length;
    const response = await f.post("/current-form/transfer-warehouses/query", { direction, search: "", page: 1, pageSize: 20 });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().items[0].hallId, foreignHall);
    assert.equal(response.json().items[0].hallEnabled, false);
    const count = driver.calls.slice(offset).find(call => call.sql.includes("current-form:count"))!;
    assert.deepEqual(count.values, [""]); assert.match(count.sql, /WHERE TRUE AND/); assert.doesNotMatch(count.sql, /h\.enabled|w\.hall_id =/);
    if (direction === "FROM") assert.match(count.sql, /w\.enabled OR EXISTS/); else assert.match(count.sql, /TRUE AND w\.enabled AND/);
  }
  assert.equal(driver.calls.some(call => call.sql.includes("read-authorization:")), false); assert.equal(driver.connects, 4);
});


test('H06 legacy API cannot claim admitted database readiness from construction or healthy background counts',async t=>{
 const f=await setup(t);const connects=f.driver.connects;
 assert.equal(await f.readiness!(),false);assert.equal(f.driver.connects,connects);
 await f.close();assert.equal(await f.readiness!(),false);
});

test('H06 exact issuer readiness rechecks original same-pool identity, fails on drift and releases every lease',async t=>{
 const {mkdtemp,realpath,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const {NATIVE_RUNTIME26_METADATA_PROBE,NATIVE_RUNTIME26_IDENTITY_PROBE}=await import('../../../adapters/postgres/src/native-import-accounting-capability.ts');
 const {createPostgresRuntime26ApplicationApi}=await import('./postgres-read-api.ts');
 const root=await mkdtemp(join(await realpath(tmpdir()),'h06-proof-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex'),independent=join(root,'independent.json'),reviewFile=join(root,'review.json');
 await writeFile(independent,'SYNTHETIC_PASS',{mode:0o600});const target={database:'SYNTHETIC_ONLY',databaseOid:'123',actingRole:'SYNTHETIC_ROLE',sessionUser:'SYNTHETIC_SESSION',serverAddress:null,serverPort:null,postmasterStart:'2026-10-28 00:00:00+00'};
 const review={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target,catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:'a'.repeat(64),patchLevel:'26_v11_document_specification_save'},purposes:['PRODUCT_SEASONS_READ','CURRENT_CUSTOMER_READ_WRITE','CURRENT_FORM_READ','HISTORY_READ','INVENTORY_ADMISSION'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:independent,sha256:hash('SYNTHETIC_PASS'),result:'PASS'},realImportExecutionAuthorized:false};
 const text=JSON.stringify(review);await writeFile(reviewFile,text,{mode:0o600});let role=target.actingRole,acquired=0,released=0,ended=0;
 const identity=()=>({database:target.database,database_oid:target.databaseOid,database_owner:'SYNTHETIC_OWNER',current_user:role,session_user:target.sessionUser,server_version_num:'170011',server_addr:null,server_port:null,postmaster_start:target.postmasterStart,replication_role:'origin'});
 const driver=Object.assign(new EventEmitter(),{async connect(){acquired++;return Object.assign(new EventEmitter(),{async query(sql:string){if(sql===NATIVE_RUNTIME26_METADATA_PROBE)return {rows:[{identity:identity(),migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:'a'.repeat(64),source_routines_match:true}],rowCount:1};if(sql===NATIVE_RUNTIME26_IDENTITY_PROBE)return {rows:[{identity:identity()}],rowCount:1};throw Error('Unexpected synthetic SQL');},release(){released++;}});},async end(){ended++;}});
 const api=await createPostgresRuntime26ApplicationApi({...currentOptions(),nativeReadExtensions:{profile:'source-confirmed-r1-v1'}},{reviewFile,trustedReviewSha256:hash(text)},()=>driver);
 try{const initial=acquired;assert.equal(await api.readiness!(),true);assert.equal(acquired,initial+1);assert.equal(acquired,released);role='WRONG_ROLE';assert.equal(await api.readiness!(),false);assert.equal(acquired,released);}finally{await api.close();}
 const closed=acquired;assert.equal(await api.readiness!(),false);assert.equal(acquired,closed);assert.equal(ended,1);
});
