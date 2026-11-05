/** SYNTHETIC scripted PostgreSQL protocol only. No runtime DB, authentication bypass or network. */
import assert from "node:assert/strict";
import test from "node:test";
import { createSourceConfirmedPostgresReadAuthorization, NATIVE_READ_MAX_AUTHORIZED_WAREHOUSES } from "../adapters/postgres/src/source-confirmed-read-authorization.ts";
import type { PgReadAuthorizationClient, PgReadAuthorizationResult } from "../adapters/postgres/src/source-confirmed-read-authorization.ts";
import { createInventoryQueryService } from "../packages/application/src/inventory-query-service.ts";
import { createInventoryLedgerQueryService } from "../packages/application/src/inventory-ledger-query-service.ts";
import { createSalesQueryService } from "../packages/application/src/sales-query-service.ts";
import { createProductQueryService } from "../packages/application/src/product-query-service.ts";
import type { ActorContext } from "../packages/application/src/ports.ts";
import type { InventoryReadIntent } from "../packages/application/src/inventory-query-contracts.ts";
import type { SalesReadIntent } from "../packages/application/src/sales-query-ports.ts";
import type { ProductReadIntent } from "../packages/application/src/product-query-ports.ts";
import { actor, ids, sid } from "./support/synthetic-fixtures.ts";

interface Step {
  readonly sql: RegExp; readonly rows?: Record<string, unknown>[]; readonly error?: Error;
  readonly inspect?: (values: unknown[], sql: string) => void | Promise<void>;
}
class Client implements PgReadAuthorizationClient {
  readonly calls: { sql: string; values: unknown[] }[] = [];
  readonly releases: (Error | boolean | undefined)[] = [];
  private readonly steps: Step[];
  constructor(steps: Step[]) { this.steps = [...steps]; }
  async query(sql: string, values: unknown[] = []): Promise<PgReadAuthorizationResult> {
    this.calls.push({ sql, values: structuredClone(values) });
    const step = this.steps.shift(); assert.ok(step, `Unexpected synthetic authorization query: ${sql}`);
    assert.match(sql, step.sql); await step.inspect?.(values, sql); if (step.error) throw step.error;
    return { rows: structuredClone(step.rows ?? []), rowCount: step.rows?.length ?? 0 };
  }
  release(error?: Error | boolean): void { this.releases.push(error); }
  done(): void { assert.equal(this.steps.length, 0); assert.equal(this.releases.length, 1); }
}
const begin = (): Step => ({ sql: /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY$/ });
const commit = (): Step => ({ sql: /^COMMIT$/ }); const rollback = (): Step => ({ sql: /^ROLLBACK$/ });
const hallB = sid("hall", 2002), warehouseB = sid("warehouse", 2003), staffId = sid("staff", 2004), productId = sid("product", 2005);
const signal = () => new AbortController().signal;
const roles = ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const;
const identity = (role: string = "SALESPERSON", hall: ActorContext["hallId"] = ids.hall): Record<string, unknown> => ({
  account_id: ids.account, staff_id: staffId, login_enabled: true, role, employment_status: "在职", hall_id: hall,
  native_hall_id: hall, hall_enabled: hall === null ? null : true
});
const identityStep = (rows = [identity()]): Step => ({ sql: /\/\* read-authorization:identity \*\//, rows, inspect(values, sql) {
  assert.deepEqual(values, [ids.account]); assert.match(sql, /WHERE a.id = \$1::uuid LIMIT 2$/);
  assert.match(sql, /JOIN naijue_erp.staff s ON s.id = a.staff_id/);
  assert.match(sql, /LEFT JOIN naijue_erp.hall h ON h.id = s.hall_id/);
  assert.ok(!sql.includes(ids.account)); assert.ok(!/password|hash|session|token|auth_version|login_name/i.test(sql));
} });
const warehouseRows = () => [
  { id: warehouseB, hall_id: hallB, name: "原始完整乙仓名", native_hall_id: hallB },
  { id: ids.warehouse, hall_id: ids.hall, name: "原始完整甲仓名", native_hall_id: ids.hall }
];
const warehouses = (rows: Record<string, unknown>[] = warehouseRows()): Step => ({ sql: /\/\* read-authorization:warehouses \*\//, rows, inspect(values, sql) {
  assert.deepEqual(values, [1001]); assert.match(sql, /ORDER BY w.name COLLATE "C", w.id LIMIT \$1$/);
  assert.ok(!/\bWHERE\b|\benabled\b|import|publication|inventory_balance|inventory_ledger|product|sku/i.test(sql));
} });
const inventoryIntent: InventoryReadIntent = { kind: "inventory", parameters: { page: 1, pageSize: 100,
  filter: { productIds: [], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } } };
