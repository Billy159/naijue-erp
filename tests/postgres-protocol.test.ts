/** SCRIPTED pg CLIENT PROTOCOL TESTS ONLY. No PostgreSQL engine, SQL parser, locks or durability are exercised. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresSalesUnitOfWork } from "../adapters/postgres/src/sales-unit-of-work.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { moneyFromSql, moneyToSql, quantityFromSql, versionToSql } from "../adapters/postgres/src/codec.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import { requestHash } from "../packages/application/src/request-hash.ts";
import type { SalesCommand, SalesResult, SalesTransaction } from "../packages/application/src/ports.ts";
import type { SalesDocument, SalesDraft } from "../packages/domain/src/documents.ts";
import { minorAmount, quantity, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, syntheticDraft, SYNTHETIC_RULES } from "./support/synthetic-fixtures.ts";

interface Step {
  readonly sql: RegExp;
  readonly rows?: Record<string, unknown>[];
  readonly count?: number;
  readonly error?: Error;
  readonly inspect?: (values: unknown[], sql: string) => void;
}
/** Pre-scripted responses, deliberately not a SQL engine or a second in-memory persistence adapter. */
class ProtocolClient implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = [];
  readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push({ sql, values: structuredClone(values) });
    const step = this.steps.shift();
    assert.ok(step, `Unexpected SQL protocol call: ${sql}`);
    assert.match(sql, step.sql);
    step.inspect?.(values, sql);
    if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.count ?? step.rows?.length ?? 1 };
  }
  release(error?: Error | boolean): void { this.releases.push(error); }
  done(): void { assert.equal(this.steps.length, 0, "All scripted protocol expectations must be consumed"); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL READ COMMITTED$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ });
