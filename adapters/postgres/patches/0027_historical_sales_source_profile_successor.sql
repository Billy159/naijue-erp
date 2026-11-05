-- SOURCE CANDIDATE ONLY. Not installed; not PostgreSQL parsed or validated.
-- Explicit historical-sales-source-v1 successor. Existing SQL files remain unchanged.
-- READY fields stay unchanged; CLEANED classification is offline provenance declaration,
-- never independent source truth. Compiler gates remain closed until reviewed integration.
-- Run only after the reviewed whole-package cohort and its search-path hardening.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_source_profile$
DECLARE
 spec jsonb := $source_profile_changes${"predecessor_sha256":"0d0547318a5a940639f288a73f08ebd9396b079b0c88810b7fa016870652d840","successor_sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","profile_sha256":"89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e","replacements":[{"before":"payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')","after":"payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')"},{"before":"('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')\n       THEN '^[A-Z356789]$'","after":"('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')\n       THEN '^[A-Z356789]$'"},{"before":"IF cfg->>'schema_declarations_sha256'='9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a' THEN","after":"IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e') THEN"},{"before":"cfg->>'schema_declarations_sha256' IS DISTINCT FROM '9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a'","after":"coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')"}]}$source_profile_changes$::jsonb;
 signature text := 'naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'true'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'HISTORY_SOURCE_PROFILE_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_source_profile$;
COMMIT;
