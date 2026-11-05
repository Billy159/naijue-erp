/** Synthetic query protocol, not PostgreSQL execution. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readSalesRetainedApprovalEvidence} from '../adapters/postgres/src/sales-retained-approval-reader.ts';
import {actor,ids,sid,syntheticDraft} from './support/synthetic-fixtures.ts';
import {version} from '../packages/domain/src/values.ts';import {moneyToSql} from '../adapters/postgres/src/codec.ts';
const at='2026-11-02T00:00:00.000000Z';
function row(){const d=syntheticDraft(),h=d.header,op=sid('operation',810),batch=sid('operation',811),baseline=sid('operation',813);
 const snapshot={header:{id:h.id,number:h.number,business_type:'SALE',business_date:h.businessDate,hall_id:h.hallId,customer_id:h.customerId,salesperson_id:null,warehouse_id:h.warehouseId,responsible_staff_id:null,status:'APPROVED',version:4,gross_amount:'-2.50',order_discount:'0.25',net_due:'-2.75',note:null,created_by_account_id:null,created_hall_id:null,created_by_staff_id:null,approved_by_staff_id:null,created_at:null,updated_at:null,approved_by_account_id:null,approved_at:null,stock_basis:'CUTOFF_HISTORY',import_batch_id:batch},lines:d.lines.map(l=>({id:l.id,sales_id:l.salesId,line_no:l.lineNo,sku_id:l.skuId,quantity:'-2',reference_price:null,deal_price:moneyToSql(l.dealPrice),line_amount:'-2.50',allocated_discount:null,is_gift:null,pricing_rule:null,discount_tenths:null,zero_confirmed:null,is_current:true,product_code_snapshot:null,product_name_snapshot:null,color_name_snapshot:null,fit_name_snapshot:null,size_name_snapshot:null,barcode_snapshot:null})),settlements:[] as Record<string,unknown>[]};
 return {id:op,target_type:'SALES',target_id:ids.sales,actor_account_id:actor.accountId,target_version:4,completed_at:at,occurred_at:at,audit_operation_id:op,audit_actor:actor.accountId,old_version:null,new_version:4,snapshot,financial_snapshot:snapshot,batch_id:batch,source_record_id:sid('operation',812),source_system:'SYNTHETIC',source_entity_type:'SALES_HEADER',source_key:'one',source_record_hash:'1'.repeat(64),baseline_batch_id:baseline,baseline_manifest_sha256:'2'.repeat(64),cutoff_at:at,schema_ready:true,anchor_valid:true};}
for(const published of [false,true])test(`financial origin version4 verifies ${published?'published27':'legacy compatibility'} anchor with no invented audit`,async()=>{
 const calls:string[]=[];const evidence=await readSalesRetainedApprovalEvidence(async(sql)=>{calls.push(sql);return {rows:sql.includes('sales-retained-approval:history')?[]:[row()],rowCount:1};},ids.sales,version(4),published);
 assert.equal(evidence.migrationOrigin?.header.version,4);assert.equal(evidence.migrationOrigin?.header.orderDiscount,25n);assert.equal(evidence.migrationOrigin?.lines[0]!.quantity,-2n);assert.deepEqual(evidence.events,[]);
 const sql=calls[1]!;assert.match(sql,/exposureDigest.*encode\(sha256/);assert.match(sql,/AS financial_snapshot/);assert.match(sql,/'order_discount',r.snapshot->'header'->>'order_discount'/);assert.match(sql,/r.old_version IS NULL AND r.before_values IS NULL/);
 if(published){assert.doesNotMatch(sql,/import_record|import_source_row|native_party_import_evidence/);assert.match(sql,/p.prosrc/);}else assert.match(sql,/JOIN naijue_erp.import_record/);
 for(const patch of [{schema_ready:false},{anchor_valid:false},{target_id:sid('sales',99)},{old_version:1},{new_version:3},{financial_snapshot:{...row().financial_snapshot,header:{...row().financial_snapshot.header,order_discount:25}}}])await assert.rejects(readSalesRetainedApprovalEvidence(async(sql)=>({rows:sql.includes('sales-retained-approval:history')?[]:[{...row(),...patch}],rowCount:1}),ids.sales,version(4),published));
 await assert.rejects(readSalesRetainedApprovalEvidence(async(sql)=>({rows:sql.includes('sales-retained-approval:history')?[]:[row(),row()],rowCount:2}),ids.sales,version(4),published));
});
test('absent migration does not fabricate original facts or suppress SQL failure',async()=>{
 const evidence=await readSalesRetainedApprovalEvidence(async()=>({rows:[],rowCount:0}),ids.sales,version(4),true);assert.equal(evidence.migrationOrigin,undefined);
 await assert.rejects(readSalesRetainedApprovalEvidence(async(sql)=>{if(sql.includes('document-inventory:anchor'))throw new Error('permission denied');return {rows:[],rowCount:0};},ids.sales,version(4),true),/permission denied/);
});
test('sealed financial decoding preserves amounts above JavaScript safe integer in header and actual receipt',async()=>{
 const r=row(),exact='900719925474099.31';
 r.financial_snapshot={...r.financial_snapshot,header:{...r.financial_snapshot.header,gross_amount:exact,order_discount:exact,net_due:exact},settlements:[{id:sid('settlement',901),sales_id:ids.sales,line_no:1,payment_account_id:ids.payment,payment_method_id_snapshot:null,direction:'RECEIVE',amount:exact}]};
 const evidence=await readSalesRetainedApprovalEvidence(async(sql)=>({rows:sql.includes('sales-retained-approval:history')?[]:[r],rowCount:1}),ids.sales,version(4),true);
 assert.equal(evidence.migrationOrigin!.header.orderDiscount,90071992547409931n);assert.equal(evidence.migrationOrigin!.header.netDue,90071992547409931n);assert.equal(evidence.migrationOrigin!.settlements[0]!.amount,90071992547409931n);assert.equal(evidence.migrationOrigin!.settlements[0]!.paymentMethodId,null);
});
test('exceptional historical hall explicitly requires sealed version1 origin without changing ordinary version1 reads',async()=>{
 const r=row();r.target_version=1;r.new_version=1;r.snapshot.header.version=1;r.financial_snapshot.header.version=1;r.snapshot.header.hall_id=null as never;r.financial_snapshot.header.hall_id=null as never;
 let calls=0;const query=async(sql:string)=>{calls++;return {rows:sql.includes('sales-retained-approval:history')?[]:[r],rowCount:1};};
 const ordinary=await readSalesRetainedApprovalEvidence(query,ids.sales,version(1),true);assert.equal(ordinary.migrationOrigin,undefined);assert.equal(calls,1);
 const proved=await readSalesRetainedApprovalEvidence(query,ids.sales,version(1),true,true);assert.equal(proved.migrationOrigin?.header.hallId,null);assert.equal(proved.migrationOrigin?.header.warehouseId,ids.warehouse);assert.equal(calls,3);
});
