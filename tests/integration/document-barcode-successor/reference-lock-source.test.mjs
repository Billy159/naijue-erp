import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('reference-lock successor limits UPDATE to six identity columns and rejects runtime identity writes',async()=>{
 const sql=await readFile(new URL('../../../adapters/postgres/patches/0027_document_product_reference_lock_permissions.sql',import.meta.url),'utf8');
 for(const t of ['product_category','supplier','size_group','season','barcode_scheme','product_image'])assert.match(sql,new RegExp("'"+t+"'"));
 assert.match(sql,/BEFORE UPDATE OF id/);assert.match(sql,/IF current_user='erp_unified27_runtime_2393dbc6db9581c2'/);assert.match(sql,/GRANT UPDATE\(id\)/);assert.match(sql,/tgtype=19/);assert.doesNotMatch(sql,/GRANT\s+UPDATE\s+ON/i);
});
test('read-only admission rejects with a real SQL error, never psql quit status',async()=>{
 const s=await readFile(new URL('./admission-readonly.psql',import.meta.url),'utf8');assert.match(s,/\\set ON_ERROR_STOP on/);assert.doesNotMatch(s,/\\quit/);assert.equal((s.match(/DOCUMENT_APPEND_ADMISSION_REJECTED/g)||[]).length,13);
});
test('existing category lock privilege is accepted only with the exact old rejection guard',async()=>{
 const s=await readFile(new URL('../../../adapters/postgres/patches/0027_document_product_reference_lock_permissions.sql',import.meta.url),'utf8');
 assert.match(s,/CATEGORY_EXISTING_GUARD_INVALID/);assert.match(s,/standard_runtime_reference_lock_only/);assert.match(s,/3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c/);assert.match(s,/IF NOT pg_catalog\.has_column_privilege\(role_name/);
});
test('reference lock baseline rejects preexisting UPDATE on other columns',async()=>{const s=await readFile(new URL('../../../adapters/postgres/patches/0027_document_product_reference_lock_permissions.sql',import.meta.url),'utf8');assert.match(s,/DOCUMENT_REFERENCE_EXTRA_UPDATE_FORBIDDEN/);assert.match(s,/a\.attname<>'id'/);});
test('reference lock installer rejects role inheritance or membership',async()=>{const s=await readFile(new URL('../../../adapters/postgres/patches/0027_document_product_reference_lock_permissions.sql',import.meta.url),'utf8');assert.match(s,/NOT rolinherit/);assert.match(s,/pg_auth_members/);});
