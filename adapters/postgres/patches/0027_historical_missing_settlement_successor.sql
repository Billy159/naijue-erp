-- SOURCE CANDIDATE ONLY. Not installed or PostgreSQL parsed/tested.
-- Preserve absence only in exact original SALE migration, never ordinary approval.
-- Known settlement mismatch still rejects. No data or receipt is manufactured.
-- Requires independently reviewed whole-package cohort and search-path hardening.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_missing_settlement$
DECLARE
 spec jsonb := $source_changes${"predecessor_sha256":"149111d2da2a62f37a65578f76af7fddc156bbf3e8797e13c653d8481d294b21","successor_sha256":"fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86","migration_proof_sha256":"2bed9652283f7bd640c45e16f5ac820369022f249da60678123271a649c2a9c8","replacements":[{"before":"total numeric; evidence","after":"total numeric; settlement_count bigint; preserve_missing_original boolean := false; evidence"},{"before":"SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0) INTO total","after":"SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0),count(*) INTO total,settlement_count"},{"before":" -- Preserve unresolved original amounts/status in CLEANED plus exceptions;\n -- never fabricate settlement rows or admit an unbalanced APPROVED target.\n -- DRAFT remains allowed to be unbalanced. Migration does not bypass approval.\n IF h.status='APPROVED' AND total IS DISTINCT FROM h.net_due THEN","after":" -- Missing historical settlement evidence is not an inferred zero. Only exact\n -- original migration may preserve this absence; ordinary approval stays strict.\n IF evidence.action='MIGRATE_DOCUMENT' THEN\n  PERFORM naijue_erp.assert_document_migration(r.id);\n  preserve_missing_original:=h.business_type='SALE' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0\n   AND evidence.after_values->'settlements'='[]'::jsonb;\n END IF;\n IF h.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h.net_due THEN"}]}$source_changes$::jsonb;
 signature text := 'naijue_erp.validate_sales_settlement()';
 routine oid; before_body text; after_body text; definition text; change jsonb;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'false'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.assert_document_migration(uuid)')) IS DISTINCT FROM spec->>'migration_proof_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_PROOF_DIFFERS' USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',change->>'after');
  definition:=pg_catalog.replace(definition,change->>'before',change->>'after');
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta
 FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'MISSING_SETTLEMENT_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_missing_settlement$;
COMMIT;
