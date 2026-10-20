import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import { createSalesQueryHttpPlugin } from "./sales-query-http.ts";
import type { SalesQueryHttpOptions } from "./sales-query-http.ts";
import type { SalesListQuery, SalesQueryAuthorization, SalesReadIntent, TrustedSalesSnapshotReader } from "../../../packages/application/src/sales-query-ports.ts";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { minorAmount, version } from "../../../packages/domain/src/values.ts";
import { actor, ids, sid, syntheticDraft } from "../../../tests/support/synthetic-fixtures.ts";

const input = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null, hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null }, page: 1, pageSize: 20 });
async function setup(t: TestContext, options: { authenticate?: SalesQueryHttpOptions["authenticate"]; authorize?: SalesQueryAuthorization["authorize"]; failure?: Error } = {}) {
  let policyCalls = 0; let readCalls = 0; let currentActor: ActorContext | null = actor; const intents: SalesReadIntent[] = [];
  const check = () => { readCalls++; if (options.failure) throw options.failure; };
  const reader: TrustedSalesSnapshotReader = {
    async readReferences(read) { check(); return { page: read.parameters.page, exactTotal: 1n, items: [{ id: ids.hall, label: "SYNTHETIC HALL" }] }; },
    async readList(read) { check(); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 9007199254740993n, items: [{
      ...syntheticDraft().header, status: "APPROVED", version: version(2), hallName: "SYNTHETIC", customerName: "SYNTHETIC", warehouseName: "SYNTHETIC", salespersonName: null,
      grossAmount: minorAmount("9007199254740993"), orderDiscount: minorAmount("0"), netDue: minorAmount("9007199254740993"),
      quantity: 9007199254740993n, incomingQuantity: 0n, outgoingQuantity: 9007199254740993n, updatedAt: "2026-10-20T00:00:00.000000Z" }] }; },
    async readDetail() { check(); return { document: { ...syntheticDraft(), header: { ...syntheticDraft().header, status: "DRAFT", version: version(1), createdByAccountId: actor.accountId,
      createdHallId: actor.hallId, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", approvedByAccountId: null, approvedAt: null } }, stockBasis: "RUNTIME_LEDGER", referenceNames: { hallName: "SYNTHETIC HALL", salespersonName: null, customerName: "SYNTHETIC CUSTOMER", warehouseName: "SYNTHETIC WAREHOUSE" }, settlementNames: syntheticDraft().settlements.map(row => ({ settlementId: row.id, paymentAccountId: row.paymentAccountId,
        accountNameSnapshot: "SYNTHETIC original account", methodNameSnapshot: "SYNTHETIC original method", currentAccountName: "SYNTHETIC current account", currentMethodName: "SYNTHETIC current method" })) }; },
    async readHistory(read) { check(); return { salesId: read.parameters.salesId, page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 1n,
      items: [{ id: sid("audit", 500), operationId: sid("operation", 501), actorAccountId: actor.accountId, action: "SAVE", occurredAt: "2026-10-20T00:00:00Z", oldVersion: null, newVersion: version(1) }] }; },
    async readSettlementStatistics(read) { check(); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotalAccounts: 1n, exactApprovedDocuments: 2n,
      received: minorAmount("9007199254740993"), refunded: minorAmount("125"), accounts: [{ paymentAccountId: ids.payment, received: minorAmount("9007199254740993"), refunded: minorAmount("125") }] }; }
  };
  const app = Fastify({ logger: false }); app.register(createSalesQueryHttpPlugin({ authenticate: options.authenticate ?? (async () => currentActor), dependencies: {
    authorization: { async authorize(context, intent, signal) { policyCalls++; intents.push(intent); assert.deepEqual(context, actor); assert.ok(signal instanceof AbortSignal);
      return options.authorize ? options.authorize(context, intent, signal) : { kind: "restricted", clauses: [{ hallId: ids.hall }] }; } }, reader
  } }));
  t.after(() => app.close()); await app.ready();
  return { app, intents, counts: () => ({ policyCalls, readCalls }), authenticateAs: (value: ActorContext | null) => { currentActor = value; },
    post: (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }) };
}
test("SYNTHETIC sales query HTTP: five read routes use current trusted actor/policy, no listener, exact bigint strings", async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  const listed = await f.post("/sales/query", input()); assert.equal(listed.statusCode, 200); assert.equal(listed.json().exactTotal, "9007199254740993"); assert.equal(listed.json().items[0].netDue, "9007199254740993");
  assert.equal(listed.json().items[0].quantity, "9007199254740993"); assert.equal(listed.json().items[0].incomingQuantity, "0");
  assert.equal(listed.json().items[0].outgoingQuantity, "9007199254740993"); assert.equal(listed.json().items[0].updatedAt, "2026-10-20T00:00:00.000000Z");
  assert.equal(listed.headers["cache-control"], "no-store"); assert.equal(listed.headers.pragma, "no-cache");
  const references = await f.post("/sales/references/query", { kind: "hall", search: "SYNTHETIC", page: 1, pageSize: 20 });
  assert.equal(references.statusCode, 200); assert.equal(references.json().exactTotal, "1"); assert.equal(references.json().items[0].label, "SYNTHETIC HALL");
  assert.equal(references.headers["cache-control"], "no-store");
  const detail = await f.post("/sales/detail/query", { salesId: ids.sales }); assert.equal(detail.statusCode, 200); assert.equal(detail.json().document.lines[0].quantity, "2");
  assert.deepEqual(detail.json().referenceNames, { hallName: "SYNTHETIC HALL", salespersonName: null, customerName: "SYNTHETIC CUSTOMER", warehouseName: "SYNTHETIC WAREHOUSE" });
  assert.equal(detail.json().settlementNames.length, detail.json().document.settlements.length);
  assert.deepEqual(detail.json().settlementNames[0], { settlementId: sid("settlement", 15), paymentAccountId: ids.payment,
    accountNameSnapshot: "SYNTHETIC original account", methodNameSnapshot: "SYNTHETIC original method", currentAccountName: "SYNTHETIC current account", currentMethodName: "SYNTHETIC current method" });
  const history = await f.post("/sales/history/query", { salesId: ids.sales, page: 1, pageSize: 20 }); assert.equal(history.statusCode, 200); assert.equal(history.json().exactTotal, "1"); assert.equal(history.json().items[0].oldVersion, null);
  const stats = await f.post("/sales/settlement-statistics/query", input()); assert.equal(stats.statusCode, 200); assert.equal(stats.json().received, "9007199254740993"); assert.equal(stats.json().refunded, "125");
  assert.deepEqual(f.intents.map(intent => intent.kind), ["list", "list", "detail", "history", "settlement-statistics"]); assert.deepEqual(f.counts(), { policyCalls: 5, readCalls: 5 }); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC sales query HTTP: authentication missing/malformed/failing and missing providers never default to global", async t => {
  assert.throws(() => createSalesQueryHttpPlugin({} as SalesQueryHttpOptions), /explicit trusted authentication/);
  assert.throws(() => createSalesQueryHttpPlugin({ authenticate: async () => actor } as unknown as SalesQueryHttpOptions), /explicit trusted authorization/);
  const f = await setup(t); f.authenticateAs(null);
  for (const [url, payload] of [["/sales/query", input()], ["/sales/references/query", { kind: "hall", search: "", page: 1, pageSize: 20 }], ["/sales/detail/query", { salesId: ids.sales }], ["/sales/history/query", { salesId: ids.sales, page: 1, pageSize: 20 }], ["/sales/settlement-statistics/query", input()]] as const) {
    assert.equal((await f.post(url, payload)).statusCode, 401);
  }
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
  for (const authenticate of [async () => ({ accountId: "fake", hallId: null }) as never, async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTH"); }]) {
    const g = await setup(t, { authenticate }); const result = await g.post("/sales/query", input()); assert.equal(result.statusCode, 500); assert.ok(!result.body.includes("PRIVATE AUTH")); assert.deepEqual(g.counts(), { policyCalls: 0, readCalls: 0 });
  }
});
test("SYNTHETIC sales query HTTP: actor, role, scope and unknown filters cannot be granted from client data", async t => {
  const f = await setup(t);
  for (const payload of [{ ...input(), actor }, { ...input(), role: "ADMIN" }, { ...input(), scope: { kind: "all" } }, { ...input(), filter: { ...input().filter, createdByAccountId: ids.account } },
    { ...input(), pageSize: 1000 }, { ...input(), page: "1" }, { ...input(), filter: { ...input().filter, startDate: "2026-02-30" } }]) {
    const response = await f.post("/sales/query", payload); assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_SALES_QUERY");
  }
  assert.equal((await f.post("/sales/detail/query", { salesId: ids.sales, actor })).statusCode, 400);
  assert.equal((await f.post("/sales/history/query", { salesId: ids.sales, page: 1, pageSize: 20, role: "ADMIN" })).statusCode, 400);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test("SYNTHETIC sales query HTTP: current authorization denial and empty/malformed policy scope cannot touch reader", async t => {
  for (const [authorize, expected] of [[async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); }, 403], [async () => ({ kind: "restricted", clauses: [] }) as const, 403],
    [async () => ({ kind: "restricted", clauses: [{}] }) as const, 500]] as const) {
    const f = await setup(t, { authorize }); const response = await f.post("/sales/query", input()); assert.equal(response.statusCode, expected); assert.equal(f.counts().readCalls, 0); assert.ok(!response.body.includes("PRIVATE POLICY"));
  }
});
test("SYNTHETIC sales query HTTP: safe allowlisted errors and unknown SQL/provider messages remain redacted", async t => {
  for (const [error, expected] of [[new DomainError("DOCUMENT_NOT_FOUND", "PRIVATE TARGET"), 404], [new DomainError("SALES_READ_TOO_LARGE", "PRIVATE LIMIT"), 413],
    [new DomainError("SALES_READ_ABORTED", "PRIVATE ABORT"), 408], [new DomainError("INVALID_DATABASE_VALUE", "PRIVATE DATABASE"), 500], [new Error("PRIVATE SQL postgresql://credentials"), 500]] as const) {
    const f = await setup(t, { failure: error }); const response = await f.post("/sales/query", input()); assert.equal(response.statusCode, expected); assert.ok(!response.body.includes("PRIVATE")); assert.ok(!response.body.includes("credentials"));
  }
});
test("SYNTHETIC sales query HTTP: strict transport rejects query strings, invalid JSON/media type and oversized body", async t => {
  const f = await setup(t);
  assert.equal((await f.post("/sales/query?role=ADMIN", input())).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/query", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/query", headers: { "content-type": "text/plain" }, payload: "not JSON" })).statusCode, 415);
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/query", headers: { "content-type": "application/json" }, payload: JSON.stringify({ data: "x".repeat(65536) }) })).statusCode, 413);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});

