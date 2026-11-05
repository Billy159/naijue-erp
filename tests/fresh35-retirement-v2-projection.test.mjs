import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildFresh35V2SourceProjection} from '../scripts/release/unified-install/fresh35-retirement-v2-projection.mjs';
import {loadFresh35EvidenceV2Analysis} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
import {buildFresh35CatalogPostconditions,loadFresh35PostconditionEvidence} from '../scripts/release/unified-install/fresh35-catalog-postconditions.mjs';
import {loadReviewedFresh35EvidenceV2} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.env.FRESH35_V2_EVIDENCE_DIR;
const hash=value=>createHash('sha256').update(value).digest('hex');
const mapping={owner:{source:'schema178v2_owner_20261105_r2',target:'fresh35_owner_v2_review'},controller:{source:'schema178v2_controller_20261105_r2',target:'fresh35_controller_v2_review'}};
test('V2 projection requires a genuine unreviewed analysis object without accepting caller flags',async()=>{
 const trap=new Proxy({},{get(){throw Error('CALLER_GETTER_TOUCHED');},ownKeys(){throw Error('CALLER_GETTER_TOUCHED');}});
 await assert.rejects(()=>buildFresh35V2SourceProjection(root,trap,mapping),/GENUINE.*ANALYSIS|ANALYSIS.*REQUIRED/);
});
test('actual V2 produces exact35/152 source and complete metadata models without installation authority',{skip:!directory},async()=>{
 const analysis=await loadFresh35EvidenceV2Analysis(root,directory);
 const result=await buildFresh35V2SourceProjection(root,analysis,mapping);
 assert.equal(result.state,'UNREVIEWED_SOURCE_PROJECTION');
 assert.equal(result.sourceBindingSha256,'3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6');
 assert.equal(result.predecessorSourceSpecSha256,'88db01d978e0777d4f8a6fa4ca0d0918d80832cccf9300bb3ff5148b2990a86e');
 assert.equal(result.inputDumpSha256,'94b2ff3c5507f9dfaf5dd5858346a4deeab92f8a0599db8968f53e7efa6991f8');
 assert.equal(result.tables.length,35);assert.equal(result.routines.length,152);assert.equal(result.omittedTables.length,21);assert.equal(result.omittedRoutines.length,26);
 assert.equal(result.foreignKeyReplacements.length,7);assert.equal(result.metadata.columns.length,351);assert.equal(result.metadata.sequences.length,4);assert.equal(result.metadata.policies.length,32);
 assert.equal(result.model.constraints.length,326);assert.equal(result.model.indexes.length,111);assert.equal(result.model.triggers.length,570);assert.equal(result.model.routines.length,152);
 assert.equal(result.sqlSha256,hash(result.sql));assert.equal(result.metadata.sourceSha256,result.sqlSha256);
 assert.equal(result.identityMapping.bodyHashesBefore.length,152);assert.deepEqual(result.identityMapping.bodyHashesBefore,result.identityMapping.bodyHashesAfter);
 for(const key of ['reviewedEvidenceRegistered','independentSafetyReviewComplete','executionProvenanceAuthenticated','executionAuthorized','catalogMetadataComplete','engineVerified','engineDependenciesVerified','installationReady','targetAdmitted','hostEnabled','existingTargetMutation','existingDataMigrationSupported','oldTablesRemoved'])assert.equal(result[key],false,key);
 assert.equal(result.installSql,undefined);assert.equal(result.postconditionSql,undefined);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.metadata));
 assert.throws(()=>buildFresh35CatalogPostconditions(result.model,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
 assert.throws(()=>buildFresh35CatalogPostconditions(analysis,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
 await assert.rejects(()=>loadFresh35PostconditionEvidence(directory),/POSTCONDITION_EVIDENCE_CHANGED/);
 assert.throws(()=>loadReviewedFresh35EvidenceV2(result),/REVIEWED_PROFILE_NOT_REGISTERED/);
 for(const name of ['fresh35-retirement-v2-projection.mjs','fresh35-catalog-evidence-v2-adapter.mjs'])assert.ok(result.sourcePins.some(pin=>pin.path.endsWith(name)),name);
 assert.equal(result.sourcePins.length,179);assert.equal(result.projectionSourceSetSha256,hash(JSON.stringify(result.sourcePins)));
 for(const pin of result.sourcePins)assert.equal(pin.sha256,hash(await readFile(resolve(root,pin.path))),pin.path);
});
test('V2 target labels are explicit and change source hash without changing any body',{skip:!directory},async()=>{
 const analysis=await loadFresh35EvidenceV2Analysis(root,directory);
 const a=await buildFresh35V2SourceProjection(root,analysis,mapping),b=await buildFresh35V2SourceProjection(root,analysis,{owner:{...mapping.owner,target:'fresh35_owner_v2_other'},controller:{...mapping.controller,target:'fresh35_controller_v2_other'}});
 assert.notEqual(a.sqlSha256,b.sqlSha256);assert.deepEqual(a.identityMapping.bodyHashesAfter,b.identityMapping.bodyHashesAfter);
 assert.equal(a.identityMapping.privilegeKindsAndGrantOptionsChanged,false);
 await assert.rejects(()=>buildFresh35V2SourceProjection(root,analysis,{owner:{...mapping.owner,source:'wrong_source_owner'},controller:mapping.controller}),/SOURCE_IDENTITY_DIFFERS/);
 await assert.rejects(()=>buildFresh35V2SourceProjection(root,analysis,{...mapping,extra:true}),/IDENTITY_MAPPING/);
 await assert.rejects(()=>buildFresh35V2SourceProjection(root,analysis,{owner:{...mapping.owner,target:'erp_unified27_importer_2393dbc6db9581c2'},controller:mapping.controller}),/IDENTITY_MAPPING/);
 await assert.rejects(()=>buildFresh35V2SourceProjection(root,structuredClone(analysis),mapping),/GENUINE.*ANALYSIS|ANALYSIS.*REQUIRED/);
});
test('projection module bytes are bound independently without changing the original177 source binding',{skip:!directory},async()=>{
 const analysis=await loadFresh35EvidenceV2Analysis(root,directory),dir=await mkdtemp(resolve(tmpdir(),'fresh35-v2-projection-'));
 try{
  const path='scripts/release/unified-install/fresh35-retirement-v2-projection.mjs';await mkdir(dirname(resolve(dir,path)),{recursive:true});await writeFile(resolve(dir,path),(await readFile(resolve(root,path),'utf8'))+'\n// changed source\n');
  await assert.rejects(()=>buildFresh35V2SourceProjection(dir,analysis,mapping),/RUNNING_PROJECTION_SOURCE_DIFFERS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
