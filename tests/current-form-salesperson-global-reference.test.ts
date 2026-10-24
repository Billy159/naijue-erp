/** Parser/scripted pg read checks only: no database, real accounts or network listener. */
import test from "node:test";
import assert from "node:assert/strict";
import { entityId } from "../packages/domain/src/values.ts";
import { parseCurrentSalesReferenceQuery } from "../packages/application/src/current-form-validation.ts";
import { createSourceConfirmedCurrentFormAuthorization } from "../packages/application/src/source-confirmed-current-form-authorization.ts";
import { PostgresCurrentFormReader } from "../adapters/postgres/src/current-form-reader.ts";
import type { PgSalesClient } from "../adapters/postgres/src/sales-unit-of-work.ts";
const accountId = entityId("account", "00000000-0000-0000-0000-00000000b021");
const staffId = entityId("staff", "00000000-0000-0000-0000-00000000b022");
const otherStaff = entityId("staff", "00000000-0000-0000-0000-00000000b023");
const hallId = entityId("hall", "00000000-0000-0000-0000-00000000b024");
const foreignHall = entityId("hall", "00000000-0000-0000-0000-00000000b025");
const methodId = entityId("paymentMethod", "00000000-0000-0000-0000-00000000b026");
const query = { kind: "salesperson" as const, hallId: null, search: "模拟", page: 2, pageSize: 20 as const };
const signal = () => new AbortController().signal;
function scripted(role: string, options: { selectedHall?: boolean; hallEnabled?: boolean; loginEnabled?: boolean } = {}) {
  const ownHall = role === "SALESPERSON" ? hallId : null;
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = [];
  const client: PgSalesClient = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("current-form:identity")) return { rows: [{ account_id: accountId, staff_id: staffId, login_enabled: options.loginEnabled ?? true,
      role, employment_status: "在职", hall_id: ownHall, native_hall_id: ownHall, hall_enabled: ownHall === null ? null : true }], rowCount: 1 };
    if (sql.includes("current-form:sales-hall")) { assert.equal(options.selectedHall, true); return { rows: [{ id: hallId, enabled: options.hallEnabled ?? true }], rowCount: 1 }; }
    if (sql.includes("current-form:count")) return { rows: [{ total: "22" }], rowCount: 1 };
    if (sql.includes("current-form:page")) return { rows: [
      { id: staffId, name: "模拟本人", code: null, hall_id: ownHall, hall_name: ownHall === null ? null : "模拟本厅", payment_method_id: null, payment_method_name: null },
      { id: otherStaff, name: "模拟跨厅员工", code: null, hall_id: foreignHall, hall_name: "模拟其他厅", payment_method_id: null, payment_method_name: null }
    ], rowCount: 2 };
    assert.ok(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "COMMIT", "ROLLBACK"].includes(sql), "Unexpected scripted read SQL");return { rows: [], rowCount: 0 };
  }, release(error) { releases.push(error); } };
  const reader = new PostgresCurrentFormReader({ async connect() { return client; } }, createSourceConfirmedCurrentFormAuthorization());
  return { reader, actor: { accountId, hallId: ownHall }, calls, releases };
}
test("staff reference parser accepts explicit null or existing nonnull hall and rejects omitted/undefined hall", () => {
  assert.deepEqual(parseCurrentSalesReferenceQuery(query), query);
  assert.deepEqual(parseCurrentSalesReferenceQuery({ ...query, hallId }), { ...query, hallId });
  const { hallId: _omitted, ...missing } = query;
  for (const input of [missing, { ...query, hallId: undefined }, { ...query, hallId: "" }])
    assert.throws(() => parseCurrentSalesReferenceQuery(input), { code: "INVALID_CURRENT_FORM_QUERY" });
});
test("other reference kinds keep their original hall rules", () => {
  for (const kind of ["customer", "warehouse", "paymentMethod", "paymentAccount"] as const) {
    const extra = kind === "paymentAccount" ? { paymentMethodId: methodId } : {};
    assert.throws(() => parseCurrentSalesReferenceQuery({ ...query, kind, ...extra }), { code: "INVALID_CURRENT_FORM_QUERY" });
    assert.deepEqual(parseCurrentSalesReferenceQuery({ ...query, kind, hallId, ...extra }), { ...query, kind, hallId, ...extra });
  }
  assert.deepEqual(parseCurrentSalesReferenceQuery({ ...query, kind: "hall" }), { ...query, kind: "hall" });
  assert.throws(() => parseCurrentSalesReferenceQuery({ ...query, kind: "hall", hallId }), { code: "INVALID_CURRENT_FORM_QUERY" });
});
test("all three original roles use shared in-job staff SQL without inventing a selected hall", async () => {
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"]) {
    const f = scripted(role), page = await f.reader.readSalesReferences(f.actor, query, signal());
    assert.equal(page.exactTotal, 22n); assert.equal(page.page, 2); assert.equal(page.pageSize, 20);
    assert.deepEqual(page.items.map(row => row.id), [staffId, otherStaff]);
    assert.equal(f.calls.some(c => c.sql.includes("current-form:sales-hall")), false);
    const count = f.calls.find(c => c.sql.includes("current-form:count"))!, selected = f.calls.find(c => c.sql.includes("current-form:page"))!;
    assert.match(count.sql, /FROM naijue_erp\.staff r LEFT JOIN naijue_erp\.hall h ON h.id = r.hall_id/);
    assert.match(count.sql, /WHERE r.employment_status = '在职' AND strpos\(lower\(r.name\), lower\(\$1::text\)\) > 0/);
    assert.doesNotMatch(count.sql, /r\.role|r\.hall_id\s*=|login_enabled|JOIN naijue_erp\.user_account/);
    assert.deepEqual(count.values, ["模拟"]); assert.deepEqual(selected.values, ["模拟", staffId, 20, 20]);
    assert.match(selected.sql, /ORDER BY \(r.id = \$2::uuid\) DESC, r.name COLLATE "C", r.id LIMIT \$3 OFFSET \$4/);
    assert.ok(f.calls.every(c => !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(c.sql))); assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.deepEqual(f.releases, [undefined]);
  }
});
test("nonnull employee queries still run the original selected-hall guard", async () => {
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"]) {
    const f = scripted(role, { selectedHall: true, hallEnabled: false });
    await assert.rejects(f.reader.readSalesReferences(f.actor, { ...query, hallId }, signal()), { code: "FORBIDDEN" });
    assert.equal(f.calls.filter(c => c.sql.includes("current-form:sales-hall")).length, 1);
    assert.equal(f.calls.some(c => c.sql.includes("current-form:count")), false);assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  }
});
test("global employee candidates retain original native role/login and own-hall authorization", async () => {
  for (const options of [{ role: "UNKNOWN", loginEnabled: true }, { role: "WAREHOUSE", loginEnabled: false }]) {
    const f = scripted(options.role, { loginEnabled: options.loginEnabled });
    await assert.rejects(f.reader.readSalesReferences(f.actor, query, signal()), { code: "FORBIDDEN" });
    assert.equal(f.calls.some(c => c.sql.includes("current-form:count")), false);assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  }
  const f = scripted("SALESPERSON");
  await assert.rejects(f.reader.readSalesReferences(f.actor, { ...query, hallId: foreignHall }, signal()), { code: "FORBIDDEN" });
  assert.equal(f.calls.some(c => c.sql.includes("current-form:count") || c.sql.includes("current-form:sales-hall")), false);
});
