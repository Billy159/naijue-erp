/** SYNTHETIC transfer full-draft transport + locked service facts. No PG or listening socket. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTransferCommand } from '../apps/api/src/transfer-input.ts';
import { createTransferService } from '../packages/application/src/transfer-service.ts';
import type { TransferDocument, TransferDraft } from '../packages/application/src/transfer-ports.ts';
import { actor, draft, fixture, ids, sid } from './support/synthetic-transfer.ts';
import { version } from '../packages/domain/src/values.ts';
function wire(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(_k,v:unknown)=>typeof v==='bigint'?v.toString():v));}
function nullLabels(value:TransferDraft= draft()):TransferDraft{return {...value,lines:value.lines.map(line=>({...line,snapshot:{...line.snapshot,productCode:null,productName:null,colorName:null,fitName:null,sizeName:null}}))};}
function document(value:TransferDraft):TransferDocument{return {...value,header:{...value.header,status:'DRAFT',version:version(4),responsibleStaffId:null,
  createdByAccountId:null,createdHallId:null,createdRole:null,createdAt:null,updatedAt:null,approvedByAccountId:null,approvedAt:null}};}
function command(value:TransferDraft,expectedVersion:number|null=4,key='memo'){
  return parseTransferCommand(wire({action:'SAVE',requestKey:key,expectedVersion,draft:value}),actor);
}
test('SYNTHETIC transfer input: existing SAVE retains all five original nullable labels exactly',()=>{
  const parsed=command(nullLabels());assert.ok(parsed.action==='SAVE'&&'draft' in parsed);
  for(const label of ['productCode','productName','colorName','fitName','sizeName'] as const)assert.equal(parsed.draft.lines[0]?.snapshot[label],null);
});
test('SYNTHETIC transfer input: new create, malformed version/identity/quantity and forged actor fields remain strict',()=>{
  assert.throws(()=>command(nullLabels(),null),{code:'INVALID_HTTP_INPUT'});
  assert.throws(()=>command(nullLabels(),0),{code:'INVALID_HTTP_INPUT'});
  const value=draft();
  for(const invalid of [{...value,header:{...value.header,createdByAccountId:actor.accountId}},
    {...value,lines:value.lines.map(line=>({...line,quantity:2}))},
    {...value,lines:value.lines.map(line=>({...line,skuId:null}))}]){
    assert.throws(()=>parseTransferCommand(wire({action:'SAVE',requestKey:'invalid',expectedVersion:4,draft:invalid}),actor));
  }
});
test('SYNTHETIC transfer ordinary full SAVE roundtrips original nulls using source-only references without stock or creator invention',async()=>{
  const f=fixture(),original=nullLabels();f.store.seedDocument(document(original),'CUTOFF_HISTORY');
  await f.service.execute(command({...original,header:{...original.header,note:'SYNTHETIC NOTE ONLY'}}));
  assert.equal(f.document().header.version,5);assert.equal(f.document().header.createdByAccountId,null);assert.equal(f.document().header.createdAt,null);
  assert.deepEqual(f.document().lines,original.lines);assert.equal(f.store.snapshot().ledger.length,0);assert.equal(f.balance(),0n);
});
test('SYNTHETIC transfer service guard: known labels cannot be replaced with invented nulls even if reference policy only checks warehouses/SKU',async()=>{
  const f=fixture();f.store.seedDocument(document(draft()),'CUTOFF_HISTORY');const before=f.store.snapshot();
  await assert.rejects(f.service.execute({actor,action:'SAVE',requestKey:'invented-null',expectedVersion:version(4),draft:nullLabels()}),{code:'UNKNOWN_SNAPSHOT_FACTS'});
  assert.deepEqual(f.store.snapshot(),before);
});
test('SYNTHETIC transfer service guard: new or replaced line cannot adopt another retained line null snapshot',async()=>{
  const original=nullLabels();
  for(const replacement of [original.lines.map(line=>({...line,id:sid('transferLine',989001)})),original.lines.map(line=>({...line,skuId:ids.sku2}))]){
    const f=fixture();f.store.seedDocument(document(original),'CUTOFF_HISTORY');const before=f.store.snapshot();
    await assert.rejects(f.service.execute({actor,action:'SAVE',requestKey:'replacement',expectedVersion:version(4),draft:{...original,lines:replacement}}),{code:'UNKNOWN_SNAPSHOT_FACTS'});
    assert.deepEqual(f.store.snapshot(),before);
  }
});
test('SYNTHETIC transfer service guard: new direct service create still cannot invent unknown snapshot labels',async()=>{
  const f=fixture();await assert.rejects(f.service.execute({actor,action:'SAVE',requestKey:'new',expectedVersion:null,draft:nullLabels()}),{code:'UNKNOWN_SNAPSHOT_FACTS'});
  assert.equal(f.store.snapshot().transfers.size,0);
});
test('SYNTHETIC transfer approval: factual SKU/quantity/endpoints do not require inventing original display labels',async()=>{
  const f=fixture();f.store.seedDocument(document(nullLabels()),'CUTOFF_HISTORY');
  await f.service.execute({actor,action:'APPROVE',requestKey:'a',expectedVersion:version(4),transferId:ids.transfer});
  assert.equal(f.balance(ids.fromWarehouse),-2n);assert.equal(f.balance(ids.toWarehouse),2n);assert.equal(f.document().lines[0]?.snapshot.productName,null);
});
