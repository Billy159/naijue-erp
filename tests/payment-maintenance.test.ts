/** Synthetic transaction laws; not PostgreSQL engine or released-host evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentMaintenanceService } from "../packages/application/src/payment-maintenance-service.ts";
import type { PaymentMaintenanceDependencies, PaymentRecord } from "../packages/application/src/payment-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("paymentAccount", n);
const account = (key = "create-account") => ({ action: "CREATE", requestKey: key, values: { name: "SYNTHETIC ACCOUNT", enabled: true, paymentMethodId: id(1), hallIds: [id(3), id(2)] } });
function fixture(prepareMode: "ready" | "missing" | "fail" = "ready") {
  let sequence = 100, allow = true, fault = false; const rows = new Map<string, PaymentRecord>(), receipts = new Map<string, MaintenanceReceipt>(), audit: MaintenanceCompletion[] = [];
  const dependencies: PaymentMaintenanceDependencies = { now: () => "2026-10-22T07:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: {
    async transaction(work) {
      let prepared: MaintenanceCompletion | undefined;
      const before = structuredClone(rows), priorReceipts = structuredClone(receipts), auditLength = audit.length;
      try { return await work({ evidence: {
        async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC ROLE DENIED"); },
        async getReceipt(_actor, key) { return structuredClone(receipts.get(key)); },
        ...(prepareMode === "missing" ? {} : { async prepare(c: MaintenanceCompletion) { if (prepareMode === "fail") throw Error("SYNTHETIC PREPARE FAILURE"); assert.equal(prepared, undefined); prepared = structuredClone(c); } }),
        async complete(c) { assert.deepEqual(c, prepared);
          if (fault) throw Error("SYNTHETIC RECEIPT FAILURE"); const result = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion };
          audit.push(structuredClone(c)); receipts.set(c.requestKey, { result, action: c.action, requestHash: c.requestHash, completedAt: c.completedAt }); return result;
        }
      }, async load(kind, target) { const r = rows.get(target); return r?.kind === kind ? structuredClone(r) : undefined; },
      async validateChange() {}, async put(previous, next) { assert.ok(prepared, "audit must precede business mutation"); requireDomain(rows.get(next.id)?.version === previous?.version, "VERSION_CONFLICT", "Synthetic CAS"); rows.set(next.id, structuredClone(next)); } });
      } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of priorReceipts) receipts.set(k, v); audit.length = auditLength; throw error; }
    }
  } };
  return { dependencies, service: createPaymentMaintenanceService(dependencies), rows, receipts, audit, revoke: () => { allow = false; }, fault: (v: boolean) => { fault = v; } };
}
test("prepared payment: actual root/complete hall set share original prepared evidence and unavailable preparation writes nothing", async () => {
  for (const mode of ["missing", "fail"] as const) { const f = fixture(mode); await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", account()), mode === "missing" ? { code: "MAINTENANCE_PREPARE_NOT_READY" } : /SYNTHETIC PREPARE FAILURE/); assert.equal(f.rows.size, 0); assert.equal(f.receipts.size, 0); }
  const f = fixture(), c = account(), saved = await f.service.execute(actor, "PAYMENT_ACCOUNT", c); assert.deepEqual(await f.service.execute(actor, "PAYMENT_ACCOUNT", c), saved); assert.equal(f.audit.length, 1); assert.ok(Array.isArray(f.audit[0]!.afterValues.payment_halls));
});
test("payment save: account multi-hall set, sparse root/relation audit and original-key recovery", async () => {
  const f = fixture(), c = account(), saved = await f.service.execute(actor, "PAYMENT_ACCOUNT", c);
  assert.deepEqual(Object.keys(saved).sort(), ["kind", "operationId", "targetId", "version"]); assert.deepEqual((f.rows.get(saved.targetId)! as Extract<PaymentRecord, { kind: "PAYMENT_ACCOUNT" }>).hallIds, [id(2), id(3)]);
  assert.deepEqual(await f.service.execute(actor, "PAYMENT_ACCOUNT", { ...c, values: { ...c.values, hallIds: [id(2), id(3)] } }), saved); assert.equal(f.audit.length, 1);
  assert.deepEqual((await f.service.receipt(actor, "PAYMENT_ACCOUNT", c.requestKey)).result, saved);
  const changed = await f.service.execute(actor, "PAYMENT_ACCOUNT", { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1, values: { ...c.values, hallIds: [id(3), id(4)] } });
  assert.equal(changed.version, 2); assert.deepEqual(Object.keys(f.audit[1]!.afterValues).sort(), ["payment_halls", "version"]);
  assert.deepEqual(f.audit[1]!.beforeValues!.payment_halls, [id(2), id(3)].map(hall_id => ({ payment_account_id: saved.targetId, hall_id })));
  assert.deepEqual(f.audit[1]!.afterValues.payment_halls, [id(3), id(4)].map(hall_id => ({ payment_account_id: saved.targetId, hall_id })));
});
test("payment save: immutable method, stale version, key conflict and duplicate associations preserve root", async () => {
  const f = fixture(), c = account(), saved = await f.service.execute(actor, "PAYMENT_ACCOUNT", c), before = structuredClone(f.rows);
  const edit = { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1, values: c.values };
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", { ...edit, values: { ...c.values, paymentMethodId: id(9) } }), { code: "IMMUTABLE_PAYMENT_METHOD" });
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", { ...edit, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", { ...c, values: { ...c.values, name: "CHANGED" } }), { code: "IDEMPOTENCY_CONFLICT" });
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", { ...c, values: { ...c.values, hallIds: [id(2), id(2)] } }), { code: "INVALID_PAYMENT_COMMAND" });
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", edit), { code: "NO_PAYMENT_CHANGE" }); assert.deepEqual(f.rows, before);
});
test("payment save: method/account lifecycle, empty explicit halls, current denial and receipt rollback", async () => {
  const f = fixture(), c = account(), saved = await f.service.execute(actor, "PAYMENT_ACCOUNT", { ...c, values: { ...c.values, hallIds: [] } });
  assert.deepEqual((f.rows.get(saved.targetId)! as Extract<PaymentRecord, { kind: "PAYMENT_ACCOUNT" }>).hallIds, []);
  await f.service.execute(actor, "PAYMENT_ACCOUNT", { action: "DISABLE", requestKey: "disable", id: saved.targetId, expectedVersion: 1 });
  await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", { action: "DISABLE", requestKey: "disable-again", id: saved.targetId, expectedVersion: 2 }), { code: "INVALID_PAYMENT_STATE" });
  await f.service.execute(actor, "PAYMENT_ACCOUNT", { action: "RESTORE", requestKey: "restore", id: saved.targetId, expectedVersion: 2 });
  const method = await f.service.execute(actor, "PAYMENT_METHOD", { action: "CREATE", requestKey: "method", values: { name: "SYNTHETIC METHOD", enabled: true } }); assert.equal(method.kind, "PAYMENT_METHOD");
  f.fault(true); const before = structuredClone(f.rows);
  await assert.rejects(f.service.execute(actor, "PAYMENT_METHOD", { action: "DISABLE", requestKey: "fault", id: method.targetId, expectedVersion: 1 })); assert.deepEqual(f.rows, before); assert.ok(!f.receipts.has("fault"));
  f.revoke(); await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", c), { code: "FORBIDDEN" }); await assert.rejects(f.service.receipt(actor, "PAYMENT_ACCOUNT", c.requestKey), { code: "FORBIDDEN" });
});
