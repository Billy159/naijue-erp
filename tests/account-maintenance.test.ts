/** Synthetic state/credential providers; no real credentials or database. */
import test from "node:test";
import assert from "node:assert/strict";
import { createAccountMaintenanceService } from "../packages/application/src/account-maintenance-service.ts";
import type { AccountMaintenanceDependencies, AccountMaintenanceRecord } from "../packages/application/src/account-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { createNodeCredentialRequestTag } from "../packages/authentication/src/passwords.ts";
import { createSourceAuthenticationPolicy } from "../packages/authentication/src/source-policy.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const password = "SYNTHETIC-ONLY-PASSWORD", encoded = `naijue:scrypt:1:32768:8:1:${"1".repeat(32)}:${"2".repeat(128)}`;
const c = { action: "CREATE", requestKey: "create", values: { staffId: sid("staff", 20), loginName: "EXACT LOGIN", loginEnabled: true, password } };
function fixture(credentialsAvailable = true, prepareMode: "ready" | "missing" | "fail" = "ready") {
  let sequence = 100, allow = true, fault = false, hashCalls = 0, revokes = 0; const rows = new Map<string, AccountMaintenanceRecord>(), receipts = new Map<string, MaintenanceReceipt>(), audit: MaintenanceCompletion[] = [], hashes = new Map<string, string>();
  const credentials = { passwords: { async hash() { hashCalls++; return encoded; }, async verify() { return false; } }, credentialRequestTag: createNodeCredentialRequestTag(new Uint8Array(32).fill(5)), assertNewPassword: createSourceAuthenticationPolicy(3600).assertNewPassword };
  const dependencies: AccountMaintenanceDependencies = { now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++), credentials: credentialsAvailable ? credentials : null, unitOfWork: { async transaction(work) {
    let prepared: MaintenanceCompletion | undefined;
      const before = structuredClone(rows), prior = structuredClone(receipts), oldHashes = structuredClone(hashes), count = audit.length, oldRevokes = revokes;
    try { return await work({ evidence: {
      async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); }, async getReceipt(_actor, key) { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); return receipts.get(key); },
      ...(prepareMode === "missing" ? {} : { async prepare(c: MaintenanceCompletion) { if (prepareMode === "fail") throw Error("SYNTHETIC PREPARE FAILURE"); assert.equal(prepared, undefined); prepared = structuredClone(c); } }),
        async complete(x) { assert.deepEqual(x, prepared); if (fault) throw Error("SYNTHETIC RECEIPT FAULT"); const result = { operationId: x.operationId, kind: x.kind, targetId: x.targetId, version: x.newVersion }; audit.push(structuredClone(x)); receipts.set(x.requestKey, { result, requestHash: x.requestHash, action: x.action, completedAt: x.completedAt }); return result; }
    }, async load(id) { return structuredClone(rows.get(id)); }, async validateChange() {}, async put(previous, next, hash) { assert.ok(prepared, "audit must precede business mutation"); rows.set(next.id, structuredClone(next)); if (hash) hashes.set(next.id, hash); if (previous) revokes++; } });
    } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of prior) receipts.set(k, v); hashes.clear(); for (const [k, v] of oldHashes) hashes.set(k, v); audit.length = count; revokes = oldRevokes; throw error; }
  } } };
  return { dependencies, service: createAccountMaintenanceService(dependencies), rows, receipts, audit, hashes, hashCalls: () => hashCalls, revokes: () => revokes, revoke: () => { allow = false; }, fault: () => { fault = true; } };
}
test("prepared account: create/reset carry only closed credential action metadata; preparation faults precede account/session writes", async () => {
  for (const mode of ["missing", "fail"] as const) { const f = fixture(true, mode); await assert.rejects(f.service.execute(actor, c), mode === "missing" ? { code: "MAINTENANCE_PREPARE_NOT_READY" } : /SYNTHETIC PREPARE FAILURE/); assert.equal(f.rows.size, 0); assert.equal(f.hashes.size, 0); assert.equal(f.receipts.size, 0); assert.equal(f.revokes(), 0); }
  const f = fixture(), saved = await f.service.execute(actor, c); assert.deepEqual(f.audit[0]!.afterValues.account_credentials, [{ account_id: saved.targetId, action: "CREATE" }]);
  await f.service.execute(actor, { action: "RESET_PASSWORD", requestKey: "prepared-reset", id: saved.targetId, expectedVersion: 1, password: `${password}-NEW` });
  assert.deepEqual(f.audit[1]!.afterValues.account_credentials, [{ account_id: saved.targetId, action: "RESET_PASSWORD" }]); assert.equal(f.revokes(), 1);
  const evidence = JSON.stringify(f.audit); assert.ok(!evidence.includes(password)); assert.ok(!evidence.includes(encoded)); assert.ok(!evidence.includes("credentialTag"));
});
test("account write: private stable credential fingerprint replays without rehash; no plaintext/hash in audit/result/receipt", async () => {
  const f = fixture(), saved = await f.service.execute(actor, c); assert.equal(f.hashCalls(), 1); assert.equal(f.hashes.get(saved.targetId), encoded);
  assert.deepEqual(await f.service.execute(actor, c), saved); assert.equal(f.hashCalls(), 1); assert.equal(f.audit.length, 1);
  const evidence = JSON.stringify({ audit: f.audit, receipt: [...f.receipts], result: saved }); assert.ok(!evidence.includes(password)); assert.ok(!evidence.includes(encoded)); assert.ok(!evidence.includes("password_hash")); assert.ok(!evidence.includes("credentialTag"));
  await assert.rejects(f.service.execute(actor, { ...c, values: { ...c.values, password: `${password}-CHANGED` } }), { code: "IDEMPOTENCY_CONFLICT" }); assert.equal(f.hashCalls(), 1);
  assert.deepEqual((await f.service.receipt(actor, c.requestKey)).result, saved);
});
test("account write: login editing/disable/restore/reset advance auth version, revoke sessions and retain original creation time", async () => {
  const f = fixture(), saved = await f.service.execute(actor, c), created = f.rows.get(saved.targetId)!.createdAt;
  await f.service.execute(actor, { action: "EDIT", requestKey: "edit", id: saved.targetId, expectedVersion: 1, values: { loginName: "RENAMED", loginEnabled: true } });
  await f.service.execute(actor, { action: "DISABLE", requestKey: "disable", id: saved.targetId, expectedVersion: 2 });
  await f.service.execute(actor, { action: "RESTORE", requestKey: "restore", id: saved.targetId, expectedVersion: 3 });
  await f.service.execute(actor, { action: "RESET_PASSWORD", requestKey: "reset", id: saved.targetId, expectedVersion: 4, password: `${password}-NEW` });
  const row = f.rows.get(saved.targetId)!; assert.equal(row.version, 5); assert.equal(row.authVersion, 5); assert.equal(row.loginName, "RENAMED"); assert.equal(row.createdAt, created); assert.equal(f.revokes(), 4); assert.equal(f.hashCalls(), 2);
  assert.deepEqual(Object.keys(f.audit[4]!.afterValues).sort(), ["account_credentials", "auth_version", "version"]); assert.ok(!Object.hasOwn(f.audit[4]!.afterValues, "updated_at"));
});
test("account write: policy, field injection, stale version, missing providers and receipt fault fail closed", async () => {
  const f = fixture(); await assert.rejects(f.service.execute(actor, { ...c, values: { ...c.values, password: "short" } }), { code: "INVALID_ACCOUNT_PASSWORD" }); assert.equal(f.hashCalls(), 0);
  await assert.rejects(f.service.execute(actor, { ...c, values: { ...c.values, authVersion: 1 } }), { code: "INVALID_ACCOUNT_COMMAND" });
  await assert.rejects(fixture(false).service.execute(actor, c), { code: "ACCOUNT_CREDENTIALS_NOT_READY" });
  const saved = await f.service.execute(actor, c), previous = structuredClone(f.rows); await assert.rejects(f.service.execute(actor, { action: "DISABLE", requestKey: "stale", id: saved.targetId, expectedVersion: 2 }), { code: "VERSION_CONFLICT" });
  f.fault(); await assert.rejects(f.service.execute(actor, { action: "DISABLE", requestKey: "fault", id: saved.targetId, expectedVersion: 1 })); assert.deepEqual(f.rows, previous); assert.equal(f.revokes(), 0); assert.ok(!f.receipts.has("fault"));
  f.revoke(); await assert.rejects(f.service.receipt(actor, c.requestKey), { code: "FORBIDDEN" });
});
