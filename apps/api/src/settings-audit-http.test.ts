/** Fastify injection only: no listener, real session or database. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createSettingsAuditHttpPlugin } from "./settings-audit-http.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor } from "../../../tests/support/synthetic-fixtures.ts";
const body = { module: "ALL", objectId: null, objectSearch: "", actorSearch: "", action: "ALL", dateFrom: null, dateTo: null, page: 1, pageSize: 20 };
test("W13 HTTP exact JSON/no-store envelope and bounded body; invalid queries do not reach reader", async t => {
  let reads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createSettingsAuditHttpPlugin({ authenticate: async () => actor, reader: { async read() { reads++; return { role: "ADMIN", total: "0", items: [] }; } } }));
  const response = await app.inject({ method: "POST", url: "/settings/audit/query", payload: body }); assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { items: [], total: 0, page: 1, pageSize: 20 }); assert.equal(response.headers["cache-control"], "no-store");
  for (const [url, payload, status] of [["/settings/audit/query?role=ADMIN", body, 400], ["/settings/audit/query", { ...body, role: "ADMIN" }, 400], ["/settings/audit/query", { ...body, objectSearch: "x".repeat(9000) }, 413]] as const) {
    assert.equal((await app.inject({ method: "POST", url, payload })).statusCode, status);
  }
  assert.equal(reads, 1); assert.equal(app.server.listening, false);
});
test("W13 HTTP denied identity and reader failures remain explicit, sanitized and uncached", async t => {
  for (const mode of ["unauthenticated", "forbidden", "failure"] as const) {
    let reads = 0; const app = Fastify({ logger: false }); t.after(() => app.close());
    app.register(createSettingsAuditHttpPlugin({ authenticate: async () => mode === "unauthenticated" ? null : actor, reader: { async read() { reads++; if (mode === "forbidden") throw new DomainError("FORBIDDEN", "PRIVATE_PERMISSION"); throw Error("PRIVATE_SQL"); } } }));
    const response = await app.inject({ method: "POST", url: "/settings/audit/query", payload: body });
    assert.equal(response.statusCode, mode === "unauthenticated" ? 401 : mode === "forbidden" ? 403 : 500); assert.doesNotMatch(response.body, /PRIVATE|"items"/);
    assert.equal(response.headers["cache-control"], "no-store"); assert.equal(reads, mode === "unauthenticated" ? 0 : 1);
  }
});
