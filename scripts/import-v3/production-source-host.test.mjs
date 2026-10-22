import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportHost, requiredNativeSourceInputs, validateSourceHostJob, createSourcePreflightDatabaseGate,
  requiredNativeSourceInputs26, validateSourceHostJob26, captureNativeSourceProvider26 } from './production-source-host.mjs';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sha = c => c.repeat(64);
function job(at = Date.now()) {
  return { version: 'NATIVE_IMPORT_SOURCE_HOST19_V1', registrationId: 'synthetic-one-run', deadlineUtc: new Date(at + 30000).toISOString(), maxSteps: 100,
    binding: { version: 'NATIVE_IMPORT_EXECUTION_19_V1', batchId: id(1), actorAccountId: id(2), fixedSourceNamespace: 'synthetic-source-system',
      cutoffAt: '2026-10-04T12:00:00+08:00', selectionSha256: sha('a'), authorizedPayloadHash: sha('b'),
      target: { database: 'demo_8877_source_host', role: 'synthetic_operator', serverAddress: '127.0.0.1', serverPort: 55555, postmasterStartedAt: 'synthetic' } },
    database: { host: '127.0.0.1', port: 55555, database: 'demo_8877_source_host', user: 'synthetic_operator', tls: 'local-transport', caFile: null, statementTimeoutMs: 10000 },
    sources: { base: '/synthetic/base', v3Amendment: '/synthetic/amendment', v3Approval: '/synthetic/independent-approval', trustedApprovalSha256: sha('c'),
      approvedMoneyOverlaySha256: sha('d'), sourceRoot: '/synthetic/originals', spoolParent: '/synthetic/spool', maxSpoolBytes: 335544320,
      maxEvidenceSpoolBytes: 167772160, referenceDecisionFile: '/synthetic/native-decision', trustedReferenceDecisionSha256: sha('e'), mappingFiles: { catalogue: '/synthetic/native-mappings' } },
    providers: { path: '/synthetic/frozen-providers.mjs', sha256: sha('f') } };
}
function job26(at = Date.now()) {
  const j = job(at); j.version = 'NATIVE_IMPORT_SOURCE_HOST26_V1'; j.binding.version = 'NATIVE_IMPORT_EXECUTION_26_V1';
  j.sources.reviewFile = '/synthetic/C-full-reference-review26.json'; j.sources.trustedReviewSha256 = sha('9'); return j;
}
test('sourcehost26 explicit job requires full external reference pin and exact26 identity while preserving common destination limits', () => {
  const j = job26(), captured = validateSourceHostJob26(j); assert.deepEqual(captured, j);
  j.sources.mappingFiles.catalogue = '/changed-after-capture'; assert.equal(captured.sources.mappingFiles.catalogue, '/synthetic/native-mappings');
  for (const mutate of [x => { delete x.sources.reviewFile; }, x => { x.sources.trustedReviewSha256 = ''; },
    x => { x.binding.version = 'NATIVE_IMPORT_EXECUTION_19_V1'; }, x => { x.binding.actorAccountId = null; },
    x => { x.database.password = 'SYNTHETIC FORBIDDEN'; }, x => { x.database.host = 'remote.invalid'; }]) {
    const value = job26(); mutate(value); assert.throws(() => validateSourceHostJob26(value));
  }
  assert.throws(() => validateSourceHostJob26(job()), { code: 'IMPORT_SOURCE_HOST26_PROFILE' });
  assert.throws(() => validateSourceHostJob(job26()));
});
test('sourcehost26 captures every declared source group without invoking factories or accessor substitutes', () => {
  let opened = 0, getters = 0; const groups = requiredNativeSourceInputs26().closureSourceGroups;
  const module = { providerVersion: 'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1', sourceGroups: groups, async openSourceSession() { opened++; } };
  const captured = captureNativeSourceProvider26(module); groups.pop(); module.openSourceSession = async () => { throw Error('REPLACED'); };
  assert.equal(captured.sourceGroups.length, 11); assert.equal(opened, 0);
  for (const list of [[], Array(11).fill('PARTIES'), requiredNativeSourceInputs26().closureSourceGroups.slice(1), [...requiredNativeSourceInputs26().closureSourceGroups, 'EXTRA']]) {
    assert.throws(() => captureNativeSourceProvider26({ ...module, sourceGroups: list }), { code: 'IMPORT_SOURCE_HOST26_FACTORIES_REQUIRED' });
  }
  const bad = { ...module }; Object.defineProperty(bad, 'openSourceSession', { enumerable: true, get() { getters++; return module.openSourceSession; } });
  assert.throws(() => captureNativeSourceProvider26(bad), { code: 'IMPORT_SOURCE_HOST26_PROVIDERS_REQUIRED' }); assert.equal(getters, 0);
  const indexed = requiredNativeSourceInputs26().closureSourceGroups; Object.defineProperty(indexed, '0', { enumerable: true, get() { getters++; return 'PARTIES'; } });
  assert.throws(() => captureNativeSourceProvider26({ ...module, sourceGroups: indexed }), { code: 'IMPORT_SOURCE_HOST26_FACTORIES_REQUIRED' }); assert.equal(getters, 0);
});
test('sourcehost26 requirements expose missing actual execution dependencies and never route26 into the old host', async () => {
  const required = requiredNativeSourceInputs26(); assert.equal(required.executionReady, false);
  assert.equal(required.referenceDecision.schemaVersion, 2); assert.equal(required.referenceDecision.maximumBytes, 8388608);
  assert.equal(required.requiredExecutionDependencies.length, 4);
  const root = await mkdtemp(join(await realpath(tmpdir()), 'sourcehost26-no-old-executor-'));
  try { const config = join(root, 'job26.json'); await writeFile(config, JSON.stringify(job26()));
    await assert.rejects(openImportHost({ signal: new AbortController().signal, configFile: config }), { code: 'IMPORT_SOURCE_HOST_REGISTRATION' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('real host requires exact explicit job/identity/cutoff; no implicit namespace, UUID, current date or credentials', () => {
  const j = job(); assert.deepEqual(validateSourceHostJob(j), j);
  for (const mutate of [x => { x.binding.cutoffAt = ''; }, x => { x.binding.batchId = null; }, x => { x.binding.fixedSourceNamespace = ''; },
    x => { x.database.password = 'MUST_NOT_APPEAR'; }, x => { x.deadlineUtc = '2000-01-01T00:00:00Z'; }]) {
    const x = job(); mutate(x); assert.throws(() => validateSourceHostJob(x));
  }
});
test('independent native reference and mapping inputs cannot be omitted or self-substituted by business approval flags', () => {
  for (const mutate of [x => { x.sources.referenceDecisionFile = null; }, x => { x.sources.trustedReferenceDecisionSha256 = ''; },
    x => { x.sources.mappingFiles = {}; }, x => { x.sources.nativeReferenceApproved = true; }, x => { x.sources.maxSpoolBytes = 536870913; }]) {
    const x = job(); mutate(x); assert.throws(() => validateSourceHostJob(x));
  }
  let gets = 0; const x = job(); x.sources.mappingFiles = Object.defineProperty({}, 'catalogue', { enumerable: true, get() { gets++; return '/synthetic/map'; } });
  assert.throws(() => validateSourceHostJob(x)); assert.equal(gets, 0);
});
test('TLS verification cannot be disabled for remote targets; private local transport remains explicit', () => {
  for (const database of [{ ...job().database, host: 'remote.invalid' }, { ...job().database, tls: 'ignore-certificates' }, { ...job().database, tls: 'verify-full', caFile: 'relative.pem' }]) {
    assert.throws(() => validateSourceHostJob({ ...job(), database }));
  }
  assert.equal(validateSourceHostJob({ ...job(), database: { ...job().database, tls: 'verify-full', caFile: null } }).database.tls, 'verify-full');
});
test('minimum source shape enumerates every closure factory and exact native-decision schema', () => {
  const shape = requiredNativeSourceInputs(); assert.equal(shape.closureSourceGroups.length, 11); assert.equal(new Set(shape.closureSourceGroups).size, 11);
  assert.ok(shape.closureSourceGroups.includes('HEADERS') && shape.closureSourceGroups.includes('STOCK_CONTRIBUTORS'));
  assert.deepEqual(shape.referenceDecision.referenceKinds, ['category', 'sizeGroup', 'season', 'supplier']); assert.equal(shape.referenceDecision.externalPinRequired, true);
});
test('missing real decision file fails before any DB/provider work; old barcode approval is not a native decision', async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'naijue-source-host-'));
  try {
    const config = join(root, 'job.json'), j = job(); j.sources.referenceDecisionFile = join(root, 'missing.json'); await writeFile(config, JSON.stringify(j), { mode: 0o600 });
    await assert.rejects(openImportHost({ signal: new AbortController().signal, configFile: config }), { code: 'ENOENT' });
    const native = join(root, 'not-native.json'), bytes = JSON.stringify({ approval: 'only-barcode-exclusion', nativeDbImportAuthorizedByThisFile: false });
    await writeFile(native, bytes, { mode: 0o600 }); j.sources.referenceDecisionFile = native; j.sources.trustedReferenceDecisionSha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(config, JSON.stringify(j));
    await assert.rejects(openImportHost({ signal: new AbortController().signal, configFile: config }), { code: 'IMPORT_SOURCE_HOST_NATIVE_DECISION_REQUIRED' });
  } finally { await rm(root, { recursive: true }); }
});
test('source module with absent production factories cannot create a pool or use a synthetic fallback', async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'naijue-source-host-'));
  try {
    const j = job(), native = join(root, 'native.json'), module = join(root, 'provider.mjs'), config = join(root, 'job.json');
    const bytes = JSON.stringify({ schemaVersion: 1, validatorVersion: requiredNativeSourceInputs().referenceDecision.validatorVersion, batchId: j.binding.batchId,
      fixedSourceNamespace: j.binding.fixedSourceNamespace, selection: { entity: 'PRODUCT', selectionSha256: j.binding.selectionSha256 }, mappingFiles: [], decisions: [] });
    await writeFile(native, bytes); j.sources.referenceDecisionFile = native; j.sources.trustedReferenceDecisionSha256 = createHash('sha256').update(bytes).digest('hex');
    const code = "export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1'; export const sourceGroups=[]; export async function openSourceSession(){throw Error('MUST_NOT_OPEN');}";
    await writeFile(module, code); j.providers = { path: module, sha256: createHash('sha256').update(code).digest('hex') }; await writeFile(config, JSON.stringify(j));
    await assert.rejects(openImportHost({ signal: new AbortController().signal, configFile: config }), { code: 'IMPORT_SOURCE_HOST_FACTORIES_REQUIRED' });
  } finally { await rm(root, { recursive: true }); }
});
test('QB-SOURCE-PREFLIGHT-01: correctly declared groups cannot query from source constructor before actual factories/native checks', async () => {
  const root=await mkdtemp(join(await realpath(tmpdir()),'source-preflight-regression-'));
  try{
    const j=job(),native=join(root,'native.json'),module=join(root,'provider.mjs'),config=join(root,'job.json'),marker=join(root,'queried-marker');
    const bytes=JSON.stringify({schemaVersion:1,validatorVersion:requiredNativeSourceInputs().referenceDecision.validatorVersion,batchId:j.binding.batchId,
      fixedSourceNamespace:j.binding.fixedSourceNamespace,selection:{entity:'PRODUCT',selectionSha256:j.binding.selectionSha256},mappingFiles:[],decisions:[]});
    await writeFile(native,bytes);j.sources.referenceDecisionFile=native;j.sources.trustedReferenceDecisionSha256=createHash('sha256').update(bytes).digest('hex');
    const code=`import {writeFile} from 'node:fs/promises';export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1';
      export const sourceGroups=${JSON.stringify(requiredNativeSourceInputs().closureSourceGroups)};
      export async function openSourceSession({pool}){await pool.query('SELECT 1');await writeFile(${JSON.stringify(marker)},'queried');return {openSources:{}};}`;
    await writeFile(module,code);j.providers={path:module,sha256:createHash('sha256').update(code).digest('hex')};await writeFile(config,JSON.stringify(j));
    await assert.rejects(openImportHost({signal:new AbortController().signal,configFile:config}),{code:'IMPORT_SOURCE_HOST_DATABASE_PRECHECK'});
    const {stat}=await import('node:fs/promises');await assert.rejects(stat(marker),{code:'ENOENT'});
  }finally{await rm(root,{recursive:true,force:true});}
});
test('source database gate remains inert until complete preflight, then forwards the same pool and disposes once',async()=>{
  let created=0,queries=0,connections=0,ended=0;
  const client={};const gate=createSourcePreflightDatabaseGate(()=>{created++;return {async query(){queries++;return {rows:[]};},async connect(){connections++;return client;},async end(){ended++;}};});
  await assert.rejects(gate.capability.query('SELECT 1'),/DATABASE_PRECHECK/);await assert.rejects(gate.capability.connect(),/DATABASE_PRECHECK/);
  assert.equal(created,0);assert.equal(queries,0);assert.equal(connections,0);
  gate.activate();assert.equal(created,1);await gate.capability.query('SELECT 1');assert.equal(await gate.capability.connect(),client);assert.equal(queries,1);assert.equal(connections,1);
  await gate.close();await gate.close();assert.equal(ended,1);await assert.rejects(gate.capability.query('SELECT 1'),/DATABASE_PRECHECK/);
});
test('full factory declarations with a missing actual native authorizer retain the closed database capability',async()=>{
  const root=await mkdtemp(join(await realpath(tmpdir()),'source-native-preflight-'));
  try{
    const j=job(),native=join(root,'native.json'),module=join(root,'provider.mjs'),config=join(root,'job.json');
    const bytes=JSON.stringify({schemaVersion:1,validatorVersion:requiredNativeSourceInputs().referenceDecision.validatorVersion,batchId:j.binding.batchId,
      fixedSourceNamespace:j.binding.fixedSourceNamespace,selection:{entity:'PRODUCT',selectionSha256:j.binding.selectionSha256},mappingFiles:[],decisions:[]});
    await writeFile(native,bytes);j.sources.referenceDecisionFile=native;j.sources.trustedReferenceDecisionSha256=createHash('sha256').update(bytes).digest('hex');
    const code=`export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1';export const sourceGroups=${JSON.stringify(requiredNativeSourceInputs().closureSourceGroups)};
      export async function openSourceSession({pool,binding}){return {steps:async function*(){},close:async()=>{},authorizeStep:async()=>{},assertExecutionAllowed:async()=>{},assertAllowed:async()=>{},authorizeNativeCommand:async()=>{},
        openSources:Object.fromEntries(sourceGroups.map(k=>[k,async()=>{}])),closureScope:binding,nativeProductSourceReader:{}};}`;
    await writeFile(module,code);j.providers={path:module,sha256:createHash('sha256').update(code).digest('hex')};await writeFile(config,JSON.stringify(j));
    await assert.rejects(openImportHost({signal:new AbortController().signal,configFile:config}),/NATIVE_PRODUCT_EXACT_SOURCE_AUTHORIZER_REQUIRED/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('private bootstrap malformed descriptors fail before native source authorization or database activation',async()=>{
  const root=await mkdtemp(join(await realpath(tmpdir()),'source-bootstrap-preflight-'));
  try{
    for(const variant of ['getter','partial']){
      const j=job(),native=join(root,'native-'+variant+'.json'),module=join(root,'provider-'+variant+'.mjs'),config=join(root,'job-'+variant+'.json');
      const bytes=JSON.stringify({schemaVersion:1,validatorVersion:requiredNativeSourceInputs().referenceDecision.validatorVersion,batchId:j.binding.batchId,
        fixedSourceNamespace:j.binding.fixedSourceNamespace,selection:{entity:'PRODUCT',selectionSha256:j.binding.selectionSha256},mappingFiles:[],decisions:[]});
      await writeFile(native,bytes);j.sources.referenceDecisionFile=native;j.sources.trustedReferenceDecisionSha256=createHash('sha256').update(bytes).digest('hex');
      const setup=variant==='getter'?`Object.defineProperty(session,'bootstrap',{enumerable:true,get(){throw Error('BOOTSTRAP_GETTER_MUST_NOT_RUN');}})`:`session.bootstrap={authorizeStageSourceActor:async()=>{}}`;
      const code=`export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_19_V1';export const sourceGroups=${JSON.stringify(requiredNativeSourceInputs().closureSourceGroups)};
        export async function openSourceSession({binding}){const session={steps:async function*(){},close:async()=>{},authorizeStep:async()=>{},assertExecutionAllowed:async()=>{},assertAllowed:async()=>{},authorizeNativeCommand:async()=>{},
          openSources:Object.fromEntries(sourceGroups.map(k=>[k,async()=>{}])),closureScope:binding,nativeProductSourceReader:{}};${setup};return session;}`;
      await writeFile(module,code);j.providers={path:module,sha256:createHash('sha256').update(code).digest('hex')};await writeFile(config,JSON.stringify(j));
      await assert.rejects(openImportHost({signal:new AbortController().signal,configFile:config}),{code:'IMPORT_SOURCE_HOST_BOOTSTRAP_REQUIRED'});
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
