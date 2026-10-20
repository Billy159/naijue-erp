import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PostgresInventoryQueryReader, INVENTORY_READ_MAX_PAGE_SKUS, INVENTORY_READ_MAX_PAGE_SIZES, INVENTORY_READ_MAX_PAGE_BALANCES } from "../adapters/postgres/src/inventory-query-reader.ts";
import type { PgInventoryQueryClient, PgInventoryQueryPool, PgInventoryQueryResult } from "../adapters/postgres/src/inventory-query-reader.ts";
import { parseInventoryCandidateQuery, parseInventoryQuery } from "../packages/application/src/inventory-query-validation.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { inventoryActor, inventoryId, inventoryParameters, inventoryScope, candidateParameters } from "./support/synthetic-inventory-query.ts";
import type { InventoryCandidateQuery, InventoryQuery, InventoryReadScope, InventoryScopedRead } from "../packages/application/src/inventory-query-contracts.ts";

// Scripted protocol evidence ONLY. No PostgreSQL connection, execution, plan or isolation claim.
const batchId = inventoryId("operation", 900);
const groupId = inventoryId("sizeGroup", 30);
const sizes = [0, 1, 2, 3].map(n => ({ id: inventoryId("size", 10 + n), label: ["170/M full source label", "160/XS", "165/S", "175/L"][n]! }));
const colorId = inventoryId("color", 20), fitId = inventoryId("fit", 21);
const productId = (n: number) => inventoryId("product", 1000 + n);
const skuId = (n: number, size: number) => inventoryId("sku", 10000 + n * 4 + size);
type Row = Record<string, unknown>;
interface Call { readonly sql: string; readonly values: unknown[] }
class ScriptedPool implements PgInventoryQueryPool, PgInventoryQueryClient {
  readonly calls: Call[] = []; readonly releases: (Error | boolean | undefined)[] = []; connects = 0;
  count = 1; scope: InventoryReadScope = inventoryScope; negative = "-2";
  publication: Row[] | undefined; guards = true;
  flags: Row = { invalid_category_tree: false, missing_sizes: false, uncovered_sku: false, invalid_sku_size: false, invalid_balance: false };
  transform: ((stage: string, rows: Row[]) => Row[]) | undefined;
  failAt: string | undefined; failRollback = false; afterQuery: ((stage: string) => void) | undefined;
  async connect() { this.connects++; return this; }
  release(error?: Error | boolean) { this.releases.push(error); }
  async query(sql: string, values: unknown[] = []): Promise<PgInventoryQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) });
    const stage = /\/\* inventory:([a-z-]+) \*\//.exec(sql)?.[1] ?? sql;
    if (stage === this.failAt || (stage === "ROLLBACK" && this.failRollback)) throw new Error(`SYNTHETIC ${stage} failure`);
    let rows: Row[];
    switch (stage) {
      case "publication": {
        const counts = { WAREHOUSE: this.scope.warehouses.length, SKU: this.count * 3, INVENTORY_LEDGER: this.count, IMPORT_BATCH: 1 };
        rows = this.publication ?? [{ id: batchId, checkpoint: { sequence: 3, cursor: Object.values(counts).reduce((a, b) => a + b, 0), counts, expected: counts }, completed: true, final_approval: true }]; break;
      }
      case "guards": rows = [{ integrity_guards_present: this.guards }]; break;
      case "warehouses": rows = this.scope.warehouses.filter(w => (values[0] as string[]).includes(w.id)).map(w => ({ id: w.id, hall_id: w.hallId, name: w.label, published: true })); break;
      case "candidate-integrity": rows = [{ ...this.flags }]; break;
      case "catalog-status": rows = [{ ...this.flags, exact_total: String(this.count), quantity: sql.includes("'0'::text AS quantity") ? "0" : (BigInt(this.negative) * BigInt(this.count)).toString() }]; break;
      case "products": {
        const offset = Number(values[9]); const length = Math.min(Number(values[8]), Math.max(0, this.count - offset));
        rows = Array.from({ length }, (_, i) => ({ id: productId(offset + i), product_code: `NATIVE-${String(offset + i).padStart(6, "0")}`, name: "Synthetic native product",
          size_group_id: groupId, size_group_name: "Native source group", category_name: "Native category", supplier_name: null, season_name: null })); break;
      }
      case "sizes": rows = (values[0] as string[]).flatMap(id => sizes.map((size, n) => ({ product_id: id, size_group_id: groupId, size_id: size.id, size_name: size.label, display_order: n }))); break;
      case "skus": rows = (values[0] as string[]).flatMap(id => {
        const n = Number(id.slice(-12)) - 1000;
        return sizes.slice(0, 3).map((size, index) => ({ id: skuId(n, index), product_id: id, color_id: colorId, fit_id: fitId, size_id: size.id, color_name: "Native color", fit_name: "Y版（修身）" }));
      }); break;
      case "balances": rows = (values[8] as string[]).flatMap(id => {
        const n = Number(id.slice(-12)) - 1000;
        return [this.negative, "0"].map((quantity, index) => ({ warehouse_id: this.scope.warehouses[0]!.id, sku_id: skuId(n, index), quantity, version: 1, last_operation_id: inventoryId("operation", 990 + n) }));
      }); break;
      case "candidate-count": rows = [{ exact_total: "1" }]; break;
      case "candidates": rows = Number(values[10]) === 0 ? [{ id: productId(0), label: "NATIVE-000000 Synthetic native product", disabled: false, parent_label: null }] : []; break;
      default: assert.ok(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", "ROLLBACK"].includes(stage), `Unexpected scripted statement: ${stage}`); rows = [];
    }
    rows = this.transform?.(stage, rows) ?? rows; this.afterQuery?.(stage);
    return { rows, rowCount: rows.length };
  }
}
function read(pool: ScriptedPool, input: InventoryQuery = parseInventoryQuery(inventoryParameters()), signal = new AbortController().signal): InventoryScopedRead<InventoryQuery> {
  return { actor: inventoryActor, scope: pool.scope, parameters: input, signal };
}
function candidate(pool: ScriptedPool, overrides: Partial<InventoryCandidateQuery> = {}): InventoryScopedRead<InventoryCandidateQuery> {
  return { actor: inventoryActor, scope: pool.scope, parameters: parseInventoryCandidateQuery({ ...candidateParameters(), ...overrides }), signal: new AbortController().signal };
}
const code = (expected: string) => (error: unknown) => error instanceof DomainError && error.code === expected;
const stages = (pool: ScriptedPool) => pool.calls.map(call => /\/\* inventory:([a-z-]+) \*\//.exec(call.sql)?.[1] ?? call.sql);

test("SYNTHETIC PG protocol: constructor is inert; one native RR read keeps negative, explicit zero, proven absence and nonexistent coordinates distinct", async () => {
  const pool = new ScriptedPool(); const reader = new PostgresInventoryQueryReader(pool); assert.equal(pool.connects, 0);
  const result = await reader.readInventory(read(pool)); const product = result.data.products[0]!;
  assert.equal(pool.connects, 1); assert.deepEqual(stages(pool), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "publication", "guards", "warehouses", "catalog-status", "products", "sizes", "skus", "balances", "COMMIT"]);
  assert.deepEqual(pool.releases, [undefined]); assert.equal(result.readiness, "ready"); assert.ok(Object.isFrozen(result.data.products));
  assert.equal(result.readReference, result.data.readReference); assert.notEqual(result.readReference, batchId);
  assert.deepEqual(product.sizes.map(size => size.label), sizes.map(size => size.label));
  assert.equal(product.colorFits[0]!.fit.label, "Y版（修身）");
  assert.deepEqual(Object.values(product.colorFits[0]!.rows[0]!.cells), [
    { state: "known", skuId: skuId(0, 0), quantity: "-2" }, { state: "known", skuId: skuId(0, 1), quantity: "0" },
    { state: "known", skuId: skuId(0, 2), quantity: "0" }, { state: "not-applicable" }
  ]);
  assert.equal(product.total.knownQuantity, "-2"); assert.equal(result.data.allMatchesTotal.knownQuantity, "-2");
  assert.throws(() => new PostgresInventoryQueryReader({} as PgInventoryQueryPool), /explicit PostgreSQL pool/);
});

