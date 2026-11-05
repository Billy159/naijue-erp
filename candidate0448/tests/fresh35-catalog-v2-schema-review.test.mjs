import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFresh35EvidenceV2Analysis} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
import {buildFresh35V2SourceProjection} from '../scripts/release/unified-install/fresh35-retirement-v2-projection.mjs';
import {prepareFresh35V2SchemaReview,compareFresh35V2SchemaReview} from '../scripts/release/unified-install/fresh35-catalog-v2-schema-review.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.env.FRESH35_V2_EVIDENCE_DIR;
const hash=value=>createHash('sha256').update(value).digest('hex');
let prepared;
async function fixture(){
 return prepared??= (async()=>{
  const analysis=await loadFresh35EvidenceV2Analysis(root,directory);
  const mapping={owner:{source:analysis.sourceTarget.target.owner,target:'fresh35_owner_v2_schema_review'},controller:{source:analysis.modelEvidence.sourceTarget.target.controller,target:'fresh35_controller_v2_schema_review'}};
  const projection=await buildFresh35V2SourceProjection(root,analysis,mapping);
  const review=await prepareFresh35V2SchemaReview(root,analysis,mapping);
  return {analysis,mapping,projection,review};
 })();
}
test('V2 schema comparison never accepts caller-created review capabilities',async()=>{
 await assert.rejects(()=>prepareFresh35V2SchemaReview(root,{reviewed:true},{}),/GENUINE_ANALYSIS_REQUIRED/);
 await assert.rejects(()=>compareFresh35V2SchemaReview({schemaTextMatches:true},''),/GENUINE_SCHEMA_REVIEW_REQUIRED/);
});
test('real V2 source can compare with itself without becoming an observed or admitted target',{skip:!directory},async()=>{
 const {review,projection}=await fixture();const result=await compareFresh35V2SchemaReview(review,projection.sql);
 assert.equal(result.schemaTextMatches,true);assert.equal(result.expectedSchemaSha256,projection.sqlSha256);assert.equal(result.suppliedDumpSha256,projection.sqlSha256);
 assert.equal(result.statementOrMemberCount,1506);assert.equal(review.sourcePins.length,180);
 assert.equal(review.schemaReviewSourceSetSha256,hash(JSON.stringify(review.sourcePins)));
 for(const pin of review.sourcePins)assert.equal(hash(await readFile(join(root,pin.path))),pin.sha256,pin.path);
 for(const field of ['observationOriginAuthenticated','physicalTargetVerified','roleMembershipsVerified','engineDependenciesVerified','engineVerified','independentSafetyReviewComplete','reviewedEvidenceRegistered','executionAuthorized','installationReady','targetAdmitted','hostEnabled','businessImportVerified'])assert.equal(result[field],false,field);
 assert.ok(Object.isFrozen(review)&&Object.isFrozen(review.sourcePins)&&Object.isFrozen(result));
 await assert.rejects(()=>compareFresh35V2SchemaReview(structuredClone(review),projection.sql),/GENUINE_SCHEMA_REVIEW_REQUIRED/);
});
test('complete real V2 dump comparison rejects source body, function metadata, ACL, object and sequence drift',{skip:!directory},async()=>{
 const {review,projection}=await fixture();const sql=projection.sql;
 const variants=[
  ['body',sql.replace('BEGIN','BEGIN\n -- semantic body bytes changed')],
  ['security',sql.replace('SECURITY DEFINER','SECURITY INVOKER')],
  ['search path',sql.replace('SET "search_path" TO','SET "search_path_changed" TO')],
  ['owner',sql.replace('OWNER TO "fresh35_owner_v2_schema_review"','OWNER TO "other_owner"')],
  ['ACL',sql+'\nGRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA naijue_erp TO PUBLIC;\n'],
  ['old table',sql+'\nCREATE TABLE naijue_erp.import_source_row(id uuid);\n'],
  ['sequence',sql.replace('CACHE 1;','CACHE 2;')],
 ];
 for(const [label,altered] of variants){assert.notEqual(altered,sql,'fixture anchor: '+label);await assert.rejects(()=>compareFresh35V2SchemaReview(review,altered),/FULL_SCHEMA_METADATA_DIFFERS/,label);}
 await assert.rejects(()=>compareFresh35V2SchemaReview(review,sql.replace('-- PostgreSQL database dump complete','-- incomplete')),/COMPLETE_DUMP_REQUIRED/);
 await assert.rejects(()=>compareFresh35V2SchemaReview(review,sql+'\n\\connect other\n'),/PSQL/);
});
test('only canonicalizer-approved comments and dump framing may differ',{skip:!directory},async()=>{
 const {review,projection}=await fixture();const changed=projection.sql+'\n-- ordinary outer review comment\n';
 const result=await compareFresh35V2SchemaReview(review,changed);assert.equal(result.schemaTextMatches,true);assert.notEqual(result.suppliedDumpSha256,result.expectedSchemaSha256);
});
test('identity mappings are snapshotted data and never invoke caller accessors',{skip:!directory},async()=>{
 const {analysis,mapping}=await fixture();let reads=0;
 const nested={owner:{source:mapping.owner.source,get target(){reads++;return mapping.owner.target;}},controller:mapping.controller};
 await assert.rejects(()=>prepareFresh35V2SchemaReview(root,analysis,nested),/MAPPING_DATA_PROPERTIES/);assert.equal(reads,0);
 const top={get owner(){reads++;return mapping.owner;},controller:mapping.controller};
 await assert.rejects(()=>prepareFresh35V2SchemaReview(root,analysis,top),/MAPPING_DATA_PROPERTIES/);assert.equal(reads,0);
});
test('invalid mapping leaves are rejected without walking or freezing caller objects',{skip:!directory},async()=>{
 const {analysis,mapping}=await fixture();let reads=0;
 for(const field of ['source','target']){
  const leaf={get maliciousNestedGetter(){reads++;throw Error('CALLER_ACCESSOR_EXECUTED');}};
  const changed={owner:{...mapping.owner,[field]:leaf},controller:mapping.controller};
  await assert.rejects(()=>prepareFresh35V2SchemaReview(root,analysis,changed),/MAPPING_STRING_VALUES/);
  assert.equal(reads,0);assert.equal(Object.isFrozen(leaf),false);
  const plain={nested:{}};
  await assert.rejects(()=>prepareFresh35V2SchemaReview(root,analysis,{owner:{...mapping.owner,[field]:plain},controller:mapping.controller}),/MAPPING_STRING_VALUES/);
  assert.equal(Object.isFrozen(plain),false);assert.equal(Object.isFrozen(plain.nested),false);
 }
});
test('running schema-review source is bound before projection or comparison',{skip:!directory},async()=>{
 const {analysis,mapping}=await fixture();const temp=await mkdtemp(join(tmpdir(),'fresh35-v2-schema-review-'));
 try{await mkdir(join(temp,'scripts/release/unified-install'),{recursive:true});await writeFile(join(temp,'scripts/release/unified-install/fresh35-catalog-v2-schema-review.mjs'),'changed');await assert.rejects(()=>prepareFresh35V2SchemaReview(temp,analysis,mapping),/RUNNING_SCHEMA_REVIEW_SOURCE_DIFFERS/);}finally{await rm(temp,{recursive:true,force:true});}
});
test('cached comparison rejects projection drift after preparation without changing shared sources',{skip:!directory},async()=>{
 const {analysis,mapping,review,projection}=await fixture();const temp=await mkdtemp(join(tmpdir(),'fresh35-v2-schema-pins-'));
 try{
  for(const pin of review.sourcePins){const path=join(temp,pin.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(join(root,pin.path)));}
  const copied=await prepareFresh35V2SchemaReview(temp,analysis,mapping);
  const path=join(temp,'scripts/release/unified-install/fresh35-retirement-v2-projection.mjs');await writeFile(path,(await readFile(path,'utf8'))+'\n// changed after preparation\n');
  await assert.rejects(()=>compareFresh35V2SchemaReview(copied,projection.sql),/SOURCE_PIN_CHANGED/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
