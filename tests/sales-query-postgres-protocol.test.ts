/** Scripted pg protocol tests only: no PostgreSQL parser, locks, server, database or credentials. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresSalesQueryReader, SALES_DETAIL_MAX_CURRENT_LINES } from "../adapters/postgres/src/sales-query-reader.ts";
import type { PgSalesQueryClient, PgSalesQueryResult } from "../adapters/postgres/src/sales-query-reader.ts";
import type { SalesListQuery, SalesReadScope } from "../packages/application/src/sales-query-ports.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";

interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class ProtocolClient implements PgSalesQueryClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected protocol call ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const parameters = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null, hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null }, page: 1, pageSize: 20 });
const scope: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.hall, warehouseId: ids.warehouse }, { createdByAccountId: ids.account }] };
const read = <P>(parameters: P, granted = scope, signal = new AbortController().signal) => ({ actor, scope: granted, parameters, signal });
const reader = (client: ProtocolClient) => new PostgresSalesQueryReader({ async connect() { return client; } });
const time = "2026-10-20T12:00:00.000000Z";
const header = () => ({ id: ids.sales, number: "SYNTHETIC-ONLY", business_type: "SALE", business_date: "2026-10-20", hall_id: ids.hall,
  customer_id: ids.customer, salesperson_id: null, warehouse_id: ids.warehouse, status: "DRAFT", version: 1, gross_amount: "90071992547409.93", order_discount: "0.00", net_due: "90071992547409.93",
  note: null, created_by_account_id: ids.account, created_hall_id: ids.hall, created_at: time, updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER", hall_name: "SYNTHETIC HALL", warehouse_name: "SYNTHETIC WAREHOUSE", customer_name: "SYNTHETIC CUSTOMER", salesperson_name: null });
const summary = () => ({ ...header(), hall_name: "SYNTHETIC HALL", warehouse_name: "SYNTHETIC WAREHOUSE", customer_name: "SYNTHETIC CUSTOMER", salesperson_name: null });
const line = () => ({ id: ids.line, sales_id: ids.sales, line_no: 1, sku_id: ids.sku, quantity: "9007199254740993", reference_price: null, deal_price: "0.00", line_amount: "0.00", allocated_discount: "0.00",
  is_gift: false, pricing_rule: null, discount_tenths: null, zero_confirmed: null, product_code_snapshot: "SYNTHETIC", product_name_snapshot: "SYNTHETIC", color_name_snapshot: "SYNTHETIC", fit_name_snapshot: "SYNTHETIC", size_name_snapshot: "SYNTHETIC", barcode_snapshot: null, is_current: true });
function scoped(values: unknown[], sql: string) {
  assert.deepEqual(values.slice(0, 3), [ids.hall, ids.warehouse, ids.account]);
  assert.match(sql, /\(\(h.hall_id = \$1::uuid AND h.warehouse_id = \$2::uuid\) OR \(h.created_by_account_id = \$3::uuid\)\)/);
}
test("sales query pg protocol: mandatory pool never connects at construction; no aborted or invalid-scope connection", async () => {
  assert.throws(() => new PostgresSalesQueryReader(undefined as never), /explicit PostgreSQL pool/);
  let calls = 0; const r = new PostgresSalesQueryReader({ async connect() { calls++; throw new Error("Must not connect"); } }); assert.equal(calls, 0);
  await assert.rejects(() => r.readList(read(parameters(), { kind: "restricted", clauses: [] })), { code: "FORBIDDEN" });
  const controller = new AbortController(); controller.abort(); await assert.rejects(() => r.readList(read(parameters(), scope, controller.signal)), { code: "SALES_READ_ABORTED" }); assert.equal(calls, 0);
});
test("sales query pg protocol: exact count and relational page share scoped RR snapshot, no hydration/catalog/N+1", async () => {
  const input = parameters(); Object.assign(input, { page: 2, pageSize: 50 }); Object.assign(input.filter, { startDate: "2026-10-01", endDate: "2026-10-20", status: "DRAFT", businessType: "EXCHANGE", hallId: ids.hall,
    salespersonId: sid("staff", 44), customerId: ids.customer, warehouseId: ids.warehouse, number: "%_\\' OR TRUE" });
  const seen: unknown[][] = [];
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT\(\*\)::text/, rows: [{ exact_total: "9007199254740993" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.business_date >= \$4 AND h.business_date <= \$5 AND h.status = \$6 AND h.business_type = \$7/);
    assert.match(sql, /strpos\(h.number, \$12\) > 0/); assert.ok(!sql.includes("OR TRUE")); seen.push([...values]);
  } }, { sql: /^SELECT h.id/, rows: [summary()], inspect(values, sql) {
    scoped(values, sql); assert.deepEqual(values.slice(0, -2), seen[0]); assert.deepEqual(values.slice(-2), [50, "50"]);
    assert.match(sql, /ORDER BY h.business_date DESC, h.id DESC LIMIT \$13 OFFSET \$14::bigint/);
    assert.ok(!/sales_line|sales_settlement|naijue_erp.product|FOR UPDATE/.test(sql));
  } }, commit()]);
  const result = await reader(client).readList(read(input)); assert.equal(result.exactTotal, 9007199254740993n); assert.equal(result.items[0]!.netDue, 9007199254740993n);
  assert.equal(client.calls.length, 4); assert.ok(client.calls.every(call => !/INSERT|UPDATE|DELETE|pg_advisory/.test(call.sql))); client.done();
});
test("sales query pg protocol: empty out-of-range page retains exact total without global recount or fallback", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "15" }] }, { sql: /^SELECT h.id/, rows: [] }, commit()]);
  const result = await reader(client).readList(read({ ...parameters(), page: 9 })); assert.equal(result.exactTotal, 15n); assert.deepEqual(result.items, []); client.done();
});
test("sales query pg protocol: detail reads authorized native header/current snapshots/settlements in three bounded reads", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()], inspect: scoped },
    { sql: /FROM naijue_erp.sales_line/, rows: [line()], inspect(values, sql) { assert.deepEqual(values, [ids.sales, SALES_DETAIL_MAX_CURRENT_LINES + 1]); assert.match(sql, /WHERE sales_id = \$1 AND is_current ORDER BY line_no, id LIMIT \$2/); } },
    { sql: /FROM naijue_erp.sales_settlement/, rows: [], inspect(_values, sql) { assert.match(sql, /LIMIT 4$/); } }, commit()]);
  const result = await reader(client).readDetail(read({ salesId: ids.sales })); assert.equal(result.document.lines[0]!.quantity, 9007199254740993n); assert.equal(result.document.lines[0]!.pricingRule, null);
  assert.equal(result.document.lines[0]!.zeroConfirmed, null); assert.equal(result.stockBasis, "RUNTIME_LEDGER"); assert.equal(client.calls.length, 5); client.done();
});
test("sales query pg protocol: hidden/missing detail and history rollback without reading child facts", async () => {
  for (const kind of ["readDetail", "readHistory"] as const) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [], inspect: scoped }, rollback()]);
    await assert.rejects(() => kind === "readDetail" ? reader(client).readDetail(read({ salesId: ids.sales }))
      : reader(client).readHistory(read({ salesId: ids.sales, page: 1, pageSize: 20 as const })), { code: "DOCUMENT_NOT_FOUND" }); assert.equal(client.calls.length, 3); client.done();
  }
});
test("sales query pg protocol: oversized detail fails closed rather than truncating current lines", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.sales_line/, rows: Array.from({ length: SALES_DETAIL_MAX_CURRENT_LINES + 1 }, line) }, rollback()]);
  await assert.rejects(() => reader(client).readDetail(read({ salesId: ids.sales })), { code: "SALES_READ_TOO_LARGE" }); client.done();
});
test("sales query pg protocol: audit metadata exact count/page reapply current scope and SALES kind with stable tie-break", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [{ id: ids.sales }], inspect: scoped },
    { sql: /^SELECT COUNT/, rows: [{ exact_total: "81" }], inspect(values, sql) { scoped(values, sql); assert.match(sql, /a.object_type = 'SALES' AND/); assert.equal(values[3], ids.sales); } },
    { sql: /^SELECT a.id/, rows: [{ id: sid("audit", 90), operation_id: sid("operation", 91), actor_account_id: ids.account, action: "UNAPPROVE", occurred_at: time, old_version: 2, new_version: 3 }], inspect(values, sql) {
      scoped(values, sql); assert.match(sql, /ORDER BY a.occurred_at DESC, a.id DESC LIMIT/); assert.ok(!/before_values|after_values|request_hash/.test(sql)); assert.deepEqual(values.slice(-2), [20, "20"]);
    } }, commit()]);
  const result = await reader(client).readHistory(read({ salesId: ids.sales, page: 2, pageSize: 20 as const })); assert.equal(result.exactTotal, 81n); assert.equal(result.items[0]!.oldVersion, 2); client.done();
});
test("sales query pg protocol: settlement summary includes approved full scope only and exact unbounded numeric sums, account page separately", async () => {
  const input = parameters(); Object.assign(input, { page: 2 }); Object.assign(input.filter, { status: "DRAFT" });
  const client = new ProtocolClient([begin(), { sql: /^WITH authorized AS/, rows: [{ exact_approved_documents: "901", exact_total_accounts: "35", received: "19999999999999999.98", refunded: "1.25" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.status = \$4 AND h.status = 'APPROVED'/); assert.match(sql, /COUNT\(DISTINCT payment_account_id\)::text/); assert.ok(!/LIMIT|OFFSET|product|account_name_snapshot/.test(sql));
  } }, { sql: /^SELECT s.payment_account_id/, rows: [{ payment_account_id: ids.payment, received: "2.50", refunded: "0.00" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.status = 'APPROVED'/); assert.match(sql, /GROUP BY s.payment_account_id ORDER BY s.payment_account_id LIMIT/); assert.deepEqual(values.slice(-2), [20, "20"]);
  } }, commit()]);
  const result = await reader(client).readSettlementStatistics(read(input)); assert.equal(result.received, 1999999999999999998n); assert.equal(result.refunded, 125n); assert.equal(result.exactApprovedDocuments, 901n);
  assert.equal(result.exactTotalAccounts, 35n); assert.equal(result.accounts[0]!.received, 250n); client.done();
});
test("sales query pg protocol: decoding failure rolls back, unknown commit outcome is not retried and discards client", async () => {
  const invalid = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: 4 }] }, rollback()]);
  await assert.rejects(() => reader(invalid).readList(read(parameters())), { code: "INVALID_DATABASE_VALUE" }); assert.equal(invalid.releases[0], undefined); invalid.done();
  const failure = new Error("SYNTHETIC lost commit response");
  const uncertain = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }] }, { sql: /^SELECT h.id/, rows: [] }, { sql: /^COMMIT$/, error: failure }, rollback()]);
  await assert.rejects(() => reader(uncertain).readList(read(parameters())), error => error === failure); assert.equal(uncertain.releases[0], failure); uncertain.done();
});
test("sales query pg protocol: begin/connect/rollback errors release or discard correctly; no hidden retries", async () => {
  const failure = new Error("SYNTHETIC begin failure"); const beginFailure = new ProtocolClient([{ sql: /^BEGIN/, error: failure }]);
  await assert.rejects(() => reader(beginFailure).readList(read(parameters())), error => error === failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const rollbackFailure = new Error("SYNTHETIC rollback failure"); const broken = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]);
  await assert.rejects(() => reader(broken).readList(read(parameters())), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure); assert.equal(broken.releases[0], rollbackFailure); broken.done();
  let connects = 0; await assert.rejects(() => new PostgresSalesQueryReader({ async connect() { connects++; throw failure; } }).readList(read(parameters())), error => error === failure); assert.equal(connects, 1);
});
test("sales query pg protocol: abort while SQL is in flight requests rollback and stops remaining reads", async () => {
  const controller = new AbortController(); const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect() { controller.abort(); } }, rollback()]);
  await assert.rejects(() => reader(client).readList(read(parameters(), scope, controller.signal)), { code: "SALES_READ_ABORTED" }); client.done();
});

test("sales filter references pg protocol: all four kinds query only observed authorized references including disabled history", async () => {
  for (const [kind, table, column, entityKind] of [["hall", "hall", "hall_id", "hall"], ["salesperson", "staff", "salesperson_id", "staff"],
    ["customer", "customer", "customer_id", "customer"], ["warehouse", "warehouse", "warehouse_id", "warehouse"]] as const) {
    const referenceId = sid(entityKind, 801); const search = "%_\\' OR TRUE"; let countValues: unknown[] = [];
    const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "1" }], inspect(values, sql) {
      scoped(values, sql); countValues = [...values]; assert.deepEqual(values, [ids.hall, ids.warehouse, ids.account, search]);
      assert.ok(sql.includes(`FROM naijue_erp.${table} r WHERE EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE`));
      assert.ok(sql.includes(`AND h.${column} = r.id)`)); assert.match(sql, /strpos\(r.name, \$4\) > 0/);
      assert.equal(sql.includes("strpos(r.code, $4) > 0"), kind === "customer");
      assert.ok(!/enabled|employment_status|r.role|user_account|OR TRUE|LIMIT|OFFSET/.test(sql));
    } }, { sql: /^SELECT r.id, r.name AS label/, rows: [{ id: referenceId, label: "SYNTHETIC full historical label" }], inspect(values, sql) {
      scoped(values, sql); assert.deepEqual(values.slice(0, -2), countValues); assert.deepEqual(values.slice(-2), [20, "0"]);
      assert.match(sql, /ORDER BY r.name COLLATE "C", r.id LIMIT \$5 OFFSET \$6::bigint$/);
      assert.ok(!/enabled|employment_status|product|sales_line|sales_settlement/.test(sql));
    } }, commit()]);
    const result = await reader(client).readReferences(read({ kind, search, page: 1, pageSize: 20 as const }));
    assert.deepEqual(result, { page: 1, exactTotal: 1n, items: [{ id: referenceId, label: "SYNTHETIC full historical label" }] });
    assert.equal(client.calls.length, 4); client.done();
  }
});
test("sales filter references pg protocol: bigint totals, bounded page and exact empty out-of-range semantics", async () => {
  const rows = Array.from({ length: 20 }, (_, n) => ({ id: sid("customer", 1000 + n), label: `SYNTHETIC ${n}` }));
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "9007199254740993" }] },
    { sql: /^SELECT r.id/, rows, inspect(values) { assert.deepEqual(values.slice(-2), [20, "40"]); } }, commit()]);
  const result = await reader(client).readReferences(read({ kind: "customer", search: "", page: 3, pageSize: 20 as const }));
  assert.equal(result.exactTotal, 9007199254740993n); assert.equal(result.items.length, 20); client.done();
  const empty = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "15" }] }, { sql: /^SELECT r.id/, rows: [] }, commit()]);
  assert.deepEqual(await reader(empty).readReferences(read({ kind: "hall", search: "", page: 2, pageSize: 20 as const })), { page: 2, exactTotal: 15n, items: [] }); empty.done();
});
test("sales filter references pg protocol: invalid request/grant/abort never connects, malformed provider facts roll back", async () => {
  let connects = 0; const r = new PostgresSalesQueryReader({ async connect() { connects++; throw new Error("Must not connect"); } });
  const input = { kind: "hall", search: "", page: 1, pageSize: 20 } as const;
  await assert.rejects(() => r.readReferences(read({ ...input, role: "ADMIN" } as never)), { code: "INVALID_SALES_QUERY" });
  await assert.rejects(() => r.readReferences(read(input, { kind: "restricted", clauses: [] })), { code: "FORBIDDEN" });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => r.readReferences(read(input, scope, controller.signal)), { code: "SALES_READ_ABORTED" }); assert.equal(connects, 0);
  for (const rows of [[], [{ id: "invalid", label: "SYNTHETIC" }], [{ id: ids.hall, label: " " }]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "1" }] }, { sql: /^SELECT r.id/, rows }, rollback()]);
    await assert.rejects(() => reader(client).readReferences(read(input)), error => ["INVALID_DATABASE_VALUE", "INVALID_ID"].includes((error as { code: string }).code)); client.done();
  }
  const duplicate = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "2" }] }, { sql: /^SELECT r.id/, rows: [{ id: ids.hall, label: "ONE" }, { id: ids.hall, label: "TWO" }] }, rollback()]);
  await assert.rejects(() => reader(duplicate).readReferences(read(input)), { code: "INVALID_DATABASE_VALUE" }); duplicate.done();
});
test("sales detail pg protocol: current master labels and authoritative settlement snapshots share the one authorized RR snapshot", async () => {
  const settlement = { id: sid("settlement", 15), sales_id: ids.sales, line_no: 1, payment_account_id: ids.payment, direction: "RECEIVE", amount: "90071992547409.93",
    account_name_snapshot: "SYNTHETIC original account", method_name_snapshot: "SYNTHETIC original method", current_account_name: "SYNTHETIC renamed account", current_method_name: "SYNTHETIC renamed method" };
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [{ ...header(), salesperson_id: sid("staff", 444), salesperson_name: "SYNTHETIC former salesperson" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /LEFT JOIN naijue_erp.staff sp ON sp.id = h.salesperson_id/); assert.ok(!/enabled|employment_status/.test(sql));
  } }, { sql: /FROM naijue_erp.sales_line/, rows: [line()] }, { sql: /FROM naijue_erp.sales_settlement/, rows: [settlement], inspect(values, sql) {
    assert.deepEqual(values, [ids.sales]); assert.match(sql, /s.account_name_snapshot, s.method_name_snapshot/);
    assert.match(sql, /JOIN naijue_erp.payment_account pa ON pa.id = s.payment_account_id/); assert.match(sql, /JOIN naijue_erp.payment_method pm ON pm.id = pa.payment_method_id/);
    assert.match(sql, /WHERE s.sales_id = \$1 ORDER BY s.line_no, s.id LIMIT 4$/); assert.ok(!/enabled|payment_account_hall/.test(sql));
  } }, commit()]);
  const detail = await reader(client).readDetail(read({ salesId: ids.sales }));
  assert.deepEqual(detail.referenceNames, { hallName: "SYNTHETIC HALL", warehouseName: "SYNTHETIC WAREHOUSE", customerName: "SYNTHETIC CUSTOMER", salespersonName: "SYNTHETIC former salesperson" });
  assert.deepEqual(detail.settlementNames, [{ settlementId: sid("settlement", 15), paymentAccountId: ids.payment,
    accountNameSnapshot: settlement.account_name_snapshot, methodNameSnapshot: settlement.method_name_snapshot,
    currentAccountName: settlement.current_account_name, currentMethodName: settlement.current_method_name }]);
  assert.equal(detail.document.settlements[0]!.amount, 9007199254740993n); assert.equal(detail.document.settlements[0]!.id, detail.settlementNames[0]!.settlementId);
  assert.equal(client.calls.length, 5); client.done();
});
