// Offline finite V7 -> V8 ACL renderer. No DB, IO, approval issuance, DDL or CLI.
import {createHash} from 'node:crypto';
import {
 NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE as V7,
 NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE as V8,
 NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES as XMIN,
 NATIVE_RUNTIME26_CATEGORY_CMIN_TABLES as CMIN,
 NATIVE_RUNTIME26_NORMAL_DELETE_TABLES as DELETES,
} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
const need=(v,c)=>{if(!v)throw Error(c);};
const exact=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===k.toSorted().join();
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const ident=v=>'"'+v+'"';
const names=v=>'ARRAY['+v.map(lit).join(',')+']::text[]';
const profiles=Object.freeze({
 V7:Object.freeze({format:'EXACT26_RUNTIME_CATALOG_EXPORT_V7',patchLevel:'26_hv2_live_ledger_pairs_complete_write_xmin_from_v22',probe:V7}),
 V8:Object.freeze({format:'EXACT26_RUNTIME_CATALOG_EXPORT_V8',patchLevel:'26_hv2_live_pairs_complete_write_acl_v8_from_v7',probe:V8}),
});
/** Independently supplied source/approval/catalog pins are never derived from the
 * target by this function. Original loopback TCP and the separately approved
 * fixed QA178 socket are the only targets; no generic Unix/cloud fallback. */
