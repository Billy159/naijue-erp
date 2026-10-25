import assert from 'node:assert/strict';
import test from 'node:test';
import {ALL_FILTER_VALUE as ALL,checkedFilterValues,resolveFilterSelection} from './filter-selection.ts';
const rows=[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'未加载的丙'}];
test('All checks loaded candidates while keeping the unbounded range as null',async()=>{
 assert.deepEqual(checkedFilterValues(null,rows.slice(0,2)),[ALL,'a','b']);
 assert.deepEqual(await resolveFilterSelection(null,rows,[],{trigger:{value:ALL},checked:false},async()=>rows),[]);
 assert.equal(await resolveFilterSelection([],rows,[ALL],{trigger:{_key:ALL},checked:true},async()=>rows),null);
});
test('unchecking an All child materializes every authorized candidate, including later pages',async()=>{
 let reads=0;const remaining=await resolveFilterSelection(null,rows.slice(0,2),[ALL,'b'],{trigger:{key:'a'},checked:false},async()=>{reads++;return rows;});
 assert.equal(reads,1);assert.deepEqual(remaining,rows.slice(1));
 assert.deepEqual(checkedFilterValues(remaining,rows),['b','c']);
});
test('clear and tag close stay empty; choosing all concrete candidates restores All',async()=>{
 assert.deepEqual(await resolveFilterSelection(null,rows,[],{},async()=>rows),[]);
 assert.deepEqual(await resolveFilterSelection(null,rows,['a','b'],{trigger:{value:ALL}},async()=>rows),[]);
 assert.equal(await resolveFilterSelection(rows.slice(0,2),rows,['a','b','c'],{trigger:{value:'c'},checked:true},async()=>rows,true),null);
 assert.deepEqual(await resolveFilterSelection([rows[0]!],rows,[],{trigger:{value:'a'},checked:false},async()=>rows),[]);
});
test('failed full-candidate materialization rejects without returning a false subset',async()=>{
 await assert.rejects(resolveFilterSelection(null,rows.slice(0,2),[],{trigger:{value:'a'},checked:false},async()=>{throw new Error('unavailable');}),/unavailable/);
});
