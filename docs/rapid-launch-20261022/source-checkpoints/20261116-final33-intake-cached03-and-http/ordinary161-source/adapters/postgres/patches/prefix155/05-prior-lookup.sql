-- Offline prior-only probe on exact ten-routine carrier.
BEGIN;
DO $sql39$
DECLARE specs jsonb := $body_specs$[{"signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","beforeSha256":"4b31ea7398b4aae5fa6c91a9af2276258493cdccc9f72bfabe4aa12313b62c09","afterSha256":"31053b127b2bcbc9763c6c5326f10db8a0e6d536a1e477ee0ea63dac07ae1d7a","replacements":[["  SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank\n   FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;","  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change\n     WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND\n  (after_values->'whole_package_v2'->>'root_operation') COLLATE \"C\" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'\n  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND\n  (after_values->'whole_package_v2'->>'root_operation') COLLATE \"C\" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'\n  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN\n     CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END) IS NULL) THEN\n    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank\n     FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;\n  ELSE\n    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank\n     FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND\n    (after_values->'whole_package_v2'->>'root_operation') COLLATE \"C\" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'\n    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND\n    (after_values->'whole_package_v2'->>'root_operation') COLLATE \"C\" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'\n    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN\n       CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal-1;\n  END IF;"]]}]$body_specs$;
  spec jsonb; edit jsonb; routine regprocedure; definition text; body text; anchor text;
  before_meta jsonb; after_meta jsonb;
BEGIN
  FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
    routine:=to_regprocedure(spec->>'signature');
    SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,before_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
    IF encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM spec->>'beforeSha256'
       OR (before_meta->>'proowner')::oid IS DISTINCT FROM current_user::regrole::oid
    THEN RAISE EXCEPTION 'SQL39_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
    definition:=pg_get_functiondef(routine);
    FOR edit IN SELECT value FROM jsonb_array_elements(spec->'replacements') LOOP
      anchor:=edit->>0;
      IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>coalesce((edit->>2)::integer,1)
      THEN RAISE EXCEPTION 'SQL39_FUNCTION_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
      definition:=replace(definition,anchor,edit->>1);
    END LOOP;
    EXECUTE definition;
    SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT body,after_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
    IF before_meta IS DISTINCT FROM after_meta
       OR encode(sha256(convert_to(body,'UTF8')),'hex') IS DISTINCT FROM spec->>'afterSha256'
    THEN RAISE EXCEPTION 'SQL39_ROUTINE_OR_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
  END LOOP;
END $sql39$;
CREATE INDEX audit_whole_prior_probe ON naijue_erp.audit_change
  ((CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END),(CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
     CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)) WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL;
COMMIT;
