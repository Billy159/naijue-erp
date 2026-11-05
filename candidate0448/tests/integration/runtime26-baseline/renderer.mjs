/** Offline candidate only. Even accidentally executed output stops BEFORE DDL.
 * No boolean, review label or supplied actual-catalog hash enables execution. */
import {SHA,assertSourceInventory} from './source-inventory.mjs';
import {assertCompleteAclCandidate} from './acl-matrix.mjs';
const need=(value,code)=>{if(!value)throw Error(code);};
const data=(v,keys,code)=>{
 try{need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length,code);const row={};
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);need(d&&Object.hasOwn(d,'value')&&d.enumerable,code);row[key]=d.value;}return row;
 }catch{throw Error(code);}
};
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const ident=v=>'"'+v+'"';
const knownClusters=new Set(['7701337335828107278','7702857766154043447','7702904939491061813','7702914707883278365']);
export function validatePlan(plan,inventory,now=Date.now()){
 assertSourceInventory(inventory);
 plan=data(plan,['format','mode','profile','sourceFingerprint','target','startsAt','expiresAt'],'CLOSED_PHASE1_PLAN_REQUIRED');
 need(plan.format==='DOT_RUNTIME26_BASELINE_PLAN_ONLY_V1'&&plan.mode==='OFFLINE_RENDER_ONLY_NO_EXECUTION','OFFLINE_PLAN_ONLY_REQUIRED');
 need(Object.hasOwn(inventory.profiles,plan.profile)&&plan.sourceFingerprint===inventory.sourceFingerprint,'EXACT_SOURCE_PROFILE_FINGERPRINT_REQUIRED');
 need(Number.isSafeInteger(now)&&Number.isSafeInteger(plan.startsAt)&&Number.isSafeInteger(plan.expiresAt)&&plan.startsAt<=now&&now<plan.expiresAt&&plan.expiresAt-plan.startsAt<=1200000,'FINITE_FRESH_PLAN_WINDOW_REQUIRED');
 const t=data(plan.target,['clusterSystemIdentifier','host','port','database','databaseOid','adminRole','ownerRole','runtimeRole','preparationRole','postmasterStart'],'CLOSED_NEW_TARGET_REQUIRED');
 // This rejects known old identities; an arbitrary different plan string is
 // NOT evidence that a physical cluster is new. Phase2 needs a birth receipt.
 need(typeof t.clusterSystemIdentifier==='string'&&/^[1-9][0-9]{8,24}$/.test(t.clusterSystemIdentifier)&&!knownClusters.has(t.clusterSystemIdentifier),'PLAN_CLUSTER_BINDING_AND_OLD_TARGET_DENYLIST_REQUIRED');
 need(t.host==='127.0.0.1'&&Number.isInteger(t.port)&&t.port>=1024&&t.port<=65535&&![5432,55437,55438,55439].includes(t.port),'NEW_DIRECT_LOOPBACK_PORT_REQUIRED');
 need(typeof t.database==='string'&&/^naijue_erp_test_[a-f0-9]{8,32}$/.test(t.database)&&typeof t.databaseOid==='string'&&/^[1-9]\d*$/.test(t.databaseOid)&&!['1027659','393218','16391','21551'].includes(t.databaseOid),'NEW_SYNTHETIC_DATABASE_REQUIRED');
 for(const [kind,key]of [['admin','adminRole'],['owner','ownerRole'],['runtime','runtimeRole'],['prepare','preparationRole']])need(typeof t[key]==='string'&&new RegExp('^dot_rt26_'+kind+'_[a-f0-9]{8,16}$').test(t[key]),'CLOSED_NEW_ROLE_NAMES_REQUIRED');
 need(new Set([t.adminRole,t.ownerRole,t.runtimeRole,t.preparationRole]).size===4,'DISTINCT_NEW_ROLES_REQUIRED');
 need(typeof t.postmasterStart==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(t.postmasterStart),'EXACT_POSTMASTER_TIME_REQUIRED');
 return Object.freeze({...plan,target:Object.freeze(t)});
}
function guard(condition,message){return `DO $dot_guard$ BEGIN IF (${condition}) IS DISTINCT FROM true THEN RAISE EXCEPTION '${message}'; END IF; END $dot_guard$;\n`;}
function targetGuard(plan,t){
 return guard(`current_database()=${literal(t.database)} AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${literal(t.databaseOid)} AND current_user=${literal(t.adminRole)} AND session_user=${literal(t.adminRole)} AND inet_server_addr()::text IN('127.0.0.1','127.0.0.1/32') AND inet_server_port()=${t.port} AND pg_postmaster_start_time()::text=${literal(t.postmasterStart)} AND (SELECT system_identifier::text FROM pg_control_system())=${literal(t.clusterSystemIdentifier)} AND NOT pg_is_in_recovery() AND current_setting('session_replication_role')='origin' AND extract(epoch FROM clock_timestamp())*1000>=${plan.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${plan.expiresAt} AND NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()) AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN('postgres','template0','template1',${literal(t.database)})) AND NOT EXISTS(SELECT 1 FROM pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${literal(t.adminRole)},${literal(t.ownerRole)},${literal(t.runtimeRole)},${literal(t.preparationRole)}))`,'DOT_EXACT_NEW_TARGET_OR_EXCLUSIVITY_CHANGED');
}
function roleGuard(t){
 return guard(`EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(t.adminRole)} AND rolcanlogin AND rolsuper) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(t.ownerRole)} AND NOT(rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(t.runtimeRole)} AND rolcanlogin AND rolconnlimit=0 AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${literal(t.preparationRole)} AND NOT rolcanlogin AND rolconnlimit=0 AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN(SELECT oid FROM pg_roles WHERE rolname IN(${literal(t.ownerRole)},${literal(t.runtimeRole)},${literal(t.preparationRole)})) OR roleid IN(SELECT oid FROM pg_roles WHERE rolname IN(${literal(t.ownerRole)},${literal(t.runtimeRole)},${literal(t.preparationRole)}))) AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())=${literal(t.ownerRole)} AND NOT EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=0)`,'DOT_NEW_OWNED_FENCED_ROLES_AND_PRIVATE_DATABASE_REQUIRED');
}
export function renderGenesisReadonlyPreflight(plan,inventory,now=Date.now()){
 plan=validatePlan(plan,inventory,now);const t=plan.target;
 return '-- PHASE1 READONLY GENESIS OBSERVATION; NOT APPROVAL OR EXECUTION\nBEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'30s\';\n'+targetGuard(plan,t)+roleGuard(t)
 +guard(`NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast')) AND NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql') AND NOT EXISTS(SELECT 1 FROM pg_default_acl) AND NOT EXISTS(SELECT 1 FROM pg_prepared_xacts WHERE database=current_database())`,'DOT_GENESIS_MUST_BE_EMPTY_AND_UNMODIFIED')
 +'ROLLBACK;\n';
}
export function renderV22SourcePinnedCandidate(plan,inventory,now=Date.now()){
 plan=validatePlan(plan,inventory,now);const t=plan.target,v=inventory.v22;
 need(v.parents.length===131&&new Set(v.parents.map(p=>p.signature)).size===131&&v.parents.every(p=>/^naijue_erp\.[a-z_][a-z0-9_]*\(/.test(p.signature)&&/^[a-f0-9]{64}$/.test(p.body)&&/^[a-f0-9]{64}$/.test(p.definition)),'ALL_131_CANONICAL_PARENT_SIGNATURE_BODY_DEFINITION_PINS_REQUIRED');
 need(SHA(v.definition)===v.definitionSha256&&/^CREATE OR REPLACE FUNCTION naijue_erp\.assert_core_initialization_v14\(/.test(v.definition)&&!/(?:^|\n)\s*(?:COMMIT|BEGIN|CREATE ROLE|ALTER ROLE)\s*;/i.test(v.definition),'EXACT_V22_SOURCE_MEMBER_REQUIRED');
 let sql='-- SOURCE_PINNED_CANDIDATE ONLY. Original historical patch is unchanged.\nBEGIN;\n';
 sql+="DO $phase1$ BEGIN RAISE EXCEPTION 'DOT_PHASE1_RENDER_ONLY_NO_DDL_AUTHORIZED'; END $phase1$;\n";
 sql+="SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s';\n"+targetGuard(plan,t);
 sql+=roleGuard(t);
 sql+=`SET LOCAL ROLE ${ident(t.ownerRole)};\n`;
 sql+=guard(`current_user=${literal(t.ownerRole)} AND session_user=${literal(t.adminRole)} AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())=${literal(t.ownerRole)} AND (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)=ARRAY(SELECT generate_series(1,26)) AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND p.prokind IN('f','p'))=131 AND has_column_privilege(${literal(t.runtimeRole)},'naijue_erp.import_batch','history_expected_counts','UPDATE') AND has_column_privilege(${literal(t.runtimeRole)},'naijue_erp.import_batch','history_payload_hash','UPDATE')`,'DOT_V22_EXACT_V20_SCHEMA_AND_TWO_UPDATE_PREDECESSORS_REQUIRED');
 sql+=`DO $dot_v22_parents$ DECLARE expected jsonb:=${literal(JSON.stringify(v.parents))}::jsonb; f jsonb; BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements(expected) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f->>'signature')
   AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=f->>'body'
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f->>'definition') THEN
   RAISE EXCEPTION 'DOT_V22_ALL_131_PARENT_DEFINITIONS_REQUIRED'; END IF;
 END LOOP; END $dot_v22_parents$;\n`;
 sql+=v.definition+'\nRESET ROLE;\nROLLBACK;\n';
 return {status:'SOURCE_PINNED_CANDIDATE_NOT_EXECUTABLE',sourceFingerprint:inventory.sourceFingerprint,originalV22SourceSha256:v.sourceSha256,originalDefinitionSha256:v.definitionSha256,parents:131,sql,executionFence:'DOT_PHASE1_RENDER_ONLY_NO_DDL_AUTHORIZED'};
}
export function renderCompleteBaseline(plan,inventory,matrix,now=Date.now()){
 plan=validatePlan(plan,inventory,now);need(matrix.sourceFingerprint===inventory.sourceFingerprint&&matrix.profile===plan.profile,'SOURCE_MATRIX_PROFILE_BINDING_REQUIRED');
 assertCompleteAclCandidate(matrix);
 throw Error('PHASE1_HAS_NO_FULL_DDL_EXECUTION');
}
