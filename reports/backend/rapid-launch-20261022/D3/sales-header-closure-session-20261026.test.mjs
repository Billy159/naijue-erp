import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import{prepareRetainedSalesHeaderWindow}from'./prepare-retained-sales-header-window-20261026.mjs';
import{SALES_HEADER_CLOSURE_INDEX_VERSION,captureSalesHeaderClosureEntry,createSalesHeaderClosureSession,createCapturedSalesChildClosureSession,composeHeaderClosureSessions}from'./sales-header-closure-session-20261026.mjs';
const root='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/local-takeover-20261021-control/reports/controller/rapid-launch-20261022/replica-production-source519-core-20261026-10/source519';
const load=p=>import(pathToFileURL(root+'/'+p));
const codec=await load('packages/application/src/history-typed-closure.ts');
const{openAuthorizedHistoryClosureReader26,HISTORY_CLOSURE_SOURCE_GROUPS}=await load('scripts/import-v2/authorized-history-closure-reader.mjs');
const{HISTORY_COUNT_KEYS}=await load('packages/application/src/history-storage-contract.ts');
const{createNativeHeader26BindingPreparer}=await load('scripts/import-v3/prepare-native-header26-bindings.mjs');
const{IMPORT_V2_TABLES,v2MoneyApprovalSet}=await(async()=>({...await load('packages/application/src/import-v2-contract.ts'),...await load('packages/application/src/import-v2.ts')}))();
const{prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk}=await load('packages/application/src/import-v3-history-header-staging.ts');
const source={prepareV3HistoryHeaderChunk,validatePreparedHistoryHeaderChunk,historyClosureProjectionRow26:codec.historyClosureProjectionRow26};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,H='a'.repeat(64);
function fixture(){
 const binding={batchId:id(1),fixedSourceNamespace:'synthetic-known',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:H};
 const parties=[{entity:'HALL',sourceKey:'H1',nativeSnapshot:{id:id(10),name:'Synthetic Hall',version:1,default_customer_id:null,default_sales_warehouse_id:null,enabled:true}},
 {entity:'WAREHOUSE',sourceKey:'W1',nativeSnapshot:{id:id(20),name:'Synthetic Warehouse',version:1,hall_id:id(10),enabled:true,created_operation_id:null}},
 {entity:'CUSTOMER',sourceKey:'C1',nativeSnapshot:{id:id(30),name:'Synthetic Customer',version:1,code:'0001',enabled:true,created_at:null,updated_at:null}}];
 const historicalCustomers=[{sourceKey:'HIST-CUSTOMER:'+id(60),originalPartyIdentity:id(60),sourceDocumentNumber:'INV-2',nativeSnapshot:{id:id(50),name:'Synthetic Historic',version:1,code:'0002',enabled:false,created_at:null,updated_at:null}}];
 const moneyApprovals=Array.from({length:32},(_,i)=>({fileSha256:H,sheet:'HEADER',row:String(i+20),sourceId:'MONEY'+i,field:'优惠前金额',rawValue:'1.00000000000001',exactCentValue:'1.00'}));
 function record(i,hall,customer='C1'){
  const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='SALES_HEADER').columns.map(c=>[c.name,'']));
  Object.assign(n,{来源编号:'DOC-'+i,原单号:'INV-'+i,业务日期:'2024-02-29',原审核状态:'未审核',创建厅归属来源:'UNKNOWN',创建厅归属原因:'UNKNOWN_ORIGINAL_CREATOR_UNMATCHED',单据类型:'销售',所属厅来源编号:hall,客户来源编号:customer,仓库来源编号:'W1',优惠前金额:'10.00',整单优惠:'1',应结金额:'8.50'});
  const raw={...n,原创建厅编号:'UPLOADED_HALL'};delete raw.创建厅归属来源;delete raw.创建厅归属原因;
  return{source:{id:id(100+i),batchId:binding.batchId,entityType:'SALES_HEADER',sourceKey:n.来源编号,fileRef:'SYNTHETIC.xlsx',sheet:'HEADER',rowNo:String(i+2),sourceFileSha256:H,rowSha256:H,rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:{}}},selection:{entity:'SALES_HEADER',source:'BASE_V2',path:'business/13历史销货单头.csv',baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H},creatorHallOverlay:{evidenceRef:'synthetic.csv#'+i,file:'SYNTHETIC.xlsx',sheet:'HEADER',row:String(i+2),sourceId:n.来源编号,documentNumber:n.原单号,personField:'营业员来源编号',personId:'',uploadedWarehouseDerivedHall:'UPLOADED_HALL',candidateCreatorHall:'',provenance:'UNKNOWN',reason:n.创建厅归属原因},temporalEvidence:{}};
 }
 return{context:{binding,parties,historicalCustomers,moneyApprovals},record};
}

