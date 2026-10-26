// T45-only pre-upgrade fixture. Importing this module performs no I/O or database action.
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const QA_IDENTITY = Object.freeze({
 staffId:'b0700000-0000-4000-8000-000000000001',
 accountId:'b0700000-0000-4000-8000-000000000002',
 loginName:'B07_QA_HISTORY_ONLY_20261026',role:'WAREHOUSE',hallId:null,
 employmentStatus:'在职',name:'B07 独立历史编辑 QA 非来源人员'
});
const must=(ok,code)=>{if(!ok)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
export const SQL=Object.freeze({
 target:`/* b07-qa-identity:target */ SELECT current_database()::text AS database,
 (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
 current_user::text AS role,session_user::text AS session_role,
 inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
 current_setting('port')::int AS port,current_setting('unix_socket_directories') AS unix_socket_directories,
 pg_postmaster_start_time()::text AS postmaster_started_at`,
 versions:`/* b07-qa-identity:versions */ SELECT version FROM naijue_erp.schema_migration ORDER BY version`,
 guards:`/* b07-qa-identity:guards */ SELECT count(*)::int AS count FROM pg_trigger
 WHERE tgrelid IN ('naijue_erp.staff'::regclass,'naijue_erp.user_account'::regclass) AND NOT tgisinternal`,
 before:`/* b07-qa-identity:before */ SELECT
 (SELECT count(*)::int FROM naijue_erp.user_account) AS accounts,
 (SELECT count(*)::int FROM naijue_erp.auth_session) AS sessions,
 (SELECT count(*)::int FROM naijue_erp.user_account WHERE id=$1::uuid AND login_enabled=false) AS disabled_source,
 (SELECT count(*)::int FROM naijue_erp.staff WHERE id=$2::uuid) AS qa_staff,
 (SELECT count(*)::int FROM naijue_erp.user_account WHERE id=$3::uuid OR staff_id=$2::uuid OR login_name=$4) AS qa_account`,
 staff:`/* b07-qa-identity:insert-staff */ INSERT INTO naijue_erp.staff
 (id,name,hall_id,role,contact,employment_status,version) VALUES($1,$2,NULL,'WAREHOUSE',NULL,'在职',1)`,
 account:`/* b07-qa-identity:insert-account */ INSERT INTO naijue_erp.user_account
 (id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
 VALUES($1,$2,$3,$4,true,1,1,$5::timestamptz,$5::timestamptz)`,
 readback:`/* b07-qa-identity:readback */ SELECT
 (SELECT count(*)::int FROM naijue_erp.user_account) AS accounts,
 (SELECT count(*)::int FROM naijue_erp.auth_session) AS sessions,
 (SELECT count(*)::int FROM naijue_erp.staff WHERE id=$2::uuid) AS qa_staff_present,
 (SELECT count(*)::int FROM naijue_erp.user_account WHERE id=$3::uuid OR staff_id=$2::uuid OR login_name=$4) AS qa_account_present,
 (SELECT count(*)::int FROM naijue_erp.user_account WHERE id=$1::uuid AND login_enabled=false) AS disabled_source,
 (SELECT count(*)::int FROM naijue_erp.staff WHERE id=$2::uuid AND name=$6 AND hall_id IS NULL
  AND role='WAREHOUSE' AND contact IS NULL AND employment_status='在职' AND version=1) AS qa_staff,
 (SELECT count(*)::int FROM naijue_erp.user_account WHERE id=$3::uuid AND staff_id=$2::uuid AND login_name=$4
  AND login_enabled=true AND auth_version=1 AND version=1 AND created_at=$5::timestamptz AND updated_at=$5::timestamptz) AS qa_account`
});
function validate(input){
 must(input?.contract==='B07_PREUPGRADE_QA_IDENTITY_1','B07_FIXTURE_INPUT_REQUIRED');
 const t=input.target;
 must(t?.database==='naijue_erp_test_19e00102'&&/^[1-9][0-9]*$/.test(t.oid)&&typeof t.role==='string'&&t.role.length>0
  &&typeof t.session_role==='string'&&t.session_role.length>0&&t.server_address===null&&t.server_port===null
  &&Number.isInteger(t.port)&&t.port>0&&t.port<=65535
  &&typeof t.unix_socket_directories==='string'&&t.unix_socket_directories.startsWith('/private/tmp/nj-b07-')
  &&typeof t.postmaster_started_at==='string'&&t.postmaster_started_at.length>0,'B07_EXACT_PRIVATE_TARGET_REQUIRED');
 must(uuid(input.sourceActorAccountId)&&![QA_IDENTITY.accountId,QA_IDENTITY.staffId].includes(input.sourceActorAccountId),'B07_ORIGINAL_SOURCE_ACTOR_REQUIRED');
 must(typeof input.createdAt==='string'&&new Date(input.createdAt).toISOString()===input.createdAt,'B07_FIXED_PREPARATION_TIME_REQUIRED');
 must(typeof input.sourceRoot==='string'&&resolve(input.sourceRoot)===input.sourceRoot,'B07_PINNED_SOURCE_ROOT_REQUIRED');
 must(typeof input.copyRegistrationReference==='string'&&input.copyRegistrationReference.length>0
  &&typeof input.preservedSnapshotReference==='string'&&input.preservedSnapshotReference.length>0,'B07_COPY_SNAPSHOT_REGISTRATION_REQUIRED');
 return input;
}
async function target(client,input){
 const rows=(await client.query(SQL.target)).rows;must(rows.length===1,'B07_TARGET_CHANGED');
 const actual=rows[0];must(Object.keys(actual).length===Object.keys(input.target).length
  &&Object.entries(input.target).every(([k,v])=>actual[k]===v),'B07_TARGET_CHANGED');
}
const values=input=>[input.sourceActorAccountId,QA_IDENTITY.staffId,QA_IDENTITY.accountId,QA_IDENTITY.loginName];
const readbackValues=input=>[...values(input),input.createdAt,QA_IDENTITY.name];
const good=r=>r&&r.accounts===2&&r.sessions===0&&r.disabled_source===1&&r.qa_staff===1&&r.qa_account===1&&r.qa_staff_present===1&&r.qa_account_present===1;

/** Read-only resolution after an unknown seed COMMIT. Does not repeat inserts,
 * regenerate credentials, claim a login, or admit application work. */
export async function readB07QaIdentityOutcome({client,input:raw}){
 const input=validate(raw);
 try{
  await target(client,input);
  const rows=(await client.query(SQL.readback,readbackValues(input))).rows;
  must(rows.length===1,'B07_FIXTURE_READBACK_UNKNOWN');
  const r=rows[0],committed=good(r),absent=r.accounts===1&&r.sessions===0&&r.disabled_source===1&&r.qa_staff_present===0&&r.qa_account_present===0;
  return {status:committed?'FIXTURE_ROWS_PRESENT_CREDENTIALS_NOT_RECOVERED':absent?'FIXTURE_ROWS_ABSENT_NO_AUTOMATIC_RETRY':'FIXTURE_OUTCOME_UNKNOWN',loginReady:false,automaticRetry:false};
 }catch{throw Error('B07_FIXTURE_READBACK_UNKNOWN');}
}

/** Caller supplies its already registered connected setup client and original
 * private preparation recorder. No pool/restore/DDL/GRANT/trigger changes here.
 * afterSeed owns the approved upgrade and nonowner API creation. Its work can
 * use withNormalSession; the generated secret never leaves that closure. */
export async function withB07QaIdentityFixture({client,input:raw,recordPreparation,afterSeed}){
 const input=validate(raw);must(typeof client?.query==='function'&&typeof recordPreparation==='function'&&typeof afterSeed==='function','B07_ORIGINAL_CARRIER_REQUIRED');
 const {createNodeScryptPasswords}=await import(pathToFileURL(resolve(input.sourceRoot,'packages/authentication/src/passwords.ts')).href);
 let password=randomBytes(32).toString('base64url'),passwordHash=null,began=false,commitAttempted=false;
 try{
  passwordHash=await createNodeScryptPasswords().hash(password);
  must(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash),'B07_SUPPORTED_CREDENTIAL_ENCODING_REQUIRED');
  await client.query('BEGIN');began=true;
  await client.query("SET LOCAL lock_timeout='4s'");await client.query("SET LOCAL statement_timeout='12s'");
  await target(client,input);
  await client.query('LOCK TABLE naijue_erp.schema_migration IN SHARE MODE');
  const versions=(await client.query(SQL.versions)).rows.map(r=>r.version);
  must(same(versions,Array.from({length:19},(_,i)=>i+1)),'B07_PREUPGRADE_SCHEMA19_REQUIRED');
  await client.query('LOCK TABLE naijue_erp.staff,naijue_erp.user_account,naijue_erp.auth_session IN SHARE ROW EXCLUSIVE MODE');
  const guards=(await client.query(SQL.guards)).rows;
  must(guards.length===1&&guards[0].count===0,'B07_PREUPGRADE_GUARD_PRESENT_NO_BYPASS');
  const before=(await client.query(SQL.before,values(input))).rows;
  must(before.length===1&&same(before[0],{accounts:1,sessions:0,disabled_source:1,qa_staff:0,qa_account:0}),'B07_FIXTURE_NOT_FRESH_NO_REPLAY');
  await recordPreparation({contract:input.contract,target:input.target,copyRegistrationReference:input.copyRegistrationReference,
   preservedSnapshotReference:input.preservedSnapshotReference,createdAt:input.createdAt,sourceActorAccountId:input.sourceActorAccountId,
   qaIdentity:QA_IDENTITY,stage:'PREUPGRADE_FIXTURE_INSERT_INTENT',newStaff:1,newAccounts:1,newSessions:0,sourceIdentityChanged:false});
  const staff=await client.query(SQL.staff,[QA_IDENTITY.staffId,QA_IDENTITY.name]);must(staff.rowCount===1,'B07_FIXTURE_STAFF_INSERT_FAILED');
  const account=await client.query(SQL.account,[QA_IDENTITY.accountId,QA_IDENTITY.staffId,QA_IDENTITY.loginName,passwordHash,input.createdAt]);
  must(account.rowCount===1,'B07_FIXTURE_ACCOUNT_INSERT_FAILED');
  const after=(await client.query(SQL.readback,readbackValues(input))).rows;
  must(after.length===1&&good(after[0]),'B07_FIXTURE_READBACK_FAILED');
  commitAttempted=true;await client.query('COMMIT');began=false;
 }catch{
  if(began&&!commitAttempted)try{await client.query('ROLLBACK');}catch{}
  password=null;passwordHash=null;
  throw Error(commitAttempted?'B07_FIXTURE_COMMIT_UNKNOWN_READBACK_ONLY':'B07_FIXTURE_PRECOMMIT_FAILED_NO_RETRY');
 }
 passwordHash=null;
 let active=true,loginUsed=false;
 try{
  await afterSeed({qaIdentity:QA_IDENTITY,withNormalSession:async(api,work)=>{
   must(active&&!loginUsed&&typeof work==='function','B07_SINGLE_NORMAL_LOGIN_REQUIRED');loginUsed=true;
   must(api?.app?.server?.listening===false&&typeof api.trustedOrigin==='string','B07_NORMAL_PRIVATE_API_REQUIRED');
   let cookie=null;
   try{
    const response=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:api.trustedOrigin,'content-type':'application/json'},payload:{loginName:QA_IDENTITY.loginName,password}});
    must(response.statusCode===200,'B07_NORMAL_LOGIN_FAILED');
    const setCookie=response.headers['set-cookie'];const cookies=typeof setCookie==='string'?[setCookie]:setCookie;
    must(Array.isArray(cookies)&&cookies.length>0,'B07_NORMAL_SESSION_COOKIE_MISSING');
    cookie=cookies.map(x=>x.split(';')[0]).join('; ');
    const session=await api.app.inject({method:'GET',url:'/auth/session',headers:{origin:api.trustedOrigin,cookie}});
    must(session.statusCode===200,'B07_NORMAL_SESSION_FAILED');
    const a=session.json().principal;
    must(a?.accountId===QA_IDENTITY.accountId&&a.staffId===QA_IDENTITY.staffId&&a.role==='WAREHOUSE'&&a.hallId===null&&a.authVersion===1,'B07_NORMAL_PRINCIPAL_CHANGED');
    await work({actor:{accountId:QA_IDENTITY.accountId,hallId:null},privateCookie:cookie});
   }finally{
    if(cookie){const out=await api.app.inject({method:'POST',url:'/auth/logout',headers:{origin:api.trustedOrigin,cookie,'content-type':'application/json'},payload:{}});must(out.statusCode===204,'B07_NORMAL_LOGOUT_UNCONFIRMED');}
    cookie=null;
   }
  }});
  must(loginUsed,'B07_NORMAL_LOGIN_NOT_RUN');
  return {status:'QA_FIXTURE_AND_NORMAL_SESSION_SCOPE_COMPLETED',qaIdentity:QA_IDENTITY,sourceActorAccountId:input.sourceActorAccountId,sourceIdentityChanged:false,automaticRetry:false};
 }catch{throw Error('B07_FIXTURE_COMMITTED_CONTINUATION_FAILED_PRESERVE_COPY_AND_ORIGINAL_KEYS');}
 finally{active=false;password=null;passwordHash=null;}
}