test("SYNTHETIC sales filter references HTTP: authority injection, unknown kind, form eligibility and invalid paging fail before policy", async t => {
  const f = await setup(t); const input = { kind: "customer", search: "", page: 1, pageSize: 20 };
  for (const payload of [{ ...input, actor }, { ...input, scope: { kind: "all" } }, { ...input, role: "ADMIN" }, { ...input, enabled: true },
    { ...input, kind: "paymentAccount" }, { ...input, search: " x " }, { ...input, search: "x".repeat(201) }, { ...input, pageSize: 200 }, { ...input, page: Number.MAX_SAFE_INTEGER }]) {
    const response = await f.post("/sales/references/query", payload); assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_SALES_QUERY");
  }
  assert.equal((await f.post("/sales/references/query?scope=all", input)).statusCode, 400);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test("SYNTHETIC sales filter references HTTP: denied grants never read, provider failure cannot become empty success", async t => {
  for (const [options, status, reads] of [
    [{ authorize: async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); } }, 403, 0],
    [{ authorize: async () => ({ kind: "restricted", clauses: [] }) as const }, 403, 0],
    [{ failure: new Error("PRIVATE DATABASE CREDENTIALS") }, 500, 1]
  ] as const) {
    const f = await setup(t, options); const response = await f.post("/sales/references/query", { kind: "warehouse", search: "", page: 1, pageSize: 20 });
    assert.equal(response.statusCode, status); assert.equal(f.counts().readCalls, reads); assert.ok(!response.body.includes("PRIVATE")); assert.equal(response.json().items, undefined);
  }
});
test("SYNTHETIC sales reference/detail HTTP: current session adapter and trusted Origin are reused, no alternate authentication", async t => {
  let resolutions = 0; let authenticated = true;
  const authenticate = createSalesSessionAuthenticator({ trustedOrigin: "https://synthetic-erp.example", service: {
    async login() { throw new Error("SYNTHETIC unused login"); }, async logout() {}, async changeOwnPassword() {},
    async resolve() { resolutions++; return authenticated ? { ...actor, staffId: sid("staff", 90), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 } : null; }
  } });
  const f = await setup(t, { authenticate }); const cookie = `__Host-naijue_session=${"A".repeat(43)}`;
  for (const [url, payload] of [["/sales/references/query", { kind: "hall", search: "", page: 1, pageSize: 20 }], ["/sales/detail/query", { salesId: ids.sales }]] as const) {
    for (const headers of [{ cookie }, { cookie, origin: "https://other.example" },
      { cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "cross-site" },
      { cookie, origin: "https://synthetic-erp.example", authorization: "Bearer SYNTHETIC" }]) {
      const response = await f.app.inject({ method: "POST", url, payload, headers }); assert.equal(response.statusCode, 401);
    }
    assert.equal(resolutions, url === "/sales/references/query" ? 0 : 1);
    const response = await f.app.inject({ method: "POST", url, payload, headers: { cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "same-origin" } });
    assert.equal(response.statusCode, 200, response.body);
  }
  assert.equal(resolutions, 2); assert.deepEqual(f.counts(), { policyCalls: 2, readCalls: 2 });
  authenticated = false;
  assert.equal((await f.app.inject({ method: "POST", url: "/sales/references/query", payload: { kind: "hall", search: "", page: 1, pageSize: 20 },
    headers: { cookie, origin: "https://synthetic-erp.example" } })).statusCode, 401);
  assert.deepEqual(f.counts(), { policyCalls: 2, readCalls: 2 }); assert.equal(f.app.server.listening, false);
});

