/** Transfer-line source/reference preparation and genuine finite-copy consumption.
 * No SQL, runtime capability, UUID allocator or implicit original-source read.
 * The pure preparer is not an authority. The reader needs two outside C pins.
 */
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {parseV2Csv} from '../../packages/application/src/import-v2.ts';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {prepareV3HistoryChunk,validatePreparedHistoryChunk} from '../../packages/application/src/import-v3-history-staging.ts';
import {historySettlementRequestHash as captureHash} from '../../packages/application/src/import-v3-history-settlement.ts';
import {HISTORY_COUNT_KEYS} from '../../packages/application/src/history-storage-contract.ts';
import {historyClosureProjectionRow26,HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {sourceEvidence} from './prepare-native-bindings.mjs';

const must=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0');
const count=(v,max=300000)=>Number.isSafeInteger(v)&&v>0&&v<=max;
const digest=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const decode=b=>new TextDecoder('utf8',{fatal:true}).decode(b);
const compare=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const table=IMPORT_V2_TABLES.find(t=>t.entity==='TRANSFER_LINE');
const columns=table.columns.map(c=>c.name);
const selectionKeys=['baseManifestSha256','selectionSha256','approvalSha256','entity','source','path','csvSha256'];
const headerKeys=['entity','sourceKey','sourceRowId','sourceContextHash','normalizedRowHash','historyId','historyIdRule','bindings','references','historicalCustomerBinding','header','preparedFingerprint','fieldProvenanceHash','temporalHash'];
const skuKeys=['canonicalSourceKey','nativeSkuId','canonicalSourceEvidenceHash','canonicalCsvRowHash','allocationNormalizedHash','references','aliases','importRecord','nativeSku','preparedFingerprint'];
const aliasKeys=['sourceKey','sourceEvidenceHash','rawLineSha256','completeAliasCsvRowHash','consumedMappingHash'];
const decisionKeys=['sourceKey','sourceRowId','rawLineSha256','sourceEvidenceHash','canonicalRowHash','header','sku','lineId','lineHash','preparedFingerprint'];
function binding(value){captureHash(value);must(exact(value,['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'])&&uuid(value.batchId)&&text(value.fixedSourceNamespace)&&hash(value.selectionSha256)&&typeof value.cutoffAt==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value.cutoffAt)&&Number.isFinite(Date.parse(value.cutoffAt)),'TRANSFER_LINE26_BINDING');return structuredClone(value);}
function selection(value,b){captureHash(value);must(exact(value,selectionKeys)&&['baseManifestSha256','selectionSha256','approvalSha256','csvSha256'].every(k=>hash(value[k]))&&value.selectionSha256===b.selectionSha256&&value.entity==='TRANSFER_LINE'&&value.source==='BASE_V2'&&value.path===table.file,'TRANSFER_LINE26_SELECTION');return structuredClone(value);}
function referenceIndex(b){
 const headers=new Map(),aliases=new Map(),skus=new Map(),headerIds=new Set(),headerSourceIds=new Set(),skuIds=new Set();
 return {headers,aliases,skus,
  addHeader(d){
   captureHash(d);const h=d?.header;
   must(exact(d,headerKeys)&&d.entity==='TRANSFER_HEADER'&&text(d.sourceKey)&&uuid(d.sourceRowId)&&uuid(d.historyId)&&d.historyIdRule==='EXISTING_MAPPER_STABLE_IMPORT_ID'&&d.historicalCustomerBinding===null
    &&[d.sourceContextHash,d.normalizedRowHash,d.preparedFingerprint,d.fieldProvenanceHash,d.temporalHash].every(hash)
    &&h&&h.id===d.historyId&&h.batchId===b.batchId&&h.sourceRowId===d.sourceRowId&&uuid(h.fromWarehouseId)&&uuid(h.toWarehouseId)
    &&h.id===stableImportId('history-transfer-header',b.fixedSourceNamespace,d.sourceKey)
    &&!headers.has(d.sourceKey)&&!headerIds.has(h.id)&&!headerSourceIds.has(d.sourceRowId),'TRANSFER_LINE26_HEADER_REFERENCE');
   headers.set(d.sourceKey,Object.freeze({sourceKey:d.sourceKey,nativeId:h.id,sourceRowId:d.sourceRowId,preparedFingerprint:d.preparedFingerprint,nativeSnapshotHash:requestHash(h)}));headerIds.add(h.id);headerSourceIds.add(d.sourceRowId);
  },
  addSku(d){
   captureHash(d);const n=d?.nativeSku;
   must(exact(d,skuKeys)&&text(d.canonicalSourceKey)&&uuid(d.nativeSkuId)&&exact(n,['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id'])
    &&n.id===d.nativeSkuId&&['product_id','color_id','fit_id','size_id'].every(k=>uuid(n[k]))&&text(n.sku_code)&&typeof n.enabled==='boolean'&&n.version===1&&n.created_operation_id===null
    &&[d.canonicalSourceEvidenceHash,d.canonicalCsvRowHash,d.allocationNormalizedHash,d.preparedFingerprint].every(hash)
    &&Array.isArray(d.aliases)&&d.aliases.length>0&&d.aliases.length<=200&&!skus.has(d.canonicalSourceKey)&&!skuIds.has(n.id),'TRANSFER_LINE26_SKU_REFERENCE');
   let representative=0;const fact=Object.freeze({canonicalSourceKey:d.canonicalSourceKey,nativeId:n.id,nativeSnapshotHash:requestHash(n)});
   for(const a of d.aliases){must(exact(a,aliasKeys)&&text(a.sourceKey)&&!aliases.has(a.sourceKey)&&aliasKeys.slice(1).every(k=>hash(a[k])),'TRANSFER_LINE26_SKU_ALIAS');if(a.sourceKey===d.canonicalSourceKey)representative++;aliases.set(a.sourceKey,Object.freeze({...fact,oldSourceKey:a.sourceKey,aliasEvidenceHash:a.sourceEvidenceHash}));}
   must(representative===1,'TRANSFER_LINE26_SKU_REPRESENTATIVE');skus.set(d.canonicalSourceKey,fact);skuIds.add(n.id);
  },
  clear(){for(const m of [headers,aliases,skus,headerIds,headerSourceIds,skuIds])m.clear();}
 };
}
function original(rawLine){
 must(typeof rawLine==='string'&&Buffer.byteLength(rawLine)<=4194304&&!rawLine.includes('\n'),'TRANSFER_LINE26_RAW_LINE');
 const raw=JSON.parse(rawLine);must(exact(raw,['entity','sourceId','file','sheet','row','sourceSha256','data'])&&raw.entity==='TRANSFER_LINE'&&text(raw.sourceId)&&text(raw.file)&&text(raw.sheet)&&count(raw.row,Number.MAX_SAFE_INTEGER)&&hash(raw.sourceSha256)&&raw.data&&Object.getPrototypeOf(raw.data)===Object.prototype&&raw.data['来源编号']===raw.sourceId,'TRANSFER_LINE26_ORIGINAL');return raw;
}
function normalized(raw,refs){
 const alias=refs.aliases.get(raw.data['SKU来源编号']);must(alias,'TRANSFER_LINE26_ALIAS_MISSING');
 const result=Object.fromEntries(columns.map(k=>[k,raw.data[k]]));result['SKU来源编号']=alias.canonicalSourceKey;return result;
}
function prepareOne(record,b,s,refs){
 must(exact(record,['rawLine','canonical']),'TRANSFER_LINE26_RECORD');captureHash(record);const {rawLine,canonical}=structuredClone(record),raw=original(rawLine);
 must(exact(canonical,columns)&&columns.every(k=>typeof canonical[k]==='string')&&canonical['来源编号']===raw.sourceId,'TRANSFER_LINE26_CANONICAL');
 const h=refs.headers.get(canonical['单据来源编号']),a=refs.aliases.get(raw.data['SKU来源编号']);
 must(h&&a&&a.canonicalSourceKey===canonical['SKU来源编号']&&requestHash(normalized(raw,refs))===requestHash(canonical),'TRANSFER_LINE26_NATIVE_BINDING');
 const source=sourceEvidence(raw,rawLine,canonical,b);
 if(raw.data['SKU来源编号']!==canonical['SKU来源编号'])source.fieldProvenance.fields['SKU来源编号']={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:raw.data['SKU来源编号'],evidence_ref:'mappings/old-to-canonical-sku-15121.csv'};
 must(Object.getPrototypeOf(source.fieldProvenance.fields)===Object.prototype&&Object.keys(raw.data).every(k=>Object.hasOwn(source.fieldProvenance.fields,k)),'TRANSFER_LINE26_PROVENANCE');
 const input={source,header:{sourceKey:h.sourceKey,nativeId:h.nativeId},sku:{sourceKey:a.canonicalSourceKey,nativeId:a.nativeId}};
 const prepared=prepareV3HistoryChunk({batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:s,rows:[input]}).rows[0];
 const decision={sourceKey:source.sourceKey,sourceRowId:source.id,rawLineSha256:source.rowSha256,sourceEvidenceHash:requestHash(source),canonicalRowHash:requestHash(canonical),
  header:{...h},sku:{oldSourceKey:a.oldSourceKey,canonicalSourceKey:a.canonicalSourceKey,nativeId:a.nativeId,nativeSnapshotHash:a.nativeSnapshotHash,aliasEvidenceHash:a.aliasEvidenceHash},
  lineId:prepared.line.id,lineHash:requestHash(prepared.line),preparedFingerprint:prepared.fingerprint};
 return {input,prepared,decision};
}
function preparer(b,s,refs,expectedRows){
 must(count(expectedRows)&&refs.headers.size>0&&refs.headers.size<=100000&&refs.skus.size>0,'TRANSFER_LINE26_EXPECTED');
 const identities=new Set(),sources=new Set(),positions=new Set(),lines=new Set(),lineNumbers=new Set(),counts=new Map([...refs.headers.keys()].map(k=>[k,0]));
 const preparedFold=createHash('sha256'),sourceFold=createHash('sha256');let rows=0,closed=false,poisoned=false;
 const active=()=>must(!closed&&!poisoned,'TRANSFER_LINE26_PREPARER_CLOSED');
 function close(){closed=true;for(const m of [identities,sources,positions,lines,lineNumbers,counts])m.clear();}
 return {
  prepare(record){active();try{must(rows<expectedRows,'TRANSFER_LINE26_EXCESS_ROWS');const result=prepareOne(record,b,s,refs),{source,line}=result.prepared,position=JSON.stringify([source.sourceFileSha256,source.sheet,source.rowNo]),lineNumber=JSON.stringify([line.header_id,line.line_no]);
   must(!identities.has(source.sourceKey)&&!sources.has(source.id)&&!positions.has(position)&&!lines.has(line.id)&&!lineNumbers.has(lineNumber),'TRANSFER_LINE26_GLOBAL_DUPLICATE');
   identities.add(source.sourceKey);sources.add(source.id);positions.add(position);lines.add(line.id);lineNumbers.add(lineNumber);counts.set(result.input.header.sourceKey,counts.get(result.input.header.sourceKey)+1);rows++;preparedFold.update(result.prepared.fingerprint+'\n');sourceFold.update(result.decision.sourceEvidenceHash+'\n');return result;
  }catch(error){poisoned=true;throw error;}},
  finish(){active();try{must(rows===expectedRows&&[...counts.values()].every(n=>n>0),'TRANSFER_LINE26_INCOMPLETE_OR_EMPTY_HEADER');
   const headerLineCounts=[...counts].sort((a,b)=>compare(a[0],b[0])).map(([sourceKey,lineCount])=>({sourceKey,headerId:refs.headers.get(sourceKey).nativeId,lineCount}));
   const result={kind:'TRANSFER_LINE26_PREPARATION_ONLY_V1',rows,headers:headerLineCounts.length,preparedFingerprintStreamSha256:preparedFold.digest('hex'),sourceEvidenceStreamSha256:sourceFold.digest('hex'),perHeaderLineCountsSha256:requestHash(headerLineCounts),headerLineCounts,newNativeUUIDs:0,executionAuthorized:false,noSql:true};close();return result;
  }catch(error){poisoned=true;throw error;}},close
 };
}
/** Only returns preparation facts. Supplied reference arrays are never a grant. */
export function createNativeTransferLine26BindingPreparer(options){
 must(exact(options,['binding','selection','headers','skus','expectedRows']),'TRANSFER_LINE26_PREPARER_OPTIONS');const b=binding(options.binding),s=selection(options.selection,b),refs=referenceIndex(b);
 function each(array,max,add){must(Array.isArray(array)&&Object.getPrototypeOf(array)===Array.prototype&&count(array.length,max)&&Reflect.ownKeys(array).length===array.length+1,'TRANSFER_LINE26_REFERENCE_ARRAYS');for(let i=0;i<array.length;i++){const d=Object.getOwnPropertyDescriptor(array,String(i));must(d?.enumerable&&Object.hasOwn(d,'value'),'TRANSFER_LINE26_REFERENCE_ARRAYS');add(d.value);}}
 // Validate and compact each reference separately; never clone/hash the whole
 // 32MB+35.6MB input graph at once or retain callers' full decision objects.
 try{each(options.headers,100000,refs.addHeader);each(options.skus,50000,refs.addSku);const p=preparer(b,s,refs,options.expectedRows);
  return {prepare:p.prepare,finish(){try{return p.finish();}finally{p.close();refs.clear();}},close(){p.close();refs.clear();}};
 }catch(error){refs.clear();throw error;}
}
export function transferLineSourceEvidence26(row,selection){const s=row.source;return {id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:{...s.fieldProvenance,history_staging:{validator_version:'V3_TRANSFER_LINE_STAGE_1',fingerprint:row.fingerprint,selection}}};}

