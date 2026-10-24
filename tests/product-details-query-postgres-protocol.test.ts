/** Scripted pg protocol, not PostgreSQL-engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresProductDetailsQueryReader } from "../adapters/postgres/src/product-details-query-reader.ts";
import type { PgProductQueryClient } from "../adapters/postgres/src/product-query-reader.ts";
import type { ProductBarcodeRecordQuery, ProductBarcodeSkuQuery, ProductDetailsScopedRead } from "../packages/application/src/product-details-query-ports.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
import { CATALOGUE_PRICE_KEYS } from "../packages/application/src/catalogue-price-input.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const productId = sid("product", 7201), parameters = { productId, page: 1, pageSize: 20 as const };
function read(kind: "prices" | "barcodes") {
  const p = kind === "prices" ? { productId } : parameters;
  return { actor, parameters: p, intent: { kind, parameters: p }, grant: { kind, productId }, signal: new AbortController().signal } as ProductDetailsScopedRead<typeof parameters>;
}
interface Step { sql: RegExp; rows?: Record<string, unknown>[]; error?: Error; inspect?: (sql: string, values: unknown[]) => void }
function setup(steps: Step[], nativeVerify?: (client: PgProductQueryClient) => Promise<void>) {
  const calls: string[] = [], releases: (Error | boolean | undefined)[] = [];
  const client: PgProductQueryClient = {
    async query(sql, values = []) {
      calls.push(sql); const step = steps.shift(); assert.ok(step, sql); assert.match(sql, step.sql); step.inspect?.(sql, values);
      if (step.error) throw step.error; return { rows: step.rows ?? [], rowCount: step.rows?.length ?? 0 };
    }, release(error) { releases.push(error); }
  };
  const pool = { async connect() { return client; } };
  const retained = nativeVerify === undefined ? null : { profile: "catalogue-retained-delete-v22" as const, assertVerified(target: object) { assert.equal(target, pool); } };
  const runtime26: NativeRuntime26Capability | undefined = nativeVerify === undefined ? undefined : {
    profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) {
      assert.equal(target, client); assert.equal(purpose, "PRODUCT_SEASONS_READ"); assert.equal(calls.length, 1);
      await nativeVerify(client);
    }
  };
  return { reader: new PostgresProductDetailsQueryReader(pool, retained, runtime26), calls, releases,
    done() { assert.equal(steps.length, 0); assert.equal(releases.length, 1); } };
}
const begin = () => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ }), commit = () => ({ sql: /^COMMIT$/ }), rollback = () => ({ sql: /^ROLLBACK$/ });
const target = () => ({ sql: /^SELECT p.id, p.version FROM/, rows: [{ id: productId, version: 4 }] });
const barcode = () => ({ id: sid("barcode", 7202), product_id: productId, barcode: "0000123 ", sku_id: sid("sku", 7203),
  sku_code: "ORIGINAL SKU", color_id: sid("color", 7204), fit_id: sid("fit", 7205), size_id: sid("size", 7206), barcode_kind: "CONFIRMED_OLD", scheme_id: null, enabled: false });
const filteredSkuId = sid("sku", 7203);
function skuRead(page = 1): ProductDetailsScopedRead<ProductBarcodeRecordQuery> {
  const p = { ...parameters, skuId: filteredSkuId, page };
  return { ...read("barcodes"), parameters: p, intent: { kind: "barcodes", parameters: p } };
}
function skuTarget(): Step {
  return { sql: /^SELECT s.id, s.product_id FROM naijue_erp.sku/, rows: [{ id: filteredSkuId, product_id: productId }], inspect(sql, values) {
    assert.deepEqual(values, [filteredSkuId, productId]); assert.match(sql, /s.id = \$1::uuid AND s.product_id = \$2::uuid/); assert.doesNotMatch(sql, /enabled/);
  } };
}
function skuPageRead(page = 1): ProductDetailsScopedRead<ProductBarcodeSkuQuery> {
  const p: ProductBarcodeSkuQuery = { ...parameters, page, view: "SKU" };
  return { ...read("barcodes"), parameters: p, intent: { kind: "barcodes", parameters: p } };
}
const nativeSku = (id = filteredSkuId) => ({ id, product_id: productId, sku_code: "0001 ", enabled: true,
  color_id: sid("color", 7204), color_label: "原色", fit_id: sid("fit", 7205), fit_label: "原版", size_id: sid("size", 7206), size_label: "001" });
const summaryBinding = (row: ReturnType<typeof barcode>) => ({ id: row.id, barcode: row.barcode, kind: row.barcode_kind, schemeId: row.scheme_id, enabled: row.enabled });
test("SKU page: real zero-binding and disabled SKUs remain; bounded summaries match detailed native bindings", async () => {
  const disabledSku = sid("sku", 7220);
  const bindings = [
    { ...barcode(), id: sid("barcode", 7221), barcode: "0000 MAIN ", barcode_kind: "MAIN", enabled: true },
    { ...barcode(), id: sid("barcode", 7222), barcode: "0001 DISABLED MAIN", barcode_kind: "MAIN", enabled: false },
    { ...barcode(), id: sid("barcode", 7223), barcode: "0002 OLD ", enabled: false },
    { ...barcode(), id: sid("barcode", 7224), barcode: "0003 OLD", enabled: true }
  ];
  const f = setup([begin(), target(), { sql: /^SELECT count.*FROM naijue_erp.sku s/, rows: [{ total: "2" }] },
    { sql: /^SELECT s.id, s.product_id, s.sku_code/, rows: [nativeSku(), { ...nativeSku(disabledSku), sku_code: "0002", enabled: false, color_label: null }], inspect(sql, values) {
      assert.deepEqual(values, [productId, 20, 0]); assert.match(sql, /LEFT JOIN naijue_erp.color/); assert.doesNotMatch(sql, /sku_barcode|WHERE[^]*enabled/);
      assert.match(sql, /ORDER BY s.sku_code COLLATE "C" NULLS LAST, s.id LIMIT \$2 OFFSET \$3/);
    } }, { sql: /^WITH ranked AS/, rows: [{ sku_id: filteredSkuId, binding_count: "4", enabled_main_count: "1", disabled_main_count: "1", confirmed_old_count: "2", enabled_main: summaryBinding(bindings[0]!), first_confirmed_old: summaryBinding(bindings[2]!) }], inspect(sql, values) {
      assert.deepEqual(values, [[filteredSkuId, disabledSku]]); assert.match(sql, /WHERE b.sku_id=ANY\(\$1::uuid\[\]\)/);
      assert.match(sql, /row_number\(\) OVER/); assert.match(sql, /state_order=1/); assert.match(sql, /kind_order=1/);
    } }, commit()]);
  const result = await f.reader.readBarcodes(skuPageRead());
  assert.equal(result!.kind, "SKU_PAGE"); assert.equal(result!.totalSkus, 2); assert.equal(Object.hasOwn(result!, "total"), false);
  assert.equal(result!.items[0]!.skuCode, "0001 "); assert.equal(result!.items[0]!.bindingCount, 4);
  assert.deepEqual(result!.items[0]!.main, summaryBinding(bindings[0]!)); assert.equal(result!.items[0]!.disabledMainCount, 1);
  assert.equal(result!.items[0]!.confirmedOldCount, 2); assert.deepEqual(result!.items[0]!.firstConfirmedOld, summaryBinding(bindings[2]!));
  assert.equal(result!.items[1]!.skuEnabled, false); assert.equal(result!.items[1]!.colorLabel, null);
  assert.equal(result!.items[1]!.bindingCount, 0); assert.equal(result!.items[1]!.main, null); assert.equal(result!.items[1]!.firstConfirmedOld, null); f.done();
  const detail = setup([begin(), target(), skuTarget(), { sql: /^SELECT count/, rows: [{ total: "4" }] }, { sql: /^SELECT b.id/, rows: bindings }, commit()]);
  const codes = await detail.reader.readBarcodes(skuRead());
  assert.equal(codes!.total, result!.items[0]!.bindingCount);
  assert.deepEqual(codes!.items.filter(item => item.kind === "MAIN" && item.enabled).map(item => ({ id: item.id, barcode: item.barcode, kind: item.kind, schemeId: item.schemeId, enabled: item.enabled })), [result!.items[0]!.main]);
  assert.equal(codes!.items.filter(item => item.kind === "CONFIRMED_OLD").length, result!.items[0]!.confirmedOldCount); detail.done();
});
test("SKU page: exact SKU count and one bound current-page summary do not truncate at 200", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...nativeSku(sid("sku", 7230 + i)), sku_code: `00${i}` }));
  const f = setup([begin(), { sql: /^SELECT p.id, p.version, p.default_barcode_scheme_id/, rows: [{ id: productId, version: 4, default_barcode_scheme_id: null }] },
    { sql: /^SELECT count.*FROM naijue_erp.sku s/, rows: [{ total: "205" }], inspect(sql, values) { assert.deepEqual(values, [productId]); assert.doesNotMatch(sql, /enabled|sku_barcode/); } },
    { sql: /^SELECT s.id, s.product_id, s.sku_code/, rows, inspect(_sql, values) { assert.deepEqual(values, [productId, 20, 200]); } },
    { sql: /^WITH ranked AS/, rows: [], inspect(_sql, values) { assert.deepEqual(values, [rows.map(row => row.id)]); } }, commit()], async () => {});
  const result = await f.reader.readBarcodes(skuPageRead(11));
  assert.equal(result!.totalSkus, 205); assert.equal(result!.items.length, 5); assert.deepEqual(result!.defaultScheme, { state: "NOT_SET" });
  assert.ok(result!.items.every(row => row.bindingCount === 0)); assert.equal(f.calls.length, 6); f.done();
});
test("SKU page: missing product is null; zero real SKUs and empty later pages never query binding summaries", async () => {
  const f = setup([begin(), { sql: /^SELECT p.id/, rows: [] }, commit()]);
  assert.equal(await f.reader.readBarcodes(skuPageRead()), null); f.done();
  for (const [total, page] of [["0", 1], ["2", 2]] as const) {
    const g = setup([begin(), target(), { sql: /^SELECT count.*FROM naijue_erp.sku s/, rows: [{ total }] }, { sql: /^SELECT s.id, s.product_id, s.sku_code/, rows: [] }, commit()]);
    const result = await g.reader.readBarcodes(skuPageRead(page)); assert.equal(result!.totalSkus, Number(total)); assert.deepEqual(result!.items, []);
    assert.ok(g.calls.every(sql => !/sku_barcode/.test(sql))); g.done();
  }
});
test("SKU page: multiple enabled MAINs, inconsistent aggregates and foreign targets are integrity errors", async () => {
  const base = { sku_id: filteredSkuId, binding_count: "2", enabled_main_count: "2", disabled_main_count: "0", confirmed_old_count: "0", enabled_main: summaryBinding({ ...barcode(), barcode_kind: "MAIN", enabled: true }), first_confirmed_old: null };
  for (const aggregate of [base, { ...base, binding_count: "1", enabled_main_count: "0", enabled_main: null }, { ...base, sku_id: sid("sku", 999) }]) {
    const f = setup([begin(), target(), { sql: /^SELECT count/, rows: [{ total: "1" }] }, { sql: /^SELECT s.id, s.product_id, s.sku_code/, rows: [nativeSku()] }, { sql: /^WITH ranked AS/, rows: [aggregate] }, rollback()]);
    await assert.rejects(f.reader.readBarcodes(skuPageRead()), { code: "INVALID_DATABASE_VALUE" }); f.done();
  }
  const g = setup([begin(), target(), { sql: /^SELECT count/, rows: [{ total: "1" }] }, { sql: /^SELECT s.id, s.product_id, s.sku_code/, rows: [{ ...nativeSku(), product_id: sid("product", 999) }] }, rollback()]);
  await assert.rejects(g.reader.readBarcodes(skuPageRead()), { code: "INVALID_DATABASE_VALUE" }); g.done();
});
test("SKU barcode scope: count and bounded pages retain active/inactive bindings beyond record 200", async () => {
  for (const page of [1, 11]) {
    const rows = Array.from({ length: page === 1 ? 20 : 5 }, (_, i) => ({ ...barcode(), id: sid("barcode", 8000 + i),
      barcode: `00000${page}-${i} `, barcode_kind: i % 2 === 0 ? "MAIN" : "CONFIRMED_OLD", enabled: i % 2 === 0 }));
    const f = setup([begin(), target(), skuTarget(), { sql: /^SELECT count/, rows: [{ total: "205" }], inspect(sql, values) {
      assert.deepEqual(values, [productId, filteredSkuId]); assert.match(sql, /s.product_id = \$1::uuid AND s.id = \$2::uuid/); assert.doesNotMatch(sql, /enabled/);
    } }, { sql: /^SELECT b.id/, rows, inspect(sql, values) {
      assert.deepEqual(values, [productId, 20, (page - 1) * 20, filteredSkuId]);
      assert.match(sql, /s.product_id = \$1::uuid AND s.id = \$4::uuid/); assert.match(sql, /ORDER BY b.barcode COLLATE "C", b.id LIMIT \$2 OFFSET \$3/); assert.doesNotMatch(sql, /WHERE[^]*enabled/);
    } }, commit()]);
    const result = await f.reader.readBarcodes(skuRead(page));
    assert.equal(result!.skuId, filteredSkuId); assert.equal(result!.total, 205); assert.equal(result!.page, page);
    assert.deepEqual(result!.items.map(item => [item.barcode, item.kind, item.enabled]), rows.map(row => [row.barcode, row.barcode_kind, row.enabled])); f.done();
  }
});
test("SKU barcode scope: missing or foreign SKU is null, whereas an existing SKU without bindings is zero", async () => {
  const f = setup([begin(), target(), { ...skuTarget(), rows: [] }, commit()]);
  assert.equal(await f.reader.readBarcodes(skuRead()), null); assert.equal(f.calls.length, 4); f.done();
  const g = setup([begin(), { sql: /^SELECT p.id, p.version, p.default_barcode_scheme_id/, rows: [{ id: productId, version: 4, default_barcode_scheme_id: null }] },
    skuTarget(), { sql: /^SELECT count/, rows: [{ total: "0" }] }, { sql: /^SELECT b.id/, rows: [] }, commit()], async () => {});
  const zero = await g.reader.readBarcodes(skuRead());
  assert.equal(zero!.skuId, filteredSkuId); assert.equal(zero!.total, 0); assert.deepEqual(zero!.items, []); assert.deepEqual(zero!.defaultScheme, { state: "NOT_SET" }); g.done();
});
test("SKU barcode scope: incorrect membership or a foreign returned binding is rejected", async () => {
  const f = setup([begin(), target(), { ...skuTarget(), rows: [{ id: filteredSkuId, product_id: sid("product", 999) }] }, rollback()]);
  await assert.rejects(f.reader.readBarcodes(skuRead()), { code: "INVALID_DATABASE_VALUE" }); f.done();
  const g = setup([begin(), target(), skuTarget(), { sql: /^SELECT count/, rows: [{ total: "1" }] },
    { sql: /^SELECT b.id/, rows: [{ ...barcode(), sku_id: sid("sku", 999) }] }, rollback()]);
  await assert.rejects(g.reader.readBarcodes(skuRead()), { code: "INVALID_DATABASE_VALUE" }); g.done();
});
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
test("native default scheme: actual product FK is independent of barcode bindings and an empty later page", async () => {
  const schemeId = sid("product", 7210), oldSchemeId = sid("product", 7211);
  for (const page of [1, 2]) {
    let verified = 0;
    const f = setup([begin(), { sql: /^SELECT p.id, p.version, p.default_barcode_scheme_id/, rows: [{ id: productId, version: 4, default_barcode_scheme_id: schemeId }], inspect(sql, values) {
      assert.match(sql, /p.deleted_at IS NULL/); assert.doesNotMatch(sql, /naijue_erp\.(?:barcode_scheme|sku_barcode)/); assert.deepEqual(values, [productId]);
    } }, { sql: /^SELECT count/, rows: [{ total: "1" }], inspect(sql, values) {
      assert.match(sql, /WHERE s.product_id = \$1::uuid/); assert.deepEqual(values, [productId]);
    } }, { sql: /^SELECT b.id/, rows: page === 1 ? [{ ...barcode(), scheme_id: oldSchemeId }] : [], inspect(sql, values) {
      assert.match(sql, /WHERE s.product_id = \$1::uuid/); assert.deepEqual(values, [productId, 20, (page - 1) * 20]);
    } }, commit()], async () => { verified++; });
    const scope = read("barcodes"), p = { ...parameters, page };
    const result = await f.reader.readBarcodes({ ...scope, parameters: p, intent: { kind: "barcodes", parameters: p } });
    assert.equal(verified, 1); assert.equal(result!.total, 1); assert.equal(result!.items.length, page === 1 ? 1 : 0);
    assert.deepEqual(result!.defaultScheme, { state: "AVAILABLE", schemeId });
    if (page === 1) assert.equal(result!.items[0]!.schemeId, oldSchemeId);
    f.done();
  }
});
test("native default scheme: only actual NULL is NOT_SET; missing or malformed storage is an error", async () => {
  for (const value of [null, undefined, "invalid scheme identity"]) {
    const successful = value === null;
    const f = setup([begin(), { sql: /^SELECT p.id, p.version, p.default_barcode_scheme_id/, rows: [{ id: productId, version: 4, default_barcode_scheme_id: value }] },
      ...(successful ? [{ sql: /^SELECT count/, rows: [{ total: "0" }] }, { sql: /^SELECT b.id/, rows: [] }, commit()] : [rollback()])], async () => {});
    if (successful) assert.deepEqual((await f.reader.readBarcodes(read("barcodes")))!.defaultScheme, { state: "NOT_SET" });
    else await assert.rejects(f.reader.readBarcodes(read("barcodes")), error => error instanceof Error && "code" in error && ["INVALID_DATABASE_VALUE", "INVALID_ID"].includes(String(error.code)));
    f.done();
  }
});
test("native default scheme: capability denial, storage failure and original grant denial never become NOT_SET", async () => {
  const denied = Error("SYNTHETIC runtime denial"), unavailable = Error("SYNTHETIC missing native column");
  const f = setup([begin(), rollback()], async () => { throw denied; });
  await assert.rejects(f.reader.readBarcodes(read("barcodes")), denied); assert.equal(f.calls.length, 2); f.done();
  const g = setup([begin(), { sql: /^SELECT p.id, p.version, p.default_barcode_scheme_id/, error: unavailable }, rollback()], async () => {});
  await assert.rejects(g.reader.readBarcodes(read("barcodes")), unavailable); g.done();
  let verified = 0;
  const h = setup([], async () => { verified++; });
  await assert.rejects(h.reader.readBarcodes({ ...read("barcodes"), grant: { kind: "prices", productId } }), { code: "FORBIDDEN" });
  assert.equal(verified, 0); assert.deepEqual(h.calls, []); assert.deepEqual(h.releases, []);
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
