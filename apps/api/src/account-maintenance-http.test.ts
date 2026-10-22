/** Synthetic HTTP boundary only; no listener or real credential provider. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createAccountMaintenanceHttpPlugin } from "./account-maintenance-http.ts";
import type { AccountMaintenanceDependencies } from "../../../packages/application/src/account-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
test("account HTTP: strict explicit credentials/current permission and sanitized failure, no unauthenticated maintenance", async t => {
  let loggedIn = true, allow = true, fault = false, sequence = 100;
  const dependencies: AccountMaintenanceDependencies = { credentials: null, now: () => "2026-10-22T08:30:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({ evidence: {
    async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); return undefined; }, async complete(c) { if (fault) throw Error("PRIVATE SQL"); return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; }
  }, async load(id) { return { id, staffId: sid("staff", 1), loginName: "LOGIN", loginEnabled: true, authVersion: 1, version: 1, createdAt: "2026-10-21T00:00:00.000000Z", updatedAt: "2026-10-21T00:00:00.000000Z" }; }, async validateChange() {}, async put() {} }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createAccountMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  const payload = { action: "DISABLE", requestKey: "disable", id: sid("account", 10), expectedVersion: 1 };
  const saved = await app.inject({ method: "POST", url: "/accounts/commands", payload }); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().kind, "ACCOUNT"); assert.equal(saved.headers["cache-control"], "no-store");
  assert.equal((await app.inject({ method: "POST", url: "/accounts/commands", payload: { ...payload, role: "ADMIN" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/accounts/commands", payload: { action: "RESET_PASSWORD", requestKey: "reset", id: payload.id, expectedVersion: 1, password: "SYNTHETIC-PASSWORD" } })).statusCode, 503);
  assert.equal((await app.inject({ method: "GET", url: "/accounts/receipts/missing" })).statusCode, 404);
  fault = true; const failure = await app.inject({ method: "POST", url: "/accounts/commands", payload }); assert.equal(failure.statusCode, 500); assert.doesNotMatch(failure.body, /PRIVATE SQL/);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/accounts/commands", payload })).statusCode, 403); loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/accounts/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
