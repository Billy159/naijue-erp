/** SYNTHETIC immutable-history proof; no database or source-specific authorization. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertHistoricalUnknownRowsUnchanged, certifyRetainedSalesApproval, retainedSalesApprovalSnapshot, SALES_RETAINED_APPROVAL_MAX_HISTORY } from '../packages/application/src/sales-retained-approval.ts';
import type { SalesRetainedApprovalEvent } from '../packages/application/src/sales-retained-approval.ts';
import { salesChangeEvidence } from '../packages/application/src/sales-change-evidence.ts';
import type { SalesDocument } from '../packages/domain/src/documents.ts';
import { version, quantity, minorAmount } from '../packages/domain/src/values.ts';
import { actor, ids, sid, syntheticDraft } from './support/synthetic-fixtures.ts';
const time='2026-11-02T10:00:00.000Z';
const owner={};
const certifyHistory=(document:SalesDocument,events:readonly SalesRetainedApprovalEvent[])=>certifyRetainedSalesApproval(document,{events,assertCurrent(){}},owner);
const snapshot=(proof:Parameters<typeof retainedSalesApprovalSnapshot>[0],document:SalesDocument)=>retainedSalesApprovalSnapshot(proof,document,owner);
function fixture(){
 const draft=syntheticDraft(), approved:SalesDocument={...draft,header:{...draft.header,status:'APPROVED',version:version(4),createdByAccountId:null,createdHallId:null,createdAt:null,updatedAt:null,approvedByAccountId:null,approvedAt:null,responsibleStaffId:null}},
 unapproved:SalesDocument={...approved,header:{...approved.header,status:'DRAFT',version:version(5),updatedAt:time,approvedByStaffId:null}},
 current:SalesDocument={...unapproved,header:{...unapproved.header,version:version(6),note:'memo',updatedAt:time}};
 const events:SalesRetainedApprovalEvent[]=[['UNAPPROVE',approved,unapproved],['SAVE',unapproved,current]].map(([action,before,after],i)=>{
  const a=action as 'SAVE'|'UNAPPROVE',b=before as SalesDocument,n=after as SalesDocument,operationId=sid('operation',970000+i);
  return {audit:{id:sid('audit',970010+i),operationId,actorAccountId:actor.accountId,salesId:ids.sales,action:a,occurredAt:time,oldVersion:b.header.version,newVersion:n.header.version,...JSON.parse(JSON.stringify(salesChangeEvidence(b,n),(_key,value)=>typeof value==='bigint'?value.toString():value))},receipt:{id:operationId,actorAccountId:actor.accountId,requestKey:`proof-${i}`,requestHash:'a'.repeat(64),action:a,targetSalesId:ids.sales,status:'COMMITTED',result:{operationId,salesId:ids.sales,version:n.header.version,status:'DRAFT',ledgerEntryIds:[]},completedAt:time}};
 });return {approved,current,events};
}
test('retained approval requires actual prior APPROVED unapproval and contiguous metadata-only committed history',()=>{
 const {approved,current,events}=fixture(),proof=certifyHistory(current,events);assert.ok(proof);
 const original=snapshot(proof,current);assert.equal(original.header.status,'APPROVED');assert.equal(original.header.version,4);assert.equal(original.header.updatedAt,approved.header.updatedAt);assert.deepEqual(original.lines,current.lines);
 assert.equal(certifyHistory(current,[]),undefined);
 assert.throws(()=>snapshot({...proof},current),{code:'INVALID_RETAINED_APPROVAL'});
 assert.throws(()=>snapshot(proof,{...current,lines:current.lines.map(l=>({...l,dealPrice:l.dealPrice+1n as typeof l.dealPrice}))}),{code:'INVALID_RETAINED_APPROVAL'});
});
for(const name of ['gap','missing receipt','wrong target','wrong actor','wrong time','wrong result','not prior approved','financial header','changed lines','changed payments','wrong current metadata','duplicate operation','MIGRATE only','scope header','stale chain','receipt action','bad request hash','after version','unknown evidence key','changed creator'] as const)test(`retained approval rejects ${name}`,()=>{
 const {current,events}=fixture(),bad=structuredClone(events) as any[];
 switch(name){case 'gap':bad.shift();break;case 'missing receipt':bad[0].receipt=null;break;case 'wrong target':bad[0].receipt.targetSalesId=sid('sales',77);break;case 'wrong actor':bad[0].receipt.actorAccountId=sid('account',77);break;case 'wrong time':bad[0].receipt.completedAt='2026-11-02T10:00:01Z';break;case 'wrong result':bad[0].receipt.result.version=99;break;case 'not prior approved':bad[0].audit.before.header.status='DRAFT';break;case 'financial header':bad[1].audit.before.header.netDue='125';bad[1].audit.after.header.netDue='125';break;case 'changed lines':bad[1].audit.after.lines=[{}];break;case 'changed payments':bad[1].audit.before.settlements=[{}];break;case 'wrong current metadata':bad[1].audit.after.header.note='not current';break;case 'duplicate operation':bad[1].audit.operationId=bad[0].audit.operationId;bad[1].receipt.id=bad[0].receipt.id;bad[1].receipt.result.operationId=bad[0].receipt.id;break;case 'MIGRATE only':bad[0].audit.action='MIGRATE_DOCUMENT';break;case 'scope header':bad[1].audit.before.header.hallId=ids.hall;bad[1].audit.after.header.hallId=ids.hall;break;case 'stale chain':bad.pop();break;case 'receipt action':bad[1].receipt.action='APPROVE';break;case 'bad request hash':bad[1].receipt.requestHash='z'.repeat(64);break;case 'after version':bad[1].audit.after.header.version=99;break;case 'unknown evidence key':bad[1].audit.after.extra='hidden';break;case 'changed creator':bad[1].audit.before.header.createdByStaffId=null;bad[1].audit.after.header.createdByStaffId=null;break;}
 assert.equal(certifyHistory(current,bad),undefined);
});
test('retained approval compares timestamps by exact instant including database microsecond formatting',()=>{
 const {current,events}=fixture(),bad=structuredClone(events) as any[];
 bad.forEach(e=>{e.audit.occurredAt='2026-11-02T10:00:00.000000Z';e.receipt.completedAt='2026-11-02T10:00:00.000000Z';});
 assert.ok(certifyHistory({...current,header:{...current.header,updatedAt:'2026-11-02T10:00:00.000000Z'}},bad));
 bad[0].receipt.completedAt='2026-11-02T10:00:00.000001Z';assert.equal(certifyHistory(current,bad),undefined);
});

test('retained approval capability rechecks original transaction lease and rejects a foreign transaction even for identical facts',()=>{
 const {current,events}=fixture();let active=true;const history={events,assertCurrent(){if(!active)throw Object.assign(new Error('Closed original transaction'),{code:'TRANSACTION_CLOSED'});}};
 const proof=certifyRetainedSalesApproval(current,history,owner);assert.ok(proof);assert.ok(retainedSalesApprovalSnapshot(proof,current,owner));
 assert.throws(()=>retainedSalesApprovalSnapshot(proof,current,{}),{code:'INVALID_RETAINED_APPROVAL'});
 active=false;assert.throws(()=>retainedSalesApprovalSnapshot(proof,current,owner),{code:'TRANSACTION_CLOSED'});assert.throws(()=>certifyRetainedSalesApproval(current,history,owner),{code:'TRANSACTION_CLOSED'});
});

test('retained approval application proof also refuses overflow from a non-Postgres provider',()=>{
 const {current,events}=fixture();assert.equal(certifyHistory(current,Array.from({length:SALES_RETAINED_APPROVAL_MAX_HISTORY+1},()=>events[0]!)),undefined);
});

test('retained capability exact canonical binding rejects changed unknowns, metadata, snapshots, money and row membership',()=>{
 const {current,events}=fixture(),proof=certifyHistory(current,events);assert.ok(proof);
 const changed:SalesDocument[]=[
  {...current,header:{...current.header,note:null}},
  {...current,lines:current.lines.map(line=>({...line,isGift:null}))},
  {...current,lines:current.lines.map(line=>({...line,snapshot:{...line.snapshot,productCode:null}}))},
  {...current,settlements:current.settlements.map(row=>({...row,amount:row.amount+1n as typeof row.amount}))},
  {...current,settlements:current.settlements.map(row=>({...row,paymentMethodId:null}))},
  {...current,settlements:[]},
 ];
 for(const document of changed)assert.throws(()=>snapshot(proof,document),{code:'INVALID_RETAINED_APPROVAL'});
 assert.deepEqual(snapshot(proof,structuredClone(current)).lines,current.lines);
});


function originFixture(){
 const source=fixture();const current={...source.current,header:{...source.current.header,version:version(3)}};
 const events=structuredClone(source.events) as any[];
 for(const e of events){e.audit.oldVersion-=3;e.audit.newVersion-=3;e.audit.before.header.version-=3;e.audit.after.header.version-=3;e.receipt.result.version-=3;}
 return {current,events};
}
test('historical row unknown provenance rejects gaps, forged receipt, changed row and missing history',()=>{
 const {current,events}=originFixture();const unknown={...current,lines:current.lines.map(l=>({...l,pricingRule:null,isGift:null,zeroConfirmed:null}))};
 assert.doesNotThrow(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events,assertCurrent(){}}));
 for(const mode of ['gap','receipt','target','status','changed','stale'] as const){
  const bad=structuredClone(events) as any[];
  if(mode==='gap')bad.pop();
  if(mode==='receipt')bad[1].receipt=null;
  if(mode==='target')bad[1].receipt.targetSalesId=sid('sales',909);
  if(mode==='status')bad[0].audit.before.header.status='DRAFT';
  if(mode==='changed')bad[1].audit.after.lines=[{id:unknown.lines[0]!.id}];
  if(mode==='stale')bad[1].audit.newVersion=99;
  assert.throws(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events:bad,assertCurrent(){}}),{code:'UNKNOWN_PRICING_FACTS'});
 }
 assert.throws(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events:[],assertCurrent(){}}),{code:'UNKNOWN_PRICING_FACTS'});
 assert.throws(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events,assertCurrent(){throw new Error('closed');}}),/closed/);
});

test('historical row proof rejects asymmetric sparse row evidence and current-value mismatch',()=>{
 const {current,events}=originFixture();const unknown={...current,lines:current.lines.map(l=>({...l,pricingRule:null,isGift:null,zeroConfirmed:null}))};
 const row=JSON.parse(JSON.stringify(salesChangeEvidence(undefined,unknown).after.lines[0],(_k,v)=>typeof v==='bigint'?v.toString():v));
 for(const mode of ['before-only','after-mismatch'] as const){
  const bad=structuredClone(events) as any[];bad[1].audit.before.lines=[{...row,quantity:'999'}];bad[1].audit.after.lines=mode==='before-only'?[]:[{...row,quantity:'999'}];
  assert.throws(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events:bad,assertCurrent(){}}),{code:'UNKNOWN_PRICING_FACTS'});
 }
});

test('historical origin provenance rejects a truncated prefix even if first visible event is UNAPPROVE',()=>{
 const {current,events}=fixture();const unknown={...current,lines:current.lines.map(l=>({...l,pricingRule:null,isGift:null,zeroConfirmed:null}))};
 assert.throws(()=>assertHistoricalUnknownRowsUnchanged(unknown,{events,assertCurrent(){}}),{code:'UNKNOWN_PRICING_FACTS'});
});

test('verified migration origin permits legitimate version-four import without fabricated runtime prefix',async()=>{
 const {approved,current,events}=fixture();
 const {historicalSaleOriginProjection}=await import('../packages/application/src/sales-retained-approval.ts');
 const origin={...approved,lines:approved.lines.map(l=>({...l,quantity:quantity('-10')}))};
 const final={...current,lines:origin.lines};
 const history={events,migrationOrigin:origin,assertCurrent(){}};
 assert.deepEqual(historicalSaleOriginProjection(final,'CUTOFF_HISTORY',history),{kind:'SIGNED_SALE',originalOrderDiscount:origin.header.orderDiscount});
 for(const changed of [
   {...origin,header:{...origin.header,version:version(3)}},
   {...origin,header:{...origin.header,netDue:minorAmount('1')}},
   {...origin,lines:origin.lines.map(l=>({...l,quantity:quantity('-11')}))},
   {...origin,settlements:[]},
 ])assert.throws(()=>historicalSaleOriginProjection(final,'CUTOFF_HISTORY',{...history,migrationOrigin:changed}),{code:'UNKNOWN_PRICING_FACTS'});
 assert.throws(()=>historicalSaleOriginProjection(final,'CUTOFF_HISTORY',{events,assertCurrent(){}}),{code:'UNKNOWN_PRICING_FACTS'});
});
