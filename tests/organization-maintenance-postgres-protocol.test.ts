/** Real D1 driver and B05 leaf wiring with scripted PG responses; not engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresOrganizationMaintenanceReadUnitOfWork } from "../adapters/postgres/src/organization-maintenance-store.ts";
import { createOrganizationMaintenanceReadService } from "../packages/application/src/organization-maintenance-service.ts";
import type { OrganizationMaintenanceKind } from "../packages/application/src/organization-maintenance-ports.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const id = (n: number) => sid("hall", n), nativeId = id(100), reference = (n: number) => ({ id: id(n), name: `EXACT SOURCE ${n}`, enabled: true });
const query = { search: "", status: "all", hallId: null, page: 1, pageSize: 20 };
function record(kind: OrganizationMaintenanceKind): Record<string, unknown> {
  const base = { id: nativeId, version: 7, createdAt: null, updatedAt: null, kind };
  switch (kind) {
    case "HALL": return { ...base, name: "HALL", enabled: true, defaultCustomer: reference(2), defaultSalesWarehouse: { ...reference(3), hallId: id(999) } };
    case "WAREHOUSE": return { ...base, name: "WAREHOUSE", enabled: true, hall: reference(1) };
    case "STAFF": return { ...base, name: "SOURCE STAFF", hall: null, role: "WAREHOUSE", contact: null, employmentStatus: "离职",
      account: { id: id(21), loginName: "SOURCE LOGIN", loginEnabled: false, authVersion: 2, version: 3 } };
    case "ACCOUNT": return { ...base, createdAt: "2026-10-21T03:00:00.000000Z", updatedAt: "2026-10-22T03:00:00.000000Z", loginName: "SOURCE LOGIN", loginEnabled: false, authVersion: 3,
      staff: { id: id(31), name: "SOURCE STAFF", role: "WAREHOUSE", employmentStatus: "离职", hallId: null }, passwordHash: "PRIVATE_PROVIDER_FIELD" };
    case "PAYMENT_METHOD": return { ...base, name: "METHOD", enabled: true };
    case "PAYMENT_ACCOUNT": return { ...base, name: "PAYMENT ACCOUNT", enabled: true, paymentMethod: reference(41), halls: [reference(42), reference(43)] };
  }
}
function setup(kind: OrganizationMaintenanceKind, role: "ADMIN" | "WAREHOUSE" | "SALESPERSON" = "ADMIN", raw = record(kind)) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = [];
  const pool = { async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(901), login_enabled: true, employment_status: "在职", role, hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("WITH matched")) return { rows: [{ total: "1", items: [raw] }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release(error?: unknown) { releases.push(error); } }; } };
  return { calls, releases, service: createOrganizationMaintenanceReadService(new PostgresOrganizationMaintenanceReadUnitOfWork(new PostgresMaintenanceCommandUnitOfWork(pool))) };
}
test("B05 PG protocol: six native families preserve IDs/versions, unknown times, account separation and multi-hall accounts", async () => {
  for (const kind of ["HALL", "WAREHOUSE", "STAFF", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT"] as const) {
    const f = setup(kind), page = await f.service.list(actor, kind, query);
    assert.equal(page.total, 1); assert.equal(page.items[0]!.id, nativeId); assert.equal(page.items[0]!.version, 7);
    assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 1); assert.equal(f.calls[0]!.sql, "BEGIN ISOLATION LEVEL READ COMMITTED"); assert.equal(f.calls.at(-1)!.sql, "COMMIT");
    assert.ok(f.calls.every(c => !/password_hash|token_hash|auth_session|INSERT|DELETE|UPDATE naijue/.test(c.sql))); assert.deepEqual(f.releases, [undefined]);
    const item = page.items[0]!;
    if (item.kind === "ACCOUNT") { assert.equal(item.createdAt, "2026-10-21T03:00:00.000000Z"); assert.ok(!JSON.stringify(item).includes("PRIVATE_PROVIDER_FIELD")); }
    else assert.equal(item.createdAt, null);
    if (item.kind === "HALL") assert.equal(item.defaultSalesWarehouse!.hallId, id(999));
    if (item.kind === "STAFF") { assert.equal(item.employmentStatus, "离职"); assert.equal(item.account!.id, id(21)); assert.equal(item.hall, null); }
    if (item.kind === "PAYMENT_ACCOUNT") assert.deepEqual(item.halls.map(h => h.id), [id(42), id(43)]);
  }
});
test("B05 PG protocol: current WAREHOUSE role cannot read staff/accounts; denial occurs before any native settings page", async () => {
  for (const kind of ["STAFF", "ACCOUNT"] as const) {
    const f = setup(kind, "WAREHOUSE"); await assert.rejects(f.service.list(actor, kind, query), { code: "FORBIDDEN" });
    assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 0); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  }
  const f = setup("PAYMENT_ACCOUNT", "WAREHOUSE"); assert.equal((await f.service.list(actor, "PAYMENT_ACCOUNT", query)).total, 1);
});
test("B05 PG protocol: detail scope and literal search remain SQL parameters; malformed input never acquires a client", async () => {
  const f = setup("WAREHOUSE"), search = "%' OR 1=1 --";
  await f.service.list(actor, "WAREHOUSE", { ...query, search, hallId: id(1) });
  const call = f.calls.find(c => c.sql.startsWith("WITH matched"))!; assert.ok(!call.sql.includes(search)); assert.deepEqual(call.values, [search, "all", id(1), 20, 0, null]);
  const d = setup("HALL"); assert.equal((await d.service.detail(actor, "HALL", { id: nativeId }))!.id, nativeId);
  assert.equal(d.calls.find(c => c.sql.startsWith("WITH matched"))!.values.at(-1), nativeId);
  const g = setup("HALL");
  await assert.rejects(g.service.list(actor, "HALL", { ...query, page: "1" }), { code: "INVALID_ORGANIZATION_QUERY" });
  await assert.rejects(g.service.detail(actor, "HALL", { productId: nativeId }), { code: "INVALID_ORGANIZATION_QUERY" }); assert.equal(g.calls.length, 0);
});
test("B05 PG protocol: duplicate account halls and fabricated staff timestamps are rejected, not normalized", async () => {
  const duplicate = record("PAYMENT_ACCOUNT"); duplicate.halls = [reference(42), reference(42)];
  const f = setup("PAYMENT_ACCOUNT", "ADMIN", duplicate); await assert.rejects(f.service.list(actor, "PAYMENT_ACCOUNT", query), { code: "INVALID_DATABASE_VALUE" });
  const g = setup("STAFF", "ADMIN", { ...record("STAFF"), createdAt: "2026-10-22T03:00:00Z" });
  await assert.rejects(g.service.list(actor, "STAFF", query), { code: "INVALID_DATABASE_VALUE" });
});
