import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
// Explicit protocol-test admission only; real trusted capacity is separately exercised.
const testCapacity = () => ({async acquire(){return {assertValid(){},release(){}};},close(){}});
/** Synthetic driver boundary + Fastify.inject only; no engine, listener or network acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPostgresReadApi, createPostgresApplicationApi, createPostgresRuntime26ApplicationApi, createPostgresRuntime26DocumentApplicationApi } from "./postgres-read-api.ts";
import { createSyntheticV8Fixture } from "../../../tests/support/live-ledger-api-v8-fixtures.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../../../packages/application/src/source-confirmed-current-form-authorization.ts";
import type { PostgresApplicationApiOptions, PostgresDocumentCommandsCapability } from "./postgres-read-api.ts";
import type { BoundedPostgresResult, PostgresPoolDriverFactory } from "../../../adapters/postgres/src/bounded-pool.ts";
import { createSourceAuthenticationPolicy } from "../../../packages/authentication/src/source-policy.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { ids, sid, SYNTHETIC_RULES } from "../../../tests/support/synthetic-fixtures.ts";
import { createSourceConfirmedTransferAuthorization, createSourceConfirmedTransferReferences } from "../../../packages/application/src/transfer-policy.ts";
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const origin = "https://127.0.0.1:55601";
test('A01 current concrete factory wires both standalone product providers; borrowed native SAVE keeps parent capacity proof',()=>{
  const source=ts.createSourceFile('postgres-read-api.ts',readFileSync(new URL('./postgres-read-api.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  const constructions:ts.NewExpression[]=[];const walk=(node:ts.Node)=>{if(ts.isNewExpression(node)&&node.expression.getText(source)==='PostgresProductMaintenanceUnitOfWork')constructions.push(node);ts.forEachChild(node,walk);};walk(source);
  assert.equal(constructions.length,2,'Both original ordinary and media-capable product providers remain covered');
  for(const node of constructions){const options=node.arguments?.[1];assert.ok(options&&ts.isObjectLiteralExpression(options));
    const capacity=options.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(source)==='capacity');assert.ok(capacity&&ts.isPropertyAssignment(capacity));
    assert.equal(capacity.initializer.getText(source),'createSourceConfirmedProductCapacityFactory(pool, issuer.runtime26)');}
  // This is source wiring evidence only. Existing independent D2 same-client protocol tests exercise the borrowed seam itself.
  const borrowed=readFileSync(new URL('../../../adapters/postgres/src/native-document-specification.ts',import.meta.url),'utf8');
  assert.match(borrowed,/assertPendingCapacity\s*:\s*[^\n]*context\.catalogue\.assertPendingCapacity/);
});
const base = (): PostgresApplicationApiOptions => ({ capacityAdmission:testCapacity(), postgres: {
  target: { host: "synthetic-not-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
  max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1000,
  statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000,
}, authentication: { trustedOrigin: origin, now: () => "2026-10-21T00:00:00.000Z", policy: createSourceAuthenticationPolicy(900), work:authenticationWork() },
  authorization: { mode: "source-confirmed-native" }, productMedia: null });
function driver(proof?: ReturnType<typeof createSyntheticV8Fixture>) {
  let allocations = 0, connects = 0, ends = 0, releases = 0;
  const calls: string[] = [];
  const d = Object.assign(new EventEmitter(), { async connect() {
    connects++;
    if (!proof) throw Error("Synthetic no-credential request must not borrow DB");
    return Object.assign(new EventEmitter(), { release() { releases++; }, async query(sql: string) {
      calls.push(sql); const result = proof.query(sql);
      if (result === undefined) throw Error("Unexpected synthetic V8 proof SQL; unauthenticated requests must not borrow DB");
      return result;
    } });
  }, async end() { ends++; } });
  const factory: PostgresPoolDriverFactory = () => { allocations++; return d; };
  return { factory, calls, releases: () => releases, counts: () => ({ allocations, connects, ends }) };
}
const nativeV8Options = (): PostgresApplicationApiOptions => ({ ...base(),
  currentForms: { authorization: createSourceConfirmedCurrentFormAuthorization() },
  nativeReadExtensions: { profile: "source-confirmed-r1-v1" },
});
const commands = (): PostgresDocumentCommandsCapability => ({
  sales: { rules: SYNTHETIC_RULES, authorization: { async assertAllowed() { throw new DomainError("FORBIDDEN", "Synthetic closed command scope"); } }, newId: kind => sid(kind, 5000) },
  transfers: { authorization: { async assertAllowed() { throw new DomainError("FORBIDDEN", "Synthetic closed transfer scope"); } },
    references: { async assertValid() { throw new DomainError("FORBIDDEN", "Synthetic closed references"); } }, newId: kind => sid(kind, 6000) },
  catalogueCompleteness: { async assertComplete() { throw Error("Synthetic verifier is never a production default"); } },
  nativeManualSalesPreparation: true, nativeManualTransferPreparation: true,
});
const writes = [
  ["POST", "/sales/commands"], ["POST", "/sales/prepare-create"], ["GET", "/sales/receipts/:requestKey"],
  ["POST", "/transfers/commands"], ["POST", "/transfers/prepare-create"], ["GET", "/transfers/receipts/:requestKey"],
] as const;
const settings = ["/store-settings-read/stores/query", "/store-settings-read/stores/detail/query",
  "/store-settings-read/warehouses/query", "/store-settings-read/warehouses/detail/query"];
const managementRoutes = {
  productManagementRead: ["/product-management/query", "/product-management/candidates/query"],
  catalogueSettingsRead: ["/catalogue-settings-read/categories/query", "/catalogue-settings-read/colors/query", "/catalogue-settings-read/fits/query"],
  dictionaryRead: ["/dictionary-read/size-groups/query", "/dictionary-read/seasons/query", "/dictionary-read/barcode-schemes/query", "/dictionary-read/barcode-scheme/query"],
} as const;
const managementKeys = Object.keys(managementRoutes) as (keyof typeof managementRoutes)[];
const partyRoutes = ["/customers", "/customers/candidates", "/customers/:id", "/suppliers", "/suppliers/candidates", "/suppliers/:id"];

// Real factory/authentication/BoundedPostgresPool/UoW/native preparation, scripted SQL only.
// Unlike plain pg, this actual pool refuses concurrent queries on one leased client.
test("NEW SYNTHETIC V8 application transfer prepare serializes warehouse facts on its one bounded transaction and returns exact quantity JSON", async t => {
  const options = nativeV8Options(), f = createSyntheticV8Fixture(options.postgres.target); t.after(() => f.cleanup());
  const token = Buffer.alloc(32, 47).toString("base64url"), hash = sessionTokenHash(token)!;
  const from = sid("warehouse", 7001), to = sid("warehouse", 7002);
  let sequence = 7100, ends = 0, borrowed = 0, released = 0;
  let policyFailureCode: string | undefined;
  let role = "WAREHOUSE", hallId: string | null = null, missingWarehouse = false;
  const calls: { sql: string; values: unknown[] }[] = [];
  const rows = (value: Record<string, unknown>[]): BoundedPostgresResult => ({ rows: value, rowCount: value.length });
  const scripted = Object.assign(new EventEmitter(), {
    async connect() { borrowed++; return Object.assign(new EventEmitter(), { release() { released++; },
      async query(sql: string, values: unknown[] = []): Promise<BoundedPostgresResult> {
        calls.push({ sql, values: structuredClone(values) });
        const proof = f.query(sql); if (proof !== undefined) return proof;
        if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SELECT pg_advisory_xact_lock")) return rows([]);
        if (sql.includes("FROM naijue_erp.auth_session")) return rows([{ token_hash: hash, account_id: ids.account, auth_version: 1,
          created_at: "2026-10-21T00:00:00.000Z", expires_at: "2026-10-21T00:15:00.000Z", revoked_at: null }]);
        if (sql.includes("FROM naijue_erp.user_account a JOIN")) return rows([{ account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee",
          password_hash: "SYNTHETIC_UNUSED_HASH", login_enabled: true, auth_version: 1, role, employment_status: "在职", hall_id: hallId }]);
        if (sql.includes("/* transfer-authorization:hall */")) return rows([{id:values[0],enabled:true}]);
        if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
        if (sql.includes("/* document-number:lock */")) return rows([]);
        if (sql.includes("/* document-number:existing */")) return rows([]);
        if (sql.includes("/* document-number:reserve */")) return rows([{number:"V2-DB-000000000001",actor_account_id:ids.account}]);
        if (sql.includes("FROM naijue_erp.transfer_header") || sql.includes("FROM naijue_erp.operation_receipt")) return rows([]);
        if (sql.includes("FROM naijue_erp.warehouse w JOIN")) return rows(missingWarehouse && values[0] === to ? [] : [{ id: values[0], hall_id: ids.hall,
          enabled: true, hall_enabled: true, has_nonzero_inventory: false }]);
        if (sql.includes("/* native-transfer-snapshots:schema */")) return rows([{ installed: true }]);
        if (sql.includes("/* native-transfer-snapshots:main */")) return rows([{sku_id:ids.sku,barcode:"000123"}]);
        if (sql.includes("/* native-transfer-snapshots:targets */")) return rows([{ id: ids.sku, product_code: "SYNTHETIC", product_name: "SYNTHETIC product",
          color_name: "SYNTHETIC color", fit_name: "SYNTHETIC fit", size_name: "SYNTHETIC size", barcode: "000123" }]);
        if (sql.includes("FROM naijue_erp.sku s JOIN")) return rows([{ id: ids.sku, enabled: true }]);
        throw Error("Unexpected synthetic prepare SQL");
      } }); }, async end() { ends++; }
  });
  const c = commands(), policy = createSourceConfirmedTransferAuthorization();
  const api = await createPostgresRuntime26DocumentApplicationApi({ ...options, documentCommands: { ...c, transfers: {
    authorization: { async assertAllowed(...args) {
      try { await policy.assertAllowed(...args); }
      catch (error) { policyFailureCode = (error as { code?: string }).code; throw error; }
    } }, references: createSourceConfirmedTransferReferences(), newId: kind => sid(kind, sequence++)
  } } }, f.review, { sales: false, transfers: false }, () => scripted);
  assert.equal(borrowed, 2, "Startup performs one complete V7 proof lease and one original admission identity lease");
  assert.equal(released, borrowed);
  const proposal = { businessDate: "2026-10-21", note: null, fromWarehouseId: from, toWarehouseId: to, lines: [{ skuId: ids.sku, quantity: "2" }] };
  const headers = { origin, cookie: `__Host-naijue_session=${token}` };
  try {
    for (const trustedRole of ["WAREHOUSE", "ADMIN", "SALESPERSON"]) {
      role = trustedRole; hallId = role === "SALESPERSON" ? ids.hall : null;
      const start = calls.length;
      const response = await api.app.inject({ method: "POST", url: "/transfers/prepare-create", headers, payload: proposal });
      assert.equal(response.statusCode, 200, JSON.stringify({ body: response.json(), policyFailureCode }));
      assert.equal(response.json().lines[0].quantity, "2"); assert.equal(response.json().lines[0].snapshot.barcode, "000123");
      assert.equal(response.headers["cache-control"], "no-store");
      const facts = calls.slice(start).filter(c => c.sql.includes("FROM naijue_erp.warehouse w JOIN"));
      assert.deepEqual(facts.map(c => c.values[0]), [from, to]);
    }
    missingWarehouse = true;
    const unavailable = await api.app.inject({ method: "POST", url: "/transfers/prepare-create", headers, payload: proposal });
    assert.equal(unavailable.statusCode, 409); assert.equal(unavailable.json().error.code, "WAREHOUSE_UNAVAILABLE");
    const beforeDenied = calls.length;
    const denied = await api.app.inject({ method: "POST", url: "/transfers/prepare-create", headers: { ...headers, origin: "https://other.invalid" }, payload: proposal });
    assert.equal(denied.statusCode, 401); assert.equal(calls.length, beforeDenied);
    assert.ok(calls.every(c => !/^(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(c.sql)));
    assert.equal(calls.filter(c=>c.sql.includes("/* document-number:reserve */")).length,3,"Each acknowledged preparation reserves its original database number; no other writes allowed");
  } finally { await api.close(); }
  assert.equal(ends, 1); assert.equal(borrowed, released);
});


