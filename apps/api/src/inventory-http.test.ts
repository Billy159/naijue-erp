import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, realpath, readdir, rm, lstat, open, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryQueryDependencies, TrustedInventorySnapshotReader } from "../../../packages/application/src/inventory-query-contracts.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { candidateParameters, inventoryActor, inventoryParameters, inventoryScope, syntheticCandidateSnapshot, syntheticInventorySnapshot, syntheticInventoryReader, syntheticInventoryOutput } from "../../../tests/support/synthetic-inventory-query.ts";
import { createInventoryHttpPlugin } from "./inventory-http.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import { inventoryId } from "../../../tests/support/synthetic-inventory-query.ts";
import type { InventoryHttpOptions } from "./inventory-http.ts";
async function setup(t: TestContext, options: { authenticate?: InventoryHttpOptions["authenticate"]; reader?: TrustedInventorySnapshotReader; authorization?: InventoryQueryDependencies["authorization"]; count?: number } = {}) {
  const app = Fastify({ logger: false }); const calls = { inventory: 0, candidates: 0, authorize: 0 };
  const reader: TrustedInventorySnapshotReader = options.reader ?? {
    async readInventory(read) { calls.inventory++; return syntheticInventorySnapshot(read, options.count ?? 1); },
    async readCandidates(read) { calls.candidates++; return syntheticCandidateSnapshot(read); }
  };
  const outputDirectory = reader.readInventoryOutput ? await realpath(await mkdtemp(join(tmpdir(), "synthetic-inventory-http-output-"))) : undefined;
  app.register(createInventoryHttpPlugin({ ...(outputDirectory ? { outputSpool: { directory: outputDirectory, maxBytes: 536870912, maxConcurrent: 1, maxDurationMs: 120000 } } : {}), authenticate: options.authenticate ?? (async () => inventoryActor), dependencies: {
    reader, authorization: options.authorization ?? { async authorize() { calls.authorize++; return inventoryScope; } }
  } }));
  t.after(async () => { await app.close(); if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true }); }); await app.ready();
  const post = (body: unknown, url = "/inventory/query") => app.inject({ method: "POST", url, payload: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { app, calls, post };
}
test("inventory full output HTTP: existing plugin streams all products with metadata, private headers and an explicit final completion frame", async t => {
  const f = await setup(t, { reader: { ...syntheticInventoryReader(103), async readInventory() { throw Error("Output cannot use current-page reads"); } } });
  const response = await f.post({ filter: inventoryParameters().filter }, "/inventory/output/query"); assert.equal(response.statusCode, 200, response.body);
  assert.match(String(response.headers["content-type"]), /^application\/x-ndjson/); assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers.pragma, "no-cache");
  const frames = response.body.trimEnd().split("\n").map(line => JSON.parse(line)); assert.equal(frames.length, 105); assert.equal(frames[0].kind, "summary"); assert.equal(frames.at(-1).kind, "complete");
  assert.equal(frames.at(-1).emittedProducts, 103); assert.equal(frames.at(-1).allMatchesTotal.knownQuantity, "-206"); assert.equal(response.headers["x-inventory-read-reference"], frames[0].readReference);
  assert.equal(f.calls.authorize, 1); assert.equal(f.app.server.listening, false);
});

test("inventory full output HTTP: original trusted Origin, exact filter body and current warehouse permission run before output", async t => {
  let opened = 0; const base = syntheticInventoryReader(); const reader: TrustedInventorySnapshotReader = { ...base, async *readInventoryOutput(read) { opened++; yield* syntheticInventoryOutput(read); } };
  const authenticate = createSalesSessionAuthenticator({ trustedOrigin: "https://synthetic-erp.example", service: {
    async login() { throw Error("unused"); }, async logout() {}, async changeOwnPassword() {}, async resolve() { return { ...inventoryActor, staffId: inventoryId("staff", 90), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 }; }
  } });
  const f = await setup(t, { reader, authenticate }), url = "/inventory/output/query", payload = { filter: inventoryParameters().filter }, cookie = `__Host-naijue_session=${"A".repeat(43)}`;
  for (const origin of [undefined, "https://other.example"]) { const response = await f.app.inject({ method: "POST", url, payload, headers: { cookie, ...(origin ? { origin } : {}) } }); assert.equal(response.statusCode, 401); }
  assert.equal(opened, 0);
  for (const body of [{ ...payload, page: 1 }, { ...payload, actor: inventoryActor }, { filter: { ...payload.filter, warehouses: [{ id: inventoryId("warehouse", 999), label: "forged" }] } }]) {
    const response = await f.app.inject({ method: "POST", url, payload: body, headers: { cookie, origin: "https://synthetic-erp.example" } }); assert.ok([400, 403].includes(response.statusCode));
  }
  assert.equal(opened, 0); const valid = await f.app.inject({ method: "POST", url, payload, headers: { cookie, origin: "https://synthetic-erp.example" } }); assert.equal(valid.statusCode, 200); assert.equal(opened, 1);
});

