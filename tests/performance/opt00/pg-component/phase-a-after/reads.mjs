/** Original before/after public reader composition. Inert: no driver or target. */
import assert from 'node:assert/strict';
export async function runDomainProtocol({before,after,pool,fixture:f,step=async(_label,work)=>work()}) {
 const b=f.base,signal=()=>new AbortController().signal,parameters={context:{kind:'TRANSFER'},skuIds:[...f.requested]};
 const oldReader=new before.Reader(pool,before.authorization()),reader=new after.Reader(pool,after.authorization());
 const expectedSkus=f.requested.map(id=>f.good.find(s=>s.id===id)),expectedProducts=f.orderedProducts.map(productId=>({productId,state:'ELIGIBLE',sizeGroupId:productId===b.productId?b.targetGroupId:f.otherProduct.groupId}));
 const oldSkus=await step('C03-original-bare-sku-batch',()=>oldReader.readSkuBatch(b.actor,parameters,signal()));assert.deepEqual(oldSkus,expectedSkus);
 const oldMetadata=[];
 for(const [i,sku] of oldSkus.entries()) {const page=await step('C03-original-product-search-per-sku-'+i,()=>oldReader.readProducts(b.actor,{context:parameters.context,search:sku.productCode,page:1,pageSize:20},signal()));
  assert.equal(page.exactTotal,sku.productId===b.productId?2n:1n,'A real enabled prefix collision is present');const p=page.items.find(p=>p.id===sku.productId);assert(p);assert.equal(p.sizeGroupId,sku.sizeGroupId);assert.equal(p.code,sku.productCode);assert.equal(p.name,sku.productName);assert.equal(p.category.id,b.categoryId);assert.equal(p.category.label,'SYNTHETIC CATEGORY');assert.equal(p.retailPrice,sku.productId===b.productId?'1.25':'2.50');assert.equal(p.minimumPriceAvailability,'UNAVAILABLE');oldMetadata.push(p);}
 const bare=await step('after-original-bare-sku-batch',()=>reader.readSkuBatch(b.actor,parameters,signal()));assert(Array.isArray(bare));assert.deepEqual(bare,oldSkus);
 const saved=await step('after-new-saved-edit-batch',()=>reader.readSavedEditSkuBatch(b.actor,parameters,signal()));assert.deepEqual(Object.keys(saved).sort(),['products','skus','version']);assert.equal(saved.version,1);assert.deepEqual(saved.skus,oldSkus);assert.deepEqual(saved.products,expectedProducts);assert.deepEqual(saved.products.map(p=>p.productId),[...new Set(oldSkus.map(s=>s.productId))]);
 const negatives=[];
 async function rejected(label,work,expectedCode){let error=null;try{await step(label,work);}catch(e){error=e;}assert.equal(error?.code,expectedCode,label);negatives.push({case:label,code:error.code});}
 for(const bad of f.bad){const single={context:parameters.context,skuIds:[bad.id]},mixed={context:parameters.context,skuIds:[b.skuIds[0],bad.id]};
  await rejected('C03-'+bad.kind,()=>oldReader.readSkuBatch(b.actor,single,signal()),'SKU_UNAVAILABLE');
  await rejected('after-legacy-'+bad.kind,()=>reader.readSkuBatch(b.actor,single,signal()),'SKU_UNAVAILABLE');
  await rejected('after-saved-'+bad.kind,()=>reader.readSavedEditSkuBatch(b.actor,single,signal()),'SKU_UNAVAILABLE');
  await rejected('after-saved-mixed-'+bad.kind,()=>reader.readSavedEditSkuBatch(b.actor,mixed,signal()),'SKU_UNAVAILABLE');}
 const missing={context:parameters.context,skuIds:[f.outsideSize.id]};await rejected('after-saved-unknown-sku',()=>reader.readSavedEditSkuBatch(b.actor,missing,signal()),'SKU_UNAVAILABLE');
 const unknown={accountId:f.outsideSize.id,hallId:null};await rejected('after-saved-unknown-actor',()=>reader.readSavedEditSkuBatch(unknown,parameters,signal()),'FORBIDDEN');
 // A legitimate host may refuse the new intent. Delegate source policy first;
 // this wrapper only removes authority, never creates/falls back to an allow grant.
 const sourcePolicy=after.authorization(),denyNew={async authorize(context,intent,active){const grant=await sourcePolicy.authorize(context,intent,active);if(intent.kind==='saved-edit-sku-batch')throw new after.DomainError('FORBIDDEN','This host has not enabled saved-edit metadata');return grant;}};
 const deniedReader=new after.Reader(pool,denyNew);const permittedLegacy=await step('after-deny-host-legacy-still-original',()=>deniedReader.readSkuBatch(b.actor,parameters,signal()));assert.deepEqual(permittedLegacy,oldSkus);
 await rejected('after-deny-host-new-intent',()=>deniedReader.readSavedEditSkuBatch(b.actor,parameters,signal()),'FORBIDDEN');
 const dictionary=after.dictionaryService({reader:new after.Dictionary(pool),authorization:after.readAuthorization(pool).dictionary});
 const first=await step('after-dictionary-page1',()=>dictionary.readSizeGroups(b.actor,{search:'',page:1,pageSize:20},signal())),second=await step('after-dictionary-page2',()=>dictionary.readSizeGroups(b.actor,{search:'',page:2,pageSize:20},signal()));
 assert.equal(first.total,22);assert.equal(first.items.length,20);assert.equal(second.total,22);assert.equal(second.items.length,2);assert(!first.items.some(g=>g.id===b.targetGroupId));const target=second.items.find(g=>g.id===b.targetGroupId);assert(target);assert.equal(target.name,b.groups[21].name);assert.deepEqual(target.sizes,b.sizes.map((s,i)=>({id:s.id,name:s.name,displayOrder:i})));assert(!target.sizes.some(s=>s.id===f.outsideSize.id));
 return {scope:'FINITE_ORIGINAL_METADATA_READ_DIFFERENTIAL_NOT_RUNTIME_PERFORMANCE',beforeSkus:oldSkus,beforeMetadata:oldMetadata,afterBare:bare,afterSaved:saved,negatives,dictionary:{first,second},unavailableActualBranch:f.unavailableActualBranch,comparisonSnapshotClaim:'Each original current-form call has its OWN RR READ ONLY snapshot; dictionary host authorization uses its separate original lease; identical immutable fixture/no intervening writes, NOT one cross-call snapshot'};
}
