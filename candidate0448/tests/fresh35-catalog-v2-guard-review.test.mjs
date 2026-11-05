import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as reviewApi from '../scripts/release/unified-install/fresh35-catalog-v2-guard-review.mjs';
import {loadFresh35EvidenceV2Analysis} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
import {buildFresh35V2SourceProjection} from '../scripts/release/unified-install/fresh35-retirement-v2-projection.mjs';
import {buildFresh35CatalogPostconditions,loadFresh35PostconditionEvidence} from '../scripts/release/unified-install/fresh35-catalog-postconditions.mjs';
import {loadReviewedFresh35EvidenceV2} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.env.FRESH35_V2_EVIDENCE_DIR;
const sourcePath='scripts/release/unified-install/fresh35-catalog-v2-guard-review.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
const mapping={owner:{source:'schema178v2_owner_20261105_r2',target:'fresh35_owner_v2_guard_review'},controller:{source:'schema178v2_controller_20261105_r2',target:'fresh35_controller_v2_guard_review'}};
const build=reviewApi.buildFresh35V2CatalogGuardReview;
let analysisPromise,resultPromise;
const analysis=()=>analysisPromise??=loadFresh35EvidenceV2Analysis(root,directory);
const result=()=>resultPromise??=analysis().then(value=>build(root,value,mapping));

test('guard review exposes one API and refuses fake analyses before reading attacker getters',async()=>{
 assert.deepEqual(Object.keys(reviewApi),['buildFresh35V2CatalogGuardReview']);
 const trap=new Proxy({},{get(){throw Error('CALLER_GETTER_TOUCHED');},ownKeys(){throw Error('CALLER_GETTER_TOUCHED');}});
 for(const fake of [undefined,null,{},trap,{analysisOnly:true,executionAuthorized:true}])await assert.rejects(()=>build(root,fake,mapping),/GENUINE_ANALYSIS_REQUIRED/);
});

test('full expected model exactly composes genuine current V2 metadata and core definitions',{skip:!directory},async()=>{
 const input=await analysis(),review=await result(),projection=await buildFresh35V2SourceProjection(root,input,mapping);
 assert.equal(review.state,'UNREVIEWED_BLOCKED_GUARD_SOURCE');
 assert.equal(review.modelSha256,hash(JSON.stringify(review.model)));
 assert.equal(review.modelSha256,'5617b3e43d5796e6e906c91720abf5d2071d99edb8926da0556bbf0f1853a264','scalar input hardening does not alter the valid expected model');
 assert.equal(review.guardReviewSqlSha256,'1c7b343153efa2d1746b3d7768670e0eeda4f9dfc19b8e25bc15375a210795c3','scalar input hardening does not alter the valid blocked SQL');
 for(const object of [mapping,mapping.owner,mapping.controller])assert.equal(Object.isFrozen(object),false,'valid caller mapping also remains mutable');
 for(const key of ['routines','constraints','indexes','triggers','relations','columnAcls','schema','tableNames','owner'])assert.deepEqual(review.model[key],projection.model[key],key);
 assert.deepEqual(review.model.tables,projection.metadata.tables);
 const relations=new Map(input.inventory.relations.map(row=>[row.relname,row]));
 const expectedColumns=projection.metadata.columns.map(column=>{
  const prior=input.inventory.columns.find(row=>String(row.attrelid)===String(relations.get(column.table).oid)&&row.attnum===column.ordinal);
  return {...without(column,['typeSql']),metadata:{...without(prior,['attrelid','atttypid','attcollation','attacl']),atthasmissing:false,attmissingval:null}};
 });
 assert.deepEqual(review.model.columns,expectedColumns);
 assert.deepEqual(review.model.sequences,projection.metadata.sequences.map(row=>without(row,['dataType','parameterResolution'])));
 assert.deepEqual(review.model.policies,projection.metadata.policies.map(row=>({...row,roles:[...row.roles].sort()})));
 assert.deepEqual(review.model.defaultAcls,[]);
 const counts={tables:35,columns:351,sequences:4,policies:32,routines:152,constraints:326,indexes:111,triggers:570,relations:150,columnAcls:351,rowtypes:70};
 for(const [key,count] of Object.entries(counts))assert.equal(review.model[key].length,count,key);
 assert.ok(review.model.columns.some(row=>row.arrayDimensions===1&&row.typeName==='uuid'));
 assert.ok(review.model.columns.some(row=>row.defaultExpression!==null));
 assert.ok(review.model.columns.some(row=>row.collation?.schema==='pg_catalog'&&row.collation.name==='C'));
 assert.ok(review.model.routines.every(row=>/^[0-9a-f]{64}$/.test(row.definitionSha256)&&row.bodySha256===undefined));
 for(const table of review.model.tables){
  assert.deepEqual(review.model.rowtypes.filter(row=>row.table===table.name),[
   {schema:'naijue_erp',name:table.name,owner:mapping.owner.target,acl:null,kind:'c',category:'C',table:table.name,element:null,array:'_'+table.name},
   {schema:'naijue_erp',name:'_'+table.name,owner:mapping.owner.target,acl:null,kind:'b',category:'A',table:table.name,element:table.name,array:null},
  ]);
 }
 assert.equal(review.model.compiledSchemaSha256,projection.unmappedSqlSha256);
 assert.equal(review.model.mappedSchemaSha256,projection.sqlSha256);
 assert.ok(Object.isFrozen(review)&&Object.isFrozen(review.model.columns[0].metadata));
 assert.throws(()=>{review.model.columns[0].metadata.attnotnull=false;},TypeError);
});

