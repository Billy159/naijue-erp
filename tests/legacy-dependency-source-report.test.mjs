/** Offline source contracts only. No pg import, connection or SQL execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  LEGACY_RETIREMENT_CANDIDATE_TABLES,
  inspectLegacyRoutineSources,
  buildLegacyDependencySourceReport,
} from '../scripts/release/unified-install/legacy-dependency-source-report.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('..', import.meta.url));
const fn = (name, body, args = '', delimiter = '$body$') =>
  `CREATE OR REPLACE FUNCTION naijue_erp.${name}(${args}) RETURNS trigger LANGUAGE plpgsql AS ${delimiter}${body}${delimiter};`;
const pin = (name, body, args = '') => ({ signature: `naijue_erp.${name}(${args})`, sha256: hash(body) });
const source = (path, sql) => ({ path, sql });

test('latest exact body wins over superseded ROWTYPE declaration; separate dollar bodies stay separate', () => {
  const old = '\nDECLARE r naijue_erp.history_revision%ROWTYPE; BEGIN RETURN NEW; END\n';
  const next = '\nDECLARE revision_version integer; BEGIN SELECT r.to_version INTO revision_version FROM naijue_erp.history_revision r; RETURN NEW; END\n';
  const sibling = '\nDECLARE r naijue_erp.import_source_row%ROWTYPE; BEGIN RETURN NEW; END\n';
  const rows = inspectLegacyRoutineSources({ sources: [
    source('old.sql', fn('ledger_guard', old)),
    source('successor.sql', fn('ledger_guard', next, '', '$ledger$') + '\n' + fn('other_guard', sibling, '', '$other$')),
  ], pins: [pin('ledger_guard', next), pin('other_guard', sibling)] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, 'successor.sql');
  assert.deepEqual(rows[0].lexical_rowtype_references, []);
  assert.deepEqual(rows[0].qualified_body_mentions, ['history_revision']);
  assert.deepEqual(rows[1].lexical_rowtype_references, ['import_source_row']);
});

test('a pinned earlier definition cannot hide a changed final body or a reordered successor', () => {
  const prior = '\nBEGIN RETURN NEW; END\n', after = '\nBEGIN RETURN NULL; END\n';
  assert.throws(() => inspectLegacyRoutineSources({
    sources: [source('prior.sql', fn('guard', prior)), source('later.sql', fn('guard', after))], pins: [pin('guard', prior)],
  }), /FINAL_ROUTINE_PIN_DIFFERS/);
  assert.throws(() => inspectLegacyRoutineSources({
    sources: [source('later.sql', fn('guard', after)), source('prior.sql', fn('guard', prior))], pins: [pin('guard', after)],
  }), /FINAL_ROUTINE_PIN_DIFFERS/);
});

test('missing/extra final definitions, duplicate pins and wrong signatures fail closed', () => {
  const body = '\nBEGIN RETURN NEW; END\n';
  for (const input of [
    { sources: [], pins: [pin('guard', body)] },
    { sources: [source('extra.sql', fn('guard', body) + fn('extra', body))], pins: [pin('guard', body)] },
    { sources: [source('duplicate.sql', fn('guard', body) + fn('extra', body))], pins: [pin('guard', body), pin('guard', body)] },
    { sources: [source('signature.sql', fn('guard', body, 'x text'))], pins: [pin('guard', body, 'uuid')] },
  ]) assert.throws(() => inspectLegacyRoutineSources(input), /LEGACY_AUDIT_FINAL_/);
});

test('overloads are distinct signatures, so a later same-name routine cannot conceal an extra overload', () => {
  const body = '\nDECLARE r naijue_erp.history_revision%ROWTYPE; BEGIN RETURN NEW; END\n';
  const sources = [source('overload.sql', fn('guard', body, 'x text') + '\n' + fn('guard', body, 'x uuid'))];
  assert.throws(() => inspectLegacyRoutineSources({ sources, pins: [pin('guard', body, 'uuid')] }), /FINAL_COHORT_DIFFERS/);
  assert.equal(inspectLegacyRoutineSources({ sources, pins: [pin('guard', body, 'text'), pin('guard', body, 'uuid')] }).length, 2);
});

test('commented and quoted CREATE text cannot satisfy any routine pin', () => {
  const body = '\nBEGIN RETURN NEW; END\n', sql = fn('guard', body);
  for (const hidden of [
    '/* outer /* nested comment */ ' + sql + ' */',
    sql.split('\n').map(line => '-- ' + line).join('\n'),
    "SELECT '" + sql.replaceAll("'", "''") + "';",
    'DO $outer$ BEGIN RAISE NOTICE $quoted$' + sql + '$quoted$; END $outer$;',
    'DO $outer$ BEGIN EXECUTE $quoted$' + sql + '$quoted$; END $outer$;',
  ]) assert.throws(() => inspectLegacyRoutineSources({ sources: [source('hidden.sql', hidden)], pins: [pin('guard', body)] }), /FINAL_COHORT_DIFFERS/);
});

