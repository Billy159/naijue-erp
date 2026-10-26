// Source-only, fixed isolated QA lifecycle. Importing performs no I/O, login, or connection.
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {QA_IDENTITY,SQL as fixtureSql} from './qa-identity-schema19.mjs';
const must=(ok,code)=>{if(!ok)throw Error(code);};
const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>stable(a)===stable(b);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}(?![\s\S])/.test(x);
const functions={guard_maintenance_account_event:['965d9d3433b929ccd151b9a147eeef713770d7b7311e49c80cfaa3d17b118549'],validate_maintenance_root_commit:['8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512','002818dfd8d764e99221bb0548da1141054871ae674aba6bb9f6ce59c9d92d1c'],validate_available_administrator_commit:['3a9a1bea930614761185af90b8591a539b855647974b68b004869c80f5e5ba18']};
export const RENEWAL_SQL=Object.freeze({
 target:fixtureSql.target,
 admission:`/* b07-qa-renewal:admission */ SELECT
 (SELECT jsonb_agg(version ORDER BY version) FROM naijue_erp.schema_migration) AS versions,
 (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND p.pronargs=0 AND p.proname=ANY($1::text[])) AS functions,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('oid',t.oid::text,'name',t.tgname,'table_name',r.relname,'routine',p.proname,'enabled',t.tgenabled,'internal',t.tgisinternal,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred) ORDER BY t.tgname),'[]'::jsonb)
  FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE n.nspname='naijue_erp' AND r.relname='user_account' AND NOT t.tgisinternal) AS triggers,
 NOT (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AND current_setting('session_replication_role')='origin' AND current_setting('row_security')='on' AS management_role_safe,
 has_table_privilege(current_user,'naijue_erp.user_account','SELECT') AND has_table_privilege(current_user,'naijue_erp.staff','SELECT')
  AND has_table_privilege(current_user,'naijue_erp.auth_session','SELECT') AS can_read_identity,
 has_column_privilege(current_user,'naijue_erp.user_account','password_hash','UPDATE') AND has_column_privilege(current_user,'naijue_erp.user_account','auth_version','UPDATE')
  AND has_column_privilege(current_user,'naijue_erp.user_account','version','UPDATE') AND has_column_privilege(current_user,'naijue_erp.user_account','updated_at','UPDATE') AS can_update_credential,
 has_column_privilege(current_user,'naijue_erp.auth_session','revoked_at','UPDATE') AS can_revoke_sessions`,
 history:`/* b07-qa-renewal:history */ SELECT count(*)::int AS count,
 min(encode(sha256(convert_to(jsonb_build_object('receipt',to_jsonb(r),'revision',to_jsonb(v),'audit',to_jsonb(a),'effective',to_jsonb(e),'source',to_jsonb(h))::text,'UTF8')),'hex')) AS sha256
 FROM naijue_erp.operation_receipt r JOIN naijue_erp.history_revision v ON v.id=(r.result_data->>'revisionId')::uuid AND v.operation_id=r.id
 JOIN naijue_erp.audit_change a ON a.operation_id=r.id JOIN naijue_erp.history_sales_effective e ON e.header_id=r.target_id AND e.revision_id=v.id
 JOIN naijue_erp.history_sales_header h ON h.id=r.target_id
 WHERE r.actor_account_id=$1::uuid AND r.request_key=$2 AND r.target_id=$3::uuid AND r.request_hash=$4 AND r.status='COMMITTED'
 AND r.action='HISTORY_REVISE' AND r.target_type='HISTORY_SALES' AND r.result_data->>'version'='2' AND r.result_data->'ledgerEntryIds'='[]'::jsonb
 AND v.sales_id=r.target_id AND v.document_kind='SALES' AND v.from_version=1 AND v.to_version=2 AND v.request_key=r.request_key AND v.actor_account_id=r.actor_account_id
 AND a.object_id=r.target_id AND a.object_type='HISTORY_SALES' AND a.action='HISTORY_REVISE' AND a.actor_account_id=r.actor_account_id AND a.old_version=1 AND a.new_version=2
 AND e.version=2 AND h.source_status='DRAFT'`,
 lock:`/* b07-qa-renewal:lock */ SELECT a.id FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid AND s.id=$2::uuid FOR UPDATE OF a,s`,
 state:`/* b07-qa-renewal:state */ SELECT to_jsonb(a)-'password_hash' AS account,to_jsonb(s) AS staff,a.password_hash=$4 AS credential_matches,
 (SELECT count(*)::int FROM naijue_erp.auth_session WHERE account_id=$1::uuid AND revoked_at IS NULL) AS live_sessions,
 (SELECT jsonb_agg(to_jsonb(x)-'password_hash' ORDER BY x.id) FROM naijue_erp.user_account x WHERE x.id<>$1::uuid) AS other_accounts,
 EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE id=$3::uuid AND login_enabled=false) AS source_disabled,
 NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence WHERE entity_type='STAFF' AND native_id=$2::uuid) AS qa_not_source,
 NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE (object_type='ACCOUNT' AND object_id=$1::uuid AND new_version=$5::int)
 OR (object_type='STAFF' AND object_id=$2::uuid AND EXISTS(SELECT 1 FROM jsonb_array_elements(after_values->'accounts') q(v) WHERE v->>'id'=$1::text AND v->'version'=to_jsonb($5::int)))) AS no_colliding_audit
 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid AND s.id=$2::uuid`,
 update:`/* b07-qa-renewal:update */ UPDATE naijue_erp.user_account SET password_hash=$6,auth_version=auth_version+1,version=version+1,updated_at=$7::timestamptz
 WHERE id=$1::uuid AND staff_id=$2::uuid AND login_name=$3 AND login_enabled=true AND version=$4::int AND auth_version=$5::int
 RETURNING id,version,auth_version`,
 sessions:`/* b07-qa-renewal:sessions */ UPDATE naijue_erp.auth_session SET revoked_at=$2::timestamptz WHERE account_id=$1::uuid AND revoked_at IS NULL`,
});
/** Consume the original T45 read-only artifact, not a replacement catalog run or fabricated authority. */
export function credentialPermissionProofFromOriginal(proof,input){
 must(proof?.status==='PASS_SAME07_CREDENTIAL_CATALOG_READONLY_NOT_RENEWAL_AUTHORIZATION'&&proof.businessDML===0&&proof.credentialRead===false&&proof.credentialChanged===false&&proof.HTTPAttempted===false&&proof.rollbackReturned===true&&proof.clientsEnded===true,'B07_RENEWAL_ORIGINAL_PROOF_REQUIRED');
 const t=input.target,i=proof.identity;
 must(i?.db===t.database&&i.oid===t.oid&&i.acting_role===t.role&&i.session_role===t.session_role&&i.no_tcp===true&&i.readonly==='on'&&i.isolation==='repeatable read'&&i.row_security==='on'&&typeof i.postmaster==='string','B07_RENEWAL_PROOF_TARGET_CHANGED');
 const manager=proof.roles?.find(r=>r.role===t.role),ordinary=proof.roles?.find(r=>r.role===input.ordinaryRole);
 must(manager&&manager.superuser===false&&manager.bypass_rls===false&&ordinary&&ordinary.superuser===false&&ordinary.bypass_rls===false&&input.ordinaryRole!==t.role,'B07_RENEWAL_EXISTING_ROLES_REQUIRED');
 for(const [table,column] of [...['password_hash','auth_version','version','updated_at'].map(c=>['user_account',c]),['auth_session','revoked_at']]){
  const privilege=proof.privileges?.find(p=>p.role_name===t.role&&p.table_name===table&&p.column_name===column);
  must(privilege?.can_select===true&&privilege.can_update===true,'B07_RENEWAL_EXISTING_PRIVILEGES_REQUIRED');
  if(table==='user_account')must(proof.privileges.some(p=>p.role_name===input.ordinaryRole&&p.table_name===table&&p.column_name===column&&p.can_update===false),'B07_RENEWAL_ORDINARY_ROLE_MUST_NOT_RESET');
 }
 const q=proof.qa;must(Array.isArray(q)&&q.length===1&&q[0].fixed_account===true&&q[0].fixed_staff===true&&q[0].fixed_login===true&&q[0].login_enabled===true&&q[0].version===input.expectedVersion&&q[0].auth_version===input.expectedAuthVersion&&q[0].warehouse_role===true&&q[0].employed===true&&q[0].null_hall===true&&q[0].source_actor_disabled===true,'B07_RENEWAL_ORIGINAL_QA_REQUIRED');
 must(proof.bindings&&same(Object.keys(proof.bindings).sort(),['import_records','accounting_claims','native_parties','header_staff_bindings','qa_maintenance_audits'].sort())&&Object.values(proof.bindings).every(x=>x===0),'B07_RENEWAL_QA_SOURCE_BINDING_PRESENT');
 must(proof.salesReceipt?.length===1&&proof.salesReceipt[0].status==='COMMITTED'&&proof.salesReceipt[0].original_hash_matches===true&&proof.salesReceipt[0].original_target_matches===true&&proof.salesReceipt[0].result_version==='2','B07_RENEWAL_ORIGINAL_SALES_COMMIT_REQUIRED');
 must(proof.guards?.length===3&&proof.guards.every(g=>g.matchesOriginal07===true&&Object.values(g.checks??{}).length>0&&Object.values(g.checks).every(x=>x===true)),'B07_RENEWAL_ORIGINAL_GUARDS_REQUIRED');
 return {format:'B07_QA_CREDENTIAL_RENEWAL_READONLY_PROOF_1',target:t,profile:'26_v21_history_effective_value_from_v16_v14',catalogSha256:input.catalogSha256,
  functions:proof.guards.map(g=>({name:g.name,sha256:g.bodySha256})).sort((a,b)=>a.name<b.name?-1:1),triggers:proof.triggers,
  can_read_identity:true,can_update_credential:true,can_revoke_sessions:true,originalProofPostmaster:i.postmaster};
}
export function validateCredentialRenewalInput(input){
 must(input?.contract==='B07_SAME_QA_CREDENTIAL_RENEWAL_1','B07_RENEWAL_INPUT_REQUIRED');const t=input.target,p=input.permissionProof;
 must(t?.database==='naijue_erp_test_19e00102'&&/^[1-9][0-9]*$/.test(t.oid)&&t.role==='naijue_erp_test'&&typeof t.session_role==='string'
  &&t.server_address===null&&t.server_port===null&&Number.isInteger(t.port)&&t.port>0&&t.port<=65535
  &&typeof t.unix_socket_directories==='string'&&t.unix_socket_directories.startsWith('/private/tmp/nj-b07-')&&typeof t.postmaster_started_at==='string'&&t.postmaster_started_at.length>0,'B07_RENEWAL_TARGET_REQUIRED');
 must(typeof input.sourceRoot==='string'&&resolve(input.sourceRoot)===input.sourceRoot&&typeof input.sourceActorAccountId==='string'
  &&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.sourceActorAccountId)&&![QA_IDENTITY.accountId,QA_IDENTITY.staffId].includes(input.sourceActorAccountId),'B07_RENEWAL_SOURCE_IDENTITY_REQUIRED');
 must(Number.isInteger(input.expectedVersion)&&input.expectedVersion>0&&input.expectedVersion<2147483647&&Number.isInteger(input.expectedAuthVersion)&&input.expectedAuthVersion>0&&input.expectedAuthVersion<2147483647,'B07_RENEWAL_EXPECTED_VERSIONS_REQUIRED');
 must(input.originalSales?.requestKey==='D1_B07_V16_DRAFT_SALES_QUANTITY_01'&&typeof input.originalSales.documentId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.originalSales.documentId)&&sha(input.originalSales.requestHash),'B07_RENEWAL_ORIGINAL_HISTORY_BINDING_REQUIRED');
 must(typeof input.changedAt==='string'&&new Date(input.changedAt).toISOString()===input.changedAt,'B07_RENEWAL_TIME_REQUIRED');
 for(const key of ['copyRegistrationReference','preservedSnapshotReference','approvedManagementReference','intentReference'])must(typeof input[key]==='string'&&input[key].length>0,'B07_RENEWAL_REGISTRATION_REQUIRED');
 must(p?.format==='B07_QA_CREDENTIAL_RENEWAL_READONLY_PROOF_1'&&same(p.target,t)&&p.profile==='26_v21_history_effective_value_from_v16_v14'&&sha(p.catalogSha256)
  &&p.can_read_identity===true&&p.can_update_credential===true&&p.can_revoke_sessions===true&&Array.isArray(p.functions)&&p.functions.length===3
  &&same(p.functions.map(f=>f.name).sort(),Object.keys(functions).sort())&&p.functions.every(f=>functions[f.name]?.includes(f.sha256))
  &&Array.isArray(p.triggers)&&p.triggers.length>=3&&p.triggers.every(t=>['O','A'].includes(t.enabled)&&t.internal===false&&typeof t.oid==='string'), 'B07_RENEWAL_APPROVED_PROOF_REQUIRED');
 for(const [name,fn] of [['account_maintenance_event','guard_maintenance_account_event'],['user_account_maintenance_final_consistency','validate_maintenance_root_commit'],['account_available_administrator','validate_available_administrator_commit']])must(p.triggers.some(t=>t.table_name==='user_account'&&t.name===name&&t.routine===fn),'B07_RENEWAL_GUARD_ATTACHMENT_REQUIRED');
 return input;
}
async function target(client,input){const {unix_socket_directories,...expected}=input.target;
 must(client.connectionParameters?.host===unix_socket_directories&&client.connectionParameters?.port===expected.port,'B07_RENEWAL_TRANSPORT_CHANGED');
 const r=await client.query(RENEWAL_SQL.target);must(r.rows.length===1&&same(r.rows[0],expected),'B07_RENEWAL_TARGET_CHANGED');}