const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const uow = (client: ProtocolClient): PostgresSalesUnitOfWork => new PostgresSalesUnitOfWork({ async connect() { return client; } });
const time = "2026-10-20T12:00:00.000000Z";
function storedDocument(draft: SalesDraft = syntheticDraft(), status: "DRAFT" | "APPROVED" = "DRAFT", docVersion = 1): SalesDocument {
  return { ...draft, header: { ...draft.header, status, version: version(docVersion), createdByAccountId: actor.accountId, createdHallId: actor.hallId,
    createdAt: time, updatedAt: time, approvedByAccountId: status === "APPROVED" ? actor.accountId : null, approvedAt: status === "APPROVED" ? time : null } };
}
function headerRow(document: SalesDocument, basis = "RUNTIME_LEDGER"): Record<string, unknown> {
  const h = document.header;
  return { id: h.id, number: h.number, business_type: h.businessType, business_date: h.businessDate, hall_id: h.hallId, customer_id: h.customerId,
    salesperson_id: h.salespersonId, warehouse_id: h.warehouseId, status: h.status, version: h.version, gross_amount: moneyToSql(h.grossAmount),
    order_discount: moneyToSql(h.orderDiscount), net_due: moneyToSql(h.netDue), note: h.note, created_by_account_id: h.createdByAccountId,
    created_hall_id: h.createdHallId, created_at: h.createdAt, updated_at: h.updatedAt, approved_by_account_id: h.approvedByAccountId, approved_at: h.approvedAt, stock_basis: basis };
}
function lineRows(document: SalesDocument): Record<string, unknown>[] {
  return document.lines.map(l => ({ id: l.id, sales_id: l.salesId, line_no: l.lineNo, sku_id: l.skuId, quantity: l.quantity.toString(),
    reference_price: l.referencePrice === null ? null : moneyToSql(l.referencePrice), deal_price: moneyToSql(l.dealPrice), line_amount: moneyToSql(l.lineAmount),
    pricing_rule: l.pricingRule, discount_tenths: l.discountTenths, zero_confirmed: l.zeroConfirmed,
    allocated_discount: moneyToSql(l.allocatedDiscount), is_gift: l.isGift, is_current: l.isCurrent, product_code_snapshot: l.snapshot.productCode,
    product_name_snapshot: l.snapshot.productName, color_name_snapshot: l.snapshot.colorName, fit_name_snapshot: l.snapshot.fitName,
    size_name_snapshot: l.snapshot.sizeName, barcode_snapshot: l.snapshot.barcode }));
}
function settlementRows(document: SalesDocument): Record<string, unknown>[] {
  return document.settlements.map(r => ({ id: r.id, sales_id: r.salesId, line_no: r.lineNo, payment_account_id: r.paymentAccountId, direction: r.direction, amount: moneyToSql(r.amount) }));
}
function balanceRow(skuId = ids.sku, amount = "0", balanceVersion = 1): Record<string, unknown> {
  return { warehouse_id: ids.warehouse, sku_id: skuId, quantity: amount, version: balanceVersion, last_operation_id: null, updated_at: time };
}
function receiptRead(command: SalesCommand, receipt?: Record<string, unknown>): Step[] {
  return [{ sql: /^SELECT pg_advisory_xact_lock/, inspect(values) { assert.deepEqual(values, [`naijue:receipt:${JSON.stringify([actor.accountId, command.requestKey])}`]); } },
    { sql: /FROM naijue_erp.operation_receipt WHERE actor_account_id = \$1 AND request_key = \$2/, rows: receipt ? [receipt] : [], inspect(values) { assert.deepEqual(values, [actor.accountId, command.requestKey]); } }];
}
function salesRead(document?: SalesDocument, balances: Record<string, unknown>[] = [balanceRow()], basis = "RUNTIME_LEDGER"): Step[] {
  const steps: Step[] = [{ sql: /^SELECT pg_advisory_xact_lock/, inspect(values) { assert.deepEqual(values, [`naijue:sales:${ids.sales}`]); } },
    { sql: /FROM naijue_erp.sales_header WHERE id = \$1 FOR UPDATE/, rows: document ? [headerRow(document, basis)] : [] }];
  if (document) {
    steps.push({ sql: /FROM naijue_erp.sales_line WHERE sales_id = \$1 ORDER BY line_no, id/, rows: lineRows(document) },
      { sql: /FROM naijue_erp.sales_settlement WHERE sales_id = \$1 ORDER BY line_no, id/, rows: settlementRows(document) });
    if (basis === "RUNTIME_LEDGER") steps.push({ sql: /ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b/, rows: balances, inspect(values, sql) {
      assert.deepEqual(values, [ids.warehouse, ids.sales]); assert.match(sql, /SELECT sku_id FROM naijue_erp.sales_line WHERE sales_id = \$2 AND is_current/);
    } });
  }
  return steps;
}
function documentWrites(document: SalesDocument, isNew = false, previous: SalesDocument = storedDocument()): Step[] {
  const oldLines = new Map(isNew ? [] : previous.lines.map(line => [line.id, line]));
  const changedLines = document.lines.filter(line => !oldLines.has(line.id) || requestHash(oldLines.get(line.id)) !== requestHash(line));
  const freedIds = changedLines.filter(line => oldLines.get(line.id)?.isCurrent).map(line => line.id);
  const oldSettlements = new Map(isNew ? [] : previous.settlements.map(row => [row.id, row]));
  const nextIds = new Set(document.settlements.map(row => row.id));
  const removedIds = [...oldSettlements.keys()].filter(id => !nextIds.has(id));
  return [{ sql: isNew ? /^INSERT INTO naijue_erp.sales_header/ : /^UPDATE naijue_erp.sales_header/, inspect(values, sql) {
    assert.equal(values[10], moneyToSql(document.header.grossAmount)); assert.equal(values[12], moneyToSql(document.header.netDue));
    if (!isNew) { assert.match(sql, /WHERE id = \$1 AND version = \$21 AND stock_basis = 'RUNTIME_LEDGER'/); assert.equal(values[20], document.header.version - 1); }
  } },
  ...(freedIds.length ? [{ sql: /^UPDATE naijue_erp.sales_line SET is_current = false/, inspect(values: unknown[], sql: string) {
    assert.match(sql, /AND id = ANY\(\$2::uuid\[\]\) AND is_current/); assert.deepEqual(values, [ids.sales, freedIds]);
  } }] : []),
  ...changedLines.map<Step>(line => ({ sql: /^INSERT INTO naijue_erp.sales_line/, inspect(values, sql) {
    assert.deepEqual(values.slice(17), [line.pricingRule, line.discountTenths, line.zeroConfirmed]);
    assert.equal(values[0], line.id); assert.equal(values[16], line.isCurrent);
    assert.match(sql, /pricing_rule, discount_tenths, zero_confirmed/); assert.equal(typeof values[4], "string"); assert.match(sql, /WHERE sales_line.sales_id = EXCLUDED.sales_id/); } })),
  ...(removedIds.length ? [{ sql: /^DELETE FROM naijue_erp.sales_settlement WHERE sales_id = \$1 AND id = ANY\(\$2::uuid\[\]\)/,
    inspect(values: unknown[]) { assert.deepEqual(values, [ids.sales, removedIds]); } }] : []),
  ...document.settlements.filter(row => !oldSettlements.has(row.id) || requestHash(oldSettlements.get(row.id)) !== requestHash(row)).map<Step>(row => ({ sql: /^INSERT INTO naijue_erp.sales_settlement/, inspect(values, sql) {
    assert.equal(values[0], row.id); assert.equal(values[5], moneyToSql(row.amount));
    assert.match(sql, /pa.name, pm.name/); assert.match(sql, /THEN sales_settlement.account_name_snapshot ELSE EXCLUDED.account_name_snapshot END/);
    assert.match(sql, /WHERE sales_settlement.sales_id = EXCLUDED.sales_id/);
  } }))];
}
function finalWrites(action: string): Step[] {
  return [{ sql: /^INSERT INTO naijue_erp.audit_change/, inspect(values) {
    assert.equal(values[4], action); const after = JSON.parse(String(values[9]));
    if (after.header.grossAmount !== undefined) assert.equal(typeof after.header.grossAmount, "string");
    assert.equal(after.header.version, values[7]);
    if (values[8] !== null) assert.equal(JSON.parse(String(values[8])).header.version, values[6]);
  } },
    { sql: /^INSERT INTO naijue_erp.operation_receipt/, inspect(values, sql) { assert.match(sql, /target_type, target_id, status, result_data/); assert.equal(values[4], action); assert.equal(String(values[3]).length, 64); } }];
}
function service(client: ProtocolClient, allowed: (command: string) => void = () => undefined) {
  let sequence = 1000;
  return createSalesService({ unitOfWork: uow(client), rules: SYNTHETIC_RULES, authorization: { async assertAllowed(_actor, action) { allowed(action); } },
    now: () => time, newId: kind => sid(kind, sequence++) });
}
const approve = (): SalesCommand => ({ action: "APPROVE", actor, requestKey: "SYNTHETIC-APPROVE", salesId: ids.sales, expectedVersion: version(1) });

