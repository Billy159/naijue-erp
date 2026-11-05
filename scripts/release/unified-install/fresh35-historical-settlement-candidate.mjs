/** Source-only missing-settlement type correction after the frozen amount delta.
 * No execution authority, new routine, stored business field or permission. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HISTORICAL_SETTLEMENT_'+code)};
const modulePath='scripts/release/unified-install/fresh35-historical-settlement-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_HISTORICAL_SETTLEMENT_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0035_historical_settlement_retention_successor.sql',sha256:'414002fc7fda9942de58962664f25cc3e8f5617db6f467a6c99d920a7611adcc'});
export async function loadFresh35HistoricalSettlementCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const amount=await loadFresh35HistoricalAmountCandidate(root);
 const patchSql=await readFile(resolve(root,FRESH35_HISTORICAL_SETTLEMENT_SQL_PIN.path),'utf8');
 need(hash(patchSql)===FRESH35_HISTORICAL_SETTLEMENT_SQL_PIN.sha256,'PATCH_SOURCE_DIFFERS');
 const parts=patchSql.split('$settlement_source_changes$');need(parts.length===3,'PAYLOAD_DIFFERS');const specs=JSON.parse(parts[1]);
 need(specs.length===1&&specs[0].signature==='naijue_erp.validate_sales_settlement()','CHANGE_SET_DIFFERS');
 const spec=specs[0],predecessor=amount.changedBodies.find(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(spec.signature));
 need(predecessor&&spec.replacements.length===2,'EXACT_AMOUNT_PREDECESSOR_REQUIRED');
 const body=applyRetirementSourceReplacement(predecessor.body,spec);
 need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');
 need((patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'TRANSACTION_DIFFERS');
 need(!/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM)\b/i.test(patchSql.replace(/^--.*$/gm,'')),'UNEXPECTED_MUTATION');
 const changed={signature:predecessor.signature,body,sha256:hash(body)};
 const successorRoutinePins=amount.manifest.successorRoutinePins.map(r=>normalizeRetirementSignature(r.signature)===normalizeRetirementSignature(spec.signature)?{signature:r.signature,sha256:changed.sha256}:r);
 need(successorRoutinePins.length===152,'EXACT152_REQUIRED');
 const pins=new Map(amount.manifest.sourcePins.map(p=>[p.path,p]));
 for(const pin of [FRESH35_HISTORICAL_SETTLEMENT_SQL_PIN,{path:modulePath,sha256:loadedModuleSha256}]){const old=pins.get(pin.path);need(!old||old.sha256===pin.sha256,'PIN_CONFLICT');pins.set(pin.path,pin);}
 const sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $settlement_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_HISTORICAL_SETTLEMENT_REVIEW_ONLY' USING ERRCODE='55000'; END $settlement_review_only$;");
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 return {patchSql,reviewSql,specs,predecessorBodies:[predecessor],changedBodies:[changed],manifest:{
  format:'FRESH35_HISTORICAL_SETTLEMENT_DELTA_SOURCE_CANDIDATE_V1',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),
  sourcePins,sourceSetSha256:hash(JSON.stringify(sourcePins)),predecessorAmountSourceSetSha256:amount.manifest.sourceSetSha256,
  routineChanges:[{signature:predecessor.signature,before:spec.predecessor_sha256,after:spec.successor_sha256}],successorRoutinePins,
  columnChanges:[],tableCount:35,routineCount:152,newTables:0,newColumns:0,newRoutines:0,permissionsChanged:false,
  requiredSourceProfileSha256:amount.manifest.requiredSourceProfileSha256,supportedSourceProfileSha256:amount.manifest.supportedSourceProfileSha256,
  missingSettlementTypes:['SALE','RETURN','EXCHANGE'],nonemptyMismatch:'REJECT',restoration:'ORIGINAL_UNCHANGED_AUDIT_CHAIN_ONLY',
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,
 }};
}
