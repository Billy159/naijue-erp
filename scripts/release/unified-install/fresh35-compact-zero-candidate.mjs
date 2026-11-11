/** One finite post-admin154 source successor. Compiles source only; never
 * installs SQL, issues execution authority or relabels an existing record. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {loadFresh35SalesHallCandidate} from './fresh35-sales-hall-candidate.mjs';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {loadFresh35HistoricalSettlementDifferenceCandidate} from './fresh35-historical-settlement-difference-candidate.mjs';
import {loadFresh35AdminProvisionCandidate} from './fresh35-admin-provision-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature as normalize,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),need=(v,c)=>{if(!v)throw Error('FRESH35_COMPACT_ZERO_'+c);};
const modulePath='scripts/release/unified-install/fresh35-compact-zero-candidate.mjs',patchPath='adapters/postgres/patches/0037_compact_zero_scope_successor.sql';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const COMPACT_ZERO_PREDECESSOR_BODY_SHA256='071119364504d6a818ea3454514ec139763784f8a914fa5cbc4284fccaaa520b';
export function compileFresh35CompactZeroCandidate(predecessors,patchSql){
 need(Array.isArray(predecessors)&&predecessors.length===154&&new Set(predecessors.map(r=>normalize(r.signature))).size===154,'EXACT154_REQUIRED');
 const parts=patchSql.split('$compact_zero_changes$');need(parts.length===3,'EXACT_PATCH_PAYLOAD_REQUIRED');const spec=JSON.parse(parts[1]);
 need(normalize(spec.signature)===normalize('naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)')&&spec.predecessor_sha256===COMPACT_ZERO_PREDECESSOR_BODY_SHA256&&spec.replacements.length===2,'EXACT_ROUTINE_AND_PREDECESSOR_REQUIRED');
 const previous=predecessors.find(r=>normalize(r.signature)===normalize(spec.signature));need(previous&&hash(previous.body)===spec.predecessor_sha256,'EXACT_PREDECESSOR_REQUIRED');
 const body=applyRetirementSourceReplacement(previous.body,spec);need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');
 const stripped=patchSql.replace(/^--.*$/gm,'');need(!/\b(?:CREATE\s+(?:TABLE|FUNCTION|ROLE|INDEX)|ALTER\s+(?:TABLE|ROLE)|GRANT|REVOKE|DISABLE TRIGGER|DROP|TRUNCATE|DELETE FROM)\b/i.test(stripped),'UNEXPECTED_SCHEMA_OR_PRIVILEGE_CHANGE');
 need(patchSql.includes('before_meta IS DISTINCT FROM after_meta')&&(patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'ATOMIC_METADATA_PRESERVATION_REQUIRED');
 const changedBodies=[{signature:previous.signature,body,sha256:hash(body)}],routineChanges=[{signature:previous.signature,before:spec.predecessor_sha256,after:spec.successor_sha256}];
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $compact_zero_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_COMPACT_ZERO_REVIEW_ONLY' USING ERRCODE='55000'; END $compact_zero_review_only$;");
 return {patchSql,reviewSql,specs:[spec],changedBodies,newRoutines:[],predecessorBodies:[previous],manifest:{format:'FRESH35_COMPACT_ZERO_SOURCE_CANDIDATE_V2',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),tableCount:35,newTables:0,newColumns:0,newRoutines:0,routineCount:154,predecessorRoutineCount:154,routineChanges,permissionChanges:[],permissionsChanged:false,tablePrivilegesChanged:false,columnChanges:[],constraintChanges:[],triggerChanges:[],successorRoutinePins:predecessors.map(r=>({signature:r.signature,sha256:normalize(r.signature)===normalize(previous.signature)?hash(body):r.sha256})),sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,installationRecordHandling:'PRESERVE_ADMIN154_RECORD; REQUIRE_DISTINCT_COMPACT_ZERO_SUCCESSOR_RECORD_AND_AUTHORITY'}};
}
export async function loadFresh35CompactZeroCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');const base=await loadFresh35RetirementPlan(root),routines=new Map(base.retainedRoutines.map(r=>[normalize(r.signature),r]));let parent;
 for(const load of [loadFresh35SalesHallCandidate,loadFresh35HistoricalAmountCandidate,loadFresh35HistoricalSettlementCandidate,loadFresh35HistoricalSettlementDifferenceCandidate,loadFresh35AdminProvisionCandidate]){parent=await load(root);for(const r of [...parent.changedBodies,...(parent.newRoutines??[])])routines.set(normalize(r.signature),r);}
 const candidate=compileFresh35CompactZeroCandidate([...routines.values()],await readFile(resolve(root,patchPath),'utf8')),pins=new Map(parent.manifest.sourcePins.map(p=>[p.path,p]));for(const path of [modulePath,patchPath])pins.set(path,{path,sha256:hash(await readFile(resolve(root,path)))});
 candidate.manifest.sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));candidate.manifest.predecessorSourceSetSha256=parent.manifest.sourceSetSha256;candidate.manifest.sourceSetSha256=hash(JSON.stringify(candidate.manifest.sourcePins));return candidate;
}
