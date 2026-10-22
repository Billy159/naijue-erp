/** Genuine runtime guard metadata/negative DDL in a NEW synthetic database, not nonzero STAGE/PUBLISH. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { integrationSettings } from "./safety.ts";
import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import { HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS } from "./migration-manifest.ts";
import { assertNativeImportAccountingGuards, NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import type { PgSalesClient } from "../../adapters/postgres/src/sales-unit-of-work.ts";
test("fresh18 exact runtime capability includes original metadata guards and fails closed under DDL corruption", async t => {
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE, "history-closure-runtime-0001-0018");
 const bytes = await readFile(new URL("../../adapters/postgres/migrations/0018_history_typed_publication.sql", import.meta.url));
 assert.equal(createHash("sha256").update(bytes).digest("hex"), HISTORY_TYPED_CLOSURE_SCHEMA18_MIGRATIONS[17][2]);
 const pins = JSON.parse(await readFile(new URL("../support/history18-routine-source-pins.json", import.meta.url), "utf8")) as { ddl18Sha256: string; functions: { signature: string; md5: string; searchPath: string; language: string; volatile: string; definer: boolean; public: boolean }[] };
 assert.equal(pins.ddl18Sha256, createHash("sha256").update(bytes).digest("hex"));
 const database = await openFreshNativePaymentDatabase(integrationSettings(process.env));
 try {
  const pool = database.pool; await pool.query(bytes.toString("utf8"));
  const client = await pool.connect();
  try {
   await t.test("exact40 source-body/language/searchpath/security/PUBLIC pins, complete runtime guards true", async () => {
    assert.equal(pins.functions.length, 40);
    for (const p of pins.functions) {
     const row = (await client.query("SELECT md5(prosrc) body_md5,l.lanname language,provolatile::text volatility,prosecdef definer,regexp_replace(proconfig[1],'[[:space:]]','','g') search_path FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure($1)", ["naijue_erp." + p.signature])).rows[0];
     assert.deepEqual(row, { body_md5: p.md5, language: p.language, volatility: p.volatile, definer: p.definer, search_path: p.searchPath }, p.signature);
    }
    await assertNativeImportAccountingGuards(client);
   });
   const corrupt = async (sql: string) => {
    await client.query("BEGIN");
    try { await client.query(sql); await assert.rejects(assertNativeImportAccountingGuards(client), { code: "NATIVE_IMPORT_GUARDS_NOT_READY" }); }
    finally { await client.query("ROLLBACK"); }
    await assertNativeImportAccountingGuards(client);
   };
   await t.test("disabled new and original metadata immutable triggers refuse; rollback restores exact capability", async () => {
    for (const [table, trigger] of [["import_history_closure_manifest", "history_closure_complete"], ["import_history_document_manifest", "history_document_closure_immutable"], ["native_party_import_evidence", "native_party_import_intent_guard"], ["native_party_import_evidence", "native_party_import_commit"], ["native_party_import_evidence", "native_party_import_evidence_no_truncate"]]) await corrupt(`ALTER TABLE naijue_erp.${table} DISABLE TRIGGER ${trigger}`);
   });
   await t.test("missing same-batch source FK, altered routine body/searchpath and lost original public helper execute refuse", async () => {
    const fk = (await client.query("SELECT conname FROM pg_constraint WHERE conrelid='naijue_erp.import_history_document_manifest'::regclass AND confrelid='naijue_erp.import_source_row'::regclass AND contype='f'")).rows;
    assert.equal(fk.length, 1); const name = fk[0]!.conname as string; assert.match(name, /^[a-z0-9_]+$/);
    await corrupt(`ALTER TABLE naijue_erp.import_history_document_manifest DROP CONSTRAINT ${name}`);
    await corrupt("CREATE OR REPLACE FUNCTION naijue_erp.history_closure_seed(scope text) RETURNS bytea LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$ BEGIN RETURN decode(repeat('00',32),'hex'); END; $$");
    await corrupt("ALTER FUNCTION naijue_erp.guard_native_party_import_intent() SET search_path=public");
    await corrupt("REVOKE EXECUTE ON FUNCTION naijue_erp.is_native_party_import_insert(text,jsonb) FROM PUBLIC");
   });
   await t.test("unknown19 and missing migration cannot be accepted as maxVersion; no source/closure/stock writes", async () => {
    await corrupt("INSERT INTO naijue_erp.schema_migration(version,description) VALUES(19,'synthetic unsupported future19')");
    await corrupt("DELETE FROM naijue_erp.schema_migration WHERE version=16");
    for (const table of ["import_source_row", "import_history_closure_manifest", "import_history_document_manifest", "inventory_ledger", "inventory_balance"])
     assert.equal(Number((await client.query(`SELECT count(*) n FROM naijue_erp.${table}`)).rows[0]!.n), 0);
    const present = (await client.query(NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY)).rows[0]!.accounting_guards_present; assert.equal(present, true);
   });
  } finally { client.release(); }
 } finally { await database.close(); }
});
