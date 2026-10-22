import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createProductionApplicationApi, parseProductionRuntimeConfiguration, productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from "./production-provider-composition.ts";
import type { ProductionRuntimeConfiguration } from "./production-provider-composition.ts";
import { runProductionMain } from "./production-main.ts";
import { entityId } from "../../../packages/domain/src/values.ts";
import { pbkdf2Sync } from "node:crypto";
import { wrapTrustedLegacyCredential } from "../../../packages/authentication/src/legacy-passwords.ts";
import { createPostgresApplicationApi } from "./postgres-read-api.ts";

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
  assert.equal("importedHistoryRead" in options, false); // Requires its own explicit reviewed historical policy.
  assert.equal("partyRead" in options, false); // D2 leaf composition is a separate delivery.
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
    assert.equal(api.app.hasRoute({ method: "POST", url: "/imported-history/sales/query" }), false);
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
    assert.equal(api.app.hasRoute({ method: "POST", url: "/inventory/query" }), true); assert.equal(connects, 0);
  } finally { await api.close(); }
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
