/** Synthetic protocol tests only; no PostgreSQL or production data. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresProductManagementQueryReader } from '../adapters/postgres/src/product-management-query-reader.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';

const id = sid('product', 9700), fit = sid('fit', 9701);
const parameters = { filter:{productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]},page:2,pageSize:100 as const };
function fixture(coverage: Record<string,unknown> = {invalid_size:false,missing_sizes:false,invalid_balance:false}, quantity: string|null = '-12') {
 const calls:{sql:string;values:unknown[]}[]=[];let proofs=0;
 const pool={async connect(){return {async query(sql:string,values:unknown[]=[]){calls.push({sql,values});const key=sql.match(/product-management:([^ ]+) \*\//)?.[1];const rows:Record<string,unknown>[] = key==='count'?[{exact_total:'101',invalid_category_tree:false}]:key==='ordinary-stock-coverage'?[coverage]:key==='page'?[{id,product_code:'SYNTH',name:'Synthetic',category_name:'Category',year:null,season_name:null,supplier_name:null,thickness:null,retail_price:null}]:key==='fits'?[{product_id:id,id:fit,name:'Fit',code:'F'}]:key==='stock'?[{id,quantity}]:key==='candidate-count'?[{exact_total:'1'}]:key==='candidate-page'?[{id,label:'SYNTH Synthetic',code:'SYNTH',name:'Synthetic'}]:[];return {rows,rowCount:rows.length};},release(){}};}};
 const runtime={profile:'EXACT27' as const,contract:'UNIFIED_ORDINARY_RUNTIME27_V1' as const,async assertReady(client:object,purpose:'ORDINARY_DOCUMENT_READ'){assert.equal(purpose,'ORDINARY_DOCUMENT_READ');assert.equal(typeof (client as {query:unknown}).query,'function');assert.equal(calls.at(-1)?.sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');proofs++;}};
 const reader=new PostgresProductManagementQueryReader(pool,null,null,undefined,runtime);
 return {reader,calls,proofs:()=>proofs};
}
const read=(totalStock:'unavailable'|'all-warehouses')=>({actor,parameters,grant:{kind:'all' as const,totalStock},signal:new AbortController().signal});
test('ordinary27 list uses verified read lease, native catalogue and complete exact stock without source tables',async()=>{
 const f=fixture(), result=await f.reader.readList(read('all-warehouses'));
 assert.equal(f.proofs(),1);assert.equal(result.exactTotal,101);assert.equal(result.page,2);assert.equal(result.items[0]?.totalStock,'-12');
 assert.ok(f.calls.every(x=>!/(?:import_record|import_source|import_batch)/i.test(x.sql)));
 const count=f.calls.find(x=>x.sql.includes('product-management:count'))!,coverage=f.calls.find(x=>x.sql.includes('ordinary-stock-coverage'))!,page=f.calls.find(x=>x.sql.includes('product-management:page'))!;
 assert.match(count.sql,/p\.deleted_at IS NULL/);assert.match(count.sql,/p\.season_ids/);assert.match(coverage.sql,/naijue_erp\.inventory_balance/);assert.match(f.calls.find(x=>x.sql.includes('product-management:stock */'))!.sql,/count\(\*\)/);assert.deepEqual(page.values.slice(-2),[100,100]);
});
test('ordinary27 missing stock stays unknown, while catalog-only and candidates do not touch stock',async()=>{
 const incomplete=fixture(undefined,null);
 const unknown=await incomplete.reader.readList(read('all-warehouses'));assert.equal(unknown.items[0]?.totalStock,null);assert.equal(incomplete.calls.at(-1)?.sql,'COMMIT');
 const f=fixture();const result=await f.reader.readList(read('unavailable'));assert.equal(result.items[0]?.totalStock,null);assert.ok(!f.calls.some(x=>x.sql.includes('stock')));
 await f.reader.readCandidates({actor,grant:{kind:'all',totalStock:'unavailable'},parameters:{kind:'product',search:'',selectedIds:[],page:1,pageSize:20},signal:new AbortController().signal});assert.equal(f.proofs(),2);assert.ok(f.calls.every(x=>!/(?:import_record|import_source|import_batch)/i.test(x.sql)));
});
test('ordinary27 rejects bad proof and invalid stock evidence before returning rows',async()=>{
 const f=fixture({invalid_size:true,missing_sizes:false,invalid_balance:false});await assert.rejects(f.reader.readList(read('all-warehouses')),{code:'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'});
 assert.throws(()=>new PostgresProductManagementQueryReader({connect:async()=>{throw Error('not called');}},null,null,undefined,{profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',assertReady:42} as never),TypeError);
});
test('ordinary27 exact zero is distinct from unknown and proof failures stop all business queries',async()=>{
 const zero=fixture(undefined,'0');assert.equal((await zero.reader.readList(read('all-warehouses'))).items[0]?.totalStock,'0');
 for (const failure of ['reject','boolean']) {
  const calls:string[]=[];
  const pool={async connect(){return {async query(sql:string){calls.push(sql);return {rows:[],rowCount:0};},release(){}};}};
  const runtime={profile:'EXACT27' as const,contract:'UNIFIED_ORDINARY_RUNTIME27_V1' as const,async assertReady(){if(failure==='reject')throw Error('RLS denied');return true as never;}};
  await assert.rejects(new PostgresProductManagementQueryReader(pool,null,null,undefined,runtime).readList(read('unavailable')));
  assert.deepEqual(calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);
 }
});
