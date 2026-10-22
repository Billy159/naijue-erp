/** Synthetic source/gate tests only. No Pool construction, SQL execution or real
 * credentials. Real schema12 engine/native-reference acceptance: NOT_RUN. */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DISPOSABLE_DATABASE_APPROVAL } from "./integration/safety.ts";
import { HISTORY_MIGRATION } from "./integration/history-database.ts";
import { NATIVE_REFERENCE_MIGRATION, NATIVE_REFERENCE_MIGRATIONS, NATIVE_REFERENCE_SUITE,
  nativeReferenceIntegrationSettings, readReviewedNativeReferenceMigrations } from "./integration/history-native-reference-database.ts";

const fixture = (): Record<string,string> => ({ NODE_ENV: "test", NAIJUE_PG_INTEGRATION: DISPOSABLE_DATABASE_APPROVAL,
  NAIJUE_PG_TEST_SUITE: NATIVE_REFERENCE_SUITE,
  NAIJUE_PG_TEST_DATABASE_URL: "postgresql://naijue_erp_test:SYNTHETIC_NOT_A_REAL_SECRET@127.0.0.1:55432/naijue_erp_test_a1b2c3d4",
  NAIJUE_PG_EXPECT_DATABASE: "naijue_erp_test_a1b2c3d4" });

test("schema12 source only: exact 1–12 chain preserves frozen schema11 and refuses an unfrozen new pin", async () => {
  assert.deepEqual(NATIVE_REFERENCE_MIGRATIONS.map(([version]) => version), [1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.deepEqual(HISTORY_MIGRATION, [11,"0011_history_storage.sql","67d9cb6df4e46c6807330b7ed7dd22305a4d331b111b85275f900caaf5d14965"]);
  for (const [,filename,expected] of NATIVE_REFERENCE_MIGRATIONS.slice(0,11)) {
    const bytes = await readFile(new URL(`../adapters/postgres/migrations/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, filename);
  }
  if (/^[a-f0-9]{64}$/.test(NATIVE_REFERENCE_MIGRATION[2])) {
    const sources = await readReviewedNativeReferenceMigrations();
    assert.equal(sources.length, 12);
    assert.equal(createHash("sha256").update(sources[11]!).digest("hex"), NATIVE_REFERENCE_MIGRATION[2]);
  } else {
    assert.equal(NATIVE_REFERENCE_MIGRATION[2], "UNFROZEN_SCHEMA12_DO_NOT_RUN");
    await assert.rejects(readReviewedNativeReferenceMigrations(), /Schema12 pin is not frozen/);
  }
});

test("schema12 gate: exact new suite required; no schema11/historical/unknown label can masquerade", () => {
  for (const suite of [undefined,"","schema11","history-0001-0011","sparse-0001-0010","backend-0001-0010","all",`${NATIVE_REFERENCE_SUITE} `])
    assert.throws(() => nativeReferenceIntegrationSettings({ ...fixture(), NAIJUE_PG_TEST_SUITE: suite }), /exact history-native-reference-0001-0012 suite/);
  assert.equal(nativeReferenceIntegrationSettings(fixture()).database, "naijue_erp_test_a1b2c3d4");
});

test("schema12 gate: reuses every required opt-in and rejects unsafe target URLs without credential leakage", () => {
  for (const key of ["NODE_ENV","NAIJUE_PG_INTEGRATION","NAIJUE_PG_TEST_DATABASE_URL","NAIJUE_PG_EXPECT_DATABASE"]) {
    const env = fixture(); delete env[key]; env.DATABASE_URL = fixture().NAIJUE_PG_TEST_DATABASE_URL!;
    assert.throws(() => nativeReferenceIntegrationSettings(env), /PostgreSQL integration refused/);
  }
  const original = fixture().NAIJUE_PG_TEST_DATABASE_URL!;
  for (const url of [original.replace("127.0.0.1","db.example.invalid"), original.replace("naijue_erp_test:","postgres:"),
    original.replace("naijue_erp_test_a1b2c3d4","production"), original.replace(":55432", ""), original.replace(":55432",":443"),
    `${original}?search_path=untrusted`, `${original}?host=remote.example.invalid`, `${original}#schema12`, ` ${original}`]) {
    assert.throws(() => nativeReferenceIntegrationSettings({ ...fixture(), NAIJUE_PG_TEST_DATABASE_URL: url }), error => {
      assert.ok(error instanceof Error); assert.match(error.message, /PostgreSQL integration refused/);
      assert.ok(!error.message.includes("SYNTHETIC_NOT_A_REAL_SECRET") && !error.message.includes(url)); return true;
    });
  }
});

test("schema12 source boundary: all hashes precede unchanged fresh helper; no direct Pool or destructive cleanup", async () => {
  const source = await readFile(new URL("./integration/history-native-reference-database.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("await readReviewedNativeReferenceMigrations()") < source.indexOf("await openFreshHistoryDatabase(settings)"));
  assert.match(source, /createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\), expected/);
  assert.match(source, /await client\.query\(sources\[11\]!\)/);
  assert.doesNotMatch(source, /new Pool|DROP (?:SCHEMA|DATABASE)|TRUNCATE|process\.env|DATABASE_URL/);
  const unchangedSchema11 = await readFile(new URL("./integration/history-database.ts", import.meta.url));
  assert.equal(createHash("sha256").update(unchangedSchema11).digest("hex"), "1e2fc006813460e9d83c7f2610c17dae16a0d4cb5ff93f721430110a1b4321f9");
});

test("schema12 runner source only: no-argument, old flags and old suite refuse before any connection", async () => {
  const runner = fileURLToPath(new URL("../scripts/run-postgres-history-native-reference-database.mjs", import.meta.url));
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test" };
  for (const args of [[],["--run"],["--run-schema11-migrations-only"],["--run-schema12-migrations-only","--run-schema12-migrations-only"]]) {
    const result = spawnSync(process.execPath,[runner,...args],{ env,encoding:"utf8",timeout:60000 });
    assert.equal(result.error,undefined,"source-only refusal subprocess must start and finish without timeout");
    assert.equal(result.signal,null,"source-only refusal subprocess must exit normally");
    assert.equal(result.status,2); assert.match(result.stderr,/No connection attempted/); assert.equal(result.stdout,"");
  }
  const refused = spawnSync(process.execPath,[runner,"--run-schema12-migrations-only"],{ env:{ ...env,...fixture(),NAIJUE_PG_TEST_SUITE:"backend-0001-0010" },encoding:"utf8",timeout:60000 });
  assert.equal(refused.error,undefined,"old-suite refusal subprocess must start and finish without timeout");
  assert.equal(refused.signal,null,"old-suite refusal subprocess must exit normally");
  assert.equal(refused.status,1); assert.equal(refused.stdout,""); assert.match(refused.stderr,/no engine\/source\/import acceptance is claimed/);
  const source = await readFile(runner,"utf8");
  assert.match(source,/phase: 'SCHEMA12_MIGRATIONS_ONLY'/); assert.match(source,/sourceProofAcceptance: 'NOT_RUN'/); assert.match(source,/nativeReferenceAcceptance: 'NOT_RUN'/);
  assert.doesNotMatch(source,/dotenv|spawn\(|\.query\(|new Pool|--run-schema11-migrations-only/);
  const oldRunner = await readFile(new URL("../scripts/run-postgres-schema11-migrations.mjs", import.meta.url));
  assert.equal(createHash("sha256").update(oldRunner).digest("hex"), "80bb1b9d15214d81ca356c5e44ea505e07c8a3f62a0b0d3ac69a1cee4ce10a33");
});
