import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateC9Freeze} from './c9-freeze.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const review=read('./c9-barcode-targets.json'),freeze=read('./c9-barcode-freeze.json');
const rows=freeze.records.map(x=>({sku_id:x.skuId,code:x.productCode,
  a:{sourceBarcodeSchemeCode:x.scheme,defaultBarcode:x.sourceDefaultBarcode},options:{COLOR:x.sourceColor,SIZE:x.sourceSize}}));
const plan={accepted:freeze.records.map(x=>({sku_id:x.skuId,barcode:x.barcode,sourceItemField:'defaultBarcode',goods:x.sourceDefaultBarcode})),issues:[],collisions:[]};
assert.equal(validateC9Freeze(review,freeze,rows,plan).unresolved.length,0);
const truncated=structuredClone(plan);truncated.accepted[0].goods=truncated.accepted[0].goods.slice(0,7);
assert.throws(()=>validateC9Freeze(review,freeze,rows,truncated),/C9_FROZEN_ITEM_FIELD_CHANGED/);
const changed=structuredClone(rows);changed[0].a.defaultBarcode='WRONG';
assert.throws(()=>validateC9Freeze(review,freeze,changed,plan),/C9_FROZEN_SOURCE_CHANGED/);
const duplicate=structuredClone(plan);duplicate.accepted[1].barcode=duplicate.accepted[0].barcode;
assert.throws(()=>validateC9Freeze(review,freeze,rows,duplicate),/C9_FROZEN_BARCODE_CHANGED/);
assert.throws(()=>validateC9Freeze(review,freeze,[...rows,{sku_id:'OUTSIDE-C9'}],plan),/C9_FREEZE_SCOPE_MISMATCH/);
const missing=structuredClone(plan);missing.accepted.pop();
assert.throws(()=>validateC9Freeze(review,freeze,rows,missing),/C9_FROZEN_BARCODE_CHANGED/);
console.log('C9 freeze guards PASS: reject truncation, source changes, duplicates and out-of-scope SKUs');
