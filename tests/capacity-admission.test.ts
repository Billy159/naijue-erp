/** Injected clocks and finite probe workers only. No PG, business files, HTTP host or production budget. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as tick} from 'node:timers/promises';
import {createCapacityAdmission, CapacityAdmissionRejected, CAPACITY_VOLUMES} from '../apps/api/src/capacity-admission.ts';
import type {CapacityBinding, CapacityBytes, CapacityReading, CapacityWindow, CapacityPhysicalVolumes} from '../apps/api/src/capacity-admission.ts';
const amount = (n: bigint): CapacityBytes => Object.fromEntries(CAPACITY_VOLUMES.map(k => [k,n])) as Record<typeof CAPACITY_VOLUMES[number],bigint>;
const distinctVolumes:CapacityPhysicalVolumes={postgres:'SYNTHETIC-PG-VOL',wal:'SYNTHETIC-WAL-VOL',backup:'SYNTHETIC-BACKUP-VOL',system:'SYNTHETIC-SYSTEM-VOL',media:'SYNTHETIC-MEDIA-VOL'};
const identity = (physicalVolumes:CapacityPhysicalVolumes=distinctVolumes): CapacityBinding => ({candidateFingerprint:'SYNTHETIC-CANDIDATE',targetFingerprint:'SYNTHETIC-PG-WAL-MEDIA',writerTopologyFingerprint:'SYNTHETIC-ONE-WRITER',inventoryFingerprint:'SYNTHETIC-INVENTORY',processInstanceId:'SYNTHETIC-PROCESS-1',restartGeneration:0,writerCount:1,physicalVolumes:{...physicalVolumes}});
const deferred = <T>() => {let resolve!: (v:T)=>void;let reject!: (e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const failure = (reason: string) => (e:unknown) => e instanceof CapacityAdmissionRejected && e.reason===reason && e.statusCode===503 && e.retryAfterSeconds===2;
const cancelled = (e:unknown) => e instanceof Error && e.name==='AbortError';
function setup(physicalVolumes:CapacityPhysicalVolumes=distinctVolumes) {
  let at=1000,actual=identity(physicalVolumes),calls=0;
  const window:CapacityWindow={approved:true,token:'SYNTHETIC-WINDOW-ONLY-NOT-A-LOGIN-TOKEN',inventoryObservedAt:900,startsAt:1000,expiresAt:10000,binding:identity(physicalVolumes)};
  const known = ():CapacityReading=>({status:'KNOWN',windowToken:window.token,binding:identity(physicalVolumes),observedAt:at,databaseBytes:100n,sessionRelationBytes:10n,freeBytes:amount(10000n)});
  const options={window,budgets:{session:{maxAdmissions:4,maxInFlight:2,worstCaseBytes:amount(10n)},upload:{maxAdmissions:3,maxInFlight:1,worstCaseBytes:amount(20n)}},minimumFreeBytes:amount(100n),safetyBytes:amount(50n),probeTtlMillis:100,probeTimeoutMillis:50,maxProbeWaiters:3,retryAfterSeconds:2,now:()=>at,currentBinding:()=>actual,probe:async()=>{calls++;return known();}};
  return {options,window,known,calls:()=>calls,setTime:(v:number)=>{at=v;},setBinding:(v:CapacityBinding)=>{actual=v;}};
}
test('A02 requires explicit finite configuration and refuses TTL above 30 seconds',()=>{
  const f=setup();assert.throws(()=>createCapacityAdmission({...f.options,probeTtlMillis:30001}),TypeError);
  assert.throws(()=>createCapacityAdmission({...f.options,probeTimeoutMillis:101}),TypeError);
  assert.throws(()=>createCapacityAdmission({...f.options,budgets:{...f.options.budgets,upload:{...f.options.budgets.upload,worstCaseBytes:amount(0n)}}}),TypeError);
});
for(const state of ['missing','unapproved','empty-token','not-started','expired']as const)test(`A02 ${state} window rejects both new writes before any probe; no implicit renewal`,async()=>{
  const f=setup();let w:CapacityWindow|null=f.window;
  if(state==='missing')w=null;
  if(state==='unapproved')w={...f.window,approved:false};
  if(state==='empty-token')w={...f.window,token:''};
  if(state==='not-started')f.setTime(999);
  if(state==='expired')f.setTime(10000);
  const a=createCapacityAdmission({...f.options,window:w});
  for(const kind of ['session','upload']as const)await assert.rejects(a.acquire(kind),failure(['missing','unapproved','empty-token'].includes(state)?'WINDOW_UNAPPROVED':'WINDOW_EXPIRED'));
  assert.equal(f.calls(),0);
});
for(const key of ['candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId','restartGeneration','writerCount']as const)test(`A02 changed ${key} rejects a previously cached positive probe`,async()=>{
  const f=setup(),a=createCapacityAdmission(f.options);(await a.acquire('session')).release();
  f.setBinding({...identity(),[key]:typeof identity()[key]==='number'?1+(identity()[key]as number):'CHANGED'});
  await assert.rejects(a.acquire('upload'),failure('BINDING_CHANGED'));assert.equal(f.calls(),1);
});
test('A02 shares one physical probe, enforces bounded waiters and releases cancelled waiters',async()=>{
  const f=setup(),d=deferred<CapacityReading>();let calls=0;
  const a=createCapacityAdmission({...f.options,maxProbeWaiters:2,probe:async()=>{calls++;return d.promise;}});
  const abort=new AbortController(),first=a.acquire('session',abort.signal),firstRejected=assert.rejects(first,cancelled),second=a.acquire('session');
  await assert.rejects(a.acquire('upload'),failure('PROBE_BUSY'));abort.abort();await firstRejected;
  const third=a.acquire('upload');await tick();assert.equal(calls,1);d.resolve(f.known());
  const held=await Promise.all([second,third]);held.forEach(x=>x.release());assert.equal(calls,1);a.close();
});
test('A02 cancelled waiters remove abort listeners and do not accumulate shared promise reactions',async()=>{
  const f=setup(),d=deferred<CapacityReading>();let added=0,removed=0;
  const a=createCapacityAdmission({...f.options,maxProbeWaiters:2,probe:()=>d.promise});
  const interested=a.acquire('session');
  for(let i=0;i<12;i++){
    const c=new AbortController(),signal=c.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
    signal.addEventListener=(...args:Parameters<typeof add>)=>{added++;return add(...args);};
    signal.removeEventListener=(...args:Parameters<typeof remove>)=>{removed++;return remove(...args);};
    const p=a.acquire('session',signal),rejected=assert.rejects(p,cancelled);c.abort();await rejected;
  }
  assert.equal(added,12);assert.equal(removed,12);
  d.resolve(f.known());(await interested).release();a.close();
});
test('A02 last cancelled probe waiter aborts physical work without pretending its resources were released',async()=>{
  const f=setup(),d=deferred<CapacityReading>(),c=new AbortController();let freed=0,signal:AbortSignal|undefined,calls=0;
  const a=createCapacityAdmission({...f.options,probe:async context=>{calls++;signal=context.signal;try{return await d.promise;}finally{freed++;}}});
  const running=a.acquire('session',c.signal),rejected=assert.rejects(running,cancelled);await tick();c.abort();await rejected;
  assert.equal(signal?.aborted,true);assert.equal(freed,0);
  await assert.rejects(a.acquire('upload'),failure('PROBE_UNAVAILABLE'));assert.equal(calls,1);
  d.resolve(f.known());await tick();assert.equal(freed,1);a.close();
});
test('A02 clock failure or regression refuses admission with the same fixed unavailable error',async()=>{
  const f=setup(),a=createCapacityAdmission(f.options);(await a.acquire('session')).release();f.setTime(999);
  await assert.rejects(a.acquire('session'),failure('CLOCK_INVALID'));a.close();
  const b=createCapacityAdmission({...f.options,now:()=>{throw Error('PRIVATE CLOCK ERROR');}});
  await assert.rejects(b.acquire('session'),e=>failure('CLOCK_INVALID')(e)&&!String(e).includes('PRIVATE'));b.close();
});
test('A02 timeout aborts probe but does not start a replacement until the physical worker settles',async()=>{
  const f=setup(),d=deferred<CapacityReading>();let calls=0,signal:AbortSignal|undefined,freed=0;
  const a=createCapacityAdmission({...f.options,probeTimeoutMillis:5,probeTtlMillis:10,probe:async c=>{calls++;signal=c.signal;try{return await d.promise;}finally{freed++;}}});
  await assert.rejects(a.acquire('session'),failure('PROBE_UNAVAILABLE'));assert.equal(signal?.aborted,true);assert.equal(freed,0);
  f.setTime(1020);await assert.rejects(a.acquire('upload'),failure('PROBE_UNAVAILABLE'));assert.equal(calls,1);
  d.resolve(f.known());await tick();assert.equal(freed,1);
  (await a.acquire('session')).release();assert.equal(calls,2);a.close();
});
test('A02 probe exception is UNKNOWN, cached briefly, sanitized and eligible for a later real retry',async()=>{
  const f=setup();let calls=0;
  const a=createCapacityAdmission({...f.options,probe:async()=>{calls++;if(calls===1)throw Error('PRIVATE CONNECTION STRING');return f.known();}});
  await assert.rejects(a.acquire('session'),failure('PROBE_UNAVAILABLE'));
  await assert.rejects(a.acquire('upload'),e=>failure('PROBE_UNAVAILABLE')(e)&&!String(e).includes('PRIVATE'));assert.equal(calls,1);
  await tick();f.setTime(1100);(await a.acquire('session')).release();assert.equal(calls,2);a.close();
});
for(const issue of ['token','binding','stale','future','unknown']as const)test(`A02 ${issue} probe cannot become a trusted cached result`,async()=>{
  const f=setup();const known=f.known();assert.equal(known.status,'KNOWN');
  const result:CapacityReading=issue==='unknown'?{status:'UNKNOWN'}:{...known,...(issue==='token'?{windowToken:'OTHER'}:issue==='binding'?{binding:{...identity(),targetFingerprint:'OTHER'}}:issue==='stale'?{observedAt:999}:{observedAt:1001})};
  const a=createCapacityAdmission({...f.options,probe:async()=>result});await assert.rejects(a.acquire('session'),failure('PROBE_UNAVAILABLE'));a.close();
});
test('A02 old results arriving after expiry or identity change never grant a lease',async()=>{
  for(const expiry of [true,false]){
    const f=setup(),d=deferred<CapacityReading>(),a=createCapacityAdmission({...f.options,probe:()=>d.promise});
    const p=a.acquire('session'),rejected=assert.rejects(p,failure(expiry?'WINDOW_EXPIRED':'BINDING_CHANGED'));await tick();
    if(expiry)f.setTime(10000);else f.setBinding({...identity(),processInstanceId:'RESTARTED'});
    d.resolve(f.known());await rejected;a.close();
  }
});
test('A02 cache expires exactly at TTL and both ordinary writes require a new trusted reading',async()=>{
  const f=setup(),a=createCapacityAdmission(f.options);(await a.acquire('session')).release();f.setTime(1099);(await a.acquire('upload')).release();assert.equal(f.calls(),1);
  await tick();f.setTime(1100);(await a.acquire('session')).release();assert.equal(f.calls(),2);a.close();
});
test('A02 each real target volume has an independent low-water floor with worst-case and safety reserve',async()=>{
  for(const volume of CAPACITY_VOLUMES){
    const f=setup(),known=f.known();assert.equal(known.status,'KNOWN');
    const a=createCapacityAdmission({...f.options,probe:async()=>({...known,freeBytes:{...known.freeBytes,[volume]:159n}})});
    await assert.rejects(a.acquire('session'),failure('LOW_WATER'));a.close();
  }
});
test('A02 in-flight slots release once, but cancelled/unknown writes never refund window count or byte charges',async()=>{
  const f=setup(),known=f.known();assert.equal(known.status,'KNOWN');
  const a=createCapacityAdmission({...f.options,probe:async()=>({...known,freeBytes:amount(180n)})});
  const first=await a.acquire('session'),second=await a.acquire('session');await assert.rejects(a.acquire('session'),failure('IN_FLIGHT_LIMIT'));
  first.release();first.release();second.release();
  const third=await a.acquire('session');third.release();await assert.rejects(a.acquire('session'),failure('LOW_WATER'));a.close();
  const b=createCapacityAdmission({...f.options,budgets:{...f.options.budgets,upload:{...f.options.budgets.upload,maxAdmissions:1}}});
  const upload=await b.acquire('upload');upload.release();await assert.rejects(b.acquire('upload'),failure('WINDOW_BUDGET_EXHAUSTED'));b.close();
});
test('A02 consumer abort never releases an acquired work lease; other write category retains its own slot',async()=>{
  const f=setup(),a=createCapacityAdmission(f.options),c=new AbortController(),held=await a.acquire('upload',c.signal);c.abort();
  await assert.rejects(a.acquire('upload'),failure('IN_FLIGHT_LIMIT'));
  (await a.acquire('session')).release();held.release();(await a.acquire('upload')).release();a.close();
});
test('A02 close cancels probe waiters, retains the physical worker until finally, and does not expose read/logout methods',async()=>{
  const f=setup(),d=deferred<CapacityReading>();let released=0,signal:AbortSignal|undefined;
  const a=createCapacityAdmission({...f.options,probe:async c=>{signal=c.signal;try{return await d.promise;}finally{released++;}}});
  const p=a.acquire('session'),rejected=assert.rejects(p,failure('CLOSED'));await tick();a.close();a.close();await rejected;
  assert.equal(signal?.aborted,true);assert.equal(released,0);d.resolve(f.known());await tick();assert.equal(released,1);
  assert.deepEqual(Object.keys(a).sort(),['acquire','close']);await assert.rejects(a.acquire('session'),failure('CLOSED'));
});
test('A02 lease sync recheck never renews captured TTL or probes inside a transaction; release/expiry/binding invalidate it',async()=>{
  for(const change of ['ttl','window','binding','released']as const){
    const f=setup(),a=createCapacityAdmission(f.options),lease=await a.acquire('session');lease.assertValid();
    if(change==='ttl')f.setTime(1100);
    if(change==='window')f.setTime(10000);
    if(change==='binding')f.setBinding({...identity(),targetFingerprint:'OTHER'});
    if(change==='released')lease.release();
    assert.throws(()=>lease.assertValid(),failure(change==='ttl'?'PROBE_UNAVAILABLE':change==='window'?'WINDOW_EXPIRED':change==='binding'?'BINDING_CHANGED':'LEASE_RELEASED'));
    assert.equal(f.calls(),1);lease.release();a.close();
  }
});
test('A02 another request refreshing the cache cannot extend an already issued lease',async()=>{
  const f=setup(),a=createCapacityAdmission(f.options),lease=await a.acquire('session');await tick();f.setTime(1100);
  (await a.acquire('upload')).release();assert.equal(f.calls(),2);
  assert.throws(()=>lease.assertValid(),failure('PROBE_UNAVAILABLE'));lease.release();a.close();
});

const sharedVolumes:CapacityPhysicalVolumes={...distinctVolumes,wal:distinctVolumes.postgres,media:distinctVolumes.system};
const cost = (values:Partial<Record<typeof CAPACITY_VOLUMES[number],bigint>>):CapacityBytes=>({...amount(0n),...values});
test('A02 physical shared PG/WAL and system/media combine each write demand instead of admitting two60 on one100 volume',async()=>{
  for(const kind of ['session','upload']as const){
    const f=setup(sharedVolumes),budget=f.options.budgets[kind];
    const a=createCapacityAdmission({...f.options,minimumFreeBytes:amount(0n),safetyBytes:amount(0n),
      budgets:{...f.options.budgets,[kind]:{...budget,worstCaseBytes:kind==='session'?cost({postgres:60n,wal:60n}):cost({system:60n,media:60n})}},
      probe:async()=>({...f.known(),freeBytes:amount(100n)}) as CapacityReading});
    await assert.rejects(a.acquire(kind),failure('LOW_WATER'));a.close();
  }
});
test('A02 physical distinct volumes preserve separate capacity instead of summing independent disk demands',async()=>{
  const f=setup(),a=createCapacityAdmission({...f.options,minimumFreeBytes:amount(0n),safetyBytes:amount(0n),
    budgets:{...f.options.budgets,session:{...f.options.budgets.session,worstCaseBytes:cost({postgres:60n,wal:60n})}},
    probe:async()=>({...f.known(),freeBytes:amount(100n)}) as CapacityReading});
  const lease=await a.acquire('session');lease.assertValid();lease.release();a.close();
});
test('A02 physical shared volume serializes session/upload charges and a fresh probe or release cannot refund them',async()=>{
  const f=setup(sharedVolumes);let probes=0;
  const a=createCapacityAdmission({...f.options,minimumFreeBytes:amount(0n),safetyBytes:amount(0n),
    budgets:{session:{...f.options.budgets.session,worstCaseBytes:cost({postgres:60n})},upload:{...f.options.budgets.upload,worstCaseBytes:cost({wal:60n})}},
    probe:async()=>{probes++;return {...f.known(),freeBytes:amount(100n)} as CapacityReading;}});
  const result=await Promise.allSettled([a.acquire('session'),a.acquire('upload')]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected'&&failure('LOW_WATER')(r.reason)).length,1);
  for(const r of result)if(r.status==='fulfilled'){r.value.release();r.value.release();}
  await tick();f.setTime(1100);
  for(const kind of ['session','upload']as const)await assert.rejects(a.acquire(kind),failure('LOW_WATER'));
  assert.equal(probes,2);a.close();
});
test('A02 physical shared free is minimum once, floors are maximum and independent safety reservations add',async()=>{
  for(const [pgFree,walFree,accept]of [[100n,100n,true],[100n,99n,false],[99n,100n,false]]as const){
    const f=setup(sharedVolumes),a=createCapacityAdmission({...f.options,
      minimumFreeBytes:cost({postgres:30n,wal:40n}),safetyBytes:cost({postgres:10n,wal:15n}),
      budgets:{...f.options.budgets,session:{...f.options.budgets.session,worstCaseBytes:cost({postgres:20n,wal:15n})}},
      probe:async()=>({...f.known(),freeBytes:{...amount(100n),postgres:pgFree,wal:walFree}}) as CapacityReading});
    if(accept)(await a.acquire('session')).release();else await assert.rejects(a.acquire('session'),failure('LOW_WATER'));
    a.close();
  }
});
test('A02 physical mapping or volume identity drift rejects cached admission and the existing synchronous lease',async()=>{
  for(const replacement of [{...sharedVolumes,wal:distinctVolumes.wal},{...sharedVolumes,postgres:'REPLACED-PG',wal:'REPLACED-PG'}]){
    const f=setup(sharedVolumes),a=createCapacityAdmission(f.options),lease=await a.acquire('session');
    f.setBinding(identity(replacement));
    assert.throws(()=>lease.assertValid(),failure('BINDING_CHANGED'));await assert.rejects(a.acquire('upload'),failure('BINDING_CHANGED'));
    assert.equal(f.calls(),1);lease.release();a.close();
  }
});
test('A02 physical unknown mapping has no distinct-volume fallback at window/current/probe boundaries',async()=>{
  const f=setup(),unknown={...identity(),physicalVolumes:{...distinctVolumes,wal:undefined}} as unknown as CapacityBinding;
  assert.throws(()=>createCapacityAdmission({...f.options,window:{...f.window,binding:unknown}}),/physical-volume/);
  const current=createCapacityAdmission(f.options);f.setBinding(unknown);await assert.rejects(current.acquire('session'),failure('BINDING_CHANGED'));assert.equal(f.calls(),0);current.close();
  const g=setup(),probe=createCapacityAdmission({...g.options,probe:async()=>({...g.known(),binding:unknown}) as CapacityReading});
  await assert.rejects(probe.acquire('upload'),failure('PROBE_UNAVAILABLE'));probe.close();
  const h=setup(),drift=createCapacityAdmission({...h.options,probe:async()=>({...h.known(),binding:identity(sharedVolumes)}) as CapacityReading});
  await assert.rejects(drift.acquire('session'),failure('PROBE_UNAVAILABLE'));drift.close();
});
