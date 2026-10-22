/** SOURCE / SYNTHETIC PROTOCOL ONLY. No Pool, network, engine or import result. */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { auditJson } from "../adapters/postgres/src/codec.ts";
import { salesChangeEvidence } from "../packages/application/src/sales-change-evidence.ts";
import type { SalesDocument } from "../packages/domain/src/documents.ts";
import { version } from "../packages/domain/src/values.ts";
import { actor as auditActor, sid, syntheticDraft } from "./support/synthetic-fixtures.ts";
import { assertNativeSaleCreateEvidence } from "./integration/native-sales-schema11-acceptance.ts";
import type { PgSalesClient, PgSalesPool } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { createCatalogueSourcePriceProof, CATALOGUE_SOURCE_PRICE_FIELDS } from "../packages/application/src/catalogue-source-proof.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { validateCutoffImportCommand } from "../packages/application/src/inventory-cutoff-import.ts";
import { HISTORY_MIGRATION } from "./integration/history-database.ts";
import { MIGRATIONS } from "./integration/migration-manifest.ts";
import { DISPOSABLE_DATABASE_APPROVAL } from "./integration/safety.ts";
import { NATIVE_SALE_SCHEMA11_SUITE, nativeSaleSchema11Settings } from "./integration/native-sales-schema11-safety.ts";
import { saleIds, SALE_HISTORY_COUNTS, SALE_SOURCE_SHA256, readNativeSalesSchema11Source, nativeSalesSchema11StageCommand, assertNativeSaleHistoryCounts,
  runSaleFixtureTransaction } from "./integration/native-sales-schema11-fixture.ts";

const fixtureEnv = (): Record<string, string> => ({ NODE_ENV: "test", NAIJUE_PG_INTEGRATION: DISPOSABLE_DATABASE_APPROVAL,
  NAIJUE_PG_TEST_SUITE: NATIVE_SALE_SCHEMA11_SUITE, NAIJUE_PG_EXPECT_DATABASE: "naijue_erp_test_a1b2c3d4",
  NAIJUE_PG_TEST_DATABASE_URL: "postgresql://naijue_erp_test:SYNTHETIC_NON_SECRET@127.0.0.1:55432/naijue_erp_test_a1b2c3d4" });
function scripted(options: { badCount?: boolean; commitError?: Error; workError?: Error; rollbackError?: Error } = {}) {
  const calls: { sql: string; values: unknown[] }[] = []; const released: (Error | boolean | undefined)[] = [];
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql === "COMMIT" && options.commitError) throw options.commitError;
    if (sql === "ROLLBACK" && options.rollbackError) throw options.rollbackError;
    if (sql === "SYNTHETIC_WORK" && options.workError) throw options.workError;
    const table = /FROM naijue_erp\.(\w+) WHERE batch_id/.exec(sql)?.[1];
    if (table) return { rows: [{ n: options.badCount ? 999 : SALE_HISTORY_COUNTS[table as keyof typeof SALE_HISTORY_COUNTS] }], rowCount: 1 };
    if (sql.includes("JOIN naijue_erp.sku_barcode")) return { rows: [{ n: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }, release(error) { released.push(error); } };
  const pool: PgSalesPool = { async connect() { return client; } };
  return { pool, calls, released };
}

