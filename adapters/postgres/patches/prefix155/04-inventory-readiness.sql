-- Disposable PostgreSQL comparison on the fixed SQL39 ten-routine installation.
BEGIN;
DO $probe$
DECLARE
  routine regprocedure := 'naijue_erp.standard_inventory_key_proof(uuid,uuid)'::regprocedure;
  original_gate text := $old$ IF NOT naijue_erp.standard_business_ready() AND current_setting('role')<>'erp_unified27_importer_2393dbc6db9581c2' THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;$old$;
  role_first_gate text := $new$ IF current_setting('role')='erp_unified27_importer_2393dbc6db9581c2' THEN
  NULL; -- Same importer exception to the publication gate.
 ELSE
  IF NOT naijue_erp.standard_business_ready() THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;
 END IF;$new$;
  catalog_before jsonb;
  body_before text;
BEGIN
  SELECT to_jsonb(p)-'prosrc', p.prosrc INTO STRICT catalog_before, body_before FROM pg_proc p WHERE p.oid=routine;
  IF encode(sha256(convert_to(body_before,'UTF8')),'hex') IS DISTINCT FROM 'bd3e945b2849aebfdeb0aa1d2029a0cdca58015574515392b693f7d38f8fd241' THEN
    RAISE EXCEPTION 'Unexpected inventory key proof body';
  END IF;
  EXECUTE replace(pg_get_functiondef(routine), original_gate, role_first_gate);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=routine) IS DISTINCT FROM catalog_before
    OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid=routine) IS DISTINCT FROM replace(body_before, original_gate, role_first_gate) THEN
    RAISE EXCEPTION 'Unexpected inventory key proof catalog change';
  END IF;
END $probe$;
COMMIT;
