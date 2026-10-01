import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planHistoricalBarcodes} from './barcode-plan.mjs';
import {validateC8Freeze} from './c8-freeze.mjs';

const row=(product_id,code,scheme,default_barcode,sku_id,COLOR,SIZE)=>({product_id,code,scheme,default_barcode,sku_id,options:{COLOR,SIZE}});
const rows=[
 row('red','A1612202-红色','8','A1047','red-02','101','02'),
 row('red','A1612202-红色','8','A1047','red-910','101','910'),
 row('long','LONG-2021','6','A12345678','long-910','001','910'),
 row('missing','81218','9','81218','missing-01','507','03'),
 row('short','00005','9','00005','short-510','0','510'),
 row('letters','JK80966','9','80966','letters-507','621','507'),
 row('long-stock','JK80966AB','9','80966AB12','long-stock-507','621','507'),
 row('punctuation','15272-1','9','1015272801','punctuation-03','03','03'),
 row('nonascii','SK928-酒红','9','8A1553006','nonascii-03','0','03'),
 row('sample','8809 样衣','9','8809000','sample-504','501','504'),
 row('socks','虚拟袜子','9','WZ139001','socks-910','0','910'),
 row('coffee','A1857223咖啡毛领','0','1857223251','coffee-none','0','05'),
 row('coffee','A1857223咖啡毛领','0','1857223251','coffee-color','251','05'),
 row('duplicate','补差价','6','11112','duplicate-0','0','10'),
 row('duplicate','补差价','6','11112','duplicate-000','000','10'),
];
const old=[{barcode:'01857223251005',sku_id:'coffee-color',origin:'generated',rule:'historical-generation-v2'}];
const plan=planHistoricalBarcodes(rows,old);
const get=sku=>plan.accepted.find(x=>x.sku_id===sku);
assert.equal(get('red-02').barcode,'8A1047102');
assert.equal(get('red-910').barcode,'8A1047100');
assert.equal(get('long-910').barcode,'6A1234567800100');
assert.equal(get('missing-01').barcode,'981218507003');
assert.equal(get('short-510').barcode,'900005000510');
assert.equal(get('letters-507').barcode,'980966621507');
assert.equal(get('long-stock-507').barcode,'980966AB12621507');
assert.equal(get('punctuation-03').barcode,'91015272801003003');
assert.equal(get('nonascii-03').barcode,'98A1553006000003');
assert.equal(get('sample-504').barcode,'98809000501504');
assert.equal(get('socks-910').barcode,'9WZ139001000910');
assert.equal(get('coffee-none').color,'2');
assert.equal(get('coffee-color').barcode,'01857223251105');
assert.equal(plan.issues.length,0);
assert.ok(plan.accepted.every(x=>x.sourceItemField==='defaultBarcode'&&x.goods===x.defaultBarcode));
assert.equal(get('duplicate-000').barcode,'61111200010');
assert.equal(get('duplicate-0').barcode,'61111200110');
assert.equal(plan.collisions.length,0);
assert.equal(plan.aliases.find(x=>x.sku_id==='red-910'&&x.kind==='raw-source-size').barcode,'8A10471910');
const review=JSON.parse(readFileSync(new URL('./c8-barcode-targets.json',import.meta.url),'utf8'));
const freeze=JSON.parse(readFileSync(new URL('./c8-barcode-freeze.json',import.meta.url),'utf8'));
const sources=freeze.records.map(x=>({sku_id:x.skuId,product_id:x.productCode,code:x.productCode,a:{sourceBarcodeSchemeCode:x.scheme,defaultBarcode:x.sourceDefaultBarcode},options:{COLOR:x.sourceColor,SIZE:x.sourceSize}}));
assert.equal(freeze.generatedCount,163);assert.equal(freeze.approvedExceptionCount,0);
const frozenPlan={accepted:freeze.records.map(x=>({sku_id:x.skuId,barcode:x.barcode,goods:x.sourceDefaultBarcode,sourceItemField:'defaultBarcode'})),issues:[],collisions:[]};
assert.equal(validateC8Freeze(review,freeze,sources,frozenPlan,[]).approvedExceptions.length,0);
const changedSources=structuredClone(sources);changedSources[0].a.defaultBarcode+='1';
assert.throws(()=>validateC8Freeze(review,freeze,changedSources,frozenPlan,[]),/C8_FROZEN_SOURCE_CHANGED/);
const changedResult=structuredClone(frozenPlan);changedResult.accepted[0].barcode+='1';
assert.throws(()=>validateC8Freeze(review,freeze,sources,changedResult,[]),/C8_FROZEN_BARCODE_CHANGED/);
const wrongItem=structuredClone(frozenPlan);wrongItem.accepted[0].sourceItemField='stockCode';
assert.throws(()=>validateC8Freeze(review,freeze,sources,wrongItem,[]),/C8_FROZEN_ITEM_FIELD_CHANGED/);
const wrongGoods=structuredClone(frozenPlan);wrongGoods.accepted[0].goods+='1';
assert.throws(()=>validateC8Freeze(review,freeze,sources,wrongGoods,[]),/C8_FROZEN_ITEM_FIELD_CHANGED/);
assert.throws(()=>validateC8Freeze(review,freeze,[...sources,{sku_id:'OUTSIDE-C8'}],frozenPlan,[]),/C8_FREEZE_SCOPE_MISMATCH/);
console.log('barcode-plan fixtures PASS');
