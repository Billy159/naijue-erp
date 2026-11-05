import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWholePackage } from '../tools/unified-import/whole-package-inspect.ts';
import { verifyWholePackageAfterCommit } from '../tools/unified-import/whole-package-verify.ts';
import { reconcileWholePackage } from '../tools/unified-import/whole-package-reconcile.mjs';
import { STANDARD_MASTER_TABLES } from '../packages/application/src/unified-import-execution.ts';
const secret = 'naijue:scrypt:1:32768:8:1:' + 'c'.repeat(32) + ':' + 'd'.repeat(128);
const init = () => ({ plan_sha256: 'a'.repeat(64), batch_id: '00000000-0000-4000-8000-000000000001', payload: { document_batch_id: '00000000-0000-4000-8000-000000000002' } });
const receipt = request => ({ verified: true, verification_profile: 'STANDARD_WHOLE_PACKAGE_VERIFY_V2', protocol: 'STANDARD_IMPORT_SQL_V1', plan_sha256: request.plan_sha256, baseline_batch_id: request.batch_id, batch_id: request.payload.document_batch_id });
function client(value, mutate) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith('BEGIN')) { mutate(); return { command: 'BEGIN' }; }
    if (sql.startsWith('SET')) return { command: 'SET' };
    if (sql.startsWith('SELECT')) return { command: 'SELECT', rows: [{ result_json: JSON.stringify(value) }] };
    return { command: sql };
  }, discard() { assert.fail('No uncertainty expected'); } };
}
test('original-key inspection snapshots both identity and nested initialization before BEGIN', async () => {
  const request = init(), identity = { packageSha256: 'b'.repeat(64), planSha256: request.plan_sha256 };
  const original = structuredClone({ request, identity });
  const c = client(null, () => { request.payload.document_batch_id = 'changed'; identity.planSha256 = 'c'.repeat(64); });
  const kernel = { async lockAndInspect(_client, actualIdentity, actualRequest) {
    assert.deepEqual(actualIdentity, original.identity); assert.deepEqual(actualRequest, original.request);
    return { state: 'COMMITTED', ...original.identity, summary: { exact: true } };
  } };
  assert.equal((await inspectWholePackage(c, identity, request, kernel)).state, 'COMMITTED_RECEIPT_FOUND');
  assert.deepEqual(c.calls.map(x => x.sql), ['BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY', 'ROLLBACK']);
});
test('postcommit verification sends and compares the original initialization despite caller mutation', async () => {
  const request = init(), original = structuredClone(request);
  const c = client(receipt(original), () => { request.plan_sha256 = 'c'.repeat(64); request.payload.document_batch_id = 'changed'; });
  assert.equal((await verifyWholePackageAfterCommit(c, request, secret)).state, 'VERIFIED');
  assert.deepEqual(JSON.parse(c.calls.find(x => x.sql.startsWith('SELECT')).values[0]), original);
});
test('source reconciliation snapshots counts, exact totals and initialization before any await', async () => {
  const request = init(), original = structuredClone(request);
  const counts = Object.fromEntries([...STANDARD_MASTER_TABLES, 'sales_header', 'sales_line', 'sales_settlement', 'transfer_header', 'transfer_line', 'inventory_baseline'].map(t => [t, 0]));
  const totals = { inventory_quantity: '0', sales_quantity: '0', sales_line_amount_cents: '0', sales_net_due_cents: '0', settlement_amount_cents: '0', transfer_quantity: '0' };
  const zeroTotals = { inventory_quantity: '0', sales_quantity: '0', sales_line_amount: '0', sales_net_due: '0', sales_settlement_amount: '0', transfer_quantity: '0' };
  const value = { ...receipt(original), scope: 'CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED', unknown_keys_materialized: false,
    source_counts: { ...Object.fromEntries(Object.entries(counts).filter(([k]) => k !== 'inventory_baseline').map(([k, v]) => [k.toUpperCase(), v])), INVENTORY_KEY: 0, IMPORT_BATCH: 3 }, source_totals: zeroTotals, current_totals: zeroTotals,
    document_summary: { verified_count: 0, changed_after_import_count: 0 }, inventory_summary: { verified_key_count: 0 },
    inventory_coverage: { scope: 'EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS', explicit_source_keys: 0, explicit_zero_keys: 0, post_cutoff_effect_keys: 0, unknown_combinations_not_enumerated: true, complete_total_inventory: false } };
  const c = client(value, () => { request.payload.document_batch_id = 'changed'; counts.sales_header = 1; totals.sales_net_due_cents = '1'; });
  assert.equal((await reconcileWholePackage(c, request, secret, counts, totals)).state, 'VERIFIED');
  assert.deepEqual(JSON.parse(c.calls.find(x => x.sql.startsWith('SELECT')).values[0]), original);
  assert.equal(c.calls.at(-1).sql, 'ROLLBACK');
});
test('postcommit verification rejects a receipt matching only caller-mutated identity', async () => {
  const request = init(), changed = { ...request, plan_sha256: 'c'.repeat(64) };
  const c = client(receipt(changed), () => { request.plan_sha256 = changed.plan_sha256; });
  assert.equal((await verifyWholePackageAfterCommit(c, request, secret)).state, 'VERIFICATION_FAILED');
  assert.equal(c.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(c.calls.some(x => x.sql === 'COMMIT'), false);
});
test('uncloneable initialization fails before opening a verification transaction', async () => {
  const c = client(null, () => assert.fail('SQL must not start'));
  await assert.rejects(verifyWholePackageAfterCommit(c, { ...init(), unexpected: () => {} }, secret));
  assert.deepEqual(c.calls, []);
});
