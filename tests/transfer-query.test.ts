/** Synthetic application contracts only. No PostgreSQL or production identity provider. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSourceConfirmedTransferQueryAuthorization, createTransferQueryService } from "../packages/application/src/transfer-query-service.ts";
import { checkedTransferReadScope, parseTransferDetailQuery, parseTransferListQuery, parseTransferWarehouseQuery } from "../packages/application/src/transfer-query-validation.ts";
import type { TransferListQuery, TransferQueryDependencies, TransferReadIntent, TransferReadScope, TransferWarehouseQuery, TrustedTransferSnapshotReader } from "../packages/application/src/transfer-query-ports.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, ids, sid } from "./support/synthetic-transfer.ts";

const input = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 });
const warehouseInput = (): TransferWarehouseQuery => ({ search: "", selectedIds: [], page: 1, pageSize: 20 });
const signal = () => new AbortController().signal;
function dependencies(overrides: Partial<TransferQueryDependencies> = {}): TransferQueryDependencies {
  const reader: TrustedTransferSnapshotReader = {
    async readList(read) { return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; },
    async readDetail() { throw new Error("SYNTHETIC detail not supplied"); },
    async readWarehouses(read) { return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] }; }
  };
  return { authorization: createSourceConfirmedTransferQueryAuthorization(), reader, ...overrides };
}
function calls(service: ReturnType<typeof createTransferQueryService>, abortSignal = signal(), context = actor) {
  return [() => service.readList(context, input(), abortSignal), () => service.readDetail(context, { transferId: ids.transfer }, abortSignal),
    () => service.readWarehouses(context, { ...warehouseInput(), selectedIds: [ids.fromWarehouse] }, abortSignal)];
}
const paginationFailures = [{ page: "1" }, { page: 0 }, { page: -1 }, { page: 1.5 }, { page: Infinity }, { page: NaN }, { page: Number.MAX_SAFE_INTEGER },
  { pageSize: "20" }, { pageSize: 0 }, { pageSize: 201 }, { pageSize: 1.5 }, { pageSize: Infinity }];

test("transfer query: every trusted provider is required; empty/malformed scopes fail closed on all reads", async () => {
  assert.throws(() => createTransferQueryService({} as TransferQueryDependencies), /explicit trusted/);
  for (const method of ["readList", "readDetail", "readWarehouses"] as const) {
    const d = dependencies(); assert.throws(() => createTransferQueryService({ ...d, reader: { ...d.reader, [method]: undefined } } as unknown as TransferQueryDependencies), /explicit trusted/);
  }
  assert.throws(() => checkedTransferReadScope({ kind: "restricted", clauses: [] }), { code: "FORBIDDEN" });
  const malformed = [null, {}, { kind: "all", hallId: ids.hall }, { kind: "restricted", clauses: [{}] }, { kind: "restricted", clauses: [{ fromHallId: null }] },
    { kind: "restricted", clauses: [{ role: "ADMIN" }] }, { kind: "restricted", clauses: [{ createdRole: "UNKNOWN" }] }, { kind: "restricted", clauses: Array(1001).fill({ fromHallId: ids.hall }) }];
  for (const scope of malformed) assert.throws(() => checkedTransferReadScope(scope as TransferReadScope), /Invalid trusted/);
  for (const scope of malformed) {
    let reads = 0; const d = dependencies({ authorization: { async authorize() { return scope as TransferReadScope; } } });
    d.reader.readList = d.reader.readDetail = d.reader.readWarehouses = async () => { reads++; throw new Error("Must not read"); };
    for (const read of calls(createTransferQueryService(d))) await assert.rejects(read, /Invalid trusted/);
    assert.equal(reads, 0);
  }
  let reads = 0; const d = dependencies({ authorization: { async authorize() { throw new DomainError("FORBIDDEN", "SYNTHETIC revoked"); } } });
  d.reader.readList = d.reader.readDetail = d.reader.readWarehouses = async () => { reads++; throw new Error("Must not read"); };
  for (const read of calls(createTransferQueryService(d))) await assert.rejects(read, { code: "FORBIDDEN" });
  assert.equal(reads, 0);
});
test("transfer query: list filters require exact arrays, reject old scalars/aliases, and bound numeric pagination", () => {
  const invalid: unknown[] = [null, [], Object.create(null), { ...input(), role: "ADMIN" }, { ...input(), scope: { kind: "all" } }, { ...input(), filter: {} },
    ...paginationFailures.map(value => ({ ...input(), ...value })),
    ...[{ startDate: "2026-02-30" }, { startDate: "2026-10-21", endDate: "2026-10-20" }, { statuses: null }, { statuses: "DRAFT" }, { statuses: Array(1) },
      { statuses: ["DELETED"] }, { statuses: ["draft"] }, { statuses: ["DRAFT", "DRAFT"] }, { statuses: ["DRAFT", "APPROVED", "VOID", "DRAFT"] },
      { fromWarehouseIds: null }, { fromWarehouseIds: ids.fromWarehouse }, { fromWarehouseIds: ["bad"] }, { fromWarehouseIds: Array(1) }, { fromWarehouseIds: [ids.fromWarehouse, ids.fromWarehouse] },
      { toWarehouseIds: null }, { toWarehouseIds: ids.toWarehouse }, { toWarehouseIds: ["bad"] }, { toWarehouseIds: Array(1) }, { toWarehouseIds: [ids.toWarehouse, ids.toWarehouse] },
      { status: null }, { status: "DRAFT" }, { fromWarehouseId: null }, { fromWarehouseId: ids.fromWarehouse }, { toWarehouseId: null }, { toWarehouseId: ids.toWarehouse },
      { warehouseIds: [] }, { number: "" }, { number: " spaced " }, { number: "a\n" }, { number: "a\u007f" }, { number: "x".repeat(201) },
      { createdByAccountId: ids.account }, { hallId: ids.hall }].map(filter => ({ ...input(), filter: { ...input().filter, ...filter } }))];
  const oldFilter = { startDate: null, endDate: null, status: null, fromWarehouseId: null, toWarehouseId: null, number: null };
  invalid.push({ ...input(), filter: oldFilter });
  for (const key of Object.keys(input().filter)) { const filter = { ...input().filter } as Record<string, unknown>; delete filter[key]; invalid.push({ ...input(), filter }); }
  for (const value of invalid) assert.throws(() => parseTransferListQuery(value), { code: "INVALID_TRANSFER_QUERY" });
  for (const pageSize of [1, 20, 50, 100, 200]) assert.equal(parseTransferListQuery({ ...input(), pageSize }).pageSize, pageSize);
  assert.deepEqual(parseTransferListQuery(input()).filter, input().filter);
  const literal = "%_\\'; SELECT literal";
  assert.equal(parseTransferListQuery({ ...input(), filter: { ...input().filter, number: literal } }).filter.number, literal);
});
test("transfer query: both warehouse-ID arrays accept 1000 distinct native IDs and reject 1001", () => {
  const selected = Array.from({ length: 1001 }, (_, index) => sid("warehouse", 10_000 + index));
  for (const key of ["fromWarehouseIds", "toWarehouseIds"] as const) {
    const query = { ...input(), filter: { ...input().filter, [key]: selected.slice(0, 1000) } };
    assert.equal(parseTransferListQuery(query).filter[key].length, 1000);
    assert.throws(() => parseTransferListQuery({ ...query, filter: { ...query.filter, [key]: selected } }), { code: "INVALID_TRANSFER_QUERY" });
  }
});
test("transfer query: warehouse lookup has one exact exclusive bounded search/selection contract", () => {
  const selected = Array.from({ length: 1001 }, (_, index) => sid("warehouse", 20_000 + index));
  const invalid: unknown[] = [null, [], {}, { ...warehouseInput(), actor }, { ...warehouseInput(), scope: { kind: "all" } }, { ...warehouseInput(), warehouseIds: [] },
    ...paginationFailures.map(value => ({ ...warehouseInput(), ...value })),
    ...[{ search: null }, { search: " spaced " }, { search: "a\n" }, { search: "a\u0000" }, { search: "a\u007f" }, { search: "x".repeat(201) },
      { selectedIds: null }, { selectedIds: ids.fromWarehouse }, { selectedIds: ["bad"] }, { selectedIds: Array(1) }, { selectedIds: [ids.fromWarehouse, ids.fromWarehouse] },
      { selectedIds: selected }, { search: "SYNTHETIC", selectedIds: [ids.fromWarehouse] }].map(value => ({ ...warehouseInput(), ...value }))];
  for (const key of Object.keys(warehouseInput())) { const query = { ...warehouseInput() } as Record<string, unknown>; delete query[key]; invalid.push(query); }
  for (const value of invalid) assert.throws(() => parseTransferWarehouseQuery(value), { code: "INVALID_TRANSFER_QUERY" });
  for (const search of ["", "x".repeat(200), "%_\\'; SELECT literal"]) assert.equal(parseTransferWarehouseQuery({ ...warehouseInput(), search }).search, search);
  for (const pageSize of [1, 20, 200]) assert.equal(parseTransferWarehouseQuery({ ...warehouseInput(), pageSize }).pageSize, pageSize);
  assert.equal(parseTransferWarehouseQuery({ ...warehouseInput(), selectedIds: selected.slice(0, 1000) }).selectedIds.length, 1000);
});
test("transfer query: detail has no aliases, caller identity, or optional transfer ID", () => {
  for (const value of [null, [], {}, { transferId: "bad" }, { id: ids.transfer }, { transferId: ids.transfer, actor }, { transferId: ids.transfer, scope: { kind: "all" } }]) {
    assert.throws(() => parseTransferDetailQuery(value), { code: "INVALID_TRANSFER_QUERY" });
  }
  const parsed = parseTransferDetailQuery({ transferId: ids.transfer }); assert.deepEqual(parsed, { transferId: ids.transfer }); assert.ok(Object.isFrozen(parsed));
});
test("transfer query: parsers copy and freeze all filter/selection arrays without mutating caller objects", () => {
  const raw = { ...input(), filter: { ...input().filter, statuses: ["DRAFT", "APPROVED", "VOID"], fromWarehouseIds: [ids.fromWarehouse], toWarehouseIds: [ids.toWarehouse] } };
  const parsed = parseTransferListQuery(raw);
  assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.filter)); assert.ok(!Object.isFrozen(raw.filter));
  for (const key of ["statuses", "fromWarehouseIds", "toWarehouseIds"] as const) {
    assert.notEqual(parsed.filter[key], raw.filter[key]); assert.ok(Object.isFrozen(parsed.filter[key]));
    assert.throws(() => (parsed.filter[key] as unknown[]).push("tamper"), TypeError);
  }
  raw.filter.statuses.splice(0); raw.filter.fromWarehouseIds.push(ids.toWarehouse); raw.filter.toWarehouseIds.splice(0);
  assert.deepEqual(parsed.filter.statuses, ["DRAFT", "APPROVED", "VOID"]); assert.deepEqual(parsed.filter.fromWarehouseIds, [ids.fromWarehouse]); assert.deepEqual(parsed.filter.toWarehouseIds, [ids.toWarehouse]);
  const selection = { ...warehouseInput(), selectedIds: [ids.fromWarehouse] }; const lookup = parseTransferWarehouseQuery(selection);
  assert.ok(Object.isFrozen(lookup)); assert.ok(Object.isFrozen(lookup.selectedIds)); assert.notEqual(lookup.selectedIds, selection.selectedIds);
  selection.selectedIds.push(ids.toWarehouse); assert.deepEqual(lookup.selectedIds, [ids.fromWarehouse]);
});
test("transfer query: explicit source policy grants endpoint hall OR immutable salesperson creation role+hall for every intent", async () => {
  const policy = createSourceConfirmedTransferQueryAuthorization();
  const intents: TransferReadIntent[] = [{ kind: "list", parameters: input() }, { kind: "detail", parameters: { transferId: ids.transfer } }, { kind: "warehouses", parameters: warehouseInput() }];
  for (const intent of intents) {
    assert.deepEqual(await policy.authorize(actor, intent, signal()), { kind: "restricted", clauses: [{ fromHallId: ids.hall }, { toHallId: ids.hall }, { createdHallId: ids.hall, createdRole: "SALESPERSON" }] });
    for (const role of ["ADMIN", "WAREHOUSE"] as const) assert.deepEqual(await policy.authorize({ ...actor, role }, intent, signal()), { kind: "all" });
    await assert.rejects(() => policy.authorize({ ...actor, hallId: null }, intent, signal()), { code: "FORBIDDEN" });
    await assert.rejects(() => policy.authorize({ ...actor, role: "UNKNOWN" } as never, intent, signal()), /Invalid trusted transfer actor/);
  }
});
test("transfer query: immutable actor, array filters and copied granted scope survive policy await", async () => {
  const parameters = { ...input(), filter: { ...input().filter, statuses: ["DRAFT"], fromWarehouseIds: [ids.fromWarehouse], toWarehouseIds: [ids.toWarehouse] } };
  const mutableActor = { ...actor }; const scope = { kind: "restricted" as const, clauses: [{ fromHallId: ids.hall }] };
  let release!: () => void; let reached!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); const authorized = new Promise<void>(resolve => { reached = resolve; });
  const d = dependencies({ authorization: { async authorize(context, intent) { assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(intent));
    assert.equal(intent.kind, "list"); assert.ok(Object.isFrozen(intent.parameters));
    if (intent.kind !== "list") throw new Error("Wrong intent");
    for (const key of ["statuses", "fromWarehouseIds", "toWarehouseIds"] as const) assert.ok(Object.isFrozen(intent.parameters.filter[key]));
    reached(); await pending; return scope; } } });
  d.reader.readList = async read => {
    assert.ok(Object.isFrozen(read)); assert.equal(read.actor.accountId, actor.accountId); assert.equal(read.actor.role, "SALESPERSON"); assert.equal(read.parameters.page, 1);
    assert.deepEqual(read.parameters.filter.statuses, ["DRAFT"]); assert.deepEqual(read.parameters.filter.fromWarehouseIds, [ids.fromWarehouse]); assert.deepEqual(read.parameters.filter.toWarehouseIds, [ids.toWarehouse]);
    assert.ok(Object.isFrozen(read.parameters.filter)); assert.ok(Object.isFrozen(read.scope)); assert.ok(read.scope.kind === "restricted");
    assert.notEqual(read.scope.clauses, scope.clauses); assert.notEqual(read.scope.clauses[0], scope.clauses[0]); assert.ok(Object.isFrozen(read.scope.clauses)); assert.ok(Object.isFrozen(read.scope.clauses[0]));
    scope.clauses[0]!.fromHallId = ids.otherHall; scope.clauses.push({ fromHallId: ids.otherHall }); assert.deepEqual(read.scope.clauses, [{ fromHallId: ids.hall }]);
    return { page: 1, pageSize: 20, exactTotal: 0n, items: [] };
  };
  const result = createTransferQueryService(d).readList(mutableActor, parameters, signal()); await authorized;
  Object.assign(parameters, { page: 9 }); parameters.filter.statuses.push("APPROVED"); parameters.filter.fromWarehouseIds.splice(0); parameters.filter.toWarehouseIds.push(ids.fromWarehouse);
  mutableActor.accountId = sid("account", 888); mutableActor.role = "ADMIN"; release(); await result;
});
test("transfer query: warehouse selected IDs are copied across await and cannot supply their own visibility", async () => {
  const parameters = { ...warehouseInput(), selectedIds: [ids.fromWarehouse] }; const mutableActor = { ...actor }; const readSignal = signal();
  let release!: () => void; let reached!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); const authorized = new Promise<void>(resolve => { reached = resolve; });
  const d = dependencies({ authorization: { async authorize(context, intent, receivedSignal) {
    assert.equal(context.accountId, actor.accountId); assert.equal(receivedSignal, readSignal); assert.equal(intent.kind, "warehouses"); assert.ok(Object.isFrozen(intent));
    if (intent.kind !== "warehouses") throw new Error("Wrong intent");
    assert.notEqual(intent.parameters, parameters); assert.notEqual(intent.parameters.selectedIds, parameters.selectedIds); assert.ok(Object.isFrozen(intent.parameters.selectedIds));
    reached(); await pending; return { kind: "restricted", clauses: [{ fromHallId: ids.otherHall }] }; } } });
  d.reader.readWarehouses = async read => {
    assert.equal(read.actor.role, actor.role); assert.equal(read.signal, readSignal); assert.deepEqual(read.parameters.selectedIds, [ids.fromWarehouse]); assert.equal(read.parameters.page, 1);
    assert.deepEqual(read.scope, { kind: "restricted", clauses: [{ fromHallId: ids.otherHall }] }); return { page: 1, pageSize: 20, exactTotal: 0n, items: [] };
  };
  const result = createTransferQueryService(d).readWarehouses(mutableActor, parameters, readSignal); await authorized;
  parameters.selectedIds.push(ids.toWarehouse); Object.assign(parameters, { search: "tamper", page: 9 }); mutableActor.role = "ADMIN"; release();
  assert.deepEqual(await result, { page: 1, pageSize: 20, exactTotal: 0n, items: [] });
});
test("transfer query: malformed parameters fail before policy or reader on all three methods", async () => {
  let policyCalls = 0; const d = dependencies({ authorization: { async authorize() { policyCalls++; return { kind: "all" }; } } });
  const service = createTransferQueryService(d);
  assert.throws(() => service.readList(actor, { ...input(), filter: { ...input().filter, status: "APPROVED" } }, signal()), { code: "INVALID_TRANSFER_QUERY" });
  assert.throws(() => service.readDetail(actor, { transferId: ids.transfer, role: "ADMIN" }, signal()), { code: "INVALID_TRANSFER_QUERY" });
  assert.throws(() => service.readWarehouses(actor, { ...warehouseInput(), search: "SYNTHETIC", selectedIds: [ids.fromWarehouse] }, signal()), { code: "INVALID_TRANSFER_QUERY" });
  assert.equal(policyCalls, 0);
});
test("transfer query: pre-abort and malformed actors never reach policy for any intent", async () => {
  let policyCalls = 0; let readCalls = 0; const controller = new AbortController(); const d = dependencies({ authorization: { async authorize() { policyCalls++; return { kind: "all" }; } } });
  d.reader.readList = d.reader.readDetail = d.reader.readWarehouses = async () => { readCalls++; throw new Error("Must not read"); };
  const service = createTransferQueryService(d); controller.abort();
  for (const read of calls(service, controller.signal)) await assert.rejects(read, { code: "TRANSFER_READ_ABORTED" });
  for (const value of [{ accountId: "fake", hallId: null, role: "ADMIN" }, { accountId: ids.account, role: "ADMIN" }, { accountId: ids.account, hallId: null, role: "UNKNOWN" }]) {
    for (const read of calls(service, signal(), value as never)) await assert.rejects(read, /Invalid trusted transfer actor/);
  }
  assert.equal(policyCalls, 0); assert.equal(readCalls, 0);
});
test("transfer query: authorization is renewed on every list, detail and selected warehouse read", async () => {
  let policyCalls = 0; let readCalls = 0; let allowed = true;
  const d = dependencies({ authorization: { async authorize() { policyCalls++; if (!allowed) throw new DomainError("FORBIDDEN", "SYNTHETIC revoked"); return { kind: "all" }; } } });
  d.reader.readList = async () => { readCalls++; return { page: 1, pageSize: 20, exactTotal: 9007199254740993n, items: [] }; };
  d.reader.readDetail = async () => { readCalls++; throw new DomainError("DOCUMENT_NOT_FOUND", "SYNTHETIC missing"); };
  d.reader.readWarehouses = async () => { readCalls++; return { page: 1, pageSize: 20, exactTotal: 9007199254740995n, items: [] }; };
  const service = createTransferQueryService(d);
  for (let index = 0; index < 2; index++) {
    assert.equal((await service.readList(actor, input(), signal())).exactTotal, 9007199254740993n);
    await assert.rejects(() => service.readDetail(actor, { transferId: ids.transfer }, signal()), { code: "DOCUMENT_NOT_FOUND" });
    assert.equal((await service.readWarehouses(actor, { ...warehouseInput(), selectedIds: [ids.fromWarehouse] }, signal())).exactTotal, 9007199254740995n);
  }
  allowed = false; for (const read of calls(service)) await assert.rejects(read, { code: "FORBIDDEN" });
  assert.equal(policyCalls, 9); assert.equal(readCalls, 6);
});
test("transfer query: abort after current policy or any snapshot reader prevents result delivery", async () => {
  for (const kind of ["list", "detail", "warehouses"] as const) for (const stage of ["policy", "reader"] as const) {
    const controller = new AbortController(); let reads = 0;
    const d = dependencies({ authorization: { async authorize() { if (stage === "policy") controller.abort(); return { kind: "all" }; } } });
    d.reader.readList = d.reader.readDetail = d.reader.readWarehouses = async () => { reads++; controller.abort(); return {} as never; };
    const service = createTransferQueryService(d); const read = kind === "list" ? () => service.readList(actor, input(), controller.signal)
      : kind === "detail" ? () => service.readDetail(actor, { transferId: ids.transfer }, controller.signal) : () => service.readWarehouses(actor, warehouseInput(), controller.signal);
    await assert.rejects(read, { code: "TRANSFER_READ_ABORTED" }); assert.equal(reads, stage === "policy" ? 0 : 1);
  }
});
