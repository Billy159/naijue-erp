import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY,NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,prepareNativeProductImportChunk,nativeProductImportEvidence,nativeProductReferenceDecision,validatePreparedNativeProductImportChunk } from '../packages/application/src/native-product-import.ts';
import type { NativeProductImportChunk } from '../packages/application/src/native-product-import.ts';
import { NATIVE_PRODUCT_IMPORT_VERSION_26,prepareNativeProductImportChunk26,validatePreparedNativeProductImportChunk26,nativeProductImportEvidence26,nativeProductReferenceDecision26 } from '../packages/application/src/native-product-import.ts';
import type { NativeProductImportChunk26,NativeProductSeasonSelection } from '../packages/application/src/native-product-import.ts';
// Fictional row values/native IDs; exact source locators identify the approved contract branch.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(rulePin='8'.repeat(64)): NativeProductImportChunk {
 const n: Record<string,string>=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT')!.columns.map(c=>[c.name,'']));
 Object.assign(n,{'来源编号':'ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a','款号':'501XK5399665','商品名称':'SYNTHETIC approval contract row','分类路径':'SYNTHETIC ROOT','尺码组':'男装上衣尺码','状态':'正常'});
 const raw={...n,'尺码组':'男装裤子尺码'};
 return {batchId:id(1),fixedSourceNamespace:'SYNTHETIC_SIZE_OVERRIDE',selection:{entity:'PRODUCT',source:'BASE_V2',path:'business/01商品.csv',baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),csvSha256:'4'.repeat(64)},rows:[{
 source:{id:id(2),batchId:id(1),entityType:'PRODUCT',sourceKey:n['来源编号']!,fileRef:'synthetic-original.xlsx',sheet:'01商品',rowNo:'739',sourceFileSha256:'652c21df52c56d362b11e48bcd1684a690a85a215ee2e2c6a390506d89c474bf',rowSha256:'5'.repeat(64),rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC ORIGINAL CELL',raw:v}]))}},
 product:{sourceKey:n['来源编号']!,nativeId:id(3),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET',nullableFieldPolicy:NATIVE_PRODUCT_NULLABLE_POLICY,
 sourceTransformation:{version:NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,field:'尺码组',mappingSha256:rulePin},
 references:{category:{sourceValue:n['分类路径']!,mappingSha256:'6'.repeat(64),path:[{nativeId:id(4),name:'SYNTHETIC ROOT',expectedVersion:1}]},sizeGroup:{sourceValue:n['尺码组']!,nativeId:id(5),code:'UPPER',name:n['尺码组']!,mappingSha256:'6'.repeat(64)},season:null,supplier:null}}]};
}

test('approved exact size-group proof changes only normalized target and is bound into reference decision/evidence',()=>{
 const input=fixture(),before=structuredClone(input.rows[0]!.source),p=prepareNativeProductImportChunk(input);validatePreparedNativeProductImportChunk(p);
 assert.equal(p.nativeProducts[0]!.size_group_id,id(5));assert.deepEqual(p.rows[0]!.source,before);
 assert.deepEqual(nativeProductReferenceDecision(p.rows[0]!).sourceTransformation,input.rows[0]!.sourceTransformation);
 const proof=nativeProductImportEvidence(p,0);assert.equal(proof.source.raw_fields['尺码组'],'男装裤子尺码');assert.equal(proof.source.normalized_fields['尺码组'],'男装上衣尺码');
 assert.deepEqual(proof.fields.native_product_import.source_transformation,input.rows[0]!.sourceTransformation);
});
test('size override cannot cover unrelated row field file or arbitrary truthy approval; absence preserves old refusal',()=>{
 for(const mutate of [(x:any)=>{delete x.rows[0]!.sourceTransformation;},(x:any)=>{x.rows[0]!.source.rowNo='738';},(x:any)=>{x.rows[0]!.source.sourceFileSha256='0'.repeat(64);},(x:any)=>{x.rows[0]!.source.normalizedFields['厚薄']='SYNTHETIC unauthorized correction';},(x:any)=>{x.rows[0]!.sourceTransformation.approved=true;},(x:any)=>{x.rows[0]!.sourceTransformation.mappingSha256='';}]){
   const x=fixture();mutate(x);assert.throws(()=>prepareNativeProductImportChunk(x),/size|approved|source|field/i);
 }
});

