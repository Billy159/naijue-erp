/** Synthetic application contracts only. No PostgreSQL or production identity provider. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSourceConfirmedTransferQueryAuthorization, createTransferQueryService } from "../packages/application/src/transfer-query-service.ts";
import { checkedTransferReadScope, parseTransferDetailQuery, parseTransferListQuery } from "../packages/application/src/transfer-query-validation.ts";
import type { TransferListQuery, TransferQueryDependencies, TransferReadScope, TrustedTransferSnapshotReader } from "../packages/application/src/transfer-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, ids, sid } from "./support/synthetic-transfer.ts";

const input = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, status: null, fromWarehouseId: null, toWarehouseId: null, number: null }, page: 1, pageSize: 20 });
const signal = () => new AbortController().signal;
function dependencies(overrides: Partial<TransferQueryDependencies> = {}): TransferQueryDependencies {
  const reader: TrustedTransferSnapshotReader = {
    async readList(read) { return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; },
    async readDetail() { throw new Error("SYNTHETIC detail not supplied"); }
  };
  return { authorization: createSourceConfirmedTransferQueryAuthorization(), reader, ...overrides };
}
test("transfer query: required providers and empty/malformed trusted scopes fail closed", async () => {
  assert.throws(() => createTransferQueryService({} as TransferQueryDependencies), /explicit trusted/);
  assert.throws(() => checkedTransferReadScope({ kind: "restricted", clauses: [] }), { code: "FORBIDDEN" });
  for (const scope of [null, {}, { kind: "all", hallId: ids.hall }, { kind: "restricted", clauses: [{}] }, { kind: "restricted", clauses: [{ fromHallId: null }] },
    { kind: "restricted", clauses: [{ role: "ADMIN" }] }, { kind: "restricted", clauses: [{ createdRole: "UNKNOWN" }] }, { kind: "restricted", clauses: Array(1001).fill({ fromHallId: ids.hall }) }]) {
    assert.throws(() => checkedTransferReadScope(scope as TransferReadScope), /Invalid trusted/);
  }
  let calls = 0; const d = dependencies({ authorization: { async authorize() { throw new DomainError("FORBIDDEN", "SYNTHETIC revoked"); } } });
  d.reader.readList = async () => { calls++; throw new Error("Must not read"); };
  await assert.rejects(() => createTransferQueryService(d).readList(actor, input(), signal()), { code: "FORBIDDEN" }); assert.equal(calls, 0);
});
test("transfer query: strict exact filters and required bounded numeric pagination", () => {
  const invalid = [{ ...input(), role: "ADMIN" }, { ...input(), scope: { kind: "all" } }, { ...input(), page: "1" }, { ...input(), page: 0 }, { ...input(), page: 1.5 },
    { ...input(), pageSize: 0 }, { ...input(), pageSize: 201 }, { ...input(), pageSize: 1.5 }, { ...input(), page: Number.MAX_SAFE_INTEGER }, { ...input(), filter: {} },
    ...[{ startDate: "2026-02-30" }, { startDate: "2026-10-21", endDate: "2026-10-20" }, { status: "DELETED" }, { fromWarehouseId: "bad" }, { toWarehouseId: "bad" },
      { number: "" }, { number: " spaced " }, { number: "a\n" }, { number: "x".repeat(201) }, { createdByAccountId: ids.account }, { hallId: ids.hall }].map(filter => ({ ...input(), filter: { ...input().filter, ...filter } }))];
  for (const value of invalid) assert.throws(() => parseTransferListQuery(value), { code: "INVALID_TRANSFER_QUERY" });
  assert.equal(parseTransferListQuery({ ...input(), filter: { ...input().filter, number: "%_\\ literal" } }).filter.number, "%_\\ literal");
  for (const pageSize of [1, 20, 50, 100, 200]) assert.equal(parseTransferListQuery({ ...input(), pageSize }).pageSize, pageSize);
  assert.throws(() => parseTransferDetailQuery({ transferId: ids.transfer, actor }), { code: "INVALID_TRANSFER_QUERY" });
  assert.throws(() => parseTransferDetailQuery({ transferId: "bad" }), { code: "INVALID_TRANSFER_QUERY" });
});
test("transfer query: explicit source policy grants either endpoint hall OR immutable salesperson creation role+hall", async () => {
  const policy = createSourceConfirmedTransferQueryAuthorization(); const intent = { kind: "list", parameters: input() } as const;
  assert.deepEqual(await policy.authorize(actor, intent, signal()), { kind: "restricted", clauses: [{ fromHallId: ids.hall }, { toHallId: ids.hall }, { createdHallId: ids.hall, createdRole: "SALESPERSON" }] });
  for (const role of ["ADMIN", "WAREHOUSE"] as const) assert.deepEqual(await policy.authorize({ ...actor, role }, intent, signal()), { kind: "all" });
  await assert.rejects(() => policy.authorize({ ...actor, hallId: null }, intent, signal()), { code: "FORBIDDEN" });
  await assert.rejects(() => policy.authorize({ ...actor, role: "UNKNOWN" } as never, intent, signal()), /Invalid trusted transfer actor/);
});
test("transfer query: immutable actor, filters and granted scope are isolated across policy await", async () => {
  const parameters = structuredClone(input()); const mutableActor = { ...actor }; const scope = { kind: "restricted", clauses: [{ fromHallId: ids.hall }] } as const;
  let release!: () => void; let reached!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); const authorized = new Promise<void>(resolve => { reached = resolve; });
  const d = dependencies({ authorization: { async authorize(context, intent) { assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(intent));
    assert.ok(Object.isFrozen(intent.parameters)); reached(); await pending; return scope; } } });
  d.reader.readList = async read => { assert.equal(read.actor.accountId, actor.accountId); assert.equal(read.actor.role, "SALESPERSON"); assert.equal(read.parameters.page, 1);
    assert.equal(read.parameters.filter.fromWarehouseId, null); assert.ok(Object.isFrozen(read.parameters.filter)); assert.ok(Object.isFrozen(read.scope));
    assert.ok(read.scope.kind === "restricted"); assert.notEqual(read.scope.clauses[0], scope.clauses[0]); assert.ok(Object.isFrozen(read.scope.clauses[0]));
    return { page: 1, pageSize: 20, exactTotal: 0n, items: [] }; };
  const result = createTransferQueryService(d).readList(mutableActor, parameters, signal()); await authorized;
  Object.assign(parameters, { page: 9 }); Object.assign(parameters.filter, { fromWarehouseId: ids.toWarehouse }); mutableActor.accountId = sid("account", 888); mutableActor.role = "ADMIN"; release(); await result;
});
test("transfer query: aborted and malformed actors never reach policy; authorization is current on every call", async () => {
  let policyCalls = 0; let readCalls = 0; const controller = new AbortController(); const d = dependencies({ authorization: { async authorize() { policyCalls++; return { kind: "all" }; } } });
  d.reader.readList = async read => { readCalls++; return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; };
  const service = createTransferQueryService(d); controller.abort();
  await assert.rejects(() => service.readList(actor, input(), controller.signal), { code: "TRANSFER_READ_ABORTED" });
  for (const value of [{ accountId: "fake", hallId: null, role: "ADMIN" }, { accountId: ids.account, role: "ADMIN" }, { accountId: ids.account, hallId: null, role: "UNKNOWN" }]) {
    await assert.rejects(() => service.readList(value as never, input(), signal()), /Invalid trusted transfer actor/);
  }
  assert.equal(policyCalls, 0); assert.equal(readCalls, 0); await service.readList(actor, input(), signal()); await service.readList(actor, input(), signal()); assert.equal(policyCalls, 2); assert.equal(readCalls, 2);
});
test("transfer query: abort after policy or reader prevents delivery of stale results", async () => {
  for (const stage of ["policy", "reader"] as const) {
    const controller = new AbortController(); let reads = 0;
    const d = dependencies({ authorization: { async authorize() { if (stage === "policy") controller.abort(); return { kind: "all" }; } } });
    d.reader.readList = async () => { reads++; controller.abort(); return { page: 1, pageSize: 20, exactTotal: 0n, items: [] }; };
    await assert.rejects(() => createTransferQueryService(d).readList(actor, input(), controller.signal), { code: "TRANSFER_READ_ABORTED" });
    assert.equal(reads, stage === "policy" ? 0 : 1);
  }
});
