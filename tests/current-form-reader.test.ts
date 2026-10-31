/** SYNTHETIC/scripted pg protocol only: no database, listener, operations or imported data. */
import assert from "node:assert/strict";
import test from "node:test";
import { readCurrentRecentAccount } from "../adapters/postgres/src/current-account-recommendations.ts";
import { PostgresCurrentFormReader } from "../adapters/postgres/src/current-form-reader.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { CurrentFormAuthorization, CurrentFormIntent, CurrentFormReadGrant, CurrentSalesReferenceQuery } from "../packages/application/src/current-form-ports.ts";
import { parseCurrentSalesReferenceQuery, parseCurrentTransferWarehouseQuery, parseCurrentFormProductQuery,
  parseCurrentFormProductSkuQuery, parseCurrentFormSkuBatchQuery } from "../packages/application/src/current-form-validation.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import type { NativeRuntime26Capability } from "../packages/application/src/native-import-schema-contract.ts";
const hall = actor.hallId!, foreignHall = sid("hall", 990), staffId = sid("staff", 991), productId = sid("product", 992), skuId = sid("sku", 993);
const signal = () => new AbortController().signal;
const context = { kind: "SALES" as const, hallId: hall };
const transferContext = { kind: "TRANSFER" as const };
const search = { search: "", page: 1, pageSize: 20 as const };
const selectedMethod = sid("paymentMethod", 1004);
function reference(kind: CurrentSalesReferenceQuery["kind"] = "hall"): CurrentSalesReferenceQuery {
  if (kind === "hall") return { ...search, kind, hallId: null };
  if (kind === "paymentAccount") return { ...search, kind, hallId: hall, paymentMethodId: selectedMethod };
  return { ...search, kind, hallId: hall };
}
interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly rawRows?: true; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected scripted pg call: ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: step.rawRows ? step.rows ?? [] : structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
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
const savepoint = (): Step => ({ sql: /^SAVEPOINT current_account_recommendation$/ });
const releaseHints = (): Step => ({ sql: /^RELEASE SAVEPOINT current_account_recommendation$/ });
const rollbackHints = (): Step => ({ sql: /^ROLLBACK TO SAVEPOINT current_account_recommendation$/ });
const setTimeout = (value: string): Step => ({ sql: /^SELECT set_config\('statement_timeout'/, inspect(values) { assert.deepEqual(values, [value]); } });
function hints(recent: string | null = null, original = "15s", budget = "250ms"): Step[] {
  return [savepoint(), { sql: /current-form:recommendation-timeout/, rows: [{ statement_timeout: original }] }, setTimeout(budget),
    { sql: /current-form:recent-account/, rows: [{ recent_account_id: recent, candidate_overflow: false, proof_overflow: false }], inspect(values) {
      assert.deepEqual(values, [hall, selectedMethod, 51, 50, 100001, 2000, 100000]);
    } }];
}
const restoreHints = (original = "15s"): Step[] => [setTimeout(original), releaseHints()];
const item = (change: Record<string, unknown> = {}) => ({ id: hall, name: "SYNTHETIC 完整名称", code: null, hall_id: hall, hall_name: "SYNTHETIC 完整厅名", payment_method_id: null, payment_method_name: null, ...change });
const sku = (change: Record<string, unknown> = {}) => ({ id: skuId, sku_code: "SYNTHETIC ORIGINAL SKU", product_id: productId, product_code: "SYNTHETIC ORIGINAL PRODUCT", product_name: "SYNTHETIC 完整商品名", color_id: sid("color", 994), color_name: "SYNTHETIC 完整颜色", fit_id: sid("fit", 995), fit_name: "SYNTHETIC 完整版型", size_id: sid("size", 996), size_name: "SYNTHETIC 完整尺码", size_group_id: sid("sizeGroup", 997), member_size_id: sid("size", 996), sku_enabled: true, product_enabled: true, color_enabled: true, fit_enabled: true, ...change });
const allow: CurrentFormAuthorization = { async authorize() { return { kind: "all" }; } };
const reader = (client: Client, authorization: CurrentFormAuthorization = allow) => new PostgresCurrentFormReader({ async connect() { return client; } }, authorization);
function readonly(client: Client): void { assert.ok(client.calls.every(call => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b|FOR SHARE|FOR UPDATE/.test(call.sql))); }

test("current group read: native product exposes its actual hard-bound group even with zero SKU", async () => {
  const groupId = sid("sizeGroup", 1901);
  for (const selectedContext of [context, transferContext]) {
    const row = { id: productId, product_code: "GROUP-ONLY", name: "SYNTHETIC NO SKU", retail_price: null, enabled: true,
      category_id: sid("category", 1801), category_name: "SYNTHETIC CATEGORY", size_group_id: groupId };
    const client = new Client([begin(), identity(), ...(selectedContext.kind === "SALES" ? [selectedHall()] : []), total(), page([row]), commit()]);
    const result = await reader(client).readProducts(actor, { ...search, context: selectedContext }, signal());
    assert.equal(result.items[0]!.sizeGroupId, groupId);
    const nativePage = client.calls.find(call => call.sql.includes("current-form:page"))!;
    assert.match(nativePage.sql, /p\.size_group_id/);
    assert.ok(!/JOIN naijue_erp\.sku|FROM naijue_erp\.sku/.test(nativePage.sql));
    assert.equal(Object.hasOwn(result.items[0]!, "skuId"), false); readonly(client); client.done();
  }
  for (const invalidGroup of [null, undefined, "not-an-id"]) {
    const row = { id: productId, product_code: "GROUP-ONLY", name: "SYNTHETIC NO SKU", retail_price: null, enabled: true,
      category_id: sid("category", 1801), category_name: "SYNTHETIC CATEGORY", size_group_id: invalidGroup };
    const client = new Client([begin(), identity(), total(), page([row]), rollback()]);
    await assert.rejects(reader(client).readProducts(actor, { ...search, context: transferContext }, signal()), { code: invalidGroup === "not-an-id" ? "INVALID_ID" : "INVALID_DATABASE_VALUE" });
    readonly(client); client.done();
  }
});

test("current recommendation read: account items expose only server-proven recommendation flags and preserve unknown", async () => {
  const preferred = sid("paymentAccount", 1902), other = sid("paymentAccount", 1903);
  const candidate = (id: string) => item({ id, hall_id: null, hall_name: null, payment_method_id: selectedMethod, payment_method_name: "SYNTHETIC METHOD" });
  const client = new Client([begin(), identity(), selectedHall(), total("2"), ...hints(preferred),
    page([{ ...candidate(preferred), is_recommended: true }, { ...candidate(other), is_recommended: false }]), ...restoreHints(), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference("paymentAccount"), signal());
  assert.equal(result.recommendationAvailability, "AVAILABLE");
  assert.deepEqual(result.items.map(row => row.isRecommended), [true, false]);
  assert.deepEqual(result.items.map(row => row.code), [null, null]); readonly(client); client.done();
  const unknown = new Client([begin(), identity(), selectedHall(), total(), ...hints().slice(0, 3),
    { sql: /current-form:recent-account/, error: Object.assign(new Error("SYNTHETIC optional hint unknown"), { code: "57014" }) },
    rollbackHints(), releaseHints(), { sql: /current-form:eligible-account-fallback/, rows: [candidate(other)] }, commit()]);
  const pageWithoutHints = await reader(unknown).readSalesReferences(actor, reference("paymentAccount"), signal());
  assert.equal(pageWithoutHints.recommendationAvailability, "UNAVAILABLE");
  assert.equal(Object.hasOwn(pageWithoutHints.items[0]!, "isRecommended"), false); readonly(unknown); unknown.done();
});

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
  await assert.rejects(() => reader(client).readSalesReferences(actor, { ...search, kind: "customer", hallId: foreignHall }, signal()), { code: "FORBIDDEN" }); client.done();
  const restricted = new Client([begin(), identity({ role: "ADMIN" }), rollback()]);
  await assert.rejects(() => reader(restricted, { async authorize() { return { kind: "halls", hallIds: [foreignHall] }; } }).readProducts(actor, { ...search, context }, signal()), { code: "FORBIDDEN" }); restricted.done();
});
test("current forms: selected sales hall must exist and be enabled in this same snapshot", async () => {
  for (const rows of [[], [{ id: hall, enabled: false }], [{ id: foreignHall, enabled: true }]]) {
    const client = new Client([begin(), identity(), { sql: /current-form:sales-hall/, rows }, rollback()]);
    await assert.rejects(() => reader(client).readSalesReferences(actor, reference("customer"), signal()), { code: "FORBIDDEN" }); client.done();
  }
});
test("current forms: payment-method selector has a strict native hall-context contract, never selected-method/account authority", async () => {
  const query = reference("paymentMethod"); const parsed = parseCurrentSalesReferenceQuery(query);
  assert.deepEqual(parsed, query); assert.ok(Object.isFrozen(parsed));
  let connections = 0; const r = new PostgresCurrentFormReader({ async connect() { connections++; throw new Error("must not connect"); } }, allow);
  for (const input of [{ ...query, hallId: null }, { ...query, hallId: "fake" }, { ...query, paymentMethodId: selectedMethod },
    { ...query, accountId: sid("paymentAccount", 1010) }, { ...query, enabled: true }, { ...query, pageSize: 1 },
    { ...query, page: "1" }, { ...query, search: " padded " }, { ...query, search: "x".repeat(201) }]) {
    await assert.rejects(async () => r.readSalesReferences(actor, input as never, signal()), { code: "INVALID_CURRENT_FORM_QUERY" });
  }
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => r.readSalesReferences(actor, query, aborted.signal), { code: "CURRENT_FORM_READ_ABORTED" });
  assert.equal(connections, 0);
});
test("current forms: payment-method reads recheck identity, explicit authorization and proposed-hall scope before candidates", async () => {
  const foreign = new Client([begin(), identity(), rollback()]);
  await assert.rejects(() => reader(foreign).readSalesReferences(actor, { ...search, kind: "paymentMethod", hallId: foreignHall }, signal()), { code: "FORBIDDEN" }); foreign.done();
  const restricted = new Client([begin(), identity({ role: "ADMIN" }), rollback()]);
  await assert.rejects(() => reader(restricted, { async authorize() { return { kind: "halls", hallIds: [foreignHall] }; } })
    .readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "FORBIDDEN" }); restricted.done();
  const revoked = new Client([begin(), identity({ login_enabled: false }), rollback()]);
  await assert.rejects(() => reader(revoked).readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "FORBIDDEN" }); revoked.done();
  const denied = new Client([begin(), identity(), rollback()]);
  await assert.rejects(() => reader(denied, { async authorize() { throw new DomainError("FORBIDDEN", "SYNTHETIC denied"); } })
    .readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "FORBIDDEN" }); denied.done();
  for (const rows of [[], [{ id: hall, enabled: false }]]) {
    const disabledHall = new Client([begin(), identity(), { sql: /current-form:sales-hall/, rows }, rollback()]);
    await assert.rejects(() => reader(disabledHall).readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "FORBIDDEN" }); disabledHall.done();
  }
});
test("current forms: payment-method identity/label comes from enabled native methods with an eligible account, never hall ownership or account projection", async () => {
  const literal = "%_'\\"; const nativeName = "SYNTHETIC 原始收款方式 完整名称";
  const candidate = item({ id: selectedMethod, name: nativeName, method_enabled: true, hall_id: null, hall_name: null });
  const eligibility = (values: unknown[], sql: string) => {
    assert.deepEqual(values, [literal]); assert.match(sql, /FROM naijue_erp.payment_method r WHERE r.enabled AND EXISTS \(SELECT 1 FROM naijue_erp.payment_account a WHERE a.payment_method_id = r.id AND a.enabled\)/);
    assert.match(sql, /strpos\(lower\(r.name\), lower\(\$1::text\)\) > 0/);
    assert.ok(!/JOIN|DISTINCT|payment_account_hall|hall_id|sales_header|LIKE|a.name/.test(sql)); assert.ok(!sql.includes(literal));
  };
  const client = new Client([begin(), identity(), selectedHall(), total("1", eligibility), page([candidate], (values, sql) => {
    assert.deepEqual(values, [literal, 20, 0]); assert.match(sql, /SELECT r.id, r.name, r.enabled AS method_enabled/);
    assert.match(sql, /ORDER BY r.id LIMIT \$2 OFFSET \$3/); assert.ok(!/ORDER BY.*name|is_recommended/.test(sql));
  }), commit()]);
  let authorized = 0;
  const result = await reader(client, { async authorize(_facts, intent) {
    authorized++; assert.deepEqual(intent, { kind: "sales-references", parameters: { ...reference("paymentMethod"), search: literal } });
    assert.ok(Object.isFrozen(intent.parameters)); return { kind: "halls", hallIds: [hall] };
  } }).readSalesReferences(actor, { ...reference("paymentMethod"), search: literal }, signal());
  assert.deepEqual(result.items, [{ id: selectedMethod, name: nativeName, code: null, hallId: null, hallName: null, paymentMethodId: null, paymentMethodName: null }]);
  assert.equal(result.exactTotal, 1n); assert.equal(authorized, 1); assert.ok(Object.isFrozen(result.items[0]));
  assert.ok(!Object.hasOwn(result, "recommendationAvailability")); assert.equal(client.calls.length, 6); readonly(client); client.done();
});
test("current forms: disabled and zero-eligible-account methods are excluded by the same authoritative count/page predicate", async () => {
  const eligible = "r.enabled AND EXISTS (SELECT 1 FROM naijue_erp.payment_account a WHERE a.payment_method_id = r.id AND a.enabled)";
  const check = (values: unknown[], sql: string) => { assert.ok(sql.includes(eligible)); assert.deepEqual(values[0], ""); };
  // Scripted pg tests assert the exclusion predicate; no PostgreSQL execution is claimed.
  const client = new Client([begin(), identity(), selectedHall(), total("0", check), page([], check), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference("paymentMethod"), signal());
  assert.equal(result.exactTotal, 0n); assert.deepEqual(result.items, []); client.done();
});
test("current forms: payment-method pages retain exact bigint totals, fixed bounds and real out-of-range emptiness", async () => {
  const row = (index: number) => item({ id: sid("paymentMethod", 3300 + index), method_enabled: true, hall_id: null, hall_name: null });
  const large = new Client([begin(), identity(), selectedHall(), total("9007199254740993"), page(Array.from({ length: 20 }, (_, index) => row(index))), commit()]);
  assert.equal((await reader(large).readSalesReferences(actor, reference("paymentMethod"), signal())).exactTotal, 9007199254740993n); large.done();
  const outOfRange = new Client([begin(), identity(), selectedHall(), total("1"), page([], (values, sql) => {
    assert.deepEqual(values, ["", 20, 20]); assert.match(sql, /ORDER BY r.id LIMIT \$2 OFFSET \$3/);
  }), commit()]);
  const result = await reader(outOfRange).readSalesReferences(actor, { ...reference("paymentMethod"), page: 2 }, signal());
  assert.equal(result.page, 2); assert.deepEqual(result.items, []); outOfRange.done();
});
test("current forms: malformed/disabled/shared-shape payment-method facts fail closed without fallback", async () => {
  const candidate = item({ id: selectedMethod, method_enabled: true, hall_id: null, hall_name: null });
  for (const change of [{ id: "fake" }, { name: "" }, { method_enabled: false }, { method_enabled: "true" },
    { code: "invented" }, { hall_id: hall, hall_name: "SYNTHETIC hall" }, { payment_method_id: selectedMethod, payment_method_name: "SYNTHETIC self" }]) {
    const client = new Client([begin(), identity(), selectedHall(), total(), page([{ ...candidate, ...change }]), rollback()]);
    await assert.rejects(() => reader(client).readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "id" in change ? "INVALID_ID" : "INVALID_DATABASE_VALUE" }); client.done();
  }
  const duplicates = new Client([begin(), identity(), selectedHall(), total("2"), page([candidate, candidate]), rollback()]);
  await assert.rejects(() => reader(duplicates).readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "INVALID_DATABASE_VALUE" }); duplicates.done();
  const mismatch = new Client([begin(), identity(), selectedHall(), total("1"), page([]), rollback()]);
  await assert.rejects(() => reader(mismatch).readSalesReferences(actor, reference("paymentMethod"), signal()), { code: "INVALID_DATABASE_VALUE" }); mismatch.done();
});
test("current forms: enabled customers are native master candidates even unused, with literal parameterized search", async () => {
  const value = "%_'\\"; const customer = sid("customer", 1001); const client = new Client([begin(), identity(), selectedHall(),
    total("1", (values, sql) => { assert.deepEqual(values, [value,hall]); assert.match(sql, /FROM naijue_erp.customer r JOIN naijue_erp.hall selected_hall/); assert.ok(!/sales_header|LIKE|hall_id/.test(sql)); assert.ok(!sql.includes(value)); }),
    page([item({ id: customer, code: "KH001", hall_id: null, hall_name: null,is_recommended:false })]), commit()]);
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
test("current forms: selected-method accounts stay globally eligible; OR recommendations share stable account-ID base order", async () => {
  const accountId = sid("paymentAccount", 1003); const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
    assert.deepEqual(values, ["", selectedMethod]); assert.match(sql, /r.enabled AND pm.enabled AND r.payment_method_id = \$2::uuid/);
    assert.ok(!/payment_account_hall|sales_header|hall_id/.test(sql));
  }), ...hints(accountId), page([item({ id: accountId, hall_id: null, hall_name: null, payment_method_id: selectedMethod, payment_method_name: "SYNTHETIC 完整方式", is_recommended: true })], (values, sql) => {
    assert.deepEqual(values, ["", selectedMethod, hall, accountId, 20, 0]);
    assert.match(sql, /EXISTS \(SELECT 1 FROM naijue_erp.payment_account_hall/); assert.match(sql, /OR r.id = \$4::uuid/);
    assert.match(sql, /ORDER BY is_recommended DESC, r.id LIMIT \$5 OFFSET \$6/);
    assert.ok(!/ORDER BY.*name|updated_at/.test(sql));
  }), ...restoreHints(), commit()]);
  const result = await reader(client).readSalesReferences(actor, reference("paymentAccount"), signal());
  assert.equal(result.items[0]!.paymentMethodId, selectedMethod); assert.equal(result.recommendationAvailability, "AVAILABLE"); readonly(client); client.done();
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
    const client = new Client([begin(), identity(), selectedHall(), total(), page([{ id: productId, product_code: "SYNTHETIC ORIGINAL CODE", name: "SYNTHETIC 完整商品", retail_price: retail, enabled: true, size_group_id: sid("sizeGroup", 997), category_id: sid("category", 1800), category_name: "SYNTHETIC LEAF" }], (values, sql) => {
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
    const client = new Client([begin(), identity(), ...(value.selected ? [selectedHall()] : []), total(), ...(value.kind === "paymentAccount" ? hints() : []), page([{ ...value.row, ...(value.kind === "paymentAccount" ? { is_recommended: false } : {}) }]), ...(value.kind === "paymentAccount" ? restoreHints() : []), rollback()]);
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

test("current forms: payment method is mandatory/canonical only for account queries; invalid contract never connects", async () => {
  const { paymentMethodId: _method, ...missing } = reference("paymentAccount") as Extract<CurrentSalesReferenceQuery, { kind: "paymentAccount" }>;
  let connections = 0; const r = new PostgresCurrentFormReader({ async connect() { connections++; throw new Error("must not connect"); } }, allow);
  for (const input of [missing, { ...missing, paymentMethodId: null }, { ...missing, paymentMethodId: "fake" }, { ...missing, paymentMethodId: selectedMethod.toUpperCase() },
    { ...reference("customer"), paymentMethodId: selectedMethod }, { ...reference(), paymentMethodId: selectedMethod }]) {
    await assert.rejects(async () => r.readSalesReferences(actor, input as never, signal()), { code: "INVALID_CURRENT_FORM_QUERY" });
  }
  assert.equal(connections, 0);
});
test("current forms: optional recent timeout/missing SQL permission/overflow recover same connection with pure global eligibility", async () => {
  for (const code of ["57014", "42703", "42501", "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE"]) {
    const failure = Object.assign(new Error("SYNTHETIC optional recommendation failure"), { code }); const accountId = sid("paymentAccount", 3010);
    const prefix = hints().slice(0, 3); const client = new Client([begin(), identity(), selectedHall(), total(), ...prefix,
      { sql: /current-form:recent-account/, error: failure }, rollbackHints(), releaseHints(),
      { sql: /current-form:eligible-account-fallback/, rows: [item({ id: accountId, hall_id: null, hall_name: null, payment_method_id: selectedMethod, payment_method_name: "SYNTHETIC cross-hall eligible" })], inspect(values, sql) {
        assert.deepEqual(values, ["", selectedMethod, 20, 0]); assert.match(sql, /r.enabled AND pm.enabled AND r.payment_method_id = \$2::uuid/);
        assert.match(sql, /ORDER BY r.id LIMIT \$3 OFFSET \$4/); assert.ok(!/payment_account_hall|sales_header|hall_id =|is_recommended/.test(sql));
      } }, commit()]);
    const result = await reader(client).readSalesReferences(actor, reference("paymentAccount"), signal());
    assert.equal(result.items[0]!.id, accountId); assert.equal(result.recommendationAvailability, "UNAVAILABLE"); assert.equal(result.exactTotal, 1n);
    assert.equal(client.calls.filter(call => call.sql.includes("current-form:recent-account")).length, 1); client.done();
  }
});
test("current forms: optional recommendation timeout is bounded, does not extend tighter original, and restores success setting", async () => {
  for (const [original, budget, option] of [["0", "250ms", undefined], ["15s", "1000ms", 1000], ["100ms", "100ms", 250], ["100us", "100us", 250]] as const) {
    const client = new Client([begin(), identity(), selectedHall(), total("0"), ...hints(null, original, budget), page([]), ...restoreHints(original), commit()]);
    await new PostgresCurrentFormReader({ async connect() { return client; } }, allow, option === undefined ? undefined : { recommendationTimeoutMillis: option })
      .readSalesReferences(actor, reference("paymentAccount"), signal()); client.done();
  }
  for (const value of [0, 1001, -1, 2.5, NaN]) assert.throws(() => new PostgresCurrentFormReader({ async connect() { throw new Error(); } }, allow, { recommendationTimeoutMillis: value }), /1 through 1000/);
});
test("current forms: eligibility SQL/count, decoder, and failed savepoint recovery do not degrade into successful hints", async () => {
  const core = new Error("SYNTHETIC authoritative count denied"); const denied = new Client([begin(), identity(), selectedHall(), { sql: /current-form:count/, error: core }, rollback()]);
  await assert.rejects(() => reader(denied).readSalesReferences(actor, reference("paymentAccount"), signal()), core); denied.done();
  const mismatch = new Client([begin(), identity(), selectedHall(), total(), ...hints(), page([item({ id: sid("paymentAccount", 3011), hall_id: null, hall_name: null, payment_method_id: sid("paymentMethod", 3012), payment_method_name: "OTHER", is_recommended: false })]), ...restoreHints(), rollback()]);
  await assert.rejects(() => reader(mismatch).readSalesReferences(actor, reference("paymentAccount"), signal()), { code: "INVALID_DATABASE_VALUE" }); mismatch.done();
  const recovery = new Error("SYNTHETIC rollback-to failed"); const broken = new Client([begin(), identity(), selectedHall(), total(), ...hints().slice(0,3), { sql: /current-form:recent-account/, error: core }, { ...rollbackHints(), error: recovery }, rollback()]);
  await assert.rejects(() => reader(broken).readSalesReferences(actor, reference("paymentAccount"), signal()), recovery); broken.done();
});
test("current forms: recent proof is one bounded aggregate, retains sales-family/order/original-pair and does not invent historical active facts", async () => {
  let calls = 0; const recent = sid("paymentAccount", 3013);
  const query = async (sql: string, values?: unknown[]): Promise<PgSalesResult> => { calls++; assert.deepEqual(values, [hall, selectedMethod, 51, 50, 100001, 2000, 100000]);
    assert.match(sql, /h.status = 'APPROVED' AND h.stock_basis = 'RUNTIME_LEDGER'/); assert.ok(!/business_type\s*=|CUTOFF_HISTORY|method_name_snapshot/.test(sql));
    assert.match(sql, /h.business_date DESC NULLS LAST, h.updated_at DESC, h.id DESC LIMIT \$3/);
    assert.match(sql, /ss.payment_method_id_snapshot = a.payment_method_id/); assert.match(sql, /d.id DESC, ss.line_no ASC LIMIT 1/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM naijue_erp.inventory_ledger reversal/); assert.match(sql, /e.source_document_version = d.version/);
    assert.match(sql, /e.quantity_delta::numeric = -l.quantity::numeric/); assert.match(sql, /e.distinct_line_count = l.line_count/);
    assert.equal((sql.match(/FROM naijue_erp.sales_header/g) ?? []).length, 1); assert.equal((sql.match(/LIMIT \$5/g) ?? []).length, 2);
    return { rows: [{ recent_account_id: recent, candidate_overflow: true, proof_overflow: false }], rowCount: 1 };
  };
  assert.equal(await readCurrentRecentAccount(query, hall, selectedMethod), recent); assert.equal(calls, 1);
  for (const row of [{ recent_account_id: null, candidate_overflow: true, proof_overflow: false }, { recent_account_id: recent, candidate_overflow: false, proof_overflow: true }])
    await assert.rejects(() => readCurrentRecentAccount(async () => ({ rows: [row], rowCount: 1 }), hall, selectedMethod), { code: "CURRENT_ACCOUNT_RECOMMENDATION_UNAVAILABLE" });
  assert.equal(await readCurrentRecentAccount(async () => ({ rows: [{ recent_account_id: null, candidate_overflow: false, proof_overflow: false }], rowCount: 1 }), hall, selectedMethod), null);
});
test("current forms: every optional config/page/restore failure recovers via savepoint and never hides globally eligible accounts", async () => {
  const accountId = sid("paymentAccount", 3020), failure = new Error("SYNTHETIC optional failure");
  const candidate = item({ id: accountId, hall_id: null, hall_name: null, payment_method_id: selectedMethod, payment_method_name: "SYNTHETIC method" });
  const scenarios: Step[][] = [
    [savepoint(), { sql: /current-form:recommendation-timeout/, error: failure }],
    [savepoint(), { sql: /current-form:recommendation-timeout/, rows: [{ statement_timeout: "untrusted timeout" }] }],
    [...hints().slice(0, 2), { ...setTimeout("250ms"), error: failure }],
    [...hints(), { sql: /current-form:page/, error: failure }],
    [...hints(), page([{ ...candidate, is_recommended: false }]), { ...setTimeout("15s"), error: failure }]
  ];
  for (const steps of scenarios) {
    const client = new Client([begin(), identity(), selectedHall(), total(), ...steps, rollbackHints(), releaseHints(),
      { sql: /current-form:eligible-account-fallback/, rows: [candidate] }, commit()]);
    const result = await reader(client).readSalesReferences(actor, reference("paymentAccount"), signal());
    assert.equal(result.recommendationAvailability, "UNAVAILABLE"); assert.equal(result.items[0]!.id, accountId); assert.equal(result.exactTotal, 1n); client.done();
  }
});
test("current forms: optional cancellation remains cancellation with whole rollback, not an unrequested fallback", async () => {
  const control = new AbortController(); const client = new Client([begin(), identity(), selectedHall(), total("0"),
    ...hints().slice(0, 3), { sql: /current-form:recent-account/, rows: [{ recent_account_id: null, candidate_overflow: false, proof_overflow: false }], inspect() { control.abort(); } }, rollback()]);
  await assert.rejects(() => reader(client).readSalesReferences(actor, reference("paymentAccount"), control.signal), { code: "CURRENT_FORM_READ_ABORTED" });
  assert.ok(!client.calls.some(call => call.sql.includes("eligible-account-fallback"))); client.done();
});

test("current product category returns real terminal label or explicit unknown in the same authorized page without expanding products", async () => {
  const categoryId = sid("category", 1801);
  for (const label of ["SYNTHETIC 原末级分类", null]) {
    const row = { id: productId, product_code: "SYNTHETIC CODE", name: "SYNTHETIC PRODUCT", retail_price: "0.00", enabled: true, size_group_id: sid("sizeGroup", 997), category_id: categoryId, category_name: label };
    const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
      assert.deepEqual(values, [""]); assert.match(sql, /LEFT JOIN naijue_erp.product_category pc ON pc.id=p.category_id/);
      assert.doesNotMatch(sql, /GROUP BY|CROSS JOIN|unnest|WITH RECURSIVE|source_unit/);
    }), page([row], (values, sql) => { assert.deepEqual(values, ["", 20, 0]); assert.match(sql, /p.category_id, pc.name AS category_name/); }), commit()]);
    const result = await reader(client).readProducts(actor, { ...search, context }, signal());
    assert.deepEqual(result.items[0]!.category, { id: categoryId, label }); assert.equal(result.exactTotal, 1n);
    assert.equal(Object.isFrozen(result.items[0]!.category), true); assert.equal("unit" in result.items[0]!, false);
    readonly(client); client.done();
  }
});
test("current product category rejects missing or malformed native identity or label without inventing fallback facts", async () => {
  for (const changed of [{ category_id: null }, { category_id: "bad" }, { category_id: undefined }, { category_name: undefined }, { category_name: 0 }, { category_name: "" }, { category_name: "\n" }]) {
    const row = { id: productId, product_code: "SYNTHETIC CODE", name: "SYNTHETIC PRODUCT", retail_price: null, enabled: true,
      size_group_id: sid("sizeGroup", 997), category_id: sid("category", 1801), category_name: "SYNTHETIC LEAF", ...changed };
    const client = new Client([begin(), identity(), total("1"), page([row]), rollback()]);
    await assert.rejects(reader(client).readProducts(actor, { ...search, context: transferContext }, signal()));
    readonly(client); client.done();
  }
});

test("current product code search uses admitted native SKU/main/old contains matches without count or page fanout", async () => {
  const row = { id: productId, product_code: "SYNTHETIC CODE", name: "SYNTHETIC PRODUCT", retail_price: null, enabled: true,
    size_group_id: sid("sizeGroup", 997), category_id: sid("category", 1801), category_name: "SYNTHETIC LEAF" };
  let counted = "";
  const client = new Client([begin(), identity(), selectedHall(), total("1", (values, sql) => {
    assert.deepEqual(values, ["000123"]); counted = sql.split("FROM naijue_erp.product p")[1]!;
    assert.match(sql, /strpos\(lower\(p.system_item_code\), lower\(\$1::text\)\)/);
    assert.match(sql, /EXISTS \(\s*SELECT 1 FROM naijue_erp.sku s/);
    assert.match(sql, /strpos\(lower\(s.sku_code\), lower\(\$1::text\)\)/);
    assert.match(sql, /b.enabled AND b.barcode_kind IN \('MAIN','CONFIRMED_OLD'\)/);
    assert.match(sql, /strpos\(lower\(b.barcode\), lower\(\$1::text\)\)/);
    assert.match(sql, /sm.size_group_id=p.size_group_id AND sm.size_id=s.size_id/);
    assert.match(sql, /s.enabled AND sc.enabled AND sf.enabled/);
    assert.ok(!/\bDISTINCT\b|\bGROUP BY\b|\bLIKE\b|raw_fields|source_key|import_sku_alias/.test(sql));
  }), page([row], (values, sql) => {
    assert.deepEqual(values, ["000123", 20, 0]); assert.equal(sql.split("FROM naijue_erp.product p")[1]!.split("\n      ORDER BY")[0], counted);
    assert.match(sql, /ORDER BY p.product_code COLLATE "C", p.id LIMIT \$2 OFFSET \$3/);
  }), commit()]);
  const result = await reader(client).readProducts(actor, { ...search, search: "000123", context }, signal());
  assert.equal(result.exactTotal, 1n); assert.equal(result.items.length, 1); assert.equal(result.items[0]!.id, productId);
  assert.ok(!("skuId" in result.items[0]!)); readonly(client); client.done();
});
test("current product short search stays name/code only while explicit staged native product sources remain hidden", async () => {
  for (const value of ["", "00123"]) {
    const check = (values: unknown[], sql: string) => {
      assert.equal(values[0], value); assert.ok(!/sku_barcode|s.sku_code|p.system_item_code/.test(sql));
      assert.match(sql, /NOT EXISTS \(SELECT 1 FROM naijue_erp.import_source_row src JOIN naijue_erp.import_batch ib/);
      assert.match(sql, /ib.status<>'IMPORTED' AND src.entity_type='PRODUCT'/);
      assert.match(sql, /src.field_provenance->>'native_product_id'=p.id::text/);
    };
    const client = new Client([begin(), identity(), total("0", check), page([], check), commit()]);
    const result = await reader(client).readProducts(actor, { ...search, search: value, context: transferContext }, signal()); assert.equal(result.exactTotal, 0n); readonly(client); client.done();
  }
});
test("current product six-character code search excludes unpublished SKU/barcode bindings and preserves literal input/page offsets", async () => {
  const check = (values: unknown[], sql: string) => {
    assert.equal(values[0], "00%_Ab"); assert.match(sql, /src.entity_type='SKU'/);
    assert.match(sql, /src.field_provenance->'native_sku_import'->>'native_sku_id'=s.id::text/);
    assert.match(sql, /src.entity_type='BARCODE'/);
    assert.match(sql, /src.field_provenance->>'native_sku_id'=s.id::text AND src.field_provenance->>'native_barcode'=b.barcode/);
    assert.ok(!/\bILIKE\b|\bLIKE\b/.test(sql)); assert.ok(!sql.includes("00%_Ab"));
  };
  const client = new Client([begin(), identity(), total("1", check), page([], (values, sql) => { check(values, sql); assert.deepEqual(values, ["00%_Ab", 20, 20]); }), commit()]);
  const result = await reader(client).readProducts(actor, { ...search, search: "00%_Ab", page: 2, context: transferContext }, signal());
  assert.equal(result.exactTotal, 1n); assert.deepEqual(result.items, []); readonly(client); client.done();
});

test("current forms exact26: every read proves CURRENT_FORM_READ on the original borrowed client before BEGIN and within the authorized snapshot", async () => {
  const client = new Client([begin(), identity(), selectedHall(), total("0"), page([]), commit()]);
  const checkedAt: number[] = []; let authorized = 0;
  const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) {
    assert.equal(target, client); assert.equal(purpose, "CURRENT_FORM_READ"); checkedAt.push(client.calls.length);
  } };
  const r = new PostgresCurrentFormReader({ async connect() { return client; } }, { async authorize(facts, intent) {
    authorized++; assert.equal(facts.identity.accountId, actor.accountId); assert.equal(intent.kind, "products"); return { kind: "all" };
  } }, { runtime26 });
  const result = await r.readProducts(actor, { ...search, context }, signal());
  assert.equal(result.exactTotal, 0n); assert.deepEqual(checkedAt, [0, 1]); assert.equal(authorized, 1); readonly(client); client.done();
});

test("current forms exact26: barcode retains warehouse authorization, publication and enabled-reference checks in one readonly snapshot", async () => {
  const warehouseId = sid("warehouse", 1201), bindingId = sid("barcode", 1202);
  const input = { context: { ...context, warehouseId }, barcode: "000123" };
  for (const sourcePublished of [true, false]) {
    const client = new Client([begin(), identity(), { sql: /current-form:barcode-schema/, rows: [{ versions: Array.from({ length: 26 }, (_, i) => i + 1) }] },
      selectedHall(), { sql: /current-form:barcode-warehouses/, rows: [{ id: warehouseId, hall_id: hall, native_hall_id: hall, enabled: true, has_nonzero_inventory: false }] },
      { sql: /current-form:barcode \*\//, rows: [{ ...sku(), binding_id: bindingId, barcode: input.barcode, barcode_kind: "MAIN", binding_enabled: true,
        references_retained: true, source_published: sourcePublished }], inspect(values, sql) {
        assert.deepEqual(values, ["000123"]); assert.match(sql, /ib.status<>'IMPORTED'/); assert.match(sql, /references_retained/);
      } }, commit()]);
    const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target, purpose) {
      assert.equal(target, client); assert.equal(purpose, "CURRENT_FORM_READ");
    } };
    const r = new PostgresCurrentFormReader({ async connect() { return client; } }, allow, { runtime26 });
    const result = await r.readBarcode(actor, input, signal());
    assert.equal(result.state, sourcePublished ? "FOUND" : "UNAVAILABLE");
    assert.equal(result.sku?.id ?? null, sourcePublished ? skuId : null); assert.equal(result.binding?.id ?? null, sourcePublished ? bindingId : null);
    readonly(client); client.done();
  }
  const deniedClient = new Client([begin(), identity(), { sql: /current-form:barcode-schema/, rows: [{ versions: Array.from({ length: 26 }, (_, i) => i + 1) }] }, rollback()]);
  const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target) { assert.equal(target, deniedClient); } };
  const deniedReader = new PostgresCurrentFormReader({ async connect() { return deniedClient; } }, { async authorize() { return { kind: "halls", hallIds: [foreignHall] }; } }, { runtime26 });
  await assert.rejects(deniedReader.readBarcode(actor, input, signal()), { code: "FORBIDDEN" }); deniedClient.done();
});