// Every name intentionally says protocol: green tests do not prove PostgreSQL accepted any query or constraint.
test("pg protocol: exact decimal(18,2)/bigint codecs preserve extremes and reject rounding/overflow", () => {
  for (const value of ["0", "1", "-1", "9007199254740993", "999999999999999999", "-999999999999999999"]) assert.equal(moneyFromSql(moneyToSql(minorAmount(value))), BigInt(value));
  assert.equal(quantityFromSql("-9223372036854775808"), -9223372036854775808n);
  assert.throws(() => moneyToSql(minorAmount("1000000000000000000")), { code: "MONEY_STORAGE_OVERFLOW" });
  assert.throws(() => moneyFromSql("1.001"), { code: "MONEY_PRECISION" });
  assert.throws(() => moneyFromSql(1.25), { code: "INVALID_DATABASE_VALUE" });
  assert.throws(() => versionToSql(version(2147483648)), { code: "VERSION_STORAGE_OVERFLOW" });
});
test("pg protocol: BEGIN/COMMIT use one client, and leaked handles close", async () => {
  const client = new ProtocolClient([begin(), commit()]); let leaked: SalesTransaction | undefined;
  assert.equal(await uow(client).transaction(async tx => { leaked = tx; return "SYNTHETIC result"; }), "SYNTHETIC result");
  await assert.rejects(() => leaked!.getReceipt(actor.accountId, "late"), { code: "TRANSACTION_CLOSED" });
  assert.equal(client.releases[0], undefined); client.done();
});
test("pg protocol: callback failure requests rollback and never commit", async () => {
  const client = new ProtocolClient([begin(), rollback()]); const failure = new Error("SYNTHETIC callback failure");
  await assert.rejects(() => uow(client).transaction(async () => { throw failure; }), error => error === failure);
  assert.equal(client.releases[0], undefined); client.done();
});
test("pg protocol: BEGIN/connect failures do not run callback", async () => {
  const failure = new Error("SYNTHETIC begin failure"); const client = new ProtocolClient([{ sql: /^BEGIN/, error: failure }]);
  await assert.rejects(() => uow(client).transaction(async () => assert.fail("must not run")), error => error === failure);
  assert.equal(client.releases[0], failure); client.done();
  await assert.rejects(() => new PostgresSalesUnitOfWork({ async connect() { throw failure; } }).transaction(async () => assert.fail("must not run")), error => error === failure);
});
test("pg protocol: uncertain COMMIT failure is not retried and client is discarded", async () => {
  const failure = new Error("SYNTHETIC lost commit response"); const client = new ProtocolClient([begin(), { sql: /^COMMIT$/, error: failure }, rollback()]);
  await assert.rejects(() => uow(client).transaction(async () => 1), error => error === failure);
  assert.equal(client.releases[0], failure); client.done();
});
test("pg protocol: failed rollback reports both errors and discards client", async () => {
  const failure = new Error("SYNTHETIC work failure"), rollbackFailure = new Error("SYNTHETIC rollback failure");
  const client = new ProtocolClient([begin(), { sql: /^ROLLBACK$/, error: rollbackFailure }]);
  await assert.rejects(() => uow(client).transaction(async () => { throw failure; }), error => error instanceof AggregateError && error.errors[0] === failure && error.errors[1] === rollbackFailure);
  assert.equal(client.releases[0], rollbackFailure); client.done();
});
test("pg protocol: new SAVE writes native rows, snapshots, audit and actor/key receipt without stock writes", async () => {
  const draft = syntheticDraft("RETURN"); const command: SalesCommand = { action: "SAVE", actor, requestKey: "SYNTHETIC-SAVE", expectedVersion: null, draft };
  const document = storedDocument(draft);
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(), ...documentWrites(document, true), ...finalWrites("SAVE"), commit()]);
  const result = await service(client).execute(command);
  assert.equal(result.status, "DRAFT"); assert.equal(result.version, 1); assert.deepEqual(result.ledgerEntryIds, []);
  assert.ok(client.calls.every(call => !/INSERT INTO naijue_erp.inventory|UPDATE naijue_erp.inventory/.test(call.sql))); client.done();
});
test("pg protocol: APPROVE locks balances in one stable order and CAS allows negative inventory", async () => {
  const document = storedDocument(); const next = storedDocument(undefined, "APPROVED", 2); const command = approve(); let allowed = 0;
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(document),
    { sql: /^INSERT INTO naijue_erp.inventory_ledger/, inspect(values) { assert.equal(values[2], "APPROVE"); assert.equal(values[5], "-2"); assert.equal(values[6], ids.line); } },
    { sql: /^UPDATE naijue_erp.inventory_balance/, inspect(values, sql) { assert.match(sql, /AND version = \$7/); assert.equal(values[2], "-2"); assert.equal(values[3], 2); assert.equal(values[6], 1); } },
    ...documentWrites(next), ...finalWrites("APPROVE"), commit()]);
  const result = await service(client, () => allowed++).execute(command);
  assert.equal(allowed, 1); assert.equal(result.status, "APPROVED"); assert.equal(result.ledgerEntryIds.length, 1); client.done();
});
test("pg protocol: repeated SKU actual lines retain distinct ledger sources and advance one cached balance twice", async () => {
  const base = syntheticDraft("SALE", ["2", "3"]); const draft = { ...base, lines: base.lines.map(line => ({ ...line, skuId: ids.sku })) };
  const document = storedDocument(draft); const command = approve(); const next = storedDocument(draft, "APPROVED", 2);
  const effects = ["-2", "-5"].flatMap<Step>((amount, i) => [{ sql: /^INSERT INTO naijue_erp.inventory_ledger/, inspect(values) { assert.equal(values[6], i === 0 ? ids.line : ids.line2); } },
    { sql: /^UPDATE naijue_erp.inventory_balance/, inspect(values) { assert.equal(values[2], amount); assert.equal(values[3], i + 2); assert.equal(values[6], i + 1); } }]);
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(document), ...effects, ...documentWrites(next, false, document), ...finalWrites("APPROVE"), commit()]);
  assert.equal((await service(client).execute(command)).ledgerEntryIds.length, 2); client.done();
});
test("pg protocol: missing inventory coverage fails closed without insert/upsert/default zero", async () => {
  const command = approve(); const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(storedDocument(), []), rollback()]);
  await assert.rejects(() => service(client).execute(command), { code: "INVENTORY_NOT_READY" });
  assert.ok(client.calls.every(call => !/^(INSERT|UPDATE|DELETE)/.test(call.sql))); client.done();
});
test("pg protocol: UNAPPROVE appends a linked inverse without mutating original ledger or settlements", async () => {
  const command: SalesCommand = { action: "UNAPPROVE", actor, requestKey: "SYNTHETIC-UNAPPROVE", salesId: ids.sales, expectedVersion: version(2) };
  const originalId = sid("ledger", 2001);
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(storedDocument(undefined, "APPROVED", 2), [balanceRow(ids.sku, "-2", 2)]),
    { sql: /FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl/, rows: [{ id: originalId, operation_id: sid("operation", 2000), event_kind: "APPROVE", warehouse_id: ids.warehouse,
      sku_id: ids.sku, quantity_delta: "-2", sales_id: ids.sales, sales_line_id: ids.line, source_document_version: 2, reverses_entry_id: null, business_date: "2026-10-20", posted_at: time }] },
    { sql: /^INSERT INTO naijue_erp.inventory_ledger/, inspect(values) { assert.equal(values[2], "UNAPPROVE"); assert.equal(values[5], "2"); assert.equal(values[7], 3); assert.equal(values[8], originalId); } },
    { sql: /^UPDATE naijue_erp.inventory_balance/, inspect(values) { assert.equal(values[2], "0"); assert.equal(values[6], 2); } },
    ...documentWrites(storedDocument(undefined, "DRAFT", 3)), ...finalWrites("UNAPPROVE"), commit()]);
  assert.equal((await service(client).execute(command)).status, "DRAFT");
  assert.ok(client.calls.every(call => !/^(UPDATE|DELETE FROM) naijue_erp.inventory_ledger/.test(call.sql))); client.done();
});
test("pg protocol: same actor/key replay returns original result only after current authorization", async () => {
  const command = approve(); const result: SalesResult = { operationId: sid("operation", 2000), salesId: ids.sales, version: version(2), status: "APPROVED", ledgerEntryIds: [sid("ledger", 2001)] };
  const receipt = { id: result.operationId, actor_account_id: actor.accountId, request_key: command.requestKey, request_hash: requestHash({ ...command, actor: { accountId: command.actor.accountId } }), action: command.action,
    target_type: "SALES", target_sales_id: ids.sales, status: "COMMITTED", result, completed_at: time };
  const client = new ProtocolClient([begin(), ...receiptRead(command, receipt), ...salesRead(storedDocument(undefined, "APPROVED", 2)), commit()]); let allowed = 0;
  assert.deepEqual(await service(client, () => allowed++).execute(command), result); assert.equal(allowed, 1);
  assert.ok(client.calls.every(call => !/^(INSERT|UPDATE|DELETE)/.test(call.sql))); client.done();
  const revoked = new ProtocolClient([begin(), ...receiptRead(command, receipt), ...salesRead(storedDocument(undefined, "APPROVED", 2)), rollback()]);
  await assert.rejects(() => service(revoked, () => { throw new Error("SYNTHETIC forbidden"); }).execute(command), /SYNTHETIC forbidden/); revoked.done();
});
test("pg protocol: changed content under original actor/key conflicts without re-executing", async () => {
  const command = approve(); const result = { operationId: sid("operation", 2000), salesId: ids.sales, version: 2, status: "APPROVED", ledgerEntryIds: [] };
  const client = new ProtocolClient([begin(), ...receiptRead(command, { id: result.operationId, actor_account_id: actor.accountId, request_key: command.requestKey, request_hash: "0".repeat(64),
    action: command.action, target_type: "SALES", target_sales_id: ids.sales, status: "COMMITTED", result, completed_at: time }), rollback()]);
  await assert.rejects(() => service(client).execute(command), { code: "IDEMPOTENCY_CONFLICT" }); client.done();
});
test("pg protocol: cutoff history remains queryable but commands fail before balance/ledger mutation", async () => {
  const command = approve(); const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(storedDocument(), [], "CUTOFF_HISTORY"), rollback()]);
  await assert.rejects(() => service(client).execute(command), { code: "HISTORICAL_POSTING_NOT_IMPLEMENTED" }); client.done();
});
test("pg protocol: settlement mismatch still blocks APPROVE before any mutation", async () => {
  const draft = syntheticDraft(); const document = storedDocument({ ...draft, settlements: [] }); const command = approve();
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(document), rollback()]);
  await assert.rejects(() => service(client).execute(command), { code: "SETTLEMENT_MISMATCH" }); client.done();
});
for (const point of ["ledger", "balance", "header", "audit", "receipt"] as const) {
  test(`pg protocol: ${point} write failure requests ROLLBACK, not COMMIT (not durability evidence)`, async () => {
    const command = approve(); const next = storedDocument(undefined, "APPROVED", 2);
    const writes: Step[] = [{ sql: /^INSERT INTO naijue_erp.inventory_ledger/ }, { sql: /^UPDATE naijue_erp.inventory_balance/ }, ...documentWrites(next), ...finalWrites("APPROVE")];
    const patterns = { ledger: /^INSERT INTO naijue_erp.inventory_ledger/, balance: /^UPDATE naijue_erp.inventory_balance/, header: /^UPDATE naijue_erp.sales_header/,
      line: /^INSERT INTO naijue_erp.sales_line/, settlement: /^INSERT INTO naijue_erp.sales_settlement/, audit: /^INSERT INTO naijue_erp.audit_change/, receipt: /^INSERT INTO naijue_erp.operation_receipt/ };
    const target = writes.findIndex(step => step.sql.source === patterns[point].source); assert.ok(target >= 0);
    const failure = new Error(`SYNTHETIC ${point} failure`); const planned = writes.slice(0, target + 1);
    planned[target] = { ...planned[target]!, error: failure };
    const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(storedDocument()), ...planned, rollback()]);
    await assert.rejects(() => service(client).execute(command), error => error === failure); client.done();
  });
}
test("pg protocol: document CAS zero-row result rejects stale update and requests rollback", async () => {
  const document = storedDocument(); const client = new ProtocolClient([begin(), ...salesRead(document), { sql: /^UPDATE naijue_erp.sales_header/, count: 0 }, rollback()]);
  await assert.rejects(() => uow(client).transaction(async tx => { await tx.getSales(ids.sales); await tx.putRuntimeSales(storedDocument(undefined, "APPROVED", 2)); }), { code: "VERSION_CONFLICT" }); client.done();
});
test("pg protocol: balance CAS zero-row result rejects stale quantity and requests rollback", async () => {
  const client = new ProtocolClient([begin(), ...salesRead(storedDocument()), { sql: /^UPDATE naijue_erp.inventory_balance/, count: 0 }, rollback()]);
  await assert.rejects(() => uow(client).transaction(async tx => { await tx.getSales(ids.sales); const balance = await tx.getBalance(ids.warehouse, ids.sku); assert.ok(balance);
    await tx.putBalance({ ...balance, quantity: quantity("-3"), version: version(2) }); }), { code: "VERSION_CONFLICT" }); client.done();
});
test("pg protocol: foreign line ownership failure cannot silently skip a line write", async () => {
  const document = storedDocument();
  const next = { ...storedDocument(undefined, "DRAFT", 2), lines: document.lines.map(line => ({ ...line, referencePrice: minorAmount("999") })) };
  const writes = documentWrites(next).slice(0, 3); writes[2] = { ...writes[2]!, count: 0 };
  const client = new ProtocolClient([begin(), ...salesRead(document), ...writes, rollback()]);
  await assert.rejects(() => uow(client).transaction(async tx => { await tx.getSales(ids.sales); await tx.putRuntimeSales(next); }), { code: "FOREIGN_LINE_ID" }); client.done();
});


