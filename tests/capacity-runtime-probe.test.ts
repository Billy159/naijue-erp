/** Scripted protocol/source checks only. No PostgreSQL, disk collection or server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {captureCapacityRuntimePoolBinder, createOwnedPoolCapacityAdmission} from '../apps/api/src/capacity-runtime-probe.ts';
import type {CapacityRuntimeVolumeFacts, OwnedPoolCapacityOptions} from '../apps/api/src/capacity-runtime-probe.ts';
import type {PgSalesPool} from '../adapters/postgres/src/sales-unit-of-work.ts';
import type {CapacityBytes} from '../apps/api/src/capacity-admission.ts';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {PostgresQueryError} from '../adapters/postgres/src/bounded-pool.ts';
const amounts = (v: bigint): CapacityBytes => ({postgres: v, wal: v, backup: v, system: v, media: v});
const target = {host: 'synthetic.invalid', port: 5432, database: 'SYNTHETIC_ONLY', role: 'SYNTHETIC_RUNTIME', databaseOid: '999', postmasterStart: 'synthetic-postmaster'};
const identity = () => ({database: target.database, role: target.role, session_user: target.role, database_oid: target.databaseOid,
  postmaster_start: target.postmasterStart, read_only: 'on', isolation: 'repeatable read'});
const storage = () => ({relation_bytes: '9007199254740993', index_bytes: '1', total_relation_bytes: '9007199254740994', database_bytes: '9007199254741994'});
const deferred = <T>() => {let resolve!: (v: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};};
const unavailable = {code: 'CAPACITY_ADMISSION_UNAVAILABLE', reason: 'PROBE_UNAVAILABLE'};

/** Reuse the existing isolated actual-host-body model. Its private WeakMap brand
 * is real inside that model module; it cannot authorize the production module.
 * PG permissions below are a finite projection of the pinned schema/role ACLs. */
