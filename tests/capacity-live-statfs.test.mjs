import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,mkdir,writeFile,chmod,lstat,statfs,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectLive,mountNamespace} from '../scripts/ops/capacity-live-statfs.mjs';
const keys=['postgres','wal','backup','system','media'];
const moduleUrl=new URL('../scripts/ops/capacity-live-statfs.mjs',import.meta.url).href;
async function fixture(){
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'capacity-live-')));await chmod(root,0o700);
  const directory=path.join(root,'visible');await mkdir(directory);const st=await lstat(directory,{bigint:true}),fs=await statfs(directory,{bigint:true}),namespace=await mountNamespace(),at=Date.now();
  const target={host:'synthetic',port:5432,database:'synthetic',role:'synthetic',databaseOid:'1',postmasterStart:'synthetic'};
  const binding={candidateFingerprint:'a'.repeat(40),targetFingerprint:'synthetic',writerTopologyFingerprint:'single',inventoryFingerprint:'synthetic',processInstanceId:'synthetic',restartGeneration:0,writerCount:1,physicalVolumes:Object.fromEntries(keys.map(k=>[k,'one-volume']))};
  const volumes=Object.fromEntries(keys.map(k=>[k,{path:directory,physicalVolume:'one-volume',namespace}]));
  const profile={schemaVersion:1,profile:'OWNER_FIXED_STATFS_V1',reviewSha256:'b'.repeat(64),target,binding,windowToken:'synthetic-window',startsAt:at-1000,expiresAt:at+60000,maxAgeMillis:30000,namespace,
    volumes:Object.fromEntries(keys.map(k=>[k,{...volumes[k],device:String(st.dev),filesystemType:String(fs.type)}]))};
  const file=path.join(root,'profile.json');
  const save=async()=>{const bytes=JSON.stringify(profile);await writeFile(file,bytes,{mode:0o600});return createHash('sha256').update(bytes).digest('hex');};
  const digest=await save();const request={format:'CAPACITY_LIVE_REQUEST_V1',challenge:'synthetic-challenge',target,windowToken:'synthetic-window',binding,volumes,producerReviewSha256:'b'.repeat(64),requestedAt:at};
  return {root,directory,file,profile,request,digest,save};
}
async function child(args,input,timeout=3000){
  return new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{env:{},stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill('SIGKILL');},timeout);
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.stdin.on('error',()=>{});p.on('error',reject);p.once('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,out,err});});p.stdin.end(input);});
}
test('actual dedicated collector observes five real directories under protected independent profile',async()=>{
  const f=await fixture();try{
    const script=`import {collectLive} from ${JSON.stringify(moduleUrl)};let b='';for await(const c of process.stdin)b+=c;const x=await collectLive(JSON.parse(b),{profileFile:${JSON.stringify(f.file)},profileSha256:${JSON.stringify(f.digest)}});process.stdout.write(JSON.stringify(x));`;
    const result=await child(['--input-type=module','-e',script],JSON.stringify(f.request));assert.equal(result.code,0,result.err);
    const x=JSON.parse(result.out);assert.equal(x.format,'CAPACITY_LIVE_RESULT_V1');assert.equal(x.challenge,f.request.challenge);assert.ok(x.collectionStartedAt>=f.request.requestedAt);
    for(const k of keys){assert.deepEqual({...x.volumes[k],availableBytes:undefined},{...f.request.volumes[k],availableBytes:undefined});assert.match(x.volumes[k].availableBytes,/^\d+$/);}
    assert.equal(new Set(keys.map(k=>x.volumes[k].physicalVolume)).size,1); // shared physical space, never summed
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('request cannot choose its own device/profile, namespace, approval or invisible mapping',async()=>{
  const f=await fixture();try{
    const run=(request=f.request,digest=f.digest)=>collectLive(request,{profileFile:f.file,profileSha256:digest});
    const edits=[r=>r.volumes.postgres.path='/definitely-not-visible',r=>r.volumes.wal.physicalVolume='request-fsid',r=>r.volumes.backup.namespace='other',r=>r.binding.writerCount=2,r=>r.producerReviewSha256='c'.repeat(64),r=>r.requestedAt=1,r=>r.extra=true];
    for(const edit of edits){const r=structuredClone(f.request);edit(r);await assert.rejects(run(r));}
    await assert.rejects(run(f.request,'0'.repeat(64)));
    f.profile.volumes.postgres.device='999999999999';await assert.rejects(run(f.request,await f.save()));
    f.profile.volumes.postgres.device=f.profile.volumes.wal.device;f.profile.expiresAt=Date.now()-1;await assert.rejects(run(f.request,await f.save()));
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('owner profile path/device checks reject missing directories, aliases and writable profile',async()=>{
  const f=await fixture();try{
    const link=path.join(f.root,'alias');await symlink(f.directory,link);f.profile.volumes.postgres.path=link;f.request.volumes.postgres.path=link;
    await assert.rejects(collectLive(f.request,{profileFile:f.file,profileSha256:await f.save()}));
    f.profile.volumes.postgres.path=path.join(f.root,'missing');f.request.volumes.postgres.path=f.profile.volumes.postgres.path;
    await assert.rejects(collectLive(f.request,{profileFile:f.file,profileSha256:await f.save()}));
    const digest=await f.save();await chmod(f.file,0o666);await assert.rejects(collectLive(f.request,{profileFile:f.file,profileSha256:digest}));
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('actual CLI rejects arbitrary profile, oversized/truncated input and finishes child without output',async()=>{
  const file=fileURLToPath(new URL('../scripts/ops/capacity-live-statfs.mjs',import.meta.url));
  for(const [args,input]of [[[], '{}'],[['--profile=arbitrary'],'{}'],[['--profile='+'a'.repeat(64)],'x'.repeat(65537)],[['--profile='+'a'.repeat(64)],'{']]){
    const result=await child([file,...args],input);assert.equal(result.code,2);assert.equal(result.out,'');assert.equal(result.err,'');assert.equal(result.signal,null);
  }
});
