import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256 as profile} from '../packages/application/src/unified-import-contract.ts';
const root=new URL('../adapters/postgres/patches/',import.meta.url),hash=x=>createHash('sha256').update(x).digest('hex');
const oldFile=()=>readFileSync(new URL('0027_standard_import_whole_package_v2.sql',root),'utf8');
const candidate=()=>readFileSync(new URL('0027_historical_sales_source_profile_successor.sql',root),'utf8');
const functionBody=text=>text.match(/CREATE OR REPLACE FUNCTION naijue_erp\.standard_whole_package_command_v2\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];
test('explicit profile successor pins exact predecessor and only four schema decision changes',()=>{
 const before=functionBody(oldFile()),sql=candidate(),spec=JSON.parse(sql.match(/\$source_profile_changes\$([\s\S]*?)\$source_profile_changes\$/)[1]);
 assert.equal(spec.predecessor_sha256,hash(before));assert.equal(spec.profile_sha256,profile);assert.equal(spec.replacements.length,4);
 let after=before;
 for(const {before:anchor,after:replacement}of spec.replacements){assert.equal(after.split(anchor).length-1,1);assert(replacement.includes(profile));after=after.split(anchor).join(replacement);}
 assert.equal(hash(after),spec.successor_sha256);
 assert.match(after,new RegExp("schema_declarations_sha256' NOT IN \\([^\\n]*"+profile));
 assert.match(after,new RegExp("IF cfg->>'schema_declarations_sha256' IN \\([^\\n]*"+profile));
 assert.match(after,new RegExp("coalesce\\(cfg->>'schema_declarations_sha256',''\\) NOT IN \\([^\\n]*"+profile));
 assert.match(sql,/HISTORY_SOURCE_PROFILE_PREDECESSOR_DIFFERS/);assert.match(sql,/HISTORY_SOURCE_PROFILE_POSTCONDITION_FAILED/);assert.match(sql,/before_meta IS DISTINCT FROM after_meta/);
 assert.doesNotMatch(sql,/\b(?:GRANT|DROP|TRUNCATE|ALTER ROLE|CREATE ROLE)\b/i);
 assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);
});
