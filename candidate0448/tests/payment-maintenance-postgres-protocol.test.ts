/** Actual central D1 and leaf code with scripted SQL replies; not an engine test. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresPaymentMaintenanceUnitOfWork } from "../adapters/postgres/src/payment-maintenance-store.ts";
import { createPaymentMaintenanceService } from "../packages/application/src/payment-maintenance-service.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("paymentAccount", n), target = id(10), methodId = id(1), oldHall = id(2), retainedHall = id(3), newHall = id(4);
function setup(options: { methodEnabled?: boolean; newHallEnabled?: boolean; methodReferenced?: boolean; receiptFault?: boolean; commitFault?: boolean; role?: string; retainedSource?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let sequence = 500;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { return {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values: structuredClone(values) });
      if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
      if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
      if (sql.startsWith("SELECT id,name,enabled,version")) return { rows: [{ id: target, name: "SOURCE ACCOUNT", enabled: true, version: 7, payment_method_id: methodId }], rowCount: 1 };
      if (sql.startsWith("SELECT hall_id")) return { rows: [{ hall_id: oldHall }, { hall_id: retainedHall }], rowCount: 2 };
      if (sql.startsWith("SELECT id,enabled FROM naijue_erp.payment_method")) return { rows: [{ id: methodId, enabled: options.methodEnabled ?? true }], rowCount: 1 };
      if (sql.startsWith("SELECT id,enabled FROM naijue_erp.hall")) return { rows: [{ id: retainedHall, enabled: false }, { id: newHall, enabled: options.newHallEnabled ?? true }], rowCount: 2 };
      if (sql.startsWith("SELECT EXISTS")) return { rows: [{ referenced: options.methodReferenced ?? false }], rowCount: 1 };
      if (sql.startsWith("DELETE FROM naijue_erp.payment_account_hall") && options.retainedSource) throw Object.assign(Error("RETAINED SOURCE"), { code: "23503" });
      if (sql.includes("maintenance:audit")) return { rows: [], rowCount: 1 };
    if (sql.includes("maintenance:complete")) { if (options.receiptFault) throw Error("PRIVATE RECEIPT FAULT"); return { rows: [{ result_data: JSON.parse(values[7] as string) as unknown }], rowCount: 1 }; }
      if (sql === "COMMIT" && options.commitFault) throw Error("UNKNOWN COMMIT");
      return { rows: [], rowCount: sql.startsWith("INSERT") || sql.startsWith("UPDATE") || sql.startsWith("DELETE") ? 1 : 0 };
    }, release(error?: unknown) { releases.push(error); }
  }; } });
  return { calls, releases, service: createPaymentMaintenanceService({ unitOfWork: new PostgresPaymentMaintenanceUnitOfWork(driver), now: () => "2026-10-22T07:00:00Z", newId: kind => sid(kind, sequence++) }) };
}
const edit = { action: "EDIT", requestKey: "edit-account", id: target, expectedVersion: 7, values: { name: "SOURCE ACCOUNT", enabled: true, paymentMethodId: methodId, hallIds: [retainedHall, newHall] } };
test("payment PG protocol: locked root CAS, minimal link delta, real audit and strict receipt share original client", async () => {
  const f = setup(), result = await f.service.execute(actor, "PAYMENT_ACCOUNT", edit);
  assert.equal(result.version, 8); assert.equal(f.calls[0]!.sql, "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(f.releases, [undefined]);
  const update = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.payment_account"))!; assert.match(update.sql, /version=\$5 AND payment_method_id=\$6::uuid/); assert.deepEqual(update.values, [target, "SOURCE ACCOUNT", true, 8, 7, methodId]);
  assert.deepEqual(f.calls.find(c => c.sql.startsWith("DELETE FROM"))!.values, [target, [oldHall]]); assert.deepEqual(f.calls.find(c => c.sql.startsWith("INSERT INTO naijue_erp.payment_account_hall"))!.values, [target, [newHall]]);
  const audit = f.calls.find(c => c.sql.includes("maintenance:audit"))!; assert.ok(f.calls.indexOf(audit) < f.calls.indexOf(update)); assert.deepEqual(Object.keys(JSON.parse(audit.values[8] as string) as object).sort(), ["payment_halls", "version"]);
  assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:complete")) > f.calls.findIndex(c => c.sql.startsWith("DELETE FROM")));
  assert.ok(f.calls.every(c => !/inventory|ledger|sales_header|history_|password_hash/.test(c.sql)));
});
test("payment PG protocol: disabled new references, retained source, role and receipt failures roll back without commit", async () => {
  for (const [options, code] of [[{ methodEnabled: false }, "PAYMENT_REFERENCE_UNAVAILABLE"], [{ newHallEnabled: false }, "PAYMENT_REFERENCE_UNAVAILABLE"], [{ retainedSource: true }, "PAYMENT_RELATION_IN_USE"], [{ role: "SALESPERSON" }, "FORBIDDEN"]] as const) {
    const f = setup(options); await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", edit), { code }); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.calls.some(c => c.sql.includes("maintenance:complete")));
  }
  const f = setup({ receiptFault: true }); await assert.rejects(f.service.execute(actor, "PAYMENT_ACCOUNT", edit)); assert.ok(f.calls.some(c => c.sql.startsWith("UPDATE naijue_erp.payment_account"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
});
test("payment PG protocol: method disabling rejects live account; uncertain COMMIT discards without rollback", async () => {
  const f = setup({ methodReferenced: true }); await assert.rejects(f.service.execute(actor, "PAYMENT_METHOD", { action: "DISABLE", requestKey: "disable-method", id: target, expectedVersion: 7 }), { code: "PAYMENT_METHOD_IN_USE" });
  assert.ok(!f.calls.some(c => c.sql.startsWith("UPDATE naijue_erp.payment_method"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  const g = setup({ commitFault: true }); await assert.rejects(g.service.execute(actor, "PAYMENT_ACCOUNT", edit), /UNKNOWN COMMIT/); assert.equal(g.calls.at(-1)!.sql, "COMMIT"); assert.ok(!g.calls.some(c => c.sql === "ROLLBACK")); assert.ok(g.releases[0] instanceof Error);
});
