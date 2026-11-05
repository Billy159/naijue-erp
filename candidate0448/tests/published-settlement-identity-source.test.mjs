import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('ordinary runtime settlement retention uses immutable business audit and returns before import-only checks',async()=>{
 const s=await readFile('adapters/postgres/patches/0027_published_settlement_identity_successor.sql','utf8');
 const branch=s.slice(s.indexOf("IF current_user='erp_unified27_runtime"),s.indexOf('-- Import-only predecessor'));
 assert.match(branch,/audit_change/);assert.match(branch,/operation_receipt/);assert.match(branch,/before_values/);assert.match(branch,/after_values/);assert.match(branch,/RETURN NEW/);assert.doesNotMatch(branch,/import_record|standard_import_row_intent/);
 assert.match(s,/retained_record/);assert.match(s,/FOR UPDATE/);assert.match(s,/PUBLISHED_SETTLEMENT_PREDECESSOR_DIFFERS/);
});
test('real installation and exact cohort include both business-runtime successors before hardening',async()=>{
 const {WHOLE_INSTALL_PATCHES}=await import('../scripts/release/unified-install/render-whole-package-local.mjs');
 for(const file of ['0027_published_settlement_identity_successor.sql','0027_standard_known_balance_runtime_v2.sql']){
 assert.ok(WHOLE_INSTALL_PATCHES.includes(file));assert.ok(WHOLE_INSTALL_PATCHES.indexOf(file)<WHOLE_INSTALL_PATCHES.indexOf('0027_standard_import_whole_package_search_path_v2.sql'));
 const source=await readFile('scripts/release/unified-install/whole-search-path-source.mjs','utf8');assert.ok(source.includes(file));}
});
test('published anchor SQL rejects altered trigger events, timing, WHEN and unique-index keys/predicate',async()=>{
 const s=await readFile('adapters/postgres/src/published-document-inventory-anchor-reader.ts','utf8');
 for(const field of ['t.tgtype=required.trigger_type','t.tgdeferrable=required.deferred','t.tginitdeferred=required.deferred','t.tgnargs=0','t.tgattr','pg_get_triggerdef','i.indnkeyatts','i.indnatts','i.indexprs IS NULL','i.indpred','i.indkey','pg_get_expr'])assert.ok(s.includes(field),field);
 assert.match(s,/source_sales_line_id IS NOT NULL/);assert.match(s,/source_transfer_line_id IS NOT NULL/);
});
test('anchor unique indexes reject custom opclass or collation semantics',async()=>{
 const s=await readFile('adapters/postgres/src/published-document-inventory-anchor-reader.ts','utf8');
 for(const x of ['i.indclass','i.indcollation','pg_catalog.pg_opclass','pg_catalog.pg_opfamily',"opc.opcname=CASE",'opc.opcdefault',"'pg_catalog.default'::regcollation"])assert.ok(s.includes(x),x);
});
test('same-name CHECK true cannot replace the exact reversal XOR check',async()=>{
 const s=await readFile('adapters/postgres/src/published-document-inventory-anchor-reader.ts','utf8');
 for(const x of ["con.contype='c'",'con.conbin','con.conkey',"con.conname='ledger_reversal_evidence_xor'",'num_nonnulls(reverses_entry_id, baseline_anchor_operation_id) = 1'])assert.ok(s.includes(x),x);
});
