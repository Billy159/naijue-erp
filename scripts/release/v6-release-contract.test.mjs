import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.RELEASE_SOURCE_ROOT ?? path.resolve(new URL('../..', import.meta.url).pathname);
if(!root)throw Error('RELEASE_SOURCE_ROOT_REQUIRED');
const {contractBlock}=await import(pathToFileURL(path.join(root,'scripts/release/generate-release-contract.mjs')));
const contract=JSON.parse(fs.readFileSync(path.join(root,'config/release-contract.json')));
test('explicit V6 contract is finite and additive, never replaces V1',()=>{
 assert.deepEqual(contract.full.catalogProfiles,{
  'legacy-v1':{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',patchLevel:'26_hv2_history_set_guards_from_v22',aclProofField:null},
  'complete-write-v6':{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V6',patchLevel:'26_hv2_history_set_guards_complete_write_xmin_from_v22',aclProofField:'complete_write_xmin_acl_match'},
  'recorded-live-ledger-v7':{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V7',patchLevel:'26_hv2_live_ledger_pairs_complete_write_xmin_from_v22',aclProofField:'complete_write_xmin_acl_match',observationProofField:'recorded_live_balance_contract_match',requiredObservation:'RECORDED_LIVE_LEDGER_PAIRS_V7',runtimeSqlPatch:'adapters/postgres/patches/0026-live-ledger-balance-pairs.sql'},
 });
 assert.equal(contract.full.patchLevel,'26_hv2_history_set_guards_from_v22');
 contractBlock(contract);
});
test('wrong formats, omitted ACL proof, unknown selectors and extra fields reject',()=>{
 for(const mutate of [
  c=>{c.full.patchLevel='26_unregistered_legacy_drift';},
  c=>{c.full.catalogProfiles['complete-write-v6'].format='EXACT26_RUNTIME_CATALOG_EXPORT_V5';},
  c=>{c.full.catalogProfiles['complete-write-v6'].aclProofField=null;},
  c=>{c.full.catalogProfiles['complete-write-v6'].patchLevel=c.full.patchLevel;},
  c=>{delete c.full.catalogProfiles['legacy-v1'];},
  c=>{c.full.catalogProfiles.fallback=c.full.catalogProfiles['legacy-v1'];},
  c=>{c.full.catalogProfiles['complete-write-v6'].acceptExtra=true;},
 ]){
  const c=structuredClone(contract);assert.ok(c.full.catalogProfiles,'V6_RELEASE_CONTRACT_MISSING');mutate(c);
  assert.throws(()=>contractBlock(c),/INVALID_RELEASE/);
 }
});
test('generation is not trusted-helper approval',()=>{
 const source=fs.readFileSync(path.join(root,'scripts/release/generate-release-contract.mjs'),'utf8');
 assert.ok(!source.includes('await writeFile(bootPath, boot)'), 'GENERATOR_MUST_NOT_WRITE_APPROVAL_PIN');
 assert.ok(source.includes('DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED'));
});
