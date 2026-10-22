/** Source-only bounded consumer of independently reviewed byte offsets.
 * Every emitted raw line is original UTF-8 evidence. No UUID/native/SQL authority. */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {isAbsolute,resolve,dirname} from 'node:path';
const ENTITIES=Object.freeze(['SKU','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','INVENTORY_BASELINE','SALES_LINE','SETTLEMENT','TRANSFER_LINE']);
const ALL_ENTITIES=Object.freeze(['BARCODE','CUSTOMER','HALL','INVENTORY_BASELINE','ISSUE','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','SALES_HEADER','SALES_LINE','SETTLEMENT','SKU','STAFF','SUPPLIER','TRANSFER_HEADER','TRANSFER_LINE','WAREHOUSE']);
const digest=b=>createHash('sha256').update(b).digest('hex');
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const count=v=>Number.isSafeInteger(v)&&v>=0;
const decode=b=>new TextDecoder('utf8',{fatal:true}).decode(b);
async function regular(path){must(typeof path==='string'&&isAbsolute(path),'OFFSET_SOURCE_ABSOLUTE_PATH');let p=resolve(path),first=true;for(;;){const s=await lstat(p);must(!s.isSymbolicLink()&&(first?s.isFile():s.isDirectory()),'OFFSET_SOURCE_REGULAR_PATH');first=false;const parent=dirname(p);if(parent===p)return;p=parent;}}
/** Exactly eight supported source kinds; entities is a finite nonempty subset.
 * The C review and its outside SHA are mandatory even for one-row consumers. */
