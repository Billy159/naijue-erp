import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductManagementHttpReader } from './http-reader.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { emptyProductFilter, productFilterParameters } from './contracts.ts';
import { HttpQueryError } from '../transport/http-query.ts';
const parameters = { filter: productFilterParameters(emptyProductFilter()), page: 1, pageSize: 100 as const };
const context = new ReadContext({ accountId:'test',sessionRevision:'1',permissionRevision:'1' });
const scope=context.createScope('http');
const read = <T>(parameters:T) => ({parameters,signal:scope.signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:null});
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}
test('construction is inert and independent product management endpoints use injected same-origin authenticated POST',async()=>{
  const calls:{url:unknown;init:RequestInit|undefined}[]=[];
  const reader=createProductManagementHttpReader({origin:'https://synthetic.test',basePath:'/api',fetch:async(url,init)=>{calls.push({url,init});return json(calls.length===1?{page:1,pageSize:100,exactTotal:0,items:[]}:{page:1,pageSize:20,exactTotal:0,items:[]});}});
  assert.equal(calls.length,0);await reader.readList(read(parameters));await reader.readCandidates(read({kind:'product',search:'coat',selectedIds:[],page:1,pageSize:20}));
  assert.equal(calls[0]!.url,'https://synthetic.test/api/product-management/query');assert.equal(calls[1]!.url,'https://synthetic.test/api/product-management/candidates/query');
  for(const call of calls){assert.equal(call.init?.method,'POST');assert.equal(call.init?.credentials,'same-origin');assert.equal(call.init?.cache,'no-store');assert.equal(call.init?.redirect,'error');}
});
test('malformed/truncated responses cannot become a successful zero or partial list; HTTP403 retains typed authority',async()=>{
  const invalid=createProductManagementHttpReader({origin:'https://synthetic.test',basePath:'/api',fetch:async()=>json({page:1,pageSize:100,exactTotal:1,items:[]})});
  await assert.rejects(()=>invalid.readList(read(parameters)),error=>error instanceof HttpQueryError&&error.kind==='malformed-response');
  const denied=createProductManagementHttpReader({origin:'https://synthetic.test',basePath:'/api',fetch:async()=>json({error:{code:'FORBIDDEN',message:'do not display raw policy'}},403)});
  await assert.rejects(()=>denied.readList(read(parameters)),error=>error instanceof HttpQueryError&&error.kind==='forbidden'&&error.message!=='do not display raw policy');
});
