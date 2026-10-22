/** Scripted client protocol only, not PostgreSQL execution. */
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPartyReadReader } from "../adapters/postgres/src/party-read-reader.ts";
import type { PartyScopedRead } from "../packages/application/src/party-read-ports.ts";
import { ids } from "./support/synthetic-fixtures.ts";
const read = (operation: "LIST" | "DETAIL" | "CANDIDATES" = "LIST", kind: "CUSTOMER" | "SUPPLIER" = "CUSTOMER"): PartyScopedRead => ({
  actor: { accountId: ids.account, hallId: ids.hall, role: "WAREHOUSE" }, signal: new AbortController().signal,
  intent: operation === "DETAIL" ? { kind, operation, id: ids.customer } : { kind, operation, query: { search: "%' OR 1=1--", enabled: operation === "CANDIDATES" ? "ENABLED" : "ALL", page: 2, pageSize: 20 } },
  grant: { kind, operation, targetId: operation === "DETAIL" ? ids.customer : null },
});
function fixture(afterQuery?: (sql: string) => void) {
  const calls: { sql: string; values: unknown[] }[] = [], releases: unknown[] = []; let connects = 0;
  let fail = "", rollbackFail = false;
  const pool = { async connect() { connects++; return { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); if (sql === fail || rollbackFail && sql === "ROLLBACK") throw Error("SYNTHETIC_SQL_FAILURE");
    afterQuery?.(sql);
    if (sql.includes("count(*)")) return { rows: [{ total: "21" }], rowCount: 1 };
    if (sql.startsWith("SELECT id")) return { rows: [{ id: ids.customer, code: "原编码", name: "原名", enabled: true, version: 1, created_at: null, updated_at: null }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }, release(error?: unknown) { releases.push(error); } }; } };
  return { reader: new PostgresPartyReadReader(pool), calls, releases, connects: () => connects, failure(sql: string, rollback = false) { fail = sql; rollbackFail = rollback; } };
}
test("party native count/page and exact detail use one RR READ ONLY snapshot with parameterized fixed table mapping", async () => {
  for (const kind of ["CUSTOMER", "SUPPLIER"] as const) {
    const f = fixture(); const page = await f.reader.search(read("CANDIDATES", kind));
    assert.equal(page.total, 21); assert.equal(page.items[0]!.createdAt, null); assert.equal(page.items[0]!.updatedAt, null);
    assert.equal(f.connects(), 1); assert.equal(f.calls[0]!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(f.calls.at(-1)!.sql, "COMMIT"); assert.equal(f.releases[0], undefined);
    for (const c of f.calls.filter(c => c.sql.startsWith("SELECT"))) {
      assert.match(c.sql, new RegExp("FROM naijue_erp\\." + kind.toLowerCase()));
      assert.equal(c.sql.includes("OR 1=1"), false); assert.equal(c.values[0], "%' OR 1=1--"); assert.equal(c.values[1], true);
    }
    assert.deepEqual(f.calls[2]!.values.slice(2), [20, 20]);
    assert.equal(f.calls.some(c => /FOR UPDATE|advisory|\b(?:INSERT|UPDATE|DELETE|sequence|receipt|audit)\b/i.test(c.sql)), false);
  }
  const d = fixture(); await d.reader.detail(read("DETAIL")); assert.deepEqual(d.calls[1]!.values, [ids.customer]); assert.doesNotMatch(d.calls[1]!.sql, /FOR UPDATE/);
});
test("party invalid grant or candidate enabled override and pre-abort are rejected before client borrowing", async () => {
  for (const value of [{ ...read(), grant: { kind: "SUPPLIER", operation: "LIST", targetId: null } },
    { ...read("CANDIDATES"), intent: { kind: "CUSTOMER", operation: "CANDIDATES", query: { search: "", enabled: "ALL", page: 1, pageSize: 20 } } }]) {
    const f = fixture(); await assert.rejects(f.reader.search(value as PartyScopedRead)); assert.equal(f.connects(), 0);
  }
  const f = fixture(), c = new AbortController(); c.abort(); await assert.rejects(f.reader.search({ ...read(), signal: c.signal })); assert.equal(f.connects(), 0);
  const between = new AbortController(), b = fixture(sql => { if (sql.includes("count(*)")) between.abort(); });
  await assert.rejects(b.reader.search({ ...read(), signal: between.signal })); assert.equal(b.calls.at(-1)!.sql, "ROLLBACK");
  assert.equal(b.calls.some(q => q.sql.startsWith("SELECT id")), false);
});
test("party read known failure rolls back, unknown COMMIT discards without retry/rollback and failed rollback remains explicit", async () => {
  const c = fixture(); c.failure("COMMIT"); await assert.rejects(c.reader.search(read())); assert.equal(c.connects(), 1);
  assert.equal(c.calls.some(q => q.sql === "ROLLBACK"), false); assert.ok(c.releases[0] instanceof Error);
  for (const rollbackFail of [false, true]) {
    const f = fixture(); f.failure("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", rollbackFail); await assert.rejects(f.reader.search(read()));
    assert.ok(f.releases[0] instanceof Error); assert.equal(f.calls.some(q => q.sql === "COMMIT"), false);
  }
  const f = fixture(); await f.reader.search(read()); const countSql = f.calls[1]!.sql;
  const known = fixture(); known.failure(countSql); await assert.rejects(known.reader.search(read())); assert.equal(known.calls.at(-1)!.sql, "ROLLBACK"); assert.equal(known.releases[0], undefined);
  const failed = fixture(); failed.failure(countSql, true); await assert.rejects(failed.reader.search(read()), AggregateError); assert.ok(failed.releases[0] instanceof Error);
});
