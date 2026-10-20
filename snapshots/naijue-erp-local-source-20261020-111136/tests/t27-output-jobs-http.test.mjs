import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {registerOutputRoutes} from '../dist/server/domain/outputs/http.js';

test('T27 export job HTTP endpoints return owner-scoped queryable progress',async t=>{
  const app=Fastify({logger:false}),calls=[];
  app.decorateRequest('identityToken',null);
  app.addHook('onRequest',async request=>{request.identityToken=String(request.headers['x-test-actor']||'owner');});
  app.setErrorHandler((error,_request,reply)=>reply.code(error.statusCode||500).send({ok:false,error:{code:error.code||'INTERNAL',message:error.message}}));
  app.decorate('identity',{execute:async(token,id,selection,work)=>{calls.push({token,id,selection});return work({actor:{id:token}});}});
  registerOutputRoutes(app);t.after(()=>app.close());
  const taskId=randomUUID();
  const started=await app.inject({method:'POST',url:'/api/outputs/export-jobs',headers:{'x-test-actor':'owner'},payload:{taskId,kind:'documents',totalUnits:30,requestKey:randomUUID()}});
  assert.equal(started.statusCode,200,started.body);assert.equal(started.json().data.status,'queued');
  const progress=await app.inject({method:'POST',url:`/api/outputs/export-jobs/${taskId}/progress`,headers:{'x-test-actor':'owner'},payload:{requestKey:randomUUID(),completedUnits:10,phase:'分批写入',status:'running',rows:{sheet1:14}}});
  assert.equal(progress.statusCode,200,progress.body);assert.equal(progress.json().data.completedUnits,10);
  const queried=await app.inject({method:'GET',url:`/api/outputs/export-jobs/${taskId}`,headers:{'x-test-actor':'owner'}});
  assert.equal(queried.statusCode,200);assert.equal(queried.json().data.rows.sheet1,14);
  const denied=await app.inject({method:'GET',url:`/api/outputs/export-jobs/${taskId}`,headers:{'x-test-actor':'other'}});
  assert.equal(denied.statusCode,404);assert.equal(denied.json().error.code,'NOT_FOUND');
  assert(calls.every(call=>call.id==='outputs.export'&&call.selection.kind==='export-task'));
});
