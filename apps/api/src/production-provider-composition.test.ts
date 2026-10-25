import fsPromises from "node:fs/promises";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { createNodeCredentialRequestTag } from "../../../packages/authentication/src/passwords.ts";
import { requestHash } from "../../../packages/application/src/request-hash.ts";
import { syncBuiltinESMExports } from "node:module";
import sharp from "sharp";
import { realpathSync } from "node:fs";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { sessionTokenHash } from "../../../packages/authentication/src/service.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createProductionApplicationApi, createProductionRuntime26ApplicationApi, parseProductionRuntimeConfiguration, parseProductionRuntime26Configuration, productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import { createProductionRuntime26HistoryRevisionApplicationApi } from "./production-provider-composition.ts";
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
    for (const path of ["/imported-history/sales/revise", "/imported-history/transfers/revise"]) assert.equal(api.app.hasRoute({ method: "POST", url: path }), false);
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
      assert.deepEqual((await transfer).scope, { kind: "TRANSFER_HALL_IDS", hallIds: [hall] });
      for (const attempt of [directory, partyList]) await assert.rejects(attempt, { code: "FORBIDDEN" });
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

test("production B07 host: explicit write authorization and full read application are required before pool allocation", async () => {
  const f = exact26Fixture(); let allocations = 0;
  const driver = () => { allocations++; throw Error("must not allocate"); };
  const policy = { authorization: { async authorize(): Promise<never> { throw Error("not a request"); } } };
  try {
    for (const bad of [{}, { authorization: {} }, { authorization: { authorize: true } }, { ...policy, store: {} }])
      await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, bad as never, driver), TypeError);
    const getter = Object.defineProperty({}, "authorization", { enumerable: true, get() { throw Error("must not read accessor"); } });
    await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, getter as never, driver), TypeError);
    await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi({ ...f.configuration,
      coreInitializationRead: { profile: "COMMITTED_CORE_SETTINGS_V14", batchId: account, operationId: account, coreSourceDigest: "c".repeat(64) } }, policy, driver), TypeError);
    assert.equal(allocations, 0);
  } finally { f.cleanup(); }
});

test("production B07 host: read-only runtime metadata cannot enable HISTORY writes and the original owned pool closes", async () => {
  const f = categoryProductionFixture("26_v11_document_specification_save", false), p = exact26Driver(f.observation); let authorizationCalls = 0;
  try {
    await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, {
      authorization: { async authorize(): Promise<never> { authorizationCalls++; throw Error("not a request"); } }
    }, p.factory), { code: "NATIVE_RUNTIME26_NOT_READY" });
    const counts = p.counts(); assert.equal(counts.allocations, 1); assert.equal(counts.ends, 1);
    assert.equal(counts.connects, counts.releases); assert.equal(authorizationCalls, 0);
    assert.ok(p.calls.some(call => call.sql === NATIVE_RUNTIME26_METADATA_PROBE));
    assert.equal(p.calls.filter(call => /^(BEGIN|INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(call.sql)
      || call.sql.includes("history-revise:")).length, 0);
  } finally { f.cleanup(); }
});
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
test('production v15 category: original category-only mounting remains tied to the precise reviewed issuer', async () => {
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
        // The original host registers the reviewed CATEGORY plugin before CORE's
        // read branch. Keep that existing behavior; full maintenance is separate.
        const enabled = patch === '26_v15_category_order_undo' && maintenance;
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

import {NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE as V16HistoryProbe} from '../../../adapters/postgres/src/native-import-accounting-capability.ts';
test('v16 B07 production host: exact HISTORY successor mounts original protected routes without enabling LIVE commands',async()=>{
 const f=categoryProductionFixture('26_v16_history_responsible_from_v14',false);
 const review=JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile,'utf8'));review.purposes.push('HISTORY_REVISION');
 const body=JSON.stringify(review);writeFileSync(f.configuration.runtime26Review.reviewFile,body,{mode:0o600});
 const config={...f.configuration,runtime26Review:{...f.configuration.runtime26Review,trustedReviewSha256:createHash('sha256').update(body).digest('hex')}};
 const p=exact26Driver(f.observation,sql=>sql===V16HistoryProbe?[structuredClone(f.observation)]:undefined);let grants=0;
 const api=await createProductionRuntime26HistoryRevisionApplicationApi(config,{authorization:{async authorize(actor,command){grants++;return{dataset:'HISTORY',kind:command.kind,documentId:command.documentId,actorAccountId:actor.accountId};}}},p.factory);
 try{
  for(const path of ['/imported-history/sales/revise','/imported-history/transfers/revise']){
   assert.equal(api.app.hasRoute({method:'POST',url:path}),true);
   assert.equal((await api.app.inject({method:'POST',url:path,headers:{origin:PRODUCTION_PUBLIC_ORIGIN},payload:{}})).statusCode,401);
   assert.equal((await api.app.inject({method:'POST',url:path,headers:{origin:'https://foreign.invalid'},payload:{}})).statusCode,401);
  }
  assert.equal(api.app.hasRoute({method:'POST',url:'/sales/commands'}),false);assert.equal(api.app.hasRoute({method:'POST',url:'/transfers/commands'}),false);assert.equal(api.app.server.listening,false);assert.equal(grants,0);
 }finally{await api.close();f.cleanup();}
 assert.equal(p.counts().allocations,1);assert.equal(p.counts().ends,1);assert.equal(p.counts().connects,p.counts().releases);
});

test('production CORE read modules: explicit private selection rejects duplicates unsupported and unbound values before pool creation', async () => {
  const f = coreProductionFixture();
  try {
    const selected = { ...f.configuration, coreReadModules: ['organization', 'customers', 'catalogue'] as const };
    assert.deepEqual(parseProductionRuntime26Configuration(selected).coreReadModules, selected.coreReadModules);
    assert.equal(parseProductionRuntime26Configuration(f.configuration).coreReadModules, undefined);
    for (const modules of [undefined, null, true, ['customers', 'customers'], ['suppliers'], ['payment'], ['catalogue', 'history']]) {
      let allocations = 0;
      await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, coreReadModules: modules }, () => { allocations++; throw Error('NO_POOL'); }), TypeError);
      assert.equal(allocations, 0);
    }
    const { coreInitializationRead: _core, ...withoutCore } = f.configuration;
    assert.throws(() => parseProductionRuntime26Configuration({ ...withoutCore, coreReadModules: [] }), TypeError);
    assert.throws(() => parseProductionRuntimeConfiguration(selected), TypeError);
  } finally { f.cleanup(); }
});

test('production CORE read modules: selected normal HTTP reads use original member and CREATE proof before count/page; staged roots and unselected modules remain hidden', async () => {
  const f = coreProductionFixture(), staff = f.coreSourceMembers.accounts[0]!.staff_id;
  const warehouse = f.coreSourceMembers.parties.find(p => p.entity === 'WAREHOUSE')!.nativeId;
  const customer = f.coreSourceMembers.parties.find(p => p.entity === 'CUSTOMER')!.nativeId;
  const maintained = '14000000-0000-4000-8000-000000008001', staged = '14000000-0000-4000-8000-000000009999';
  let sourcesMatch = true, role = 'ADMIN', proofRole: string | null = null;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V14_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('core-settings:committed-proof')) return [{ after_values: { coreSourceMembers: f.coreSourceMembers }, sources_match: sourcesMatch, claims_match: true }];
    if (sql.includes('core-settings:current-identity')) return [{ id: account, staff_id: staff, login_enabled: true, role: proofRole ?? role, employment_status: '在职', hall_id: hall, hall_enabled: true }];
    if (sql.includes('maintenance:identity') || sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s')) return [{ account_id: account, staff_id: staff, login_name: 'SYNTHETIC_CORE_READ', password_hash: 'UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:administrator-lock')) return [];
    if (sql.startsWith('WITH matched')) {
      assert.match(sql, /m\.id=ANY\(\$7::uuid\[\]\)/); assert.equal((values[6] as string[]).length, 22); assert.ok(!(values[6] as string[]).includes(staged));
      assert.match(sql, /m\.hall_id=ANY\(\$8::uuid\[\]\)/);
      return [{ total: '1', items: [{ kind: 'WAREHOUSE', id: warehouse, version: 1, createdAt: null, updatedAt: null, name: 'SYNTHETIC_CORE_WAREHOUSE', enabled: true, hall: { id: hall, name: 'SYNTHETIC_CORE_HALL', enabled: true } }] }];
    }
    if (sql.includes('core-settings:maintained-roots')) {
      assert.match(sql, /a\.action='CREATE'/); assert.match(sql, /r\.status='COMMITTED'/); assert.match(sql, /a\.actor_account_id=ANY\(\$2::uuid\[\]\)/);
      assert.equal((values[1] as string[]).length, 49); return [{ id: maintained }];
    }
    if (sql.includes('FROM naijue_erp.customer WHERE')) {
      assert.match(sql, /id=ANY\(\$3::uuid\[\]\)/); assert.equal((values[2] as string[]).length, 22); assert.ok(!(values[2] as string[]).includes(staged));
      return sql.includes('count(*)') ? [{ total: '1' }] : [{ id: customer, code: 'ORIGINAL', name: 'SYNTHETIC_CORE_CUSTOMER', enabled: true, version: 1, created_at: null, updated_at: null }];
    }
    if (sql.includes('FROM naijue_erp.color WHERE')) {
      assert.match(sql, /id=ANY\(\$2::uuid\[\]\)/); assert.deepEqual(values[1], [maintained]);
      return sql.includes('count(*)') ? [{ total: '1' }] : [{ id: maintained, code: 'ORIGINAL_COLOR', name: 'SYNTHETIC_MAINTAINED', enabled: true, version: 1 }];
    }
    if (sql.includes('FROM naijue_erp.product_category WHERE')) {
      assert.match(sql, /id=ANY\(\$1::uuid\[\]\)/); assert.deepEqual(values[0], [maintained]);
      return sql.includes('count(*)') ? [{ total: '1' }] : [{ id: maintained, parent_id: null, name: 'SYNTHETIC_MAINTAINED', display_order: 0, version: 1 }];
    }
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, coreReadModules: ['organization', 'customers', 'catalogue'] }, p.factory);
    try {
      for (const path of ['/organization/halls', '/organization/warehouses', '/staff', '/accounts']) for (const suffix of ['/query', '/detail/query']) assert.equal(api.app.hasRoute({ method: 'POST', url: path + suffix }), true);
      for (const path of ['/payment/methods/query', '/payment/accounts/query', '/inventory/query', '/products/query', '/sales/query', '/transfers/query', '/imported-history/sales/query', '/current-form/products/query', '/dictionary-read/seasons/query']) assert.equal(api.app.hasRoute({ method: 'POST', url: path }), false);
      assert.equal(api.app.hasRoute({ method: 'GET', url: '/suppliers' }), false);
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const requests = [
        { method: 'POST' as const, url: '/organization/warehouses/query', payload: { search: '', status: 'all', hallId: null, page: 1, pageSize: 20 } },
        { method: 'GET' as const, url: '/customers?search=&enabled=ALL&page=1&pageSize=20' },
        { method: 'POST' as const, url: '/catalogue-settings-read/colors/query', payload: { search: '', page: 1, pageSize: 20 } },
        { method: 'POST' as const, url: '/catalogue-settings-read/categories/query', payload: {} }
      ] as const;
      for (const request of requests) {
        const response = await api.app.inject({ ...request, headers }); assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.headers['cache-control'], 'no-store'); assert.ok(!response.body.includes(staged)); assert.equal(response.json().total, 1);
        if (request.url.includes('/categories/')) assert.equal(response.json().items[0].productCount, null);
      }
      const business = () => p.calls.filter(c => c.sql.startsWith('WITH matched') || /FROM naijue_erp\.(customer|color|product_category) WHERE/.test(c.sql));
      for (const data of business()) {
        const lease = p.calls.filter(c => c.lease === data.lease), start = lease.findIndex(c => c.sql.startsWith('BEGIN'));
        assert.ok(start >= 0); assert.ok(lease.findIndex(c => c.sql.includes('core-settings:committed-proof')) > start);
        assert.ok(lease.findIndex(c => c.sql.includes('core-settings:current-identity')) < lease.indexOf(data));
        if (!data.sql.startsWith('WITH matched')) assert.match(lease[start]!.sql, /REPEATABLE READ READ ONLY/);
      }
      assert.ok(!p.calls.some(c => /FROM naijue_erp\.product(?:\s|$)/.test(c.sql)));
      let before = business().length; sourcesMatch = false;
      for (const request of requests) assert.equal((await api.app.inject({ ...request, headers })).statusCode, 403);
      assert.equal(business().length, before); sourcesMatch = true; role = 'WAREHOUSE';
      assert.equal((await api.app.inject({ method: 'POST', url: '/staff/query', headers, payload: requests[0]!.payload })).statusCode, 403);
      assert.equal(business().length, before); role = 'ADMIN'; proofRole = 'WAREHOUSE';
      assert.equal((await api.app.inject({ method: 'POST', url: '/staff/query', headers, payload: requests[0]!.payload })).statusCode, 403);
      assert.equal(business().length, before); proofRole = null; role = 'SALESPERSON';
      assert.equal((await api.app.inject({ ...requests[0]!, headers })).statusCode, 403);
      assert.equal((await api.app.inject({ ...requests[1]!, headers })).statusCode, 403);
      assert.equal((await api.app.inject({ method: 'GET', url: '/customers/candidates?search=&page=1&pageSize=20', headers })).statusCode, 200);
      assert.equal((await api.app.inject({ ...requests[2]!, headers })).statusCode, 200);
      assert.equal(api.app.server.listening, false);
    } finally { await api.close(); }
    assert.equal(p.counts().allocations, 1); assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, p.counts().releases);
  } finally { f.cleanup(); }
});


