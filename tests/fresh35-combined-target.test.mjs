import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFresh35CombinedTarget,describeFresh35CombinedTarget,fresh35CombinedTargetGuard,fresh35CombinedRuntimeTargetGuard} from '../scripts/release/unified-install/fresh35-combined-target-v1.mjs';
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

test('controller inspection has its own read-only repeatable snapshot and keeps all physical and ACL checks',()=>{
 const target=bindFresh35CombinedTarget(input(),startsAt),runtime=fresh35CombinedRuntimeTargetGuard(target),install=fresh35CombinedTargetGuard(target,{requireEmpty:false});
 assert.match(runtime,/current_user='fresh35_controller_20261105_r9' AND session_user='fresh35_controller_20261105_r9'/);
 assert.match(runtime,/transaction_isolation'\)='repeatable read'/);
 assert.match(runtime,/transaction_read_only'\)='on'/);
 assert.match(install,/current_user='fresh35_owner_20261105_r9'/);
 assert.match(install,/transaction_isolation'\)='read committed'/);
 assert.match(install,/transaction_read_only'\)='off'/);
 for(const check of ['PHYSICAL_TARGET_DIFFERS','PUBLIC_SCHEMA_BOUNDARY_DIFFERS','ROLE_ATTRIBUTES_DIFFER','EXACT_MEMBERSHIP_REQUIRED','DATABASE_ACL_DIFFERS','pg_control_system','pg_postmaster_start_time','pg_stat_activity'])assert.ok(runtime.includes(check),check);
 assert.doesNotMatch(runtime,/EMPTY_DATABASE_REQUIRED|\b(?:CREATE|GRANT|DROP)\s/);
});

function production(){const p=input();p.proposal={database:'approved_new_erp',owner:'approved_owner',controller:'approved_controller',runtime:'approved_runtime',admin:'approved_admin',host:'10.0.0.4',port:5432,workspaceDirectory:'/private/approved-new-install'};return {...p,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',ordinary:{connectHost:'postgres',connectPort:5432,serverAddress:'172.20.0.3',serverPort:5432,runtimeLoginValidUntil:null,referenceDirectory:'/private/reviewed-references'}};}
test('production V2 target is explicit, closed and separates install window/endpoint from ordinary service facts',async()=>{
 const {bindFresh35CombinedProductionTargetV2,assertFresh35InstallationTargetCurrent,reconstructFresh35InstalledProductionTargetV2}=await import('../scripts/release/unified-install/fresh35-combined-target-v1.mjs');
 const p=production(),token=bindFresh35CombinedTarget(p,startsAt+1),d=describeFresh35CombinedTarget(token);
 assert.equal(d.format,'FRESH35_COMBINED_TARGET_BINDING_V2');assert.equal(d.ordinary.connectHost,'postgres');assert.equal(d.proposal.host,'10.0.0.4');assert.equal(d.ordinary.runtimeLoginValidUntil,null);assert(Object.isFrozen(d.ordinary));
 assert.equal(assertFresh35InstallationTargetCurrent(token,startsAt+1),d);assert.throws(()=>assertFresh35InstallationTargetCurrent(token,p.expiresAt),/CURRENT_INSTALL_TARGET_REQUIRED/);
 const sql=fresh35CombinedTargetGuard(token,{requireEmpty:true});for(const x of ["current_user='approved_owner'","host(pg_catalog.inet_server_addr())='10.0.0.4'","rolname='approved_runtime'",'EMPTY_DATABASE_REQUIRED','EXACT_MEMBERSHIP_REQUIRED','DATABASE_ACL_DIFFERS',"rolvaliduntil='infinity'"])assert(sql.includes(x),x);
 assert.doesNotMatch(sql,/\bCREATE\s+(ROLE|DATABASE)|\bGRANT\b/);
 await assert.rejects(()=>reconstructFresh35InstalledProductionTargetV2({format:'FRESH35_COMBINED_INSTALLATION_RECORD_V2',target:d}),/FIXED_PROTECTED_ENVELOPE_REQUIRED/);
 for(const mutate of [x=>delete x.purpose,x=>x.ordinary.extra=true,x=>delete x.ordinary.runtimeLoginValidUntil,x=>x.proposal.runtime=x.proposal.owner,x=>x.proposal.database='synthetic_fresh35_20261105_r9',x=>x.ordinary.connectHost="postgres';select",x=>x.ordinary.runtimeLoginValidUntil='2026-02-30T00:00:00Z',x=>x.expiresAt++,x=>x.physical.serverVersionNum='170012']){const x=production();mutate(x);assert.throws(()=>bindFresh35CombinedProductionTargetV2(x,startsAt+1));}
});