async function admission(client,input){await target(client,input);const r=await client.query(RENEWAL_SQL.admission,[Object.keys(functions)]),p=input.permissionProof;
 must(r.rows.length===1&&same(r.rows[0].versions,Array.from({length:26},(_,i)=>i+1))
  &&r.rows[0].management_role_safe===true&&same(r.rows[0].functions,p.functions)&&same(r.rows[0].triggers,p.triggers)&&r.rows[0].can_read_identity===true&&r.rows[0].can_update_credential===true&&r.rows[0].can_revoke_sessions===true,'B07_RENEWAL_CURRENT_ADMISSION_CHANGED');}
const safeAccount=a=>{const {version,auth_version,updated_at,...identity}=a;return identity;};
async function history(client,input){const h=input.originalSales,r=await client.query(RENEWAL_SQL.history,[QA_IDENTITY.accountId,h.requestKey,h.documentId,h.requestHash]);must(r.rows.length===1&&r.rows[0].count===1&&sha(r.rows[0].sha256),'B07_RENEWAL_COMMITTED_V2_CHANGED');return r.rows[0];}
async function state(client,input,passwordHash){const r=await client.query(RENEWAL_SQL.state,[QA_IDENTITY.accountId,QA_IDENTITY.staffId,input.sourceActorAccountId,passwordHash,input.expectedVersion+1]);must(r.rows.length===1,'B07_RENEWAL_IDENTITY_MISSING');return r.rows[0];}
function identity(s){const a=s.account,p=s.staff;must(a?.id===QA_IDENTITY.accountId&&a.staff_id===QA_IDENTITY.staffId&&a.login_name===QA_IDENTITY.loginName&&a.login_enabled===true
 &&p?.id===QA_IDENTITY.staffId&&p.name===QA_IDENTITY.name&&p.hall_id===null&&p.role==='WAREHOUSE'&&p.employment_status==='在职'&&p.contact===null&&p.version===1
 &&s.source_disabled===true&&s.qa_not_source===true&&s.no_colliding_audit===true,'B07_RENEWAL_FIXED_QA_IDENTITY_REQUIRED');}
