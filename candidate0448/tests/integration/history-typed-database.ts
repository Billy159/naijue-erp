/** Exact separate16 suite; old schema15 manifest/helper/acceptance remain unchanged. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { HISTORY_TYPED_SCHEMA16_MIGRATIONS, NATIVE_IMPORT_SCHEMA15_MIGRATIONS } from "./migration-manifest.ts";
import { openFreshNativeAccountingDatabase } from "./native-import-accounting-database.ts";
import type { IntegrationDatabase } from "./database.ts";
import type { IntegrationSettings } from "./safety.ts";
export async function openFreshHistoryTypedDatabase(settings: IntegrationSettings): Promise<IntegrationDatabase> {
  assert.equal(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.length, 15);
  const sources = await Promise.all(HISTORY_TYPED_SCHEMA16_MIGRATIONS.map(async ([, file, pin]) => {
    const bytes = await readFile(new URL(`../../adapters/postgres/migrations/${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin, `Reviewed ${file} changed; refuse before connecting`);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }));
  const database = await openFreshNativeAccountingDatabase(settings);
  const client = await database.pool.connect().catch(async error => { await database.close(); throw error; });
  try {
    const before = (await client.query("SELECT to_regprocedure('naijue_erp.guard_history_insert()')::oid id")).rows[0]!.id;
    await client.query(sources[15]!);
    assert.deepEqual((await client.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(r => r.version), Array.from({ length: 16 }, (_, i) => i + 1));
    assert.equal((await client.query("SELECT to_regprocedure('naijue_erp.guard_history_insert()')::oid id")).rows[0]!.id, before,
      "CREATE OR REPLACE must preserve function OID and every original trigger binding");
    client.release(); return database;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* discard only */ }
    client.release(true); await database.close(); throw error;
  }
}
