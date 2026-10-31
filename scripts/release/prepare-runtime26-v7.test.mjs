// SOURCE PREPARATION ONLY. Not run by the preparer. Apply before 02-implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {renderRuntime26V7Preparation, V7_STORAGE_PATCH_SHA256} from './prepare-runtime26-v7.mjs';

const NOW=1800000000000, SOURCE='c'.repeat(40);
const PATCH=readFileSync(new URL('../../adapters/postgres/patches/0026-live-ledger-balance-pairs.sql',import.meta.url));
const digest=b=>createHash('sha256').update(b).digest('hex');
const fixture=()=>({version:'RUNTIME26_V7_LIVE_PAIR_PREPARATION_V1',
 decision:'AUTHORIZE_EXACT_ADDITIVE_PAIR_DDL_AND_FOUR_COLUMN_CELLS_ONLY',scope:'FRESH_ISOLATED_SYNTHETIC_ONLY',
 target:{database:'isolated_v7_synthetic_test',databaseOid:'99999',ownerRole:'isolated_owner',runtimeRole:'isolated_runtime',sessionUser:'isolated_admin',serverAddress:'127.0.0.1/32',serverPort:25432,postmasterStart:'2027-01-15 08:00:00+00'},
 from:'V6',to:'V7',beforeCatalogSha256:'a'.repeat(64),afterCatalogSha256:'b'.repeat(64),
 storagePatchSha256:V7_STORAGE_PATCH_SHA256,sourceCommit:SOURCE,startsAt:NOW-1000,expiresAt:NOW+60000,productionAuthorized:false});
const render=(a,patch=PATCH,source=SOURCE)=>{const b=Buffer.from(JSON.stringify(a));return renderRuntime26V7Preparation(b,digest(b),patch,source,NOW);};