function completed(s,before,input){identity(s);must(s.credential_matches===true&&s.live_sessions===0&&s.account.version===input.expectedVersion+1&&s.account.auth_version===input.expectedAuthVersion+1
 &&Date.parse(s.account.updated_at)===Date.parse(input.changedAt)&&same(safeAccount(s.account),safeAccount(before.account))&&same(s.staff,before.staff)&&same(s.other_accounts,before.other_accounts),'B07_RENEWAL_READBACK_CHANGED');}
/** Parent owns the admitted real client, independent pinned proof, recovery client, normal API, and cleanup.
 * No secret/hash/token escapes into returned evidence or error messages. */
export async function withB07QaIdentityCredentialRenewal({client,input:raw,recordPreparation,afterRenewal,runNormalSession,withRecoveryClient}){
 const input=validateCredentialRenewalInput(structuredClone(raw));
 for(const fn of [recordPreparation,afterRenewal,runNormalSession,withRecoveryClient])must(typeof fn==='function','B07_RENEWAL_PARENT_CALLBACKS_REQUIRED');
 const {createNodeScryptPasswords}=await import(pathToFileURL(resolve(input.sourceRoot,'packages/authentication/src/passwords.ts')).href);
 let password=randomBytes(32).toString('base64url'),passwordHash=null,began=false,commitAttempted=false,active=true,loginUsed=false;
 let before,beforeHistory,commitRecovered=false,phase='PREPARATION';
 try{
  passwordHash=await createNodeScryptPasswords().hash(password);
  must(/^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash),'B07_RENEWAL_SUPPORTED_ENCODING_REQUIRED');
  await recordPreparation({contract:input.contract,qaAccountId:QA_IDENTITY.accountId,intentReference:input.intentReference,target:input.target,catalogSha256:input.permissionProof.catalogSha256,originalReadOnlyProofPostmaster:input.permissionProof.originalProofPostmaster??null,expectedVersion:input.expectedVersion,expectedAuthVersion:input.expectedAuthVersion,sourceIdentityChanged:false});
  try{
   await client.query('BEGIN');began=true;await client.query("SET LOCAL lock_timeout='4s'");await client.query("SET LOCAL statement_timeout='12s'");
   await client.query('LOCK TABLE naijue_erp.schema_migration IN SHARE MODE');phase='CURRENT_ADMISSION';await admission(client,input);
   const locked=await client.query(RENEWAL_SQL.lock,[QA_IDENTITY.accountId,QA_IDENTITY.staffId]);must(locked.rows.length===1,'B07_RENEWAL_QA_LOCK_REQUIRED');
   phase='ORIGINAL_V2_AND_QA';beforeHistory=await history(client,input);before=await state(client,input,passwordHash);identity(before);must(before.account.version===input.expectedVersion&&before.account.auth_version===input.expectedAuthVersion&&before.credential_matches===false,'B07_RENEWAL_VERSION_CONFLICT');
   phase='CREDENTIAL_CAS';const written=await client.query(RENEWAL_SQL.update,[QA_IDENTITY.accountId,QA_IDENTITY.staffId,QA_IDENTITY.loginName,input.expectedVersion,input.expectedAuthVersion,passwordHash,input.changedAt]);
   must(written.rowCount===1&&written.rows.length===1&&written.rows[0].id===QA_IDENTITY.accountId&&written.rows[0].version===input.expectedVersion+1&&written.rows[0].auth_version===input.expectedAuthVersion+1,'B07_RENEWAL_CAS_FAILED');
   phase='SESSION_REVOCATION';await client.query(RENEWAL_SQL.sessions,[QA_IDENTITY.accountId,input.changedAt]);completed(await state(client,input,passwordHash),before,input);must(same(await history(client,input),beforeHistory),'B07_RENEWAL_HISTORY_CHANGED');await admission(client,input);
   phase='COMMIT';commitAttempted=true;await client.query('COMMIT');began=false;
  }catch(error){
   if(!commitAttempted){if(began)await client.query('ROLLBACK');const safe=Error('B07_RENEWAL_PRECOMMIT_FAILED_NO_RETRY');if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))safe.code=error.code;throw safe;}
   // Never issue another UPDATE or ROLLBACK after an uncertain COMMIT response.
   phase='READONLY_COMMIT_RECOVERY';await withRecoveryClient(async recovery=>{await recovery.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');let done=false;
    try{await admission(recovery,input);completed(await state(recovery,input,passwordHash),before,input);must(same(await history(recovery,input),beforeHistory),'B07_RENEWAL_HISTORY_CHANGED');await recovery.query('COMMIT');done=true;}
    finally{if(!done)await recovery.query('ROLLBACK');}});
   commitRecovered=true;
  }
  phase='NORMAL_CONTINUATION';await afterRenewal({qaIdentity:QA_IDENTITY,authVersion:input.expectedAuthVersion+1,withNormalSession:async(api,work)=>{
   must(active&&!loginUsed&&typeof work==='function','B07_RENEWAL_SINGLE_SESSION_REQUIRED');loginUsed=true;
   return runNormalSession({api,password,authVersion:input.expectedAuthVersion+1,work});
  }});
  must(loginUsed,'B07_RENEWAL_NORMAL_LOGIN_NOT_RUN');
  return {status:'QA_CREDENTIAL_RENEWAL_AND_NORMAL_SESSION_SCOPE_COMPLETED',qaAccountId:QA_IDENTITY.accountId,version:input.expectedVersion+1,authVersion:input.expectedAuthVersion+1,commitRecovered,automaticRetry:false,sourceIdentityChanged:false};
 }catch(error){const safe=Error(commitAttempted?'B07_RENEWAL_COMMITTED_OR_UNKNOWN_PRESERVE_TARGET_NO_RETRY':'B07_RENEWAL_PRECOMMIT_FAILED_NO_RETRY');Object.defineProperty(safe,'b07RenewalFailure',{value:{phase,commitAttempted,pgCode:typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?error.code:null}});throw safe;}
 finally{active=false;password=null;passwordHash=null;}
}
