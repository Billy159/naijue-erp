/** Source construction and original parser tests, never PG or fake service success. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildScaledSourcePlan, assertExactScaledSourcePlan, createPlannedIdAllocator, SOURCE_CONTRACTS } from './scaled-source.mjs';
import { assertFixture, buildReferenceFixture } from '../current-native-stock/component/fixture.mjs';
import { validateCutoffImportCommand, stableImportId } from '../../../../packages/application/src/inventory-cutoff-import.ts';
import { parseProductMaintenanceCommandV2 } from '../../../../packages/application/src/product-maintenance-validation.ts';
import { parseProductManagementListQuery } from '../../../../packages/application/src/product-management-query-validation.ts';
import { requestHash } from '../../../../packages/application/src/request-hash.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
const H=x=>createHash('sha256').update(x).digest('hex');
const plan=buildScaledSourcePlan();

test('deterministic plan is NOT_APPLIED source only and cannot mint existing fixture authority',()=>{
 assert.deepEqual(buildScaledSourcePlan(),plan);assert.equal(plan.authority,'NONE');assert.equal(plan.status,'NOT_APPLIED_NOT_PG');
 assert.equal(plan.fixtureBrand,false);assert.equal(plan.physicalTargetAssigned,false);assert.equal(plan.performanceAcceptance,false);
 assert.throws(()=>assertFixture(plan),/ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED/);
 assert.throws(()=>assertFixture(structuredClone(plan)),/ORIGINAL_NEW_REFERENCE_FIXTURE_REQUIRED/);
 assert.ok(Object.isFrozen(plan.native.product.skus[0]));assert.doesNotThrow(()=>assertExactScaledSourcePlan(structuredClone(plan)));
});
test('100 retained products/100 retained SKU have 99 nonempty products and exact unaltered old identities',()=>{
 const base=buildReferenceFixture();assert.deepEqual(plan.retainedSkus.slice(0,3),base.skus);assert.deepEqual(plan.warehouses,base.warehouses);
 assert.equal(plan.retainedProducts.length,100);assert.equal(plan.retainedSkus.length,100);
 assert.equal(new Set(plan.retainedSkus.map(s=>s.product_id)).size,99);
 assert.equal(plan.retainedProducts.filter(p=>!p.enabled).length,1);
 assert.equal(plan.retainedSkus.filter(s=>s.product_id===base.reference.disabledProductId).length,0);
 assert.ok(plan.retainedSkus.every(s=>s.created_operation_id===null));assert.equal(plan.referenceRows,303);
 assert.equal(Object.values(plan.referenceCounts).reduce((a,b)=>a+b,0),303);
});
test('every retained row has complete exact decimal price contract and original size-group membership',()=>{
 const base=buildReferenceFixture();
 for(const p of plan.retainedProducts){assert.deepEqual(Object.keys(p.prices).sort(),[...CATALOGUE_PRICE_KEYS].sort());assert.equal(p.prices.retail_price,p.retailPrice);assert.equal(p.prices.purchase_price,'0.75');}
 for(const s of plan.retainedSkus){const p=plan.retainedProducts.find(p=>p.id===s.product_id);assert.ok(p);assert.ok(plan.sizeGroupMembers.some(m=>m.size_group_id===p.sizeGroupId&&m.size_id===s.size_id));}
 assert.equal(plan.retainedProducts.find(p=>p.id===base.alternateProduct.id).retailPrice,'2.50');
});
test('closed cutoff source covers every 2x100 key exactly, retains four signed nonzero facts and 196 explicit absences',()=>{
 const base=buildReferenceFixture();assert.deepEqual(plan.baselines,base.baselines);
 const observed=new Map();for(const x of [...plan.baselines,...plan.absentPairs]){const k=x.warehouseId+':'+x.skuId;assert.ok(!observed.has(k));observed.set(k,x.quantity);}
 assert.equal(observed.size,200);for(const w of plan.warehouses)for(const s of plan.retainedSkus)assert.ok(observed.has(w.id+':'+s.id));
 assert.deepEqual(plan.baselines.map(x=>x.quantity),['7','-2','11','5']);assert.equal(plan.absentPairs.length,196);
 assert.equal(plan.baselines.reduce((a,b)=>a+BigInt(b.quantity),0n),21n);
 assert.ok(plan.absentPairs.every(x=>x.quantity==='0'&&x.basis==='CLOSED_SCALED_SOURCE_EXPLICIT_ABSENCE'));
});
test('all generated source artifact lengths hashes and references match exact bytes, not old approvals',()=>{
 for(const a of plan.artifacts){assert.equal(a.bytes,Buffer.byteLength(a.utf8));assert.equal(a.sha256,H(a.utf8));}
 const [refs,source,manifest]=plan.artifacts, parsed=JSON.parse(manifest.utf8);
 assert.deepEqual(parsed.files,[refs,source].map(({utf8,...d})=>d));assert.equal(parsed.status,'NOT_APPLIED_NOT_PG');assert.equal(parsed.authority,'NONE');
 assert.equal(JSON.parse(refs.utf8).referenceRows,303);assert.equal(source.utf8.trimEnd().split('\n').length,106);
 assert.notEqual(manifest.sha256,buildReferenceFixture().artifacts.at(-1).sha256);
 assert.equal(parsed.explicitAbsentPairs.length,196);
});
test('original four cutoff commands validate and account for 102 members plus4 nonzero plus1 publication',()=>{
 const p=plan.publication;assert.deepEqual(p.commands.map(c=>c.action),['IMPORT_STAGE','IMPORT_CHUNK','IMPORT_CHUNK','IMPORT_PUBLISH']);
 p.commands.forEach(validateCutoffImportCommand);assert.equal(p.commands[1].items.length,102);assert.equal(p.commands[2].items.length,4);
 assert.deepEqual(p.checkpoints.map(c=>[c.sequence,c.cursor]),[[0,0],[1,102],[2,106],[3,107]]);
 for(const cp of p.checkpoints)assert.equal(cp.cursor,Object.values(cp.counts).reduce((a,b)=>a+b,0));
 assert.deepEqual(p.commands.map(requestHash),p.commandHashes);
 assert.deepEqual(p.commands[2].items.map(x=>x.quantity),[7n,-2n,11n,5n]);
 for(const c of [p.commands[0],p.commands[3].approval]){assert.equal(c.sourceHash,plan.artifacts.at(-1).sha256);assert.equal(c.sourceManifestRef,plan.artifacts.at(-1).path);}
});
test('source-record line hashes and planned stable receipt/ledger IDs use NEW namespace and exact source identities',()=>{
 const p=plan.publication,lines=plan.artifacts[1].utf8.trimEnd().split('\n'),items=[...p.commands[1].items,...p.commands[2].items];
 items.forEach((item,i)=>assert.equal(item.sourceRecordHash,H(lines[i])));
 p.predictedResults.forEach((x,i)=>assert.equal(x.operationId,stableImportId('operation',plan.actor.accountId,p.commands[i].requestKey)));
 assert.equal(new Set(p.predictedResults.map(x=>x.operationId)).size,4);assert.equal(p.predictedResults[2].ledgerEntryIds.length,4);
 assert.notEqual(p.batchId,buildReferenceFixture().batchId);
});
test('ONE original Product CREATE parser accepts101 explicit unique cells in existing23 sizes by5 colors',()=>{
 const n=plan.native;assert.deepEqual(parseProductMaintenanceCommandV2(n.product),n.product);
 assert.equal(n.product.action,'CREATE');assert.equal(n.product.skus.length,101);assert.equal(n.product.barcodes.length,0);assert.equal(Object.hasOwn(n.product,'skuSelection'),false);
 assert.equal(plan.extraColors.length,4);assert.deepEqual(plan.colors.map(c=>c.code),['001','002','003','004','005']);
 assert.equal(plan.sizes.length,23);assert.equal(new Set(n.product.skus.map(x=>JSON.stringify([x.colorId,x.fitId,x.sizeId]))).size,101);
 assert.equal(n.product.values.prices.retail_price,'19.99');assert.equal(n.product.values.prices.purchase_price,'7.25');
 assert.ok(n.product.skus.every(s=>s.id===null&&s.expectedVersion===null&&s.enabled));
 assert.equal(n.commandInputHash,requestHash({supplier:n.supplier,product:n.product}));
});
test('predicted MAIN mapping matches frozen source formula for101 distinct identities, never an actual barcode result',()=>{
 const n=plan.native;assert.equal(n.allocations.length,101);
 for(let i=0;i<101;i++){const a=n.allocations[i],s=n.product.skus[i];assert.equal(a.colorId,s.colorId);assert.equal(a.fitId,s.fitId);assert.equal(a.sizeId,s.sizeId);
  assert.equal(a.predictedMainBarcode,`5${a.fitCode}${n.product.values.systemItemCode}${a.colorCode}${a.sizeCode}`);assert.equal(a.predictedMainBarcode.length,15);}
 assert.equal(new Set(n.allocations.map(x=>x.predictedMainBarcode)).size,101);
 assert.equal(new Set(n.allocations.flatMap(x=>[x.skuId,x.barcodeId])).size,202);
});
test('after counts201SKU/101products/202new admissions are not misreported as101SKU or100nonempty retained roots',()=>{
 const c=plan.expectedCounts;assert.deepEqual(c,{preCutoffProducts:100,preCutoffSkus:100,preCutoffKeys:200,nonzeroBaselines:4,explicitAbsentKeys:196,afterProducts:101,afterSkus:201,afterKeys:402,newNativeSkus:101,newAdmissions:202,nonemptyProductsAfter:100,disabledNoSkuProducts:1});
 assert.equal(plan.native.plannedNewAdmissions.length,202);assert.equal(new Set(plan.native.plannedNewAdmissions.map(x=>x.warehouseId+':'+x.skuId)).size,202);
 assert.ok(plan.native.plannedNewAdmissions.every(x=>!plan.retainedSkus.some(s=>s.id===x.skuId)));
});
test('original100-page contract and global ordering retain disabled noSKU row and continuous100+1 coverage',()=>{
 const n=plan.native;n.queries.forEach(parseProductManagementListQuery);assert.deepEqual(n.queries.map(q=>[q.page,q.pageSize]),[[1,100],[2,100]]);
 assert.equal(n.expectedProducts.length,101);assert.deepEqual([...n.page1Ids,...n.page2Ids],n.expectedProducts.map(x=>x.id));assert.equal(new Set([...n.page1Ids,...n.page2Ids]).size,101);
 assert.equal(n.expectedProducts.filter(x=>x.stock==='16').length,1);assert.equal(n.expectedProducts.filter(x=>x.stock==='5').length,1);assert.equal(n.expectedProducts.filter(x=>x.stock==='0').length,99);
 assert.equal(n.expectedProducts.reduce((a,x)=>a+x.skuCount,0),201);
 const bad={...n.queries[0],pageSize:20};assert.throws(()=>parseProductManagementListQuery(bad));
});
test('finite per-kind allocation consumes each predicted identity once, refuses extra or foreign kind and resets only on explicit new source allocator',()=>{
 const a=createPlannedIdAllocator(plan,'PRODUCT');assert.equal(a.next('product'),plan.native.ids.product);assert.equal(a.next('operation'),plan.native.ids.productOperation);
 for(const x of plan.native.allocations)assert.equal(a.next('sku'),x.skuId);for(const x of plan.native.allocations)assert.equal(a.next('barcode'),x.barcodeId);
 assert.deepEqual(a.remaining(),{product:0,operation:0,sku:0,barcode:0});for(const k of ['product','operation','sku','barcode','supplier','__proto__'])assert.throws(()=>a.next(k),/FINITE_PLANNED_ID_EXHAUSTED_OR_UNKNOWN_KIND/);
 const b=createPlannedIdAllocator(plan,'SUPPLIER');assert.equal(b.next('supplier'),plan.native.ids.supplier);assert.equal(b.next('operation'),plan.native.ids.supplierOperation);assert.equal(b.next('audit'),plan.native.ids.supplierAudit);assert.throws(()=>b.next('audit'));
 assert.throws(()=>createPlannedIdAllocator(plan,'OTHER'));
});
test('source plan tampering (unknown-tozero, missing key/member, extra native key, identity collision and altered counters) fails exact closed-plan validation',()=>{
 for(const change of [p=>p.absentPairs.pop(),p=>p.baselines[1].quantity='0',p=>p.absentPairs[0].quantity=null,p=>p.retainedSkus[0].created_operation_id=p.native.ids.productOperation,
  p=>p.retainedSkus.push({...p.retainedSkus[0]}),p=>p.native.allocations[1].skuId=p.native.allocations[0].skuId,p=>p.native.product.skus[1]={...p.native.product.skus[0]},
  p=>p.publication.checkpoints[2].cursor=105,p=>p.publication.commands[3].approval.sourceHash='0'.repeat(64),p=>p.sizeGroupMembers.pop(),p=>p.referenceCounts.color=1]){
  const bad=structuredClone(plan);change(bad);assert.throws(()=>assertExactScaledSourcePlan(bad));assert.throws(()=>createPlannedIdAllocator(bad,'PRODUCT'));
 }
});
test('original parsers reject malformed101 command and zero ledger source without relaxed alternate schemas',()=>{
 let bad=structuredClone(plan.native.product);bad.skus[1]={...bad.skus[0]};assert.throws(()=>parseProductMaintenanceCommandV2(bad));
 bad=structuredClone(plan.native.product);delete bad.values.prices.minimum_price;assert.throws(()=>parseProductMaintenanceCommandV2(bad));
 const chunk=structuredClone(plan.publication.commands[2]);chunk.items[0].quantity=0n;assert.throws(()=>validateCutoffImportCommand(chunk));
});
test('pinned source contracts and actual original generator formula/allocation loops remain unchanged',async()=>{
 for(const [file,hash] of Object.entries(SOURCE_CONTRACTS)){const bytes=await readFile(new URL('../../../../'+file,import.meta.url));assert.equal(H(bytes),hash,file);}
 const source=await readFile(new URL('../../../../packages/application/src/product-maintenance-service.ts',import.meta.url),'utf8');
 assert.ok(source.includes('const raw = `5${fit}${product.systemItemCode}${color}${size}`;'));
 assert.ok(source.includes('for (const item of command.skus)'));assert.ok(source.includes('for (const { sku, raw } of pending)'));
 const ours=await readFile(new URL('./scaled-source.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ours,/from ['"](?:pg|node:child_process|node:fs)/);assert.doesNotMatch(ours,/\b(?:INSERT INTO|GRANT |CREATE DATABASE|createNativeRuntime26Issuer)\b/);
});
