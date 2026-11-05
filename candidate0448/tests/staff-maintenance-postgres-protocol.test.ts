/** Actual shared transaction driver + staff leaf, scripted replies only; no engine claim. */
import test from "node:test";
import assert from "node:assert/strict";
import { createStaffMaintenanceService } from "../packages/application/src/staff-maintenance-service.ts";
import { PostgresStaffMaintenanceUnitOfWork } from "../adapters/postgres/src/staff-maintenance-store.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const target = sid("staff", 20), accountId = sid("account", 10), stamp = "2026-10-21T01:00:00.123456Z";
function setup(options: { otherAdmin?: boolean; role?: string; targetRole?: string; hallEnabled?: boolean; staleAccount?: boolean; receiptFault?: boolean; commitFault?: boolean; passwordHash?: () => Promise<string> } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let sequence = 100, connections = 0;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { connections++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: sid("staff", 99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,staff_id,login_name")) return { rows: [{ id: accountId, staff_id: target, login_name: "SOURCE LOGIN", login_enabled: true, auth_version: 7, version: 9, created_at: stamp, updated_at: stamp }], rowCount: 1 };
    if (sql.startsWith("SELECT id,name,role")) return { rows: [{ id: target, name: "合成员工", role: options.targetRole ?? "ADMIN", hall_id: null, contact: null, employment_status: "在职", version: 4 }], rowCount: 1 };
    if (sql.startsWith("SELECT id,enabled")) return { rows: (values[0] as string[]).map(id => ({ id, enabled: options.hallEnabled ?? true })), rowCount: (values[0] as string[]).length };
    if (sql.includes("staff-maintenance:other-admin")) return { rows: [{ available: options.otherAdmin ?? true }], rowCount: 1 };
    if (sql.startsWith("UPDATE naijue_erp.user_account") && options.staleAccount) return { rows: [], rowCount: 0 };
    if (sql.includes("maintenance:audit")) return { rows: [], rowCount: 1 };
    if (sql.includes("maintenance:complete")) { if (options.receiptFault) throw Error("SYNTHETIC RECEIPT FAULT"); return { rows: [{ result_data: JSON.parse(values[7] as string) as unknown }], rowCount: 1 }; }
    if (sql === "COMMIT" && options.commitFault) throw Error("UNKNOWN COMMIT");
    return { rows: [], rowCount: sql.startsWith("UPDATE") || sql.startsWith("INSERT") ? 1 : 0 };
  }, release(error?: unknown) { releases.push(error); } }; } });
  return { calls, releases, connections: () => connections, service: createStaffMaintenanceService({ unitOfWork: new PostgresStaffMaintenanceUnitOfWork(driver), credentials: options.passwordHash ? {passwords:{hash:options.passwordHash,async verify(){return false;}},credentialRequestTag:()=>"a".repeat(64),assertNewPassword:()=>undefined} : null, now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++) }) };
}
const leave = { action: "LEAVE", requestKey: "leave", id: target, expectedVersion: 4 };
test("staff PG protocol: global/key/identity then account/staff locks; root, child and sessions share one original transaction", async () => {
  const f = setup(), saved = await f.service.execute(actor, leave); assert.equal(saved.version, 5); assert.equal(f.connections(), 1);
  const order = [f.calls.findIndex(c => c.sql.includes("maintenance:administrator-lock")), f.calls.findIndex(c => c.values[0]?.toString().startsWith("naijue:receipt:")), f.calls.findIndex(c => c.sql.includes("maintenance:identity")), f.calls.findIndex(c => c.sql.startsWith("SELECT id,staff_id")), f.calls.findIndex(c => c.sql.startsWith("SELECT id,name,role"))]; assert.ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1]!)));
  for (const index of order.slice(3)) assert.match(f.calls[index]!.sql, /ORDER BY id FOR UPDATE/);
  const staff = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.staff"))!; assert.match(staff.sql, /version=\$8/); assert.equal(staff.values[5], "离职"); assert.equal(staff.values[7], 4);
  const account = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.user_account"))!; assert.doesNotMatch(account.sql, /password_hash/); assert.match(account.sql, /auth_version=\$9 AND version=\$10/); assert.equal(account.values[3], false); assert.equal(account.values[4], 8); assert.equal(account.values[5], 10); assert.equal(account.values[6], stamp);
  const sessions = f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.auth_session"))!; assert.match(sessions.sql, /revoked_at IS NULL/); assert.deepEqual(sessions.values, [accountId, "2026-10-22T08:30:00.000000Z"]);
  const audit = f.calls.find(c => c.sql.includes("maintenance:audit"))!; assert.ok(f.calls.indexOf(audit) < f.calls.indexOf(staff)); assert.ok(f.calls.findIndex(c => c.sql.includes("maintenance:complete")) > f.calls.indexOf(sessions)); const before = JSON.parse(audit.values[7] as string), after = JSON.parse(audit.values[8] as string); assert.equal(before.accounts[0].created_at, stamp); assert.equal(after.accounts[0].created_at, stamp); assert.equal(after.accounts[0].login_enabled, false); assert.equal(after.accounts[0].version, 10); assert.ok(!JSON.stringify(audit.values).includes("password")); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(f.releases, [undefined]);
});
test("staff PG protocol: leaving/demoting last available admin, unavailable hall and revoked actor fail before business writes", async () => {
  const last = setup({ otherAdmin: false }); await assert.rejects(last.service.execute(actor, leave), { code: "LAST_AVAILABLE_ADMIN" }); assert.ok(!last.calls.some(c => c.sql.startsWith("UPDATE")));
  const edit = { action: "EDIT", requestKey: "role", id: target, expectedVersion: 4, values: { name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null }, account: null };
  const demote = setup({ otherAdmin: false }); await assert.rejects(demote.service.execute(actor, edit), { code: "LAST_AVAILABLE_ADMIN" });
  const hall = setup({ hallEnabled: false }); await assert.rejects(hall.service.execute(actor, { ...edit, values: { ...edit.values, hallId: sid("hall", 30) } }), { code: "STAFF_REFERENCE_UNAVAILABLE" }); assert.ok(!hall.calls.some(c => c.sql.startsWith("UPDATE")));
  const denied = setup({ role: "WAREHOUSE" }); await assert.rejects(denied.service.execute(actor, leave), { code: "FORBIDDEN" }); assert.ok(!denied.calls.some(c => c.sql.startsWith("SELECT id,staff_id")));
});
test("staff PG protocol: account CAS or receipt failure rolls back the original staff/account operation", async () => {
  for (const options of [{ staleAccount: true }, { receiptFault: true }]) { const f = setup(options); await assert.rejects(f.service.execute(actor, leave)); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.equal(f.calls.filter(c => c.sql === "COMMIT").length, 0); assert.deepEqual(f.releases, [undefined]); }
});
test("staff PG protocol: uncertain COMMIT discards connection without rollback or automatic replay", async () => {
  const f = setup({ commitFault: true }); await assert.rejects(f.service.execute(actor, leave), /UNKNOWN COMMIT/); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.ok(!f.calls.some(c => c.sql === "ROLLBACK")); assert.equal(f.connections(), 1); assert.equal(f.releases.length, 1); assert.ok(f.releases[0] instanceof Error);
});

