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

test('product management total budget includes authentication and never emits late success',async t=>{
 let authorized=0;
 const app=Fastify({logger:false});t.after(()=>app.close());
 app.register(createProductManagementQueryHttpPlugin({readBudgetMs:15,authenticate:async()=>{await new Promise(r=>setTimeout(r,80));return actor;},dependencies:{authorization:{async authorize(){authorized++;return {kind:'all',totalStock:'unavailable'};}},reader:{async readList(){return {page:1,pageSize:100,exactTotal:1,items:[item]};},async readCandidates(){throw Error('unused');}}}} as ProductManagementQueryHttpOptions & {readBudgetMs:number}));
 const response=await app.inject({method:'POST',url:paths[0],headers:{'content-type':'application/json'},payload:listInput});
 assert.equal(response.statusCode,503);assert.equal(response.json().error.code,'PRODUCT_MANAGEMENT_READ_TIMEOUT');assert.equal(authorized,0);
});

test('serialization deadline records safe timeout stage even when parent onSend ran first',async t=>{
 const {installRequestDiagnostics,requestDiagnostic}=await import('./request-diagnostics.ts');
 const app=Fastify({logger:false});t.after(()=>app.close());installRequestDiagnostics(app);
 let context:ReturnType<typeof requestDiagnostic>;
 app.addHook('onSend',async(request,_reply,payload)=>{context=requestDiagnostic(request.raw);await new Promise(r=>setTimeout(r,45));return payload;});
 app.register(createProductManagementQueryHttpPlugin({readBudgetMs:30,authenticate:async()=>actor,dependencies:{authorization:{async authorize(){return {kind:'all',totalStock:'unavailable'};}},reader:{async readList(){return {page:1,pageSize:100,exactTotal:1,items:[item]};},async readCandidates(){throw Error('unused');}}}}));
 const response=await app.inject({method:'POST',url:paths[0],headers:{'content-type':'application/json'},payload:listInput});
 assert.equal(response.statusCode,503);assert.equal(context?.errorCode,'PRODUCT_MANAGEMENT_READ_TIMEOUT');assert.equal(context?.failureStage,'SERIALIZE');
});


