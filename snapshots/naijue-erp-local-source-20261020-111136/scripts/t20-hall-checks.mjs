import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {databaseIdentifier as ident} from '../server/database/config.ts';
import {sqlLiteral as literal} from '../server/database/sql.ts';
import {loadMigrations,migrationSql} from '../server/database/migrations.ts';

/** Exercise 0009 -> 0010 in a brand-new database, before the regular fixture seed. */
export function prepareTransferSnapshotUpgrade({config,adminSql,hallId,warehouseIds,skuId}){
 const migrations=loadMigrations(config),index=migrations.findIndex(m=>m.id==='0010_transfer_creation_snapshot');assert.ok(index>0);
 adminSql(config,`SET SESSION AUTHORIZATION ${ident(config.roles.migrator)};${migrationSql(config,migrations.slice(0,index))}RESET SESSION AUTHORIZATION;`);
 const r=ident(config.schemas.runtime),actor='t20-upgrade-actor',trusted=randomUUID(),untrusted=randomUUID();
 const b={header:{business_date:'2026-10-03',source_from_warehouse_id:warehouseIds[0],source_to_warehouse_id:warehouseIds[1]},
  lines:[{sku_id:skuId,from_warehouse_id:warehouseIds[0],to_warehouse_id:warehouseIds[1],source_quantity:'1'}],fundsRecords:[]};
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};INSERT INTO ${r}.operator(id,name,role) VALUES(${literal(actor)},'Changed role cannot prove creation','WAREHOUSE');
  ${[trusted,untrusted].map((id,i)=>`INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day,transfer_creator_hall_id)
   VALUES(${literal(id)},'TRANSFER','T20-UPGRADE-${i}','UNAUDITED',false,false,1,1,'2026-10-03',${literal(hallId)}::uuid);
   INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,${i===1?'true':'false'},${literal(JSON.stringify(b))}::jsonb,${literal(actor)});`).join('\n')}
  RESET ROLE;`);
 return {trusted,untrusted,actor,hallId};
}

/** Run only on the fresh synthetic T20 cluster supplied by the fixture owner. */
export async function verifyTransferHallVisibility({config,adminSql,command,get,work,success,login,accounts,sessions,warehouseIds,remoteWarehouseIds,hallId,otherHallId,skuId,checked,fullFingerprint,upgradeFixture}){
 const r=ident(config.schemas.runtime),a=ident(config.schemas.auth),proof={cases:[],denials:[]},ids={};
 // The preceding owning suite also tests account moves; reset only this synthetic actor and log in anew.
 adminSql(config,`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=body||${literal(JSON.stringify({storeId:hallId,hallId}))}::jsonb,version=version+1 WHERE id=${literal(accounts.salesperson.id)};DELETE FROM ${a}.employee_session WHERE employee_id=${literal(accounts.salesperson.id)};RESET ROLE;`);
 sessions={...sessions,mine:await login(accounts.salesperson.id)};
 const [wa1]=warehouseIds,[wb1,wb2]=remoteWarehouseIds,shared=warehouseIds[2],unknown=randomUUID(),unknown2=randomUUID();
 const body=(from,to,extra={})=>({header:{business_date:'2026-10-03',source_from_warehouse_id:from,source_to_warehouse_id:to,...extra},
  lines:[{sku_id:skuId,from_warehouse_id:from,to_warehouse_id:to,source_quantity:'1'}],fundsRecords:[]});
 const create=async(name,session,from,to,extra={})=>{
  const id=randomUUID(),b=body(from,to,{source_number:'HALL-V2-'+name,...extra});
  success(await command(session,{documentId:id,documentType:'TRANSFER',operation:'create',expectedVersion:0,requestKey:randomUUID(),body:b}),'create '+name);
  ids[name]=id;return success(await get(session,'/api/runtime/document/'+id),'created detail '+name);
 };
 const admin=await create('admin-forged',sessions.admin,wb1,wb2,{creatorHallId:hallId,creatorRole:'SALESPERSON',creatorAccountId:accounts.salesperson.id,
  source_payload:{v2_creator:{id:accounts.salesperson.id,role:'营业员',hallId}}});
 assert.equal(admin.transfer_creator_account_id,accounts.admin.id,'creation account must be a stored trusted snapshot');
 assert.equal(admin.transfer_creator_role,'ADMIN','request creator role must not grant visibility');assert.equal(admin.transfer_creator_hall_id,null);
 const own=await create('creator-A',sessions.mine,wb1,wb2,{creatorHallId:otherHallId,creatorRole:'ADMIN',creatorAccountId:accounts.otherSalesperson.id});
 assert.equal(own.transfer_creator_account_id,accounts.salesperson.id);assert.equal(own.transfer_creator_role,'SALESPERSON');assert.equal(own.transfer_creator_hall_id,hallId);
 const worker=await create('worker-forged',sessions.warehouse,wb1,wb2,{creatorHallId:hallId,creatorRole:'SALESPERSON'});
 assert.equal(worker.transfer_creator_role,'WAREHOUSE');assert.equal(worker.transfer_creator_account_id,accounts.warehouse.id);assert.equal(worker.transfer_creator_hall_id,null);
 await create('creator-B-forged-A',sessions.other,wb1,wb2,{creatorHallId:hallId,creatorRole:'SALESPERSON',creatorAccountId:accounts.salesperson.id,
  source_payload:{v2_creator:{id:accounts.salesperson.id,hallId,role:'营业员'}}});
 await create('from-A',sessions.admin,wa1,wb1);await create('to-A',sessions.admin,wb1,wa1);await create('shared',sessions.admin,wb1,shared);
 checked('Creation role/account/hall snapshots come from the authenticated session, never a forged creator or handler');
 if(upgradeFixture){
  const row=success(await get(sessions.peer,'/api/runtime/document/'+upgradeFixture.trusted),'trusted 0009 creation preserved across upgrade');
  assert.equal(row.transfer_creator_account_id,upgradeFixture.actor);assert.equal(row.transfer_creator_role,'SALESPERSON');assert.equal(row.transfer_creator_hall_id,hallId);
  const denied=await get(sessions.peer,'/api/runtime/document/'+upgradeFixture.untrusted);assert.equal(denied.statusCode,403);
  proof.cases.push({name:'0009-upgrade',...upgradeFixture,importedNotInferred:true,currentOperatorRoleNotConsulted:true});
 }
 for(const change of ["transfer_creator_account_id='t20-admin'","transfer_creator_role='ADMIN'","transfer_creator_hall_id=NULL"]){
  const before=fullFingerprint();assert.throws(()=>adminSql(config,`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.document SET ${change} WHERE id=${literal(ids['creator-A'])}::uuid;RESET ROLE;`),/IMMUTABLE_TRANSFER_CREATION_SNAPSHOT/);assert.deepEqual(fullFingerprint(),before);
 }
 checked('Creation snapshots are immutable; proven old 0009 creates upgrade without current-role inference, imported rows remain untrusted');

 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};
  INSERT INTO ${r}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES
  ${[unknown,unknown2].map(id=>`('warehouses',${literal(id)},${literal(JSON.stringify({enabled:true,hallRelations:[hallId],sourceOwnershipUnknown:true,name:'Unknown ownership'}))}::jsonb,'{}',1,'T20-qa')`).join(',')};RESET ROLE;`);
 const legacy=async(name,from,to,creator=null)=>{
  const id=randomUUID(),b=body(from,to,{source_number:'HALL-V2-'+name,source_payload:{v2_creator:{id:accounts.salesperson.id,role:'营业员',hallId}}});
  adminSql(config,`SET ROLE ${ident(config.roles.runtime)};
   INSERT INTO ${r}.document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,version,business_day)
    VALUES(${literal(id)},'TRANSFER',${literal('HALL-V2-'+name)},'UNAUDITED',false,false,1,1,'2026-10-03');
   INSERT INTO ${r}.revision(document_id,revision,original_imported,body,actor_id) VALUES(${literal(id)},1,true,${literal(JSON.stringify(b))}::jsonb,${creator===null?'NULL':literal(creator)});RESET ROLE;`);
  ids[name]=id;
 };
 await legacy('unknown-both',unknown,unknown2);await legacy('A-and-unknown',wa1,unknown);await legacy('legacy-current-A',wb1,wb2,accounts.salesperson.id);
 const page=async(session,page=1,size=200,filters={})=>success(await get(session,'/api/runtime/documents?type=TRANSFER&page='+page+'&size='+size+'&filters='+encodeURIComponent(JSON.stringify({q:'HALL-V2-',...filters}))),'scoped page');
 const expectedA=['creator-A','from-A','to-A','shared','A-and-unknown'].map(n=>ids[n]),expectedB=Object.values(ids).filter(id=>id!==ids['unknown-both']&&id!==ids['A-and-unknown']);
 const assertSet=(p,expected)=>{assert.equal(p.total,expected.length);assert.deepEqual(new Set(p.items.map(i=>i.id)),new Set(expected));};
 for(const session of [sessions.mine,sessions.peer])assertSet(await page(session),expectedA);
 assertSet(await page(sessions.other),expectedB);for(const session of [sessions.admin,sessions.warehouse])assertSet(await page(session),Object.values(ids));
 const sliced=[];for(let p=1;p<=expectedA.length+1;p++){const data=await page(sessions.mine,p,1);assert.equal(data.total,expectedA.length);sliced.push(...data.items.map(i=>i.id));}
 assert.deepEqual(new Set(sliced),new Set(expectedA));assert.equal(sliced.length,expectedA.length);
 assert.equal((await page(sessions.mine,1,1,{q:'HALL-V2-admin-forged',from:[wb1],to:[wb2]})).total,0);
 assert.equal((await page(sessions.mine,1,200,{from:[wb1]})).total,3);
 const spoofFilter=await get(sessions.mine,'/api/runtime/documents?type=TRANSFER&filters='+encodeURIComponent(JSON.stringify({hallId:otherHallId,role:'ADMIN'})));
 assert.equal(spoofFilter.statusCode,400);
 proof.cases.push({name:'list-count-pagination',ids,expectedA,expectedB});checked('Visibility is filtered before count and pagination; both endpoints, shared and unknown ownership match the same predicate');

 const deny=async(session,url)=>{const before=fullFingerprint(),res=await get(session,url);assert.equal(res.statusCode,403,url+': '+res.body);assert.equal(res.json().error.code,'SCOPE');assert.deepEqual(fullFingerprint(),before);proof.denials.push({url,status:403,unchanged:true});};
 for(const hidden of [ids['admin-forged'],ids['worker-forged'],ids['creator-B-forged-A'],ids['unknown-both'],ids['legacy-current-A']]){
  for(const url of ['/api/runtime/document/'+hidden,'/api/runtime/history/'+hidden,'/api/outputs/documents/'+hidden+'?intent=print',
   '/api/outputs/documents/'+hidden+'?intent=export','/api/inventory/documents/'+hidden+'/revisions/1',
   '/api/outputs/export?documentId='+hidden,'/api/outputs/print?documentId='+hidden])await deny(sessions.mine,url);
  const before=fullFingerprint(),res=await work(sessions.mine,{type:'logs',docId:hidden});assert.equal(res.statusCode,403);assert.deepEqual(fullFingerprint(),before);proof.denials.push({route:'work.logs',documentId:hidden,status:403,unchanged:true});
 }
 for(const visible of expectedA){success(await get(sessions.peer,'/api/runtime/document/'+visible),'peer visible detail');success(await get(sessions.peer,'/api/inventory/documents/'+visible+'/revisions/1'),'peer linked revision');}
 checked('Direct IDs, histories, linked revisions, work logs and both output/compatibility routes cannot reveal a hidden transfer');

 const requestKey=randomUUID();success(await command(sessions.mine,{documentId:ids['creator-A'],documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey}),'original salesperson approval remains allowed');
 const reviewed=success(await get(sessions.peer,'/api/runtime/document/'+ids['creator-A']),'peer sees created transfer after approval');
 assert.equal(reviewed.history.length,2);assert.equal(success(await get(sessions.peer,'/api/runtime/history/'+ids['creator-A']),'creator branch history').length,2);
 for(const intent of ['print','export'])success(await get(sessions.peer,'/api/outputs/documents/'+ids['creator-A']+'?intent='+intent),'creator branch authorized '+intent);
 const posting=reviewed.history.flatMap(h=>h.postings||[]).find(p=>p.reason==='REVISION_APPROVAL');assert.ok(posting);
 success(await get(sessions.peer,'/api/inventory/postings/'+posting.id),'creator branch linked posting');
 success(await command(sessions.peer,{documentId:ids['creator-A'],documentType:'TRANSFER',operation:'unapprove',expectedVersion:2,requestKey:randomUUID()}),'peer unapprove under original transfer action policy');
 success(await command(sessions.peer,{documentId:ids['creator-A'],documentType:'TRANSFER',operation:'approve',expectedVersion:3,requestKey:randomUUID()}),'peer reapprove under original transfer action policy');
 success(await get(sessions.peer,'/api/requests/result?requestKey=missing&operationId=transfers.approve'),'other user cannot query original actor key');
 adminSql(config,`SET ROLE ${ident(config.roles.auth)};UPDATE ${a}.employee_login SET body=body||${literal(JSON.stringify({storeId:otherHallId,hallId:otherHallId}))}::jsonb,version=version+1 WHERE id=${literal(accounts.salesperson.id)};DELETE FROM ${a}.employee_session WHERE employee_id=${literal(accounts.salesperson.id)};RESET ROLE;`);
 const moved=await login(accounts.salesperson.id);
 const beforeSnapshot=success(await get(sessions.peer,'/api/runtime/document/'+ids['creator-A']),'creation hall stays visible after account move');
 assert.equal(beforeSnapshot.transfer_creator_hall_id,hallId);assert.equal(beforeSnapshot.transfer_creator_account_id,accounts.salesperson.id);assert.equal(beforeSnapshot.transfer_creator_role,'SALESPERSON');
 await create('created-after-move',moved,wa1,warehouseIds[1]);
 assert.equal((await page(sessions.other)).items.find(i=>i.id===ids['created-after-move']).transfer_creator_hall_id,otherHallId);
 assert.equal((await page(sessions.other)).items.some(i=>i.id===ids['legacy-current-A']),true,'legacy B endpoints visible to B, without current creator-hall inference');
 const invalidated=await get(sessions.mine,'/api/runtime/document/'+ids['creator-A']);assert.equal(invalidated.statusCode,401);
 // Remove B endpoint links after creation: only the immutable creation hall may now see the old document.
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{hallRelations}','[]'::jsonb) WHERE kind='warehouses' AND id IN (${literal(wb1)},${literal(wb2)});RESET ROLE;`);
 success(await get(sessions.peer,'/api/runtime/document/'+ids['creator-A']),'original creation hall visible without current endpoint links');
 await deny(moved,'/api/runtime/document/'+ids['creator-A']);await deny(sessions.other,'/api/runtime/document/'+ids['creator-A']);
 await deny(moved,'/api/requests/result?requestKey='+requestKey+'&operationId=transfers.approve');
 proof.cases.push({name:'account-move',creationSnapshot:{account:accounts.salesperson.id,role:'SALESPERSON',hall:hallId},peerVisible:true,peerUnapproveReapproveAllowed:true,historyAndOutputVisible:true,newHallDeniedAfterEndpointUnlink:true});
 checked('Other salespeople share the creation hall; later account reassignment cannot rewrite history or recover hidden original results');
 // restore fixtures for the owning suite and allow new business in the existing, verified B warehouses
 adminSql(config,`SET ROLE ${ident(config.roles.runtime)};UPDATE ${r}.master_data_entity SET body=jsonb_set(body,'{hallRelations}',${literal(JSON.stringify([otherHallId]))}::jsonb) WHERE kind='warehouses' AND id IN (${literal(wb1)},${literal(wb2)});RESET ROLE;`);
 const adminPost=randomUUID();success(await command(sessions.admin,{documentId:ids['admin-forged'],documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:adminPost}),'admin approved hidden posting');
 const full=success(await get(sessions.admin,'/api/runtime/document/'+ids['admin-forged']),'admin posting detail'),hiddenPosting=full.history.flatMap(h=>h.postings||[]).find(p=>p.reason==='REVISION_APPROVAL');assert.ok(hiddenPosting);
 await deny(sessions.peer,'/api/inventory/postings/'+hiddenPosting.id);
 const ledger=success(await get(sessions.peer,'/api/inventory/ledger?warehouseId='+wb1+'&skuId='+skuId+'&size=200'),'global ledger');
 const hidden=ledger.items.find(i=>i.postingId===hiddenPosting.id);assert.ok(hidden);assert.equal(hidden.sourceTarget.available,false);assert.equal(hidden.documentId,undefined);
 const stock=async(session)=>success(await get(session,'/api/inventory?view=original&size=200'),'global inventory');
 assert.deepEqual(await stock(sessions.peer),await stock(sessions.admin));
 proof.cases.push({name:'global-inventory',ledgerTargetHidden:true,allWarehouseInventoryUnchanged:true});checked('All-warehouse inventory stays readable while unrelated document/posting targets are denied');
 return proof;
}