function overlay(f,r){const s=r.source;return{version:'USER_CONFIRMED_HISTORY_BUSINESS_HALL_OVERLAY_1',batchId:s.batchId,fixedSourceNamespace:f.context.binding.fixedSourceNamespace,selectionSha256:H,sourceKey:s.sourceKey,warehouseSourceKey:'W1',targetHallSourceKey:'H1',targetHallNativeId:id(10),sourceFileRef:s.fileRef,sourceFileSha256:s.sourceFileSha256,sheet:s.sheet,rowNo:s.rowNo,originalBusinessHall:'',provenance:'MIGRATION_DERIVED',reason:'USER_CONFIRMED_WAREHOUSE_TO_BUSINESS_HALL',decisionSource:{threadId:'synthetic-human',humanMessageId:'synthetic-decision',continueMessageId:'synthetic-continue',adoptionOwner:'C',scope:'ALL2471_WAREHOUSE_TO_BUSINESS_HALL_MAPPING_USER_CONFIRMED',originalBlankNotClaimedHistoricalFact:true},evidenceRef:'USER_DECISION:synthetic-human:synthetic-decision#'+s.sourceKey};}

function inputs(){const f=fixture(),a=f.record(1,'H1'),b=f.record(2,''),o=overlay(f,b),pa=createNativeHeader26BindingPreparer({...f.context,expected:{SALES_HEADER:1,TRANSFER_HEADER:0,historicalReferences:0}}),known=pa.prepare(a);pa.finish();const pb=createNativeHeader26BindingPreparer({...f.context,businessHallOverlays:new Map([[b.source.sourceKey,o]]),expected:{SALES_HEADER:1,TRANSFER_HEADER:0,historicalReferences:0}}),mapped=pb.prepare(b);pb.finish();const{moneyApprovals,...saved}=mapped.input;void moneyApprovals;
 return{binding:f.context.binding,moneyApprovals:v2MoneyApprovalSet(f.context.moneyApprovals,f.context.moneyApprovals),items:[{partition:'KNOWN25811',value:{record:a,prepared:known.prepared,decision:known.decision}},{partition:'MAPPED2471',value:{originalRecord:b,input:saved,prepared:mapped.prepared,decision:mapped.decision}}]};}

