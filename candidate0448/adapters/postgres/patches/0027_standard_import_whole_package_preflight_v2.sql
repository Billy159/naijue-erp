-- Pre-install role gate only; full transitive catalog admission remains required.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
DO $roles$ DECLARE role_row record; BEGIN
 IF current_user::regrole::oid<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'WHOLE_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR role_row IN SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') LOOP
  IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR role_row.rolbypassrls
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=role_row.oid)
   OR role_row.oid IN ((SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_catalog.pg_database WHERE datname=current_database()))
   OR has_parameter_privilege(role_row.oid,'session_replication_role','SET')
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE has_schema_privilege(role_row.oid,n.oid,'CREATE'))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND
     (c.relowner=role_row.oid OR (c.relkind IN ('r','p','v','m','f') AND
      (has_table_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      OR (c.relkind='S' AND has_sequence_privilege(role_row.oid,c.oid,'USAGE,SELECT,UPDATE'))))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=role_row.oid)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typowner=role_row.oid)

  THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'))<>2 THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLES_REQUIRED' USING ERRCODE='42501'; END IF;
END $roles$;
COMMIT;
