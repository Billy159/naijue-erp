import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createProductionApplicationApi, parseProductionRuntimeConfiguration, productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration } from "./production-provider-composition.ts";
import { runProductionMain } from "./production-main.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { pbkdf2Sync } from "node:crypto";
import { wrapTrustedLegacyCredential } from "../../../packages/authentication/src/legacy-passwords.ts";
import { createPostgresApplicationApi, createSourceConfirmedApplicationReadAuthorization } from "./postgres-read-api.ts";

function config(): ProductionRuntimeConfiguration {
  return { schemaVersion: 1, profile: "source-confirmed-native-v1", documentCommands: "NATIVE_RUNTIME", publicOrigin: PRODUCTION_PUBLIC_ORIGIN,
    http: { host: "0.0.0.0", port: 3000, acceptedHosts: ["1n5635n614.goho.co"] }, assets: { root: "/unopened-output", entry: "index.html" },
    build: { sourceCommit: "f".repeat(40), buildId: "SYNTHETIC_PROTOCOL_ONLY" }, authentication: { sessionTtlSeconds: 900, policy: "source-confirmed-v1" },
    postgres: { target: { host: "never-connected.invalid", port: 5432, database: "SYNTHETIC_ONLY", user: "SYNTHETIC_ONLY", password: "SYNTHETIC_NOT_A_CREDENTIAL", ssl: false },
      max: 1, maxPendingAcquisitions: 1, connectionTimeoutMillis: 1000, acquisitionTimeoutMillis: 1000, queryTimeoutMillis: 1100, statementTimeoutMillis: 900,
      lockTimeoutMillis: 800, idleInTransactionTimeoutMillis: 1000, idlePoolTimeoutMillis: 1000, disposeGraceMillis: 0, disposeTimeoutMillis: 1000 } };
}
const account = entityId("account", "00000000-0000-4000-8000-000000000001"), hall = entityId("hall", "00000000-0000-4000-8000-000000000002");

test("production configuration has no missing, widened, unknown or ambient selectors", async () => {
  assert.deepEqual(parseProductionRuntimeConfiguration(config()), config());
  for (const change of [
    (c: Record<string, unknown>) => { delete c.authentication; },
    (c: Record<string, unknown>) => { c.publicOrigin = "http://localhost"; },
    (c: Record<string, unknown>) => { c.trustProxy = true; },
    (c: Record<string, unknown>) => { c.profile = "fixture"; },
    (c: Record<string, unknown>) => { c.http = { host: "0.0.0.0", port: 3000, acceptedHosts: [] }; },
    (c: Record<string, unknown>) => { c.authentication = { sessionTtlSeconds: 900, policy: "allow-all" }; }
  ]) {
    const c = structuredClone(config()) as unknown as Record<string, unknown>; change(c);
    assert.throws(() => parseProductionRuntimeConfiguration(c), TypeError);
  }
  await assert.rejects(runProductionMain([]), TypeError);
  await assert.rejects(runProductionMain(["relative-config.json"]), TypeError);
});

test("production reuses confirmed password/current-form rules and isolates caller aliases", async () => {
  const c = config(), options = productionApplicationOptions(c);
  (c.authentication as { sessionTtlSeconds: number }).sessionTtlSeconds = 99;
  assert.equal(options.authentication.policy.sessionTtlSeconds, 900);
  assert.throws(() => options.authentication.policy.assertNewPassword("1234567"));
  assert.doesNotThrow(() => options.authentication.policy.assertNewPassword("12345678"));
  assert.throws(() => options.authentication.policy.assertNewPassword("字".repeat(342)));
  assert.equal(options.productMedia, null);
  assert.equal("importedHistoryRead" in options, false); // Explicit closed extension constructs an independent HISTORY policy.
  assert.equal("partyRead" in options, false); // No caller provider overrides the closed native extension.
  assert.deepEqual(options.nativeReadExtensions, { profile: "source-confirmed-r1-v1" });
  const auth = options.currentForms!.authorization;
  const context = { actor: { accountId: account, hallId: hall }, identity: { accountId: account,
    staffId: entityId("staff", "00000000-0000-4000-8000-000000000003"), role: "SALESPERSON" as const, hallId: hall } };
  const signal = new AbortController().signal;
  assert.deepEqual(await auth.authorize(context, { kind: "sales-references", parameters: { kind: "hall", hallId: null, search: "", page: 1, pageSize: 20 } }, signal), { kind: "halls", hallIds: [hall] });
  await assert.rejects(auth.authorize({ ...context, actor: { ...context.actor, hallId: null } }, { kind: "transfer-warehouses", parameters: { direction: "FROM", search: "", page: 1, pageSize: 20 } }, signal), { code: "FORBIDDEN" });
});

