/** Explicit schema11 extension. Fresh target guard and exact 1–10 hashes are
 * reused unchanged; 0011 is checked BEFORE constructing any pool. No auto-run. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { openFreshDatabase } from "./database.ts";
import type { IntegrationDatabase } from "./database.ts";
import type { IntegrationSettings } from "./safety.ts";
export const HISTORY_MIGRATION = [11, "0011_history_storage.sql", "67d9cb6df4e46c6807330b7ed7dd22305a4d331b111b85275f900caaf5d14965"] as const;
export async function openFreshHistoryDatabase(settings: IntegrationSettings): Promise<IntegrationDatabase> {
  const sql = await readFile(new URL(`../../adapters/postgres/migrations/${HISTORY_MIGRATION[1]}`, import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(sql).digest("hex"), HISTORY_MIGRATION[2], "Reviewed schema11 SQL bytes changed; stop for review before connecting");
  const database = await openFreshDatabase(settings);
  const client = await database.pool.connect().catch(async error => { await database.close(); throw error; });
  try {
    await client.query(sql);
    assert.deepEqual((await client.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), [1,2,3,4,5,6,7,8,9,10,11]);
    client.release(); return database;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* discard only, never destructive cleanup */ }
    client.release(true); await database.close();
    const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
    throw new Error(`Reviewed schema11 migration failed (SQLSTATE ${code}); database text omitted; target must not be reused`);
  }
}
