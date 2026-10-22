/** Source/byte contract only. Does not connect or authorize a migration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MIGRATIONS, NATIVE_IMPORT_SCHEMA15_MIGRATIONS } from "./integration/migration-manifest.ts";
test("schema15 has its own exact 1-15 source manifest while the previously accepted ten-migration suites stay unchanged", async () => {
  assert.equal(MIGRATIONS.length, 10);
  assert.deepEqual(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.slice(0, 10), MIGRATIONS);
  assert.deepEqual(NATIVE_IMPORT_SCHEMA15_MIGRATIONS.map(([version]) => version), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
  for (const [_version, file, expected] of NATIVE_IMPORT_SCHEMA15_MIGRATIONS) {
    const bytes = await readFile(new URL(`../adapters/postgres/migrations/${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, file);
  }
});
