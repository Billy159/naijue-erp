/** Synthetic protocol only; no PostgreSQL server or source data. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresSalesQueryReader } from '../adapters/postgres/src/sales-query-reader.ts';
import type { OrdinaryDocumentListOptions } from '../adapters/postgres/src/ordinary-document-list-reader.ts';
import { salesDetailWire } from '../apps/api/src/document-list-wire.ts';
import { exactJson } from '../apps/api/src/sales-http.ts';
import { actor, ids, sid } from './support/synthetic-fixtures.ts';
const time = "2026-10-20T12:00:00.000000Z";
const header = () => ({ responsible_staff_id: null, responsible_name: null, created_by_name: "SYNTHETIC CREATOR", id: ids.sales, number: "SYNTHETIC-ONLY", business_type: "SALE", business_date: "2026-10-20", hall_id: ids.hall,
  customer_id: ids.customer, salesperson_id: null, warehouse_id: ids.warehouse, status: "DRAFT", version: 1, gross_amount: "90071992547409.93", order_discount: "0.00", net_due: "90071992547409.93",
  note: null, created_by_account_id: ids.account, created_hall_id: ids.hall, created_at: time, updated_at: time, approved_by_account_id: null, approved_at: null, stock_basis: "RUNTIME_LEDGER", hall_name: "SYNTHETIC HALL", warehouse_name: "SYNTHETIC WAREHOUSE", customer_name: "SYNTHETIC CUSTOMER", salesperson_name: null });

class Client {
 calls:{sql:string;values:unknown[]}[]=[]; released=false; ready=true; hidden=false; enabled=true; native=false;
 readonly count:number;readonly basis:string;
 constructor(count:number,basis='CUTOFF_HISTORY'){this.count=count;this.basis=basis;}
 async query(sql:string,values:unknown[]=[]){
  this.calls.push({sql,values});let rows:Record<string,unknown>[]=[];
  if(sql.includes('read-authorization:identity'))rows=[{account_id:actor.accountId,staff_id:sid('staff',1),login_enabled:this.enabled,role:'SALESPERSON',employment_status:'在职',hall_id:actor.hallId,native_hall_id:actor.hallId,hall_enabled:true}];
  else if(sql.includes('ordinary-detail:ready'))rows=[{business_ready:this.ready}];
  else if(sql.startsWith('SELECT h.id')){assert.match(sql,/standard_business_ready\(\)/);if(!this.native)assert.match(sql,/b.status='IMPORTED'/);assert.match(sql,/h.hall_id=\$\d+::uuid/);rows=this.hidden?[]:[{...header(),stock_basis:this.basis}];}
  else if(sql.includes('FROM naijue_erp.sales_line'))rows=[];
  else if(sql.includes('FROM naijue_erp.sales_settlement')){assert.match(sql,/LIMIT \$2$/);assert.deepEqual(values,[ids.sales,2001]);rows=Array.from({length:this.count},(_,i)=>({id:sid('settlement',100+i),sales_id:ids.sales,line_no:i+1,payment_account_id:ids.payment,payment_method_id_snapshot:i%2?null:sid('paymentMethod',31),direction:i%2?'REFUND':'RECEIVE',amount:'90071992547409.93',account_name_snapshot:i%2?null:'original account',method_name_snapshot:null,current_account_name:'current account',current_method_name:'current method'}));}
  else assert.match(sql,/^(BEGIN|COMMIT|ROLLBACK)/);
  return {rows,rowCount:rows.length};
 }
 release(){this.released=true;}
}
function setup(c:Client,proof?:()=>Promise<unknown>){let proofs=0;const options:OrdinaryDocumentListOptions={profile:'source-confirmed-ordinary-documents-v1',databaseGeneration:'synthetic',schemaDigest:'a'.repeat(64),runtime27:{profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(client,purpose){proofs++;assert.equal(client,c);assert.equal(purpose,'ORDINARY_DOCUMENT_READ');return await proof?.() as undefined;}}};return {options,reader:new PostgresSalesQueryReader({async connect(){return c;}},options),proofs:()=>proofs};}
const read=()=>({actor,scope:{kind:'restricted' as const,clauses:[{hallId:ids.hall}]},parameters:{salesId:ids.sales},signal:new AbortController().signal});
for(const count of [16,2000])test(`ordinary detail preserves all ${count} retained settlements and nullable snapshots through HTTP wire`,async()=>{
 const c=new Client(count),f=setup(c),result=await f.reader.readDetail(read());assert.equal(f.proofs(),1);assert.equal(result.stockBasis,'CUTOFF_HISTORY');assert.equal(result.document.settlements.length,count);assert.equal(result.settlementNames.length,count);
 const wire=JSON.parse(exactJson(salesDetailWire(result,'category-v2')));for(let i=0;i<count;i++){const row=wire.document.settlements[i],names=wire.settlementNames[i];assert.equal(row.id,sid('settlement',100+i));assert.equal(row.lineNo,i+1);assert.equal(row.amount,'9007199254740993');assert.equal(row.direction,i%2?'REFUND':'RECEIVE');assert.equal(row.paymentMethodId,i%2?null:sid('paymentMethod',31));assert.equal(names.settlementId,row.id);assert.equal(names.accountNameSnapshot,i%2?null:'original account');assert.equal(names.methodNameSnapshot,null);}
 assert.ok(c.released);assert.equal(c.calls.at(-1)?.sql,'COMMIT');assert.ok(c.calls.every(x=>! /history_|HISTORY_READ|FOR UPDATE|FOR SHARE|pg_current_xact_id/.test(x.sql)));
});
test('ordinary detail rejects2001 rather than returning a partial document',async()=>{const c=new Client(2001);await assert.rejects(setup(c).reader.readDetail(read()),{code:'SALES_READ_TOO_LARGE'});assert.equal(c.calls.at(-1)?.sql,'ROLLBACK');assert.ok(c.released);});
test('ordinary detail preserves authorization/publication gate before child reads',async()=>{for(const state of ['hidden','ready','enabled'] as const){const c=new Client(16);if(state==='hidden')c.hidden=true;else c[state]=false;await assert.rejects(setup(c).reader.readDetail(read()),{code:state==='hidden'?'DOCUMENT_NOT_FOUND':state==='ready'?'ORDINARY_DOCUMENTS_NOT_READY':'FORBIDDEN'});assert.ok(!c.calls.some(x=>x.sql.includes('FROM naijue_erp.sales_settlement')||x.sql.includes('FROM naijue_erp.sales_line')));assert.ok(c.released);}});
test('ordinary detail runtime27 cannot be substituted with26 or boolean proof',async()=>{const c=new Client(16);assert.throws(()=>new PostgresSalesQueryReader({async connect(){return c;}},{...setup(c).options,runtime27:{profile:'EXACT26'}} as never));await assert.rejects(setup(c,async()=>true).reader.readDetail(read()));assert.ok(!c.calls.some(x=>x.sql.includes('read-authorization:identity')));});
test('ordinary detail-only selector never falls back to native or26 list/history/reference/statistics providers',async()=>{const c=new Client(0),r=setup(c).reader;for(const method of ['readList','readHistory','readReferences','readSettlementStatistics'] as const)await assert.rejects(r[method](read() as never),{code:'ORDINARY_DOCUMENTS_NOT_READY'});assert.equal(c.calls.length,0);});
test('native27 detail permits only authorized header-correlated immutable hall proofs, never raw source scans or extra connections',async()=>{
 const c=new Client(16);let connections=0;const reader=new PostgresSalesQueryReader({async connect(){connections++;return c;}},{profile:'source-confirmed-unified-native-v1',runtime27:{profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(client:object,purpose:string){assert.equal(client,c);assert.equal(purpose,'ORDINARY_DOCUMENT_READ');}}} as never);
 c.native=true;const result=await reader.readDetail(read());assert.equal(result.document.settlements.length,16);assert.equal(connections,1);
 assert.ok(c.calls.every(row=>!/import_source|raw_fields|FOR UPDATE|FOR SHARE/.test(row.sql)));
 const headerCalls=c.calls.filter(row=>row.sql.startsWith('SELECT h.id'));assert.equal(headerCalls.length,1);
 const headerCall=headerCalls[0]!;assert.match(headerCall.sql,/authorized_hall_headers AS \(SELECT h\.\*\)/);
 assert.match(headerCall.sql,/JOIN naijue_erp\.import_record s ON s\.id=\(m\.source_record_id\)::uuid/);
 assert.match(headerCall.sql,/a\.operation_id IN\(SELECT \(pointer->>'operationId'\)::uuid FROM hall_pointers/);
 assert.match(headerCall.sql,/h\.hall_id=\$\d+::uuid/);assert.ok(headerCall.values.includes(ids.sales));assert.ok(headerCall.values.includes(ids.hall));
 assert.equal(c.calls.filter(row=>/naijue_erp\.(import_batch|import_record)/.test(row.sql)).length,1);
 assert.ok(c.calls.findIndex(row=>row.sql.includes('read-authorization:identity'))<c.calls.indexOf(headerCall));
});

class OriginClient extends Client {
 quantity='2';docVersion=2;originRows:Record<string,unknown>[]=[];inactive:Record<string,unknown>[]=[];
 override async query(sql:string,values:unknown[]=[]){
  if(sql.includes('document-inventory:anchor')){this.calls.push({sql,values});return {rows:[],rowCount:0};}
  if(sql.includes('sales-retained-approval:history')){this.calls.push({sql,values});return {rows:this.originRows,rowCount:this.originRows.length};}
  if(sql.includes('sales-origin:inactive-lines')){this.calls.push({sql,values});return {rows:this.inactive,rowCount:this.inactive.length};}
  if(sql.includes('FROM naijue_erp.sales_line')){this.calls.push({sql,values});const rows=[{id:sid('salesLine',801),sales_id:ids.sales,line_no:1,sku_id:ids.sku,quantity:this.quantity,reference_price:'1.25',deal_price:'1.25',line_amount:this.quantity==='2'?'2.50':'-2.50',allocated_discount:null,is_gift:false,pricing_rule:'UNIT_PRICE',discount_tenths:null,zero_confirmed:false,is_current:true,product_id:sid('product',804),category_id:null,category_name:null,product_code_snapshot:'P',product_name_snapshot:'Product',color_name_snapshot:'Blue',fit_name_snapshot:'A5',size_name_snapshot:'M',barcode_snapshot:null}];return {rows,rowCount:1};}
  const result=await super.query(sql,values);
  if(sql.startsWith('SELECT h.id'))result.rows=result.rows.map(r=>({...r,version:this.docVersion,gross_amount:this.quantity==='2'?'2.50':'-2.50',order_discount:'0.25',net_due:this.quantity==='2'?'2.25':'-2.75'}));
  return result;
 }
}

test('historical detail exposes proven original signed-sale discount after current signs become positive',async()=>{
 const c=new OriginClient(0);const bootstrap=new OriginClient(0,'RUNTIME_LEDGER');
 const current=(await setup(bootstrap).reader.readDetail(read())).document;
 const old={...current,header:{...current.header,version:1,grossAmount:-250n,netDue:-275n},lines:current.lines.map(l=>({...l,quantity:-2n,lineAmount:-250n}))};
 const {salesChangeEvidence}=await import('../packages/application/src/sales-change-evidence.ts');
 const evidence=JSON.parse(exactJson(salesChangeEvidence(old as never,current)));
 const op=sid('operation',802);c.originRows=[{audit_id:sid('audit',803),audit_operation_id:op,audit_actor:actor.accountId,object_type:'SALES',object_id:ids.sales,audit_action:'SAVE',occurred_at:time,old_version:1,new_version:2,before_values:evidence.before,after_values:evidence.after,
 receipt_id:op,receipt_actor:actor.accountId,request_key:'origin-save',request_hash:'a'.repeat(64),receipt_action:'SAVE',target_type:'SALES',target_id:ids.sales,receipt_status:'COMMITTED',completed_at:time,result_data:{operationId:op,salesId:ids.sales,version:2,status:'DRAFT',ledgerEntryIds:[]}}];
 const result=await setup(c).reader.readDetail(read());
 assert.deepEqual((result as any).historicalSaleOrigin,{kind:'SIGNED_SALE',originalOrderDiscount:25n});
 const wire=JSON.parse(exactJson(salesDetailWire(result,'category-v2')));assert.deepEqual(wire.historicalSaleOrigin,{kind:'SIGNED_SALE',originalOrderDiscount:'25'});
 assert.equal(result.document.lines[0]!.quantity,2n);assert.equal(c.calls.filter(x=>x.sql.includes('sales-retained-approval:history')).length,1);
 assert.equal(c.calls[0]!.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(c.calls.at(-1)!.sql,'COMMIT');
 assert.ok(!JSON.stringify(wire).includes('request_hash'));assert.ok(!JSON.stringify(wire).includes('origin-save'));
});

test('historical detail omits original discount exemption for missing audit, runtime origin and inaccessible target',async()=>{
 const c=new OriginClient(0);const result=await setup(c).reader.readDetail(read());assert.equal((result as any).historicalSaleOrigin,undefined);
 const runtime=new OriginClient(0,'RUNTIME_LEDGER');assert.equal((await setup(runtime).reader.readDetail(read()) as any).historicalSaleOrigin,undefined);assert.ok(!runtime.calls.some(x=>x.sql.includes('sales-retained-approval:history')));
 const hidden=new OriginClient(0);hidden.hidden=true;await assert.rejects(setup(hidden).reader.readDetail(read()),{code:'DOCUMENT_NOT_FOUND'});assert.ok(!hidden.calls.some(x=>x.sql.includes('sales-retained-approval:history')||x.sql.includes('sales-origin:inactive-lines')));
});

test('native version1 signed history gets exact origin; pure positive history does not',async()=>{
 const signed=new OriginClient(0);signed.docVersion=1;signed.quantity='-2';const detail=await setup(signed).reader.readDetail(read());assert.deepEqual(detail.historicalSaleOrigin,{kind:'SIGNED_SALE',originalOrderDiscount:25n});assert.ok(!signed.calls.some(x=>x.sql.includes('sales-retained-approval:history')));
 const pure=new OriginClient(0);pure.docVersion=1;assert.equal((await setup(pure).reader.readDetail(read())).historicalSaleOrigin,undefined);
});

test('read origin proof includes removed negative rows privately without exposing inactive details',async()=>{
 const c=new OriginClient(0),bootstrap=new OriginClient(0,'RUNTIME_LEDGER'),current=(await setup(bootstrap).reader.readDetail(read())).document;
 const returned={...current.lines[0]!,id:sid('salesLine',805),lineNo:2,quantity:-1n,lineAmount:-125n,isCurrent:false};
 const full={...current,lines:[...current.lines,returned]};
 const old={...current,header:{...current.header,version:1,grossAmount:125n,netDue:100n},lines:[...current.lines,{...returned,isCurrent:true}]};
 const {salesChangeEvidence}=await import('../packages/application/src/sales-change-evidence.ts'),evidence=JSON.parse(exactJson(salesChangeEvidence(old as never,full as never))),op=sid('operation',806);
 c.inactive=[{id:returned.id,sales_id:ids.sales,line_no:2,sku_id:ids.sku,quantity:'-1',reference_price:'1.25',deal_price:'1.25',line_amount:'-1.25',allocated_discount:null,is_gift:false,pricing_rule:'UNIT_PRICE',discount_tenths:null,zero_confirmed:false,is_current:false,product_code_snapshot:'P',product_name_snapshot:'Product',color_name_snapshot:'Blue',fit_name_snapshot:'A5',size_name_snapshot:'M',barcode_snapshot:null}];
 c.originRows=[{audit_id:sid('audit',807),audit_operation_id:op,audit_actor:actor.accountId,object_type:'SALES',object_id:ids.sales,audit_action:'SAVE',occurred_at:time,old_version:1,new_version:2,before_values:evidence.before,after_values:evidence.after,receipt_id:op,receipt_actor:actor.accountId,request_key:'remove-original-negative',request_hash:'b'.repeat(64),receipt_action:'SAVE',target_type:'SALES',target_id:ids.sales,receipt_status:'COMMITTED',completed_at:time,result_data:{operationId:op,salesId:ids.sales,version:2,status:'DRAFT',ledgerEntryIds:[]}}];
 const detail=await setup(c).reader.readDetail(read());assert.deepEqual(detail.historicalSaleOrigin,{kind:'SIGNED_SALE',originalOrderDiscount:25n});assert.equal(detail.document.lines.length,1);assert.ok(!JSON.stringify(JSON.parse(exactJson(detail))).includes(returned.id));
 const bad=new OriginClient(0);bad.inactive=c.inactive;bad.originRows=structuredClone(c.originRows);(bad.originRows[0]!.after_values as any).lines[0].quantity='999';assert.equal((await setup(bad).reader.readDetail(read())).historicalSaleOrigin,undefined);
 const missing=new OriginClient(0);missing.inactive=c.inactive;missing.originRows=structuredClone(c.originRows);missing.originRows[0]!.receipt_id=null;assert.equal((await setup(missing).reader.readDetail(read())).historicalSaleOrigin,undefined);
});

test('inactive provenance overflow omits exemption, preserves visible document and never reads a partial audit',async()=>{
 const c=new OriginClient(0);c.inactive=Array.from({length:2001},()=>({}));const detail=await setup(c).reader.readDetail(read());
 assert.equal(detail.historicalSaleOrigin,undefined);assert.equal(detail.document.lines.length,1);assert.ok(!c.calls.some(x=>x.sql.includes('sales-retained-approval:history')));
 const query=c.calls.find(x=>x.sql.includes('sales-origin:inactive-lines'))!;assert.deepEqual(query.values,[ids.sales,2001]);assert.match(query.sql,/LIMIT \$2/);
});

test('origin query SQL and inactive-row codec failures are not hidden as missing provenance',async()=>{
 class SqlFailure extends OriginClient {override async query(sql:string,values:unknown[]=[]){if(sql.includes('sales-retained-approval:history'))throw new Error('synthetic SQL denied');return super.query(sql,values);}}
 const denied=new SqlFailure(0);await assert.rejects(setup(denied).reader.readDetail(read()),/synthetic SQL denied/);assert.equal(denied.calls.at(-1)?.sql,'ROLLBACK');assert.ok(denied.released);
 const malformed=new OriginClient(0);malformed.inactive=[{id:'not-an-id'}];await assert.rejects(setup(malformed).reader.readDetail(read()));assert.equal(malformed.calls.at(-1)?.sql,'ROLLBACK');assert.ok(malformed.released);
});
