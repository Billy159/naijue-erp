// Pure retained-source composition for the ORIGINAL all11 closure reader.
// Original row codec/folds compute every hash/doc9; no new authority or file IO.
import assert from 'node:assert/strict';
import {salesHeaderProjection26} from './prepare-retained-sales-header-window-20261026.mjs';
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const cmp=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const order=r=>r.relation+'\0'+r.key;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const bound=v=>Number.isSafeInteger(v)&&v>=0;
export const SALES_HEADER_CLOSURE_INDEX_VERSION='RETAINED_SALES_HEADER_CLOSURE_INDEX_V1';

/** Called on projections ALREADY produced during the single original stage pass.
 * offset/bytes describe original JSONL record INCLUDING LF in its pinnedpartition.
 * Hash is original historyClosureRowHash, not a replacement JSON hash protocol. */
export function captureSalesHeaderClosureEntry(codec,{partition,offset,bytes,projection,fingerprint}){
 const s=projection.sourceRow,t=projection.typedRow,d=projection.document;
 need(['KNOWN25811','MAPPED2471'].includes(partition)&&bound(offset)&&Number.isSafeInteger(bytes)&&bytes>0&&bytes<=4194304&&hash(fingerprint),'SALES_INDEX_CAPTURE_RANGE');
 need(s.relation==='import_source_row'&&t.relation==='history_sales_header'&&d.kind==='SALES'&&s.projection.entity_type==='SALES_HEADER'
  &&s.key===d.headerSourceRowId&&t.key===d.headerId&&s.projection.source_key===d.sourceKey&&t.projection.source_row_id===s.key,'SALES_INDEX_CAPTURE_IDENTITY');
 return{partition,offset,bytes,sourceKey:d.sourceKey,sourceRowId:s.key,headerId:t.key,fingerprint,
  source:{relation:s.relation,key:s.key,sha256:codec.historyClosureRowHash(s)},typed:{relation:t.relation,key:t.key,sha256:codec.historyClosureRowHash(t)},document:structuredClone(d)};
}

