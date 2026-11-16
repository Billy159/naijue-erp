-- Local candidate after the exact ten-function and prior-only comparison pieces.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $apply$
DECLARE
  routine regprocedure:='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'::regprocedure;
  body text;
  meta jsonb;
  next_body text;
  old_guard constant text:=$old$  IF child_ordinal IS NULL OR child_ordinal<1 OR child_ordinal<>(SELECT count(*) FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text)
   OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text)
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;$old$;
  new_guard constant text:=$new$  IF child_ordinal IS NULL OR child_ordinal<1
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  IF (SELECT child_ordinal<>count(*) FILTER (WHERE same_root)
         OR coalesce(bool_or(CASE WHEN NOT same_root AND object_type='IMPORT'
                 THEN row_xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
                 ELSE false END),false)
      FROM (SELECT (a.after_values->'whole_package_v2'->>'root_operation'=root_operation::text) IS TRUE AS same_root,
                   a.object_type,a.xmin AS row_xmin FROM naijue_erp.audit_change a OFFSET 0) visible_audits)
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;$new$;
BEGIN
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,meta FROM pg_proc p WHERE p.oid=routine;
  IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM '31053b127b2bcbc9763c6c5326f10db8a0e6d536a1e477ee0ea63dac07ae1d7a'
    OR (meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    OR (length(body)-length(replace(body,old_guard,'')))<>length(old_guard)
  THEN RAISE EXCEPTION 'ROOT_SINGLE_SCAN_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
  next_body:=replace(body,old_guard,new_guard);
  EXECUTE replace(pg_get_functiondef(routine),body,next_body);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=routine) IS DISTINCT FROM meta
     OR (SELECT p.prosrc FROM pg_proc p WHERE p.oid=routine) IS DISTINCT FROM next_body
  THEN RAISE EXCEPTION 'ROOT_SINGLE_SCAN_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
END $apply$;
COMMIT;