test("inventory full output HTTP: a failure after all product data never emits a successful completion and always closes the provider", async t => {
  let products = 0, closed = false; const f = await setup(t, { reader: { ...syntheticInventoryReader(), async *readInventoryOutput(read) {
    try { for await (const frame of syntheticInventoryOutput(read, 2)) { if (frame.kind === "complete") throw new Error("SYNTHETIC commit failed"); if (frame.kind === "product") products++; yield frame; } } finally { closed = true; }
  } } });
  let body = "", failed = false; try { body = (await f.post({ filter: inventoryParameters().filter }, "/inventory/output/query")).body; } catch { failed = true; }
  assert.equal(products, 2); assert.equal(closed, true); assert.equal(body.includes('"kind":"complete"'), false); assert.ok(failed || body.length > 0);
});
test("inventory full output HTTP: disconnected stream aborts the original read, closes its provider and removes request listeners", async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "synthetic-inventory-http-cancel-")));
  const app = Fastify({ logger: false }); t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); }); let response: import("node:http").ServerResponse | undefined, raw: import("node:http").IncomingMessage | undefined, forwarded: AbortSignal | undefined, closed = false;
  let release!: () => void, entered!: () => void; const gate = new Promise<void>(r => { release = r; }), reading = new Promise<void>(r => { entered = r; });
  app.addHook("onRequest", async (request, reply) => { response = reply.raw; raw = request.raw; });
  app.register(createInventoryHttpPlugin({ outputSpool: { directory, maxBytes: 536870912, maxConcurrent: 1, maxDurationMs: 120000 }, authenticate: async () => inventoryActor, dependencies: { authorization: { async authorize() { return inventoryScope; } }, reader: { ...syntheticInventoryReader(), async *readInventoryOutput(read) {
    forwarded = read.signal; try { for await (const frame of syntheticInventoryOutput(read)) { if (frame.kind === "product") { entered(); await gate; } yield frame; } } finally { closed = true; }
  } } } })); await app.ready();
  const pending = app.inject({ method: "POST", url: "/inventory/output/query", payload: { filter: inventoryParameters().filter } }).then(value => value, error => error);
  await reading; assert.ok(response); assert.ok(raw); response.emit("close"); assert.equal(forwarded?.aborted, true); release(); await pending;
  assert.equal(closed, true); assert.equal(raw.listenerCount("aborted"), 0); assert.equal(app.server.listening, false);
});
test("SYNTHETIC inventory HTTP: required trusted providers, no listener and DTO-compatible read-only routes", async t => {
  assert.throws(() => createInventoryHttpPlugin({} as InventoryHttpOptions), /trusted authentication/);
  assert.throws(() => createInventoryHttpPlugin({ authenticate: async () => inventoryActor } as unknown as InventoryHttpOptions), /trusted authorization/);
  const f = await setup(t, { count: 103 }); assert.equal(f.app.server.listening, false);
  const first = await f.post(inventoryParameters()); const second = await f.post(inventoryParameters(2));
  assert.equal(first.statusCode, 200, first.body); assert.equal(second.statusCode, 200, second.body);
  assert.equal(first.json().products.length, 100); assert.equal(second.json().products.length, 3); assert.equal(second.json().exactTotalProducts, 103);
  assert.deepEqual(first.json().allMatchesTotal, second.json().allMatchesTotal);
  assert.equal(first.headers["x-inventory-read-reference"], first.json().readReference); assert.equal(first.headers["x-inventory-readiness"], "ready");
  assert.equal(first.headers["cache-control"], "no-store"); assert.equal(first.headers.pragma, "no-cache");
  const candidates = await f.post(candidateParameters(2), "/inventory/candidates/query");
  assert.equal(candidates.statusCode, 200, candidates.body); assert.equal(candidates.json().items.length, 3); assert.equal(candidates.json().exactTotal, 23);
  assert.equal(candidates.headers["x-inventory-read-reference"], "SYNTHETIC-CANDIDATE-SNAPSHOT-1");
  assert.deepEqual(f.calls, { inventory: 2, candidates: 1, authorize: 3 }); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC inventory HTTP: authentication runs first and receives request metadata, not client actor", async t => {
  let observed: unknown;
  const f = await setup(t, { authenticate: async input => { observed = input; return null; } });
  for (const url of ["/inventory/query", "/inventory/candidates/query"]) {
    const response = await f.post({ actor: inventoryActor }, url); assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
  }
  assert.deepEqual(Object.keys(observed as object).sort(), ["headers", "ip", "method", "url"]);
  assert.deepEqual(f.calls, { inventory: 0, candidates: 0, authorize: 0 });
});
test("SYNTHETIC inventory HTTP: malformed authentication and private auth errors fail closed", async t => {
  for (const authenticate of [async () => ({ accountId: "forged", hallId: null }) as ActorContext,
    async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTH PROVIDER"); }]) {
    const f = await setup(t, { authenticate }); const response = await f.post(inventoryParameters());
    assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR"); assert.ok(!response.body.includes("PRIVATE"));
    assert.deepEqual(f.calls, { inventory: 0, candidates: 0, authorize: 0 });
  }
});
test("SYNTHETIC inventory HTTP: strict structured input rejects spoofed identity, query fields and malformed candidates without reading", async t => {
  const f = await setup(t);
  const responses = await Promise.all([
    f.post({ ...inventoryParameters(), actor: inventoryActor }), f.post({ ...inventoryParameters(), hallId: inventoryActor.hallId }),
    f.post({ ...inventoryParameters(), page: "1" }), f.post(inventoryParameters(1, 20)), f.post(inventoryParameters(), "/inventory/query?role=ADMIN"),
    f.post({ ...candidateParameters(), kind: "all" }, "/inventory/candidates/query"),
    f.post({ ...candidateParameters(), pageSize: 100 }, "/inventory/candidates/query"),
    f.post({ ...candidateParameters(), search: "x".repeat(201) }, "/inventory/candidates/query"),
    f.post({ ...candidateParameters(), selectedIds: ["unknown"] }, "/inventory/candidates/query")
  ]);
  for (const response of responses) { assert.equal(response.statusCode, 400, response.body); assert.equal(response.json().error.code, "INVALID_INVENTORY_INPUT"); }
  assert.deepEqual(f.calls, { inventory: 0, candidates: 0, authorize: 0 });
});
test("SYNTHETIC inventory HTTP: malformed transport and body limits reject without reading", async t => {
  const f = await setup(t);
  for (const payload of ["{", "", '{"__proto__":{}}']) {
    const response = await f.app.inject({ method: "POST", url: "/inventory/query", headers: { "content-type": "application/json" }, payload });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal((await f.app.inject({ method: "POST", url: "/inventory/query", payload: "text" })).statusCode, 415);
  assert.equal((await f.post({ padding: "x".repeat(65_536) })).statusCode, 413);
  assert.deepEqual(f.calls, { inventory: 0, candidates: 0, authorize: 0 });
});
test("SYNTHETIC inventory HTTP: authorization failure prevents reader; facts unavailable is 503, never an empty successful page", async t => {
  const denied = await setup(t, { authorization: { async authorize() { throw new DomainError("FORBIDDEN", "PRIVATE SCOPE DETAILS"); } } });
  const response = await denied.post(inventoryParameters()); assert.equal(response.statusCode, 403); assert.ok(!response.body.includes("PRIVATE")); assert.equal(denied.calls.inventory, 0);
  const unavailable = await setup(t, { reader: {
    async readInventory() { throw new DomainError("INVENTORY_NOT_READY", "PRIVATE missing coverage table"); },
    async readCandidates() { throw new DomainError("INVENTORY_NOT_READY", "PRIVATE facts absent"); }
  } });
  for (const [url, body] of [["/inventory/query", inventoryParameters()], ["/inventory/candidates/query", candidateParameters()]] as const) {
    const result = await unavailable.post(body, url); assert.equal(result.statusCode, 503); assert.equal(result.json().error.code, "INVENTORY_NOT_READY"); assert.ok(!result.body.includes("PRIVATE"));
  }
});
test("SYNTHETIC inventory HTTP: unknown storage and malformed response never leak SQL, credentials or zero-total success", async t => {
  for (const reader of [
    { async readInventory() { throw new Error("PRIVATE SQL password=secret"); }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } },
    { async readInventory(read) { const result = structuredClone(syntheticInventorySnapshot(read)); Object.assign(result.data, { exactTotalProducts: null, private: "PRIVATE SQL" }); return result; }, async readCandidates(read) { return syntheticCandidateSnapshot(read); } }
  ] satisfies TrustedInventorySnapshotReader[]) {
    const f = await setup(t, { reader }); const response = await f.post(inventoryParameters());
    assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR"); assert.ok(!response.body.includes("PRIVATE"));
  }
});
test("SYNTHETIC inventory HTTP: request disconnect signal reaches authorization and reader, listener registration is cleaned on response", async t => {
  let received: AbortSignal | undefined;
  const f = await setup(t, { authorization: { async authorize(_actor, _intent, signal) { received = signal; return inventoryScope; } }, reader: {
    async readInventory(read) { assert.equal(read.signal, received); assert.equal(read.signal.aborted, false); return syntheticInventorySnapshot(read); },
    async readCandidates(read) { return syntheticCandidateSnapshot(read); }
  } });
  const response = await f.post(inventoryParameters()); assert.equal(response.statusCode, 200); assert.ok(received instanceof AbortSignal);
  assert.equal(received.aborted, false); // Normal completion is not misreported as a SQL cancellation.
});

test("SYNTHETIC inventory HTTP: simulated disconnected request aborts the forwarded signal and rejects a late result", async t => {
  const app = Fastify({ logger: false }); t.after(() => app.close());
  let raw: import("node:http").IncomingMessage | undefined; let forwarded: AbortSignal | undefined;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let reading!: () => void; const entered = new Promise<void>(resolve => { reading = resolve; });
  app.addHook("onRequest", async request => { raw = request.raw; });
  app.register(createInventoryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: {
    authorization: { async authorize() { return inventoryScope; } }, reader: {
      async readInventory(read) { forwarded = read.signal; reading(); await gate; return syntheticInventorySnapshot(read); },
      async readCandidates(read) { return syntheticCandidateSnapshot(read); }
    }
  } }));
  await app.ready();
  const pending = app.inject({ method: "POST", url: "/inventory/query", payload: inventoryParameters() });
  await entered; assert.ok(raw); assert.ok(forwarded); const before = raw.listenerCount("aborted");
  raw.emit("aborted"); assert.equal(forwarded.aborted, true); release();
  const response = await pending; assert.equal(response.statusCode, 408); assert.equal(response.json().error.code, "INVENTORY_READ_ABORTED");
  assert.equal(raw.listenerCount("aborted"), before - 1); assert.equal(app.server.listening, false);
});

