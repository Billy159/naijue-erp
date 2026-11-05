import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPostgresImportExecutor, createPostgresImportExecutor26, readCoreImportContinuation26, runImportSteps } from './run.mjs';
import { prepareNativeBarcode } from '../../packages/application/src/native-barcode-import.ts';
import { HISTORY_COUNT_KEYS } from '../../packages/application/src/history-storage-contract.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { cutoffStage, cutoffTime } from '../../tests/support/synthetic-cutoff-fixtures.ts';

const sha = c => c.repeat(64);
const plan = () => ({ version: 'NATIVE_IMPORT_EXECUTION_19_V1', batchId: cutoffStage.batchId, actorAccountId: cutoffStage.actorAccountId,
  fixedSourceNamespace: 'synthetic-import-driver', cutoffAt: cutoffTime, selectionSha256: sha('a'), authorizedPayloadHash: sha('b'),
  target: { database: 'demo_8877_driver', role: 'synthetic_operator', serverAddress: '127.0.0.1', serverPort: 55555, postmasterStartedAt: '2026-10-22 01:00:00+00' } });
const stage = () => ({ kind: 'MAIN', payload: { ...structuredClone(cutoffStage), sourceName: plan().fixedSourceNamespace,
  sourceHash: plan().selectionSha256, mappingVersion: 'V2_HISTORY_NULLABLE_1',
  historyMetadata: { expectedCounts: Object.fromEntries(['history_sales_header', 'history_sales_line', 'history_sales_settlement', 'history_transfer_header',
    'history_transfer_line', 'import_source_row', 'import_sku_alias', 'import_stock_contributor', 'barcodes'].map(k => [k, 0])), payloadHash: plan().authorizedPayloadHash } } });
function fixture({ reject, target = plan().target, schema = Array.from({ length: 19 }, (_, i) => i + 1), mutate = false } = {}) {
  const calls = [], releases = [], auth = [], events = []; let previous;
  const pool = { async connect() {
    calls.push('CONNECT');
    return { async query(sql) {
      calls.push(sql); let rows = [];
      if (sql.includes('import-executor:target')) rows = [{ database: target.database, role: target.role, server_address: target.serverAddress,
        server_port: target.serverPort, postmaster_started_at: target.postmasterStartedAt }];
      else if (sql.includes('accounting_guards_present')) rows = [{ accounting_guards_present: true }];
      else if (sql.includes('integrity_guards_present')) rows = [{ integrity_guards_present: true }];
      else if (sql.includes('array_agg(version')) rows = [{ versions: schema }];
      else if (sql.includes('FROM naijue_erp.operation_receipt')) rows = previous ? [previous] : [];
      return { rows, rowCount: 1 };
    }, release(error) { releases.push(error); } };
  } };
  const options = { pool, binding: plan(), now: () => cutoffTime, authorization: {
    async assertExecutionAllowed() { auth.push('EXECUTION'); if (reject) throw Object.assign(Error('private refusal detail'), { code: 'SOURCE_REVOKED' }); },
    async authorizeStep(s) { auth.push('STEP'); if (mutate) s.payload.batchId = 'modified'; },
    async assertAllowed() { auth.push('MAIN'); }, async authorizeNativeCommand() { auth.push('NATIVE'); }, async authorizeClosure() { auth.push('CLOSURE'); }
  } };
  return { options, calls, releases, auth, events, replay(result) { previous = { request_hash: requestHash(stage().payload), target_type: 'IMPORT',
    target_id: plan().batchId, action: 'IMPORT_STAGE', result_data: result }; } };
}
function source(steps, onClose = async () => {}) { return { async *steps() { yield* steps; }, close: onClose }; }

