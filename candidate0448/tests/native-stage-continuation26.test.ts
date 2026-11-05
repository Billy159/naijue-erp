import test from 'node:test';
import assert from 'node:assert/strict';
import { engineFixtures,id } from './integration/native-import-accounting-fixture.ts';
import { prepareNativePartyImportChunk } from '../packages/application/src/native-party-import.ts';
import { prepareNativeCatalogueImportChunk } from '../packages/application/src/native-catalogue-import.ts';
import { prepareNativeBarcode } from '../packages/application/src/native-barcode-import.ts';
import { captureNativeStageContinuationInput26, nativeStageContinuationCommitments26, verifyCommittedNativeStagePrefix26 } from '../adapters/postgres/src/native-stage-continuation26.ts';
import type { NativeStageContinuationCapture26, NativeStageContinuationContext26 } from '../adapters/postgres/src/native-stage-continuation26.ts';
import type { ImportSourceEvidence } from '../packages/application/src/history-storage-contract.ts';
function provenance(s:ImportSourceEvidence){s.fieldProvenance={schema_version:1,fields:Object.fromEntries(Object.entries(s.rawFields).map(([k,raw])=>[k,{origin:'ORIGINAL',reason:'synthetic independent row',raw}]))};}
let original:NativeStageContinuationCapture26;
function fixture(){
 if(original)return original;
 const f=engineFixtures();
 const parties=Array.from({length:515},(_,i)=>{
  const input=structuredClone(f.parties[0]!);input.source.id=id(10000+i);input.source.sourceKey=`SYNTHETIC_HALL_${i}`;input.source.rowNo=String(10000+i);input.nativeSnapshot.id=id(20000+i);
  input.source.rawFields['来源编号']=input.source.sourceKey;input.source.normalizedFields['来源编号']=input.source.sourceKey;provenance(input.source);
  return prepareNativePartyImportChunk([input]).rows[0]!;
 });
 const catalogue=Array.from({length:344},(_,i)=>{
  const r=structuredClone(f.catalogue.rows.find(r=>r.source.entityType==='SIZE')!);r.source.id=id(30000+i);r.source.sourceKey=`SYNTHETIC_SIZE_${i}`;r.source.rowNo=String(30000+i);(r as any).nativeId=id(40000+i);r.source.rawFields.sourceId=r.source.sourceKey;r.source.normalizedFields.sourceId=r.source.sourceKey;provenance(r.source);
  return prepareNativeCatalogueImportChunk({...f.catalogue,rows:[r]}).rows[0]!;
 });
 const barcodes=Array.from({length:15018},(_,i)=>{
  const input=structuredClone(f.barcode);input.source.id=id(50000+i);input.source.sourceKey=`SYNTHETIC_BARCODE_${i}`;input.source.rowNo=String(50000+i);(input as any).nativeBarcodeId=id(70000+i);
  for(const fields of [input.source.rawFields,input.source.normalizedFields]){fields['来源编号']=input.source.sourceKey;fields['条码']=`SYNTHETIC_${i}`;fields['条码性质']='已确认旧码';}
  input.source.normalizedFields['原始条码性质快照']='已确认旧码';provenance(input.source);
  return prepareNativeBarcode(input);
 });
 original={preparation:{inputDigest:'a'.repeat(64),manifestSha256:'b'.repeat(64),original148Refs:[{path:'/SYNTHETIC/148',sha256:'c'.repeat(64)}],original201Refs:[{path:'/SYNTHETIC/201',sha256:'d'.repeat(64)}]},groups:[{name:'PARTIES',members:parties},{name:'CATALOGUE',members:catalogue},{name:'BARCODES',members:barcodes}],async onVerified(){throw Error('Verifier must never publish a callback before caller COMMIT');}};
 return original;
}
const context:NativeStageContinuationContext26={binding:{batchId:id(1),fixedSourceNamespace:'synthetic.accounting15',selectionSha256:'b'.repeat(64)},checkpoint:{sequence:3,cursor:22},bind:{operationId:id(9),requestKey:'SYNTHETIC_ORIGINAL_BIND',requestHash:'e'.repeat(64)}};
test('v23 full515/344/15018 source members produce161 bounded summaries on caller client and retain ordered original commitments',async()=>{
 const input=captureNativeStageContinuationInput26(fixture()),queries:string[]=[],sizes:number[]=[];
 const client={async query(sql:string,values?:unknown[]){queries.push(sql);const page=JSON.parse(values![0] as string);sizes.push(page.length);return{rows:page.map((p:any)=>({ordinal:p.ordinal,exact:true})),rowCount:page.length};}};
 const proof=await verifyCommittedNativeStagePrefix26(client,context,input);
 assert.equal(queries.length,161);assert.equal(sizes.reduce((a,b)=>a+b,0),15877);assert.ok(sizes.every(n=>n>0&&n<=100));
 assert.deepEqual(proof.groups,nativeStageContinuationCommitments26(input.groups));assert.deepEqual(proof.binding,context.binding);assert.notEqual(proof.binding,context.binding);
 assert.ok(queries.every(q=>!(/\b(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|LIMIT 1)\b/i.test(q))));
 // Source/creation evidence is exact while maintained PARTY/CATALOGUE native fields are deliberately not compared wholesale.
 assert.match(queries[0]!,/native_party_import_evidence/);assert.match(queries[0]!,/creation_xid/);assert.match(queries[0]!,/source_name/);
 assert.doesNotMatch(queries[0]!,/to_jsonb\(n\)/);assert.doesNotMatch(queries[6]!,/to_jsonb\(n\)/);
 assert.match(queries[6]!,/member_group_id/);assert.match(queries[6]!,/native_snapshot=ref/);
 assert.match(queries[10]!,/to_jsonb\(b\)=e->'native'/);assert.match(queries[10]!,/old_source_sku_id/);assert.match(queries[10]!,/field_provenance->>'native_barcode'/);assert.match(queries[10]!,/barcode_kind='MAIN'/);
});
test('v23 partial, reordered and conflicting DB summaries refuse rather than accepting rowCount or first match',async()=>{
 const input=fixture();
 for(const mode of ['partial','false','reorder']){
  let calls=0;await assert.rejects(verifyCommittedNativeStagePrefix26({async query(_sql:string,values?:unknown[]){calls++;const rows=JSON.parse(values![0] as string).map((p:any)=>({ordinal:p.ordinal,exact:true}));if(mode==='partial')rows.pop();if(mode==='false')rows[0].exact=false;if(mode==='reorder')rows.reverse();return{rowCount:100,rows};}},context,input),/member|summar/i);assert.equal(calls,1);
 }
});
test('v23 forged preparation, missing full group and duplicate/foreign source refuse without querying',async()=>{
 const f=fixture();
 for(const change of [(v:any)=>v.groups.pop(),(v:any)=>v.groups[0].members.pop(),(v:any)=>v.preparation.original201Refs=[],(v:any)=>v.groups[0].name='PARTY']){
  const v={...structuredClone({preparation:f.preparation,groups:f.groups}),onVerified:f.onVerified};change(v);assert.throws(()=>captureNativeStageContinuationInput26(v),/original|group|source|shape/i);
 }
 let queried=0;const client={async query(){queried++;throw Error('MUST_NOT_QUERY');}};
 await assert.rejects(verifyCommittedNativeStagePrefix26(client,context,{...f,groups:[f.groups[0],f.groups[1],{...f.groups[2],members:f.groups[2].members.slice(1)}]}),/Full original/);
 const duplicate={...f,groups:[{...f.groups[0],members:[f.groups[0].members[0]!,...f.groups[0].members.slice(0,514)]},f.groups[1],f.groups[2]]} as NativeStageContinuationCapture26;
 await assert.rejects(verifyCommittedNativeStagePrefix26(client,context,duplicate),/Duplicate/);
 await assert.rejects(verifyCommittedNativeStagePrefix26(client,{...context,binding:{...context.binding,batchId:id(99)}},f),/Foreign batch/);assert.equal(queried,0);
 const reversed={...f.groups[0],members:[...f.groups[0].members].reverse()};assert.notEqual(nativeStageContinuationCommitments26([reversed,f.groups[1],f.groups[2]])[0]!.sha256,nativeStageContinuationCommitments26(f.groups)[0]!.sha256);
});
