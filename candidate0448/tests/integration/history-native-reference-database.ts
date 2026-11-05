/** Explicit schema12 migration-only extension. Dormant unless the separate guarded
 * runner is invoked; no source-import/native-reference acceptance is implied. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MIGRATIONS } from "./migration-manifest.ts";
import { HISTORY_MIGRATION, openFreshHistoryDatabase } from "./history-database.ts";
import type { IntegrationDatabase } from "./database.ts";
import { integrationSettings } from "./safety.ts";
import type { IntegrationSettings } from "./safety.ts";

export const NATIVE_REFERENCE_SUITE = "history-native-reference-0001-0012";
// Independently reviewed final SQL source bytes; this pin is not engine acceptance.
export const NATIVE_REFERENCE_MIGRATION = [12, "0012_history_header_native_reference.sql", "4a42df55804be3f7fb41fca3230364f392ed4338e3a0a80934f7debe7a04b512"] as const;
export const NATIVE_REFERENCE_MIGRATIONS = [...MIGRATIONS, HISTORY_MIGRATION, NATIVE_REFERENCE_MIGRATION] as const;
const VERSIONS = [1,2,3,4,5,6,7,8,9,10,11,12] as const;

/** Pure gate: old/historical suite labels and unsafe URLs never reach a driver. */
export function nativeReferenceIntegrationSettings(env: Readonly<Record<string, string | undefined>>): IntegrationSettings {
  if (env.NAIJUE_PG_TEST_SUITE !== NATIVE_REFERENCE_SUITE)
    throw new Error("Schema12 integration refused: exact history-native-reference-0001-0012 suite is required; schema11 or historical passes cannot be reused");
  return integrationSettings(env);
}

/** All exact 1–12 source hashes are verified BEFORE the schema11 helper can
 * construct any Pool. A pending pin is a refusal, never a self-derived hash. */
export async function readReviewedNativeReferenceMigrations(): Promise<readonly string[]> {
  assert.deepEqual(NATIVE_REFERENCE_MIGRATIONS.map(([version]) => version), VERSIONS, "Schema12 requires the exact reviewed 1–12 chain");
  assert.match(NATIVE_REFERENCE_MIGRATION[2], /^[a-f0-9]{64}$/, "Schema12 pin is not frozen; no database connection is authorized");
  return Promise.all(NATIVE_REFERENCE_MIGRATIONS.map(async ([, filename, expected]) => {
    const bytes = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `Reviewed schema12 chain migration ${filename} changed; stop before connecting`);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }));
}

/** Reuses the unchanged schema11 wrapper, including exact 1–10 hashes and its
 * loopback/identity/freshness/advisory-lock guards. Never cleans or reuses a DB. */
export async function openFreshHistoryNativeReferenceDatabase(settings: IntegrationSettings): Promise<IntegrationDatabase> {
  const sources = await readReviewedNativeReferenceMigrations();
  const database = await openFreshHistoryDatabase(settings);
  const client = await database.pool.connect().catch(async () => {
    await database.close();
    throw new Error("Schema12 connection acquisition failed; database text omitted; target must not be reused");
  });
  try {
    await client.query(sources[11]!);
    assert.deepEqual((await client.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(row => row.version), VERSIONS);
    client.release();
    return database;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* discard only, never destructive cleanup */ }
    client.release(true); await database.close();
    const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
    throw new Error(`Reviewed schema12 migration failed (SQLSTATE ${code}); database text omitted; target must not be reused`);
  }
}
