import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY,NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,prepareNativeProductImportChunk,nativeProductImportEvidence,nativeProductReferenceDecision,validatePreparedNativeProductImportChunk } from '../packages/application/src/native-product-import.ts';
import type { NativeProductImportChunk } from '../packages/application/src/native-product-import.ts';
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
