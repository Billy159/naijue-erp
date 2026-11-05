/** H06 protocol only. Virtual filesystem and scripted PG; no real DELETE/unlink/GC. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { sid } from './support/synthetic-fixtures.ts';
const api = await import(pathToFileURL(path.resolve('scripts/ops/resource-reclaim.mjs')).href);
const sha=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');
const account=sid('account',41001), upload=sid('product',41002), cut='2026-10-29T00:00:00.000Z';
type Session={token_hash:string;revoked:boolean;expired:boolean};
function config(resource='sessions'):any { return {resource,cutoff:cut,postgres:{target:{database:'demo_8877_h06_protocol',user:'qa'},acquisitionTimeoutMillis:10,queryTimeoutMillis:10,statementTimeoutMillis:10,disposeTimeoutMillis:10},
 expected:{database:'demo_8877_h06_protocol',role:'qa',databaseOid:'123',postmasterStart:'SYNTHETIC'},limits:{maxCandidates:2,maxRows:20,maxBytes:65536,maxDurationMillis:10000},accountIds:[account]}; }
const row=(n:number,revoked=true,expired=true):Session=>({token_hash:sha('SYNTHETIC_TOKEN_HASH_'+n),revoked,expired});
function db(seed:Session[]=[]){let rows=structuredClone(seed),before:Session[]=[];let readOnly=true,refs={current_ref:false,history_ref:false,receipt_ref:false,source_ref:false};
 const calls:{sql:string;values:any[]}[]=[],releases:unknown[]=[];let afterDelete:(()=>void)|undefined,unknown=false,wrong=false,zero=false;
 const client={async query(sql:string,values:any[]=[]){calls.push({sql,values});let output:any[]=[];
  if(sql.startsWith('BEGIN')){before=structuredClone(rows);readOnly=sql.endsWith('READ ONLY');}
  else if(sql===api.RECLAIM_IDENTITY_SQL)output=[{...config().expected,database_oid:wrong?'999':'123',postmaster_start:'SYNTHETIC',observed_at:cut,read_only:readOnly?'on':'off'}];
  else if(sql.startsWith(api.SESSION_ACCOUNT_SQL))output=[{id:values[0]}];
  else if(sql.startsWith(api.SESSION_ROWS_SQL))output=structuredClone(rows).sort((a,b)=>a.token_hash.localeCompare(b.token_hash));
  else if(sql===api.SESSION_DELETE_SQL){assert.equal(readOnly,false);const n=rows.length;rows=rows.filter(r=>!values[1].includes(r.token_hash));afterDelete?.();return {rows:[],rowCount:zero?0:n-rows.length};}
  else if(sql===api.MEDIA_REFERENCES_SQL)output=[{...refs}];
  else if(sql==='ROLLBACK')rows=structuredClone(before);
  else if(sql==='COMMIT'){if(unknown)throw Error('SYNTHETIC_COMMIT_CONNECTION_LOST');}
  else throw Error('Unexpected synthetic SQL');
  return {rows:output,rowCount:output.length};},release(error?:unknown){releases.push(error);}};
 return {pool:{async connect(){return client;}},calls,releases,rows:()=>rows,refs,replace:(x:Session[])=>{rows=structuredClone(x);},wrong(){wrong=true;},zero(){zero=true;},unknown(){unknown=true;},afterDelete(fn:()=>void){afterDelete=fn;}};
}
async function approved(c:any,f:any,extra:any={}){const preview=await api.reclaimResources(c,{pool:f.pool,...extra});assert.equal(preview.status,'DRY_RUN');return {...c,approval:{scope:'ISOLATED',id:'SYNTHETIC_APPROVAL_NOT_ACTUAL_AUTHORIZATION',planHash:preview.planHash}};}

test('H06 session preview/apply preserves every original any-session and unrevoked-session existence predicate',async()=>{
 for(const seed of [[],[row(1)],[row(1),row(2)],[row(1,false,true),row(2),row(3)],[row(1,true,false),row(2),row(3,false,false)]]){
  const c=config(),f=db(seed),p=await approved(c,f);assert.deepEqual(f.rows(),seed);assert.ok(!f.calls.some(x=>x.sql===api.SESSION_DELETE_SQL));
  const result=await api.reclaimResources(p,{pool:f.pool,mode:'apply-isolated'});assert.equal(result.status,'APPLIED');
  assert.equal(f.rows().length>0,seed.length>0,'bootstrap EXISTS preserved');assert.equal(f.rows().some(x=>!x.revoked),seed.some(x=>!x.revoked),'account/staff unrevoked EXISTS preserved');
  assert.ok(seed.filter(x=>!x.revoked||!x.expired).every(x=>f.rows().some(y=>y.token_hash===x.token_hash)));
  const text=JSON.stringify(result);for(const x of seed)assert.ok(!text.includes(x.token_hash),'No session hashes in output');
 }
});
test('H06 session missing approval, target/cutoff/bounds or changed fixed plan cannot delete',async()=>{
 const c=config(),f=db([row(1),row(2)]);await assert.rejects(()=>api.reclaimResources(c,{pool:f.pool,mode:'apply-isolated'}),/ISOLATED_APPROVAL_REQUIRED/);
 const p=await approved(c,f);f.replace([row(1,false,true),row(2,false,true)]);assert.equal((await api.reclaimResources(p,{pool:f.pool,mode:'apply-isolated'})).reason,'APPROVED_PLAN_CHANGED');
 const g=db([row(1),row(2)]);g.wrong();assert.equal((await api.reclaimResources(c,{pool:g.pool})).status,'REFUSED');
 const h=db([row(1),row(2)]);assert.equal((await api.reclaimResources({...c,limits:{...c.limits,maxRows:1}},{pool:h.pool})).status,'REFUSED');
 assert.equal((await api.reclaimResources({...c,cutoff:'2026-10-30T00:00:00.000Z'},{pool:h.pool})).status,'REFUSED');
 assert.ok(![...f.calls,...g.calls,...h.calls].some(x=>x.sql===api.SESSION_DELETE_SQL));
});
test('H06 session cancellation/count mismatch rolls back, unknown COMMIT is not retried or claimed rolled back',async()=>{
 for(const kind of ['cancel','count','commit']){const seed=[row(1),row(2),row(3)],f=db(seed),p=await approved(config(),f),abort=new AbortController();
  if(kind==='cancel')f.afterDelete(()=>abort.abort());if(kind==='count')f.zero();if(kind==='commit')f.unknown();
  const start=f.calls.length,r=await api.reclaimResources(p,{pool:f.pool,mode:'apply-isolated',signal:abort.signal}),calls=f.calls.slice(start);
  if(kind==='commit'){assert.equal(r.status,'OUTCOME_UNKNOWN');assert.equal(r.mutations,null);assert.equal(calls.filter(x=>x.sql==='COMMIT').length,1);assert.ok(!calls.some(x=>x.sql==='ROLLBACK'));assert.ok(f.releases.at(-1) instanceof Error);}
  else{assert.equal(r.status,'REFUSED');assert.deepEqual(f.rows(),seed);assert.ok(calls.some(x=>x.sql==='ROLLBACK'));assert.ok(!calls.some(x=>x.sql==='COMMIT'));}
 }
});

type Entry={kind:'file'|'directory'|'symlink';bytes:Buffer;ino:number;nlink:number};
function virtualMedia(){const map=new Map<string,Entry>(),removed:string[]=[],dirs=['/','/public','/private','/private/media','/private/media/stages',`/private/media/stages/${upload}`,'/private/media/keys','/recovery','/recovery/stages',`/recovery/stages/${upload}`];let ino=1,handles=0,afterUnlink:(()=>void)|undefined;
 const put=(name:string,bytes:Buffer|string,kind:Entry['kind']='file')=>map.set(name,{kind,bytes:Buffer.from(bytes),ino:ino++,nlink:1});for(const d of dirs)put(d,'','directory');
 const original=Buffer.from('SYNTHETIC_ORIGINAL'),thumbnail=Buffer.from('SYNTHETIC_THUMB');
 const m:any={format:'PRIVATE_PRODUCT_MEDIA_STAGE_V1',codecProfile:'SHARP_0_35_5_FULL_DECODE_V1',uploadId:upload,fileRef:`staged-product-media:${upload}`,actorAccountId:account,productId:null,commandKey:'SYNTHETIC_COMMAND',uploadKey:'SYNTHETIC_UPLOAD',createdAt:'2026-10-27T00:00:00.000Z',expiresAt:'2026-10-28T00:00:00.000Z',
 original:{mime:'image/png',byteSize:String(original.length),sha256:sha(original)},thumbnail:{mime:'image/webp',byteSize:String(thumbnail.length),sha256:sha(thumbnail),derivedFromOriginalSha256:sha(original)}};
 // Read actual exported profile; keep this fixture independent of implementation's record parser.
 const stat=(x:Entry)=>({isFile:()=>x.kind==='file',isDirectory:()=>x.kind==='directory',isSymbolicLink:()=>x.kind==='symlink',mode:x.kind==='directory'?0o700:0o600,uid:process.getuid?.()??0,dev:1,ino:x.ino,nlink:x.nlink,size:x.bytes.length,mtimeMs:1,ctimeMs:1});
 const get=(name:string)=>{const x=map.get(name);if(!x)throw Error('SYNTHETIC_MISSING');return x;};
 const io={async lstat(name:string){return stat(get(name));},async realpath(name:string){get(name);return name;},async open(name:string){const x=get(name);handles++;return {async stat(){return stat(x);},async read(dest:Buffer,offset:number,length:number,position:number){const n=Math.max(0,Math.min(length,x.bytes.length-position));x.bytes.copy(dest,offset,position,position+n);return {bytesRead:n};},async close(){handles--;}};},
 async opendir(name:string){get(name);handles++;const children=[...map.keys()].filter(k=>path.dirname(k)===name&&k!==name).map(k=>({name:path.basename(k),isFile:()=>get(k).kind==='file',isSymbolicLink:()=>get(k).kind==='symlink'}));let index=0;return {async read(){return children[index++]??null;},async close(){handles--;}};},
 async unlink(name:string){get(name);removed.push(name);map.delete(name);afterUnlink?.();},async rmdir(name:string){assert.ok(![...map.keys()].some(k=>path.dirname(k)===name));get(name);removed.push(name);map.delete(name);}};
 const install=()=>{for(const [name,b] of [['manifest.json',Buffer.from(JSON.stringify(m))],['original.bin',original],['thumbnail.webp',thumbnail]] as const){put(`/private/media/stages/${upload}/${name}`,b);put(`/recovery/stages/${upload}/${name}`,b);}};
 install();const c=config('media');c.media={root:'/private/media',publicRoots:['/public'],recoveryRoot:'/recovery',candidates:[{uploadId:upload,manifestSha256:sha(JSON.stringify(m))}]};
 return {c,io,map,removed,m,put,install,handles:()=>handles,afterUnlink(fn:()=>void){afterUnlink=fn;}};
}
const fence=async (_target:unknown,work:any)=>work({async assertHeld(){},async assertRecoverySettled(){}});
test('H06 media default preview reads real reference query; apply needs actual fence, exact plan and verified separate recovery bytes',async()=>{
 const v=virtualMedia(),f=db(),preview=await api.reclaimResources(v.c,{pool:f.pool,io:v.io});assert.equal(preview.status,'DRY_RUN',JSON.stringify(preview));assert.equal(v.removed.length,0);
 const c={...v.c,approval:{scope:'ISOLATED',id:'SYNTHETIC_ONLY',planHash:preview.planHash}};
 assert.equal((await api.reclaimResources(c,{pool:f.pool,io:v.io,mode:'apply-isolated'})).reason,'REAL_OFFLINE_FENCE_UNAVAILABLE');
 const good=await api.reclaimResources(c,{pool:f.pool,io:v.io,mode:'apply-isolated',withOfflineFence:fence});assert.equal(good.status,'APPLIED',JSON.stringify(good));assert.equal(v.removed.length,4);assert.ok(f.calls.filter(x=>x.sql===api.MEDIA_REFERENCES_SQL).length>=3);assert.equal(v.handles(),0);assert.ok(v.map.has(`/recovery/stages/${upload}/original.bin`));
});
test('H06 media current/history/receipt/source refs, original upload key, links and missing metadata all KEEP with no deletion',async()=>{
 for(const kind of ['current_ref','history_ref','receipt_ref','source_ref','key','hardlink','manifest','backup','fence','recovery'] as const){const v=virtualMedia(),f=db();const c=await approved(v.c,f,{io:v.io});
  if(kind.endsWith('_ref'))(f.refs as any)[kind]=true;
  if(kind==='key'){const k={...v.m};v.put('/private/media/keys/'+sha(JSON.stringify([k.actorAccountId,k.commandKey,k.uploadKey]))+'.json',JSON.stringify(k));}
  if(kind==='hardlink')v.map.get(`/private/media/stages/${upload}/manifest.json`)!.nlink=2;
  if(kind==='manifest')v.map.delete(`/private/media/stages/${upload}/manifest.json`);
  if(kind==='backup')v.map.delete(`/recovery/stages/${upload}/thumbnail.webp`);
  const r=await api.reclaimResources(c,{pool:f.pool,io:v.io,mode:'apply-isolated',withOfflineFence:kind==='fence'?async()=>true:kind==='recovery'?async (_:unknown,work:any)=>work({async assertHeld(){},async assertRecoverySettled(){throw Error('SYNTHETIC_UNKNOWN_COMMIT');}}):fence});
  assert.equal(r.status,'REFUSED',kind);assert.equal(v.removed.length,0,kind);assert.equal(v.handles(),0,kind);
 }
});
test('H06 media final reference recheck closes preview race; cancellation after partial deletion requires verified backup restoration',async()=>{
 const v=virtualMedia(),f=db(),c=await approved(v.c,f,{io:v.io});let checks=0;const raw=f.pool.connect;const client=await raw();const query=client.query.bind(client);client.query=async(sql:string,values:any[]=[])=>{if(sql===api.MEDIA_REFERENCES_SQL&&++checks===2)f.refs.history_ref=true;return query(sql,values);};
 assert.equal((await api.reclaimResources(c,{pool:f.pool,io:v.io,mode:'apply-isolated',withOfflineFence:fence})).status,'REFUSED');assert.equal(v.removed.length,0);
 const w=virtualMedia(),g=db(),p=await approved(w.c,g,{io:w.io}),abort=new AbortController();w.afterUnlink(()=>abort.abort());
 const result=await api.reclaimResources(p,{pool:g.pool,io:w.io,mode:'apply-isolated',withOfflineFence:fence,signal:abort.signal});assert.equal(result.status,'RESTORE_REQUIRED');assert.equal(w.removed.length,1);assert.equal(w.handles(),0);
 for(const name of ['manifest.json','original.bin','thumbnail.webp'])assert.ok(w.map.has(`/recovery/stages/${upload}/${name}`),'Recovery bytes must survive partial cancellation');
 // Explicit operator recovery in the virtual fixture only; no production restore is invoked or claimed.
 w.install();assert.ok(w.map.has(`/private/media/stages/${upload}/manifest.json`));
});
test('QB907-F01 media recovery files cannot alias any deletion candidate inode, including another candidate',async()=>{
 for(const crossCandidate of [false,true]){
  const v=virtualMedia(),f=db();let sourceUpload=upload;
  if(crossCandidate){
   sourceUpload=sid('product',41003);const m={...v.m,uploadId:sourceUpload,fileRef:`staged-product-media:${sourceUpload}`};
   v.put(`/private/media/stages/${sourceUpload}`,'','directory');v.put(`/recovery/stages/${sourceUpload}`,'','directory');
   for(const name of ['manifest.json','original.bin','thumbnail.webp']){
    const bytes=name==='manifest.json'?Buffer.from(JSON.stringify(m)):v.map.get(`/private/media/stages/${upload}/${name}`)!.bytes;
    v.put(`/private/media/stages/${sourceUpload}/${name}`,bytes);v.put(`/recovery/stages/${sourceUpload}/${name}`,bytes);
   }
   v.c.media.candidates.push({uploadId:sourceUpload,manifestSha256:sha(JSON.stringify(m))});
  }
  // Bind-mount aliases may report canonical distinct paths and nlink1, yet one physical inode.
  const alias=`/recovery/stages/${upload}/original.bin`,source=`/private/media/stages/${sourceUpload}/original.bin`;
  v.map.set(alias,v.map.get(source)!);const unlink=v.io.unlink.bind(v.io);
  v.io.unlink=async name=>{const inode=v.map.get(name);await unlink(name);for(const [p,entry] of [...v.map])if(entry===inode)v.map.delete(p);};
  const c=await approved(v.c,f,{io:v.io});
  const result=await api.reclaimResources(c,{pool:f.pool,io:v.io,mode:'apply-isolated',withOfflineFence:fence});
  assert.equal(result.status,'REFUSED',crossCandidate?'Cross-candidate backup alias':'Same-candidate backup alias');
  assert.equal(v.removed.length,0,'Reject every alias before the first unlink');assert.equal(v.handles(),0);
  assert.ok(v.map.has(alias)&&v.map.has(source),'Both source and supposed backup survive refusal');
 }
});
