import {segmentRules} from './barcode-plan.mjs';

export const supplementRevision='scheme-supplement-4288-20260930-v1';
// Leading zeroes in the original fields are retained in the audit record.
// A one-digit segment can represent 001 as 1, but cannot represent 501.
function segment(raw,width){
 if(!/^\d+$/.test(raw))return {reason:'NON_NUMERIC_SEGMENT'};
 const digits=raw.replace(/^0+(?=\d)/,'');
 return digits.length>width?{reason:'SEGMENT_EXCEEDS_WIDTH'}:{value:digits.padStart(width,'0')};
}

/** Generate only the fixed missing-SKU scope. Never changes an occupied code. */
export function planMissingBarcodeSupplement(products,variants,existing,scope){
 const productById=new Map(products.map(p=>[p.id,p]));
 const bySku=new Map(variants.map(v=>[v.sku_id,v]));
 const occupied=new Map(existing.map(r=>[r.barcode,r]));
 const records=[];
 for(const skuId of scope){
  const v=bySku.get(skuId),p=v&&productById.get(v.product_id);
  if(!v||!p)throw Error('SUPPLEMENT_SKU_IDENTITY_MISSING');
  if(existing.some(b=>b.sku_id===skuId))throw Error('SUPPLEMENT_TARGET_ALREADY_HAS_BARCODE');
  const a=p.a||{},scheme=String(a.sourceBarcodeSchemeCode??''),rule=segmentRules[scheme];
  const r={skuId,productId:p.id,code:p.code,name:p.name,scheme,schemeId:rule?.id||'',schemeName:a.source?.['条码方案名称']||'',defaultBarcode:String(a.defaultBarcode??''),sourceColorCode:String(v.options.COLOR??''),colorName:v.option_names.COLOR||'',sourceSizeCode:String(v.options.SIZE??''),sizeName:v.option_names.SIZE||'',sourceRow:a.lineage?.row||null,status:'EXCEPTION',reason:'',barcode:null};
  if(!rule)r.reason='UNKNOWN_SCHEME';
  else if(!r.defaultBarcode)r.reason='DEFAULT_BARCODE_MISSING';
  else if(!/^[ -~]+$/.test(r.defaultBarcode))r.reason='DEFAULT_BARCODE_NOT_CODE128_TEXT';
  else{
   const color=segment(r.sourceColorCode,rule.colorWidth),size=segment(r.sourceSizeCode,rule.sizeWidth);
   Object.assign(r,{colorWidth:rule.colorWidth,sizeWidth:rule.sizeWidth,colorSegment:color.value||null,sizeSegment:size.value||null});
   if(color.reason)r.reason=color.reason==='SEGMENT_EXCEEDS_WIDTH'?'COLOR_EXCEEDS_WIDTH':'COLOR_MISSING_OR_INVALID';
   else if(size.reason)r.reason=size.reason==='SEGMENT_EXCEEDS_WIDTH'?'SIZE_EXCEEDS_WIDTH':'SIZE_MISSING_OR_INVALID';
   else {r.barcode=scheme+r.defaultBarcode+color.value+size.value;r.status='ACTIVE';}
  }
  records.push(r);
 }
 const candidates=new Map();
 for(const r of records.filter(r=>r.status==='ACTIVE')){const group=candidates.get(r.barcode)||[];group.push(r);candidates.set(r.barcode,group);}
 for(const r of records.filter(r=>r.status==='ACTIVE')){
  const owner=occupied.get(r.barcode),peers=candidates.get(r.barcode);
  if(owner||peers.length>1){r.status='EXCEPTION';r.reason=owner?'COLLISION_WITH_EXISTING':'COLLISION_WITH_PENDING';r.conflicts=owner?[{skuId:owner.sku_id,productId:owner.product_id,barcode:owner.barcode}]:peers.filter(p=>p!==r).map(p=>({skuId:p.skuId,productId:p.productId,code:p.code,colorName:p.colorName,sizeName:p.sizeName,barcode:p.barcode}));}
 }
 return {revision:supplementRevision,scopeCount:scope.length,activeCount:records.filter(r=>r.status==='ACTIVE').length,exceptionCount:records.filter(r=>r.status==='EXCEPTION').length,records};
}
