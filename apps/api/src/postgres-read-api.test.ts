import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
// Explicit protocol-test admission only; real trusted capacity is separately exercised.
const testCapacity = () => ({async acquire(){return {assertValid(){},release(){}};},close(){}});
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
import { createPostgresReadApi, createPostgresRuntime26ApplicationApi } from "./postgres-read-api.ts";
import { COMPLETE_SCOPE_DECISION } from "../../../packages/application/src/inventory-cutoff-import.ts";
import { createSyntheticV7Fixture } from "../../../tests/support/live-ledger-api-v7-fixtures.ts";
import type { PostgresApplicationApiOptions, PostgresReadApiAuthorization, PostgresReadApiExplicitAuthorization, PostgresReadApiOptions } from "./postgres-read-api.ts";
import { ids, sid } from "../../../tests/support/synthetic-fixtures.ts";
import { createSourceConfirmedProductCapacityFactory } from './postgres-read-api.ts';
import { PostgresMaintenanceCommandUnitOfWork } from '../../../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import type { MaintenanceCompletion } from '../../../packages/application/src/maintenance-commit-ports.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import { PostgresProductMaintenanceUnitOfWork } from '../../../adapters/postgres/src/product-maintenance-store.ts';
import {CapacityAdmissionRejected} from './capacity-admission.ts';
import {createOwnedPoolCapacityAdmission} from './capacity-runtime-probe.ts';

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
  return { capacityAdmission:testCapacity(), postgres: postgres(), authentication: { trustedOrigin: ORIGIN, now: () => TIME, policy: createSourceAuthenticationPolicy(900), work:authenticationWork() }, authorization: {
    inventory: { async authorize() { return { hallIds: [ids.hall], warehouses: [warehouse] }; } },
    sales: { async authorize(actor) { assert.equal(actor.hallId, ids.hall); return { kind: "restricted", clauses: [{ hallId: actor.hallId! }] }; } },
    transfers: createSourceConfirmedTransferQueryAuthorization(), products: { async authorize(_actor, intent) { return { productId: intent.parameters.productId }; } }
  }, productMedia: null };
}
// This is an explicit NEW full V7 native graph, not an upgrade of options() or a
// claim that issuer-null/custom-provider factory positives remain supported.
const nativeOptions = (): PostgresApplicationApiOptions => ({ ...options(), authorization: { mode: "source-confirmed-native" },
  currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() }, nativeReadExtensions: { profile: "source-confirmed-r1-v1" } });
