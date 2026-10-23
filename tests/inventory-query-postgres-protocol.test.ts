import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PostgresInventoryQueryReader, INVENTORY_READ_MAX_PAGE_SKUS, INVENTORY_READ_MAX_PAGE_SIZES, INVENTORY_READ_MAX_PAGE_BALANCES } from "../adapters/postgres/src/inventory-query-reader.ts";
import type { PgInventoryQueryClient, PgInventoryQueryPool, PgInventoryQueryResult } from "../adapters/postgres/src/inventory-query-reader.ts";
import { parseInventoryCandidateQuery, parseInventoryQuery } from "../packages/application/src/inventory-query-validation.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { inventoryActor, inventoryId, inventoryParameters, inventoryScope, candidateParameters } from "./support/synthetic-inventory-query.ts";
import type { InventoryCandidateQuery, InventoryQuery, InventoryReadScope, InventoryScopedRead } from "../packages/application/src/inventory-query-contracts.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";

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
  additionalSkus: string[] = []; newWarehouses = new Set<string>(); witnessSku: string | null = skuId(0, 0);
  flags: Row = { invalid_category_tree: false, missing_sizes: false, uncovered_sku: false, invalid_sku_size: false, invalid_balance: false };
  transform: ((stage: string, rows: Row[]) => Row[]) | undefined;
  failAt: string | undefined; failRollback = false; afterQuery: ((stage: string) => void) | undefined;
  async connect() { this.connects++; return this; }
  release(error?: Error | boolean) { this.releases.push(error); }
  async query(sql: string, values: unknown[] = []): Promise<PgInventoryQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) });
    const stage = /\/\* inventory(?:-admission)?:([a-z-]+) \*\//.exec(sql)?.[1] ?? sql;
    if (stage === this.failAt || (stage === "ROLLBACK" && this.failRollback)) throw new Error(`SYNTHETIC ${stage} failure`);
    let rows: Row[];
    switch (stage) {
      case "publication": {
        const counts = { WAREHOUSE: this.scope.warehouses.length, SKU: this.count * 3, INVENTORY_LEDGER: this.count, IMPORT_BATCH: 1 };
        rows = this.publication ?? [{ id: batchId, checkpoint: { sequence: 3, cursor: Object.values(counts).reduce((a, b) => a + b, 0), counts, expected: counts }, completed: true, final_approval: true }]; break;
      }
      case "guards": rows = [{ integrity_guards_present: this.guards }]; break;
      case "warehouses": rows = this.scope.warehouses.filter(w => (values[0] as string[]).includes(w.id)).map(w => ({ id: w.id, hall_id: w.hallId, name: w.label, published: !this.newWarehouses.has(w.id) })); break;
      case "admission-witness": rows = this.witnessSku === null ? [] : [{ id: this.witnessSku }]; break;
      case "additional-skus": rows = this.additionalSkus.filter(id => values.at(-1) === null || id > String(values.at(-1))).slice(0, 1000).map(id => ({ id })); break;
      case "keys": rows = (values[0] as string[]).map((warehouseId, i) => { const skuId = (values[1] as string[])[i]!;
        return { warehouse_id: warehouseId, sku_id: skuId, admitted: true, published_batch_id: batchId,
          warehouse_basis: this.newWarehouses.has(warehouseId) ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER", sku_basis: this.additionalSkus.includes(skuId) ? "POST_CUTOFF_CREATED" : "CUTOFF_MEMBER",
          warehouse_created_operation_id: this.newWarehouses.has(warehouseId) ? inventoryId("operation", 17000) : null, sku_created_operation_id: this.additionalSkus.includes(skuId) ? inventoryId("operation", 17001) : null };
      }); break;
      case "candidate-integrity": rows = [{ ...this.flags }]; break;
      case "catalog-status": rows = [{ ...this.flags, exact_total: String(this.count), quantity: sql.includes("'0'::text AS quantity") ? "0" : (BigInt(this.negative) * BigInt(this.count)).toString() }]; break;
      case "products":
      case "output-products": {
        const offset = stage === "products" ? Number(values[9]) : values[9] === null ? 0 : Number(String(values[9]).slice(-12)) - 1000 + 1;
        const length = Math.min(Number(values[stage === "products" ? 8 : 10]), Math.max(0, this.count - offset));
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
      case "candidates": rows = Number(values[10]) === 0 ? [{ id: productId(0), label: "NATIVE-000000 Synthetic native product", code: "NATIVE-000000", name: "Synthetic native product", disabled: false, parent_label: null }] : []; break;
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
const stages = (pool: ScriptedPool) => pool.calls.map(call => /\/\* inventory(?:-admission)?:([a-z-]+) \*\//.exec(call.sql)?.[1] ?? call.sql);

function nativeKeyPool(count: number, additional: number, newWarehouse = false): ScriptedPool {
  const pool = new ScriptedPool(); pool.count = count; pool.additionalSkus = Array.from({ length: additional }, (_, i) => skuId(Math.floor(i / 3), i % 3)); pool.flags.uncovered_sku = additional > 0;
  const counts = { WAREHOUSE: 1, SKU: 1, INVENTORY_LEDGER: 1, IMPORT_BATCH: 1 };
  pool.publication = [{ id: batchId, checkpoint: { sequence: 3, cursor: 4, counts, expected: counts }, completed: true, final_approval: true }];
  if (newWarehouse) { pool.newWarehouses.add(pool.scope.warehouses[0]!.id); pool.witnessSku = skuId(count - 1, 2); }
  return pool;
}
function nativeReadRuntime(pool: ScriptedPool, called: () => void = () => {}): NativeRuntime26Capability {
  // Protocol fake only, never a real target/runtime authority.
  return { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(client, purpose) { assert.equal(client, pool); assert.equal(purpose, "INVENTORY_ADMISSION"); assert.equal(stages(pool).at(-1), "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); called(); } };
}

test("inventory primary native keys: existing dimensions witness only new bounded sets across summary, page, complete output and returned candidates", async () => {
  const pool = nativeKeyPool(334, 1001, true); let ready = 0; const reader = new PostgresInventoryQueryReader(pool, null, nativeReadRuntime(pool, () => { ready++; }));
  const result = await reader.readInventory(read(pool)); assert.equal(ready, 1); assert.equal(result.data.exactTotalProducts, 334); assert.equal(result.data.products.length, 100); assert.equal(result.data.allMatchesTotal.knownQuantity, "-668");
  const cell = result.data.products[0]!.colorFits[0]!.rows[0]!.cells[sizes[0]!.id]!; assert.equal(cell.state, "known"); if (cell.state === "known") { assert.equal(cell.skuId, skuId(0, 0)); assert.notEqual(cell.skuId, pool.witnessSku); assert.equal(cell.quantity, "-2"); }
  const keys = pool.calls.filter(c => c.sql.includes("inventory-admission:keys")); assert.deepEqual(keys.map(c => (c.values[0] as string[]).length), [1, 1000, 1]); assert.equal(pool.calls.filter(c => c.sql.includes("inventory:additional-skus")).length, 2);
  assert.equal(pool.calls.filter(c => c.sql.includes("inventory:admission-witness")).length, 1); assert.deepEqual(keys[0]!.values[1], [pool.witnessSku]);
  assert.ok(pool.calls.filter(c => c.sql.includes("inventory:additional-skus")).every(c => c.sql.includes("FROM filtered_skus s") && c.sql.includes("LIMIT 1000") && !c.sql.includes("OFFSET")));
  const stream = nativeKeyPool(334, 1001, true); let streamReady = 0, products = 0, complete = false;
  for await (const frame of new PostgresInventoryQueryReader(stream, null, nativeReadRuntime(stream, () => { streamReady++; })).readInventoryOutput(read(stream))) { if (frame.kind === "product") products++; if (frame.kind === "complete") complete = true; }
  assert.equal(streamReady, 1); assert.equal(products, 334); assert.equal(complete, true); assert.equal(stages(stream).filter(s => s === "keys").length, 3); assert.equal(stages(stream).filter(s => s === "catalog-status").length, 1);
  const candidates = nativeKeyPool(2, 3); candidates.flags.invalid_balance = true;
  await new PostgresInventoryQueryReader(candidates, null, nativeReadRuntime(candidates)).readCandidates(candidate(candidates, { selectedIds: [productId(999)] }));
  const scoped = candidates.calls.find(c => c.sql.includes("inventory:additional-skus"))!; assert.deepEqual(scoped.values[8], [productId(0)]); assert.ok(scoped.sql.includes("FROM candidate_skus s") && scoped.sql.includes("p.id = ANY($9::uuid[])"));
  assert.equal(stages(candidates).includes("catalog-status"), false); assert.equal(stages(candidates).includes("balances"), false);
  const old = nativeKeyPool(1, 0); await new PostgresInventoryQueryReader(old, null, nativeReadRuntime(old)).readInventory(read(old)); assert.equal(stages(old).includes("keys"), false); assert.equal(stages(old).includes("admission-witness"), false);
});

test("inventory primary native keys: missing witness, unqualified or inconsistent decisions and absent runtime never infer stock zero or output completion", async () => {
  const missing = nativeKeyPool(1, 0, true); missing.witnessSku = null;
  await assert.rejects(new PostgresInventoryQueryReader(missing, null, nativeReadRuntime(missing)).readInventory(read(missing)), code("INVENTORY_NOT_READY")); assert.equal(stages(missing).includes("catalog-status"), false);
  for (const mutate of [ (rows: Row[]) => rows.map(row => ({ ...row, admitted: false })), (rows: Row[]) => rows.map(row => ({ ...row, warehouse_basis: "CUTOFF_MEMBER" })),
    (rows: Row[]) => rows.map(row => ({ ...row, sku_basis: "POST_CUTOFF_CREATED", sku_created_operation_id: inventoryId("operation", 999) })) ]) {
    const pool = nativeKeyPool(1, 1, true); pool.transform = (stage, rows) => stage === "keys" ? mutate(rows) : rows;
    await assert.rejects(new PostgresInventoryQueryReader(pool, null, nativeReadRuntime(pool)).readInventory(read(pool))); assert.equal(stages(pool).includes("catalog-status"), false); assert.equal(stages(pool).at(-1), "ROLLBACK");
  }
  const legacy = nativeKeyPool(1, 1); await assert.rejects(new PostgresInventoryQueryReader(legacy).readInventory(read(legacy)), code("INVENTORY_NOT_READY")); assert.equal(stages(legacy).includes("additional-skus"), false);
  const mutations: ((rows: Row[]) => Row[])[] = [rows => rows.map(r => ({ ...r, admitted: false })), rows => rows.map(r => ({ ...r, published_batch_id: inventoryId("operation", 999) })),
    rows => rows.map(r => ({ ...r, sku_created_operation_id: null })), rows => rows.map(r => ({ ...r, sku_basis: "CUTOFF_MEMBER" })), rows => rows.map(r => ({ ...r, sku_id: inventoryId("sku", 999) })), _rows => []];
  for (const mutate of mutations) { const pool = nativeKeyPool(1, 1); pool.transform = (stage, rows) => stage === "keys" ? mutate(rows) : rows; const seen: string[] = [];
    await assert.rejects(async () => { for await (const frame of new PostgresInventoryQueryReader(pool, null, nativeReadRuntime(pool)).readInventoryOutput(read(pool))) seen.push(frame.kind); });
    assert.deepEqual(seen, []); assert.equal(stages(pool).includes("output-products"), false); assert.equal(stages(pool).at(-1), "ROLLBACK"); assert.deepEqual(pool.releases, [undefined]);
  }
  const inconsistent = nativeKeyPool(1, 0); inconsistent.flags.uncovered_sku = true;
  await assert.rejects(new PostgresInventoryQueryReader(inconsistent, null, nativeReadRuntime(inconsistent)).readInventory(read(inconsistent)), code("INVENTORY_INTEGRITY_FAILED"));
  const denied = nativeKeyPool(1, 1); await assert.rejects(new PostgresInventoryQueryReader(denied, null, { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady() { throw Error("HOST_DENIED"); } }).readInventory(read(denied)), /HOST_DENIED/); assert.deepEqual(stages(denied), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "ROLLBACK"]);
});

test("inventory full output PG: one RR snapshot, one full summary and bounded keyset batches produce the complete filter only after COMMIT", async () => {
  const pool = new ScriptedPool(); pool.count = 203; const reader = new PostgresInventoryQueryReader(pool), iterator = reader.readInventoryOutput(read(pool))[Symbol.asyncIterator]();
  assert.equal(pool.connects, 0); const first = await iterator.next(); assert.equal(first.value.kind, "summary"); assert.equal(stages(pool).includes("output-products"), false);
  const frames = [first.value]; for (;;) { const frame = await iterator.next(); if (frame.done) break; if (frame.value.kind === "complete") assert.equal(stages(pool).at(-1), "COMMIT"); frames.push(frame.value); }
  assert.equal(frames.filter(f => f.kind === "product").length, 203); const last = frames.at(-1)!; assert.equal(last.kind, "complete"); if (last.kind === "complete") { assert.equal(last.emittedProducts, 203); assert.equal(last.allMatchesTotal.knownQuantity, "-406"); }
  assert.equal(stages(pool).filter(s => s === "catalog-status").length, 1); assert.equal(stages(pool).filter(s => s === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY").length, 1); assert.deepEqual(pool.releases, [undefined]);
  const chunks = pool.calls.filter(c => c.sql.includes("inventory:output-products")); assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map(c => c.values[10]), [100, 100, 100]); assert.equal(chunks[1]!.values[9], productId(99)); assert.equal(chunks[2]!.values[9], productId(199));
  assert.ok(chunks.every(c => !c.sql.includes("OFFSET") && c.sql.includes('p.product_code COLLATE "C",p.id') && c.sql.includes("LIMIT $11")));
  const empty = new ScriptedPool(); empty.count = 0; const kinds = []; for await (const frame of new PostgresInventoryQueryReader(empty).readInventoryOutput(read(empty))) kinds.push(frame.kind);
  assert.deepEqual(kinds, ["summary", "complete"]); assert.equal(stages(empty).includes("output-products"), false); assert.equal(stages(empty).at(-1), "COMMIT");
});

test("inventory full output PG: failure, uncertain COMMIT, postcommit abort and consumer cancellation never publish completion or leak a connection", async () => {
  for (const failAt of ["balances", "COMMIT"]) {
    const pool = new ScriptedPool(); pool.failAt = failAt; const kinds: string[] = [];
    await assert.rejects(async () => { for await (const frame of new PostgresInventoryQueryReader(pool).readInventoryOutput(read(pool))) kinds.push(frame.kind); });
    assert.equal(kinds.includes("complete"), false); assert.equal(pool.releases.length, 1); assert.equal(pool.releases[0] instanceof Error, failAt === "COMMIT"); assert.equal(stages(pool).includes("ROLLBACK"), failAt !== "COMMIT");
  }
  const canceled = new ScriptedPool(); canceled.count = 203; const iterator = new PostgresInventoryQueryReader(canceled).readInventoryOutput(read(canceled))[Symbol.asyncIterator]();
  await iterator.next(); await iterator.next(); await iterator.return?.(undefined); assert.equal(stages(canceled).filter(s => s === "output-products").length, 1); assert.equal(stages(canceled).at(-1), "ROLLBACK"); assert.deepEqual(canceled.releases, [undefined]);
  const controller = new AbortController(), late = new ScriptedPool(); late.afterQuery = stage => { if (stage === "COMMIT") controller.abort(); }; const kinds: string[] = [];
  await assert.rejects(async () => { for await (const frame of new PostgresInventoryQueryReader(late).readInventoryOutput(read(late, undefined, controller.signal))) kinds.push(frame.kind); }, code("INVENTORY_READ_ABORTED"));
  assert.equal(kinds.includes("complete"), false); assert.equal(stages(late).includes("ROLLBACK"), false); assert.deepEqual(late.releases, [undefined]);
  const broken = new ScriptedPool(); broken.failAt = "balances"; broken.failRollback = true;
  await assert.rejects(async () => { for await (const _ of new PostgresInventoryQueryReader(broken).readInventoryOutput(read(broken))) {} }, AggregateError);
  assert.equal(broken.releases.length, 1); assert.ok(broken.releases[0] instanceof Error);
  const incomplete = new ScriptedPool(); incomplete.count = 101; incomplete.transform = (stage, rows) => stage === "balances" ? rows.map(r => ({ ...r, quantity: "1" })) : rows;
  const seen: string[] = []; await assert.rejects(async () => { for await (const frame of new PostgresInventoryQueryReader(incomplete).readInventoryOutput(read(incomplete))) seen.push(frame.kind); }, code("INVENTORY_INTEGRITY_FAILED"));
  assert.equal(seen.includes("complete"), false); assert.equal(stages(incomplete).at(-1), "ROLLBACK");
});

test("inventory season array: verified current selection drives full-filter summary, bounded page and labels without scalar fallback or multiplied stock", async () => {
  const pool = new ScriptedPool(); pool.count = 102; let proofs = 0;
  const reader = new PostgresInventoryQueryReader(pool, { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); proofs++; } });
  assert.equal(pool.connects, 0); assert.equal(proofs, 1);
  pool.transform = (stage, rows) => stage === "products" ? rows.map(row => ({ ...row, season_name: "夏、秋" })) : rows;
  const p = inventoryParameters(), selected = [inventoryId("season", 42), inventoryId("season", 43)],parameters = parseInventoryQuery({ ...p, page: 2, filter: { ...p.filter, seasons: selected.map(id => ({ id, label: "untrusted label" })) } });
  const result = await reader.readInventory(read(pool, parameters)); assert.equal(result.data.products.length, 2); assert.equal(result.data.exactTotalProducts, 102); assert.equal(result.data.allMatchesTotal.knownQuantity, "-204"); assert.equal(result.data.products[0]!.seasonLabel, "夏、秋");
  for (const stage of ["catalog-status", "products", "balances"]) {
    const call = pool.calls.find(c => c.sql.includes(`inventory:${stage}`))!; assert.deepEqual(call.values[6], selected); assert.ok(call.sql.includes("p.season_ids && $7::uuid[]")); assert.equal(/p\.season_id\s*=|coalesce\([^)]*season_ids/i.test(call.sql), false);
  }
  const page = pool.calls.find(c => c.sql.includes("inventory:products"))!; assert.ok(page.sql.includes("string_agg(d.name,'、' ORDER BY d.display_order,d.id)") && page.sql.includes("WHERE d.id=ANY(p.season_ids)"));
  assert.deepEqual(stages(pool), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "publication", "guards", "warehouses", "catalog-status", "products", "sizes", "skus", "balances", "COMMIT"]);
});

test("inventory season array: exact candidate count/page/membership use only current arrays and legacy SQL remains explicit without a verified host", async () => {
  const pool = new ScriptedPool(), seasonId = inventoryId("season", 42);
  pool.transform = (stage, rows) => stage === "candidates" ? [{ id: seasonId, label: "秋", disabled: null, parent_label: null }] : rows;
  const reader = new PostgresInventoryQueryReader(pool, { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); } });
  const result = await reader.readCandidates(candidate(pool, { kind: "season", selectedIds: [inventoryId("season", 99)] })); assert.deepEqual(result.data.items, [{ id: seasonId, label: "秋" }]);
  const count = pool.calls.find(c => c.sql.includes("inventory:candidate-count"))!,page = pool.calls.find(c => c.sql.includes("inventory:candidates"))!,membership = pool.calls.find(c => c.sql.includes("inventory:candidate-integrity"))!;
  assert.ok(count.sql.includes("r.id = ANY(native.season_ids)") && page.sql.includes("r.id = ANY(native.season_ids)")); assert.ok(membership.sql.includes("native.season_ids && $9::uuid[]")); assert.deepEqual(membership.values[8], [seasonId]);
  assert.equal(pool.calls.some(c => /native\.season_id\s*=|coalesce\([^)]*season_ids/i.test(c.sql)), false); assert.equal(stages(pool).includes("catalog-status"), false);
  const legacy = new ScriptedPool(); await new PostgresInventoryQueryReader(legacy).readInventory(read(legacy));
  assert.ok(legacy.calls.find(c => c.sql.includes("inventory:products"))!.sql.includes("se.id = p.season_id")); assert.equal(legacy.calls.some(c => c.sql.includes("season_ids")), false);
});

test("D3 read outcome: inventory and candidates never roll back an attempted COMMIT", async () => {
  for (const candidates of [false, true]) {
    const pool = new ScriptedPool(); pool.failAt = "COMMIT";
    const reader = new PostgresInventoryQueryReader(pool);
    await assert.rejects(candidates ? reader.readCandidates(candidate(pool)) : reader.readInventory(read(pool)), /SYNTHETIC COMMIT failure/);
    assert.equal(stages(pool).at(-1), "COMMIT"); assert.ok(!stages(pool).includes("ROLLBACK"));
    assert.equal(pool.connects, 1); assert.equal(pool.releases.length, 1); assert.ok(pool.releases[0] instanceof Error);
  }
});
test("D3 read outcome: inventory and candidates abort after confirmed COMMIT without discarding the healthy connection", async () => {
  for (const candidates of [false, true]) {
    const pool = new ScriptedPool(); const controller = new AbortController();
    pool.afterQuery = stage => { if (stage === "COMMIT") controller.abort(); };
    const reader = new PostgresInventoryQueryReader(pool);
    await assert.rejects(candidates ? reader.readCandidates({ ...candidate(pool), signal: controller.signal }) : reader.readInventory(read(pool, undefined, controller.signal)), code("INVENTORY_READ_ABORTED"));
    assert.equal(stages(pool).at(-1), "COMMIT"); assert.ok(!stages(pool).includes("ROLLBACK"));
    assert.deepEqual(pool.releases, [undefined]);
  }
});

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
    categories: [{ id: inventoryId("category", 40), label: "not a fact" }], suppliers: [{ id: inventoryId("supplier", 41), label: "not a fact" }],
    fits: [{ id: fitId, label: "not a fact" }], seasons: [{ id: inventoryId("season", 42), label: "not a fact" }] } });
  await new PostgresInventoryQueryReader(pool).readInventory(read(pool, input));
  const status = pool.calls.find(call => call.sql.includes("inventory:catalog-status"))!;
  assert.deepEqual(status.values.slice(2), [[productId(0)], [inventoryId("category", 40)], [inventoryId("supplier", 41)], [fitId], [inventoryId("season", 42)], batchId]);
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
      parent_label: kind === "category" ? "Native parent" : null, ...(kind === "category" ? { parent_id: inventoryId("category", 79), depth: 1, category_valid: true } : {}),
      ...(kind === "product" ? { code: "NATIVE", name: "Native candidate" } : {})
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
      ...(kind === "category" ? { parent_id: null, depth: 0, category_valid: true } : {}),
      ...(kind === "product" ? { code: "NATIVE", name: "Native candidate" } : {})
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
  const guards = readFileSync(new URL("../adapters/postgres/src/inventory-publication-guards.ts", import.meta.url), "utf8");
  assert.ok(guards.includes("required.table_name") && guards.includes("required.trigger_name"));
  assert.ok(source.includes('import { GUARD_CAPABILITY } from "./inventory-publication-guards.ts";'));
  assert.ok(source.includes("query(GUARD_CAPABILITY)"));
  assert.ok(source.includes("ORDER BY b.id LIMIT 2"));
  assert.ok(source.includes("category.parent_id = ANY($4::uuid[])"));
  assert.ok(source.includes("WHERE parent.parent_id IS NOT NULL) AS invalid_category_tree"));
});

