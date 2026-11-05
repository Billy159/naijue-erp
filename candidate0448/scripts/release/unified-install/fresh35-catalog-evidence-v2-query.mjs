/** Fixed, source-only V2 catalog statements. They are not executed here and
 * deliberately contain no application functions or runtime permission gates. */
export const FRESH35_EVIDENCE_V2_DEPARSER=Object.freeze({
 functionDefinition:'pg_catalog.pg_get_functiondef(p.oid)',
 constraintDefinition:'pg_catalog.pg_get_constraintdef(c.oid,false)',
 indexDefinition:'pg_catalog.pg_get_indexdef(i.indexrelid)',
 triggerDefinition:'pg_catalog.pg_get_triggerdef(t.oid,false)',
});
const context=`pg_catalog.json_build_object(
 'identity',pg_catalog.json_build_object('system_identifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'database_oid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),'database_name',pg_catalog.current_database(),'owner',(SELECT r.rolname FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=pg_catalog.current_database()),'actor',session_user,'current_user',current_user,'server_version_num',pg_catalog.current_setting('server_version_num')),
 'backend_pid',pg_catalog.pg_backend_pid()::text,
 'transaction_started_at',extract(epoch from pg_catalog.transaction_timestamp())::text,
 'server_address',pg_catalog.host(pg_catalog.inet_server_addr()),'server_port',pg_catalog.inet_server_port()::text,
 'visible_snapshot',pg_catalog.pg_current_snapshot()::text,
 'settings',pg_catalog.json_build_object('server_version_num',pg_catalog.current_setting('server_version_num'),'server_encoding',pg_catalog.current_setting('server_encoding'),'client_encoding',pg_catalog.current_setting('client_encoding'),'search_path',pg_catalog.current_setting('search_path'),'quote_all_identifiers',pg_catalog.current_setting('quote_all_identifiers'),'standard_conforming_strings',pg_catalog.current_setting('standard_conforming_strings'),'transaction_isolation',pg_catalog.current_setting('transaction_isolation'),'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),'session_replication_role',pg_catalog.current_setting('session_replication_role'),'DateStyle',pg_catalog.current_setting('DateStyle'),'IntervalStyle',pg_catalog.current_setting('IntervalStyle'),'extra_float_digits',pg_catalog.current_setting('extra_float_digits'),'TimeZone',pg_catalog.current_setting('TimeZone')))
`;
export const FRESH35_EVIDENCE_V2_CONTEXT_SQL='SELECT '+context+'::text;\n';
export const FRESH35_EVIDENCE_V2_INVENTORY_SQL=`SELECT pg_catalog.json_build_object('context',${context},
'routines',(SELECT pg_catalog.json_agg(pg_catalog.json_build_object('oid',p.oid::text,'signature',p.oid::regprocedure::text,'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),'definition',pg_catalog.pg_get_functiondef(p.oid),'body_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex'),'catalog',pg_catalog.to_jsonb(p)) ORDER BY p.oid) FROM pg_catalog.pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),
'relations',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(c) ORDER BY c.oid) FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace),
'columns',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='naijue_erp'::regnamespace),
'constraints',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(c)||pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_constraintdef(c.oid,false)) ORDER BY c.oid) FROM pg_catalog.pg_constraint c WHERE c.connamespace='naijue_erp'::regnamespace),
'indexes',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(i)||pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='naijue_erp'::regnamespace),
'triggers',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(t)||pg_catalog.jsonb_build_object('definition',pg_catalog.pg_get_triggerdef(t.oid,false)) ORDER BY t.oid) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='naijue_erp'::regnamespace),
'policies',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='naijue_erp'::regnamespace),
'roles',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(r)-ARRAY['rolpassword','rolconfig'] ORDER BY r.oid) FROM pg_catalog.pg_roles r),
'memberships',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_catalog.pg_auth_members m),
'default_acl',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(a) ORDER BY a.oid) FROM pg_catalog.pg_default_acl a),
'database_acl',(SELECT pg_catalog.json_build_object('oid',d.oid::text,'owner',d.datdba::regrole::text,'acl',d.datacl) FROM pg_catalog.pg_database d WHERE datname=pg_catalog.current_database()),
'schemas',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(n) ORDER BY n.oid) FROM pg_catalog.pg_namespace n WHERE n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'),
'dependencies',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(d)||pg_catalog.jsonb_build_object('object',pg_catalog.pg_describe_object(d.classid,d.objid,d.objsubid),'referenced_object',pg_catalog.pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_catalog.pg_depend d),
'shared_dependencies',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid) FROM pg_catalog.pg_shdepend d WHERE dbid IN(0,(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()))),
'extensions',(SELECT pg_catalog.json_agg(pg_catalog.to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_extension e),
'nonbusiness_scope','Schema and catalog only; no runtime admission, no security probes, no formal record')::text;
`;

/** Rendering a fixed observation transaction does not authorize executing it. */
export function renderFresh35EvidenceV2CaptureSql(exportedSnapshot){
 if(typeof exportedSnapshot!=='string'||!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(exportedSnapshot))throw Error('FRESH35_V2_EXPORTED_SNAPSHOT_INVALID');
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT '${exportedSnapshot}';
SET LOCAL search_path=pg_catalog;
SET LOCAL quote_all_identifiers=off;
SET LOCAL standard_conforming_strings=on;
SET LOCAL client_encoding='UTF8';
SET LOCAL DateStyle='ISO, MDY';
SET LOCAL IntervalStyle='postgres';
SET LOCAL extra_float_digits=3;
SET LOCAL TimeZone='UTC';
${FRESH35_EVIDENCE_V2_CONTEXT_SQL}${FRESH35_EVIDENCE_V2_INVENTORY_SQL}${FRESH35_EVIDENCE_V2_CONTEXT_SQL}ROLLBACK;\n`;
}
