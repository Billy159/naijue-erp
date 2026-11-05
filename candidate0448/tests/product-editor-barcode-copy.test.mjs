import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('barcode panel distinguishes required new product code from optional SKU barcode',async()=>{
 const s=await readFile(new URL('../apps/web/src/products/product-editor-barcodes.tsx',import.meta.url),'utf8');
 assert.match(s,/新建商品须手工填写系统货号/);assert.match(s,/SKU条码可暂空/);assert.doesNotMatch(s,/系统货号可暂空/);
});