test('executor construction is inert; missing cutoff/authority/getter never connects or invokes getters', () => {
  const f = fixture(); createPostgresImportExecutor(f.options); assert.deepEqual(f.calls, []);
  assert.throws(() => createPostgresImportExecutor({ ...f.options, binding: { ...plan(), cutoffAt: '' } }), { code: 'IMPORT_EXECUTION_CUTOFF_REQUIRED' });
  assert.throws(() => createPostgresImportExecutor({ ...f.options, authorization: {} }), { code: 'IMPORT_EXECUTION_SHAPE' });
  let gets = 0; const b = Object.defineProperty(plan(), 'cutoffAt', { enumerable: true, get() { gets++; return cutoffTime; } });
  assert.throws(() => createPostgresImportExecutor({ ...f.options, binding: b })); assert.equal(gets, 0); assert.deepEqual(f.calls, []);
});
test('revocation and captured-step mutation reject before any target connection', async () => {
  for (const settings of [{ reject: true }, { mutate: true }]) {
    const f = fixture(settings); await assert.rejects(createPostgresImportExecutor(f.options)(stage())); assert.deepEqual(f.calls, []);
  }
});
test('batch/selection/namespace and legacy unaccounted MAIN reject before authority or SQL', async () => {
  for (const step of [{ ...stage(), kind: 'UNKNOWN' }, { ...stage(), payload: { ...stage().payload, batchId: 'wrong' } },
    { ...stage(), payload: { ...stage().payload, cutoffAt: '2026-10-21T00:00:00Z' } },
    { kind: 'MAIN', payload: { batchId: plan().batchId, actorAccountId: plan().actorAccountId, action: 'IMPORT_CHUNK' } },
    { kind: 'HEADER', payload: { batchId: plan().batchId, fixedSourceNamespace: 'wrong', selection: { selectionSha256: sha('a') } } }]) {
    const f = fixture(); await assert.rejects(createPostgresImportExecutor(f.options)(step)); assert.deepEqual(f.calls, []); assert.deepEqual(f.auth, []);
  }
});
test('wrong actual target or unreviewed schema rejects before any mutation', async () => {
  for (const settings of [{ target: { ...plan().target, database: 'other_database' } }, { schema: Array.from({ length: 20 }, (_, i) => i + 1) }]) {
    const f = fixture(settings); await assert.rejects(createPostgresImportExecutor(f.options)(stage()));
    assert.equal(f.calls.at(-1), 'ROLLBACK'); assert.ok(!f.calls.some(q => /^(INSERT|UPDATE|DELETE)/.test(q)));
    assert.deepEqual(f.releases, [undefined]);
  }
});
test('actual executor reaches existing MAIN store; same-key replay remains authorized and writes nothing twice', async () => {
  const f = fixture(), execute = createPostgresImportExecutor(f.options), result = await execute(stage());
  assert.equal(result.status, 'STAGED'); assert.equal(result.cursor, 0);
  assert.ok(f.calls.some(q => q.startsWith('INSERT INTO naijue_erp.import_batch')));
  assert.ok(f.calls.some(q => q.startsWith('INSERT INTO naijue_erp.operation_receipt')));
  const before = f.calls.length; f.replay(result); assert.deepEqual(await execute(stage()), result);
  assert.ok(f.calls.slice(before).every(q => !/^(INSERT|UPDATE|DELETE)/.test(q)));
  assert.deepEqual(f.auth, ['EXECUTION', 'STEP', 'MAIN', 'EXECUTION', 'STEP', 'MAIN']);
  assert.equal(f.calls.filter(q => q.includes('import-executor:target')).length, 1);
});
// Original reviewed zero-arity lease statement from native-party-import.ts; no registration or new authority.
const reviewedLegacyBootstrapLeaseSql='/* native-party-import:global-lock */ SELECT naijue_erp.cutoff_import_lock()';
test('private real-source bootstrap authorization precedes target connect; borrowed hook is not MAIN payload and exact replay does not repeat it',async()=>{
  const f=fixture();let checks=0,hooks=0;
  f.options.authorization.assertAllowed=async()=>{throw Error('Initial actor cannot be read from emptynewtarget');};
  f.options.bootstrap={async authorizeStageSourceActor(actor,command){assert.equal(actor,plan().actorAccountId);assert.deepEqual(command,stage().payload);if(checks++===0)assert.deepEqual(f.calls,[]);},
    async stageNewBatch(client,input){hooks++;assert.deepEqual(Reflect.ownKeys(client),['query']);assert.deepEqual(input.command,stage().payload);assert.equal(Object.hasOwn(input.command,'bootstrap'),false);await client.query(reviewedLegacyBootstrapLeaseSql);}};
  const execute=createPostgresImportExecutor(f.options),result=await execute(stage());assert.equal(result.status,'STAGED');assert.equal(hooks,1);assert.equal(checks,2);
  const callback=f.calls.findIndex(q=>q===reviewedLegacyBootstrapLeaseSql),audit=f.calls.findIndex(q=>q.startsWith('INSERT INTO naijue_erp.audit_change'));assert.ok(callback>0&&callback<audit);
  f.replay(result);assert.deepEqual(await execute(stage()),result);assert.equal(hooks,1);assert.equal(checks,4);
});
test('private legacy bootstrap rejects unreviewed SQL and wrong arity before callback driver IO; owner rolls back without audit or receipt',async()=>{
  for(const [sql,values] of [
    ['/* synthetic:private-bootstrap */ SELECT 1',undefined],
    [reviewedLegacyBootstrapLeaseSql+' ',undefined],
    [reviewedLegacyBootstrapLeaseSql+'; COMMIT',undefined],
    [reviewedLegacyBootstrapLeaseSql,[1]],
  ]){
    const f=fixture();let checks=0,hooks=0;
    f.options.bootstrap={async authorizeStageSourceActor(){if(checks++===0)assert.deepEqual(f.calls,[]);},
      async stageNewBatch(client){hooks++;await client.query(sql,values);}};
    await assert.rejects(createPostgresImportExecutor(f.options)(stage()),{code:'TRANSACTION_SCOPE'});
    assert.equal(checks,2);assert.equal(hooks,1);assert.equal(f.calls.includes(sql),false);
    assert.equal(f.calls.at(-1),'ROLLBACK');
    assert.ok(f.calls.some(q=>q.startsWith('INSERT INTO naijue_erp.import_batch')));
    assert.ok(!f.calls.some(q=>q.startsWith('INSERT INTO naijue_erp.audit_change')||q.startsWith('INSERT INTO naijue_erp.operation_receipt')));
  }
});
test('revoked initial source actor and malformed private bootstrap refuse without any target capability or getter execution',async()=>{
  const f=fixture();f.options.bootstrap={async authorizeStageSourceActor(){throw Object.assign(Error('private'),{code:'SOURCE_REVOKED'});},async stageNewBatch(){throw Error('mustnotrun');}};
  await assert.rejects(createPostgresImportExecutor(f.options)(stage()),{code:'SOURCE_REVOKED'});assert.deepEqual(f.calls,[]);
  let gets=0;const bad=Object.defineProperty({stageNewBatch:async()=>{}},'authorizeStageSourceActor',{enumerable:true,get(){gets++;return async()=>{};}});
  assert.throws(()=>createPostgresImportExecutor({...f.options,bootstrap:bad}),/IMPORT_EXECUTION_SHAPE/);assert.equal(gets,0);assert.deepEqual(f.calls,[]);
});
test('bounded sequence journals technical results only; awaits close and does not label full import', async () => {
  const events = []; let closed = false;
  const result = await runImportSteps({ source: source([stage()], async () => { await Promise.resolve(); closed = true; }),
    execute: async () => ({ status: 'STAGED', sequence: 0, cursor: 0, privateSource: 'MUST_NOT_LOG' }), append: async x => events.push(x),
    signal: new AbortController().signal, maxSteps: 1 });
  assert.equal(result.status, 'REQUESTED_STEP_SEQUENCE_COMPLETE'); assert.equal(result.publicationReadback, 'NOT_PERFORMED_BY_RUNNER');
  assert.equal(result.completed, 1); assert.equal(closed, true); assert.deepEqual(events.map(x => x.state), ['ATTEMPTING', 'COMMITTED']);
  assert.ok(!JSON.stringify(events).includes('MUST_NOT_LOG') && !JSON.stringify(events).includes('historyMetadata'));
});
test('failed/unknown store outcome stops once, preserves failure and closes source', async () => {
  let calls = 0, closed = 0; const events = [], failure = Object.assign(Error('private SQL path and source'), { code: 'COMMIT_UNCERTAIN' });
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; throw failure; },
    append: async x => events.push(x), signal: new AbortController().signal, maxSteps: 2 }), e => e === failure);
  assert.equal(calls, 1); assert.equal(closed, 1); assert.deepEqual(events.map(x => x.state), ['ATTEMPTING', 'FAILED_OUTCOME_UNVERIFIED']);
  assert.equal(events[1].code, 'COMMIT_UNCERTAIN'); assert.ok(!JSON.stringify(events).includes('private'));
});
test('journal failure before execute does no SQL; step limit/abort never execute extra operation', async () => {
  let calls = 0, closed = 0; const controller = new AbortController(); controller.abort();
  for (const options of [{ append: async () => { throw Error('journal unavailable'); }, signal: new AbortController().signal, maxSteps: 2 },
    { append: async () => {}, signal: controller.signal, maxSteps: 2 }]) {
    await assert.rejects(runImportSteps({ source: source([stage()], async () => { closed++; }), execute: async () => { calls++; return {}; }, ...options }));
  }
  assert.equal(calls, 0); assert.equal(closed, 2);
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; return {}; },
    append: async () => {}, signal: new AbortController().signal, maxSteps: 1 }), { code: 'IMPORT_EXECUTION_STEP_LIMIT' });
  assert.equal(calls, 1); assert.equal(closed, 3);
});
test('journal failure after actual result never retries a possibly committed step', async () => {
  let calls = 0, closed = 0;
  await assert.rejects(runImportSteps({ source: source([stage(), stage()], async () => { closed++; }), execute: async () => { calls++; return { status: 'STAGED' }; },
    append: async event => { if (event.state === 'COMMITTED') throw Error('journal disk full'); }, signal: new AbortController().signal, maxSteps: 2 }), /journal disk full/);
  assert.equal(calls, 1); assert.equal(closed, 1);
});
test('primary and source-close errors both remain visible; no raw error text goes to failure journal', async () => {
  const events = [];
  await assert.rejects(runImportSteps({ source: source([stage()], async () => { throw Error('close'); }), execute: async () => { throw Error('private source'); },
    append: async e => events.push(e), signal: new AbortController().signal, maxSteps: 1 }), e => e instanceof AggregateError && e.errors.length === 2);
  assert.equal(events.at(-1).code, 'IMPORT_EXECUTION_FAILED'); assert.ok(!JSON.stringify(events).includes('private source'));
});
test('CLI with no explicit registered host/cutoff fails without a network or source default', () => {
  const p = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(p.status, 1); assert.deepEqual(JSON.parse(p.stderr), { error: 'IMPORT_EXECUTION_USAGE' }); assert.equal(p.stdout, '');
});

