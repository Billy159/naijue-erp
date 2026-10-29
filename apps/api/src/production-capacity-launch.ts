/** Private CLI capacity input and one trusted, owner-reviewed real-time producer.
 * No shell, plugin discovery, second pool, default budget or receipt-file facts.
 * A challenge binds a response; it does NOT attest collection authenticity.
 */
import {constants} from 'node:fs';
import {lstat, realpath, open, readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {CAPACITY_VOLUMES} from './capacity-admission.ts';
import type {CapacityBinding, CapacityBytes, CapacityWindow, CapacityWriteBudget} from './capacity-admission.ts';
import {createOwnedPoolCapacityAdmission} from './capacity-runtime-probe.ts';
import type {CapacityRuntimeTarget, CapacityRuntimeVolumeFacts, PreparedOwnedPoolCapacityAdmission} from './capacity-runtime-probe.ts';

const fail = (): never => {throw new TypeError('Explicit private approved capacity launch inputs are unavailable or invalid');};
function bag(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length || keys.some(k=>!Object.hasOwn(value,k))) return fail();
  return value as Record<string, unknown>;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.length>0 && v.length<=4096 && !/[\x00-\x1f\x7f]/.test(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v>0;
const hash = (v: unknown): v is string => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown): v is string => typeof v==='string' && /^(?:0|[1-9]\d*)$/.test(v);
const canonical = (v: unknown): v is string => text(v) && path.isAbsolute(v) && path.resolve(v)===v;
function bytes(value: unknown): CapacityBytes {
  const b=bag(value,CAPACITY_VOLUMES);if(!CAPACITY_VOLUMES.every(k=>decimal(b[k])))return fail();
  return Object.fromEntries(CAPACITY_VOLUMES.map(k=>[k,BigInt(b[k] as string)])) as unknown as CapacityBytes;
}
function binding(value: unknown): CapacityBinding {
  const b=bag(value,['candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId','restartGeneration','writerCount','physicalVolumes']);
  const volumes=bag(b.physicalVolumes,CAPACITY_VOLUMES);
  if(!['candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId'].every(k=>text(b[k]))
    || typeof b.restartGeneration!=='number' || !Number.isSafeInteger(b.restartGeneration) || b.restartGeneration<0 || b.writerCount!==1
    || !CAPACITY_VOLUMES.every(k=>text(volumes[k])))return fail();
  return structuredClone(b) as unknown as CapacityBinding;
}
interface VolumeMapping {readonly path: string; readonly physicalVolume: string; readonly namespace: string}
export interface ProductionCapacityLaunchConfiguration {
  readonly schemaVersion: 1; readonly profile: 'OWNER_REVIEWED_CAPACITY_EXEC_V1';
  readonly target: CapacityRuntimeTarget; readonly window: CapacityWindow;
  readonly process: {readonly pid: number; readonly linuxStartTicks: string; readonly linuxBootId: string};
  readonly budgets: Readonly<Record<'session'|'upload', CapacityWriteBudget>>;
  readonly minimumFreeBytes: CapacityBytes; readonly safetyBytes: CapacityBytes;
  readonly probeTtlMillis: number; readonly probeTimeoutMillis: number; readonly maxProbeWaiters: number; readonly retryAfterSeconds: number;
  readonly producer: {readonly executable: string; readonly sha256: string; readonly args: readonly string[]; readonly timeoutMillis: number;
    readonly maxOutputBytes: number; readonly reviewSha256: string; readonly volumes: Readonly<Record<typeof CAPACITY_VOLUMES[number], VolumeMapping>>};
}
/** Closed JSON data only. Host capacityLaunch is removed BEFORE the unchanged
 * business/runtime parser; none of these fields enter public configuration. */
export function parseProductionCapacityLaunch(input: unknown): ProductionCapacityLaunchConfiguration {
  const b=bag(input,['schemaVersion','profile','target','window','process','budgets','minimumFreeBytes','safetyBytes',
    'probeTtlMillis','probeTimeoutMillis','maxProbeWaiters','retryAfterSeconds','producer']);
  const t=bag(b.target,['host','port','database','role','databaseOid','postmasterStart']);
  const w=bag(b.window,['approved','token','inventoryObservedAt','startsAt','expiresAt','binding']);
  const p=bag(b.process,['pid','linuxStartTicks','linuxBootId']);
  const e=bag(b.producer,['executable','sha256','args','timeoutMillis','maxOutputBytes','reviewSha256','volumes']);
  const v=bag(e.volumes,CAPACITY_VOLUMES), budgets=bag(b.budgets,['session','upload']),actualBinding=binding(w.binding);
  if(b.schemaVersion!==1 || b.profile!=='OWNER_REVIEWED_CAPACITY_EXEC_V1' || !['host','database','role','postmasterStart'].every(k=>text(t[k]))
    || !positive(t.port) || t.port>65535 || !decimal(t.databaseOid) || t.databaseOid==='0' || w.approved!==true || !text(w.token)
    || ![w.inventoryObservedAt,w.startsAt,w.expiresAt].every(positive) || Number(w.inventoryObservedAt)>Number(w.startsAt) || Number(w.startsAt)>=Number(w.expiresAt)
    || !positive(p.pid) || !decimal(p.linuxStartTicks) || !text(p.linuxBootId)
    || !canonical(e.executable) || !hash(e.sha256) || !hash(e.reviewSha256) || !Array.isArray(e.args) || e.args.length>1
    || e.args.some(a=>typeof a!=='string'||!/^--profile=[A-Za-z0-9_.-]{1,64}$/.test(a))
    || ![b.probeTtlMillis,b.probeTimeoutMillis,b.maxProbeWaiters,b.retryAfterSeconds,e.timeoutMillis,e.maxOutputBytes].every(positive)
    || Number(b.probeTtlMillis)>30000 || Number(b.probeTimeoutMillis)>Number(b.probeTtlMillis)
    || Number(e.timeoutMillis)>Number(b.probeTimeoutMillis) || Number(e.maxOutputBytes)>65536)return fail();
  const converted={} as Record<'session'|'upload',CapacityWriteBudget>;
  for(const k of ['session','upload'] as const){const item=bag(budgets[k],['maxAdmissions','maxInFlight','worstCaseBytes']);
    if(!positive(item.maxAdmissions)||!positive(item.maxInFlight)||item.maxInFlight>item.maxAdmissions)return fail();
    converted[k]={maxAdmissions:item.maxAdmissions,maxInFlight:item.maxInFlight,worstCaseBytes:bytes(item.worstCaseBytes)};}
  for(const k of CAPACITY_VOLUMES){const item=bag(v[k],['path','physicalVolume','namespace']);
    if(!canonical(item.path)||!text(item.namespace)||item.physicalVolume!==actualBinding.physicalVolumes[k])return fail();}
  return {schemaVersion:1,profile:'OWNER_REVIEWED_CAPACITY_EXEC_V1',target:structuredClone(t) as unknown as CapacityRuntimeTarget,
    window:{...structuredClone(w),binding:actualBinding} as unknown as CapacityWindow,process:structuredClone(p) as unknown as ProductionCapacityLaunchConfiguration['process'],
    budgets:converted,minimumFreeBytes:bytes(b.minimumFreeBytes),safetyBytes:bytes(b.safetyBytes),
    probeTtlMillis:b.probeTtlMillis as number,probeTimeoutMillis:b.probeTimeoutMillis as number,maxProbeWaiters:b.maxProbeWaiters as number,retryAfterSeconds:b.retryAfterSeconds as number,
    producer:structuredClone(e) as unknown as ProductionCapacityLaunchConfiguration['producer']};
}
/** Linux process identity survives exec, so the owner can bind a private launch
 * approval in its existing supervisor BEFORE exec. A restarted PID/start-tick
 * mismatch never auto-renews/reuses that approval. No new state/claim file. */
async function processBinding(): Promise<{pid:number;linuxStartTicks:string;linuxBootId:string}> {
  if(process.platform!=='linux')return fail();
  const stat=await readFile('/proc/self/stat','utf8'),end=stat.lastIndexOf(')');
  const startTicks=stat.slice(end+2).split(/\s+/)[19],boot=(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();
  if(end<0 || !decimal(startTicks) || !/^[a-f0-9-]{36}$/.test(boot))return fail();
  return {pid:process.pid,linuxStartTicks:startTicks,linuxBootId:boot};
}
async function executableMatches(p: ProductionCapacityLaunchConfiguration['producer']): Promise<void> {
  if(await realpath(p.executable)!==p.executable)return fail();
  const before=await lstat(p.executable),parent=await lstat(path.dirname(p.executable)),uid=process.getuid?.();
  if(!before.isFile() || before.isSymbolicLink() || before.size<1 || before.size>16777216 || (before.mode&0o022)!==0 || (before.mode&0o111)===0
    || ![0,uid].includes(before.uid) || !parent.isDirectory() || parent.isSymbolicLink() || (parent.mode&0o022)!==0)return fail();
  const file=await open(p.executable,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {const stat=await file.stat(),data=await file.readFile(),after=await file.stat();
    if(stat.ino!==before.ino||stat.dev!==before.dev||stat.size!==before.size||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs
      || data.length!==before.size || createHash('sha256').update(data).digest('hex')!==p.sha256)return fail();
  }finally{await file.close();}
}
export function createCapacityExecProducer(config: ProductionCapacityLaunchConfiguration): (input:{window:CapacityWindow;signal:AbortSignal})=>Promise<CapacityRuntimeVolumeFacts> {
  const c=structuredClone(config);
  return async ({window,signal}) => {
    if(signal.aborted)return{status:'UNKNOWN'};
    await executableMatches(c.producer);
    if(signal.aborted)return{status:'UNKNOWN'};
    const challenge=randomUUID(),started=Date.now();
    const request={format:'CAPACITY_LIVE_REQUEST_V1',challenge,target:c.target,windowToken:window.token,binding:window.binding,
      volumes:c.producer.volumes,producerReviewSha256:c.producer.reviewSha256,requestedAt:started};
    const output=await new Promise<Buffer>((resolve,reject)=>{
      const child=spawn(c.producer.executable,[...c.producer.args],{shell:false,env:{},stdio:['pipe','pipe','pipe'],windowsHide:true});
      const chunks:Buffer[]=[];let count=0,failed=false;
      const stop=()=>{failed=true;child.kill('SIGKILL');};
      const timer=setTimeout(stop,c.producer.timeoutMillis),abort=()=>stop();signal.addEventListener('abort',abort,{once:true});
      const consume=(b:Buffer,stdout:boolean)=>{count+=b.length;if(count>c.producer.maxOutputBytes)stop();else if(stdout)chunks.push(b);};
      child.stdout.on('data',(b:Buffer)=>consume(b,true));child.stderr.on('data',(b:Buffer)=>consume(b,false));
      child.stdin.on('error',stop);child.on('error',()=>{failed=true;});
      // Resolve/reject only on close: abort/timeout is not a claim that the
      // native process or its descriptors have already exited.
      child.once('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);
        if(failed||signal.aborted||code!==0)reject(new Error('Capacity producer unavailable'));else resolve(Buffer.concat(chunks));});
      if(signal.aborted)stop();else child.stdin.end(JSON.stringify(request)+'\n');
    });
    try {
      const body=bag(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(output)),['format','challenge','target','windowToken','binding','producerReviewSha256','collectionStartedAt','collectionFinishedAt','volumes']);
      const observed=bag(body.volumes,CAPACITY_VOLUMES),free={} as Record<typeof CAPACITY_VOLUMES[number],bigint>,end=Date.now();
      if(body.format!=='CAPACITY_LIVE_RESULT_V1'||body.challenge!==challenge||body.windowToken!==window.token||body.producerReviewSha256!==c.producer.reviewSha256
        || !isDeepStrictEqual(body.target,c.target) || !isDeepStrictEqual(binding(body.binding),window.binding)
        || !positive(body.collectionStartedAt)||!positive(body.collectionFinishedAt)||body.collectionStartedAt<started
        || body.collectionFinishedAt<body.collectionStartedAt||body.collectionFinishedAt>end||end-body.collectionStartedAt>=c.probeTtlMillis)return fail();
      for(const k of CAPACITY_VOLUMES){const item=bag(observed[k],['path','physicalVolume','namespace','availableBytes']),mapped=c.producer.volumes[k];
        if(item.path!==mapped.path||item.namespace!==mapped.namespace||item.physicalVolume!==mapped.physicalVolume||!decimal(item.availableBytes))return fail();free[k]=BigInt(item.availableBytes);}
      return{status:'KNOWN',windowToken:window.token,binding:structuredClone(window.binding),observedAt:body.collectionStartedAt,freeBytes:free};
    }catch{return{status:'UNKNOWN'};}
  };
}
/** Called by the real CLI; no test callback/config function can enter this path. */
export async function createProductionCapacityLaunch(input: unknown, runtime: {readonly postgres:{readonly target:{readonly host:string;readonly port:number;readonly database:string;readonly user:string}};
  readonly build:{readonly sourceCommit:string};readonly productMedia?:{readonly root:string}}): Promise<PreparedOwnedPoolCapacityAdmission> {
  try {
    const c=parseProductionCapacityLaunch(input),p=await processBinding(),t=runtime.postgres.target;
    if(!isDeepStrictEqual(c.process,p)||c.window.binding.processInstanceId!==`${p.linuxBootId}:${p.pid}:${p.linuxStartTicks}`
      || c.window.binding.candidateFingerprint!==runtime.build.sourceCommit||c.target.host!==t.host||c.target.port!==t.port
      || c.target.database!==t.database||c.target.role!==t.user||Date.now()<c.window.startsAt||Date.now()>=c.window.expiresAt
      || runtime.productMedia && c.producer.volumes.media.path!==runtime.productMedia.root)return fail();
    await executableMatches(c.producer);
    return createOwnedPoolCapacityAdmission({...c,now:Date.now,currentBinding:()=>structuredClone(c.window.binding),
      runtimeProbe:{target:c.target,readVolumeFacts:createCapacityExecProducer(c)}});
  }catch{return fail();}
}