test('V6 to V7 only: exact source DDL body and four cells in one guarded transaction',()=>{
 const r=render(fixture());
 assert.deepEqual(r.from,{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V6',patchLevel:'26_hv2_history_set_guards_complete_write_xmin_from_v22'});
 assert.deepEqual(r.to,{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V7',patchLevel:'26_hv2_live_ledger_pairs_complete_write_xmin_from_v22'});
 assert.deepEqual(r.addedCells,[['inventory_ledger','quantity_before','SELECT'],['inventory_ledger','quantity_after','SELECT'],['inventory_ledger','quantity_before','INSERT'],['inventory_ledger','quantity_after','INSERT']]);
 assert.equal(r.sql.match(/^BEGIN;$/gm).length,1); assert.equal(r.sql.match(/^COMMIT;$/gm).length,1);
 assert.ok(r.sql.endsWith('COMMIT;\n'));
 const p=PATCH.toString('utf8'),start=p.indexOf('\nBEGIN;\n')+'\nBEGIN;\n'.length;
 assert.ok(r.sql.includes(p.slice(start,p.lastIndexOf('COMMIT;\n'))));
 assert.equal(r.sql.match(/^GRANT /gm).length,2);
 assert.match(r.sql,/GRANT SELECT \("quantity_before", "quantity_after"\) ON TABLE naijue_erp.inventory_ledger TO "isolated_runtime";/);
 assert.match(r.sql,/GRANT INSERT \("quantity_before", "quantity_after"\) ON TABLE naijue_erp.inventory_ledger TO "isolated_runtime";/);
 assert.equal(r.sql.match(/r.source_routines_match IS DISTINCT FROM true/g).length,2);
 assert.equal(r.sql.match(/r.complete_write_xmin_acl_match IS DISTINCT FROM true/g).length,2);
 assert.equal(r.sql.match(/r.recorded_live_balance_contract_match IS DISTINCT FROM true/g).length,1);
 const before=r.sql.indexOf("r.catalog_sha256 IS DISTINCT FROM '"+'a'.repeat(64)),ddl=r.sql.indexOf('ALTER TABLE naijue_erp.inventory_ledger');
 const grant=r.sql.indexOf('GRANT INSERT ("quantity_before"'),after=r.sql.indexOf("r.catalog_sha256 IS DISTINCT FROM '"+'b'.repeat(64));
 assert.ok(before>=0&&ddl>=0&&before<ddl);assert.ok(grant>=0&&after>=0&&grant<after);
 assert.equal(r.sql.match(/r.catalog_sha256 IS DISTINCT FROM/g).length,2);
 assert.equal(r.ordinaryRuntimeReviewStillRequired,true);assert.equal(r.runtimeWindowStillRequired,true);
 assert.equal(r.grantsAuthenticationOrConnect,false);assert.equal(r.productionAuthorized,false);
 assert.doesNotMatch(r.sql,/GRANT (?:CONNECT|TEMP|CREATE|EXECUTE|ALL)|WITH GRANT OPTION|CREATE ROLE|ALTER ROLE|DISABLE TRIGGER|UPDATE naijue_erp|DELETE FROM naijue_erp|DROP |INSERT INTO naijue_erp/);
});

test('exact23 xmin, ordinary runtime, ownership and no table grants remain pre/post invariants',()=>{
 const {sql}=render(fixture());
 assert.equal(sql.match(/EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED/g).length,2);
 assert.equal(sql.match(/NO_TABLE_PRIVILEGES_REQUIRED/g).length,2);
 assert.equal(sql.match(/ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED/g).length,2);
 assert.equal(sql.match(/EXACT_TARGET_OR_WINDOW_CHANGED/g).length,2);
 assert.match(sql,/NOT \(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls\)/);
 assert.match(sql,/pg_auth_members/);assert.match(sql,/session_replication_role/);
 assert.match(sql,/current_database\(\)='isolated_v7_synthetic_test'/);
 assert.match(sql,/extract\(epoch FROM clock_timestamp\(\)\)\*1000>=1799999999000/);
 assert.match(sql,/extract\(epoch FROM clock_timestamp\(\)\)\*1000<1800000060000/);
});

test('authority, target, source, patch, transition and finite window fail closed independently',()=>{
 const mutations=[a=>a.version='RUNTIME26_V6_HISTORY_READ_PREPARATION_V1',a=>a.decision='AUTHORIZE_ALL',a=>a.scope='PRODUCTION',
  a=>a.from='V5',a=>a.from='V7',a=>a.to='V6',a=>a.to='unknown',a=>delete a.from,a=>a.extra=true,
  a=>a.productionAuthorized=true,a=>a.startsAt=NOW+1,a=>a.expiresAt=NOW,a=>a.expiresAt=a.startsAt+900001,
  a=>a.startsAt='1800000000000',a=>a.expiresAt=Infinity,a=>a.sourceCommit=null,a=>a.sourceCommit='d'.repeat(40),
  a=>a.beforeCatalogSha256='bad',a=>a.afterCatalogSha256=null,a=>a.afterCatalogSha256=a.beforeCatalogSha256,
  a=>a.storagePatchSha256='0'.repeat(64),a=>a.target.extra=true,a=>delete a.target.databaseOid,
  a=>a.target.serverAddress='10.0.0.1/32',a=>a.target.serverPort=5432.5,a=>a.target.serverPort=1024,
  a=>a.target.runtimeRole=a.target.ownerRole,a=>a.target.sessionUser=a.target.runtimeRole,a=>a.target.sessionUser=a.target.ownerRole,
  a=>a.target.runtimeRole='x;DROP ROLE x',a=>a.target.postmasterStart='x$v7_guard$;DROP SCHEMA x;',a=>a.target.databaseOid='0'];
 for(const mutate of mutations){const a=fixture();mutate(a);assert.throws(()=>render(a),mutate.toString());}
 assert.throws(()=>render(fixture(),Buffer.from(PATCH.toString('utf8')+'\n-- changed')),/EXACT_SOURCE_STORAGE_PATCH_REQUIRED/);
 assert.throws(()=>render(fixture(),Buffer.from('BEGIN;\nCOMMIT;\n')),/EXACT_SOURCE_STORAGE_PATCH_REQUIRED/);
 assert.throws(()=>render(fixture(),PATCH,'d'.repeat(40)),/FRESH_SOURCE_AND_CATALOG_PINS_REQUIRED/);
 assert.throws(()=>renderRuntime26V7Preparation(),/EXTERNAL_APPROVAL_PIN_REQUIRED/);
});

test('external approval bytes must match external trust pin; no self-approval or input rewrite',()=>{
 const a=fixture(),b=Buffer.from(JSON.stringify(a)),before=Buffer.from(b),p=Buffer.from(PATCH);
 assert.throws(()=>renderRuntime26V7Preparation(b,'0'.repeat(64),PATCH,SOURCE,NOW),/EXTERNAL_APPROVAL_PIN_REQUIRED/);
 assert.throws(()=>renderRuntime26V7Preparation(Buffer.alloc(65537),digest(Buffer.alloc(65537)),PATCH,SOURCE,NOW),/EXTERNAL_APPROVAL_PIN_REQUIRED/);
 assert.throws(()=>renderRuntime26V7Preparation(Buffer.from('{'),digest(Buffer.from('{')),PATCH,SOURCE,NOW));
 renderRuntime26V7Preparation(b,digest(b),PATCH,SOURCE,NOW);
 assert.deepEqual(b,before);assert.deepEqual(PATCH,p);assert.equal(JSON.stringify(a),b.toString('utf8'));
});

test('V7 patch pin is independently fixed, never caller-selected or regenerated from the input',()=>{
 assert.equal(V7_STORAGE_PATCH_SHA256,'41c491cca5f04cc19d15f0c05113cfb3c81fa39a648a5dc349874ba52ef588c9');
 assert.equal(digest(PATCH),V7_STORAGE_PATCH_SHA256);
});
