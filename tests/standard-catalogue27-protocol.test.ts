import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandardCatalogue27TransactionProof } from '../adapters/postgres/src/standard-catalogue-completeness27.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { entityId } from '../packages/domain/src/values.ts';
const productId=entityId('product','00000000-0000-4000-8000-000000000001');
const prices=Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,null]));
function setup(overrides: Record<string,unknown>={}) {
  let active=true;const calls:string[]=[];const purposes:string[]=[];
  const client={async query(sql:string) {calls.push(sql);return {rows:[{product_id:productId,proof_valid:true,source_prices:prices,...prices,...overrides}],rowCount:1};},release(){}};
  const pair=createStandardCatalogue27TransactionProof(client,{profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(original,purpose){assert.equal(original,client);purposes.push(purpose);}},()=>{assert.ok(active);});
  return {pair,calls,purposes,close(){active=false;}};
}
test('27 catalogue locks retained business product without offline import evidence',async()=>{
 const s=setup();await s.pair.verifier.assertComplete({query:s.pair.query,productIds:[productId]});
 assert.deepEqual(s.purposes,['CATALOGUE_READ']);const sql=s.calls.join('\n');
 for(const required of ['FOR SHARE OF p','p.deleted_at IS NULL','naijue_erp.product'])assert.ok(sql.includes(required),required);
 assert.doesNotMatch(sql,/import_record|import_source_row|audit_change|operation_receipt/);
 assert.doesNotMatch(sql,/import_source_row|import_history_closure_manifest|standard_import_record_proof\s*\(/);
});
test('27 catalogue rejects missing identity and foreign products',async()=>{
 for(const overrides of [{product_id:null},{product_id:'00000000-0000-4000-8000-000000000002'}]) {
  const s=setup(overrides);await assert.rejects(s.pair.verifier.assertComplete({query:s.pair.query,productIds:[productId]}));
 }
});
test('27 catalogue accepts retained current product regardless of unrelated source price fields',async()=>{
 const s=setup({retail_price:'0.00',source_prices:{...prices,retail_price:'0.00'}});
 await s.pair.verifier.assertComplete({query:s.pair.query,productIds:[productId]});
});
test('27 catalogue rejects copied query and use after transaction close',async()=>{
 const s=setup();await assert.rejects(s.pair.verifier.assertComplete({query:(sql,args)=>s.pair.query(sql,args),productIds:[productId]}));
 assert.equal(s.calls.length,0);s.close();await assert.rejects(s.pair.verifier.assertComplete({query:s.pair.query,productIds:[productId]}));
});
test('27 existing SKU checks actual product and rejects missing, malformed, duplicate and foreign identities',async()=>{
 const skuId=entityId('sku','00000000-0000-4000-8000-000000000003');
 for(const variant of ['valid','mutated','missing','duplicate','foreign'] as const){
  const calls:string[]=[];
  const client={async query(sql:string){calls.push(sql);const row={sku_id:skuId,product_id:variant==='mutated'?null:productId};
   return {rows:sql.includes('business-catalogue27:skus')?(variant==='missing'?[]:variant==='duplicate'?[row,row]:[{...row,...(variant==='foreign'?{sku_id:productId}:{})}]):[{product_id:productId,proof_valid:true,source_prices:prices,...prices}],rowCount:1};},release(){}};
  const pair=createStandardCatalogue27TransactionProof(client,{profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(original){assert.equal(original,client);}},()=>{});
  if(variant==='valid'){await pair.assertExistingSkus([skuId]);assert.equal(calls.length,2);assert.ok(calls[0]!.includes('naijue_erp.sku'));assert.ok(calls[0]!.includes('JOIN naijue_erp.product'));}
  else {await assert.rejects(pair.assertExistingSkus([skuId]));assert.equal(calls.length,1);}
 }
});
test('27 product completeness rejects absent or duplicate proof rows',async()=>{
 for(const count of [0,2]){
  const row={product_id:productId,proof_valid:true,source_prices:prices,...prices};
  const client={async query(){return {rows:Array.from({length:count},()=>row),rowCount:count};},release(){}};
  const pair=createStandardCatalogue27TransactionProof(client,{profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(){}},()=>{});
  await assert.rejects(pair.verifier.assertComplete({query:pair.query,productIds:[productId]}));
 }
});
test('27 proof does not return an in-flight result after original transaction closes',async()=>{
 let active=true;let respond:undefined|((result:{rows:Record<string,unknown>[];rowCount:number})=>void);
 const client={query:()=>new Promise<{rows:Record<string,unknown>[];rowCount:number}>(resolve=>{respond=resolve;}),release(){}};
 const pair=createStandardCatalogue27TransactionProof(client,{profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(){}},()=>assert.ok(active));
 const pending=pair.query('SELECT 1');active=false;respond!({rows:[],rowCount:0});await assert.rejects(pending);
});
