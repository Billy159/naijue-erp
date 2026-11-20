/** Current-source fresh35 delta only. No database connection, captured-evidence
 * admission, role/ACL expansion, legacy table restoration or installer dispatch. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan,requireFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {applyRetirementSourceReplacement,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
import {HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../../../packages/application/src/unified-import-contract.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_SALES_HALL_'+code);};
const modulePath='scripts/release/unified-install/fresh35-sales-hall-candidate.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
const profile='f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66';
export const FRESH35_SALES_HALL_SQL_PIN=Object.freeze({path:'adapters/postgres/patches/0035_historical_sales_hall_successor.sql',sha256:'0c9101adf318f72f61e2c1256ba7c160933b1411453c7e7f89684dc2ecc0edd1'});
const expectedSignatures=Object.freeze(["naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","naijue_erp.guard_unified_document()","naijue_erp.standard_import_record_proof(pg_catalog.uuid)","naijue_erp.assert_standard_import_operation(uuid)","naijue_erp.standard_whole_package_verify_v2(jsonb,text)"]);
function payload(sql,tag){const parts=sql.split('$'+tag+'$');need(parts.length===3,'PAYLOAD_DIFFERS');return JSON.parse(parts[1]);}
function transactionBody(sql){need((sql.match(/^BEGIN;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'TRANSACTION_INVALID');return sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);}
export function compileFresh35SalesHallCandidate(plan,patch){
 requireFresh35RetirementPlan(plan);
 need(plan.retainedTables.length===35&&plan.retainedRoutines.length===152&&!plan.retainedTables.includes('history_sales_header'),'EXACT35_SOURCE_PLAN_REQUIRED');
 need(HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256===profile,'SOURCE_PROFILE_DIFFERS');
 need(typeof patch==='string'&&hash(patch)===FRESH35_SALES_HALL_SQL_PIN.sha256,'PATCH_SOURCE_DIFFERS');
 const replacements=payload(patch,'hall_source_changes'),dependencies=payload(patch,'hall_dependencies');
 need(replacements.length===5&&new Set(replacements.map(r=>r.signature)).size===5&&replacements.every(r=>expectedSignatures.includes(r.signature)),'EXACT_FIVE_CHANGES_REQUIRED');
 for(const dep of dependencies)need(plan.retainedRoutines.some(r=>r.signature===dep.signature&&r.sha256===dep.sha256),'DEPENDENCY_DIFFERS:'+dep.signature);
 const changedBodies=[];
 const successorRoutinePins=plan.retainedRoutines.map(r=>{
  const change=replacements.find(p=>p.signature===r.signature);if(!change)return {signature:r.signature,sha256:r.sha256};
  need(change.predecessor_sha256===r.sha256,'PREDECESSOR_DIFFERS');
  const body=applyRetirementSourceReplacement(r.body,change);
  need(findLegacyRoutineReferences(body).length===0,'OMITTED_TABLE_REFERENCE');
  changedBodies.push({signature:r.signature,body,sha256:hash(body)});return {signature:r.signature,sha256:hash(body)};
 });
 need(changedBodies.length===5,'ROUTINE_MISSING');
 need(!/\b(?:CREATE TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM)\b/i.test(patch.replace(/^--.*$/gm,'')),'UNEXPECTED_MUTATION');
 need(findLegacyRoutineReferences(patch).length===0,'PATCH_RESTORES_LEGACY_REFERENCE');
 const body=transactionBody(patch);
 const reviewSql=`-- REVIEW ONLY. This entry cannot install. Raw patchSql is supplied separately for independent composition.\nBEGIN;\nDO $fresh35_hall_review$ BEGIN\n RAISE EXCEPTION 'FRESH35_SALES_HALL_REVIEW_ONLY' USING ERRCODE='55000';\nEND $fresh35_hall_review$;\n${body}\nCOMMIT;\n`;
 return {patchSql:patch,reviewSql,changedBodies,manifest:{
  format:'FRESH35_SALES_HALL_DELTA_SOURCE_CANDIDATE_V1',patchSqlSha256:hash(patch),reviewSqlSha256:hash(reviewSql),
  predecessorSourceSetSha256:plan.sourceSetSha256,sourcePins:[...plan.sourcePins,FRESH35_SALES_HALL_SQL_PIN],
  routineChanges:replacements.map(r=>({signature:r.signature,before:r.predecessor_sha256,after:r.successor_sha256})),
  unchangedDependencies:dependencies,successorRoutinePins,
  columnChanges:[{table:'naijue_erp.sales_header',column:'hall_id',type:'uuid',beforeNullable:false,afterNullable:true}],
  tableCount:35,routineCount:152,newTables:0,newColumns:0,newRoutines:0,newHalls:0,permissionsChanged:false,
  requiredSourceProfileSha256:profile,supportedSourceProfileSha256:[profile,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256],
  hallEvidence:{format:'HISTORICAL_SALES_HALL_EVIDENCE_V1',approvalFormat:'HISTORICAL_SALES_HALL_APPROVAL_V1',additionalFormat:'HISTORICAL_SALES_HALL_EVIDENCE_V2',additionalApprovalFormat:'HISTORICAL_SALES_HALL_APPROVAL_V2',sourceAndTargetSeparated:true,allHistoricalHeadersRequired:true,approvalMaxBytes:67108864,approvalMaxRecords:250000,authority:'TRUSTED_HOST_EXTERNAL_SHA_NOT_SQL_SELF_APPROVAL',captureImmutable:true,currentHallWarehouseMayChangeUnderOrdinaryRules:true},
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,priorCapturedEvidenceAdmitted:false,
  activationGaps:['AUTHORIZED_NEW35_COMBINED_INSTALL_AND_ENGINE_ACCEPTANCE','INDEPENDENT_FULL_SUCCESSOR_CATALOG_SCHEMA_ACL_REVIEW','EXPLICIT_INSTALLED_RECORD_RUNTIME_CAPABILITY_AND_NEW_PROFILE_ADMISSION','PUBLISHED_MIGRATION_READER_EXPLICIT_SUCCESSOR_PIN','CURRENT_SOURCE_DELTAS_MUST_NOT_REUSE_OLD_CAPTURE_PROVENANCE'],
 }};
}
export async function loadFresh35SalesHallCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const plan=await loadFresh35RetirementPlan(root),patch=await readFile(resolve(root,FRESH35_SALES_HALL_SQL_PIN.path),'utf8');
 const result=compileFresh35SalesHallCandidate(plan,patch),pins=new Map(result.manifest.sourcePins.map(p=>[p.path,p]));
 for(const path of [modulePath,'packages/application/src/historical-sales-hall-evidence.ts','packages/application/src/unified-historical-sales-hall-evidence.ts','packages/application/src/unified-import-source-reconciliation.ts','packages/application/src/unified-current-effective-alignment.ts','packages/application/src/unified-historical-line-amount-evidence.ts']){
  const pin={path,sha256:hash(await readFile(resolve(root,path)))};const prior=pins.get(path);need(!prior||prior.sha256===pin.sha256,'SOURCE_PIN_CONFLICT:'+path);pins.set(path,pin);
 }
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 result.manifest.sourcePins=[...pins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 result.manifest.sourceSetSha256=hash(JSON.stringify(result.manifest.sourcePins));return result;
}