test("NEW SYNTHETIC V8 native read graph captures origin, protects all actual read routes and implies no command or receipt grant", async t => {
  const options = nativeV8Options(), f = createSyntheticV8Fixture(options.postgres.target); t.after(() => f.cleanup());
  const d = driver(f), api = await createPostgresRuntime26ApplicationApi(options, f.review, d.factory);
  try {
    const baseline = d.counts().connects;
    assert.equal(baseline, 2); assert.equal(d.releases(), baseline);
    assert.equal(api.trustedOrigin, origin); assert.equal(api.app.server.listening, false);
    for (const [method, url] of writes) assert.equal(api.app.hasRoute({ method, url }), false);
    for (const url of [...settings, ...Object.values(managementRoutes).flat()]) {
      assert.equal(api.app.hasRoute({ method: "POST", url }), true, url);
      assert.equal((await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} })).statusCode, 401, url);
    }
    for (const url of partyRoutes) {
      assert.equal(api.app.hasRoute({ method: "GET", url }), true, url);
      assert.equal((await api.app.inject({ method: "GET", url: url.replace(":id", ids.customer) })).statusCode, 401, url);
    }
    for (const path of ["customers", "suppliers"]) {
      assert.equal(api.app.hasRoute({ method: "POST", url: `/${path}/commands` }), false);
      assert.equal(api.app.hasRoute({ method: "GET", url: `/${path}/receipts/:requestKey` }), false);
    }
    assert.deepEqual(d.counts(), { allocations: 1, connects: baseline, ends: 0 });
  } finally { await api.close(); }
  assert.equal(d.counts().ends, 1); assert.equal(d.counts().connects, d.releases());
});

