import test from 'node:test';
import assert from 'node:assert/strict';
import {withB07QaIdentityFixture,readB07QaIdentityOutcome,QA_IDENTITY,SQL} from './qa-identity-schema19.mjs';
const input=()=>({contract:'B07_PREUPGRADE_QA_IDENTITY_1',target:{database:'naijue_erp_test_19e00102',oid:'16385',role:'synthetic_setup_only',session_role:'synthetic_setup_only',server_address:null,server_port:null,port:55676,unix_socket_directories:'/private/tmp/nj-b07-synthetic-only',postmaster_started_at:'2026-10-26 00:00:00+00'},sourceActorAccountId:'b0700000-0000-4000-8000-000000000099',createdAt:'2026-10-26T00:01:00.000Z',sourceRoot:'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022',copyRegistrationReference:'synthetic-only-copy',preservedSnapshotReference:'synthetic-only-snapshot'});
const good=()=>({accounts:2,sessions:0,disabled_source:1,qa_staff:1,qa_account:1,qa_staff_present:1,qa_account_present:1});
function fixture(options={}){
 const i=input(),calls=[],records=[],http=[];let callback=0,commit=false;
 const client={async query(sql,args){calls.push({sql,args});
  if(sql===SQL.target)return {rows:[{...i.target,...options.target}]};
  if(sql===SQL.versions)return {rows:Array.from({length:options.versions??19},(_,n)=>({version:n+1}))};
  if(sql===SQL.guards)return {rows:[{count:options.guards??0}]};
  if(sql===SQL.before)return {rows:[{accounts:1,sessions:0,disabled_source:1,qa_staff:0,qa_account:0,...options.before}]};
  if(sql===SQL.readback)return {rows:[options.readback??good()]};
  if(sql===SQL.account&&options.accountFail)throw Error('PRIVATE_DRIVER_DETAIL_MUST_NOT_ESCAPE');
  if(sql==='COMMIT'){commit=true;if(options.commitFail)throw Error('PRIVATE_UNKNOWN_DETAIL');}
  return {rows:[],rowCount:1};
 }};
 const api={trustedOrigin:'https://b07-synthetic-only.invalid',app:{server:{listening:false},async inject(request){http.push(request.url);
  if(request.url==='/auth/login'){
   assert.equal(request.payload.loginName,QA_IDENTITY.loginName);assert.ok(request.payload.password.length>=8);
   return {statusCode:200,headers:{'set-cookie':'synthetic_opaque=not-a-real-token; HttpOnly; Secure'}};
  }
  if(request.url==='/auth/session')return {statusCode:200,json:()=>({principal:{accountId:QA_IDENTITY.accountId,staffId:QA_IDENTITY.staffId,role:options.badPrincipal?'ADMIN':'WAREHOUSE',hallId:null,authVersion:1}})};
  if(request.url==='/auth/logout')return {statusCode:204};
  throw Error('Unexpected synthetic route');
 }}};
 const run=()=>withB07QaIdentityFixture({client,input:i,recordPreparation:async value=>{records.push(value);},afterSeed:async({qaIdentity,withNormalSession})=>{
  callback++;assert.equal(commit,true);assert.equal(qaIdentity,QA_IDENTITY);
  await withNormalSession(api,async({actor,privateCookie})=>{assert.deepEqual(actor,{accountId:QA_IDENTITY.accountId,hallId:null});assert.ok(privateCookie);if(options.workFail)throw Error('PRIVATE_CALLBACK_DETAIL_MUST_NOT_ESCAPE');});
 }});
 return {i,client,calls,records,http,run,get callback(){return callback;}};
}
test('schema19 independent fixture uses two inserts, original codec and normal login/session/logout',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'QA_FIXTURE_AND_NORMAL_SESSION_SCOPE_COMPLETED');
 assert.deepEqual(f.http,['/auth/login','/auth/session','/auth/logout']);
 assert.deepEqual(f.calls.filter(x=>x.sql.includes('INSERT INTO')).map(x=>x.sql),[SQL.staff,SQL.account]);
 const args=f.calls.find(x=>x.sql===SQL.account).args;assert.match(args[3],/^naijue:scrypt:1:32768:8:1:/);
 assert.equal(f.records.length,1);assert.equal(f.records[0].sourceIdentityChanged,false);
 assert.ok(!JSON.stringify([result,f.records]).includes(args[3]));
 assert.ok(!f.calls.some(x=>/UPDATE|DELETE|ALTER|DISABLE TRIGGER|session_replication_role/.test(x.sql)));
});
test('wrong target, schema26, present guards, stale seed refuse before inserts',async()=>{
 for(const o of [{target:{oid:'999'}},{target:{database:'other'}},{versions:26},{guards:1},{before:{accounts:2}},{before:{disabled_source:0}}]){
  const f=fixture(o);await assert.rejects(f.run(),/^Error: B07_FIXTURE_PRECOMMIT_FAILED_NO_RETRY$/);
  assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO')));assert.equal(f.callback,0);assert.ok(f.calls.some(x=>x.sql==='ROLLBACK'));
 }
});
test('account failure rolls back; unknown COMMIT neither rolls back nor calls continuation',async()=>{
 const f=fixture({accountFail:true});await assert.rejects(f.run(),/^Error: B07_FIXTURE_PRECOMMIT_FAILED_NO_RETRY$/);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.callback,0);
 const unknown=fixture({commitFail:true});await assert.rejects(unknown.run(),/^Error: B07_FIXTURE_COMMIT_UNKNOWN_READBACK_ONLY$/);
 assert.equal(unknown.calls.at(-1).sql,'COMMIT');assert.equal(unknown.callback,0);
 const count=unknown.calls.length;
 assert.equal((await readB07QaIdentityOutcome({client:unknown.client,input:unknown.i})).status,'FIXTURE_ROWS_PRESENT_CREDENTIALS_NOT_RECOVERED');
 assert.deepEqual(unknown.calls.slice(count).map(x=>x.sql),[SQL.target,SQL.readback]);
});
test('read-only outcome distinguishes absence and malformed partial identity without retry',async()=>{
 const absent=fixture({readback:{accounts:1,sessions:0,disabled_source:1,qa_staff:0,qa_account:0,qa_staff_present:0,qa_account_present:0}});
 const a=await readB07QaIdentityOutcome({client:absent.client,input:absent.i});assert.equal(a.status,'FIXTURE_ROWS_ABSENT_NO_AUTOMATIC_RETRY');assert.equal(a.loginReady,false);
 const partial=fixture({readback:{accounts:1,sessions:0,disabled_source:1,qa_staff:0,qa_account:0,qa_staff_present:1,qa_account_present:0}});
 assert.equal((await readB07QaIdentityOutcome({client:partial.client,input:partial.i})).status,'FIXTURE_OUTCOME_UNKNOWN');
});
test('real-principal mismatch or work failure still attempts normal logout and sanitizes error',async()=>{
 for(const o of [{badPrincipal:true},{workFail:true}]){
  const f=fixture(o);await assert.rejects(f.run(),/^Error: B07_FIXTURE_COMMITTED_CONTINUATION_FAILED_PRESERVE_COPY_AND_ORIGINAL_KEYS$/);
  assert.deepEqual(f.http,['/auth/login','/auth/session','/auth/logout']);assert.ok(!f.calls.some(x=>x.sql==='ROLLBACK'));
 }
});
