// Retained PRODUCTS/SKUS/STOCK data projection and ordering only.
// Uses original prepared validators, evidence constructors and canonical codec.
// No file opening, source re-producer, native binding allocation or authority.
import assert from 'node:assert/strict';
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const cmp=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)),key=r=>r.relation+'\0'+r.key;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const limits={PRODUCTS:{records:30,source:2956,typed:2956},SKUS:{records:14999,source:15121,typed:30120},STOCK_CONTRIBUTORS:{records:38303,source:38314,typed:38314}};
export const RETAINED_NATIVE_CLOSURE_INDEX_VERSION='RETAINED_NATIVE_CLOSURE_INDEX_26_V1';
/** Exact projections from the existing original three openClosure methods. */
export function projectRetainedNativeClosureRecord26(original,group,prepared){
 const project=original.historyClosureProjectionRow26,sources=[],typed=[];need(limits[group],'RETAINED_NATIVE_GROUP');
 if(group==='PRODUCTS'){
  // Original whole-chunk API validates once, avoiding per-row chunk revalidation.
  const evidence=original.nativeProductImportEvidences26(prepared);
  for(let i=0;i<evidence.length;i++){sources.push(project('import_source_row',evidence[i].source));typed.push(project('product',prepared.nativeProducts[i]));}
 }else if(group==='SKUS'){
  original.validatePreparedNativeSkuImport26(prepared);typed.push(project('sku',prepared.nativeSku));
  for(const alias of prepared.aliases){const s=alias.source;sources.push(project('import_source_row',original.nativeSkuAliasEvidence26(prepared,alias)));
   typed.push(project('import_sku_alias',{batch_id:prepared.batchId,old_source_sku_id:s.sourceKey,canonical_sku_id:prepared.nativeSku.id,source_row_id:s.id,canonical_source_key:prepared.canonicalSource.sourceKey,mapping_basis:alias.mapping.mappingBasis}));}
 }else{
  original.validatePreparedNativeStockGroup(prepared);
  // Same nine fields as native-stock-source26.mjs private typed(group,row).
  for(const c of prepared.contributors){sources.push(project('import_source_row',original.nativeStockSourceEvidence(prepared,c)));
   typed.push(project('import_stock_contributor',{batch_id:prepared.batchId,source_row_id:c.source.id,warehouse_id:prepared.warehouse.nativeId,canonical_sku_id:prepared.sku.nativeId,
    old_source_sku_id:c.lineage.oldSkuSourceId,canonical_stock_source_key:prepared.canonicalStock.来源编号,source_unit:c.lineage.sourceUnit,signed_quantity:c.lineage.signedQuantity,baseline_ledger_id:null}));}
 }
 return{sources,typed};
}
function scoped(original,group,prepared,binding){
 need(prepared?.batchId===binding.batchId&&prepared.fixedSourceNamespace===binding.fixedSourceNamespace&&prepared.selection?.selectionSha256===binding.selectionSha256&&hash(prepared.fingerprint),'RETAINED_NATIVE_RECORD_BINDING');
 const p=projectRetainedNativeClosureRecord26(original,group,prepared);
 need(p.sources.length>0&&p.typed.length>0&&p.sources.every(r=>r.relation==='import_source_row'&&r.projection.batch_id===binding.batchId)&&p.typed.every(r=>Object.hasOwn(r.projection,'batch_id')?r.projection.batch_id===binding.batchId:['product','sku'].includes(r.relation)),'RETAINED_NATIVE_PROJECTION_SCOPE');return p;
}
/** Capture during a separately approved finite prepared-file pass. ref is the
 * original file ID + byte range including LF for JSONL (whole file for product).
 * Caller pins raw bytes/file membership; no body is persisted in this index. */
export function captureRetainedNativeClosureRecord26(original,{group,binding,ref,prepared}){
 need(typeof ref?.file==='string'&&Number.isSafeInteger(ref.offset)&&ref.offset>=0&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=4194304&&hash(ref.sha256),'RETAINED_NATIVE_RANGE');
 const rows=scoped(original,group,prepared,binding),descriptor=r=>({relation:r.relation,key:r.key,sha256:original.historyClosureRowHash(r)});
 return{ref:structuredClone(ref),fingerprint:prepared.fingerprint,preparedHash:original.historySettlementRequestHash(prepared),sources:rows.sources.map(descriptor),typed:rows.typed.map(descriptor)};
}
/** Original five-method closure session. Index must be captured/authenticated by
 * the real original carrier. readRecord(ref) verifies original range SHA and
 * returns original prepared JSON. It does not reprepare bindings/recapture source.
 * One range read per prepared record in sourceUUID order: pending sibling source
 * projections plus all typed rows are retained as bounded JSON buffers only.
 * The original all11 builder consumes source streams before typed streams. */