test("native action and reference providers fail closed without original transaction facts", async () => {
  const commands = productionApplicationOptions(config()).documentCommands!;
  const salesDoc = { header: { id: "untrusted" }, lines: [] } as never;
  await assert.rejects(commands.sales.authorization.assertAllowed({ accountId: account, hallId: hall }, "SAVE", salesDoc), { code: "FORBIDDEN" });
  await assert.rejects(async () => commands.sales.rules.assertDraftChange(undefined, salesDoc), { code: "NATIVE_CATALOGUE_FACTS_UNAVAILABLE" });
  await assert.rejects(commands.transfers.authorization.assertAllowed({ accountId: account, role: "SALESPERSON", hallId: hall }, "SAVE", {} as never, undefined), { code: "TRANSFER_POLICY_CONTEXT_REQUIRED" });
  const generated = commands.sales.newId("operation"); assert.equal(entityId("operation", generated), generated);
  assert.notEqual(commands.sales.newId("operation"), generated);
});

test("one real application composition registers protected routes without connecting or listening", async () => {
  let allocations = 0, connects = 0, ends = 0;
  const driver = Object.assign(new EventEmitter(), { async connect(): Promise<never> { connects++; throw Error("UNEXPECTED_TEST_CONNECTION"); }, async end() { ends++; } });
  const api = await createProductionApplicationApi(config(), captured => { allocations++; assert.equal(captured.host, "never-connected.invalid"); assert.equal(captured.max, 1); return driver; });
  try {
    assert.equal(api.app.server.listening, false); assert.equal(api.trustedOrigin, PRODUCTION_PUBLIC_ORIGIN);
    assert.equal(allocations, 1); assert.equal(connects, 0);
    for (const url of ["/sales/commands", "/transfers/commands", "/sales/prepare-create", "/transfers/prepare-create", "/inventory/query", "/inventory/ledger/query", "/sales/query", "/transfers/query", "/current-form/sales-references/query"]) {
      assert.equal(api.app.hasRoute({ method: "POST", url }), true, url);
      const response = await api.app.inject({ method: "POST", url, payload: {}, headers: { origin: PRODUCTION_PUBLIC_ORIGIN } });
      assert.equal(response.statusCode, 401, url); assert.equal(response.body.includes("UNEXPECTED_TEST_CONNECTION"), false);
    }
    assert.equal(connects, 0);
    assert.equal(api.app.hasRoute({ method: "POST", url: "/imported-history/sales/query" }), true);
    assert.equal(api.app.hasRoute({ method: "POST", url: "/sales/CREATE" }), false);
  } finally { await api.close(); }
  assert.equal(ends, 1);
});

test("invalid PG settings refuse before driver construction", async () => {
  const c = config(); (c.postgres as { queryTimeoutMillis: number }).queryTimeoutMillis = 1;
  let allocations = 0;
  await assert.rejects(createProductionApplicationApi(c, () => { allocations++; throw Error("must not allocate"); }), { code: "PG_INVALID_CONFIG" });
  assert.equal(allocations, 0);
});