export function createSalesHeaderClosureSession({index,sourceCodec,readPrepared,verify,close,current}){
 need(index?.version===SALES_HEADER_CLOSURE_INDEX_VERSION&&index.rows>0&&index.rows<=28282&&Array.isArray(index.entries)&&index.entries.length===index.rows,'SALES_INDEX_VERSION_ROWS');
 need([readPrepared,verify,close,current].every(f=>typeof f==='function'),'SALES_INDEX_ORIGINAL_CAPABILITY');
 const fixed=structuredClone(index),sourceIds=new Set(),headerIds=new Set(),sourceKeys=new Set();
 const partitions=new Map(['KNOWN25811','MAPPED2471'].map(k=>[k,[]]));
 for(const e of fixed.entries){
  need(partitions.has(e.partition)&&bound(e.offset)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=4194304&&uuid(e.sourceRowId)&&uuid(e.headerId)&&hash(e.fingerprint)
   &&typeof e.sourceKey==='string'&&e.sourceKey.length>0&&!e.sourceKey.includes('\0')&&!sourceIds.has(e.sourceRowId)&&!headerIds.has(e.headerId)&&!sourceKeys.has(e.sourceKey),'SALES_INDEX_ENTRY');
  assert.deepEqual(e.document,{kind:'SALES',sourceKey:e.sourceKey,headerSourceRowId:e.sourceRowId,headerId:e.headerId});
  need(e.source?.relation==='import_source_row'&&e.source.key===e.sourceRowId&&hash(e.source.sha256)&&e.typed?.relation==='history_sales_header'&&e.typed.key===e.headerId&&hash(e.typed.sha256),'SALES_INDEX_PROJECTION');
  sourceIds.add(e.sourceRowId);headerIds.add(e.headerId);sourceKeys.add(e.sourceKey);partitions.get(e.partition).push(e);
 }
 let rows=0;for(const[name,entries]of partitions){const ref=fixed.partitions?.[name];need(ref&&typeof ref.path==='string'&&ref.path.startsWith('/')&&bound(ref.bytes)&&bound(ref.rows)&&hash(ref.sha256)&&entries.length===ref.rows,'SALES_INDEX_PARTITION');
  entries.sort((a,b)=>a.offset-b.offset);let end=0;for(const e of entries){need(e.offset===end&&e.offset+e.bytes<=ref.bytes,'SALES_INDEX_COMPLETE_RANGES');end+=e.bytes;}need(end===ref.bytes,'SALES_INDEX_PARTITION_EOF');rows+=entries.length;}
 need(rows===fixed.rows,'SALES_INDEX_COMPLETE_ROWS');
 const sourceOrder=Uint32Array.from(fixed.entries.map((_e,i)=>i)),typedOrder=sourceOrder.slice(),documentOrder=sourceOrder.slice();
 sourceOrder.sort((a,b)=>cmp(fixed.entries[a].sourceRowId,fixed.entries[b].sourceRowId));typedOrder.sort((a,b)=>cmp(fixed.entries[a].headerId,fixed.entries[b].headerId));documentOrder.set(typedOrder);
 let closed=false,closing,sourceStarted=false,sourceComplete=false,typedCacheBytes=0;const typedCache=new Map();
 const active=()=>{need(!closed,'SALES_INDEX_CLOSED');current();};
 async function check(phase){active();need(await verify(phase)===undefined,'SALES_INDEX_VERIFY_RESULT');active();}
 async function row(e){active();const range={offset:e.offset,bytes:e.bytes},value=await readPrepared(e.partition,range);active();
  const p=value?.prepared;need(p?.fingerprint===e.fingerprint&&p.source?.id===e.sourceRowId&&p.source.sourceKey===e.sourceKey&&p.header?.id===e.headerId
   &&p.source.batchId===fixed.binding.batchId&&p.fixedSourceNamespace===fixed.binding.fixedSourceNamespace&&p.selection?.selectionSha256===fixed.binding.selectionSha256,'SALES_INDEX_CAPTURE_CHANGED');
  const projection=salesHeaderProjection26(sourceCodec.historyClosureProjectionRow26,p);assert.deepEqual(projection.document,e.document);
  // Check BOTH captured original row images on every range read, without
  // re-running the original preparer/32Map or caching any whole DTO graph.
  need(sourceCodec.historyClosureRowHash(projection.sourceRow)===e.source.sha256&&sourceCodec.historyClosureRowHash(projection.typedRow)===e.typed.sha256,'SALES_INDEX_CAPTURE_PROJECTION_CHANGED');
  return projection;
 }
 return{async verify(phase){await check(phase);},
  async *sourceRows(){await check('BEFORE_SOURCE');need(!sourceStarted,'SALES_INDEX_SINGLE_SOURCE_PASS');sourceStarted=true;
   for(const n of sourceOrder){const p=await row(fixed.entries[n]);typedCacheBytes+=sourceCodec.encodeHistoryClosureValue(p.typedRow).length;
    need(typedCacheBytes<=64*1024*1024,'SALES_INDEX_TYPED_CACHE_BOUND');typedCache.set(n,p.typedRow);yield p.sourceRow;active();}
   await check('AFTER_SOURCE');sourceComplete=true;},
  async *typedRows(){await check('BEFORE_TYPED');need(sourceComplete&&typedCache.size===fixed.rows,'SALES_INDEX_COMPLETE_SOURCE_PASS_REQUIRED');
   for(const n of typedOrder){active();yield structuredClone(typedCache.get(n));}await check('AFTER_TYPED');},
  async *documents(){await check('BEFORE_DOCUMENTS');for(const n of documentOrder){active();yield structuredClone(fixed.entries[n].document);}await check('AFTER_DOCUMENTS');},
  async close(){if(closing)return closing;closed=true;closing=(async()=>{fixed.entries.length=0;sourceIds.clear();headerIds.clear();sourceKeys.clear();partitions.clear();typedCache.clear();typedCacheBytes=0;await close();})();return closing;}};
}

/** Existing C144 files are independently global relation/key ordered. Caller
 * supplies their original pinned stream readers/actual lease; this wrapper only
 * presents the original all11 factory shape and exact entity/count boundaries. */
