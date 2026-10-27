import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportHost, requiredNativeSourceInputs, validateSourceHostJob, createSourcePreflightDatabaseGate,
  requiredNativeSourceInputs26, validateSourceHostJob26, captureNativeSourceProvider26, validateExecutableSourceHostJob26, createSourcePreflightRuntimeGate26, captureNativeSourceSession26,validateSourceHostRuntimeReview26, openImportHost26 } from './production-source-host.mjs';
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

const runtimeReview=()=>({reviewFile:'/synthetic/C-runtime26-v7-review.json',trustedReviewSha256:sha('8')});
function executableJob26(){return {...job26(),runtime26Review:runtimeReview()};}
const mockRuntime=()=>({profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(){}});
function session26Fixture(){const b=job26().binding;return {async *steps(){},async close(){},async authorizeStep(){},async assertExecutionAllowed(){},async assertAllowed(){},async authorizeNativeCommand(){},async preflight(){},
 openSources:Object.fromEntries(requiredNativeSourceInputs26().closureSourceGroups.map(group=>[group,async()=>{}])),closureScope:{batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,authorizedPayloadHash:b.authorizedPayloadHash,expectedCounts:{},expectedSourceEntityCounts:{}},nativeProductSourceReader:{async authorize(){}},bootstrap26:{async authorizeStageSourceActor(){},async stageNewBatch26(){}}};}
