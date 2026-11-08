import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestHash} from '../packages/application/src/request-hash.ts';
import {requestHashIncremental} from '../tools/unified-import/stream-typed-hash.mjs';
const result=(fn,value)=>{try{return {hash:fn(value)}}catch(e){return {name:e.name,code:e.code??null,message:e.message}}};
test('initializer incremental hash preserves original values and original exceptions',()=>{
 const factories=[()=>null,()=>true,()=>false,()=>0,()=>-0,()=>Number.MAX_SAFE_INTEGER,()=>Number.MIN_SAFE_INTEGER,()=>2n,()=>'',()=> '中😀\n\t"\\\ud800',()=>[null,'x',-1],()=>({z:1,a:{q:['x',false]}}),()=>({a:{q:['x',false]},z:1}),()=>[1,,3],()=>new Array(3),()=>1.5,()=>NaN,()=>Infinity,()=>undefined,()=>Symbol('x'),()=>new Date(0),()=>Object.create(null),()=>{let d='leaf';for(let i=0;i<70;i++)d={a:d};return d},()=>{const d={};d.self=d;return d},()=>{const a=[];a.push(a);return a},()=>{const a=[];Object.defineProperty(a,'0',{enumerable:true,get(){return 1}});return a},()=>{const d={};Object.defineProperty(d,'x',{enumerable:true,get(){return 'value'}});return d},()=>{const a=[1,2];a.map=()=>['CUSTOM','MAP'];return a},()=>new Proxy({a:1},{})];
 for(const make of factories)assert.deepEqual(result(requestHashIncremental,make()),result(requestHash,make()));
 const a={z:1,a:['中','x']},b={a:['中','x'],z:1};assert.equal(requestHashIncremental(a),requestHash(b));
});
test('fallback preserves observable getter and proxy order without new validation',()=>{
 const run=fn=>{const events=[],nested={};Object.defineProperty(nested,'value',{enumerable:true,get(){events.push('getter');return 2}});const value=new Proxy({z:nested,a:1},{getPrototypeOf(t){events.push('prototype');return Reflect.getPrototypeOf(t)},ownKeys(t){events.push('keys');return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){events.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k)},get(t,k,r){events.push('get:'+String(k));return Reflect.get(t,k,r)}});return {outcome:result(fn,value),events}};
 assert.deepEqual(run(requestHashIncremental),run(requestHash));
});
test('IH-01 non-enumerable numeric array slots retain nested custom map output',()=>{
 const make=()=>{const outer=[],inner=[1,2];inner.map=()=>['CUSTOM','MAP'];Object.defineProperty(outer,'0',{value:inner,enumerable:false});return outer};
 assert.deepEqual(result(requestHashIncremental,make()),result(requestHash,make()));
});
test('IH-01 non-enumerable numeric array slots retain nested map getter exceptions',()=>{
 const make=()=>{const outer=[],inner=[1,2];Object.defineProperty(inner,'map',{get(){throw Error('SYNTHETIC_MAP_ACCESSOR')}});Object.defineProperty(outer,'0',{value:inner,enumerable:false});return outer};
 assert.deepEqual(result(requestHashIncremental,make()),result(requestHash,make()));
});
test('exact production initializer guard accepts original typed hash and rejects changed wire or private parameter (unit only)',async()=>{
 const url=new URL('../tools/unified-import/fresh35-host-session.mjs',import.meta.url),source=await readFile(url,'utf8');
 const body=source.slice(source.indexOf('export function fresh35ProductionImportQueryGuard('),source.indexOf('export async function openReviewedFresh35ProductionHost('));
 const imp=p=>JSON.stringify(new URL(p,import.meta.url).href);
 const prefix=`import {createHash} from 'node:crypto';import {requestHash} from ${imp('../packages/application/src/request-hash.ts')};import {canonicalRequestValue} from ${imp('../packages/application/src/canonical-request-value.ts')};import {parseStrictJson} from ${imp('../packages/application/src/unified-import-contract.ts')};import {requestHashIncremental} from ${imp('../tools/unified-import/stream-typed-hash.mjs')};
 const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HOST_'+code)};
 const productionImportAuthorities=new WeakMap(),productionImportBindings=new WeakMap();
 const context={},prepared={steps:{async *[Symbol.asyncIterator](){}}},authorization={},bindingOriginal={};
 const fresh35HostContext=c=>{if(c!==context)throw Error('MODEL_CONTEXT');return {productionImport:true}};
 const currentProductionImportAuthority=async()=>{};
 export function model(binding){productionImportBindings.set(bindingOriginal,{prepared});productionImportAuthorities.set(authorization,{context,bindingOriginal,binding,expiresAt:1,sha256:'MODEL_ONLY'});return fresh35ProductionImportQueryGuard(context,authorization,prepared)};
 `;
 const model=await import('data:text/javascript;base64,'+Buffer.from(prefix+body+'\n//# sourceURL=initializer-guard-unit.mjs').toString('base64'));
 const initialize={payload:{historical_hall_approval:{utf8:'{"synthetic":true}\n ',sha256:'a'.repeat(64)},admin:{account_id:'SYNTHETIC'}},request_key:'ORIGINAL_SYNTHETIC_KEY'},encoded='SYNTHETIC_PRIVATE_PARAMETER';
 const guard=model.model({initializerSha256:requestHash({initialize,encodedScrypt:encoded})});
 const sql='SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json';
 await guard.check(sql,[JSON.stringify(initialize),encoded]);
 for(const [value,key]of [[{...initialize,request_key:'CHANGED'},encoded],[{...initialize,payload:{...initialize.payload,historical_hall_approval:{...initialize.payload.historical_hall_approval,utf8:'CHANGED'}}},encoded],[initialize,'CHANGED_PRIVATE_PARAMETER']])await assert.rejects(guard.check(sql,[JSON.stringify(value),key]),/PRODUCTION_INITIALIZER_BINDING_DIFFERS/);
 await guard.check('ROLLBACK');
});
