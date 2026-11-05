import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fresh35DumpSqlForNativeClient,fresh35PatchTransactionBody,FRESH35_COMBINED_BASE_ARTIFACTS,combinedSha256} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
test('native dump conversion removes only the matching restrict pair',()=>{
 const sql='-- source\n\\restrict abcd1234\nDO $$ BEGIN RAISE EXCEPTION \'KEEP\'; END $$;\n\\unrestrict abcd1234\n';const out=fresh35DumpSqlForNativeClient(sql);assert.equal(out,"-- source\nDO $$ BEGIN RAISE EXCEPTION 'KEEP'; END $$;\n");
 for(const bad of [sql.replace('\\unrestrict abcd1234','\\unrestrict other'),sql+'\\connect other\n',sql.replace('\\restrict abcd1234\n','')])assert.throws(()=>fresh35DumpSqlForNativeClient(bad),/RESTRICT/);
});
test('only one exact patch transaction is absorbed and all internal guards stay',()=>{
 const sql="-- patch\nBEGIN;\nDO $$ BEGIN RAISE EXCEPTION 'guard'; END $$;\nCOMMIT;\n";assert.equal(fresh35PatchTransactionBody(sql),"-- patch\nDO $$ BEGIN RAISE EXCEPTION 'guard'; END $$;\n");
 for(const bad of [sql+'COMMIT;\n',sql.replace('BEGIN;','BEGIN;\nBEGIN;'),sql+'SELECT 1;',sql.replace('COMMIT;','\\connect other\nCOMMIT;')])assert.throws(()=>fresh35PatchTransactionBody(bad),/TRANSACTION/);
});
test('immutable r2 refusal is a pinned input and never a stripped SQL gate',async()=>{
 const directory='/workspace/shared/fresh35-install-review-plan-20261105-r2';
 for(const [name,sha] of Object.entries(FRESH35_COMBINED_BASE_ARTIFACTS))assert.equal(combinedSha256(await readFile(directory+'/'+name)),sha,name);
 const entry=await readFile(directory+'/00-BLOCKED-entry.sql','utf8');assert.match(entry,/RAISE EXCEPTION 'FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'/);assert.doesNotMatch(entry,/CREATE|GRANT|INSERT|\\include/);
});
