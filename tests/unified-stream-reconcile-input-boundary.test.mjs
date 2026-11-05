import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDARD_MASTER_TABLES } from '../packages/application/src/unified-import-execution.ts';
import { compareWholePackageSource, reconcileWholePackage } from '../tools/unified-import/whole-package-reconcile.mjs';

// In-memory protocol doubles only. No host, database, or real source data.
const credential = 'naijue:scrypt:1:32768:8:1:' + 'c'.repeat(32) + ':' + 'd'.repeat(128);
function fixture() {
  const initialize = {
    plan_sha256: 'a'.repeat(64),
    batch_id: '00000000-0000-4000-8000-000000000001',
    payload: { document_batch_id: '00000000-0000-4000-8000-000000000002' },
  };
  const counts = Object.fromEntries([...STANDARD_MASTER_TABLES, 'sales_header', 'sales_line', 'sales_settlement', 'transfer_header', 'transfer_line', 'inventory_baseline'].map(key => [key, 0]));
  const totals = { inventory_quantity: '0', sales_quantity: '0', sales_line_amount_cents: '0', sales_net_due_cents: '0', settlement_amount_cents: '0', transfer_quantity: '0' };
  const value = {
    verified: true, verification_profile: 'STANDARD_WHOLE_PACKAGE_VERIFY_V2', protocol: 'STANDARD_IMPORT_SQL_V1',
    plan_sha256: initialize.plan_sha256, baseline_batch_id: initialize.batch_id, batch_id: initialize.payload.document_batch_id,
    scope: 'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED', unknown_keys_materialized: false,
    source_counts: { ...Object.fromEntries(Object.entries(counts).filter(([key]) => key !== 'inventory_baseline').map(([key, count]) => [key.toUpperCase(), count])), INVENTORY_KEY: 0, IMPORT_BATCH: 3 },
    source_totals: { inventory_quantity: '0', sales_quantity: '0', sales_line_amount: '0.00', sales_net_due: '0.00', sales_settlement_amount: '0.00', transfer_quantity: '0' },
    current_totals: { inventory_quantity: '0', sales_quantity: '0', sales_line_amount: '0.00', sales_net_due: '0.00', sales_settlement_amount: '0.00', transfer_quantity: '0' },
    document_summary: { verified_count: 0, changed_after_import_count: 0 },
    inventory_summary: { verified_key_count: 0 },
    inventory_coverage: { scope: 'EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS', explicit_source_keys: 0, explicit_zero_keys: 0, post_cutoff_effect_keys: 0, unknown_combinations_not_enumerated: true, complete_total_inventory: false },
  };
  return { initialize, counts, totals, value };
}
function client(value, options = {}) {
  const calls = [];
  let discarded = 0, rollbacks = 0;
  return {
    calls, get discarded() { return discarded; },
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('BEGIN')) { await options.onBegin?.(); return { command: options.badBegin ? '?' : 'BEGIN' }; }
      if (sql.startsWith('SET')) return { command: 'SET' };
      if (sql.startsWith('SELECT')) { if (options.selectError) throw Error('synthetic-private-value'); return { command: 'SELECT', rows: [{ result_json: JSON.stringify(value) }] }; }
      if (sql === 'ROLLBACK') { rollbacks++; return { command: options.badFirstRollback && rollbacks === 1 ? '?' : 'ROLLBACK' }; }
      throw Error('Unexpected SQL');
    },
    async discard() { discarded++; if (options.discardError) throw Error('synthetic-private-discard-value'); },
  };
}
const reconcile = (c, f) => reconcileWholePackage(c, f.initialize, credential, f.counts, f.totals);