test("pg protocol: explicit discount/zero facts and pre-0002 unknowns decode without inference", async () => {
  for (const metadata of [
    { pricingRule: "DISCOUNT" as const, discountTenths: 50, zeroConfirmed: true },
    { pricingRule: null, discountTenths: null, zeroConfirmed: null }
  ]) {
    const source = storedDocument();
    const document = { ...source, lines: source.lines.map(row => ({ ...row, ...metadata })) };
    const client = new ProtocolClient([begin(), ...salesRead(document), commit()]);
    const result = await uow(client).transaction(tx => tx.getSales(ids.sales));
    assert.deepEqual(result?.document.lines, document.lines); client.done();
  }
});
test("pg protocol: unknown active pre-0002 pricing cannot approve, without rewriting stored rows", async () => {
  const source = storedDocument(); const document = { ...source, lines: source.lines.map(row => ({ ...row, pricingRule: null, discountTenths: null, zeroConfirmed: null })) };
  const command = approve();
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(document), rollback()]);
  await assert.rejects(() => service(client).execute(command), { code: "UNKNOWN_PRICING_FACTS" });
  assert.ok(client.calls.every(row => !/^INSERT|^UPDATE/.test(row.sql))); client.done();
});

test("pg protocol: transfer receipt cannot be decoded or reused by a sales command with the same actor/key", async () => {
  const command: SalesCommand = { actor, action: "SAVE", requestKey: "cross-kind-original", expectedVersion: null, draft: syntheticDraft() };
  const client = new ProtocolClient([begin(), ...receiptRead(command, { target_type: "TRANSFER" }), rollback()]);
  const service = createSalesService({ unitOfWork: uow(client), rules: SYNTHETIC_RULES, authorization: { async assertAllowed() {} }, now: () => time, newId: kind => sid(kind, 888) });
  await assert.rejects(service.execute(command), { code: "IDEMPOTENCY_CONFLICT" }); client.done();
});

