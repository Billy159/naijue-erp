import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryQueryDependencies, InventoryQueryPage, InventoryReadScope, InventoryReadSnapshot } from "../packages/application/src/inventory-query-contracts.ts";
import { createInventoryQueryService } from "../packages/application/src/inventory-query-service.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { candidateParameters, inventoryActor, inventoryId, inventoryParameters, inventoryScope, syntheticCandidateSnapshot, syntheticInventoryReader, syntheticInventorySnapshot } from "./support/synthetic-inventory-query.ts";
import type { InventoryPage, CandidatePage } from "../apps/web/src/inventory/contracts.ts";
// Compile-time cross-layer DTO compatibility, with no application dependency on web runtime code.
const compatibleInventory = (value: InventoryQueryPage): InventoryPage => value;
const compatibleCandidate = (value: Awaited<ReturnType<ReturnType<typeof createInventoryQueryService>["readCandidates"]>>["data"]): CandidatePage => value;
void compatibleInventory; void compatibleCandidate;
const signal = () => new AbortController().signal;
function service(reader = syntheticInventoryReader(), authorization: InventoryQueryDependencies["authorization"] = { async authorize() { return inventoryScope; } }) {
  return createInventoryQueryService({ reader, authorization });
}
function hasCode(code: string) { return (error: unknown) => error instanceof DomainError && error.code === code; }

