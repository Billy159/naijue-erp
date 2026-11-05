/** New SQL18 projections/field coverage only. Not nonzero STAGE/PUBLISH acceptance. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { integrationSettings } from "./safety.ts";
import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import { HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS } from "./migration-manifest.ts";
import { historyClosureProjectionSpec, historyClosureProjectionRow, historyClosureRowHash, hashHistoryClosureRows } from "../../packages/application/src/history-typed-closure.ts";

const id = "00000000-0000-0000-0000-000000000001";
const exclusions: Record<string, string[]> = { native_party_import_evidence: ["creation_xid", "imported_at"], payment_method_identity: ["name", "enabled", "version"], payment_account_identity: ["name", "payment_method_id", "enabled", "version"] };
const tableName = (relation: string) => relation.replace(/_identity$/, "");
test("fresh18 genuine SQL31-relation280-column projection coverage and stage refusal boundaries", async t => {
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE, "history-closure-projection-0001-0018");
 const bytes = await readFile(new URL("../../adapters/postgres/migrations/0018_history_typed_publication.sql", import.meta.url));
 assert.equal(createHash("sha256").update(bytes).digest("hex"), HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS[17][2]);
 const database = await openFreshNativePaymentDatabase(integrationSettings(process.env));
 try {
  const pool = database.pool; await pool.query(bytes.toString("utf8"));
  const fields = new Map<string, Map<string, string>>();
  for (const spec of historyClosureProjectionSpec()) {
   const types = (await pool.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='naijue_erp' AND table_name=$1 ORDER BY ordinal_position", [tableName(spec.relation)])).rows;
   fields.set(spec.relation, new Map(types.map(r => [r.column_name as string, r.data_type as string])));
  }
  const literal = (relation: string): Record<string, unknown> => Object.fromEntries(historyClosureProjectionSpec().find(s => s.relation === relation)!.columns.map(col => {
   const type = fields.get(relation)!.get(col)!;
   const v = relation === "customer" || relation === "supplier" ? ["created_at", "updated_at"].includes(col) ? null : undefined : undefined;
   const value = v === null ? null : type === "uuid" ? id : type === "boolean" ? true : type === "integer" ? 1 : type === "bigint" ? "7" : type === "numeric" ? "7.03" : type === "date" ? "2026-10-21" : type === "timestamp with time zone" ? "2026-10-21T00:00:00.123456Z" : type === "timestamp without time zone" ? "2026-10-21T00:00:00.123456" : type === "jsonb" ? { literal: "independent synthetic" } : "literal-" + col;
   return [col, value];
  }));
  await t.test("every physical column has an explicit semantic inclusion or reviewed exclusion; SQL/app frames agree", async () => {
   let covered = 0;
   for (const spec of historyClosureProjectionSpec()) {
    const columns = fields.get(spec.relation)!;
    assert.deepEqual([...columns.keys()].sort(), [...spec.columns, ...(exclusions[spec.relation] ?? [])].sort(), spec.relation + " full physical column coverage");
    assert.deepEqual((await pool.query("SELECT naijue_erp.history_closure_projection_columns($1) value", [spec.relation])).rows[0]!.value, [...spec.columns]);
    const expected = literal(spec.relation), app = historyClosureProjectionRow(spec.relation, expected);
    const sql = (await pool.query("SELECT naijue_erp.history_closure_projection($1,$2::jsonb) value", [spec.relation, JSON.stringify(expected)])).rows[0]!.value;
    assert.deepEqual(sql, expected, spec.relation + " explicit precision/NULL/frame projection");
    assert.equal((await pool.query("SELECT naijue_erp.history_closure_projection_key($1,$2::jsonb) value", [spec.relation, JSON.stringify(expected)])).rows[0]!.value, app.key);
    const root = historyClosureRowHash(app);
    for (const col of spec.columns) {
     const type = columns.get(col), value = expected[col];
     const changed = { ...expected, [col]: value === null ? "2026-10-21T00:00:00.123457Z" : type === "uuid" ? "00000000-0000-0000-0000-000000000002" : type === "boolean" ? false : type === "integer" ? 2 : type === "bigint" ? "8" : type === "numeric" ? "7.04" : type === "date" ? "2026-10-22" : type === "timestamp with time zone" ? "2026-10-21T00:00:00.123457Z" : type === "timestamp without time zone" ? "2026-10-21T00:00:00.123457" : type === "jsonb" ? { literal: "changed synthetic" } : value + "-changed" };
     const result = (await pool.query("SELECT naijue_erp.history_closure_row_hash($1,$2,naijue_erp.history_closure_projection($1,$3::jsonb)) value", [spec.relation, app.key, JSON.stringify(changed)])).rows[0]!.value;
     assert.notEqual(result, root, spec.relation + "." + col + " must affect semantic row hash"); covered++;
    }
   }
   assert.equal(covered, 280); assert.equal(fields.size, 31);
  });
  await t.test("only declared metadata/current-payment exclusions are stable; original binding method/snapshot and wrong document identity affect hashes", async () => {
   const expected = literal("native_party_import_evidence"), row = historyClosureProjectionRow("native_party_import_evidence", expected);
   for (const metadata of [{ creation_xid: "123", imported_at: "2026-10-21T00:00:00Z" }, { creation_xid: "999", imported_at: "2027-01-01T00:00:00Z" }])
    assert.deepEqual((await pool.query("SELECT naijue_erp.history_closure_projection('native_party_import_evidence',$1::jsonb) value", [JSON.stringify({ ...expected, ...metadata })])).rows[0]!.value, row.projection);
   for (const relation of ["payment_method_identity", "payment_account_identity"]) {
    const value = { id, name: "current renamed", enabled: false, version: 17, ...(relation === "payment_account_identity" ? { payment_method_id: "00000000-0000-0000-0000-000000000099" } : {}) };
    assert.deepEqual((await pool.query("SELECT naijue_erp.history_closure_projection($1,$2::jsonb) value", [relation, JSON.stringify(value)])).rows[0]!.value, { id });
   }
   for (const relation of ["history_sales_line", "history_transfer_line", "history_sales_settlement"]) {
    const source = literal(relation), old = historyClosureProjectionRow(relation, source), changed = { ...source, header_id: "00000000-0000-0000-0000-000000000002" };
    assert.notEqual(historyClosureRowHash(old), historyClosureRowHash(historyClosureProjectionRow(relation, changed)));
   }
   await assert.rejects(pool.query("SELECT naijue_erp.history_closure_projection('import_source_row','{}'::jsonb)"), { code: "23514" });
   await assert.rejects(pool.query("SELECT naijue_erp.history_closure_projection('future_table','{}'::jsonb)"), { code: "23514" });
  });
  await t.test("independent empty stream roots and strict malformed STAGE denial; publication remains explicitly closed", async () => {
   for (const segment of ["source", "typed", "manifest"]) {
    const scope = (segment === "manifest" ? "documents" : segment) + ":" + id;
    assert.equal((await pool.query("SELECT naijue_erp.history_closure_digest($1::uuid,$2,$3) value", [id, scope, segment])).rows[0]!.value, (await hashHistoryClosureRows(scope, [])).sha256);
   }
   for (const input of [null, {}, [], { version: "HISTORY_TYPED_CLOSURE_V1", passed: true }]) await assert.rejects(pool.query("SELECT naijue_erp.assert_history_typed_closure($1::uuid,$2::jsonb,'[]'::jsonb)", [id, JSON.stringify(input)]), { code: "23514" });
   const gate = (await pool.query("SELECT prosrc FROM pg_proc WHERE oid='naijue_erp.guard_history_typed_publication()'::regprocedure")).rows[0]!.prosrc as string;
   assert.ok(gate.includes("publication not integrated"));
   assert.equal(Number((await pool.query("SELECT count(*) n FROM naijue_erp.import_history_closure_manifest")).rows[0]!.n), 0);
  });
 } finally { await database.close(); }
});
