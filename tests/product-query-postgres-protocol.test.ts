/** SYNTHETIC scripted pg protocol only. No PostgreSQL parser, database, server, credentials or files. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresProductQueryReader, PRODUCT_READ_MAX_GROUP_MEMBERS, PRODUCT_READ_MAX_IMAGES, PRODUCT_READ_MAX_SKUS } from "../adapters/postgres/src/product-query-reader.ts";
import type { PgProductQueryClient, PgProductQueryResult } from "../adapters/postgres/src/product-query-reader.ts";
import type { ProductQuery, ProductScopedRead } from "../packages/application/src/product-query-ports.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";

interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgProductQueryClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgProductQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected synthetic protocol call: ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const productId = sid("product", 701), groupId = sid("sizeGroup", 702), colorId = sid("color", 703), fitId = sid("fit", 704), fit2 = sid("fit", 705), size1 = sid("size", 706), size2 = sid("size", 707), imageId = sid("product", 708);
const parameters = { productId }; const imageParameters = { productId, imageId };
const read = <P extends ProductQuery>(parameters: P, signal = new AbortController().signal): ProductScopedRead<P> => ({ actor, grant: { productId }, parameters, signal });
const reader = (client: Client) => new PostgresProductQueryReader({ async connect() { return client; } });
const basic = () => ({ id: productId, product_code: "SYNTHETIC ORIGINAL CODE", name: "SYNTHETIC PRODUCT", year: null, system_item_code: null, retail_price: null, category_name: "完整分类名称", season_name: null, supplier_name: null });
const group = () => ({ id: productId, size_group_id: groupId, size_group_name: "完整尺码组名称" });
const member = (id = size1, order = 20) => ({ id, name: id === size1 ? "165/S（完整标签）" : "无尺码（完整标签）", display_order: order });
const sku = (fit = fitId, index = 1) => ({ id: sid("sku", 800 + index), product_id: productId, color_id: colorId, color_name: "完整颜色名称", fit_id: fit, fit_name: fit === fitId ? "Y版（修身）" : "A版（标准）", size_id: size1, member_size_id: size1 });
const image = () => ({ id: imageId, product_id: productId, file_ref: "SYNTHETIC/private-object", mime: "image/webp", byte_size: "8388608", display_order: 10 });
const target = (values: unknown[], sql: string) => { assert.equal(values[0], productId); assert.match(sql, /WHERE p.id = \$1::uuid/); assert.ok(!sql.includes(productId)); };
test("W15 current media reader requires actual-pool retained-delete proof and filters deleted product before returning membership", async () => {
  let connects = 0;
  const legacy = new PostgresProductQueryReader({ async connect() { connects++; throw Error("NO_LEGACY_DELIVERY_SQL"); } });
  await assert.rejects(legacy.readCurrentImage(read(imageParameters)), { code: "PRODUCT_MEDIA_NOT_READY" }); assert.equal(connects, 0);
  for (const rows of [[image()], []]) {
    const client = new Client([begin(), { sql: /^SELECT i.id/, rows, inspect(values, sql) { assert.deepEqual(values, [productId, imageId]); assert.match(sql, /AND p.deleted_at IS NULL/); } }, commit()]);
    const pool = { async connect() { return client; } };
    const current = new PostgresProductQueryReader(pool, { profile: "catalogue-retained-delete-v22", assertVerified(target) { assert.equal(target, pool); } });
    const result = await current.readCurrentImage(read(imageParameters)); assert.equal(result?.id ?? null, rows.length ? imageId : null); client.done();
  }
});
test("product pg protocol: constructor does not connect; invalid/aborted/mismatched grant never connects", async () => {
  assert.throws(() => new PostgresProductQueryReader(undefined as never), /explicit PostgreSQL pool/);
  let calls = 0; const r = new PostgresProductQueryReader({ async connect() { calls++; throw new Error("Must not connect"); } });
  assert.equal(calls, 0); await assert.rejects(() => r.readBasics({ ...read(parameters), grant: { productId: sid("product", 999) } }), { code: "FORBIDDEN" });
  await assert.rejects(() => r.readBasics(read({ productId: "fake" } as never)), { code: "INVALID_PRODUCT_QUERY" });
  const c = new AbortController(); c.abort(); await assert.rejects(() => r.readImages(read(parameters, c.signal)), { code: "PRODUCT_READ_ABORTED" }); assert.equal(calls, 0);
});
test("product pg protocol: basics parameterized target-only RR snapshot preserves actual nulls and original code", async () => {
  const client = new Client([begin(), { sql: /^SELECT p.id, p.product_code/, rows: [basic()], inspect: target }, commit()]);
  assert.deepEqual(await reader(client).readBasics(read(parameters)), { productId, code: "SYNTHETIC ORIGINAL CODE", name: "SYNTHETIC PRODUCT", categoryLabel: "完整分类名称", yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: null });
  assert.equal(client.calls.length, 3); assert.ok(client.calls.every(call => !/INSERT|UPDATE|DELETE|FOR UPDATE/.test(call.sql))); client.done();
  const present = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), year: 2021, system_item_code: "EXISTING SYSTEM CODE", season_name: "真实季节名称", supplier_name: "真实供应商名称" }] }, commit()]);
  const result = await reader(present).readBasics(read(parameters)); assert.equal(result!.yearLabel, "2021"); assert.equal(result!.systemCode, "EXISTING SYSTEM CODE"); present.done();
});
test("product pg protocol: missing product commits null without dependent queries", async () => {
  for (const method of ["readBasics", "readSpecifications", "readImages"] as const) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [], inspect: target }, commit()]); assert.equal(await reader(client)[method](read(parameters)), null); assert.equal(client.calls.length, 3); client.done();
  }
});
test("product pg protocol: three bounded specification set reads preserve group member identity/order/full labels and actual four-dimensional SKU combinations", async () => {
  const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()], inspect: target },
    { sql: /^SELECT s.id, s.name/, rows: [member(size2, 2), member(size1, 20)], inspect(values, sql) { assert.deepEqual(values, [groupId, PRODUCT_READ_MAX_GROUP_MEMBERS + 1]); assert.match(sql, /WHERE m.size_group_id = \$1::uuid\s+ORDER BY m.display_order, s.id LIMIT \$2/); assert.ok(!/s.code/.test(sql)); } },
    { sql: /^SELECT s.id, s.product_id/, rows: [sku(), sku(fit2, 2)], inspect(values, sql) { assert.deepEqual(values, [productId, groupId, PRODUCT_READ_MAX_SKUS + 1]); assert.match(sql, /WHERE s.product_id = \$1::uuid/); assert.match(sql, /LEFT JOIN naijue_erp.size_group_member/); assert.ok(!/CROSS JOIN|generate_series/.test(sql)); } }, commit()]);
  const result = await reader(client).readSpecifications(read(parameters)); assert.equal(result!.sizeGroup!.label, "完整尺码组名称");
  assert.deepEqual(result!.sizes, [{ id: size2, label: "无尺码（完整标签）" }, { id: size1, label: "165/S（完整标签）" }]);
  assert.deepEqual(result!.fits.map(fit => fit.label), ["Y版（修身）", "A版（标准）"]); assert.equal(result!.colors[0]!.label, "完整颜色名称");
  assert.equal(result!.skus.length, 2); assert.equal(result!.skus[0]!.sizeId, result!.skus[1]!.sizeId); assert.notEqual(result!.skus[0]!.fitId, result!.skus[1]!.fitId);
  assert.equal(client.calls.length, 5); client.done();
});
test("product pg protocol: empty SKU set does not invent a matrix cross-product and keeps actual group sizes", async () => {
  const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()] }, { sql: /^SELECT s.id, s.name/, rows: [member()] }, { sql: /^SELECT s.id, s.product_id/, rows: [] }, commit()]);
  const result = await reader(client).readSpecifications(read(parameters)); assert.equal(result!.sizes.length, 1); assert.deepEqual(result!.skus, []); assert.deepEqual(result!.colors, []); client.done();
});
test("product pg protocol: outside-group and duplicate SKU identities/coordinates fail instead of silently dropping or merging", async () => {
  for (const rows of [[{ ...sku(), member_size_id: null }], [sku(), sku()], [sku(), { ...sku(), id: sid("sku", 990) }]]) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()] }, { sql: /^SELECT s.id, s.name/, rows: [member()] }, { sql: /^SELECT s.id, s.product_id/, rows }, rollback()]);
    await assert.rejects(() => reader(client).readSpecifications(read(parameters)), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("product pg protocol: metadata list is two bounded set reads, preserves order, never reads bytes or returns delivery URLs", async () => {
  const client = new Client([begin(), { sql: /^SELECT p.id, p.name/, rows: [{ id: productId, name: "SYNTHETIC PRODUCT" }], inspect: target },
    { sql: /^SELECT i.id/, rows: [image()], inspect(values, sql) { assert.deepEqual(values, [productId, PRODUCT_READ_MAX_IMAGES + 1]); assert.match(sql, /WHERE i.product_id = \$1::uuid\s+ORDER BY i.display_order, i.id LIMIT \$2/); assert.ok(!/bytea|pg_read|lo_get|url|thumbnail/i.test(sql)); } }, commit()]);
  const result = await reader(client).readImages(read(parameters)); assert.equal(result!.images[0]!.byteSize, 8388608n); assert.equal(result!.images[0]!.fileRef, "SYNTHETIC/private-object"); assert.equal(client.calls.length, 4); client.done();
});
test("product pg protocol: explicit image query scopes BOTH product and image IDs; missing/mismatched image is never another product's image", async () => {
  for (const rows of [[image()], []]) {
    const client = new Client([begin(), { sql: /^SELECT i.id/, rows, inspect(values, sql) { assert.deepEqual(values, [productId, imageId]); assert.match(sql, /WHERE p.id = \$1::uuid AND i.id = \$2::uuid/); } }, commit()]);
    const result = await reader(client).readImage(read(imageParameters)); assert.equal(result?.id ?? null, rows.length ? imageId : null); assert.equal(client.calls.length, 3); client.done();
  }
  const client = new Client([begin(), { sql: /^SELECT i.id/, rows: [{ ...image(), product_id: sid("product", 999) }] }, rollback()]);
  await assert.rejects(() => reader(client).readImage(read(imageParameters)), { code: "INVALID_DATABASE_VALUE" }); client.done();
});
test("product pg protocol: technical response bounds fail closed, never silently truncate metadata, group members or SKUs", async () => {
  const imageOverflow = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ id: productId, name: "SYNTHETIC" }] }, { sql: /^SELECT i.id/, rows: Array.from({ length: PRODUCT_READ_MAX_IMAGES + 1 }, image) }, rollback()]);
  await assert.rejects(() => reader(imageOverflow).readImages(read(parameters)), { code: "PRODUCT_READ_TOO_LARGE" }); imageOverflow.done();
  const sizes = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()] }, { sql: /^SELECT s.id, s.name/, rows: Array.from({ length: PRODUCT_READ_MAX_GROUP_MEMBERS + 1 }, () => member()) }, rollback()]);
  await assert.rejects(() => reader(sizes).readSpecifications(read(parameters)), { code: "PRODUCT_READ_TOO_LARGE" }); sizes.done();
  const skus = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()] }, { sql: /^SELECT s.id, s.name/, rows: [member()] }, { sql: /^SELECT s.id, s.product_id/, rows: Array.from({ length: PRODUCT_READ_MAX_SKUS + 1 }, () => sku()) }, rollback()]);
  await assert.rejects(() => reader(skus).readSpecifications(read(parameters)), { code: "PRODUCT_READ_TOO_LARGE" }); skus.done();
});
test("product pg protocol: invalid stored image type/size and missing labels roll back without delivery fallback", async () => {
  for (const change of [{ mime: "image/svg+xml" }, { byte_size: "8388609" }, { byte_size: "0" }, { file_ref: "" }]) {
    const client = new Client([begin(), { sql: /^SELECT i.id/, rows: [{ ...image(), ...change }] }, rollback()]); await assert.rejects(() => reader(client).readImage(read(imageParameters)), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
  const corruptId = new Client([begin(), { sql: /^SELECT i.id/, rows: [{ ...image(), id: "corrupt" }] }, rollback()]);
  await assert.rejects(() => reader(corruptId).readImage(read(imageParameters)), { code: "INVALID_ID" }); corruptId.done();
  const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), name: "" }] }, rollback()]); await assert.rejects(() => reader(client).readBasics(read(parameters)), { code: "INVALID_DATABASE_VALUE" }); client.done();
});
test("product pg protocol: begin/connect/query/commit/rollback failures clean up exactly once, discard uncertain clients, no hidden retry", async () => {
  const failure = new Error("SYNTHETIC SQL failure"); const rollbackFailure = new Error("SYNTHETIC rollback failure");
  const beginFailure = new Client([{ sql: /^BEGIN/, error: failure }]); await assert.rejects(() => reader(beginFailure).readBasics(read(parameters)), error => error === failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const failed = new Client([begin(), { sql: /^SELECT p.id/, error: failure }, rollback()]); await assert.rejects(() => reader(failed).readBasics(read(parameters)), error => error === failure); assert.equal(failed.releases[0], undefined); failed.done();
  const uncertain = new Client([begin(), { sql: /^SELECT p.id/, rows: [] }, { sql: /^COMMIT$/, error: failure }, rollback()]); await assert.rejects(() => reader(uncertain).readBasics(read(parameters)), error => error === failure); assert.equal(uncertain.releases[0], failure); uncertain.done();
  const broken = new Client([begin(), { sql: /^SELECT p.id/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]); await assert.rejects(() => reader(broken).readBasics(read(parameters)), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure); assert.equal(broken.releases[0], rollbackFailure); broken.done();
  let connects = 0; await assert.rejects(() => new PostgresProductQueryReader({ async connect() { connects++; throw failure; } }).readBasics(read(parameters)), error => error === failure); assert.equal(connects, 1);
});
test("product pg protocol: abort during SQL rolls back and stops subsequent reads; abort after connect discards client", async () => {
  const controller = new AbortController(); const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [group()], inspect() { controller.abort(); } }, rollback()]);
  await assert.rejects(() => reader(client).readSpecifications(read(parameters, controller.signal)), { code: "PRODUCT_READ_ABORTED" }); client.done();
  const early = new AbortController(); const idle = new Client([]); const r = new PostgresProductQueryReader({ async connect() { early.abort(); return idle; } });
  await assert.rejects(() => r.readBasics(read(parameters, early.signal)), { code: "PRODUCT_READ_ABORTED" }); assert.ok(idle.releases[0] instanceof Error); idle.done();
});

test("product pg protocol: native retail price stays an exact nullable decimal in the existing target-only basics query", async () => {
  for (const retailPrice of [null, "0.00", "18.20", "9007199254740993.01", "9999999999999999.99"]) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), retail_price: retailPrice }], inspect(values, sql) {
      target(values, sql); assert.match(sql, /p.retail_price::text/); assert.ok(!/reference_price|sku|sum\(|min\(|max\(/i.test(sql));
    } }, commit()]);
    const result = await reader(client).readBasics(read(parameters)); assert.equal(result!.retailPrice, retailPrice);
    assert.equal(client.calls.length, 3); client.done();
  }
  for (const retailPrice of [undefined, 0, "0", "0.0", "-0.00", "-1.00", "1.234", "1e2", "01.00", "10000000000000000.00", "NaN", "Infinity"]) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), retail_price: retailPrice }] }, rollback()]);
    await assert.rejects(() => reader(client).readBasics(read(parameters)), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});

test("season v2 basics: verified pool selects stable aggregate label; exact19 remains scalar; missing-column error is not hidden", async () => {
  for (const selected of [false, true]) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), season_name: "春、夏" }], inspect(_values, sql) {
      if (selected) { assert.match(sql, /string_agg\(d.name,'、' ORDER BY d.display_order,d.id\)/); assert.match(sql, /d.id=ANY\(p.season_ids\)/); assert.doesNotMatch(sql, /p.season_id/); }
      else { assert.doesNotMatch(sql, /season_ids/); assert.match(sql, /se.id = p.season_id/); }
    } }, commit()]);
    const pool = { async connect() { return client; } }, r = new PostgresProductQueryReader(pool, null, selected ? { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); } } : null);
    assert.equal((await r.readBasics(read(parameters)))!.seasonLabel, "春、夏"); client.done();
  }
  const failure = Object.assign(Error("synthetic missing season_ids"), { code: "42703" });
  const client = new Client([begin(), { sql: /season_ids/, error: failure }, rollback()]), pool = { async connect() { return client; } };
  const r = new PostgresProductQueryReader(pool, null, { profile: "product-season-array-v1", assertVerified(target) { assert.equal(target, pool); } });
  await assert.rejects(r.readBasics(read(parameters)), failure); client.done(); assert.equal(client.calls.length, 3);
});
test("season v2 capability: static flags, getters, async/thenable proofs and wrong targets cannot enable array SQL", () => {
  const pool = { async connect(): Promise<PgProductQueryClient> { throw Error("No connection"); } };
  let invoked = false;
  const invalid = [true, 25, {}, { profile: "product-season-array-v1", get assertVerified() { invoked = true; return () => {}; } },
    { profile: "product-season-array-v1", async assertVerified() { invoked = true; } },
    { profile: "product-season-array-v1", assertVerified() { return Promise.resolve(); } },
    { profile: "product-season-array-v1", assertVerified() { throw Error("Different target"); } }];
  for (const proof of invalid) assert.throws(() => new PostgresProductQueryReader(pool, null, proof as never)); assert.equal(invoked, false);
});

test("approved product read projection: verified existing basics query returns actual thickness/collar and preserves nulls", async () => {
  for (const [thickness, collarPantsType] of [["厚款", "翻领"], [null, null]] as const) {
    const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ ...basic(), thickness, collar_pants_type: collarPantsType }], inspect(values, sql) {
      target(values, sql); assert.match(sql, /p.thickness, p.collar_pants_type/); assert.match(sql, /AND p.deleted_at IS NULL/);
    } }, commit()]);
    const pool = { async connect() { return client; } }, current = new PostgresProductQueryReader(pool,
      { profile: "catalogue-retained-delete-v22", assertVerified(value) { assert.equal(value, pool); } });
    const result = await current.readBasics(read(parameters));
    assert.equal(result!.thickness, thickness); assert.equal(result!.collarPantsType, collarPantsType);
    assert.equal(client.calls.length, 3); client.done();
  }
});
test("approved product read projection: image classification comes from native role/color in the same bounded list query", async () => {
  const client = new Client([begin(), { sql: /^SELECT p.id/, rows: [{ id: productId, name: "SYNTHETIC PRODUCT" }] },
    { sql: /^SELECT i.id/, rows: [{ ...image(), image_role: "COLOR", color_id: colorId },
      { ...image(), id: sid("product", 709), image_role: null, color_id: null }], inspect(values, sql) {
      assert.deepEqual(values, [productId, PRODUCT_READ_MAX_IMAGES + 1]); assert.match(sql, /i.image_role, i.color_id/);
      assert.doesNotMatch(sql, /bytea|pg_read|lo_get/i);
    } }, commit()]);
  const pool = { async connect() { return client; } }, current = new PostgresProductQueryReader(pool,
    { profile: "catalogue-retained-delete-v22", assertVerified(value) { assert.equal(value, pool); } });
  const result = await current.readImages(read(parameters));
  assert.deepEqual(result!.images.map(i => i.classification), [{ role: "COLOR", colorId }, { role: null, colorId: null }]);
  assert.equal(client.calls.length, 4); client.done();
});
