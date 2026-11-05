/** SQL SOURCE/contract assertions only. Does not import pg or run a PostgreSQL parser/engine. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { FROZEN_0001_0008_MIGRATIONS } from "./integration/frozen-0001-0008-manifest.ts";
import { MIGRATIONS } from "./integration/migration-manifest.ts";
const file = "0009_catalogue_prices_barcodes.sql";
const ddl = await readFile(new URL(`../adapters/postgres/migrations/${file}`, import.meta.url), "utf8");
const sql = ddl.replace(/--[^\n]*/g, "");
const newPrices = ["purchase_price", "wholesale5_price", "wholesale6_price", "wholesale7_price", "wholesale8_price", "wholesale9_price", "wholesale10_price", "minimum_price"];
function table(name: string): string {
  const match = sql.match(new RegExp(`CREATE TABLE naijue_erp\\.${name} \\(([\\s\\S]*?)\\n\\);`)); assert.ok(match, name); return match[1]!;
}
test("catalogue authority migration source: exact 0001-0008 and empty-product preconditions precede any catalogue DDL under one lock/transaction", () => {
  assert.match(sql, /^\s*BEGIN;/); assert.match(sql, /COMMIT;\s*$/);
  const lock = sql.indexOf("LOCK TABLE naijue_erp.product IN ACCESS EXCLUSIVE MODE");
  const version = sql.indexOf("installed IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8]");
  const empty = sql.indexOf("IF EXISTS (SELECT 1 FROM naijue_erp.product)");
  const alter = sql.indexOf("ALTER TABLE naijue_erp.product");
  assert.ok(lock > 0 && version > lock && empty > version && alter > empty);
  assert.match(sql, /empty product table before first validated import.*USING ERRCODE = '23514'/);
  assert.ok(!/UPDATE naijue_erp.product|DELETE FROM|TRUNCATE|DROP |IF NOT EXISTS|ON CONFLICT/.test(sql));
});
test("catalogue authority migration source: exactly eight nullable nonnegative product price columns, retail reused, no state/default/SKU prices", () => {
  assert.deepEqual([...sql.matchAll(/ADD COLUMN (\w+) decimal\(18,2\) CHECK \(\1 >= 0\)/g)].map(row => row[1]), newPrices);
  assert.equal([...sql.matchAll(/ADD COLUMN/g)].length, 8); assert.ok(!/ADD COLUMN retail_price|ALTER TABLE naijue_erp.sku\b/.test(sql));
  assert.ok(!/minimum_price_state|price_state|DEFAULT|COALESCE|CASE .*price/.test(sql));
  assert.ok(!/decimal\(18,2\) NOT NULL/.test(sql));
});
test("catalogue authority migration source: approved descriptive scheme fields only, nullable unknown length, no seed/configuration engine", () => {
  const shape = table("barcode_scheme");
  for (const field of ["id uuid PRIMARY KEY", "name text NOT NULL", "barcode_type text NOT NULL", "rule_description text NOT NULL", "code_length integer CHECK", "rule_version text NOT NULL", "status text NOT NULL"])
    assert.ok(shape.includes(field), field);
  assert.match(shape, /status IN \('CURRENT', 'HISTORICAL'\)/); assert.ok(!/code_length integer NOT NULL|15|Code128|\bscript\b|jsonb|version integer|created_at/.test(shape));
  assert.equal([...sql.matchAll(/CREATE TABLE/g)].length, 2);
});
test("catalogue authority migration source: exact raw text unique including disabled identities and nullable scheme FK; no re-encoding or guessed identifiers", () => {
  const shape = table("sku_barcode");
  assert.match(shape, /barcode text COLLATE "C" NOT NULL UNIQUE CHECK \(length\(barcode\) > 0\)/);
  assert.match(shape, /sku_id uuid NOT NULL REFERENCES naijue_erp.sku\(id\)/);
  assert.match(shape, /barcode_kind IN \('MAIN', 'CONFIRMED_OLD'\)/);
  assert.match(shape, /scheme_id uuid REFERENCES naijue_erp.barcode_scheme\(id\)/);
  assert.ok(!/scheme_id uuid NOT NULL|btrim\(barcode\)|lower\(barcode\)|upper\(barcode\)|barcode.*bigint|GENERATED|sequence|nextval/.test(shape));
  assert.match(sql, /CREATE UNIQUE INDEX sku_barcode_one_current_main ON naijue_erp.sku_barcode \(sku_id\)\s+WHERE enabled AND barcode_kind = 'MAIN'/);
});
test("catalogue authority migration source: disabled/raw identity cannot be deleted or moved to another SKU, descriptive/status updates remain separate", () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON naijue_erp.sku_barcode/);
  assert.match(sql, /IF TG_OP = 'DELETE' THEN/);
  assert.match(sql, /NEW.id IS DISTINCT FROM OLD.id OR NEW.barcode IS DISTINCT FROM OLD.barcode OR NEW.sku_id IS DISTINCT FROM OLD.sku_id/);
  assert.ok(!/NEW.enabled IS DISTINCT|NEW.barcode_kind IS DISTINCT|NEW.scheme_id IS DISTINCT/.test(sql));
  assert.match(sql, /SET search_path = pg_catalog, naijue_erp/);
});
test("catalogue authority migration source: only migration registry inserted; no credentials, business records, balances or import publication", () => {
  assert.deepEqual([...sql.matchAll(/INSERT INTO ([\w.]+)/g)].map(row => row[1]), ["naijue_erp.schema_migration"]);
  assert.match(sql, /VALUES \(9, 'Approved product nine-price/);
  assert.ok(!/password|session|credential|inventory_balance|inventory_ledger|import_batch|operation_receipt|sales_header|transfer_header/.test(sql));
});
test("catalogue authority migration source: frozen historical eight-prefix stays immutable; current harness requires1–10 before products", async () => {
  assert.deepEqual(FROZEN_0001_0008_MIGRATIONS.map(([version]) => version), [1,2,3,4,5,6,7,8]);
  assert.deepEqual(MIGRATIONS.map(([version]) => version), [1,2,3,4,5,6,7,8,9,10]);
  for (const [, name, sha256] of FROZEN_0001_0008_MIGRATIONS) {
    const source = await readFile(new URL(`../adapters/postgres/migrations/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), sha256, name);
  }
});