test("inventory category SQL contract: one positive-array predicate is shared by list/count/full summary and never multiplies parent+child products", async () => {
  const categories = [inventoryId("category", 40), inventoryId("category", 41)];
  for (const categoryIds of [[], categories]) {
    const pool = new ScriptedPool();
    const parameters = parseInventoryQuery({ ...inventoryParameters(), filter: { ...inventoryParameters().filter,
      categories: categoryIds.map(id => ({ id, label: "not a database fact" })) } });
    const result = await new PostgresInventoryQueryReader(pool).readInventory(read(pool, parameters));
    const queries = pool.calls.filter(call => ["catalog-status", "products", "balances"].some(stage => call.sql.includes(`inventory:${stage}`)));
    const prefix = (sql: string) => /WITH published_scope[\s\S]*?filtered_skus AS \([\s\S]*?\n\)/.exec(sql)?.[0];
    for (const call of queries) {
      assert.deepEqual(call.values[3], categoryIds); assert.deepEqual(call.values[0], inventoryScope.warehouses.map(row => row.id));
      assert.match(call.sql, /cardinality\(\$4::uuid\[\]\) = 0 OR p.category_id = ANY\(\$4::uuid\[\]\) OR EXISTS/);
      assert.match(call.sql, /category.parent_id = ANY\(\$4::uuid\[\]\)/);
      assert.equal(prefix(call.sql), prefix(queries[0]!.sql));
      assert.ok(!/unnest\(\$4|JOIN.*\$4|\$4::uuid IS NULL/.test(call.sql));
      assert.ok(!JSON.stringify(call.values).includes("not a database fact"));
    }
    assert.equal(result.data.exactTotalProducts, 1); assert.equal(result.data.products.length, 1);
    assert.equal(result.data.allMatchesTotal.knownQuantity, "-2");
  }
});

test("inventory candidate SQL contract: arrays and direct fields use the existing one-page query without eager details or per-row reads", async () => {
  const categories = [inventoryId("category", 40), inventoryId("category", 41)];
  const pool = new ScriptedPool();
  const result = await new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool, { categoryIds: categories }));
  const page = pool.calls.find(call => call.sql.includes("inventory:candidates"))!;
  assert.deepEqual(page.values[3], categories); assert.match(page.sql, /r.product_code AS code, r.name/);
  assert.deepEqual(result.data.items[0], { id: productId(0), label: "NATIVE-000000 Synthetic native product", code: "NATIVE-000000", name: "Synthetic native product", disabled: false });
  assert.equal(stages(pool).filter(stage => stage === "candidates").length, 1);
  assert.ok(pool.calls.every(call => !/retail_price|product_image|product-query|inventory:products/.test(call.sql)));
  for (const kind of ["category", "warehouse"] as const) {
    const p = new ScriptedPool(); p.transform = (stage, rows) => stage === "candidates" ? [{
      id: kind === "warehouse" ? inventoryScope.warehouses[0]!.id : inventoryId("category", 80),
      label: kind === "warehouse" ? inventoryScope.warehouses[0]!.label : "Native root", disabled: null, parent_label: null,
      ...(kind === "category" ? { parent_id: null, depth: 0, category_valid: true } : {}) }] : rows;
    await new PostgresInventoryQueryReader(p).readCandidates(candidate(p, { kind, categoryIds: categories }));
    const query = p.calls.find(call => call.sql.includes("inventory:candidates"))!;
    assert.deepEqual(query.values[3], []);
    if (kind === "category") assert.match(query.sql, /r.parent_id/);
  }
});

