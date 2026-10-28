import {createPasswordWorkGate} from "../../../packages/authentication/src/password-work-gate.ts";
import {createLoginAdmission} from "./login-admission.ts";
const authenticationWork = () => ({passwordGate:createPasswordWorkGate({maxConcurrent:2,maxAnonymous:1,retryAfterSeconds:1}),loginAdmission:createLoginAdmission({global:{burst:100,tokens:100,intervalMillis:1000},source:{burst:100,tokens:100,intervalMillis:1000},sourceAccount:{burst:100,tokens:100,intervalMillis:1000},entryTtlMillis:1000,maxEntries:1000,maxRetryAfterSeconds:1,now:()=>performance.now()})});
/** Synthetic driver boundary + Fastify.inject only; no engine, listener or network acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createPostgresReadApi, createPostgresApplicationApi } from "./postgres-read-api.ts";
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
const base = (): PostgresApplicationApiOptions => ({ postgres: {
  target: { host: "synthetic-not-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
  max: 2, maxPendingAcquisitions: 2, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1000,
  statementTimeoutMillis: 900, lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000,
}, authentication: { trustedOrigin: origin, now: () => "2026-10-21T00:00:00.000Z", policy: createSourceAuthenticationPolicy(900), work:authenticationWork() },
  authorization: { mode: "source-confirmed-native" }, productMedia: null });
function driver() {
  let allocations = 0, connects = 0, ends = 0;
  const d = Object.assign(new EventEmitter(), { async connect() { connects++; throw Error("Synthetic no-credential request must not borrow DB"); }, async end() { ends++; } });
  const factory: PostgresPoolDriverFactory = () => { allocations++; return d; };
  return { factory, counts: () => ({ allocations, connects, ends }) };
}
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
test("application transfer prepare serializes warehouse facts on its one bounded transaction and returns exact quantity JSON", async () => {
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
  const api = await createPostgresApplicationApi({ ...base(), documentCommands: { ...c, transfers: {
    authorization: { async assertAllowed(...args) {
      try { await policy.assertAllowed(...args); }
      catch (error) { policyFailureCode = (error as { code?: string }).code; throw error; }
    } }, references: createSourceConfirmedTransferReferences(), newId: kind => sid(kind, sequence++)
  } } }, () => scripted);
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

test("application API captures trustedOrigin while old read factory remains unchanged and both default to no commands/settings", async () => {
  for (const factory of [createPostgresReadApi, createPostgresApplicationApi]) {
    const d = driver(), api = await factory(base(), d.factory);
    try {
      for (const [method, url] of writes) assert.equal(api.app.hasRoute({ method, url }), false);
      for (const url of settings) assert.equal(api.app.hasRoute({ method: "POST", url }), false);
      for (const url of Object.values(managementRoutes).flat()) assert.equal(api.app.hasRoute({ method: "POST", url }), false);
      for (const url of partyRoutes) assert.equal(api.app.hasRoute({ method: "GET", url }), false);
      assert.equal(api.app.server.listening, false);
      assert.deepEqual(d.counts(), { allocations: 1, connects: 0, ends: 0 });
      if (factory === createPostgresReadApi) assert.equal(Object.hasOwn(api, "trustedOrigin"), false);
      else assert.equal((api as Awaited<ReturnType<typeof createPostgresApplicationApi>>).trustedOrigin, origin);
    } finally { await api.close(); }
    assert.equal(d.counts().ends, 1);
  }
});
test("application API installs explicit commands and four real settings readers before ready using one lazy pool/auth", async () => {
  const d = driver(), options = { ...base(), documentCommands: commands(), storeSettingsRead: {
    authorization: { async authorize(): Promise<never> { throw new DomainError("STORE_SETTINGS_FORBIDDEN", "Synthetic denied settings scope"); } },
  } };
  const api = await createPostgresApplicationApi(options, d.factory);
  try {
    for (const [method, url] of writes) {
      assert.equal(api.app.hasRoute({ method, url }), true);
      const response = await api.app.inject({ method, url: url.replace(":requestKey", "SYNTHETIC-KEY"), headers: { origin }, ...(method === "POST" ? { payload: {} } : {}) });
      assert.equal(response.statusCode, 401);
    }
    for (const url of settings) {
      assert.equal(api.app.hasRoute({ method: "POST", url }), true);
      assert.equal((await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} })).statusCode, 401);
    }
    assert.deepEqual(d.counts(), { allocations: 1, connects: 0, ends: 0 });
    assert.equal(api.trustedOrigin, origin); assert.equal(api.app.server.listening, false);
  } finally { await api.close(); }
  assert.equal(d.counts().ends, 1);
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
test("three management read capabilities independently install only their existing readers/routes with no implied write/settings grant", async () => {
  for (const key of managementKeys) {
    const d = driver(), options = { ...base(), [key]: { authorization: { async authorize(): Promise<never> { throw new DomainError("FORBIDDEN", "SYNTHETIC closed scope"); } } } };
    const api = await createPostgresApplicationApi(options, d.factory);
    try {
      for (const family of managementKeys) for (const url of managementRoutes[family]) {
        assert.equal(api.app.hasRoute({ method: "POST", url }), family === key, url);
        const response = await api.app.inject({ method: "POST", url, headers: { origin }, payload: {} });
        assert.equal(response.statusCode, family === key ? 401 : 404);
      }
      for (const [method, url] of writes) assert.equal(api.app.hasRoute({ method, url }), false);
      for (const url of settings) assert.equal(api.app.hasRoute({ method: "POST", url }), false);
      assert.deepEqual(d.counts(), { allocations: 1, connects: 0, ends: 0 });
    } finally { await api.close(); }
    assert.equal(d.counts().ends, 1);
    // Untyped callers cannot enable these capabilities through the old read factory.
    const oldDriver = driver(), old = await createPostgresReadApi(options, oldDriver.factory);
    try { for (const url of Object.values(managementRoutes).flat()) assert.equal(old.app.hasRoute({ method: "POST", url }), false); }
    finally { await old.close(); }
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
test("management providers bind before the first await and current session rejection precedes every management read", async () => {
  const token = Buffer.alloc(32, 31).toString("base64url"), hash = sessionTokenHash(token)!;
  let enabled = true, allocations = 0, ends = 0, providerCalls = 0;
  const calls: string[] = [];
  const rows = (rows: Record<string, unknown>[]): BoundedPostgresResult => ({ rows, rowCount: rows.length });
  const scripted = Object.assign(new EventEmitter(), {
    async connect() { return Object.assign(new EventEmitter(), { release() {}, async query(sql: string): Promise<BoundedPostgresResult> {
      calls.push(sql);
      if (sql.startsWith("BEGIN ") || sql === "COMMIT" || sql === "ROLLBACK") return rows([]);
      if (sql.includes("FROM naijue_erp.auth_session")) return rows([{ token_hash: hash, account_id: ids.account, auth_version: 1,
        created_at: "2026-10-21T00:00:00.000Z", expires_at: "2026-10-21T00:15:00.000Z", revoked_at: null }]);
      if (sql.includes("FROM naijue_erp.user_account a JOIN")) return rows([{ account_id: ids.account, staff_id: sid("staff", 120), login_name: "SYNTHETIC.employee",
        password_hash: "SYNTHETIC_UNUSED_HASH", login_enabled: enabled, auth_version: 1, role: "SALESPERSON", employment_status: "在职", hall_id: ids.hall }]);
      if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") return rows([{ enabled: true }]);
      throw Error("Management reader must not borrow a client after authorization rejection");
    } }); }, async end() { ends++; },
  });
  const authorization = { marker: "SYNTHETIC_CAPTURED_PROVIDER", async authorize(): Promise<never> {
    assert.equal(this.marker, "SYNTHETIC_CAPTURED_PROVIDER"); providerCalls++; throw new DomainError("FORBIDDEN", "SYNTHETIC private policy");
  } };
  const options = { ...base(), productManagementRead: { authorization }, catalogueSettingsRead: { authorization }, dictionaryRead: { authorization }, partyRead: { authorization } };
  const pending = createPostgresApplicationApi(options, () => { allocations++; return scripted; });
  authorization.authorize = async () => { throw Error("Replaced method must never run"); };
  const api = await pending;
  const probes = [["/product-management/candidates/query", { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 }],
    ["/catalogue-settings-read/categories/query", {}], ["/dictionary-read/seasons/query", { search: "", page: 1, pageSize: 20 }]] as const;
  try {
    for (const [url, payload] of probes) {
      const response = await api.app.inject({ method: "POST", url, payload, headers: { origin, cookie: `__Host-naijue_session=${token}` } });
      assert.equal(response.statusCode, 403, response.body);
    }
    assert.equal((await api.app.inject({ method: "GET", url: "/customers?search=&enabled=ALL&page=1&pageSize=20", headers: { cookie: `__Host-naijue_session=${token}` } })).statusCode, 403);
    assert.equal(providerCalls, 4); assert.equal(allocations, 1);
    enabled = false;
    for (const [url, payload] of probes) assert.equal((await api.app.inject({ method: "POST", url, payload,
      headers: { origin, cookie: `__Host-naijue_session=${token}` } })).statusCode, 401);
    assert.equal((await api.app.inject({ method: "GET", url: "/customers?search=&enabled=ALL&page=1&pageSize=20", headers: { cookie: `__Host-naijue_session=${token}` } })).statusCode, 401);
    assert.equal(providerCalls, 4, "Current disabled session cannot reach captured management/party policy");
    assert.equal(calls.some(sql => /FROM naijue_erp\.(product|category|season|size_group|barcode_scheme)\b/.test(sql)), false);
  } finally { await api.close(); }
  assert.equal(ends, 1);
});
test("explicit party read composition registers six authenticated GET with no maintenance/receipt dependencies", async () => {
  const options = { ...base(), partyRead: { authorization: { async authorize(): Promise<never> { throw Error("not reached without session"); } } } };
  for (const factory of [createPostgresReadApi, createPostgresApplicationApi]) {
    const d = driver(), api = await factory(options, d.factory);
    try {
      for (const url of partyRoutes) {
        assert.equal(api.app.hasRoute({ method: "GET", url }), factory === createPostgresApplicationApi);
        assert.equal((await api.app.inject({ method: "GET", url: url.replace(":id", ids.customer) })).statusCode, factory === createPostgresApplicationApi ? 401 : 404);
      }
      for (const path of ["customers", "suppliers"]) {
        assert.equal(api.app.hasRoute({ method: "POST", url: `/${path}/commands` }), false);
        assert.equal(api.app.hasRoute({ method: "GET", url: `/${path}/receipts/:requestKey` }), false);
      }
      assert.deepEqual(d.counts(), { allocations: 1, connects: 0, ends: 0 });
    } finally { await api.close(); }
    assert.equal(d.counts().ends, 1);
  }
  let getters = 0;
  const accessor = Object.defineProperty(base(), "partyRead", { get() { getters++; return {}; } });
  const invalid = [accessor, Object.assign(Object.create({ partyRead: {} }), base()), ...[undefined, {}, { authorization: {} },
    { authorization: { authorize: true } }, { authorization: { async authorize() {} }, newId() {} },
    { authorization: { async authorize() {} }, [Symbol("hidden")]: true }].map(partyRead => ({ ...base(), partyRead }))];
  for (const options of invalid) { const d = driver(); await assert.rejects(createPostgresApplicationApi(options as PostgresApplicationApiOptions, d.factory), TypeError); assert.equal(d.counts().allocations, 0); }
  assert.equal(getters, 0);
});
