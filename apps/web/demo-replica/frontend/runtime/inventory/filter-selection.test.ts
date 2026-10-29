import {parseInventoryQuery} from '../../../../../../packages/application/src/inventory-query-validation.ts';
import {parseProductManagementListQuery} from '../../../../../../packages/application/src/product-management-query-validation.ts';
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

test('B11 explicit caller budgets reject All-minus-one overflow without truncation',async()=>{
 const rows=(count:number)=>Array.from({length:count},(_,n)=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,label:String(n)}));
 for(const maximum of [100,200]){
  const accepted=rows(maximum+1),result=(await resolveFilterSelection(null,accepted,[],{trigger:{key:accepted[0]!.id},checked:false},async()=>accepted,true,maximum))!;assert.equal(result.length,maximum);if(maximum===100)parseInventoryQuery({filter:{products:result,categories:[],warehouses:[],suppliers:[],fits:[],seasons:[]},page:1,pageSize:100});else parseProductManagementListQuery({filter:{productIds:result.map(x=>x.id),categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]},page:1,pageSize:100});
  const rejected=rows(maximum+2);await assert.rejects(resolveFilterSelection(null,rejected,[],{trigger:{key:rejected[0]!.id},checked:false},async()=>rejected,true,maximum),new RegExp(String(maximum)));
 }
});
