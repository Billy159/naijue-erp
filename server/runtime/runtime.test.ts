import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { install,initialize,command,detail,scaled } from './runtime.ts';
import { transaction,SOURCE } from './db.ts';
const schema='v2_runtime_test_'+Date.now(),results:any[]=[];
async function check(name:string,fn:()=>Promise<void>){await fn();results.push({name,pass:true});console.log('PASS',name);}
const sql=(s:string,p:any[]=[])=>transaction(schema,tx=>tx.query(s,p));
await install(schema);
const sourceBefore=(await sql(`SELECT md5(string_agg(source_record_sha256,'' ORDER BY source_id)) hash FROM ${SOURCE}.tplus_history_line`)).rows;
const sourceBalances=(await sql(`SELECT md5(string_agg(variant_id||':'||warehouse_id||':'||quantity,',' ORDER BY variant_id,warehouse_id)) hash,sum(quantity)::text total FROM ${SOURCE}.tplus_inventory_balance_source`)).rows;
await check('A 全量初始化两次，不写库存/流水，历史人时未知',async()=>{
 const a=await initialize(schema),b=await initialize(schema);assert.equal(a.created,44021);assert.equal(b.created,0);
 const r=(await sql(`SELECT count(*) n,count(*) FILTER(WHERE status='APPROVED' AND baseline_was_included AND current_effect_active AND original_auditor IS NULL AND original_audited_at IS NULL) approved,(SELECT count(*) FROM posting) postings,(SELECT count(*) FROM movement) movements FROM document`)).rows[0];assert.equal(Number(r.n),44021);assert.equal(r.n,r.approved);assert.equal(Number(r.postings),0);assert.equal(Number(r.movements),0);
 assert.deepEqual((await sql(`SELECT md5(string_agg(variant_id||':'||warehouse_id||':'||quantity,',' ORDER BY variant_id,warehouse_id)) hash,sum(quantity)::text total FROM ${SOURCE}.tplus_inventory_balance_source`)).rows,sourceBalances);assert.equal(Number(sourceBalances[0].total),80794);
});
const representative=(await sql(`SELECT body FROM revision r JOIN document d ON d.id=r.document_id WHERE d.document_type='SALE' AND jsonb_array_length(body->'lines')>0 LIMIT 1`)).rows[0].body;
const base=representative.lines[0],warehouses=(await sql(`SELECT id FROM ${SOURCE}.warehouse ORDER BY id LIMIT 2`)).rows.map(x=>x.id);
const payment=(await sql(`SELECT primary_payment_method_id payment_method_id,id fund_account_id FROM ${SOURCE}.tplus_fund_account WHERE primary_payment_method_id IS NOT NULL LIMIT 1`)).rows[0];
async function fixture(type='SALE',quantities=[10]){const id=randomUUID();const body={header:{adjustment:0,...(type==='TRANSFER'?{business_date:'2026-09-10'}:{})},fundsRecords:[],lines:quantities.map((q,i)=>({...base,source_id:'fixture-'+i,gift:true,unit_price:'0',source_quantity:String(q),stock_quantity_contribution:String(type==='SALE'?-q:q),amount:'0',warehouse_id:warehouses[i%2],from_warehouse_id:warehouses[0],to_warehouse_id:warehouses[1]}))};await sql(`INSERT INTO document(id,document_type,number,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision) VALUES($1::uuid,$2,$1,'APPROVED',true,true,$3,1,1) RETURNING id`,[id,type,'baseline:fixture:'+id]);await sql(`INSERT INTO revision VALUES($1::uuid,1,true,$2::jsonb,NULL,now()) RETURNING document_id`,[id,JSON.stringify(body)]);return id;}
async function run(id:string,operation:any,body?:any,extra:any={}){const d=await detail(id,schema);return command({documentId:id,operation,expectedVersion:d.version,requestKey:randomUUID(),...(body?{body}:{}),...extra},{schema});}
async function effects(id:string){return (await sql(`SELECT warehouse_id,sku_id,sum(quantity)::text quantity FROM movement m JOIN posting p ON p.id=m.posting_id WHERE p.document_id=$1::uuid GROUP BY warehouse_id,sku_id ORDER BY warehouse_id,sku_id`,[id])).rows;}
let sample='';
await check('B/F 销售10→8净+2，第二轮撤8再审6净+4',async()=>{sample=await fixture();await run(sample,'unapprove');let d=await detail(sample,schema);d.body.lines[0].source_quantity='8';await run(sample,'save',d.body);await run(sample,'approve');assert.equal(Number((await effects(sample))[0].quantity),2);await run(sample,'unapprove');assert.equal(Number((await effects(sample))[0].quantity),10);d=await detail(sample,schema);d.body.lines[0].source_quantity='6';await run(sample,'save',d.body);await run(sample,'approve');assert.equal(Number((await effects(sample))[0].quantity),4);assert.equal((await detail(sample,schema)).baseline_was_included,true);});
await check('C 正负混合逐仓贡献正确',async()=>{const id=await fixture('SALE',[10,-3]);await run(id,'unapprove');const e=await effects(id);assert.deepEqual(e.map(x=>Number(x.quantity)),[10,-3]);await run(id,'approve');assert(everyZero(await effects(id)));});
function everyZero(rows:any[]){return rows.every(x=>scaled(x.quantity)===0n);}
await check('D 调拨两仓反向与再审核',async()=>{const id=await fixture('TRANSFER');await run(id,'unapprove');assert.deepEqual((await effects(id)).map(x=>Number(x.quantity)),[10,-10]);await run(id,'approve');assert(everyZero(await effects(id)));});
await check('E 进货正负原符号，2172真实运行身份',async()=>{assert.equal(Number((await sql(`SELECT count(*) n FROM document WHERE document_type='PURCHASE'`)).rows[0].n),2172);const id=await fixture('PURCHASE',[10,-3]);await run(id,'unapprove');assert.deepEqual((await effects(id)).map(x=>Number(x.quantity)),[-10,3]);await run(id,'approve');assert(everyZero(await effects(id)));});
await check('G/I 同key并发/响应丢失重试/冲突/过期版本',async()=>{const id=await fixture(),req={documentId:id,operation:'unapprove' as const,expectedVersion:1,requestKey:randomUUID()};await assert.rejects(command(req,{schema,responseLost:true}),/SIMULATED_RESPONSE_LOST/);const r=await command(req,{schema});assert.deepEqual(await command(req,{schema}),r);assert.equal((await effects(id))[0].quantity,'10.0000');await assert.rejects(command({...req,expectedVersion:2},{schema}),/different payload/);await assert.rejects(command({...req,requestKey:randomUUID()},{schema}),/VERSION_CONFLICT/);
 const d=await detail(id,schema),approve={documentId:id,operation:'approve' as const,expectedVersion:d.version,requestKey:randomUUID()};const pair=await Promise.all([command(approve,{schema}),command(approve,{schema})]);assert.deepEqual(pair[0],pair[1]);assert(everyZero(await effects(id)));
 const next={documentId:id,operation:'unapprove' as const,expectedVersion:(await detail(id,schema)).version,requestKey:randomUUID()};const concurrent=await Promise.allSettled([command(next,{schema}),command({...next,requestKey:randomUUID()},{schema})]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.equal(Number((await effects(id))[0].quantity),10);
});
async function snapshot(){return (await sql(`SELECT jsonb_build_object('documents',(SELECT md5(string_agg(row_to_json(d)::text,',' ORDER BY id)) FROM document d),'revisions',(SELECT count(*) FROM revision),'history',(SELECT count(*) FROM version_history),'postings',(SELECT count(*) FROM posting),'movements',(SELECT count(*) FROM movement),'inventory',(SELECT md5(string_agg(row_to_json(i)::text,',' ORDER BY warehouse_id,sku_id)) FROM inventory_delta i),'requests',(SELECT count(*) FROM idempotency_request)) snapshot`)).rows[0].snapshot;}
await check('H 四个失败点整事务rollback，调拨不半单',async()=>{const id=await fixture('TRANSFER');for(const failure of ['after-status','after-first-inventory','after-movement','before-idempotency']){const before=await snapshot();await assert.rejects(command({documentId:id,operation:'unapprove',expectedVersion:1,requestKey:randomUUID()},{schema,failure}),/INJECTED/);assert.deepEqual(await snapshot(),before);}});
await check('J 0/1/N 同方式正负零、保存与审核时机、失败保存重开',async()=>{const id=await fixture();await run(id,'unapprove');let d=await detail(id,schema);d.body.lines[0].gift=false;d.body.lines[0].unit_price='10';d.body.lines[0].amount='100';d.body.fundsRecords=[300,-200,0].map((amount,i)=>({...payment,amount:String(amount),direction:amount>0?'receipt':amount<0?'refund':'zero',reference:{fixture:i}}));await run(id,'save',d.body);await run(id,'approve');assert.deepEqual((await detail(id,schema)).body.fundsRecords,d.body.fundsRecords);await assert.rejects(run(id,'save',d.body),/UNAPPROVE_BEFORE_EDIT/);await run(id,'unapprove');d=await detail(id,schema);d.body.fundsRecords=[{...payment,amount:'99',direction:'receipt'}];await run(id,'save',d.body);await assert.rejects(run(id,'approve'),/SETTLEMENT_MISMATCH/);const saved=await detail(id,schema);await assert.rejects(run(id,'save',{...d.body,lines:[]}),/INVALID_DOCUMENT/);assert.deepEqual(await detail(id,schema),saved);d.body.fundsRecords[0].amount='100';await run(id,'save',d.body);await run(id,'approve');});
await check('新增运行单、调拨编辑后直接审核及失败回滚',async()=>{
 const ref=await fixture('TRANSFER'),body=(await detail(ref,schema)).body,id=randomUUID();
 await command({documentId:id,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:randomUUID(),body},{schema});
 assert.equal((await detail(id,schema)).baseline_was_included,false);assert.equal(String((await detail(id,schema)).business_day).slice(0,10),'2026-09-10');body.lines[0].source_quantity='8';
 const req={documentId:id,operation:'approve' as const,expectedVersion:1,requestKey:randomUUID(),body};const before=await snapshot();
 await assert.rejects(command(req,{schema,failure:'after-first-inventory'}),/INJECTED/);assert.deepEqual(await snapshot(),before);
 const result=await command(req,{schema});assert.deepEqual(await command(req,{schema}),result);assert.deepEqual((await effects(id)).map(x=>Number(x.quantity)),[-8,8]);
 assert.equal((await detail(id,schema)).current_revision,2);await run(id,'unapprove');assert(everyZero(await effects(id)));
 const saleId=randomUUID(),sale=(await detail(await fixture(),schema)).body;sale.lines[0].gift=false;sale.lines[0].unit_price='100';sale.lines[0].amount='1000';sale.fundsRecords=[{...payment,amount:'1000',direction:'receipt'}];
 await command({documentId:saleId,documentType:'SALE',operation:'create',expectedVersion:0,requestKey:randomUUID(),body:sale},{schema});
 await run(saleId,'approve');assert.equal(Number((await effects(saleId))[0].quantity),-10);await run(saleId,'unapprove');assert(everyZero(await effects(saleId)));
 sale.lines[0].source_quantity='8';await assert.rejects(run(saleId,'save',sale),/LINE_AMOUNT_MISMATCH/);
});
await check('调拨单和销货单仅未审核可软删除，删除不产生库存流水',async()=>{
 for(const kind of ['TRANSFER','SALE']){
  const id=await fixture(kind);
  await assert.rejects(run(id,'delete'),/DELETE_REQUIRES_UNAUDITED/);
  await run(id,'unapprove');
  const before=(await sql(`SELECT (SELECT count(*) FROM posting WHERE document_id=$1::uuid) postings,(SELECT count(*) FROM movement m JOIN posting p ON p.id=m.posting_id WHERE p.document_id=$1::uuid) movements`,[id])).rows[0];
  await run(id,'delete');
  const deleted=await detail(id,schema);
  assert.equal(deleted.status,'DELETED');assert.equal(deleted.current_effect_active,false);
  assert.equal(deleted.history.at(-1).operation,'delete');
  assert.deepEqual((await sql(`SELECT (SELECT count(*) FROM posting WHERE document_id=$1::uuid) postings,(SELECT count(*) FROM movement m JOIN posting p ON p.id=m.posting_id WHERE p.document_id=$1::uuid) movements`,[id])).rows[0],before);
  await assert.rejects(run(id,'approve'),/DOCUMENT_DELETED/);
  await assert.rejects(run(id,'save',deleted.body),/DOCUMENT_DELETED/);
 }
});
await check('初始化不覆盖已修改版本及状态；source和lineage保护',async()=>{const before=await detail(sample,schema);assert.equal((await initialize(schema)).created,0);assert.deepEqual(await detail(sample,schema),before);assert.deepEqual((await sql(`SELECT md5(string_agg(source_record_sha256,'' ORDER BY source_id)) hash FROM ${SOURCE}.tplus_history_line`)).rows,sourceBefore);assert.deepEqual((await sql(`SELECT md5(string_agg(variant_id||':'||warehouse_id||':'||quantity,',' ORDER BY variant_id,warehouse_id)) hash,sum(quantity)::text total FROM ${SOURCE}.tplus_inventory_balance_source`)).rows,sourceBalances);});
await writeFile(new URL('../runtime-test-results.json',import.meta.url),JSON.stringify({schema,at:new Date().toISOString(),sourceBalances,results},null,2));
console.log('ALL PASS',schema);