test('actual comments in headers are skipped and cannot supply an alternative AS body', () => {
  const body = '\nDECLARE r naijue_erp.history_revision%ROWTYPE; BEGIN RETURN NEW; END\n';
  const sql = fn('guard', body).replace('CREATE OR REPLACE FUNCTION', 'CREATE /* comment */ OR REPLACE FUNCTION')
    .replace('LANGUAGE plpgsql AS', 'LANGUAGE plpgsql /* AS $fake$wrong body$fake$ */ AS');
  const rows = inspectLegacyRoutineSources({ sources: [source('comments.sql', sql)], pins: [pin('guard', body)] });
  assert.equal(rows[0].body_sha256, hash(body));
});

test('trailing routine or schema DROP/ALTER cannot be ignored after a matching definition', () => {
  const body = '\nBEGIN RETURN NEW; END\n', sql = fn('guard', body);
  for (const ddl of ['DROP FUNCTION naijue_erp.guard();', 'DROP ROUTINE naijue_erp.guard();',
    'DROP SCHEMA naijue_erp CASCADE;', 'ALTER FUNCTION naijue_erp.guard() RENAME TO other;',
    'ALTER SCHEMA naijue_erp RENAME TO other;']) {
    assert.throws(() => inspectLegacyRoutineSources({ sources: [source('ddl.sql', sql + '\n' + ddl)], pins: [pin('guard', body)] }), /UNMODELED_ROUTINE_DDL/);
  }
  assert.deepEqual(inspectLegacyRoutineSources({ sources: [source('safe-comment.sql', sql + '\n-- DROP FUNCTION naijue_erp.guard();')],
    pins: [pin('guard', body)] }), []);
});

test('unterminated quotes/comments are rejected rather than scanned through', () => {
  const body = '\nBEGIN RETURN NEW; END\n';
  for (const suffix of ['/* unfinished', "SELECT 'unfinished", 'DO $open$ unfinished']) {
    assert.throws(() => inspectLegacyRoutineSources({ sources: [source('broken.sql', fn('guard', body) + suffix)], pins: [pin('guard', body)] }), /UNTERMINATED/);
  }
});

test('the only supported EXECUTE carrier requires exact immutable Source49 bytes', async () => {
  const path = 'adapters/postgres/patches/0027_standard_import_master_chunks_v2_successor.sql';
  const sql = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  assert.throws(() => inspectLegacyRoutineSources({ sources: [source(path, sql + '\n-- changed carrier\n')], pins: [] }),
    /SOURCE49_CARRIER_DIFFERS/);
});

