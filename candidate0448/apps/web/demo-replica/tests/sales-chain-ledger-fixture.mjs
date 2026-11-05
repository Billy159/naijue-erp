/** TEST ONLY: reads the existing finite sales SyntheticStore. No generated ledger,
 * imported history, SQL, production fallback, listener, or command is installed. */
import {requireDomain} from '../../../../packages/domain/src/errors.ts';
import {activeInventoryLedgerRead,inventoryLedgerBefore} from '../../../../packages/application/src/inventory-ledger-query-validation.ts';
import {balanceKey} from '../../../../tests/support/synthetic-store.ts';
import {qaHalls,qaWarehouses,qaProducts,qaSkus,qaGroups,qaFits,qaStaff} from '../frontend/qa-reference-fixtures.mts';

export function createSalesChainLedgerDependencies(store,actor){
 const checkIdentity=(state,trusted)=>requireDomain(trusted.accountId===actor.accountId&&trusted.hallId===actor.hallId
  &&state.identities.get(actor.accountId)?.loginEnabled===true
  &&state.identities.get(actor.accountId)?.employmentStatus==='在职'
  &&state.identities.get(actor.accountId)?.role==='ADMIN','FORBIDDEN','Outside the declared synthetic sales identity');
 const warehouses=qaWarehouses.filter(w=>w.enabled&&w.hall.enabled&&qaHalls.some(h=>h.id===w.hall.id&&h.enabled))
  .map(w=>({id:w.id,hallId:w.hall.id,label:w.name}));
 const hallIds=[...new Set(warehouses.map(w=>w.hallId))];
 return {
  authorization:{async authorize(trusted,_intent,signal){activeInventoryLedgerRead(signal);checkIdentity(store.snapshot(),trusted);return {hallIds,warehouses};}},
  reader:{async readLedger(read){
   activeInventoryLedgerRead(read.signal);const state=store.snapshot();checkIdentity(state,read.actor);
   const q=read.parameters,warehouse=read.scope.warehouses.find(w=>w.id===q.warehouseId);
   requireDomain(warehouse,'FORBIDDEN','Warehouse outside finite synthetic directory');
   const sku=qaSkus.find(s=>s.id===q.skuId);requireDomain(sku,'SKU_NOT_FOUND','Unknown synthetic SKU');
   // Only explicitly seeded exact keys are ready. Missing is never an inferred zero.
   requireDomain(state.balances.has(balanceKey(q.warehouseId,q.skuId)),'INVENTORY_NOT_READY','Exact synthetic key unavailable');
   const product=qaProducts.find(p=>p.id===sku.productId),group=qaGroups.find(g=>g.id===sku.sizeGroupId),fit=qaFits.find(f=>f.id===sku.fitId),size=group?.sizes.find(s=>s.id===sku.sizeId);
   requireDomain(product&&group&&fit&&size,'INVENTORY_INTEGRITY_FAILED','Missing native synthetic reference');
   let entries=state.ledger.filter(e=>e.warehouseId===q.warehouseId&&e.skuId===q.skuId).map(row=>{
    requireDomain(row.source.kind==='SALES','INVENTORY_INTEGRITY_FAILED','Sales-only store cannot invent another source');
    const header=state.headers.get(row.source.salesId),line=state.lines.get(row.source.salesLineId);
    requireDomain(header&&line&&line.salesId===header.id&&line.skuId===q.skuId,'INVENTORY_INTEGRITY_FAILED','Exact source relation unavailable');
    const entry={id:row.id,operationId:row.operationId,eventKind:row.eventKind,quantityDelta:row.quantityDelta.toString(),source:row.source,
     sourceDocumentVersion:row.sourceDocumentVersion,reversesEntryId:row.reversesEntryId,businessDate:row.businessDate,postedAt:row.postedAt};
    if(q.page!==undefined){
     const receipts=[...state.receipts.values()].filter(r=>r.id===row.operationId&&r.status==='COMMITTED'&&r.targetSalesId===header.id);
     requireDomain(receipts.length===1,'INVENTORY_INTEGRITY_FAILED','Committed operation receipt unavailable');
     const accountId=receipts[0].actorAccountId,person=qaStaff.find(s=>s.account?.id===accountId);
     entry.display={date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.postedAt)),
      businessType:header.businessType,sourceNumber:header.number,operator:{accountId,name:person?.name??null,labelBasis:'CURRENT_REFERENCE'},
      balanceTransition:{state:'UNKNOWN',before:null,after:null,reason:'NO_RECORDED_BALANCE_TRANSITION'},navigation:'NOT_CHECKED'};
    }
    return entry;
   }).sort((a,b)=>a.postedAt===b.postedAt?(a.id===b.id?0:a.id>b.id?-1:1):a.postedAt>b.postedAt?-1:1);
   let nextCursor=null,numbered={};
   if(q.page!==undefined){
    const f=q.filter;entries=entries.filter(e=>(f.dateFrom===null||e.display.date>=f.dateFrom)&&(f.dateTo===null||e.display.date<=f.dateTo)
     &&(f.businessType===null||e.display.businessType===f.businessType)&&e.display.sourceNumber.toLowerCase().includes(f.source.toLowerCase()));
    numbered={page:q.page,filteredTotal:String(entries.length)};const offset=(BigInt(q.page)-1n)*20n;
    entries=offset>=BigInt(entries.length)?[]:entries.slice(Number(offset),Number(offset)+20);
   }else{
    if(q.after)entries=entries.filter(e=>inventoryLedgerBefore({postedAt:e.postedAt,entryId:e.id},q.after));
    const more=entries.length>q.pageSize;entries=entries.slice(0,q.pageSize);const last=entries.at(-1);
    if(more&&last)nextCursor={postedAt:last.postedAt,entryId:last.id};
   }
   activeInventoryLedgerRead(read.signal);
   return {readReference:'SYNTHETIC-SALES-STORE-LEDGER-V1',readiness:'ready',data:{pageSize:q.pageSize,labelBasis:'CURRENT_REFERENCE',warehouse,
    sku:{id:sku.id,code:sku.skuCode,product:{id:product.id,code:product.code,name:product.name},color:{id:sku.colorId,label:sku.colorName},fit:{id:fit.id,code:fit.code,label:fit.name},
     sizeGroup:{id:group.id,label:group.name},size:{id:size.id,code:size.code,label:size.name}},entries,nextCursor,...numbered}};
  }}
 };
}
