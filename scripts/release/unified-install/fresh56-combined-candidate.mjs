/** Three-candidate offline composition. Not an installer, approved catalogue,
 * physical retirement plan, capability issuer, or replacement installed profile. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35CatalogCandidate,stripPinnedTransaction} from './fresh35-catalog-candidate.mjs';
import {FRESH35_SOURCE_PINS} from './fresh35-source-route.mjs';
import {loadPublicationIsolationPlan} from './fresh27-publication-isolation.mjs';
import {loadLegacyRowtypePlan,renderLegacyRowtypeSuccessor} from './fresh27-legacy-rowtypes.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(value,code)=>{if(!value)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const normalize=value=>value.replaceAll('pg_catalog.','');
const rowtypePin=Object.freeze({path:'adapters/postgres/patches/0027_fresh_legacy_rowtypes_successor.sql',sha256:'f3730f1ab5f3b6ac6e1ab73b2792cbf6ca77861f01094c141820000d265c0201'});
export function deriveCombinedPins(predecessors,replacements){
 need(Array.isArray(predecessors)&&predecessors.length===177&&new Set(predecessors.map(p=>normalize(p.signature))).size===177,'FRESH56_EXACT_PREDECESSOR_COHORT_REQUIRED');
 need(Array.isArray(replacements)&&replacements.length===20&&new Set(replacements.map(p=>normalize(p.signature))).size===20,'FRESH56_EXACT_REPLACEMENT_COHORT_REQUIRED');
 const pending=new Map(replacements.map(p=>[normalize(p.signature),p]));
 const next=predecessors.map(p=>{
  const r=pending.get(normalize(p.signature));if(!r)return {...p};
  need(r.before_sha256===p.sha256&&/^[a-f0-9]{64}$/.test(r.after_sha256)&&r.after_sha256!==r.before_sha256,'FRESH56_PREDECESSOR_BODY_DIFFERS');
  pending.delete(normalize(p.signature));return {...p,sha256:r.after_sha256};
 });
 need(pending.size===0,'FRESH56_REPLACEMENT_ROUTINE_MISSING');return freeze(next);
}
async function loadInputs(root){
 const prior=await loadFresh35CatalogCandidate(root);
 const publication=await loadPublicationIsolationPlan(root),rowtypes=await loadLegacyRowtypePlan(root);
 const replacements=[...publication,...rowtypes].map(({signature,before_sha256,after_sha256})=>({signature,before_sha256,after_sha256}));
 const successorRoutinePins=deriveCombinedPins(prior.predecessorRoutinePins,replacements);
 const sources=[FRESH35_SOURCE_PINS[67],FRESH35_SOURCE_PINS[68],rowtypePin];
 const chunks=[];
 for(const pin of sources){const sql=await readFile(resolve(root,pin.path),'utf8');need(hash(sql)===pin.sha256,'FRESH56_CANDIDATE_SOURCE_CHANGED:'+pin.path);chunks.push(sql);}
 need(await renderLegacyRowtypeSuccessor(root)===chunks[2],'FRESH56_ROWTYPE_GENERATED_SOURCE_DIFFERS');
 const balance=rowtypes.find(p=>p.name==='validate_history_numeric_balance_commit');
 const oldBalance=await readFile(resolve(root,FRESH35_SOURCE_PINS[69].path),'utf8');
 need(hash(oldBalance)===FRESH35_SOURCE_PINS[69].sha256&&oldBalance.includes(balance.before_sha256)&&oldBalance.includes(balance.after_sha256),'FRESH56_BALANCE_OVERLAP_DIFFERS');
 // This is a lexical inventory, including superseded definitions and literals.
 // It is NOT a resolved final-function/caller graph or proof of reachability.
 const embeddedPinOccurrences=[];
 for(const pin of [...FRESH35_SOURCE_PINS.slice(0,67),{path:'adapters/postgres/src/native-import-accounting-capability.ts'}]){
  const text=await readFile(resolve(root,pin.path),'utf8'),sourceSha256=hash(text);
  if(pin.sha256)need(sourceSha256===pin.sha256,'FRESH56_BASE_SOURCE_CHANGED:'+pin.path);
  const matches=replacements.filter(r=>text.includes(r.before_sha256)).map(r=>({signature:r.signature,predecessorSha256:r.before_sha256,successorSha256:r.after_sha256}));
  if(matches.length)embeddedPinOccurrences.push({path:pin.path,sourceSha256,matches});
 }
 const catalog=freeze({format:'FRESH56_PUBLICATION9_FK7_ROWTYPE11_SOURCE_CANDIDATE_V1',
  predecessorSourceSpecSha256:prior.predecessorSourceSpecSha256,
  sources,sourceSetSha256:hash(JSON.stringify(sources)),replacements,
  predecessorRoutinePins:prior.predecessorRoutinePins,successorRoutinePins,
  foreignKeyDelta:prior.foreignKeyDelta,tableCount:56,routineCount:177,
  preserved:prior.preserved,
  supersededCandidate:{...FRESH35_SOURCE_PINS[69],included:false,sameSuccessor:true},
  embeddedPinOccurrences,embeddedPinScanScope:'LEXICAL_FIRST_67_INSTALL_INPUTS_AND_NATIVE_IMPORT_ACCOUNTING_CAPABILITY_NOT_FINAL_CALL_GRAPH',
  embeddedPinsReconciled:false,
  prerequisites:['REVIEWED_EXACT_COMBINED_CATALOG_AND_ACL','CAPABILITY_AND_EMBEDDED_BODY_PIN_SUCCESSORS','REMAINING_COMPOSITE_TYPES_CASTS_AND_LEGACY_READ_CLOSURE','FINAL_35_TABLE_DEFINITION','EXCLUSIVE_SCHEMA_WRITER_WINDOW','ISOLATED_ENGINE_INSTALL_IMPORT_ROLLBACK_REPLAY_AND_ORDINARY_BUSINESS_EVIDENCE'],
  sourceOnly:true,reviewedCatalog:false,installationReady:false,engineVerified:false,targetAdmitted:false,oldTablesRemoved:false,existingProfilesChanged:false});
 return {catalog,chunks};
}
export async function loadFresh56CombinedCandidate(root){return (await loadInputs(root)).catalog;}
export async function renderFresh56CombinedReview(root){
 const {catalog,chunks}=await loadInputs(root);
 const bodies=chunks.map((sql,i)=>stripPinnedTransaction(sql,catalog.sources[i].sha256));
 // No switch can remove this refusal. It precedes every candidate DO block.
 const sql=`-- BLOCKED REVIEW ONLY: fresh56 publication9 + FK7 + rowtype11, NOT final35.\nBEGIN ISOLATION LEVEL READ COMMITTED;\nDO $blocked$ BEGIN\n RAISE EXCEPTION 'FRESH56_COMBINED_REVIEW_ONLY' USING ERRCODE='23514';\nEND $blocked$;\n${bodies.join('\n')}\nCOMMIT;\n`;
 return freeze({sql,sha256:hash(sql),catalog,installationReady:false});
}
export async function runFresh56CombinedInstall(){throw Error('FRESH56_COMBINED_REVIEW_ONLY');}