test('production catalogue explicit opt-in mounts CATEGORY COLOR FIT with CORE or full reads; no credential borrows no command lease', async () => {
  for (const core of [false, true]) {
    const f = categoryProductionFixture('26_v15_category_order_undo', true, core);
    const p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    try {
      const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, catalogueMaintenance: true }, p.factory);
      try {
        const before = p.counts().connects;
        for (const family of ['categories', 'colors', 'fits']) {
          assert.ok(api.app.hasRoute({ method: 'POST', url: `/catalogue/${family}/commands` }));
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/catalogue/${family}/receipts/:requestKey` }));
          const response = await api.app.inject({ method: 'POST', url: `/catalogue/${family}/commands`, payload: {} });
          assert.equal(response.statusCode, 401, response.body);
        }
        assert.equal(p.counts().connects, before);
        assert.equal(api.app.server.listening, false);
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/sales/commands' }), false);
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/products/v2/commands' }), false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1);
    } finally { f.cleanup(); }
  }
});

test('production catalogue selector is exact and a read-only review cannot grant maintenance', async () => {
  const f = categoryProductionFixture('26_v15_category_order_undo', false, true);
  try {
    for (const value of [false, null, {}, 'true', undefined]) assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, catalogueMaintenance: value }), TypeError);
    assert.throws(() => parseProductionRuntimeConfiguration({ ...config(), catalogueMaintenance: true }), TypeError);
    const p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, catalogueMaintenance: true }, p.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});

test('production catalogue original committed keys recover and replay without writes; changed keys and current role remain enforced', async () => {
  const f = categoryProductionFixture('26_v15_category_order_undo', true, true);
  let role = 'ADMIN', revokeAfterReceipt = false, changedMetadata = false;
  const records = new Map<string, Record<string, unknown>>();
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [{ ...structuredClone(f.observation), ...(changedMetadata ? { catalog_sha256: 'b'.repeat(64) } : {}) }];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s') || sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003',
      login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:receipt')) { if (revokeAfterReceipt) changedMetadata = true; return records.has(values[1] as string) ? [records.get(values[1] as string)!] : []; }
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, catalogueMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      for (const [kind, family] of [['CATEGORY', 'categories'], ['COLOR', 'colors'], ['FIT', 'fits']] as const) {
        const command = { action: 'CREATE', requestKey: `synthetic-existing-${kind}`, values: kind === 'CATEGORY'
          ? { name: 'SYNTHETIC_CATEGORY', parentId: null, displayOrder: 0 }
          : { name: `SYNTHETIC_${kind}`, code: kind === 'FIT' ? 'Z' : 'SYNTHETIC01', enabled: true } };
        const result = { operationId: '00000000-0000-4000-8000-000000000081', kind, targetId: '00000000-0000-4000-8000-000000000082', version: 1 };
        records.set(command.requestKey, { id: result.operationId, action: 'CREATE', target_type: kind, target_id: result.targetId,
          request_hash: requestHash({ actorAccountId: account, kind, command }), result_data: result, completed_at: '2026-10-25T00:00:00.000000Z' });
        const replay = await api.app.inject({ method: 'POST', url: `/catalogue/${family}/commands`, headers, payload: command });
        assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
        const recovery = await api.app.inject({ method: 'GET', url: `/catalogue/${family}/receipts/${command.requestKey}`, headers });
        assert.equal(recovery.statusCode, 200, recovery.body); assert.deepEqual(recovery.json().result, result);
        const lease = p.calls.at(-1)!.lease, calls = p.calls.filter(c => c.lease === lease);
        const begin = calls.findIndex(c => c.sql.startsWith('BEGIN'));
        const receipt = calls.findIndex(c => c.sql.includes('maintenance:receipt'));
        const probes = calls.map((c, i) => c.sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? i : -1).filter(i => i >= 0);
        assert.ok(probes.some(i => i > begin && i < receipt)); assert.ok(probes.some(i => i > receipt));
        assert.equal(calls.at(-1)!.sql, 'COMMIT');
        const conflict = await api.app.inject({ method: 'POST', url: `/catalogue/${family}/commands`, headers,
          payload: { ...command, values: { ...command.values, name: 'CHANGED' } } });
        assert.equal(conflict.statusCode, 409, conflict.body);
        role = 'SALESPERSON';
        const denied = await api.app.inject({ method: 'GET', url: `/catalogue/${family}/receipts/${command.requestKey}`, headers });
        assert.equal(denied.statusCode, 403, denied.body); role = 'ADMIN';
      }
      assert.ok(p.calls.every(c => !/^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
      revokeAfterReceipt = true;
      const rejected = await api.app.inject({ method: 'GET', url: '/catalogue/colors/receipts/synthetic-existing-COLOR', headers });
      assert.equal(rejected.statusCode, 500, rejected.body);
      const revokedLease = p.calls.at(-1)!.lease, revokedCalls = p.calls.filter(c => c.lease === revokedLease);
      assert.ok(revokedCalls.some(c => c.sql.includes('maintenance:receipt')));
      assert.equal(revokedCalls.at(-1)!.sql, 'ROLLBACK');
      assert.ok(revokedCalls.every(c => c.sql !== 'COMMIT'));
      assert.equal(p.counts().allocations, 1);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});

test('production payment opt-in mounts only original payment reads commands and receipts; exact selector and reviewed purpose required', async () => {
  for (const core of [false, true]) {
    const f = categoryProductionFixture('26_v15_category_order_undo', true, core);
    const p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    try {
      for (const value of [false, null, {}, 'true', undefined]) assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, paymentMaintenance: value }), TypeError);
      assert.throws(() => parseProductionRuntimeConfiguration({ ...config(), paymentMaintenance: true }), TypeError);
      const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, paymentMaintenance: true }, p.factory);
      try {
        const before = p.counts().connects;
        for (const family of ['methods', 'accounts']) {
          for (const path of ['commands', 'query', 'detail/query']) {
            const url = `/payment/${family}/${path}`;
            assert.ok(api.app.hasRoute({ method: 'POST', url }));
            const response = await api.app.inject({ method: 'POST', url, payload: {} });
            assert.equal(response.statusCode, 401, response.body);
          }
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/payment/${family}/receipts/:requestKey` }));
        }
        assert.equal(p.counts().connects, before);
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/catalogue/colors/commands' }), false);
        for (const url of ['/sales/commands', '/products/v2/commands', '/customers/commands', '/staff/commands']) assert.equal(api.app.hasRoute({ method: 'POST', url }), false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1);
    } finally { f.cleanup(); }
  }
  const closed = categoryProductionFixture('26_v15_category_order_undo', false, true);
  const p = exact26Driver(closed.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(closed.observation)] : undefined);
  try {
    const api = await createProductionRuntime26ApplicationApi(closed.configuration, p.factory);
    try { assert.equal(api.app.hasRoute({ method: 'POST', url: '/payment/accounts/commands' }), false); }
    finally { await api.close(); }
    const denied = exact26Driver(closed.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(closed.observation)] : undefined);
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...closed.configuration, paymentMaintenance: true }, denied.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(denied.counts().ends, 1);
  } finally { closed.cleanup(); }
});

