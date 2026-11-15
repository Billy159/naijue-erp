import {requestHash} from '../../../../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/request-hash.ts';

function committed(found, batch) {
  if (found.state !== 'COMMITTED') return false;
  if (found.subBatchId !== batch.subBatchId || found.descriptorSha256 !== batch.descriptorSha256) {
    throw Error('BATCH_COMMITTED_IDENTITY_CONFLICT');
  }
  return true;
}

async function acknowledge(client, sql, command) {
  const reply = await client.query(sql);
  if (reply?.command !== command) throw Error('BATCH_TRANSACTION_ACK_INVALID');
}

// D1 owns these concrete kernel methods and their SQL. lockAndInspect must
// serialize competing writers, verify root/version/predecessor, and read the
// durable receipt. complete writes that receipt in this business transaction.
// No local flag or old whole-package pending receipt is used as commit proof.
export async function executeBatchedStreamImport(plan, openClient, createKernel, {borrowedClient = false} = {}) {
  const identity = Object.freeze({...structuredClone(plan.metadata.identity), rootOperationId: plan.metadata.rootOperationId});
  let completedBatches = 0;
  let skippedBatches = 0;
  let finalSummary = null;
  for (const incoming of plan.batches()) {
    const batch = Object.freeze(structuredClone(incoming));
    const {descriptorSha256, ...descriptor} = batch;
    if (requestHash({identity, descriptor}) !== descriptorSha256) throw Error('BATCH_DESCRIPTOR_CHANGED');
    let client;
    let began = false;
    let commitAttempted = false;
    let inspectedAbsent = false;
    let reusable = false;
    let existing = false;
    let stage = 'OPEN';
    try {
      client = await openClient();
      const kernel = createKernel();
      stage = 'BEGIN';
      await acknowledge(client, 'BEGIN ISOLATION LEVEL READ COMMITTED', 'BEGIN');
      began = true;
      stage = 'INSPECT';
      const found = await kernel.lockAndInspect(client, identity, batch);
      existing = committed(found, batch);
      if (!existing) {
        if (found.state !== 'ABSENT') throw Error('BATCH_STATE_UNRESOLVED');
        inspectedAbsent = true;
        stage = 'APPLY';
        let ordinal = batch.first;
        for await (const step of plan.steps(batch)) {
          await kernel.applyStep(client, identity, batch, step, ordinal++);
        }
        if (ordinal !== batch.last + 1) throw Error('BATCH_PLAN_RANGE_INCOMPLETE');
        // D1 performs phase-specific verification and writes both business
        // changes and this batch's success receipt before the single COMMIT.
        stage = 'COMPLETE';
        const finished = await kernel.complete(client, identity, batch);
        if (finished.subBatchId !== batch.subBatchId || finished.descriptorSha256 !== batch.descriptorSha256) {
          throw Error('BATCH_COMPLETE_IDENTITY_CONFLICT');
        }
        if (batch.phase === 'FINALIZE') {
          if (finished.summary === null || typeof finished.summary !== 'object') throw Error('BATCH_FINAL_SUMMARY_MISSING');
          finalSummary = finished.summary;
        }
        stage = 'CONSTRAINTS';
        await acknowledge(client, 'SET CONSTRAINTS ALL IMMEDIATE', 'SET');
      } else if (batch.phase === 'FINALIZE') {
        if (found.summary === null || typeof found.summary !== 'object') throw Error('BATCH_FINAL_SUMMARY_MISSING');
        finalSummary = found.summary;
      }
      stage = 'COMMIT';
      commitAttempted = true;
      await acknowledge(client, 'COMMIT', 'COMMIT');
      began = false;
      reusable = true;
      if (existing) skippedBatches++;
      else completedBatches++;
    } catch (error) {
      if (began && !commitAttempted) {
        try {
          await acknowledge(client, 'ROLLBACK', 'ROLLBACK');
          reusable = inspectedAbsent;
          // Rolling back this read transaction says nothing about a previous
          // writer's uncertain COMMIT. Only a locked ABSENT permits ROLLED_BACK.
          return {state: inspectedAbsent ? 'ROLLED_BACK' : 'UNKNOWN', subBatchId: batch.subBatchId, stage,
            completedBatches, skippedBatches, businessReady: false};
        } catch {}
      }
      // End this invocation. Resumption opens a new connection and asks D1's
      // lockAndInspect with this same immutable key before reading its steps.
      return {state: 'UNKNOWN', subBatchId: batch.subBatchId, stage,
        completedBatches, skippedBatches, businessReady: false};
    } finally {
      if (client && (!borrowedClient || !reusable)) try { await client.discard(); } catch {}
    }
  }
  if (completedBatches + skippedBatches !== plan.metadata.batchCount || finalSummary === null) {
    throw Error('BATCH_ROOT_INCOMPLETE');
  }
  return {state: 'COMPLETED', completedBatches, skippedBatches, summary: finalSummary,
    businessReady: false};
}
