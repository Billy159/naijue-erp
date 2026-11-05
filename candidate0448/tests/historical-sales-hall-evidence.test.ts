/** Synthetic reviewed source observations only, no database or real source data. */
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildHistoricalSalesHallEvidence,parseHistoricalSalesHallEvidence,readHistoricalSalesHallApproval,validateHistoricalSalesHallEvidence,historicalSalesHallApprovalWire} from '../packages/application/src/unified-historical-sales-hall-evidence.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,H='a'.repeat(64),at='2026-11-05T03:00:00Z',refs=[{file_sha256:H,sheet:'SYNTHETIC',row:2}];
const observed=(originalHallId:string|null=null,warehouseHallId:string|null=id(2))=>buildHistoricalSalesHallEvidence({originalHallId,warehouseId:id(1),warehouseHallId,warehouseVersion:warehouseHallId?3:null,capturedAt:warehouseHallId?at:null});
function approved(evidence=observed()){
 const bytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:'SYNTHETIC',evidence_sha256:H,records:[{source_key:'SALE1',target_id:id(4),source_refs:refs,evidence}]})),trustedSha256=createHash('sha256').update(bytes).digest('hex');
 const approval=readHistoricalSalesHallApproval({bytes,trustedSha256,sourceNamespace:'SYNTHETIC',sourceHashes:new Set([H])});return {bytes,approval,context:{sourceNamespace:'SYNTHETIC',sourceKey:'SALE1',targetId:id(4),sourceRefs:refs,fields:{stock_basis:'CUTOFF_HISTORY',warehouse_id:id(1),hall_id:evidence.selected_hall_id},approval,warehouse:{id:id(1),hall_id:id(2),version:3}}};
}
test('unknown original plus observed warehouse hall is explicitly derived, never ORIGINAL',()=>{
 const e=observed();assert.equal(e.basis,'MIGRATION_DERIVED');assert.equal(e.original_hall_id,null);assert.equal(e.selected_hall_id,id(2));assert.equal(e.warehouse_version,3);assert.equal(e.captured_at,at);assert.equal(e.review_required,false);
 const f=approved(e);assert.deepEqual(validateHistoricalSalesHallEvidence(e,f.context),e);assert.equal(historicalSalesHallApprovalWire(f.approval).utf8,f.bytes.toString());
});
test('reliable original wins over different warehouse observation and retains a reviewable difference',()=>{
 const e=observed(id(3));assert.equal(e.basis,'ORIGINAL');assert.equal(e.selected_hall_id,id(3));assert.equal(e.warehouse_hall_id_at_capture,id(2));assert.equal(e.has_difference,true);assert.equal(e.review_required,true);
 assert.deepEqual(validateHistoricalSalesHallEvidence(e,approved(e).context),e);
});
test('unresolved source and warehouse retain explicit pending state without guessed hall or capture time',()=>{
 const e=observed(null,null);assert.equal(e.basis,'PENDING_REVIEW');assert.equal(e.selected_hall_id,null);assert.equal(e.captured_at,null);assert.equal(e.warehouse_version,null);assert.equal(e.review_required,true);
});
test('package self-attestation, changed source/target/capture and runtime bypass all fail closed',()=>{
 const e=observed(),f=approved(e);
 for(const c of [{...f.context,approval:structuredClone(f.approval)},{...f.context,approval:undefined},{...f.context,targetId:id(8)},{...f.context,sourceRefs:[{...refs[0]!,row:3}]},{...f.context,fields:{...f.context.fields,stock_basis:'RUNTIME_LEDGER'}},{...f.context,warehouse:{...f.context.warehouse,version:4}}])assert.throws(()=>validateHistoricalSalesHallEvidence(e,c));
 for(const v of [{...e,basis:'ORIGINAL'},{...e,original_hall_id:id(3)},{...e,captured_at:null},{...e,captured_at:'2026-02-31T03:00:00Z'},{...e,captured_at:'0000-01-01T00:00:00Z'},{...e,selected_hall_id:id(3)},{...e,has_difference:true},{...e,review_required:true},{...e,extra:true}])assert.throws(()=>parseHistoricalSalesHallEvidence(v));
 let reads=0;const bad={...e};Object.defineProperty(bad,'selected_hall_id',{enumerable:true,get(){reads++;return id(2);}});assert.throws(()=>parseHistoricalSalesHallEvidence(bad));assert.equal(reads,0);
});
