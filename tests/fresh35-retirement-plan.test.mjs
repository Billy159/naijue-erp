import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadFresh35RetirementPlan } from '../scripts/release/unified-install/fresh35-retirement-plan.mjs';
import { findLegacyRoutineReferences } from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('current178 closes to35 tables and152 routines with19 exact body changes, no old rowtype/caller',async()=>{
 const plan=await loadFresh35RetirementPlan(root);
 assert.equal(plan.predecessorRoutines.length,178);assert.equal(plan.retainedTables.length,35);assert.equal(plan.omittedTables.length,21);
 assert.equal(plan.retainedRoutines.length,152);assert.equal(plan.omittedRoutines.length,26);assert.equal(plan.replacements.length,19);
 assert.equal(plan.foreignKeyReplacements.length,7);
 for(const routine of plan.retainedRoutines)assert.deepEqual(findLegacyRoutineReferences(routine.signature+'\n'+routine.body),[]);
 for(const name of ['standard_whole_package_command_v2','standard_whole_package_closed_v2','validate_sales_settlement','standard_zero_amount_archive_trace','valid_history_counts','guard_retained_settlement_identity','unified_sales_settlement_audit_values','validate_unified_sales_settlement_commit']){
  assert.equal(plan.retainedRoutines.find(r=>r.name===name).bodySha256,plan.predecessorRoutines.find(r=>r.name===name).bodySha256);
 }
 assert.equal(plan.engineDependenciesVerified,false);assert.equal(plan.installationReady,false);assert.equal(plan.existingDatabaseMutationSupported,false);
 assert.ok(Object.isFrozen(plan.retainedRoutines));
});
test('JSON label validation is retained while unqualified, quoted and dynamic relation reads reject',()=>{
 assert.deepEqual(findLegacyRoutineReferences("SELECT value ?& ARRAY['history_sales_header','import_source_row']"),[]);
 for(const text of ['SELECT * FROM import_source_row','SELECT * FROM "naijue_erp"."import_source_row"',"EXECUTE 'SELECT * FROM import_source_row'","SELECT '--'; SELECT * FROM import_source_row",'x naijue_erp.IMPORT_SOURCE_ROW%ROWTYPE',"EXECUTE 'SELECT * FROM \"naijue_erp\".\"import_source_row\"'","EXECUTE format('%I.%I', 'naijue_erp', 'import_source_row')","SELECT 'import_source_row'::regclass"])assert.deepEqual(findLegacyRoutineReferences(text),['import_source_row']);
});
