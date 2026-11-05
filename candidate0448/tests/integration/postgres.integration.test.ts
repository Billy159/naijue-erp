/** DORMANT CURRENT REAL-POSTGRESQL SUITE. Not selected by npm test/check.
 * Source preparation only until a separately approved fresh schema1–10 engine run. Older evidence is not reused. */
import test from "node:test";
import { integrationSettings, integrationSuite, requireCurrentIntegrationSuite } from "./safety.ts";
import { openFreshDatabase } from "./database.ts";
import { runSparseAcceptance, SPARSE_SCENARIOS } from "./sparse-acceptance.ts";
import { BACKEND_SCENARIOS, runBackendAcceptance } from "./backend-acceptance.ts";
import { HTTP_READ_SCENARIOS, NATIVE_POLICY_SCENARIOS, SALES_WRITE_AUTHORIZATION_SCENARIOS, METHOD_IDENTITY_SCENARIOS } from "./migration-manifest.ts";
import { runHttpReadAcceptance } from "./http-read-acceptance.ts";
import { runNativeHttpReadAcceptance } from "./native-http-read-acceptance.ts";
import { runSalesWriteAuthorizationAcceptance } from "./sales-write-authorization-acceptance.ts";
import { runMethodIdentityAcceptance } from "./method-identity-acceptance.ts";
import { seedSyntheticReferences } from "./fixtures.ts";

test("REAL PostgreSQL CURRENT1–10: explicit disposable target and selected synthetic acceptance scenario", { timeout: 240000 }, async t => {
  const settings = integrationSettings(process.env, true);
  const suite = integrationSuite(process.env);
  requireCurrentIntegrationSuite(suite);
  const database = await openFreshDatabase(settings);
  t.after(async () => { await database.close(); });
  const { pool } = database;
  // 0009 requires an empty product table. Never seed products in an intermediate migration window.
  await seedSyntheticReferences(pool);
  t.diagnostic(`Actual PostgreSQL server_version_num=${database.serverVersion}; current schema1–10; synthetic disposable target only`);
  t.diagnostic(`Selected CURRENT suite=${suite}; prepared scenarios: ${(suite === "backend-0001-0010" ? [...BACKEND_SCENARIOS, ...HTTP_READ_SCENARIOS, ...NATIVE_POLICY_SCENARIOS, ...SALES_WRITE_AUTHORIZATION_SCENARIOS, ...METHOD_IDENTITY_SCENARIOS] : SPARSE_SCENARIOS).join("; ")}`);
  if (suite === "backend-0001-0010") {
    await runBackendAcceptance(t, pool);
    await runHttpReadAcceptance(t, pool, settings);
    await runNativeHttpReadAcceptance(t, pool, settings);
    await runSalesWriteAuthorizationAcceptance(t, pool);
    await runMethodIdentityAcceptance(t, pool);
  }
  else await runSparseAcceptance(t, pool);
});
