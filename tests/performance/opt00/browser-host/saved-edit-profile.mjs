/** Synthetic AFTER-only projection of already frozen readable product facts.
 * This is NOT the real PostgreSQL eligibility provider or write authority. */
import {routeProfile} from '../http-profile.mjs';
export const SAVED_EDIT_ENDPOINT='/current-form/saved-edit-sku-batch-v2/query';
export function routeSavedEditProfile(profile,body,{encodeSavedEditBatch}={}){
  if(typeof encodeSavedEditBatch!=='function')return {status:503,body:{error:{code:'PINNED_AFTER_ENCODER_REQUIRED'}}};
  const legacy=routeProfile(profile,'/current-form/sku-batch/query',body);if(legacy.status!==200)return legacy;
  try{
    // Frozen facts must be unique even if two duplicated rows happen to agree;
    // no first/last-wins Map or .find can establish unambiguous admission.
    const skuIds=new Set();for(const sku of profile.skus){if(skuIds.has(sku.id))throw Error('Duplicate current SKU');skuIds.add(sku.id);}
    const groupIds=new Set();for(const group of profile.sizeGroups){if(groupIds.has(group.id))throw Error('Duplicate current size group');groupIds.add(group.id);const sizes=new Set();for(const size of group.sizes){if(sizes.has(size.id))throw Error('Duplicate size member');sizes.add(size.id);}}
    const skus=legacy.body,products=new Map(),byId=new Map();
    for(const product of profile.products){if(byId.has(product.id))throw Error('Duplicate current product');byId.set(product.id,product);}
    for(const sku of skus){const previous=products.get(sku.productId);if(previous&&(previous.sizeGroupId!==sku.sizeGroupId||previous.productCode!==sku.productCode||previous.productName!==sku.productName))throw Error('Inconsistent original SKU product facts');if(!previous)products.set(sku.productId,sku);}
    const outcomes=[...products].map(([productId,sku])=>{
      const product=byId.get(productId);
      // The frozen readable current product list, not mere SKU existence, is
      // admission evidence. Absent product is explicitly unavailable.
      if(!product)return {productId,state:'UNAVAILABLE'};
      if(product.code!==sku.productCode||product.name!==sku.productName)throw Error('Current product/SKU disagreement');
      if(product.sizeGroupId===undefined)return {productId,state:'UNAVAILABLE'};
      if(product.sizeGroupId!==sku.sizeGroupId)throw Error('Current product/SKU group disagreement');
      const group=profile.sizeGroups.find(group=>group.id===product.sizeGroupId);if(!group||skus.some(row=>row.productId===productId&&!group.sizes.some(size=>size.id===row.sizeId)))throw Error('Frozen product group members absent');
      return {productId,state:'ELIGIBLE',sizeGroupId:product.sizeGroupId};
    });
    return {status:200,body:encodeSavedEditBatch({version:1,skus,products:outcomes})};
  }catch{return {status:400,body:{error:{code:'INCONSISTENT_SYNTHETIC_PRODUCT_FACTS',message:'Frozen readable product/SKU facts do not permit a metadata projection'}}};}
}
