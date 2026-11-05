import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWholePackage } from '../tools/unified-import/whole-package-client.ts';
const identity = { batchId: '11111111-1111-4111-8111-111111111111', documentBatchId: '22222222-2222-4222-8222-222222222222', packageSha256: 'a'.repeat(64), planSha256: 'b'.repeat(64), namespace: 'synthetic', cutoffAt: '2026-11-02T04:00:00Z' };
const request = (n, batch, payload) => ({ protocol: 'STANDARD_IMPORT_SQL_V1', operation_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, request_key: `synthetic-${n}`, batch_id: batch, package_manifest_sha256: identity.packageSha256, plan_sha256: identity.planSha256, namespace: identity.namespace, cutoff_at: identity.cutoffAt, payload });
const initialize = request(1, identity.batchId, { document_batch_id: identity.documentBatchId });
function fixture(fault) {
  const calls = []; let discarded = 0, closed = 0;
  const client = { async query(sql) {
    calls.push(sql);
    if (sql === fault.sql) { if (fault.throw) throw Error('SYNTHETIC_FAILURE'); return { command: 'INVALID' }; }
    return { command: sql.startsWith('BEGIN') ? 'BEGIN' : sql.startsWith('SET') ? 'SET' : sql };
  }, discard() { discarded++; if (fault.discardThrows) throw Error('DISCARD_FAILED'); } };
  const kernel = { async lockAndInspect() { return { state: 'ABSENT' }; }, async initialize() {}, async applyStep() { if (fault.apply) throw Error('SYNTHETIC_FAILURE'); }, async summarize() { if (fault.summary) throw Error('SYNTHETIC_FAILURE'); return {}; } };
  async function* steps() { try {
    yield { method: 'publish', request: request(2, identity.batchId, { phase: 'BASELINE' }) };
    if (fault.iterator) throw Error('SYNTHETIC_FAILURE');
    yield { method: 'documentChunk', request: request(3, identity.documentBatchId, { mode: 'STAGE' }) };
    yield { method: 'publish', request: request(4, identity.documentBatchId, { phase: 'DOCUMENTS' }) };
  } finally { closed++; } }
  return { calls, client, kernel, steps, get discarded() { return discarded; }, get closed() { return closed; } };
}
for (const [name, fault, expected, rollback] of [
  ['begin rejected', { sql: 'BEGIN ISOLATION LEVEL READ COMMITTED', throw: true }, 'UNKNOWN', 0],
  ['begin ack malformed', { sql: 'BEGIN ISOLATION LEVEL READ COMMITTED' }, 'UNKNOWN', 0],
  ['iterator failed', { iterator: true }, 'ROLLED_BACK', 1],
  ['apply failed', { apply: true }, 'ROLLED_BACK', 1],
  ['summary failed', { summary: true }, 'ROLLED_BACK', 1],
  ['constraint SQL rejected', { sql: 'SET CONSTRAINTS ALL IMMEDIATE', throw: true }, 'ROLLED_BACK', 1],
  ['constraint ack uncertain', { sql: 'SET CONSTRAINTS ALL IMMEDIATE' }, 'UNKNOWN', 0],
  ['commit ack uncertain', { sql: 'COMMIT' }, 'UNKNOWN', 0],
  ['commit lost and discard failed', { sql: 'COMMIT', throw: true, discardThrows: true }, 'UNKNOWN', 0],
  ['rollback rejected', { apply: true, sql: 'ROLLBACK', throw: true }, 'UNKNOWN', 1],
]) test(`transaction closure: ${name}`, async () => {
  const f = fixture(fault);
  const result = await executeWholePackage(f.client, identity, initialize, f.steps(), f.kernel);
  assert.equal(result.state, expected);
  assert.equal(f.calls.filter(x => x === 'ROLLBACK').length, rollback);
  assert.equal(f.discarded, expected === 'UNKNOWN' ? 1 : 0);
  if (!fault.sql?.startsWith('BEGIN')) assert.equal(f.closed, 1);
  if (expected === 'UNKNOWN') {
    const before = f.calls.length;
    await assert.rejects(executeWholePackage(f.client, identity, initialize, f.steps(), f.kernel), /CLIENT_UNAVAILABLE/);
    assert.equal(f.calls.length, before);
  }
});