test("SYNTHETIC PG protocol: exact count/full-filter sum remain independent from stable bounded product pages and empty out-of-range page", async () => {
  const pool = new ScriptedPool(); pool.count = 103; const reader = new PostgresInventoryQueryReader(pool);
  for (const [page, length] of [[1, 100], [2, 3], [3, 0]] as const) {
    const result = await reader.readInventory(read(pool, parseInventoryQuery(inventoryParameters(page))));
    assert.equal(result.data.products.length, length); assert.equal(result.data.exactTotalProducts, 103); assert.equal(result.data.allMatchesTotal.knownQuantity, "-206");
  }
  const statusCalls = pool.calls.filter(call => call.sql.includes("inventory:catalog-status"));
  assert.equal(statusCalls.length, 3); assert.ok(statusCalls.every(call => !call.sql.includes("OFFSET") && !call.sql.includes("LIMIT")));
  const productCalls = pool.calls.filter(call => call.sql.includes("inventory:products"));
  assert.deepEqual(productCalls.map(call => call.values.slice(-2)), [[100, "0"], [100, "100"], [100, "200"]]);
  assert.ok(productCalls.every(call => call.sql.includes('ORDER BY p.product_code COLLATE "C", p.id LIMIT $9 OFFSET $10::bigint')));
  assert.deepEqual(pool.calls.filter(call => call.sql.includes("inventory:sizes")).map(call => (call.values[0] as string[]).length), [100, 3]);
  assert.equal(pool.calls.filter(call => call.sql.includes("inventory:balances")).length, 2);
});

