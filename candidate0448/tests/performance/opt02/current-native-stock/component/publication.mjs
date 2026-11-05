/** New reference-only original producer. No pool construction or old b001 authority. */
import { PostgresCutoffImportStore } from '../../../../../adapters/postgres/src/inventory-cutoff-import-store.ts';
import { createCutoffImportService } from '../../../../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../../../../packages/application/src/request-hash.ts';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
import { assertFixture, need, freeze } from './fixture.mjs';
import { createReferenceSourceAuthorizer } from './authorizer.mjs';

export function createReferencePublication(options) {
  const { fixture: input, pool, readArtifact, now, beforeCommand, onAcknowledged } = captureData(options,
    ['fixture', 'pool', 'readArtifact', 'now', 'beforeCommand', 'onAcknowledged']);
  const fixture = assertFixture(input);
  need(typeof pool?.connect === 'function' && typeof now === 'function' && typeof beforeCommand === 'function'
    && typeof onAcknowledged === 'function', 'EXPLICIT_REFERENCE_POOL_CLOCK_SOURCE_OBSERVER_AND_ACK_REQUIRED');
  const authorization = createReferenceSourceAuthorizer(fixture, readArtifact), timestamps = [];
  const service = createCutoffImportService({ store: new PostgresCutoffImportStore(pool), authorization, now() {
    const value = now();
    need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && Number.isFinite(Date.parse(value)) && Date.parse(value) >= Date.parse(fixture.cutoffAt), 'TRUSTED_CURRENT_SOURCE_CLOCK_REQUIRED');
    timestamps.push(value); return value;
  } });
  let started = false;
  return freeze({ async execute() {
    need(!started, 'ONE_REFERENCE_PUBLICATION_ATTEMPT_NO_REPLAY'); started = true;
    await authorization.verify(); const results = [];
    for (let index = 0; index < fixture.commands.length; index++) {
      // Real host must verify all105 native/dictionary/source rows every stage,
      // and four nonzero +two absent balance pairs BEFORE index3/PUBLISH.
      await beforeCommand(index);
      const result = await service.execute(fixture.commands[index]);
      need(requestHash(result) === requestHash(fixture.expectedResults[index]), 'ORIGINAL_SERVICE_RESULT_DIFFERS_FROM_NEW_REFERENCE_SOURCE');
      need(timestamps.length === index + 1, 'ONE_ORIGINAL_TRUSTED_CLOCK_CALL_PER_NEW_COMMAND_REQUIRED');
      await onAcknowledged(index, result, timestamps[index]); results.push(result);
    }
    return freeze({ scope: fixture.scope, results, originalServiceResultsAcknowledged: 4,
      nativeExecutionMustBeProvedSeparately: true, runtimeOrCanonicalAuthority: false,
      noMaintainedSupplierOrProductCreated: true });
  } });
}

/** Only after successful original COMMIT acknowledgement. Never resolve unknown COMMIT by SQL. */
export async function verifyReferenceAcknowledgement(input, query, index, result, occurredAt) {
  const fixture = assertFixture(input);
  need(typeof query === 'function' && Number.isInteger(index) && index >= 0 && index < 4
    && typeof occurredAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(occurredAt),
  'ACKNOWLEDGED_REFERENCE_COMMAND_AND_TRUSTED_CLOCK_REQUIRED');
  need(requestHash(result) === requestHash(fixture.expectedResults[index]), 'EXACT_NEW_SOURCE_RESULT_REQUIRED');
  const command = fixture.commands[index], microstamp = occurredAt.slice(0, -1) + '000Z';
  const receipts = (await query(`/* current-reference:ack-receipt */ SELECT id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,
    to_char(completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed_at
    FROM naijue_erp.operation_receipt WHERE id=$1::uuid`, [result.operationId])).rows;
  need(receipts.length === 1, 'ONE_ACTUAL_REFERENCE_RECEIPT_REQUIRED'); const receipt = receipts[0];
  need(receipt.id === result.operationId && receipt.actor_account_id === command.actorAccountId && receipt.request_key === command.requestKey
    && receipt.request_hash === fixture.commandHashes[index] && receipt.action === command.action && receipt.target_type === 'IMPORT'
    && receipt.target_id === fixture.batchId && receipt.status === 'COMMITTED' && receipt.completed_at === microstamp
    && requestHash(receipt.result_data) === requestHash(result), 'ACTUAL_REFERENCE_RECEIPT_DIFFERS_FROM_SOURCE_COMMAND');
  const audits = (await query(`/* current-reference:ack-audit */ SELECT operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,
    to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') occurred_at
    FROM naijue_erp.audit_change WHERE operation_id=$1::uuid`, [result.operationId])).rows;
  need(audits.length === 1, 'ONE_ACTUAL_REFERENCE_AUDIT_REQUIRED'); const audit = audits[0];
  need(audit.operation_id === result.operationId && audit.actor_account_id === command.actorAccountId
    && audit.object_type === 'IMPORT' && audit.object_id === fixture.batchId && audit.action === command.action
    && audit.new_version === index + 1 && audit.old_version === (index === 0 ? null : index)
    && audit.occurred_at === microstamp
    && requestHash(audit.before_values) === requestHash(index === 0 ? null : fixture.checkpoints[index - 1])
    && requestHash(audit.after_values) === requestHash(fixture.checkpoints[index]), 'ACTUAL_REFERENCE_AUDIT_CHECKPOINT_DIFFERS_FROM_SOURCE');
  const effects = (await query('/* current-reference:ack-ledger */ SELECT id FROM naijue_erp.inventory_ledger WHERE operation_id=$1::uuid ORDER BY id', [result.operationId])).rows.map(row => row.id);
  need(requestHash(effects) === requestHash(result.ledgerEntryIds), 'ACTUAL_REFERENCE_LEDGER_IDS_DIFFER_FROM_SOURCE');
  return freeze({ commandIndex: index, action: command.action, sequence: result.sequence, cursor: result.cursor,
    receiptObserved: true, auditObserved: true, sourceClockMatched: true, ledgerEffects: effects.length });
}
