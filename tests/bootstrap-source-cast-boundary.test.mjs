import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {loadWholeCatalogSpec} from '../scripts/release/unified-install/whole-catalog-gate.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const sql=await readFile(new URL('../adapters/postgres/patches/0026-v14-core-initialization.sql',import.meta.url),'utf8');
const body=sql.match(/CREATE OR REPLACE FUNCTION naijue_erp\.assert_native_bootstrap_accounts\(selected_batch uuid\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];
test('bootstrap current body and installed profile retain exact original pin',async()=>{
 const digest=createHash('sha256').update(body).digest('hex');assert.equal(digest,'171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca');
 const spec=await loadWholeCatalogSpec(root);assert.equal(spec.pins.find(p=>p.signature==='naijue_erp.assert_native_bootstrap_accounts(pg_catalog.uuid)').sha256,digest);
});
test('typed snapshot normalization and locked actual historical evidence remain mandatory',()=>{
 assert.ok(body.includes('to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot)) IS DISTINCT FROM e.actual_source'));
 for(const text of ['FROM naijue_erp.native_party_import_evidence i','JOIN naijue_erp.import_source_row s','FOR SHARE OF i,s','e.creation_xid IS DISTINCT FROM pg_current_xact_id()'])assert.ok(body.includes(text));
});
test('V1 identity authority, counts and exact receipt/actor constraints remain intact',()=>{
 for(const text of ["proof->>'version'='NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1'","proof->>'profile'='EXACT26'",'seen<>49 OR direct_count<>45 OR plan_count<>4','bootstrap_execution_review_sha256','approved_employee_plan_sha256','All bootstrap accounts must share one independently reviewed original execution','First bootstrap requires complete49 account closure and no session/stock effect','Bootstrap must commit with its one exact original STAGE audit/receipt and actual reviewed ADMIN actor'])assert.ok(body.includes(text));
});
