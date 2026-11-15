import {join} from 'node:path';
import {cfg, connect, compileFixture, checkCatalog, encodedScrypt, createBatchedStreamSqlKernel} from './catalog-fixture.mjs';
import {corePgErrorFields} from './core-error-fields.mjs';

let phase = 'INSTALLED161', queryKind = 'CATALOG', ordinal = null;
let fixture, observer, writer, transactionBegan = false, firstFailure = null;
let installed161 = null, fixtureCompiled = false, inspectState = null, stepAck = false;
let rollbackConfirmed = false, rollbackFailure = null, closeFailure = false;
let applicationError = null;
const privateTokens = [encodedScrypt];
function tokens(value) {
  if (typeof value === 'string') privateTokens.push(value);
  else if (Array.isArray(value)) value.forEach(tokens);
  else if (value && typeof value === 'object') Object.values(value).forEach(tokens);
}
async function query(sql, values) {
  const kind = sql.includes('standard_batched_import_step_v1') ? 'STEP'
    : sql.includes('standard_batched_import_inspect_v1') ? 'INSPECT'
    : sql.startsWith('SET LOCAL ROLE ') ? 'ROLE' : sql === 'ROLLBACK' ? 'ROLLBACK' : 'BEGIN';
  queryKind = kind;
  try { return await writer.query(sql, values); }
  catch (error) {
    if (firstFailure === null) firstFailure = corePgErrorFields(error, {phase, ordinal, queryKind: kind}, privateTokens);
    throw error;
  }
}
try {
  observer = await connect(cfg.bootstrap);
  installed161 = await checkCatalog(observer, join(cfg.candidate02, 'EXPECTED161-MODEL.json'), 161);
  phase = 'CURRENT_STREAM_FIXTURE'; queryKind = 'COMPILE';
  fixture = await compileFixture(observer, cfg.workRoot); fixtureCompiled = true;
  const identity = Object.freeze({...structuredClone(fixture.plan.metadata.identity), rootOperationId: fixture.plan.metadata.rootOperationId});
  const iterator = fixture.plan.batches();
  const core = Object.freeze(structuredClone(iterator.next().value));
  if (core.phase !== 'CORE' || core.first !== 0 || core.last !== 0) throw Error('CORE0_DESCRIPTOR_REQUIRED');
  let step;
  for await (const incoming of fixture.plan.steps(core)) { step = incoming; break; }
  if (!step || step.request.operation_id !== core.firstOperationId || step.request.operation_id !== core.lastOperationId) throw Error('ORIGINAL_CORE0_REQUEST_REQUIRED');
  tokens(identity); tokens(core); tokens(step.request);
  await observer.discard(); observer = null;
  phase = 'CORE'; ordinal = 0; queryKind = 'PRIVILEGE';
  writer = await connect(cfg.controller);
  const flags = (await writer.query(`SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
    has_parameter_privilege(session_user,'session_replication_role','SET') AS replication_parameter
    FROM pg_roles WHERE rolname=session_user`)).rows[0];
  if (!flags || !Object.values(flags).every(value => value === false)) throw Error('RESTRICTED_CONTROLLER_REQUIRED');
  const client = {query};
  const kernel = createBatchedStreamSqlKernel(encodedScrypt);
  if ((await query('BEGIN ISOLATION LEVEL READ COMMITTED')).command !== 'BEGIN') throw Error('BEGIN_ACK_INVALID');
  transactionBegan = true;
  const inspected = await kernel.lockAndInspect(client, identity, core); inspectState = inspected.state;
  if (inspectState !== 'ABSENT') throw Error('FRESH_CORE_MUST_BE_ABSENT');
  // Real adapter switches to INITIALIZER and sends original ordinal0/INITIALIZE.
  // No complete, COMMIT, later group or failure injection exists in this probe.
  await kernel.applyStep(client, identity, core, step, 0);
  stepAck = true;
} catch (error) {
  if (firstFailure === null && /^[0-9A-Z]{5}$/.test(error?.code ?? '')) {
    firstFailure = corePgErrorFields(error, {phase, ordinal, queryKind}, privateTokens);
  } else if (firstFailure === null) applicationError = {phase, ordinal, queryKind, errorType: /^[A-Za-z]{1,40}$/.test(error?.name ?? '') ? error.name : 'Error'};
} finally {
  if (writer && transactionBegan) {
    try { rollbackConfirmed = (await writer.query('ROLLBACK')).command === 'ROLLBACK'; }
    catch (error) { rollbackFailure = {sqlState: /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : null}; }
  }
  try { fixture?.plan.close(); } catch { closeFailure = true; }
  for (const client of [observer, writer]) if (client) try { await client.discard(); } catch { closeFailure = true; }
}
const success = stepAck && rollbackConfirmed && firstFailure === null && applicationError === null && !closeFailure;
let packet = {stage:'CORE_STEP0_DIAGNOSTIC',state:success?'COMPLETED':'FAILED',phase,ordinal,
  installed161,fixtureCompiled,fixtureRows:162,inspectState,stepAck,rollbackConfirmed,rollbackFailure,
  firstFailure,applicationError,closeFailure,commitAttempted:false,laterGroupsAttempted:false,
  productionHostTested:false,fullSqlExported:false,genericLogsExported:false};
if (Buffer.byteLength(JSON.stringify(packet,null,2)+'\n') > 4096) {
  if (packet.firstFailure) packet.firstFailure = {...packet.firstFailure,message:null,messageRedacted:true,contextFrames:[]};
}
if (Buffer.byteLength(JSON.stringify(packet,null,2)+'\n') > 4096) {
  packet = {stage:'CORE_STEP0_DIAGNOSTIC',state:'FAILED',phase:'SAFE_OUTPUT_CAP',commitAttempted:false};
}
process.stdout.write(JSON.stringify(packet)+'\n');
process.exitCode = success && packet.state === 'COMPLETED' ? 0 : 1;
