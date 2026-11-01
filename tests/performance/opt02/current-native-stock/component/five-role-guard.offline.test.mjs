/** Pure render/negative tests, no SQL/PG/driver/native process/target. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LOGICAL } from '../reference-compiler/universe.mjs';
import { captureFiveRoleTarget, renderPostCutoffFiveRoleGuard } from './five-role-guard.mjs';
const now=Date.parse('2026-11-01T04:00:00Z');
const target=()=>({systemIdentifier:'7703999999999999999',database:LOGICAL.database,databaseOid:'16387',admin:LOGICAL.admin,
 owner:LOGICAL.sourceOwner,sentinel:LOGICAL.sentinel,prepare:LOGICAL.preparation,runtime:LOGICAL.runtime,
 port:55449,postmasterStart:'2026-11-01 03:59:59.123456+00',startsAt:now-1000,expiresAt:now+300000});
const render=(t=target(),pids=[73001,73002])=>renderPostCutoffFiveRoleGuard(t,pids,now);

test('post-cutoff guard has exactlyfive distinct source roles and admin-only physical identity',()=>{
 const t=captureFiveRoleTarget(target(),now);assert.ok(Object.isFrozen(t));assert.equal(t.runtime,LOGICAL.runtime);
 const sql=render();for(const token of ['pg_control_system()',"current_user='"+LOGICAL.admin+"'","session_user='"+LOGICAL.admin+"'",'=5',"rolconnlimit=4",'pid<>ALL(ARRAY[73001,73002]::int[])',"server_version_num')='170011'",'DOT_EXACT_POST_CUTOFF_FIVE_ROLE_BOUNDARY_CHANGED']) assert.ok(sql.includes(token),token);
 assert.ok(!sql.includes("current_user='"+LOGICAL.runtime+"'"));assert.ok(!/GRANT |CREATE ROLE|ALTER ROLE|DISABLE|APPROVED/.test(sql));
});
test('exact logical target, primitive OID/start/window and freshID/port are required without coercion',()=>{
 for(const change of [{database:'existing_production'}, {runtime:LOGICAL.sourceOwner},{owner:LOGICAL.runtime},{systemIdentifier:'7703045911272542916'},
  {systemIdentifier:'018446744073709551615'},{systemIdentifier:'18446744073709551616'},{databaseOid:'01'},{databaseOid:'4294967296'},
  {port:5432},{port:55448},{port:'55449'},{postmasterStart:'2026-11-01 03:59:59+01'},{startsAt:now+1},{expiresAt:now},
  {expiresAt:now+1200001},{runtime:new String(LOGICAL.runtime)}])assert.throws(()=>render({...target(),...change}),undefined,JSON.stringify(change));
 assert.throws(()=>captureFiveRoleTarget({...target(),extra:true},now));let reads=0;const getter={...target(),get runtime(){reads++;return LOGICAL.runtime}};
 assert.throws(()=>render(getter));assert.equal(reads,0);
});
test('PID allowlist is closed dense unique ownprimitive int and bounded adminplus4runtime',()=>{
 for(const pids of [[],[1],[73001,73001],['73001'],[2147483648],Array(1),[1,2,3,4,5,6]])assert.throws(()=>render(target(),pids));
 let reads=0;const getter=[];Object.defineProperty(getter,'0',{enumerable:true,get(){reads++;return 73001}});assert.throws(()=>render(target(),getter));assert.equal(reads,0);
 assert.ok(render(target(),[73001]).includes('pg_backend_pid()=ANY(ARRAY[73001]::int[])'));
});
test('NOLOGIN installroles keep zero data/connect/schema authority but PUBLICfunction EXECUTE is not silently revoked',()=>{
 const sql=render();for(const token of ['rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconnlimit<>0',
  'pg_auth_members','has_any_column_privilege','has_sequence_privilege',"'SELECT,UPDATE,USAGE'",'member IN(SELECT oid','roleid IN(SELECT oid'])assert.ok(sql.includes(token),token);
 assert.ok(!sql.includes('has_function_privilege'));assert.ok(!sql.includes('REVOKE'));
});
test('finite database/schema/default/ownership constraints preserve publicUSAGE but deny CREATE/TEMP/danger',()=>{
 const sql=render();for(const token of ["'CREATE,TEMPORARY'","'naijue_erp','USAGE'","'naijue_erp','CREATE'","'public','USAGE'","'public','CREATE'",'pg_database_owner','pg_default_acl',"'session_replication_role','SET'",'pg_get_userbyid(relowner)','pg_get_userbyid(proowner)','pg_get_userbyid(typowner)','a.grantee=0'])assert.ok(sql.includes(token),token);
 assert.ok(sql.includes('coalesce(pg_catalog.cardinality(rolconfig),0)<>0'));
});
test('old4role source guard remains untouched and is not called/upgraded by new renderer',()=>{
 const p=new URL('../../../../integration/runtime26-baseline/schema-objects-only/source-plan.mjs',import.meta.url);
 const s=readFileSync(p,'utf8');assert.ok(s.includes("AND (SELECT count(*) FROM pg_roles WHERE rolname IN(${literal(t.owner)},${literal(t.sentinel)},${literal(t.prepare)}))=3"));
 const own=readFileSync(new URL('./five-role-guard.mjs',import.meta.url),'utf8');assert.ok(!own.includes('targetGuard('));assert.doesNotMatch(own, /from ['"]pg['"]/);
 assert.equal(createHash('sha256').update(s).digest('hex'),'b4e8e0562b6f9d64922468f39771a6a0fad5352613c7594bbec0dd9709e12099');
});

test('PUBLIC-default ACL is checked independently of effective runtimeUSAGE and forbids direct repair/foreign grants',()=>{
 const sql=render(), marker='/* exact_postgres17_public_schema_acl */', start=sql.indexOf(marker);
 assert.ok(start>0,'effective runtimeUSAGE alone accepts PUBLIC-revoked/runtime-direct-USAGE counterexample');
 const acl=sql.slice(start,sql.indexOf("AND pg_catalog.has_schema_privilege",start));
 assert.ok(acl.includes("n.nspname='public'"));assert.ok(acl.includes("pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner)))"));
 assert.ok(acl.includes('a.grantor<>n.nspowner OR a.is_grantable'));
 assert.ok(acl.includes("a.grantee=0 AND a.privilege_type='USAGE'"));
 assert.ok(acl.includes("a.grantee=n.nspowner AND a.privilege_type IN('CREATE','USAGE')"));
 assert.ok(acl.includes("WHERE a.grantee=n.nspowner AND a.privilege_type='CREATE')=1"));
 assert.ok(acl.includes("WHERE a.grantee=n.nspowner AND a.privilege_type='USAGE')=1"));
 assert.ok(acl.includes('))=3'));
});
