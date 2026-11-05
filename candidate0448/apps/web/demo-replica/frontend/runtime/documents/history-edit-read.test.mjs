/** SYNTHETIC read lifecycle only. No real network, browser, database or revision write. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryEditRead,historyDetailCanLeave} from './history-edit-read.ts';
import {ReadScope} from '../../../../src/loading/read-scope.ts';
import {HttpQueryError} from '../../../../src/transport/http-query.ts';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const parameters={documentId:id(1),linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200};
const target={kind:'sales',batchId:id(2),documentId:id(1),effectiveVersion:1};
const newScope=()=>new ReadScope({accountId:id(90),sessionRevision:'1',permissionRevision:'1'},'history-edit-read',id(1),()=>{});
function detail(number='SYNTHETIC ORIGINAL'){
 return {dataset:'HISTORY',kind:'sales',document:{dataset:'HISTORY',kind:'sales',batchId:id(2),documentId:id(1),version:1,number,businessDate:'2026-01-01',sourceStatus:'APPROVED',note:null,createdBy:{state:'UNKNOWN',staffId:null},approvedBy:{state:'UNKNOWN',staffId:null},responsibleStaffId:null,responsibleName:null,createdHallId:null,createdHallProvenance:'UNKNOWN',createdLocalAt:null,updatedLocalAt:null,approvedLocalAt:null,createdInstant:null,updatedInstant:null,approvedInstant:null,businessType:'SALE',hallId:id(3),customerId:id(4),warehouseId:id(5),salespersonId:null,grossAmount:'1.00',orderDiscount:'0.00',netDue:'1.00'},lines:{page:1,pageSize:200,total:'1',items:[{id:id(1001),lineNo:1,skuId:id(6),quantity:'1',productCodeSnapshot:null,productNameSnapshot:null,colorNameSnapshot:null,fitNameSnapshot:null,sizeNameSnapshot:null,barcodeSnapshot:null,referencePrice:null,dealPrice:'1.00',lineAmount:'1.00',allocatedDiscount:null,isGift:null,pricingMethodSource:null,discountTenths:null,ordinaryZeroConfirmed:null}]},settlements:{page:1,pageSize:200,total:'0',items:[]}};
}
test('cancel read detaches immediately, keeps route/prior view scope active, and ignores a late complete response without creating an owner',async()=>{
 const scope=newScope(),pending=deferred();let ownerCalls=0,readSignal;
 const query=createHistoryEditRead({scope,target,reader:{async readDetail(_target,read){readSignal=read.signal;return pending.promise;}},owner:async()=>{ownerCalls++;return {};}});
 const work=query.run(parameters);query.cancel();assert.equal((await work).status,'discarded');assert.equal(readSignal.aborted,true);assert.equal(scope.active,true);assert.equal(query.getSnapshot().phase,'idle');
 pending.resolve(detail());await tick();assert.equal(ownerCalls,0);assert.equal(query.getSnapshot().success,null);query.dispose();scope.dispose();
});
test('leave/dispose detaches an ignored read and no late data or owner survives the route',async()=>{
 const scope=newScope(),pending=deferred();let ownerCalls=0;const query=createHistoryEditRead({scope,target,reader:{async readDetail(){return pending.promise;}},owner:async()=>{ownerCalls++;return {};}});
 const work=query.run(parameters);scope.dispose();assert.equal((await work).status,'discarded');assert.equal(query.getSnapshot().phase,'disposed');pending.resolve(detail());await tick();assert.equal(ownerCalls,0);assert.equal(query.getSnapshot().success,null);
});
test('cancel during pending owner lookup never publishes the owner or edit model and never invokes write methods',async()=>{
 const scope=newScope(),started=deferred(),pending=deferred();let writes=0;
 const query=createHistoryEditRead({scope,target,reader:{async readDetail(){return detail();}},owner:async()=>{started.resolve();return pending.promise;}});
 const work=query.run(parameters);await started.promise;query.cancel();assert.equal((await work).status,'discarded');pending.resolve({submit(){writes++;},cancelWaiting(){writes++;},replayOriginal(){writes++;}});await tick();assert.equal(writes,0);assert.equal(query.getSnapshot().phase,'idle');assert.equal(query.getSnapshot().success,null);query.dispose();scope.dispose();
});
test('superseded late read cannot clear a newer loading state, replace its model or allocate a second owner',async()=>{
 const scope=newScope(),first=deferred(),second=deferred();let reads=0,owners=0;const owner={};
 const query=createHistoryEditRead({scope,target,reader:{async readDetail(){return ++reads===1?first.promise:second.promise;}},owner:async()=>{owners++;return owner;}});
 const a=query.run(parameters),b=query.run(parameters);assert.equal((await a).status,'discarded');first.resolve(detail('OLD'));await tick();assert.equal(query.getSnapshot().phase,'loading');assert.equal(owners,0);
 second.resolve(detail('NEW'));const result=await b;assert.equal(result.status,'success');assert.equal(result.data.complete.document.number,'NEW');assert.equal(result.data.owner,owner);assert.equal(owners,1);assert.equal(query.getSnapshot().success.data.complete.document.number,'NEW');query.dispose();scope.dispose();
});
test('late access rejection after local cancellation is consumed and cannot become a current denial or error notice',async()=>{
 const scope=newScope(),pending=deferred();let owners=0;const query=createHistoryEditRead({scope,target,reader:{async readDetail(){return pending.promise;}},owner:async()=>{owners++;return {};}});
 const work=query.run(parameters);query.cancel();assert.equal((await work).status,'discarded');pending.reject(new HttpQueryError('forbidden','FORBIDDEN',403));await tick();assert.equal(owners,0);assert.equal(query.getSnapshot().error,null);assert.equal(scope.active,true);query.dispose();scope.dispose();
});
test('after cancel a new explicit edit read succeeds on the same route, with no write or automatic retry',async()=>{
 const scope=newScope(),pending=deferred();let reads=0,owners=0,writes=0;const owner={submit(){writes++;},cancelWaiting(){writes++;},replayOriginal(){writes++;}};
 const query=createHistoryEditRead({scope,target,reader:{async readDetail(){return ++reads===1?pending.promise:detail();}},owner:async()=>{owners++;return owner;}});
 const old=query.run(parameters);query.cancel();await old;const result=await query.run(parameters);assert.equal(result.status,'success');assert.equal(result.data.owner,owner);pending.resolve(detail('OLD'));await tick();assert.equal(reads,2);assert.equal(owners,1);assert.equal(writes,0);assert.equal(query.getSnapshot().success.data.complete.document.number,'SYNTHETIC ORIGINAL');query.dispose();scope.dispose();
});
test('clean READ can leave but dirty/unknown edits and submitting/uncertain writes retain the original leave guards',()=>{
 assert.equal(historyDetailCanLeave(true,false,null),true);
 for(const phase of ['idle','rejected','submitting','uncertain','committed']){
  const original=Object.freeze({requestKey:'original-key',quantity:'2'}),owner={unresolved:['submitting','uncertain'].includes(phase),getSnapshot:()=>({phase,command:original})};
  assert.equal(historyDetailCanLeave(true,false,owner),!owner.unresolved);assert.equal(historyDetailCanLeave(true,true,owner),phase==='committed');assert.equal(historyDetailCanLeave(false,true,owner),true);assert.equal(owner.getSnapshot().command,original);
 }
});
