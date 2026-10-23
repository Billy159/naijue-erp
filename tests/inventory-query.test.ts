import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryQueryDependencies, InventoryQueryPage, InventoryReadScope, InventoryReadSnapshot, InventoryOutputFrame } from "../packages/application/src/inventory-query-contracts.ts";
import { INVENTORY_OUTPUT_FRAME_MAX_BYTES, encodeInventoryOutputFrame } from "../packages/application/src/inventory-query-contracts.ts";
import { createInventoryQueryService } from "../packages/application/src/inventory-query-service.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { candidateParameters, inventoryActor, inventoryId, inventoryParameters, inventoryScope, syntheticCandidateSnapshot, syntheticInventoryReader, syntheticInventorySnapshot, syntheticInventoryOutput } from "./support/synthetic-inventory-query.ts";
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
async function outputFrames(values: AsyncIterable<InventoryOutputFrame>) { const frames = []; for await (const frame of values) frames.push(frame); return frames; }

test("inventory full output application: one current authorization and full native product stream preserve scope, totals, unknown distinctions and shared encoding", async () => {
  let authorized = 0, outputs = 0; const reader = syntheticInventoryReader(203);
  const s = service({ ...reader, async readInventory() { throw Error("Output must not stitch ordinary pages"); }, async *readInventoryOutput(read) {
    outputs++; assert.deepEqual(read.scope.warehouses, inventoryScope.warehouses); assert.equal(read.parameters.pageSize, 100); assert.equal(JSON.stringify(read.parameters).includes("SPOOFED"), false); yield* syntheticInventoryOutput(read, 203);
  } }, { async authorize(_actor, intent) { authorized++; assert.equal(intent.kind, "inventory"); return inventoryScope; } });
  const frames = await outputFrames(s.readOutput(inventoryActor, { filter: { ...inventoryParameters().filter, warehouses: [{ id: inventoryScope.warehouses[0]!.id, label: "SPOOFED" }] } }, signal()));
  assert.equal(authorized, 1); assert.equal(outputs, 1); assert.equal(frames.length, 205); assert.equal(frames[0]!.kind, "summary"); const last = frames.at(-1)!;
  assert.equal(last.kind, "complete"); if (last.kind === "complete") { assert.equal(last.emittedProducts, 203); assert.equal(last.allMatchesTotal.knownQuantity, "-406"); }
  const product = frames.find(f => f.kind === "product")!; assert.equal(product.kind, "product"); if (product.kind === "product") assert.deepEqual(Object.values(product.product.colorFits[0]!.rows[0]!.cells).map(c => c.state), ["known", "known", "known", "not-applicable"]);
  for (const frame of frames) { const wire = encodeInventoryOutputFrame(frame); assert.ok(wire.endsWith("\n")); assert.deepEqual(JSON.parse(wire), frame); assert.ok(Buffer.byteLength(wire) - 1 <= INVENTORY_OUTPUT_FRAME_MAX_BYTES[frame.kind]); }
});

test("inventory full output application: incomplete, corrupt, cross-scope, reordered and inconsistent streams never release completion", async () => {
  const referenceRead = { actor: inventoryActor, scope: inventoryScope, parameters: { page: 1, pageSize: 100 as const, filter: { productIds: [], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } }, signal: signal() };
  const valid = await outputFrames(syntheticInventoryOutput(referenceRead, 2));
  const modes: ((f: any[]) => void)[] = [f => { f.pop(); }, f => { f.at(-1).readReference = "wrong"; }, f => { f.at(-1).emittedProducts = 1; }, f => { f[0].allMatchesTotal.knownQuantity = "0"; },
    f => { [f[1], f[2]] = [f[2], f[1]]; }, f => { f[2] = f[1]; }, f => { f[1].product.colorFits[0].rows[0].warehouse.id = inventoryId("warehouse", 999); }, f => { f.push(f[1]); }];
  for (const change of modes) {
    let closed = false; const frames = structuredClone(valid); change(frames); const seen: string[] = [];
    const s = service({ ...syntheticInventoryReader(), async *readInventoryOutput() { try { yield* frames; } finally { closed = true; } } });
    await assert.rejects(async () => { for await (const frame of s.readOutput(inventoryActor, { filter: inventoryParameters().filter }, signal())) seen.push(frame.kind); }, hasCode("INVALID_INVENTORY_RESPONSE"));
    assert.equal(seen.includes("complete"), false); assert.equal(closed, true);
  }
});

