import test from 'node:test';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{fixture as productFixture}from'./retained-native-closure-fixtures-20261026/product.mjs';import{fixture as skuFixture}from'./retained-native-closure-fixtures-20261026/sku.mjs';import{fixture as stockFixture}from'./retained-native-closure-fixtures-20261026/stock.mjs';
import{RETAINED_NATIVE_CLOSURE_INDEX_VERSION,captureRetainedNativeClosureRecord26,createRetainedNativeClosureSession26,projectRetainedNativeClosureRecord26}from'./retained-native-closure-streams-20261026.mjs';
const root='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/replica-production-source519-core-20261026-10/source519';const load=p=>import(pathToFileURL(root+'/'+p));
const codec=await load('packages/application/src/history-typed-closure.ts'),original={...codec,...await load('packages/application/src/import-v3-history-settlement.ts'),...await load('packages/application/src/native-product-import.ts'),...await load('packages/application/src/native-sku-import.ts'),...await load('packages/application/src/native-stock-contributor-import.ts')};
const factories={PRODUCTS:productFixture,SKUS:skuFixture,STOCK_CONTRIBUTORS:stockFixture};
const openers={PRODUCTS:(await load('scripts/import-v3/native-product-source26.mjs')).openReviewedProductSource26,SKUS:(await load('scripts/import-v3/native-sku-source26.mjs')).openReviewedSkuSource26,STOCK_CONTRIBUTORS:(await load('scripts/import-v3/native-stock-source26.mjs')).openReviewedStockSource26};
const collect=it=>Array.fromAsync(it),sha=b=>createHash('sha256').update(b).digest('hex'),ordered=rows=>[...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
function session(group,binding,records,options={}){
 const captures=records.map((p,i)=>{const bytes=Buffer.from(JSON.stringify(p)+'\n');return{prepared:p,file:'file'+i,bytes};}),files=Object.fromEntries(captures.map(x=>[x.file,{path:'/SYNTHETIC/'+x.file,bytes:x.bytes.length,sha256:sha(x.bytes)}]));
 const entries=captures.map(x=>captureRetainedNativeClosureRecord26(original,{group,binding,ref:{file:x.file,offset:0,bytes:x.bytes.length,sha256:sha(x.bytes)},prepared:x.prepared}));
 const index={version:RETAINED_NATIVE_CLOSURE_INDEX_VERSION,group,binding,files,records:entries,expected:{records:records.length,sourceRows:entries.reduce((n,e)=>n+e.sources.length,0),typedRows:entries.reduce((n,e)=>n+e.typed.length,0)}};
 let reads=0,closed=0,current=0;const s=createRetainedNativeClosureSession26({original,index,readRecord:async ref=>{reads++;const x=captures.find(v=>v.file===ref.file);assert.equal(sha(x.bytes),ref.sha256);await options.beforeReturn?.();const p=structuredClone(x.prepared);options.mutate?.(p);return p;},verify:async()=>{},close:async()=>{closed++;},current:()=>{current++;},...options});
 return{s,index,reads:()=>reads,closed:()=>closed,current:()=>current};
}
for(const group of Object.keys(factories))test(group+': retained one-read ordered source/typed exactly match existing genuine finite source reader',async t=>{
 const f=await factories[group](t),binding=f.options.binding,p=group==='STOCK_CONTRIBUTORS'?f.groups[0]:f.prepared,reader=await openers[group](f.options);t.after(()=>reader.close());
 const baseline=await reader.openClosure({...binding,authorizedPayloadHash:'b'.repeat(64)},{group,signal:new AbortController().signal});t.after(()=>baseline.close());
 const source=await collect(baseline.sourceRows()),typed=await collect(baseline.typedRows());const x=session(group,binding,[p]);t.after(()=>x.s.close());
 assert.deepEqual(await collect(x.s.documents()),[]);assert.equal(x.reads(),0);await assert.rejects(collect(x.s.typedRows()),/SOURCE_FIRST/);
 assert.deepEqual(await collect(x.s.sourceRows()),source);assert.deepEqual(await collect(x.s.typedRows()),typed);assert.equal(x.reads(),1);
 if(group==='STOCK_CONTRIBUTORS'){assert.deepEqual(typed.map(r=>r.projection.signed_quantity).sort(),['-5','2']);assert.ok(typed.every(r=>r.projection.baseline_ledger_id===null));}
 if(group==='SKUS'){assert.equal(source.length,2);assert.equal(typed.length,3);assert.equal(new Set(source.map(r=>r.key)).size,2);}
 assert.deepEqual(source,ordered(source));assert.deepEqual(typed,ordered(typed));await assert.rejects(collect(x.s.sourceRows()),/SINGLE_SOURCE_PASS/);await assert.rejects(collect(x.s.typedRows()),/SINGLE_TYPED_PASS/);await x.s.close();await x.s.close();assert.equal(x.closed(),1);
});
test('original closure builder per-group finite roots equal existing original source-reader rows',async t=>{
 const allSource=[],allTyped=[],retainedSource=[],retainedTyped=[];
 for(const group of Object.keys(factories)){const f=await factories[group](t),p=group==='STOCK_CONTRIBUTORS'?f.groups[0]:f.prepared,reader=await openers[group](f.options);t.after(()=>reader.close());const baseline=await reader.openClosure({...f.options.binding,authorizedPayloadHash:'b'.repeat(64)},{group,signal:new AbortController().signal});t.after(()=>baseline.close());
  const x=session(group,f.options.binding,[p]);t.after(()=>x.s.close());allSource.push(...await collect(baseline.sourceRows()));allTyped.push(...await collect(baseline.typedRows()));retainedSource.push(...await collect(x.s.sourceRows()));retainedTyped.push(...await collect(x.s.typedRows()));}
 // Fixtures share UUID ranges: test each group's original root separately rather
 // than inventing new identities to force unrelated synthetic batches together.
 assert.deepEqual(ordered(retainedSource),ordered(allSource));assert.deepEqual(ordered(retainedTyped),ordered(allTyped));
 for(const entity of ['PRODUCT','SKU','INVENTORY_BASELINE']){const sources=allSource.filter(r=>r.projection.entity_type===entity),batchId=sources[0].projection.batch_id,typedRelations={PRODUCT:['product'],SKU:['sku','import_sku_alias'],INVENTORY_BASELINE:['import_stock_contributor']}[entity],types=allTyped.filter(r=>typedRelations.includes(r.relation));
  const counts=Object.fromEntries((await load('packages/application/src/history-storage-contract.ts')).HISTORY_COUNT_KEYS.map(k=>[k,k==='import_source_row'?sources.length:k==='import_sku_alias'?types.filter(r=>r.relation===k).length:k==='import_stock_contributor'?types.filter(r=>r.relation===k).length:0]));
  const entityCounts=Object.fromEntries(codec.HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,k===entity?sources.length:0])),scope={batchId,fixedSourceNamespace:'synthetic:finite-retained-roots',selectionSha256:'a'.repeat(64),authorizedPayloadHash:'b'.repeat(64),expectedCounts:counts,expectedSourceEntityCounts:entityCounts,documents:[]};
  const a=await codec.buildHistoryTypedClosureExpected26({...scope,sourceRows:ordered(sources),typedRows:ordered(types)}),b=await codec.buildHistoryTypedClosureExpected26({...scope,sourceRows:ordered(retainedSource.filter(r=>r.projection.entity_type===entity)),typedRows:ordered(retainedTyped.filter(r=>typedRelations.includes(r.relation)))});assert.deepEqual(a,b);
 }
});
test('duplicate membership, range omission, changed prepared facts and forged per-row hash refuse without source substitute',async t=>{
 const f=await skuFixture(t),x=session('SKUS',f.options.binding,[f.prepared]);await x.s.close();
 const opts={original,readRecord:async()=>f.prepared,verify:async()=>{},close:async()=>{},current:()=>{}};
 const duplicate=structuredClone(x.index);duplicate.records.push(duplicate.records[0]);duplicate.expected.records++;assert.throws(()=>createRetainedNativeClosureSession26({...opts,index:duplicate}),/DUPLICATE_IDENTITY/);
 const gap=structuredClone(x.index);gap.records[0].ref.offset=1;assert.throws(()=>createRetainedNativeClosureSession26({...opts,index:gap}),/RANGE_GAP/);
 const changed=session('SKUS',f.options.binding,[f.prepared],{mutate:p=>{p.nativeSku.sku_code='SUBSTITUTED';}});t.after(()=>changed.s.close());await assert.rejects(collect(changed.s.sourceRows()),/PREPARED_CHANGED/);
 const forged=structuredClone(x.index);forged.records[0].typed[0].sha256='f'.repeat(64);const s=createRetainedNativeClosureSession26({...opts,index:forged});t.after(()=>s.close());await assert.rejects(collect(s.sourceRows()));
});
test('late read after close cannot yield/register/cache a record; cancellation and bounded cache abort cleanly',async t=>{
 const f=await stockFixture(t);let x;x=session('STOCK_CONTRIBUTORS',f.options.binding,[f.groups[0]],{beforeReturn:async()=>x.s.close()});await assert.rejects(collect(x.s.sourceRows()),/CLOSED/);assert.equal(x.closed(),1);await x.s.close();assert.equal(x.closed(),1);
 const bounded=session('STOCK_CONTRIBUTORS',f.options.binding,[f.groups[0]],{maxCacheBytes:1});t.after(()=>bounded.s.close());await assert.rejects(collect(bounded.s.sourceRows()),/CACHE_BOUND/);
 const a=new AbortController(),cancelled=session('STOCK_CONTRIBUTORS',f.options.binding,[f.groups[0]],{current:()=>{if(a.signal.aborted)throw Error('SYNTHETIC_CANCELLED');},beforeReturn:async()=>a.abort()});t.after(()=>cancelled.s.close());await assert.rejects(collect(cancelled.s.sourceRows()),/SYNTHETIC_CANCELLED/);
});
test('different physical prepared-record order sorts original source/native IDs, with exactly one read each',async t=>{
 const f=await productFixture(t),make=(sourceId,nativeId)=>{const input=structuredClone(f.input);input.rows[0].source.id=sourceId;input.rows[0].product.nativeId=nativeId;return original.prepareNativeProductImportChunk26(input);};
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,a=make(id(900),id(800)),b=make(id(100),id(200)),x=session('PRODUCTS',f.options.binding,[a,b]);t.after(()=>x.s.close());
 const expected=[a,b].map(p=>projectRetainedNativeClosureRecord26(original,'PRODUCTS',p));
 assert.deepEqual(await collect(x.s.sourceRows()),ordered(expected.flatMap(p=>p.sources)));assert.deepEqual(await collect(x.s.typedRows()),ordered(expected.flatMap(p=>p.typed)));assert.equal(x.reads(),2);
});
