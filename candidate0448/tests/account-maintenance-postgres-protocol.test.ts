/** Actual shared driver and account leaf against scripted replies, not engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { createAccountMaintenanceService } from "../packages/application/src/account-maintenance-service.ts";
import { PostgresAccountMaintenanceUnitOfWork } from "../adapters/postgres/src/account-maintenance-store.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("account", n), target = id(10), staffId = id(20), timestamp = "2026-10-21T01:00:00.123456Z";
function setup(options: { otherAdmin?: boolean; employment?: string; role?: string; ownerRole?: string; receiptFault?: boolean; commitFault?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let sequence = 100;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,staff_id,login_name")) return { rows: [{ id: target, staff_id: staffId, login_name: "SOURCE LOGIN", login_enabled: true, auth_version: 7, version: 9, created_at: timestamp, updated_at: timestamp }], rowCount: 1 };
    if (sql.startsWith("SELECT id,role,employment_status")) return { rows: [{ id: staffId, role: options.ownerRole ?? "ADMIN", employment_status: options.employment ?? "在职", hall_id: null }], rowCount: 1 };
    if (sql.includes("account-maintenance:other-admin")) return { rows: [{ available: options.otherAdmin ?? true }], rowCount: 1 };
    if (sql.includes("maintenance:audit")) return { rows: [], rowCount: 1 };
    if (sql.includes("maintenance:complete")) { if (options.receiptFault) throw Error("SYNTHETIC RECEIPT FAULT"); return { rows: [{ result_data: JSON.parse(values[7] as string) as unknown }], rowCount: 1 }; }
    if (sql === "COMMIT" && options.commitFault) throw Error("UNKNOWN COMMIT");
    return { rows: [], rowCount: sql.startsWith("UPDATE") || sql.startsWith("INSERT") ? 1 : 0 };
  }, release(error?: unknown) { releases.push(error); } }; } });
  return { calls, releases, service: createAccountMaintenanceService({ unitOfWork: new PostgresAccountMaintenanceUnitOfWork(driver), credentials: null, now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++) }) };
}
const disable = { action: "DISABLE", requestKey: "disable", id: target, expectedVersion: 9 };
test("account PG protocol: global-admin/key/current/target lock order, CAS+auth invalidation and audit/receipt share one client", async () => {
  const f = setup(); const result = await f.service.execute(actor, disable); assert.equal(result.version, 10);
  const admin = f.calls.findIndex(c => c.sql.includes("maintenance:administrator-lock")), key = f.calls.findIndex(c => c.values[0]?.toString().startsWith("naijue:receipt:")), identity = f.calls.findIndex(c => c.sql.includes("maintenance:identity")), targetLock = f.calls.findIndex(c => c.sql.startsWith("SELECT id,staff_id"));
  assert.ok(admin < key && key < identity && identity < targetLock); assert.match(f.calls[targetLock]!.sql, /ORDER BY id FOR UPDATE/);
  const update = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.user_account"))!; assert.match(update.sql, /auth_version=\$9 AND version=\$10/); assert.doesNotMatch(update.sql, /password_hash/); assert.equal(update.values[4], 8); assert.equal(update.values[5], 10); assert.equal(update.values[6], timestamp);
  const session = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.auth_session"))!; assert.deepEqual(session.values, [target, "2026-10-22T08:30:00.000000Z"]); assert.match(session.sql, /revoked_at IS NULL/);
  assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:audit")) < f.calls.indexOf(update)); assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:complete")) > f.calls.indexOf(session)); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(f.releases, [undefined]);
  assert.ok(f.calls.filter(c => c.sql.includes("maintenance:audit") || c.sql.includes("maintenance:complete")).every(c => !JSON.stringify(c.values).includes("password")));
});
test("account PG protocol: last usable admin/current role/inactive staff rejection precedes root mutation", async () => {
  const last = setup({ otherAdmin: false }); await assert.rejects(last.service.execute(actor, disable), { code: "LAST_AVAILABLE_ADMIN" }); assert.equal(last.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!last.calls.some(c => c.sql.startsWith("UPDATE")));
  const denied = setup({ role: "WAREHOUSE" }); await assert.rejects(denied.service.execute(actor, disable), { code: "FORBIDDEN" }); assert.ok(!denied.calls.some(c => c.sql.startsWith("SELECT id,staff_id")));
  const inactive = setup({ employment: "离职" }); await assert.rejects(inactive.service.execute(actor, { action: "EDIT", requestKey: "edit", id: target, expectedVersion: 9, values: { loginName: "CHANGED", loginEnabled: true } }), { code: "ACCOUNT_REFERENCE_UNAVAILABLE" }); assert.ok(!inactive.calls.some(c => c.sql.startsWith("UPDATE")));
});
test("account PG protocol: receipt failure rolls back session/root; unknown COMMIT discards with no rollback", async () => {
  const f = setup({ receiptFault: true }); await assert.rejects(f.service.execute(actor, disable)); assert.ok(f.calls.some(c => c.sql.startsWith("UPDATE naijue_erp.auth_session"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  const g = setup({ commitFault: true }); await assert.rejects(g.service.execute(actor, disable), /UNKNOWN COMMIT/); assert.equal(g.calls.at(-1)!.sql, "COMMIT"); assert.ok(!g.calls.some(c => c.sql === "ROLLBACK")); assert.ok(g.releases[0] instanceof Error);
});
