import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,writeFile,rm,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openNativeProductAuthorizer } from './authorized-native-product-reader.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY,NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,NATIVE_PRODUCT_REFERENCE_DECISION_VERSION,prepareNativeProductImportChunk,nativeProductReferenceDecision } from '../../packages/application/src/native-product-import.ts';
// Fictional row values/native IDs; exact source locators identify the approved contract branch.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(rulePin='8'.repeat(64)) {
 const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==='PRODUCT').columns.map(c=>[c.name,'']));
 Object.assign(n,{'来源编号':'ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a','款号':'501XK5399665','商品名称':'SYNTHETIC approval contract row','分类路径':'SYNTHETIC ROOT','尺码组':'男装上衣尺码','状态':'正常'});
 const raw={...n,'尺码组':'男装裤子尺码'};
 return {batchId:id(1),fixedSourceNamespace:'SYNTHETIC_SIZE_OVERRIDE',selection:{entity:'PRODUCT',source:'BASE_V2',path:'business/01商品.csv',baseManifestSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),approvalSha256:'3'.repeat(64),csvSha256:'4'.repeat(64)},rows:[{
 source:{id:id(2),batchId:id(1),entityType:'PRODUCT',sourceKey:n['来源编号'],fileRef:'synthetic-original.xlsx',sheet:'01商品',rowNo:'739',sourceFileSha256:'652c21df52c56d362b11e48bcd1684a690a85a215ee2e2c6a390506d89c474bf',rowSha256:'5'.repeat(64),rawFields:raw,normalizedFields:n,fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'SYNTHETIC ORIGINAL CELL',raw:v}]))}},
 product:{sourceKey:n['来源编号'],nativeId:id(3),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET',nullableFieldPolicy:NATIVE_PRODUCT_NULLABLE_POLICY,
 sourceTransformation:{version:NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,field:'尺码组',mappingSha256:rulePin},
 references:{category:{sourceValue:n['分类路径'],mappingSha256:'6'.repeat(64),path:[{nativeId:id(4),name:'SYNTHETIC ROOT',expectedVersion:1}]},sizeGroup:{sourceValue:n['尺码组'],nativeId:id(5),code:'UPPER',name:n['尺码组'],mappingSha256:'6'.repeat(64)},season:null,supplier:null}}]};
}

const sha=x=>createHash('sha256').update(x).digest('hex');
async function privateFixture(t, mutateRules=()=>{}){
 const root=await mkdtemp(join(await realpath(tmpdir()),'native-size-override-synthetic-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const products=[['ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a','501XK5399665'],['53641e19-578b-5f6e-9000-0d3a8201a017','501XK5399666'],['dba12c5f-28ff-589c-88c8-dfb2c586f6ac','510XK5399661'],['4872df73-8997-583a-8f63-5468673c2b7c','510XK5399663']];
 const names=['165/S','170/M','175/L','180/XL','185/2XL','190/3XL'];const rules=Array.from({length:18},(_,i)=>({sourceSkuId:id(100+i),productSourceId:products[i%4][0],productCode:products[i%4][1],oldCurrentGroup:'男装裤子尺码',oldCurrentSizeName:String(30+i%6),newGroupId:'UPPER',newGroupName:'男装上衣尺码',newSizeCode:String(202+i%6),newSizeName:names[i%6],decisionSource:'SYNTHETIC approved mapping',scope:'ONLY_THESE_FOUR_PRODUCTS_CURRENT_PANTS_BRANCHES'}));mutateRules(rules);
 const rb=Buffer.from(JSON.stringify(rules)),mapping=Buffer.from('SYNTHETIC native reference mapping'),input=fixture(sha(rb));for(const r of Object.values(input.rows[0].references))if(r)r.mappingSha256=sha(mapping);
 const manifest={schemaVersion:1,validatorVersion:NATIVE_PRODUCT_REFERENCE_DECISION_VERSION,batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,selection:input.selection,mappingFiles:[{name:'catalogue',sha256:sha(mapping)},{name:'size_overrides',sha256:sha(rb)}],decisions:[nativeProductReferenceDecision(input.rows[0])]};const mb=Buffer.from(JSON.stringify(manifest));
 const mf=join(root,'manifest.json'),cf=join(root,'catalogue.json'),sf=join(root,'size-overrides.json');for(const [p,b]of[[mf,mb],[cf,mapping],[sf,rb]])await writeFile(p,b,{mode:0o600});let sourceCalls=0;
 return{input,prepared:prepareNativeProductImportChunk(input),sf,options:{sourceReader:{async authorize(c){sourceCalls++;assert.deepEqual(Object.keys(c.rows[0]).sort(),['blankPricePolicy','product','source']);assert.equal(c.rows[0].source.rawFields['尺码组'],'男装裤子尺码');}},referenceDecisionFile:mf,trustedReferenceDecisionSha256:sha(mb),mappingFiles:{catalogue:cf,size_overrides:sf}},sourceCalls:()=>sourceCalls};
}
test('size override needs separately pinned actual rule bytes and exact source authorization; changing bytes revokes before source/SQL',async t=>{
 const f=await privateFixture(t),a=await openNativeProductAuthorizer(f.options);t.after(()=>a.close());await a.authorize(f.prepared);assert.equal(f.sourceCalls(),1);
 await writeFile(f.sf,'[]');await assert.rejects(a.authorize(f.prepared),/FILE_CHANGED/);assert.equal(f.sourceCalls(),1);
});
test('a pinned rule file with an unapproved branch or missing product cannot authorize exact size override',async t=>{
 for(const mutate of [r=>{r[0].scope='ALL_PRODUCTS';},r=>{for(const x of r)if(x.productSourceId==='ce3871bc-1ddb-533a-a164-f4cd8bd3bf1a'){x.productSourceId='53641e19-578b-5f6e-9000-0d3a8201a017';x.productCode='501XK5399666';}}]){
  const f=await privateFixture(t,mutate);await assert.rejects(openNativeProductAuthorizer(f.options),/SIZE_OVERRIDE_RULE/);assert.equal(f.sourceCalls(),0);
 }
});
