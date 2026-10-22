import assert from "node:assert/strict";
import test from "node:test";
import { loadNativeTransferSnapshots } from "../adapters/postgres/src/native-transfer-snapshots.ts";
import { createNativeTransferPreparation, createNativeManualTransferReferences, createNativeTransferExistingPreparation } from "../packages/application/src/native-transfer-preparation.ts";
import { fixture, ids, actor } from "./support/synthetic-transfer.ts";
import { sid, snapshot } from "./support/synthetic-fixtures.ts";
import type { TransferDependencies, TransferTransaction } from "../packages/application/src/transfer-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import type { NativeTransferExistingProposal } from "../packages/application/src/native-transfer-preparation.ts";
import { createTransferService } from "../packages/application/src/transfer-service.ts";
import { version } from "../packages/domain/src/values.ts";
const proposal = () => ({ businessDate: "2026-10-21", note: null, fromWarehouseId: ids.fromWarehouse, toWarehouseId: ids.toWarehouse,
  lines: [{ skuId: ids.sku, quantity: "2" }] });
const native = { ...snapshot, barcode: "000123" };
const row = { id: ids.sku, product_code: native.productCode, product_name: native.productName, color_name: native.colorName,
  fit_name: native.fitName, size_name: native.sizeName, barcode: native.barcode };
const code = (expected: string) => (error: unknown) => error instanceof DomainError && error.code === expected;
function setup() {
  const f = fixture(); let available = true; let changed = false;
  const dependencies: TransferDependencies = { ...f.dependencies, references: createNativeManualTransferReferences(),
    unitOfWork: { transaction(work) { return f.store.transaction(tx => work({ ...tx, async getCurrentTransferSnapshots() {
      if (!available) throw new DomainError("NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "Synthetic missing MAIN");
      return new Map([[ids.sku, { ...native, productName: changed ? "SYNTHETIC CHANGED" : native.productName }]]);
    } })); } } };
  return { ...f, dependencies, prepare: createNativeTransferPreparation(dependencies), disable: () => { available = false; }, change: () => { changed = true; } };
}
test("SYNTHETIC protocol: bounded exact MAIN snapshot query locks all source identities and preserves leading zeros", async () => {
  const calls: string[] = [];
  const result = await loadNativeTransferSnapshots(async (sql, values) => {
    calls.push(sql);
    if (sql.includes(":schema")) return { rows: [{ installed: true }], rowCount: 1 };
    assert.deepEqual(values, [[ids.sku]]);
    for (const clause of ["b.barcode_kind = 'MAIN'", "b.enabled", "s.enabled AND p.enabled AND c.enabled AND f.enabled",
      "m.size_group_id = p.size_group_id AND m.size_id = s.size_id", "FOR SHARE OF s, p, c, f, sz, m, b"])
      assert.ok(sql.includes(clause));
    return { rows: [row], rowCount: 1 };
  }, [ids.sku, ids.sku]);
  assert.deepEqual(result.get(ids.sku), native); assert.equal(calls.length, 2);
});
test("SYNTHETIC protocol: absent schema, no MAIN, disabled SKU, cross-group size, duplicate/foreign rows fail closed", async () => {
  for (const rows of [[], [row, row], [{ ...row, id: sid("sku", 9999) }], [{ ...row, barcode: null }]]) {
    await assert.rejects(loadNativeTransferSnapshots(async sql => ({ rows: sql.includes(":schema") ? [{ installed: true }] : rows, rowCount: rows.length }), [ids.sku]));
  }
  // The JOIN/WHERE excludes absent MAIN, disabled SKU and cross-group size alike.
  let calls = 0;
  await assert.rejects(loadNativeTransferSnapshots(async () => { calls++; return { rows: [{ installed: false }], rowCount: 1 }; }, [ids.sku]), code("NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE"));
  assert.equal(calls, 1);
});
test("SYNTHETIC native preparation makes no writes, gets actual labels/raw barcode and revalidates on SAVE", async () => {
  const h = setup(), before = h.store.snapshot(); const prepared = await h.prepare.prepareCreate(actor, proposal());
  assert.match(prepared.header.number, /^V2-DB-/); assert.deepEqual(prepared.lines[0]!.snapshot, native);
  assert.deepEqual(h.store.snapshot(), before);
  const { createTransferService } = await import("../packages/application/src/transfer-service.ts");
  const service = createTransferService(h.dependencies);
  h.change(); await assert.rejects(service.execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "stale", draft: prepared }), code("TRANSFER_SNAPSHOT_MISMATCH"));
  assert.deepEqual(h.store.snapshot(), before);
});
test("SYNTHETIC missing MAIN, revoked permissions, same warehouse and duplicate generated IDs reject preparation", async () => {
  const h = setup(); h.disable(); await assert.rejects(h.prepare.prepareCreate(actor, proposal()), code("NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE"));
  const revoked = setup(); revoked.revokeAccess(); await assert.rejects(revoked.prepare.prepareCreate(actor, proposal()), code("FORBIDDEN"));
  const same = setup(); await assert.rejects(same.prepare.prepareCreate(actor, { ...proposal(), toWarehouseId: ids.fromWarehouse }), code("SAME_WAREHOUSE"));
  const duplicate = setup(); const prepare = createNativeTransferPreparation({ ...duplicate.dependencies, newId: kind => sid(kind, 1) });
  await assert.rejects(prepare.prepareCreate(actor, proposal()), code("INVALID_LINE"));
});
test("SYNTHETIC prepared references can become unavailable or access revoked before SAVE without writes", async () => {
  const { createTransferService } = await import("../packages/application/src/transfer-service.ts");
  for (const revoke of [false, true]) {
    const h = setup(); const prepared = await h.prepare.prepareCreate(actor, proposal()); const before = h.store.snapshot();
    if (revoke) h.revokeAccess(); else h.disable();
    await assert.rejects(createTransferService(h.dependencies).execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "create", draft: prepared }), code(revoke ? "FORBIDDEN" : "NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE"));
    assert.deepEqual(h.store.snapshot(), before);
  }
});

