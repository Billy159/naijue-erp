/** Resolve protected media through the authenticated transport; never publish media paths. */
export async function hydrateProductCatalog(catalog,client=globalThis.ERP_API,codes){
 if(codes===undefined&&globalThis.location){const route=globalThis.location.hash.slice(1);codes=route.startsWith('product/')?[decodeURIComponent(route.slice(8))]:route.startsWith('product-view/')?[decodeURIComponent(route.slice(13))]:[];}
 const cache=new Map();
 for(const product of catalog.products||[]){
  if(codes&&!codes.includes(product.code))continue;
  const profile=(catalog.profiles||[]).find(p=>p.product_id===product.id);
  const images=profile?.body?.images??product.attributes?.images??[];
  const hydrated=[];
  for(const image of images){
   const mediaId=image.mediaId||(/^\/api\/media\/([a-f0-9-]+)$/i.exec(image.url||'')?.[1]);
   if(!mediaId){hydrated.push(image);continue}
   if(!cache.has(mediaId))cache.set(mediaId,client.request('/media/'+mediaId+'?purpose=original'));
   const media=await cache.get(mediaId);
   hydrated.push({...image,mediaId,url:'data:'+media.contentType+';base64,'+media.content});
  }
  product.attributes={...product.attributes,images:hydrated};if(profile)profile.body={...profile.body,images:hydrated};
 }
 return catalog;
}
export function productProfileDraft(candidate){
 const keys=['name','categoryId','year','season','supplierId','unitId','thickness','shapeCode','barcodeItemCode','freeCode','schemeId','fitId','fitIds','selectedColorIds','selectedSizeIds','selectedFitIds','groupId','enabled','disabledSkuIds','purchasePrice','price','wholesale5','wholesale6','wholesale7','wholesale8','wholesale9','wholesale10','minimumPrice'];
 const prices=new Set(['purchasePrice','price','wholesale5','wholesale6','wholesale7','wholesale8','wholesale9','wholesale10','minimumPrice']);
 const profile=Object.fromEntries(keys.filter(k=>Object.hasOwn(candidate,k)).map(k=>[k,prices.has(k)&&candidate[k]!=null&&candidate[k]!==''?String(candidate[k]):candidate[k]]));
 profile.images=(candidate.images||[]).map(image=>image.mediaId?{id:image.id,mediaId:image.mediaId,name:image.name,role:image.role,colorId:image.colorId||'',colorName:image.colorName||null,url:'/api/media/'+image.mediaId}:{id:image.id,name:image.name,role:image.role,colorId:image.colorId||'',colorName:image.colorName||null,url:image.url});
 return profile;
}
