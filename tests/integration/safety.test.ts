/** Pure gate unit tests. No pg import, no database, no service, no actual environment credentials. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DISPOSABLE_DATABASE_APPROVAL, integrationSettings, integrationSuite, requireCurrentIntegrationSuite, safeTarget } from "./safety.ts";

const fixture = () => ({ NODE_ENV: "test", NAIJUE_PG_INTEGRATION: DISPOSABLE_DATABASE_APPROVAL,
  NAIJUE_PG_TEST_DATABASE_URL: "postgresql://naijue_erp_test:SYNTHETIC_NOT_A_REAL_SECRET@127.0.0.1:55432/naijue_erp_test_a1b2c3d4",
  NAIJUE_PG_EXPECT_DATABASE: "naijue_erp_test_a1b2c3d4", NAIJUE_PG_RUNNER_MARKER: "a".repeat(64) });

test("integration safety: missing gates fail, and ambient DATABASE_URL is never a fallback", () => {
  for (const key of ["NODE_ENV", "NAIJUE_PG_INTEGRATION", "NAIJUE_PG_TEST_DATABASE_URL", "NAIJUE_PG_EXPECT_DATABASE", "NAIJUE_PG_RUNNER_MARKER"] as const) {
    const input: Record<string, string> = fixture(); delete input[key];
    input.DATABASE_URL = fixture().NAIJUE_PG_TEST_DATABASE_URL;
    assert.throws(() => integrationSettings(input, true), /PostgreSQL integration refused/);
  }
});
test("integration safety: accepts only a dedicated explicitly repeated loopback test target", () => {
  const target = integrationSettings(fixture(), true);
  assert.equal(target.host, "127.0.0.1"); assert.equal(target.database, "naijue_erp_test_a1b2c3d4");
  assert.equal(safeTarget(target), "127.0.0.1:55432/naijue_erp_test_a1b2c3d4");
  for (const host of ["localhost", "[::1]"]) assert.ok(integrationSettings({ ...fixture(), NAIJUE_PG_TEST_DATABASE_URL: fixture().NAIJUE_PG_TEST_DATABASE_URL.replace("127.0.0.1", host) }, true));
});
test("integration safety: rejects remote, production-like, privileged, ambiguous and option-overridden URLs", () => {
  const original = fixture().NAIJUE_PG_TEST_DATABASE_URL;
  const urls = [original.replace("127.0.0.1", "db.example.invalid"), original.replace("127.0.0.1", "127.0.0.2"),
    original.replace("127.0.0.1", "localhost.example.invalid"), original.replace("naijue_erp_test_a1b2c3d4", "production"),
    original.replace("naijue_erp_test_a1b2c3d4", "naijue_erp_test_production"), original.replace("naijue_erp_test:", "postgres:"),
    original.replace(":55432", ""), original.replace(":55432", ":0"), original.replace(":55432", ":443"),
    `${original}?host=db.example.invalid`, `${original}?sslmode=require`, `${original}#ignored`, `${original}/extra`,
    original.replace("postgresql:", "https:"), original.replace("SYNTHETIC_NOT_A_REAL_SECRET", ""), ` ${original}`];
  for (const url of urls) assert.throws(() => integrationSettings({ ...fixture(), NAIJUE_PG_TEST_DATABASE_URL: url }, true), /PostgreSQL integration refused/);
});
test("integration safety: malformed and encoded credentials never appear in diagnostics", () => {
  const secret = "SYNTHETIC_DO_NOT_LOG";
  const input = { ...fixture(), NAIJUE_PG_TEST_DATABASE_URL: `postgresql://naijue_erp_test:${secret}@remote.example.invalid:55432/production` };
  try { integrationSettings(input, true); assert.fail("must refuse"); }
  catch (error) { assert.ok(error instanceof Error); assert.ok(!error.message.includes(secret)); assert.ok(!error.message.includes(input.NAIJUE_PG_TEST_DATABASE_URL)); }
  assert.throws(() => integrationSettings({ ...fixture(), NAIJUE_PG_TEST_DATABASE_URL: fixture().NAIJUE_PG_TEST_DATABASE_URL.replace("SYNTHETIC_NOT_A_REAL_SECRET", "%00") }, true));
});
test("integration safety SQL-source regression: server address uses host(inet), not a subnet-bearing text cast", async () => {
  const source = await readFile(new URL("./database.ts", import.meta.url), "utf8");
  assert.match(source, /host\(inet_server_addr\(\)\) AS address/u);
  assert.doesNotMatch(source, /inet_server_addr\(\)::text AS address/u);
});

test("integration safety: acceptance scenario is explicit, closed and never inferred from ambient database settings", () => {
  for (const value of [undefined, "", "sparse", "all", "sparse-0001-0008 "]) assert.throws(() => integrationSuite({ NAIJUE_PG_TEST_SUITE: value }), /explicit NAIJUE_PG_TEST_SUITE/);
  for (const value of ["native-0001-0005", "sparse-0001-0008"] as const) assert.equal(integrationSuite({ NAIJUE_PG_TEST_SUITE: value }), value);
});

test("integration safety: historical migration prefix refuses before pool construction at current adapter revision", () => {
  assert.throws(() => requireCurrentIntegrationSuite("native-0001-0005"), /historical source only/);
  assert.doesNotThrow(() => requireCurrentIntegrationSuite("sparse-0001-0008"));
});
