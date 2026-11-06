/** Source-only approved25/27 original settlement retention after the210 delta. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_SETTLEMENT_DIFFERENCE_'+code)};
const modulePath='scripts/release/unified-install/fresh35-historical-settlement-difference-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0035_historical_settlement_difference_successor.sql',sha256:'260a9d5869b878ed0ad9f9fdbb1004c5c8e4cc8a510a4ea1cda01230d5335fb6'});
export const FRESH35_CAPTURE_RECEIPT_CONSTRAINT_PIN=Object.freeze({beforeDefinitionSha256:'d381f58ff5c741d08ea257c95ff4b991cdfdaf0b17b2a7fea3f0432f555210a4',afterDefinitionSha256:'5fdd40b5fbb91274b469d196ed344a2c3141f2f7bed390cd2fc8cc469354c7be',blockSha256:'0cdf022e0b0663f9f63e11804283dcc1b06074a3a85f8d7245de569ac2b26b34'});
export async function loadFresh35HistoricalSettlementDifferenceCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const amount=await loadFresh35HistoricalAmountCandidate(root),settlement=await loadFresh35HistoricalSettlementCandidate(root);
 const predecessors=amount.changedBodies.map(r=>settlement.changedBodies.find(s=>normalizeRetirementSignature(s.signature)===normalizeRetirementSignature(r.signature))??r);
 const patchSql=await readFile(resolve(root,FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN.path),'utf8');
 need(hash(patchSql)===FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN.sha256,'PATCH_SOURCE_DIFFERS');
 const parts=patchSql.split('$settlement_difference_changes$');need(parts.length===3,'PAYLOAD_DIFFERS');const specs=JSON.parse(parts[1]);
 const blocks=patchSql.match(/^DO \$historical_hall_capture_receipt_constraint\$\n[\s\S]*?^END \$historical_hall_capture_receipt_constraint\$;\n/gm);
 need(blocks?.length===1&&hash(blocks[0])===FRESH35_CAPTURE_RECEIPT_CONSTRAINT_PIN.blockSha256,'CAPTURE_CONSTRAINT_BLOCK_DIFFERS');
 const constraintParts=blocks[0].split('$hall_capture_receipt_constraint$');need(constraintParts.length===3,'CAPTURE_CONSTRAINT_PAYLOAD_DIFFERS');const constraintChange=JSON.parse(constraintParts[1]);
 need(Object.keys(constraintChange).sort().join(',')==='after,before,name,relation'&&constraintChange.relation==='operation_receipt'&&constraintChange.name==='receipt_result_by_kind'&&constraintChange.before?.relation===constraintChange.relation&&constraintChange.before?.name===constraintChange.name&&constraintChange.before?.kind==='c'&&constraintChange.before?.validated===true&&constraintChange.before?.deferrable===false,'CAPTURE_CONSTRAINT_IDENTITY_DIFFERS');
 need(typeof constraintChange.before.definition==='string'&&typeof constraintChange.after?.definition==='string'&&hash(constraintChange.before.definition)===FRESH35_CAPTURE_RECEIPT_CONSTRAINT_PIN.beforeDefinitionSha256&&hash(constraintChange.after.definition)===FRESH35_CAPTURE_RECEIPT_CONSTRAINT_PIN.afterDefinitionSha256&&isDeepStrictEqual({...constraintChange.after,definition:constraintChange.before.definition},constraintChange.before),'CAPTURE_CONSTRAINT_DEFINITION_OR_METADATA_DIFFERS');
 need(specs.length===4&&new Set(specs.map(s=>normalizeRetirementSignature(s.signature))).size===4&&specs.every(s=>predecessors.some(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(s.signature))),'CHANGE_SET_DIFFERS');
 const changedBodies=specs.map(spec=>{const before=predecessors.find(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(spec.signature)),body=applyRetirementSourceReplacement(before.body,spec);need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');return {signature:before.signature,body,sha256:hash(body)};});
 const successorRoutinePins=settlement.manifest.successorRoutinePins.map(r=>{const changed=changedBodies.find(c=>normalizeRetirementSignature(c.signature)===normalizeRetirementSignature(r.signature));return changed?{signature:r.signature,sha256:changed.sha256}:r;});
 need(successorRoutinePins.length===152,'EXACT152_REQUIRED');
 need((patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'TRANSACTION_DIFFERS');
 need(!/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM)\b/i.test(patchSql.replace(blocks[0],'').replace(/^--.*$/gm,'')),'UNEXPECTED_MUTATION');
 const pins=new Map(settlement.manifest.sourcePins.map(p=>[p.path,p]));
 for(const pin of [FRESH35_SETTLEMENT_DIFFERENCE_SQL_PIN,{path:modulePath,sha256:loadedModuleSha256}]){const old=pins.get(pin.path);need(!old||old.sha256===pin.sha256,'PIN_CONFLICT');pins.set(pin.path,pin);}
 const sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $settlement_difference_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_SETTLEMENT_DIFFERENCE_REVIEW_ONLY' USING ERRCODE='55000'; END $settlement_difference_review_only$;");
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 return {patchSql,reviewSql,specs,predecessorBodies:predecessors,changedBodies,manifest:{
  format:'FRESH35_SETTLEMENT_DIFFERENCE_DELTA_SOURCE_CANDIDATE_V1',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),sourcePins,sourceSetSha256:hash(JSON.stringify(sourcePins)),predecessorSettlementSourceSetSha256:settlement.manifest.sourceSetSha256,
  routineChanges:specs.map(s=>({signature:predecessors.find(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(s.signature)).signature,before:s.predecessor_sha256,after:s.successor_sha256})),successorRoutinePins,
  constraintChanges:[constraintChange],newConstraints:0,columnChanges:[],tableCount:35,routineCount:152,newTables:0,newColumns:0,newRoutines:0,permissionsChanged:false,
  requiredSourceProfileSha256:settlement.manifest.requiredSourceProfileSha256,supportedSourceProfileSha256:settlement.manifest.supportedSourceProfileSha256,
  retention:{headers:25,settlements:27,authority:'EXTERNAL_TRUSTED_UTF8_SHA',scope:'EXACT_ORIGINAL_MIGRATE_AND_READBACK_ONLY',sourceHashAlgorithmChanged:false,newApprovalOrSaveException:false},
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,
 }};
}
