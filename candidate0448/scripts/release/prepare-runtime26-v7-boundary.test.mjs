// SOURCE ONLY; not executed by preparer. Apply alongside recovered tests before implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {renderRuntime26V7Preparation,V7_STORAGE_PATCH_SHA256} from './prepare-runtime26-v7.mjs';
const NOW=1800000000000,SOURCE='c'.repeat(40),sha=b=>createHash('sha256').update(b).digest('hex');
const patch=readFileSync(new URL('../../adapters/postgres/patches/0026-live-ledger-balance-pairs.sql',import.meta.url));
const fixture=()=>({version:'RUNTIME26_V7_LIVE_PAIR_PREPARATION_V1',decision:'AUTHORIZE_EXACT_ADDITIVE_PAIR_DDL_AND_FOUR_COLUMN_CELLS_ONLY',scope:'FRESH_ISOLATED_SYNTHETIC_ONLY',target:{database:'isolated_v7_synthetic_test',databaseOid:'99999',ownerRole:'isolated_owner',runtimeRole:'isolated_runtime',sessionUser:'isolated_admin',serverAddress:'127.0.0.1/32',serverPort:25432,postmasterStart:'2027-01-15 08:00:00+00'},from:'V6',to:'V7',beforeCatalogSha256:'a'.repeat(64),afterCatalogSha256:'b'.repeat(64),storagePatchSha256:V7_STORAGE_PATCH_SHA256,sourceCommit:SOURCE,startsAt:NOW-1000,expiresAt:NOW+60000,productionAuthorized:false});
const render=a=>{const bytes=Buffer.from(JSON.stringify(a));return renderRuntime26V7Preparation(bytes,sha(bytes),patch,SOURCE,NOW);};
test('preparation role observation is explicitly distinct from a fresh ordinary-login catalog',()=>{
 const r=render(fixture());assert.equal(r.catalogPinObservation,'ADMIN_SESSION_SET_ROLE_RUNTIME_ONLY');
 assert.equal(r.ordinaryRuntimeReviewStillRequired,true);assert.equal(r.runtimeWindowStillRequired,true);
 assert.match(r.sql,/current_user=session_user/);assert.match(r.sql,/SET LOCAL ROLE "isolated_runtime"/);
 assert.match(r.sql,/INTO STRICT r/);assert.match(r.sql,/NOT ordinary-login issuer evidence/);
 assert.equal(Object.hasOwn(r,'runtime26Review'),false);assert.equal(Object.hasOwn(r,'runtimeCatalogSha256'),false);
});
test('exact embedded patch retains both private PUBLIC revokes and never emits a standalone nested transaction',()=>{
 const {sql}=render(fixture());
 for(const routine of ['guard_recorded_live_balance_pair','validate_recorded_live_balance_commit'])assert.ok(sql.includes('REVOKE ALL ON FUNCTION naijue_erp.'+routine+'() FROM PUBLIC;'));
 assert.equal(sql.match(/^BEGIN;$/gm).length,1);assert.equal(sql.match(/^COMMIT;$/gm).length,1);
 assert.equal(sql.match(/^GRANT /gm).length,2);assert.doesNotMatch(sql,/^GRANT.*(?:staff|user_account|hall|warehouse|CONNECT|EXECUTE|USAGE)/m);
 const {sql:again}=render(fixture());assert.equal(sql,again);
});
test('source identity and window data remain fail closed even with matching approval byte hash',()=>{
 const bytes=Buffer.from(JSON.stringify(fixture()));
 for(const source of [undefined,null,{},[],SOURCE.toUpperCase(),'d'.repeat(40)])assert.throws(()=>renderRuntime26V7Preparation(bytes,sha(bytes),patch,source,NOW));
 for(const now of [NaN,Infinity,'1800000000000',NOW+60000])assert.throws(()=>renderRuntime26V7Preparation(bytes,sha(bytes),patch,SOURCE,now));
 for(const mutate of [a=>a.target={},a=>a.target=null,a=>a.target.sessionUser='x$v7_probe$',a=>a.target.serverPort=65536,a=>a.afterCatalogSha256=a.beforeCatalogSha256,a=>a.startsAt=NOW+1,a=>a.expiresAt=a.startsAt+900001]){const a=fixture();mutate(a);assert.throws(()=>render(a));}
});
test('immutable predecessor and runtime review schema are not edited by additive successor',()=>{
 const old=readFileSync(new URL('./prepare-runtime26-v6.mjs',import.meta.url));
 assert.equal(sha(old),'8c3ef5b3dda046e83c6c9995eb6a5a588561fa07e13a4a12fb188f2c30e613a1');
 const issuer=readFileSync(new URL('../../adapters/postgres/src/native-import-accounting-capability.ts',import.meta.url),'utf8');
 assert.ok(issuer.includes('const review = exactData(parsed, ["version", "decision", "target", "catalog", "purposes", "scope", "independentReview", "realImportExecutionAuthorized"]);'));
 assert.ok(issuer.includes('(manifest-\'identity\')::text'));assert.ok(issuer.includes('rolname IN(current_user,session_user'));
 const proposal=readFileSync(new URL('./prepare-runtime26-v7.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(proposal,/from ['"](?:pg|node:fs|node:child_process)|createNativeRuntime26Issuer|writeFile|process\.env|spawn\(|execFile|connect\(/);
});