test('executableHost26 closed9 input captures separate runtime review without changing prior input-only26 contract',()=>{
 const j=executableJob26(),captured=validateExecutableSourceHostJob26(j);assert.deepEqual(captured,j);j.runtime26Review.reviewFile='/changed';assert.equal(captured.runtime26Review.reviewFile,runtimeReview().reviewFile);const prior=job26();assert.deepEqual(validateSourceHostJob26(prior),prior);
 for(const mutate of [x=>{delete x.runtime26Review;},x=>{x.runtime26Review.passed=true;},x=>{x.runtime26Review.trustedReviewSha256='';},x=>{x.runtime26Review.reviewFile='relative';},x=>{x.version='NATIVE_IMPORT_SOURCE_HOST19_V1';}]){const value=executableJob26();mutate(value);assert.throws(()=>validateExecutableSourceHostJob26(value));}
 let reads=0;const getter=executableJob26();Object.defineProperty(getter,'runtime26Review',{enumerable:true,get(){reads++;return runtimeReview();}});assert.throws(()=>validateExecutableSourceHostJob26(getter));assert.equal(reads,0);
});
test('executableHost26 deferred gate exposes only actual D1-issued pool and capability after preflight with single original owner cleanup',async()=>{
 let created=0,ended=0,rawConnects=0,issuedConnects=0;const raw={async connect(){rawConnects++;throw Error('RAW_POOL_MUST_NOT_ESCAPE');},async end(){ended++;}},pool={async connect(){issuedConnects++;return {synthetic:true};}},runtime=mockRuntime();
 const gate=createSourcePreflightRuntimeGate26(()=>{created++;return raw;},async(original,review)=>{assert.equal(original,raw);assert.deepEqual(review,runtimeReview());return {pool,runtime26:runtime};},runtimeReview());
 assert.throws(()=>gate.capability.ready(),/DATABASE_PRECHECK/);assert.equal(created,0);const actual=await gate.activate();assert.equal(actual.pool,pool);assert.equal(actual.runtime26,runtime);assert.equal(gate.capability.ready(),actual);await gate.capability.ready().pool.connect();assert.equal(issuedConnects,1);assert.equal(rawConnects,0);assert.throws(()=>gate.activate(),/DATABASE_PRECHECK/);await gate.close();await gate.close();assert.equal(created,1);assert.equal(ended,1);assert.throws(()=>gate.capability.ready(),/DATABASE_PRECHECK/);
});
test('executableHost26 failed or racing issuer activation closes original pool once and never leaks a fabricated or getter capability',async()=>{
 let ended=0,gets=0;const make=()=>({async connect(){throw Error('NOT_CONNECTED');},async end(){ended++;}});
 const bad=createSourcePreflightRuntimeGate26(make,async()=>{const value={pool:{async connect(){}},runtime26:mockRuntime()};Object.defineProperty(value,'runtime26',{enumerable:true,get(){gets++;return mockRuntime();}});return value;},runtimeReview());await assert.rejects(bad.activate());await bad.close();assert.equal(ended,1);assert.equal(gets,0);
 let resolve;const race=createSourcePreflightRuntimeGate26(make,()=>new Promise(r=>{resolve=r;}),runtimeReview()),activation=race.activate(),closing=race.close();resolve({pool:{async connect(){}},runtime26:mockRuntime()});await assert.rejects(activation,/DATABASE_PRECHECK/);await closing;assert.equal(ended,2);assert.throws(()=>race.capability.ready(),/DATABASE_PRECHECK/);
});
test('executableHost26 captures concrete preflight and all11 source sessions plus exact26 bootstrap without passed flags or accessor substitutes',()=>{
 const s=session26Fixture(),captured=captureNativeSourceSession26(s,job26().binding),original=captured.openSources.CATALOGUE;s.openSources.CATALOGUE=async()=>{throw Error('REPLACED');};assert.equal(captured.openSources.CATALOGUE,original);s.closureScope.expectedCounts.changed=1;assert.equal(Object.hasOwn(captured.closureScope.expectedCounts,'changed'),false);
 for(const mutate of [x=>{delete x.preflight;},x=>{delete x.openSources.SKUS;},x=>{x.openSources.PRODUCTS={passed:true};},x=>{x.bootstrap26={authorizeStageSourceActor:async()=>{},stageNewBatch:async()=>{}};},x=>{x.closureScope.authorizedPayloadHash=sha('c');}]){const value=session26Fixture();mutate(value);assert.throws(()=>captureNativeSourceSession26(value,job26().binding));}
 let gets=0;const getter=session26Fixture();Object.defineProperty(getter,'preflight',{enumerable:true,get(){gets++;return async()=>{};}});assert.throws(()=>captureNativeSourceSession26(getter,job26().binding));assert.equal(gets,0);
});
async function negativeHost26Fixture(t,mode){
 const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-executable-host26-'));t.after(()=>rm(dir,{recursive:true,force:true}));const j=executableJob26(),save=async(name,value)=>{const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value)),path=join(dir,name);await writeFile(path,bytes);return {path,sha:createHash('sha256').update(bytes).digest('hex')};};
 const native=await save('native.json',{schemaVersion:2,validatorVersion:'NATIVE_PRODUCT_REFERENCE_DECISIONS_V2_EXACT26',schemaProfile:'EXACT26',batchId:j.binding.batchId,fixedSourceNamespace:j.binding.fixedSourceNamespace,selection:{entity:'PRODUCT',selectionSha256:j.binding.selectionSha256},mappingFiles:[],decisions:[{synthetic:true}]});j.sources.referenceDecisionFile=native.path;j.sources.trustedReferenceDecisionSha256=native.sha;
 const productReview=await save('native-ref-review.json',{});j.sources.reviewFile=productReview.path;j.sources.trustedReviewSha256=productReview.sha;
 const qb=await save('QB.json',{result:'PASS',scope:'SYNTHETIC_NEGATIVE_PREFLIGHT_ONLY'}),metadata=await save('C-runtime.json',{version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:j.binding.target.database,databaseOid:'1',actingRole:j.binding.target.role,sessionUser:j.binding.target.role,serverAddress:j.binding.target.serverAddress,serverPort:j.binding.target.serverPort,postmasterStart:j.binding.target.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',patchLevel:mode==='adopted-denied'?'26_v14_core_initialization':'26_v11_document_specification_save',sha256:sha('a')},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:qb.path,sha256:qb.sha,result:'PASS'},realImportExecutionAuthorized:false});j.runtime26Review={reviewFile:metadata.path,trustedReviewSha256:metadata.sha};
 if(mode==='adopted-denied')Object.assign(j.binding,{phase:'FULL_SOURCE_CONTINUATION_26_V1',coreSourceDigest:sha('c'),coreReceiptId:id(999)});
 const marker='host26:'+dir;globalThis[marker]={opened:0,closed:0,closedGate:false};t.after(()=>{delete globalThis[marker];});
 const groups=requiredNativeSourceInputs26().closureSourceGroups,code=`export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';export const sourceGroups=${JSON.stringify(groups)};export async function openSourceSession({binding,database}){const m=globalThis[${JSON.stringify(marker)}];m.opened++;${mode==='early'?'database.ready();':''}const close=async()=>{m.closed++;try{database.ready();}catch(e){m.closedGate=e.code==='IMPORT_SOURCE_HOST_DATABASE_PRECHECK';}};${mode==='malformed'?'return {close};':''}return {close,async *steps(){},async authorizeStep(){},async assertExecutionAllowed(){},async assertAllowed(){},async authorizeNativeCommand(){},async preflight(){${mode==='boolean'?'return true;':mode==='adopted-denied'?"throw Error('PRODUCTION_ADOPTED26_EVIDENCE');":''}},openSources:Object.fromEntries(sourceGroups.map(g=>[g,async()=>{}])),closureScope:{batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:binding.selectionSha256,authorizedPayloadHash:binding.authorizedPayloadHash,expectedCounts:{},expectedSourceEntityCounts:{}},nativeProductSourceReader:{async authorize(){}},${mode==='adopted-denied'?"adoptedClosure:{async expected(){throw Error('NO_SOURCE_ITERATOR');},async authorizeStage(){},async authorizePublish(){}},bootstrap26:null":'bootstrap26:{async authorizeStageSourceActor(){},async stageNewBatch26(){}}'}};}`;
 const provider=await save('provider.mjs',code);j.providers={path:provider.path,sha256:provider.sha};const config=await save('job.json',j);return {configFile:config.path,marker,dir,job:j,save,native,productReview};
}
test('executableHost26 denies provider target access and closes malformed sessions before any pool activation',async t=>{
 for(const mode of ['early','malformed']){const f=await negativeHost26Fixture(t,mode);await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}),mode==='early'?/DATABASE_PRECHECK/:/SESSION_REQUIRED/);assert.equal(globalThis[f.marker].opened,1);assert.equal(globalThis[f.marker].closed,mode==='early'?0:1);if(mode==='malformed')assert.equal(globalThis[f.marker].closedGate,true);}
});
test('executableHost26 boolean preflight or missing independent native reference grant cannot activate target',async t=>{
 for(const mode of ['boolean','void']){const f=await negativeHost26Fixture(t,mode);await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}));assert.equal(globalThis[f.marker].closed,1);assert.equal(globalThis[f.marker].closedGate,true);}
});

