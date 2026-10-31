import test from 'node:test';
import assert from 'node:assert/strict';
import {salesQuantitySummary,salesExchangeSummary} from './sales-detail-summary.ts';
test('sale units include gifts while incoming/outgoing exclude gifts; BigInt never rounds',()=>{
 const rows=[{quantity:'9007199254740993',isGift:false},{quantity:'-2',isGift:false},{quantity:'3',isGift:true},{quantity:'-1',isGift:true}];
 assert.deepEqual(salesQuantitySummary(rows),{quantity:'9007199254740993',giftQuantity:'2',incoming:'2',outgoing:'9007199254740993'});
 assert.equal(salesQuantitySummary(null),null);assert.equal(salesQuantitySummary([{quantity:'1.',isGift:false}]),null);
 assert.deepEqual(salesQuantitySummary([]),{quantity:'0',giftQuantity:'0',incoming:'0',outgoing:'0'});
});
test('return/exchange direction is net due, never settlement difference; unknown remains unknown',()=>{
 assert.equal(salesExchangeSummary('-23900'),'应退 ¥239.00');assert.equal(salesExchangeSummary('23900'),'应收 ¥239.00');assert.equal(salesExchangeSummary('0'),'差额 ¥0.00');
 assert.equal(salesExchangeSummary(undefined),'差额 —');assert.equal(salesExchangeSummary('invalid'),'差额 —');
});

test('draft category display uses actual product/category identity, not equal labels; unpriced is not zero quantity',async()=>{
 const {salesDraftCategories}=await import('./sales-detail-summary.ts');
 const rows=[{product:{id:'p1',category:{id:'c1',label:'同名'}},quantity:'2',isGift:false},{product:{id:'p2',category:{id:'c2',label:'同名'}},quantity:'3',isGift:false},{product:{id:'p1',category:{id:'c1',label:'同名'}},quantity:'9',isGift:true}];
 assert.deepEqual(salesDraftCategories(rows),{basis:'CURRENT',metric:'QUANTITY',categoryCount:'2',hasMore:false,items:[{categoryId:'c1',categoryName:'同名',value:'2'},{categoryId:'c2',categoryName:'同名',value:'3'}]});
 assert.equal(salesDraftCategories([{...rows[0],quantity:'1.'}]),undefined);
 assert.deepEqual(salesDraftCategories([{product:{id:'p3'},quantity:'1',isGift:false}]).items,[{categoryId:null,categoryName:null,value:'1'}]);
});
