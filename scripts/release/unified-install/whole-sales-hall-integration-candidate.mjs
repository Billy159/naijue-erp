/** Offline review composition only. Never an installed profile, database client,
 * admission issuer, or change to the existing V1 catalog/activation route. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementSource,applyRetirementSourceReplacement} from './fresh35-retirement-source.mjs';
import {renderWholeExplicitZeroCandidate} from './whole-explicit-zero-integration-candidate.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
export const HISTORICAL_SALES_HALL_SQL_PIN=Object.freeze({
 path:'adapters/postgres/patches/0027_historical_sales_hall_successor.sql',
 sha256:'fea78323701e2c8c2701292483d6dc98e177fb2b0824823f662faeb8dfc0667d',
});
function payload(sql,tag){const parts=sql.split('$'+tag+'$');need(parts.length===3,'SALES_HALL_PAYLOAD_DIFFERS');return JSON.parse(parts[1]);}
function transactionBody(sql){
 need((sql.match(/^BEGIN(?: ISOLATION LEVEL READ COMMITTED)?;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n'),'SALES_HALL_TRANSACTION_INVALID');
 return sql.replace(/^BEGIN(?: ISOLATION LEVEL READ COMMITTED)?;\n/m,'').slice(0,-'COMMIT;\n'.length);
}
export function compileWholeSalesHallCandidate(source,prior,patch){
 need(typeof patch==='string'&&hash(patch)===HISTORICAL_SALES_HALL_SQL_PIN.sha256,'SALES_HALL_SOURCE_DIFFERS');
 need(source?.routines?.length===178&&source.engineVerified===false,'SALES_HALL_CURRENT_SOURCE_REQUIRED');
 const replacements=payload(patch,'hall_source_changes'),dependencies=payload(patch,'hall_dependencies');
 const expected=['naijue_erp.guard_unified_document()','naijue_erp.guard_history_insert()','naijue_erp.guard_header_native_reference_publication()','naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'];
 need(replacements.length===expected.length&&new Set(replacements.map(r=>r.signature)).size===expected.length&&replacements.every(r=>expected.includes(r.signature)),'SALES_HALL_EXACT_CHANGE_SET_REQUIRED');
 for(const dep of dependencies)need(source.routines.some(r=>r.signature===dep.signature&&r.sha256===dep.sha256),'SALES_HALL_DEPENDENCY_DIFFERS:'+dep.signature);
 const changedBodies=[];
 const successorRoutinePins=source.routines.map(r=>{
  const replacement=replacements.find(p=>p.signature===r.signature);
  if(!replacement)return {signature:r.signature,sha256:r.sha256};
  need(r.sha256===replacement.predecessor_sha256,'SALES_HALL_PREDECESSOR_DIFFERS');
  const body=applyRetirementSourceReplacement(r.body,replacement);
  changedBodies.push({signature:r.signature,body,sha256:hash(body)});
  return {signature:r.signature,sha256:hash(body)};
 });
 need(changedBodies.length===expected.length,'SALES_HALL_ROUTINE_MISSING');
 // The old exact access verifier runs before the successor. The successor then
 // verifies its own changed routines, preserved dependencies and narrow DDL delta.
 // The result is explicitly blocked pending independent full successor admission.
 const sql=`-- BLOCKED REVIEW ONLY: historical sales hall candidate, not an installer.\nBEGIN ISOLATION LEVEL READ COMMITTED;\nDO $hall_review_only$ BEGIN\n RAISE EXCEPTION 'HISTORICAL_SALES_HALL_REVIEW_ONLY' USING ERRCODE='55000';\nEND $hall_review_only$;\n${transactionBody(prior.sql)}\n${transactionBody(patch)}\nCOMMIT;\n`;
 return {sql,patchSql:patch,changedBodies,manifest:{
  format:'HISTORICAL_SALES_HALL_SOURCE_CANDIDATE_V1',sqlSha256:hash(sql),
  predecessorSourceSpecSha256:source.predecessorSourceSpecSha256,
  sourcePins:[...source.sourcePins,HISTORICAL_SALES_HALL_SQL_PIN],
  routineChanges:replacements.map(r=>({signature:r.signature,before:r.predecessor_sha256,after:r.successor_sha256})),
  successorRoutinePins,unchangedDependencies:dependencies,
  columnChanges:['history_sales_header','sales_header'].map(table=>({table:'naijue_erp.'+table,column:'hall_id',type:'uuid',beforeNullable:false,afterNullable:true})),
  newTables:0,newColumns:0,newRoutines:0,newHalls:0,permissionsChanged:false,
  hallEvidence:{format:'HISTORICAL_SALES_HALL_EVIDENCE_V1',approvalFormat:'HISTORICAL_SALES_HALL_APPROVAL_V1',approvalMaxBytes:67108864,approvalMaxRecords:250000,location:'SOURCE_HASH_AND_IMMUTABLE_IMPORT_AUDIT',originalConflictsRetained:true,captureComparedAtIntake:true,readbackNeverRefreshesCapture:true},
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,
  activationGaps:[
   'AUTHORIZED_ISOLATED_POSTGRES_INSTALL_IMPORT_READBACK_ROLLBACK_AND_REPLAY',
   'INDEPENDENT_FULL_SUCCESSOR_CATALOG_SCHEMA_ACL_AND_ROUTINE_REVIEW',
   'VERSIONED_INSTALLED_RECORD_AND_RUNTIME_CAPABILITY_SUCCESSOR',
   'PUBLISHED_DOCUMENT_INVENTORY_ANCHOR_READER_REQUIRES_EXPLICIT_SUCCESSOR_PIN',
   'RUNTIME_MIGRATION_ORIGIN_READBACK_AND_HALL_SCOPE_ENGINE_ACCEPTANCE',
  ],
 }};
}
export async function renderWholeSalesHallCandidate(root){
 const source=await loadFresh35RetirementSource(root),prior=await renderWholeExplicitZeroCandidate(root);
 return compileWholeSalesHallCandidate(source,prior,await readFile(resolve(root,HISTORICAL_SALES_HALL_SQL_PIN.path),'utf8'));
}
