/** Fresh35 source-only amount delta after the hall delta. This is not admission,
 * a database client, an evidence issuer, or a permission to execute an import. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {loadFresh35SalesHallCandidate} from './fresh35-sales-hall-candidate.mjs';
import {normalizeRetirementSignature,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_HISTORICAL_AMOUNT_'+code);};
const modulePath='scripts/release/unified-install/fresh35-historical-amount-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_HISTORICAL_AMOUNT_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0035_historical_line_amount_successor.sql',sha256:'862a5ae663356e3478bbc49a429c1552033d38be2a057f7c0d436590c0d0c067'});
const expectedNames=['standard_whole_package_command_v2','assert_document_migration','validate_sales_settlement','standard_whole_package_verify_v2'];
const normalized=normalizeRetirementSignature;
export function applyHistoricalAmountReplacement(before,spec){
 need(hash(before)===spec?.predecessor_sha256,'PREDECESSOR_DIFFERS');let after=before;
 need(Array.isArray(spec.replacements)&&spec.replacements.length>0,'REPLACEMENTS_REQUIRED');
 for(const r of spec.replacements){need(typeof r.before==='string'&&r.before.length>0&&after.split(r.before).length===2&&typeof r.after==='string','ANCHOR_DIFFERS');after=after.replace(r.before,()=>r.after);}
 need(hash(after)===spec.successor_sha256,'SUCCESSOR_DIFFERS');return after;
}
export async function loadFresh35HistoricalAmountCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const plan=await loadFresh35RetirementPlan(root),hall=await loadFresh35SalesHallCandidate(root);
 need(plan.retainedTables.length===35&&plan.retainedRoutines.length===152,'EXACT35_REQUIRED');
 const patchSql=await readFile(resolve(root,FRESH35_HISTORICAL_AMOUNT_SQL_PIN.path),'utf8');
 need(hash(patchSql)===FRESH35_HISTORICAL_AMOUNT_SQL_PIN.sha256,'PATCH_SOURCE_DIFFERS');
 const parts=patchSql.split('$amount_source_changes$');need(parts.length===3,'PAYLOAD_DIFFERS');const specs=JSON.parse(parts[1]);
 need(specs.length===4&&new Set(specs.map(s=>normalized(s.signature))).size===4&&specs.every(s=>expectedNames.includes(s.signature.slice('naijue_erp.'.length,s.signature.indexOf('(')))),'CHANGE_SET_DIFFERS');
 need((patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'TRANSACTION_DIFFERS');
 need(!/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM)\b/i.test(patchSql.replace(/^--.*$/gm,'')),'UNEXPECTED_MUTATION');
 need(findLegacyRoutineReferences(patchSql).length===0,'PATCH_RETIRED_REFERENCE');
 const predecessorBodies=plan.retainedRoutines.map(r=>hall.changedBodies.find(h=>normalized(h.signature)===normalized(r.signature))??r);
 const changedBodies=[];
 const successorRoutinePins=predecessorBodies.map(r=>{
  const spec=specs.find(s=>normalized(s.signature)===normalized(r.signature));
  if(!spec)return {signature:r.signature,sha256:r.sha256};
  const body=applyHistoricalAmountReplacement(r.body,spec);need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');
  const result={signature:r.signature,body,sha256:hash(body)};changedBodies.push(result);return {signature:r.signature,sha256:result.sha256};
 });
 need(changedBodies.length===4,'ROUTINE_MISSING');
 const pins=new Map(hall.manifest.sourcePins.map(p=>[p.path,p]));
 for(const p of [FRESH35_HISTORICAL_AMOUNT_SQL_PIN,{path:modulePath,sha256:loadedModuleSha256},{path:'packages/application/src/unified-historical-line-amount-evidence.ts',sha256:hash(await readFile(resolve(root,'packages/application/src/unified-historical-line-amount-evidence.ts')))}]){
  const old=pins.get(p.path);need(!old||old.sha256===p.sha256,'PIN_CONFLICT:'+p.path);pins.set(p.path,p);
 }
 const sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $amount_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_HISTORICAL_AMOUNT_REVIEW_ONLY' USING ERRCODE='55000'; END $amount_review_only$;");
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 return {patchSql,reviewSql,specs,predecessorBodies:predecessorBodies.filter(r=>specs.some(s=>normalized(s.signature)===normalized(r.signature))),changedBodies,manifest:{
  format:'FRESH35_HISTORICAL_AMOUNT_DELTA_SOURCE_CANDIDATE_V1',patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),
  sourcePins,sourceSetSha256:hash(JSON.stringify(sourcePins)),predecessorHallSourceSetSha256:hall.manifest.sourceSetSha256,
  routineChanges:specs.map(s=>({signature:predecessorBodies.find(r=>normalized(r.signature)===normalized(s.signature)).signature,before:s.predecessor_sha256,after:s.successor_sha256})),
  successorRoutinePins,columnChanges:[],tableCount:35,routineCount:152,newTables:0,newColumns:0,newRoutines:0,permissionsChanged:false,
  requiredSourceProfileSha256:hall.manifest.requiredSourceProfileSha256,
  evidence:{format:'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1',maxBytes:4194304,maxLines:10000,authority:'TRUSTED_HOST_EXTERNAL_SHA_NOT_SQL_SELF_APPROVAL',persistence:'SOURCE_HASH_AND_IMMUTABLE_IMPORT_AUDIT',exactSetAtPublication:true,originalValuesNeverRecalculated:true},
  readback:{entry:'standard_whole_package_verify_v2',existingCredentialsAndLocksPreserved:true,originalAndCurrentSeparate:true,calculatedAndDifferenceDiagnosticOnly:true},
  editBoundary:'NO_NEW_METADATA_SAVE_EXCEPTION; SAVE_AND_APPROVE_REQUIRE_ORDINARY_FORMULA',
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,existingDatabaseMutationSupported:false,existingDataMigrationSupported:false,
  activationGaps:['AUTHORIZED_NEW35_COMBINED_INSTALL_IMPORT_COMMIT_RECONNECT_READBACK','INDEPENDENT_CATALOG_SCHEMA_ACL_AND_SOURCE_REVIEW','TRUSTED_HOST_APPROVAL_AND_EXECUTION_COMPILER_WIRING','NATIVE_UI_DIFFERENCE_AND_METADATA_EDIT_REVIEW','REAL_SIX_SOURCE_ROWS_NOT_INSPECTED_OR_CERTIFIED','TRANSACTION_ROLLBACK_CONCURRENCY_REPLAY_AND_PRIVILEGE_ENGINE_TESTS'],
 }};
}
