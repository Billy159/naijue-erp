import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFresh35DumpSections, replaceFresh35DumpBody } from '../scripts/release/unified-install/fresh35-retirement-schema.mjs';
import { createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const header=(name,type)=>`--\n-- Name: ${name}; Type: ${type}; Schema: naijue_erp; Owner: synthetic_owner\n--\n\n`;
test('schema parser treats header text inside function/string bodies as opaque',()=>{
 const body='BEGIN\n'+header('pretend','TABLE')+'RETURN; END;';
 const sql='-- PostgreSQL database dump\n'+header('probe()','FUNCTION')+'CREATE FUNCTION naijue_erp.probe() RETURNS void LANGUAGE plpgsql AS $function$'+body+'$function$;\n'+header('customer','TABLE')+'CREATE TABLE naijue_erp.customer (id uuid);\n';
 const sections=parseFresh35DumpSections(sql);assert.equal(sections.length,2);assert.equal(sections[0].type,'FUNCTION');assert.equal(sections[1].name,'customer');
});
test('body replacement preserves all signature, metadata, ownership and ACL text',()=>{
 const body='BEGIN RETURN; END;';const before=header('probe()','FUNCTION')+'CREATE FUNCTION naijue_erp.probe() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, naijue_erp, pg_temp AS $function$'+body+'$function$;\nALTER FUNCTION naijue_erp.probe() OWNER TO synthetic_owner;\n';
 const after=replaceFresh35DumpBody(before,hash(body),'BEGIN RAISE EXCEPTION \'closed\'; END;');
 assert.equal(after.replace('BEGIN RAISE EXCEPTION \'closed\'; END;',body),before);
 assert.throws(()=>replaceFresh35DumpBody(before,hash(body+'!'),'new'),/BODY_DIFFERS/);
 assert.throws(()=>replaceFresh35DumpBody(before,hash(body),'bad $function$ content'),/DELIMITER/);
});
test('schema parser refuses non-schema content and broken quoted input',()=>{
 assert.throws(()=>parseFresh35DumpSections('not a pg_dump'),/DUMP_HEADER/);
 assert.throws(()=>parseFresh35DumpSections('-- PostgreSQL database dump\n'+header('probe()','FUNCTION')+'SELECT $body$missing'),/UNTERMINATED/);
});

import { loadFresh35RetirementPlan } from '../scripts/release/unified-install/fresh35-retirement-plan.mjs';
import { compileFresh35SchemaFromDump } from '../scripts/release/unified-install/fresh35-retirement-schema.mjs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Parser/transform fixture only, intentionally not executable or engine evidence.
function modelDump(plan){
 let dump='-- PostgreSQL database dump\n';
 for(const routine of plan.predecessorRoutines){
  const name=routine.signature.slice('naijue_erp.'.length);
  dump+=header(name,'FUNCTION')+'CREATE FUNCTION '+routine.signature+' RETURNS void LANGUAGE plpgsql AS $function$'+routine.body+'$function$;\nALTER FUNCTION '+routine.signature+' OWNER TO synthetic_owner;\n';
 }
 for(const table of [...plan.retainedTables,...plan.omittedTables])dump+=header(table,'TABLE')+'CREATE TABLE naijue_erp.'+table+' (id uuid);\n';
 for(const edge of plan.foreignKeyReplacements)dump+=header(edge.table+' '+edge.fk,'FK CONSTRAINT')+'ALTER TABLE ONLY naijue_erp.'+edge.table+' ADD CONSTRAINT '+edge.fk+' FOREIGN KEY ('+edge.column+') REFERENCES naijue_erp.'+edge.target+'(id)'+(edge.deferred?' DEFERRABLE INITIALLY DEFERRED':'')+';\n';
 dump+='-- PostgreSQL database dump complete\n';return dump;
}
test('complete synthetic source model transforms exact56/178 to35/152 without DROP',async()=>{
 const plan=await loadFresh35RetirementPlan(root),dump=modelDump(plan);
 const result=compileFresh35SchemaFromDump(dump,plan,{dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const sections=parseFresh35DumpSections(result.sql);
 assert.equal(sections.filter(s=>s.type==='TABLE').length,35);assert.equal(sections.filter(s=>s.type==='FUNCTION').length,152);
 assert.equal(result.decisions.filter(d=>d.action==='SPECIALIZE_FUNCTION_BODY').length,19);
 assert.equal(result.decisions.filter(d=>d.action==='REPLACE_FK_WITH_VALIDATED_NULL_CHECK').length,7);
 assert.equal(result.decisions.filter(d=>d.action==='OMIT_LEGACY_FUNCTION').length,26);
 assert.doesNotMatch(result.sql,/\bDROP\s+(?:TABLE|FUNCTION|SCHEMA)\b/i);
 assert.equal(result.engineVerified,false);assert.equal(result.installationReady,false);
});
test('complete model refuses omitted callees in retained triggers and changed FK semantics',async()=>{
 const plan=await loadFresh35RetirementPlan(root),dump=modelDump(plan);
 const compile=input=>compileFresh35SchemaFromDump(input,plan,{dumpSha256:hash(input),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const trigger=header('import_batch bad_trigger','TRIGGER')+'CREATE TRIGGER bad_trigger AFTER INSERT ON naijue_erp.import_batch FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert();\n';
 assert.throws(()=>compile(dump.replace('-- PostgreSQL database dump complete',trigger+'-- PostgreSQL database dump complete')),/OMITTED_FUNCTION_REFERENCE/);
 assert.throws(()=>compile(dump.replace(' DEFERRABLE INITIALLY DEFERRED',' ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED')),/FK_OPTIONS/);
 assert.throws(()=>compile(dump.replace('CREATE TABLE naijue_erp.customer (id uuid);','CREATE TABLE naijue_erp.customer (id uuid, legacy naijue_erp.import_source_row);')),/LEGACY_TABLE_REFERENCE/);
 assert.throws(()=>compile(dump.replace('CREATE TABLE naijue_erp.customer (id uuid);','CREATE TABLE naijue_erp.customer (id uuid);\n'+header('extra','VIEW')+'CREATE VIEW naijue_erp.extra AS SELECT 1;')),/UNSUPPORTED_DUMP_SECTION/);
});

test('pg_dump named-argument ACL/COMMENT headers retain exact signature and quoted metadata',async()=>{
 const plan=await loadFresh35RetirementPlan(root);let dump=modelDump(plan);
 const retained=header('FUNCTION standard_zero_amount_archive_trace(sales uuid)','ACL')+'GRANT ALL ON FUNCTION "naijue_erp"."standard_zero_amount_archive_trace"("sales" "uuid") TO "erp_unified27_importer_2393dbc6db9581c2";\n';
 const omitted=header('FUNCTION assert_native_bootstrap_accounts(batch uuid)','COMMENT')+'COMMENT ON FUNCTION "naijue_erp"."assert_native_bootstrap_accounts"("batch" "uuid") IS \'retained old comment\';\n';
 dump=dump.replace('-- PostgreSQL database dump complete',retained+omitted+'-- PostgreSQL database dump complete');
 const bind=input=>({dumpSha256:hash(input),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const result=compileFresh35SchemaFromDump(dump,plan,bind(dump));assert.ok(result.sql.includes(retained.slice(3)));assert.ok(!result.sql.includes(omitted.slice(3)));
 const wrong=dump.replace('FUNCTION standard_zero_amount_archive_trace(sales uuid); Type: ACL','FUNCTION standard_zero_amount_archive_trace(sales text); Type: ACL');
 assert.throws(()=>compileFresh35SchemaFromDump(wrong,plan,bind(wrong)),/UNKNOWN_FUNCTION_METADATA|SECTION_STATEMENT_DIFFERS/);
});
test('quoted FK identifiers are exact and omitted final sections cannot swallow dump footer',async()=>{
 const plan=await loadFresh35RetirementPlan(root);let dump=modelDump(plan);
 for(const edge of plan.foreignKeyReplacements)dump=dump.replace('FOREIGN KEY ('+edge.column+') REFERENCES naijue_erp.'+edge.target+'(id)','FOREIGN KEY ("'+edge.column+'") REFERENCES "naijue_erp"."'+edge.target+'"("id")');
 dump=dump.replace('-- PostgreSQL database dump complete',header('FUNCTION assert_native_bootstrap_accounts(batch uuid)','ACL')+'REVOKE ALL ON FUNCTION "naijue_erp"."assert_native_bootstrap_accounts"("batch" "uuid") FROM PUBLIC;\n-- PostgreSQL database dump complete\n\\unrestrict synthetic_bound_token');
 const result=compileFresh35SchemaFromDump(dump,plan,{dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 assert.ok(result.sql.includes('-- PostgreSQL database dump complete'));assert.ok(result.sql.includes('\\unrestrict synthetic_bound_token'));
});

test('outer section additions, hidden writes and quoted or unqualified omitted callees reject',async()=>{
 const plan=await loadFresh35RetirementPlan(root),dump=modelDump(plan);
 const compile=input=>compileFresh35SchemaFromDump(input,plan,{dumpSha256:hash(input),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const table='CREATE TABLE naijue_erp.customer (id uuid);';
 for(const extra of ['CREATE TABLE naijue_erp.unreviewed (id uuid);','INSERT INTO naijue_erp.customer VALUES (null);','SET ROLE privileged;'])assert.throws(()=>compile(dump.replace(table,table+'\n'+extra)),/SECTION_STATEMENT|SECTION_COHORT/);
 for(const callee of ['"naijue_erp"."guard_history_insert"','guard_history_insert']){
  const extra=header('import_batch bad_trigger','TRIGGER')+'CREATE TRIGGER bad_trigger AFTER INSERT ON naijue_erp.import_batch FOR EACH ROW EXECUTE FUNCTION '+callee+'();\n';
  assert.throws(()=>compile(dump.replace('-- PostgreSQL database dump complete',extra+'-- PostgreSQL database dump complete')),/OMITTED_FUNCTION_REFERENCE/);
 }
});
test('timestamp identity arguments use PostgreSQL pg_dump spelling without losing parameter types',async()=>{
 const plan=await loadFresh35RetirementPlan(root),dump=modelDump(plan).replace('Name: assert_unified_current_actor(pg_catalog.uuid,pg_catalog.timestamptz,pg_catalog.text,pg_catalog.uuid,pg_catalog.text);','Name: assert_unified_current_actor(uuid, timestamp with time zone, text, uuid, text);');
 const result=compileFresh35SchemaFromDump(dump,plan,{dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});assert.equal(result.routineCount,152);
});

test('real pg_dump inter-object defaults, index method, function DEFAULT and quoted ACL are preserved',async()=>{
 const plan=await loadFresh35RetirementPlan(root);let dump=modelDump(plan);
 const firstTable=header(plan.retainedTables[0],'TABLE');
 dump=dump.replace(firstTable,"SET default_tablespace = '';\nSET default_table_access_method = heap;\n"+firstTable);
 dump=dump.replace('CREATE FUNCTION naijue_erp.history_closure_encode(pg_catalog.jsonb,pg_catalog.int4)','CREATE FUNCTION naijue_erp.history_closure_encode(value jsonb, depth integer DEFAULT 0)');
 const index=header('customer_search_idx','INDEX')+'CREATE INDEX "customer_search_idx" ON "naijue_erp"."customer" USING btree ("id");\n';
 const acl=header('TABLE "import_source_row"','ACL')+'REVOKE ALL ON TABLE "naijue_erp"."import_source_row" FROM PUBLIC;\n';
 dump=dump.replace('-- PostgreSQL database dump complete',index+acl+'-- PostgreSQL database dump complete');
 const result=compileFresh35SchemaFromDump(dump,plan,{dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 assert.ok(result.sql.includes('USING btree'));assert.ok(result.sql.includes('depth integer DEFAULT 0'));assert.ok(result.sql.includes("SET default_tablespace = '';"));
 assert.ok(!result.sql.includes('ON TABLE "naijue_erp"."import_source_row"'));
});
test('nondeferrable FK cannot change into initially immediate deferrable or hide an extra column',async()=>{
 const plan=await loadFresh35RetirementPlan(root),dump=modelDump(plan),edge=plan.foreignKeyReplacements.find(edge=>!edge.deferred);
 const anchor='FOREIGN KEY ('+edge.column+') REFERENCES naijue_erp.'+edge.target+'(id)';
 const compile=input=>compileFresh35SchemaFromDump(input,plan,{dumpSha256:hash(input),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 assert.throws(()=>compile(dump.replace(anchor,anchor+' DEFERRABLE INITIALLY IMMEDIATE')),/FK_OPTIONS|FK_DEFINITION/);
 assert.throws(()=>compile(dump.replace(anchor,anchor+' MATCH SIMPLE')),/FK_OPTIONS|FK_DEFINITION/);
});

test('actual pg_dump named array-argument ACL identity matches the retained exact overload',async()=>{
 const plan=await loadFresh35RetirementPlan(root);const metadata=header('FUNCTION "history_closure_count_map"("value" "jsonb", "expected_keys" "text"[])','ACL')+'REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_count_map"("value" "jsonb", "expected_keys" "text"[]) FROM PUBLIC;\n';
 const dump=modelDump(plan).replace('-- PostgreSQL database dump complete',metadata+'-- PostgreSQL database dump complete');
 const result=compileFresh35SchemaFromDump(dump,plan,{dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 assert.ok(result.sql.includes('"expected_keys" "text"[]'));
});

test('actual pg_dump COLUMN ACL binds its one column and table instead of treating it as a table grant',async()=>{
 const plan=await loadFresh35RetirementPlan(root),metadata=header('COLUMN "barcode_scheme"."id"','ACL')+'GRANT INSERT("id") ON TABLE "naijue_erp"."barcode_scheme" TO "erp_unified27_runtime_2393dbc6db9581c2";\n';
 const dump=modelDump(plan).replace('-- PostgreSQL database dump complete',metadata+'-- PostgreSQL database dump complete');
 const compile=input=>compileFresh35SchemaFromDump(input,plan,{dumpSha256:hash(input),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 assert.ok(compile(dump).sql.includes('GRANT INSERT("id")'));
 assert.throws(()=>compile(dump.replace('GRANT INSERT("id")','GRANT INSERT("name")')),/SECTION_STATEMENT_DIFFERS/);
 assert.throws(()=>compile(dump.replace('GRANT INSERT("id")','GRANT INSERT')),/SECTION_STATEMENT_DIFFERS/);
});
