import assert from 'node:assert/strict';
import {join} from 'node:path';
import {cfg, connect, compileFixture, checkCatalog, encodedScrypt,
  createBatchedStreamSqlKernel, executeBatchedStreamImport, reconcileWholePackage} from './catalog-fixture.mjs';

const events = [];
let phase = 'installed161';
let fixture;
let packet;
let lastSqlFailure;
let lastVerification;
const clients = new Set();
const controllerIds = [];
async function owned(user) {
  const client = await connect(user);
  clients.add(client);
  if (!user || user === cfg.controller) controllerIds.push(client.raw.processID);
  return client;
}
async function inspect(identity, group, user = cfg.controller) {
  const client = await owned(user);
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await createBatchedStreamSqlKernel(encodedScrypt).lockAndInspect(client, identity, group);
    assert.equal((await client.query('ROLLBACK')).command, 'ROLLBACK');
    return result;
  } finally { await client.discard(); }
}
async function rejected(work, allowed) {
  let code;
  try { await work(); } catch (error) { code = error.code; }
  assert.ok(allowed.includes(code), 'expected precise PostgreSQL rejection');
  return code;
}
async function snapshot(finalOperationId) {
  const client = await owned(cfg.bootstrap);
  try {
    return (await client.query(`SELECT jsonb_build_object(
      'receipts',(SELECT count(*) FROM naijue_erp.operation_receipt),
      'receiptHash',(SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY r.id),''),'UTF8')),'hex') FROM naijue_erp.operation_receipt r),
      'salesHeaders',(SELECT count(*) FROM naijue_erp.sales_header),
      'salesLines',(SELECT count(*) FROM naijue_erp.sales_line),
      'settlements',(SELECT count(*) FROM naijue_erp.sales_settlement),
      'transferHeaders',(SELECT count(*) FROM naijue_erp.transfer_header),
      'transferLines',(SELECT count(*) FROM naijue_erp.transfer_line),
      'inventoryHash',(SELECT encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(warehouse_id,sku_id,quantity)::text,E'\n' ORDER BY warehouse_id,sku_id),''),'UTF8')),'hex') FROM naijue_erp.inventory_balance),
      'finalPublishReceipt',EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=$1::uuid)) AS value`, [finalOperationId])).rows[0].value;
  } finally { await client.discard(); }
}
async function attempt(mode, history) {
  const writer = await owned();
  let activeGroup;
  let triggered = false;
  let constraintSqlState = null;
  let beforeHistory;
  const wrapper = {
    async discard() { await writer.discard(); },
    async query(sql, values) {
      if (sql.includes('standard_batched_import_inspect_v1')) activeGroup = JSON.parse(values[1]);
      const firstHistoryStep = sql.includes('standard_batched_import_step_v1')
        && activeGroup?.subBatchId === history.subBatchId && values[2] === history.first;
      if (firstHistoryStep && mode === 'HALF_COMMIT') beforeHistory = await snapshot(fixture.finalOperationId);
      let response;
      try{response=await writer.query(sql,values);}catch(error){
        lastSqlFailure={sqlState:error.code??null,groupPhase:activeGroup?.phase??null,
          ordinal:Number.isSafeInteger(values?.[2])?values[2]:null,queryKind:sql.includes('_step_v1')?'STEP':sql.split(' ')[0]};
        throw error;
      }
      if (firstHistoryStep && mode === 'HALF_COMMIT') {
        triggered = true;
        try { await writer.query('COMMIT'); }
        catch (error) { constraintSqlState = error.code;lastSqlFailure={sqlState:error.code,groupPhase:'HISTORY',queryKind:'INJECTED_HALF_GROUP_COMMIT'};throw error; }
        throw Error('HALF_GROUP_UNEXPECTEDLY_COMMITTED');
      }
      if (sql === 'COMMIT' && activeGroup?.subBatchId === history.subBatchId && mode === 'SUPPRESS_COMMIT_REPLY') {
        assert.equal(response.command, 'COMMIT');
        triggered = true;
        // The real server COMMIT and pg.Client ACK have occurred. This client
        // boundary suppresses that reply before the coordinator receives it.
        throw Object.assign(Error('LAB_COMMIT_REPLY_SUPPRESSED'), {code: 'LAB_COMMIT_REPLY_SUPPRESSED'});
      }
      return response;
    },
  };
  const result = await executeBatchedStreamImport(fixture.plan, async () => wrapper,
    () => createBatchedStreamSqlKernel(encodedScrypt), {borrowedClient: true});
  await writer.discard();
  return {result, triggered, constraintSqlState, beforeHistory, backendPid: writer.raw.processID};
}

