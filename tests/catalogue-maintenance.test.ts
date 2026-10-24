/** New catalogue transaction rules; synthetic state only, not a PostgreSQL engine. */
import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogueMaintenanceService } from "../packages/application/src/catalogue-maintenance-service.ts";
import type { CatalogueMaintenanceDependencies, CatalogueWriteRecord, CategoryOrderEvidence, CategoryOrderResult, CategoryWriteRecord } from "../packages/application/src/catalogue-maintenance-ports.ts";
import { checkedCategoryOrderEvidence, checkedCategoryOrderResult, parseCatalogueMaintenanceCommand } from "../packages/application/src/catalogue-maintenance-validation.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("category", n);
function orderFixture(orders = [-7, -7, 90], parentId: string | null = null) {
  const rows = new Map<string, CategoryWriteRecord>(orders.map((displayOrder, i) => [id(i + 1), { id: id(i + 1), kind: "CATEGORY", name: `SOURCE ${i}`, parentId, displayOrder, version: i + 5, deletedAt: null }]));
  const receipts = new Map<string, MaintenanceReceipt>(), audits: MaintenanceCompletion[] = [], writes: string[] = [];
  let sequence = 1000, allowed = true, failAfter = 0, prepared: MaintenanceCompletion | undefined;
  const sorted = () => [...rows.values()].sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1));
  const expected = () => sorted().map(r => ({ id: r.id, expectedVersion: r.version }));
  const dependencies: CatalogueMaintenanceDependencies = { now: () => "2026-10-24T03:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) {
    const before = structuredClone(rows), priorReceipts = structuredClone(receipts), priorAudits = audits.length, priorWrites = writes.length; prepared = undefined;
    try { return await work({ async lockDirectory() {}, async load() { throw Error("Single-root fallback forbidden"); }, async put() { throw Error("Single-root fallback forbidden"); }, async validateChange() {}, async assertUnreferenced() {},
      evidence: { async assertAllowed() { requireDomain(allowed, "FORBIDDEN", "SYNTHETIC revoked role"); }, async getReceipt(_a, key) { return receipts.get(key); },
        async prepare(c) { assert.equal(prepared, undefined); prepared = structuredClone(c); audits.push(structuredClone(c)); },
        async complete(c) { assert.deepEqual(c, prepared); const e = checkedCategoryOrderEvidence(c.afterValues.category_order);
          const result: CategoryOrderResult = { operationId: c.operationId, kind: "CATEGORY", targetId: c.targetId, version: c.newVersion,
            order: { parentId: e.parent_id, undoOfOperationId: e.undo_of_operation_id, members: e.rows.map(r => ({ id: r.id, version: r.version, displayOrder: r.display_order })).sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1)) } };
          receipts.set(c.requestKey, { requestHash: c.requestHash, action: c.action, completedAt: c.completedAt, result }); return result;
        } },
      categoryOrder: { async assertReady() {}, async loadSiblings(parent) { return structuredClone([...rows.values()].filter(r => r.parentId === parent && r.deletedAt === null)); },
        async loadOriginal(operation, account) { const c = audits.find(a => a.operationId === operation && a.action === "REORDER" && a.actorAccountId === account); if (!c) return undefined;
          return { actorAccountId: c.actorAccountId, result: checkedCategoryOrderResult(receipts.get(c.requestKey)!.result), before: checkedCategoryOrderEvidence(c.beforeValues!.category_order), after: checkedCategoryOrderEvidence(c.afterValues.category_order) }; },
        async put(previous, next) { assert.ok(prepared, "audit must precede all mutations"); assert.equal(rows.get(previous.id)!.version, previous.version); rows.set(next.id, structuredClone(next)); writes.push(next.id); if (failAfter && writes.length - priorWrites === failAfter) throw Error("SYNTHETIC mid-batch fault"); }
      } });
    } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of priorReceipts) receipts.set(k, v); audits.length = priorAudits; writes.length = priorWrites; throw error; }
  } } };
  return { service: createCatalogueMaintenanceService(dependencies), rows, receipts, audits, writes, expected, sorted,
    command: (key = "order") => ({ action: "REORDER", requestKey: key, parentId, movedId: id(3), expectedSiblings: expected(), orderedIds: [id(3), id(1), id(2), ...orders.slice(3).map((_n, i) => id(i + 4))] }),
    revoke: () => { allowed = false; }, failAfter: (n: number) => { failAfter = n; } };
}
test("v15 category order: complete NULL-parent reorder, one audit/receipt and exact server-side undo with increasing versions", async () => {
  const f = orderFixture(), before = structuredClone([...f.rows.values()]), command = f.command();
  const saved = checkedCategoryOrderResult(await f.service.execute(actor, "CATEGORY", command));
  assert.deepEqual(saved.order.members.map(r => [r.id, r.displayOrder]), [[id(3), 0], [id(1), 1], [id(2), 2]]);
  assert.equal(saved.targetId, id(1)); assert.equal(f.audits.length, 1); assert.equal(f.receipts.size, 1); assert.equal(f.writes.length, 3);
  assert.deepEqual([...f.rows.values()].map(r => r.name), before.map(r => r.name));
  assert.deepEqual(await f.service.execute(actor, "CATEGORY", command), saved); assert.equal(f.audits.length, 1);
  const undo = { action: "UNDO_REORDER", requestKey: "undo", originalOperationId: saved.operationId, expectedSiblings: f.expected() };
  const undone = checkedCategoryOrderResult(await f.service.execute(actor, "CATEGORY", undo));
  assert.deepEqual(undone.order.members.map(r => [r.id, r.displayOrder]), before.map(r => [r.id, r.displayOrder]));
  assert.ok(before.every(r => f.rows.get(r.id)!.version === r.version + 2)); assert.equal(undone.order.undoOfOperationId, saved.operationId);
  assert.equal(f.audits.length, 2); assert.deepEqual((await f.service.receipt(actor, "CATEGORY", "undo")).result, undone);
  assert.deepEqual(await f.service.execute(actor, "CATEGORY", undo), undone); assert.equal(f.audits.length, 2);
  await assert.rejects(f.service.execute(actor, "CATEGORY", { ...undo, requestKey: "undo-again", expectedSiblings: f.expected() }), { code: "CATEGORY_UNDO_CONFLICT" });
  await assert.rejects(f.service.execute(actor, "CATEGORY", { ...command, orderedIds: [id(2), id(3), id(1)] }), { code: "IDEMPOTENCY_CONFLICT" });
  f.revoke(); await assert.rejects(f.service.execute(actor, "CATEGORY", command), { code: "FORBIDDEN" });
});
test("v15 category order: unchanged siblings keep versions; membership, parent, CAS, relative moves and undo poststate conflicts are atomic", async () => {
  const parent = id(99), f = orderFixture([0, 1, 2, 3], parent);
  const command = { ...f.command(), orderedIds: [id(1), id(3), id(2), id(4)] };
  const saved = checkedCategoryOrderResult(await f.service.execute(actor, "CATEGORY", command));
  assert.deepEqual(f.writes, [id(2), id(3)]); assert.equal(f.rows.get(id(1))!.version, 5); assert.equal(f.rows.get(id(4))!.version, 8);
  const baseline = structuredClone([...f.rows.values()]);
  const undo = { action: "UNDO_REORDER", requestKey: "undo", originalOperationId: saved.operationId, expectedSiblings: f.expected() };
  f.rows.set(id(1), { ...f.rows.get(id(1))!, name: "RENAMED", version: 6 });
  await assert.rejects(f.service.execute(actor, "CATEGORY", { ...undo, expectedSiblings: f.expected() }), { code: "CATEGORY_UNDO_CONFLICT" });
  f.rows.set(id(1), baseline[0]!);
  for (const changed of [
    { ...f.command("wrong-parent"), parentId: null },
    { ...f.command("stale"), expectedSiblings: f.expected().map((r, i) => ({ ...r, expectedVersion: r.expectedVersion + (i === 0 ? 1 : 0) })) },
    { ...f.command("relative"), orderedIds: [id(3), id(2), id(1), id(4)] },
    { ...f.command("no-op"), orderedIds: f.sorted().map(r => r.id) }
  ]) await assert.rejects(f.service.execute(actor, "CATEGORY", changed), error => error instanceof Error && "code" in error && ["CATEGORY_ORDER_CONFLICT", "NO_CATALOGUE_CHANGE"].includes(String(error.code)));
  assert.deepEqual([...f.rows.values()], baseline); assert.equal(f.audits.length, 1);
});
test("v15 category order: incomplete sets, deleted/missing rows, version overflow and a mid-batch fault never commit a subset", async () => {
  for (const mutation of ["missing", "deleted", "overflow", "failure"] as const) {
    const f = orderFixture(), command = f.command();
    if (mutation === "missing") f.rows.delete(id(2));
    if (mutation === "deleted") f.rows.set(id(2), { ...f.rows.get(id(2))!, deletedAt: "2026-10-24T02:00:00Z" });
    if (mutation === "overflow") { f.rows.set(id(2), { ...f.rows.get(id(2))!, version: 2147483647 }); command.expectedSiblings = f.expected(); }
    if (mutation === "failure") f.failAfter(1);
    const before = structuredClone([...f.rows.values()]); await assert.rejects(f.service.execute(actor, "CATEGORY", command));
    assert.deepEqual([...f.rows.values()], before); assert.equal(f.audits.length, 0); assert.equal(f.receipts.size, 0); assert.equal(f.writes.length, 0);
  }
});
test("v15 category order: strict new commands are CATEGORY-only and an absent v15 capability cannot use single-root writes", async () => {
  const f = orderFixture(), command = f.command();
  for (const input of [{ ...command, values: { name: "INJECT" } }, { ...command, parentId: "all" }, { ...command, expectedSiblings: [command.expectedSiblings[0]] },
    { ...command, orderedIds: [id(1), id(1), id(3)] }, { ...command, expectedSiblings: command.expectedSiblings.map(r => ({ ...r, expectedVersion: 0 })) },
    { action: "UNDO_REORDER", requestKey: "u", originalOperationId: id(100), expectedSiblings: command.expectedSiblings, orders: [-1] }])
    assert.throws(() => parseCatalogueMaintenanceCommand("CATEGORY", input), { code: "INVALID_CATALOGUE_COMMAND" });
  for (const kind of ["COLOR", "FIT"] as const) await assert.rejects(f.service.execute(actor, kind, command), { code: "INVALID_CATALOGUE_COMMAND" });
  const old = fixture(); await assert.rejects(old.service.execute(actor, "CATEGORY", command), { code: "CATALOGUE_ORDER_NOT_READY" }); assert.equal(old.rows.size, 0);
});
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
