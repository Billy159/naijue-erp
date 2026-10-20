import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import type { IncomingMessage } from "node:http";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import type { InventoryLedgerQueryDependencies, TrustedInventoryLedgerSnapshotReader } from "../../../packages/application/src/inventory-ledger-query-contracts.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { inventoryActor, inventoryId, inventoryScope, ledgerEntry, ledgerParameters, ledgerSnapshot } from "../../../tests/support/synthetic-inventory-ledger-query.ts";
import { createSalesSessionAuthenticator } from "./authentication.ts";
import { createInventoryLedgerQueryHttpPlugin } from "./inventory-ledger-query-http.ts";
import type { InventoryLedgerQueryHttpOptions } from "./inventory-ledger-query-http.ts";
const URL = "/inventory/ledger/query";
async function setup(t: TestContext, options: { authenticate?: InventoryLedgerQueryHttpOptions["authenticate"]; reader?: TrustedInventoryLedgerSnapshotReader; authorization?: InventoryLedgerQueryDependencies["authorization"] } = {}) {
  const app = Fastify({ logger: false }); t.after(() => app.close()); const calls = { authorize: 0, read: 0 };
  app.register(createInventoryLedgerQueryHttpPlugin({ authenticate: options.authenticate ?? (async () => inventoryActor), dependencies: {
    authorization: options.authorization ?? { async authorize() { calls.authorize++; return inventoryScope; } },
    reader: options.reader ?? { async readLedger(read) { calls.read++; return ledgerSnapshot(read); } }
  } }));
  await app.ready(); const post = (body: unknown, url = URL) => app.inject({ method: "POST", url, headers: { "content-type": "application/json" }, payload: JSON.stringify(body) });
  return { app, calls, post };
}

test("SYNTHETIC ledger HTTP: separate opt-in route, explicit providers, exact native DTO and no listener", async t => {
  assert.throws(() => createInventoryLedgerQueryHttpPlugin({} as InventoryLedgerQueryHttpOptions), /trusted authentication/);
  assert.throws(() => createInventoryLedgerQueryHttpPlugin({ authenticate: async () => inventoryActor } as unknown as InventoryLedgerQueryHttpOptions), /trusted inventory authorization/);
  const f = await setup(t); assert.equal(f.app.server.listening, false); const response = await f.post(ledgerParameters());
  assert.equal(response.statusCode, 200, response.body); assert.deepEqual(Object.keys(response.json()).sort(), ["pageSize", "labelBasis", "warehouse", "sku", "entries", "nextCursor"].sort());
  assert.equal(response.json().entries[0].quantityDelta, "-9223372036854775808"); assert.equal(response.json().entries[0].postedAt, "2026-10-20T18:20:30.123456Z");
  assert.equal(response.headers["x-inventory-read-reference"], "SYNTHETIC-LEDGER-SNAPSHOT"); assert.equal(response.headers["x-inventory-readiness"], "ready");
  assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers.pragma, "no-cache"); assert.equal(f.app.server.listening, false);
  for (const url of ["/inventory/query", "/inventory/candidates/query", "/sales/query", "/transfers/query"]) assert.equal((await f.post(ledgerParameters(), url)).statusCode, 404);
  assert.deepEqual(f.calls, { authorize: 1, read: 1 });
});

test("SYNTHETIC ledger HTTP: authentication precedes invalid JSON/body and receives no client actor", async t => {
  let observed: unknown; const f = await setup(t, { authenticate: async input => { observed = input; return null; } });
  const response = await f.app.inject({ method: "POST", url: URL, headers: { "content-type": "application/json" }, payload: "{" });
  assert.equal(response.statusCode, 401); assert.deepEqual(Object.keys(observed as object).sort(), ["headers", "ip", "method", "url"]);
  assert.deepEqual(f.calls, { authorize: 0, read: 0 }); assert.equal(response.headers["cache-control"], "no-store");
});

