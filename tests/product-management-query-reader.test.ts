/** Mock pg protocol only: does not open a PostgreSQL connection or run SQL. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProductManagementQueryReader } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { PgProductManagementQueryPool } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { ProductManagementListQuery, ProductManagementReadGrant } from "../packages/application/src/product-management-query-ports.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

const productId = sid("product", 7100), fitId = sid("fit", 7101);
const parameters: ProductManagementListQuery = { filter: { productIds: [productId], categoryIds: [sid("category", 7102)], years: ["2026"], seasonIds: [sid("season", 7103)],
  supplierIds: [sid("supplier", 7104)], fitIds: [fitId], thicknesses: ["厚%_literal"], shapeCodes: ["ROUND"] }, page: 1, pageSize: 100 };
const product = { id: productId, product_code: "SYNTHETIC-7100", name: "合成商品", category_name: "原分类", year: null, season_name: null,
  supplier_name: null, thickness: null, retail_price: null };
const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
const publication = { id: sid("operation", 7105), completed: true, final_approval: true, checkpoint: { sequence: 1, cursor: 4, counts, expected: counts } };
function fixture(options: { overrides?: Record<string, Record<string, unknown>[]>; fail?: string; rollbackFail?: boolean; onQuery?: (sql: string) => void } = {}) {
  const queries: { sql: string; values: unknown[] }[] = []; let connections = 0, released = 0; let discarded: Error | boolean | undefined;
  const defaultRows: Record<string, Record<string, unknown>[]> = {
    count: [{ exact_total: "1", invalid_category_tree: false }], page: [product], fits: [{ product_id: productId, id: fitId, name: "Y版原名", code: "Y" }],
    publication: [publication], guards: [{ integrity_guards_present: true }],
    "stock-coverage": [{ uncovered_warehouse: false, uncovered_sku: false, invalid_size: false, missing_sizes: false, invalid_balance: false }], stock: [{ id: productId, quantity: "-10" }],
    "candidate-count": [{ exact_total: "1" }], "candidate-page": [{ id: productId, label: "合成商品", code: "SYNTHETIC-7100", name: "合成商品" }]
  };
  const pool: PgProductManagementQueryPool = { async connect() { connections++; return { async query(sql, values = []) {
    queries.push({ sql, values }); options.onQuery?.(sql);
    if (sql === "ROLLBACK" && options.rollbackFail) throw new Error("SYNTHETIC ROLLBACK");
    const key = sql.match(/\/\* (?:product-management|inventory):([^ ]+) \*\//)?.[1];
    if (options.fail !== undefined && key === options.fail) throw new Error("SYNTHETIC SQL FAILURE");
    const rows = key ? options.overrides?.[key] ?? defaultRows[key] ?? [] : []; return { rows, rowCount: rows.length };
  }, release(error) { released++; discarded = error; } }; } };
  return { reader: new PostgresProductManagementQueryReader(pool), queries, counts: () => ({ connections, released, discarded }) };
}
function read(grant: ProductManagementReadGrant = { kind: "products", productIds: [productId], totalStock: "unavailable" }, signal = new AbortController().signal) { return { actor, parameters, grant, signal }; }
test("native product list uses one read-only snapshot, parameterizes 8 filters and explicit product grant before count/page", async () => {
  const f = fixture(); assert.equal(f.counts().connections, 0);
  const result = await f.reader.readList(read()); assert.equal(result.items[0]!.retailPrice, null); assert.equal(result.items[0]!.totalStock, null);
  assert.equal(result.items[0]!.fits[0]!.label, "Y版原名"); assert.equal(f.queries[0]!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(f.queries.at(-1)!.sql, "COMMIT");
  const count = f.queries.find(query => query.sql.includes("product-management:count"))!;
  assert.deepEqual(count.values, [false, [productId], [productId], parameters.filter.categoryIds, ["2026"], parameters.filter.seasonIds, parameters.filter.supplierIds, [fitId], ["厚%_literal"], ["ROUND"]]);
  assert.ok(count.sql.indexOf("authorized_products") < count.sql.indexOf("matched_products")); assert.ok(!count.sql.includes("厚%_literal"));
  const page = f.queries.find(query => query.sql.includes("product-management:page"))!; assert.match(page.sql, /ORDER BY p.product_code COLLATE "C", p.id/); assert.ok(!page.sql.includes("created_at"));
  assert.equal(f.queries.some(query => /publication|inventory:guards|product-management:stock/.test(query.sql)), false); assert.deepEqual(f.counts(), { connections: 1, released: 1, discarded: undefined });
});
test("complete authorized all-warehouse stock preserves negative values and proves full scope before bounded totals", async () => {
  const f = fixture(), result = await f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }));
  assert.equal(result.items[0]!.totalStock, "-10");
  const coverage = f.queries.find(query => query.sql.includes("stock-coverage"))!; assert.match(coverage.sql, /FROM naijue_erp.warehouse w WHERE NOT EXISTS/); assert.match(coverage.sql, /JOIN matched_products p/);
  assert.ok(f.queries.findIndex(query => query.sql.includes("stock-coverage")) < f.queries.findIndex(query => query.sql.includes("product-management:stock */")));
  const zero = fixture({ overrides: { stock: [{ id: productId, quantity: "0" }] } }); assert.equal((await zero.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }))).items[0]!.totalStock, "0");
});
test("missing publication or uncovered warehouse/SKU never becomes zero or partial stock", async () => {
  for (const overrides of [{ publication: [] }, { "stock-coverage": [{ uncovered_warehouse: true, uncovered_sku: false, invalid_size: false, missing_sizes: false, invalid_balance: false }] },
    { "stock-coverage": [{ uncovered_warehouse: false, uncovered_sku: true, invalid_size: false, missing_sizes: false, invalid_balance: false }] }]) {
    const f = fixture({ overrides }); await assert.rejects(() => f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })), { code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
    assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.equal(f.queries.some(query => query.sql.includes("product-management:stock */")), false);
  }
});
test("invalid publication, missing guards and corrupt native relations fail closed and release snapshot", async () => {
  for (const overrides of [{ publication: [{ ...publication, final_approval: false }] }, { guards: [{ integrity_guards_present: false }] },
    { "stock-coverage": [{ uncovered_warehouse: false, uncovered_sku: false, invalid_size: true, missing_sizes: false, invalid_balance: false }] },
    { count: [{ exact_total: "1", invalid_category_tree: true }] }]) {
    const f = fixture({ overrides }); await assert.rejects(() => f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })), { code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" }); assert.equal(f.counts().released, 1);
  }
});
test("native candidate options are scoped before distinct/count/page and search is literal parameter, never LIKE", async () => {
  const f = fixture();
  const result = await f.reader.readCandidates({ ...read(), parameters: { kind: "product", search: "%_literal", selectedIds: [], page: 1, pageSize: 20 } });
  assert.equal(result.items[0]!.code, "SYNTHETIC-7100"); const count = f.queries.find(query => query.sql.includes("candidate-count"))!;
  assert.deepEqual(count.values, [false, [productId], [], "%_literal"]); assert.match(count.sql, /strpos\(lower\(search_text\), lower\(\$4::text\)\)/); assert.ok(!count.sql.includes("LIKE"));
  assert.equal(f.queries.some(query => query.sql.includes("stock-coverage")), false);
  for (const kind of ["year", "season", "supplier", "fit", "thickness", "shape", "category"] as const) {
    const id = kind === "year" ? "2026" : kind === "thickness" || kind === "shape" ? "原值" : sid(kind, 7199);
    const row = { id, label: "原名称", ...(kind === "category" ? { parent_id: null, parent_name: null, parent_parent_id: null } : {}) };
    const g = fixture({ overrides: { "candidate-page": [row] } }); assert.equal((await g.reader.readCandidates({ ...read(), parameters: { kind, search: "", selectedIds: [], page: 1, pageSize: 20 } })).items[0]!.id, id);
    if (kind === "supplier" || kind === "fit") assert.ok(g.queries.filter(query => query.sql.includes("product-management:candidate-")).every(query => query.sql.includes("WHERE d.enabled = true")));
    if (kind === "season") assert.ok(g.queries.every(query => !query.sql.includes("d.enabled")));
  }
});
test("cancellation before connection and between queries never executes or commits late work", async () => {
  const before = new AbortController(); before.abort(); const f = fixture(); await assert.rejects(() => f.reader.readList(read(undefined, before.signal)), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" }); assert.equal(f.counts().connections, 0);
  const after = new AbortController(), g = fixture({ onQuery(sql) { if (sql.includes("product-management:count")) after.abort(); } });
  await assert.rejects(() => g.reader.readList(read(undefined, after.signal)), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" });
  assert.deepEqual(g.queries.map(query => query.sql.includes("product-management:count") ? "count" : query.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "count", "ROLLBACK"]);
  const committed = new AbortController(), h = fixture({ onQuery(sql) { if (sql === "COMMIT") committed.abort(); } });
  await assert.rejects(() => h.reader.readList(read(undefined, committed.signal)), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" });
  assert.equal(h.queries.at(-1)!.sql, "COMMIT"); assert.equal(h.counts().released, 1);
});
test("snapshot SQL failure rolls back; rollback failure discards client without retrying connection", async () => {
  const f = fixture({ fail: "page" }); await assert.rejects(() => f.reader.readList(read()), /SYNTHETIC SQL/); assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.equal(f.counts().released, 1);
  const g = fixture({ fail: "page", rollbackFail: true }); await assert.rejects(() => g.reader.readList(read()), AggregateError); assert.equal(g.counts().connections, 1); assert.ok(g.counts().discarded instanceof Error);
});
test("truncated counts and malformed native exact values never produce successful list pages", async () => {
  for (const overrides of [{ count: [{ exact_total: "2", invalid_category_tree: false }] }, { page: [{ ...product, retail_price: "1.001" }] },
    { fits: [{ product_id: sid("product", 7999), id: fitId, name: "other", code: "Y" }] }]) {
    const f = fixture({ overrides }); await assert.rejects(() => f.reader.readList(read())); assert.equal(f.queries.at(-1)!.sql, "ROLLBACK");
  }
});
