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
const parameters = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null }, page: 1, pageSize: 20 });
const scope: SalesReadScope = { kind: "restricted", clauses: [{ hallId: ids.hall, warehouseId: ids.warehouse }, { createdByAccountId: ids.account }] };
const read = <P>(parameters: P, granted = scope, signal = new AbortController().signal) => ({ actor, scope: granted, parameters, signal });
const reader = (client: ProtocolClient) => new PostgresSalesQueryReader({ async connect() { return client; } });
const time = "2026-10-20T12:00:00.000000Z";
const header = () => ({ id: ids.sales, number: "SYNTHETIC-ONLY", business_type: "SALE", business_date: "2026-10-20", hall_id: ids.hall,
  customer_id: ids.customer, salesperson_id: null, warehouse_id: ids.warehouse, status: "DRAFT", version: 1, gross_amount: "90071992547409.93", order_discount: "0.00", net_due: "90071992547409.93",
  note: null, created_by_account_id: ids.account, created_hall_id: ids.hall, created_at: time, updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER", hall_name: "SYNTHETIC HALL", warehouse_name: "SYNTHETIC WAREHOUSE", customer_name: "SYNTHETIC CUSTOMER", salesperson_name: null });
const summary = () => ({ ...header(), hall_name: "SYNTHETIC HALL", warehouse_name: "SYNTHETIC WAREHOUSE", customer_name: "SYNTHETIC CUSTOMER", salesperson_name: null });
const quantities = (salesId: string = ids.sales, quantity = "9007199254740993", incoming = "0", outgoing = "9007199254740993") =>
  ({ sales_id: salesId, quantity, incoming_quantity: incoming, outgoing_quantity: outgoing });
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
test("sales query pg protocol: exact count, relational page and one page-batched quantity read share scoped RR snapshot, no hydration/catalog/N+1", async () => {
  const input = parameters(); Object.assign(input, { page: 2, pageSize: 50 }); Object.assign(input.filter, { startDate: "2026-10-01", endDate: "2026-10-20", statuses: ["DRAFT", "APPROVED"], businessTypes: ["RETURN", "EXCHANGE"], hallIds: [ids.hall, sid("hall", 47)],
    salespersonIds: [sid("staff", 44), sid("staff", 45)], customerIds: [ids.customer, sid("customer", 46)], warehouseIds: [ids.warehouse, sid("warehouse", 48)], number: "%_\\' OR TRUE" });
  const seen: unknown[][] = [];
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT\(\*\)::text/, rows: [{ exact_total: "9007199254740993" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.business_date >= \$4 AND h.business_date <= \$5 AND h.status = ANY\(\$6::text\[\]\) AND h.business_type = ANY\(\$7::text\[\]\)/);
    assert.match(sql, /AND h.hall_id = ANY\(\$8::uuid\[\]\) AND h.salesperson_id = ANY\(\$9::uuid\[\]\) AND h.customer_id = ANY\(\$10::uuid\[\]\) AND h.warehouse_id = ANY\(\$11::uuid\[\]\)/);
    assert.deepEqual(values.slice(5, 11), [input.filter.statuses, input.filter.businessTypes, input.filter.hallIds, input.filter.salespersonIds, input.filter.customerIds, input.filter.warehouseIds]);
    assert.match(sql, /strpos\(lower\(h.number\), lower\(\$12\)\) > 0/); assert.ok(!sql.includes("OR TRUE")); seen.push([...values]);
  } }, { sql: /^SELECT h.id/, rows: [summary()], inspect(values, sql) {
    scoped(values, sql); assert.deepEqual(values.slice(0, -2), seen[0]); assert.deepEqual(values.slice(-2), [50, "50"]);
    assert.match(sql, /ORDER BY h.updated_at DESC, h.number COLLATE "C" ASC, h.id ASC LIMIT \$13 OFFSET \$14::bigint/);
    assert.ok(!/sales_line|sales_settlement|naijue_erp.product|FOR UPDATE/.test(sql));
  } }, { sql: /^SELECT page.id AS sales_id/, rows: [quantities()], inspect(values, sql) {
    assert.deepEqual(values, [[ids.sales]]); assert.match(sql, /FROM unnest\(\$1::uuid\[\]\) AS page\(id\) LEFT JOIN naijue_erp.sales_line l/);
    assert.match(sql, /ON l.sales_id = page.id AND l.is_current AND NOT l.is_gift GROUP BY page.id$/);
    assert.match(sql, /SUM\(l.quantity::numeric\)/); assert.match(sql, /WHEN l.quantity < 0 THEN -\(l.quantity::numeric\)/);
    assert.match(sql, /WHEN l.quantity > 0 THEN l.quantity::numeric/); assert.ok(!/product|sku|line_amount|LIMIT|OFFSET/.test(sql));
  } }, commit()]);
  const result = await reader(client).readList(read(input)); assert.equal(result.exactTotal, 9007199254740993n); assert.equal(result.items[0]!.netDue, 9007199254740993n);
  assert.equal(result.items[0]!.quantity, 9007199254740993n); assert.equal(result.items[0]!.incomingQuantity, 0n); assert.equal(result.items[0]!.outgoingQuantity, 9007199254740993n);
  assert.equal(result.items[0]!.updatedAt, time); assert.equal(client.calls.length, 5); assert.ok(client.calls.every(call => !/INSERT|UPDATE|DELETE|pg_advisory/.test(call.sql))); client.done();
});
test("sales query pg protocol: count and page use case-insensitive literal number inclusion with original bound text, never LIKE wildcards", async () => {
  for (const number of ["synthetic", "SyNtHeTiC_%\\", "%'_\\ OR TRUE"]) {
    const input = parameters(); Object.assign(input.filter, { number });
    const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect(values, sql) {
      scoped(values, sql); assert.deepEqual(values.slice(3), [number]);
      assert.match(sql, /strpos\(lower\(h.number\), lower\(\$4\)\) > 0$/);
      assert.doesNotMatch(sql, /\bI?LIKE\b|OR TRUE/);
    } }, { sql: /^SELECT h.id/, rows: [], inspect(values, sql) {
      scoped(values, sql); assert.deepEqual(values.slice(3), [number, 20, "0"]);
      assert.match(sql, /strpos\(lower\(h.number\), lower\(\$4\)\) > 0/);
      assert.doesNotMatch(sql, /\bI?LIKE\b|OR TRUE/);
    } }, commit()]);
    const result = await reader(client).readList(read(input)); assert.equal(result.exactTotal, 0n); assert.deepEqual(result.items, []); client.done();
  }
});
test("sales query pg protocol: list pages use updated time then binary business number and native identity, never business date", async () => {
  const salesIds = [sid("sales", 812), sid("sales", 811), sid("sales", 813), sid("sales", 814)];
  const rows = salesIds.map((salesId, index) => ({ ...summary(), id: salesId,
    number: ["SYNTHETIC-Z", "SYNTHETIC-A", "SYNTHETIC-A", "SYNTHETIC-B"][index],
    updated_at: index === 0 ? "2026-10-20T13:00:00.000000Z" : time,
    business_date: index === 0 ? "2026-09-01" : "2026-10-20" }));
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "24" }] },
    { sql: /^SELECT h.id/, rows, inspect(values, sql) {
      assert.match(sql, /ORDER BY h.updated_at DESC, h.number COLLATE "C" ASC, h.id ASC LIMIT \$4 OFFSET \$5::bigint$/);
      assert.doesNotMatch(sql, /ORDER BY h.business_date/); assert.deepEqual(values.slice(-2), [20, "20"]);
    } }, { sql: /^SELECT page.id AS sales_id/, rows: salesIds.toReversed().map(salesId => quantities(salesId)),
      inspect(values) { assert.deepEqual(values, [salesIds]); } }, commit()]);
  const result = await reader(client).readList(read({ ...parameters(), page: 2 }));
  assert.deepEqual(result.items.map(row => row.id), salesIds); assert.equal(result.items[0]!.businessDate, "2026-09-01");
  assert.equal(result.items[0]!.updatedAt, "2026-10-20T13:00:00.000000Z"); client.done();
});
test("sales query pg protocol: one bounded batch preserves signed SALE/RETURN/EXCHANGE totals, bigint-min magnitude and gift-only zero", async () => {
  const salesIds = [ids.sales, sid("sales", 802), sid("sales", 803), sid("sales", 804)];
  const rows = salesIds.map((salesId, index) => ({ ...summary(), id: salesId, business_type: ["SALE", "RETURN", "EXCHANGE", "SALE"][index] }));
  const batches = [quantities(salesIds[0], "18446744073709551616", "0", "18446744073709551616"),
    quantities(salesIds[1], "-9223372036854775808", "9223372036854775808", "0"),
    quantities(salesIds[2], "-2", "5", "3"), quantities(salesIds[3], "0", "0", "0")];
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "4" }] }, { sql: /^SELECT h.id/, rows },
    { sql: /^SELECT page.id AS sales_id/, rows: batches.toReversed(), inspect(values) { assert.deepEqual(values, [salesIds]); } }, commit()]);
  const result = await reader(client).readList(read(parameters()));
  assert.deepEqual(result.items.map(row => [row.quantity, row.incomingQuantity, row.outgoingQuantity]),
    [[18446744073709551616n, 0n, 18446744073709551616n], [-9223372036854775808n, 9223372036854775808n, 0n], [-2n, 5n, 3n], [0n, 0n, 0n]]);
  assert.equal(client.calls.length, 5); client.done();
});
test("sales query pg protocol: incomplete, foreign, duplicate or malformed quantity facts fail closed", async () => {
  for (const aggregateRows of [[], [quantities(sid("sales", 999))], [quantities(), quantities()],
    [{ ...quantities(), quantity: undefined }], [{ ...quantities(), quantity: "01" }], [{ ...quantities(), quantity: "1.5" }],
    [{ ...quantities(), incoming_quantity: "-1" }], [{ ...quantities(), outgoing_quantity: 9007199254740993 }], [quantities(ids.sales, "1", "3", "3")]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "1" }] }, { sql: /^SELECT h.id/, rows: [summary()] },
      { sql: /^SELECT page.id AS sales_id/, rows: aggregateRows }, rollback()]);
    await assert.rejects(() => reader(client).readList(read(parameters())), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
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
  const input = parameters(); Object.assign(input, { page: 2 }); Object.assign(input.filter, { statuses: ["DRAFT"] });
  const client = new ProtocolClient([begin(), { sql: /^WITH authorized AS/, rows: [{ exact_approved_documents: "901", exact_total_accounts: "35", received: "19999999999999999.98", refunded: "1.25" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.status = ANY\(\$4::text\[\]\) AND h.status = 'APPROVED'/); assert.match(sql, /COUNT\(DISTINCT payment_account_id\)::text/); assert.ok(!/LIMIT|OFFSET|product|account_name_snapshot/.test(sql));
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
  const settlement = { id: sid("settlement", 15), sales_id: ids.sales, line_no: 1, payment_account_id: ids.payment, payment_method_id_snapshot: sid("paymentMethod", 31), direction: "RECEIVE", amount: "90071992547409.93",
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

test("sales query pg protocol: list/count and both statistics reads share identical six-dimensional authorized predicates", async () => {
  const input = parameters(); Object.assign(input.filter, { statuses: ["DRAFT", "APPROVED"], businessTypes: ["RETURN", "EXCHANGE"],
    hallIds: [sid("hall", 500), ids.hall], salespersonIds: [sid("staff", 501), sid("staff", 502)],
    customerIds: [sid("customer", 503), ids.customer], warehouseIds: [sid("warehouse", 504), ids.warehouse], number: "%_\\' literal" });
  let listWhere = ""; let filterValues: unknown[] = [];
  const listClient = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect(values, sql) {
    listWhere = sql.split(" WHERE ")[1]!; filterValues = structuredClone(values); scoped(values, sql);
    assert.equal((sql.match(/= ANY\(/g) ?? []).length, 6); assert.equal(values.length, 10);
    assert.ok(!sql.includes("500") && !sql.includes("literal"));
  } }, { sql: /^SELECT h.id/, rows: [], inspect(values, sql) {
    assert.equal(sql.split(" WHERE ")[1]!.split("\n")[0], listWhere); assert.deepEqual(values.slice(0, -2), filterValues);
  } }, commit()]);
  await reader(listClient).readList(read(input)); listClient.done(); assert.equal(listClient.calls.length, 4);
  const statsClient = new ProtocolClient([begin(), { sql: /^WITH authorized AS/, rows: [{ exact_approved_documents: "0", exact_total_accounts: "0", received: "0.00", refunded: "0.00" }], inspect(values, sql) {
    assert.ok(sql.includes(`WHERE ${listWhere} AND h.status = 'APPROVED'`)); assert.deepEqual(values, filterValues);
  } }, { sql: /^SELECT s.payment_account_id/, rows: [], inspect(values, sql) {
    assert.ok(sql.includes(`WHERE ${listWhere} AND h.status = 'APPROVED'`)); assert.deepEqual(values.slice(0, -2), filterValues);
  } }, commit()]);
  const statistics = await reader(statsClient).readSettlementStatistics(read(input)); statsClient.done(); assert.equal(statsClient.calls.length, 4);
  assert.equal(statistics.exactApprovedDocuments, 0n); assert.equal(statistics.exactTotalAccounts, 0n);
});
test("sales query pg protocol: empty selections add no filter and malformed lists never acquire a client", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect(values, sql) {
    scoped(values, sql); assert.equal(sql.split(" WHERE ")[1], "((h.hall_id = $1::uuid AND h.warehouse_id = $2::uuid) OR (h.created_by_account_id = $3::uuid))");
    assert.equal(values.length, 3); assert.doesNotMatch(sql, /ANY\(/);
  } }, { sql: /^SELECT h.id/, rows: [] }, commit()]);
  await reader(client).readList(read(parameters())); client.done();
  let acquired = 0; const direct = new PostgresSalesQueryReader({ async connect() { acquired++; throw new Error("must not acquire"); } });
  for (const method of ["readList", "readSettlementStatistics"] as const) for (const value of [null, "DRAFT", ["DRAFT", "DRAFT"], Array(1), ["UNKNOWN"]]) {
    const input = parameters(); Object.assign(input.filter, { statuses: value });
    await assert.rejects(() => direct[method](read(input)), { code: "INVALID_SALES_QUERY" });
  }
  assert.equal(acquired, 0);
});
test("sales detail pg protocol: original method identity comes only from nullable snapshot, never the account current method/name", async () => {
  for (const original of [sid("paymentMethod", 31), null]) {
    const settlement = { id: sid("settlement", 15), sales_id: ids.sales, line_no: 1, payment_account_id: ids.payment, payment_method_id_snapshot: original,
      direction: "RECEIVE", amount: "2.50", account_name_snapshot: "SYNTHETIC old account", method_name_snapshot: "SYNTHETIC old method",
      current_account_name: "SYNTHETIC current account", current_method_name: "SYNTHETIC different method" };
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.sales_line/, rows: [line()] },
      { sql: /FROM naijue_erp.sales_settlement/, rows: [settlement], inspect(_values, sql) { assert.match(sql, /s.payment_method_id_snapshot/); assert.doesNotMatch(sql, /COALESCE|pm.id AS payment_method_id_snapshot/); } }, commit()]);
    const detail = await reader(client).readDetail(read({ salesId: ids.sales })); assert.equal(detail.document.settlements[0]!.paymentMethodId, original); client.done();
  }
});

