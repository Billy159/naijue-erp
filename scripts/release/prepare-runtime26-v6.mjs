// Offline renderer only. It never connects to PostgreSQL and never approves its own input.
import {createHash} from 'node:crypto';
import {
 NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE as V5,
 NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE as V6,
 NATIVE_RUNTIME26_COMPLETE_MAINTENANCE_XMIN_TABLES as TABLES5,
 NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES as TABLES6,
} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
const need=(v,c)=>{if(!v)throw Error(c);};
const keys=(v,k)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join()===k.sort().join();
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const ident=v=>'"'+v+'"';
export const HISTORY_COLUMNS=Object.freeze(['actor_account_id','after_facts','before_facts','changed_at','document_kind','from_version','id','operation_id','reason','request_key','sales_id','stock_effect_basis','stock_effect_evidence','to_version','transfer_id']);
const base='26_hv2_history_set_guards';
const profiles=Object.freeze({
 V5:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V5',patchLevel:base+'_complete_maintenance_xmin_from_v22',tables:TABLES5,probe:V5},
 V6:{format:'EXACT26_RUNTIME_CATALOG_EXPORT_V6',patchLevel:base+'_complete_write_xmin_from_v22',tables:TABLES6,probe:V6},
});
export function renderRuntime26V6Preparation(approvedBytes,trustedApprovalSha256,now=Date.now()){
 need(Buffer.isBuffer(approvedBytes)&&approvedBytes.length<=65536&&hash(trustedApprovalSha256)&&createHash('sha256').update(approvedBytes).digest('hex')===trustedApprovalSha256,'EXTERNAL_APPROVAL_PIN_REQUIRED');
 const a=JSON.parse(approvedBytes.toString('utf8'));
 need(keys(a,['version','decision','target','from','to','beforeCatalogSha256','afterCatalogSha256','sourceCommit','expiresAt','productionAuthorized'])&&a.version==='RUNTIME26_V6_HISTORY_READ_PREPARATION_V1'&&a.decision==='AUTHORIZE_EXACT_HISTORY_SIXTEEN_READ_DELTA_ONLY'&&a.productionAuthorized===false,'CLOSED_ISOLATED_PREPARATION_APPROVAL_REQUIRED');
 need(typeof a.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(a.sourceCommit)&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>now&&hash(a.beforeCatalogSha256)&&hash(a.afterCatalogSha256),'FRESH_SOURCE_AND_CATALOG_PINS_REQUIRED');
 const f=profiles[a.from],t=profiles[a.to];
 need(a.from==='V5'&&a.to==='V6'&&f&&t,'EXPLICIT_VERSIONED_TRANSITION_REQUIRED');
 const z=a.target;
 need(keys(z,['database','databaseOid','ownerRole','runtimeRole','sessionUser','serverAddress','serverPort','postmasterStart'])&&['database','ownerRole','runtimeRole','sessionUser'].every(k=>typeof z[k]==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(z[k]))&&new Set([z.ownerRole,z.runtimeRole,z.sessionUser]).size===3&&typeof z.databaseOid==='string'&&/^[1-9][0-9]*$/.test(z.databaseOid)&&z.serverAddress==='127.0.0.1/32'&&Number.isInteger(z.serverPort)&&z.serverPort>1024&&z.serverPort<65536&&typeof z.postmasterStart==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?[+-][0-9]{2}(?::[0-9]{2})?$/.test(z.postmasterStart),'EXACT_ISOLATED_TARGET_REQUIRED');
 const tables=names=>names.length?'ARRAY['+names.map(lit).join(',')+']::text[]':'ARRAY[]::text[]';
 const identity=`current_database()=${lit(z.database)} AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${lit(z.databaseOid)} AND session_user=${lit(z.sessionUser)} AND inet_server_addr()::text=${lit(z.serverAddress)} AND inet_server_port()=${z.serverPort} AND pg_postmaster_start_time()::text=${lit(z.postmasterStart)} AND current_setting('session_replication_role')='origin' AND extract(epoch FROM clock_timestamp())*1000<${a.expiresAt}`;
 const guard=(condition,code)=>`DO $v6_guard$ BEGIN IF (${condition}) IS DISTINCT FROM true THEN RAISE EXCEPTION '${code}'; END IF; END $v6_guard$;\n`;
 const acl=names=>guard(`NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute x ON x.attrelid=c.oid WHERE n.nspname='naijue_erp' AND x.attnum<0 AND NOT x.attisdropped AND (has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'SELECT') IS DISTINCT FROM (x.attname='xmin' AND c.relname=ANY(${tables(names)})) OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'INSERT') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'UPDATE') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'REFERENCES')))`,'EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED');
 const observe=(p,digest)=>`SET LOCAL ROLE ${ident(z.runtimeRole)};\nDO $v6_probe$ DECLARE r record; BEGIN EXECUTE ${lit(p.probe)} INTO r; IF r.source_routines_match IS DISTINCT FROM true OR r.catalog_sha256 IS DISTINCT FROM ${lit(digest)} OR r.migration_versions IS DISTINCT FROM '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]'::jsonb${p===profiles.V5?' OR r.complete_maintenance_xmin_acl_match IS DISTINCT FROM true':p===profiles.V6?' OR r.complete_write_xmin_acl_match IS DISTINCT FROM true':''} THEN RAISE EXCEPTION 'EXACT_SOURCE135_CATALOG_ACL_REQUIRED'; END IF; END $v6_probe$;\nRESET ROLE;\n`;
 let sql='-- Owner-reviewed isolated preparation; NOT runtime capability or production authorization.\nBEGIN;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'45s\';\n';
 sql+=guard(identity,'EXACT_TARGET_OR_EXPIRY_CHANGED');
 sql+=guard(`EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${lit(z.runtimeRole)} AND rolcanlogin AND NOT (rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${lit(z.ownerRole)} AND NOT (rolsuper OR rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${lit(z.runtimeRole)})) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND pg_get_userbyid(c.relowner)<>${lit(z.ownerRole)})`,'ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED');
 const history=after=>guard(`(SELECT array_agg(x.attname::text ORDER BY x.attname COLLATE \"C\") FROM pg_attribute x WHERE x.attrelid='naijue_erp.history_revision'::regclass AND x.attnum>0 AND NOT x.attisdropped)=${tables(HISTORY_COLUMNS)} AND NOT EXISTS (SELECT 1 FROM pg_attribute x LEFT JOIN LATERAL aclexplode(x.attacl) g ON g.grantee=(SELECT oid FROM pg_roles WHERE rolname=${lit(z.runtimeRole)}) WHERE x.attrelid='naijue_erp.history_revision'::regclass AND x.attnum>0 AND NOT x.attisdropped AND (has_column_privilege(${lit(z.runtimeRole)},x.attrelid,x.attnum,'SELECT') IS DISTINCT FROM ${after} OR has_column_privilege(${lit(z.runtimeRole)},x.attrelid,x.attnum,'INSERT') OR has_column_privilege(${lit(z.runtimeRole)},x.attrelid,x.attnum,'UPDATE') OR has_column_privilege(${lit(z.runtimeRole)},x.attrelid,x.attnum,'REFERENCES') OR ${after ? `(g.privilege_type IS DISTINCT FROM 'SELECT' OR g.is_grantable IS DISTINCT FROM false OR pg_get_userbyid(g.grantor) IS DISTINCT FROM ${lit(z.ownerRole)})` : 'g.grantee IS NOT NULL'}))`,'EXACT_HISTORY_FIFTEEN_READ_DELTA_REQUIRED');
 sql+=guard(`has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','USAGE') AND NOT has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','CREATE') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(${lit(z.runtimeRole)},c.oid,p.privilege))`,'NO_TABLE_PRIVILEGES_REQUIRED');
 sql+=observe(f,a.beforeCatalogSha256)+acl(f.tables)+history(false);
 sql+=`SET LOCAL ROLE ${ident(z.ownerRole)};\n`;
 for(const name of t.tables.filter(n=>!f.tables.includes(n)))sql+=`GRANT SELECT (xmin) ON TABLE naijue_erp.${ident(name)} TO ${ident(z.runtimeRole)};\n`;
 sql+=`GRANT SELECT (${HISTORY_COLUMNS.map(ident).join(', ')}) ON TABLE naijue_erp.history_revision TO ${ident(z.runtimeRole)};\n`;
 sql+='RESET ROLE;\n'+history(true)+acl(t.tables)+observe(t,a.afterCatalogSha256)+guard(identity,'EXACT_TARGET_OR_EXPIRY_CHANGED')+'COMMIT;\n';
 return Object.freeze({sql,from:{format:f.format,patchLevel:f.patchLevel},to:{format:t.format,patchLevel:t.patchLevel},addedTables:t.tables.filter(n=>!f.tables.includes(n)),sourceCommit:a.sourceCommit,approvalSha256:trustedApprovalSha256,ordinaryRuntimeReviewStillRequired:true});
}