function createSyntheticV7Api(value: PostgresApplicationApiOptions, driver: ScriptedDriver) {
  const fixture = createSyntheticV7Fixture(value.postgres.target);
  driver.proof = fixture;
  // Call the actual original new entry before any await: currentForms/origin capture
  // must happen in production composition, never in this test helper.
  return createPostgresRuntime26ApplicationApi(value, fixture.review, driver.factory).then(api => Object.freeze({ ...api,
    // The issuer reopens these pinned files on each proof: retain them for the
    // entire API lifetime, including requests, COMMIT checks and readiness.
    close: () => api.close().finally(() => fixture.cleanup()),
    get postgresBackgroundFailureCount() { return api.postgresBackgroundFailureCount; }
  }), error => { fixture.cleanup(); throw error; });
}
test('A02 active API refuses a missing singleton before allocating a pool; no default capacity window',async()=>{
  const {capacityAdmission:_capacity,...value}=options(),driver=new ScriptedDriver();
  await assert.rejects(createPostgresReadApi(value,driver.factory),/explicit singleton capacity admission/);
  assert.equal(driver.allocations,0);assert.equal(driver.connects,0);
});
test('A02 actual API forwards new-session capacity after credential work and before final transaction; old session still resolves',async t=>{
  const value=nativeOptions(),driver=new ScriptedDriver();let calls=0;
  const api=await createSyntheticV7Api({...value,capacityAdmission:{async acquire(kind){assert.equal(kind,'session');assert.equal(driver.connects,driver.releases.length);calls++;throw new CapacityAdmissionRejected('LOW_WATER',2);},close(){}}},driver);t.after(()=>api.close());
  const before=driver.sessions.size;
  const response=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:ORIGIN,'content-type':'application/json'},payload:{loginName:driver.account.login_name,password:PASSWORD}});
  assert.equal(response.statusCode,503);assert.equal(response.headers['retry-after'],'2');assert.equal(response.headers['set-cookie'],undefined);assert.equal(calls,1);
  assert.equal(driver.sessions.size,before);assert.equal(driver.calls.some(c=>c.sql.startsWith('INSERT INTO naijue_erp.auth_session')),false);
  assert.equal((await api.app.inject({url:'/auth/session',headers:{cookie:`__Host-naijue_session=${TOKEN}`}})).statusCode,200);assert.equal(calls,1);
});
test('A02 runtime producer is bound to the sole actual API pool; fresh facts permit login and stale facts preserve existing session/logout',async t=>{
  const value=nativeOptions(),driver=new ScriptedDriver();let at=1000,facts=0;
  const binding={candidateFingerprint:'SYNTHETIC_SOURCE',targetFingerprint:'SYNTHETIC_TARGET',writerTopologyFingerprint:'ONE_WRITER',
    inventoryFingerprint:'SYNTHETIC_INVENTORY',processInstanceId:'SYNTHETIC_INSTANCE',restartGeneration:1,writerCount:1,
    physicalVolumes:{postgres:'pg-wal',wal:'pg-wal',backup:'backup',system:'system-media',media:'system-media'}};
  const bytes=(n:bigint)=>({postgres:n,wal:n,backup:n,system:n,media:n});
  const capacityAdmission=createOwnedPoolCapacityAdmission({window:{approved:true,token:'SYNTHETIC_WINDOW',inventoryObservedAt:900,startsAt:1000,expiresAt:10000,binding},
    budgets:{session:{maxAdmissions:10,maxInFlight:2,worstCaseBytes:bytes(1n)},upload:{maxAdmissions:10,maxInFlight:2,worstCaseBytes:bytes(2n)}},
    minimumFreeBytes:bytes(10n),safetyBytes:bytes(1n),probeTtlMillis:100,probeTimeoutMillis:100,maxProbeWaiters:2,retryAfterSeconds:2,
    now:()=>at,currentBinding:()=>binding,runtimeProbe:{target:{host:value.postgres.target.host,port:value.postgres.target.port,
      database:value.postgres.target.database,role:value.postgres.target.user,databaseOid:'123',postmasterStart:'2026-10-30 00:00:00+00'},
      async readVolumeFacts({window}){facts++;assert.equal(driver.connects,driver.releases.length,'Password/preflight lease must finish before operational IO');
        return{status:'KNOWN',windowToken:window.token,binding,observedAt:1000,freeBytes:bytes(1000n)};}}});
  driver.business=async sql=>{
    if(sql.includes('capacity-runtime:identity'))return{rows:[{database:value.postgres.target.database,role:value.postgres.target.user,session_user:value.postgres.target.user,
      database_oid:'123',postmaster_start:'2026-10-30 00:00:00+00',read_only:'on',isolation:'repeatable read'}],rowCount:1};
    if(sql.includes('capacity-inventory:storage'))return{rows:[{relation_bytes:'1',index_bytes:'1',total_relation_bytes:'2',database_bytes:'10'}],rowCount:1};
    throw Error('Unexpected synthetic business query');
  };
  const api=await createSyntheticV7Api({...value,capacityAdmission},driver);t.after(()=>api.close());
  assert.equal(driver.allocations,1);assert.equal(driver.connects,2,'Only V7 catalog/identity startup proof may open connections; binding the operational probe must not sample storage');
  assert.equal(driver.calls.some(c=>c.sql.includes('capacity-runtime:')||c.sql.includes('capacity-inventory:')),false);
  const login=()=>api.app.inject({method:'POST',url:'/auth/login',headers:{origin:ORIGIN,'content-type':'application/json'},payload:{loginName:driver.account.login_name,password:PASSWORD}});
  assert.equal((await login()).statusCode,200);assert.equal(facts,1);
  assert.equal(driver.allocations,1);assert.equal(driver.connects,driver.releases.length);
  const sqls=driver.calls.map(c=>c.sql),storageIndex=sqls.findIndex(s=>s.includes('capacity-inventory:storage'));
  assert.ok(storageIndex>=0&&storageIndex<sqls.findIndex(s=>s.startsWith('INSERT INTO naijue_erp.auth_session')));
  assert.equal(sqls[storageIndex+1],'ROLLBACK','The original read-only probe must end before session transaction');
  const before=driver.sessions.size;at=1100;
  const unavailable=await login();assert.equal(unavailable.statusCode,503);assert.equal(unavailable.headers['set-cookie'],undefined);
  assert.equal(driver.sessions.size,before);assert.equal(facts,2);assert.equal(driver.allocations,1);
  assert.equal(driver.calls.filter(c=>c.sql.includes('capacity-inventory:storage')).length,1,'Stale operational facts refuse before PG sampling');
  const cookie=`__Host-naijue_session=${TOKEN}`;
  const old=await api.app.inject({url:'/auth/session',headers:{cookie}});assert.equal(old.statusCode,200);assert.ok(old.json().principal);
  assert.equal((await api.app.inject({method:'POST',url:'/auth/logout',headers:{origin:ORIGIN,'content-type':'application/json',cookie},payload:{}})).statusCode,204);
  assert.equal(facts,2,'Existing session reads and logout must bypass new-write capacity');assert.equal(driver.connects,driver.releases.length);
  await api.close();assert.equal(driver.ends,1);
  const retryDriver=new ScriptedDriver();
  await assert.rejects(createSyntheticV7Api({...value,capacityAdmission},retryDriver),/one exact owned pool/);
  assert.equal(retryDriver.allocations,1);assert.equal(retryDriver.connects,0);assert.equal(retryDriver.ends,1,'Rejected rebind disposes its newly owned pool without a query');
});
test('P02 actual API refuses missing instance budgets before pool allocation and never silently selects production defaults',async()=>{
  const value=options();const {work:_work,...withoutWork}=value.authentication;const driver=new ScriptedDriver();
  await assert.rejects(createPostgresReadApi({...value,authentication:withoutWork},driver.factory),/explicit shared password work/);
  assert.equal(driver.allocations,0);assert.equal(driver.connects,0);
});
test('P02 actual API CPU overload returns429 after released snapshot, without inserting a session or exposing codec details',async t=>{
  const value=nativeOptions(),driver=new ScriptedDriver(),gate=value.authentication.work!.passwordGate;
  let entered!:()=>void,finish!:()=>void;const started=new Promise<void>(done=>{entered=done;}),held=new Promise<void>(done=>{finish=done;});
  const pending=gate.run('login',async()=>{entered();await held;});await started;
  const api=await createSyntheticV7Api(value,driver);t.after(()=>api.close());
  try{
    const response=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:ORIGIN,'content-type':'application/json'},payload:{loginName:driver.account.login_name,password:PASSWORD}});
    assert.equal(response.statusCode,429);assert.equal(response.headers['set-cookie'],undefined);assert.ok(Number(response.headers['retry-after'])>=1);
    assert.equal(driver.calls.filter(call=>call.sql.includes('auth:login-snapshot')).length,1);
    assert.equal(driver.calls.some(call=>call.sql.startsWith('INSERT INTO naijue_erp.auth_session')),false);
    assert.equal(driver.connects,driver.releases.length);
  }finally{finish();await pending;}
});
const currentOptions = (): PostgresApplicationApiOptions => ({ ...nativeOptions(), currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() } });
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
  proof: ReturnType<typeof createSyntheticV7Fixture> | undefined;
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
    const proof = this.proof?.query(sql); if (proof !== undefined) return proof;
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
    // Exact named original statement protocols, not a general SQL/metadata matcher.
    // This fixture has no published HISTORY and no LIVE documents; totals are known
    // from the returned aggregate row, not inferred from an unknown/failed read.
    if (sql.startsWith("/* imported-history:schema */")) return rows([{ versions: Array.from({length:26},(_,i)=>i+1) }]);
    if (sql.startsWith("/* normal-document-list:shared */ WITH ")) return rows([{ exact_total: "0", quantity: "0", incoming_quantity: "0", outgoing_quantity: "0",
      gross_amount: "0", order_discount: "0", net_due: "0", history_valid: true, history_published: false, items: [] }]);
    if (sql.includes("/* inventory:publication */")) return rows([]); // Explicitly unpublished fixture; never invent stock zero.
    if (sql.includes("/* inventory-ledger:warehouse */")) return rows([{ id: warehouse.id, hall_id: warehouse.hallId, name: warehouse.label }]);
    if (sql.includes("/* inventory-ledger:sku */")) return rows([]);
    if (/SELECT COUNT\(\*\)::text AS exact_total FROM naijue_erp\.(sales_header|transfer_header|warehouse)/.test(sql)) return rows([{ exact_total: "0" }]);
    if (/SELECT h\.id, h\.number/.test(sql) && /FROM naijue_erp\.(sales_header|transfer_header)/.test(sql)) return rows([]);
    if (sql.includes("FROM naijue_erp.product p") || sql.includes("FROM naijue_erp.product_image i")) return rows([]);
    throw new Error("SYNTHETIC scripted protocol does not recognize this query");
  }
}
async function setup(t: TestContext, value: PostgresApplicationApiOptions = nativeOptions(), driver = new ScriptedDriver()) {
  const api = await createSyntheticV7Api(value, driver); t.after(() => api.close());
  const baseline = { connects: driver.connects, releases: driver.releases.length, calls: driver.calls.length };
  assert.deepEqual(baseline, { connects: 2, releases: 2, calls: 7 }, "Actual V7 catalog + same-pool identity proof are both awaited/released before ready");
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) => api.app.inject({ method: "POST", url, payload: JSON.stringify(payload),
    headers: { "content-type": "application/json", origin: ORIGIN, cookie: `__Host-naijue_session=${TOKEN}`, ...headers } });
  return { ...api, driver, post, baseline };
}
test("SYNTHETIC V7 composition: one proven owned pool, original19 routes plus explicit native reads, no business writes/listener", async t => {
  const rejected=new ScriptedDriver();
  await assert.rejects(createPostgresReadApi(options(),rejected.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
  assert.equal(rejected.allocations,0);assert.equal(rejected.connects,0);
  const f = await setup(t); assert.equal(f.driver.connects, f.baseline.connects); assert.equal(f.app.server.listening, false);
  const posts = ["/auth/login", "/auth/logout", "/auth/password", "/inventory/query", "/inventory/candidates/query", "/inventory/ledger/query",
    "/sales/query", "/sales/references/query", "/sales/detail/query", "/sales/history/query", "/sales/settlement-statistics/query", "/transfers/query",
    "/transfers/detail/query", "/transfers/warehouses/query", "/products/basics/query", "/products/specifications/query", "/products/images/query", "/products/image/query"];
  for (const url of posts) assert.ok(f.app.hasRoute({ method: "POST", url }), url);
  for(const [url] of currentRoutes) assert.equal(f.app.hasRoute({method:"POST",url}),true,url);
  assert.equal(f.app.hasRoute({method:"POST",url:"/imported-history/sales/query"}),true);
  assert.ok(f.app.hasRoute({ method: "GET", url: "/auth/session" }));
  for (const url of ["/sales/commands", "/transfers/commands", "/customers/commands", "/suppliers/commands", "/accounts", "/products/commands"])
    assert.equal((await f.post(url, {})).statusCode, 404, url);
  assert.equal(f.driver.connects, f.baseline.connects); assert.equal(f.postgresBackgroundFailureCount, 0);
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
  // An issuer-null refusal must not mask the applicable bounded-pool validation.
  const driver=new ScriptedDriver();
  await assert.rejects(createSyntheticV7Api({...nativeOptions(),postgres:{...postgres(),max:0}},driver),{code:"PG_INVALID_CONFIG"});
  assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);
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
  const api = await createSyntheticV7Api({ ...nativeOptions(), authorization }, driver);
  assert.equal(driver.allocations, 1); assert.equal(driver.connects, 2); assert.equal(driver.releases.length,2); await api.close(); assert.equal(driver.ends, 1);
});
test("SYNTHETIC V7 native profile: one proven pool creates genuine read policies and the canonical transfer policy", async t => {
  const f = await setup(t, nativeOptions());
  assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, f.baseline.connects); assert.equal(f.driver.calls.length, f.baseline.calls);
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
  assert.equal(identities.length, 7); // Normal sales/transfer lists independently re-read current identity on the actual data snapshot.
  for (const call of identities) assert.deepEqual(call.values, [ids.account]);
  assert.equal(f.driver.calls.filter(call => call.sql.includes("/* read-authorization:warehouses */")).length, 3);
  const sales = f.driver.calls.find(call => call.sql.startsWith("/* normal-document-list:shared */") && call.sql.includes("naijue_erp.sales_header"));
  assert.ok(sales); assert.deepEqual(sales.values, [ids.hall, COMPLETE_SCOPE_DECISION, ids.hall, 20, "0"]); assert.match(sales.sql, /h\.hall_id = \$1::uuid/);
  const transfer = f.driver.calls.find(call => call.sql.startsWith("/* normal-document-list:shared */") && call.sql.includes("naijue_erp.transfer_header"));
  assert.ok(transfer); assert.deepEqual(transfer.values, [ids.hall, ids.hall, ids.hall, "SALESPERSON", COMPLETE_SCOPE_DECISION, ids.hall, 20, "0"]); assert.match(transfer.sql, /created_role/);
  assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects - f.baseline.connects, 17); assert.equal(f.driver.releases.length - f.baseline.releases, 17);
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
    const sales = current.find(call => call.sql.startsWith("/* normal-document-list:shared */") && call.sql.includes("naijue_erp.sales_header"));
    const transfer = current.find(call => call.sql.startsWith("/* normal-document-list:shared */") && call.sql.includes("naijue_erp.transfer_header"));
    assert.ok(sales); assert.ok(transfer);
    assert.deepEqual(sales.values, role === "SALESPERSON" ? [ids.hall, COMPLETE_SCOPE_DECISION, ids.hall, 20, "0"] : [COMPLETE_SCOPE_DECISION, 20, "0"]);
    assert.deepEqual(transfer.values, role === "SALESPERSON" ? [ids.hall, ids.hall, ids.hall, role, COMPLETE_SCOPE_DECISION, ids.hall, 20, "0"] : [COMPLETE_SCOPE_DECISION, 20, "0"]);
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
  const f = await setup(t, Object.freeze({ ...nativeOptions(), authentication, authorization: selector }));
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
  assert.equal(driver.releases.length - f.baseline.releases, 5); assert.equal(driver.allocations, 1);
});
test("SYNTHETIC V7 composition: failed authentication-policy construction cleans its proven pool without a business connection", async () => {
  for (const value of [nativeOptions(), currentOptions()]) {
    const driver = new ScriptedDriver();
    await assert.rejects(createSyntheticV7Api({ ...value, authentication: { ...value.authentication, policy: { ...value.authentication.policy, sessionTtlSeconds: 0 } } }, driver), /complete policy/);
    assert.equal(driver.allocations, 1); assert.equal(driver.connects, 2); assert.equal(driver.releases.length,2); assert.equal(driver.ends, 1);
    assert.equal(driver.calls.length,7,"Authentication construction failure cannot run auth/session or business SQL after admission proof");
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
    if (url === "/sales/query" || url === "/transfers/query") assert.deepEqual(response.json(), { page: 1, pageSize: 20, exactTotal: "0", items: [], historyCoverage: "NOT_PUBLISHED",
      totals: url === "/sales/query" ? { quantity:"0",incomingQuantity:"0",outgoingQuantity:"0",grossAmount:"0",orderDiscount:"0",netDue:"0" } : { totalQuantity:"0" } });
  }
  const transferSql = f.driver.calls.find(call => call.sql.startsWith("/* normal-document-list:shared */") && call.sql.includes("naijue_erp.transfer_header")); assert.ok(transferSql);
  assert.ok(transferSql.sql.includes("created_role")); assert.deepEqual(transferSql.values, [ids.hall, ids.hall, ids.hall, "SALESPERSON", COMPLETE_SCOPE_DECISION, ids.hall, 20, "0"]);
  assert.equal(f.driver.calls.filter(call => call.sql === "BEGIN ISOLATION LEVEL READ COMMITTED").length, cases.length);
  assert.equal(f.driver.calls.filter(call => call.sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY").length, cases.length * 2 - 1); // Transfer uses its same native scope logic without a separate read-policy snapshot.
  assert.equal(f.driver.releases.length - f.baseline.releases, cases.length * 3 - 1); // Session + fresh native policy + reader; canonical transfer policy needs no separate policy lease.
});
test("RETIRED issuer-null composition: custom explicit product callbacks now refuse before provider or pool work", async () => {
  const value=options(),driver=new ScriptedDriver();let callbacks=0;
  const custom={async authorize():Promise<never>{callbacks++;throw new DomainError("FORBIDDEN","SYNTHETIC must not run");}};
  const selected={...value,authorization:{...value.authorization,inventory:custom,products:custom}};
  await assert.rejects(createPostgresReadApi(selected,driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
  assert.equal(callbacks,0);assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);assert.equal(driver.calls.length,0);
});

test("RETIRED issuer-null composition: custom explicit inventory/product denial callbacks now refuse before provider or pool work", async () => {
  const value=options(),driver=new ScriptedDriver();let callbacks=0;
  const custom={async authorize():Promise<never>{callbacks++;throw new DomainError("FORBIDDEN","SYNTHETIC must not run");}};
  const selected={...value,authorization:{...value.authorization,inventory:custom,products:custom}};
  await assert.rejects(createPostgresReadApi(selected,driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
  assert.equal(callbacks,0);assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);assert.equal(driver.calls.length,0);
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
test("RETIRED issuer-null composition: custom explicit pending product callbacks now refuse before provider or pool work", async () => {
  const value=options(),driver=new ScriptedDriver();let callbacks=0;
  const custom={async authorize():Promise<never>{callbacks++;throw new DomainError("FORBIDDEN","SYNTHETIC must not run");}};
  const selected={...value,authorization:{...value.authorization,inventory:custom,products:custom}};
  await assert.rejects(createPostgresReadApi(selected,driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
  assert.equal(callbacks,0);assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);assert.equal(driver.calls.length,0);
});

test("RETIRED issuer-null composition: custom explicit method-replacement callbacks now refuse before provider or pool work", async () => {
  const value=options(),driver=new ScriptedDriver();let callbacks=0;
  const custom={async authorize():Promise<never>{callbacks++;throw new DomainError("FORBIDDEN","SYNTHETIC must not run");}};
  const selected={...value,authorization:{...value.authorization,inventory:custom,products:custom}};
  await assert.rejects(createPostgresReadApi(selected,driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
  assert.equal(callbacks,0);assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);assert.equal(driver.calls.length,0);
});

test("SYNTHETIC V7 composition: pool disposal errors reject shutdown and never repeat driver end", async () => {
  for (const value of [nativeOptions(), currentOptions()]) {
    const driver = new ScriptedDriver(); driver.failEnd = true; const f = await createSyntheticV7Api(value, driver);
    await assert.rejects(f.close(), { code: "PG_DISPOSE_FAILED" }); assert.equal(driver.ends, 1); assert.equal(driver.connects, 2);
    assert.equal(driver.releases.length,2);assert.equal(driver.allocations, 1);
  }
});

test("SYNTHETIC composition source: legacy factory selects no capabilities; separate V7 graph has no unauthorized write routes", async t => {
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

test("RETIRED issuer-null CURRENT composition: absent option no longer constructs an unreviewed graph", async () => {
  for (const value of [options(), { ...options(), authorization: { mode: "source-confirmed-native" as const } }]) {
    const driver=new ScriptedDriver();
    await assert.rejects(createPostgresReadApi(value,driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
    assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);
  }
});

test("SYNTHETIC V7 CURRENT composition: explicit native graph adds five readers with one proven owned pool and no commands/listener", async t => {
  for (const value of [currentOptions()]) {
    const f = await setup(t, value); assert.equal(f.driver.allocations, 1); assert.equal(f.driver.connects, f.baseline.connects);
    for (const [url, payload] of currentRoutes) {
      assert.equal(f.app.hasRoute({ method: "POST", url }), true);
      const response = await f.post(url, payload, { "x-role": "ADMIN", "x-hall-id": sid("hall", 215) });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`); assert.equal(response.headers["cache-control"], "no-store");
      if (!url.includes("sku-batch")) assert.deepEqual(response.json(), { page: 1, pageSize: 20, exactTotal: "0", items: [] });
      else assert.equal(response.json()[0].id, ids.sku);
    }
    assert.equal(f.driver.calls.filter(call => call.sql.includes("/* current-form:identity */")).length, 5);
    assert.equal(f.driver.calls.filter(call => call.sql.includes("/* read-authorization:identity */")).length, 0); // No second policy lease.
    assert.equal(f.driver.connects - f.baseline.connects, 10); assert.equal(f.driver.releases.length - f.baseline.releases, 10); // Session + one CURRENT snapshot per request.
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
  const driver = new ScriptedDriver(); const pending = createSyntheticV7Api(value, driver);
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
  assert.equal(calls, 0); assert.equal(f.driver.connects, f.baseline.connects);
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
  assert.equal(driver.calls.some(call => call.sql.includes("read-authorization:")), false); assert.equal(driver.connects - f.baseline.connects, 4);
});


test('H06 issuer-null API refuses construction rather than claiming readiness from background counts',async()=>{
 const driver=new ScriptedDriver();
 await assert.rejects(createPostgresReadApi(options(),driver.factory),/Recorded live ledger pairs require the independently reviewed V7 runtime/);
 assert.equal(driver.allocations,0);assert.equal(driver.connects,0);assert.equal(driver.ends,0);
});

test('H06 old V1 catalog cannot admit the new full graph and is not relabeled as V7',async t=>{
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
 await assert.rejects(createPostgresRuntime26ApplicationApi({...currentOptions(),nativeReadExtensions:{profile:'source-confirmed-r1-v1'}},{reviewFile,trustedReviewSha256:hash(text)},()=>driver),/Recorded live ledger pairs require the exact independently reviewed V7 catalog/);
 assert.equal(acquired,0);assert.equal(released,0);assert.equal(ended,1); // Old V1 is refused before probing, but its owned driver is disposed.
});
test('A01 concrete capacity factory borrows only the original active maintenance client, reuses proof within callback and never caches across transactions',async()=>{
  let leases=0,releases=0,reads=0,checks=0;const sqls:string[]=[];
  const client={async query(sql:string){sqls.push(sql);if(sql.includes('maintained-catalogue26:new-capacity')){reads++;return{rows:[{occupied:false}],rowCount:1};}assert.ok(['BEGIN ISOLATION LEVEL READ COMMITTED','COMMIT','ROLLBACK'].includes(sql));return{rows:[],rowCount:0};},release(){releases++;}};
  const pool={async connect(){leases++;return client;}},driver=new PostgresMaintenanceCommandUnitOfWork(pool);
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual,purpose){assert.equal(actual,client);assert.equal(purpose,'INVENTORY_ADMISSION');checks++;}};
  const factory=createSourceConfirmedProductCapacityFactory(pool,runtime);
  const completion:MaintenanceCompletion={operationId:sid('operation',19000),actorAccountId:ids.account,requestKey:'a01-new-root',requestHash:'a'.repeat(64),kind:'PRODUCT',action:'CREATE',targetId:sid('product',19001),oldVersion:null,newVersion:1,beforeValues:null,afterValues:{version:1,name:'合成商品'},completedAt:TIME};
  let escaped:((value:MaintenanceCompletion)=>Promise<void>)|undefined;
  await driver.transaction(async context=>{escaped=factory(context);await escaped(completion);await escaped(completion);assert.equal(leases,1);assert.equal(reads,1);});
  assert.equal(releases,1);assert.equal(checks,2);const previous=sqls.length;
  await assert.rejects(escaped!(completion),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(sqls.length,previous);assert.equal(checks,2);
  await driver.transaction(async context=>{await factory(context)(completion);});assert.equal(reads,2);assert.equal(leases,2);assert.equal(releases,2);
  assert.ok(sqls.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql)),'Factory checks capacity; evidence/root writers retain their existing transaction roles');
});
test('A01 capacity factory rejects foreign/stale context before SQL, and unknown capacity rolls back original transaction',async()=>{
  let queried=0;const client={async query(sql:string){queried++;if(sql.includes('new-capacity'))return{rows:[{occupied:true}],rowCount:1};return{rows:[],rowCount:0};},release(){}};
  const pool={async connect(){return client;}},other={async connect(){assert.fail('No second pool connection permitted');return client;}},driver=new PostgresMaintenanceCommandUnitOfWork(pool);
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual){assert.equal(actual,client);}};
  const foreign=createSourceConfirmedProductCapacityFactory(other,runtime),original=createSourceConfirmedProductCapacityFactory(pool,runtime);
  await driver.transaction(async context=>{const before=queried;assert.throws(()=>foreign(context),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(queried,before);});
  const completion:MaintenanceCompletion={operationId:sid('operation',19002),actorAccountId:ids.account,requestKey:'a01-occupied-root',requestHash:'a'.repeat(64),kind:'PRODUCT',action:'CREATE',targetId:sid('product',19003),oldVersion:null,newVersion:1,beforeValues:null,afterValues:{version:1},completedAt:TIME};
  await assert.rejects(driver.transaction(async context=>original(context)(completion)),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});
});
test('A01 actual product UOW forwards concrete factory after original root lock; missing root CREATE capacity is available on one lease',async()=>{
  const sqls:string[]=[];let borrowed=0,released=0;
  const client={async query(sql:string){sqls.push(sql);return sql.includes('new-capacity')?{rows:[{occupied:false}],rowCount:1}:{rows:[],rowCount:0};},release(){released++;}};
  const pool={async connect(){borrowed++;return client;}},driver=new PostgresMaintenanceCommandUnitOfWork(pool);
  const runtime:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(actual){assert.equal(actual,client);}};
  const unitOfWork=new PostgresProductMaintenanceUnitOfWork(driver,{deletionGuard:null,capacity:createSourceConfirmedProductCapacityFactory(pool,runtime)});
  const completion={operationId:sid('operation',19004),actorAccountId:ids.account,requestKey:'a01-create-through-uow',requestHash:'a'.repeat(64),kind:'PRODUCT' as const,action:'CREATE' as const,targetId:sid('product',19005),oldVersion:null,newVersion:1,beforeValues:null,afterValues:{version:1},completedAt:TIME};
  await unitOfWork.transaction(async tx=>{assert.equal(await tx.load(completion.targetId),undefined);assert.ok(tx.assertPendingCapacity);await tx.assertPendingCapacity(completion);});
  assert.equal(borrowed,1);assert.equal(released,1);const root=sqls.findIndex(sql=>sql.includes('FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE'));
  const capacity=sqls.findIndex(sql=>sql.includes('new-capacity'));assert.ok(root>0&&capacity>root);assert.equal(sqls.at(-1),'COMMIT');
  assert.equal(sqls.some(sql=>/^INSERT|^UPDATE|^DELETE/.test(sql)),false);
});

// Historical assertion mappings are in the reconciliation packet, not proof of
// unsupported old custom-provider compatibility. This is the supported graph.
test('H06 NEW synthetic V7 exact issuer readiness rechecks same-pool identity, fails on drift and releases every lease',async t=>{
 const driver=new ScriptedDriver(),api=await createSyntheticV7Api(nativeOptions(),driver);t.after(()=>api.close());
 const initial=driver.connects;assert.equal(initial,2);assert.equal(await api.readiness!(),true);assert.equal(driver.connects,initial+1);
 assert.equal(driver.connects,driver.releases.length);driver.proof!.observation.identity.current_user='WRONG_ROLE';
 assert.equal(await api.readiness!(),false);assert.equal(driver.connects,driver.releases.length);
 await api.close();const closed=driver.connects;assert.equal(await api.readiness!(),false);assert.equal(driver.connects,closed);assert.equal(driver.ends,1);
});

test('NEW synthetic V7 generic invalid credentials and fresh native denial cannot reach product/inventory readers',async t=>{
 const f=await setup(t);const initial=f.driver.calls.length;
 for(const headers of [{cookie:""},{cookie:"__Host-naijue_session=bad"},{origin:"https://other.invalid"},{origin:""},{authorization:`Bearer ${TOKEN}`},{"sec-fetch-site":"cross-site"},{cookie:`__Host-naijue_session=${TOKEN}; __Host-naijue_session=${TOKEN}`}])
  assert.equal((await f.post('/products/basics/query',{productId:sid('product',123)},headers)).statusCode,401);
 assert.equal(f.driver.calls.length,initial);assert.equal(f.driver.connects,f.baseline.connects);
 f.driver.loginEnabled=false;assert.equal((await f.post('/products/basics/query',{productId:sid('product',123)})).statusCode,401);
 assert.equal(f.driver.calls.some(call=>call.sql.includes('read-authorization:')||call.sql.includes('FROM naijue_erp.product p')),false);
 f.driver.loginEnabled=true;f.driver.nativeIdentity={account_id:ids.account,staff_id:f.driver.account.staff_id,login_enabled:true,role:'AUDITOR',employment_status:'在职',hall_id:ids.hall,native_hall_id:ids.hall,hall_enabled:true};
 const before=f.driver.calls.length;
 for(const [url,payload]of [['/inventory/query',inventoryInput()],['/inventory/ledger/query',{warehouseId:ids.warehouse,skuId:ids.sku,pageSize:20,after:null}],['/products/basics/query',{productId:sid('product',124)}]]as const){
  const response=await f.post(url,payload);assert.equal(response.statusCode,403);assert.equal(response.body.includes('SYNTHETIC'),false);
 }
 const denied=f.driver.calls.slice(before);assert.equal(denied.filter(call=>call.sql.includes('read-authorization:identity')).length,3);
 assert.equal(denied.some(call=>call.sql.includes('inventory:publication')||call.sql.includes('inventory-ledger:warehouse')||call.sql.includes('FROM naijue_erp.product p')),false);
 assert.equal(f.driver.connects,f.driver.releases.length);
});