test("SYNTHETIC PG protocol: warehouse filter narrows before native validation, summary, sparse page balance reads and display order", async () => {
  const pool = new ScriptedPool(); const second = { ...inventoryScope.warehouses[0]!, id: inventoryId("warehouse", 4), label: "Other native warehouse" };
  pool.scope = { ...inventoryScope, warehouses: [...inventoryScope.warehouses, second] };
  // All sparse fixture facts are held in second for this authorized narrowed read.
  pool.transform = (stage, rows) => stage === "balances" ? rows.map(row => ({ ...row, warehouse_id: second.id })) : rows;
  const input = parseInventoryQuery({ ...inventoryParameters(), filter: { ...inventoryParameters().filter, warehouses: [{ id: second.id, label: "IGNORED CLIENT LABEL" }] } });
  const result = await new PostgresInventoryQueryReader(pool).readInventory(read(pool, input));
  assert.deepEqual(result.data.warehouseLabels, [second.label]);
  for (const call of pool.calls.filter(call => ["warehouses", "catalog-status", "products", "balances"].some(stage => call.sql.includes(`inventory:${stage}`)))) {
    assert.deepEqual(call.values[0], [second.id]); assert.deepEqual(call.values[1], inventoryScope.hallIds);
  }
  assert.ok(!JSON.stringify(pool.calls).includes("IGNORED CLIENT LABEL"));
});

for (const [name, mutate, expected] of [
  ["no publication", (pool: ScriptedPool) => { pool.publication = []; }, "INVENTORY_NOT_READY"],
  ["missing guards", (pool: ScriptedPool) => { pool.guards = false; }, "INVENTORY_INTEGRITY_FAILED"],
  ["off-page unpublished SKU", (pool: ScriptedPool) => { pool.flags.uncovered_sku = true; }, "INVENTORY_NOT_READY"],
  ["unsupported deeper native category hierarchy", (pool: ScriptedPool) => { pool.flags.invalid_category_tree = true; }, "INVENTORY_INTEGRITY_FAILED"],
  ["off-page missing group sizes", (pool: ScriptedPool) => { pool.flags.missing_sizes = true; }, "INVENTORY_INTEGRITY_FAILED"],
  ["off-page SKU outside product size group", (pool: ScriptedPool) => { pool.flags.invalid_sku_size = true; }, "INVENTORY_INTEGRITY_FAILED"],
  ["off-page corrupt sparse balance", (pool: ScriptedPool) => { pool.flags.invalid_balance = true; }, "INVENTORY_INTEGRITY_FAILED"],
  ["stale native hall", (pool: ScriptedPool) => { pool.transform = (stage, rows) => stage === "warehouses" ? rows.map(row => ({ ...row, hall_id: inventoryId("hall", 999) })) : rows; }, "INVENTORY_INTEGRITY_FAILED"],
  ["unpublished warehouse", (pool: ScriptedPool) => { pool.transform = (stage, rows) => stage === "warehouses" ? rows.map(row => ({ ...row, published: false })) : rows; }, "INVENTORY_NOT_READY"]
] as const) test(`SYNTHETIC PG protocol: ${name} rejects entire snapshot, including an empty visible page`, async () => {
  const pool = new ScriptedPool(); mutate(pool);
  await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(read(pool, parseInventoryQuery(inventoryParameters(2)))), code(expected));
  assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.ok(!stages(pool).includes("COMMIT")); assert.ok(!stages(pool).includes("products"));
});

