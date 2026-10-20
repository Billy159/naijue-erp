/** SQL-TEXT CONTRACT CHECKS ONLY. These do not parse SQL or demonstrate PostgreSQL execution/constraints. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const ddl = await readFile(new URL("../adapters/postgres/migrations/0001_runtime_sales.sql", import.meta.url), "utf8");
const adapter = await readFile(new URL("../adapters/postgres/src/sales-unit-of-work.ts", import.meta.url), "utf8");
const postingBalances = await readFile(new URL("../adapters/postgres/src/inventory-posting-balances.ts", import.meta.url), "utf8");
function table(name: string): string {
  const start = ddl.indexOf(`CREATE TABLE naijue_erp.${name} (`); assert.ok(start >= 0, `Missing native table ${name}`);
  const end = ddl.indexOf("\n);", start); assert.ok(end > start);
  return ddl.slice(start, end);
}
test("pg SQL-text contract: versioned bounded migration has no business seed or execution runner", () => {
  assert.match(ddl, /^-- VERSION 0001:/); assert.match(ddl, /BEGIN;/); assert.match(ddl, /COMMIT;/);
  assert.match(table("schema_migration"), /version integer PRIMARY KEY/);
  assert.deepEqual([...ddl.matchAll(/INSERT INTO ([\w.]+)/g)].map(match => match[1]), ["naijue_erp.schema_migration"]);
  assert.doesNotMatch(adapter, /new Pool|connectionString|process\.env|readFile|0001_runtime_sales/);
});
test("pg SQL-text contract: native parties, product price and four-dimensional SKU remain separate", () => {
  assert.match(table("customer"), /code text NOT NULL UNIQUE/); assert.match(table("supplier"), /code text NOT NULL UNIQUE/);
  assert.match(table("product"), /supplier_id uuid REFERENCES naijue_erp.supplier\(id\)/);
  assert.match(table("product"), /retail_price decimal\(18,2\)/);
  assert.match(table("sku"), /UNIQUE \(product_id, color_id, fit_id, size_id\)/);
  assert.doesNotMatch(table("sku"), /price|unit/i);
  assert.match(table("size"), /code text,/); assert.doesNotMatch(table("size").split("--")[0]!, /UNIQUE/);
});
test("pg SQL-text contract: actual lines/settlements are native facts, not hidden whole-document JSON", () => {
  assert.match(table("sales_header"), /business_type IN \('SALE', 'RETURN', 'EXCHANGE'\)/);
  assert.match(table("sales_line"), /sales_id uuid NOT NULL REFERENCES naijue_erp.sales_header\(id\)/);
  assert.match(table("sales_line"), /sku_id uuid NOT NULL REFERENCES naijue_erp.sku\(id\)/);
  assert.match(table("sales_line"), /quantity bigint NOT NULL/);
  assert.match(ddl, /CREATE UNIQUE INDEX sales_line_current_position[^;]+WHERE is_current/);
  assert.match(table("sales_settlement"), /account_name_snapshot text NOT NULL, method_name_snapshot text NOT NULL/);
  assert.match(table("sales_settlement"), /UNIQUE \(sales_id, line_no\) DEFERRABLE INITIALLY DEFERRED/);
  for (const name of ["sales_header", "sales_line", "sales_settlement"]) assert.doesNotMatch(table(name), /jsonb/);
  assert.doesNotMatch(ddl, /\boriginal_sales_id\b|\boriginal_line_id\b|CREATE TABLE[^;]+return_header/i);
});
test("pg SQL-text contract: quantities have no zero floor and unproven balance absence cannot be auto-created by sales", () => {
  assert.match(table("inventory_balance"), /quantity bigint NOT NULL/);
  assert.doesNotMatch(table("inventory_balance"), /CHECK \(quantity\s*[>=]|quantity[^,]*DEFAULT/i);
  assert.match(table("inventory_balance"), /PRIMARY KEY \(warehouse_id, sku_id\)/);
  assert.doesNotMatch(adapter, /INSERT INTO naijue_erp.inventory_balance|GREATEST\(|Math\.max/);
  assert.match(adapter, /new PostgresPostingBalances/);
  assert.match(postingBalances, /this.provenZero.has\(identity\) && first && row.version === 1/);
  assert.match(postingBalances, /schema_migration WHERE version = 8/);
  assert.match(postingBalances, /ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b/);
  assert.match(postingBalances, /WHERE warehouse_id = \$1 AND sku_id = \$2 AND version = \$7/);
});
test("pg SQL-text contract: source, reversal, receipt/audit uniqueness and deferred atomic references are declared", () => {
  assert.match(table("inventory_ledger"), /source_sales_line_id uuid NOT NULL REFERENCES naijue_erp.sales_line\(id\)/);
  assert.match(table("inventory_ledger"), /reverses_entry_id uuid UNIQUE REFERENCES naijue_erp.inventory_ledger\(id\)/);
  assert.match(table("inventory_ledger"), /UNIQUE \(operation_id, source_sales_line_id, endpoint\)/);
  assert.match(table("operation_receipt"), /UNIQUE \(actor_account_id, request_key\)/);
  assert.match(table("audit_change"), /REFERENCES naijue_erp.operation_receipt[^;]+DEFERRABLE INITIALLY DEFERRED/);
  assert.match(ddl, /receipt_requires_audit[^;]+REFERENCES naijue_erp.audit_change[^;]+DEFERRABLE INITIALLY DEFERRED/);
  for (const name of ["ledger", "audit", "receipt"]) assert.match(ddl, new RegExp(`CREATE TRIGGER immutable_${name} BEFORE UPDATE OR DELETE`));
  assert.match(ddl, /CREATE TRIGGER sales_line_owner BEFORE UPDATE OF sales_id/);
  assert.match(ddl, /original.quantity_delta::numeric \+ NEW.quantity_delta::numeric <> 0/);
  assert.match(ddl, /b.last_operation_id IS DISTINCT FROM NEW.id/);
});
test("pg SQL-text contract: historical branch stays closed, settlement equality uses final approved state", () => {
  assert.match(adapter, /loaded.stockBasis === "RUNTIME_LEDGER", "HISTORICAL_POSTING_NOT_IMPLEMENTED"/);
  assert.match(ddl, /h.stock_basis <> 'RUNTIME_LEDGER'/);
  assert.match(ddl, /count_rows > 3 OR \(h.status = 'APPROVED' AND total <> h.net_due\)/);
  assert.match(ddl, /WHERE status = 'APPROVED'/);
  assert.doesNotMatch(ddl, /CREATE TABLE[^;]+(?:inventory_correction|fund_balance|debt|transfer_header|import_batch|import_record)/i);
});

test("pg SQL-text contract: ISO business dates do not depend on session DateStyle", () => {
  assert.match(adapter, /to_char\(business_date, 'YYYY-MM-DD'\) AS business_date/);
  assert.match(adapter, /to_char\(l.business_date, 'YYYY-MM-DD'\) AS business_date/);
  assert.doesNotMatch(adapter, /business_date::text/);
});
test("pg SQL-text contract: missing or JSON-null receipt IDs cannot exploit nullable CHECK equality", () => {
  const receipt = table("operation_receipt");
  assert.match(receipt, /result_data \?& ARRAY\['operationId', 'salesId', 'version', 'status', 'ledgerEntryIds'\]/);
  assert.match(receipt, /jsonb_typeof\(result_data->'operationId'\) = 'string'/);
  assert.match(receipt, /jsonb_typeof\(result_data->'salesId'\) = 'string'/);
  assert.match(receipt, /\(result_data->>'operationId'\) IS NOT DISTINCT FROM id::text/);
  assert.match(receipt, /\(result_data->>'salesId'\) IS NOT DISTINCT FROM target_id::text/);
  assert.match(receipt, /jsonb_typeof\(result_data->'version'\) = 'number'/);
});


const pricingDdl = await readFile(new URL("../adapters/postgres/migrations/0002_sales_pricing_facts.sql", import.meta.url), "utf8");
test("pg SQL-text contract: additive 0002 preserves unknown old pricing intent with no guessed backfill", () => {
  assert.match(pricingDdl, /^-- VERSION 0002:/); assert.match(pricingDdl, /BEGIN;/); assert.match(pricingDdl, /COMMIT;/);
  assert.match(pricingDdl, /ALTER TABLE naijue_erp.sales_line\s+ADD COLUMN pricing_rule text,\s+ADD COLUMN discount_tenths integer,\s+ADD COLUMN zero_confirmed boolean;/);
  assert.match(pricingDdl, /pricing_rule IS NULL AND discount_tenths IS NULL AND zero_confirmed IS NULL/);
  assert.match(pricingDdl, /pricing_rule IS NOT NULL AND zero_confirmed IS NOT NULL/);
  assert.match(pricingDdl, /pricing_rule = 'UNIT_PRICE' AND discount_tenths IS NULL/);
  assert.match(pricingDdl, /pricing_rule = 'DISCOUNT' AND discount_tenths IS NOT NULL AND discount_tenths BETWEEN 0 AND 100/);
  const statements = pricingDdl.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
  assert.doesNotMatch(statements, /\bUPDATE\b|\bDEFAULT\b|CREATE TABLE|original_sales_id|original_line_id/i);
  assert.deepEqual([...statements.matchAll(/INSERT INTO ([\w.]+)/g)].map(match => match[1]), ["naijue_erp.schema_migration"]);
  assert.match(statements, /VALUES \(2,/);
});