test('production payment original provider saves two-hall account with prepared audit then exact receipt and replay on its one pool', async () => {
  const f = categoryProductionFixture('26_v15_category_order_undo', true, true);
  const secondHall = '00000000-0000-4000-8000-000000000094';
  const receipts = new Map<string, Record<string, unknown>>();
  let role = 'ADMIN', metadataChanged = false, revokeAfterReceipt = false;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [{ ...structuredClone(f.observation), ...(metadataChanged ? { catalog_sha256: 'b'.repeat(64) } : {}) }];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s') || sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003',
      login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:receipt')) { if (revokeAfterReceipt) metadataChanged = true; return receipts.has(values[1] as string) ? [receipts.get(values[1] as string)!] : []; }
    if (sql.startsWith('SELECT id,name,enabled,version')) return [];
    if (sql.startsWith('SELECT id,enabled FROM naijue_erp.payment_method')) return [{ id: values[0], enabled: true }];
    if (sql.startsWith('SELECT id,enabled FROM naijue_erp.hall')) return (values[0] as string[]).map(id => ({ id, enabled: true }));
    if (sql.includes('maintenance:audit')) return [{}];
    if (sql.startsWith('INSERT INTO naijue_erp.payment_account_hall')) return (values[1] as string[]).map(() => ({}));
    if (sql.startsWith('INSERT INTO naijue_erp.payment_')) return [{}];
    if (sql.includes('maintenance:complete')) {
      const result = JSON.parse(values[7] as string) as Record<string, unknown>;
      receipts.set(values[2] as string, { id: values[0], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], result_data: result, completed_at: values[8] });
      return [{ result_data: result }];
    }
    if (sql.startsWith('WITH matched AS')) return [{ total: '0', items: [] }];
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, paymentMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const methodCommand = { action: 'CREATE', requestKey: 'synthetic-host-payment-method', values: { name: 'SYNTHETIC_METHOD', enabled: true } };
      const method = await api.app.inject({ method: 'POST', url: '/payment/methods/commands', headers, payload: methodCommand });
      assert.equal(method.statusCode, 200, method.body);
      const accountCommand = { action: 'CREATE', requestKey: 'synthetic-host-payment-account', values: { name: 'SYNTHETIC_ACCOUNT', enabled: true, paymentMethodId: method.json().targetId as string, hallIds: [secondHall, hall] } };
      const saved = await api.app.inject({ method: 'POST', url: '/payment/accounts/commands', headers, payload: accountCommand });
      assert.equal(saved.statusCode, 200, saved.body);
      const writes = () => p.calls.filter(c => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)).length;
      const savedWrites = writes(), savedLease = p.calls.at(-1)!.lease, calls = p.calls.filter(c => c.lease === savedLease);
      const audit = calls.findIndex(c => c.sql.includes('maintenance:audit'));
      const root = calls.findIndex(c => c.sql.startsWith('INSERT INTO naijue_erp.payment_account('));
      const links = calls.findIndex(c => c.sql.startsWith('INSERT INTO naijue_erp.payment_account_hall'));
      const completion = calls.findIndex(c => c.sql.includes('maintenance:complete'));
      assert.ok(audit >= 0 && root > audit && links > root && completion > links);
      assert.deepEqual(calls[links]!.values, [saved.json().targetId, [hall, secondHall].sort()]);
      assert.deepEqual(JSON.parse(calls[audit]!.values[8] as string).payment_halls.map((link: { hall_id: string }) => link.hall_id), [hall, secondHall].sort());
      assert.ok(calls.slice(completion + 1).some(c => c.sql === NATIVE_RUNTIME26_V15_METADATA_PROBE));
      assert.equal(calls.at(-1)!.sql, 'COMMIT');
      for (const [family, command, result] of [['methods', methodCommand, method.json()], ['accounts', accountCommand, saved.json()]] as const) {
        const replay = await api.app.inject({ method: 'POST', url: `/payment/${family}/commands`, headers, payload: command });
        assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
        const recovered = await api.app.inject({ method: 'GET', url: `/payment/${family}/receipts/${command.requestKey}`, headers });
        assert.equal(recovered.statusCode, 200, recovered.body); assert.deepEqual(recovered.json().result, result);
        const conflict = await api.app.inject({ method: 'POST', url: `/payment/${family}/commands`, headers, payload: { ...command, values: { ...command.values, name: 'DIFFERENT' } } });
        assert.equal(conflict.statusCode, 409, conflict.body);
      }
      assert.equal(writes(), savedWrites);
      const query = { search: '%_中文', status: 'all', hallId: secondHall, paymentMethodId: method.json().targetId as string, page: 1, pageSize: 20 };
      const page = await api.app.inject({ method: 'POST', url: '/payment/accounts/query', headers, payload: query });
      assert.equal(page.statusCode, 200, page.body);
      const querySql = p.calls.findLast(c => c.sql.startsWith('WITH matched AS'))!;
      assert.match(querySql.sql, /payment_account_hall link WHERE link.payment_account_id=m.id AND link.hall_id=\$3::uuid/);
      assert.match(querySql.sql, /m.payment_method_id=\$7::uuid/);
      assert.equal(querySql.values[0], '%_中文'); assert.equal(querySql.values[2], secondHall); assert.equal(querySql.values[6], method.json().targetId);
      role = 'SALESPERSON';
      for (const [httpMethod, url, payload] of [['GET', '/payment/accounts/receipts/synthetic-host-payment-account', undefined], ['POST', '/payment/accounts/commands', accountCommand], ['POST', '/payment/accounts/query', query]] as const) {
        const denied = await api.app.inject({ method: httpMethod, url, headers, ...(payload === undefined ? {} : { payload }) });
        assert.equal(denied.statusCode, 403, denied.body);
      }
      assert.equal(writes(), savedWrites); role = 'ADMIN'; revokeAfterReceipt = true;
      const revoked = await api.app.inject({ method: 'GET', url: '/payment/accounts/receipts/synthetic-host-payment-account', headers });
      assert.equal(revoked.statusCode, 500, revoked.body);
      const revokedLease = p.calls.at(-1)!.lease, revokedCalls = p.calls.filter(c => c.lease === revokedLease);
      assert.equal(revokedCalls.at(-1)!.sql, 'ROLLBACK'); assert.ok(revokedCalls.every(c => c.sql !== 'COMMIT'));
      assert.equal(p.counts().allocations, 1); assert.equal(api.app.server.listening, false);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});

