// Finite offline regression checks for QB452 F01-F04; no PG, HTTP, runner or SAVE.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {preflight} from './normal-fullsave-v19.mjs';
const input=JSON.parse(await readFile(new URL('./NORMAL-FULLSAVE-INPUT.json',import.meta.url)));
// Evaluate the same inert module bodies to access private assertions without adding public exports.
const source=await readFile(new URL('./normal-fullsave-v19.mjs',import.meta.url),'utf8');
const helpers=vm.runInThisContext('(function(assert){'+source.replace(/^import .*;$/gm,'').replace(/export async function/g,'async function')+'\nreturn {assertDisabled,assertProtectedSnapshot,assertProtectedUnchanged,assertOperationRows};})')(assert);

for(const rollbackFails of [false,true])test(`F01 primary error retained; release once; rollbackFails=${rollbackFails}`,async()=>{
  const primary=Object.assign(new Error('OFFLINE_PRIMARY'),{code:'42501'}),rollback=new Error('OFFLINE_ROLLBACK');
  const releases=[],queries=[];
  const c={async query(sql){queries.push(sql);if(sql==='ROLLBACK'&&rollbackFails)throw rollback;return {rows:[]};},release(error){releases.push(error);}};
  const pool={async connect(){return c;}},issued={pool,runtime26:{async assertReady(){throw primary;}}};
  let observed;try{await preflight(pool,issued,input);}catch(error){observed=error;}
  assert.deepEqual(queries,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);assert.equal(releases.length,1);
  if(rollbackFails){assert.ok(observed instanceof AggregateError);assert.deepEqual(observed.errors,[primary,rollback]);assert.equal(observed.cause,primary);assert.equal(observed.code,'42501');assert.equal(releases[0],rollback);}
  else{assert.equal(observed,primary);assert.equal(releases[0],undefined);}
});
test('F01 failed BEGIN releases without issuing ROLLBACK',async()=>{
  const original=new Error('OFFLINE_BEGIN');let releases=0,queries=0;
  const pool={async connect(){return {async query(){queries++;throw original;},release(){releases++;}};}};
  await assert.rejects(preflight(pool,{pool},input),e=>e===original);assert.equal(releases,1);assert.equal(queries,1);
});
test('F01 successful reads plus failed final ROLLBACK discards lease',async()=>{
  const rollback=new Error('OFFLINE_FINAL_ROLLBACK'),releases=[];
  const c={async query(sql){
    if(sql==='ROLLBACK')throw rollback;
    if(sql.startsWith('SELECT current_database'))return {rows:[input.target]};
    if(sql.includes('AS products,'))return {rows:[{products:0,receipts:0,compatible:0}]};
    return {rows:[]};
  },release(error){releases.push(error);}};
  const pool={async connect(){return c;}},issued={pool,runtime26:{async assertReady(){}}};
  await assert.rejects(preflight(pool,issued,input),e=>e===rollback);assert.deepEqual(releases,[rollback]);
});