test("inventory full output application: rejected input, revoked warehouse, absent provider, abort and early consumer return do not become partial success", async () => {
  let authorizations = 0, opened = 0, closed = 0; const s = service({ ...syntheticInventoryReader(), async *readInventoryOutput(read) { opened++; try { yield* syntheticInventoryOutput(read, 2); } finally { closed++; } } }, { async authorize() { authorizations++; return inventoryScope; } });
  await assert.rejects(outputFrames(s.readOutput(inventoryActor, inventoryParameters(), signal())), hasCode("INVALID_INVENTORY_INPUT")); assert.equal(authorizations, 0);
  await assert.rejects(outputFrames(s.readOutput(inventoryActor, { filter: { ...inventoryParameters().filter, warehouses: [{ id: inventoryId("warehouse", 999), label: "foreign" }] } }, signal())), hasCode("FORBIDDEN")); assert.equal(opened, 0);
  const iterator = s.readOutput(inventoryActor, { filter: inventoryParameters().filter }, signal())[Symbol.asyncIterator](); await iterator.next(); await iterator.return?.(undefined); assert.equal(opened, 1); assert.equal(closed, 1);
  const controller = new AbortController(); controller.abort(); await assert.rejects(outputFrames(s.readOutput(inventoryActor, { filter: inventoryParameters().filter }, controller.signal)), hasCode("INVENTORY_READ_ABORTED")); assert.equal(opened, 1);
  const pageOnly = syntheticInventoryReader(); delete pageOnly.readInventoryOutput; await assert.rejects(outputFrames(service(pageOnly).readOutput(inventoryActor, { filter: inventoryParameters().filter }, signal())), hasCode("INVENTORY_NOT_READY"));
});

