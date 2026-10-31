import test from 'node:test';import assert from 'node:assert/strict';
import {createReadinessProbe} from './readiness-probe.ts';
const deferred=()=>{let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise<void>(r=>setImmediate(r));
test('bounded waiters and cancellation preserve other readers, no positive cache',async()=>{
 let work=deferred(),calls=0;const probe=createReadinessProbe(async()=>{calls++;return work.promise;},()=>false,{timeoutMs:1000,maxWaiters:2});
 const controller=new AbortController(),a=probe(controller.signal),b=probe();assert.equal(await probe(),false);controller.abort();assert.equal(await a,false);
 await tick();assert.equal(calls,1);work.resolve(true);assert.equal(await b,true);
 work=deferred();const fresh=probe();await tick();assert.equal(calls,2);work.resolve(false);assert.equal(await fresh,false);
});
test('deadline keeps physical slot until settlement and cannot admit late success',async()=>{
 const work=deferred();let calls=0,signal:AbortSignal|undefined;
 const probe=createReadinessProbe(async s=>{signal=s;calls++;return work.promise;},()=>false,{timeoutMs:15,maxWaiters:2});
 assert.equal(await probe(),false);assert.equal(signal?.aborted,true);assert.equal(await probe(),false);assert.equal(calls,1);
 work.resolve(true);await tick();assert.equal(calls,1);
});
test('all cancelled and closing reject without releasing physical worker early',async()=>{
 let closing=false,calls=0;const work=deferred();const probe=createReadinessProbe(async()=>{calls++;return work.promise;},()=>closing,{timeoutMs:100,maxWaiters:2});
 const controller=new AbortController(),pending=probe(controller.signal);await tick();controller.abort();assert.equal(await pending,false);assert.equal(await probe(),false);assert.equal(calls,1);work.resolve(true);await tick();
 closing=true;assert.equal(await probe(),false);assert.equal(calls,1);
});
