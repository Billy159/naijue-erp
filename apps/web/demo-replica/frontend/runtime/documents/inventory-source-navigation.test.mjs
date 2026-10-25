import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveInventorySourceRoute} from './inventory-source-navigation.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
import {HttpQueryError} from '../../../../src/transport/http-query.ts';
import {detail as salesDetail} from '../../../../src/sales/tests/fixtures.ts';
import {detail as transferDetail} from '../../../../src/transfers/tests/fixtures.ts';

const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const identity={accountId:id(90),sessionRevision:'1',permissionRevision:'1'};
const entry=source=>({id:id(80),operationId:id(81),eventKind:source.kind==='HISTORY_REVISION'?'HISTORY_REVISION':'APPROVE',quantityDelta:'1',source,sourceDocumentVersion:1,reversesEntryId:null,businessDate:'2026-10-20',postedAt:'2026-10-20T00:00:00.000000Z'});
const nativeSales={kind:'SALES',salesId:id(1),salesLineId:id(21),endpoint:'SALES_WAREHOUSE'};
const nativeTransfer={kind:'TRANSFER',transferId:id(1),transferLineId:id(102),endpoint:'FROM'};
const historySource=kind=>kind==='sales'?{kind:'HISTORY_REVISION',documentKind:'SALES',revisionId:id(88),salesId:id(1),salesLineId:id(21),endpoint:'SALES_WAREHOUSE'}:{kind:'HISTORY_REVISION',documentKind:'TRANSFER',revisionId:id(89),transferId:id(1),transferLineId:id(102),endpoint:'TO'};
function historical(kind){
 const common={dataset:'HISTORY',kind,batchId:id(300),documentId:id(1),version:7,number:'SYN-HISTORY-SOURCE',businessDate:null,sourceStatus:'APPROVED',note:null,createdBy:{state:'UNKNOWN',staffId:null},approvedBy:{state:'UNKNOWN',staffId:null},responsibleStaffId:null,responsibleName:null,createdHallId:null,createdHallProvenance:'UNKNOWN',createdLocalAt:null,updatedLocalAt:null,approvedLocalAt:null,createdInstant:null,updatedInstant:null,approvedInstant:null};
 const document={...common,...(kind==='sales'?{businessType:'RETURN',hallId:id(3),customerId:id(4),warehouseId:id(5),salespersonId:null,grossAmount:'-1.00',orderDiscount:'0.00',netDue:'-1.00'}:{fromWarehouseId:id(3),toWarehouseId:id(4)})};
 const line={id:id(21),lineNo:1,skuId:id(70),quantity:kind==='sales'?'-1':'1',productCodeSnapshot:'00001',productNameSnapshot:'纯合成原保存名称',colorNameSnapshot:null,fitNameSnapshot:null,sizeNameSnapshot:null,barcodeSnapshot:'0000012345',...(kind==='sales'?{referencePrice:null,dealPrice:'1.00',lineAmount:'-1.00',allocatedDiscount:null,isGift:null,pricingMethodSource:null,discountTenths:null,ordinaryZeroConfirmed:null}:{})};
 return {dataset:'HISTORY',kind,document,lines:{page:1,pageSize:20,total:'1',items:[line]},settlements:{page:1,pageSize:20,total:'0',items:[]}};
}
function setup(fetch){const context=new ReadContext(identity),scope=context.createScope('inventory-source',id(70)),calls=[];const http={origin:'https://synthetic.local',basePath:'/api',fetch:async(url,init)=>{calls.push({path:new URL(url).pathname,body:JSON.parse(init.body),credentials:init.credentials,signal:init.signal});return fetch(url,init);}};return {context,scope,http,calls};}

test('native source uses only its independently authorized original detail and exact normal route',async()=>{
 for(const [source,data,route,path] of [[nativeSales,salesDetail(),'sales/view/'+id(1),'/api/sales/detail/query'],[nativeTransfer,transferDetail(),'transfer/view/'+id(1),'/api/transfers/detail/query']]){
  const h=setup(async()=>Response.json(data));assert.equal(h.calls.length,0);
  assert.equal(await resolveInventorySourceRoute({...h,entry:entry(source)}),route);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,path);assert.equal(h.calls[0].credentials,'same-origin');
  assert.deepEqual(h.calls[0].body,source.kind==='SALES'?{salesId:id(1)}:{transferId:id(1)});h.context.clear();
 }
});