test("pg protocol: memo-only SAVE writes header/evidence/receipt but never unchanged lines or settlement snapshots", async () => {
  const source = storedDocument();
  const draft = { ...syntheticDraft(), header: { ...syntheticDraft().header, note: "MEMO ONLY" } };
  const next = storedDocument(draft, "DRAFT", 2);
  const command: SalesCommand = { action: "SAVE", actor, requestKey: "memo-only", expectedVersion: version(1), draft };
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(source), ...documentWrites(next), ...finalWrites("SAVE"), commit()]);
  await service(client).execute(command);
  assert.ok(client.calls.every(call => !/^(INSERT INTO|UPDATE|DELETE FROM) naijue_erp.sales_(line|settlement)/.test(call.sql)));
  const evidence = client.calls.find(call => /^INSERT INTO naijue_erp.audit_change/.test(call.sql))!.values;
  assert.deepEqual(evidence.slice(6, 8), [1, 2]);
  assert.deepEqual(JSON.parse(String(evidence[8])), { header: { version: 1, note: source.header.note }, lines: [], settlements: [] });
  assert.deepEqual(JSON.parse(String(evidence[9])), { header: { version: 2, note: "MEMO ONLY" }, lines: [], settlements: [] });
  client.done();
});

test("pg protocol: replaced line frees only its owned current position and leaves unchanged retained/sibling rows untouched", async () => {
  const base = syntheticDraft("SALE", ["2", "3"]);
  const retained = { ...base.lines[0]!, id: sid("salesLine", 6100), isCurrent: false, snapshot: { ...base.lines[0]!.snapshot, productName: "OLD RETAINED SNAPSHOT" } };
  const source = { ...storedDocument(base), lines: [retained, ...base.lines] };
  const replacement = { ...base.lines[0]!, id: sid("salesLine", 6101), snapshot: { ...base.lines[0]!.snapshot, sizeName: "NEW SNAPSHOT" } };
  const draft = { ...base, lines: [replacement, base.lines[1]!] };
  const next = { ...storedDocument(draft, "DRAFT", 2), lines: [retained, { ...base.lines[0]!, isCurrent: false }, ...draft.lines] };
  const command: SalesCommand = { action: "SAVE", actor, requestKey: "replace-line", expectedVersion: version(1), draft };
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(source), ...documentWrites(next, false, source), ...finalWrites("SAVE"), commit()]);
  await service(client).execute(command);
  const lineWrites = client.calls.filter(call => /^INSERT INTO naijue_erp.sales_line/.test(call.sql));
  assert.deepEqual(lineWrites.map(call => call.values[0]), [ids.line, replacement.id]);
  const free = client.calls.find(call => /^UPDATE naijue_erp.sales_line/.test(call.sql))!;
  assert.deepEqual(free.values, [ids.sales, [ids.line]]);
  assert.ok(client.calls.every(call => !/^DELETE FROM naijue_erp.sales_line/.test(call.sql)));
  const audit = JSON.parse(String(client.calls.find(call => /^INSERT INTO naijue_erp.audit_change/.test(call.sql))!.values[9]));
  assert.deepEqual(audit.lines.map((row: { id: string }) => row.id), [ids.line, replacement.id]);
  client.done();
});

