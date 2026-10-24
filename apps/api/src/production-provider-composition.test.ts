import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import sharp from "sharp";
import { realpathSync } from "node:fs";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createProductionApplicationApi, createProductionRuntime26ApplicationApi, parseProductionRuntimeConfiguration, parseProductionRuntime26Configuration, productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration, ProductionRuntime26Configuration } from "./production-provider-composition.ts";
import { createProductionRuntime26R3ApplicationApi, parseProductionRuntime26R3Configuration, createProductionRuntime26R2ApplicationApi, parseProductionRuntime26R2Configuration } from "./production-provider-composition.ts";
import type { ProductionRuntime26R3Configuration, ProductionRuntime26R2Configuration } from "./production-provider-composition.ts";
import { runProductionMain, runProductionRuntime26Main } from "./production-main.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { createHash, pbkdf2Sync } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as pathDirectory, join } from "node:path";
import { NATIVE_RUNTIME26_METADATA_PROBE, NATIVE_RUNTIME26_V14_METADATA_PROBE, NATIVE_RUNTIME26_V15_METADATA_PROBE } from "../../../adapters/postgres/src/native-import-accounting-capability.ts";
import { historyDetailQuery, historyListQuery } from "../../../tests/support/imported-history-query-fixtures.ts";
import { wrapTrustedLegacyCredential } from "../../../packages/authentication/src/legacy-passwords.ts";
import { createPostgresApplicationApi, createPostgresRuntime26DocumentApplicationApi, createSourceConfirmedApplicationReadAuthorization } from "./postgres-read-api.ts";

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
    catalog: { format: "EXACT26_RUNTIME_CATALOG_EXPORT_V1", sha256: digest, patchLevel: "26_v10_native_creation_record_scope" }, purposes, scope: "EXACT_TARGET_METADATA_ONLY",
    independentReview: { path: independent, sha256: hash(receipt), result: "PASS" }, realImportExecutionAuthorized: false };
  const body = JSON.stringify(review); writeFileSync(reviewFile, body, { mode: 0o600 });
  const configuration: ProductionRuntime26Configuration = { ...config(), profile: "source-confirmed-native-exact26-r1-v1", documentCommands: "DISABLED",
    runtime26Review: { reviewFile, trustedReviewSha256: hash(body) } };
  const observation = { identity: { database: target.database, database_oid: target.databaseOid, database_owner: "synthetic_owner", current_user: target.actingRole,
    session_user: target.sessionUser, server_version_num: "170011", server_addr: null, server_port: null, postmaster_start: target.postmasterStart, replication_role: "origin" },
    migration_versions: Array.from({ length: 26 }, (_, i) => i + 1), catalog_sha256: digest, source_routines_match: true };
  return { configuration, observation, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
function exact26Driver(observation: ReturnType<typeof exact26Fixture>["observation"], extra?: (sql: string, values: unknown[]) => Record<string, unknown>[] | undefined) {
  const calls: { lease: number; sql: string; values: unknown[] }[] = []; let allocations = 0, connects = 0, releases = 0, ends = 0;
  const token = Buffer.alloc(32, 27).toString("base64url"), now = new Date().toISOString(), expires = new Date(Date.now() + 60_000).toISOString();
  const driver = Object.assign(new EventEmitter(), { async connect() { const lease = ++connects; return Object.assign(new EventEmitter(), {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ lease, sql, values }); let rows: Record<string, unknown>[] = [];
      const supplied = extra?.(sql, values);
      if (supplied !== undefined) rows = supplied;
      else if (sql === NATIVE_RUNTIME26_METADATA_PROBE) rows = [structuredClone(observation)];
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
      else if (sql.includes("sales:current-schema")) rows = [{ current_sales_schema_ready: true }];
      else if (sql.startsWith("SELECT pg_advisory_xact_lock") || sql.includes("FROM naijue_erp.operation_receipt")
        || sql.includes("FROM naijue_erp.sales_header") || sql.includes("FROM naijue_erp.transfer_header")) {}
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
      for (const url of ["/products/media/uploads", "/products/v2/commands", "/sales/commands", "/transfers/commands", "/sales/prepare-create", "/transfers/prepare-create", "/sales/prepare-existing", "/transfers/prepare-existing", "/customers/commands", "/suppliers/commands"])
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

function r2Configuration(configuration: ProductionRuntime26Configuration, sales = true, transfers = true): ProductionRuntime26R2Configuration {
  return { ...configuration, profile: "source-confirmed-native-exact26-r2-v1", documentCommands: "NATIVE_RUNTIME", existingPreparation: { sales, transfers } };
}
test("production R2 exact26: closed independent profile requires native commands, exact review and separate two-boolean existing selectors", async () => {
  const f = exact26Fixture(); try {
    const config = r2Configuration(f.configuration); assert.deepEqual(parseProductionRuntime26R2Configuration(config), config);
    assert.throws(() => parseProductionRuntimeConfiguration(config), TypeError); assert.throws(() => parseProductionRuntime26Configuration(config), TypeError);
    assert.throws(() => parseProductionRuntime26R2Configuration(f.configuration), TypeError);
    let allocations = 0, getters = 0;
    for (const change of [{ documentCommands: "DISABLED" }, { profile: "source-confirmed-native-v1" }, { existingPreparation: { sales: true } },
      { existingPreparation: { sales: "true", transfers: true } }, { existingPreparation: { sales: true, transfers: true, create: true } },
      { runtime26Review: { ...config.runtime26Review, issuer: true } }, { catalogueCompleteness: true }])
      await assert.rejects(createProductionRuntime26R2ApplicationApi({ ...config, ...change }, () => { allocations++; throw Error("must not allocate"); }), TypeError);
    const accessor = Object.defineProperty({ sales: true, transfers: true }, "sales", { enumerable: true, get() { getters++; throw Error("MUST_NOT_RUN"); } });
    assert.throws(() => parseProductionRuntime26R2Configuration({ ...config, existingPreparation: accessor }), TypeError);
    const { runtime26Review: _review, existingPreparation: _preparation, ...legacy } = config;
    await assert.rejects(createPostgresRuntime26DocumentApplicationApi(productionApplicationOptions({ ...legacy, profile: "source-confirmed-native-v1", documentCommands: "DISABLED" }),
      config.runtime26Review, config.existingPreparation, () => { allocations++; throw Error("must not allocate"); }), TypeError);
    const original = productionApplicationOptions({ ...legacy, profile: "source-confirmed-native-v1" }), { catalogueCompleteness: _proof, ...missingProof } = original.documentCommands!;
    await assert.rejects(createPostgresRuntime26DocumentApplicationApi({ ...original, documentCommands: missingProof } as never,
      config.runtime26Review, config.existingPreparation, () => { allocations++; throw Error("must not allocate"); }), TypeError);
    assert.equal(allocations, 0); assert.equal(getters, 0);
  } finally { f.cleanup(); }
});
test("production R2 exact26: fresh one-pool composition mounts commands and CREATE with independently selected existing routes", async () => {
  for (const [sales, transfers] of [[false, false], [true, false], [false, true], [true, true]]) {
    const f = exact26Fixture(), p = exact26Driver(f.observation);
    try {
      const api = await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration, sales, transfers), p.factory);
      try {
        assert.equal(api.app.server.listening, false); assert.deepEqual(p.counts(), { allocations: 1, connects: 2, releases: 2, ends: 0 });
        for (const url of ["/products/media/uploads", "/products/v2/commands"]) assert.equal(api.app.hasRoute({ method: "POST", url }), false);
        for (const [kind, enabled] of [["sales", sales], ["transfers", transfers]] as const) {
          assert.equal(api.app.hasRoute({ method: "POST", url: `/${kind}/commands` }), true);
          assert.equal(api.app.hasRoute({ method: "POST", url: `/${kind}/prepare-create` }), true);
          assert.equal(api.app.hasRoute({ method: "POST", url: `/${kind}/prepare-existing` }), enabled);
          const response = await api.app.inject({ method: "POST", url: `/${kind}/prepare-existing`, payload: {} }); assert.equal(response.statusCode, enabled ? 401 : 404);
        }
        assert.equal(p.counts().connects, 2); assert.ok(p.calls.every(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE));
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1);
    } finally { f.cleanup(); }
  }
});
test("production R2 exact26: command, receipt and existing preparation UOWs all carry the same genuine issuer pool/client gates", async () => {
  const f = exact26Fixture(), p = exact26Driver(f.observation);
  try {
    const api = await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration), p.factory);
    try {
      const target = "00000000-0000-4000-8000-000000000010", warehouse = "00000000-0000-4000-8000-000000000011", sku = "00000000-0000-4000-8000-000000000012";
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      for (const kind of ["sales", "transfers"] as const) {
        const command = { action: "APPROVE", expectedVersion: 1, requestKey: `SYNTHETIC-R2-${kind}`, [kind === "sales" ? "salesId" : "transferId"]: target };
        assert.equal((await api.app.inject({ method: "POST", url: `/${kind}/commands`, headers, payload: command })).statusCode, 404);
        assert.equal((await api.app.inject({ method: "GET", url: `/${kind}/receipts/missing`, headers })).statusCode, 404);
        const existing = kind === "sales" ? { salesId: target, expectedVersion: 1, businessType: "SALE", businessDate: "2026-10-23", note: null, hallId: hall,
          warehouseId: warehouse, customerId: target, salespersonId: null, orderDiscount: "0.00", lines: [{ existingLineId: null, skuId: sku, quantity: "1", dealPrice: "1.25",
            pricingRule: "UNIT_PRICE", discountTenths: null, isGift: false, zeroConfirmed: false }], settlements: [] }
          : { transferId: target, expectedVersion: 1, businessDate: "2026-10-23", note: null, fromWarehouseId: warehouse, toWarehouseId: sku,
            lines: [{ existingLineId: null, skuId: sku, quantity: "1" }] };
        const response = await api.app.inject({ method: "POST", url: `/${kind}/prepare-existing`, headers, payload: existing }); assert.equal(response.statusCode, 404, response.body);
      }
      const commandLeases = new Set(p.calls.filter(call => call.sql.startsWith("SELECT pg_advisory_xact_lock")).map(call => call.lease)); assert.equal(commandLeases.size, 6);
      for (const lease of commandLeases) {
        const calls = p.calls.filter(call => call.lease === lease), probes = calls.filter(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE);
        assert.equal(calls[0]!.sql, NATIVE_RUNTIME26_METADATA_PROBE); assert.ok(probes.length >= 3);
        assert.equal(probes.length, calls.at(-1)!.sql === "COMMIT" ? 4 : 3);
      }
      assert.ok(p.calls.every(call => !/^(INSERT|UPDATE|DELETE)|nextval|setval/.test(call.sql))); assert.equal(p.counts().allocations, 1); assert.equal(p.counts().connects, p.counts().releases);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
test("production R2 exact26: missing command purpose aborts startup and closes only its owned original pool", async () => {
  const f = exact26Fixture(["PRODUCT_SEASONS_READ", "CURRENT_CUSTOMER_READ_WRITE", "CURRENT_FORM_READ", "HISTORY_READ"]), p = exact26Driver(f.observation);
  try {
    await assert.rejects(createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration), p.factory), { code: "NATIVE_RUNTIME26_NOT_READY" });
    assert.equal(p.counts().allocations, 1); assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, p.counts().releases);
    assert.ok(p.calls.every(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE));
  } finally { f.cleanup(); }
});

function r3Configuration(base: ProductionRuntime26Configuration, root: string): ProductionRuntime26R3Configuration {
  return { ...r2Configuration(base), profile: "source-confirmed-native-exact26-r3-v1", productMedia: { root, rootKey: "native-images" } };
}
test("production R3 media: explicit private root is isolated from R1/R2 and missing maintenance purpose closes its owned pool", async () => {
  const f = exact26Fixture(), p = exact26Driver(f.observation), c = r3Configuration(f.configuration, "/private-original-images");
  try {
    assert.deepEqual(parseProductionRuntime26R3Configuration(c), c);
    assert.throws(() => parseProductionRuntime26Configuration(c), TypeError);
    assert.throws(() => parseProductionRuntime26R2Configuration(c), TypeError);
    await assert.rejects(createProductionRuntime26R3ApplicationApi({ ...c, productMedia: { root: "relative", rootKey: "native" } }, p.factory), TypeError);
    assert.equal(p.counts().allocations, 0);
    await assert.rejects(createProductionRuntime26R3ApplicationApi(c, p.factory), { code: "NATIVE_RUNTIME26_NOT_READY" });
    assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, p.counts().releases);
  } finally { f.cleanup(); }
});
test("production R3 media: real private stage, original prepared transaction, rich read and controlled bytes share one bounded pool", async () => {
  const purposes = ["PRODUCT_SEASONS_READ", "CURRENT_CUSTOMER_READ_WRITE", "CURRENT_FORM_READ", "HISTORY_READ", "INVENTORY_ADMISSION", "PRODUCT_MAINTENANCE"];
  const f = exact26Fixture(purposes), root = mkdtempSync(join(realpathSync(tmpdir()), "d1-r3-media-synthetic-"));
  let image: Record<string, unknown> | undefined, productId: string | undefined, audit: unknown[] | undefined, receipt: Record<string, unknown> | undefined;
  let denied = false;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql.includes("maintenance:identity") && denied) return [];
    if (sql.includes("maintenance:hall")) return [{ id: hall, enabled: true }];
    if (sql.includes("maintenance:receipt")) return receipt ? [receipt] : [];
    if (sql.includes("FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE")) return [];
    if (sql.includes("FROM naijue_erp.product_category") || sql.includes("FROM naijue_erp.size_group WHERE")) return [{ id: values[0] }];
    if (sql.includes("FROM naijue_erp.size_group_member")) return (values[1] as string[]).map(size_id => ({ size_id }));
    if (sql.includes("FROM naijue_erp.supplier")) return [{ id: values[0], enabled: true }];
    if (sql.includes("FROM naijue_erp.barcode_scheme")) return (values[0] as string[]).map(id => ({ id }));
    if (sql.includes("FROM naijue_erp.color WHERE") || sql.includes("FROM naijue_erp.fit WHERE")) return (values[0] as string[]).map(id => ({ id, enabled: true, retained: true }));
    if (sql.includes("FROM naijue_erp.product_image WHERE product_id")) return image ? [image] : [];
    if (sql.includes("maintenance:audit")) { audit = values; return [{}]; }
    if (sql.startsWith("INSERT INTO naijue_erp.product(")) { productId = values[0] as string; return [{}]; }
    if (sql.startsWith("INSERT INTO naijue_erp.sku(")) return [{}];
    if (sql.startsWith("INSERT INTO naijue_erp.product_image(")) {
      image = Object.fromEntries(["id", "product_id", "file_ref", "mime", "byte_size", "display_order", "created_at", "created_by_account_id", "version", "image_role", "color_id"].map((key, i) => [key, values[i]])); return [{}];
    }
    if (sql.includes("maintenance:complete")) {
      receipt = { id: values[0], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], result_data: JSON.parse(values[7] as string), completed_at: values[8] };
      return [{ result_data: receipt.result_data }];
    }
    if (sql.includes("product-maintenance:images")) return [{ id: productId, version: 1, images: image ? [{ ...image, created_at: (image.created_at as string).replace(/\.(\d{3})Z$/, ".$1000Z"), valid_color: true }] : [] }];
    if (sql.includes("FROM naijue_erp.product_image i")) return image ? [image] : [];
    return undefined;
  });
  const c = r3Configuration(f.configuration, root); (c.postgres as { maxPendingAcquisitions: number }).maxPendingAcquisitions = 0;
  try {
    const api = await createProductionRuntime26R3ApplicationApi(c, p.factory);
    try {
      assert.equal(api.app.server.listening, false);
      for (const url of ["/products/media/uploads", "/products/v2/commands", "/products/maintenance/images/query", "/products/maintenance/v2/detail/query"]) {
        assert.equal(api.app.hasRoute({ method: "POST", url }), true);
        assert.equal((await api.app.inject({ method: "POST", url, payload: {} })).statusCode, 401);
      }
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` }, commandKey = "synthetic-r3-original-command";
      const bytes = await sharp({ create: { width: 8, height: 4, channels: 3, background: "#123456" } }).png().toBuffer();
      const uploadHeaders = { ...headers, "content-type": "image/png", "x-command-key": commandKey, "x-upload-key": "original-image" };
      const upload = () => api.app.inject({ method: "POST", url: "/products/media/uploads", headers: uploadHeaders, payload: bytes });
      const staged = await upload(); assert.equal(staged.statusCode, 200, staged.body); assert.deepEqual(Object.keys(staged.json()).sort(), ["byteSize", "expiresAt", "mime", "uploadId"]);
      assert.deepEqual((await upload()).json(), staged.json());
      denied = true; assert.equal((await upload()).statusCode, 403); denied = false;
      const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const missingTarget = await api.app.inject({ method: "POST", url: "/products/media/uploads", headers: { ...uploadHeaders, "x-product-id": id(999) }, payload: bytes });
      assert.equal(missingTarget.statusCode, 404, missingTarget.body);
      const command = { action: "CREATE", requestKey: commandKey, values: { productCode: "R3-SYNTHETIC", name: "Synthetic only", categoryId: id(91), supplierId: id(96), seasonIds: [], sizeGroupId: id(92),
        year: 2026, systemItemCode: "00001", thickness: null, collarPantsType: null, defaultBarcodeSchemeId: id(97), enabled: true,
        prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, k === "retail_price" ? "1.00" : null])) },
        skus: [{ id: null, expectedVersion: null, skuCode: "R3-SYNTHETIC-SKU", colorId: id(93), fitId: id(94), sizeId: id(95), enabled: true }], barcodes: [],
        imageChanges: [{ action: "ADD", uploadId: staged.json().uploadId, role: "MAIN", colorId: null, displayOrder: 0 }] };
      const send = () => api.app.inject({ method: "POST", url: "/products/v2/commands", headers, payload: command });
      const saved = await send(); assert.equal(saved.statusCode, 200, saved.body); assert.ok(audit && image && receipt);
      const writeCount = p.calls.filter(c => /^(?:\/\* maintenance:(?:audit|complete) \*\/ )?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)).length;
      assert.deepEqual((await send()).json(), saved.json());
      assert.equal(p.calls.filter(c => /^(?:\/\* maintenance:(?:audit|complete) \*\/ )?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)).length, writeCount);
      const writes = p.calls.filter(c => c.sql.includes("maintenance:audit") || c.sql.startsWith("INSERT INTO naijue_erp.product") || c.sql.startsWith("INSERT INTO naijue_erp.sku") || c.sql.includes("maintenance:complete"));
      assert.equal(new Set(writes.map(c => c.lease)).size, 1); assert.ok(writes[0]!.sql.includes("maintenance:audit"));
      const rich = await api.app.inject({ method: "POST", url: "/products/maintenance/images/query", headers, payload: { productId } });
      assert.equal(rich.statusCode, 200, rich.body); assert.equal(rich.json().images[0].thumbnailState, "READY");
      const link = new URL(rich.json().images[0].thumbnailUrl); assert.equal(link.origin, PRODUCTION_PUBLIC_ORIGIN); assert.ok(link.pathname.startsWith("/api/products/media/"));
      assert.doesNotMatch(rich.body, /fileRef|staged-product-media|original.bin/);
      const delivered = await api.app.inject({ method: "GET", url: link.pathname.slice(4), headers });
      assert.equal(delivered.statusCode, 200, delivered.body); assert.equal(delivered.headers["content-type"], "image/webp"); assert.ok(delivered.rawPayload.length > 0);
      assert.equal((await api.app.inject({ method: "GET", url: link.pathname.slice(4) })).statusCode, 401);
      assert.equal(p.counts().allocations, 1); assert.equal(p.counts().connects, p.counts().releases); assert.equal(api.postgresBackgroundFailureCount, 0);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); rmSync(root, { recursive: true, force: true }); }
});

/** Approved CORE configuration uses synthetic pinned review/proof only, never real data or a listener. */
function coreProductionFixture() {
  const f = exact26Fixture(["CURRENT_FORM_READ"]), review = JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile, "utf8"));
  review.catalog.patchLevel = "26_v14_core_initialization";
  const body = JSON.stringify(review); writeFileSync(f.configuration.runtime26Review.reviewFile, body, { mode: 0o600 });
  const id = (i: number) => `14000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const parties: import("../../../packages/application/src/inventory-cutoff-import.ts").CoreSourceMember[] = [];
  for (const [entity, count] of [["STAFF", 49], ["HALL", 22], ["WAREHOUSE", 22], ["CUSTOMER", 22]] as const)
    for (let i = 0; i < count; i++) { const n = parties.length + 1; parties.push({ entity, sourceKey: `SYNTHETIC_${entity}_${i}`, sourceRowId: id(n),
      nativeId: entity === "STAFF" && i === 0 ? "00000000-0000-4000-8000-000000000003" : entity === "HALL" && i === 0 ? hall : id(n + 1000) }); }
  const now = new Date().toISOString();
  const coreSourceMembers = { parties, accounts: parties.filter(p => p.entity === "STAFF").map((p, i) => ({ id: i === 0 ? account : id(2000 + i), staff_id: p.nativeId,
    login_enabled: true, auth_version: 1 as const, version: 1 as const, created_at: now, updated_at: now })) };
  const configuration: ProductionRuntime26Configuration = { ...f.configuration,
    runtime26Review: { ...f.configuration.runtime26Review, trustedReviewSha256: createHash("sha256").update(body).digest("hex") },
    coreInitializationRead: { profile: "COMMITTED_CORE_SETTINGS_V14", batchId: id(3000), operationId: id(3001), coreSourceDigest: "c".repeat(64) } };
  return { ...f, configuration, coreSourceMembers };
}
test("production CORE v14: strict R1 configuration consumes only the exact committed binding; legacy and other provider profiles reject it", async () => {
  const f = coreProductionFixture(); try {
    const copy = parseProductionRuntime26Configuration(f.configuration); assert.deepEqual(copy, f.configuration);
    assert.notEqual(copy.coreInitializationRead, f.configuration.coreInitializationRead);
    assert.throws(() => parseProductionRuntimeConfiguration(f.configuration));
    assert.throws(() => parseProductionRuntime26R2Configuration({ ...r2Configuration(f.configuration), coreInitializationRead: f.configuration.coreInitializationRead }));
    assert.throws(() => parseProductionRuntime26R3Configuration({ ...r3Configuration(f.configuration, "/unopened"), coreInitializationRead: f.configuration.coreInitializationRead }));
    for (const core of [undefined, true, { ...f.configuration.coreInitializationRead, extra: true }, { ...f.configuration.coreInitializationRead, coreSourceDigest: "not-a-digest" },
      { ...f.configuration.coreInitializationRead, operationId: "not-an-id" }, { ...f.configuration.coreInitializationRead, profile: "ALL" }])
      assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, coreInitializationRead: core }));
    let allocations = 0;
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, currentForms: {} }, () => { allocations++; throw Error("must not allocate"); }));
    assert.equal(allocations, 0);
  } finally { f.cleanup(); }
});
test("production CORE v14: actual production factory retains legacy login and same-RR member proof with only auth and exact settings routes", async () => {
  const f = coreProductionFixture(), password = "123456", salt = "d".repeat(48);
  const wrapper = wrapTrustedLegacyCredential({ salt, hash: pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex") });
  let sourcesMatch = true, directoryRole = "ADMIN", insertedSessions = 0;
  const warehouse = f.coreSourceMembers.parties.find(p => p.entity === "WAREHOUSE")!.nativeId;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V14_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes("core-settings:committed-proof")) return [{ after_values: { coreSourceMembers: f.coreSourceMembers }, sources_match: sourcesMatch, claims_match: true }];
    if (sql.includes("core-settings:current-identity")) return [{ id: account, staff_id: f.coreSourceMembers.accounts[0]!.staff_id, login_enabled: true, role: directoryRole, employment_status: "在职", hall_id: hall, hall_enabled: true }];
    if (sql.includes("FROM naijue_erp.user_account a JOIN naijue_erp.staff s")) return [{ account_id: account, staff_id: f.coreSourceMembers.accounts[0]!.staff_id,
      login_name: "SYNTHETIC_CORE_LOGIN", password_hash: wrapper, login_enabled: true, auth_version: 1, role: "ADMIN", employment_status: "在职", hall_id: hall }];
    if (sql.includes("INSERT INTO naijue_erp.auth_session")) { insertedSessions++; return [{}]; }
    if (sql.includes("FROM naijue_erp.warehouse n")) {
      assert.equal(values[0], false); assert.equal((values[1] as string[]).length, 22); assert.ok((values[1] as string[]).includes(warehouse));
      assert.match(sql, /n\.id = ANY\(\$2::uuid\[\]\)/); assert.equal((values[3] as string[]).length, 22);
      return values[2] === warehouse ? [{ id: warehouse, name: "SYNTHETIC_CORE_WAREHOUSE", enabled: true, version: 1, hall_id: hall, hall_name: "SYNTHETIC_CORE_HALL" }] : [];
    }
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      assert.equal(api.app.server.listening, false); assert.equal(p.counts().allocations, 1);
      for (const url of ["/auth/login", "/auth/logout", "/auth/password", "/store-settings-read/stores/query", "/store-settings-read/stores/detail/query", "/store-settings-read/warehouses/query", "/store-settings-read/warehouses/detail/query"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), true, url);
      for (const url of ["/inventory/query", "/inventory/ledger/query", "/products/query", "/products/barcodes/query", "/sales/query", "/transfers/query", "/sales/commands", "/transfers/commands", "/products/v2/commands", "/current-form/products/query", "/imported-history/sales/query", "/imported-history/transfers/query", "/catalogue-settings-read/categories/tree/query"])
        assert.equal(api.app.hasRoute({ method: "POST", url }), false, url);
      const login = await api.app.inject({ method: "POST", url: "/auth/login", headers: { origin: PRODUCTION_PUBLIC_ORIGIN }, payload: { loginName: "SYNTHETIC_CORE_LOGIN", password } });
      assert.equal(login.statusCode, 200, login.body); assert.equal(insertedSessions, 1); assert.ok(!login.body.includes(password) && !login.body.includes(wrapper));
      const request = { method: "POST" as const, url: "/store-settings-read/warehouses/detail/query", headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` }, payload: { id: warehouse } };
      const response = await api.app.inject(request); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().item.id, warehouse);
      const data = p.calls.find(call => call.sql.includes("FROM naijue_erp.warehouse n"))!;
      const rr = p.calls.filter(call => call.lease === data.lease), start = rr.findIndex(call => call.sql.startsWith("BEGIN"));
      assert.match(rr[start]!.sql, /REPEATABLE READ/); assert.ok(rr.findIndex(call => call.sql.includes("core-settings:committed-proof")) > start);
      assert.ok(rr.findIndex(call => call.sql.includes("core-settings:committed-proof")) < rr.findIndex(call => call.sql.includes("FROM naijue_erp.warehouse n")));
      const before = p.calls.filter(call => call.sql.includes("FROM naijue_erp.warehouse n")).length;
      sourcesMatch = false; assert.equal((await api.app.inject(request)).statusCode, 403);
      sourcesMatch = true; directoryRole = "SALESPERSON"; assert.equal((await api.app.inject(request)).statusCode, 403);
      assert.equal(p.calls.filter(call => call.sql.includes("FROM naijue_erp.warehouse n")).length, before);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
test("production CORE v14: original exact26 main accepts the private CORE config and reaches metadata file loading before any database or listener", async () => {
  const f = coreProductionFixture(); try {
    const filename = join(pathDirectory(f.configuration.runtime26Review.reviewFile), "private-core-main.json");
    const missing = join(pathDirectory(filename), "missing-core-metadata-review.json");
    writeFileSync(filename, JSON.stringify({ ...f.configuration, runtime26Review: { ...f.configuration.runtime26Review, reviewFile: missing } }), { mode: 0o600 });
    await assert.rejects(runProductionRuntime26Main([realpathSync(filename)]), (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT");
  } finally { f.cleanup(); }
});

const approvedInventorySpool={directory:'/private/inventory-exports',maxBytes:536870912,maxConcurrent:1,maxDurationMs:120000} as const;
test('production inventory spool: exact bounded options traverse original profiles and remain mutually exclusive with CORE',()=>{
 const c={...config(),documentCommands:'DISABLED' as const,inventoryOutputSpool:approvedInventorySpool};
 assert.deepEqual(productionApplicationOptions(c).inventoryOutputSpool,approvedInventorySpool);
 const r1={...c,profile:'source-confirmed-native-exact26-r1-v1' as const,runtime26Review:{reviewFile:'/unopened-review.json',trustedReviewSha256:'a'.repeat(64)}};
 assert.deepEqual(parseProductionRuntime26Configuration(r1).inventoryOutputSpool,approvedInventorySpool);
 const r2={...r1,profile:'source-confirmed-native-exact26-r2-v1' as const,documentCommands:'NATIVE_RUNTIME' as const,existingPreparation:{sales:false,transfers:false}};
 assert.deepEqual(parseProductionRuntime26R2Configuration(r2).inventoryOutputSpool,approvedInventorySpool);
 assert.deepEqual(parseProductionRuntime26R3Configuration({...r2,profile:'source-confirmed-native-exact26-r3-v1',productMedia:{root:'/private/media',rootKey:'media'}}).inventoryOutputSpool,approvedInventorySpool);
 for(const value of [undefined,{...approvedInventorySpool,directory:'/tmp/unapproved'}, {...approvedInventorySpool,maxConcurrent:2},{...approvedInventorySpool,maxBytes:536870913},{...approvedInventorySpool,maxDurationMs:120001},{...approvedInventorySpool,unknown:true}])
  assert.throws(()=>parseProductionRuntimeConfiguration({...c,inventoryOutputSpool:value}));
 assert.throws(()=>parseProductionRuntime26Configuration({...r1,coreInitializationRead:{profile:'COMMITTED_CORE_SETTINGS_V14',batchId:'14000000-0000-4000-8000-000000003000',operationId:'14000000-0000-4000-8000-000000003001',coreSourceDigest:'c'.repeat(64)}}));
});
test('production inventory spool: existing plugin receives captured host resources, missing mount returns503 before producer and frees the one slot',async()=>{
 const original=fsPromises.lstat;let directoryChecks=0,allocations=0,ends=0,producerQueries=0;
 fsPromises.lstat=async function(...args:unknown[]){if(args[0]===approvedInventorySpool.directory){directoryChecks++;throw Object.assign(Error('SYNTHETIC_MISSING_MOUNT'),{code:'ENOENT'});}return Reflect.apply(original,fsPromises,args);} as typeof fsPromises.lstat;
 syncBuiltinESMExports();
 const token=Buffer.alloc(32,42).toString('base64url'),now=new Date().toISOString(),expires=new Date(Date.now()+60000).toISOString();
 const driver=Object.assign(new EventEmitter(),{async connect(){return Object.assign(new EventEmitter(),{async query(sql:string){
  let rows:Record<string,unknown>[]=[];
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)){}
  else if(sql.includes('FROM naijue_erp.auth_session'))rows=[{token_hash:sessionTokenHash(token),account_id:account,auth_version:1,created_at:now,expires_at:expires,revoked_at:null}];
  else if(sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s'))rows=[{account_id:account,staff_id:'00000000-0000-4000-8000-000000000003',login_name:'SYNTHETIC_ONLY',password_hash:'SYNTHETIC_UNUSED',login_enabled:true,auth_version:1,role:'ADMIN',employment_status:'在职',hall_id:null}];
  else{producerQueries++;throw Error('Output producer must not open without private mount');}
  return{rows,rowCount:rows.length};},release(){}});},async end(){ends++;}});
 let api:Awaited<ReturnType<typeof createProductionApplicationApi>>|undefined;
 try{
  const cfg={...config(),documentCommands:'DISABLED' as const,inventoryOutputSpool:{...approvedInventorySpool}};
  api=await createProductionApplicationApi(cfg,()=>{allocations++;return driver;});
  cfg.inventoryOutputSpool.directory='/tmp/caller-mutated-after-capture' as typeof approvedInventorySpool.directory;
  assert.equal(api.app.server.listening,false);assert.equal(allocations,1);assert.equal(api.app.hasRoute({method:'POST',url:'/inventory/output/query'}),true);
  for(let i=0;i<2;i++){
   const response: {statusCode:number;body:string;json():{error:{code:string}}}=await api.app.inject({method:'POST',url:'/inventory/output/query',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:`__Host-naijue_session=${token}`},payload:{}});
   assert.equal(response.statusCode,503,response.body);assert.equal(response.json().error.code,'INVENTORY_NOT_READY');assert.ok(!response.body.includes(approvedInventorySpool.directory));
  }
  assert.equal(directoryChecks,2);assert.equal(producerQueries,0);assert.equal(api.app.hasRoute({method:'POST',url:'/inventory/query'}),true);
 }finally{await api?.close();fsPromises.lstat=original;syncBuiltinESMExports();}
 assert.equal(ends,1);
});

function categoryProductionFixture(patchLevel: string, maintenance: boolean, core = false) {
  const f = core ? coreProductionFixture() : exact26Fixture();
  const review = JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile, 'utf8'));
  review.catalog.patchLevel = patchLevel;
  if (maintenance) review.purposes.push('PRODUCT_MAINTENANCE');
  const body = JSON.stringify(review); writeFileSync(f.configuration.runtime26Review.reviewFile, body, { mode: 0o600 });
  return { ...f, configuration: { ...f.configuration, runtime26Review: { ...f.configuration.runtime26Review,
    trustedReviewSha256: createHash('sha256').update(body).digest('hex') } } };
}
test('production v15 category: only precise reviewed maintenance mounts original CATEGORY routes; CORE and old profiles remain closed', async () => {
  for (const [patch, maintenance, core] of [
    ['26_v11_document_specification_save', true, false], ['26_v14_core_initialization', true, false],
    ['26_v15_category_order_undo', false, false], ['26_v15_category_order_undo', true, false], ['26_v15_category_order_undo', true, true]
  ] as const) {
    const f = categoryProductionFixture(patch, maintenance, core);
    const probe = patch.includes('v11') ? NATIVE_RUNTIME26_METADATA_PROBE : patch.includes('v14') ? NATIVE_RUNTIME26_V14_METADATA_PROBE : NATIVE_RUNTIME26_V15_METADATA_PROBE;
    const p = exact26Driver(f.observation, sql => sql === probe ? [structuredClone(f.observation)] : undefined);
    try {
      const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
      try {
        assert.equal(api.app.server.listening, false); assert.equal(p.counts().allocations, 1);
        const enabled = patch === '26_v15_category_order_undo' && maintenance && !core;
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/catalogue/categories/commands' }), enabled);
        assert.equal(api.app.hasRoute({ method: 'GET', url: '/catalogue/categories/receipts/:requestKey' }), enabled);
        for (const family of ['colors', 'fits']) assert.equal(api.app.hasRoute({ method: 'POST', url: `/catalogue/${family}/commands` }), false);
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/sales/commands' }), false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1);
    } finally { f.cleanup(); }
  }
});
test('production v15 category: original service adapter evidence same pool save exact replay and receipt use current role', async () => {
  const f = categoryProductionFixture('26_v15_category_order_undo', true), first = '00000000-0000-4000-8000-000000000010', last = '00000000-0000-4000-8000-000000000011';
  const siblings = [{ id: first, name: 'SYNTHETIC_FIRST', version: 7, parent_id: null, display_order: -10 }, { id: last, name: 'SYNTHETIC_LAST', version: 9, parent_id: null, display_order: 30 }];
  let role = 'ADMIN', receipt: Record<string, unknown> | undefined;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003',
      login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED_CREDENTIAL', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: role === 'SALESPERSON' ? hall : null }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:receipt')) return receipt ? [receipt] : [];
    if (sql.includes('category-order:siblings')) return structuredClone(siblings);
    if (sql.includes('maintenance:audit')) return [{}];
    if (sql.includes('category-order:update')) {
      const row = siblings.find(s => s.id === values[0]); assert.ok(row); assert.equal(row.version, values[3]); assert.equal(row.display_order, values[5]);
      row.display_order = values[1] as number; row.version = values[2] as number; return [{}];
    }
    if (sql.includes('maintenance:complete')) {
      const result = JSON.parse(values[7] as string);
      receipt = { id: values[0], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], result_data: result, completed_at: values[8] };
      return [{ result_data: result }];
    }
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      const payload = { action: 'REORDER', requestKey: 'production-v15-original-key', parentId: null, movedId: last,
        expectedSiblings: siblings.map(s => ({ id: s.id, expectedVersion: s.version })), orderedIds: [last, first] };
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const response = await api.app.inject({ method: 'POST', url: '/catalogue/categories/commands', headers, payload }); assert.equal(response.statusCode, 200, response.body);
      const result = response.json(); assert.deepEqual(result.order.members, [{ id: last, version: 10, displayOrder: 0 }, { id: first, version: 8, displayOrder: 1 }]);
      assert.equal(result.targetId, first); assert.equal(result.version, 8); assert.equal(result.kind, 'CATEGORY');
      const saveCalls = p.calls.filter(c => c.sql.includes('maintenance:complete') || c.sql.includes('maintenance:audit') || c.sql.includes('category-order:update'));
      assert.equal(new Set(saveCalls.map(c => c.lease)).size, 1); assert.equal(saveCalls.filter(c => c.sql.includes('maintenance:audit')).length, 1);
      assert.equal(saveCalls.filter(c => c.sql.includes('category-order:update')).length, 2); assert.equal(saveCalls.filter(c => c.sql.includes('maintenance:complete')).length, 1);
      role = 'WAREHOUSE'; const replay = await api.app.inject({ method: 'POST', url: '/catalogue/categories/commands', headers, payload });
      assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
      const recovered = await api.app.inject({ method: 'GET', url: '/catalogue/categories/receipts/production-v15-original-key', headers });
      assert.equal(recovered.statusCode, 200, recovered.body); assert.deepEqual(recovered.json().result, result);
      const recoveredLease = p.calls.at(-1)!.lease, recovery = p.calls.filter(c => c.lease === recoveredLease);
      const directory = recovery.findIndex(c => c.values[0] === 'naijue:catalogue-maintenance'), identity = recovery.findIndex(c => c.sql.includes('maintenance:identity'));
      assert.ok(directory >= 0 && directory < identity); // Actual D2 adapter's readiness requires this order.
      const writes = p.calls.filter(c => c.sql.includes('category-order:update')).length;
      const conflict = await api.app.inject({ method: 'POST', url: '/catalogue/categories/commands', headers, payload: { ...payload, movedId: first } }); assert.equal(conflict.statusCode, 409, conflict.body);
      role = 'SALESPERSON'; const denied = await api.app.inject({ method: 'POST', url: '/catalogue/categories/commands', headers, payload }); assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(p.calls.filter(c => c.sql.includes('category-order:update')).length, writes);
      assert.equal(p.counts().allocations, 1); assert.equal(api.app.server.listening, false);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});

function coreAuditHostFixture() {
  const f = coreProductionFixture(), staff = f.coreSourceMembers.accounts[0]!.staff_id;
  const warehouse = f.coreSourceMembers.parties.find(p => p.entity === 'WAREHOUSE')!.nativeId;
  const state = { role: 'ADMIN', sources: true, claims: true, member: true, failPage: false };
  const id = (i: number) => `16000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V14_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('maintenance:administrator-lock')) return [];
    if (sql.includes('core-settings:committed-proof')) return [{ after_values: { coreSourceMembers: f.coreSourceMembers }, sources_match: state.sources, claims_match: state.claims }];
    if (sql.includes('core-settings:current-identity')) return [{ id: account, staff_id: state.member ? staff : id(900), login_enabled: true,
      role: state.role, employment_status: '在职', hall_id: hall, hall_enabled: true }];
    if (sql.includes('settings-audit:role')) return [{ account_id: account, role: state.role }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s')) return [{ account_id: account, staff_id: state.member ? staff : id(900),
      login_name: 'SYNTHETIC_CORE_ACTOR', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role: state.role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('settings-audit:page')) {
      if (state.failPage) throw Error('SYNTHETIC_AUDIT_QUERY_FAILURE');
      const modules = values[0] as string[], selected = values[1] as string | null;
      const memberArrays = values.slice(9) as string[][];
      assert.equal(memberArrays.length, modules.length); for (const ids of memberArrays) assert.equal(ids.length, 22);
      assert.ok(modules.every(m => m === 'HALL' || m === 'WAREHOUSE'));
      assert.doesNotMatch(sql, /SELECT '(?:PRODUCT|STAFF|ACCOUNT|CUSTOMER)'::text AS module/);
      assert.match(sql, /WHERE id=ANY\(\$10::uuid\[\]\)/);
      assert.match(sql, /count\(\*\)::text FROM matched/); assert.match(sql, /ORDER BY occurred_at DESC NULLS LAST,id DESC LIMIT \$8 OFFSET \$9/);
      const absent = selected !== null && !memberArrays.some(ids => ids.includes(selected));
      const count = absent ? 0 : values[8] === 20 ? 3 : 1;
      const items = Array.from({ length: count }, (_, i) => ({ id: id(i + 1), operation_id: id(i + 20), module: modules[0],
        object_id: selected ?? hall, object_name: '%_中文 SYNTHETIC_CORE_OBJECT', object_code: null, actor_account_id: account, actor_staff_id: staff,
        actor_name: 'SYNTHETIC_CORE_ACTOR', actor_login_name: 'SYNTHETIC_CORE_ACTOR', action: 'EDIT', old_version: i + 1, new_version: i + 2,
        occurred_at: '2026-10-24T01:00:00.123456Z', before_values: { name: 'SYNTHETIC_OLD' }, after_values: { name: 'SYNTHETIC_NEW' }, credential_actions: [] }));
      return [{ total: absent ? '0' : values[8] === 20 ? '23' : '1', items, too_large: false }];
    }
    return undefined;
  });
  const payload = { module: 'ALL', objectId: null as string | null, objectSearch: '%_中文', actorSearch: 'SYNTHETIC', action: 'EDIT',
    dateFrom: '2026-10-01', dateTo: '2026-10-24', page: 2, pageSize: 20 };
  return { f, p, state, warehouse, payload, headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` } };
}
test('production CORE audit: original endpoint binds committed members current role and exact filtered count/page on one maintenance lease', async () => {
  const { f, p, state, warehouse, payload, headers } = coreAuditHostFixture();
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      assert.equal(api.app.hasRoute({ method: 'POST', url: '/settings/audit/query' }), true); assert.equal(api.app.server.listening, false);
      const response = await api.app.inject({ method: 'POST', url: '/settings/audit/query', headers, payload }); assert.equal(response.statusCode, 200, response.body);
      const page = response.json(); assert.equal(page.total, 23); assert.equal(page.page, 2); assert.equal(page.items.length, 3);
      assert.deepEqual(page.items[0].changes, [{ field: 'name', label: '名称', before: { state: 'VALUE', value: 'SYNTHETIC_OLD' }, after: { state: 'VALUE', value: 'SYNTHETIC_NEW' } }]);
      assert.equal(page.items[0].occurredAt, '2026-10-24T01:00:00.123456Z');
      const data = p.calls.find(c => c.sql.includes('settings-audit:page'))!, calls = p.calls.filter(c => c.lease === data.lease);
      assert.deepEqual(data.values.slice(0, 9), [['HALL', 'WAREHOUSE'], null, '%_中文', 'SYNTHETIC', 'EDIT', '2026-10-01', '2026-10-24', 20, 20]);
      const at = (tag: string) => calls.findIndex(c => c.sql.includes(tag));
      assert.ok(at('maintenance:administrator-lock') < at('maintenance:identity'));
      assert.ok(at('maintenance:identity') < at('core-settings:committed-proof') && at('core-settings:current-identity') < at('settings-audit:page'));
      assert.equal(calls.filter(c => c.sql.includes('settings-audit:page')).length, 1); assert.equal(calls.at(-1)!.sql, 'COMMIT');
      assert.ok(calls.some(c => c.sql === NATIVE_RUNTIME26_V14_METADATA_PROBE));
      assert.ok(!response.body.includes('coreSourceMembers') && !response.body.includes('password') && !response.body.includes(f.configuration.coreInitializationRead!.coreSourceDigest));
      state.role = 'WAREHOUSE';
      const single = await api.app.inject({ method: 'POST', url: '/settings/audit/query', headers,
        payload: { ...payload, module: 'WAREHOUSE', objectId: warehouse, objectSearch: '', actorSearch: '', page: 1 } });
      assert.equal(single.statusCode, 200, single.body); assert.equal(single.json().total, 1); assert.equal(single.json().items[0].object.id, warehouse);
      assert.equal(p.counts().allocations, 1);
      for (const url of ['/settings/audit/commands', '/catalogue/categories/commands', '/products/v2/commands', '/inventory/query', '/sales/commands', '/current-form/products/query'])
        assert.equal(api.app.hasRoute({ method: 'POST', url }), false, url);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});
test('production CORE audit: source claim actor and module failures deny before page SQL; genuine absent scope and SQL errors are not fabricated success', async () => {
  const { f, p, state, payload, headers } = coreAuditHostFixture();
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      const request = (body: Record<string, unknown> = payload) => api.app.inject({ method: 'POST', url: '/settings/audit/query', headers, payload: body });
      const before = p.calls.filter(c => c.sql.includes('settings-audit:page')).length;
      for (const field of ['sources', 'claims', 'member'] as const) { state[field] = false; const denied = await request(); assert.equal(denied.statusCode, 403, denied.body); state[field] = true; }
      state.role = 'SALESPERSON'; assert.equal((await request()).statusCode, 403); state.role = 'ADMIN';
      for (const module of ['PRODUCT', 'CUSTOMER', 'ACCOUNT']) assert.equal((await request({ ...payload, module })).statusCode, 403);
      assert.equal(p.calls.filter(c => c.sql.includes('settings-audit:page')).length, before);
      const unauthenticated = await api.app.inject({ method: 'POST', url: '/settings/audit/query', headers: { origin: PRODUCTION_PUBLIC_ORIGIN }, payload }); assert.equal(unauthenticated.statusCode, 401);
      const absent = await request({ ...payload, module: 'HALL', objectId: '16000000-0000-4000-8000-000000009999', page: 1 });
      assert.equal(absent.statusCode, 200, absent.body); assert.deepEqual(absent.json(), { total: 0, items: [], page: 1, pageSize: 20 });
      assert.equal(p.calls.filter(c => c.sql.includes('settings-audit:page')).length, before + 1);
      state.failPage = true; const failure = await request(); assert.equal(failure.statusCode, 500, failure.body); assert.ok(!failure.body.includes('SYNTHETIC_AUDIT_QUERY_FAILURE'));
      assert.ok(!p.calls.some(c => /^\s*(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
    } finally { await api.close(); }
  } finally { f.cleanup(); }
});
