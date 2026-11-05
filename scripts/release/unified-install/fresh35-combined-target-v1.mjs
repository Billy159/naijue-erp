/** New-target contract for the additive 35-table combined installer.
 * No credentials, roles, processes, connections or grants are created here. */
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateOffsetInstant} from '../../../packages/application/src/unified-import-contract.ts';
export const FRESH35_COMBINED_TARGET_MODULE_SHA256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const targets=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_'+code)};
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
function snapshot(value,keys){
 need(value&&Object.getPrototypeOf(value)===Object.prototype,'CLOSED_TARGET_DATA_REQUIRED');
 const d=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(d);
 need(names.every(k=>typeof k==='string')&&names.length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value')),'CLOSED_TARGET_DATA_REQUIRED');
 return Object.fromEntries(keys.map(k=>[k,d[k].value]));
}
const decimal=(value,max)=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&value.length<=max.toString().length&&BigInt(value)<=max;
const stoppedSystemIds=new Set(['7701337335828107278','7702857766154043447','7702904939491061813','7702914707883278365','7703089336081934099','7703096890285320019','7703102194329098126','7703108941652350921','7703123541136058418','7703146531489867910','7703158405630191866','7704494445995372557']);
export const FRESH35_COMBINED_INTERFACE_ROLES=Object.freeze({
 initializer:'erp_unified27_initializer_2393dbc6db9581c2',
 importer:'erp_unified27_importer_2393dbc6db9581c2',
 runtime:'erp_unified27_runtime_2393dbc6db9581c2',
});
/** Observations are binding data, not evidence that this function connected to PG.
 * The native installer independently compares every field on its owned client. */
export function bindFresh35CombinedTarget(input,now=Date.now()){
 if(input&&typeof input==='object'&&Object.getOwnPropertyDescriptor(input,'purpose')?.value==='PRODUCTION_NEW_EMPTY_EXACT35')return bindFresh35CombinedProductionTargetV2(input,now);
 const a=snapshot(input,['proposal','physical','startsAt','expiresAt']);
 const p=snapshot(a.proposal,['database','owner','controller','runtime','admin','host','port','workspaceDirectory']);
 const m=typeof p.database==='string'&&p.database.match(/^synthetic_fresh35_([0-9]{8})_(r[1-9][0-9]{0,3})$/);
 need(m,'NEW_SYNTHETIC_DATABASE_REQUIRED');
 for(const role of ['owner','controller','runtime','admin'])need(p[role]==='fresh35_'+role+'_'+m[1]+'_'+m[2],'EXACT_DISTINCT_ROLE_NAMES_REQUIRED');
 need(p.host==='127.0.0.1'&&Number.isSafeInteger(p.port)&&p.port>1024&&p.port<65536&&!new Set([5432,55437,55438,55439]).has(p.port),'NEW_LOOPBACK_TARGET_REQUIRED');
 need(typeof p.workspaceDirectory==='string'&&resolve(p.workspaceDirectory)===p.workspaceDirectory&&p.workspaceDirectory.endsWith('/cloud-pg-fresh35-'+m[1]+'-'+m[2]),'NEW_CANONICAL_WORKSPACE_REQUIRED');
 const b=snapshot(a.physical,['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']);
 need(decimal(b.systemIdentifier,18446744073709551615n)&&!stoppedSystemIds.has(b.systemIdentifier)&&decimal(b.databaseOid,4294967295n),'CANONICAL_NEW_PHYSICAL_ID_REQUIRED');
 need(b.serverVersionNum==='170011'&&typeof b.postmasterStart==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(b.postmasterStart),'PG17_11_UTC_BIRTH_REQUIRED');
 const birthTime=Date.parse(b.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'));
 need(Number.isFinite(birthTime)&&new Date(birthTime).toISOString().slice(0,19)===b.postmasterStart.slice(0,19).replace(' ','T'),'CANONICAL_UTC_BIRTH_REQUIRED');
 need([now,a.startsAt,a.expiresAt].every(Number.isSafeInteger)&&a.startsAt<=now&&now<a.expiresAt&&a.expiresAt-a.startsAt<=1200000,'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED');
 need(birthTime>=a.startsAt&&birthTime<a.expiresAt,'POSTMASTER_MUST_START_INSIDE_ORIGINAL_WINDOW');
 const token=Object.freeze({profile:'FRESH35_COMBINED_TARGET_V1'});
 targets.set(token,freeze({format:'FRESH35_COMBINED_TARGET_BINDING_V1',proposal:p,physical:b,startsAt:a.startsAt,expiresAt:a.expiresAt,authority:'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION'}));
 return token;
}
export function describeFresh35CombinedTarget(target){need(targets.has(target),'GENUINE_TARGET_REQUIRED');return targets.get(target)}
export function fresh35CombinedTargetGuard(target,{requireEmpty}={requireEmpty:false}){
 need(typeof requireEmpty==='boolean','EXPLICIT_EMPTY_TARGET_FLAG_REQUIRED');
 return targetGuard(target,{requireEmpty,runtime:false});
}
/** Import inspection runs as the controller on its own read-only snapshot.
 * Installation still uses the original owner-only, writable guard. */
export function fresh35CombinedRuntimeTargetGuard(target){
 return targetGuard(target,{requireEmpty:false,runtime:true});
}
function targetGuard(target,{requireEmpty,runtime}){
 const binding=describeFresh35CombinedTarget(target),{proposal:p,physical:b,startsAt,expiresAt}=binding,q=quote,production=binding.purpose==='PRODUCTION_NEW_EMPTY_EXACT35';
 const interfaces=Object.values(FRESH35_COMBINED_INTERFACE_ROLES),logins=production?[p.owner,p.controller]:[p.owner,p.controller,p.runtime],roles=[p.admin,p.owner,p.controller,p.runtime,...interfaces];
 const members=[[p.controller,FRESH35_COMBINED_INTERFACE_ROLES.initializer],[p.controller,FRESH35_COMBINED_INTERFACE_ROLES.importer],[p.runtime,FRESH35_COMBINED_INTERFACE_ROLES.runtime]];
 const empty=requireEmpty?`
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class r JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc r JOIN pg_catalog.pg_namespace n ON n.oid=r.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema','pg_toast'))
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_default_acl)
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_EMPTY_DATABASE_REQUIRED' USING ERRCODE='55000'; END IF;`:'';
 return `DO $fresh35_combined_target$
BEGIN
 IF (current_database()=${q(p.database)} AND current_user=${q(runtime?p.controller:p.owner)} AND session_user=${q(runtime?p.controller:p.owner)}
 AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}
 AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}
 AND pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}
 AND pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(b.postmasterStart.replace(/\+00$/,''))}
 AND pg_catalog.host(pg_catalog.inet_server_addr())=${q(p.host)} AND pg_catalog.inet_server_port()=${p.port}
 ${production?'':"AND pg_catalog.current_setting('listen_addresses')='127.0.0.1' AND pg_catalog.current_setting('unix_socket_directories')=''"}
 AND pg_catalog.current_setting('session_replication_role')='origin' AND NOT pg_catalog.pg_is_in_recovery()
 AND pg_catalog.current_setting('transaction_isolation')=${q(runtime?'repeatable read':'read committed')} AND pg_catalog.current_setting('transaction_read_only')=${q(runtime?'on':'off')}
 AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt} AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}
 AND (SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database())=${q(p.owner)}
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE (backend_type='client backend' OR usename IS NOT NULL) AND pid<>pg_catalog.pg_backend_pid())
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname NOT IN('postgres','template0','template1',${q(p.database)}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast','naijue_erp'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${roles.map(q).join(',')}))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_prepared_xacts)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS' USING ERRCODE='55000'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public' AND n.nspowner='pg_database_owner'::regrole::oid
  AND (SELECT array_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(n.nspacl) a)=ARRAY['=U/pg_database_owner','pg_database_owner=UC/pg_database_owner'])
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_operator WHERE oprnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_collation WHERE collnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_conversion WHERE connamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_opclass WHERE opcnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily WHERE opfnamespace='public'::regnamespace)
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_PUBLIC_SCHEMA_BOUNDARY_DIFFERS' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN(${logins.map(q).join(',')}) AND rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=2 AND rolvaliduntil>pg_catalog.clock_timestamp() AND extract(epoch FROM rolvaliduntil)*1000<=${expiresAt})<>${logins.length}
 ${production?`OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(p.runtime)} AND rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=2 AND ${binding.ordinary.runtimeLoginValidUntil===null?"(rolvaliduntil IS NULL OR rolvaliduntil='infinity'::timestamptz)":'rolvaliduntil='+q(binding.ordinary.runtimeLoginValidUntil)+'::timestamptz AND rolvaliduntil>clock_timestamp()'})`:''}
 OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN(${interfaces.map(q).join(',')}) AND NOT rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconnlimit=0)<>3
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${q(p.admin)} AND rolcanlogin AND rolsuper AND rolvaliduntil>pg_catalog.clock_timestamp() AND extract(epoch FROM rolvaliduntil)*1000<=${expiresAt})
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_ROLE_ATTRIBUTES_DIFFER' USING ERRCODE='42501'; END IF;
 IF (SELECT coalesce(jsonb_agg(jsonb_build_array(m.rolname,r.rolname,a.admin_option,a.inherit_option,a.set_option) ORDER BY m.rolname COLLATE "C",r.rolname COLLATE "C"),'[]'::jsonb) FROM pg_catalog.pg_auth_members a JOIN pg_catalog.pg_roles m ON m.oid=a.member JOIN pg_catalog.pg_roles r ON r.oid=a.roleid WHERE left(m.rolname,3)<>'pg_' OR left(r.rolname,3)<>'pg_')
 IS DISTINCT FROM ${q(JSON.stringify(members.map(([member,role])=>[member,role,false,false,true]).sort((a,b)=>a[0].localeCompare(b[0],'en')||a[1].localeCompare(b[1],'en'))))}::jsonb
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_EXACT_MEMBERSHIP_REQUIRED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND (a.grantee=0 OR a.grantee NOT IN(${[p.owner,p.controller,p.runtime].map(x=>q(x)+'::regrole::oid').join(',')}) OR a.is_grantable OR (a.grantee<>d.datdba AND a.privilege_type<>'CONNECT')))
 OR NOT pg_catalog.has_database_privilege(${q(p.controller)},current_database(),'CONNECT') OR NOT pg_catalog.has_database_privilege(${q(p.runtime)},current_database(),'CONNECT')
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_DATABASE_ACL_DIFFERS' USING ERRCODE='42501'; END IF;
 ${empty}
END $fresh35_combined_target$;`;
}

