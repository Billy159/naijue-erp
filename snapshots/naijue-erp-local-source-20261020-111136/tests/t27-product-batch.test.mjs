import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../server/domain/products/catalog.ts';

test('T27 batch product export scopes each catalogue read to the requested product IDs once',async()=>{
  const ids=Array.from({length:10},(_,index)=>`00000000-0000-4000-8000-${String(index+201).padStart(12,'0')}`),calls=[];
  const products=ids.map((id,index)=>({id,code:`000${index}`,name:`合成商品${index}`,enabled:true,unit:'件',fit_name:'常规版',attributes:{},created_at:'2026-10-04'}));
  const session={query:async(sql,params=[])=>{
    const statement=String(sql).replace(/\s+/g,' ').trim();calls.push({statement,params});
    if(statement.startsWith('SELECT p.id,p.code'))return {rows:products};
    if(statement.startsWith('SELECT product_id,body,version FROM runtime.product_profile_overlay'))return {rows:[]};
    if(statement.startsWith('SELECT v.id,v.product_id,v.enabled,v.version'))return {rows:[]};
    if(statement.startsWith('SELECT coalesce')&&statement.includes('variant_overlay')&&statement.includes('system_setting'))return {rows:[{overlays:[],pack:null}]};
    if(statement.startsWith('SELECT id,fit_id,group_name FROM runtime.variant_overlay'))return {rows:[]};
    if(statement.startsWith('SELECT value FROM source.system_setting'))return {rows:[]};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,sku_binding_known'))return {rows:[]};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,true generated'))return {rows:[]};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,historical_note'))return {rows:[]};
    if(statement.startsWith('SELECT revision,source_sha256 FROM runtime.barcode_authority_policy'))return {rows:[]};
    if(statement.startsWith('SELECT id,product_id,role,name,color_name,sort_order'))return {rows:[]};
    throw new Error(`Unexpected T27 batch catalogue query: ${statement}`);
  }};
  const result=await catalog({session,repo:{source:'source',runtime:'runtime'}},ids);
  assert.equal(result.products.length,10);assert.equal(result.products[0].id,ids[0]);
  assert.equal(calls.filter(call=>call.statement.startsWith('SELECT p.id,p.code')).length,1);
  for(const call of calls){
    if(call.statement.includes('system_setting')||call.statement.includes('barcode_authority_policy'))continue;
    assert.match(call.statement,/ANY\(\$1::uuid\[\]\)/,call.statement);
    assert.deepEqual(call.params[0],ids);
  }
});
