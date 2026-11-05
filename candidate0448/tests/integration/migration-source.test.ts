/** SQL-source/hash and fabricated diagnostic regressions only. Imports pg, but never constructs a Pool or executes SQL. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MIGRATIONS, migrationExecutionFailure } from "./database.ts";
import { FROZEN_0001_0008_MIGRATIONS } from "./frozen-0001-0008-manifest.ts";

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

test("historical SQL baseline source only: frozen 0001-0008 hashes remain unchanged, not a current executable suite", async () => {
  assert.deepEqual(FROZEN_0001_0008_MIGRATIONS.map(([version]) => version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(MIGRATIONS.slice(0, 8), FROZEN_0001_0008_MIGRATIONS);
  for (const [, filename, expected] of FROZEN_0001_0008_MIGRATIONS) {
    const sql = await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url));
    assert.equal(createHash("sha256").update(sql).digest("hex"), expected, filename);
  }
});

test("CURRENT migration manifest source only: exact reviewed1–10 bytes include empty-catalogue and nullable method identity guards", async () => {
  assert.deepEqual(MIGRATIONS.map(([version]) => version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const [, filename, expected] of MIGRATIONS) {
    assert.equal(createHash("sha256").update(await readFile(new URL(`../../adapters/postgres/migrations/${filename}`, import.meta.url))).digest("hex"), expected, filename);
  }
  const nine = await readFile(new URL("../../adapters/postgres/migrations/0009_catalogue_prices_barcodes.sql", import.meta.url), "utf8");
  assert.match(nine, /ARRAY\[1,2,3,4,5,6,7,8\]/u);
  assert.match(nine, /IF EXISTS \(SELECT 1 FROM naijue_erp\.product\)/u);
  const ten = await readFile(new URL("../../adapters/postgres/migrations/0010_sales_settlement_method_snapshot.sql", import.meta.url), "utf8");
  assert.match(ten, /ARRAY\[1,2,3,4,5,6,7,8,9\]/u);
  assert.match(ten, /ADD COLUMN payment_method_id_snapshot uuid REFERENCES naijue_erp\.payment_method\(id\)/u);
  assert.doesNotMatch(ten, /UPDATE naijue_erp\.sales_settlement|ADD COLUMN payment_method_id_snapshot[^;]*(?:NOT NULL|DEFAULT)/u);
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
