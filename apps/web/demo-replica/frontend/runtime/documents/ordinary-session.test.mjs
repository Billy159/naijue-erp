import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplicaSalesSession} from './sales-session.ts';
import {createReplicaTransferSession} from './transfers-session.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
function setup(factory,fetch){const reads=new ReadContext({accountId:id(30),sessionRevision:'1',permissionRevision:'1'});const runtime={auth:{getSnapshot:()=>({principal:{accountId:id(30),role:'ADMIN',hallId:null}})},reads,http:{origin:'https://erp.local',basePath:'/api',fetch},onAccessFailure:()=>{}};return factory(runtime,{instanceId:'ordinary-test',newRequestKey:()=>id(99),documentListProfile:'source-confirmed-ordinary-documents-v1'});}
for(const [kind,factory] of [['sales',createReplicaSalesSession],['transfers',createReplicaTransferSession]]){
 test(`${kind}: explicit ordinary mode is inert and refuses history ownership`,async()=>{let calls=0;const session=setup(factory,async()=>{calls++;throw Error('unexpected');});assert.equal(session.ordinary,true);await assert.rejects(session.historyOwner({kind,batchId:id(1),documentId:id(2),effectiveVersion:1}));assert.equal(calls,0);assert.equal(session.historyOwners.size,0);session.dispose();});
 test(`${kind}: ordinary page and independent totals requests do not include pagination in totals`,async()=>{const calls=[];const revision='a'.repeat(64);const session=setup(factory,async(url,init)=>{calls.push({url,body:JSON.parse(init.body),headers:new Headers(init.headers)});return Response.json(url.includes('/totals/')?{profile:'ORDINARY_DOCUMENT_TOTALS_V1',readRevision:revision,exactTotal:'0',totals:kind==='sales'?{quantity:'0',incomingQuantity:'0',outgoingQuantity:'0',grossAmount:'0',orderDiscount:'0',netDue:'0'}:{totalQuantity:'0'}}:{profile:'ORDINARY_DOCUMENT_LIST_V1',readRevision:revision,page:1,pageSize:20,exactTotal:'0',items:[]});});const filter={startDate:null,endDate:null,statuses:[],number:null,...(kind==='sales'?{businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[]}:{fromWarehouseIds:[],toWarehouseIds:[]})};const query=kind==='sales'?session.list.list:session.list;assert.equal((await query.run({filter,page:1,pageSize:20})).status,'success');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls.length,2);assert.deepEqual(calls[1].body,{filter,expectedRevision:revision});assert.equal(calls[0].headers.get('x-naijue-document-list'),'ordinary-v1');session.dispose();});
}

import {detail as transferDetail,result as transferResult} from '../../../../src/transfers/commands/fixtures.test-support.ts';
test('transfer committed mutation invalidates totals before failed detail refresh and cancels old page',async()=>{
 const revision='a'.repeat(64),filter={startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
 let detailReads=0,pageReads=0,finishOldPage;
 const wire={profile:'ORDINARY_DOCUMENT_LIST_V1',readRevision:revision,page:1,pageSize:20,exactTotal:'0',items:[]};
 const session=setup(createReplicaTransferSession,async(url,init)=>{
  if(url.endsWith('/transfers/commands'))return Response.json(transferResult(JSON.parse(init.body)));
  if(url.endsWith('/transfers/detail/query')){if(++detailReads>1)throw Error('refresh failed');return Response.json(transferDetail());}
  if(url.includes('/totals/'))return Response.json({profile:'ORDINARY_DOCUMENT_TOTALS_V1',readRevision:revision,exactTotal:'0',totals:{totalQuantity:'0'}});
  if(++pageReads>1)return new Promise(resolve=>{finishOldPage=()=>resolve(Response.json(wire));});
  return Response.json(wire);
 });
 await session.list.run({filter,page:1,pageSize:20});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(session.totals.getSnapshot().phase,'ready');
 await session.workspace.openExisting(id(1));
 const oldPage=session.list.run({filter,page:1,pageSize:20});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(await session.workspace.submit('APPROVE'),true);
 assert.equal(session.totals.getSnapshot().phase,'unknown');assert.equal(session.needsListRefresh,true);
 assert.equal(await session.workspace.readCurrent(),false);assert.equal(session.totals.getSnapshot().data,null);
 finishOldPage();assert.equal((await oldPage).status,'discarded');assert.equal(session.totals.getSnapshot().data,null);
 session.dispose();
});
for(const [kind,factory] of [['sales',createReplicaSalesSession],['transfers',createReplicaTransferSession]])test(`${kind}: pagination revalidates page and reuses only matching revision totals`,async()=>{
 let revision='a'.repeat(64);const calls=[];const filter={startDate:null,endDate:null,statuses:[],number:null,...(kind==='sales'?{businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[]}:{fromWarehouseIds:[],toWarehouseIds:[]})};
 const session=setup(factory,async(url,init)=>{const body=JSON.parse(init.body);calls.push(url);return Response.json(url.includes('/totals/')?{profile:'ORDINARY_DOCUMENT_TOTALS_V1',readRevision:revision,exactTotal:'0',totals:kind==='sales'?{quantity:'0',incomingQuantity:'0',outgoingQuantity:'0',grossAmount:'0',orderDiscount:'0',netDue:'0'}:{totalQuantity:'0'}}:{profile:'ORDINARY_DOCUMENT_LIST_V1',readRevision:revision,page:body.page,pageSize:body.pageSize,exactTotal:'0',items:[]});});
 const list=kind==='sales'?session.list.list:session.list;
 await list.run({filter,page:1,pageSize:20});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(session.totals.getSnapshot().phase,'ready');
 await list.run({filter,page:2,pageSize:50});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,3);assert.equal(calls.filter(url=>url.includes('/totals/')).length,1);
 revision='b'.repeat(64);await list.run({filter,page:1,pageSize:20});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls.length,5);assert.equal(session.totals.getSnapshot().readRevision,revision);session.dispose();
});
