import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,writeFile,rm,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openNativeProductAuthorizer, openNativeProductAuthorizer26 } from './authorized-native-product-reader.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { NATIVE_PRODUCT_NULLABLE_POLICY,NATIVE_PRODUCT_SIZE_GROUP_OVERRIDE_VERSION,NATIVE_PRODUCT_REFERENCE_DECISION_VERSION,prepareNativeProductImportChunk,nativeProductReferenceDecision,NATIVE_PRODUCT_IMPORT_VERSION_26,NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26,prepareNativeProductImportChunk26,nativeProductReferenceDecision26 } from '../../packages/application/src/native-product-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
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

async function successorFixture(t,multiple=false){
 const f=await privateFixture(t),root=join(f.sf,'..'),input={...f.input,schemaProfile:'EXACT26',validatorVersion:NATIVE_PRODUCT_IMPORT_VERSION_26};
 const sourceBytes=Buffer.from('SYNTHETIC season conversion'),partiesBytes=Buffer.from('SYNTHETIC parties mapping');
 input.rows[0].seasonSelection={version:'NATIVE_PRODUCT_SEASON_SELECTION_V1',mapping_sha256:sha(sourceBytes),source_key:input.rows[0].source.sourceKey,source_season:'',state:'UNKNOWN',season_ids:null,references:[]};
 if(multiple){const row=input.rows[0];row.source.rawFields['季节']=row.source.normalizedFields['季节']='春、夏';row.source.fieldProvenance.fields['季节'].raw='春、夏';
  row.seasonSelection={...row.seasonSelection,source_season:'春、夏',state:'KNOWN',season_ids:[id(6),id(7)],references:[['春','SEASON_SPRING'],['夏','SEASON_SUMMER']].map(([name,code],i)=>({sourceKey:name,nativeId:id(6+i),nativeSnapshot:{id:id(6+i),code,name,display_order:i}}))};
  row.legacyScalarCreation={state:'LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION',value:null,appliesOnlyTo:'FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE',originalSeason:'春、夏'};
 }
 const prepared=prepareNativeProductImportChunk26(input),cataloguePin=input.rows[0].references.category.mappingSha256;
 const derived={version:'NATIVE_PRODUCT_SEASON_SELECTION_DERIVED_CANDIDATE_V1',batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,selectionSha256:input.selection.selectionSha256,
  sourceMappingSha256:sha(sourceBytes),dictionaryMappingSha256:cataloguePin,rows:input.rows.map(r=>({sourceKey:r.source.sourceKey,nativeProductId:r.product.nativeId,sourceEvidenceHash:requestHash(r.source),seasonSelection:r.seasonSelection,derivedProofSha256:requestHash(r.seasonSelection),...(r.legacyScalarCreation?{legacyScalarCreation:r.legacyScalarCreation}:{})}))};
 const derivedBytes=Buffer.from(JSON.stringify(derived)),paths={...f.options.mappingFiles,parties:join(root,'parties.json'),season_source:join(root,'season-source.json'),derived_season_proofs:join(root,'derived.json')};
 for(const[p,b]of[[paths.parties,partiesBytes],[paths.season_source,sourceBytes],[paths.derived_season_proofs,derivedBytes]])await writeFile(p,b);
 const manifest={schemaVersion:2,validatorVersion:NATIVE_PRODUCT_REFERENCE_DECISION_VERSION_26,schemaProfile:'EXACT26',batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,selection:input.selection,
  mappingFiles:[{name:'catalogue',sha256:cataloguePin},{name:'parties',sha256:sha(partiesBytes)},{name:'size_overrides',sha256:input.rows[0].sourceTransformation.mappingSha256},{name:'season_source',sha256:sha(sourceBytes)},{name:'derived_season_proofs',sha256:sha(derivedBytes)}],decisions:input.rows.map(nativeProductReferenceDecision26)};
 const manifestFile=join(root,'manifest26.json'),reviewFile=join(root,'review26.json');
 const review={version:'C_NATIVE_PRODUCT_REFERENCE26_REVIEW_V1',decision:'ACCEPT_EXACT_MANIFEST_REFERENCE_BINDINGS',binding:{batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,selectionSha256:input.selection.selectionSha256},
  manifest:{sha256:'',bytes:0,products:1,validatorVersion:manifest.validatorVersion,schemaProfile:'EXACT26'},scope:'FULL_REFERENCE_DECISIONS_ONLY',independentReview:{path:'SYNTHETIC-review.json',sha256:'a'.repeat(64),result:'PASS'},realImportExecutionAuthorized:false};
 let sourceCalls=0,sourceAction=async()=>undefined;
 const options={sourceReader:{async authorize(c){sourceCalls++;assert.deepEqual(Object.keys(c.rows[0]).sort(),['blankPricePolicy','product','source']);assert.equal(c.rows[0].source.rawFields['尺码组'],'男装裤子尺码');return sourceAction(c);}},referenceDecisionFile:manifestFile,trustedReferenceDecisionSha256:'',mappingFiles:paths,reviewFile,trustedReviewSha256:''};
 async function save(){const mb=Buffer.from(JSON.stringify(manifest));await writeFile(manifestFile,mb);options.trustedReferenceDecisionSha256=review.manifest.sha256=sha(mb);review.manifest.bytes=mb.length;
  const rb=Buffer.from(JSON.stringify(review));await writeFile(reviewFile,rb);options.trustedReviewSha256=sha(rb);}
 await save();return {prepared,input,options,review,manifest,save,paths,sourceCalls:()=>sourceCalls,setSourceAction(fn){sourceAction=fn;}};
}
test('product26 authorizer requires a separate exact full-reference grant and source authorization; old authorizer remains closed',async t=>{
 const f=await successorFixture(t);await assert.rejects(openNativeProductAuthorizer26({...f.options,trustedReviewSha256:undefined}),/OUTSIDE_PIN/);
 f.review.decision='ACCEPT_EXACT_QB49_SCOPED_CANDIDATES';await f.save();await assert.rejects(openNativeProductAuthorizer26(f.options),/FULL_REFERENCE_REVIEW/);
 f.review.decision='ACCEPT_EXACT_MANIFEST_REFERENCE_BINDINGS';f.review.realImportExecutionAuthorized=true;await f.save();await assert.rejects(openNativeProductAuthorizer26(f.options),/FULL_REFERENCE_REVIEW/);
 f.review.realImportExecutionAuthorized=false;await f.save();const reader=await openNativeProductAuthorizer26(f.options);t.after(()=>reader.close());
 await reader.authorize(f.prepared);assert.equal(f.sourceCalls(),1);assert.equal(reader.report.importReady,false);assert.equal(reader.report.decisions,1);
 await assert.rejects(openNativeProductAuthorizer(f.options),/AUTH_MANIFEST/);reader.close();await assert.rejects(reader.authorize(f.prepared),/CLOSED/);
});
test('product26 authorizer captures config, rejects getters, file changes, false source grants and input mutation',async t=>{
 const f=await successorFixture(t);let called=0;const bad={...f.options};Object.defineProperty(bad,'reviewFile',{enumerable:true,get(){called++;return f.options.reviewFile;}});
 await assert.rejects(openNativeProductAuthorizer26(bad),/OPTIONS/);assert.equal(called,0);
 const reader=await openNativeProductAuthorizer26(f.options);t.after(()=>reader.close());f.options.mappingFiles.catalogue='/no-longer-captured';await reader.authorize(f.prepared);
 f.setSourceAction(async()=>true);await assert.rejects(reader.authorize(f.prepared),/SOURCE_AUTHORIZATION/);
 f.setSourceAction(async c=>{c.rows[0].source.normalizedFields['商品名称']='CHANGED PROJECTION';});await assert.rejects(reader.authorize(f.prepared),/SOURCE_PROJECTION_CHANGED/);
 const mutable=structuredClone(f.prepared);f.setSourceAction(async()=>{mutable.nativeProducts[0].name='CHANGED';});await assert.rejects(reader.authorize(mutable),/INPUT_CHANGED/);
 f.setSourceAction(async()=>undefined);await writeFile(f.paths.derived_season_proofs,'{}');const before=f.sourceCalls();await assert.rejects(reader.authorize(f.prepared),/FILE_CHANGED/);assert.equal(f.sourceCalls(),before);
});
test('product26 authorizer rejects a substituted reference, wrong season mapping and incomplete independent review count',async t=>{
 const f=await successorFixture(t),reader=await openNativeProductAuthorizer26(f.options);t.after(()=>reader.close());
 const altered=structuredClone(f.input);altered.rows[0].references.category.path[0].nativeId=id(999);
 await assert.rejects(reader.authorize(prepareNativeProductImportChunk26(altered)),/REFERENCE_DECISION_MISMATCH/);assert.equal(f.sourceCalls(),0);
 f.review.manifest.products=2;await f.save();await assert.rejects(openNativeProductAuthorizer26(f.options),/MANIFEST/);
 f.review.manifest.products=1;f.manifest.decisions[0].seasonSelection.mapping_sha256='0'.repeat(64);const{decisionSha256,...body}=f.manifest.decisions[0];f.manifest.decisions[0].decisionSha256=requestHash({validatorVersion:f.manifest.validatorVersion,...body});await f.save();
 await assert.rejects(openNativeProductAuthorizer26(f.options),/MAPPING_DIGEST/);
});
test('product26 authorizer binds complete multi-season proof and fresh legacy scalar nonapplicability without choosing a first member',async t=>{
 const f=await successorFixture(t,true),reader=await openNativeProductAuthorizer26(f.options);t.after(()=>reader.close());await reader.authorize(f.prepared);
 assert.equal(f.prepared.nativeProducts[0].season_id,null);assert.deepEqual(f.prepared.nativeProducts[0].season_ids,[id(6),id(7)]);
 assert.equal(f.prepared.rows[0].source.rawFields['季节'],'春、夏');assert.equal(f.sourceCalls(),1);
 f.manifest.decisions[0].legacyScalarCreation.originalSeason='秋、冬';const{decisionSha256,...body}=f.manifest.decisions[0];f.manifest.decisions[0].decisionSha256=requestHash({validatorVersion:f.manifest.validatorVersion,...body});await f.save();
 await assert.rejects(openNativeProductAuthorizer26(f.options),/SEASON_BINDING/);
});
