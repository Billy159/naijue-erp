/** New-target contract for the additive 35-table combined installer.
 * No credentials, roles, processes, connections or grants are created here. */
import {resolve,join} from 'node:path';
import {constants} from 'node:fs';
import {assertTrustedRootPath} from './trusted-install-path.mjs';
import {readFile,open,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseStrictJson,validateOffsetInstant} from '../../../packages/application/src/unified-import-contract.ts';
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
const bootstrapNetworks=new WeakMap();
const networkIdentity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
async function readBootstrapNetwork(target){
 const t=describeFresh35CombinedTarget(target),path=join(t.proposal.workspaceDirectory,'bootstrap-network-observation.json');
 await assertTrustedRootPath(path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await file.stat({bigint:true});need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o7777n)===0o444n&&before.size>0n&&before.size<=16384n,'BOOTSTRAP_NETWORK_PROTECTED_FILE_REQUIRED');
  const bytes=await file.readFile(),after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});
  need(BigInt(bytes.length)===before.size&&networkIdentity(before)===networkIdentity(after)&&networkIdentity(before)===networkIdentity(current),'BOOTSTRAP_NETWORK_FILE_CHANGED');
  return {value:snapshot(parseStrictJson(bytes.toString('utf8')),['format','systemIdentifier','databaseOid','serverVersionNum','postmasterStart','host','port','listenAddresses','unixSocketDirectories','adminActor','startsAt','expiresAt','sourceSetSha256']),sha256:createHash('sha256').update(bytes).digest('hex'),identity:networkIdentity(before)};
 }finally{await file.close()}
}
function checkBootstrapNetwork(target,observation,sourceSetSha256){
 const t=describeFresh35CombinedTarget(target),v=observation.value;
 need(v.format==='FRESH35_SYNTHETIC_BOOTSTRAP_NETWORK_OBSERVATION_V1'&&['systemIdentifier','databaseOid','serverVersionNum','postmasterStart'].every(k=>v[k]===t.physical[k])&&v.host===t.proposal.host&&v.port===t.proposal.port&&v.listenAddresses==='127.0.0.1'&&v.unixSocketDirectories===''&&v.adminActor===t.proposal.admin&&v.startsAt===t.startsAt&&v.expiresAt===t.expiresAt&&typeof sourceSetSha256==='string'&&/^[a-f0-9]{64}$/.test(sourceSetSha256)&&v.sourceSetSha256===sourceSetSha256,'BOOTSTRAP_NETWORK_BINDING_DIFFERS');
 need(Date.now()>=t.startsAt&&Date.now()<t.expiresAt,'BOOTSTRAP_NETWORK_WINDOW_EXPIRED');
}
/** This consumes only the original root/admin observation. JSON supplied by a
 * caller cannot establish the network fact or change a loaded baseline. */
export async function loadFresh35SyntheticBootstrapNetwork(target,sourceSetSha256){
 const t=describeFresh35CombinedTarget(target);if(['PRODUCTION_NEW_EMPTY_EXACT35','RESTORED_FROM_VERIFIED_INSTALLATION'].includes(t.purpose))return null;
 const observation=await readBootstrapNetwork(target);checkBootstrapNetwork(target,observation,sourceSetSha256);
 const original=bootstrapNetworks.get(target);if(original)need(original.sha256===observation.sha256&&original.identity===observation.identity,'BOOTSTRAP_NETWORK_FILE_CHANGED');
 else bootstrapNetworks.set(target,Object.freeze({...observation,value:freeze(observation.value)}));
 return observation.sha256;
}
export async function assertFresh35SyntheticBootstrapNetworkCurrent(target,sourceSetSha256){
 const t=describeFresh35CombinedTarget(target);if(['PRODUCTION_NEW_EMPTY_EXACT35','RESTORED_FROM_VERIFIED_INSTALLATION'].includes(t.purpose))return null;
 need(bootstrapNetworks.has(target),'BOOTSTRAP_NETWORK_REQUIRED');return loadFresh35SyntheticBootstrapNetwork(target,sourceSetSha256);
}
export const FRESH35_COMBINED_PHYSICAL_FAILURE_CODES=Object.freeze(['FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS',...['DATABASE', 'CURRENT_ACTOR', 'SESSION_ACTOR', 'DATABASE_OID', 'SYSTEM_IDENTIFIER', 'SERVER_VERSION', 'POSTMASTER_BIRTH', 'SERVER_ADDRESS', 'SERVER_PORT', 'LISTEN_ADDRESSES', 'BOOTSTRAP_SOCKET', 'REPLICATION_ROLE', 'RECOVERY', 'TRANSACTION_ISOLATION', 'TRANSACTION_READ_ONLY', 'WINDOW_START', 'WINDOW_END', 'DATABASE_OWNER', 'EXCLUSIVE_BACKENDS', 'DATABASE_SET', 'NAMESPACE_SET', 'ROLE_SET', 'EVENT_TRIGGER_SET', 'EXTENSION_SET', 'PREPARED_XACT_SET'].map(label=>'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_'+label)]);
export function fresh35CombinedTargetGuard(target,{requireEmpty}={requireEmpty:false}){
 need(typeof requireEmpty==='boolean','EXPLICIT_EMPTY_TARGET_FLAG_REQUIRED');
 return targetGuard(target,{requireEmpty,runtime:false});
}
/** Import inspection runs as the controller on its own read-only snapshot.
 * Installation still uses the original owner-only, writable guard. */
