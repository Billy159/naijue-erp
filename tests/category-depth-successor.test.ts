/** Source-only checks; concurrency acceptance belongs to the fresh isolated PG runner. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../adapters/postgres/patches/0026-category-depth-successor.sql',import.meta.url),'utf8');
test('B14 pins complete post-B07 predecessor and adds exactly two invoker functions and two triggers',()=>{
 const pins=JSON.parse(sql.split('$routines$')[1]!) as {signature:string;sha256:string}[];
 assert.equal(pins.length,131);assert.equal(new Set(pins.map(p=>p.signature)).size,131);
 assert.equal(pins.find(p=>p.signature==='naijue_erp.history_revision_not_enabled()')!.sha256,'581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f');
 const triggers=JSON.parse(sql.split('$triggers$')[1]!);assert.equal(triggers.length,4);
 assert.equal((sql.match(/^CREATE FUNCTION/gm)??[]).length,2);assert.equal((sql.match(/^CREATE (?:CONSTRAINT )?TRIGGER/gm)??[]).length,2);
 assert.doesNotMatch(sql,/CREATE OR REPLACE|DROP |GRANT |REVOKE |ALTER TABLE|CREATE TABLE|SECURITY DEFINER/);
 assert.equal((sql.match(/SECURITY INVOKER/g)??[]).length,2);
});
test('B14 serializes before rows and checks actual final connected component without revising original facts',()=>{
 assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE[\s\S]*?FOR EACH STATEMENT/);
 assert.match(sql,/transaction_isolation'\)<>'read committed'[\s\S]*?ERRCODE='40001'/);
 assert.ok(sql.includes("hashtextextended('naijue:catalogue-maintenance',0)"));
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED FOR EACH ROW/);
 const body=sql.split('$final$')[1]!;
 assert.match(body,/WITH RECURSIVE component/);assert.ok(body.includes('ARRAY[changed_id,old_parent,new_parent]'));
 assert.ok(body.includes('n.parent_id=n.id OR p.id IS NULL OR p.deleted_at IS NOT NULL OR p.parent_id IS NOT NULL'));
 assert.doesNotMatch(body.replace(/--[^\n]*/g,''),/INSERT INTO|UPDATE naijue|DELETE FROM|UNION ALL/);
});
