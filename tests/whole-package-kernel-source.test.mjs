import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=new URL('../adapters/postgres/patches/0027_standard_import_whole_package_v2.sql',import.meta.url);
test('new SQL implements prepare, ordered step, finish and existing-result inspection',()=>{
 const sql=readFileSync(file,'utf8');
 for(const name of ['prepare','step','finish','inspect'])assert.match(sql,new RegExp('FUNCTION naijue_erp.standard_whole_package_'+name+'_v2\\('));
 assert.match(sql,/WHOLE_ROOT_CONTEXT_INVALID/);assert.match(sql,/WHOLE_ORDINAL_INVALID/);assert.match(sql,/WHOLE_PACKAGE_INCOMPLETE/);
 assert.match(sql,/whole_package_v2/);assert.match(sql,/pg_current_xact_id/);assert.match(sql,/session_user/);
});
test('old API retains one mutation and no per-step constraint forcing in new private kernel',()=>{
 const old=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_master_chunks_v2_successor.sql',import.meta.url),'utf8');assert.match(old,/STANDARD_ONE_MUTATION_PER_TRANSACTION/);
 const sql=readFileSync(file,'utf8');const kernel=sql.split('CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_command_v2')[1].split('END $$;')[0];
 assert.doesNotMatch(kernel,/SET CONSTRAINTS ALL IMMEDIATE/);assert.doesNotMatch(kernel,/standard_import_command\(/);
 assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);assert.doesNotMatch(sql,/DISABLE TRIGGER|session_replication_role\s*=|GRANT /i);
});
test('root is server-created and ordinal/phase cannot authorize an unrelated transaction',()=>{
 const sql=readFileSync(file,'utf8');
 for(const required of ['WHOLE_TWO_CAPABILITIES_REQUIRED','WHOLE_REQUEST_BINDING_INVALID','WHOLE_PHASE_ORDER_INVALID','WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED','WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT','WHOLE_RECEIPT_CHAIN_INVALID'])assert.ok(sql.includes(required),required);
 assert.match(sql,/a\.before_values IS DISTINCT FROM previous->/);
 assert.match(sql,/b\.checkpoint IS DISTINCT FROM previous->/);
 assert.match(sql,/last_rank<>6/);
 assert.match(sql,/REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_command_v2\(jsonb,text,text,uuid,integer\) FROM PUBLIC/);
 assert.doesNotMatch(sql,/set_config\(|CREATE TABLE|INSERT INTO naijue_erp.auth_session/);
});
test('eight publication/party guards select exact intent or exact checkpoint without weakening old strictness',()=>{
 const guards=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_guards_v2.sql',import.meta.url),'utf8');
 assert.equal((guards.match(/IF a.after_values \? 'whole_package_v2' THEN PERFORM/g)||[]).length,8);
 assert.equal((guards.match(/object_id=NEW.id AND new_version=\(NEW.checkpoint->>'sequence'\)::integer\+1/g)||[]).length,7);
 assert.match(guards,/exact_item->>'target_type'=kind AND exact_item->>'target_id'=snapshot->>'id'/);
 assert.doesNotMatch(guards,/LIMIT 1|DISABLE TRIGGER|GRANT /);
});
test('new staff schema opt-in does not mutate old row or add a guessed date',()=>{
 const sql=readFileSync(file,'utf8');
 assert.match(sql,/WHOLE_STAFF_DATE_INVALID/);assert.match(sql,/WHOLE_STAFF_SCHEMA_NOT_INSTALLED/);
 assert.match(sql,/AND NOT\(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull/);
 assert.doesNotMatch(sql,/jsonb_set\(fields.*departure_date/);
 assert.match(sql,/ELSIF fields \? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID'/);
});
test('real PG test runner is present without hidden connection or automatic execution',()=>{
 const runner=readFileSync(new URL('./integration/whole-package-sql-atomicity.mjs',import.meta.url),'utf8');
 for(const mode of ['success-and-exact-replay','prepare-only','middle-failure','publish-failure','constraint-failure'])assert.ok(runner.includes(mode));
 assert.match(runner,/assert.notEqual\(writer,observer\)/);assert.match(runner,/another connection must not see a committed prefix/);
 assert.doesNotMatch(runner,/process.env|new Pool|new Client|\.connect\(/);
});
test('canonical SQL table tokens do not depend on database linguistic collation',()=>{
 const sql=readFileSync(file,'utf8');assert.doesNotMatch(sql,/lower\(kind\)/);assert.match(sql,/lower\(kind COLLATE "C"\)/);
});
test('new guard branch also pins canonical table-token case conversion',()=>{
 const guards=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_guards_v2.sql',import.meta.url),'utf8');
 for(const block of guards.matchAll(/STANDARD27_BRANCH_BEGIN([\s\S]*?)STANDARD27_BRANCH_END/g))assert.doesNotMatch(block[1],/lower\(kind\)/);
});
test('installer grants only exact wrappers, never role membership or private helper execution',()=>{
 const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_access_v2.sql',import.meta.url),'utf8');
 assert.match(sql,/standard_whole_package_inspect_v2\(jsonb,text\).*erp_unified27_initializer/s);
 assert.match(sql,/standard_whole_package_step_v2\(uuid,integer,text,jsonb\).*erp_unified27_importer/s);
 assert.equal((sql.match(/^GRANT EXECUTE/gm)||[]).length,2);
 assert.doesNotMatch(sql,/CREATE ROLE|ALTER ROLE|GRANT .* TO .*WITH GRANT OPTION/);
 assert.match(sql,/WHOLE_INSTALL_SOURCE_DIFFERS/);assert.match(sql,/WHOLE_INSTALL_ACL_UNSAFE/);
});
test('new kernel allows unsealed bounded document rows and rejects rows after seal',()=>{const sql=readFileSync(file,'utf8');assert.doesNotMatch(sql,/jsonb_array_length\(payload->'documents'\)<1/);assert.match(sql,/WHOLE_DOCUMENT_ALREADY_SEALED/);const old=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_master_chunks_v2_successor.sql',import.meta.url),'utf8');assert.match(old,/jsonb_array_length\(payload->'documents'\)<1/);});
test('whole row-intent path uses existing exact source target index and one prepared audit',()=>{const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_intent_v2.sql',import.meta.url),'utf8');assert.match(sql,/s.import_batch_id=b.id AND s.target_type=kind/);assert.match(sql,/s.target_id=\(native_row->>'id'\)::uuid/);assert.match(sql,/s.status='IMPORTED'/);assert.match(sql,/standard_import_record_proof\(source_ids\[1\]\)/);assert.match(sql,/standard_whole_package_context_v2/);assert.match(sql,/FOR a IN SELECT \* FROM naijue_erp.audit_change/,'unmarked legacy fallback remains');assert.doesNotMatch(sql,/CREATE INDEX|GRANT |DISABLE TRIGGER/);});
test('new source-row deferred branch retains per-record proof and relies on mounted full receipt/batch checks',()=>{const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_source_commit_v2.sql',import.meta.url),'utf8');assert.match(sql,/PERFORM naijue_erp.standard_import_record_proof\(NEW.id\)/);assert.match(sql,/standard_whole_package_context_v2/);assert.match(sql,/PERFORM naijue_erp.assert_standard_import_operation/,'old unmarked path preserved');const access=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_access_v2.sql',import.meta.url),'utf8');for(const trigger of ['import_operation_consistency','import_batch_command_consistency','import_source_final_consistency'])assert.ok(access.includes(trigger));assert.match(access,/WHOLE_INSTALL_DEFERRED_TRIGGER_REQUIRED/);});
test('complete chain is checked by mandatory root closure, not rescanned for every child receipt',()=>{const sql=readFileSync(file,'utf8');assert.match(sql,/IF operation=\(a.after_values->'whole_package_v2'->>'root_operation'\)::uuid THEN\s+PERFORM naijue_erp.standard_whole_package_closed_v2/);assert.match(sql,/SET CONSTRAINTS ALL IMMEDIATE/);});
test('new validating prefixes avoid repeated full-history counts while final publication remains exact',()=>{const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_guards_v2.sql',import.meta.url),'utf8');assert.equal((sql.match(/NOT\(a.after_values \? 'whole_package_v2' AND NEW.status='VALIDATING'\)/g)||[]).length,7);});
test('real runner distinguishes insufficient and excess expected document counts without deleting legitimate rows',()=>{const runner=readFileSync(new URL('./integration/whole-package-sql-atomicity.mjs',import.meta.url),'utf8');for(const mode of ['count-underflow-failure','count-overflow-failure'])assert.ok(runner.includes(mode));assert.match(runner,/STANDARD_PUBLICATION_INCOMPLETE/);assert.match(runner,/expected_documents/);});

test('one bounded DOCUMENTS request retains multiple per-document seals',()=>{const sql=readFileSync(file,'utf8');assert.match(sql,/FOR doc IN SELECT value FROM jsonb_array_elements\(payload->'documents'\) LOOP/);assert.doesNotMatch(sql,/jsonb_array_length\(payload->'documents'\)\s*(?:<>|>|!=)\s*1/);assert.match(sql,/'MIGRATE_DOCUMENT',kind,doc_id/);});
test('whole controllers cannot suppress deferred constraints before or after a wrapper',()=>{const sql=readFileSync(file,'utf8');assert.match(sql,/WHOLE_CONTROLLER_UNSAFE/);assert.match(sql,/has_parameter_privilege\(session_user,'session_replication_role','SET'\)/);assert.match(sql,/current_setting\('session_replication_role'\).*origin/);assert.match(sql,/pg_has_role\(session_user,role_info.oid,'MEMBER'\)/);});
test('protected roles reject existing effective data privileges, ownership and schema creation',()=>{const sql=readFileSync(new URL('../adapters/postgres/patches/0027_standard_import_whole_package_access_v2.sql',import.meta.url),'utf8');for(const term of ['has_any_column_privilege','has_table_privilege','has_sequence_privilege','has_schema_privilege','proowner=role_row.oid','typowner=role_row.oid'])assert.ok(sql.includes(term));});
test('whole-package SQL never resolves catalog relations through attacker temp schema',()=>{
 for(const name of ['v2','guards_v2','intent_v2','source_commit_v2','access_v2','preflight_v2']){
  const sql=readFileSync(new URL(`../adapters/postgres/patches/0027_standard_import_whole_package_${name}.sql`,import.meta.url),'utf8');
  assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+(?!pg_catalog\.)(pg_roles|pg_auth_members|pg_class|pg_namespace|pg_database|pg_proc|pg_type|pg_attribute|pg_trigger|pg_language)\b/i,`${name}: catalog relation vulnerable to pg_temp shadow`);
 }
});
test('whole controller rejects inherited roles even when SET is disabled',()=>{
 const sql=readFileSync(file,'utf8');
 assert.equal((sql.match(/pg_has_role\(session_user,role_info\.oid,'MEMBER'\)/g)||[]).length,3,'context, prepare and inspect must scan the complete membership graph');
 for(const name of ['access_v2','preflight_v2']){
  const gate=readFileSync(new URL(`../adapters/postgres/patches/0027_standard_import_whole_package_${name}.sql`,import.meta.url),'utf8');
  assert.match(gate,/FROM pg_catalog\.pg_auth_members WHERE member=role_row\.oid/,'protected roles cannot have any parent memberships');
 }
});
test('inspect and committed closure do not assign transaction IDs in read-only transactions',async()=>{const{readFile}=await import('node:fs/promises');const text=await readFile('adapters/postgres/patches/0027_standard_import_whole_package_v2.sql','utf8');for(const name of ['inspect','closed']){const body=text.match(new RegExp('CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_'+name+'_v2[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'))[1];assert.doesNotMatch(body,/pg_current_xact_id\(\)|FOR (?:UPDATE|SHARE)|INSERT INTO|UPDATE naijue_erp/);if(name==='inspect')assert.match(body,/pg_current_xact_id_if_assigned\(\)/);}});
