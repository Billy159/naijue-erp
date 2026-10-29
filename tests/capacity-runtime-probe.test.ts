/** Scripted protocol/source checks only. No PostgreSQL, disk collection or server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {captureCapacityRuntimePoolBinder, createOwnedPoolCapacityAdmission} from '../apps/api/src/capacity-runtime-probe.ts';
import type {CapacityRuntimeVolumeFacts, OwnedPoolCapacityOptions} from '../apps/api/src/capacity-runtime-probe.ts';
import type {PgSalesPool} from '../adapters/postgres/src/sales-unit-of-work.ts';
import type {CapacityBytes} from '../apps/api/src/capacity-admission.ts';
const amounts = (v: bigint): CapacityBytes => ({postgres: v, wal: v, backup: v, system: v, media: v});
const target = {host: 'synthetic.invalid', port: 5432, database: 'SYNTHETIC_ONLY', role: 'SYNTHETIC_RUNTIME', databaseOid: '999', postmasterStart: 'synthetic-postmaster'};
const identity = () => ({database: target.database, role: target.role, session_user: target.role, database_oid: target.databaseOid,
  postmaster_start: target.postmasterStart, read_only: 'on', isolation: 'repeatable read'});
const storage = () => ({relation_bytes: '9007199254740993', index_bytes: '1', total_relation_bytes: '9007199254740994', database_bytes: '9007199254741994'});
const deferred = <T>() => {let resolve!: (v: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};};
const unavailable = {code: 'CAPACITY_ADMISSION_UNAVAILABLE', reason: 'PROBE_UNAVAILABLE'};
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
function fixture() {
  let at = 1000, factCalls = 0, connects = 0;
  const binding = {candidateFingerprint: 'synthetic-source', targetFingerprint: 'synthetic-target', writerTopologyFingerprint: 'one-writer',
    inventoryFingerprint: 'synthetic-inventory', processInstanceId: 'synthetic-instance', restartGeneration: 1, writerCount: 1,
    physicalVolumes: {postgres: 'pg-wal', wal: 'pg-wal', backup: 'backup', system: 'system-media', media: 'system-media'}};
  const sql: string[] = [], releases: (Error | boolean | undefined)[] = [];
  let facts: (() => CapacityRuntimeVolumeFacts) | undefined;
  let beforeStorage: (() => Promise<void>) | undefined, beforeConnect: (() => Promise<void>) | undefined;
  let id = identity(), bytes = storage(), failRollback = false, failRelease = false;
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
    now: () => at, currentBinding: () => binding, runtimeProbe: {target,
      async readVolumeFacts({window}) {factCalls++; return facts ? facts() : {status: 'KNOWN', windowToken: window.token,
        binding: structuredClone(binding), observedAt: at, freeBytes: amounts(1000n)};}}};
  const admission = createOwnedPoolCapacityAdmission(options);
  const bind = () => captureCapacityRuntimePoolBinder(admission)!(pool, {host: target.host, port: target.port, database: target.database, user: target.role, password: 'SYNTHETIC_ONLY', ssl: false});
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
