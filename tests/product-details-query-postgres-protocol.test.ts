/** Scripted pg protocol, not PostgreSQL-engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresProductDetailsQueryReader } from "../adapters/postgres/src/product-details-query-reader.ts";
import type { PgProductQueryClient } from "../adapters/postgres/src/product-query-reader.ts";
import type { ProductDetailsScopedRead } from "../packages/application/src/product-details-query-ports.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const productId = sid("product", 7201), parameters = { productId, page: 1, pageSize: 20 as const };
function read(kind: "prices" | "barcodes") {
  const p = kind === "prices" ? { productId } : parameters;
  return { actor, parameters: p, intent: { kind, parameters: p }, grant: { kind, productId }, signal: new AbortController().signal } as ProductDetailsScopedRead<typeof parameters>;
}
interface Step { sql: RegExp; rows?: Record<string, unknown>[]; error?: Error; inspect?: (sql: string, values: unknown[]) => void }
function setup(steps: Step[]) {
  const calls: string[] = [], releases: (Error | boolean | undefined)[] = [];
  const client: PgProductQueryClient = {
    async query(sql, values = []) {
      calls.push(sql); const step = steps.shift(); assert.ok(step, sql); assert.match(sql, step.sql); step.inspect?.(sql, values);
      if (step.error) throw step.error; return { rows: step.rows ?? [], rowCount: step.rows?.length ?? 0 };
    }, release(error) { releases.push(error); }
  };
  return { reader: new PostgresProductDetailsQueryReader({ async connect() { return client; } }), calls, releases,
    done() { assert.equal(steps.length, 0); assert.equal(releases.length, 1); } };
}
const begin = () => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ }), commit = () => ({ sql: /^COMMIT$/ }), rollback = () => ({ sql: /^ROLLBACK$/ });
const target = () => ({ sql: /^SELECT p.id, p.version FROM/, rows: [{ id: productId, version: 4 }] });
const barcode = () => ({ id: sid("barcode", 7202), product_id: productId, barcode: "0000123 ", sku_id: sid("sku", 7203),
  sku_code: "ORIGINAL SKU", color_id: sid("color", 7204), fit_id: sid("fit", 7205), size_id: sid("size", 7206), barcode_kind: "CONFIRMED_OLD", scheme_id: null, enabled: false });
test("product details pg: nine price keys preserve explicit NULL, zero and exact maximum in one target snapshot", async () => {
  const values = Object.fromEntries(CATALOGUE_PRICE_KEYS.map((key, i) => [key, i === 0 ? null : i === 1 ? "0.00" : "9999999999999999.99"]));
  const f = setup([begin(), { sql: /^SELECT p.id, p.version, /, rows: [{ id: productId, version: 4, ...values }], inspect(sql, params) {
    assert.deepEqual(params, [productId]); assert.match(sql, /WHERE p.id = \$1::uuid/);
    for (const key of CATALOGUE_PRICE_KEYS) assert.ok(sql.includes(`p.${key}::text AS ${key}`));
    assert.doesNotMatch(sql, /COALESCE|inventory|sku|default_barcode_scheme|deleted_at/);
  } }, commit()]);
  const result = await f.reader.readPrices(read("prices")); assert.deepEqual(result, { productId, version: 4, prices: values }); f.done();
});
test("product details pg: absent/invalid price keys reject rather than silently setting null or rounding", async () => {
  for (const invalid of [undefined, 0, "0.001", "-1.00", "10000000000000000.00"]) {
    const values: Record<string, unknown> = Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, null])); values.retail_price = invalid;
    const f = setup([begin(), { sql: /^SELECT p.id/, rows: [{ id: productId, version: 1, ...values }] }, rollback()]);
    await assert.rejects(f.reader.readPrices(read("prices")), { code: "INVALID_DATABASE_VALUE" }); f.done();
  }
});
test("product details pg: raw disabled historical barcode stays verbatim; paging is target-bound and product default stays unavailable", async () => {
  const f = setup([begin(), target(), { sql: /^SELECT count/, rows: [{ total: "1" }] }, {
    sql: /^SELECT b.id, b.barcode/, rows: [barcode()], inspect(sql, params) {
      assert.deepEqual(params, [productId, 20, 0]); assert.match(sql, /WHERE s.product_id = \$1::uuid/);
      assert.match(sql, /ORDER BY b.barcode COLLATE "C", b.id LIMIT \$2 OFFSET \$3/);
      assert.doesNotMatch(sql, /WHERE.*b.enabled|barcode_scheme|inventory|default_barcode_scheme|deleted_at/);
    }
  }, commit()]);
  const result = await f.reader.readBarcodes(read("barcodes")); assert.equal(result!.items[0]!.barcode, "0000123 ");
  assert.equal(result!.items[0]!.enabled, false); assert.equal(result!.items[0]!.schemeId, null);
  assert.deepEqual(result!.defaultScheme, { state: "UNAVAILABLE", reason: "NO_PRODUCT_SCHEME_FIELD" }); f.done();
});
test("product details pg: missing product ends before dependent reads; invalid grants never acquire a connection", async () => {
  const f = setup([begin(), { sql: /^SELECT p.id/, rows: [] }, commit()]); assert.equal(await f.reader.readBarcodes(read("barcodes")), null); f.done();
  const r = new PostgresProductDetailsQueryReader({ async connect() { throw Error("Must not connect"); } });
  await assert.rejects(r.readPrices({ ...read("prices"), grant: { kind: "barcodes", productId } }), { code: "FORBIDDEN" });
});
test("product details pg: wrong product, missing count, duplicate raw code and inconsistent pages fail closed", async () => {
  for (const rows of [[{ ...barcode(), product_id: sid("product", 999) }], [barcode(), { ...barcode(), id: sid("barcode", 7207) }], []]) {
    const total = rows.length === 2 ? "2" : "1";
    const f = setup([begin(), target(), { sql: /^SELECT count/, rows: [{ total }] }, { sql: /^SELECT b.id/, rows }, rollback()]);
    await assert.rejects(f.reader.readBarcodes(read("barcodes")), { code: "INVALID_DATABASE_VALUE" }); f.done();
  }
});
test("product details pg: unknown COMMIT discards once without rollback/retry", async () => {
  const failure = Error("SYNTHETIC UNKNOWN COMMIT"), f = setup([begin(), { sql: /^SELECT p.id/, rows: [] }, { sql: /^COMMIT$/, error: failure }]);
  await assert.rejects(f.reader.readPrices(read("prices")), failure); assert.equal(f.calls.length, 3);
  assert.deepEqual(f.releases, [failure]); f.done();
});
