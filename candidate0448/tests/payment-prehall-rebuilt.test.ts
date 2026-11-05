/** New reconstruction tests; no assertion of equivalence to lost candidates. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCurrentSalesReferenceQuery} from '../packages/application/src/current-form-validation.ts';
import {ReadContext} from '../apps/web/src/loading/read-scope.ts';
import {SalesProposalSession} from '../apps/web/src/current-form/sales-proposal.ts';
import {readFile} from 'node:fs/promises';
const {verifyHistoricalInputBytes}=await import(new URL('./historical-runtime26/oracle.mjs',import.meta.url).href);
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const query={kind:'paymentMethod',hallId:null,search:'',page:1,pageSize:20};
test('explicit null method only; absent/fake hall and account without hall fail closed',()=>{
 assert.deepEqual(parseCurrentSalesReferenceQuery(query),query);
 for(const bad of [{...query,hallId:undefined},{...query,hallId:'fake'},{...query,paymentMethodId:id(2)},
 {...query,kind:'customer'},{...query,kind:'warehouse'},{...query,kind:'paymentAccount',paymentMethodId:id(2)},
 {...query,search:' trim '},{...query,pageSize:200},{...query,page:'1'}])assert.throws(()=>parseCurrentSalesReferenceQuery(bad));
 const {hallId,...missing}=query;assert.throws(()=>parseCurrentSalesReferenceQuery(missing));
});
test('prehall inline method and amount retained on first hall; accounts scoped; subsequent hall reset remains required',async()=>{
 const ctx=new ReadContext({accountId:id(99),sessionRevision:'REBUILT',permissionRevision:'REBUILT'}),scope=ctx.createScope('sales');
 const ref=(n:number,more={})=>({id:id(n),name:'SYNTHETIC',code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null,...more});
 const halls=[ref(1,{hallId:id(1),hallName:'H1'}),ref(2,{hallId:id(2),hallName:'H2'})],method=ref(3),calls:any[]=[];
 const reader={async readSalesReferences(q:any){calls.push(q);const items=q.kind==='hall'?halls:q.kind==='paymentMethod'?[method]:[ref(4,{paymentMethodId:method.id,paymentMethodName:method.name})];return {page:1,pageSize:20,exactTotal:BigInt(items.length),items};},async readProducts(){throw Error('unexpected product query');},async readProductSkus(){throw Error('unexpected sku query');}};
 const session=new SalesProposalSession(scope,reader as never);
 try{
  await session.openPaymentPicker(null,'paymentAccount');assert.equal(calls.length,0);
  await session.openPaymentPicker(null,'paymentMethod');assert.equal(calls[0].hallId,null);assert.equal(await session.select(method.id),true);
  const key=session.getSnapshot().draft.settlements[0]!.key;session.updateSignedSettlement(key,'12.34');
  await session.openPaymentPicker(key,'paymentAccount');assert.equal(calls.length,1);assert.equal(session.saveProposal(null),null);
  await session.openPicker('hall');assert.equal(await session.select(halls[0]!.id),true);
  assert.equal(session.getSnapshot().draft.settlements[0]!.amount,'12.34');assert.equal(session.getSnapshot().draft.settlements[0]!.method?.id,method.id);
  await session.openPaymentPicker(key,'paymentAccount');assert.equal(calls.at(-1).hallId,id(1));assert.equal(calls.at(-1).paymentMethodId,method.id);session.closePicker();
  await session.openPicker('hall');assert.equal(await session.select(halls[1]!.id),false);assert.equal(session.getSnapshot().draft.hall?.id,id(1));
  session.closePicker();await session.openPaymentPicker(key,'paymentMethod');session.closePicker();assert.equal(session.getSnapshot().picker,null);
 }finally{scope.dispose();}
});
test('retained original contracts still match frozen original oracle pins',async()=>{
 for(const leaf of ['current-form-ports','current-form-validation'])assert.equal(await verifyHistoricalInputBytes('packages/application/src/'+leaf+'.ts',await readFile(new URL('./historical-runtime26/fixtures/'+leaf+'.original.txt',import.meta.url))),true);
});
test('prehall method cancellation, superseding search and access revocation do not revive stale state',async()=>{
 const ctx=new ReadContext({accountId:id(99),sessionRevision:'REBUILT',permissionRevision:'REBUILT'}),scope=ctx.createScope('sales');
 const pending:{signal:AbortSignal,resolve:(x:any)=>void}[]=[];
 const session=new SalesProposalSession(scope,{readSalesReferences:(_q:any,signal:AbortSignal)=>new Promise(resolve=>pending.push({signal,resolve})),readProducts:async()=>{throw Error('unused');},readProductSkus:async()=>{throw Error('unused');}} as never);
 const page=(n:number)=>({page:1,pageSize:20,exactTotal:1n,items:[{id:id(n),name:'SYNTHETIC',code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null}]});
 const first=session.openPaymentPicker(null,'paymentMethod');session.closePicker();assert.equal(pending[0]!.signal.aborted,true);pending[0]!.resolve(page(1));await first;assert.equal(session.getSnapshot().picker,null);
 const old=session.openPaymentPicker(null,'paymentMethod'),latest=session.search('latest');assert.equal(pending[1]!.signal.aborted,true);pending[2]!.resolve(page(2));await latest;pending[1]!.resolve(page(1));await old;assert.equal(session.getSnapshot().picker?.result?.items[0]!.id,id(2));
 const departed=session.openPaymentPicker(null,'paymentMethod');ctx.clear();pending[3]!.resolve(page(3));await departed;assert.equal(session.getSnapshot().disposed,true);assert.equal(session.getSnapshot().picker,null);assert.equal(session.getSnapshot().draft.settlements.length,0);
});
test('prehall forbidden method read disposes scope rather than supplying fallback',async()=>{
 const {HttpQueryError}=await import('../apps/web/src/transport/http-query.ts');
 const ctx=new ReadContext({accountId:id(99),sessionRevision:'REBUILT',permissionRevision:'REBUILT'}),scope=ctx.createScope('sales');
 const session=new SalesProposalSession(scope,{async readSalesReferences(){throw new HttpQueryError('forbidden','FORBIDDEN',403);}} as never);
 await session.openPaymentPicker(null,'paymentMethod');assert.equal(scope.active,false);assert.equal(session.getSnapshot().disposed,true);assert.equal(session.getSnapshot().draft.settlements.length,0);
});