test("pg protocol: current line-position swap releases only changed positions before guarded upserts", async () => {
  const draft = syntheticDraft("SALE", ["2", "3"]); const source = storedDocument(draft);
  const next = { ...storedDocument(draft, "DRAFT", 2), lines: source.lines.map(line => ({ ...line, lineNo: line.lineNo === 1 ? 2 : 1 })) };
  const client = new ProtocolClient([begin(), ...salesRead(source), ...documentWrites(next, false, source), commit()]);
  await uow(client).transaction(async tx => { await tx.getSales(ids.sales); await tx.putRuntimeSales(next); });
  assert.deepEqual(client.calls.find(call => /^UPDATE naijue_erp.sales_line/.test(call.sql))?.values, [ids.sales, [ids.line, ids.line2]]);
  client.done();
});

test("pg protocol: settlement SAVE deletes only removed rows and writes only changed/new values with snapshot/ownership guards", async () => {
  const base = syntheticDraft(); const first = base.settlements[0]!;
  const rows = [first, { ...first, id: sid("settlement", 6200), lineNo: 2 }, { ...first, id: sid("settlement", 6201), lineNo: 3 }];
  const source = storedDocument({ ...base, settlements: rows });
  const changed = { ...first, paymentAccountId: sid("paymentAccount", 6202), direction: "REFUND" as const, amount: minorAmount("99") };
  const added = { ...rows[1]!, id: sid("settlement", 6203) };
  const draft = { ...base, settlements: [changed, added, rows[2]!] }; const next = storedDocument(draft, "DRAFT", 2);
  const command: SalesCommand = { action: "SAVE", actor, requestKey: "settlements", expectedVersion: version(1), draft };
  const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(source), ...documentWrites(next, false, source), ...finalWrites("SAVE"), commit()]);
  await service(client).execute(command);
  assert.deepEqual(client.calls.filter(call => /^INSERT INTO naijue_erp.sales_settlement/.test(call.sql)).map(call => call.values[0]), [changed.id, added.id]);
  const evidence = client.calls.find(call => /^INSERT INTO naijue_erp.audit_change/.test(call.sql))!.values;
  const before = JSON.parse(String(evidence[8])), after = JSON.parse(String(evidence[9]));
  assert.deepEqual(before.settlements.map((row: { id: string }) => row.id), [first.id, rows[1]!.id]);
  assert.deepEqual(after.settlements.map((row: { id: string }) => row.id), [changed.id, added.id]);
  assert.equal(after.settlements[0].amount, "99"); assert.equal(after.settlements[0].direction, "REFUND");
  client.done();
});

