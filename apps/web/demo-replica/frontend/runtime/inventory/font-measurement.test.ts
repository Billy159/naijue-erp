import test from 'node:test';import assert from 'node:assert/strict';import {observeInventoryFontGeometry} from './font-measurement.ts';
function fixture(status='loaded'){
 let resolve!:(value:unknown)=>void,reject!:(error:Error)=>void;const ready=new Promise((a,b)=>{resolve=a;reject=b;});const events=new Map<string,Set<()=>void>>(),frames=new Map<number,()=>void>();let serial=0,hits=0;
 const fonts={status,ready,addEventListener(type:string,fn:()=>void){const set=events.get(type)??new Set();set.add(fn);events.set(type,set);},removeEventListener(type:string,fn:()=>void){events.get(type)?.delete(fn);}};
 const stop=observeInventoryFontGeometry(fonts,fn=>{frames.set(++serial,fn);return serial;},id=>{frames.delete(id);},()=>hits++);
 return{stop,resolve,reject,frames,emit(type:string){for(const fn of events.get(type)??[])fn();},flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},get hits(){return hits;},get listeners(){return [...events.values()].reduce((sum,set)=>sum+set.size,0);}};
}
test('already loaded ready does not schedule redundant initial measurement',async()=>{const f=fixture();f.resolve(null);await Promise.resolve();assert.equal(f.frames.size,0);f.stop();assert.equal(f.listeners,0);});
test('done/error events coalesce one epoch per frame',()=>{const f=fixture();f.emit('loadingdone');f.emit('loadingerror');assert.equal(f.frames.size,1);f.flush();assert.equal(f.hits,1);f.emit('loadingdone');f.flush();assert.equal(f.hits,2);f.stop();});
test('initial inflight ready and rejected ready each invalidate once',async()=>{for(const failed of [false,true]){const f=fixture('loading');failed?f.reject(Error('synthetic')):f.resolve(null);await Promise.resolve();f.flush();assert.equal(f.hits,1);f.stop();}});
test('cleanup blocks captured callback and later ready, removes listeners',async()=>{const f=fixture('loading');f.emit('loadingdone');const captured=[...f.frames.values()][0]!;f.stop();assert.equal(f.frames.size,0);captured();f.resolve(null);await Promise.resolve();f.emit('loadingerror');assert.equal(f.hits,0);assert.equal(f.listeners,0);});
test('independent owners and repeated setup/dispose retain only live subscriptions',()=>{const a=fixture(),b=fixture();a.stop();a.emit('loadingdone');b.emit('loadingdone');a.flush();b.flush();assert.equal(a.hits,0);assert.equal(b.hits,1);b.stop();b.stop();assert.equal(b.listeners,0);});
test('missing font API is a no-op',()=>{let hits=0;observeInventoryFontGeometry(undefined,()=>{hits++;return 1;},()=>hits++,()=>hits++)();assert.equal(hits,0);});
