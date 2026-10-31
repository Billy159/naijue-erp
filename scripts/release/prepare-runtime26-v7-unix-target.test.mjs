// SOURCE-ONLY tests first. Not run by preparer; no PG or credential access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as proposal from './prepare-runtime26-v7.mjs';
const {renderRuntime26V7Preparation,V7_STORAGE_PATCH_SHA256}=proposal;
import {renderRuntime26V7Preparation as tcpOnly} from './prepare-runtime26-v7-tcp-only-0018.fixture.mjs';
const NOW=1800000000000,SOURCE='c'.repeat(40),sha=b=>createHash('sha256').update(b).digest('hex');
const patch=readFileSync(new URL('../../adapters/postgres/patches/0026-live-ledger-balance-pairs.sql',import.meta.url));
const fixture=()=>({version:'RUNTIME26_V7_LIVE_PAIR_PREPARATION_V1',decision:'AUTHORIZE_EXACT_ADDITIVE_PAIR_DDL_AND_FOUR_COLUMN_CELLS_ONLY',scope:'FRESH_ISOLATED_SYNTHETIC_ONLY',target:{database:'fresh_isolated_v7_synthetic',databaseOid:'99999',ownerRole:'isolated_owner',runtimeRole:'isolated_runtime',sessionUser:'isolated_admin',serverAddress:'127.0.0.1/32',serverPort:25432,postmasterStart:'2027-01-15 08:00:00+00'},from:'V6',to:'V7',beforeCatalogSha256:'a'.repeat(64),afterCatalogSha256:'b'.repeat(64),storagePatchSha256:V7_STORAGE_PATCH_SHA256,sourceCommit:SOURCE,startsAt:NOW-1000,expiresAt:NOW+60000,productionAuthorized:false});
const unixFixture=()=>{const a=fixture();a.target={...a.target,transport:'UNIX_SOCKET_EXACT_V1',serverAddress:null,serverPort:null,serverConfiguredPort:55439,unixSocketDirectory:'/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket',listenAddresses:''};return a;};
const render=(a,fn=renderRuntime26V7Preparation)=>{const b=Buffer.from(JSON.stringify(a));return fn(b,sha(b),patch,SOURCE,NOW);};
test('explicit exact Unix profile binds NULL inet identity and fixed single socket/configured port/listener guards twice',()=>{
 const a=unixFixture(),before=JSON.stringify(a),r=render(a);assert.equal(JSON.stringify(a),before);
 assert.deepEqual(proposal.V7_UNIX_TARGET,{transport:'UNIX_SOCKET_EXACT_V1',serverConfiguredPort:55439,unixSocketDirectory:'/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket',listenAddresses:''});
 assert.equal(Object.isFrozen(proposal.V7_UNIX_TARGET),true);
 for(const fragment of ['inet_server_addr() IS NULL','inet_server_port() IS NULL',"current_setting('port')='55439'","current_setting('unix_socket_directories')='/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket'","current_setting('listen_addresses')=''","current_database()='fresh_isolated_v7_synthetic'","session_user='isolated_admin'","pg_postmaster_start_time()::text='2027-01-15 08:00:00+00'"])
  assert.equal(r.sql.split(fragment).length-1,2,fragment);
 assert.equal(r.addedCells.length,4);assert.equal(r.sql.match(/^GRANT /gm).length,2);assert.equal(r.ordinaryRuntimeReviewStillRequired,true);assert.equal(r.grantsAuthenticationOrConnect,false);
 assert.doesNotMatch(r.sql,/inet_server_addr\(\)::text='null'|inet_server_port\(\)=null|ALTER SYSTEM|pg_reload_conf|CREATE ROLE|ALTER ROLE|GRANT CONNECT|WITH GRANT OPTION/);
});
test('unchanged TCP shape yields byte-identical SQL and metadata to frozen0018 for distinct exact targets',()=>{
 for(const port of [1025,25432,65535]){const a=fixture();a.target.serverPort=port;assert.deepEqual(render(a),render(a,tcpOnly));}
 assert.throws(()=>render(unixFixture(),tcpOnly),/EXACT_ISOLATED_TARGET_REQUIRED/);
});
test('no NULL-only inference, arbitrary path, multiple sockets, network listener or alternate Unix profile',()=>{
 for(const change of [a=>delete a.target.transport,a=>a.target.transport='unix',a=>a.target.transport='TCP',a=>a.target.transport=null,a=>delete a.target.serverConfiguredPort,a=>a.target.serverConfiguredPort=55440,a=>a.target.serverConfiguredPort='55439',a=>a.target.serverPort=55439,a=>a.target.serverAddress='127.0.0.1/32',a=>a.target.unixSocketDirectory='/tmp',a=>a.target.unixSocketDirectory+='/..',a=>a.target.unixSocketDirectory+='/',a=>a.target.unixSocketDirectory+=',/tmp',a=>a.target.unixSocketDirectory='@abstract',a=>a.target.listenAddresses='127.0.0.1',a=>a.target.listenAddresses='*',a=>a.target.listenAddresses=null,a=>a.target.extra=true,a=>a.target.systemIdentifier='unreviewedExtra']){const a=unixFixture();change(a);assert.throws(()=>render(a),change.toString());}
 for(const change of [a=>a.target.serverAddress=null,a=>a.target.serverPort=null,a=>a.target.transport='UNIX_SOCKET_EXACT_V1',a=>a.target.serverAddress='::1/128']){const a=fixture();change(a);assert.throws(()=>render(a));}
});
test('Unix selection does not bypass existing authority/source/patch/catalog/role/window checks',()=>{
 for(const change of [a=>a.productionAuthorized=true,a=>a.scope='OLD_P2_REUSE',a=>a.sourceCommit='d'.repeat(40),a=>a.storagePatchSha256='0'.repeat(64),a=>a.from='V5',a=>a.to='V6',a=>a.afterCatalogSha256=null,a=>a.afterCatalogSha256=a.beforeCatalogSha256,a=>a.expiresAt=NOW,a=>a.expiresAt=a.startsAt+900001,a=>a.startsAt=NOW+1,a=>a.target.runtimeRole=a.target.ownerRole,a=>a.target.sessionUser=a.target.runtimeRole,a=>delete a.target.databaseOid,a=>a.target.postmasterStart='injected$v7_guard$']){const a=unixFixture();change(a);assert.throws(()=>render(a));}
 const b=Buffer.from(JSON.stringify(unixFixture()));
 assert.throws(()=>renderRuntime26V7Preparation(b,'0'.repeat(64),patch,SOURCE,NOW),/EXTERNAL_APPROVAL_PIN_REQUIRED/);
 assert.throws(()=>renderRuntime26V7Preparation(b,sha(b),Buffer.concat([patch,Buffer.from('changed')]),SOURCE,NOW),/EXACT_SOURCE_STORAGE_PATCH_REQUIRED/);
 assert.throws(()=>renderRuntime26V7Preparation(b,sha(b),patch,'d'.repeat(40),NOW),/FRESH_SOURCE_AND_CATALOG_PINS_REQUIRED/);
 const r=render(unixFixture());
 for(const code of ['EXACT_TARGET_OR_WINDOW_CHANGED','ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED','NO_TABLE_PRIVILEGES_REQUIRED','EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED'])assert.equal(r.sql.split(code).length-1,2,code);
 assert.equal(r.sql.match(/r.source_routines_match IS DISTINCT FROM true/g).length,2);assert.equal(r.sql.match(/r.recorded_live_balance_contract_match IS DISTINCT FROM true/g).length,1);
 assert.equal(r.catalogPinObservation,'ADMIN_SESSION_SET_ROLE_RUNTIME_ONLY');assert.equal(r.runtimeWindowStillRequired,true);assert.equal(r.productionAuthorized,false);
});
test('frozen TCP fixture bytes are independently pinned and proposal has no connection/config mutation behavior',()=>{
 const old=readFileSync(new URL('./prepare-runtime26-v7-tcp-only-0018.fixture.mjs',import.meta.url));assert.equal(sha(old),'9e6e174ad20e43153d098d1a718711c88da0ce122d5cb06663e29e1d96ef2e44');
 const source=readFileSync(new URL('./prepare-runtime26-v7.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/from ['"](?:pg|node:fs|node:child_process)|writeFile|process\.env|spawn\(|execFile|connect\(/);
});

// Source-approved QA178 transport only. OIDs below are synthetic renderer-test values,
// never evidence that a new database or an approval exists on any server.
const qa178Fixture=()=>{const a=unixFixture();a.target={...a.target,transport:'UNIX_SOCKET_QA178_EXACT_V1',database:'demo_8877_v7_r1_rehearsal_20261031_01',ownerRole:'v7_r1_owner_20261031_01',runtimeRole:'v7_r1_runtime_20261031_01',sessionUser:'t15_prod_bootstrap',serverConfiguredPort:5432,unixSocketDirectory:'/qa-socket'};return a;};
test('QA178 fixed12key Unix branch binds exact endpoint/new names before and after and still grants only original4cells',()=>{
 const a=qa178Fixture(),original=JSON.stringify(a),r=render(a);assert.equal(Object.keys(a.target).length,12);assert.equal(JSON.stringify(a),original);
 for(const fragment of ['inet_server_addr() IS NULL','inet_server_port() IS NULL',"current_setting('port')='5432'","current_setting('unix_socket_directories')='/qa-socket'","current_setting('listen_addresses')=''","current_database()='demo_8877_v7_r1_rehearsal_20261031_01'","session_user='t15_prod_bootstrap'","current_user=session_user"])
  assert.equal(r.sql.split(fragment).length-1,2,fragment);
 assert.equal(r.addedCells.length,4);assert.equal(r.sql.match(/^GRANT /gm).length,2);assert.equal(r.storagePatchSha256,V7_STORAGE_PATCH_SHA256);assert.equal(r.grantsAuthenticationOrConnect,false);assert.equal(r.productionAuthorized,false);assert.equal(r.ordinaryRuntimeReviewStillRequired,true);
 assert.doesNotMatch(r.sql,/GRANT DELETE|GRANT SELECT \("cmin"|CREATE ROLE|ALTER ROLE|GRANT CONNECT|pg_reload_conf|ALTER SYSTEM/);
});
test('QA178 rejects wrong names endpoint discriminator oldOID extra/nullonly and original source/ACL/window violations',()=>{
 for(const mutate of [a=>delete a.target.transport,a=>a.target.transport='UNIX_SOCKET_EXACT_V1',a=>a.target.transport='unix',a=>a.target.database='erp_rewrite_20261022_r1',a=>a.target.ownerRole='erp_rewrite_owner_20261022',a=>a.target.runtimeRole='erp_rewrite_runtime_20261022',a=>a.target.sessionUser='other_admin',a=>a.target.serverConfiguredPort='5432',a=>a.target.serverConfiguredPort=55439,a=>a.target.serverPort=5432,a=>a.target.serverAddress='127.0.0.1/32',a=>a.target.unixSocketDirectory='/tmp',a=>a.target.unixSocketDirectory+='/..',a=>a.target.unixSocketDirectory+='/',a=>a.target.unixSocketDirectory+=',/tmp',a=>a.target.unixSocketDirectory='@abstract',a=>a.target.listenAddresses='*',a=>a.target.extra=true,a=>a.target.databaseOid=null,a=>a.target.databaseOid='16391',a=>a.target.databaseOid='21551',a=>a.target.databaseOid='1027659',a=>a.target.runtimeRole=a.target.ownerRole,a=>a.from='V5',a=>a.to='V8',a=>a.expiresAt=NOW,a=>a.expiresAt=a.startsAt+900001,a=>a.sourceCommit='d'.repeat(40),a=>a.afterCatalogSha256=a.beforeCatalogSha256,a=>a.productionAuthorized=true]){
  const a=qa178Fixture();mutate(a);assert.throws(()=>render(a),mutate.toString());
 }
 const r=render(qa178Fixture());for(const code of ['EXACT_TARGET_OR_WINDOW_CHANGED','ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED','NO_TABLE_PRIVILEGES_REQUIRED','EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED'])assert.equal(r.sql.split(code).length-1,2,code);
});
test('original cloud Unix generated return bytes remain equal to two captured preQA source fixtures',()=>{
 // Captured from the unchanged cloud renderer before adding QA178, not PG/catalog/approval evidence.
 const expected=['0bce9b6814b146f7e9a607e48d2ed8cf96c98c66fde8ffa5e83739b4dc98f739','0a5f953928bd68a83f9e1ff251d6ce7a669beda0b71dacb1bdc8eb672004c009'];
 for(let i=0;i<2;i++){const a=unixFixture();if(i)Object.assign(a.target,{database:'another_cloud_synthetic',databaseOid:'88888',ownerRole:'another_owner',runtimeRole:'another_runtime',sessionUser:'another_admin',postmasterStart:'2027-01-15 09:00:00+00'});assert.equal(sha(Buffer.from(JSON.stringify(render(a)))),expected[i]);}
});
