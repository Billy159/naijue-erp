/** Separate opt-in exact schema1–15 fresh synthetic target. Never reuse or clean a target. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NATIVE_IMPORT_SCHEMA15_MIGRATIONS } from "./migration-manifest.ts";
import { openFreshHistoryNativeReferenceDatabase } from "./history-native-reference-database.ts";
import { integrationSettings } from "./safety.ts";
import type { IntegrationSettings } from "./safety.ts";
import type { IntegrationDatabase } from "./database.ts";

export const ACCOUNTING_SUITE = "native-import-accounting-0001-0015";
export function accountingIntegrationSettings(env: Readonly<Record<string, string | undefined>>): IntegrationSettings {
  assert.equal(env.NAIJUE_PG_TEST_SUITE, ACCOUNTING_SUITE, "Exact separate native accounting suite required before connecting");
  return integrationSettings(env);
}

export async function openFreshNativeAccountingDatabase(settings: IntegrationSettings): Promise<IntegrationDatabase> {
  const sources = await Promise.all(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.map(async ([, filename, expected]) => {
    const bytes = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `Reviewed ${filename} changed; refuse before connection`);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }));
  assert.deepEqual(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.map(([n]) => n), Array.from({ length: 15 }, (_, i) => i + 1));
  const database = await openFreshHistoryNativeReferenceDatabase(settings);
  const client = await database.pool.connect().catch(async error => { await database.close(); throw error; });
  try {
    for (let i = 12; i < sources.length; i++) {
      try { await client.query(sources[i]!); }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        throw new Error(`Reviewed schema${i + 1} migration failed (SQLSTATE ${code}); disposable target must not be reused`, { cause: error });
      }
      assert.deepEqual((await client.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version),
        Array.from({ length: i + 1 }, (_, n) => n + 1));
    }
    client.release(); return database;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* discard only */ }
    client.release(true); await database.close(); throw error;
  }
}