// Independent scheduler/monotonic-clock control. This is an injected HTTP test,
// not a claim that a particular real failed run took one of these branches.
for (const [path, input] of [[paths[0], listInput], [paths[1], candidateInput]] as const) {
  for (const cause of ["budget-timer-before-clock", "client-abort-before-clock", "client-abort-after-clock"] as const) {
    test(`product management cancellation cause boundary ${path}: ${cause}`, { timeout: 5000, concurrency: false }, async t => {
      const { performance } = await import("node:perf_hooks");
      let now = 100, entered!: () => void, release!: () => void;
      const authenticationEntered = new Promise<void>(resolve => { entered = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      const authentication = gate.then(() => actor);
      let authenticated = 0, authorized = 0, reads = 0, sends = 0, responses = 0;
      let raw: import("node:http").IncomingMessage | undefined;
      let responseRaw: import("node:http").ServerResponse | undefined;
      let baselineAborted: unknown[] = [], baselineClose: unknown[] = [];
      let ownedAborted: unknown[] = [], ownedClose: unknown[] = [];
      const errors: string[] = [];
      const app = Fastify({ logger: false });
      t.after(async () => {
        release();
        t.mock.timers.reset();
        t.mock.restoreAll();
        await app.close();
      });
      app.addHook("onRequest", async (request, reply) => {
        raw = request.raw; responseRaw = reply.raw;
        baselineAborted = raw.listeners("aborted"); baselineClose = responseRaw.listeners("close");
      });
      app.addHook("onError", async (_request, _reply, error) => { errors.push((error as { code?: string }).code ?? error.name); });
      app.addHook("onSend", async (_request, _reply, payload) => { sends++; return payload; });
      app.addHook("onResponse", async () => { responses++; });
      app.register(createProductManagementQueryHttpPlugin({ readBudgetMs: 15,
        authenticate: async () => {
          authenticated++;
          ownedAborted = raw!.listeners("aborted").filter(listener => !baselineAborted.includes(listener));
          ownedClose = responseRaw!.listeners("close").filter(listener => !baselineClose.includes(listener));
          entered(); return authentication;
        },
        dependencies: { authorization: { async authorize() { authorized++; return { kind: "all", totalStock: "unavailable" }; } },
          reader: {
            async readList() { reads++; return { page: 1, pageSize: 100, exactTotal: 1, items: [item] }; },
            async readCandidates() { reads++; return { page: 1, pageSize: 20, exactTotal: 1, items: [{ id: productId, code: item.code, name: item.name, label: item.name }] }; }
          } }
      }));
      await app.ready();
      // Neither clock progression nor timer dispatch is inferred from wall sleeps.
      t.mock.method(performance, "now", () => now);
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const pending = app.inject({ method: "POST", url: path, headers: { "content-type": "application/json" }, payload: input });
      try {
        await authenticationEntered;
        assert.equal(app.server.listening, false); assert.ok(raw); assert.ok(responseRaw);
        assert.equal(ownedAborted.length, 1); assert.equal(ownedClose.length, 1);
        t.mock.timers.tick(14);
        assert.deepEqual({ authenticated, authorized, reads, sends, responses }, { authenticated: 1, authorized: 0, reads: 0, sends: 0, responses: 0 });
        now = cause === "client-abort-after-clock" ? 115.25 : 114.75;
        if (cause === "budget-timer-before-clock") t.mock.timers.tick(1);
        else raw.emit("aborted"); // Existing abort seam; real transport is covered separately.
        const response = await pending;
        const beforeLateAuthentication = { authenticated, authorized, reads, sends, responses };
        // Settle the original held authentication promise, not an arbitrary delay.
        release(); await authentication; await Promise.resolve();
        const afterLateAuthentication = { authenticated, authorized, reads, sends, responses };
        const observation = { kind: "PRODUCT_HTTP_CANCELLATION_CAUSE_BOUNDARY", path, cause,
          budgetMs: 15, schedulerElapsedMs: cause === "budget-timer-before-clock" ? 15 : 14,
          monotonicElapsedMs: now - 100, status: response.statusCode, code: response.json().error.code,
          errors, beforeLateAuthentication, afterLateAuthentication };
        t.diagnostic(JSON.stringify(observation));
        assert.deepEqual(afterLateAuthentication, { authenticated: 1, authorized: 0, reads: 0, sends: 1, responses: 1 });
        assert.deepEqual(beforeLateAuthentication, afterLateAuthentication);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.equal(raw.listeners("aborted").some(listener => ownedAborted.includes(listener)), false);
        assert.equal(responseRaw.listeners("close").some(listener => ownedClose.includes(listener)), false);
        const timeout = cause !== "client-abort-before-clock";
        // Required public contract stays 503/TIMEOUT for the budget timer, and
        // 408/ABORTED only for an independent client abort before the deadline.
        assert.equal(response.statusCode, timeout ? 503 : 408);
        assert.equal(response.json().error.code, timeout ? "PRODUCT_MANAGEMENT_READ_TIMEOUT" : "PRODUCT_MANAGEMENT_READ_ABORTED");
      } finally {
        release(); await authentication;
      }
    });
  }
}


// The handler may have settled before a parent's asynchronous onSend returns.
// Keep the actual successful/error payload gated while independently controlling
// timer dispatch and the monotonic clock. No fixed completion sleep is involved.
for (const [path, input] of [[paths[0], listInput], [paths[1], candidateInput]] as const) {
  for (const cause of ["budget-timer-before-clock", "client-abort-before-clock", "clock-deadline-before-timer", "success-before-expiry", "prior-error-after-timer"] as const) {
    test(`product management held serialization cancellation cause boundary ${path}: ${cause}`, { timeout: 5000, concurrency: false }, async t => {
      const { performance } = await import("node:perf_hooks");
      const { installRequestDiagnostics, requestDiagnostic } = await import("./request-diagnostics.ts");
      let now = 100, serializationEntered!: () => void, releaseSerialization!: () => void;
      const serializationHeld = new Promise<void>(resolve => { serializationEntered = resolve; });
      const serializationGate = new Promise<void>(resolve => { releaseSerialization = resolve; });
      let authenticated = 0, authorized = 0, reads = 0, sends = 0, responses = 0, initialStatus = 0;
      let raw: import("node:http").IncomingMessage | undefined;
      let responseRaw: import("node:http").ServerResponse | undefined;
      let readSignal: AbortSignal | undefined;
      let baselineAborted: unknown[] = [], baselineClose: unknown[] = [], ownedAborted: unknown[] = [], ownedClose: unknown[] = [];
      const errors: string[] = [];
      const app = Fastify({ logger: false });
      t.after(async () => { releaseSerialization(); t.mock.timers.reset(); t.mock.restoreAll(); await app.close(); });
      installRequestDiagnostics(app);
      app.addHook("onRequest", async (request, reply) => {
        raw = request.raw; responseRaw = reply.raw;
        baselineAborted = raw.listeners("aborted"); baselineClose = responseRaw.listeners("close");
      });
      // Parent hook genuinely holds the original payload after handler completion.
      app.addHook("onSend", async (_request, reply, payload) => {
        sends++; initialStatus = reply.statusCode; serializationEntered();
        await serializationGate; return payload;
      });
      app.addHook("onError", async (_request, _reply, error) => { errors.push((error as { code?: string }).code ?? error.name); });
      app.addHook("onResponse", async () => { responses++; });
      app.register(createProductManagementQueryHttpPlugin({ readBudgetMs: 15,
        authenticate: async () => {
          authenticated++;
          ownedAborted = raw!.listeners("aborted").filter(listener => !baselineAborted.includes(listener));
          ownedClose = responseRaw!.listeners("close").filter(listener => !baselineClose.includes(listener));
          return actor;
        },
        dependencies: { authorization: { async authorize(_actor, _intent, signal) {
          authorized++; readSignal = signal;
          if (cause === "prior-error-after-timer") throw new DomainError("FORBIDDEN", "PRIVATE synthetic denial");
          return { kind: "all", totalStock: "unavailable" };
        } }, reader: {
          async readList(read) { reads++; assert.equal(read.signal, readSignal); return { page: 1, pageSize: 100, exactTotal: 1, items: [item] }; },
          async readCandidates(read) { reads++; assert.equal(read.signal, readSignal); return { page: 1, pageSize: 20, exactTotal: 1, items: [{ id: productId, code: item.code, name: item.name, label: item.name }] }; }
        } }
      }));
      await app.ready();
      t.mock.method(performance, "now", () => now);
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const pending = app.inject({ method: "POST", url: path, headers: { "content-type": "application/json" }, payload: input });
      try {
        await serializationHeld;
        assert.equal(app.server.listening, false); assert.ok(raw); assert.ok(responseRaw); assert.ok(readSignal);
        assert.equal(initialStatus, cause === "prior-error-after-timer" ? 403 : 200);
        assert.deepEqual({ authenticated, authorized, reads, sends, responses },
          { authenticated: 1, authorized: 1, reads: cause === "prior-error-after-timer" ? 0 : 1, sends: 1, responses: 0 });
        assert.equal(readSignal.aborted, false);
        assert.equal(ownedAborted.length, 1); assert.equal(ownedClose.length, 1);
        t.mock.timers.tick(14);
        assert.equal(readSignal.aborted, false); assert.equal(responses, 0);
        now = cause === "clock-deadline-before-timer" ? 115.25 : 114.75;
        if (cause === "budget-timer-before-clock" || cause === "prior-error-after-timer") t.mock.timers.tick(1);
        else if (cause === "client-abort-before-clock") raw.emit("aborted");
        const beforeRelease = { authenticated, authorized, reads, sends, responses, aborted: readSignal.aborted };
        releaseSerialization();
        const response = await pending;
        // Observe clearing of the SAME configured timer after response completion.
        t.mock.timers.tick(100);
        const context = requestDiagnostic(raw), body = response.json();
        t.diagnostic(JSON.stringify({ kind: "PRODUCT_HTTP_HELD_SERIALIZATION_CAUSE_BOUNDARY", path, cause, budgetMs: 15,
          schedulerBeforeReleaseMs: cause === "budget-timer-before-clock" || cause === "prior-error-after-timer" ? 15 : 14,
          monotonicElapsedMs: now - 100, initialStatus, status: response.statusCode, code: body.error?.code ?? null,
          beforeRelease, afterResponse: { authenticated, authorized, reads, sends, responses, aborted: readSignal.aborted },
          errorCode: context?.errorCode ?? null, failureStage: context?.failureStage ?? null, errors,
          ownedAbortedListenersRemaining: raw.listeners("aborted").filter(listener => ownedAborted.includes(listener)).length,
          ownedCloseListenersRemaining: responseRaw.listeners("close").filter(listener => ownedClose.includes(listener)).length }));
        const status = cause === "success-before-expiry" ? 200 : cause === "prior-error-after-timer" ? 403 : cause === "client-abort-before-clock" ? 408 : 503;
        assert.equal(response.statusCode, status);
        assert.deepEqual({ authenticated, authorized, reads, sends, responses },
          { authenticated: 1, authorized: 1, reads: cause === "prior-error-after-timer" ? 0 : 1, sends: 1, responses: 1 });
        assert.equal(readSignal.aborted, cause !== "success-before-expiry");
        assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers.pragma, "no-cache");
        assert.match(String(response.headers["content-type"]), /^application\/json(?:;|$)/);
        assert.equal(Number(response.headers["content-length"]), Buffer.byteLength(response.body));
        assert.equal(response.body.includes("PRIVATE"), false);
        assert.equal(raw.listeners("aborted").some(listener => ownedAborted.includes(listener)), false);
        assert.equal(responseRaw.listeners("close").some(listener => ownedClose.includes(listener)), false);
        if (status === 200) { assert.equal(body.items.length, 1); assert.equal(context?.errorCode, null); }
        else {
          const code = status === 403 ? "FORBIDDEN" : status === 408 ? "PRODUCT_MANAGEMENT_READ_ABORTED" : "PRODUCT_MANAGEMENT_READ_TIMEOUT";
          assert.equal(body.error.code, code); assert.equal(context?.errorCode, code);
          assert.equal(context?.failureStage, status === 403 ? "HANDLER" : "SERIALIZE");
        }
      } finally { releaseSerialization(); }
    });
  }
}
