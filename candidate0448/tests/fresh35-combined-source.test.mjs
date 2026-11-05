import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,cp,writeFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fresh35DumpSqlForNativeClient,fresh35PatchTransactionBody,FRESH35_COMBINED_BASE_ARTIFACTS,combinedSha256,resolveFresh35ReferenceInputPaths} from '../scripts/release/unified-install/fresh35-combined-source-v1.mjs';
test('native dump conversion removes only the matching restrict pair',()=>{
 const sql='-- source\n\\restrict abcd1234\nDO $$ BEGIN RAISE EXCEPTION \'KEEP\'; END $$;\n\\unrestrict abcd1234\n';const out=fresh35DumpSqlForNativeClient(sql);assert.equal(out,"-- source\nDO $$ BEGIN RAISE EXCEPTION 'KEEP'; END $$;\n");
 for(const bad of [sql.replace('\\unrestrict abcd1234','\\unrestrict other'),sql+'\\connect other\n',sql.replace('\\restrict abcd1234\n','')])assert.throws(()=>fresh35DumpSqlForNativeClient(bad),/RESTRICT/);
});
test('only one exact patch transaction is absorbed and all internal guards stay',()=>{
 const sql="-- patch\nBEGIN;\nDO $$ BEGIN RAISE EXCEPTION 'guard'; END $$;\nCOMMIT;\n";assert.equal(fresh35PatchTransactionBody(sql),"-- patch\nDO $$ BEGIN RAISE EXCEPTION 'guard'; END $$;\n");
 for(const bad of [sql+'COMMIT;\n',sql.replace('BEGIN;','BEGIN;\nBEGIN;'),sql+'SELECT 1;',sql.replace('COMMIT;','\\connect other\nCOMMIT;')])assert.throws(()=>fresh35PatchTransactionBody(bad),/TRANSACTION/);
});
test('immutable r2 refusal is a pinned input and never a stripped SQL gate',async()=>{
 const inputs=await resolveFresh35ReferenceInputPaths(fileURLToPath(new URL('../../reference-inputs',import.meta.url)));
 const directory=inputs.baselineDirectory;
 for(const [name,sha] of Object.entries(FRESH35_COMBINED_BASE_ARTIFACTS))assert.equal(combinedSha256(await readFile(directory+'/'+name)),sha,name);
 const entry=await readFile(directory+'/00-BLOCKED-entry.sql','utf8');assert.match(entry,/RAISE EXCEPTION 'FRESH35_V2_INSTALL_CANDIDATE_NOT_AUTHORIZED'/);assert.doesNotMatch(entry,/CREATE|GRANT|INSERT|\\include/);
});

test('packaged reference inputs resolve without accessing original cloud paths',async()=>{
 const directory=fileURLToPath(new URL('../../reference-inputs',import.meta.url));
 const inputs=await resolveFresh35ReferenceInputPaths(directory);
 assert.equal(inputs.baselineDirectory,join(directory,'fresh35-install-review-plan-20261105-r2'));
 assert.ok(inputs.modelPath.startsWith(directory+'/'));assert.ok(inputs.functionsPath.startsWith(directory+'/'));
 assert.equal(Object.isFrozen(inputs),true);
});
test('reference inputs refuse an altered index or changed source bytes',async()=>{
 const original=fileURLToPath(new URL('../../reference-inputs',import.meta.url));
 const directory=await realpath(await mkdtemp(join(tmpdir(),'fresh35-reference-inputs-')));
 await cp(original,directory,{recursive:true});
 const index=JSON.parse(await readFile(join(directory,'INDEX.json'),'utf8'));
 const path=join(directory,index[0].package_path.slice('delivery/reference-inputs/'.length));
 await writeFile(path,'different');
 await assert.rejects(resolveFresh35ReferenceInputPaths(directory),/REFERENCE_INPUT_DIFFERS/);
 index[0].package_path='delivery/reference-inputs/../outside';
 await writeFile(join(directory,'INDEX.json'),JSON.stringify(index));
 await assert.rejects(resolveFresh35ReferenceInputPaths(directory),/REFERENCE_INDEX_BINDING_DIFFERS/);
});
