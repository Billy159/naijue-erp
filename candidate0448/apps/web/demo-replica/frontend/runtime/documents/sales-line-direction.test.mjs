import test from 'node:test';
import assert from 'node:assert/strict';
import {salesLineDirectionQuantity} from './sales-line-direction.ts';
test('direction changes only exact nonzero int64 sign',()=>{
 for(const n of ['1','9007199254740993','9223372036854775807'])for(const raw of [n,'-'+n]){assert.equal(salesLineDirectionQuantity(raw,'IN'),'-'+n);assert.equal(salesLineDirectionQuantity(raw,'OUT'),n);}
 assert.equal(salesLineDirectionQuantity('-9223372036854775808','IN'),'-9223372036854775808');assert.equal(salesLineDirectionQuantity('-9223372036854775808','OUT'),null);
 for(const raw of ['','-','0','-0','+2','01','1.5','9223372036854775808','-9223372036854775809',' 1'])for(const to of ['IN','OUT'])assert.equal(salesLineDirectionQuantity(raw,to),null,raw);
});
