/** Connection-free source/plan regressions only. Never imports pg, constructs a Pool or executes engine scenarios. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BACKEND_SCENARIOS, HTTP_READ_SCENARIOS, NATIVE_POLICY_SCENARIOS, SALES_WRITE_AUTHORIZATION_SCENARIOS, MIGRATIONS, SPARSE_SCENARIOS } from "./migration-manifest.ts";

test("backend plan-only selection has its own scenarios and the same exact eight migration bytes", () => {
  for (const [suite, expected] of [["sparse-0001-0008", SPARSE_SCENARIOS], ["backend-0001-0008", [...BACKEND_SCENARIOS, ...HTTP_READ_SCENARIOS, ...NATIVE_POLICY_SCENARIOS, ...SALES_WRITE_AUTHORIZATION_SCENARIOS]]] as const) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plan.ts", import.meta.url)), "--suite", suite], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode, "PLAN_ONLY_NO_CONNECTION"); assert.equal(plan.suite, suite); assert.deepEqual(plan.scenarios, expected);
    assert.deepEqual(plan.migrations.map((item: { version: number; filename: string; sha256: string }) => [item.version, item.filename, item.sha256]), MIGRATIONS);
    assert.ok(plan.requiredGatesForExecution.includes(`NAIJUE_PG_TEST_SUITE=${suite}`));
    assert.ok(plan.notExecuted.includes("PostgreSQL"));
  }
});

test("backend plan refuses absent, unknown and historical selections rather than choosing a default", () => {
  for (const args of [[], ["--suite", "all"], ["--suite", "backend"], ["--suite", "native-0001-0005"]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plan.ts", import.meta.url)), ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
  }
});

test("backend source wiring uses the same pre-Pool guards and never activates the preserved historical body", async () => {
  const entry = await readFile(new URL("./postgres.integration.test.ts", import.meta.url), "utf8");
  const currentGuard = entry.indexOf("requireCurrentIntegrationSuite(suite)"), open = entry.indexOf("await openFreshDatabase(settings");
  assert.ok(currentGuard >= 0 && open >= 0, "both current-suite guard and guarded database open must exist");
  assert.ok(currentGuard < open);
  assert.match(entry, /afterVersionFive: pool => seedSyntheticReferences\(pool, \{ sparse: true \}\)/u);
  assert.match(entry, /if \(suite === "backend-0001-0008"\) \{\s*await runBackendAcceptance\(t, pool\);\s*await runHttpReadAcceptance\(t, pool, settings\);\s*await runNativeHttpReadAcceptance\(t, pool, settings\);\s*await runSalesWriteAuthorizationAcceptance\(t, pool\);\s*\}\s*else await runSparseAcceptance\(t, pool\);/u);
  assert.equal((entry.match(/historicalNativeAcceptanceSource\(/gu) ?? []).length, 1, "only its dormant declaration may remain");
  const database = await readFile(new URL("./database.ts", import.meta.url), "utf8");
  const hashes = database.indexOf("const sources = await Promise.all(MIGRATIONS.map"), pool = database.indexOf("const pool = new Pool");
  assert.ok(hashes >= 0 && pool >= 0, "both exact source hash checking and Pool construction must exist");
  assert.ok(hashes < pool);
});

test("sales action engine preparation appends native transaction/known-PID cases without credentials or operator changes", async () => {
  const source = await readFile(new URL("./sales-write-authorization-acceptance.ts", import.meta.url), "utf8");
  assert.match(source, /runSalesWriteAuthorizationAcceptance\(t: TestContext, pool: Pool\)/u);
  assert.match(source, /createSalesActionAuthorization\(\)/u);
  assert.match(source, /await native\.assertAllowed\(actor, action, document, tx\)/u);
  assert.match(source, /new PostgresSalesUnitOfWork\(pool\)/u);
  assert.match(source, /ANY\(pg_blocking_pids\(pid\)\)/u);
  assert.match(source, /row\?\.wait_event_type === "Lock" && row\.expected_blocker === true/u);
  assert.match(source, /performance\.now\(\) \+ 2500/u);
  assert.match(source, /TEST-ONLY AUTHENTICATION/u);
  assert.match(source, /app\.inject\(\{ method: "GET", url: "\/sales\/receipts\//u);
  assert.equal((source.match(/await t\.test\(SALES_WRITE_AUTHORIZATION_SCENARIOS\[/gu) ?? []).length, SALES_WRITE_AUTHORIZATION_SCENARIOS.length);
  assert.doesNotMatch(source, /new Pool|process\.env|DATABASE_URL|\.listen\(|console\.|writeFile|appendFile|spawn|execFile|randomBytes|createNodeScryptPasswords|password_hash|INSERT INTO naijue_erp\.(?:user_account|staff|inventory_balance)|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/u);
});

test("native-profile engine preparation is distinct, explicit, actual-codec/default-driver and guarded-settings-only", async () => {
  const source = await readFile(new URL("./native-http-read-acceptance.ts", import.meta.url), "utf8");
  assert.match(source, /runNativeHttpReadAcceptance\(t: TestContext, pool: Pool, settings: IntegrationSettings\)/u);
  assert.match(source, /authorization: \{ mode: "source-confirmed-native" \}/u);
  assert.match(source, /policy: createSourceAuthenticationPolicy\(900\)/u);
  assert.match(source, /password: randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.match(source, /passwords\.hash\(fixture\.password\)/u);
  assert.match(source, /new PostgresSalesUnitOfWork\(pool\)/u);
  assert.match(source, /new PostgresTransferUnitOfWork\(pool\)/u);
  assert.match(source, /createSourceConfirmedPostgresReadAuthorization\(pool\)/u);
  assert.match(source, /createPostgresReadApi\(nativeOptions\(settings\)\)/u);
  assert.match(source, /assert\.equal\(notReady\.statusCode, 503\)/u);
  assert.match(source, /INVENTORY_NOT_READY/u);
  assert.match(source, /SUPPLEMENTAL ADAPTER CASE ONLY/u);
  assert.equal((source.match(/createPostgresReadApi\(/gu) ?? []).length, 1);
  assert.equal((source.match(/await t\.test\(NATIVE_POLICY_SCENARIOS\[/gu) ?? []).length, NATIVE_POLICY_SCENARIOS.length);
  assert.doesNotMatch(source, /new Pool|process\.env|DATABASE_URL|driver\.factory|createDriver|\.listen\(|console\.|writeFile|appendFile|spawn|execFile|INSERT INTO naijue_erp\.inventory_balance|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/u);
  assert.doesNotMatch(source, /UPDATE naijue_erp\.(?:sales_header|transfer_header|import_record|import_batch)|SET[^;\n]*created_hall_id/u);
});

test("HTTP engine source uses validated explicit settings, real composition/codec and separate synthetic login without a driver double", async () => {
  const http = await readFile(new URL("./http-read-acceptance.ts", import.meta.url), "utf8");
  assert.match(http, /runHttpReadAcceptance\(t: TestContext, pool: Pool, settings: IntegrationSettings\)/u);
  assert.match(http, /target: \{ host: settings\.host, port: settings\.port, database: settings\.database, user: settings\.user,\s*password: settings\.password, ssl: false \}/u);
  assert.match(http, /let password = randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.match(http, /createNodeScryptPasswords\(\)\.hash\(password\)/u);
  assert.match(http, /VALUES\(\$1,\$2,\$3,\$4,true,1,1,\$5,\$5\)/u);
  assert.match(http, /syntheticId\("account", 4700\)/u);
  assert.match(http, /createPostgresReadApi\(fixtureOptions\(settings, false,/u);
  assert.match(http, /createPostgresReadApi\(fixtureOptions\(settings, true,/u);
  assert.match(http, /t\.after\(closeOwned\)/u);
  assert.match(http, /await closeOwned\(\); await closeOwned\(\)/u);
  assert.match(http, /actual scrypt|actual codec|actual token/u);
  assert.doesNotMatch(http, /new Pool|process\.env|DATABASE_URL|driver\.factory|createDriver|\.listen\(|console\.|writeFile|appendFile|spawn|execFile|INSERT INTO naijue_erp\.inventory_balance|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/u);
  assert.doesNotMatch(http, /UPDATE naijue_erp\.(?:user_account|staff)|DELETE FROM/u);
  assert.equal((http.match(/await t\.test\(HTTP_READ_SCENARIOS\[/gu) ?? []).length, HTTP_READ_SCENARIOS.length);
});

test("backend engine source is storage-only, uses actual contention/constraint helpers and no unsafe seed/reset path", async () => {
  const backend = await readFile(new URL("./backend-acceptance.ts", import.meta.url), "utf8");
  assert.match(backend, /new PostgresAuthenticationStore\(pool\)/u);
  assert.match(backend, /await tx\.changePassword\(ids\.account, 1, SYNTHETIC_PASSWORD_SENTINEL/u);
  assert.match(backend, /oneVersionWinner\(await contend\(pool, `naijue:sales:/u);
  assert.match(backend, /oneVersionWinner\(await contend\(pool, `naijue:transfer:/u);
  assert.match(backend, /"sales_line_pricing_facts"/u);
  assert.match(backend, /assert\.equal\(committedBetween, true\)/u);
  assert.match(backend, /\[ids\.sku, ids\.uncoveredSku, ids\.raceSku\]\.sort\(\)/u);
  assert.doesNotMatch(backend, /new Pool|process\.env|DATABASE_URL|createAuthenticationService|\.login\(|\.listen\(|app\.inject|seedSyntheticReferences|INSERT INTO naijue_erp\.inventory_balance|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/u);
  assert.equal((backend.match(/await t\.test\(BACKEND_SCENARIOS\[/gu) ?? []).length, BACKEND_SCENARIOS.length);
});
