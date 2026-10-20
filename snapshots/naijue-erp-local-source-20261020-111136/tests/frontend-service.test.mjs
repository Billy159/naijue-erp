import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {LegacyClient} from '../frontend/legacy-adapter.mjs';

const source = readFileSync(new URL('../frontend/service-client.js', import.meta.url), 'utf8');
function harness(fetcher, extra = {}) {
  const storage = new Map(), saved = {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)};
  const context = {crypto: webcrypto, AbortController, URLSearchParams, setTimeout, clearTimeout, navigator: {onLine: true}};
  vm.createContext(context); vm.runInContext(source, context);
  let actor = 'alice';
  return {client: context.ERP_API.createClient({fetcher, storage: saved, actor: () => actor, ...extra}), context, storage, saved, setActor: id => {actor=id;}};
}
const success = data => ({ok: true, status: 200, json: async () => ({ok: true, data})});
const failure = (status, error) => ({ok: false, status, json: async () => ({ok: false, error})});
const command = {documentId: 'doc-1', documentType: 'SALE', operation: 'save', requestKey: 'request-1', body: {note: 'keep input'}};

test('remote origin uses relative /api and same-origin cookies for all consumers', async () => {
  const calls = [], h = harness(async (url, opts) => {calls.push({url,opts});return success({items: [], total: 0});});
  await h.client.request('/runtime/catalog');
  await h.client.request('/runtime/session', {loginName: 'test', password: 'not-persisted'}, {expire:false});
  await new LegacyClient(h.client).get('/reference/colors',{size:200});
  assert.deepEqual(calls.map(x=>x.url), ['/api/runtime/catalog','/api/runtime/session','/api/reference/colors?size=200']);
  assert(calls.every(x=>x.opts.credentials==='same-origin'));
  assert(![...h.storage.values()].join('').includes('not-persisted'));
});
test('external service and traversal paths are rejected before network access', async () => {
  const h = harness(() => assert.fail('network must not run'));
  for (const path of ['http://localhost/a','//localhost/a','/../secret','/%2e%2e/secret','/a\\b']) await assert.rejects(h.client.request(path),e=>e.code==='VALIDATION');
});
test('401 from shared reads expires login; forbidden preserves scope classification', async () => {
  const expired=[];const h=harness(async()=>failure(401,{code:'SESSION_EXPIRED',message:'expired'}),{onAuthExpired:m=>expired.push(m)});
  await assert.rejects(h.client.request('/reference/halls'),e=>e.code==='AUTH');assert.deepEqual(expired,['expired']);
  const malformed=harness(async()=>({ok:false,status:401,json:async()=>{throw Error('not JSON')}}),{onAuthExpired:m=>expired.push(m)});await assert.rejects(malformed.client.request('/reference/halls'),e=>e.code==='AUTH');assert.equal(expired.length,2);
  const forbidden=harness(async()=>failure(403,{code:'FORBIDDEN',message:'scope denied'}));
  await assert.rejects(forbidden.client.request('/runtime/catalog'),e=>e.code==='SCOPE'&&e.message==='scope denied');
});
test('wrong login credentials do not expire the app or become recoverable commands', async () => {
  const h=harness(async()=>failure(401,'invalid password'),{onAuthExpired:()=>assert.fail('login must not expire')});
  await assert.rejects(h.client.request('/runtime/session',{password:'private'},{expire:false}));assert.equal(h.client.pending().length,0);
});
test('version and idempotency conflict retain error code and latest authorized view', async () => {
  const h=harness(async()=>failure(409,{code:'VERSION_CONFLICT',message:'new version',latest:{version:2}}));
  await assert.rejects(h.client.request('/runtime/command',command),e=>e.code==='REVISION'&&e.latest.version===2);
  assert.equal(h.client.pending().length,0);
  const idem=harness(async()=>failure(409,{code:'IDEMPOTENCY_CONFLICT',message:'different body'}));
  await assert.rejects(idem.client.request('/runtime/command',command),e=>e.code==='IDEMPOTENCY');
});
test('lost command response is retained by original request identity; result query never POSTs', async () => {
  const calls=[];const h=harness(async(url,opts)=>{calls.push({url,opts});if(opts.method)throw Error('response lost');return success({requestKey:'request-1',operationId:'sales.save',resolution:'COMMITTED',documentId:'doc-1'});});
  await assert.rejects(h.client.request('/runtime/command',command),e=>e.code==='PENDING_VERIFICATION'&&e.requestId==='request-1');
  assert.equal(h.client.pending()[0].operationId,'sales.save');
  const result=await h.client.result('request-1');assert.equal(result.resolution,'COMMITTED');
  assert.equal(calls[0].opts.headers['X-Request-ID'],'request-1');assert.equal(calls[1].opts.method,undefined);
  assert.match(calls[1].url,/^\/api\/requests\/result\?requestKey=request-1&operationId=sales.save$/);
  assert.equal(calls.filter(x=>x.opts.method==='POST').length,1);
  assert(![...h.storage.values()].join('').includes('keep input')); // recovery index stores no business body
  h.client.complete('request-1');assert.equal(h.client.pending().length,0);
});
test('NOT_FOUND and PENDING_VERIFICATION cannot be interpreted as rollback', async () => {
  for(const resolution of ['NOT_FOUND','PENDING_VERIFICATION']){
    const h=harness(async(url,opts)=>opts.method?Promise.reject(Error('lost')):success({requestKey:'request-1',operationId:'sales.save',resolution}));
    await assert.rejects(h.client.request('/runtime/command',command));await h.client.result('request-1');assert.equal(h.client.pending().length,1);
  }
});
test('explicit rollback clears pending; mismatched request result stays pending', async () => {
  const h=harness(async(url,opts)=>opts.method?Promise.reject(Error('lost')):success({requestKey:'request-1',operationId:'sales.save',resolution:'ROLLED_BACK'}));
  await assert.rejects(h.client.request('/runtime/command',command));await h.client.result('request-1');assert.equal(h.client.pending().length,0);
  const wrong=harness(async(url,opts)=>opts.method?Promise.reject(Error('lost')):success({requestKey:'other',operationId:'sales.save',resolution:'COMMITTED'}));
  await assert.rejects(wrong.client.request('/runtime/command',command));await assert.rejects(wrong.client.result('request-1'),e=>e.code==='PROTOCOL');assert.equal(wrong.client.pending().length,1);
});
test('reload and actor switch isolate original requests', async () => {
  let calls=0;const h=harness(async()=>{calls++;throw Error('lost');});await assert.rejects(h.client.request('/runtime/command',command));
  const restored=h.context.ERP_API.createClient({fetcher:()=>assert.fail(),storage:h.saved,actor:()=> 'alice'});assert.equal(restored.pending()[0].requestId,'request-1');
  h.setActor('bob');assert.equal(h.client.pending().length,0);await assert.rejects(h.client.result('request-1'),e=>e.code==='SCOPE');assert.equal(calls,1);
  h.setActor('alice');assert.equal(h.client.pending().length,1);
});
test('late response after identity change cannot populate the next actor view', async () => {
  let done,expired=0;const h=harness(()=>new Promise(resolve=>{done=resolve;}),{onAuthExpired:()=>expired++});const read=h.client.request('/runtime/catalog');h.setActor('bob');done(success({private:'alice'}));
  await assert.rejects(read,e=>e.code==='AUTH');assert.equal(expired,0);
});
test('offline before dispatch is known unsubmitted; read timeout is connection; write timeout is unknown', async () => {
  const offline=harness(()=>assert.fail());offline.context.navigator.onLine=false;
  await assert.rejects(offline.client.request('/runtime/command',command),e=>e.code==='CONNECTION');assert.equal(offline.client.pending().length,0);
  const slow=()=>harness((url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('timeout')))),{timeoutMs:10});
  await assert.rejects(slow().client.request('/runtime/catalog'),e=>e.code==='CONNECTION');
  const writer=slow();await assert.rejects(writer.client.request('/runtime/command',command),e=>e.code==='PENDING_VERIFICATION');assert.equal(writer.client.busy,false);
});
test('invalid JSON and HTTP 5xx on a write remain unknown; explicit rollback is definite', async () => {
  for(const fetcher of [async()=>({ok:true,status:200,json:async()=>{throw Error('invalid JSON')}}),async()=>failure(503,'proxy failed')]){
    const h=harness(fetcher);await assert.rejects(h.client.request('/runtime/command',command),e=>e.code==='PENDING_VERIFICATION');assert.equal(h.client.pending().length,1);
  }
  const rolled=harness(async()=>failure(500,{code:'ROLLED_BACK',message:'transaction rolled back'}));await assert.rejects(rolled.client.request('/runtime/command',command),e=>e.code==='ROLLED_BACK');assert.equal(rolled.client.pending().length,0);
});
test('query POSTs have no command side effects and busy spans actual transport completion', async () => {
  let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));const read=h.client.request('/runtime/work',{type:'logs',docId:'doc-1'});
  assert.equal(h.client.busy,true);assert.equal(h.client.pending().length,0);resolve(success({items:[]}));await read;assert.equal(h.client.busy,false);
});
test('known command remains recoverable until dependent readback completes', async () => {
  const h=harness(async()=>success({document:{id:'doc-1'}}));await h.client.request('/runtime/command',command,{readback:true});
  assert.equal(h.client.pending()[0].phase,'READBACK_PENDING');h.client.complete('request-1');assert.equal(h.client.pending().length,0);
});
test('another click cannot send a new key for the same unresolved operation', async () => {
  let calls=0;const h=harness(async()=>{calls++;throw Error('lost')});
  await assert.rejects(h.client.request('/runtime/command',command));
  await assert.rejects(h.client.request('/runtime/command',{...command,requestKey:'new-key'}),e=>e.requestId==='request-1'&&e.code==='PENDING_VERIFICATION');
  assert.equal(calls,1);
});
test('reload treats interrupted SUBMITTING as unknown and does not dispatch it', () => {
  const h=harness(()=>assert.fail());
  h.saved.setItem('erp-api-requests-v1:alice',JSON.stringify([{actorId:'alice',requestId:'interrupted',operationId:'sales.save',phase:'SUBMITTING'}]));
  assert.equal(h.client.pending()[0].phase,'PENDING_VERIFICATION');
});