export function createRetainedNativeClosureSession26({original,index,readRecord,verify,close,current,maxCacheBytes=64*1024*1024}){
 need(Buffer.byteLength(JSON.stringify(index))<=64*1024*1024,'RETAINED_NATIVE_INDEX_MEMORY_BOUND');
 const fixed=structuredClone(index),cap=limits[fixed?.group];need(cap&&fixed.version===RETAINED_NATIVE_CLOSURE_INDEX_VERSION&&Array.isArray(fixed.records)&&fixed.records.length>0&&fixed.records.length<=cap.records,'RETAINED_NATIVE_INDEX');
 need([readRecord,verify,close,current].every(f=>typeof f==='function')&&Number.isSafeInteger(maxCacheBytes)&&maxCacheBytes>0&&maxCacheBytes<=64*1024*1024,'RETAINED_NATIVE_CAPABILITIES');
 const expected=fixed.expected;need(expected&&expected.records===fixed.records.length&&expected.sourceRows>0&&expected.sourceRows<=cap.source&&expected.typedRows>0&&expected.typedRows<=cap.typed,'RETAINED_NATIVE_COUNTS');
 const files=new Map(Object.entries(fixed.files??{})),ranges=new Map([...files.keys()].map(k=>[k,[]])),source=[],typed=[],sourceKeys=new Set(),typedKeys=new Set();
 for(let n=0;n<fixed.records.length;n++){const e=fixed.records[n],r=e.ref;need(files.has(r?.file)&&Number.isSafeInteger(r.offset)&&r.offset>=0&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=4194304&&hash(r.sha256)&&hash(e.fingerprint)&&hash(e.preparedHash),'RETAINED_NATIVE_ENTRY');ranges.get(r.file).push(r);
  for(const[kind,out,seen]of[['sources',source,sourceKeys],['typed',typed,typedKeys]]){need(Array.isArray(e[kind])&&e[kind].length>0,'RETAINED_NATIVE_EMPTY_RECORD');for(const d of e[kind]){
   need(typeof d.relation==='string'&&typeof d.key==='string'&&d.key.length>0&&!d.key.includes('\0')&&hash(d.sha256)&&!seen.has(key(d)),'RETAINED_NATIVE_DUPLICATE_IDENTITY');seen.add(key(d));out.push({record:n,...d});}}
 }
 need(source.length===expected.sourceRows&&typed.length===expected.typedRows,'RETAINED_NATIVE_COMPLETE_COUNTS');
 for(const[file,ref]of files){need(typeof ref.path==='string'&&ref.path.startsWith('/')&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&hash(ref.sha256)&&ranges.get(file).length>0,'RETAINED_NATIVE_FILE_PIN');
  let end=0;for(const range of ranges.get(file).sort((a,b)=>a.offset-b.offset)){need(range.offset===end,'RETAINED_NATIVE_RANGE_GAP');end+=range.bytes;}need(end===ref.bytes,'RETAINED_NATIVE_FILE_EOF');}
 source.sort((a,b)=>cmp(key(a),key(b)));typed.sort((a,b)=>cmp(key(a),key(b)));
 let ended=false,closing,sourceStarted=false,sourceComplete=false,typedStarted=false,cacheBytes=0,readCount=0;const read=new Set(),pendingSource=new Map(),typedCache=new Map();
 const active=()=>{need(!ended,'RETAINED_NATIVE_CLOSED');current();};
 async function check(phase){active();need(await verify(phase)===undefined,'RETAINED_NATIVE_VERIFY_RESULT');active();}
 function save(cache,row){const id=key(row),bytes=Buffer.from(JSON.stringify(row));
  // JSON is transport only; original canonical hash proves exact round-trip.
  need(original.historyClosureRowHash(JSON.parse(bytes))===original.historyClosureRowHash(row),'RETAINED_NATIVE_CACHE_ROUNDTRIP');
  need(!cache.has(id)&&cacheBytes+bytes.length<=maxCacheBytes,'RETAINED_NATIVE_CACHE_BOUND');cache.set(id,bytes);cacheBytes+=bytes.length;}
 function take(cache,id){const bytes=cache.get(id);need(bytes,'RETAINED_NATIVE_CACHE_MEMBERSHIP');cache.delete(id);cacheBytes-=bytes.length;return JSON.parse(bytes);}
 async function consume(n){need(!read.has(n),'RETAINED_NATIVE_RECORD_REREAD');active();const e=fixed.records[n],p=await readRecord(structuredClone(e.ref));active();
  need(p?.fingerprint===e.fingerprint&&original.historySettlementRequestHash(p)===e.preparedHash,'RETAINED_NATIVE_PREPARED_CHANGED');
  const rows=scoped(original,fixed.group,p,fixed.binding),describe=r=>({relation:r.relation,key:r.key,sha256:original.historyClosureRowHash(r)});
  assert.deepEqual(rows.sources.map(describe),e.sources);assert.deepEqual(rows.typed.map(describe),e.typed);
  for(const r of rows.sources)save(pendingSource,r);for(const r of rows.typed)save(typedCache,r);read.add(n);readCount++;
 }
 return{verify:check,async *sourceRows(){await check('BEFORE_SOURCE');need(!sourceStarted,'RETAINED_NATIVE_SINGLE_SOURCE_PASS');sourceStarted=true;
   for(const d of source){active();if(!pendingSource.has(key(d)))await consume(d.record);active();yield take(pendingSource,key(d));active();}
   need(readCount===expected.records&&pendingSource.size===0&&typedCache.size===expected.typedRows,'RETAINED_NATIVE_COMPLETE_SOURCE_PASS');await check('AFTER_SOURCE');sourceComplete=true;},
  async *typedRows(){await check('BEFORE_TYPED');need(sourceComplete&&!typedStarted,'RETAINED_NATIVE_SOURCE_FIRST_SINGLE_TYPED_PASS');typedStarted=true;for(const d of typed){active();yield take(typedCache,key(d));active();}need(cacheBytes===0,'RETAINED_NATIVE_CACHE_DRAIN');await check('AFTER_TYPED');},
  async *documents(){await check('NO_NATIVE_DOCUMENT_ALLOCATIONS');},
  async close(){if(closing)return closing;ended=true;pendingSource.clear();typedCache.clear();cacheBytes=0;read.clear();source.length=0;typed.length=0;fixed.records.length=0;
   closing=Promise.resolve().then(close);return closing;}};
}
