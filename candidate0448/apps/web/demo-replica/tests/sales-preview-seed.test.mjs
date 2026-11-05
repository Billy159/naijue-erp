import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSalesChainFixture} from './sales-chain-fixture.mjs';
import {seedSalesPreview} from './sales-preview-seed.mjs';
import {qaSkus,qaWarehouses} from '../frontend/qa-reference-fixtures.mts';
test('opt-in preview uses real SAVE/APPROVE and replay preserves existing state',async t=>{
 const h=await createSalesChainFixture();t.after(()=>h.close());assert.equal(h.snapshot().headers.size,0);const initial=h.snapshot();
 const samples=await seedSalesPreview(h);assert.equal(samples.length,6);const state=h.snapshot();assert.equal(state.headers.size,6);assert.equal(new Set([...state.headers.values()].map(x=>x.number)).size,6,'each actual saved document needs a unique visible number');assert.equal(state.audit.length,9);assert.equal(state.receipts.size,9);
 for(const sample of samples){const header=state.headers.get(sample.salesId);assert.equal(header.status,sample.status);assert.equal(header.version,sample.status==='APPROVED'?2:1);assert.equal(header.businessType,sample.businessType);assert.equal(header.netDue,sample.businessType==='RETURN'?-23900n:23900n);const r=await h.request({url:'https://synthetic-management.invalid/api/sales/detail/query',method:'POST',body:JSON.stringify({salesId:sample.salesId})});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).document.header.id,sample.salesId);}
 const key=JSON.stringify([qaWarehouses[3].id,qaSkus[0].id]);assert.equal(state.balances.get(key).quantity,initial.balances.get(key).quantity-1n);assert.ok(state.ledger.length>=3);
 assert.deepEqual(await seedSalesPreview(h),samples);assert.deepEqual(h.snapshot(),state,'repeat seed cannot reset edits, balances or receipts');
 const first=samples.find(x=>x.status==='APPROVED');assert.equal((await h.command({action:'UNAPPROVE',salesId:first.salesId,expectedVersion:2,requestKey:'user-preview-unapprove'})).status,200);const changed=h.snapshot();await seedSalesPreview(h);assert.deepEqual(h.snapshot(),changed,'seed replay must preserve user actions');
});
