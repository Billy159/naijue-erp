/** Reuse the completed immutable header gzip. No XLSX/preflight regeneration,
 * native IDs, native mapping fallback, SQL or original-file deletion. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open,lstat,readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isAbsolute } from 'node:path';
import { requestHash } from '../../packages/application/src/request-hash.ts';
const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const exact=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Reflect.ownKeys(x).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(x,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const entities=['SALES_HEADER','TRANSFER_HEADER'];
const sourceKey=r=>JSON.stringify([r.source.entityType,r.source.sourceKey]);
export async function openVerifiedHeaderSource(options){
 must(exact(options,['spoolFile','receiptFile','trustedReceiptSha256','binding','limits',...(Object.hasOwn(options??{},'signal')?['signal']:[])]),'VERIFIED_HEADER_CONFIG');
 const {spoolFile,receiptFile,trustedReceiptSha256,signal}=options;requestHash(options.binding);const binding=structuredClone(options.binding),limits=structuredClone(options.limits);
 must([spoolFile,receiptFile].every(p=>typeof p==='string'&&isAbsolute(p))&&hash(trustedReceiptSha256),'VERIFIED_HEADER_OUTSIDE_PIN');
 must(exact(limits,['maxStoredBytes','maxRawBytes','maxLineBytes'])&&Number.isSafeInteger(limits.maxStoredBytes)&&limits.maxStoredBytes>0&&limits.maxStoredBytes<=134217728
  &&Number.isSafeInteger(limits.maxRawBytes)&&limits.maxRawBytes>0&&limits.maxRawBytes<=536870912&&Number.isSafeInteger(limits.maxLineBytes)&&limits.maxLineBytes>0&&limits.maxLineBytes<=4194304,'VERIFIED_HEADER_LIMIT');
 let closed=false;const readers=new Set(),index=new Map();
 const active=()=>must(!closed&&!signal?.aborted,'VERIFIED_HEADER_CLOSED');active();
 const receiptIdentity=await lstat(receiptFile);must(receiptIdentity.isFile()&&!receiptIdentity.isSymbolicLink()&&receiptIdentity.size<=4194304,'VERIFIED_HEADER_RECEIPT');
 const receiptBytes=await readFile(receiptFile);must(same(receiptIdentity,await lstat(receiptFile))&&createHash('sha256').update(receiptBytes).digest('hex')===trustedReceiptSha256,'VERIFIED_HEADER_RECEIPT_CHANGED');
 const receipt=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(receiptBytes)),spool=receipt.preservedCompressedSource;
 must(receipt.taskId==='B06-HEADER-SOURCE-ONLY-GZIP-ONE-WINDOW'&&receipt.status==='PASS_COMPLETE_42561_HEADER_SOURCE_ONLY_NO_SQL'&&receipt.sql===false&&receipt.stage===false&&receipt.publish===false
  &&receipt.readerReturned===true&&receipt.readerClosed===true&&receipt.sourceChecks==='SOURCE_ONLY_COUNTS_AND_ORIGINAL_CELLS_VERIFIED_NOT_NATIVE_BINDINGS'
  &&['batchId','fixedSourceNamespace','selectionSha256','cutoffAt'].every(k=>receipt[k]===binding[k])&&spool?.path===spoolFile&&hash(spool.sha256)&&hash(spool.rawSha256)
  &&Number.isSafeInteger(spool.bytes)&&spool.bytes>0&&spool.bytes<=limits.maxStoredBytes&&Number.isSafeInteger(spool.rawBytes)&&spool.rawBytes>0&&spool.rawBytes<=limits.maxRawBytes
  &&exact(receipt.actualCounts,entities)&&entities.every(e=>Number.isSafeInteger(receipt.actualCounts[e])&&receipt.actualCounts[e]>=0)
  &&Number.isSafeInteger(receipt.actualRows)&&receipt.actualRows>0&&receipt.actualRows<=100000&&receipt.actualRows===entities.reduce((n,e)=>n+receipt.actualCounts[e],0),'VERIFIED_HEADER_RECEIPT_BINDING');
 const identity=await lstat(spoolFile);must(identity.isFile()&&!identity.isSymbolicLink()&&(identity.mode&0o077)===0&&identity.size===spool.bytes,'VERIFIED_HEADER_PRIVATE_FILE');
 async function verify(){active();must(same(identity,await lstat(spoolFile))&&same(receiptIdentity,await lstat(receiptFile)),'VERIFIED_HEADER_FILE_CHANGED');active();}
 function record(value){
  must(exact(value,['source','selection','creatorHallOverlay','temporalEvidence'])&&value.source&&entities.includes(value.source.entityType)
   &&value.source.batchId===binding.batchId&&typeof value.source.sourceKey==='string'&&value.source.sourceKey.length>0
   &&hash(value.source.rowSha256)&&hash(value.source.sourceFileSha256)&&typeof value.source.rowNo==='string'&&/^[1-9]\d*$/.test(value.source.rowNo)
   &&value.source.rawFields&&value.source.normalizedFields&&value.source.fieldProvenance?.schema_version===1
   &&value.selection?.entity===value.source.entityType&&value.selection.source==='BASE_V2'&&value.selection.selectionSha256===binding.selectionSha256
   &&value.creatorHallOverlay&&value.temporalEvidence,'VERIFIED_HEADER_RECORD');requestHash(value);return value;
 }
 async function* scan(){
  await verify();const fd=await open(spoolFile,constants.O_RDONLY|constants.O_NOFOLLOW),entry={fd,streams:[],done:null};readers.add(entry);
  try{
   must(same(identity,await fd.stat()),'VERIFIED_HEADER_FILE_CHANGED');active();
   const input=fd.createReadStream({autoClose:false}),compressed=createHash('sha256'),raw=createHash('sha256');let storedBytes=0,rawBytes=0;
   const meter=new Transform({transform(bytes,encoding,cb){try{active();storedBytes+=bytes.length;must(storedBytes<=spool.bytes&&storedBytes<=limits.maxStoredBytes,'VERIFIED_HEADER_STORED_LIMIT');compressed.update(bytes);cb(null,bytes);}catch(e){cb(e);}}}),inflate=createGunzip();entry.streams=[input,meter,inflate];
   entry.done=pipeline(input,meter,inflate);entry.done.catch(()=>{});
   const decoder=new TextDecoder('utf8',{fatal:true});let pending='',rows=0;const counts={SALES_HEADER:0,TRANSFER_HEADER:0},seen=new Set();
   const decodeLine=line=>{must(line.length>0&&Buffer.byteLength(line)<=limits.maxLineBytes,'VERIFIED_HEADER_LINE_LIMIT');const r=record(JSON.parse(line)),k=sourceKey(r);must(!seen.has(k),'VERIFIED_HEADER_DUPLICATE');seen.add(k);rows++;must(rows<=receipt.actualRows,'VERIFIED_HEADER_ROW_COUNT');counts[r.source.entityType]++;return r;};
   for await(const bytes of inflate){active();rawBytes+=bytes.length;must(rawBytes<=spool.rawBytes&&rawBytes<=limits.maxRawBytes,'VERIFIED_HEADER_RAW_LIMIT');raw.update(bytes);pending+=decoder.decode(bytes,{stream:true});
    let end;while((end=pending.indexOf('\n'))!==-1){const line=pending.slice(0,end);pending=pending.slice(end+1);yield decodeLine(line);active();}must(Buffer.byteLength(pending)<=limits.maxLineBytes,'VERIFIED_HEADER_LINE_LIMIT');
   }
   pending+=decoder.decode();must(pending==='','VERIFIED_HEADER_TRAILING_LINE');await entry.done;
   must(storedBytes===spool.bytes&&compressed.digest('hex')===spool.sha256&&rawBytes===spool.rawBytes&&raw.digest('hex')===spool.rawSha256,'VERIFIED_HEADER_CONTENT_CHANGED');
   must(rows===receipt.actualRows&&entities.every(e=>counts[e]===receipt.actualCounts[e]),'VERIFIED_HEADER_ROW_COUNT');must(same(identity,await fd.stat()),'VERIFIED_HEADER_FILE_CHANGED');await verify();
  }finally{for(const stream of entry.streams)stream.destroy();if(entry.done)await Promise.allSettled([entry.done]);await fd.close();readers.delete(entry);}
 }
 async function close(){if(closed)return;closed=true;for(const entry of readers)for(const stream of entry.streams)stream.destroy();await Promise.allSettled([...readers].flatMap(e=>[...(e.done?[e.done]:[]),e.fd.close()]));index.clear();}
 const onAbort=()=>{void close();};signal?.addEventListener('abort',onAbort,{once:true});
 try{
  // Every byte, gzip CRC, UTF-8 row, raw digest and expected count is checked
  // before the first external row can be yielded. Retain hashes, not 399MB rows.
  for await(const r of scan())index.set(sourceKey(r),requestHash(r));
  must(index.size===receipt.actualRows,'VERIFIED_HEADER_ROW_COUNT');
  return{report:Object.freeze({kind:'VERIFIED_HEADER_SOURCE_GZIP_V1',rows:index.size,counts:{...receipt.actualCounts},storedBytes:spool.bytes,rawBytes:spool.rawBytes,sourceOnly:true,nativeBindingsVerified:false,importReady:false,noSql:true}),verify,
   async *rows(entity){must(entity===undefined||entities.includes(entity),'VERIFIED_HEADER_ENTITY');for await(const r of scan()){must(index.get(sourceKey(r))===requestHash(r),'VERIFIED_HEADER_RECORD_CHANGED');if(entity===undefined||r.source.entityType===entity)yield r;}},
   async authorizeSource(value){await verify();const r=record(value);must(index.get(sourceKey(r))===requestHash(r),'VERIFIED_HEADER_RECORD_CHANGED');await verify();},
   async close(){signal?.removeEventListener('abort',onAbort);await close();}};
 }catch(error){signal?.removeEventListener('abort',onAbort);await close();throw error;}
}
