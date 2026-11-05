-- Source47: ordinary ledger statement sets must not query legacy history.
-- Only an all-nonhistorical transition set returns early; any historical/mixed
-- set retains the complete original validator unchanged. No grants or bypasses.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
SET LOCAL TimeZone='UTC';
DO $before$
DECLARE routine_row record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD47_EXACT_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure)<>'451708aa41f1ffe91ae3008491f1679da19e45d844e06fd054d4108c3215f498' OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.standard_import_verify(jsonb,text)'::regprocedure)<>'5ab152bdedb516e2994f1b4201c4803ce837f7b096848c3651ad88ac052c23af' THEN RAISE EXCEPTION 'STANDARD47_SOURCE46_LINEAGE_DIFFERS' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.history_numeric_ledger_set_guard()'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'83d5ef1ec17d817433ac8b19b3921eba86208f2979a41581a198813bc88ddef3' THEN RAISE EXCEPTION 'STANDARD47_BEFORE_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'4a97039604c1baba01d8d0d12cb55c8194484089c3dd46adf23d3e815209c354' OR routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD47_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
END $before$;

CREATE OR REPLACE FUNCTION naijue_erp.history_numeric_ledger_set_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $ledger$
DECLARE invalid boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM history_new WHERE event_kind='HISTORY_REVISION') THEN RETURN NULL; END IF;
 WITH revisions AS MATERIALIZED(
  SELECT r.* FROM naijue_erp.history_revision r JOIN(SELECT DISTINCT source_history_revision_id id FROM history_new WHERE event_kind='HISTORY_REVISION') n USING(id)
  WHERE r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
 ), expected AS MATERIALIZED(
  SELECT r.id revision_id,r.operation_id,r.document_kind,r.to_version,r.before_facts->>'businessDate' business_date,r.changed_at,e.value
   FROM revisions r CROSS JOIN LATERAL jsonb_array_elements(r.stock_effect_evidence->'effects')e(value)
 ) SELECT EXISTS(SELECT 1 FROM history_new n LEFT JOIN expected e ON e.revision_id=n.source_history_revision_id AND e.value->>'ledgerEntryId'=n.id::text
  WHERE n.event_kind='HISTORY_REVISION' AND (e.revision_id IS NULL OR n.operation_id IS DISTINCT FROM e.operation_id
   OR n.source_document_version IS DISTINCT FROM e.to_version OR n.business_date::text IS DISTINCT FROM e.business_date OR n.posted_at IS DISTINCT FROM e.changed_at
   OR n.warehouse_id::text IS DISTINCT FROM e.value->>'warehouseId' OR n.sku_id::text IS DISTINCT FROM e.value->>'skuId'
   OR n.endpoint IS DISTINCT FROM e.value->>'endpoint' OR n.quantity_delta::text IS DISTINCT FROM e.value->>'quantityDelta'
   OR (e.document_kind='SALES' AND(n.source_history_sales_line_id::text IS DISTINCT FROM e.value->>'lineId' OR n.source_history_transfer_line_id IS NOT NULL))
   OR (e.document_kind='TRANSFER' AND(n.source_history_transfer_line_id::text IS DISTINCT FROM e.value->>'lineId' OR n.source_history_sales_line_id IS NOT NULL)))) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Historical ledger set differs from exact current revision effects' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $ledger$;

DO $after$
DECLARE routine_row record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD47_EXACT_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;

 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.history_numeric_ledger_set_guard()'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'f94e8788203bc83f35ebf872d7569faf59acc5d1fe1967a9889badf092fc8f16' THEN RAISE EXCEPTION 'STANDARD47_AFTER_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'4a97039604c1baba01d8d0d12cb55c8194484089c3dd46adf23d3e815209c354' OR routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD47_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
END $after$;
COMMIT;
