/** Source analysis for the selected, unreviewed V2 predecessor capture.
 * This composes review material only. It cannot register evidence, produce an
 * installation wrapper/guard, create a target, open a host or execute SQL. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {compileFresh35SchemaFromDump} from './fresh35-retirement-schema.mjs';
import {mapFresh35RetirementIdentities} from './fresh35-retirement-identity.mjs';
import {collectFresh35RetirementMetadata} from './fresh35-retirement-metadata.mjs';
import {projectFresh35CoreMetadata} from './fresh35-catalog-postconditions.mjs';
import {requireFresh35EvidenceV2Analysis,assertFresh35EvidenceV2AnalysisCurrent} from './fresh35-catalog-evidence-v2-adapter.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_V2_PROJECTION_'+code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const modulePath='scripts/release/unified-install/fresh35-retirement-v2-projection.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
const unchangedCoreNames=Object.freeze(['standard_whole_package_command_v2','standard_whole_package_closed_v2','validate_sales_settlement','standard_zero_amount_archive_trace','valid_history_counts','guard_retained_settlement_identity','unified_sales_settlement_audit_values','validate_unified_sales_settlement_commit']);

async function ownSource(root){need(typeof root==='string'&&hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_PROJECTION_SOURCE_DIFFERS');}

/** The caller must supply explicit source/target identity labels. Target labels
 * are merely source-analysis inputs, not created identities or target consent.
 * A private analysis brand proves an adapter produced these bytes; it does not
 * turn the candidate into reviewed evidence or authenticate a running target. */
export async function buildFresh35V2SourceProjection(root,analysis,identityMapping){
 requireFresh35EvidenceV2Analysis(analysis);
 await ownSource(root);
 await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 const plan=await loadFresh35RetirementPlan(root),binding=analysis.sourceBinding;
 need(plan.predecessorSourceSpecSha256===binding.predecessorSourceSpecSha256&&plan.sourceSetSha256===binding.retirementSourceSetSha256,'CURRENT_PLAN_BINDING_DIFFERS');
 const sourceOwner=analysis.sourceTarget.target.owner,sourceController=analysis.modelEvidence.sourceTarget.target.controller;
 need(identityMapping?.owner?.source===sourceOwner&&identityMapping?.controller?.source===sourceController,'SOURCE_IDENTITY_DIFFERS');
 const dumpPin=analysis.artifactPins.find(pin=>pin.path==='schema178-naijue-erp.sql');
 need(dumpPin&&hash(analysis.dump)===dumpPin.sha256,'DUMP_BINDING_DIFFERS');
 const compiled=compileFresh35SchemaFromDump(analysis.dump,plan,{dumpSha256:dumpPin.sha256,predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const mapped=mapFresh35RetirementIdentities(compiled.sql,identityMapping);
 const metadata=collectFresh35RetirementMetadata(mapped.sql);
 const model=projectFresh35CoreMetadata(analysis.modelEvidence,plan,{[sourceOwner]:identityMapping.owner.target,[sourceController]:identityMapping.controller.target});
 need(metadata.tables.length===35&&metadata.columns.length===351&&metadata.sequences.length===4&&metadata.policies.length===32,'METADATA_COHORT_DIFFERS');
 need(metadata.sourceSha256===mapped.sha256&&model.routines.length===152&&model.constraints.length===326&&model.indexes.length===111&&model.triggers.length===570,'MODEL_COHORT_DIFFERS');
 const preservedCore=unchangedCoreNames.map(name=>{
  const before=plan.predecessorRoutines.find(routine=>routine.name===name),after=plan.retainedRoutines.find(routine=>routine.name===name);
  need(before&&after&&before.bodySha256===after.bodySha256,'PRESERVED_CORE_CHANGED:'+name);
  return {name,signature:after.signature,sha256:after.bodySha256};
 });
 const sources=new Map(binding.sourcePins.map(pin=>[pin.path,pin.sha256]));
 for(const pin of [analysis.adapterSourcePin,{path:modulePath,sha256:loadedModuleSha256}]){
  need(!sources.has(pin.path)||sources.get(pin.path)===pin.sha256,'SOURCE_PIN_CONFLICT');sources.set(pin.path,pin.sha256);
 }
 const sourcePins=[...sources].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([path,sha256])=>({path,sha256}));
 await ownSource(root);
 await assertFresh35EvidenceV2AnalysisCurrent(analysis);
 const {sql:unusedMappedSql,...mappingReport}=mapped;
 return freeze({format:'FRESH35_V2_SOURCE_PROJECTION_REVIEW_V1',state:'UNREVIEWED_SOURCE_PROJECTION',
  sourceBindingSha256:binding.sha256,predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256,
  retirementSourceSetSha256:plan.sourceSetSha256,sourcePins,projectionSourceSetSha256:hash(JSON.stringify(sourcePins)),
  sourceScope:'CAPTURED177_SOURCE_PINS_PLUS_EXPLICIT_ANALYSIS_ADAPTER_AND_PROJECTION_NOT_WHOLE_REPOSITORY',
  inputDumpSha256:dumpPin.sha256,inputManifestSha256:analysis.consistency.manifestSha256,
  artifactPins:analysis.artifactPins,unmappedSql:compiled.sql,unmappedSqlSha256:compiled.sha256,
  sql:mapped.sql,sqlSha256:mapped.sha256,identityMapping:mappingReport,decisions:compiled.decisions,
  tables:plan.retainedTables,routines:plan.retainedRoutines.map(routine=>({name:routine.name,signature:routine.signature,bodySha256:routine.bodySha256})),
  omittedTables:plan.omittedTables,omittedRoutines:plan.omittedRoutines.map(routine=>({name:routine.name,signature:routine.signature})),
  foreignKeyReplacements:plan.foreignKeyReplacements,preservedCore,metadata,model,
  sourceReferencesClosed:plan.sourceReferencesClosed,sourceReferenceScope:'Finite reviewed source reference patterns, not arbitrary dynamic SQL or target pg_depend',
  analysisOnly:true,reviewedEvidenceRegistered:false,independentSafetyReviewComplete:false,
  executionProvenanceAuthenticated:false,catalogMetadataComplete:false,engineDependenciesVerified:false,engineVerified:false,
  executionAuthorized:false,installationReady:false,targetAdmitted:false,hostEnabled:false,
  existingTargetMutation:false,existingDataMigrationSupported:false,oldTablesRemoved:false,
  remaining:['INDEPENDENT_V2_EVIDENCE_AND_SAFETY_REVIEW','EXPLICIT_REVIEWED_PROFILE_AND_COMPLETE_GUARD_BINDING','AUTHORIZED_NEW35_TARGET_INSTALLATION_AND_CATALOG_DEPENDENCIES','FULL_PACKAGE_REPLAY_ROLLBACK_AND_ORDINARY_BUSINESS_ACCEPTANCE']});
}
