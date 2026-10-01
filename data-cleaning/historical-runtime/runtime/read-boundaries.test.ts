import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {ledger} from './ledger.ts';
import {products} from './products.ts';
import {historicalAttributes} from '../adapter.mjs';
const q=(s:string)=>transaction(RUNTIME,tx=>tx.query(s)),results:any[]=[];
const test=async(name:string,fn:any)=>{await fn();results.push({name,pass:true});console.log('PASS',name);};
const origin='http://127.0.0.1:8877',base='http://127.0.0.1:8878';
let cookie='';
const api=async(path:string,body?:any)=>{const r=await fetch(base+path,{headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(data.ok,true,JSON.stringify(data));return data.data;};
await test('operator缺失拒绝；固定服务端身份，不接受客户端role',async()=>{
 const r=await fetch(base+'/runtime/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({role:'ADMIN'})});assert.equal(r.status,401);
 const s=await fetch(base+'/runtime/session',{method:'POST',headers:{Origin:origin}});cookie=s.headers.get('set-cookie')!.split(';')[0];assert.equal((await s.json()).data.operator.id,'local-admin');
});
await test('全部SKU库存与基线+增量一致；隐藏全零行不隐藏正负相抵行',async()=>{
 const codes=(await q(`SELECT code FROM ${SOURCE}.product ORDER BY code`)).rows.map(x=>x.code),warehouses=(await q(`SELECT id FROM ${SOURCE}.warehouse`)).rows.map(x=>x.id);
 const r=await api('/runtime/inventory?page=1&size=200',{products:codes,warehouses});assert.equal(Number(r.total),80794);assert.equal(r.rows.length,200);assert(r.rows.every((x:any)=>Object.values(x.values).some(n=>Number(n)!==0)));
 const expected=(await q(`WITH cells AS (SELECT coalesce(b.warehouse_id,i.warehouse_id) warehouse_id,v.product_id,c.spec_value_id color_id,coalesce(b.quantity,0)+coalesce(i.quantity,0) quantity FROM ${SOURCE}.tplus_inventory_balance_source b FULL JOIN inventory_delta i ON i.sku_id=b.variant_id AND i.warehouse_id=b.warehouse_id JOIN ${SOURCE}.variant v ON v.id=coalesce(b.variant_id,i.sku_id) JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension d ON d.id=c.dimension_id AND d.code='COLOR'),groups AS(SELECT warehouse_id,product_id,color_id,sum(quantity) total FROM cells GROUP BY 1,2,3 HAVING bool_or(quantity<>0)) SELECT count(*) n,count(*) FILTER(WHERE total=0) offsetting FROM groups`)).rows[0];assert.equal(r.rowCount,expected.n);assert(Number(expected.offsetting)>0);
 const p=await api('/runtime/inventory?page=1&size=200',{products:['001CS5131122-湖蓝'],warehouses});assert.equal(p.rowCount,4);assert.equal(p.total,10);assert(p.rows.some((x:any)=>Number(x.total)===-2));
 results.push({name:'inventory controls',rowCount:r.rowCount,productCount:r.productCount,total:r.total,offsettingGroups:expected.offsetting});
});
await test('商品服务器分页、年份季节过滤、供应商原值关联',async()=>{
 const a=await products({page:1,size:50}),b=await products({page:2,size:50});assert.equal(a.total,2941);assert.equal(a.codes.length,50);assert(!a.codes.some((x:string)=>b.codes.includes(x)));
 const raw=(await q(`SELECT p.code,p.counterparty_id,s.source_payload FROM ${SOURCE}.product p JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id`)).rows;
 const derived=raw.map(x=>({...x,...historicalAttributes(x.source_payload)}));assert.equal(derived.filter(x=>x.year).length,2900);assert.equal(derived.filter(x=>x.season).length,2893);
 const winter=await products({filters:{years:['2018'],seasons:['冬']},size:200});const expected=derived.filter(x=>x.year==='2018'&&x.season?.includes('冬'));assert.equal(winter.total,expected.length);assert.deepEqual([...winter.codes].sort(),expected.map(x=>x.code).sort());
 assert.equal(raw.filter(x=>x.counterparty_id).length,1132);assert.equal(raw.filter(x=>!x.counterparty_id&&!x.source_payload.source['默认供应商编码']&&!x.source_payload.source['默认供应商']).length,1809);
 results.push({name:'product attributes',year:2900,season:2893,supplier:1132,sourceSupplierMissing:1809,winter2018:winter.total});
});
await test('库存流水从真实贡献重建，无Seed；负库存及后续增量守恒',async()=>{
 const samples=(await q(`SELECT b.variant_id,b.warehouse_id,b.quantity FROM ${SOURCE}.tplus_inventory_balance_source b WHERE b.quantity<0 ORDER BY b.quantity LIMIT 4`)).rows;
 for(const b of samples){const r=await ledger({sku:b.variant_id,warehouse:b.warehouse_id,filters:{},page:1});assert.equal(Number(r.quantity),Number(b.quantity));assert(r.items.every((x:any)=>!x.id.startsWith('seed-')&&!x.source.startsWith('DEMO-')));assert(r.total>0);}
});
await test('编辑资格冲突、工作事件去重与记录持久化',async()=>{
 const docId='TEST-WORK-'+randomUUID(),token=randomUUID(),second=randomUUID();const a=await api('/runtime/work',{type:'acquire',docId,newToken:token});assert(a.ok);
 const b=await api('/runtime/work',{type:'acquire',docId,newToken:second});assert.equal(b.ok,false);assert.equal(b.code,'OCCUPIED');
 const eventId=randomUUID(),event={type:'work',docId,eventId,action:'scan',input:'unknown-test-code'};assert.equal((await api('/runtime/work',event)).duplicate,false);assert.equal((await api('/runtime/work',event)).duplicate,true);
 const record={id:eventId,error:'未识别条码',code:'unknown-test-code'};await api('/runtime/work',{type:'work',docId,record});assert.equal((await api('/runtime/work',{type:'logs',docId})).items[0].error,record.error);await api('/runtime/work',{type:'release',docId,token});assert((await api('/runtime/work',{type:'acquire',docId,newToken:second})).ok);await api('/runtime/work',{type:'release',docId,token:second});
});
await writeFile(new URL('../read-boundaries-results.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),results},null,2));