test('executableHost26 actual-v11 input: exact reviewed target/catalog and explicit fixed source timestamp without a read-purpose write grant',()=>{
 const b=job26().binding,metadata={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:b.target.database,databaseOid:'1',actingRole:b.target.role,sessionUser:b.target.role,serverAddress:b.target.serverAddress,serverPort:b.target.serverPort,postmasterStart:b.target.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',patchLevel:'26_v11_document_specification_save',sha256:sha('a')},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:'/synthetic/QB.json',sha256:sha('b'),result:'PASS'},realImportExecutionAuthorized:false};
 assert.equal(validateSourceHostRuntimeReview26(metadata,b),undefined);
 for(const patch of ['26_v7_media_color_swap','26_v9_empty_history_publication_dispatch'])assert.throws(()=>validateSourceHostRuntimeReview26({...metadata,catalog:{...metadata.catalog,patchLevel:patch}},b),/RUNTIME_REVIEW/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...metadata,target:{...metadata.target,database:'different-target'}},b),/RUNTIME_TARGET/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...metadata,realImportExecutionAuthorized:true},b),/RUNTIME_REVIEW/);
 const session=session26Fixture(),now=()=> '2026-10-24T00:00:00.000Z';session.now=now;const captured=captureNativeSourceSession26(session,b);assert.equal(captured.now,now);assert.equal(captured.now(),'2026-10-24T00:00:00.000Z');
 assert.throws(()=>captureNativeSourceSession26({...session,now:true},b),/SESSION_REQUIRED/);
 const {BARCODES:_,...missing}=session.openSources;assert.throws(()=>captureNativeSourceSession26({...session,openSources:missing},b),/FACTORIES_REQUIRED/);
});
function coreJob26(){const j=executableJob26();j.binding={...j.binding,phase:'CORE_INITIALIZATION_26_V1',coreSourceDigest:sha('7'),authorizedPayloadHash:null};j.sources={reviewFile:'/synthetic/core-source-review.json',trustedReviewSha256:sha('6')};return j;}
test('v14 source host CORE uses only explicit real party scope and unknown full source, while full continuation still requires all11',()=>{
 const j=coreJob26();assert.deepEqual(validateExecutableSourceHostJob26(j),j);
 const module={providerVersion:'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1',sourceGroups:['PARTIES'],async openSourceSession(){}};assert.deepEqual(captureNativeSourceProvider26(module,j.binding.phase).sourceGroups,['PARTIES']);assert.throws(()=>captureNativeSourceProvider26(module),/FACTORIES_REQUIRED/);
 const complete=session26Fixture(),s=Object.fromEntries(['steps','close','authorizeStep','assertExecutionAllowed','assertAllowed','authorizeNativeCommand','preflight','bootstrap26'].map(k=>[k,complete[k]]));s.now=()=> '2026-10-24T00:00:00.123Z';assert.equal(captureNativeSourceSession26(s,j.binding).now(),s.now());assert.throws(()=>captureNativeSourceSession26({...s,openSources:{}},j.binding),/SESSION_REQUIRED/);
 for(const change of [x=>x.binding.authorizedPayloadHash=sha('b'),x=>x.database.host='remote.invalid',x=>x.sources.referenceDecisionFile='/fake',x=>x.binding.coreSourceDigest=null]){const x=coreJob26();change(x);assert.throws(()=>validateExecutableSourceHostJob26(x));}
 const resumed=executableJob26();resumed.binding={...resumed.binding,phase:'FULL_SOURCE_CONTINUATION_26_V1',coreSourceDigest:sha('7'),coreReceiptId:id(999)};assert.deepEqual(validateExecutableSourceHostJob26(resumed),resumed);const source=session26Fixture();source.bootstrap26=null;assert.equal(captureNativeSourceSession26(source,resumed.binding).bootstrap26,null);delete source.openSources[Object.keys(source.openSources)[0]];assert.throws(()=>captureNativeSourceSession26(source,resumed.binding),/FACTORIES_REQUIRED/);
});
test('v14 source host exact runtime metadata distinguishes approved v14 write scope from old v11',()=>{
 const b=coreJob26().binding,m={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:b.target.database,databaseOid:1,actingRole:b.target.role,sessionUser:b.target.role,serverAddress:b.target.serverAddress,serverPort:b.target.serverPort,postmasterStart:b.target.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:sha('1'),patchLevel:'26_v14_core_initialization'},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:'/synthetic/review',sha256:sha('2'),result:'PASS'},realImportExecutionAuthorized:false};
 assert.equal(validateSourceHostRuntimeReview26(m,b),undefined);assert.throws(()=>validateSourceHostRuntimeReview26({...m,catalog:{...m.catalog,patchLevel:'26_v11_document_specification_save'}},b),/RUNTIME_REVIEW/);assert.throws(()=>validateSourceHostRuntimeReview26({...m,realImportExecutionAuthorized:true},b),/RUNTIME_REVIEW/);
});
test('v16 source host runtime metadata permits from-v14 only for full continuation and preserves target and authority checks',()=>{
 const base=coreJob26().binding,b={...base,phase:'FULL_SOURCE_CONTINUATION_26_V1',authorizedPayloadHash:sha('b'),coreReceiptId:id(999)};
 const m={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:b.target.database,databaseOid:'1',actingRole:b.target.role,sessionUser:b.target.role,serverAddress:b.target.serverAddress,serverPort:b.target.serverPort,postmasterStart:b.target.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:'6e8330f6a5ee9e4f100461a15f97d6e488796077cc7f4c03202718c70335067c',patchLevel:'26_v16_history_responsible_from_v14'},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:'/synthetic/review',sha256:sha('2'),result:'PASS'},realImportExecutionAuthorized:false};
 assert.equal(validateSourceHostRuntimeReview26(m,b),undefined);
 assert.equal(validateSourceHostRuntimeReview26({...m,catalog:{...m.catalog,patchLevel:'26_v14_core_initialization'}},b),undefined);
 for(const otherBinding of [base,job26().binding])assert.throws(()=>validateSourceHostRuntimeReview26(m,otherBinding),/RUNTIME_REVIEW/);
 for(const patchLevel of ['26_v11_document_specification_save','26_v15_category_order_undo','26_v16_history_responsible_from_v15','26_v17_future'])assert.throws(()=>validateSourceHostRuntimeReview26({...m,catalog:{...m.catalog,patchLevel}},b),/RUNTIME_REVIEW/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...m,target:{...m.target,database:'different-target'}},b),/RUNTIME_TARGET/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...m,realImportExecutionAuthorized:true},b),/RUNTIME_REVIEW/);
});
function v20FullRuntimeFixture(){
 const base=coreJob26().binding,b={...base,phase:'FULL_SOURCE_CONTINUATION_26_V1',authorizedPayloadHash:sha('b'),coreReceiptId:id(999)};
 const m={version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:b.target.database,databaseOid:'1027659',actingRole:b.target.role,sessionUser:b.target.role,serverAddress:b.target.serverAddress,serverPort:b.target.serverPort,postmasterStart:b.target.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:'b5d8f2e8e278435d8a0e80ec2d7e7d08b607118859e02fc44a9f8bcedd57d8e5',patchLevel:'26_v20_history_insert_identity_from_v19'},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:'/synthetic/v20-independent-review',sha256:sha('2'),result:'PASS'},realImportExecutionAuthorized:false};
 return {base,b,m};
}
test('v20 full host accepts the existing issuer approved profile as metadata only',()=>{
 const {b,m}=v20FullRuntimeFixture();assert.equal(validateSourceHostRuntimeReview26(m,b),undefined);
});
test('v20 full host retains exact target and continuation phase checks',()=>{
 const {base,b,m}=v20FullRuntimeFixture();
 for(const change of [{database:'different-target'},{actingRole:'different-role'},{postmasterStart:'different-process'},{serverAddress:'192.0.2.99'},{serverPort:15432}])assert.throws(()=>validateSourceHostRuntimeReview26({...m,target:{...m.target,...change}},b),/RUNTIME_TARGET/);
 for(const other of [base,job26().binding])assert.throws(()=>validateSourceHostRuntimeReview26(m,other),/RUNTIME_REVIEW/);
});
test('v20 full host rejects unapproved profiles invalid catalog digest and execution overclaim',()=>{
 const {b,m}=v20FullRuntimeFixture();
 for(const patchLevel of ['26_v20_future','26_v19_barcode_scheme_initialization_from_v16_v15','26_v16_history_responsible_from_v15','26_v11_document_specification_save'])assert.throws(()=>validateSourceHostRuntimeReview26({...m,catalog:{...m.catalog,patchLevel}},b),/RUNTIME_REVIEW/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...m,catalog:{...m.catalog,sha256:'invalid'}},b),/RUNTIME_REVIEW/);
 assert.throws(()=>validateSourceHostRuntimeReview26({...m,realImportExecutionAuthorized:true},b),/RUNTIME_REVIEW/);
});
test('v14 source host real constructor keeps target closed through CORE source preflight and closes once on denial',async t=>{
 for(const mode of ['early','boolean']){
  const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-v14-core-host-'));t.after(()=>rm(directory,{recursive:true,force:true}));const j=coreJob26(),save=async(name,value)=>{const path=join(directory,name),bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));await writeFile(path,bytes);return {path,sha256:createHash('sha256').update(bytes).digest('hex')};};
  const source=await save('core-review.json',{}),qb=await save('QB.json',{result:'PASS',synthetic:true});j.sources={reviewFile:source.path,trustedReviewSha256:source.sha256};const b=j.binding.target,metadata=await save('runtime.json',{version:'C_NATIVE_RUNTIME26_REVIEW_V1',decision:'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA',target:{database:b.database,databaseOid:'1',actingRole:b.role,sessionUser:b.role,serverAddress:b.serverAddress,serverPort:b.serverPort,postmasterStart:b.postmasterStartedAt},catalog:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',sha256:sha('a'),patchLevel:'26_v14_core_initialization'},purposes:['IMPORT_STAGE'],scope:'EXACT_TARGET_METADATA_ONLY',independentReview:{path:qb.path,sha256:qb.sha256,result:'PASS'},realImportExecutionAuthorized:false});j.runtime26Review={reviewFile:metadata.path,trustedReviewSha256:metadata.sha256};
  const marker='synthetic-core-host:'+directory;globalThis[marker]={closed:0,closedGate:false};t.after(()=>{delete globalThis[marker];});const provider=await save('provider.mjs',`export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';export const sourceGroups=['PARTIES'];export async function openSourceSession({database}){${mode==='early'?'database.ready();':''}return {async *steps(){},async close(){const m=globalThis[${JSON.stringify(marker)}];m.closed++;try{database.ready();}catch(e){m.closedGate=e.code==='IMPORT_SOURCE_HOST_DATABASE_PRECHECK';}},async authorizeStep(){},async assertExecutionAllowed(){},async assertAllowed(){},async authorizeNativeCommand(){},async preflight(){return true;},now:()=> '2026-10-24T00:00:00.123Z',bootstrap26:{async authorizeStageSourceActor(){},async stageNewBatch26(){}}};}`);j.providers=provider;const config=await save('job.json',j);await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:config.path}),{code:mode==='early'?'IMPORT_SOURCE_HOST_DATABASE_PRECHECK':'IMPORT_SOURCE_HOST26_AUTHORITY_RESULT'});assert.equal(globalThis[marker].closed,mode==='early'?0:1);if(mode==='boolean')assert.equal(globalThis[marker].closedGate,true);
 }
});

