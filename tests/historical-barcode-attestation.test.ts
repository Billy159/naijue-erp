import test from 'node:test'; import assert from 'node:assert/strict';
import { parseHistoricalBarcodeAttestation } from '../packages/application/src/historical-barcode-attestation.ts';
const id=(n:string)=>`00000000-0000-4000-8000-${n.padStart(12,'0')}`;
const sha='a'.repeat(64), ref={file_sha256:sha,sheet:'脱敏',row:7};
const input=()=>({version:'HISTORICAL_BARCODE_ATTESTATION_V1',product_id:id('1'),product_source_key:'original-item',entries:[{scheme_id:'48c4fe44-7521-44c1-a0e3-c547a1691028',color_id:id('2'),fit_id:id('4'),size_id:id('3'),product_segment:'031550411',color_code:'501',size_code:'03',sources:{product:{...ref},color:{...ref},fit:{...ref},size:{...ref}}}]});
test('strict declared evidence preserves raw bytes and binds product / pinned files',()=>{const v=parseHistoricalBarcodeAttestation(input(),id('1'),new Set([sha]));assert.equal(v.entries[0]!.product_segment,'031550411');assert.equal(v.verification,'LOCAL_DECLARATION_ONLY');});
test('unavailable, forged, duplicated and malformed mappings fail closed',()=>{
 for(const mutate of [(x:any)=>x.product_id=id('9'),(x:any)=>x.entries.push(structuredClone(x.entries[0])),(x:any)=>x.entries[0].sources.size.file_sha256='b'.repeat(64),(x:any)=>x.entries[0].color_code='5',(x:any)=>x.entries[0].size_code='3',(x:any)=>x.entries[0].product_segment='',(x:any)=>x.entries[0].product_segment='x'.repeat(507),(x:any)=>x.entries[0].product_segment='a\nb',(x:any)=>x.entries[0].arbitrary=true,(x:any)=>x.entries[0].scheme_id='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef']) { const v=input(); mutate(v); assert.throws(()=>parseHistoricalBarcodeAttestation(v,id('1'),new Set([sha]))); }
});

test('array accessors, holes, symbols and hidden properties cannot execute or escape validation',()=>{
 let calls=0; const a=input(); const arr=a.entries; Object.defineProperty(arr,'0',{enumerable:true,get(){calls++;throw Error('getter');}});assert.throws(()=>parseHistoricalBarcodeAttestation(a,id('1'),new Set([sha])));assert.equal(calls,0);
 for(const alter of [(a:any[])=>{delete a[0];},(a:any[])=>{Object.defineProperty(a,'extra',{value:1});},(a:any[])=>{(a as any)[Symbol('extra')]=1;}]) {const b=input();alter(b.entries);assert.throws(()=>parseHistoricalBarcodeAttestation(b,id('1'),new Set([sha])));}
});
test('source segment length respects exact 512-character scanner limit without truncation',()=>{const v=input();v.entries[0]!.product_segment='A'.repeat(506);assert.equal(parseHistoricalBarcodeAttestation(v,id('1'),new Set([sha])).entries[0]!.product_segment.length,506);v.entries[0]!.product_segment='A'.repeat(507);assert.throws(()=>parseHistoricalBarcodeAttestation(v,id('1'),new Set([sha])));});
test('same historical color and size may belong to different actual fits without splitting source segment',()=>{const v=input(); const e=structuredClone(v.entries[0]!);e.fit_id=id('5');v.entries.push(e);const result=parseHistoricalBarcodeAttestation(v,id('1'),new Set([sha]));assert.deepEqual(result.entries.map(x=>x.fit_id),[id('4'),id('5')]);assert.ok(result.entries.every(x=>x.product_segment==='031550411'));});

test('proxy evidence containers reject before invoking any caller traps',()=>{
 for(const location of ['root','entries','entry','sources','source-ref']){
  const value=input();let calls=0;
  const proxy=(target:object)=>new Proxy(target,{get(){calls++;throw Error('proxy get executed');},getPrototypeOf(){calls++;throw Error('proxy prototype executed');},ownKeys(){calls++;throw Error('proxy keys executed');},getOwnPropertyDescriptor(){calls++;throw Error('proxy descriptor executed');}});
  let candidate:unknown=value;
  if(location==='root')candidate=proxy(value);
  if(location==='entries')value.entries=proxy(value.entries) as typeof value.entries;
  if(location==='entry')value.entries[0]=proxy(value.entries[0]!) as typeof value.entries[number];
  if(location==='sources')value.entries[0]!.sources=proxy(value.entries[0]!.sources) as typeof value.entries[number]['sources'];
  if(location==='source-ref')value.entries[0]!.sources.product=proxy(value.entries[0]!.sources.product) as typeof ref;
  assert.throws(()=>parseHistoricalBarcodeAttestation(candidate,id('1'),new Set([sha])),/INVALID_HISTORICAL_BARCODE_ATTESTATION/);
  assert.equal(calls,0,location);
 }
});

test('unpaired UTF-16 source strings fail closed instead of changing when encoded as UTF-8',()=>{
 for(const invalid of ['\ud800','\udfff','A\ud800B','A\udfffB','\ud800\ud800','\udfff\udfff']){
  for(const location of ['segment','source-key','sheet']){
   const value=input();
   if(location==='segment')value.entries[0]!.product_segment=invalid;
   if(location==='source-key')value.product_source_key=invalid;
   if(location==='sheet')value.entries[0]!.sources.product.sheet=invalid;
   assert.throws(()=>parseHistoricalBarcodeAttestation(value,id('1'),new Set([sha])),/INVALID_HISTORICAL_BARCODE_ATTESTATION/);
  }
 }
});

test('well-formed supplementary Unicode remains exact, with no normalization or replacement',()=>{
 const value=input();value.product_source_key='原始\u{1f600}';value.entries[0]!.product_segment='A\u{1f600}e\u0301';value.entries[0]!.sources.product.sheet='来源\u{20000}';
 const result=parseHistoricalBarcodeAttestation(value,id('1'),new Set([sha]));
 assert.equal(result.product_source_key,value.product_source_key);
 assert.equal(result.entries[0]!.product_segment,value.entries[0]!.product_segment);
 assert.equal(result.entries[0]!.sources.product.sheet,value.entries[0]!.sources.product.sheet);
});
