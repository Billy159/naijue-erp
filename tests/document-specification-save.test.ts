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
