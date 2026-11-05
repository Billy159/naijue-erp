import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  LEGACY_ROWTYPE_SOURCES, LEGACY_ROWTYPE_REPLACEMENTS, LEGACY_ROWTYPE_EXPECTED_TABLES,
  LEGACY_COMPOSITE_INPUTS_REMAINING, specializeLegacyRowtypeSources,
  loadLegacyRowtypePlan, renderLegacyRowtypeSuccessor,
} from '../scripts/release/unified-install/fresh27-legacy-rowtypes.mjs';
import { loadWholeCatalogSpec } from '../scripts/release/unified-install/whole-catalog-gate.mjs';
import { buildLegacyDependencySourceReport, inspectLegacyRoutineSources, LEGACY_RETIREMENT_CANDIDATE_TABLES } from '../scripts/release/unified-install/legacy-dependency-source-report.mjs';
import { loadPublicationIsolationPlan } from '../scripts/release/unified-install/fresh27-publication-isolation.mjs';
import { WHOLE_INSTALL_PATCHES } from '../scripts/release/unified-install/render-whole-package-local.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(resolve(root, path), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const sources = await Promise.all(LEGACY_ROWTYPE_SOURCES.map(async pin => ({ path: pin.path, sql: await read(pin.path) })));
const plan = await loadLegacyRowtypePlan(root);
const sql = await read('adapters/postgres/patches/0027_fresh_legacy_rowtypes_successor.sql');

test('eleven final definitions change one declaration only; all original SQL/proof statements remain', () => {
  assert.equal(plan.length, 11);
  assert.equal(new Set(plan.map(p => p.signature)).size, 11);
  for (const item of plan) {
    const before = item.body.replace(item.new_declaration, item.old_declaration);
    assert.equal(hash(before), item.before_sha256);
    assert.equal(hash(item.body), item.after_sha256);
    assert.equal(before.split(item.old_declaration).length, 2);
    assert.equal(item.body.slice(item.body.indexOf('\nBEGIN')), before.slice(before.indexOf('\nBEGIN')));
    for (const table of LEGACY_RETIREMENT_CANDIDATE_TABLES) assert.doesNotMatch(item.body, new RegExp(`naijue_erp\\.${table}%ROWTYPE`, 'i'));
  }
});

test('every new record acquires its row shape before field use; typed JSON casts remain explicit', () => {
  for (const item of plan) {
    const variable = item.new_declaration.split(' ')[0];
    const assignment = item.body.indexOf(item.assignment);
    assert.ok(assignment >= item.body.indexOf('\nBEGIN'));
    const firstField = item.body.search(new RegExp(`\\b${variable}\\.[a-z_]`, 'i'));
    assert.ok(firstField > assignment, item.name);
    assert.doesNotMatch(item.body, new RegExp(`PERFORM naijue_erp\\.[a-z_]+\\(\\s*${variable}\\s*[,)]`, 'i'));
  }
  const casts = plan.filter(p => /NULL::naijue_erp\.import_source_row/.test(p.body));
  assert.equal(casts.length, 4);
  assert.deepEqual(plan.filter(p => p.initialization === 'FOR_SELECT_LOOP').map(p => p.name), ['validate_history_product_proofs']);
});

test('full final177 in-memory successor has zero candidate ROWTYPE declarations but keeps both composite inputs', async () => {
  const report = await buildLegacyDependencySourceReport(root);
  const current = await loadWholeCatalogSpec(root);
  const finalSources = await Promise.all(report.ordered_sql_sources.map(async pin => ({ path: pin.path, sql: await read(pin.path) })));
  for (const item of plan) {
    const source = finalSources.find(s => s.path === item.source);
    const before = item.body.replace(item.new_declaration, item.old_declaration);
    assert.equal(source.sql.split(before).length, 2, item.name);
    source.sql = source.sql.replace(before, () => item.body);
  }
  const nextPins = current.pins.map(pin => ({ ...pin, sha256: plan.find(p => p.signature === pin.signature)?.after_sha256 ?? pin.sha256 }));
  const next = inspectLegacyRoutineSources({ sources: finalSources, pins: nextPins });
  assert.equal(next.filter(p => p.lexical_rowtype_references.length).length, 0);
  assert.deepEqual(next.filter(p => p.composite_argument_references.length).map(p => p.signature), LEGACY_COMPOSITE_INPUTS_REMAINING);
  assert.equal(next.length, report.routines.length, 'Declaration-only removal does not remove relation reads');
});

