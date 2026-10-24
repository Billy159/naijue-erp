/** Synthetic service boundaries only: no database, host or real-role verification. */
import test from "node:test";
import assert from "node:assert/strict";
import { createProductDetailsQueryService } from "../packages/application/src/product-details-query-service.ts";
import type { ProductBarcodePage, ProductDefaultScheme, ProductDetailsQueryDependencies, ProductWarehouseStockPage, ProductStockOverviewResult } from "../packages/application/src/product-details-query-ports.ts";
import { parseProductStockOverviewQuery, checkedProductStockOverviewScope, checkedProductStockOverviewResult, checkedProductDefaultScheme } from "../packages/application/src/product-details-query-validation.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const productId = sid("product", 7101), warehouseId = sid("warehouse", 7102), skuId = sid("sku", 7103);
const parameters = { productId, page: 1, pageSize: 20 as const }, signal = () => new AbortController().signal;
const emptyStock = (): ProductWarehouseStockPage => ({ ...parameters, total: 0, items: [] });
function setup(change: Partial<ProductDetailsQueryDependencies> = {}) {
  let reads = 0;
  const dependencies: ProductDetailsQueryDependencies = {
    authorization: { async authorize(_actor, intent) { return { kind: intent.kind, productId: intent.parameters.productId }; } },
    reader: { async readPrices() { reads++; return null; }, async readBarcodes() { reads++; return null; } },
    stockReader: null, ...change
  };
  return { service: createProductDetailsQueryService(dependencies), reads: () => reads };
}
test("product details: per-tab denial/mismatched grant precedes all reads and unavailable stock", async () => {
  for (const authorization of [
    { async authorize() { throw new DomainError("FORBIDDEN", "synthetic denial"); } },
    { async authorize() { return { kind: "prices" as const, productId: sid("product", 999) }; } },
    { async authorize() { return { kind: "barcodes" as const, productId }; } }
  ]) {
    const f = setup({ authorization });
    await assert.rejects(f.service.readPrices(actor, { productId }, signal()), { code: "FORBIDDEN" }); assert.equal(f.reads(), 0);
  }
  const f = setup();
  await assert.rejects(f.service.readStock(actor, parameters, signal()), { code: "PRODUCT_STOCK_NOT_READY" }); assert.equal(f.reads(), 0);
});
test("product default scheme response: legacy and native variants have exact closed fields", () => {
  const valid: ProductDefaultScheme[] = [{ state: "UNAVAILABLE", reason: "NO_PRODUCT_SCHEME_FIELD" }, { state: "NOT_SET" }, { state: "AVAILABLE", schemeId: sid("product", 7110) }];
  for (const value of valid) assert.deepEqual(checkedProductDefaultScheme(value), value);
  for (const value of [null, undefined, {}, { state: "NOT_SET", schemeId: null }, { state: "UNAVAILABLE", reason: "READ_FAILED" },
    { state: "AVAILABLE" }, { state: "AVAILABLE", schemeId: null }, { state: "AVAILABLE", schemeId: "not-a-uuid" },
    { state: "AVAILABLE", schemeId: sid("product", 7110), reason: "NO_PRODUCT_SCHEME_FIELD" }]) assert.throws(() => checkedProductDefaultScheme(value));
});
test("product default scheme response: original service validates returned variants after the per-tab grant", async () => {
  const values: unknown[] = [{ state: "UNAVAILABLE", reason: "NO_PRODUCT_SCHEME_FIELD" }, { state: "NOT_SET" }, { state: "AVAILABLE", schemeId: sid("product", 7110) }, { state: "NOT_SET", reason: "READ_FAILED" }];
  for (const defaultScheme of values) {
    let authorized = false;
    const f = setup({ authorization: { async authorize(_actor, intent) { authorized = true; return { kind: intent.kind, productId }; } },
      reader: { async readPrices() { return null; }, async readBarcodes() { assert.equal(authorized, true); return { ...parameters, version: 4, total: 0, items: [], defaultScheme } as ProductBarcodePage; } } });
    if (Object.hasOwn(defaultScheme as object, "reason") && (defaultScheme as { state: string }).state === "NOT_SET")
      await assert.rejects(f.service.readBarcodes(actor, parameters, signal()), { code: "INVALID_DATABASE_VALUE" });
    else assert.deepEqual((await f.service.readBarcodes(actor, parameters, signal()))!.defaultScheme, defaultScheme);
  }
});

