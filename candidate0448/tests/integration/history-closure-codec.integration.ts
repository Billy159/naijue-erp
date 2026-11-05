/** Genuine SQL18 codec only. No closure STAGE or publication success is claimed. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { integrationSettings } from "./safety.ts";
import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import { HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS } from "./migration-manifest.ts";
import { encodeHistoryClosureValue, historyClosureRowHash, hashHistoryClosureRows } from "../../packages/application/src/history-typed-closure.ts";

test("fresh18 SQL codec matches independent literal goldens; incomplete publication remains closed", async t => {
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE, "history-closure-codec-0001-0018");
 const source = await readFile(new URL("../../adapters/postgres/migrations/0018_history_typed_publication.sql", import.meta.url));
 assert.equal(createHash("sha256").update(source).digest("hex"), HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS[17][2], "DDL18 exact pin before pool");
 const database = await openFreshNativePaymentDatabase(integrationSettings(process.env));
 try {
  const pool = database.pool;
  await pool.query(source.toString("utf8"));
  assert.deepEqual((await pool.query("SELECT version FROM naijue_erp.schema_migration ORDER BY version")).rows.map(r => r.version), Array.from({ length: 18 }, (_, i) => i + 1));
  await t.test("UTF8 byte order, framed scalars and nested object bytes exactly match application", async () => {
   for (const value of [null, true, false, 0, -9007199254740991, 9007199254740991, "9007199254740992", "7.03", "", { 中: [null, true, "", 1], a: "\n" }, { "\u{10000}": "astral", "\ue000": "bmp" }, { raw: { unknown: null }, normalized: { value: "" }, source: "original" }]) {
    const actual = (await pool.query("SELECT naijue_erp.history_closure_encode($1::jsonb) value", [JSON.stringify(value)])).rows[0]!.value;
    assert.deepEqual(actual, encodeHistoryClosureValue(value));
   }
   // JSONB deliberately normalizes number spellings; raw application ingress rejects -0 before clone.
   assert.equal((await pool.query("SELECT convert_from(naijue_erp.history_closure_encode('1.00'::jsonb),'UTF8') value")).rows[0]!.value, "i1;");
  });
  await t.test("independent Python row, ordered fold, final and empty golden bytes survive actual SQL", async () => {
   const rows = [{ relation: "source", key: "a", projection: { source: "a", amount: "7.03" } }, { relation: "typed", key: "b", projection: { source: "a", account: "accountA", method: "methodB" } }];
   const expected = ["0df99a3deb3a6a2334cf0d202c48904f307d314fb5373663a296f7c1492a8b0c", "2c208f70ba40d3e9f2e0c13467e5826ba43f85d90add796bee3652027dc384b3"];
   let state = (await pool.query("SELECT naijue_erp.history_closure_seed($1) value", ["document:SALE:one"])).rows[0]!.value as Buffer;
   const empty = state;
   for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const hash = (await pool.query("SELECT naijue_erp.history_closure_row_hash($1,$2,$3::jsonb) value", [row.relation, row.key, JSON.stringify(row.projection)])).rows[0]!.value;
    assert.equal(hash, expected[i]); assert.equal(hash, historyClosureRowHash(row));
    state = (await pool.query("SELECT naijue_erp.history_closure_fold($1::bytea,$2) value", [state, hash])).rows[0]!.value;
   }
   const full = (await pool.query("SELECT naijue_erp.history_closure_finish($1,$2::bigint,$3::bytea) value", ["document:SALE:one", 2, state])).rows[0]!.value;
   assert.equal(full, "d3c2de5c281251c525e7525d9029693ce517f8dec4d946e5b65ddd054ce11eb6");
   assert.equal(full, (await hashHistoryClosureRows("document:SALE:one", rows)).sha256);
   assert.equal((await pool.query("SELECT naijue_erp.history_closure_finish($1,0,$2::bytea) value", ["document:SALE:one", empty])).rows[0]!.value, "4ea9beaa7fe64995cf45574a469c3727130ca02922abd1180f94b6712d4b5b23");
  });
  await t.test("SQL rejects unsafe/fractional numeric, SQL NULL, depth and byte overflow; UTF8 identity bounds agree", async () => {
   for (const json of ["9007199254740992", "1.01", JSON.stringify("x".repeat(4 * 1024 * 1024)), "[".repeat(65) + "0" + "]".repeat(65)])
    await assert.rejects(pool.query("SELECT naijue_erp.history_closure_encode($1::jsonb)", [json]), { code: "23514" });
   await assert.rejects(pool.query("SELECT naijue_erp.history_closure_encode(NULL::jsonb)"), { code: "23514" });
   const long = "中".repeat(21846);
   await assert.rejects(pool.query("SELECT naijue_erp.history_closure_row_hash('source',$1,'{}'::jsonb)", [long]), { code: "23514" });
   assert.throws(() => historyClosureRowHash({ relation: "source", key: long, projection: {} }), { code: "INVALID_HISTORY_CLOSURE_ENCODING" });
   await assert.rejects(hashHistoryClosureRows(long, []), { code: "INVALID_HISTORY_CLOSURE_ENCODING" });
   for (const [state, hash] of [[Buffer.alloc(31), "a".repeat(64)], [Buffer.alloc(32), "A".repeat(64)]])
    await assert.rejects(pool.query("SELECT naijue_erp.history_closure_fold($1::bytea,$2)", [state, hash]), { code: "23514" });
  });
  await t.test("exact count maps reject missing/extra/noninteger; new tables empty, immutable triggers and closed gates exist", async () => {
   for (const [value, expected] of [[{ a: 0, b: 2 }, true], [{ a: 0 }, false], [{ a: 0, b: 2, c: 0 }, false], [{ a: -1, b: 0 }, false], [{ a: 0.2, b: 0 }, false], [{ a: "0", b: 0 }, false], [null, false], [[], false]] as const) {
    assert.equal((await pool.query("SELECT naijue_erp.history_closure_count_map($1::jsonb,ARRAY['a','b']) value", [JSON.stringify(value)])).rows[0]!.value, expected);
   }
   assert.deepEqual((await pool.query("SELECT (SELECT count(*) FROM naijue_erp.import_history_closure_manifest)::integer manifests,(SELECT count(*) FROM naijue_erp.import_history_document_manifest)::integer documents")).rows, [{ manifests: 0, documents: 0 }]);
   const triggers = (await pool.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid IN('naijue_erp.import_history_closure_manifest'::regclass,'naijue_erp.import_history_document_manifest'::regclass) AND NOT tgisinternal ORDER BY tgname")).rows;
   assert.equal(triggers.length, 7); assert.ok(triggers.every(r => r.tgenabled === "O"));
   const gates = (await pool.query("SELECT proname,prosrc FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND proname IN('validate_history_closure_commit','guard_history_typed_publication')")).rows;
   assert.equal(gates.length, 2);
   assert.ok(String(gates.find(r => r.proname === "validate_history_closure_commit")!.prosrc).includes("assert_history_typed_closure"), "Successor STAGE commit must rerun complete SQL closure readback");
   assert.ok(String(gates.find(r => r.proname === "guard_history_typed_publication")!.prosrc).includes("not integrated"), "Publication refusal retained");
   const publicAcl = (await pool.query("SELECT count(*)::integer n FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid IN('naijue_erp.import_history_closure_manifest'::regclass,'naijue_erp.import_history_document_manifest'::regclass) AND a.grantee=0")).rows[0]!.n;
   assert.equal(publicAcl, 0);
  });
 } finally { await database.close(); }
});