test("SYNTHETIC PG protocol: no silent truncation of size, SKU or balance set queries", async () => {
  for (const [target, limit] of [["sizes", INVENTORY_READ_MAX_PAGE_SIZES], ["skus", INVENTORY_READ_MAX_PAGE_SKUS], ["balances", INVENTORY_READ_MAX_PAGE_BALANCES]] as const) {
    const pool = new ScriptedPool(); pool.transform = (stage, rows) => stage === target ? Array.from({ length: limit + 1 }, () => rows[0]!) : rows;
    await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(read(pool)), code("INVENTORY_READ_TOO_LARGE"));
    assert.equal(stages(pool).at(-1), "ROLLBACK");
    const query = pool.calls.find(call => call.sql.includes(`inventory:${target}`))!; assert.equal(query.values.at(-1), limit + 1);
  }
});

test("SYNTHETIC PG protocol: bounded fact rows cannot bypass the pre-allocation matrix work limit", async () => {
  const pool = new ScriptedPool();
  pool.transform = (stage, rows) => {
    if (stage === "sizes") return Array.from({ length: 1000 }, (_, n) => ({ product_id: productId(0), size_group_id: groupId,
      size_id: inventoryId("size", 30000 + n), size_name: `Native full size ${n}`, display_order: n }));
    if (stage === "skus") return Array.from({ length: 1000 }, (_, n) => ({ id: skuId(0, n), product_id: productId(0),
      color_id: inventoryId("color", 40000 + n), color_name: `Native color ${n}`, fit_id: fitId, fit_name: "Native fit", size_id: inventoryId("size", 30000) }));
    if (stage === "balances") return [];
    return rows;
  };
  await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(read(pool)), code("INVENTORY_READ_TOO_LARGE"));
  assert.equal(stages(pool).at(-1), "ROLLBACK");
});

test("SYNTHETIC PG protocol: corrupt page identity, duplicate SKU coordinate, missing sizes and invalid stock never become zero", async () => {
  for (const mutate of [
    (stage: string, rows: Row[]) => stage === "skus" ? [...rows, rows[0]!] : rows,
    (stage: string, rows: Row[]) => stage === "skus" ? rows.map((row, n) => n === 0 ? { ...row, size_id: inventoryId("size", 999) } : row) : rows,
    (stage: string, rows: Row[]) => stage === "sizes" ? [] : rows,
    (stage: string, rows: Row[]) => stage === "balances" ? rows.map((row, n) => n === 0 ? { ...row, last_operation_id: null } : row) : rows,
    (stage: string, rows: Row[]) => stage === "balances" ? rows.map((row, n) => n === 0 ? { ...row, quantity: "1.5" } : row) : rows
  ]) {
    const pool = new ScriptedPool(); pool.transform = mutate;
    await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(read(pool)));
    assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.ok(!stages(pool).includes("COMMIT"));
  }
});

test("SYNTHETIC PG protocol: aggregate arithmetic exceeds signed bigint without narrowing individual native quantity strings", async () => {
  const pool = new ScriptedPool(); pool.count = 2; pool.negative = "9223372036854775807";
  const result = await new PostgresInventoryQueryReader(pool).readInventory(read(pool));
  assert.equal(result.data.allMatchesTotal.knownQuantity, "18446744073709551614");
  assert.equal(result.data.products[0]!.total.knownQuantity, pool.negative);
});

test("SYNTHETIC PG protocol: all identity filters are parameters in the full-filter count/summary and fit page queries", async () => {
  const pool = new ScriptedPool(); const p = inventoryParameters();
  const input = parseInventoryQuery({ ...p, filter: { ...p.filter, products: [{ id: productId(0), label: "not a fact" }],
    category: { id: inventoryId("category", 40), label: "not a fact" }, suppliers: [{ id: inventoryId("supplier", 41), label: "not a fact" }],
    fits: [{ id: fitId, label: "not a fact" }], seasons: [{ id: inventoryId("season", 42), label: "not a fact" }] } });
  await new PostgresInventoryQueryReader(pool).readInventory(read(pool, input));
  const status = pool.calls.find(call => call.sql.includes("inventory:catalog-status"))!;
  assert.deepEqual(status.values.slice(2), [[productId(0)], inventoryId("category", 40), [inventoryId("supplier", 41)], [fitId], [inventoryId("season", 42)], batchId]);
  assert.deepEqual(pool.calls.find(call => call.sql.includes("inventory:skus"))!.values[1], [fitId]);
  assert.ok(!JSON.stringify(pool.calls).includes("not a fact"));
});