for (const [name, change] of [
  ['missing plan', f => { delete f.initialize.plan_sha256; delete f.value.plan_sha256; }],
  ['missing baseline batch', f => { delete f.initialize.batch_id; delete f.value.baseline_batch_id; }],
  ['missing document batch', f => { delete f.initialize.payload.document_batch_id; delete f.value.batch_id; }],
  ['malformed plan', f => { f.initialize.plan_sha256 = f.value.plan_sha256 = 'not-a-sha256'; }],
  ['malformed baseline batch', f => { f.initialize.batch_id = f.value.baseline_batch_id = 'not-a-uuid'; }],
  ['malformed document batch', f => { f.initialize.payload.document_batch_id = f.value.batch_id = 'not-a-uuid'; }],
  ['same batch twice', f => { f.initialize.payload.document_batch_id = f.value.batch_id = f.initialize.batch_id; }],
  ['non-object request', f => { f.initialize = null; }],
  ['non-object counts', f => { f.counts = null; }],
  ['missing source count', f => { delete f.counts.sales_header; }],
  ['unsafe source count', f => { f.counts.sales_header = Number.MAX_SAFE_INTEGER + 1; }],
  ['non-object totals', f => { f.totals = null; }],
  ['missing source total', f => { delete f.totals.inventory_quantity; }],
  ['inexact source total', f => { f.totals.sales_net_due_cents = '0.1'; }],
]) {
  test(`${name} rejects before opening a transaction`, async () => {
    const f = fixture(); change(f);
    assert.throws(() => compareWholePackageSource(f.value, f.initialize, f.counts, f.totals), /VERIFY_SOURCE_INPUT_INVALID/);
    const c = client(f.value);
    await assert.rejects(reconcile(c, f), /VERIFY_SOURCE_INPUT_INVALID/);
    assert.deepEqual(c.calls, []);
    assert.equal(c.discarded, 0);
  });
}

test('concurrent reconciliation cannot issue a second BEGIN on the same client', async () => {
  const f = fixture();
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const c = client(f.value, { onBegin: () => blocked });
  const pending = reconcile(c, f);
  const second = assert.rejects(reconcile(c, f), /VERIFY_CLIENT_UNAVAILABLE/);
  const simultaneousCalls = c.calls.length;
  release();
  await second;
  assert.equal(simultaneousCalls, 1);
  assert.equal((await pending).state, 'VERIFIED');
});

test('input snapshot getter cannot reenter and issue a second BEGIN on the same client', async () => {
  const f = fixture();
  let release, nested;
  const blocked = new Promise(resolve => { release = resolve; });
  const c = client(f.value, { onBegin: () => blocked });
  Object.defineProperty(f.initialize, 'plan_sha256', { enumerable: true, get() {
    nested = reconcile(c, fixture());
    return 'a'.repeat(64);
  } });
  const outer = assert.rejects(reconcile(c, f), /VERIFY_CLIENT_UNAVAILABLE/);
  const simultaneousCalls = c.calls.length;
  release();
  const [, innerResult] = await Promise.all([outer, nested]);
  assert.equal(simultaneousCalls, 1);
  assert.equal(innerResult.state, 'VERIFIED');
  assert.equal(c.calls.filter(sql => sql.startsWith('BEGIN')).length, 1);
  assert.equal((await reconcile(c, fixture())).state, 'VERIFIED');
});

for (const options of [{ badFirstRollback: true }, { badFirstRollback: true, discardError: true }, { badBegin: true }]) {
  test(`uncertain transaction stays quarantined ${JSON.stringify(options)}`, async () => {
    const f = fixture(), c = client(f.value, options);
    const first = await reconcile(c, f);
    assert.equal(first.state, 'VERIFICATION_UNKNOWN');
    assert.equal(c.discarded, 1);
    const previousCalls = c.calls.length;
    await assert.rejects(reconcile(c, f), /VERIFY_CLIENT_UNAVAILABLE/);
    assert.equal(c.calls.length, previousCalls);
    assert.equal(c.discarded, 1);
    assert.doesNotMatch(JSON.stringify(first), /synthetic-private/);
  });
}

test('acknowledged rollback releases the client for exact same-key verification', async () => {
  const f = fixture(), c = client(f.value);
  assert.equal((await reconcile(c, f)).state, 'VERIFIED');
  assert.equal((await reconcile(c, f)).state, 'VERIFIED');
  assert.equal(c.calls.filter(sql => sql.startsWith('BEGIN')).length, 2);
  assert.equal(c.calls.filter(sql => sql === 'ROLLBACK').length, 2);
  assert.equal(c.discarded, 0);
});

test('rejected verification with acknowledged rollback does not quarantine the client', async () => {
  const f = fixture(), options = { selectError: true }, c = client(f.value, options);
  assert.equal((await reconcile(c, f)).state, 'VERIFICATION_FAILED');
  options.selectError = false;
  assert.equal((await reconcile(c, f)).state, 'VERIFIED');
  assert.equal(c.discarded, 0);
});

test('same-key recovery on a different client remains possible after uncertainty', async () => {
  const f = fixture(), uncertain = client(f.value, { badFirstRollback: true });
  assert.equal((await reconcile(uncertain, f)).state, 'VERIFICATION_UNKNOWN');
  assert.equal((await reconcile(client(f.value), f)).state, 'VERIFIED');
});
