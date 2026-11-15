import test from 'node:test';
import assert from 'node:assert/strict';
import {executeBatchedStreamImport} from './source/tools/unified-import/batched-stream-client.mjs';
import {requestHash} from '../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/request-hash.ts';

const identity = {batchId: 'baseline', documentBatchId: 'documents', packageSha256: 'f'.repeat(64),
  planSha256: 'a'.repeat(64), namespace: 'SYNTHETIC', cutoffAt: '2026-11-11T10:00:00+08:00'};
const fullIdentity = {...identity, rootOperationId: 'root'};
const batches = ['CORE', 'FINALIZE'].map((phase, ordinal) => {
  const descriptor = {phase, ordinal, first: ordinal, last: ordinal, rows: 0, bytes: 0,
    subBatchId: 'group-' + ordinal, predecessor: ordinal ? 'group-0' : null};
  return {...descriptor, descriptorSha256: requestHash({identity: fullIdentity, descriptor})};
});
const plan = {metadata: {identity, rootOperationId: 'root', batchCount: 2},
  batches() { return batches; }, async *steps(batch) { yield {request: {operation_id: 'original-' + batch.ordinal}}; }};

test('borrowed client remains with host after acknowledged commits or rollback and is discarded on UNKNOWN', async () => {
  for (const scenario of ['complete', 'rollback', 'unknown']) {
    let discarded = 0, begins = 0;
    const client = {async discard() { discarded++; }, async query(sql) {
      if (sql.startsWith('BEGIN')) { begins++; return {command: 'BEGIN'}; }
      if (sql === 'COMMIT' && scenario === 'unknown') throw Error('COMMIT_REPLY_LOST');
      return {command: sql.startsWith('SET ') ? 'SET' : sql};
    }};
    const kernel = () => ({
      async lockAndInspect() { return {state: 'ABSENT'}; },
      async applyStep() { if (scenario === 'rollback') throw Error('APPLY_FAILED'); },
      async complete(client, identity, batch) { return {subBatchId: batch.subBatchId,
        descriptorSha256: batch.descriptorSha256, summary: batch.phase === 'FINALIZE' ? {} : null}; },
    });
    const result = await executeBatchedStreamImport(plan, async () => client, kernel, {borrowedClient: true});
    assert.equal(result.state, {complete: 'COMPLETED', rollback: 'ROLLED_BACK', unknown: 'UNKNOWN'}[scenario]);
    assert.equal(discarded, scenario === 'unknown' ? 1 : 0);
    assert.equal(begins, scenario === 'complete' ? 2 : 1);
    assert.equal(result.businessReady, false);
  }
});
