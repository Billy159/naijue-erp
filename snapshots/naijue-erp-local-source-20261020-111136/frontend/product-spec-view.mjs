/** Project audited source SKUs into the active group without changing any historical identity. */
export function currentSpecView(product,skus,C){
 const explicit=product.profileVersion>0;
 const auditedGroups=[...new Set(skus.filter(s=>!s.overlay&&!s.historicalUnmappedReason).map(s=>s.options?.SIZE?.currentGroupId).filter(id=>C.group(id)))];
 if(!explicit||!C.group(product.groupId)){if(auditedGroups.length===1)product.groupId=auditedGroups[0];else if(!explicit&&auditedGroups.length>1)product.groupId=''}
 const group=C.group(product.groupId),availableColors=new Set(C.colors.filter(x=>!x.disabled&&x.enabled!==false).map(x=>x.id));
 const sizesByName=new Map((group?.sizes||[]).map(x=>[x.name,x]));
 const candidates=new Map();
 for(const sku of skus){
  const colorId=sku.options?.COLOR?.id,size=sku.options?.SIZE;
  if(sku.historicalUnmappedReason||!availableColors.has(colorId)||!size)continue;
  let uiSize;
  if(sku.overlay){
   const record=product.specSizeRecords?.find(x=>x.id===size.id);
   uiSize=(group?.sizes||[]).find(x=>x.id===record?.uiSizeId)||(record?.groupName===group?.name?sizesByName.get(size.name):null);
   if(!uiSize&&sku.barcodeAuthority&&size.currentGroupId===product.groupId)uiSize=sizesByName.get(size.name);
  }else if(size.currentGroupId===product.groupId)uiSize=sizesByName.get(size.name);
  if(!uiSize)continue;
  const fitId=sku.fit_id||product.baseFitId||product.fitId,key=colorId+'|'+fitId+'|'+uiSize.id;
  const list=candidates.get(key)||[];list.push(sku.id);candidates.set(key,list);
 }
 const cells=Object.fromEntries([...candidates].filter(([,ids])=>ids.length===1).map(([key,ids])=>[key,ids[0]]));
 const inferred=Object.keys(cells).map(key=>key.split('|'));
 const inferredColors=[...new Set(inferred.map(x=>x[0]))],inferredFits=[...new Set(inferred.map(x=>x[1]))];
 product.selectedColorIds??=C.colors.filter(x=>inferredColors.includes(x.id)).map(x=>x.id);
 product.selectedFitIds??=C.fits.filter(x=>inferredFits.includes(x.id)).map(x=>x.id);
 product.selectedSizeIds=(group?.sizes||[]).filter(x=>!x.disabled&&x.enabled!==false).map(x=>x.id);
 product.currentSkuByUiCell=cells;
 product.mappedCurrentSkuIds=Object.entries(cells).filter(([key])=>{const [color,fit,size]=key.split('|');return product.selectedColorIds.includes(color)&&product.selectedFitIds.includes(fit)&&product.selectedSizeIds.includes(size)}).map(([,id])=>id);
 product.ambiguousCurrentCells=[...candidates].filter(([,ids])=>ids.length>1).map(([key,ids])=>({key,ids}));
 return product;
}
