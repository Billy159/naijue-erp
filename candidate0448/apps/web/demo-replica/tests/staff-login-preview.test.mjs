/** PREVIEW ALIGNMENT only: synthetic source rows, not native service/SQL/live data proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsPreviewTransport} from '../frontend/runtime/settings/synthetic-preview-transport.ts';
import {QA_REFERENCE_PROFILE,qaStaff} from '../frontend/qa-reference-fixtures.mts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q={search:'',status:'all',hallId:null,page:1,pageSize:20};
async function request(transport,body,path='/staff/query'){
 const response=await transport.request('https://synthetic-management.invalid/api'+path,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
 return {status:response.status,headers:response.headers,body:await response.json()};
}
async function list(transport,body){const r=await request(transport,body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.headers.get('cache-control'),'no-store');return r.body;}
const ids=rows=>rows.map(row=>row.id);
// Declared source fixtures. No HTTP success response is rewritten to manufacture membership.
const h1={id:id(1),name:'H1',enabled:true},h2={id:id(2),name:'H2',enabled:true};
const staff=(n,name,enabled,employmentStatus='在职',role='SALESPERSON',hall=h1)=>({kind:'STAFF',id:id(100+n),version:1,createdAt:null,updatedAt:null,name,role,hall,contact:null,employmentStatus,
 account:enabled===null?null:{id:id(1000+n),loginName:`source-${name}`,loginEnabled:enabled,authVersion:1,version:1}});
const rows=[staff(1,'a-open',true),staff(2,'b-closed',false),staff(3,'c-no-account',null),staff(4,'d-left-closed',false,'离职'),staff(5,'e-left-no-account',null,'离职'),staff(6,'f-warehouse-closed',false,'在职','WAREHOUSE'),staff(7,'g-other-hall-closed',false,'在职','SALESPERSON',h2)];
test('preview default source CLOSED is existing false only, with actual generated true/null samples and strict contracts preserved',async()=>{
 const transport=createSettingsPreviewTransport(),base=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const expectedClosed=[2,5,8,11,13,14,17,20,23].map(n=>base(8100+n));
 for(const withRole of [false,true]){
  const closed=await list(transport,{...q,...(withRole?{role:''}:{}),loginStatus:'closed'});assert.deepEqual(ids(closed.items),expectedClosed);assert.equal(closed.total,9);assert.ok(closed.items.every(row=>row.account!==null&&row.account.loginEnabled===false));
 }
 const open=await list(transport,{...q,loginStatus:'open'});assert.deepEqual(ids(open.items),[1,4,7,10,16,19,22].map(n=>base(8100+n)));assert.equal(open.total,7);
 const all1=await list(transport,q),all2=await list(transport,{...q,page:2});assert.equal(all1.total,25);assert.equal(all1.items.length,20);assert.equal(all2.items.length,5);assert.equal([...all1.items,...all2.items].filter(row=>row.account===null).length,9);
 const qa=createSettingsPreviewTransport(QA_REFERENCE_PROFILE);assert.equal((await list(qa,{...q,loginStatus:'closed'})).total,0);const qaOpen=await list(qa,{...q,loginStatus:'open'});assert.equal(qaOpen.total,qaStaff.length);assert.deepEqual(new Set(ids(qaOpen.items)),new Set(ids(qaStaff)));assert.ok(qaOpen.items.every(row=>row.account?.loginEnabled===true));
 for(const body of [{...q,loginStatus:'unopened'},{...q,loginStatus:null},{...q,loginStatus:'closed',extra:true}])assert.equal((await request(transport,body)).status,400);
 assert.equal((await request(transport,{...q,loginStatus:'closed'},'/accounts/query')).status,400);
 assert.equal(transport.canHandle('/staff/commands','POST'),false);assert.equal(transport.canHandle('/staff/receipts/key','GET'),false);
});
test('preview provider CLOSED composes literal name/login search, employment, hall and role without changing source/null projections',async()=>{
 const before=structuredClone(rows),transport=createSettingsPreviewTransport(QA_REFERENCE_PROFILE,kind=>kind==='STAFF'?rows:undefined);
 const cases=[
  [{...q},['a-open','b-closed','c-no-account','d-left-closed','e-left-no-account','f-warehouse-closed','g-other-hall-closed']],
  [{...q,loginStatus:'open'},['a-open']],
  [{...q,loginStatus:'closed'},['b-closed','d-left-closed','f-warehouse-closed','g-other-hall-closed']],
  [{...q,loginStatus:'closed',status:'normal',role:'SALESPERSON',hallId:h1.id},['b-closed']],
  [{...q,loginStatus:'closed',status:'disabled',role:'SALESPERSON',hallId:h1.id},['d-left-closed']],
  [{...q,loginStatus:'closed',role:'SALESPERSON',hallId:h1.id},['b-closed','d-left-closed']],
  [{...q,loginStatus:'closed',role:'SALESPERSON',hallId:h2.id},['g-other-hall-closed']],
  [{...q,loginStatus:'closed',role:'WAREHOUSE',hallId:h1.id},['f-warehouse-closed']],
  [{...q,loginStatus:'closed',role:'ADMIN'},[]],
  [{...q,loginStatus:'closed',search:'SOURCE-B-CLOSED'},['b-closed']],
  [{...q,loginStatus:'closed',search:"%' OR true --"},[]],
 ];
 for(const [query,names] of cases){const result=await list(transport,query);assert.equal(result.total,names.length);assert.deepEqual(result.items.map(row=>row.name),names);if(query.loginStatus==='closed')assert.ok(result.items.every(row=>row.account?.loginEnabled===false));}
 const absent=rows[2],detail=await request(transport,{id:absent.id},'/staff/detail/query');assert.equal(detail.status,200);assert.deepEqual(detail.body,absent);assert.equal(detail.body.account,null);assert.deepEqual(rows,before);
});
test('preview CLOSED count and stable display/id pagination use the same 21 approved matches, not client-side filtering',async()=>{
 const disabled=Array.from({length:21},(_,n)=>staff(200+n,'same-name',false)),source=[staff(300,'same-name',true),staff(301,'same-name',null),...disabled.slice().reverse()];
 const before=structuredClone(source),transport=createSettingsPreviewTransport(undefined,kind=>kind==='STAFF'?source:undefined);
 for(const withRole of [false,true])for(const page of [1,2,3]){const result=await list(transport,{...q,...(withRole?{role:'SALESPERSON'}:{}),loginStatus:'closed',page});assert.equal(result.total,21);assert.equal(result.page,page);assert.deepEqual(ids(result.items),ids(disabled.slice((page-1)*20,page*20)));}
 assert.deepEqual(source,before);
});
