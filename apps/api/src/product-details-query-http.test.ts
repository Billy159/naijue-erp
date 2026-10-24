/** Fastify inject only, without listeners, real sessions or a database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createProductDetailsQueryHttpPlugin } from "./product-details-query-http.ts";
import { PostgresProductDetailsQueryReader } from "../../../adapters/postgres/src/product-details-query-reader.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { CATALOGUE_PRICE_KEYS } from "../../../packages/application/src/catalogue-price-input.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
const productId = sid("product", 7301), page = { productId, page: 1, pageSize: 20 };
test("SKU barcode HTTP: the original route distinguishes missing target, zero bindings and invalid cross-tab parameters", async t => {
  const skuId = sid("sku", 7310), statements: string[] = [];
  let grants = 0;
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
    authorization: { async authorize(_actor, intent) { grants++; return { kind: intent.kind, productId: intent.parameters.productId }; } },
    reader: new PostgresProductDetailsQueryReader({ async connect() { return {
      async query(sql, values = []) {
        statements.push(sql); let rows: Record<string, unknown>[] = [];
        if (sql.startsWith("SELECT p.id")) rows = [{ id: productId, version: 1 }];
        if (sql.startsWith("SELECT s.id") && values[0] === skuId && values[1] === productId) rows = [{ id: skuId, product_id: productId }];
        if (sql.startsWith("SELECT count")) rows = [{ total: "0" }];
        return { rows, rowCount: rows.length };
      }, release() {}
    }; } }), stockReader: null
  } }));
  const request = { ...page, skuId };
  const zero = await app.inject({ method: "POST", url: "/products/barcodes/query", payload: request });
  assert.equal(zero.statusCode, 200, zero.body); assert.equal(zero.json().skuId, skuId); assert.equal(zero.json().total, 0); assert.deepEqual(zero.json().items, []);
  assert.equal(zero.headers["cache-control"], "no-store");
  const missing = await app.inject({ method: "POST", url: "/products/barcodes/query", payload: { ...request, skuId: sid("sku", 999) } });
  assert.equal(missing.statusCode, 200, missing.body); assert.equal(missing.json(), null);
  const old = await app.inject({ method: "POST", url: "/products/barcodes/query", payload: page });
  assert.equal(old.statusCode, 200, old.body); assert.equal(Object.hasOwn(old.json(), "skuId"), false);
  const before = statements.length, beforeGrants = grants;
  for (const [url, payload] of [["/products/barcodes/query", { ...request, skuId: null }], ["/products/barcodes/query", { ...request, skuId: "bad" }],
    ["/products/stock/query", request], ["/products/prices/query", { productId, skuId }], ["/products/stock-overview/query", { productId, warehouseMode: "ALL", skuId }]] as const) {
    const rejected = await app.inject({ method: "POST", url, payload }); assert.equal(rejected.statusCode, 400, rejected.body);
  }
  assert.equal(statements.length, before); assert.equal(grants, beforeGrants); assert.equal(app.server.listening, false);
});
test("product detail HTTP: authenticated price/retained-code reads reach old-field SQL; stock unavailable is explicit 503", async t => {
  const statements: string[] = [];
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
    authorization: { async authorize(_actor, intent) { return { kind: intent.kind, productId: intent.parameters.productId }; } },
    reader: new PostgresProductDetailsQueryReader({ async connect() { return {
      async query(sql) {
        statements.push(sql); let rows: Record<string, unknown>[] = [];
        if (sql.startsWith("SELECT p.id")) rows = [{ id: productId, version: 1, ...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, key === "retail_price" ? "0.00" : null])) }];
        if (sql.startsWith("SELECT count")) rows = [{ total: "0" }]; return { rows, rowCount: rows.length };
      }, release() {}
    }; } }), stockReader: null
  } })); await app.ready();
  const prices = await app.inject({ method: "POST", url: "/products/prices/query", payload: { productId } });
  assert.equal(prices.statusCode, 200, prices.body); assert.equal(prices.json().prices.retail_price, "0.00"); assert.equal(prices.json().prices.purchase_price, null);
  assert.equal(prices.headers["cache-control"], "no-store");
  const barcodes = await app.inject({ method: "POST", url: "/products/barcodes/query", payload: page });
  assert.equal(barcodes.statusCode, 200, barcodes.body); assert.deepEqual(barcodes.json().items, []); assert.equal(barcodes.json().defaultScheme.state, "UNAVAILABLE");
  const before = statements.length, stock = await app.inject({ method: "POST", url: "/products/stock/query", payload: page });
  assert.equal(stock.statusCode, 503); assert.equal(stock.json().error.code, "PRODUCT_STOCK_NOT_READY"); assert.equal(statements.length, before);
  assert.equal(app.server.listening, false); assert.ok(statements.every(sql => !/INSERT|UPDATE|DELETE/.test(sql)));
  for (const [url, payload, expected] of [["/products/barcodes/query", { ...page, pageSize: "20" }, 400], ["/products/prices/query?x=1", { productId }, 400],
    ["/products/prices/query", { productId, defaultBarcodeSchemeId: null }, 400]] as const)
    assert.equal((await app.inject({ method: "POST", url, payload })).statusCode, expected);
});

test("W14 HTTP overview uses exact new route; zero-only scope is real and legacy stock total remains a row count", async t => {
  let oldReads = 0, overviewReads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
    authorization: { async authorize(_actor, intent) { return { kind: intent.kind, productId }; } },
    reader: { async readPrices() { return null; }, async readBarcodes() { return null; } },
    stockReader: { async readStock(scope) { oldReads++; return { ...scope.parameters, total: 21, items: [] }; }, async readOverview(scope) {
      overviewReads++; return { kind: "PRODUCT_STOCK_OVERVIEW_V1", productId, warehouseMode: scope.parameters.warehouseMode, readReference: "SYNTHETIC-1", coverage: "AUTHORIZED_SUBSET",
        counts: { authorizedWarehouses: 2, nonZeroWarehouses: 0, zeroWarehouses: 2, unknownWarehouses: 0, returnedWarehouses: 0 }, total: { state: "KNOWN", quantity: "0", unknownSkuWarehouseKeys: 0 }, items: [] };
    } }
  } }));
  const request = { productId, warehouseMode: "NON_ZERO" };
  const response = await app.inject({ method: "POST", url: "/products/stock-overview/query", payload: request });
  assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().total.quantity, "0"); assert.equal(response.json().counts.authorizedWarehouses, 2);
  assert.equal(response.headers["cache-control"], "no-store"); assert.equal(oldReads, 0); assert.equal(overviewReads, 1);
  for (const [url, payload] of [["/products/stock-overview/query", { ...request, page: 1 }], ["/products/stock-overview/query?warehouseId=1", request]] as const)
    assert.equal((await app.inject({ method: "POST", url, payload })).statusCode, 400);
  const old = await app.inject({ method: "POST", url: "/products/stock/query", payload: { productId, page: 3, pageSize: 20 } });
  assert.equal(old.statusCode, 200, old.body); assert.equal(old.json().total, 21); assert.equal(oldReads, 1); assert.equal(overviewReads, 1);
});
test("W14 HTTP overview unavailable/not-found/denied/integrity/provider failures are explicit and sanitized", async t => {
  for (const mode of ["missing", "notfound", "denied", "integrity", "malformed", "failure"] as const) {
    let oldReads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
    const stockReader = { async readStock() { oldReads++; return null; }, ...(mode === "missing" ? {} : { async readOverview() {
      if (mode === "notfound") return null;
      if (mode === "denied") throw new DomainError("FORBIDDEN", "PRIVATE_PERMISSION");
      if (mode === "integrity") throw new DomainError("INVENTORY_INTEGRITY_FAILED", "PRIVATE_FACTS");
      if (mode === "malformed") throw new DomainError("INVALID_PRODUCT_STOCK_OVERVIEW_DATA", "PRIVATE_COUNT");
      throw Error("PRIVATE_SQL");
    } }) };
    app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
      authorization: { async authorize(_actor, intent) { return { kind: intent.kind, productId }; } }, reader: { async readPrices() { return null; }, async readBarcodes() { return null; } }, stockReader
    } }));
    const response = await app.inject({ method: "POST", url: "/products/stock-overview/query", payload: { productId, warehouseMode: "NON_ZERO" } });
    assert.equal(response.statusCode, mode === "notfound" ? 404 : mode === "denied" ? 403 : mode === "failure" ? 500 : 503, response.body);
    assert.doesNotMatch(response.body, /PRIVATE|"items"/); assert.equal(response.headers["cache-control"], "no-store"); assert.equal(oldReads, 0);
  }
});
test("W14 R01 overview read bound returns controlled 503 without truncation or old stock fallback; legacy mapping stays unchanged", async t => {
  let overviewReads = 0, oldStockReads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
  const tooLarge = () => new DomainError("INVENTORY_READ_TOO_LARGE", "PRIVATE_SKU_WAREHOUSE_BOUND");
  app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
    authorization: { async authorize(_actor, intent) { return { kind: intent.kind, productId }; } },
    reader: { async readPrices() { return null; }, async readBarcodes() { return null; } },
    stockReader: { async readStock() { oldStockReads++; throw tooLarge(); }, async readOverview() { overviewReads++; throw tooLarge(); } }
  } }));
  for (const warehouseMode of ["NON_ZERO", "ALL"] as const) {
    const response = await app.inject({ method: "POST", url: "/products/stock-overview/query", payload: { productId, warehouseMode } });
    assert.equal(response.statusCode, 503, response.body); assert.equal(response.json().error.code, "INVENTORY_NOT_READY");
    assert.equal(response.headers["cache-control"], "no-store"); assert.doesNotMatch(response.body, /PRIVATE|"items"|"total"/);
  }
  assert.equal(overviewReads, 2); assert.equal(oldStockReads, 0); assert.equal(app.server.listening, false);
  const legacy = await app.inject({ method: "POST", url: "/products/stock/query", payload: page });
  assert.equal(legacy.statusCode, 500); assert.equal(legacy.json().error.code, "INTERNAL_ERROR"); assert.equal(oldStockReads, 1);
});
test("product detail HTTP: authentication, per-tab denial and provider errors never disclose data or internals", async t => {
  for (const mode of ["unauthenticated", "forbidden", "failure"] as const) {
    let reads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
    app.register(createProductDetailsQueryHttpPlugin({ authenticate: async () => mode === "unauthenticated" ? null : actor, dependencies: {
      authorization: { async authorize() { if (mode === "forbidden") throw new DomainError("FORBIDDEN", "PRIVATE_GRANT"); throw Error("PRIVATE_SQL"); } },
      reader: { async readPrices() { reads++; return null; }, async readBarcodes() { reads++; return null; } }, stockReader: null
    } })); await app.ready();
    const response = await app.inject({ method: "POST", url: "/products/prices/query", payload: { productId } });
    assert.equal(response.statusCode, mode === "unauthenticated" ? 401 : mode === "forbidden" ? 403 : 500);
    assert.doesNotMatch(response.body, /PRIVATE_/); assert.equal(reads, 0);
  }
});
