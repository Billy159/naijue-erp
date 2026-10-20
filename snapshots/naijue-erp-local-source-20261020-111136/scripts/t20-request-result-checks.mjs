import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {databaseIdentifier as ident} from '../server/database/config.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';

/** Real HTTP requests against the fresh, synthetic, TCP-disabled owning T20 fixture. */
export async function verifyRequestResultScope({config,adminSql,command,get,success,login,accounts,adminSession,salespersonSession,warehouseIds,remoteWarehouseIds,hallId,otherHallId,skuId,checked,fullFingerprint,evidencePath}){
 const proof={syntheticOnly:true,observations:[],leaks:[],normalReplay:[],checks:[]},fixtures=[];
 const marker='RECOVERY-OLD-HALL-A-PRIVATE',newMarker='RECOVERY-CURRENT-HALL-B';
 const body=(type,hall,warehouses,note)=>({header:{business_date:'2026-10-03',note,...(type==='SALE'?{business_type:'SALE',hall_id:hall,source_warehouse_id:warehouses[0],adjustment:'0.00'}:{source_from_warehouse_id:warehouses[0],source_to_warehouse_id:warehouses[1]})},
  lines:[{source_id:'T20-RESULT-'+type,sku_id:skuId,source_quantity:'1',...(type==='SALE'?{warehouse_id:warehouses[0],unit_price:'0.00',gift:true}:{from_warehouse_id:warehouses[0],to_warehouse_id:warehouses[1]})}],fundsRecords:[]});
 const req=(id,type,operation,expectedVersion,b)=>({documentId:id,documentType:type,operation,expectedVersion,requestKey:randomUUID(),...(b?{body:b}:{})});
 const url=(request)=>'/api/requests/result?requestKey='+request.requestKey+'&operationId='+(request.documentType==='SALE'?'sales.':'transfers.')+request.operation;
 const normal=async(session,request,expected,label)=>{
  const before=fullFingerprint();assert.deepEqual(success(await command(session,request),label+' POST'),expected);
  const result=success(await get(session,url(request)),label+' GET');assert.equal(result.resolution,'COMMITTED');assert.deepEqual(result.originalResponse,expected);
  assert.deepEqual(fullFingerprint(),before);proof.normalReplay.push({label,type:request.documentType,requestKey:request.requestKey,postExact:true,getExact:true,tableContentUnchanged:true});
 };
 const deny=async(label,call)=>{
  const before=fullFingerprint(),response=await call();assert.deepEqual(fullFingerprint(),before,label+' changed table content');
  const observation={label,status:response.statusCode,leakedOldMarker:response.body.includes(marker),error:response.json().error?.code??null,tableContentUnchanged:true};proof.observations.push(observation);
  if(response.statusCode!==403||observation.leakedOldMarker)proof.leaks.push({...observation,response:response.json()});
 };
 for(const type of ['SALE','TRANSFER']){
  const id=randomUUID(),create=req(id,type,'create',0,body(type,hallId,warehouseIds,marker));
  const created=success(await command(salespersonSession,create),'A creates '+type);assert.equal(created.document.body.header.note,marker);
  await normal(salespersonSession,create,created,'A normal create '+type);
  const approve=req(id,type,'approve',1),approved=success(await command(salespersonSession,approve),'A approves '+type);
  await normal(salespersonSession,approve,approved,'A normal approve '+type);
  success(await command(adminSession,req(id,type,'unapprove',2)),'admin unapproves '+type);
  const moved=success(await command(adminSession,req(id,type,'save',3,body(type,otherHallId,remoteWarehouseIds,newMarker))),'admin moves '+type+' to B');assert.equal(moved.document.body.header.note,newMarker);
  fixtures.push({id,type,create,approve,created,approved});
 }
 checked('Same actor/key/payload GET recovery and POST replay return exact original SALE/TRANSFER responses without extra table changes');
 const sale=fixtures.find(f=>f.type==='SALE');
 await deny('SALE create replay when current B document is forbidden to still-A actor',()=>command(salespersonSession,sale.create));
 const a=ident(config.schemas.auth);
 adminSql(config,`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=body||${literal(JSON.stringify({storeId:otherHallId,hallId:otherHallId}))}::jsonb,version=version+1 WHERE id=${literal(accounts.salesperson.id)};DELETE FROM ${a}.employee_session WHERE employee_id=${literal(accounts.salesperson.id)};RESET ROLE;`);
 const movedActor=await login(accounts.salesperson.id),otherB=await login(accounts.otherSalesperson.id);
 for(const fixture of fixtures){
  const path=fixture.type==='SALE'?'/api/sales/document/':'/api/runtime/document/';
  const current=success(await get(movedActor,path+fixture.id),'B current '+fixture.type);assert.equal(current.body.header.note,newMarker);
  await deny(fixture.type+' old revision',()=>get(movedActor,'/api/inventory/documents/'+fixture.id+'/revisions/1'));
  await deny(fixture.type+' GET create result after move',()=>get(movedActor,url(fixture.create)));
  await deny(fixture.type+' GET approve result after move',()=>get(movedActor,url(fixture.approve)));
  await deny(fixture.type+' POST approve replay after move',()=>command(movedActor,fixture.approve));
  const other=success(await get(otherB,url(fixture.create)),'other B actor result');assert.equal(other.resolution,'NOT_FOUND');assert.equal(other.originalResponse,undefined);
 }
 // New B actions and their own current cache must remain usable after old A responses are denied.
 for(const fixture of fixtures){
  const approve=req(fixture.id,fixture.type,'approve',4),result=success(await command(movedActor,approve),'new B approve '+fixture.type);
  assert.equal(result.document.body.header.note,newMarker);await normal(movedActor,approve,result,'B normal approve '+fixture.type);
 }
 // An administrator can still read both halls' own original cache after an actual hall change.
 const adminId=randomUUID(),adminCreate=req(adminId,'SALE','create',0,body('SALE',hallId,warehouseIds,marker));
 const adminOriginal=success(await command(adminSession,adminCreate),'admin original create');
 success(await command(adminSession,req(adminId,'SALE','save',1,body('SALE',otherHallId,remoteWarehouseIds,newMarker))),'admin reassignment');
 await normal(adminSession,adminCreate,adminOriginal,'admin original A cache after B reassignment');
 proof.checks.push({newHallCurrentDocumentReadable:true,oldRevisionDenied:true,otherActorResultNotFound:true,currentAuthorizedReplayPreserved:true});
 proof.verdict=proof.leaks.length?'REPRODUCED_LEAK':'PASS';writeFileSync(evidencePath,JSON.stringify(proof,null,2)+'\n');
 assert.equal(proof.leaks.length,0,'Old A cached bodies must be denied after document and actor move to B');
 checked('Current document authorization also protects cached old SALE/TRANSFER bodies; current B and all-hall admin replay remain exact');
 return proof;
}
