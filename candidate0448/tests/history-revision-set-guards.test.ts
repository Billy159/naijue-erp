/** Source contract; SQL execution, planner and real statement triggers require isolated PG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(s:string)=>readFileSync(new URL('../'+s,import.meta.url),'utf8');
const sql=read('adapters/postgres/patches/0026-history-revision-set-guards-successor.sql');
test('P04 exact post-B07+B14 parent and no persistent duplicate facts or weakened old profiles',()=>{
 const pins=JSON.parse(sql.split('$pins$')[1]!);assert.equal(pins.length,133);
 assert.equal(pins.find((p:{signature:string})=>p.signature==='naijue_erp.history_revision_not_enabled()').sha256,'581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f');
 assert.doesNotMatch(sql,/CREATE TABLE|ALTER TABLE|DROP |GRANT |SECURITY DEFINER/);
 assert.equal((sql.match(/^CREATE TRIGGER/gm)??[]).length,7);
 assert.equal((sql.match(/REFERENCING NEW TABLE AS history_new/g)??[]).length,7);
});
test('P04 statement sets materialize each revision array once, row guards retain head CAS and all deletes',()=>{
 assert.match(sql,/WITH revisions AS MATERIALIZED/);assert.match(sql,/expected AS MATERIALIZED/);
 assert.match(sql,/SELECT DISTINCT revision_id FROM history_new/);
 assert.match(sql,/TG_OP='DELETE'[\s\S]*?cannot be deleted/);
 assert.match(sql,/previous->>'version'\)::integer<>revision.from_version/);
 assert.ok(sql.includes("Explicit nullable responsible staff required"));
 assert.doesNotMatch(sql,/SELECT value INTO STRICT (?:old_line|next_line|effect) FROM jsonb_array_elements/);
 assert.match(sql,/WHERE n.event_kind='HISTORY_REVISION'/);
 assert.ok(sql.includes("IF NEW.event_kind<>'HISTORY_REVISION' THEN RETURN NEW; END IF;"));
 assert.ok(sql.includes('Original deferred revision/audit/receipt/full-projection/ledger/balance closure remains attached and unchanged'));
});

const draftSql=read('adapters/postgres/patches/0026-history-draft-transfer-line-set-successor.sql');
test('draft transfer successor replaces exactly four existing invoker signatures without DDL/ACL/trigger expansion',()=>{
 const signatures=[...draftSql.matchAll(/^CREATE OR REPLACE FUNCTION naijue_erp\.([^\n]+?) RETURNS/gm)].map(m=>m[1]);
 assert.deepEqual(signatures,['history_numeric_current_facts(kind text,target uuid)','history_revision_not_enabled()','history_effective_set_guard()','validate_history_numeric_revision_commit()']);
 assert.doesNotMatch(draftSql,/CREATE TABLE|ALTER TABLE|CREATE TRIGGER|DROP |GRANT |REVOKE |SECURITY DEFINER/);
 const pins=JSON.parse(draftSql.split('$pins$')[1]!);assert.equal(pins.length,4);assert.equal(pins[1].sha256,'917601e4a32df8b38047094d05a581883e040876ee091c7de0f5ffe8999a5d16');
 assert.match(draftSql,/prosrc,'UTF8'/);assert.match(draftSql,/Exact approved draft-transfer predecessor body required/);
});
test('draft transfer SQL retains original publication/numeric branch and independently validates full set native/source identity',()=>{
 const oldTail=sql.slice(sql.indexOf("  size_before:=jsonb_array_length(actual->'lines');"),sql.indexOf('END $body$;'));
 assert.ok(draftSql.includes(oldTail),'original signed numeric/effect validation is unchanged after the explicit new branch');
 assert.match(draftSql,/actual->>'sourceStatus'<>'DRAFT' OR actual->>'baselineEffect'<>'EXCLUDED_NOT_EFFECTIVE'/);
 assert.match(draftSql,/WITH previous_rows AS MATERIALIZED/);assert.match(draftSql,/New effective identity must belong to this revision/);
 assert.match(draftSql,/FOR SHARE OF s,p,c,f,z,m/);assert.match(draftSql,/Native|native size group/);
 assert.match(draftSql,/Complete actual native size group required, never inventory-trimmed/);
 assert.match(draftSql,/group_fact IS DISTINCT FROM expected_group/);assert.match(draftSql,/snapshot' IS DISTINCT FROM jsonb_build_object/);
 assert.match(draftSql,/ib\.status<>'IMPORTED'/);assert.match(draftSql,/draftLineSetVersion'\) THEN\n    RAISE EXCEPTION 'Effective draft line format cannot be downgraded/);
 assert.match(draftSql,/count\(DISTINCT value->>'lineId'\)/);assert.doesNotMatch(draftSql,/GROUP BY[^\n]*sku/);
});
test('draft transfer SQL uses original effective head/current facts plus same-transaction receipt/audit closure; no FK projection/ledger bypass',()=>{
 assert.match(draftSql,/CASE WHEN effective_facts \? 'note' THEN effective_facts->'note' ELSE h->'note' END/);
 assert.match(draftSql,/result:=result\|\|jsonb_build_object\('draftLineSetVersion',1,'lines',effective_facts->'lines'/);
 assert.match(draftSql,/EXISTS\(SELECT 1 FROM revisions d WHERE d.id=e.revision_id AND d.after_facts \? 'draftLineSetVersion'\)/);
 assert.match(draftSql,/Draft complete set cannot write quantity FK projections or inventory/);
 assert.match(draftSql,/a.before_values IS DISTINCT FROM NEW.before_facts OR a.after_values IS DISTINCT FROM NEW.after_facts/);
 assert.match(draftSql,/IF actual IS DISTINCT FROM NEW.after_facts THEN/);
 assert.match(draftSql,/mod\(pg_current_xact_id\(\)::text::numeric,4294967296\)/);
});
