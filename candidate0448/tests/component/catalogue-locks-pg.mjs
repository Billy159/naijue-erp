/** Explicit isolated component PG test, not migration/runtime/business acceptance.
 * Sales queries are captured from the production loader. Maintenance is its
 * two-table lock projection (not full visibility/admission/persistence code). */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {PostgresNativeSalesFacts} from '../../adapters/postgres/src/sales-native-facts.ts';
import {syntheticDraft,ids,sid} from '../support/synthetic-fixtures.ts';
const target={host:'/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket',port:55439,database:'erp_synthetic',user:'erp_test_owner',password:'',ssl:false,connectionTimeoutMillis:2000};
const schema='b1_component_20261029',p1=sid('product',12),p2=sid('product',13),s1=ids.sku,s2=ids.sku2,s3=sid('sku',9001);
const group=sid('sizeGroup',30),color=sid('color',40),fit=sid('fit',41),size=sid('size',42);
const priceFields=['purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'];
const products=[p1,p2].map(id=>({id,product_code:'SYNTHETIC',name:'SYNTHETIC',size_group_id:group,enabled:true,...Object.fromEntries(priceFields.map(k=>[k,null]))}));
const skus=[{id:s1,product_id:p1},{id:s2,product_id:p2},{id:s3,product_id:p2}].map(row=>({...row,color_id:color,fit_id:fit,size_id:size,enabled:true}));
const capture=[];const stop=new Error('CAPTURE_ONLY');const draft=syntheticDraft();
const input={...draft,settlements:[],header:{...draft.header,salespersonId:null},lines:[s3,s2,s1].map((skuId,i)=>({...draft.lines[0],id:sid('salesLine',7000+i),skuId,lineNo:i+1}))};
const reader=new PostgresNativeSalesFacts(async(sql,values=[])=>{
 const table=/native-sales-facts:([a-z-]+)/.exec(sql)?.[1];let rows;
 if(['sku-products','product','sku'].includes(table)){capture.push({table,sql,values});rows=(table==='product'?products:skus).filter(r=>values[0].includes(r.id));}
 else if(table==='schema')rows=[{installed:true}];else if(table==='hall')rows=[{id:ids.hall,enabled:true}];else if(table==='warehouse')rows=[{id:ids.warehouse,hall_id:ids.hall,enabled:true}];else if(table==='customer')rows=[{id:ids.customer,enabled:true}];else throw stop;
 return {rows,rowCount:rows.length};
},()=>{},()=>[],{async assertComplete(){throw stop;}});
await assert.rejects(reader.load(input),e=>e===stop);
assert.deepEqual(capture.map(r=>r.table),['sku-products','product','sku']);
assert.deepEqual(capture[1].values[0],[p1,p2]);assert.deepEqual(capture[2].values[0],[s1,s2,s3].sort());
const maintenance=await readFile(new URL('../../adapters/postgres/src/product-maintenance-store.ts',import.meta.url),'utf8');
assert.ok(maintenance.indexOf('FROM naijue_erp.product WHERE id=$1::uuid FOR UPDATE')>=0);
assert.match(maintenance,/ORDER BY id LIMIT \$2 FOR UPDATE/);
const a=new pg.Client(target),b=new pg.Client(target);await a.connect();await b.connect();
const rewrite=sql=>sql.replaceAll('naijue_erp.',schema+'.');
const salesProduct=capture.find(r=>r.table==='product'),salesSku=capture.find(r=>r.table==='sku');
const lockProduct=(c,id)=>c.query(`SELECT id FROM ${schema}.product WHERE id=$1::uuid FOR UPDATE`,[id]);
const lockSku=(c,id)=>c.query(`SELECT id FROM ${schema}.sku WHERE product_id=$1::uuid ORDER BY id FOR UPDATE`,[id]);
const execute=(c,row)=>c.query(rewrite(row.sql),row.values);
let created=false;
try{
 assert.equal((await a.query('SELECT current_database() AS d')).rows[0].d,'erp_synthetic');
 assert.equal((await a.query('SHOW listen_addresses')).rows[0].listen_addresses,'');
 await a.query(`CREATE SCHEMA ${schema}`);created=true;
 await a.query(`CREATE TABLE ${schema}.product(id uuid PRIMARY KEY,product_code text,name text,size_group_id uuid,enabled boolean,${priceFields.map(k=>k+' numeric').join(',')}); CREATE TABLE ${schema}.sku(id uuid PRIMARY KEY,product_id uuid REFERENCES ${schema}.product(id),color_id uuid,fit_id uuid,size_id uuid,enabled boolean)`);
 for(const row of products)await a.query(`INSERT INTO ${schema}.product(id,product_code,name,size_group_id,enabled) VALUES($1,'SYNTHETIC','SYNTHETIC',$2,true)`,[row.id,group]);
 for(const row of skus)await a.query(`INSERT INTO ${schema}.sku VALUES($1,$2,$3,$4,$5,true)`,[row.id,row.product_id,color,fit,size]);
 for(const c of [a,b])await c.query("SET statement_timeout='8s'; SET lock_timeout='6s'");
 const apid=(await a.query('SELECT pg_backend_pid() AS p')).rows[0].p,bpid=(await b.query('SELECT pg_backend_pid() AS p')).rows[0].p;
 const blocked=async(observer,waiting,blocker)=>{const deadline=Date.now()+2000;while(Date.now()<deadline){if((await observer.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[blocker,waiting])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected lock barrier not reached');};
 // Audited old order: same production target SQL, SKU before product.
 await a.query('BEGIN');await b.query('BEGIN');await execute(a,salesSku);await lockProduct(b,p2);
 const codes=[];
 const oldA=execute(a,salesProduct).catch(async e=>{codes.push(e.code);await a.query('ROLLBACK');});
 await blocked(b,apid,bpid);
 const oldB=lockSku(b,p2).catch(async e=>{codes.push(e.code);await b.query('ROLLBACK');});
 await Promise.all([oldA,oldB]);await a.query('ROLLBACK');await b.query('ROLLBACK');
 assert.deepEqual(codes,['40P01']);console.log('RED reproduced: old SKU→product deadlock SQLSTATE 40P01');
 for(const first of ['sales','maintenance'])for(const maintained of [p1,p2]){
  await a.query('BEGIN');await b.query('BEGIN');await execute(a,capture[0]);
  if(first==='sales'){
   await execute(a,salesProduct);const waiting=lockProduct(b,maintained);await blocked(a,bpid,apid);
   await execute(a,salesSku);await a.query('COMMIT');await waiting;await lockSku(b,maintained);await b.query('COMMIT');
  }else{
   await lockProduct(b,maintained);const waiting=execute(a,salesProduct);await blocked(b,apid,bpid);
   await lockSku(b,maintained);await b.query('COMMIT');await waiting;await execute(a,salesSku);await a.query('COMMIT');
  }
  console.log('GREEN:',first,'first; reversed-input multi-product and mixed existing/new-spec SKU lock set; no deadlock');
 }
 assert.equal((await a.query(`SELECT count(*)::int AS n FROM ${schema}.sku`)).rows[0].n,3);
 console.log('COMPONENT ONLY: no ERP writes, receipts, stock posting, issuer or migration acceptance');
}finally{
 await Promise.allSettled([a.query('ROLLBACK'),b.query('ROLLBACK')]);
 if(created)await a.query(`DROP SCHEMA ${schema} CASCADE`);
 await Promise.all([a.end(),b.end()]);
}
