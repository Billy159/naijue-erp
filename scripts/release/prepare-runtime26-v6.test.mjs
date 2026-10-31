import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderRuntime26V6Preparation,HISTORY_COLUMNS} from './prepare-runtime26-v6.mjs';
const NOW=1800000000000;
const fixture=()=>({version:'RUNTIME26_V6_HISTORY_READ_PREPARATION_V1',decision:'AUTHORIZE_EXACT_HISTORY_SIXTEEN_READ_DELTA_ONLY',target:{database:'isolated_v6_test',databaseOid:'99999',ownerRole:'isolated_owner',runtimeRole:'isolated_runtime',sessionUser:'isolated_admin',serverAddress:'127.0.0.1/32',serverPort:25432,postmasterStart:'2027-01-15 08:00:00+00'},from:'V5',to:'V6',beforeCatalogSha256:'a'.repeat(64),afterCatalogSha256:'b'.repeat(64),sourceCommit:'c'.repeat(40),expiresAt:NOW+60000,productionAuthorized:false});
const render=a=>{const b=Buffer.from(JSON.stringify(a));return renderRuntime26V6Preparation(b,createHash('sha256').update(b).digest('hex'),NOW);};
test('explicit V5 to V6 renders only history fifteen SELECT and one xmin SELECT in guarded transaction',()=>{
 const r=render(fixture());assert.deepEqual(r.addedTables,['history_revision']);
 assert.equal(r.sql.match(/^GRANT /gm).length,2);assert.match(r.sql,/GRANT SELECT \(xmin\) ON TABLE naijue_erp\."history_revision"/);
 for(const column of HISTORY_COLUMNS)assert.ok(r.sql.includes('"'+column+'"'));
 assert.match(r.sql,/complete_maintenance_xmin_acl_match IS DISTINCT FROM true/);assert.match(r.sql,/complete_write_xmin_acl_match IS DISTINCT FROM true/);
 assert.equal(r.sql.match(/r.source_routines_match IS DISTINCT FROM true/g).length,2);
 assert.match(r.sql,/EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED/);assert.match(r.sql,/NO_TABLE_PRIVILEGES_REQUIRED/);assert.match(r.sql,/EXACT_HISTORY_FIFTEEN_READ_DELTA_REQUIRED/);
 assert.match(r.sql,/BEGIN;/);assert.ok(r.sql.endsWith('COMMIT;\n'));assert.equal(r.ordinaryRuntimeReviewStillRequired,true);
 assert.doesNotMatch(r.sql,/WITH GRANT OPTION|DISABLE TRIGGER|CREATE FUNCTION|CREATE ROLE|ALTER ROLE|REVOKE/);
});
test('no unknown, old, reversed, missing, extra, production or expired authority fallback',()=>{
 for(const change of [a=>a.sourceCommit=['c'.repeat(40)],a=>a.sourceCommit=null,a=>a.sourceCommit={},a=>a.target.postmasterStart='x$v6_guard$; DROP SCHEMA x;',a=>a.from='V1',a=>a.from='V3',a=>a.from='V6',a=>a.to='V5',a=>a.to='unknown',a=>delete a.from,a=>a.extra=true,a=>a.productionAuthorized=true,a=>a.expiresAt=NOW,a=>a.beforeCatalogSha256='bad',a=>a.afterCatalogSha256=null,a=>a.target.extra=true,a=>a.target.serverAddress='10.1.0.1/32',a=>a.target.runtimeRole=a.target.ownerRole,a=>a.target.runtimeRole='x;DROP ROLE x',a=>delete a.target.databaseOid]){
 const a=fixture();change(a);assert.throws(()=>render(a));
 }
});
test('external approval bytes must match trusted input pin; renderer never rewrites review',()=>{
 const b=Buffer.from(JSON.stringify(fixture()));assert.throws(()=>renderRuntime26V6Preparation(b,'0'.repeat(64),NOW),/EXTERNAL_APPROVAL/);
 const a=fixture(),before=JSON.stringify(a);render(a);assert.equal(JSON.stringify(a),before);
});
