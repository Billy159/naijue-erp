/** SQL source + pure contract tests only. Not PostgreSQL execution evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { HISTORY_COUNT_KEYS, isExactHistoryMoney, isHistoryCounts, isHistoryQuantity } from "../packages/application/src/history-storage-contract.ts";
const ddl = await readFile(new URL("../adapters/postgres/migrations/0011_history_storage.sql", import.meta.url), "utf8");
test("history source adds only approved split carriers and does not relax live or barcode tables", () => {
  assert.deepEqual([...ddl.matchAll(/CREATE TABLE naijue_erp\.(\w+)/g)].map(m => m[1]), ["import_source_row", "import_sku_alias", "history_sales_header", "history_transfer_header", "history_sales_line", "history_transfer_line", "history_sales_settlement", "import_stock_contributor", "history_revision"]);
  assert.deepEqual([...ddl.matchAll(/ALTER TABLE naijue_erp\.(\w+)/g)].map(m => m[1]), ["import_batch"]);
  assert.doesNotMatch(ddl, /ON DELETE CASCADE|DEFAULT (?:now\(|0\b|'admin')|ALTER.*sku_barcode|INSERT INTO naijue_erp\.(?:product|sales_header|inventory_ledger)/);
});
test("history unknowns remain nullable and imbalances are not recalculated", () => {
  assert.match(ddl, /created_by_source_key text, approved_by_source_key text/);
  assert.match(ddl, /allocated_discount numeric\(18,2\), is_gift boolean/);
  assert.match(ddl, /approved_local_at timestamp without time zone/);
  assert.doesNotMatch(ddl, /net_due =|gross_amount -|source_status <> 'APPROVED'|approved_by_source_key text NOT NULL/);
});
test("source occurrences, aliases, same-batch links and staged contributors are retained", () => {
  assert.match(ddl, /UNIQUE \(batch_id, source_file_sha256, sheet, row_no\)/);
  assert.match(ddl, /FOREIGN KEY \(batch_id, source_row_id\) REFERENCES naijue_erp.import_source_row\(batch_id, id\)/);
  assert.match(ddl, /FOREIGN KEY \(batch_id, header_id\) REFERENCES naijue_erp.history_sales_header\(batch_id, id\)/);
  assert.match(ddl, /guard_history_insert\('SETTLEMENT'\)/);
  assert.match(ddl, /guard_history_insert\('INVENTORY_BASELINE'\)/);
  assert.match(ddl, /only initial staged baseline attachment is allowed/);
  for (const table of ["import_source_row", "import_sku_alias", "history_revision"]) {
    assert.match(ddl, new RegExp(`${table}_immutable BEFORE UPDATE OR DELETE`));
    assert.match(ddl, new RegExp(`${table}_no_truncate BEFORE TRUNCATE`));
  }
});
test("atomic v2 publication complements existing stock guards and validates actual counts, dates and signed sums", () => {
  assert.match(ddl, /NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1'/);
  assert.match(ddl, /NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts/);
  assert.match(ddl, /SELECT count\(\*\) FROM naijue_erp.%I WHERE batch_id = \$1/);
  assert.match(ddl, /sum\(signed_quantity::numeric\)/);
  assert.match(ddl, /business_date IS NULL/);
  assert.match(ddl, /count\(DISTINCT source_unit\) <> 1/);
  assert.doesNotMatch(ddl, /DROP TRIGGER|CREATE OR REPLACE FUNCTION naijue_erp.guard_import_batch/);
});
test("future correction carrier is auditable but not silently enabled as live replay", () => {
  assert.match(ddl, /to_version = from_version \+ 1/);
  assert.match(ddl, /UNIQUE \(actor_account_id, request_key\)/);
  assert.match(ddl, /history_revision_closed BEFORE INSERT/);
  assert.match(ddl, /audited historical correction command not enabled/);
});
test("exact decimals reject truncation, unsafe numeric coercion and floating tails", () => {
  for (const valid of ["0.00", "-0.01", "9999999999999999.99"]) assert.equal(isExactHistoryMoney(valid), true);
  for (const invalid of [0, null, "", "0", "1.001", "1.0099999999", "1e2", "10000000000000000.00", "-0.00"]) assert.equal(isExactHistoryMoney(invalid), false);
  assert.equal(isHistoryQuantity("-9223372036854775808"), true);
  assert.equal(isHistoryQuantity("9223372036854775808"), false);
  assert.equal(isHistoryQuantity("-1"), true);
  assert.equal(isHistoryQuantity("1.0"), false);
});
test("counts require the closed exact nonnegative safe-integer key set", () => {
  const counts = Object.fromEntries(HISTORY_COUNT_KEYS.map(key => [key, 0]));
  assert.equal(isHistoryCounts(counts), true);
  assert.equal(isHistoryCounts({ ...counts, extra: 0 }), false);
  assert.equal(isHistoryCounts({ ...counts, barcodes: "0" }), false);
  assert.equal(isHistoryCounts({ ...counts, barcodes: -1 }), false);
  assert.equal(isHistoryCounts({ ...counts, barcodes: Number.MAX_SAFE_INTEGER + 1 }), false);
});
test("product proof reuses immutable evidence and rejects fabricated completeness", () => {
  assert.match(ddl, /import_product_native_once/);
  assert.match(ddl, /PERFORM naijue_erp.validate_history_product_proofs\(NEW.id\)/);
  assert.match(ddl, /proof->'product_version' = product_row->'version'/);
  assert.match(ddl, /missing original price input/);
  assert.match(ddl, /blank_price_policy' IN \('EXPLICIT_NULL_ONLY','V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'\)/);
  assert.match(ddl, /unset price needs explicit original null or versioned exact-column blank evidence, never missing/);
  assert.match(ddl, /price proof differs from original input or native value/);
  assert.match(ddl, /IF NOT source.field_provenance \? 'product_input_proof' THEN CONTINUE/);
  assert.match(ddl, /native_product_id/);
  assert.doesNotMatch(ddl, /ALTER TABLE naijue_erp.product/);
});
test("excluded product barcode evidence cannot be disguised as a staged database row", () => {
  assert.match(ddl, /NEW.normalized_fields->>'绑定范围'\) IS DISTINCT FROM 'SKU'/);
  assert.match(ddl, /only effective SKU barcode source rows may be staged/);
  assert.match(ddl, /NEW.field_provenance->>'native_barcode'\) IS DISTINCT FROM \(NEW.normalized_fields->>'条码'/);
});
test("original contributor identities and signed quantities are checked independently of net totals", () => {
  assert.match(ddl, /oldSkuSourceId' = NEW.old_source_sku_id/);
  assert.match(ddl, /signedQuantity' = NEW.signed_quantity::text/);
  assert.match(ddl, /source.raw_fields->>'核准库存数量'\)::numeric <> NEW.signed_quantity/);
  assert.match(ddl, /sourceUnit' = NEW.source_unit/);
  assert.match(ddl, /sourceSha256' = source.source_file_sha256/);
  assert.match(ddl, /contributor source warehouse does not match native imported scope/);
  assert.match(ddl, /alias must retain its original source identity/);
  assert.match(ddl, /alias canonical source does not match native imported scope/);
});
test("original excluded scope is rejected independently of normalized entity relabeling", () => {
  assert.match(ddl, /NEW.raw_fields->>'绑定范围' = 'PRODUCT' OR NEW.normalized_fields->>'绑定范围' = 'PRODUCT'/);
  assert.match(ddl, /excluded original PRODUCT barcode is not a database source row/);
});