async function fresh35Fixture() {
  const hostTestUrl=new URL('./fresh35-ordinary-production-v2.test.mjs',import.meta.url),hostUrl=new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url);
  const hostTest=await readFile(hostTestUrl,'utf8'),boundary=hostTest.indexOf("test('ordinary startup");assert(boundary>0);
  let helper=hostTest.slice(0,boundary).replace("'../tools/unified-import/fresh35-host-session.mjs'",JSON.stringify(hostUrl.href))
    .replace("new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url)",'new URL('+JSON.stringify(hostUrl.href)+')');
  const entry="const api=await import('data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64'));";
  assert.equal(helper.split(entry).length,2);
  helper=helper.replace(entry,"const moduleURL='data:text/javascript;base64,'+Buffer.from(prefix+tail).toString('base64');const api=await import(moduleURL);")
    .replace('return {api,root,','return {api,moduleURL,root,');
  const data=(s:string)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
  const {model}=await import(data(helper+'\nexport {model};')),m=await model({synthetic:true,recordParentPrivate:true});
  try {
    const moduleUrl=new URL('../apps/api/src/capacity-runtime-probe.ts',import.meta.url);let body=await readFile(moduleUrl,'utf8');
    body=body.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_match,_quote,p:string)=>'from '+JSON.stringify(new URL(p,moduleUrl).href));
    body=body.replaceAll(JSON.stringify(hostUrl.href),JSON.stringify(m.moduleURL));
    const api=await import(data(stripTypeScriptTypes(body)+'\n//# sourceURL=fresh35-capacity-model.mjs')),d=m.row;
    const t={host:m.connection.host,port:m.connection.port,database:d.database,role:d.sessionUser,databaseOid:d.databaseOid,postmasterStart:d.postmasterStart};
    const f=fixture(api,t),originalConnect=f.pool.connect.bind(f.pool),role='erp_unified27_runtime_2393dbc6db9581c2',trace:string[]=[];
    let capacityStage=false,currentRole=t.role,rolledBack=false,mode='',finiteSqlstate:string|null=null;
    const reject=()=>{finiteSqlstate='42501';throw new PostgresQueryError({code:'42501'});};
    f.pool.connect=async()=>{
      if(!capacityStage)return m.client();
      const raw=await originalConnect();
      return {async query(sql:string,values?:unknown[]){
        if(sql.startsWith('SET LOCAL ROLE')){
          trace.push('SET_LOCAL_RUNTIME');assert.equal(sql,'SET LOCAL ROLE '+role);if(mode==='set-denied')return reject();
          currentRole=role;return {rows:[],rowCount:0,command:mode==='set-ack'?'INVALID':'SET'};
        }
        if(sql.includes('capacity-runtime:identity')){
          trace.push(rolledBack?'RESTORED_IDENTITY':currentRole===t.role?'LOGIN_IDENTITY':'RUNTIME_IDENTITY');
          const r=await raw.query(sql,values);
          return {...r,rows:r.rows.map(row=>({...row,role:mode==='role-identity'&&currentRole===role||mode==='restore-identity'&&rolledBack?'WRONG_ROLE':currentRole}))};
        }
        if(sql.includes('pg_database_size')){
          trace.push('DATABASE_BYTES');if(currentRole!==t.role)return reject();
        }
        if(sql.includes("'naijue_erp.auth_session'::regclass")){
          trace.push('RELATION_BYTES');if(currentRole!==role||mode==='read-failure')return reject();
        }
        if(sql.includes('capacity-runtime:database-storage')){
          f.sql.push(sql);return {rows:[{database_bytes:storage().database_bytes}],rowCount:1};
        }
        if(sql.includes('capacity-runtime:relation-storage')){
          f.sql.push(sql);const {database_bytes:_,...relations}=storage();return {rows:[relations],rowCount:1};
        }
        const r=await raw.query(sql,values);
        if(sql==='ROLLBACK'){trace.push('ROLLBACK');currentRole=t.role;rolledBack=true;if(mode==='expire-rollback')m.api.expire();return {...r,command:'ROLLBACK'};}
        return r;
      },release(error){raw.release(error);}};
    };
    const cap=await m.api.admitFresh35SyntheticOrdinaryPoolV1(f.pool,m.connection);capacityStage=true;
    const bind=(proof:unknown=cap,pool=f.pool,connection={host:t.host,port:t.port,database:t.database,user:t.role})=>api.captureCapacityRuntimePoolBinder(f.admission)(pool,connection,proof);
    return {...f,api,cap,t,trace,bind,expire:()=>m.api.expire(),mode(value:string){mode=value;},state:()=>({currentRole,rolledBack,finiteSqlstate}),
      async dispose(){f.admission.close();m.api.closeFresh35OrdinaryAdmissionV2(cap,f.pool);await m.dispose();}};
  } catch(error) {await m.dispose();throw error;}
}

