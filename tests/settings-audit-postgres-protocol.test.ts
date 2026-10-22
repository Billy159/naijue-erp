/** Scripted shared-driver protocol. Does not execute PostgreSQL or prove runtime ACLs. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresSettingsAuditUnitOfWork } from "../adapters/postgres/src/settings-audit-reader.ts";
import { parseSettingsAuditQuery } from "../packages/application/src/settings-audit-validation.ts";
import { actor, sid } from "./support/synthetic-fixtures.ts";
const query = parseSettingsAuditQuery({ module: "ALL", objectId: null, objectSearch: "%_'", actorSearch: "SYNTHETIC", action: "ALL", dateFrom: "2026-10-01", dateTo: "2026-10-22", page: 2, pageSize: 20 });
function setup(options: { role?: string; enabled?: boolean; employed?: string; hallEnabled?: boolean; fail?: boolean; oversized?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [], released: unknown[] = []; let connects = 0;
  const driver = new PostgresMaintenanceCommandUnitOfWork({ async connect() { connects++; return { async query(sql, values = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes("maintenance:identity")) rows = [{ account_id: actor.accountId, staff_id: sid("staff", 6), role: options.role ?? "ADMIN", login_enabled: options.enabled ?? true, employment_status: options.employed ?? "在职", hall_id: actor.hallId }];
    if (sql.includes("maintenance:hall")) rows = [{ id: actor.hallId, enabled: options.hallEnabled ?? true }];
    if (sql.includes("settings-audit:role")) rows = [{ account_id: actor.accountId, role: options.role ?? "ADMIN" }];
    if (sql.includes("settings-audit:page")) { if (options.fail) throw Error("PRIVATE_SQL"); rows = [{ total: "0", items: [], too_large: options.oversized ?? false }]; }
    return { rows, rowCount: rows.length };
  }, release(error?: unknown) { released.push(error); } }; } });
  return { driver, calls, released, connects: () => connects };
}
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
