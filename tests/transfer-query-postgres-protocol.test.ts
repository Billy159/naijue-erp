/** Scripted driver protocol only. No database, SQL parser, engine locks, or real identity facts. */
import assert from "node:assert/strict";
import test from "node:test";
import { PostgresTransferQueryReader, TRANSFER_DETAIL_MAX_CURRENT_LINES } from "../adapters/postgres/src/transfer-query-reader.ts";
import type { PgTransferQueryClient, PgTransferQueryResult } from "../adapters/postgres/src/transfer-query-reader.ts";
import type { TransferListQuery, TransferReadScope } from "../packages/application/src/transfer-query-ports.ts";
import { actor, ids, sid } from "./support/synthetic-transfer.ts";

interface Step { readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class ProtocolClient implements PgTransferQueryClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgTransferQueryResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected call ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean) { this.releases.push(error); }
  done() { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const parameters = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, status: null, fromWarehouseId: null, toWarehouseId: null, number: null }, page: 1, pageSize: 20 });
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
  const input = parameters(); Object.assign(input, { page: 2, pageSize: 50 }); Object.assign(input.filter, { startDate: "2026-10-01", endDate: "2026-10-20", status: "DRAFT",
    fromWarehouseId: ids.fromWarehouse, toWarehouseId: ids.toWarehouse, number: "%_\\' OR TRUE" });
  let countedValues: unknown[] = []; let countRelations = "";
  const client = new ProtocolClient([begin(), { sql: /^SELECT COUNT\(\*\)::text/, rows: [{ exact_total: "9007199254740993" }], inspect(values, sql) {
    scoped(values, sql); assert.match(sql, /h.business_date >= \$5 AND h.business_date <= \$6 AND h.status = \$7 AND h.from_warehouse_id = \$8 AND h.to_warehouse_id = \$9 AND strpos\(h.number, \$10\) > 0/);
    countedValues = [...values]; countRelations = sql.slice(sql.indexOf("FROM naijue_erp.transfer_header")); assert.ok(!sql.includes("OR TRUE"));
  } }, { sql: /^SELECT h.id/, rows: [header()], inspect(values, sql) {
    scoped(values, sql); assert.deepEqual(values.slice(0, -2), countedValues); assert.deepEqual(values.slice(-2), [50, "50"]);
    assert.ok(sql.includes(countRelations)); assert.match(sql, /ORDER BY h.business_date DESC, h.id DESC LIMIT \$11 OFFSET \$12::bigint/);
    assert.match(sql, /JOIN naijue_erp.user_account ca/); assert.match(sql, /JOIN naijue_erp.staff creator/);
    assert.ok(!/transfer_line|naijue_erp.product|naijue_erp.sku|FOR UPDATE|enabled =/.test(sql));
  } }, commit()]);
  const result = await reader(client).readList(read(input)); assert.equal(result.exactTotal, 9007199254740993n); assert.equal(result.items[0]!.createdByName, "SYNTHETIC CURRENT CREATOR");
  assert.equal(client.calls.length, 4); assert.ok(client.calls.every(call => !/INSERT|UPDATE|DELETE|pg_advisory/.test(call.sql))); client.done();
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
test("transfer pg query: native current snapshots and current names use two bounded detail reads", async () => {
  const client = new ProtocolClient([begin(), { sql: /^SELECT h.id/, rows: [{ ...header(), stock_basis: "CUTOFF_HISTORY" }], inspect(values, sql) { scoped(values, sql); assert.equal(values[4], ids.transfer); } },
    { sql: /FROM naijue_erp.transfer_line/, rows: [line()], inspect(values, sql) { assert.deepEqual(values, [ids.transfer, TRANSFER_DETAIL_MAX_CURRENT_LINES + 1]);
      assert.match(sql, /WHERE transfer_id = \$1 AND is_current ORDER BY line_no, id LIMIT \$2/); assert.ok(!/JOIN|naijue_erp.product|naijue_erp.sku/.test(sql)); } }, commit()]);
  const result = await reader(client).readDetail(read({ transferId: ids.transfer })); assert.equal(result.document.lines[0]!.quantity, 9007199254740993n);
  assert.equal(result.document.lines[0]!.snapshot.productName, "SYNTHETIC OLD PRODUCT"); assert.equal(result.document.lines[0]!.snapshot.barcode, "001234560000");
  assert.equal(result.references.fromWarehouseName, "SYNTHETIC CURRENT SOURCE"); assert.equal(result.stockBasis, "CUTOFF_HISTORY"); assert.equal(client.calls.length, 4); client.done();
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
