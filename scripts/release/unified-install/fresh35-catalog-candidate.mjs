/** Source-derived successor expectations, NOT an observed/reviewed catalogue. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadWholeCatalogSpec} from './whole-catalog-gate.mjs';
import {loadPublicationIsolationPlan} from './fresh27-publication-isolation.mjs';
import {loadFresh35SourceRoute,describeFresh35SourceRoute,FRESH35_SOURCE_PROFILE} from './fresh35-source-route.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const normalize=s=>s.replaceAll('pg_catalog.','');
export function deriveFreshPublicationPins(predecessors,replacements){
 need(Array.isArray(predecessors)&&predecessors.length===177&&new Set(predecessors.map(p=>normalize(p.signature))).size===177,'FRESH35_EXACT_PREDECESSOR_PINS_REQUIRED');
 need(Array.isArray(replacements)&&replacements.length===9&&new Set(replacements.map(p=>normalize(p.signature))).size===9,'FRESH35_EXACT_REPLACEMENT_PINS_REQUIRED');
 const pending=new Map(replacements.map(p=>[normalize(p.signature),p]));
 const next=predecessors.map(p=>{
  const replacement=pending.get(normalize(p.signature));if(!replacement)return {...p};
  need(p.sha256===replacement.before_sha256&&/^[a-f0-9]{64}$/.test(replacement.after_sha256)&&replacement.before_sha256!==replacement.after_sha256,'FRESH35_PREDECESSOR_BODY_PIN_DIFFERS');
  pending.delete(normalize(p.signature));return {...p,sha256:replacement.after_sha256};
 });
 need(pending.size===0,'FRESH35_REPLACEMENT_ROUTINE_MISSING');return freeze(next);
}
export async function loadFresh35CatalogCandidate(sourceRoot){
 const route=describeFresh35SourceRoute(await loadFresh35SourceRoute({sourceRoot,profile:FRESH35_SOURCE_PROFILE}));
 const prior=await loadWholeCatalogSpec(sourceRoot),replacements=await loadPublicationIsolationPlan(sourceRoot);
 const pins=deriveFreshPublicationPins(prior.pins,replacements);
 const fkSql=await readFile(resolve(sourceRoot,route.reviewStages[2].path),'utf8');
 const edges=JSON.parse(fkSql.match(/\$edges\$(\[[\s\S]*?\])\$edges\$/)[1]);
 need(edges.length===7&&new Set(edges.map(e=>e.table+'.'+e.fk)).size===7,'FRESH35_EXACT_FK_DELTA_REQUIRED');
 return freeze({format:'FRESH56_PUBLICATION9_FK7_SOURCE_CATALOG_CANDIDATE_V1',
  predecessorSourceSpecSha256:prior.source_spec_sha256,sourceRouteSha256:route.sourceSetSha256,
  predecessorRoutinePins:prior.pins,successorRoutinePins:pins,
  foreignKeyDelta:edges.map(e=>({table:e.table,removeForeignKey:e.fk,addValidatedCheck:e.check,expression:e.column+' IS NULL',column:e.column})),
  preserved:{tableCount:56,routineCount:177,tableRows:'EMPTY_EXCEPT_SCHEMA_MIGRATION',routineNonBodyMetadata:'EXACT_UNCHANGED',columnDefinitions:'EXACT_UNCHANGED',policies:'EXACT_UNCHANGED',relationAcl:'EXACT_UNCHANGED',routineAcl:'EXACT_UNCHANGED'},
  notIncluded:['ROWTYPE_CANDIDATE','REMAINING_TYPE_RETIREMENT','PHYSICAL_21_TABLE_REMOVAL'],
  sourceOnly:true,reviewedCatalog:false,targetAdmitted:false,engineVerified:false,installationReady:false});
}
/** Only accepts exact already pinned outer wrappers; no generic SQL rewriting. */
export function stripPinnedTransaction(sql,expectedSha){
 need(hash(sql)===expectedSha,'FRESH35_ATOMIC_SOURCE_PIN_DIFFERS');
 const starts=[...sql.matchAll(/^BEGIN;$/gm)],ends=[...sql.matchAll(/^COMMIT;$/gm)];
 need(starts.length===1&&ends.length===1&&starts[0].index<ends[0].index&&sql.slice(ends[0].index+7).trim()==='', 'FRESH35_EXACT_OUTER_TRANSACTION_REQUIRED');
 return sql.slice(0,starts[0].index)+sql.slice(starts[0].index+6,ends[0].index);
}
export async function renderFresh35AtomicCandidate(sourceRoot){
 const route=describeFresh35SourceRoute(await loadFresh35SourceRoute({sourceRoot,profile:FRESH35_SOURCE_PROFILE}));
 const catalog=await loadFresh35CatalogCandidate(sourceRoot);
 const chunks=[];
 for(const index of [67,68]){const p=route.sources[index];chunks.push(stripPinnedTransaction(await readFile(resolve(sourceRoot,p.path),'utf8'),p.sha256));}
 // There is intentionally no caller flag to remove this refusal. The catalogue
 // authority and full retirement closure must be implemented, not self-attested.
 const sql=`-- NON-EXECUTABLE REVIEW CANDIDATE: fresh56 publication9 + FK7, not final35.\nBEGIN ISOLATION LEVEL READ COMMITTED;\nDO $blocked$ BEGIN\n RAISE EXCEPTION 'FRESH35_REVIEWED_CATALOG_AND_RETIREMENT_CLOSURE_MISSING' USING ERRCODE='23514';\nEND $blocked$;\n${chunks.join('\n')}\nCOMMIT;\n`;
 return freeze({sql,sha256:hash(sql),catalog,installationReady:false});
}
