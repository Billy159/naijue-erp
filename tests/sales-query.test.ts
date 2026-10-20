import assert from "node:assert/strict";
import test from "node:test";
import { createSalesQueryService } from "../packages/application/src/sales-query-service.ts";
import { checkedSalesReadScope, parseSalesDetailQuery, parseSalesHistoryQuery, parseSalesListQuery } from "../packages/application/src/sales-query-validation.ts";
import type { SalesListQuery, SalesQueryDependencies, SalesReadScope, TrustedSalesSnapshotReader } from "../packages/application/src/sales-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";

export const salesQueryInput = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, status: null, businessType: null, hallId: null,
  salespersonId: null, customerId: null, warehouseId: null, number: null }, page: 1, pageSize: 20 });
const signal = () => new AbortController().signal;
function dependencies(overrides: Partial<SalesQueryDependencies> = {}): SalesQueryDependencies {
  const reader: TrustedSalesSnapshotReader = {
    async readReferences(read) { return { page: read.parameters.page, exactTotal: 0n, items: [] }; },
    async readList(read) { return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; },
    async readDetail() { throw new Error("SYNTHETIC detail not supplied"); },
    async readHistory(read) { return { salesId: read.parameters.salesId, page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; },
    async readSettlementStatistics(read) { return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotalAccounts: 0n, exactApprovedDocuments: 0n, received: 0n as never, refunded: 0n as never, accounts: [] }; }
  };
  return { authorization: { async authorize() { return { kind: "restricted", clauses: [{ hallId: ids.hall }] }; } }, reader, ...overrides };
}
test("sales query: required providers and empty/malformed trusted scopes fail closed", async () => {
  assert.throws(() => createSalesQueryService({} as SalesQueryDependencies), /explicit trusted/);
  assert.throws(() => checkedSalesReadScope({ kind: "restricted", clauses: [] }), { code: "FORBIDDEN" });
  for (const scope of [null, {}, { kind: "all", hallId: ids.hall }, { kind: "restricted", clauses: [{}] }, { kind: "restricted", clauses: [{ hallId: null }] }, { kind: "restricted", clauses: [{ role: "ADMIN" }] }]) {
    assert.throws(() => checkedSalesReadScope(scope as SalesReadScope), /Invalid trusted/);
  }
  let called = 0;
  const d = dependencies({ authorization: { async authorize() { throw new DomainError("FORBIDDEN", "SYNTHETIC revoked"); } } });
  d.reader.readList = async () => { called++; throw new Error("must not run"); };
  await assert.rejects(() => createSalesQueryService(d).readList(actor, salesQueryInput(), signal()), { code: "FORBIDDEN" }); assert.equal(called, 0);
});
test("sales query: filters are strict, bounded, canonical and include actual calendar/range validation", () => {
  const bad = [
    { ...salesQueryInput(), role: "ADMIN" }, { ...salesQueryInput(), scope: { kind: "all" } }, { ...salesQueryInput(), page: "1" },
    { ...salesQueryInput(), page: 0 }, { ...salesQueryInput(), page: 1.5 }, { ...salesQueryInput(), pageSize: 500 }, { ...salesQueryInput(), page: Number.MAX_SAFE_INTEGER },
    ...[{ startDate: "2026-02-30" }, { startDate: "2026-10-21", endDate: "2026-10-20" }, { status: "DELETED" }, { businessType: "PURCHASE" },
      { hallId: "not-a-uuid" }, { number: "" }, { number: " spaced " }, { number: "a\n" }, { number: "x".repeat(201) }, { actor: ids.account }].map(filter => ({ ...salesQueryInput(), filter: { ...salesQueryInput().filter, ...filter } }))
  ];
  for (const input of bad) assert.throws(() => parseSalesListQuery(input), { code: "INVALID_SALES_QUERY" });
  assert.equal(parseSalesListQuery({ ...salesQueryInput(), filter: { ...salesQueryInput().filter, number: "%_\\ literal" } }).filter.number, "%_\\ literal");
  for (const pageSize of [20, 50, 100, 200]) assert.equal(parseSalesListQuery({ ...salesQueryInput(), pageSize }).pageSize, pageSize);
  assert.throws(() => parseSalesDetailQuery({ salesId: ids.sales, actor }), { code: "INVALID_SALES_QUERY" });
  assert.throws(() => parseSalesHistoryQuery({ salesId: ids.sales, page: 1, pageSize: 0 }), { code: "INVALID_SALES_QUERY" });
});
test("sales query: actor, filters and granted clauses are isolated before and after policy await", async () => {
  const input = structuredClone(salesQueryInput()); const mutableActor = { ...actor };
  let release!: () => void; let authorized!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; }); const reached = new Promise<void>(resolve => { authorized = resolve; });
  const scope: { kind: "restricted"; clauses: { hallId: typeof ids.hall }[] } = { kind: "restricted", clauses: [{ hallId: ids.hall }] };
  const d = dependencies({ authorization: { async authorize(context, intent) {
    assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(intent.parameters)); authorized(); await pending; return scope;
  } } });
  d.reader.readList = async read => {
    assert.equal(read.actor.accountId, actor.accountId); assert.equal(read.parameters.page, 1); assert.equal(read.parameters.filter.hallId, null);
    assert.ok(Object.isFrozen(read.parameters.filter)); assert.ok(Object.isFrozen(read.scope)); assert.ok(read.scope.kind === "restricted");
    assert.ok(Object.isFrozen(read.scope.clauses[0])); assert.notEqual(read.scope.clauses[0], scope.clauses[0]);
    return { page: 1, pageSize: 20, exactTotal: 0n, items: [] };
  };
  const result = createSalesQueryService(d).readList(mutableActor, input, signal()); await reached;
  Object.assign(input, { page: 8 }); Object.assign(input.filter, { hallId: sid("hall", 888) }); mutableActor.accountId = sid("account", 888); release(); await result;
});
test("sales query: abort and invalid actor stop before policy/reader, and current policy is called on every request", async () => {
  let calls = 0; const d = dependencies({ authorization: { async authorize() { calls++; return { kind: "all" }; } } }); const service = createSalesQueryService(d);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => service.readList(actor, salesQueryInput(), aborted.signal), { code: "SALES_READ_ABORTED" });
  await assert.rejects(() => service.readList({ accountId: "fake", hallId: null } as never, salesQueryInput(), signal()), /Invalid trusted sales actor/);
  assert.equal(calls, 0); await service.readList(actor, salesQueryInput(), signal()); await service.readList(actor, salesQueryInput(), signal()); assert.equal(calls, 2);
});