export function renderRuntime26V8Preparation(approvedBytes,trustedApprovalSha256,expectedSourceCommit,now=Date.now()){
 need(Buffer.isBuffer(approvedBytes)&&approvedBytes.length<=65536&&hash(trustedApprovalSha256)&&createHash('sha256').update(approvedBytes).digest('hex')===trustedApprovalSha256,'EXTERNAL_APPROVAL_PIN_REQUIRED');
 const a=JSON.parse(approvedBytes.toString('utf8'));
 need(exact(a,['version','decision','scope','target','from','to','beforeCatalogSha256','afterCatalogSha256','sourceCommit','startsAt','expiresAt','productionAuthorized'])&&a.version==='RUNTIME26_V8_FIVE_ACL_PREPARATION_V1'&&a.decision==='AUTHORIZE_EXACT_TWO_CMIN_AND_THREE_DELETE_ONLY'&&a.scope==='FRESH_ISOLATED_SYNTHETIC_ONLY'&&a.productionAuthorized===false,'CLOSED_FIVE_ACL_APPROVAL_REQUIRED');
 need(typeof expectedSourceCommit==='string'&&/^[a-f0-9]{40}$/.test(expectedSourceCommit)&&a.sourceCommit===expectedSourceCommit&&Number.isSafeInteger(now)&&Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)&&a.startsAt<=now&&now<a.expiresAt&&a.expiresAt>a.startsAt&&a.expiresAt-a.startsAt<=900000&&hash(a.beforeCatalogSha256)&&hash(a.afterCatalogSha256)&&a.beforeCatalogSha256!==a.afterCatalogSha256,'FRESH_SOURCE_AND_CATALOG_PINS_REQUIRED');
 need(a.from==='V7'&&a.to==='V8','EXPLICIT_V7_TO_V8_REQUIRED');
 const z=a.target,keys=['database','databaseOid','ownerRole','runtimeRole','sessionUser','serverAddress','serverPort','postmasterStart'];
 const tcp=exact(z,keys)&&z.serverAddress==='127.0.0.1/32'&&Number.isInteger(z.serverPort)&&z.serverPort>1024&&z.serverPort<65536;
 const qaUnix=exact(z,[...keys,'transport','serverConfiguredPort','unixSocketDirectory','listenAddresses'])&&z.transport==='UNIX_SOCKET_QA178_EXACT_V1'&&z.serverAddress===null&&z.serverPort===null&&z.serverConfiguredPort===5432&&z.unixSocketDirectory==='/qa-socket'&&z.listenAddresses===''&&z.database==='demo_8877_v7_r1_rehearsal_20261031_01'&&z.ownerRole==='v7_r1_owner_20261031_01'&&z.runtimeRole==='v7_r1_runtime_20261031_01'&&z.sessionUser==='t15_prod_bootstrap'&&!['16391','21551','1027659'].includes(z.databaseOid);
 need((tcp||qaUnix)&&['database','ownerRole','runtimeRole','sessionUser'].every(k=>typeof z[k]==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(z[k]))&&new Set([z.ownerRole,z.runtimeRole,z.sessionUser]).size===3&&typeof z.databaseOid==='string'&&/^[1-9][0-9]*$/.test(z.databaseOid)&&typeof z.postmasterStart==='string'&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?[+-]\d\d(?::\d\d)?$/.test(z.postmasterStart),'EXACT_ISOLATED_TARGET_REQUIRED');
 const guard=(v,c)=>`DO $v8_guard$ BEGIN IF (${v}) IS DISTINCT FROM true THEN RAISE EXCEPTION '${c}'; END IF; END $v8_guard$;\n`;
 const transport=qaUnix?"inet_server_addr() IS NULL AND inet_server_port() IS NULL AND current_setting('port')='5432' AND current_setting('unix_socket_directories')='/qa-socket' AND current_setting('listen_addresses')=''":`inet_server_addr()::text=${lit(z.serverAddress)} AND inet_server_port()=${z.serverPort}`;
 const identity=`current_database()=${lit(z.database)} AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${lit(z.databaseOid)} AND current_user=session_user AND session_user=${lit(z.sessionUser)} AND ${transport} AND pg_postmaster_start_time()::text=${lit(z.postmasterStart)} AND current_setting('session_replication_role')='origin' AND extract(epoch FROM clock_timestamp())*1000>=${a.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${a.expiresAt}`;
 const ordinary=()=>guard(`EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${lit(z.runtimeRole)} AND rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${lit(z.ownerRole)} AND NOT(rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${lit(z.runtimeRole)})) AND EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND pg_get_userbyid(datdba)=${lit(z.ownerRole)}) AND EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)=${lit(z.ownerRole)}) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND pg_get_userbyid(c.relowner)<>${lit(z.ownerRole)}) AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND pg_get_userbyid(p.proowner)<>${lit(z.ownerRole)})`,'ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED');
 const tableAcl=after=>guard(`has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','USAGE') AND NOT has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','CREATE') AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN(VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) WHERE n.nspname='naijue_erp' AND c.relkind IN('r','p','v','m','f') AND has_table_privilege(${lit(z.runtimeRole)},c.oid,p.privilege) IS DISTINCT FROM (${after?`p.privilege='DELETE' AND c.relname=ANY(${names(DELETES)})`:'false'}))`,'EXACT_THREE_DELETE_TABLE_RIGHTS_REQUIRED');
 const systemAcl=after=>guard(`NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute x ON x.attrelid=c.oid WHERE n.nspname='naijue_erp' AND x.attnum<0 AND NOT x.attisdropped AND(has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'SELECT') IS DISTINCT FROM ((x.attname='xmin' AND c.relname=ANY(${names(XMIN)}))${after?` OR(x.attname='cmin' AND c.relname=ANY(${names(CMIN)}))`:''}) OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'INSERT') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'UPDATE') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'REFERENCES')))`,'EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED');
 const observe=(p,digest)=>`SET LOCAL ROLE ${ident(z.runtimeRole)};\nDO $v8_probe$ DECLARE r record; BEGIN EXECUTE ${lit(p.probe)} INTO STRICT r; IF r.source_routines_match IS DISTINCT FROM true OR r.catalog_sha256 IS DISTINCT FROM ${lit(digest)} OR r.migration_versions IS DISTINCT FROM '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]'::jsonb OR r.recorded_live_balance_contract_match IS DISTINCT FROM true${p===profiles.V8?' OR r.complete_write_system_acl_match_v8 IS DISTINCT FROM true OR r.normal_delete_acl_match_v8 IS DISTINCT FROM true':' OR r.complete_write_xmin_acl_match IS DISTINCT FROM true'} THEN RAISE EXCEPTION 'EXACT_SOURCE_CATALOG_ACL_REQUIRED'; END IF; END $v8_probe$;\nRESET ROLE;\n`;
 let sql='-- Target-specific synthetic preparation candidate only. No production/runtime/release authority.\nBEGIN;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'45s\';\n';
 sql+=guard(identity,'EXACT_TARGET_OR_WINDOW_CHANGED')+ordinary()+tableAcl(false)+systemAcl(false)+observe(profiles.V7,a.beforeCatalogSha256);
 sql+=`SET LOCAL ROLE ${ident(z.ownerRole)};\n`;
 for(const table of CMIN)sql+=`GRANT SELECT ("cmin") ON TABLE naijue_erp.${ident(table)} TO ${ident(z.runtimeRole)};\n`;
 for(const table of DELETES)sql+=`GRANT DELETE ON TABLE naijue_erp.${ident(table)} TO ${ident(z.runtimeRole)};\n`;
 sql+='RESET ROLE;\n'+ordinary()+tableAcl(true)+systemAcl(true)+observe(profiles.V8,a.afterCatalogSha256)+guard(identity,'EXACT_TARGET_OR_WINDOW_CHANGED')+'COMMIT;\n';
 const descriptor=p=>Object.freeze({format:p.format,patchLevel:p.patchLevel});
 return Object.freeze({sql,from:descriptor(profiles.V7),to:descriptor(profiles.V8),
  addedCells:Object.freeze([...CMIN.map(t=>Object.freeze([t,'cmin','SELECT'])),...DELETES.map(t=>Object.freeze([t,null,'DELETE']))]),
  sourceCommit:a.sourceCommit,approvalSha256:trustedApprovalSha256,catalogPinObservation:'ADMIN_SESSION_SET_ROLE_RUNTIME_ONLY',ordinaryRuntimeReviewStillRequired:true,runtimeWindowStillRequired:true,productionAuthorized:false});
}
