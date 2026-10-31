// Pure source/contract tests. No PostgreSQL, backend start, Docker, or browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.RELEASE_SOURCE_ROOT ?? path.resolve(new URL('../..',import.meta.url).pathname);
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const {contractBlock,requireReviewedCapacityHelper}=await import(pathToFileURL(path.join(root,'scripts/release/generate-release-contract.mjs')));
const contract=JSON.parse(read('config/release-contract.json'));
const v7Name='recorded-live-ledger-v7';
const v7={format:'EXACT26_RUNTIME_CATALOG_EXPORT_V7',patchLevel:'26_hv2_live_ledger_pairs_complete_write_xmin_from_v22',aclProofField:'complete_write_xmin_acl_match',observationProofField:'recorded_live_balance_contract_match',requiredObservation:'RECORDED_LIVE_LEDGER_PAIRS_V7',runtimeSqlPatch:'adapters/postgres/patches/0026-live-ledger-balance-pairs.sql'};
const oldProfiles={
 'legacy-v1':{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V1',patchLevel:'26_hv2_history_set_guards_from_v22',aclProofField:null},
 'complete-write-v6':{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V6',patchLevel:'26_hv2_history_set_guards_complete_write_xmin_from_v22',aclProofField:'complete_write_xmin_acl_match'},
};
test('V7 is finite and additive; exact historical V1/V6 descriptors are unchanged',()=>{
 assert.deepEqual(Object.keys(contract.full.catalogProfiles),[...Object.keys(oldProfiles),v7Name,'recorded-live-write-v8']);
 for(const [name,expected] of Object.entries(oldProfiles))assert.deepEqual(contract.full.catalogProfiles[name],expected);
 assert.deepEqual(contract.full.catalogProfiles[v7Name],v7);
 assert.equal(contract.full.patchLevel,oldProfiles['legacy-v1'].patchLevel);
 contractBlock(contract);
});
test('V7 proof/consumer/patch facts cannot be omitted, substituted, widened or aliased',()=>{
 for(const mutate of [
  c=>{delete c.full.catalogProfiles[v7Name];},
  c=>{c.full.catalogProfiles[v7Name].format='EXACT26_RUNTIME_CATALOG_EXPORT_V6';},
  c=>{c.full.catalogProfiles[v7Name].patchLevel=oldProfiles['complete-write-v6'].patchLevel;},
  c=>{c.full.catalogProfiles[v7Name].aclProofField=null;},
  c=>{delete c.full.catalogProfiles[v7Name].observationProofField;},
  c=>{c.full.catalogProfiles[v7Name].observationProofField='complete_write_xmin_acl_match';},
  c=>{c.full.catalogProfiles[v7Name].requiredObservation='EXACT26';},
  c=>{c.full.catalogProfiles[v7Name].runtimeSqlPatch='adapters/postgres/patches/0026-history-revision-set-guards-successor.sql';},
  c=>{c.full.catalogProfiles[v7Name].acceptExtra=true;},
  c=>{c.full.catalogProfiles['complete-write-v7']=c.full.catalogProfiles[v7Name];},
  c=>{c.runtimeSqlPatches=c.runtimeSqlPatches.filter(row=>row.source!==v7.runtimeSqlPatch);},
 ]){
  const c=structuredClone(contract);assert.ok(c.full.catalogProfiles[v7Name],'V7_RELEASE_PROFILE_MISSING');mutate(c);
  assert.throws(()=>contractBlock(c),/INVALID_RELEASE/);
 }
});
test('V7 additive SQL is packaged after the immutable original11, never auto-executed',()=>{
 const originals=['0026-v9-empty-history-publication-dispatch.sql','0026-v11-document-specification-save.sql','0026-v14-core-initialization.sql','0026-history-revision-current-base.sql','0026-category-reorder-undo.sql','0026-v19-barcode-scheme-initialization.sql','0026-v20-history-insert-source-identity.sql','0026-v22-staged-prefix-bind.sql','0026-history-responsible-null-successor.sql','0026-category-depth-successor.sql','0026-history-revision-set-guards-successor.sql'];
 assert.deepEqual(contract.runtimeSqlPatches.slice(0,11),originals.map(name=>({source:'adapters/postgres/patches/'+name,member:'patches/'+name})));
 assert.equal(contract.runtimeSqlPatches.length,12);
 assert.deepEqual(contract.runtimeSqlPatches[11],{source:v7.runtimeSqlPatch,member:'patches/0026-live-ledger-balance-pairs.sql'});
 const ddl=read(v7.runtimeSqlPatch);
 assert.match(ddl,/ADD COLUMN quantity_before bigint/);assert.match(ddl,/ADD COLUMN quantity_after bigint/);
 assert.match(ddl,/No GRANT here/);assert.doesNotMatch(ddl,/^\s*GRANT\s/im);
 assert.match(ddl,/ledger_recorded_balance_pair/);assert.match(ddl,/zz_live_ledger_balance_snapshot/);assert.match(ddl,/recorded_live_balance_final_consistency/);
});
test('the compiled non-CORE consumer and reader/writers still demand the same V7 storage',()=>{
 const consumer=read('apps/api/src/postgres-read-api.ts');
 assert.match(consumer,/const requiresRecordedLivePairs = capabilities\?\.coreInitializationRead == null/);
 // The current API consumer is versioned separately; V7 issuer proof retains its original meaning.
 const issuer=read('adapters/postgres/src/native-import-accounting-capability.ts');
 assert.match(issuer,/jsonb_array_length\(manifest->'routines'\)=137/);
 assert.match(issuer,/AS recorded_live_balance_contract_match/);
 assert.match(issuer,/recordedLivePairs && row\.recorded_live_balance_contract_match !== true/);
 assert.match(issuer,/completeWriteXmin && row\.complete_write_xmin_acl_match !== true/);
 assert.match(issuer,/a\.attnum,'SELECT'/);assert.match(issuer,/a\.attnum,'INSERT'/);
 assert.match(read('adapters/postgres/src/inventory-ledger-query-reader.ts'),/l\.quantity_before::text AS quantity_before, l\.quantity_after::text AS quantity_after/);
 for(const writer of ['sales-unit-of-work.ts','transfer-unit-of-work.ts']){
  const source=read('adapters/postgres/src/'+writer);
  assert.match(source,/posted_at, quantity_before, quantity_after\)/);
  assert.match(source,/transition\.quantityBefore\.toString\(\), transition\.quantityAfter\.toString\(\)/);
 }
});
test('changed helper bytes cannot borrow the original capacity approval and generation cannot self-approve',()=>{
 const originalPin='f5a7e6aa2417579658a470f0c2a1ce6b6bf8c136c7abf300f0b2bf943e038852';
 const changed=read('scripts/release/deploy-candidate.py')+'\n# synthetic changed byte, never executed\n';
 assert.throws(()=>requireReviewedCapacityHelper(changed,`DEPLOYMENT_CAPACITY_SHA256 = '${originalPin}'\n`),/DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED/);
 assert.doesNotMatch(read('scripts/release/generate-release-contract.mjs'),/await writeFile\(bootPath, boot\)/);
});
