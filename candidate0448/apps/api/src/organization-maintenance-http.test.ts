/** Fastify inject plus actual B05 service, with explicit scripted current grants. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createOrganizationMaintenanceReadHttpPlugin } from "./organization-maintenance-http.ts";
import type { OrganizationReadUnitOfWork } from "../../../packages/application/src/organization-maintenance-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";
const id = sid("hall", 8801), query = { search: "", status: "all", hallId: null, page: 1, pageSize: 20 };
test("B05 HTTP: twelve read routes coexist with existing party/settings routes; no unimplemented save pretends success", async t => {
  let current = true, allow = true;
  const uow: OrganizationReadUnitOfWork = { async transaction(work) { return work({ evidence: {
    async assertAllowed() { if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE_ROLE"); }, async getReceipt() { return undefined; }, async complete() { throw Error("No writes during read"); }
  }, async readList(kind, q) { return { kind, page: q.page, pageSize: q.pageSize, total: 0, items: [] }; }, async readDetail() { return null; } }); } };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate: async () => current ? actor : null, unitOfWork: uow })); await app.ready();
  for (const path of ["/organization/halls", "/organization/warehouses", "/staff", "/accounts", "/payment/methods", "/payment/accounts"]) {
    const list = await app.inject({ method: "POST", url: `${path}/query`, payload: query }); assert.equal(list.statusCode, 200, list.body); assert.equal(list.headers["cache-control"], "no-store");
    const detail = await app.inject({ method: "POST", url: `${path}/detail/query`, payload: { id } }); assert.equal(detail.statusCode, 200); assert.equal(detail.json(), null);
    assert.equal((await app.inject({ method: "POST", url: `${path}/commands`, payload: { action: "CREATE" } })).statusCode, 404);
  }
  assert.equal((await app.inject({ method: "POST", url: "/staff/query?role=ADMIN", payload: query })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/staff/query", payload: { ...query, actor } })).statusCode, 400);
  allow = false; const denied = await app.inject({ method: "POST", url: "/staff/query", payload: query }); assert.equal(denied.statusCode, 403); assert.doesNotMatch(denied.body, /PRIVATE_ROLE/);
  current = false; assert.equal((await app.inject({ method: "POST", url: "/staff/query", payload: query })).statusCode, 401); assert.equal(app.server.listening, false);
});

test("staff-login v1 HTTP accepts original exact5/role6/login6/combined7 including CLOSED after current authorization", async t => {
  let current = true, allow = true, pages = 0;
  const seen: unknown[] = [];
  const uow: OrganizationReadUnitOfWork = { async transaction(work) { return work({ evidence: {
    async assertAllowed(_actor, kind, intent) { assert.equal(kind, "STAFF"); assert.equal(intent, "LIST"); if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE_ROLE"); },
    async getReceipt() { return undefined; }, async complete() { throw Error("No writes during read"); }
  }, async readList(kind, q) { pages++; seen.push(q); return { kind, page: q.page, pageSize: q.pageSize, total: 0, items: [] }; }, async readDetail() { return null; } }); } };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate: async () => current ? actor : null, unitOfWork: uow })); await app.ready();
  const payload = { ...query, role: "ADMIN" };
  const bodies = [query, payload, { ...query, loginStatus: "" }, { ...payload, loginStatus: "open" }, { ...query, loginStatus: "closed" }, { ...payload, loginStatus: "closed" }];
  for (const body of bodies) {
    const response = await app.inject({ method: "POST", url: "/staff/query", payload: body });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), { kind: "STAFF", page: 1, pageSize: 20, total: 0, items: [] });
  }
  assert.deepEqual(seen, bodies); assert.equal(pages, bodies.length);
  for (const [url, body] of [["/staff/query?role=ADMIN", query], ["/accounts/query", payload], ["/accounts/query", { ...query, loginStatus: "open" }], ["/staff/query", { ...payload, loginStatus: false }], ["/staff/query", { ...payload, extra: true }], ["/staff/query", { ...payload, role: null }]] as const)
    assert.equal((await app.inject({ method: "POST", url, payload: body })).statusCode, 400);
  allow = false;
  for (const loginStatus of ["", "open", "closed"]) assert.equal((await app.inject({ method: "POST", url: "/staff/query", payload: { ...payload, loginStatus } })).statusCode, 403);
  assert.equal(pages, bodies.length);
  current = false; for (const loginStatus of ["", "open", "closed"]) assert.equal((await app.inject({ method: "POST", url: "/staff/query", payload: { ...payload, loginStatus } })).statusCode, 401); assert.equal(pages, bodies.length);
  assert.equal(app.server.listening, false);
});

test("payment-method-filter v1 HTTP accepts native account method6 with null compatibility and existing 400/401/403 boundaries", async t => {
  let current = true, allow = true, pages = 0; const seen: unknown[] = [];
  const uow: OrganizationReadUnitOfWork = { async transaction(work) { return work({ evidence: {
    async assertAllowed(_actor, kind, intent) { assert.equal(kind, "PAYMENT_ACCOUNT"); assert.equal(intent, "LIST"); if (!allow) throw new DomainError("FORBIDDEN", "PRIVATE_SCOPE"); },
    async getReceipt() { return undefined; }, async complete() { throw Error("No writes during read"); }
  }, async readList(kind, q) { pages++; seen.push(q); return { kind, page: q.page, pageSize: q.pageSize, total: 0, items: [] }; }, async readDetail() { return null; } }); } };
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate: async () => current ? actor : null, unitOfWork: uow })); await app.ready();
  const bodies = [query, { ...query, paymentMethodId: null }, { ...query, paymentMethodId: id }] as const;
  for (const payload of bodies) {
    const response = await app.inject({ method: "POST", url: "/payment/accounts/query", payload });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), { kind: "PAYMENT_ACCOUNT", page: 1, pageSize: 20, total: 0, items: [] });
  }
  assert.deepEqual(seen, bodies); assert.equal(pages, 3);
  for (const [url, payload] of [["/payment/accounts/query?paymentMethodId=" + id, query], ["/payment/methods/query", bodies[1]],
    ["/payment/accounts/query", { ...query, paymentMethodId: "" }], ["/payment/accounts/query", { ...query, paymentMethodId: id, role: "ADMIN" }]] as const)
    assert.equal((await app.inject({ method: "POST", url, payload })).statusCode, 400);
  assert.equal(pages, 3);
  allow = false; assert.equal((await app.inject({ method: "POST", url: "/payment/accounts/query", payload: bodies[2] })).statusCode, 403); assert.equal(pages, 3);
  current = false; assert.equal((await app.inject({ method: "POST", url: "/payment/accounts/query", payload: bodies[2] })).statusCode, 401); assert.equal(pages, 3);
  assert.equal(app.server.listening, false);
});
