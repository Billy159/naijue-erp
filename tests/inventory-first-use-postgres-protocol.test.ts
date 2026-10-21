/** SCRIPTED PROTOCOL AND APPLICATION EVIDENCE ONLY. No PostgreSQL parser, real locks, races or durability. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPostingBalances } from "../adapters/postgres/src/inventory-posting-balances.ts";
import { PostgresSalesUnitOfWork } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { PostgresTransferUnitOfWork } from "../adapters/postgres/src/transfer-unit-of-work.ts";
import type { PgSalesClient, PgSalesResult } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { assertPostingCoverage, applyInventoryEntry } from "../packages/application/src/inventory-posting.ts";
import { createSalesService } from "../packages/application/src/sales-service.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import { COMPLETE_SCOPE_DECISION } from "../packages/application/src/inventory-cutoff-import.ts";
import type { InventoryBalanceRow, InventoryLedgerRow } from "../packages/domain/src/inventory.ts";
import { moneyToSql } from "../adapters/postgres/src/codec.ts";
import { quantity, version } from "../packages/domain/src/values.ts";
import { actor, ids, sid, syntheticDraft, SYNTHETIC_RULES } from "./support/synthetic-fixtures.ts";
import { actor as transferActor, ids as transferIds, draft as transferDraft } from "./support/synthetic-transfer.ts";
interface Step { readonly sql: RegExp; readonly rows?: readonly Record<string, unknown>[]; readonly count?: number; readonly error?: Error; readonly inspect?: (values: unknown[], sql: string) => void }
class Client implements PgSalesClient {
  readonly calls: { sql: string; values: unknown[] }[] = []; readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = steps; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push({ sql, values: structuredClone(values) }); const step = this.steps.shift(); assert.ok(step, `Unexpected protocol query ${sql}`);
    assert.match(sql, step.sql); step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone([...(step.rows ?? [])]), rowCount: step.count ?? step.rows?.length ?? 1 };
  }
  release(error?: Error | boolean): void { this.releases.push(error); }
  done(): void { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const time = "2026-10-20T12:00:00.000000Z"; const batchId = sid("operation", 9900);
const begin: Step = { sql: /^BEGIN ISOLATION LEVEL READ COMMITTED$/ }, commit: Step = { sql: /^COMMIT$/ }, rollback: Step = { sql: /^ROLLBACK$/ };
const publicationRow = () => ({ id: batchId, completed: true, final_approval: true, checkpoint: { sequence: 2, cursor: 4,
  expected: { WAREHOUSE: 2, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 }, counts: { WAREHOUSE: 2, SKU: 1, INVENTORY_LEDGER: 0, IMPORT_BATCH: 1 } } });
function publication(row: Record<string, unknown> = publicationRow(), guards = true): Step[] {
  return [{ sql: /posting:publication/, rows: [row], inspect(values, sql) { assert.deepEqual(values, [COMPLETE_SCOPE_DECISION]); assert.match(sql, /LIMIT 2/); } },
    { sql: /posting:guards/, rows: [{ integrity_guards_present: guards }], inspect(_values, sql) { assert.match(sql, /schema_migration WHERE version = 8/); assert.match(sql, /c.relname = required.table_name/); } }];
}
function zero(warehouseId = ids.warehouse, skuId = ids.sku, overrides: Record<string, unknown> = {}): Step {
  return { sql: /posting:zero-key/, rows: [{ warehouse_id: warehouseId, sku_id: skuId, warehouse_published: true, sku_published: true, balance_absent: true, ledger_absent: true, valid_size: true, ...overrides }],
    inspect(values, sql) { assert.deepEqual(values, [warehouseId, skuId, batchId]); assert.match(sql, /FOR SHARE OF w, h, s, p, c, f, m/); assert.doesNotMatch(sql, /SUM\(|CROSS JOIN/); } };
}
function locks(keys: readonly { warehouseId: string; skuId: string }[], balances: Record<string, unknown>[] = []): Step[] {
  const unique = [...new Map(keys.map(row => [JSON.stringify([row.warehouseId, row.skuId]), row])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return [...unique.map<Step>(([, row]) => ({ sql: /^SELECT naijue_erp.inventory_key_lock/, inspect(values) { assert.deepEqual(values, [row.warehouseId, row.skuId]); } })),
    { sql: /ORDER BY b.warehouse_id, b.sku_id FOR UPDATE OF b/, rows: balances, inspect(values) { assert.deepEqual(values, [unique.map(([, row]) => row.warehouseId), unique.map(([, row]) => row.skuId)]); } }];
}
const firstInsert = (amount: string): Step => ({ sql: /^INSERT INTO naijue_erp.inventory_balance/, inspect(values, sql) { assert.equal(values[2], amount); assert.equal(values[3], 1); assert.equal(values[5], time); assert.match(sql, /ON CONFLICT \(warehouse_id, sku_id\) DO NOTHING/); assert.doesNotMatch(sql, /DO UPDATE/); } });
const update = (amount: string): Step => ({ sql: /^UPDATE naijue_erp.inventory_balance/, inspect(values) { assert.equal(values[2], amount); assert.equal(values[3], 2); assert.equal(values[6], 1); } });
const ledger: Step = { sql: /^INSERT INTO naijue_erp.inventory_ledger/ };
const finals = (kind: "sales" | "transfer"): Step[] => [{ sql: new RegExp(`^UPDATE naijue_erp.${kind}_header`) }, { sql: /^INSERT INTO naijue_erp.audit_change/ }, { sql: /^INSERT INTO naijue_erp.operation_receipt/ }];
function salesScenario(): { read: Step[]; proof: Step[]; writes: Step[]; execute(client: Client): Promise<unknown> } {
  const source = syntheticDraft("SALE", ["2", "3"]); const draft = { ...source, lines: source.lines.map(line => ({ ...line, skuId: ids.sku })) }; const h = draft.header;
  const header = { id: h.id, number: h.number, business_type: h.businessType, business_date: h.businessDate, hall_id: h.hallId, customer_id: h.customerId, salesperson_id: h.salespersonId, warehouse_id: h.warehouseId,
    status: "DRAFT", version: 1, gross_amount: moneyToSql(h.grossAmount), order_discount: moneyToSql(h.orderDiscount), net_due: moneyToSql(h.netDue), note: h.note, created_by_account_id: actor.accountId,
    created_hall_id: actor.hallId, created_at: time, updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER" };
  const lines = draft.lines.map(l => ({ id: l.id, sales_id: l.salesId, line_no: l.lineNo, sku_id: l.skuId, quantity: l.quantity.toString(), reference_price: l.referencePrice === null ? null : moneyToSql(l.referencePrice), deal_price: moneyToSql(l.dealPrice),
    line_amount: moneyToSql(l.lineAmount), allocated_discount: moneyToSql(l.allocatedDiscount), is_gift: l.isGift, pricing_rule: l.pricingRule, discount_tenths: l.discountTenths, zero_confirmed: l.zeroConfirmed,
    product_code_snapshot: l.snapshot.productCode, product_name_snapshot: l.snapshot.productName, color_name_snapshot: l.snapshot.colorName, fit_name_snapshot: l.snapshot.fitName, size_name_snapshot: l.snapshot.sizeName, barcode_snapshot: l.snapshot.barcode, is_current: true }));
  return { read: [{ sql: /sales:current-schema/, rows: [{ current_sales_schema_ready: true }] }, { sql: /^SELECT pg_advisory_xact_lock/ }, { sql: /FROM naijue_erp.operation_receipt/, rows: [] }, { sql: /^SELECT pg_advisory_xact_lock/ }, { sql: /FROM naijue_erp.sales_header/, rows: [header] },
    { sql: /FROM naijue_erp.sales_line/, rows: lines }, { sql: /FROM naijue_erp.sales_settlement/, rows: draft.settlements.map(r => ({ id: r.id, sales_id: r.salesId, line_no: r.lineNo, payment_account_id: r.paymentAccountId, payment_method_id_snapshot: r.paymentMethodId, direction: r.direction, amount: moneyToSql(r.amount) })) },
    ...locks([{ warehouseId: ids.warehouse, skuId: ids.sku }])], proof: [...publication(), zero()], writes: [ledger, firstInsert("-2"), ledger, update("-5"), ...finals("sales")],
    execute(client) { let n = 10_000; return createSalesService({ unitOfWork: new PostgresSalesUnitOfWork({ async connect() { return client; } }), authorization: { async assertAllowed() {} }, rules: SYNTHETIC_RULES, now: () => time, newId: kind => sid(kind, n++) })
      .execute({ action: "APPROVE", actor, salesId: ids.sales, expectedVersion: version(1), requestKey: "first-actual-approval" }); } };
}
function transferScenario(): ReturnType<typeof salesScenario> {
  const draft = transferDraft(["2", "3"]); const h = draft.header;
  return { read: [{ sql: /^SELECT pg_advisory_xact_lock/ }, { sql: /FROM naijue_erp.operation_receipt/, rows: [] }, { sql: /^SELECT pg_advisory_xact_lock/ },
    { sql: /FROM naijue_erp.transfer_header/, rows: [{ id: h.id, number: h.number, business_date: h.businessDate, from_warehouse_id: h.fromWarehouseId, to_warehouse_id: h.toWarehouseId, status: "DRAFT", version: 1,
      note: h.note, created_by_account_id: transferActor.accountId, created_hall_id: transferActor.hallId, created_role: "SALESPERSON", created_at: time, updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER" }] },
    { sql: /FROM naijue_erp.transfer_line/, rows: draft.lines.map(l => ({ id: l.id, transfer_id: l.transferId, line_no: l.lineNo, sku_id: l.skuId, quantity: l.quantity.toString(), is_current: true,
      product_code_snapshot: l.snapshot.productCode, product_name_snapshot: l.snapshot.productName, color_name_snapshot: l.snapshot.colorName, fit_name_snapshot: l.snapshot.fitName, size_name_snapshot: l.snapshot.sizeName, barcode_snapshot: l.snapshot.barcode })) },
    ...locks([{ warehouseId: h.toWarehouseId, skuId: transferIds.sku }, { warehouseId: h.fromWarehouseId, skuId: transferIds.sku }])],
    proof: [...publication(), zero(h.fromWarehouseId, transferIds.sku), zero(h.toWarehouseId, transferIds.sku)],
    writes: [ledger, firstInsert("-2"), ledger, firstInsert("2"), ledger, update("-5"), ledger, update("5"), ...finals("transfer")],
    execute(client) { let n = 11_000; return createTransferService({ unitOfWork: new PostgresTransferUnitOfWork({ async connect() { return client; } }), authorization: { async assertAllowed() {} }, references: { async assertValid() {} }, now: () => time, newId: kind => sid(kind, n++) })
      .execute({ action: "APPROVE", actor: transferActor, transferId: transferIds.transfer, expectedVersion: version(1), requestKey: "first-actual-approval" }); } };
}
for (const [kind, scenario] of [["SALES", salesScenario], ["TRANSFER", transferScenario]] as const) {
  test(`first-use pg protocol ${kind}: repeated actual lines insert once per used key, preserve negative quantities and commit exact receipt/audit`, async () => {
    const s = scenario(); const client = new Client([begin, ...s.read, ...s.proof, ...s.writes, commit]); await s.execute(client); client.done();
    assert.equal(client.calls.filter(c => /^INSERT INTO naijue_erp.inventory_balance/.test(c.sql)).length, kind === "SALES" ? 1 : 2);
    assert.equal(client.calls.filter(c => c.sql.includes("posting:publication")).length, 1);
    assert.ok(client.calls.findIndex(c => c.sql.includes("posting:zero-key")) < client.calls.findIndex(c => /^INSERT/.test(c.sql)));
  });
  for (const label of ["ledger", "first balance", "header", "audit", "receipt"] as const) {
    test(`first-use pg protocol ${kind}: ${label} error requests rollback and never reports commit`, async () => {
      const s = scenario();
      const position = label === "header" ? s.writes.length - 3 : label === "audit" ? s.writes.length - 2 : label === "receipt" ? s.writes.length - 1 : label === "ledger" ? 0 : 1;
      const error = new Error(`synthetic first-use ${label} failure`); const writes = s.writes.slice(0, position + 1); writes[position] = { ...writes[position]!, error };
      const client = new Client([begin, ...s.read, ...s.proof, ...writes, rollback]); await assert.rejects(s.execute(client), error); client.done(); assert.equal(client.releases[0], undefined);
    });
  }
  test(`first-use pg protocol ${kind}: losing first-insert CAS is a conflict, never an upsert or synthetic success`, async () => {
    const s = scenario(); const client = new Client([begin, ...s.read, ...s.proof, s.writes[0]!, { ...s.writes[1]!, count: 0 }, rollback]);
    await assert.rejects(s.execute(client), { code: "VERSION_CONFLICT" }); client.done();
  });
  test(`first-use pg protocol ${kind}: unknown COMMIT keeps original outcome unknown, discards connection and never retries`, async () => {
    const s = scenario(); const error = new Error("synthetic COMMIT acknowledgement lost"); const client = new Client([begin, ...s.read, ...s.proof, ...s.writes, { ...commit, error }, rollback]);
    await assert.rejects(s.execute(client), error); client.done(); assert.equal(client.releases[0], error); assert.equal(client.calls.filter(c => c.sql === "COMMIT").length, 1);
  });
}
function syntheticEntry(eventKind: "APPROVE" | "UNAPPROVE" = "APPROVE"): InventoryLedgerRow {
  return { id: sid("ledger", 12001), operationId: sid("operation", 12000), eventKind, warehouseId: ids.warehouse, skuId: ids.sku, quantityDelta: quantity("-2"),
    source: { kind: "SALES", salesId: ids.sales, salesLineId: ids.line, endpoint: "SALES_WAREHOUSE" }, sourceDocumentVersion: version(2), reversesEntryId: eventKind === "UNAPPROVE" ? sid("ledger", 11999) : null,
    businessDate: syntheticDraft().header.businessDate, postedAt: time };
}
test("first-use application: absent balance without explicit trusted proof still fails closed, including UNAPPROVE even with a hook", async () => {
  let proved = 0; let writes = 0; const old = { async getBalance() { return undefined; }, async appendLedger() { writes++; }, async putBalance() { writes++; } };
  await assert.rejects(assertPostingCoverage(old, [syntheticEntry()]), { code: "INVENTORY_NOT_READY" });
  await assert.rejects(applyInventoryEntry({ ...old, async assertAbsentBalanceIsPublishedZero() { proved++; } }, syntheticEntry("UNAPPROVE")), { code: "INVENTORY_NOT_READY" });
  assert.equal(proved, 0); assert.equal(writes, 0);
});
test("first-use pg protocol: proof is read-only, exact-key and cached only for this locked transaction", async () => {
  const client = new Client([...locks([{ warehouseId: ids.warehouse, skuId: ids.sku }]), ...publication(), zero()]);
  const balances = new PostgresPostingBalances((sql, values) => client.query(sql, values)); await balances.lock([{ warehouseId: ids.warehouse, skuId: ids.sku }]);
  assert.equal(balances.get(ids.warehouse, ids.sku), undefined); await balances.assertZero(ids.warehouse, ids.sku); await balances.assertZero(ids.warehouse, ids.sku);
  assert.equal(balances.get(ids.warehouse, ids.sku), undefined); await assert.rejects(balances.assertZero(ids.warehouse, ids.sku2), { code: "TRANSACTION_SCOPE" });
  assert.ok(client.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql))); client.release(); client.done();
});
for (const [field, code] of [["warehouse_published", "INVENTORY_NOT_READY"], ["sku_published", "INVENTORY_NOT_READY"], ["balance_absent", "INVENTORY_INTEGRITY_FAILED"], ["ledger_absent", "INVENTORY_INTEGRITY_FAILED"], ["valid_size", "INVENTORY_INTEGRITY_FAILED"]] as const) {
  test(`first-use pg protocol: false ${field} never becomes zero success`, async () => {
    const s = salesScenario(); const client = new Client([begin, ...s.read, ...publication(), zero(ids.warehouse, ids.sku, { [field]: false }), rollback]);
    await assert.rejects(s.execute(client), { code }); client.done(); assert.ok(client.calls.every(c => !/^INSERT/.test(c.sql)));
  });
}
for (const [name, proof, code] of [
  ["unpublished", [{ sql: /posting:publication/, rows: [] }], "INVENTORY_NOT_READY"],
  ["incomplete checkpoint", [{ sql: /posting:publication/, rows: [{ ...publicationRow(), checkpoint: { ...publicationRow().checkpoint, cursor: 0 } }] }], "INVENTORY_INTEGRITY_FAILED"],
  ["missing final approval", [{ sql: /posting:publication/, rows: [{ ...publicationRow(), final_approval: false }] }], "INVENTORY_INTEGRITY_FAILED"],
  ["missing runtime schema/guard", publication(publicationRow(), false), "INVENTORY_INTEGRITY_FAILED"]
] as const) {
  test(`first-use pg protocol: ${name} fails before any business effect`, async () => {
    const s = salesScenario(); const client = new Client([begin, ...s.read, ...proof, rollback]); await assert.rejects(s.execute(client), { code }); client.done();
  });
}
test("first-use pg protocol: waiter rereads the winning balance after canonical key lock and follows existing CAS, without second insert or zero proof", async () => {
  const original = syntheticEntry(); const row = { warehouse_id: ids.warehouse, sku_id: ids.sku, quantity: "-2", version: 1, last_operation_id: original.operationId, updated_at: time };
  const client = new Client([...locks([{ warehouseId: ids.warehouse, skuId: ids.sku }, { warehouseId: ids.warehouse, skuId: ids.sku }], [row]), update("-5")]);
  const balances = new PostgresPostingBalances((sql, values) => client.query(sql, values)); await balances.lock([{ warehouseId: ids.warehouse, skuId: ids.sku }, { warehouseId: ids.warehouse, skuId: ids.sku }]);
  const winner = balances.get(ids.warehouse, ids.sku)!; const next: InventoryBalanceRow = { ...winner, quantity: quantity("-5"), version: version(2), lastOperationId: sid("operation", 12002) }; await balances.put(next);
  assert.ok(client.calls.every(c => !c.sql.includes("posting:publication") && !/^INSERT/.test(c.sql))); client.release(); client.done();
});

test("first-use pg protocol TRANSFER: unproven second endpoint prevents all effects despite a proven first endpoint", async () => {
  const s = transferScenario(); const client = new Client([begin, ...s.read, ...publication(), zero(transferIds.fromWarehouse, transferIds.sku),
    zero(transferIds.toWarehouse, transferIds.sku, { sku_published: false }), rollback]);
  await assert.rejects(s.execute(client), { code: "INVENTORY_NOT_READY" }); client.done(); assert.ok(client.calls.every(c => !/^(INSERT|UPDATE|DELETE)/.test(c.sql)));
});
test("first-use pg protocol: zero ledger-insert acknowledgement cannot create a balance or claim success", async () => {
  const s = salesScenario(); const client = new Client([begin, ...s.read, ...s.proof, { ...ledger, count: 0 }, rollback]);
  await assert.rejects(s.execute(client), { code: "INVENTORY_INTEGRITY_FAILED" }); client.done();
  assert.ok(client.calls.every(c => !/^INSERT INTO naijue_erp.inventory_balance/.test(c.sql)));
});