const ordered=rows=>[...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
const collect=async it=>{const rows=[];for await(const r of it)rows.push(r);return rows;};
function headerFixture(options={}){const input=inputs(),restored=prepareRetainedSalesHeaderWindow(source,input);let reads=0,closed=false;
 const entries=restored.projections.map((projection,i)=>captureSalesHeaderClosureEntry(codec,{partition:input.items[i].partition,offset:0,bytes:100+i,projection,fingerprint:input.items[i].value.prepared.fingerprint}));
 const index={version:SALES_HEADER_CLOSURE_INDEX_VERSION,binding:input.binding,rows:2,partitions:{KNOWN25811:{path:'/synthetic-known',bytes:100,rows:1,sha256:H},MAPPED2471:{path:'/synthetic-mapped',bytes:101,rows:1,sha256:H}},entries};
 const session=createSalesHeaderClosureSession({index,sourceCodec:codec,readPrepared:async(partition,range)=>{reads++;assert.deepEqual(range,{offset:0,bytes:partition==='KNOWN25811'?100:101});if(options.beforeReturn)await options.beforeReturn();const v=structuredClone(input.items.find(i=>i.partition===partition).value);if(options.change)options.change(v);return v;},verify:async()=>{if(options.verify)await options.verify();},close:async()=>{closed=true;},current:()=>{if(options.current)options.current();}});
 return{index,session,input,restored,reads:()=>reads,closed:()=>closed};}
function stream(rows){return async function*(){for(const r of rows)yield structuredClone(r);};}
function inert(sourceRows=[],typedRows=[],documents=[]){let closed=false;const current=()=>assert.equal(closed,false);return{verify:async()=>{current();},sourceRows:stream(ordered(sourceRows)),typedRows:stream(ordered(typedRows)),documents:async function*(){current();for(const d of documents)yield structuredClone(d);},close:async()=>{closed=true;}};}
function childSource(binding,entity,key,sid,parent){return codec.historyClosureProjectionRow26('import_source_row',{id:sid,batch_id:binding.batchId,entity_type:entity,source_key:key,file_ref:'SYNTHETIC.json',sheet:'SYNTHETIC',row_no:String(Number.parseInt(sid.slice(-6))),source_file_sha256:H,row_sha256:H,raw_fields:{来源编号:key,单据来源编号:parent},normalized_fields:{来源编号:key,单据来源编号:parent},field_provenance:{schema_version:1,fields:{}}});}
function typed(relation,values){const spec=codec.historyClosureProjectionSpec26().find(s=>s.relation===relation);return codec.historyClosureProjectionRow26(relation,{...Object.fromEntries(spec.columns.map(c=>[c,null])),...values});}
function fullFixture(){const h=headerFixture(),b=h.input.binding,alloc=h.restored.projections.map(p=>p.document);
 const lineSources=alloc.map((d,i)=>childSource(b,'SALES_LINE','line-'+i,id(501+i),d.sourceKey));
 const lineTyped=alloc.map((d,i)=>typed('history_sales_line',{id:id(601+i),source_row_id:id(501+i),batch_id:b.batchId,header_id:d.headerId,line_no:i+1,sku_id:id(4),quantity:i===0?'-2':'3',deal_price:'1.00',line_amount:i===0?'-2.00':'3.00',is_gift:false}));
 const settlementSource=childSource(b,'SETTLEMENT','settlement-0',id(701),alloc[0].sourceKey),settlementTyped=typed('history_sales_settlement',{id:id(702),source_row_id:id(701),batch_id:b.batchId,header_id:alloc[0].headerId,line_no:1,payment_account_id:id(20),direction:'REFUND',amount:'7.03'});
 const transferDocument={kind:'TRANSFER',sourceKey:'transfer-0',headerSourceRowId:id(801),headerId:id(802)},transferSource=childSource(b,'TRANSFER_HEADER',transferDocument.sourceKey,id(801),transferDocument.sourceKey);
 const transferTyped=typed('history_transfer_header',{id:id(802),source_row_id:id(801),batch_id:b.batchId,version:1,number:'SYN-T',source_status:'DRAFT',created_hall_provenance:'UNKNOWN',created_hall_reason:'ORIGINAL_UNKNOWN',from_warehouse_id:id(20),to_warehouse_id:id(21)});
 const transferLineSource=childSource(b,'TRANSFER_LINE','transfer-line-0',id(803),transferDocument.sourceKey),transferLineTyped=typed('history_transfer_line',{id:id(804),source_row_id:id(803),batch_id:b.batchId,header_id:id(802),line_no:1,sku_id:id(4),quantity:'-3'});
 const sales=createCapturedSalesChildClosureSession({entity:'SALES_LINE',binding:b,expectedRows:2,sourceRows:stream(ordered(lineSources)),typedRows:stream(ordered(lineTyped)),sourceCodec:codec,verify:async()=>{},close:async()=>{},current:()=>{}});
 const settlement=createCapturedSalesChildClosureSession({entity:'SETTLEMENT',binding:b,expectedRows:1,sourceRows:stream([settlementSource]),typedRows:stream([settlementTyped]),sourceCodec:codec,verify:async()=>{},close:async()=>{},current:()=>{}});
 const headers=composeHeaderClosureSessions({sales:h.session,transfer:inert([transferSource],[transferTyped],[transferDocument]),current:()=>{}});
 const factories=Object.fromEntries(HISTORY_CLOSURE_SOURCE_GROUPS.map(group=>[group,async()=>group==='HEADERS'?headers:group==='SALES_DETAILS'?sales:group==='SETTLEMENTS'?settlement:group==='TRANSFER_LINES'?inert([transferLineSource],[transferLineTyped]):inert()]));
 const expectedCounts=Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0]));Object.assign(expectedCounts,{history_sales_header:2,history_sales_line:2,history_sales_settlement:1,history_transfer_header:1,history_transfer_line:1,import_source_row:7});
 const expectedSourceEntityCounts=Object.fromEntries(codec.HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0]));Object.assign(expectedSourceEntityCounts,{SALES_HEADER:2,SALES_LINE:2,SETTLEMENT:1,TRANSFER_HEADER:1,TRANSFER_LINE:1});
 return{h,scope:{batchId:b.batchId,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,authorizedPayloadHash:H,expectedCounts,expectedSourceEntityCounts},factories,
  documents:[...alloc,transferDocument],sourceRows:ordered([...h.restored.projections.map(p=>p.sourceRow),...lineSources,settlementSource,transferSource,transferLineSource]),typedRows:ordered([...h.restored.projections.map(p=>p.typedRow),...lineTyped,settlementTyped,transferTyped,transferLineTyped])};}
