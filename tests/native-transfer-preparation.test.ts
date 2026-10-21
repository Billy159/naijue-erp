import assert from "node:assert/strict";
import test from "node:test";
import { loadNativeTransferSnapshots } from "../adapters/postgres/src/native-transfer-snapshots.ts";
import { createNativeTransferPreparation, createNativeManualTransferReferences } from "../packages/application/src/native-transfer-preparation.ts";
import { fixture, ids, actor } from "./support/synthetic-transfer.ts";
import { sid, snapshot } from "./support/synthetic-fixtures.ts";
import type { TransferDependencies } from "../packages/application/src/transfer-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
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