function partyProductionFixture(core: boolean, allowed = true) {
  const f = categoryProductionFixture('26_v15_category_order_undo', false, core);
  const review = JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile, 'utf8'));
  review.purposes = review.purposes.filter((purpose: string) => purpose !== 'CURRENT_CUSTOMER_READ_WRITE');
  if (allowed) review.purposes.push('CURRENT_CUSTOMER_READ_WRITE');
  const body = JSON.stringify(review); writeFileSync(f.configuration.runtime26Review.reviewFile, body, { mode: 0o600 });
  return { ...f, configuration: { ...f.configuration, ...(core ? { coreReadModules: ['customers'] } : {}), runtime26Review: { ...f.configuration.runtime26Review,
    trustedReviewSha256: createHash('sha256').update(body).digest('hex') } } };
}
test('production party opt-in retains CORE-only default but explicitly mounts native customer supplier reads commands and receipts', async () => {
  for (const core of [false, true]) {
    const f = partyProductionFixture(core), p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    try {
      for (const value of [false, null, {}, 'true', undefined]) assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, partyMaintenance: value }), TypeError);
      assert.throws(() => parseProductionRuntimeConfiguration({ ...config(), partyMaintenance: true }), TypeError);
      const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, partyMaintenance: true }, p.factory);
      try {
        const connects = p.counts().connects;
        for (const family of ['customers', 'suppliers']) {
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/${family}` }));
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/${family}/:id` }));
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/${family}/candidates` }));
          assert.ok(api.app.hasRoute({ method: 'GET', url: `/${family}/receipts/:requestKey` }));
          const response = await api.app.inject({ method: 'POST', url: `/${family}/commands`, payload: {} });
          assert.equal(response.statusCode, 401, response.body);
        }
        assert.equal(p.counts().connects, connects);
        for (const url of ['/payment/accounts/commands', '/catalogue/colors/commands', '/staff/commands', '/sales/commands']) assert.equal(api.app.hasRoute({ method: 'POST', url }), false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1);
    } finally { f.cleanup(); }
  }
  const f = partyProductionFixture(true, false), p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try {
      assert.ok(api.app.hasRoute({ method: 'GET', url: '/customers' }));
      assert.equal(api.app.hasRoute({ method: 'GET', url: '/suppliers' }), false);
      assert.equal(api.app.hasRoute({ method: 'POST', url: '/customers/commands' }), false);
    } finally { await api.close(); }
    const denied = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, partyMaintenance: true }, denied.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(denied.counts().ends, 1);
  } finally { f.cleanup(); }
});

test('production party original approved allocator saves edits and rereads native parties through normal list with exact2 exclusion', async () => {
  const f = partyProductionFixture(true), rows = { customer: new Map<string, Record<string, unknown>>(), supplier: new Map<string, Record<string, unknown>>() };
  const receipts = new Map<string, Record<string, unknown>>(); let role = 'ADMIN';
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003',
      login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall, native_hall_id: hall, hall_enabled: true }];
    if (sql.includes('FROM naijue_erp.operation_receipt')) return receipts.has(values[1] as string) ? [receipts.get(values[1] as string)!] : [];
    if (sql.startsWith('SELECT last_value::text')) return [{ last_value: '1', is_called: false }];
    if (sql.startsWith('SELECT code FROM')) return [{ code: sql.includes('.supplier') ? 'GYS000005' : 'KH000002' }];
    if (sql.startsWith('SELECT setval')) return [{ allocated: values[0] }];
    if (sql.startsWith('SELECT naijue_erp.is_exact_historical_customer_only')) return [{ historical_only: false }];
    const table = sql.includes('naijue_erp.supplier') ? 'supplier' : 'customer';
    if (sql.startsWith('SELECT count(*)::text AS total FROM naijue_erp.')) return [{ total: String(rows[table].size) }];
    if (sql.startsWith('SELECT id, code, name, enabled, version')) {
      if (sql.includes('WHERE id=') || sql.includes('WHERE id =')) return rows[table].has(values[0] as string) ? [rows[table].get(values[0] as string)!] : [];
      return [...rows[table].values()];
    }
    if (/^INSERT INTO naijue_erp\.(customer|supplier) /.test(sql)) {
      rows[table].set(values[0] as string, { id: values[0], code: values[1], name: values[2], enabled: values[3], version: values[4], created_at: values[5], updated_at: values[6] }); return [{}];
    }
    if (/^UPDATE naijue_erp\.(customer|supplier) SET/.test(sql)) {
      const prior = rows[table].get(values[0] as string)!; rows[table].set(values[0] as string, { ...prior, name: values[2], enabled: values[3], version: values[4], updated_at: values[6] }); return [{}];
    }
    if (sql.startsWith('INSERT INTO naijue_erp.audit_change')) return [{}];
    if (sql.startsWith('INSERT INTO naijue_erp.operation_receipt')) {
      receipts.set(values[2] as string, { id: values[0], actor_account_id: values[1], request_key: values[2], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], status: 'COMMITTED', result_data: JSON.parse(values[7] as string), completed_at: values[8] }); return [{}];
    }
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, partyMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      for (const [family, prefix, code] of [['customers', 'customer', 'KH000003'], ['suppliers', 'supplier', 'GYS000006']] as const) {
        const payload = { action: 'CREATE', requestKey: `synthetic-host-${family}`, name: `SYNTHETIC_${family}` };
        const response = await api.app.inject({ method: 'POST', url: `/${family}/commands`, headers, payload });
        assert.equal(response.statusCode, 200, response.body); const result = response.json(); assert.equal(result.code, code);
        const savedRow = rows[prefix].get(result.partyId)!;
        const codeCalls = p.calls.filter(c => c.sql.startsWith('SELECT setval')).length;
        const replay = await api.app.inject({ method: 'POST', url: `/${family}/commands`, headers, payload });
        assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
        const recovered = await api.app.inject({ method: 'GET', url: `/${family}/receipts/${payload.requestKey}`, headers });
        assert.equal(recovered.statusCode, 200, recovered.body); assert.deepEqual(recovered.json().result, result);
        const conflict = await api.app.inject({ method: 'POST', url: `/${family}/commands`, headers, payload: { ...payload, name: 'CHANGED' } });
        assert.equal(conflict.statusCode, 409, conflict.body); assert.equal(p.calls.filter(c => c.sql.startsWith('SELECT setval')).length, codeCalls);
        const editedName = `EDITED_${family}`;
        const edit = await api.app.inject({ method: 'POST', url: `/${family}/commands`, headers,
          payload: { action: 'EDIT', requestKey: `synthetic-host-edit-${family}`, id: result.partyId, expectedVersion: 1, name: editedName, enabled: true } });
        assert.equal(edit.statusCode, 200, edit.body); assert.equal(edit.json().code, code); assert.equal(edit.json().version, 2);
        assert.equal(rows[prefix].get(result.partyId)!.created_at, savedRow.created_at);
        const start = p.calls.length;
        const list = await api.app.inject({ method: 'GET', url: `/${family}?search=&enabled=ALL&page=1&pageSize=20`, headers });
        assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().total, 1);
        assert.equal(list.json().items[0].id, result.partyId); assert.equal(list.json().items[0].name, editedName); assert.equal(list.json().items[0].code, code);
        const readCalls = p.calls.slice(start), authorization = readCalls.findIndex(c => c.sql.includes('application-read:identity'));
        const count = readCalls.findIndex(c => c.sql.startsWith('SELECT count(*)')), page = readCalls.findIndex(c => c.sql.includes('ORDER BY name COLLATE'));
        assert.ok(authorization >= 0 && count > authorization && page > count);
        assert.equal(readCalls[count]!.lease, readCalls[page]!.lease); assert.ok(readCalls.some(c => c.sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));
        assert.ok(!readCalls[count]!.sql.includes('id=ANY')); // Explicit maintenance uses original native scope, not CORE-only membership.
        if (prefix === 'customer') for (const i of [count, page]) assert.match(readCalls[i]!.sql, /NOT naijue_erp.is_exact_historical_customer_only\(customer.id\)/);
        const detail = await api.app.inject({ method: 'GET', url: `/${family}/${result.partyId}`, headers });
        assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().name, editedName);
        role = 'SALESPERSON';
        const denied = await api.app.inject({ method: 'POST', url: `/${family}/commands`, headers, payload }); assert.equal(denied.statusCode, 403, denied.body);
        const deniedList = await api.app.inject({ method: 'GET', url: `/${family}?search=&enabled=ALL&page=1&pageSize=20`, headers }); assert.equal(deniedList.statusCode, 403, deniedList.body); role = 'ADMIN';
      }
      assert.equal(p.calls.filter(c => c.sql.startsWith('SELECT setval')).length, 2);
      assert.equal(p.calls.filter(c => c.sql.startsWith('INSERT INTO naijue_erp.audit_change')).length, 4);
      assert.equal(p.calls.filter(c => c.sql.startsWith('INSERT INTO naijue_erp.operation_receipt')).length, 4);
      assert.equal(p.counts().allocations, 1); assert.equal(api.app.server.listening, false);
    } finally { await api.close(); }
    assert.equal(p.counts().ends, 1);
  } finally { f.cleanup(); }
});

test('production staff explicit opt-in mounts single staff workflow and native readback without adding account writer or credential defaults', async () => {
  for (const core of [false, true]) {
    const f = categoryProductionFixture('26_v15_category_order_undo', true, core);
    const p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    try {
      for (const value of [false, null, {}, 'true', undefined]) assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, staffMaintenance: value }), TypeError);
      assert.throws(() => parseProductionRuntimeConfiguration({ ...config(), staffMaintenance: true }), TypeError);
      const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, ...(core ? { coreReadModules: ['organization'] } : {}), staffMaintenance: true }, p.factory);
      try {
        const before = p.counts().connects;
        for (const url of ['/staff/commands', '/staff/query', '/staff/detail/query']) {
          assert.ok(api.app.hasRoute({ method: 'POST', url }));
          const denied = await api.app.inject({ method: 'POST', url, payload: {} }); assert.equal(denied.statusCode, 401, denied.body);
        }
        assert.ok(api.app.hasRoute({ method: 'GET', url: '/staff/receipts/:requestKey' }));
        assert.equal(p.counts().connects, before);
        for (const url of ['/accounts/commands', '/payment/accounts/commands', '/customers/commands', '/catalogue/colors/commands']) assert.equal(api.app.hasRoute({ method: 'POST', url }), false);
      } finally { await api.close(); }
    } finally { f.cleanup(); }
  }
  const f = categoryProductionFixture('26_v15_category_order_undo', false, true);
  const p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try { assert.equal(api.app.hasRoute({ method: 'POST', url: '/staff/commands' }), false); } finally { await api.close(); }
    const denied = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, staffMaintenance: true }, denied.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(denied.counts().ends, 1);
  } finally { f.cleanup(); }
});

function staffHostProtocol() {
  const f = categoryProductionFixture('26_v15_category_order_undo', true, true);
  const staff = new Map<string, Record<string, unknown>>(), accounts = new Map<string, Record<string, unknown>>(), receipts = new Map<string, Record<string, unknown>>();
  let role = 'ADMIN', otherAdmin = true;
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s') || sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003', login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('maintenance:administrator-lock')) return [];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:receipt')) return receipts.has(values[1] as string) ? [receipts.get(values[1] as string)!] : [];
    if (sql.startsWith('SELECT id,staff_id,login_name')) return [...accounts.values()].filter(a => (values[0] as string[]).includes(a.staff_id as string));
    if (sql.startsWith('SELECT id,name,role')) return [...staff.values()].filter(s => (values[0] as string[]).includes(s.id as string));
    if (sql.startsWith('SELECT id,enabled FROM naijue_erp.hall')) return (values[0] as string[]).map(id => ({ id, enabled: true }));
    if (sql.includes('staff-maintenance:other-admin')) return [{ available: otherAdmin }];
    if (sql.includes('maintenance:audit')) return [{}];
    if (sql.startsWith('INSERT INTO naijue_erp.staff') || sql.startsWith('UPDATE naijue_erp.staff SET')) {
      staff.set(values[0] as string, { id: values[0], name: values[1], role: values[2], hall_id: values[3], contact: values[4], employment_status: values[5], version: values[6] }); return [{}];
    }
    if (sql.startsWith('INSERT INTO naijue_erp.user_account') || sql.startsWith('UPDATE naijue_erp.user_account SET')) {
      accounts.set(values[0] as string, { id: values[0], staff_id: values[1], login_name: values[2], login_enabled: values[3], auth_version: values[4], version: values[5], created_at: values[6], updated_at: values[7] }); return [{}];
    }
    if (sql.startsWith('UPDATE naijue_erp.auth_session')) return [{}];
    if (sql.includes('maintenance:complete')) {
      const result = JSON.parse(values[7] as string);
      receipts.set(values[2] as string, { id: values[0], request_hash: values[3], action: values[4], target_type: values[5], target_id: values[6], result_data: result, completed_at: values[8] }); return [{ result_data: result }];
    }
    if (sql.startsWith('WITH matched AS') && sql.includes('FROM naijue_erp.staff m')) {
      const selected = [...staff.values()].filter(s => values[5] === null || s.id === values[5]);
      return [{ total: String(selected.length), items: selected.map(s => {
        const a = [...accounts.values()].find(a => a.staff_id === s.id);
        return { kind: 'STAFF', id: s.id, version: s.version, createdAt: null, updatedAt: null, name: s.name, role: s.role, contact: s.contact, employmentStatus: s.employment_status, hall: null,
          account: a ? { id: a.id, loginName: a.login_name, loginEnabled: a.login_enabled, authVersion: a.auth_version, version: a.version } : null };
      }) }];
    }
    return undefined;
  });
  return { f, p, staff, accounts, receipts, setRole(value: string) { role = value; }, setOtherAdmin(value: boolean) { otherAdmin = value; } };
}

test('production staff no-credential ordinary create edit readback and employment remain available; password branch honestly rejects', async () => {
  const x = staffHostProtocol(), { f, p } = x;
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, coreReadModules: ['organization'], staffMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const values = { name: 'SYNTHETIC_STAFF_ONLY', role: 'WAREHOUSE', hallId: null, contact: null };
      const command = { action: 'CREATE', requestKey: 'synthetic-staff-only', values, account: null };
      const created = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: command }); assert.equal(created.statusCode, 200, created.body);
      const result = created.json();
      const replay = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: command }); assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
      const recovered = await api.app.inject({ method: 'GET', url: '/staff/receipts/synthetic-staff-only', headers }); assert.equal(recovered.statusCode, 200, recovered.body);
      const conflict = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: { ...command, values: { ...values, name: 'CHANGED' } } }); assert.equal(conflict.statusCode, 409, conflict.body);
      const edited = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: { action: 'EDIT', requestKey: 'synthetic-staff-edit', id: result.targetId, expectedVersion: 1, values: { ...values, name: 'EDITED_STAFF' }, account: null } }); assert.equal(edited.statusCode, 200, edited.body);
      const page = await api.app.inject({ method: 'POST', url: '/staff/query', headers, payload: { search: '', status: 'all', hallId: null, page: 1, pageSize: 20 } });
      assert.equal(page.statusCode, 200, page.body); assert.equal(page.json().total, 1); assert.equal(page.json().items[0].id, result.targetId); assert.equal(page.json().items[0].name, 'EDITED_STAFF'); assert.equal(page.json().items[0].account, null);
      const read = p.calls.findLast(c => c.sql.startsWith('WITH matched AS'))!;
      assert.match(read.sql, /LEFT JOIN naijue_erp.user_account a ON a.staff_id=m.id/); assert.ok(!read.sql.includes('m.id=ANY')); assert.ok(!read.sql.includes('password_hash'));
      const detail = await api.app.inject({ method: 'POST', url: '/staff/detail/query', headers, payload: { id: result.targetId } }); assert.equal(detail.statusCode, 200, detail.body); assert.equal(detail.json().name, 'EDITED_STAFF');
      for (const [action, version] of [['LEAVE', 2], ['REINSTATE', 3]] as const) {
        const response = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: { action, requestKey: `synthetic-staff-${action}`, id: result.targetId, expectedVersion: version } }); assert.equal(response.statusCode, 200, response.body);
      }
      const connects = p.counts().connects;
      const unavailable = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: { ...command, requestKey: 'synthetic-staff-needs-credentials', account: { id: null, expectedVersion: null, loginName: 'SYNTHETIC_LOGIN', loginEnabled: true, password: 'SYNTHETIC_Only_42!' } } });
      assert.equal(unavailable.statusCode, 503, unavailable.body); assert.equal(unavailable.json().error.code, 'ACCOUNT_CREDENTIALS_NOT_READY');
      // Only authentication borrowed a lease; credential rejection preceded a command transaction.
      assert.equal(p.counts().connects, connects + 1); assert.equal(x.accounts.size, 0);
      x.setRole('WAREHOUSE');
      const denied = await api.app.inject({ method: 'POST', url: '/staff/query', headers, payload: { search: '', status: 'all', hallId: null, page: 1, pageSize: 20 } }); assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(p.counts().allocations, 1);
    } finally { await api.close(); }
  } finally { f.cleanup(); }
});

test('production staff original injected tag uses original scrypt and policy; linked account leave revokes sessions and reinstate stays closed', async () => {
  const x = staffHostProtocol(), { f, p } = x;
  // Synthetic-only stable tag capability. No credential file, environment key or real secret.
  const tag = createNodeCredentialRequestTag(Buffer.alloc(32, 65));
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, staffMaintenance: true }, p.factory, tag);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` }, password = 'SYNTHETIC_Only_42!';
      const payload = { action: 'CREATE', requestKey: 'synthetic-staff-linked', values: { name: 'SYNTHETIC_ADMIN', role: 'ADMIN', hallId: null, contact: null }, account: { id: null, expectedVersion: null, loginName: 'SYNTHETIC_LOGIN', loginEnabled: true, password } };
      const created = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload }); assert.equal(created.statusCode, 200, created.body); const result = created.json();
      const saved = p.calls.findLast(c => c.sql.startsWith('INSERT INTO naijue_erp.user_account'))!;
      assert.match(saved.values[8] as string, /^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      const lease = p.calls.at(-1)!.lease, calls = p.calls.filter(c => c.lease === lease);
      const audit = calls.findIndex(c => c.sql.includes('maintenance:audit')), root = calls.findIndex(c => c.sql.startsWith('INSERT INTO naijue_erp.staff')), child = calls.findIndex(c => c.sql.startsWith('INSERT INTO naijue_erp.user_account'));
      assert.ok(audit >= 0 && root > audit && child > root); assert.equal(calls.at(-1)!.sql, 'COMMIT');
      assert.ok(!JSON.stringify(calls[audit]!.values).includes(password)); assert.ok(!created.body.includes(password));
      const replay = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload }); assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
      assert.equal(p.calls.filter(c => c.sql.startsWith('INSERT INTO naijue_erp.user_account')).length, 1);
      x.setOtherAdmin(false);
      const leave = { action: 'LEAVE', requestKey: 'synthetic-staff-linked-leave', id: result.targetId, expectedVersion: 1 };
      const blocked = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: leave }); assert.equal(blocked.statusCode, 409, blocked.body); assert.equal(blocked.json().error.code, 'LAST_AVAILABLE_ADMIN');
      x.setOtherAdmin(true);
      const left = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: leave }); assert.equal(left.statusCode, 200, left.body);
      assert.ok(p.calls.some(c => c.sql.startsWith('UPDATE naijue_erp.auth_session')));
      const restored = await api.app.inject({ method: 'POST', url: '/staff/commands', headers, payload: { action: 'REINSTATE', requestKey: 'synthetic-staff-linked-reinstate', id: result.targetId, expectedVersion: 2 } }); assert.equal(restored.statusCode, 200, restored.body);
      const detail = await api.app.inject({ method: 'POST', url: '/staff/detail/query', headers, payload: { id: result.targetId } }); assert.equal(detail.statusCode, 200, detail.body);
      assert.equal(detail.json().employmentStatus, '在职'); assert.equal(detail.json().account.loginEnabled, false); assert.equal(detail.json().account.id, saved.values[0]);
      const list = await api.app.inject({ method: 'POST', url: '/staff/query', headers, payload: { search: '', status: 'all', hallId: null, page: 1, pageSize: 20 } });
      assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().total, 1);
      assert.equal(list.json().items[0].account.id, saved.values[0]); assert.equal(list.json().items[0].account.loginEnabled, false);
      assert.ok(!detail.body.includes(password)); assert.ok(!detail.body.includes('password_hash')); assert.equal(p.counts().allocations, 1);
    } finally { await api.close(); }
  } finally { f.cleanup(); }
});

