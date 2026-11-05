import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementSource} from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
import {renderWholeExplicitZeroCandidate} from '../scripts/release/unified-install/whole-explicit-zero-integration-candidate.mjs';
import {compileWholeSalesHallCandidate,HISTORICAL_SALES_HALL_SQL_PIN} from '../scripts/release/unified-install/whole-sales-hall-integration-candidate.mjs';
const root=resolve(import.meta.dirname,'..'),hash=s=>createHash('sha256').update(s).digest('hex');
const [source,prior,patch]=await Promise.all([loadFresh35RetirementSource(root),renderWholeExplicitZeroCandidate(root),readFile(resolve(root,HISTORICAL_SALES_HALL_SQL_PIN.path),'utf8')]);
const candidate=compileWholeSalesHallCandidate(source,prior,patch);
const ordinary=candidate.changedBodies.find(r=>r.signature==='naijue_erp.guard_unified_document()').body;
const legacy=candidate.changedBodies.find(r=>r.signature==='naijue_erp.guard_history_insert()').body;
test('offline composition keeps 174 of 178 exact routine bodies and all dependency/actor pins unchanged',()=>{
 assert.equal(candidate.manifest.successorRoutinePins.length,178);
 assert.equal(candidate.manifest.successorRoutinePins.filter(r=>source.routines.some(p=>p.signature===r.signature&&p.sha256===r.sha256)).length,174);
 assert.deepEqual(candidate.manifest.routineChanges.map(r=>r.signature),['naijue_erp.guard_unified_document()','naijue_erp.guard_history_insert()','naijue_erp.guard_header_native_reference_publication()','naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)']);
 for(const dep of candidate.manifest.unchangedDependencies)assert.equal(candidate.manifest.successorRoutinePins.find(p=>p.signature===dep.signature)?.sha256,dep.sha256);
 assert.equal(hash(patch),HISTORICAL_SALES_HALL_SQL_PIN.sha256);
});
test('offline source drift and unsupported predecessor fail before any engine or activation',()=>{
 assert.throws(()=>compileWholeSalesHallCandidate(source,prior,patch+'\n'),/SALES_HALL_SOURCE_DIFFERS/);
 const changed={...source,routines:source.routines.map(r=>r.name==='guard_unified_document'?{...r,sha256:'0'.repeat(64)}:r)};
 assert.throws(()=>compileWholeSalesHallCandidate(changed,prior,patch),/SALES_HALL_PREDECESSOR_DIFFERS/);
 const unsafe={...source,routines:source.routines.map(r=>r.name==='assert_unified_current_actor'?{...r,sha256:'0'.repeat(64)}:r)};
 assert.throws(()=>compileWholeSalesHallCandidate(unsafe,prior,patch),/SALES_HALL_DEPENDENCY_DIFFERS/);
 assert.equal(candidate.manifest.engineVerified,false);assert.equal(candidate.manifest.installationReady,false);
 assert.equal(candidate.manifest.targetAdmitted,false);assert.equal(candidate.manifest.activeProfilesChanged,false);
 assert(candidate.sql.indexOf("RAISE EXCEPTION 'HISTORICAL_SALES_HALL_REVIEW_ONLY'")<candidate.sql.indexOf('DO $historical_sales_hall$'));
});
test('ordinary historical exceptions require exact source, fixed historical root, and original migration proof',()=>{
 for(const fragment of ["s.import_batch_id=NEW.import_batch_id","s.target_type='SALES_HEADER'","s.source_entity_type='SALES_HEADER'",
  "b.mapping_version='DOCUMENT_CONVERSION_V1'","naijue_erp.standard_import_record_proof(source_record)",
  "source_audit->'whole_package_v2'->>'root_operation'","schema_declarations_sha256'='89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e'",
  "naijue_erp.standard_import_row_intent('SALES_HEADER',n)","source_proof->'current_operation'='true'::jsonb",
  "r.action='MIGRATE_DOCUMENT'","original_receipt->>'status'='COMMITTED'","original_audit->'after_values'->>'sourceRecordId'=source_record::text",
  "original_receipt->'result_data'->>'exposureDigest'","NEW.hall_id IS NOT DISTINCT FROM OLD.hall_id",
  "NEW.warehouse_id IS NOT DISTINCT FROM OLD.warehouse_id","original_header->'hall_id' IS NOT DISTINCT FROM o->'hall_id'",
  "original_header->'warehouse_id' IS NOT DISTINCT FROM o->'warehouse_id'"])assert(ordinary.includes(fragment),fragment);
});
test('new and changed business pairs stay nonnull enabled same-hall; original guards and authorization remain intact',()=>{
 for(const fragment of ["IF retained_hall IS NOT TRUE THEN","NEW.hall_id IS NULL","id=NEW.hall_id AND enabled",
  "id=NEW.warehouse_id AND enabled AND hall_id=NEW.hall_id","NEW.stock_basis<>'RUNTIME_LEDGER'",
  "ordinary document immutable origin, status or version mismatch","posting actions cannot edit ordinary business facts",
  "STANDARD_DOCUMENT_PUBLICATION_REQUIRED_FOR_ALL_COMMANDS"])assert(ordinary.includes(fragment),fragment);
 const actor=source.routines.find(r=>r.name==='assert_unified_current_actor');
 assert(actor.body.includes('actor.hall_id IS DISTINCT FROM target_hall'));
 assert.equal(candidate.manifest.routineChanges.some(r=>r.signature===actor.signature),false);
});
test('legacy inference is explicit and source-only absent inference still requires exact blank/null and original binding',()=>{
 for(const fragment of ["jsonb_typeof(source.normalized_fields->'所属厅来源编号') IS DISTINCT FROM 'string'",
  "source.normalized_fields->>'所属厅来源编号'='' AND NEW.hall_id IS NOT NULL",
  "source.normalized_fields->>'所属厅来源编号'<>'' AND (NEW.hall_id IS NULL",
  "ref.batch_id=NEW.batch_id","ref.entity_type='HALL'","ref.source_key=source.normalized_fields->>'所属厅来源编号'",
  "ref.native_hall_id=NEW.hall_id"])assert(legacy.includes(fragment),fragment);
 assert(!/NEW\.hall_id\s*:=|UPDATE naijue_erp\.hall|INSERT INTO naijue_erp\.hall/.test(patch));
});
test('DDL changes only two hall nullabilities and compares all other columns, constraints, triggers, indexes, ACLs',()=>{
 assert.deepEqual(candidate.manifest.columnChanges.map(c=>c.table),['naijue_erp.history_sales_header','naijue_erp.sales_header']);
 for(const fragment of ['before_meta IS DISTINCT FROM after_meta','before_columns IS DISTINCT FROM after_columns',
  'before_constraints IS DISTINCT FROM after_constraints','before_triggers IS DISTINCT FROM after_triggers',
  'before_indexes IS DISTINCT FROM after_indexes','before_relation IS DISTINCT FROM after_relation',
  "ALTER TABLE %s ALTER COLUMN hall_id DROP NOT NULL","c.confrelid='naijue_erp.hall'::regclass AND c.convalidated"])
  assert(patch.includes(fragment),fragment);
 assert(!/\b(?:CREATE TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|DROP TABLE|TRUNCATE |DELETE FROM|UPDATE naijue_erp\.)/.test(patch));
 assert.equal(candidate.manifest.permissionsChanged,false);
});

