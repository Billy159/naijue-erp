import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandardCatalogue27TransactionProof } from '../adapters/postgres/src/standard-catalogue-completeness27.ts';
import { entityId } from '../packages/domain/src/values.ts';
const product = entityId('product','00000000-0000-4000-8000-000000000001');
const sku = entityId('sku','00000000-0000-4000-8000-000000000002');
function make(bad=false) {
 let active=true; const seen:string[]=[];
 const client={async query(sql:string) { seen.push(sql); if(/import_record|import_source_row|audit_change|operation_receipt/.test(sql)) throw Error('OFFLINE_SOURCE_NOT_AVAILABLE');
  if(sql.includes('business-catalogue27:append-baseline'))return {rows:[{id:product,version:1}],rowCount:1};
  if(sql.includes('business-catalogue27:products'))return {rows:[{product_id:product}],rowCount:1};
  if(sql.includes('business-catalogue27:skus'))return {rows:bad?[]:[{sku_id:sku,product_id:product}],rowCount:bad?0:1};
  throw Error('UNEXPECTED_SQL'); },release(){}};
 const pair=createStandardCatalogue27TransactionProof(client,{profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(c,p){assert.equal(c,client);assert.equal(p,'CATALOGUE_READ');}},()=>{assert.ok(active)});
 return {pair,seen,close(){active=false}};
}
test('ordinary published business SKU works when offline source tables are unavailable',async()=>{const f=make();await f.pair.assertExistingSkus([sku]);assert.ok(f.seen.every(s=>!/import_record|import_source_row|audit_change|operation_receipt/.test(s)))});
test('ordinary business catalogue rejects missing SKU/product relationship',async()=>{const f=make(true);await assert.rejects(f.pair.assertExistingSkus([sku]),{code:'NATIVE_CATALOGUE_FACTS_UNAVAILABLE'})});
test('ordinary business baseline prepares a bounded same-transaction document append without import evidence',async()=>{
 const f=make(); await f.pair.captureDocumentAppendBaseline([product]);
 await assert.rejects(f.pair.assertPendingCapacity({kind:'PRODUCT',action:'EDIT',targetId:product,oldVersion:2,newVersion:3,operationId:'00000000-0000-4000-8000-000000000005',beforeValues:{version:2,skus:[]},afterValues:{version:3,skus:[]}} as never));
});
