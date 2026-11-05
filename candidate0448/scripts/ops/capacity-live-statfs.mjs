#!/usr/local/bin/node
/** Owner-mounted profile, core-only five-directory live collector. No PG or child processes. */
import {constants} from 'node:fs';
import {lstat, realpath, open, statfs, readlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const VOLUMES=['postgres','wal','backup','system','media'];
const PROFILE='/run/naijue-rewrite/capacity/owner-profile.json';
const MAX_BYTES=65536;
function requireValue(value){if(!value)throw Error('CAPACITY_COLLECTION_UNAVAILABLE');}
function bag(v,keys){requireValue(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));return v;}
const text=v=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\x00-\x1f\x7f]/.test(v);
const decimal=v=>typeof v==='string'&&/^(?:0|[1-9]\d*)$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const absolute=v=>text(v)&&path.isAbsolute(v)&&path.resolve(v)===v;
export async function mountNamespace(){
  if(process.platform==='linux')return 'linux:'+await readlink('/proc/self/ns/mnt');
  // Local source tests only. A Linux runtime never accepts this namespace.
  requireValue(process.platform==='darwin');return 'darwin:local';
}
async function canonicalDirectory(filename){
  requireValue(absolute(filename));let current=path.parse(filename).root;
  for(const part of path.relative(current,filename).split(path.sep).filter(Boolean)){
    current=path.join(current,part);const s=await lstat(current);requireValue(s.isDirectory()&&!s.isSymbolicLink());
  }
  requireValue(await realpath(filename)===filename);
}
async function ownerProfile(filename,digest){
  requireValue(absolute(filename)&&hash(digest)&&await realpath(filename)===filename);
  await canonicalDirectory(path.dirname(filename));
  const parent=await lstat(path.dirname(filename)),before=await lstat(filename);
  requireValue(parent.isDirectory()&&(parent.mode&0o022)===0&&[0,process.getuid()].includes(parent.uid));
  requireValue(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=MAX_BYTES&&(before.mode&0o022)===0&&[0,process.getuid()].includes(before.uid));
  const f=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const first=await f.stat();requireValue(first.ino===before.ino&&first.dev===before.dev);
    const b=await f.readFile(),after=await f.stat();requireValue(b.length===before.size&&after.size===first.size&&after.mtimeMs===first.mtimeMs&&after.ctimeMs===first.ctimeMs);
    requireValue(createHash('sha256').update(b).digest('hex')===digest);return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
  }finally{await f.close();}
}
function target(v){bag(v,['host','port','database','role','databaseOid','postmasterStart']);requireValue(['host','database','role','postmasterStart'].every(k=>text(v[k]))&&positive(v.port)&&v.port<=65535&&decimal(v.databaseOid)&&v.databaseOid!=='0');}
function binding(v){bag(v,['candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId','restartGeneration','writerCount','physicalVolumes']);bag(v.physicalVolumes,VOLUMES);requireValue(['candidateFingerprint','targetFingerprint','writerTopologyFingerprint','inventoryFingerprint','processInstanceId'].every(k=>text(v[k]))&&Number.isSafeInteger(v.restartGeneration)&&v.restartGeneration>=0&&v.writerCount===1&&VOLUMES.every(k=>text(v.physicalVolumes[k])));}
const LIVE='/run/naijue-rewrite/capacity/live';
const pause=()=>new Promise(resolve=>setTimeout(resolve,2));
/** Fixed pipe exchange; exported only so local tests can exercise actual FIFO framing. */
export async function exchangeFifos(request,{requestFile=LIVE+'/request.fifo',responseFile=LIVE+'/response.fifo',deadline,now=Date.now}={}){
  requireValue(positive(deadline));
  const identity=async(filename,mode)=>{
    const v=await lstat(filename);requireValue(v.isFIFO()&&v.nlink===1&&!v.isSymbolicLink()&&(v.mode&0o777)===mode&&[0,process.getuid()].includes(v.uid));return v;
  };
  const ri=await identity(requestFile,0o620),si=await identity(responseFile,0o640);
  const monotonic=performance.now()+Math.max(0,deadline-now());
  const check=()=>requireValue(now()<deadline&&performance.now()<monotonic);
  let reader,writer;
  try{
    reader=await open(responseFile,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
    const rstat=await reader.stat();requireValue(rstat.dev===si.dev&&rstat.ino===si.ino);
    while(!writer){check();try{writer=await open(requestFile,constants.O_WRONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);}catch(e){requireValue(e.code==='ENXIO');await pause();}}
    const wstat=await writer.stat();requireValue(wstat.dev===ri.dev&&wstat.ino===ri.ino);
    const wire=Buffer.from(JSON.stringify(request)+'\n');requireValue(wire.length<=MAX_BYTES);
    let sent=0;
    while(sent<wire.length){check();try{const {bytesWritten}=await writer.write(wire,sent,wire.length-sent);requireValue(bytesWritten>0);sent+=bytesWritten;}catch(e){requireValue(e.code==='EAGAIN');await pause();}}
    await writer.close();writer=undefined;
    const chunks=[];let length=0,complete=false;
    while(!complete){
      check();const buffer=Buffer.alloc(4096);let count;
      try{count=(await reader.read(buffer,0,buffer.length,null)).bytesRead;}catch(e){requireValue(e.code==='EAGAIN');await pause();continue;}
      if(count===0){requireValue(length===0);await pause();continue;}
      const part=buffer.subarray(0,count);length+=count;requireValue(length<=MAX_BYTES);chunks.push(part);
      if(part.includes(10))complete=true;
    }
    const raw=Buffer.concat(chunks);requireValue(raw[raw.length-1]===10&&raw.subarray(0,-1).indexOf(10)===-1);
    // A second frame/bytes already queued are never ignored.
    const extra=Buffer.alloc(1);try{requireValue((await reader.read(extra,0,1,null)).bytesRead===0);}catch(e){requireValue(e.code==='EAGAIN');}
    const result=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));
    const rf=await identity(requestFile,0o620),sf=await identity(responseFile,0o640);
    requireValue(rf.dev===ri.dev&&rf.ino===ri.ino&&sf.dev===si.dev&&sf.ino===si.ino);check();return result;
  }finally{if(writer)await writer.close();if(reader)await reader.close();}
}
function observerResult(result,request,p,start,finish){
  bag(result,['format','challenge','target','windowToken','binding','producerReviewSha256','collectionStartedAt','collectionFinishedAt','volumes']);
  requireValue(result.format==='CAPACITY_LIVE_RESULT_V1'&&result.challenge===request.challenge&&result.windowToken===request.windowToken&&result.producerReviewSha256===p.reviewSha256&&isDeepStrictEqual(result.target,p.target)&&isDeepStrictEqual(result.binding,p.binding));
  requireValue(positive(result.collectionStartedAt)&&positive(result.collectionFinishedAt)&&result.collectionStartedAt>=start&&result.collectionFinishedAt>=result.collectionStartedAt&&result.collectionFinishedAt<=finish);
  bag(result.volumes,VOLUMES);
  for(const k of VOLUMES){const v=bag(result.volumes[k],['path','physicalVolume','namespace','availableBytes']);requireValue(decimal(v.availableBytes)&&['path','physicalVolume','namespace'].every(n=>v[n]===p.volumes[k][n]));}
  return result;
}
/** Profile is independently owner-mounted, hash selected on argv, never supplied on stdin. */
export async function collectLive(request,{profileFile=PROFILE,profileSha256,now=Date.now}={}){
  bag(request,['format','challenge','target','windowToken','binding','volumes','producerReviewSha256','requestedAt']);
  requireValue(request.format==='CAPACITY_LIVE_REQUEST_V1'&&text(request.challenge)&&text(request.windowToken)&&hash(request.producerReviewSha256)&&positive(request.requestedAt));
  target(request.target);binding(request.binding);bag(request.volumes,VOLUMES);
  const p=await ownerProfile(profileFile,profileSha256);
  const remote=p.profile==='OWNER_QA_FIFO_STATFS_V1';
  bag(p,['schemaVersion','profile','reviewSha256','target','binding','windowToken','startsAt','expiresAt','maxAgeMillis',...(remote?['ipc']:['namespace']),'volumes']);
  requireValue(p.schemaVersion===1&&(p.profile==='OWNER_FIXED_STATFS_V1'||remote)&&hash(p.reviewSha256)&&p.reviewSha256===request.producerReviewSha256&&p.windowToken===request.windowToken);
  target(p.target);binding(p.binding);bag(p.volumes,VOLUMES);
  requireValue(isDeepStrictEqual(p.target,request.target)&&isDeepStrictEqual(p.binding,request.binding));
  requireValue(positive(p.startsAt)&&positive(p.expiresAt)&&p.startsAt<p.expiresAt&&positive(p.maxAgeMillis)&&p.maxAgeMillis<=30000);
  const checkTime=()=>{const at=now();requireValue(positive(at)&&at>=request.requestedAt&&request.requestedAt>=p.startsAt&&at<p.expiresAt&&at-request.requestedAt<p.maxAgeMillis);return at;};
  if(remote){
    bag(p.ipc,['request','response']);requireValue(p.ipc.request===LIVE+'/request.fifo'&&p.ipc.response===LIVE+'/response.fifo'&&p.expiresAt-p.startsAt<=240000);
    const devices=new Map(),physical=new Map();
    for(const k of VOLUMES){
      const v=bag(p.volumes[k],['path','physicalVolume','namespace','device','filesystemType']),supplied=bag(request.volumes[k],['path','physicalVolume','namespace']);
      requireValue(absolute(v.path)&&text(v.namespace)&&text(v.physicalVolume)&&decimal(v.device)&&decimal(v.filesystemType)&&v.physicalVolume===p.binding.physicalVolumes[k]&&['path','physicalVolume','namespace'].every(n=>v[n]===supplied[n]));
      const id=v.namespace+':'+v.device+':'+v.filesystemType;
      requireValue((!devices.has(id)||devices.get(id)===v.physicalVolume)&&(!physical.has(v.physicalVolume)||physical.get(v.physicalVolume)===id));devices.set(id,v.physicalVolume);physical.set(v.physicalVolume,id);
    }
    const start=checkTime();
    const result=await exchangeFifos(request,{deadline:Math.min(p.expiresAt,request.requestedAt+p.maxAgeMillis),now});
    observerResult(result,request,p,start,checkTime());
    requireValue(isDeepStrictEqual(p,await ownerProfile(profileFile,profileSha256)));return result;
  }
  checkTime();requireValue(p.namespace===await mountNamespace());const start=checkTime(),observed={},devices=new Map(),physical=new Map();
  for(const k of VOLUMES){
    const configured=bag(p.volumes[k],['path','physicalVolume','namespace','device','filesystemType']);
    const supplied=bag(request.volumes[k],['path','physicalVolume','namespace']);
    requireValue(absolute(configured.path)&&text(configured.physicalVolume)&&configured.namespace===p.namespace&&decimal(configured.device)&&decimal(configured.filesystemType));
    requireValue(configured.physicalVolume===p.binding.physicalVolumes[k]&&supplied.path===configured.path&&supplied.physicalVolume===configured.physicalVolume&&supplied.namespace===configured.namespace);
    await canonicalDirectory(configured.path);checkTime();
    const handle=await open(configured.path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{
      const before=await handle.stat({bigint:true}),fs=await statfs(configured.path,{bigint:true}),after=await lstat(configured.path,{bigint:true});
      requireValue(before.isDirectory()&&after.isDirectory()&&!after.isSymbolicLink()&&before.dev===after.dev&&before.ino===after.ino&&String(before.dev)===configured.device&&String(fs.type)===configured.filesystemType&&fs.bavail>=0n&&fs.bsize>0n);
      const identity=configured.namespace+':'+configured.device+':'+configured.filesystemType;
      requireValue((!devices.has(identity)||devices.get(identity)===configured.physicalVolume)&&(!physical.has(configured.physicalVolume)||physical.get(configured.physicalVolume)===identity));
      devices.set(identity,configured.physicalVolume);physical.set(configured.physicalVolume,identity);
      observed[k]={...supplied,availableBytes:String(fs.bavail*fs.bsize)};
    }finally{await handle.close();}
    checkTime();
  }
  // Recheck mappings and profile bytes after all native work, refusing replacement.
  requireValue(isDeepStrictEqual(p,await ownerProfile(profileFile,profileSha256)));
  return {format:'CAPACITY_LIVE_RESULT_V1',challenge:request.challenge,target:request.target,windowToken:request.windowToken,binding:request.binding,producerReviewSha256:p.reviewSha256,collectionStartedAt:start,collectionFinishedAt:checkTime(),volumes:observed};
}
async function input(){
  const chunks=[];let length=0;
  for await(const b of process.stdin){length+=b.length;requireValue(length<=MAX_BYTES);chunks.push(b);}
  requireValue(length>0);return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export async function main(args){
  requireValue(args.length===1&&/^--profile=[a-f0-9]{64}$/.test(args[0]));
  return collectLive(await input(),{profileSha256:args[0].slice(10)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  // External941 has its own stricter timeout. This deadline also bounds incomplete stdin.
  const deadline=setTimeout(()=>process.exit(2),30000);
  main(process.argv.slice(2)).then(result=>{clearTimeout(deadline);process.stdout.write(JSON.stringify(result)+'\n');},()=>{clearTimeout(deadline);process.exitCode=2;process.stdin.destroy();});
}
