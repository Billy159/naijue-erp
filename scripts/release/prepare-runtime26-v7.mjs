// SOURCE-ONLY UNIX EXTENSION PROPOSAL. Offline renderer; no PostgreSQL, IO, approval issuance or CLI.
// Existing TCP branch is unchanged; Unix is explicit and fixed to the separately reviewed test-cluster socket profile.
// Additive sibling to prepare-runtime26-v6.mjs; V1..V6 meanings stay unchanged.
import {createHash} from 'node:crypto';
import {
 NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE as V6,
 NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE as V7,
 NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES as TABLES,
} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
export const V7_STORAGE_PATCH_SHA256='41c491cca5f04cc19d15f0c05113cfb3c81fa39a648a5dc349874ba52ef588c9';
const need=(v,c)=>{if(!v)throw Error(c);};
const keys=(v,k)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===k.toSorted().join();
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const commit=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const sha=b=>createHash('sha256').update(b).digest('hex');
const lit=v=>"'"+String(v).replaceAll("'","''")+"'";
const ident=v=>'"'+v+'"';
export const V7_UNIX_TARGET=Object.freeze({transport:'UNIX_SOCKET_EXACT_V1',serverConfiguredPort:55439,unixSocketDirectory:'/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket',listenAddresses:''});
const names=v=>'ARRAY['+v.map(lit).join(',')+']::text[]';
const profiles=Object.freeze({
 V6:Object.freeze({format:'EXACT26_RUNTIME_CATALOG_EXPORT_V6',patchLevel:'26_hv2_history_set_guards_complete_write_xmin_from_v22',probe:V6}),
 V7:Object.freeze({format:'EXACT26_RUNTIME_CATALOG_EXPORT_V7',patchLevel:'26_hv2_live_ledger_pairs_complete_write_xmin_from_v22',probe:V7}),
});
// Both catalog pins below are PREPARATION observations: current_user=runtime,
// session_user=admin. Neither is the separately reviewed fresh-runtime-login pin.
// expectedSourceCommit is supplied by the independently checked source manifest,
// never read out of approval bytes by the caller as its own trust anchor.
export function renderRuntime26V7Preparation(approvedBytes,trustedApprovalSha256,storagePatchBytes,expectedSourceCommit,now=Date.now()){
 need(Buffer.isBuffer(approvedBytes)&&approvedBytes.length<=65536&&hash(trustedApprovalSha256)&&sha(approvedBytes)===trustedApprovalSha256,'EXTERNAL_APPROVAL_PIN_REQUIRED');
 const a=JSON.parse(approvedBytes.toString('utf8'));
 need(keys(a,['version','decision','scope','target','from','to','beforeCatalogSha256','afterCatalogSha256','storagePatchSha256','sourceCommit','startsAt','expiresAt','productionAuthorized'])&&a.version==='RUNTIME26_V7_LIVE_PAIR_PREPARATION_V1'&&a.decision==='AUTHORIZE_EXACT_ADDITIVE_PAIR_DDL_AND_FOUR_COLUMN_CELLS_ONLY'&&a.scope==='FRESH_ISOLATED_SYNTHETIC_ONLY'&&a.productionAuthorized===false,'CLOSED_ISOLATED_PREPARATION_APPROVAL_REQUIRED');
 need(commit(expectedSourceCommit)&&a.sourceCommit===expectedSourceCommit&&Number.isSafeInteger(now)&&Number.isSafeInteger(a.startsAt)&&Number.isSafeInteger(a.expiresAt)&&a.startsAt<=now&&now<a.expiresAt&&a.expiresAt>a.startsAt&&a.expiresAt-a.startsAt<=900000&&hash(a.beforeCatalogSha256)&&hash(a.afterCatalogSha256)&&a.beforeCatalogSha256!==a.afterCatalogSha256,'FRESH_SOURCE_AND_CATALOG_PINS_REQUIRED');
 need(a.from==='V6'&&a.to==='V7','EXPLICIT_VERSIONED_TRANSITION_REQUIRED');
 need(Buffer.isBuffer(storagePatchBytes)&&storagePatchBytes.length<=131072&&a.storagePatchSha256===V7_STORAGE_PATCH_SHA256&&sha(storagePatchBytes)===V7_STORAGE_PATCH_SHA256,'EXACT_SOURCE_STORAGE_PATCH_REQUIRED');
 const patch=storagePatchBytes.toString('utf8'),marker='\nBEGIN;\n',start=patch.indexOf(marker),end=patch.lastIndexOf('COMMIT;\n');
 need(start>=0&&end>start&&end+'COMMIT;\n'.length===patch.length,'EXACT_SOURCE_STORAGE_PATCH_REQUIRED');
 const body=patch.slice(start+marker.length,end);
 const z=a.target;
 const targetKeys=['database','databaseOid','ownerRole','runtimeRole','sessionUser','serverAddress','serverPort','postmasterStart'];
 const unix=keys(z,[...targetKeys,'transport','serverConfiguredPort','unixSocketDirectory','listenAddresses'])&&z.transport===V7_UNIX_TARGET.transport&&z.serverAddress===null&&z.serverPort===null&&z.serverConfiguredPort===V7_UNIX_TARGET.serverConfiguredPort&&z.unixSocketDirectory===V7_UNIX_TARGET.unixSocketDirectory&&z.listenAddresses===V7_UNIX_TARGET.listenAddresses;
 const tcp=keys(z,targetKeys)&&z.serverAddress==='127.0.0.1/32'&&Number.isInteger(z.serverPort)&&z.serverPort>1024&&z.serverPort<65536;
 need((tcp||unix)&&['database','ownerRole','runtimeRole','sessionUser'].every(k=>typeof z[k]==='string'&&/^[a-z_][a-z0-9_]{0,62}$/.test(z[k]))&&new Set([z.ownerRole,z.runtimeRole,z.sessionUser]).size===3&&typeof z.databaseOid==='string'&&/^[1-9][0-9]*$/.test(z.databaseOid)&&typeof z.postmasterStart==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?[+-][0-9]{2}(?::[0-9]{2})?$/.test(z.postmasterStart),'EXACT_ISOLATED_TARGET_REQUIRED');
 const guard=(condition,code)=>`DO $v7_guard$ BEGIN IF (${condition}) IS DISTINCT FROM true THEN RAISE EXCEPTION '${code}'; END IF; END $v7_guard$;\n`;
 const transportIdentity=unix?`inet_server_addr() IS NULL AND inet_server_port() IS NULL AND current_setting('port')=${lit(String(V7_UNIX_TARGET.serverConfiguredPort))} AND current_setting('unix_socket_directories')=${lit(V7_UNIX_TARGET.unixSocketDirectory)} AND current_setting('listen_addresses')=''`:`inet_server_addr()::text=${lit(z.serverAddress)} AND inet_server_port()=${z.serverPort}`;
 const identity=`current_database()=${lit(z.database)} AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${lit(z.databaseOid)} AND current_user=session_user AND session_user=${lit(z.sessionUser)} AND ${transportIdentity} AND pg_postmaster_start_time()::text=${lit(z.postmasterStart)} AND current_setting('session_replication_role')='origin' AND extract(epoch FROM clock_timestamp())*1000>=${a.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${a.expiresAt}`;
 const ordinary=()=>guard(`EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${lit(z.runtimeRole)} AND rolcanlogin AND NOT (rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=${lit(z.ownerRole)} AND NOT (rolsuper OR rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=${lit(z.runtimeRole)})) AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)=${lit(z.ownerRole)}) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND pg_get_userbyid(c.relowner)<>${lit(z.ownerRole)}) AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp' AND pg_get_userbyid(p.proowner)<>${lit(z.ownerRole)})`,'ORDINARY_RUNTIME_AND_FIXED_OWNER_REQUIRED');
 const noTables=()=>guard(`has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','USAGE') AND NOT has_schema_privilege(${lit(z.runtimeRole)},'naijue_erp','CREATE') AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege) WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(${lit(z.runtimeRole)},c.oid,p.privilege))`,'NO_TABLE_PRIVILEGES_REQUIRED');
 const systemAcl=()=>guard(`NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute x ON x.attrelid=c.oid WHERE n.nspname='naijue_erp' AND x.attnum<0 AND NOT x.attisdropped AND (has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'SELECT') IS DISTINCT FROM (x.attname='xmin' AND c.relname=ANY(${names(TABLES)})) OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'INSERT') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'UPDATE') OR has_column_privilege(${lit(z.runtimeRole)},c.oid,x.attnum,'REFERENCES')))`,'EXACT_SYSTEM_COLUMN_RIGHTS_REQUIRED');
 const observe=(p,digest)=>`SET LOCAL ROLE ${ident(z.runtimeRole)};\nDO $v7_probe$ DECLARE r record; BEGIN EXECUTE ${lit(p.probe)} INTO STRICT r; IF r.source_routines_match IS DISTINCT FROM true OR r.catalog_sha256 IS DISTINCT FROM ${lit(digest)} OR r.migration_versions IS DISTINCT FROM '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]'::jsonb OR r.complete_write_xmin_acl_match IS DISTINCT FROM true${p===profiles.V7?' OR r.recorded_live_balance_contract_match IS DISTINCT FROM true':''} THEN RAISE EXCEPTION 'EXACT_SOURCE_CATALOG_ACL_REQUIRED'; END IF; END $v7_probe$;\nRESET ROLE;\n`;
 let sql='-- Owner-reviewed FRESH isolated synthetic preparation only; NOT runtime/release/production authority.\n-- before/after pins describe admin-session SET ROLE observations, NOT ordinary-login issuer evidence.\nBEGIN;\nSET LOCAL search_path=pg_catalog;\nSET LOCAL lock_timeout=\'3s\'; SET LOCAL statement_timeout=\'45s\';\n';
 sql+=guard(identity,'EXACT_TARGET_OR_WINDOW_CHANGED')+ordinary()+noTables()+systemAcl()+observe(profiles.V6,a.beforeCatalogSha256);
 sql+=`SET LOCAL ROLE ${ident(z.ownerRole)};\n`+body;
 sql+=`GRANT SELECT ("quantity_before", "quantity_after") ON TABLE naijue_erp.inventory_ledger TO ${ident(z.runtimeRole)};\nGRANT INSERT ("quantity_before", "quantity_after") ON TABLE naijue_erp.inventory_ledger TO ${ident(z.runtimeRole)};\nRESET ROLE;\n`;
 sql+=ordinary()+noTables()+systemAcl()+observe(profiles.V7,a.afterCatalogSha256)+guard(identity,'EXACT_TARGET_OR_WINDOW_CHANGED')+'COMMIT;\n';
 const descriptor=p=>Object.freeze({format:p.format,patchLevel:p.patchLevel});
 return Object.freeze({sql,from:descriptor(profiles.V6),to:descriptor(profiles.V7),addedCells:Object.freeze(['SELECT','INSERT'].flatMap(p=>['quantity_before','quantity_after'].map(c=>Object.freeze(['inventory_ledger',c,p])))),sourceCommit:a.sourceCommit,approvalSha256:trustedApprovalSha256,storagePatchSha256:V7_STORAGE_PATCH_SHA256,catalogPinObservation:'ADMIN_SESSION_SET_ROLE_RUNTIME_ONLY',ordinaryRuntimeReviewStillRequired:true,runtimeWindowStillRequired:true,grantsAuthenticationOrConnect:false,productionAuthorized:false});
}