test('fresh35 capacity reads LOGIN database bytes and branded runtime relation bytes on one readonly lease then restores role',async()=>{
  const f=await fresh35Fixture();try{
    f.bind();await f.admission.preflight();
    assert.deepEqual(f.trace,['LOGIN_IDENTITY','DATABASE_BYTES','SET_LOCAL_RUNTIME','RUNTIME_IDENTITY','RELATION_BYTES','ROLLBACK','RESTORED_IDENTITY']);
    assert.deepEqual(f.counts(),{factCalls:1,connects:1});assert.equal(f.releases.length,1);assert.equal(f.releases[0],undefined);
    assert.deepEqual(f.state(),{currentRole:f.t.role,rolledBack:true,finiteSqlstate:null});
    assert.deepEqual(f.admission.snapshot().admitted,{session:0,upload:0});assert.deepEqual(f.admission.snapshot().chargedBytes,amounts(0n));
    assert.equal(f.sql.filter(s=>s==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,1);assert(!f.sql.some(s=>/\b(?:GRANT|COMMIT)\b/.test(s)));
  }finally{await f.dispose();}
});
test('fresh35 capacity accepts only the original admission brand and matching LOGIN physical target',async()=>{
  const f=await fresh35Fixture();try{
    assert.throws(()=>f.bind({}));assert.throws(()=>f.bind({...f.cap}));assert.throws(()=>f.bind(f.cap,f.pool,{host:f.t.host,port:f.t.port,database:f.t.database,user:'other-role'}));
    const other=fixture(f.api,{...f.t,databaseOid:'9999'});
    try{assert.throws(()=>f.api.captureCapacityRuntimePoolBinder(other.admission)(other.pool,{host:f.t.host,port:f.t.port,database:f.t.database,user:f.t.role},f.cap));}finally{other.admission.close();}
    f.bind();await f.admission.preflight();assert.throws(()=>f.bind());
  }finally{await f.dispose();}
});
test('fresh35 capacity rejects a genuine capability bound to a different original pool before borrowing',async()=>{
  const f=await fresh35Fixture();try{
    let borrowed=0;const other={async connect(){borrowed++;throw Error('WRONG_POOL_MUST_NOT_BE_BORROWED');}};f.bind(f.cap,other as never);
    await assert.rejects(f.admission.preflight());assert.equal(borrowed,0);assert.equal(f.counts().connects,0);assert.equal(f.releases.length,0);
  }finally{await f.dispose();}
});
for(const failure of ['set-denied','set-ack','role-identity','read-failure','restore-identity','login-identity','unknown','rollback','release','expired-cap','expire-rollback'])
test('fresh35 capacity '+failure+' remains refused with no admitted or refunded write budget',async()=>{
  const f=await fresh35Fixture();try{
    f.mode(failure);if(failure==='login-identity')f.setIdentity({...identity(),database:'WRONG_DATABASE'});
    if(failure==='unknown')f.setFacts(()=>({status:'UNKNOWN'}));if(failure==='rollback')f.failRollback();if(failure==='release')f.failRelease();
    f.bind();if(failure==='expired-cap')f.expire();await assert.rejects(f.admission.preflight());
    assert.equal(f.counts().connects,['unknown','expired-cap'].includes(failure)?0:1);assert.equal(f.releases.length,['unknown','expired-cap'].includes(failure)?0:1);
    if(failure==='set-denied'||failure==='set-ack')assert(f.trace.includes('SET_LOCAL_RUNTIME'));
    if(failure==='role-identity')assert(f.trace.includes('RUNTIME_IDENTITY'));
    if(failure==='read-failure'){assert(f.trace.includes('RELATION_BYTES'));assert.equal(f.state().finiteSqlstate,'42501');}
    if(failure==='restore-identity'||failure==='release')assert(f.trace.includes('RESTORED_IDENTITY'));
    if(!['unknown','rollback'].includes(failure))assert.equal(f.state().currentRole,f.t.role);
    assert.deepEqual(f.admission.snapshot().admitted,{session:0,upload:0});assert.deepEqual(f.admission.snapshot().chargedBytes,amounts(0n));
  }finally{await f.dispose();}
});
test('A02 owned snapshot observes the same bound admission leases and immutable original charge',async()=>{
  const f=fixture();f.bind();const before=f.admission.snapshot(),lease=await f.admission.acquire('upload'),held=f.admission.snapshot();
  assert.equal(held.active.upload,1);assert.equal(held.admitted.upload,1);assert.deepEqual(held.chargedBytes,amounts(2n));
  assert.throws(()=>{(held.admitted as Record<string,number>).upload=0;},TypeError);
  lease.release();assert.equal(f.admission.snapshot().active.upload,0);assert.deepEqual(f.admission.snapshot().chargedBytes,held.chargedBytes);
  assert.equal(before.admitted.upload,0);f.admission.close();assert.equal(f.admission.snapshot().closed,true);
});
test('A02 CLI preflight reads its bound pool without admission/charge and accepts valid low-water facts as readonly-ready',async()=>{
  const f=fixture();f.bind();f.setFacts(()=>({status:'KNOWN',windowToken:'synthetic-window',binding:f.binding,observedAt:1000,freeBytes:amounts(1n)}));
  await f.admission.preflight();assert.deepEqual(f.admission.snapshot().admitted,{session:0,upload:0});assert.deepEqual(f.admission.snapshot().chargedBytes,amounts(0n));
  await assert.rejects(f.admission.acquire('session'),{reason:'LOW_WATER'});assert.equal(f.releases.length,2);f.admission.close();
});
for(const state of ['unbound','unknown','expired']as const)test(`A02 CLI preflight ${state} refuses startup without admitting a write`,async()=>{
  const f=fixture();if(state!=='unbound')f.bind();if(state==='unknown')f.setFacts(()=>({status:'UNKNOWN'}));if(state==='expired')f.setTime(10000);
  await assert.rejects(f.admission.preflight());assert.deepEqual(f.admission.snapshot().admitted,{session:0,upload:0});f.admission.close();
});
test('A02 CLI startup cancellation waits for original in-flight pool work, then rolls back and releases without charge',async()=>{
  const f=fixture(),waiting=deferred<void>(),entered=deferred<void>();f.bind();
  f.holdStorage(async()=>{entered.resolve();await waiting.promise;});let finished=false;
  const pending=f.admission.preflight().finally(()=>{finished=true;}),rejected=assert.rejects(pending);await entered.promise;
  f.admission.close();await tick();assert.equal(finished,false);assert.equal(f.releases.length,0);
  waiting.resolve();await rejected;assert.equal(f.sql.at(-1),'ROLLBACK');assert.equal(f.releases.length,1);
  assert.deepEqual(f.admission.snapshot().admitted,{session:0,upload:0});
});
function fixture(api = {createOwnedPoolCapacityAdmission, captureCapacityRuntimePoolBinder}, actualTarget = target) {
  let at = 1000, factCalls = 0, connects = 0;
  const binding = {candidateFingerprint: 'synthetic-source', targetFingerprint: 'synthetic-target', writerTopologyFingerprint: 'one-writer',
    inventoryFingerprint: 'synthetic-inventory', processInstanceId: 'synthetic-instance', restartGeneration: 1, writerCount: 1,
    physicalVolumes: {postgres: 'pg-wal', wal: 'pg-wal', backup: 'backup', system: 'system-media', media: 'system-media'}};
  const sql: string[] = [], releases: (Error | boolean | undefined)[] = [];
  let facts: (() => CapacityRuntimeVolumeFacts) | undefined;
  let beforeStorage: (() => Promise<void>) | undefined, beforeConnect: (() => Promise<void>) | undefined;
  let id = {...identity(),database:actualTarget.database,role:actualTarget.role,session_user:actualTarget.role,database_oid:actualTarget.databaseOid,postmaster_start:actualTarget.postmasterStart}, bytes = storage(), failRollback = false, failRelease = false;
  const pool: PgSalesPool = {async connect() {connects++; await beforeConnect?.(); return {
    async query(text) {
      sql.push(text);
      if (text.includes('capacity-runtime:identity')) return {rows: [id], rowCount: 1};
      if (text.includes('capacity-inventory:storage')) {await beforeStorage?.(); return {rows: [bytes], rowCount: 1};}
      if (text === 'ROLLBACK' && failRollback) throw Error('synthetic rollback failure');
      assert.ok(text === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' || text === 'ROLLBACK');
      return {rows: [], rowCount: 0};
    }, release(error) {releases.push(error); if (failRelease) throw Error('synthetic release failure');},
  };}};
  const options: OwnedPoolCapacityOptions = {window: {approved: true, token: 'synthetic-window', inventoryObservedAt: 900, startsAt: 1000, expiresAt: 10000, binding},
    budgets: {session: {maxAdmissions: 10, maxInFlight: 2, worstCaseBytes: amounts(1n)}, upload: {maxAdmissions: 10, maxInFlight: 2, worstCaseBytes: amounts(2n)}},
    minimumFreeBytes: amounts(10n), safetyBytes: amounts(1n), probeTtlMillis: 100, probeTimeoutMillis: 20, maxProbeWaiters: 4, retryAfterSeconds: 1,
    now: () => at, currentBinding: () => binding, runtimeProbe: {target:actualTarget,
      async readVolumeFacts({window}) {factCalls++; return facts ? facts() : {status: 'KNOWN', windowToken: window.token,
        binding: structuredClone(binding), observedAt: at, freeBytes: amounts(1000n)};}}};
  const admission = api.createOwnedPoolCapacityAdmission(options);
  const bind = () => api.captureCapacityRuntimePoolBinder(admission)!(pool, {host: actualTarget.host, port: actualTarget.port, database: actualTarget.database, user: actualTarget.role, password: 'SYNTHETIC_ONLY', ssl: false});
  return {options, admission, pool, bind, sql, releases, binding, setTime: (v: number) => {at = v;}, setFacts: (v: typeof facts) => {facts = v;},
    setIdentity: (v: typeof id) => {id = v;}, setBytes: (v: typeof bytes) => {bytes = v;},
    holdStorage: (v: typeof beforeStorage) => {beforeStorage = v;}, holdConnect: (v: typeof beforeConnect) => {beforeConnect = v;},
    failRollback: () => {failRollback = true;}, failRelease: () => {failRelease = true;}, counts: () => ({factCalls, connects})};
}
test('A02 runtime probe uses only the exact once-bound owned pool and original storage aggregate', async () => {
  const f = fixture(); f.bind();
  const first = await f.admission.acquire('session'), second = await f.admission.acquire('upload'); first.release(); second.release();
  assert.deepEqual(f.counts(), {factCalls: 1, connects: 1}); assert.equal(f.releases.length, 1); assert.equal(f.releases[0], undefined);
  assert.deepEqual(f.sql.map(s => s.split(' */')[0]), ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY', '/* capacity-runtime:identity', '/* capacity-inventory:storage', 'ROLLBACK']);
  const inventory = await import(new URL('../scripts/ops/capacity-inventory.mjs', import.meta.url).href) as {STORAGE_INVENTORY_SQL: string};
  assert.equal(f.sql[2], inventory.STORAGE_INVENTORY_SQL, 'Keep the established aggregate without a runtime dependency on an unpacked operational script');
  assert.throws(f.bind, /one exact owned pool/); f.admission.close(); assert.throws(f.bind, /one exact owned pool/);
});
test('A02 runtime probe refuses absent binding, wrong target and absent operational producer without constructing a pool', async () => {
  const f = fixture();
  await assert.rejects(f.admission.acquire('session'), unavailable); assert.deepEqual(f.counts(), {factCalls: 0, connects: 0});
  assert.throws(() => captureCapacityRuntimePoolBinder(f.admission)!(f.pool, {host: 'wrong.invalid', port: target.port, database: target.database, user: target.role, password: 'synthetic', ssl: false}), /one exact owned pool/);
  assert.throws(() => createOwnedPoolCapacityAdmission({...f.options, runtimeProbe: {...f.options.runtimeProbe, readVolumeFacts: undefined!}}), TypeError);
  f.admission.close();
});
for (const state of ['unknown', 'stale', 'future', 'binding', 'window', 'missing-volume'] as const) test(`A02 runtime ${state} operational facts refuse both writes before borrowing PG`, async () => {
  const f = fixture(); f.bind(); f.setFacts(() => state === 'unknown' ? {status: 'UNKNOWN'} : {
    status: 'KNOWN', windowToken: state === 'window' ? 'wrong' : 'synthetic-window', observedAt: state === 'stale' ? 999 : state === 'future' ? 1001 : 1000,
    binding: state === 'binding' ? {...f.binding, physicalVolumes: {...f.binding.physicalVolumes, wal: 'different'}} : f.binding,
    freeBytes: state === 'missing-volume' ? {...amounts(1000n), postgres: undefined!} : amounts(1000n),
  });
  for (const kind of ['session', 'upload'] as const) await assert.rejects(f.admission.acquire(kind), unavailable);
  assert.equal(f.counts().connects, 0); f.admission.close();
});
for (const state of ['identity', 'storage', 'rollback', 'release'] as const) test(`A02 runtime ${state} failure returns UNKNOWN and releases its original lease`, async () => {
  const f = fixture(); f.bind();
  if (state === 'identity') f.setIdentity({...identity(), session_user: 'wrong-role'});
  if (state === 'storage') f.setBytes({...storage(), total_relation_bytes: '-1'});
  if (state === 'rollback') f.failRollback();
  if (state === 'release') f.failRelease();
  await assert.rejects(f.admission.acquire('session'), unavailable);
  assert.equal(f.counts().connects, 1); assert.equal(f.releases.length, 1); assert.equal(f.sql.at(-1), 'ROLLBACK');
  if (state !== 'release') assert.ok(f.releases[0] instanceof Error);
  f.admission.close();
});
test('A02 abort during owned-pool acquisition keeps one probe until late lease is released without SQL', async () => {
  const f = fixture(), waiting = deferred<void>(), entered = deferred<void>(); f.bind();
  f.holdConnect(async () => {entered.resolve(); await waiting.promise;});
  const controller = new AbortController(), request = f.admission.acquire('session', controller.signal);
  const rejected = assert.rejects(request, {name: 'AbortError'}); await entered.promise; controller.abort(); await rejected;
  f.setTime(1200); await assert.rejects(f.admission.acquire('upload'), unavailable); assert.equal(f.counts().connects, 1);
  waiting.resolve(); await tick(); await tick();
  assert.equal(f.releases.length, 1); assert.ok(f.releases[0] instanceof Error); assert.equal(f.sql.length, 0); f.admission.close();
});
test('A02 timeout never starts a second native probe or releases a querying lease early; worker finally rolls back/releases', async () => {
  const f = fixture(), waiting = deferred<void>(), entered = deferred<void>(); f.bind();
  f.holdStorage(async () => {entered.resolve(); await waiting.promise;});
  const request = f.admission.acquire('session'), rejected = assert.rejects(request, unavailable); await entered.promise; await rejected;
  assert.equal(f.releases.length, 0); f.setTime(1200);
  await assert.rejects(f.admission.acquire('upload'), unavailable); assert.deepEqual(f.counts(), {factCalls: 1, connects: 1});
  waiting.resolve(); await tick(); await tick(); assert.equal(f.releases.length, 1); assert.equal(f.sql.at(-1), 'ROLLBACK');
  f.holdStorage(undefined); f.setTime(1400); (await f.admission.acquire('session')).release();
  assert.deepEqual(f.counts(), {factCalls: 2, connects: 2}); f.admission.close();
});
test('A02 runtime sample expires using its oldest real observation; refreshed stale facts cannot relabel it', async () => {
  const f = fixture(); f.bind(); (await f.admission.acquire('session')).release();
  f.setTime(1100); f.setFacts(() => ({status: 'KNOWN', windowToken: 'synthetic-window', binding: f.binding, observedAt: 1000, freeBytes: amounts(1000n)}));
  await assert.rejects(f.admission.acquire('upload'), unavailable); assert.equal(f.counts().connects, 1); f.admission.close();
});
test('A02 runtime preserves distinct observations of one shared physical volume for conservative admission', async () => {
  const f = fixture(); f.bind();
  f.setFacts(() => ({status: 'KNOWN', windowToken: 'synthetic-window', binding: f.binding, observedAt: 1000,
    freeBytes: {...amounts(1000n), wal: 12n}}));
  // postgres/wal are the same physical ID: their readings cannot be added or
  // replaced by the larger postgres value, and both logical growth costs apply.
  await assert.rejects(f.admission.acquire('session'), {code: 'CAPACITY_ADMISSION_UNAVAILABLE', reason: 'LOW_WATER'});
  assert.equal(f.counts().connects, 1); assert.equal(f.releases.length, 1); f.admission.close();
});