function productBaseProductionFixture(core: boolean, maintenance = true) {
  const f = categoryProductionFixture('26_v15_category_order_undo', maintenance, core);
  const review = JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile, 'utf8'));
  for (const purpose of ['PRODUCT_SEASONS_READ', 'INVENTORY_ADMISSION']) if (!review.purposes.includes(purpose)) review.purposes.push(purpose);
  const body = JSON.stringify(review); writeFileSync(f.configuration.runtime26Review.reviewFile, body, { mode: 0o600 });
  return { ...f, configuration: { ...f.configuration, runtime26Review: { ...f.configuration.runtime26Review, trustedReviewSha256: createHash('sha256').update(body).digest('hex') } } };
}
test('production product base opt-in mounts original V2 commands detail and normal bounded list before CORE return without media stage', async () => {
  for (const core of [false, true]) {
    const f = productBaseProductionFixture(core), p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    try {
      for (const value of [false, null, {}, 'true', undefined]) assert.throws(() => parseProductionRuntime26Configuration({ ...f.configuration, productMaintenance: value }), TypeError);
      assert.throws(() => parseProductionRuntimeConfiguration({ ...config(), productMaintenance: true }), TypeError);
      const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, productMaintenance: true }, p.factory);
      try {
        const before = p.counts().connects;
        for (const url of ['/products/v2/commands', '/products/maintenance/v2/detail/query', '/products/maintenance/candidates/query', '/product-management/query']) {
          assert.ok(api.app.hasRoute({ method: 'POST', url }));
          const response = await api.app.inject({ method: 'POST', url, payload: {} }); assert.equal(response.statusCode, 401, response.body);
        }
        assert.ok(api.app.hasRoute({ method: 'GET', url: '/products/receipts/:requestKey' }));
        assert.equal(p.counts().connects, before);
        assert.equal(api.app.hasRoute({ method: 'POST', url: '/product-media/uploads' }), false);
        for (const url of ['/staff/commands', '/payment/accounts/commands', '/customers/commands', '/catalogue/colors/commands']) assert.equal(api.app.hasRoute({ method: 'POST', url }), false);
      } finally { await api.close(); }
    } finally { f.cleanup(); }
  }
  const f = productBaseProductionFixture(true, false), p = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
  try {
    const api = await createProductionRuntime26ApplicationApi(f.configuration, p.factory);
    try { assert.equal(api.app.hasRoute({ method: 'POST', url: '/products/v2/commands' }), false); } finally { await api.close(); }
    const denied = exact26Driver(f.observation, sql => sql === NATIVE_RUNTIME26_V15_METADATA_PROBE ? [structuredClone(f.observation)] : undefined);
    await assert.rejects(createProductionRuntime26ApplicationApi({ ...f.configuration, productMaintenance: true }, denied.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(denied.counts().ends, 1);
  } finally { f.cleanup(); }
});

