/** Reviewer-only source/plan probes. No pg import, SQL execution, server, install or network. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "../tests/integration/migration-manifest.ts";
import { integrationSuite, requireCurrentIntegrationSuite } from "../tests/integration/safety.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const guard = fileURLToPath(new URL("./postgres-current-harness-independent-guard.mjs", import.meta.url));
function plan(args) {
  return spawnSync(process.execPath, ["--import", guard, "tests/integration/plan.ts", ...args], {
    cwd: root, env: { NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 10000
  });
}
assert.deepEqual(MIGRATIONS.map(([version]) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
for (const [, name, expected] of MIGRATIONS) {
  const source = await readFile(new URL(`../adapters/postgres/migrations/${name}`, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), expected, name);
}
console.log("PASS: all eight explicit migration hashes match original source bytes");
for (const suite of ["sparse-0001-0008"]) {
  const result = plan(["--suite", suite]);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.mode, "PLAN_ONLY_NO_CONNECTION");
  assert.equal(parsed.suite, suite);
  assert.equal(parsed.migrations.length, 8);
  assert.ok(parsed.notExecuted.includes("network"));
  console.log(`PASS: ${suite} plan under blocked driver/network/spawn imports and blocked target/credential environment reads`);
}
for (const args of [[], ["--suite", "unknown"], ["--suite", "sparse-0001-0008 "], ["--suite", "native-0001-0005"]]) {
  const result = plan(args);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /Independent source-only guard blocked/u);
}
console.log("PASS: missing/unknown/whitespace/historical plan selections refuse with no fallback");
assert.throws(() => requireCurrentIntegrationSuite(integrationSuite({ NAIJUE_PG_TEST_SUITE: "native-0001-0005" })), /historical source only/u);
const entry = await readFile(new URL("../tests/integration/postgres.integration.test.ts", import.meta.url), "utf8");
assert.ok(entry.indexOf("requireCurrentIntegrationSuite(suite)") < entry.indexOf("await openFreshDatabase(settings"));
assert.equal((entry.match(/historicalNativeAcceptanceSource\(/gu) ?? []).length, 1, "historical body must be declared but uncalled");
const database = await readFile(new URL("../tests/integration/database.ts", import.meta.url), "utf8");
assert.ok(database.indexOf("await Promise.all(MIGRATIONS.map") < database.indexOf("new Pool("));
assert.doesNotMatch(database, /DROP\s+(?:DATABASE|SCHEMA)|TRUNCATE|DELETE\s+FROM|pg_terminate_backend|DISABLE\s+TRIGGER/iu);
console.log("PASS: historical runtime refusal/source gate ordering, all-hash-before-Pool source shape, and no destructive database-helper cleanup");
console.log("RESULT: independent source-only probes passed; PostgreSQL/SQL/DDL/EXPLAIN/locks/rollback durability NOT RUN");
