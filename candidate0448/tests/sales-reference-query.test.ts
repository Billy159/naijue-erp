/** Synthetic service and request-validation tests. No database, server listener or network. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSalesQueryService } from "../packages/application/src/sales-query-service.ts";
import { parseSalesFilterReferenceQuery } from "../packages/application/src/sales-reference-query-validation.ts";
import type { SalesFilterReferenceQuery, SalesQueryDependencies, SalesReadIntent } from "../packages/application/src/sales-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";

const input = (): SalesFilterReferenceQuery => ({ kind: "hall", search: "", page: 1, pageSize: 20 });
function dependencies(): SalesQueryDependencies {
  return { authorization: { async authorize() { return { kind: "restricted", clauses: [{ hallId: ids.hall }] }; } }, reader: {
    async readReferences(read) { return { page: read.parameters.page, exactTotal: 0n, items: [] }; },
    async readList() { throw new Error("Unexpected list read"); }, async readDetail() { throw new Error("Unexpected detail read"); },
    async readHistory() { throw new Error("Unexpected history read"); }, async readSettlementStatistics() { throw new Error("Unexpected statistics read"); }
  } };
}
test("sales filter references: strict bounded literal parser rejects authority, active-only form semantics and malformed paging", () => {
  for (const kind of ["hall", "salesperson", "customer", "warehouse"] as const) {
    const parsed = parseSalesFilterReferenceQuery({ ...input(), kind, search: "%_\\' OR TRUE", page: 2 });
    assert.ok(Object.isFrozen(parsed)); assert.equal(parsed.kind, kind); assert.equal(parsed.search, "%_\\' OR TRUE");
  }
  for (const value of [null, [], Object.assign(Object.create(null), input()), { ...input(), kind: "supplier" }, { ...input(), enabled: true },
    { ...input(), actor }, { ...input(), scope: { kind: "all" } }, { ...input(), search: " trim " }, { ...input(), search: "x\n" },
    { ...input(), search: "x".repeat(201) }, { ...input(), search: null }, { ...input(), page: "1" }, { ...input(), page: 0 },
    { ...input(), page: 1.5 }, { ...input(), page: Number.MAX_SAFE_INTEGER }, { ...input(), pageSize: 50 }]) {
    assert.throws(() => parseSalesFilterReferenceQuery(value), { code: "INVALID_SALES_QUERY" });
  }
});
test("sales filter references: mandatory provider capability and validation before policy, no fallback empty reader", async () => {
  const missing = dependencies(); delete (missing.reader as unknown as Record<string, unknown>).readReferences;
  assert.throws(() => createSalesQueryService(missing), /explicit trusted/);
  const d = dependencies(); let calls = 0; d.authorization.authorize = async () => { calls++; throw new Error("Must not authorize"); };
  const service = createSalesQueryService(d);
  assert.throws(() => service.readReferences(actor, { ...input(), role: "ADMIN" }, new AbortController().signal), { code: "INVALID_SALES_QUERY" });
  await assert.rejects(() => service.readReferences({ ...actor, accountId: "fake" } as never, input(), new AbortController().signal), /Invalid trusted sales actor/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => service.readReferences(actor, input(), controller.signal), { code: "SALES_READ_ABORTED" }); assert.equal(calls, 0);
});
test("sales filter references: current neutral list grant, immutable input/actor/scope and no new catalog authorization", async () => {
  const d = dependencies(); const request = { ...input(), search: "SYNTHETIC", page: 2 }; const current = { ...actor };
  let reached!: () => void; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const pending = new Promise<void>(resolve => { reached = resolve; });
  const scope = { kind: "restricted", clauses: [{ hallId: ids.hall, warehouseId: ids.warehouse }] } as const;
  d.authorization.authorize = async (context, intent, signal) => {
    assert.deepEqual(context, actor); assert.ok(Object.isFrozen(context)); assert.ok(signal instanceof AbortSignal);
    assert.equal(intent.kind, "list"); const list = intent as Extract<SalesReadIntent, { kind: "list" | "settlement-statistics" }>;
    assert.deepEqual(list.parameters.filter, { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null });
    assert.ok(Object.values(list.parameters.filter).filter(Array.isArray).every(Object.isFrozen)); assert.equal(list.parameters.page, 1); assert.equal(list.parameters.pageSize, 20);
    assert.ok(Object.isFrozen(intent)); assert.ok(Object.isFrozen(list.parameters.filter)); reached(); await gate; return scope;
  };
  d.reader.readReferences = async read => {
    assert.deepEqual(read.parameters, { kind: "hall", search: "SYNTHETIC", page: 2, pageSize: 20 });
    assert.equal(read.actor.accountId, actor.accountId); assert.deepEqual(read.scope, scope);
    assert.ok(Object.isFrozen(read)); assert.ok(Object.isFrozen(read.parameters)); assert.ok(Object.isFrozen(read.scope));
    assert.notEqual(read.scope, scope); return { page: 2, exactTotal: 9007199254740993n, items: [] };
  };
  const result = createSalesQueryService(d).readReferences(current, request, new AbortController().signal); await pending;
  Object.assign(request, { kind: "customer", search: "OTHER", page: 99 }); current.accountId = sid("account", 999); release();
  assert.equal((await result).exactTotal, 9007199254740993n);
});
test("sales filter references: revocation, empty grant and aborted in-flight policy/reader results fail closed", async () => {
  for (const authorize of [async () => { throw new DomainError("FORBIDDEN", "SYNTHETIC revoked"); }, async () => ({ kind: "restricted", clauses: [] }) as const]) {
    const d = dependencies(); d.authorization.authorize = authorize; let reads = 0;
    d.reader.readReferences = async () => { reads++; throw new Error("Must not read"); };
    await assert.rejects(() => createSalesQueryService(d).readReferences(actor, input(), new AbortController().signal), { code: "FORBIDDEN" }); assert.equal(reads, 0);
  }
  for (const stage of ["policy", "reader"] as const) {
    const controller = new AbortController(); const d = dependencies(); let reads = 0;
    d.authorization.authorize = async () => { if (stage === "policy") controller.abort(); return { kind: "all" }; };
    d.reader.readReferences = async () => { reads++; controller.abort(); return { page: 1, exactTotal: 0n, items: [] }; };
    await assert.rejects(() => createSalesQueryService(d).readReferences(actor, input(), controller.signal), { code: "SALES_READ_ABORTED" }); assert.equal(reads, stage === "policy" ? 0 : 1);
  }
});
