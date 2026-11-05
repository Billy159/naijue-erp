/** SQL source-only RED tests. This is not PostgreSQL, migration or production evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=(name:string)=>readFileSync(new URL(`../adapters/postgres/patches/${name}`,import.meta.url),'utf8');
const kernel=()=>load('0027_standard_import_whole_package_v2.sql');
const guards=()=>load('0027_standard_import_whole_package_zero_balance_v2.sql');
test('explicit zero persists exactly one ordinary balance, never a synthetic ledger',()=>{
 const sql=kernel().replace(/--[^\n]*/g,''), branch=sql.slice(sql.indexOf("ELSIF command_phase='KEYS' THEN"),sql.indexOf("IF command_phase='DOCUMENTS' AND phase='DOCUMENTS'"));
 assert.match(branch,/IF quantity<>0 THEN[\s\S]*INSERT INTO naijue_erp\.inventory_ledger[\s\S]*END IF;\s*INSERT INTO naijue_erp\.inventory_balance/);
 assert.match(branch,/VALUES\(\(fields->>'warehouse_id'\)::uuid,\(fields->>'sku_id'\)::uuid,quantity,1,operation,transaction_timestamp\(\)\)/);
 assert.match(branch,/STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED/);
});
test('zero balance is accepted only by exact deferred import source and receipt, not unknown or a prior key',()=>{
 const sql=guards();
 assert.match(sql,/CREATE OR REPLACE FUNCTION naijue_erp\.validate_sparse_balance_commit\(\)/);
 for(const required of ['whole_package_v2','INVENTORY_KEY','STANDARD_EXPLICIT_ZERO_BALANCE_INVALID','standard_whole_package_context_v2','ledger_entry_id','last_operation_id','completed_at']) assert.ok(sql.includes(required),required);
 const k=kernel().slice(kernel().indexOf('CREATE OR REPLACE FUNCTION naijue_erp.assert_standard_import_operation'));
 assert.match(k,/STANDARD_EXPLICIT_ZERO_BALANCE_INVALID/);
});
test('zero successor retains every predecessor guard branch byte-for-byte after the narrow new branch',()=>{
 const old=load('0027_standard_import_initialization.sql'); const next=guards();
 const body=(s:string)=>{const m=/CREATE OR REPLACE FUNCTION naijue_erp\.validate_sparse_balance_commit\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(s);assert.ok(m);return m[1]!;};
 const oldBody=body(old),newBody=body(next);
 const begin=newBody.indexOf('  -- V2 explicit zero is an actual current stock fact');
 const end=newBody.indexOf("  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN",begin);
 assert.ok(begin>0&&end>begin);
 assert.equal(newBody.slice(0,begin)+newBody.slice(end),oldBody);
 const zero=newBody.slice(begin,end);
 for(const fact of ["TG_OP='INSERT'","NEW.quantity=0","r.target_type='IMPORT'","r.action='IMPORT_CHUNK'","r.result_data->>'phase'='KEYS'","standard_import_record_proof(src.id)","NEW.version IS DISTINCT FROM 1","inventory_ledger l"]) assert.ok(zero.includes(fact),fact);
 assert.doesNotMatch(zero,/INSERT INTO|UPDATE naijue_erp|DELETE FROM/);
});