test("NEW SYNTHETIC V8 native management policies reject stale identity before readers and disabled session before native policy", async t => {
  const options = nativeV8Options(), f = createSyntheticV8Fixture(options.postgres.target); t.after(() => f.cleanup());
  const token = Buffer.alloc(32, 32).toString("base64url"), hash = sessionTokenHash(token)!;
  let enabled = true, nativeCalls = 0, allocations = 0, connects = 0, releases = 0, ends = 0;
  const calls: string[] = [];
  const rows = (rows: Record<string, unknown>[]): BoundedPostgresResult => ({ rows, rowCount: rows.length });
  const scripted = Object.assign(new EventEmitter(), { async connect() { connects++; return Object.assign(new EventEmitter(), {
    release() { releases++; }, async query(sql: string): Promise<BoundedPostgresResult> {
      calls.push(sql); const proof = f.query(sql); if (proof !== undefined) return proof;
      if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
      if (sql.includes("FROM naijue_erp.auth_session")) return rows([{ token_hash: hash, account_id: ids.account, auth_version: 1,
        created_at: "2026-10-21T00:00:00.000Z", expires_at: "2026-10-21T00:15:00.000Z", revoked_at: null }]);
      if (sql.includes("/* application-read:identity */")) { nativeCalls++; return rows([{ account_id: ids.account, staff_id: sid("staff", 120),
        login_enabled: true, role: "UNKNOWN", employment_status: "在职", hall_id: ids.hall, native_hall_id: ids.hall, hall_enabled: true }]); }
      if (sql.includes("FROM naijue_erp.user_account a JOIN")) return rows([{ account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee",
        password_hash: "SYNTHETIC_UNUSED_HASH", login_enabled: enabled, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }]);
      if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
      throw Error("Native management reader must not run after denied current authority");
    } }); }, async end() { ends++; } });
  const pending = createPostgresRuntime26ApplicationApi(options, f.review, () => { allocations++; return scripted; });
  (options.authentication as { trustedOrigin: string }).trustedOrigin = "https://replaced-synthetic.invalid";
  const api = await pending;
  const baseline = connects, baselineStatements = calls.length; assert.equal(baseline, 2); assert.equal(releases, baseline);
  const probes = [["/product-management/candidates/query", { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 }],
    ["/catalogue-settings-read/categories/query", {}], ["/dictionary-read/seasons/query", { search: "", page: 1, pageSize: 20 }]] as const;
  const headers = { origin, cookie: `__Host-naijue_session=${token}` };
  try {
    assert.equal(api.trustedOrigin, origin, "The actual host captured trustedOrigin before its first await");
    for (const [url, payload] of probes) assert.equal((await api.app.inject({ method: "POST", url, payload, headers })).statusCode, 403, url);
    assert.equal((await api.app.inject({ method: "GET", url: "/customers?search=&enabled=ALL&page=1&pageSize=20", headers })).statusCode, 403);
    assert.equal(nativeCalls, 4); assert.equal(allocations, 1);
    const beforeForeignOrigin = calls.length;
    assert.equal((await api.app.inject({ method: "POST", url: probes[0][0], payload: probes[0][1], headers: { ...headers, origin: "https://other.invalid" } })).statusCode, 401);
    assert.equal(calls.length, beforeForeignOrigin); assert.equal(nativeCalls, 4);
    enabled = false;
    for (const [url, payload] of probes) assert.equal((await api.app.inject({ method: "POST", url, payload, headers })).statusCode, 401, url);
    assert.equal((await api.app.inject({ method: "GET", url: "/customers?search=&enabled=ALL&page=1&pageSize=20", headers })).statusCode, 401);
    assert.equal(nativeCalls, 4, "Current disabled session must not reach any native management/party policy");
    assert.equal(calls.slice(baselineStatements).some(sql => /FROM naijue_erp\.(product|category|season|size_group|barcode_scheme)\b/.test(sql)), false);
    assert.equal(connects, releases);
  } finally { await api.close(); }
  assert.equal(ends, 1); assert.equal(connects, releases);
});