test('production product base original receipt replay and media rejection do not read or write aggregate SKUs', async () => {
  const f = productBaseProductionFixture(true), product = '00000000-0000-4000-8000-000000000172', operation = '00000000-0000-4000-8000-000000000173';
  const command = { action: 'DISABLE', requestKey: 'synthetic-existing-product-key', id: product, expectedVersion: 2 };
  const result = { operationId: operation, kind: 'PRODUCT', targetId: product, version: 3 };
  let role = 'ADMIN';
  const p = exact26Driver(f.observation, (sql, values) => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s') || sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003', login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role, employment_status: '在职', hall_id: hall }];
    if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
    if (sql.includes('maintenance:receipt')) return values[1] === command.requestKey ? [{ id: operation, request_hash: requestHash({ kind: 'PRODUCT', actorAccountId: account, command }), action: 'DISABLE', target_type: 'PRODUCT', target_id: product, result_data: result, completed_at: '2026-10-25T00:00:00.000000Z' }] : [];
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, productMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const replay = await api.app.inject({ method: 'POST', url: '/products/v2/commands', headers, payload: command }); assert.equal(replay.statusCode, 200, replay.body); assert.deepEqual(replay.json(), result);
      const receipt = await api.app.inject({ method: 'GET', url: `/products/receipts/${command.requestKey}`, headers }); assert.equal(receipt.statusCode, 200, receipt.body); assert.deepEqual(receipt.json().result, result);
      const conflict = await api.app.inject({ method: 'POST', url: '/products/v2/commands', headers, payload: { ...command, expectedVersion: 3 } }); assert.equal(conflict.statusCode, 409, conflict.body);
      const media = { action: 'CREATE', requestKey: 'synthetic-base-media-is-not-success', values: { productCode: 'SYNTHETIC_01', name: 'SYNTHETIC', categoryId: product, supplierId: product, seasonIds: [product], sizeGroupId: product,
        year: 2026, systemItemCode: '00001', thickness: null, collarPantsType: null, defaultBarcodeSchemeId: product, enabled: true, prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k => [k, k === 'retail_price' ? '0.00' : null])) },
        skus: [{ id: null, expectedVersion: null, skuCode: 'SYNTHETIC-SKU', colorId: product, fitId: product, sizeId: product, enabled: true }], barcodes: [], imageChanges: [] };
      const rejected = await api.app.inject({ method: 'POST', url: '/products/v2/commands', headers, payload: media }); assert.equal(rejected.statusCode, 503, rejected.body); assert.equal(rejected.json().error.code, 'PRODUCT_MEDIA_NOT_READY');
      role = 'SALESPERSON'; const denied = await api.app.inject({ method: 'GET', url: `/products/receipts/${command.requestKey}`, headers }); assert.equal(denied.statusCode, 403, denied.body);
      assert.ok(p.calls.every(c => !/^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
      assert.ok(p.calls.every(c => !c.sql.includes('FROM naijue_erp.sku WHERE product_id')));
      assert.equal(p.counts().allocations, 1);
    } finally { await api.close(); }
  } finally { f.cleanup(); }
});

test('production product normal stock list preserves complete-publication gate and does not invent zero or bypass to maintenance rows', async () => {
  const f = productBaseProductionFixture(true);
  const p = exact26Driver(f.observation, sql => {
    if (sql === NATIVE_RUNTIME26_V15_METADATA_PROBE) return [structuredClone(f.observation)];
    if (sql.includes('product-management:count')) return [{ exact_total: '0', invalid_category_tree: false }];
    if (sql.includes('product-management:publication')) return [];
    return undefined;
  });
  try {
    const api = await createProductionRuntime26ApplicationApi({ ...f.configuration, productMaintenance: true }, p.factory);
    try {
      const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
      const response = await api.app.inject({ method: 'POST', url: '/product-management/query', headers, payload: { filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] }, page: 1, pageSize: 100 } });
      assert.equal(response.statusCode, 503, response.body); assert.equal(response.json().error.code, 'PRODUCT_MANAGEMENT_STOCK_NOT_READY');
      assert.ok(!response.body.includes('"items"')); assert.ok(!p.calls.some(c => c.sql.includes('product-management:page')));
      const lease = p.calls.at(-1)!.lease, calls = p.calls.filter(c => c.lease === lease);
      assert.equal(calls.at(-1)!.sql, 'ROLLBACK'); assert.ok(calls.every(c => c.sql !== 'COMMIT'));
    } finally { await api.close(); }
  } finally { f.cleanup(); }
});

const mixedMaintenance = { catalogueMaintenance: true, paymentMaintenance: true, partyMaintenance: true, staffMaintenance: true, productMaintenance: true } as const;
function mixedProductionFixture(historyPurpose: boolean) {
  const f = categoryProductionFixture('26_v16_history_responsible_from_v14', true);
  const review = JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile, 'utf8'));
  if (historyPurpose) review.purposes.push('HISTORY_REVISION');
  const body = JSON.stringify(review); writeFileSync(f.configuration.runtime26Review.reviewFile, body, { mode: 0o600 });
  return { ...f, configuration: { ...f.configuration, ...mixedMaintenance, runtime26Review: { ...f.configuration.runtime26Review, trustedReviewSha256: createHash('sha256').update(body).digest('hex') } } };
}
test('unified original R2 and HISTORY hosts retain five private maintenance selections without duplicate routes or cross-granting document commands', async () => {
  for (const mode of ['r2-sales', 'r2-transfers', 'history'] as const) {
    const f = mixedProductionFixture(mode === 'history'), p = exact26Driver(f.observation, sql => sql === V16HistoryProbe ? [structuredClone(f.observation)] : undefined);
    let historyGrants = 0;
    try {
      const api = mode === 'history'
        ? await createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, { authorization: { async authorize(): Promise<never> { historyGrants++; throw new DomainError('FORBIDDEN', 'SYNTHETIC_CLOSED_HISTORY'); } } }, p.factory)
        : await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration, mode === 'r2-sales', mode === 'r2-transfers'), p.factory);
      try {
        const before = p.counts().connects;
        for (const [command, receipt] of [['/catalogue/colors/commands', '/catalogue/colors/receipts/:requestKey'], ['/catalogue/fits/commands', '/catalogue/fits/receipts/:requestKey'],
          ['/payment/accounts/commands', '/payment/accounts/receipts/:requestKey'], ['/customers/commands', '/customers/receipts/:requestKey'], ['/suppliers/commands', '/suppliers/receipts/:requestKey'], ['/staff/commands', '/staff/receipts/:requestKey'], ['/products/v2/commands', '/products/receipts/:requestKey']]) {
          assert.ok(api.app.hasRoute({ method: 'POST', url: command! })); assert.ok(api.app.hasRoute({ method: 'GET', url: receipt! }));
          const denied = await api.app.inject({ method: 'POST', url: command!, payload: {} }); assert.equal(denied.statusCode, 401, denied.body);
        }
        for (const url of ['/staff/query', '/staff/detail/query', '/payment/accounts/query', '/product-management/query', '/products/maintenance/v2/detail/query']) assert.ok(api.app.hasRoute({ method: 'POST', url }));
        assert.ok(api.app.hasRoute({ method: 'GET', url: '/customers' })); assert.ok(api.app.hasRoute({ method: 'GET', url: '/suppliers' }));
        for (const kind of ['sales', 'transfers']) {
          for (const detail of [false, true]) assert.ok(api.app.hasRoute({ method: 'POST', url: `/imported-history/${kind}/${detail ? 'detail/' : ''}query` }));
          assert.equal(api.app.hasRoute({ method: 'POST', url: `/${kind}/commands` }), mode !== 'history');
          assert.equal(api.app.hasRoute({ method: 'POST', url: `/${kind}/prepare-existing` }), mode === `r2-${kind}`);
          assert.equal(api.app.hasRoute({ method: 'POST', url: `/imported-history/${kind}/revise` }), mode === 'history');
        }
        assert.equal(historyGrants, 0); assert.equal(p.counts().connects, before);
        assert.equal(p.counts().allocations, 1); assert.equal(api.app.server.listening, false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, p.counts().releases);
    } finally { f.cleanup(); }
  }
});

