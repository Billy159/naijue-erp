/** SYNTHETIC ONLY. No PostgreSQL engine, real locks or actual import evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDocumentSkuSelection, documentCreatedSkuCode } from '../packages/application/src/document-specification.ts';
import { parseSalesCommand } from '../apps/api/src/input.ts';
import { parseTransferCommand } from '../apps/api/src/transfer-input.ts';
import { createTransferService } from '../packages/application/src/transfer-service.ts';
import { createNativeManualTransferReferences } from '../packages/application/src/native-transfer-preparation.ts';
import { createSalesService } from '../packages/application/src/sales-service.ts';
import { createNativeManualSalesBusinessRules } from '../packages/application/src/native-sales-preparation.ts';
import type { SalesDependencies } from '../packages/application/src/ports.ts';
import type { TransferDependencies } from '../packages/application/src/transfer-ports.ts';
import { loadNativeTransferSnapshots } from '../adapters/postgres/src/native-transfer-snapshots.ts';
import { fixture, actor as transferActor, ids as transferIds } from './support/synthetic-transfer.ts';
import { actor, ids, sid, snapshot } from './support/synthetic-fixtures.ts';
import { SyntheticStore } from './support/synthetic-store.ts';
import { minorAmount } from '../packages/domain/src/values.ts';
import Fastify from 'fastify';
import {createSalesHttpPlugin} from '../apps/api/src/sales-http.ts';
import {requestHash} from '../packages/application/src/request-hash.ts';
const spec={productId:sid('product',100),colorId:sid('color',101),fitId:sid('fit',102),sizeId:sid('size',103)};
const transferProposal=()=>({transferId:null,businessDate:'2026-10-23',note:null,fromWarehouseId:transferIds.fromWarehouse,toWarehouseId:transferIds.toWarehouse,
  lines:[{existingLineId:null,spec,quantity:'2'}]});
const salesProposal=()=>({salesId:null,businessType:'SALE',businessDate:'2026-10-23',note:null,hallId:ids.hall,customerId:ids.customer,salespersonId:null,
  warehouseId:ids.warehouse,orderDiscount:'0.00',lines:[{existingLineId:null,spec,quantity:'2',dealPrice:'1.25',pricingRule:'UNIT_PRICE',discountTenths:null,isGift:false,zeroConfirmed:false}],settlements:[]});

test('v11 exact selection never accepts a client group/code/barcode or both identity variants',()=>{
  assert.deepEqual(parseDocumentSkuSelection({spec}),{spec});assert.equal(documentCreatedSkuCode(ids.sku),`NJNEW-${ids.sku.replaceAll('-','')}`);
  for(const invalid of [{spec:{...spec,sizeGroupId:sid('sizeGroup',9)}},{spec,skuId:ids.sku},{spec,code:'fake'},{spec:{...spec,barcode:null}},
    {spec:{...spec,sizeId:null}},{spec:{...spec,sizeId:'guess'}},Object.create({spec})])assert.throws(()=>parseDocumentSkuSelection(invalid));
  let read=false;assert.throws(()=>parseDocumentSkuSelection(Object.defineProperty({},'spec',{enumerable:true,get(){read=true;return spec;}})));assert.equal(read,false);
});
test('v11 original command parsers accept SAVE proposal only as an exclusive branch and reject zero rows/forged group',()=>{
  const sales={action:'SAVE',requestKey:'v11-sales',expectedVersion:null,proposal:salesProposal()};
  const transfer={action:'SAVE',requestKey:'v11-transfer',expectedVersion:null,proposal:transferProposal()};
  assert.ok('proposal' in parseSalesCommand(sales,actor));assert.ok('proposal' in parseTransferCommand(transfer,transferActor));
  for(const command of [{...sales,draft:{}},{...sales,expectedVersion:1},{...sales,proposal:{...sales.proposal,lines:[{...sales.proposal.lines[0],quantity:'0'}]}},
    {...sales,proposal:{...sales.proposal,lines:[{...sales.proposal.lines[0],spec:{...spec,sizeGroupId:sid('sizeGroup',9)}}]}}])assert.throws(()=>parseSalesCommand(command,actor));
  for(const command of [{...transfer,draft:{}},{...transfer,expectedVersion:1},{...transfer,proposal:{...transfer.proposal,lines:[{...transfer.proposal.lines[0],quantity:'0'}]}}])assert.throws(()=>parseTransferCommand(command,transferActor));
});
test('v11 transfer proposal uses one original callback, current access before resolution, native NULL snapshot, original-key replay before any allocation',async()=>{
  const f=fixture();let callbacks=0,resolutions=0,allocations=0;const events:string[]=[];
  const dependencies:TransferDependencies={...f.dependencies,references:createNativeManualTransferReferences(),newId:kind=>{allocations++;return f.dependencies.newId(kind);},
    authorization:{async assertAllowed(...a){events.push('authorize');return f.dependencies.authorization.assertAllowed(...a);}},
    unitOfWork:{transaction(work){callbacks++;return f.store.transaction(tx=>work({...tx,
      async resolveDocumentSkus(input){resolutions++;events.push('resolve');assert.equal(input.scope.kind,'TRANSFER');assert.deepEqual(input.selections,[{spec}]);return [transferIds.sku];},
      async getCurrentTransferSnapshots(){return new Map([[transferIds.sku,{...snapshot,barcode:null}]]);}
    }));}}};
  const service=createTransferService(dependencies),command=parseTransferCommand({action:'SAVE',requestKey:'v11-transfer',expectedVersion:null,proposal:transferProposal()},transferActor);
  const result=await service.execute(command);assert.equal(callbacks,1);assert.equal(resolutions,1);assert.ok(events.indexOf('authorize')<events.indexOf('resolve'));
  const stored=f.store.snapshot();assert.equal(stored.transfers.get(result.transferId)!.document.lines[0]!.snapshot.barcode,null);
  assert.equal(stored.receipts.size,1);assert.equal(stored.audit.length,1);assert.equal(stored.ledger.length,0);
  const count=allocations;assert.deepEqual(await service.execute(command),result);assert.equal(resolutions,1);assert.equal(allocations,count);
  f.revokeAccess();await assert.rejects(service.execute(command),{code:'FORBIDDEN'});assert.equal(resolutions,1);
});
test('v11 stale target/revoked actor and later receipt failure cannot commit partial proposal SAVE',async()=>{
  for(const mode of ['revoked','receipt'] as const){const f=fixture();let resolved=0;
    const dependencies:TransferDependencies={...f.dependencies,references:createNativeManualTransferReferences(),unitOfWork:{transaction(work){return f.store.transaction(tx=>work({...tx,
      async resolveDocumentSkus(){resolved++;return [transferIds.sku];},async getCurrentTransferSnapshots(){return new Map([[transferIds.sku,{...snapshot,barcode:null}]]);}}));}}};
    const before=f.store.snapshot();if(mode==='revoked')f.revokeAccess();else f.store.failNextAt='receipt';
    await assert.rejects(createTransferService(dependencies).execute(parseTransferCommand({action:'SAVE',requestKey:`v11-${mode}`,expectedVersion:null,proposal:transferProposal()},transferActor)));
    assert.deepEqual(f.store.snapshot(),before);assert.equal(resolved,mode==='revoked'?0:1);
  }
});
test('v11 sales proposal uses original exact pricing and receipt, with one callback and no prepare nonce or stock posting',async()=>{
  const store=new SyntheticStore();let sequence=3000,callbacks=0,resolved=0;
  const dependencies:SalesDependencies={now:()=> '2026-10-23T12:00:00Z',newId:kind=>sid(kind,sequence++),rules:createNativeManualSalesBusinessRules(),authorization:{async assertAllowed(){}},
    unitOfWork:{transaction(work){callbacks++;return store.transaction(tx=>work({...tx,
      async resolveDocumentSkus(input){resolved++;assert.equal(input.scope.kind,'SALES');return [ids.sku];},
      async getCurrentSalesSnapshots(){return new Map([[ids.sku,{...snapshot,barcode:null}]]);},
      async getCurrentSalesReferenceFacts(d){return {salesId:d.header.id,hall:{id:ids.hall,enabled:true},customer:{id:ids.customer,enabled:true},
        warehouse:{id:ids.warehouse,hallId:ids.hall,enabled:true},salesperson:null,
        skus:[{id:ids.sku,productId:spec.productId,enabled:true,snapshot:{...snapshot,barcode:null}}],
        products:[{id:spec.productId,enabled:true,referencePrice:minorAmount('125'),minimumPrice:null}],paymentAccounts:[],barcodes:[],retainedLines:[]};}
    }));}}};
  const command=parseSalesCommand({action:'SAVE',requestKey:'v11-sales',expectedVersion:null,proposal:salesProposal()},actor),service=createSalesService(dependencies);
  const result=await service.execute(command);assert.equal(callbacks,1);assert.equal(resolved,1);
  const saved=store.snapshot();assert.equal(saved.headers.get(result.salesId)!.netDue,250n);assert.equal(saved.receipts.size,1);assert.equal(saved.ledger.length,0);
  const allocated=sequence;assert.deepEqual(await service.execute(command),result);assert.equal(sequence,allocated);assert.equal(resolved,1);
});
test('v11 manual barcode distinguishes actual absence from missing SKU, duplicate MAIN and failed MAIN read',async()=>{
  const target={id:ids.sku,product_code:'P',product_name:'N',color_name:'C',fit_name:'F',size_name:'S'};
  for(const barcode of [null,'000123']){
    const queries:string[]=[];const result=await loadNativeTransferSnapshots(async sql=>{queries.push(sql);const rows=sql.includes(':schema')?[{installed:true}]:sql.includes(':targets')?[target]:barcode===null?[]:[{sku_id:ids.sku,barcode}];return {rows,rowCount:rows.length};},[ids.sku]);
    assert.equal(result.get(ids.sku)!.barcode,barcode);assert.equal(queries.length,3);assert.ok(queries[1]!.includes('FOR SHARE OF s, p, c, f, sz, m'));assert.ok(queries[2]!.includes("barcode_kind='MAIN'"));
  }
  for(const failure of ['missing','duplicate','read'] as const){await assert.rejects(loadNativeTransferSnapshots(async sql=>{
    if(sql.includes(':schema'))return {rows:[{installed:true}],rowCount:1};
    if(sql.includes(':targets'))return {rows:failure==='missing'?[]:[target],rowCount:failure==='missing'?0:1};
    if(failure==='read')throw Error('SYNTHETIC query failure');return {rows:[{sku_id:ids.sku,barcode:'000123'},{sku_id:ids.sku,barcode:'000456'}],rowCount:2};
  },[ids.sku]));}
});

function t02PricingFixture(){
 const store=new SyntheticStore();let sequence=12000,reference=minorAmount('10000'),resolutions=0;
 const dependencies:SalesDependencies={now:()=> '2026-10-26T00:00:00Z',newId:kind=>sid(kind,sequence++),rules:createNativeManualSalesBusinessRules(),authorization:{async assertAllowed(){}},
  unitOfWork:{transaction(work){return store.transaction(tx=>work({...tx,
   async resolveDocumentSkus(input){resolutions++;return input.selections.map(s=>s.spec?.sizeId===sid('size',104)?ids.sku2:ids.sku);},
   async getCurrentSalesSnapshots(skus){return new Map(skus.map(sku=>[sku,{...snapshot,barcode:null}]));},
   async getCurrentSalesReferenceFacts(d){return {salesId:d.header.id,hall:{id:ids.hall,enabled:true},customer:{id:ids.customer,enabled:true},warehouse:{id:ids.warehouse,hallId:ids.hall,enabled:true},salesperson:{id:sid('staff',11999),employmentStatus:'在职'},
    skus:[...new Set(d.lines.map(l=>l.skuId))].map(id=>({id,productId:spec.productId,enabled:true,snapshot:{...snapshot,barcode:null}})),products:[{id:spec.productId,enabled:true,referencePrice:reference,minimumPrice:null}],
    paymentAccounts:[],barcodes:[],retainedLines:[...store.snapshot().lines.values()]};}
  }));}}};
 return {store,dependencies,service:createSalesService(dependencies),reference:(value:string)=>{reference=minorAmount(value);},resolutions:()=>resolutions};
}
function t02Body(quote:string|null='80.00'){
 return {action:'SAVE',requestKey:'t02-original',expectedVersion:null,proposal:{...salesProposal(),salespersonId:sid('staff',11999),businessType:'SALE' as 'SALE'|'RETURN'|'EXCHANGE',lines:[{existingLineId:null as string|null,spec,quantity:'1',dealPrice:quote,pricingRule:'DISCOUNT',discountTenths:80,isGift:false,zeroConfirmed:false}]}};
}
test('T02 atomic quoted discount rejects changed reference and legacy missing quote with no committed state',async()=>{
 for(const [quote,reference,code]of [['80.00','12000','SALES_DISPLAYED_PRICE_CHANGED'],[null,'10000','SALES_PRICE_QUOTE_REQUIRED']] as const){
  const h=t02PricingFixture(),before=h.store.snapshot();h.reference(reference);
  await assert.rejects(h.service.execute(parseSalesCommand(t02Body(quote),actor)),{code});assert.equal(h.resolutions(),1);assert.deepEqual(h.store.snapshot(),before);
 }
});
test('T02 atomic quote uses exact cents retains old reference and accepts equal rounded amount',async()=>{
 const h=t02PricingFixture(),body=t02Body(),saved=await h.service.execute(parseSalesCommand(body,actor));
 let state=h.store.snapshot();assert.equal(state.headers.get(saved.salesId)!.netDue,8000n);assert.equal(state.lines.values().next().value!.referencePrice,10000n);
 h.reference('12000');const line=[...state.lines.values()][0]!;
 const edit={...body,requestKey:'t02-retained',expectedVersion:1,proposal:{...body.proposal,salesId:saved.salesId,lines:[{...body.proposal.lines[0]!,existingLineId:line.id}]}};
 await h.service.execute(parseSalesCommand(edit,actor));state=h.store.snapshot();assert.equal(state.lines.get(line.id)!.referencePrice,10000n);assert.equal(state.headers.get(saved.salesId)!.netDue,8000n);
 const rounded=t02PricingFixture(),roundedBody=t02Body('1.00');roundedBody.proposal.lines[0]!.discountTenths=1;rounded.reference('10001');await rounded.service.execute(parseSalesCommand(roundedBody,actor));assert.equal([...rounded.store.snapshot().lines.values()][0]!.dealPrice,100n);
});
test('T02 atomic UNIT_PRICE signed return gift and confirmed zero keep their existing exact semantics',async()=>{
 for(const mode of ['unit','return','gift','zero'] as const){
  const h=t02PricingFixture(),body=t02Body();
  if(mode==='unit'){Object.assign(body.proposal.lines[0]!,{pricingRule:'UNIT_PRICE',discountTenths:null,dealPrice:'7.25'});h.reference('12000');}
  if(mode==='return'){body.proposal.businessType='RETURN';body.proposal.lines[0]!.quantity='-1';}
  if(mode==='gift'){body.proposal.lines[0]!.isGift=true;body.proposal.lines[0]!.dealPrice=null;}
  if(mode==='zero'){body.proposal.lines[0]!.discountTenths=0;body.proposal.lines[0]!.dealPrice='0.00';body.proposal.lines[0]!.zeroConfirmed=true;}
  const result=await h.service.execute(parseSalesCommand(body,actor));assert.equal(h.store.snapshot().headers.get(result.salesId)!.netDue,mode==='unit'?725n:mode==='return'?-8000n:0n);
 }
});
test('T02 new missing spec on an existing draft rejects changed quote and preserves the existing document',async()=>{
 const h=t02PricingFixture(),body=t02Body(),saved=await h.service.execute(parseSalesCommand(body,actor));
 const before=h.store.snapshot(),old=[...before.lines.values()][0]!;h.reference('12000');
 const changed={...body,requestKey:'t02-new-spec-existing',expectedVersion:1,proposal:{...body.proposal,salesId:saved.salesId,
  lines:[{...body.proposal.lines[0]!,existingLineId:old.id},{...body.proposal.lines[0]!,spec:{...spec,sizeId:sid('size',104)}}]}};
 await assert.rejects(h.service.execute(parseSalesCommand(changed,actor)),{code:'SALES_DISPLAYED_PRICE_CHANGED'});assert.deepEqual(h.store.snapshot(),before);
});
test('T02 committed legacy null replays original hash before any resolution or repricing',async()=>{
 const h=t02PricingFixture(),seed={...t02Body(),requestKey:'t02-seed'},saved=await h.service.execute(parseSalesCommand(seed,actor));
 const legacy=parseSalesCommand({...t02Body(null),requestKey:'t02-legacy-null'},actor);
 // Explicit synthetic historical receipt fixture: original null body hash remains unchanged.
 await h.store.transaction(async tx=>{const receipt=await tx.getReceipt(actor.accountId,seed.requestKey);assert(receipt);await tx.insertReceipt({...receipt,requestKey:legacy.requestKey,requestHash:requestHash({...legacy,actor:{accountId:actor.accountId}})});});
 const before=h.store.snapshot(),reads=h.resolutions();h.reference('12000');assert.deepEqual(await h.service.execute(legacy),saved);assert.equal(h.resolutions(),reads);assert.deepEqual(h.store.snapshot(),before);
});
test('T02 HTTP emits authoritative409 for missing or changed quote without committing a proposal',async t=>{
 const h=t02PricingFixture(),app=Fastify();t.after(()=>app.close());await app.register(createSalesHttpPlugin({dependencies:h.dependencies,authenticate:async()=>actor}));
 for(const [quote,reference,code]of [[null,'10000','SALES_PRICE_QUOTE_REQUIRED'],['80.00','12000','SALES_DISPLAYED_PRICE_CHANGED']] as const){
  h.reference(reference);const before=h.store.snapshot(),r=await app.inject({method:'POST',url:'/sales/commands',payload:t02Body(quote)});
  assert.equal(r.statusCode,409);assert.equal(r.json().error.code,code);assert.deepEqual(h.store.snapshot(),before);
 }
});
