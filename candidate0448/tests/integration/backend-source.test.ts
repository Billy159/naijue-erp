/** Connection-free source/plan regressions only. Never imports pg, constructs a Pool or executes engine scenarios. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BACKEND_SCENARIOS, HTTP_READ_SCENARIOS, NATIVE_POLICY_SCENARIOS, SALES_WRITE_AUTHORIZATION_SCENARIOS, METHOD_IDENTITY_SCENARIOS, MIGRATIONS, SPARSE_SCENARIOS } from "./migration-manifest.ts";

test("backend plan-only selection has its own scenarios and the same exact ten current migration bytes", () => {
  for (const [suite, expected] of [["sparse-0001-0010", SPARSE_SCENARIOS], ["backend-0001-0010", [...BACKEND_SCENARIOS, ...HTTP_READ_SCENARIOS, ...NATIVE_POLICY_SCENARIOS, ...SALES_WRITE_AUTHORIZATION_SCENARIOS, ...METHOD_IDENTITY_SCENARIOS]]] as const) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plan.ts", import.meta.url)), "--suite", suite], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.mode, "PLAN_ONLY_NO_CONNECTION"); assert.equal(plan.suite, suite); assert.deepEqual(plan.scenarios, expected);
    assert.deepEqual(plan.migrations.map((item: { version: number; filename: string; sha256: string }) => [item.version, item.filename, item.sha256]), MIGRATIONS);
    assert.ok(plan.requiredGatesForExecution.includes(`NAIJUE_PG_TEST_SUITE=${suite}`));
    assert.ok(plan.notExecuted.includes("PostgreSQL"));
    assert.equal(plan.evidenceStatus, "CURRENT1_TO10_NOT_RUN");
    assert.ok(plan.fixtureOrder[1].includes("migrations1–10"));
  }
});

test("backend plan refuses absent, unknown and historical selections rather than choosing a default", () => {
  for (const args of [[], ["--suite", "all"], ["--suite", "backend"], ["--suite", "native-0001-0005"], ["--suite", "sparse-0001-0008"], ["--suite", "backend-0001-0008"]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plan.ts", import.meta.url)), ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
  }
});

test("current runner rejects historical selections before settings or child creation, without a test URL", async () => {
  const runnerUrl = new URL("../../scripts/run-postgres-integration.mjs", import.meta.url);
  const source = await readFile(runnerUrl, "utf8");
  assert.ok(source.indexOf("const suite = integrationSuite(process.env)") < source.indexOf("const settings = integrationSettings(process.env)"));
  assert.ok(source.indexOf("requireCurrentIntegrationSuite(suite)") < source.indexOf("const child = spawn("));
  assert.doesNotMatch(source, /from ["'][^"']*(?:database|postgres\.integration|pg)[^"']*["']|dotenv|process\.loadEnvFile|new Pool/u);
  for (const suite of ["native-0001-0005", "sparse-0001-0008", "backend-0001-0008"]) {
    // No target URL exists: even a broken suite check cannot connect to any real server.
    const result = spawnSync(process.execPath, [fileURLToPath(runnerUrl), "--run"], { encoding: "utf8", env: {
      NODE_ENV: "test", NAIJUE_PG_INTEGRATION: "I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE", NAIJUE_PG_TEST_SUITE: suite
    } });
    assert.equal(result.status, 2); assert.equal(result.stdout, "");
    assert.match(result.stderr, /explicit NAIJUE_PG_TEST_SUITE/u);
    assert.doesNotMatch(result.stderr, /supply the dedicated test URL/u);
  }
});

test("current source wiring uses pre-Pool guards, migrates ten before seed and has no historical execution body", async () => {
  const entry = await readFile(new URL("./postgres.integration.test.ts", import.meta.url), "utf8");
  const currentGuard = entry.indexOf("requireCurrentIntegrationSuite(suite)"), open = entry.indexOf("await openFreshDatabase(settings");
  assert.ok(currentGuard >= 0 && open >= 0, "both current-suite guard and guarded database open must exist");
  assert.ok(currentGuard < open);
  assert.ok(entry.indexOf("await openFreshDatabase(settings)") < entry.indexOf("await seedSyntheticReferences(pool)"));
  assert.ok(entry.indexOf("t.after") < entry.indexOf("await seedSyntheticReferences(pool)"), "fixture failure must still close owned test connections");
  assert.doesNotMatch(entry, /afterVersionFive|historicalNativeAcceptanceSource/u);
  assert.match(entry, /if \(suite === "backend-0001-0010"\) \{\s*await runBackendAcceptance\(t, pool\);\s*await runHttpReadAcceptance\(t, pool, settings\);\s*await runNativeHttpReadAcceptance\(t, pool, settings\);\s*await runSalesWriteAuthorizationAcceptance\(t, pool\);\s*await runMethodIdentityAcceptance\(t, pool\);\s*\}\s*else await runSparseAcceptance\(t, pool\);/u);

  const database = await readFile(new URL("./database.ts", import.meta.url), "utf8");
  const hashes = database.indexOf("const sources = await Promise.all(MIGRATIONS.map"), pool = database.indexOf("const pool = new Pool");
  assert.ok(hashes >= 0 && pool >= 0, "both exact source hash checking and Pool construction must exist");
  assert.ok(hashes < pool);
  assert.doesNotMatch(database, /afterVersionFive|seedSyntheticReferences/u);
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

test("current fixture source: actual party CREATE precedes explicit nine-key product after all ten migrations, no zero or old-schema seed", async () => {
  const fixture = await readFile(new URL("./fixtures.ts", import.meta.url), "utf8");
  assert.match(fixture, /MIGRATIONS\.map\(\(\[value\]\) => value\)/u);
  assert.match(fixture, /createPartyMaintenanceService\(\{ unitOfWork: new PostgresPartyUnitOfWork\(pool\)/u);
  assert.match(fixture, /referenceMaintainerAccount/u);
  assert.match(fixture, /role: "WAREHOUSE"/u);
  assert.doesNotMatch(fixture, /INSERT INTO naijue_erp\.(?:customer|supplier)\(|INSERT INTO naijue_erp\.inventory_balance|afterVersionFive|readonly sparse/u);
  const party = fixture.indexOf("const customer = await parties.execute");
  const product = fixture.indexOf("INSERT INTO naijue_erp.product(");
  assert.ok(party >= 0 && product > party);
  const statement = /INSERT INTO naijue_erp\.product\(([\s\S]*?)\)\s*VALUES\(([\s\S]*?)\)/u.exec(fixture);
  assert.ok(statement);
  const columns = statement[1]!.split(",").map(value => value.trim());
  const values = statement[2]!.split(",").map(value => value.trim());
  assert.equal(columns.length, values.length);
  const prices = ["retail_price", "purchase_price", "wholesale5_price", "wholesale6_price", "wholesale7_price", "wholesale8_price", "wholesale9_price", "wholesale10_price", "minimum_price"];
  const actual = Object.fromEntries(prices.map(column => { const index = columns.indexOf(column); assert.ok(index >= 0); return [column, values[index]]; }));
  assert.deepEqual(actual, { retail_price: "1.25", purchase_price: "0.75", wholesale5_price: "1.10", wholesale6_price: "1.05", wholesale7_price: "NULL", wholesale8_price: "NULL", wholesale9_price: "NULL", wholesale10_price: "NULL", minimum_price: "NULL" });
  assert.match(fixture, /KNOWN-UNSET/u);
  assert.match(fixture, /paymentAccountId: ids\.payment, paymentMethodId: ids\.method/u);
  const sparse = await readFile(new URL("./sparse-acceptance.ts", import.meta.url), "utf8");
  assert.match(sparse, /"KH000002" : "GYS000002"/u);
  assert.match(sparse, /const partyActor = \{ accountId: ids\.referenceMaintainerAccount, hallId: null, role: "WAREHOUSE"/u);
  assert.match(sparse, /"CREATE", 0, partyActor\.accountId/u);
  assert.ok(sparse.includes("JSON.stringify([partyActor.accountId, create.requestKey])"), "party contention blocker must use the actual stored maintainer actor namespace");
  assert.doesNotMatch(sparse, /receiptLock\(create\.requestKey\)/u);
});

/** These are source-wiring assertions only. They never import or execute the method-identity engine module. */
test("current10 method engine preparation uses real native rules, explicit provenance and observed non-key metadata locks", async () => {
  const source = await readFile(new URL("./method-identity-acceptance.ts", import.meta.url), "utf8");
  assert.match(source, /rules: createNativeTransactionSalesBusinessRules\(\)/u);
  assert.match(source, /catalogueCompleteness: \{ async assertComplete\(context\)/u);
  assert.match(source, /context\.query\(`/u);
  assert.doesNotMatch(source, /SYNTHETIC_SALES_RULES|new Pool|process\.env|DATABASE_URL|DROP DATABASE|DROP SCHEMA|TRUNCATE|DISABLE TRIGGER/u);
  assert.match(source, /SYNTHETIC_METHOD_FIRST_UNSAVED_STALE_PAIR/u);
  assert.match(source, /first stale-pair SAVE consumes no key or document identity/u);
  assert.match(source, /IMMUTABLE_SETTLEMENT_METHOD/u); assert.match(source, /SETTLEMENT_METHOD_MISMATCH/u);
  assert.match(source, /stored pre-0010 unknown identity/u); assert.match(source, /NOT an upgrade\/backfill test/u);
  assert.match(source, /wait_event_type === "Lock" && row\.expected_blocker === true/u);
  assert.match(source, /ANY\(pg_blocking_pids\(pid\)\)/u);
  assert.match(source, /const deadline = performance\.now\(\) \+ 2500/u);
  for (const marker of ["account actual-method non-key update", "account enabled non-key update", "method enabled non-key update"]) assert.ok(source.includes(marker));
  assert.equal((source.match(/await t\.test\(METHOD_IDENTITY_SCENARIOS\[/gu) ?? []).length, METHOD_IDENTITY_SCENARIOS.length);
});
