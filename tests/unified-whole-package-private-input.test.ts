import test from 'node:test';
import assert from 'node:assert/strict';
import { createWholePackageSqlKernel } from '../tools/unified-import/whole-package-sql-kernel.ts';
import type { StandardImportRequest } from '../packages/application/src/unified-import-execution.ts';

// Synthetic, structurally valid encoded value. No real credential or database.
const encoded = 'naijue:scrypt:1:32768:8:1:' + 'c'.repeat(32) + ':' + 'd'.repeat(128);
const identity = { batchId: '11111111-1111-4111-8111-111111111111', documentBatchId: '22222222-2222-4222-8222-222222222222', packageSha256: 'a'.repeat(64), planSha256: 'b'.repeat(64), namespace: 'synthetic-private-boundary', cutoffAt: '2026-11-02T04:00:00Z' };
const request = (): StandardImportRequest => ({ protocol: 'STANDARD_IMPORT_SQL_V1', operation_id: '33333333-3333-4333-8333-333333333333', request_key: 'synthetic', batch_id: identity.batchId, plan_sha256: identity.planSha256, package_manifest_sha256: identity.packageSha256, namespace: identity.namespace, cutoff_at: identity.cutoffAt, payload: { document_batch_id: identity.documentBatchId } });
function client(onRole?: () => Promise<void>) {
  const calls: { sql: string; values: unknown[] }[] = [];
  return { calls, async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    if (sql.startsWith('BEGIN')) return { command: 'BEGIN' };
    if (sql === 'COMMIT' || sql === 'ROLLBACK') return { command: sql };
    if (sql === 'SET CONSTRAINTS ALL IMMEDIATE') return { command: 'SET' };
    if (sql.startsWith('SET LOCAL')) { await onRole?.(); return { command: 'SET' }; }
    let result: unknown;
    if (sql.includes('_inspect_v2')) result = { state: 'ABSENT' };
    else if (sql.includes('_finish_v2')) result = { state: 'PENDING_TRANSACTION', summary: {} };
    else {
      const r = JSON.parse(String(values[sql.includes('_step_v2') ? 3 : 0]));
      result = { protocol: 'STANDARD_IMPORT_SQL_V1', operation_id: r.operation_id, batch_id: r.batch_id, request_sha256: 'e'.repeat(64), state: 'PENDING_TRANSACTION', sequence: 0, cursor: 0, receipt: {} };
    }
    return { command: 'SELECT', rows: [{ result_json: JSON.stringify(result) }] };
  }, async discard() {} };
}

test('validation checks the actual JSON produced by a custom serializer', async () => {
  const c = client(), r = request();
  r.payload.toJSON = () => ({ document_batch_id: identity.documentBatchId, note: encoded });
  await assert.rejects(createWholePackageSqlKernel(encoded).lockAndInspect(c, identity, r), /PRIVATE_VALUE_IN_PUBLIC_REQUEST/);
  assert.deepEqual(c.calls, []);
});

for (const [name, payload] of [
  ['ordinary field', { staff_name: encoded }],
  ['nested row', { rows: [{ fields: { name: encoded } }] }],
  ['substring', { note: 'prefix ' + encoded + ' suffix' }],
  ['object key', { [encoded]: 'ordinary value' }],
] as const) {
  test(`inspection rejects private value in ${name} before any SQL`, async () => {
    const c = client(), r = request(); r.payload = { ...r.payload, ...payload };
    await assert.rejects(createWholePackageSqlKernel(encoded).lockAndInspect(c, identity, r), /PRIVATE_VALUE_IN_PUBLIC_REQUEST/);
    assert.deepEqual(c.calls, []);
  });
  test(`document/master step rejects private value in ${name} before SQL`, async () => {
    const c = client(), r = request(), kernel = createWholePackageSqlKernel(encoded);
    await kernel.lockAndInspect(c, identity, r); await kernel.initialize(c, identity, r);
    const previousCalls = c.calls.length;
    await assert.rejects(kernel.applyStep(c, { method: 'masterChunk', request: { ...r, payload: { rows: [], ...payload } } }, 1), /PRIVATE_VALUE_IN_PUBLIC_REQUEST/);
    assert.equal(c.calls.length, previousCalls);
  });
}

test('inspection snapshots the exact public request before awaiting role acknowledgement', async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const c = client(() => hold), r = request(), original = structuredClone(r), kernel = createWholePackageSqlKernel(encoded);
  const pending = kernel.lockAndInspect(c, identity, r);
  r.payload.note = encoded;
  release();
  assert.equal((await pending).state, 'ABSENT');
  const sent = c.calls.find(x => x.sql.includes('_inspect_v2'))!;
  assert.deepEqual(JSON.parse(String(sent.values[0])), original);
  assert.equal(sent.values[1], encoded);
  await kernel.initialize(c, identity, original);
});

test('legitimate private parameters stay separate from public initialization and rows', async () => {
  const c = client(), r = request(), kernel = createWholePackageSqlKernel(encoded);
  await kernel.lockAndInspect(c, identity, r); await kernel.initialize(c, identity, r);
  await kernel.applyStep(c, { method: 'masterChunk', request: { ...r, payload: { rows: [{ fields: { name: 'synthetic ordinary business value' } }] } } }, 1);
  for (const call of c.calls) {
    assert.equal(call.sql.includes(encoded), false);
    if (call.sql.includes('_inspect_v2') || call.sql.includes('_prepare_v2')) {
      assert.equal(String(call.values[0]).includes(encoded), false);
      assert.equal(call.values[1], encoded);
    }
    if (call.sql.includes('_step_v2')) assert.equal(JSON.stringify(call.values).includes(encoded), false);
  }
});

test('whole-package coordinator rolls back before a contaminated row reaches the SQL step', async () => {
  const { executeWholePackage } = await import('../tools/unified-import/whole-package-client.ts');
  const c = client(), r = request();
  async function* steps() {
    yield { method: 'masterChunk' as const, request: { ...r, payload: { rows: [{ fields: { name: encoded } }] } } };
  }
  const result = await executeWholePackage(c, identity, r, steps(), createWholePackageSqlKernel(encoded));
  assert.deepEqual(result, { state: 'ROLLED_BACK', code: 'PRIVATE_VALUE_IN_PUBLIC_REQUEST' });
  assert.equal(c.calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(c.calls.some(call => call.sql === 'COMMIT' || call.sql.includes('_step_v2')), false);
  assert.equal(JSON.stringify(result).includes(encoded), false);
});