function seasonFixture(rawSeason: ''|'春'|'春、夏'): NativeProductImportChunk26 {
 const original=fixture(),r=structuredClone(original.rows[0]!);
 r.source.rawFields['季节']=rawSeason;r.source.normalizedFields['季节']=rawSeason;
 (r.source.fieldProvenance.fields as Record<string,unknown>)['季节']={origin:'ORIGINAL',reason:'SYNTHETIC ORIGINAL CELL',raw:rawSeason};
 const spring={sourceKey:'春',nativeId:id(61),nativeSnapshot:{id:id(61),code:'SEASON_SPRING',name:'春',display_order:0}},summer={sourceKey:'夏',nativeId:id(60),nativeSnapshot:{id:id(60),code:'SEASON_SUMMER',name:'夏',display_order:1}};
 const selected=rawSeason===''?[]:rawSeason==='春'?[spring]:[summer,spring];
 const references={...r.references,season:rawSeason==='春'?{sourceValue:'春',nativeId:id(61),code:'SEASON_SPRING',name:'春',mappingSha256:'6'.repeat(64)}:null};
 const seasonSelection:NativeProductSeasonSelection={version:'NATIVE_PRODUCT_SEASON_SELECTION_V1',mapping_sha256:'7'.repeat(64),source_key:r.source.sourceKey,source_season:rawSeason,
  state:rawSeason===''?'UNKNOWN':'KNOWN',season_ids:rawSeason===''?null:selected.map(x=>x.nativeId),references:selected};
 return {...original,schemaProfile:'EXACT26',validatorVersion:NATIVE_PRODUCT_IMPORT_VERSION_26,rows:[{...r,references,seasonSelection,
  ...(rawSeason==='春、夏'?{legacyScalarCreation:{state:'LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION' as const,value:null,appliesOnlyTo:'FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE' as const,originalSeason:rawSeason}}:{})}]};
}
test('product26 preparation preserves unknown single and multiple originals and emits whole current snapshots',()=>{
 for(const raw of ['','春','春、夏'] as const){const input=seasonFixture(raw),before=structuredClone(input.rows[0]!.source),p=prepareNativeProductImportChunk26(input);validatePreparedNativeProductImportChunk26(p);
  const native=p.nativeProducts[0]!;assert.deepEqual(p.rows[0]!.source,before);assert.equal(native.deleted_at,null);assert.equal(native.default_barcode_scheme_id,null);
  assert.deepEqual(native.season_ids,raw===''?null:raw==='春'?[id(61)]:[id(60),id(61)]);assert.equal(native.season_id,raw==='春'?id(61):null);
  const evidence=nativeProductImportEvidence26(p,0),proof=evidence.fields.native_product_import;
  assert.equal(proof.validator_version,NATIVE_PRODUCT_IMPORT_VERSION_26);assert.deepEqual(proof.native_product,native);
  assert.deepEqual(proof.season_selection,input.rows[0]!.seasonSelection);assert.equal(evidence.source.raw_fields['季节'],raw);
  assert.equal(proof.reference_decision_sha256,nativeProductReferenceDecision26(input.rows[0]!).decisionSha256);
  assert.throws(()=>prepareNativeProductImportChunk(input),/Successor season evidence/);
  assert.throws(()=>validatePreparedNativeProductImportChunk(p),/Successor season evidence/);
 }
});
test('product26 rejects fake empty unknown duplicate or reordered members and guessed legacy scalar',()=>{
 const changes:Array<(x:any)=>void>=[x=>x.schemaProfile='EXACT19',x=>x.rows[0].seasonSelection.season_ids.reverse(),
  x=>x.rows[0].seasonSelection.references.reverse(),x=>x.rows[0].seasonSelection.season_ids[1]=x.rows[0].seasonSelection.season_ids[0],
  x=>delete x.rows[0].legacyScalarCreation,x=>x.rows[0].legacyScalarCreation.originalSeason='秋、冬',
  x=>x.rows[0].references.season={sourceValue:'春、夏',nativeId:id(60),code:'SEASON_SUMMER',name:'夏',mappingSha256:'6'.repeat(64)},
  x=>x.rows[0].seasonSelection.references[0].nativeSnapshot.name='秋',x=>x.rows[0].seasonSelection.source_season='春',
  x=>x.rows[0].source.normalizedFields['季节']='春',x=>x.rows[0].seasonSelection.approved=true];
 for(const change of changes){const input=seasonFixture('春、夏');change(input);assert.throws(()=>prepareNativeProductImportChunk26(input));}
 const empty:any=seasonFixture('');empty.rows[0].seasonSelection.season_ids=[];assert.throws(()=>prepareNativeProductImportChunk26(empty),/blank remains unknown/);
 const p=structuredClone(prepareNativeProductImportChunk26(seasonFixture('春、夏'))) as any;p.nativeProducts[0].season_id=id(60);assert.throws(()=>validatePreparedNativeProductImportChunk26(p),/Prepared successor product changed/);
});
test('product26 binds new proof into fingerprints while original V1 preparation remains isolated',()=>{
 const v1=prepareNativeProductImportChunk(fixture());validatePreparedNativeProductImportChunk(v1);
 const input=seasonFixture('春、夏'),p=prepareNativeProductImportChunk26(input),changed=structuredClone(input) as any;
 changed.rows[0].seasonSelection.mapping_sha256='9'.repeat(64);const other=prepareNativeProductImportChunk26(changed);
 assert.notEqual(p.fingerprint,other.fingerprint);assert.notEqual(nativeProductReferenceDecision26(p.rows[0]!).decisionSha256,nativeProductReferenceDecision26(other.rows[0]!).decisionSha256);
 assert.throws(()=>nativeProductImportEvidence26(p,1));
 let calls=0;const getter:any=seasonFixture('');Object.defineProperty(getter.rows[0].seasonSelection,'state',{enumerable:true,get(){calls++;return'UNKNOWN';}});
 assert.throws(()=>prepareNativeProductImportChunk26(getter));assert.equal(calls,0);
});
