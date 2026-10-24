/** Scripted driver protocol only. No database, SQL parser, engine locks, or real identity facts. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresTransferQueryReader, TRANSFER_DETAIL_MAX_CURRENT_LINES, TRANSFER_DETAIL_MAX_CATALOG_SKUS, TRANSFER_DETAIL_MAX_SIZE_MEMBERS } from "../adapters/postgres/src/transfer-query-reader.ts";
import type { PgTransferQueryClient, PgTransferQueryResult } from "../adapters/postgres/src/transfer-query-reader.ts";
import type { TransferListQuery, TransferReadScope } from "../packages/application/src/transfer-query-ports.ts";
import { actor, ids, sid } from "./support/synthetic-transfer.ts";

interface Step { readonly sql: RegExp; readonly rows?: readonly Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class ProtocolClient implements PgTransferQueryClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgTransferQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected call ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone([...(step.rows ?? [])]), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const parameters = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 });
const scope: TransferReadScope = { kind: "restricted", clauses: [{ fromHallId: ids.hall }, { toHallId: ids.hall }, { createdHallId: ids.hall, createdRole: "SALESPERSON" }] };
const read = <P>(parameters: P, granted: TransferReadScope = scope, signal = new AbortController().signal) => ({ actor, scope: granted, parameters, signal });
const reader = (client: ProtocolClient) => new PostgresTransferQueryReader({ async connect() { return client; } });
const time = "2026-10-20T12:00:00.000000Z";
const header = () => ({ id: ids.transfer, number: "SYNTHETIC-ONLY", business_date: "2026-10-20", from_warehouse_id: ids.fromWarehouse, to_warehouse_id: ids.toWarehouse,
  status: "DRAFT", version: 1, note: null, created_by_account_id: ids.account, created_hall_id: ids.hall, created_role: "SALESPERSON", created_at: time,
  updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER", from_warehouse_name: "SYNTHETIC CURRENT SOURCE",
  to_warehouse_name: "SYNTHETIC CURRENT DESTINATION", from_hall_name: "SYNTHETIC CURRENT SOURCE HALL", to_hall_name: "SYNTHETIC CURRENT DESTINATION HALL", created_by_name: "SYNTHETIC CURRENT CREATOR", approved_by_name: null });
const line = () => ({ id: ids.line, transfer_id: ids.transfer, line_no: 1, sku_id: ids.sku, quantity: "9007199254740993", product_code_snapshot: "SYNTHETIC OLD CODE",
  product_name_snapshot: "SYNTHETIC OLD PRODUCT", color_name_snapshot: "SYNTHETIC OLD COLOR", fit_name_snapshot: "SYNTHETIC OLD FIT", size_name_snapshot: "SYNTHETIC OLD SIZE", barcode_snapshot: "001234560000", is_current: true });
const catalogIds = { product: sid("product", 301), color: sid("color", 302), fit: sid("fit", 303), size: sid("size", 304), size2: sid("size", 305), size3: sid("size", 306), group: sid("sizeGroup", 307) };
const sku = () => ({ sku_id: ids.sku, product_id: catalogIds.product, product_code: "CURRENT-CODE", product_name: "SYNTHETIC CURRENT PRODUCT", color_id: catalogIds.color,
  color_name: "SYNTHETIC CURRENT COLOR", fit_id: catalogIds.fit, fit_name: "SYNTHETIC CURRENT FIT", size_id: catalogIds.size, size_group_id: catalogIds.group });
const member = () => ({ size_group_id: catalogIds.group, group_code: "GROUP", group_name: "SYNTHETIC CURRENT GROUP", size_id: catalogIds.size,
  size_code: null, size_name: "SYNTHETIC CURRENT SIZE", display_order: -1 });
const catalogSteps = (): Step[] => [{ sql: /^SELECT s.id AS sku_id/, rows: [sku(), { ...sku(), sku_id: ids.sku2, size_id: catalogIds.size2 }], inspect(values, sql) {
  assert.deepEqual(values, [[ids.sku], TRANSFER_DETAIL_MAX_CATALOG_SKUS + 1]); assert.match(sql, /SELECT DISTINCT product_id, color_id, fit_id/);
  assert.match(sql, /present.product_id = s.product_id AND present.color_id = s.color_id AND present.fit_id = s.fit_id/);
  assert.ok(!/inventory_balance|stock|enabled =|product_category|LATERAL/.test(sql));
} }, { sql: /^SELECT g.id AS size_group_id/, rows: [member(), { ...member(), size_id: catalogIds.size2, display_order: 0 }, { ...member(), size_id: catalogIds.size3, display_order: 1 }], inspect(values, sql) {
  assert.deepEqual(values, [[catalogIds.group], TRANSFER_DETAIL_MAX_SIZE_MEMBERS + 1]); assert.match(sql, /ORDER BY g.id, m.display_order, z.id LIMIT \$2/);
} }];
function scoped(values: unknown[], sql: string) {
  assert.deepEqual(values.slice(0, 4), [ids.hall, ids.hall, ids.hall, "SALESPERSON"]);
  assert.match(sql, /\(\(fw.hall_id = \$1::uuid\) OR \(tw.hall_id = \$2::uuid\) OR \(h.created_hall_id = \$3::uuid AND h.created_role = \$4\)\)/);
  assert.ok(!/creator.hall_id|creator.role|ca.login_name|password_hash/.test(sql));
}
test("transfer pg query: required pool is lazy; aborted, invalid-input and denied-scope reads never connect", async () => {
  assert.throws(() => new PostgresTransferQueryReader(undefined as never), /explicit PostgreSQL pool/);
  let calls = 0; const r = new PostgresTransferQueryReader({ async connect() { calls++; throw new Error("Must not connect"); } }); assert.equal(calls, 0);
  await assert.rejects(() => r.readList(read(parameters(), { kind: "restricted", clauses: [] })), { code: "FORBIDDEN" });
  await assert.rejects(() => r.readList(read({ ...parameters(), pageSize: 1000 })), { code: "INVALID_TRANSFER_QUERY" });
  const controller = new AbortController(); controller.abort(); await assert.rejects(() => r.readList(read(parameters(), scope, controller.signal)), { code: "TRANSFER_READ_ABORTED" }); assert.equal(calls, 0);
});
test("transfer pg query: count/page share scoped native relations and repeatable snapshot; values are parameterized", async () => {
  const input = parameters(); Object.assign(input, { page: 2, pageSize: 50 }); Object.assign(input.filter, { startDate: "2026-10-01", endDate: "2026-10-20", statuses: ["DRAFT", "APPROVED"],
    fromWarehouseIds: [ids.fromWarehouse, ids.toWarehouse], toWarehouseIds: [ids.toWarehouse], number: "%_\\' OR TRUE" });
  let countedValues: unknown[] = []; let countRelations = "";
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT\(\*\)::text/, rows: [{ exact_total: "9007199254740993" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.business_date >= \$5 AND h.business_date <= \$6 AND h.status = ANY\(\$7::text\[\]\) AND h.from_warehouse_id = ANY\(\$8::uuid\[\]\) AND h.to_warehouse_id = ANY\(\$9::uuid\[\]\) AND strpos\(lower\(h.number\), lower\(\$10::text\)\) > 0/);
    countedValues = [...values]; countRelations = sql.slice(sql.indexOf("FROM naijue_erp.transfer_header")); assert.ok(!sql.includes("OR TRUE"));
  } }, { sql: /^SELECT h.id/, rows: [header()], inspect(values, sql) {
    scoped(values, sql); assert.deepEqual(values.slice(0, -2), countedValues); assert.deepEqual(values.slice(-2), [50, "50"]);
    assert.ok(sql.includes(countRelations)); assert.match(sql, /ORDER BY h.updated_at DESC, h.number COLLATE "C" ASC, h.id ASC LIMIT \$11 OFFSET \$12::bigint/);
    assert.match(sql, /JOIN naijue_erp.user_account ca/); assert.match(sql, /JOIN naijue_erp.staff creator/);
    assert.ok(!/transfer_line|naijue_erp.product|naijue_erp.sku|FOR UPDATE|enabled =/.test(sql));
  } }, { sql: /^SELECT page.id/, rows: [{ transfer_id: ids.transfer, total_quantity: "18446744073709551614" }], inspect(values, sql) {
    assert.deepEqual(values, [[ids.transfer]]); assert.match(sql, /SUM\(l.quantity\)/); assert.match(sql, /l.is_current/); assert.ok(!/product|sku|inventory_balance|LATERAL/.test(sql));
  } }, commit()]);
  const result = await reader(client).readList(read(input)); assert.equal(result.exactTotal, 9007199254740993n); assert.equal(result.items[0]!.createdByName, "SYNTHETIC CURRENT CREATOR");
  assert.equal(result.items[0]!.updatedAt, time); assert.equal(result.items[0]!.totalQuantity, 18446744073709551614n);
  assert.equal(client.calls.length, 5); assert.ok(client.calls.every(call => !/INSERT|UPDATE|DELETE|pg_advisory/.test(call.sql))); client.done();
});
test("transfer pg query: explicit all and restrictive account/endpoint clauses remain parameterized intersections", async () => {
  const granted: TransferReadScope = { kind: "restricted", clauses: [{ fromWarehouseId: ids.fromWarehouse, toWarehouseId: ids.toWarehouse, createdByAccountId: ids.account }] };
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect(values, sql) {
    assert.deepEqual(values, [ids.fromWarehouse, ids.toWarehouse, ids.account]); assert.match(sql, /h.from_warehouse_id = \$1::uuid AND h.to_warehouse_id = \$2::uuid AND h.created_by_account_id = \$3::uuid/);
  } }, { sql: /^SELECT h.id/, rows: [] }, commit()]);
  await reader(client).readList(read(parameters(), granted)); client.done();
  const all = new ProtocolClient([begin(), { sql: /WHERE TRUE$/, rows: [{ exact_total: "0" }], inspect(values) { assert.deepEqual(values, []); } }, { sql: /WHERE TRUE\s+ORDER BY/, rows: [] }, commit()]);
  await reader(all).readList(read(parameters(), { kind: "all" })); all.done();
});
test("transfer pg query: empty out-of-range page retains exact total without global fallback", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "15" }] }, { sql: /^SELECT h.id/, rows: [] }, commit()]);
  const result = await reader(client).readList(read({ ...parameters(), page: 9 })); assert.equal(result.exactTotal, 15n); assert.deepEqual(result.items, []); client.done();
});
test("transfer pg query: saved snapshots stay separate from bounded current canonical metadata", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [{ ...header(), stock_basis: "CUTOFF_HISTORY" }], inspect(values, sql) { scoped(values, sql); assert.equal(values[4], ids.transfer); } },
    { sql: /FROM naijue_erp.transfer_line/, rows: [line()], inspect(values, sql) { assert.deepEqual(values, [ids.transfer, TRANSFER_DETAIL_MAX_CURRENT_LINES + 1]);
      assert.match(sql, /WHERE transfer_id = \$1 AND is_current ORDER BY line_no, id LIMIT \$2/); assert.ok(!/JOIN|naijue_erp.product|naijue_erp.sku/.test(sql)); } }, ...catalogSteps(), commit()]);
  const result = await reader(client).readDetail(read({ transferId: ids.transfer })); assert.equal(result.document.lines[0]!.quantity, 9007199254740993n);
  assert.equal(result.document.lines[0]!.snapshot.productName, "SYNTHETIC OLD PRODUCT"); assert.equal(result.document.lines[0]!.snapshot.barcode, "001234560000");
  assert.equal(result.references.fromWarehouseName, "SYNTHETIC CURRENT SOURCE"); assert.equal(result.stockBasis, "CUTOFF_HISTORY"); assert.equal(result.catalog.skus[0]!.productName, "SYNTHETIC CURRENT PRODUCT");
  assert.equal(result.catalog.skus.length, 2); assert.equal(result.catalog.sizeGroups[0]!.members.length, 3); assert.equal(client.calls.length, 6); client.done();
});
test("transfer pg query: hidden/missing detail rolls back before any child read", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [], inspect: scoped }, rollback()]);
  await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer })), { code: "DOCUMENT_NOT_FOUND" }); assert.equal(client.calls.length, 3); client.done();
});
test("transfer pg query: oversized current detail fails instead of truncating", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: Array.from({ length: TRANSFER_DETAIL_MAX_CURRENT_LINES + 1 }, line) }, rollback()]);
  await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer })), { code: "TRANSFER_READ_TOO_LARGE" }); client.done();
});
test("transfer pg query: bad persisted line identities, ownership, snapshots and quantities fail closed", async () => {
  for (const lines of [[{ ...line(), transfer_id: sid("transfer", 999) }], [{ ...line(), quantity: "0" }], [{ ...line(), quantity: "1.5" }], [{ ...line(), is_current: false }],
    [{ ...line(), product_name_snapshot: null }], [line(), line()], [line(), { ...line(), id: ids.line2 }]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: lines }, rollback()]);
    await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer }))); client.done();
  }
});
test("transfer pg query: exact counts cannot be driver numbers and pages cannot exceed exact total", async () => {
  for (const steps of [[{ sql: /^SELECT COUNT/, rows: [{ exact_total: 4 }] }], [{ sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }] }, { sql: /^SELECT h.id/, rows: [header()] }]]) {
    const client = new ProtocolClient([begin(), ...steps, rollback()]); await assert.rejects(() => reader(client).readList(read(parameters())), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("transfer pg query: commit uncertainty is not retried and discards the client", async () => {
  const failure = new Error("SYNTHETIC unknown commit"); const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }] },
    { sql: /^SELECT h.id/, rows: [] }, { sql: /^COMMIT$/, error: failure }, rollback()]);
  await assert.rejects(() => reader(client).readList(read(parameters())), error => error === failure); assert.equal(client.releases[0], failure); client.done();
});
test("transfer pg query: begin/connect/rollback errors release correctly without hidden retries", async () => {
  const failure = new Error("SYNTHETIC begin error"); const beginFailure = new ProtocolClient([{ sql: /^BEGIN/, error: failure }]);
  await assert.rejects(() => reader(beginFailure).readList(read(parameters())), error => error === failure); assert.equal(beginFailure.releases[0], failure); beginFailure.done();
  const rollbackFailure = new Error("SYNTHETIC rollback error"); const broken = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, error: failure }, { sql: /^ROLLBACK$/, error: rollbackFailure }]);
  await assert.rejects(() => reader(broken).readList(read(parameters())), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure);
  assert.equal(broken.releases[0], rollbackFailure); broken.done();
  let connects = 0; await assert.rejects(() => new PostgresTransferQueryReader({ async connect() { connects++; throw failure; } }).readList(read(parameters())), error => error === failure); assert.equal(connects, 1);
});
test("transfer pg query: abort during SQL requests rollback and stops subsequent reads", async () => {
  const controller = new AbortController(); const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect() { controller.abort(); } }, rollback()]);
  await assert.rejects(() => reader(client).readList(read(parameters(), scope, controller.signal)), { code: "TRANSFER_READ_ABORTED" }); client.done();
});
test("transfer pg query: page quantities use one exact batch, include zero, and never hydrate catalog", async () => {
  const transfer2 = sid("transfer", 510);
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "2" }] }, { sql: /^SELECT h.id/, rows: [header(), { ...header(), id: transfer2 }] },
    { sql: /^SELECT page.id/, rows: [{ transfer_id: transfer2, total_quantity: "0" }, { transfer_id: ids.transfer, total_quantity: "18446744073709551614" }], inspect(values, sql) {
      assert.deepEqual(values, [[ids.transfer, transfer2]]); assert.match(sql, /LEFT JOIN naijue_erp.transfer_line l ON l.transfer_id = page.id AND l.is_current/);
      assert.match(sql, /COALESCE\(SUM\(l.quantity\), 0\)::text/); assert.ok(!/LATERAL|naijue_erp.sku|naijue_erp.product/.test(sql));
    } }, commit()]);
  const result = await reader(client).readList(read(parameters())); assert.deepEqual(result.items.map(item => item.totalQuantity), [18446744073709551614n, 0n]);
  assert.equal(client.calls.filter(call => call.sql.includes("SUM(l.quantity)")).length, 1); client.done();
});
test("transfer pg query: missing, duplicated, foreign and inexact aggregate rows fail closed", async () => {
  for (const totals of [[], [{ transfer_id: ids.transfer, total_quantity: 3 }], [{ transfer_id: ids.transfer, total_quantity: "-1" }],
    [{ transfer_id: ids.transfer, total_quantity: "01" }], [{ transfer_id: sid("transfer", 511), total_quantity: "2" }],
    [{ transfer_id: ids.transfer, total_quantity: "2" }, { transfer_id: ids.transfer, total_quantity: "2" }]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "1" }] }, { sql: /^SELECT h.id/, rows: [header()] },
      { sql: /^SELECT page.id/, rows: totals }, rollback()]);
    await assert.rejects(() => reader(client).readList(read(parameters())), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
  const duplicate = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "2" }] }, { sql: /^SELECT h.id/, rows: [header(), header()] }, rollback()]);
  await assert.rejects(() => reader(duplicate).readList(read(parameters())), { code: "INVALID_DATABASE_VALUE" }); duplicate.done();
});
test("transfer pg query: metadata preserves canonical identities and full duplicate labels, not label grouping", async () => {
  const steps = catalogSteps();
  steps[1] = { sql: /^SELECT g.id/, rows: [member(), { ...member(), size_id: catalogIds.size2, display_order: 0 }, { ...member(), size_id: catalogIds.size3, display_order: 0 }] };
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [line()] }, ...steps, commit()]);
  const result = await reader(client).readDetail(read({ transferId: ids.transfer }));
  assert.equal(result.catalog.skus.length, 2); assert.equal(result.catalog.sizeGroups[0]!.members.length, 3);
  assert.equal(result.catalog.sizeGroups[0]!.members[0]!.name, result.catalog.sizeGroups[0]!.members[1]!.name);
  assert.notEqual(result.catalog.sizeGroups[0]!.members[0]!.sizeId, result.catalog.sizeGroups[0]!.members[1]!.sizeId);
  assert.equal(result.catalog.sizeGroups[0]!.members[0]!.displayOrder, -1); client.done();
});
test("transfer pg query: empty document needs no catalog and invalid canonical availability fails closed", async () => {
  const empty = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [] }, commit()]);
  assert.deepEqual((await reader(empty).readDetail(read({ transferId: ids.transfer }))).catalog, { skus: [], sizeGroups: [] }); empty.done();
  for (const skus of [[], [sku(), sku()], [sku(), { ...sku(), sku_id: ids.sku2 }], [sku(), { ...sku(), sku_id: ids.sku2, product_id: sid("product", 512), size_id: catalogIds.size2 }],
    [{ ...sku(), product_name: null }], [sku(), { ...sku(), sku_id: ids.sku2, size_id: catalogIds.size2, product_name: "CONFLICT" }],
    [sku(), { ...sku(), sku_id: ids.sku2, size_id: catalogIds.size2, color_name: "CONFLICT" }], [sku(), { ...sku(), sku_id: ids.sku2, size_id: catalogIds.size2, fit_name: "CONFLICT" }],
    [sku(), { ...sku(), sku_id: ids.sku2, size_id: catalogIds.size2, size_group_id: sid("sizeGroup", 515) }]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [line()] },
      { sql: /^SELECT s.id/, rows: skus }, rollback()]);
    await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer })), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("transfer pg query: missing, duplicate, foreign and malformed full group members fail closed", async () => {
  for (const members of [[], [member(), member()], [{ ...member(), size_id: catalogIds.size3 }], [{ ...member(), size_group_id: sid("sizeGroup", 513) }],
    [{ ...member(), size_name: null }], [{ ...member(), display_order: 0.5 }]]) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [line()] },
      { sql: /^SELECT s.id/, rows: [sku()] }, { sql: /^SELECT g.id/, rows: members }, rollback()]);
    await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer })), { code: "INVALID_DATABASE_VALUE" }); client.done();
  }
});
test("transfer pg query: canonical SKU and complete group bounds reject overflow without truncation", async () => {
  for (const [overflow, steps] of [
    ["sku", [{ sql: /^SELECT s.id/, rows: Array.from({ length: TRANSFER_DETAIL_MAX_CATALOG_SKUS + 1 }, sku) }]],
    ["members", [{ sql: /^SELECT s.id/, rows: [sku()] }, { sql: /^SELECT g.id/, rows: Array.from({ length: TRANSFER_DETAIL_MAX_SIZE_MEMBERS + 1 }, member) }]]
  ] as const) {
    const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [line()] }, ...steps, rollback()]);
    await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer })), { code: "TRANSFER_READ_TOO_LARGE" }, overflow); client.done();
  }
});
const warehouseQuery = () => ({ search: "", selectedIds: [], page: 1, pageSize: 20 });
const warehouse = () => ({ id: ids.fromWarehouse, name: "SYNTHETIC DISABLED WAREHOUSE", hall_id: ids.hall, hall_name: "SYNTHETIC DISABLED HALL", enabled: false, hall_enabled: false });
test("transfer pg query: restricted filter references use identical whole-clause union before endpoint intersection", async () => {
  const granted: TransferReadScope = { kind: "restricted", clauses: [
    { fromHallId: ids.hall, fromWarehouseId: ids.fromWarehouse, createdByAccountId: ids.account },
    { toHallId: ids.otherHall, toWarehouseId: ids.toWarehouse, createdHallId: ids.hall, createdRole: "SALESPERSON" }
  ] };
  let relation = ""; let values: unknown[] = [];
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "1" }], inspect(parameters, sql) {
    values = [...parameters]; assert.deepEqual(parameters, [ids.hall, ids.fromWarehouse, ids.account, ids.otherHall, ids.toWarehouse, ids.hall, "SALESPERSON", [ids.fromWarehouse]]);
    assert.match(sql, /EXISTS \(SELECT 1 FROM naijue_erp.transfer_header h/);
    assert.match(sql, /\(fw.hall_id = \$1::uuid AND h.from_warehouse_id = \$2::uuid AND h.created_by_account_id = \$3::uuid\) OR \(tw.hall_id = \$4::uuid AND h.to_warehouse_id = \$5::uuid AND h.created_hall_id = \$6::uuid AND h.created_role = \$7\)/);
    assert.match(sql, /AND \(h.from_warehouse_id = w.id OR h.to_warehouse_id = w.id\)\) AND w.id = ANY\(\$8::uuid\[\]\)/);
    assert.ok(!/creator.hall_id|creator.role|enabled =|inventory_balance|FOR UPDATE/.test(sql)); relation = sql.slice(sql.indexOf("FROM naijue_erp.warehouse w"));
  } }, { sql: /^SELECT w.id/, rows: [warehouse()], inspect(parameters, sql) { assert.deepEqual(parameters.slice(0, -2), values); assert.ok(sql.includes(relation)); assert.deepEqual(parameters.slice(-2), [20, "0"]); } }, commit()]);
  const result = await reader(client).readWarehouses(read({ ...warehouseQuery(), selectedIds: [ids.fromWarehouse] }, granted));
  assert.equal(result.items[0]!.enabled, false); assert.equal(result.items[0]!.hallEnabled, false); assert.equal(result.exactTotal, 1n); client.done();
});
test("transfer pg query: all-scope references include unused/disabled native warehouses with literal bounded search", async () => {
  const search = "%_\\' OR TRUE"; const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "9007199254740993" }], inspect(values, sql) {
    assert.deepEqual(values, [search]); assert.match(sql, /WHERE TRUE AND \(strpos\(w.name, \$1\) > 0 OR strpos\(wh.name, \$1\) > 0\)$/);
    assert.ok(!/transfer_header|enabled =|OR TRUE/.test(sql));
  } }, { sql: /^SELECT w.id/, rows: [warehouse()], inspect(values, sql) { assert.deepEqual(values, [search, 20, "0"]); assert.match(sql, /ORDER BY w.name, w.id LIMIT \$2 OFFSET \$3::bigint/); } }, commit()]);
  const result = await reader(client).readWarehouses(read({ ...warehouseQuery(), search }, { kind: "all" })); assert.equal(result.exactTotal, 9007199254740993n); client.done();
});
test("transfer pg query: selected warehouse IDs cannot create references outside authorized documents", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT/, rows: [{ exact_total: "0" }], inspect(values, sql) { scoped(values, sql); assert.deepEqual(values[4], [ids.toWarehouse]);
    assert.match(sql, /EXISTS \(SELECT 1/); assert.match(sql, /AND w.id = ANY\(\$5::uuid\[\]\)/); } }, { sql: /^SELECT w.id/, rows: [] }, commit()]);
  const result = await reader(client).readWarehouses(read({ ...warehouseQuery(), selectedIds: [ids.toWarehouse] })); assert.deepEqual(result.items, []); assert.equal(result.exactTotal, 0n); client.done();
  let connects = 0; const r = new PostgresTransferQueryReader({ async connect() { connects++; throw new Error("Must not connect"); } });
  await assert.rejects(() => r.readWarehouses(read({ ...warehouseQuery(), search: "name", selectedIds: [ids.fromWarehouse] })), { code: "INVALID_TRANSFER_QUERY" });
  await assert.rejects(() => r.readWarehouses(read(warehouseQuery(), { kind: "restricted", clauses: [] })), { code: "FORBIDDEN" }); assert.equal(connects, 0);
});
test("transfer pg query: abort after canonical SKU read prevents remaining metadata SQL", async () => {
  const controller = new AbortController(); const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [header()] }, { sql: /FROM naijue_erp.transfer_line/, rows: [line()] },
    { sql: /^SELECT s.id/, rows: [sku()], inspect() { controller.abort(); } }, rollback()]);
  await assert.rejects(() => reader(client).readDetail(read({ transferId: ids.transfer }, scope, controller.signal)), { code: "TRANSFER_READ_ABORTED" }); client.done();
});

function normalTransferReader(client: ProtocolClient) {
  return new PostgresTransferQueryReader({ async connect() { return client; } }, { profile: 'source-confirmed-normal-document-lists-v1', runtime26: {
    profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(actual, purpose) { assert.equal(actual, client); assert.equal(purpose, 'HISTORY_READ'); assert.equal(client.calls[0]!.sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); }
  } });
}
const normalTransferIdentity = (): Step => ({ sql: /read-authorization:identity/, rows: [{ account_id: actor.accountId, staff_id: sid('staff', 401), login_enabled: true, role: actor.role,
  employment_status: '在职', hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }] });
test('normal transfer union: source-bound effective endpoints or ORIGINAL creator hall authorize history independently before global count/page', async () => {
  const live = { ...header(), dataset: 'LIVE', batch_id: null, responsible_staff_id: null, responsible_name: null, quantity: '9007199254740993', incoming_quantity: '0', outgoing_quantity: '9007199254740993',
    product_count: '1', product_items: [{ productId: catalogIds.product, productCodeSnapshot: 'ORIGINAL', productNameSnapshot: 'ORIGINAL' }], product_has_more: false };
  const historical = { ...live, dataset: 'HISTORY', batch_id: sid('operation', 402), business_date: null, status: 'DRAFT', version: 4, created_by_account_id: null, created_by_name: null,
    created_at: null, updated_at: null, created_local_at: null, updated_local_at: null, quantity: '7', incoming_quantity: '0', outgoing_quantity: '7', product_count: null,
    product_items: [{ productId: null, productCodeSnapshot: null, productNameSnapshot: null }], product_has_more: false };
  const input = parameters(); Object.assign(input.filter, { fromWarehouseIds: [ids.fromWarehouse], toWarehouseIds: [ids.toWarehouse], statuses: ['DRAFT'] });
  const client = new ProtocolClient([begin(), normalTransferIdentity(), { sql: /normal-document-list:totals/, rows: [{ exact_total: '2', history_valid: true, history_published: true, quantity: '9007199254741000', incoming_quantity: '0', outgoing_quantity: '9007199254741000' }], inspect(values, sql) {
    assert.match(sql, /scope_fw\.id=\(CASE WHEN e\.header_id IS NULL/); assert.match(sql, /scope_tw\.hall_id=/);
    assert.match(sql, /wr_read\.import_batch_id=h\.batch_id/); assert.match(sql, /wr_read\.target_id=h\.from_warehouse_id/);
    assert.match(sql, /created_hall_provenance='ORIGINAL'/); assert.match(sql, /field_provenance->'fields'->'created_hall_id'->>'origin'='ORIGINAL'/);
    assert.match(sql, /h\.created_role_source='SALESPERSON'/); assert.match(sql, /h\.from_warehouse_id=ANY/); assert.match(sql, /h\.to_warehouse_id=ANY/);
    assert.ok(!sql.includes('creator.hall_id') && !sql.includes('creator.role')); assert.ok(values.some(v => Array.isArray(v) && v[0] === ids.fromWarehouse));
  } }, { sql: /normal-document-list:page/, rows: [live, historical], inspect(_values, sql) { assert.match(sql, /ORDER BY h.updated_at DESC NULLS LAST,h.id ASC,h.dataset ASC/); assert.match(sql, /p\.dataset='HISTORY' AND l.batch_id=p.batch_id AND l.header_id=p.id/); } }, commit()]);
  const result = await normalTransferReader(client).readList(read(input)); assert.ok('totals' in result);
  assert.equal(result.exactTotal, 2n); assert.equal(result.totals.totalQuantity, 9007199254741000n); assert.equal(result.historyCoverage, 'PUBLISHED_AUTHORIZED');
  assert.equal(result.items[0]!.totalQuantity, 9007199254740993n); const h = result.items[1]!;
  assert.equal(h.dataset, 'HISTORY'); assert.equal(h.id, result.items[0]!.id); assert.equal(h.status, 'DRAFT'); assert.equal(h.createdByAccountId, null); assert.equal(h.createdAt, null);
  assert.equal(h.productSummary.productCount, null); assert.equal(h.productSummary.items[0]!.productId, null); client.done();
});
test('normal transfer union: contradictory published branch never becomes a smaller successful page', async () => {
  const client = new ProtocolClient([begin(), normalTransferIdentity(), { sql: /normal-document-list:totals/, rows: [{ exact_total: '0', history_valid: false, history_published: true, quantity: '0', incoming_quantity: '0', outgoing_quantity: '0' }] }, rollback()]);
  await assert.rejects(normalTransferReader(client).readList(read(parameters())), { code: 'INVALID_DATABASE_VALUE' });
  assert.ok(!client.calls.some(c => c.sql.includes('normal-document-list:page'))); client.done();
});
