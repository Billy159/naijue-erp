-- Versioned, explicit installation candidate for ordinary product/document
-- reference locks. Apply only after the 0027 publication policies and native
-- maintenance guards have been reviewed for the target. This script is not
-- invoked by this source-only change. No table-level UPDATE is granted.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $preflight$
DECLARE t text; role_name constant text := 'erp_unified27_runtime_2393dbc6db9581c2';
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolcanlogin AND NOT rolinherit AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=pg_roles.oid)) THEN
  RAISE EXCEPTION 'DOCUMENT_REFERENCE_RUNTIME_ROLE_INVALID' USING ERRCODE='23514'; END IF;
 FOREACH t IN ARRAY ARRAY['product_category','supplier','size_group','season','barcode_scheme','product_image'] LOOP
  IF pg_catalog.to_regclass('naijue_erp.'||t) IS NULL OR pg_catalog.has_table_privilege(role_name,'naijue_erp.'||t,'UPDATE') THEN
   RAISE EXCEPTION 'DOCUMENT_REFERENCE_ACL_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('naijue_erp.'||t) AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'id' AND pg_catalog.has_column_privilege(role_name,a.attrelid,a.attnum,'UPDATE')) THEN
   RAISE EXCEPTION 'DOCUMENT_REFERENCE_EXTRA_UPDATE_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF pg_catalog.has_column_privilege(role_name,'naijue_erp.'||t,'id','UPDATE') THEN
   IF t<>'product_category' OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger g JOIN pg_catalog.pg_proc p ON p.oid=g.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE g.tgrelid='naijue_erp.product_category'::regclass AND g.tgname='standard_runtime_reference_lock_only' AND g.tgtype=19 AND g.tgenabled='O' AND NOT g.tgisinternal AND NOT g.tgdeferrable AND NOT g.tginitdeferred AND g.tgnargs=0
     AND g.tgattr=(SELECT a.attnum::text::int2vector FROM pg_catalog.pg_attribute a WHERE a.attrelid=g.tgrelid AND a.attname='id' AND NOT a.attisdropped)
     AND pg_catalog.pg_get_expr(g.tgqual,g.tgrelid) !~ '''[^'']*[[:space:]][^'']*'''
     AND pg_catalog.regexp_replace(pg_catalog.pg_get_expr(g.tgqual,g.tgrelid),'[[:space:]]','','g')='(current_setting(''role''::text)=''erp_unified27_runtime_2393dbc6db9581c2''::text)'
     AND p.oid='naijue_erp.reject_immutable_change()'::regprocedure AND p.prokind='f' AND NOT p.prosecdef AND NOT p.proretset AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND p.proowner=n.nspowner AND l.lanname='plpgsql'
     AND p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c') THEN
    RAISE EXCEPTION 'CATEGORY_EXISTING_GUARD_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
END $preflight$;
CREATE FUNCTION naijue_erp.reject_document_runtime_reference_id_update_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
  RAISE EXCEPTION 'Runtime reference lock must not update identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.reject_document_runtime_reference_id_update_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION naijue_erp.reject_document_runtime_reference_id_update_v1() TO erp_unified27_runtime_2393dbc6db9581c2;
DO $mount$
DECLARE t text; role_name constant text := 'erp_unified27_runtime_2393dbc6db9581c2';
BEGIN
 FOREACH t IN ARRAY ARRAY['product_category','supplier','size_group','season','barcode_scheme','product_image'] LOOP
  EXECUTE pg_catalog.format('CREATE TRIGGER document_runtime_reference_id_lock_only BEFORE UPDATE OF id ON naijue_erp.%I FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_document_runtime_reference_id_update_v1()',t);
  IF NOT pg_catalog.has_column_privilege(role_name,'naijue_erp.'||t,'id','UPDATE') THEN
   EXECUTE pg_catalog.format('GRANT UPDATE(id) ON naijue_erp.%I TO erp_unified27_runtime_2393dbc6db9581c2',t);
  END IF;
 END LOOP;
END $mount$;
DO $verify$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['product_category','supplier','size_group','season','barcode_scheme','product_image'] LOOP
  IF NOT pg_catalog.has_column_privilege('erp_unified27_runtime_2393dbc6db9581c2','naijue_erp.'||t,'id','UPDATE') OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger g WHERE g.tgrelid=pg_catalog.to_regclass('naijue_erp.'||t)
     AND g.tgname='document_runtime_reference_id_lock_only' AND g.tgfoid='naijue_erp.reject_document_runtime_reference_id_update_v1()'::regprocedure
     AND g.tgtype=19 AND g.tgenabled='O' AND g.tgqual IS NULL
     AND g.tgattr=(SELECT a.attnum::text::int2vector FROM pg_catalog.pg_attribute a WHERE a.attrelid=g.tgrelid AND a.attname='id' AND NOT a.attisdropped)) THEN
   RAISE EXCEPTION 'DOCUMENT_REFERENCE_GUARD_INSTALLATION_MISMATCH' USING ERRCODE='23514'; END IF;
 END LOOP;
END $verify$;
COMMIT;
