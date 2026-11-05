/** Offline protocol/source tests only. No PostgreSQL connection or execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CORE_HISTORY_EDGES, CORE_HISTORY_FK_QUERY, CORE_HISTORY_FK_CONTEXT_QUERY, verifyCoreHistoryFkPacket,
  collectCoreHistoryFkInventory } from '../scripts/release/unified-install/legacy-core-fk-audit.mjs';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const next = await read('adapters/postgres/patches/0027_fresh_core_history_fk_successor.sql');
const prior = await read('adapters/postgres/migrations/0024_history_effective_revisions.sql');
const predecessor = 'PREDECESSOR_WITH_HISTORY_FKS';
const successor = 'FRESH_ORDINARY_NULL_ONLY';
function fixture(profile = predecessor) {
  return {
    format: 'CORE_HISTORY_FK_INVENTORY_V1',
    context: { search_path: 'pg_catalog, naijue_erp, pg_temp', database: 'synthetic_whole_fk_candidate', read_only: 'on', isolation: 'repeatable read',
      replication_role: 'origin', core_table_count: 3, core_relation_shape_ok: true, row_security_active: false },
    foreign_keys: profile === predecessor ? CORE_HISTORY_EDGES.map(edge => ({
      name: edge.fk, table_name: edge.table, target: edge.target, columns: [edge.column], target_columns: ['id'],
      validated: true, deferrable: edge.deferred, deferred: edge.deferred, on_update: 'a', on_delete: 'a',
      match: 's', local: true, inherited: 0, parent: '0',
      ri_triggers: [['RI_FKey_check_ins', edge.table, 5], ['RI_FKey_check_upd', edge.table, 17],
        ['RI_FKey_noaction_del', edge.target, 9], ['RI_FKey_noaction_upd', edge.target, 17]].map(([name, table, type]) => ({
        function: name, table_name: table, type, enabled: 'O', internal: true, schema: 'pg_catalog',
        deferrable: edge.deferred, deferred: edge.deferred, parent: '0',
      })),
    })) : [],
    replacement_checks: profile === successor ? CORE_HISTORY_EDGES.map(edge => ({
      name: edge.check, table_name: edge.table, validated: true, type: 'c', no_inherit: false, expression: `(${edge.column} IS NULL)`,
      local: true, inherited: 0, parent: '0',
    })) : [],
    columns: CORE_HISTORY_EDGES.map(edge => {
      const prefix = edge.table === 'operation_receipt' ? 'target' : 'object';
      const kind = edge.target === 'history_sales_header' ? 'HISTORY_SALES' : 'HISTORY_TRANSFER';
      return { table_name: edge.table, name: edge.column, type: 'uuid', not_null: false, generated: edge.generated,
        expression: edge.generated ? `\nCASE\n    WHEN (${prefix}_type = '${kind}'::text) THEN ${prefix}_id\n    ELSE NULL::uuid\nEND` : null };
    }),
    usage: ['operation_receipt', 'audit_change', 'inventory_ledger'].map(table_name => ({ table_name, row_count: '0', history_value_count: '0' })),
  };
}
test('fixed manifest names precisely seven original core→history foreign keys and deferral policies', () => {
  assert.equal(CORE_HISTORY_EDGES.length, 7);
  assert.equal(CORE_HISTORY_EDGES.filter(e => e.deferred).length, 5);
  assert.equal(CORE_HISTORY_EDGES.filter(e => e.generated === 's').length, 4);
  const sourceManifest = JSON.parse(next.match(/\$edges\$([\s\S]*?)\$edges\$/)[1]);
  assert.deepEqual(sourceManifest, CORE_HISTORY_EDGES);
  for (const edge of CORE_HISTORY_EDGES) {
    const expression = new RegExp(`ADD COLUMN ${edge.column} uuid[^;]*?REFERENCES naijue_erp\\.${edge.target}\\(id\\)`);
    assert.match(prior, expression);
    assert.ok(edge.fk.length <= 63 && edge.check.length <= 63);
  }
});
test('fresh NULL-only guarantees are stronger than FKs, and equivalent while historic targets stay empty', () => {
  const oldAccepts = (value, referencedIds) => value === null || referencedIds.has(value);
  const newAccepts = value => value === null;
  for (const reference of [new Set(), new Set(['existing-history-id'])]) {
    for (const value of [null, 'existing-history-id', 'orphan-id']) {
      if (newAccepts(value)) assert.equal(oldAccepts(value, reference), true);
      if (reference.size === 0) assert.equal(newAccepts(value), oldAccepts(value, reference));
    }
  }
  assert.equal(newAccepts('existing-history-id'), false, 'not an existing-history migration');
});
test('candidate fails closed on populated, wrong-schema, invisible or disabled-guard targets before any DDL', () => {
  const firstChange = next.indexOf("EXECUTE format('ALTER TABLE");
  for (const guard of ['CORE_HISTORY_FK_NEW_EMPTY_TARGET_REQUIRED', 'CORE_HISTORY_FK_EXACT_PREDECESSOR_COHORT_REQUIRED',
    'CORE_HISTORY_FK_VISIBLE_OWNER_TABLE_REQUIRED', 'CORE_HISTORY_FK_PREDECESSOR_GUARD_DISABLED',
    'CORE_HISTORY_FK_PREDECESSOR_EDGE_DIFFERS', 'CORE_HISTORY_FK_GENERATED_EXPRESSION_DIFFERS']) {
    assert.ok(next.indexOf(guard) > 0 && next.indexOf(guard) < firstChange);
  }
  assert.ok(next.indexOf('IN ACCESS EXCLUSIVE MODE') < next.indexOf('SELECT EXISTS(SELECT 1'));
  assert.match(next, /EXISTS\(SELECT 1 FROM pg_catalog\.pg_event_trigger\)/);
  assert.match(next, /relforcerowsecurity/);
  assert.match(next, /relkind<>'r' OR relpersistence<>'p' OR relispartition/);
  assert.match(next, /pg_catalog\.pg_inherits i JOIN pg_catalog\.pg_class c ON c\.oid IN\(i\.inhrelid,i\.inhparent\)/);
  assert.match(next, /rolsuper OR rolbypassrls/);
  assert.match(next, /current_setting\('transaction_isolation'\) IS DISTINCT FROM 'read committed'/);
  const tables = next.match(/expected_tables constant text\[\] := ARRAY\[([^]*?)\];/)[1].match(/'[^']+'/g);
  assert.equal(tables.length, 56);
});
test('all validated replacements precede any FK removal; all unrelated constraints/columns/defaults/routines/triggers/policies remain exact', () => {
  assert.ok(next.indexOf('ADD CONSTRAINT %I CHECK(%I IS NULL)') < next.indexOf('CORE_HISTORY_FK_REPLACEMENT_NOT_VALIDATED'));
  assert.ok(next.indexOf('CORE_HISTORY_FK_REPLACEMENT_NOT_VALIDATED') < next.indexOf('DROP CONSTRAINT %I'));
  const between = next.slice(next.indexOf('CORE_HISTORY_FK_REPLACEMENT_NOT_VALIDATED'), next.indexOf('DROP CONSTRAINT %I'));
  assert.match(between, /END LOOP;\s+FOR edge/);
  for (const name of ['constraints', 'columns', 'defaults', 'routines', 'policies', 'triggers']) assert.match(next, new RegExp(`before_${name} IS DISTINCT FROM`));
  assert.doesNotMatch(next, /\b(?:DROP TABLE|DROP COLUMN|CASCADE|NOT VALID|DISABLE TRIGGER|TRUNCATE|GRANT|REVOKE|CREATE TABLE|INSERT INTO|DELETE FROM|SET ROLE)\b/i);
  assert.match(next, /^BEGIN;/m); assert.match(next, /COMMIT;\s*$/);
});
test('predecessor and successor profiles are separate and do not self-certify retirement or installation', () => {
  const before = verifyCoreHistoryFkPacket(fixture(), predecessor);
  assert.equal(before.direct_core_history_fk_count, 7);
  const after = verifyCoreHistoryFkPacket(fixture(successor), successor);
  assert.equal(after.direct_core_history_fk_count, 0); assert.equal(after.null_only_check_count, 7);
  assert.equal(after.complete_retirement_proof, false); assert.equal(after.installation_or_drop_authority, false);
  assert.throws(() => verifyCoreHistoryFkPacket(fixture(), successor));
  assert.throws(() => verifyCoreHistoryFkPacket(fixture(successor), predecessor));
  assert.throws(() => verifyCoreHistoryFkPacket(fixture(), 'auto'));
});
test('predecessor inventory rejects missing, extra, duplicated or altered FK guarantees', () => {
  const mutations = [p => p.foreign_keys.pop(), p => p.foreign_keys.push({ ...p.foreign_keys[0] }),
    p => p.foreign_keys[1] = { ...p.foreign_keys[0] }, p => p.foreign_keys[0].validated = false,
    p => p.foreign_keys[0].target = 'sales_header', p => p.foreign_keys[0].deferred = false,
    p => p.foreign_keys[0].on_delete = 'c', p => p.foreign_keys[0].columns = ['target_id'],
    p => p.foreign_keys[0].target_columns = ['batch_id'], p => p.foreign_keys[0].parent = '12',
    p => p.foreign_keys[0].ri_triggers.pop(), p => p.foreign_keys[0].ri_triggers[0].enabled = 'D',
    p => p.foreign_keys[0].ri_triggers[0].schema = 'hostile_schema', p => p.foreign_keys[0].ri_triggers[0].type = 7,
    p => p.foreign_keys[0].ri_triggers[0].deferred = false];
  for (const mutate of mutations) { const packet = fixture(); mutate(packet); assert.throws(() => verifyCoreHistoryFkPacket(packet, predecessor)); }
});
test('successor rejects missing, weakened, unvalidated or duplicated checks, any residual FK, or legacy core values', () => {
  const mutations = [p => p.replacement_checks.pop(), p => p.replacement_checks[1] = { ...p.replacement_checks[0] },
    p => p.replacement_checks[0].expression = '(true)', p => p.replacement_checks[0].validated = false,
    p => p.replacement_checks[0].type = 'f', p => p.replacement_checks[0].no_inherit = true, p => p.foreign_keys.push(fixture().foreign_keys[0]),
    p => p.usage[0].history_value_count = '1'];
  for (const mutate of mutations) { const packet = fixture(successor); mutate(packet); assert.throws(() => verifyCoreHistoryFkPacket(packet, successor)); }
});
test('collector rejects unreadable/RLS-filtered or non-snapshot contexts and altered generated columns', () => {
  const mutations = [p => p.context.search_path = 'hostile_schema, pg_catalog', p => p.context.read_only = 'off', p => p.context.isolation = 'read committed',
    p => p.context.replication_role = 'replica', p => p.context.row_security_active = true,
    p => p.context.core_table_count = 2, p => p.context.core_relation_shape_ok = false, p => p.columns.pop(), p => p.columns[0].generated = '',
    p => p.columns[0].expression = 'NULL::uuid', p => p.columns[0].expression = p.columns[0].expression.replace('HISTORY_SALES', 'SALES'),
    p => p.columns[4].expression = 'gen_random_uuid()', p => p.usage[0].row_count = 'NaN'];
  for (const mutate of mutations) { const packet = fixture(); mutate(packet); assert.throws(() => verifyCoreHistoryFkPacket(packet, predecessor)); }
});
test('read-only collector validates trusted context before one inventory query, never connects or mutates', async () => {
  const calls = [];
  const result = await collectCoreHistoryFkInventory({ query: async (...args) => { calls.push(args); return {
    command: 'SELECT', rows: [args[0] === CORE_HISTORY_FK_CONTEXT_QUERY ? fixture().context : { packet: fixture(successor) }],
  }; } }, successor);
  assert.equal(calls.length, 2); assert.equal(calls[0][0], CORE_HISTORY_FK_CONTEXT_QUERY); assert.equal(calls[1][0], CORE_HISTORY_FK_QUERY);
  assert.equal(calls[1][1][0].length, 21); assert.equal(result.result.null_only_check_count, 7);
  assert.doesNotMatch(CORE_HISTORY_FK_QUERY, /\b(?:ALTER|DROP|INSERT|UPDATE|DELETE|CREATE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|SET)\b/i);
  assert.match(CORE_HISTORY_FK_QUERY, /\)::pg_catalog\.text AS history_value_count/);
  assert.doesNotMatch(CORE_HISTORY_FK_QUERY, /(?<![.\w])(?:current_setting|current_database|jsonb_build_object|jsonb_agg|to_jsonb|unnest|count|bool_or|bool_and)\(/);
  assert.doesNotMatch(CORE_HISTORY_FK_QUERY, /pg_catalog\.(?:coalesce|greatest|least)\(/i);
  assert.match(CORE_HISTORY_FK_CONTEXT_QUERY, /SELECT pg_catalog\.current_setting\('search_path'\)/);
  for (const bad of [{ rows: [{ packet: fixture() }] }, { command: 'SELECT', rows: [] }, { command: 'SELECT', rows: [{ packet: fixture() }, { packet: fixture() }] }]) {
    await assert.rejects(collectCoreHistoryFkInventory({ query: async () => bad }, predecessor), /NOT_ACKNOWLEDGED/);
  }
  let hostileCalls = 0;
  await assert.rejects(collectCoreHistoryFkInventory({ query: async () => { hostileCalls++; return { command: 'SELECT', rows: [{ ...fixture().context, search_path: 'hostile_schema, pg_catalog' }] }; } }, predecessor));
  assert.equal(hostileCalls, 1, 'unsafe path must stop before catalog query');
});
test('candidate does not silently change existing admission or installation profiles', async () => {
  const { WHOLE_INSTALL_PATCHES } = await import('../scripts/release/unified-install/render-whole-package-local.mjs');
  assert.equal(WHOLE_INSTALL_PATCHES.includes('0027_fresh_core_history_fk_successor.sql'), false);
  const { loadWholeCatalogSpec } = await import('../scripts/release/unified-install/whole-catalog-gate.mjs');
  const spec = await loadWholeCatalogSpec(process.cwd());
  assert.equal(spec.installation_sources.some(s => s.path.endsWith('0027_fresh_core_history_fk_successor.sql')), false);
});
