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
