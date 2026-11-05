/** One finite component, invoked only inside the new host's owned live target. */
import { Client } from 'pg';import { randomBytes } from 'node:crypto';
import { createNodeScryptPasswords } from '../../../../packages/authentication/src/passwords.ts';
import { buildFixture } from './contract.mjs';import { seedReference } from './seed.mjs';import { renderReadManifest } from './read-manifest.mjs';import { runOriginalReads } from './reads.mjs';
import { createReaderSql,inspectReader,permissionNegatives,negativeSql } from './acl.mjs';
import { targetSnapshot,targetGuard } from '../../../integration/runtime26-baseline/schema-objects-only/source-plan.mjs';
import { need,identifier,literal,budgetedQuery,connectCaptured,settleClient } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export function finiteGuard(input,role,adminPid,readerPid=null) {
 const t=targetSnapshot(input);need(role==='dot_opt01_read_'+t.database.slice('naijue_erp_test_'.length)&&Number.isInteger(adminPid)&&adminPid>0&&(readerPid===null||Number.isInteger(readerPid)&&readerPid>0&&readerPid!==adminPid),'FINITE_CAPTURED_BACKEND_IDENTITIES_REQUIRED');
 const names=[t.admin,t.owner,t.sentinel,t.prepare,role].map(literal).join(',');const pids=[adminPid,...(readerPid===null?[]:[readerPid])].join(',');
 return `DO $component$ BEGIN IF (current_user=${literal(t.admin)} AND session_user=${literal(t.admin)} AND pg_backend_pid()=${adminPid}
 AND current_database()=${literal(t.database)} AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${literal(t.databaseOid)} AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())=${literal(t.owner)}
 AND (SELECT system_identifier::text FROM pg_control_system())=${literal(t.systemIdentifier)} AND pg_postmaster_start_time()::text=${literal(t.postmasterStart)} AND inet_server_addr()=inet '127.0.0.1' AND inet_server_port()=${t.port} AND NOT pg_is_in_recovery()
 AND current_setting('server_version_num')='170011' AND current_setting('session_replication_role')='origin' AND current_setting('unix_socket_directories')='' AND current_setting('listen_addresses')='127.0.0.1'
 AND extract(epoch FROM clock_timestamp())*1000<${t.expiresAt} AND extract(epoch FROM clock_timestamp())*1000>=${t.startsAt}
 AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${names})) AND (SELECT count(*) FROM pg_roles WHERE rolname IN(${names}))=5
 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(t.admin)} AND rolsuper AND rolcanlogin)
 AND (SELECT count(*) FROM pg_roles WHERE rolname IN(${literal(t.owner)},${literal(t.sentinel)},${literal(t.prepare)}) AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=0)=3
 AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(role)} AND rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=2)
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname IN(${names})) OR roleid IN(SELECT oid FROM pg_roles WHERE rolname IN(${names})))
 AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND (pid NOT IN(${pids}) OR pid=${adminPid} AND usename<>${literal(t.admin)}${readerPid===null?'':` OR pid=${readerPid} AND (usename<>${literal(role)} OR datname<>${literal(t.database)})`}))
 AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN('postgres','template0','template1',${literal(t.database)}))
 ) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FINITE_COMPONENT_TARGET_OR_CLIENT_CHANGED';END IF;END $component$;`;
}
export function restrictedOptions(target,role,password,timeoutMillis) {
 const t=targetSnapshot(target);need(role==='dot_opt01_read_'+t.database.slice('naijue_erp_test_'.length)&&typeof password==='string'&&password.length>=32&&Number.isInteger(timeoutMillis)&&timeoutMillis>0&&timeoutMillis<=45000,'EXPLICIT_FINITE_READER_OPTIONS_REQUIRED');
 return Object.freeze({host:'127.0.0.1',port:t.port,database:t.database,user:role,password,ssl:false,application_name:'dot-opt01-finite-reader',connectionTimeoutMillis:Math.min(5000,timeoutMillis),query_timeout:timeoutMillis,options:'-c search_path=pg_catalog',statement_timeout:45000,lock_timeout:3000,idle_in_transaction_session_timeout:60000});
}
export function unknownCommit(scope,original) {need(scope==='SOURCE'||scope==='COMPONENT','FIXED_COMMIT_SCOPE_REQUIRED');const code=scope+'_COMMIT_OUTCOME_UNKNOWN_NO_REPLAY';return Object.assign(new Error(code+': '+original.message,{cause:original}),{code});}
/** Once uncertain COMMIT is seen, even cleanup cannot send another wire SQL. */
export function sqlGate(raw) {let error=null;return Object.freeze({query(...args){if(error)throw new Error('NO_SQL_AFTER_UNKNOWN_COMMIT',{cause:error});return raw(...args);},quarantine(cause){error=cause;},quarantined(){return error!==null;}});}
export async function sourceCommitBoundary(gate,sql) {try{return await gate.query(sql);}catch(original){const error=unknownCommit('SOURCE',original);gate.quarantine(error);throw error;}}
/** No retry. A sent COMMIT with failed acknowledgement is UNKNOWN, never rollback proof. */
export async function oneTransaction(query,work) {
 let began=false,commitAttempted=false;try{await query('BEGIN');began=true;const result=await work();commitAttempted=true;await query('COMMIT');return result;}catch(original){
  if(commitAttempted)throw unknownCommit('COMPONENT',original);
  if(began)try{await query('ROLLBACK');}catch(rollback){throw new AggregateError([original,rollback],'COMPONENT_ERROR_AND_ROLLBACK_FAILURE_QUARANTINE');}
  throw original;
 }
}
export async function executeComponent({target,plan,query,budget,save,unchanged,clientClosures,registerSecret}) {
 const f=buildFixture({id:target.database.slice('naijue_erp_test_'.length)}),manifest=await renderReadManifest(f),allowed=new Set(manifest.queries.map(q=>q.text));
 await save('read-query-manifest.json',manifest);await save('independent-fixture.json',f);await unchanged();await query(targetGuard(target));
 const appSecret=randomBytes(32).toString('base64url');registerSecret(appSecret);const appHash=await createNodeScryptPasswords().hash(appSecret);registerSecret(appHash);
 const seed=await oneTransaction(query,async()=>{await query(targetGuard(target));await query(`SET LOCAL ROLE ${identifier(target.owner)}`);const result=await seedReference(query,f,appHash);await query('RESET ROLE');await query(targetGuard(target));return result;});await save('seed-result.json',seed);
 const role='dot_opt01_read_'+f.id,secret=randomBytes(32).toString('base64url');registerSecret(secret);
 // Cluster bootstrap DB ACLs, not original source function ACLs.
 for(const d of ['postgres','template0','template1'])await query(`REVOKE ALL ON DATABASE ${identifier(d)} FROM PUBLIC`);
 await oneTransaction(query,async()=>{await query(targetGuard(target));for(const sql of createReaderSql(role,target.database))await query(sql);await query(`ALTER ROLE ${identifier(role)} PASSWORD ${literal(secret)}`);});
 const adminPid=(await query('SELECT pg_backend_pid() AS pid')).rows[0].pid;let live=null;const pending=[];
 const guard=async()=>{await unchanged();await query(finiteGuard(target,role,adminPid,live?.processID??null));};
 await guard();const acl=await inspectReader(query,role,target.database,plan);await save('effective-reader-acl.json',acl);
 const close=async c=>{const receipt=await settleClient(c);clientClosures.push(receipt);if(live===c)live=null;need(receipt.confirmed,'FINITE_READER_CLIENT_CLOSE_UNCONFIRMED');};
 const identity=async c=>{const r=(await budgetedQuery(c,"SELECT session_user::text AS session,current_user::text AS current_name,current_database() AS database,pg_backend_pid() AS pid,inet_server_addr()=inet '127.0.0.1' AS address_match,inet_server_port() AS port,current_setting('transaction_read_only') AS read_only,current_setting('session_replication_role') AS replication_role",[],budget)).rows[0];need(r.session===role&&r.current_name===role&&r.database===target.database&&r.pid===c.processID&&r.address_match===true&&r.port===target.port&&r.read_only==='on'&&r.replication_role==='origin','ACTUAL_DIRECT_READER_LOGIN_REQUIRED');return r;};
 const open=async()=>{await Promise.all(pending);await guard();const c=await connectCaptured(()=>new Client(restrictedOptions(target,role,secret,Math.min(45000,budget.remaining()))),r=>clientClosures.push(r));live=c;try{await guard();const actual=await identity(c);await save('reader-session-'+String(clientClosures.length)+'.json',actual);return c;}catch(e){await close(c);throw e;}};
 const events=[];
 const pool={async connect(){const c=await open();let released=false;return {async query(sql,values=[]){need(!released&&allowed.has(sql),'ONLY_OFFLINE_ENUMERATED_ORIGINAL_READ_SQL');await guard();const r=await budgetedQuery(c,sql,values,budget);events.push({sql,rows:r.rowCount});return r;},release(){if(!released){released=true;pending.push(close(c));}}};}};
 try {const readResult=await runOriginalReads(pool,f);await Promise.all(pending);await save('actual-original-reads.json',readResult);const c=await open();try{const negatives=negativeSql(f,target.owner),negativeAllowed=new Set(['BEGIN READ WRITE','ROLLBACK',...negatives.map(x=>x[1])]);const proofs=await permissionNegatives(async(sql,values)=>{need(negativeAllowed.has(sql),'EXACT_NEGATIVE_SQL_REQUIRED');await guard();return budgetedQuery(c,sql,values,budget);},f,target.owner);await save('actual-permission-negatives.json',proofs);}finally{await close(c);}await guard();await save('actual-read-events.json',events);return {scope:f.scope,actualOriginalReadQueries:events.length,exactAllowedReadSql:manifest.queries.length,referenceRows:99,actualRestrictedLogin:true,sourceSetupOwnerOnly:true,normalRuntimeAdmission:false};}
 finally{await Promise.allSettled(pending);if(live)await close(live);}
}
