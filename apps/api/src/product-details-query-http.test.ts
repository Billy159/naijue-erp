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
