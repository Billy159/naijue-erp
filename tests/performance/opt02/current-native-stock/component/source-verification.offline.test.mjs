/** Independent finite helper review. Scripted query results ONLY; no PG/issuer/publication execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReferenceFixture} from './fixture.mjs';
import {referenceComparisonPlan,verifyReferenceSource,verifyReferenceBalances,REFERENCE_BALANCES_SQL} from './source-verification.mjs';
import {verifyReferenceAcknowledgement} from './publication.mjs';
import {NODE_SCRYPT_DUMMY_HASH} from '../../../../../packages/authentication/src/passwords.ts';
const fixture=buildReferenceFixture(), passwordHash=NODE_SCRYPT_DUMMY_HASH;
const plan=referenceComparisonPlan(fixture,passwordHash),counts=Object.entries(fixture.referenceCounts);
const snapshot=value=>JSON.stringify(value,(_k,v)=>typeof v==='bigint'?String(v):v);
function sourceQuery(index,mutate=()=>undefined){
 const calls=[];
 return {calls,async query(text,values){
  const n=calls.length;calls.push({text,values});let rows;
  if(n<plan.length){assert.equal(text,plan[n].text);assert.deepEqual(values,plan[n].values);rows=[{n:1}];}
  else if(n<plan.length+counts.length){const [table,count]=counts[n-plan.length];assert.equal(text,`SELECT count(*)::int n FROM naijue_erp."${table}"`);assert.equal(values,undefined);rows=[{n:count}];}
  else{assert.equal(n,plan.length+counts.length);assert.equal(text,'SELECT (SELECT count(*)::int FROM naijue_erp.import_batch) batches,(SELECT count(*)::int FROM naijue_erp.import_source_row) typed_sources');rows=[{batches:index===0?0:1,typed_sources:0}];}
  return {rows:mutate(n,structuredClone(rows))??rows};
 }};
}
test('offline literal plan binds all105 rows/nulls by parameters; no password literal or returned hash; stage0..3 closes all tables',async()=>{
 assert.equal(plan.length,105);assert.ok(Object.isFrozen(plan)&&plan.every(Object.isFrozen));
 assert.equal(counts.reduce((n,[,c])=>n+c,0),105);
 for(const row of plan){assert.equal((row.text.match(/IS NOT DISTINCT FROM/g)||[]).length,row.values.length);assert.equal((row.text.match(/\$\d+/g)||[]).length,row.values.length);assert.ok(!row.text.includes(passwordHash));assert.ok(!/\b(?:INSERT|UPDATE|DELETE|GRANT|COMMIT|ROLLBACK)\b/i.test(row.text));}
 assert.equal(plan.filter(row=>row.table==='user_account')[0].values.includes(passwordHash),true);
 for(let index=0;index<4;index++){const q=sourceQuery(index),result=await verifyReferenceSource(q.query,fixture,passwordHash,index);assert.equal(q.calls.length,105+counts.length+1);assert.deepEqual(result,{matchedSourceRows:105,tableClosure:true,commandIndex:index,typedProductOrHistorySourceRows:0,passwordAndHashNotReturned:true,scope:'SOURCE_LITERAL_COMPARISON_NOT_RECEIPT_OR_RUNTIME_APPROVAL'});assert.ok(!snapshot(result).includes(passwordHash));assert.ok(Object.isFrozen(result));}
});
test('offline every literal row is mandatory; absent/duplicate/string count cannot pass and failure stops further query dispatch',async()=>{
 for(let target=0;target<105;target++){const q=sourceQuery(0,(n)=>n===target?[{n:0}]:undefined);await assert.rejects(verifyReferenceSource(q.query,fixture,passwordHash,0),{code:'ACTUAL_REFERENCE_LITERAL_ROW_DIFFERS:'+plan[target].table});assert.equal(q.calls.length,target+1);}
 for(const rows of [[],[{n:1},{n:1}],[{n:'1'}],[{n:2}],[{n:null}],[{}]]){const q=sourceQuery(0,n=>n===0?rows:undefined);await assert.rejects(verifyReferenceSource(q.query,fixture,passwordHash,0),{code:'ACTUAL_REFERENCE_LITERAL_ROW_DIFFERS:'+plan[0].table});assert.equal(q.calls.length,1);}
});
test('offline every table closure is exact, and stage-specific legacy batch/zero typed sources are both required',async()=>{
 for(let i=0;i<counts.length;i++){const q=sourceQuery(1,n=>n===105+i?[{n:counts[i][1]+1}]:undefined);await assert.rejects(verifyReferenceSource(q.query,fixture,passwordHash,1),{code:'ACTUAL_REFERENCE_TABLE_CLOSURE_DIFFERS:'+counts[i][0]});assert.equal(q.calls.length,106+i);}
 for(const index of [0,1,2,3])for(const rows of [[{batches:index===0?1:0,typed_sources:0}],[{batches:index===0?0:1,typed_sources:1}],[{batches:String(index===0?0:1),typed_sources:0}],[]]){const q=sourceQuery(index,n=>n===105+counts.length?rows:undefined);await assert.rejects(verifyReferenceSource(q.query,fixture,passwordHash,index),{code:'NEW_REFERENCE_LEGACY_BATCH_NOT_TYPED_PRODUCT_SOURCE'});}
});
test('offline wrong fixture/index/password/query and query transport failure never become source approval',async()=>{
 let calls=0;const query=async()=>{calls++;return{rows:[]};};
 for(const index of [-1,4,0.5,'0',NaN,Infinity])await assert.rejects(verifyReferenceSource(query,fixture,passwordHash,index),{code:'EXACT_REFERENCE_SOURCE_COMMAND_INDEX_REQUIRED'});
 await assert.rejects(verifyReferenceSource(query,{...fixture},passwordHash,0),{code:'ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED'});
 await assert.rejects(verifyReferenceSource(null,fixture,passwordHash,0),{code:'EXACT_REFERENCE_SOURCE_COMMAND_INDEX_REQUIRED'});
 await assert.rejects(verifyReferenceSource(query,fixture,'not-a-password-hash',0));assert.equal(calls,0);
 const cause=Error('scripted unavailable query');await assert.rejects(verifyReferenceSource(async()=>{throw cause;},fixture,passwordHash,0),e=>e===cause);
});
const balanceRows=()=>fixture.baselines.map(b=>({warehouse_id:b.warehouseId,sku_id:b.skuId,quantity:b.quantity,version:1,last_operation_id:fixture.expectedResults[2].operationId})).sort((a,b)=>a.warehouse_id<b.warehouse_id?-1:a.warehouse_id>b.warehouse_id?1:a.sku_id<b.sku_id?-1:a.sku_id>b.sku_id?1:0);
const balanceQuery=rows=>async(text,values)=>{assert.equal(text,REFERENCE_BALANCES_SQL);assert.equal(values,undefined);return{rows};};
test('offline balance helper compares complete signed quantities/versions/baseline operation and explicit absence; no publication claim',async()=>{
 const rows=balanceRows();assert.equal(rows.length,4);assert.ok(rows.some(row=>row.quantity==='-2'));
 const result=await verifyReferenceBalances(balanceQuery(rows),fixture);assert.deepEqual(result,{nonzeroRows:4,absentSourcePairs:2,completeWarehouseSkuPairs:6,matchedSource:true,phase:'MUST_BE_CHECKED_BEFORE_ORIGINAL_PUBLISH_NOT_AFTER_ONLY',publicationOrRuntimeApproval:false});assert.ok(Object.isFrozen(result));
 for(const mutate of [r=>r.pop(),r=>r.push({...r[0]}),r=>r.reverse(),r=>{r[0].quantity='0';},r=>{r[0].quantity=Number(r[0].quantity);},r=>{r[0].version=2;},r=>{r[0].last_operation_id=fixture.expectedResults[0].operationId;},r=>{r[0].unexpected='extra';},r=>r.push({warehouse_id:fixture.absentPairs[0].warehouseId,sku_id:fixture.absentPairs[0].skuId,quantity:'0',version:1,last_operation_id:fixture.expectedResults[2].operationId})]){const changed=structuredClone(rows);mutate(changed);await assert.rejects(verifyReferenceBalances(balanceQuery(changed),fixture),{code:'REFERENCE_COMPLETE_FOUR_NONZERO_TWO_ABSENT_BALANCES_DIFFER'});}
});
const occurredAt='2026-11-01T00:00:01.123Z';
function ackRows(index){const c=fixture.commands[index],r=fixture.expectedResults[index],time=occurredAt.slice(0,-1)+'000Z';return[
 [{id:r.operationId,actor_account_id:c.actorAccountId,request_key:c.requestKey,request_hash:fixture.commandHashes[index],action:c.action,target_type:'IMPORT',target_id:fixture.batchId,status:'COMMITTED',result_data:structuredClone(r),completed_at:time}],
 [{operation_id:r.operationId,actor_account_id:c.actorAccountId,object_type:'IMPORT',object_id:fixture.batchId,action:c.action,old_version:index===0?null:index,new_version:index+1,before_values:index===0?null:structuredClone(fixture.checkpoints[index-1]),after_values:structuredClone(fixture.checkpoints[index]),occurred_at:time}],r.ledgerEntryIds.map(id=>({id}))];}
function ackQuery(index,mutate=()=>undefined){const all=ackRows(index),calls=[];return {calls,async query(text,values){const n=calls.length;calls.push(text);assert.ok(n<3);assert.deepEqual(values,[fixture.expectedResults[index].operationId]);assert.ok(text.includes(['ack-receipt','ack-audit','ack-ledger'][n]));return{rows:mutate(n,structuredClone(all[n]))??all[n]};}};}
test('offline acknowledgement comparator requires all3 evidence queries for each original command; this is not a COMMIT or issuer receipt',async()=>{
 for(let index=0;index<4;index++){const q=ackQuery(index),r=await verifyReferenceAcknowledgement(fixture,q.query,index,fixture.expectedResults[index],occurredAt);assert.equal(q.calls.length,3);assert.equal(r.commandIndex,index);assert.equal(r.ledgerEffects,index===2?4:0);assert.ok(r.receiptObserved&&r.auditObserved&&r.sourceClockMatched);}
});
test('offline acknowledgement rejects each changed receipt/audit field, wrong cardinality/checkpoint and ledger discrepancy, without later queries',async()=>{
 for(const stage of [0,1])for(const field of Object.keys(ackRows(2)[stage][0])){const q=ackQuery(2,(n,rows)=>{if(n!==stage)return;rows[0][field]=null;return rows;});await assert.rejects(verifyReferenceAcknowledgement(fixture,q.query,2,fixture.expectedResults[2],occurredAt));assert.equal(q.calls.length,stage+1);}
 for(const stage of [0,1])for(const rows of [[],[...ackRows(2)[stage],...ackRows(2)[stage]]]){const q=ackQuery(2,n=>n===stage?rows:undefined);await assert.rejects(verifyReferenceAcknowledgement(fixture,q.query,2,fixture.expectedResults[2],occurredAt));assert.equal(q.calls.length,stage+1);}
 for(const rows of [[],[...ackRows(2)[2]].reverse(),[...ackRows(2)[2],ackRows(2)[2][0]]]){const q=ackQuery(2,n=>n===2?rows:undefined);await assert.rejects(verifyReferenceAcknowledgement(fixture,q.query,2,fixture.expectedResults[2],occurredAt),{code:'ACTUAL_REFERENCE_LEDGER_IDS_DIFFER_FROM_SOURCE'});}
});
