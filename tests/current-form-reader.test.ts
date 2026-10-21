/** SYNTHETIC/scripted pg protocol only: no database, listener, operations or imported data. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresCurrentFormReader } from "../adapters/postgres/src/current-form-reader.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { CurrentFormAuthorization, CurrentFormIntent, CurrentFormReadGrant } from "../packages/application/src/current-form-ports.ts";
import { parseCurrentSalesReferenceQuery, parseCurrentTransferWarehouseQuery, parseCurrentFormProductQuery,
  parseCurrentFormProductSkuQuery, parseCurrentFormSkuBatchQuery } from "../packages/application/src/current-form-validation.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const hall = actor.hallId!, foreignHall = sid("hall", 990), staffId = sid("staff", 991), productId = sid("product", 992), skuId = sid("sku", 993);
const signal = () => new AbortController().signal;
const context = { kind: "SALES" as const, hallId: hall };
const transferContext = { kind: "TRANSFER" as const };
const search = { search: "", page: 1, pageSize: 20 as const };
const reference = (kind: "hall" | "customer" | "salesperson" | "warehouse" | "paymentAccount" = "hall") => ({ ...search, kind, hallId: kind === "hall" ? null : hall });
interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected scripted pg call: ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean): void { this.releases.push(error); }
  done(): void { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const nativeIdentity = (change: Record<string, unknown> = {}) => ({ account_id: actor.accountId, staff_id: staffId, login_enabled: true, role: "SALESPERSON", employment_status: "在职", hall_id: hall, native_hall_id: hall, hall_enabled: true, ...change });
const identity = (change: Record<string, unknown> = {}): Step => ({ sql: /current-form:identity/, rows: [nativeIdentity(change)], inspect(values, sql) {
  assert.deepEqual(values, [actor.accountId]); assert.ok(!/password|session|token|auth_version/.test(sql)); assert.match(sql, /WHERE a.id = \$1::uuid LIMIT 2/);
} });
const selectedHall = (): Step => ({ sql: /current-form:sales-hall/, rows: [{ id: hall, enabled: true }] });
const total = (value = "1", inspect?: Step["inspect"]): Step => ({ sql: /current-form:count/, rows: [{ total: value }], ...(inspect ? { inspect } : {}) });
const page = (rows: Record<string, unknown>[], inspect?: Step["inspect"]): Step => ({ sql: /current-form:page/, rows, ...(inspect ? { inspect } : {}) });
const item = (change: Record<string, unknown> = {}) => ({ id: hall, name: "SYNTHETIC 完整名称", code: null, hall_id: hall, hall_name: "SYNTHETIC 完整厅名", payment_method_id: null, payment_method_name: null, ...change });
const sku = (change: Record<string, unknown> = {}) => ({ id: skuId, sku_code: "SYNTHETIC ORIGINAL SKU", product_id: productId, product_code: "SYNTHETIC ORIGINAL PRODUCT", product_name: "SYNTHETIC 完整商品名", color_id: sid("color", 994), color_name: "SYNTHETIC 完整颜色", fit_id: sid("fit", 995), fit_name: "SYNTHETIC 完整版型", size_id: sid("size", 996), size_name: "SYNTHETIC 完整尺码", size_group_id: sid("sizeGroup", 997), member_size_id: sid("size", 996), sku_enabled: true, product_enabled: true, color_enabled: true, fit_enabled: true, ...change });
const allow: CurrentFormAuthorization = { async authorize() { return { kind: "all" }; } };
const reader = (client: Client, authorization: CurrentFormAuthorization = allow) => new PostgresCurrentFormReader({ async connect() { return client; } }, authorization);
function readonly(client: Client): void { assert.ok(client.calls.every(call => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b|FOR SHARE|FOR UPDATE/.test(call.sql))); }

test("current forms: strict bounded parsers accept only explicit native proposals and reject authority/default/coercion", () => {
  assert.deepEqual(parseCurrentSalesReferenceQuery(reference()), reference());
  assert.deepEqual(parseCurrentTransferWarehouseQuery({ ...search, direction: "FROM" }), { ...search, direction: "FROM" });
  for (const query of [{ ...reference(), actor }, { ...reference(), active: true }, { ...reference(), hallId: hall }, { ...reference("customer"), hallId: null },
    { ...reference(), page: 0 }, { ...reference(), page: Number.MAX_SAFE_INTEGER }, { ...reference(), pageSize: 200 },
    { ...reference(), page: "1" }, { ...reference(), search: " trim " }, { ...reference(), search: "\n" }, { ...reference(), search: "x".repeat(201) }])
    assert.throws(() => parseCurrentSalesReferenceQuery(query), { code: "INVALID_CURRENT_FORM_QUERY" });
  assert.throws(() => parseCurrentTransferWarehouseQuery({ ...search, direction: "from" }), { code: "INVALID_CURRENT_FORM_QUERY" });
  assert.throws(() => parseCurrentFormProductQuery({ ...search, context: { kind: "SALES" } }), { code: "INVALID_CURRENT_FORM_QUERY" });
  assert.throws(() => parseCurrentFormProductSkuQuery({ context, productId, page: 1, pageSize: 20, search: "" }), { code: "INVALID_CURRENT_FORM_QUERY" });
  for (const skuIds of [[], [skuId, skuId], ["fake"], Array.from({ length: 201 }, () => skuId)])
    assert.throws(() => parseCurrentFormSkuBatchQuery({ context, skuIds }), { code: "INVALID_CURRENT_FORM_QUERY" });
});
test("current forms: no constructor connection, mandatory explicit authorization and invalid/pre-aborted reads never connect", async () => {
  assert.throws(() => new PostgresCurrentFormReader(undefined as never, allow), /explicit PostgreSQL pool/);
  assert.throws(() => new PostgresCurrentFormReader({ connect: async () => { throw new Error(); } }, undefined as never), /trusted form authorization/);
  let connects = 0; const r = new PostgresCurrentFormReader({ async connect() { connects++; throw new Error("No connect"); } }, allow);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => r.readSalesReferences(actor, reference(), aborted.signal), { code: "CURRENT_FORM_READ_ABORTED" });
  await assert.rejects(async () => r.readSalesReferences(actor, { ...reference(), pageSize: 200 } as never, signal()), { code: "INVALID_CURRENT_FORM_QUERY" });
  assert.equal(connects, 0);
});
test("current forms: fresh identity and explicit grant precede current eligible hall count/page, not historical observed references", async () => {
  let authorizationCalls = 0; const client = new Client([begin(), identity(), total("1", (values, sql) => {
    assert.deepEqual(values, ["", [hall], hall]); assert.match(sql, /r.enabled/); assert.match(sql, /r.id = ANY\(\$2::uuid\[\]\)/); assert.match(sql, /r.id = \$3::uuid/);
    assert.ok(!/sales_header|transfer_header/.test(sql));
  }), page([item()], (values, sql) => { assert.deepEqual(values, ["", [hall], hall, 20, 0]); assert.match(sql, /ORDER BY r.name COLLATE "C", r.id LIMIT \$4 OFFSET \$5/); }), commit()]);
  const result = await reader(client, { async authorize(facts, intent) {
    authorizationCalls++; assert.ok(Object.isFrozen(facts) && Object.isFrozen(facts.actor) && Object.isFrozen(facts.identity));
    assert.equal(facts.identity.role, "SALESPERSON"); assert.equal(intent.kind, "sales-references"); return { kind: "halls", hallIds: [hall] };
  } }).readSalesReferences(actor, reference(), signal());
  assert.equal(result.exactTotal, 1n); assert.equal(result.items[0]!.id, hall); assert.equal(authorizationCalls, 1); assert.ok(Object.isFrozen(result.items)); readonly(client); client.done();
});
test("current forms: revoked/unknown/stale current identities deny before provider or catalogue queries", async () => {
  for (const change of [{ login_enabled: false }, { role: "UNKNOWN" }, { employment_status: "离职" }, { employment_status: "active" },
    { hall_id: foreignHall, native_hall_id: foreignHall }, { hall_enabled: false }, { hall_id: null, native_hall_id: null, hall_enabled: null }]) {
    let authorized = false; const client = new Client([begin(), identity(change), rollback()]);
    await assert.rejects(() => reader(client, { async authorize() { authorized = true; return { kind: "all" }; } }).readSalesReferences(actor, reference(), signal()), { code: "FORBIDDEN" });
    assert.equal(authorized, false); client.done();
  }
  const client = new Client([begin(), { sql: /current-form:identity/, rows: [] }, rollback()]);
  await assert.rejects(() => reader(client).readSalesReferences(actor, reference(), signal()), { code: "FORBIDDEN" }); client.done();
});
test("current forms: null-hall ADMIN remains exact null, but mismatched null hall is denied", async () => {
  const nullActor = { ...actor, hallId: null }; const client = new Client([begin(), identity({ role: "ADMIN", hall_id: null, native_hall_id: null, hall_enabled: null }), total("0"), page([]), commit()]);
  const result = await reader(client).readProducts(nullActor, { ...search, context: transferContext }, signal()); assert.equal(result.exactTotal, 0n); client.done();
});
test("current forms: denied/empty/malformed explicit grants fail closed, never become default all", async () => {
  for (const grant of [undefined, { kind: "halls", hallIds: [] }, { kind: "halls", hallIds: [hall, hall] }, { kind: "all", override: true }]) {
    const client = new Client([begin(), identity(), rollback()]);
    await assert.rejects(() => reader(client, { async authorize() { return grant as CurrentFormReadGrant; } }).readSalesReferences(actor, reference(), signal()), { code: "FORBIDDEN" }); client.done();
  }
  const client = new Client([begin(), identity(), rollback()]);
  await assert.rejects(() => reader(client, { async authorize() { throw Object.assign(new Error("Denied"), { code: "FORBIDDEN" }); } }).readProducts(actor, { ...search, context }, signal()), { code: "FORBIDDEN" }); client.done();
});
test("current forms: proposed foreign sales hall is denied before target disclosure, even with an all grant", async () => {
  const client = new Client([begin(), identity(), rollback()]);
  await assert.rejects(() => reader(client).readSalesReferences(actor, { ...reference("customer"), hallId: foreignHall }, signal()), { code: "FORBIDDEN" }); client.done();
  const restricted = new Client([begin(), identity({ role: "ADMIN" }), rollback()]);
  await assert.rejects(() => reader(restricted, { async authorize() { return { kind: "halls", hallIds: [foreignHall] }; } }).readProducts(actor, { ...search, context }, signal()), { code: "FORBIDDEN" }); restricted.done();
});
test("current forms: selected sales hall must exist and be enabled in this same snapshot", async () => {
  for (const rows of [[], [{ id: hall, enabled: false }], [{ id: foreignHall, enabled: true }]]) {
    const client = new Client([begin(), identity(), { sql: /current-form:sales-hall/, rows }, rollback()]);
    await assert.rejects(() => reader(client).readSalesReferences(actor, reference("customer"), signal()), { code: "FORBIDDEN" }); client.done();
  }
});
test("current forms: enabled customers are native master candidates even unused, with literal parameterized search", async () => {
  const value = "%_'\\"; const customer = sid("customer", 1001); const client = new Client([begin(), identity(), selectedHall(),
    total("1", (values, sql) => { assert.deepEqual(values, [value]); assert.match(sql, /FROM naijue_erp.customer r WHERE r.enabled/); assert.ok(!/sales_header|LIKE|hall_id/.test(sql)); assert.ok(!sql.includes(value)); }),
    page([item({ id: customer, code: "KH001", hall_id: null, hall_name: null })]), commit()]);
  const result = await reader(client).readSalesReferences(actor, { ...reference("customer"), search: value }, signal()); assert.equal(result.items[0]!.code, "KH001"); client.done();
});
test("current forms: all in-employment staff, not invented salesperson role/same-hall/login eligibility; current user only orders page", async () => {
  const otherStaff = sid("staff", 1002); const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
    assert.deepEqual(values, [""]); assert.match(sql, /r.employment_status = '在职'/); assert.ok(!/r.role|r.enabled|login_enabled|r.hall_id =|user_account/.test(sql));
  }), page([item({ id: otherStaff, hall_id: foreignHall, hall_name: "SYNTHETIC 其他厅" })], (values, sql) => {
    assert.deepEqual(values, ["", staffId, 20, 0]); assert.match(sql, /ORDER BY \(r.id = \$2::uuid\) DESC/);
  }), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference("salesperson"), signal()); assert.equal(result.items[0]!.hallId, foreignHall); client.done();
});
test("current forms: sales warehouse is enabled and belongs to proposed hall, never historical stock/observed membership", async () => {
  const client = new Client([begin(), identity(), selectedHall(), total("0", (values, sql) => {
    assert.deepEqual(values, ["", hall]); assert.match(sql, /r.enabled AND h.enabled AND r.hall_id = \$2::uuid/); assert.ok(!/sales_header|inventory_balance/.test(sql));
  }), page([]), commit()]);
  assert.equal((await reader(client).readSalesReferences(actor, reference("warehouse"), signal())).items.length, 0); client.done();
});
test("current forms: accounts require enabled method; hall affiliation is page recommendation, never count/WHERE restriction", async () => {
  const accountId = sid("paymentAccount", 1003), method = sid("paymentMethod", 1004); const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
    assert.deepEqual(values, [""]); assert.match(sql, /r.enabled AND pm.enabled/); assert.ok(!/payment_account_hall/.test(sql));
  }), page([item({ id: accountId, hall_id: null, hall_name: null, payment_method_id: method, payment_method_name: "SYNTHETIC 完整方式" })], (values, sql) => {
    assert.deepEqual(values, ["", hall, 20, 0]); assert.match(sql, /ORDER BY \(EXISTS \(SELECT 1 FROM naijue_erp.payment_account_hall/); assert.match(sql, /LIMIT \$3 OFFSET \$4/);
  }), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference("paymentAccount"), signal()); assert.equal(result.items[0]!.paymentMethodId, method); client.done();
});
test("current forms: transfer FROM retains disabled nonzero warehouse, TO only enabled; hall enabled is a fact not a new filter", async () => {
  for (const direction of ["FROM", "TO"] as const) {
    const enabled = direction === "TO"; const client = new Client([begin(), identity(), total("1", (_values, sql) => {
      assert.ok(!/h.enabled\s+AND|AND h.enabled|transfer_header/.test(sql));
      if (direction === "FROM") assert.match(sql, /w.enabled OR EXISTS/); else assert.ok(!/w.enabled OR/.test(sql));
    }), page([{ id: sid("warehouse", 1005), name: "SYNTHETIC 完整仓名", hall_id: foreignHall, hall_name: "SYNTHETIC 停用厅", enabled, hall_enabled: false, has_nonzero_inventory: true }]), commit()]);
    const result = await reader(client).readTransferWarehouses(actor, { ...search, direction }, signal()); assert.equal(result.items[0]!.hallEnabled, false); assert.equal(result.items[0]!.enabled, enabled); client.done();
  }
});
test("current forms: explicit transfer hall scope precedes count/page without using prior observed transfers", async () => {
  const client = new Client([begin(), identity(), total("0", (values, sql) => { assert.deepEqual(values, ["", [hall]]); assert.match(sql, /w.hall_id = ANY\(\$2::uuid\[\]\)/); assert.ok(!/transfer_header/.test(sql)); }), page([]), commit()]);
  await reader(client, { async authorize() { return { kind: "halls", hallIds: [hall] }; } }).readTransferWarehouses(actor, { ...search, direction: "FROM" }, signal()); client.done();
});
test("current forms: exact native nullable retail only; absent minimum is explicit UNAVAILABLE, never null/zero facts", async () => {
  for (const retail of [null, "0.00", "12.34", "9999999999999999.99"]) {
    const client = new Client([begin(), identity(), selectedHall(), total(), page([{ id: productId, product_code: "SYNTHETIC ORIGINAL CODE", name: "SYNTHETIC 完整商品", retail_price: retail, enabled: true }], (values, sql) => {
      assert.deepEqual(values, ["", 20, 0]); assert.match(sql, /p.retail_price::text/); assert.ok(!/minimum_price|sales_header|sku/.test(sql));
    }), commit()]);
    const result = await reader(client).readProducts(actor, { ...search, context }, signal()); assert.equal(result.items[0]!.retailPrice, retail);
    assert.equal(result.items[0]!.minimumPriceAvailability, "UNAVAILABLE"); assert.ok(!("minimumPrice" in result.items[0]!)); readonly(client); client.done();
  }
});
test("current forms: malformed native prices/labels and duplicate/page-count mismatches fail without fallback", async () => {
  for (const retail of [undefined, 0, "0", "01.00", "-0.00", "1.234", "1e2", "10000000000000000.00"]) {
    const client = new Client([begin(), identity(), total(), page([{ id: productId, product_code: "CODE", name: "NAME", retail_price: retail, enabled: true }]), rollback()]);
    await assert.rejects(() => reader(client).readProducts(actor, { ...search, context: transferContext }, signal()), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
  for (const rows of [[item(), item()], [item({ name: "" })]]) {
    const client = new Client([begin(), identity(), total(String(rows.length)), page(rows), rollback()]);
    await assert.rejects(() => reader(client).readSalesReferences(actor, reference(), signal()), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("current forms: exact bigint total and real out-of-range page remain empty without unsafe number coercion", async () => {
  const client = new Client([begin(), identity({ role: "ADMIN" }), total("9007199254740993"), page(Array.from({ length: 20 }, (_, index) => item({ id: sid("hall", 1200 + index), hall_id: sid("hall", 1200 + index) }))), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference(), signal()); assert.equal(result.exactTotal, 9007199254740993n); client.done();
  const empty = new Client([begin(), identity(), total("1"), page([], values => assert.deepEqual(values.slice(-2), [20, 20])), commit()]);
  assert.deepEqual((await reader(empty).readSalesReferences(actor, { ...reference(), page: 2 }, signal())).items, []); empty.done();
});
test("current forms: target product SKU page uses native enabled four-dimensional joins and no eager catalogue/barcode fabrication", async () => {
  const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
    assert.deepEqual(values, [productId]); assert.match(sql, /s.enabled AND p.enabled AND c.enabled AND f.enabled AND s.product_id = \$1::uuid/);
    assert.match(sql, /m.size_group_id = p.size_group_id AND m.size_id = s.size_id/); assert.ok(!/CROSS JOIN|sales_line|transfer_line|barcode/.test(sql));
  }), page([sku()]), commit()]);
  const result = await reader(client).readProductSkus(actor, { context, productId, page: 1, pageSize: 20 }, signal());
  assert.equal(result.items[0]!.id, skuId); assert.equal(result.items[0]!.barcodeAvailability, "UNAVAILABLE"); assert.ok(!("barcode" in result.items[0]!)); assert.equal(result.items[0]!.fitName, "SYNTHETIC 完整版型"); client.done();
});
test("current forms: SKU batch is one bounded target set, no N+1, returns original requested order", async () => {
  const second = sid("sku", 1993); const client = new Client([begin(), identity(), { sql: /current-form:sku-batch/, rows: [sku(), sku({ id: second, size_id: sid("size", 1996), member_size_id: sid("size", 1996) })], inspect(values, sql) {
    assert.deepEqual(values, [[skuId, second].sort(), 3]); assert.match(sql, /s.id = ANY\(\$1::uuid\[\]\).*ORDER BY s.id LIMIT \$2/s); assert.ok(!/barcode|sales_line|transfer_line/.test(sql));
  } }, commit()]);
  const result = await reader(client).readSkuBatch(actor, { context: transferContext, skuIds: [second, skuId] }, signal()); assert.deepEqual(result.map(row => row.id), [second, skuId]); assert.equal(client.calls.length, 4); client.done();
});
test("current forms: unavailable/disabled/mismatched SKU batch does not silently drop entries or return partial IDs", async () => {
  for (const rows of [[], [sku({ sku_enabled: false })], [sku({ member_size_id: null })], [sku({ id: sid("sku", 1888) })]]) {
    const client = new Client([begin(), identity(), { sql: /current-form:sku-batch/, rows }, rollback()]);
    await assert.rejects(() => reader(client).readSkuBatch(actor, { context: transferContext, skuIds: [skuId] }, signal()), { code: rows.length === 0 ? "SKU_UNAVAILABLE" : "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("current forms: aborted authorization and SQL prevent subsequent page queries; COMMIT acknowledgement never causes fictitious rollback", async () => {
  const abort = new AbortController(); const client = new Client([begin(), identity(), rollback()]);
  await assert.rejects(() => reader(client, { async authorize() { abort.abort(); return { kind: "all" }; } }).readSalesReferences(actor, reference(), abort.signal), { code: "CURRENT_FORM_READ_ABORTED" }); client.done();
  const afterBegin = new AbortController(); const began = new Client([{ ...begin(), inspect() { afterBegin.abort(); } }, rollback()]);
  await assert.rejects(() => reader(began).readSalesReferences(actor, reference(), afterBegin.signal), { code: "CURRENT_FORM_READ_ABORTED" }); began.done();
  const afterCommit = new AbortController(); const committed = new Client([begin(), identity(), total("0"), page([]), { ...commit(), inspect() { afterCommit.abort(); } }]);
  await assert.rejects(() => reader(committed).readSalesReferences(actor, reference(), afterCommit.signal), { code: "CURRENT_FORM_READ_ABORTED" }); assert.ok(!committed.calls.some(row => row.sql === "ROLLBACK")); committed.done();
});
test("current forms: failed begin/commit/rollback clean up exactly once, discard uncertain clients, never hidden retry", async () => {
  const failure = new Error("SYNTHETIC SQL failure"), rollbackFailure = new Error("SYNTHETIC rollback failure");
  const began = new Client([{ sql: /^BEGIN/, error: failure }]); await assert.rejects(() => reader(began).readSalesReferences(actor, reference(), signal()), error => error === failure); assert.equal(began.releases[0], failure); began.done();
  const uncertain = new Client([begin(), identity(), total("0"), page([]), { sql: /^COMMIT$/, error: failure }, rollback()]);
  await assert.rejects(() => reader(uncertain).readSalesReferences(actor, reference(), signal()), error => error === failure); assert.equal(uncertain.releases[0], failure); uncertain.done();
  const broken = new Client([begin(), { sql: /current-form:identity/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]);
  await assert.rejects(() => reader(broken).readSalesReferences(actor, reference(), signal()), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure); assert.equal(broken.releases[0], rollbackFailure); broken.done();
});

test("current forms: driver-returned out-of-scope references and inconsistent account/method facts fail closed", async () => {
  const cases: { kind: "hall" | "warehouse" | "paymentAccount"; row: Record<string, unknown>; selected: boolean }[] = [
    { kind: "hall", row: item({ id: foreignHall, hall_id: foreignHall }), selected: false },
    { kind: "warehouse", row: item({ id: sid("warehouse", 2101), hall_id: foreignHall }), selected: true },
    { kind: "paymentAccount", row: item({ id: sid("paymentAccount", 2102), hall_id: null, hall_name: null, payment_method_id: sid("paymentMethod", 2103), payment_method_name: null }), selected: true }
  ];
  for (const value of cases) {
    const client = new Client([begin(), identity(), ...(value.selected ? [selectedHall()] : []), total(), page([value.row]), rollback()]);
    await assert.rejects(() => reader(client).readSalesReferences(actor, reference(value.kind), signal()), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
  const client = new Client([begin(), identity(), total(), page([{ id: sid("warehouse", 2104), name: "SYNTHETIC W", hall_id: foreignHall, hall_name: "SYNTHETIC H", enabled: true, hall_enabled: true, has_nonzero_inventory: false }]), rollback()]);
  await assert.rejects(() => reader(client, { async authorize() { return { kind: "halls", hallIds: [hall] }; } }).readTransferWarehouses(actor, { ...search, direction: "TO" }, signal()), { code: "INVALID_DATABASE_VALUE" }); client.done();
});
test("current forms: caller mutations after authorizer await cannot change captured hall/target batch or grant", async () => {
  let unblock!: () => void; const blocked = new Promise<void>(resolve => { unblock = resolve; }); let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const input = { context: { kind: "SALES" as const, hallId: hall }, skuIds: [skuId] };
  const originalActor = { ...actor }; const client = new Client([begin(), identity(), selectedHall(), { sql: /current-form:sku-batch/, rows: [sku()], inspect(values) { assert.deepEqual(values, [[skuId], 2]); } }, commit()]);
  const pending = reader(client, { async authorize(facts, intent) {
    assert.ok(Object.isFrozen(intent.parameters)); assert.ok(Object.isFrozen((intent as Extract<CurrentFormIntent, { kind: "sku-batch" }>).parameters.skuIds));
    entered(); await blocked; assert.equal(facts.actor.accountId, actor.accountId); return { kind: "halls", hallIds: [hall] };
  } }).readSkuBatch(originalActor, input, signal());
  await enteredPromise; input.context.hallId = foreignHall; input.skuIds[0] = sid("sku", 2201); originalActor.accountId = sid("account", 2202); unblock();
  assert.equal((await pending)[0]!.id, skuId); client.done();
});
test("current forms: the maximum target batch stays one bounded set and never becomes per-SKU work", async () => {
  const ids = Array.from({ length: 200 }, (_, index) => sid("sku", 2300 + index));
  const client = new Client([begin(), identity(), { sql: /current-form:sku-batch/, rows: ids.map((id, index) => sku({ id, size_id: sid("size", 2500 + index), member_size_id: sid("size", 2500 + index) })), inspect(values) { assert.equal((values[0] as unknown[]).length, 200); assert.equal(values[1], 201); } }, commit()]);
  assert.equal((await reader(client).readSkuBatch(actor, { context: transferContext, skuIds: ids }, signal())).length, 200); assert.equal(client.calls.length, 4); client.done();
});
