import test from 'node:test'; import assert from 'node:assert/strict';
import { collectStandard27ProductAuditBodies } from '../adapters/postgres/src/standard27-product-audit-body-collector.ts';
const id='00000000-0000-4000-8000-000000000001';
const metadata={object_type:'PRODUCT',target_type:'PRODUCT',receipt_status:'COMMITTED',action:'EDIT',receipt_action:'EDIT',actor_account_id:'actor',receipt_actor:'actor',request_hash:'a'.repeat(64),occurred_at:'2026-11-03T00:00:00.000000Z',completed_at:'2026-11-03T00:00:00.000000Z'};
test('same-client audit body observation bounds aggregate before transfer and is never proof',async()=>{
 let sql=''; const client={async query(q:string,v:unknown[]=[]){sql=q;assert.deepEqual(v,[id,1025]);return {rows:[]}}};let guard=0;
 const result=await collectStandard27ProductAuditBodies(client,id,async c=>{assert.equal(c,client);guard++});
 assert.equal(result.verification,'UNVERIFIED_CANDIDATE_ONLY');assert.equal(guard,2);assert.match(sql,/sum\(.*OVER/s);assert.match(sql,/16777216/);assert.match(sql,/1024/);assert.doesNotMatch(sql,/import_source_row/);
});
test('over-limit indicators and missing receipt fail, guard may not return a value',async()=>{
 const bad={async query(){return {rows:[{total_rows:'1025',total_bytes:'10',receipt_id:null}]}}};await assert.rejects(collectStandard27ProductAuditBodies(bad,id,async()=>{}));
 let reads=0;await assert.rejects(collectStandard27ProductAuditBodies({async query(){reads++;return {rows:[]}}},id,async()=>false as unknown as void));assert.equal(reads,0);
});
test('missing body or inconsistent total metadata is rejected',async()=>{
 const base={...metadata,id:'a',operation_id:'o',object_id:id,target_id:id,receipt_id:'o',total_rows:'1',total_bytes:'1'};
 for(const row of [base,{...base,after_values:'{}',total_rows:'2'}]) await assert.rejects(collectStandard27ProductAuditBodies({async query(){return {rows:[row]}}},id,async()=>{}));
});
test('all audit rows must report one identical aggregate byte count',async()=>{
 const a={...metadata,id:'a',operation_id:'a',object_id:id,target_id:id,receipt_id:'a',total_rows:'2',total_bytes:'1',before_values:null,after_values:'{}'};
 const b={...a,id:'b',operation_id:'b',receipt_id:'b',total_bytes:'2'};
 await assert.rejects(collectStandard27ProductAuditBodies({async query(){return {rows:[a,b]}}},id,async()=>{}));
});
test('audit JSON travels as exact database text, never lossy native JSON numbers',async()=>{
 const raw='{"quantity": 9007199254740993}';const row={...metadata,id:'a',operation_id:'a',object_id:id,target_id:id,receipt_id:'a',total_rows:'1',total_bytes:String(raw.length),before_values:null,after_values:raw};let sql='';
 const result=await collectStandard27ProductAuditBodies({async query(q){sql=q;return {rows:[row]}}},id,async()=>{});assert.equal(result.rows[0]!.after_values,raw);assert.match(sql,/THEN after_values::text/);
});
test('same statement observes receipt-only operations rather than hiding them behind audit scan',async()=>{
 let sql='';const client={async query(q:string){sql=q;return {rows:[]}}};await collectStandard27ProductAuditBodies(client,id,async()=>{});
 assert.match(sql,/FULL\s+(?:OUTER\s+)?JOIN/i);assert.match(sql,/receipts AS MATERIALIZED/i);assert.match(sql,/FOR SHARE OF r/i);
});
test('returned receipt and audit metadata must agree before any body is returned',async()=>{
 const row={id:'a',operation_id:'o',object_type:'PRODUCT',object_id:id,action:'EDIT',actor_account_id:'actor',occurred_at:'2026-11-03T00:00:00.000000Z',receipt_id:'o',receipt_status:'COMMITTED',target_type:'PRODUCT',target_id:id,receipt_action:'EDIT',receipt_actor:'other',request_hash:'a'.repeat(64),completed_at:'2026-11-03T00:00:00.000000Z',total_rows:'1',total_bytes:'2',before_values:null,after_values:'{}'};
 await assert.rejects(collectStandard27ProductAuditBodies({async query(){return {rows:[row]}}},id,async()=>{}));
});