test("SYNTHETIC sales filter references HTTP: simulated disconnect aborts forwarded scope and rejects late provider result", async t => {
  const app = Fastify({ logger: false }); t.after(() => app.close());
  let raw: import("node:http").IncomingMessage | undefined; let forwarded: AbortSignal | undefined;
  let reading!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolve => { reading = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  app.addHook("onRequest", async request => { raw = request.raw; });
  app.register(createSalesQueryHttpPlugin({ authenticate: async () => actor, dependencies: {
    authorization: { async authorize() { return { kind: "restricted", clauses: [{ hallId: ids.hall }] }; } }, reader: {
      async readReferences(read) { forwarded = read.signal; reading(); await gate; return { page: 1, exactTotal: 0n, items: [] }; },
      async readList() { throw new Error("Unexpected list read"); }, async readDetail() { throw new Error("Unexpected detail read"); },
      async readHistory() { throw new Error("Unexpected history read"); }, async readSettlementStatistics() { throw new Error("Unexpected statistics read"); }
    }
  } }));
  await app.ready();
  const pending = app.inject({ method: "POST", url: "/sales/references/query", payload: { kind: "hall", search: "", page: 1, pageSize: 20 } });
  await entered; assert.ok(raw); assert.ok(forwarded); const before = raw.listenerCount("aborted");
  raw.emit("aborted"); assert.equal(forwarded.aborted, true); release();
  const response = await pending; assert.equal(response.statusCode, 408); assert.equal(response.json().error.code, "SALES_READ_ABORTED");
  assert.equal(raw.listenerCount("aborted"), before - 1); assert.equal(app.server.listening, false);
});