test('T19 host forwards verified prior publication return through runner with zero execute/journal calls and preserves iterator cleanup',async()=>{
 const {forwardSourceSteps26}=await import('./production-source-host.mjs'),{runImportSteps}=await import('./run.mjs');
 const receipt={operationId:id(80),batchId:id(1),sequence:9,cursor:99,status:'IMPORTED',ledgerEntryIds:[id(81)]};let executed=0,appended=0,closed=0,finalized=0;
 const source={steps:()=>forwardSourceSteps26({async *steps(){try{return structuredClone(receipt);}finally{finalized++;}},active(){},maxSteps:1,core:false}),async close(){closed++;}};
 const result=await runImportSteps({source,async execute(){executed++;},async append(){appended++;},signal:new AbortController().signal,maxSteps:1});
 assert.deepEqual(result,{status:'REQUESTED_STEP_SEQUENCE_COMPLETE',completed:0,publicationReadback:'NOT_PERFORMED_BY_RUNNER',recoveredPublication:receipt});assert.deepEqual([executed,appended,closed,finalized],[0,0,1,1]);
 let cleaned=0;const limited=forwardSourceSteps26({async *steps(){try{yield{kind:'MAIN',payload:{action:'IMPORT_CORE_STAGE'}};yield{kind:'MAIN',payload:{action:'IMPORT_CORE_STAGE'}};}finally{cleaned++;}},active(){},maxSteps:1,core:true});await limited.next();await assert.rejects(limited.next(),/STEP_LIMIT/);assert.equal(cleaned,1);
 const core=forwardSourceSteps26({async *steps(){yield{kind:'SKU',payload:{}};},active(){},maxSteps:1,core:true});await assert.rejects(core.next(),/CORE_ONLY/);
});
test('source627 host carries only an own data-function physical resolver; an accessor cannot run during session capture',()=>{
 const s=session26Fixture(),resolver=async ref=>ref;s.nativeProductSourceReader.resolveFile=resolver;const captured=captureNativeSourceSession26(s,job26().binding);assert.equal(Object.getOwnPropertyDescriptor(captured.nativeProductSourceReader,'resolveFile').value,resolver);
 let gets=0;const bad=session26Fixture();Object.defineProperty(bad.nativeProductSourceReader,'resolveFile',{enumerable:true,get(){gets++;return resolver;}});assert.throws(()=>captureNativeSourceSession26(bad,job26().binding),/SESSION_REQUIRED/);assert.equal(gets,0);
});

