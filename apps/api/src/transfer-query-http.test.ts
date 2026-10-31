/** Fastify inject with explicitly synthetic readers/policy only. No listener or PostgreSQL. */
import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import Fastify from "fastify";
import { createTransferQueryHttpPlugin } from "./transfer-query-http.ts";
import type { TransferQueryHttpOptions } from "./transfer-query-http.ts";
import type { TransferDetailCatalog, TransferListQuery, TransferQueryAuthorization, TransferReadIntent, TransferReadScope, TransferScopedRead, TransferWarehouseQuery, TrustedTransferSnapshotReader } from "../../../packages/application/src/transfer-query-ports.ts";
import type { TransferActor } from "../../../packages/application/src/transfer-ports.ts";
import { DomainError } from "../../../packages/domain/src/errors.ts";
import { version } from "../../../packages/domain/src/values.ts";
import { actor, draft, ids, sid } from "../../../tests/support/synthetic-transfer.ts";

const input = (): TransferListQuery => ({ filter: { startDate: null, endDate: null, statuses: [], fromWarehouseIds: [], toWarehouseIds: [], number: null }, page: 1, pageSize: 20 });
const warehouseInput = (): TransferWarehouseQuery => ({ search: "", selectedIds: [], page: 1, pageSize: 20 });
const routes = () => [{ kind: "list", url: "/transfers/query", payload: input() }, { kind: "detail", url: "/transfers/detail/query", payload: { transferId: ids.transfer } },
  { kind: "warehouses", url: "/transfers/warehouses/query", payload: warehouseInput() }] as const;
