/** Fastify inject with explicitly synthetic readers/policy only. No listener or PostgreSQL. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createTransferQueryHttpPlugin } from "./transfer-query-http.ts";
import type { TransferQueryHttpOptions } from "./transfer-query-http.ts";
import type { TransferListQuery, TransferQueryAuthorization, TransferReadIntent, TrustedTransferSnapshotReader } from "../../../packages/application/src/transfer-query-ports.ts";
import type { TransferActor } from "../../../packages/application/src/transfer-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { version } from "../../../packages/domain/src/values.ts";
import { actor, draft, ids } from "../../../tests/support/synthetic-transfer.ts";

const input = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, status: null, fromWarehouseId: null, toWarehouseId: null, number: null }, page: 1, pageSize: 20 });
const references = { fromWarehouseName: "SYNTHETIC SOURCE", toWarehouseName: "SYNTHETIC DESTINATION", fromHallName: "SYNTHETIC SOURCE HALL", toHallName: "SYNTHETIC DESTINATION HALL", createdByName: "SYNTHETIC CREATOR", approvedByName: null };
const document = () => ({ ...draft(["9007199254740993"]), header: { ...draft().header, status: "DRAFT" as const, version: version(1), createdByAccountId: actor.accountId,
  createdHallId: actor.hallId, createdRole: actor.role, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", approvedByAccountId: null, approvedAt: null } });
async function setup(t: TestContext, options: { authenticate?: TransferQueryHttpOptions["authenticate"]; authorize?: TransferQueryAuthorization["authorize"]; failure?: Error } = {}) {
  let policyCalls = 0; let readCalls = 0; let currentActor: TransferActor | null = actor; const intents: TransferReadIntent[] = [];
  const check = () => { readCalls++; if (options.failure) throw options.failure; };
  const reader: TrustedTransferSnapshotReader = {
    async readList(read) { check(); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 9007199254740993n,
      items: [{ ...document().header, ...references }] }; },
    async readDetail() { check(); return { document: document(), stockBasis: "RUNTIME_LEDGER", references }; }
  };
  const app = Fastify({ logger: false }); app.register(createTransferQueryHttpPlugin({ authenticate: options.authenticate ?? (async () => currentActor), dependencies: {
    authorization: { async authorize(context, intent, signal) { policyCalls++; intents.push(intent); assert.deepEqual(context, actor); assert.ok(signal instanceof AbortSignal);
      return options.authorize ? options.authorize(context, intent, signal) : { kind: "restricted", clauses: [{ fromHallId: ids.hall }] }; } }, reader
  } }));
  t.after(() => app.close()); await app.ready();
  return { app, intents, counts: () => ({ policyCalls, readCalls }), authenticateAs: (value: TransferActor | null) => { currentActor = value; },
    post: (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }) };
}
test("SYNTHETIC transfer query HTTP: both read routes use current trusted actor/policy and exact integer strings", async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  const list = await f.post("/transfers/query", input()); assert.equal(list.statusCode, 200); assert.equal(list.json().exactTotal, "9007199254740993");
  assert.equal(list.json().items[0].fromWarehouseName, references.fromWarehouseName); assert.equal(list.headers["cache-control"], "no-store"); assert.equal(list.headers.pragma, "no-cache");
  const detail = await f.post("/transfers/detail/query", { transferId: ids.transfer }); assert.equal(detail.statusCode, 200); assert.equal(detail.json().document.lines[0].quantity, "9007199254740993");
  assert.equal(detail.json().references.createdByName, references.createdByName); assert.equal(detail.json().document.header.version, 1);
  assert.deepEqual(f.intents.map(intent => intent.kind), ["list", "detail"]); assert.deepEqual(f.counts(), { policyCalls: 2, readCalls: 2 }); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC transfer query HTTP: missing providers and missing/malformed/failing authentication never grant scope", async t => {
  assert.throws(() => createTransferQueryHttpPlugin({} as TransferQueryHttpOptions), /explicit trusted authentication/);
  assert.throws(() => createTransferQueryHttpPlugin({ authenticate: async () => actor } as unknown as TransferQueryHttpOptions), /explicit trusted authorization/);
  const f = await setup(t); f.authenticateAs(null);
  for (const [url, payload] of [["/transfers/query", input()], ["/transfers/detail/query", { transferId: ids.transfer }]] as const) assert.equal((await f.post(url, payload)).statusCode, 401);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
  for (const authenticate of [async () => ({ accountId: "fake", hallId: null, role: "ADMIN" }) as never,
    async () => ({ accountId: ids.account, hallId: null }) as never, async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTH"); }]) {
    const g = await setup(t, { authenticate }); const result = await g.post("/transfers/query", input()); assert.equal(result.statusCode, 500); assert.ok(!result.body.includes("PRIVATE"));
    assert.deepEqual(g.counts(), { policyCalls: 0, readCalls: 0 });
  }
});
test("SYNTHETIC transfer query HTTP: client identity, role, scope and unknown filters cannot grant visibility", async t => {
  const f = await setup(t);
  for (const payload of [{ ...input(), actor }, { ...input(), role: "ADMIN" }, { ...input(), scope: { kind: "all" } },
    { ...input(), filter: { ...input().filter, createdByAccountId: ids.account } }, { ...input(), filter: { ...input().filter, hallId: ids.hall } },
    { ...input(), pageSize: 201 }, { ...input(), page: "1" }, { ...input(), filter: { ...input().filter, startDate: "2026-02-30" } }]) {
    const response = await f.post("/transfers/query", payload); assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_TRANSFER_QUERY");
  }
  assert.equal((await f.post("/transfers/detail/query", { transferId: ids.transfer, actor })).statusCode, 400); assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test("SYNTHETIC transfer query HTTP: denied, empty and malformed current policy scopes cannot touch reader", async t => {
  for (const [authorize, expected] of [[async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); }, 403], [async () => ({ kind: "restricted", clauses: [] }) as const, 403],
    [async () => ({ kind: "restricted", clauses: [{}] }) as const, 500]] as const) {
    const f = await setup(t, { authorize }); const result = await f.post("/transfers/query", input()); assert.equal(result.statusCode, expected); assert.equal(f.counts().readCalls, 0); assert.ok(!result.body.includes("PRIVATE"));
  }
});
test("SYNTHETIC transfer query HTTP: known safe errors map; arbitrary provider/SQL messages stay private", async t => {
  for (const [error, expected] of [[new DomainError("DOCUMENT_NOT_FOUND", "PRIVATE TARGET"), 404], [new DomainError("TRANSFER_READ_TOO_LARGE", "PRIVATE LIMIT"), 413],
    [new DomainError("TRANSFER_READ_ABORTED", "PRIVATE ABORT"), 408], [new DomainError("INVALID_DATABASE_VALUE", "PRIVATE DATABASE"), 500], [new Error("PRIVATE SQL postgresql://credentials"), 500]] as const) {
    const f = await setup(t, { failure: error }); const result = await f.post("/transfers/detail/query", { transferId: ids.transfer });
    assert.equal(result.statusCode, expected); assert.ok(!result.body.includes("PRIVATE")); assert.ok(!result.body.includes("credentials"));
  }
});
test("SYNTHETIC transfer query HTTP: strict transport rejects query strings, invalid JSON/media and large bodies", async t => {
  const f = await setup(t);
  assert.equal((await f.post("/transfers/query?role=ADMIN", input())).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: "/transfers/query", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "POST", url: "/transfers/query", headers: { "content-type": "text/plain" }, payload: "not JSON" })).statusCode, 415);
  assert.equal((await f.app.inject({ method: "POST", url: "/transfers/query", headers: { "content-type": "application/json" }, payload: JSON.stringify({ data: "x".repeat(65536) }) })).statusCode, 413);
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