test('unified R2 and HISTORY propagate only original staff private tag capability; absence stays503 and callback never grants staff authority', async () => {
  for (const mode of ['r2', 'history'] as const) for (const available of [false, true]) {
    const f = mixedProductionFixture(mode === 'history'); let tagged = 0;
    const originalTag = createNodeCredentialRequestTag(Buffer.alloc(32, 73)), tag = available ? (password: string) => { tagged++; return originalTag(password); } : null;
    const p = exact26Driver(f.observation, sql => {
      if (sql === V16HistoryProbe) return [structuredClone(f.observation)];
      if (sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff s') || sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003', login_name: 'SYNTHETIC_ONLY', password_hash: 'SYNTHETIC_UNUSED', login_enabled: true, auth_version: 1, role: 'WAREHOUSE', employment_status: '在职', hall_id: hall }];
      if (sql.includes('maintenance:administrator-lock')) return [];
      if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
      return undefined;
    });
    try {
      const api = mode === 'history'
        ? await createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, { authorization: { async authorize(): Promise<never> { throw Error('Staff must not invoke historical grants'); } } }, p.factory, tag)
        : await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration, false, false), p.factory, tag);
      try {
        const response = await api.app.inject({ method: 'POST', url: '/staff/commands', headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` }, payload: {
          action: 'CREATE', requestKey: 'synthetic-mixed-staff-private-cap', values: { name: 'SYNTHETIC_STAFF', role: 'WAREHOUSE', hallId: null, contact: null },
          account: { id: null, expectedVersion: null, loginName: 'SYNTHETIC_LOGIN', loginEnabled: true, password: 'SYNTHETIC_Only_42!' }
        } });
        assert.equal(response.statusCode, available ? 403 : 503, response.body);
        assert.equal(response.json().error.code, available ? 'FORBIDDEN' : 'ACCOUNT_CREDENTIALS_NOT_READY'); assert.equal(tagged, available ? 1 : 0);
        assert.ok(!p.calls.some(c => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
        assert.equal(p.counts().allocations, 1);
      } finally { await api.close(); }
    } finally { f.cleanup(); }
  }
});

test('unified selectors remain closed; maintenance and HIST read routes cannot replace independent HISTORY policy purpose or R2 preparation choices', async () => {
  const f = mixedProductionFixture(true); let allocated = 0;
  const driver = () => { allocated++; throw Error('No pool before strict independent configuration'); };
  try {
    const r2 = r2Configuration(f.configuration, false, true);
    assert.deepEqual(parseProductionRuntime26R2Configuration(r2), r2);
    for (const key of Object.keys(mixedMaintenance)) for (const value of [false, null, 'true', {}, undefined]) assert.throws(() => parseProductionRuntime26R2Configuration({ ...r2, [key]: value }), TypeError);
    for (const change of [{ existingPreparation: { sales: true } }, { existingPreparation: { sales: true, transfers: 'true' } }, { existingPreparation: { sales: true, transfers: true, all: true } },
      { authorization: {} }, { staffCredentialRequestTag: () => 'a'.repeat(64) }, { history: {} }, { coreReadModules: ['organization'] }]) await assert.rejects(createProductionRuntime26R2ApplicationApi({ ...r2, ...change }, driver), TypeError);
    for (const policy of [undefined, {}, { authorization: {} }, { authorization: { authorize: true } }]) await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, policy as never, driver), TypeError);
    const { staffMaintenance: _staff, ...withoutStaff } = f.configuration;
    const tag = createNodeCredentialRequestTag(Buffer.alloc(32, 74));
    await assert.rejects(createProductionRuntime26R2ApplicationApi(r2Configuration(withoutStaff, false, false), driver, tag), TypeError);
    await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(withoutStaff, { authorization: { async authorize(): Promise<never> { throw Error('No request'); } } }, driver, tag), TypeError);
    assert.equal(allocated, 0);
  } finally { f.cleanup(); }
  const closed = mixedProductionFixture(false), p = exact26Driver(closed.observation, sql => sql === V16HistoryProbe ? [structuredClone(closed.observation)] : undefined); let grants = 0;
  try {
    await assert.rejects(createProductionRuntime26HistoryRevisionApplicationApi(closed.configuration, { authorization: { async authorize(): Promise<never> { grants++; throw Error('No request before reviewed purpose'); } } }, p.factory), { code: 'NATIVE_RUNTIME26_NOT_READY' });
    assert.equal(grants, 0); assert.equal(p.counts().ends, 1);
  } finally { closed.cleanup(); }
  const deny = mixedProductionFixture(true), pg = exact26Driver(deny.observation, sql => sql === V16HistoryProbe ? [structuredClone(deny.observation)] : undefined);
  try {
    const api = await createProductionRuntime26HistoryRevisionApplicationApi(deny.configuration, { authorization: { async authorize(): Promise<never> { grants++; throw new DomainError('FORBIDDEN', 'SYNTHETIC_DENY_ORIGINAL_POLICY'); } } }, pg.factory);
    try {
      const response = await api.app.inject({ method: 'POST', url: '/imported-history/sales/revise', headers: { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${pg.token}` }, payload: {
        kind: 'sales', documentId: '00000000-0000-4000-8000-000000000181', expectedVersion: 1, requestKey: 'synthetic-mixed-history-independent-deny', reason: 'Synthetic original quantity correction',
        lines: [{ lineId: '00000000-0000-4000-8000-000000000182', quantity: '3' }], totals: null, settlements: []
      } });
      assert.equal(response.statusCode, 403, response.body); assert.equal(grants, 1);
      assert.ok(!pg.calls.some(c => c.sql.includes('history-revise:')));
    } finally { await api.close(); }
  } finally { deny.cleanup(); }
});

test('unified original hosts preserve normal reader and original maintenance receipt on their same pool alongside selected document routes', async () => {
  for (const mode of ['r2', 'history'] as const) {
    const f = mixedProductionFixture(mode === 'history');
    const operation = '00000000-0000-4000-8000-000000000191', target = '00000000-0000-4000-8000-000000000192', key = 'synthetic-mixed-existing-payment';
    const result = { operationId: operation, kind: 'PAYMENT_ACCOUNT', targetId: target, version: 2 };
    const p = exact26Driver(f.observation, sql => {
      if (sql === V16HistoryProbe) return [structuredClone(f.observation)];
      if (sql.includes('maintenance:identity')) return [{ account_id: account, staff_id: '00000000-0000-4000-8000-000000000003', login_enabled: true, role: 'ADMIN', employment_status: '在职', hall_id: hall }];
      if (sql.includes('maintenance:hall')) return [{ id: hall, enabled: true }];
      if (sql.includes('maintenance:receipt')) return [{ id: operation, request_hash: 'c'.repeat(64), action: 'EDIT', target_type: 'PAYMENT_ACCOUNT', target_id: target, result_data: result, completed_at: '2026-10-25T00:00:00.000000Z' }];
      if (sql.startsWith('WITH matched AS') && sql.includes('FROM naijue_erp.payment_account')) return [{ total: '0', items: [] }];
      return undefined;
    });
    try {
      const api = mode === 'r2' ? await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration, false, false), p.factory)
        : await createProductionRuntime26HistoryRevisionApplicationApi(f.configuration, { authorization: { async authorize(): Promise<never> { throw Error('Maintenance reader must not invoke historical write policy'); } } }, p.factory);
      try {
        const headers = { origin: PRODUCTION_PUBLIC_ORIGIN, cookie: `__Host-naijue_session=${p.token}` };
        const receipt = await api.app.inject({ method: 'GET', url: `/payment/accounts/receipts/${key}`, headers });
        assert.equal(receipt.statusCode, 200, receipt.body); assert.equal(receipt.json().status, 'COMMITTED'); assert.deepEqual(receipt.json().result, result);
        const list = await api.app.inject({ method: 'POST', url: '/payment/accounts/query', headers, payload: { search: '', status: 'all', hallId: hall, paymentMethodId: null, page: 1, pageSize: 20 } });
        assert.equal(list.statusCode, 200, list.body); assert.equal(list.json().total, 0); assert.deepEqual(list.json().items, []);
        assert.ok(!p.calls.some(c => /^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
        assert.equal(p.counts().allocations, 1); assert.equal(api.app.server.listening, false);
      } finally { await api.close(); }
      assert.equal(p.counts().ends, 1); assert.equal(p.counts().connects, p.counts().releases);
    } finally { f.cleanup(); }
  }
});


test('complete host bridge: R2 commands and independent HISTORY policy share original pool with selected native organization maintenance', async () => {
  const f = mixedProductionFixture(true), p = exact26Driver(f.observation, sql => sql === V16HistoryProbe ? [structuredClone(f.observation)] : undefined);
  const selected = { ...r2Configuration(f.configuration, true, false), organizationMaintenance: true as const };
  let grants = 0;
  const policy = { async authorize(): Promise<never> { assert.equal(this, policy); grants++; throw new DomainError('FORBIDDEN', 'SYNTHETIC_INDEPENDENT_HISTORY_DENIAL'); } };
  try {
    const promise = createProductionRuntime26R2ApplicationApi(selected, p.factory, null, { authorization: policy });
    policy.authorize = async () => { throw Error('Mutated policy must not be used'); };
    const api = await promise;
    try {
      for (const kind of ['sales', 'transfers']) {
        assert.ok(api.app.hasRoute({method:'POST',url:`/${kind}/commands`}));
        assert.ok(api.app.hasRoute({method:'POST',url:`/imported-history/${kind}/revise`}));
        assert.equal(api.app.hasRoute({method:'POST',url:`/${kind}/prepare-existing`}), kind === 'sales');
      }
      for (const kind of ['halls', 'warehouses']) for (const route of ['commands', 'query', 'detail/query'])
        assert.ok(api.app.hasRoute({method:'POST',url:`/organization/${kind}/${route}`}));
      const before=p.counts().connects;
      const unauth=await api.app.inject({method:'POST',url:'/organization/halls/commands',payload:{}});
      assert.equal(unauth.statusCode,401);assert.equal(p.counts().connects,before);
      const denied=await api.app.inject({method:'POST',url:'/imported-history/sales/revise',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:`__Host-naijue_session=${p.token}`},payload:{
        kind:'sales',documentId:'00000000-0000-4000-8000-000000000181',expectedVersion:1,requestKey:'synthetic-complete-bridge-history-denial',reason:'Synthetic quantity correction',
        lines:[{lineId:'00000000-0000-4000-8000-000000000182',quantity:'2'}],totals:null,settlements:[]}});
      assert.equal(denied.statusCode,403,denied.body);assert.equal(grants,1);
      assert.ok(!p.calls.some(c=>c.sql.includes('history-revise:')));
      assert.equal(p.counts().allocations,1);assert.equal(api.app.server.listening,false);
    } finally { await api.close(); }
    assert.equal(p.counts().connects,p.counts().releases);assert.equal(p.counts().ends,1);
  } finally {f.cleanup();}
});

test('complete host bridge: history remains a trusted independent parameter and exact reviewed purpose; new organization selector defaults off', async () => {
  const f=mixedProductionFixture(false);let allocations=0;
  const noDriver=()=>{allocations++;throw Error('Invalid policy must reject before pool');};
  try {
    const config=r2Configuration(f.configuration,false,false);
    for(const value of [false,null,'true',{},undefined]) assert.throws(()=>parseProductionRuntime26R2Configuration({...config,organizationMaintenance:value}),TypeError);
    for(const history of [{},{authorization:{}},{authorization:{authorize:true}},{authorization:{authorize(){ }},extra:true}])
      await assert.rejects(createProductionRuntime26R2ApplicationApi(config,noDriver,null,history as never),TypeError);
    assert.equal(allocations,0);
    const p=exact26Driver(f.observation,sql=>sql===V16HistoryProbe?[structuredClone(f.observation)]:undefined);
    await assert.rejects(createProductionRuntime26R2ApplicationApi(config,p.factory,null,{authorization:{async authorize():Promise<never>{throw Error('No request');}}}),{code:'NATIVE_RUNTIME26_NOT_READY'});
    assert.equal(p.counts().ends,1);assert.equal(p.counts().connects,p.counts().releases);
    const q=exact26Driver(f.observation,sql=>sql===V16HistoryProbe?[structuredClone(f.observation)]:undefined);
    const api=await createProductionRuntime26R2ApplicationApi(config,q.factory);
    try {assert.equal(api.app.hasRoute({method:'POST',url:'/organization/halls/commands'}),false);assert.equal(api.app.hasRoute({method:'POST',url:'/imported-history/sales/revise'}),false);}finally{await api.close();}
  }finally{f.cleanup();}
});