try {
  const observer = await owned(cfg.bootstrap);
  const installed = await checkCatalog(observer, join(cfg.candidate02, 'EXPECTED161-MODEL.json'), 161);
  events.push({case: 'INSTALLED161', ...installed});
  phase = 'current-stream-fixture';
  fixture = await compileFixture(observer, cfg.workRoot);
  const groups = [...fixture.plan.batches()];
  const history = groups.find(group => group.phase === 'HISTORY' && group.last > group.first);
  assert.ok(history, 'one real group must contain multiple original document requests');
  assert.equal(groups.filter(group=>group.phase==='HISTORY').length,1,'fixed 162-row fixture history closure');
  const final = groups.at(-1);
  assert.equal(final.phase, 'FINALIZE');
  fixture.finalOperationId = final.lastOperationId;
  const operations = [];
  for (const group of groups) for await (const step of fixture.plan.steps(group)) operations.push({id: step.request.operation_id, key: step.request.request_key});
  assert.equal(new Set(operations.map(row => row.id)).size, operations.length);
  assert.equal(fixture.plan.metadata.rootOperationId, fixture.initialize.operation_id);
  await observer.discard();

  const privilege = await owned();
  const flags = (await privilege.query(`SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
    has_parameter_privilege(session_user,'session_replication_role','SET') AS replication_parameter
    FROM pg_roles WHERE rolname=session_user`)).rows[0];
  assert.ok(Object.values(flags).every(value => value === false));
  await privilege.discard();

  phase = 'half-group-real-commit-failure';
  const first = await attempt('HALF_COMMIT', history);
  assert.equal(first.triggered, true);
  assert.equal(first.constraintSqlState, '23514');
  assert.equal(first.result.state, 'ROLLED_BACK');
  assert.ok(first.result.completedBatches >= 2);
  const afterFailure = await snapshot(fixture.finalOperationId);
  assert.deepEqual(afterFailure, first.beforeHistory, 'failed group must preserve actual prior committed state');
  assert.equal(afterFailure.salesHeaders, 0);
  assert.equal(afterFailure.transferHeaders, 0);
  assert.equal(afterFailure.finalPublishReceipt, false);
  const coreRead = await inspect(fixture.identity, groups[0]);
  const absentRead = await inspect(fixture.identity, history);
  assert.equal(coreRead.state, 'COMMITTED');
  assert.equal(absentRead.state, 'ABSENT');
  events.push({case: 'CORE_AND_PREFIX_COMMITTED_HALF_GROUP_REJECTED', restrictedController: true,
    committedPrefixGroups: first.result.completedBatches, constraintSqlState: first.constraintSqlState,
    freshCoreInspect: coreRead.state, freshFailedGroupInspect: absentRead.state,
    originalHistoryRequests: history.last-history.first+1, priorSnapshotPreserved: true,
    finalPublishAbsent: true, failedGroupSubBatchId: history.subBatchId});

  phase = 'real-commit-reply-suppression';
  const second = await attempt('SUPPRESS_COMMIT_REPLY', history);
  assert.equal(second.triggered, true);
  assert.equal(second.result.state, 'UNKNOWN');
  assert.equal(second.result.stage, 'COMMIT');
  const committedRead = await inspect(fixture.identity, history);
  assert.equal(committedRead.state, 'COMMITTED');
  const afterUnknown = await snapshot(fixture.finalOperationId);
  assert.equal(afterUnknown.salesHeaders, fixture.sourceCounts.sales_header);
  assert.equal(afterUnknown.salesLines, fixture.sourceCounts.sales_line);
  assert.equal(afterUnknown.transferHeaders, fixture.sourceCounts.transfer_header);
  assert.equal(afterUnknown.transferLines, fixture.sourceCounts.transfer_line);
  assert.equal(afterUnknown.settlements, fixture.sourceCounts.sales_settlement);
  assert.equal(afterUnknown.inventoryHash, afterFailure.inventoryHash);
  assert.equal(afterUnknown.finalPublishReceipt, false);
  events.push({case: 'REAL_COMMIT_COORDINATOR_REPLY_SUPPRESSED', driverState: 'UNKNOWN',
    newConnectionLockedInspect: committedRead.state, subBatchId: history.subBatchId,
    injectionPosition: 'AFTER_REAL_PG_COMMIT_ACK_BEFORE_COORDINATOR_ACK',
    wireNetworkDropTested: false, historyNativeCountsMatch: true, stockUnchanged: true, finalPublishAbsent: true});

  phase = 'conflicting-descriptor-actor-input-source';
  const badDescriptor = await rejected(() => inspect(fixture.identity, {...history, descriptorSha256:'0'.repeat(64)}), ['23505','23514']);
  const badInput = await rejected(() => inspect({...fixture.identity, packageSha256:'0'.repeat(64)}, history), ['23505','23514']);
  const foreignActor = await rejected(() => inspect(fixture.identity, history, cfg.bootstrap), ['42501']);
  const sibling = groups[0];
  const badSibling = await rejected(() => inspect(fixture.identity, {...history, predecessor:sibling.subBatchId,
    previousLastOperationId:sibling.lastOperationId, previousDescriptorSha256:sibling.descriptorSha256}), ['23505','23514']);
  const sourceWriter = await owned();
  let priorRequestSource;
  try {
    await sourceWriter.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await sourceWriter.query('SET LOCAL ROLE erp_unified27_importer_2393dbc6db9581c2');
    let original;
    for await (const step of fixture.plan.steps(history)) { original=step; break; }
    const changed = structuredClone(original.request);
    changed.payload.rows[0].source_key = 'SYNTHETIC_HISTORICAL_OTHER_ROOT_SOURCE';
    priorRequestSource = await rejected(() => sourceWriter.query(
      'SELECT naijue_erp.standard_batched_import_step_v1($1::jsonb,$2::jsonb,$3::integer,$4::text,$5::jsonb,$6::text)::text AS result_json',
      [JSON.stringify(fixture.identity),JSON.stringify(history),history.first,'DOCUMENTS',JSON.stringify(changed),null]), ['23505','23514']);
    assert.equal((await sourceWriter.query('ROLLBACK')).command,'ROLLBACK');
  } finally { await sourceWriter.discard(); }
  assert.deepEqual(await snapshot(fixture.finalOperationId), afterUnknown);
  events.push({case:'FOREIGN_IDENTITIES_AND_ORIGINAL_SOURCE_REPLAY_REJECTED',
    descriptorSqlState:badDescriptor,inputSqlState:badInput,foreignPrivilegedSessionSqlState:foreignActor,
    siblingPredecessorSqlState:badSibling,historicalSourceReplaySqlState:priorRequestSource,
    snapshotPreserved:true, foreignActorIsPrivilegedSessionNotSameCapabilitySibling:true});

  phase = 'same-original-key-final-resume';
  const third = await attempt('NORMAL', history);
  assert.equal(third.result.state,'COMPLETED');
  assert.equal(third.result.skippedBatches,groups.length-1);
  assert.equal(third.result.completedBatches,1);
  assert.equal(third.result.businessReady,false);
  const finalRead = await inspect(fixture.identity,final);
  assert.equal(finalRead.state,'COMMITTED');
  const finalObserver = await owned(cfg.bootstrap);
  const receipts = (await finalObserver.query('SELECT id::text,request_key FROM naijue_erp.operation_receipt WHERE id=ANY($1::uuid[]) ORDER BY id',
    [operations.map(row=>row.id)])).rows;
  assert.deepEqual(receipts.map(row=>({id:row.id,key:row.request_key})),operations.toSorted((a,b)=>a.id.localeCompare(b.id)));
  const xids = (await finalObserver.query(`SELECT count(*)::integer AS operations,count(DISTINCT xmin::text)::integer AS xids
    FROM naijue_erp.operation_receipt WHERE result_data->'batched_import_v1'->'descriptor'->>'subBatchId'=$1`,[history.subBatchId])).rows[0];
  assert.equal(xids.operations,history.last-history.first+1);
  assert.equal(xids.xids,1);
  await finalObserver.discard();
  events.push({case:'ORIGINAL_KEY_RESUME_NO_DUPLICATES_ATOMIC_DOCUMENT_GROUP',
    skippedBatches:third.result.skippedBatches,completedBatches:1, originalReceiptIdsAndKeysMatched:true,
    historyOriginalRequests:xids.operations,historyReceiptXids:xids.xids,finalLockedInspect:finalRead.state});

  phase = 'independent-quantity-money-stock-reconciliation';
  const verifier = await owned();
  const verified = await reconcileWholePackage(verifier,fixture.initialize,encodedScrypt,fixture.sourceCounts,fixture.sourceTotals);
  lastVerification=verified;
  assert.equal(verified.state,'VERIFIED');
  await verifier.discard();
  const finalSnapshot = await snapshot(fixture.finalOperationId);
  assert.equal(finalSnapshot.finalPublishReceipt,true);
  assert.equal(finalSnapshot.inventoryHash,afterFailure.inventoryHash);
  events.push({case:'FINAL_ORIGINAL_QUANTITY_MONEY_STOCK_RELATION_RECONCILIATION',state:verified.state,
    summary:verified.summary,finalPublishPresent:true,businessReady:false,
    productionHostTested:false, v2HallAmountRetentionNewPgProof:false});
  packet={stage:'SQL_CORE',state:'COMPLETED',events,
    controllerBackendPids:controllerIds,fixtureRows:162, sourceManifestSha256:cfg.fixtureManifestSha256,
    batchCount:groups.length,stepCount:fixture.plan.metadata.stepCount,
    sourceScope:'LOCAL_RESTRICTED_SQL_CORE_ONLY',productionHostTested:false};
} catch(error) {
  packet={stage:'SQL_CORE',state:'FAILED',phase,
    code:typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:null,
    errorType:error.name,lastSqlFailure,lastVerification,catalogSignature:error.catalogSignature,catalogField:error.catalogField,events,productionHostTested:false};
  process.exitCode=1;
} finally {
  try{fixture?.plan.close();}catch(error){packet={...packet,stage:'SQL_CORE',state:'FAILED',coreState:packet?.state,planCleanupFailed:true,cleanupErrorType:error.name,events,productionHostTested:false};process.exitCode=1;}
  const cleanup=await Promise.allSettled([...clients].map(client=>client.discard()));
  if(cleanup.some(result=>result.status==='rejected')){packet={...packet,stage:'SQL_CORE',state:'FAILED',coreState:packet?.coreState??packet?.state,clientCleanupFailed:true,events,productionHostTested:false};process.exitCode=1;}
}

process.stdout.write(JSON.stringify(packet)+'\n');
