/** New catalogue transaction rules; synthetic state only, not a PostgreSQL engine. */
import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogueMaintenanceService } from "../packages/application/src/catalogue-maintenance-service.ts";
import type { CatalogueMaintenanceDependencies, CatalogueWriteRecord } from "../packages/application/src/catalogue-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("category", n);
function fixture() {
  let sequence = 100, allow = true, referenced = false, fault = false; const rows = new Map<string, CatalogueWriteRecord>(), receipts = new Map<string, MaintenanceReceipt>(), audit: MaintenanceCompletion[] = [];
  const dependencies: CatalogueMaintenanceDependencies = { now: () => "2026-10-22T08:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) {
    const before = structuredClone(rows), prior = structuredClone(receipts), length = audit.length;
    try { return await work({ async lockDirectory() {}, evidence: {
      async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); }, async getReceipt(_actor, key) { return receipts.get(key); },
      async complete(c) { if (fault) throw Error("SYNTHETIC FAILURE"); const result = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; audit.push(structuredClone(c)); receipts.set(c.requestKey, { requestHash: c.requestHash, action: c.action, completedAt: c.completedAt, result }); return result; }
    }, async load(kind, target) { const row = rows.get(target); return row?.kind === kind ? structuredClone(row) : undefined; }, async validateChange() {}, async assertUnreferenced() { requireDomain(!referenced, "CATALOGUE_IN_USE", "SYNTHETIC REFERENCE"); },
    async put(previous, next) { requireDomain(rows.get(next.id)?.version === previous?.version, "VERSION_CONFLICT", "SYNTHETIC CAS"); rows.set(next.id, structuredClone(next)); } });
    } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of prior) receipts.set(k, v); audit.length = length; throw error; }
  } } };
  return { service: createCatalogueMaintenanceService(dependencies), dependencies, rows, receipts, audit, referenced: () => { referenced = true; }, fault: () => { fault = true; }, revoke: () => { allow = false; } };
}
test("catalogue write: three native families, original-key replay, sparse edit and retained irreversible deletion", async () => {
  for (const kind of ["CATEGORY", "COLOR", "FIT"] as const) {
    const f = fixture(), values = kind === "CATEGORY" ? { name: "SOURCE", parentId: null, displayOrder: -1 } : { name: "SOURCE", code: kind === "FIT" ? "A" : "001", enabled: true }, c = { action: "CREATE", requestKey: "create", values };
    const saved = await f.service.execute(actor, kind, c); assert.deepEqual(await f.service.execute(actor, kind, c), saved); assert.equal(f.audit.length, 1);
    await f.service.execute(actor, kind, { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1, values: { ...values, name: "RENAMED" } }); assert.deepEqual(Object.keys(f.audit[1]!.afterValues).sort(), ["name", "version"]);
    const deleted = await f.service.execute(actor, kind, { action: "DELETE", requestKey: "delete", id: saved.targetId, expectedVersion: 2 }); assert.equal(deleted.version, 3); assert.equal(f.rows.get(saved.targetId)!.deletedAt, "2026-10-22T08:00:00Z"); assert.equal(f.rows.size, 1);
    await assert.rejects(f.service.execute(actor, kind, { action: "EDIT", requestKey: "edit-deleted", id: saved.targetId, expectedVersion: 3, values }), { code: "CATALOGUE_DELETED" }); assert.deepEqual((await f.service.receipt(actor, kind, "delete")).result, deleted);
  }
});
test("catalogue write: reference/receipt failures, version conflicts and current denial never change native facts", async () => {
  const f = fixture(), values = { name: "SOURCE", code: "001", enabled: true }, saved = await f.service.execute(actor, "COLOR", { action: "CREATE", requestKey: "create", values }); f.referenced();
  await assert.rejects(f.service.execute(actor, "COLOR", { action: "DELETE", requestKey: "delete", id: saved.targetId, expectedVersion: 1 }), { code: "CATALOGUE_IN_USE" });
  await assert.rejects(f.service.execute(actor, "COLOR", { action: "DISABLE", requestKey: "stale", id: saved.targetId, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  f.fault(); await assert.rejects(f.service.execute(actor, "COLOR", { action: "DISABLE", requestKey: "fault", id: saved.targetId, expectedVersion: 1 })); assert.equal(f.rows.get(saved.targetId)!.version, 1); assert.ok(!f.receipts.has("fault"));
  f.revoke(); await assert.rejects(f.service.receipt(actor, "COLOR", "create"), { code: "FORBIDDEN" });
});
test("catalogue write: category has no invented enabled/code fields; fit requires one uppercase code; explicit order is bounded", async () => {
  const f = fixture();
  for (const [kind, values] of [["CATEGORY", { name: "C", enabled: true, parentId: null, displayOrder: 0 }], ["CATEGORY", { name: "C", parentId: id(1), displayOrder: 0.1 }], ["FIT", { name: "F", code: "AA", enabled: true }], ["FIT", { name: "F", code: "a", enabled: true }]] as const)
    await assert.rejects(f.service.execute(actor, kind, { action: "CREATE", requestKey: "invalid", values }), { code: "INVALID_CATALOGUE_COMMAND" });
  await assert.rejects(f.service.execute(actor, "CATEGORY", { action: "DISABLE", requestKey: "invalid", id: id(1), expectedVersion: 1 }), { code: "INVALID_CATALOGUE_COMMAND" }); assert.equal(f.rows.size, 0);
});
test("catalogue write: color/fit disabling and restoring preserve exact code, reject repeated state and keep sparse audit", async () => {
  for (const kind of ["COLOR", "FIT"] as const) {
    const f = fixture(), values = { name: "SOURCE", code: kind === "FIT" ? "A" : "001", enabled: true }, saved = await f.service.execute(actor, kind, { action: "CREATE", requestKey: "create", values });
    await f.service.execute(actor, kind, { action: "DISABLE", requestKey: "disable", id: saved.targetId, expectedVersion: 1 });
    assert.deepEqual(f.audit[1]!.afterValues, { version: 2, enabled: false });
    await assert.rejects(f.service.execute(actor, kind, { action: "DISABLE", requestKey: "again", id: saved.targetId, expectedVersion: 2 }), { code: "INVALID_CATALOGUE_STATE" });
    await f.service.execute(actor, kind, { action: "RESTORE", requestKey: "restore", id: saved.targetId, expectedVersion: 2 });
    assert.deepEqual(f.audit[2]!.afterValues, { version: 3, enabled: true }); assert.equal((f.rows.get(saved.targetId)! as Extract<CatalogueWriteRecord, { kind: "COLOR" | "FIT" }>).code, values.code);
  }
});
