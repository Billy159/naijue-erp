/** UI identities for an existing product's fit SKUs. The source code/UUID never changes. */
import {projectProductStock} from './inventory-unit-view.mjs';
export const sourceCode = product => product.sourceProductId || product.id;
export const fitViewId = (product,fitId) => fitId === (product.baseFitId || product.fitId) ? sourceCode(product) : sourceCode(product)+'::fit:'+fitId;
export function fitView(product,fitId,catalog,stockRows=[],warehouses=[]){
 if(fitId===(product.baseFitId||product.fitId))return product;
 const skuByCell={},barcodes={};
 for(const [key,sku] of Object.entries(product.skuByFitCell||{})){
  const [color,fit,size]=key.split('|');if(fit!==fitId)continue;
  const cell=color+'|'+size;skuByCell[cell]=sku;
  const binding=Object.values(product.barcodes||{}).find(b=>b.skuId===sku);
  barcodes[cell]=binding||{skuId:sku,fitId,current:'',history:[],readonly:true};
 }
 if(!Object.keys(skuByCell).length)return null;
 const ids=new Set(Object.values(skuByCell));
 return projectProductStock({...product,id:fitViewId(product,fitId),sourceProductId:sourceCode(product),displayId:product.displayId||sourceCode(product),styleNumber:product.styleNumber||sourceCode(product),fitId,fit:catalog.fit(fitId)?.name||fitId,skuByCell,barcodes},stockRows.filter(row=>ids.has(row.variant_id)),warehouses);
}
