/** T21 transport only: the existing sales editor keeps its UI and integer-cent model. */
export function centsText(value){
 if(!Number.isSafeInteger(value))throw Error('金额须为可精确表示的整数分');
 const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'-':'')+a/100n+'.'+String(a%100n).padStart(2,'0');
}
export async function resolveSaleDocumentId(id,api){
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return id;
 const result=await api('/sales/documents?type=SALE&page=1&size=2&filters='+encodeURIComponent(JSON.stringify({exactNumber:id})));
 if(result.total!==1||result.items.length!==1||result.items[0].number!==id)throw Error('历史单号不存在、重复或不在可访问范围内');
 return result.items[0].id;
}
function sourceMoneyCents(value){
 const text=String(value??'');if(!/^-?\d+(?:\.\d{1,4})?$/.test(text))return null;
 const [whole,decimal='']=text.replace(/^-/,'').split('.');if(/[^0]/.test(decimal.slice(2)))return null;
 const cents=BigInt(whole)*100n+BigInt(decimal.slice(0,2).padEnd(2,'0'));if(cents>BigInt(Number.MAX_SAFE_INTEGER))return null;
 return Number(cents)*(text.startsWith('-')?-1:1);
}
export function buildSaleBody(d,productFor,codeFor){
 const source=structuredClone(d._runtime?.body||{header:{},lines:[],fundsRecords:[]});
 const exchange=d.businessType==='退货/换货',returnWarehouse=d.returnWarehouseId||d.warehouseId;
 const hasIncoming=(d.lines||[]).some(l=>l.quantity<0),hasOutgoing=(d.lines||[]).some(l=>l.quantity>0);
 const header={...source.header,business_date:String(d.date||'').slice(0,10),source_number:d.id,hall_id:d.storeId,
  source_warehouse_id:exchange&&!hasOutgoing?returnWarehouse:d.warehouseId,source_party_id:d.customerId,source_employee_id:d.salespersonId,note:d.note,
  return_warehouse_id:exchange&&hasIncoming?returnWarehouse:undefined,outgoing_warehouse_id:exchange&&hasOutgoing?d.warehouseId:undefined,
  business_type:d.businessType==='退货/换货'?'RETURN_EXCHANGE':'SALE',adjustment:centsText(d.adjustmentCents??0),
  source_payload:{...(source.header.source_payload||{}),...(d.creator?{v2_creator:d.creator}:{}),
   ...(/^unsaved-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.id)?{v2_draft_key:d.id}:{})}};
 const lines=(d.lines||[]).map(l=>{
  const p=productFor(l.productId),old=source.lines.find(x=>x.source_id===l.id);
  if(!p||(p.fitId||'')!==(l.fitId||'')||!p.skuByCell[l.colorId+'|'+l.sizeId])throw Error('商品、颜色、版型和尺码未对应有效原 SKU');
  const sku=p.skuByCell[l.colorId+'|'+l.sizeId],q=String(l.quantity),warehouse=exchange&&l.quantity<0?returnWarehouse:d.warehouseId;
  const unchanged=old&&old.sku_id===sku&&old.warehouse_id===warehouse&&Number(old.source_quantity)===l.quantity
   &&(Number(old.unit_price)*100===l.priceCents||Math.round(Number(old.unit_price)*100)===l.priceCents)&&!!old.gift===!!l.gift
   &&(old.source_payload?.v2_pricing_rule||'unit-price')===(l.pricingRule||'unit-price')
   &&(old.source_payload?.v2_discount_tenths??null)===(l.discountTenths??null)
   &&(old.source_payload?.v2_reference_price_cents??null)===(l.referenceCents??null);
  if(unchanged)return {...old,source_payload:{...(old.source_payload||{}),v2_line_note:l.note||''}};
  const price=centsText(l.priceCents);
  const {amount,gross_cents,discount_cents,net_cents,return_basis,merged_source_ids,...base}=old||{};
  return {...base,source_id:l.id,sku_id:sku,product_id:p.uuid,color_id:l.colorId,size_id:l.sizeId,
   source_product_code:codeFor(p),source_product_name:p.name,source_color_name:l.color,source_size_name:l.sourceSize||l.size,
   source_quantity:q,unit_price:price,warehouse_id:warehouse,unit:old?.unit||p.unit||'',gift:!!l.gift,
   direction:l.quantity<0?'RETURN_IN':'SALE_OUT',zero_confirmed:l.zeroConfirmed===true,
   source_payload:{...(old?.source_payload||{}),v2_reference_price_cents:l.referenceCents??null,v2_pricing_rule:l.pricingRule||'unit-price',
    v2_discount_tenths:l.discountTenths??null,v2_previous_price_cents:l.previousPrice??null,v2_line_note:l.note||'',v2_zero_confirmed:l.zeroConfirmed===true},
   source_lineage:old?.source_lineage||{kind:'V2_RUNTIME'}};
 });
 const fundsRecords=(d.fundsRecords||[]).map(f=>{
  const old=source.fundsRecords.find(x=>x.source_id===f.id),amount=centsText(f.amountCents);
  if(old&&old.payment_method_id===f.methodId&&old.fund_account_id===f.accountId&&sourceMoneyCents(old.amount)===f.amountCents)return structuredClone(old);
  return {source_id:f.id||crypto.randomUUID(),settlement_id:f.settlementId||f.id||null,payment_method_id:f.methodId,fund_account_id:f.accountId,
   amount,direction:f.amountCents>0?'receipt':f.amountCents<0?'refund':'zero',source_payload:f.sourceFacts||{},reference:f.reference||null};
 });
 return {header,lines,fundsRecords};
}