for (const point of ["line", "settlement"] as const) {
  test(`pg protocol: changed ${point} SAVE failure still requests rollback before audit/receipt`, async () => {
    const base = syntheticDraft();
    const draft = point === "line" ? { ...base, lines: base.lines.map(line => ({ ...line, referencePrice: minorAmount("999") })) }
      : { ...base, settlements: base.settlements.map(row => ({ ...row, amount: minorAmount("999") })) };
    const command: SalesCommand = { action: "SAVE", actor, requestKey: point, expectedVersion: version(1), draft };
    const writes = documentWrites(storedDocument(draft, "DRAFT", 2));
    const target = writes.findIndex(step => step.sql.source === `^INSERT INTO naijue_erp.sales_${point}`); assert.ok(target >= 0);
    const failure = new Error(`SYNTHETIC ${point} failure`); const planned = writes.slice(0, target + 1); planned[target] = { ...planned[target]!, error: failure };
    const client = new ProtocolClient([begin(), ...receiptRead(command), ...salesRead(storedDocument()), ...planned, rollback()]);
    await assert.rejects(service(client).execute(command), error => error === failure); client.done();
  });
}

test("pg protocol: stable-body receipt replay survives trusted hall change but denies revoked access without writes", async () => {
  const original = approve(); const currentActor = { ...actor, hallId: sid("hall", 6300) };
  const command = { ...original, actor: currentActor };
  const result: SalesResult = { operationId: sid("operation", 6301), salesId: ids.sales, version: version(2), status: "APPROVED", ledgerEntryIds: [sid("ledger", 6302)] };
  const receipt = { id: result.operationId, actor_account_id: actor.accountId, request_key: command.requestKey,
    request_hash: requestHash({ ...original, actor: { accountId: actor.accountId } }), action: original.action, target_type: "SALES", target_sales_id: ids.sales, status: "COMMITTED", result, completed_at: time };
  const client = new ProtocolClient([begin(), ...receiptRead(command, receipt), ...salesRead(storedDocument(undefined, "APPROVED", 2)), commit()]);
  const serviceWithAccess = (client: ProtocolClient, allow: boolean) => createSalesService({ unitOfWork: uow(client), rules: SYNTHETIC_RULES,
    authorization: { async assertAllowed(context) { assert.equal(context.hallId, currentActor.hallId); if (!allow) throw new Error("SYNTHETIC revoked current hall"); } },
    now: () => time, newId: kind => sid(kind, 6399) });
  assert.deepEqual(await serviceWithAccess(client, true).execute(command), result);
  assert.ok(client.calls.every(call => !/^(INSERT|UPDATE|DELETE)/.test(call.sql))); client.done();
  const denied = new ProtocolClient([begin(), ...receiptRead(command, receipt), ...salesRead(storedDocument(undefined, "APPROVED", 2)), rollback()]);
  await assert.rejects(serviceWithAccess(denied, false).execute(command), /SYNTHETIC revoked current hall/);
  assert.ok(denied.calls.every(call => !/^(INSERT|UPDATE|DELETE)/.test(call.sql))); denied.done();
});
