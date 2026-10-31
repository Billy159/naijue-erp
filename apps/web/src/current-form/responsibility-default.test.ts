import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { TransferProposalSession } from './transfer-proposal.ts';
import { SalesProposalSession } from './sales-proposal.ts';
import type { CurrentFormPage, CurrentSalesReferenceItem } from '../../../../packages/application/src/current-form-ports.ts';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const person={id:uid(10),name:'SYN current staff'},other={id:uid(11),name:'SYN manually selected'};
const page=<T>(items:readonly T[]):CurrentFormPage<T>=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
const reference=(p=person):CurrentSalesReferenceItem=>({...p,code:null,hallId:null,hallName:null,paymentMethodId:null,paymentMethodName:null});
function fixture(){const context=new ReadContext({accountId:uid(99),sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('responsible');const reader={readProducts:async()=>page([]),readProductSkus:async()=>page([]),readTransferWarehouses:async()=>page([])};return {context,scope,session:new TransferProposalSession(scope,reader)};}

test('transfer current employee initialization preserves clean state; manual responsible remains independently editable',()=>{
 const {session}=fixture(),before=session.getSnapshot().draft;
 assert.equal(session.applyDefaultResponsibleStaff(person,person.id,before),true);assert.equal(session.getSnapshot().dirty,false);assert.equal(session.getSnapshot().draft.responsible?.id,person.id);
 assert.equal('createdByAccountId'in session.getSnapshot().draft,false);assert.equal(session.selectResponsibleStaff(other),true);assert.equal(session.getSnapshot().dirty,true);assert.equal(session.getSnapshot().draft.responsible?.id,other.id);session.dispose();
});
test('transfer default requires actual trusted staff ID and exact current draft; it preserves unrelated existing dirty input',()=>{
 const {session}=fixture(),before=session.getSnapshot().draft;
 assert.equal(session.applyDefaultResponsibleStaff(person,other.id,before),false);session.setHeader({note:'SYN unsaved note'});
 assert.equal(session.applyDefaultResponsibleStaff(person,person.id,before),false);assert.equal(session.applyDefaultResponsibleStaff(person,person.id,session.getSnapshot().draft),true);
 assert.equal(session.getSnapshot().draft.note,'SYN unsaved note');assert.equal(session.getSnapshot().dirty,true);session.dispose();
});
test('manual open, explicit clear, explicit choice and lost identity permanently close a late transfer default',()=>{
 for(const intent of ['open','clear','select','identity'] as const){const {session,context}=fixture();if(intent==='open')session.touchResponsibleStaff();if(intent==='clear')session.clearResponsibleStaff();if(intent==='select')session.selectResponsibleStaff(other);if(intent==='identity')context.clear();
  assert.equal(session.applyDefaultResponsibleStaff(person,person.id,session.getSnapshot().draft),false);assert.equal(session.getSnapshot().draft.responsible?.id,intent==='select'?other.id:undefined);if(intent==='clear')assert.equal(session.getSnapshot().draft.responsible===null,true);session.dispose();}
});
test('saved transfer keeps responsible including unknown/unset; hand edit serializes only independent responsibleStaffId',()=>{
 for(const retained of [undefined,null,person]){
  const {session}=fixture();const product=entityId('product',uid(30)),sku={id:entityId('sku',uid(31)),skuCode:'SYN',productId:product,productCode:'SYN',productName:'SYN',colorId:entityId('color',uid(32)),colorName:'SYN',fitId:entityId('fit',uid(33)),fitName:'Y',sizeId:entityId('size',uid(34)),sizeName:'S',sizeGroupId:entityId('sizeGroup',uid(35)),barcodeAvailability:'UNAVAILABLE' as const};
  assert.equal(session.initializeFromSaved({...(retained===undefined?{}:{responsible:retained}),businessDate:'2026-10-31',note:'SYN saved',from:{id:entityId('warehouse',uid(40)),name:'FROM'},to:{id:entityId('warehouse',uid(41)),name:'TO'},lines:[{sku,quantity:'1',existingLineId:uid(42)}]}),true);
  assert.equal(session.applyDefaultResponsibleStaff(other,other.id,session.getSnapshot().draft),false);if(retained===undefined)assert.equal(session.getSnapshot().draft.responsible===undefined,true);else if(retained===null)assert.equal(session.getSnapshot().draft.responsible===null,true);else assert.equal(session.getSnapshot().draft.responsible?.id,retained.id);assert.equal(session.getSnapshot().dirty,false);
  assert.equal(session.selectResponsibleStaff(other),true);assert.equal(session.getSnapshot().dirty,true);const intent=session.saveProposal(uid(60));assert.equal(intent?.responsibleStaffId,other.id);assert.equal(!!intent,true);assert.equal('createdByAccountId'in intent!,false);assert.equal('createdBy'in intent!,false);session.dispose();
 }
});
test('sales current employee default stays clean and allows later manual selection/clear without refill',async()=>{
 const context=new ReadContext({accountId:uid(99),sessionRevision:'1',permissionRevision:'1'}),scope=context.createScope('sales'),hall={...reference({id:uid(20),name:'SYN hall'}),hallId:entityId('hall',uid(20)),hallName:'SYN hall'};
 const session=new SalesProposalSession(scope,{readProducts:async()=>page([]),readProductSkus:async()=>page([]),readSalesReferences:async q=>page(q.kind==='hall'?[hall]:[reference(person),reference(other)])});
 assert.equal(session.applyDefaultSalesperson(reference(person),person.id,session.getSnapshot().draft),true);assert.equal(session.getSnapshot().dirty,false);await session.openPicker('hall');assert.equal(await session.select(hall.id),true);
 await session.openPicker('salesperson');assert.equal(await session.select(other.id),true);assert.equal(session.getSnapshot().draft.salesperson?.id,other.id);session.clearSalesperson();assert.equal(session.applyDefaultSalesperson(reference(person),person.id,session.getSnapshot().draft),false);assert.equal(session.getSnapshot().draft.salesperson===null,true);session.dispose();
});
