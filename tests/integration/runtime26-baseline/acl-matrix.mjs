/** Explicit candidate cells, not a guessed grant policy. Unknown is neither
 * allow nor deny. No target catalog, report counts or local role supplies policy. */
import {SHA,assertSourceInventory} from './source-inventory.mjs';
const COLUMNS=['SELECT','INSERT','UPDATE','REFERENCES'];
const TABLES=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
const SEQUENCES=['SELECT','USAGE','UPDATE'];
const basis=(path,lines,meaning)=>({path,lines,meaning});
const v6=basis('scripts/release/prepare-runtime26-v6.mjs','14,32,36-42','Qualified V5→V6 delta and explicit no-table-privilege prerequisites; NOT a complete initial ACL matrix');
const v7=basis('scripts/release/prepare-runtime26-v7.mjs','55','Exact balance-pair SELECT/INSERT delta after qualified V6');
const v8=basis('scripts/release/prepare-runtime26-v8.mjs','43-44','Two cmin SELECT plus three specific table DELETE after qualified V7');
const prep=basis('adapters/postgres/src/native-import-accounting-capability.ts','636-647','Exact PREPARATION13 xmin observation, not full initial user-column grants');
export function createAclCandidate(inventory,profile='V6'){
 assertSourceInventory(inventory);
 const selected=inventory.profiles[profile];if(!selected)throw Error('CLOSED_PROFILE_REQUIRED');
 const cells=[];const add=row=>cells.push({grantor:'OWNER_ROLE',grantable:'UNDETERMINED',decision:'UNDETERMINED',basis:[],...row});
 for(const role of ['ORDINARY_ROLE','PREPARATION_ROLE'])for(const table of selected.schema.tables){
  for(const column of table.columns)for(const privilege of COLUMNS){
   let decision='UNDETERMINED',evidence=[];
   if(role==='ORDINARY_ROLE'&&table.name==='history_revision'&&inventory.knownAcl.historyRevisionReadColumns.includes(column.name)&&privilege==='SELECT'){decision='SOURCE_EXPLICIT_ALLOW';evidence=[v6];}
   if(role==='ORDINARY_ROLE'&&profile!=='V6'&&table.name==='inventory_ledger'&&['quantity_before','quantity_after'].includes(column.name)&&['SELECT','INSERT'].includes(privilege)){decision='SOURCE_EXPLICIT_ALLOW';evidence=[v7];}
   add({role,objectKind:'COLUMN',table:table.name,column:column.name,privilege,decision,basis:evidence,declaration:column.source,columnState:'DECLARED_SOURCE_CANDIDATE_NOT_PG_PARSED',...(decision==='SOURCE_EXPLICIT_ALLOW'?{grantable:false}:{})});
  }
  for(const privilege of TABLES){
   // This is a known ordinary-profile prerequisite, not a guessed default for
   // the separately constrained preparation role.
   const known=role==='ORDINARY_ROLE',allowed=known&&['V8','HISTORY'].includes(profile)&&privilege==='DELETE'&&inventory.knownAcl.normalDeleteTables.includes(table.name);
   add({role,objectKind:'TABLE',table:table.name,privilege,decision:known?allowed?'SOURCE_EXPLICIT_ALLOW':'SOURCE_EXPLICIT_DENY':'UNDETERMINED',grantable:known?false:'UNDETERMINED',basis:known?[allowed?v8:v6]:[]});
  }
 }
 for(const role of ['ORDINARY_ROLE','PREPARATION_ROLE']){
  const known=role==='ORDINARY_ROLE'?inventory.knownAcl.ordinaryV6XminTables:inventory.knownAcl.preparation13XminTables;
  for(const table of selected.schema.tables)for(const column of ['xmin','cmin'])for(const privilege of COLUMNS){
   const allow=privilege==='SELECT'&&(column==='xmin'&&known.includes(table.name)||role==='ORDINARY_ROLE'&&['V8','HISTORY'].includes(profile)&&column==='cmin'&&inventory.knownAcl.categoryCminTables.includes(table.name));
   // PREPARATION13 is an xmin observation only, not the ordinary renderer's
   // all-system-column denial guard. Do not turn that floor into cmin policy.
   const resolved=role==='ORDINARY_ROLE'||column==='xmin'&&(privilege==='SELECT'||known.includes(table.name));
   add({role,objectKind:'SYSTEM_COLUMN',table:table.name,column,privilege,decision:resolved?allow?'SOURCE_EXPLICIT_ALLOW':'SOURCE_EXPLICIT_DENY':'UNDETERMINED',grantable:resolved?false:'UNDETERMINED',basis:[column==='cmin'&&role==='ORDINARY_ROLE'?v8:role==='ORDINARY_ROLE'?v6:prep]});
  }
  for(const routine of selected.routines)add({role,objectKind:'FUNCTION',routine:routine.declarationSignature,argumentsSource:routine.argumentsSource,bodySha256:routine.bodySha256,privilege:'EXECUTE',declaration:routine.source,decision:'UNDETERMINED',requiredDecision:'EXACT_EXECUTE_GRANTEE_GRANTOR_AND_GRANT_OPTION; name/body alone does not authorize execution'});
  for(const sequence of selected.schema.sequences)for(const privilege of SEQUENCES)add({role,objectKind:'SEQUENCE',sequence:sequence.name,privilege,decision:'UNDETERMINED',declaration:sequence.source,basis:[basis(sequence.source.path,String(sequence.source.line),'Sequence declaration is not authority to grant runtime sequence privileges')],requiredDecision:'ORDINARY_SEQUENCE_RIGHTS_CANNOT_USE_PREPARATION_ZERO_SEQUENCE_COUNT'});
 }
 const publicException='is_native_party_import_insert';
 for(const routine of selected.routines)add({role:'PUBLIC',grantor:'OWNER_ROLE',objectKind:'FUNCTION',routine:routine.name===publicException?'naijue_erp.is_native_party_import_insert(text,jsonb)':routine.declarationSignature,bodySha256:routine.bodySha256,privilege:'EXECUTE',decision:routine.name===publicException?'SOURCE_EXPLICIT_ALLOW':'UNDETERMINED',grantable:routine.name===publicException?false:'UNDETERMINED',basis:routine.name===publicException?[basis('adapters/postgres/migrations/0013_native_party_import.sql','143','Intentional pinned PUBLIC EXECUTE helper exception; never blanket REVOKE it')]:[],requiredDecision:routine.name===publicException?null:'REVIEW_DEFAULT_AND_EXPLICIT_FINAL_FUNCTION_ACL; no blanket PUBLIC revoke'});
 const unresolved=cells.filter(c=>c.decision==='UNDETERMINED'||c.grantable==='UNDETERMINED');
 const candidate={format:'DOT_RUNTIME26_ACL_SOURCE_PINNED_CANDIDATE_PHASE1_V1',status:'SOURCE_PINNED_CANDIDATE_NOT_COMPLETE_BASELINE',profile,sourceFingerprint:inventory.sourceFingerprint,columnsAre:'SOURCE_DECLARATIONS_NOT_INSTALLED_POSITIVE_ATTNUM',cells,decisionsRequired:{columnAndFunctionAndSequenceCells:unresolved.length,schemaStatements:selected.schema.unresolved,policies:['Full initial ordinary/preparation positive-attnum column privileges','Private-function canonical signature/EXECUTE/grantor/grantee/grant-option','Four sequence privilege sets, not the old preparation count0','Owner/runtime/preparation role and membership/default-privilege policy','Final source-to-schema resolution of dynamic DDL']},excludedUnwiredModuleTables:[{table:'read_dataset_version',basis:'H01 registers a writer but no migration/patch DDL or active runtime consumer exists; excluded rather than fabricated to reach historical count57'}],publicExceptionPreserved:true};
 return {...candidate,fingerprint:SHA(JSON.stringify(candidate))};
}
export function assertCompleteAclCandidate(candidate){
 if(candidate?.format!=='DOT_RUNTIME26_ACL_SOURCE_PINNED_CANDIDATE_PHASE1_V1'||candidate.status!=='SOURCE_PINNED_CANDIDATE_NOT_COMPLETE_BASELINE')throw Error('SOURCE_PINNED_ACL_CANDIDATE_REQUIRED');
 if(candidate.cells.some(c=>c.decision==='UNDETERMINED'||c.grantable==='UNDETERMINED')||candidate.decisionsRequired.schemaStatements.length||candidate.decisionsRequired.policies.length)
  throw Error('REFUSE_COMPLETE_BASELINE_UNDETERMINED_ACL_OR_SCHEMA');
 // Phase1 has no approval/boolean bypass. A successor implementation must be
 // separately reviewed before any complete-baseline execution path is added.
 throw Error('PHASE1_HAS_NO_COMPLETE_BASELINE_EXECUTION_OR_APPROVAL_PATH');
}
