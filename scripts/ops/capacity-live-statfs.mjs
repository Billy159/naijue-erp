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
/** Profile is independently owner-mounted, hash selected on argv, never supplied on stdin. */
export async function collectLive(request,{profileFile=PROFILE,profileSha256,now=Date.now}={}){
  bag(request,['format','challenge','target','windowToken','binding','volumes','producerReviewSha256','requestedAt']);
  requireValue(request.format==='CAPACITY_LIVE_REQUEST_V1'&&text(request.challenge)&&text(request.windowToken)&&hash(request.producerReviewSha256)&&positive(request.requestedAt));
  target(request.target);binding(request.binding);bag(request.volumes,VOLUMES);
  const p=bag(await ownerProfile(profileFile,profileSha256),['schemaVersion','profile','reviewSha256','target','binding','windowToken','startsAt','expiresAt','maxAgeMillis','namespace','volumes']);
  requireValue(p.schemaVersion===1&&p.profile==='OWNER_FIXED_STATFS_V1'&&hash(p.reviewSha256)&&p.reviewSha256===request.producerReviewSha256&&p.windowToken===request.windowToken);
  target(p.target);binding(p.binding);bag(p.volumes,VOLUMES);
  requireValue(isDeepStrictEqual(p.target,request.target)&&isDeepStrictEqual(p.binding,request.binding));
  requireValue(positive(p.startsAt)&&positive(p.expiresAt)&&p.startsAt<p.expiresAt&&positive(p.maxAgeMillis)&&p.maxAgeMillis<=30000);
  const checkTime=()=>{const at=now();requireValue(positive(at)&&at>=request.requestedAt&&request.requestedAt>=p.startsAt&&at<p.expiresAt&&at-request.requestedAt<p.maxAgeMillis);return at;};
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
