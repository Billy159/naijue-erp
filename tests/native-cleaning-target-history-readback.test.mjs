import test from 'node:test';
import assert from 'node:assert/strict';
import {readTargetImportedHistorySnapshot} from '../scripts/import-v3/native-cleaning/target-stock-readback.mjs';
const batchId='00000000-0000-0000-0000-000000000001',hash='a'.repeat(64);
const relations=['history_sales_header','history_transfer_header','history_sales_line','history_transfer_line','history_sales_settlement',
 'history_sales_effective','history_transfer_effective','history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective','history_revision'];
function database({data={},counts={},failAt}={}){
 const calls=[],positions=new Map();
 return {calls,pool:{async connect(){calls.push({connect:true});return {release(error){calls.push({release:error?.message??null});},async query(sql,params){
  calls.push({sql,params});if(failAt&&sql.startsWith(failAt))throw Error('SYNTHETIC_TARGET_FAILURE');
  if(sql.includes('pg_current_snapshot'))return {rows:[{database:'synthetic',role:'ordinary',session_role:'ordinary',ordinary_login:true,snapshot:'1:2:',read_only:'on',isolation:'repeatable read'}]};
  if(sql.startsWith('SELECT id::text'))return {rows:[{id:batchId,source_hash:hash,status:'PUBLISHED'}]};
  if(sql.startsWith('SELECT count')){
   assert.deepEqual(params,[batchId]);const relation=sql.match(/FROM naijue_erp\.(\w+) r/)[1];
   return {rows:[{count:counts[relation]??String((data[relation]??[]).length)}]};
  }
  if(sql.startsWith('DECLARE')){assert.deepEqual(params,[batchId]);return {rows:[]};}
  if(sql.startsWith('FETCH')){
   const relation=sql.match(/cleaning_readback_(\w+)$/)[1],n=Number(sql.match(/FORWARD (\d+)/)[1]),offset=positions.get(relation)??0;
   const rows=(data[relation]??[]).slice(offset,offset+n);positions.set(relation,offset+rows.length);return {rows};
  }
  assert.match(sql,/^(BEGIN|SET LOCAL|CLOSE|ROLLBACK)/);return {rows:[]};
 }};}}};
}
const options={batchId,expectedSourceHash:hash,pageRows:1,onHistory:async()=>{}};
test('independent history readback retains original/effective revisions, duplicate SKU lines and exact monetary text',async()=>{
 const raw='{"sku_id":"same-sku","quantity":-9007199254740993,"deal_price":1234567890123456.78,"approved_local_at":null}';
 const data={history_sales_line:[{id:'line-a',raw_json:raw},{id:'line-b',raw_json:raw}],
  history_sales_line_effective:[{id:'line-a',raw_json:'{"quantity":0,"line_amount":0.00}'}],
  history_revision:[{id:'revision-a',raw_json:'{"from_version":1,"to_version":2}'}]},seen=[];
 const db=database({data});const result=await readTargetImportedHistorySnapshot(db.pool,{...options,onHistory:(rows,table)=>seen.push({table,rows})});
 assert.equal(result.status,'TARGET_IMPORTED_HISTORY_READ_BACK_NOT_RECONCILED');assert.equal(result.dataCompared,false);assert.equal(result.targetWrites,0);
 assert.deepEqual(result.tables.map(x=>x.name),relations);assert.ok(result.tables.every(x=>x.eofObserved));
 assert.equal(seen[0].rows[0].raw_json,raw);assert.equal(seen[1].rows[0].id,'line-b');
 assert.equal(seen[2].table,'history_sales_line_effective');assert.equal(seen[3].table,'history_revision');
 assert.equal(db.calls.filter(x=>x.connect).length,1);assert.equal(db.calls.at(-2).sql,'ROLLBACK');assert.deepEqual(db.calls.at(-1),{release:null});
 const cursors=db.calls.filter(x=>x.sql?.startsWith('DECLARE'));assert.equal(cursors.length,11);
 for(const q of cursors){assert.ok(q.sql.includes('$1::uuid'));assert.ok(q.sql.includes('to_jsonb(r)::text'));assert.equal(/JOIN/.test(q.sql),false);}
 assert.ok(cursors.find(x=>x.sql.includes('cleaning_readback_history_revision ')).sql.includes('r.transfer_id'));
});
test('empty target facts are explicitly empty readback, never a matched conversion',async()=>{
 const db=database(),result=await readTargetImportedHistorySnapshot(db.pool,options);
 assert.ok(result.tables.every(x=>x.rows==='0'));assert.equal(result.sourceCompletenessVerified,false);
 assert.equal(db.calls.filter(x=>x.sql?.startsWith('FETCH')).length,11);
});
test('missing rows, duplicate identity or absent raw payload prevent completed history result',async()=>{
 for(const setup of [
  {data:{history_transfer_line:[{id:'a',raw_json:'{}'}]},counts:{history_transfer_line:'2'}},
  {data:{history_transfer_line:[{id:'a',raw_json:'{}'},{id:'a',raw_json:'{}'}]}},
  {data:{history_transfer_line:[{id:'a'}]}},
 ]){
  const db=database(setup);await assert.rejects(readTargetImportedHistorySnapshot(db.pool,options),/COUNT_MISMATCH|DUPLICATE_ROW|RAW_JSON_REQUIRED/);
  assert.equal(db.calls.at(-2).sql,'ROLLBACK');assert.deepEqual(db.calls.at(-1),{release:null});
 }
});
test('cancellation and failed private sink stop before subsequent relations, without SQL writes',async()=>{
 for(const cancel of [false,true]){
  const db=database({data:{history_sales_header:[{id:'a',raw_json:'{}'}]}}),controller=new AbortController();
  await assert.rejects(readTargetImportedHistorySnapshot(db.pool,{...options,signal:controller.signal,onHistory:()=>{
   if(cancel)controller.abort();else throw Error('SYNTHETIC_PRIVATE_SINK_FAILURE');
  }}),cancel?{name:'AbortError'}:/SYNTHETIC_PRIVATE_SINK_FAILURE/);
  assert.equal(db.calls.filter(x=>x.sql?.startsWith('DECLARE')).length,1);
  assert.equal(db.calls.some(x=>/^(INSERT|UPDATE|DELETE|ALTER|CREATE)/.test(x.sql??'')),false);
  assert.equal(db.calls.at(-2).sql,'ROLLBACK');
 }
});
