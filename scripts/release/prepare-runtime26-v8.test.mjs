// Offline source/renderer tests only. Synthetic approvals never authorize PG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderRuntime26V8Preparation as render} from './prepare-runtime26-v8.mjs';
const SOURCE='c'.repeat(40),NOW=1793410000000;
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=()=>({version:'RUNTIME26_V8_FIVE_ACL_PREPARATION_V1',decision:'AUTHORIZE_EXACT_TWO_CMIN_AND_THREE_DELETE_ONLY',scope:'FRESH_ISOLATED_SYNTHETIC_ONLY',from:'V7',to:'V8',sourceCommit:SOURCE,startsAt:NOW-1,expiresAt:NOW+60000,beforeCatalogSha256:'a'.repeat(64),afterCatalogSha256:'b'.repeat(64),productionAuthorized:false,
 target:{database:'synthetic_not_created',databaseOid:'123',ownerRole:'synthetic_owner',runtimeRole:'synthetic_runtime',sessionUser:'synthetic_admin',serverAddress:'127.0.0.1/32',serverPort:55439,postmasterStart:'2026-10-31 00:00:00+00'}});
const run=a=>{const b=Buffer.from(JSON.stringify(a));return render(b,hash(b),SOURCE,NOW);};
test('exact V7 to V8 only: five source cells, no DDL/function/schema/old guard rewrite',()=>{
 const r=run(fixture());assert.deepEqual(r.addedCells,[['audit_change','cmin','SELECT'],['product_category','cmin','SELECT'],['payment_account_hall',null,'DELETE'],['product_image',null,'DELETE'],['sales_settlement',null,'DELETE']]);
 const grants=r.sql.split('\n').filter(l=>l.startsWith('GRANT '));assert.equal(grants.length,5);assert.equal(grants.filter(l=>l.startsWith('GRANT SELECT ("cmin")')).length,2);
 assert.equal(grants.filter(l=>l.startsWith('GRANT DELETE ')).length,3);assert.ok(grants.every(l=>l.endsWith('TO "synthetic_runtime";')));
 assert.equal(r.sql.match(/^BEGIN;$/gm).length,1);assert.equal(r.sql.match(/^COMMIT;$/gm).length,1);
 assert.doesNotMatch(r.sql,/^\s*(?:CREATE|ALTER|DROP|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
 assert.equal(r.sql.match(/EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED/g).length,2);assert.equal(r.sql.match(/EXACT_THREE_DELETE_TABLE_RIGHTS_REQUIRED/g).length,2);
 assert.ok(r.sql.includes('r.complete_write_xmin_acl_match IS DISTINCT FROM true'));
 assert.ok(r.sql.includes('r.complete_write_system_acl_match_v8 IS DISTINCT FROM true OR r.normal_delete_acl_match_v8 IS DISTINCT FROM true'));
 assert.equal(r.sql.match(/r.recorded_live_balance_contract_match IS DISTINCT FROM true/g).length,2);
 assert.equal(r.productionAuthorized,false);assert.equal(r.catalogPinObservation,'ADMIN_SESSION_SET_ROLE_RUNTIME_ONLY');assert.equal(r.ordinaryRuntimeReviewStillRequired,true);
});
test('QA socket and arbitrary Unix extensions remain refused pending separate target confirmation',()=>{
 const a=fixture();Object.assign(a.target,{transport:'UNIX_SOCKET_QA_V8_EXACT_V1',serverConfiguredPort:5432,unixSocketDirectory:'/qa-socket',listenAddresses:'',serverAddress:null,serverPort:null});
 assert.throws(()=>run(a),/EXACT_ISOLATED_TARGET_REQUIRED/);
 a.target.unixSocketDirectory='/tmp';assert.throws(()=>run(a),/EXACT_ISOLATED_TARGET_REQUIRED/);
});
test('closed source, window, catalog, role, scope and transition inputs reject without rendering permissions',()=>{
 for(const edit of [a=>a.from='V6',a=>a.to='V7',a=>a.sourceCommit='d'.repeat(40),a=>a.beforeCatalogSha256=null,a=>a.afterCatalogSha256=a.beforeCatalogSha256,a=>a.productionAuthorized=true,a=>a.scope='PRODUCTION',a=>a.expiresAt=NOW,a=>a.startsAt=NOW+1,a=>a.expiresAt=a.startsAt+900001,a=>a.extra=true,a=>a.target.runtimeRole=a.target.ownerRole,a=>a.target.runtimeRole='runtime";bad',a=>a.target.serverAddress='0.0.0.0/0',a=>delete a.target.databaseOid]){const a=fixture();edit(a);assert.throws(()=>run(a));}
 const b=Buffer.from(JSON.stringify(fixture()));assert.throws(()=>render(b,'0'.repeat(64),SOURCE,NOW));assert.throws(()=>render(b,hash(b),'x',NOW));assert.throws(()=>render());
});
