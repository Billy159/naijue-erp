/** Exact fresh empty18 wrapper. Importing this helper opens nothing. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS } from "./migration-manifest.ts";
import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import type { IntegrationSettings } from "./safety.ts";
export async function openFreshHistoryClosureDatabase(settings: IntegrationSettings) {
 // Verify all18 source bytes before any Pool, not a maxVersion guess or caller-derived pin.
 const sources = await Promise.all(HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS.map(async ([, name, hash]) => {
  const bytes = await readFile(new URL("../../adapters/postgres/migrations/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, name); return bytes;
 }));
 const database = await openFreshNativePaymentDatabase(settings);
 try {
  await database.pool.query(sources[17]!.toString("utf8"));
  assert.deepEqual((await database.pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(r => r.version), Array.from({ length: 18 }, (_, i) => i + 1));
  return database;
 } catch (error) { await database.close(); throw error; }
}