test('only returned SQL is one DO whose first statement unconditionally rejects before model assignment',{skip:!directory},async()=>{
 const review=await result(),sql=review.guardReviewSql;
 assert.equal(review.guardReviewSqlSha256,hash(sql));
 assert.match(sql,/^DO \$fresh35_v2_guard_review\$\nDECLARE model pg_catalog\.jsonb; routine_item pg_catalog\.jsonb; actual pg_catalog\.jsonb; expected pg_catalog\.jsonb;\nBEGIN\n RAISE EXCEPTION 'FRESH35_V2_GUARD_REVIEW_NOT_AUTHORIZED' USING ERRCODE='55000';\n model := /);
 assert.equal((sql.match(/DO \$fresh35_v2_guard_review\$/g)??[]).length,1);
 assert.ok(sql.endsWith('END $fresh35_v2_guard_review$;\n'));
 assert.equal(sql.split('$fresh35_v2_model$').length,3);
 assert.deepEqual(JSON.parse(sql.split('$fresh35_v2_model$')[1]),review.model);
 const code=sql.replace(/\$fresh35_v2_model\$[\s\S]*?\$fresh35_v2_model\$/,'NULL').replace(/'(?:''|[^'])*'/g,"''");
 assert.doesNotMatch(code,/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|INSERT|UPDATE|DELETE|COPY|EXECUTE|EXCEPTION\s+WHEN)\b/i);
 assert.doesNotMatch(code,/\bSET\b|\bSELECT\s+DISTINCT\b/i);
 assert.deepEqual([...sql.matchAll(/PERFORM pg_catalog\.set_config\(([^;]+)\);/g)].map(match=>match[1]),[
  "'search_path','pg_catalog',true","'quote_all_identifiers','off',true","'quote_all_identifiers','on',true",
 ]);
 assert.match(sql,/current_setting\('search_path'\)/);
 assert.match(sql,/current_setting\('quote_all_identifiers'\)/);
 for(const label of ['tables','columns','sequences','policies','rowtypes','relations','columnAcls','constraints','indexes','triggers','defaultAcls']){
  assert.ok(sql.includes("model->'"+label+"'"),label);
  assert.ok(sql.includes('FRESH35_V2_REVIEW_'+label.toUpperCase()+'_DIFFER'),label);
 }
 assert.match(sql,/pg_catalog\.pg_get_functiondef\(p\.oid\)/);
 assert.match(sql,/pg_catalog\.sha256\(pg_catalog\.convert_to/);
 assert.match(sql,/observed\.entry ORDER BY observed\.entry::pg_catalog\.text COLLATE pg_catalog\."C"/);
 assert.doesNotMatch(sql,/observed\.item|DECLARE[^\n]*\bitem jsonb/);
 for(const key of ['sql','comparisonSql','installSql','postconditionSql','unmappedSql','projection','disableBarrier','allowExecution'])assert.equal(review[key],undefined,key);
});