test('F02 both persisted disabled states and original IDs/coordinates required',()=>{
  const sku={id:'SKU',skuCode:'CODE',colorId:'C',fitId:'F',sizeId:'Z',enabled:true};
  const main={id:'MAIN',barcode:'RAW',kind:'MAIN',schemeId:'SCHEME',colorId:'C',fitId:'F',sizeId:'Z',enabled:true};
  const good={skus:[{...sku,enabled:false}],barcodes:[{...main,enabled:false}]};
  helpers.assertDisabled(good,sku,main);
  for(const list of ['skus','barcodes'])for(const field of ['enabled','id','colorId','fitId','sizeId']){
    const bad=structuredClone(good);bad[list][0][field]=field==='enabled'?true:'CHANGED';
    assert.throws(()=>helpers.assertDisabled(bad,sku,main));
  }
  // The identical assertion runs immediately after disable, after append, and at final detail.
  assert.equal((source.match(/assertDisabled\((retained|d),selected,main\)/g)??[]).length,3);
});
test('F03 both original roots must exist; same-count inventory changes fail',()=>{
  const before={protected_roots:input.protectedProductIds.map(id=>({id})),protected_skus:[],protected_barcodes:[],
    protected_ledger:[{id:'L',sku_id:'S',quantity_delta:'1'}],protected_balances:[{warehouse_id:'W',sku_id:'S',quantity:'7',version:1}],ledger:1,balances:1};
  helpers.assertProtectedUnchanged(before,structuredClone(before),input);
  for(const roots of [null,[],[before.protected_roots[0]],[before.protected_roots[0],{id:'WRONG'}]])assert.throws(()=>helpers.assertProtectedSnapshot({...before,protected_roots:roots},input));
  for(const [key,field]of [['protected_ledger','quantity_delta'],['protected_balances','quantity']]){
    const after=structuredClone(before);after[key][0][field]='999';assert.equal(after[key].length,before[key].length);
    assert.throws(()=>helpers.assertProtectedUnchanged(before,after,input));
  }
});
test('F03 adjacent bigint quantities above 2^53 remain distinct for both inventory projections',()=>{
  const low='9007199254740992',high='9007199254740993';
  assert.equal(JSON.parse(low),JSON.parse(high),'Demonstrate original JSON number precision loss');
  assert.ok(source.includes("to_jsonb(t)||jsonb_build_object('quantity_delta',t.quantity_delta::text)"));
  assert.ok(source.includes("to_jsonb(t)||jsonb_build_object('quantity',t.quantity::text)"));
  const before={protected_roots:input.protectedProductIds.map(id=>({id})),protected_skus:[],protected_barcodes:[],
    protected_ledger:[{id:'L',sku_id:'S',quantity_delta:low}],protected_balances:[{warehouse_id:'W',sku_id:'S',quantity:low,version:1}],ledger:1,balances:1};
  for(const [key,field]of [['protected_ledger','quantity_delta'],['protected_balances','quantity']]){
    const after=JSON.parse(JSON.stringify(before));after[key][0][field]=high;
    assert.equal(after[key].length,before[key].length);assert.notEqual(after[key][0][field],before[key][0][field]);
    assert.throws(()=>helpers.assertProtectedUnchanged(before,after,input));
  }
});
test('F04 all four operations require exact actor/target/action/version and linked audit/receipt',()=>{
  const keys=Object.values(input.keys);
  for(let i=0;i<4;i++){
    const command={action:i===0?'CREATE':'EDIT',id:'PRODUCT',requestKey:keys[i],expectedVersion:i};
    const result={operationId:'OP'+i,kind:'PRODUCT',targetId:'PRODUCT',version:i+1};
    const receipt={id:result.operationId,actor_account_id:input.actor.accountId,request_key:command.requestKey,target_type:'PRODUCT',target_id:'PRODUCT',action:command.action,status:'COMMITTED',result_data:result};
    const audit={operation_id:result.operationId,actor_account_id:input.actor.accountId,object_type:'PRODUCT',object_id:'PRODUCT',action:command.action,old_version:i===0?null:i,new_version:i+1};
    helpers.assertOperationRows([receipt],[audit],input,command,result);
    for(const field of ['id','actor_account_id','request_key','target_type','target_id','action','status','result_data']){
      const bad={...receipt,[field]:'WRONG'};assert.throws(()=>helpers.assertOperationRows([bad],[audit],input,command,result));
    }
    for(const field of ['operation_id','actor_account_id','object_type','object_id','action','old_version','new_version']){
      const bad={...audit,[field]:'WRONG'};assert.throws(()=>helpers.assertOperationRows([receipt],[bad],input,command,result));
    }
    assert.throws(()=>helpers.assertOperationRows([],[],input,command,result));
    assert.throws(()=>helpers.assertOperationRows([receipt],[audit],input,command,{...result,version:99}));
  }
});
