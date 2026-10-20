import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {databaseIdentifier as ident} from '../server/database/config.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {validateSkuUse} from '../server/domain/products/profile.ts';

/** Disabled SKU edits go through both actual guards and the real isolated HTTP command path. */
export async function verifyDisabledSkuTransfer({config,adminSql,command,get,success,login,accounts,adminSession,salespersonSession,warehouseIds,skuId,productId,app,checked,fullFingerprint,evidencePath}){
 const r=ident(config.schemas.runtime),proof={cases:[],denials:[]};
 const body=(sourceId,quantity)=>({header:{business_date:'2026-10-03',source_from_warehouse_id:warehouseIds[0],source_to_warehouse_id:warehouseIds[1],note:'before stop'},
  lines:[{...(sourceId?{source_id:sourceId}:{}),sku_id:skuId,from_warehouse_id:warehouseIds[0],to_warehouse_id:warehouseIds[1],source_quantity:String(quantity)}],fundsRecords:[]});
 const req=(id,operation,version,b,key=randomUUID())=>({documentId:id,documentType:'TRANSFER',operation,expectedVersion:version,requestKey:key,...(b?{body:b}:{})});
 const id=randomUUID(),noId=randomUUID(),original=success(await command(salespersonSession,req(id,'create',0,body('EXISTING-1',2))),'enabled reference draft'),originalNoId=success(await command(salespersonSession,req(noId,'create',0,body(null,2))),'enabled draft without source ID');
 const scalar=sql=>JSON.parse(adminSql(config,sql));
 const stock=()=>scalar(`SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY warehouse_id,sku_id),'[]'::jsonb) FROM
  (SELECT warehouse_id,sku_id,sum(quantity)::text quantity FROM
   (SELECT warehouse_id,variant_id sku_id,quantity FROM ${r}.inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM ${r}.inventory_delta) cells GROUP BY warehouse_id,sku_id) b`);
 const beforeStock=stock();
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.product_profile_overlay(product_id,body,version) VALUES(${literal(productId)}::uuid,${literal(JSON.stringify({disabledSkuIds:[skuId],enabled:true}))}::jsonb,1);RESET ROLE;`);
 const reduced=structuredClone(original.document.body);reduced.lines[0].source_quantity='1';
 await app.identity.execute(app.identity.keys.token(adminSession.cookie),'products.save',{kind:'global'},context=>validateSkuUse(context,reduced,original.document.body));
 proof.cases.push({name:'product guard allows existing 2 to 1',passed:true});
 const save=req(id,'save',1,reduced),response=await command(salespersonSession,save);
 proof.reproduction={status:response.statusCode,error:response.json().error?.code??null,response:response.json()};writeFileSync(evidencePath,JSON.stringify(proof,null,2)+'\n');
 assert.equal(response.statusCode,200,'Existing non-imported disabled SKU 2 to 1 must save: '+response.body);
 const saved=success(response,'disabled SKU reduction');assert.equal(saved.document.version,2);assert.equal(saved.document.body.lines[0].source_quantity,'1');assert.equal(saved.document.body.lines[0].sku_id,skuId);assert.equal(saved.document.body.lines[0].unit,'件');assert.deepEqual(stock(),beforeStock);
 const beforeReplay=fullFingerprint();assert.deepEqual(success(await command(salespersonSession,save),'exact reduction retry'),saved);
 const result=success(await get(salespersonSession,'/api/requests/result?requestKey='+save.requestKey+'&operationId=transfers.save'),'reduction result');assert.deepEqual(result.originalResponse,saved);assert.deepEqual(fullFingerprint(),beforeReplay);
 proof.cases.push({name:'non-imported draft 2 to 1',passed:true,version:2,stockUnchanged:true,replayExact:true});checked('Disabled SKU 2 to 1 saves without stock changes; real product/transfer guards and original-result replay agree');
 const deny=async(name,input,session=salespersonSession,expected='REFERENCE_CONFLICT',status=409)=>{const before=fullFingerprint(),res=await command(session,input);assert.equal(res.statusCode,status,name+': '+res.body);assert.equal(res.json().error.code,expected);assert.deepEqual(fullFingerprint(),before);proof.denials.push({name,status,error:expected,tableContentUnchanged:true});};
 const increased=structuredClone(saved.document.body);increased.lines[0].source_quantity='2';await deny('increase disabled existing SKU',req(id,'save',2,increased));
 await deny('new disabled SKU use',req(randomUUID(),'create',0,body('NEW-1',1)));
 await deny('approval still rejects disabled non-imported SKU',req(id,'approve',2));
 const moved=structuredClone(saved.document.body);moved.header.source_to_warehouse_id=warehouseIds[2];moved.lines[0].to_warehouse_id=warehouseIds[2];await deny('move disabled use to different warehouse',req(id,'save',2,moved));
 const newIdentity=structuredClone(saved.document.body);newIdentity.lines[0].source_id='NEW-IDENTITY';await deny('new source identity cannot borrow existing allowance',req(id,'save',2,newIdentity));
 const split=structuredClone(originalNoId.document.body);split.lines=Array.from({length:3},()=>({...split.lines[0],source_quantity:'1'}));await deny('three unnamed rows cannot turn previous quantity 2 into 3',req(noId,'save',1,split));
 const memo=structuredClone(saved.document.body);memo.header.note='disabled but unchanged quantity';const memoSaved=success(await command(salespersonSession,req(id,'save',2,memo)),'unchanged quantity memo');assert.equal(memoSaved.document.version,3);
 const other=await login(accounts.otherSalesperson.id);await deny('other hall still cannot save creator-hall draft',req(id,'save',3,memo),other,'SCOPE',403);
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.product_profile_overlay SET body='{"enabled":false,"disabledSkuIds":[]}'::jsonb,version=version+1 WHERE product_id=${literal(productId)}::uuid;RESET ROLE;`);
 const productReduced=structuredClone(originalNoId.document.body);productReduced.lines[0].source_quantity='1';const productSaved=success(await command(salespersonSession,req(noId,'save',1,productReduced)),'disabled whole product reduction');assert.equal(productSaved.document.version,2);
 await deny('disabled whole product cannot enter new draft',req(randomUUID(),'create',0,body('NEW-PRODUCT',1)));
 assert.deepEqual(stock(),beforeStock);assert.equal(scalar(`SELECT count(*) FROM ${r}.posting WHERE document_id IN (${literal(id)}::uuid,${literal(noId)}::uuid)`),0);
 const detail=success(await get(salespersonSession,'/api/runtime/document/'+id),'reduction persisted history');assert.equal(detail.history.length,3);assert.equal(detail.history[0].body.lines[0].source_quantity,'2');assert.equal(detail.body.header.business_date,'2026-10-03');
 proof.cases.push({name:'same quantity notes and disabled whole product reduction',passed:true,stockUnchanged:true,noPosting:true,originalRevisionRetained:true});checked('Disabled new/increased/moved/split use and cross-hall edits are denied; notes and whole-product reductions keep history and stock');
 proof.verdict='PASS';writeFileSync(evidencePath,JSON.stringify(proof,null,2)+'\n');return proof;
}
