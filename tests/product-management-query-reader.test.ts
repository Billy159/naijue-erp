/** Mock pg protocol only: does not open a PostgreSQL connection or run SQL. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProductManagementQueryReader } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { PgProductManagementQueryPool } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { ProductManagementListQuery, ProductManagementReadGrant } from "../packages/application/src/product-management-query-ports.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

const productId = sid("product", 7100), fitId = sid("fit", 7101);
const parameters: ProductManagementListQuery = { filter: { productIds: [productId], categoryIds: [sid("category", 7102)], years: ["2026"], seasonIds: [sid("season", 7103)],
  supplierIds: [sid("supplier", 7104)], fitIds: [fitId], thicknesses: ["厚%_literal"], shapeCodes: ["ROUND"] }, page: 1, pageSize: 100 };
const product = { id: productId, product_code: "SYNTHETIC-7100", name: "合成商品", category_name: "原分类", year: null, season_name: null,
  supplier_name: null, thickness: null, retail_price: null };
const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
const publication = { id: sid("operation", 7105), completed: true, final_approval: true, checkpoint: { sequence: 1, cursor: 4, counts, expected: counts } };
function fixture(options: { overrides?: Record<string, Record<string, unknown>[]>; fail?: string; rollbackFail?: boolean; onQuery?: (sql: string) => void; seasonArray?: boolean;
  runtime26?: NativeRuntime26Capability; respond?: (key: string, values: unknown[]) => Record<string, unknown>[] | undefined } = {}) {
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
    const key = sql.match(/\/\* (?:product-management|inventory(?:-admission)?):([^ ]+) \*\//)?.[1];
    if (options.fail !== undefined && key === options.fail) throw new Error("SYNTHETIC SQL FAILURE");
    const rows = key ? options.respond?.(key, values) ?? options.overrides?.[key] ?? defaultRows[key] ?? [] : []; return { rows, rowCount: rows.length };
  }, release(error) { released++; discarded = error; } }; } };
  return { reader: new PostgresProductManagementQueryReader(pool, null, options.seasonArray ? { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); } } : null, options.runtime26), queries, counts: () => ({ connections, released, discarded }) };
}
function read(grant: ProductManagementReadGrant = { kind: "products", productIds: [productId], totalStock: "unavailable" }, signal = new AbortController().signal) { return { actor, parameters, grant, signal }; }
const importedWarehouse = sid("warehouse", 7200), newWarehouse = sid("warehouse", 7201), importedSku = sid("sku", 7202), nativeSku = sid("sku", 7203), creation = sid("operation", 7204);
function nativeFixture(options: { newWarehouse?: boolean; emptyCutoff?: boolean; additionalSkus?: string[];
  transform?: (key: string, rows: Record<string, unknown>[]) => Record<string, unknown>[]; runtimeResult?: boolean } = {}) {
  const additionalSkus = options.additionalSkus ?? [nativeSku]; let verified = 0;
  const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(client, purpose) {
    assert.equal(typeof (client as { query: unknown }).query, "function"); assert.equal(purpose, "INVENTORY_ADMISSION");
    assert.equal(f.queries.at(-1)!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); verified++;
    if (options.runtimeResult !== undefined) return options.runtimeResult as never;
  } };
  const cutoffCounts = { WAREHOUSE: 1, SKU: options.emptyCutoff ? 0 : 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
  const f = fixture({ runtime26, overrides: {
    publication: [{ ...publication, checkpoint: { sequence: 2, cursor: Object.values(cutoffCounts).reduce((a, b) => a + b, 0), counts: cutoffCounts, expected: cutoffCounts } }],
    "stock-coverage": [{ uncovered_warehouse: options.newWarehouse === true, uncovered_sku: additionalSkus.length > 0, invalid_size: false, missing_sizes: false, invalid_balance: false }],
    stock: [{ id: productId, quantity: options.emptyCutoff ? "0" : "-10" }]
  }, respond(key, values) {
    let rows: Record<string, unknown>[];
    switch (key) {
      case "stock-sku-witness": rows = options.emptyCutoff ? [] : [{ id: importedSku }]; break;
      case "stock-native-sku-witness": rows = [{ id: nativeSku, created_operation_id: creation }]; break;
      case "stock-warehouse-witness": rows = [{ id: importedWarehouse }]; break;
      case "stock-additional-warehouses": rows = options.newWarehouse && (values[1] === null || newWarehouse > String(values[1])) ? [{ id: newWarehouse }] : []; break;
      case "stock-additional-skus": rows = additionalSkus.filter(id => values.at(-1) === null || id > String(values.at(-1))).slice(0, 1000).map(id => ({ id })); break;
      case "keys": rows = (values[0] as string[]).map((warehouseId, i) => {
        const skuId = (values[1] as string[])[i]!, native = skuId !== importedSku;
        return { warehouse_id: warehouseId, sku_id: skuId, admitted: true, published_batch_id: publication.id,
          warehouse_basis: warehouseId === newWarehouse ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER", sku_basis: native ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER",
          warehouse_created_operation_id: warehouseId === newWarehouse ? creation : null, sku_created_operation_id: native ? creation : null };
      }); break;
      default: return undefined;
    }
    return options.transform?.(key, rows) ?? rows;
  } });
  return { ...f, verified: () => verified };
}
test("SPEC-01 native additions: a valid new empty warehouse or new SKU remains readable through the public admission helper", async () => {
  for (const options of [{ newWarehouse: true, additionalSkus: [] }, { additionalSkus: [nativeSku] }]) {
    const f = nativeFixture(options), result = await f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }));
    assert.equal(result.exactTotal, 1); assert.equal(result.items[0]!.totalStock, "-10"); assert.equal(f.verified(), 1);
    assert.equal(f.counts().connections, 1); assert.equal(f.queries.at(-1)!.sql, "COMMIT");
    assert.ok(f.queries.some(q => q.sql.includes("inventory-admission:keys")));
  }
});
test("SPEC-01 empty cutoff: one real native SKU witnesses the new warehouse without replacing matched business IDs or inventing balances", async () => {
  const f = nativeFixture({ newWarehouse: true, emptyCutoff: true });
  const result = await f.reader.readList(read({ kind: "products", productIds: [productId], totalStock: "all-warehouses" }));
  assert.equal(result.exactTotal, 1); assert.equal(result.items[0]!.id, productId); assert.equal(result.items[0]!.totalStock, "0");
  const keys = f.queries.filter(q => q.sql.includes("inventory-admission:keys"));
  assert.deepEqual(keys.map(q => q.values), [[[newWarehouse], [nativeSku]], [[importedWarehouse], [nativeSku]]]);
  assert.equal(f.queries.filter(q => q.sql.includes("stock-native-sku-witness")).length, 1);
  const scope = f.queries.find(q => q.sql.includes("stock-additional-skus"))!;
  assert.deepEqual(scope.values.slice(0, 10), [false, [productId], [productId], parameters.filter.categoryIds, ["2026"], parameters.filter.seasonIds, parameters.filter.supplierIds, [fitId], ["厚%_literal"], ["ROUND"]]);
  assert.match(scope.sql, /JOIN matched_products p/); assert.match(scope.sql, /LIMIT 1000/);
});
test("SPEC-01 rejection: false admission, substituted key/cutoff/basis/creation or missing witness cannot become zero", async () => {
  const cases: { key: string; change: Record<string, unknown>; code: string }[] = [
    { key: "keys", change: { admitted: false }, code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" },
    ...[{ published_batch_id: sid("operation", 7990) }, { warehouse_id: importedWarehouse }, { sku_id: importedSku },
      { warehouse_basis: "CUTOFF_MEMBER" }, { sku_basis: "CUTOFF_MEMBER" }, { sku_created_operation_id: null },
      { sku_created_operation_id: sid("operation", 7991) }, { admitted: "true" }].map(change => ({ key: "keys", change, code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" }))
  ];
  for (const { key, change, code } of cases) {
    const f = nativeFixture({ newWarehouse: true, emptyCutoff: true, transform(stage, rows) { return stage === key ? rows.map(row => ({ ...row, ...change })) : rows; } });
    await assert.rejects(() => f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })), { code });
    assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.queries.some(q => q.sql.includes("product-management:stock */")));
  }
  const missing = nativeFixture({ newWarehouse: true, emptyCutoff: true, transform(key, rows) { return key === "stock-native-sku-witness" ? [] : rows; } });
  await assert.rejects(() => missing.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })), { code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
  assert.ok(!missing.queries.some(q => q.sql.includes("inventory-admission:keys")));
});
test("SPEC-01 batches: 1001 new matched SKUs use two exact-key batches and retain all filters", async () => {
  const skus = Array.from({ length: 1001 }, (_, i) => sid("sku", 8000 + i)), f = nativeFixture({ additionalSkus: skus });
  await f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }));
  const calls = f.queries.filter(q => q.sql.includes("inventory-admission:keys"));
  assert.equal(calls.length, 2); assert.deepEqual(calls.map(q => (q.values[1] as string[]).length), [1000, 1]);
  assert.deepEqual(calls.flatMap(q => q.values[1] as string[]), skus);
  const batches = f.queries.filter(q => q.sql.includes("stock-additional-skus"));
  assert.equal(batches.length, 2); assert.equal(batches[0]!.values[11], null); assert.equal(batches[1]!.values[11], skus[999]);
  assert.deepEqual(batches[0]!.values.slice(0, 11), batches[1]!.values.slice(0, 11));
});
test("SPEC-01 runtime: boolean substitution fails before stock work; catalogue-only grants and candidates never request inventory capability", async () => {
  const denied = nativeFixture({ runtimeResult: true });
  await assert.rejects(() => denied.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })), TypeError);
  assert.deepEqual(denied.queries.map(q => q.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "ROLLBACK"]);
  const catalogue = nativeFixture(); assert.equal((await catalogue.reader.readList(read())).items[0]!.totalStock, null);
  await catalogue.reader.readCandidates({ ...read(), parameters: { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 } });
  assert.equal(catalogue.verified(), 0); assert.ok(!catalogue.queries.some(q => /publication|inventory-admission|stock-coverage/.test(q.sql)));
});
test("SPEC-01 cancellation: an admission completing after abort never publishes a stock total", async () => {
  const abort = new AbortController(), f = nativeFixture({ transform(key, rows) { if (key === "keys") abort.abort(); return rows; } });
  await assert.rejects(() => f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }, abort.signal)), { code: "PRODUCT_MANAGEMENT_READ_ABORTED" });
  assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.equal(f.counts().released, 1);
  assert.ok(!f.queries.some(q => q.sql.includes("product-management:stock */")));
});
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