const reconstructedProductionTargets=new WeakSet();
const identifier=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(value)&&!value.startsWith('pg_');
const endpoint=value=>typeof value==='string'&&value.length>0&&value.length<=253&&!/[\s\u0000-\u001f\u007f'"\\]/.test(value);
const port=value=>Number.isInteger(value)&&value>=1&&value<=65535;
function productionTarget(input,now,installed=false){
 const a=snapshot(input,['proposal','physical','startsAt','expiresAt','purpose','ordinary']);
 need(a.purpose==='PRODUCTION_NEW_EMPTY_EXACT35','PRODUCTION_PURPOSE_REQUIRED');
 const p=snapshot(a.proposal,['database','owner','controller','runtime','admin','host','port','workspaceDirectory']);
 need(['database','owner','controller','runtime','admin'].every(k=>identifier(p[k]))&&!p.database.startsWith('synthetic_')&&new Set([p.owner,p.controller,p.runtime,p.admin,...Object.values(FRESH35_COMBINED_INTERFACE_ROLES)]).size===7,'EXACT_PRODUCTION_IDENTITIES_REQUIRED');
 need(endpoint(p.host)&&port(p.port)&&typeof p.workspaceDirectory==='string'&&resolve(p.workspaceDirectory)===p.workspaceDirectory&&p.workspaceDirectory!=='/','EXACT_PRODUCTION_ENDPOINT_REQUIRED');
 const b=snapshot(a.physical,['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']);
 need(decimal(b.systemIdentifier,18446744073709551615n)&&!stoppedSystemIds.has(b.systemIdentifier)&&decimal(b.databaseOid,4294967295n)&&b.serverVersionNum==='170011','CANONICAL_NEW_PHYSICAL_ID_REQUIRED');
 need(typeof b.postmasterStart==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00$/.test(b.postmasterStart),'PG17_11_UTC_BIRTH_REQUIRED');
 const birth=Date.parse(b.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'));
 need(Number.isFinite(birth)&&new Date(birth).toISOString().slice(0,19)===b.postmasterStart.slice(0,19).replace(' ','T'),'CANONICAL_UTC_BIRTH_REQUIRED');
 need([a.startsAt,a.expiresAt].every(Number.isSafeInteger)&&a.startsAt<a.expiresAt&&a.expiresAt-a.startsAt<=1200000&&birth>=a.startsAt&&birth<a.expiresAt,'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED');
 if(!installed)need(Number.isSafeInteger(now)&&now>=a.startsAt&&now<a.expiresAt,'ORIGINAL_TWENTY_MINUTE_WINDOW_REQUIRED');
 const o=snapshot(a.ordinary,['connectHost','connectPort','serverAddress','serverPort','runtimeLoginValidUntil','referenceDirectory']);
 need(endpoint(o.connectHost)&&port(o.connectPort)&&endpoint(o.serverAddress)&&port(o.serverPort)&&typeof o.referenceDirectory==='string'&&resolve(o.referenceDirectory)===o.referenceDirectory&&o.referenceDirectory!=='/','EXACT_ORDINARY_ENDPOINT_REQUIRED');
 need(o.runtimeLoginValidUntil===null||typeof o.runtimeLoginValidUntil==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(o.runtimeLoginValidUntil)&&validateOffsetInstant(o.runtimeLoginValidUntil),'EXPLICIT_RUNTIME_LOGIN_LIFETIME_REQUIRED');
 const token=Object.freeze({profile:'FRESH35_COMBINED_TARGET_V2'});
 targets.set(token,freeze({format:'FRESH35_COMBINED_TARGET_BINDING_V2',proposal:p,physical:b,startsAt:a.startsAt,expiresAt:a.expiresAt,authority:'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION',purpose:a.purpose,ordinary:o}));
 if(installed)reconstructedProductionTargets.add(token);return token;
}
export function bindFresh35CombinedProductionTargetV2(input,now=Date.now()){return productionTarget(input,now)}
/** Only a fixed-path protected envelope may reconstruct historical installation
 * provenance after its execution window. This never authorizes reinstall/import. */
export async function reconstructFresh35InstalledProductionTargetV2(envelope){
 const {assertFresh35ProtectedRecordEnvelope}=await import('./fresh35-combined-record-v1.mjs');assertFresh35ProtectedRecordEnvelope(envelope);
 need(envelope.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2'&&envelope.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V2','PRODUCTION_INSTALLED_RECORD_REQUIRED');
 const {proposal,physical,startsAt,expiresAt,purpose,ordinary}=envelope.target;
 const target=productionTarget({proposal,physical,startsAt,expiresAt,purpose,ordinary},undefined,true);
 need(JSON.stringify(describeFresh35CombinedTarget(target))===JSON.stringify(envelope.target),'INSTALLED_TARGET_RECONSTRUCTION_DIFFERS');return target;
}
export function assertFresh35InstallationTargetCurrent(target,now=Date.now()){
 const t=describeFresh35CombinedTarget(target);need(!reconstructedProductionTargets.has(target)&&Number.isSafeInteger(now)&&now>=t.startsAt&&now<t.expiresAt,'CURRENT_INSTALL_TARGET_REQUIRED');return t;
}
