import {isNodeScryptPasswordHash} from '../../packages/authentication/src/passwords.ts';
import {assertPublicValuesExcludePrivateInputs} from './execution-client.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {decodeBatchedInspectReply, decodeBatchedStepReply, decodeBatchedCompleteReply,
  batchedStepPhase} from './batched-stream-sql-reply.mjs';

const IMPORTER = 'SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2';
const INITIALIZER = 'SET LOCAL ROLE erp_unified27_initializer_2393dbc6db9581c2';
const INSPECT = 'SELECT naijue_erp.standard_batched_import_inspect_v1($1::jsonb,$2::jsonb)::text AS result_json';
const STEP = 'SELECT naijue_erp.standard_batched_import_step_v1($1::jsonb,$2::jsonb,$3::integer,$4::text,$5::jsonb,$6::text)::text AS result_json';
const COMPLETE = 'SELECT naijue_erp.standard_batched_import_complete_v1($1::jsonb,$2::jsonb)::text AS result_json';

// Source adapter for the registered D1 signatures. The reviewed host owns
// connection authorization/allowed SQL. This module opens no connection and
// installs no SQL. A fresh adapter belongs to one client's one work group.
export function createBatchedStreamSqlKernel(encodedScrypt) {
  if (!isNodeScryptPasswordHash(encodedScrypt)) throw Error('PRIVATE_CREDENTIAL_FORMAT_INVALID');
  let boundClient = null;
  let identityJson;
  let batchJson;
  let identityHash;
  let batchHash;
  let nextOrdinal;
  let stage = 'NEW';

  function bound(client, identity, batch) {
    if (boundClient !== client || requestHash(identity) !== identityHash || requestHash(batch) !== batchHash) {
      throw Error('BATCH_KERNEL_BINDING_INVALID');
    }
  }
  async function role(client, sql) {
    if ((await client.query(sql))?.command !== 'SET') throw Error('ROLE_ACK_INVALID');
  }
  return Object.freeze({
    async lockAndInspect(client, identity, batch) {
      if (stage !== 'NEW') throw Error('BATCH_KERNEL_ORDER_INVALID');
      boundClient = client;
      identityJson = JSON.stringify(identity);
      batchJson = JSON.stringify(batch);
      assertPublicValuesExcludePrivateInputs(identity, [encodedScrypt]);
      assertPublicValuesExcludePrivateInputs(batch, [encodedScrypt]);
      identityHash = requestHash(identity);
      batchHash = requestHash(batch);
      await role(client, IMPORTER);
      const result = decodeBatchedInspectReply(await client.query(INSPECT, [identityJson, batchJson]), identity, batch);
      nextOrdinal = batch.first;
      stage = result.state === 'ABSENT' ? 'ABSENT' : 'COMMITTED';
      return result;
    },
    async applyStep(client, identity, batch, step, ordinal) {
      bound(client, identity, batch);
      if (stage !== 'ABSENT' || ordinal !== nextOrdinal || ordinal > batch.last) throw Error('BATCH_KERNEL_ORDER_INVALID');
      const owned = JSON.parse(JSON.stringify(step));
      const phase = batchedStepPhase(owned);
      if ((ordinal === 0) !== (phase === 'INITIALIZE')) throw Error('BATCH_KERNEL_ORDER_INVALID');
      const request = owned.request;
      assertPublicValuesExcludePrivateInputs(request, [encodedScrypt]);
      if (request.package_manifest_sha256 !== identity.packageSha256 || request.plan_sha256 !== identity.planSha256
        || request.namespace !== identity.namespace || request.cutoff_at !== identity.cutoffAt
        || (ordinal === batch.first && request.operation_id !== batch.firstOperationId)
        || (ordinal === batch.last && request.operation_id !== batch.lastOperationId)) throw Error('BATCH_REQUEST_BINDING_INVALID');
      if (phase === 'INITIALIZE') await role(client, INITIALIZER);
      decodeBatchedStepReply(await client.query(STEP, [identityJson, batchJson, ordinal, phase,
        JSON.stringify(request), phase === 'INITIALIZE' ? encodedScrypt : null]), batch, owned, ordinal);
      if (phase === 'INITIALIZE') await role(client, IMPORTER);
      nextOrdinal++;
    },
    async complete(client, identity, batch) {
      bound(client, identity, batch);
      if (stage !== 'ABSENT' || nextOrdinal !== batch.last + 1) throw Error('BATCH_KERNEL_ORDER_INVALID');
      const result = decodeBatchedCompleteReply(await client.query(COMPLETE, [identityJson, batchJson]), identity, batch);
      stage = 'DONE';
      return result;
    },
  });
}