test("R1 explicit read profile installs no command or preparation routes", async () => {
  const c = { ...config(), documentCommands: "DISABLED" as const }; let connects = 0;
  const driver = Object.assign(new EventEmitter(), { async connect(): Promise<never> { connects++; throw Error("must not connect"); }, async end() {} });
  const api = await createProductionApplicationApi(c, () => driver);
  try {
    for (const url of ["/sales/commands", "/transfers/commands", "/sales/prepare-create", "/transfers/prepare-create"]) assert.equal(api.app.hasRoute({ method: "POST", url }), false);
    for (const url of ["/products/prices/query", "/products/barcodes/query", "/products/stock/query", "/dictionary-read/size-groups/query",
      "/imported-history/sales/query", "/imported-history/sales/detail/query", "/imported-history/transfers/query", "/imported-history/transfers/detail/query"]) {
      assert.equal(api.app.hasRoute({ method: "POST", url }), true, url);
      const response = await api.app.inject({ method: "POST", url, payload: {}, headers: { origin: PRODUCTION_PUBLIC_ORIGIN } });
      assert.equal(response.statusCode, 401, url);
    }
    assert.equal(api.app.hasRoute({ method: "GET", url: "/customers" }), true);
    for (const path of ["/customers/commands", "/suppliers/commands"]) assert.equal(api.app.hasRoute({ method: "POST", url: path }), false);
    assert.equal(api.app.hasRoute({ method: "POST", url: "/inventory/query" }), true); assert.equal(connects, 0);
  } finally { await api.close(); }
});
test("R1 independent read grants use current native role, exact product/tab, original directory operation and separate HISTORY scope", async () => {
  const productId = entityId("product", "00000000-0000-4000-8000-000000000010"), signal = new AbortController().signal;
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const) {
    let reads = 0, releases = 0;
    const policies = createSourceConfirmedApplicationReadAuthorization({ async connect() { return { async query(sql, values) {
      reads++; assert.match(sql, /application-read:identity/); assert.deepEqual(values, [account]);
      return { rows: [{ account_id: account, staff_id: "00000000-0000-4000-8000-000000000003", login_enabled: true,
        role, employment_status: "在职", hall_id: hall, native_hall_id: hall, hall_enabled: true }], rowCount: 1 };
    }, release() { releases++; } }; } });
    const actor = { accountId: account, hallId: hall };
    for (const kind of ["prices", "barcodes", "stock"] as const) {
      const intent = kind === "prices" ? { kind, parameters: { productId } }
        : { kind, parameters: { productId, page: 1, pageSize: 20 as const } };
      assert.deepEqual(await policies.productDetails.authorize(actor, intent, signal), { kind, productId });
    }
    assert.deepEqual(await policies.productManagement.authorize(actor, { kind: "list", parameters: {} as never }, signal), { kind: "all", totalStock: "all-warehouses" });
    assert.deepEqual(await policies.dictionary.authorize(actor, { kind: "barcode-schemes", operation: "detail", parameters: { schemeId: productId } }, signal), { kind: "barcode-schemes", targetId: productId });
    const history = await policies.importedHistory.authorize(actor, { kind: "sales", operation: "detail", parameters: { documentId: productId } as never }, signal);
    assert.deepEqual(history, { dataset: "HISTORY", actorAccountId: account, kind: "sales", operation: "detail", targetId: productId,
      scope: role === "SALESPERSON" ? { kind: "HALL_IDS", hallIds: [hall] } : { kind: "ALL" } });
    const transfer = policies.importedHistory.authorize(actor, { kind: "transfers", operation: "list", parameters: {} as never }, signal);
    const directory = policies.settings.authorize(actor, { kind: "warehouses", operation: "detail", parameters: { id: productId } }, signal);
    const partyList = policies.party.authorize({ ...actor, role }, { kind: "CUSTOMER", operation: "LIST", query: {} as never }, signal);
    if (role === "SALESPERSON") {
      for (const attempt of [transfer, directory, partyList]) await assert.rejects(attempt, { code: "FORBIDDEN" });
    } else { assert.equal((await transfer).scope.kind, "ALL"); assert.equal((await directory).targetId, productId); assert.equal((await partyList).operation, "LIST"); }
    assert.equal((await policies.party.authorize({ ...actor, role }, { kind: "CUSTOMER", operation: "CANDIDATES", query: {} as never }, signal)).operation, "CANDIDATES");
    assert.equal(reads, 10); assert.equal(releases, reads);
  }
});
test("R1 extensions deny disabled, stale-hall, inactive, spoofed role and aborted current facts without caching", async () => {
  let row: Record<string, unknown> = {}, reads = 0, releases = 0;
  const policies = createSourceConfirmedApplicationReadAuthorization({ async connect() { return { async query() { reads++; return { rows: [row], rowCount: 1 }; }, release() { releases++; } }; } });
  const actor = { accountId: account, hallId: hall }, intent = { kind: "prices" as const, parameters: { productId: entityId("product", account) } };
  const valid = { account_id: account, staff_id: "00000000-0000-4000-8000-000000000003", login_enabled: true,
    role: "ADMIN", employment_status: "在职", hall_id: hall, native_hall_id: hall, hall_enabled: true };
  for (const change of [{ login_enabled: false }, { hall_id: null }, { employment_status: "离职" }, { hall_enabled: false }, { role: "UNKNOWN" }]) {
    row = { ...valid, ...change }; await assert.rejects(policies.productDetails.authorize(actor, intent, new AbortController().signal), { code: "FORBIDDEN" });
  }
  row = valid; await policies.productDetails.authorize(actor, intent, new AbortController().signal);
  await assert.rejects(policies.party.authorize({ ...actor, role: "WAREHOUSE" }, { kind: "CUSTOMER", operation: "CANDIDATES", query: {} as never }, new AbortController().signal), { code: "FORBIDDEN" });
  const abort = new AbortController(); abort.abort(); await assert.rejects(policies.productDetails.authorize(actor, intent, abort.signal), { code: "FORBIDDEN" });
  assert.equal(reads, 7); assert.equal(releases, 7);
});
test("R1 extension selectors reject unknown profiles or explicit policy overrides before pool creation", async () => {
  const options = productionApplicationOptions({ ...config(), documentCommands: "DISABLED" }); let allocations = 0;
  for (const change of [{ nativeReadExtensions: { profile: "future" } }, { nativeReadExtensions: { profile: "source-confirmed-r1-v1", enabled: true } },
    { partyRead: { authorization: { async authorize() { throw Error("must not run"); } } } }]) {
    await assert.rejects(createPostgresApplicationApi({ ...options, ...change } as never, () => { allocations++; throw Error("must not allocate"); }), TypeError);
  }
  assert.equal(allocations, 0);
});

