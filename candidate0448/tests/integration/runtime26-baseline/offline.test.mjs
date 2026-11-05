/** Historical test entry only. Current migration27 is never admitted as26.
 * The original complete test body remains fixed in the 417-member oracle. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {materializeHistoricalOracle,historicalOracleData,closeHistoricalOracle} from '../../historical-runtime26/oracle.mjs';
import {loadSourceInventory} from './source-inventory.mjs';
const oracle=await materializeHistoricalOracle(),data=historicalOracleData(oracle);
after(async()=>{const closed=await closeHistoricalOracle(oracle);assert.equal(closed.sourceUnchanged,true);});
test('baseline historical wrapper uses original726 graph with exact26 migrations, not active27',async()=>{
 const migrations=(await readdir(path.join(data.root,'adapters/postgres/migrations'))).filter(p=>/^\d{4}.*\.sql$/.test(p));
 assert.equal(migrations.length,26);assert.ok(!migrations.some(p=>p.startsWith('0027_')));
 assert.equal(data.files,417);assert.equal(data.sourceFingerprint,'726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb');assert.equal(data.authority,'NONE');
});
test('unchanged current source loader still rejects actual unified migration27',async()=>{
 const migrations=await readdir(new URL('../../../adapters/postgres/migrations/',import.meta.url));
 assert.ok(migrations.includes('0027_unified_business_documents.sql'));
 await assert.rejects(loadSourceInventory(),/EXACT_26_SOURCE_MIGRATIONS_REQUIRED/);
});
await import(pathToFileURL(path.join(data.root,'tests/integration/runtime26-baseline/offline.test.mjs')).href);