test('history locates the returned real batch/current version using one bounded original detail request',async()=>{
 for(const kind of ['sales','transfers']){
  const h=setup(async()=>Response.json(historical(kind)));
  assert.equal(await resolveInventorySourceRoute({...h,entry:entry(historySource(kind))}),(kind==='sales'?'sales':'transfer')+'/history/'+id(300)+'/'+id(1)+'/7');
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/imported-history/'+kind+'/detail/query');
  assert.deepEqual(h.calls[0].body,{documentId:id(1),linePage:1,linePageSize:20,settlementPage:1,settlementPageSize:20});h.context.clear();
 }
});

test('unknown, baseline, missing native and authorized null history never fabricate a route',async()=>{
 const h=setup(async()=>Response.json({error:{code:'DOCUMENT_NOT_FOUND'}},{status:404}));
 for(const source of [{kind:'UNKNOWN'}, {kind:'CUTOFF_BASELINE',importBatchId:id(3),endpoint:'IMPORT_BASELINE'}, {...nativeSales,salesId:'invalid'}])assert.equal(await resolveInventorySourceRoute({...h,entry:entry(source)}),null);
 assert.equal(h.calls.length,0);assert.equal(await resolveInventorySourceRoute({...h,entry:entry(nativeSales)}),null);h.context.clear();
 const data=historical('sales');data.document=null;data.lines.total='0';data.lines.items=[];
 const absent=setup(async()=>Response.json(data));assert.equal(await resolveInventorySourceRoute({...absent,entry:entry(historySource('sales'))}),null);absent.context.clear();
});

test('target identity, current batch/version and the whole historical response remain strict',async()=>{
 for(const mutate of [d=>{d.document.documentId=id(999);},d=>{d.document.batchId='invalid';},d=>{d.document.version=0;},d=>{d.lines.total='2';},d=>{d.lines.items[0].quantity='invalid';},d=>{d.settlements.total='1';},d=>{d.document=null;}]){
  const data=historical('sales');mutate(data);const h=setup(async()=>Response.json(data));
  await assert.rejects(resolveInventorySourceRoute({...h,entry:entry(historySource('sales'))}),error=>error instanceof HttpQueryError&&error.kind==='malformed-response');h.context.clear();
 }
});

test('401/403 stay original access errors for the root owner, without a list/native fallback',async()=>{
 for(const source of [nativeSales,historySource('transfers')])for(const status of [401,403]){
  const h=setup(async()=>Response.json({error:{code:status===401?'UNAUTHENTICATED':'FORBIDDEN'}},{status}));
  await assert.rejects(resolveInventorySourceRoute({...h,entry:entry(source)}),error=>error instanceof HttpQueryError&&error.kind===(status===401?'unauthenticated':'forbidden'));
  assert.equal(h.calls.length,1);h.context.clear();
 }
});

test('same-account permission change cancels an old scope and ignores an abort-ignoring late response',async()=>{
 let resolveLate,started;const pending=new Promise(resolve=>{resolveLate=resolve;}),ready=new Promise(resolve=>{started=resolve;});
 const h=setup(async()=>{started();return pending;}),work=resolveInventorySourceRoute({...h,entry:entry(historySource('sales'))});
 await ready;h.context.replaceIdentity({...identity,permissionRevision:'2'});assert.equal(await work,null);assert.ok(h.calls[0].signal.aborted);
 resolveLate(Response.json(historical('sales')));assert.equal(await resolveInventorySourceRoute({...h,entry:entry(nativeSales)}),null);assert.equal(h.calls.length,1);h.context.clear();
});

test('drawer/action cancellation drops late native results without disposing the inventory scope',async()=>{
 let resolveLate,started;const pending=new Promise(resolve=>{resolveLate=resolve;}),ready=new Promise(resolve=>{started=resolve;});
 const h=setup(async()=>{started();return pending;}),click=new AbortController(),work=resolveInventorySourceRoute({...h,entry:entry(nativeTransfer),signal:click.signal});
 await ready;click.abort();assert.equal(await work,null);assert.ok(h.scope.active);assert.ok(h.calls[0].signal.aborted);
 resolveLate(Response.json(transferDetail()));assert.equal(await resolveInventorySourceRoute({...h,entry:entry(nativeTransfer),signal:click.signal}),null);assert.equal(h.calls.length,1);h.context.clear();
});
