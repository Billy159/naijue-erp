/** Whole177 runtime drift verifier, separate from the legacy Fresh27 profile.
 * An operator-reviewed, independently fixed initial catalogue pin is REQUIRED.
 * Observing a catalogue does not authorize it. This module never manufactures a
 * reference, creates a connection, installs SQL or grants persistent privileges.
 * Caller must keep the original client exclusive and prevent concurrent DDL/ACL
 * changes for the complete import window; this check alone cannot enforce that. */
import{readFile}from'node:fs/promises';import{resolve}from'node:path';import{createHash}from'node:crypto';import{parseStrictJson}from'../../../packages/application/src/unified-import-contract.ts';
import{WHOLE_INSTALL_PATCHES}from'./render-whole-package-local.mjs';import{loadFresh27Plan,describeFresh27Plan}from'./fresh27-plan.mjs';
const sourceSpecs=new WeakSet();
const hash=s=>createHash('sha256').update(s).digest('hex');const need=(ok,code)=>{if(!ok)throw Error(code);};
export const WHOLE_CATALOG_QUERY=`WITH ns AS (SELECT * FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),
 rels AS (SELECT c.* FROM pg_catalog.pg_class c WHERE c.relnamespace=(SELECT oid FROM ns)),
 funcs AS (SELECT p.* FROM pg_catalog.pg_proc p WHERE p.pronamespace=(SELECT oid FROM ns)),
 caps AS (SELECT r.* FROM pg_catalog.pg_roles r WHERE r.rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')),
 controller AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname=session_user),
 runtime_role AS (SELECT * FROM pg_catalog.pg_roles WHERE rolname='erp_unified27_runtime_2393dbc6db9581c2'),
 runtime_edges AS (SELECT m.* FROM pg_catalog.pg_auth_members m WHERE m.roleid=(SELECT oid FROM runtime_role)),
 application AS (SELECT r.* FROM pg_catalog.pg_roles r JOIN runtime_edges m ON m.member=r.oid),
 valid AS (SELECT pg_catalog.current_setting('transaction_isolation')='repeatable read' AND pg_catalog.current_setting('transaction_read_only')='on' AND current_user=session_user AND pg_catalog.current_setting('search_path')='pg_catalog, naijue_erp, pg_temp' AND pg_catalog.current_setting('session_replication_role')='origin'
 AND (SELECT count(*) FROM funcs)=177 AND (SELECT count(*) FROM caps)=2
 AND (SELECT count(*) FROM runtime_role)=1 AND (SELECT count(*) FROM runtime_edges)=1 AND (SELECT count(*) FROM application)=1
 AND NOT EXISTS(SELECT 1 FROM runtime_edges WHERE admin_option OR inherit_option OR NOT set_option)
 AND NOT EXISTS(SELECT 1 FROM application a WHERE a.rolname=session_user OR NOT a.rolcanlogin OR a.rolsuper OR a.rolcreatedb OR a.rolcreaterole OR a.rolreplication OR a.rolbypassrls OR pg_catalog.has_parameter_privilege(a.oid,'session_replication_role','SET') OR pg_catalog.has_database_privilege(a.oid,pg_catalog.current_database(),'CREATE') OR pg_catalog.has_schema_privilege(a.oid,(SELECT oid FROM ns),'CREATE') OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(a.oid,r.oid,'MEMBER') AND r.rolname NOT IN(a.rolname,'erp_unified27_runtime_2393dbc6db9581c2')) OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=a.oid AND m.admin_option))

 AND (SELECT count(*) FROM rels WHERE relkind='r')=56
 AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM rels) AND NOT tgisinternal)=233
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM rels) AND tgenabled<>'O')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace=(SELECT oid FROM ns) AND NOT convalidated)
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid IN(SELECT oid FROM rels))=32
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy p JOIN rels c ON c.oid=p.polrelid WHERE NOT c.relrowsecurity)

 AND NOT EXISTS(SELECT 1 FROM controller WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
 AND NOT pg_catalog.has_parameter_privilege(session_user,'session_replication_role','SET')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE pg_catalog.pg_has_role(session_user,r.oid,'MEMBER') AND r.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'))
 AND NOT EXISTS(SELECT 1 FROM caps WHERE rolcanlogin OR rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolconnlimit<>0 OR pg_catalog.has_parameter_privilege(oid,'session_replication_role','SET'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member IN(SELECT oid FROM caps) OR (m.roleid IN(SELECT oid FROM caps) AND (m.member<>(SELECT oid FROM controller) OR m.admin_option OR m.inherit_option OR NOT m.set_option)))
 AND (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.roleid IN(SELECT oid FROM caps) AND m.member=(SELECT oid FROM controller) AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)=2
 AND NOT EXISTS(SELECT 1 FROM rels WHERE pg_catalog.pg_has_role(session_user,relowner,'USAGE'))
 AND NOT pg_catalog.has_schema_privilege(session_user,(SELECT oid FROM ns),'CREATE')
 AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM caps UNION ALL SELECT * FROM controller UNION ALL SELECT * FROM application) r CROSS JOIN rels c WHERE c.relowner=r.oid OR (c.relkind IN('r','p','v','m','f') AND (pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR (c.relkind='S' AND pg_catalog.has_sequence_privilege(r.oid,c.oid,'SELECT,USAGE,UPDATE')))

 AND NOT EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['id','product_id','sku_code','color_id','fit_id','size_id','enabled','version','created_operation_id']) c WHERE NOT pg_catalog.has_column_privilege('erp_unified27_runtime_2393dbc6db9581c2','naijue_erp.sku',c,'INSERT'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.unnest(ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled']) c WHERE NOT pg_catalog.has_column_privilege('erp_unified27_runtime_2393dbc6db9581c2','naijue_erp.sku_barcode',c,'INSERT'))
 AND pg_catalog.has_column_privilege('erp_unified27_runtime_2393dbc6db9581c2','naijue_erp.product','version','UPDATE')
 AND NOT EXISTS(SELECT 1 FROM (SELECT * FROM caps UNION ALL SELECT * FROM controller UNION ALL SELECT * FROM application UNION ALL SELECT * FROM runtime_role) r CROSS JOIN (VALUES
  ('naijue_erp.standard_initialize_current_admin(jsonb,text)'),
  ('naijue_erp.standard_import_master_chunk(jsonb,text)'),
  ('naijue_erp.standard_import_baseline_keys(jsonb,text)'),
  ('naijue_erp.standard_import_document_chunk(jsonb,text)'),
  ('naijue_erp.standard_publish_import(jsonb,text)'),
  ('naijue_erp.standard_import_status(jsonb,text)'),
  ('naijue_erp.standard_import_inspect_target(jsonb,text)'),
  ('naijue_erp.standard_import_verify(jsonb,text)')) old_entry(signature) WHERE pg_catalog.has_function_privilege(r.oid,old_entry.signature,'EXECUTE'))
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements($1::pg_catalog.jsonb) pin WHERE NOT EXISTS(SELECT 1 FROM funcs p WHERE p.oid=(pin->>'signature')::pg_catalog.regprocedure AND p.proowner=(SELECT nspowner FROM ns) AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')=pin->>'sha256' AND p.proconfig @> ARRAY[pin->>'search_path'])) AS ok),
 packet AS (SELECT pg_catalog.jsonb_build_object('identity',pg_catalog.jsonb_build_object('system_identifier',(SELECT system_identifier::pg_catalog.text FROM pg_catalog.pg_control_system()),'database_oid',(SELECT oid::pg_catalog.text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),'database_name',pg_catalog.current_database(),'owner',(SELECT rolname FROM pg_catalog.pg_roles WHERE oid=(SELECT nspowner FROM ns)),'controller',session_user::pg_catalog.text,'runtime_login',(SELECT rolname::pg_catalog.text FROM application),'server_version_num',pg_catalog.current_setting('server_version_num')),
 'catalog',pg_catalog.jsonb_build_object(
 'database',(SELECT pg_catalog.to_jsonb(d)-ARRAY['datfrozenxid','datminmxid'] FROM pg_catalog.pg_database d WHERE datname=pg_catalog.current_database()),
 'dependencies',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_catalog.pg_depend d),
 'shared_dependencies',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.dbid,d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.deptype) FROM pg_catalog.pg_shdepend d WHERE d.dbid IN(0,(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()))),
 'roles',(SELECT pg_catalog.jsonb_agg((pg_catalog.to_jsonb(r)-ARRAY['rolpassword','rolconfig'])||pg_catalog.jsonb_build_object('config_sha256',CASE WHEN r.rolconfig IS NULL THEN NULL ELSE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(r.rolconfig::pg_catalog.text,'UTF8')),'hex') END) ORDER BY r.oid) FROM pg_catalog.pg_roles r),
 'memberships',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.roleid,m.member,m.grantor),'[]') FROM pg_catalog.pg_auth_members m),
 'schemas',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) ORDER BY n.oid) FROM pg_catalog.pg_namespace n WHERE n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'),
 'routines',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.oid) FROM funcs p),
 'relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid','relfilenode'] ORDER BY c.oid) FROM rels c),
 'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid IN(SELECT oid FROM rels)),
 'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.oid) FROM pg_catalog.pg_constraint c WHERE c.connamespace=(SELECT oid FROM ns)),
 'indexes',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.indexrelid) FROM pg_catalog.pg_index i WHERE i.indrelid IN(SELECT oid FROM rels)),
 'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM rels)),
 'policies',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p WHERE p.polrelid IN(SELECT oid FROM rels)),
 'types',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_type t WHERE t.typnamespace=(SELECT oid FROM ns) OR t.oid IN(SELECT atttypid FROM pg_catalog.pg_attribute WHERE attrelid IN(SELECT oid FROM rels))),
 'defaults',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.oid) FROM pg_catalog.pg_attrdef a WHERE a.adrelid IN(SELECT oid FROM rels)),
 'rewrite',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w) ORDER BY w.oid) FROM pg_catalog.pg_rewrite w WHERE w.ev_class IN(SELECT oid FROM rels)),
 'sequence_parameters',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.seqrelid) FROM pg_catalog.pg_sequence s WHERE s.seqrelid IN(SELECT oid FROM rels)),
 'default_acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.oid) FROM pg_catalog.pg_default_acl d),
 'parameter_acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_parameter_acl p),
 'languages',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.oid) FROM pg_catalog.pg_language l),
 'extensions',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) ORDER BY e.oid) FROM pg_catalog.pg_extension e),
 'role_setting_digests',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('database',d.setdatabase,'role',d.setrole,'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(d.setconfig::pg_catalog.text,'UTF8')),'hex')) ORDER BY d.setdatabase,d.setrole) FROM pg_catalog.pg_db_role_setting d)
 ))::pg_catalog.text AS catalog_json FROM valid WHERE ok)
 SELECT catalog_json FROM packet WHERE pg_catalog.octet_length(catalog_json)<=16777216`;
