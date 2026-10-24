/** UI identities for an existing product's fit SKUs. The source code/UUID never changes. */
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
 const stock=Object.fromEntries(warehouses.map(w=>[w.id,product.colorIds.map(color=>product.sizeIds.map(size=>skuByCell[color+'|'+size]?0:null))]));
 const bySku=new Map(Object.entries(skuByCell).map(([cell,id])=>[id,cell.split('|')]));
 for(const row of stockRows){const cell=bySku.get(row.variant_id);if(!cell||!stock[row.warehouse_id])continue;stock[row.warehouse_id][product.colorIds.indexOf(cell[0])][product.sizeIds.indexOf(cell[1])]=Number(row.quantity)}
 const stockByWarehouse=Object.fromEntries(Object.entries(stock).map(([id,cells])=>[id,cells.flat().reduce((n,x)=>n+(x||0),0)]));
 return {...product,id:fitViewId(product,fitId),sourceProductId:sourceCode(product),displayId:product.displayId||sourceCode(product),styleNumber:product.styleNumber||sourceCode(product),fitId,fit:catalog.fit(fitId)?.name||fitId,skuByCell,barcodes,stock,stockByWarehouse,stockTotal:Object.values(stockByWarehouse).reduce((n,x)=>n+x,0)};
}