const normalSalesSummary = (overrides: Record<string, unknown> = {}) => ({ exact_total: '2', history_valid: true, history_published: true,
  quantity: null, incoming_quantity: null, outgoing_quantity: null, gross_amount: '90071992547409.94', order_discount: '0.00', net_due: '90071992547409.94', ...overrides });
const normalProduct = { product_count: '1', product_items: [{ productId: sid('product', 300), productCodeSnapshot: 'ORIGINAL', productNameSnapshot: 'ORIGINAL SNAPSHOT' }], product_has_more: false };
const normalIdentity = (role: 'ADMIN' | 'WAREHOUSE' | 'SALESPERSON' = 'ADMIN'): Step => ({ sql: /read-authorization:identity/, rows: [{ account_id: actor.accountId, staff_id: sid('staff', 301), login_enabled: true,
  role, employment_status: '在职', hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }] });
function normalSalesReader(client: ProtocolClient, proof?: () => void) {
  return new PostgresSalesQueryReader({ async connect() { return client; } }, { profile: 'source-confirmed-normal-document-lists-v1', runtime26: {
    profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(actual, purpose) { assert.equal(actual, client); assert.equal(purpose, 'HISTORY_READ'); assert.equal(client.calls[0]!.sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); proof?.(); }
  } });
}
test('normal sales union: exact same-client authorization precedes published effective count/totals and one bounded snapshot product projection', async () => {
  let proofs = 0; const input = parameters(); Object.assign(input.filter, { hallIds: [ids.hall], warehouseIds: [ids.warehouse], businessTypes: ['SALE'], number: "%_\\'literal" });
  const live = { ...summary(), dataset: 'LIVE', batch_id: null, responsible_staff_id: null, responsible_name: null, created_by_name: 'ORIGINAL LIVE', ...quantities(), ...normalProduct };
  const historical = { ...live, dataset: 'HISTORY', batch_id: sid('operation', 400), business_date: null, updated_at: null, status: 'DRAFT', version: 3,
    quantity: null, incoming_quantity: null, outgoing_quantity: null, created_by_name: null, created_local_at: null, updated_local_at: null, gross_amount: '0.01', net_due: '0.01' };
  let bound: unknown[] = [];
  const client = new ProtocolClient([begin(), normalIdentity('SALESPERSON'), { sql: /normal-document-list:totals/, rows: [normalSalesSummary()], inspect(values, sql) {
    bound = values; assert.match(sql, /UNION ALL SELECT dataset,batch_id/); assert.match(sql, /history_base AS MATERIALIZED/);
    assert.match(sql, /b\.status='IMPORTED'/); assert.match(sql, /r\.action='IMPORT_PUBLISH'/); assert.match(sql, /history_revision er/);
    assert.match(sql, /bool_and\(effective_valid IS TRUE AND lines_valid IS TRUE\)/); assert.match(sql, /IS NOT TRUE\) AS lines_valid/);
    assert.match(sql, /count\(\*\) FILTER\(WHERE is_gift IS NULL\)>0 THEN NULL/); assert.match(sql, /h\.hall_id=ANY/); assert.match(sql, /h\.warehouse_id=ANY/);
    assert.ok(values.includes("%_\\'literal")); assert.ok(!sql.includes("%_\\'literal")); assert.ok(!/naijue_erp\.product(?:\s|$)|product_category|auth_session/.test(sql));
  } }, { sql: /normal-document-list:page/, rows: [live, historical], inspect(values, sql) {
    assert.deepEqual(values.slice(0, -2), bound); assert.deepEqual(values.slice(-2), [20, '0']);
    assert.match(sql, /ORDER BY updated_at DESC NULLS LAST,id ASC,dataset ASC LIMIT/); assert.match(sql, /page_lines AS MATERIALIZED/);
    assert.match(sql, /coalesce\(product_id::text,'line:'\|\|line_id::text\)/); assert.match(sql, /FILTER\(WHERE preview_row<=3\)/);
    assert.doesNotMatch(sql, /SELECT.*FROM naijue_erp\.product\b/);
  } }, commit()]);
  const result = await normalSalesReader(client, () => proofs++).readList(read(input)); assert.ok('totals' in result);
  assert.equal(proofs, 1); assert.equal(result.exactTotal, 2n); assert.equal(result.historyCoverage, 'PUBLISHED_AUTHORIZED'); assert.equal(result.totals.quantity, null);
  assert.equal(result.totals.grossAmount, 9007199254740994n); assert.equal(result.items[0]!.quantity, 9007199254740993n);
  const h = result.items[1]!; assert.equal(h.dataset, 'HISTORY'); assert.equal(h.id, result.items[0]!.id); assert.equal(h.effectiveVersion, 3);
  assert.equal(h.updatedAt, null); assert.equal(h.businessDate, null); assert.equal(h.createdByName, null); assert.equal(h.quantity, null); assert.equal(h.status, 'DRAFT');
  assert.equal(h.productSummary.productCount, 1n); assert.equal(h.productSummary.items[0]!.productNameSnapshot, 'ORIGINAL SNAPSHOT');
  assert.equal(client.calls.length, 5); client.done();
});
test('normal sales union: corrupt effective facts and current identity reject before page; SQL error remains an error and abort rolls back', async () => {
  for (const mode of ['header-line', 'identity', 'sql', 'abort'] as const) {
    const controller = new AbortController();
    const identity = normalIdentity(); if (mode === 'identity') identity.rows![0]!.login_enabled = false;
    const steps: Step[] = [begin(), identity];
    if (mode !== 'identity') steps.push({ sql: /normal-document-list:totals/, ...(mode === 'sql' ? { error: Error('ACTUAL_SQL_FAILURE') } : { rows: [normalSalesSummary({ history_valid: mode !== 'header-line' })] }), inspect() { if (mode === 'abort') controller.abort(); } });
    steps.push(rollback()); const client = new ProtocolClient(steps);
    await assert.rejects(normalSalesReader(client).readList(read(parameters(), scope, controller.signal)));
    assert.ok(!client.calls.some(c => c.sql.includes('normal-document-list:page'))); client.done();
  }
});
test('normal sales union: zero published batches is explicit and empty exact totals are not publication proof', async () => {
  const client = new ProtocolClient([begin(), normalIdentity(), { sql: /normal-document-list:totals/, rows: [normalSalesSummary({ exact_total: '0', history_published: false, quantity: '0', incoming_quantity: '0', outgoing_quantity: '0', gross_amount: '0.00', order_discount: '0.00', net_due: '0.00' })] }, { sql: /normal-document-list:page/, rows: [] }, commit()]);
  const result = await normalSalesReader(client).readList(read(parameters())); assert.ok('totals' in result); assert.equal(result.historyCoverage, 'NOT_PUBLISHED'); assert.equal(result.totals.netDue, 0n); client.done();
});