test("SYNTHETIC product search SQL contract: native system-item-code shares bounded count/page predicate; percent/underscore are literal and null grants no match", async () => {
  // Finite scripted model ONLY. This checks reader protocol plus the exact generated SQL shape;
  // it does not claim to execute PostgreSQL or verify deployed migration 0005.
  const rows = [
    { id: productId(0), code: "STYLE-A", name: "Shirt", system: "SYS_%_Match" },
    { id: productId(1), code: "STYLE-B", name: "Coat", system: null },
    { id: productId(2), code: "STYLE-C", name: "Pants", system: "SYSAXMatch" }
  ];
  class SearchPool extends ScriptedPool {
    override async query(sql: string, values: unknown[] = []): Promise<PgInventoryQueryResult> {
      const response = await super.query(sql, values);
      if (!/\/\* inventory:(candidate-count|candidates) \*\//.test(sql)) return response;
      assert.match(sql, /WHERE \(strpos\(r.product_code, \$9::text\) > 0 OR strpos\(r.name, \$9::text\) > 0 OR strpos\(r.system_item_code, \$9::text\) > 0\)/);
      assert.ok(!/\bI?LIKE\b|coalesce\(r.system_item_code|r.id::text/.test(sql));
      const search = values[8] as string;
      const matches = rows.filter(row => row.code.includes(search) || row.name.includes(search)
        || (row.system !== null && row.system.includes(search)));
      const result = sql.includes("inventory:candidate-count") ? [{ exact_total: String(matches.length) }]
        : matches.slice(Number(values[10]), Number(values[10]) + Number(values[9])).map(row => ({
          id: row.id, label: `${row.code} ${row.name}`, code: row.code, name: row.name, disabled: false, parent_label: null
        }));
      return { rows: result, rowCount: result.length };
    }
  }
  for (const [search, expected] of [["SYS_%_Match", [productId(0)]], ["%", [productId(0)]], ["_", [productId(0)]],
    ["SYS", [productId(0), productId(2)]], ["STYLE-B", [productId(1)]], ["Coat", [productId(1)]],
    ["not present", []], ["%' OR TRUE --", []], ["", rows.map(row => row.id)]] as const) {
    const pool = new SearchPool(); const categories = [inventoryId("category", 40)];
    const result = await new PostgresInventoryQueryReader(pool).readCandidates(candidate(pool, { search, categoryIds: categories }));
    assert.deepEqual(result.data.items.map(row => row.id), expected); assert.equal(result.data.exactTotal, expected.length);
    const count = pool.calls.find(call => call.sql.includes("inventory:candidate-count"))!;
    const page = pool.calls.find(call => call.sql.includes("inventory:candidates"))!;
    const predicate = (sql: string) => /FROM naijue_erp.product r JOIN matched_products p ON p.id = r.id WHERE ([^\n]+)/.exec(sql)?.[1];
    assert.equal(predicate(count.sql), predicate(page.sql)); assert.ok(predicate(count.sql));
    assert.deepEqual(count.values, page.values.slice(0, 9)); assert.equal(count.values[8], search);
    assert.deepEqual(page.values.slice(-2), [20, "0"]); assert.deepEqual(page.values[3], categories);
    assert.deepEqual(page.values[0], inventoryScope.warehouses.map(row => row.id)); assert.deepEqual(page.values[1], inventoryScope.hallIds);
    assert.match(page.sql, /ORDER BY r.product_code COLLATE "C", r.id LIMIT \$10 OFFSET \$11::bigint/);
    if (search.length > 1) assert.ok(!page.sql.includes(search));
    assert.equal(stages(pool).filter(stage => stage === "candidates").length, 1);
  }
  for (const search of [null, 123, {}, "bad\u0000text", "x".repeat(201)]) {
    const pool = new SearchPool();
    await assert.rejects(() => new PostgresInventoryQueryReader(pool).readCandidates({
      actor: inventoryActor, scope: inventoryScope, signal: new AbortController().signal,
      parameters: { ...candidateParameters(), search } as unknown as InventoryCandidateQuery
    }), code("INVALID_INVENTORY_INPUT")); assert.equal(pool.connects, 0);
  }
});
