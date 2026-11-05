/** Original public readers/policies only. No driver or target on import. */
import { PostgresCurrentFormReader } from '../../../../adapters/postgres/src/current-form-reader.ts';
import { PostgresDictionaryReadReader } from '../../../../adapters/postgres/src/dictionary-read-reader.ts';
import { createSourceConfirmedCurrentFormAuthorization } from '../../../../packages/application/src/source-confirmed-current-form-authorization.ts';
import { createSourceConfirmedApplicationReadAuthorization } from '../../../../apps/api/src/postgres-read-api.ts';
import { createDictionaryReadService } from '../../../../packages/application/src/dictionary-read-service.ts';
import { checkedFixture } from './seed.mjs';
import { need } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export async function runOriginalReads(pool,value) {
 const f=checkedFixture(value),signal=new AbortController().signal,context={kind:'TRANSFER'};
 const form=new PostgresCurrentFormReader(pool,createSourceConfirmedCurrentFormAuthorization());
 const dictionary=createDictionaryReadService({reader:new PostgresDictionaryReadReader(pool),authorization:createSourceConfirmedApplicationReadAuthorization(pool).dictionary});
 const products=await form.readProducts(f.actor,{context,search:'PGOPT01',page:1,pageSize:20},signal);
 need(products.exactTotal===1n&&products.items.length===1&&products.items[0].id===f.productId&&products.items[0].sizeGroupId===f.targetGroupId&&products.items[0].category?.id===f.categoryId&&products.items[0].retailPrice==='1.25'&&products.items[0].code===f.expectedProductCode&&products.items[0].name==='SYNTHETIC PRODUCT'&&products.items[0].category?.label==='SYNTHETIC CATEGORY'&&products.items[0].minimumPriceAvailability==='UNAVAILABLE','ORIGINAL_PRODUCT_SOURCE_METADATA_MISMATCH');
 const expectedSku=s=>{const n=f.skuIds.indexOf(s.id),size=f.sizes[n===0?0:22];return n>=0&&s.skuCode==='SYNTHETIC-SKU-'+f.id+'-'+n&&s.sizeId===size.id&&s.sizeName===size.name;};
 const skus=await form.readProductSkus(f.actor,{context,productId:f.productId,page:1,pageSize:20},signal);
 need(skus.exactTotal===2n&&JSON.stringify(skus.items.map(s=>s.id).sort())===JSON.stringify([...f.skuIds].sort())&&skus.items.every(s=>expectedSku(s)&&s.sizeGroupId===f.targetGroupId&&s.productId===f.productId&&s.productCode===f.expectedProductCode&&s.productName==='SYNTHETIC PRODUCT'&&s.colorId===f.colorId&&s.colorName==='SYNTHETIC COLOR'&&s.fitId===f.fitId&&s.fitName==='SYNTHETIC FIT'&&s.barcodeAvailability==='UNAVAILABLE'&&[0,22].some(i=>s.sizeId===f.sizes[i].id&&s.sizeName===f.sizes[i].name)),'ORIGINAL_SKU_SOURCE_MISMATCH');
 const batch=await form.readSkuBatch(f.actor,{context,skuIds:[...f.skuIds].reverse()},signal);need(batch.every((s,i)=>s.id===[...f.skuIds].reverse()[i]&&expectedSku(s)),'ORIGINAL_BATCH_ORDER_MISMATCH');
 const first=await dictionary.readSizeGroups(f.actor,{search:'',page:1,pageSize:20},signal),second=await dictionary.readSizeGroups(f.actor,{search:'',page:2,pageSize:20},signal);
 need(first.total===22&&second.total===22&&first.items.length===20&&second.items.length===2&&!first.items.some(g=>g.id===f.targetGroupId),'TARGET_GROUP_MUST_BE_OUTSIDE_PAGE_ONE');
 const target=second.items.find(g=>g.id===f.targetGroupId);need(target&&target.name===f.groups[21].name&&target.sizes.length===23&&target.sizes.every((s,i)=>s.id===f.sizes[i].id&&s.displayOrder===i&&s.name===f.sizes[i].name),'COMPLETE_TARGET_GROUP_MEMBERS_REQUIRED');
 need(!skus.items.some(s=>s.sizeId===f.sizes[1].id),'MISSING_SKU_TUPLE_MUST_NOT_BE_FABRICATED');
 const unknown={accountId:f.disabledProductId,hallId:null};let denied=false;try{await form.readProducts(unknown,{context,search:'',page:1,pageSize:20},signal);}catch(e){need(e.code==='FORBIDDEN','EXPECTED_NATIVE_IDENTITY_DENIAL');denied=true;}need(denied,'UNKNOWN_ACTOR_NOT_DENIED');
 let dictionaryDenied=false;try{await dictionary.readSizeGroups(unknown,{search:'',page:1,pageSize:20},signal);}catch(e){need(e.code==='FORBIDDEN','EXPECTED_DICTIONARY_IDENTITY_DENIAL');dictionaryDenied=true;}need(dictionaryDenied,'UNKNOWN_DICTIONARY_ACTOR_NOT_DENIED');
 return {scope:f.scope,realPublicReaders:true,runtimeCapabilityIssued:false,products,skus,batch,dictionary:{first,second},unknownActorDenied:denied,dictionaryUnknownActorDenied:dictionaryDenied};
}