export function createCapturedSalesChildClosureSession({entity,binding,expectedRows,sourceRows,typedRows,sourceCodec,verify,close,current}){
 need(['SALES_LINE','SETTLEMENT'].includes(entity)&&Number.isSafeInteger(expectedRows)&&expectedRows>0&&expectedRows<=(entity==='SALES_LINE'?80918:25779),'SALES_CHILD_SCOPE');
 need([sourceRows,typedRows,verify,close,current].every(f=>typeof f==='function'),'SALES_CHILD_ORIGINAL_CAPABILITY');
 const fixed=structuredClone(binding),relation=entity==='SALES_LINE'?'history_sales_line':'history_sales_settlement';let closed=false,closing;
 const active=()=>{need(!closed,'SALES_CHILD_CLOSED');current();};
 async function check(phase){active();need(await verify(phase)===undefined,'SALES_CHILD_VERIFY_RESULT');active();}
 async function* rows(kind){await check('BEFORE_'+kind);let count=0,previous;
  for await(const raw of(kind==='sourceRows'?sourceRows():typedRows())){
   active();const r=sourceCodec.historyClosureProjectionRow26(kind==='sourceRows'?'import_source_row':relation,raw.projection);
   need(raw.relation===r.relation&&raw.key===r.key&&r.projection.batch_id===fixed.batchId&&(previous===undefined||cmp(previous,order(r))<0)&&++count<=expectedRows,'SALES_CHILD_ORDER_SCOPE');previous=order(r);
   if(kind==='sourceRows')need(r.projection.entity_type===entity&&r.projection.raw_fields?.来源编号===r.projection.source_key&&r.projection.raw_fields?.单据来源编号===r.projection.normalized_fields?.单据来源编号,'SALES_CHILD_ORIGINAL_MEMBERSHIP');
   yield r;active();
  }
  need(count===expectedRows,'SALES_CHILD_COMPLETE_COUNT');await check('AFTER_'+kind);
 }
 return{verify:check,sourceRows:()=>rows('sourceRows'),typedRows:()=>rows('typedRows'),async *documents(){await check('NO_CHILD_DOCUMENT_ALLOCATIONS');},
  async close(){if(closing)return closing;closed=true;closing=Promise.resolve().then(close);return closing;}};
}

/** HEADERS is one original all11 group containing sales AND transfer. Merge its
 * two already ordered branch streams; never concatenate partition orders or
 * substitute a partial-sales-only factory for the original complete group. */
export function composeHeaderClosureSessions({sales,transfer,current}){
 need([current,sales?.verify,transfer?.verify,sales?.sourceRows,transfer?.sourceRows,sales?.typedRows,transfer?.typedRows,sales?.documents,transfer?.documents,sales?.close,transfer?.close].every(f=>typeof f==='function'),'HEADERS_ORIGINAL_BRANCHES_REQUIRED');
 let closed=false,closing;const active=()=>{need(!closed,'HEADERS_COMPOSITION_CLOSED');current();};
 const verify=async phase=>{active();for(const s of[sales,transfer]){need(await s.verify(phase)===undefined,'HEADERS_VERIFY_RESULT');active();}};
 async function* merge(kind){await verify('BEFORE_'+kind);const states=[sales,transfer].map(s=>({iterator:s[kind]()[Symbol.asyncIterator](),head:null,previous:null,done:false}));let previous;
  async function next(s){const v=await s.iterator.next();active();if(v.done){s.done=true;s.head=null;return;}const key=order(v.value);need(s.previous===null||cmp(s.previous,key)<0,'HEADERS_BRANCH_ORDER');s.previous=key;s.head=v.value;}
  try{for(const s of states)await next(s);
   for(;;){const available=states.filter(s=>s.head);if(!available.length)break;available.sort((a,b)=>cmp(order(a.head),order(b.head)));const s=available[0],key=order(s.head);
    need(previous===undefined||cmp(previous,key)<0,'HEADERS_GLOBAL_DUPLICATE_OR_ORDER');previous=key;yield s.head;active();await next(s);}
   await verify('AFTER_'+kind);
  }finally{const results=await Promise.allSettled(states.filter(s=>!s.done).map(s=>s.iterator.return?.()));const errors=results.filter(r=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Header composition iterator cleanup failed');}
 }
 return{verify,sourceRows:()=>merge('sourceRows'),typedRows:()=>merge('typedRows'),
  async *documents(){await verify('BEFORE_DOCUMENTS');const seen=new Set();try{for(const s of[sales,transfer])for await(const d of s.documents()){active();const key=d.kind+'/'+d.headerId;need(!seen.has(key),'HEADERS_DUPLICATE_ALLOCATION');seen.add(key);yield structuredClone(d);}await verify('AFTER_DOCUMENTS');}finally{seen.clear();}},
  async close(){if(closing)return closing;closed=true;closing=(async()=>{const r=await Promise.allSettled([sales.close(),transfer.close()]);const e=r.filter(x=>x.status==='rejected');if(e.length)throw new AggregateError(e.map(x=>x.reason),'Header source cleanup failed');})();return closing;}};
}
