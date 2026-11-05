/** Rebuilt test only. Real materialization requires original exact environment. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,readdir,symlink} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import {materializeHistoricalOracle,historicalOracleData,closeHistoricalOracle,verifyHistoricalInputBytes} from './oracle.mjs';
const retained=[
 ['adapters/postgres/src/current-form-reader.ts','fixtures/adapters__postgres__src__current-form-reader.ts.original.txt'],
 ['adapters/postgres/src/product-maintenance-store.ts','fixtures/adapters__postgres__src__product-maintenance-store.ts.original.txt'],
 ['apps/api/src/current-form-http.ts','fixtures/apps__api__src__current-form-http.ts.original.txt'],
 ['apps/api/src/postgres-read-api.ts','fixtures/apps__api__src__postgres-read-api.ts.original.txt'],
 ['apps/api/src/product-maintenance-http.ts','fixtures/apps__api__src__product-maintenance-http.ts.original.txt'],
 ['packages/application/src/catalogue-maintenance-service.ts','fixtures/packages__application__src__catalogue-maintenance-service.ts.original.txt'],
 ['packages/application/src/catalogue-maintenance-validation.ts','fixtures/packages__application__src__catalogue-maintenance-validation.ts.original.txt'],
 ['packages/application/src/inventory-ledger-query-validation.ts','fixtures/packages__application__src__inventory-ledger-query-validation.ts.original.txt'],
 ['packages/application/src/product-maintenance-ports.ts','fixtures/packages__application__src__product-maintenance-ports.ts.original.txt'],
 ['packages/application/src/product-maintenance-service.ts','fixtures/packages__application__src__product-maintenance-service.ts.original.txt'],
 ['packages/application/src/product-maintenance-validation.ts','fixtures/packages__application__src__product-maintenance-validation.ts.original.txt'],
 ['packages/application/src/request-hash.ts','fixtures/request-hash.original.txt'],
 ['adapters/postgres/src/auth-store.ts','fixtures/postgres-auth-store.original.txt'],
 ['packages/authentication/src/ports.ts','fixtures/authentication-ports.original.txt'],
 ['packages/authentication/src/service.ts','fixtures/authentication-service.original.txt'],
 ['adapters/postgres/src/sales-native-facts.ts','fixtures/postgres-sales-native-facts.original.txt'],
 ['apps/api/src/document-list-wire.ts','fixtures/document-list-wire.original.txt'],
 ['apps/api/src/sales-query-http.ts','fixtures/sales-query-http.original.txt'],
 ['apps/api/src/transfer-query-http.ts','fixtures/transfer-query-http.original.txt'],
 ['packages/application/src/sales-query-service.ts','fixtures/sales-query-service.original.txt'],
 ['packages/application/src/transfer-query-service.ts','fixtures/transfer-query-service.original.txt'],
 ['packages/application/src/current-form-ports.ts','fixtures/current-form-ports.original.txt'],
 ['packages/application/src/current-form-validation.ts','fixtures/current-form-validation.original.txt'],
 ['adapters/postgres/src/sales-query-reader.ts','fixtures/sales-query-reader.original.txt'],
 ['adapters/postgres/src/history-revision-store.ts','fixtures/history-revision-store.original.txt'],
 ['adapters/postgres/src/inventory-posting-balances.ts','fixtures/inventory-posting-balances.original.txt'],
 ['adapters/postgres/src/sales-unit-of-work.ts','fixtures/sales-unit-of-work.original.txt'],
 ['adapters/postgres/src/transfer-query-reader.ts','fixtures/transfer-query-reader.original.txt'],
 ['adapters/postgres/src/transfer-unit-of-work.ts','fixtures/transfer-unit-of-work.original.txt'],
 ['apps/api/src/input.ts','fixtures/input.original.txt'],
 ['apps/api/src/sales-http.ts','fixtures/sales-http.original.txt'],
 ['apps/api/src/transfer-http.ts','fixtures/transfer-http.original.txt'],
 ['apps/api/src/transfer-input.ts','fixtures/transfer-input.original.txt'],
 ['packages/application/src/inventory-posting.ts','fixtures/inventory-posting.original.txt'],
 ['packages/application/src/native-sales-preparation.ts','fixtures/native-sales-preparation.original.txt'],
 ['packages/application/src/native-transfer-preparation.ts','fixtures/native-transfer-preparation.original.txt'],
 ['packages/application/src/ports.ts','fixtures/ports.original.txt'],
 ['packages/application/src/sales-business-rules.ts','fixtures/sales-business-rules.original.txt'],
 ['packages/application/src/sales-change-evidence.ts','fixtures/sales-change-evidence.original.txt'],
 ['packages/application/src/sales-native-facts.ts','fixtures/sales-native-facts.original.txt'],
 ['packages/application/src/sales-query-ports.ts','fixtures/sales-query-ports.original.txt'],
 ['packages/application/src/sales-service.ts','fixtures/sales-service.original.txt'],
 ['packages/application/src/transfer-ports.ts','fixtures/transfer-ports.original.txt'],
 ['packages/application/src/transfer-query-ports.ts','fixtures/transfer-query-ports.original.txt'],
 ['packages/application/src/transfer-service.ts','fixtures/transfer-service.original.txt'],
 ['packages/domain/src/documents.ts','fixtures/documents.original.txt'],
 ['packages/domain/src/inventory.ts','fixtures/inventory.original.txt'],
 ['tests/integration/runtime26-baseline/offline.test.mjs','fixtures/runtime26-baseline-offline.original.txt'],
 ['adapters/postgres/src/bounded-pool.ts','fixtures/adapters__postgres__src__bounded-pool.ts.original.txt'],
 ['adapters/postgres/src/catalogue-completeness.ts','fixtures/adapters__postgres__src__catalogue-completeness.ts.original.txt'],
 ['adapters/postgres/src/inventory-ledger-query-reader.ts','fixtures/adapters__postgres__src__inventory-ledger-query-reader.ts.original.txt'],
 ['adapters/postgres/src/inventory-query-reader.ts','fixtures/adapters__postgres__src__inventory-query-reader.ts.original.txt'],
 ['adapters/postgres/src/maintenance-command-unit-of-work.ts','fixtures/adapters__postgres__src__maintenance-command-unit-of-work.ts.original.txt'],
 ['adapters/postgres/src/native-document-specification.ts','fixtures/adapters__postgres__src__native-document-specification.ts.original.txt'],
 ['adapters/postgres/src/organization-maintenance-store.ts','fixtures/adapters__postgres__src__organization-maintenance-store.ts.original.txt'],
 ['adapters/postgres/src/product-details-query-reader.ts','fixtures/adapters__postgres__src__product-details-query-reader.ts.original.txt'],
 ['adapters/postgres/src/product-management-query-reader.ts','fixtures/adapters__postgres__src__product-management-query-reader.ts.original.txt'],
 ['adapters/postgres/src/product-query-reader.ts','fixtures/adapters__postgres__src__product-query-reader.ts.original.txt'],
 ['packages/application/src/document-specification.ts','fixtures/packages__application__src__document-specification.ts.original.txt'],
 ['packages/application/src/inventory-query-contracts.ts','fixtures/packages__application__src__inventory-query-contracts.ts.original.txt'],
 ['packages/application/src/inventory-query-response.ts','fixtures/packages__application__src__inventory-query-response.ts.original.txt'],
 ['packages/application/src/inventory-query-validation.ts','fixtures/packages__application__src__inventory-query-validation.ts.original.txt'],
 ['packages/application/src/organization-maintenance-ports.ts','fixtures/packages__application__src__organization-maintenance-ports.ts.original.txt'],
 ['packages/application/src/organization-maintenance-validation.ts','fixtures/packages__application__src__organization-maintenance-validation.ts.original.txt'],
 ['packages/application/src/product-management-query-service.ts','fixtures/packages__application__src__product-management-query-service.ts.original.txt']
];
const root=new URL('../../',import.meta.url);
test('all65 retained inputs accept original bytes only, rejecting same-length tamper and successor',async()=>{
 assert.equal(retained.length,65);
 for(const [leaf,fixture] of retained){
  const old=await readFile(new URL('./'+fixture,import.meta.url));
  assert.equal(await verifyHistoricalInputBytes(leaf,old),true);
  const changed=Buffer.from(old);changed[0]^=1;
  await assert.rejects(verifyHistoricalInputBytes(leaf,changed),/EXACT_HISTORICAL_MEMBER_BYTES_REQUIRED/);
  await assert.rejects(verifyHistoricalInputBytes(leaf,await readFile(new URL(leaf,root))),/EXACT_HISTORICAL_MEMBER_BYTES_REQUIRED/);
 }
});
test('external roots require all original leaves and exact26; never substitute current or missing inputs',{
 skip:process.version!=='v24.21.0'?'NOT RUN: exact Node24.21.0 and installed pinned dependencies required':false
},async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'rebuilt-oracle-external-')),source=path.join(parent,'original'),scratch=path.join(parent,'scratch');
 let token;
 try{
  await mkdir(source);await mkdir(scratch);
  token=await materializeHistoricalOracle({scratchParent:scratch});
  const data=historicalOracleData(token),manifest=JSON.parse(await readFile(new URL('./HISTORICAL-TEST-CLOSURE.json',import.meta.url),'utf8'));
  for(const row of manifest.files){const dest=path.join(source,row.path);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,await readFile(path.join(data.root,row.path)),{mode:0o600});}
  await closeHistoricalOracle(token);token=undefined;
  token=await materializeHistoricalOracle({sourceRoot:source,scratchParent:scratch});await closeHistoricalOracle(token);token=undefined;
  const migration27=path.join(source,'adapters/postgres/migrations/0027_unified_business_documents.sql');
  await writeFile(migration27,await readFile(new URL('adapters/postgres/migrations/0027_unified_business_documents.sql',root)));
  await assert.rejects(materializeHistoricalOracle({sourceRoot:source,scratchParent:scratch}),/EXACT_EXTERNAL_HISTORICAL_26_MIGRATIONS_REQUIRED/);
  assert.deepEqual(await readdir(scratch),[]);await rm(migration27);
  for(const [leaf,fixture] of retained){
   const dest=path.join(source,leaf),old=await readFile(dest),tampered=Buffer.from(old);tampered[0]^=1;
   for(const bytes of [tampered,await readFile(new URL(leaf,root)),null]){
    if(bytes===null)await rm(dest);else await writeFile(dest,bytes);
    await assert.rejects(materializeHistoricalOracle({sourceRoot:source,scratchParent:scratch}),/HISTORICAL_SOURCE_MEMBER_CHANGED|REGULAR_EXACT_HISTORICAL_MEMBER_REQUIRED|HISTORICAL_SOURCE_MEMBER_MISSING/);
    assert.deepEqual(await readdir(scratch),[]);
    await writeFile(dest,old,{mode:0o600});
   }
   // Even an exact historical byte sequence cannot be supplied through a link,
   // directory, or another root's missing-leaf fallback.
   await rm(dest);await symlink(new URL('./'+fixture,import.meta.url),dest);
   await assert.rejects(materializeHistoricalOracle({sourceRoot:source,scratchParent:scratch}),/REGULAR_EXACT_HISTORICAL_MEMBER_REQUIRED/);
   assert.deepEqual(await readdir(scratch),[]);await rm(dest);await mkdir(dest);
   await assert.rejects(materializeHistoricalOracle({sourceRoot:source,scratchParent:scratch}),/REGULAR_EXACT_HISTORICAL_MEMBER_REQUIRED/);
   assert.deepEqual(await readdir(scratch),[]);await rm(dest,{recursive:true});await writeFile(dest,old,{mode:0o600});
  }
 }finally{try{if(token)await closeHistoricalOracle(token);}finally{await rm(parent,{recursive:true,force:true});}}
});
