#!/usr/bin/env node
/** Offline: produces inspectable local psql files, never opens a connection. */
import{mkdir,writeFile,readFile}from'node:fs/promises';import{resolve,isAbsolute}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{renderFresh27SqlBundle}from'./fresh27-sql-bundle.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));const sha=b=>createHash('sha256').update(b).digest('hex');
export const WHOLE_INSTALL_PATCHES=Object.freeze(['0027_fit_numeric_business_codes_successor.sql','0027_staff_departure_date_successor.sql','0027_standard_import_whole_package_preflight_v2.sql','0027_standard_import_whole_package_v2.sql','0027_standard_import_whole_package_guards_v2.sql','0027_standard_import_whole_package_intent_v2.sql','0027_standard_import_whole_package_source_commit_v2.sql','0027_standard_import_whole_package_zero_balance_v2.sql','0027_standard_import_whole_package_verify_v2.sql','0027_document_specification_barcodes_successor.sql','0027_product_nullable_scheme_successor.sql','0027_published_settlement_identity_successor.sql','0027_standard_known_balance_runtime_v2.sql','0027_whole_conversion_prefix_counts_v2.sql','0027_standard_import_whole_package_search_path_v2.sql','0027_standard_import_whole_package_access_v2.sql','0027_document_product_reference_lock_permissions.sql']);const patches=WHOLE_INSTALL_PATCHES;
export async function renderWholeLocal(output,targetBinding){if(!isAbsolute(output)||resolve(output)!==output)throw Error('ABSOLUTE_NEW_OUTPUT_DIRECTORY_REQUIRED');const baseline=await renderFresh27SqlBundle(root,targetBinding);let sql='\\set ON_ERROR_STOP on\n'+baseline.sql;const pins=baseline.files.map(({path,sourceSha256,renderedSha256,kind})=>({path,sourceSha256,renderedSha256,kind}));for(const name of patches){const path='adapters/postgres/patches/'+name,bytes=await readFile(resolve(root,path));pins.push({path,sourceSha256:sha(bytes),renderedSha256:sha(bytes),kind:'WHOLE_PACKAGE_SUCCESSOR'});sql+='\n-- '+path+'\n'+bytes.toString('utf8');}
 const roles=`\\set ON_ERROR_STOP on
-- Run separately with an explicitly authorized role administrator. No membership or login is granted.
DO $roles$ DECLARE name text;r record;BEGIN
 FOREACH name IN ARRAY ARRAY['erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2','erp_unified27_runtime_2393dbc6db9581c2'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=name) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0',name); END IF;
  SELECT * INTO STRICT r FROM pg_catalog.pg_roles WHERE rolname=name;
  IF r.rolconnlimit<>0 OR r.rolinherit OR r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid OR roleid=r.oid) THEN RAISE EXCEPTION 'UNSAFE_PREEXISTING_PROTECTED_ROLE'; END IF;
 END LOOP;
END $roles$;
`;
 const membership=`\\set ON_ERROR_STOP on
-- Explicit operator-selected EXISTING ordinary controller, never the installer/owner.
-- psql -v controller=your_existing_import_controller ... -f 02-controller-membership.psql
SELECT set_config('whole.install_controller', :'controller', false);
SELECT set_config('whole.install_runtime_login', :'runtime_login', false);
DO $membership$ DECLARE r record; app record; BEGIN
 SELECT * INTO STRICT r FROM pg_catalog.pg_roles WHERE rolname=current_setting('whole.install_controller');
 IF NOT r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR has_parameter_privilege(r.oid,'session_replication_role','SET') OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND pg_has_role(r.oid,relowner,'USAGE')) OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles reachable WHERE pg_has_role(r.oid,reachable.oid,'MEMBER') AND (reachable.rolsuper OR reachable.rolcreatedb OR reachable.rolcreaterole OR reachable.rolreplication OR reachable.rolbypassrls OR has_parameter_privilege(reachable.oid,'session_replication_role','SET') OR reachable.oid<>r.oid AND reachable.rolname NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'))) OR has_schema_privilege(r.oid,'naijue_erp','CREATE') THEN RAISE EXCEPTION 'ORDINARY_NONOWNER_CONTROLLER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.roleid IN ('erp_unified27_initializer_2393dbc6db9581c2'::regrole::oid,'erp_unified27_importer_2393dbc6db9581c2'::regrole::oid) AND (m.member<>r.oid OR m.admin_option OR m.inherit_option OR NOT m.set_option)) THEN RAISE EXCEPTION 'UNEXPECTED_EXISTING_CONTROLLER_MEMBERSHIP'; END IF;
 SELECT * INTO STRICT app FROM pg_catalog.pg_roles WHERE rolname=current_setting('whole.install_runtime_login');
 IF app.oid=r.oid OR NOT app.rolcanlogin OR app.rolsuper OR app.rolcreatedb OR app.rolcreaterole OR app.rolreplication OR app.rolbypassrls OR has_parameter_privilege(app.oid,'session_replication_role','SET') OR has_database_privilege(app.oid,current_database(),'CREATE') OR has_schema_privilege(app.oid,'naijue_erp','CREATE')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles reachable WHERE pg_has_role(app.oid,reachable.oid,'MEMBER') AND reachable.rolname NOT IN (app.rolname,'erp_unified27_runtime_2393dbc6db9581c2'))

 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND ((c.relkind IN('r','p','v','m','f') AND (has_table_privilege(app.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(app.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR (c.relkind='S' AND has_sequence_privilege(app.oid,c.oid,'SELECT,USAGE,UPDATE')))) OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=app.oid AND admin_option)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND pg_has_role(app.oid,relowner,'USAGE'))
 THEN RAISE EXCEPTION 'ORDINARY_SEPARATE_RUNTIME_LOGIN_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid='erp_unified27_runtime_2393dbc6db9581c2'::regrole AND (member<>app.oid OR admin_option OR inherit_option OR NOT set_option)) THEN RAISE EXCEPTION 'UNEXPECTED_RUNTIME_MEMBERSHIP'; END IF;
 EXECUTE format('GRANT erp_unified27_runtime_2393dbc6db9581c2 TO %I WITH INHERIT FALSE, SET TRUE',app.rolname);
 EXECUTE format('GRANT erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2 TO %I WITH INHERIT FALSE, SET TRUE',r.rolname);
 EXECUTE format('GRANT USAGE ON SCHEMA naijue_erp TO %I',r.rolname);
 -- Exact read-only physical cluster identity, not pg_monitor or a privileged role.
 EXECUTE format('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO %I',r.rolname);
END $membership$;
`;
 sql+=`
-- Installation-only owner checks; ordinary controller has no row SELECT privilege.
DO $installed$ DECLARE t record; populated boolean; BEGIN
 IF (SELECT count(*)<>27 OR min(version)<>1 OR max(version)<>27 FROM naijue_erp.schema_migration) THEN RAISE EXCEPTION 'WHOLE_INSTALL_MIGRATION_LINEAGE'; END IF;
 FOR t IN SELECT relname FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r' AND relname<>'schema_migration' LOOP
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)',t.relname) INTO populated;
 IF populated THEN RAISE EXCEPTION 'WHOLE_INSTALL_BUSINESS_TABLE_NOT_EMPTY'; END IF;
 END LOOP;
END $installed$;
`;
 const barcodePermissionPath='adapters/postgres/patches/0027_document_specification_barcodes_permissions.psql';const barcodePermissions=await readFile(resolve(root,barcodePermissionPath),'utf8');pins.push({path:barcodePermissionPath,sourceSha256:sha(barcodePermissions),renderedSha256:sha(barcodePermissions),kind:'FIXED_RUNTIME_PERMISSION_COMPANION'});sql+='\n-- Fixed protected runtime target, never a caller-selected role.\n\\set runtime_role erp_unified27_runtime_2393dbc6db9581c2\n'+barcodePermissions;
 const productPermissionPath='adapters/postgres/patches/0027_product_maintenance_permissions.psql';const productPermissions=await readFile(resolve(root,productPermissionPath),'utf8');pins.push({path:productPermissionPath,sourceSha256:sha(productPermissions),renderedSha256:sha(productPermissions),kind:'FIXED_PRODUCT_PERMISSION_COMPANION'});sql+='\n-- Same fixed protected runtime; precise product column grants only.\n'+productPermissions;
 const files={'00-protected-roles.sql':roles,'01-schema-and-whole.sql':sql,'02-controller-membership.psql':membership};await mkdir(output,{recursive:false,mode:0o700});for(const[name,text]of Object.entries(files))await writeFile(resolve(output,name),text,{flag:'wx',mode:0o600});const manifest={targetBinding:targetBinding??null,format:targetBinding?'LOCAL_WHOLE_BOUND_NEW_EMPTY_INSTALL_SOURCE_V1':'LOCAL_WHOLE_SYNTHETIC_INSTALL_SOURCE_V1',engineExecuted:false,reviewed:false,fullCatalogAdmission:false,pins,files:Object.fromEntries(Object.entries(files).map(([n,t])=>[n,{bytes:Buffer.byteLength(t),sha256:sha(t)}]))};await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});return manifest;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.length!==4||process.argv[2]!=='--output')throw Error('Usage: node scripts/release/unified-install/render-whole-package-local.mjs --output /absolute/new-directory');await renderWholeLocal(process.argv[3]);process.stdout.write('Source bundle generated; no database connection or execution. Review required.\n');}
