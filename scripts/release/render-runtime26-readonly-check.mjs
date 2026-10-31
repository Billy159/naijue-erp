// CANDIDATE ONLY. Emits SELECT-only catalog observation in a READ ONLY transaction.
// No driver, connection, credentials, DDL, ACL, business writes or admission authority.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const need=(x,c)=>{if(!x)throw Error(c);};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(o,k)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join()===k.sort().join();
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
export async function renderReadOnlyCheck(plan, loadModule=async p=>import(pathToFileURL(p).href)) {
 need(exact(plan,['format','scope','sourceFile','sourceSha256','sourceCommit','profile','target']), 'CLOSED_PLAN_REQUIRED');
 need(plan.format==='RUNTIME26_READONLY_METADATA_PLAN_V1'&&plan.scope==='EXACT_TARGET_METADATA_ONLY_NO_UPGRADE', 'READONLY_SCOPE_REQUIRED');
 need(hash(plan.sourceSha256)&&/^[a-f0-9]{40}$/.test(plan.sourceCommit)&&['V6','V7','V8','PREPARATION13_V1'].includes(plan.profile),'SOURCE_PROFILE_REQUIRED');
 need(typeof plan.sourceFile==='string'&&plan.sourceFile==='adapters/postgres/src/native-import-accounting-capability.ts','EXACT_REPO_SOURCE_REQUIRED');
 const file=resolve(plan.sourceFile),bytes=readFileSync(file);
 need(createHash('sha256').update(bytes).digest('hex')===plan.sourceSha256,'SOURCE_HASH_MISMATCH');
 const t=plan.target;
 need(exact(t,['database','databaseOid','runtimeRole','sessionUser','serverAddress','serverPort','postmasterStart','serverVersionNum']), 'EXACT_TARGET_REQUIRED');
 need(['database','runtimeRole','sessionUser'].every(k=>typeof t[k]==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(t[k]))&&t.sessionUser===t.runtimeRole,'ORDINARY_DIRECT_LOGIN_REQUIRED');
 need(typeof t.databaseOid==='string'&&/^[1-9][0-9]*$/.test(t.databaseOid)&&typeof t.serverVersionNum==='string'&&/^[1-9][0-9]*$/.test(t.serverVersionNum),'TARGET_OID_VERSION_REQUIRED');
 need(typeof t.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?[+-]\d\d(?::\d\d)?$/.test(t.postmasterStart),'POSTMASTER_REQUIRED');
 need((t.serverAddress===null&&t.serverPort===null)||(typeof t.serverAddress==='string'&&/^[0-9a-fA-F:.\/]+$/.test(t.serverAddress)&&Number.isInteger(t.serverPort)&&t.serverPort>0&&t.serverPort<65536),'EXPLICIT_TRANSPORT_REQUIRED');
 if(plan.profile==='PREPARATION13_V1')need(t.database==='demo_8877_v7_r1_rehearsal_20261031_01'&&t.runtimeRole==='v7_r1_prepare_20261031_01','EXACT_PREPARATION13_TARGET_REQUIRED');
 const m=await loadModule(file);
 const key=plan.profile==='PREPARATION13_V1'?'NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION13_XMIN_FROM_V22_METADATA_PROBE':plan.profile==='V8'?'NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE':plan.profile==='V6'?'NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE':'NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE';
 let probe=m[key]; const anchor="SELECT manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,";
 need(typeof probe==='string'&&probe.split(anchor).length===2,'EXACT_ORIGINAL_PROBE_REQUIRED');
 probe=probe.replace(anchor,"SELECT ((manifest - 'routines') || pg_catalog.jsonb_build_object('routines',(SELECT pg_catalog.jsonb_agg(r - 'source') FROM pg_catalog.jsonb_array_elements(manifest->'routines') r))) AS manifest, manifest->'identity' AS identity,manifest->'migration_versions' AS migration_versions,");
 const same=(sql,value)=>`${sql} IS NOT DISTINCT FROM ${value===null?'NULL':lit(value)}`;
 const checks=[same('current_database()',t.database),same('(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())',t.databaseOid),same('current_user::text',t.runtimeRole),same('session_user::text',t.sessionUser),same('pg_catalog.inet_server_addr()::text',t.serverAddress),same('pg_catalog.inet_server_port()::text',t.serverPort===null?null:String(t.serverPort)),same('pg_catalog.pg_postmaster_start_time()::text',t.postmasterStart),same("pg_catalog.current_setting('server_version_num')",t.serverVersionNum),"pg_catalog.current_setting('session_replication_role')='origin'","EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))","NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user))"];
 // A mismatched target raises division-by-zero before the catalog statement. ON_ERROR_STOP is mandatory.
 const guard=`SELECT 1 / CASE WHEN (${checks.join(') AND (')}) THEN 1 ELSE 0 END AS exact_target_required;`;
 return `-- CANDIDATE: observation only; never an upgrade/review approval. sourceCommit=${plan.sourceCommit}\n\\set ON_ERROR_STOP on\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL statement_timeout='30s';\nSET LOCAL lock_timeout='3s';\n${guard}\n${probe};\n${guard}\nROLLBACK;\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try {need(process.argv.length===3,'USAGE_NODE_RENDER_PLAN_JSON');process.stdout.write(await renderReadOnlyCheck(JSON.parse(readFileSync(process.argv[2],'utf8'))));}
 catch {process.stderr.write('REFUSE: invalid or incomplete reviewed source/target plan; no database connection attempted.\n');process.exitCode=2;}
}
