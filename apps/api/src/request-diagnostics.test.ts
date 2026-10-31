import test from 'node:test';import assert from 'node:assert/strict';import type {IncomingMessage} from 'node:http';
import Fastify from 'fastify';
import {createRequestDiagnostic,withRequestDiagnostic,observeRequestStage,installRequestDiagnostics,requestDiagnostic} from './request-diagnostics.ts';
test('diagnostic context preserves server ID across asynchronous work and emits only closed error codes',async()=>{
 const context=createRequestDiagnostic({url:'/api/product-management/query?SECRET',method:'POST'} as IncomingMessage);
 await withRequestDiagnostic(context,async()=>{await new Promise(r=>setImmediate(r));observeRequestStage('POOL_ACQUIRE',{code:'PG_POOL_OVERLOADED',message:'SECRET SQL PASSWORD'});observeRequestStage('SERIALIZE');});
 assert.equal(context.errorCode,'PG_POOL_OVERLOADED');assert.equal(context.failureStage,'POOL_ACQUIRE');assert.equal(context.poolRejections,1);assert.ok(!JSON.stringify(context).includes('SECRET'));
 const other=createRequestDiagnostic({url:'/api/private/SECRET',method:'POST'} as IncomingMessage);
 withRequestDiagnostic(other,()=>observeRequestStage('DB_QUERY',{code:'SECRET',message:'SECRET'}));assert.equal(other.routeTemplate,'OTHER');assert.equal(other.errorCode,'UNKNOWN_FAILURE');assert.ok(!JSON.stringify(other).includes('SECRET'));
});
test('Fastify diagnostic hooks retain pool failure stage and no caller request ID',async()=>{
 const app=Fastify({logger:false});installRequestDiagnostics(app);let context:ReturnType<typeof requestDiagnostic>;
 app.post('/product-management/query',async request=>{context=requestDiagnostic(request.raw);observeRequestStage('DB_QUERY',{code:'57014',message:'SECRET'});return {error:{code:'INTERNAL_ERROR',message:'SECRET'}};});
 const response=await app.inject({method:'POST',url:'/product-management/query',headers:{'x-request-id':'SECRET'},payload:{}});
 assert.equal(response.statusCode,200);assert.equal(context?.errorCode,'DB_TIMEOUT');assert.equal(context?.failureStage,'DB_QUERY');assert.equal(context?.stage,'SERIALIZE');assert.ok(!JSON.stringify(context).includes('SECRET'));await app.close();
});
test('known POST read templates are not mislabeled as writes',()=>{
 for(const route of ['/inventory/candidates/query','/sales/detail/query','/sales/references/query','/sales/history/query','/sales/settlement-statistics/query','/transfers/detail/query','/products/basics/query']){
  const context=createRequestDiagnostic({url:'/api'+route+'?PRIVATE',method:'POST'} as IncomingMessage);
  assert.equal(context.routeTemplate,route);assert.equal(context.operation,'READ');
 }
});
test('request rejection indicators do not count propagated error envelopes twice',()=>{
 const context=createRequestDiagnostic({url:'/api/product-management/query',method:'POST'} as IncomingMessage);
 withRequestDiagnostic(context,()=>{for(const stage of ['POOL_ACQUIRE','HANDLER','SERIALIZE'] as const){observeRequestStage(stage,{code:'PG_POOL_OVERLOADED'});observeRequestStage(stage,{code:'CAPACITY_ADMISSION_UNAVAILABLE'});}});
 assert.equal(context.poolRejections,1);assert.equal(context.admissionRejections,1);
});