/** Actual serializer output, synthetic driver row shape: NOT engine evidence. */
function auditContractFixture() {
  const time = "2026-10-21T12:00:00.000Z", draft = syntheticDraft();
  const document: SalesDocument = { ...draft, header: { ...draft.header, status: "DRAFT", version: version(1),
    createdByAccountId: auditActor.accountId, createdHallId: auditActor.hallId, createdAt: time, updatedAt: time,
    approvedByAccountId: null, approvedAt: null } };
  const saved = { operationId: sid("operation", 901001), salesId: draft.header.id, version: 1, status: "DRAFT" as const, ledgerEntryIds: [] };
  const audit = { id: sid("audit", 901002), operation_id: saved.operationId, actor_account_id: auditActor.accountId,
    object_type: "SALES", object_id: draft.header.id, object_sales_id: draft.header.id, object_transfer_id: null,
    action: "SAVE", old_version: null, new_version: 1, occurred_at: new Date(time), before_values: null,
    after_values: JSON.parse(auditJson(salesChangeEvidence(undefined, document).after)) };
  const receipt = { id: saved.operationId, actor_account_id: auditActor.accountId, request_key: "SALE_NATIVE_CREATE",
    action: "SAVE", target_type: "SALES", target_id: draft.header.id, target_sales_id: draft.header.id, target_transfer_id: null,
    status: "COMMITTED", result_data: structuredClone(saved), completed_at: new Date(time) };
  return { draft: JSON.parse(auditJson(draft)), saved, audit, receipt, actorAccountId: auditActor.accountId, time };
}
test("native SALE audit fixture: unchanged production projection omits header identity; relational ownership and complete CREATE evidence are required", () => {
  const input = auditContractFixture();
  for (const key of ["id", "createdByAccountId", "createdHallId", "createdAt"])
    assert.equal(Object.hasOwn(input.audit.after_values.header, key), false, "change-only header must not be mistaken for a complete document row");
  assert.equal(input.audit.after_values.settlements[0].salesId, input.draft.header.id);
  assertNativeSaleCreateEvidence(input);
});
test("native SALE audit fixture: forged/missing identity, actor, receipt, version, time, header, line or settlement facts cannot pass corrected assertion", () => {
  const changes: readonly [string, (input: ReturnType<typeof auditContractFixture>) => void][] = [
    ["missing audit identity", v => { Reflect.deleteProperty(v.audit, "object_id"); }],
    ["audit document", v => { v.audit.object_id = sid("sales", 999001); }],
    ["audit generated document", v => { v.audit.object_sales_id = sid("sales", 999001); }],
    ["audit operation", v => { v.audit.operation_id = sid("operation", 999002); }],
    ["audit actor", v => { v.audit.actor_account_id = sid("account", 999003); }],
    ["audit kind", v => { v.audit.object_type = "TRANSFER"; }],
    ["audit action", v => { v.audit.action = "APPROVE"; }],
    ["audit old version", v => { Reflect.set(v.audit, "old_version", 1); }],
    ["audit new version", v => { v.audit.new_version = 2; }],
    ["audit time", v => { v.audit.occurred_at = new Date("2026-10-22T12:00:00Z"); }],
    ["CREATE before", v => { Reflect.set(v.audit, "before_values", {}); }],
    ["invented header id", v => { v.audit.after_values.header.id = v.draft.header.id; }],
    ["header amount", v => { v.audit.after_values.header.netDue = "999"; }],
    ["missing header fact", v => { delete v.audit.after_values.header.warehouseId; }],
    ["missing line", v => { v.audit.after_values.lines = []; }],
    ["line identity", v => { v.audit.after_values.lines[0].id = sid("salesLine", 999004); }],
    ["line amount", v => { v.audit.after_values.lines[0].lineAmount = "999"; }],
    ["line MAIN observation", v => { v.audit.after_values.lines[0].snapshot.barcode = "FORGED"; }],
    ["settlement owner", v => { v.audit.after_values.settlements[0].salesId = sid("sales", 999001); }],
    ["settlement amount", v => { v.audit.after_values.settlements[0].amount = "999"; }],
    ["expected line owner", v => { v.draft.lines[0].salesId = sid("sales", 999001); }],
    ["receipt operation", v => { v.receipt.id = sid("operation", 999002); }],
    ["receipt actor", v => { v.receipt.actor_account_id = sid("account", 999003); }],
    ["receipt target", v => { v.receipt.target_id = sid("sales", 999001); }],
    ["receipt generated target", v => { v.receipt.target_sales_id = sid("sales", 999001); }],
    ["receipt kind", v => { v.receipt.target_type = "TRANSFER"; }],
    ["receipt action", v => { v.receipt.action = "APPROVE"; }],
    ["receipt key", v => { v.receipt.request_key = "OTHER_KEY"; }],
    ["receipt result", v => { v.receipt.result_data.version = 2; }],
    ["receipt time", v => { v.receipt.completed_at = new Date("2026-10-22T12:00:00Z"); }]
  ];
  for (const [name, change] of changes) { const input = auditContractFixture(); change(input); assert.throws(() => assertNativeSaleCreateEvidence(input), name); }
});

