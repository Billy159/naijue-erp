import test from 'node:test';import assert from 'node:assert/strict';
import {salesDetailWire} from './document-list-wire.ts';
test('sales detail v2 is explicit; no header/v1/unknown strip both new fields',()=>{
 const base={document:{},stockBasis:'RUNTIME_LEDGER',referenceNames:{},settlementNames:[]};const value={...base,productSummary:{productCount:1n},categorySummary:{basis:'CURRENT'}};
 for(const version of [undefined,'category-v1','unknown'])assert.deepEqual(salesDetailWire(value,version),base);
 assert.equal(salesDetailWire(value,'category-v2'),value);assert.deepEqual(salesDetailWire(base,undefined),base);
});
