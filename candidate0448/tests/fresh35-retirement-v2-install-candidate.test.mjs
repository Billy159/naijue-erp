import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {tmpdir} from 'node:os';
import {prepareFresh35V2InstallCandidate,validateFresh35V2TargetProposal} from '../scripts/release/unified-install/fresh35-retirement-v2-install-candidate.mjs';
import {loadFresh35EvidenceV2Analysis} from '../scripts/release/unified-install/fresh35-catalog-evidence-v2-adapter.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const directory=process.env.FRESH35_V2_EVIDENCE_DIR;const hash=v=>createHash('sha256').update(v).digest('hex');
const proposal={database_name:'synthetic_fresh35_20261105_r1',owner:'fresh35_owner_20261105_r1',controller:'fresh35_controller_20261105_r1',admin:'fresh35_admin_20261105_r1',runtime:'fresh35_runtime_20261105_r1',port:57635,workspace_directory:resolve(root,'../cloud-pg-fresh35-20261105-r1')};
test('target proposal is closed and cannot accept a physical identity or caller approval',()=>{
 const p=validateFresh35V2TargetProposal(root,proposal);assert.ok(Object.isFrozen(p));assert.equal(p.database_name,proposal.database_name);
 for(const patch of [{approved:true},{system_identifier:'123'},{database_name:'production'},{owner:'schema178v2_owner_20261105_r2'},{controller:proposal.owner},{port:0},{port:'57635'},{workspace_directory:'/production'}])assert.throws(()=>validateFresh35V2TargetProposal(root,{...proposal,...patch}),/TARGET_PROPOSAL/);
});
test('target proposal rejects accessors before they can change port or inject an approval field',()=>{
 let portReads=0;const changingPort={...proposal};Object.defineProperty(changingPort,'port',{enumerable:true,get(){return ++portReads<=3?57635:1;}});
 assert.throws(()=>validateFresh35V2TargetProposal(root,changingPort),/TARGET_PROPOSAL_DATA_PROPERTIES/);assert.equal(portReads,0);
 let nameReads=0;const injectingName={...proposal};Object.defineProperty(injectingName,'database_name',{enumerable:true,get(){nameReads++;injectingName.approved=true;return proposal.database_name;}});
 assert.throws(()=>validateFresh35V2TargetProposal(root,injectingName),/TARGET_PROPOSAL_DATA_PROPERTIES/);assert.equal(nameReads,0);assert.equal(Object.hasOwn(injectingName,'approved'),false);
});
test('candidate preparation rejects invented analysis before reading caller state',async()=>{
 const trap=new Proxy({},{get(){throw Error('CALLER_GETTER');}});await assert.rejects(()=>prepareFresh35V2InstallCandidate(root,trap,proposal),/GENUINE_ANALYSIS_REQUIRED/);
});
test('actual V2 candidate remains non-executable, leaves physical identity unknown, and binds all source material',{skip:!directory},async()=>{
 const analysis=await loadFresh35EvidenceV2Analysis(root,directory),c=await prepareFresh35V2InstallCandidate(root,analysis,proposal);
 assert.equal(c.state,'BLOCKED_INSTALL_REVIEW_CANDIDATE');assert.equal(c.targetProposal.database_name,proposal.database_name);assert.equal(c.physicalIdentity.database_oid,null);assert.equal(c.physicalIdentity.system_identifier,null);
 assert.equal(c.targetExistenceChecked,false);assert.equal(c.portAvailabilityChecked,false);
 assert.match(c.rejectedEntrySql,/^\\set ON_ERROR_STOP on\nBEGIN;/);assert.match(c.rejectedEntrySql,/RAISE EXCEPTION 'FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'/);assert.ok(c.rejectedEntrySql.endsWith('ROLLBACK;\n'));
 assert.doesNotMatch(c.rejectedEntrySql,/\bCREATE\b|\bGRANT\b|\bREVOKE\b|\bINSERT\b|\\i(?:r)?\s|\\connect|\bIF\b/);
 assert.equal(c.rejectedEntrySha256,hash(c.rejectedEntrySql));assert.equal(c.lineage.rows.length,27);assert.match(c.lineage.sql,/INSERT INTO naijue_erp.schema_migration/);
 assert.equal(c.sourcePins.length,180);assert.equal(c.sourceBindingSha256,'3cd0da8932bb59eb58e585e8f6aad9d894f334351b4ce97c8b370a36c48e0fb6');assert.equal(c.candidateSourceSetSha256,hash(JSON.stringify(c.sourcePins)));
 for(const pin of c.sourcePins)assert.equal(pin.sha256,hash(await readFile(resolve(root,pin.path))),pin.path);
 for(const key of ['reviewedEvidenceRegistered','independentSafetyReviewComplete','executionAuthorized','engineVerified','engineDependenciesVerified','installationReady','targetAdmitted','hostEnabled','credentialsCreated','targetCreated'])assert.equal(c[key],false,key);
 assert.equal(c.completeInstallationSql,undefined);assert.equal(c.postconditionSql,undefined);assert.ok(c.blockers.includes('COMPLETE_V2_INSTALL_GUARD_NOT_GENERATED'));assert.ok(c.blockers.includes('ACTUAL_NEW35_PHYSICAL_IDENTITY_NOT_ESTABLISHED'));
 assert.equal(c.projection.identityMapping.mapping.owner.target,proposal.owner);assert.equal(c.projection.identityMapping.mapping.controller.target,proposal.controller);
});
test('candidate module changes are separately bound and never edit captured177 pins',{skip:!directory},async()=>{
 const analysis=await loadFresh35EvidenceV2Analysis(root,directory),dir=await mkdtemp(resolve(tmpdir(),'fresh35-v2-candidate-'));
 try{const path='scripts/release/unified-install/fresh35-retirement-v2-install-candidate.mjs';await mkdir(dirname(resolve(dir,path)),{recursive:true});await writeFile(resolve(dir,path),(await readFile(resolve(root,path),'utf8'))+'\n// changed candidate\n');await assert.rejects(()=>prepareFresh35V2InstallCandidate(dir,analysis,proposal),/RUNNING_CANDIDATE_SOURCE_DIFFERS/);}finally{await rm(dir,{recursive:true,force:true});}
});