test('normal sales union: missing original HISTORY purpose rejects on the same lease without native-only fallback', async () => {
  const client = new ProtocolClient([begin(), rollback()]);
  await assert.rejects(normalSalesReader(client, () => { throw Error('HISTORY_PURPOSE_DENIED'); }).readList(read(parameters())), /HISTORY_PURPOSE_DENIED/);
  assert.ok(!client.calls.some(c => /read-authorization:identity|normal-document-list:/.test(c.sql))); client.done();
});

test('normal sales pushdown: both branches filter before projection, all-match totals survive page2, and history proof stays unfiltered once per RR', async () => {
  for (const role of ['ADMIN', 'WAREHOUSE', 'SALESPERSON'] as const) {
    const input = parameters(); Object.assign(input, { page: 2 });
    Object.assign(input.filter, { startDate: '2026-10-01', endDate: '2026-10-20', statuses: ['DRAFT', 'APPROVED'], businessTypes: ['RETURN', 'EXCHANGE'],
      hallIds: [ids.hall], salespersonIds: [sid('staff', 44)], customerIds: [ids.customer], warehouseIds: [ids.warehouse], number: "%_\\'literal" });
    const historical = { ...summary(), dataset: 'HISTORY', batch_id: sid('operation', 400), responsible_staff_id: null, responsible_name: null, created_by_name: null,
      business_type: 'EXCHANGE', status: 'DRAFT', quantity: '-2', incoming_quantity: '5', outgoing_quantity: '3', gross_amount: '0.01', net_due: '0.01',
      created_local_at: null, updated_local_at: null, product_count: null, product_items: [{ productId: null, productCodeSnapshot: null, productNameSnapshot: null }], product_has_more: false };
    let bound: unknown[] = [];
    const client = new ProtocolClient([begin(), normalIdentity(role), { sql: /normal-document-list:totals/, rows: [normalSalesSummary({ exact_total: '21', quantity: '9007199254740991', incoming_quantity: '5', outgoing_quantity: '9007199254740996' })], inspect(values, sql) {
      bound = values;
      const live = sql.slice(sql.indexOf('live_candidates AS'), sql.indexOf('history_base AS'));
      const history = sql.slice(sql.indexOf('history_base AS'), sql.indexOf('history_candidates AS'));
      const proof = sql.slice(sql.indexOf('history_validity AS'), sql.indexOf('all_lines AS'));
      const param = (value: unknown) => `$${values.findIndex(v => JSON.stringify(v) === JSON.stringify(value)) + 1}`;
      for (const [value, op] of [[input.filter.startDate, '>='], [input.filter.endDate, '<=']] as const) {
        assert.ok(live.includes(`h.business_date${op}${param(value)}::date`));
        assert.ok(history.includes(`(CASE WHEN e.header_id IS NULL THEN h.business_date ELSE (er.after_facts->>'businessDate')::date END)${op}${param(value)}::date`));
      }
      for (const [field, selected, cast] of [['status', input.filter.statuses, 'text'], ['business_type', input.filter.businessTypes, 'text'], ['hall_id', input.filter.hallIds, 'uuid'],
        ['salesperson_id', input.filter.salespersonIds, 'uuid'], ['customer_id', input.filter.customerIds, 'uuid'], ['warehouse_id', input.filter.warehouseIds, 'uuid']] as const) {
        assert.ok(live.includes(`h.${field}=ANY(${param(selected)}::${cast}[])`));
        assert.ok(history.includes(`h.${field === 'status' ? 'source_status' : field}=ANY(${param(selected)}::${cast}[])`));
      }
      for (const branch of [live, history]) assert.ok(branch.includes(`strpos(lower(h.number),lower(${param(input.filter.number)}::text))>0`));
      assert.doesNotMatch(proof, /ANY\(|strpos\(|business_date[<>]=/);
      assert.match(proof, /IS NOT TRUE\) AS lines_valid/); assert.match(sql, /FROM history_validity\) AS history_valid/);
      scoped(values, live); assert.equal(history.includes('AND (h.hall_id='), role === 'SALESPERSON');
      assert.match(sql, /all_lines AS \(SELECT[^]*FROM matched p/); assert.match(sql, /FROM matched h LEFT JOIN metrics q/);
      assert.doesNotMatch(sql, /LIMIT|OFFSET|product_summaries|JOIN naijue_erp\.sku/);
      assert.match(sql, /sum\(h.net_due::numeric\)/); assert.match(sql, /WHEN NOT is_gift AND quantity<0 THEN -quantity/);
    } }, { sql: /normal-document-list:page/, rows: [historical], inspect(values, sql) {
      assert.deepEqual(values.slice(0, -2), bound); assert.deepEqual(values.slice(-2), [20, '20']);
      assert.doesNotMatch(sql, /history_validity AS|AS lines_valid/);
      assert.match(sql, /page_lines AS MATERIALIZED \(SELECT[^]*FROM page_headers p JOIN naijue_erp.sales_line/);
      assert.match(sql, /FROM page_headers p JOIN naijue_erp.history_sales_line/);
      assert.match(sql, /FILTER\(WHERE preview_row<=3\)/);
    } }, commit()]);
    const result = await normalSalesReader(client).readList(read(input)); assert.ok('totals' in result);
    assert.equal(result.exactTotal, 21n); assert.equal(result.items.length, 1); assert.equal(result.items[0]!.quantity, -2n);
    assert.equal(result.items[0]!.productSummary.productCount, null); assert.equal(result.totals.quantity, 9007199254740991n);
    assert.equal(result.totals.grossAmount, 9007199254740994n); assert.equal(result.items[0]!.grossAmount, 1n); client.done();
  }
});
