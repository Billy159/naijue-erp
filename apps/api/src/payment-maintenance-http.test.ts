/** Synthetic HTTP composition; no listener or real data. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createPaymentMaintenanceHttpPlugin } from "./payment-maintenance-http.ts";
import type { PaymentMaintenanceDependencies } from "../../../packages/application/src/payment-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
test("payment HTTP: both write families, no-store, current auth/role, strict body and sanitized fault", async t => {
  let loggedIn = true, allow = true, fault = false, sequence = 100; const persisted: unknown[] = [];
  const dependencies: PaymentMaintenanceDependencies = { now: () => "2026-10-22T07:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({
    evidence: { async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE GRANT"); }, async getReceipt() { return undefined; }, async complete(c) { if (fault) throw Error("PRIVATE SQL"); return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; } },
    async load() { return undefined; }, async validateChange() {}, async put(_old, next) { persisted.push(next); }
  }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createPaymentMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  for (const [prefix, values, kind] of [["/payment/methods", { name: "METHOD", enabled: true }, "PAYMENT_METHOD"], ["/payment/accounts", { name: "ACCOUNT", enabled: true, paymentMethodId: sid("paymentMethod", 1), hallIds: [] }, "PAYMENT_ACCOUNT"]] as const) {
    const response = await app.inject({ method: "POST", url: `${prefix}/commands`, payload: { action: "CREATE", requestKey: `create-${kind}`, values } }); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().kind, kind); assert.equal(response.headers["cache-control"], "no-store");
    assert.equal((await app.inject({ method: "GET", url: `${prefix}/receipts/missing` })).statusCode, 404);
  }
  assert.equal(persisted.length, 2);
  const payload = { action: "CREATE", requestKey: "create", values: { name: "METHOD", enabled: true } };
  assert.equal((await app.inject({ method: "POST", url: "/payment/methods/commands?role=ADMIN", payload })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/payment/methods/commands", payload: { ...payload, actor } })).statusCode, 400);
  fault = true; const failure = await app.inject({ method: "POST", url: "/payment/methods/commands", payload }); assert.equal(failure.statusCode, 500); assert.doesNotMatch(failure.body, /PRIVATE SQL/); assert.match(failure.body, /original request key/);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/payment/methods/commands", payload })).statusCode, 403);
  loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/payment/methods/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
