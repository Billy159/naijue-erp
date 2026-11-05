/** Mock pg protocol only: does not open a PostgreSQL connection or run SQL. */
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createProductManagementQueryHttpPlugin } from "../apps/api/src/product-management-query-http.ts";
import { PostgresProductManagementQueryReader } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { PgProductManagementQueryPool } from "../adapters/postgres/src/product-management-query-reader.ts";
import type { ProductManagementListQuery, ProductManagementReadGrant } from "../packages/application/src/product-management-query-ports.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
import { checkedInventoryKeyAdmission } from "../packages/application/src/inventory-key-admission.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

const productId = sid("product", 7100), fitId = sid("fit", 7101);
const parameters: ProductManagementListQuery = { filter: { productIds: [productId], categoryIds: [sid("category", 7102)], years: ["2026"], seasonIds: [sid("season", 7103)],
  supplierIds: [sid("supplier", 7104)], fitIds: [fitId], thicknesses: ["厚%_literal"], shapeCodes: ["ROUND"] }, page: 1, pageSize: 100 };
const product = { id: productId, product_code: "SYNTHETIC-7100", name: "合成商品", category_name: "原分类", year: null, season_name: null,
  supplier_name: null, thickness: null, retail_price: null };
const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
const publication = { id: sid("operation", 7105), completed: true, final_approval: true, checkpoint: { sequence: 1, cursor: 4, counts, expected: counts } };
function fixture(options: { overrides?: Record<string, Record<string, unknown>[]>; fail?: string; rollbackFail?: boolean; onQuery?: (sql: string) => void; seasonArray?: boolean;
  runtime26?: NativeRuntime26Capability; beforeResult?: (key: string) => Promise<void>; respond?: (key: string, values: unknown[]) => Record<string, unknown>[] | undefined } = {}) {
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
    if (key) await options.beforeResult?.(key);
    const rows = key ? options.respond?.(key, values) ?? options.overrides?.[key] ?? defaultRows[key] ?? [] : []; return { rows, rowCount: rows.length };
  }, release(error) { released++; discarded = error; } }; } };
  return { reader: new PostgresProductManagementQueryReader(pool, null, options.seasonArray ? { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); } } : null, options.runtime26), queries, counts: () => ({ connections, released, discarded }) };
}
function read(grant: ProductManagementReadGrant = { kind: "products", productIds: [productId], totalStock: "unavailable" }, signal = new AbortController().signal) { return { actor, parameters, grant, signal }; }
const importedWarehouse = sid("warehouse", 7200), newWarehouse = sid("warehouse", 7201), importedSku = sid("sku", 7202), nativeSku = sid("sku", 7203), creation = sid("operation", 7204);
function nativeFixture(options: { newWarehouse?: boolean; emptyCutoff?: boolean; additionalSkus?: string[]; additionalWarehouses?: string[];
  transform?: (key: string, rows: Record<string, unknown>[]) => Record<string, unknown>[]; runtimeResult?: boolean;
  aggregateTransform?: (key: string, rows: Record<string, unknown>[]) => Record<string, unknown>[];
  beforeResult?: (key: string) => Promise<void> } = {}) {
  const additionalSkus = options.additionalSkus ?? [nativeSku];
  const additionalWarehouses = options.additionalWarehouses ?? (options.newWarehouse ? [newWarehouse] : []); let verified = 0;
  const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(client, purpose) {
    assert.equal(typeof (client as { query: unknown }).query, "function"); assert.equal(purpose, "INVENTORY_ADMISSION");
    assert.equal(f.queries.at(-1)!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); verified++;
    if (options.runtimeResult !== undefined) return options.runtimeResult as never;
  } };
  // Synthetic SQL-function outputs, not a SQL executor. Reuse the pre-existing DTO validator
  // as an independent oracle; both old batch and new aggregate stages consume these decisions.
  function decisions(warehouseId: string, skuId: string): Record<string, unknown>[] {
    const native = skuId !== importedSku, warehouseNative = additionalWarehouses.includes(warehouseId);
    const rows = [{ warehouse_id: warehouseId, sku_id: skuId, admitted: true, published_batch_id: publication.id,
      warehouse_basis: warehouseNative ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER", sku_basis: native ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER",
      warehouse_created_operation_id: warehouseNative ? creation : null, sku_created_operation_id: native ? creation : null }];
    return options.transform?.("keys", rows) ?? rows;
  }
  function aggregate(key: string, keys: readonly { warehouseId: string; skuId: string }[], values: unknown[]): Record<string, unknown>[] {
    // Independent legacy oracle: execute the original chunk algorithm, not the SQL sort.
    const ordered = [...keys].sort((a, b) => {
      const x = key === "stock-additional-warehouse-proof" ? a.warehouseId : a.skuId;
      const y = key === "stock-additional-warehouse-proof" ? b.warehouseId : b.skuId;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    let firstIssue: "INTEGRITY" | "NOT_READY" | null = null;
    for (let start = 0; start < ordered.length; start += 1000) {
      const batch = ordered.slice(start, start + 1000), rows = batch.flatMap(exact => decisions(exact.warehouseId, exact.skuId));
      let decoded: ReturnType<typeof checkedInventoryKeyAdmission>[];
      try {
        assert.equal(rows.length, batch.length);
        decoded = rows.map((row, index) => {
          const exact = batch[index]!, { warehouse_id, sku_id, ...evidence } = row;
          assert.equal(warehouse_id, exact.warehouseId); assert.equal(sku_id, exact.skuId);
          return checkedInventoryKeyAdmission(evidence, exact.warehouseId, exact.skuId);
        });
      } catch { firstIssue = "INTEGRITY"; break; }
      for (const decision of decoded) {
        if (!decision.admitted) { firstIssue = "NOT_READY"; break; }
        const expected = decision.publishedBatchId === publication.id && (key === "stock-additional-warehouse-proof"
          ? decision.warehouseBasis === "POST_CUTOFF_CREATED" && decision.skuBasis === values[2]
            && (values[2] === "CUTOFF_MEMBER" || decision.skuCreatedOperationId === values[3])
          : decision.skuBasis === "POST_CUTOFF_CREATED");
        if (!expected) { firstIssue = "INTEGRITY"; break; }
      }
      if (firstIssue !== null) break;
    }
    const rows = [{ identity_count: String(keys.length), first_issue: firstIssue }];
    return options.aggregateTransform?.(key, rows) ?? rows;
  }
  const cutoffCounts = { WAREHOUSE: 1, SKU: options.emptyCutoff ? 0 : 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 };
  const f = fixture({ runtime26, ...(options.beforeResult ? { beforeResult: options.beforeResult } : {}), overrides: {
    publication: [{ ...publication, checkpoint: { sequence: 2, cursor: Object.values(cutoffCounts).reduce((a, b) => a + b, 0), counts: cutoffCounts, expected: cutoffCounts } }],
    "stock-coverage": [{ uncovered_warehouse: additionalWarehouses.length > 0, uncovered_sku: additionalSkus.length > 0, invalid_size: false, missing_sizes: false, invalid_balance: false }],
    stock: [{ id: productId, quantity: options.emptyCutoff ? "0" : "-10" }]
  }, respond(key, values) {
    let rows: Record<string, unknown>[];
    switch (key) {
      case "page": rows = Number(values.at(-1)) > 0 ? [] : [product]; break;
      case "stock-sku-witness": rows = options.emptyCutoff ? [] : [{ id: importedSku }]; break;
      case "stock-native-sku-witness": rows = [{ id: nativeSku, created_operation_id: creation }]; break;
      case "stock-warehouse-witness": rows = [{ id: importedWarehouse }]; break;
      case "stock-additional-warehouses": rows = additionalWarehouses.filter(id => values[1] === null || id > String(values[1])).slice(0, 1000).map(id => ({ id })); break;
      case "stock-additional-skus": rows = additionalSkus.filter(id => values.at(-1) === null || id > String(values.at(-1))).slice(0, 1000).map(id => ({ id })); break;
      case "keys": return (values[0] as string[]).flatMap((warehouseId, i) => decisions(warehouseId, (values[1] as string[])[i]!));
      case "stock-additional-warehouse-proof": return aggregate(key, additionalWarehouses.map(warehouseId => ({ warehouseId, skuId: String(values[1]) })), values);
      case "stock-additional-sku-proof": return aggregate(key, additionalSkus.map(skuId => ({ warehouseId: String(values[11]), skuId })), values);
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
    assert.ok(f.queries.some(q => /stock-additional-(?:warehouse|sku)-proof/.test(q.sql)));
    assert.ok(!f.queries.some(q => q.sql.includes("inventory-admission:keys")));
  }
});
test("SPEC-01 empty cutoff: one real native SKU witnesses the new warehouse without replacing matched business IDs or inventing balances", async () => {
  const f = nativeFixture({ newWarehouse: true, emptyCutoff: true });
  const result = await f.reader.readList(read({ kind: "products", productIds: [productId], totalStock: "all-warehouses" }));
  assert.equal(result.exactTotal, 1); assert.equal(result.items[0]!.id, productId); assert.equal(result.items[0]!.totalStock, "0");
  const warehouse = f.queries.find(q => q.sql.includes("stock-additional-warehouse-proof"))!;
  assert.deepEqual(warehouse.values, [publication.id, nativeSku, "POST_CUTOFF_CREATED", creation]);
  const sku = f.queries.find(q => q.sql.includes("stock-additional-sku-proof"))!;
  assert.deepEqual(sku.values.slice(-2), [publication.id, importedWarehouse]);
  assert.equal(f.queries.filter(q => q.sql.includes("stock-native-sku-witness")).length, 1);
  const scope = f.queries.find(q => q.sql.includes("stock-additional-sku-proof"))!;
  assert.deepEqual(scope.values.slice(0, 10), [false, [productId], [productId], parameters.filter.categoryIds, ["2026"], parameters.filter.seasonIds, parameters.filter.supplierIds, [fitId], ["厚%_literal"], ["ROUND"]]);
  assert.match(scope.sql, /JOIN matched_products p/); assert.doesNotMatch(scope.sql, /LIMIT 1000|OFFSET/);
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
test("SPEC-01 aggregate: 1001 new matched SKUs keep all filters without app identity batches", async () => {
  const skus = Array.from({ length: 1001 }, (_, i) => sid("sku", 8000 + i)), f = nativeFixture({ additionalSkus: skus });
  await f.reader.readList(read({ kind: "all", totalStock: "all-warehouses" }));
  assert.ok(!f.queries.some(q => /inventory-admission:keys|stock-additional-skus/.test(q.sql)));
  const calls = f.queries.filter(q => q.sql.includes("stock-additional-sku-proof")); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.values, [true, [], parameters.filter.productIds, parameters.filter.categoryIds, ["2026"],
    parameters.filter.seasonIds, parameters.filter.supplierIds, [fitId], ["厚%_literal"], ["ROUND"], publication.id, importedWarehouse]);
  assert.doesNotMatch(calls[0]!.sql, /LIMIT 1000|OFFSET/);
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
  assert.ok(f.counts().discarded instanceof Error); assert.equal(f.counts().released, 1);
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
  assert.deepEqual(g.queries.map(query => query.sql.includes("product-management:count") ? "count" : query.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "count"]);
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

test('product read abort bounds acquisition and releases a late lease exactly once',async()=>{
 let provide!:(client:any)=>void,released=0;const controller=new AbortController();
 const pool={connect:()=>new Promise<any>(resolve=>provide=resolve)};
 const reader=new PostgresProductManagementQueryReader(pool);
 const pending=reader.readList(read(undefined,controller.signal)).then(()=>false,()=>true);
 controller.abort();const bounded=await Promise.race([pending,new Promise<boolean>(r=>setTimeout(()=>r(false),40))]);
 provide({query:async()=>({rows:[],rowCount:0}),release(){released++;}});await new Promise(r=>setImmediate(r));
 assert.equal(bounded,true,'aborted acquisition cannot retain the HTTP reader');assert.equal(released,1);
});
test('product read abort retires an ordinary in-flight query exactly once',async()=>{
 let finish!:(v:any)=>void,released=0;let entered! :()=>void;const started=new Promise<void>(r=>entered=r);const controller=new AbortController();
 const reader=new PostgresProductManagementQueryReader({async connect(){return {query:async(sql:string)=>{if(sql.includes('product-management:count')){entered();return new Promise<any>(r=>finish=r);}return {rows:[],rowCount:0};},release(error){assert.ok(error);released++;}};}});
 const pending=reader.readList(read(undefined,controller.signal)).then(()=>false,()=>true);await started;controller.abort();
 const bounded=await Promise.race([pending,new Promise<boolean>(r=>setTimeout(()=>r(false),40))]);finish({rows:[],rowCount:0});await new Promise(r=>setImmediate(r));
 assert.equal(bounded,true,'cancel must not wait for ordinary SQL');assert.equal(released,1);
});
test('additional SKU evidence remains full-scope with one constant-result aggregate for 1000/1001/2000/2001 identities',async()=>{
 for(const count of [1000,1001,2000,2001]){
  const f=nativeFixture({additionalSkus:Array.from({length:count},(_,i)=>sid('sku',10000+i))});
  await f.reader.readList(read({kind:'all',totalStock:'all-warehouses'}));
  assert.equal(f.queries.filter(r=>r.sql.includes('product-management:stock-additional-sku-proof')).length,1);
  assert.ok(!f.queries.some(r=>/stock-additional-skus|inventory-admission:keys/.test(r.sql)));
 }
});
test('aborting issuer verification never releases its lease until the verifier settles',async()=>{
 let finish!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r),controller=new AbortController();
 const runtime26:NativeRuntime26Capability={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){entered();await new Promise<void>(r=>finish=r);}};
 const f=fixture({runtime26});const pending=f.reader.readList(read({kind:'all',totalStock:'all-warehouses'},controller.signal));
 await started;controller.abort();await new Promise(r=>setImmediate(r));assert.equal(f.counts().released,0,'issuer proof must not be revoked by premature lease release');
 finish();await assert.rejects(pending,{code:'PRODUCT_MANAGEMENT_READ_ABORTED'});assert.equal(f.counts().released,1);assert.ok(!f.queries.some(q=>q.sql.includes('product-management:count')));
});

// A3: outgoing SQL/protocol regressions. These doubles do not execute SQL or measure PG cost.
const stockGrant: ProductManagementReadGrant = { kind: "all", totalStock: "all-warehouses" };
const proofStage = (key: string) => key === "keys" || /^stock-additional-(warehouse|sku)-proof$/.test(key);
function assertAggregateQuery(sql: string): void {
  assert.match(sql, /FROM uncovered u CROSS JOIN LATERAL/);
  assert.match(sql, /count\(\*\) AS decision_count/);
  assert.match(sql, /row_number\(\) OVER \(ORDER BY [ws]\.id\) AS ordinal/);
  assert.match(sql, /\(u\.ordinal-1\)\/1000 AS legacy_batch/);
  assert.match(sql, /CASE WHEN decision_count<>1 OR shape_ok IS NOT TRUE THEN 0 ELSE 1 END AS shape_priority/);
  assert.match(sql, /CASE WHEN decision_count<>1 OR shape_ok IS NOT TRUE THEN 'INTEGRITY'\s+WHEN admitted IS NOT TRUE THEN 'NOT_READY' WHEN scope_ok IS NOT TRUE THEN 'INTEGRITY'/);
  assert.match(sql, /ORDER BY legacy_batch,shape_priority,ordinal LIMIT 1/);
  assert.equal((sql.match(/LIMIT/g) ?? []).length, 1, "Only the scalar first-issue selection may LIMIT");
  assert.match(sql, /a\.admitted IS NOT NULL/);
  for (const name of ["warehouse", "sku"]) {
    assert.ok(sql.includes(`a.${name}_basis IS NULL OR a.${name}_basis IN ('CUTOFF_MEMBER','POST_CUTOFF_CREATED')`));
    assert.ok(sql.includes(`a.${name}_basis IS DISTINCT FROM 'POST_CUTOFF_CREATED' OR a.${name}_created_operation_id IS NOT NULL`));
  }
  assert.match(sql, /NOT a\.admitted OR \(a\.published_batch_id IS NOT NULL AND a\.warehouse_basis IS NOT NULL AND a\.sku_basis IS NOT NULL\)/);
  assert.doesNotMatch(sql, /LIMIT 1000|OFFSET|unnest|inventory_balance/);
}
test("A3 transport: 2001 warehouses and 2001 matched SKUs keep two constant-result proofs for page1 and page2", async () => {
  const additionalSkus = Array.from({ length: 2001 }, (_, i) => sid("sku", 20000 + i));
  const additionalWarehouses = Array.from({ length: 2001 }, (_, i) => sid("warehouse", 30000 + i));
  const f = nativeFixture({ additionalSkus, additionalWarehouses });
  // Even an out-of-range empty second page must qualify the same whole matched stock scope.
  const first = await f.reader.readList(read(stockGrant));
  const second = await f.reader.readList({ ...read(stockGrant), parameters: { ...parameters, page: 2 } });
  assert.equal(first.items[0]!.totalStock, "-10"); assert.equal(second.items.length, 0); assert.equal(second.exactTotal, first.exactTotal);
  assert.ok(!f.queries.some(q => /inventory-admission:keys|stock-additional-(?:warehouses|skus) \*\//.test(q.sql)));
  for (const kind of ["warehouse", "sku"]) {
    const proofs = f.queries.filter(q => q.sql.includes(`stock-additional-${kind}-proof`)); assert.equal(proofs.length, 2);
    proofs.forEach(q => assertAggregateQuery(q.sql)); assert.deepEqual(proofs[0]!.values, proofs[1]!.values);
  }
  const warehouse = f.queries.find(q => q.sql.includes("stock-additional-warehouse-proof"))!;
  assert.deepEqual(warehouse.values, [publication.id, importedSku, "CUTOFF_MEMBER", null]);
  assert.match(warehouse.sql, /inventory_key_admission\(u\.id,\$2::uuid\)/);
  assert.match(warehouse.sql, /a\.warehouse_basis='POST_CUTOFF_CREATED'/);
  assert.match(warehouse.sql, /a\.sku_basis=\$3::text/);
  assert.match(warehouse.sql, /a\.sku_created_operation_id=\$4::uuid/);
  const sku = f.queries.find(q => q.sql.includes("stock-additional-sku-proof"))!;
  assert.match(sku.sql, /JOIN matched_products p ON p\.id=s\.product_id/);
  assert.match(sku.sql, /inventory_key_admission\(\$12::uuid,u\.id\)/);
  assert.match(sku.sql, /a\.published_batch_id=\$11::uuid AND a\.sku_basis='POST_CUTOFF_CREATED'/);
  assert.deepEqual(sku.values.slice(0, 10), [true, [], parameters.filter.productIds, parameters.filter.categoryIds, parameters.filter.years,
    parameters.filter.seasonIds, parameters.filter.supplierIds, parameters.filter.fitIds, parameters.filter.thicknesses, parameters.filter.shapeCodes]);
  for (const id of [...additionalSkus, ...additionalWarehouses]) assert.ok(!f.queries.some(q => q.values.some(v => v === id || Array.isArray(v) && v.includes(id))), "No uncovered ID transport in query parameters");
});
test("A3 off-page decision: the last of 2001 matched SKUs can reject the entire first page", async () => {
  const skus = Array.from({ length: 2001 }, (_, i) => sid("sku", 40000 + i));
  const f = nativeFixture({ additionalSkus: skus, transform(key, rows) { return key === "keys" ? rows.map(row => row.sku_id === skus.at(-1) ? { ...row, admitted: false } : row) : rows; } });
  await assert.rejects(f.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
  assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.queries.some(q => q.sql.includes("product-management:page")));
  assert.equal(f.counts().released, 1);
});
test("A3 exact decision sets: missing, duplicate, and compensating missing+duplicate groups reject", async () => {
  const skus = [sid("sku", 50000), sid("sku", 50001)];
  for (const mutate of [(_rows: Record<string, unknown>[]) => [], (rows: Record<string, unknown>[]) => [...rows, ...rows],
    (rows: Record<string, unknown>[]) => rows[0]!.sku_id === skus[0] ? [] : [...rows, ...rows]]) {
    const f = nativeFixture({ additionalSkus: skus, transform(key, rows) { return key === "keys" ? mutate(rows) : rows; } });
    await assert.rejects(f.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" });
    assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.equal(f.counts().released, 1);
    assert.ok(!f.queries.some(q => q.sql.includes("product-management:stock */")));
  }
});
test("A3 typed evidence: native operations, nullable/invalid bases, admitted null and publication mismatches never become zero", async () => {
  for (const [change, code] of [
    [{ admitted: false }, "PRODUCT_MANAGEMENT_STOCK_NOT_READY"], [{ admitted: null }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"],
    [{ warehouse_basis: null }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"], [{ sku_basis: "UNREVIEWED" }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"],
    [{ warehouse_created_operation_id: null }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"], [{ sku_created_operation_id: null }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"],
    [{ published_batch_id: null }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"], [{ published_batch_id: sid("operation", 59999) }, "PRODUCT_MANAGEMENT_INTEGRITY_FAILED"]
  ] as const) {
    const f = nativeFixture({ newWarehouse: true, emptyCutoff: true, transform(key, rows) { return key === "keys" ? rows.map(row => ({ ...row, ...change })) : rows; } });
    await assert.rejects(f.reader.readList(read(stockGrant)), { code }); assert.equal(f.queries.at(-1)!.sql, "ROLLBACK");
  }
});
test("A3 aggregate result decoding: empty, duplicate, malformed, unknown issue and empty full sets fail closed", async () => {
  const invalid: Record<string, unknown>[][] = [[],
    [{ identity_count: "1", first_issue: null }, { identity_count: "1", first_issue: null }],
    ...[{ identity_count: "0" }, { identity_count: "01" }, { identity_count: "-1" }, { identity_count: 1 },
      { first_issue: "UNKNOWN" }, { first_issue: true }, { first_issue: undefined }, { first_issue: "INTEGRITY" }]
      .map(change => [{ identity_count: "1", first_issue: null, ...change }])];
  for (const rows of invalid) {
    const f = nativeFixture({ aggregateTransform() { return rows; } });
    await assert.rejects(f.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" });
    assert.equal(f.queries.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.queries.some(q => q.sql.includes("product-management:page")));
  }
  const denied = nativeFixture({ aggregateTransform(_key, rows) { return rows.map(row => ({ ...row, first_issue: "NOT_READY" })); } });
  await assert.rejects(denied.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
});
test("A3 no additions: cutoff-only reads preserve exact zero and do not invent aggregate proof work", async () => {
  const f = nativeFixture({ additionalSkus: [], emptyCutoff: true });
  const result = await f.reader.readList(read(stockGrant)); assert.equal(result.items[0]!.totalStock, "0");
  assert.ok(!f.queries.some(q => /stock-additional-|inventory-admission:keys/.test(q.sql)));
});
test("A3 cancellation: pending admission aggregate owns one lease, rejects promptly, ignores late SQL success", async () => {
  let entered!: () => void, finish!: () => void; const started = new Promise<void>(r => entered = r), paused = new Promise<void>(r => finish = r);
  const controller = new AbortController();
  const f = nativeFixture({ beforeResult: async key => { if (proofStage(key)) { entered(); await paused; } } });
  const pending = f.reader.readList(read(stockGrant, controller.signal)); await started; controller.abort();
  await assert.rejects(pending, { code: "PRODUCT_MANAGEMENT_READ_ABORTED" });
  assert.equal(f.counts().released, 1); assert.ok(f.counts().discarded instanceof Error);
  finish(); await new Promise(r => setImmediate(r));
  assert.equal(f.counts().released, 1); assert.ok(!f.queries.some(q => /product-management:page|product-management:stock \*\//.test(q.sql)));
});
test("A3 HTTP read budget: delayed actual reader admission cannot publish late success or retain its lease", async t => {
  let entered!: () => void, finish!: () => void; const started = new Promise<void>(r => entered = r), paused = new Promise<void>(r => finish = r);
  const f = nativeFixture({ beforeResult: async key => { if (proofStage(key)) { entered(); await paused; } } });
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductManagementQueryHttpPlugin({ readBudgetMs: 100, authenticate: async () => actor,
    dependencies: { authorization: { async authorize() { return stockGrant; } }, reader: f.reader } }));
  await app.ready(); const keepAlive = setTimeout(finish, 1000); t.after(() => clearTimeout(keepAlive));
  const pending = app.inject({ method: "POST", url: "/product-management/query", headers: { "content-type": "application/json" }, payload: parameters });
  try {
    await Promise.race([started, pending.then(() => { throw Error("HTTP budget ended before admission fixture was reached"); })]);
    const response = await pending;
    assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, "PRODUCT_MANAGEMENT_READ_TIMEOUT");
    assert.equal(f.counts().released, 1); assert.ok(f.counts().discarded instanceof Error);
  } finally { finish(); }
  await new Promise(r => setImmediate(r)); assert.equal(f.counts().released, 1);
  assert.ok(!f.queries.some(q => /product-management:page|product-management:stock \*\//.test(q.sql)));
});

test("A3 aggregate identity count remains exact text without inventing a safe-integer SKU cap", async () => {
  const f = nativeFixture({ aggregateTransform(_key, rows) { return rows.map(row => ({ ...row, identity_count: "9007199254740992" })); } });
  assert.equal((await f.reader.readList(read(stockGrant))).items[0]!.totalStock, "-10");
});

test("A3 legacy precedence: same-batch scope-before-denied, denied-before-malformed and same-key combinations", async () => {
  const skus = [sid("sku", 60000), sid("sku", 60001)];
  const cases: { first: Record<string, unknown>; second: Record<string, unknown>; code: string }[] = [
    { first: { published_batch_id: sid("operation", 69999) }, second: { admitted: false }, code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" },
    { first: { admitted: false }, second: { published_batch_id: sid("operation", 69999) }, code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" },
    { first: { admitted: false }, second: { admitted: null }, code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" },
    { first: { admitted: false, published_batch_id: sid("operation", 69999) }, second: {}, code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" },
    { first: { admitted: false, sku_basis: "UNREVIEWED" }, second: {}, code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" }
  ];
  for (const c of cases) {
    const f = nativeFixture({ additionalSkus: skus, transform(key, rows) { return key === "keys" ? rows.map(row => ({ ...row, ...(row.sku_id === skus[0] ? c.first : c.second) })) : rows; } });
    await assert.rejects(f.reader.readList(read(stockGrant)), { code: c.code }); assert.equal(f.queries.at(-1)!.sql, "ROLLBACK");
  }
});
test("A3 legacy 1000/1001 precedence: earlier denied beats later malformed/missing/duplicate, but same-batch shape wins", async () => {
  const skus = Array.from({ length: 1001 }, (_, i) => sid("sku", 70000 + i));
  for (const problem of ["malformed", "missing", "duplicate"] as const) for (const index of [999, 1000]) {
    const f = nativeFixture({ additionalSkus: skus, transform(key, rows) {
      if (key !== "keys") return rows;
      const id = rows[0]!.sku_id;
      if (id === skus[0]) return rows.map(row => ({ ...row, admitted: false }));
      if (id !== skus[index]) return rows;
      return problem === "missing" ? [] : problem === "duplicate" ? [...rows, ...rows] : rows.map(row => ({ ...row, admitted: null }));
    } });
    await assert.rejects(f.reader.readList(read(stockGrant)), { code: index === 999 ? "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" : "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
    assert.ok(!f.queries.some(q => q.sql.includes("product-management:page")));
  }
  const scopeFirst = nativeFixture({ additionalSkus: skus, transform(key, rows) { return key === "keys" ? rows.map(row => row.sku_id === skus[0]
    ? { ...row, published_batch_id: sid("operation", 79999) } : row.sku_id === skus[1000] ? { ...row, admitted: false } : row) : rows; } });
  await assert.rejects(scopeFirst.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" });
});
test("A3 warehouse precedence and dimension order remain before SKU proof", async () => {
  const warehouses = [newWarehouse, sid("warehouse", 7205)];
  const f = nativeFixture({ additionalWarehouses: warehouses, transform(key, rows) { return key === "keys" ? rows.map(row => row.warehouse_id === warehouses[0]
    ? { ...row, warehouse_basis: "CUTOFF_MEMBER" } : { ...row, admitted: false }) : rows; } });
  await assert.rejects(f.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_INTEGRITY_FAILED" });
  assert.ok(!f.queries.some(q => /stock-warehouse-witness|stock-additional-sku-proof/.test(q.sql)));
  const denied = nativeFixture({ newWarehouse: true, transform(key, rows) { return key === "keys" ? rows.map(row => row.warehouse_id === newWarehouse
    ? { ...row, admitted: false } : { ...row, admitted: null }) : rows; } });
  await assert.rejects(denied.reader.readList(read(stockGrant)), { code: "PRODUCT_MANAGEMENT_STOCK_NOT_READY" });
  assert.ok(!denied.queries.some(q => /stock-warehouse-witness|stock-additional-sku-proof/.test(q.sql)));
});
