import {createHash} from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
// Only the one actual CHECK on an isolated temporary five-column projection.
// No business row is inserted and no existing guard is disabled or replaced.
export async function receiptCheckSamples(client, fixture, cfg, onExpectedError) {
  const row = (await client.query(`SELECT pg_get_constraintdef(oid,false) AS definition
    FROM pg_constraint WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind'`)).rows[0];
  if (!row || sha(row.definition) !== cfg.receiptConstraintSha256) throw Error('CHECK_SAMPLE_ACTUAL_DEFINITION_MISMATCH');
  let began = false, firstError = null, rollbackConfirmed = false;
  const results = [];
  try {
    if ((await client.query('BEGIN')).command !== 'BEGIN') throw Error('CHECK_SAMPLE_BEGIN_ACK_INVALID');
    began = true;
    await client.query(`CREATE TEMP TABLE d3_receipt_check_probe ON COMMIT DROP AS
      SELECT id,target_type,action,target_id,result_data FROM naijue_erp.operation_receipt WITH NO DATA`);
    await client.query('ALTER TABLE pg_temp.d3_receipt_check_probe ADD CONSTRAINT receipt_result_by_kind '+row.definition);
    const xid = (await client.query('SELECT pg_current_xact_id()::text AS value')).rows[0].value;
    const core = fixture.plan.batches().next().value;
    const identity = {...structuredClone(fixture.plan.metadata.identity),rootOperationId:fixture.plan.metadata.rootOperationId};
    const id = fixture.initialize.operation_id, target = identity.batchId;
    const old = {profile:'STANDARD_IMPORT_SQL_V1',operationId:id,batchId:target,sequence:0,cursor:0,status:'STAGED',
      ledgerEntryIds:[],sourceRecordIds:[],phase:'INITIALIZE',planSha256:identity.planSha256,
      packageManifestSha256:identity.packageSha256,baselineBatchId:identity.batchId,documentBatchId:identity.documentBatchId};
    const closed = {...structuredClone(old),batched_import_v1:{identity,descriptor:structuredClone(core),full_xid:xid,controller:cfg.controller}};
    const mutate = fn => {const value=structuredClone(closed);fn(value);return value;};
    const samples = [
      ['old_standard_valid',true,old],['closed_marker_valid',true,closed],
      ['extra_marker_key',false,mutate(v=>v.batched_import_v1.extra=true)],
      ['missing_original_required',false,mutate(v=>delete v.ledgerEntryIds)],
      ['json_null_marker',false,mutate(v=>v.batched_import_v1=null)],
      ['scalar_marker',false,mutate(v=>v.batched_import_v1='invalid')],
      ['null_identity_value',false,mutate(v=>v.batched_import_v1.identity.rootOperationId=null)],
      ['descriptor_number_as_string',false,mutate(v=>v.batched_import_v1.descriptor.first='0')],
      ['numeric_full_xid',false,mutate(v=>v.batched_import_v1.full_xid=1)],
      ['sql_null_result',false,null],
    ];
    for (const [name, expectedAccepted, result] of samples) {
      await client.query('SAVEPOINT receipt_check_sample');
      let accepted = false, sqlState = null;
      try {
        await client.query('INSERT INTO pg_temp.d3_receipt_check_probe(id,target_type,action,target_id,result_data) VALUES($1::uuid,$2::text,$3::text,$4::uuid,$5::jsonb)',
          [id,'IMPORT','IMPORT_INITIALIZE_CURRENT_ADMIN',target,result===null?null:JSON.stringify(result)]);
        accepted = true;
      } catch (error) {
        sqlState = error.code ?? null;
        if (expectedAccepted || !(sqlState==='23514' || /^22[0-9A-Z]{3}$/.test(sqlState))) throw error;
        onExpectedError(error);
      }
      if (accepted !== expectedAccepted) throw Object.assign(Error('CHECK_SAMPLE_UNEXPECTED_ACCEPTANCE'),{code:'CHECK_SAMPLE_UNEXPECTED_ACCEPTANCE',checkSample:name});
      await client.query('ROLLBACK TO SAVEPOINT receipt_check_sample');
      await client.query('RELEASE SAVEPOINT receipt_check_sample');
      results.push({name,accepted,sqlState});
    }
  } catch (error) { firstError = error; }
  finally {
    if (began) try {rollbackConfirmed=(await client.query('ROLLBACK')).command==='ROLLBACK';}
    catch (error) { if (firstError===null) firstError=error; }
  }
  if (firstError) throw firstError;
  if (!rollbackConfirmed) throw Error('CHECK_SAMPLE_ROLLBACK_UNCONFIRMED');
  return {scope:'ONE_ACTUAL_CHECK_ONLY_TEMP_PROJECTION_NO_TRANSACTION_OR_PERMISSION_PROOF',
    definitionSha256:cfg.receiptConstraintSha256,samples:results,rollbackConfirmed,
    businessRowsInserted:false,otherGuardsDisabled:false};
}
