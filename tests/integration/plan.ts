/** Connection-free operator plan. No env/credential reads, pg import, execution, provisioning or server startup. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BACKEND_SCENARIOS, HTTP_READ_SCENARIOS, NATIVE_POLICY_SCENARIOS, SALES_WRITE_AUTHORIZATION_SCENARIOS, METHOD_IDENTITY_SCENARIOS, MIGRATIONS, SPARSE_SCENARIOS } from "./migration-manifest.ts";
import { integrationSuite, requireCurrentIntegrationSuite } from "./safety.ts";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--suite") throw new Error("Plan only: node tests/integration/plan.ts --suite sparse-0001-0010|backend-0001-0010");
const suite = integrationSuite({ NAIJUE_PG_TEST_SUITE: args[1] });
requireCurrentIntegrationSuite(suite);
// All ten reviewed bytes are verified; this never constructs a Pool.
for (const [, name, hash] of MIGRATIONS) {
  const source = await readFile(new URL(`../../adapters/postgres/migrations/${name}`, import.meta.url), "utf8");
  if (createHash("sha256").update(source).digest("hex") !== hash) throw new Error(`Plan refused: reviewed migration hash differs for ${name}`);
}
console.log(JSON.stringify({ mode: "PLAN_ONLY_NO_CONNECTION", suite,
  note: "CURRENT schema1–10 only. All ten migrations precede every product fixture; 0009 empty-catalogue guard remains active. Earlier1–8 results are historical, not current passes.",
  evidenceStatus: "CURRENT1_TO10_NOT_RUN",
  fixtureOrder: ["fresh-target guards", "exact migrations1–10 with empty product table", "synthetic ordinary references", "real current party CREATE service/store", "explicit nine-price product/SKU/image fixtures without stock"],
  migrations: MIGRATIONS.map(([version, filename, sha256]) => ({ version, filename, sha256 })),
  scenarios: suite === "backend-0001-0010" ? [...BACKEND_SCENARIOS, ...HTTP_READ_SCENARIOS, ...NATIVE_POLICY_SCENARIOS, ...SALES_WRITE_AUTHORIZATION_SCENARIOS, ...METHOD_IDENTITY_SCENARIOS] : SPARSE_SCENARIOS,
  requiredGatesForExecution: ["explicit approval of the exact operator-selected fresh disposable physical target", "NODE_ENV=test", "NAIJUE_PG_INTEGRATION", `NAIJUE_PG_TEST_SUITE=${suite}`, "NAIJUE_PG_EXPECT_DATABASE", "NAIJUE_PG_TEST_DATABASE_URL", "existing --run entry point and marker", "server-side fresh/exclusive loopback non-admin owner checks"],
  notExecuted: ["PostgreSQL", "SQL/DDL/EXPLAIN", "migration", "reference inserts", "network", "server startup", "package installation"]
}, null, 2));
