/** SOURCE TEXT ONLY. No PostgreSQL parse/trigger/transaction/permission/concurrency execution claim. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const sql = await readFile(new URL("../adapters/postgres/migrations/0015_native_import_record_accounting.sql", import.meta.url), "utf8");
const adapter = await readFile(new URL("../adapters/postgres/src/native-import-record-accounting.ts", import.meta.url), "utf8");
test("0015 adds only private typed once-only claims and keeps original receipt/actions/result/guards untouched", () => {
  assert.deepEqual([...sql.matchAll(/CREATE TABLE naijue_erp\.(\w+)/g)].map(match => match[1]), ["import_record_accounting_claim"]);
  assert.match(sql, /PRIMARY KEY \(import_batch_id,import_record_id\)/);
  assert.match(sql, /FOREIGN KEY \(import_batch_id,import_record_id,target_type,target_id\)/);
  assert.match(sql, /operation_id uuid NOT NULL REFERENCES naijue_erp.operation_receipt\(id\) DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /REVOKE ALL ON naijue_erp.import_record_accounting_claim FROM PUBLIC/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/); assert.match(sql, /BEFORE TRUNCATE/);
  assert.doesNotMatch(sql, /DROP (?:TRIGGER|CONSTRAINT)|CREATE OR REPLACE|ALTER TABLE naijue_erp.(?:operation_receipt|audit_change|inventory_balance|inventory_ledger|import_batch)/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE FROM|INSERT INTO) naijue_erp.(?:import_record|import_record_accounting_claim|import_batch|inventory_ledger|inventory_balance)\b/);
});
test("legacy FINAL preflight holds original cutoff lock before observing or installing DDL", () => {
  const lock = sql.indexOf("SELECT naijue_erp.cutoff_import_lock();"); const preflight = sql.indexOf("DO $$"); const alter = sql.indexOf("ALTER TABLE");
  assert.ok(lock > sql.indexOf("BEGIN;") && lock < preflight && preflight < alter);
  assert.match(sql, /open legacy V2 FINAL record requires separately authorized recovery/);
  assert.match(sql, /import_accounting_final_record_consistency AFTER INSERT ON naijue_erp.import_record/);
  assert.match(sql, /a new V2 FINAL record must commit atomically/);
});
test("bootstrap starts only at zero, no migration backfill or aggregate counter repair", () => {
  assert.match(sql, /NOT EXISTS\(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id\)/);
  assert.match(sql, /b.checkpoint->>'sequence'<>'0' OR b.checkpoint->>'cursor'<>'0'/);
  assert.match(sql, /nonzero checkpoint without accounting provenance requires separately authorized recovery/);
  assert.doesNotMatch(sql, /SET checkpoint|jsonb_set|ON CONFLICT|xmin|txid_current|SECURITY DEFINER/);
  assert.match(sql, /Old V2 CHUNK\/PUBLISH writers without claims deliberately FAIL CLOSED/);
});
test("DB exact delta guard reads bounded original operation claim set and compares all4 deltas plus cursor", () => {
  assert.match(sql, /import_accounting_operation_claims[\s\S]*?\(operation_id,target_type,import_batch_id,checkpoint_sequence\)/);
  assert.match(sql, /WHERE operation_id=r.id AND target_type=kind/);
  assert.match(sql, /NEW.checkpoint->'counts'->>kind\)::bigint-\(OLD.checkpoint->'counts'->>kind\)::bigint<>actual/);
  assert.match(sql, /NEW.checkpoint->>'cursor'\)::bigint-\(OLD.checkpoint->>'cursor'\)::bigint<>total/);
  assert.match(sql, /total<1 OR total>500/); assert.match(sql, /r.action='IMPORT_PUBLISH' AND total<>1/);
  assert.match(sql, /a.old_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint/);
  assert.match(sql, /a.new_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint\+1/);
});
test("baseline/final/record/receipt ownership is reciprocal and publication is readback only", () => {
  assert.match(sql, /import_accounting_baseline_consistency AFTER INSERT ON naijue_erp.inventory_ledger/);
  assert.match(sql, /l.operation_id=r.id AND l.source_import_batch_id=b.id/);
  assert.match(sql, /q.last_operation_id=r.id/);
  assert.match(sql, /every published native record requires its original once-only accounting ownership/);
  assert.match(sql, /actual<>\(NEW.checkpoint->'counts'->>kind\)::bigint OR actual<>\(NEW.checkpoint->'expected'->>kind\)::bigint/);
  assert.match(sql, /IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1'/);
});
test("transaction-scoped adapter never owns COMMIT, rollback, receipt, audit, target creation or counter assignment", () => {
  assert.doesNotMatch(adapter, /client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)|new Pool|pool\.connect|\.release\(/);
  assert.doesNotMatch(adapter, /INSERT INTO naijue_erp.(?:import_record|inventory_ledger|inventory_balance|operation_receipt|audit_change)\b/);
  assert.doesNotMatch(adapter, /UPDATE naijue_erp|ON CONFLICT/);
  assert.match(adapter, /INSERT INTO naijue_erp.import_record_accounting_claim/);
  assert.match(adapter, /RETURNING import_batch_id,import_record_id,target_type,target_id,operation_id,checkpoint_sequence/);
  assert.match(adapter, /nativeImportAccountingRequestHash\(command\) === transaction.commandHash/);
  assert.match(adapter, /sum\(c.signed_quantity::numeric\)/); assert.doesNotMatch(adapter, /COALESCE/);
});