test('compact headers emit allocation without body reads; one source range pass supplies both global streams via bounded typed cache',async()=>{
 const f=headerFixture();const docs=await collect(f.session.documents());assert.equal(docs.length,2);assert.equal(f.reads(),0);
 await assert.rejects(collect(f.session.typedRows()),/COMPLETE_SOURCE_PASS_REQUIRED/);
 const a=await collect(f.session.sourceRows()),b=await collect(f.session.typedRows());assert.equal(f.reads(),2);assert.deepEqual(a,ordered(f.restored.projections.map(p=>p.sourceRow)));assert.deepEqual(b,ordered(f.restored.projections.map(p=>p.typedRow)));
 await f.session.close();assert.equal(f.closed(),true);await assert.rejects(collect(f.session.documents()),/CLOSED/);
});
test('existing all11 reader computes exact sales+settlement+transfer doc9 roots equal original canonical builder; no new hash algorithm',async()=>{
 const f=fullFixture();const baseline=await codec.buildHistoryTypedClosureExpected26({...f.scope,documents:f.documents,sourceRows:f.sourceRows,typedRows:f.typedRows});
 const reader=await openAuthorizedHistoryClosureReader26({scope:f.scope,openSources:f.factories,trustedSelectionSha256:f.scope.selectionSha256,trustedAuthorizedPayloadHash:H});
 const actual=await reader.expected();assert.deepEqual(actual,baseline);assert.equal(actual.plan.documentCount,3);assert.equal(actual.documents.filter(d=>d.kind==='SALES').length,2);assert.equal(actual.documents.filter(d=>d.kind==='TRANSFER').length,1);assert.equal(actual.documents.reduce((n,d)=>n+d.settlementCount,0),1);assert.equal(f.h.reads(),2);assert.equal(f.h.closed(),true);await reader.close();
});
test('compact wrong fingerprint or projected facts, duplicate identities and incomplete byte coverage refuse',async()=>{
 const changed=headerFixture({change:v=>{v.prepared.header.netDue='999.00';}});await assert.rejects(collect(changed.session.sourceRows()),/PROJECTION_CHANGED/);await changed.session.close();
 const wrong=headerFixture({change:v=>{v.prepared.fingerprint='f'.repeat(64);}});await assert.rejects(collect(wrong.session.sourceRows()),/CAPTURE_CHANGED/);await wrong.session.close();
 const f=headerFixture();const args={sourceCodec:codec,readPrepared:async()=>{},verify:async()=>{},close:async()=>{},current:()=>{}};const duplicate=structuredClone(f.index);duplicate.entries[1].sourceRowId=duplicate.entries[0].sourceRowId;assert.throws(()=>createSalesHeaderClosureSession({...args,index:duplicate}),/ENTRY/);
 const gap=structuredClone(f.index);gap.entries[0].offset=1;assert.throws(()=>createSalesHeaderClosureSession({...args,index:gap}),/COMPLETE_RANGES/);await f.session.close();
});
test('child stream count/order/entity defects and closed-await refuse instead of supplying partial closure',async()=>{
 const f=fullFixture(),b=f.scope;const row=f.sourceRows.find(r=>r.projection.entity_type==='SALES_LINE');
 const make=overrides=>createCapturedSalesChildClosureSession({entity:'SALES_LINE',binding:b,expectedRows:2,sourceRows:stream([row,row]),typedRows:stream([]),sourceCodec:codec,verify:async()=>{},close:async()=>{},current:()=>{},...overrides});
 await assert.rejects(collect(make({}).sourceRows()),/ORDER_SCOPE/);await assert.rejects(collect(make({sourceRows:stream([row])}).sourceRows()),/COMPLETE_COUNT/);
 await assert.rejects(collect(make({expectedRows:1,sourceRows:stream([f.sourceRows.find(r=>r.projection.entity_type==='SETTLEMENT')])}).sourceRows()),/ORIGINAL_MEMBERSHIP/);
 let h;h=headerFixture({beforeReturn:async()=>{await h.session.close();}});await assert.rejects(collect(h.session.sourceRows()),/CLOSED/);
});
test('original builder rejects orphan membership instead of guessing document counts or zero settlement links',async()=>{
 const f=fullFixture(),changed=structuredClone(f.sourceRows),line=changed.find(r=>r.projection.entity_type==='SALES_LINE');line.projection.raw_fields.单据来源编号=line.projection.normalized_fields.单据来源编号='MISSING';
 await assert.rejects(codec.buildHistoryTypedClosureExpected26({...f.scope,documents:f.documents,sourceRows:changed,typedRows:f.typedRows}));await f.h.session.close();
});