export function fresh35CombinedRuntimeTargetGuard(target){
 return targetGuard(target,{requireEmpty:false,runtime:true});
}
export const FRESH35_COMBINED_OBSERVER_NAME='fresh35_exclusive_backends';
// Only these native, database-less PG17.11 processes may coexist with the
// caller. In particular a physical walsender also has no database, but has a
// different type and must still refuse installation. NULL/unknown types refuse.
const observerAllowedBackend=`(a.pid IS NOT NULL AND a.pid>0 AND ((a.backend_type='logical replication launcher' AND a.datid IS NULL AND a.usesysid=10)
 OR (a.backend_type IN('checkpointer','background writer','walwriter','autovacuum launcher') AND a.datid IS NULL AND a.usesysid IS NULL))) IS TRUE`;
function observerBody(target){
 const {proposal:p,physical:b,startsAt,expiresAt}=describeFresh35CombinedTarget(target),q=quote;
 return `
BEGIN
 IF (current_user=${q(p.admin)} AND session_user IN(${q(p.owner)},${q(p.controller)})
  AND pg_catalog.current_setting('role') IN('none',session_user::text)
  AND current_database()=${q(p.database)}
  AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}
  AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}
  AND pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}
  AND pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(b.postmasterStart.replace(/\+00$/,''))}
  AND pg_catalog.host(pg_catalog.inet_server_addr())=${q(p.host)} AND pg_catalog.inet_server_port()=${p.port}
  AND pg_catalog.current_setting('session_replication_role')='origin' AND NOT pg_catalog.pg_is_in_recovery()
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=10 AND rolname=${q(p.admin)} AND rolsuper)
  AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt}
  AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}) IS DISTINCT FROM true THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_stat_clear_snapshot();
 RETURN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity a
  WHERE a.pid IS DISTINCT FROM pg_catalog.pg_backend_pid() AND NOT (${observerAllowedBackend}));
END
`;
}
const observerAcl=target=>{
 const {proposal:p}=describeFresh35CombinedTarget(target);
 return [p.admin,p.owner,p.controller].map(role=>role+'=X/'+p.admin).sort();
};
/** Root bootstrap renders this once; only its existing admin connection may
 * execute it. There is no CREATE OR REPLACE, dynamic SQL or caller input. */
export function fresh35CombinedBootstrapObserverSql(target){
 const {proposal:p,physical:b,startsAt,expiresAt}=describeFresh35CombinedTarget(target),q=quote;
 return `BEGIN;
DO $fresh35_observer_bootstrap$ BEGIN
 IF (current_user=${q(p.admin)} AND session_user=${q(p.admin)} AND current_database()=${q(p.database)}
  AND (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}
  AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}
  AND pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}
  AND pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(b.postmasterStart.replace(/\+00$/,''))}
  AND pg_catalog.host(pg_catalog.inet_server_addr())=${q(p.host)} AND pg_catalog.inet_server_port()=${p.port}
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=10 AND rolname=${q(p.admin)} AND rolsuper)
  AND extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt}
  AND extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FRESH35_OBSERVER_BOOTSTRAP_TARGET_DIFFERS' USING ERRCODE='55000'; END IF;
END $fresh35_observer_bootstrap$;
CREATE FUNCTION pg_catalog.${FRESH35_COMBINED_OBSERVER_NAME}() RETURNS pg_catalog.bool
 LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 AS $fresh35_observer$${observerBody(target)}$fresh35_observer$;
REVOKE ALL ON FUNCTION pg_catalog.${FRESH35_COMBINED_OBSERVER_NAME}() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg_catalog.${FRESH35_COMBINED_OBSERVER_NAME}() TO ${p.owner},${p.controller};
${fresh35CombinedObserverGuard(target)}
COMMIT;
`;
}
/** The bootstrap object is outside the 152 business routines. Its full source,
 * signature, owner, attributes and explicit ACL are checked before any call. */
