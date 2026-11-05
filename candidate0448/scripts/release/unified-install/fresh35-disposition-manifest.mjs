/** Complete inventory of a closed SOURCE cohort, not a complete PostgreSQL
 * dependency graph. Every retirement decision remains unresolved. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {loadFresh56CombinedCandidate} from './fresh56-combined-candidate.mjs';
import {loadWholeCatalogSpec} from './whole-catalog-gate.mjs';
import {loadPublicationIsolationPlan} from './fresh27-publication-isolation.mjs';
import {loadLegacyRowtypePlan,LEGACY_ROWTYPE_EXPECTED_TABLES} from './fresh27-legacy-rowtypes.mjs';
import {LEGACY_RETIREMENT_CANDIDATE_TABLES} from './legacy-dependency-source-report.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const manifests=new WeakSet();
const normalize=x=>x.replaceAll('pg_catalog.','');const nameOf=x=>x.slice('naijue_erp.'.length,x.indexOf('('));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export function collectDispositionBodies(sources,pins,replacements){
 need(pins.length===177&&new Set(pins.map(p=>normalize(p.signature))).size===177,'DISPOSITION_EXACT_COHORT_REQUIRED');
 const bodies=new Map();
 for(const source of sources){need(hash(source.sql)===source.sha256,'DISPOSITION_SOURCE_CHANGED');
  for(const m of source.sql.matchAll(/\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)([\s\S]*?)\1/g)){
   const digest=hash(m[2]);for(const p of pins.filter(p=>p.sha256===digest))bodies.set(normalize(p.signature),{signature:p.signature,source:source.path,body:m[2],bodySha256:digest});
  }
 }
 need(bodies.size===177,'DISPOSITION_BODY_CONTENT_MISSING');
 need(replacements.length===20&&new Set(replacements.map(r=>normalize(r.signature))).size===20,'DISPOSITION_EXACT_REPLACEMENTS_REQUIRED');
 for(const r of replacements){const prior=bodies.get(normalize(r.signature));need(prior&&prior.bodySha256===r.before_sha256&&hash(r.body)===r.after_sha256,'DISPOSITION_REPLACEMENT_DIFFERS');bodies.set(normalize(r.signature),{...prior,body:r.body,bodySha256:r.after_sha256});}
 return [...bodies.values()];
}
export async function loadFresh35DispositionManifest(root){
 const combined=await loadFresh56CombinedCandidate(root),spec=await loadWholeCatalogSpec(root);
 const sources=await Promise.all(spec.installation_sources.filter(p=>p.path.endsWith('.sql')).map(async p=>({...p,sql:await readFile(resolve(root,p.path),'utf8')})));
 const replacements=[...await loadPublicationIsolationPlan(root),...await loadLegacyRowtypePlan(root)];
 const bodies=collectDispositionBodies(sources,spec.pins,replacements);
 const candidateTables=[...LEGACY_RETIREMENT_CANDIDATE_TABLES].sort(),allTables=[...LEGACY_ROWTYPE_EXPECTED_TABLES];
 const routines=bodies.map(r=>{
  const lexicalRelations=candidateTables.filter(t=>new RegExp('\\bnaijue_erp\\.'+t+'\\b').test(r.body));
  const compositeInputs=candidateTables.filter(t=>new RegExp('[(,]naijue_erp\\.'+t+'(?:\\[\\])?(?=[,)])').test(r.signature));
  const typedCasts=candidateTables.filter(t=>new RegExp('::\\s*naijue_erp\\.'+t+'\\b').test(r.body));
  const rowtypes=candidateTables.filter(t=>new RegExp('naijue_erp\\.'+t+'\\s*%ROWTYPE','i').test(r.body));
  const lexicalCalleeNames=[...new Set([...r.body.matchAll(/\bnaijue_erp\.([a-z_][a-z0-9_]*)\s*\(/g)].map(m=>m[1]))].sort();
  return {signature:r.signature,source:r.source,bodySha256:r.bodySha256,lexicalRelations,compositeInputs,typedCasts,rowtypes,
   lexicalCalleeCandidates:bodies.filter(b=>lexicalCalleeNames.includes(nameOf(b.signature))).map(b=>b.signature).sort(),
   containsConditionalSyntax:/\bIF\b|\bCASE\b/i.test(r.body),reachability:'UNKNOWN',disposition:'UNRESOLVED_NO_DROP_AUTHORITY'};
 }).sort((a,b)=>a.signature.localeCompare(b.signature));
 const triggerDeclarations=[];
 for(const source of sources)for(const m of source.sql.matchAll(/\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+([a-z_][a-z0-9_]*)\s+([^;]*?)\bON\s+naijue_erp\.([a-z_][a-z0-9_]*)\b([^;]*?)\bEXECUTE\s+(?:FUNCTION|PROCEDURE)\s+naijue_erp\.([a-z_][a-z0-9_]*)\s*\([^;]*?;/gi)){
  triggerDeclarations.push({name:m[1],table:m[3],calleeName:m[5],source:source.path,declarationSha256:hash(m[0]),
   finalCatalogStatus:'UNKNOWN_MAY_BE_SUPERSEDED_OR_DYNAMIC',calleeCandidates:routines.filter(r=>nameOf(r.signature)===m[5]).map(r=>r.signature)});
 }
 const tables=allTables.map(table=>({table,retirementCandidate:candidateTables.includes(table),
  proposedAction:candidateTables.includes(table)?'UNRESOLVED_RETIREMENT_CANDIDATE':'RETAIN_CANDIDATE_NOT_APPROVED_FINAL_DDL',
  routineMentionScope:'RETIREMENT_CANDIDATE_TABLES_ONLY_NOT_ALL_RELATIONS',
  retirementScopedDirectRoutineMentions:routines.filter(r=>r.lexicalRelations.includes(table)||r.compositeInputs.includes(table)||r.typedCasts.includes(table)).map(r=>r.signature),
  sourceTriggerDeclarations:triggerDeclarations.filter(t=>t.table===table),
  engineDependencies:'UNKNOWN',dataDisposition:'UNKNOWN_NOT_AUTHORIZED',dropAuthorized:false}));
 const affected=routines.filter(r=>r.lexicalRelations.length||r.compositeInputs.length||r.typedCasts.length);
 const lexicalReachableAffected=starts=>{
  const seen=new Set(),queue=[...starts];
  while(queue.length){const signature=queue.shift();if(seen.has(signature))continue;seen.add(signature);const r=routines.find(r=>r.signature===signature);if(r)queue.push(...r.lexicalCalleeCandidates);}
  return affected.filter(r=>seen.has(r.signature)).map(r=>r.signature).sort();
 };
 const coreTriggerReview=triggerDeclarations.filter(t=>!candidateTables.includes(t.table)).map(t=>({...t,
  directAffectedCallees:t.calleeCandidates.filter(s=>affected.some(r=>r.signature===s)),
  lexicalReachableAffectedCandidates:lexicalReachableAffected(t.calleeCandidates),
  transitiveReachability:'UNKNOWN_REQUIRES_CALLER_AND_BRANCH_REVIEW'}));
 const manifest=freeze({format:'FRESH35_OBJECT_DISPOSITION_SOURCE_MANIFEST_V1',sourceSetSha256:combined.sourceSetSha256,
  sources:sources.map(({path,sha256})=>({path,sha256})),predecessorSourceSpecSha256:spec.source_spec_sha256,
  tableCount:56,desiredTableCount:35,implementedTableCount:null,candidateTables,tables,routines,triggerDeclarations,coreTriggerReview,
  foreignKeyDelta:combined.foreignKeyDelta,
  unknowns:['ACTUAL_PG_DEPEND_AND_RETURN_OUT_COMPOSITE_TYPES','FINAL_TRIGGER_CATALOG_AND_DYNAMIC_DDL','OVERLOAD_RESOLUTION_AND_UNQUALIFIED_DYNAMIC_CALLS','CONDITIONAL_BRANCH_AND_TRANSITIVE_REACHABILITY','DATA_IDENTITY_AUDIT_RECEIPT_AND_RECOVERY_DISPOSITION','EXACT_FINAL35_DDL_AND_ACL','ISOLATED_INSTALL_IMPORT_ROLLBACK_REPLAY_AND_BUSINESS_EVIDENCE'],
  sourceInventoryCompleteForPinnedCohort:true,engineDependencyGraphComplete:false,final35Approved:false,installationReady:false,oldTablesRemoved:false,
  limitations:['Body extraction matches exact pinned content, not authenticated execution or an independent SQL parser.','Calls, relation mentions and conditional markers are lexical candidates, including possible comments/literals.','Trigger declarations include superseded sources and may miss dynamic or differently formatted DDL.','Empty lexical results do not authorize dropping any table, trigger or function.']});
 manifests.add(manifest);return manifest;
}
export function validateDispositionManifest(actual,expected){need(manifests.has(expected)&&isDeepStrictEqual(actual,expected)&&expected?.format==='FRESH35_OBJECT_DISPOSITION_SOURCE_MANIFEST_V1'&&expected.installationReady===false&&expected.final35Approved===false&&expected.tables.length===56&&expected.routines.length===177&&expected.tables.every(t=>t.dropAuthorized===false),'DISPOSITION_MANIFEST_DIFFERS');return Object.freeze({sourceOnly:true,installationReady:false,final35Approved:false});}