const overviewQuery = { productId, warehouseMode: "NON_ZERO" as const };
const overview = (mode: "NON_ZERO" | "ALL" = "NON_ZERO"): ProductStockOverviewResult => ({
  kind: "PRODUCT_STOCK_OVERVIEW_V1", productId, warehouseMode: mode, readReference: "SYNTHETIC-OVERVIEW:1", coverage: "AUTHORIZED_SUBSET",
  counts: { authorizedWarehouses: 3, nonZeroWarehouses: 2, zeroWarehouses: 1, unknownWarehouses: 0, returnedWarehouses: mode === "ALL" ? 3 : 2 },
  total: { state: "KNOWN", quantity: "18446744073709551612", unknownSkuWarehouseKeys: 0 },
  items: [{ warehouseId, warehouseName: "SYNTHETIC LARGE", state: "KNOWN", quantity: "18446744073709551614", unknownSkuCount: 0 },
    { warehouseId: sid("warehouse", 7111), warehouseName: "SYNTHETIC NEGATIVE", state: "KNOWN", quantity: "-2", unknownSkuCount: 0 },
    ...(mode === "ALL" ? [{ warehouseId: sid("warehouse", 7112), warehouseName: "SYNTHETIC ZERO", state: "KNOWN" as const, quantity: "0", unknownSkuCount: 0 }] : [])]
});
test("W14 overview exact body and original stock-tab scope reject client authority or inconsistent intents", () => {
  assert.deepEqual(parseProductStockOverviewQuery(overviewQuery), overviewQuery);
  for (const input of [{ productId }, { ...overviewQuery, page: 1 }, { ...overviewQuery, warehouseIds: [] }, { ...overviewQuery, warehouseMode: "POSITIVE" }, { ...overviewQuery, readReference: "CLIENT" }])
    assert.throws(() => parseProductStockOverviewQuery(input), { code: "INVALID_PRODUCT_DETAILS_QUERY" });
  const scope = { actor, intent: { kind: "stock-overview" as const, parameters: overviewQuery }, grant: { kind: "stock" as const, productId }, parameters: overviewQuery, signal: signal() };
  assert.equal(checkedProductStockOverviewScope(scope), scope);
  assert.throws(() => checkedProductStockOverviewScope({ ...scope, parameters: { ...overviewQuery, warehouseMode: "ALL" } }), { code: "FORBIDDEN" });
  assert.throws(() => checkedProductStockOverviewScope({ ...scope, grant: { kind: "prices", productId } }), { code: "FORBIDDEN" });
});
test("W14 overview obtains stock permission once, delegates once, preserves exact whole totals and strips provider extras", async () => {
  let auth = 0, reads = 0, oldReads = 0;
  const f = setup({ authorization: { async authorize(_actor, intent) { auth++; assert.equal(intent.kind, "stock"); assert.deepEqual(intent.parameters, parameters); return { kind: "stock", productId }; } },
    stockReader: { async readStock() { oldReads++; return emptyStock(); }, async readOverview(scope) {
      reads++; assert.equal(scope.intent.kind, "stock-overview"); assert.equal(scope.grant.kind, "stock");
      const result = overview(scope.parameters.warehouseMode);
      return { ...result, secretPath: "PRIVATE", counts: { ...result.counts, hiddenWarehouseCount: 99 }, total: { ...result.total, token: "PRIVATE" }, items: result.items.map(item => ({ ...item, privateDriver: "PRIVATE" })) };
    } } });
  const hidden = await f.service.readStockOverview(actor, overviewQuery, signal()), all = await f.service.readStockOverview(actor, { ...overviewQuery, warehouseMode: "ALL" }, signal());
  assert.deepEqual(hidden, overview()); assert.deepEqual(all, overview("ALL")); assert.deepEqual(hidden!.total, all!.total);
  assert.equal(auth, 2); assert.equal(reads, 2); assert.equal(oldReads, 0); assert.doesNotMatch(JSON.stringify(hidden), /PRIVATE|hiddenWarehouseCount/);
});
test("W14 unknown keys stay visible and poison whole total; empty NON_ZERO requires known zero scope", () => {
  const unknown: ProductStockOverviewResult = { ...overview(), counts: { authorizedWarehouses: 3, nonZeroWarehouses: 1, zeroWarehouses: 1, unknownWarehouses: 1, returnedWarehouses: 2 },
    total: { state: "UNKNOWN", quantity: null, unknownSkuWarehouseKeys: 3 }, items: [overview().items[1]!, { warehouseId: sid("warehouse", 7112), warehouseName: "SYNTHETIC UNKNOWN", state: "UNKNOWN", quantity: null, unknownSkuCount: 3 }] };
  assert.deepEqual(checkedProductStockOverviewResult(unknown, overviewQuery), unknown);
  const empty: ProductStockOverviewResult = { ...overview(), counts: { authorizedWarehouses: 3, nonZeroWarehouses: 0, zeroWarehouses: 3, unknownWarehouses: 0, returnedWarehouses: 0 }, total: { state: "KNOWN", quantity: "0", unknownSkuWarehouseKeys: 0 }, items: [] };
  assert.deepEqual(checkedProductStockOverviewResult(empty, overviewQuery), empty);
  for (const value of [{ ...unknown, total: { state: "KNOWN", quantity: "-2", unknownSkuWarehouseKeys: 3 } },
    { ...unknown, items: [unknown.items[0]!, { ...unknown.items[1]!, quantity: "0" }] },
    { ...unknown, total: { ...unknown.total, unknownSkuWarehouseKeys: 2 } },
    { ...empty, warehouseMode: "ALL" }, { ...empty, counts: { ...empty.counts, authorizedWarehouses: 0, zeroWarehouses: 0 } }])
    assert.throws(() => checkedProductStockOverviewResult(value, overviewQuery), { code: "INVALID_PRODUCT_STOCK_OVERVIEW_DATA" });
});
test("W14 invalid aggregate identities/counts/precision and over-bound reads fail whole result", () => {
  const good = overview();
  for (const value of [{ ...good, productId: sid("product", 9) }, { ...good, readReference: "bad\nreference" },
    { ...good, total: { ...good.total, quantity: "18446744073709551614" } },
    { ...good, counts: { ...good.counts, authorizedWarehouses: 1001 } },
    { ...good, items: [good.items[0]!, { ...good.items[1]!, warehouseId }] },
    { ...good, items: [{ ...good.items[0]!, quantity: Number.MAX_SAFE_INTEGER }, good.items[1]!] },
    { ...good, items: [{ ...good.items[0]!, unknownSkuCount: 1 }, good.items[1]!] },
    ...["-0", "01", "1.0", "1e2", "1".repeat(101)].map(quantity => ({ ...good, items: [{ ...good.items[0]!, quantity }, good.items[1]!] }))])
    assert.throws(() => checkedProductStockOverviewResult(value, overviewQuery), { code: "INVALID_PRODUCT_STOCK_OVERVIEW_DATA" });
});
test("W14 denied/missing/aborted providers never call old stock or fabricate overview", async () => {
  let oldReads = 0;
  const legacy = { async readStock() { oldReads++; return emptyStock(); } };
  await assert.rejects(setup({ stockReader: legacy }).service.readStockOverview(actor, overviewQuery, signal()), { code: "PRODUCT_STOCK_NOT_READY" });
  await assert.rejects(setup({ stockReader: legacy, authorization: { async authorize() { throw new DomainError("FORBIDDEN", "SYNTHETIC"); } } }).service.readStockOverview(actor, overviewQuery, signal()), { code: "FORBIDDEN" });
  await assert.rejects(setup({ stockReader: legacy, authorization: { async authorize() { return { kind: "prices", productId }; } } }).service.readStockOverview(actor, overviewQuery, signal()), { code: "FORBIDDEN" });
  const controller = new AbortController();
  const f = setup({ stockReader: { ...legacy, async readOverview() { controller.abort(); return overview(); } } });
  await assert.rejects(f.service.readStockOverview(actor, overviewQuery, controller.signal), { code: "PRODUCT_READ_ABORTED" });
  assert.equal(await setup({ stockReader: { ...legacy, async readOverview() { return null; } } }).service.readStockOverview(actor, overviewQuery, signal()), null);
  assert.equal(oldReads, 0);
});
test("product details: strict target/page input rejects hidden fields and unsafe offsets; abort prevents authorization", async () => {
  const f = setup();
  for (const input of [{ ...parameters, page: 0 }, { ...parameters, page: "1" }, { ...parameters, pageSize: 200 },
    { ...parameters, page: Number.MAX_SAFE_INTEGER }, { ...parameters, defaultBarcodeSchemeId: null }])
    await assert.rejects(f.service.readBarcodes(actor, input, signal()), { code: "INVALID_PRODUCT_DETAILS_QUERY" });
  await assert.rejects(f.service.readPrices(actor, { productId, prices: {} }, signal()), { code: "INVALID_PRODUCT_QUERY" });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.readPrices(actor, { productId }, controller.signal), { code: "PRODUCT_READ_ABORTED" }); assert.equal(f.reads(), 0);
});
test("product details: D3 stock delegation preserves exact negative/zero/unknown and rejects invented quantities", async () => {
  const stock: ProductWarehouseStockPage = { ...parameters, total: 3, items: [
    { warehouseId, warehouseName: "SYNTHETIC", skuId, quantity: "-2", state: "KNOWN" },
    { warehouseId, warehouseName: "SYNTHETIC", skuId: sid("sku", 7104), quantity: "0", state: "KNOWN" },
    { warehouseId, warehouseName: "SYNTHETIC", skuId: sid("sku", 7105), quantity: null, state: "MISSING" }
  ] };
  let calls = 0;
  const f = setup({ stockReader: { async readStock(read) { calls++; assert.equal(read.actor.accountId, actor.accountId); assert.equal(read.grant.kind, "stock"); return stock; } } });
  assert.deepEqual(await f.service.readStock(actor, parameters, signal()), stock); assert.equal(calls, 1); assert.equal(f.reads(), 0);
  const privateResult = { ...stock, privateReference: "PRIVATE_PROVIDER", items: stock.items.map(item => ({ ...item, storagePath: "PRIVATE_PROVIDER" })) };
  const safe = setup({ stockReader: { async readStock() { return privateResult; } } });
  assert.deepEqual(await safe.service.readStock(actor, parameters, signal()), stock);
  for (const bad of [
    { ...stock, productId: sid("product", 999) },
    { ...emptyStock(), total: 1 },
    { ...parameters, total: 1, items: [{ ...stock.items[2]!, quantity: "0" }] },
    { ...parameters, total: 1, items: [{ ...stock.items[0]!, quantity: "-0" }] },
    { ...parameters, total: 2, items: [stock.items[0]!, stock.items[0]!] }
  ]) {
    const g = setup({ stockReader: { async readStock() { return bad as ProductWarehouseStockPage; } } });
    await assert.rejects(g.service.readStock(actor, parameters, signal()));
  }
});
