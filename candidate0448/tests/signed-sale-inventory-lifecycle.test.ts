import test from 'node:test';import assert from 'node:assert/strict';
import{planDocumentInventoryMigration,planDocumentInventoryTransition,canonicalDocumentInventorySnapshot}from'../packages/domain/src/document-inventory-effects.ts';
import type{DocumentInventorySnapshot,DocumentInventoryLedgerEvidence}from'../packages/domain/src/document-inventory-effects.ts';
import{entityId,quantity,version,businessDate}from'../packages/domain/src/values.ts';
import type{EntityKind}from'../packages/domain/src/values.ts';
const id=<K extends EntityKind>(k:K,n:number)=>entityId(k,`71000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
const sale=id('sales',1),wh=id('warehouse',2),sku=id('sku',3),actor=id('account',4),date=businessDate('2026-11-02'),time='2026-11-04T03:00:00Z';
function doc(status:'DRAFT'|'APPROVED',v:number,qs=['5','-5']):Extract<DocumentInventorySnapshot,{kind:'SALES'}>{return{kind:'SALES',header:{id:sale,warehouseId:wh,businessType:'SALE',businessDate:date,status,version:version(v)},lines:qs.map((q,i)=>({id:id('salesLine',10+i),salesId:sale,lineNo:i+1,skuId:sku,quantity:quantity(q),isCurrent:true}))};}
const entries=(p:ReturnType<typeof planDocumentInventoryTransition>,n:number):DocumentInventoryLedgerEvidence[]=>p.ledgerIntents.map((x,i)=>({...x,id:id('ledger',n+i),postedAt:time}));
test('new RETURN/EXCHANGE zero-net keeps both posting rows and lock key; exact runtime reversals',()=>{
 const before={...doc('DRAFT',1),header:{...doc('DRAFT',1).header,businessType:'RETURN' as const}},after={...doc('APPROVED',2),header:{...doc('APPROVED',2).header,businessType:'RETURN' as const}},args={action:'APPROVE' as const,before,after,operationId:id('operation',20)};
 const p=planDocumentInventoryTransition(args);assert.deepEqual(p.ledgerIntents.map(x=>x.quantityDelta),[-5n,5n]);assert.equal(p.balanceDeltas.length,0);assert.equal(p.touchedKeys.length,1);
 assert.notEqual(p.ledgerIntents[0]!.intentKey,p.ledgerIntents[1]!.intentKey);assert.deepEqual(planDocumentInventoryTransition(args),p);
 const rows=entries(p,30),r=planDocumentInventoryTransition({action:'UNAPPROVE',before:after,after:{...doc('DRAFT',3),header:{...doc('DRAFT',3).header,businessType:'RETURN'}},operationId:id('operation',21),priorEvidence:{kind:'RUNTIME_LEDGER',entries:rows}});
 assert.deepEqual(r.ledgerIntents.map(x=>x.quantityDelta),[5n,-5n]);assert.deepEqual(r.ledgerIntents.map(x=>x.reversesEntryId),rows.map(x=>x.id));
});
test('historical mixed SALE imports no stock then reverses exact original, edits and reapproves signed rows',()=>{
 const original=doc('APPROVED',1,['8','-3']),migration=id('operation',40);
 const imported=planDocumentInventoryMigration({snapshot:original,source:{batchId:id('operation',41),sourceRecordId:id('operation',42),sourceSystem:'SYNTHETIC',sourceEntityType:'SALES',sourceKey:'original-sale',sourceRecordSha256:'a'.repeat(64)},receipt:{id:migration,action:'MIGRATE_DOCUMENT',status:'COMMITTED',targetKind:'SALES',targetId:sale,targetVersion:version(1),actorAccountId:actor,completedAt:time},audit:{operationId:migration,actorAccountId:actor,occurredAt:time,oldVersion:null,newVersion:version(1)},coverage:{state:'CONFIRMED',baselineBatchId:id('operation',43),baselineManifestSha256:'b'.repeat(64),cutoffAt:'2026-11-02T04:00:00Z',snapshotKey:canonicalDocumentInventorySnapshot(original)}});
 assert.deepEqual(imported.ledgerIntents,[]);assert.deepEqual(imported.balanceDeltas,[]);
 const draft=doc('DRAFT',2,['8','-3']),u=planDocumentInventoryTransition({action:'UNAPPROVE',before:original,after:draft,operationId:id('operation',44),stockBasis:'CUTOFF_HISTORY',priorEvidence:{kind:'BASELINE_ANCHOR',anchor:imported.anchor,entries:[]}});
 assert.deepEqual(u.ledgerIntents.map(x=>x.quantityDelta),[8n,-3n]);assert.ok(u.ledgerIntents.every(x=>x.baselineAnchorOperationId===migration));
 const edited=doc('DRAFT',3,['2','-7']),save=planDocumentInventoryTransition({action:'SAVE',before:draft,after:edited,operationId:id('operation',45)});assert.deepEqual(save.ledgerIntents,[]);assert.deepEqual(save.balanceDeltas,[]);
 const approved=doc('APPROVED',4,['2','-7']),p=planDocumentInventoryTransition({action:'APPROVE',stockBasis:'CUTOFF_HISTORY',before:edited,after:approved,operationId:id('operation',46),priorEvidence:{kind:'RUNTIME_LEDGER',entries:entries(u,50)}});
 assert.deepEqual(p.ledgerIntents.map(x=>x.quantityDelta),[-2n,7n]);assert.equal(p.balanceDeltas[0]!.quantityDelta,5n);
});
test('invalid second line rejects entire pure plan and cannot mutate caller state',()=>{
 const before=doc('DRAFT',1,['5','0']),after=doc('APPROVED',2,['5','0']),copy=structuredClone({before,after});
 assert.throws(()=>planDocumentInventoryTransition({action:'APPROVE',before,after,operationId:id('operation',60)}),{code:'INVALID_SALES_QUANTITY'});assert.deepEqual({before,after},copy);
});
test('missing reversal evidence remains rejected for signed SALE',()=>{
 assert.throws(()=>planDocumentInventoryTransition({action:'UNAPPROVE',stockBasis:'CUTOFF_HISTORY',before:doc('APPROVED',2),after:doc('DRAFT',3),operationId:id('operation',61)}),{code:'MISSING_POSTING_PROVENANCE'});
});

test('new mixed SALE posts both same-SKU signed lines without splitting, and reverses exact entries',()=>{
 for(const qs of [['5','-3'],['3','-5'],['5','-5']]){
  const before=doc('DRAFT',1,qs),after=doc('APPROVED',2,qs);
  const p=planDocumentInventoryTransition({action:'APPROVE',before,after,operationId:id('operation',70)});
  assert.deepEqual(p.ledgerIntents.map(l=>l.quantityDelta),qs.map(q=>-BigInt(q)));
  assert.equal(p.touchedKeys.length,1);assert.equal(p.balanceDeltas.reduce((s,l)=>s+l.quantityDelta,0n),-BigInt(qs[0]!)-BigInt(qs[1]!));
  const rows=entries(p,80),r=planDocumentInventoryTransition({action:'UNAPPROVE',before:after,after:doc('DRAFT',3,qs),operationId:id('operation',71),priorEvidence:{kind:'RUNTIME_LEDGER',entries:rows}});
  assert.deepEqual(r.ledgerIntents.map(l=>l.quantityDelta),qs.map(BigInt));
 }
});