test('composite arguments are reported even without body mentions; retained supports are not retirement candidates', () => {
  const body = '\nBEGIN RETURN NEW; END\n';
  const rows = inspectLegacyRoutineSources({ sources: [source('composite.sql',
    fn('guard', body, 'evidence naijue_erp.native_party_import_evidence, batch naijue_erp.import_batch'))],
  pins: [pin('guard', body, 'naijue_erp.native_party_import_evidence,naijue_erp.import_batch')] });
  assert.deepEqual(rows[0].composite_argument_references, ['native_party_import_evidence']);
  assert.deepEqual(rows[0].qualified_body_mentions, []);
  assert.equal(LEGACY_RETIREMENT_CANDIDATE_TABLES.length, 21);
  assert.equal(new Set(LEGACY_RETIREMENT_CANDIDATE_TABLES).size, 21);
  assert.equal(LEGACY_RETIREMENT_CANDIDATE_TABLES.includes('import_batch'), false);
  assert.equal(LEGACY_RETIREMENT_CANDIDATE_TABLES.includes('import_record'), false);
});

test('qualified lookalikes are not exact table references', () => {
  const body = '\nDECLARE r naijue_erp.history_revision_other%ROWTYPE; BEGIN RETURN NEW; END\n';
  assert.deepEqual(inspectLegacyRoutineSources({ sources: [source('lookalike.sql', fn('guard', body))],
    pins: [pin('guard', body)] }), []);
});

test('actual whole177 source audit retains the balance blocker without resurrecting the superseded ledger ROWTYPE', async () => {
  const report = await buildLegacyDependencySourceReport(root);
  assert.equal(report.final_routine_count, 177);
  assert.equal(report.balance_record_candidate_registered, false);
  assert.equal(report.database_accessed, false);
  assert.equal(report.retirement_authorized, false);
  assert.match(report.scope, /NOT_RUNTIME_REACHABILITY_OR_PHYSICAL_RETIREMENT_PROOF/);
  assert.ok(report.limitations.some(value => /empty reference list is not evidence/.test(value)));
  const balance = report.routines.find(r => r.signature === 'naijue_erp.validate_history_numeric_balance_commit()');
  assert.equal(balance.body_sha256, 'fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837');
  assert.deepEqual(balance.lexical_rowtype_references, ['history_revision']);
  const ledger = report.routines.find(r => r.signature === 'naijue_erp.guard_history_numeric_ledger()');
  assert.equal(ledger.source, 'adapters/postgres/patches/0026-history-revision-set-guards-successor.sql');
  assert.deepEqual(ledger.lexical_rowtype_references, []);
  assert.deepEqual(ledger.qualified_body_mentions, ['history_revision']);
  const receipt = report.routines.find(r => r.signature === 'naijue_erp.validate_history_numeric_receipt_commit()');
  assert.deepEqual(receipt.lexical_rowtype_references, []);
  assert.deepEqual(receipt.qualified_body_mentions, ['history_revision']);
  assert.equal(report.routines.filter(r => r.lexical_rowtype_references.length).length, 11);
  assert.equal(report.routines.filter(r => r.composite_argument_references.length).length, 2);
});

test('the single candidate declaration change does not remove its historical SELECT or authorize table deletion', async () => {
  const sourceSql = await readFile(new URL('../adapters/postgres/patches/0026-history-revision-current-base.sql', import.meta.url), 'utf8');
  const match = sourceSql.match(/CREATE FUNCTION naijue_erp\.validate_history_numeric_balance_commit\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
  assert.ok(match);
  const before = match[1], after = before.replace('revision naijue_erp.history_revision%ROWTYPE', 'revision record');
  const rows = inspectLegacyRoutineSources({ sources: [source('synthetic-candidate-only.sql', fn('validate_history_numeric_balance_commit', after))],
    pins: [pin('validate_history_numeric_balance_commit', after)] });
  assert.deepEqual(rows[0].lexical_rowtype_references, []);
  assert.deepEqual(rows[0].qualified_body_mentions, ['history_revision']);
  assert.throws(() => inspectLegacyRoutineSources({ sources: [source('synthetic-candidate-only.sql', fn('validate_history_numeric_balance_commit', after))],
    pins: [pin('validate_history_numeric_balance_commit', before)] }), /FINAL_ROUTINE_PIN_DIFFERS/);
});
