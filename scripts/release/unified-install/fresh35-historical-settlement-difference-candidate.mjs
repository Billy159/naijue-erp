/** Source-only approved25/27 original settlement retention after the210 delta. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_SETTLEMENT_DIFFERENCE_'+code)};
const modulePath='scripts/release/unified-install/fresh35-historical-settlement-difference-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0035_historical_settlement_difference_successor.sql',sha256:'00831ce3dbf02af4ffb675c3e4593de3aa423b66ec17f6ff954702a4f343c9bc'});
export async function loadFresh35HistoricalSettlementDifferenceCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const amount=await loadFresh35HistoricalAmountCandidate(root),settlement=await loadFresh35HistoricalSettlementCandidate(root);
 const predecessors=amount.changedBodies.map(r=>settlement.changedBodies.find(s=>normalizeRetirementSignature(s.signature)===normalizeRetirementSignature(r.signature))??r);
 const patchSql=await readFile(resolve(root,FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN.path),'utf8');
 need(hash(patchSql)===FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN.sha256,'PATCH_SOURCE_DIFFERS');
 const parts=patchSql.split('$settlement_difference_changes$');need(parts.length===3,'PAYLOAD_DIFFERS');const specs=JSON.parse(parts[1]);
 need(specs.length===4&&new Set(specs.map(s=>normalizeRetirementSignature(s.signature))).size===4&&specs.every(s=>predecessors.some(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(s.signature))),'CHANGE_SET_DIFFERS');
 const changedBodies=specs.map(spec=>{const before=predecessors.find(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(spec.signature)),body=applyRetirementSourceReplacement(before.body,spec);need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');return {signature:before.signature,body,sha256:hash(body)};});
 const successorRoutinePins=settlement.manifest.successorRoutinePins.map(r=>{const changed=changedBodies.find(c=>normalizeRetirementSignature(c.signature)===normalizeRetirementSignature(r.signature));return changed?{signature:r.signature,sha256:changed.sha256}:r;});
 need(successorRoutinePins.length===152,'EXACT152_REQUIRED');
 need((patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'TRANSACTION_DIFFERS');
 need(!/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM)\b/i.test(patchSql.replace(/^--.*$/gm,'')),'UNEXPECTED_MUTATION');
 const pins=new Map(settlement.manifest.sourcePins.map(p=>[p.path,p]));
 for(const pin of [FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN,{path:modulePath,sha256:loadedModuleSha256}]){const old=pins.get(pin.path);need(!old||old.sha256===pin.sha256,'PIN_CONFLICT');pins.set(pin.path,pin);}
 const sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $settlement_difference_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_SETTLEMENT_DIFFERENCE_REVIEW_ONLY' USING ERRCODE='55000'; END $settlement_difference_review_only$;");
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 return {patchSql,reviewSql,specs,predecessorBodies:predecessors,changedBodies,manifest:{
  format:'FRESH35_SETTLEMENT_DIFFERENCE_DELTA_SOURCE_CANDIDATE_V1',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),sourcePins,sourceSetSha256:hash(JSON.stringify(sourcePins)),predecessorSettlementSourceSetSha256:settlement.manifest.sourceSetSha256,
  routineChanges:specs.map(s=>({signature:predecessors.find(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(s.signature)).signature,before:s.predecessor_sha256,after:s.successor_sha256})),successorRoutinePins,
  columnChanges:[],tableCount:35,routineCount:152,newTables:0,newColumns:0,newRoutines:0,permissionsChanged:false,
  requiredSourceProfileSha256:settlement.manifest.requiredSourceProfileSha256,supportedSourceProfileSha256:settlement.manifest.supportedSourceProfileSha256,
  retention:{headers:25,settlements:27,authority:'EXTERNAL_TRUSTED_UTF8_SHA',scope:'EXACT_ORIGINAL_MIGRATE_AND_READBACK_ONLY',sourceHashAlgorithmChanged:false,newApprovalOrSaveException:false},
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,
 }};
}
