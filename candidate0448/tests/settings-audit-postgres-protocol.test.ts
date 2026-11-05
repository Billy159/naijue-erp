/** Scripted shared-driver protocol. Does not execute PostgreSQL or prove runtime ACLs. */
import test from "node:test";
import assert from "node:assert/strict";
import { maintenanceContextClient, PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresSettingsAuditUnitOfWork } from "../adapters/postgres/src/settings-audit-reader.ts";
import type { SettingsAuditCoreReadCapability } from "../adapters/postgres/src/settings-audit-reader.ts";
import type { PgSalesPool } from "../adapters/postgres/src/sales-unit-of-work.ts";
import { SETTINGS_AUDIT_MODULES } from "../packages/application/src/settings-audit-ports.ts";
import { parseSettingsAuditQuery } from "../packages/application/src/settings-audit-validation.ts";
import { DomainError } from "../packages/domain/src/errors.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const query = parseSettingsAuditQuery({ module: "ALL", objectId: null, objectSearch: "%_'", actorSearch: "SYNTHETIC", action: "ALL", dateFrom: "2026-10-01", dateTo: "2026-10-22", page: 2, pageSize: 20 });
function setup(options: { role?: string; enabled?: boolean; employed?: string; hallEnabled?: boolean; fail?: boolean; oversized?: boolean; page?: { total: string; items: readonly unknown[] } } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0;
  const pool: PgSalesPool = { async connect() { connects++; return { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("maintenance:identity")) rows = [{ account_id: actor.accountId, staff_id: sid("staff", 6), role: options.role ?? "ADMIN", login_enabled: options.enabled ?? true, employment_status: options.employed ?? "在职", hall_id: actor.hallId }];
    if (sql.includes("maintenance:hall")) rows = [{ id: actor.hallId, enabled: options.hallEnabled ?? true }];
    if (sql.includes("settings-audit:role")) rows = [{ account_id: actor.accountId, role: options.role ?? "ADMIN" }];
    if (sql.includes("settings-audit:page")) { if (options.fail) throw Error("PRIVATE_SQL"); rows = [{ total: options.page?.total ?? "0", items: options.page?.items ?? [], too_large: options.oversized ?? false }]; }
    return { rows, rowCount: rows.length };
  }, release(error?: unknown) { released.push(error); } }; } };
  const driver = new PostgresMaintenanceCommandUnitOfWork(pool);
  return { driver, pool, calls, released, connects: () => connects };
}
const coreMembers = { hallIds: Array.from({ length: 22 }, (_, i) => sid("hall", 3100 + i)), warehouseIds: Array.from({ length: 22 }, (_, i) => sid("warehouse", 3200 + i)) };
test("W13 CORE ALL narrows both current roles to exact native members on the original identity-locked context and one SQL snapshot", async () => {
  for (const role of ["ADMIN", "WAREHOUSE"]) {
    const items = [{ module: "HALL", object_id: coreMembers.hallIds[0], id: sid("operation", 3300) }];
    const p = setup({ role, page: { total: "21", items } }), signal = new AbortController().signal; let checks = 0;
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady(context, current, receivedSignal) {
      checks++; assert.deepEqual(current, actor); assert.equal(receivedSignal, signal);
      assert.ok(maintenanceContextClient(context, p.pool));
      await context.client.query("/* synthetic:core-audit-proof */ SELECT 1"); return coreMembers;
    } });
    assert.equal(p.connects(), 0);
    assert.deepEqual(await reader.read(actor, query, signal), { role, total: "21", items });
    assert.equal(checks, 1); assert.equal(p.connects(), 1); assert.deepEqual(p.released, [undefined]);
    const index = (marker: string) => p.calls.findIndex(c => c.sql.includes(marker));
    assert.ok(index("administrator-lock") < index("maintenance:identity"));
    assert.ok(index("maintenance:identity") < index("settings-audit:role"));
    assert.ok(index("settings-audit:role") < index("synthetic:core-audit-proof"));
    assert.ok(index("synthetic:core-audit-proof") < index("settings-audit:page"));
    const pages = p.calls.filter(c => c.sql.includes("settings-audit:page")); assert.equal(pages.length, 1);
    const { sql, values } = pages[0]!;
    assert.deepEqual(values, [["HALL", "WAREHOUSE"], null, "%_'", "SYNTHETIC", null, "2026-10-01", "2026-10-22", 20, 20, coreMembers.hallIds, coreMembers.warehouseIds]);
    assert.match(sql, /FROM naijue_erp\.hall WHERE id=ANY\(\$10::uuid\[\]\)/);
    assert.match(sql, /FROM naijue_erp\.warehouse WHERE id=ANY\(\$11::uuid\[\]\)/);
    assert.doesNotMatch(sql, /SELECT '(?:PRODUCT|CATEGORY|COLOR|FIT|STAFF|ACCOUNT|PAYMENT_METHOD|PAYMENT_ACCOUNT|CUSTOMER|SUPPLIER)'::text AS module|is_exact_historical_customer_only/);
    assert.match(sql, /count\(\*\)::text FROM matched/); assert.match(sql, /page AS \(SELECT \* FROM matched/);
    assert.match(sql, /r\.status='COMMITTED'/); assert.match(sql, /r\.target_id=a\.object_id/);
    assert.doesNotMatch(sql, /hall_id\s*=\s*ANY/);
    assert.equal(p.calls.at(-1)!.sql, "COMMIT"); assert.ok(p.calls.every(c => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
  }
});
test("W13 CORE explicit module preserves all filters and queries out-of-member object IDs instead of manufacturing an empty page", async () => {
  for (const module of ["HALL", "WAREHOUSE"] as const) {
    const p = setup(), objectId = sid(module === "HALL" ? "hall" : "warehouse", 3400);
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() { return coreMembers; } });
    const requested = { ...query, module, objectId, action: "EDIT" as const };
    assert.deepEqual(await reader.read(actor, requested, new AbortController().signal), { role: "ADMIN", total: "0", items: [] });
    const pages = p.calls.filter(c => c.sql.includes("settings-audit:page")); assert.equal(pages.length, 1);
    const { sql, values } = pages[0]!;
    assert.deepEqual(values, [[module], objectId, "%_'", "SYNTHETIC", "EDIT", "2026-10-01", "2026-10-22", 20, 20, module === "HALL" ? coreMembers.hallIds : coreMembers.warehouseIds]);
    assert.match(sql, new RegExp(`FROM naijue_erp\\.${module === "HALL" ? "hall" : "warehouse"} WHERE id=ANY\\(\\$10::uuid\\[\\]\\)`));
    assert.doesNotMatch(sql, /\$11|UNION ALL/); assert.match(sql, /\(\$2::uuid IS NULL OR a\.object_id=\$2::uuid\)/);
    assert.match(sql, /strpos\(lower/); assert.match(sql, /\$5::text IS NULL OR a\.action=\$5/); assert.match(sql, /\$7::date\+1/);
  }
});
test("W13 CORE rejects every explicit non-core module and still denies invalid current identity before capability or page SQL", async () => {
  for (const module of SETTINGS_AUDIT_MODULES.filter(module => module !== "HALL" && module !== "WAREHOUSE")) {
    const p = setup(); let checks = 0;
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() { checks++; return coreMembers; } });
    await assert.rejects(reader.read(actor, { ...query, module }, new AbortController().signal), { code: "FORBIDDEN" });
    assert.equal(checks, 0); assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page"))); assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  for (const options of [{ role: "SALESPERSON" }, { enabled: false }, { employed: "离职" }, { hallEnabled: false }]) {
    const p = setup(options); let checks = 0;
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() { checks++; return coreMembers; } });
    await assert.rejects(reader.read(actor, query, new AbortController().signal), { code: "FORBIDDEN" });
    assert.equal(checks, 0); assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page"))); assert.deepEqual(p.released, [undefined]);
  }
});
test("W13 CORE rejects failed proof, cancellation and non-exact member scopes before page SQL without widening or fabricating results", async () => {
  const malformed: unknown[] = [undefined, null, {}, { ...coreMembers, hallIds: coreMembers.hallIds.slice(1) },
    { ...coreMembers, warehouseIds: [...coreMembers.warehouseIds.slice(1), coreMembers.warehouseIds[1]] },
    { ...coreMembers, hallIds: ["invalid", ...coreMembers.hallIds.slice(1)] }];
  for (const scope of malformed) {
    const p = setup();
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() { return scope as Awaited<ReturnType<SettingsAuditCoreReadCapability["assertReady"]>>; } });
    await assert.rejects(reader.read(actor, query, new AbortController().signal), { code: "FORBIDDEN" });
    assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page"))); assert.equal(p.calls.at(-1)!.sql, "ROLLBACK"); assert.deepEqual(p.released, [undefined]);
  }
  for (const abort of [false, true]) {
    const p = setup(), controller = new AbortController();
    const reader = new PostgresSettingsAuditUnitOfWork(p.driver, null, { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() {
      if (abort) { controller.abort(); return coreMembers; } throw new DomainError("FORBIDDEN", "Unproven original CORE receipt");
    } });
    await assert.rejects(reader.read(actor, query, controller.signal), { code: abort ? "SETTINGS_AUDIT_ABORTED" : "FORBIDDEN" });
    assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page"))); assert.equal(p.calls.at(-1)!.sql, "ROLLBACK");
  }
  const p = setup();
  for (const capability of [null, true, { profile: "ALL", async assertReady() { return coreMembers; } }, { profile: "COMMITTED_CORE_SETTINGS_V14" },
    { profile: "COMMITTED_CORE_SETTINGS_V14", async assertReady() { return coreMembers; }, extra: true }])
    assert.throws(() => new PostgresSettingsAuditUnitOfWork(p.driver, null, capability as SettingsAuditCoreReadCapability), /Explicit committed CORE settings audit capability required/);
  assert.equal(p.connects(), 0);
});
test("W13 one shared lease checks real identity before one authorized count/page statement; no writes or legacy capability probes", async () => {
  const p = setup({ role: "WAREHOUSE" }); const reader = new PostgresSettingsAuditUnitOfWork(p.driver);
  assert.equal(p.connects(), 0); const result = await reader.read(actor, query, new AbortController().signal); assert.equal(result.role, "WAREHOUSE");
  assert.equal(p.connects(), 1); assert.deepEqual(p.released, [undefined]);
  const index = (text: string) => p.calls.findIndex(c => c.sql.includes(text));
  assert.ok(index("administrator-lock") < index("maintenance:identity")); assert.ok(index("maintenance:hall") < index("settings-audit:role"));
  assert.ok(index("settings-audit:role") < index("settings-audit:page"));
  const pages = p.calls.filter(c => c.sql.includes("settings-audit:page")); assert.equal(pages.length, 1); const { sql, values } = pages[0]!;
  assert.equal((values[0] as string[]).length, 10); assert.ok(!(values[0] as string[]).includes("ACCOUNT")); assert.ok(!(values[0] as string[]).includes("STAFF"));
  assert.doesNotMatch(sql, /SELECT '(?:ACCOUNT|STAFF)'::text AS module/);
  assert.deepEqual(values.slice(1), [null, "%_'", "SYNTHETIC", null, "2026-10-01", "2026-10-22", 20, 20]);
  assert.match(sql, /count\(\*\)::text FROM matched/); assert.match(sql, /ORDER BY occurred_at DESC NULLS LAST,id DESC LIMIT \$8 OFFSET \$9/);
  assert.match(sql, /strpos\(lower/); assert.match(sql, /\$7::date\+1/); assert.match(sql, /Asia\/Shanghai/);
  assert.match(sql, /r\.target_type=a\.object_type/); assert.match(sql, /r\.result_data->>'version'=a\.new_version::text/);
  assert.doesNotMatch(sql, /is_exact_historical_customer_only|password|file_ref|request_key|request_hash|SELECT a\.\*/);
  assert.ok(p.calls.every(c => !/\b(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)));
});
test("W13 actual disabled/departed/stale-hall/salesperson and warehouse account requests stop before log SQL", async () => {
  for (const options of [{ enabled: false }, { employed: "离职" }, { hallEnabled: false }, { role: "SALESPERSON" }]) {
    const p = setup(options); await assert.rejects(new PostgresSettingsAuditUnitOfWork(p.driver).read(actor, query, new AbortController().signal), { code: "FORBIDDEN" });
    assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page"))); assert.ok(p.calls.some(c => c.sql === "ROLLBACK"));
  }
  const p = setup({ role: "WAREHOUSE" }); await assert.rejects(new PostgresSettingsAuditUnitOfWork(p.driver).read(actor, { ...query, module: "ACCOUNT" }, new AbortController().signal), { code: "FORBIDDEN" });
  assert.ok(!p.calls.some(c => c.sql.includes("settings-audit:page")));
  const stale = setup(); await assert.rejects(new PostgresSettingsAuditUnitOfWork(stale.driver).read({ ...actor, hallId: null }, query, new AbortController().signal), { code: "FORBIDDEN" });
});
test("W13 exact26 exclusion requires same-driver proof and failures/oversize abort rather than fabricating zero", async () => {
  const p = setup(); let proofs = 0;
  const reader = new PostgresSettingsAuditUnitOfWork(p.driver, { profile: "historical-customer-exact2-v26", assertVerified(target) { proofs++; assert.equal(target, p.driver); } });
  await reader.read(actor, { ...query, module: "CUSTOMER" }, new AbortController().signal); assert.equal(proofs, 1);
  assert.match(p.calls.find(c => c.sql.includes("settings-audit:page"))!.sql, /NOT naijue_erp\.is_exact_historical_customer_only\(customer\.id\)/);
  assert.throws(() => new PostgresSettingsAuditUnitOfWork(p.driver, { profile: "historical-customer-exact2-v26", assertVerified() { throw Error("WRONG_DRIVER"); } }), /WRONG_DRIVER/);
  for (const options of [{ fail: true }, { oversized: true }]) {
    const failed = setup(options); await assert.rejects(new PostgresSettingsAuditUnitOfWork(failed.driver).read(actor, query, new AbortController().signal));
    assert.equal(failed.calls.filter(c => c.sql === "ROLLBACK").length, 1); assert.equal(failed.calls.filter(c => c.sql === "COMMIT").length, 0);
  }
});
