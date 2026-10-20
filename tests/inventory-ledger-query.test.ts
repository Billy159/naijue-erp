import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../packages/domain/src/errors.ts";
import { createInventoryLedgerQueryService } from "../packages/application/src/inventory-ledger-query-service.ts";
import { checkedInventoryLedgerSnapshot, parseInventoryLedgerQuery } from "../packages/application/src/inventory-ledger-query-validation.ts";
import type { InventoryLedgerQueryDependencies } from "../packages/application/src/inventory-ledger-query-contracts.ts";
import { inventoryActor, inventoryId, inventoryScope, ledgerEntry, ledgerParameters, ledgerRead, ledgerSnapshot, ledgerWarehouse } from "./support/synthetic-inventory-ledger-query.ts";
const code = (expected: string) => (error: unknown) => error instanceof DomainError && error.code === expected;
function service(overrides: Partial<InventoryLedgerQueryDependencies> = {}) {
  return createInventoryLedgerQueryService({ authorization: { async authorize() { return inventoryScope; } }, reader: { async readLedger(read) { return ledgerSnapshot(read); } }, ...overrides });
}

test("SYNTHETIC ledger service: explicit providers, same inventory policy, copied identity and exact narrowed warehouse/hall", async () => {
  assert.throws(() => createInventoryLedgerQueryService({} as InventoryLedgerQueryDependencies), /explicit trusted inventory authorization/);
  let observed = false;
  const result = await service({ authorization: { async authorize(actor, intent, signal) {
    observed = true; assert.deepEqual(actor, inventoryActor); assert.notEqual(actor, inventoryActor); assert.ok(Object.isFrozen(actor)); assert.ok(!signal.aborted);
    assert.equal(intent.kind, "inventory"); if (intent.kind === "inventory") {
      assert.deepEqual(intent.parameters.filter.warehouseIds, [ledgerWarehouse.id]); assert.deepEqual(intent.parameters.filter.productIds, []); assert.equal(intent.parameters.pageSize, 100);
    }
    return { hallIds: [...inventoryScope.hallIds, inventoryId("hall", 999)], warehouses: [...inventoryScope.warehouses, { id: inventoryId("warehouse", 998), hallId: inventoryId("hall", 999), label: "Other authorized native warehouse" }] };
  } }, reader: { async readLedger(read) {
    assert.deepEqual(read.scope, { hallIds: [ledgerWarehouse.hallId], warehouses: [ledgerWarehouse] }); assert.ok(Object.isFrozen(read.parameters)); assert.ok(Object.isFrozen(read.scope)); return ledgerSnapshot(read);
  } } }).readLedger(inventoryActor, ledgerParameters(), new AbortController().signal);
  assert.ok(observed); assert.equal(result.data.entries[0]!.quantityDelta, "-9223372036854775808"); assert.ok(Object.isFrozen(result.data.sku.size));
});

test("SYNTHETIC ledger service: scope denial and revoked authorization never call reader", async () => {
  let reads = 0;
  for (const authorization of [{ async authorize() { return { hallIds: inventoryScope.hallIds, warehouses: [{ ...ledgerWarehouse, id: inventoryId("warehouse", 999) }] }; } },
    { async authorize() { throw new DomainError("FORBIDDEN", "Private denial"); } }]) {
    await assert.rejects(service({ authorization, reader: { async readLedger(read) { reads++; return ledgerSnapshot(read); } } }).readLedger(inventoryActor, ledgerParameters(), new AbortController().signal), code("FORBIDDEN"));
  }
  assert.equal(reads, 0);
});

