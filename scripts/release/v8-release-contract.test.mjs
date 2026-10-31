// Finite V8 release facts only. No runtime/database/deployment actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.RELEASE_SOURCE_ROOT ?? path.resolve(new URL('../..',import.meta.url).pathname);
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {contractBlock,requireReviewedCapacityHelper}=await import(pathToFileURL(path.join(root,'scripts/release/generate-release-contract.mjs')));
const contract=JSON.parse(read('config/release-contract.json'));
const name='recorded-live-write-v8';
const descriptor={format:'EXACT26_RUNTIME_CATALOG_EXPORT_V8',patchLevel:'26_hv2_live_pairs_complete_write_acl_v8_from_v7',aclProofField:'complete_write_system_acl_match_v8',deleteAclProofField:'normal_delete_acl_match_v8',observationProofField:'recorded_live_balance_contract_match',requiredObservation:'RECORDED_LIVE_LEDGER_PAIRS_COMPLETE_WRITE_V8',runtimeSqlPatch:'adapters/postgres/patches/0026-live-ledger-balance-pairs.sql'};
test('V8 has its own system and DELETE proofs while retaining recorded live balances',()=>{
 assert.deepEqual(contract.full.catalogProfiles[name],descriptor);
 assert.equal(contract.full.catalogProfiles['recorded-live-ledger-v7'].aclProofField,'complete_write_xmin_acl_match');
 assert.equal(contract.full.patchLevel,contract.full.catalogProfiles['legacy-v1'].patchLevel);
 assert.equal(contract.runtimeSqlPatches.length,12); // ACL successor adds no storage DDL.
 const deploy=read('scripts/release/deploy-candidate.py');
 assert.ok(deploy.includes(contractBlock(contract)),'generated descriptor must match editable contract');
});
test('V8 never borrows old proofs or changes finite fields',()=>{
 for(const key of Object.keys(descriptor)){
  for(const mode of ['missing','wrong']){
   const c=structuredClone(contract);
   if(mode==='missing')delete c.full.catalogProfiles[name][key];
   else c.full.catalogProfiles[name][key]=key==='aclProofField'?'complete_write_xmin_acl_match':'unregistered';
   assert.throws(()=>contractBlock(c),/INVALID_RELEASE_CATALOG_PROFILE/);
  }
 }
 for(const mutate of [c=>{delete c.full.catalogProfiles[name];},c=>{c.full.catalogProfiles[name].fallback=true;},c=>{c.full.catalogProfiles.alias=c.full.catalogProfiles[name];}]){
  const c=structuredClone(contract);mutate(c);assert.throws(()=>contractBlock(c),/INVALID_RELEASE_CATALOG_PROFILE/);
 }
});
test('V8 source generation does not self-approve boot or rollback helpers',()=>{
 const deploy=read('scripts/release/deploy-candidate.py');
 assert.throws(()=>requireReviewedCapacityHelper(deploy+'\n# synthetic changed byte, never executed\n',read('scripts/release/boot-entry.py')),/DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED/);
 assert.doesNotMatch(read('scripts/release/generate-release-contract.mjs'),/await writeFile\(bootPath/);
 // Reapproval is external; rollback must share the original pinned helper with boot.
 const pin=s=>s.match(/^DEPLOYMENT_CAPACITY_SHA256 = '([a-f0-9]{64})'$/m)?.[1];
 assert.equal(pin(read('scripts/release/rollback-candidate.py')),pin(read('scripts/release/boot-entry.py')));
});
