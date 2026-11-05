-- Zero amount original source archive. No settlement INSERT and no inventory replay.
-- SOURCE CANDIDATE ONLY. Not installed; not PostgreSQL parsed or validated.
-- Explicit historical-sales-source-v1 successor. Existing SQL files remain unchanged.
-- READY fields stay unchanged; CLEANED classification is offline provenance declaration,
-- never independent source truth. Compiler gates remain closed until reviewed integration.
-- Run only after the reviewed whole-package cohort and its search-path hardening.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_source_profile$
DECLARE
 spec jsonb := $source_profile_changes${"predecessor_sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","successor_sha256":"23fbb6f80befaabac0dcccf9e3c82eb9151de154ad5cd61bed1b14a1ea752301","replacements":[{"before":"entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']","after":"entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive']"},{"before":"    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');","after":"    IF entry ? 'zero_amount_archive' THEN\n     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'\n      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'\n      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'\n      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'\n      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'\n      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'\n     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;\n     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;\n     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP\n      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'\n       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'\n       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])\n       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'\n       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096\n       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'\n       OR parent_row.archived->'amount' IS DISTINCT FROM '\"0.00\"'::jsonb\n       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'\n       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'\n      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;\n      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100\n       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100\n       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)\n       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)\n      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;\n     END LOOP;\n     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;\n    END IF;\n    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');\n    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;\n    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');"},{"before":"    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;","after":"    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;\n    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;"}]}$source_profile_changes$::jsonb;
 signature text := 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'true'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'ZERO_ARCHIVE_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_source_profile$;

-- Narrow trace entry. Existing proof function remains private to its owner.
CREATE FUNCTION naijue_erp.standard_zero_amount_archive_trace(sales uuid)
RETURNS TABLE(record_id uuid,sales_id uuid,sales_source_key text,source_namespace text,proof jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $zero_archive_trace$
BEGIN
 IF current_setting('role') IS DISTINCT FROM 'erp_unified27_importer_2393dbc6db9581c2' THEN
  RAISE EXCEPTION 'ZERO_ARCHIVE_IMPORTER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.target_id,s.source_key,s.source_system,
  naijue_erp.standard_import_record_proof(s.id)
 FROM naijue_erp.import_record s
 JOIN naijue_erp.sales_header h ON h.id=s.target_id AND h.import_batch_id=s.import_batch_id
 JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id AND b.status='IMPORTED'
 WHERE s.target_type='SALES_HEADER' AND s.status='IMPORTED' AND s.target_id=sales
  AND h.stock_basis='CUTOFF_HISTORY' AND h.business_type='SALE';
END $zero_archive_trace$;
DO $zero_archive_owner$
DECLARE owner_name text;
BEGIN
 SELECT pg_get_userbyid(proowner) INTO STRICT owner_name FROM pg_proc
 WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'::regprocedure;
 EXECUTE format('ALTER FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) OWNER TO %I',owner_name);
END $zero_archive_owner$;
REVOKE ALL ON FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_zero_amount_archive_trace(uuid) TO erp_unified27_importer_2393dbc6db9581c2;
COMMIT;
