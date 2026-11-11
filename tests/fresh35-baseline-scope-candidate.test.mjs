/** Actual source compilation only. PostgreSQL/ordinary-role behavior is verified separately. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {loadFresh35BaselineScopePredecessors,generateFresh35BaselineScopePatch,compileFresh35BaselineScopeCandidate,loadFresh35BaselineScopeCandidate} from '../scripts/release/unified-install/fresh35-baseline-scope-candidate.mjs';
const root=new URL('../',import.meta.url).pathname,hash=s=>createHash('sha256').update(s).digest('hex'),{routines}=await loadFresh35BaselineScopePredecessors(root),patch=await readFile(new URL('../adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql',import.meta.url),'utf8'),c=compileFresh35BaselineScopeCandidate(routines,patch);
test('SQL38 is deterministic directly from the SQL36 154-routine predecessor and preserves permissions/storage metadata',async()=>{
 assert.equal(generateFresh35BaselineScopePatch(routines).patchSql,patch);assert.equal(c.changedBodies.length,7);assert.equal(c.newRoutines.length,0);assert.equal(c.manifest.tableCount,35);assert.deepEqual(c.manifest.permissionChanges,[]);assert.equal(c.manifest.newColumns,0);
 for(const r of c.changedBodies)assert.equal(hash(r.body),c.manifest.routineChanges.find(x=>x.signature===r.signature).after);
 assert.match(patch,/before_meta IS DISTINCT FROM after_meta/);const live=await loadFresh35BaselineScopeCandidate(root);assert.equal(live.manifest.patchSqlSha256,hash(patch));assert.equal(live.manifest.sourcePins.some(p=>p.path.endsWith('0037_compact_zero_scope_successor.sql')),false);
});
test('complete membership, real explicit values and each warehouse total are checked before baseline publication',()=>{
 const command=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 for(const marker of ['INVENTORY_BASELINE_SCOPE_MEMBERS_DIFFERS','INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS','INVENTORY_SCOPE_REQUIRES_REAL_EXPLICIT_ROWS','FINAL_BASELINE_SCOPE_V1','records_sha256','warehouse_totals'])assert.ok(command.includes(marker));
 assert.ok(command.indexOf('INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS')<command.indexOf("UPDATE naijue_erp.import_batch SET checkpoint=cp,status="));
 const proof=c.changedBodies.find(r=>r.signature.includes('.standard_inventory_key_proof(')).body;
 assert.match(proof,/FINAL_BASELINE_SCOPE_V1/);assert.match(proof,/native_creation_operation_valid/);assert.doesNotMatch(proof,/audit_change|warehouse_totals|explicit_values|merkle/);
});
test('first-use guards retain locks, exact live pairs, reversal checks and deferred real-effect accounting',()=>{
 const byName=name=>c.changedBodies.find(r=>r.signature.includes('.'+name+'(')).body;
 assert.match(byName('guard_cutoff_ledger'),/inventory_key_lock/);assert.match(byName('guard_cutoff_ledger'),/standard_inventory_key_proof/);
 assert.match(byName('guard_recorded_live_balance_pair'),/NEW.quantity_before<>0/);assert.match(byName('guard_recorded_live_balance_pair'),/NEW.reverses_entry_id IS NOT NULL/);
 assert.match(byName('validate_sparse_balance_commit'),/STANDARD_FIRST_SCOPE_REAL_EFFECT_DIFFERS/);assert.match(byName('validate_transfer_effect'),/invalid exact original transfer reversal/);
 assert.throws(()=>compileFresh35BaselineScopeCandidate(routines,patch+' '),/EXACT_GENERATED_PATCH_REQUIRED/);
});