async function existingSetup() {
  const h = setup(), initial = await h.prepare.prepareCreate(actor, proposal());
  await createTransferService(h.dependencies).execute({ actor, action: "SAVE", expectedVersion: null, requestKey: "seed-existing", draft: initial });
  const trace: string[] = [], allocated: string[] = []; let captured: TransferTransaction | undefined;
  const dependencies: TransferDependencies = { ...h.dependencies, newId: kind => { allocated.push(kind); return h.dependencies.newId(kind); },
    authorization: { async assertAllowed(...args) { captured = args[4]; trace.push("authorize"); await h.dependencies.authorization.assertAllowed(...args); } },
    unitOfWork: { transaction(work) { return h.dependencies.unitOfWork.transaction(original => work({ ...original,
      async getCurrentTransferSnapshots(skus) {
        trace.push("snapshots"); const rows = new Map();
        for (const id of skus) {
          if (h.store.snapshot().skus.get(id)?.enabled !== true) throw new DomainError("NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE", "SYNTHETIC disabled or missing native SKU");
          if (id === ids.sku) rows.set(id, (await original.getCurrentTransferSnapshots!([id])).get(id)!);
          else rows.set(id, { ...native, productName: "SYNTHETIC SECOND SKU", barcode: "000456" });
        } return rows;
      },
      async putRuntimeTransfer(doc) { trace.push("WRITE:document"); return original.putRuntimeTransfer(doc); },
      async insertReceipt(receipt) { trace.push("WRITE:receipt"); return original.insertReceipt(receipt); },
      async appendAudit(audit) { trace.push("WRITE:audit"); return original.appendAudit(audit); },
      async appendLedger(row) { trace.push("WRITE:ledger"); return original.appendLedger(row); },
      async putBalance(row) { trace.push("WRITE:balance"); return original.putBalance(row); },
      async reserveRuntimeDocumentNumber() { trace.push("WRITE:number"); throw Error("MUST_NOT_ALLOCATE_NUMBER"); }
    })); } } };
  const input = (): NativeTransferExistingProposal => ({ ...proposal(), transferId: initial.header.id, expectedVersion: 1,
    lines: [{ ...proposal().lines[0]!, existingLineId: initial.lines[0]!.id }] });
  return { ...h, initial, input, trace, allocated, dependencies, existing: createNativeTransferExistingPreparation(dependencies), captured: () => captured,
    document: () => h.store.snapshot().transfers.get(initial.header.id)!.document };
}
test("SYNTHETIC existing transfer preserves original id/number/snapshot, explicit quantity and has zero business or number writes", async () => {
  const h = await existingSetup(), before = h.store.snapshot(), input = { ...h.input(), lines: [{ ...h.input().lines[0]!, quantity: "1" }] };
  h.change(); const p = await h.existing.prepareExisting(actor, input);
  assert.deepEqual(h.store.snapshot(), before); assert.equal(p.expectedVersion, 1); assert.equal(p.draft.header.id, h.initial.header.id); assert.equal(p.draft.header.number, h.initial.header.number);
  assert.equal(p.draft.lines[0]!.id, h.initial.lines[0]!.id); assert.equal(p.draft.lines[0]!.quantity, 1n); assert.deepEqual(p.draft.lines[0]!.snapshot, h.initial.lines[0]!.snapshot);
  assert.ok(!h.trace.includes("snapshots")); assert.ok(!h.trace.some(v => v.startsWith("WRITE:"))); assert.deepEqual(h.allocated, ["operation"]);
  assert.throws(() => h.captured()!.getTransfer(h.initial.header.id), { code: "TRANSACTION_CLOSED" });
});
test("SYNTHETIC existing transfer new/replaced SKU gets distinct server ids and unchanged SAVE retains old snapshot", async () => {
  const h = await existingSetup(), before = h.store.snapshot(), input = h.input();
  const p = await h.existing.prepareExisting(actor, { ...input, lines: [{ ...input.lines[0]!, skuId: ids.sku2 }, { ...input.lines[0]!, existingLineId: null, quantity: "1" }] });
  assert.deepEqual(h.store.snapshot(), before); assert.deepEqual(p.draft.lines.map(l => l.skuId), [ids.sku2, ids.sku]);
  assert.deepEqual(p.draft.lines.map(l => l.lineNo), [1, 2]); assert.ok(p.draft.lines.every(l => l.id !== h.initial.lines[0]!.id)); assert.notEqual(p.draft.lines[0]!.id, p.draft.lines[1]!.id);
  assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
  await createTransferService(h.dependencies).execute({ actor, action: "SAVE", expectedVersion: version(p.expectedVersion), requestKey: "save-replaced", draft: p.draft });
  const old = h.document().lines.find(l => l.id === h.initial.lines[0]!.id)!; assert.equal(old.isCurrent, false); assert.deepEqual(old.snapshot, h.initial.lines[0]!.snapshot);
});
test("SYNTHETIC existing transfer preserves disabled outgoing nonzero exception and disabled SKU reduction without fresh MAIN", async () => {
  const h = await existingSetup(), input = h.input();
  h.store.seedWarehouse({ ...h.store.snapshot().warehouses.get(ids.fromWarehouse)!, enabled: false, hasNonzeroInventory: true });
  h.store.seedSku({ id: ids.sku, enabled: false }); h.disable();
  const before = h.store.snapshot(), p = await h.existing.prepareExisting(actor, { ...input, lines: [{ ...input.lines[0]!, quantity: "1" }] });
  assert.equal(p.draft.lines[0]!.quantity, 1n); assert.deepEqual(h.store.snapshot(), before); assert.ok(!h.trace.includes("snapshots"));
  await assert.rejects(h.existing.prepareExisting(actor, { ...input, lines: [{ ...input.lines[0]!, quantity: "3" }] }), code("SKU_UNAVAILABLE"));
  const third = sid("warehouse", 999); h.store.seedWarehouse({ id: third, hallId: ids.hall, enabled: true, hallEnabled: true, hasNonzeroInventory: true });
  await assert.rejects(h.existing.prepareExisting(actor, { ...input, fromWarehouseId: third }), code("SKU_UNAVAILABLE"));
  h.store.seedWarehouse({ ...h.store.snapshot().warehouses.get(ids.fromWarehouse)!, hasNonzeroInventory: false });
  await assert.rejects(h.existing.prepareExisting(actor, input), code("WAREHOUSE_UNAVAILABLE"));
  const destination = await existingSetup(); destination.store.seedWarehouse({ ...destination.store.snapshot().warehouses.get(ids.toWarehouse)!, enabled: false, hasNonzeroInventory: true });
  await assert.rejects(destination.existing.prepareExisting(actor, destination.input()), code("WAREHOUSE_UNAVAILABLE"));
});
test("SYNTHETIC existing transfer keeps trusted creation-hall visibility for proposed endpoints and rejects outside original scope", async () => {
  const h = await existingSetup(), doc = h.document(), otherA = sid("warehouse", 991), otherB = sid("warehouse", 992);
  for (const id of [otherA, otherB]) h.store.seedWarehouse({ id, hallId: ids.otherHall, enabled: true, hallEnabled: true, hasNonzeroInventory: false });
  const p = await h.existing.prepareExisting(actor, { ...h.input(), fromWarehouseId: otherA, toWarehouseId: otherB });
  assert.equal(p.draft.header.fromWarehouseId, otherA); // Original salesperson creation hall remains the legitimate visibility branch.
  h.store.seedDocument({ ...doc, header: { ...doc.header, fromWarehouseId: otherA, toWarehouseId: otherB, createdRole: "ADMIN", createdHallId: null } });
  await assert.rejects(h.existing.prepareExisting(actor, { ...h.input(), fromWarehouseId: otherA, toWarehouseId: otherB }), code("FORBIDDEN"));
});
test("SYNTHETIC existing transfer rejects foreign/noncurrent/duplicate pointers, stale/state/history and revoked access before snapshots", async () => {
  const h = await existingSetup(), input = h.input(), before = h.store.snapshot();
  for (const change of [{ ...input, lines: [{ ...input.lines[0]!, existingLineId: sid("transferLine", 999) }] }, { ...input, lines: [input.lines[0]!, input.lines[0]!] }])
    await assert.rejects(h.existing.prepareExisting(actor, change), code("INVALID_HTTP_INPUT"));
  await assert.rejects(h.existing.prepareExisting(actor, { ...input, expectedVersion: 2 }), code("VERSION_CONFLICT"));
  assert.deepEqual(h.store.snapshot(), before); assert.ok(!h.trace.includes("snapshots"));
  const doc = h.document(); h.store.seedDocument({ ...doc, lines: doc.lines.map(l => ({ ...l, isCurrent: false })) });
  await assert.rejects(h.existing.prepareExisting(actor, input), code("INVALID_HTTP_INPUT"));
  h.store.seedDocument({ ...doc, header: { ...doc.header, status: "APPROVED" } }); await assert.rejects(h.existing.prepareExisting(actor, input), code("INVALID_STATE"));
  h.store.seedDocument(doc, "CUTOFF_HISTORY"); await assert.rejects(h.existing.prepareExisting(actor, input), code("HISTORICAL_POSTING_NOT_IMPLEMENTED"));
  h.store.seedDocument(doc); h.revokeAccess(); await assert.rejects(h.existing.prepareExisting(actor, input), code("FORBIDDEN"));
  assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
});
test("SYNTHETIC existing transfer enforces positive-only intent, strict proposal and poisons caught number/write attempts", async () => {
  const h = await existingSetup(), input = h.input(), beforeInput = structuredClone(input), before = h.store.snapshot();
  for (const quantity of ["0", "-1", "1.5"]) await assert.rejects(h.existing.prepareExisting(actor, { ...input, lines: [{ ...input.lines[0]!, quantity }] }));
  await assert.rejects(h.existing.prepareExisting(actor, { ...input, toWarehouseId: input.fromWarehouseId }), code("SAME_WAREHOUSE"));
  const malicious = createNativeTransferExistingPreparation({ ...h.dependencies, references: { async assertValid(tx) {
    try { await tx.reserveRuntimeDocumentNumber!({ kind: "TRANSFER", documentId: h.initial.header.id, actorAccountId: actor.accountId }); } catch { /* Forbidden attempt cannot be hidden. */ }
  } } });
  await assert.rejects(malicious.prepareExisting(actor, input), code("NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE"));
  assert.deepEqual(h.store.snapshot(), before); assert.deepEqual(input, beforeInput); assert.ok(!h.trace.some(v => v.startsWith("WRITE:")));
});
