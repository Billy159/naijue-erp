/** Synthetic Fastify injection only. No listener, real session, PostgreSQL or production policy. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createProductManagementQueryHttpPlugin } from "./product-management-query-http.ts";
import type { ProductManagementQueryHttpOptions } from "./product-management-query-http.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";
import type { ProductManagementQueryDependencies } from "../../../packages/application/src/product-management-query-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";

const productId = sid("product", 7300);
const listInput = { filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] }, page: 1, pageSize: 100 };
const candidateInput = { kind: "product", search: "", selectedIds: [], page: 1, pageSize: 20 };
const item = { id: productId, code: "SYNTHETIC", name: "合成商品", categoryLabel: null, year: null, seasonLabel: null, supplierLabel: null,
  fits: [], thickness: null, retailPrice: "0.00", totalStock: null };
const paths = ["/product-management/query", "/product-management/candidates/query"] as const;
async function fixture(t: TestContext, options: { authenticate?: ProductManagementQueryHttpOptions["authenticate"];
  authorize?: ProductManagementQueryDependencies["authorization"]["authorize"]; failure?: Error; malformed?: boolean } = {}) {
  let policies = 0, reads = 0;
  const app = Fastify({ logger: false });
  app.register(createProductManagementQueryHttpPlugin({ authenticate: options.authenticate ?? (async () => actor), dependencies: {
    authorization: { async authorize(context, intent, signal) { policies++; assert.deepEqual(context, actor); assert.ok(signal instanceof AbortSignal);
      return options.authorize ? options.authorize(context, intent, signal) : { kind: "all", totalStock: "unavailable" }; } },
    reader: { async readList() { reads++; if (options.failure) throw options.failure; return { page: 1, pageSize: 100, exactTotal: options.malformed ? 2 : 1, items: [item] }; },
      async readCandidates() { reads++; if (options.failure) throw options.failure; return { page: 1, pageSize: 20, exactTotal: 1, items: [{ id: productId, code: "SYNTHETIC", name: "合成商品", label: "合成商品" }] }; } }
  } }));
  t.after(() => app.close()); await app.ready();
  return { app, counts: () => ({ policies, reads }), post: (path: string, payload: unknown) => app.inject({ method: "POST", url: path, headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) }) };
}
test("product management HTTP exposes independent list/candidate reads with no-store and does not listen or mount writes", async t => {
  const f = await fixture(t); assert.equal(f.app.server.listening, false);
  const list = await f.post(paths[0], listInput); assert.equal(list.statusCode, 200); assert.equal(list.json().items[0].retailPrice, "0.00"); assert.equal(list.json().items[0].totalStock, null);
  assert.equal(list.headers["cache-control"], "no-store"); assert.equal(list.headers.pragma, "no-cache");
  const candidates = await f.post(paths[1], candidateInput); assert.equal(candidates.statusCode, 200); assert.equal(candidates.json().items[0].code, "SYNTHETIC");
  assert.equal((await f.post("/product-management/create", listInput)).statusCode, 404); assert.equal(f.app.server.listening, false);
});
test("product management HTTP requires explicit auth and current independent policy before any reader", async t => {
  assert.throws(() => createProductManagementQueryHttpPlugin({} as never), /explicit trusted authentication/);
  assert.throws(() => createProductManagementQueryHttpPlugin({ authenticate: async () => actor } as never), /explicit authorization/);
  const unauthenticated = await fixture(t, { authenticate: async () => null });
  for (const [path, input] of [[paths[0], listInput], [paths[1], candidateInput]] as const) assert.equal((await unauthenticated.post(path, input)).statusCode, 401);
  assert.deepEqual(unauthenticated.counts(), { policies: 0, reads: 0 });
  const denied = await fixture(t, { authorize: async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); } });
  const response = await denied.post(paths[0], listInput); assert.equal(response.statusCode, 403); assert.ok(!response.body.includes("PRIVATE")); assert.equal(denied.counts().reads, 0);
});
test("product management HTTP rejects client roles/grants, malformed IDs, dimensions, pagination and query strings", async t => {
  const f = await fixture(t);
  for (const input of [{ ...listInput, actor }, { ...listInput, role: "ADMIN" }, { ...listInput, grant: { kind: "all" } }, { ...listInput, pageSize: 2000 },
    { ...listInput, filter: { ...listInput.filter, years: [2026] } }, { ...listInput, filter: { ...listInput.filter, productIds: ["not-id"] } }, {}]) {
    assert.equal((await f.post(paths[0], input)).statusCode, 400);
  }
  assert.equal((await f.post(`${paths[0]}?page=2`, listInput)).statusCode, 400);
  assert.equal((await f.post(paths[1], { ...candidateInput, kind: "paymentAccount" })).statusCode, 400);
  assert.deepEqual(f.counts(), { policies: 0, reads: 0 });
});
test("product management HTTP safe errors redact internals and preserve unavailable stock instead of a zero-success", async t => {
  for (const [failure, status] of [[new DomainError("PRODUCT_MANAGEMENT_STOCK_NOT_READY", "PRIVATE STOCK"), 503],
    [new DomainError("PRODUCT_MANAGEMENT_READ_ABORTED", "PRIVATE ABORT"), 408], [new DomainError("PRODUCT_MANAGEMENT_READ_TOO_LARGE", "PRIVATE LIMIT"), 413],
    [new DomainError("PRODUCT_MANAGEMENT_INTEGRITY_FAILED", "PRIVATE DATABASE"), 500], [new Error("PRIVATE postgresql://secret"), 500]] as const) {
    const f = await fixture(t, { failure }); const response = await f.post(paths[0], listInput); assert.equal(response.statusCode, status); assert.ok(!response.body.includes("PRIVATE"));
  }
  const malformed = await fixture(t, { malformed: true }); assert.equal((await malformed.post(paths[0], listInput)).statusCode, 500);
});
test("product management HTTP JSON body/media limits are explicit and never invoke policy on malformed bodies", async t => {
  const f = await fixture(t);
  assert.equal((await f.app.inject({ method: "POST", url: paths[0], headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: paths[0], headers: { "content-type": "text/plain" }, payload: "x" })).statusCode, 415);
  assert.equal((await f.app.inject({ method: "POST", url: paths[0], headers: { "content-type": "application/json" }, payload: JSON.stringify({ huge: "x".repeat(66_000) }) })).statusCode, 413);
  assert.equal(f.counts().policies, 0);
});
test("product management HTTP supports existing real session Origin boundary and rechecks expiration", async t => {
  let resolutions = 0, active = true;
  const service: AuthenticationService = { async login() { throw new Error("Unused"); }, async logout() {}, async changeOwnPassword() {}, async resolve() {
    resolutions++; return active ? { ...actor, staffId: sid("staff", 7301), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 } : null;
  } };
  const f = await fixture(t, { authenticate: createSalesSessionAuthenticator({ service, trustedOrigin: "https://synthetic.example" }) });
  const cookie = `__Host-naijue_session=${"a".repeat(43)}`;
  for (const headers of [{ cookie }, { cookie, origin: "https://attacker.example" }, { cookie, origin: "https://synthetic.example", "sec-fetch-site": "cross-site" }]) {
    assert.equal((await f.app.inject({ method: "POST", url: paths[0], headers: { ...headers, "content-type": "application/json" }, payload: listInput })).statusCode, 401);
  }
  assert.equal(resolutions, 0); assert.equal(f.counts().reads, 0);
  const post = () => f.app.inject({ method: "POST", url: paths[0], headers: { cookie, origin: "https://synthetic.example", "sec-fetch-site": "same-origin", "content-type": "application/json" }, payload: listInput });
  assert.equal((await post()).statusCode, 200); active = false; assert.equal((await post()).statusCode, 401); assert.equal(f.counts().reads, 1);
});