test("SYNTHETIC inventory application: explicit providers only; authorized snapshot returns distinct negative/explicit-zero/complete-source-no-stock/nonexistent facts", async () => {
  assert.throws(() => createInventoryQueryService({} as InventoryQueryDependencies), /explicit trusted/);
  const result = await service().readInventory(inventoryActor, inventoryParameters(), signal());
  const product = result.data.products[0]!; const cells = Object.values(product.colorFits[0]!.rows[0]!.cells);
  assert.deepEqual(cells.map(cell => cell.state), ["known", "known", "known", "not-applicable"]);
  assert.deepEqual(cells.slice(0, 3).map(cell => cell.state === "known" && cell.quantity), ["-2", "0", "0"]);
  assert.equal(product.sizes[1]!.label, "165/S"); assert.equal(product.colorFits[0]!.fit.label, "Y版（修身）");
  assert.deepEqual(result.data.allMatchesTotal, { knownQuantity: "-2", unknownCells: 0, completeness: "complete" });
  assert.equal(result.readiness, "ready"); assert.equal(result.readReference, result.data.readReference);
  assert.ok(Object.isFrozen(result.data.products[0]!.colorFits[0]!.rows[0]!.cells));
});
test("SYNTHETIC inventory application: one authorized read per page, real total and identical full-filter summary across pages", async () => {
  let reads = 0; let authorizations = 0;
  const s = service({ async readInventory(read) { reads++; return syntheticInventorySnapshot(read, 103); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize() { authorizations++; return inventoryScope; } });
  const first = await s.readInventory(inventoryActor, inventoryParameters(), signal());
  const second = await s.readInventory(inventoryActor, inventoryParameters(2), signal());
  assert.equal(first.data.products.length, 100); assert.equal(second.data.products.length, 3);
  assert.equal(first.data.exactTotalProducts, 103); assert.deepEqual(first.data.allMatchesTotal, second.data.allMatchesTotal);
  assert.equal(first.data.allMatchesTotal.knownQuantity, "-206"); assert.equal(first.data.allMatchesTotal.unknownCells, 0); assert.equal(reads, 2); assert.equal(authorizations, 2);
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
  ["hidden unknown", s => { s.data.products[0].colorFits[0].rows[0].cells[inventoryId("size", 12)] = { state: "unknown", skuId: inventoryId("sku", 10002), reason: "missing source proof" }; }],
  ["wrong row total", s => { s.data.products[0].colorFits[0].rows[0].total.knownQuantity = "0"; }],
  ["wrong column total", s => { s.data.products[0].sizeTotals[inventoryId("size", 10)].knownQuantity = "0"; }],
  ["invalid readiness", s => { s.readiness = "guessed"; }], ["reference mismatch", s => { s.data.readReference = "other"; }],
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
test("SYNTHETIC inventory application: readiness failure propagates; complete empty sets remain exact zero", async () => {
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

test("SYNTHETIC inventory application: absent verified size columns are rejected, not a zero-stock product", async () => {
  const emptyTotal = { knownQuantity: "0", unknownCells: 0, completeness: "complete" as const };
  const s = service({ async readInventory(read) {
    const result = structuredClone(syntheticInventorySnapshot(read)); const product = result.data.products[0]!;
    Object.assign(product, { sizes: [], sizeTotals: {}, total: { ...emptyTotal } });
    for (const group of product.colorFits) {
      Object.assign(group, { sizeTotals: {}, total: { ...emptyTotal } });
      for (const row of group.rows) Object.assign(row, { cells: {}, total: { ...emptyTotal } });
    }
    Object.assign(result, { readiness: "ready" });
    Object.assign(result.data, { allMatchesTotal: { ...emptyTotal } });
    return result;
  }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
  await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
});

// Runtime callers can violate the ready-only TypeScript provider contract. Never publish their data.
test("SYNTHETIC inventory application: whole-scope incomplete imports reject even if visible page totals are complete", async () => {
  for (const count of [0, 1, 103]) {
    const s = service({ async readInventory(read) {
      const snapshot = structuredClone(syntheticInventorySnapshot(read, count));
      Object.assign(snapshot, { readiness: "incomplete" }); return snapshot;
    }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
    await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVENTORY_NOT_READY"));
  }
  const candidates = service({ async readInventory(read) { return syntheticInventorySnapshot(read); }, async readCandidates(read) {
    const snapshot = structuredClone(syntheticCandidateSnapshot(read)); Object.assign(snapshot, { readiness: "incomplete" }); return snapshot;
  } });
  await assert.rejects(candidates.readCandidates(inventoryActor, candidateParameters(), signal()), hasCode("INVENTORY_NOT_READY"));
});
test("SYNTHETIC inventory application: incomplete off-page full-filter summary cannot publish a complete-looking page", async () => {
  const s = service({ async readInventory(read) {
    const snapshot = structuredClone(syntheticInventorySnapshot(read, 103));
    Object.assign(snapshot.data.allMatchesTotal, { completeness: "incomplete", unknownCells: 1 }); return snapshot;
  }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } });
  await assert.rejects(s.readInventory(inventoryActor, inventoryParameters(), signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
});

test("inventory categories: bounded positive arrays capture immutable IDs before authorization and preserve OR selection context", async () => {
  const first = inventoryId("category", 70), second = inventoryId("category", 71);
  let release!: () => void; let arrived!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { arrived = resolve; });
  const input = { ...inventoryParameters(), filter: { ...inventoryParameters().filter,
    categories: [{ id: first, label: "untrusted parent" }, { id: second, label: "untrusted child" }] } };
  const s = service({ async readInventory(read) {
    assert.deepEqual(read.parameters.filter.categoryIds, [first, second]);
    assert.ok(Object.isFrozen(read.parameters.filter.categoryIds));
    assert.ok(!JSON.stringify(read.parameters).includes("untrusted"));
    return syntheticInventorySnapshot(read);
  }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }, { async authorize(_actor, intent) {
    if (intent.kind === "inventory") assert.deepEqual(intent.parameters.filter.categoryIds, [first, second]);
    arrived(); await gate; return inventoryScope;
  } });
  const pending = s.readInventory(inventoryActor, input, signal()); await entered;
  input.filter.categories[0]!.id = inventoryId("category", 72); input.filter.categories.pop(); release();
  await pending;
  const candidates = { ...candidateParameters(), categoryIds: [first, second] };
  let releaseCandidate!: () => void; let candidateArrived!: () => void;
  const candidateGate = new Promise<void>(resolve => { releaseCandidate = resolve; });
  const candidateEntered = new Promise<void>(resolve => { candidateArrived = resolve; });
  const c = service({ async readInventory(read) { return syntheticInventorySnapshot(read); }, async readCandidates(read) {
    assert.deepEqual(read.parameters.categoryIds, [first, second]); assert.ok(Object.isFrozen(read.parameters.categoryIds));
    return syntheticCandidateSnapshot(read);
  } }, { async authorize() { candidateArrived(); await candidateGate; return inventoryScope; } });
  const candidatePending = c.readCandidates(inventoryActor, candidates, signal()); await candidateEntered;
  candidates.categoryIds[0] = inventoryId("category", 72); candidates.categoryIds.length = 0; releaseCandidate(); await candidatePending;
});

test("inventory categories: scalar legacy, malformed, duplicate, sparse and over-bound arrays reject before authorization", async () => {
  const id = inventoryId("category", 70);
  const invalid = [null, id, {}, [{ id: "bad", label: "bad" }], [{ id, label: "a" }, { id, label: "b" }],
    [{ id, label: "a", extra: true }], new Array(1), Array.from({ length: 101 }, (_, n) => ({ id: inventoryId("category", n), label: "over-bound" }))];
  let calls = 0; const s = service(syntheticInventoryReader(), { async authorize() { calls++; return inventoryScope; } });
  for (const categories of invalid) await assert.rejects(s.readInventory(inventoryActor, { ...inventoryParameters(), filter: { ...inventoryParameters().filter, categories } }, signal()), hasCode("INVALID_INVENTORY_INPUT"));
  const legacy: any = inventoryParameters(); delete legacy.filter.categories; legacy.filter.category = null;
  await assert.rejects(s.readInventory(inventoryActor, legacy, signal()), hasCode("INVALID_INVENTORY_INPUT"));
  for (const categoryIds of [null, id, ["bad"], [id, id], new Array(1), Array.from({ length: 101 }, (_, n) => inventoryId("category", n))]) {
    await assert.rejects(s.readCandidates(inventoryActor, { ...candidateParameters(), categoryIds }, signal()), hasCode("INVALID_INVENTORY_INPUT"));
  }
  const old: any = candidateParameters(); delete old.categoryIds; old.categoryId = null;
  await assert.rejects(s.readCandidates(inventoryActor, old, signal()), hasCode("INVALID_INVENTORY_INPUT")); assert.equal(calls, 0);
  await s.readInventory(inventoryActor, inventoryParameters(), signal());
  await s.readCandidates(inventoryActor, candidateParameters(), signal()); assert.equal(calls, 2);
});

test("inventory categories: selected categories cannot bypass an absent or denied authorized warehouse scope", async () => {
  const selected = [{ id: inventoryId("category", 70), label: "not an authorization fact" }]; let reads = 0;
  const reader = { async readInventory(read: any) { reads++; return syntheticInventorySnapshot(read); }, async readCandidates(read: any) { reads++; return syntheticCandidateSnapshot(read); } };
  for (const authorization of [{ async authorize() { return { hallIds: [], warehouses: [] }; } }, { async authorize(): Promise<InventoryReadScope> { throw new DomainError("FORBIDDEN", "Denied current scope"); } }]) {
    const s = service(reader, authorization);
    await assert.rejects(s.readInventory(inventoryActor, { ...inventoryParameters(), filter: { ...inventoryParameters().filter, categories: selected } }, signal()), hasCode("FORBIDDEN"));
    await assert.rejects(s.readCandidates(inventoryActor, { ...candidateParameters(), categoryIds: selected.map(row => row.id) }, signal()), hasCode("FORBIDDEN"));
  }
  assert.equal(reads, 0);
});

test("inventory candidate projections: required product fields and native category identities are closed and immutable", async () => {
  const result = await service().readCandidates(inventoryActor, candidateParameters(), signal());
  assert.equal(result.data.items[0]!.code, "SYNTHETIC-000000"); assert.equal(result.data.items[0]!.name, "SYNTHETIC PRODUCT 0");
  assert.ok(Object.isFrozen(result.data.items[0]));
  for (const [kind, mutate] of [
    ["product", (row: any) => { delete row.code; }], ["product", (row: any) => { row.name = ""; }],
    ["product", (row: any) => { row.parentId = null; }], ["supplier", (row: any) => { row.code = "not a supplier field"; }],
    ["category", (row: any) => { delete row.parentId; }], ["category", (row: any) => { row.parentId = row.id; }],
    ["category", (row: any) => { row.parentId = inventoryId("category", 999); }],
    ["category", (row: any) => { row.parentId = "bad"; row.depth = 1; row.parentLabel = "not a native identity"; }],
    ["category", (row: any) => { row.depth = 1; }], ["category", (row: any) => { row.code = "not a category field"; }]
  ] as const) {
    const s = service({ async readInventory(read) { return syntheticInventorySnapshot(read); }, async readCandidates(read) {
      const snapshot = structuredClone(syntheticCandidateSnapshot(read)); mutate(snapshot.data.items[0]); return snapshot;
    } });
    await assert.rejects(s.readCandidates(inventoryActor, { ...candidateParameters(), kind }, signal()), hasCode("INVALID_INVENTORY_RESPONSE"));
  }
  const categories = await service().readCandidates(inventoryActor, { ...candidateParameters(), kind: "category" }, signal());
  assert.equal(categories.data.items[0]!.parentId, null); assert.equal(categories.data.items[0]!.depth, 0);
});
