import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {standard27ProductPrerequisiteResult as decode} from '../adapters/postgres/src/standard27-product-prerequisite-result.ts';

test('native boolean observations are copied and frozen, not promoted to authority',()=>{
 for(const key of ['import_surface_closed','guards_present','locked'])for(const value of [true,false]){
  const row={[key]:value};const copied=decode({rows:[row],command:'SELECT',rowCount:1},key);
  row[key]=!value;assert.equal(copied[key],value);assert.equal(Object.isFrozen(copied),true);
 }
});
test('missing, additional, inherited and nonboolean observations fail closed',()=>{
 const invalid:unknown[]=[null,{}, {rows:[]},{rows:[{locked:true},{locked:true}]},{rows:[{locked:1}]},
  {rows:[{locked:'true'}]},{rows:[{locked:null}]},{rows:[{}]},{rows:[{locked:true,extra:true}]},
  {rows:[Object.create({locked:true})]},{rows:[Object.assign(Object.create(null),{locked:true})]},
  Object.create({rows:[{locked:true}]}),{rows:Object.assign([{locked:true}],{extra:true})},
  {rows:[{locked:true,[Symbol('extra')]:true}]},{rows:new Array(1)}];
 for(const input of invalid)assert.throws(()=>decode(input,'locked'),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});
});
test('accessors at every boundary are rejected without invocation',()=>{
 let invoked=0;const getter=()=>{invoked++;throw Error('must not execute');};
 const row=Object.defineProperty({},'locked',{get:getter,enumerable:true});
 const list=Object.defineProperty(new Array(1),'0',{get:getter,enumerable:true});
 for(const input of [Object.defineProperty({},'rows',{get:getter,enumerable:true}),{rows:list},{rows:[row]}])
  assert.throws(()=>decode(input,'locked'),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});
 assert.equal(invoked,0);
});
test('proxies at every boundary are rejected without invoking any trap',()=>{
 let invoked=0;const trap=()=>{invoked++;throw Error('must not execute');};
 const handler={get:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap,ownKeys:trap};
 for(const input of [new Proxy({rows:[{locked:true}]},handler),{rows:new Proxy([{locked:true}],handler)},
  {rows:[new Proxy({locked:true},handler)]}])assert.throws(()=>decode(input,'locked'),{code:'PRODUCT_EVIDENCE_CAPACITY_NOT_READY'});
 assert.equal(invoked,0);
});
test('dormant issuer decodes all three observations only after checking original context',()=>{
 const source=readFileSync(new URL('../adapters/postgres/src/standard27-product-capacity-issuer.ts',import.meta.url),'utf8');
 for(const [result,key] of [['privilegeResult','import_surface_closed'],['installedResult','guards_present'],['barrierResult','locked']])
  assert.ok(source.includes(`active();\n   const ${key==='import_surface_closed'?'privileges':key==='guards_present'?'installed':'barrier'} = standard27ProductPrerequisiteResult(${result}, '${key}')`));
 assert.match(source,/CLOSURE_ADMITTED: boolean = false/);
 assert.doesNotMatch(source,/privileges\.rows|installed\.rows|barrier\.rows/);
});