test('historical approval is independently byte-pinned, bounded, unique, and kept separate from native fields',()=>{
 const command=candidate.changedBodies.find(r=>r.signature.startsWith('naijue_erp.standard_whole_package_command_v2(')).body;
 for(const fragment of ["historical_hall_approval","IS JSON OBJECT WITH UNIQUE KEYS","BETWEEN 1 AND 67108864",
  "NOT BETWEEN 1 AND 250000","count(DISTINCT value->>'target_id')","count(DISTINCT value->>'source_key')",
  "HISTORICAL_SALES_HALL_APPROVAL_V1","HISTORICAL_HALL_APPROVAL_MEMBERSHIP",
  "hall_approved:=hall_approvals->(entry->>'target_id')","(hall_approved->'source_refs') @> (entry->'source_refs')",
  "(entry->'source_refs') @> (hall_approved->'source_refs')","count(DISTINCT ref)",
  "fields->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id'","fields->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id'"])
  assert(command.includes(fragment),fragment);
 assert(command.indexOf("SELECT jsonb_object_agg(value->>'target_id',value) INTO hall_approvals")<command.indexOf("FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows') LOOP"));
 assert(command.includes("parsed:=parsed||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence')"));
 assert(command.includes("item:=item||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence')"));
 assert(!command.includes("fields:=fields||jsonb_build_object('historical_hall_evidence'"));
});
test('capture is validated at intake and retained as immutable source evidence without silent reselection',()=>{
 const command=candidate.changedBodies.find(r=>r.signature.startsWith('naijue_erp.standard_whole_package_command_v2(')).body;
 for(const body of [command,legacy])for(const fragment of ["HISTORICAL_HALL_CAPTURE_CHANGED","w.version=(hall_evidence->>'warehouse_version')::integer",
  "to_jsonb(w.hall_id) IS NOT DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture'","HISTORICAL_HALL_EVIDENCE_CONTRADICTION",
  "'ORIGINAL'","'MIGRATION_DERIVED'","'PENDING_REVIEW'","'has_difference'","'review_required'"])assert(body.includes(fragment),fragment);
 assert(ordinary.includes("source_proof->'historical_hall_evidence'->'selected_hall_id' IS NOT DISTINCT FROM n->'hall_id'"));
 assert(!/SET\s+hall_id|NEW\.hall_id\s*:=|fields\s*:=.*warehouse_hall/.test(patch));
});
test('legacy publication admits derived hall only with same target source evidence; all other reference checks remain',()=>{
 const publication=candidate.changedBodies.find(r=>r.signature==='naijue_erp.guard_header_native_reference_publication()').body;
 for(const fragment of ["AND NOT coalesce((v.field='所属厅来源编号'","s.normalized_fields->>'所属厅来源编号'=''",
  "->>'basis'='MIGRATION_DERIVED'","->'selected_hall_id'=to_jsonb(h.hall_id)","->'warehouse_id'=to_jsonb(h.warehouse_id)",
  "->'warehouse_hall_id_at_capture'=to_jsonb(h.hall_id)),false)","r.batch_id=NEW.id","r.entity_type=v.entity","r.source_key=s.normalized_fields->>v.field"])
  assert(publication.includes(fragment),fragment);
 assert(!publication.includes('coalesce(h.hall_id,w.hall_id)'));
});