test('all source and evidence bindings remain distinct, explicit and current',{skip:!directory},async()=>{
 const input=await analysis(),review=await result();
 assert.equal(review.captureSourceBindingSha256,input.sourceBinding.sha256);
 assert.equal(review.captureSourcePins.length,177);
 assert.deepEqual(review.captureSourcePins,input.sourceBinding.sourcePins);
 assert.equal(review.sourcePins.length,180);
 assert.equal(new Set(review.sourcePins.map(pin=>pin.path)).size,180);
 for(const name of ['fresh35-catalog-evidence-v2-adapter.mjs','fresh35-retirement-v2-projection.mjs','fresh35-catalog-v2-guard-review.mjs'])assert.ok(review.sourcePins.some(pin=>pin.path.endsWith(name)),name);
 assert.equal(review.guardReviewSourceSetSha256,hash(JSON.stringify(review.sourcePins)));
 assert.equal(review.guardReviewSourcePin.path,sourcePath);
 assert.equal(review.guardReviewSourcePin.sha256,hash(await readFile(resolve(root,sourcePath))));
 for(const pin of review.sourcePins)assert.equal(pin.sha256,hash(await readFile(resolve(root,pin.path))),pin.path);
 assert.deepEqual(review.artifactPins,input.artifactPins);
 assert.deepEqual(review.evidencePins,input.evidencePins);
 assert.equal(review.inputEvidenceSha256Sums,'700f43affb2bdb035b4f50dab9613613db9498eec67bf2ab5d81e6f0f723d3e5');
 assert.equal(review.inputManifestSha256,input.consistency.manifestSha256);
 assert.equal(review.guardReviewCodeRanDuringCapture,false);
});

test('rowtype model excludes retired tables and arrays and preserves both directions exactly',{skip:!directory},async()=>{
 const review=await result(),input=await analysis(),projection=await buildFresh35V2SourceProjection(root,input,mapping);
 assert.equal(review.model.rowtypeEvidence,'DERIVED_FROM_TABLE_DECLARATIONS');
 assert.ok(review.model.missingEvidence.includes('RAW_PG_TYPE_ROWS_AND_UNMODELED_TYPE_PROPERTIES'));
 const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
 const expected=sorted(review.model.rowtypes);
 for(const table of projection.omittedTables){
  assert.ok(!review.model.rowtypes.some(row=>row.name===table||row.name==='_'+table));
  assert.notDeepEqual(sorted([...review.model.rowtypes,{...review.model.rowtypes[0],name:table,table}]),expected);
  assert.notDeepEqual(sorted([...review.model.rowtypes,{...review.model.rowtypes[1],name:'_'+table,table,element:table}]),expected);
 }
 for(const field of ['name','table','element','array','owner','acl','kind','category']){
  const changed=structuredClone(review.model.rowtypes);changed[0][field]='wrong_'+field;
  assert.notDeepEqual(sorted(changed),expected,field);
 }
 for(const pattern of [/r\.reltype=t\.oid/,/e\.typarray=t\.oid/,/at\.typelem=t\.oid/,/er\.reltype=e\.oid/,/e\.typnamespace=t\.typnamespace/,/at\.typnamespace=t\.typnamespace/])assert.match(review.guardReviewSql,pattern);
 assert.match(review.guardReviewSql,/t\.typtype='c' AND t\.typelem=0/);
 assert.match(review.guardReviewSql,/t\.typcategory='A' AND t\.typrelid=0/);
 assert.match(review.guardReviewSql,/WHEN t\.typelem=0 THEN NULL WHEN e\.oid IS NOT NULL THEN e\.typname ELSE '<UNRESOLVED>'/);
 assert.match(review.guardReviewSql,/WHEN t\.typarray=0 THEN NULL WHEN at\.oid IS NOT NULL THEN at\.typname ELSE '<UNRESOLVED>'/);
 assert.notDeepEqual(sorted([...review.model.rowtypes,review.model.rowtypes[0]]),expected,'duplicate row is not silently deduplicated');
});

test('caller models, mappings and bypass options cannot change the review contract',{skip:!directory},async()=>{
 const input=await analysis();
 await assert.rejects(()=>build(root,structuredClone(input),mapping),/GENUINE_ANALYSIS_REQUIRED/);
 await assert.rejects(()=>build(root,input,mapping,{skipBarrier:true}),/EXACT_ARGUMENTS_REQUIRED/);
 await assert.rejects(()=>build(root,input,{...mapping,extra:true}),/IDENTITY_MAPPING/);
 await assert.rejects(()=>build(root,input,{owner:{...mapping.owner,source:'wrong_owner'},controller:mapping.controller}),/SOURCE_IDENTITY_DIFFERS/);
 await assert.rejects(()=>build(root,input,{owner:{...mapping.owner,target:'erp_unified27_importer_2393dbc6db9581c2'},controller:mapping.controller}),/IDENTITY_MAPPING/);
 const getterMapping={owner:{...mapping.owner},controller:{...mapping.controller}};
 Object.defineProperty(getterMapping.owner,'target',{enumerable:true,get(){throw Error('CALLER_MAPPING_GETTER_TOUCHED');}});
 await assert.rejects(()=>build(root,input,getterMapping),/IDENTITY_MAPPING_DATA_REQUIRED/);
 const other=await build(root,input,{owner:{...mapping.owner,target:'fresh35_owner_v2_other_review'},controller:{...mapping.controller,target:'fresh35_controller_v2_other_review'}});
 assert.notEqual(other.modelSha256,(await result()).modelSha256);
 assert.notEqual(other.guardReviewSqlSha256,(await result()).guardReviewSqlSha256);
});