test("SYNTHETIC inventory application: explicit providers only; authorized snapshot returns distinct negative/zero/unknown/nonexistent facts", async () => {
  assert.throws(() => createInventoryQueryService({} as InventoryQueryDependencies), /explicit trusted/);
  const result = await service().readInventory(inventoryActor, inventoryParameters(), signal());
  const product = result.data.products[0]!; const cells = Object.values(product.colorFits[0]!.rows[0]!.cells);
  assert.deepEqual(cells.map(cell => cell.state), ["known", "known", "unknown", "not-applicable"]);
  assert.deepEqual(cells.slice(0, 2).map(cell => cell.state === "known" && cell.quantity), ["-2", "0"]);
  assert.equal(product.sizes[1]!.label, "165/S"); assert.equal(product.colorFits[0]!.fit.label, "Y版（修身）");
  assert.deepEqual(result.data.allMatchesTotal, { knownQuantity: "-2", unknownCells: 1, completeness: "incomplete" });
  assert.equal(result.readiness, "incomplete"); assert.equal(result.readReference, result.data.readReference);
  assert.ok(Object.isFrozen(result.data.products[0]!.colorFits[0]!.rows[0]!.cells));
});
test("SYNTHETIC inventory application: one authorized read per page, real total and identical full-filter summary across pages", async () => {
  let reads = 0; let authorizations = 0;
  const s = service({ async readInventory(read) { reads++; return syntheticInventorySnapshot(read, 103); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize() { authorizations++; return inventoryScope; } });
  const first = await s.readInventory(inventoryActor, inventoryParameters(), signal());
  const second = await s.readInventory(inventoryActor, inventoryParameters(2), signal());
  assert.equal(first.data.products.length, 100); assert.equal(second.data.products.length, 3);
  assert.equal(first.data.exactTotalProducts, 103); assert.deepEqual(first.data.allMatchesTotal, second.data.allMatchesTotal);
  assert.equal(first.data.allMatchesTotal.unknownCells, 103); assert.equal(reads, 2); assert.equal(authorizations, 2);
  const outOfRange = await s.readInventory(inventoryActor, inventoryParameters(3), signal());
  assert.deepEqual(outOfRange.data.products, []); assert.equal(outOfRange.data.exactTotalProducts, 103);
  assert.deepEqual(outOfRange.data.allMatchesTotal, first.data.allMatchesTotal);
});
test("SYNTHETIC inventory application: all page sizes and candidate page cardinality are exact", async () => {
  for (const size of [100, 200, 500]) {
    const data = await service(syntheticInventoryReader(503)).readInventory(inventoryActor, inventoryParameters(1, size), signal());
    assert.equal(data.data.products.length, size); assert.equal(data.data.exactTotalProducts, 503);
  }
  const s = service(); const first = await s.readCandidates(inventoryActor, candidateParameters(), signal());
  const second = await s.readCandidates(inventoryActor, candidateParameters(2), signal());
  assert.equal(first.data.items.length, 20); assert.equal(second.data.items.length, 3); assert.equal(second.data.exactTotal, 23);
});
test("SYNTHETIC inventory application: actor/parameters frozen before first await; display labels never enter trusted filters", async () => {
  let resume!: () => void; const gate = new Promise<void>(resolve => { resume = resolve; }); let authorized!: () => void;
  const entered = new Promise<void>(resolve => { authorized = resolve; });
  const actor = { ...inventoryActor }; const input = { ...inventoryParameters(), filter: { ...inventoryParameters().filter,
    warehouses: [{ id: inventoryScope.warehouses[0]!.id, label: "SPOOFED CLIENT LABEL" }] } };
  const s = service({ async readInventory(read) {
    assert.equal(read.actor.accountId, inventoryActor.accountId); assert.equal(read.parameters.page, 1);
    assert.deepEqual(read.parameters.filter.warehouseIds, [inventoryScope.warehouses[0]!.id]);
    assert.ok(!JSON.stringify(read.parameters).includes("SPOOFED")); assert.ok(Object.isFrozen(read.scope.warehouses));
    return syntheticInventorySnapshot(read);
  }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize(context, intent) {
    assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(intent.parameters)); authorized(); await gate; return inventoryScope;
  } });
  const pending = s.readInventory(actor, input, signal()); await entered;
  actor.accountId = inventoryId("account", 999); input.page = 2; input.filter.warehouses[0]!.id = inventoryId("warehouse", 999); resume();
  assert.equal((await pending).data.page, 1);
});
test("SYNTHETIC inventory application: explicit current scope rejects both requested and returned cross-warehouse leakage", async () => {
  let reads = 0;
  const s = service({ async readInventory(read) { reads++; return syntheticInventorySnapshot(read); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
  const input = { ...inventoryParameters(), filter: { ...inventoryParameters().filter, warehouses: [{ id: inventoryId("warehouse", 999), label: "forged" }] } };
  await assert.rejects(s.readInventory(inventoryActor, input, signal()), hasCode("FORBIDDEN")); assert.equal(reads, 0);
  await assert.rejects(s.readCandidates(inventoryActor, { ...candidateParameters(), kind: "warehouse", selectedIds: [inventoryId("warehouse", 999)] }, signal()), hasCode("FORBIDDEN"));
  const empty = service(syntheticInventoryReader(), { async authorize() { return { hallIds: [], warehouses: [] }; } });
  await assert.rejects(empty.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("FORBIDDEN"));
  const badHall = service(syntheticInventoryReader(), { async authorize() { return { ...inventoryScope, hallIds: [inventoryId("hall", 999)] }; } });
  await assert.rejects(badHall.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
});
test("SYNTHETIC inventory application: authorized warehouse filter narrows BEFORE the snapshot reader", async () => {
  const other = { id: inventoryId("warehouse", 4), hallId: inventoryId("hall", 2), label: "SYNTHETIC OTHER" };
  const scope: InventoryReadScope = { ...inventoryScope, warehouses: [...inventoryScope.warehouses, other] };
  const s = service({ async readInventory(read) { assert.deepEqual(read.scope.warehouses, [other]); return syntheticInventorySnapshot(read); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize() { return scope; } });
  const data = await s.readInventory(inventoryActor, { ...inventoryParameters(), filter: { ...inventoryParameters().filter, warehouses: [{ id: other.id, label: "ignored" }] } }, signal());
  assert.deepEqual(data.data.warehouseLabels, [other.label]);
});
const invalidInputs: readonly [string, (input: any) => void][] = [
  ["actor injection", value => { value.actor = inventoryActor; }], ["hall injection", value => { value.hallId = inventoryActor.hallId; }],
  ["unknown filter", value => { value.filter.extra = []; }], ["missing filter", value => { delete value.filter.fits; }],
  ["string page", value => { value.page = "1"; }], ["zero page", value => { value.page = 0; }],
  ["fractional page", value => { value.page = 1.1; }], ["unsafe offset", value => { value.page = Number.MAX_SAFE_INTEGER; }],
  ["unsupported page size", value => { value.pageSize = 20; }], ["invalid ID", value => { value.filter.products = [{ id: "fake", label: "fake" }]; }],
  ["duplicate filters", value => { value.filter.products = Array.from({ length: 2 }, () => ({ id: inventoryId("product", 1), label: "duplicate" })); }],
  ["unbounded filters", value => { value.filter.products = Array.from({ length: 101 }, (_, n) => ({ id: inventoryId("product", n), label: "over limit" })); }]
];
for (const [name, mutate] of invalidInputs) test(`SYNTHETIC inventory application: rejects ${name} before authorization or reading`, async () => {
  let calls = 0; const s = service(syntheticInventoryReader(), { async authorize() { calls++; return inventoryScope; } });
  const input = inventoryParameters(); mutate(input);
  await assert.rejects(s.readInventory(inventoryActor, input, signal()), hasCode("INVALID_INVENTORY_INPUT")); assert.equal(calls, 0);
});
const malformed: readonly [string, (snapshot: any) => void][] = [
  ["missing cell", s => { delete s.data.products[0].colorFits[0].rows[0].cells[inventoryId("size", 10)]; }],
  ["fractional stock", s => { s.data.products[0].colorFits[0].rows[0].cells[inventoryId("size", 10)].quantity = "1.5"; }],
  ["overflow stock", s => { s.data.products[0].colorFits[0].rows[0].cells[inventoryId("size", 10)].quantity = "9223372036854775808"; }],
  ["hidden unknown", s => { s.data.allMatchesTotal.unknownCells = 0; s.data.allMatchesTotal.completeness = "complete"; s.readiness = "ready"; }],
  ["wrong row total", s => { s.data.products[0].colorFits[0].rows[0].total.knownQuantity = "0"; }],
  ["wrong column total", s => { s.data.products[0].sizeTotals[inventoryId("size", 10)].knownQuantity = "0"; }],
  ["readiness mismatch", s => { s.readiness = "ready"; }], ["reference mismatch", s => { s.data.readReference = "other"; }],
  ["reference header injection", s => { s.readReference = s.data.readReference = "unsafe\r\nvalue"; }],
  ["wrong page", s => { s.data.page = 2; }], ["unknown total", s => { s.data.exactTotalProducts = null; }],
  ["truncated page", s => { s.data.exactTotalProducts = 2; }], ["response extra", s => { s.data.internalCredential = "private"; }],
  ["forged warehouse", s => { s.data.products[0].colorFits[0].rows[0].warehouse.id = inventoryId("warehouse", 999); }],
  ["forged warehouse label", s => { s.data.warehouseLabels = ["forged"]; }],
  ["invented n/a sku", s => { s.data.products[0].colorFits[0].rows[0].cells[inventoryId("size", 13)].skuId = inventoryId("sku", 10); }]
];
for (const [name, mutate] of malformed) test(`SYNTHETIC inventory application: malformed ${name} fails, never a zero-success`, async () => {
  const s = service({ async readInventory(read) { const snapshot = structuredClone(syntheticInventorySnapshot(read)); mutate(snapshot); return snapshot; }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
  await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
});
test("SYNTHETIC inventory application: readiness failure propagates; actual authorized empty set is the only zero-total page", async () => {
  const empty = await service(syntheticInventoryReader(0)).readInventory(inventoryActor, inventoryParameters(), signal());
  assert.equal(empty.data.exactTotalProducts, 0); assert.equal(empty.readiness, "ready");
  const s = service({ async readInventory() { throw new DomainError("INVENTORY_NOT_READY", "missing approved coverage facts"); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
  await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVENTORY_NOT_READY"));
});
test("SYNTHETIC inventory application: signal forwards unchanged and abort rejects a late reader result without claiming SQL cancellation", async () => {
  const controller = new AbortController(); let done!: () => void;
  const gate = new Promise<void>(resolve => { done = resolve; }); let reading!: () => void; const entered = new Promise<void>(resolve => { reading = resolve; });
  const s = service({ async readInventory(read) { assert.equal(read.signal, controller.signal); reading(); await gate; return syntheticInventorySnapshot(read); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize(_actor, _intent, received) { assert.equal(received, controller.signal); return inventoryScope; } });
  const pending = s.readInventory(inventoryActor, inventoryParameters(), controller.signal); await entered; controller.abort(); done();
  await assert.rejects(pending, hasCode("INVENTORY_READ_ABORTED"));
  let calls = 0; const noRead = service(syntheticInventoryReader(), { async authorize() { calls++; return inventoryScope; } });
  await assert.rejects(noRead.readInventory(inventoryActor, inventoryParameters(), controller.signal), hasCode("INVENTORY_READ_ABORTED")); assert.equal(calls, 0);
});

test("SYNTHETIC inventory application: conflicting SKU identity across warehouses and duplicate variant are rejected", async () => {
  const scope: InventoryReadScope = { ...inventoryScope, warehouses: [...inventoryScope.warehouses,
    { id: inventoryId("warehouse", 4), hallId: inventoryId("hall", 2), label: "SYNTHETIC SECOND" }] };
  for (const mutate of [
    (s: any) => { s.data.products[0].colorFits[0].rows[1].cells[inventoryId("size", 10)].skuId = inventoryId("sku", 999); },
    (s: any) => { s.data.products[0].colorFits[0].rows[1].cells[inventoryId("size", 13)] = { state: "unknown", skuId: inventoryId("sku", 999), reason: "not absent" }; },
    (s: any) => { s.data.products[0].colorFits.push(s.data.products[0].colorFits[0]); }
  ]) {
    const s = service({ async readInventory(read) { const result = structuredClone(syntheticInventorySnapshot(read)); mutate(result); return result; }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize() { return scope; } });
    await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
  }
});
test("SYNTHETIC inventory application: candidate responses enforce exact count, scope and strict optional fields", async () => {
  for (const mutate of [
    (s: any) => { s.data.exactTotal = null; }, (s: any) => { s.data.items.pop(); },
    (s: any) => { s.data.items[0].disabled = "false"; }, (s: any) => { s.data.items[0].depth = 2; },
    (s: any) => { s.data.items[0].private = "not a DTO"; }, (s: any) => { s.data.items[1] = s.data.items[0]; }
  ]) {
    const s = service({ async readInventory(read) { return syntheticInventorySnapshot(read); }, async readCandidates(read) { const result = structuredClone(syntheticCandidateSnapshot(read)); mutate(result); return result; } });
    await assert.rejects(s.readCandidates(inventoryActor, candidateParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
  }
  const unauthorized = service({ async readInventory(read) { return syntheticInventorySnapshot(read); }, async readCandidates(read) {
    const result = structuredClone(syntheticCandidateSnapshot(read)); Object.assign(result.data.items[0]!, { id: inventoryId("warehouse", 999) }); return result;
  } });
  await assert.rejects(unauthorized.readCandidates(inventoryActor, { ...candidateParameters(), kind: "warehouse" }, signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
});
test("SYNTHETIC inventory application: integer quantities remain exact beyond JS safe integers and aggregate beyond signed bigint", async () => {
  const scope: InventoryReadScope = { ...inventoryScope, warehouses: [...inventoryScope.warehouses,
    { id: inventoryId("warehouse", 4), hallId: inventoryId("hall", 2), label: "SYNTHETIC SECOND" }] };
  const max = "9223372036854775807"; const sum = "18446744073709551614";
  const s = service({ async readInventory(read) {
    const result = structuredClone(syntheticInventorySnapshot(read)); const product = result.data.products[0]!; const group = product.colorFits[0]!;
    for (const row of group.rows) { Object.assign(row.cells[inventoryId("size", 10)]!, { quantity: max }); Object.assign(row.total, { knownQuantity: max }); }
    // Structured clone preserves shared total objects in this deterministic fixture.
    Object.assign(product.total, { knownQuantity: sum }); Object.assign(product.sizeTotals[inventoryId("size", 10)]!, { knownQuantity: sum });
    Object.assign(result.data.allMatchesTotal, { knownQuantity: sum }); return result;
  }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize() { return scope; } });
  const result = await s.readInventory(inventoryActor, inventoryParameters(), signal());
  assert.equal(result.data.products[0]!.colorFits[0]!.rows[0]!.cells[inventoryId("size", 10)]!.state, "known");
  assert.equal(result.data.allMatchesTotal.knownQuantity, sum);
});
