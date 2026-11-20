/** Explicit fresh-only disposition. Never deletes or alters an existing target. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadFresh35RetirementSource, deriveRetainedRoutineClosure, normalizeRetirementSignature } from './fresh35-retirement-source.mjs';
import { loadPublicationIsolationPlan } from './fresh27-publication-isolation.mjs';
import { loadFresh35CoreGuardPlan } from './fresh35-core-guards.mjs';
import { LEGACY_RETIREMENT_CANDIDATE_TABLES } from './legacy-dependency-source-report.mjs';
import { LEGACY_ROWTYPE_EXPECTED_TABLES } from './fresh27-legacy-rowtypes.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const plans=new WeakSet();
export function requireFresh35RetirementPlan(plan){need(plans.has(plan),'FRESH35_GENUINE_RETIREMENT_PLAN_REQUIRED');return plan;}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Omission applies only when materializing a new schema. These are not DROP commands.
export const FRESH35_OMITTED_ROUTINES=freeze([
 'assert_barcode_scheme_initialization_v19(uuid,uuid)',
 'assert_core_initialization_v14(uuid,uuid,bool)',
 'assert_history_typed_closure(uuid,jsonb,jsonb)',
 'assert_native_bootstrap_accounts(uuid)',
 'assert_native_product_season_source(naijue_erp.import_source_row)',
 'guard_header_native_reference()', 'guard_history_closure_stage()', 'guard_history_insert()',
 'guard_import_accounting_claim()', 'guard_native_catalogue_binding()', 'guard_native_party_import_intent()',
 'guard_native_payment_binding()', 'guard_successor_source26()',
 'history_closure_digest(uuid,text,text,text,uuid,jsonb)',
 'history_closure_document_rows(uuid,text,uuid,bool)', 'history_closure_rows(uuid)',
 'history_effective_set_guard()', 'history_effective_writes_closed()',
 'history_numeric_current_facts(text,uuid)', 'history_revision_not_enabled()',
 'validate_exact_historical_customer_intent(naijue_erp.native_party_import_evidence,naijue_erp.import_batch)',
 'validate_history_closure_commit()', 'validate_history_numeric_revision_commit()', 'validate_history_product_proofs(uuid)',
 'validate_import_accounting_claim_commit()', 'validate_native_party_import_commit()',
].map(signature=>'naijue_erp.'+signature));
export async function loadFresh35RetirementPlan(root){
 const source=await loadFresh35RetirementSource(root);
 const replacements=[...await loadPublicationIsolationPlan(root),...await loadFresh35CoreGuardPlan(root)];
 need(replacements.length===19&&new Set(replacements.map(item=>normalizeRetirementSignature(item.signature))).size===19,'FRESH35_EXACT19_REPLACEMENTS_REQUIRED');
 const pending=new Map(replacements.map(item=>[normalizeRetirementSignature(item.signature),item]));
 const changed=source.routines.map(routine=>{
  const replacement=pending.get(normalizeRetirementSignature(routine.signature));if(!replacement)return routine;
  need(routine.bodySha256===replacement.before_sha256&&hash(replacement.body)===replacement.after_sha256,'FRESH35_SPECIALIZATION_PREDECESSOR_DIFFERS:'+routine.signature);
  pending.delete(normalizeRetirementSignature(routine.signature));
  return {...routine,body:replacement.body,bodySha256:replacement.after_sha256,sha256:replacement.after_sha256,
   specialization:{beforeSha256:replacement.before_sha256,afterSha256:replacement.after_sha256}};
 });
 need(pending.size===0,'FRESH35_SPECIALIZATION_ROUTINE_MISSING');
 const closure=deriveRetainedRoutineClosure(changed,FRESH35_OMITTED_ROUTINES);
 need(closure.retained.length===152&&closure.omitted.length===26,'FRESH35_FINAL_ROUTINE_COHORT_DIFFERS');
 const omittedTables=[...LEGACY_RETIREMENT_CANDIDATE_TABLES].sort();
 const retainedTables=LEGACY_ROWTYPE_EXPECTED_TABLES.filter(table=>!omittedTables.includes(table));
 need(retainedTables.length===35&&omittedTables.length===21,'FRESH35_FINAL_TABLE_COHORT_DIFFERS');
 const fkPath='adapters/postgres/patches/0027_fresh_core_history_fk_successor.sql';
 const fkSql=await readFile(resolve(root,fkPath),'utf8');
 need(hash(fkSql)==='ae1c61594696bce1aac263bbb6c8c9a44a43c815162e4246277ba8e7ba22fcd0','FRESH35_FK_SOURCE_DIFFERS');
 const edgeChunks=fkSql.split('$edges$');need(edgeChunks.length===3,'FRESH35_FK_EDGE_PAYLOAD_DIFFERS');
 const edges=JSON.parse(edgeChunks[1]);need(edges.length===7,'FRESH35_SEVEN_FK_REPLACEMENTS_REQUIRED');
 const sourcePins=[...source.sourcePins];
 for(const path of ['scripts/release/unified-install/fresh35-retirement-source.mjs','scripts/release/unified-install/fresh35-retirement-plan.mjs','scripts/release/unified-install/fresh35-retirement-schema.mjs','scripts/release/unified-install/fresh35-core-guards.mjs','scripts/release/unified-install/fresh27-publication-isolation.mjs','scripts/release/unified-install/legacy-dependency-source-report.mjs','scripts/release/unified-install/fresh27-legacy-rowtypes.mjs',fkPath]){
  const sha256=hash(await readFile(resolve(root,path)));const prior=sourcePins.find(pin=>pin.path===path);need(!prior||prior.sha256===sha256,'FRESH35_PLAN_SOURCE_PIN_CONFLICT');if(!prior)sourcePins.push({path,sha256});
 }
 sourcePins.sort((a,b)=>a.path.localeCompare(b.path));
 const plan=freeze({format:'FRESH35_DIRECT_SCHEMA_RETIREMENT_PLAN_V1',sourcePins,sourceSetSha256:hash(JSON.stringify(sourcePins)),predecessorSourceSpecSha256:source.predecessorSourceSpecSha256,
  predecessorRoutines:source.routines,retainedRoutines:closure.retained,omittedRoutines:closure.omitted,
  replacements,retainedTables,omittedTables,foreignKeyReplacements:edges,
  sourceReferencesClosed:true,existingDataMigrationSupported:false,existingDatabaseMutationSupported:false,
  engineDependenciesVerified:false,installationReady:false,oldTablesRemoved:false});
 plans.add(plan);return plan;
}
