/** Synthetic HTTP contract, no listener or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createCatalogueMaintenanceHttpPlugin } from "./catalogue-maintenance-http.ts";
import type { CatalogueMaintenanceDependencies } from "../../../packages/application/src/catalogue-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
test("catalogue HTTP: exact three families, current denial, original receipt and no extra mutation surfaces", async t => {
  let sequence = 100, loggedIn = true, allow = true;
  const dependencies: CatalogueMaintenanceDependencies = { now: () => "2026-10-22T08:00:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) { return work({
    async lockDirectory() {}, evidence: { async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE"); }, async getReceipt() { return undefined; }, async complete(c) { return { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; } },
    async load() { return undefined; }, async validateChange() {}, async assertUnreferenced() {}, async put() {}
  }); } } };
  const app = Fastify({ logger: false }); t.after(() => app.close()); app.register(createCatalogueMaintenanceHttpPlugin({ authenticate: async () => loggedIn ? actor : null, dependencies })); await app.ready();
  for (const [prefix, values, kind] of [["categories", { name: "C", parentId: null, displayOrder: 0 }, "CATEGORY"], ["colors", { name: "C", code: "001", enabled: true }, "COLOR"], ["fits", { name: "F", code: "A", enabled: true }, "FIT"]] as const) {
    const response = await app.inject({ method: "POST", url: `/catalogue/${prefix}/commands`, payload: { action: "CREATE", requestKey: `create-${prefix}`, values } }); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().kind, kind); assert.equal(response.headers["cache-control"], "no-store"); assert.equal((await app.inject({ method: "GET", url: `/catalogue/${prefix}/receipts/missing` })).statusCode, 404);
  }
  assert.equal((await app.inject({ method: "POST", url: "/catalogue/seasons/commands", payload: {} })).statusCode, 404);
  const payload = { action: "CREATE", requestKey: "create", values: { name: "F", code: "A", enabled: true } };
  assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload: { ...payload, actor } })).statusCode, 400);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload })).statusCode, 403); loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/catalogue/fits/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
