import assert from "node:assert/strict";
import test from "node:test";
import { createSalesQueryService } from "../packages/application/src/sales-query-service.ts";
import { checkedSalesReadScope, parseSalesDetailQuery, parseSalesHistoryQuery, parseSalesListQuery } from "../packages/application/src/sales-query-validation.ts";
import type { SalesListQuery, SalesQueryDependencies, SalesReadScope, TrustedSalesSnapshotReader } from "../packages/application/src/sales-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";

export const salesQueryInput = (): SalesListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [], number: null }, page: 1, pageSize: 20 });
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
    ...["quantity", "incomingQuantity", "outgoingQuantity", "updatedAt"].map(field => ({ ...salesQueryInput(), [field]: "1" })),
    { ...salesQueryInput(), page: 0 }, { ...salesQueryInput(), page: 1.5 }, { ...salesQueryInput(), pageSize: 500 }, { ...salesQueryInput(), page: Number.MAX_SAFE_INTEGER },
    ...[{ startDate: "2026-02-30" }, { startDate: "2026-10-21", endDate: "2026-10-20" }, { statuses: ["DELETED"] }, { businessTypes: ["PURCHASE"] },
      { hallIds: ["not-a-uuid"] }, { number: "" }, { number: " spaced " }, { number: "a\n" }, { number: "x".repeat(201) }, { actor: ids.account }, { quantity: "1" }].map(filter => ({ ...salesQueryInput(), filter: { ...salesQueryInput().filter, ...filter } }))
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
    assert.equal(read.actor.accountId, actor.accountId); assert.equal(read.parameters.page, 1); assert.deepEqual(read.parameters.filter.hallIds, []);
    assert.ok(Object.isFrozen(read.parameters.filter)); assert.ok(Object.isFrozen(read.scope)); assert.ok(read.scope.kind === "restricted");
    assert.ok(Object.isFrozen(read.scope.clauses[0])); assert.notEqual(read.scope.clauses[0], scope.clauses[0]);
    return { page: 1, pageSize: 20, exactTotal: 0n, items: [] };
  };
  const result = createSalesQueryService(d).readList(mutableActor, input, signal()); await reached;
  Object.assign(input, { page: 8 }); Object.assign(input.filter, { hallIds: [sid("hall", 888)] }); mutableActor.accountId = sid("account", 888); release(); await result;
});
test("sales query: abort and invalid actor stop before policy/reader, and current policy is called on every request", async () => {
  let calls = 0; const d = dependencies({ authorization: { async authorize() { calls++; return { kind: "all" }; } } }); const service = createSalesQueryService(d);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => service.readList(actor, salesQueryInput(), aborted.signal), { code: "SALES_READ_ABORTED" });
  await assert.rejects(() => service.readList({ accountId: "fake", hallId: null } as never, salesQueryInput(), signal()), /Invalid trusted sales actor/);
  assert.equal(calls, 0); await service.readList(actor, salesQueryInput(), signal()); await service.readList(actor, salesQueryInput(), signal()); assert.equal(calls, 2);
});

test("sales query: all six lists reject missing, scalar, sparse, duplicate, unknown and oversized selections without aliases", () => {
  const query = salesQueryInput();
  for (const key of Object.keys(query.filter)) {
    const filter: Record<string, unknown> = { ...query.filter }; delete filter[key];
    assert.throws(() => parseSalesListQuery({ ...query, filter }), { code: "INVALID_SALES_QUERY" });
  }
  for (const [key, good, maximum] of [["statuses", "DRAFT", 3], ["businessTypes", "RETURN", 3], ["hallIds", ids.hall, 1000],
    ["salespersonIds", sid("staff", 44), 1000], ["customerIds", ids.customer, 1000], ["warehouseIds", ids.warehouse, 1000]] as const) {
    const bad = [null, good, {}, [null], [undefined], Array(1), [good, good], Array(maximum + 1).fill(good), ["UNKNOWN"], [3]];
    for (const value of bad) assert.throws(() => parseSalesListQuery({ ...query, filter: { ...query.filter, [key]: value } }), { code: "INVALID_SALES_QUERY" }, key);
  }
  const inherited = Array(1); const prototype = Object.create(Array.prototype) as unknown[]; prototype[0] = "DRAFT"; Object.setPrototypeOf(inherited, prototype);
  assert.throws(() => parseSalesListQuery({ ...query, filter: { ...query.filter, statuses: inherited } }), { code: "INVALID_SALES_QUERY" });
  for (const [key, kind] of [["hallIds", "hall"], ["salespersonIds", "staff"], ["customerIds", "customer"], ["warehouseIds", "warehouse"]] as const) {
    const values = Array.from({ length: 1000 }, (_, index) => sid(kind, index + 100));
    assert.deepEqual(parseSalesListQuery({ ...query, filter: { ...query.filter, [key]: values } }).filter[key], values);
    assert.throws(() => parseSalesListQuery({ ...query, filter: { ...query.filter, [key]: [sid(kind, 999).toUpperCase()] } }), { code: "INVALID_SALES_QUERY" });
  }
  for (const [key, value] of [["status", "DRAFT"], ["businessType", "RETURN"], ["hallId", ids.hall], ["salespersonId", sid("staff", 44)],
    ["customerId", ids.customer], ["warehouseId", ids.warehouse]] as const) {
    assert.throws(() => parseSalesListQuery({ ...query, filter: { ...query.filter, [key]: value } }), { code: "INVALID_SALES_QUERY" });
  }
});
test("sales query: multi-value arrays are copied and frozen before both policy awaits, never narrowed to first value", async () => {
  for (const method of ["readList", "readSettlementStatistics"] as const) {
    const filter = { ...salesQueryInput().filter, statuses: ["DRAFT", "APPROVED", "VOID"], businessTypes: ["SALE", "RETURN", "EXCHANGE"],
      hallIds: [ids.hall, sid("hall", 99)], salespersonIds: [sid("staff", 44), sid("staff", 45)],
      customerIds: [ids.customer, sid("customer", 46)], warehouseIds: [ids.warehouse, sid("warehouse", 48)] };
    const expected = structuredClone(filter); const input = { ...salesQueryInput(), filter };
    let reached!: () => void; let release!: () => void;
    const entered = new Promise<void>(resolve => { reached = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const d = dependencies({ authorization: { async authorize(_actor, intent) {
      assert.equal(intent.kind, method === "readList" ? "list" : "settlement-statistics");
      assert.deepEqual(intent.parameters, input);
      for (const value of Object.values((intent.parameters as SalesListQuery).filter).filter(Array.isArray)) assert.ok(Object.isFrozen(value));
      reached(); await gate; return { kind: "restricted", clauses: [{ hallId: ids.hall }] };
    } } });
    const previous = d.reader[method].bind(d.reader);
    Object.assign(d.reader, { [method]: async (read: Parameters<typeof previous>[0]) => {
      assert.deepEqual(read.parameters.filter, expected); assert.deepEqual(read.scope, { kind: "restricted", clauses: [{ hallId: ids.hall }] });
      return previous(read);
    } });
    const pending = createSalesQueryService(d)[method](actor, input, signal()); await entered;
    filter.statuses.splice(0); filter.businessTypes.splice(0); filter.hallIds.push(sid("hall", 888)); filter.salespersonIds.splice(0);
    filter.customerIds.splice(0); filter.warehouseIds.splice(0); release(); await pending;
  }
});