test('source742 host captures only explicit full-continuation evidence methods without exposing expected input or executing getters',async()=>{
 const b={...job26().binding,phase:'FULL_SOURCE_CONTINUATION_26_V1',coreSourceDigest:sha('c'),coreReceiptId:id(999)},s=session26Fixture();s.bootstrap26=null;
 let checks=0;
 const evidence={async expected(){return {synthetic:'private fixed expected'};},async authorizeStage(){checks++;},async authorizePublish(){checks++;}};
 s.adoptedClosure=evidence;
 const captured=captureNativeSourceSession26(s,b);assert.ok(Object.isFrozen(captured.adoptedClosure));
 evidence.authorizeStage=async()=>{throw Error('MUTATED_AFTER_CAPTURE');};
 await captured.adoptedClosure.authorizeStage({});await captured.adoptedClosure.authorizePublish({});assert.equal(checks,2);
 for(const invalid of [true,{expected:{}},{...evidence,callerExpected:{passed:true}}])assert.throws(()=>captureNativeSourceSession26({...s,adoptedClosure:invalid},b));
 let reads=0;const getter=Object.defineProperty({},'expected',{enumerable:true,get(){reads++;return()=>{};}});assert.throws(()=>captureNativeSourceSession26({...s,adoptedClosure:getter},b));assert.equal(reads,0);
 assert.throws(()=>captureNativeSourceSession26({...s,bootstrap26:session26Fixture().bootstrap26},job26().binding),/ADOPTED_SCOPE/);
});

