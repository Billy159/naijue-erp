// Recovery test: original source is unavailable; contract extracted from retained 643 application.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRouteResources} from './route-resources.ts';
const pending=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('code and styles start concurrently and neither alone allows mount',async()=>{
 const code=pending(),styles=pending(),events=[],controller=new AbortController();let mounted=0;
 const ready=prepareRouteResources('sales',controller.signal,route=>{events.push(['code',route]);return code.promise;},(route,signal)=>{events.push(['styles',route]);assert.equal(signal,controller.signal);return styles.promise;}).then(()=>mounted++);
 await Promise.resolve();assert.deepEqual(events,[['code','sales'],['styles','sales']]);code.resolve();await Promise.resolve();assert.equal(mounted,0);styles.resolve();await ready;assert.equal(mounted,1);
});
test('already cancelled scope does not call either loader',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(prepareRouteResources('sales',controller.signal,async()=>{calls++;},async()=>{calls++;}),{name:'AbortError'});assert.equal(calls,0);
});
test('late uncooperative resources after route cancellation never mount stale page',async()=>{
 const code=pending(),styles=pending(),controller=new AbortController();let mounted=0;
 const ready=prepareRouteResources('sales',controller.signal,()=>code.promise,()=>styles.promise).then(()=>{mounted++;});
 await Promise.resolve();controller.abort();code.resolve();styles.resolve();await assert.rejects(ready,{name:'AbortError'});assert.equal(mounted,0);
});