test("SYNTHETIC PG protocol: bounded candidates use same snapshot, literal parameterized search and no selectedIds grants or hidden selected page", async () => {
  const pool = new ScriptedPool(); const search = "%' OR TRUE --"; const selection = productId(999);
  const result = await new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool, { search, selectedIds: [selection] }));
  assert.equal(result.data.exactTotal, 1); assert.equal(result.data.items.length, 1);
  assert.deepEqual(stages(pool), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "publication", "guards", "warehouses", "candidate-count", "candidates", "candidate-integrity", "COMMIT"]);
  const page = pool.calls.find(call => call.sql.includes("inventory:candidates"))!;
  assert.deepEqual(page.values.slice(-3), [search, 20, "0"]); assert.ok(!page.sql.includes(search)); assert.ok(!JSON.stringify(pool.calls).includes(selection));
  assert.ok(page.sql.includes("strpos(r.product_code, $9::text)"));
  const outside = new ScriptedPool();
  await assert.rejects(new PostgresInventoryQueryReader(outside).readCandidates(candidate(outside, { kind: "warehouse", selectedIds: [inventoryId("warehouse", 999)] })), code("FORBIDDEN"));
  assert.equal(outside.connects, 0);
});

test("SYNTHETIC PG protocol: candidate kinds select closed native relations, stable paging and native optional metadata", async () => {
  for (const kind of ["product", "category", "warehouse", "supplier", "fit", "season"] as const) {
    const pool = new ScriptedPool(); pool.transform = (stage, rows) => stage === "candidates" ? [{
      id: kind === "warehouse" ? inventoryScope.warehouses[0]!.id : inventoryId(kind, 80),
      label: kind === "warehouse" ? inventoryScope.warehouses[0]!.label : "Native candidate", disabled: kind === "season" || kind === "category" ? null : true,
      parent_label: kind === "category" ? "Native parent" : null, ...(kind === "category" ? { depth: 1, category_valid: true } : {})
    }] : rows;
    const result = await new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool, { kind }));
    assert.equal(result.data.items[0]!.disabled, kind === "season" || kind === "category" ? undefined : true);
    assert.equal(result.data.items[0]!.parentLabel, kind === "category" ? "Native parent" : undefined);
    assert.equal(result.data.items[0]!.depth, kind === "category" ? 1 : undefined);
    assert.ok(pool.calls.find(call => call.sql.includes("inventory:candidates"))!.sql.includes("LIMIT $10 OFFSET $11::bigint"));
  }
});

test("SYNTHETIC PG protocol: candidate readiness uses only returned catalogue IDs and never broad stock predicates", async () => {
  for (const kind of ["product", "category", "warehouse", "supplier", "fit", "season"] as const) {
    const pool = new ScriptedPool(); pool.flags.invalid_balance = true;
    pool.transform = (stage, rows) => stage === "candidates" ? [{
      id: kind === "warehouse" ? inventoryScope.warehouses[0]!.id : inventoryId(kind, 80),
      label: kind === "warehouse" ? inventoryScope.warehouses[0]!.label : "Native candidate", disabled: null, parent_label: null,
      ...(kind === "category" ? { depth: 0, category_valid: true } : {})
    }] : rows;
    await new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool, { kind }));
    assert.ok(!stages(pool).includes("catalog-status"));
    assert.ok(pool.calls.every(call => !/\b(?:FROM|JOIN)\s+naijue_erp\.inventory_balance\b/.test(call.sql) && !call.sql.includes("sum(")));
    const pageIntegrity = pool.calls.find(call => call.sql.includes("inventory:candidate-integrity"));
    if (kind === "category" || kind === "warehouse") assert.equal(pageIntegrity, undefined);
    else assert.deepEqual(pageIntegrity!.values[8], [inventoryId(kind, 80)]);
  }
  const empty = new ScriptedPool();
  const result = await new PostgresInventoryQueryReader(empty).readCandidates(candidate(empty, { page: 2 }));
  assert.equal(result.data.exactTotal, 1); assert.deepEqual(result.data.items, []);
  assert.ok(!stages(empty).includes("candidate-integrity"));
});

