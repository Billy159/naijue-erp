import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareCliBatchedState} from './source/tools/unified-import/batched-stream-cli-state.mjs';
import {runBatchedStreamOperation} from './source/tools/unified-import/batched-stream-operation.mjs';

const identity = {batchId: 'baseline', documentBatchId: 'documents', packageSha256: 'f'.repeat(64),
  planSha256: 'a'.repeat(64), namespace: 'SYNTHETIC', cutoffAt: '2026-11-11T10:00:00+08:00'};
function program() {
  let index = 0;
  const request = (payload, documents = false) => ({operation_id: 'operation-' + index++,
    batch_id: documents ? identity.documentBatchId : identity.batchId,
    package_manifest_sha256: identity.packageSha256, plan_sha256: identity.planSha256,
    namespace: identity.namespace, cutoff_at: identity.cutoffAt, payload});
  return {identity, initialize: request({document_batch_id: identity.documentBatchId}),
    steps: (async function* () {
      yield {method: 'publish', request: request({phase: 'BASELINE'})};
      yield {method: 'documentChunk', request: request({mode: 'STAGE'}, true)};
      yield {method: 'publish', request: request({phase: 'DOCUMENTS'}, true)};
    })()};
}
async function state() {
  const path = join(await mkdtemp(join(tmpdir(), 'd3-host-snapshot-')), 'plan.sqlite');
  return prepareCliBatchedState(path, program(), {manifestSha256: identity.packageSha256}, {counts: {}}, {});
}

test('host scan and successful group skips share the same live SQLite object and CLI owns its close', async () => {
  const snapshot = await state();
  let closed = 0;
  const originalClose = snapshot.close;
  snapshot.close = () => { closed++; originalClose(); };
  try {
    let hostReads = 0;
    for (const group of snapshot.batches()) for await (const step of snapshot.steps(group)) {
      assert.ok(step.request.operation_id);
      hostReads++;
    }
    assert.equal(hostReads, snapshot.metadata.stepCount);
    assert.equal(typeof snapshot.path, 'string');
    snapshot.steps = () => { assert.fail('D3 skip must not reread successful steps after the host scan'); };
    const client = {async discard() { assert.fail('borrowed successful client belongs to host'); }, async query(sql) {
      return {command: sql.startsWith('BEGIN') ? 'BEGIN' : 'COMMIT'};
    }};
    const kernel = () => ({async lockAndInspect(client, identity, group) {
      return {state: 'COMMITTED', subBatchId: group.subBatchId, descriptorSha256: group.descriptorSha256,
        summary: group.phase === 'FINALIZE' ? {} : null};
    }});
    const result = await runBatchedStreamOperation({planPath: '/must-not-reopen-a-second-snapshot', preparedPlan: snapshot,
      identity, openClient: async () => client, createKernel: kernel, borrowedClient: true});
    assert.equal(result.state, 'COMPLETED');
    assert.equal(result.skippedBatches, 4);
    assert.equal(closed, 0);
    assert.equal([...snapshot.batches()].length, 4);
  } finally { snapshot.close(); }
  assert.equal(closed, 1);
});

test('borrowed snapshot rejects another plan identity before connecting and remains caller-owned', async () => {
  const snapshot = await state();
  try {
    await assert.rejects(() => runBatchedStreamOperation({preparedPlan: snapshot,
      identity: {...identity, planSha256: 'changed'}, openClient: async () => assert.fail('must not connect')}),
    /BATCH_PLAN_IDENTITY_MISMATCH/);
    assert.equal([...snapshot.batches()].length, 4);
  } finally { snapshot.close(); }
});
