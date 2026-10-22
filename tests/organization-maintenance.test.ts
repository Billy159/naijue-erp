/** New hall/warehouse writes only: synthetic laws, HTTP and scripted driver/leaf protocol. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createOrganizationMaintenanceService } from "../packages/application/src/organization-maintenance-service.ts";
import type { OrganizationWriteDependencies, OrganizationWriteRecord } from "../packages/application/src/organization-maintenance-ports.ts";
import type { MaintenanceCompletion, MaintenanceReceipt } from "../packages/application/src/maintenance-commit-ports.ts";
import { createOrganizationMaintenanceHttpPlugin, createOrganizationMaintenanceReadHttpPlugin } from "../apps/api/src/organization-maintenance-http.ts";
import { PostgresOrganizationMaintenanceUnitOfWork } from "../adapters/postgres/src/organization-maintenance-store.ts";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { requireDomain } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("hall", n), hallValues = { name: "HALL", enabled: true, defaultCustomerId: null, defaultSalesWarehouseId: null }, warehouseValues = { name: "WAREHOUSE", enabled: true, hallId: id(1) };
function fixture() {
  let sequence = 100, allow = true, fault = false, locks = 0; const rows = new Map<string, OrganizationWriteRecord>(), receipts = new Map<string, MaintenanceReceipt>(), audit: MaintenanceCompletion[] = [];
  const dependencies: OrganizationWriteDependencies = { now: () => "2026-10-22T07:30:00Z", newId: kind => sid(kind, sequence++), unitOfWork: { async transaction(work) {
    const before = structuredClone(rows), prior = structuredClone(receipts), count = audit.length;
    try { return await work({ async lockTopology() { locks++; }, evidence: {
      async assertAllowed() { requireDomain(allow, "FORBIDDEN", "SYNTHETIC DENIED"); }, async getReceipt(_actor, key) { return receipts.get(key); },
      async complete(c) { if (fault) throw Error("SYNTHETIC FAULT"); const result = { operationId: c.operationId, kind: c.kind, targetId: c.targetId, version: c.newVersion }; audit.push(structuredClone(c)); receipts.set(c.requestKey, { action: c.action, requestHash: c.requestHash, completedAt: c.completedAt, result }); return result; }
    }, async load(kind, target) { const row = rows.get(target); return row?.kind === kind ? structuredClone(row) : undefined; }, async validateChange() {},
    async put(previous, next) { requireDomain(rows.get(next.id)?.version === previous?.version, "VERSION_CONFLICT", "SYNTHETIC CAS"); rows.set(next.id, structuredClone(next)); } });
    } catch (error) { rows.clear(); for (const [k, v] of before) rows.set(k, v); receipts.clear(); for (const [k, v] of prior) receipts.set(k, v); audit.length = count; throw error; }
  } } };
  return { dependencies, service: createOrganizationMaintenanceService(dependencies), rows, receipts, audit, locks: () => locks, fault: (v: boolean) => { fault = v; }, revoke: () => { allow = false; } };
}
test("organization write: new warehouse creation proof belongs to exact operation; legacy NULL remains unknown", async () => {
  const f = fixture(), c = { action: "CREATE", requestKey: "warehouse", values: warehouseValues }, saved = await f.service.execute(actor, "WAREHOUSE", c);
  const row = f.rows.get(saved.targetId)!; assert.equal(row.kind === "WAREHOUSE" && row.createdOperationId, saved.operationId); assert.equal(f.audit[0]!.afterValues.created_operation_id, saved.operationId);
  assert.deepEqual(await f.service.execute(actor, "WAREHOUSE", c), saved); assert.equal(f.audit.length, 1);
  assert.deepEqual((await f.service.receipt(actor, "WAREHOUSE", c.requestKey)).result, saved);
  const legacy: OrganizationWriteRecord = { ...warehouseValues, id: id(900), kind: "WAREHOUSE", version: 7, createdOperationId: null }; f.rows.set(legacy.id, legacy);
  await f.service.execute(actor, "WAREHOUSE", { action: "EDIT", requestKey: "legacy", id: legacy.id, expectedVersion: 7, values: { ...warehouseValues, name: "RENAMED" } });
  assert.equal((f.rows.get(legacy.id)! as Extract<OrganizationWriteRecord, { kind: "WAREHOUSE" }>).createdOperationId, null); assert.deepEqual(Object.keys(f.audit[1]!.afterValues).sort(), ["name", "version"]);
});
test("organization write: full hall save/CAS/status, exact fields and receipt faults preserve prior facts", async () => {
  const f = fixture(), saved = await f.service.execute(actor, "HALL", { action: "CREATE", requestKey: "hall", values: hallValues });
  const before = structuredClone(f.rows);
  await assert.rejects(f.service.execute(actor, "HALL", { action: "EDIT", requestKey: "stale", id: saved.targetId, expectedVersion: 2, values: hallValues }), { code: "VERSION_CONFLICT" });
  await assert.rejects(f.service.execute(actor, "WAREHOUSE", { action: "CREATE", requestKey: "many-halls", values: { ...warehouseValues, hallIds: [id(1)] } }), { code: "INVALID_ORGANIZATION_COMMAND" });
  f.fault(true); await assert.rejects(f.service.execute(actor, "HALL", { action: "DISABLE", requestKey: "fault", id: saved.targetId, expectedVersion: 1 })); assert.deepEqual(f.rows, before); assert.ok(!f.receipts.has("fault"));
  f.fault(false); await f.service.execute(actor, "HALL", { action: "DISABLE", requestKey: "disable", id: saved.targetId, expectedVersion: 1 });
  await f.service.execute(actor, "HALL", { action: "RESTORE", requestKey: "restore", id: saved.targetId, expectedVersion: 2 });
  f.revoke(); await assert.rejects(f.service.receipt(actor, "HALL", "hall"), { code: "FORBIDDEN" });
});
function protocol(options: { crossHall?: boolean; defaultEnabled?: boolean; defaultReference?: boolean; role?: string; commitFault?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let sequence = 700;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(99), login_enabled: true, employment_status: "在职", role: options.role ?? "ADMIN", hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,name,enabled,version")) return { rows: [{ id: id(10), name: "SOURCE", enabled: true, version: 3, default_customer_id: null, default_sales_warehouse_id: null, hall_id: id(1), created_operation_id: null }], rowCount: 1 };
    if (sql.startsWith("SELECT id,hall_id,enabled")) return { rows: [{ id: id(20), hall_id: options.crossHall ? id(999) : id(10), enabled: options.defaultEnabled ?? true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,enabled FROM naijue_erp.hall WHERE id=")) return { rows: [{ id: id(1), enabled: true }], rowCount: 1 };
    if (sql.startsWith("SELECT id,enabled FROM naijue_erp.hall WHERE default")) return { rows: options.defaultReference ? [{ id: id(1), enabled: true }] : [], rowCount: options.defaultReference ? 1 : 0 };
    if (sql.includes("maintenance:complete")) return { rows: [{ result_data: JSON.parse(values[7] as string) as unknown }], rowCount: 1 };
    if (sql === "COMMIT" && options.commitFault) throw Error("UNKNOWN COMMIT");
    return { rows: [], rowCount: sql.startsWith("UPDATE") || sql.startsWith("INSERT") ? 1 : 0 };
  }, release(error?: unknown) { releases.push(error); } }; } });
  return { calls, releases, service: createOrganizationMaintenanceService({ unitOfWork: new PostgresOrganizationMaintenanceUnitOfWork(driver), now: () => "2026-10-22T07:30:00Z", newId: kind => sid(kind, sequence++) }) };
}
const hallEdit = { action: "EDIT", requestKey: "hall-edit", id: id(10), expectedVersion: 3, values: { ...hallValues, name: "SOURCE", defaultSalesWarehouseId: id(20) } };
test("organization write PG protocol: default sales warehouse requires actual same hall; old read intent unaffected", async () => {
  for (const opts of [{ crossHall: true }, { defaultEnabled: false }]) { const f = protocol(opts); await assert.rejects(f.service.execute(actor, "HALL", hallEdit), { code: "ORGANIZATION_REFERENCE_UNAVAILABLE" }); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK"); assert.ok(!f.calls.some(c => c.sql.startsWith("UPDATE"))); }
  const f = protocol(); const result = await f.service.execute(actor, "HALL", hallEdit); assert.equal(result.version, 4);
  assert.equal(f.calls[1]!.values[0], "naijue:organization-topology"); assert.ok(f.calls[2]!.sql.includes("maintenance:identity"));
  assert.deepEqual(f.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.hall"))!.values, [id(10), "SOURCE", true, 4, null, id(20), 3]); assert.equal(f.calls.at(-1)!.sql, "COMMIT");
});
test("organization write PG protocol: warehouse default protection, immutable unknown creation proof and denial", async () => {
  const c = { action: "DISABLE", requestKey: "warehouse-disable", id: id(10), expectedVersion: 3 }, f = protocol({ defaultReference: true });
  await assert.rejects(f.service.execute(actor, "WAREHOUSE", c), { code: "WAREHOUSE_DEFAULT_IN_USE" }); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  const g = protocol(); await g.service.execute(actor, "WAREHOUSE", c); const update = g.calls.find(c => c.sql.startsWith("UPDATE naijue_erp.warehouse"))!;
  assert.doesNotMatch(update.sql.split(" WHERE ")[0]!, /created_operation_id=/); assert.match(update.sql, /created_operation_id IS NOT DISTINCT FROM \$6/); assert.equal(update.values[5], null);
  const h = protocol({ role: "SALESPERSON" }); await assert.rejects(h.service.execute(actor, "WAREHOUSE", c), { code: "FORBIDDEN" }); assert.ok(!h.calls.some(c => c.sql.startsWith("SELECT id,name")));
  const u = protocol({ commitFault: true }); await assert.rejects(u.service.execute(actor, "WAREHOUSE", c), /UNKNOWN COMMIT/); assert.equal(u.calls.at(-1)!.sql, "COMMIT"); assert.ok(!u.calls.some(c => c.sql === "ROLLBACK")); assert.ok(u.releases[0] instanceof Error);
});
test("organization write HTTP: command routes compose alongside frozen six-family reads, retain strict authenticated boundaries", async t => {
  const f = fixture(); let loggedIn = true; const app = Fastify({ logger: false }); t.after(() => app.close());
  const authenticate = async () => loggedIn ? actor : null;
  app.register(createOrganizationMaintenanceHttpPlugin({ authenticate, dependencies: f.dependencies }));
  app.register(createOrganizationMaintenanceReadHttpPlugin({ authenticate, unitOfWork: { async transaction(work) { return work({ evidence: { async assertAllowed() {}, async getReceipt() { return undefined; }, async complete() { throw Error("NO READ WRITE"); } }, async readList(kind, q) { return { ...q, kind, total: 0, items: [] }; }, async readDetail() { return null; } }); } } })); await app.ready();
  const payload = { action: "CREATE", requestKey: "http-hall", values: hallValues }, response = await app.inject({ method: "POST", url: "/organization/halls/commands", payload }); assert.equal(response.statusCode, 200, response.body); assert.equal(response.headers["cache-control"], "no-store");
  assert.equal((await app.inject({ method: "GET", url: "/organization/halls/receipts/http-hall" })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/organization/halls/commands", payload: { ...payload, actor } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/staff/query", payload: { search: "", status: "all", hallId: null, page: 1, pageSize: 20 } })).statusCode, 200);
  loggedIn = false; assert.equal((await app.inject({ method: "POST", url: "/organization/halls/commands", payload })).statusCode, 401); assert.equal(app.server.listening, false);
});
