import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadFresh35RetirementPlan} from '../scripts/release/unified-install/fresh35-retirement-plan.mjs';
import {findLegacyRoutineReferences} from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
import {compileFresh35SalesHallCandidate,loadFresh35SalesHallCandidate,FRESH35_SALES_HALL_SQL_PIN} from '../scripts/release/unified-install/fresh35-sales-hall-candidate.mjs';
import {HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
const root=resolve(import.meta.dirname,'..'),hash=v=>createHash('sha256').update(v).digest('hex');
const [plan,patch]=await Promise.all([loadFresh35RetirementPlan(root),readFile(resolve(root,FRESH35_SALES_HALL_SQL_PIN.path),'utf8')]);
const c=compileFresh35SalesHallCandidate(plan,patch),ordinary=c.changedBodies.find(r=>r.signature==='naijue_erp.guard_unified_document()').body;
const command=c.changedBodies.find(r=>r.signature.startsWith('naijue_erp.standard_whole_package_command_v2(')).body;
const profile='f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66';
test('fresh35 delta has only two exact retained routine changes, one nullable column and no legacy dependencies',()=>{
 assert.equal(c.manifest.tableCount,35);assert.equal(c.manifest.routineCount,152);
 assert.deepEqual(c.manifest.routineChanges.map(p=>p.signature),['naijue_erp.guard_unified_document()','naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)']);
 assert.equal(c.manifest.successorRoutinePins.filter(p=>plan.retainedRoutines.some(r=>r.signature===p.signature&&r.sha256===p.sha256)).length,150);
 assert.deepEqual(c.manifest.columnChanges,[{table:'naijue_erp.sales_header',column:'hall_id',type:'uuid',beforeNullable:false,afterNullable:true}]);
 assert.deepEqual(findLegacyRoutineReferences(patch),[]);
 assert(!patch.includes('naijue_erp.history_sales_header'));assert(!patch.includes('guard_history_insert'));
 assert(!patch.includes('guard_header_native_reference_publication'));
 for(const n of ['newTables','newColumns','newRoutines','newHalls'])assert.equal(c.manifest[n],0);
});
test('the SQL itself refuses non35 tables/routine cohorts before locking or modifying the retained sales header',()=>{
 assert(patch.indexOf('SALES_HALL_EXACT35_PREDECESSOR_REQUIRED')<patch.indexOf('LOCK TABLE'));
 assert(patch.includes("AND c.relkind IN ('r','p')"));assert(patch.includes("prokind IN ('f','p'))<>152"));
 assert(patch.includes('LOCK TABLE naijue_erp.sales_header IN ACCESS EXCLUSIVE MODE;'));
 assert.equal((patch.match(/ALTER TABLE %s ALTER COLUMN hall_id DROP NOT NULL/g)||[]).length,1);
 for(const clause of ['before_meta IS DISTINCT FROM after_meta','before_constraints IS DISTINCT FROM after_constraints','before_triggers IS DISTINCT FROM after_triggers','before_indexes IS DISTINCT FROM after_indexes','before_relation IS DISTINCT FROM after_relation'])assert(patch.includes(clause));
});
test('source drift and caller-constructed plans fail without changing any old loader or installation gate',()=>{
 assert.throws(()=>compileFresh35SalesHallCandidate(plan,patch+'\n'),/PATCH_SOURCE_DIFFERS/);
 assert.throws(()=>compileFresh35SalesHallCandidate({...plan},patch),/GENUINE_RETIREMENT_PLAN_REQUIRED/);
 assert.equal(hash(patch),FRESH35_SALES_HALL_SQL_PIN.sha256);
 assert.equal(c.manifest.sourceOnly,true);assert.equal(c.manifest.engineVerified,false);assert.equal(c.manifest.installationReady,false);assert.equal(c.manifest.targetAdmitted,false);
 assert(c.reviewSql.includes("RAISE EXCEPTION 'FRESH35_SALES_HALL_REVIEW_ONLY'"));
 assert(!c.patchSql.includes("RAISE EXCEPTION 'FRESH35_SALES_HALL_REVIEW_ONLY'"));
 assert(!c.patchSql.includes('FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'));
});
test('new profile is explicit and requires separately pinned complete approval coverage; old profile cannot carry new evidence',()=>{
 assert.equal(HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,profile);
 assert(command.includes(`IF payload->>'schema_declarations_sha256'='${profile}' AND NOT(payload ? 'historical_hall_approval')`));
 assert(command.includes(`IF payload->>'schema_declarations_sha256' IS DISTINCT FROM '${profile}'`));
 assert(command.includes("jsonb_array_length(hall_approval->'records')::numeric IS DISTINCT FROM (payload->'expected_documents'->>'SALES_HEADER')::numeric"));
 assert(command.includes("kind='SALES_HEADER' AND cfg ? 'historical_hall_approval' AND NOT(entry ? 'historical_hall_evidence')"));
 assert(command.includes("hall_approved:=hall_approvals->(entry->>'target_id')"));
 assert(command.includes('HISTORICAL_HALL_APPROVAL_MEMBERSHIP'));
 assert(ordinary.includes(`->>'schema_declarations_sha256'='${profile}'`));
 assert(!ordinary.includes('89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e'));
});
test('new profile inherits only the existing exact source declaration cohorts, not permissions or runtime exemptions',()=>{
 assert(command.includes(`'89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','${profile}'`));
 assert.equal(c.manifest.permissionsChanged,false);
 const actor=plan.retainedRoutines.find(r=>r.name==='assert_unified_current_actor');
 assert.equal(c.manifest.successorRoutinePins.find(r=>r.signature===actor.signature).sha256,actor.sha256);
 assert(actor.body.includes('actor.hall_id IS DISTINCT FROM target_hall'));
 assert(ordinary.includes('SALES_CURRENT_HALL_REQUIRED'));assert(ordinary.includes('SALES_CURRENT_WAREHOUSE_HALL_MISMATCH'));
});
test('historical exceptions need exact provenance and unchanged pair; changing current hall/warehouse returns to ordinary rules',()=>{
 for(const v of ["NEW.hall_id IS NOT DISTINCT FROM OLD.hall_id","NEW.warehouse_id IS NOT DISTINCT FROM OLD.warehouse_id",
  "source_proof:=naijue_erp.standard_import_record_proof(source_record)","naijue_erp.standard_import_row_intent('SALES_HEADER',n)","r.action='MIGRATE_DOCUMENT'",
  "original_audit->'after_values'->>'sourceRecordId'=source_record::text","original_receipt->'result_data'->>'exposureDigest'",
  "original_header->'hall_id' IS NOT DISTINCT FROM o->'hall_id'","original_header->'warehouse_id' IS NOT DISTINCT FROM o->'warehouse_id'",
  "IF retained_hall IS NOT TRUE THEN","id=NEW.warehouse_id AND enabled AND hall_id=NEW.hall_id"])
  assert(ordinary.includes(v),v);
 assert(!/NEW\.hall_id\s*:=|UPDATE naijue_erp\.hall|INSERT INTO naijue_erp\.hall/.test(patch));
});
test('approval is bounded, hash-pinned, duplicate-free and indexed once per chunk; evidence enters source hash and immutable audit records',()=>{
 for(const v of ['BETWEEN 1 AND 67108864','NOT BETWEEN 1 AND 250000','IS JSON OBJECT WITH UNIQUE KEYS',
  "count(DISTINCT value->>'target_id')","count(DISTINCT value->>'source_key')","count(DISTINCT ref)",
  "(hall_approved->'source_refs') @> (entry->'source_refs')","(entry->'source_refs') @> (hall_approved->'source_refs')",
  "parsed:=parsed||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence')",
  "item:=item||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence')"])
  assert(command.includes(v),v);
 assert(command.indexOf('SELECT jsonb_object_agg')<command.indexOf("FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows')"));
 assert(!command.includes("fields:=fields||jsonb_build_object('historical_hall_evidence'"));
});
test('source evidence preserves original conflicts and pending state, and verifies the warehouse capture only on intake',()=>{
 for(const v of ["'ORIGINAL'","'MIGRATION_DERIVED'","'PENDING_REVIEW'","'has_difference'","'review_required'",
  "HISTORICAL_HALL_EVIDENCE_CONTRADICTION","HISTORICAL_HALL_CAPTURE_CHANGED","w.version=(hall_evidence->>'warehouse_version')::integer",
  "to_jsonb(w.hall_id) IS NOT DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture'"])
  assert(command.includes(v),v);
 assert(!ordinary.includes('warehouse_hall_id_at_capture'));
});
test('public loader exposes patch-only composition plus exact changed bodies, final152 pins and current source pins without evidence admission',async()=>{
 const loaded=await loadFresh35SalesHallCandidate(root);
 assert.equal(loaded.patchSql,patch);assert.equal(loaded.changedBodies.length,2);assert.equal(loaded.manifest.successorRoutinePins.length,152);
 assert(loaded.manifest.sourcePins.some(p=>p.path==='scripts/release/unified-install/fresh35-sales-hall-candidate.mjs'));
 assert(loaded.manifest.sourcePins.some(p=>p.path==='packages/application/src/unified-historical-sales-hall-evidence.ts'));
 for(const name of ['unified-import-source-reconciliation','unified-current-effective-alignment','unified-historical-line-amount-evidence'])assert(loaded.manifest.sourcePins.some(p=>p.path==='packages/application/src/'+name+'.ts'));
 assert.equal(loaded.manifest.priorCapturedEvidenceAdmitted,false);
 assert.equal(loaded.manifest.sourceSetSha256,hash(JSON.stringify(loaded.manifest.sourcePins)));
 assert(loaded.manifest.activationGaps.includes('CURRENT_SOURCE_DELTAS_MUST_NOT_REUSE_OLD_CAPTURE_PROVENANCE'));
});