test("current forms exact26: exact complete own-data 1..26 and explicit proof are both required; no prefix or legacy fallback", async () => {
  const exact = () => Array.from({ length: 26 }, (_, i) => i + 1), hole = exact(), accessor = exact(), extra = exact();
  delete hole[3]; Object.defineProperty(accessor, "3", { enumerable: true, get() { throw Error("Schema accessor must not run"); } });
  Object.assign(extra, { unreviewed: true });
  const invalid: unknown[] = [exact().slice(0, 19), exact().slice(0, 25), [...exact(), 27], exact().filter(v => v !== 12),
    [...exact().slice(0, 25), 25], hole, accessor, extra];
  for (const versions of invalid) {
    const client = new Client([begin(), identity(), { sql: /current-form:barcode-schema/, rows: [{ versions }], rawRows: true }, rollback()]);
    const runtime26: NativeRuntime26Capability = { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", async assertReady(target) { assert.equal(target, client); } };
    const r = new PostgresCurrentFormReader({ async connect() { return client; } }, allow, { runtime26 });
    await assert.rejects(r.readBarcode(actor, { context: { ...context, warehouseId: sid("warehouse", 1201) }, barcode: "000123" }, signal()), { code: "CURRENT_FORM_READ_UNAVAILABLE" });
    assert.ok(!client.calls.some(call => /barcode-warehouses|current-form:barcode \*\//.test(call.sql))); client.done();
  }
  const legacy = new Client([begin(), identity(), { sql: /current-form:barcode-schema/, rows: [{ versions: exact() }] }, rollback()]);
  await assert.rejects(reader(legacy).readBarcode(actor, { context: { ...context, warehouseId: sid("warehouse", 1201) }, barcode: "000123" }, signal())); legacy.done();
});

test("current forms exact26: invalid, boolean, foreign-client or revoked proof fails closed with original transaction cleanup", async () => {
  const pool = { async connect() { throw Error("Constructor must not borrow"); } };
  for (const runtime26 of [null, { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", assertReady: async () => {}, extra: true },
    { profile: "EXACT26", contract: "NATIVE_RUNTIME26_V1", get assertReady() { throw Error("Capability accessor must not run"); } }])
    assert.throws(() => new PostgresCurrentFormReader(pool, allow, { runtime26: runtime26 as never }), /Exact26 independently verified runtime capability/);
  for (const phase of ["boolean", "foreign", "revoked-in-snapshot"] as const) {
    const client = new Client(phase === "revoked-in-snapshot" ? [begin(), rollback()] : []); let assertions = 0;
    const failure = Error("SYNTHETIC live proof rejected");
    const runtime26 = { profile: "EXACT26" as const, contract: "NATIVE_RUNTIME26_V1" as const, async assertReady(target: object) {
      assertions++; if (phase === "boolean") return false;
      if (phase === "foreign" || assertions === 2) { assert.equal(target, client); throw failure; }
    } };
    const r = new PostgresCurrentFormReader({ async connect() { return client; } }, allow, { runtime26: runtime26 as NativeRuntime26Capability });
    await assert.rejects(r.readProducts(actor, { ...search, context }, signal()), phase === "boolean" ? /without a boolean substitute/ : error => error === failure);
    assert.ok(!client.calls.some(call => /current-form:identity|current-form:count|current-form:page/.test(call.sql)));
    assert.equal(client.releases[0], phase === "revoked-in-snapshot" ? undefined : phase === "boolean" ? client.releases[0] : failure);
    if (phase === "boolean") assert.ok(client.releases[0] instanceof TypeError);
    client.done();
  }
});
test('customer recommendation joins authorized hall once and keeps exact native identity',async()=>{
 const ids=[sid('customer',2101),sid('customer',2102)];
 const client=new Client([begin(),identity(),selectedHall(),total('2',(values,sql)=>{assert.deepEqual(values,['',hall]);assert.match(sql,/JOIN naijue_erp.hall selected_hall ON selected_hall.id=\$2::uuid AND selected_hall.enabled/);assert.match(sql,/r.enabled/);}),
  page(ids.map((id,i)=>item({id,name:'相同名字',code:'C'+i,hall_id:null,hall_name:null,is_recommended:i===1})),(values,sql)=>{assert.deepEqual(values,['',hall,20,0]);assert.match(sql,/r.id=selected_hall.default_customer_id/);assert.match(sql,/ORDER BY is_recommended DESC/);}),commit()]);
 const result=await reader(client).readSalesReferences(actor,reference('customer'),signal());assert.equal(result.recommendationAvailability,'AVAILABLE');assert.deepEqual(result.items.map(x=>[x.id,x.isRecommended]),[[ids[0],false],[ids[1],true]]);client.done();readonly(client);
});

test('default warehouse read: real current-hall ID recommendation keeps nondefault same-name candidates',async()=>{
 const ids=[sid('warehouse',3101),sid('warehouse',3102)];const client=new Client([begin(),identity(),selectedHall(),total('2'),page(ids.map((id,i)=>item({id,name:'同名仓库',is_recommended:i===1}))),commit()]);
 const result=await reader(client).readSalesReferences(actor,reference('warehouse'),signal());
 assert.equal(result.recommendationAvailability,'AVAILABLE');assert.deepEqual(result.items.map(x=>[x.id,x.isRecommended]),[[ids[0],false],[ids[1],true]]);assert.equal(result.items.length,2);
 const sql=client.calls.find(c=>/current-form:page/.test(c.sql))!;assert.match(sql.sql,/COALESCE\(r.id=h.default_sales_warehouse_id,FALSE\) AS is_recommended/);assert.match(sql.sql,/ORDER BY is_recommended DESC, r.name COLLATE "C", r.id/);assert.deepEqual(sql.values,['',hall,20,0]);readonly(client);client.done();
});

test('default warehouse read: no eligible default never invents a fallback and preserves search pagination',async()=>{
 const warehouse=sid('warehouse',3110),query={...reference('warehouse'),search:'仓_%',page:2};
 const client=new Client([begin(),identity(),selectedHall(),total('21',(values,sql)=>{assert.deepEqual(values,['仓_%',hall]);assert.match(sql,/r.enabled AND h.enabled AND r.hall_id = \$2::uuid AND strpos\(lower\(r.name\), lower\(\$1::text\)\) > 0/);assert.ok(!sql.includes('default_sales_warehouse_id'));}),page([item({id:warehouse,is_recommended:false})],(values,sql)=>{assert.deepEqual(values,['仓_%',hall,20,20]);assert.match(sql,/COALESCE\(r.id=h.default_sales_warehouse_id,FALSE\)/);assert.ok(!/OR r.id|OR h.default_sales_warehouse_id/.test(sql));}),commit()]);
 const result=await reader(client).readSalesReferences(actor,query,signal());assert.equal(result.exactTotal,21n);assert.equal(result.page,2);assert.deepEqual(result.items.map(x=>[x.id,x.isRecommended]),[[warehouse,false]]);assert.equal(result.recommendationAvailability,'AVAILABLE');client.done();readonly(client);
});
test('default warehouse read: wrong hall grant or unknown recommendation cannot become a warehouse recommendation',async()=>{
 const unauthorized=new Client([begin(),identity(),rollback()]);await assert.rejects(reader(unauthorized,{async authorize(){return {kind:'halls',hallIds:[foreignHall]};}}).readSalesReferences(actor,reference('warehouse'),signal()),{code:'FORBIDDEN'});unauthorized.done();
 for(const is_recommended of [null,'true',undefined]){
  const client=new Client([begin(),identity(),selectedHall(),total(),page([item({id:sid('warehouse',3111),is_recommended})]),rollback()]);await assert.rejects(reader(client).readSalesReferences(actor,reference('warehouse'),signal()),{code:'INVALID_DATABASE_VALUE'});client.done();readonly(client);
 }
});