test('shared synthetic evidence model retains conflicting original, derived attribution, and pending review distinctly (not an engine test)',async()=>{
 const {buildHistoricalSalesHallEvidence,parseHistoricalSalesHallEvidence}=await import('../packages/application/src/historical-sales-hall-evidence.ts');
 const id=n=>`00000000-0000-0000-0000-${n.toString(16).padStart(12,'0')}`;
 const capture={warehouseId:id(5),warehouseHallId:id(2),warehouseVersion:3,capturedAt:'2026-11-05T02:36:00Z'};
 const inferred=buildHistoricalSalesHallEvidence({...capture,originalHallId:null});
 assert.equal(inferred.basis,'MIGRATION_DERIVED');assert.equal(inferred.selected_hall_id,id(2));assert.equal(inferred.original_hall_id,null);
 const conflict=buildHistoricalSalesHallEvidence({...capture,originalHallId:id(1)});
 assert.equal(conflict.basis,'ORIGINAL');assert.equal(conflict.selected_hall_id,id(1));assert.equal(conflict.warehouse_hall_id_at_capture,id(2));assert.equal(conflict.has_difference,true);assert.equal(conflict.review_required,true);
 const pending=buildHistoricalSalesHallEvidence({warehouseId:id(5),warehouseHallId:null,warehouseVersion:null,capturedAt:null,originalHallId:null});
 assert.equal(pending.basis,'PENDING_REVIEW');assert.equal(pending.selected_hall_id,null);assert.equal(pending.review_required,true);
 for(const bad of [{...inferred,original_hall_id:id(1)},{...conflict,selected_hall_id:id(2)},{...pending,review_required:false},{...inferred,warehouse_version:null}])assert.throws(()=>parseHistoricalSalesHallEvidence(bad));
});