test("native SALE source: exact frozen 1–11 migration/source bytes; real source digests preserve all nine inputs including zero/blank/null", async () => {
  for (const [, filename, expected] of [...MIGRATIONS, HISTORY_MIGRATION])
    assert.equal(createHash("sha256").update(await readFile(new URL(`../adapters/postgres/migrations/${filename}`, import.meta.url))).digest("hex"), expected);
  const source = await readNativeSalesSchema11Source(); assert.equal(source.sourceFileSha256, SALE_SOURCE_SHA256);
  assert.equal(source.rows.length, 4); assert.equal(source.warehouse.raw["来源编号"], "SYNTHETIC-WAREHOUSE-1");
  const proof = createCatalogueSourcePriceProof({ nativeProductId: saleIds.product, productVersion: 1, rawFields: source.product.raw, blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" });
  assert.deepEqual(Object.keys(proof.product_input_proof.prices), [...CATALOGUE_PRICE_KEYS]);
  assert.equal(proof.product_input_proof.prices.retail_price, "1.25"); assert.equal(proof.product_input_proof.prices.wholesale6_price, "0.00");
  assert.equal(source.product.raw["七级批发价（批发价）"], ""); assert.equal(proof.product_input_proof.prices.wholesale7_price, null);
  assert.equal(source.product.raw["最低售价"], null); assert.equal(proof.product_input_proof.prices.minimum_price, null);
  for (const key of CATALOGUE_PRICE_KEYS) {
    const raw = { ...source.product.raw }; delete raw[CATALOGUE_SOURCE_PRICE_FIELDS[key]];
    assert.throws(() => createCatalogueSourcePriceProof({ nativeProductId: saleIds.product, productVersion: 1, rawFields: raw, blankPricePolicy: "V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET" }), { code: "INCOMPLETE_CATALOGUE_PRICE_INPUT" });
  }
});

test("native SALE schema11 pure gate requires exact suite, all old gates, fresh loopback target and runner marker", () => {
  assert.equal(nativeSaleSchema11Settings(fixtureEnv()).database, "naijue_erp_test_a1b2c3d4");
  for (const suite of [undefined, "", "backend-0001-0010", "history-native-reference-0001-0012", `${NATIVE_SALE_SCHEMA11_SUITE} `])
    assert.throws(() => nativeSaleSchema11Settings({ ...fixtureEnv(), NAIJUE_PG_TEST_SUITE: suite }), /exact native-sale-published-source-0001-0011/);
  for (const key of ["NODE_ENV", "NAIJUE_PG_INTEGRATION", "NAIJUE_PG_EXPECT_DATABASE", "NAIJUE_PG_TEST_DATABASE_URL"]) {
    const env = fixtureEnv(); delete env[key]; assert.throws(() => nativeSaleSchema11Settings(env), /PostgreSQL integration refused/);
  }
  for (const url of [fixtureEnv().NAIJUE_PG_TEST_DATABASE_URL!.replace("127.0.0.1", "remote.invalid"), `${fixtureEnv().NAIJUE_PG_TEST_DATABASE_URL}?ssl=true`])
    assert.throws(() => nativeSaleSchema11Settings({ ...fixtureEnv(), NAIJUE_PG_TEST_DATABASE_URL: url }), /PostgreSQL integration refused/);
  assert.throws(() => nativeSaleSchema11Settings(fixtureEnv(), true), /use scripts\/run-postgres-native-sales-schema11/);
  assert.equal(nativeSaleSchema11Settings({ ...fixtureEnv(), NAIJUE_PG_RUNNER_MARKER: "a".repeat(64) }, true).port, 55432);
});

test("native SALE source stage DTO uses the formal exact V2 metadata contract, never caller validation/actual counts", async () => {
  const source = await readNativeSalesSchema11Source(), stage = nativeSalesSchema11StageCommand(source);
  validateCutoffImportCommand(stage);
  assert.deepEqual(stage.historyMetadata, { expectedCounts: SALE_HISTORY_COUNTS, payloadHash: source.sourceFileSha256 });
  assert.equal(stage.mappingVersion, "V2_HISTORY_NULLABLE_1"); assert.equal(stage.sourceHash, source.sourceFileSha256);
  const missing = structuredClone(stage); Reflect.deleteProperty(missing, "historyMetadata");
  assert.throws(() => validateCutoffImportCommand(missing), { code: "INVALID_HISTORY_IMPORT_METADATA" });
  for (const key of ["validationPassed", "actualCounts"]) {
    const forged = structuredClone(stage); Reflect.set(forged.historyMetadata!, key, key === "actualCounts" ? SALE_HISTORY_COUNTS : true);
    assert.throws(() => validateCutoffImportCommand(forged), { code: "INVALID_HISTORY_IMPORT_METADATA" });
  }
});

test("SYNTHETIC independent fixture observation counts all tables/barcode bindings and calls original proof guard; not a publication grant", async () => {
  const h = scripted(), client = await h.pool.connect();
  assert.deepEqual(await assertNativeSaleHistoryCounts((sql, values) => client.query(sql, values)), SALE_HISTORY_COUNTS);
  assert.equal(h.calls.filter(call => call.sql.startsWith("SELECT count(*)::integer AS n")).length, 9);
  assert.match(h.calls[9]!.sql, /SELECT naijue_erp\.validate_history_product_proofs/);
  assert.ok(h.calls.every(call => call.values[0] === saleIds.batch));
  assert.ok(!h.calls.some(call => /INSERT|UPDATE|COMMIT/.test(call.sql)), "observation cannot set publication flags or replace actual production validation");
  const bad = scripted({ badCount: true }), badClient = await bad.pool.connect();
  await assert.rejects(assertNativeSaleHistoryCounts((sql, values) => badClient.query(sql, values)), /independently counted complete/);
});

test("SYNTHETIC fixture transaction: uncertain COMMIT preserves original error, discards client, does not rollback or retry", async () => {
  const unknown = new Error("SYNTHETIC lost COMMIT acknowledgement"), h = scripted({ commitError: unknown });
  await assert.rejects(runSaleFixtureTransaction(h.pool, async client => { await client.query("SYNTHETIC_WORK"); }), error => error === unknown);
  assert.deepEqual(h.calls.map(call => call.sql), ["BEGIN", "SYNTHETIC_WORK", "COMMIT"]); assert.deepEqual(h.released, [true]);
  const failure = new Error("SYNTHETIC work failure"), known = scripted({ workError: failure });
  await assert.rejects(runSaleFixtureTransaction(known.pool, async client => { await client.query("SYNTHETIC_WORK"); }), error => error === failure);
  assert.deepEqual(known.calls.map(call => call.sql), ["BEGIN", "SYNTHETIC_WORK", "ROLLBACK"]); assert.deepEqual(known.released, [false]);
  const rollbackError = new Error("SYNTHETIC rollback failure"), poisoned = scripted({ workError: failure, rollbackError });
  await assert.rejects(runSaleFixtureTransaction(poisoned.pool, async client => { await client.query("SYNTHETIC_WORK"); }), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackError);
  assert.deepEqual(poisoned.released, [true]);
});

test("native SALE runner source: no default/old flag/suite can spawn engine; original guard precedes source/pool; no bypass or destructive cleanup", async () => {
  const runner = fileURLToPath(new URL("../scripts/run-postgres-native-sales-schema11.mjs", import.meta.url));
  for (const args of [[], ["--run"], ["--run-schema11-migrations-only"], ["--run-native-sales-schema11", "extra"], ["--run-native-sales-schema11"]]) {
    const result = spawnSync(process.execPath, [runner, ...args], { env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 60000 });
    assert.equal(result.error, undefined); assert.equal(result.status, 2); assert.equal(result.stdout, ""); assert.match(result.stderr, /No connection attempted|no connection attempted/);
  }
  const entry = await readFile(new URL("./integration/native-sales-schema11.integration.ts", import.meta.url), "utf8");
  assert.ok(entry.indexOf("nativeSaleSchema11Settings(process.env, true)") < entry.indexOf("await readNativeSalesSchema11Source()"));
  assert.ok(entry.indexOf("await readNativeSalesSchema11Source()") < entry.indexOf("await openFreshHistoryDatabase(settings)"));
  assert.ok(entry.indexOf("t.after") < entry.indexOf("await runNativeSalesSchema11Acceptance"));
  const fixture = await readFile(new URL("./integration/native-sales-schema11-fixture.ts", import.meta.url), "utf8");
  assert.match(fixture, /NOT historical\/native import lifecycle acceptance/);
  assert.match(fixture, /store: new PostgresCutoffImportStore\(pool\)/);
  assert.match(fixture, /insertValidatedCatalogueSourceProof\(query/);
  assert.match(fixture, /await importer\(pool, source\)\.execute\(nativeSalesSchema11StageCommand\(source\)\)/);
  assert.match(fixture, /const result = await importer\(pool, source\)\.execute\(command\)/);
  assert.doesNotMatch(fixture, /schema11FixtureMetadataPool|sql\.replace|history_validation_passed=true/);
  assert.doesNotMatch(fixture, /new Pool|process\.env|\.listen\(|(?:DROP|TRUNCATE) (?:SCHEMA|DATABASE|TABLE)|DISABLE TRIGGER|session_replication_role|INSERT INTO naijue_erp\.(?:operation_receipt|audit_change|inventory_balance|inventory_ledger)/);
  const acceptance = await readFile(new URL("./integration/native-sales-schema11-acceptance.ts", import.meta.url), "utf8");
  assert.match(acceptance, /catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier\(\)/);
  assert.equal((acceptance.match(/await t\.test\(NATIVE_SALE_SCHEMA11_SCENARIOS\[/g) ?? []).length, 8);
  assert.match(acceptance, /nativeManualSalesPreparation: true/); assert.match(acceptance, /replay\.body, savedBody/);
});
