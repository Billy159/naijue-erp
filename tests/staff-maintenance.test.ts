/** Synthetic atomic state and credentials, no database or real secret. */
import test from "node:test";
import assert from "node:assert/strict";
import { createStaffMaintenanceService } from "../packages/application/src/staff-maintenance-service.ts";
import type { StaffMaintenanceDependencies, StaffMaintenanceAggregate } from "../packages/application/src/staff-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { createNodeCredentialRequestTag } from "../packages/authentication/src/passwords.ts";
import { createSourceAuthenticationPolicy } from "../packages/authentication/src/source-policy.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const password = "SYNTHETIC-ONLY-PASSWORD", encoded = `naijue:scrypt:1:32768:8:1:${"1".repeat(32)}:${"2".repeat(128)}`;
const values = { name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null };
const create = { action: "CREATE", requestKey: "create", values, account: { id: null, expectedVersion: null, loginName: "EXACT LOGIN", loginEnabled: true, password } };
function fixture(credentialsAvailable = true, prepareMode: "ready" | "missing" | "fail" = "ready") {
  let sequence = 100, allow = true, fault = false, hashCalls = 0, revokes = 0;
  const rows = new Map<string, StaffMaintenanceAggregate>(), receipts = new Map<string, MaintenanceReceipt>(), audit: MaintenanceCompletion[] = [], hashes = new Map<string, string>();
  const credentials = { passwords: { async hash() { hashCalls++; return encoded; }, async verify() { return false; } }, credentialRequestTag: createNodeCredentialRequestTag(new Uint8Array(32).fill(6)), assertNewPassword: createSourceAuthenticationPolicy(3600).assertNewPassword };
  const dependencies: StaffMaintenanceDependencies = { now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++), credentials: credentialsAvailable ? credentials : null, unitOfWork: { async transaction(work) {
    let prepared: MaintenanceCompletion | undefined;
      const before = structuredClone(rows), prior = structuredClone(receipts), oldHashes = structuredClone(hashes), count = audit.length, oldRevokes = revokes;
    try { return await work({ evidence: {
      async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); }, async getReceipt(_actor, key) { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); return receipts.get(key); },
      ...(prepareMode === "missing" ? {} : { async prepare(c: MaintenanceCompletion) { if (prepareMode === "fail") throw Error("SYNTHETIC PREPARE FAILURE"); assert.equal(prepared, undefined); prepared = structuredClone(c); } }),
        async complete(x) { assert.deepEqual(x, prepared); if (fault) throw Error("SYNTHETIC RECEIPT FAULT"); const result = { operationId: x.operationId, kind: x.kind, targetId: x.targetId, version: x.newVersion }; audit.push(structuredClone(x)); receipts.set(x.requestKey, { result, requestHash: x.requestHash, action: x.action, completedAt: x.completedAt }); return result; }
    }, async load(id) { return structuredClone(rows.get(id)); }, async validateChange() {},
    async putStaff(previous, next) { assert.ok(prepared, "audit must precede business mutation"); rows.set(next.id, { staff: structuredClone(next), account: previous ? rows.get(previous.id)!.account : null }); },
    async putAccount(previous, next, hash) { const row = rows.get(next.staffId)!; rows.set(next.staffId, { staff: row.staff, account: structuredClone(next) }); if (hash) hashes.set(next.id, hash); if (previous) revokes++; }
    }); } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of prior) receipts.set(k, v); hashes.clear(); for (const [k, v] of oldHashes) hashes.set(k, v); audit.length = count; revokes = oldRevokes; throw error; }
  } } };
  return { dependencies, service: createStaffMaintenanceService(dependencies), rows, receipts, audit, hashes, hashCalls: () => hashCalls, revokes: () => revokes, revoke: () => { allow = false; }, fault: () => { fault = true; } };
}
test("prepared staff: combined account creation/reset versus lifecycle have exact prepared safe sets and credential action metadata", async () => {
  for (const mode of ["missing", "fail"] as const) { const f = fixture(true, mode); await assert.rejects(f.service.execute(actor, create), mode === "missing" ? { code: "MAINTENANCE_PREPARE_NOT_READY" } : /SYNTHETIC PREPARE FAILURE/); assert.equal(f.rows.size, 0); assert.equal(f.hashes.size, 0); assert.equal(f.receipts.size, 0); assert.equal(f.revokes(), 0); }
  const f = fixture(), saved = await f.service.execute(actor, create), account = f.rows.get(saved.targetId)!.account!;
  assert.deepEqual(f.audit[0]!.afterValues.account_credentials, [{ account_id: account.id, action: "CREATE" }]);
  await f.service.execute(actor, { action: "EDIT", requestKey: "prepared-reset", id: saved.targetId, expectedVersion: 1, values, account: { ...create.account, id: account.id, expectedVersion: 1, password: `${password}-NEW` } });
  assert.deepEqual(f.audit[1]!.afterValues.account_credentials, [{ account_id: account.id, action: "RESET_PASSWORD" }]);
  await f.service.execute(actor, { action: "LEAVE", requestKey: "prepared-leave", id: saved.targetId, expectedVersion: 2 }); await f.service.execute(actor, { action: "REINSTATE", requestKey: "prepared-reinstate", id: saved.targetId, expectedVersion: 3 });
  for (const evidence of f.audit.slice(2)) { assert.ok(!Object.hasOwn(evidence.afterValues, "account_credentials")); assert.equal((evidence.afterValues.accounts as Record<string, unknown>[])[0]!.login_enabled, false); }
  assert.equal(f.revokes(), 3); assert.ok(!JSON.stringify(f.audit).includes(password)); assert.ok(!JSON.stringify(f.audit).includes(encoded));
});
test("staff write: combined create is one receipt with safe child evidence and stable private replay", async () => {
  const f = fixture(), saved = await f.service.execute(actor, create), row = f.rows.get(saved.targetId)!;
  assert.equal(saved.kind, "STAFF"); assert.deepEqual(Object.keys(saved).sort(), ["kind", "operationId", "targetId", "version"]); assert.equal(row.staff.employmentStatus, "在职"); assert.equal(row.account!.staffId, row.staff.id); assert.equal(f.hashCalls(), 1);
  assert.deepEqual(await f.service.execute(actor, create), saved); assert.equal(f.hashCalls(), 1); assert.equal(f.audit.length, 1); assert.equal(f.audit[0]!.beforeValues, null);
  const safe = f.audit[0]!.afterValues.accounts; assert.ok(Array.isArray(safe)); assert.equal(safe.length, 1); assert.equal((safe[0] as Record<string, unknown>).staff_id, saved.targetId);
  const evidence = JSON.stringify({ audit: f.audit, receipts: [...f.receipts], result: saved }); for (const privateValue of [password, encoded, "password_hash", "credentialTag"]) assert.ok(!evidence.includes(privateValue));
  await assert.rejects(f.service.execute(actor, { ...create, account: { ...create.account, password: `${password}-CHANGED` } }), { code: "IDEMPOTENCY_CONFLICT" }); assert.equal(f.hashCalls(), 1);
  assert.deepEqual((await f.service.receipt(actor, create.requestKey)).result, saved);
});
test("staff write: role/hall, login reset, leave and reinstate retain account identity and invalidate existing sessions", async () => {
  const f = fixture(), saved = await f.service.execute(actor, create), initial = f.rows.get(saved.targetId)!.account!;
  await f.service.execute(actor, { action: "EDIT", requestKey: "role", id: saved.targetId, expectedVersion: 1, values: { ...values, role: "SALESPERSON", hallId: sid("hall", 30) }, account: null });
  assert.equal(f.rows.get(saved.targetId)!.account!.version, 2); assert.equal(f.hashCalls(), 1);
  await f.service.execute(actor, { action: "EDIT", requestKey: "login", id: saved.targetId, expectedVersion: 2, values, account: { id: initial.id, expectedVersion: 2, loginName: "RENAMED", loginEnabled: true, password: `${password}-NEW` } });
  await f.service.execute(actor, { action: "LEAVE", requestKey: "leave", id: saved.targetId, expectedVersion: 3 });
  assert.equal(f.rows.get(saved.targetId)!.staff.employmentStatus, "离职"); assert.equal(f.rows.get(saved.targetId)!.account!.loginEnabled, false);
  await f.service.execute(actor, { action: "REINSTATE", requestKey: "reinstate", id: saved.targetId, expectedVersion: 4 });
  const row = f.rows.get(saved.targetId)!; assert.equal(row.staff.employmentStatus, "在职"); assert.equal(row.account!.loginEnabled, false); assert.equal(row.account!.id, initial.id); assert.equal(row.account!.createdAt, initial.createdAt); assert.equal(row.account!.version, 5); assert.equal(row.account!.authVersion, 5); assert.equal(f.revokes(), 4); assert.equal(f.hashCalls(), 2);
  for (const entry of f.audit.slice(1)) { assert.equal((entry.beforeValues!.accounts as unknown[]).length, 1); assert.equal((entry.afterValues.accounts as unknown[]).length, 1); }
});
test("staff write: account-free lifecycle keeps actual empty sets; existing staff can create an optional login without changing staff identity", async () => {
  const f = fixture(), saved = await f.service.execute(actor, { ...create, account: null }); assert.equal(f.hashCalls(), 0); assert.equal(f.rows.get(saved.targetId)!.account, null);
  await f.service.execute(actor, { action: "LEAVE", requestKey: "leave", id: saved.targetId, expectedVersion: 1 }); assert.deepEqual(f.audit[1]!.beforeValues!.accounts, []); assert.deepEqual(f.audit[1]!.afterValues.accounts, []);
  await f.service.execute(actor, { action: "REINSTATE", requestKey: "reinstate", id: saved.targetId, expectedVersion: 2 });
  await f.service.execute(actor, { action: "EDIT", requestKey: "add-login", id: saved.targetId, expectedVersion: 3, values, account: create.account });
  assert.equal(f.rows.get(saved.targetId)!.account!.staffId, saved.targetId); assert.equal(f.rows.get(saved.targetId)!.account!.version, 1); assert.deepEqual(f.audit[3]!.beforeValues!.accounts, []); assert.equal(f.revokes(), 0);
});
test("staff write: native account/root versions, strict inputs, policy, current authority and atomic rollback reject unsafe commands", async () => {
  const f = fixture(); await assert.rejects(f.service.execute(actor, { ...create, account: { ...create.account, password: "short" } }), { code: "INVALID_ACCOUNT_PASSWORD" }); assert.equal(f.hashCalls(), 0);
  await assert.rejects(f.service.execute(actor, { ...create, values: { ...values, employmentStatus: "在职" } }), { code: "INVALID_STAFF_COMMAND" });
  await assert.rejects(f.service.execute(actor, { ...create, values: { ...values, role: "SALESPERSON" } }), { code: "INVALID_STAFF_COMMAND" });
  await assert.rejects(fixture(false).service.execute(actor, create), { code: "ACCOUNT_CREDENTIALS_NOT_READY" });
  const saved = await f.service.execute(actor, create), previous = structuredClone(f.rows), account = f.rows.get(saved.targetId)!.account!;
  await assert.rejects(f.service.execute(actor, { action: "EDIT", requestKey: "stale-account", id: saved.targetId, expectedVersion: 1, values, account: { ...create.account, id: account.id, expectedVersion: 2, password: null } }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.execute(actor, { action: "LEAVE", requestKey: "stale-staff", id: saved.targetId, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  f.fault(); await assert.rejects(f.service.execute(actor, { action: "LEAVE", requestKey: "fault", id: saved.targetId, expectedVersion: 1 })); assert.deepEqual(f.rows, previous); assert.equal(f.revokes(), 0); assert.ok(!f.receipts.has("fault"));
  f.revoke(); await assert.rejects(f.service.receipt(actor, "create"), { code: "FORBIDDEN" });
});