test('complete host bridge: R3 retains original media and all selected maintenance plus HISTORY without duplicate product routes', async () => {
  const f=mixedProductionFixture(true),p=exact26Driver(f.observation,sql=>sql===V16HistoryProbe?[structuredClone(f.observation)]:undefined);
  const config={...r2Configuration(f.configuration,false,true),organizationMaintenance:true as const,profile:'source-confirmed-native-exact26-r3-v1' as const,productMedia:{root:'/unopened-private-media',rootKey:'original-media'}};
  try{
    assert.deepEqual(parseProductionRuntime26R3Configuration(config),config);
    const api=await createProductionRuntime26R3ApplicationApi(config,p.factory,null,{authorization:{async authorize():Promise<never>{throw Error('Not a request');}}});
    try{
      for(const url of ['/products/v2/commands','/staff/commands','/payment/accounts/commands','/customers/commands','/catalogue/colors/commands','/organization/warehouses/commands','/imported-history/transfers/revise','/sales/commands','/transfers/prepare-existing']) assert.ok(api.app.hasRoute({method:'POST',url}),url);
      assert.equal(p.counts().allocations,1);assert.equal(api.app.server.listening,false);
    }finally{await api.close();}
    assert.equal(p.counts().connects,p.counts().releases);assert.equal(p.counts().ends,1);
  }finally{f.cleanup();}
});


test('complete host bridge: CORE organization opt-in reads native maintained roots and receipts while unrelated CORE modules retain their scopes', async () => {
  const f=categoryProductionFixture('26_v16_history_responsible_from_v14',true,true);
  const review=JSON.parse(readFileSync(f.configuration.runtime26Review.reviewFile,'utf8'));review.purposes.push('CURRENT_CUSTOMER_READ_WRITE');
  const body=JSON.stringify(review);writeFileSync(f.configuration.runtime26Review.reviewFile,body,{mode:0o600});
  f.configuration.runtime26Review={...f.configuration.runtime26Review,trustedReviewSha256:createHash('sha256').update(body).digest('hex')};
  const operation='00000000-0000-4000-8000-000000000191', target='00000000-0000-4000-8000-000000000192', key='synthetic-native-hall-receipt';
  const result={operationId:operation,kind:'HALL',targetId:target,version:2};
  const p=exact26Driver(f.observation,(sql)=>{
    if(sql===V16HistoryProbe)return [structuredClone(f.observation)];
    if(sql.includes('maintenance:identity'))return [{account_id:account,staff_id:'00000000-0000-4000-8000-000000000003',login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:hall}];
    if(sql.includes('maintenance:administrator-lock'))return [];
    if(sql.includes('maintenance:hall'))return [{id:hall,enabled:true}];
    if(sql.includes('maintenance:receipt'))return [{id:operation,request_hash:'c'.repeat(64),action:'EDIT',target_type:'HALL',target_id:target,result_data:result,completed_at:'2026-10-25T00:00:00.000000Z'}];
    if(sql.includes('WITH matched AS')){assert.ok(!sql.includes('ANY('));return [{total:'0',items:[]}];}
    return undefined;
  });
  try{
    const api=await createProductionRuntime26ApplicationApi({...f.configuration,organizationMaintenance:true,coreReadModules:['organization']},p.factory);
    try{
      const headers={origin:PRODUCTION_PUBLIC_ORIGIN,cookie:`__Host-naijue_session=${p.token}`};
      const receipt=await api.app.inject({method:'GET',url:`/organization/halls/receipts/${key}`,headers});
      assert.equal(receipt.statusCode,200,receipt.body);assert.deepEqual(receipt.json().result,result);
      for(const kind of ['halls','warehouses']){
        const r=await api.app.inject({method:'POST',url:`/organization/${kind}/query`,headers,payload:{search:'',status:'all',hallId:null,page:1,pageSize:20}});
        assert.equal(r.statusCode,200,r.body);assert.equal(r.json().total,0);
      }
      assert.ok(api.app.hasRoute({method:'POST',url:'/staff/query'}));assert.ok(api.app.hasRoute({method:'POST',url:'/accounts/query'}));
      assert.equal(api.app.hasRoute({method:'POST',url:'/sales/commands'}),false);
      assert.ok(!p.calls.some(c=>c.sql.includes('core-settings:committed-proof')));
      assert.ok(!p.calls.some(c=>/^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
      assert.equal(p.counts().allocations,1);
    }finally{await api.close();}
    assert.equal(p.counts().connects,p.counts().releases);
  }finally{f.cleanup();}
});


import { createProductionRuntime26FullApplicationApi } from './production-provider-composition.ts';
import { runProductionRuntime26FullMain } from './production-main.ts';
test('full historical production launch: original same-pool source write policy is real, defaults stay closed and JSON functions are rejected', async () => {
  const f=mixedProductionFixture(true);
  const p=exact26Driver(f.observation,sql=>{
    if(sql===V16HistoryProbe)return [structuredClone(f.observation)];
    if(sql.includes('history-write-policy:identity'))return [{id:account,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:hall,hall_enabled:true}];
    if(sql.includes('history-write-policy:document'))return [];
    return undefined;
  });
  const config={...r2Configuration(f.configuration,false,false),profile:'source-confirmed-native-exact26-r3-v1' as const,productMedia:{root:'/unopened-private-media',rootKey:'full-original-media'}};
  try{
    for(const key of ['history','historyRevision','authorization','historyAuthorization'])assert.throws(()=>parseProductionRuntime26R3Configuration({...config,[key]:{profile:'SOURCE_CONFIRMED_HISTORY_REVISION_V16'}}),TypeError);
    await assert.rejects(runProductionRuntime26FullMain([]),TypeError);await assert.rejects(runProductionRuntime26FullMain(['relative.json']),TypeError);
    const api=await createProductionRuntime26FullApplicationApi(config,p.factory);
    try{
      const response=await api.app.inject({method:'POST',url:'/imported-history/sales/revise',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:`__Host-naijue_session=${p.token}`},payload:{kind:'sales',documentId:'00000000-0000-4000-8000-000000000181',expectedVersion:1,requestKey:'synthetic-full-policy-source-denial',reason:'Synthetic correction',lines:[{lineId:'00000000-0000-4000-8000-000000000182',quantity:'2'}],totals:null,settlements:[]}});
      assert.equal(response.statusCode,403,response.body);
      assert.ok(p.calls.some(c=>c.sql.includes('history-write-policy:identity')));assert.ok(p.calls.some(c=>c.sql.includes('history-write-policy:document')));assert.ok(!p.calls.some(c=>c.sql.includes('history-revise:')));
      assert.equal(p.counts().allocations,1);assert.equal(api.app.server.listening,false);
    }finally{await api.close();}
    assert.equal(p.counts().connects,p.counts().releases);
    const closed=mixedProductionFixture(false),q=exact26Driver(closed.observation,sql=>sql===V16HistoryProbe?[structuredClone(closed.observation)]:undefined);
    try{await assert.rejects(createProductionRuntime26FullApplicationApi({...config,runtime26Review:closed.configuration.runtime26Review},q.factory),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(q.counts().ends,1);}finally{closed.cleanup();}
  }finally{f.cleanup();}
});


import { syntheticDraft as fullSyntheticDraft, syntheticSku as fullSyntheticSku, sid as fullSid } from '../../../tests/support/synthetic-fixtures.ts';
test('full native catalogue host producer: complete-draft SAVE consumes original maintained proof and fails closed without falling back to imported-only evidence',async()=>{
 const f=mixedProductionFixture(false),sku=fullSyntheticSku();
 const seed=fullSyntheticDraft(),draft={...seed,header:{...seed.header,hallId:hall,salespersonId:fullSid('staff',16)},settlements:[]};
 const p=exact26Driver(f.observation,(sql,values)=>{
  if(sql===V16HistoryProbe)return [structuredClone(f.observation)];
  if(sql.includes('sales-authorization:identity'))return [{account_id:account,staff_id:fullSid('staff',16),login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:hall}];
  if(sql.includes('sales-authorization:hall')||sql.includes('native-sales-facts:hall'))return [{id:hall,enabled:true}];
  if(sql.includes('native-sales-facts:schema'))return [{installed:true}];
  if(sql.includes('native-sales-facts:warehouse'))return [{id:draft.header.warehouseId,hall_id:hall,enabled:true}];
  if(sql.includes('native-sales-facts:customer'))return [{id:draft.header.customerId,enabled:true}];
  if(sql.includes('native-sales-facts:staff'))return [{id:draft.header.salespersonId,employment_status:'在职'}];
  if(sql.includes('native-sales-facts:sku */'))return [{id:sku.id,product_id:sku.productId,color_id:sku.colorId,fit_id:sku.fitId,size_id:sku.sizeId,enabled:true}];
  if(sql.includes('native-sales-facts:product */'))return [{id:sku.productId,product_code:'SYNTHETIC',name:'SYNTHETIC',size_group_id:fullSid('sizeGroup',50),enabled:true,...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,k==='retail_price'?'1.25':null]))}];
  if(sql.includes('native-sales-facts:color */'))return [{id:sku.colorId,name:'SYNTHETIC',enabled:true}];
  if(sql.includes('native-sales-facts:fit */'))return [{id:sku.fitId,name:'SYNTHETIC',enabled:true}];
  if(sql.includes('native-sales-facts:size */'))return [{id:sku.sizeId,name:'SYNTHETIC'}];
  if(sql.includes('native-sales-facts:membership'))return [{size_group_id:(values[0] as string[])[0],size_id:sku.sizeId}];
  if(sql.includes('maintained-catalogue26:roots'))return [];
  return undefined;
 });
 try{
  const api=await createProductionRuntime26R2ApplicationApi(r2Configuration(f.configuration,false,false),p.factory);
  try{
   const payload=JSON.parse(JSON.stringify({action:'SAVE',requestKey:'synthetic-full-native-proof-reject',expectedVersion:null,draft},(_key,value)=>typeof value==='bigint'?value.toString():value));
   const response=await api.app.inject({method:'POST',url:'/sales/commands',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:`__Host-naijue_session=${p.token}`},payload});
   assert.equal(response.statusCode,409,response.body);assert.equal(response.json().error.code,'NATIVE_CATALOGUE_FACTS_UNAVAILABLE');
   assert.ok(p.calls.some(c=>c.sql.includes('maintained-catalogue26:roots')));
   assert.ok(!p.calls.some(c=>c.sql.includes('native-catalogue-completeness:products')));
   assert.ok(!p.calls.some(c=>/^\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
  }finally{await api.close();}
  assert.equal(p.counts().connects,p.counts().releases);
 }finally{f.cleanup();}
});
