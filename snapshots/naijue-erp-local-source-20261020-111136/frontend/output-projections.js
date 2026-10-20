export function correctionOriginalDimension(correction,key){
  const original=correction?.original&&typeof correction.original==='object'?correction.original:{};
  const value=original[key]??original[key.toLowerCase()];
  if(typeof value==='string'||typeof value==='number')return value;
  if(!value||typeof value!=='object')return '';
  return value.sourceName??value.name??value.code??'';
}

export function correctionDimensions(correction){
  return {
    color:correctionOriginalDimension(correction,'COLOR'),
    fit:correctionOriginalDimension(correction,'FIT'),
    size:correctionOriginalDimension(correction,'SIZE'),
  };
}

function knownSourceValue(...values){
  for(const value of values){
    if(typeof value==='string'&&value.trim())return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
  }
  return 'UNKNOWN';
}

export function correctionWorkbookLine(correction,audit={}){
  const dimensions=correctionDimensions(correction);
  return {
    document_id:knownSourceValue(audit.documentId,correction?.correctionId),
    operation_actor_id:knownSourceValue(audit.actorId,correction?.actorId),
    operation_time:knownSourceValue(audit.operationTime,correction?.confirmedAt),
    product_code:correction?.productCode,sku_id:correction?.skuId,color_name:dimensions.color,fit_name:dimensions.fit,source_size:dimensions.size,
    source_quantity:correction?.delta,unit:correction?.unit,book_quantity:correction?.bookQuantity,
    actual_quantity:correction?.actualQuantity,reason:correction?.reason,correction,
  };
}

export const workbookJsonHeader=['单据 ID','单号','版本类型','修订号','原文类别','明细序号','分片序号','分片总数','JSON 原文片段'];
export function workbookJsonCell(value,reference,fragments){
  const source=typeof value==='string'?value:JSON.stringify(value);
  if(typeof source!=='string')return '';
  if(source.length<=30_000)return source;
  const parts=[];
  for(let start=0;start<source.length;){
    let end=Math.min(start+30_000,source.length);
    if(end<source.length&&source.charCodeAt(end-1)>=0xd800&&source.charCodeAt(end-1)<=0xdbff&&source.charCodeAt(end)>=0xdc00&&source.charCodeAt(end)<=0xdfff)end--;
    parts.push(source.slice(start,end));start=end;
  }
  for(let index=0;index<parts.length;index++)fragments.push([
    reference.id,reference.number,reference.kind,reference.revision,reference.source,reference.index??'',index+1,parts.length,parts[index],
  ]);
  return `已分片到“JSON 原文”工作表（${parts.length} 片）`;
}

export function productSheets(products,data){
  const ids=new Set(products.map(row=>row.id));
  const selectedSkus=data.skus.filter(row=>ids.has(row.product_id));
  const selectedCodes=[...(data.barcodes||[]).filter(row=>ids.has(row.product_id)).map(row=>({...row,source:'来源 / 已登记'})),
    ...(data.aliases||[]).filter(row=>ids.has(row.product_id)).map(row=>({...row,source:'人工旧码'}))];
  return [
    {name:'商品',rows:[['商品 ID','商品编码','商品名称','分类编码','分类','单位','版型','状态','创建时间'],...products.map(row=>[
      row.id,row.code,row.name,row.category_code,row.category_name,row.unit,row.fit_name,row.enabled===false?'已停用':'正常',row.created_at])]},
    {name:'原 SKU',rows:[['原 SKU ID','商品 ID','商品编码','商品名称','SKU 状态','SKU 版本','颜色 ID','颜色码','颜色','原尺码 ID','原尺码码','原尺码','标准尺码码','标准尺码','标准尺码组','版型 ID','来源 / 映射信息'],...selectedSkus.map(sku=>{
      const product=data.products.find(row=>row.id===sku.product_id)||{},color=sku.options?.COLOR||{},size=sku.options?.SIZE||{},mapped=size.standardGroup?size:{};
      return [sku.id,sku.product_id,product.code,product.name,sku.enabled===false?'已停用':'正常',sku.version,color.id,color.code,color.name,size.id,
        size.sourceCode??size.code,size.sourceName??size.name,mapped.code||'',mapped.name||'',mapped.standardGroup||'',sku.fit_id,
        sku.historicalUnmappedReason||sku.overlay?'运行 SKU / 原身份保留':'来源 SKU'];
    })]},
    {name:'条码绑定',rows:[['条码原值','商品 ID','商品编码','原 SKU ID','绑定来源','生成标记','历史说明'],...selectedCodes.map(row=>[
      row.barcode,row.product_id,data.products.find(product=>product.id===row.product_id)?.code,row.sku_id,row.source,row.generated===true?'是':'否',row.historical_note])]},
  ];
}
