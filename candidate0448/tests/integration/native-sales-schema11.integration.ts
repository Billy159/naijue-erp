/** Explicit dormant genuine-PG suite; never selected by npm test/check. */
import test from "node:test";
import { nativeSaleSchema11Settings } from "./native-sales-schema11-safety.ts";
import { openFreshHistoryDatabase } from "./history-database.ts";
import { readNativeSalesSchema11Source } from "./native-sales-schema11-fixture.ts";
import { runNativeSalesSchema11Acceptance } from "./native-sales-schema11-acceptance.ts";

test("REAL PostgreSQL schema11 native SALE: lawful synthetic source proof → prepare → SAVE → replay → detail", { timeout: 240000 }, async t => {
  const settings = nativeSaleSchema11Settings(process.env, true);
  await readNativeSalesSchema11Source(); // Frozen source check precedes all connection construction.
  const database = await openFreshHistoryDatabase(settings);
  t.after(async () => { await database.close(); });
  t.diagnostic(`Actual PostgreSQL server_version_num=${database.serverVersion}; exact schema1–11; fresh synthetic target only`);
  await runNativeSalesSchema11Acceptance(t, database.pool);
});