test('nested scalar getters are never evaluated and caller mappings remain mutable',{skip:!directory},async()=>{
 const input=await analysis();
 for(const kind of ['owner','controller'])for(const field of ['source','target']){
  let reads=0;
  const nested={get maliciousNestedGetter(){reads++;throw Error('CALLER_ACCESSOR_EXECUTED');}};
  const caller={owner:{...mapping.owner},controller:{...mapping.controller}};
  caller[kind][field]=nested;
  let failure;try{await build(root,input,caller);}catch(error){failure=error;}
  assert.equal(reads,0,kind+'.'+field+' must reject before nested getter evaluation: '+failure?.message);
  assert.match(failure?.message??'',/IDENTITY_MAPPING_DATA_REQUIRED/);
  for(const object of [caller,caller.owner,caller.controller,nested])assert.equal(Object.isFrozen(object),false);
 }
});

test('invalid mapping scalar objects are rejected without freezing any caller object',{skip:!directory},async()=>{
 const input=await analysis();
 for(const kind of ['owner','controller'])for(const field of ['source','target']){
  const nested={mutable:true};
  const caller={owner:{...mapping.owner},controller:{...mapping.controller}};
  caller[kind][field]=nested;
  let failure;try{await build(root,input,caller);}catch(error){failure=error;}
  for(const object of [caller,caller.owner,caller.controller,nested])assert.equal(Object.isFrozen(object),false,kind+'.'+field+' must not freeze caller objects');
  assert.match(failure?.message??'',/IDENTITY_MAPPING_DATA_REQUIRED/);
  nested.mutable=false;
 }
});

test('own renderer, projection and original capture source drift are refused without changing live sources',{skip:!directory},async()=>{
 const input=await analysis(),review=await result(),fixture=await mkdtemp(resolve(tmpdir(),'fresh35-v2-guard-review-'));
 try{
  for(const pin of review.sourcePins){const path=resolve(fixture,pin.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(resolve(root,pin.path)));}
  const cloneAnalysis=await loadFresh35EvidenceV2Analysis(fixture,directory);
  for(const path of [sourcePath,'scripts/release/unified-install/fresh35-retirement-v2-projection.mjs',input.sourceBinding.sourcePins[0].path]){
   const original=await readFile(resolve(fixture,path));await writeFile(resolve(fixture,path),Buffer.concat([original,Buffer.from('\n// isolated source drift test\n')]));
   await assert.rejects(()=>build(fixture,cloneAnalysis,mapping),/SOURCE.*DIFFER|SOURCE.*CHANGED|MISMATCH/,path);
   await writeFile(resolve(fixture,path),original);
  }
 }finally{await rm(fixture,{recursive:true,force:true});}
});

test('all approval flags stay false and reviewed V1/V2 gates continue to refuse these bytes',{skip:!directory},async()=>{
 const input=await analysis(),review=await result();
 assert.equal(review.analysisOnly,true);
 for(const key of ['reviewedEvidenceRegistered','independentSafetyReviewComplete','executionProvenanceAuthenticated','catalogMetadataComplete','engineDependenciesVerified','engineVerified','executionAuthorized','installationReady','targetAdmitted','hostEnabled','existingTargetMutation','existingDataMigrationSupported','oldTablesRemoved','sqlParsedByPostgres','sqlExecutedByPostgres'])assert.equal(review[key],false,key);
 for(const candidate of [input,review,review.model])assert.throws(()=>buildFresh35CatalogPostconditions(candidate,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
 await assert.rejects(()=>loadFresh35PostconditionEvidence(directory),/POSTCONDITION_EVIDENCE_CHANGED/);
 assert.throws(()=>loadReviewedFresh35EvidenceV2(review),/REVIEWED_PROFILE_NOT_REGISTERED/);
 const text=await readFile(resolve(root,sourcePath),'utf8');
 assert.doesNotMatch(text,/from ['"](?:pg|node:(?:child_process|net|http|https|tls|dgram))['"]|\beval\s*\(|new Function\b|buildFresh35CatalogPostconditions|loadFresh35PostconditionEvidence/);
 assert.equal((text.match(/await checkPins\(root,sourcePins\);/g)??[]).length,2,'all 180 source pins are checked before rendering and before returning');
 assert.match(text,/await assertFresh35EvidenceV2AnalysisCurrent\(analysis\);\n await checkPins\(root,sourcePins\);\n return freeze/);
});
