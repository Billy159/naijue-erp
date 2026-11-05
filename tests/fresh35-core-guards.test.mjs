import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  FRESH35_CORE_GUARD_SOURCES, FRESH35_CORE_GUARD_REPLACEMENTS,
  specializeFresh35CoreGuardSources, loadFresh35CoreGuardPlan, renderFresh35CoreGuards,
} from '../scripts/release/unified-install/fresh35-core-guards.mjs';
import { loadWholeCatalogSpec } from '../scripts/release/unified-install/whole-catalog-gate.mjs';
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from '../scripts/release/unified-install/legacy-dependency-source-report.mjs';
import { WHOLE_INSTALL_PATCHES } from '../scripts/release/unified-install/render-whole-package-local.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const sources = await Promise.all(FRESH35_CORE_GUARD_SOURCES.map(async pin => ({ path: pin.path, sql: await read(pin.path) })));
const plan = await loadFresh35CoreGuardPlan(root);
const byName = name => plan.find(item => item.name === name);
const sql = await read('adapters/postgres/patches/0027_fresh35_core_guards_successor.sql');

test('ten retained trigger functions have exact predecessors, immutable successors and documented disposition', async () => {
  assert.equal(plan.length, 10);
  assert.equal(new Set(plan.map(item => item.signature)).size, 10);
  const spec = await loadWholeCatalogSpec(root);
  for (const item of plan) {
    assert.equal(item.return_type, 'trigger');
    assert.equal(hash(item.before_body), item.before_sha256);
    assert.equal(hash(item.body), item.after_sha256);
    assert.equal(spec.pins.find(pin => pin.signature === item.signature).sha256, item.before_sha256);
    assert.notEqual(item.before_sha256, item.after_sha256);
    assert.equal(item.disposition, 'RETAIN_CORE_TRIGGER_FAIL_CLOSED_RETIRED_LANE');
    assert.ok(item.preservedChecks.length && item.retiredChecks.length);
    assert.ok(Object.isFrozen(item) && Object.isFrozen(item.preservedChecks));
  }
});

