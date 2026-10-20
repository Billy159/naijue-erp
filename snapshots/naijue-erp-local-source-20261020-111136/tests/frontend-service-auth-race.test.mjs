import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source = readFileSync(new URL('../frontend/service-client.js', import.meta.url), 'utf8');
const success = data => ({ok:true, status:200, json:async () => ({ok:true, data})});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve=yes;reject=no;});
  return {promise, resolve, reject};
}
function harness() {
  let actor='alice';
  const oldResponse=deferred(), parsed=deferred(), parsing=deferred(), calls=[], expirations=[], storage=new Map();
  const context={crypto:webcrypto, AbortController, URLSearchParams, setTimeout, clearTimeout, navigator:{onLine:true}};
  vm.createContext(context);vm.runInContext(source, context);
  const client=context.ERP_API.createClient({actor:()=>actor,stateScope:'qa-A',storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},onAuthExpired:m=>expirations.push(m),fetcher:async(url,opts)=>{
    calls.push({url,method:opts.method,csrf:opts.headers?.['X-CSRF-Token']});
    if(url==='/api/runtime/session')return success({csrfToken:'new-session-token',stateScope:'qa-A'});
    if(url==='/api/runtime/catalog'||url==='/api/runtime/command')return oldResponse.promise;
    if(url.startsWith('/api/requests/result'))return success({requestKey:'old-write',operationId:'sales.save',resolution:'NOT_FOUND'});
    return success({items:[]});
  }});
  return {client,calls,expirations,oldResponse,parsed,parsing,setActor:id=>{actor=id;},
    response:()=>({ok:false,status:401,json:()=>{parsing.resolve();return parsed.promise;}})};
}
async function login(h, change) {
  if(change==='actor')h.setActor('bob');
  await h.client.request('/runtime/session',{loginName:'synthetic',password:'synthetic'},{expire:false});
  h.client.configure({stateScope:'qa-A'}); // Same scope still starts a new trusted identity generation.
}
async function csrf(h) {
  await h.client.request('/runtime/work',{type:'logs',docId:'synthetic'},{mode:'query'});
  return h.calls.at(-1).csrf;
}
for(const change of ['actor','generation'])for(const malformed of [false,true])for(const timing of ['late-response','during-json']) {
  test(`${change} change preserves new login against ${malformed?'malformed':'valid'} 401 ${timing}`,async()=>{
    const h=harness(), read=h.client.request('/runtime/catalog');
    const rejected=assert.rejects(read,e=>e.code==='AUTH'&&e.stale===true);
    if(timing==='during-json'){h.oldResponse.resolve(h.response());await h.parsing.promise;}
    await login(h,change);
    if(timing==='late-response')h.oldResponse.resolve(h.response());
    if(malformed)h.parsed.reject(Error('synthetic malformed JSON'));
    else h.parsed.resolve({ok:false,error:{code:'SESSION_EXPIRED',message:'old session expired'}});
    await rejected;
    assert.equal(h.expirations.length,0);
    assert.equal(await csrf(h),'new-session-token');
    assert.equal(h.client.busy,false);
  });
}
for(const malformed of [false,true])test(`current identity ${malformed?'malformed':'valid'} 401 expires and clears CSRF`,async()=>{
  const h=harness();await login(h,'generation');
  const read=h.client.request('/runtime/catalog'), rejected=assert.rejects(read,e=>e.code==='AUTH'&&!e.stale);
  h.oldResponse.resolve(h.response());
  if(malformed)h.parsed.reject(Error('synthetic malformed JSON'));
  else h.parsed.resolve({ok:false,error:{code:'SESSION_EXPIRED',message:'current session expired'}});
  await rejected;
  assert.equal(h.expirations.length,1);assert.equal(await csrf(h),undefined);
});
for(const change of ['actor','generation'])test(`old malformed write 401 after ${change} change keeps original unknown request isolated`,async()=>{
  const h=harness();
  const write=h.client.request('/runtime/command',{documentId:'old-document',documentType:'SALE',operation:'save',requestKey:'old-write',body:{note:'private unsaved text'}});
  const rejected=assert.rejects(write,e=>e.code==='AUTH'&&e.stale&&e.requestId==='old-write');
  await login(h,change);h.oldResponse.resolve(h.response());h.parsed.reject(Error('malformed'));
  await rejected;assert.equal(h.expirations.length,0);assert.equal(await csrf(h),'new-session-token');
  if(change==='actor'){
    assert.equal(h.client.pending().length,0);
    await assert.rejects(h.client.result('old-write'),e=>e.code==='SCOPE');
    h.setActor('alice');h.client.configure({stateScope:'qa-A'});
  }
  assert.equal(h.client.pending()[0].requestId,'old-write');
  assert.equal(h.client.pending()[0].phase,'PENDING_VERIFICATION');
  assert.equal((await h.client.result('old-write')).resolution,'NOT_FOUND');
  assert.equal(h.client.pending().length,1);
  assert.equal(h.calls.filter(x=>x.url==='/api/runtime/command'&&x.method==='POST').length,1);
});
test('old rejected fetch after relogin retains write uncertainty without expiring the new session',async()=>{
  const h=harness();
  const write=h.client.request('/runtime/command',{documentId:'old-document',documentType:'SALE',operation:'save',requestKey:'old-write'});
  const rejected=assert.rejects(write,e=>e.code==='AUTH'&&e.stale&&e.requestId==='old-write');
  await login(h,'generation');h.oldResponse.reject(Error('old connection lost'));
  await rejected;assert.equal(h.expirations.length,0);assert.equal(await csrf(h),'new-session-token');
  assert.equal(h.client.pending()[0].phase,'PENDING_VERIFICATION');
});
