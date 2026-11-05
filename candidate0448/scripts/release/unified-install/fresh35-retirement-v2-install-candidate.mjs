/** Offline preparation of a blocked installation review package.
 * The only entry SQL always raises before any application statement. Schema,
 * lineage and model outputs are separate source material, never included by
 * that entry. This module cannot authorize or perform an installation. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildFresh35V2SourceProjection} from './fresh35-retirement-v2-projection.mjs';
import {loadFresh35MigrationLineage} from './fresh35-retirement-install.mjs';
import {requireFresh35EvidenceV2Analysis,assertFresh35EvidenceV2AnalysisCurrent} from './fresh35-catalog-evidence-v2-adapter.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_INSTALL_REVIEW_'+code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const modulePath='scripts/release/unified-install/fresh35-retirement-v2-install-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
async function ownSource(root){need(typeof root==='string'&&hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_CANDIDATE_SOURCE_DIFFERS');}

export function validateFresh35V2TargetProposal(root,proposal){
 need(typeof root==='string'&&proposal&&Object.getPrototypeOf(proposal)===Object.prototype,'TARGET_PROPOSAL_FIELDS');
 // Snapshot descriptors, not property reads: an accessor must not change a
 // validated value or add an approval field between validation and freezing.
 const descriptors=Object.getOwnPropertyDescriptors(proposal),keys=Reflect.ownKeys(descriptors);
 need(keys.every(key=>typeof key==='string')&&keys.sort().join(',')==='admin,controller,database_name,owner,port,runtime,workspace_directory','TARGET_PROPOSAL_FIELDS');
 need(keys.every(key=>Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable),'TARGET_PROPOSAL_DATA_PROPERTIES');
 const snapshot=Object.fromEntries(keys.map(key=>[key,descriptors[key].value]));
 const match=typeof snapshot.database_name==='string'&&snapshot.database_name.match(/^synthetic_fresh35_([0-9]{8})_(r[1-9][0-9]{0,3})$/);
 need(match,'TARGET_PROPOSAL_DATABASE');const suffix=match[1]+'_'+match[2];
 for(const role of ['owner','controller','admin','runtime'])need(snapshot[role]==='fresh35_'+role+'_'+suffix,'TARGET_PROPOSAL_ROLE');
 need(Number.isSafeInteger(snapshot.port)&&snapshot.port>=1024&&snapshot.port<=65535,'TARGET_PROPOSAL_PORT');
 need(snapshot.workspace_directory===resolve(root,'..','cloud-pg-fresh35-'+match[1]+'-'+match[2]),'TARGET_PROPOSAL_DIRECTORY');
 return freeze(snapshot);
}

const rejectedEntrySql=`\\set ON_ERROR_STOP on
BEGIN;
DO $fresh35_v2_rejected$
BEGIN
 RAISE EXCEPTION 'FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'
  USING ERRCODE='55000', DETAIL='Safety review, reviewed V2 evidence, physical target binding and execution authorization are incomplete. This review entry never installs.';
END
$fresh35_v2_rejected$;
ROLLBACK;
`;

/** A proposal is neither a target observation nor permission. In particular,
 * physical identifiers stay null and no executable full installation SQL,
 * profile registration, credential instruction or host capability is returned. */
export async function prepareFresh35V2InstallCandidate(root,analysis,proposal){
 requireFresh35EvidenceV2Analysis(analysis);await ownSource(root);
 const targetProposal=validateFresh35V2TargetProposal(root,proposal);
 const projection=await buildFresh35V2SourceProjection(root,analysis,{
  owner:{source:analysis.sourceTarget.target.owner,target:targetProposal.owner},
  controller:{source:analysis.modelEvidence.sourceTarget.target.controller,target:targetProposal.controller},
 });
 const lineage=await loadFresh35MigrationLineage(root);
 const sourcePins=[...projection.sourcePins,{path:modulePath,sha256:loadedModuleSha256}].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 need(new Set(sourcePins.map(pin=>pin.path)).size===sourcePins.length,'SOURCE_PIN_DUPLICATE');
 await ownSource(root);await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 return freeze({format:'FRESH35_V2_BLOCKED_INSTALL_REVIEW_CANDIDATE_V1',state:'BLOCKED_INSTALL_REVIEW_CANDIDATE',
  sourceBindingSha256:projection.sourceBindingSha256,sourcePins,candidateSourceSetSha256:hash(JSON.stringify(sourcePins)),
  targetProposal,physicalIdentity:{database_oid:null,system_identifier:null},expectedServerVersionNum:analysis.sourceTarget.target.server_version_num,
  targetExistenceChecked:false,portAvailabilityChecked:false,proposalOnly:true,
  rejectedEntrySql,rejectedEntrySha256:hash(rejectedEntrySql),entryCannotInstall:true,projection,lineage,
  requiredReviewStages:[
   {name:'Review safety and exact source',required:'Review the V2 evidence, source changes, metadata and dependency boundaries independently; candidate consistency is not safety approval.'},
   {name:'Review new versioned installer',required:'Keep the captured177 inputs immutable. Independently review an explicit new V2 evidence/profile and atomic installer source layer with full source pins; do not relax the old loader.'},
   {name:'Authorize fresh target access',required:'Confirm the exact new cluster/database/roles, minimum privileges, temporary access, loopback endpoint, lifespan and cleanup before creating anything.'},
   {name:'Establish physical identity',required:'After separately authorized creation, observe actual database OID/system identifier/server version/owner and bind reviewed executable SQL to them. Do not substitute this proposal for observations.'},
   {name:'Validate atomic installation',required:'Use a reviewed complete guard before COMMIT, independently collect the resulting35 catalog/ACL/dependencies/schema dump, and retain rollback/failure evidence.'},
   {name:'Validate standard import and business',required:'Keep the host closed until its distinct profile and record are valid; then run separately authorized synthetic full-package, replay, rollback and ordinary-business acceptance.'},
  ],
  requiredEvidence:[
   'Exact input source and tool manifests with before/after hashes',
   'Specific target/access authorization and independent safety-review outcome',
   'Actual physical target identity and empty-target observations',
   'Single-transaction installation acknowledgement or complete failure/rollback evidence',
   'Same-snapshot full35 schema, functions, columns/types/collations/defaults, constraints, indexes, internal/external triggers, sequences, policies, ACL/default ACL and dependencies',
   'Actual deparser settings, source/model comparisons and21 omitted-table/type absence',
   'Temporary-login revocation, credential removal, owned-process clean shutdown and endpoint absence',
  ],
  blockers:['INDEPENDENT_SAFETY_REVIEW_INCOMPLETE','REVIEWED_V2_PROFILE_NOT_REGISTERED','ACTUAL_NEW35_PHYSICAL_IDENTITY_NOT_ESTABLISHED','NEW35_EXECUTION_AND_TEMPORARY_ACCESS_NOT_AUTHORIZED','COMPLETE_V2_INSTALL_GUARD_NOT_GENERATED','V2_INSTALLATION_RECORD_AND_HOST_DISABLED'],
  independentSafetyReviewComplete:false,reviewedEvidenceRegistered:false,executionProvenanceAuthenticated:false,
  engineDependenciesVerified:false,engineVerified:false,executionAuthorized:false,installationReady:false,targetAdmitted:false,hostEnabled:false,
  credentialsCreated:false,targetCreated:false,existingTargetMutation:false,oldTablesRemoved:false});
}
