import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {databaseIdentifier as ident} from '../server/database/config.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';

/** Exercise the formal HTTP routes against the owning script's fresh synthetic QA. */
export async function verifySaleHallVisibility({config,adminSql,command,get,post,work,success,request,
 actors,sessions,login,hall,otherHall,w1,w2,sku1,line,fund,body,fingerprint,checked,evidencePath}){
 const proof={syntheticOnly:true,cases:[],denials:[],reads:[],fixtures:[],normalReplay:[]};
 const r=ident(config.schemas.runtime),a=ident(config.schemas.auth);
 const prefix='T21-HALL-'+randomUUID().slice(0,8)+'-',oldMarker=prefix+'OLD-A-PRIVATE',newMarker=prefix+'CURRENT-B';
 const docs=new Map();
 const flush=()=>writeFileSync(evidencePath,JSON.stringify(proof,null,2)+'\n');
 const check=(name,details={})=>{proof.cases.push({name,...details});checked('hall-'+name,details);flush();};
 const read=async(label,call)=>{
  const before=fingerprint(),response=await call(),data=success(response,label);
  assert.deepEqual(fingerprint(),before,label+' wrote data');proof.reads.push({label,status:200,databaseUnchanged:true});return data;
 };
 const deny=async(label,call,code='SCOPE',status=403)=>{
  const before=fingerprint(),response=await call();
  assert.equal(response.statusCode,status,label+': '+response.body);assert.equal(response.json().error?.code,code);
  assert.equal(response.json().data,undefined);assert.equal(response.body.includes(oldMarker),false);
  assert.deepEqual(fingerprint(),before,label+' wrote data');
  proof.denials.push({label,status,code,before,after:fingerprint(),databaseUnchanged:true,noData:true});flush();
 };
 const create=async(name,session,hallId,exchange=false,extra={})=>{
  const id=randomUUID(),b=exchange?body([
   line(name+'-RET','200.00','-2',sku1,{direction:'RETURN_IN',warehouse_id:w1}),
   line(name+'-OUT','300.00','1',sku1,{direction:'SALE_OUT',warehouse_id:w2})],[fund(name+'-REFUND','-100.00')],
   {business_type:'RETURN_EXCHANGE',return_warehouse_id:w1,outgoing_warehouse_id:w2,source_warehouse_id:w2}):body([line(name+'-LINE')],[fund(name+'-PAY','10.00')]);
  Object.assign(b.header,{business_date:'2026-10-03',hall_id:hallId,source_number:prefix+name,note:prefix+name,...extra});
  const req=request(id,'create',0,b),response=success(await command(session,req),'create '+name);
  const fixture={name,id,hallId,exchange,request:req,response,body:b};docs.set(name,fixture);
  proof.fixtures.push({name,id,hallId,exchange,source:'actual-command'});return fixture;
 };
 const imported=(name,hallId,exchange=false,legacy=false)=>{
  const id=randomUUID(),b=body([line(name+'-IMPORTED','10.0000','1.0000',sku1,
   {amount:'10.00',unit:'件',stock_quantity_contribution:'-1'})],[],
   {business_date:'2026-10-03',source_number:prefix+name,note:prefix+name,
    business_type:exchange?'RETURN_EXCHANGE':'SALE',source_payload:{legacy_immediate:legacy,claimedHall:hall}});
  if(hallId===undefined)delete b.header.hall_id;else b.header.hall_id=hallId;
  adminSql(`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
   VALUES(${literal(id)},'SALE',${literal(prefix+name)},'UNAUDITED',false,false,1,1,'2026-10-03');
   INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id)
   VALUES(${literal(id)},1,true,${literal(JSON.stringify(b))}::jsonb,NULL);RESET ROLE;`);
  const fixture={name,id,hallId,exchange,body:b};docs.set(name,fixture);
  proof.fixtures.push({name,id,hallId:hallId??null,exchange,legacy,source:'synthetic-trusted-import'});return fixture;
 };
 const pageUrl=(page=1,size=200,filters={})=>'/api/sales/documents?type=SALE&page='+page+'&size='+size+'&filters='+
  encodeURIComponent(JSON.stringify({q:prefix,...filters}));
 const allIds=[]; // Populated below; prior unrelated acceptance fixtures stay excluded.
 try{
  const ownA=await create('A-OWN',sessions.sales,hall),peerA=await create('A-OTHER-CREATOR',sessions.admin,hall,false,
   {source_payload:{v2_creator:{id:actors.otherSales.id,role:'SALESPERSON',hallId:otherHall}}});
  const exchangeA=await create('A-EXCHANGE',sessions.warehouse,hall,true),ownB=await create('B-OWN',sessions.otherSales,otherHall);
  const exchangeB=await create('B-EXCHANGE-FORGED-A',sessions.admin,otherHall,true,
   {source_payload:{v2_creator:{id:actors.sales.id,role:'ADMIN',hallId:hall}}});
  imported('NO-HALL',null);imported('MISSING-HALL',undefined,true);imported('UNKNOWN-HALL',randomUUID());
  imported('A-LEGACY',hall,true,true);imported('B-LEGACY',otherHall,true,true);
  allIds.push(...[...docs.values()].map(f=>f.id));
  const expectedA=[...docs.values()].filter(f=>f.hallId===hall).map(f=>f.id),expectedB=[...docs.values()].filter(f=>f.hallId===otherHall).map(f=>f.id);
  for(const fixture of [ownA,exchangeA,ownB,exchangeB]){
   const session=fixture===ownA?sessions.sales:fixture===ownB?sessions.otherSales:sessions.admin;
   fixture.approvalRequest=request(fixture.id,'approve',1);
   fixture.approvalResponse=success(await command(session,fixture.approvalRequest),'approve '+fixture.name);
  }
  for(const [name,expected] of [['sales',expectedA],['peerSales',expectedA],['otherSales',expectedB],['warehouse',allIds],['admin',allIds]]){
   const found=await read(name+' list',()=>get(sessions[name],pageUrl()));
   assert.equal(found.total,expected.length);assert.deepEqual(found.items.map(d=>d.id).sort(),[...expected].sort());
   assert.ok(found.items.every(d=>d.document_type==='SALE'));
   const ids=[];
   for(let p=1;p<=expected.length+1;p++){
    const result=await read(name+' page '+p,()=>get(sessions[name],pageUrl(p,1)));
    assert.equal(result.total,expected.length);assert.equal(result.page,p);assert.equal(result.size,1);
    assert.equal(result.items.length,p<=expected.length?1:0);ids.push(...result.items.map(d=>d.id));
   }
   assert.deepEqual(ids.sort(),[...expected].sort());
  }
  check('list-count-pagination',{sales:expectedA.length,otherSales:expectedB.length,all:allIds.length,beforePagination:true});
  for(const [filters,expected] of [
   [{businessType:['RETURN_EXCHANGE']},[exchangeA.id,docs.get('A-LEGACY').id]],
   [{businessType:['销售']},[ownA.id,peerA.id]],
   [{status:['APPROVED']},[ownA.id,exchangeA.id]],
   [{warehouseId:[w2]},[exchangeA.id]],
   [{storeId:[otherHall]},[]],[{stores:[hall,otherHall]},expectedA],
   [{start:'2026-10-03',end:'2026-10-03'},expectedA],[{start:'2026-10-04'},[]],
   [{exactNumber:prefix+'B-OWN'},[]],[{exactNumber:prefix+'A-OWN'},[ownA.id]]]){
   const result=await read('filtered '+JSON.stringify(filters),()=>get(sessions.sales,pageUrl(1,200,filters)));
   assert.equal(result.total,expected.length);assert.deepEqual(result.items.map(d=>d.id).sort(),[...expected].sort());
  }
  const ownFilter=await read('own top-level hall',()=>get(sessions.sales,pageUrl()+'&storeId='+hall));assert.equal(ownFilter.total,expectedA.length);
  await deny('other top-level hall',()=>get(sessions.sales,pageUrl()+'&storeId='+otherHall));
  await deny('spoofed top-level role',()=>get(sessions.sales,pageUrl()+'&role=ADMIN'),'VALIDATION',400);
  await deny('spoofed filter actor',()=>get(sessions.sales,pageUrl(1,200,{role:'ADMIN',actorId:actors.admin.id})),'VALIDATION',400);
  check('filters-exact-number-and-spoofing',{crossHallFiltersCannotExpand:true,dateRange:true,saleAndReturn:true});
  const detailUrls=id=>['/api/sales/document/'+id,'/api/sales/history/'+id,
   '/api/outputs/documents/'+id+'?intent=export','/api/outputs/documents/'+id+'?intent=print',
   '/api/inventory/documents/'+id+'/revisions/1'];
  for(const [name,expected] of [['sales',expectedA],['peerSales',expectedA],['otherSales',expectedB],['warehouse',allIds],['admin',allIds]]){
   for(const fixture of docs.values()){
    if(expected.includes(fixture.id)){
     for(const url of detailUrls(fixture.id)){
      const result=await read(name+' '+url,()=>get(sessions[name],url));
      assert.ok(JSON.stringify(result).includes(prefix+fixture.name),'authorized body must be returned');
     }
     await read(name+' work '+fixture.name,()=>work(sessions[name],{type:'logs',docId:fixture.id}));
    }else{
     for(const url of detailUrls(fixture.id))await deny(name+' '+url,()=>get(sessions[name],url));
     await deny(name+' work '+fixture.name,()=>work(sessions[name],{type:'logs',docId:fixture.id,actorId:actors.admin.id,role:'ADMIN'}));
    }
   }
  }
  const legacy=await read('legacy readonly',()=>get(sessions.sales,'/api/sales/document/'+docs.get('A-LEGACY').id));assert.equal(legacy.legacy_readonly,true);
  check('detail-history-revisions-work-and-output',{fullRoleMatrix:true,unknownHallDenied:true,legacyReadOnly:true});
  for(const fixture of docs.values()){
   for(const intent of ['print','export']){
    const url='/api/outputs/'+intent+'?documentId='+fixture.id;
    await deny('compatibility '+fixture.name+' '+intent,()=>get(sessions.sales,url),expectedA.includes(fixture.id)?'NOT_IMPLEMENTED':'SCOPE',expectedA.includes(fixture.id)?501:403);
   }
  }
  for(const type of ['document','history'])await deny('old sales '+type+' route',()=>get(sessions.sales,'/api/runtime/'+type+'/'+ownB.id));
  await deny('old sales list closed',()=>get(sessions.sales,'/api/runtime/documents?type=SALE'),'NOT_IMPLEMENTED',501);
  for(const intent of ['print','export'])await deny('mixed compatibility batch '+intent,
   ()=>post(sessions.sales,'/api/outputs/'+intent,{documentIds:[ownA.id,ownB.id],actorId:actors.admin.id,role:'ADMIN'}));
  check('compatibility-entries',{hiddenObjectsDenied:true,allowedLegacyOutputRemainsClosed:true});
  await deny('peer cannot approve creator A sale',()=>command(sessions.peerSales,request(ownA.id,'approve',2)),'FORBIDDEN');
  await deny('salesperson cannot unapprove',()=>command(sessions.sales,request(ownA.id,'unapprove',2)),'FORBIDDEN');
  await deny('spoofed command hall and actor',()=>command(sessions.sales,{...request(ownB.id,'save',2,body([line('FORGED')],[],{hall_id:hall})),actorId:actors.admin.id,role:'ADMIN'}));
  await deny('spoofed new cross-hall sale',()=>command(sessions.sales,{...request(randomUUID(),'create',0,body([line('FORGED-CREATE')],[],{hall_id:otherHall})),actorId:actors.admin.id,role:'ADMIN'}));
  check('original-action-permissions',{peerReadDoesNotGrantApproval:true,salespersonUnapproveForbidden:true});
  const detailB=await read('B posting lookup',()=>get(sessions.admin,'/api/sales/document/'+ownB.id));
  const posting=detailB.history.flatMap(v=>v.postings??[]).find(p=>p.reason==='REVISION_APPROVAL');assert.ok(posting);
  await deny('cross-hall posting direct ID',()=>get(sessions.sales,'/api/inventory/postings/'+posting.id));
  for(const name of ['warehouse','admin'])await read(name+' full posting',()=>get(sessions[name],'/api/inventory/postings/'+posting.id));
  const inventoryUrl='/api/inventory?size=200',stockA=await read('sales all-warehouse inventory',()=>get(sessions.sales,inventoryUrl));
  assert.deepEqual(stockA,await read('admin all-warehouse inventory',()=>get(sessions.admin,inventoryUrl)));
  const ledger=await read('sales global ledger',()=>get(sessions.sales,'/api/inventory/ledger?warehouseId='+w1+'&skuId='+sku1+'&size=200'));
  const hidden=ledger.items.find(row=>row.postingId===posting.id);assert.ok(hidden);assert.equal(hidden.documentId,undefined);
  assert.equal(hidden.sourceTarget.available,false);assert.equal(hidden.sourceTarget.documentId,undefined);assert.equal(hidden.sourceTarget.url,undefined);
  check('inventory-associated-links',{allWarehouseInventoryReadable:true,hiddenDocumentTargetsClosed:true});
  const replay=async(session,req,expected,label)=>{
   const before=fingerprint(),cached=success(await get(session,'/api/requests/result?operationId=sales.'+req.operation+'&requestKey='+req.requestKey),label+' GET');
   assert.equal(cached.resolution,'COMMITTED');assert.deepEqual(cached.originalResponse,expected);
   assert.deepEqual(success(await command(session,req),label+' POST'),expected);assert.deepEqual(fingerprint(),before);
   proof.normalReplay.push({label,exactGet:true,exactPost:true,databaseUnchanged:true});
  };
  await replay(sessions.sales,ownA.request,ownA.response,'current A create');
  await replay(sessions.sales,ownA.approvalRequest,ownA.approvalResponse,'current A approve');
  const otherResult=await read('other actor request key',()=>get(sessions.otherSales,'/api/requests/result?operationId=sales.create&requestKey='+ownA.request.requestKey));
  assert.equal(otherResult.resolution,'NOT_FOUND');assert.equal(otherResult.originalResponse,undefined);
  const moved=await create('MOVED',sessions.sales,hall,false,{note:oldMarker});
  moved.approvalRequest=request(moved.id,'approve',1);moved.approvalResponse=success(await command(sessions.sales,moved.approvalRequest),'A approves moved');
  success(await command(sessions.admin,request(moved.id,'unapprove',2)),'admin reverses moved');
  const movedBody=structuredClone(moved.body);Object.assign(movedBody.header,{hall_id:otherHall,note:newMarker});
  success(await command(sessions.admin,request(moved.id,'save',3,movedBody)),'admin moves A document to B');
  for(const url of detailUrls(moved.id)){
   await deny('A after document move '+url,()=>get(sessions.sales,url));
   if(!url.includes('/revisions/')){
    const result=await read('B after document move '+url,()=>get(sessions.otherSales,url));
    assert.equal(JSON.stringify(result).includes(oldMarker),false,'old A body leaked to B');
   }
  }
  const historyB=await read('B authorized history',()=>get(sessions.otherSales,'/api/sales/history/'+moved.id));
  assert.ok(historyB.length>0);assert.ok(historyB.every(v=>v.body.header.hall_id===otherHall&&v.previous_body===null));
  await deny('B old revision after document move',()=>get(sessions.otherSales,'/api/inventory/documents/'+moved.id+'/revisions/1'));
  for(const name of ['warehouse','admin']){
   const history=await read(name+' full reassigned history',()=>get(sessions[name],'/api/sales/history/'+moved.id));
   assert.ok(JSON.stringify(history).includes(oldMarker));assert.ok(history.some(v=>v.previous_body?.header.note===oldMarker));
   await read(name+' old reassigned revision',()=>get(sessions[name],'/api/inventory/documents/'+moved.id+'/revisions/1'));
  }
  await deny('A original create replay after current move',()=>command(sessions.sales,moved.request));
  await deny('A original result after current move',()=>get(sessions.sales,'/api/requests/result?operationId=sales.create&requestKey='+moved.request.requestKey));
  check('current-and-historical-hall',{previousBodyRedacted:true,warehouseAdminCompleteHistory:true});
  adminSql(`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=body||${literal(JSON.stringify({hallId:otherHall,storeId:otherHall}))}::jsonb,version=version+1
   WHERE id=${literal(actors.sales.id)};DELETE FROM ${a}.employee_session WHERE employee_id=${literal(actors.sales.id)};RESET ROLE;`);
  await deny('old A login revoked',()=>get(sessions.sales,pageUrl()),'UNAUTHENTICATED',401);
  const movedActor=await login(actors.sales);
  const currentB=await read('new B login current moved sale',()=>get(movedActor,'/api/sales/document/'+moved.id));assert.equal(currentB.body.header.note,newMarker);
  await read('A peer retains A sale after creator changes hall',()=>get(sessions.peerSales,'/api/sales/document/'+ownA.id));
  await deny('creator changed hall cannot read old A sale',()=>get(movedActor,'/api/sales/document/'+ownA.id));
  for(const req of [moved.request,moved.approvalRequest])await deny('B old cache '+req.operation,()=>get(movedActor,'/api/requests/result?operationId=sales.'+req.operation+'&requestKey='+req.requestKey));
  await deny('B no-body old approval replay',()=>command(movedActor,moved.approvalRequest));
  const newApprove=request(moved.id,'approve',4),newResponse=success(await command(movedActor,newApprove),'new B approval');
  await replay(movedActor,newApprove,newResponse,'authorized current B approval');
  check('account-hall-change-and-cached-responses',{currentAndCachedScopesChecked:true,ownNewHallReplayExact:true,otherActorRequestNotFound:true});
  await deny('unauthenticated list',()=>get({cookie:''},pageUrl()),'UNAUTHENTICATED',401);
  adminSql(`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=body||'{"storeId":null,"hallId":null}'::jsonb,version=version+1
   WHERE id=${literal(actors.peerSales.id)};DELETE FROM ${a}.employee_session WHERE employee_id=${literal(actors.peerSales.id)};RESET ROLE;`);
  await deny('unassigned salesperson has no list',()=>get(sessions.peerSales,pageUrl()),'UNAUTHENTICATED',401);
  check('no-valid-hall-no-login-scope',{missingActorHallDenied:true});
  proof.status='PASS';proof.completedAt=new Date().toISOString();flush();return proof;
 }catch(error){proof.status='FAIL';proof.failure=error instanceof Error?error.message:String(error);flush();throw error;}
}
