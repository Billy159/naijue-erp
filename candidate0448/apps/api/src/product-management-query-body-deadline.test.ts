/** Real loopback HTTP transport regression. Synthetic auth/read ports only;
 * no PostgreSQL, real session, production listener or actual SAVE command.
 * Root must run the held-body case against old production bytes BEFORE patching.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { once } from "node:events";
import { createConnection } from "node:net";
import type { Socket } from "node:net";
import { Writable } from "node:stream";
import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import { createProductManagementQueryHttpPlugin } from "./product-management-query-http.ts";
import type { ProductManagementQueryHttpOptions } from "./product-management-query-http.ts";
import { actor, sid } from "../../../tests/support/synthetic-fixtures.ts";

const paths = ["/product-management/query", "/product-management/candidates/query"] as const;
const list = { filter: { productIds: [], categoryIds: [], years: [], seasonIds: [], supplierIds: [], fitIds: [], thicknesses: [], shapeCodes: [] }, page: 1, pageSize: 100 };
const candidate = { kind: "product", search: "合成", selectedIds: [], page: 1, pageSize: 20 };
const item = { id: sid("product", 7310), code: "SYNTHETIC", name: "合成商品", categoryLabel: null, year: null, seasonLabel: null,
  supplierLabel: null, fits: [], thickness: null, retailPrice: "0.00", totalStock: null };
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function bounded<T>(work: Promise<T>, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Error("SYNTHETIC_HTTP_WAIT_EXPIRED")), ms); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
async function fixture(t: TestContext, options: { budget?: number; authenticate?: ProductManagementQueryHttpOptions["authenticate"]; sendDelay?: number } = {}) {
  let policies = 0, reads = 0, sends = 0, responses = 0, saves = 0, authenticateEntered!: () => void;
  const authenticated = new Promise<void>(resolve => { authenticateEntered = resolve; });
  const logs: string[] = [], sockets = new Set<Socket>(), signals: AbortSignal[] = [];
  const sink = new Writable({ write(chunk, _encoding, done) { logs.push(String(chunk)); done(); } });
  const app = Fastify({ logger: { level: "warn", stream: sink } });
  app.addHook("onSend", async (_request, _reply, payload) => { sends++; if (options.sendDelay) await sleep(options.sendDelay); return payload; });
  app.addHook("onResponse", async () => { responses++; });
  app.register(createProductManagementQueryHttpPlugin({ readBudgetMs: options.budget ?? 30,
    authenticate: async input => { authenticateEntered(); return options.authenticate ? options.authenticate(input) : actor; },
    dependencies: { authorization: { async authorize() { policies++; return { kind: "all", totalStock: "unavailable" }; } },
      reader: { async readList(input) { reads++; signals.push(input.signal); return { page: 1, pageSize: 100, exactTotal: 1, items: [item] }; },
        async readCandidates(input) { reads++; signals.push(input.signal); return { page: 1, pageSize: 20, exactTotal: 1, items: [{ id: item.id, code: item.code, name: item.name, label: item.name }] }; } } } }));
  // Sibling write-shaped transport sentinel: never calls an actual SAVE service.
  app.post("/products/v2/commands", async request => { saves++; return { body: request.body, syntheticSaveTransportOnly: true }; });
  t.after(async () => { for (const socket of sockets) socket.destroy(); app.server.closeAllConnections(); await app.close(); sink.destroy(); });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address(); assert.ok(address && typeof address === "object" && address.address === "127.0.0.1");
  const port = address.port;
  async function post(path: string, value: unknown, rawBody?: string) {
    const bytes = Buffer.from(rawBody ?? JSON.stringify(value)), split = Math.max(1, Math.floor(bytes.length / 2));
    const socket = createConnection({ host: "127.0.0.1", port }); sockets.add(socket); socket.setNoDelay(true);
    const chunks: Buffer[] = [], errors: string[] = []; let complete = false, endedAt: number | null = null, tailWritten = false;
    socket.on("data", chunk => { chunks.push(Buffer.from(chunk)); });
    socket.on("error", error => { errors.push((error as Error & { code?: string }).code ?? error.name); });
    const closed = new Promise<void>(resolve => { socket.once("close", () => { sockets.delete(socket); complete = true; endedAt = performance.now(); resolve(); }); });
    await bounded(once(socket, "connect"));
    const startedAt = performance.now();
    socket.write(`POST ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n\r\n`);
    socket.write(bytes.subarray(0, split));
    return { socket, closed, startedAt, errors, isComplete: () => complete, tailWritten: () => tailWritten, elapsed: () => endedAt === null ? null : endedAt - startedAt,
      finishBody() { if (!tailWritten && !socket.destroyed) { tailWritten = true; socket.write(bytes.subarray(split)); } },
      response() { const wire = Buffer.concat(chunks).toString("utf8"), boundary = wire.indexOf("\r\n\r\n");
        return { wire, responseCount: (wire.match(/^HTTP\/1\.1 /gm) ?? []).length, status: Number(/^HTTP\/1\.1 (\d{3})/.exec(wire)?.[1]),
          headers: boundary < 0 ? "" : wire.slice(0, boundary), body: boundary < 0 ? "" : wire.slice(boundary + 4) }; } };
  }
  return { app, authenticated, post, signals, counts: () => ({ policies, reads, sends, responses, saves }),
    assertNoDoubleWrite() { assert.ok(logs.every(line => !/FST_ERR_REP_ALREADY_SENT|ERR_STREAM_WRITE_AFTER_END|ERR_HTTP_HEADERS_SENT/.test(line)), logs.join("\n")); } };
}
for (const [path, input] of [[paths[0], list], [paths[1], candidate]] as const) {
  test(`raw segmented JSON ${path}: 30ms total deadline finishes before the held body ends`, { timeout: 5000 }, async t => {
    const f = await fixture(t), request = await f.post(path, input);
    let completedBeforeTail = false;
    try {
      await bounded(f.authenticated); await sleep(150);
      completedBeforeTail = request.isComplete();
      assert.equal(completedBeforeTail, true, "deadline response was still pending after150ms while JSON body was deliberately incomplete");
      assert.equal(request.tailWritten(), false); const result = request.response();
      assert.equal(result.status, 503); assert.equal(JSON.parse(result.body).error.code, "PRODUCT_MANAGEMENT_READ_TIMEOUT");
      assert.equal(result.responseCount, 1); assert.match(result.headers, /cache-control: no-store/i);
      assert.deepEqual(f.counts(), { policies: 0, reads: 0, sends: 1, responses: 1, saves: 0 });
    } finally {
      // Old production is intentionally allowed to finish only after the RED assertion.
      request.finishBody(); await bounded(request.closed); await sleep(20);
      t.diagnostic(JSON.stringify({ budgetMs: 30, heldBodyMs: 150, completedBeforeTail, responseEndMs: request.elapsed(), responseCount: request.response().responseCount }));
    }
    assert.equal(request.response().responseCount, 1); f.assertNoDoubleWrite();
  });
}
test("body adapter preserves exact UTF8/content-length and clears successful read timer", { timeout: 5000 }, async t => {
  const f = await fixture(t, { budget: 200 }), request = await f.post(paths[1], candidate);
  request.finishBody(); await bounded(request.closed); await sleep(230);
  assert.equal(request.response().status, 200); assert.equal(request.response().responseCount, 1); assert.equal(f.signals.length, 1); assert.equal(f.signals[0]!.aborted, false);
  assert.deepEqual(f.counts(), { policies: 1, reads: 1, sends: 1, responses: 1, saves: 0 }); f.assertNoDoubleWrite();
});
test("authentication timeout owns one response and late authentication cannot enter body or query", { timeout: 5000 }, async t => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, { authenticate: async () => { await pending; return actor; } }), request = await f.post(paths[0], list);
  try { await bounded(f.authenticated); await sleep(150); assert.equal(request.isComplete(), true);
    assert.equal(request.response().status, 503); assert.equal(JSON.parse(request.response().body).error.code, "PRODUCT_MANAGEMENT_READ_TIMEOUT");
  } finally { release(); request.finishBody(); await bounded(request.closed); }
  await sleep(30); assert.deepEqual(f.counts(), { policies: 0, reads: 0, sends: 1, responses: 1, saves: 0 }); f.assertNoDoubleWrite();
});
test("prior authentication and malformed-body failures keep precedence through slow parent onSend", { timeout: 5000 }, async t => {
  for (const mode of ["unauthenticated", "malformed"] as const) {
    const f = await fixture(t, { authenticate: async () => mode === "unauthenticated" ? null : actor, sendDelay: 60 });
    const request = await f.post(paths[0], list, mode === "malformed" ? '{"bad":]' : undefined);
    request.finishBody(); await bounded(request.closed); await sleep(40);
    assert.equal(request.response().status, mode === "unauthenticated" ? 401 : 400);
    assert.equal(request.response().responseCount, 1); assert.deepEqual(f.counts(), { policies: 0, reads: 0, sends: 1, responses: 1, saves: 0 }); f.assertNoDoubleWrite();
  }
});
test("disconnect during partial read body cannot produce late deadline responses or query work", { timeout: 5000 }, async t => {
  const f = await fixture(t, { budget: 80 }), request = await f.post(paths[0], list);
  await bounded(f.authenticated); request.socket.destroy(); await bounded(request.closed); await sleep(140);
  assert.equal(f.counts().policies, 0); assert.equal(f.counts().reads, 0); assert.ok(f.counts().sends <= 1); assert.ok(f.counts().responses <= 1); f.assertNoDoubleWrite();
});
test("read-body deadline is plugin-scoped and does not cancel a slow sibling SAVE-shaped request", { timeout: 5000 }, async t => {
  const f = await fixture(t), request = await f.post("/products/v2/commands", { synthetic: true });
  await sleep(150); assert.equal(request.isComplete(), false); request.finishBody(); await bounded(request.closed);
  assert.equal(request.response().status, 200); assert.equal(request.response().responseCount, 1); assert.equal(f.signals.length, 0);
  assert.deepEqual(f.counts(), { policies: 0, reads: 0, sends: 1, responses: 1, saves: 1 }); f.assertNoDoubleWrite();
});