test("SYNTHETIC ledger service: abort before authorize and after provider prevents publication", async () => {
  const controller = new AbortController(); controller.abort(); let authorizations = 0;
  await assert.rejects(service({ authorization: { async authorize() { authorizations++; return inventoryScope; } } }).readLedger(inventoryActor, ledgerParameters(), controller.signal), code("INVENTORY_READ_ABORTED")); assert.equal(authorizations, 0);
  const after = new AbortController(); await assert.rejects(service({ reader: { async readLedger(read) { after.abort(); return ledgerSnapshot(read); } } }).readLedger(inventoryActor, ledgerParameters(), after.signal), code("INVENTORY_READ_ABORTED"));
});

for (const [name, mutate] of [
  ["extra identity", (row: Record<string, unknown>) => { row.actor = inventoryActor; }], ["scope field", row => { row.hallIds = inventoryScope.hallIds; }],
  ["missing cursor", row => { delete row.after; }], ["page size string", row => { row.pageSize = "20"; }], ["oversize", row => { row.pageSize = 201; }],
  ["zero", row => { row.pageSize = 0; }], ["fraction", row => { row.pageSize = 1.5; }], ["invalid SKU", row => { row.skuId = "not-a-uuid"; }],
  ["cursor wrong type", row => { row.after = "opaque-secret"; }], ["cursor missing ID", row => { row.after = { postedAt: "2026-10-20T18:20:30.123456Z" }; }],
  ["cursor extra grant", row => { row.after = { postedAt: "2026-10-20T18:20:30.123456Z", entryId: inventoryId("ledger", 3), warehouseId: ledgerWarehouse.id }; }]
] satisfies [string, (row: Record<string, unknown>) => void][]) test(`SYNTHETIC ledger input rejects ${name}`, () => {
  const row: Record<string, unknown> = { ...ledgerParameters() }; mutate(row); assert.throws(() => parseInventoryLedgerQuery(row), code("INVALID_INVENTORY_LEDGER_QUERY"));
});

for (const timestamp of ["2026-02-30T18:20:30.123456Z", "2026-10-20T25:20:30.123456Z", "2026-10-20T18:20:60.123456Z", "2026-10-20T18:20:30.123Z", "2026-10-20T18:20:30.123456+00:00", "0000-01-01T00:00:00.000000Z", "infinity"]) {
  test(`SYNTHETIC ledger cursor rejects noncanonical timestamp ${timestamp}`, () => {
    assert.throws(() => ledgerParameters({ after: { postedAt: timestamp, entryId: inventoryId("ledger", 3) } }), code("INVALID_INVENTORY_LEDGER_QUERY"));
  });
}

test("SYNTHETIC ledger output: distinct closed native sources, retained reversal/version, current FIT/full size and microseconds", () => {
  const read = ledgerRead(); const sales = ledgerEntry(0); const transfer = ledgerEntry(1, "TRANSFER"); const baseline = ledgerEntry(2, "CUTOFF_BASELINE");
  const reversal = { ...ledgerEntry(3), eventKind: "UNAPPROVE" as const, reversesEntryId: sales.id, sourceDocumentVersion: 8, quantityDelta: "9223372036854775807" };
  const result = checkedInventoryLedgerSnapshot(ledgerSnapshot(read, [sales, transfer, baseline, reversal]), read.parameters, read.scope);
  assert.deepEqual(result.data.entries.map(entry => entry.source.kind), ["SALES", "TRANSFER", "CUTOFF_BASELINE", "SALES"]);
  assert.equal(result.data.entries[2]!.sourceDocumentVersion, null); assert.equal(result.data.entries[3]!.reversesEntryId, sales.id);
  assert.equal(result.data.sku.fit.code, "Y"); assert.equal(result.data.sku.fit.label, "Y版（修身）"); assert.equal(result.data.sku.size.label, "170/M full native size");
  assert.equal(result.data.entries[0]!.postedAt, "2026-10-20T18:20:30.123456Z");
});

