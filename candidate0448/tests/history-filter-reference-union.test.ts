/** Scripted protocol/source-contract checks; not a PostgreSQL parser or business UAT. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresSalesQueryReader} from '../adapters/postgres/src/sales-query-reader.ts';
import {PostgresTransferQueryReader} from '../adapters/postgres/src/transfer-query-reader.ts';
import {actor,ids} from './support/synthetic-fixtures.ts';
function fixture(valid=true,enabled=true,role="SALESPERSON"){
 const calls:{sql:string;values:unknown[]}[]=[],state={closed:0,ready:0};
 const client={async query(sql:string,values:unknown[]=[]){calls.push({sql,values:structuredClone(values)});let rows:Record<string,unknown>[]=[];
  if(sql.includes('read-authorization:identity'))rows=[{account_id:actor.accountId,staff_id:ids.account,login_enabled:enabled,role,employment_status:'在职',hall_id:actor.hallId,native_hall_id:actor.hallId,hall_enabled:true}];
  else if(sql.includes('normal-reference:validity')){
   const used=[...new Set([...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
   assert.deepEqual(used,Array.from({length:values.length},(_,i)=>i+1),'42P18-risk: validity SQL must bind a dense, fully used parameter vector');rows=[{valid}];
  }
  else if(sql.includes('COUNT(*)'))rows=[{exact_total:'1'}];
  else if(sql.startsWith('SELECT r.id'))rows=values.at(-1)==='20'?[]:[{id:ids.customer,label:'停用历史客户'}];
  else if(sql.startsWith('SELECT w.id'))rows=[{id:ids.warehouse,name:'历史仓',hall_id:ids.hall,hall_name:'厅',enabled:false,hall_enabled:true}];
  return {rows,rowCount:rows.length};},release(){state.closed++;}};
 const pool={async connect(){return client;}},runtime26={profile:'EXACT26' as const,contract:'NATIVE_RUNTIME26_V1' as const,async assertReady(c:unknown,purpose:unknown){assert.equal(c,client);assert.equal(purpose,'HISTORY_READ');state.ready++;}};
 const options={profile:'source-confirmed-normal-document-lists-v1' as const,runtime26};return {calls,state,sales:new PostgresSalesQueryReader(pool,options),transfer:new PostgresTransferQueryReader(pool,options)};
}
test('B08 sales candidates use the original snapshot/identity/publication and UNION UUIDs without enabled or page-based scope',async()=>{
 const f=fixture();const result=await f.sales.readReferences({actor,scope:{kind:'all'},signal:new AbortController().signal,parameters:{kind:'customer',search:'历史',page:1,pageSize:20}});
 assert.equal(result.exactTotal,1n);assert.equal(result.items[0]?.label,'停用历史客户');assert.equal(f.state.ready,1);assert.equal(f.state.closed,1);
 const sql=f.calls.find(c=>c.sql.includes('COUNT(*)'))!;assert.match(sql.sql,/UNION SELECT h.customer_id/);assert.match(sql.sql,/history_sales_header/);assert.match(sql.sql,/h.hall_id=\$/);assert.doesNotMatch(sql.sql,/r.enabled|LIMIT|UNION ALL/);
 assert.match(sql.sql,/strpos\(r.code/);assert.equal(f.calls[0]?.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(f.calls.at(-1)?.sql,'COMMIT');
 const page=f.calls.find(c=>c.sql.startsWith('SELECT r.id'))!;assert.match(page.sql,/ORDER BY r.name COLLATE "C", r.id/);assert.deepEqual(page.values.slice(0,sql.values.length),sql.values);
});
test('B08 corrupt publication or revoked current identity fails closed before candidate names',async()=>{
 for(const [valid,enabled]of [[false,true],[true,false]]){const f=fixture(valid,enabled);await assert.rejects(f.sales.readReferences({actor,scope:{kind:'all'},signal:new AbortController().signal,parameters:{kind:'customer',search:'',page:1,pageSize:20}}));assert.equal(f.calls.some(c=>c.sql.startsWith('SELECT r.id')),false);assert.equal(f.calls.at(-1)?.sql,'ROLLBACK');}
});
test('B08 restricted warehouse candidates retain effective/source-proven endpoints and intersect selected IDs',async()=>{
 const f=fixture();const result=await f.transfer.readWarehouses({actor:{...actor,role:"SALESPERSON"},scope:{kind:'restricted',clauses:[{fromHallId:ids.hall}]},signal:new AbortController().signal,parameters:{search:'',selectedIds:[ids.warehouse],page:1,pageSize:20}});
 assert.equal(result.items[0]?.enabled,false);const sql=f.calls.find(c=>c.sql.includes('COUNT(*)'))!;assert.match(sql.sql,/UNION SELECT/);assert.match(sql.sql,/history_transfer_header/);assert.match(sql.sql,/import_record/);assert.match(sql.sql,/created_role_source='SALESPERSON'/);assert.match(sql.sql,/w.id = ANY/);assert.ok(sql.values.some(v=>Array.isArray(v)&&v[0]===ids.warehouse));assert.doesNotMatch(sql.sql,/w.enabled\s*=/);
});
test('B08 transfer all retains explicit broad catalogue semantics without new HISTORY activation',async()=>{
 const f=fixture();await f.transfer.readWarehouses({actor:{...actor,role:"SALESPERSON"},scope:{kind:'all'},signal:new AbortController().signal,parameters:{search:'',selectedIds:[],page:1,pageSize:20}});assert.equal(f.state.ready,0);assert.equal(f.calls.some(c=>c.sql.includes('history_transfer_header')),false);
});

test('B08 existing four dimensions retain ID-based UNION and exact empty second page without fetching current-page documents',async()=>{
 for(const [kind,column]of [['hall','hall_id'],['salesperson','salesperson_id'],['customer','customer_id'],['warehouse','warehouse_id']] as const){
  const f=fixture();const result=await f.sales.readReferences({actor,scope:{kind:'all'},signal:new AbortController().signal,parameters:{kind,search:'',page:2,pageSize:20}});
  assert.equal(result.exactTotal,1n);assert.deepEqual(result.items,[]);
  const count=f.calls.find(c=>c.sql.includes('COUNT(*)'))!,page=f.calls.find(c=>c.sql.startsWith('SELECT r.id'))!;
  assert.ok(count.sql.includes(`UNION SELECT h.${column}`));assert.doesNotMatch(count.sql,/GROUP BY.*name|LIMIT/);assert.match(page.sql,/LIMIT.*OFFSET/s);
  assert.deepEqual(page.values.slice(0,count.values.length),count.values);assert.equal(f.calls.filter(c=>c.sql.includes('read-authorization:identity')).length,1);
 }
});

test('B08-PARAM-01 validity binds only its own contiguous history arguments across native/search/selected prefixes',async()=>{
 for(const role of ['ADMIN','SALESPERSON']){
  const f=fixture(true,true,role);await f.sales.readReferences({actor,scope:{kind:'restricted',clauses:[{hallId:ids.hall,warehouseId:ids.warehouse,createdByAccountId:ids.account}]},signal:new AbortController().signal,parameters:{kind:'customer',search:'native-only-search',page:1,pageSize:20}});
  const q=f.calls.find(c=>c.sql.includes('normal-reference:validity'))!;
  assert.equal(q.values.includes('native-only-search'),false);assert.equal(q.values.includes(ids.account),false);
  assert.equal(q.values.length,role==='ADMIN'?1:2);assert.match(q.sql,/bool_and/);assert.match(q.sql,/NOT EXISTS/);
 }
 for(const parameters of [
  {search:'',selectedIds:[],page:1,pageSize:20 as const},
  {search:'native-transfer-search',selectedIds:[],page:1,pageSize:20 as const},
  {search:'',selectedIds:[ids.warehouse],page:1,pageSize:20 as const}
 ]){
  const f=fixture();await f.transfer.readWarehouses({actor:{...actor,role:'SALESPERSON'},scope:{kind:'restricted',clauses:[{fromHallId:ids.hall}]},signal:new AbortController().signal,parameters});
  const q=f.calls.find(c=>c.sql.includes('normal-reference:validity'))!;
  assert.equal(q.values.some(Array.isArray),false);assert.equal(q.values.includes('native-transfer-search'),false);assert.equal(q.values.length,2);
  const used=[...new Set([...q.sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])))].sort();assert.deepEqual(used,[1,2]);
  assert.match(q.sql,/bool_and/);assert.match(q.sql,/NOT EXISTS/);assert.match(q.sql,/created_role_source='SALESPERSON'/);
  const count=f.calls.find(c=>c.sql.includes('COUNT(*)'))!,page=f.calls.find(c=>c.sql.startsWith('SELECT w.id'))!;
  assert.equal(count.values.length,parameters.search||parameters.selectedIds.length?4:3);
  assert.deepEqual(page.values.slice(0,count.values.length),count.values);
 }

});