export async function loadWholeCatalogSpec(root){const sql=await readFile(resolve(root,'adapters/postgres/patches/0027_standard_import_whole_package_search_path_v2.sql'),'utf8');const m=sql.match(/\$pins\$(\[[\s\S]*?\])\$pins\$/);need(m,'WHOLE_CATALOG_SOURCE_PINS_REQUIRED');const pins=parseStrictJson(m[1]);need(Array.isArray(pins)&&pins.length===176&&new Set(pins.map(p=>p.signature)).size===176,'WHOLE_CATALOG_EXACT_COHORT_REQUIRED');for(const p of pins)p.search_path=['naijue_erp.valid_history_counts(pg_catalog.jsonb)','naijue_erp.history_closure_count_map(pg_catalog.jsonb,pg_catalog.text[])'].includes(p.signature)?'search_path=pg_catalog':'search_path=pg_catalog, naijue_erp, pg_temp';const reference=await readFile(resolve(root,'adapters/postgres/patches/0027_document_product_reference_lock_permissions.sql'),'utf8');const referenceBody=reference.match(/CREATE FUNCTION naijue_erp\.reject_document_runtime_reference_id_update_v1\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path=pg_catalog AS \$\$([\s\S]*?)\$\$;/);need(referenceBody,'WHOLE_REFERENCE_LOCK_SOURCE_REQUIRED');pins.push({signature:'naijue_erp.reject_document_runtime_reference_id_update_v1()',sha256:hash(referenceBody[1]),search_path:'search_path=pg_catalog'});for(const p of pins)Object.freeze(p);Object.freeze(pins);const baseline=describeFresh27Plan(await loadFresh27Plan({sourceRoot:root,profile:'FRESH27_SOURCE47_PLUS49_CODE_ONLY'}));const sourcePaths=[...baseline.graph.map(x=>x.path),...WHOLE_INSTALL_PATCHES.map(x=>'adapters/postgres/patches/'+x),'adapters/postgres/patches/0027_document_specification_barcodes_permissions.psql','adapters/postgres/patches/0027_product_maintenance_permissions.psql',...['fresh27-plan','fresh27-portable-successors','fresh27-sql-bundle','render-whole-package-local','whole-search-path-source','whole-catalog-gate','record-whole-installation','whole-installation-record','trusted-install-path','publish-installation-record'].map(x=>'scripts/release/unified-install/'+x+'.mjs'),'package.json','package-lock.json'];const installation_sources=[];for(const path of [...new Set(sourcePaths)].sort())installation_sources.push(Object.freeze({path,sha256:hash(await readFile(resolve(root,path)))}));Object.freeze(installation_sources);const spec=Object.freeze({pins,installation_sources,source_spec_sha256:hash(JSON.stringify({pins,installation_sources})+'\n'+WHOLE_CATALOG_QUERY)});sourceSpecs.add(spec);return spec;}
/** reviewed must come from the trusted local operator's independently signed-off
 * installation record, not an HTTP request or the result currently observed. */
