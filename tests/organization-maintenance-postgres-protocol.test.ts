/** Real D1 driver and B05 leaf wiring with scripted PG responses; not engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMaintenanceCommandUnitOfWork } from "../adapters/postgres/src/maintenance-command-unit-of-work.ts";
import { PostgresOrganizationMaintenanceReadUnitOfWork } from "../adapters/postgres/src/organization-maintenance-store.ts";
import { createOrganizationMaintenanceReadService } from "../packages/application/src/organization-maintenance-service.ts";
import type { OrganizationMaintenanceKind } from "../packages/application/src/organization-maintenance-ports.ts";
import { parseOrganizationListQuery } from "../packages/application/src/organization-maintenance-validation.ts";
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
function setup(kind: OrganizationMaintenanceKind, role: "ADMIN" | "WAREHOUSE" | "SALESPERSON" = "ADMIN", raw: Record<string, unknown> | null = record(kind), total = "1") {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = [];
  const pool = { async connect() { return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql.includes("maintenance:identity")) return { rows: [{ account_id: actor.accountId, staff_id: id(901), login_enabled: true, employment_status: "在职", role, hall_id: actor.hallId }], rowCount: 1 };
    if (sql.includes("maintenance:hall")) return { rows: [{ id: actor.hallId, enabled: true }], rowCount: 1 };
    if (sql.startsWith("WITH matched")) return { rows: [{ total, items: raw === null ? [] : [raw] }], rowCount: 1 };
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

test("staff-role v1 exact5 compatibility and STAFF-only exact6 reject invalid or pending filter shapes before connection", async () => {
  assert.deepEqual(parseOrganizationListQuery(query, "STAFF"), query);
  for (const role of ["", "ADMIN", "WAREHOUSE", "SALESPERSON"])
    assert.deepEqual(parseOrganizationListQuery({ ...query, role }, "STAFF"), { ...query, role });
  const f = setup("STAFF");
  for (const input of [
    ...[null, undefined, true, [], {}, "admin", "LEGACY_ROLE", "ADMIN' OR true --"].map(role => ({ ...query, role })),
    { role: "ADMIN" }, { ...query, page: undefined, role: "ADMIN" },
    { ...query, role: "ADMIN", loginStatus: "unknown" }, { ...query, loginStatus: false }, { ...query, role: "", extra: true }
  ]) await assert.rejects(f.service.list(actor, "STAFF", input), { code: "INVALID_ORGANIZATION_QUERY" });
  for (const kind of ["HALL", "WAREHOUSE", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT"] as const)
    await assert.rejects(f.service.list(actor, kind, { ...query, role: "ADMIN" }), { code: "INVALID_ORGANIZATION_QUERY" });
  assert.equal(f.calls.length, 0);
});
test("staff-role v1 binds each existing role in matched before count/page and keeps ALL unknown roles/account NULL", async () => {
  for (const role of ["ADMIN", "WAREHOUSE", "SALESPERSON"] as const) {
    const raw = { ...record("STAFF"), role, employmentStatus: "在职", hall: reference(1), account: null };
    const f = setup("STAFF", "ADMIN", raw, "21"), search = "SOURCE %' --";
    const page = await f.service.list(actor, "STAFF", { ...query, role, search, status: "normal", hallId: id(1), page: 2 });
    assert.equal(page.total, 21); assert.equal(page.page, 2); assert.equal(page.items.length, 1);
    assert.deepEqual(page.items[0], raw);
    const call = f.calls.find(c => c.sql.startsWith("WITH matched"))!;
    assert.deepEqual(call.values, [search, "normal", id(1), 20, 20, null, role]);
    assert.match(call.sql, /AND \(\$7::text='' OR m\.role=\$7::text\)/);
    assert.ok(call.sql.indexOf("m.role=$7::text") < call.sql.indexOf("page AS"));
    assert.match(call.sql, /SELECT count\(\*\)::text FROM matched/);
    assert.match(call.sql, /ORDER BY display_name COLLATE "C",id LIMIT \$4 OFFSET \$5/);
    assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 1);
    assert.ok(!call.sql.includes(search)); assert.ok(!call.sql.includes(`'${role}'`));
    assert.ok(!/COALESCE\(a\.login_enabled|IS TRUE|IS FALSE/.test(call.sql));
  }
  const raw = { ...record("STAFF"), role: "LEGACY_ROLE_UNMAPPED", account: null };
  for (const input of [query, { ...query, role: "" }]) {
    const f = setup("STAFF", "ADMIN", raw), page = await f.service.list(actor, "STAFF", input);
    assert.deepEqual(page.items[0], raw);
    const call = f.calls.find(c => c.sql.startsWith("WITH matched"))!;
    assert.equal(call.values.length, Object.hasOwn(input, "role") ? 7 : 6);
    if (!Object.hasOwn(input, "role")) assert.ok(!call.sql.includes("$7"));
  }
});
test("staff-role v1 request role never grants ADMIN and malformed native booleans still fail", async () => {
  const denied = setup("STAFF", "WAREHOUSE");
  await assert.rejects(denied.service.list(actor, "STAFF", { ...query, role: "ADMIN" }), { code: "FORBIDDEN" });
  assert.ok(!denied.calls.some(c => c.sql.startsWith("WITH matched"))); assert.equal(denied.calls.at(-1)!.sql, "ROLLBACK");
  const raw = record("STAFF"), account = raw.account as Record<string, unknown>;
  const malformed = setup("STAFF", "ADMIN", { ...raw, account: { ...account, loginEnabled: null } });
  await assert.rejects(malformed.service.list(actor, "STAFF", { ...query, role: "" }), { code: "INVALID_DATABASE_VALUE" });
});
test("staff-search F05: one literal search matches original staff name OR the linked login name before the same count/page filters", async () => {
  const original = record("STAFF");
  for (const search of ["SOURCE STAFF", "source login", "LOGIN %_ ' OR true --"]) {
    for (const includeRole of [false, true]) {
      const f = setup("STAFF", "ADMIN", original, "21");
      const input = { ...query, search, status: "disabled", hallId: id(1), page: 2, ...(includeRole ? { role: "WAREHOUSE" } : {}) };
      const page = await f.service.list(actor, "STAFF", input); assert.equal(page.total, 21); assert.equal(page.items.length, 1); assert.deepEqual(page.items[0], original);
      const index = f.calls.findIndex(c => c.sql.startsWith("WITH matched")), call = f.calls[index]!;
      assert.ok(f.calls.slice(0, index).some(c => c.sql.includes("maintenance:identity")));
      assert.match(call.sql, /WHERE \(strpos\(lower\(m\.name\),lower\(\$1::text\)\)>0 OR strpos\(lower\(COALESCE\(a\.login_name,''\)\),lower\(\$1::text\)\)>0\) AND \(\$2::text='all'/);
      assert.deepEqual(call.values, [search, "disabled", id(1), 20, 20, null, ...(includeRole ? ["WAREHOUSE"] : [])]);
      assert.match(call.sql, /LEFT JOIN naijue_erp\.user_account a ON a\.staff_id=m\.id/);
      assert.match(call.sql, /SELECT count\(\*\)::text FROM matched/); assert.match(call.sql, /page AS \(SELECT \* FROM matched ORDER BY display_name COLLATE "C",id LIMIT \$4 OFFSET \$5\)/);
      assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 1); assert.ok(!call.sql.includes(search));
      assert.ok(!/password_hash|token_hash|auth_session|\bLIKE\b|COALESCE\(a\.login_enabled/.test(call.sql));
    }
  }
  const noAccount = { ...original, account: null }, f = setup("STAFF", "ADMIN", noAccount);
  assert.deepEqual((await f.service.list(actor, "STAFF", { ...query, search: "SOURCE STAFF" })).items, [noAccount]);
});
test("staff-search F05: account search preserves other families and pending closed never reaches page SQL", async () => {
  for (const role of ["WAREHOUSE", "SALESPERSON"] as const) {
    const denied = setup("STAFF", role); await assert.rejects(denied.service.list(actor, "STAFF", { ...query, search: "SOURCE LOGIN" }), { code: "FORBIDDEN" });
    assert.ok(!denied.calls.some(c => c.sql.startsWith("WITH matched"))); assert.equal(denied.calls.at(-1)!.sql, "ROLLBACK");
  }
  for (const kind of ["WAREHOUSE", "ACCOUNT"] as const) {
    const f = setup(kind); await f.service.list(actor, kind, { ...query, search: "SOURCE" });
    const sql = f.calls.find(c => c.sql.startsWith("WITH matched"))!.sql;
    assert.ok(!sql.includes("COALESCE(a.login_name")); assert.match(sql, new RegExp(`WHERE strpos\\(lower\\(m\\.${kind === "ACCOUNT" ? "login_name" : "name"}\\),lower\\(\\$1::text\\)\\)>0 AND`));
  }
  const f = setup("STAFF");
  await assert.rejects(f.service.list(actor, "STAFF", { ...query, search: "SOURCE LOGIN", loginStatus: "closed" }), { code: "STAFF_LOGIN_FILTER_NOT_READY" });
  assert.ok(f.calls.some(c => c.sql.includes("maintenance:identity"))); assert.ok(!f.calls.some(c => c.sql.startsWith("WITH matched")));
  assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
});

test("staff-login v1 ALL/open filters combine with original search employment hall role before exact count and page", async () => {
  const staff = record("STAFF"), account = staff.account as Record<string, unknown>;
  for (const loginStatus of ["", "open"]) for (const withRole of [false, true]) {
    const raw = loginStatus === "open" ? { ...staff, account: { ...account, loginEnabled: true } } : { ...staff, account: null };
    const f = setup("STAFF", "ADMIN", raw, "21");
    const input = { ...query, search: "LOGIN %_ ' literal", status: "disabled", hallId: id(1), page: 2, ...(withRole ? { role: "WAREHOUSE" } : {}), loginStatus };
    const result = await f.service.list(actor, "STAFF", input);
    assert.equal(result.total, 21); assert.deepEqual(result.items, [raw]);
    const index = f.calls.findIndex(c => c.sql.startsWith("WITH matched")), call = f.calls[index]!;
    assert.ok(f.calls.slice(0, index).some(c => c.sql.includes("maintenance:identity")));
    assert.deepEqual(call.values, [input.search, "disabled", id(1), 20, 20, null, ...(withRole ? ["WAREHOUSE"] : []), loginStatus]);
    const parameter = withRole ? 8 : 7;
    assert.ok(call.sql.includes(`AND ($${parameter}::text='' OR a.login_enabled IS TRUE)`));
    assert.ok(call.sql.indexOf("a.login_enabled IS TRUE") < call.sql.indexOf("page AS"));
    assert.match(call.sql, /SELECT count\(\*\)::text FROM matched/); assert.match(call.sql, /LIMIT \$4 OFFSET \$5/);
    assert.doesNotMatch(call.sql, /COALESCE\(a\.login_enabled|password_hash|token_hash/);
    assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 1); assert.deepEqual(f.releases, [undefined]);
  }
  const empty = setup("STAFF", "ADMIN", null, "21");
  const result = await empty.service.list(actor, "STAFF", { ...query, page: 3, loginStatus: "open" });
  assert.equal(result.total, 21); assert.deepEqual(result.items, []);
});
test("staff-login v1 strict STAFF-only enums preserve current ADMIN authority and legacy no-account projection", async () => {
  for (const loginStatus of [undefined, null, false, 0, "all", "enabled", "OPEN", {}, []]) {
    const f = setup("STAFF");
    await assert.rejects(f.service.list(actor, "STAFF", { ...query, loginStatus }), { code: "INVALID_ORGANIZATION_QUERY" }); assert.equal(f.calls.length, 0);
  }
  for (const kind of ["HALL", "WAREHOUSE", "ACCOUNT", "PAYMENT_METHOD", "PAYMENT_ACCOUNT"] as const) {
    const f = setup(kind); await assert.rejects(f.service.list(actor, kind, { ...query, loginStatus: "open" }), { code: "INVALID_ORGANIZATION_QUERY" }); assert.equal(f.calls.length, 0);
  }
  for (const role of ["WAREHOUSE", "SALESPERSON"] as const) for (const loginStatus of ["open", "closed"]) {
    const f = setup("STAFF", role);
    await assert.rejects(f.service.list(actor, "STAFF", { ...query, loginStatus }), { code: "FORBIDDEN" });
    assert.ok(!f.calls.some(c => c.sql.startsWith("WITH matched"))); assert.equal(f.calls.at(-1)!.sql, "ROLLBACK");
  }
  const raw = { ...record("STAFF"), account: null }, f = setup("STAFF", "ADMIN", raw);
  assert.deepEqual((await f.service.list(actor, "STAFF", query)).items, [raw]);
});

test("payment-method-filter v1 preserves exact5 and validates PAYMENT_ACCOUNT-only exact6 before connection", async () => {
  assert.deepEqual(parseOrganizationListQuery(query, "PAYMENT_ACCOUNT"), query);
  for (const paymentMethodId of [null, id(41)])
    assert.deepEqual(parseOrganizationListQuery({ ...query, paymentMethodId }, "PAYMENT_ACCOUNT"), { ...query, paymentMethodId });
  // The existing STAFF role extension is a separate accepted shape, never a combined filter.
  assert.deepEqual(parseOrganizationListQuery({ ...query, role: "WAREHOUSE" }, "STAFF"), { ...query, role: "WAREHOUSE" });
  const f = setup("PAYMENT_ACCOUNT");
  for (const paymentMethodId of [undefined, "", true, 0, [], {}, "not-uuid", "AAAAAAAA-0000-0000-0000-000000000041", "' OR true --"])
    await assert.rejects(f.service.list(actor, "PAYMENT_ACCOUNT", { ...query, paymentMethodId }), { code: "INVALID_ORGANIZATION_QUERY" });
  for (const input of [{ paymentMethodId: id(41) }, { ...query, page: undefined, paymentMethodId: null },
    { ...query, paymentMethodId: id(41), role: "ADMIN" }, { ...query, paymentMethodId: null, extra: true }])
    await assert.rejects(f.service.list(actor, "PAYMENT_ACCOUNT", input), { code: "INVALID_ORGANIZATION_QUERY" });
  for (const kind of ["HALL", "WAREHOUSE", "STAFF", "ACCOUNT", "PAYMENT_METHOD"] as const)
    await assert.rejects(f.service.list(actor, kind, { ...query, paymentMethodId: null }), { code: "INVALID_ORGANIZATION_QUERY" });
  assert.equal(f.calls.length, 0);
});
test("payment-method-filter v1 uses one matched count/page predicate after current authorization and preserves account halls", async () => {
  const raw = { ...record("PAYMENT_ACCOUNT"), enabled: false, paymentMethod: { ...reference(41), enabled: false } };
  for (const currentRole of ["ADMIN", "WAREHOUSE"] as const) {
    const f = setup("PAYMENT_ACCOUNT", currentRole, raw, "21"), search = "literal %' --";
    const page = await f.service.list(actor, "PAYMENT_ACCOUNT", { ...query, search, status: "disabled", hallId: id(42), page: 2, paymentMethodId: id(41) });
    assert.equal(page.total, 21); assert.equal(page.page, 2); assert.equal(page.items.length, 1); assert.deepEqual(page.items[0], raw);
    const index = f.calls.findIndex(c => c.sql.startsWith("WITH matched")), call = f.calls[index]!;
    assert.ok(f.calls.slice(0, index).some(c => c.sql.includes("maintenance:identity")));
    assert.deepEqual(call.values, [search, "disabled", id(42), 20, 20, null, id(41)]);
    assert.match(call.sql, /AND \(\$7::uuid IS NULL OR m\.payment_method_id=\$7::uuid\)/);
    assert.ok(call.sql.indexOf("m.payment_method_id=$7::uuid") < call.sql.indexOf("page AS"));
    assert.match(call.sql, /SELECT count\(\*\)::text FROM matched/); assert.match(call.sql, /ORDER BY display_name COLLATE "C",id LIMIT \$4 OFFSET \$5/);
    assert.match(call.sql, /EXISTS\(SELECT 1 FROM naijue_erp\.payment_account_hall/);
    assert.equal(f.calls.filter(c => c.sql.startsWith("WITH matched")).length, 1);
    assert.ok(!call.sql.includes(search)); assert.ok(!call.sql.includes(id(41))); assert.ok(!call.sql.includes("m.role=$7"));
    assert.ok(!/WHERE pm\.enabled|AND pm\.enabled/.test(call.sql));
    assert.ok(f.calls.every(c => !/password_hash|token_hash|INSERT|UPDATE naijue|DELETE FROM/.test(c.sql)));
    assert.deepEqual(f.releases, [undefined]);
  }
  for (const input of [query, { ...query, paymentMethodId: null }]) {
    const f = setup("PAYMENT_ACCOUNT"), page = await f.service.list(actor, "PAYMENT_ACCOUNT", input);
    assert.equal(page.total, 1); assert.deepEqual(page.items[0], record("PAYMENT_ACCOUNT"));
    const call = f.calls.find(c => c.sql.startsWith("WITH matched"))!;
    assert.deepEqual(call.values, ["", "all", null, 20, 0, null, ...(Object.hasOwn(input, "paymentMethodId") ? [null] : [])]);
    if (!Object.hasOwn(input, "paymentMethodId")) assert.ok(!call.sql.includes("$7"));
  }
  const missing = setup("PAYMENT_ACCOUNT", "ADMIN", null, "0");
  assert.deepEqual((await missing.service.list(actor, "PAYMENT_ACCOUNT", { ...query, paymentMethodId: id(499) })).items, []);
});
test("payment-method-filter v1 cannot bypass denial or turn malformed count/reference data into an empty success", async () => {
  const denied = setup("PAYMENT_ACCOUNT", "SALESPERSON");
  await assert.rejects(denied.service.list(actor, "PAYMENT_ACCOUNT", { ...query, paymentMethodId: id(41) }), { code: "FORBIDDEN" });
  assert.ok(!denied.calls.some(c => c.sql.startsWith("WITH matched"))); assert.equal(denied.calls.at(-1)!.sql, "ROLLBACK");
  for (const f of [setup("PAYMENT_ACCOUNT", "ADMIN", record("PAYMENT_ACCOUNT"), "0"),
    setup("PAYMENT_ACCOUNT", "ADMIN", { ...record("PAYMENT_ACCOUNT"), paymentMethod: null })])
    await assert.rejects(f.service.list(actor, "PAYMENT_ACCOUNT", { ...query, paymentMethodId: null }), { code: "INVALID_DATABASE_VALUE" });
});