/** Adapt the saved TL26JOIN1 index to an existing closure session's globally
 * ordered stream. Caller retains the adopted artifacts/FDs and supplies its
 * existing readRow/current operations. This pure adapter opens no files and
 * grants no source, payload or import authority. */
export async function* capturedTransferLineRows26(index,kind,readRow,current){
 current();must(Buffer.isBuffer(index)&&index.length>=64&&index.subarray(0,9).toString('ascii')==='TL26JOIN1'&&index.readUInt32LE(12)===1&&['sourceRows','typedRows'].includes(kind)&&typeof readRow==='function','TRANSFER_LINE26_CAPTURED_INDEX');
 const rows=index.readUInt32LE(16),headers=index.readUInt32LE(20),recordBytes=index.readUInt32LE(24),records=index.readUInt32LE(28),sourceOrderBytes=index.readUInt32LE(32),typedOrderBytes=index.readUInt32LE(36),directoryBytes=index.readUInt32LE(40);
 must(recordBytes===256&&records===rows*256&&sourceOrderBytes===rows*4&&typedOrderBytes===rows*4&&directoryBytes===headers*36&&index.readUInt32LE(44)===64&&index.length===64+records+sourceOrderBytes+typedOrderBytes+directoryBytes,'TRANSFER_LINE26_CAPTURED_INDEX');
 const source=kind==='sourceRows',relation=source?'import_source_row':'history_transfer_line',keyAt=source?64:128,keyLengthAt=source?60:61,order=new Uint32Array(rows);
 const key=n=>{const at=64+n*256,length=index[at+keyLengthAt];must(length>0&&length<=64,'TRANSFER_LINE26_CAPTURED_KEY');return index.subarray(at+keyAt,at+keyAt+length);};
 for(let n=0;n<rows;n++)order[n]=n;
 // Saved permutations are grouped by document for documentSHA. Full11 streams
 // instead require global relation/primary-key order; one uint32 array suffices.
 order.sort((a,b)=>Buffer.compare(key(a),key(b)));
 for(const n of order){
  current();const at=64+n*256,offset=Number(index.readBigUInt64LE(at+(source?4:16))),bytes=index.readUInt32LE(at+(source?12:24));must(Number.isSafeInteger(offset),'TRANSFER_LINE26_CAPTURED_OFFSET');
  const ref={offset,bytes,sha256:index.subarray(at+(source?192:224),at+(source?224:256)).toString('hex'),key:decode(key(n)),ordinal:index.readUInt32LE(at)},raw=await readRow(ref);current();
  const row=historyClosureProjectionRow26(relation,raw.projection);must(raw.relation===relation&&raw.key===row.key&&row.key===ref.key,'TRANSFER_LINE26_CAPTURED_ROW');yield row;current();
 }
 current();
}

