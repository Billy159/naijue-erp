/** SQL/TYPESCRIPT SOURCE CONTRACTS ONLY. Not SQL parsing, migration execution, locks or integrity-engine evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const ddl = await source("adapters/postgres/migrations/0008_runtime_sparse_first_use.sql");
const prior = await source("adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql");
const transferPrior = await source("adapters/postgres/migrations/0004_transfer_runtime.sql");
const helper = await source("adapters/postgres/src/inventory-posting-balances.ts");
const application = await source("packages/application/src/inventory-posting.ts");
const importer = await source("adapters/postgres/src/inventory-cutoff-import-store.ts");
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`FUNCTION naijue_erp.${name}()`); assert.ok(start >= 0);
  const end = text.indexOf("\n$$;", start); assert.ok(end > start); return text.slice(start, end + 4);
}
test("first-use SQL source: exactly two existing guard bodies replaced, no table/field/index/trigger or business data added", () => {
  assert.deepEqual([...ddl.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.(\w+)/g)].map(row => row[1]), ["validate_sparse_balance_commit", "validate_transfer_effect"]);
  assert.deepEqual([...ddl.matchAll(/INSERT INTO ([\w.]+)/g)].map(row => row[1]), ["naijue_erp.schema_migration"]);
  assert.doesNotMatch(ddl, /\b(?:ALTER|DROP)\s+(?:TABLE|TRIGGER|INDEX|CONSTRAINT)|CREATE\s+(?:TABLE|TRIGGER|INDEX|SEQUENCE)|ADD COLUMN|GENERATED ALWAYS|\bxmin\b|txid_current|pg_current_xact_id/);
  assert.match(ddl, /VALUES \(8,/); assert.match(ddl, /SQL SOURCE ONLY, NOT ENGINE EVIDENCE/);
});
test("first-use SQL source: prior IMPORT baseline and non-first-use UPDATE logic remain equivalent", () => {
  const old = functionBody(prior, "validate_sparse_balance_commit"); const next = functionBody(ddl, "validate_sparse_balance_commit");
  const tail = "  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger";
  assert.equal(next.slice(next.indexOf(tail)), old.slice(old.indexOf(tail)));
  const update = (text: string) => text.slice(text.indexOf("  IF TG_OP = 'UPDATE' THEN"), text.indexOf("  IF r.target_type"));
  assert.equal(update(next).replace(/    -- Generic sparse first-use command integration is deliberately not enabled here.\n/, ""), update(old).replace(/    -- Generic sparse first-use command integration is deliberately not enabled here.\n/, ""));
});
test("first-use SQL source: existing transfer source/reversal logic unchanged except bounded absent-key APPROVE allowance", () => {
  const old = functionBody(transferPrior, "validate_transfer_effect"); let next = functionBody(ddl, "validate_transfer_effect");
  const start = next.indexOf("  IF NOT FOUND THEN"); const end = next.indexOf("  IF NEW.event_kind = 'UNAPPROVE' THEN", start);
  const original = "  IF NOT FOUND THEN RAISE EXCEPTION 'transfer inventory coverage is not ready' USING ERRCODE = '23514'; END IF;\n";
  next = next.slice(0, start) + original + next.slice(end); assert.equal(next, old);
  assert.match(ddl, /IF NEW.event_kind <> 'APPROVE' OR NEW.reverses_entry_id IS NOT NULL/);
});
test("first-use SQL source: exact complete publication, current operation effects, final delta/count and native receipt/audit are required", () => {
  assert.match(ddl, /NOT naijue_erp.published_inventory_key\(NEW.warehouse_id, NEW.sku_id\)/);
  assert.match(ddl, /b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'/);
  assert.match(ddl, /source_key = 'FINAL_COMPLETE_SCOPE'/);
  assert.match(ddl, /a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id/);
  assert.match(ddl, /h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED'/);
  assert.match(ddl, /operation_id <> r.id/);
  assert.match(ddl, /SELECT COALESCE\(SUM\(quantity_delta::numeric\), 0\), COUNT\(\*\) INTO total, effects FROM naijue_erp.inventory_ledger\s+WHERE operation_id = r.id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;/);
  assert.match(ddl, /final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects/);
  assert.match(ddl, /l.source_document_version IS DISTINCT FROM a.new_version OR l.posted_at IS DISTINCT FROM r.completed_at/);
  assert.doesNotMatch(ddl, /DELETE FROM naijue_erp.inventory_balance|NATIVE_OPENING_ZERO/);
});
test("first-use source: advisory key namespace/order matches importer and precedes balance row lock", () => {
  assert.match(importer, /compare\(JSON.stringify\(a\), JSON.stringify\(b\)\)/);
  assert.match(importer, /SELECT naijue_erp.inventory_key_lock\(\$1::uuid, \$2::uuid\)/);
  assert.match(helper, /JSON.stringify\(\[warehouse, sku\]\)/);
  assert.match(helper, /sort\(\(\[a\], \[b\]\) => a < b \? -1 : a > b \? 1 : 0\)/);
  assert.ok(helper.indexOf('await this.query("SELECT naijue_erp.inventory_key_lock') < helper.indexOf("FOR UPDATE OF b"));
});
test("first-use source: proof uses bounded immutable publication and exact native keys, never materializes zero during proof", () => {
  const proof = helper.slice(helper.indexOf("  async assertZero("), helper.indexOf("  assertCanAppend("));
  assert.match(proof, /r.import_batch_id = \$3::uuid/); assert.match(proof, /r.target_type = 'WAREHOUSE' AND r.target_id = w.id/);
  assert.match(proof, /r.target_type = 'SKU' AND r.target_id = s.id/); assert.match(proof, /l.warehouse_id = w.id AND l.sku_id = s.id/);
  assert.match(proof, /JOIN naijue_erp.size_group_member m ON m.size_group_id = p.size_group_id AND m.size_id = s.size_id/);
  assert.match(proof, /FOR SHARE OF w, h, s, p, c, f, m/);
  assert.doesNotMatch(proof, /INSERT INTO|UPDATE naijue|DELETE FROM|SUM\(|CROSS JOIN/);
  assert.match(helper, /schema_migration WHERE version = 8/); assert.match(helper, /c.relname = required.table_name/);
  assert.match(helper, /ON CONFLICT \(warehouse_id, sku_id\) DO NOTHING/); assert.match(helper, /result.rowCount === 1/);
  assert.doesNotMatch(helper, /ON CONFLICT[^;]+DO UPDATE|new Pool|process.env|readFile|listen\(/s);
});
test("first-use application source: optional explicit trusted capability, only real APPROVE delta version1, no version0 placeholder", () => {
  assert.match(application, /assertAbsentBalanceIsPublishedZero\?/);
  assert.match(application, /entry.eventKind === "APPROVE" && entry.reversesEntryId === null/);
  assert.match(application, /version: version\(1\)/); assert.doesNotMatch(application, /version\(0\)|putBalance\([^)]*quantity\("0"\)/);
  assert.ok(application.indexOf("await tx.appendLedger(entry)") < application.indexOf("await tx.putBalance(updated)"));
});