export function fresh35CombinedObserverGuard(target){
 return `DO $fresh35_observer_catalog$ BEGIN\n${fresh35CombinedObserverCheck(target)}\nEND $fresh35_observer_catalog$;`;
}
/** Embed the identical strict check in an existing DO when its native consumer
 * expects one result for that statement. Bootstrap still uses the wrapper. */
export function fresh35CombinedObserverCheck(target){
 const {proposal:p}=describeFresh35CombinedTarget(target),q=quote;
 return `IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='pg_catalog'::pg_catalog.regnamespace AND proname=${q(FRESH35_COMBINED_OBSERVER_NAME)})<>1
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_language l ON l.oid=f.prolang JOIN pg_catalog.pg_roles o ON o.oid=f.proowner
  WHERE f.pronamespace='pg_catalog'::pg_catalog.regnamespace AND f.proname=${q(FRESH35_COMBINED_OBSERVER_NAME)}
  AND f.proowner=10 AND o.rolname=${q(p.admin)} AND o.rolsuper AND l.lanname='plpgsql'
  AND f.prokind='f' AND f.pronargs=0 AND f.pronargdefaults=0 AND f.proargtypes=''::pg_catalog.oidvector
  AND f.prorettype='pg_catalog.bool'::pg_catalog.regtype AND NOT f.proretset AND f.prosecdef AND NOT f.proleakproof AND NOT f.proisstrict
  AND f.provolatile='v' AND f.proparallel='u' AND f.procost=100 AND f.prorows=0 AND f.prosupport=0
  AND f.proallargtypes IS NULL AND f.proargmodes IS NULL AND f.proargnames IS NULL AND f.proargdefaults IS NULL AND f.protrftypes IS NULL
  AND f.probin IS NULL AND f.prosqlbody IS NULL AND f.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
  AND f.prosrc=${q(observerBody(target))}
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) ref
   WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid
   AND (d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass OR (ref.schema IS NOT NULL AND ref.schema<>'pg_catalog')))
  AND (SELECT array_agg(e::text ORDER BY e::text COLLATE pg_catalog."C") FROM pg_catalog.unnest(f.proacl) e)=ARRAY[${observerAcl(target).map(q).join(',')}])
 THEN RAISE EXCEPTION 'FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_EXCLUSIVE_BACKENDS' USING ERRCODE='55000'; END IF;`;
}
/** Full raw catalog/dependencies join the existing catalog hash in the record;
 * it contains function metadata, never an activity row, PID, query or username. */
export const fresh35CombinedObserverObservationSql=`(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'catalog',pg_catalog.to_jsonb(f),'definition',pg_catalog.pg_get_functiondef(f.oid),'owner',o.rolname,'language',l.lanname,
 'dependencies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid),
 'sharedDependencies',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_shdepend d WHERE d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=f.oid)
 )),'[]'::pg_catalog.jsonb) FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_roles o ON o.oid=f.proowner JOIN pg_catalog.pg_language l ON l.oid=f.prolang
 WHERE f.pronamespace='pg_catalog'::pg_catalog.regnamespace AND f.proname='${FRESH35_COMBINED_OBSERVER_NAME}')`;