/** The new source review adopts exact finite original/canonical copies; the
 * separate reference review adopts the new join. Neither authorizes execution. */
export async function openReviewedTransferLineSource26(options){
 const keys=['binding','authorizedPayloadHash','sourceReviewFile','trustedSourceReviewSha256','referenceReviewFile','trustedReferenceReviewSha256'],optional=Object.hasOwn(options??{},'signal')?['signal']:[];
 must(exact(options,[...keys,...optional]),'TRANSFER_LINE26_OPTIONS');const o=Object.fromEntries([...keys,...optional].map(k=>[k,Object.getOwnPropertyDescriptor(options,k).value]));
 const b=binding(o.binding);must(hash(o.trustedSourceReviewSha256)&&hash(o.trustedReferenceReviewSha256)&&(o.authorizedPayloadHash===null||hash(o.authorizedPayloadHash)),'TRANSFER_LINE26_OUTSIDE_PINS');
 must(o.signal===undefined||o.signal instanceof AbortSignal,'TRANSFER_LINE26_SIGNAL');
 const files=[],byPath=new Map(),entries=[],bySource=new Map(),sourceOrder=[],typedOrder=[],refs=referenceIndex(b);let closed=false,closing,constructing=true,work;
 const active=()=>must(!closed&&!o.signal?.aborted,'TRANSFER_LINE26_CLOSED');
 const onAbort=()=>{if(!constructing)close().catch(()=>{});};o.signal?.addEventListener('abort',onAbort,{once:true});
 function close(){closed=true;o.signal?.removeEventListener('abort',onAbort);if(closing)return closing;closing=(async()=>{for(const f of files)try{await f.fd.close();}catch{}files.length=0;byPath.clear();entries.length=0;bySource.clear();sourceOrder.length=0;typedOrder.length=0;refs.clear();work?.close();})();return closing;}
 async function regular(path){must(typeof path==='string'&&isAbsolute(path)&&!path.includes('\0'),'TRANSFER_LINE26_PATH');let p=resolve(path),first=true;for(;;){active();const s=await lstat(p);active();must(!s.isSymbolicLink()&&(first?s.isFile():s.isDirectory()),'TRANSFER_LINE26_REGULAR_PATH');first=false;const parent=dirname(p);if(parent===p)return;p=parent;}}
 const desc=(v,rows=false)=>{must(exact(v,['path','bytes','sha256',...(rows?['rows']:[])])&&typeof v.path==='string'&&isAbsolute(v.path)&&count(v.bytes,2147483648)&&hash(v.sha256)&&(!rows||count(v.rows,1000000)),'TRANSFER_LINE26_DESCRIPTOR');return v;};
 async function file(description,max){const d=desc(description,Object.hasOwn(description??{},'rows'));must(d.bytes<=max,'TRANSFER_LINE26_FILE_BOUND');const previous=byPath.get(d.path);if(previous){must(previous.stat.size===d.bytes&&previous.sha256===d.sha256,'TRANSFER_LINE26_FILE_PIN_CONFLICT');return previous;}
  await regular(d.path);const s=await lstat(d.path);active();must(s.size===d.bytes,'TRANSFER_LINE26_FILE_BOUND');const fd=await open(d.path,constants.O_RDONLY|constants.O_NOFOLLOW),f={path:d.path,stat:s,sha256:d.sha256,fd};files.push(f);byPath.set(d.path,f);active();must(same(s,await fd.stat())&&same(s,await lstat(d.path)),'TRANSFER_LINE26_FILE_CHANGED');active();return f;
 }
 async function verify(){active();for(const f of files){await regular(f.path);must(same(f.stat,await f.fd.stat())&&same(f.stat,await lstat(f.path)),'TRANSFER_LINE26_FILE_CHANGED');active();}active();}
 async function readAt(f,offset,length){active();const bytes=Buffer.allocUnsafe(length);let n=0;while(n<length){const r=await f.fd.read(bytes,n,length-n,offset+n);active();must(r.bytesRead>0,'TRANSFER_LINE26_SHORT_READ');n+=r.bytesRead;}return bytes;}
 async function* chunksOf(f){const sum=createHash('sha256');let position=0;while(position<f.stat.size){const bytes=await readAt(f,position,Math.min(65536,f.stat.size-position));active();position+=bytes.length;sum.update(bytes);yield bytes;active();}must(position===f.stat.size&&sum.digest('hex')===f.sha256,'TRANSFER_LINE26_FILE_HASH');active();}
 async function* linesOf(f,maxRows){let pending=Buffer.alloc(0),offset=0,rows=0;for await(const bytes of chunksOf(f)){let buffer=pending.length?Buffer.concat([pending,bytes]):bytes,start=0;for(;;){const end=buffer.indexOf(10,start);if(end<0)break;const line=buffer.subarray(start,end);must(line.length>0&&line.length<=4194304&&++rows<=maxRows,'TRANSFER_LINE26_JSONL_BOUND');active();yield {line:decode(line),offset,length:line.length,sha256:digest(line)};active();offset+=line.length+1;start=end+1;}pending=Buffer.from(buffer.subarray(start));must(pending.length<=4194304,'TRANSFER_LINE26_JSONL_BOUND');}must(pending.length===0&&rows===maxRows,'TRANSFER_LINE26_JSONL_EOF');active();}
 async function json(description){const f=await file(description,4194304),bytes=await readAt(f,0,f.stat.size);active();must(digest(bytes)===f.sha256,'TRANSFER_LINE26_FILE_HASH');return JSON.parse(decode(bytes));}
 const bound=v=>exact(v,Object.keys(b))&&Object.keys(b).every(k=>v[k]===b[k]);
 async function qb(d,qualified='PASS'){must(exact(d,['path','bytes','sha256','result'])&&d.result===qualified,'TRANSFER_LINE26_QB_BINDING');const q=await json({path:d.path,bytes:d.bytes,sha256:d.sha256});must(q?.result==='PASS','TRANSFER_LINE26_QB_RESULT');}
 let rawFile,decisionFile,selected;
 async function readEntry(entry){const rawBytes=await readAt(rawFile,entry.rawOffset,entry.rawLength);active();must(digest(rawBytes)===entry.rawSha256,'TRANSFER_LINE26_RAW_CHANGED');const rawLine=decode(rawBytes),raw=original(rawLine),result=prepareOne({rawLine,canonical:normalized(raw,refs)},b,selected,refs),decisionBytes=await readAt(decisionFile,entry.decisionOffset,entry.decisionLength);active();must(digest(decisionBytes)===entry.decisionSha256&&captureHash(JSON.parse(decode(decisionBytes)))===captureHash(result.decision)&&result.prepared.fingerprint===entry.fingerprint,'TRANSFER_LINE26_PREPARED_CHANGED');return result;}
 try{
  const sr=await json({path:o.sourceReviewFile,bytes:(await lstat(o.sourceReviewFile)).size,sha256:o.trustedSourceReviewSha256});
  const rr=await json({path:o.referenceReviewFile,bytes:(await lstat(o.referenceReviewFile)).size,sha256:o.trustedReferenceReviewSha256});
  must(exact(sr,['version','decision','binding','manifest','scope','independentReview','realImportExecutionAuthorized'])&&sr.version==='C_TRANSFER_LINE26_SOURCE_COPY_REVIEW_V1'&&sr.decision==='ACCEPT_EXACT_TRANSFER_LINE_SOURCE_COPY'&&bound(sr.binding)&&sr.scope==='TRANSFER_LINE_SOURCE_COPY_ONLY'&&sr.realImportExecutionAuthorized===false,'TRANSFER_LINE26_SOURCE_REVIEW');
  must(exact(rr,['version','decision','binding','manifest','sourceReviewSha256','scope','independentReview','realImportExecutionAuthorized'])&&rr.version==='C_NATIVE_TRANSFER_LINE26_REFERENCE_REVIEW_V1'&&rr.decision==='ACCEPT_EXACT_TRANSFER_LINE_SOURCE_REFERENCE_BINDINGS'&&bound(rr.binding)&&rr.scope==='TRANSFER_LINE_SOURCE_REFERENCE_ONLY'&&rr.realImportExecutionAuthorized===false&&rr.sourceReviewSha256===o.trustedSourceReviewSha256&&captureHash(desc(sr.manifest))===captureHash(desc(rr.manifest)),'TRANSFER_LINE26_REFERENCE_REVIEW');
  await qb(sr.independentReview);await qb(rr.independentReview);
  const m=await json(sr.manifest);
  must(exact(m,['version','status','binding','selection','rows','headers','originalSource','sourceIndexReview','offsetIndex','baseManifest','rawRows','canonicalCsv','decisions','headerLineCounts','headerReferenceReview','skuReferenceReview','preparedFingerprintStreamSha256','sourceEvidenceStreamSha256','perHeaderLineCountsSha256','newNativeUUIDs','sql','executionAuthorized'])&&m.version==='NATIVE_TRANSFER_LINE26_SOURCE_REFERENCE_CANDIDATE_V1'&&m.status==='COMPLETE_SOURCE_REFERENCE_PENDING_C_REVIEW'&&bound(m.binding)&&count(m.rows)&&count(m.headers,100000)&&m.newNativeUUIDs===0&&m.sql===0&&m.executionAuthorized===false&&[m.preparedFingerprintStreamSha256,m.sourceEvidenceStreamSha256,m.perHeaderLineCountsSha256].every(hash),'TRANSFER_LINE26_MANIFEST');
  selected=selection(m.selection,b);desc(m.originalSource,true);desc(m.rawRows,true);desc(m.canonicalCsv,true);desc(m.decisions,true);must([m.rawRows,m.canonicalCsv,m.decisions].every(d=>d.rows===m.rows),'TRANSFER_LINE26_MANIFEST_COUNTS');
  const oldReview=await json(m.sourceIndexReview);
  must(exact(oldReview,['version','decision','binding','indexManifest','source','scope','independentReview','realImportExecutionAuthorized'])&&oldReview.version==='C_MATERIALIZED_SOURCE_OFFSET_INDEX_REVIEW_V1'&&oldReview.decision==='ACCEPT_EXACT_SOURCE_OFFSET_BINDINGS'&&bound(oldReview.binding)&&oldReview.scope==='OFFSET_ROWS_ONLY'&&oldReview.realImportExecutionAuthorized===false&&captureHash(oldReview.source)===captureHash(m.originalSource),'TRANSFER_LINE26_SOURCE_ROOT');
  must(exact(oldReview.independentReview,['path','sha256','result'])&&oldReview.independentReview.result==='PASS','TRANSFER_LINE26_OLD_QB');
  const oldQb=await json({path:oldReview.independentReview.path,bytes:(await lstat(oldReview.independentReview.path)).size,sha256:oldReview.independentReview.sha256});must(oldQb?.result==='PASS','TRANSFER_LINE26_QB_RESULT');
  const index=await json(oldReview.indexManifest);must(index.version==='MATERIALIZED_SOURCE_OFFSET_INDEX_CANDIDATE_V1'&&index.status==='COMPLETE_PINNED_SOURCE_INDEX_NOT_NATIVE_AUTHORITY'&&index.importAuthorized===false&&captureHash(index.source)===captureHash(m.originalSource)&&index.expectedEntityCounts?.TRANSFER_LINE===m.rows&&index.observedEntityCounts?.TRANSFER_LINE===m.rows&&Array.isArray(index.artifacts)&&index.artifacts.filter(d=>d.entity==='TRANSFER_LINE').length===1&&captureHash(index.artifacts.find(d=>d.entity==='TRANSFER_LINE'))===captureHash(m.offsetIndex),'TRANSFER_LINE26_OFFSET_ROOT');
  const base=await json(m.baseManifest);must(index.manifest?.path===m.baseManifest.path&&index.manifest.sha256===m.baseManifest.sha256&&m.baseManifest.sha256===selected.baseManifestSha256&&Array.isArray(base.payloadFiles),'TRANSFER_LINE26_BASE');
  const canonicalPayload=base.payloadFiles.filter(d=>d.file===table.file),rawPayload=base.payloadFiles.filter(d=>d.file==='snapshots/all-business-source-rows.jsonl');
  must(canonicalPayload.length===1&&canonicalPayload[0].sha256===selected.csvSha256&&canonicalPayload[0].sha256===m.canonicalCsv.sha256&&canonicalPayload[0].bytes===m.canonicalCsv.bytes&&rawPayload.length===1&&rawPayload[0].sha256===m.originalSource.sha256&&rawPayload[0].bytes===m.originalSource.bytes,'TRANSFER_LINE26_BASE_PAYLOAD');
  must(resolve(m.rawRows.path)!==resolve(m.originalSource.path)&&resolve(m.canonicalCsv.path)!==resolve(dirname(m.baseManifest.path),table.file)&&resolve(m.rawRows.path)!==resolve(m.canonicalCsv.path),'TRANSFER_LINE26_SOURCE_COPY_REQUIRED');
  const hr=await json(m.headerReferenceReview);must(hr.version==='C_NATIVE_TRANSFER_HEADER26_REFERENCE_REVIEW_V1'&&hr.decision==='ACCEPT_EXACT_TRANSFER_HEADER14279_REFERENCE_BINDINGS'&&bound(hr.binding)&&hr.scope==='TRANSFER_HEADER14279_REFERENCE_DECISIONS_ONLY'&&hr.realImportExecutionAuthorized===false,'TRANSFER_LINE26_HEADER_REVIEW');await qb(hr.independentReview,'PASS_TRANSFER14279_ONLY');
  const hm=await json(hr.manifest);must(hm.version==='NATIVE_TRANSFER_HEADER26_REFERENCE_CANDIDATE_V1'&&bound(hm.binding)&&hm.rows===m.headers&&hr.decisions.rows===m.headers&&captureHash(hm.artifact)===captureHash(hr.decisions)&&hm.historyIdentityRule==='EXISTING_MAPPER_STABLE_IMPORT_ID'&&hm.executionAuthorized===false,'TRANSFER_LINE26_HEADER_MANIFEST');
  for await(const row of linesOf(await file(hr.decisions,67108864),m.headers))refs.addHeader(JSON.parse(row.line));
  const kr=await json(m.skuReferenceReview);must(kr.version==='C_NATIVE_SKU26_REFERENCE_REVIEW_V1'&&kr.decision==='ACCEPT_EXACT_PREPARED_SKU26_REFERENCE_BINDINGS'&&bound(kr.binding)&&kr.scope==='SKU_REFERENCE_DECISIONS_ONLY'&&kr.realImportExecutionAuthorized===false,'TRANSFER_LINE26_SKU_REVIEW');
  must(exact(kr.independentReview,['path','sha256','result'])&&kr.independentReview.result==='PASS','TRANSFER_LINE26_OLD_QB');const kq=await json({path:kr.independentReview.path,bytes:(await lstat(kr.independentReview.path)).size,sha256:kr.independentReview.sha256});must(kq?.result==='PASS','TRANSFER_LINE26_QB_RESULT');
  const km=await json({path:kr.manifest.path,bytes:kr.manifest.bytes,sha256:kr.manifest.sha256});must(km.version==='NATIVE_SKU26_SOURCE_REFERENCE_CANDIDATE_V1'&&Object.keys(b).every(k=>km[k]===b[k])&&km.rows===kr.decisions.rows&&km.rows===kr.manifest.rows&&km.oldAliases===kr.manifest.oldAliases&&captureHash(km.artifact)===captureHash(kr.decisions)&&km.importAuthorized===false,'TRANSFER_LINE26_SKU_MANIFEST');
  for await(const row of linesOf(await file(kr.decisions,134217728),kr.decisions.rows))refs.addSku(JSON.parse(row.line));must(refs.aliases.size===km.oldAliases&&refs.headers.size===m.headers,'TRANSFER_LINE26_REFERENCE_COVERAGE');
  const canonical=new Map(),csvFile=await file(m.canonicalCsv,134217728);let header,csvRows=0;
  for await(const cells of parseV2Csv((async function*(){const decoder=new TextDecoder('utf8',{fatal:true});for await(const bytes of chunksOf(csvFile)){active();yield decoder.decode(bytes,{stream:true});active();}const tail=decoder.decode();if(tail)yield tail;active();})())){
   if(!header){must(cells.length===columns.length&&cells.every((c,i)=>c===columns[i]),'TRANSFER_LINE26_CSV_HEADER');header=cells;continue;}
   must(cells.length===columns.length&&++csvRows<=m.rows,'TRANSFER_LINE26_CSV_ROWS');const row=Object.fromEntries(columns.map((c,i)=>[c,cells[i]]));must(text(row['来源编号'])&&!canonical.has(row['来源编号']),'TRANSFER_LINE26_CSV_DUPLICATE');canonical.set(row['来源编号'],JSON.stringify(row));
  }
  must(header&&csvRows===m.rows,'TRANSFER_LINE26_CSV_ROWS');
  rawFile=await file(m.rawRows,1073741824);decisionFile=await file(m.decisions,1073741824);
  must(exact(m.offsetIndex,['entity','path','rows','bytes','sha256'])&&m.offsetIndex.entity==='TRANSFER_LINE'&&m.offsetIndex.rows===m.rows,'TRANSFER_LINE26_OFFSET_ROOT');
  const offsetFile=await file({path:m.offsetIndex.path,bytes:m.offsetIndex.bytes,sha256:m.offsetIndex.sha256},134217728);
  const offsets=linesOf(offsetFile,m.rows)[Symbol.asyncIterator](),decisions=linesOf(decisionFile,m.rows)[Symbol.asyncIterator]();work=preparer(b,selected,refs,m.rows);let previousEnd=-1;
  for await(const rawRow of linesOf(rawFile,m.rows)){
   const at=await offsets.next(),dt=await decisions.next();active();must(!at.done&&!dt.done,'TRANSFER_LINE26_JOIN_COVERAGE');const ix=JSON.parse(at.value.line),raw=original(rawRow.line);
   must(exact(ix,['entity','sourceKey','sourceLocator','identityKind','offset','length','sha256'])&&ix.entity==='TRANSFER_LINE'&&ix.sourceKey===raw.sourceId&&ix.identityKind==='ORIGINAL_SOURCE_KEY_AND_LOCATOR'&&exact(ix.sourceLocator,['file','sheet','row','sourceSha256'])&&ix.sourceLocator.file===raw.file&&ix.sourceLocator.sheet===raw.sheet&&ix.sourceLocator.row===raw.row&&ix.sourceLocator.sourceSha256===raw.sourceSha256&&base.sourceInputSha256?.[raw.file]===raw.sourceSha256&&Number.isSafeInteger(ix.offset)&&ix.offset>previousEnd&&ix.length===rawRow.length&&ix.offset+ix.length<=m.originalSource.bytes&&ix.sha256===rawRow.sha256,'TRANSFER_LINE26_ORIGINAL_LOCATOR');previousEnd=ix.offset+ix.length;
   const packed=canonical.get(raw.sourceId);must(packed!==undefined,'TRANSFER_LINE26_CANONICAL_COVERAGE');canonical.delete(raw.sourceId);const prepared=work.prepare({rawLine:rawRow.line,canonical:JSON.parse(packed)}),decision=JSON.parse(dt.value.line);
   must(exact(decision,decisionKeys)&&captureHash(decision)===captureHash(prepared.decision),'TRANSFER_LINE26_JOIN_CHANGED');
   const entry={rawOffset:rawRow.offset,rawLength:rawRow.length,rawSha256:rawRow.sha256,decisionOffset:dt.value.offset,decisionLength:dt.value.length,decisionSha256:dt.value.sha256,sourceKey:raw.sourceId,sourceId:prepared.prepared.source.id,lineId:prepared.prepared.line.id,fingerprint:prepared.prepared.fingerprint};entries.push(entry);bySource.set(entry.sourceKey,entry);
  }
  must((await offsets.next()).done&&(await decisions.next()).done&&canonical.size===0,'TRANSFER_LINE26_JOIN_COVERAGE');active();const complete=work.finish();
  must(complete.rows===m.rows&&complete.headers===m.headers&&['preparedFingerprintStreamSha256','sourceEvidenceStreamSha256','perHeaderLineCountsSha256'].every(k=>complete[k]===m[k]),'TRANSFER_LINE26_COMPLETE_FOLD');
  desc(m.headerLineCounts,true);must(m.headerLineCounts.rows===m.headers,'TRANSFER_LINE26_HEADER_COUNTS');let countIndex=0;for await(const row of linesOf(await file(m.headerLineCounts,8388608),m.headers)){const value=JSON.parse(row.line);must(exact(value,['sourceKey','headerId','lineCount'])&&captureHash(value)===captureHash(complete.headerLineCounts[countIndex++]),'TRANSFER_LINE26_HEADER_COUNTS');}
  for(const entry of entries){sourceOrder.push(entry);typedOrder.push(entry);}sourceOrder.sort((a,b)=>compare(a.sourceId,b.sourceId));typedOrder.sort((a,b)=>compare(a.lineId,b.lineId));await verify();active();constructing=false;
  return {report:Object.freeze({kind:'GENUINE_TRANSFER_LINE26_SOURCE_REFERENCE_ONLY_V1',rows:m.rows,headers:m.headers,preparedFingerprintStreamSha256:complete.preparedFingerprintStreamSha256,perHeaderLineCountsSha256:complete.perHeaderLineCountsSha256,sourceCopiesRetained:true,originalSourceReads:0,originalCsvReads:0,newNativeUUIDs:0,executionAuthorized:false,documentDigestsComplete:false,noSql:true}),verify,
   async *chunks(){await verify();active();const baseSize=Buffer.byteLength(JSON.stringify({batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:selected,rows:[]}));let rows=[],size=baseSize;for(const entry of entries){const item=await readEntry(entry);active();const bytes=Buffer.byteLength(JSON.stringify(item.input));must(bytes+baseSize<=4194304,'TRANSFER_LINE26_CHUNK_BOUND');if(rows.length&&(rows.length===200||size+bytes+1>4194304)){const chunk=prepareV3HistoryChunk({batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:selected,rows});await verify();active();yield chunk;active();rows=[];size=baseSize;}size+=bytes+(rows.length?1:0);rows.push(item.input);}if(rows.length){const chunk=prepareV3HistoryChunk({batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selection:selected,rows});await verify();active();yield chunk;active();}await verify();active();},
   async authorize(value){active();const before=captureHash(value),copy=structuredClone(value);validatePreparedHistoryChunk(copy);must(copy.batchId===b.batchId&&copy.fixedSourceNamespace===b.fixedSourceNamespace&&captureHash(copy.selection)===captureHash(selected),'TRANSFER_LINE26_CHUNK_SCOPE');for(const row of copy.rows){const entry=bySource.get(row.source.sourceKey);must(entry&&entry.sourceId===row.source.id&&entry.lineId===row.line.id&&entry.fingerprint===row.fingerprint,'TRANSFER_LINE26_NOT_AUTHORIZED');}await verify();active();must(captureHash(value)===before,'TRANSFER_LINE26_INPUT_CHANGED');},
   async openClosure(scope,context){captureHash(scope);must(exact(scope,['batchId','fixedSourceNamespace','selectionSha256','authorizedPayloadHash','expectedCounts','expectedSourceEntityCounts'])&&exact(scope.expectedCounts,HISTORY_COUNT_KEYS)&&exact(scope.expectedSourceEntityCounts,HISTORY_CLOSURE_SOURCE_ENTITIES)&&[...Object.values(scope.expectedCounts),...Object.values(scope.expectedSourceEntityCounts)].every(n=>Number.isSafeInteger(n)&&!Object.is(n,-0)&&n>=0&&n<=2147483645)&&scope.expectedCounts.history_transfer_line===m.rows&&scope.expectedSourceEntityCounts.TRANSFER_LINE===m.rows&&scope.batchId===b.batchId&&scope.fixedSourceNamespace===b.fixedSourceNamespace&&scope.selectionSha256===b.selectionSha256&&hash(o.authorizedPayloadHash)&&scope.authorizedPayloadHash===o.authorizedPayloadHash&&exact(context,['group','signal'])&&context.group==='TRANSFER_LINES'&&(context.signal===undefined||context.signal instanceof AbortSignal)&&!context.signal?.aborted,'TRANSFER_LINE26_CLOSURE_SCOPE');const signal=context.signal;await verify();active();must(!signal?.aborted,'TRANSFER_LINE26_CLOSED');let sessionClosed=false;const current=()=>{active();must(!sessionClosed&&!signal?.aborted,'TRANSFER_LINE26_CLOSED');};
    return {async verify(){current();await verify();current();},async *sourceRows(){for(const entry of sourceOrder){current();const row=await readEntry(entry);current();yield historyClosureProjectionRow26('import_source_row',transferLineSourceEvidence26(row.prepared,selected));current();}},async *typedRows(){for(const entry of typedOrder){current();const row=await readEntry(entry);current();yield historyClosureProjectionRow26('history_transfer_line',row.prepared.line);current();}},async *documents(){current();},async close(){sessionClosed=true;}};
   },close};
 }catch(error){await close();throw error;}
}
