/** Local private synthetic producer and scripted pool/host only. No ERP PG,
 * key, business account, listener, server, permission change or real deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {parseProductionCapacityLaunch,createCapacityExecProducer,createProductionCapacityLaunch} from './production-capacity-launch.ts';
import {createOwnedPoolCapacityAdmission,captureCapacityRuntimePoolBinder} from './capacity-runtime-probe.ts';
import {runProductionCli} from './production-main.ts';
import type {ProductionMainDependencies} from './production-main.ts';
import type {PostgresApplicationApi} from './postgres-read-api.ts';
import {PRODUCTION_PUBLIC_ORIGIN} from './production-provider-composition.ts';
import {CAPACITY_VOLUMES} from './capacity-admission.ts';
import type {TestContext} from 'node:test';
import {execFile} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {channel, tracingChannel} from 'node:diagnostics_channel';
import {getEventListeners} from 'node:events';
import {fileURLToPath} from 'node:url';

const amounts=(n:string)=>Object.fromEntries(CAPACITY_VOLUMES.map(v=>[v,n]));
async function fixture(t:TestContext){
  const root=await mkdtemp(path.join(await realpath(tmpdir()),'a02-cli-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const executable=path.join(root,'producer'),source=`#!${process.execPath}
import fs from 'node:fs/promises';
let input='';for await(const chunk of process.stdin)input+=chunk;const r=JSON.parse(input),flag=process.argv[2]?.slice('--profile='.length);
if(flag==='hang'){process.stdout.write('SYNTHETIC_HANG_READY\\n');setInterval(()=>{},1000);}else{
 const started=Date.now(),volumes={};
 for(const [k,v]of Object.entries(r.volumes)){const s=await fs.statfs(v.path,{bigint:true});volumes[k]={...v,availableBytes:(s.bavail*s.bsize).toString()};}
 const body={format:'CAPACITY_LIVE_RESULT_V1',challenge:r.challenge,target:r.target,windowToken:r.windowToken,binding:r.binding,
 producerReviewSha256:r.producerReviewSha256,collectionStartedAt:started,collectionFinishedAt:Date.now(),volumes};
 if(flag==='stale')body.collectionStartedAt=r.requestedAt-1;if(flag==='replay')body.challenge='OLD_CHALLENGE';
 if(flag==='mapping')body.volumes.wal.namespace='WRONG_NAMESPACE';if(flag==='too-large')process.stdout.write('x'.repeat(10000));
 else process.stdout.write(JSON.stringify(body));}
`;
  await writeFile(executable,source,{mode:0o700});
  const now=Date.now(),binding={candidateFingerprint:'a'.repeat(40),targetFingerprint:'synthetic-target',writerTopologyFingerprint:'one',inventoryFingerprint:'synthetic-only',
    processInstanceId:'SYNTHETIC_ONLY',restartGeneration:1,writerCount:1,physicalVolumes:Object.fromEntries(CAPACITY_VOLUMES.map(v=>[v,'SYNTHETIC_LOCAL_ONE_FS']))};
  const target={host:'never-connected.invalid',port:5432,database:'SYNTHETIC_ONLY',role:'SYNTHETIC_RUNTIME',databaseOid:'999',postmasterStart:'SYNTHETIC_POSTMASTER'};
  const capacity={schemaVersion:1,profile:'OWNER_REVIEWED_CAPACITY_EXEC_V1',target,
    process:{pid:process.pid,linuxStartTicks:'1',linuxBootId:'SYNTHETIC_NO_PROCESS_APPROVAL'},window:{approved:true,token:'SYNTHETIC_LOCAL_ONLY',inventoryObservedAt:now-100,startsAt:now-50,expiresAt:now+60000,binding},
    budgets:{session:{maxAdmissions:20,maxInFlight:2,worstCaseBytes:amounts('1')},upload:{maxAdmissions:20,maxInFlight:2,worstCaseBytes:amounts('2')}},
    minimumFreeBytes:amounts('1'),safetyBytes:amounts('1'),probeTtlMillis:1000,probeTimeoutMillis:800,maxProbeWaiters:4,retryAfterSeconds:2,
    producer:{executable,sha256:createHash('sha256').update(source).digest('hex'),args:[],timeoutMillis:600,maxOutputBytes:8192,reviewSha256:'d'.repeat(64),
      volumes:Object.fromEntries(CAPACITY_VOLUMES.map(v=>[v,{path:root,physicalVolume:'SYNTHETIC_LOCAL_ONE_FS',namespace:'SYNTHETIC_SAME_LOCAL_TEST_FS'}]))}};
  const base={schemaVersion:1,profile:'source-confirmed-native-v1',documentCommands:'DISABLED',publicOrigin:PRODUCTION_PUBLIC_ORIGIN,
    http:{host:'0.0.0.0',port:3000,acceptedHosts:['1n5635n614.goho.co']},assets:{root,entry:'index.html'},build:{sourceCommit:'a'.repeat(40),buildId:'SYNTHETIC_ONLY'},
    postgres:{target:{host:target.host,port:target.port,database:target.database,user:target.role,password:'SYNTHETIC_NOT_A_CREDENTIAL',ssl:false},max:1,maxPendingAcquisitions:1,
      connectionTimeoutMillis:1000,acquisitionTimeoutMillis:1000,queryTimeoutMillis:1100,statementTimeoutMillis:900,lockTimeoutMillis:800,
      idleInTransactionTimeoutMillis:1000,idlePoolTimeoutMillis:1000,disposeGraceMillis:0,disposeTimeoutMillis:1000},
    authentication:{sessionTtlSeconds:900,policy:'source-confirmed-v1',passwordWork:{maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1},
      loginAdmission:{global:{burst:10,tokens:10,intervalMillis:1000},source:{burst:10,tokens:10,intervalMillis:1000},sourceAccount:{burst:10,tokens:10,intervalMillis:1000},
        entryTtlMillis:1000,maxEntries:100,maxRetryAfterSeconds:1}}};
  return{root,capacity,base,async config(selector:string,override:unknown=capacity){
    const runtime=selector===''?base:selector==='--exact26-r1'?{...base,profile:'source-confirmed-native-exact26-r1-v1',runtime26Review:{reviewFile:path.join(root,'unread-review'),trustedReviewSha256:'b'.repeat(64)}}
      :{...base,profile:selector==='--exact26-r2'?'source-confirmed-native-exact26-r2-v1':'source-confirmed-native-exact26-r3-v1',
        documentCommands:'NATIVE_RUNTIME',runtime26Review:{reviewFile:path.join(root,'unread-review'),trustedReviewSha256:'b'.repeat(64)},existingPreparation:{sales:false,transfers:false},
        ...(selector==='--exact26-r2'?{}:{productMedia:{root,rootKey:'SYNTHETIC_MEDIA'}})};
    const filename=path.join(root,'runtime.json');await writeFile(filename,JSON.stringify({...runtime,...(override===undefined?{}:{capacityLaunch:override})}),{mode:0o600});return filename;
  }};
}
function scriptedHost(){
  let closed=0,starts=0,releases=0,queries=0,created=0;let resource:ReturnType<typeof createOwnedPoolCapacityAdmission>|undefined;
  const events:string[]=[];
  const deps:ProductionMainDependencies={
    async createCapacity(input,runtime){events.push('capacity');created++;const c=parseProductionCapacityLaunch(input);
      assert.equal(c.target.database,runtime.postgres.target.database);
      resource=createOwnedPoolCapacityAdmission({...c,now:Date.now,currentBinding:()=>c.window.binding,runtimeProbe:{target:c.target,readVolumeFacts:createCapacityExecProducer(c)}});return resource;},
    async createApi(mode,c,capacity){events.push('api:'+mode);assert.equal(capacity,resource);
      captureCapacityRuntimePoolBinder(capacity)!({async connect(){return{async query(sql){queries++;
        if(sql.includes('capacity-runtime:identity'))return{rows:[{database:c.postgres.target.database,role:c.postgres.target.user,session_user:c.postgres.target.user,
          database_oid:'999',postmaster_start:'SYNTHETIC_POSTMASTER',read_only:'on',isolation:'repeatable read'}],rowCount:1};
        if(sql.includes('capacity-inventory:storage'))return{rows:[{relation_bytes:'1',index_bytes:'1',total_relation_bytes:'2',database_bytes:'10'}],rowCount:1};
        return{rows:[],rowCount:0};},release(){releases++;}};}},c.postgres.target);
      return{close:async()=>{closed++;},app:{},trustedOrigin:c.publicOrigin,postgresBackgroundFailureCount:0}as unknown as PostgresApplicationApi;},
    async startHost(mode,api){events.push('start:'+mode);assert.ok(queries>0&&releases>0,'Same-owned-pool probe must finish before host starts');starts++;
      return{publicOrigin:PRODUCTION_PUBLIC_ORIGIN,close:()=>api.close()};},
    writeStarted(line){events.push('ready');assert.ok(!line.includes('capacityLaunch')&&!line.includes('SYNTHETIC_NOT_A_CREDENTIAL'));},
  };
  return{deps,events,get resource(){assert.ok(resource);return resource;},counts:()=>({closed,starts,releases,queries,created})};
}
test('A02 CLI capacity configuration rejects unknown fields, missing producer and invalid budgets without defaults',async t=>{
  const f=await fixture(t);parseProductionCapacityLaunch(f.capacity);
  for(const bad of [{...f.capacity,extra:true},{...f.capacity,producer:undefined},{...f.capacity,probeTtlMillis:30001},
    {...f.capacity,producer:{...f.capacity.producer,args:['-e','CODE_NOT_ALLOWED']}},
    {...f.capacity,budgets:{...f.capacity.budgets,session:{...f.capacity.budgets.session,worstCaseBytes:amounts('-1')}}}])assert.throws(()=>parseProductionCapacityLaunch(bad),TypeError);
  await assert.rejects(createProductionCapacityLaunch(f.capacity,f.base),/capacity launch inputs/,'Synthetic process approval must never be accepted by actual CLI creator');
});
for(const selector of ['', '--exact26-r1','--exact26-r2','--exact26-r3','--exact26-full'])test(`A02 actual CLI dispatch ${selector||'legacy'} creates one resource, preflights before ready and closes listeners/resources`,async t=>{
  const f=await fixture(t),h=scriptedHost(),args=[...(selector?[selector]:[]),await f.config(selector)];
  const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];
  await runProductionCli(args,h.deps);assert.equal(h.counts().created,1);assert.equal(h.counts().starts,1);assert.equal(h.resource.snapshot().admitted.session,0);
  assert.ok(h.events.indexOf('capacity')<h.events.findIndex(v=>v.startsWith('api:'))&&h.events.at(-1)==='ready');
  process.emit('SIGTERM');await wait(1);assert.equal(h.counts().closed,1);assert.equal(h.resource.snapshot().closed,true);
  assert.deepEqual([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')],before);
});
for(const flag of ['stale','replay','mapping','hang','too-large'])test(`A02 CLI live producer ${flag} refuses ready and closes API/resource/listeners`,async t=>{
  const f=await fixture(t),h=scriptedHost();f.capacity.producer.args=[`--profile=${flag}`] as never[];
  const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];
  await assert.rejects(runProductionCli(['--exact26-full',await f.config('--exact26-full')],h.deps),/startup refused/);
  assert.equal(h.counts().starts,0);assert.equal(h.counts().closed,1);assert.equal(h.resource.snapshot().closed,true);
  assert.deepEqual([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')],before);
});
test('A02 actual CLI missing capacity and expired window cannot reach ready; low-water starts readonly but refuses both writes',async t=>{
  const f=await fixture(t),missing=scriptedHost(),filename=await f.config('--exact26-r1');const raw=JSON.parse(await readFile(filename,'utf8'));delete raw.capacityLaunch;
  await writeFile(filename,JSON.stringify(raw),{mode:0o600});await assert.rejects(runProductionCli(['--exact26-r1',filename],missing.deps));assert.equal(missing.counts().starts,0);
  const expired=scriptedHost();f.capacity.window.startsAt=1;f.capacity.window.inventoryObservedAt=1;f.capacity.window.expiresAt=2;
  await assert.rejects(runProductionCli(['--exact26-r1',await f.config('--exact26-r1')],expired.deps));assert.equal(expired.counts().starts,0);
  const low=scriptedHost();f.capacity.window.startsAt=Date.now()-10;f.capacity.window.expiresAt=Date.now()+60000;f.capacity.minimumFreeBytes=amounts('99999999999999999999');
  await runProductionCli(['--exact26-r1',await f.config('--exact26-r1')],low.deps);
  for(const kind of ['session','upload']as const)await assert.rejects(low.resource.acquire(kind),{reason:'LOW_WATER'});
  f.capacity.window.expiresAt=Date.now()-1;assert.equal(low.resource.snapshot().closed,false,'Captured live window cannot be changed by caller');
  process.emit('SIGTERM');await wait(1);
});
test('A02 CLI original live window expires in real time without auto-renewing ready resource',async t=>{
  const f=await fixture(t),h=scriptedHost();f.capacity.window.expiresAt=Date.now()+1200;
  await runProductionCli(['--exact26-r1',await f.config('--exact26-r1')],h.deps);
  await wait(Math.max(0,f.capacity.window.expiresAt-Date.now())+1);
  for(const kind of ['session','upload']as const)await assert.rejects(h.resource.acquire(kind),{reason:'WINDOW_EXPIRED'});
  assert.equal(h.resource.snapshot().admitted.session,0);process.emit('SIGTERM');await wait(1);assert.equal(h.counts().closed,1);
});
test('A02 CLI failed API/host construction closes its capacity and API without lingering signal handlers',async t=>{
  const f=await fixture(t);
  for(const failure of ['api','host']as const){const h=scriptedHost(),before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')];
    const deps={...h.deps,...(failure==='api'?{createApi:async()=>{throw Error('synthetic');}}:{startHost:async()=>{throw Error('synthetic');}})};
    await assert.rejects(runProductionCli(['--exact26-full',await f.config('--exact26-full')],deps));assert.equal(h.resource.snapshot().closed,true);
    assert.equal(h.counts().closed,failure==='api'?0:1);assert.deepEqual([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')],before);}
});
test('A02 live producer refuses changed executable and unsafe permissions',async t=>{
  const f=await fixture(t),c=parseProductionCapacityLaunch(f.capacity),producer=createCapacityExecProducer(c),controller=new AbortController();
  await chmod(f.capacity.producer.executable,0o777);await assert.rejects(producer({window:c.window,signal:controller.signal}));await chmod(f.capacity.producer.executable,0o700);
  await writeFile(f.capacity.producer.executable,'changed');await assert.rejects(producer({window:c.window,signal:controller.signal}));
});
test('A02 live producer abort rejects only after its native child closes; no second worker or listener',async t=>{
  const f=await fixture(t);f.capacity.producer.args=['--profile=hang']as never[];
  const c=parseProductionCapacityLaunch(f.capacity),controller=new AbortController();
  const before=[process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')],events:string[]=[],children:ChildProcess[]=[];
  let workers=0,listeners=0,closeResult:{code:number|null;signal:NodeJS.Signals|null}|undefined;
  let ready!:()=>void;const nativeReady=new Promise<void>(resolve=>{ready=resolve;});
  const childChannel=channel('child_process'),workerChannel=channel('worker_threads'),listenChannel=tracingChannel('net.server.listen').start;
  const observeChild=(message:unknown)=>{
    const child=(message as {process:ChildProcess}).process;children.push(child);
    child.once('close',(code,signal)=>{closeResult={code,signal};events.push('close');});
    child.once('spawn',()=>{
      let output='';const observeReady=(chunk:Buffer)=>{
        output+=chunk.toString('utf8');
        if(output.includes('SYNTHETIC_HANG_READY\n')){child.stdout!.off('data',observeReady);events.push('ready');ready();}
      };
      child.stdout!.on('data',observeReady);
    });
  };
  const observeWorker=()=>{workers++;},observeListen=()=>{listeners++;};
  childChannel.subscribe(observeChild);workerChannel.subscribe(observeWorker);listenChannel.subscribe(observeListen);
  const work=createCapacityExecProducer(c)({window:c.window,signal:controller.signal});
  const settled=work.then(value=>{events.push('resolved');return{status:'resolved',value};},error=>{events.push('rejected');return{status:'rejected',error};});
  t.after(async()=>{
    controller.abort();await settled;
    childChannel.unsubscribe(observeChild);workerChannel.unsubscribe(observeWorker);listenChannel.unsubscribe(observeListen);
  });
  // A fixed sleep can abort during executable validation, before any child
  // exists; that deliberately returns UNKNOWN rather than rejecting. Wait for
  // the real native fixture to confirm its hang branch, within the unchanged
  // producer timeout, and fail explicitly if work settles before readiness.
  assert.equal(await Promise.race([nativeReady.then(()=>'ready'),settled]),'ready');
  assert.equal(children.length,1);const child=children[0]!;
  assert.deepEqual(child.spawnargs,[c.producer.executable,'--profile=hang']);
  assert.equal(closeResult,undefined);assert.deepEqual(events,['ready']);
  assert.equal(getEventListeners(controller.signal,'abort').length,1);
  events.push('abort');controller.abort();
  await assert.rejects(work,{message:'Capacity producer unavailable'});await settled;
  assert.deepEqual(events,['ready','abort','close','rejected']);
  assert.deepEqual(closeResult,{code:null,signal:'SIGKILL'});
  assert.equal(child.stdin!.destroyed,true);assert.equal(child.stdout!.destroyed,true);assert.equal(child.stderr!.destroyed,true);
  assert.equal(children.length,1);assert.equal(workers,0);assert.equal(listeners,0);
  assert.equal(getEventListeners(controller.signal,'abort').length,0);
  assert.deepEqual([process.listenerCount('SIGTERM'),process.listenerCount('SIGINT')],before);
});
test('A02 executable production-main dispatch rejects missing capacity for every mode before API/PG/listen',async t=>{
  const f=await fixture(t),main=fileURLToPath(new URL('./production-main.ts',import.meta.url));
  for(const selector of ['', '--exact26-r1','--exact26-r2','--exact26-r3','--exact26-full']){
    const file=await f.config(selector),raw=JSON.parse(await readFile(file,'utf8'));delete raw.capacityLaunch;await writeFile(file,JSON.stringify(raw),{mode:0o600});
    const result=await new Promise<{code:number|null;stdout:string;stderr:string}>(resolve=>{
      execFile(process.execPath,[main,...(selector?[selector]:[]),file],{timeout:5000,maxBuffer:4096,env:{}},(error,stdout,stderr)=>{
        resolve({code:error && typeof error.code==='number'?error.code:error?null:0,stdout,stderr});});});
    assert.equal(result.code,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'Production startup refused or failed; inspect private operational diagnostics\n');
  }
});

test('production35 CLI carries the same parsed capacity target through API then preflight before listen',async t=>{
 const f=await fixture(t),h=scriptedHost(),filename=path.join(f.root,'production35.json');
 const raw={...f.base,profile:'source-confirmed-native-exact35-production-v2',documentCommands:'NATIVE_RUNTIME',productMedia:{root:f.root,rootKey:'synthetic35'},capacityLaunch:f.capacity};
 await writeFile(filename,JSON.stringify(raw),{mode:0o600});let calls=0;
 const deps={...h.deps,async createApi(...args:Parameters<ProductionMainDependencies['createApi']>){calls++;assert.equal(args[0],'r35');assert.equal(args[1].profile,raw.profile);assert.deepEqual(args[4],f.capacity.target);return h.deps.createApi(...args);}};
 await runProductionCli(['--exact35',filename],deps);assert.equal(calls,1);assert.equal(h.counts().created,1);assert.equal(h.counts().starts,1);
 process.emit('SIGTERM');await wait(1);assert.equal(h.resource.snapshot().closed,true);assert.equal(h.counts().closed,1);
});
test('production35 actual provider refuses absent protected record before PG and CLI closes original capacity without listen',async t=>{
 const {createProductionRuntime35ApplicationApi}=await import('./production-provider-composition.ts');
 const f=await fixture(t),h=scriptedHost(),filename=path.join(f.root,'production35-denied.json');let connections=0;
 await writeFile(filename,JSON.stringify({...f.base,profile:'source-confirmed-native-exact35-production-v2',documentCommands:'NATIVE_RUNTIME',productMedia:{root:f.root,rootKey:'synthetic35'},capacityLaunch:f.capacity}),{mode:0o600});
 const deps={...h.deps,async createApi(mode:Parameters<ProductionMainDependencies['createApi']>[0],c:Parameters<ProductionMainDependencies['createApi']>[1],capacity:Parameters<ProductionMainDependencies['createApi']>[2],tag:Parameters<ProductionMainDependencies['createApi']>[3],target:Parameters<ProductionMainDependencies['createApi']>[4]){
  return createProductionRuntime35ApplicationApi(c,()=>({async connect(){connections++;throw Error('must not connect');},async end(){},on(){return this;}} as never),tag,capacity,target);
 }};
 await assert.rejects(runProductionCli(['--exact35',filename],deps),/startup refused/);assert.equal(connections,0);assert.equal(h.counts().starts,0);assert.equal(h.resource.snapshot().closed,true);
});
