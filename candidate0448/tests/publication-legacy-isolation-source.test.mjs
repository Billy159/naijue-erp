/** Offline source contracts only. Synthetic models below are not PostgreSQL execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PUBLICATION_ISOLATION_SOURCES, PUBLICATION_GUARDS, specializePublicationSources,
  loadPublicationIsolationPlan, renderPublicationIsolation } from '../scripts/release/unified-install/fresh27-publication-isolation.mjs';
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from '../scripts/release/unified-install/legacy-dependency-source-report.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const sources = await Promise.all(PUBLICATION_ISOLATION_SOURCES.map(async s => ({ ...s, sql: await read(s.path) })));
const plan = await loadPublicationIsolationPlan(root);
const sql = await renderPublicationIsolation(root);
const original = name => sources[name === 'is_exact_historical_customer_only' ? 1 : 0].sql.match(
  new RegExp(`CREATE OR REPLACE FUNCTION naijue_erp\\.${name}\\([^)]*\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`))[1];
const marker = ' -- STANDARD27_BRANCH_END';

test('generated artifact has exact nine fresh-only replacements and no silent registration', async () => {
  assert.equal(sql, await read('adapters/postgres/patches/0027_publication_legacy_isolation_successor.sql'));
  const parsed = JSON.parse(sql.match(/\$bodies\$(\[[\s\S]*?\])\$bodies\$/)[1]);
  assert.equal(parsed.length, 9);
  assert.equal(new Set(parsed.map(p => p.signature)).size, 9);
  for (const p of parsed) assert.equal(hash(p.body), p.after_sha256);
  assert.equal(plan.length, 9);
  const { WHOLE_INSTALL_PATCHES } = await import('../scripts/release/unified-install/render-whole-package-local.mjs');
  assert.equal(WHOLE_INSTALL_PATCHES.includes('0027_publication_legacy_isolation_successor.sql'), false);
  const { loadWholeCatalogSpec } = await import('../scripts/release/unified-install/whole-catalog-gate.mjs');
  const current = await loadWholeCatalogSpec(root);
  for (const p of plan) {
    const normalize = signature => signature.replaceAll('pg_catalog.', '');
    const pin = current.pins.find(pin => normalize(pin.signature) === normalize(p.signature));
    assert.ok(pin, p.signature);
    assert.equal(pin.sha256, p.before_sha256, p.signature);
    assert.notEqual(pin.sha256, p.after_sha256, p.signature);
  }
});

test('all standard publication and party validation prefixes are byte-identical', () => {
  for (const p of plan.filter(p => p.name !== 'is_exact_historical_customer_only')) {
    const before = original(p.name);
    assert.equal(p.before_sha256, hash(before));
    assert.equal(before.split(marker).length, 2);
    const throughMarker = body => body.slice(0, body.indexOf(marker) + marker.length);
    assert.equal(throughMarker(p.body), throughMarker(before), p.name);
    for (const check of ['STANDARD27_PREPARED_OPERATION_INVALID', 'STANDARD27_PREPARED_TARGET_INVALID',
      'STANDARD27_PREPARED_RECORD_SET_INVALID', 'STANDARD27_EXACT_POINTER_REQUIRED', 'STANDARD27_RECORD_PROOF_INVALID']) {
      assert.ok(p.body.includes(check), p.name + ':' + check);
    }
  }
});

test('nine resulting routine bodies have no references or composite bindings to the 21 legacy candidate tables', () => {
  for (const p of plan) for (const table of LEGACY_RETIREMENT_CANDIDATE_TABLES) {
    assert.doesNotMatch(p.body, new RegExp(`\\bnaijue_erp\\.${table}\\b`), p.name + ':' + table);
    assert.doesNotMatch(p.signature, new RegExp(`\\bnaijue_erp\\.${table}\\b`), p.name + ':' + table);
  }
  assert.ok(plan.every(p => !/\bEXECUTE\b/.test(p.body)), 'no dynamically hidden relation access');
});

test('unauthorized document conversion and old mappings fail closed instead of probing legacy sources', () => {
  for (const p of plan.filter(p => PUBLICATION_GUARDS.includes(p.name))) {
    const tail = p.body.slice(p.body.indexOf(marker) + marker.length);
    assert.match(tail, /NEW\.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'/);
    assert.match(tail, /NEW\.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'/);
    for (const field of ['history_payload_hash', 'history_expected_counts', 'history_actual_counts']) assert.ok(tail.includes(`NEW.${field} IS NOT NULL`));
    assert.match(tail, /NEW\.history_validation_passed IS DISTINCT FROM false/);
    assert.match(tail, /FRESH27_STANDARD_PUBLICATION_REQUIRED/);
    assert.ok(tail.indexOf("standard_import_identity(NULL,CASE current_setting('role')") < tail.indexOf('RETURN NEW;'));
    assert.match(tail, /THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END/);
    assert.doesNotMatch(tail, /'INSPECT'/);
  }
  // Model only the explicit tail contract, never the untouched standard validator.
  const valid = { inventory_mode: 'CUTOFF_STOCK_BASELINE', mapping_version: 'STANDARD_INITIAL_EXPLICIT_KEYS_V1',
    history_payload_hash: null, history_expected_counts: null, history_actual_counts: null, history_validation_passed: false };
  const allowed = row => row.inventory_mode === valid.inventory_mode && row.mapping_version === valid.mapping_version &&
    ['history_payload_hash', 'history_expected_counts', 'history_actual_counts'].every(k => row[k] === null) && row.history_validation_passed === false;
  assert.equal(allowed(valid), true);
  for (const [key, value] of [['inventory_mode', 'DOCUMENT_CONVERSION'], ['inventory_mode', null],
    ['mapping_version', 'V2_HISTORY_NULLABLE_1'], ['mapping_version', null], ['history_payload_hash', 'a'.repeat(64)],
    ['history_expected_counts', {}], ['history_actual_counts', {}], ['history_validation_passed', true], ['history_validation_passed', null]]) {
    assert.equal(allowed({ ...valid, [key]: value }), false, key);
  }
});

test('ordinary party falls into original live checks; no legacy import intent is accepted in this fresh profile', async () => {
  const party = plan.find(p => p.name === 'is_native_party_import_insert');
  const tail = party.body.slice(party.body.indexOf(marker) + marker.length);
  assert.match(tail, /RETURN false;/);
  assert.doesNotMatch(tail, /RETURN true|SELECT|EXISTS/);
  const callers = await read('adapters/postgres/migrations/0013_native_party_import.sql');
  assert.match(callers, /TG_OP = 'INSERT' AND naijue_erp\.is_native_party_import_insert/);
  for (const error of ['new runtime party starts enabled at version one and actual creation time',
    'native party requires coherent actor operation action and action time', 'party sparse after evidence differs from actual changed native values']) assert.ok(callers.includes(error));
});

test('pinned historical-only IDs require full standard proof rather than an unverified pointer or unconditional exemption', () => {
  const body = plan.find(p => p.name === 'is_exact_historical_customer_only').body;
  for (const id of ['2e5bd72a-c1cb-4090-90be-091deb49bb2e', 'f8a29ce8-e296-4b95-9612-ca7bb62507bd']) assert.ok(body.includes(id));
  assert.match(body, /matches IS DISTINCT FROM 1/);
  assert.match(body, /standard_import_record_proof\(source_id\)/);
  assert.match(body, /FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_REQUIRED/);
  assert.match(body, /FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_INVALID/);
  assert.match(body, /proof->>'target_id' IS DISTINCT FROM target::text/);
  assert.match(body, /proof->'fields'->>'id' IS DISTINCT FROM target::text/);
  assert.match(body, /jsonb_array_length\(proof->'source_refs'\)<1/);
  assert.doesNotMatch(body, /LIKE|RETURN true/);
  assert.ok(body.lastIndexOf('RETURN false;') > body.indexOf('FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_INVALID'));
});

test('installation refuses any business/evidence data, locks the predecessor, and preserves metadata and triggers', () => {
  assert.match(sql, /SET LOCAL row_security=off/);
  assert.match(sql, /session_replication_role.*origin/);
  assert.match(sql, /rolsuper OR rolbypassrls OR rolreplication/);
  assert.match(sql, /ACCESS EXCLUSIVE MODE/);
  assert.match(sql, /relname<>'schema_migration'/);
  assert.match(sql, /PUBLICATION_ISOLATION_FRESH_EMPTY_TARGET_REQUIRED/);
  assert.match(sql, /array_agg\(version ORDER BY version\).*generate_series\(1,27\)/);
  assert.match(sql, /before_routine\.proconfig IS DISTINCT FROM ARRAY\['search_path=pg_catalog, naijue_erp, pg_temp'\]/);
  assert.match(sql, /to_jsonb\(after_routine\)-'prosrc'.*IS DISTINCT FROM.*to_jsonb\(before_routine\)-'prosrc'/);
  assert.match(sql, /after_triggers IS DISTINCT FROM before_triggers/);
  assert.match(sql, /PUBLICATION_ISOLATION_BODY_OCCURRENCE_DIFFERS/);
  assert.doesNotMatch(sql, /^(?:GRANT|REVOKE|DROP|TRUNCATE|ALTER|CREATE TABLE|INSERT INTO|DELETE FROM|UPDATE naijue_erp)/mi);
  assert.ok(sql.indexOf('PUBLICATION_ISOLATION_FRESH_EMPTY_TARGET_REQUIRED') < sql.indexOf('EXECUTE changed;'));
});

test('changed, reordered, duplicated, missing or appended parent source cannot yield a candidate', () => {
  for (const malformed of [sources.slice(0, 1), [sources[1], sources[0]], [sources[0], sources[0]],
    sources.map((source, i) => i ? source : { ...source, sql: source.sql + '\n-- changed\n' }),
    sources.map((source, i) => i ? { ...source, sql: source.sql.replace('RETURN false;', 'RETURN true;') } : source)]) {
    assert.throws(() => specializePublicationSources(malformed), /PUBLICATION_ISOLATION_SOURCE_(?:SET_REQUIRED|CHANGED)/);
  }
});