export function validateFresh35CombinedObserverObservation(rows,target){
 need(Array.isArray(rows)&&rows.length===1,'OBSERVER_RAW_COHORT_DIFFERS');
 const row=rows[0],f=row?.catalog,{proposal:p}=describeFresh35CombinedTarget(target);
 const expected={proname:FRESH35_COMBINED_OBSERVER_NAME,pronamespace:'11',proowner:'10',prokind:'f',pronargs:0,pronargdefaults:0,proargtypes:[],prorettype:'16',proretset:false,prosecdef:true,proleakproof:false,proisstrict:false,provolatile:'v',proparallel:'u',procost:100,prorows:0,prosupport:'-',proallargtypes:null,proargmodes:null,proargnames:null,proargdefaults:null,protrftypes:null,probin:null,prosqlbody:null,proconfig:['search_path=pg_catalog, pg_temp'],prosrc:observerBody(target)};
 need(row.owner===p.admin&&row.language==='plpgsql'&&f&&Object.entries(expected).every(([k,v])=>JSON.stringify(f[k])===JSON.stringify(v))&&Array.isArray(f.proacl)&&JSON.stringify([...f.proacl].sort())===JSON.stringify(observerAcl(target))&&typeof row.definition==='string'&&row.definition.length>0&&Array.isArray(row.dependencies)&&Array.isArray(row.sharedDependencies),'OBSERVER_RAW_SOURCE_OR_ACL_DIFFERS');
}
function targetGuard(target,{requireEmpty,runtime}){
 const binding=describeFresh35CombinedTarget(target),{proposal:p,physical:b,startsAt,expiresAt}=binding,q=quote,production=binding.purpose==='PRODUCTION_NEW_EMPTY_EXACT35';
 const network=production?null:bootstrapNetworks.get(target);need(production||network,'BOOTSTRAP_NETWORK_REQUIRED');if(network)checkBootstrapNetwork(target,network,network.value.sourceSetSha256);
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
 const physicalPredicates=[
  ['DATABASE',`current_database()=${q(p.database)}`],
  ['CURRENT_ACTOR',`current_user=${q(runtime?p.controller:p.owner)}`],
  ['SESSION_ACTOR',`session_user=${q(runtime?p.controller:p.owner)}`],
  ['DATABASE_OID',`(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())=${q(b.databaseOid)}`],
  ['SYSTEM_IDENTIFIER',`(SELECT system_identifier::text FROM pg_catalog.pg_control_system())=${q(b.systemIdentifier)}`],
  ['SERVER_VERSION',`pg_catalog.current_setting('server_version_num')=${q(b.serverVersionNum)}`],
  ['POSTMASTER_BIRTH',`pg_catalog.pg_postmaster_start_time() AT TIME ZONE 'UTC'=TIMESTAMP ${q(b.postmasterStart.replace(/\+00$/,''))}`],
  ['SERVER_ADDRESS',`pg_catalog.host(pg_catalog.inet_server_addr())=${q(p.host)}`],
  ['SERVER_PORT',`pg_catalog.inet_server_port()=${p.port}`],
  ...(production?[]:[['LISTEN_ADDRESSES',"pg_catalog.current_setting('listen_addresses')='127.0.0.1'"],['BOOTSTRAP_SOCKET',`${q(network.value.unixSocketDirectories)}='' /* root bootstrap network ${network.sha256} */`]]),
  ['REPLICATION_ROLE',"pg_catalog.current_setting('session_replication_role')='origin'"],
  ['RECOVERY','NOT pg_catalog.pg_is_in_recovery()'],
  ['TRANSACTION_ISOLATION',`pg_catalog.current_setting('transaction_isolation')=${q(runtime?'repeatable read':'read committed')}`],
  ['TRANSACTION_READ_ONLY',`pg_catalog.current_setting('transaction_read_only')=${q(runtime?'on':'off')}`],
  ['WINDOW_START',`extract(epoch FROM pg_catalog.clock_timestamp())*1000>=${startsAt}`],
  ['WINDOW_END',`extract(epoch FROM pg_catalog.clock_timestamp())*1000<${expiresAt}`],
  ['DATABASE_OWNER',`(SELECT pg_catalog.pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname=current_database())=${q(p.owner)}`],
  ['EXCLUSIVE_BACKENDS',`pg_catalog.${FRESH35_COMBINED_OBSERVER_NAME}()`],
  ['DATABASE_SET',`NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database WHERE datname NOT IN('postgres','template0','template1',${q(p.database)}))`],
  ['NAMESPACE_SET',"NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast','naijue_erp'))"],
  ['ROLE_SET',`NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${roles.map(q).join(',')}))`],
  ['EVENT_TRIGGER_SET','NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)'],
  ['EXTENSION_SET',"NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')"],
  ['PREPARED_XACT_SET','NOT EXISTS(SELECT 1 FROM pg_catalog.pg_prepared_xacts)'],
 ];
 return `DO $fresh35_combined_target$
DECLARE
 physical_checks boolean[];
 physical_failure_codes CONSTANT text[] := ARRAY[${physicalPredicates.map(([label])=>q('FRESH35_COMBINED_PHYSICAL_TARGET_DIFFERS_'+label)).join(',')}];
 physical_index integer;
BEGIN
 ${fresh35CombinedObserverCheck(target)}
 physical_checks := ARRAY[${physicalPredicates.map(([,expression])=>'('+expression+')').join(',\n ')}];
 IF (true = ALL(physical_checks)) IS DISTINCT FROM true THEN
  FOR physical_index IN 1..array_length(physical_checks,1) LOOP
   IF physical_checks[physical_index] IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%',physical_failure_codes[physical_index] USING ERRCODE='55000';
   END IF;
  END LOOP;
 END IF;
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

// Restored binding is neither an empty-install authorization nor an import target.
const restoredTargets=new WeakSet();
function restoredTarget(input,now,installed=false){
 const a=snapshot(input,['proposal','physical','startsAt','expiresAt','purpose','ordinary','restoration']);
 need(a.purpose==='RESTORED_FROM_VERIFIED_INSTALLATION','RESTORED_PURPOSE_REQUIRED');
 const {proposal,physical,ordinary}=a;
 // Reuse the exact production identities/network/lifetime checks, with the
 // physical birth's own bounded provenance interval. Restore authorization has
 // its independent fresh window; the actual restore may have taken longer.
 need(typeof physical?.postmasterStart==='string','RESTORED_PHYSICAL_REQUIRED');
 const birth=Date.parse(physical.postmasterStart.replace(' ','T').replace(/\+00$/,'Z'));
 need(Number.isFinite(birth),'RESTORED_PHYSICAL_REQUIRED');
 const base=productionTarget({proposal,physical,ordinary,purpose:'PRODUCTION_NEW_EMPTY_EXACT35',startsAt:birth-1,expiresAt:birth+1199999},undefined,true);
 need(proposal.host==='127.0.0.1'&&ordinary.connectHost===proposal.host&&ordinary.serverAddress===proposal.host&&ordinary.connectPort===proposal.port&&ordinary.serverPort===proposal.port,'RESTORED_LOOPBACK_ORDINARY_TARGET_REQUIRED');
 const b=describeFresh35CombinedTarget(base),r=snapshot(a.restoration,['sourceInstallationRecordSha256','sourceTargetSha256','sourceSystemIdentifier','sourceAdmin','databaseDumpSha256','databaseRestoreReceiptSha256']);
 need(['sourceInstallationRecordSha256','sourceTargetSha256','databaseDumpSha256','databaseRestoreReceiptSha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k]))&&decimal(r.sourceSystemIdentifier,18446744073709551615n)&&r.sourceSystemIdentifier!==b.physical.systemIdentifier&&identifier(r.sourceAdmin)&&r.sourceAdmin!==b.proposal.admin,'RESTORED_SOURCE_BINDING_REQUIRED');
 need([a.startsAt,a.expiresAt].every(Number.isSafeInteger)&&a.startsAt<a.expiresAt&&a.expiresAt-a.startsAt<=1200000&&birth<a.expiresAt,'RESTORATION_WINDOW_REQUIRED');
 if(!installed)need(Number.isSafeInteger(now)&&now>=a.startsAt&&now<a.expiresAt,'RESTORATION_WINDOW_EXPIRED');
 const token=Object.freeze({profile:'FRESH35_RESTORED_TARGET_V1'});
 targets.set(token,freeze({format:'FRESH35_RESTORED_TARGET_BINDING_V1',proposal:b.proposal,physical:b.physical,ordinary:b.ordinary,startsAt:a.startsAt,expiresAt:a.expiresAt,purpose:a.purpose,restoration:r,authority:'BINDING_ONLY_NOT_CREATION_OR_EXECUTION_PERMISSION'}));
 restoredTargets.add(token);reconstructedProductionTargets.add(token);return token;
}
export function bindFresh35RestoredTarget(input,now=Date.now()){return restoredTarget(input,now)}
export async function reconstructFresh35RestoredTarget(envelope){
 const {assertFresh35ProtectedRecordEnvelope}=await import('./fresh35-combined-record-v1.mjs');assertFresh35ProtectedRecordEnvelope(envelope);
 need(envelope.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'&&envelope.state==='RESTORED_FROM_VERIFIED_INSTALLATION','RESTORED_PROTECTED_RECORD_REQUIRED');
 const {proposal,physical,ordinary,startsAt,expiresAt,purpose,restoration}=envelope.target;
 const token=restoredTarget({proposal,physical,ordinary,startsAt,expiresAt,purpose,restoration},undefined,true);
 need(JSON.stringify(describeFresh35CombinedTarget(token))===JSON.stringify(envelope.target),'RESTORED_TARGET_RECONSTRUCTION_DIFFERS');return token;
}
export function assertFresh35RestoredTarget(target){need(restoredTargets.has(target),'GENUINE_RESTORED_TARGET_REQUIRED');return describeFresh35CombinedTarget(target)}

/** Restore minting keeps the original physical/security/public-schema envelope.
 * Only the actor and the explicitly retained original admin differ; exact role
 * attributes/ACLs are compared separately on the same read-only transaction. */
export function fresh35RestoredTargetGuard(target){
 const t=assertFresh35RestoredTarget(target),p=t.proposal,b=t.physical,q=quote;
 const roles=[p.admin,p.owner,p.controller,p.runtime,t.restoration.sourceAdmin,...Object.values(FRESH35_COMBINED_INTERFACE_ROLES)];
 return `DO $fresh35_restored_target$ BEGIN
 ${fresh35CombinedObserverCheck(target)}
 IF (current_database()=${q(p.database)} AND current_user=${q(p.admin)} AND session_user=${q(p.admin)}
  AND (SELECT oid::text FROM pg_database WHERE datname=current_database())=${q(b.databaseOid)}
  AND (SELECT system_identifier::text FROM pg_control_system())=${q(b.systemIdentifier)}
  AND current_setting('server_version_num')=${q(b.serverVersionNum)} AND pg_postmaster_start_time()::text=${q(b.postmasterStart)}
  AND host(inet_server_addr())=${q(p.host)} AND inet_server_port()=${p.port}
  AND current_setting('session_replication_role')='origin' AND NOT pg_is_in_recovery()
  AND current_setting('transaction_isolation')='repeatable read' AND current_setting('transaction_read_only')='on'
  AND EXISTS(SELECT 1 FROM pg_roles WHERE oid=10 AND rolname=${q(p.admin)} AND rolsuper)
  AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())=${q(p.owner)}
  AND extract(epoch FROM clock_timestamp())*1000>=${t.startsAt} AND extract(epoch FROM clock_timestamp())*1000<${t.expiresAt}) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'FRESH35_RESTORED_PHYSICAL_TARGET_DIFFERS'; END IF;
 PERFORM pg_stat_clear_snapshot();
 IF EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.pid IS DISTINCT FROM pg_backend_pid() AND NOT (${observerAllowedBackend}))
 OR EXISTS(SELECT 1 FROM pg_database WHERE datname NOT IN('postgres','template0','template1',${q(p.database)}))
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','pg_catalog','information_schema','pg_toast','naijue_erp'))
 OR EXISTS(SELECT 1 FROM pg_roles WHERE left(rolname,3)<>'pg_' AND rolname NOT IN(${roles.map(q).join(',')}))
 OR EXISTS(SELECT 1 FROM pg_event_trigger) OR EXISTS(SELECT 1 FROM pg_extension WHERE extname<>'plpgsql')
 OR EXISTS(SELECT 1 FROM pg_prepared_xacts)
 THEN RAISE EXCEPTION 'FRESH35_RESTORED_DATABASE_ROLE_NAMESPACE_BOUNDARY_DIFFERS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner='pg_database_owner'::regrole::oid
  AND (SELECT array_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(n.nspacl) a)=ARRAY['=U/pg_database_owner','pg_database_owner=UC/pg_database_owner'])
 OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_operator WHERE oprnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_collation WHERE collnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_conversion WHERE connamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_opclass WHERE opcnamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_opfamily WHERE opfnamespace='public'::regnamespace)
 THEN RAISE EXCEPTION 'FRESH35_RESTORED_PUBLIC_SCHEMA_BOUNDARY_DIFFERS'; END IF;
 END $fresh35_restored_target$;`;
}