test("SYNTHETIC ledger HTTP: malformed trusted identity and authentication errors fail closed without leaking", async t => {
  for (const authenticate of [async () => ({ accountId: "forged", hallId: null }) as ActorContext, async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTHENTICATION"); }]) {
    const f = await setup(t, { authenticate }); const response = await f.post(ledgerParameters()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR");
    assert.ok(!response.body.includes("PRIVATE")); assert.deepEqual(f.calls, { authorize: 0, read: 0 });
  }
});

test("SYNTHETIC ledger HTTP: strict body/query/cursor rejects identity spoofing and unknown fields before authorization", async t => {
  const f = await setup(t);
  for (const [body, url] of [
    [{ ...ledgerParameters(), actor: inventoryActor }, URL], [{ ...ledgerParameters(), hallId: inventoryActor.hallId }, URL],
    [{ ...ledgerParameters(), page: 1 }, URL], [{ ...ledgerParameters(), pageSize: "20" }, URL], [{ ...ledgerParameters(), pageSize: 201 }, URL],
    [{ ...ledgerParameters(), after: { postedAt: "2026-10-20T18:20:30.123Z", entryId: inventoryId("ledger", 3) } }, URL],
    [{ ...ledgerParameters(), after: { postedAt: "2026-10-20T18:20:30.123456Z", entryId: inventoryId("ledger", 3), warehouseId: ledgerParameters().warehouseId } }, URL],
    [ledgerParameters(), `${URL}?role=ADMIN`]
  ] as const) {
    const response = await f.post(body, url); assert.equal(response.statusCode, 400, response.body); assert.equal(response.json().error.code, "INVALID_INVENTORY_LEDGER_QUERY");
  }
  assert.deepEqual(f.calls, { authorize: 0, read: 0 });
});

test("SYNTHETIC ledger HTTP: malformed/oversized JSON and wrong media reject without business reads", async t => {
  const f = await setup(t);
  for (const payload of ["{", "", '{"__proto__":{}}']) {
    const response = await f.app.inject({ method: "POST", url: URL, headers: { "content-type": "application/json" }, payload }); assert.equal(response.statusCode, 400);
  }
  assert.equal((await f.post({ padding: "x".repeat(65_536) })).statusCode, 413);
  assert.equal((await f.app.inject({ method: "POST", url: URL, payload: "text" })).statusCode, 415);
  assert.deepEqual(f.calls, { authorize: 0, read: 0 });
});

test("SYNTHETIC ledger HTTP: scope denial/revocation stops source reads, including reuse of a valid cursor", async t => {
  let allowed = true; let reads = 0;
  const f = await setup(t, { authorization: { async authorize() { if (!allowed) throw new DomainError("FORBIDDEN", "PRIVATE WAREHOUSE"); return inventoryScope; } },
    reader: { async readLedger(read) { reads++; const value = ledgerSnapshot(read); const last = value.data.entries[0]!;
      return { ...value, data: { ...value.data, nextCursor: { postedAt: last.postedAt, entryId: last.id } } }; } } });
  const first = await f.post(ledgerParameters({ pageSize: 1 })); assert.equal(first.statusCode, 200, first.body); allowed = false;
  const denied = await f.post(ledgerParameters({ pageSize: 1, after: first.json().nextCursor })); assert.equal(denied.statusCode, 403); assert.ok(!denied.body.includes("PRIVATE")); assert.equal(reads, 1);
});

for (const [domainCode, status] of [["SKU_NOT_FOUND", 404], ["INVENTORY_NOT_READY", 503], ["INVENTORY_READ_ABORTED", 408], ["INVENTORY_INTEGRITY_FAILED", 500]] as const) {
  test(`SYNTHETIC ledger HTTP: ${domainCode} returns ${status} without source details or successful empty history`, async t => {
    const f = await setup(t, { reader: { async readLedger() { throw new DomainError(domainCode, "PRIVATE SQL import payload credential"); } } });
    const response = await f.post(ledgerParameters()); assert.equal(response.statusCode, status); assert.ok(!response.body.includes("PRIVATE"));
    assert.equal(response.json().entries, undefined); assert.equal(response.headers["x-inventory-readiness"], undefined); assert.equal(response.headers["cache-control"], "no-store");
  });
}

test("SYNTHETIC ledger HTTP: private source payloads, malformed trusted facts and unknown SQL failures never leak", async t => {
  for (const reader of [
    { async readLedger() { throw new Error("PRIVATE SQL password=not-a-real-password"); } },
    { async readLedger(read) { const result = structuredClone(ledgerSnapshot(read)); Object.assign(result.data.entries[0]!.source, { importedPrivatePayload: "PRIVATE" }); return result; } },
    { async readLedger(read) { const result = structuredClone(ledgerSnapshot(read)); Object.assign(result.data.sku.size, { label: null }); return result; } }
  ] satisfies TrustedInventoryLedgerSnapshotReader[]) {
    const f = await setup(t, { reader }); const response = await f.post(ledgerParameters()); assert.equal(response.statusCode, 500); assert.equal(response.json().error.code, "INTERNAL_ERROR"); assert.ok(!response.body.includes("PRIVATE"));
  }
});

test("SYNTHETIC ledger HTTP: native baseline stays distinct from sales and transfer; version null and IDs retained", async t => {
  const f = await setup(t, { reader: { async readLedger(read) { return ledgerSnapshot(read, [ledgerEntry(0), ledgerEntry(1, "TRANSFER"), ledgerEntry(2, "CUTOFF_BASELINE")]); } } });
  const response = await f.post(ledgerParameters()); assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().entries.map((row: { source: { kind: string } }) => row.source.kind), ["SALES", "TRANSFER", "CUTOFF_BASELINE"]);
  assert.equal(response.json().entries[2].sourceDocumentVersion, null); assert.equal(response.json().entries[2].source.endpoint, "IMPORT_BASELINE");
});

test("SYNTHETIC ledger HTTP: current session authenticator rejects cross-site/missing Origin before resolving session", async t => {
  let resolutions = 0;
  const authenticate = createSalesSessionAuthenticator({ trustedOrigin: "https://synthetic-erp.example", service: {
    async login() { throw new Error("SYNTHETIC unused login"); }, async logout() {}, async changeOwnPassword() {},
    async resolve() { resolutions++; return { ...inventoryActor, staffId: inventoryId("staff", 90), loginName: "SYNTHETIC", role: "SYNTHETIC", authVersion: 1 }; }
  } });
  const f = await setup(t, { authenticate }); const cookie = `__Host-naijue_session=${"A".repeat(43)}`;
  for (const headers of [{ cookie }, { cookie, origin: "https://other.example" }, { cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "cross-site" },
    { cookie, origin: "https://synthetic-erp.example", authorization: "Bearer SYNTHETIC" }]) {
    const response = await f.app.inject({ method: "POST", url: URL, payload: ledgerParameters(), headers }); assert.equal(response.statusCode, 401); assert.equal(f.calls.read, 0);
  }
  assert.equal(resolutions, 0);
  const response = await f.app.inject({ method: "POST", url: URL, payload: ledgerParameters(), headers: { cookie, origin: "https://synthetic-erp.example", "sec-fetch-site": "same-origin" } });
  assert.equal(response.statusCode, 200, response.body); assert.equal(resolutions, 1); assert.equal(f.calls.read, 1);
});

test("SYNTHETIC ledger HTTP: request disconnect aborts forwarded read and late result is rejected; listeners cleaned", async t => {
  const app = Fastify({ logger: false }); t.after(() => app.close()); let raw: IncomingMessage | undefined; let forwarded: AbortSignal | undefined;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reading!: () => void; const entered = new Promise<void>(resolve => { reading = resolve; });
  app.addHook("onRequest", async request => { raw = request.raw; });
  app.register(createInventoryLedgerQueryHttpPlugin({ authenticate: async () => inventoryActor, dependencies: { authorization: { async authorize(_actor, _intent, signal) { forwarded = signal; return inventoryScope; } },
    reader: { async readLedger(read) { assert.equal(read.signal, forwarded); reading(); await gate; return ledgerSnapshot(read); } } } }));
  await app.ready(); const pending = app.inject({ method: "POST", url: URL, payload: ledgerParameters() }); await entered; assert.ok(raw); assert.ok(forwarded);
  const before = raw.listenerCount("aborted"); raw.emit("aborted"); assert.equal(forwarded.aborted, true); release();
  const response = await pending; assert.equal(response.statusCode, 408); assert.equal(raw.listenerCount("aborted"), before - 1); assert.equal(app.server.listening, false);
});