test('source742 host refuses unadmitted evidence in preflight while target capability remains closed',async t=>{
 const f=await negativeHost26Fixture(t,'adopted-denied');
 await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}),/PRODUCTION_ADOPTED26_EVIDENCE/);
 assert.equal(globalThis[f.marker].opened,1);assert.equal(globalThis[f.marker].closed,1);assert.equal(globalThis[f.marker].closedGate,true);
});

async function logicalHostReferenceFixture(t,{resolver=true,change=null}={}){
 const f=await negativeHost26Fixture(t,'void'),j=f.job;
 const logicalNative=f.dir+'/not-a-physical-directory/native.json',logicalReview=f.dir+'/not-a-physical-directory/review.json';
 if(change==='batch'||change==='selection')f.native=await f.save('native.json',{schemaVersion:2,validatorVersion:'NATIVE_PRODUCT_REFERENCE_DECISIONS_V2_EXACT26',schemaProfile:'EXACT26',batchId:change==='batch'?id(999):j.binding.batchId,fixedSourceNamespace:j.binding.fixedSourceNamespace,selection:{entity:'PRODUCT',selectionSha256:change==='selection'?sha('f'):j.binding.selectionSha256},mappingFiles:[],decisions:[{synthetic:true}]});
 if(change==='oversized-native')f.native=await f.save('native.json','x'.repeat(8388609));
 if(change==='oversized-review')f.productReview=await f.save('native-ref-review.json','x'.repeat(4194305));
 j.sources.referenceDecisionFile=resolver?logicalNative:f.native.path;j.sources.reviewFile=resolver?logicalReview:f.productReview.path;
 j.sources.trustedReferenceDecisionSha256=f.native.sha;j.sources.trustedReviewSha256=f.productReview.sha;
 const {stat}=await import('node:fs/promises');
 const locations=await Promise.all([[logicalNative,f.native],[logicalReview,f.productReview]].map(async([logical,physical])=>{
  const ref={path:physical.path,bytes:(await stat(physical.path)).size,sha256:physical.sha};return{logical:{...ref,path:logical},physical:ref,kind:'METADATA',roles:['synthetic-host-reference']};
 }));
 if(change==='pin')j.sources.trustedReferenceDecisionSha256=sha('f');
 if(change==='review-pin')j.sources.trustedReviewSha256=sha('f');
 if(change==='unlisted')locations.shift();
 const providerUrl=new URL('./production-source-provider26.mjs',import.meta.url).href;
 const code=`import {sourceFileResolver26} from ${JSON.stringify(providerUrl)};export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';export const sourceGroups=${JSON.stringify(requiredNativeSourceInputs26().closureSourceGroups)};
 export async function openSourceSession({binding,database,sources}){const m=globalThis[${JSON.stringify(f.marker)}];m.opened++;m.events=[];
 const resolve=sourceFileResolver26({fileLocations:${JSON.stringify(locations)}});
 return{async close(){m.closed++;try{database.ready();}catch(e){m.closedGate=e.code==='IMPORT_SOURCE_HOST_DATABASE_PRECHECK';}},async *steps(){throw Error('NO_EXECUTION');},async authorizeStep(){},async assertExecutionAllowed(){},async assertAllowed(){},async authorizeNativeCommand(){},
 async preflight(){m.events.push('source-groups-preflight');if(sources.referenceDecisionFile!==${JSON.stringify(j.sources.referenceDecisionFile)}||sources.reviewFile!==${JSON.stringify(j.sources.reviewFile)})throw Error('LOGICAL_IDENTITY_CHANGED');throw Error('HOST_REFERENCES_VERIFIED_BEFORE_GROUPS');},
 openSources:Object.fromEntries(sourceGroups.map(g=>[g,async()=>{throw Error('NO_GROUP_CONSTRUCTOR');}])),closureScope:{batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selectionSha256:binding.selectionSha256,authorizedPayloadHash:binding.authorizedPayloadHash,expectedCounts:{},expectedSourceEntityCounts:{}},
 nativeProductSourceReader:{async authorize(){},${resolver?"async resolveFile(ref){m.events.push('resolve:'+ref.path);return resolve(ref);}":''}},bootstrap26:{async authorizeStageSourceActor(){},async stageNewBatch26(){}}};}`;
 const module=await f.save('logical-provider.mjs',code);j.providers={path:module.path,sha256:module.sha};const config=await f.save('logical-job.json',j);f.configFile=config.path;
 return f;
}
test('source754 host resolves original logical metadata before source-group preflight and keeps target closed',async t=>{
 const f=await logicalHostReferenceFixture(t);
 await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}),/HOST_REFERENCES_VERIFIED_BEFORE_GROUPS/);
 const m=globalThis[f.marker];assert.equal(m.opened,1);assert.deepEqual(m.events,['resolve:'+f.job.sources.referenceDecisionFile,'resolve:'+f.job.sources.reviewFile,'source-groups-preflight']);assert.equal(m.closed,1);assert.equal(m.closedGate,true);
});
test('source754 bad native pin, scope, missing exact map or original byte limit refuses before groups and activation',async t=>{
 for(const change of ['pin','review-pin','batch','selection','unlisted','oversized-native','oversized-review']){
  const f=await logicalHostReferenceFixture(t,{change});
  await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}));
  const m=globalThis[f.marker];assert.equal(m.events.includes('source-groups-preflight'),false);assert.equal(m.closed,1);assert.equal(m.closedGate,true);
 }
});
test('source754 legacy physical metadata without resolver still validates before preflight',async t=>{
 const f=await logicalHostReferenceFixture(t,{resolver:false});
 await assert.rejects(openImportHost26({signal:new AbortController().signal,configFile:f.configFile}),/HOST_REFERENCES_VERIFIED_BEFORE_GROUPS/);
 assert.deepEqual(globalThis[f.marker].events,['source-groups-preflight']);assert.equal(globalThis[f.marker].closedGate,true);
});
