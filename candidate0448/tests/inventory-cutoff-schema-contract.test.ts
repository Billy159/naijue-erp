/** SQL TEXT CONTRACTS ONLY. Do not interpret these as parsed/executed PostgreSQL proof. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const ddl = await readFile(new URL("../adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql", import.meta.url), "utf8");
const adapter = await readFile(new URL("../adapters/postgres/src/inventory-cutoff-import-store.ts", import.meta.url), "utf8");
const reader = await readFile(new URL("../adapters/postgres/src/inventory-cutoff-scope-reader.ts", import.meta.url), "utf8");
const priorTransferDdl = await readFile(new URL("../adapters/postgres/migrations/0004_transfer_runtime.sql", import.meta.url), "utf8");
function columns(name: string): string[] {
  const start = ddl.indexOf(`CREATE TABLE naijue_erp.${name} (`); assert.ok(start >= 0); const end = ddl.indexOf("\n);", start); assert.ok(end > start);
  return [...ddl.slice(start, end).matchAll(/\b(\w+)\s+(?:uuid|text|jsonb|timestamptz)\b/g)].map(match => match[1]!).sort();
}
test("cutoff SQL text: only the two already approved import tables and three approved provenance columns are added", () => {
  assert.deepEqual([...ddl.matchAll(/CREATE TABLE naijue_erp\.(\w+)/g)].map(m => m[1]), ["import_batch", "import_record"]);
  assert.deepEqual(columns("import_batch"), ["id", "source_name", "source_manifest_ref", "source_hash", "cutoff_at", "mapping_version", "inventory_mode", "status", "checkpoint", "created_at", "completed_at"].sort());
  assert.deepEqual(columns("import_record"), ["id", "import_batch_id", "source_entity_type", "source_key", "source_record_hash", "source_file_ref", "target_type", "target_id", "status", "decision_reason", "reviewed_at"].sort());
  assert.deepEqual([...ddl.matchAll(/ADD COLUMN (\w+)/g)].map(m => m[1]), ["import_batch_id", "import_batch_id", "source_import_batch_id"]);
  assert.doesNotMatch(ddl, /baseline_entry_id|NATIVE_OPENING_ZERO|GENERATED ALWAYS|CREATE (?:SEQUENCE|SCHEMA)/);
  assert.deepEqual([...ddl.matchAll(/INSERT INTO ([\w.]+)/g)].map(m => m[1]), ["naijue_erp.schema_migration"]);
});
test("cutoff SQL text: used zero balances are retained by append-only ledger and a deferred noncascading composite FK", () => {
  assert.match(ddl, /ledger_retains_balance FOREIGN KEY \(warehouse_id, sku_id\)[\s\S]*?REFERENCES naijue_erp.inventory_balance \(warehouse_id, sku_id\) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/);
  assert.match(ddl, /inventory balances are retained, including zero/);
  assert.doesNotMatch(ddl, /DROP TRIGGER immutable_ledger|ON DELETE CASCADE|ALTER TABLE naijue_erp.inventory_balance.*ADD COLUMN/);
  assert.match(ddl, /fresh baseline balance requires its exact nonzero real import effect/);
  assert.match(ddl, /import receipt requires exact bounded baseline effect set/);
  assert.doesNotMatch(ddl, /sum\(quantity_delta|all_total|all_effects/);
  assert.doesNotMatch(ddl, /\bxmin\b|pg_current_xact_id|txid_current/);
});
test("cutoff SQL text: complete publication is explicit, per-key and serializes the initial takeover", () => {
  assert.match(ddl, /import_one_published_cutoff[^;]+WHERE status = 'IMPORTED'/);
  assert.match(ddl, /COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS/);
  assert.match(ddl, /LOCK TABLE naijue_erp.warehouse, naijue_erp.sku IN SHARE MODE/);
  assert.match(ddl, /q.quantity IS DISTINCT FROM l.quantity_delta OR q.version IS DISTINCT FROM 1/);
  assert.match(ddl, /cutoff_import_lock/); assert.match(ddl, /immutable_import_record BEFORE UPDATE OR DELETE/);
  assert.match(ddl, /prior.source_name = b.source_name AND r.source_entity_type = NEW.source_entity_type AND r.source_key = NEW.source_key/);
  assert.match(ddl, /validate_import_publish\(NEW.id, NEW.checkpoint\)/);
});
test("cutoff SQL text: IMPORT is a native closed target and sources/checkpoints/evidence must commit together", () => {
  assert.match(ddl, /target_type = 'IMPORT' AND action IN \('IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH'\)/);
  assert.match(ddl, /SELECT \* INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.target_id/);
  assert.match(ddl, /a.object_type <> 'IMPORT' OR a.object_id <> b.id/);
  assert.match(ddl, /invalid monotonic bounded source progress/);
  const checkpointGuard = ddl.slice(ddl.indexOf('CREATE FUNCTION naijue_erp.validate_import_batch_commit()'), ddl.indexOf('CREATE FUNCTION naijue_erp.validate_import_operation()'));
  assert.doesNotMatch(checkpointGuard, /count\(\*\).*FROM naijue_erp.import_record/s);
  assert.doesNotMatch(ddl, /DROP CONSTRAINT receipt_requires_same_kind_audit|DROP CONSTRAINT audit_receipt_kind_coherence/);
});
test("cutoff SQL text: source/import adapter cannot overwrite balances/documents or generate Cartesian zero facts", () => {
  assert.match(adapter, /INSERT INTO naijue_erp.inventory_balance/);
  assert.doesNotMatch(adapter, /UPDATE naijue_erp.inventory_balance|ON CONFLICT|INSERT INTO naijue_erp.(?:sales_header|transfer_header)|CROSS JOIN|new Pool|process.env|readFile|listen\(/);
  assert.match(adapter, /BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(adapter, /checkpoint->>'sequence' = \$5 AND checkpoint->>'cursor' = \$6/);
  assert.match(reader, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.doesNotMatch(reader, /source_file_ref|source_key|FROM naijue_erp.inventory_ledger|CROSS JOIN|readFile/);
});
test("cutoff SQL text: historical first-version headers/details stay frozen and native first-use commands are not silently opened", () => {
  assert.match(ddl, /historical command integration not implemented/);
  assert.match(ddl, /sales_cutoff_line_freeze BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(ddl, /sales_cutoff_settlement_freeze BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(ddl, /event_kind IN \('APPROVE', 'UNAPPROVE'\) AND source_import_batch_id IS NULL/);
});
test("cutoff composed SQL text: 0004 native source receipt guard is retained but excludes NULL-source cutoff baselines", () => {
  assert.match(priorTransferDdl, /ELSE\s+SELECT transfer_id INTO STRICT owner_id FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id/);
  assert.match(priorTransferDdl, /CREATE CONSTRAINT TRIGGER ledger_receipt_source_coherence AFTER INSERT ON naijue_erp.inventory_ledger\s+DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_ledger_receipt_source\(\);/);
  assert.match(ddl, /DROP TRIGGER ledger_receipt_source_coherence ON naijue_erp.inventory_ledger;/);
  const native = /CREATE CONSTRAINT TRIGGER ledger_receipt_source_coherence AFTER INSERT ON naijue_erp.inventory_ledger\s+DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN \(NEW.event_kind IN \('APPROVE', 'UNAPPROVE'\)\)\s+EXECUTE FUNCTION naijue_erp.validate_ledger_receipt_source\(\);/;
  const baseline = /CREATE CONSTRAINT TRIGGER baseline_source_final_consistency AFTER INSERT ON naijue_erp.inventory_ledger\s+DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN \(NEW.event_kind = 'CUTOFF_BASELINE'\)\s+EXECUTE FUNCTION naijue_erp.validate_baseline_source_commit\(\);/;
  assert.match(ddl, native); assert.match(ddl, baseline);
  assert.doesNotMatch(ddl, /(?:CREATE|REPLACE) FUNCTION naijue_erp.validate_ledger_receipt_source\(/);
  // Closed event CHECK + disjoint dispatch means native effects retain their original
  // receipt-source guard and baseline effects select only the native import proof.
  const nativeGate = ddl.match(native)![0].match(/WHEN \(NEW.event_kind IN \(([^)]+)\)\)/)![1]!;
  const nativeKinds = new Set([...nativeGate.matchAll(/'([^']+)'/g)].map(match => match[1]));
  const baselineKind = ddl.match(baseline)![0].match(/WHEN \(NEW.event_kind = '([^']+)'\)/)![1];
  for (const eventKind of ["APPROVE", "UNAPPROVE", "CUTOFF_BASELINE"]) {
    const selected = [nativeKinds.has(eventKind) ? "native-receipt-source" : null, baselineKind === eventKind ? "import-proof" : null].filter(value => value !== null);
    assert.deepEqual(selected, [eventKind === "CUTOFF_BASELINE" ? "import-proof" : "native-receipt-source"]);
  }
});
test("cutoff SQL text: bounded checkpoint lookup uses an IMPORT partial unique version index without casting indexed columns", () => {
  assert.match(ddl, /CREATE UNIQUE INDEX audit_import_checkpoint_version ON naijue_erp.audit_change \(object_id, new_version\) WHERE object_type = 'IMPORT';/);
  assert.match(ddl, /WHERE object_type = 'IMPORT' AND object_id = NEW.id\s+AND new_version = \(\(NEW.checkpoint->>'sequence'\)::bigint \+ 1\)::integer;/);
  assert.doesNotMatch(ddl, /AND new_version::bigint =/);
});