export async function openReviewedMaterializedSource(options){
 const keys=['indexManifestFile','trustedIndexManifestSha256','reviewFile','trustedReviewSha256','binding','entities'];
 must(exact(options,keys),'OFFSET_SOURCE_OPTIONS');const o=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(options,k).value]));
 must(hash(o.trustedIndexManifestSha256)&&hash(o.trustedReviewSha256),'OFFSET_SOURCE_OUTSIDE_PIN_REQUIRED');
 must(exact(o.binding,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256']),'OFFSET_SOURCE_BINDING');const binding={...o.binding};
 must(uuid(binding.batchId)&&typeof binding.fixedSourceNamespace==='string'&&binding.fixedSourceNamespace.length>0&&hash(binding.selectionSha256)
  &&typeof binding.cutoffAt==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(binding.cutoffAt)&&Number.isFinite(Date.parse(binding.cutoffAt)),'OFFSET_SOURCE_BINDING');
 const group=o.entities;must(Array.isArray(group)&&Object.getPrototypeOf(group)===Array.prototype&&group.length>0&&group.length<=ENTITIES.length
  &&Reflect.ownKeys(group).length===group.length+1,'OFFSET_SOURCE_ENTITIES');const entities=[];
 for(let i=0;i<group.length;i++){const d=Object.getOwnPropertyDescriptor(group,String(i));must(d?.enumerable&&Object.hasOwn(d,'value')&&ENTITIES.includes(d.value)&&!entities.includes(d.value),'OFFSET_SOURCE_ENTITIES');entities.push(d.value);}
 const files=[],indices=new Map();let closed=false,busy=false,source;
 const active=()=>must(!closed,'OFFSET_SOURCE_CLOSED');
 async function close(){closed=true;for(const f of files)try{await f.fd.close();}catch{}files.length=0;indices.clear();}
 async function file(path,expectedBytes,limit){await regular(path);const before=await lstat(path);must(count(before.size)&&before.size>0&&before.size<=limit&&(expectedBytes===null||before.size===expectedBytes),'OFFSET_SOURCE_FILE_BOUND');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),entry={path:resolve(path),stat:before,fd};files.push(entry);must(same(before,await fd.stat())&&same(before,await lstat(path)),'OFFSET_SOURCE_FILE_CHANGED');return entry;}
 async function pinned(path,pin,expectedBytes,limit){must(hash(pin),'OFFSET_SOURCE_OUTSIDE_PIN_REQUIRED');const f=await file(path,expectedBytes,limit),bytes=await f.fd.readFile();must(bytes.length===f.stat.size&&digest(bytes)===pin&&same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'OFFSET_SOURCE_FILE_CHANGED');return {entry:f,bytes};}
 async function verify(){active();for(const f of files){await regular(f.path);must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'OFFSET_SOURCE_FILE_CHANGED');}active();}
 try{
  const reviewFile=await pinned(o.reviewFile,o.trustedReviewSha256,null,4194304),a=JSON.parse(decode(reviewFile.bytes));
  must(exact(a,['version','decision','binding','indexManifest','source','scope','independentReview','realImportExecutionAuthorized'])
   &&a.version==='C_MATERIALIZED_SOURCE_OFFSET_INDEX_REVIEW_V1'&&a.decision==='ACCEPT_EXACT_SOURCE_OFFSET_BINDINGS'
   &&exact(a.binding,Object.keys(binding))&&Object.keys(binding).every(k=>a.binding[k]===binding[k])&&a.scope==='OFFSET_ROWS_ONLY'&&a.realImportExecutionAuthorized===false,'OFFSET_SOURCE_REVIEW');
  must(exact(a.indexManifest,['path','sha256','bytes'])&&a.indexManifest.path===o.indexManifestFile&&a.indexManifest.sha256===o.trustedIndexManifestSha256
   &&count(a.indexManifest.bytes)&&a.indexManifest.bytes>0&&exact(a.independentReview,['path','sha256','result'])&&a.independentReview.result==='PASS','OFFSET_SOURCE_REVIEW_BINDING');
  const qb=JSON.parse(decode((await pinned(a.independentReview.path,a.independentReview.sha256,null,4194304)).bytes));
  must(qb&&Object.getPrototypeOf(qb)===Object.prototype&&Object.getOwnPropertyDescriptor(qb,'result')?.value==='PASS','OFFSET_SOURCE_QB_RESULT');
  const manifestFile=await pinned(o.indexManifestFile,o.trustedIndexManifestSha256,a.indexManifest.bytes,4194304),m=JSON.parse(decode(manifestFile.bytes));
  must(exact(m,['version','status','source','manifest','indexRows','indexBytes','expectedEntityCounts','observedEntityCounts','artifacts','offsetEncoding','scannedOriginalWorkbooks','scannedVerifiedHeaderGzip','nativeUUIDsAllocated','sql','importAuthorized'])
   &&m.version==='MATERIALIZED_SOURCE_OFFSET_INDEX_CANDIDATE_V1'&&m.status==='COMPLETE_PINNED_SOURCE_INDEX_NOT_NATIVE_AUTHORITY'
   &&m.offsetEncoding==='UTF8_BYTE_OFFSET_LENGTH_EXCLUDES_LF_RETAINS_CR_V1'&&m.scannedOriginalWorkbooks===false&&m.scannedVerifiedHeaderGzip===false
   &&m.nativeUUIDsAllocated===0&&m.sql===false&&m.importAuthorized===false,'OFFSET_SOURCE_MANIFEST');
  must(exact(m.source,['path','bytes','sha256','rows'])&&exact(a.source,['path','bytes','sha256','rows'])&&Object.keys(m.source).every(k=>a.source[k]===m.source[k])
   &&hash(m.source.sha256)&&count(m.source.bytes)&&m.source.bytes>0&&m.source.bytes<=536870912&&count(m.source.rows)&&m.source.rows>0&&m.source.rows<=1000000,'OFFSET_SOURCE_REVIEW_SOURCE');
  must(exact(m.expectedEntityCounts,ALL_ENTITIES)&&exact(m.observedEntityCounts,ALL_ENTITIES)&&ALL_ENTITIES.every(e=>count(m.expectedEntityCounts[e])&&m.expectedEntityCounts[e]===m.observedEntityCounts[e]),'OFFSET_SOURCE_COUNTS');
  must(Object.values(m.expectedEntityCounts).reduce((a,b)=>a+b,0)===m.source.rows&&Array.isArray(m.artifacts)&&m.artifacts.length===ENTITIES.length,'OFFSET_SOURCE_COUNTS');
  const artifacts=new Map();for(const f of m.artifacts){must(exact(f,['entity','path','rows','bytes','sha256'])&&ENTITIES.includes(f.entity)&&!artifacts.has(f.entity)
   &&count(f.rows)&&f.rows===m.expectedEntityCounts[f.entity]&&count(f.bytes)&&f.bytes>0&&f.bytes<=134217728&&hash(f.sha256)&&typeof f.path==='string'&&isAbsolute(f.path),'OFFSET_SOURCE_ARTIFACT');artifacts.set(f.entity,f);}
  must(count(m.indexRows)&&count(m.indexBytes)&&m.indexBytes<=268435456&&[...artifacts.values()].reduce((s,f)=>s+f.rows,0)===m.indexRows&&[...artifacts.values()].reduce((s,f)=>s+f.bytes,0)===m.indexBytes,'OFFSET_SOURCE_COUNTS');
  must(entities.reduce((s,e)=>s+artifacts.get(e).bytes,0)<=134217728&&entities.reduce((s,e)=>s+artifacts.get(e).rows,0)<=300000,'OFFSET_SOURCE_SELECTED_BOUND');
  must(exact(m.manifest,['path','sha256']),'OFFSET_SOURCE_ORIGINAL_MANIFEST');
  const original=JSON.parse(decode((await pinned(m.manifest.path,m.manifest.sha256,null,4194304)).bytes));
  must(Array.isArray(original.payloadFiles)&&original.sourceInputSha256&&Object.getPrototypeOf(original.sourceInputSha256)===Object.prototype,'OFFSET_SOURCE_ORIGINAL_MANIFEST');
  const snapshots=original.payloadFiles.filter(f=>f.file==='snapshots/all-business-source-rows.jsonl');must(snapshots.length===1&&snapshots[0].sha256===m.source.sha256&&snapshots[0].bytes===m.source.bytes
   &&resolve(dirname(m.manifest.path),snapshots[0].file)===m.source.path,'OFFSET_SOURCE_ORIGINAL_MANIFEST');
  // The original source was fully hashed by the reviewed index builder. Only its
  // bounded selected rows are read here; each raw line must match its pinned SHA.
  source=await file(m.source.path,m.source.bytes,536870912);
  function parseIndex(bytes,entity){let start=0,rows=0,previousEnd=-1;const result=[];
   while(start<bytes.length){const end=bytes.indexOf(10,start);must(end>=0&&end>start&&end-start<=1048576,'OFFSET_SOURCE_INDEX_LINE');const v=JSON.parse(decode(bytes.subarray(start,end)));start=end+1;
    must(exact(v,['entity','sourceKey','sourceLocator','identityKind','offset','length','sha256'])&&v.entity===entity&&typeof v.sourceKey==='string'&&v.sourceKey.length<=65536
     &&(v.sourceKey.length>0||entity==='PAYMENT_ACCOUNT_HALL')&&v.identityKind===(v.sourceKey===''?'ORIGINAL_LOCATOR_ONLY':'ORIGINAL_SOURCE_KEY_AND_LOCATOR')
     &&exact(v.sourceLocator,['file','sheet','row','sourceSha256'])&&typeof v.sourceLocator.file==='string'&&typeof v.sourceLocator.sheet==='string'
     &&Number.isSafeInteger(v.sourceLocator.row)&&v.sourceLocator.row>0&&hash(v.sourceLocator.sourceSha256)&&original.sourceInputSha256[v.sourceLocator.file]===v.sourceLocator.sourceSha256
     &&count(v.offset)&&Number.isSafeInteger(v.length)&&v.length>0&&v.length<=4194304&&Number.isSafeInteger(v.offset+v.length)&&v.offset+v.length<=m.source.bytes&&v.offset>previousEnd&&hash(v.sha256),'OFFSET_SOURCE_INDEX_ROW');
    previousEnd=v.offset+v.length;rows++;must(rows<=artifacts.get(entity).rows,'OFFSET_SOURCE_INDEX_COUNT');result.push(v);}
   must(rows===artifacts.get(entity).rows,'OFFSET_SOURCE_INDEX_COUNT');return result;
  }
  // Open and validate only requested indices. Full index bytes are consumed once;
  // their parsed rows are immutable inside this reader, preventing index swaps
  // during a source iterator from substituting an unreviewed raw-row hash.
  for(const entity of entities){const f=artifacts.get(entity),loaded=await pinned(f.path,f.sha256,f.bytes,134217728);indices.set(entity,parseIndex(loaded.bytes,entity));}
  await verify();
  async function readAt(position,length){const b=Buffer.allocUnsafe(length);let n=0;while(n<length){active();const result=await source.fd.read(b,n,length-n,position+n);must(result.bytesRead>0,'OFFSET_SOURCE_SHORT_READ');n+=result.bytesRead;}return b;}
  return {report:Object.freeze({kind:'REVIEWED_MATERIALIZED_OFFSET_SOURCE_V1',entities:Object.freeze([...entities]),rows:entities.reduce((s,e)=>s+artifacts.get(e).rows,0),sourceSha256:m.source.sha256,noFullSnapshotScan:true,noSql:true,nativeReferenceAuthority:false}),verify,
   async *chunks(entity,chunkRows=100){active();must(indices.has(entity),'OFFSET_SOURCE_ENTITY_NOT_OPEN');must(Number.isSafeInteger(chunkRows)&&chunkRows>0&&chunkRows<=1000,'OFFSET_SOURCE_CHUNK_BOUND');must(!busy,'OFFSET_SOURCE_SERIAL_ONLY');busy=true;
    try{await verify();const selected=indices.get(entity);let chunk=[],chunkBytes=0;
     for(const entry of selected){active();const bytes=await readAt(entry.offset,entry.length);must(digest(bytes)===entry.sha256,'OFFSET_SOURCE_RAW_CHANGED');
      if(entry.offset>0)must((await readAt(entry.offset-1,1))[0]===10,'OFFSET_SOURCE_LINE_BOUNDARY');if(entry.offset+entry.length<m.source.bytes)must((await readAt(entry.offset+entry.length,1))[0]===10,'OFFSET_SOURCE_LINE_BOUNDARY');
      const rawLine=decode(bytes),raw=JSON.parse(rawLine),l=entry.sourceLocator;
      must(exact(raw,['entity','sourceId','file','sheet','row','sourceSha256','data'])&&raw.entity===entity&&raw.sourceId===entry.sourceKey&&raw.file===l.file&&raw.sheet===l.sheet&&raw.row===l.row
       &&raw.sourceSha256===l.sourceSha256&&raw.data&&Object.getPrototypeOf(raw.data)===Object.prototype&&(!Object.hasOwn(raw.data,'来源编号')||raw.data['来源编号']===raw.sourceId),'OFFSET_SOURCE_ORIGINAL_LOCATOR');
      if(chunk.length&&chunkBytes+entry.length>8388608){await verify();yield chunk;active();chunk=[];chunkBytes=0;}
      chunk.push({raw,rawLine,index:structuredClone(entry)});chunkBytes+=entry.length;
      if(chunk.length===chunkRows){await verify();yield chunk;active();chunk=[];chunkBytes=0;}
     }
     if(chunk.length){await verify();yield chunk;}await verify();
    }finally{busy=false;}
   },close};
 }catch(error){await close();throw error;}
}
