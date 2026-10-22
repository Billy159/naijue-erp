/** Synthetic service boundaries only: no database, host or real-role verification. */
import test from "node:test";
import assert from "node:assert/strict";
import { createProductDetailsQueryService } from "../packages/application/src/product-details-query-service.ts";
import type { ProductDetailsQueryDependencies, ProductWarehouseStockPage } from "../packages/application/src/product-details-query-ports.ts";
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
