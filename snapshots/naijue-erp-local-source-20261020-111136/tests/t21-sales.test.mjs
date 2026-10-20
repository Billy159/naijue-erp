import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateDiscount, discountPrice, lineAmount, money, returnBasis} from '../dist/server/domain/sales/money.js';
import {buildSaleBody, centsText, resolveSaleDocumentId} from '../frontend/sales-transport.mjs';

test('T21 new money rejects floats, exponent notation, extra precision and unsafe cents',()=>{
 assert.equal(money('999999999.99','price'),99999999999n);
 for(const bad of [10.01,'1e2','1.000','NaN','Infinity','',' 1.00 ','90071992547410.00'])assert.throws(()=>money(bad,'price'));
 assert.equal(centsText(101),'1.01');assert.equal(centsText(-1),'-0.01');
 assert.throws(()=>centsText(1.5));
});
test('T21 discount and signed fractional quantity round half away from zero',()=>{
 assert.equal(discountPrice(3n,50),2n);assert.equal(discountPrice(10000n,90),9000n);
 assert.throws(()=>discountPrice(100n,90.5));assert.throws(()=>discountPrice(100n,101));
 assert.equal(lineAmount(1n,5000n),1n);assert.equal(lineAmount(1n,-5000n),-1n);
});
test('T21 proportional allocations conserve cents and use original order for equal remainders',()=>{
 assert.deepEqual(allocateDiscount([1n,1n,1n],2n),[1n,1n,0n]);
 // Independent bounded enumeration checks conservation and each floor/ceiling bound.
 for(let a=0n;a<=10n;a++)for(let b=0n;b<=10n;b++)for(let c=0n;c<=3n;c++)for(let discount=0n;discount<=a+b+c;discount++){
  const gross=[a,b,c],sum=a+b+c,shares=allocateDiscount(gross,discount);
  assert.equal(shares.reduce((x,y)=>x+y,0n),discount);
  shares.forEach((share,i)=>{assert.ok(share<=gross[i]&&share>=0n);if(sum){const exact=gross[i]*discount;assert.ok(share===exact/sum||share===exact/sum+1n);}});
 }
 assert.throws(()=>allocateDiscount([1n],2n));assert.throws(()=>allocateDiscount([-1n],0n));
});
test('T21 return basis preserves piece remainders and exact fractional rational quantities',()=>{
 assert.deepEqual(returnBasis(2999n,30000n),{quantity:'3.0000',netCents:'2999',quantityTenThousandths:'30000',unitCents:'999',extraCentUnits:'2'});
 const fractional=returnBasis(1n,5000n);assert.equal(fractional.quantityTenThousandths,'5000');assert.equal(fractional.unitCents,undefined);
});
const sku='21000000-0000-4000-8000-000000000111',p={id:'P1',uuid:'21000000-0000-4000-8000-000000000101',fitId:'A',name:'Product',unit:'件',skuByCell:{'C|S':sku}};
const uiLine={id:'LINE',productId:'P1',colorId:'C',sizeId:'S',fitId:'A',quantity:2,priceCents:101,gift:false,referenceCents:null,pricingRule:'unit-price',discountTenths:null,note:'',zeroConfirmed:false};
test('T21 existing editor sends exact decimal strings and day precision without multiplying binary floats',()=>{
 const d={id:'unsaved-x',date:'2026-10-02T23:59',businessType:'销售',warehouseId:'W',storeId:'H',adjustmentCents:1,lines:[uiLine],fundsRecords:[{id:'F',methodId:'M',accountId:'A',amountCents:201}]};
 const result=buildSaleBody(d,()=>p,product=>product.id);
 assert.equal(result.header.business_date,'2026-10-02');assert.equal(result.header.adjustment,'0.01');assert.equal(result.lines[0].unit_price,'1.01');
 assert.equal(result.lines[0].amount,undefined);assert.equal(result.fundsRecords[0].amount,'2.01');assert.equal(result.lines[0].direction,'SALE_OUT');
});
test('T21 transport preserves trusted source precision, full history and unchanged snapshots',()=>{
 const original={source_id:'LINE',sku_id:sku,warehouse_id:'W',product_id:p.uuid,color_id:'C',size_id:'S',source_quantity:'2.0000',unit_price:'12.3456',amount:'24.69',unit:'件',source_payload:{historicalFact:'unchanged'}};
 const funds=Array.from({length:5},(_,i)=>({source_id:'F'+i,settlement_id:'OLD'+i,payment_method_id:'M',fund_account_id:'A',amount:'0.00',direction:'zero',source_payment_method_name:'Old method',source_fund_account_name:'Old account'}));
 funds[4].amount='14.69';funds[4].direction='receipt';
 const d={id:'HISTORY',date:'2026-10-01',businessType:'销售',warehouseId:'W',adjustmentCents:0,_runtime:{body:{header:{},lines:[original],fundsRecords:funds}},lines:[{...uiLine,priceCents:1235}],fundsRecords:funds.map((f,i)=>({id:f.source_id,methodId:'M',accountId:'A',amountCents:i===4?1469:0}))};
 const result=buildSaleBody(d,()=>p,product=>product.id);
 assert.equal(result.lines[0].unit_price,'12.3456');assert.equal(result.lines[0].amount,'24.69');assert.deepEqual(result.fundsRecords,funds);
 d.lines[0].priceCents=Number(original.unit_price)*100;
 assert.equal(buildSaleBody(d,()=>p,product=>product.id).lines[0].unit_price,'12.3456');
 d.lines[0].quantity=3;d.lines[0].priceCents=1000;
 const changed=buildSaleBody(d,()=>p,product=>product.id);
 assert.equal(changed.lines[0].amount,undefined);assert.equal(changed.lines[0].unit_price,'10.00');assert.equal(changed.lines[0].source_quantity,'3');
});
test('T21 direct historical number lookup is exact and refuses ambiguous accessible matches',async()=>{
 const id=await resolveSaleDocumentId('H5',async path=>{
  const url=new URL(path,'https://t21.invalid');assert.deepEqual(JSON.parse(url.searchParams.get('filters')),{exactNumber:'H5'});
  return {total:1,items:[{number:'H5',id:sku}]};
 });
 assert.equal(id,sku);assert.equal(await resolveSaleDocumentId(sku,()=>{throw Error('UUID must not require number search')}),sku);
 for(const result of [{total:0,items:[]},{total:2,items:[{number:'H5',id:sku},{number:'H5',id:sku}]},{total:1,items:[{number:'H50',id:sku}]}])await assert.rejects(resolveSaleDocumentId('H5',async()=>result));
});