for (const [name, mutate] of [
  ["private payload", (row: any) => { row.data.entries[0].source.payload = { private: true }; }],
  ["extra response", row => { row.data.private = "sensitive"; }], ["wrong exact target", row => { row.data.sku.id = inventoryId("sku", 999); }],
  ["wrong warehouse", row => { row.data.warehouse.id = inventoryId("warehouse", 999); }], ["forged hall", row => { row.data.warehouse.hallId = inventoryId("hall", 999); }],
  ["missing label", row => { row.data.sku.fit.label = ""; }], ["collapsed FIT code", row => { row.data.sku.fit.code = "y"; }],
  ["zero delta", row => { row.data.entries[0].quantityDelta = "0"; }], ["float delta", row => { row.data.entries[0].quantityDelta = "1.5"; }],
  ["overflow", row => { row.data.entries[0].quantityDelta = "9223372036854775808"; }], ["version zero", row => { row.data.entries[0].sourceDocumentVersion = 0; }],
  ["mixed baseline", row => { row.data.entries[0].eventKind = "CUTOFF_BASELINE"; }], ["mixed source", row => { row.data.entries[0].source.endpoint = "IMPORT_BASELINE"; }],
  ["missing reversal", row => { row.data.entries[0].eventKind = "UNAPPROVE"; }], ["unordered", row => { row.data.entries.push({ ...row.data.entries[0], id: inventoryId("ledger", 10001) }); }],
  ["duplicate", row => { row.data.entries.push(row.data.entries[0]); }], ["cursor detached", row => { row.data.nextCursor = { postedAt: row.data.entries[0].postedAt, entryId: inventoryId("ledger", 3) }; }]
] satisfies [string, (row: any) => void][]) test(`SYNTHETIC ledger response rejects ${name}`, () => {
  const read = ledgerRead(); const value = structuredClone(ledgerSnapshot(read)); mutate(value); assert.throws(() => checkedInventoryLedgerSnapshot(value, read.parameters, read.scope), code("INVALID_INVENTORY_LEDGER_RESPONSE"));
});

test("SYNTHETIC ledger output: next cursor must be last full-page row; after is exact microsecond/ID order", () => {
  const read = ledgerRead(ledgerParameters({ pageSize: 1 })); const value = ledgerSnapshot(read); const last = value.data.entries[0]!;
  const cursor = { postedAt: last.postedAt, entryId: last.id };
  const result = checkedInventoryLedgerSnapshot({ ...value, data: { ...value.data, nextCursor: cursor } }, read.parameters, read.scope); assert.deepEqual(result.data.nextCursor, cursor);
  assert.throws(() => checkedInventoryLedgerSnapshot(value, { ...read.parameters, after: cursor }, read.scope), code("INVALID_INVENTORY_LEDGER_RESPONSE"));
  const older = { ...last, postedAt: "2026-10-20T18:20:30.123455Z" }; assert.equal(checkedInventoryLedgerSnapshot(ledgerSnapshot(read, [older]), { ...read.parameters, after: cursor }, read.scope).data.entries.length, 1);
});

test("SYNTHETIC ledger service: malformed trusted actor/scope cannot become a global catalogue or reader grant", async () => {
  let reads = 0; const reader = { async readLedger(read: ReturnType<typeof ledgerRead>) { reads++; return ledgerSnapshot(read); } };
  for (const scope of [
    { hallIds: [], warehouses: [] }, { hallIds: [], warehouses: [ledgerWarehouse] },
    { hallIds: inventoryScope.hallIds, warehouses: [ledgerWarehouse, ledgerWarehouse] },
    { hallIds: inventoryScope.hallIds, warehouses: [{ ...ledgerWarehouse, hallId: inventoryId("hall", 999) }] },
    { ...inventoryScope, kind: "all" }
  ]) await assert.rejects(service({ reader, authorization: { async authorize() { return scope; } } }).readLedger(inventoryActor, ledgerParameters(), new AbortController().signal));
  await assert.rejects(service({ reader }).readLedger({ accountId: "forged", hallId: null } as unknown as typeof inventoryActor, ledgerParameters(), new AbortController().signal));
  assert.equal(reads, 0);
});
