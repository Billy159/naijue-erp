/** Scripted PostgreSQL protocol only; no server, locks or real data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSalesRetainedApprovalHistory } from '../adapters/postgres/src/sales-retained-approval-reader.ts';
import { certifyRetainedSalesApproval, retainedSalesApprovalSnapshot, SALES_RETAINED_APPROVAL_MAX_HISTORY } from '../packages/application/src/sales-retained-approval.ts';
import { ids, sid, actor, syntheticDraft } from './support/synthetic-fixtures.ts';
import { version } from '../packages/domain/src/values.ts';
const time='2026-11-02T10:00:00.000000Z',operation=sid('operation',970001);
function row(){return {audit_id:sid('audit',970002),audit_operation_id:operation,audit_actor:actor.accountId,object_type:'SALES',object_id:ids.sales,audit_action:'UNAPPROVE',occurred_at:time,old_version:4,new_version:5,
 before_values:{header:{version:4,status:'APPROVED',updatedAt:null},lines:[],settlements:[]},after_values:{header:{version:5,status:'DRAFT',updatedAt:time},lines:[],settlements:[]},
 receipt_id:operation,receipt_actor:actor.accountId,request_key:'actual-original',request_hash:'a'.repeat(64),receipt_action:'UNAPPROVE',target_type:'SALES',target_id:ids.sales,receipt_status:'COMMITTED',completed_at:time,
 result_data:{operationId:operation,salesId:ids.sales,version:5,status:'DRAFT',ledgerEntryIds:[sid('ledger',970003)]}};}
test('retained approval reader uses one bound readonly complete-version query and preserves missing receipt as failed evidence',async()=>{
 let calls=0;const result=await readSalesRetainedApprovalHistory(async(sql,values)=>{calls++;assert.deepEqual(values,[ids.sales,5,SALES_RETAINED_APPROVAL_MAX_HISTORY+1]);assert.doesNotMatch(sql,/max\(new_version\)|action='UNAPPROVE'/);assert.match(sql,/LEFT JOIN naijue_erp.operation_receipt/);assert.match(sql,/a.new_version BETWEEN 2 AND \$2/);assert.match(sql,/ORDER BY a.new_version, a.id/);assert.match(sql,/LIMIT \$3/);assert.doesNotMatch(sql,/stock_basis|INSERT|UPDATE|DELETE|BEGIN|COMMIT/);return {rows:[row()],rowCount:1};},ids.sales,version(5));
 assert.equal(calls,1);assert.equal(result[0]?.audit.oldVersion,4);assert.equal(result[0]?.receipt?.result.ledgerEntryIds.length,1);
 const noReceipt={...row(),receipt_id:null};const missing=await readSalesRetainedApprovalHistory(async()=>({rows:[noReceipt],rowCount:1}),ids.sales,version(5));assert.equal(missing[0]?.receipt,null);
 const draft=syntheticDraft(),document={...draft,header:{...draft.header,status:'DRAFT' as const,version:version(5),createdByAccountId:null,createdAt:null,createdHallId:null,updatedAt:time,approvedByAccountId:null,approvedAt:null,responsibleStaffId:null}};
 assert.ok(certifyRetainedSalesApproval(document,{events:result,assertCurrent(){}},{}));assert.equal(certifyRetainedSalesApproval(document,{events:missing,assertCurrent(){}},{}),undefined);
});
for(const name of ['wrong audit target','wrong receipt target','wrong target kind','missing version','malformed JSON','missing ledger identities'] as const)test(`retained approval reader rejects ${name}`,async()=>{
 const bad:Record<string,unknown>=row();switch(name){case 'wrong audit target':bad.object_id=sid('sales',987);break;case 'wrong receipt target':bad.target_id=sid('sales',987);break;case 'wrong target kind':bad.target_type='TRANSFER';break;case 'missing version':delete bad.new_version;break;case 'malformed JSON':bad.before_values=[];break;case 'missing ledger identities':bad.result_data={operationId:operation,salesId:ids.sales,version:5,status:'DRAFT'};break;}
 await assert.rejects(readSalesRetainedApprovalHistory(async()=>({rows:[bad],rowCount:1}),ids.sales,version(5)));
});

test('retained approval UOW reader is bound to original receipt, locked target/version and callback lifetime',async()=>{
 const {PostgresSalesUnitOfWork}=await import('../adapters/postgres/src/sales-unit-of-work.ts');
 const d=syntheticDraft(),h=d.header,calls:string[]=[],parameters:unknown[][]=[];let connects=0,releases=0,escaped:import('../packages/application/src/ports.ts').SalesTransaction|undefined;let escapedProof:import('../packages/application/src/sales-retained-approval.ts').RetainedSalesApproval|undefined,locked:import('../packages/domain/src/documents.ts').SalesDocument|undefined;
 const client={async query(sql:string,values:unknown[]=[]){calls.push(sql);parameters.push(values);let rows:Record<string,unknown>[]=[];
   if(sql.includes('sales:current-schema'))rows=[{current_sales_schema_ready:true}];
   else if(sql.includes('FROM naijue_erp.sales_header WHERE'))rows=[{id:h.id,number:h.number,business_type:h.businessType,business_date:h.businessDate,hall_id:h.hallId,customer_id:h.customerId,salesperson_id:h.salespersonId,warehouse_id:h.warehouseId,status:'DRAFT',version:5,gross_amount:'2.50',order_discount:'0.00',net_due:'2.50',note:h.note,responsible_staff_id:null,created_by_account_id:null,created_hall_id:null,created_at:null,updated_at:time,approved_by_account_id:null,approved_at:null,stock_basis:'RUNTIME_LEDGER',unified_staff_columns:true,created_by_staff_id:null,approved_by_staff_id:null}];
   else if(sql.includes('sales-retained-approval:history'))rows=[row()];
   else if(sql.includes('document-inventory:anchor'))rows=[];
   else assert.match(sql,/^BEGIN|^COMMIT|^SELECT pg_advisory_xact_lock|FROM naijue_erp.operation_receipt WHERE|FROM naijue_erp.sales_line WHERE|FROM naijue_erp.sales_settlement WHERE/);
   return {rows,rowCount:rows.length};},release(){releases++;}};
 const uow=new PostgresSalesUnitOfWork({async connect(){connects++;return client;}});
 await uow.transaction(async tx=>{escaped=tx;assert.ok(tx.getRetainedSalesApprovalHistory);
   await assert.rejects(tx.getRetainedSalesApprovalHistory(ids.sales,version(5)),{code:'TRANSACTION_SCOPE'});
   await tx.getReceipt(actor.accountId,'current-approval');await assert.rejects(tx.getRetainedSalesApprovalHistory(ids.sales,version(5)),{code:'TRANSACTION_SCOPE'});
   locked=(await tx.getSales(ids.sales))!.document;await assert.rejects(tx.getRetainedSalesApprovalHistory(sid('sales',777),version(5)),{code:'TRANSACTION_SCOPE'});
   await assert.rejects(tx.getRetainedSalesApprovalHistory(ids.sales,version(6)),{code:'TRANSACTION_SCOPE'});
   const actual=await tx.getRetainedSalesApprovalHistory(ids.sales,version(5));assert.equal(actual.events[0]?.receipt?.id,operation);actual.assertCurrent();escapedProof=certifyRetainedSalesApproval(locked!,actual,tx);assert.ok(escapedProof);assert.ok(retainedSalesApprovalSnapshot(escapedProof,locked!,tx));
   assert.throws(()=>retainedSalesApprovalSnapshot(escapedProof!,locked!,{}),{code:'INVALID_RETAINED_APPROVAL'});
   await assert.rejects(tx.putRuntimeSales(locked!),{code:'VERSION_CONFLICT'});assert.throws(()=>retainedSalesApprovalSnapshot(escapedProof!,locked!,tx),{code:'TRANSACTION_SCOPE'});
 });
 assert.equal(connects,1);assert.equal(releases,1);assert.equal(calls.filter(sql=>sql.includes('sales-retained-approval:history')).length,1);
 assert.deepEqual(parameters[calls.findIndex(sql=>sql.includes('sales-retained-approval:history'))],[ids.sales,5,SALES_RETAINED_APPROVAL_MAX_HISTORY+1]);
 await assert.rejects(escaped!.getRetainedSalesApprovalHistory!(ids.sales,version(5)),{code:'TRANSACTION_CLOSED'});
 assert.throws(()=>retainedSalesApprovalSnapshot(escapedProof!,locked!,escaped),{code:'TRANSACTION_CLOSED'});
 assert.equal(calls.at(-1),'COMMIT');
});

test('retained approval history max+1 overflow fails explicitly, never silently truncates or authorizes a partial chain',async()=>{
 await assert.rejects(readSalesRetainedApprovalHistory(async(_sql,values)=>{assert.equal(values?.[2],SALES_RETAINED_APPROVAL_MAX_HISTORY+1);return {rows:Array.from({length:SALES_RETAINED_APPROVAL_MAX_HISTORY+1},row),rowCount:SALES_RETAINED_APPROVAL_MAX_HISTORY+1};},ids.sales,version(5)),{code:'UNKNOWN_PRICING_FACTS'});
});
