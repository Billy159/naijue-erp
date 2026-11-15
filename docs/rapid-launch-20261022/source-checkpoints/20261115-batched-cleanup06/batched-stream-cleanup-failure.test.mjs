import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256 as schema} from '../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/unified-import-contract.ts';

const upstream = new URL('../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/', import.meta.url);
const local = new URL('./source/tools/unified-import/', import.meta.url);
const encoded = `naijue:scrypt:1:32768:8:1:${'0'.repeat(32)}:${'1'.repeat(128)}`;
const calls = {preflight: 0, planner: 0, program: 0, step: 0, discarded: 0, host: 0, verify: 0};
const durable = new Map();
let injectUnknown = false;
let manifestSha256;
const rootId = '00000000-0000-0000-0000-000000000001';
const baseline = '00000000-0000-0000-0000-000000000002';
const documents = '00000000-0000-0000-0000-000000000003';
function program() {
  let index = 1;
  const request = (payload, doc = false) => {
    const operation = `00000000-0000-0000-0000-${String(index++).padStart(12, '0')}`;
    return {operation_id: operation, request_key: operation, batch_id: doc ? documents : baseline,
      plan_sha256: 'a'.repeat(64), package_manifest_sha256: manifestSha256, namespace: 'SYNTHETIC.ROUTING',
      cutoff_at: '2026-11-11T10:00:00+08:00', payload};
  };
  return {identity: {batchId: baseline, documentBatchId: documents, planSha256: 'a'.repeat(64),
    packageSha256: manifestSha256, namespace: 'SYNTHETIC.ROUTING', cutoffAt: '2026-11-11T10:00:00+08:00'},
  initialize: request({document_batch_id: documents}),
  steps: {async *[Symbol.asyncIterator]() {
    yield {method: 'publish', request: request({phase: 'BASELINE'})};
    yield {method: 'documentChunk', request: request({mode: 'STAGE', rows: [], documents: []}, true)};
    yield {method: 'publish', request: request({phase: 'DOCUMENTS'}, true)};
  }}};
}
function client() {
  let pending;
  return {async discard() { calls.discarded++; }, async query(sql, values) {
    if (sql.startsWith('BEGIN')) return {command: 'BEGIN'};
    if (sql.startsWith('SET ')) return {command: 'SET'};
    if (sql === 'COMMIT') { if (pending) { durable.set(...pending); pending = null; } if(injectUnknown)throw Error('REPLY_LOST'); return {command: 'COMMIT'}; }
    if (sql === 'ROLLBACK') { pending = null; return {command: 'ROLLBACK'}; }
    const identity = JSON.parse(values[0]), batch = JSON.parse(values[1]);
    let result = {subBatchId: batch.subBatchId, descriptorSha256: batch.descriptorSha256};
    if (sql.includes('_inspect_')) result = durable.get(batch.subBatchId) ?? {...result, state: 'ABSENT', summary: null};
    else if (sql.includes('_step_')) {
      calls.step++;
      result = {...result, state: 'PENDING_TRANSACTION', operationId: JSON.parse(values[4]).operation_id, ordinal: values[2]};
    } else {
      const {rootOperationId, batchId, documentBatchId, packageSha256, planSha256} = identity;
      const summary = batch.phase === 'FINALIZE' ? {rootOperationId, batchId, documentBatchId, packageSha256, planSha256, status: 'IMPORTED'} : null;
      pending = [batch.subBatchId, {...result, state: 'COMMITTED', summary}];
      result = {...result, state: 'PENDING_TRANSACTION', summary};
    }
    return {command: 'SELECT', rows: [{result_json: JSON.stringify(result)}]};
  }};
}
const host = async (config, sourceRoot, target, prepare, execute, options) => {
  calls.host++;
  assert.equal(options.transactionMode, 'BATCHED_V1');
  const prepared = await prepare({});
  assert.equal(prepared.transactionMode, 'BATCHED_V1');
  assert.equal(prepared.batchedPlan.metadata.rootOperationId, rootId);
  return {result: await execute(client()), cleanup: 'CLOSED', host_verification: {state: 'SYNTHETIC_HOST'}};
};
const originalHost = await import(new URL('tools/unified-import/fresh35-host-session.mjs', upstream));
mock.module(new URL('tools/unified-import/fresh35-host-session.mjs', upstream), {exports: {...originalHost,
  openReviewedFresh35Host: host, openReviewedFresh35ProductionHost: host,
  openReviewedFresh35Admin154Host: host, openReviewedFresh35CompactZeroHost: host,
  prepareFresh35Admin154Import: async () => { throw Error('NON_ADMIN_FIXTURE'); },
}});
mock.module(new URL('scripts/release/unified-install/fresh35-combined-record-v1.mjs', upstream), {
  exports: {loadFresh35CombinedRecordEnvelope: async () => ({})},
});
mock.module(new URL('tools/unified-import/stream-preflight.mjs', upstream), {exports: {streamPreflight: async (pkg, report) => {
  calls.preflight++;
  await mkdir(report);
  return {checks_passed: true, complete_package_validation: true, counts: {}, manifest_sha256: manifestSha256, schema_declarations_sha256: schema};
}}});
mock.module(new URL('tools/unified-import/stream-plan.mjs', upstream), {exports: {prepareStreamPlan: async () => {
  calls.planner++;
  return {totals: {}, async dispose() {calls.planDispose++;}};
}}});
mock.module(new URL('stream-program.mjs', local), {exports: {buildStreamProgram: async (plan, index, summary, admin, options) => {
  calls.program++;
  assert.equal(options.batched, true);
  assert.equal(options.coalesce, false);
  return program();
}}});
mock.module(new URL('tools/unified-import/whole-package-client.ts', upstream), {exports: {
  executeWholePackage: async () => { assert.fail('R3 cannot use the old whole transaction writer'); },
}});
mock.module(new URL('tools/unified-import/whole-package-reconcile.mjs', upstream), {exports: {
  reconcileWholePackage: async () => { calls.verify++; return {state: 'VERIFIED'}; },
}});
const actualState = await import(new URL('batched-stream-cli-state.mjs', local));
mock.module(new URL('batched-stream-cli-state.mjs', local), {exports: {...actualState,
  prepareCliBatchedState:async(...args)=>{
    const state=await actualState.prepareCliBatchedState(...args),close=state.close;
    state.close=()=>{calls.batchClose++;close();throw Error('LAB_BATCH_CLOSE_FAILED');};
    return state;
  },
}});
const approvalUrl = new URL('packages/application/src/unified-explicit-zero-approval.ts', upstream);
const actualApproval = await import(approvalUrl);
mock.module(approvalUrl, {exports:{...actualApproval,closeExplicitZeroApproval:value=>{
  calls.approvalClose++;return actualApproval.closeExplicitZeroApproval(value);
}}});
const {runStreamImport} = await import(new URL('stream-import-cli.mjs', local));


