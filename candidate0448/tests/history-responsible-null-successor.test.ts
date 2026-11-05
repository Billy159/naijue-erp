/** Source contract only; actual PostgreSQL/HTTP acceptance remains separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
test('HV2-B07 installs exactly one pinned responsible-null body without changing any other revision guard',()=>{
 const parent=read('adapters/postgres/patches/0026-history-revision-current-base.sql');
 const sql=read('adapters/postgres/patches/0026-history-responsible-null-successor.sql');
 const old=/CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(parent)![1]!;
 const next=sql.split('$nullable$')[1]!;
 assert.equal(sha(old),'1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c');
 assert.equal(sha(next),'581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f');
 const prefix="    IF NEW.after_facts->'responsibleStaffId' IS DISTINCT FROM actual->'responsibleStaffId' THEN\n";
 const end="    IF NEW.document_kind='SALES' THEN";
 const strip=(s:string)=>s.slice(0,s.indexOf(prefix))+s.slice(s.indexOf(end,s.indexOf(prefix)));
 assert.equal(strip(next),strip(old));
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)??[]).length,1);
 assert.doesNotMatch(sql,/\b(?:GRANT|REVOKE|ALTER TABLE|CREATE TABLE|DROP |SECURITY DEFINER)\b/);
 assert.ok(sql.includes("prokind IN ('f','p'))<>131"));
});
test('HV2-B07 distinguishes missing, explicit null, actual UUID and all other JSON types',()=>{
 const body=read('adapters/postgres/patches/0026-history-responsible-null-successor.sql').split('$nullable$')[1]!;
 const branch=body.slice(body.indexOf("IF NOT (NEW.after_facts ? 'responsibleStaffId')"),body.indexOf("    IF NEW.document_kind='SALES' THEN"));
 assert.ok(branch.indexOf("? 'responsibleStaffId'")<branch.indexOf("='null'"));
 assert.match(branch,/='null' THEN\s+NULL;/);
 assert.match(branch,/='string' THEN[\s\S]*?\[0-9a-f\][\s\S]*?PERFORM id FROM naijue_erp.staff[\s\S]*?FOR SHARE/);
 assert.match(branch,/ELSE\s+RAISE EXCEPTION 'Explicit nullable responsible staff required'/);
 assert.ok(body.includes("actual->>'sourceStatus'<>'DRAFT' OR actual->>'baselineEffect'<>'EXCLUDED_NOT_EFFECTIVE'"));
});