test("SYNTHETIC inventory HTTP: reviewed session authenticator is structurally reusable and POST reads require trusted Origin", async t => {
  let resolutions = 0;
  const authenticate = createSalesSessionAuthenticator({ trustedOrigin: "https://synthetic-erp.example", service: {
    async login() { throw new Error("SYNTHETIC unused login"); }, async logout() {}, async changeOwnPassword() {},
    async resolve() { resolutions++; return { ...inventoryActor, staffId: inventoryId("staff", 90), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 }; }
  } });
  const f = await setup(t, { authenticate });
  const cookie = `__Host-naijue_session=${"A".repeat(43)}`;
  for (const headers of [
    { cookie }, { cookie, origin: "https://other.example" },
    { cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "cross-site" },
    { cookie, origin: "https://synthetic-erp.example", authorization: "Bearer SYNTHETIC" }
  ]) {
    const response = await f.app.inject({ method: "POST", url: "/inventory/query", payload: inventoryParameters(), headers });
    assert.equal(response.statusCode, 401); assert.equal(f.calls.inventory, 0);
  }
  assert.equal(resolutions, 0);
  const valid = await f.app.inject({ method: "POST", url: "/inventory/query", payload: inventoryParameters(), headers: {
    cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "same-origin"
  } });
  assert.equal(valid.statusCode, 200, valid.body); assert.equal(resolutions, 1); assert.equal(f.calls.inventory, 1);
});

