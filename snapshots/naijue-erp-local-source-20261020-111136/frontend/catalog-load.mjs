/** Complete bounded catalogue assembly; retain UUIDs, ambiguous codes and all later pages. */
export async function loadCompleteCatalog(api,{size=100,parallel=3,onProgress=()=>{}}={}){
 const arrays=['products','skus','sourceBarcodes','barcodes','aliases','profiles'];
 const identityArrays=['products','skus','productCodes'];
 const catalog=Object.fromEntries(arrays.map(key=>[key,[]])),identities={version:1,...Object.fromEntries(identityArrays.map(key=>[key,[]]))};
 const ids=new Set(),skuIds=new Set();let expectedTotal,dataVersion,pageSize;
 const read=page=>api('/runtime/catalog-page?query='+encodeURIComponent(JSON.stringify({filters:{},page,size})));
 const append=(part,page)=>{
  if(!part||!Number.isSafeInteger(part.total)||part.total<0||part.page!==page||!Number.isSafeInteger(part.size)||part.size<1||part.size>100||!Array.isArray(part.codes)||typeof part.catalogVersion!=='string'||!part.catalogVersion)throw Error('商品资料分页返回无效，请重试');
  if(expectedTotal===undefined){expectedTotal=part.total;pageSize=part.size;dataVersion=part.catalogVersion;}
  if(part.total!==expectedTotal||part.size!==pageSize||dataVersion!==undefined&&part.catalogVersion!==dataVersion)throw Error('商品资料在加载期间有更新，请重试');
  const expected=Math.min(pageSize,Math.max(0,expectedTotal-(page-1)*pageSize));
  if(!part.catalog||!part.identities||part.identities.version!==1||part.codes.length!==expected||part.catalog.products?.length!==expected||part.identities.products?.length!==expected)throw Error('商品资料分页不完整，请重试');
  for(const key of arrays)if(!Array.isArray(part.catalog[key]))throw Error('商品目录字段不完整，请重试');
  for(const key of identityArrays)if(!Array.isArray(part.identities[key]))throw Error('商品身份字段不完整，请重试');
  const pageIds=new Set(part.catalog.products.map(row=>row.id));
  for(const id of pageIds){if(!id||ids.has(id))throw Error('商品分页身份重复，请重试');ids.add(id);}
  if(pageIds.size!==expected||part.identities.products.some(row=>!pageIds.has(row.productId)))throw Error('商品分页身份不一致，请重试');
  for(const sku of part.catalog.skus){if(!pageIds.has(sku.product_id)||skuIds.has(sku.id))throw Error('规格分页身份不一致，请重试');skuIds.add(sku.id);}
  for(const key of arrays)for(const row of part.catalog[key])catalog[key].push(row);
  for(const key of identityArrays)for(const row of part.identities[key])identities[key].push(row);
  onProgress({loaded:ids.size,total:expectedTotal});
 };
 append(await read(1),1);const pages=Math.ceil(expectedTotal/pageSize);
 if(pages>10000)throw Error('商品资料页数超过当前读取范围');
 for(let page=2;page<=pages;page+=parallel){
  const numbers=Array.from({length:Math.min(parallel,pages-page+1)},(_,i)=>page+i);
  const parts=await Promise.all(numbers.map(read));parts.forEach((part,index)=>append(part,numbers[index]));
 }
 if(ids.size!==expectedTotal)throw Error('商品资料数量不完整，请重试');
 return {catalog,identities,dataVersion,total:expectedTotal};
}
