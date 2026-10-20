/* Transfer-only identity serializer and adapters for the formal inventory contract. */
const quantity=value=>{const [integer,fraction='']=String(value).split('.');return BigInt(integer)*10000n+BigInt(fraction.padEnd(4,'0'));};
export function transferLines(d,productFor){
 const old=d._runtime?.body?.lines||[],result=[];
 for(const [key,n] of Object.entries(d.q||{})){
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(String(n)))throw Error('请输入有效的正数量');
  if(quantity(n)===0n)continue;
  const [code,c,s]=key.split('|'),p=productFor(code),colorId=p?.colorIds[Number(c)],sizeId=p?.sizeIds[Number(s)],sku=p?.skuByCell[colorId+'|'+sizeId];
  if(!p||!sku)throw Error('原商品规格身份未对应有效 SKU');
  const previous=old.filter(l=>l.sku_id===sku),sum=previous.reduce((a,l)=>a+quantity(l.source_quantity),0n);
  if(previous.length&&sum===quantity(n)&&previous.every(l=>l.from_warehouse_id===d.from&&l.to_warehouse_id===d.to)){result.push(...structuredClone(previous));continue;}
  result.push({...(previous.length===1?structuredClone(previous[0]):{}),source_id:previous.length===1?previous[0].source_id:'v2-'+sku,
   sku_id:sku,product_id:p.uuid,color_id:colorId,size_id:sizeId,source_product_code:p.sourceProductId||p.id,source_product_name:p.name,
   source_color_name:p.colors[Number(c)],source_size_name:p.sizes[Number(s)],source_quantity:String(n),from_warehouse_id:d.from,to_warehouse_id:d.to,
   unit:previous[0]?.unit||p.sourceUnit||p.unit||'',source_lineage:{...(previous[0]?.source_lineage||{}),originalDocument:d.uuid||null,
    ...(previous.length>1?{originalLines:previous.map(l=>({sourceId:l.source_id,skuId:l.sku_id,quantity:l.source_quantity}))}:{})}});
 }

 return result;
}
export async function inventoryCells(api,params={}){
 const rows=[];let page=1,total;
 do{const query=new URLSearchParams({...params,page:String(page++),size:'200',view:'original'}),data=await api('/inventory?'+query);rows.push(...data.items);total=data.total;if(page>10000)throw Error('库存回读超出安全页数');}while(rows.length<total);
 return rows;
}
export async function stockRows(api,codes,productFor){
 const rows=[];
 for(const code of codes){const p=productFor(code);if(!p?.uuid)throw Error('库存商品来源身份缺失');
  for(const cell of await inventoryCells(api,{productId:p.uuid}))rows.push({product_code:code,product_id:cell.productId,variant_id:cell.skuId,warehouse_id:cell.warehouseId,unit:cell.unit,quantity:cell.quantity});
 }
 return rows;
}
export async function warehouseOccupancy(api){
 const summary={};for(const cell of await inventoryCells(api,{nonzero:'true'}))summary[cell.warehouseId]=(summary[cell.warehouseId]||0)+1;return summary;
}