function plan26(){return {...plan(),version:'NATIVE_IMPORT_EXECUTION_26_V1'};}
function barcode26Step(){
 const n={...Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE').columns.map(c=>[c.name,''])),来源编号:'SYNTHETIC-EXECUTOR-BARCODE',条码:'0001234000',SKU来源编号:'SYNTHETIC-CANONICAL',合并前SKU来源编号:'SYNTHETIC-ORIGINAL',条码性质:'主码',原始条码性质快照:'主码',原条码方案:'SYNTHETIC SCHEME',状态:'正常',绑定范围:'SKU'};
 const raw={来源编号:n.来源编号,条码:n.条码,SKU来源编号:n.合并前SKU来源编号,条码性质:'主码',原条码方案:n.原条码方案,状态:n.状态,绑定范围:'SKU'};
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,b=plan26();
 const input={batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:{source:'V3_BARCODE_REPLACEMENT',entity:'BARCODE',path:'business/03历史条码.csv',baseManifestSha256:sha('a'),selectionSha256:b.selectionSha256,approvalSha256:sha('c'),csvSha256:sha('d'),excludedSourceIdsSetSha256:sha('e')},
  source:{id:id(100),batchId:b.batchId,entityType:'BARCODE',sourceKey:n.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'BARCODE',rowNo:'2',sourceFileSha256:sha('a'),rowSha256:sha('a'),rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC source',raw:v}]))}},
  nativeBarcodeId:id(101),sku:{nativeId:id(102),canonicalSourceKey:n.SKU来源编号,oldSourceSkuKey:n.合并前SKU来源编号},scheme:{id:id(103),snapshot:{id:id(103),name:n.原条码方案,barcode_type:'RAW',rule_description:'SYNTHETIC',code_length:10,rule_version:'1',status:'HISTORICAL'}}};
 return {kind:'BARCODE',payload:prepareNativeBarcode(input)};
}
function executor26Fixture(settings={}){
 const calls=[],releases=[],proofs=[],auth=[],leases=new WeakMap();let connects=0,nativeExists=false,sourceExists=false;
 const step=barcode26Step(),b=plan26();
 const pool={async connect(){connects++;const lease={purpose:connects===1?'target':'native',queries:0,proved:false};const client={async query(sql,values=[]){assert.equal(lease.proved,true);lease.queries++;calls.push({sql,values,purpose:lease.purpose});const answer=rows=>({rows,rowCount:rows.length});
  if(sql==='COMMIT'&&settings.unknownAt===lease.purpose)throw Error('executor26 COMMIT unknown');
  if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('native-barcode:cutoff'))return answer([]);
  if(sql.includes('import-executor26:target')){const target=settings.target??b.target;return answer([{database:target.database,role:target.role,server_address:target.serverAddress,server_port:target.serverPort,postmaster_started_at:target.postmasterStartedAt}]);}
  if(sql.includes('import-executor26:schema'))return answer([{versions:Array.from({length:settings.schema??26},(_,i)=>i+1)}]);
  if(sql.includes('native-barcode:schema'))return answer([{installed_versions:Array.from({length:26},(_,i)=>i+1)}]);
  if(sql.includes('native-barcode:batch'))return answer([{id:b.batchId,mapping_version:'V2_HISTORY_NULLABLE_1',status:'STAGED',source_hash:b.selectionSha256,source_name:b.fixedSourceNamespace,already_published:false}]);
  if(sql.includes('native-barcode:sku-alias'))return answer([{id:step.payload.sku.nativeId}]);
  if(sql.includes('native-barcode:scheme'))return answer([{exact:true}]);
  if(sql.includes('native-barcode:target'))return answer(nativeExists?[{id:step.payload.nativeBarcode.id,exact:true}]:[]);
  if(sql.includes('native-barcode:main'))return answer(nativeExists?[{id:step.payload.nativeBarcode.id}]:[]);
  if(sql.includes('native-barcode:source-replay'))return answer(sourceExists?[{exact:true}]:[]);
  if(sql.includes('native-barcode:create')){nativeExists=true;return answer([{id:step.payload.nativeBarcode.id}]);}
  if(sql.includes('native-barcode:source-create')){sourceExists=true;return answer([{id:step.payload.source.id}]);}
  throw Error('Unexpected executor26 protocol SQL');
 },release(error){releases.push(error);}};leases.set(client,lease);return client;}};
 const runtime26={profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(client,purpose){const lease=leases.get(client);assert.ok(lease);assert.equal(purpose,'IMPORT_STAGE');assert.equal(lease.queries,0);proofs.push({purpose,lease:lease.purpose});if(settings.denied)throw Error('NATIVE_RUNTIME26_NOT_READY');if(settings.booleanProof)return true;lease.proved=true;}};
 const options={pool,binding:b,runtime26,now:()=>cutoffTime,bootstrap26:{async authorizeStageSourceActor(){auth.push('SOURCE_ACTOR');if(settings.denyActor)throw Error('SOURCE_ACTOR_REVOKED');},async stageNewBatch26(){throw Error('Actual49bootstrapnotprovidedbyprotocolfixture');}},authorization:{async assertExecutionAllowed(){auth.push('EXECUTION');if(settings.reject)throw Error('SOURCE_REVOKED');if(settings.booleanAuthority)return true;},async authorizeStep(s){auth.push('STEP');if(settings.mutate)s.payload.batchId='MUTATED';},async assertAllowed(){auth.push('MAIN');},async authorizeNativeCommand(){auth.push('NATIVE');},async authorizeClosure(){auth.push('CLOSURE');}}};
 return {options,step,calls,releases,proofs,auth,connects:()=>connects};
}
test('executor26 inert construction requires separate binding, actual runtime and explicit26 bootstrap methods without legacy fallback',()=>{
 const f=executor26Fixture();createPostgresImportExecutor26(f.options);assert.equal(f.connects(),0);
 for(const altered of [{...f.options,runtime26:undefined},{...f.options,binding:plan()},{...f.options,bootstrap26:{authorizeStageSourceActor:async()=>{},stageNewBatch:async()=>{}}}])assert.throws(()=>createPostgresImportExecutor26(altered));assert.equal(f.connects(),0);
 let gets=0;const getter={...f.options};Object.defineProperty(getter,'runtime26',{enumerable:true,get(){gets++;return f.options.runtime26;}});assert.throws(()=>createPostgresImportExecutor26(getter));assert.equal(gets,0);
 assert.throws(()=>createPostgresImportExecutor({...f.options,bootstrap26:undefined}));
});
test('executor26 source revocation, boolean authority, old typed profile and captured-step mutation stop before target borrow',async()=>{
 for(const setting of [{reject:true},{booleanAuthority:true},{mutate:true}]){const f=executor26Fixture(setting);await assert.rejects(createPostgresImportExecutor26(f.options)(f.step));assert.equal(f.connects(),0);}
 const f=executor26Fixture(),old={kind:'CATALOGUE',payload:{batchId:plan26().batchId,fixedSourceNamespace:plan26().fixedSourceNamespace,selection:{selectionSha256:plan26().selectionSha256}}};await assert.rejects(createPostgresImportExecutor26(f.options)(old),{code:'IMPORT_EXECUTION26_PROFILE_REQUIRED'});assert.equal(f.connects(),0);assert.deepEqual(f.auth,[]);
 const actor=executor26Fixture({denyActor:true});await assert.rejects(createPostgresImportExecutor26(actor.options)(stage()),/SOURCE_ACTOR_REVOKED/);assert.equal(actor.connects(),0);
});
test('executor26 actual lease and exact target/prefix26 gate precede native work; boolean proof never substitutes verification',async()=>{
 for(const setting of [{denied:true},{booleanProof:true}]){const f=executor26Fixture(setting);await assert.rejects(createPostgresImportExecutor26(f.options)(f.step));assert.equal(f.connects(),1);assert.equal(f.calls.length,0);assert.ok(f.releases[0]);}
 for(const setting of [{schema:19},{schema:27},{target:{...plan26().target,database:'OTHER'}}]){const f=executor26Fixture(setting);await assert.rejects(createPostgresImportExecutor26(f.options)(f.step));assert.equal(f.connects(),1);assert.equal(f.calls.some(c=>c.purpose==='native'),false);assert.equal(f.calls.at(-1).sql,'ROLLBACK');}
});
test('executor26 routes real concrete successor store under same issued pool, preserves immutable replay and discards uncertain COMMIT',async()=>{
 const f=executor26Fixture(),execute=createPostgresImportExecutor26(f.options);assert.deepEqual(await execute(f.step),{inserted:1,replayed:0});assert.equal(f.connects(),2);assert.equal(f.proofs.length,2);assert.deepEqual(await execute(f.step),{inserted:0,replayed:1});assert.equal(f.connects(),3);assert.equal(f.proofs.length,3);assert.equal(f.calls.filter(c=>c.sql.includes('import-executor26:target')).length,1);assert.equal(f.calls.filter(c=>c.sql.includes('native-barcode:create')).length,1);assert.equal(f.auth.includes('SOURCE_ACTOR'),false);
 for(const unknownAt of ['target','native']){const lost=executor26Fixture({unknownAt});await assert.rejects(createPostgresImportExecutor26(lost.options)(lost.step),/COMMIT unknown/);assert.equal(lost.connects(),unknownAt==='target'?1:2);assert.equal(lost.calls.some(c=>c.sql==='ROLLBACK'),false);assert.ok(lost.releases.at(-1));}
});

test('executor26 CLI selects explicit host26 and executor26 only with exact26 flag, preserving old CLI entry',async t=>{
 const {mkdtemp,realpath,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-executor26-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const host=join(dir,'host.mjs'),text="export async function openImportHost(){throw Object.assign(Error('legacy'),{code:'LEGACY_ENTRY_SELECTED'});} export async function openImportHost26(){throw Object.assign(Error('successor'),{code:'EXACT26_ENTRY_SELECTED'});}";await writeFile(host,text);const pin=createHash('sha256').update(text).digest('hex'),cli=fileURLToPath(new URL('./run.mjs',import.meta.url));
 for(const successor of [false,true]){const child=spawnSync(process.execPath,['--max-old-space-size=1024',cli,host,pin,join(dir,successor?'new.jsonl':'old.jsonl'),'1',...(successor?['--exact26']:[])],{encoding:'utf8'});assert.equal(child.status,1);assert.match(child.stderr,new RegExp(successor?'EXACT26_ENTRY_SELECTED':'LEGACY_ENTRY_SELECTED'));}
 const bad=spawnSync(process.execPath,[cli,host,pin,join(dir,'bad.jsonl'),'1','--auto'],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/IMPORT_EXECUTION_USAGE/);
});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function coreExecutorFixture(settings={}){
 const b={...plan26(),phase:'CORE_INITIALIZATION_26_V1',coreSourceDigest:sha('7'),authorizedPayloadHash:null},now='2026-10-24T00:00:00.123Z',parties=[];
 for(const [entity,count,base]of [['STAFF',49,10000],['HALL',22,11000],['WAREHOUSE',22,12000],['CUSTOMER',22,13000]])for(let i=0;i<count;i++)parties.push({sourceRowId:id(base+i),entity,sourceKey:`SYNTHETIC-${entity}-${i}`,nativeId:id(base+500+i)});
 const accounts=parties.filter(p=>p.entity==='STAFF').map((p,i)=>({id:id(14000+i),staff_id:p.nativeId,login_enabled:true,auth_version:1,version:1,created_at:now,updated_at:now})),authority=Object.fromEntries(['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_manifest_sha256'].map(k=>[k,sha('a')]));authority.old_source_batch_id='SYNTHETIC';
 const coreInitialization={scopeVersion:'CORE_INITIALIZATION_26_V1',coreSourceDigest:b.coreSourceDigest,coreCounts:{STAFF:49,HALL:22,WAREHOUSE:22,CUSTOMER:22,USER_ACCOUNT:49},coreSourceMembers:{parties,accounts},authority,target:b.target,bootstrapAt:now},command={action:'IMPORT_CORE_STAGE',actorAccountId:b.actorAccountId,requestKey:'synthetic-v14-core',batchId:b.batchId,sourceName:b.fixedSourceNamespace,sourceManifestRef:'synthetic:core',sourceHash:b.selectionSha256,cutoffAt:b.cutoffAt,mappingVersion:'V2_HISTORY_NULLABLE_1',coreInitialization,accountingVersion:'NATIVE_IMPORT_RECORD_ACCOUNTING_V1',expectedSequence:0,expectedCursor:0,items:parties.filter(p=>p.entity==='WAREHOUSE').map((p,i)=>({targetType:'WAREHOUSE',targetId:p.nativeId,sourceEntityType:'WAREHOUSE',sourceKey:p.sourceKey,sourceRecordHash:sha('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(15000+i),reviewedAt:now,decisionReason:'SYNTHETIC_CORE'}}))};
 const calls=[],releases=[],proofs=[],auth=[],receipts=new Map();let batch,bootstrapCalls=0,unknownCommit=false;
 const zero={sequence:0,cursor:0,counts:{WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}};
 const pool={async connect(){return {async query(sql,values=[]){calls.push({sql,values});const answer=(rows=[])=>({rows,rowCount:rows.length});
  if(sql==='COMMIT'&&unknownCommit&&batch)throw Error('SYNTHETIC unknown core commit');if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock')||sql.includes('cutoff_import_lock'))return answer();
  if(sql.includes('import-executor26:target'))return answer([{database:b.target.database,role:b.target.role,server_address:b.target.serverAddress,server_port:b.target.serverPort,postmaster_started_at:b.target.postmasterStartedAt}]);
  if(sql.includes('import-executor26:schema'))return answer([{versions:Array.from({length:26},(_,i)=>i+1)}]);
  if(sql.startsWith('SELECT request_hash'))return answer(receipts.has(values[1])?[receipts.get(values[1])]:[]);
  if(sql.includes('FROM naijue_erp.import_batch WHERE id = $1 FOR UPDATE'))return answer(batch?[batch]:[]);
  if(sql.includes('native-core:stage')){batch={id:b.batchId,checkpoint:structuredClone(zero),history_payload_hash:null,history_expected_counts:null,status:'STAGED'};return {rows:[],rowCount:1};}
  if(sql.includes('native-core:accounting-batch'))return answer([{checkpoint:batch.checkpoint}]);
  if(sql.includes('native-core:warehouse-record')){assert.equal(bootstrapCalls,1);return answer([{id:values[0]}]);}
  if(sql.includes('native-accounting:claim'))return answer([{import_batch_id:values[0],import_record_id:values[1],target_type:values[2],target_id:values[3],operation_id:values[4],checkpoint_sequence:values[5]}]);
  if(sql.includes('native-core:checkpoint')){batch.checkpoint=JSON.parse(values[1]);return {rows:[],rowCount:1};}
  if(sql.includes('native-core:carry-forward')||sql.includes('native-core:all-claims')){const result=receipts.get(command.requestKey)?.result_data,rows=command.items.map(item=>({checkpoint:batch.checkpoint,core_checkpoint:batch.checkpoint,status:'STAGED',source_name:b.fixedSourceNamespace,source_hash:b.selectionSha256,source_manifest_ref:'SYNTHETIC:core',history_payload_hash:null,core_actor:b.actorAccountId,record_ok:true,source_ok:true,import_batch_id:b.batchId,import_record_id:item.nativeRecord.id,target_type:'WAREHOUSE',target_id:item.targetId,operation_id:result.operationId,checkpoint_sequence:1,source_entity_type:'WAREHOUSE',source_key:item.sourceKey,source_record_hash:item.sourceRecordHash,source_file_ref:item.sourceFileRef,warehouse_record:item.nativeRecord}));if(settings.missingCarry)rows.pop();return answer(rows);}
  if(sql.includes('native-core:committed-chain'))return answer();
  if(sql.includes('native-core:birth'))return answer([{id:values[0],after_values:{phase:'CORE_INITIALIZED_V1',coreSourceDigest:b.coreSourceDigest,coreCounts:coreInitialization.coreCounts}}]);
  if(sql.includes('native-core:bind-full')){batch.checkpoint=JSON.parse(values[1]);batch.history_expected_counts=JSON.parse(values[2]);batch.history_payload_hash=values[3];return {rows:[],rowCount:1};}
  if(sql.startsWith('INSERT INTO naijue_erp.audit_change'))return {rows:[],rowCount:1};
  if(sql.startsWith('INSERT INTO naijue_erp.operation_receipt')){receipts.set(values[2],{request_hash:values[3],target_type:'IMPORT',target_id:values[5],action:values[4],result_data:JSON.parse(values[6])});return {rows:[],rowCount:1};}
  throw Error('Unexpected core executor SQL: '+sql.slice(0,80));
 },release(error){releases.push(error);}};}};
 const options={pool,binding:b,runtime26:{profile:'EXACT26',contract:'NATIVE_RUNTIME26_V1',async assertReady(client,purpose){proofs.push(purpose);assert.equal(purpose,'IMPORT_STAGE');}},now:()=>now,bootstrap26:{async authorizeStageSourceActor(actor,c){auth.push('SOURCE');assert.equal(actor,b.actorAccountId);assert.deepEqual(c,command);},async stageNewBatch26(client,input,runtime){bootstrapCalls++;assert.deepEqual(Reflect.ownKeys(client),['query']);assert.deepEqual(input.command,command);await runtime.assertReady(client,'IMPORT_STAGE');}},authorization:{async assertExecutionAllowed(){auth.push('EXECUTION');},async authorizeStep(){auth.push('STEP');},async assertAllowed(){auth.push('MAIN');},async authorizeNativeCommand(){auth.push('INDEPENDENT_CORE');},async authorizeClosure(){throw Error('CORE never publishes');}}};
 return {b,command,options,calls,releases,proofs,auth,parties,bootstrapCalls:()=>bootstrapCalls,batch:()=>batch,unknown(value=true){unknownCommit=value;}};
}
test('v14 executor uses original same-client store CORE callback then actual22claims, one audit1to2 and receipt; original-key replay never bootstraps twice',async()=>{
 const f=coreExecutorFixture(),execute=createPostgresImportExecutor26(f.options),step={kind:'MAIN',payload:f.command},result=await execute(step);assert.equal(result.sequence,1);assert.equal(result.cursor,22);assert.equal(result.phase,'CORE_INITIALIZED_V1');assert.equal(f.bootstrapCalls(),1);assert.equal(f.calls.filter(q=>q.sql.includes('native-accounting:claim')).length,22);const audit=f.calls.find(q=>q.sql.startsWith('INSERT INTO naijue_erp.audit_change'));assert.deepEqual(audit.values.slice(5,7),[1,2]);assert.equal(JSON.parse(audit.values[8]).checkpoint.counts.WAREHOUSE,22);
 const before=f.calls.length;assert.deepEqual(await execute(step),result);assert.equal(f.bootstrapCalls(),1);assert.equal(f.calls.slice(before).some(q=>/^(INSERT|UPDATE|DELETE)/.test(q.sql)),false);assert.ok(f.auth.filter(x=>x==='INDEPENDENT_CORE').length===2);
 for(const step of [{kind:'PARTY',payload:{}},{kind:'MAIN',payload:{...f.command,action:'IMPORT_STAGE'}}])await assert.rejects(execute(step));
});
test('v14 executor binds real full source once without fresh bootstrap or account-session writes and retains same-key recovery after unknown commit',async()=>{
 const f=coreExecutorFixture(),core=await createPostgresImportExecutor26(f.options)({kind:'MAIN',payload:f.command}),fullHash=sha('b'),groups=['PARTIES','CATALOGUE','PRODUCTS','SKUS','BARCODES','STOCK_CONTRIBUTORS','PAYMENT','HEADERS','SALES_DETAILS','SETTLEMENTS','TRANSFER_LINES'];
 const fullBinding={authorizedPayloadHash:fullHash,historyExpectedCounts:Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,k==='import_source_row'?115:0])),inventoryExpectedCounts:{WAREHOUSE:53,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:1},sourceClosurePins:groups.map(group=>({group,sha256:sha('a')})),coreReceiptId:core.operationId,coreSourceDigest:f.b.coreSourceDigest,coreMaintenanceBinding:{version:'CORE_MAINTENANCE_BINDING_V1',members:f.parties.map(p=>({...p,version:1,nativeSnapshot:{id:p.nativeId,version:1},operations:[]}))}},bind={action:'IMPORT_BIND_FULL_SOURCE',actorAccountId:f.b.actorAccountId,requestKey:'synthetic-v14-bind',batchId:f.b.batchId,expectedSequence:1,expectedCursor:22,fullBinding},binding={...f.b,phase:'FULL_SOURCE_CONTINUATION_26_V1',coreReceiptId:core.operationId,authorizedPayloadHash:fullHash},execute=createPostgresImportExecutor26({...f.options,binding,bootstrap26:null});
 const start=f.calls.length,result=await execute({kind:'MAIN',payload:bind});assert.equal(result.sequence,2);assert.equal(result.cursor,22);assert.equal(result.phase,'FULL_SOURCE_BOUND_V1');assert.equal(f.bootstrapCalls(),1);assert.equal(f.calls.slice(start).some(q=>q.sql.includes('native-accounting:claim')),false);assert.equal(f.calls.some(q=>/^(INSERT|UPDATE|DELETE).*naijue_erp\.(user_account|auth_session)/s.test(q.sql)),false);assert.equal(f.batch().checkpoint.counts.WAREHOUSE,22);
 assert.deepEqual(await execute({kind:'MAIN',payload:bind}),result);await assert.rejects(execute({kind:'MAIN',payload:{...bind,requestKey:'new-second-bind',expectedSequence:2}}),/unbound CORE/);await assert.rejects(execute({kind:'MAIN',payload:f.command}),/CORE_BINDING|NO_REBOOTSTRAP/);
 const g=coreExecutorFixture(),retry=createPostgresImportExecutor26(g.options);g.unknown();await assert.rejects(retry({kind:'MAIN',payload:g.command}),/unknown core commit/);assert.ok(g.releases.at(-1) instanceof Error);assert.equal(g.bootstrapCalls(),1);g.unknown(false);const recovered=await retry({kind:'MAIN',payload:g.command});assert.equal(recovered.cursor,22);assert.equal(g.bootstrapCalls(),1);assert.equal(g.calls.filter(q=>q.sql.includes('native-accounting:claim')).length,22);
});
test('v14 executor continuation reads22 original claims with real sequence and emits only31 remaining warehouses, never reset or conflict-ignore',async()=>{
 const f=coreExecutorFixture(),core=await createPostgresImportExecutor26(f.options)({kind:'MAIN',payload:f.command}),binding={...f.b,phase:'FULL_SOURCE_CONTINUATION_26_V1',coreReceiptId:core.operationId,authorizedPayloadHash:sha('b')},warehouses=[...structuredClone(f.command.items),...Array.from({length:31},(_,i)=>({targetType:'WAREHOUSE',targetId:id(17000+i),sourceEntityType:'WAREHOUSE',sourceKey:`SYNTHETIC-rest-${i}`,sourceRecordHash:sha('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(18000+i),reviewedAt:f.options.now(),decisionReason:'SYNTHETIC_FULL'}}))],options={pool:f.options.pool,binding,runtime26:f.options.runtime26,async assertExecutionAllowed(b){assert.deepEqual(b,binding);},warehouses};
 const before=f.calls.length,result=await readCoreImportContinuation26(options);assert.equal(result.checkpoint.sequence,1);assert.equal(result.checkpoint.cursor,22);assert.equal(result.checkpoint.counts.WAREHOUSE,22);assert.equal(result.claims.length,22);assert.ok(result.claims.every(c=>c.operationId===core.operationId&&c.checkpointSequence===1));assert.equal(result.remainingWarehouses.length,31);assert.ok(result.remainingWarehouses.every(item=>!result.claims.some(c=>c.importRecordId===item.nativeRecord.id)));assert.equal(f.calls.slice(before).some(q=>/^(INSERT|UPDATE|DELETE)/.test(q.sql)),false);assert.equal(f.calls[before].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ');
 const changed=structuredClone(warehouses);changed[0].nativeRecord.decisionReason='changed';await assert.rejects(readCoreImportContinuation26({...options,warehouses:changed}),/CORE_RECORD_CONFLICT/);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 const missing=coreExecutorFixture({missingCarry:true});await createPostgresImportExecutor26(missing.options)({kind:'MAIN',payload:missing.command});await assert.rejects(readCoreImportContinuation26({...options,pool:missing.options.pool,runtime26:missing.options.runtime26}),/All22/);
 const calls=f.calls.length;await assert.rejects(readCoreImportContinuation26({...options,async assertExecutionAllowed(){throw Error('REVOKED_SOURCE');}}),/REVOKED_SOURCE/);assert.equal(f.calls.length,calls);
});

function v19SchemeExecutorFixture(){
 const f=coreExecutorFixture(),b={...f.b,phase:'FULL_SOURCE_CONTINUATION_26_V1',coreReceiptId:id(19001),authorizedPayloadHash:sha('b')};
 const c={action:'IMPORT_INITIALIZE_BARCODE_SCHEMES',actorAccountId:b.actorAccountId,batchId:b.batchId,requestKey:'SYNTHETIC_SCHEME19',expectedSequence:2,expectedCursor:22,
  schemeInitialization:{version:'BARCODE_SCHEME_INITIALIZATION_V19',coreReceiptId:b.coreReceiptId,coreSourceDigest:b.coreSourceDigest,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,cutoffAt:b.cutoffAt,target:structuredClone(b.target),
  approvalPins:{proposalSha256:sha('c'),approvalSha256:sha('d'),writeContractReplySha256:sha('e')},
  schemes:['2018','2020','2021','2021fit','2023','2026'].map((k,i)=>({sourceSchemeKey:k,native:{id:id(19100+i),name:k,barcode_type:'Code128',rule_description:'SYNTHETIC',code_length:15,rule_version:'SYNTHETIC',status:k==='2026'?'CURRENT':'HISTORICAL'}}))}};
 const source={async assertAllowed(){},async initializeSchemes26(){throw Error('MUST_NOT_WRITE');}};
 return {f,b,c,options:{...f.options,binding:b,bootstrap26:null,barcodeSchemeInitialization26:source,authorization:{...f.options.authorization,async assertExecutionAllowed(){throw Error('SYNTHETIC_EXECUTION_REVOKED');}}}};
}
test('v19 scheme executor captures explicit independent MAIN action with original exact binding and trusted callback',async()=>{
 const {f,c,options}=v19SchemeExecutorFixture(),execute=createPostgresImportExecutor26(options);
 await assert.rejects(execute({kind:'MAIN',payload:c}),/SYNTHETIC_EXECUTION_REVOKED/);
 assert.equal(f.calls.length,0);
 const bad={...options,barcodeSchemeInitialization26:{initializeSchemes26(){},assertAllowed:true}};
 assert.throws(()=>createPostgresImportExecutor26(bad),/Captured own-data/);
});
test('v19 scheme executor rejects wrong namespace/selection/CORE/process before authorization or pool acquisition',async()=>{
 for(const mutate of [i=>{i.fixedSourceNamespace='other';},i=>{i.selectionSha256=sha('f');},i=>{i.coreReceiptId=id(19999);},i=>{i.target.database='OTHER';},i=>{i.coreSourceDigest=sha('f');}]){
  const {f,c,options}=v19SchemeExecutorFixture();mutate(c.schemeInitialization);const execute=createPostgresImportExecutor26(options);
  await assert.rejects(execute({kind:'MAIN',payload:c}),/SCHEME_BINDING/);assert.equal(f.calls.length,0);
 }
 const {f,c,options}=v19SchemeExecutorFixture();const {coreReceiptId:_receipt,...coreBinding}=options.binding;const execute=createPostgresImportExecutor26({...options,binding:{...coreBinding,phase:'CORE_INITIALIZATION_26_V1',authorizedPayloadHash:null},bootstrap26:f.options.bootstrap26});
 await assert.rejects(execute({kind:'MAIN',payload:c}),/SCHEME_BINDING/);assert.equal(f.calls.length,0);
});

test('T19 runner preserves ordinary empty summary and rejects a malformed claimed prior publication without invoking execute',async()=>{
 for(const value of [undefined,{status:'IMPORTED',operationId:'invalid'}]){let executed=0,closed=0;const run=runImportSteps({source:{async *steps(){return value;},async close(){closed++;}},async execute(){executed++;},async append(){throw Error('NO_NEW_JOURNAL');},signal:new AbortController().signal,maxSteps:1});
  if(value===undefined)assert.deepEqual(await run,{status:'REQUESTED_STEP_SEQUENCE_COMPLETE',completed:0,publicationReadback:'NOT_PERFORMED_BY_RUNNER'});else await assert.rejects(run);assert.equal(executed,0);assert.equal(closed,1);}
});

test('v23 original reader registers one original proof only after successful same-client COMMIT, with full remaining progress',async()=>{
 // Execute the actual exported reader body; only its storage/capability dependencies are substituted.
 // Separate adapter tests exercise the full source validators and161-query protocol.
 const evaluate=new Function('bag','binding','checkedNativeRuntime26Capability','must','VERSION_26','historySettlementRequestHash','uuid','text','hash','requestHash','readNativeCoreWarehouseCarryForward','NATIVE_STAGE_CONTINUATION_VERSION26','captureNativeStageContinuationInput26','verifyCommittedNativeStagePrefix26',`return (${readCoreImportContinuation26.toString()});`);
 for(const failure of [null,'capture','readback','COMMIT','callback']){
  const b={...plan(),version:'NATIVE_IMPORT_EXECUTION_26_V1',phase:'FULL_SOURCE_CONTINUATION_26_V1',coreReceiptId:id(900),coreSourceDigest:sha('c')};
  const warehouses=Array.from({length:53},(_,i)=>({targetType:'WAREHOUSE',targetId:id(1000+i),sourceEntityType:'WAREHOUSE',sourceKey:`SYNTHETIC_${i}`,sourceRecordHash:sha('a'),sourceFileRef:'SYNTHETIC.xlsx',nativeRecord:{id:id(2000+i),reviewedAt:cutoffTime,decisionReason:'SYNTHETIC'}}));
  const progress={warehouses:warehouses.slice(0,22),coreWarehouses:warehouses.slice(0,22),coreClaims:Array.from({length:22},()=>({})),claims:Array.from({length:22},()=>({})),actorAccountId:b.actorAccountId,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,checkpoint:{counts:{WAREHOUSE:22},cursor:22},status:'STAGED',stagedPrefixProof22:{},committedOperations:[{action:'IMPORT_BIND_FULL_SOURCE',operationId:id(901),requestKey:'SYNTHETIC_BIND',requestHash:sha('d')}]};
  const proof={version:1,SYNTHETIC:true},calls=[],releases=[];let callbacks=0,captures=0,lease;
  const runtime26={async assertReady(c){assert.equal(c,lease);}};
  const options={pool:{async connect(){assert.equal(lease,undefined);lease={async query(sql){calls.push(sql);if(sql===failure)throw Error(failure);return{rows:[]};},release(error){releases.push(error);}};return lease;}},binding:b,runtime26,assertExecutionAllowed:async()=>undefined,warehouses,nativeStageContinuation26:{version:'NATIVE_STAGE_CONTINUATION_26_V1',async capture(context){captures++;assert.deepEqual(context.binding,b);assert.notEqual(context.binding,b);if(failure==='capture')throw Error('capture');return{async onVerified(result){callbacks++;assert.equal(calls.at(-1),'COMMIT');assert.equal(result.nativeStagePrefixProof26,proof);assert.equal(result.remainingWarehouses.length,31);if(failure==='callback')throw Error('callback');}};},async assertVerifiedContinuation(){}}};
  const reader=evaluate((v,keys)=>{assert.deepEqual(Object.keys(v).sort(),[...keys].sort());return v;},v=>structuredClone(v),v=>v,(ok,code)=>{if(!ok)throw Error(code);},'NATIVE_IMPORT_EXECUTION_26_V1',()=>{},v=>typeof v==='string',v=>typeof v==='string',()=>true,requestHash,async c=>{assert.equal(c,lease);return progress;},'NATIVE_STAGE_CONTINUATION_26_V1',v=>v,async c=>{assert.equal(c,lease);if(failure==='readback')throw Error('readback');return proof;});
  if(failure)await assert.rejects(reader(options),new RegExp(failure));else{const result=await reader(options);assert.equal(result.nativeStagePrefixProof26,proof);assert.notEqual(result.checkpoint,progress.checkpoint);assert.equal(callbacks,1);}
  assert.equal(captures,1);assert.equal(releases.length,1);
  if(['capture','readback'].includes(failure)){assert.equal(callbacks,0);assert.equal(calls.at(-1),'ROLLBACK');assert.equal(releases[0],undefined);}
  if(failure==='COMMIT'){assert.equal(callbacks,0);assert.equal(calls.at(-1),'COMMIT');assert.ok(releases[0] instanceof Error);}
  if(failure==='callback'){assert.equal(callbacks,1);assert.equal(calls.at(-1),'COMMIT');assert.ok(releases[0] instanceof Error);}
 }
});
