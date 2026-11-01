/** CLOSED SYNTHETIC SOURCE PLAN ONLY. No fixture/issuer/capability brand,
 * driver, SQL writer, target, review, receipt or performance authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildReferenceFixture, freeze } from '../current-native-stock/component/fixture.mjs';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { parseProductMaintenanceCommandV2 } from '../../../../packages/application/src/product-maintenance-validation.ts';
import { parsePartyCommand } from '../../../../packages/application/src/party-maintenance-validation.ts';
import { stableImportId, validateCutoffImportCommand } from '../../../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../../../packages/application/src/request-hash.ts';
import { checkPriceContract } from '../../opt00/pg-component/contract.mjs';
import { parseProductManagementListQuery } from '../../../../packages/application/src/product-management-query-validation.ts';

export const SCALED_SOURCE_ID = 'c20261101ba1a';
export const SOURCE_CONTRACTS = Object.freeze({
  'packages/application/src/product-maintenance-service.ts': 'b20a0742164208c3f8a04a3fae6e8b90fae0212c8612f6db7e9dd12a9bbbe08f',
  'packages/application/src/product-maintenance-validation.ts': '374261e28235241167114c95e992032d6f2838b6661446edf46beb3c532c0585',
  'packages/application/src/inventory-cutoff-import.ts': 'd9089865e417e2a174e36cc0f8cff98ba3311d3837a4d6bfd0c1f5404f0267da',
  'tests/performance/opt02/current-native-stock/component/fixture.mjs': 'a4f120351eb0872ebfd27d95af18dca8df3de5dfb9a357f6a94d2bed6a293e2b',
});
const H = bytes => createHash('sha256').update(bytes).digest('hex');
const id = label => { const h = H('synthetic:scaled-retained-native:' + SCALED_SOURCE_ID + ':' + label);
  return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32); };
const requirePlan = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const sourceArtifact = (name, utf8) => ({ path: 'synthetic:scaled-retained-native:' + SCALED_SOURCE_ID + '/' + name,
  utf8, bytes: Buffer.byteLength(utf8), sha256: H(utf8) });
const cOrder = (a,b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function buildScaledSourcePlan() {
  const base = buildReferenceFixture(), r = base.reference;
  const colors = [{ id: r.colorId, code: '001', name: 'SYNTHETIC COLOR', enabled: true, version: 1 },
    ...Array.from({length:4}, (_,i) => ({ id:id('color:'+i), code:String(i+2).padStart(3,'0'), name:'SYNTHETIC SCALED COLOR '+(i+2), enabled:true,version:1 }))];
  const retainedProducts = [
    {id:r.productId,code:r.expectedProductCode,name:'SYNTHETIC PRODUCT',enabled:true,retailPrice:'1.25'},
    {id:r.disabledProductId,code:r.expectedProductCode+'-DISABLED',name:'SYNTHETIC PRODUCT-DISABLED',enabled:false,retailPrice:'1.25'},
    {id:base.alternateProduct.id,code:base.alternateProduct.code,name:base.alternateProduct.name,enabled:true,retailPrice:'2.50'},
    ...Array.from({length:97},(_,i)=>({id:id('retained-product:'+i),code:'RETAINED_'+SCALED_SOURCE_ID+'_'+String(i+1).padStart(3,'0'),
      name:'SYNTHETIC RETAINED SCALED PRODUCT '+(i+1),enabled:true,retailPrice:'1.25'})),
  ].map((p,i)=>({...p,categoryId:r.categoryId,sizeGroupId:r.targetGroupId,supplierId:null,seasonId:null,
    systemItemCode:i===0?'OPT01':i===1?'OPT01-DISABLED':i===2?'REFERENCE-ALT':'SCALED-REFERENCE-'+i,
    prices:{...checkPriceContract(),retail_price:p.retailPrice},version:1,referenceOnly:true}));
  const retainedSkus = [...base.skus,...retainedProducts.slice(3).map((p,i)=>({id:id('retained-sku:'+i),product_id:p.id,
    color_id:r.colorId,fit_id:r.fitId,size_id:r.sizes[i%23].id,sku_code:'RETAINED-SKU-'+SCALED_SOURCE_ID+'-'+String(i+1).padStart(3,'0'),
    enabled:true,version:1,created_operation_id:null}))];
  const baselines = base.baselines.map(x=>({...x}));
  const absentPairs = base.warehouses.flatMap(w=>retainedSkus.filter(s=>!baselines.some(b=>b.warehouseId===w.id&&b.skuId===s.id))
    .map(s=>({warehouseId:w.id,skuId:s.id,quantity:'0',basis:'CLOSED_SCALED_SOURCE_EXPLICIT_ABSENCE'})));
  const referenceCounts = {...base.referenceCounts,color:5,product:100,sku:100};
  const references = sourceArtifact('references.json',JSON.stringify({format:'SCALED_REFERENCE_SOURCE_V1',sourceOnly:true,
    parentReferenceDataset:base.datasetId,parentReference:r,parentReferenceArtifact:(()=>{const {utf8,...descriptor}=base.artifacts[0];return descriptor;})(),actor:r.actor,retainedProducts,retainedSkus,colors,fit:{id:r.fitId,code:'A'},
    sizes:r.sizes,sizeGroupMembers:r.members,warehouses:base.warehouses,season:base.season,scheme:base.scheme,
    referenceCounts,referenceRows:303,credentials:'NO_CREDENTIALS_GENERATED_OR_INCLUDED'},null,2)+'\n');
  const sourceRows = [...base.warehouses.map((row,i)=>({entity:'WAREHOUSE',sourceKey:'SCALED-WAREHOUSE-'+i,native:row})),
    ...retainedSkus.map((row,i)=>({entity:'SKU',sourceKey:'SCALED-SKU-'+i,native:row})),
    ...baselines.map(row=>({entity:'INVENTORY_BASELINE',sourceKey:row.sourceKey,warehouseId:row.warehouseId,skuId:row.skuId,
      signedQuantity:row.quantity,businessDate:row.businessDate}))];
  const lines=sourceRows.map(row=>JSON.stringify(row)),source=sourceArtifact('source.ndjson',lines.join('\n')+'\n');
  const namespace='synthetic.opt02.scaled-retained-native.'+SCALED_SOURCE_ID;
  const batchId=stableImportId('batch',namespace,'SCALED_COMPLETE_REFERENCE_SOURCE_V1'),cutoffAt='2026-11-01T00:00:00.000Z';
  const expected={WAREHOUSE:2,SKU:100,INVENTORY_LEDGER:4,IMPORT_BATCH:1};
  const manifest=sourceArtifact('manifest.json',JSON.stringify({format:'SCALED_COMPLETE_REFERENCE_MANIFEST_V1',status:'NOT_APPLIED_NOT_PG',authority:'NONE',
    datasetId:SCALED_SOURCE_ID,namespace,batchId,cutoffAt,mappingVersion:'synthetic-legacy-cutoff-v1',
    files:[references,source].map(({utf8,...descriptor})=>descriptor),expected,
    allNativeWarehouseIds:base.warehouses.map(x=>x.id),allNativeSkuIds:retainedSkus.map(x=>x.id),
    nonzeroBaselines:baselines,explicitAbsentPairs:absentPairs,finalDelta:{rows:[],reason:'CLOSED_SYNTHETIC_SOURCE_NO_EXTERNAL_FEED'},
    noTypedProductOrHistorySource:true,noMaintainedSupplierOrProductCreated:true},null,2)+'\n');
  const items=sourceRows.map((row,i)=>({sourceEntityType:row.entity,sourceKey:row.sourceKey,sourceRecordHash:H(lines[i]),sourceFileRef:source.path,
    ...(row.entity==='INVENTORY_BASELINE'?{targetType:'INVENTORY_LEDGER',warehouseId:row.warehouseId,skuId:row.skuId,quantity:BigInt(row.signedQuantity),businessDate:row.businessDate}
      :{targetType:row.entity,targetId:row.native.id})}));
  const envelope={actorAccountId:r.actor.accountId,batchId};
  // Literal FUTURE synthetic source attestations, not an approval or permission
  // to execute. A separately reviewed new host must verify every artifact first.
  const commands=[
    {...envelope,action:'IMPORT_STAGE',requestKey:SCALED_SOURCE_ID+':STAGE',sourceName:namespace,sourceHash:manifest.sha256,sourceManifestRef:manifest.path,cutoffAt,mappingVersion:'synthetic-legacy-cutoff-v1',expected},
    {...envelope,action:'IMPORT_CHUNK',requestKey:SCALED_SOURCE_ID+':MEMBERS',expectedSequence:0,expectedCursor:0,items:items.filter(x=>x.targetType!=='INVENTORY_LEDGER')},
    {...envelope,action:'IMPORT_CHUNK',requestKey:SCALED_SOURCE_ID+':BASELINES',expectedSequence:1,expectedCursor:102,items:items.filter(x=>x.targetType==='INVENTORY_LEDGER')},
    {...envelope,action:'IMPORT_PUBLISH',requestKey:SCALED_SOURCE_ID+':PUBLISH',expectedSequence:2,expectedCursor:106,
      approval:{completeScope:true,absentMeansZero:true,allFilesVerified:true,finalDeltaVerified:true,noUnresolvedExceptions:true,sourceHash:manifest.sha256,sourceManifestRef:manifest.path}},
  ];
  commands.forEach(validateCutoffImportCommand);
  const zero={WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0};
  const checkpoints=[{sequence:0,cursor:0,counts:zero,expected},
    {sequence:1,cursor:102,counts:{...zero,WAREHOUSE:2,SKU:100},expected},
    {sequence:2,cursor:106,counts:{...zero,WAREHOUSE:2,SKU:100,INVENTORY_LEDGER:4},expected},
    {sequence:3,cursor:107,counts:expected,expected}];
  const predictedPublicationResults=commands.map((c,i)=>({operationId:stableImportId('operation',c.actorAccountId,c.requestKey),batchId,
    sequence:checkpoints[i].sequence,cursor:checkpoints[i].cursor,status:i===0?'STAGED':i===3?'IMPORTED':'VALIDATING',
    ledgerEntryIds:i===2?c.items.map(item=>stableImportId('baseline',namespace,item.sourceEntityType,item.sourceKey)).sort():[]}));
  const ids={supplier:id('supplier'),supplierOperation:id('supplier-operation'),supplierAudit:id('supplier-audit'),
    product:id('native-product'),productOperation:id('native-product-operation')};
  const supplier={action:'CREATE',requestKey:SCALED_SOURCE_ID+':SUPPLIER:CREATE',name:'SYNTHETIC SCALED NATIVE SUPPLIER'};
  const cells=colors.flatMap(color=>r.sizes.map(size=>({color,size}))).slice(0,101);
  const allocations=cells.map(({color,size},i)=>({skuId:id('native-sku:'+i),barcodeId:id('native-barcode:'+i),
    colorId:color.id,fitId:r.fitId,sizeId:size.id,colorCode:color.code,fitCode:'A',sizeCode:size.code,
    predictedMainBarcode:'5A8765432'+color.code+size.code}));
  const product={action:'CREATE',requestKey:SCALED_SOURCE_ID+':PRODUCT101SKU:CREATE',values:{productCode:'SCALED_NATIVE_'+SCALED_SOURCE_ID,
    name:'SYNTHETIC ONE NATIVE PRODUCT WITH 101 SKUS',categoryId:r.categoryId,supplierId:ids.supplier,seasonIds:[base.season.id],sizeGroupId:r.targetGroupId,
    year:2026,systemItemCode:'8765432',thickness:null,collarPantsType:null,defaultBarcodeSchemeId:base.scheme.id,enabled:true,
    prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key=>[key,key==='retail_price'?'19.99':key==='purchase_price'?'7.25':null]))},
    skus:allocations.map((a,i)=>({id:null,expectedVersion:null,skuCode:'SCALED-NATIVE-SKU-'+SCALED_SOURCE_ID+'-'+String(i+1).padStart(3,'0'),
      colorId:a.colorId,fitId:a.fitId,sizeId:a.sizeId,enabled:true})),barcodes:[]};
  assert.deepEqual(parseProductMaintenanceCommandV2(product),product);
  parsePartyCommand(supplier,{...r.actor,role:'ADMIN'},'SUPPLIER');
  const expectedProducts=[...retainedProducts.map(p=>({id:p.id,code:p.code,stock:p.id===r.productId?'16':p.id===base.alternateProduct.id?'5':'0',price:p.retailPrice,
      skuCount:retainedSkus.filter(s=>s.product_id===p.id).length})),{id:ids.product,code:product.values.productCode,stock:'0',price:'19.99',skuCount:101}].sort(cOrder);
  const filter={productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]};
  const queries=[1,2].map(page=>parseProductManagementListQuery({page,pageSize:100,filter}));
  const plan={format:'SCALED_RETAINED_NATIVE_SOURCE_PLAN_V1',status:'NOT_APPLIED_NOT_PG',authority:'NONE',sourceOnly:true,
    fixtureBrand:false,physicalTargetAssigned:false,performanceAcceptance:false,datasetId:SCALED_SOURCE_ID,parentReferenceDataset:base.datasetId,
    referenceCounts,referenceRows:303,parentReference:r,season:base.season,scheme:base.scheme,actor:r.actor,colors,extraColors:colors.slice(1),fit:{id:r.fitId,code:'A'},sizes:r.sizes,sizeGroupMembers:r.members,
    retainedProducts,retainedSkus,warehouses:base.warehouses,baselines,absentPairs,artifacts:[references,source,manifest],
    publication:{namespace,batchId,cutoffAt,expected,commands,commandHashes:commands.map(requestHash),checkpoints,predictedResults:predictedPublicationResults},
    native:{ids,supplier,product,allocations,commandInputHash:requestHash({supplier,product}),
      expectedProducts,queries,page1Ids:expectedProducts.slice(0,100).map(x=>x.id),page2Ids:expectedProducts.slice(100).map(x=>x.id),
      plannedNewAdmissions:allocations.flatMap(a=>base.warehouses.map(w=>({warehouseId:w.id,skuId:a.skuId,expectedBasis:'POST_CUTOFF_CREATED',expectedCreatedOperationId:ids.productOperation})))},
    expectedCounts:{preCutoffProducts:100,preCutoffSkus:100,preCutoffKeys:200,nonzeroBaselines:4,explicitAbsentKeys:196,
      afterProducts:101,afterSkus:201,afterKeys:402,newNativeSkus:101,newAdmissions:202,nonemptyProductsAfter:100,disabledNoSkuProducts:1},
    limits:['SOURCE PREDICTIONS ONLY; no actual COMMITTED receipt, generated MAIN or runtime admission observed.',
      'Original 20-minute budget and all per-command timeouts remain; fitting one 101-SKU CREATE is unmeasured.',
      'One native root with 101 audit-array entries differs from 101 single-SKU products; no universal representative workload claim.',
      'Retained source catalogue is reference-only, not typed legacy product/history provenance; not valid imported product EDIT evidence.',
      'Only cutoff warehouses; no native warehouse creation coverage. New independent fixture/host/seed/metadata review required.']};
  validateInvariants(plan);return freeze(plan);
}

function validateInvariants(p) {
  assert.equal(p.retainedProducts.length,100);assert.equal(p.retainedSkus.length,100);assert.equal(p.referenceRows,303);
  assert.equal(Object.values(p.referenceCounts).reduce((a,b)=>a+b,0),303);
  for(const rows of [p.retainedProducts,p.retainedSkus,p.colors]) assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);
  const allIds=[p.actor.accountId,p.parentReference.staffId,p.parentReference.hallId,p.parentReference.categoryId,p.fit.id,p.season.id,p.scheme.id,
    ...p.colors.map(x=>x.id),...p.sizes.map(x=>x.id),...p.parentReference.groups.map(x=>x.id),...p.warehouses.map(x=>x.id),
    ...p.retainedProducts.map(x=>x.id),...p.retainedSkus.map(x=>x.id),...Object.values(p.native.ids),...p.native.allocations.flatMap(x=>[x.skuId,x.barcodeId])];
  assert.equal(new Set(allIds).size,allIds.length);
  const keys=new Set();for(const row of [...p.baselines,...p.absentPairs]){const key=row.warehouseId+':'+row.skuId;assert.ok(!keys.has(key));keys.add(key);}
  assert.equal(keys.size,200);for(const w of p.warehouses)for(const s of p.retainedSkus)assert.ok(keys.has(w.id+':'+s.id));
  assert.equal(p.baselines.length,4);assert.equal(p.absentPairs.length,196);assert.ok(p.absentPairs.every(x=>x.quantity==='0'));
  assert.equal(p.native.product.skus.length,101);assert.equal(new Set(p.native.allocations.map(x=>x.predictedMainBarcode)).size,101);
  for(const a of p.native.allocations){assert.match(a.predictedMainBarcode,/^5A8765432\d{6}$/);assert.equal(a.predictedMainBarcode.length,15);
    assert.ok(p.sizeGroupMembers.some(m=>m.size_group_id===p.native.product.values.sizeGroupId&&m.size_id===a.sizeId));}
  assert.equal(p.native.expectedProducts.length,101);assert.equal(p.native.expectedProducts.filter(x=>x.skuCount>0).length,100);
  assert.equal(p.native.expectedProducts.reduce((n,x)=>n+x.skuCount,0),201);
  assert.equal(p.native.page1Ids.length,100);assert.equal(p.native.page2Ids.length,1);
  assert.ok(p.native.plannedNewAdmissions.every(x=>!p.retainedSkus.some(s=>s.id===x.skuId)));
}
/** Validates exact source data, never brands an input as an executable fixture. */
export function assertExactScaledSourcePlan(value) { assert.deepEqual(value,buildScaledSourcePlan());return value; }
/** Finite predicted allocations only. A future original service owns every call.
 * This helper has no pool, capability, receipt or authority to create a row. */
export function createPlannedIdAllocator(plan, kind) {
  assertExactScaledSourcePlan(plan);requirePlan(kind==='SUPPLIER'||kind==='PRODUCT','EXACT_PLANNED_ALLOCATION_KIND_REQUIRED');
  const queues=kind==='SUPPLIER'?{supplier:[plan.native.ids.supplier],operation:[plan.native.ids.supplierOperation],audit:[plan.native.ids.supplierAudit]}
    :{product:[plan.native.ids.product],operation:[plan.native.ids.productOperation],sku:plan.native.allocations.map(x=>x.skuId),barcode:plan.native.allocations.map(x=>x.barcodeId)};
  return Object.freeze({next(type){requirePlan(typeof type==='string'&&Object.hasOwn(queues,type)&&queues[type].length>0,'FINITE_PLANNED_ID_EXHAUSTED_OR_UNKNOWN_KIND');return queues[type].shift();},
    remaining(){return Object.freeze(Object.fromEntries(Object.entries(queues).map(([key,rows])=>[key,rows.length])));}});
}
