/** Synthetic HTTP boundary only; no listener, actual credentials or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createStaffMaintenanceHttpPlugin } from "./staff-maintenance-http.ts";
import type { StaffMaintenanceDependencies } from "../../../packages/application/src/staff-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
test("staff HTTP: exact authenticated contract, credential readiness and no-cache sanitized failures", async t => {
  let loggedIn = true, allow = true, fault = false, preparationReady = true, sequence = 100;
  const dependencies: StaffMaintenanceDependencies = { credentials: null, now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({ evidence: {
    async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); return undefined; }, async prepare() { if (!preparationReady) throw new DomainError("MAINTENANCE_PREPARE_NOT_READY", "PRIVATE PROVIDER"); }, async complete(c) { if (fault) throw Error("PRIVATE SQL"); return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
  }, async load(id) { return { staff: { id, name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null, employmentStatus: "在职", version: 1 }, account: null }; }, async validateChange() {}, async putStaff() {}, async putAccount() {} }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createStaffMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  const payload = { action: "LEAVE", requestKey: "leave", id: sid("staff", 10), expectedVersion: 1 };
  const saved = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().kind, "STAFF"); assert.equal(saved.headers["cache-control"], "no-store");
  preparationReady = false; const unavailable = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(unavailable.statusCode, 503); assert.equal(unavailable.json().error.code, "MAINTENANCE_PREPARE_NOT_READY"); assert.doesNotMatch(unavailable.body, /PRIVATE PROVIDER/); preparationReady = true;
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload: { ...payload, loginEnabled: true } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands?hallId=forged", payload })).statusCode, 400);
  const create = { action: "CREATE", requestKey: "create", values: { name: "合成员工", role: "WAREHOUSE", hallId: null, contact: null }, account: { id: null, expectedVersion: null, loginName: "LOGIN", loginEnabled: true, password: "SYNTHETIC-PASSWORD" } };
  assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload: create })).statusCode, 503);
  assert.equal((await app.inject({ method: "GET", url: "/staff/receipts/missing" })).statusCode, 404);
  fault = true; const failure = await app.inject({ method: "POST", url: "/staff/commands", payload }); assert.equal(failure.statusCode, 500); assert.doesNotMatch(failure.body, /PRIVATE SQL/);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload })).statusCode, 403); loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/staff/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