const salesQuery = { page: 1, pageSize: 20 as const, filter: { startDate: null, endDate: null, statuses: [], businessTypes: [], hallIds: [hallB], salespersonIds: [], customerIds: [], warehouseIds: [], number: null } };
const salesIntents: SalesReadIntent[] = [{ kind: "list", parameters: salesQuery }, { kind: "settlement-statistics", parameters: salesQuery },
  { kind: "detail", parameters: { salesId: ids.sales } }, { kind: "history", parameters: { salesId: ids.sales, page: 1, pageSize: 20 } }];
const productIntents: ProductReadIntent[] = ["basics", "specifications", "images"].map(kind => ({ kind: kind as "basics" | "specifications" | "images", parameters: { productId } }));
productIntents.push({ kind: "image", parameters: { productId, imageId: sid("product", 2006) } });
function policies(client: Client) { return createSourceConfirmedPostgresReadAuthorization({ async connect() { return client; } }); }
const expectedScope = () => ({ hallIds: [hallB, ids.hall], warehouses: warehouseRows().map(row => ({ id: row.id, hallId: row.hall_id, label: row.name })) });

test("native read authorization: lazy explicit pool, no lifecycle ownership or public authentication entry point", async () => {
  assert.throws(() => createSourceConfirmedPostgresReadAuthorization(undefined as never), /explicit trusted PostgreSQL pool/);
  let connects = 0; const p = createSourceConfirmedPostgresReadAuthorization({ async connect() { connects++; throw new Error("Not called"); } });
  assert.equal(connects, 0); assert.deepEqual(Object.keys(p), ["inventory", "sales", "products"]);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.inventory) && Object.isFrozen(p.sales) && Object.isFrozen(p.products));
  for (const authorize of [() => p.inventory.authorize(actor, inventoryIntent, signal()), () => p.sales.authorize(actor, salesIntents[0]!, signal()),
    () => p.products.authorize(actor, productIntents[0]!, signal())]) await assert.rejects(authorize, /Not called/);
  assert.equal(connects, 3);
});
test("native read authorization: every canonical role retains ALL native warehouse IDs/halls/full labels in bounded returned order", async () => {
  for (const role of roles) {
    const client = new Client([begin(), identityStep([identity(role)]), warehouses(), commit()]);
    const scope = await policies(client).inventory.authorize(actor, inventoryIntent, signal());
    assert.deepEqual(scope, expectedScope()); assert.ok(scope.warehouses.some(row => row.hallId !== actor.hallId));
    assert.ok(Object.isFrozen(scope) && Object.isFrozen(scope.hallIds) && Object.isFrozen(scope.warehouses));
    assert.equal(client.calls.length, 4); assert.equal(client.releases[0], undefined); client.done();
  }
});
test("native read authorization: inventory and all candidate kinds use the same current identity + warehouse grant, including disabled historical references", async () => {
  for (const kind of ["product", "category", "warehouse", "supplier", "fit", "season"] as const) {
    const client = new Client([begin(), identityStep(), warehouses(), commit()]);
    const result = await policies(client).inventory.authorize(actor, { kind: "candidates", parameters: { kind, search: "", page: 1, pageSize: 20, selectedIds: [], categoryIds: [] } }, signal());
    assert.deepEqual(result, expectedScope()); assert.equal(client.calls.length, 4); client.done();
  }
});
test("native read authorization: ALL sales intents are current-hall-only for salesperson, all for ADMIN/WAREHOUSE, never request filter/creator/staff scope", async () => {
  for (const role of roles) for (const intent of salesIntents) {
    const client = new Client([begin(), identityStep([identity(role)]), commit()]);
    const scope = await policies(client).sales.authorize({ ...actor, role: "ADMIN" } as ActorContext, intent, signal());
    assert.deepEqual(scope, role === "SALESPERSON" ? { kind: "restricted", clauses: [{ hallId: actor.hallId }] } : { kind: "all" });
    assert.equal(client.calls.length, 3); client.done();
  }
});
test("native read authorization: each canonical role can read exact requested product facts and media, with no stock/catalog/hall scan", async () => {
  for (const role of roles) for (const intent of productIntents) {
    const client = new Client([begin(), identityStep([identity(role)]), commit()]);
    assert.deepEqual(await policies(client).products.authorize(actor, intent, signal()), { productId });
    assert.equal(client.calls.length, 3); assert.ok(client.calls.every(call => !/FROM naijue_erp.(product|sku|warehouse|inventory|import)/.test(call.sql))); client.done();
  }
});
test("native read authorization: ADMIN/WAREHOUSE permit exact null hall, but SALESPERSON always requires a real enabled current hall", async () => {
  for (const role of ["ADMIN", "WAREHOUSE"] as const) {
    const client = new Client([begin(), identityStep([identity(role, null)]), commit()]);
    assert.deepEqual(await policies(client).sales.authorize({ ...actor, hallId: null }, salesIntents[0]!, signal()), { kind: "all" }); client.done();
  }
  const client = new Client([begin(), identityStep([identity("SALESPERSON", null)]), rollback()]);
  await assert.rejects(() => policies(client).products.authorize({ ...actor, hallId: null }, productIntents[0]!, signal()), { code: "FORBIDDEN" }); client.done();
});
test("native read authorization: missing/duplicate/malformed/disabled/stale identities fail closed before warehouse or business queries", async () => {
  const invalidRows = [[], [identity(), identity()],
    ...[{ account_id: sid("account", 9999) }, { account_id: "bad" }, { staff_id: "bad" }, { login_enabled: false }, { login_enabled: "true" },
      { employment_status: "离职" }, { employment_status: "ACTIVE" }, { role: "admin" }, { role: "UNKNOWN" }, { role: null },
      { hall_id: hallB, native_hall_id: hallB }, { hall_id: null, native_hall_id: null, hall_enabled: null },
      { native_hall_id: null }, { native_hall_id: hallB }, { hall_enabled: false }, { hall_enabled: "true" }, { hall_id: "bad" }].map(patch => [{ ...identity(), ...patch }])];
  for (const rows of invalidRows) {
    const client = new Client([begin(), identityStep(rows), rollback()]);
    await assert.rejects(() => policies(client).inventory.authorize(actor, inventoryIntent, signal()), { code: "FORBIDDEN" });
    assert.equal(client.calls.length, 3); client.done();
  }
  for (const patch of [{ hall_id: ids.hall }, { native_hall_id: ids.hall }, { hall_enabled: true }]) {
    const client = new Client([begin(), identityStep([{ ...identity("ADMIN", null), ...patch }]), rollback()]);
    await assert.rejects(() => policies(client).sales.authorize({ ...actor, hallId: null }, salesIntents[0]!, signal()), { code: "FORBIDDEN" }); client.done();
  }
});
test("native read authorization: each invocation re-reads identity, without mutable role map/account cache", async () => {
  const first = new Client([begin(), identityStep([identity("ADMIN")]), commit()]);
  const second = new Client([begin(), identityStep(), commit()]); const third = new Client([begin(), identityStep([{ ...identity(), login_enabled: false }]), rollback()]);
  const clients = [first, second, third]; let connects = 0;
  const p = createSourceConfirmedPostgresReadAuthorization({ async connect() { return clients[connects++]!; } });
  assert.deepEqual(await p.sales.authorize(actor, salesIntents[0]!, signal()), { kind: "all" });
  assert.deepEqual(await p.sales.authorize(actor, salesIntents[0]!, signal()), { kind: "restricted", clauses: [{ hallId: ids.hall }] });
  await assert.rejects(() => p.sales.authorize(actor, salesIntents[0]!, signal()), { code: "FORBIDDEN" });
  assert.equal(connects, 3); clients.forEach(client => client.done());
});
test("native read authorization: warehouse scope empty, overflow, duplicate/invalid identity, missing hall or invalid label never truncates/invents facts", async () => {
  const invalid = [[], Array.from({ length: NATIVE_READ_MAX_AUTHORIZED_WAREHOUSES + 1 }, () => warehouseRows()[0]!),
    [warehouseRows()[0]!, warehouseRows()[0]!], ...[{ id: "bad" }, { hall_id: "bad" }, { native_hall_id: null }, { native_hall_id: ids.hall },
      { name: "" }, { name: " " }, { name: "\u0000" }, { name: "长".repeat(1001) }, { name: 123 }].map(patch => [{ ...warehouseRows()[0]!, ...patch }])];
  for (let index = 0; index < invalid.length; index++) {
    const client = new Client([begin(), identityStep(), warehouses(invalid[index]!), rollback()]);
    const pending = policies(client).inventory.authorize(actor, inventoryIntent, signal());
    if (index < 2) await assert.rejects(pending, { code: index === 0 ? "FORBIDDEN" : "INVENTORY_READ_TOO_LARGE" });
    else await assert.rejects(pending);
    assert.equal(client.calls.length, 4); client.done();
  }
  const thousand = Array.from({ length: 1000 }, (_, index) => ({ id: sid("warehouse", 10000 + index), hall_id: hallB, name: `原始仓库 ${index}`, native_hall_id: hallB }));
  const client = new Client([begin(), identityStep(), warehouses(thousand), commit()]);
  const scope = await policies(client).inventory.authorize(actor, inventoryIntent, signal()); assert.equal(scope.warehouses.length, 1000); assert.deepEqual(scope.hallIds, [hallB]); client.done();
});
test("native read authorization: invalid actors, intents/targets and pre-aborted calls acquire no resource", async () => {
  let connects = 0; const p = createSourceConfirmedPostgresReadAuthorization({ async connect() { connects++; throw new Error("Must not connect"); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => p.inventory.authorize(actor, inventoryIntent, controller.signal), { code: "INVENTORY_READ_ABORTED" });
  await assert.rejects(() => p.sales.authorize(actor, salesIntents[0]!, controller.signal), { code: "SALES_READ_ABORTED" });
  await assert.rejects(() => p.products.authorize(actor, productIntents[0]!, controller.signal), { code: "PRODUCT_READ_ABORTED" });
  await assert.rejects(() => p.inventory.authorize({ accountId: ids.account } as never, inventoryIntent, signal()), /Invalid trusted inventory actor/);
  await assert.rejects(() => p.sales.authorize({ ...actor, accountId: "bad" } as never, salesIntents[0]!, signal()), /Invalid trusted inventory actor/);
  for (const kind of ["inventory", "sales", "products"] as const) await assert.rejects(() => p[kind].authorize(actor, { kind: "SAVE" } as never, signal()), /Unsupported/);
  await assert.rejects(() => p.products.authorize(actor, { kind: "basics", parameters: { productId: "bad" } } as never, signal()), { code: "INVALID_PRODUCT_QUERY" });
  await assert.rejects(() => p.products.authorize(actor, { kind: "image", parameters: { productId, imageId: "bad" } }, signal()), { code: "INVALID_PRODUCT_QUERY" });
  assert.equal(connects, 0);
});
test("native read authorization: actor/target facts are captured before awaits, not mutable caller replacements", async () => {
  const mutableActor = { ...actor }; const target = { productId }; const intent = { kind: "basics" as const, parameters: target };
  const client = new Client([begin(), { ...identityStep(), inspect() { mutableActor.hallId = hallB; mutableActor.accountId = sid("account", 9999); target.productId = sid("product", 9999); } }, commit()]);
  assert.deepEqual(await policies(client).products.authorize(mutableActor, intent, signal()), { productId }); client.done();
});
test("native read authorization: abort during acquisition releases late client without BEGIN or business reads", async () => {
  let resolve!: (client: Client) => void; const controller = new AbortController(); const client = new Client([]);
  const p = createSourceConfirmedPostgresReadAuthorization({ connect: () => new Promise<Client>(done => { resolve = done; }) });
  const pending = p.sales.authorize(actor, salesIntents[0]!, controller.signal); controller.abort(); resolve(client);
  await assert.rejects(pending, { code: "SALES_READ_ABORTED" }); assert.equal(client.calls.length, 0); assert.ok(client.releases[0] instanceof Error); client.done();
});
test("native read authorization: abort after identity/warehouse query rolls back, never returns a scope or starts later work", async () => {
  for (const atWarehouse of [false, true]) {
    const controller = new AbortController(); const step = atWarehouse ? warehouses() : identityStep();
    const aborting = { ...step, inspect: async (values: unknown[], sql: string) => { await step.inspect?.(values, sql); controller.abort(); } };
    const client = new Client([begin(), ...(atWarehouse ? [identityStep(), aborting] : [aborting]), rollback()]);
    await assert.rejects(() => policies(client).inventory.authorize(actor, inventoryIntent, controller.signal), { code: "INVENTORY_READ_ABORTED" }); client.done();
  }
});
test("native read authorization: failed SELECT/COMMIT rolls back, failed BEGIN/COMMIT/rollback quarantines exactly once and never retries", async () => {
  const failedRead = new Client([begin(), { ...identityStep(), error: new Error("synthetic read failure") }, rollback()]);
  await assert.rejects(() => policies(failedRead).sales.authorize(actor, salesIntents[0]!, signal()), /synthetic read failure/); assert.equal(failedRead.releases[0], undefined); failedRead.done();
  const failedBegin = new Client([{ ...begin(), error: new Error("synthetic begin failure") }]);
  await assert.rejects(() => policies(failedBegin).sales.authorize(actor, salesIntents[0]!, signal()), /synthetic begin failure/); assert.ok(failedBegin.releases[0] instanceof Error); failedBegin.done();
  const failedCommit = new Client([begin(), identityStep(), { ...commit(), error: new Error("synthetic commit failure") }, rollback()]);
  await assert.rejects(() => policies(failedCommit).products.authorize(actor, productIntents[0]!, signal()), /synthetic commit failure/); assert.ok(failedCommit.releases[0] instanceof Error); failedCommit.done();
  const failedRollback = new Client([begin(), identityStep([]), { ...rollback(), error: new Error("synthetic rollback failure") }]);
  await assert.rejects(() => policies(failedRollback).sales.authorize(actor, salesIntents[0]!, signal()), AggregateError); assert.ok(failedRollback.releases[0] instanceof Error); failedRollback.done();
});
test("native read authorization: abort after acknowledged COMMIT withholds each grant but never rolls back or discards the clean committed lease", async () => {
  for (const kind of ["inventory", "sales", "products"] as const) {
    const controller = new AbortController();
    const client = new Client([begin(), identityStep(), ...(kind === "inventory" ? [warehouses()] : []), { ...commit(), inspect() { controller.abort(); } }]);
    const p = policies(client);
    const pending = kind === "inventory" ? p.inventory.authorize(actor, inventoryIntent, controller.signal)
      : kind === "sales" ? p.sales.authorize(actor, salesIntents[0]!, controller.signal) : p.products.authorize(actor, productIntents[0]!, controller.signal);
    await assert.rejects(pending, { code: kind === "inventory" ? "INVENTORY_READ_ABORTED" : kind === "sales" ? "SALES_READ_ABORTED" : "PRODUCT_READ_ABORTED" });
    assert.equal(client.calls.at(-1)!.sql, "COMMIT"); assert.ok(!client.calls.some(call => call.sql === "ROLLBACK"));
    assert.equal(client.releases[0], undefined); client.done();
  }
});
test("native read authorization: services await fresh authorization before reader count/page/sum/detail/history work; denial performs no business read", async () => {
  for (const method of ["readList", "readDetail", "readHistory", "readSettlementStatistics", "readReferences"] as const) {
    const client = new Client([begin(), identityStep(), commit()]); let reads = 0; const stopped = new Error("Synthetic business read boundary");
    const read = async (value: { scope: unknown }) => { reads++; assert.deepEqual(client.calls.map(call => call.sql === "COMMIT" ? "COMMIT" : "select"), ["select", "select", "COMMIT"]);
      assert.deepEqual(value.scope, { kind: "restricted", clauses: [{ hallId: ids.hall }] }); throw stopped; };
    const service = createSalesQueryService({ authorization: policies(client).sales, reader: { readList: read, readDetail: read, readHistory: read, readSettlementStatistics: read, readReferences: read } });
    const input = method === "readReferences" ? { kind: "hall", search: "", page: 1, pageSize: 20 } : method === "readDetail" ? { salesId: ids.sales }
      : method === "readHistory" ? { salesId: ids.sales, page: 1, pageSize: 20 } : salesQuery;
    await assert.rejects(() => service[method](actor, input, signal()), error => error === stopped); assert.equal(reads, 1); client.done();
  }
  const deniedClient = new Client([begin(), identityStep([{ ...identity(), login_enabled: false }]), rollback()]); let businessReads = 0;
  const read = async (): Promise<never> => { businessReads++; throw new Error("No business read permitted"); };
  const inventory = createInventoryQueryService({ authorization: policies(deniedClient).inventory, reader: { readInventory: read, readCandidates: read } });
  await assert.rejects(() => inventory.readInventory(actor, { page: 1, pageSize: 100, filter: { products: [], categories: [], warehouses: [], suppliers: [], fits: [], seasons: [] } }, signal()), { code: "FORBIDDEN" });
  assert.equal(businessReads, 0); deniedClient.done();
  const productClient = new Client([begin(), identityStep(), commit()]);
  const product = createProductQueryService({ authorization: policies(productClient).products, reader: { readBasics: async value => { businessReads++; assert.deepEqual(value.grant, { productId }); productClient.done(); throw new Error("Exact target native reader"); }, readSpecifications: read, readImages: read, readImage: read }, media: null });
  await assert.rejects(() => product.readBasics(actor, { productId }, signal()), /Exact target native reader/); assert.equal(businessReads, 1);
});
test("native read authorization: inventory and ledger narrow an ALL-warehouse grant to a requested other-hall warehouse only AFTER current scope resolution", async () => {
  for (const ledger of [false, true]) {
    const client = new Client([begin(), identityStep(), warehouses(), commit()]); let reads = 0; const stopped = new Error("Synthetic scoped inventory reader boundary");
    const read = async (value: { scope: unknown }) => {
      reads++; client.done();
      assert.deepEqual(value.scope, { hallIds: ledger ? [hallB] : [hallB, ids.hall], warehouses: [expectedScope().warehouses[0]] });
      throw stopped;
    };
    if (ledger) {
      const service = createInventoryLedgerQueryService({ authorization: policies(client).inventory, reader: { readLedger: read } });
      await assert.rejects(() => service.readLedger(actor, { warehouseId: warehouseB, skuId: ids.sku, pageSize: 20, after: null }, signal()), error => error === stopped);
    } else {
      const service = createInventoryQueryService({ authorization: policies(client).inventory, reader: { readInventory: read, readCandidates: read } });
      await assert.rejects(() => service.readInventory(actor, { page: 1, pageSize: 100, filter: { products: [], categories: [],
        warehouses: [{ id: warehouseB, label: "untrusted request label" }], suppliers: [], fits: [], seasons: [] } }, signal()), error => error === stopped);
    }
    assert.equal(reads, 1);
  }
});
