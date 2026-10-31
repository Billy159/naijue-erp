/** Original browser HTTP clients → original Fastify/native preparation → original
 * TransferService memory SAVE. No skipped preparation, socket, fake200 or PG proof.
 * Preparation author has NOT imported/executed this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransferChainFixture} from './transfer-chain-fixture.mjs';
import {qaPrincipal,qaStaff,qaSkus,qaWarehouses} from '../frontend/qa-reference-fixtures.mts';
import {createTransferPreparationHttpClient} from '../../src/current-form/transfer-create.ts';
import {createTransferExistingPreparationHttpClient} from '../../src/current-form/existing-document-preparation.ts';
import {createTransferCommandHttpClient} from '../../src/transfers/commands/http-client.ts';
import {createTransferHttpReader} from '../../src/transfers/http-reader.ts';
import {ReadContext} from '../../src/loading/read-scope.ts';
import {entityId} from '../../../../packages/domain/src/values.ts';

async function fixture(t){
 const chain=await createTransferChainFixture({responsibleStaffValidation:true});t.after(()=>chain.close());const calls=[];
 const http={origin:'https://synthetic-management.invalid',basePath:'/api',fetch:async(url,init)=>{
  const entry={path:new URL(url).pathname,method:init.method??'GET',body:init.body?JSON.parse(String(init.body)):null};calls.push(entry);
  assert.equal(init.credentials,'same-origin');
  const response=await chain.request({url,method:entry.method,headers:Object.fromEntries(new Headers(init.headers)),...(init.body?{body:String(init.body)}:{})});entry.status=response.status;
  // Forward the original HTTP provider's exact body/status, never synthesize success.
  return new Response(response.body,{status:response.status,headers:response.headers});
 }};
 return {chain,http,calls,prepare:createTransferPreparationHttpClient(http),existing:createTransferExistingPreparationHttpClient(http),commands:createTransferCommandHttpClient(http)};
}
const signal=()=>new AbortController().signal;
const intent=responsibleStaffId=>({businessDate:'2026-10-31',note:'original clients prepare responsibility',fromWarehouseId:qaWarehouses[3].id,toWarehouseId:qaWarehouses[2].id,responsibleStaffId,lines:[{skuId:qaSkus[0].id,quantity:'2'}]});

test('actual browser preparation client preserves selected staff through NEW and existing prepare→SAVE→readback',async t=>{
 const h=await fixture(t),initial=h.chain.snapshot(),selected=qaStaff[1],proposal=intent(selected.id);
 const prepared=await h.prepare.prepareCreate(proposal,signal());assert.equal(prepared.header.responsibleStaffId,selected.id);assert.deepEqual(h.chain.snapshot(),initial,'NEW prepare has no business mutation');
 assert.deepEqual(h.calls.map(row=>row.path),['/api/transfers/prepare-create']);assert.deepEqual(h.calls[0].body,proposal);assert.equal(h.calls[0].status,200);
 for(const key of ['createdByAccountId','createdBy','createdAt','createdRole','createdHallId'])assert.equal(Object.hasOwn(prepared.header,key),false);
 const create={action:'SAVE',expectedVersion:null,requestKey:'client-prepared-responsible-new',draft:prepared},saved=await h.commands.execute(create,signal());assert.equal(saved.version,1);
 const original=h.chain.snapshot().transfers.get(saved.transferId).document;assert.equal(original.header.responsibleStaffId,selected.id);assert.equal(original.header.createdByAccountId,qaPrincipal.accountId);
 const existing={...proposal,responsibleStaffId:qaPrincipal.staffId,transferId:saved.transferId,expectedVersion:1,lines:original.lines.map(row=>({existingLineId:row.id,skuId:row.skuId,quantity:row.quantity.toString()}))},beforePrepare=h.chain.snapshot();
 const changed=await h.existing.prepareExisting(existing,signal());assert.equal(changed.expectedVersion,1);assert.equal(changed.draft.header.responsibleStaffId,qaPrincipal.staffId);assert.deepEqual(h.chain.snapshot(),beforePrepare,'existing prepare has no business mutation');
 const edit={action:'SAVE',expectedVersion:changed.expectedVersion,requestKey:'client-prepared-responsible-edit',draft:changed.draft},result=await h.commands.execute(edit,signal());assert.equal(result.version,2);
 assert.deepEqual(h.calls.slice(0,4).map(row=>row.path),['/api/transfers/prepare-create','/api/transfers/commands','/api/transfers/prepare-existing','/api/transfers/commands']);
 const reads=new ReadContext({accountId:qaPrincipal.accountId,sessionRevision:'source-only-test',permissionRevision:'source-only-test'});t.after(()=>reads.clear());const scope=reads.createScope('prepared-responsible-readback');
 const detail=await createTransferHttpReader(h.http).readDetail({identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:saved.transferId,signal:scope.signal,parameters:{transferId:entityId('transfer',saved.transferId)}});
 assert.equal(detail.document.header.responsibleStaffId,qaPrincipal.staffId);assert.equal(detail.references.responsibleName,qaStaff.find(row=>row.id===qaPrincipal.staffId).name);
 for(const key of ['createdByAccountId','createdAt','createdRole','createdHallId'])assert.equal(detail.document.header[key],original.header[key]);
 const receipt=await h.commands.receipt(edit,signal());assert.equal(receipt.status,'COMMITTED');assert.equal(receipt.result.version,2);
 assert.deepEqual(h.chain.snapshot().balances,initial.balances);assert.deepEqual(h.chain.snapshot().ledger,initial.ledger);assert.equal(h.chain.snapshot().audit.length,2);assert.equal(h.chain.snapshot().receipts.size,2);
});

test('responsible existence remains revalidated by original SAVE; a UUID-valid unknown candidate never persists',async t=>{
 const h=await fixture(t),before=h.chain.snapshot(),unknown='00000000-0000-4000-8000-000000999999';
 // Existing phase contract: prepare accepts a syntactically valid identity;
 // actual staff existence is enforced at SAVE, not fabricated by preparation.
 const prepared=await h.prepare.prepareCreate(intent(unknown),signal());assert.equal(prepared.header.responsibleStaffId,unknown);assert.deepEqual(h.chain.snapshot(),before);
 await assert.rejects(h.commands.execute({action:'SAVE',expectedVersion:null,requestKey:'unknown-prepared-responsible',draft:prepared},signal()),error=>error?.code==='RESPONSIBLE_STAFF_UNAVAILABLE'&&error.kind==='conflict'&&error.outcome==='rejected');
 assert.deepEqual(h.chain.snapshot(),before);assert.deepEqual(h.calls.map(row=>row.status),[200,409]);
});

test('identity revoked after actual preparation still rejects original SAVE without document/audit/receipt/stock effects',async t=>{
 const h=await fixture(t),prepared=await h.prepare.prepareCreate(intent(qaPrincipal.staffId),signal());h.chain.revoke();const before=h.chain.snapshot();
 // Original browser client closes at401/403 headers and preserves uncertain POST
 // ownership; do not weaken that lifecycle just because this fixture knows rollback.
 await assert.rejects(h.commands.execute({action:'SAVE',expectedVersion:null,requestKey:'revoked-prepared-responsible',draft:prepared},signal()),error=>error?.kind==='forbidden'&&error.status===403&&error.outcome==='uncertain');
 assert.deepEqual(h.chain.snapshot(),before);assert.deepEqual(h.calls.map(row=>row.status),[200,403]);
});
