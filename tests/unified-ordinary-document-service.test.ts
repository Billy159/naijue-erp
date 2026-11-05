/** Isolated SYNTHETIC ordinary service/UOW tests. No PG, source data or production access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesService } from '../packages/application/src/sales-service.ts';
import { createCandidateSalesBusinessRules } from '../packages/application/src/sales-business-rules.ts';
import { createNativeTransactionSalesBusinessRules } from '../packages/application/src/sales-native-facts.ts';
import type { NativeSalesReferenceFacts } from '../packages/application/src/sales-native-facts.ts';
import type { SalesBusinessRules } from '../packages/application/src/ports.ts';
import { createTransferService } from '../packages/application/src/transfer-service.ts';
import { canonicalDocumentInventorySnapshot, planDocumentInventoryMigration } from '../packages/domain/src/document-inventory-effects.ts';
import type { DocumentInventoryAnchor, DocumentInventorySnapshot } from '../packages/domain/src/document-inventory-effects.ts';
import type { SalesDocument, SalesDraft } from '../packages/domain/src/documents.ts';
import type { SalesTransaction, SalesUnitOfWork } from '../packages/application/src/ports.ts';
import type { TransferDocument, TransferTransaction, TransferUnitOfWork } from '../packages/application/src/transfer-ports.ts';
import { entityId, minorAmount, quantity, version, QUANTITY_MIN } from '../packages/domain/src/values.ts';
import { actor, fixture, ids, sid, syntheticDraft, SYNTHETIC_RULES } from './support/synthetic-fixtures.ts';
import { actor as transferActor, fixture as transferFixture, draft as transferDraft, ids as transferIds } from './support/synthetic-transfer.ts';
const time = '2026-11-02T10:00:00Z';
const migrationOp = sid('operation', 900000);
function makeAnchor(snapshot: DocumentInventorySnapshot): DocumentInventoryAnchor {
  return planDocumentInventoryMigration({ snapshot,
    source: { batchId: sid('operation', 900001), sourceRecordId: sid('operation', 900002), sourceSystem: 'SYNTHETIC_UNIFIED', sourceEntityType: snapshot.kind, sourceKey: 'synthetic-source', sourceRecordSha256: 'a'.repeat(64) },
    receipt: { id: migrationOp, action: 'MIGRATE_DOCUMENT', status: 'COMMITTED', targetKind: snapshot.kind, targetId: snapshot.header.id,
      targetVersion: snapshot.header.version, actorAccountId: actor.accountId, completedAt: time },
    audit: { operationId: migrationOp, actorAccountId: actor.accountId, occurredAt: time, oldVersion: null, newVersion: snapshot.header.version },
    coverage: { state: 'CONFIRMED', baselineBatchId: sid('operation', 900003), baselineManifestSha256: 'b'.repeat(64), cutoffAt: '2026-11-02T09:00:00Z', snapshotKey: canonicalDocumentInventorySnapshot(snapshot) },
  }).anchor;
}
function importedSales(status: 'APPROVED'|'DRAFT' = 'APPROVED', q = '10'): SalesDocument {
  const draft = syntheticDraft('SALE', [q]);
  return { ...draft, header: { ...draft.header, responsibleStaffId: null, status, version: version(4), createdByAccountId: null, createdHallId: null,
    createdAt: null, updatedAt: null, approvedByAccountId: null, approvedAt: null } };
}
function salesHarness(document = importedSales(), options: { anchor?: DocumentInventoryAnchor; missingRead?: boolean; rules?: SalesBusinessRules; facts?: NativeSalesReferenceFacts } = {}) {
  const f = fixture(); f.store.seedCutoffHistory(document);
  f.store.seedBalance({ warehouseId: ids.warehouse, skuId: ids.sku, quantity: quantity('100'), version: version(1), lastOperationId: null, updatedAt: time });
  let anchorReads = 0, sequence = 910000;
  const unitOfWork: SalesUnitOfWork = { transaction<T>(work: (tx: SalesTransaction) => Promise<T>) {
    return f.store.transaction(tx => work({ ...tx, ...(options.missingRead ? { async getBalance() { return undefined; } } : {}),
      ...(options.facts ? { async getCurrentSalesReferenceFacts() { return structuredClone(options.facts!); } } : {}),
      async getDocumentInventoryAnchor(kind, documentId) { anchorReads++; assert.equal(kind, 'SALES'); assert.equal(documentId, document.header.id); return options.anchor ?? makeAnchor({ kind: 'SALES', ...document }); } }));
  } };
  const service = createSalesService({ unitOfWork, authorization: { async assertAllowed() {} }, rules: options.rules ?? SYNTHETIC_RULES,
    now: () => time, newId: kind => sid(kind, sequence++) });
  return { ...f, service, anchorReads: () => anchorReads };
}

test('SYNTHETIC unified ordinary SALES: imported approved10 unapprove110 edit12 approve98, later real-ledger reversal110', async () => {
  const f = salesHarness(), original = f.document();
  const unapprove = { action: 'UNAPPROVE', actor, requestKey: 'unapprove', salesId: ids.sales, expectedVersion: version(4) } as const;
  const [u1,u2] = await Promise.all([f.service.execute(unapprove), f.service.execute(unapprove)]);
  assert.deepEqual(u1,u2); assert.equal(f.balance(),110n); assert.equal(f.store.snapshot().ledger.length,1);
  assert.equal(f.store.snapshot().ledger[0]?.baselineAnchorOperationId,migrationOp); assert.equal(f.store.snapshot().ledger[0]?.reversesEntryId,null);
  const edited = syntheticDraft('SALE',['12']);
  await f.service.execute({ action:'SAVE',actor,requestKey:'edit',expectedVersion:version(5),draft:edited });
  assert.equal(f.balance(),110n); assert.equal(f.document().header.createdByAccountId,null); assert.equal(f.document().header.createdAt,null);
  await f.service.execute({ action:'APPROVE',actor,requestKey:'approve',expectedVersion:version(6),salesId:ids.sales });
  assert.equal(f.balance(),98n); const realApproval = f.store.snapshot().ledger[1]!;
  await f.service.execute({ action:'UNAPPROVE',actor,requestKey:'unapprove-again',expectedVersion:version(7),salesId:ids.sales });
  assert.equal(f.balance(),110n); assert.equal(f.store.snapshot().ledger[2]?.reversesEntryId,realApproval.id);
  assert.equal(f.store.snapshot().ledger[2]?.baselineAnchorOperationId ?? null,null); assert.equal(f.anchorReads(),1);
  assert.equal(original.header.createdAt,null); assert.equal(original.header.approvedAt,null);
});

function retainedUnknownSalesFixture() {
  const base=importedSales('APPROVED','16'),method=sid('paymentMethod',31),product=sid('product',980001);
  const original:SalesDocument={...base,lines:base.lines.map(line=>({...line,pricingRule:null,discountTenths:null,zeroConfirmed:null,isGift:null,allocatedDiscount:null,
    snapshot:{productCode:null,productName:null,colorName:null,fitName:null,sizeName:null,barcode:null}})),
    settlements:Array.from({length:16},(_,i)=>({...base.settlements[0]!,id:sid('settlement',980010+i),lineNo:i+1,amount:minorAmount('125'),paymentMethodId:null}))};
  const facts:NativeSalesReferenceFacts={salesId:ids.sales,hall:{id:ids.hall,enabled:true},warehouse:{id:ids.warehouse,hallId:ids.hall,enabled:true},customer:{id:ids.customer,enabled:true},salesperson:null,
    paymentAccounts:[{id:ids.payment,methodId:method,enabled:true,methodEnabled:true}],skus:[{id:ids.sku,productId:product,enabled:true,snapshot:base.lines[0]!.snapshot}],
    products:[{id:product,enabled:true,referencePrice:minorAmount('125'),minimumPrice:minorAmount('125')}],barcodes:[],retainedLines:original.lines};
  return {original,facts};
}

test('SYNTHETIC unchanged approved economics: real unapprove→memo SAVE→reapprove retains all null facts and 16 payments across later cycles',async()=>{
  const {original,facts}=retainedUnknownSalesFixture();
  const f=salesHarness(original,{rules:createNativeTransactionSalesBusinessRules(),facts});
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'unknown-u',expectedVersion:version(4),salesId:ids.sales});assert.equal(f.balance(),116n);
  const current=f.document(),memo:SalesDraft={header:{...current.header,note:'SYNTHETIC memo only'},lines:current.lines.filter(line=>line.isCurrent),settlements:current.settlements};
  await f.service.execute({action:'SAVE',actor,requestKey:'unknown-memo',expectedVersion:version(5),draft:memo});
  const approve={action:'APPROVE',actor,requestKey:'unknown-a',expectedVersion:version(6),salesId:ids.sales} as const;
  const a=await f.service.execute(approve);assert.equal(f.balance(),100n);assert.deepEqual(await f.service.execute(approve),a);assert.equal(f.balance(),100n);
  assert.deepEqual(f.document().lines,original.lines);assert.deepEqual(f.document().settlements,original.settlements);assert.equal(f.document().header.createdByAccountId,null);
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'unknown-u2',expectedVersion:version(7),salesId:ids.sales});assert.equal(f.balance(),116n);
  await f.service.execute({action:'APPROVE',actor,requestKey:'unknown-a2',expectedVersion:version(8),salesId:ids.sales});assert.equal(f.balance(),100n);
  assert.deepEqual(f.document().lines,original.lines);assert.deepEqual(f.document().settlements,original.settlements);assert.equal(f.document().settlements.length,16);
});

test('SYNTHETIC retained approval keeps current reference/minimum/CAS and atomic rollback guards',async()=>{
  const {original,facts}=retainedUnknownSalesFixture(),options={rules:createNativeTransactionSalesBusinessRules(),facts},f=salesHarness(original,options);
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'guard-u',expectedVersion:version(4),salesId:ids.sales});
  const before=f.store.snapshot(),approve={action:'APPROVE',actor,requestKey:'guard-a',expectedVersion:version(5),salesId:ids.sales} as const;
  await assert.rejects(f.service.execute({...approve,expectedVersion:version(4)}),{code:'VERSION_CONFLICT'});assert.deepEqual(f.store.snapshot(),before);
  options.facts={...facts,paymentAccounts:facts.paymentAccounts.map(a=>({...a,methodEnabled:false}))};
  await assert.rejects(f.service.execute(approve),{code:'SALES_REFERENCE_UNAVAILABLE'});assert.deepEqual(f.store.snapshot(),before);
  options.facts={...facts,products:facts.products.map(p=>({...p,minimumPrice:minorAmount('126')}))};
  await assert.rejects(f.service.execute(approve),{code:'BELOW_MINIMUM_PRICE'});assert.deepEqual(f.store.snapshot(),before);
  options.facts=facts;f.store.failNextAt='receipt';await assert.rejects(f.service.execute(approve),/SYNTHETIC injected failure/);assert.deepEqual(f.store.snapshot(),before);
  await f.service.execute(approve);assert.equal(f.balance(),100n);assert.deepEqual(f.document().settlements,original.settlements);
});
test('SYNTHETIC actual prior approval never blesses changed unknown quantity, money or payment occurrences',async()=>{
  const {original,facts}=retainedUnknownSalesFixture(),f=salesHarness(original,{rules:createNativeTransactionSalesBusinessRules(),facts});
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'change-u',expectedVersion:version(4),salesId:ids.sales});
  const current=f.document(),before=f.store.snapshot(),changed:SalesDraft={header:{...current.header,grossAmount:minorAmount('2125'),netDue:minorAmount('2125')},lines:current.lines.map(l=>({...l,quantity:quantity('17'),lineAmount:minorAmount('2125')})),settlements:current.settlements};
  await assert.rejects(f.service.execute({action:'SAVE',actor,requestKey:'change-s',expectedVersion:version(5),draft:changed}),{code:'DISCOUNT_ALLOCATION_MISMATCH'});assert.deepEqual(f.store.snapshot(),before);
  const paymentEdit:SalesDraft={header:current.header,lines:current.lines,settlements:current.settlements.map((r,i)=>i===0?{...r,amount:minorAmount('126')}:r)};
  await assert.rejects(f.service.execute({action:'SAVE',actor,requestKey:'payment-s',expectedVersion:version(5),draft:paymentEdit}),{code:'INVALID_SETTLEMENT'});assert.deepEqual(f.store.snapshot(),before);
});

test('SYNTHETIC unified ordinary SALES: imported draft can save and approve with full ordinary effect, no anchor read', async () => {
  const f = salesHarness(importedSales('DRAFT'));
  await f.service.execute({action:'SAVE',actor,requestKey:'edit',expectedVersion:version(4),draft:syntheticDraft('SALE',['12'])});
  assert.equal(f.balance(),100n); assert.equal(f.document().header.createdByAccountId,null);
  await f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(5),salesId:ids.sales});
  assert.equal(f.balance(),88n); assert.equal(f.anchorReads(),0);
});

test('SYNTHETIC unified ordinary SALES: 16 distinct settlements survive save/unapprove/reapprove; equality remains mandatory', async () => {
  const base = syntheticDraft('SALE',['10']), due = base.header.netDue;
  const settlements = Array.from({length:16},(_,i)=>({...base.settlements[0]!,id:sid('settlement',920000+i),lineNo:i+1,amount: i===0?due:minorAmount('0')}));
  const f = salesHarness({ ...importedSales(), settlements });
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'u',expectedVersion:version(4),salesId:ids.sales});
  await f.service.execute({action:'SAVE',actor,requestKey:'s',expectedVersion:version(5),draft:{...base,settlements}});
  await f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(6),salesId:ids.sales});
  assert.deepEqual(f.document().settlements,settlements); assert.equal(f.document().settlements.length,16);
  const mismatch = salesHarness({...importedSales('DRAFT'),settlements:settlements.map((r,i)=>i===0?{...r,amount:minorAmount('1')}:r)});
  await assert.rejects(mismatch.service.execute({action:'APPROVE',actor,requestKey:'bad',expectedVersion:version(4),salesId:ids.sales}),{code:'SETTLEMENT_MISMATCH'});
});

test('SYNTHETIC unified ordinary SALES: anchored unapprove does not require invented pricing metadata', async () => {
  const original = importedSales(), f = salesHarness({...original,lines:original.lines.map(l=>({...l,pricingRule:null,zeroConfirmed:null,allocatedDiscount:null,isGift:null}))});
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'u',expectedVersion:version(4),salesId:ids.sales});
  assert.equal(f.balance(),110n); assert.equal(f.document().lines[0]?.pricingRule,null); assert.equal(f.document().lines[0]?.isGift,null);
});

test('SYNTHETIC unified ordinary SALES: zero-net exchange touches unknown balance and fails before ledger, audit or receipt', async () => {
  const base = {...syntheticDraft('EXCHANGE',['5','-5']),settlements:[{...syntheticDraft('SALE',['1']).settlements[0]!,amount:minorAmount('0')}]}; const doc:SalesDocument = {...base,lines:base.lines.map(l=>({...l,skuId:ids.sku})),header:{...importedSales('DRAFT').header,...base.header,status:'DRAFT',version:version(4),responsibleStaffId:null}};
  const f = salesHarness(doc,{missingRead:true}), before = f.store.snapshot();
  await assert.rejects(f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(4),salesId:ids.sales}),{code:'INVENTORY_NOT_READY'});
  assert.deepEqual(f.store.snapshot(),before);
});

test('SYNTHETIC unified ordinary SALES: full posting preflight catches intermediate signed overflow before append', async () => {
  const base = {...syntheticDraft('EXCHANGE',['1','-1']),settlements:[{...syntheticDraft('SALE',['1']).settlements[0]!,amount:minorAmount('0')}]}; const document:SalesDocument = {...base, lines:base.lines.map(l=>({...l,skuId:ids.sku})), header:{...importedSales('DRAFT').header,...base.header,status:'DRAFT',version:version(4),responsibleStaffId:null}};
  const f = salesHarness(document); f.store.seedBalance({warehouseId:ids.warehouse,skuId:ids.sku,quantity:quantity(QUANTITY_MIN.toString()),version:version(1),lastOperationId:null,updatedAt:time});
  let appends = 0;
  const store = f.store, guarded:SalesUnitOfWork={transaction<T>(work:(tx:SalesTransaction)=>Promise<T>){return store.transaction(tx=>work({...tx,async appendLedger(row){appends++;await tx.appendLedger(row);}}));}};
  let n=930000;const service=createSalesService({unitOfWork:guarded,rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>time,newId:kind=>sid(kind,n++)});
  await assert.rejects(service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(4),salesId:ids.sales}),{code:'QUANTITY_OVERFLOW'});
  assert.equal(appends,0);
});

function importedTransfer():TransferDocument { const draft=transferDraft(['10']); return {...draft,header:{...draft.header,status:'APPROVED',version:version(4),responsibleStaffId:null,
  createdByAccountId:null,createdHallId:null,createdRole:null,createdAt:null,updatedAt:null,approvedByAccountId:null,approvedAt:null}}; }
function transferHarness() {
  const f=transferFixture(), original=importedTransfer();f.store.seedDocument(original,'CUTOFF_HISTORY');
  for(const [warehouseId,q] of [[transferIds.fromWarehouse,'50'],[transferIds.toWarehouse,'70']] as const)f.store.seedBalance({warehouseId,skuId:transferIds.sku,quantity:quantity(q),version:version(1),lastOperationId:null,updatedAt:time});
  let n=940000,reads=0;const unitOfWork:TransferUnitOfWork={transaction<T>(work:(tx:TransferTransaction)=>Promise<T>){return f.store.transaction(tx=>work({...tx,async getDocumentInventoryAnchor(){reads++;return makeAnchor({kind:'TRANSFER',...original});}}));}};
  const service=createTransferService({unitOfWork,authorization:{async assertAllowed(){}},references:{async assertValid(){}},now:()=>time,newId:kind=>sid(kind,n++)});
  return {...f,service,reads:()=>reads};
}
test('SYNTHETIC unified ordinary TRANSFER: imported approved10 50/70→60/60→edit12→48/72 and actual later reversal',async()=>{
  const f=transferHarness();
  const u={action:'UNAPPROVE',actor:transferActor,requestKey:'u',expectedVersion:version(4),transferId:transferIds.transfer} as const;
  await Promise.all([f.service.execute(u),f.service.execute(u)]);assert.equal(f.balance(transferIds.fromWarehouse),60n);assert.equal(f.balance(transferIds.toWarehouse),60n);
  await f.service.execute({action:'SAVE',actor:transferActor,requestKey:'s',expectedVersion:version(5),draft:transferDraft(['12'])});
  assert.equal(f.document().header.createdByAccountId,null);assert.equal(f.document().header.createdRole,null);assert.equal(f.document().header.createdAt,null);
  await f.service.execute({action:'APPROVE',actor:transferActor,requestKey:'a',expectedVersion:version(6),transferId:transferIds.transfer});
  assert.equal(f.balance(transferIds.fromWarehouse),48n);assert.equal(f.balance(transferIds.toWarehouse),72n);
  const rows=f.store.snapshot().ledger;assert.equal(rows.length,4);assert.equal(rows.filter(r=>r.baselineAnchorOperationId===migrationOp).length,2);
  await f.service.execute({action:'UNAPPROVE',actor:transferActor,requestKey:'u2',expectedVersion:version(7),transferId:transferIds.transfer});
  assert.equal(f.balance(transferIds.fromWarehouse),60n);assert.equal(f.balance(transferIds.toWarehouse),60n);assert.equal(f.reads(),1);
  assert.deepEqual(f.store.snapshot().ledger.slice(4).map(r=>r.reversesEntryId),rows.slice(2).map(r=>r.id));
});


test('SYNTHETIC unified ordinary SALES: exact untouched pricing unknowns survive memo save, changed economics requires explicit facts',async()=>{
  const original=importedSales('DRAFT'),document={...original,lines:original.lines.map(line=>({...line,pricingRule:null,zeroConfirmed:null,isGift:null,allocatedDiscount:null}))};
  const rules=createCandidateSalesBusinessRules({sku(skuId){return {id:skuId,productId:sid('product',950000),enabled:true};},
    productPricing(productId){return {id:productId,enabled:true,referencePrice:minorAmount('125'),minimumPrice:null};},assertDocumentReferences(){}});
  const f=salesHarness(document,{rules}),draft:SalesDraft={header:{...document.header,note:'SYNTHETIC NOTE CHANGED'},lines:document.lines,settlements:document.settlements};
  await f.service.execute({action:'SAVE',actor,requestKey:'memo',expectedVersion:version(4),draft});
  assert.equal(f.document().lines[0]?.allocatedDiscount,null);assert.equal(f.document().header.createdByAccountId,null);assert.equal(f.document().header.createdAt,null);
  await assert.rejects(f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(5),salesId:ids.sales}),{code:'UNKNOWN_PRICING_FACTS'});
  const changed={...draft,lines:draft.lines.map(line=>({...line,quantity:quantity('12')}))};
  await assert.rejects(f.service.execute({action:'SAVE',actor,requestKey:'quantity',expectedVersion:version(5),draft:changed}),{code:'LINE_AMOUNT_MISMATCH'});
  assert.equal(f.balance(),100n);
});

test('SYNTHETIC unified ordinary SALES: current actual staff is captured while original unknown creator remains null',async()=>{
  const f=salesHarness(importedSales('DRAFT')); const staffId=sid('staff',950001);
  f.store.seedIdentity({accountId:actor.accountId,staffId,role:'WAREHOUSE',loginEnabled:true,employmentStatus:'在职',hallId:actor.hallId,hallEnabled:true});
  await f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(4),salesId:ids.sales});
  assert.equal(f.document().header.createdByAccountId,null);assert.equal(f.document().header.createdAt,null);
  assert.equal(f.document().header.approvedByAccountId,actor.accountId);assert.equal(f.document().header.approvedByStaffId,staffId);assert.equal(f.document().header.approvedAt,time);
  await f.service.execute({action:'UNAPPROVE',actor,requestKey:'u',expectedVersion:version(5),salesId:ids.sales});
  assert.equal(f.document().header.approvedByStaffId,null);assert.equal(f.document().header.approvedAt,null);
  const approvalAudit=f.store.snapshot().audit.find(row=>row.action==='APPROVE'),unapprovalAudit=f.store.snapshot().audit.find(row=>row.action==='UNAPPROVE');
  assert.equal(approvalAudit?.after.header.approvedByStaffId,staffId);assert.equal(unapprovalAudit?.before?.header.approvedByStaffId,staffId);
  assert.equal(unapprovalAudit?.after.header.approvedByStaffId,null);
});

test('SYNTHETIC unified native proposal: 16 settlements retain original identities under existing payload limits',async()=>{
  const {parseNativeSalesSaveProposal,parseNativeSalesExistingProposal}=await import('../packages/application/src/native-sales-preparation.ts');
  const proposal={salesId:ids.sales,businessType:'SALE' as const,businessDate:'2026-11-02',note:null,hallId:ids.hall,customerId:ids.customer,salespersonId:null,warehouseId:ids.warehouse,
    orderDiscount:'0',lines:[{existingLineId:ids.line,skuId:ids.sku,quantity:'10',dealPrice:'1.25',pricingRule:'UNIT_PRICE' as const,discountTenths:null,isGift:false,zeroConfirmed:false}],
    settlements:Array.from({length:16},(_,i)=>({existingSettlementId:sid('settlement',960000+i),paymentAccountId:ids.payment,paymentMethodId:sid('paymentMethod',31),direction:'RECEIVE' as const,amount:i===0?'12.50':'0'}))};
  assert.equal(parseNativeSalesSaveProposal(proposal).settlements.length,16);
  assert.equal(parseNativeSalesExistingProposal({...proposal,expectedVersion:4}).settlements.length,16);
});

test('SYNTHETIC unified sparse zero: first anchor unapproval may use explicit published-zero proof, never absent-row default',async()=>{
  const {SyntheticStore}=await import('./support/synthetic-store.ts');
  const base=syntheticDraft('EXCHANGE',['5','-5']), original:SalesDocument={...importedSales(),...base,lines:base.lines.map(line=>({...line,skuId:ids.sku})),header:{...importedSales().header,...base.header,status:'APPROVED',version:version(4),responsibleStaffId:null}};
  for(const hasProof of [false,true]){
    const store=new SyntheticStore();store.seedCutoffHistory(original);let sequence=970000,proofs=0;
    const unitOfWork:SalesUnitOfWork={transaction<T>(work:(tx:SalesTransaction)=>Promise<T>){return store.transaction(tx=>work({...tx,
      async getDocumentInventoryAnchor(){return makeAnchor({kind:'SALES',...original});},
      ...(hasProof?{async assertAbsentBalanceIsPublishedZero(){proofs++;assert.equal((await tx.listSalesLedger(ids.sales)).length,0);}}:{})}));}};
    const service=createSalesService({unitOfWork,rules:SYNTHETIC_RULES,authorization:{async assertAllowed(){}},now:()=>time,newId:kind=>sid(kind,sequence++)});
    const command={action:'UNAPPROVE',actor,requestKey:'u',expectedVersion:version(4),salesId:ids.sales} as const;
    if(!hasProof){await assert.rejects(service.execute(command),{code:'INVENTORY_NOT_READY'});assert.equal(store.snapshot().ledger.length,0);}
    else{await service.execute(command);assert.equal(store.snapshot().ledger.length,2);assert.equal(store.snapshot().balances.get(JSON.stringify([ids.warehouse,ids.sku]))?.quantity,0n);assert.equal(proofs,2);}
  }
});

test('SYNTHETIC unified ordinary SALES: unknown original display snapshots do not require invention for factual stock approval',async()=>{
  const original=importedSales('DRAFT'),document={...original,lines:original.lines.map(line=>({...line,snapshot:{...line.snapshot,productCode:null,productName:null,colorName:null,fitName:null,sizeName:null}}))};
  const f=salesHarness(document);
  await f.service.execute({action:'APPROVE',actor,requestKey:'a',expectedVersion:version(4),salesId:ids.sales});
  assert.equal(f.balance(),90n);assert.equal(f.document().lines[0]?.snapshot.productName,null);
});

test('SYNTHETIC decoded SAVE retains incomplete pricing only as draft; approval and null snapshot guards remain',async()=>{
  const {parseSalesCommand}=await import('../apps/api/src/input.ts');
  const f=salesHarness(importedSales('DRAFT')),base=syntheticDraft('SALE',['10']);
  const wire=(value:unknown)=>JSON.parse(JSON.stringify(value,(_k,v:unknown)=>typeof v==='bigint'?v.toString():v));
  const incomplete={...base,lines:base.lines.map(l=>({...l,pricingRule:null,isGift:null}))};
  await f.service.execute(parseSalesCommand(wire({action:'SAVE',requestKey:'pricing',expectedVersion:4,draft:incomplete}),actor));
  assert.equal(f.document().header.version,5);assert.equal(f.document().lines[0]!.pricingRule,null);assert.equal(f.balance(),100n);
  const saved=f.store.snapshot();
  await assert.rejects(f.service.execute({action:'APPROVE',actor,requestKey:'pricing-approve',expectedVersion:version(5),salesId:ids.sales}),{code:'UNKNOWN_PRICING_FACTS'});
  assert.deepEqual(f.store.snapshot(),saved);
  const snapshot={...base,lines:base.lines.map(l=>({...l,snapshot:{...l.snapshot,productName:null}}))};
  await assert.rejects(f.service.execute(parseSalesCommand(wire({action:'SAVE',requestKey:'snapshot',expectedVersion:5,draft:snapshot}),actor)),{code:'UNKNOWN_SNAPSHOT_FACTS'});
  assert.deepEqual(f.store.snapshot(),saved);assert.equal(f.balance(),100n);
});

// Explicit synthetic fact fixtures: original historical SALE retains mixed signs.
function mixedHistoricSale(qs=['8','-3']):SalesDocument {
 const base=syntheticDraft('EXCHANGE',qs);
 return {...base,lines:base.lines.map(l=>({...l,skuId:ids.sku})),header:{...importedSales().header,...base.header,businessType:'SALE',status:'APPROVED',version:version(4)}};
}
test('SYNTHETIC historical mixed SALE: original first reversal, edited signed reapproval, exact retry and subsequent reversal',async()=>{
 const original=mixedHistoricSale(),rules=createCandidateSalesBusinessRules({sku(skuId){assert.equal(skuId,ids.sku);return {id:skuId,productId:sid('product',950001),enabled:true};},productPricing(productId){return {id:productId,enabled:true,referencePrice:minorAmount('125'),minimumPrice:null};},assertDocumentReferences(document){assert.equal(document.header.warehouseId,ids.warehouse);assert.equal(document.header.customerId,ids.customer);assert.ok(document.settlements.every(row=>row.paymentAccountId===ids.payment));}}),f=salesHarness(original,{rules});
 const undo={action:'UNAPPROVE',actor,requestKey:'mixed-u',salesId:ids.sales,expectedVersion:version(4)} as const;
 const first=await f.service.execute(undo);assert.equal(f.balance(),105n);
 const afterFirst=f.store.snapshot();assert.deepEqual(await f.service.execute(undo),first);assert.deepEqual(f.store.snapshot(),afterFirst);
 const edited=mixedHistoricSale(['2','-7']);
 const draft:SalesDraft={header:{...f.document().header,grossAmount:edited.header.grossAmount,netDue:edited.header.netDue},lines:edited.lines,settlements:edited.settlements};
 await f.service.execute({action:'SAVE',actor,requestKey:'mixed-s',expectedVersion:version(5),draft});assert.equal(f.balance(),105n);
 const approve={action:'APPROVE',actor,requestKey:'mixed-a',expectedVersion:version(6),salesId:ids.sales} as const;
 const result=await f.service.execute(approve);assert.equal(f.balance(),110n);assert.equal(result.ledgerEntryIds.length,2);
 const afterApprove=f.store.snapshot();assert.deepEqual(await f.service.execute(approve),result);assert.deepEqual(f.store.snapshot(),afterApprove);
 await f.service.execute({action:'UNAPPROVE',actor,requestKey:'mixed-u2',expectedVersion:version(7),salesId:ids.sales});assert.equal(f.balance(),105n);
 assert.equal(f.document().header.businessType,'SALE');assert.equal(f.document().header.number,original.header.number);
 assert.deepEqual(f.document().lines.filter(l=>l.isCurrent).map(l=>l.id),original.lines.map(l=>l.id));
});
test('SYNTHETIC historical mixed SALE: second ledger failure rolls back whole transaction and retry commits once',async()=>{
 const f=salesHarness(mixedHistoricSale()),before=f.store.snapshot();f.store.failNextAt='ledger:2';
 const command={action:'UNAPPROVE',actor,requestKey:'mixed-fail',salesId:ids.sales,expectedVersion:version(4)} as const;
 await assert.rejects(f.service.execute(command),/SYNTHETIC injected failure/);assert.deepEqual(f.store.snapshot(),before);
 const result=await f.service.execute(command);assert.equal(f.balance(),105n);assert.equal(result.ledgerEntryIds.length,2);
 const committed=f.store.snapshot();assert.deepEqual(await f.service.execute(command),result);assert.deepEqual(f.store.snapshot(),committed);
});
