-- Diff on the fixed SQL39 ten-routine parent. Only the existing context body changes.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $apply$
DECLARE
  context_oid regprocedure := 'naijue_erp.standard_whole_package_context_v2(uuid)'::regprocedure;
  definition text;
  body_before text;
  body_after text;
  meta_before jsonb;
  meta_after jsonb;
BEGIN
  SELECT pg_get_functiondef(p.oid),p.prosrc,to_jsonb(p)-'prosrc'
    INTO STRICT definition,body_before,meta_before FROM pg_proc p WHERE p.oid=context_oid;
  IF encode(sha256(convert_to(body_before,'UTF8')),'hex') IS DISTINCT FROM
    'ef1631ee8ac06527c13253aad1eec7d8902dd6411d46b1db729fdbf589b2b4e2'
    OR (meta_before->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
  THEN RAISE EXCEPTION 'CONTEXT_SINGLE_READ_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;

  body_after:=replace(body_before,' marker jsonb;', ' marker jsonb; root_values jsonb;');
  body_after:=replace(body_after,'a.after_values','root_values');
  body_after:=replace(body_after,' marker:=root_values',
    E' -- Detoast the immutable JSONB once for this call.\n root_values:=a.after_values #> ARRAY[]::text[];\n marker:=root_values');
  EXECUTE replace(definition,body_before,body_after);
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT definition,meta_after FROM pg_proc p WHERE p.oid=context_oid;
  IF definition IS DISTINCT FROM body_after OR meta_before IS DISTINCT FROM meta_after
  THEN RAISE EXCEPTION 'CONTEXT_SINGLE_READ_CATALOG_DIFFERS' USING ERRCODE='55000'; END IF;
END $apply$;
COMMIT;
