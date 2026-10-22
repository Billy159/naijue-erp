/** Exact barcode SQL/HTTP protocol only: no PostgreSQL, browser or actual source data. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { PostgresCurrentFormReader } from "../adapters/postgres/src/current-form-reader.ts";
import { createCurrentFormHttpPlugin } from "../apps/api/src/current-form-http.ts";
import { parseCurrentFormBarcodeQuery } from "../packages/application/src/current-form-validation.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../packages/application/src/source-confirmed-current-form-authorization.ts";
import { entityId } from "../packages/domain/src/values.ts";
import type { CurrentFormBarcodeQuery } from "../packages/application/src/current-form-ports.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = { accountId: entityId("account", id(1)), hallId: entityId("hall", id(2)) };
const salesContext = { kind: "SALES" as const, hallId: actor.hallId, warehouseId: entityId("warehouse", id(3)) };
const input = (barcode = "000123"): CurrentFormBarcodeQuery => ({ context: salesContext, barcode });
const signal = () => new AbortController().signal;
function nativeBarcode(barcode = "000123", kind = "MAIN"): Record<string, unknown> {
  return { binding_id: id(4), barcode, barcode_kind: kind, binding_enabled: true, id: id(5), sku_code: "EXACT-SKU",
    product_id: id(6), product_code: "EXACT-PRODUCT", product_name: "SYNTHETIC", color_id: id(7), color_name: "C",
    fit_id: id(8), fit_name: "F", size_id: id(9), size_name: "S", size_group_id: id(10), member_size_id: id(9),
    sku_enabled: true, product_enabled: true, color_enabled: true, fit_enabled: true, references_retained: true, source_published: true };
}
interface Options { rows?: Record<string, unknown>[]; identity?: Record<string, unknown>; foreignWarehouse?: boolean;
  disabledFrom?: boolean; disabledTo?: boolean; nonzero?: boolean; versions?: number[] }
function protocol(options: Options = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0;
  const pool = { async connect() { connects++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (/^(?:BEGIN|COMMIT|ROLLBACK)/.test(sql)) { /* one borrowed readonly snapshot */ }
    else if (sql.includes("current-form:identity")) rows = [{ account_id: actor.accountId, staff_id: id(11), login_enabled: true,
      role: "SALESPERSON", employment_status: "在职", hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true, ...options.identity }];
    else if (sql.includes("current-form:barcode-schema")) rows = [{ versions: options.versions ?? Array.from({ length: 19 }, (_, i) => i + 1) }];
    else if (sql.includes("current-form:sales-hall")) rows = [{ id: values[0], enabled: true }];
    else if (sql.includes("current-form:barcode-warehouses")) rows = (values[0] as string[]).map((w, i) => ({ id: w,
      hall_id: options.foreignWarehouse || i > 0 ? id(12) : actor.hallId, native_hall_id: options.foreignWarehouse || i > 0 ? id(12) : actor.hallId,
      enabled: i === 0 ? !options.disabledFrom : !options.disabledTo, has_nonzero_inventory: options.nonzero === true }));
    else if (sql.includes("current-form:barcode */")) {
      assert.match(sql, /b\.barcode_kind/); assert.match(sql, /b\.barcode COLLATE "C"=\$1::text COLLATE "C" LIMIT 2/);
      assert.match(sql, /ib\.status<>'IMPORTED'/); rows = options.rows ?? [nativeBarcode(values[0] as string)];
    } else throw Error("Unexpected SQL: " + sql);
    return { rows, rowCount: rows.length };
  }, release(error?: unknown) { released.push(error); } }; } };
  return { reader: new PostgresCurrentFormReader(pool, createSourceConfirmedCurrentFormAuthorization()), calls, released, connects: () => connects };
}
test("barcode input preserves exact text and rejects actor injection, numeric/control/long codes and invalid endpoint context", () => {
  assert.equal(parseCurrentFormBarcodeQuery(input(" 000123 ")).barcode, " 000123 ");
  for (const value of [{ ...input(), barcode: 123 }, input(""), input("a\n"), input("a".repeat(513)), { ...input(), actor },
    { ...input(), context: { kind: "SALES", hallId: actor.hallId } },
    { ...input(), context: { kind: "TRANSFER", fromWarehouseId: id(3), toWarehouseId: id(3) } }])
    assert.throws(() => parseCurrentFormBarcodeQuery(value), { code: "INVALID_CURRENT_FORM_QUERY" });
});
test("MAIN and retained old aliases return their exact observed binding and same native SKU without search or writes", async () => {
  for (const [barcode, kind] of [["000123", "MAIN"], [" OLD-000123 ", "CONFIRMED_OLD"]]) {
    const p = protocol({ rows: [nativeBarcode(barcode, kind)] }), result = await p.reader.readBarcode(actor, input(barcode), signal());
    assert.equal(result.state, "FOUND"); assert.equal(result.barcode, barcode); assert.deepEqual(result.binding, { id: id(4), kind }); assert.equal(result.sku?.id, id(5));
    assert.equal(p.connects(), 1); assert.equal(p.calls.filter(c => c.sql.includes("current-form:identity")).length, 1);
    assert.equal(p.calls[0]!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(p.calls.at(-1)!.sql, "COMMIT");
    assert.deepEqual(p.calls.find(c => c.sql.includes("current-form:barcode */"))!.values, [barcode]);
    assert.ok(p.calls.every(c => !/^(?:INSERT|UPDATE|DELETE)/.test(c.sql) && !/current-form:page|document-number|receipt|prepare-create/.test(c.sql)));
    assert.equal(p.released.length, 1);
  }
});
test("unknown/product-only codes stay NOT_FOUND; disabled/deleted/staged or invalid group binding stays UNAVAILABLE without SKU disclosure", async () => {
  const missing = protocol({ rows: [] }); assert.deepEqual(await missing.reader.readBarcode(actor, input("PRODUCT-ONLY"), signal()), { state: "NOT_FOUND", barcode: "PRODUCT-ONLY", binding: null, sku: null });
  for (const change of [{ binding_enabled: false }, { sku_enabled: false }, { product_enabled: false }, { color_enabled: false },
    { fit_enabled: false }, { member_size_id: null }, { references_retained: false }, { source_published: false }]) {
    const p = protocol({ rows: [{ ...nativeBarcode(), ...change }] }); assert.deepEqual(await p.reader.readBarcode(actor, input(), signal()), { state: "UNAVAILABLE", barcode: "000123", binding: null, sku: null });
  }
  const multiple = protocol({ rows: [nativeBarcode(), nativeBarcode()] }); await assert.rejects(multiple.reader.readBarcode(actor, input(), signal()), { code: "INVALID_DATABASE_VALUE" });
  assert.equal(multiple.calls.at(-1)!.sql, "ROLLBACK");
});
test("current identity and selected sales warehouse/hall must match before any barcode lookup; future schema denied", async () => {
  for (const options of [{ identity: { login_enabled: false } }, { identity: { hall_id: id(12) } }, { foreignWarehouse: true },
    { disabledFrom: true }, { versions: Array.from({ length: 20 }, (_, i) => i + 1) }]) {
    const p = protocol(options); await assert.rejects(p.reader.readBarcode(actor, input(), signal()));
    assert.ok(!p.calls.some(c => c.sql.includes("current-form:barcode */"))); assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const p = protocol(); await assert.rejects(p.reader.readBarcode(actor, { ...input(), context: { ...salesContext, hallId: entityId("hall", id(12)) } }, signal()), { code: "FORBIDDEN" });
  assert.ok(!p.calls.some(c => c.sql.includes("current-form:barcode */")));
});
test("transfer scan permits source-confirmed cross-hall proposal, FROM disabled only with actual stock and enabled TO", async () => {
  const query: CurrentFormBarcodeQuery = { ...input(), context: { kind: "TRANSFER", fromWarehouseId: entityId("warehouse", id(3)), toWarehouseId: entityId("warehouse", id(13)) } };
  const valid = protocol({ disabledFrom: true, nonzero: true }); assert.equal((await valid.reader.readBarcode(actor, query, signal())).state, "FOUND");
  for (const options of [{ disabledFrom: true }, { disabledTo: true, nonzero: true }]) {
    const p = protocol(options); await assert.rejects(p.reader.readBarcode(actor, query, signal()), { code: "FORBIDDEN" }); assert.ok(!p.calls.some(c => c.sql.includes("current-form:barcode */")));
  }
});
test("actual barcode POST enforces trusted authentication, exact JSON and no-store without creating a listener", async () => {
  const p = protocol(), app = Fastify({ logger: false });
  app.register(createCurrentFormHttpPlugin({ reader: p.reader, authenticate: async request => request.headers["x-synthetic-auth"] === "yes" ? actor : null }));
  await app.ready();
  try {
    const url = "/current-form/barcode/query", headers = { "x-synthetic-auth": "yes" };
    assert.equal(app.server.listening, false); assert.equal((await app.inject({ method: "POST", url, payload: input() })).statusCode, 401); assert.equal(p.connects(), 0);
    assert.equal((await app.inject({ method: "POST", url, headers, payload: { ...input(), role: "ADMIN" } })).statusCode, 400); assert.equal(p.connects(), 0);
    const result = await app.inject({ method: "POST", url, headers, payload: input() }); assert.equal(result.statusCode, 200); assert.equal(result.json().sku.id, id(5)); assert.equal(result.headers["cache-control"], "no-store");
    assert.equal((await app.inject({ method: "POST", url: url + "?actor=spoof", headers, payload: input() })).statusCode, 400);
  } finally { await app.close(); }
});

test("exact2 current forms: customer count/page share predicate only with actual-pool proof; old profile does not probe it", async () => {
  for (const enabled of [false, true]) {
    const calls: string[] = []; let verified = 0;
    const pool = { async connect() { return { async query(sql: string) {
      calls.push(sql); let rows: Record<string, unknown>[] = [];
      if (sql.includes("current-form:identity")) rows = [{ account_id: actor.accountId, staff_id: id(11), login_enabled: true,
        role: "SALESPERSON", employment_status: "在职", hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }];
      else if (sql.includes("current-form:sales-hall")) rows = [{ id: actor.hallId, enabled: true }];
      else if (sql.includes("current-form:count")) rows = [{ total: "1" }];
      else if (sql.includes("current-form:page")) rows = [{ id: id(44), name: "SYNTHETIC ordinary customer", code: "TEST-44", hall_id: null,
        hall_name: null, payment_method_id: null, payment_method_name: null }];
      else assert.match(sql, /^(BEGIN|COMMIT|ROLLBACK)/);
      return { rows, rowCount: rows.length };
    }, release() {} }; } };
    const capability = { profile: "historical-customer-exact2-v26" as const, assertVerified(target: object) { assert.equal(target, pool); verified++; } };
    const reader = new PostgresCurrentFormReader(pool, createSourceConfirmedCurrentFormAuthorization(), enabled ? { historicalCustomerExclusion: capability } : undefined);
    const result = await reader.readSalesReferences(actor, { kind: "customer", hallId: actor.hallId, search: "", page: 1, pageSize: 20 }, signal());
    assert.equal(result.items.length, 1); assert.equal(result.exactTotal, 1n); assert.equal(verified, enabled ? 1 : 0);
    const selection = calls.filter(sql => /current-form:(count|page)/.test(sql)); assert.equal(selection.length, 2);
    for (const sql of selection) assert.equal(sql.includes("AND NOT naijue_erp.is_exact_historical_customer_only(r.id)"), enabled);
    assert.equal(calls[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); assert.equal(calls.at(-1), "COMMIT");
  }
});
test("exact2 current forms: verified missing predicate is fatal and rolls back instead of old-profile fallback", async () => {
  const calls: string[] = []; let released = 0;
  const pool = { async connect() { return { async query(sql: string) {
    calls.push(sql); let rows: Record<string, unknown>[] = [];
    if (sql.includes("current-form:identity")) rows = [{ account_id: actor.accountId, staff_id: id(11), login_enabled: true,
      role: "SALESPERSON", employment_status: "在职", hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }];
    else if (sql.includes("current-form:sales-hall")) rows = [{ id: actor.hallId, enabled: true }];
    else if (sql.includes("is_exact_historical_customer_only")) throw Object.assign(Error("SYNTHETIC missing predicate"), { code: "42883" });
    else assert.match(sql, /^(BEGIN|COMMIT|ROLLBACK)/);
    return { rows, rowCount: rows.length };
  }, release() { released++; } }; } };
  const reader = new PostgresCurrentFormReader(pool, createSourceConfirmedCurrentFormAuthorization(), { historicalCustomerExclusion: {
    profile: "historical-customer-exact2-v26", assertVerified(target) { assert.equal(target, pool); }
  } });
  await assert.rejects(reader.readSalesReferences(actor, { kind: "customer", hallId: actor.hallId, search: "", page: 1, pageSize: 20 }, signal()), { code: "42883" });
  assert.equal(calls.at(-1), "ROLLBACK"); assert.equal(released, 1); assert.equal(calls.filter(sql => sql.includes("current-form:count")).length, 1);
  assert.ok(!calls.some(sql => sql.includes("current-form:page")));
});
