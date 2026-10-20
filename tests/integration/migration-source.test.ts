/** SQL-source/hash and fabricated diagnostic regressions only. Imports pg, but never constructs a Pool or executes SQL. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MIGRATIONS, migrationExecutionFailure } from "./database.ts";

const originalCondition = "OR NEW.warehouse_id IS DISTINCT FROM CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END";
const correctedCondition = "OR NEW.warehouse_id IS DISTINCT FROM (CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END)";
const originalStatus = "OR h.status <> CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END";
const correctedStatus = "OR h.status <> (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)";
const frozen = [
  ["0004_transfer_runtime.sql", "a85dd812fdf561652433e6fc2da49024f95db1137e52b84170470ec5f937224d"],
  ["0008_runtime_sparse_first_use.sql", "4ad006940ddf408a01d319941ce7eba80abefb571788beeb1e8c7edcf60f5765"]
] as const;

for (const [filename, originalHash] of frozen) {
  test(`migration SQL source only: ${filename} differs from frozen failure only by top-level IF CASE parentheses`, async () => {
    const sql = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url), "utf8");
    assert.equal(sql.split(correctedCondition).length - 1, 1);
    assert.ok(!sql.includes(originalCondition), "the ambiguous unparenthesized IF expression must not return");
    let normalized = sql.replace(correctedCondition, originalCondition);
    if (filename === "0004_transfer_runtime.sql") {
      assert.equal(sql.split(correctedStatus).length - 1, 1);
      assert.ok(!sql.includes(originalStatus), "the second top-level IF CASE must also be delimited");
      normalized = normalized.replace(correctedStatus, originalStatus);
    }
    assert.equal(createHash("sha256").update(normalized).digest("hex"), originalHash,
      "no schema, field, business-rule or other migration byte may change under this syntax correction");
  });
}

test("migration manifest source only: exact reviewed 0001-0008 hashes still match all source bytes", async () => {
  assert.deepEqual(MIGRATIONS.map(([version]) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const [, filename, expected] of MIGRATIONS) {
    const sql = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(sql).digest("hex"), expected, filename);
  }
});

test("migration fabricated diagnostic: filename, SQLSTATE and source position survive without driver text or secrets", () => {
  const unsafe = "SYNTHETIC_SQL_DSN_PASSWORD_MUST_NOT_LEAK";
  const original = Object.assign(new Error(unsafe), { code: "42601", position: "11489", detail: unsafe,
    where: unsafe, internalQuery: unsafe, connectionString: unsafe, password: unsafe });
  const failure = migrationExecutionFailure("0004_transfer_runtime.sql", original);
  assert.equal(failure.name, "MigrationExecutionError");
  assert.equal(failure.message, "Reviewed migration 0004_transfer_runtime.sql failed (SQLSTATE 42601; position 11489). Database text omitted.");
  assert.equal(Reflect.get(failure, "code"), "42601"); assert.equal(Reflect.get(failure, "position"), "11489");
  assert.deepEqual(Object.keys(failure).sort(), ["code", "migration", "name", "position"]);
  assert.ok(!String(failure.stack).includes(unsafe)); assert.ok(!JSON.stringify(failure).includes(unsafe));
  assert.equal(Reflect.get(failure, "cause"), undefined);
  assert.equal(original.message, unsafe, "do not mutate the original error object");
});

test("migration fabricated diagnostic: malformed or unavailable fields cannot leak arbitrary driver content", () => {
  for (const input of [null, undefined, "unsafe", new Error("unsafe"),
    { code: "42601 unsafe", position: "11489 unsafe" }, { code: "42601\n", position: "0" },
    { code: 42601, position: 11489 }, { code: "unsafe", position: "1".repeat(11) }]) {
    const failure = migrationExecutionFailure("0008_runtime_sparse_first_use.sql", input);
    assert.match(failure.message, /SQLSTATE unknown; position unknown/u);
    assert.doesNotMatch(failure.message, /unsafe/u);
  }
});
