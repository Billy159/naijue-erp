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

// BARCODE finite protocol fixtures use the current accepted original preparer;
// no production payload, approved-decision file or native ID source is opened.
const barcodeRoot='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022';
const barcodeOriginal={...original,...await import(pathToFileURL(barcodeRoot+'/packages/application/src/native-barcode-import.ts'))};
const barcodeColumns=(await import(pathToFileURL(barcodeRoot+'/packages/application/src/import-v2-contract.ts'))).IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE').columns;
const barcodeId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function barcodeFixture(n,{demotion=false,old=false,schemeIndex=0}={}){
 const pin='a'.repeat(64),scheme=barcodeOriginal.nativeBarcodeSchemeInitializationRows26()[schemeIndex].native;
 const fields=Object.fromEntries(barcodeColumns.map(c=>[c.name,'']));
 Object.assign(fields,{'来源编号':'SYNTHETIC:'+n,'条码':'0000SYNTHETIC'+n,'条码性质':demotion||old?'已确认旧码':'主码','原始条码性质快照':old?'已确认旧码':'主码','绑定范围':'SKU','SKU来源编号':'SYNTHETIC_CANONICAL:'+n,'合并前SKU来源编号':'SYNTHETIC_OLD:'+n,'状态':'正常','原条码方案':scheme.name});
 const raw={...fields,'SKU来源编号':fields['合并前SKU来源编号'],'条码性质':fields['原始条码性质快照']};delete raw['绑定范围'];
 const input={batchId:barcodeId(1),fixedSourceNamespace:'synthetic:barcode-retained',selection:{source:'V3_BARCODE_REPLACEMENT',entity:'BARCODE',path:'business/03历史条码.csv',baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,csvSha256:pin,excludedSourceIdsSetSha256:pin},
  source:{id:barcodeId(900-n),batchId:barcodeId(1),entityType:'BARCODE',sourceKey:fields['来源编号'],fileRef:'SYNTHETIC.xlsx',sheet:'SYNTHETIC',rowNo:String(n+1),sourceFileSha256:pin,rowSha256:pin,rawFields:raw,normalizedFields:fields,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,{origin:'ORIGINAL',reason:'SYNTHETIC_ONLY',raw:value}]))}},nativeBarcodeId:barcodeId(100+n),sku:{nativeId:barcodeId(500+n),canonicalSourceKey:fields['SKU来源编号'],oldSourceSkuKey:fields['合并前SKU来源编号']},scheme:{id:scheme.id,snapshot:scheme}};
 if(demotion)input.mainDemotion={version:barcodeOriginal.NATIVE_BARCODE_MAIN_DEMOTION_VERSION,mappingSha256:pin,approvalSha256:pin,entrySha256:pin,sourceKey:input.source.sourceKey,originalSourceRowSha256:pin,oldSourceSkuKey:input.sku.oldSourceSkuKey,canonicalSourceSkuKey:input.sku.canonicalSourceKey,barcode:fields['条码'],keptMainSourceKey:'SYNTHETIC_KEPT',keptMainBarcode:'SYNTHETIC_KEPT_CODE'};
 return barcodeOriginal.prepareNativeBarcode(input);
}
test('BARCODES projection preserves original leading-zero code, MAIN identity and exact approved-demotion provenance',()=>{
 for(const prepared of [barcodeFixture(1),barcodeFixture(2,{demotion:true}),barcodeFixture(3,{old:true})]){
  const before=structuredClone(prepared),p=projectRetainedNativeClosureRecord26(barcodeOriginal,'BARCODES',prepared);
  assert.deepEqual(p.sources,[original.historyClosureProjectionRow26('import_source_row',barcodeOriginal.nativeBarcodeSourceEvidence(prepared))]);
  assert.deepEqual(p.typed,[original.historyClosureProjectionRow26('sku_barcode',prepared.nativeBarcode)]);assert.deepEqual(prepared,before);
  assert.equal(p.typed[0].projection.barcode,prepared.source.rawFields['条码']);assert.equal(p.typed[0].projection.id,prepared.nativeBarcodeId);assert.equal(p.typed[0].projection.sku_id,prepared.sku.nativeId);
  assert.equal(Object.hasOwn(p.sources[0].projection.raw_fields,'绑定范围'),false);
  if(prepared.mainDemotion)assert.deepEqual(p.sources[0].projection.field_provenance.native_barcode_import.main_demotion,prepared.mainDemotion);
  const changed=structuredClone(prepared);changed.nativeBarcode.barcode_kind=prepared.nativeBarcode.barcode_kind==='MAIN'?'CONFIRMED_OLD':'MAIN';assert.throws(()=>projectRetainedNativeClosureRecord26(barcodeOriginal,'BARCODES',changed),/Prepared barcode changed/);
 }
});
function barcodeSessionFixture(records=[barcodeFixture(1),barcodeFixture(2,{demotion:true}),barcodeFixture(3,{old:true})],options={}){
 const binding={batchId:records[0].batchId,fixedSourceNamespace:records[0].fixedSourceNamespace,cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:records[0].selection.selectionSha256};
 const encoded=records.map(p=>Buffer.from(JSON.stringify(p)+'\n'));let offset=0;
 const entries=records.map((p,n)=>{const projected=projectRetainedNativeClosureRecord26(barcodeOriginal,'BARCODES',p),e={ordinal:n,sourceKey:p.source.sourceKey,sourceRowId:p.source.id,nativeBarcodeId:p.nativeBarcodeId,
  prepared:{offset,bytes:encoded[n].length,sha256:sha(encoded[n]),fingerprint:p.fingerprint},original:{offset:n*10,bytes:1,sha256:p.source.rowSha256},
  source:{relation:projected.sources[0].relation,key:projected.sources[0].key,sha256:original.historyClosureRowHash(projected.sources[0])},typed:{relation:projected.typed[0].relation,key:projected.typed[0].key,sha256:original.historyClosureRowHash(projected.typed[0])}};offset+=encoded[n].length;return e;});
 const cmp=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)),order=field=>entries.toSorted((a,b)=>cmp(a[field].key,b[field].key)).map(e=>e.ordinal);
 const index={version:'ORIGINAL_BARCODE15018_APPROVED_SOURCE_CAPTURE_26_V1',binding,selectedRows:records.length,summary:{rows:records.length},source:{bytes:records.length*10},artifacts:{prepared:{path:'/SYNTHETIC/retained-prepared.jsonl',bytes:offset,sha256:sha(Buffer.concat(encoded))}},inputPins:{proposal:{sha256:'a'.repeat(64)},approval:{sha256:'b'.repeat(64)}},records:entries,
  permutations:{version:'BARCODE15018_RETAINED_GLOBAL_ORDER_26_V1',source:order('source'),typed:order('typed'),schemes:{version:'APPROVED_EXACT6_BARCODE_INITIALIZATION_INPUT_26_V1',binding:structuredClone(binding),rows:barcodeOriginal.nativeBarcodeSchemeInitializationRows26(),proposalSha256:'a'.repeat(64),approvalSha256:'b'.repeat(64),humanQuestionCallId:'SYNTHETIC_ONLY'}}};
 let reads=0,closed=0;const used=new Set();
 const callbacks={original:barcodeOriginal,readRecord:async ref=>{reads++;assert.equal(ref.file,'prepared');const n=entries.findIndex(e=>e.prepared.offset===ref.offset);assert.ok(n>=0);assert.equal(ref.bytes,encoded[n].length);assert.equal(ref.sha256,sha(encoded[n]));assert.equal(used.has(n),false);used.add(n);await options.beforeReturn?.();const p=structuredClone(records[n]);options.mutate?.(p);return p;},verify:async()=>{},close:async()=>{closed++;},current:()=>{}};
 const open=(changed=index)=>createRetainedNativeClosureSession26({...callbacks,...options,index:changed});
 return{index,open,records,reads:()=>reads,closed:()=>closed};
}
test('BARCODES captured index consumes original permutations/ranges once, merges exact6 schemes once and equals original finite closure roots',async t=>{
 const f=barcodeSessionFixture(),before=structuredClone(f.index),s=f.open();t.after(()=>s.close());
 await assert.rejects(collect(s.typedRows()),/SOURCE_FIRST/);assert.deepEqual(await collect(s.documents()),[]);assert.equal(f.reads(),0);
 const sources=await collect(s.sourceRows()),types=await collect(s.typedRows());assert.equal(f.reads(),3);assert.deepEqual(f.index,before);
 const expectedSources=ordered(f.records.map(p=>original.historyClosureProjectionRow26('import_source_row',barcodeOriginal.nativeBarcodeSourceEvidence(p))));
 const expectedTyped=ordered([...f.records.map(p=>original.historyClosureProjectionRow26('sku_barcode',p.nativeBarcode)),...barcodeOriginal.nativeBarcodeSchemeInitializationRows26().map(r=>original.historyClosureProjectionRow26('barcode_scheme',r.native))]);
 assert.deepEqual(sources,expectedSources);assert.deepEqual(types,expectedTyped);assert.equal(types.filter(r=>r.relation==='barcode_scheme').length,6);assert.equal(new Set(types.map(r=>r.relation+'\0'+r.key)).size,9);
 assert.equal(types.filter(r=>r.relation==='barcode_scheme'&&r.projection.status==='CURRENT').length,1);assert.equal(types.filter(r=>r.relation==='sku_barcode'&&r.projection.barcode_kind==='MAIN').length,1);
 const countKeys=(await load('packages/application/src/history-storage-contract.ts')).HISTORY_COUNT_KEYS;
 const scope={batchId:f.index.binding.batchId,fixedSourceNamespace:f.index.binding.fixedSourceNamespace,selectionSha256:f.index.binding.selectionSha256,authorizedPayloadHash:'c'.repeat(64),expectedCounts:Object.fromEntries(countKeys.map(k=>[k,k==='import_source_row'||k==='barcodes'?3:0])),expectedSourceEntityCounts:Object.fromEntries(codec.HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,k==='BARCODE'?3:0])),documents:[]};
 assert.deepEqual(await codec.buildHistoryTypedClosureExpected26({...scope,sourceRows:sources,typedRows:types}),await codec.buildHistoryTypedClosureExpected26({...scope,sourceRows:expectedSources,typedRows:expectedTyped}));
 await assert.rejects(collect(s.sourceRows()),/SINGLE_SOURCE_PASS/);await assert.rejects(collect(s.typedRows()),/SINGLE_TYPED_PASS/);await s.close();await s.close();assert.equal(f.closed(),1);
});
test('BARCODES original metadata rejects missing/count/duplicate/range/order/scheme drift instead of repairing or reindexing',()=>{
 const f=barcodeSessionFixture();
 for(const change of [
  x=>x.records.pop(),x=>{x.records[1].ordinal=0;},x=>{x.records[1].sourceKey=x.records[0].sourceKey;},x=>{x.records[1].nativeBarcodeId=x.records[0].nativeBarcodeId;},
  x=>{x.records[1].prepared.offset++;},x=>{x.records[1].original.offset=0;},x=>{x.permutations.source[0]=x.permutations.source[1];},x=>{x.permutations.typed.pop();},
  x=>x.permutations.source.reverse(),x=>x.permutations.typed.reverse(),x=>{x.permutations.schemes.rows[0].native.code_length=99;},x=>{x.permutations.schemes.binding.batchId=barcodeId(9);},
  x=>{x.permutations.schemes.approvalSha256='f'.repeat(64);},x=>{x.records[0].source.relation='sku_barcode';}
 ]){const changed=structuredClone(f.index);change(changed);assert.throws(()=>f.open(changed));}
 assert.equal(f.reads(),0);
});
test('BARCODES read verifies original identities, prepared facts and both captured canonical row hashes',async t=>{
 for(const mutate of [p=>{p.source.id=barcodeId(99);},p=>{p.nativeBarcodeId=barcodeId(99);},p=>{p.source.rowSha256='f'.repeat(64);},p=>{p.nativeBarcode.barcode='SUBSTITUTED';},p=>{p.scheme.snapshot.name='SUBSTITUTED';}]){
  const f=barcodeSessionFixture(undefined,{mutate}),s=f.open();t.after(()=>s.close());await assert.rejects(collect(s.sourceRows()));assert.equal(f.reads(),1);
 }
 for(const field of ['source','typed']){const f=barcodeSessionFixture(),index=structuredClone(f.index);for(const e of index.records)e[field].sha256='f'.repeat(64);const s=f.open(index);t.after(()=>s.close());await assert.rejects(collect(s.sourceRows()));assert.equal(f.reads(),1);}
});
test('BARCODES late-read close, cancellation and cache bounds cannot yield or retain escaped rows',async t=>{
 let s;const f=barcodeSessionFixture(undefined,{beforeReturn:async()=>s.close()});s=f.open();await assert.rejects(collect(s.sourceRows()),/CLOSED/);assert.equal(f.reads(),1);assert.equal(f.closed(),1);await s.close();assert.equal(f.closed(),1);
 let aborted=false;const cancelled=barcodeSessionFixture(undefined,{current:()=>{if(aborted)throw Error('SYNTHETIC_BARCODE_CANCELLED');},beforeReturn:async()=>{aborted=true;}}),cancel=cancelled.open();t.after(()=>cancel.close());await assert.rejects(collect(cancel.sourceRows()),/SYNTHETIC_BARCODE_CANCELLED/);
 const bounded=barcodeSessionFixture(undefined,{maxCacheBytes:1}),small=bounded.open();t.after(()=>small.close());await assert.rejects(collect(small.sourceRows()),/CACHE_BOUND/);assert.equal(bounded.reads(),0);
});
