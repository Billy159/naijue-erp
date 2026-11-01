/** Pure source-input negatives. Does not run a database or alter active files. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp,rm,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {historicalClosureDescriptor,verifyHistoricalInputBytes,verifyActiveSuccessorInputBytes,materializeHistoricalOracle,historicalOracleData} from './oracle.mjs';
test('original fixture bytes fixed; tampered native/package or unknown path cannot become oracle',async()=>{
 const d=await historicalClosureDescriptor();assert.equal(d.files,417);assert.equal(d.overlays,2);
 const native=await readFile(new URL('./fixtures/native-import-accounting-capability.original.txt',import.meta.url)),pkg=await readFile(new URL('./fixtures/package.original.json',import.meta.url));
 assert.equal(await verifyHistoricalInputBytes('adapters/postgres/src/native-import-accounting-capability.ts',native),true);assert.equal(await verifyHistoricalInputBytes('package.json',pkg),true);
 assert.equal(await verifyActiveSuccessorInputBytes(await readFile(new URL('../../adapters/postgres/src/native-import-accounting-capability.ts',import.meta.url))),true);await assert.rejects(verifyActiveSuccessorInputBytes(native),/ACTIVE_SUCCESSOR_MUST_NOT_BE_REPLACED/);
 await assert.rejects(verifyHistoricalInputBytes('adapters/postgres/src/native-import-accounting-capability.ts',Buffer.concat([native,Buffer.from(' ')])),/EXACT_HISTORICAL/);await assert.rejects(verifyHistoricalInputBytes('package.json',Buffer.concat([pkg,Buffer.from(' ')])),/EXACT_HISTORICAL/);await assert.rejects(verifyHistoricalInputBytes('../foreign',pkg));assert.throws(()=>historicalOracleData({profile:'HISTORICAL_RUNTIME26_TEST_ORACLE_V1'}));
});
test('missing source refuses before creating a copied tree; accessors not invoked',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'historical-negative-'));try{await assert.rejects(materializeHistoricalOracle({sourceRoot:parent,scratchParent:parent}),/HISTORICAL_SOURCE_MEMBER_MISSING/);assert.deepEqual(await readdir(parent),[]);let invoked=0;await assert.rejects(materializeHistoricalOracle({get sourceRoot(){invoked++;return parent;}}));assert.equal(invoked,0);}finally{await rm(parent,{recursive:true,force:true});}
});
