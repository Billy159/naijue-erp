/** A+B source candidate only. Does not alter existing install/catalog profiles,
 * publish a record, open a client or authorize a target. The old exact35 record
 * remains a predecessor; these 154 routines require a distinct successor catalog. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from './fresh35-retirement-plan.mjs';
import {loadFresh35SalesHallCandidate} from './fresh35-sales-hall-candidate.mjs';
import {loadFresh35HistoricalAmountCandidate} from './fresh35-historical-amount-candidate.mjs';
import {loadFresh35HistoricalSettlementCandidate} from './fresh35-historical-settlement-candidate.mjs';
import {loadFresh35HistoricalSettlementDifferenceCandidate} from './fresh35-historical-settlement-difference-candidate.mjs';
import {applyRetirementSourceReplacement,normalizeRetirementSignature as normalize,findLegacyRoutineReferences} from './fresh35-retirement-source.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(v,code)=>{if(!v)throw Error('FRESH35_ADMIN_PROVISION_'+code);};
const modulePath='scripts/release/unified-install/fresh35-admin-provision-candidate.mjs';
const patchPath='adapters/postgres/patches/0036_admin_provision_only_successor.sql';
const compilerPath='tools/unified-import/first-admin-setup.mjs';
const loadedModuleSha256=hash(await readFile(new URL(import.meta.url)));
const changedNames=['standard_whole_package_command_v2','standard_whole_package_inspect_v2','assert_standard_import_operation','standard_whole_package_verify_v2'];
const added=[
 {name:'standard_admin_provision_proof_v1',signature:'naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean)',acl:[]},
 {name:'standard_admin_provision_only_v1',signature:'naijue_erp.standard_admin_provision_only_v1(jsonb,text)',acl:[{role:'erp_unified27_initializer_2393dbc6db9581c2',privilege:'EXECUTE',grantable:false}]},
];
export function compileFresh35AdminProvisionCandidate(predecessors,patchSql){
 need(Array.isArray(predecessors)&&predecessors.length===152,'EXACT152_PREDECESSOR_REQUIRED');
 const parts=patchSql.split('$admin_continuation_changes$');need(parts.length===3,'EXACT_SUCCESSOR_PAYLOAD_REQUIRED');
 const specs=JSON.parse(parts[1]);
 need(specs.length===4&&new Set(specs.map(s=>normalize(s.signature))).size===4
  &&specs.every(s=>changedNames.includes(s.signature.slice('naijue_erp.'.length,s.signature.indexOf('(')))),'EXACT_FOUR_CLASSES_REQUIRED');
 const changedBodies=specs.map(spec=>{
  const old=predecessors.find(r=>normalize(r.signature)===normalize(spec.signature));need(old,'PREDECESSOR_ROUTINE_MISSING');
  const body=applyRetirementSourceReplacement(old.body,spec);
  need(findLegacyRoutineReferences(body).length===0,'RETIRED_REFERENCE');
  return {signature:old.signature,body,sha256:hash(body)};
 });
 const newRoutines=added.map(spec=>{
  const start=patchSql.indexOf('CREATE FUNCTION naijue_erp.'+spec.name+'(');
  need(start>=0,'NEW_ROUTINE_MISSING');
  const bodyStart=patchSql.indexOf(' AS $$',start)+6,end=patchSql.indexOf('END $$;',bodyStart);
  need(bodyStart>start&&end>bodyStart,'NEW_ROUTINE_DEFINITION_INVALID');
  const definition=patchSql.slice(start,end+7),body=patchSql.slice(bodyStart,end+4);
  need(definition.includes('LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone=\'UTC\''),'NEW_ROUTINE_METADATA_INVALID');
  need(findLegacyRoutineReferences(body).length===0,'NEW_ROUTINE_RETIRED_REFERENCE');
  return {...spec,body,definition,sha256:hash(body),securityDefiner:true,owner:'SCHEMA_OWNER',searchPath:'pg_catalog, naijue_erp, pg_temp',timeZone:'UTC'};
 });
 need((patchSql.match(/^CREATE FUNCTION /gm)||[]).length===2,'EXACT_TWO_NEW_ROUTINES_REQUIRED');
 need((patchSql.match(/^GRANT /gm)||[]).length===1&&patchSql.includes('GRANT EXECUTE ON FUNCTION naijue_erp.standard_admin_provision_only_v1(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;'),'EXACT_EXECUTE_REQUIRED');
 const stripped=patchSql.replace(/^--.*$/gm,'');
 need(!/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|ALTER ROLE|DISABLE TRIGGER|DROP |TRUNCATE |DELETE FROM)\b/i.test(stripped),'UNEXPECTED_SCHEMA_MUTATION');
 need((patchSql.match(/^BEGIN;$/gm)||[]).length===1&&(patchSql.match(/^COMMIT;$/gm)||[]).length===1&&patchSql.endsWith('COMMIT;\n'),'ATOMIC_SUCCESSOR_REQUIRED');
 const pins=predecessors.map(r=>({signature:r.signature,sha256:changedBodies.find(c=>normalize(c.signature)===normalize(r.signature))?.sha256??r.sha256}));
 const reviewSql=patchSql.replace(/^BEGIN;$/m,"BEGIN;\nDO $admin_review_only$ BEGIN RAISE EXCEPTION 'FRESH35_ADMIN_PROVISION_REVIEW_ONLY' USING ERRCODE='55000'; END $admin_review_only$;");
 return {patchSql,reviewSql,specs,changedBodies,newRoutines,predecessorBodies:predecessors.filter(r=>specs.some(s=>normalize(s.signature)===normalize(r.signature))),manifest:{
  format:'FRESH35_ADMIN_PROVISION_AND_FIRST_BUSINESS_IMPORT_SOURCE_CANDIDATE_V1',
  patchSqlSha256:hash(patchSql),reviewSqlSha256:hash(reviewSql),tableCount:35,newTables:0,newColumns:0,columnChanges:[],constraintChanges:[],triggerChanges:[],
  predecessorRoutineCount:152,routineCount:154,newRoutines:2,
  routineChanges:specs.map(s=>({signature:s.signature,before:s.predecessor_sha256,after:s.successor_sha256})),
  successorRoutinePins:[...pins,...newRoutines.map(r=>({signature:r.signature,sha256:r.sha256}))],
  permissionChanges:newRoutines.map(r=>({signature:r.signature,owner:r.owner,publicExecute:false,acl:r.acl})),permissionsChanged:true,
  maintenanceActionsUnchanged:true,receiptAndAuditChecksUnchanged:true,tablePrivilegesChanged:false,
  provisioning:{mode:'ADMIN_PROVISION_ONLY',staff:1,accounts:1,receiptKind:'STAFF',action:'CREATE',linkedCredentialEvent:'CREATE',importBatches:0,inventoryKeys:0,namespacePublication:false},
  firstBusinessImport:{mode:'PROVISIONED_ADMIN_EMPTY_BUSINESS',originalNewEmptyUnchanged:true,requiresExactProvisioningReceipt:true,realSourceValidationUnchanged:true,fullWholeTransactionRequired:true,overwritesProvisionedAdmin:false},
  sourceOnly:true,engineVerified:false,installationReady:false,targetAdmitted:false,activeProfilesChanged:false,
  installationRecordHandling:'PRESERVE_PREDECESSOR_RECORD; REQUIRE_SEPARATE_SUCCESSOR_CATALOG_AND_AUTHORITY',
 }};
}
export async function loadFresh35AdminProvisionCandidate(root){
 need(hash(await readFile(resolve(root,modulePath)))===loadedModuleSha256,'RUNNING_MODULE_SOURCE_DIFFERS');
 const base=await loadFresh35RetirementPlan(root),routines=new Map(base.retainedRoutines.map(r=>[normalize(r.signature),r]));
 let last;
 for(const load of [loadFresh35SalesHallCandidate,loadFresh35HistoricalAmountCandidate,loadFresh35HistoricalSettlementCandidate,loadFresh35HistoricalSettlementDifferenceCandidate]){
  last=await load(root);for(const r of last.changedBodies)routines.set(normalize(r.signature),r);
 }
 const candidate=compileFresh35AdminProvisionCandidate([...routines.values()],await readFile(resolve(root,patchPath),'utf8'));
 const sourcePins=new Map(last.manifest.sourcePins.map(p=>[p.path,p]));
 for(const path of [patchPath,modulePath,compilerPath])sourcePins.set(path,{path,sha256:hash(await readFile(resolve(root,path)))});
 candidate.manifest.sourcePins=[...sourcePins.values()].sort((a,b)=>a.path.localeCompare(b.path));
 candidate.manifest.predecessorSourceSetSha256=last.manifest.sourceSetSha256;
 candidate.manifest.sourceSetSha256=hash(JSON.stringify(candidate.manifest.sourcePins));
 return candidate;
}
