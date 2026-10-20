import type {Catalog, Option} from './catalog.js';

/** One immutable identity per original SKU. Display mappings never form keys. */
export interface SkuIdentity {
  skuId:string; productId:string; productCode:string; fitId:string;
  options:Record<string,Option>; enabled:boolean; codes:string[];
}
export function productIdentities(data:Catalog) {
  const products=data.products.map(p=>({productId:p.id,code:p.code,name:p.name,enabled:p.enabled}));
  const byId=new Map(products.map(p=>[p.productId,p]));
  const codesBySku=new Map<string,Set<string>>();
  for(const b of [...data.barcodes,...data.aliases])if(b.sku_id){
    const key=b.product_id+'|'+b.sku_id,list=codesBySku.get(key)||new Set<string>();list.add(b.barcode);codesBySku.set(key,list);
  }
  const skus:SkuIdentity[]=data.skus.flatMap(sku=>{
    const p=byId.get(sku.product_id);if(!p)return [];
    return [{skuId:sku.id,productId:p.productId,productCode:p.code,fitId:sku.fit_id||'',options:sku.options,
      enabled:sku.enabled!==false&&p.enabled!==false,
      codes:[...(codesBySku.get(p.productId+'|'+sku.id)||[])]}];
  });
  const productCodes=[...data.barcodes,...data.aliases].filter(b=>!b.sku_id&&byId.has(b.product_id)).map(b=>({code:b.barcode,productId:b.product_id}));
  return {version:1 as const,products,skus,productCodes};
}
export function resolveProductIdentity(data:Catalog,code:string) {
  const identities=productIdentities(data),candidates=identities.skus.filter(s=>s.codes.includes(code));
  if(candidates.length)return {kind:candidates.length===1?'sku':'ambiguous',code,candidates,
    ...(candidates.length===1?{skuId:candidates[0]!.skuId}:{})};
  const productIds=new Set(identities.productCodes.filter(b=>b.code===code).map(b=>b.productId));
  const products=identities.products.filter(p=>p.code===code||productIds.has(p.productId));
  return {kind:products.length?'product':'not-found',code,products};
}