test("SYNTHETIC PG protocol: returned invalid/unready candidate is rejected, never silently removed from an exact page", async () => {
  for (const [flag, expected] of [["uncovered_sku", "INVENTORY_NOT_READY"], ["missing_sizes", "INVENTORY_INTEGRITY_FAILED"], ["invalid_category_tree", "INVENTORY_INTEGRITY_FAILED"], ["invalid_sku_size", "INVENTORY_INTEGRITY_FAILED"]] as const) {
    const pool = new ScriptedPool(); pool.flags[flag] = true;
    await assert.rejects(new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool)), code(expected));
    assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.ok(!stages(pool).includes("COMMIT"));
  }
  const categoryPool = new ScriptedPool(); categoryPool.transform = (stage, rows) => stage === "candidates" ? [{
    id: inventoryId("category", 80), label: "Invalid deeper/cyclic native category", disabled: null, parent_label: "Existing parent", depth: 1, category_valid: false
  }] : rows;
  await assert.rejects(new PostgresInventoryQueryReader(categoryPool).readCandidates(candidate(categoryPool, { kind: "category" })), code("INVENTORY_INTEGRITY_FAILED"));
  assert.equal(stages(categoryPool).at(-1), "ROLLBACK");
});

test("SYNTHETIC PG protocol: abort and failures roll back, uncertain COMMIT discards, rollback failure aggregates without retry", async () => {
  const before = new ScriptedPool(); const controller = new AbortController(); controller.abort();
  await assert.rejects(new PostgresInventoryQueryReader(before).readInventory(read(before, undefined, controller.signal)), code("INVENTORY_READ_ABORTED")); assert.equal(before.connects, 0);
  const mid = new ScriptedPool(); const midController = new AbortController(); mid.afterQuery = stage => { if (stage === "products") midController.abort(); };
  await assert.rejects(new PostgresInventoryQueryReader(mid).readInventory(read(mid, undefined, midController.signal)), code("INVENTORY_READ_ABORTED"));
  assert.equal(stages(mid).at(-1), "ROLLBACK"); assert.ok(!stages(mid).includes("sizes"));
  for (const stage of ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "catalog-status", "COMMIT"]) {
    const pool = new ScriptedPool(); pool.failAt = stage;
    await assert.rejects(new PostgresInventoryQueryReader(pool).readInventory(read(pool)), /SYNTHETIC/);
    assert.equal(pool.connects, 1); assert.equal(pool.releases.length, 1);
    assert.equal(pool.releases[0] instanceof Error, stage !== "catalog-status");
  }
  const rollback = new ScriptedPool(); rollback.failAt = "catalog-status"; rollback.failRollback = true;
  await assert.rejects(new PostgresInventoryQueryReader(rollback).readInventory(read(rollback)), AggregateError);
  assert.ok(rollback.releases[0] instanceof Error);
});

test("SOURCE CONTRACT ONLY: no global member/SKU preload, source-history reconcile, Cartesian zero relation or application-side N+1", () => {
  const source = readFileSync(new URL("../adapters/postgres/src/inventory-query-reader.ts", import.meta.url), "utf8");
  assert.ok(!source.includes("readPublishedCutoffScope(")); assert.ok(!source.includes("sparseInventoryQuantity("));
  assert.ok(!/CROSS JOIN|INSERT INTO|UPDATE naijue_erp|DELETE FROM|inventory_ledger l/i.test(source));
  assert.ok(source.includes("WHERE s.product_id = ANY($1::uuid[])"));
  assert.ok(source.includes("WHERE s.product_id = ANY($9::uuid[])"));
  assert.ok(source.includes("FROM filtered_skus s WHERE NOT EXISTS"));
  assert.ok(source.includes("required.table_name") && source.includes("required.trigger_name"));
  assert.ok(source.includes("ORDER BY b.id LIMIT 2"));
  assert.ok(source.includes("category.parent_id = $4::uuid"));
  assert.ok(source.includes("WHERE parent.parent_id IS NOT NULL) AS invalid_category_tree"));
});