test('successors have no retired relation, rowtype, cast or legacy helper dependencies', () => {
  for (const item of plan) {
    for (const table of LEGACY_RETIREMENT_CANDIDATE_TABLES) {
      assert.doesNotMatch(item.body, new RegExp('\\bnaijue_erp\\.' + table + '\\b'), item.name + ':' + table);
    }
    assert.doesNotMatch(item.body, /naijue_erp\.(assert_core_initialization_v14|assert_barcode_scheme_initialization_v19|assert_native_bootstrap_accounts)\s*\(/);
    assert.match(item.body, /RAISE EXCEPTION/);
    assert.doesNotMatch(item.body, /^\s*BEGIN\s+RETURN (?:NULL|NEW);\s*END;?\s*$/i);
  }
});

test('sparse inventory successor changes only historical dispatch; all ordinary checks are byte-identical', () => {
  const item = byName('validate_sparse_balance_commit');
  const start = item.before_body.indexOf("  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN");
  const end = item.before_body.indexOf("  IF TG_OP = 'UPDATE' THEN", start);
  assert.ok(start > 0 && end > start);
  assert.equal(item.body.slice(0, start), item.before_body.slice(0, start));
  assert.ok(item.body.endsWith(item.before_body.slice(end)));
  const replaced = item.body.slice(start, -item.before_body.slice(end).length);
  assert.match(replaced, /RAISE EXCEPTION 'FRESH35_HISTORICAL_BALANCE_RETIRED'/);
  assert.doesNotMatch(replaced, /RETURN/);
  for (const marker of ['STANDARD_MISSING_BALANCE_IS_UNKNOWN', 'STANDARD_EXPLICIT_ZERO_BALANCE_INVALID', 'STANDARD_FIRST_BALANCE_REQUIRES_PROVEN_ZERO_OR_NATIVE_CREATION', 'first native balance requires exact native receipt and audit', 'first native balance must equal exact cumulative operation delta and effect count', 'fresh baseline balance requires its exact nonzero real import effect']) assert.ok(item.body.includes(marker), marker);
});

test('all historical lanes explicitly reject, including mixed transition sets and disguised historical IDs', () => {
  const row = byName('guard_history_numeric_ledger').body;
  const statement = byName('history_numeric_ledger_set_guard').body;
  for (const body of [row, statement]) {
    for (const field of ['source_history_revision_id', 'source_history_sales_line_id', 'source_history_transfer_line_id']) assert.ok(body.includes(field + ' IS NOT NULL'));
    assert.ok(body.indexOf('RAISE EXCEPTION') < body.lastIndexOf('RETURN'));
    assert.match(body, /event_kind='HISTORY_REVISION'/);
  }
  assert.match(statement, /IF EXISTS\(SELECT 1 FROM history_new/);
  assert.doesNotMatch(statement, /IF NOT EXISTS[\s\S]*?RETURN NULL/);
  for (const name of ['validate_history_numeric_receipt_commit', 'validate_history_numeric_balance_commit']) {
    const body = byName(name).body;
    assert.match(body, /IN \('HISTORY_SALES','HISTORY_TRANSFER'\)/);
    assert.match(body, /action='HISTORY_REVISE'/);
    assert.ok(body.indexOf('RAISE EXCEPTION') < body.lastIndexOf('RETURN'));
  }
  assert.match(byName('validate_history_numeric_balance_commit').body, /SELECT \* INTO STRICT r FROM naijue_erp\.operation_receipt WHERE id=NEW\.last_operation_id/);
});

test('standard batch and operation proof branches are preserved, document conversion stays guarded, legacy fallback fails', () => {
  const batch = byName('validate_import_batch_commit');
  const prefix = batch.before_body.slice(0, batch.before_body.indexOf("  IF TG_OP='UPDATE' THEN"));
  assert.ok(batch.body.startsWith(prefix));
  assert.match(batch.body, /assert_document_conversion_batch\(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb\(OLD\) ELSE NULL END,TG_OP,true\)/);
  assert.match(batch.body, /FRESH35_LEGACY_IMPORT_BATCH_RETIRED/);
  const checkpoint = byName('validate_import_accounting_checkpoint_commit').body;
  for (const marker of ['STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS', 'assert_standard_import_operation(core_operation)', 'assert_document_conversion_batch', 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED']) assert.ok(checkpoint.includes(marker));
  const operation = byName('validate_import_operation');
  assert.ok(operation.body.includes("IF NEW.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN PERFORM naijue_erp.assert_standard_import_operation(NEW.id); RETURN NULL; END IF;"));
  assert.match(operation.body, /FRESH35_LEGACY_IMPORT_OPERATION_RETIRED/);
  assert.equal((operation.body.match(/RETURN NULL;/g) ?? []).length, 1);
});

test('accounting successors require standard retained source proofs, exact operation and original final approval identities', () => {
  const baseline = byName('validate_import_accounting_baseline_commit').body;
  for (const marker of ['STANDARD_INITIAL_EXPLICIT_KEYS_V1', "b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'", 'standard_import_record_proof', "proof->>'ledger_entry_id'=NEW.id::text", "proof->>'operation_id'=NEW.operation_id::text", 'NEW.quantity_delta', 'NEW.posted_at', 'FRESH35_STANDARD_BASELINE_PROOF_REQUIRED']) assert.ok(baseline.includes(marker), marker);
  const final = byName('validate_import_accounting_final_record_commit').body;
  for (const marker of ['standard_import_record_proof(NEW.id)', 'BATCH_NAMESPACE_BINDING', 'STANDARD_BASELINE_APPROVAL', 'DOCUMENT_CONVERSION_APPROVAL', 'FINAL_EXPLICIT_KEYS', 'FINAL_DOCUMENT_CONVERSION', "r.action IS DISTINCT FROM 'IMPORT_PUBLISH'", 'NEW.reviewed_at', 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED', "IS DISTINCT FROM true", "r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'", "proof->>'target_type' IS DISTINCT FROM 'IMPORT_BATCH'"]) assert.ok(final.includes(marker), marker);
});

test('source changes, missing/extra/reordered sources and mutation of exported pins fail closed', () => {
  for (const candidate of [[], sources.slice(1), [...sources, sources[0]], [...sources].reverse()]) assert.throws(() => specializeFresh35CoreGuardSources(candidate), /FRESH35_CORE_/);
  for (let i = 0; i < sources.length; i++) assert.throws(() => specializeFresh35CoreGuardSources(sources.map((s, j) => i === j ? { ...s, sql: s.sql + '\n' } : s)), /FRESH35_CORE_SOURCE/);
  assert.ok(Object.isFrozen(specializeFresh35CoreGuardSources(sources)));
  assert.throws(() => { FRESH35_CORE_GUARD_REPLACEMENTS[0].before_sha256 = '0'.repeat(64); }, TypeError);
});

test('generated SQL is deterministic, fresh-only, atomic and preserves OID/ACL/configuration and all triggers', async () => {
  assert.equal(await renderFresh35CoreGuards(root), sql);
  for (const marker of ["transaction_isolation') IS DISTINCT FROM 'read committed'", "session_replication_role') IS DISTINCT FROM 'origin'", 'pg_catalog.pg_event_trigger', "relkind<>'r' OR relpersistence<>'p' OR relispartition", 'relation.relforcerowsecurity', 'relation.relowner IS DISTINCT FROM owner_oid', 'ACCESS EXCLUSIVE MODE', 'FRESH35_CORE_FRESH_EMPTY_TARGET_REQUIRED', 'FRESH35_CORE_PREDECESSOR_DIFFERS', 'WHERE oid=before_routine.oid', "(pg_catalog.to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (pg_catalog.to_jsonb(before_routine)-'prosrc')", 'IS DISTINCT FROM before_triggers', 'after_metadata IS DISTINCT FROM before_metadata']) assert.ok(sql.includes(marker), marker);
  assert.ok(sql.indexOf('ACCESS EXCLUSIVE MODE') < sql.indexOf('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)'));
  assert.ok(sql.indexOf('FRESH35_CORE_PREDECESSOR_DIFFERS') < sql.indexOf('EXECUTE changed;'));
  assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DISABLE|GRANT|REVOKE)\b/i);
  assert.equal(WHOLE_INSTALL_PATCHES.includes('0027_fresh35_core_guards_successor.sql'), false);
});

test('standalone source artifact stops before inspecting or changing a target without composed admission', () => {
  assert.match(sql, /BEGIN\n RAISE EXCEPTION 'FRESH35_CORE_COMPOSED_CATALOGUE_REQUIRED' USING ERRCODE='55000';\n SELECT oid,nspowner/);
  assert.ok(sql.indexOf('FRESH35_CORE_COMPOSED_CATALOGUE_REQUIRED') < sql.indexOf('ACCESS EXCLUSIVE MODE'));
  assert.doesNotMatch(sql, /current_setting\([^)]*(?:skip|bypass|allow|approve)/i);
});