test("season v2 reads: ANY filter stays one product row across count/page/stock scope, batch labels and authorized distinct candidates", async () => {
  const f = fixture({ seasonArray: true, overrides: { page: [{ ...product, season_name: "春、夏" }] } });
  const result = await f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" })); assert.equal(result.exactTotal, 1); assert.equal(result.items[0]!.seasonLabel, "春、夏"); assert.equal(result.items[0]!.totalStock, "-10");
  for (const key of ["count", "page", "stock-coverage"]) {
    const sql = f.queries.find(q => q.sql.includes(`product-management:${key} */`))!.sql;
    assert.match(sql, /p.season_ids && \$6::uuid\[\]/); assert.doesNotMatch(sql.slice(0, sql.indexOf(") SELECT") + 1), /unnest/);
  }
  const page = f.queries.find(q => q.sql.includes("product-management:page"))!.sql;
  assert.match(page, /string_agg\(d.name,'、' ORDER BY d.display_order,d.id\)/); assert.match(page, /d.id=ANY\(p.season_ids\)/); assert.doesNotMatch(page, /p.season_id/);
  const g = fixture({ seasonArray: true, overrides: { "candidate-page": [{ id: sid("season", 7103), label: "春" }] } });
  await g.reader.readCandidates({ ...read(), parameters: { kind: "season", search: "", selectedIds: [], page: 1, pageSize: 20 } });
  for (const q of g.queries.filter(q => q.sql.includes("product-management:candidate-"))) {
    assert.match(q.sql, /FROM authorized_products p CROSS JOIN LATERAL unnest\(p.season_ids\)/); assert.match(q.sql, /SELECT DISTINCT d.id/); assert.deepEqual(q.values.slice(0, 2), [false, [productId]]);
  }
  const legacy = fixture(); await legacy.reader.readList(read()); assert.ok(legacy.queries.every(q => !q.sql.includes("season_ids"))); assert.match(legacy.queries.find(q => q.sql.includes("product-management:count"))!.sql, /p.season_id = ANY/);
});