test('batch close failure preserves known COMMIT or UNKNOWN, continues both later cleanups and exits nonzero', async () => {
 for(const expected of ['COMPLETED','UNKNOWN']) {
  durable.clear();calls.planDispose=0;calls.batchClose=0;calls.approvalClose=0;
  injectUnknown=expected==='UNKNOWN';
  const directory=await mkdtemp(join(tmpdir(),'d3-close-failure-'));
  const pkg=join(directory,'package'),report=join(directory,'report');await mkdir(pkg);
  const manifest=JSON.stringify({package_kind:'REAL',schema_contract:{source_declarations_sha256:schema}});
  manifestSha256=createHash('sha256').update(manifest).digest('hex');
  await writeFile(join(pkg,'manifest.json'),manifest);
  for(const [name,value]of [['target.json',{}],['admin.json',{staff_id:'synthetic-staff',account_id:'synthetic-admin',login_name:'test',staff_name:'test'}],['connection.json',{password:'synthetic-only-password'}]])
   await writeFile(join(directory,name),JSON.stringify(value),{mode:0o600});
  await writeFile(join(directory,'scrypt.txt'),encoded,{mode:0o600});
  const argv=['--package',pkg,'--report',report,'--manifest-sha256',manifestSha256,
   '--target',join(directory,'target.json'),'--admin',join(directory,'admin.json'),
   '--connection',join(directory,'connection.json'),'--scrypt-file',join(directory,'scrypt.txt'),
   '--target-profile','FRESH35_PRODUCTION_REAL_IMPORT_V1','--fresh35-reference-inputs',directory,'--ack-exclusive-ddl-window'];
  const result=await runStreamImport(argv);
  assert.equal(result.state,expected);
  assert.equal(result.local_cleanup,'FAILED');
  assert.equal(result.verification.state,expected==='COMPLETED'?'VERIFIED':'NOT_RUN');
  assert.equal(calls.batchClose,1);assert.equal(calls.approvalClose,1);assert.equal(calls.planDispose,1);
  const preload=join(directory,'launcher-result.mjs');
  const route=new URL('stream-import-cli.mjs',local);
  await writeFile(preload,`import {mock} from 'node:test';mock.module(${JSON.stringify(route.href)},{exports:{runStreamImport:async()=>(${JSON.stringify(result)})}});`);
  const launched=spawnSync(process.execPath,['--experimental-test-module-mocks','--import',preload,fileURLToPath(new URL('cli.mjs',local)),'stream-import'],{encoding:'utf8'});
  assert.equal(launched.status,expected==='COMPLETED'?3:2,launched.stderr);
  assert.equal(JSON.parse(launched.stdout).state,expected);
 }
});
