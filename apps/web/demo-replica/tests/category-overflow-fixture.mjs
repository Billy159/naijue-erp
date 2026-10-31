/** Explicit finite overflow specimen, never imported by production. Reuses declared QA product/SKU facts. */
import {qaSalesDocuments,qaTransferDocuments,qaProducts,qaSkus,qaTransferCatalog,qaId} from '../frontend/qa-reference-fixtures.mts';
export function installCategoryOverflowFixture(){
 for(const [kind,docs]of [['sales',qaSalesDocuments],['transfer',qaTransferDocuments]]){
  const d=docs.at(-1),h=d.document.header,template=d.document.lines[0];
  d.document.lines=qaProducts.map((p,i)=>{const sku=qaSkus.find(s=>s.productId===p.id),price=BigInt(Math.round(Number(p.retailPrice)*100));return {...template,id:qaId((kind==='sales'?910000:920000)+i),lineNo:i+1,skuId:sku.id,quantity:'1',snapshot:{productCode:sku.productCode,productName:sku.productName,colorName:sku.colorName,fitName:sku.fitName,sizeName:sku.sizeName,barcode:sku.barcode},...(kind==='sales'?{referencePrice:String(price),dealPrice:String(price),pricingRule:'UNIT_PRICE',discountTenths:null,zeroConfirmed:price===0n,isGift:false,lineAmount:String(price),allocatedDiscount:'0'}:{})};});
  if(kind==='sales'){h.businessType='SALE';h.grossAmount=d.document.lines.reduce((n,l)=>n+BigInt(l.lineAmount),0n).toString();h.orderDiscount='0';h.netDue=h.grossAmount;const total=BigInt(h.netDue);d.document.settlements.forEach((s,i)=>{s.direction='RECEIVE';s.amount=String(i===0?total/2n:total-total/2n);});}
  else d.catalog=qaTransferCatalog(d.document.lines);
 }
}
