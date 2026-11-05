import test from 'node:test';
import assert from 'node:assert/strict';
import {createStandard27CapacityLifecycle} from '../adapters/postgres/src/standard27-product-capacity-lifecycle.ts';
const completion={kind:'PRODUCT',action:'CREATE',targetId:'p',operationId:'o',actorAccountId:'a',requestKey:'k',requestHash:'a'.repeat(64),oldVersion:null,newVersion:1,beforeValues:null,afterValues:{id:'p',version:1},completedAt:'2026-11-04T00:00:00Z'} as const;
function latch(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}
test('admission closes before precommit await and a swallowed late invocation poisons commit',async()=>{
 const gate=latch(),entered=latch();let readyCalls=0,completedChecks=0;
 const lifecycle=createStandard27CapacityLifecycle(async()=>{},async()=>{if(++readyCalls===2){entered.release();await gate.promise;}},()=>{completedChecks++;});
 await lifecycle.invoke(completion);
 const commit=lifecycle.precommit();await entered.promise;
 await assert.rejects(lifecycle.invoke(completion)); // Caller deliberately swallows this rejection.
 gate.release();await assert.rejects(commit);
 assert.equal(completedChecks,1);
});
test('successful precommit rechecks exact completion after async readiness and cannot replay',async()=>{
 const fingerprints:string[]=[];const lifecycle=createStandard27CapacityLifecycle(async()=>{},async()=>{},fingerprint=>{fingerprints.push(fingerprint);});
 await lifecycle.invoke(completion);await lifecycle.precommit();
 assert.equal(fingerprints.length,2);assert.equal(fingerprints[0],fingerprints[1]);
 await assert.rejects(lifecycle.precommit());await assert.rejects(lifecycle.invoke(completion));
});
test('completion drift during precommit is caught after the final await',async()=>{
 let checks=0,changed=false,readyCalls=0;
 const lifecycle=createStandard27CapacityLifecycle(async()=>{},async()=>{if(++readyCalls===2)changed=true;},()=>{checks++;assert.equal(changed,false);});
 await lifecycle.invoke(completion);await assert.rejects(lifecycle.precommit());assert.equal(checks,2);
});
test('swallowed failed admission and missing admission cannot commit',async()=>{
 const failed=createStandard27CapacityLifecycle(async()=>{throw Error('consumer rejected');},async()=>{},()=>{});
 await assert.rejects(failed.invoke(completion));await assert.rejects(failed.precommit());
 const empty=createStandard27CapacityLifecycle(async()=>{},async()=>{},()=>{});
 await assert.rejects(empty.precommit());await assert.rejects(empty.invoke(completion));
});
test('precommit while consumer is pending closes and poisons both paths',async()=>{
 const gate=latch(),entered=latch();const lifecycle=createStandard27CapacityLifecycle(async()=>{entered.release();await gate.promise;},async()=>{},()=>{});
 const pending=lifecycle.invoke(completion);await entered.promise;
 await assert.rejects(lifecycle.precommit());gate.release();await assert.rejects(pending);
});
