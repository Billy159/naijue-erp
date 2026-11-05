/** SYNTHETIC existing-collector seam. No browser, HTTP server, PostgreSQL or write. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectHistoryDocument} from './history-reader.ts';
import {ReadScope} from '../../../../src/loading/read-scope.ts';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function detail(kind,page){
 const document={dataset:'HISTORY',kind,batchId:id(2),documentId:id(1),version:1,number:'SYNTHETIC ORIGINAL',businessDate:'2026-01-01',sourceStatus:'APPROVED',note:null,createdBy:{state:'UNKNOWN',staffId:null},approvedBy:{state:'UNKNOWN',staffId:null},responsibleStaffId:null,responsibleName:null,createdHallId:null,createdHallProvenance:'UNKNOWN',createdLocalAt:null,updatedLocalAt:null,approvedLocalAt:null,createdInstant:null,updatedInstant:null,approvedInstant:null,...(kind==='sales'?{businessType:'SALE',hallId:id(3),customerId:id(4),warehouseId:id(5),salespersonId:null,grossAmount:'201.00',orderDiscount:'0.00',netDue:'201.00'}:{fromWarehouseId:id(5),toWarehouseId:id(7)})};
 const items=Array.from({length:page===1?200:1},(_,index)=>{const n=(page-1)*200+index+1;return {id:id(1000+n),lineNo:n,skuId:id(6),quantity:'1',productCodeSnapshot:null,productNameSnapshot:null,colorNameSnapshot:null,fitNameSnapshot:null,sizeNameSnapshot:null,barcodeSnapshot:null,...(kind==='sales'?{referencePrice:null,dealPrice:'1.00',lineAmount:'1.00',allocatedDiscount:null,isGift:null,pricingMethodSource:null,discountTenths:null,ordinaryZeroConfirmed:null}:{})};});
 return {dataset:'HISTORY',kind,document,lines:{page,pageSize:200,total:'201',items},settlements:{page:1,pageSize:200,total:'0',items:[]}};
}
for(const kind of ['sales','transfers'])for(const action of ['cancel-read','leave-route']){
 test(`collector existing seam ${kind}: ${action} while final page ignores signal cannot return a complete edit model`,async()=>{
  const scope=new ReadScope({accountId:id(90),sessionRevision:'1',permissionRevision:'1'},'history-cancel-red',id(1),()=>{}),local=new AbortController(),started=deferred(),last=deferred(),calls=[];
  const signal=AbortSignal.any([scope.signal,local.signal]),target={kind,batchId:id(2),documentId:id(1),effectiveVersion:1};
  const reader={async readDetail(_target,read){calls.push(read.parameters.linePage);if(read.parameters.linePage===1)return detail(kind,1);started.resolve();return last.promise;}};
  const work=collectHistoryDocument(reader,target,{parameters:{documentId:id(1),linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200},signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:id(1)});
  await started.promise;
  const reason=new DOMException('Synthetic read cancellation','AbortError');
  if(action==='cancel-read')local.abort(reason);else scope.dispose();
  last.resolve(detail(kind,2));
  try{await assert.rejects(work,error=>error===signal.reason&&error.name==='AbortError');assert.deepEqual(calls,[1,2]);assert.equal(scope.active,action==='cancel-read');}
  finally{scope.dispose();}
 });
}
