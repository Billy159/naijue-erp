import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256 as schema} from '../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/packages/application/src/unified-import-contract.ts';

const upstream = new URL('../../T45/revisions/20261115-r3-party-single-projection-carrier-local-01/source/', import.meta.url);
const local = new URL('./source/tools/unified-import/', import.meta.url);
const encoded = `naijue:scrypt:1:32768:8:1:${'0'.repeat(32)}:${'1'.repeat(128)}`;
const calls = {preflight: 0, planner: 0, program: 0, step: 0, discarded: 0, host: 0, verify: 0};
const durable = new Map();
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
    if (sql === 'COMMIT') { if (pending) { durable.set(...pending); pending = null; } return {command: 'COMMIT'}; }
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
mock.module(new URL('tools/unified-import/fresh35-host-session.mjs', upstream), {namedExports: {...originalHost,
  openReviewedFresh35Host: host, openReviewedFresh35ProductionHost: host,
  openReviewedFresh35Admin154Host: host, openReviewedFresh35CompactZeroHost: host,
  prepareFresh35Admin154Import: async () => { throw Error('NON_ADMIN_FIXTURE'); },
}});
mock.module(new URL('scripts/release/unified-install/fresh35-combined-record-v1.mjs', upstream), {
  namedExports: {loadFresh35CombinedRecordEnvelope: async () => ({})},
});
mock.module(new URL('tools/unified-import/stream-preflight.mjs', upstream), {namedExports: {streamPreflight: async (pkg, report) => {
  calls.preflight++;
  await mkdir(report);
  return {checks_passed: true, complete_package_validation: true, counts: {}, manifest_sha256: manifestSha256, schema_declarations_sha256: schema};
}}});
mock.module(new URL('tools/unified-import/stream-plan.mjs', upstream), {namedExports: {prepareStreamPlan: async () => {
  calls.planner++;
  return {totals: {}, async dispose() {}};
}}});
mock.module(new URL('stream-program.mjs', local), {namedExports: {buildStreamProgram: async (plan, index, summary, admin, options) => {
  calls.program++;
  assert.equal(options.batched, true);
  assert.equal(options.coalesce, false);
  return program();
}}});
mock.module(new URL('tools/unified-import/whole-package-client.ts', upstream), {namedExports: {
  executeWholePackage: async () => { assert.fail('R3 cannot use the old whole transaction writer'); },
}});
mock.module(new URL('tools/unified-import/whole-package-reconcile.mjs', upstream), {namedExports: {
  reconcileWholePackage: async () => { calls.verify++; return {state: 'VERIFIED'}; },
}});
const {runStreamImport, runWholeImport} = await import(new URL('stream-import-cli.mjs', local));

test('actual R3 CLI route uses batch SQL, borrows one host client and resumes without preflight or recompilation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd3-cli-route-'));
  const pkg = join(directory, 'package'), report = join(directory, 'report');
  await mkdir(pkg);
  const manifest = JSON.stringify({package_kind: 'REAL', schema_contract: {source_declarations_sha256: schema}});
  manifestSha256 = createHash('sha256').update(manifest).digest('hex');
  await writeFile(join(pkg, 'manifest.json'), manifest);
  for (const [name, value] of [['target.json', {}], ['admin.json', {staff_id: 'synthetic-staff', account_id: 'synthetic-admin', login_name: 'test', staff_name: 'test'}], ['connection.json', {password: 'synthetic-only-password'}]]) {
    await writeFile(join(directory, name), JSON.stringify(value), {mode: 0o600});
  }
  await writeFile(join(directory, 'scrypt.txt'), encoded, {mode: 0o600});
  const argv = ['--package', pkg, '--report', report, '--manifest-sha256', manifestSha256,
    '--target', join(directory, 'target.json'), '--admin', join(directory, 'admin.json'),
    '--connection', join(directory, 'connection.json'), '--scrypt-file', join(directory, 'scrypt.txt'),
    '--target-profile', 'FRESH35_PRODUCTION_REAL_IMPORT_V1', '--fresh35-reference-inputs', directory,
    '--ack-exclusive-ddl-window', '--coalesce'];
  const first = await runStreamImport(argv);
  assert.equal(first.state, 'COMPLETED');
  assert.equal(first.verification.state, 'VERIFIED');
  assert.equal(first.completedBatches, 4);
  assert.equal(calls.discarded, 0);
  const before = {...calls};
  const resumed = await runStreamImport([...argv, '--resume']);
  assert.equal(resumed.state, 'COMPLETED');
  assert.equal(resumed.skippedBatches, 4);
  assert.equal(calls.preflight, before.preflight);
  assert.equal(calls.planner, before.planner);
  assert.equal(calls.program, before.program);
  assert.equal(calls.step, before.step);
  assert.equal(calls.discarded, 0);
  const changedAdmin = join(directory, 'changed-admin.json');
  await writeFile(changedAdmin, JSON.stringify({login_name: 'changed'}));
  const changed = [...argv, '--resume']; changed[changed.indexOf('--admin') + 1] = changedAdmin;
  const rejected = await runStreamImport(changed);
  assert.equal(rejected.state, 'NOT_STARTED');
  assert.equal(calls.step, before.step);
  const changedTarget = join(directory, 'changed-target.json');
  await writeFile(changedTarget, JSON.stringify({catalog_sha256: 'changed'}));
  const wrongTarget = [...argv, '--resume']; wrongTarget[wrongTarget.indexOf('--target') + 1] = changedTarget;
  assert.equal((await runStreamImport(wrongTarget)).state, 'NOT_STARTED');
  const changedPackage = join(directory, 'changed-package'); await mkdir(changedPackage);
  const otherManifest = manifest + ' ';
  await writeFile(join(changedPackage, 'manifest.json'), otherManifest);
  const wrongManifest = [...argv, '--resume']; wrongManifest[wrongManifest.indexOf('--package') + 1] = changedPackage;
  wrongManifest[wrongManifest.indexOf('--manifest-sha256') + 1] = createHash('sha256').update(otherManifest).digest('hex');
  assert.equal((await runStreamImport(wrongManifest)).state, 'NOT_STARTED');
  assert.equal(calls.step, before.step);
  await assert.rejects(() => runWholeImport(argv), /OPTION_INVALID/);
});
