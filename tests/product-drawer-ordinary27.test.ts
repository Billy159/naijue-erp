/** Synthetic protocol, no PostgreSQL or real data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresProductQueryReader } from '../adapters/postgres/src/product-query-reader.ts';
import { PostgresProductDetailsQueryReader } from '../adapters/postgres/src/product-details-query-reader.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';
const productId=sid('product',9801), parameters={productId}, signal=new AbortController().signal;
function fixture(){const calls:string[]=[];let proofs=0;const pool={async connect(){return {async query(sql:string){calls.push(sql);let rows:Record<string,unknown>[]=[];
 if(sql.startsWith('SELECT p.id, p.product_code'))rows=[{id:productId,product_code:'SYN',name:'Synthetic',year:null,system_item_code:null,retail_price:null,category_name:'C',season_name:'春、夏',supplier_name:null,thickness:null,collar_pants_type:null}];
 else if(sql.startsWith('SELECT p.id, p.version')&&sql.includes('retail_price'))rows=[{id:productId,version:2,...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,null]))}];
 else if(sql.startsWith('SELECT p.id, p.version'))rows=[{id:productId,version:2,default_barcode_scheme_id:null}];
 else if(sql.startsWith('SELECT count'))rows=[{total:'0'}];
 return {rows,rowCount:rows.length};},release(){}};}};
 const runtime={profile:'EXACT27' as const,contract:'UNIFIED_ORDINARY_RUNTIME27_V1' as const,async assertReady(client:object,purpose:'ORDINARY_DOCUMENT_READ'){assert.equal(typeof (client as {query:unknown}).query,'function');assert.equal(purpose,'ORDINARY_DOCUMENT_READ');assert.equal(calls.at(-1),'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');proofs++;}};
 return {pool,runtime,calls,proofs:()=>proofs};}
test('ordinary27 drawer reads actual multi-season basics with retained deletes and same lease proof',async()=>{const f=fixture(),r=new PostgresProductQueryReader(f.pool,null,null,f.runtime);const value=await r.readBasics({actor,grant:{productId},parameters,signal});assert.equal(value?.seasonLabel,'春、夏');assert.equal(value?.thickness,null);assert.equal(f.proofs(),1);assert.match(f.calls[1]!,/p\.season_ids/);assert.match(f.calls[1]!,/p\.deleted_at IS NULL/);assert.ok(f.calls.every(x=>!/(?:import_record|import_source|import_batch)/i.test(x)));});
test('ordinary27 price and barcode reads retain exact native values and default scheme',async()=>{const f=fixture(),r=new PostgresProductDetailsQueryReader(f.pool,null,undefined,f.runtime);const price=await r.readPrices({actor,parameters,intent:{kind:'prices',parameters},grant:{kind:'prices',productId},signal});assert.equal(price?.prices.retail_price,null);const bp={productId,page:1,pageSize:20 as const};const barcodes=await r.readBarcodes({actor,parameters:bp,intent:{kind:'barcodes',parameters:bp},grant:{kind:'barcodes',productId},signal});assert.deepEqual(barcodes?.defaultScheme,{state:'NOT_SET'});assert.equal(barcodes?.total,0);assert.equal(f.proofs(),2);assert.ok(f.calls.filter(x=>x.startsWith('SELECT p.id, p.version')).every(x=>x.includes('p.deleted_at IS NULL')));assert.ok(f.calls.some(x=>x.includes('p.default_barcode_scheme_id')));assert.ok(f.calls.every(x=>!/(?:import_record|import_source|import_batch)/i.test(x)));});
test('ordinary27 drawer rejects failed and substituted runtime proof before native queries',async()=>{
 for(const kind of ['basic','prices'] as const) for(const result of ['throw','boolean'] as const){
  const f=fixture();const runtime={profile:'EXACT27' as const,contract:'UNIFIED_ORDINARY_RUNTIME27_V1' as const,async assertReady(){if(result==='throw')throw Error('RLS failure');return true as never;}};
  const call=kind==='basic' ? ()=>new PostgresProductQueryReader(f.pool,null,null,runtime).readBasics({actor,grant:{productId},parameters,signal}) : ()=>new PostgresProductDetailsQueryReader(f.pool,null,undefined,runtime).readPrices({actor,parameters,intent:{kind:'prices',parameters},grant:{kind:'prices',productId},signal});
  await assert.rejects(call);assert.deepEqual(f.calls,['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK']);
 }
});
