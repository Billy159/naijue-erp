import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWholeCatalogSpec,WHOLE_CATALOG_QUERY,verifyWholeCatalogPacket} from '../scripts/release/unified-install/whole-catalog-gate.mjs';
import {loadWholeSalesSpecV1,verifyWholeSalesInstalledV1,WHOLE_SALES_CATALOG_QUERY} from '../scripts/release/unified-install/whole-sales-catalog-v1.mjs';
import {validateWholeSalesRecordV1} from '../scripts/release/unified-install/whole-sales-record-v1.mjs';
import {assertWholeSalesAdmissionV1} from '../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const identity={system_identifier:'123456789',database_oid:'42',database_name:'synthetic_sales',owner:'owner',controller:'controller',runtime_login:'runtime',server_version_num:'170010'};
test('sales source successor changes exactly reviewed routine pins, retaining original177 source and ACL query',async()=>{
 const old=await loadWholeCatalogSpec(process.cwd()),sales=await loadWholeSalesSpecV1(process.cwd());
 assert.equal(old.pins.length,177);assert.equal(sales.pins.length,178);
 assert.notEqual(old.source_spec_sha256,sales.source_spec_sha256);
 assert.equal(sales.predecessor_source_spec_sha256,old.source_spec_sha256);
 assert.equal(sales.pins.filter((p,i)=>p.sha256!==old.pins[i]?.sha256).length,4);
 assert.match(WHOLE_CATALOG_QUERY,/pg_catalog.has_function_privilege/);
 assert.match(WHOLE_CATALOG_QUERY,/pg_catalog.has_column_privilege/);
 assert.match(WHOLE_CATALOG_QUERY,/pg_catalog.pg_auth_members/);
 assert.match(WHOLE_SALES_CATALOG_QUERY,/provolatile='s'/);assert.match(WHOLE_SALES_CATALOG_QUERY,/pg_catalog.aclexplode/);assert.match(WHOLE_SALES_CATALOG_QUERY,/FROM funcs\)=178/);
});
test('sales record structural validation binds exact source, predecessor, SQL and historical profile',async()=>{
 const spec=await loadWholeSalesSpecV1(process.cwd());
 const record={format:'WHOLE_SALES_INSTALLATION_RECORD_V1',installedAt:'2026-11-04T00:00:00Z',predecessorSourceSpecSha256:spec.predecessor_source_spec_sha256,combinedSqlSha256:spec.combined_sql_sha256,sourceProfileSha256:spec.source_profile_sha256,binding:{...identity,catalog_sha256:'a'.repeat(64),source_spec_sha256:spec.source_spec_sha256}};
 assert.equal(validateWholeSalesRecordV1(record,spec).database_oid,'42');
 for(const key of ['predecessorSourceSpecSha256','combinedSqlSha256','sourceProfileSha256'])assert.throws(()=>validateWholeSalesRecordV1({...record,[key]:'f'.repeat(64)},spec));
 assert.throws(()=>validateWholeSalesRecordV1({...record,format:'WHOLE_INSTALLATION_RECORD_V1'},spec));
 assert.throws(()=>validateWholeSalesRecordV1({...record,binding:{...record.binding,source_spec_sha256:spec.predecessor_source_spec_sha256}},spec));
});
test('catalog comparator rejects wrong physical target and any fingerprint drift',()=>{
 const text=JSON.stringify({identity,catalog:{roles:['unchanged'],permissions:['exact']}}),spec='a'.repeat(64),reviewed={...identity,catalog_sha256:hash(text),source_spec_sha256:spec};
 assert.doesNotThrow(()=>verifyWholeCatalogPacket(text,reviewed,spec));
 assert.throws(()=>verifyWholeCatalogPacket(text,{...reviewed,database_oid:'43'},spec),/PHYSICAL_TARGET/);
 assert.throws(()=>verifyWholeCatalogPacket(JSON.stringify({identity,catalog:{roles:['expanded'],permissions:['exact']}}),reviewed,spec),/CATALOG_DIFFERS/);
});
test('forged source specs and caller JSON can never issue execution capability',async()=>{
 let queries=0;const client={async query(){queries++;throw Error('must not query')}};
 await assert.rejects(verifyWholeSalesInstalledV1(client,{pins:[],source_spec_sha256:'a'.repeat(64)}),/GENUINE_SOURCE_SPEC/);
 assert.equal(queries,0);
 for(const input of [undefined,{},Object.freeze({installed:true,authorized:true}),JSON.parse('{"profile":"WHOLE177_SALES_V1_INSTALLED_INSTANCE_MATCH"}')])assert.throws(()=>assertWholeSalesAdmissionV1(input,{...identity,catalog_sha256:'a'.repeat(64)}),/ADMISSION_REQUIRED/);
});
test('public sales host requires fixed trusted installation record before connecting or work',async()=>{
 const {openReviewedWholeSalesHost}=await import('../tools/unified-import/whole-sales-host.mjs');
 let called=false;
 await assert.rejects(openReviewedWholeSalesHost({host:'127.0.0.1',port:5432,database:'synthetic_sales',user:'synthetic',password:''},process.cwd(),{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_sales',catalog_sha256:'a'.repeat(64)},()=>{called=true}),e=>/ENOENT|UNTRUSTED/.test(e.code??e.message));
 assert.equal(called,false);
});
test('one-use verification handoff cannot be forged from matching catalog JSON',async()=>{
 const {withVerifiedWholeSalesAdmissionV1}=await import('../scripts/release/unified-install/whole-sales-admission-v1.mjs');
 const client={};let worked=false;
 await assert.rejects(withVerifiedWholeSalesAdmissionV1(Object.freeze({...identity,catalog_sha256:'a'.repeat(64),source_profile_sha256:'b'.repeat(64)}),client,client,{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:identity.system_identifier,database_oid:identity.database_oid,database_name:identity.database_name,catalog_sha256:'a'.repeat(64)},()=>{worked=true}),/VERIFIED_INSTANCE_REQUIRED/);
 assert.equal(worked,false);
});
test('source capability is not issued when actual fixed record is absent or untrusted',async()=>{
 const spec=await loadWholeSalesSpecV1(process.cwd());let queried=false;
 await assert.rejects(verifyWholeSalesInstalledV1({async query(){queried=true;throw Error('unexpected')}},spec),e=>/ENOENT|UNTRUSTED/.test(e.code??e.message));
 assert.equal(queried,false);
});
test('sales SQL gate cannot issue a result when catalog or ACL query rejects the instance',async()=>{
 const {readFile}=await import('node:fs/promises');const {resolve}=await import('node:path');const {pathToFileURL}=await import('node:url');
 // Negative-only protocol test. No successful query result or capability is fabricated.
 const recordStub='data:text/javascript;base64,'+Buffer.from(`export async function loadWholeSalesRecordV1(spec){return {...${JSON.stringify(identity)},catalog_sha256:'a'.repeat(64),source_spec_sha256:spec.source_spec_sha256}}`).toString('base64');
 let source=await readFile('scripts/release/unified-install/whole-sales-catalog-v1.mjs','utf8');
 source=source.replace(/from (['"])(\.[^'"]+)\1/g,(_all,q,path)=>'from '+q+(path==='./whole-sales-record-v1.mjs'?recordStub:pathToFileURL(resolve('scripts/release/unified-install',path)).href)+q);
 const gate=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),spec=await gate.loadWholeSalesSpecV1(process.cwd());
 for(const mode of ['empty','wrong-command','permission-error']){
  const calls=[];const client={async query(sql){calls.push(sql);if(sql.startsWith('SET '))return{command:'SET'};if(mode==='permission-error')throw Error('synthetic denied');return{command:mode==='wrong-command'?'UPDATE':'SELECT',rows:[]}}};
  await assert.rejects(gate.verifyWholeSalesInstalledV1(client,spec),/CATALOG_PACKET_INVALID|CATALOG_ACK_INVALID|synthetic denied/);
  assert.equal(calls.length,2);assert.equal(calls[1],gate.WHOLE_SALES_CATALOG_QUERY);
 }
});
test('shared host identity registry rejects unrelated caller objects',async()=>{
 const {sameActiveWholeHostSession}=await import('../tools/unified-import/whole-host-session.mjs');
 const a={},b={};assert.equal(sameActiveWholeHostSession(a,a),false);assert.equal(sameActiveWholeHostSession(a,b),false);
});
test('sales catalog requires owner-only ACL for the two explicitly tightened trigger routines',()=>{
 assert.match(WHOLE_SALES_CATALOG_QUERY,/p\.oid IN\('naijue_erp\.validate_sales_settlement\(\)'::pg_catalog\.regprocedure,'naijue_erp\.reject_immutable_change\(\)'::pg_catalog\.regprocedure\)/);
 assert.match(WHOLE_SALES_CATALOG_QUERY,/a\.grantee<>p\.proowner OR a\.is_grantable OR a\.privilege_type<>'EXECUTE'/);
 assert.match(WHOLE_SALES_CATALOG_QUERY,/a\.grantee=p\.proowner AND a\.privilege_type='EXECUTE' AND NOT a\.is_grantable/);
 assert.doesNotMatch(WHOLE_CATALOG_QUERY,/a\.grantee<>p\.proowner OR a\.is_grantable OR a\.privilege_type<>'EXECUTE'/);
});
test('sales source spec binds the two reviewed ACL changes as well as companion source bytes',async()=>{
 const spec=await loadWholeSalesSpecV1(process.cwd());
 assert.deepEqual(spec.acl_changes,[
  {signature:'naijue_erp.reject_immutable_change()',before:'DEFAULT_PUBLIC_EXECUTE',after:'OWNER_ONLY_EXECUTE',operation:'REVOKE_PUBLIC_EXECUTE'},
  {signature:'naijue_erp.validate_sales_settlement()',before:'DEFAULT_PUBLIC_EXECUTE',after:'OWNER_ONLY_EXECUTE',operation:'REVOKE_PUBLIC_EXECUTE'},
 ]);
 assert.equal(Object.isFrozen(spec.acl_changes),true);
 assert.equal(spec.acl_changes.every(Object.isFrozen),true);
});
test('sales source spec pins the complete privileged issuer and module-boundary chain',async()=>{
 const spec=await loadWholeSalesSpecV1(process.cwd());
 for(const name of ['install-whole-sales-record-v1.mjs','launch-whole-sales-install-v1.py','preload-whole-sales-install-v1.mjs','whole-sales-module-boundary.mjs','whole-sales-platform-layout.mjs','whole-sales-trusted-path.mjs','publish-installation-record.mjs','trusted-install-path.mjs','record-whole-installation.mjs']){
  const path='scripts/release/unified-install/'+name,pin=spec.installation_sources.find(p=>p.path===path);
  assert.ok(pin,'missing trusted issuer source pin: '+path);
  const {readFile}=await import('node:fs/promises');assert.equal(pin.sha256,hash(await readFile(path)));
 }
});