test("staff PG credential protocol: preliminary key/current-authority transaction releases before hash; final original transaction owns all writes",async()=>{
  const encoded=`naijue:scrypt:1:32768:8:1:${"1".repeat(32)}:${"2".repeat(128)}`;
  const f=setup({passwordHash:async()=>{assert.equal(f.connections(),1);assert.equal(f.releases.length,1);assert.equal(f.calls.at(-1)!.sql,"COMMIT");assert.ok(!f.calls.some(c=>/^INSERT|^UPDATE/.test(c.sql)));return encoded;}});
  const result=await f.service.execute(actor,{action:"EDIT",requestKey:"p02-password-prepare",id:target,expectedVersion:4,values:{name:"合成员工",role:"ADMIN",hallId:null,contact:null},account:{id:accountId,expectedVersion:9,loginName:"SOURCE LOGIN",loginEnabled:true,password:"synthetic-password-only"}});
  assert.equal(result.version,5);assert.equal(f.connections(),2);assert.equal(f.releases.length,2);const first=f.calls.findIndex(c=>c.sql==="COMMIT");assert.ok(f.calls.filter(c=>/^INSERT|^UPDATE/.test(c.sql)).every(c=>f.calls.indexOf(c)>first));
  assert.equal(f.calls.filter(c=>c.sql.includes("maintenance:complete")).length,1);assert.equal(f.calls.at(-1)!.sql,"COMMIT");
});
