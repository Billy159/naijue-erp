/** SQL SOURCE contracts only; migration has not been parsed/executed by PostgreSQL. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const migration = readFileSync(new URL("../adapters/postgres/migrations/0005_product_read_fields.sql", import.meta.url), "utf8");
test("product read schema SOURCE ONLY: approved nullable fields are additive with no invented historical backfill", () => {
  assert.match(migration, /ADD COLUMN year integer/); assert.match(migration, /ADD COLUMN system_item_code text/); assert.match(migration, /ADD COLUMN thickness text/); assert.match(migration, /ADD COLUMN collar_pants_type text/);
  assert.ok(!/DEFAULT|UPDATE\s+naijue_erp\.product|minimum_sale_price|ALTER TABLE naijue_erp\.sku|CREATE TABLE naijue_erp\.(?:size|season|fit)\b/i.test(migration));
  assert.match(migration, /VALUES \(5,/);
});
test("product read schema SOURCE ONLY: controlled image metadata keeps approved MIME/8MB limits, real audit facts and ordered target index", () => {
  assert.match(migration, /CREATE TABLE naijue_erp.product_image/); assert.match(migration, /REFERENCES naijue_erp.product\(id\)/);
  assert.match(migration, /mime IN \('image\/png', 'image\/jpeg', 'image\/webp'\)/); assert.match(migration, /byte_size > 0 AND byte_size <= 8388608/);
  assert.match(migration, /created_at timestamptz NOT NULL/); assert.match(migration, /created_by_account_id uuid REFERENCES naijue_erp.user_account\(id\)/);
  assert.match(migration, /\(product_id, display_order, id\)/); assert.ok(!/public_url|thumbnail_url|bytea|UNIQUE\s*\(product_id\)/i.test(migration));
});
