import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HISTORY_MIGRATION } from "./integration/history-database.ts";
test("schema11 explicit helper pins exact SQL, reuses fresh guards, and remains separate from historical 1–10 suites", async () => {
  const sql = await readFile(new URL(`../adapters/postgres/migrations/${HISTORY_MIGRATION[1]}`, import.meta.url));
  assert.equal(createHash("sha256").update(sql).digest("hex"), HISTORY_MIGRATION[2]);
  const source = await readFile(new URL("./integration/history-database.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf('createHash("sha256").update(sql)') < source.indexOf('await openFreshDatabase(settings)'));
  assert.match(source, /await openFreshDatabase\(settings\)/);
  const runner = await readFile(new URL("../scripts/run-postgres-schema11-migrations.mjs", import.meta.url), "utf8");
  assert.match(runner, /--run-schema11-migrations-only/); assert.match(runner, /sourceProofAcceptance: 'NOT_RUN'/);
});