const references = { responsibleName: null, fromWarehouseName: "SYNTHETIC SOURCE", toWarehouseName: "SYNTHETIC DESTINATION", fromHallName: "SYNTHETIC SOURCE HALL", toHallName: "SYNTHETIC DESTINATION HALL", createdByName: "SYNTHETIC CREATOR", approvedByName: null };
const document = () => ({ ...draft(["9007199254740993"]), header: { ...draft().header, responsibleStaffId: null, status: "DRAFT" as const, version: version(1), createdByAccountId: actor.accountId,
  createdHallId: actor.hallId, createdRole: actor.role, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T12:34:56Z", approvedByAccountId: null, approvedAt: null } });
const catalog = (): TransferDetailCatalog => {
  const tuple = { productId: sid("product", 300), productCode: "SYNTHETIC CURRENT CODE", productName: "SYNTHETIC CURRENT PRODUCT", colorId: sid("color", 301),
    colorName: "SYNTHETIC CURRENT COLOR", fitId: sid("fit", 302), fitName: "SYNTHETIC CURRENT FIT", sizeGroupId: sid("sizeGroup", 303) };
  return { skus: [{ ...tuple, skuId: ids.sku, sizeId: sid("size", 304) }, { ...tuple, skuId: ids.sku2, sizeId: sid("size", 305) }],
    sizeGroups: [{ sizeGroupId: tuple.sizeGroupId, code: "SYNTHETIC-GROUP", name: "SYNTHETIC CURRENT GROUP", members: [
      { sizeId: sid("size", 304), code: null, name: "SYNTHETIC CURRENT SIZE A", displayOrder: 0 }, { sizeId: sid("size", 305), code: "B", name: "SYNTHETIC CURRENT SIZE B", displayOrder: 7 }
    ] }] };
};
async function setup(t: TestContext, options: { authenticate?: TransferQueryHttpOptions["authenticate"]; authorize?: TransferQueryAuthorization["authorize"]; failure?: Error;
  empty?: boolean; abortAt?: "before-policy" | "policy" | "reader" } = {}) {
  let policyCalls = 0; let readCalls = 0; let currentActor: TransferActor | null = actor; let abortCurrent: () => void = () => { throw new Error("No active synthetic request"); };
  const intents: TransferReadIntent[] = [];
  const reads: { kind: TransferReadIntent["kind"]; actor: TransferActor; parameters: unknown; scope: TransferReadScope; signal: AbortSignal }[] = [];
  const check = (kind: TransferReadIntent["kind"], read: TransferScopedRead<unknown>) => {
    readCalls++; reads.push({ kind, ...read }); assert.ok(Object.isFrozen(read)); assert.ok(Object.isFrozen(read.actor)); assert.ok(Object.isFrozen(read.scope));
    if (options.abortAt === "reader") abortCurrent(); if (options.failure) throw options.failure;
  };
  const reader: TrustedTransferSnapshotReader = {
    async readList(read) { check("list", read); const header = document().header; return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: options.empty ? 0n : 9007199254740993n,
      items: options.empty ? [] : [{ id: header.id, number: header.number, businessDate: header.businessDate, fromWarehouseId: header.fromWarehouseId, toWarehouseId: header.toWarehouseId,
        status: header.status, version: header.version, responsibleStaffId: null, createdByAccountId: header.createdByAccountId, createdAt: header.createdAt, updatedAt: header.updatedAt, totalQuantity: 9007199254740993n, ...references }] }; },
    async readDetail(read) { check("detail", read); return { document: document(), stockBasis: "RUNTIME_LEDGER", references, catalog: catalog() }; },
    async readWarehouses(read) { check("warehouses", read); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: options.empty ? 0n : 9007199254740995n,
      items: options.empty ? [] : [{ id: ids.fromWarehouse, name: "SYNTHETIC DISABLED WAREHOUSE", hallId: ids.hall, hallName: "SYNTHETIC DISABLED HALL", enabled: false, hallEnabled: false }] }; }
  };
  const app = Fastify({ logger: false });
  app.addHook("preHandler", async request => { abortCurrent = () => { request.raw.emit("aborted"); }; if (options.abortAt === "before-policy") abortCurrent(); });
  app.register(createTransferQueryHttpPlugin({ authenticate: options.authenticate ?? (async info => { assert.ok(Object.isFrozen(info.headers)); return currentActor; }), dependencies: {
    authorization: { async authorize(context, intent, signal) { policyCalls++; intents.push(intent); assert.ok(Object.isFrozen(context)); assert.ok(Object.isFrozen(intent)); assert.ok(signal instanceof AbortSignal);
      if (options.abortAt === "policy") abortCurrent();
      return options.authorize ? options.authorize(context, intent, signal) : { kind: "restricted", clauses: [{ fromHallId: ids.hall }] }; } }, reader
  } }));
  t.after(() => app.close()); await app.ready();
  return { app, intents, reads, counts: () => ({ policyCalls, readCalls }), authenticateAs: (value: TransferActor | null) => { currentActor = value; },
    post: (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }) };
}
test("SYNTHETIC transfer query HTTP: three read routes use trusted actor/policy, never listen, and serialize exact counts/quantities", async t => {
  const f = await setup(t); assert.equal(f.app.server.listening, false);
  const list = await f.post("/transfers/query", input()); assert.equal(list.statusCode, 200); assert.equal(list.json().exactTotal, "9007199254740993");
  assert.equal(list.json().items[0].totalQuantity, "9007199254740993"); assert.equal(list.json().items[0].updatedAt, "2026-10-20T12:34:56Z");
  assert.equal(list.json().items[0].fromWarehouseName, references.fromWarehouseName); assert.equal(list.headers["cache-control"], "no-store"); assert.equal(list.headers.pragma, "no-cache");
  const detail = await f.post("/transfers/detail/query", { transferId: ids.transfer }); assert.equal(detail.statusCode, 200); assert.equal(detail.json().document.lines[0].quantity, "9007199254740993");
  assert.equal(detail.json().references.createdByName, references.createdByName); assert.equal(detail.json().document.header.version, 1); assert.equal(detail.json().stockBasis, "RUNTIME_LEDGER");
  const warehouses = await f.post("/transfers/warehouses/query", warehouseInput()); assert.equal(warehouses.statusCode, 200); assert.equal(warehouses.json().exactTotal, "9007199254740995");
  assert.deepEqual(warehouses.json().items, [{ id: ids.fromWarehouse, name: "SYNTHETIC DISABLED WAREHOUSE", hallId: ids.hall, hallName: "SYNTHETIC DISABLED HALL", enabled: false, hallEnabled: false }]);
  for (const response of [detail, warehouses]) { assert.equal(response.headers["cache-control"], "no-store"); assert.equal(response.headers.pragma, "no-cache"); }
  assert.deepEqual(f.intents.map(intent => intent.kind), ["list", "detail", "warehouses"]); assert.deepEqual(f.reads.map(read => read.actor), [actor, actor, actor]);
  assert.deepEqual(f.counts(), { policyCalls: 3, readCalls: 3 }); assert.equal(f.app.server.listening, false);
});
test("SYNTHETIC transfer query HTTP: detail current native catalog stays separate from saved snapshots, with complete size identities", async t => {
  const f = await setup(t); const response = await f.post("/transfers/detail/query", { transferId: ids.transfer }); assert.equal(response.statusCode, 200);
  const body = response.json(); assert.deepEqual(body.catalog, catalog()); assert.deepEqual(body.document.lines[0].snapshot, document().lines[0]!.snapshot);
  assert.notEqual(body.catalog.skus[0].productCode, body.document.lines[0].snapshot.productCode); assert.notEqual(body.catalog.skus[0].productName, body.document.lines[0].snapshot.productName);
  assert.notEqual(body.catalog.skus[0].colorName, body.document.lines[0].snapshot.colorName); assert.notEqual(body.catalog.skus[0].fitName, body.document.lines[0].snapshot.fitName);
  assert.equal(body.catalog.skus[0].skuId, body.document.lines[0].skuId); assert.equal(body.catalog.skus[1].skuId, ids.sku2); assert.equal(body.document.lines.length, 1);
  assert.equal(body.catalog.sizeGroups[0].members[0].code, null); assert.equal(body.catalog.sizeGroups[0].members[1].displayOrder, 7);
  assert.equal(typeof body.catalog.sizeGroups[0].members[1].displayOrder, "number");
});
test("SYNTHETIC transfer query HTTP: empty pages and requested paging retain exact decimal count contracts", async t => {
  const f = await setup(t, { empty: true });
  for (const [url, payload] of [["/transfers/query", { ...input(), page: 3, pageSize: 1 }], ["/transfers/warehouses/query", { ...warehouseInput(), page: 3, pageSize: 200 }]] as const) {
    const response = await f.post(url, payload); assert.equal(response.statusCode, 200); assert.deepEqual(response.json(), { page: 3, pageSize: payload.pageSize, exactTotal: "0", items: [] });
  }
  assert.deepEqual(f.counts(), { policyCalls: 2, readCalls: 2 });
});
test("SYNTHETIC transfer query HTTP: missing providers and missing/malformed/failing authentication never grant scope", async t => {
  assert.throws(() => createTransferQueryHttpPlugin({} as TransferQueryHttpOptions), /explicit trusted authentication/);
  assert.throws(() => createTransferQueryHttpPlugin({ authenticate: async () => actor } as unknown as TransferQueryHttpOptions), /explicit trusted authorization/);
  const f = await setup(t); f.authenticateAs(null);
  for (const { url, payload } of routes()) { const response = await f.post(url, payload); assert.equal(response.statusCode, 401); assert.equal(response.json().error.code, "UNAUTHENTICATED"); }
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
  for (const authenticate of [async () => ({ accountId: "fake", hallId: null, role: "ADMIN" }) as never,
    async () => ({ accountId: ids.account, hallId: null }) as never, async () => { throw new DomainError("FORBIDDEN", "PRIVATE AUTH"); }]) {
    const g = await setup(t, { authenticate });
    for (const { url, payload } of routes()) { const result = await g.post(url, payload); assert.equal(result.statusCode, 500); assert.ok(!result.body.includes("PRIVATE")); assert.equal(result.json().error.code, "INTERNAL_ERROR"); }
    assert.deepEqual(g.counts(), { policyCalls: 0, readCalls: 0 });
  }
});
test("SYNTHETIC transfer query HTTP: exact array-only list filters reject historical scalar paths and caller authority", async t => {
  const f = await setup(t);
  for (const payload of [{ ...input(), actor }, { ...input(), role: "ADMIN" }, { ...input(), scope: { kind: "all" } },
    { ...input(), filter: { startDate: null, endDate: null, status: null, fromWarehouseId: null, toWarehouseId: null, number: null } },
    ...[{ createdByAccountId: ids.account }, { hallId: ids.hall }, { status: "APPROVED" }, { fromWarehouseId: ids.fromWarehouse }, { toWarehouseId: ids.toWarehouse },
      { statuses: null }, { statuses: "DRAFT" }, { statuses: [null] }, { statuses: ["DRAFT", "DRAFT"] }, { statuses: ["APPROVED", "VOID", "DRAFT", "DELETED"] },
      { fromWarehouseIds: ids.fromWarehouse }, { toWarehouseIds: [ids.toWarehouse, ids.toWarehouse] }, { fromWarehouseIds: ["bad"] }, { toWarehouseIds: [null] }, { startDate: "2026-02-30" }]
      .map(filter => ({ ...input(), filter: { ...input().filter, ...filter } })), { ...input(), pageSize: 201 }, { ...input(), page: "1" }]) {
    const response = await f.post("/transfers/query", payload); assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_TRANSFER_QUERY");
  }
  assert.equal((await f.post("/transfers/detail/query", { transferId: ids.transfer, actor })).statusCode, 400); assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test("SYNTHETIC transfer query HTTP: warehouse search/selected-ID exactness and bounds fail before policy", async t => {
  const f = await setup(t); const tooMany = Array.from({ length: 1001 }, (_, index) => sid("warehouse", 30_000 + index));
  for (const payload of [{ search: "", page: 1, pageSize: 20 }, { ...warehouseInput(), actor }, { ...warehouseInput(), scope: { kind: "all" } }, { ...warehouseInput(), warehouseIds: [] },
    ...[{ search: " query " }, { search: "a\n" }, { search: "x".repeat(201) }, { selectedIds: null }, { selectedIds: ids.fromWarehouse }, { selectedIds: ["bad"] }, { selectedIds: [null] },
      { selectedIds: [ids.fromWarehouse, ids.fromWarehouse] }, { selectedIds: tooMany }, { selectedIds: [ids.fromWarehouse], search: "SYNTHETIC" },
      { page: 0 }, { page: "1" }, { page: 1.5 }, { page: Number.MAX_SAFE_INTEGER }, { pageSize: 0 }, { pageSize: 201 }].map(query => ({ ...warehouseInput(), ...query }))]) {
    const response = await f.post("/transfers/warehouses/query", payload); assert.equal(response.statusCode, 400); assert.equal(response.json().error.code, "INVALID_TRANSFER_QUERY");
  }
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 });
});
test("SYNTHETIC transfer query HTTP: bounded warehouse selection/search maxima are accepted without truncation", async t => {
  const f = await setup(t); const selectedIds = Array.from({ length: 1000 }, (_, index) => sid("warehouse", 40_000 + index));
  const selected = { ...warehouseInput(), selectedIds, pageSize: 200 }; const search = { ...warehouseInput(), search: "x".repeat(200), pageSize: 1 };
  for (const payload of [selected, search]) assert.equal((await f.post("/transfers/warehouses/query", payload)).statusCode, 200);
  assert.deepEqual(f.reads.map(read => read.parameters), [selected, search]); assert.deepEqual(f.counts(), { policyCalls: 2, readCalls: 2 });
});
test("SYNTHETIC transfer query HTTP: literal search and selected IDs narrow the reader intent, never the trusted grant", async t => {
  const scope = { kind: "restricted" as const, clauses: [{ fromHallId: ids.otherHall }] }; const f = await setup(t, { authorize: async () => scope });
  const literal = "%_\\'; SELECT literal";
  const listInput = { ...input(), filter: { ...input().filter, statuses: ["DRAFT", "APPROVED", "VOID"], fromWarehouseIds: [ids.fromWarehouse, ids.toWarehouse], toWarehouseIds: [ids.toWarehouse], number: literal } };
  for (const [url, payload] of [["/transfers/query", listInput], ["/transfers/warehouses/query", { ...warehouseInput(), search: literal }],
    ["/transfers/warehouses/query", { ...warehouseInput(), selectedIds: [ids.fromWarehouse, ids.toWarehouse] }]] as const) assert.equal((await f.post(url, payload)).statusCode, 200);
  assert.deepEqual(f.reads.map(read => read.parameters), [listInput, { ...warehouseInput(), search: literal }, { ...warehouseInput(), selectedIds: [ids.fromWarehouse, ids.toWarehouse] }]);
  for (const read of f.reads) { assert.deepEqual(read.scope, scope); assert.notEqual(read.scope, scope); assert.deepEqual(read.actor, actor); }
  const response = await f.app.inject({ method: "POST", url: "/transfers/warehouses/query", payload: warehouseInput(), headers: { "x-role": "ADMIN", "x-account-id": "fake" } });
  assert.equal(response.statusCode, 200); assert.deepEqual(f.reads[3]!.actor, actor); assert.deepEqual(f.reads[3]!.scope, scope);
});
test("SYNTHETIC transfer query HTTP: denied, empty and malformed current policy scopes cannot touch any reader", async t => {
  for (const [authorize, expected] of [[async () => { throw new DomainError("FORBIDDEN", "PRIVATE POLICY"); }, 403], [async () => ({ kind: "restricted", clauses: [] }) as const, 403],
    [async () => ({ kind: "restricted", clauses: [{}] }) as const, 500], [async () => ({ kind: "all", role: "ADMIN" }) as const, 500]] as const) {
    const f = await setup(t, { authorize });
    for (const { url, payload } of routes()) { const result = await f.post(url, payload); assert.equal(result.statusCode, expected); assert.ok(!result.body.includes("PRIVATE")); }
    assert.deepEqual(f.counts(), { policyCalls: 3, readCalls: 0 });
  }
});
test("SYNTHETIC transfer query HTTP: all read routes reauthorize after access revocation, including selected warehouse IDs", async t => {
  let allowed = true; const f = await setup(t, { authorize: async () => { if (!allowed) throw new DomainError("FORBIDDEN", "PRIVATE REVOKED"); return { kind: "all" }; } });
  const requests = [...routes().slice(0, 2), { url: "/transfers/warehouses/query", payload: { ...warehouseInput(), selectedIds: [ids.fromWarehouse] } }];
  for (const { url, payload } of requests) assert.equal((await f.post(url, payload)).statusCode, 200);
  allowed = false; for (const { url, payload } of requests) assert.equal((await f.post(url, payload)).statusCode, 403);
  assert.deepEqual(f.counts(), { policyCalls: 6, readCalls: 3 });
});
test("SYNTHETIC transfer query HTTP: known safe errors map on every route while provider/SQL messages stay private", async t => {
  for (const [error, expected] of [[new DomainError("DOCUMENT_NOT_FOUND", "PRIVATE TARGET"), 404], [new DomainError("TRANSFER_READ_TOO_LARGE", "PRIVATE LIMIT"), 413],
    [new DomainError("TRANSFER_READ_ABORTED", "PRIVATE ABORT"), 408], [new DomainError("INVALID_DATABASE_VALUE", "PRIVATE DATABASE"), 500], [new Error("PRIVATE SQL postgresql://credentials"), 500]] as const) {
    const f = await setup(t, { failure: error });
    for (const { url, payload } of routes()) { const result = await f.post(url, payload); assert.equal(result.statusCode, expected); assert.ok(!result.body.includes("PRIVATE")); assert.ok(!result.body.includes("credentials")); }
    assert.deepEqual(f.counts(), { policyCalls: 3, readCalls: 3 });
  }
});
test("SYNTHETIC transfer query HTTP: synthetic request abort before/after policy or reader prevents delivery on all routes", async t => {
  for (const abortAt of ["before-policy", "policy", "reader"] as const) {
    const f = await setup(t, { abortAt });
    for (const { url, payload } of routes()) { const response = await f.post(url, payload); assert.equal(response.statusCode, 408); assert.equal(response.json().error.code, "TRANSFER_READ_ABORTED"); }
    assert.deepEqual(f.counts(), { policyCalls: abortAt === "before-policy" ? 0 : 3, readCalls: abortAt === "reader" ? 3 : 0 });
    for (const read of f.reads) assert.equal(read.signal.aborted, true);
    assert.equal(f.app.server.listening, false);
  }
});
test("SYNTHETIC transfer query HTTP: strict transport rejects query strings, malformed JSON/media and large bodies on all routes", async t => {
  const f = await setup(t);
  for (const { url, payload } of routes()) {
    assert.equal((await f.post(`${url}?role=ADMIN`, payload)).statusCode, 400);
    assert.equal((await f.app.inject({ method: "POST", url, headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
    assert.equal((await f.app.inject({ method: "POST", url, headers: { "content-type": "application/json" }, payload: "" })).statusCode, 400);
    assert.equal((await f.app.inject({ method: "POST", url, headers: { "content-type": "text/plain" }, payload: "not JSON" })).statusCode, 415);
    assert.equal((await f.app.inject({ method: "POST", url, headers: { "content-type": "application/json" }, payload: JSON.stringify({ data: "x".repeat(65536) }) })).statusCode, 413);
  }
  assert.deepEqual(f.counts(), { policyCalls: 0, readCalls: 0 }); assert.equal(f.app.server.listening, false);
});

test('normal transfer HTTP: original POST carries explicit dataset exact totals and unknown historical creator without a write route', async t => {
  const { PostgresTransferQueryReader } = await import('../../../adapters/postgres/src/transfer-query-reader.ts');
  const client = { async query(sql: string):Promise<{rows:Record<string,unknown>[];rowCount:number}> {
    // P03 now returns the original totals/page fixtures in one shared envelope.
    if(sql.includes('normal-document-list:shared')){const total=await client.query('normal-document-list:totals'),page=await client.query('normal-document-list:page');return {rows:[{...total.rows[0],items:page.rows}],rowCount:1};}
    if (sql.includes('read-authorization:identity')) return { rows: [{ account_id: actor.accountId, staff_id: sid('staff', 950), login_enabled: true, role: actor.role, employment_status: '在职', hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }], rowCount: 1 };
    if (sql.includes('normal-document-list:totals')) return { rows: [{ exact_total: '1', history_valid: true, history_published: true, quantity: '9007199254740993', incoming_quantity: '0', outgoing_quantity: '9007199254740993' }], rowCount: 1 };
    if (sql.includes('normal-document-list:page')) return { rows: [{ dataset: 'HISTORY', batch_id: sid('operation', 951), id: ids.transfer, number: 'SYNTHETIC_HISTORY', business_date: null, status: 'DRAFT', version: 2,
      from_warehouse_id: ids.fromWarehouse, to_warehouse_id: ids.toWarehouse, responsible_staff_id: null, responsible_name: null, created_by_account_id: null, created_by_name: null, approved_by_name: null,
      created_at: null, updated_at: null, created_local_at: null, updated_local_at: null, from_warehouse_name: null, to_warehouse_name: null, from_hall_name: null, to_hall_name: null,
      quantity: '9007199254740993', product_count: '0', product_items: [], product_has_more: false }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release() {} };
  const reader = new PostgresTransferQueryReader({ async connect() { return client; } }, { profile: 'source-confirmed-normal-document-lists-v1', runtime26: { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(actual, purpose) { assert.equal(actual, client); assert.equal(purpose, 'HISTORY_READ'); } } });
  const app = Fastify({ logger: false }); t.after(() => app.close());
  app.register(createTransferQueryHttpPlugin({ authenticate: async () => actor, dependencies: { authorization: { async authorize() { return { kind: 'all' }; } }, reader } })); await app.ready();
  const response = await app.inject({ method: 'POST', url: '/transfers/query', payload: input() }); assert.equal(response.statusCode, 200, response.body);
  const body = response.json(); assert.equal(body.totals.totalQuantity, '9007199254740993'); assert.equal(body.items[0].totalQuantity, '9007199254740993');
  assert.equal(body.items[0].dataset, 'HISTORY'); assert.equal(body.items[0].batchId, sid('operation', 951)); assert.equal(body.items[0].documentId, ids.transfer); assert.equal(body.items[0].effectiveVersion, 2);
  assert.equal(body.items[0].createdByAccountId, null); assert.equal(body.items[0].createdAt, null); assert.equal(body.items[0].status, 'DRAFT');
  assert.equal(body.historyCoverage, 'PUBLISHED_AUTHORIZED'); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(app.server.listening, false);
  assert.equal(app.hasRoute({ method: 'POST', url: '/transfers/commands' }), false);
  assert.equal((await app.inject({ method: 'POST', url: '/transfers/query', payload: { ...input(), batchId: sid('operation', 951) } })).statusCode, 400);
});
