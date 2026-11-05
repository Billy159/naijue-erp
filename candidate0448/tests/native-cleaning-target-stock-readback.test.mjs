import test from 'node:test';
import assert from 'node:assert/strict';
import {readTargetImportedStockSnapshot} from '../scripts/import-v3/native-cleaning/target-stock-readback.mjs';
const batchId='00000000-0000-0000-0000-000000000001',hash='a'.repeat(64);
const options=()=>({batchId,expectedSourceHash:hash,pageRows:1,onAliases:async()=>{},onContributors:async()=>{},onBalances:async()=>{}});
function database({data,counts={},identity={},missingBatch=false,failAt,rollbackFails=false}={}){
 const values=data??{aliases:[{old_source_sku_id:'old-a',canonical_sku_id:'new-sku',actual_sku_id:'new-sku'}],contributors:[{source_row_id:'c-a',signed_quantity:'-9223372036854775808'}],balances:[{warehouse_id:'w',sku_id:'new-sku',balance_present:false,quantity:null,version:null}]};
 const calls=[],position={aliases:0,contributors:0,balances:0};
 const client={async query(sql,params){
  calls.push({sql,params});
  if(failAt&&sql.startsWith(failAt))throw Error('READBACK_QUERY_FAILED');
  if(sql==='ROLLBACK'&&rollbackFails)throw Error('ROLLBACK_FAILED');
  if(sql.includes('pg_current_snapshot'))return {rows:[{database:'synthetic',role:'ordinary',session_role:'ordinary',ordinary_login:true,snapshot:'1:2:',read_only:'on',isolation:'repeatable read',...identity}]};
  if(sql.startsWith('SELECT id::text')){assert.deepEqual(params,[batchId,hash]);return {rows:missingBatch?[]:[{id:batchId,source_hash:hash,status:'STAGED',mapping_version:'SYNTHETIC',inventory_mode:'SYNTHETIC'}]};}
  if(sql.startsWith('SELECT count')){
   assert.deepEqual(params,[batchId]);const kind=sql.includes('import_sku_alias a')?'aliases':sql.includes('import_stock_contributor c')?'contributors':'balances';
   return {rows:[{count:counts[kind]??String(values[kind].length)}]};
  }
  if(sql.startsWith('FETCH')){const kind=sql.match(/cleaning_readback_(\w+)$/)[1],size=Number(sql.match(/FORWARD (\d+)/)[1]);const rows=values[kind].slice(position[kind],position[kind]+size);position[kind]+=rows.length;return {rows};}
  assert.match(sql,/^(BEGIN|SET LOCAL|DECLARE|CLOSE|ROLLBACK)/);return {rows:[]};
 },release(error){calls.push({release:error?.message??null});}};
 return {calls,pool:{async connect(){calls.push({connect:true});return client;}}};
}
test('same ordinary read-only snapshot gets independent counts and explicit EOF, preserving missing and exact quantities',async()=>{
 const db=database(),rows={aliases:[],contributors:[],balances:[]};
 const r=await readTargetImportedStockSnapshot(db.pool,{...options(),onAliases:p=>rows.aliases.push(...p),onContributors:p=>rows.contributors.push(...p),onBalances:p=>rows.balances.push(...p)});
 assert.equal(r.status,'TARGET_IMPORTED_STOCK_READ_BACK_NOT_RECONCILED');assert.equal(r.dataCompared,false);assert.equal(r.targetWrites,0);
 assert.equal(rows.contributors[0].signed_quantity,'-9223372036854775808');assert.equal(rows.balances[0].balance_present,false);assert.equal(rows.balances[0].quantity,null);
 assert.deepEqual(r.tables.map(x=>x.rows),['1','1','1']);assert.ok(r.tables.every(x=>x.eofObserved));
 assert.equal(db.calls.filter(x=>x.sql?.startsWith('FETCH')).length,6);assert.equal(db.calls.filter(x=>x.connect).length,1);
 assert.equal(db.calls.at(-2).sql,'ROLLBACK');assert.deepEqual(db.calls.at(-1),{release:null});
});
test('separate source contributors or aliases sharing a target SKU are not silently merged',async()=>{
 const db=database({data:{aliases:[{old_source_sku_id:'a',canonical_sku_id:'s'},{old_source_sku_id:'b',canonical_sku_id:'s'}],contributors:[{source_row_id:'c1',canonical_sku_id:'s'},{source_row_id:'c2',canonical_sku_id:'s'}],balances:[{warehouse_id:'w',sku_id:'s',balance_present:true,quantity:'0'}]}});
 const r=await readTargetImportedStockSnapshot(db.pool,options());assert.deepEqual(r.tables.map(x=>x.rows),['2','2','1']);
});
for(const [name,setup,message] of [
 ['count exceeds complete cursor',{counts:{aliases:'2'}},'COUNT_MISMATCH'],
 ['duplicate target aliases',{data:{aliases:[{old_source_sku_id:'same'},{old_source_sku_id:'same'}],contributors:[],balances:[]}},'DUPLICATE_ROW'],
 ['wrong source batch',{missingBatch:true},'BATCH_NOT_MATCHED'],
 ['owner or privileged login',{identity:{ordinary_login:false}},'ORDINARY_LOGIN_REQUIRED'],
 ['SET ROLE from another login',{identity:{session_role:'administrator'}},'ORDINARY_LOGIN_REQUIRED'],
 ['non-readonly snapshot',{identity:{read_only:'off'}},'READONLY_SNAPSHOT_REQUIRED'],
])test(`${name} cannot return completed readback`,async()=>{
 const db=database(setup);await assert.rejects(readTargetImportedStockSnapshot(db.pool,options()),new RegExp(message));
 assert.equal(db.calls.at(-2).sql,'ROLLBACK');assert.deepEqual(db.calls.at(-1),{release:null});
});
test('sink failure and failed rollback discard the connection without any target write or success result',async()=>{
 const db=database({rollbackFails:true});await assert.rejects(readTargetImportedStockSnapshot(db.pool,{...options(),onAliases:()=>{throw Error('PRIVATE_SINK_FAILED');}}),/READBACK_AND_ROLLBACK_FAILED/);
 assert.deepEqual(db.calls.at(-1),{release:'ROLLBACK_FAILED'});
});
test('unknown BEGIN destroys the lease and final rollback failure is not replayed',async()=>{
 const begin=database({failAt:'BEGIN'});await assert.rejects(readTargetImportedStockSnapshot(begin.pool,options()),/READBACK_QUERY_FAILED/);
 assert.deepEqual(begin.calls.at(-1),{release:'READBACK_QUERY_FAILED'});assert.equal(begin.calls.filter(c=>c.sql==='ROLLBACK').length,0);
 const end=database({rollbackFails:true});await assert.rejects(readTargetImportedStockSnapshot(end.pool,options()),/ROLLBACK_FAILED/);
 assert.equal(end.calls.filter(c=>c.sql==='ROLLBACK').length,1);assert.deepEqual(end.calls.at(-1),{release:'ROLLBACK_FAILED'});
});
test('cancellation after a page rolls back before further target reads',async()=>{
 const db=database(),controller=new AbortController();await assert.rejects(readTargetImportedStockSnapshot(db.pool,{...options(),signal:controller.signal,onAliases:()=>controller.abort()}),{name:'AbortError'});
 assert.equal(db.calls.filter(c=>c.sql?.startsWith('FETCH')).length,1);assert.equal(db.calls.at(-2).sql,'ROLLBACK');
});
test('missing private sinks or source identity refuse before connecting',async()=>{
 const db=database();await assert.rejects(readTargetImportedStockSnapshot(db.pool,{...options(),onAliases:null}),/INPUT_REQUIRED/);
 await assert.rejects(readTargetImportedStockSnapshot(db.pool,{...options(),expectedSourceHash:'not a hash'}),/INPUT_REQUIRED/);
 assert.equal(db.calls.length,0);
});
