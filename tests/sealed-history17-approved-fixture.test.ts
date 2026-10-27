import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sealedHistory17Fixture, B07_SYN_APPROVED_PROFILE, sha } from "./integration/sealed-history17-fixture.ts";

test("new SYN APPROVED source is generated before sealing with exact payments and per-warehouse derived opening", async t => {
 const f = await sealedHistory17Fixture(t, B07_SYN_APPROVED_PROFILE);
 assert.equal(f.options.fixedSourceNamespace, "synthetic.b07.approved.v1");
 const raw = (await readFile(join(f.options.base,"snapshots/all-business-source-rows.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 const sales = raw.filter(r=>r.entity==="SALES_HEADER");
 assert.equal(sales.length,2);
 const sale=sales.find(r=>r.sourceId==="header-SALE").data;
 assert.equal(sale.原审核状态,"已审核"); assert.equal(sale.应结金额,"32.00"); assert.equal(sale.整单优惠,"0.00");
 assert.equal(sales.find(r=>r.sourceId==="header-RETURN").data.原审核状态,"未审核");
 const transfer=raw.find(r=>r.entity==="TRANSFER_HEADER").data;
 assert.equal(transfer.原审核状态,"已审核"); assert.equal(transfer.调出仓来源编号,"WH-1");assert.equal(transfer.调入仓来源编号,"WH-2");
 for(const h of [sale,transfer]){assert.equal(h.业务日期,"45614");for(const k of ["原创建时间","原修改时间","原审核时间"])assert.equal(h[k],"");assert.match(h.原单号,/^B07-SYN-APPROVED-V1-/);}
 const lines=raw.filter(r=>r.entity==="SALES_LINE"&&r.data.单据来源编号==="header-SALE");
 assert.equal(lines.length,16);assert.equal(lines.reduce((n,r)=>n+BigInt(r.data.原数量),0n),32n);
 for(const l of lines) assert.equal(l.data.原行金额,"2.00");
 assert.equal(raw.find(r=>r.entity==="SETTLEMENT"&&r.data.单据来源编号==="header-SALE").data.金额,"32.00");
 assert.equal(raw.find(r=>r.entity==="TRANSFER_LINE").data.原数量,"3");
 const plan=f.approvedInventoryPlan!;
 assert.equal(plan.sourceKind,"SYNTHETIC_ONLY");assert.equal(plan.openingMethod,"DERIVED_FROM_TARGET_INVENTORY");assert.equal(plan.postDerivedOpeningAgain,false);
 for(const w of plan.warehouses)assert.equal(BigInt(w.derivedOpening)+BigInt(w.approvedSalesNet)+BigInt(w.approvedTransferNet),BigInt(w.target));
 assert.equal(plan.warehouses.reduce((n,w)=>n+BigInt(w.approvedTransferNet),0n),0n);
 const manifest=JSON.parse(await readFile(join(f.options.base,"manifest.json"),"utf8"));
 for(const entry of manifest.payloadFiles){const bytes=await readFile(join(f.options.base,entry.file));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
 const selection=JSON.parse(await readFile(join(f.options.v3Amendment,"effective-import-selection.json"),"utf8"));
 assert.equal(selection.excludedCount,2958);assert.equal(selection.effectiveCount,15018);
 const excluded=JSON.parse(await readFile(join(f.options.v3Amendment,selection.excludedSourceIdsFile),"utf8"));
 assert.equal(excluded.length,2958);assert.equal(new Set(excluded).size,2958);
 const effective=await readFile(join(f.options.v3Amendment,selection.effectiveBarcodeCsv.path),"utf8");
 assert.equal(sha(effective),selection.effectiveBarcodeCsv.sha256);
 assert.equal(effective.includes('"PRODUCT"'),false);
});

test("original sealed17 default remains DRAFT with original quantity/payment and namespace",async t=>{
 const f=await sealedHistory17Fixture(t);assert.equal(f.profile,null);assert.equal(f.approvedInventoryPlan,null);
 assert.equal(f.options.fixedSourceNamespace,"synthetic.sealed-history17");
 const raw=(await readFile(join(f.options.base,"snapshots/all-business-source-rows.jsonl"),"utf8")).trim().split("\n").map(s=>JSON.parse(s));
 assert.ok(raw.filter(r=>r.entity.endsWith("_HEADER")).every(r=>r.data.原审核状态==="未审核"));
 assert.equal(raw.find(r=>r.entity==="TRANSFER_LINE").data.原数量,"-3");
 assert.equal(raw.find(r=>r.entity==="SETTLEMENT"&&r.data.单据来源编号==="header-SALE").data.金额,"0.00");
});

test("original authorized header reader prepares APPROVED from the new sealed raw cells, retaining NULL historical people/time",async t=>{
 const {openAuthorizedV3HeaderReader}=await import('../scripts/import-v2/authorized-header-reader.mjs');
 const {prepareV3HistoryHeaderChunk}=await import('../packages/application/src/import-v3-history-header-staging.ts');
 const {id}=await import('./integration/native-import-accounting-fixture.ts');
 const f=await sealedHistory17Fixture(t,B07_SYN_APPROVED_PROFILE);
 const resolveNativeBinding=async(q:{entity:string;normalizedFields:Record<string,unknown>})=>{
  const fields=q.entity==='SALES_HEADER'?['所属厅来源编号','客户来源编号','仓库来源编号']:['调出仓来源编号','调入仓来源编号'];
  const ids:Record<string,string>={'HALL-1':id(10),'CUSTOMER-1':id(70),'WH-1':id(40),'WH-2':id(41)};
  return Object.fromEntries(fields.map(field=>{const sourceKey=q.normalizedFields[field] as string;assert.ok(ids[sourceKey]);return [field,{sourceKey,nativeId:ids[sourceKey]!}];}));
 };
 const reader=await openAuthorizedV3HeaderReader({...f.options,resolveNativeBinding});
 try{let approved=0,draft=0;
  for await(const record of reader.rows()){
   const bindings=await resolveNativeBinding({entity:record.source.entityType,normalizedFields:record.source.normalizedFields});
   const prepared=prepareV3HistoryHeaderChunk([{batchId:f.options.batchId,fixedSourceNamespace:f.options.fixedSourceNamespace,...record,bindings}]);
   await reader.authorize(prepared);
   for(const row of prepared.rows){const h=row.prepared.header;assert.equal(h.businessDate,'2024-11-18');assert.equal(h.createdLocalAt,null);assert.equal(h.approvedLocalAt,null);if(h.sourceStatus==='APPROVED')approved++;else {assert.equal(h.sourceStatus,'DRAFT');draft++;}}
  }
  assert.equal(approved,2);assert.equal(draft,1);
 }finally{await reader.close();}
});

import { b07FixtureSourceLifecycle, closeB07FixtureSources, readB07CommittedApprovedPublication, B07_COMMITTED19_PUBLISH } from './integration/b07-approved-publication-fixture.ts';
import type { HistoryClosureSourceGroup, HistoryClosureSourceFactory } from '../scripts/import-v2/authorized-history-closure-reader.mjs';
import type { B07Committed19RecoveryTarget } from './integration/b07-approved-publication-fixture.ts';
import type { PgSalesPool, PgSalesClient } from '../adapters/postgres/src/sales-unit-of-work.ts';

test('publication source lifecycle counts all fresh11 sessions across expected and repeated source authorization',async()=>{
 const {openAuthorizedHistoryClosureReader,HISTORY_CLOSURE_SOURCE_GROUPS}=await import('../scripts/import-v2/authorized-history-closure-reader.mjs');
 const {HISTORY_CLOSURE_SOURCE_ENTITIES}=await import('../packages/application/src/history-typed-closure.ts');
 const lifecycle=b07FixtureSourceLifecycle(),scope={batchId:'00000000-0000-0000-0000-000000000001',fixedSourceNamespace:'synthetic.b07.lifecycle724',selectionSha256:'a'.repeat(64),authorizedPayloadHash:'b'.repeat(64),
  expectedCounts:{history_sales_header:0,history_sales_line:0,history_sales_settlement:0,history_transfer_header:0,history_transfer_line:0,import_source_row:0,import_sku_alias:0,import_stock_contributor:0,barcodes:0},expectedSourceEntityCounts:Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0])) as Record<(typeof HISTORY_CLOSURE_SOURCE_ENTITIES)[number],number>};
 const openSources={} as Record<HistoryClosureSourceGroup,HistoryClosureSourceFactory>;
 for(const group of HISTORY_CLOSURE_SOURCE_GROUPS)openSources[group]=async()=>({async verify(){},sourceRows:function*(){},typedRows:function*(){},documents:function*(){},close:lifecycle.open(group)});
 const reader=await openAuthorizedHistoryClosureReader({scope,openSources,trustedSelectionSha256:scope.selectionSha256,trustedAuthorizedPayloadHash:scope.authorizedPayloadHash});
 try{const first=await reader.expected();await reader.authorizeStage(first);await reader.authorizeStage(first);assert.deepEqual(lifecycle.counts(),{opened:33,closed:33});}
 finally{await closeB07FixtureSources(reader,lifecycle);}
});

test('publication source close-once checks remain exact and cleanup cannot replace the primary metadata error',async()=>{
 const lifecycle=b07FixtureSourceLifecycle(),close=lifecycle.open('HEADERS');assert.throws(()=>lifecycle.assertClosed());await close();await assert.rejects(close(),/exactly once/);
 const primary=Error('ORIGINAL_METADATA_ASSERTION');let observed;
 try{try{throw primary;}catch(e){observed=e;throw e;}finally{await closeB07FixtureSources({async close(){}},lifecycle,observed);}}catch(e){assert.equal(e,primary);}
 const unclosed=b07FixtureSourceLifecycle();unclosed.open('HEADERS');
 await assert.rejects(closeB07FixtureSources({async close(){}},unclosed,primary),e=>e instanceof AggregateError&&e.errors[0]===primary&&e.errors.length===2);
});

function recoveryProtocolFake(options:{published?:boolean;unit?:string;postmasterStart?:string}={}) {
 const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const target:B07Committed19RecoveryTarget={database:'naijue_erp_test_b07_syn_approved_20261027_01',oid:'16385',role:'naijue_erp_test',postmasterStart:'FRESH_PROTOCOL_FAKE_POSTMASTER',port:55714,serverAddress:null,serverPort:null};
 const expectedCounts:Record<string,number>={import_source_row:57,import_sku_alias:2,import_stock_contributor:2,import_record:5,import_record_accounting_claim:5,import_history_closure_manifest:1,import_history_document_manifest:3,product:1,sku:1,warehouse:2,inventory_ledger:1,inventory_balance:1,history_sales_header:2,history_sales_line:32,history_sales_settlement:2,history_transfer_header:1,history_transfer_line:1,user_account:1,staff:1,auth_session:0};
 const calls:string[]=[];let released=0;
 const client:PgSalesClient={async query(sql,args=[]){calls.push(sql);let rows:Record<string,unknown>[]=[];
  if(sql.includes('/* b07-recover:target */'))rows=[{...target,...(options.postmasterStart?{postmasterStart:options.postmasterStart}:{}),readonly:'on',isolation:'repeatable read',superuser:false,bypass:false}];
  else if(sql.includes('AS integrity_guards_present'))rows=[{integrity_guards_present:true}];
  else if(sql.includes('AS accounting_guards_present'))rows=[{accounting_guards_present:true}];
  else if(sql.includes('/* b07-recover:versions */'))rows=Array.from({length:19},(_,i)=>({version:i+1}));
  else if(sql.includes('/* b07-recover:original-keys */'))rows=[{id:id(701),request_key:'B07-SYN-APPROVED-V1-CHUNK',action:'IMPORT_CHUNK',status:'COMMITTED'},{id:B07_COMMITTED19_PUBLISH.operationId,request_key:B07_COMMITTED19_PUBLISH.requestKey,action:'IMPORT_PUBLISH',status:'COMMITTED'},{id:id(702),request_key:'B07-SYN-APPROVED-V1-STAGE',action:'IMPORT_STAGE',status:'COMMITTED'}];
  else if(sql.includes('/* b07-recover:publication */'))rows=[{id:B07_COMMITTED19_PUBLISH.operationId,result_data:{operationId:B07_COMMITTED19_PUBLISH.operationId,batchId:id(1),status:'IMPORTED',sequence:2,cursor:5,ledgerEntryIds:[]},source_hash:'a'.repeat(64),source_manifest_ref:'synthetic:b07',published:options.published??true}];
  else if(sql.includes('/* b07-recover:count:')){const table=sql.match(/b07-recover:count:([a-z_]+)/)![1]!;rows=[{n:expectedCounts[table]}];}
  else if(sql.includes('/* b07-recover:all-claims */'))rows=Array.from({length:5},(_,i)=>({id:id(800+i)}));
  else if(sql.includes('/* b07-recover:head:')){const sale=sql.includes('head:sales');rows=[{id:id(sale?201:202),version:1,source_status:'APPROVED',business_date:'2024-11-18',created_local_at:null,updated_local_at:null,approved_local_at:null,manifest_identity:true,line_count:sale?16:1,settlement_count:sale?1:0,
   ...(sale?{warehouse_id:id(40),gross_amount:'32.00',order_discount:'0.00',net_due:'32.00'}:{from_warehouse_id:id(40),to_warehouse_id:id(41)}),
   raw_fields:{原审核状态:'已审核',业务日期:'45614',...(sale?{仓库来源编号:'WH-1'}:{调出仓来源编号:'WH-1',调入仓来源编号:'WH-2'})}}];}
  else if(sql.includes('/* b07-recover:warehouse-binding */'))rows=[{target_id:id(args[1]==='WH-1'?40:41)}];
  else if(sql.includes('/* b07-recover:lines:')){const sale=sql.includes('lines:sales'),quantity=sale?'2':'3';rows=Array.from({length:sale?16:1},(_,i)=>({id:id((sale?300:400)+i),sku_id:id(50),quantity,line_no:i+1,exact_identity:true,normalized_fields:{原数量:quantity},...(sale?{deal_price:'1.00',line_amount:'2.00'}:{})}));}
  else if(sql.includes('/* b07-recover:settlements */'))rows=[{id:id(500),direction:'RECEIVE',amount:'32.00',exact_identity:true}];
  else if(sql.includes('/* b07-recover:stock-unit */'))rows=[-7,0].map(n=>({canonical_sku_id:id(50),warehouse_id:id(40),source_unit:options.unit??'件',signed_quantity:String(n),event_kind:'CUTOFF_BASELINE',endpoint:'IMPORT_BASELINE',quantity_delta:'-7',source_import_batch_id:id(1),ledger_warehouse:id(40),ledger_sku:id(50)}));
  else if(sql.includes('/* b07-recover:balances */'))rows=[{warehouse_id:id(40),sku_id:id(50),quantity:'-7'}];
  else assert.ok(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'||sql==='ROLLBACK','Unexpected query in recovery protocol fake');
  return {rows,rowCount:rows.length};},release(){released++;}};
 const pool:PgSalesPool={async connect(){return client;}};
 return {pool,target,calls,get released(){return released;}};
}
test('recovery protocol fake: original COMMITTED metadata is read in one fresh RR READ ONLY and rolled back, never regenerated/published',async()=>{
 const f=recoveryProtocolFake(),result=await readB07CommittedApprovedPublication(f.pool,f.target);
 assert.equal(result.references.publishedOperationId,B07_COMMITTED19_PUBLISH.operationId);assert.deepEqual(result.references.cases.map(r=>r.capturedQuantity),['2','3']);
 assert.equal(result.recovery.sourceFixtureRegenerated,false);assert.equal(result.recovery.publishReexecuted,false);assert.equal(result.recovery.rollbackReturned,true);assert.equal(result.realSourceImportVerified,false);
 assert.equal(f.calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.calls.filter(s=>s==='ROLLBACK').length,1);assert.equal(f.released,1);
 for(const query of f.calls){const code=query.replace(/^\s*\/\*[\s\S]*?\*\//,'').trim();assert.match(code,/^(?:SELECT|BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|ROLLBACK)/);}
});
test('recovery protocol fake: missing publication closure, wrong unit or stale postmaster refuses metadata and always rolls back/releases',async()=>{
 for(const options of [{published:false},{unit:'箱'},{postmasterStart:'STOPPED_OLD_WINDOW'}]){const f=recoveryProtocolFake(options);await assert.rejects(readB07CommittedApprovedPublication(f.pool,f.target));assert.equal(f.calls.at(-1),'ROLLBACK');assert.equal(f.released,1);}
});
