import {routeProfile} from '../http-profile.mjs';
import {checkedPhase} from './phase-binding.mjs';
import {routeSavedEditProfile,SAVED_EDIT_ENDPOINT} from './saved-edit-profile.mjs';
/** Exact copied normal-list envelope, only for its explicit original header.
 * No history publication/category/personnel facts are invented. Saved detail
 * and current-form API bytes remain the separately frozen v2 DTOs. */
export function routeCanonicalProfile(profile,endpoint,body,headers={},options={phase:'BEFORE_OPT00'}){
  const phase=checkedPhase(options.phase);
  if(endpoint===SAVED_EDIT_ENDPOINT)return phase==='AFTER_OPT01_A_R2'?routeSavedEditProfile(profile,body,options):{status:501,body:{error:{code:'AFTER_ENDPOINT_DISABLED_IN_BEFORE'}}};
  const result=routeProfile(profile,endpoint,body);
  if(result.status!==200||!['/sales/query','/transfers/query'].includes(endpoint)||headers['x-naijue-document-summary']!=='category-v2')return result;
  const skuById=new Map(profile.skus.map(sku=>[sku.id,sku])),products=new Map();
  for(const line of profile.detail.document.lines){const sku=skuById.get(line.skuId);if(!sku)throw Error('Frozen saved SKU absent');if(!products.has(sku.productId))products.set(sku.productId,{productId:sku.productId,productCodeSnapshot:line.snapshot.productCode,productNameSnapshot:line.snapshot.productName});}
  const items=[...products.values()],productSummary={productCount:String(items.length),items:items.slice(0,3),hasMore:items.length>3};
  const totalFields=endpoint==='/sales/query'?['quantity','incomingQuantity','outgoingQuantity','grossAmount','orderDiscount','netDue']:['totalQuantity'];
  return {status:200,body:{...result.body,items:result.body.items.map(row=>({...row,dataset:'LIVE',batchId:null,documentId:row.id,effectiveVersion:row.version,productSummary})),historyCoverage:'NOT_PUBLISHED',totals:Object.fromEntries(totalFields.map(field=>[field,result.body.exactTotal==='0'?'0':profile.listItem[field]]))}};
}
