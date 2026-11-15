import {parseStrictJson} from '../../packages/application/src/unified-import-contract.ts';

function resultObject(reply) {
  if (reply?.command !== 'SELECT' || !Array.isArray(reply.rows) || reply.rows.length !== 1
    || typeof reply.rows[0]?.result_json !== 'string'
    || Buffer.byteLength(reply.rows[0].result_json) > 65536) throw Error('BATCH_SQL_REPLY_INVALID');
  const result = parseStrictJson(reply.rows[0].result_json);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('BATCH_SQL_REPLY_INVALID');
  return result;
}

function bind(result, batch, names) {
  if (Object.keys(result).sort().join(',') !== names
    || result.subBatchId !== batch.subBatchId || result.descriptorSha256 !== batch.descriptorSha256) {
    throw Error('BATCH_SQL_REPLY_BINDING_INVALID');
  }
}

function summary(result, identity, batch) {
  if (result.state === 'ABSENT' || batch.phase !== 'FINALIZE') {
    if (result.summary !== null) throw Error('BATCH_SQL_SUMMARY_INVALID');
    return;
  }
  const value = result.summary;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'batchId,documentBatchId,packageSha256,planSha256,rootOperationId,status'
    || value.status !== 'IMPORTED'
    || !['rootOperationId', 'batchId', 'documentBatchId', 'packageSha256', 'planSha256']
      .every(key => value[key] === identity[key])) throw Error('BATCH_SQL_SUMMARY_INVALID');
}

export function decodeBatchedInspectReply(reply, identity, batch) {
  const result = resultObject(reply);
  bind(result, batch, 'descriptorSha256,state,subBatchId,summary');
  if (!['ABSENT', 'COMMITTED'].includes(result.state)) throw Error('BATCH_SQL_INSPECT_STATE_INVALID');
  summary(result, identity, batch);
  return result;
}

export function decodeBatchedStepReply(reply, batch, step, ordinal) {
  const result = resultObject(reply);
  bind(result, batch, 'descriptorSha256,operationId,ordinal,state,subBatchId');
  if (result.state !== 'PENDING_TRANSACTION' || result.operationId !== step.request.operation_id
    || result.ordinal !== ordinal) throw Error('BATCH_SQL_STEP_STATE_INVALID');
  return result;
}

export function decodeBatchedCompleteReply(reply, identity, batch) {
  const result = resultObject(reply);
  bind(result, batch, 'descriptorSha256,state,subBatchId,summary');
  if (result.state !== 'PENDING_TRANSACTION') throw Error('BATCH_SQL_COMPLETE_STATE_INVALID');
  summary(result, identity, batch);
  return result;
}

export function batchedStepPhase(step) {
  switch (step.method) {
    case 'initialize': return 'INITIALIZE';
    case 'masterChunk': return 'MASTER';
    case 'baselineKeys': return 'KEYS';
    case 'documentChunk': return 'DOCUMENTS';
    case 'publish': return 'PUBLISH';
    default: throw Error('BATCH_STEP_INVALID');
  }
}
