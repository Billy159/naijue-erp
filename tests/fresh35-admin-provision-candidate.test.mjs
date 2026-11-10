import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadFresh35AdminProvisionCandidate,compileFresh35AdminProvisionCandidate} from '../scripts/release/unified-install/fresh35-admin-provision-candidate.mjs';
import {applyRetirementSourceReplacement} from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=x=>createHash('sha256').update(x).digest('hex');
let pending;const load=()=>pending??=loadFresh35AdminProvisionCandidate(root);
const body=(c,name)=>[...c.changedBodies,...c.newRoutines].find(r=>r.signature.includes('.'+name+'(')).body;

test('A+B is an explicit 35-table/154-routine successor; original metadata/actions and table privileges remain intact',async()=>{
 const c=await load();assert.equal(c.manifest.tableCount,35);assert.equal(c.manifest.predecessorRoutineCount,152);assert.equal(c.manifest.routineCount,154);
 assert.equal(c.newRoutines.length,2);assert.equal(c.changedBodies.length,4);assert.equal(c.manifest.successorRoutinePins.length,154);
 assert.deepEqual(c.manifest.columnChanges,[]);assert.deepEqual(c.manifest.constraintChanges,[]);assert.deepEqual(c.manifest.triggerChanges,[]);
 assert.equal(c.manifest.tablePrivilegesChanged,false);assert.equal(c.manifest.activeProfilesChanged,false);assert.equal(c.manifest.engineVerified,false);
 for(const s of c.specs){const before=c.predecessorBodies.find(r=>r.signature===s.signature);assert.equal(hash(before.body),s.predecessor_sha256);
  const after=applyRetirementSourceReplacement(before.body,s);assert.equal(hash(after),s.successor_sha256);
  let reversed=after;for(const r of s.replacements.toReversed())reversed=reversed.replace(r.after,()=>r.before);assert.equal(reversed,before.body);
  assert.throws(()=>applyRetirementSourceReplacement(before.body+' ',s),/PREDECESSOR/);
 }
 assert(c.patchSql.includes('before_meta IS DISTINCT FROM after_meta'));assert(c.reviewSql.includes("RAISE EXCEPTION 'FRESH35_ADMIN_PROVISION_REVIEW_ONLY'"));
 assert.equal((c.patchSql.match(/^GRANT /gm)||[]).length,1);assert(c.patchSql.includes('GRANT EXECUTE ON FUNCTION naijue_erp.standard_admin_provision_only_v1(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;'));
 assert(c.patchSql.includes('REVOKE ALL ON FUNCTION naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean) FROM PUBLIC'));
});

test('provision operation retains original CREATE trigger evidence and cannot consume import state',async()=>{
 const c=await load(),a=body(c,'standard_admin_provision_only_v1');
 for(const text of ['WHOLE_CONTROLLER_UNSAFE',"standard_import_identity(NULL,'INITIALIZER')",'WHOLE_TWO_CAPABILITIES_REQUIRED','cutoff_import_lock()',
  'maintenance_administrator_mutex()','STANDARD_NEW_EMPTY_ONLY','STANDARD_IDEMPOTENCY_CONFLICT','WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED',
  "'CREATE','STAFF'","'account_credentials'","'action','CREATE'",'SET CONSTRAINTS ALL IMMEDIATE','strpos(request::text,encoded_scrypt)>0','LOCK TABLE naijue_erp.%I IN SHARE ROW EXCLUSIVE MODE'])assert(a.includes(text),text);
 assert.deepEqual([...a.matchAll(/INSERT INTO naijue_erp\.(\w+)/g)].map(m=>m[1]),['staff','user_account','operation_receipt','audit_change']);
 assert.doesNotMatch(a,/INSERT INTO naijue_erp\.(?:import_|inventory_)|standard_whole_package_(?:prepare|step)|'PUBLISH'|NEW_AFTERNOON_SNAPSHOT/);
 const proof=body(c,'standard_admin_provision_proof_v1');
 for(const text of ['ADMIN_PROVISION_ONLY_TECHNICAL_CHAIN_REQUIRED','ADMIN_PROVISION_BUSINESS_NOT_EMPTY',"x.action='RESET_PASSWORD'",'x.account_id<>r.actor_account_id',"s->>'role' IS DISTINCT FROM 'ADMIN'",'provision_fingerprint',"u-'password_hash'",'r.actor_account_id::text IS DISTINCT FROM admin'])assert(proof.includes(text),text);
 assert.match(proof,/RETURN jsonb_build_object\([^\n]*'account',u-'password_hash'\);/);
});

test('first-business mode preserves empty-target NEW_EMPTY and all original source/publication/identity checks',async()=>{
 const c=await load(),command=body(c,'standard_whole_package_command_v2');
 for(const text of ["payload->>'mode'='NEW_EMPTY' AND payload ?|",'standard_admin_provision_proof_v1','ADMIN_PROVISION_COMMITTED_RECEIPT_REQUIRED',"cfg->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS'",'STANDARD_NEW_EMPTY_ONLY',
  'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION','STANDARD_PUBLICATION_INCOMPLETE','STANDARD_MASTER_CLOSURE_INCOMPLETE','STANDARD_EXACT_NUMERIC_STRING_REQUIRED',
  'STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED','STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET',"'provisioned_snapshot',admin_provision_snapshot"])assert(command.includes(text),text);
 assert(command.indexOf('standard_admin_provision_proof_v1(')<command.indexOf('INSERT INTO naijue_erp.staff'));
 assert(command.includes("admin,true);\n  ELSE\n  -- No existing baseline/account/master/history adoption"),'old full-empty check/DML stays in its own branch');
 const check=body(c,'assert_standard_import_operation');assert(check.includes('ADMIN_PROVISION_IMPORT_SNAPSHOT_DIFFERS'));
 assert(check.includes('auth_version=1 AND version=1'));assert(check.includes('created_at=r.completed_at'));
 const verify=body(c,'standard_whole_package_verify_v2');assert(verify.includes('standard_admin_provision_proof_v1('));
 for(const text of ['WHOLE_VERIFY_COMMITTED_PACKAGE_REQUIRED','STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED','STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS','STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID'])assert(verify.includes(text),text);
});