test("old issuer-null read/application defaults now refuse the live ledger graph before allocating or listening", async () => {
  for (const factory of [createPostgresReadApi, createPostgresApplicationApi]) {
    const d = driver();
    await assert.rejects(factory(base(), d.factory), /Recorded live ledger pairs require the independently reviewed V8 complete-write runtime/);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
});
test("old custom command/settings composition now refuses without reviewed V7 authority before pool allocation", async () => {
  const d = driver(), options = { ...base(), documentCommands: commands(), storeSettingsRead: {
    authorization: { async authorize(): Promise<never> { throw new DomainError("STORE_SETTINGS_FORBIDDEN", "Synthetic denied settings scope"); } },
  } };
  await assert.rejects(createPostgresApplicationApi(options, d.factory), /Recorded live ledger pairs require the independently reviewed V8 complete-write runtime/);
  assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
});

test("NEW SYNTHETIC V8 R2 command/settings routes retain missing-session denial with one proof-bound pool and no listener", async t => {
  const options = { ...nativeV8Options(), documentCommands: commands() }, f = createSyntheticV8Fixture(options.postgres.target); t.after(() => f.cleanup());
  const d = driver(f), api = await createPostgresRuntime26DocumentApplicationApi(options, f.review, { sales: false, transfers: false }, d.factory);
  try {
    const baseline = d.counts().connects;
    assert.equal(baseline, 2); assert.equal(d.releases(), baseline);
    for (const [method, url] of writes) {
      assert.equal(api.app.hasRoute({ method, url }), true);
      const response = await api.app.inject({ method, url: url.replace(":requestKey", "SYNTHETIC-KEY"), headers: { origin }, ...(method === "POST" ? { payload: {} } : {}) });
      assert.equal(response.statusCode, 401);
    }
    for (const url of settings) {
      assert.equal(api.app.hasRoute({ method: "POST", url }), true);
      assert.equal((await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} })).statusCode, 401);
    }
    assert.deepEqual(d.counts(), { allocations: 1, connects: baseline, ends: 0 });
    assert.equal(api.trustedOrigin, origin); assert.equal(api.app.server.listening, false);
  } finally { await api.close(); }
  assert.equal(d.counts().ends, 1); assert.equal(d.releases(), d.counts().connects);
});
test("malformed/inherited/accessor capabilities and cross-pool UoW/time injection fail before pool allocation or getter execution", async () => {
  let getters = 0;
  const accessor = base(); Object.defineProperty(accessor, "documentCommands", { get() { getters++; return commands(); } });
  const inherited = Object.assign(Object.create({ documentCommands: commands() }) as PostgresApplicationApiOptions, base());
  const invalid = [accessor, inherited,
    { ...base(), documentCommands: undefined }, { ...base(), documentCommands: { ...commands(), nativeManualSalesPreparation: false } },
    { ...base(), documentCommands: { ...commands(), sales: { ...commands().sales, unitOfWork: {} } } },
    { ...base(), documentCommands: { ...commands(), transfers: { ...commands().transfers, now: () => "SYNTHETIC" } } },
    { ...base(), documentCommands: { ...commands(), catalogueCompleteness: undefined } },
    { ...base(), storeSettingsRead: {} }, { ...base(), storeSettingsRead: { authorization: { authorize: false } } },
  ];
  for (const value of invalid) {
    const d = driver(); await assert.rejects(createPostgresApplicationApi(value as PostgresApplicationApiOptions, d.factory), TypeError);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
  assert.equal(getters, 0);
});
test("old independent management opt-ins now refuse before allocation; V7 native profile rejects custom policy overrides", async t => {
  const native = nativeV8Options(), f = createSyntheticV8Fixture(native.postgres.target); t.after(() => f.cleanup());
  for (const key of managementKeys) {
    const selected = { authorization: { async authorize(): Promise<never> { throw new DomainError("FORBIDDEN", "SYNTHETIC closed scope"); } } };
    for (const factory of [createPostgresReadApi, createPostgresApplicationApi]) {
      const d = driver();
      await assert.rejects(factory({ ...base(), [key]: selected }, d.factory), /Recorded live ledger pairs require the independently reviewed V8 complete-write runtime/);
      assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
    }
    const d = driver();
    await assert.rejects(createPostgresRuntime26ApplicationApi({ ...native, [key]: selected }, f.review, d.factory), /Native read extensions require only their exact trusted profile and native identity policy/);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
});
test("management capability accessors/inheritance/symbols/missing or extra fields fail before allocation and without invoking getters", async () => {
  let getters = 0;
  for (const key of managementKeys) {
    const auth = { async authorize(): Promise<never> { throw Error("never called"); } };
    const accessor = base(); Object.defineProperty(accessor, key, { get() { getters++; return { authorization: auth }; } });
    const nested = Object.defineProperty({}, "authorization", { enumerable: true, get() { getters++; return auth; } });
    const providerAccessor = Object.defineProperty({}, "authorize", { get() { getters++; return auth.authorize; } });
    const invalid: unknown[] = [accessor, Object.assign(Object.create({ [key]: { authorization: auth } }), base()),
      ...[undefined, null, {}, [], nested, { authorization: providerAccessor }, { authorization: {} },
        { authorization: auth, reader: {} }, { authorization: auth, [Symbol("extra")]: true }].map(value => ({ ...base(), [key]: value }))];
    for (const options of invalid) {
      const d = driver(); await assert.rejects(createPostgresApplicationApi(options as PostgresApplicationApiOptions, d.factory), TypeError);
      assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
    }
  }
  assert.equal(getters, 0);
});
test("retired custom management/party provider graph now refuses before allocation or provider invocation", async t => {
  let providerCalls = 0;
  const authorization = { marker: "SYNTHETIC_CAPTURED_PROVIDER", async authorize(): Promise<never> {
    assert.equal(this.marker, "SYNTHETIC_CAPTURED_PROVIDER"); providerCalls++; throw new DomainError("FORBIDDEN", "SYNTHETIC private policy");
  } };
  const options = { ...base(), productManagementRead: { authorization }, catalogueSettingsRead: { authorization }, dictionaryRead: { authorization }, partyRead: { authorization } };
  const oldDriver = driver(), pending = createPostgresApplicationApi(options, oldDriver.factory);
  authorization.authorize = async () => { throw Error("Refused graph must never invoke the later replaced method"); };
  await assert.rejects(pending, /Recorded live ledger pairs require the independently reviewed V8 complete-write runtime/);
  assert.deepEqual(oldDriver.counts(), { allocations: 0, connects: 0, ends: 0 }); assert.equal(providerCalls, 0);
  const native = nativeV8Options(), f = createSyntheticV8Fixture(native.postgres.target); t.after(() => f.cleanup());
  const d = driver();
  await assert.rejects(createPostgresRuntime26ApplicationApi({ ...native, productManagementRead: { authorization }, catalogueSettingsRead: { authorization }, dictionaryRead: { authorization }, partyRead: { authorization } }, f.review, d.factory), /Native read extensions require only their exact trusted profile and native identity policy/);
  assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 }); assert.equal(providerCalls, 0);
  // No claim is made about the retired custom-provider method capture: no supported API mounts that graph.
});
test("old explicit party read graph now refuses before allocation; malformed party capabilities still fail before getters", async () => {
  const options = { ...base(), partyRead: { authorization: { async authorize(): Promise<never> { throw Error("not reached without session"); } } } };
  for (const factory of [createPostgresReadApi, createPostgresApplicationApi]) {
    const d = driver();
    await assert.rejects(factory(options, d.factory), /Recorded live ledger pairs require the independently reviewed V8 complete-write runtime/);
    assert.deepEqual(d.counts(), { allocations: 0, connects: 0, ends: 0 });
  }
  let getters = 0;
  const accessor = Object.defineProperty(base(), "partyRead", { get() { getters++; return {}; } });
  const invalid = [accessor, Object.assign(Object.create({ partyRead: {} }), base()), ...[undefined, {}, { authorization: {} },
    { authorization: { authorize: true } }, { authorization: { async authorize() {} }, newId() {} },
    { authorization: { async authorize() {} }, [Symbol("hidden")]: true }].map(partyRead => ({ ...base(), partyRead }))];
  for (const options of invalid) { const d = driver(); await assert.rejects(createPostgresApplicationApi(options as PostgresApplicationApiOptions, d.factory), TypeError); assert.equal(d.counts().allocations, 0); }
  assert.equal(getters, 0);
});