test('strict source set rejects changed bytes, reordered, missing, extra and forged replacements', () => {
  for (const candidate of [[], sources.slice(1), [...sources, sources[0]], [...sources].reverse(), sources.map((s, i) => i ? s : { ...s, sql: s.sql + '\n' })]) {
    assert.throws(() => specializeLegacyRowtypeSources(candidate), /LEGACY_ROWTYPE_/);
  }
  const baseline = specializeLegacyRowtypeSources(sources);
  assert.ok(Object.isFrozen(baseline) && baseline.every(Object.isFrozen));
  assert.throws(() => { LEGACY_ROWTYPE_REPLACEMENTS[0].before_sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => { LEGACY_ROWTYPE_SOURCES.push({}); }, TypeError);
});

test('fresh candidate requires exact permanent nonpartitioned56 tables, read committed, visible owner and empty target', () => {
  assert.equal(LEGACY_ROWTYPE_EXPECTED_TABLES.length, 56);
  assert.equal(new Set(LEGACY_ROWTYPE_EXPECTED_TABLES).size, 56);
  assert.deepEqual([...LEGACY_ROWTYPE_EXPECTED_TABLES].sort(), LEGACY_ROWTYPE_EXPECTED_TABLES);
  for (const marker of [
    "transaction_isolation') IS DISTINCT FROM 'read committed'", "transaction_read_only') IS DISTINCT FROM 'off'",
    "session_replication_role') IS DISTINCT FROM 'origin'", 'pg_catalog.pg_event_trigger', "relkind IN('r','p','f')",
    "relkind<>'r' OR relpersistence<>'p' OR relispartition", 'pg_catalog.pg_inherits', 'relation.relforcerowsecurity',
    'relation.relowner IS DISTINCT FROM owner_oid', 'LEGACY_ROWTYPE_FRESH_EMPTY_TARGET_REQUIRED',
    'SET LOCAL row_security=off', "relname<>'schema_migration'", 'pg_catalog.generate_series(1,27)',
  ]) assert.ok(sql.includes(marker), marker);
  assert.ok(sql.indexOf('ACCESS EXCLUSIVE MODE') < sql.indexOf('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)'));
  assert.ok(sql.indexOf('LEGACY_ROWTYPE_FRESH_EMPTY_TARGET_REQUIRED') < sql.indexOf('EXECUTE changed;'));
});

test('candidate validates the complete predecessor before changes, preserves OID/ACL/metadata and trigger set', () => {
  for (const marker of [
    "before_routine.proowner IS DISTINCT FROM owner_oid", 'before_routine.prosecdef', "before_routine.prokind<>'f'",
    "before_routine.provolatile<>'v'", "before_routine.proparallel<>'u'", 'before_routine.proisstrict',
    'before_routine.proretset', 'before_routine.proleakproof', "search_path=pg_catalog, naijue_erp, pg_temp",
    "before_routine.prolang", "before_routine.prorettype", 'LEGACY_ROWTYPE_PREDECESSOR_CHANGED',
    'LEGACY_ROWTYPE_DECLARATION_OCCURRENCE_DIFFERS', "WHERE oid=before_routine.oid", 'after_metadata IS DISTINCT FROM before_metadata',
    "(pg_catalog.to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (pg_catalog.to_jsonb(before_routine)-'prosrc')",
    'IS DISTINCT FROM before_triggers', 'exclusive reviewed schema-writer window',
  ]) assert.ok(sql.includes(marker), marker);
  assert.ok(sql.indexOf('LEGACY_ROWTYPE_PREDECESSOR_DIFFERS') < sql.indexOf('EXECUTE changed;'));
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE|DROP|ALTER|TRUNCATE|DISABLE|INSERT|UPDATE|DELETE)\b/i);
});

test('generated SQL is reproducible; eleven changes overlap old balance only and not publication9', async () => {
  assert.equal(await renderLegacyRowtypeSuccessor(root), sql);
  const payload = JSON.parse(sql.match(/\$patches\$(\[[\s\S]*?\])\$patches\$/)[1]);
  assert.deepEqual(payload.map(p => p.after_sha256), plan.map(p => p.after_sha256));
  const balance = plan.find(p => p.name === 'validate_history_numeric_balance_commit');
  assert.equal(balance.after_sha256, 'e7c3b1082f5c5fd5b6634c8db26df08af2e6e7296a7297a5b1af28aa76e6d703');
  const oldCandidate = await read('adapters/postgres/patches/0027_history_balance_rowtype_successor.sql');
  assert.ok(oldCandidate.includes(balance.after_sha256));
  const publication = await loadPublicationIsolationPlan(root);
  assert.equal(plan.filter(p => publication.some(q => p.signature === q.signature)).length, 0);
});

test('existing profiles retain all old body pins and do not register this candidate', async () => {
  assert.equal(WHOLE_INSTALL_PATCHES.includes('0027_fresh_legacy_rowtypes_successor.sql'), false);
  const current = await loadWholeCatalogSpec(root);
  for (const item of plan) {
    assert.equal(current.pins.find(p => p.signature === item.signature).sha256, item.before_sha256);
    assert.notEqual(item.before_sha256, item.after_sha256);
  }
  const moduleSource = await read('scripts/release/unified-install/fresh27-legacy-rowtypes.mjs');
  assert.doesNotMatch(moduleSource, /from ['"](?:pg|postgres|node:child_process)['"]|\.query\(/);
});
