import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createProductionApplicationApi, createProductionRuntime26ApplicationApi, parseProductionRuntimeConfiguration, parseProductionRuntime26Configuration, productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration, ProductionRuntime26Configuration } from "./production-provider-composition.ts";
import { runProductionMain } from "./production-main.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { createHash, pbkdf2Sync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NATIVE_RUNTIME26_METADATA_PROBE } from "../../../adapters/postgres/src/native-import-accounting-capability.ts";
import { historyDetailQuery, historyListQuery } from "../../../tests/support/imported-history-query-fixtures.ts";
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

/** Synthetic pinned metadata and driver protocol only: no actual approval/PG. */
function exact26Fixture(purposes = ["PRODUCT_SEASONS_READ", "CURRENT_CUSTOMER_READ_WRITE", "CURRENT_FORM_READ", "HISTORY_READ", "INVENTORY_ADMISSION"]) {
  const directory = mkdtempSync(join(tmpdir(), "d1-production26-synthetic-")), independent = join(directory, "independent.json"), reviewFile = join(directory, "review.json");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex"), digest = "a".repeat(64);
  const target = { database: "SYNTHETIC_ONLY", databaseOid: "123", actingRole: "SYNTHETIC_ONLY", sessionUser: "SYNTHETIC_ONLY",
    serverAddress: null, serverPort: null, postmasterStart: "2026-10-23 00:00:00+00" };
  const receipt = JSON.stringify({ result: "PASS", notice: "SYNTHETIC_PROTOCOL_ONLY_NOT_ACTUAL_APPROVAL" }); writeFileSync(independent, receipt, { mode: 0o600 });
  const review = { version: "C_NATIVE_RUNTIME26_REVIEW_V1", decision: "ACCEPT_EXACT_RUNTIME26_TARGET_METADATA", target,
    catalog: { format: "EXACT26_RUNTIME_CATALOG_EXPORT_V1", sha256: digest, patchLevel: "26_v7_media_color_swap" }, purposes, scope: "EXACT_TARGET_METADATA_ONLY",
    independentReview: { path: independent, sha256: hash(receipt), result: "PASS" }, realImportExecutionAuthorized: false };
  const body = JSON.stringify(review); writeFileSync(reviewFile, body, { mode: 0o600 });
  const configuration: ProductionRuntime26Configuration = { ...config(), profile: "source-confirmed-native-exact26-r1-v1", documentCommands: "DISABLED",
    runtime26Review: { reviewFile, trustedReviewSha256: hash(body) } };
  const observation = { identity: { database: target.database, database_oid: target.databaseOid, database_owner: "synthetic_owner", current_user: target.actingRole,
    session_user: target.sessionUser, server_version_num: "170011", server_addr: null, server_port: null, postmaster_start: target.postmasterStart, replication_role: "origin" },
    migration_versions: Array.from({ length: 26 }, (_, i) => i + 1), catalog_sha256: digest, source_routines_match: true };
  return { configuration, observation, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function exact26Driver(observation: ReturnType<typeof exact26Fixture>["observation"]) {
  const calls: { lease: number; sql: string; values: unknown[] }[] = []; let allocations = 0, connects = 0, releases = 0, ends = 0;
  const token = Buffer.alloc(32, 27).toString("base64url"), now = new Date().toISOString(), expires = new Date(Date.now() + 60_000).toISOString();
  const driver = Object.assign(new EventEmitter(), { async connect() { const lease = ++connects; return Object.assign(new EventEmitter(), {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ lease, sql, values }); let rows: Record<string, unknown>[] = [];
      if (sql === NATIVE_RUNTIME26_METADATA_PROBE) rows = [structuredClone(observation)];
      else if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) {}
      else if (sql.includes("FROM naijue_erp.auth_session")) rows = [{ token_hash: sessionTokenHash(token), account_id: account, auth_version: 1, created_at: now, expires_at: expires, revoked_at: null }];
      else if (sql.includes("FROM naijue_erp.user_account a JOIN naijue_erp.staff s")) rows = [{ account_id: account, staff_id: "00000000-0000-4000-8000-000000000003", login_name: "SYNTHETIC_RUNTIME26",
        password_hash: "SYNTHETIC_UNUSED_CREDENTIAL", login_enabled: true, auth_version: 1, role: "ADMIN", employment_status: "在职", hall_id: hall, native_hall_id: hall, hall_enabled: true }];
      else if (sql === "SELECT enabled FROM naijue_erp.hall WHERE id = $1 FOR SHARE" || sql.includes("current-form:sales-hall")) rows = [{ id: hall, enabled: true }];
      else if (sql.includes("current-form:count")) rows = [{ total: "0" }];
      else if (sql.includes("current-form:page")) {}
      else if (sql.includes("imported-history:schema")) rows = [{ versions: Array.from({ length: 26 }, (_, i) => i + 1) }];
      else if (sql.includes("imported-history:list-count")) rows = [{ total: "0" }];
      else if (sql.includes("imported-history:list-page") || sql.includes("imported-history:detail")) {}
      else throw Error("Unexpected exact26 synthetic composition SQL");
      return { rows, rowCount: rows.length };
    }, release() { releases++; }
  }); }, async end() { ends++; } });
  return { calls, token, factory: () => { allocations++; return driver; }, counts: () => ({ allocations, connects, releases, ends }) };
}
test("production exact26: separate closed selector refuses legacy, command, pin and provider widening before pool allocation", async () => {
  const f = exact26Fixture(); try {
    assert.deepEqual(parseProductionRuntime26Configuration(f.configuration), f.configuration);
    assert.throws(() => parseProductionRuntimeConfiguration(f.configuration), TypeError); assert.throws(() => parseProductionRuntime26Configuration(config()), TypeError);
    let allocations = 0;
    for (const change of [{ profile: "source-confirmed-native-v1" }, { documentCommands: "NATIVE_RUNTIME" }, { nativeReadExtensions: { profile: "future" } },
      { runtime26Review: { ...f.configuration.runtime26Review, extra: true } }, { runtime26Review: { reviewFile: "relative", trustedReviewSha256: "a".repeat(64) } },
      { runtime26Review: { ...f.configuration.runtime26Review, trustedReviewSha256: true } }])
      await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, ...change }, () => { allocations++; throw Error("must not allocate"); }), TypeError);
    assert.equal(allocations, 0);
  } finally { f.cleanup(); }
});
test("production exact26: one owned original pool supplies actual issuer leases to authentication and CURRENT reads with command routes absent", async () => {
  const f = exact26Fixture(), p = exact26Driver(f.observation);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      assert.equal(api.app.server.listening, false); assert.deepEqual(p.counts(), { allocations: 1, connects: 2, releases: 2, ends: 0 });
      for (const url of ["/sales/commands", "/transfers/commands", "/sales/prepare-create", "/transfers/prepare-create", "/sales/prepare-existing", "/transfers/prepare-existing", "/customers/commands", "/suppliers/commands"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), false, url);
      for (const url of ["/current-form/products/query", "/products/stock/query", "/imported-history/sales/query", "/imported-history/sales/detail/query", "/imported-history/transfers/query", "/imported-history/transfers/detail/query"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), true, url);
      const response = await api.app.inject({ method: "POST", url: "/current-form/products/query", headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` },
        payload: { context: { kind: "SALES", hallId: hall }, search: "", page: 1, pageSize: 20 } });
      assert.equal(response.statusCode, 200, response.body); assert.deepEqual(response.json().items, []); assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(p.counts().allocations, 1); assert.equal(p.counts().releases, p.counts().connects);
      const leased = new Map<number, typeof p.calls>();
      for (const call of p.calls) { const group = leased.get(call.lease) ?? []; group.push(call); leased.set(call.lease, group); }
      for (const calls of leased.values()) assert.equal(calls[0]!.sql, NATIVE_RUNTIME26_METADATA_PROBE);
      const formLease = [...leased.values()].find(calls => calls.some(call => call.sql.includes("current-form:count")))!;
      assert.ok(formLease); assert.equal(formLease.filter(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE).length, 3);
      assert.equal(formLease.at(-1)!.sql, "COMMIT"); assert.ok(p.calls.every(call => !/^(INSERT|UPDATE|DELETE)|nextval|setval/.test(call.sql)));
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
test("production exact26: target mismatch or missing readonly-view purpose disposes the original pool without legacy fallback", async () => {
  for (const failure of ["catalog", "purpose"]) {
    const f = exact26Fixture(failure === "purpose" ? ["CURRENT_FORM_READ"] : undefined), p = exact26Driver(f.observation);
    try {
      if (failure === "catalog") f.observation.catalog_sha256 = "b".repeat(64);
      await assert.rejects(createProductionRuntime26ApplicationApi(f.configuration, p.factory), { code: "NATIVE_RUNTIME26_NOT_READY" });
      assert.equal(p.counts().allocations, 1); assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, failure === "catalog" ? 1 : 2); assert.equal(p.counts().releases, p.counts().connects);
      assert.ok(p.calls.every(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE));
    } finally { f.cleanup(); }
  }
});
test("production exact26: live metadata drift denies authenticated reads through the managed pool and shutdown still owns the original pool", async () => {
  const f = exact26Fixture(), p = exact26Driver(f.observation);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      f.observation.catalog_sha256 = "b".repeat(64);
      const response = await api.app.inject({ method: "POST", url: "/current-form/products/query", headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` },
        payload: { context: { kind: "SALES", hallId: hall }, search: "", page: 1, pageSize: 20 } });
      assert.ok(response.statusCode >= 400); assert.equal(p.counts().allocations, 1); assert.equal(p.counts().connects, 3);
      assert.equal(p.counts().releases, 3); assert.ok(p.calls.every(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE));
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
test("production exact26: HISTORY four POST routes use their separate policy and original issuer lease while publication stays closed", async () => {
  const f = exact26Fixture(), p = exact26Driver(f.observation);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      for (const kind of ["sales", "transfers"]) for (const detail of [false, true]) {
        const response = await api.app.inject({ method: "POST", url: `/imported-history/${kind}/${detail ? "detail/" : ""}query`,
          headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` }, payload: detail ? historyDetailQuery() : historyListQuery() });
        assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().dataset, "HISTORY");
        assert.equal(response.json().kind, kind); assert.equal(response.headers["cache-control"], "no-store");
        if (detail) assert.equal(response.json().document, null); else assert.deepEqual(response.json().documents.items, []);
      }
      const snapshots = p.calls.filter(call => call.sql.includes("imported-history:schema")); assert.equal(snapshots.length, 4);
      for (const snapshot of snapshots) {
        const calls = p.calls.filter(call => call.lease === snapshot.lease);
        assert.equal(calls[0]!.sql, NATIVE_RUNTIME26_METADATA_PROBE);
        assert.ok(calls.filter(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE).length >= 2);
        assert.equal(calls.at(-1)!.sql, "COMMIT");
      }
      const published = p.calls.filter(call => /imported-history:(list-count|list-page|detail)/.test(call.sql)); assert.equal(published.length, 6);
      assert.ok(published.every(call => call.sql.includes("IMPORTED") && call.sql.includes("IMPORT_BATCH")));
      assert.ok(p.calls.every(call => !/^(INSERT|UPDATE|DELETE)|nextval|setval/.test(call.sql))); assert.equal(p.counts().allocations, 1); assert.equal(p.counts().releases, p.counts().connects);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
