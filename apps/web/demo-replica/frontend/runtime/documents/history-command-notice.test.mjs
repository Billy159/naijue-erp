/** CUA regression: a rejected empty reason must not outlive a later valid submit.
 * Original HTTP/service with finite memory only, not PostgreSQL or production. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnifiedServiceFixture} from '../../../tests/unified-service-fixture.mjs';
import {createHistoryReader,collectHistoryDocument} from './history-reader.ts';
import {HistoryTransferModel} from './history-transfer-model.ts';
import {HistoryRevisionOwner} from './history-revision.ts';
import {ReadScope} from '../../../../src/loading/read-scope.ts';
const id=n=>`74000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function setup(t){
 const h=await createUnifiedServiceFixture({syntheticHistory:true});t.after(()=>h.close());
 const target=h.history.target,scope=new ReadScope({accountId:h.product.actor.accountId,sessionRevision:'1',permissionRevision:'1'},'history-notice',target.documentId,()=>{});t.after(()=>scope.dispose());
 const fetch=async(url,init={})=>{const r=await h.request({url:String(url),method:init.method??'GET',headers:Object.fromEntries(new Headers(init.headers)),...(init.body===undefined?{}:{body:String(init.body)})});return new Response(r.body,{status:r.status,headers:r.headers});};
 const complete=await collectHistoryDocument(createHistoryReader({origin:h.origin,basePath:'/api',fetch}),target,{parameters:{documentId:target.documentId,linePage:1,linePageSize:200,settlementPage:1,settlementPageSize:200},signal:scope.signal});
 return {h,target,scope,fetch,model:new HistoryTransferModel(scope,complete)};
}

for(const outcome of ['committed','rejected'])test('empty reason → cancel/no edit → valid '+outcome+' clears old validation before dispatch, preserves original state and sends once',async t=>{
 const {h,target,scope,fetch,model}=await setup(t),source=h.history.snapshot().source,inventory=h.inventory.snapshot(),before=structuredClone(model.getSnapshot().complete);
 const started=deferred(),finish=deferred(),bodies=[];let denied=0;
 const owner=new HistoryRevisionOwner({scope,target,http:{origin:h.origin,basePath:'/api',fetch:async(url,init)=>{assert.equal(model.getSnapshot().notice,null,'Old validation must clear BEFORE owner HTTP dispatch');bodies.push(JSON.parse(init.body));started.resolve();await finish.promise;return fetch(url,init);}},denied:()=>{denied++;}});
 assert.equal(model.command('No changes',()=>id(1)),null);assert.match(model.getSnapshot().notice,/无需保存/);assert.equal(bodies.length,0);
 model.setNote('SYNTHETIC CUA reason recovery');const retained=structuredClone(model.getSnapshot().input);
 assert.equal(model.command('',()=>id(2)),null);assert.match(model.getSnapshot().notice,/未发送请求/);assert.equal(bodies.length,0);assert.equal(model.getSnapshot().dirty,true);assert.deepEqual(model.getSnapshot().input,retained);
 // Cancelling/reopening the reason dialog changes only page state, not the model.
 const command=model.command('SYNTHETIC valid reason after cancel',()=>id(3));assert.ok(command);assert.equal(model.getSnapshot().notice,null);assert.deepEqual(model.getSnapshot().input,retained);assert.equal(model.getSnapshot().dirty,true);assert.deepEqual(model.getSnapshot().complete,before);
 assert.equal(command.expectedVersion,1);assert.equal(command.requestKey,id(3));assert.equal(command.header.note,retained.note);
 const pending=owner.submit(command);await started.promise;assert.equal(owner.getSnapshot().phase,'submitting');assert.equal(model.getSnapshot().notice,null);assert.equal(bodies.length,1);assert.deepEqual(bodies[0],command);
 if(outcome==='rejected')h.history.revoke();finish.resolve();assert.equal(await pending,outcome==='committed');assert.equal(owner.getSnapshot().phase,outcome);assert.equal(model.getSnapshot().notice,null);assert.deepEqual(model.getSnapshot().input,retained);assert.deepEqual(model.getSnapshot().complete,before);assert.equal(bodies.length,1);
 assert.equal(h.history.snapshot().revisions.length,outcome==='committed'?1:0);assert.equal(h.history.snapshot().current.version,outcome==='committed'?2:1);assert.equal(denied,outcome==='rejected'?1:0);assert.deepEqual(h.history.snapshot().source,source);assert.deepEqual(h.inventory.snapshot(),inventory);
 assert.match(owner.getSnapshot().notice,outcome==='committed'?/修订已确认/:/未被接受/);if(outcome==='committed')assert.deepEqual(owner.getSnapshot().receipt.ledgerEntryIds,[]);
});
