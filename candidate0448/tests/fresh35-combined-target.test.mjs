import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget,fresh35CombinedTargetGuard} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
import {validateFresh35CombinedJournalPath} from '../scripts/release/unified-install/fresh35-combined-lifecycle-v1.mjs';
const startsAt=Date.parse('2026-11-05T03:00:00Z');
const input=()=>({proposal:{database:'synthetic_fresh35_20261105_r9',owner:'fresh35_owner_20261105_r9',controller:'fresh35_controller_20261105_r9',runtime:'fresh35_runtime_20261105_r9',admin:'fresh35_admin_20261105_r9',host:'127.0.0.1',port:57639,workspaceDirectory:'/tmp/cloud-pg-fresh35-20261105-r9'},physical:{systemIdentifier:'7703999999999999999',databaseOid:'16384',serverVersionNum:'170011',postmasterStart:'2026-11-05 03:00:00.123456+00'},startsAt,expiresAt:startsAt+1200000});
test('new35 target is an immutable binding, not a database or authority',()=>{
 const arg=input(),target=bindFresh35CombinedTarget(arg,startsAt+1),d=describeFresh35CombinedTarget(target);arg.proposal.port=5432;
 assert.equal(d.proposal.port,57639);assert.equal(d.authority,'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION');assert.ok(Object.isFrozen(d.physical));
 assert.throws(()=>describeFresh35CombinedTarget({...target}),/GENUINE_TARGET/);
});
test('target rejects unknown fields, getters, nonlocal endpoints and privilege-shaped names',()=>{
 let reads=0;const x=input();Object.defineProperty(x.proposal,'port',{enumerable:true,get(){reads++;return 57639}});assert.throws(()=>bindFresh35CombinedTarget(x,startsAt),/OWN|CLOSED/);assert.equal(reads,0);
 for(const update of [x=>x.approved=true,x=>x.proposal.host='localhost',x=>x.proposal.host='::1',x=>x.proposal.port=5432,x=>x.proposal.owner='postgres',x=>x.proposal.workspaceDirectory='/real/database',x=>x.physical.databaseOid='01',x=>x.physical.systemIdentifier='18446744073709551616',x=>x.physical.systemIdentifier='7704494445995372557',x=>x.physical.serverVersionNum='170010',x=>x.physical.postmasterStart='2026-02-30 03:00:00+00',x=>x.physical.postmasterStart='2026-11-05 02:59:59+00']){const x=input();update(x);assert.throws(()=>bindFresh35CombinedTarget(x,startsAt));}
});
test('original 20 minute deadline cannot be reset, extended, or reused after expiry',()=>{
 const x=input();assert.throws(()=>bindFresh35CombinedTarget(x,x.expiresAt),/WINDOW/);assert.throws(()=>bindFresh35CombinedTarget(x,x.startsAt-1),/WINDOW/);x.expiresAt++;assert.throws(()=>bindFresh35CombinedTarget(x,startsAt),/WINDOW/);
});
test('guard binds real endpoint and birth, ordinary owner, exact roles and ACL without provisioning',()=>{
 const target=bindFresh35CombinedTarget(input(),startsAt),sql=fresh35CombinedTargetGuard(target,{requireEmpty:true});
 for(const text of ['pg_control_system','pg_postmaster_start_time','inet_server_port()=57639',"host(pg_catalog.inet_server_addr())='127.0.0.1'",'rolconnlimit=2','rolconnlimit=0','admin_option','inherit_option','set_option','EMPTY_DATABASE_REQUIRED','DATABASE_ACL_DIFFERS','rolvaliduntil','pg_prepared_xacts','pg_stat_activity'])assert.ok(sql.includes(text),text);
 assert.doesNotMatch(sql,/\bCREATE\s+(?:ROLE|DATABASE|TABLE)|\bGRANT\b|\bDROP\b|pg_monitor/);
 assert.doesNotMatch(fresh35CombinedTargetGuard(target,{requireEmpty:false}),/EMPTY_DATABASE_REQUIRED/);
 assert.match(sql,/PUBLIC_SCHEMA_BOUNDARY_DIFFERS/);assert.match(sql,/pg_database_owner=UC\/pg_database_owner/);assert.match(sql,/pg_catalog.pg_type/);
});
test('journal path cannot write outside the target workspace already bound into authorization',()=>{
 const target=bindFresh35CombinedTarget(input(),startsAt);
 assert.equal(validateFresh35CombinedJournalPath(target,'/tmp/cloud-pg-fresh35-20261105-r9/installation-journal'),'/tmp/cloud-pg-fresh35-20261105-r9/installation-journal');
 for(const path of ['/etc/naijue-erp/records','/tmp/arbitrary-journal','/tmp/cloud-pg-fresh35-20261105-r9/../installation-journal'])assert.throws(()=>validateFresh35CombinedJournalPath(target,path),/AUTHORIZED_TARGET_WORKSPACE/);
});
