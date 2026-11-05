import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm, cp, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFresh35EvidenceV2Analysis, requireFresh35EvidenceV2Analysis, assertFresh35EvidenceV2AnalysisCurrent } from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
import { loadReviewedFresh35EvidenceV2 } from '../scripts/release/unified-install/fresh35-catalog-evidence-v2.mjs';
import { buildFresh35CatalogPostconditions } from '../scripts/release/unified-install/fresh35-catalog-postconditions.mjs';
import { openReviewedFresh35Host } from '../tools/unified-import/fresh35-host-session.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=process.env.FRESH35_V2_ANALYSIS_EVIDENCE_DIR;
const hash=v=>createHash('sha256').update(v).digest('hex');
let evidence,scratch;
before(async()=>{scratch=await mkdtemp(resolve(tmpdir(),'fresh35-v2-analysis-'));if(directory)evidence=await loadFresh35EvidenceV2Analysis(root,directory);});
after(async()=>{if(scratch)await rm(scratch,{recursive:true,force:true});});
test('analysis brands never accept caller data, approval flags or cloned shape',()=>{
 for(const value of [{},{reviewed:true,approved:true,installationReady:true},null])assert.throws(()=>requireFresh35EvidenceV2Analysis(value),/GENUINE_ANALYSIS_REQUIRED/);
});
test('pinned real V2 capture is readable only as an immutable unreviewed analysis',{skip:!directory},async()=>{
 requireFresh35EvidenceV2Analysis(evidence);await assertFresh35EvidenceV2AnalysisCurrent(evidence);
 assert.equal(evidence.state,'UNREVIEWED_PREDECESSOR_ANALYSIS');
 assert.equal(evidence.sourceBinding.sha256,'3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6');
 assert.equal(evidence.sourceBinding.sourcePins.length,177);assert.equal(evidence.artifactPins.length,12);assert.equal(evidence.evidencePins.length,87);
 assert.equal(evidence.functions.length,178);assert.equal(evidence.inventory.relations.filter(x=>x.relkind==='r').length,56);
 assert.equal(hash(evidence.dump),'94b2ff3c5507f9dfaf5dd5858346a4deeab92f8a0599db8968f53e7efa6991f8');
 assert.equal(evidence.sourceTarget.target.database_name,'synthetic_schema178v2_20261105_r2');
 assert.equal(evidence.captureContext.before.server_address,'127.0.0.1');
 for(const key of ['reviewedEvidenceRegistered','independentSafetyReviewComplete','installationReady','targetAdmitted','hostWired','executionAuthorized','engineVerified','catalogMetadataComplete','executionProvenanceAuthenticated'])assert.equal(evidence[key],false,key);
 assert.ok(Object.isFrozen(evidence)&&Object.isFrozen(evidence.inventory.routines[0].catalog));
 assert.throws(()=>requireFresh35EvidenceV2Analysis(structuredClone(evidence)),/GENUINE_ANALYSIS_REQUIRED/);
});
test('legacy-shaped bridge changes names only and cannot enter the trusted V1 renderer',{skip:!directory},()=>{
 assert.equal(evidence.modelEvidence.sourceTarget.source_spec_sha256,evidence.sourceTarget.predecessorSourceSpecSha256);
 assert.equal(evidence.modelEvidence.sourceTarget.target.controller,'schema178v2_controller_20261105_r2');
 assert.equal(Object.hasOwn(evidence.sourceTarget.target,'controller'),false);
 assert.equal(evidence.modelEvidence.inventory,evidence.inventory);assert.equal(evidence.modelEvidence.functions,evidence.functions);
 assert.equal(evidence.modelEvidence.pins['schema178-naijue-erp.sql'],hash(evidence.dump));
 assert.throws(()=>buildFresh35CatalogPostconditions(evidence.modelEvidence,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
 assert.throws(()=>buildFresh35CatalogPostconditions(evidence,{},{}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);
});
test('reviewed loader and host remain unconditionally closed, even with genuine analysis',{skip:!directory},async()=>{
 assert.throws(()=>loadReviewedFresh35EvidenceV2(evidence,{approved:true}),/REVIEWED_PROFILE_NOT_REGISTERED/);
 await assert.rejects(openReviewedFresh35Host(evidence,{approved:true,connect(){throw Error('CONNECTED');}}),/FIXED_RECORD_INSTALLER_AND_HOST_NOT_WIRED/);
});
test('missing, changed, symbolic and nonregular evidence files are rejected',{skip:!directory},async()=>{
 const copy=resolve(scratch,'evidence');await cp(directory,copy,{recursive:true});
 const path=resolve(copy,'functions.json'),original=await readFile(path);
 await rm(path);await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_DIRECTORY_COHORT_DIFFERS/);
 await writeFile(path,Buffer.concat([original,Buffer.from('\n')]));await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_BYTES_DIFFER:functions.json/);
 await rm(path);await symlink(resolve(directory,'functions.json'),path);await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_FILE_UNAVAILABLE:functions.json/);
 await rm(path);await mkdir(path);await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_FILE_NOT_REGULAR:functions.json/);
 await rm(path,{recursive:true});await writeFile(path,'');await truncate(path,32*1024*1024+1);await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_FILE_TOO_LARGE:functions.json/);
});
test('directory aliases and undeclared evidence names are rejected',{skip:!directory},async()=>{
 const alias=resolve(scratch,'root-alias');await symlink(resolve(directory),alias);await assert.rejects(loadFresh35EvidenceV2Analysis(root,alias),/EVIDENCE_DIRECTORY_SYMLINK/);
 const ancestor=resolve(scratch,'ancestor-alias');await symlink(dirname(resolve(directory)),ancestor);await assert.rejects(loadFresh35EvidenceV2Analysis(root,resolve(ancestor,'evidence')),/EVIDENCE_DIRECTORY_SYMLINK/);
 const copy=resolve(scratch,'extra');await cp(directory,copy,{recursive:true});await writeFile(resolve(copy,'approval.json'),'{"approved":true}');await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_DIRECTORY_COHORT_DIFFERS/);
});
test('caller rehashing and sidecar alterations do not promote a new capture',{skip:!directory},async()=>{
 const copy=resolve(scratch,'altered');await cp(directory,copy,{recursive:true});
 await writeFile(resolve(copy,'lifecycle.json'),'{}\n');await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_BYTES_DIFFER:lifecycle.json/);
 const sums=await readFile(resolve(copy,'SHA256SUMS'),'utf8');await writeFile(resolve(copy,'SHA256SUMS'),sums.replace(/^[a-f0-9]{64}(  lifecycle\.json)$/m,hash('{}\n')+'$1'));
 await assert.rejects(loadFresh35EvidenceV2Analysis(root,copy),/EVIDENCE_SELECTOR_DIFFERS/);
});
test('current source binding rejects drift rather than relabeling the sampled cohort',{skip:!directory},async()=>{
 const copied=resolve(scratch,'source');for(const pin of [...evidence.sourceBinding.sourcePins,evidence.adapterSourcePin]){const dest=resolve(copied,pin.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,await readFile(resolve(root,pin.path)));}
 const same=await loadFresh35EvidenceV2Analysis(copied,directory);assert.equal(same.sourceBinding.sha256,evidence.sourceBinding.sha256);
 const target=resolve(copied,'tools/unified-import/stream-prepare-cli.mjs');await writeFile(target,(await readFile(target,'utf8'))+'\n// local source drift\n');
 await assert.rejects(assertFresh35EvidenceV2AnalysisCurrent(same),/SOURCE_BINDING_DIFFERS/);
 await assert.rejects(loadFresh35EvidenceV2Analysis(copied,directory),/SOURCE_BINDING_DIFFERS/);
});
test('loaded adapter bytes are independently bound and never pretended to be in the 177 capture pins',{skip:!directory},async()=>{
 assert.equal(evidence.sourceBinding.sourcePins.some(p=>p.path===evidence.adapterSourcePin.path),false);
 assert.equal(evidence.adapterSourcePin.sha256,hash(await readFile(resolve(root,evidence.adapterSourcePin.path))));
 const copied=resolve(scratch,'adapter-drift');for(const pin of [...evidence.sourceBinding.sourcePins,evidence.adapterSourcePin]){const dest=resolve(copied,pin.path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,await readFile(resolve(root,pin.path)));}
 await writeFile(resolve(copied,evidence.adapterSourcePin.path),'// changed adapter\n');await assert.rejects(loadFresh35EvidenceV2Analysis(copied,directory),/RUNNING_ADAPTER_SOURCE_DIFFERS/);
});
