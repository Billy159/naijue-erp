/** Connection-free operator plan. No env/credential reads, pg import, execution, provisioning or server startup. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BACKEND_SCENARIOS, MIGRATIONS, SPARSE_SCENARIOS } from "./migration-manifest.ts";
import { integrationSuite, requireCurrentIntegrationSuite } from "./safety.ts";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--suite") throw new Error("Plan only: node tests/integration/plan.ts --suite sparse-0001-0008|backend-0001-0008");
const suite = integrationSuite({ NAIJUE_PG_TEST_SUITE: args[1] });
requireCurrentIntegrationSuite(suite);
// All eight reviewed bytes are verified; this never constructs a Pool.
for (const [, name, hash] of MIGRATIONS) {
  const source = await readFile(new URL(`../../adapters/postgres/migrations/${name}`, import.meta.url), "utf8");
  if (createHash("sha256").update(source).digest("hex") !== hash) throw new Error(`Plan refused: reviewed migration hash differs for ${name}`);
}
console.log(JSON.stringify({ mode: "PLAN_ONLY_NO_CONNECTION", suite,
  note: "One current schema; exact separately authorized fresh disposable target required before real execution.",
  migrations: MIGRATIONS.map(([version, filename, sha256]) => ({ version, filename, sha256 })),
  scenarios: suite === "backend-0001-0008" ? BACKEND_SCENARIOS : SPARSE_SCENARIOS,
  requiredGatesForExecution: ["explicit approval of the exact operator-selected fresh disposable physical target", "NODE_ENV=test", "NAIJUE_PG_INTEGRATION", `NAIJUE_PG_TEST_SUITE=${suite}`, "NAIJUE_PG_EXPECT_DATABASE", "NAIJUE_PG_TEST_DATABASE_URL", "existing --run entry point and marker", "server-side fresh/exclusive loopback non-admin owner checks"],
  notExecuted: ["PostgreSQL", "SQL/DDL/EXPLAIN", "migration", "reference inserts", "network", "server startup", "package installation"]
}, null, 2));