test("SYNTHETIC inventory HTTP: incomplete snapshot is 503, not a partial 200 or a zero-filled page", async t => {
  const f = await setup(t, { reader: {
    async readInventory(read) { const result = syntheticInventorySnapshot(read, 103); Object.assign(result, { readiness: "incomplete" }); return result; },
    async readCandidates(read) { const result = syntheticCandidateSnapshot(read); Object.assign(result, { readiness: "incomplete" }); return result; }
  } });
  for (const [url, body] of [["/inventory/query", inventoryParameters()], ["/inventory/candidates/query", candidateParameters()]] as const) {
    const result = await f.post(body, url); assert.equal(result.statusCode, 503); assert.equal(result.json().error.code, "INVENTORY_NOT_READY");
    assert.equal(result.json().products, undefined); assert.equal(result.headers["x-inventory-readiness"], undefined);
  }
});


test("inventory output spool: database provider finishes before HTTP begins network consumption and temporary output is removed", async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "synthetic-inventory-output-"))); const app = Fastify({ logger: false });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  let closed = false, sentAfterRelease = false;
  app.addHook("onSend", async (_request, _reply, payload) => { if (payload && typeof payload === "object" && "pipe" in payload) { sentAfterRelease = closed; } return payload; });
  const base = syntheticInventoryReader(203);
  app.register(createInventoryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: { authorization: { async authorize() { return inventoryScope; } }, reader: { ...base, async *readInventoryOutput(read) {
    try { yield* syntheticInventoryOutput(read, 203); } finally { closed = true; }
  } } }, outputSpool: { directory, maxBytes: 536870912, maxConcurrent: 1, maxDurationMs: 120000 } } as InventoryHttpOptions));
  await app.ready(); const response = await app.inject({ method: "POST", url: "/inventory/output/query", payload: { filter: inventoryParameters().filter } });
  assert.equal(response.statusCode, 200, response.body); assert.equal(sentAfterRelease, true, "Network must not control the database producer's next() calls");
  const frames = response.body.trimEnd().split("\n").map(line => JSON.parse(line)); assert.equal(frames.filter(frame => frame.kind === "product").length, 203); assert.equal(frames.at(-1).kind, "complete");
  assert.deepEqual(await readdir(directory), []);
});
async function spoolHttp(t: TestContext, reader: TrustedInventorySnapshotReader, resource: Partial<NonNullable<InventoryHttpOptions["outputSpool"]>> = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "synthetic-inventory-spool-case-"))), app = Fastify({ logger: false });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  let response: import("node:http").ServerResponse | undefined, failed!: () => void; const preparationFailed = new Promise<void>(resolve => { failed = resolve; });
  app.addHook("onError", async (_request, reply) => { if (reply.raw === response) failed(); });
  app.addHook("onRequest", async (request, reply) => { if (request.url === "/inventory/output/query" && !response) response = reply.raw; });
  app.register(createInventoryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: { reader, authorization: { async authorize() { return inventoryScope; } } }, outputSpool: { directory, maxBytes: 536870912, maxConcurrent: 1, maxDurationMs: 120000, ...resource } }));
  await app.ready(); const post = () => app.inject({ method: "POST", url: "/inventory/output/query", payload: { filter: inventoryParameters().filter } });
  return { app, directory, post, response: () => response, preparationFailed };
}
test("inventory output spool: complete size failure, producer failure and missing configuration never send partial success and release resources", async t => {
  for (const mode of ["size", "producer"] as const) {
    let closed = 0; const f = await spoolHttp(t, { ...syntheticInventoryReader(), async *readInventoryOutput(read) { try { for await (const frame of syntheticInventoryOutput(read, 2)) { if (mode === "producer" && frame.kind === "complete") throw Error("SYNTHETIC commit failed"); yield frame; } } finally { closed++; } } }, mode === "size" ? { maxBytes: 100 } : {});
    const result = await f.post(); assert.equal(result.statusCode, mode === "size" ? 503 : 500); assert.equal(result.body.includes('"kind":"complete"'), false); assert.equal(closed, 1); assert.deepEqual(await readdir(f.directory), []);
    const retry = await f.post(); assert.equal(retry.statusCode, mode === "size" ? 503 : 500); assert.equal(closed, 2, "Failure must release its output slot");
  }
  const app = Fastify({ logger: false }); t.after(() => app.close()); let opened = 0;
  app.register(createInventoryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: { authorization: { async authorize() { return inventoryScope; } }, reader: { ...syntheticInventoryReader(), async *readInventoryOutput(read) { opened++; yield* syntheticInventoryOutput(read); } } } }));
  await app.ready(); const noConfig = await app.inject({ method: "POST", url: "/inventory/output/query", payload: { filter: inventoryParameters().filter } }); assert.equal(noConfig.statusCode, 503); assert.equal(opened, 0);
  const absent = await spoolHttp(t, { ...syntheticInventoryReader(), async *readInventoryOutput(read) { opened++; yield* syntheticInventoryOutput(read); } }, { directory: join(await realpath(tmpdir()), `synthetic-unmounted-inventory-${process.pid}`) });
  const unmounted = await absent.post(); assert.equal(unmounted.statusCode, 503); assert.equal(opened, 0); assert.deepEqual(await readdir(absent.directory), []);
});
test("inventory output spool: one private0600 file and no export queue, ordinary pages remain available, disconnect cleans and cancels the original producer", async t => {
  let release!: () => void, entered!: () => void, signal: AbortSignal | undefined, closed = false; const gate = new Promise<void>(resolve => { release = resolve; }), reading = new Promise<void>(resolve => { entered = resolve; });
  const f = await spoolHttp(t, { ...syntheticInventoryReader(), async *readInventoryOutput(read) { signal = read.signal; try { for await (const frame of syntheticInventoryOutput(read, 2)) { if (frame.kind === "product") { entered(); await gate; } yield frame; } } finally { closed = true; } } });
  const first = f.post().then(value => value, error => error); await reading; const files = await readdir(f.directory); assert.equal(files.length, 1); assert.equal((await lstat(join(f.directory, files[0]!))).mode & 0o777, 0o600);
  const busy = await f.post(); assert.equal(busy.statusCode, 503);
  const page = await f.app.inject({ method: "POST", url: "/inventory/query", payload: inventoryParameters() }); assert.equal(page.statusCode, 200);
  f.response()!.emit("close"); assert.equal(signal?.aborted, true); release(); await first; await f.preparationFailed; assert.equal(closed, true); assert.deepEqual(await readdir(f.directory), []);
});
test("inventory output spool: total deadline aborts preparation and clears its file without completion, without claiming SQL cancellation", async t => {
  let aborted = false, closed = false;
  const f = await spoolHttp(t, { ...syntheticInventoryReader(), async *readInventoryOutput(read) { try { for await (const frame of syntheticInventoryOutput(read, 2)) { if (frame.kind === "product") { await new Promise(resolve => setTimeout(resolve, 20)); aborted = read.signal.aborted; } yield frame; } } finally { closed = true; } } }, { maxDurationMs: 5 });
  const response = await f.post(); assert.equal(response.statusCode, 408); assert.equal(aborted, true); assert.equal(closed, true); assert.equal(response.body.includes('"kind":"complete"'), false); assert.deepEqual(await readdir(f.directory), []);
});
test("inventory output spool F01: deadline during final stat never starts a successful network stream after producer EOF", { timeout: 5000 }, async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "synthetic-inventory-post-stat-"))), app = Fastify({ logger: false });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  let signal: AbortSignal | undefined, closed = false, statEntered = false, returnedAfterAbort = false, networkStarted = false;
  const seedPath = join(directory, "stat-prototype"), seed = await open(seedPath, "wx", 0o600);
  const prototype = Object.getPrototypeOf(seed) as FileHandle, originalStat = prototype.stat; await seed.close(); await rm(seedPath);
  t.mock.method(prototype, "stat", async function(this: FileHandle, ...args: Parameters<FileHandle["stat"]>) {
    statEntered = true; assert.equal(closed, true, "The producer must have completed before final file stat"); assert.ok(signal);
    if (!signal.aborted) await new Promise<void>(resolve => signal!.addEventListener("abort", () => resolve(), { once: true }));
    returnedAfterAbort = signal.aborted; return Reflect.apply(originalStat, this, args);
  }, { times: 1 });
  app.addHook("onSend", async (_request, _reply, payload) => { if (payload && typeof payload === "object" && "pipe" in payload) networkStarted = true; return payload; });
  app.register(createInventoryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: { authorization: { async authorize() { return inventoryScope; } }, reader: {
    ...syntheticInventoryReader(), async *readInventoryOutput(read) { signal = read.signal; try { yield* syntheticInventoryOutput(read, 2); } finally { closed = true; } }
  } }, outputSpool: { directory, maxBytes: 536870912, maxConcurrent: 1, maxDurationMs: 100 } }));
  await app.ready(); const response = await app.inject({ method: "POST", url: "/inventory/output/query", payload: { filter: inventoryParameters().filter } });
  assert.equal(statEntered, true); assert.equal(returnedAfterAbort, true); assert.equal(closed, true);
  assert.equal(response.statusCode, 408, "A deadline reached inside final stat must be checked before success");
  assert.equal(response.json().error.code, "INVENTORY_READ_ABORTED"); assert.equal(networkStarted, false);
  assert.equal(response.headers["x-inventory-readiness"], undefined); assert.equal(response.body.includes('"kind":"complete"'), false); assert.deepEqual(await readdir(directory), []);
});
