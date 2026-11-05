/** Opt-in engine acceptance for an already-approved disposable schema11 target
 * containing a SYNTHETIC, genuinely published PRODUCT source-proof fixture.
 * No pool construction, migration, import, trigger bypass or automatic execution.
 * This helper has NOT been run merely by the ordinary node unit test suite. */
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { PostgresImportedCatalogueCompletenessVerifier } from "../../adapters/postgres/src/catalogue-completeness.ts";
import { entityId } from "../../packages/domain/src/values.ts";

export async function verifyCatalogueCompletenessOnApprovedDisposable(pool: Pool, syntheticProductId: string): Promise<readonly string[]> {
  const identity = (await pool.query("SELECT current_database() AS database, current_user AS role")).rows[0];
  assert.match(identity.database, /^naijue_erp_test_/); assert.equal(identity.role, "naijue_erp_test");
  assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), [1,2,3,4,5,6,7,8,9,10,11]);
  const productId = entityId("product", syntheticProductId), verifier = new PostgresImportedCatalogueCompletenessVerifier();
  const client = await pool.connect(); const evidence: string[] = [];
  try {
    await client.query("BEGIN");
    const query = async (sql: string, values?: unknown[]) => client.query(sql, values);
    const check = () => verifier.assertComplete({ productIds: [productId], query });
    await check(); evidence.push("published immutable exact-nine input proof read on original PostgreSQL transaction");
    for (const [name, sql] of [
      ["changed product version", "UPDATE naijue_erp.product SET version=version+1 WHERE id=$1"],
      ["changed nullable price", "UPDATE naijue_erp.product SET minimum_price=CASE WHEN minimum_price IS NULL THEN 0 ELSE NULL END WHERE id=$1"]
    ] as const) {
      await client.query("SAVEPOINT source_proof_case"); await client.query(sql, [productId]);
      await assert.rejects(check); await client.query("ROLLBACK TO SAVEPOINT source_proof_case");
      await check(); evidence.push(`${name} rejected; original proof restored by rollback`);
    }
    // Source metadata is append-only even though price authority itself can evolve.
    await client.query("SAVEPOINT source_proof_immutable");
    await assert.rejects(client.query("UPDATE naijue_erp.import_source_row SET row_sha256=repeat('c',64) WHERE entity_type='PRODUCT' AND field_provenance->>'native_product_id'=$1", [productId]));
    await client.query("ROLLBACK TO SAVEPOINT source_proof_immutable"); await check();
    evidence.push("persisted source proof mutation rejected by database");
    await client.query("ROLLBACK"); return evidence;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