export function verifyWholeCatalogPacket(text,reviewed,sourceSpecSha256){need(typeof text==='string'&&Buffer.byteLength(text)<=16777216,'WHOLE_CATALOG_BOUNDS');need(reviewed&&/^[a-f0-9]{64}$/.test(reviewed.catalog_sha256)&&reviewed.source_spec_sha256===sourceSpecSha256,'WHOLE_REVIEWED_CATALOG_BINDING_REQUIRED');const packet=parseStrictJson(text);for(const key of ['system_identifier','database_oid','database_name','owner','controller','runtime_login','server_version_num'])need(typeof reviewed[key]==='string'&&packet.identity?.[key]===reviewed[key],'WHOLE_PHYSICAL_TARGET_DIFFERS');need(hash(text)===reviewed.catalog_sha256,'WHOLE_CATALOG_DIFFERS');return Object.freeze({catalog_sha256:reviewed.catalog_sha256,source_spec_sha256:sourceSpecSha256,profile:'WHOLE177_INSTALLED_INSTANCE_MATCH',initial_review_not_inferred:true});}
/** Same original client; no transaction/role/connection ownership transfer. */
export async function verifyWholeInstalledCatalog(client,spec,reviewed){need(sourceSpecs.has(spec),'WHOLE_GENUINE_SOURCE_SPEC_REQUIRED');const setup=await client.query('SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp');const setupAck=setup&&Object.getOwnPropertyDescriptor(setup,'command');need(setupAck&&Object.hasOwn(setupAck,'value')&&setupAck.value==='SET','WHOLE_CATALOG_SETUP_NOT_ACKNOWLEDGED');const r=await client.query(WHOLE_CATALOG_QUERY,[JSON.stringify(spec.pins)]);const ack=r&&Object.getOwnPropertyDescriptor(r,'command');need(ack&&Object.hasOwn(ack,'value')&&ack.value==='SELECT'&&r.rows?.length===1&&typeof r.rows[0].catalog_json==='string','WHOLE_CATALOG_QUERY_NOT_ACKNOWLEDGED');return verifyWholeCatalogPacket(r.rows[0].catalog_json,reviewed,spec.source_spec_sha256);}
