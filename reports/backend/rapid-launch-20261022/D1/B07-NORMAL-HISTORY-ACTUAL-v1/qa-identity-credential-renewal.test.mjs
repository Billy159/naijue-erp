import test from 'node:test';
import assert from 'node:assert/strict';
import {withB07QaIdentityCredentialRenewal,validateCredentialRenewalInput,RENEWAL_SQL,credentialPermissionProofFromOriginal} from './qa-identity-credential-renewal.mjs';
import {withB07QaManagedNormalSession} from './qa-identity-parent.mjs';
import {QA_IDENTITY} from './qa-identity-schema19.mjs';
const hashes={guard_maintenance_account_event:'965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549',validate_maintenance_root_commit:'8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512',validate_available_administrator_commit:'3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18'};
const sourceActor='b0700000-0000-4000-8000-000000000099';
function fixture(options={}){
 const target={database:'naijue_erp_test_19e00102',oid:'16385',role:'naijue_erp_test',session_role:'SYNTHETIC_SETUP',server_address:null,server_port:null,port:55676,unix_socket_directories:'/private/tmp/nj-b07-synthetic',postmaster_started_at:'2026-10-27 00:00:00+00'};
 const functions=Object.entries(hashes).map(([name,sha256])=>({name,sha256})).sort((a,b)=>a.name<b.name?-1:1);
 const triggers=[['account_available_administrator','validate_available_administrator_commit'],['account_maintenance_event','guard_maintenance_account_event'],['user_account_maintenance_final_consistency','validate_maintenance_root_commit']].map(([name,routine],i)=>({oid:String(100+i),name,table_name:'user_account',routine,enabled:'O',internal:false,deferrable:i!==1,initially_deferred:i!==1}));
 const proof={format:'B07_QA_CREDENTIAL_RENEWAL_READONLY_PROOF_1',target,profile:'26_v21_history_effective_value_from_v16_v14',catalogSha256:'a'.repeat(64),functions,triggers,can_read_identity:true,can_update_credential:true,can_revoke_sessions:true};
 const input={contract:'B07_SAME_QA_CREDENTIAL_RENEWAL_1',target,permissionProof:proof,sourceRoot:'/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022',sourceActorAccountId:sourceActor,expectedVersion:1,expectedAuthVersion:1,originalSales:{requestKey:'D1_B07_V16_DRAFT_SALES_QUANTITY_01',documentId:sourceActor,requestHash:'b'.repeat(64)},changedAt:'2026-10-27T00:01:00.000Z',copyRegistrationReference:'SYN_COPY',preservedSnapshotReference:'SYN_SNAPSHOT',approvedManagementReference:'SYN_C_APPROVAL',intentReference:'SYN_UNIQUE_ACTION'};
 let storedHash='SYNTHETIC_OLD_NOT_READ',calls=[],records=[],http=[],savedSession,workCount=0,ended=false,renewed=false;
 let row={account:{id:QA_IDENTITY.accountId,staff_id:QA_IDENTITY.staffId,login_name:QA_IDENTITY.loginName,login_enabled:true,version:options.stale?2:1,auth_version:1,created_at:'2026-10-26T00:00:00Z',updated_at:'2026-10-26T00:00:00Z'},staff:{id:QA_IDENTITY.staffId,name:QA_IDENTITY.name,hall_id:null,role:'WAREHOUSE',employment_status:'在职',contact:null,version:1},live_sessions:1,other_accounts:[{id:sourceActor,login_enabled:false}],source_disabled:true,qa_not_source:!options.sourceBound,no_colliding_audit:true};
 const original=structuredClone(row);
 const query=async(sql,args=[],recovery=false)=>{
  calls.push({sql,args,recovery});
  if(sql===RENEWAL_SQL.target){const {unix_socket_directories,...identity}=target;return {rows:[identity]};}
  if(sql===RENEWAL_SQL.admission)return {rows:[{versions:Array.from({length:26},(_,i)=>i+1),functions,triggers,management_role_safe:true,can_read_identity:true,can_update_credential:!options.permissionLost,can_revoke_sessions:true}]};
  if(sql===RENEWAL_SQL.history)return {rows:[{count:options.historyChanged?0:1,sha256:'c'.repeat(64)}]};
  if(sql===RENEWAL_SQL.lock)return {rows:[{id:QA_IDENTITY.accountId}]};
  if(sql===RENEWAL_SQL.state)return {rows:[{...structuredClone(row),credential_matches:args[3]===storedHash}]};
  if(sql===RENEWAL_SQL.update){assert.equal(recovery,false);if(options.updateError)throw Object.assign(Error('SYNTHETIC_PRIVATE_DRIVER_DETAIL'),{code:'23514'});if(options.casFailure)return {rowCount:0,rows:[]};storedHash=args[5];row.account.version++;row.account.auth_version++;row.account.updated_at=args[6];renewed=true;return {rowCount:1,rows:[{id:QA_IDENTITY.accountId,version:2,auth_version:2}]};}
  if(sql===RENEWAL_SQL.sessions){row.live_sessions=0;return {rowCount:1,rows:[]};}
  if(sql==='ROLLBACK'&&!recovery){row=structuredClone(original);return {rows:[]};}
  if(sql==='COMMIT'&&!recovery&&options.unknownCommit)throw Error('SYNTHETIC_PRIVATE_DRIVER_DETAIL');
  return {rows:[]};
 };
 const client={connectionParameters:{host:target.unix_socket_directories,port:target.port},query:(sql,args)=>query(sql,args)};
 const api={trustedOrigin:'https://synthetic-only.invalid',app:{server:{listening:false},async inject(request){http.push(request.url);
  if(request.url==='/auth/login'){assert.equal(request.payload.loginName,QA_IDENTITY.loginName);assert.equal(typeof request.payload.password,'string');return {statusCode:200,headers:{'set-cookie':'SYNTHETIC_TOKEN; Path=/'}};}
  if(request.url==='/auth/session')return {statusCode:200,json:()=>({principal:{accountId:QA_IDENTITY.accountId,staffId:QA_IDENTITY.staffId,role:options.badPrincipal?'ADMIN':'WAREHOUSE',hallId:null,authVersion:2}})};
  if(request.url==='/auth/logout')return {statusCode:204};throw Error('SYNTHETIC_UNEXPECTED_ROUTE');
 }}};
 const run=()=>withB07QaIdentityCredentialRenewal({client,input,recordPreparation:async value=>{records.push(value);},runNormalSession:withB07QaManagedNormalSession,
  withRecoveryClient:async work=>{assert.equal(options.unknownCommit,true);if(options.unknownUnconfirmed)throw Error('SYNTHETIC_UNCONFIRMED');try{return await work({...client,query:(sql,args)=>query(sql,args,true)});}finally{ended=true;}},
  afterRenewal:async({withNormalSession,authVersion})=>{assert.equal(authVersion,2);assert.equal(renewed,true);savedSession=withNormalSession;await withNormalSession(api,async()=>{workCount++;if(options.workFailure)throw Error('SYNTHETIC_PRIVATE_WORK_DETAIL');});}});
 return {input,proof,target,functions,triggers,client,api,calls,records,http,run,get state(){return row;},get workCount(){return workCount;},get recoveredEnded(){return ended;},lateSession:()=>savedSession(api,async()=>{})};
}
test('renewal updates only fixed QA credential and sessions, then normal new-version login/logout',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'QA_CREDENTIAL_RENEWAL_AND_NORMAL_SESSION_SCOPE_COMPLETED');
 assert.deepEqual(f.http,['/auth/login','/auth/session','/auth/logout']);assert.equal(f.workCount,1);assert.equal(f.state.account.version,2);assert.equal(f.state.account.auth_version,2);
 assert.deepEqual(f.calls.filter(c=>/^(UPDATE|INSERT|DELETE|ALTER|GRANT)\b/.test(c.sql.replace(/^\/\*[\s\S]*?\*\//,'').trim())).map(c=>c.sql),[RENEWAL_SQL.update,RENEWAL_SQL.sessions]);
 const secretHash=f.calls.find(c=>c.sql===RENEWAL_SQL.update).args[5];assert.ok(!JSON.stringify([result,f.records]).includes(secretHash));assert.ok(!JSON.stringify(result).includes('TOKEN'));
 await assert.rejects(f.lateSession(),/^Error: B07_RENEWAL_SINGLE_SESSION_REQUIRED$/);assert.equal(f.http.length,3);
});
test('renewal conflict, source binding or lost original permission rolls back without new credential',async()=>{
 for(const options of [{stale:true},{sourceBound:true},{permissionLost:true},{casFailure:true},{historyChanged:true}]){const f=fixture(options);await assert.rejects(f.run(),/^Error: B07_RENEWAL_PRECOMMIT_FAILED_NO_RETRY$/);assert.equal(f.http.length,0);assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'));assert.equal(f.calls.filter(c=>c.sql===RENEWAL_SQL.update).length,options.casFailure?1:0);}
});
test('unknown renewal COMMIT uses same RAM credential and one read-only recovery, never a second UPDATE',async()=>{
 const f=fixture({unknownCommit:true}),result=await f.run();assert.equal(result.commitRecovered,true);assert.equal(f.recoveredEnded,true);
 assert.equal(f.calls.filter(c=>c.sql===RENEWAL_SQL.update).length,1);assert.ok(f.calls.some(c=>c.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'&&c.recovery));assert.ok(!f.calls.some(c=>c.sql==='ROLLBACK'&&!c.recovery));assert.equal(f.workCount,1);
 const failed=fixture({unknownCommit:true,unknownUnconfirmed:true});await assert.rejects(failed.run(),/^Error: B07_RENEWAL_COMMITTED_OR_UNKNOWN_PRESERVE_TARGET_NO_RETRY$/);assert.equal(failed.calls.filter(c=>c.sql===RENEWAL_SQL.update).length,1);assert.equal(failed.http.length,0);
});
test('renewal callback failure or principal mismatch logs out, clears scope and omits private detail',async()=>{
 for(const options of [{workFailure:true},{badPrincipal:true}]){const f=fixture(options);await assert.rejects(f.run(),/^Error: B07_RENEWAL_COMMITTED_OR_UNKNOWN_PRESERVE_TARGET_NO_RETRY$/);assert.deepEqual(f.http,['/auth/login','/auth/session','/auth/logout']);await assert.rejects(f.lateSession());}
});
test('renewal registration and exact existing guard attachments refuse before connection scope',()=>{
 const f=fixture();for(const change of [x=>{x.permissionProof=null;},x=>{x.permissionProof.functions[0].sha256='f'.repeat(64);},x=>{x.permissionProof.triggers[0].enabled='D';},x=>{x.target.role='OTHER';}]){const i=structuredClone(f.input);change(i);assert.throws(()=>validateCredentialRenewalInput(i));}assert.equal(f.calls.length,0);
});

test('original read-only proof maps existing permissions and guards without claiming renewal',()=>{
 const f=fixture(),t=f.target;
 const proof={status:'PASS_SAME07_CREDENTIAL_CATALOG_READONLY_NOT_RENEWAL_AUTHORIZATION',businessDML:0,credentialRead:false,credentialChanged:false,HTTPAttempted:false,rollbackReturned:true,clientsEnded:true,
 identity:{db:t.database,oid:t.oid,acting_role:t.role,session_role:t.session_role,no_tcp:true,postmaster:t.postmaster_started_at,readonly:'on',isolation:'repeatable read',row_security:'on'},
 roles:[{role:t.role,superuser:false,bypass_rls:false},{role:'SYN_ORDINARY',superuser:false,bypass_rls:false}],
 privileges:[...['password_hash','auth_version','version','updated_at'].flatMap(column_name=>[{role_name:t.role,table_name:'user_account',column_name,can_select:true,can_update:true},{role_name:'SYN_ORDINARY',table_name:'user_account',column_name,can_select:true,can_update:false}]),{role_name:t.role,table_name:'auth_session',column_name:'revoked_at',can_select:true,can_update:true}],
 qa:[{fixed_account:true,fixed_staff:true,fixed_login:true,login_enabled:true,version:1,auth_version:1,warehouse_role:true,employed:true,null_hall:true,source_actor_disabled:true}],bindings:{import_records:0,accounting_claims:0,native_parties:0,header_staff_bindings:0,qa_maintenance_audits:0},salesReceipt:[{status:'COMMITTED',original_hash_matches:true,original_target_matches:true,result_version:'2'}],guards:f.functions.map(x=>({name:x.name,bodySha256:x.sha256,matchesOriginal07:true,checks:{narrow:true}})),triggers:f.triggers};
 const input={...f.input,ordinaryRole:'SYN_ORDINARY',catalogSha256:'a'.repeat(64)},mapped=credentialPermissionProofFromOriginal(proof,input);
 assert.deepEqual(mapped.functions,f.functions);assert.deepEqual(mapped.triggers,f.triggers);assert.equal(mapped.originalProofPostmaster,t.postmaster_started_at);
 assert.doesNotThrow(()=>validateCredentialRenewalInput({...f.input,permissionProof:mapped}));
 for(const change of [p=>{p.rollbackReturned=false;},p=>{p.bindings.native_parties=1;},p=>{p.salesReceipt[0].result_version=1;},p=>{p.privileges[0].can_update=false;}]){const bad=structuredClone(proof);change(bad);assert.throws(()=>credentialPermissionProofFromOriginal(bad,input));}
});

test('renewal guard failure keeps only phase and SQLSTATE and rolls back the original transaction',async()=>{
 const f=fixture({updateError:true});await assert.rejects(f.run(),error=>{assert.equal(error.message,'B07_RENEWAL_PRECOMMIT_FAILED_NO_RETRY');assert.deepEqual(error.b07RenewalFailure,{phase:'CREDENTIAL_CAS',commitAttempted:false,pgCode:'23514'});assert.ok(!JSON.stringify(error).includes('PRIVATE'));return true;});
 assert.equal(f.calls.filter(c=>c.sql===RENEWAL_SQL.update).length,1);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.equal(f.http.length,0);
});