test("explicit production legacy opt-in reaches actual auth service while default composition remains scrypt-only", async () => {
  const password = "123456", salt = "c".repeat(48), hash = wrapTrustedLegacyCredential({ salt,
    hash: pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex") });
  let inserted = 0;
  const factory = () => Object.assign(new EventEmitter(), {
    async connect() { return Object.assign(new EventEmitter(), { async query(sql: string) {
      if (sql.includes("INSERT INTO naijue_erp.auth_session")) inserted++;
      return { rows: sql.includes("FROM naijue_erp.user_account a JOIN naijue_erp.staff s") ? [{ account_id: account,
        staff_id: "00000000-0000-4000-8000-000000000003", login_name: "SYNTHETIC_LEGACY_USER", password_hash: hash, login_enabled: true,
        auth_version: 1, role: "ADMIN", employment_status: "在职", hall_id: null }] : [], rowCount: 1 };
    }, release() {} }); }, async end() {}
  });
  const options = productionApplicationOptions({ ...config(), documentCommands: "DISABLED" }), { credentialCompatibility: _optIn, ...defaultAuth } = options.authentication;
  const original = await createPostgresApplicationApi({ ...options, authentication: defaultAuth }, factory);
  const production = await createProductionApplicationApi({ ...config(), documentCommands: "DISABLED" }, factory);
  try {
    const request = { method: "POST" as const, url: "/auth/login", headers: { origin: PRODUCTION_PUBLIC_ORIGIN }, payload: { loginName: "SYNTHETIC_LEGACY_USER", password } };
    assert.equal((await original.app.inject(request)).statusCode, 401); assert.equal(inserted, 0);
    const response = await production.app.inject(request); assert.equal(response.statusCode, 200); assert.equal(inserted, 1);
    assert.ok(response.headers["set-cookie"]?.toString().includes("HttpOnly; Secure; SameSite=Strict"));
    assert.equal(response.body.includes(hash), false); assert.equal(response.body.includes(salt), false); assert.equal(response.body.includes(password), false);
  } finally { await original.close(); await production.close(); }
});

test("W13 production mount uses shared pool and fresh maintenance identity; counts cannot expose forbidden staff/account modules", async () => {
  const token = Buffer.alloc(32, 29).toString("base64url"), now = "2026-10-22T00:00:00.000Z";
  const query = { module: "ALL", objectId: null, objectSearch: "", actorSearch: "", action: "ALL", dateFrom: null, dateTo: null, page: 1, pageSize: 20 };
  for (const scenario of [
    { role: "ADMIN", module: "ALL", enabled: true, status: 200, modules: 12 },
    { role: "WAREHOUSE", module: "ALL", enabled: true, status: 200, modules: 10 },
    { role: "WAREHOUSE", module: "STAFF", enabled: true, status: 403, modules: 0 },
    { role: "SALESPERSON", module: "ALL", enabled: true, status: 403, modules: 0 },
    { role: "ADMIN", module: "ALL", enabled: false, status: 403, modules: 0 }
  ]) {
    const calls: { sql: string; values: unknown[] }[] = []; let allocations = 0, connections = 0, releases = 0;
    const row = { account_id: account, staff_id: "00000000-0000-4000-8000-000000000003", login_name: "SYNTHETIC_AUDIT",
      password_hash: "SYNTHETIC_UNUSED_CREDENTIAL", login_enabled: true, auth_version: 1, role: "ADMIN", employment_status: "在职", hall_id: hall, hall_enabled: true };
    const driver = Object.assign(new EventEmitter(), { async connect() { connections++; return Object.assign(new EventEmitter(), {
      async query(sql: string, values: unknown[] = []) {
        calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
        if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK" || sql.includes("maintenance:administrator-lock")) {}
        else if (sql.includes("maintenance:identity")) rows = [{ ...row, role: scenario.role, login_enabled: scenario.enabled }];
        else if (sql.includes("maintenance:hall")) rows = [{ id: hall, enabled: true }];
        else if (sql.includes("settings-audit:role")) rows = [{ account_id: account, role: scenario.role }];
        else if (sql.includes("settings-audit:page")) {
          assert.equal((values[0] as string[]).length, scenario.modules);
          if (scenario.role === "WAREHOUSE") assert.ok(!(values[0] as string[]).some(m => m === "STAFF" || m === "ACCOUNT"));
          assert.doesNotMatch(sql, /password|token_hash|request_key|SELECT a\.\*/);
          rows = [{ total: "0", items: [], too_large: false }];
        } else if (sql.includes("FROM naijue_erp.auth_session")) rows = [{ token_hash: sessionTokenHash(token), account_id: account,
          auth_version: 1, created_at: now, expires_at: "2026-10-22T01:00:00.000Z", revoked_at: null }];
        else if (sql.includes("FROM naijue_erp.user_account a JOIN naijue_erp.staff s")) rows = [row];
        else if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE") rows = [{ enabled: true }];
        else throw Error("Unexpected synthetic W13 host query");
        return { rows, rowCount: rows.length };
      }, release() { releases++; }
    }); }, async end() {} });
    const base = productionApplicationOptions({ ...config(), documentCommands: "DISABLED" });
    const api = await createPostgresApplicationApi({ ...base, authentication: { ...base.authentication, now: () => now } }, () => { allocations++; return driver; });
    try {
      assert.equal(connections, 0); assert.equal(api.app.server.listening, false);
      const request = { method: "POST" as const, url: "/settings/audit/query", payload: { ...query, module: scenario.module },
        headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${token}` } };
      const response = await api.app.inject(request); assert.equal(response.statusCode, scenario.status, response.body);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(calls.filter(c => c.sql.includes("settings-audit:page")).length, scenario.status === 200 ? 1 : 0);
      assert.equal(allocations, 1); assert.equal(connections, 2); assert.equal(releases, connections);
      assert.ok(!calls.some(c => /^(?:INSERT|UPDATE|DELETE)/.test(c.sql)));
      if (scenario.status === 200) assert.deepEqual(response.json(), { items: [], total: 0, page: 1, pageSize: 20 });
      assert.equal(api.app.hasRoute({ method: "POST", url: "/settings/audit/commands" }), false);
      const noOrigin = await api.app.inject({ ...request, headers: { cookie: request.headers.cookie } });
      assert.equal(noOrigin.statusCode, 401); assert.equal(connections, 2);
    } finally { await api.close(); }
  }
});
test("W13 stays absent without the explicit native read profile; authenticated route is not created by base composition", async () => {
  const base = productionApplicationOptions({ ...config(), documentCommands: "DISABLED" }), { nativeReadExtensions: _profile, ...without } = base;
  const driver = Object.assign(new EventEmitter(), { async connect(): Promise<never> { throw Error("must not connect"); }, async end() {} });
  const api = await createPostgresApplicationApi(without, () => driver);
  try { assert.equal(api.app.hasRoute({ method: "POST", url: "/settings/audit/query" }), false); } finally { await api.close(); }
});
