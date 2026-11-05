--
-- PostgreSQL database dump
--

\restrict 8nCGyBK1hbYRcBPUD7FvGrKIqcAg9m1IP56VJJ3LMRPh0BNTtb0gGf0B3MKLD1V

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: naijue_erp; Type: SCHEMA; Schema: -; Owner: fresh35_owner_20261105_r1
--

CREATE SCHEMA "naijue_erp";


ALTER SCHEMA "naijue_erp" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: valid_history_counts("jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."valid_history_counts"("value" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
  SELECT (jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes']
    AND value - ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'] = '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(value) e WHERE jsonb_typeof(e.value) <> 'number' OR e.value::text !~ '^[0-9]+$')) IS TRUE;
$_$;


ALTER FUNCTION "naijue_erp"."valid_history_counts"("value" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: import_batch; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."import_batch" (
    "id" "uuid" NOT NULL,
    "source_name" "text" NOT NULL,
    "source_manifest_ref" "text" NOT NULL,
    "source_hash" "text" NOT NULL,
    "cutoff_at" timestamp with time zone NOT NULL,
    "mapping_version" "text" NOT NULL,
    "inventory_mode" "text" NOT NULL,
    "status" "text" NOT NULL,
    "checkpoint" "jsonb" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "history_expected_counts" "jsonb",
    "history_actual_counts" "jsonb",
    "history_payload_hash" "text",
    "history_validation_passed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "import_batch_check" CHECK ((("status" = 'IMPORTED'::"text") = ("completed_at" IS NOT NULL))),
    CONSTRAINT "import_batch_checkpoint_check" CHECK (((("jsonb_typeof"("checkpoint") = 'object'::"text") AND ("checkpoint" ?& ARRAY['sequence'::"text", 'cursor'::"text", 'counts'::"text", 'expected'::"text"]) AND (("checkpoint" - ARRAY['sequence'::"text", 'cursor'::"text", 'counts'::"text", 'expected'::"text"]) = '{}'::"jsonb") AND (("checkpoint" ->> 'sequence'::"text") ~ '^[0-9]+$'::"text") AND (("checkpoint" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND ("jsonb_typeof"(("checkpoint" -> 'counts'::"text")) = 'object'::"text") AND ("jsonb_typeof"(("checkpoint" -> 'expected'::"text")) = 'object'::"text")) IS TRUE)),
    CONSTRAINT "import_batch_history_actual_counts_check" CHECK ((("history_actual_counts" IS NULL) OR "naijue_erp"."valid_history_counts"("history_actual_counts"))),
    CONSTRAINT "import_batch_history_expected_counts_check" CHECK ((("history_expected_counts" IS NULL) OR "naijue_erp"."valid_history_counts"("history_expected_counts"))),
    CONSTRAINT "import_batch_history_payload_hash_check" CHECK (("history_payload_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "import_batch_inventory_mode_check" CHECK (("inventory_mode" = ANY (ARRAY['CUTOFF_STOCK_BASELINE'::"text", 'DOCUMENT_CONVERSION'::"text"]))),
    CONSTRAINT "import_batch_mapping_version_check" CHECK (("length"("btrim"("mapping_version")) > 0)),
    CONSTRAINT "import_batch_source_hash_check" CHECK (("source_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "import_batch_source_manifest_ref_check" CHECK (("length"("btrim"("source_manifest_ref")) > 0)),
    CONSTRAINT "import_batch_source_name_check" CHECK (("source_name" ~ '^[a-z][a-z0-9_.:-]*$'::"text")),
    CONSTRAINT "import_batch_status_check" CHECK (("status" = ANY (ARRAY['STAGED'::"text", 'VALIDATING'::"text", 'PASSED'::"text", 'IMPORTED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "naijue_erp"."import_batch" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assert_document_conversion_batch("naijue_erp"."import_batch", "jsonb", "text", boolean); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assert_document_conversion_batch"("next_row" "naijue_erp"."import_batch", "prior" "jsonb", "mutation" "text", "final_state" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE kind text; actual bigint; total numeric:=0; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 IF final_state THEN
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=next_row.id AND new_version=(next_row.checkpoint->>'sequence')::integer+1;
  IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
 END IF;
 IF mutation='DELETE' OR next_row.inventory_mode<>'DOCUMENT_CONVERSION' OR next_row.mapping_version<>'DOCUMENT_CONVERSION_V1'
   OR next_row.history_payload_hash IS NOT NULL OR next_row.history_expected_counts IS NOT NULL
   OR next_row.history_actual_counts IS NOT NULL OR next_row.history_validation_passed IS TRUE
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE' AND cutoff_at=next_row.cutoff_at)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=next_row.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.operation_receipt receipt_row JOIN naijue_erp.inventory_ledger l ON l.operation_id=receipt_row.id WHERE receipt_row.target_type='IMPORT' AND receipt_row.target_id=next_row.id) THEN
  RAISE EXCEPTION 'conversion cannot post or rebaseline inventory; one exact previously published cutoff is required' USING ERRCODE='23514'; END IF;
 IF mutation='INSERT' THEN
  IF next_row.status<>'STAGED' OR next_row.checkpoint->>'sequence'<>'0' OR next_row.checkpoint->>'cursor'<>'0' THEN
   RAISE EXCEPTION 'conversion must stage at zero' USING ERRCODE='23514'; END IF;
 ELSE
  IF prior IS NULL OR prior->>'status' IN ('IMPORTED','FAILED')
    OR (to_jsonb(next_row)-ARRAY['status','checkpoint','completed_at']) IS DISTINCT FROM (prior-ARRAY['status','checkpoint','completed_at'])
    OR next_row.checkpoint->'expected' IS DISTINCT FROM prior->'checkpoint'->'expected'
    OR (next_row.checkpoint->>'sequence')::numeric<>(prior->'checkpoint'->>'sequence')::numeric+1
    OR (next_row.checkpoint->>'cursor')::numeric<(prior->'checkpoint'->>'cursor')::numeric
    OR next_row.status NOT IN ('VALIDATING','IMPORTED','FAILED') THEN
   RAISE EXCEPTION 'immutable conversion source or invalid checkpoint/state transition' USING ERRCODE='23514'; END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'expected'))<>6
  OR (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'counts'))<>6 THEN
  RAISE EXCEPTION 'conversion requires exactly six ordinary target counters' USING ERRCODE='23514'; END IF;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH'] LOOP
  IF jsonb_typeof(next_row.checkpoint->'expected'->kind) IS DISTINCT FROM 'number'
   OR jsonb_typeof(next_row.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
   OR (next_row.checkpoint->'expected'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind)::numeric>(next_row.checkpoint->'expected'->>kind)::numeric
   OR (prior IS NOT NULL AND (next_row.checkpoint->'counts'->>kind)::numeric<(prior->'checkpoint'->'counts'->>kind)::numeric) THEN
   RAISE EXCEPTION 'conversion counter type/range/monotonicity mismatch' USING ERRCODE='23514'; END IF;
  total:=total+(next_row.checkpoint->'counts'->>kind)::numeric;
  IF final_state THEN
   IF a.after_values ? 'whole_package_v2' THEN
    SELECT count(*) INTO actual FROM naijue_erp.import_record source_row JOIN naijue_erp.audit_change source_audit
     ON source_audit.operation_id=(source_row.decision_reason::jsonb->>'operationId')::uuid
     WHERE source_row.import_batch_id=next_row.id AND source_row.target_type=kind AND source_row.status='IMPORTED'
      AND source_audit.object_type='IMPORT' AND source_audit.object_id=next_row.id AND source_audit.new_version<=a.new_version
      AND source_audit.after_values->'whole_package_v2'->>'root_operation'=a.after_values->'whole_package_v2'->>'root_operation';
   ELSE
   SELECT count(*) INTO actual FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type=kind AND status='IMPORTED';
   END IF;
   IF actual::numeric<>(next_row.checkpoint->'counts'->>kind)::numeric THEN
    RAISE EXCEPTION 'conversion counters must equal exact committed ordinary identities: %',kind USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF total<>(next_row.checkpoint->>'cursor')::numeric OR next_row.checkpoint->'expected'->>'IMPORT_BATCH'<>'1' THEN
  RAISE EXCEPTION 'conversion exact cursor/final approval scope mismatch' USING ERRCODE='23514'; END IF;
 IF NOT final_state THEN RETURN; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=next_row.id AND new_version=(next_row.checkpoint->>'sequence')::integer+1;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN a.after_values->'checkpoint' ELSE a.after_values END) IS DISTINCT FROM next_row.checkpoint OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
   OR r.target_type<>'IMPORT' OR r.target_id<>next_row.id OR r.result_data->>'sequence' IS DISTINCT FROM next_row.checkpoint->>'sequence'
   OR r.result_data->>'cursor' IS DISTINCT FROM next_row.checkpoint->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM next_row.status
   OR (mutation='INSERT' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action<>'IMPORT_STAGE'))
   OR (mutation='UPDATE' AND (a.old_version IS DISTINCT FROM (prior->'checkpoint'->>'sequence')::integer+1 OR a.before_values IS DISTINCT FROM prior->'checkpoint'))
   OR r.action IS DISTINCT FROM (CASE next_row.status WHEN 'STAGED' THEN 'IMPORT_STAGE' WHEN 'IMPORTED' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
   OR r.result_data->'ledgerEntryIds'<>'[]'
   OR (next_row.status='IMPORTED' AND next_row.completed_at IS DISTINCT FROM r.completed_at) THEN
  RAISE EXCEPTION 'conversion checkpoint requires its exact atomic import audit/receipt' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account ua JOIN naijue_erp.staff st ON st.id=ua.staff_id
   WHERE ua.id=r.actor_account_id AND ua.login_enabled AND st.employment_status='在职' AND st.role='ADMIN')
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() THEN
  RAISE EXCEPTION 'conversion batch requires actual current administrator and transaction time' USING ERRCODE='42501'; END IF;
 IF next_row.status='IMPORTED' THEN
  IF next_row.checkpoint->'counts' IS DISTINCT FROM next_row.checkpoint->'expected'
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND status NOT IN ('IMPORTED','EXCLUDED'))
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type='IMPORT_BATCH' AND target_id=next_row.id
      AND status='IMPORTED' AND source_entity_type='DOCUMENT_CONVERSION_APPROVAL' AND source_key='FINAL_DOCUMENT_CONVERSION'
      AND source_record_hash=next_row.source_hash AND source_file_ref=next_row.source_manifest_ref
      AND (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN decision_reason::jsonb->>'format'='STANDARD_IMPORT_POINTER_V1' AND decision_reason::jsonb->>'operationId'=r.id::text ELSE decision_reason='DOCUMENT_CONVERSION_V1;CURRENT_EFFECTIVE;ARCHIVE_RESTORE_VERIFIED;BASELINE_COVERAGE_CONFIRMED;NO_REBASELINE;NO_UNRESOLVED_EXCEPTIONS' END))
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=next_row.id AND m.status='IMPORTED'
      AND m.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt anchor
        WHERE anchor.action='MIGRATE_DOCUMENT' AND anchor.target_id=m.target_id
          AND anchor.target_type=CASE m.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN
   RAISE EXCEPTION 'conversion publication requires complete ordinary anchors and exact retained approval/archive evidence' USING ERRCODE='23514'; END IF;
 END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."assert_document_conversion_batch"("next_row" "naijue_erp"."import_batch", "prior" "jsonb", "mutation" "text", "final_state" boolean) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assert_document_migration("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assert_document_migration"("operation" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 s naijue_erp.import_record%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; snap jsonb; evidence jsonb; h jsonb; expected_type text;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 snap:=naijue_erp.unified_document_snapshot(r.target_type,r.target_id); h:=snap->'header';
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=(h->>'import_batch_id')::uuid;
 SELECT * INTO STRICT s FROM naijue_erp.import_record WHERE id=(r.result_data->>'sourceRecordId')::uuid;
 evidence:=a.after_values->'baseline';
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(evidence->>'baselineBatchId')::uuid;
 expected_type:=CASE r.target_type WHEN 'SALES' THEN 'SALES_HEADER' WHEN 'TRANSFER' THEN 'TRANSFER_HEADER' END;
 IF r.action<>'MIGRATE_DOCUMENT' OR r.status<>'COMMITTED' OR r.target_type NOT IN ('SALES','TRANSFER')
  OR b.inventory_mode<>'DOCUMENT_CONVERSION' OR b.mapping_version<>'DOCUMENT_CONVERSION_V1' OR b.status NOT IN ('STAGED','VALIDATING','IMPORTED')
  OR r.result_data->>'batchId' IS DISTINCT FROM b.id::text OR s.import_batch_id<>b.id OR s.source_system<>b.source_name
  OR s.target_type IS DISTINCT FROM expected_type OR s.target_id IS DISTINCT FROM r.target_id OR s.status<>'IMPORTED'
  OR s.reviewed_at IS NULL OR s.source_entity_type IS DISTINCT FROM expected_type
  OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.old_version IS NOT NULL OR a.before_values IS NOT NULL
  OR a.new_version::text IS DISTINCT FROM h->>'version' OR r.result_data->>'version' IS DISTINCT FROM h->>'version'
  OR r.result_data->>'status' IS DISTINCT FROM h->>'status' OR r.result_data->'ledgerEntryIds'<>'[]'
  OR (a.after_values - ARRAY['baseline','sourceRecordId']) IS DISTINCT FROM snap
  OR a.after_values->>'sourceRecordId' IS DISTINCT FROM s.id::text OR r.result_data->'baseline' IS DISTINCT FROM evidence
  OR r.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
  OR h->>'stock_basis'<>'CUTOFF_HISTORY' OR baseline.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR baseline.status<>'IMPORTED'
  OR evidence->>'state' IS DISTINCT FROM 'CONFIRMED' OR evidence->>'baselineManifestSha256' IS DISTINCT FROM baseline.source_hash
  OR (evidence->>'cutoffAt')::timestamptz IS DISTINCT FROM baseline.cutoff_at OR b.cutoff_at IS DISTINCT FROM baseline.cutoff_at
  OR (evidence->>'coverageDigest' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (evidence - ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'])<>'{}' THEN
  RAISE EXCEPTION 'migration requires exact typed ordinary snapshot, source/baseline coverage, actor, version and audit' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=r.id) OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE last_operation_id=r.id) THEN
  RAISE EXCEPTION 'migration creates no inventory effects' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.assert_unified_current_actor(r.actor_account_id,r.completed_at,r.target_type,r.target_id,r.action);
 IF baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
  IF NOT naijue_erp.standard_import_row_intent(expected_type,CASE r.target_type WHEN 'SALES' THEN to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,h)) ELSE to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,h)) END) OR baseline.source_name<>b.source_name OR baseline.source_hash<>b.source_hash
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item CROSS JOIN LATERAL (
     SELECT (h->>'warehouse_id')::uuid warehouse WHERE r.target_type='SALES'
     UNION ALL SELECT (h->>'from_warehouse_id')::uuid WHERE r.target_type='TRANSFER'
     UNION ALL SELECT (h->>'to_warehouse_id')::uuid WHERE r.target_type='TRANSFER') endpoint
     WHERE h->>'status'='APPROVED' AND item->>'is_current'='true' AND (item->>'quantity')::bigint<>0
       AND naijue_erp.standard_inventory_key_proof(endpoint.warehouse,(item->>'sku_id')::uuid)->>'state'='UNKNOWN') THEN
   RAISE EXCEPTION 'STANDARD_MIGRATION_EXPLICIT_ENDPOINT_COVERAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 -- All actual detail identities are mapped once, including zero-quantity lines and
 -- every settlement occurrence; many-to-one SKU aliases remain legal separately.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'lines') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
   WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type=CASE r.target_type WHEN 'SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END
     AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))
  OR (r.target_type='SALES' AND EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'settlements') item WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_record m
    WHERE m.import_batch_id=b.id AND m.status='IMPORTED' AND m.target_type='SALES_SETTLEMENT' AND m.source_entity_type=m.target_type AND m.target_id=(item->>'id')::uuid))) THEN
  RAISE EXCEPTION 'migration requires complete stable detail/settlement source mappings' USING ERRCODE='23514'; END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."assert_document_migration"("operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assert_retained_sku_reference("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assert_retained_sku_reference"("target_sku" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE valid boolean;
BEGIN
  SELECT p.deleted_at IS NULL AND c.deleted_at IS NULL AND f.deleted_at IS NULL AND pc.deleted_at IS NULL INTO STRICT valid
    FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
    JOIN naijue_erp.product_category pc ON pc.id=p.category_id
    JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id
    WHERE s.id=target_sku FOR SHARE OF s,p,pc,c,f;
  IF NOT valid THEN RAISE EXCEPTION 'Deleted catalogue identity cannot authorize new usage' USING ERRCODE='23514'; END IF;
END $$;


ALTER FUNCTION "naijue_erp"."assert_retained_sku_reference"("target_sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assert_standard_import_operation("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assert_standard_import_operation"("operation" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 item jsonb; actual jsonb; expected jsonb; table_name text; kind text; before_cp jsonb; after_cp jsonb; keys text[]; field text;
 delta numeric; total numeric:=0; ids jsonb; claimed jsonb; account_staff uuid; row_count bigint;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
 IF a.after_values ? 'whole_package_v2' THEN
  PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);
  IF operation=(a.after_values->'whole_package_v2'->>'root_operation')::uuid THEN
   PERFORM naijue_erp.standard_whole_package_closed_v2(operation);
  END IF;
  b.checkpoint:=a.after_values->'checkpoint';b.status:=r.result_data->>'status';
 END IF;
 before_cp:=a.before_values; after_cp:=a.after_values->'checkpoint';
 IF r.target_type<>'IMPORT' OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR a.after_values->>'profile'<>'STANDARD_IMPORT_SQL_V1'
  OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.new_version::text IS DISTINCT FROM ((after_cp->>'sequence')::integer+1)::text
  OR after_cp IS DISTINCT FROM b.checkpoint OR r.result_data->>'sequence' IS DISTINCT FROM after_cp->>'sequence'
  OR r.result_data->>'cursor' IS DISTINCT FROM after_cp->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM b.status
  OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM b.id::text OR a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
  OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
  OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at THEN
  RAISE EXCEPTION 'STANDARD_OPERATION_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
  WHERE u.id=r.actor_account_id AND u.login_enabled AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
  RAISE EXCEPTION 'STANDARD_CURRENT_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' AND NOT(a.after_values ? 'whole_package_v2') THEN PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 ELSE PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER'); END IF;
 keys:=CASE WHEN b.inventory_mode='DOCUMENT_CONVERSION' THEN ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH']
  ELSE ARRAY['MASTER','INVENTORY_KEY','INVENTORY_EFFECT','NAMESPACE','IMPORT_BATCH'] END;
 IF (SELECT count(*) FROM jsonb_object_keys(after_cp->'counts'))<>cardinality(keys) OR (SELECT count(*) FROM jsonb_object_keys(after_cp->'expected'))<>cardinality(keys) THEN
  RAISE EXCEPTION 'STANDARD_COUNTER_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY keys LOOP
  IF jsonb_typeof(after_cp->'counts'->field) IS DISTINCT FROM 'number' OR jsonb_typeof(after_cp->'expected'->field) IS DISTINCT FROM 'number'
   OR (after_cp->'counts'->>field ~ '^[0-9]+$') IS DISTINCT FROM true OR (after_cp->'expected'->>field ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (after_cp->'counts'->>field)::numeric>(after_cp->'expected'->>field)::numeric THEN RAISE EXCEPTION 'STANDARD_COUNTER_RANGE_INVALID' USING ERRCODE='23514'; END IF;
  total:=total+(after_cp->'counts'->>field)::numeric;
  SELECT count(*) INTO row_count FROM jsonb_array_elements(a.after_values->'records') value WHERE
   CASE field WHEN 'MASTER' THEN value->>'target_type' NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')
    WHEN 'INVENTORY_EFFECT' THEN value->>'target_type'='INVENTORY_KEY' AND (value->'fields'->>'quantity')::bigint<>0
    WHEN 'NAMESPACE' THEN value->>'entity_type'='BATCH_NAMESPACE_BINDING'
    WHEN 'IMPORT_BATCH' THEN value->>'target_type'='IMPORT_BATCH' AND value->>'entity_type'<>'BATCH_NAMESPACE_BINDING'
    ELSE value->>'target_type'=field END;
  delta:=(after_cp->'counts'->>field)::numeric-coalesce((before_cp->'counts'->>field)::numeric,0);
  IF delta<>row_count THEN RAISE EXCEPTION 'STANDARD_EXACT_PROGRESS_DELTA_INVALID: %',field USING ERRCODE='23514'; END IF;
 END LOOP;
 IF total<>(after_cp->>'cursor')::numeric OR (before_cp IS NULL AND ((after_cp->>'sequence')::integer<>0 OR a.old_version IS NOT NULL))
  OR (before_cp IS NOT NULL AND ((after_cp->>'sequence')::numeric<>(before_cp->>'sequence')::numeric+1 OR a.old_version<>(before_cp->>'sequence')::integer+1 OR a.old_version IS NULL)) THEN
  RAISE EXCEPTION 'STANDARD_CHECKPOINT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.import_record WHERE id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(a.after_values->'records'));
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
 IF ids IS DISTINCT FROM claimed THEN RAISE EXCEPTION 'STANDARD_RECEIPT_SOURCE_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
  PERFORM naijue_erp.standard_import_record_proof((item->>'id')::uuid);
  kind:=item->>'target_type';table_name:=lower(kind COLLATE "C");
  IF kind='INVENTORY_KEY' THEN
   IF (item->'fields'->>'quantity')::bigint=0 THEN
    IF item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=b.id AND warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND sku_id=(item->'fields'->>'sku_id')::uuid) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_CANNOT_POST_LEDGER' USING ERRCODE='23514'; END IF;
    IF a.after_values ? 'whole_package_v2' AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q
      WHERE q.warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND q.sku_id=(item->'fields'->>'sku_id')::uuid
        AND q.quantity=0 AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_BALANCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.inventory_balance q ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    WHERE l.id=(item->>'ledger_entry_id')::uuid AND l.operation_id=r.id AND l.source_import_batch_id=b.id AND l.event_kind='CUTOFF_BASELINE'
      AND l.warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND l.sku_id=(item->'fields'->>'sku_id')::uuid AND l.quantity_delta=(item->'fields'->>'quantity')::bigint
      AND q.quantity=l.quantity_delta AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at) THEN
    RAISE EXCEPTION 'STANDARD_NONZERO_BASELINE_EFFECT_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF kind='IMPORT_BATCH' THEN
   IF item->>'target_id'<>b.id::text THEN RAISE EXCEPTION 'STANDARD_BATCH_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
    RAISE EXCEPTION 'STANDARD_TARGET_KIND_INVALID' USING ERRCODE='23514'; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(item->'fields'->>'size_group_id')::uuid AND size_id=(item->'fields'->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(item->'fields'->>'payment_account_id')::uuid AND hall_id=(item->'fields'->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='TRANSFER_LINE' THEN expected:=expected-'current_line_no';actual:=actual-'current_line_no'; END IF;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_TYPED_NATIVE_ROW_DIFFERS: %',kind USING ERRCODE='23514'; END IF;
   IF kind='HALL' AND expected->>'default_sales_warehouse_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=(expected->>'default_sales_warehouse_id')::uuid AND hall_id=(expected->>'id')::uuid) THEN RAISE EXCEPTION 'STANDARD_HALL_DEFAULT_OWNERSHIP_INVALID' USING ERRCODE='23514'; END IF;
   IF kind='PRODUCT_CATEGORY' AND EXISTS(WITH RECURSIVE ancestry AS (SELECT c.id,c.parent_id,ARRAY[c.id] visited,false cycle FROM naijue_erp.product_category c WHERE c.id=(expected->>'id')::uuid UNION ALL SELECT c.id,c.parent_id,ancestor_row.visited||c.id,c.id=ANY(ancestor_row.visited) FROM ancestry ancestor_row JOIN naijue_erp.product_category c ON c.id=ancestor_row.parent_id WHERE NOT ancestor_row.cycle) SELECT 1 FROM ancestry WHERE cycle) THEN RAISE EXCEPTION 'STANDARD_CATEGORY_CYCLE_DENIED' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.inventory_ledger WHERE operation_id=r.id;
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'ledgerEntryIds');
 IF ids IS DISTINCT FROM claimed OR (r.result_data->>'phase'<>'KEYS' AND ids<>'[]') THEN RAISE EXCEPTION 'STANDARD_EXACT_EFFECT_SET_INVALID' USING ERRCODE='23514'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' THEN
  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1
   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;
  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN
   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF b.status='IMPORTED' AND after_cp->'counts' IS DISTINCT FROM after_cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLISH_COUNTS_INCOMPLETE' USING ERRCODE='23514'; END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."assert_standard_import_operation"("operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assert_unified_current_actor("uuid", timestamp with time zone, "text", "uuid", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assert_unified_current_actor"("account" "uuid", "at_time" timestamp with time zone, "kind" "text", "target" "uuid", "command" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE actor record; h jsonb; target_hall uuid; target_from_hall uuid; target_to_hall uuid;
BEGIN
 SELECT a.id,s.id AS staff_id,s.role,s.hall_id INTO STRICT actor FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
  LEFT JOIN naijue_erp.hall hall ON hall.id=s.hall_id
  WHERE a.id=account AND a.login_enabled AND s.employment_status='在职' AND (s.hall_id IS NULL OR hall.enabled) FOR SHARE OF a,s;
 IF at_time IS NULL OR (command='MIGRATE_DOCUMENT' AND at_time IS DISTINCT FROM transaction_timestamp()) THEN
  RAISE EXCEPTION 'current command must carry actual transaction actor/time' USING ERRCODE='23514'; END IF;
 IF kind='SALES' THEN
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=target;
  target_hall:=(h->>'hall_id')::uuid;
  IF actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') OR (actor.role='SALESPERSON' AND (actor.hall_id IS NULL OR actor.hall_id IS DISTINCT FROM target_hall OR command='UNAPPROVE'
      OR (command='APPROVE' AND h->>'created_by_account_id' IS DISTINCT FROM account::text))) THEN
   RAISE EXCEPTION 'ordinary sales actor role/hall/unapprove scope denied' USING ERRCODE='42501'; END IF;
 ELSIF kind='TRANSFER' THEN
  SELECT to_jsonb(x),f.hall_id,t.hall_id INTO STRICT h,target_from_hall,target_to_hall
    FROM naijue_erp.transfer_header x JOIN naijue_erp.warehouse f ON f.id=x.from_warehouse_id JOIN naijue_erp.warehouse t ON t.id=x.to_warehouse_id WHERE x.id=target;
  IF actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') OR (actor.role='SALESPERSON' AND (actor.hall_id IS NULL OR
      (actor.hall_id IS DISTINCT FROM target_from_hall AND actor.hall_id IS DISTINCT FROM target_to_hall
       AND NOT coalesce((h->>'created_role'='SALESPERSON' AND h->>'created_hall_id'=actor.hall_id::text AND h->>'created_by_account_id' IS NOT NULL),false)))) THEN
   RAISE EXCEPTION 'ordinary transfer actor scope denied' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'ordinary document kind required' USING ERRCODE='23514'; END IF;
 IF command='MIGRATE_DOCUMENT' AND actor.role<>'ADMIN' THEN RAISE EXCEPTION 'document conversion requires current administrator' USING ERRCODE='42501'; END IF;
END $$;


ALTER FUNCTION "naijue_erp"."assert_unified_current_actor"("account" "uuid", "at_time" timestamp with time zone, "kind" "text", "target" "uuid", "command" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: assign_runtime_document_number(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."assign_runtime_document_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE identity_row record; hall_normal boolean; sequence_value text; candidate text;
BEGIN
  IF NEW.number IS NOT NULL OR NEW.allocated_at IS DISTINCT FROM transaction_timestamp()
    OR NEW.document_kind NOT IN ('SALES','TRANSFER') THEN
    RAISE EXCEPTION 'Document number must be assigned by the database' USING ERRCODE='23514';
  END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT identity_row
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF NOT identity_row.login_enabled OR identity_row.employment_status<>'在职'
    OR identity_row.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON')
    OR (identity_row.role='SALESPERSON' AND identity_row.hall_id IS NULL) THEN
    RAISE EXCEPTION 'Current account cannot allocate a document number' USING ERRCODE='23514';
  END IF;
  IF identity_row.hall_id IS NOT NULL THEN
    SELECT enabled INTO STRICT hall_normal FROM naijue_erp.hall WHERE id=identity_row.hall_id FOR SHARE;
    IF NOT hall_normal THEN RAISE EXCEPTION 'Current hall unavailable' USING ERRCODE='23514'; END IF;
  END IF;
  IF (NEW.document_kind='SALES' AND EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE id=NEW.document_id))
    OR (NEW.document_kind='TRANSFER' AND EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE id=NEW.document_id)) THEN
    RAISE EXCEPTION 'Cannot adopt an existing document into a new allocation' USING ERRCODE='23514';
  END IF;
  LOOP
    IF NEW.document_kind='SALES' THEN
      sequence_value:=nextval('naijue_erp.runtime_sales_document_number_seq'::regclass)::text;
      candidate:='V2-XS-'||lpad(sequence_value,greatest(12,length(sequence_value)),'0');
    ELSE
      sequence_value:=nextval('naijue_erp.runtime_transfer_document_number_seq'::regclass)::text;
      candidate:='V2-DB-'||lpad(sequence_value,greatest(12,length(sequence_value)),'0');
    END IF;
    -- An operator may have older manually numbered runtime rows. Skip only the
    -- actual collision, keeping every old number and the full sequence value.
    EXIT WHEN NOT EXISTS(SELECT 1 FROM naijue_erp.runtime_document_number_allocation WHERE number=candidate)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE stock_basis='RUNTIME_LEDGER' AND number=candidate)
      AND NOT EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE stock_basis='RUNTIME_LEDGER' AND number=candidate);
  END LOOP;
  NEW.number:=candidate; RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."assign_runtime_document_number"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: check_hall_default_customer_enabled(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."check_hall_default_customer_enabled"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE customer_enabled boolean;
BEGIN
  IF NEW.enabled AND NEW.default_customer_id IS NOT NULL THEN
    SELECT enabled INTO STRICT customer_enabled FROM naijue_erp.customer WHERE id = NEW.default_customer_id FOR SHARE;
    IF NOT customer_enabled THEN RAISE EXCEPTION 'enabled hall requires an enabled default customer' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."check_hall_default_customer_enabled"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: cutoff_import_lock(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."cutoff_import_lock"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:inventory-cutoff', 0));
$$;


ALTER FUNCTION "naijue_erp"."cutoff_import_lock"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: exact_historical_customer_source_matches("jsonb", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."exact_historical_customer_source_matches"("source" "jsonb", "native" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE pinned record; raw jsonb;
BEGIN
  SELECT * INTO pinned FROM (VALUES
    ('HIST-CUSTOMER:7d256f74-8a8b-d420-2749-a9ca70e21f9d','4278c80d-c380-1561-cfc4-3e1ee0dcfe5f'::uuid,'2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'1','a6f9b9d9548895debb47fc18c69833230e4d7fb49d384d2f18a351e09c792dc7','92f132ff61524e363d31b4ae4a44a1707f2fb40c7db9122756876438d1b50c57'),
    ('HIST-CUSTOMER:d315fc13-fee5-82ca-5716-83fe0e96d5c3','055e00fc-8309-b3d2-e71e-94f8a31c1626'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid,'2','c51d7bf8b1a87420b7d2cbc80fd8935a0f18f491963da31c7ce5f3ca58144fb6','19858e4e8dfb13864c22f9f3997134f4393f224527f68f5d4a3fd0dcbdce635e')) x(source_key,source_id,native_id,row_no,row_hash,raw_hash) WHERE source_key=source->>'source_key';
  IF NOT FOUND THEN RETURN false; END IF;
  raw:=source->'raw_fields';
  RETURN coalesce(source->>'entity_type'='CUSTOMER' AND source->>'id'=pinned.source_id::text
    AND source->>'file_ref'='dictionaries/historical-customers.json' AND source->>'sheet'='JSON_ARRAY_ITEMS'
    AND source->>'row_no'=pinned.row_no AND source->>'row_sha256'=pinned.row_hash
    AND source->>'source_file_sha256'='79305bfcb0545e5bc26601f839508be2b64a6637cd6fb1ef1819c6989fc38e65'
    AND source->'normalized_fields'=raw
    AND naijue_erp.history_closure_row_hash('HISTORICAL_CUSTOMER_SUPPLEMENT_V1',pinned.source_key,raw)=pinned.raw_hash
    AND raw->>'sourceKey'=pinned.source_key AND raw->>'originalPartyIdentity'=substr(pinned.source_key,15)
    AND raw->'historicalOnly'='true'::jsonb AND raw->'visibleInCurrentCustomerList'='false'::jsonb
    AND native=jsonb_build_object('id',pinned.native_id,'code',raw->'originalCode','name',raw->'originalName',
      'enabled',false,'version',1,'created_at',NULL,'updated_at',NULL),false);
END $$;


ALTER FUNCTION "naijue_erp"."exact_historical_customer_source_matches"("source" "jsonb", "native" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: freeze_cutoff_sales_detail(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."freeze_cutoff_sales_detail"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; owner_id uuid;
BEGIN
 IF TG_OP='DELETE' THEN owner_id:=OLD.sales_id; ELSE owner_id:=NEW.sales_id; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=owner_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.sales_id IS DISTINCT FROM OLD.sales_id) THEN
  RAISE EXCEPTION 'ordinary detail identity/owner cannot move' USING ERRCODE='23514'; END IF;
 IF h.status<>'DRAFT' AND NOT (TG_OP='INSERT' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=h.import_batch_id AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.status IN ('STAGED','VALIDATING'))) THEN
  RAISE EXCEPTION 'ordinary details may only change in draft SAVE, except exact initial conversion' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF TG_TABLE_NAME='sales_line' THEN RAISE EXCEPTION 'ordinary line identities are retained; deactivate lines rather than delete' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."freeze_cutoff_sales_detail"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: freeze_imported_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."freeze_imported_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE status = 'IMPORTED'
    AND target_type = CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' ELSE 'SKU' END AND target_id = OLD.id) THEN
    RAISE EXCEPTION 'imported formal identity is retained in frozen scope' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."freeze_imported_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_balance_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_balance_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'inventory balances are retained, including zero' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.warehouse_id, NEW.sku_id) IS DISTINCT FROM ROW(OLD.warehouse_id, OLD.sku_id) THEN
    RAISE EXCEPTION 'inventory balance identity is immutable' USING ERRCODE = '23514'; END IF;
  PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id, NEW.sku_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_balance_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_contributor_link(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_contributor_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE state text;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT status INTO STRICT state FROM naijue_erp.import_batch WHERE id = OLD.batch_id FOR UPDATE;
  IF state NOT IN ('STAGED','VALIDATING') OR OLD.baseline_ledger_id IS NOT NULL OR NEW.baseline_ledger_id IS NULL
    OR (to_jsonb(NEW) - 'baseline_ledger_id') IS DISTINCT FROM (to_jsonb(OLD) - 'baseline_ledger_id') THEN
    RAISE EXCEPTION 'only initial staged baseline attachment is allowed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_contributor_link"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_cutoff_ledger(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_cutoff_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  -- ORDINARY_KNOWN_BALANCE_guard_cutoff_ledger_BEGIN
  IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
    PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id,NEW.sku_id);
    IF NEW.event_kind NOT IN ('APPROVE','UNAPPROVE') OR naijue_erp.standard_business_ready() IS DISTINCT FROM true
       OR NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance balance_row WHERE balance_row.warehouse_id=NEW.warehouse_id AND balance_row.sku_id=NEW.sku_id) THEN
      RAISE EXCEPTION 'STANDARD_CURRENT_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  -- ORDINARY_KNOWN_BALANCE_guard_cutoff_ledger_END
  IF NEW.event_kind='CUTOFF_BASELINE' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER'); PERFORM naijue_erp.cutoff_import_lock(); PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id,NEW.sku_id);
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id FOR UPDATE;
    IF b.status NOT IN ('STAGED','VALIDATING') OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id) THEN RAISE EXCEPTION 'STANDARD_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id, NEW.sku_id);
  IF NEW.event_kind = 'CUTOFF_BASELINE' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.source_import_batch_id FOR UPDATE;
    IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED')
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'WAREHOUSE' AND target_id = NEW.warehouse_id)
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'SKU' AND target_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'baseline requires owned complete identities and a previously unused key' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
    RAISE EXCEPTION 'inventory scope is not published' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_cutoff_ledger"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_exact_historical_customer_current_usage(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='customer' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.id IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid)
        AND NOT naijue_erp.is_native_party_import_insert('CUSTOMER',to_jsonb(NEW)) THEN
        RAISE EXCEPTION 'Pinned historical customer identity only permits exact original source creation' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
    target:=OLD.id;
    IF naijue_erp.is_exact_historical_customer_only(target) THEN
      RAISE EXCEPTION 'Original historical-only customer cannot be maintained or restored' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='hall' THEN target:=NEW.default_customer_id;
  ELSIF TG_TABLE_NAME='sales_header' THEN target:=NEW.customer_id;
  ELSE RAISE EXCEPTION 'Unsupported current historical-customer guard' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME<>'customer' AND naijue_erp.is_exact_historical_customer_only(target) THEN
    RAISE EXCEPTION 'Historical-only customer cannot be used by current business' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_header_native_reference_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_header_native_reference_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_header_native_reference_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_history_numeric_ledger(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_history_numeric_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.event_kind='HISTORY_REVISION' OR NEW.source_history_revision_id IS NOT NULL
    OR NEW.source_history_sales_line_id IS NOT NULL OR NEW.source_history_transfer_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_LEDGER_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native ledger identity, quantity, source, receipt and effect validators remain attached.
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_history_numeric_ledger"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_history_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_history_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE kind text; actual bigint;
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$_$;


ALTER FUNCTION "naijue_erp"."guard_history_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_history_typed_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_history_typed_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE m record;plan jsonb;documents jsonb;
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_history_typed_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_import_accounting_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_import_accounting_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE kind text; actual bigint;
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_import_accounting_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_import_batch(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_import_batch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    IF TG_OP='DELETE' OR NEW.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
      IF NEW.status<>'STAGED' OR NEW.checkpoint->>'sequence' IS DISTINCT FROM '0' OR NEW.checkpoint->>'cursor' IS DISTINCT FROM '0' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch) THEN RAISE EXCEPTION 'STANDARD_BASELINE_MUST_START_EMPTY_ZERO' USING ERRCODE='23514'; END IF;
    ELSE
      PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
      IF OLD.status IN ('IMPORTED','FAILED') OR (to_jsonb(NEW)-ARRAY['checkpoint','status','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkpoint','status','completed_at'])
       OR NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' OR (NEW.checkpoint->>'sequence')::numeric<>(OLD.checkpoint->>'sequence')::numeric+1
       OR (NEW.checkpoint->>'cursor')::numeric<(OLD.checkpoint->>'cursor')::numeric OR NEW.status NOT IN ('VALIDATING','IMPORTED') THEN RAISE EXCEPTION 'STANDARD_BASELINE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false); RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'import batch is retained' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'STAGED' OR NEW.checkpoint->>'sequence' <> '0' OR NEW.checkpoint->>'cursor' <> '0'
      OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
      RAISE EXCEPTION 'import must start staged at a stable zero checkpoint' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status IN ('IMPORTED', 'FAILED') OR ROW(NEW.id, NEW.source_name, NEW.source_manifest_ref, NEW.source_hash, NEW.cutoff_at, NEW.mapping_version, NEW.inventory_mode, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.source_name, OLD.source_manifest_ref, OLD.source_hash, OLD.cutoff_at, OLD.mapping_version, OLD.inventory_mode, OLD.created_at)
      OR (NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' AND NOT (OLD.history_payload_hash IS NULL AND OLD.history_expected_counts IS NULL AND OLD.checkpoint->'expected'='{}'::jsonb AND NEW.history_payload_hash IS NOT NULL AND NEW.history_expected_counts IS NOT NULL AND NEW.status='STAGED'))
      OR (NEW.checkpoint->>'sequence')::bigint <> (OLD.checkpoint->>'sequence')::bigint + 1
      OR (NEW.checkpoint->>'cursor')::bigint < (OLD.checkpoint->>'cursor')::bigint THEN
      RAISE EXCEPTION 'immutable source or invalid checkpoint transition' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'IMPORTED' THEN PERFORM naijue_erp.validate_import_publish(NEW.id, NEW.checkpoint); END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_import_batch"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_import_record(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_import_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.status NOT IN ('STAGED','VALIDATING') OR NEW.status<>'IMPORTED' OR NEW.source_system IS DISTINCT FROM b.source_name OR NEW.reviewed_at IS DISTINCT FROM transaction_timestamp()
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
       CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
       WHERE a.operation_id=(NEW.decision_reason::jsonb->>'operationId')::uuid AND a.object_type='IMPORT' AND a.object_id=b.id AND a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
        AND a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND r.actor_account_id=a.actor_account_id AND r.completed_at=NEW.reviewed_at
        AND item->>'id'=NEW.id::text AND item->>'entity_type'=NEW.source_entity_type AND item->>'source_key'=NEW.source_key AND item->>'target_type'=NEW.target_type
        AND item->>'target_id'=NEW.target_id::text AND item->>'source_hash'=NEW.source_record_hash AND item->>'file_ref'=NEW.source_file_ref) THEN
      RAISE EXCEPTION 'STANDARD_SOURCE_PREPARED_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='DOCUMENT_CONVERSION') THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.mapping_version<>'DOCUMENT_CONVERSION_V1' OR b.status NOT IN ('STAGED','VALIDATING') OR NEW.source_system<>b.source_name
      OR NEW.target_type NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH')
      OR NEW.status NOT IN ('IMPORTED','EXCLUDED') OR (NEW.status='IMPORTED' AND NEW.reviewed_at IS NULL)
      OR (NEW.status='EXCLUDED' AND (NEW.target_id IS NOT NULL OR coalesce(length(btrim(NEW.decision_reason)),0)=0)) THEN
      RAISE EXCEPTION 'closed standard conversion identity/decision scope mismatch' USING ERRCODE='23514'; END IF;
    IF NEW.status='IMPORTED' THEN
      IF NEW.target_type='SALES_HEADER' THEN PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_LINE' THEN PERFORM 1 FROM naijue_erp.sales_line x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_SETTLEMENT' THEN PERFORM 1 FROM naijue_erp.sales_settlement x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_HEADER' THEN PERFORM 1 FROM naijue_erp.transfer_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_LINE' THEN PERFORM 1 FROM naijue_erp.transfer_line x JOIN naijue_erp.transfer_header h ON h.id=x.transfer_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id=NEW.target_id AND id=b.id;
      END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'ordinary conversion target identity/owner does not exist' USING ERRCODE='23503'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.import_batch_id FOR UPDATE;
  IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
    RAISE EXCEPTION 'import source scope is frozen' USING ERRCODE = '23514'; END IF;
  -- Cross-batch identity is the fixed namespace + source category + ORIGINAL key, never a filename.
  PERFORM naijue_erp.import_source_key_lock(b.source_name, NEW.source_entity_type, NEW.source_key);
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record r JOIN naijue_erp.import_batch prior ON prior.id = r.import_batch_id
    WHERE prior.source_name = b.source_name AND r.source_entity_type = NEW.source_entity_type AND r.source_key = NEW.source_key) THEN
    RAISE EXCEPTION 'source identity already has an immutable destination; resume original batch' USING ERRCODE = '23505';
  END IF;
  IF NEW.status = 'IMPORTED' THEN
    IF NEW.target_type = 'WAREHOUSE' THEN PERFORM 1 FROM naijue_erp.warehouse WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'SKU' THEN PERFORM 1 FROM naijue_erp.sku WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id = NEW.target_id AND id = b.id;
    ELSIF NEW.target_type = 'INVENTORY_LEDGER' THEN RETURN NEW; -- Reciprocal baseline/source check is deferred below.
    ELSE RAISE EXCEPTION 'unsupported import target' USING ERRCODE = '23514'; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'import target identity does not exist' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_import_record"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_maintenance_account_event(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_maintenance_account_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE audit naijue_erp.audit_change%ROWTYPE; previous jsonb; following jsonb;
BEGIN
  SELECT * INTO audit FROM naijue_erp.audit_change a WHERE a.object_type='STAFF' AND a.object_id=NEW.staff_id
    AND naijue_erp.maintenance_audit_is_current(a.operation_id)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'accounts') x(v) WHERE v->>'id'=NEW.id::text AND v->'version'=to_jsonb(NEW.version));
  IF FOUND THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='ACCOUNT' AND object_id=NEW.id AND new_version=NEW.version) THEN
      RAISE EXCEPTION 'Linked account cannot be claimed by a second operation' USING ERRCODE='23514';
    END IF;
    previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    SELECT value INTO following FROM jsonb_array_elements(audit.after_values->'accounts') WHERE value->>'id'=NEW.id::text;
    IF NOT naijue_erp.maintenance_complete_row_matches(following,to_jsonb(NEW)-'password_hash')
      OR (TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.before_values->'accounts') x(v)
        WHERE naijue_erp.maintenance_complete_row_matches(v,previous-'password_hash'))) THEN
      RAISE EXCEPTION 'Actual linked account event differs from exact prepared safe evidence' USING ERRCODE='23514';
    END IF;
    PERFORM naijue_erp.maintenance_check_account_credential(audit,previous,to_jsonb(NEW));
  ELSE
    SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type='ACCOUNT' AND object_id=NEW.id AND new_version=NEW.version;
    IF FOUND THEN
      IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id) THEN
        RAISE EXCEPTION 'Account audit must be prepared in this original transaction' USING ERRCODE='23514';
      END IF;
      PERFORM naijue_erp.maintenance_check_account_credential(audit,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
    ELSIF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
      IF TG_OP='UPDATE' THEN
        IF to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at']=to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at']
          AND NEW.password_hash IS DISTINCT FROM OLD.password_hash
          AND NEW.password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
          AND NEW.auth_version::bigint=OLD.auth_version::bigint+1 AND NEW.version::bigint=OLD.version::bigint+1 THEN RETURN NEW; END IF;
      END IF;
      RAISE EXCEPTION 'Prepare original account or staff audit before account mutation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $_$;


ALTER FUNCTION "naijue_erp"."guard_maintenance_account_event"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_maintenance_audit_actor(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_maintenance_audit_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE actor record;
BEGIN
  IF naijue_erp.maintenance_root_table(NEW.object_type) IS NULL THEN RETURN NEW; END IF;
  IF NEW.object_type IN ('STAFF','ACCOUNT','HALL') THEN PERFORM naijue_erp.maintenance_administrator_mutex(); END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO actor
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual current maintenance actor required' USING ERRCODE='42501'; END IF;
  IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职'
    OR NOT (actor.role='ADMIN' OR (actor.role='WAREHOUSE' AND NEW.object_type NOT IN ('STAFF','ACCOUNT'))
      OR (actor.role='SALESPERSON' AND actor.hall_id IS NOT NULL AND NEW.object_type='PRODUCT' AND NEW.action='EDIT'
        AND NEW.old_version IS NOT NULL AND NEW.new_version=NEW.old_version+1
        AND NEW.before_values=(jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb) || CASE WHEN NEW.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
        AND jsonb_typeof(NEW.after_values)='object' AND NEW.after_values-ARRAY['version','skus','barcodes']='{}'::jsonb
        AND NEW.after_values->'version'=to_jsonb(NEW.new_version) AND jsonb_typeof(NEW.after_values->'skus')='array')) THEN
    RAISE EXCEPTION 'Current actor cannot authorize this maintenance family' USING ERRCODE='42501';
  END IF;
  IF actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall is unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_maintenance_audit_actor"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_maintenance_before_root(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_maintenance_before_root"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE family text; audit naijue_erp.audit_change%ROWTYPE; actual jsonb; before_accounts jsonb; after_accounts jsonb; item jsonb; following jsonb;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' WHEN 'staff' THEN 'STAFF' END;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  IF NOT FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Prepare original root audit before aggregate mutation' USING ERRCODE='23514';
    RETURN NEW;
  END IF;
  IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id) THEN
    RAISE EXCEPTION 'Prepared root audit must belong to this original transaction' USING ERRCODE='23514';
  END IF;
  IF family='PRODUCT' THEN PERFORM naijue_erp.maintenance_check_product_children(audit,true);
  ELSIF family='PAYMENT_ACCOUNT' AND (audit.before_values ? 'payment_halls' OR audit.after_values ? 'payment_halls') THEN
    actual:=naijue_erp.maintenance_payment_halls(NEW.id);
    IF (TG_OP='INSERT' AND actual<>'[]'::jsonb) OR (TG_OP='UPDATE' AND NOT naijue_erp.maintenance_exact_rows_match(audit.before_values->'payment_halls',actual,'hall_id'))
      OR jsonb_typeof(audit.after_values->'payment_halls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Payment hall before evidence must equal the complete actual relation set' USING ERRCODE='23514';
    END IF;
  ELSIF family='STAFF' THEN
    PERFORM naijue_erp.maintenance_check_staff_accounts(audit,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),true);
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_maintenance_before_root"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_maintenance_child_write(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_maintenance_child_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE family text; child_kind text; root_id uuid; root_version integer; row_before jsonb; row_after jsonb;
  audit naijue_erp.audit_change%ROWTYPE; before_item jsonb; after_item jsonb;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NEW; END IF;
  row_before:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  row_after:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='payment_account_hall' THEN
    family:='PAYMENT_ACCOUNT'; child_kind:='payment_halls'; root_id:=(coalesce(row_after,row_before)->>'payment_account_id')::uuid;
    SELECT version INTO STRICT root_version FROM naijue_erp.payment_account WHERE id=root_id;
    IF TG_OP='UPDATE' AND row_before IS DISTINCT FROM row_after THEN
      RAISE EXCEPTION 'Payment hall relation identities require explicit delete/insert' USING ERRCODE='23514';
    END IF;
  ELSE
    family:='PRODUCT'; child_kind:=CASE TG_TABLE_NAME WHEN 'sku' THEN 'skus' WHEN 'sku_barcode' THEN 'barcodes' WHEN 'product_image' THEN 'images' END;
    IF child_kind IS NULL THEN RAISE EXCEPTION 'Unsupported child relation' USING ERRCODE='23514'; END IF;
    IF child_kind='barcodes' THEN SELECT product_id INTO STRICT root_id FROM naijue_erp.sku WHERE id=(coalesce(row_after,row_before)->>'sku_id')::uuid;
    ELSE root_id:=(coalesce(row_after,row_before)->>'product_id')::uuid; END IF;
    SELECT version INTO STRICT root_version FROM naijue_erp.product WHERE id=root_id;
    IF TG_OP='DELETE' AND child_kind<>'images' THEN RAISE EXCEPTION 'SKU and barcode identity must be retained' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=root_id AND new_version=root_version;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF audit.operation_id IS NULL OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR jsonb_typeof(audit.after_values->child_kind) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Every child mutation requires the same prepared current root operation' USING ERRCODE='23514';
  END IF;
  IF child_kind='payment_halls' THEN
    IF row_before IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.before_values->child_kind) x(v) WHERE v=row_before)
      OR row_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v=row_after) THEN
      RAISE EXCEPTION 'Payment relation event is outside complete prepared before/after sets' USING ERRCODE='23514';
    END IF;
  ELSE
    IF row_before IS NOT NULL THEN
      SELECT value INTO before_item FROM jsonb_array_elements(audit.before_values->child_kind) WHERE value->>'id'=row_before->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(before_item,row_before) THEN
        RAISE EXCEPTION 'Actual original child differs from before evidence' USING ERRCODE='23514';
      END IF;
    END IF;
    IF row_after IS NOT NULL THEN
      SELECT value INTO after_item FROM jsonb_array_elements(audit.after_values->child_kind) WHERE value->>'id'=row_after->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(after_item,row_after) THEN
        RAISE EXCEPTION 'Actual new child differs from after evidence' USING ERRCODE='23514';
      END IF;
    ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v->>'id'=row_before->>'id') THEN
      -- Proposed only: retain logical image identity while materializing an exact
      -- already-prepared final mapping; no temporary fake image row is permitted.
      SELECT value INTO STRICT after_item FROM jsonb_array_elements(audit.after_values->child_kind)
        WHERE value->>'id'=row_before->>'id';
      IF (child_kind='images' AND jsonb_typeof(after_item)='object'
        AND after_item->'id'=before_item->'id' AND after_item->'product_id'=before_item->'product_id'
        AND after_item->>'product_id'=root_id::text
        AND after_item->'created_at'=before_item->'created_at'
        AND after_item->'created_by_account_id'=before_item->'created_by_account_id'
        AND jsonb_typeof(before_item->'version')='number' AND jsonb_typeof(after_item->'version')='number'
        AND before_item->>'version' ~ '^[1-9][0-9]*$' AND after_item->>'version' ~ '^[1-9][0-9]*$'
        AND (after_item->>'version')::bigint=(before_item->>'version')::bigint+1) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Removed child cannot remain in after evidence except exact prepared image identity replacement' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."guard_maintenance_child_write"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_native_catalogue_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_native_catalogue_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_native_catalogue_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_native_creation_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_native_creation_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; family text;
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN
    IF NEW.created_operation_id IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF; RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id THEN
      RAISE EXCEPTION 'Retained native identity cannot acquire or replace a creation operation' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='sku' THEN
      IF ROW(NEW.product_id,NEW.color_id,NEW.fit_id,NEW.size_id,NEW.sku_code)
        IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id,OLD.size_id,OLD.sku_code) THEN
        RAISE EXCEPTION 'Retained SKU coordinates and code cannot be rebound' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_operation_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
      RAISE EXCEPTION 'Post-cutoff native creation requires its original audited operation' USING ERRCODE='23514';
    END IF;
    -- Preserve source-owned initial import INSERT guards, not a zero/adoption lane.
    RETURN NEW;
  END IF;
  IF NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    RAISE EXCEPTION 'Runtime creation must start at version1 after cutoff publication' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT audit FROM naijue_erp.audit_change WHERE operation_id=NEW.created_operation_id;
  family:=CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' WHEN 'sku' THEN 'PRODUCT' END;
  IF audit.object_type IS DISTINCT FROM family OR audit.action NOT IN ('CREATE','EDIT')
    OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
      LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=audit.actor_account_id AND a.login_enabled
      AND s.employment_status='在职' AND (s.role IN ('ADMIN','WAREHOUSE')
        OR (TG_TABLE_NAME='sku' AND s.role='SALESPERSON' AND s.hall_id IS NOT NULL AND h.enabled
          AND audit.object_type='PRODUCT' AND audit.action='EDIT'
          AND audit.before_values=(jsonb_build_object('version',audit.old_version,'skus','[]'::jsonb) || CASE WHEN audit.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
          AND audit.after_values-ARRAY['version','skus','barcodes']='{}'::jsonb
          AND audit.after_values->'version'=to_jsonb(audit.new_version) AND jsonb_typeof(audit.after_values->'skus')='array'))
      AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'Native creation requires current trusted maintenance authority and same-transaction prepared audit' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='warehouse' THEN
    IF audit.object_id<>NEW.id OR audit.action<>'CREATE' THEN
      RAISE EXCEPTION 'Warehouse creation operation targets another root' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='sku' THEN
    IF audit.object_id<>NEW.product_id THEN
      RAISE EXCEPTION 'SKU creation operation targets another product' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_native_creation_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_native_payment_publication(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_native_payment_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_native_payment_publication"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_product_image_color(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_product_image_color"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.image_role='COLOR' AND NOT EXISTS(SELECT 1 FROM naijue_erp.sku
    WHERE product_id=NEW.product_id AND color_id=NEW.color_id) THEN
    RAISE EXCEPTION 'Color image must use an actual color of this product' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_product_image_color"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_product_season_selection(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_product_season_selection"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE found_count bigint; audit naijue_erp.audit_change%ROWTYPE;
BEGIN
  IF NOT naijue_erp.valid_product_season_ids(NEW.season_ids) THEN
    RAISE EXCEPTION 'Canonical one-dimensional distinct season identities required' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.season_id IS DISTINCT FROM OLD.season_id THEN
      RAISE EXCEPTION 'Original scalar season is retained provenance' USING ERRCODE='23514';
    END IF;
    IF OLD.season_ids IS NOT NULL AND NEW.season_ids IS NULL THEN
      RAISE EXCEPTION 'Known season selection cannot become unknown' USING ERRCODE='23514';
    END IF;
    IF NEW.season_ids IS NOT DISTINCT FROM OLD.season_ids THEN RETURN NEW; END IF;
  END IF;
  -- The reviewed host is READ COMMITTED. A historical transaction snapshot
  -- cannot safely implement this array's cross-row reference check; fail closed.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Season reference mutation requires a current read-committed snapshot' USING ERRCODE='25000';
  END IF;
  SELECT count(*) INTO found_count FROM (
    SELECT id FROM naijue_erp.season WHERE id=ANY(NEW.season_ids) ORDER BY id FOR KEY SHARE
  ) locked;
  IF found_count<>coalesce(cardinality(NEW.season_ids),0) THEN
    RAISE EXCEPTION 'Every selected season must be an actual dictionary identity' USING ERRCODE='23503';
  END IF;
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent('PRODUCT',to_jsonb(NEW)) THEN RETURN NEW; END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type='PRODUCT' AND object_id=NEW.id AND new_version=NEW.version;
  IF FOUND THEN
    IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
      OR (TG_OP='INSERT' AND (NEW.season_ids IS NULL OR NEW.season_id IS NOT NULL))
      OR NOT naijue_erp.maintenance_evidence_matches(audit.after_values->'season_ids',coalesce(to_jsonb(NEW.season_ids),'null'::jsonb)) THEN
      RAISE EXCEPTION 'Season selection must belong to the same prepared product root' USING ERRCODE='23514';
    END IF;
    IF TG_OP='UPDATE' AND NOT naijue_erp.maintenance_evidence_matches(audit.before_values->'season_ids',coalesce(to_jsonb(OLD.season_ids),'null'::jsonb)) THEN
      RAISE EXCEPTION 'Original season selection evidence differs' USING ERRCODE='23514';
    END IF;
  ELSIF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    RAISE EXCEPTION 'Published season changes require original product maintenance evidence' USING ERRCODE='23514';
  END IF;
  -- Unpublished source conversion remains subject to the original source/binding
  -- guards. This migration supplies no bypass, mapping, default or backfill.
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_product_season_selection"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_recorded_live_balance_pair(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_recorded_live_balance_pair"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE current_quantity bigint;
BEGIN
  -- ORDINARY_KNOWN_BALANCE_guard_recorded_live_balance_pair_BEGIN
  IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
    IF NEW.event_kind NOT IN ('APPROVE','UNAPPROVE') OR naijue_erp.standard_business_ready() IS DISTINCT FROM true
      OR NEW.quantity_before IS NULL OR NEW.quantity_after IS NULL THEN
      RAISE EXCEPTION 'STANDARD_CURRENT_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT b.quantity INTO current_quantity FROM naijue_erp.inventory_balance b
      WHERE b.warehouse_id=NEW.warehouse_id AND b.sku_id=NEW.sku_id;
    IF NOT FOUND OR NEW.quantity_before IS DISTINCT FROM current_quantity THEN
      RAISE EXCEPTION 'STANDARD_CURRENT_BALANCE_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  -- ORDINARY_KNOWN_BALANCE_guard_recorded_live_balance_pair_END
  IF NEW.event_kind='UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1')
   AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
   AND naijue_erp.standard_inventory_key_proof(NEW.warehouse_id,NEW.sku_id)->>'state' IS DISTINCT FROM 'EXPLICIT_ZERO' THEN
    RAISE EXCEPTION 'STANDARD_BASELINE_REVERSAL_ABSENCE_IS_NOT_ZERO' USING ERRCODE='23514'; END IF;
  IF NEW.event_kind NOT IN ('APPROVE','UNAPPROVE') THEN
    IF NEW.quantity_before IS NOT NULL OR NEW.quantity_after IS NOT NULL THEN
      RAISE EXCEPTION 'Historical revision and baseline balances remain unrecorded' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.quantity_before IS NULL OR NEW.quantity_after IS NULL THEN
    RAISE EXCEPTION 'New native live ledger requires both recorded balances' USING ERRCODE='23514'; END IF;
  -- Alphabetically after original cutoff/validate_* guards. They and the original
  -- app already own this inventory key/current balance. No new or inverted lock.
  SELECT quantity INTO current_quantity FROM naijue_erp.inventory_balance
    WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  IF FOUND THEN
    IF NEW.quantity_before IS DISTINCT FROM current_quantity THEN
      RAISE EXCEPTION 'Recorded before differs from original current locked balance' USING ERRCODE='23514'; END IF;
  ELSE
    -- Absence itself is not zero authority. Original native-source coverage and
    -- deferred sparse INSERT publication/receipt/audit checks remain mandatory.
    IF (NEW.event_kind<>'APPROVE' AND NEW.baseline_anchor_operation_id IS NULL) OR NEW.reverses_entry_id IS NOT NULL OR NEW.quantity_before<>0
      OR naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id,NEW.sku_id) IS DISTINCT FROM true
      OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id)
    THEN RAISE EXCEPTION 'Only original proven first approval may record zero before' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_recorded_live_balance_pair"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_referenced_season_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_referenced_season_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.id IS NOT DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Season identity mutation requires a current read-committed snapshot' USING ERRCODE='25000';
  END IF;
  -- DELETE/id UPDATE already holds the season row lock which conflicts with the
  -- product's KEY SHARE. This fresh volatile query includes retained/deleted products.
  IF EXISTS(SELECT 1 FROM naijue_erp.product WHERE season_ids @> ARRAY[OLD.id]::uuid[]) THEN
    RAISE EXCEPTION 'Referenced season identity must be retained' USING ERRCODE='23503';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;


ALTER FUNCTION "naijue_erp"."guard_referenced_season_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_retained_catalogue_delete(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_retained_catalogue_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retained catalogue identity cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'New catalogue identity cannot start deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Deleted catalogue identity cannot be restored or changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_retained_catalogue_delete"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_retained_catalogue_reference(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE valid boolean;
BEGIN
  IF TG_TABLE_NAME='product' THEN
    IF TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      SELECT deleted_at IS NULL INTO STRICT valid FROM naijue_erp.product_category WHERE id=NEW.category_id FOR SHARE;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted category cannot be selected' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='product_category' THEN
    IF NEW.parent_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
      SELECT deleted_at IS NULL INTO STRICT valid FROM naijue_erp.product_category WHERE id=NEW.parent_id FOR SHARE;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted parent category cannot be selected' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='sku' THEN
    IF TG_OP='INSERT' OR ROW(NEW.product_id,NEW.color_id,NEW.fit_id) IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id)
      OR (NOT OLD.enabled AND NEW.enabled) THEN
      SELECT p.deleted_at IS NULL AND pc.deleted_at IS NULL AND c.deleted_at IS NULL AND f.deleted_at IS NULL INTO STRICT valid
        FROM naijue_erp.product p JOIN naijue_erp.product_category pc ON pc.id=p.category_id
        CROSS JOIN naijue_erp.color c CROSS JOIN naijue_erp.fit f
        WHERE p.id=NEW.product_id AND c.id=NEW.color_id AND f.id=NEW.fit_id FOR SHARE OF p,pc,c,f;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted catalogue identity cannot be selected by SKU' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('sales_line','transfer_line') THEN
    IF TG_OP='INSERT' OR NEW.sku_id IS DISTINCT FROM OLD.sku_id OR (NOT OLD.is_current AND NEW.is_current) THEN
      PERFORM naijue_erp.assert_retained_sku_reference(NEW.sku_id);
    END IF;
  ELSIF TG_TABLE_NAME='inventory_ledger' THEN
    IF NEW.event_kind='APPROVE' THEN PERFORM naijue_erp.assert_retained_sku_reference(NEW.sku_id); END IF;
  ELSE RAISE EXCEPTION 'Unsupported retained reference guard' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_retained_catalogue_reference"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_retained_settlement_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_retained_settlement_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 -- INSERT ... ON CONFLICT UPDATE runs this guard before conflict resolution.
 -- Lock the canonical owner first, as ordinary DELETE/UPDATE do, so a concurrent
 -- deletion cannot turn an allowed existing-row UPSERT into retired-ID reuse.
 PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.sales_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'settlement canonical sales owner must exist' USING ERRCODE='23503'; END IF;
 -- Runtime identity retention is a business audit concern, not a source map read.
 IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id)
   AND EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
     WHERE a.object_type='SALES' AND r.target_type='SALES' AND r.target_id=a.object_id
       AND r.status='COMMITTED' AND r.action=a.action AND r.actor_account_id=a.actor_account_id
       AND r.completed_at=a.occurred_at AND EXISTS(
         SELECT 1 FROM jsonb_array_elements(coalesce(a.before_values->'settlements','[]'::jsonb)
           ||coalesce(a.after_values->'settlements','[]'::jsonb)) item WHERE item->>'id'=NEW.id::text)) THEN
   RAISE EXCEPTION 'retired ordinary settlement identity cannot be recycled' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 -- Import-only predecessor source checks remain unchanged.
 -- A source-bound existing row may be updated through the common SAVE path;
 -- the owner, exact before/after and same-transaction audit guards remain.
 -- A removed occurrence survives in immutable audit and cannot be resurrected.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record retained_record
   WHERE retained_record.target_type='SALES_SETTLEMENT' AND retained_record.target_id=NEW.id AND retained_record.status IN ('ACCEPTED','IMPORTED')
    AND (retained_record.xmin::text::bigint IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      OR naijue_erp.standard_import_row_intent('SALES_SETTLEMENT',to_jsonb(NEW)) IS DISTINCT FROM true))
   AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id) THEN
  RAISE EXCEPTION 'retired source settlement identity cannot be recycled' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_retained_settlement_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_runtime_document_number(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_runtime_document_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE kind text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.number IS DISTINCT FROM OLD.number THEN
      RAISE EXCEPTION 'A saved document number is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stock_basis<>'RUNTIME_LEDGER' THEN RETURN NEW; END IF;
  kind:=CASE TG_TABLE_NAME WHEN 'sales_header' THEN 'SALES' WHEN 'transfer_header' THEN 'TRANSFER' END;
  IF kind IS NULL OR NOT EXISTS(SELECT 1 FROM naijue_erp.runtime_document_number_allocation a
    WHERE a.document_kind=kind AND a.document_id=NEW.id AND a.number=NEW.number AND a.actor_account_id=NEW.created_by_account_id) THEN
    RAISE EXCEPTION 'New runtime document requires its original database allocation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_runtime_document_number"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_successor_publication26(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_successor_publication26"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE original_source record; target uuid; matched bigint;
BEGIN

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."guard_successor_publication26"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_unified_document(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_unified_document"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD); immutable text[];
BEGIN
 IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') AND NOT naijue_erp.standard_business_ready()
   AND NOT(TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW))) THEN
  RAISE EXCEPTION 'STANDARD_DOCUMENT_PUBLICATION_REQUIRED_FOR_ALL_COMMANDS' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ordinary document identity and audit linkage are retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.import_batch_id IS NULL THEN
   SELECT staff_id INTO STRICT NEW.created_by_staff_id FROM naijue_erp.user_account WHERE id=NEW.created_by_account_id;
   IF NEW.stock_basis<>'RUNTIME_LEDGER' OR NEW.version<>1 OR NEW.status<>'DRAFT' OR NEW.created_by_account_id IS NULL OR NEW.created_at IS NULL OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'new ordinary document requires actual version1 draft creator/time' USING ERRCODE='23514'; END IF;
  ELSIF NEW.stock_basis<>'CUTOFF_HISTORY' OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id
       AND inventory_mode='DOCUMENT_CONVERSION' AND mapping_version='DOCUMENT_CONVERSION_V1' AND status IN ('STAGED','VALIDATING')) THEN
   RAISE EXCEPTION 'imported ordinary document requires its closed standard conversion batch' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.import_batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=OLD.import_batch_id AND inventory_mode='DOCUMENT_CONVERSION' AND status='IMPORTED') THEN
   RAISE EXCEPTION 'unpublished converted ordinary documents cannot accept commands' USING ERRCODE='23514'; END IF;
  IF NEW.status='APPROVED' THEN
   SELECT staff_id INTO STRICT NEW.approved_by_staff_id FROM naijue_erp.user_account WHERE id=NEW.approved_by_account_id;
  ELSE NEW.approved_by_staff_id:=NULL; END IF;
  immutable:=ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at'];
  IF TG_TABLE_NAME='transfer_header' THEN immutable:=array_append(immutable,'created_role'); END IF;
  IF EXISTS(SELECT 1 FROM unnest(immutable) key WHERE n->key IS DISTINCT FROM o->key)
    OR NEW.version::bigint<>OLD.version::bigint+1 OR OLD.status='VOID'
    OR (OLD.status='APPROVED' AND NEW.status<>'DRAFT') THEN
   RAISE EXCEPTION 'ordinary document immutable origin, status or version mismatch' USING ERRCODE='23514'; END IF;
  IF NOT(OLD.status='DRAFT' AND NEW.status='DRAFT') AND (n-ARRAY['status','version','updated_at','approved_by_account_id','approved_by_staff_id','approved_at'])
       IS DISTINCT FROM (o-ARRAY['status','version','updated_at','approved_by_account_id','approved_by_staff_id','approved_at']) THEN
   RAISE EXCEPTION 'posting actions cannot edit ordinary business facts' USING ERRCODE='23514'; END IF;
  IF n->'responsible_staff_id' IS DISTINCT FROM o->'responsible_staff_id' AND (OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR n->>'responsible_staff_id' IS NULL) THEN
   RAISE EXCEPTION 'responsibility changes require actual staff on draft SAVE' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_unified_document"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: guard_unified_sales_customer_reference(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."guard_unified_sales_customer_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 PERFORM 1 FROM naijue_erp.customer WHERE id=NEW.customer_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ordinary sales requires an existing canonical customer' USING ERRCODE='23503'; END IF;
 IF TG_OP='UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id AND (OLD.status<>'DRAFT' OR NEW.status<>'DRAFT') THEN
  RAISE EXCEPTION 'customer reference changes require ordinary draft SAVE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."guard_unified_sales_customer_reference"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_count_map("jsonb", "text"[]); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_count_map"("value" "jsonb", "expected_keys" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE field record;n numeric;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR expected_keys IS NULL
  OR array_position(expected_keys,NULL) IS NOT NULL
  OR cardinality(expected_keys)<>(SELECT count(DISTINCT k) FROM unnest(expected_keys) k) THEN RETURN false;END IF;
 IF NOT(value ?& expected_keys AND value-expected_keys='{}'::jsonb) THEN RETURN false;END IF;
 FOR field IN SELECT e.value FROM jsonb_each(value) e LOOP
  IF jsonb_typeof(field.value) IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  n:=(field.value#>>'{}')::numeric;IF n<>trunc(n) OR n<0 OR n>2147483645 THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_count_map"("value" "jsonb", "expected_keys" "text"[]) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_encode("jsonb", integer); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_encode"("value" "jsonb", "depth" integer DEFAULT 0) RETURNS "bytea"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE kind text; result bytea; item jsonb; k text; n numeric; raw text; bytes bytea;
BEGIN
 IF value IS NULL OR depth IS NULL OR depth<0 OR depth>64 THEN
  RAISE EXCEPTION 'invalid bounded history closure value' USING ERRCODE='23514'; END IF;
 kind:=jsonb_typeof(value);
 IF kind='null' THEN result:=convert_to('n','UTF8');
 ELSIF kind='boolean' THEN result:=convert_to(CASE WHEN value='true'::jsonb THEN 't' ELSE 'f' END,'UTF8');
 ELSIF kind='string' THEN
  raw:=value#>>'{}'; bytes:=convert_to(raw,'UTF8');
  IF octet_length(bytes)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  result:=convert_to('s'||octet_length(bytes)::text||':','UTF8')||bytes;
 ELSIF kind='number' THEN
  n:=(value#>>'{}')::numeric;
  IF n<>trunc(n) OR abs(n)>9007199254740991 THEN
   RAISE EXCEPTION 'history closure numbers must be safe integers' USING ERRCODE='23514'; END IF;
  result:=convert_to('i'||trunc(n)::text||';','UTF8');
 ELSIF kind='array' THEN
  result:=convert_to('a'||jsonb_array_length(value)::text||':','UTF8');
  FOR item IN SELECT e.value FROM jsonb_array_elements(value) WITH ORDINALITY e(value,ordinal) ORDER BY ordinal LOOP
   result:=result||naijue_erp.history_closure_encode(item,depth+1);
   IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSIF kind='object' THEN
  SELECT count(*)::text INTO raw FROM jsonb_object_keys(value);
  result:=convert_to('o'||raw||':','UTF8');
  FOR k,item IN SELECT e.key,e.value FROM jsonb_each(value) e ORDER BY convert_to(e.key,'UTF8') LOOP
   result:=result||naijue_erp.history_closure_encode(to_jsonb(k),depth+1)||naijue_erp.history_closure_encode(item,depth+1);
   IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSE RAISE EXCEPTION 'unsupported history closure scalar' USING ERRCODE='23514';
 END IF;
 IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
 RETURN result;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_encode"("value" "jsonb", "depth" integer) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_finish("text", bigint, "bytea"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_finish"("scope" "text", "row_count" bigint, "state" "bytea") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 PERFORM naijue_erp.history_closure_seed(scope);
 IF row_count IS NULL OR row_count<0 OR row_count>2147483645 OR state IS NULL OR octet_length(state)<>32 THEN
  RAISE EXCEPTION 'history closure exact bounded stream final required' USING ERRCODE='23514'; END IF;
 RETURN encode(sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_FINAL_V1',scope,row_count,encode(state,'hex')))),'hex');
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_finish"("scope" "text", "row_count" bigint, "state" "bytea") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_fold("bytea", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_fold"("state" "bytea", "row_hash" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
BEGIN
 IF state IS NULL OR octet_length(state)<>32 OR row_hash IS NULL OR row_hash!~'^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'history closure exact SHA state required' USING ERRCODE='23514'; END IF;
 RETURN sha256(decode('01','hex')||state||decode(row_hash,'hex'));
END;
$_$;


ALTER FUNCTION "naijue_erp"."history_closure_fold"("state" "bytea", "row_hash" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_projection("text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_projection"("relation_name" "text", "original" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE cols text[];allowed text[];result jsonb;
BEGIN
 cols:=naijue_erp.history_closure_projection_columns(relation_name);allowed:=cols;
 IF relation_name='native_party_import_evidence' THEN allowed:=cols||ARRAY['creation_xid','imported_at']; END IF;
 IF relation_name='payment_method_identity' THEN allowed:=cols||ARRAY['name','enabled','version']; END IF;
 IF relation_name='payment_account_identity' THEN allowed:=cols||ARRAY['name','payment_method_id','enabled','version']; END IF;
 IF (jsonb_typeof(original)='object' AND original ?& cols AND original-allowed='{}'::jsonb) IS DISTINCT FROM TRUE THEN
 RAISE EXCEPTION 'closure full explicit column shape required' USING ERRCODE='23514'; END IF;
 CASE relation_name
 WHEN 'import_source_row' THEN result:=jsonb_build_object('id',original->'id','batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','file_ref',original->'file_ref','sheet',original->'sheet','row_no',to_jsonb((original->>'row_no')::bigint::text),'source_file_sha256',original->'source_file_sha256','row_sha256',original->'row_sha256','raw_fields',original->'raw_fields','normalized_fields',original->'normalized_fields','field_provenance',original->'field_provenance');
 WHEN 'history_sales_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'business_type',original->'business_type','hall_id',original->'hall_id','customer_id',original->'customer_id','warehouse_id',original->'warehouse_id','salesperson_id',original->'salesperson_id','gross_amount',to_jsonb((original->>'gross_amount')::numeric(18,2)::text),'order_discount',to_jsonb((original->>'order_discount')::numeric(18,2)::text),'net_due',to_jsonb((original->>'net_due')::numeric(18,2)::text));
 WHEN 'history_transfer_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'from_warehouse_id',original->'from_warehouse_id','to_warehouse_id',original->'to_warehouse_id','created_role_source',original->'created_role_source');
 WHEN 'history_sales_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot','reference_price',to_jsonb((original->>'reference_price')::numeric(18,2)::text),'deal_price',to_jsonb((original->>'deal_price')::numeric(18,2)::text),'line_amount',to_jsonb((original->>'line_amount')::numeric(18,2)::text),'allocated_discount',to_jsonb((original->>'allocated_discount')::numeric(18,2)::text),'is_gift',original->'is_gift','pricing_method_source',original->'pricing_method_source','discount_tenths',original->'discount_tenths','ordinary_zero_confirmed',original->'ordinary_zero_confirmed');
 WHEN 'history_transfer_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot');
 WHEN 'history_sales_settlement' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','payment_account_id',original->'payment_account_id','direction',original->'direction','amount',to_jsonb((original->>'amount')::numeric(18,2)::text),'account_name_snapshot',original->'account_name_snapshot','method_name_snapshot',original->'method_name_snapshot','payment_method_id_snapshot',original->'payment_method_id_snapshot');
 WHEN 'import_sku_alias' THEN result:=jsonb_build_object('batch_id',original->'batch_id','old_source_sku_id',original->'old_source_sku_id','canonical_sku_id',original->'canonical_sku_id','source_row_id',original->'source_row_id','canonical_source_key',original->'canonical_source_key','mapping_basis',original->'mapping_basis');
 WHEN 'import_stock_contributor' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','warehouse_id',original->'warehouse_id','canonical_sku_id',original->'canonical_sku_id','old_source_sku_id',original->'old_source_sku_id','canonical_stock_source_key',original->'canonical_stock_source_key','source_unit',original->'source_unit','signed_quantity',to_jsonb((original->>'signed_quantity')::bigint::text),'baseline_ledger_id',original->'baseline_ledger_id');
 WHEN 'import_header_native_reference' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_staff_id',original->'native_staff_id','native_version',original->'native_version','native_snapshot',original->'native_snapshot','validator_version',original->'validator_version');
 WHEN 'native_party_import_evidence' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','entity_type',original->'entity_type','source_key',original->'source_key','native_id',original->'native_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_supplier_id',original->'native_supplier_id','native_staff_id',original->'native_staff_id','native_warehouse_id',original->'native_warehouse_id','warehouse_record',original->'warehouse_record','native_snapshot',original->'native_snapshot','source_snapshot',original->'source_snapshot','selection',original->'selection','authorization',original->'authorization','row_fingerprint',original->'row_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_catalogue_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','category_id',original->'category_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','size_group_id',original->'size_group_id','season_id',original->'season_id','member_group_id',original->'member_group_id','member_size_id',original->'member_size_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_payment_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_payment_method_id',original->'native_payment_method_id','native_payment_account_id',original->'native_payment_account_id','native_hall_id',original->'native_hall_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'product' THEN result:=jsonb_build_object('id',original->'id','product_code',original->'product_code','name',original->'name','category_id',original->'category_id','supplier_id',original->'supplier_id','season_id',original->'season_id','size_group_id',original->'size_group_id','retail_price',to_jsonb((original->>'retail_price')::numeric(18,2)::text),'enabled',original->'enabled','version',original->'version','year',original->'year','system_item_code',original->'system_item_code','thickness',original->'thickness','collar_pants_type',original->'collar_pants_type','purchase_price',to_jsonb((original->>'purchase_price')::numeric(18,2)::text),'wholesale5_price',to_jsonb((original->>'wholesale5_price')::numeric(18,2)::text),'wholesale6_price',to_jsonb((original->>'wholesale6_price')::numeric(18,2)::text),'wholesale7_price',to_jsonb((original->>'wholesale7_price')::numeric(18,2)::text),'wholesale8_price',to_jsonb((original->>'wholesale8_price')::numeric(18,2)::text),'wholesale9_price',to_jsonb((original->>'wholesale9_price')::numeric(18,2)::text),'wholesale10_price',to_jsonb((original->>'wholesale10_price')::numeric(18,2)::text),'minimum_price',to_jsonb((original->>'minimum_price')::numeric(18,2)::text),'season_ids',original->'season_ids','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'default_barcode_scheme_id',original->'default_barcode_scheme_id');
 WHEN 'sku' THEN result:=jsonb_build_object('id',original->'id','product_id',original->'product_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','sku_code',original->'sku_code','enabled',original->'enabled','version',original->'version','created_operation_id',original->'created_operation_id');
 WHEN 'hall' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','default_customer_id',original->'default_customer_id','default_sales_warehouse_id',original->'default_sales_warehouse_id','enabled',original->'enabled','version',original->'version');
 WHEN 'warehouse' THEN result:=jsonb_build_object('id',original->'id','hall_id',original->'hall_id','name',original->'name','enabled',original->'enabled','version',original->'version','created_operation_id',original->'created_operation_id');
 WHEN 'customer' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'supplier' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'staff' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','hall_id',original->'hall_id','role',original->'role','contact',original->'contact','employment_status',original->'employment_status','version',original->'version');
 WHEN 'product_category' THEN result:=jsonb_build_object('id',original->'id','parent_id',original->'parent_id','name',original->'name','display_order',original->'display_order','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'color' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'fit' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'size' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group_member' THEN result:=jsonb_build_object('size_group_id',original->'size_group_id','size_id',original->'size_id','display_order',original->'display_order');
 WHEN 'season' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','display_order',original->'display_order');
 WHEN 'sku_barcode' THEN result:=jsonb_build_object('id',original->'id','barcode',original->'barcode','sku_id',original->'sku_id','barcode_kind',original->'barcode_kind','scheme_id',original->'scheme_id','enabled',original->'enabled');
 WHEN 'barcode_scheme' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','barcode_type',original->'barcode_type','rule_description',original->'rule_description','code_length',original->'code_length','rule_version',original->'rule_version','status',original->'status');
 WHEN 'payment_method_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_hall' THEN result:=jsonb_build_object('payment_account_id',original->'payment_account_id','hall_id',original->'hall_id');
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
 PERFORM naijue_erp.history_closure_encode(result); RETURN result;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_projection"("relation_name" "text", "original" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_projection_columns("text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_projection_columns"("relation_name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 CASE relation_name
 WHEN 'import_source_row' THEN RETURN ARRAY['id','batch_id','entity_type','source_key','file_ref','sheet','row_no','source_file_sha256','row_sha256','raw_fields','normalized_fields','field_provenance'];
 WHEN 'history_sales_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','business_type','hall_id','customer_id','warehouse_id','salesperson_id','gross_amount','order_discount','net_due'];
 WHEN 'history_transfer_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','from_warehouse_id','to_warehouse_id','created_role_source'];
 WHEN 'history_sales_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot','reference_price','deal_price','line_amount','allocated_discount','is_gift','pricing_method_source','discount_tenths','ordinary_zero_confirmed'];
 WHEN 'history_transfer_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot'];
 WHEN 'history_sales_settlement' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','payment_account_id','direction','amount','account_name_snapshot','method_name_snapshot','payment_method_id_snapshot'];
 WHEN 'import_sku_alias' THEN RETURN ARRAY['batch_id','old_source_sku_id','canonical_sku_id','source_row_id','canonical_source_key','mapping_basis'];
 WHEN 'import_stock_contributor' THEN RETURN ARRAY['batch_id','source_row_id','warehouse_id','canonical_sku_id','old_source_sku_id','canonical_stock_source_key','source_unit','signed_quantity','baseline_ledger_id'];
 WHEN 'import_header_native_reference' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_hall_id','native_customer_id','native_staff_id','native_version','native_snapshot','validator_version'];
 WHEN 'native_party_import_evidence' THEN RETURN ARRAY['batch_id','source_row_id','entity_type','source_key','native_id','native_hall_id','native_customer_id','native_supplier_id','native_staff_id','native_warehouse_id','warehouse_record','native_snapshot','source_snapshot','selection','authorization','row_fingerprint','validator_version'];
 WHEN 'import_native_catalogue_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','category_id','color_id','fit_id','size_id','size_group_id','season_id','member_group_id','member_size_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'import_native_payment_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_payment_method_id','native_payment_account_id','native_hall_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'product' THEN RETURN ARRAY['id','product_code','name','category_id','supplier_id','season_id','size_group_id','retail_price','enabled','version','year','system_item_code','thickness','collar_pants_type','purchase_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price','season_ids','deleted_at','default_barcode_scheme_id'];
 WHEN 'sku' THEN RETURN ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id'];
 WHEN 'hall' THEN RETURN ARRAY['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'];
 WHEN 'warehouse' THEN RETURN ARRAY['id','hall_id','name','enabled','version','created_operation_id'];
 WHEN 'customer' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'supplier' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'staff' THEN RETURN ARRAY['id','name','hall_id','role','contact','employment_status','version'];
 WHEN 'product_category' THEN RETURN ARRAY['id','parent_id','name','display_order','version','deleted_at'];
 WHEN 'color' THEN RETURN ARRAY['id','code','name','enabled','version','deleted_at'];
 WHEN 'fit' THEN RETURN ARRAY['id','code','name','enabled','version','deleted_at'];
 WHEN 'size' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group_member' THEN RETURN ARRAY['size_group_id','size_id','display_order'];
 WHEN 'season' THEN RETURN ARRAY['id','code','name','display_order'];
 WHEN 'sku_barcode' THEN RETURN ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled'];
 WHEN 'barcode_scheme' THEN RETURN ARRAY['id','name','barcode_type','rule_description','code_length','rule_version','status'];
 WHEN 'payment_method_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_hall' THEN RETURN ARRAY['payment_account_id','hall_id'];
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_projection_columns"("relation_name" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_projection_key("text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_projection_key"("relation_name" "text", "projection" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 CASE relation_name
 WHEN 'import_source_row' THEN RETURN projection->>'id';
 WHEN 'history_sales_header' THEN RETURN projection->>'id';
 WHEN 'history_transfer_header' THEN RETURN projection->>'id';
 WHEN 'history_sales_line' THEN RETURN projection->>'id';
 WHEN 'history_transfer_line' THEN RETURN projection->>'id';
 WHEN 'history_sales_settlement' THEN RETURN projection->>'id';
 WHEN 'import_sku_alias' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'old_source_sku_id')),'hex');
 WHEN 'import_stock_contributor' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'source_row_id')),'hex');
 WHEN 'import_header_native_reference' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'native_party_import_evidence' THEN RETURN projection->>'source_row_id';
 WHEN 'import_native_catalogue_binding' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'import_native_payment_binding' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'product' THEN RETURN projection->>'id';
 WHEN 'sku' THEN RETURN projection->>'id';
 WHEN 'hall' THEN RETURN projection->>'id';
 WHEN 'warehouse' THEN RETURN projection->>'id';
 WHEN 'customer' THEN RETURN projection->>'id';
 WHEN 'supplier' THEN RETURN projection->>'id';
 WHEN 'staff' THEN RETURN projection->>'id';
 WHEN 'product_category' THEN RETURN projection->>'id';
 WHEN 'color' THEN RETURN projection->>'id';
 WHEN 'fit' THEN RETURN projection->>'id';
 WHEN 'size' THEN RETURN projection->>'id';
 WHEN 'size_group' THEN RETURN projection->>'id';
 WHEN 'size_group_member' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'size_group_id',projection->'size_id')),'hex');
 WHEN 'season' THEN RETURN projection->>'id';
 WHEN 'sku_barcode' THEN RETURN projection->>'id';
 WHEN 'barcode_scheme' THEN RETURN projection->>'id';
 WHEN 'payment_method_identity' THEN RETURN projection->>'id';
 WHEN 'payment_account_identity' THEN RETURN projection->>'id';
 WHEN 'payment_account_hall' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'payment_account_id',projection->'hall_id')),'hex');
 ELSE RAISE EXCEPTION 'unknown closure relation key' USING ERRCODE='23514'; END CASE;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_projection_key"("relation_name" "text", "projection" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_row_hash("text", "text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_row_hash"("relation_name" "text", "row_key" "text", "projection" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 IF relation_name IS NULL OR row_key IS NULL OR octet_length(convert_to(relation_name,'UTF8')) NOT BETWEEN 1 AND 65536
   OR octet_length(convert_to(row_key,'UTF8')) NOT BETWEEN 1 AND 65536 OR projection IS NULL THEN
  RAISE EXCEPTION 'history closure exact row identity required' USING ERRCODE='23514'; END IF;
 RETURN encode(sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_ROW_V1',relation_name,row_key,projection))),'hex');
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_row_hash"("relation_name" "text", "row_key" "text", "projection" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_closure_seed("text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_closure_seed"("scope" "text") RETURNS "bytea"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 IF scope IS NULL OR octet_length(convert_to(scope,'UTF8')) NOT BETWEEN 1 AND 65536 THEN
  RAISE EXCEPTION 'history closure stream scope required' USING ERRCODE='23514'; END IF;
 RETURN sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_V1',scope)));
END;
$$;


ALTER FUNCTION "naijue_erp"."history_closure_seed"("scope" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_numeric_ledger_set_guard(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_numeric_ledger_set_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM history_new WHERE event_kind='HISTORY_REVISION'
    OR source_history_revision_id IS NOT NULL OR source_history_sales_line_id IS NOT NULL
    OR source_history_transfer_line_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_LEDGER_SET_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Checking the entire transition set also rejects mixed native/historical statements.
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."history_numeric_ledger_set_guard"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: history_numeric_money("jsonb", boolean); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."history_numeric_money"("value" "jsonb", "nonnegative" boolean DEFAULT false) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE amount text;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact original money string required' USING ERRCODE='23514'; END IF;
  amount:=value #>> '{}';
  IF amount !~ '^-?(0|[1-9][0-9]{0,15})\.[0-9]{2}$' OR amount='-0.00' OR (nonnegative AND amount LIKE '-%') THEN
    RAISE EXCEPTION 'Exact bounded yuan amount required' USING ERRCODE='23514'; END IF;
  RETURN amount::numeric(18,2);
END $_$;


ALTER FUNCTION "naijue_erp"."history_numeric_money"("value" "jsonb", "nonnegative" boolean) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: import_source_key_lock("text", "text", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."import_source_key_lock"("source_namespace" "text", "source_entity" "text", "original_key" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:import-source:' || jsonb_build_array(source_namespace, source_entity, original_key)::text, 0));
$$;


ALTER FUNCTION "naijue_erp"."import_source_key_lock"("source_namespace" "text", "source_entity" "text", "original_key" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: inventory_key_admission("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."inventory_key_admission"("warehouse" "uuid", "sku" "uuid") RETURNS TABLE("admitted" boolean, "published_batch_id" "uuid", "warehouse_basis" "text", "sku_basis" "text", "warehouse_created_operation_id" "uuid", "sku_created_operation_id" "uuid")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE batches uuid[]; batch naijue_erp.import_batch%ROWTYPE; valid_sku boolean;
BEGIN
  admitted:=false; published_batch_id:=NULL; warehouse_basis:=NULL; sku_basis:=NULL;
  warehouse_created_operation_id:=NULL; sku_created_operation_id:=NULL;
  SELECT array_agg(id ORDER BY id) INTO batches FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE';
  IF coalesce(cardinality(batches),0)<>1 THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO STRICT batch FROM naijue_erp.import_batch WHERE id=batches[1];
  IF batch.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
    published_batch_id:=batch.id;
    IF NOT naijue_erp.standard_business_ready() THEN RETURN NEXT; RETURN; END IF;
    SELECT w.created_operation_id INTO warehouse_created_operation_id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=warehouse;
    IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
    SELECT s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)
     INTO sku_created_operation_id,valid_sku FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id WHERE s.id=sku;
    IF NOT FOUND OR NOT valid_sku THEN RETURN NEXT; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch.id AND s.target_type='WAREHOUSE' AND s.target_id=warehouse) THEN warehouse_basis:='CUTOFF_MEMBER';
    ELSIF naijue_erp.native_creation_operation_valid('WAREHOUSE',warehouse,warehouse_created_operation_id) THEN warehouse_basis:='POST_CUTOFF_CREATED'; END IF;
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch.id AND s.target_type='SKU' AND s.target_id=sku) THEN sku_basis:='CUTOFF_MEMBER';
    ELSIF naijue_erp.native_creation_operation_valid('SKU',sku,sku_created_operation_id) THEN sku_basis:='POST_CUTOFF_CREATED'; END IF;
    admitted:=warehouse_basis IS NOT NULL AND sku_basis IS NOT NULL AND (naijue_erp.standard_inventory_key_proof(warehouse,sku)->>'state'<>'UNKNOWN' OR warehouse_basis='POST_CUTOFF_CREATED' OR sku_basis='POST_CUTOFF_CREATED');
    RETURN NEXT; RETURN;
  END IF;
  IF batch.completed_at IS NULL OR (batch.checkpoint->>'sequence')::bigint<=0
    OR batch.checkpoint->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR batch.checkpoint->'counts' IS DISTINCT FROM batch.checkpoint->'expected'
    OR (batch.checkpoint->>'cursor')::numeric IS DISTINCT FROM (batch.checkpoint->'counts'->>'WAREHOUSE')::numeric
      +(batch.checkpoint->'counts'->>'SKU')::numeric+(batch.checkpoint->'counts'->>'INVENTORY_LEDGER')::numeric+(batch.checkpoint->'counts'->>'IMPORT_BATCH')::numeric
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED'
      AND r.target_type='IMPORT_BATCH' AND r.target_id=batch.id AND r.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND r.source_key='FINAL_COMPLETE_SCOPE'
      AND r.decision_reason='COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND r.source_record_hash=batch.source_hash AND r.source_file_ref=batch.source_manifest_ref) THEN RETURN NEXT; RETURN; END IF;
  published_batch_id:=batch.id;
  SELECT w.created_operation_id INTO warehouse_created_operation_id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=warehouse;
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  SELECT s.created_operation_id,EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)
    INTO sku_created_operation_id,valid_sku FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
    JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id WHERE s.id=sku;
  IF NOT FOUND OR NOT valid_sku THEN RETURN NEXT; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=warehouse) THEN
    warehouse_basis:='CUTOFF_MEMBER';
  ELSIF naijue_erp.native_creation_operation_valid('WAREHOUSE',warehouse,warehouse_created_operation_id) THEN warehouse_basis:='POST_CUTOFF_CREATED'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=batch.id AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=sku) THEN
    sku_basis:='CUTOFF_MEMBER';
  ELSIF naijue_erp.native_creation_operation_valid('SKU',sku,sku_created_operation_id) THEN sku_basis:='POST_CUTOFF_CREATED'; END IF;
  admitted:=warehouse_basis IS NOT NULL AND sku_basis IS NOT NULL;
  RETURN NEXT;
END $$;


ALTER FUNCTION "naijue_erp"."inventory_key_admission"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: inventory_key_lock("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."inventory_key_lock"("warehouse" "uuid", "sku" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:inventory:' || warehouse::text || ':' || sku::text, 0));
$$;


ALTER FUNCTION "naijue_erp"."inventory_key_lock"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: inventory_runtime_key_admitted("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."inventory_runtime_key_admitted"("warehouse" "uuid", "sku" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT admitted FROM naijue_erp.inventory_key_admission(warehouse,sku) $$;


ALTER FUNCTION "naijue_erp"."inventory_runtime_key_admitted"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: is_exact_historical_customer_only("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."is_exact_historical_customer_only"("target" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE source_id uuid; matches bigint; proof jsonb;
BEGIN
 IF target IS NULL OR target NOT IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid) THEN RETURN false; END IF;
 -- These retained IDs are never silently promoted. On a fresh target they
 -- must have a complete standard source/receipt/audit proof, or fail closed.
 SELECT count(*),min(s.id::text)::uuid INTO matches,source_id
 FROM naijue_erp.import_record s JOIN naijue_erp.import_batch b ON b.id=s.import_batch_id
 WHERE s.target_type='CUSTOMER' AND s.source_entity_type='CUSTOMER' AND s.target_id=target
   AND s.status='IMPORTED' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   AND b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.status IN ('STAGED','VALIDATING','IMPORTED');
 IF matches IS DISTINCT FROM 1 THEN
   RAISE EXCEPTION 'FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_REQUIRED' USING ERRCODE='23514';
 END IF;
 proof:=naijue_erp.standard_import_record_proof(source_id);
 IF proof->>'target_type' IS DISTINCT FROM 'CUSTOMER' OR proof->>'entity_type' IS DISTINCT FROM 'CUSTOMER'
   OR proof->>'target_id' IS DISTINCT FROM target::text OR proof->'fields'->>'id' IS DISTINCT FROM target::text
   OR jsonb_typeof(proof->'source_refs') IS DISTINCT FROM 'array'
   OR jsonb_array_length(proof->'source_refs')<1 THEN
   RAISE EXCEPTION 'FRESH27_PINNED_CUSTOMER_STANDARD_PROOF_INVALID' USING ERRCODE='23514';
 END IF;
 RETURN false;
END;
$$;


ALTER FUNCTION "naijue_erp"."is_exact_historical_customer_only"("target" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: is_native_party_import_insert("text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."is_native_party_import_insert"("kind" "text", "snapshot" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
 -- STANDARD27_BRANCH_BEGIN
 IF current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (EXISTS(SELECT 1 FROM jsonb_array_elements(after_values->'records') exact_item WHERE exact_item->>'target_type'=kind AND exact_item->>'target_id'=snapshot->>'id')));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values ? 'whole_package_v2' THEN b.status:=r.result_data->>'status'; END IF;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

    IF kind IS NULL OR kind NOT IN ('CUSTOMER','SUPPLIER') OR phase_name IS DISTINCT FROM 'MASTER'
      OR b.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      OR b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR b.status NOT IN ('STAGED','VALIDATING')
      OR snapshot->'version' IS DISTINCT FROM '1'::jsonb THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
    SELECT count(*) INTO intent_count FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF intent_count<>1 THEN RAISE EXCEPTION 'STANDARD27_PARTY_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF item->>'entity_type' IS DISTINCT FROM kind OR item->'fields'->>'id' IS DISTINCT FROM snapshot->>'id'
      OR coalesce(length(item->>'source_key'),0)=0 OR coalesce(length(btrim(item->>'file_ref')),0)=0
      OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'source_refs')<1
      OR item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object(
        'source_key',item->>'source_key','fields',item->'fields','source_refs',item->'source_refs')::text,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    IF kind='CUSTOMER' THEN expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.customer,item->'fields'));
    ELSE expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.supplier,item->'fields')); END IF;
    IF expected IS DISTINCT FROM snapshot OR naijue_erp.standard_import_row_intent(kind,snapshot) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_ROW_INVALID' USING ERRCODE='23514'; END IF;
    RETURN true;
 END IF;
 -- A nonstandard caller cannot borrow a retained standard identity as legacy
 -- evidence. Return false (not an exception) so an UPDATE caller evaluating
 -- its INSERT predicate eagerly still reaches its unchanged runtime checks.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE target_type=kind AND target_id::text=snapshot->>'id'
   AND decision_reason LIKE '%STANDARD_IMPORT_POINTER_V1%') THEN RETURN false; END IF;
 -- STANDARD27_BRANCH_END
 -- Fresh-only: no legacy creation intent can authorize an ordinary INSERT.
 -- False runs the caller's original live receipt/actor/time checks.
 RETURN false;
END;
$$;


ALTER FUNCTION "naijue_erp"."is_native_party_import_insert"("kind" "text", "snapshot" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: keep_barcode_binding_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."keep_barcode_binding_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'raw barcode bindings are retained; disable rather than delete' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.barcode IS DISTINCT FROM OLD.barcode OR NEW.sku_id IS DISTINCT FROM OLD.sku_id THEN
    RAISE EXCEPTION 'raw barcode identity and canonical SKU binding cannot be rewritten' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."keep_barcode_binding_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: keep_party_native_identity(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."keep_party_native_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND naijue_erp.is_native_party_import_insert(
    CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, to_jsonb(NEW)) THEN
    -- Same code lock as live CREATE. No sequence, generated code or runtime actor is used.
    PERFORM pg_advisory_xact_lock(hashtextextended('naijue:party-code:' ||
      CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, 0));
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'retained customer/supplier cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF length(btrim(NEW.code)) = 0 OR length(btrim(NEW.name)) = 0 OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'new runtime party values cannot be empty or undated' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Serialize any explicit native insert with generation too. Existing codes are never
    -- changed to resolve collisions: the native table's own UNIQUE(code) still decides.
    PERFORM pg_advisory_xact_lock(hashtextextended('naijue:party-code:' ||
      CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, 0));
    IF NEW.version <> 1 OR NOT NEW.enabled OR NEW.created_at IS NULL OR NEW.created_at IS DISTINCT FROM NEW.updated_at THEN
      RAISE EXCEPTION 'new runtime party starts enabled at version one and actual creation time' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF ROW(NEW.id, NEW.code, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.code, OLD.created_at) THEN
      RAISE EXCEPTION 'party identity original code and creation time are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version::bigint <> OLD.version::bigint + 1 THEN RAISE EXCEPTION 'party version must advance exactly once' USING ERRCODE = '23514'; END IF;
    IF TG_TABLE_NAME = 'customer' AND OLD.enabled AND NOT NEW.enabled
      AND EXISTS (SELECT 1 FROM naijue_erp.hall WHERE enabled AND default_customer_id = NEW.id) THEN
      RAISE EXCEPTION 'enabled hall still uses this default customer' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."keep_party_native_identity"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: keep_sales_line_owner(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."keep_sales_line_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.sales_id <> OLD.sales_id THEN
    RAISE EXCEPTION 'retained sales line cannot move between documents' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."keep_sales_line_owner"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: keep_transfer_header_provenance(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."keep_transfer_header_provenance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'retained transfer header cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.stock_basis <> 'RUNTIME_LEDGER' THEN
    RAISE EXCEPTION 'historical transfer writes are not enabled' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'runtime transfer must start as version one draft' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR OLD.stock_basis <> 'RUNTIME_LEDGER'
      OR ROW(NEW.created_by_account_id, NEW.created_hall_id, NEW.created_role, NEW.created_at, NEW.stock_basis)
        IS DISTINCT FROM ROW(OLD.created_by_account_id, OLD.created_hall_id, OLD.created_role, OLD.created_at, OLD.stock_basis) THEN
      RAISE EXCEPTION 'immutable transfer identity or creator provenance' USING ERRCODE = '23514';
    END IF;
    IF NEW.version::bigint <> OLD.version::bigint + 1 OR OLD.status = 'VOID'
      OR (OLD.status = 'APPROVED' AND NEW.status <> 'DRAFT') THEN
      RAISE EXCEPTION 'invalid transfer version or state transition' USING ERRCODE = '23514';
    END IF;
    IF NOT (OLD.status = 'DRAFT' AND NEW.status = 'DRAFT')
      AND ROW(NEW.number, NEW.business_date, NEW.from_warehouse_id, NEW.to_warehouse_id, NEW.note)
        IS DISTINCT FROM ROW(OLD.number, OLD.business_date, OLD.from_warehouse_id, OLD.to_warehouse_id, OLD.note) THEN
      RAISE EXCEPTION 'posting actions cannot edit transfer business facts' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.responsible_staff_id IS NOT NULL AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Responsible staff is selected only on draft save' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id THEN
    IF OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR NEW.responsible_staff_id IS NULL THEN RAISE EXCEPTION 'Responsible change requires draft save and actual staff' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."keep_transfer_header_provenance"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: keep_transfer_line_owner(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."keep_transfer_line_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'retained transfer line cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id THEN
    RAISE EXCEPTION 'retained transfer line cannot move between documents or identities' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."keep_transfer_line_owner"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: lock_category_tree_statement(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."lock_category_tree_statement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
 -- A prior repeatable snapshot cannot observe the previous directory holder.
 -- Refuse with serialization failure, never validate a stale final component.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Category final-state writes require a fresh read-committed snapshot' USING ERRCODE='40001';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:catalogue-maintenance',0));
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."lock_category_tree_statement"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_action_allowed("text", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_action_allowed"("kind" "text", "action" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE','REORDER','UNDO_REORDER')
    WHEN 'COLOR' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'FIT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'HALL' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'WAREHOUSE' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'STAFF' THEN action IN ('CREATE','EDIT','LEAVE','REINSTATE')
    WHEN 'ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','RESET_PASSWORD')
    WHEN 'PAYMENT_METHOD' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'PAYMENT_ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    ELSE false END;
$$;


ALTER FUNCTION "naijue_erp"."maintenance_action_allowed"("kind" "text", "action" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: audit_change; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."audit_change" (
    "id" "uuid" NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "actor_account_id" "uuid" NOT NULL,
    "object_type" "text" NOT NULL,
    "object_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "old_version" integer,
    "new_version" integer NOT NULL,
    "before_values" "jsonb",
    "after_values" "jsonb" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "object_sales_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'SALES'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_transfer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'TRANSFER'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_customer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'CUSTOMER'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_supplier_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'SUPPLIER'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_product_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'PRODUCT'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_category_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'CATEGORY'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_color_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'COLOR'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_fit_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'FIT'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_hall_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'HALL'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_warehouse_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'WAREHOUSE'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_staff_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'STAFF'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_account_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'ACCOUNT'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_payment_method_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'PAYMENT_METHOD'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_payment_account_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'PAYMENT_ACCOUNT'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_history_sales_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'HISTORY_SALES'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    "object_history_transfer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("object_type" = 'HISTORY_TRANSFER'::"text") THEN "object_id"
    ELSE NULL::"uuid"
END) STORED,
    CONSTRAINT "audit_action_by_kind" CHECK ((((((((
CASE
    WHEN ("object_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"])) THEN ("action" = 'HISTORY_REVISE'::"text")
    ELSE (((
    CASE
        WHEN ("object_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[])) THEN "naijue_erp"."maintenance_action_allowed"("object_type", "action")
        ELSE ((("object_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) AND ("action" = ANY (ARRAY['SAVE'::"text", 'APPROVE'::"text", 'UNAPPROVE'::"text", 'VOID'::"text"]))) OR (("object_type" = ANY (ARRAY['CUSTOMER'::"text", 'SUPPLIER'::"text"])) AND ("action" = ANY (ARRAY['CREATE'::"text", 'EDIT'::"text", 'DISABLE'::"text", 'RESTORE'::"text"]))) OR (("object_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_STAGE'::"text", 'IMPORT_CHUNK'::"text", 'IMPORT_PUBLISH'::"text"]))))
    END IS TRUE) OR (("object_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_CORE_STAGE'::"text", 'IMPORT_BIND_FULL_SOURCE'::"text"])))) IS TRUE)
END IS TRUE) OR (("object_type" = 'IMPORT'::"text") AND ("action" = 'IMPORT_INITIALIZE_BARCODE_SCHEMES'::"text"))) IS TRUE) OR (("object_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) AND ("action" = 'MIGRATE_DOCUMENT'::"text"))) IS TRUE) OR (("object_type" = 'IMPORT'::"text") AND ("action" = 'IMPORT_INITIALIZE_CURRENT_ADMIN'::"text"))) IS TRUE)),
    CONSTRAINT "audit_change_new_version_check" CHECK (("new_version" > 0)),
    CONSTRAINT "audit_change_old_version_check" CHECK (("old_version" > 0)),
    CONSTRAINT "audit_object_kind" CHECK (((((("object_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text", 'CUSTOMER'::"text", 'SUPPLIER'::"text", 'IMPORT'::"text"])) OR ("object_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[]))) IS TRUE) OR ("object_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"]))) IS TRUE)),
    CONSTRAINT "audit_version_by_action" CHECK (((("action" = 'MIGRATE_DOCUMENT'::"text") AND ("old_version" IS NULL) AND ("new_version" > 0) AND ("before_values" IS NULL) AND ("object_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"]))) OR (("action" <> 'MIGRATE_DOCUMENT'::"text") AND ("new_version" = (COALESCE("old_version", 0) + 1)))))
);


ALTER TABLE "naijue_erp"."audit_change" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "audit_change"."before_values"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."audit_change"."before_values" IS 'Audit bigint strings encode integer quantities and integer minor units at scale 2; no float amounts or credentials.';


--
-- Name: COLUMN "audit_change"."after_values"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."audit_change"."after_values" IS 'Key before/after evidence only; native headers/actual lines/settlements remain the business facts.';


--
-- Name: maintenance_account_credential_action("naijue_erp"."audit_change", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_account_credential_action"("audit" "naijue_erp"."audit_change", "account" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE metadata jsonb; item jsonb; result text;
BEGIN
  IF coalesce(audit.before_values,'{}'::jsonb) ? 'account_credentials' THEN
    RAISE EXCEPTION 'Credential events occur only in the current after evidence' USING ERRCODE='23514';
  END IF;
  IF NOT (audit.after_values ? 'account_credentials') THEN RETURN NULL; END IF;
  metadata:=audit.after_values->'account_credentials';
  IF jsonb_typeof(metadata) IS DISTINCT FROM 'array' OR jsonb_array_length(metadata)=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(metadata) x(v) GROUP BY v->>'account_id' HAVING count(*)<>1 OR v->>'account_id' IS NULL) THEN
    RAISE EXCEPTION 'Exact unique account credential event metadata required' USING ERRCODE='23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(metadata) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['account_id','action'])
      OR item-ARRAY['account_id','action']<>'{}'::jsonb OR jsonb_typeof(item->'account_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'action') IS DISTINCT FROM 'string' OR item->>'action' NOT IN ('CREATE','RESET_PASSWORD') THEN
      RAISE EXCEPTION 'Credential metadata cannot contain secrets or extra values' USING ERRCODE='23514';
    END IF;
    IF audit.object_type='STAFF' THEN
      IF audit.action NOT IN ('CREATE','EDIT') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->'accounts') x(v) WHERE v->>'id'=item->>'account_id') THEN
        RAISE EXCEPTION 'Credential event must name a same-operation staff child' USING ERRCODE='23514';
      END IF;
    ELSIF audit.object_type='ACCOUNT' THEN
      IF item->>'account_id' IS DISTINCT FROM audit.object_id::text OR audit.action NOT IN ('CREATE','RESET_PASSWORD')
        OR item->>'action' IS DISTINCT FROM audit.action THEN
        RAISE EXCEPTION 'Credential event must match its account root action' USING ERRCODE='23514';
      END IF;
    ELSE RAISE EXCEPTION 'Unexpected credential event root' USING ERRCODE='23514'; END IF;
    IF item->>'account_id'=account::text THEN result:=item->>'action'; END IF;
  END LOOP;
  RETURN result;
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_account_credential_action"("audit" "naijue_erp"."audit_change", "account" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_administrator_mutex(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_administrator_mutex"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Administrator safety requires a fresh read-committed snapshot' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:maintenance:available-admin:v1',0));
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_administrator_mutex"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_audit_is_current("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_audit_is_current"("operation" "uuid") RETURNS boolean
    LANGUAGE "sql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT EXISTS(SELECT 1 FROM naijue_erp.audit_change a WHERE a.operation_id=operation
    AND a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint);
$$;


ALTER FUNCTION "naijue_erp"."maintenance_audit_is_current"("operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_check_account_credential("naijue_erp"."audit_change", "jsonb", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_check_account_credential"("audit" "naijue_erp"."audit_change", "old_account" "jsonb", "new_account" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE credential_action text;
BEGIN
  credential_action:=naijue_erp.maintenance_account_credential_action(audit,(new_account->>'id')::uuid);
  IF old_account IS NULL THEN
    IF credential_action IS DISTINCT FROM 'CREATE' OR coalesce(new_account->>'password_hash','') !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' THEN
      RAISE EXCEPTION 'New account requires the exact current credential event and encoding' USING ERRCODE='23514';
    END IF;
  ELSIF credential_action='RESET_PASSWORD' THEN
    IF new_account->'password_hash' IS NOT DISTINCT FROM old_account->'password_hash'
      OR coalesce(new_account->>'password_hash','') !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' THEN
      RAISE EXCEPTION 'Password reset must change the actual credential to the current encoding' USING ERRCODE='23514';
    END IF;
  ELSIF credential_action IS NOT NULL OR new_account->'password_hash' IS DISTINCT FROM old_account->'password_hash' THEN
    RAISE EXCEPTION 'Credential changes require an exact create or reset event' USING ERRCODE='23514';
  END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."maintenance_check_account_credential"("audit" "naijue_erp"."audit_change", "old_account" "jsonb", "new_account" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_check_category_order("naijue_erp"."audit_change"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_check_category_order"("a" "naijue_erp"."audit_change") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
#variable_conflict use_column
DECLARE r naijue_erp.operation_receipt%ROWTYPE; original_r naijue_erp.operation_receipt%ROWTYPE; original_a naijue_erp.audit_change%ROWTYPE;
 actor record; before_order jsonb; after_order jsonb; metadata jsonb; member jsonb; old_member jsonb; new_member jsonb;
 original_before jsonb; original_after jsonb; expected_result jsonb; actual_rows jsonb; result_members jsonb;
 parent uuid; moved uuid; undo_of uuid; previous_id text; old_ids text[]; new_ids text[]; changed_ids uuid[]; written_ids uuid[];
 current_xid bigint:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint; audit_command bigint; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:catalogue-maintenance',0));
 IF (a.object_type='CATEGORY' AND a.action IN ('REORDER','UNDO_REORDER') AND a.old_version IS NOT NULL
   AND a.new_version::bigint=a.old_version::bigint+1 AND naijue_erp.maintenance_audit_is_current(a.operation_id)
   AND jsonb_typeof(a.before_values)='object' AND a.before_values ?& ARRAY['version','display_order','category_order']
   AND a.before_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND jsonb_typeof(a.after_values)='object' AND a.after_values ?& ARRAY['version','display_order','category_order']
   AND a.after_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND a.before_values->'version'=to_jsonb(a.old_version) AND a.after_values->'version'=to_jsonb(a.new_version)
   AND naijue_erp.safe_maintenance_evidence(a.before_values) AND naijue_erp.safe_maintenance_evidence(a.after_values)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Exact current category aggregate audit required' USING ERRCODE='23514';
 END IF;
 SELECT cmin::text::bigint INTO STRICT audit_command FROM naijue_erp.audit_change WHERE operation_id=a.operation_id;
 IF (SELECT count(*) FROM naijue_erp.audit_change WHERE xmin::text::bigint=current_xid)<>1
  OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE xmin::text::bigint=current_xid)<>1 THEN
  RAISE EXCEPTION 'One category operation audit and receipt per transaction required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF (r.target_type='CATEGORY' AND r.action=a.action AND r.target_id=a.object_id AND r.actor_account_id=a.actor_account_id
   AND r.status='COMMITTED' AND r.completed_at=a.occurred_at
   AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=current_xid)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Category operation receipt must close its same transaction audit' USING ERRCODE='23514';
 END IF;
 SELECT u.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT actor
  FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id WHERE u.id=a.actor_account_id FOR SHARE OF u,s;
 IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职' OR actor.role NOT IN ('ADMIN','WAREHOUSE') THEN
  RAISE EXCEPTION 'Current category order authority unavailable' USING ERRCODE='42501';
 END IF;
 IF actor.hall_id IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 before_order:=a.before_values->'category_order'; after_order:=a.after_values->'category_order';
 FOREACH metadata IN ARRAY ARRAY[before_order,after_order] LOOP
  IF (jsonb_typeof(metadata)='object' AND metadata ?& ARRAY['parent_id','moved_id','undo_of_operation_id','rows']
    AND metadata-ARRAY['parent_id','moved_id','undo_of_operation_id','rows']='{}'::jsonb
    AND (metadata->'parent_id'='null'::jsonb OR (jsonb_typeof(metadata->'parent_id')='string' AND (metadata->>'parent_id')::uuid::text=metadata->>'parent_id'))
    AND jsonb_typeof(metadata->'moved_id')='string' AND (metadata->>'moved_id')::uuid::text=metadata->>'moved_id'
    AND (metadata->'undo_of_operation_id'='null'::jsonb OR (jsonb_typeof(metadata->'undo_of_operation_id')='string' AND (metadata->>'undo_of_operation_id')::uuid::text=metadata->>'undo_of_operation_id'))
    AND jsonb_typeof(metadata->'rows')='array' AND jsonb_array_length(metadata->'rows') BETWEEN 2 AND 5000) IS NOT TRUE THEN
   RAISE EXCEPTION 'Closed complete category sibling metadata required' USING ERRCODE='23514';
  END IF;
  previous_id:=NULL;
  FOR member IN SELECT value FROM jsonb_array_elements(metadata->'rows') LOOP
   IF (jsonb_typeof(member)='object' AND member ?& ARRAY['id','version','display_order'] AND member-ARRAY['id','version','display_order']='{}'::jsonb
     AND jsonb_typeof(member->'id')='string' AND (member->>'id')::uuid::text=member->>'id'
     AND (previous_id IS NULL OR previous_id COLLATE "C" < (member->>'id') COLLATE "C")
     AND jsonb_typeof(member->'version')='number' AND member->>'version' ~ '^[1-9][0-9]*$' AND (member->>'version')::numeric BETWEEN 1 AND 2147483647
     AND jsonb_typeof(member->'display_order')='number' AND member->>'display_order' ~ '^-?(0|[1-9][0-9]*)$'
     AND (member->>'display_order')::numeric BETWEEN -2147483648 AND 2147483647) IS NOT TRUE THEN
    RAISE EXCEPTION 'Canonical unique bounded category sibling rows required' USING ERRCODE='23514';
   END IF;
   previous_id:=member->>'id';
  END LOOP;
 END LOOP;
 IF before_order-'rows' IS DISTINCT FROM after_order-'rows' OR jsonb_array_length(before_order->'rows')<>jsonb_array_length(after_order->'rows') THEN
  RAISE EXCEPTION 'Category sibling identity and parent cannot change' USING ERRCODE='23514';
 END IF;
 parent:=(after_order->>'parent_id')::uuid; moved:=(after_order->>'moved_id')::uuid; undo_of:=(after_order->>'undo_of_operation_id')::uuid;
 IF (a.action='REORDER') IS DISTINCT FROM (undo_of IS NULL) OR undo_of=a.operation_id THEN
  RAISE EXCEPTION 'Category action and original undo operation differ' USING ERRCODE='23514';
 END IF;
 changed_ids:=ARRAY[]::uuid[];
 FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
  old_member:=before_order->'rows'->n; new_member:=after_order->'rows'->n;
  IF old_member->'id' IS DISTINCT FROM new_member->'id'
    OR (new_member->>'version')::bigint<>(old_member->>'version')::bigint+(CASE WHEN old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'Changed category rows advance exactly once; all siblings retained' USING ERRCODE='23514';
  END IF;
  IF old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN changed_ids:=array_append(changed_ids,(new_member->>'id')::uuid); END IF;
  IF new_member->>'id'=a.object_id::text AND (old_member->'version' IS DISTINCT FROM to_jsonb(a.old_version)
    OR new_member->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR old_member->'display_order' IS DISTINCT FROM a.before_values->'display_order'
    OR new_member->'display_order' IS DISTINCT FROM a.after_values->'display_order') THEN
   RAISE EXCEPTION 'Category anchor sparse values differ from its exact member' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF cardinality(changed_ids)=0 OR NOT a.object_id=ANY(changed_ids)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE m->>'id'=moved::text) THEN
  RAISE EXCEPTION 'Actual changed category anchor and moved member required' USING ERRCODE='23514';
 END IF;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO old_ids FROM jsonb_array_elements(before_order->'rows') m;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO new_ids FROM jsonb_array_elements(after_order->'rows') m;
 IF a.action='REORDER' THEN
  IF a.object_id<>changed_ids[1] OR old_ids=new_ids OR array_remove(old_ids,moved::text) IS DISTINCT FROM array_remove(new_ids,moved::text)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE (m->>'display_order')::integer<>array_position(new_ids,m->>'id')-1) THEN
   RAISE EXCEPTION 'Only the selected sibling may move into contiguous complete order' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO STRICT original_r FROM naijue_erp.operation_receipt WHERE id=undo_of;
  SELECT * INTO STRICT original_a FROM naijue_erp.audit_change WHERE operation_id=undo_of;
  original_before:=original_a.before_values->'category_order'; original_after:=original_a.after_values->'category_order';
  IF (original_r.target_type='CATEGORY' AND original_r.action='REORDER' AND original_r.status='COMMITTED'
    AND original_r.actor_account_id=a.actor_account_id AND original_r.target_id=a.object_id
    AND original_a.object_type='CATEGORY' AND original_a.action='REORDER' AND original_a.object_id=a.object_id
    AND original_a.actor_account_id=a.actor_account_id AND original_a.occurred_at=original_r.completed_at
    AND original_before-'rows'=original_after-'rows' AND original_after->'undo_of_operation_id'='null'::jsonb
    AND original_after->'parent_id'=after_order->'parent_id' AND original_after->'moved_id'=after_order->'moved_id'
    AND before_order->'rows'=original_after->'rows'
    AND jsonb_array_length(original_before->'rows')=jsonb_array_length(after_order->'rows')) IS NOT TRUE THEN
   RAISE EXCEPTION 'Undo requires the same actor original reorder and its unchanged complete poststate' USING ERRCODE='23514';
  END IF;
  FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
   IF after_order->'rows'->n->'id' IS DISTINCT FROM original_before->'rows'->n->'id'
     OR after_order->'rows'->n->'display_order' IS DISTINCT FROM original_before->'rows'->n->'display_order' THEN
    RAISE EXCEPTION 'Undo restores only exact original integer orders' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.product_category WHERE id=parent AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual retained category parent required' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL ORDER BY id FOR SHARE;
 SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'display_order',display_order) ORDER BY id) INTO actual_rows
  FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL;
 IF actual_rows IS DISTINCT FROM after_order->'rows' THEN
  RAISE EXCEPTION 'Final complete category siblings differ from aggregate after evidence' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO written_ids FROM naijue_erp.product_category WHERE xmin::text::bigint=current_xid;
 IF written_ids IS DISTINCT FROM changed_ids OR EXISTS(SELECT 1 FROM naijue_erp.product_category
   WHERE id=ANY(changed_ids) AND cmin::text::bigint<=audit_command) THEN
  RAISE EXCEPTION 'Only exact changed siblings may be written after the prepared audit' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',m->'id','version',m->'version','displayOrder',m->'display_order')
   ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO result_members FROM jsonb_array_elements(after_order->'rows') m;
 expected_result:=jsonb_build_object('operationId',a.operation_id,'kind','CATEGORY','targetId',a.object_id,'version',a.new_version,
  'order',jsonb_build_object('parentId',parent,'undoOfOperationId',undo_of,'members',result_members));
 IF r.result_data IS DISTINCT FROM expected_result THEN
  RAISE EXCEPTION 'Category receipt must return the exact complete aggregate poststate' USING ERRCODE='23514';
 END IF;
END $_$;


ALTER FUNCTION "naijue_erp"."maintenance_check_category_order"("a" "naijue_erp"."audit_change") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_check_product_children("naijue_erp"."audit_change", boolean); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_check_product_children"("audit" "naijue_erp"."audit_change", "before_mutation" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE child_kind text; previous jsonb; following jsonb; item jsonb; old_item jsonb; actual jsonb; target uuid;
BEGIN
  FOREACH child_kind IN ARRAY ARRAY['skus','barcodes','images'] LOOP
    IF NOT (coalesce(audit.after_values,'{}'::jsonb) ? child_kind OR coalesce(audit.before_values,'{}'::jsonb) ? child_kind) THEN CONTINUE; END IF;
    previous:=coalesce(audit.before_values->child_kind,'[]'::jsonb); following:=audit.after_values->child_kind;
    IF jsonb_typeof(previous) IS DISTINCT FROM 'array' OR jsonb_typeof(following) IS DISTINCT FROM 'array'
      OR jsonb_array_length(previous)>20000 OR jsonb_array_length(following)>20000
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(previous) x(v) GROUP BY v->>'id' HAVING count(*)<>1 OR v->>'id' IS NULL)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) GROUP BY v->>'id' HAVING count(*)<>1 OR v->>'id' IS NULL) THEN
      RAISE EXCEPTION 'Exact unique changed child arrays required' USING ERRCODE='23514';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(previous) LOOP
      target:=(item->>'id')::uuid; actual:=naijue_erp.maintenance_product_child_row(child_kind,target,audit.object_id);
      IF before_mutation AND NOT naijue_erp.maintenance_complete_row_matches(item,actual) THEN
        RAISE EXCEPTION 'Child before evidence is not the actual retained row' USING ERRCODE='23514';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) WHERE v->>'id'=target::text) THEN
        IF child_kind<>'images' OR (NOT before_mutation AND actual IS NOT NULL) THEN
          RAISE EXCEPTION 'Only explicitly audited image removal may remove a child' USING ERRCODE='23514';
        END IF;
      END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements(following) LOOP
      target:=(item->>'id')::uuid; actual:=naijue_erp.maintenance_product_child_row(child_kind,target,audit.object_id);
      SELECT value INTO old_item FROM jsonb_array_elements(previous) WHERE value->>'id'=target::text;
      IF before_mutation THEN
        IF (actual IS NULL AND old_item IS NOT NULL) OR (actual IS NOT NULL AND NOT naijue_erp.maintenance_complete_row_matches(old_item,actual))
          OR (old_item IS NOT NULL AND old_item=item) THEN
          RAISE EXCEPTION 'Changed children must match original existence and contain a real change' USING ERRCODE='23514';
        END IF;
      ELSIF NOT naijue_erp.maintenance_complete_row_matches(item,actual) THEN
        RAISE EXCEPTION 'Final child row differs from its exact prepared audit' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END LOOP;
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_check_product_children"("audit" "naijue_erp"."audit_change", "before_mutation" boolean) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_check_staff_accounts("naijue_erp"."audit_change", "jsonb", "jsonb", boolean); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_check_staff_accounts"("audit" "naijue_erp"."audit_change", "old_staff" "jsonb", "new_staff" "jsonb", "before_mutation" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE previous jsonb; following jsonb; item jsonb; prior jsonb; credential_action text; access_changed boolean; must_advance boolean; actual jsonb;
BEGIN
  IF (old_staff IS NULL AND (audit.action<>'CREATE' OR new_staff->>'employment_status' IS DISTINCT FROM '在职'))
    OR (old_staff IS NOT NULL AND audit.action='CREATE')
    OR (audit.action='EDIT' AND new_staff->'employment_status' IS DISTINCT FROM old_staff->'employment_status')
    OR (audit.action='LEAVE' AND (old_staff->>'employment_status' IS DISTINCT FROM '在职' OR new_staff->>'employment_status' IS DISTINCT FROM '离职'))
    OR (audit.action='REINSTATE' AND (old_staff->>'employment_status' IS DISTINCT FROM '离职' OR new_staff->>'employment_status' IS DISTINCT FROM '在职'))
    OR (audit.action IN ('LEAVE','REINSTATE') AND new_staff-ARRAY['employment_status','version'] IS DISTINCT FROM old_staff-ARRAY['employment_status','version']) THEN
    RAISE EXCEPTION 'Exact staff create/edit/leave/reinstate transition required' USING ERRCODE='23514';
  END IF;
  access_changed:=old_staff IS NOT NULL AND (new_staff->'role' IS DISTINCT FROM old_staff->'role'
    OR new_staff->'hall_id' IS DISTINCT FROM old_staff->'hall_id' OR new_staff->'employment_status' IS DISTINCT FROM old_staff->'employment_status');
  actual:=naijue_erp.maintenance_staff_accounts(audit.object_id);
  IF NOT (audit.after_values ? 'accounts') THEN
    IF coalesce(audit.before_values,'{}'::jsonb) ? 'accounts' OR audit.after_values ? 'account_credentials'
      OR audit.action IN ('LEAVE','REINSTATE') OR (access_changed AND actual<>'[]'::jsonb) THEN
      RAISE EXCEPTION 'Staff safety transition requires complete safe account sets' USING ERRCODE='23514';
    END IF;
    RETURN;
  END IF;
  previous:=CASE WHEN old_staff IS NULL THEN '[]'::jsonb ELSE audit.before_values->'accounts' END;
  following:=audit.after_values->'accounts';
  IF jsonb_typeof(previous) IS DISTINCT FROM 'array' OR jsonb_typeof(following) IS DISTINCT FROM 'array'
    OR jsonb_array_length(previous)>1 OR jsonb_array_length(following)>1
    OR (before_mutation AND NOT naijue_erp.maintenance_exact_rows_match(previous,actual))
    OR (NOT before_mutation AND NOT naijue_erp.maintenance_exact_rows_match(following,actual)) THEN
    RAISE EXCEPTION 'Staff account evidence must equal the complete actual unique linked set' USING ERRCODE='23514';
  END IF;
  FOR prior IN SELECT value FROM jsonb_array_elements(previous) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) WHERE v->>'id'=prior->>'id') THEN
      RAISE EXCEPTION 'Existing linked account identity cannot be removed or rebound' USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(following) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['id','staff_id','login_name','login_enabled','auth_version','version','created_at','updated_at'])
      OR item-ARRAY['id','staff_id','login_name','login_enabled','auth_version','version','created_at','updated_at']<>'{}'::jsonb
      OR item->>'staff_id' IS DISTINCT FROM audit.object_id::text OR jsonb_typeof(item->'login_enabled') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(item->'login_name') IS DISTINCT FROM 'string' OR coalesce(item->>'login_name','')=''
      OR jsonb_typeof(item->'auth_version') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Complete credential-free actual linked account row required' USING ERRCODE='23514';
    END IF;
    credential_action:=naijue_erp.maintenance_account_credential_action(audit,(item->>'id')::uuid);
    SELECT value INTO prior FROM jsonb_array_elements(previous) WHERE value->>'id'=item->>'id';
    IF prior IS NULL THEN
      IF audit.action NOT IN ('CREATE','EDIT') OR credential_action IS DISTINCT FROM 'CREATE'
        OR item->'version' IS DISTINCT FROM '1'::jsonb OR item->'auth_version' IS DISTINCT FROM '1'::jsonb
        OR NOT naijue_erp.maintenance_evidence_matches(item->'created_at',to_jsonb(audit.occurred_at))
        OR NOT naijue_erp.maintenance_evidence_matches(item->'updated_at',to_jsonb(audit.occurred_at)) THEN
        RAISE EXCEPTION 'Optional staff account creation needs version one and exact original operation' USING ERRCODE='23514';
      END IF;
    ELSE
      IF item->'id' IS DISTINCT FROM prior->'id' OR item->'staff_id' IS DISTINCT FROM prior->'staff_id'
        OR NOT naijue_erp.maintenance_evidence_matches(item->'created_at',prior->'created_at') OR credential_action='CREATE' THEN
        RAISE EXCEPTION 'Existing account provenance cannot change' USING ERRCODE='23514';
      END IF;
      must_advance:=access_changed OR credential_action='RESET_PASSWORD'
        OR item->'login_name' IS DISTINCT FROM prior->'login_name' OR item->'login_enabled' IS DISTINCT FROM prior->'login_enabled';
      IF must_advance IS TRUE THEN
        IF (item->>'version')::bigint IS DISTINCT FROM (prior->>'version')::bigint+1
          OR (item->>'auth_version')::bigint IS DISTINCT FROM (prior->>'auth_version')::bigint+1
          OR NOT naijue_erp.maintenance_evidence_matches(item->'updated_at',to_jsonb(audit.occurred_at)) THEN
          RAISE EXCEPTION 'Combined account/security changes advance epochs exactly once' USING ERRCODE='23514';
        END IF;
        IF NOT before_mutation AND EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=(item->>'id')::uuid AND revoked_at IS NULL) THEN
          RAISE EXCEPTION 'Every old linked session must be revoked in the original operation' USING ERRCODE='23514';
        END IF;
      ELSIF NOT naijue_erp.maintenance_complete_row_matches(item,prior) THEN
        RAISE EXCEPTION 'Unchanged linked account cannot advance epochs independently' USING ERRCODE='23514';
      END IF;
    END IF;
    IF audit.action IN ('LEAVE','REINSTATE') AND (item->'login_enabled' IS DISTINCT FROM 'false'::jsonb
      OR item->'login_name' IS DISTINCT FROM prior->'login_name' OR credential_action IS NOT NULL) THEN
      RAISE EXCEPTION 'Leave and reinstate retain credentials and disable linked login' USING ERRCODE='23514';
    END IF;
    IF item->'login_enabled'='true'::jsonb THEN
      IF new_staff->>'employment_status' IS DISTINCT FROM '在职' OR new_staff->>'role' NOT IN ('ADMIN','WAREHOUSE','SALESPERSON')
        OR (new_staff->>'role'='SALESPERSON' AND new_staff->>'hall_id' IS NULL)
        OR (new_staff->>'hall_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.hall WHERE id=(new_staff->>'hall_id')::uuid AND enabled)) THEN
        RAISE EXCEPTION 'Enabled linked login requires actual active staff and usable hall' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  -- Validate even an empty final account set cannot hide unmatched metadata.
  PERFORM naijue_erp.maintenance_account_credential_action(audit,NULL);
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_check_staff_accounts"("audit" "naijue_erp"."audit_change", "old_staff" "jsonb", "new_staff" "jsonb", "before_mutation" boolean) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_complete_row_matches("jsonb", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_complete_row_matches"("expected" "jsonb", "actual" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE field record;
BEGIN
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR jsonb_typeof(actual) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(expected))<>(SELECT count(*) FROM jsonb_object_keys(actual)) THEN RETURN false; END IF;
  FOR field IN SELECT * FROM jsonb_each(actual) LOOP
    IF NOT naijue_erp.maintenance_evidence_matches(expected->field.key,field.value) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_complete_row_matches"("expected" "jsonb", "actual" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_evidence_matches("jsonb", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_evidence_matches"("expected" "jsonb", "actual" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
BEGIN
  IF expected IS NULL OR actual IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(actual)='number' AND jsonb_typeof(expected)='string'
    AND expected#>>'{}' ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$' THEN
    RETURN (expected#>>'{}')::numeric=(actual#>>'{}')::numeric;
  END IF;
  IF jsonb_typeof(actual)='string' AND jsonb_typeof(expected)='string'
    AND actual#>>'{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
    AND expected#>>'{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN (expected#>>'{}')::timestamptz=(actual#>>'{}')::timestamptz;
  END IF;
  RETURN expected=actual;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $_$;


ALTER FUNCTION "naijue_erp"."maintenance_evidence_matches"("expected" "jsonb", "actual" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_exact_rows_match("jsonb", "jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_exact_rows_match"("expected" "jsonb", "actual" "jsonb", "key_name" "text" DEFAULT 'id'::"text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE item jsonb; corresponding jsonb;
BEGIN
  IF jsonb_typeof(expected) IS DISTINCT FROM 'array' OR jsonb_typeof(actual) IS DISTINCT FROM 'array'
    OR jsonb_array_length(expected)<>jsonb_array_length(actual)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x(v) GROUP BY v->>key_name HAVING count(*)<>1 OR v->>key_name IS NULL) THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(actual) LOOP
    SELECT value INTO corresponding FROM jsonb_array_elements(expected) WHERE value->>key_name=item->>key_name;
    IF NOT naijue_erp.maintenance_complete_row_matches(corresponding,item) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_exact_rows_match"("expected" "jsonb", "actual" "jsonb", "key_name" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_payment_halls("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_payment_halls"("target" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY hall_id),'[]'::jsonb) FROM naijue_erp.payment_account_hall h WHERE payment_account_id=target;
$$;


ALTER FUNCTION "naijue_erp"."maintenance_payment_halls"("target" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_product_child_row("text", "uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_product_child_row"("child_kind" "text", "child" "uuid", "product" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
  CASE child_kind
    WHEN 'skus' THEN SELECT to_jsonb(s) INTO result FROM naijue_erp.sku s WHERE s.id=child AND s.product_id=product;
    WHEN 'barcodes' THEN SELECT to_jsonb(b) INTO result FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE b.id=child AND s.product_id=product;
    WHEN 'images' THEN SELECT to_jsonb(i) INTO result FROM naijue_erp.product_image i WHERE i.id=child AND i.product_id=product;
    ELSE RAISE EXCEPTION 'Unknown maintenance child family' USING ERRCODE='23514';
  END CASE;
  RETURN result;
END $$;


ALTER FUNCTION "naijue_erp"."maintenance_product_child_row"("child_kind" "text", "child" "uuid", "product" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_root_table("text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_root_table"("kind" "text") RETURNS "regclass"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN 'naijue_erp.product'::regclass
    WHEN 'CATEGORY' THEN 'naijue_erp.product_category'::regclass
    WHEN 'COLOR' THEN 'naijue_erp.color'::regclass
    WHEN 'FIT' THEN 'naijue_erp.fit'::regclass
    WHEN 'HALL' THEN 'naijue_erp.hall'::regclass
    WHEN 'WAREHOUSE' THEN 'naijue_erp.warehouse'::regclass
    WHEN 'STAFF' THEN 'naijue_erp.staff'::regclass
    WHEN 'ACCOUNT' THEN 'naijue_erp.user_account'::regclass
    WHEN 'PAYMENT_METHOD' THEN 'naijue_erp.payment_method'::regclass
    WHEN 'PAYMENT_ACCOUNT' THEN 'naijue_erp.payment_account'::regclass
    ELSE NULL END;
$$;


ALTER FUNCTION "naijue_erp"."maintenance_root_table"("kind" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: maintenance_staff_accounts("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."maintenance_staff_accounts"("target" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a)-'password_hash' ORDER BY id),'[]'::jsonb) FROM naijue_erp.user_account a WHERE staff_id=target;
$$;


ALTER FUNCTION "naijue_erp"."maintenance_staff_accounts"("target" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: native_creation_operation_valid("text", "uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."native_creation_operation_valid"("kind" "text", "target" "uuid", "operation" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE receipt naijue_erp.operation_receipt%ROWTYPE; audit naijue_erp.audit_change%ROWTYPE; item jsonb; actual jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.id=operation AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1') THEN RETURN false; END IF;
  IF operation IS NULL OR target IS NULL OR kind IS NULL OR kind NOT IN ('WAREHOUSE','SKU') THEN RETURN false; END IF;
  SELECT * INTO receipt FROM naijue_erp.operation_receipt WHERE id=operation;
  IF NOT FOUND OR receipt.status<>'COMMITTED' THEN RETURN false; END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE operation_id=operation;
  IF NOT FOUND OR audit.actor_account_id<>receipt.actor_account_id OR audit.object_type<>receipt.target_type
    OR audit.object_id<>receipt.target_id OR audit.action<>receipt.action OR audit.occurred_at<>receipt.completed_at
    OR audit.new_version::text IS DISTINCT FROM receipt.result_data->>'version' THEN RETURN false; END IF;
  IF kind='WAREHOUSE' THEN
    RETURN coalesce(receipt.target_type='WAREHOUSE' AND receipt.target_id=target AND receipt.action='CREATE'
      AND audit.old_version IS NULL AND audit.new_version=1 AND audit.before_values IS NULL
      AND audit.after_values->>'id'=target::text AND audit.after_values->>'created_operation_id'=operation::text
      AND audit.after_values->'version'='1'::jsonb,false);
  END IF;
  IF receipt.target_type<>'PRODUCT' OR receipt.action NOT IN ('CREATE','EDIT')
    OR jsonb_typeof(audit.after_values->'skus') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT to_jsonb(s) INTO actual FROM naijue_erp.sku s WHERE s.id=target AND s.product_id=receipt.target_id AND s.created_operation_id=operation;
  IF actual IS NULL THEN RETURN false; END IF;
  SELECT value INTO item FROM jsonb_array_elements(audit.after_values->'skus') WHERE value->>'id'=target::text;
  IF item IS NULL OR item->>'created_operation_id' IS DISTINCT FROM operation::text OR item->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  -- Enabled/version may legitimately change later. Original coordinate, code,
  -- parent and immutable creation operation must still be the original ones.
  RETURN item ?& ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','created_operation_id']
    AND item-ARRAY['enabled','version']=actual-ARRAY['enabled','version'];
END $$;


ALTER FUNCTION "naijue_erp"."native_creation_operation_valid"("kind" "text", "target" "uuid", "operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: party_key_values("text", "text", boolean, integer); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."party_key_values"("code_value" "text", "name_value" "text", "enabled_value" boolean, "version_value" integer) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT jsonb_build_object('code', code_value, 'name', name_value, 'enabled', enabled_value, 'version', version_value);
$$;


ALTER FUNCTION "naijue_erp"."party_key_values"("code_value" "text", "name_value" "text", "enabled_value" boolean, "version_value" integer) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: published_inventory_key("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."published_inventory_key"("warehouse" "uuid", "sku" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT CASE WHEN EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN naijue_erp.standard_business_ready() AND naijue_erp.standard_inventory_key_proof(warehouse,sku)->>'state'<>'UNKNOWN' ELSE EXISTS (SELECT 1 FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE'
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'WAREHOUSE' AND r.target_id = warehouse)
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = sku)) END;
$$;


ALTER FUNCTION "naijue_erp"."published_inventory_key"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: reject_document_runtime_reference_id_update_v1(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
 IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
  RAISE EXCEPTION 'Runtime reference lock must not update identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: reject_immutable_change(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."reject_immutable_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION 'append-only relation % cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;


ALTER FUNCTION "naijue_erp"."reject_immutable_change"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: reject_unimplemented_cutoff_write(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."reject_unimplemented_cutoff_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.stock_basis = 'CUTOFF_HISTORY' THEN RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.stock_basis = 'CUTOFF_HISTORY' OR (TG_OP = 'UPDATE' AND OLD.stock_basis = 'CUTOFF_HISTORY') THEN
    RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.responsible_staff_id IS NOT NULL AND NEW.status<>'DRAFT' THEN RAISE EXCEPTION 'Responsible staff is selected only on draft save' USING ERRCODE='23514'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.responsible_staff_id IS DISTINCT FROM OLD.responsible_staff_id THEN
    IF OLD.status<>'DRAFT' OR NEW.status<>'DRAFT' OR NEW.responsible_staff_id IS NULL THEN RAISE EXCEPTION 'Responsible change requires draft save and actual staff' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."reject_unimplemented_cutoff_write"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: safe_maintenance_evidence("jsonb", integer); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."safe_maintenance_evidence"("value" "jsonb", "depth" integer DEFAULT 0) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE item record;
BEGIN
  IF depth>16 OR octet_length(value::text)>16777216 THEN RETURN false; END IF;
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value)='object' THEN
    FOR item IN SELECT * FROM jsonb_each(value) LOOP
      IF lower(item.key) IN ('password','password_hash','passwordhash','currentpassword','newpassword','token','token_hash','tokenhash','cookie','authorization','secret')
        OR NOT naijue_erp.safe_maintenance_evidence(item.value,depth+1) THEN RETURN false; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value)='array' THEN
    FOR item IN SELECT v FROM jsonb_array_elements(value) AS x(v) LOOP
      IF NOT naijue_erp.safe_maintenance_evidence(item.v,depth+1) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;


ALTER FUNCTION "naijue_erp"."safe_maintenance_evidence"("value" "jsonb", "depth" integer) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_business_ready(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_business_ready"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT EXISTS(SELECT 1 FROM naijue_erp.import_batch baseline JOIN naijue_erp.operation_receipt r
  ON r.result_data->>'baselineBatchId'=baseline.id::text AND r.target_type='IMPORT' AND r.action='IMPORT_PUBLISH'
    AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'phase'='DOCUMENT_PUBLISH'
  JOIN naijue_erp.import_batch documents ON documents.id=r.target_id
  WHERE baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND baseline.inventory_mode='CUTOFF_STOCK_BASELINE' AND baseline.status='IMPORTED'
   AND documents.inventory_mode='DOCUMENT_CONVERSION' AND documents.mapping_version='DOCUMENT_CONVERSION_V1' AND documents.status='IMPORTED'
   AND documents.source_hash=baseline.source_hash AND documents.source_name=baseline.source_name AND documents.cutoff_at=baseline.cutoff_at
   AND r.result_data->>'packageManifestSha256'=baseline.source_hash AND r.status='COMMITTED');
$$;


ALTER FUNCTION "naijue_erp"."standard_business_ready"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_baseline_keys("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_baseline_keys"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'KEYS'); $$;


ALTER FUNCTION "naijue_erp"."standard_import_baseline_keys"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_command("jsonb", "text", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_command"("request" "jsonb", "private_parameter" "text", "command_phase" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
BEGIN
 -- Every mutation and status uses this same real transaction lock barrier.
 PERFORM naijue_erp.cutoff_import_lock();
 IF jsonb_typeof(request) IS DISTINCT FROM 'object' OR request-ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload']<>'{}'
  OR NOT(request ?& ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload'])
  OR request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR jsonb_typeof(request->'payload') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(request) e WHERE e.key<>'payload' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR (request->>'plan_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (request->>'package_manifest_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (request->>'namespace' ~ '^[a-z][a-z0-9_.:-]*$') IS DISTINCT FROM true OR coalesce(length(request->>'request_key'),0)=0 THEN
  RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;batch:=(request->>'batch_id')::uuid;payload:=request->'payload';
 IF operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_REQUIRED' USING ERRCODE='23514'; END IF;
 IF command_phase='INITIALIZE' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE actor:=naijue_erp.standard_import_identity(private_parameter,'IMPORTER');fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN
  SELECT * INTO STRICT prior_a FROM naijue_erp.audit_change WHERE operation_id=prior.id;
  IF prior.id<>operation OR prior.target_id<>batch OR prior.target_type<>'IMPORT' OR prior.request_hash<>fingerprint OR prior_a.after_values->'request' IS DISTINCT FROM request THEN
   RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',prior.id,'batch_id',batch,'request_sha256',prior.request_hash,'state','COMMITTED','sequence',prior.result_data->'sequence','cursor',prior.result_data->'cursor','receipt',prior.result_data);
 END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in.
  -- Its JS typed digests are opaque bindings in the immutable INIT request;
  -- they are never misrepresented as PostgreSQL jsonb::text hashes.
  IF payload ? 'execution_contract' THEN
   execution_contract:=payload->'execution_contract';master_chunks_v2:=true;
   IF jsonb_typeof(execution_contract) IS DISTINCT FROM 'object'
    OR execution_contract-ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256']<>'{}'
    OR NOT(execution_contract ?& ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256'])
    OR execution_contract->>'format_version' IS DISTINCT FROM 'UNIFIED_STANDARD_EXECUTION_PLAN_V2'
    OR execution_contract->>'compiler_version' IS DISTINCT FROM 'DEPENDENCY_ORDERED_STANDARD_PROGRAM_V2'
    OR execution_contract->>'scheduler_version' IS DISTINCT FROM 'UNIFIED_STANDARD_MASTER_CHUNK_PLAN_V2'
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('max_master_chunk_rows','master_chunks') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'number' OR (contract_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    OR (execution_contract->>'max_master_chunk_rows')::numeric NOT BETWEEN 1 AND 500
    OR (execution_contract->>'master_chunks')::numeric NOT BETWEEN 0 AND 2147483646
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'string' OR ((contract_field.value#>>'{}') ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'STANDARD49_V2_EXECUTION_CONTRACT_INVALID' USING ERRCODE='23514'; END IF;
   master_limit:=2147483647;max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_each(payload->'admin') admin_field WHERE jsonb_typeof(admin_field.value) IS DISTINCT FROM 'string') OR octet_length(payload->'admin'->>'login_name')>256 THEN RAISE EXCEPTION 'STANDARD49_V2_ADMIN_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(payload->'expected') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_master_counts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_documents') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(count_key ORDER BY count_key) FROM jsonb_object_keys(payload->'expected') count_key) IS DISTINCT FROM ARRAY['IMPORT_BATCH','INVENTORY_EFFECT','INVENTORY_KEY','MASTER','NAMESPACE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected') count_field WHERE jsonb_typeof(count_field.value) IS DISTINCT FROM 'number' OR (count_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR count_field.value::text::numeric>2147483647) THEN RAISE EXCEPTION 'STANDARD49_INITIAL_COUNTER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>master_limit)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>master_limit OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  IF (payload->'expected'->>'INVENTORY_EFFECT')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected'))>2147483647
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_documents'))>2147483647
   OR (payload->'expected_documents'->>'SALES_HEADER')::numeric+(payload->'expected_documents'->>'TRANSFER_HEADER')::numeric+1>2147483646 THEN RAISE EXCEPTION 'STANDARD49_INITIAL_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  IF master_chunks_v2 AND (((expected_master_chunks=0) IS DISTINCT FROM ((payload->'expected'->>'MASTER')::numeric=0))
   OR expected_master_chunks>(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric*max_master_chunk_rows<(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric+ceil((payload->'expected'->>'INVENTORY_KEY')::numeric/100)+1>2147483646) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_LAYOUT_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  admin:=payload->'admin';
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  expected:=payload->'expected';
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"MASTER":0,"INVENTORY_KEY":0,"INVENTORY_EFFECT":0,"NAMESPACE":0,"IMPORT_BATCH":0}'::jsonb,'expected',expected);
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',payload->>'manifest_ref',request->>'package_manifest_sha256',(request->>'cutoff_at')::timestamptz,'STANDARD_INITIAL_EXPLICIT_KEYS_V1','CUTOFF_STOCK_BASELINE','STAGED',cp,transaction_timestamp());
  phase:='INITIALIZE';action_name:='IMPORT_INITIALIZE_CURRENT_ADMIN';old_cp:=NULL;
 ELSIF command_phase='DOCUMENTS' AND payload->>'mode'='STAGE' THEN
  IF payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}' OR payload->'expected_sequence'<>'null' OR payload->'rows'<>'[]' OR payload->'documents'<>'[]' THEN
   RAISE EXCEPTION 'STANDARD_DOCUMENT_STAGE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid FOR UPDATE;
  IF baseline.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR baseline.status<>'IMPORTED' OR baseline.source_name<>request->>'namespace'
    OR baseline.source_hash<>request->>'package_manifest_sha256' OR baseline.cutoff_at<>(request->>'cutoff_at')::timestamptz THEN RAISE EXCEPTION 'STANDARD_BASELINE_MISMATCH_NO_REBASELINE' USING ERRCODE='23514'; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->'payload'->>'document_batch_id'<>batch::text OR payload->'expected' IS DISTINCT FROM initial_request->'payload'->'expected_documents' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_PLAN_MISMATCH' USING ERRCODE='23514'; END IF;
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"SALES_HEADER":0,"SALES_LINE":0,"SALES_SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0,"IMPORT_BATCH":0}'::jsonb,'expected',payload->'expected');
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',baseline.source_manifest_ref,request->>'package_manifest_sha256',baseline.cutoff_at,'DOCUMENT_CONVERSION_V1','DOCUMENT_CONVERSION','STAGED',cp,transaction_timestamp());
  phase:='DOCUMENT_STAGE';action_name:='IMPORT_STAGE';old_cp:=NULL;
 ELSE
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=batch FOR UPDATE;
  IF b.status NOT IN ('STAGED','VALIDATING') OR b.source_name<>request->>'namespace' OR b.source_hash<>request->>'package_manifest_sha256'
   OR b.cutoff_at<>(request->>'cutoff_at')::timestamptz OR (payload->>'expected_sequence')::integer IS DISTINCT FROM (b.checkpoint->>'sequence')::integer THEN RAISE EXCEPTION 'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT' USING ERRCODE='23514'; END IF;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' THEN baseline:=b;
  ELSE SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->>'plan_sha256'<>request->>'plan_sha256' THEN RAISE EXCEPTION 'STANDARD_EXECUTION_PLAN_CONFLICT' USING ERRCODE='23514'; END IF;
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;
  -- Mode and bounds come only from the original immutable INIT, never a chunk.
  master_chunks_v2:=cfg ? 'execution_contract';
  IF master_chunks_v2 THEN execution_contract:=cfg->'execution_contract';max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF jsonb_typeof(payload->'expected_sequence') IS DISTINCT FROM 'number' OR (payload->>'expected_sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (payload->>'expected_sequence')::numeric>2147483646 THEN RAISE EXCEPTION 'STANDARD49_EXPECTED_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(old_cp->'sequence') IS DISTINCT FROM 'number' OR (old_cp->>'sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (old_cp->>'sequence')::numeric>=2147483646 THEN RAISE EXCEPTION 'STANDARD49_AUDIT_SEQUENCE_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='MASTER' AND (jsonb_array_length(payload->'rows')>max_master_chunk_rows
    OR (old_cp->>'sequence')::numeric>=expected_master_chunks
    OR ((old_cp->>'sequence')::numeric=expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')<>(old_cp->'expected'->>'MASTER')::numeric)
    OR ((old_cp->>'sequence')::numeric<expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')>=(old_cp->'expected'->>'MASTER')::numeric)) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_CHUNK_PROGRESS_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='KEYS' AND ((old_cp->>'sequence')::numeric<expected_master_chunks OR old_cp->'counts'->'MASTER' IS DISTINCT FROM old_cp->'expected'->'MASTER') THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_PHASE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'documents')<1 THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='PUBLISH' THEN
   IF payload-ARRAY['phase','expected_sequence','baseline_batch_id','approval_record_id']<>'{}' OR payload->>'phase' NOT IN ('BASELINE','DOCUMENTS')
    OR (payload->>'baseline_batch_id')::uuid<>baseline.id OR (payload->>'phase'='BASELINE') IS DISTINCT FROM (b.inventory_mode='CUTOFF_STOCK_BASELINE') THEN RAISE EXCEPTION 'STANDARD_PUBLISH_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'STANDARD_COMMAND_KIND_INVALID' USING ERRCODE='23514'; END IF;
  phase:=CASE command_phase WHEN 'MASTER' THEN 'MASTER' WHEN 'KEYS' THEN 'KEYS' WHEN 'DOCUMENTS' THEN 'DOCUMENTS' ELSE CASE payload->>'phase' WHEN 'BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END END;
  action_name:=CASE command_phase WHEN 'PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND source_entity_type='BATCH_NAMESPACE_BINDING') THEN
   fields:=jsonb_build_object('batch_id',batch,'source_system',b.source_name,'manifest_sha256',b.source_hash,'registry_sha256',cfg->>'registry_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',cfg->>'namespace_record_id','entity_type','BATCH_NAMESPACE_BINDING','source_key',batch::text,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,
    'fields',fields,'source_hash',encode(sha256(convert_to(fields::text,'UTF8')),'hex')));
  END IF;
  IF command_phase IN ('MASTER','DOCUMENTS','KEYS') THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows') LOOP
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF master_chunks_v2 AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind)) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
      IF fields->parent_row.attname IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->parent_row.attname) IS DISTINCT FROM 'string'
        OR (parent_row.atttypid=20 AND (fields->>parent_row.attname ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true)
        OR (parent_row.atttypid=1700 AND (fields->>parent_row.attname ~ '^-?(0|[1-9][0-9]*)[.][0-9]{2}$') IS DISTINCT FROM true)) THEN
       RAISE EXCEPTION 'STANDARD_EXACT_NUMERIC_STRING_REQUIRED: %',parent_row.attname USING ERRCODE='23514'; END IF;
     END LOOP;
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
    'source_hash',CASE phase WHEN 'DOCUMENT_PUBLISH' THEN b.source_hash ELSE encode(sha256(convert_to(fields::text,'UTF8')),'hex') END));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
   kind:=item->>'target_type';counter:=CASE WHEN item->>'entity_type'='BATCH_NAMESPACE_BINDING' THEN 'NAMESPACE' WHEN kind IN ('IMPORT_BATCH','INVENTORY_KEY','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN kind ELSE 'MASTER' END;
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::numeric+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::numeric+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  IF total<0 OR total>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 IF (cp->>'sequence')::numeric>2147483646 OR (cp->>'cursor')::numeric>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
 -- The public request, typed intents and exact result are prepared before native
 -- mutations. All final-state validators run deferred; no guard is disabled.
 result:=jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','operationId',operation,'batchId',batch,'sequence',cp->'sequence','cursor',cp->'cursor',
  'status',CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' WHEN command_phase='INITIALIZE' OR phase='DOCUMENT_STAGE' THEN 'STAGED' ELSE 'VALIDATING' END,
  'ledgerEntryIds',ledger_ids,'sourceRecordIds',source_ids,'phase',phase,'planSha256',request->>'plan_sha256','packageManifestSha256',request->>'package_manifest_sha256',
  'baselineBatchId',CASE WHEN command_phase='INITIALIZE' THEN batch ELSE baseline.id END,'documentBatchId',CASE WHEN command_phase='INITIALIZE' THEN payload->>'document_batch_id' ELSE initial_request->'payload'->>'document_batch_id' END);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END),transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind);fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
    RAISE EXCEPTION 'STANDARD_EXACT_TYPED_FIELDS_REQUIRED: %',kind USING ERRCODE='23514'; END IF;
   IF actual IS NOT NULL THEN
    IF command_phase<>'MASTER' OR item->>'identity_basis' IS DISTINCT FROM 'EXISTING_VERIFIED' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_EXISTING_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
   ELSE
    IF kind='TRANSFER_LINE' THEN
     INSERT INTO naijue_erp.transfer_line(id,transfer_id,line_no,sku_id,quantity,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot,is_current)
      SELECT t.id,t.transfer_id,t.line_no,t.sku_id,t.quantity,t.product_code_snapshot,t.product_name_snapshot,t.color_name_snapshot,t.fit_name_snapshot,t.size_name_snapshot,t.barcode_snapshot,t.is_current FROM jsonb_populate_record(NULL::naijue_erp.transfer_line,fields) t;
    ELSE EXECUTE format('INSERT INTO naijue_erp.%I SELECT (jsonb_populate_record(NULL::naijue_erp.%I,$1)).*',table_name,table_name) USING fields; END IF;
   END IF;
  END LOOP;
 ELSIF command_phase='KEYS' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'='INVENTORY_KEY' LOOP
   fields:=item->'fields';quantity:=(fields->>'quantity')::bigint;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='WAREHOUSE' AND target_id=(fields->>'warehouse_id')::uuid)
     OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='SKU' AND target_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid) THEN RAISE EXCEPTION 'STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
   IF quantity<>0 THEN
    INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_document_version,endpoint,business_date,posted_at,source_import_batch_id)
     VALUES((item->>'ledger_entry_id')::uuid,operation,'CUTOFF_BASELINE',(fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,NULL,'IMPORT_BASELINE',left(request->>'cutoff_at',10)::date,transaction_timestamp(),batch);
    INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
     VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
   END IF;
  END LOOP;
 END IF;
 IF command_phase='DOCUMENTS' AND phase='DOCUMENTS' THEN
  anchor_baseline:=jsonb_build_object('state','CONFIRMED','baselineBatchId',baseline.id,'baselineManifestSha256',baseline.source_hash,'cutoffAt',baseline.cutoff_at,'coverageDigest',cfg->>'alignment_sha256');
  FOR doc IN SELECT value FROM jsonb_array_elements(payload->'documents') LOOP
   IF doc-ARRAY['kind','id','operation_id','request_key','source_record_id']<>'{}' OR doc->>'kind' NOT IN ('SALES','TRANSFER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_MANIFEST_INVALID' USING ERRCODE='23514'; END IF;
   kind:=doc->>'kind';doc_id:=(doc->>'id')::uuid;child_op:=(doc->>'operation_id')::uuid;snap:=naijue_erp.unified_document_snapshot(kind,doc_id);
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE id=(doc->>'source_record_id')::uuid AND import_batch_id=batch AND target_id=doc_id AND target_type=kind||'_HEADER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_SOURCE_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
   child_result:=jsonb_build_object('operationId',child_op,CASE kind WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END,doc_id,'version',(snap->'header'->>'version')::integer,
    'status',snap->'header'->>'status','ledgerEntryIds','[]'::jsonb,'batchId',batch,'sourceRecordId',doc->>'source_record_id','exposureDigest',encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'baseline',anchor_baseline);
   INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
    VALUES(child_op,actor,doc->>'request_key',encode(sha256(convert_to(doc::text||snap::text,'UTF8')),'hex'),'MIGRATE_DOCUMENT',kind,doc_id,'COMMITTED',child_result,transaction_timestamp());
   INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
    VALUES(child_op,child_op,actor,kind,doc_id,'MIGRATE_DOCUMENT',NULL,(snap->'header'->>'version')::integer,NULL,snap||jsonb_build_object('baseline',anchor_baseline,'sourceRecordId',doc->>'source_record_id'),transaction_timestamp());
  END LOOP;
 END IF;
 IF command_phase='PUBLISH' THEN
  IF cp->'counts' IS DISTINCT FROM cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
  IF phase='BASELINE_SEAL' THEN
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch sealed_baseline WHERE sealed_baseline.id=baseline.id AND sealed_baseline.status='IMPORTED' AND sealed_baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
     AND sealed_baseline.source_hash=b.source_hash AND sealed_baseline.source_name=b.source_name AND sealed_baseline.cutoff_at=b.cutoff_at) THEN RAISE EXCEPTION 'STANDARD_ACTIVATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch AND s.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.action='MIGRATE_DOCUMENT' AND r.target_id=s.target_id AND r.target_type=CASE s.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN RAISE EXCEPTION 'STANDARD_MIGRATION_CLOSURE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF command_phase<>'INITIALIZE' AND phase<>'DOCUMENT_STAGE' THEN
  UPDATE naijue_erp.import_batch SET checkpoint=cp,status=CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' ELSE 'VALIDATING' END,
    completed_at=CASE WHEN command_phase='PUBLISH' THEN transaction_timestamp() ELSE NULL END WHERE id=batch;
 END IF;
 -- Execute the real retained deferred validators under this finite API owner,
 -- before returning to the execute-only role. No trigger or constraint is skipped.
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','COMMITTED','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $_$;


ALTER FUNCTION "naijue_erp"."standard_import_command"("request" "jsonb", "private_parameter" "text", "command_phase" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_document_chunk("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_document_chunk"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'DOCUMENTS'); $$;


ALTER FUNCTION "naijue_erp"."standard_import_document_chunk"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_identity("text", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_identity"("session_token" "text", "role_kind" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE selected text:=current_setting('role'); actual name; expected text; role_row record; account uuid; selected_hash text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'STANDARD_READ_COMMITTED_REQUIRED' USING ERRCODE='25000'; END IF;
 -- This is PostgreSQL's protected SET ROLE identity, not a custom application GUC.
 -- Controller session_user may remain privileged: evidence is SET_ROLE_ONLY_NOT_NONOWNER_LOGIN.
 actual:=CASE WHEN selected='none' THEN session_user ELSE selected::name END;
 expected:=CASE role_kind WHEN 'INITIALIZER' THEN 'erp_unified27_initializer_2393dbc6db9581c2'
  WHEN 'IMPORTER' THEN 'erp_unified27_importer_2393dbc6db9581c2'
  WHEN 'ROLE_IMPORTER' THEN 'erp_unified27_importer_2393dbc6db9581c2'
  WHEN 'INSPECT' THEN actual::text ELSE NULL END;
 IF expected IS NULL OR actual::text<>expected OR (role_kind='INSPECT' AND actual::text NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')) THEN
  RAISE EXCEPTION 'STANDARD_PROTECTED_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT role_row FROM pg_roles WHERE rolname=actual;
 IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR role_row.rolbypassrls
  OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_row.oid)
  OR role_row.oid IN ((SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_database WHERE datname=current_database()))
  OR NOT pg_has_role(session_user,role_row.oid,'SET') THEN RAISE EXCEPTION 'STANDARD_PROTECTED_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 IF role_kind IN ('INITIALIZER','ROLE_IMPORTER') OR (role_kind='INSPECT' AND actual::text='erp_unified27_initializer_2393dbc6db9581c2') THEN RETURN NULL; END IF;
 IF session_token IS NULL OR session_token !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Canonical unpadded base64url encoding has only four significant final bits.
 IF right(session_token,1) !~ '^[AEIMQUYcgkosw048]$' THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 selected_hash:=encode(sha256(convert_to('naijue-erp:session:v1:'||session_token,'UTF8')),'hex');
 SELECT a.id INTO account FROM naijue_erp.auth_session se JOIN naijue_erp.user_account a ON a.id=se.account_id
  JOIN naijue_erp.staff st ON st.id=a.staff_id LEFT JOIN naijue_erp.hall h ON h.id=st.hall_id
  WHERE se.token_hash=selected_hash AND se.revoked_at IS NULL AND se.created_at<=clock_timestamp() AND se.expires_at>clock_timestamp()
   AND se.auth_version=a.auth_version AND a.login_enabled AND st.employment_status='在职' AND st.role='ADMIN' AND (st.hall_id IS NULL OR h.enabled)
  FOR SHARE OF se,a,st;
 IF account IS NULL THEN RAISE EXCEPTION 'STANDARD_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN account;
END $_$;


ALTER FUNCTION "naijue_erp"."standard_import_identity"("session_token" "text", "role_kind" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_inspect_target("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_inspect_target"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE system_identifier text; database_oid text; fingerprint text; actor uuid; metadata jsonb;
BEGIN
 IF request IS DISTINCT FROM '{"protocol":"STANDARD_IMPORT_SQL_V1"}'::jsonb THEN RAISE EXCEPTION 'STANDARD_INSPECT_REQUEST_INVALID' USING ERRCODE='23514'; END IF;
 actor:=naijue_erp.standard_import_identity(session_token,'INSPECT');
 SELECT c.system_identifier::text INTO STRICT system_identifier FROM pg_control_system() c;
 SELECT oid::text INTO STRICT database_oid FROM pg_database WHERE datname=current_database();
 SELECT jsonb_build_object('routines',(SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner,coalesce(p.proacl::text,''),pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace),
  'relations',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relowner,c.relrowsecurity,coalesce(c.relacl::text,'')) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(c.conname,c.conrelid::regclass::text,pg_get_constraintdef(c.oid),c.convalidated) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace='naijue_erp'::regnamespace),
  'policies',(SELECT jsonb_agg(jsonb_build_array(p.polrelid::regclass::text,p.polname,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='naijue_erp'::regnamespace)) INTO metadata;
 fingerprint:=encode(sha256(convert_to(metadata::text,'UTF8')),'hex');
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','system_identifier',system_identifier,'database_oid',database_oid,'database_name',current_database(),'catalog_sha256',fingerprint,
  'current_user',current_user,'session_user',session_user,'role_mode',current_setting('role'),'proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $$;


ALTER FUNCTION "naijue_erp"."standard_import_inspect_target"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_master_chunk("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_master_chunk"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'MASTER'); $$;


ALTER FUNCTION "naijue_erp"."standard_import_master_chunk"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_record_proof("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_record_proof"("record_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE s naijue_erp.import_record%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; pointer jsonb; item jsonb;
BEGIN
 SELECT * INTO STRICT s FROM naijue_erp.import_record WHERE id=record_id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=s.import_batch_id;
 pointer:=s.decision_reason::jsonb;
 IF pointer->>'format'<>'STANDARD_IMPORT_POINTER_V1' OR pointer-ARRAY['format','code','operationId']<>'{}' OR pointer->>'code'<>'SOURCE_BOUND' THEN
  RAISE EXCEPTION 'STANDARD_RECORD_POINTER_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(pointer->>'operationId')::uuid;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'id'=s.id::text;
 IF s.status<>'IMPORTED' OR s.reviewed_at IS NULL OR s.source_system<>b.source_name OR r.target_type<>'IMPORT' OR r.target_id<>b.id
  OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action
  OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR item->>'source_key'<>s.source_key OR item->>'entity_type'<>s.source_entity_type OR item->>'target_type'<>s.target_type
  OR item->>'target_id'<>s.target_id::text OR item->>'source_hash'<>s.source_record_hash OR item->>'file_ref'<>s.source_file_ref
  OR r.result_data->>'packageManifestSha256'<>b.source_hash OR a.after_values->'request'->>'namespace'<>b.source_name THEN
  RAISE EXCEPTION 'STANDARD_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
 RETURN item||jsonb_build_object('operation_id',r.id,'batch_id',b.id,'source_system',b.source_name,'source_hash',b.source_hash,'cutoff_at',b.cutoff_at,
  'current_operation',(SELECT rr.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint FROM naijue_erp.operation_receipt rr WHERE rr.id=r.id));
END $$;


ALTER FUNCTION "naijue_erp"."standard_import_record_proof"("record_id" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_row_intent("text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_row_intent"("kind" "text", "native_row" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE a naijue_erp.audit_change%ROWTYPE; item jsonb; expected jsonb; table_name text;
BEGIN
 IF current_setting('role') NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') THEN RETURN false; END IF;
 IF native_row ? 'id' AND native_row->>'id' IS NOT NULL THEN
  DECLARE source_ids uuid[]; proof jsonb; exact_audit naijue_erp.audit_change%ROWTYPE;
  BEGIN
   SELECT array_agg(s.id) INTO source_ids FROM naijue_erp.import_batch b JOIN naijue_erp.import_record s
    ON s.import_batch_id=b.id AND s.target_type=kind AND s.target_id=(native_row->>'id')::uuid AND s.status='IMPORTED' AND s.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%'
    WHERE b.mapping_version IN ('STANDARD_INITIAL_EXPLICIT_KEYS_V1','DOCUMENT_CONVERSION_V1')
     AND s.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
   IF cardinality(source_ids)=1 THEN
    SELECT intent_audit.* INTO STRICT exact_audit FROM naijue_erp.audit_change intent_audit JOIN naijue_erp.import_record source_record ON intent_audit.operation_id=(source_record.decision_reason::jsonb->>'operationId')::uuid WHERE source_record.id=source_ids[1];
    IF exact_audit.after_values ? 'whole_package_v2' THEN
     proof:=naijue_erp.standard_import_record_proof(source_ids[1]);
     PERFORM naijue_erp.standard_whole_package_context_v2((exact_audit.after_values->'whole_package_v2'->>'root_operation')::uuid);
     IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') OR proof->'current_operation' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
     EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(kind COLLATE "C")) INTO expected USING proof->'fields';
     RETURN expected=native_row;
    END IF;
   END IF;
  END;
 END IF;
 table_name:=lower(kind);
 IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN RETURN false; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'target_type'=kind LOOP
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF expected=native_row THEN RETURN true; END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $_$;


ALTER FUNCTION "naijue_erp"."standard_import_row_intent"("kind" "text", "native_row" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_status("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_status"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE actor uuid; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 IF current_setting('role')='erp_unified27_initializer_2393dbc6db9581c2' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(request->'payload'->'admin'->>'account_id')::uuid;
 ELSE actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER'); END IF;
 IF request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR coalesce(length(request->>'request_key'),0)=0 OR actor IS NULL THEN RAISE EXCEPTION 'STANDARD_STATUS_REQUEST_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO r FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF NOT FOUND THEN RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',request->>'operation_id','batch_id',request->>'batch_id','request_sha256',NULL,'state','ABSENT','sequence',NULL,'cursor',NULL,'receipt',NULL); END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 IF r.id::text IS DISTINCT FROM request->>'operation_id' OR r.target_id::text IS DISTINCT FROM request->>'batch_id' OR a.after_values->'request' IS DISTINCT FROM request
  OR r.target_type<>'IMPORT' OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR (current_setting('role')='erp_unified27_initializer_2393dbc6db9581c2' AND r.action<>'IMPORT_INITIALIZE_CURRENT_ADMIN') THEN
  RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',r.id,'batch_id',r.target_id,'request_sha256',r.request_hash,'state','COMMITTED','sequence',r.result_data->'sequence','cursor',r.result_data->'cursor','receipt',r.result_data);
END $$;


ALTER FUNCTION "naijue_erp"."standard_import_status"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_import_verify("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_import_verify"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE actor uuid; publication_status jsonb; documents_batch naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE;
 source_counts jsonb:='{}'; documents jsonb:='[]'; inventory_keys jsonb:='[]'; counts bigint; kind text; current_version integer; initial_version integer; expected_version integer; steps integer;
 source_row record; header_row record; step record; stock_key record; row_value jsonb; prior_value jsonb; header_expected jsonb; header_actual jsonb; lines_expected jsonb; lines_actual jsonb;
 settlements_expected jsonb; settlements_actual jsonb; retired jsonb; snap jsonb; current_snap jsonb; before_header jsonb; after_header jsonb; field record; evidence_value jsonb;
 proof jsonb; admission record; quantity numeric; ledger_total numeric; effects bigint; balance naijue_erp.inventory_balance%ROWTYPE; has_balance boolean; item record;
 initial_receipt naijue_erp.operation_receipt%ROWTYPE; initial_audit naijue_erp.audit_change%ROWTYPE; initialized jsonb; source_total bigint; expected_counts jsonb;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER');
 publication_status:=naijue_erp.standard_import_status(request,session_token);
 IF publication_status->>'state'<>'COMMITTED' OR publication_status->'receipt'->>'phase'<>'DOCUMENT_PUBLISH' OR NOT naijue_erp.standard_business_ready() THEN RAISE EXCEPTION 'STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(publication_status->'receipt'->>'baselineBatchId')::uuid;
 SELECT a.after_values->'request'->'payload' INTO STRICT initialized FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
 -- Fence every imported header first, then every actual inventory key in the
 -- same global ordering used by ordinary commands. This is a live readback,
 -- not receipt counting and not an attempt to restore original current values.
 FOR header_row IN SELECT h.id FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR header_row IN SELECT h.id FROM naijue_erp.transfer_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id
    FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
     LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
    WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
   PERFORM naijue_erp.inventory_key_lock(stock_key.warehouse_id,stock_key.sku_id);
   PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id FOR SHARE;
 END LOOP;
 FOR kind IN SELECT unnest(ARRAY['HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','INVENTORY_KEY','IMPORT_BATCH']) LOOP
  SELECT count(*) INTO counts FROM naijue_erp.import_record WHERE import_batch_id IN (baseline.id,documents_batch.id) AND target_type=kind AND status='IMPORTED';
  source_counts:=source_counts||jsonb_build_object(kind,counts);
 END LOOP;
 IF source_counts->>'IMPORT_BATCH'<>'3' OR (source_counts->>'INVENTORY_KEY')::numeric<>(baseline.checkpoint->'expected'->>'INVENTORY_KEY')::numeric THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 FOR kind IN SELECT jsonb_object_keys(initialized->'expected_master_counts') LOOP
  IF source_counts->kind IS DISTINCT FROM initialized->'expected_master_counts'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'] LOOP
  IF source_counts->kind IS DISTINCT FROM documents_batch.checkpoint->'expected'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR source_row IN SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' ORDER BY s.id LOOP
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF source_row.target_type NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
   IF source_row.target_type='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.size_group_member t WHERE size_group_id=(proof->'fields'->>'size_group_id')::uuid AND size_id=(proof->'fields'->>'size_id')::uuid FOR SHARE;
   ELSIF source_row.target_type='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(proof->'fields'->>'payment_account_id')::uuid AND hall_id=(proof->'fields'->>'hall_id')::uuid FOR SHARE;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1 FOR SHARE',lower(source_row.target_type)) INTO row_value USING source_row.target_id; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(source_row.target_type)) INTO prior_value USING proof->'fields';
   IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR source_row IN SELECT * FROM naijue_erp.import_record WHERE import_batch_id=documents_batch.id AND target_type IN ('SALES_HEADER','TRANSFER_HEADER') ORDER BY target_type,target_id LOOP
  kind:=CASE source_row.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END;
  SELECT * INTO STRICT initial_receipt FROM naijue_erp.operation_receipt WHERE target_type=kind AND target_id=source_row.target_id AND action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT initial_audit FROM naijue_erp.audit_change WHERE operation_id=initial_receipt.id;
  snap:=initial_audit.after_values-ARRAY['baseline','sourceRecordId'];current_snap:=naijue_erp.unified_document_snapshot(kind,source_row.target_id);
  initial_version:=initial_audit.new_version;current_version:=(current_snap->'header'->>'version')::integer;expected_version:=initial_version;steps:=0;retired:='{}';
  IF initial_receipt.actor_account_id<>initial_audit.actor_account_id OR initial_audit.old_version IS NOT NULL OR initial_audit.before_values IS NOT NULL
   OR initial_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
   OR initial_audit.after_values->>'sourceRecordId'<>source_row.id::text OR current_version<initial_version THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORIGINAL_MIGRATION_INVALID' USING ERRCODE='23514'; END IF;
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF kind='SALES' THEN
   row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
  ELSE row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header')); END IF;
  IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'lines') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type=kind||'_LINE' AND s.target_id=(row_value->>'id')::uuid;
   IF kind='SALES' THEN prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof->'fields'));evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,row_value));
   ELSE prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,proof->'fields'))-'current_line_no';evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,row_value))-'current_line_no'; END IF;
   IF prior_value IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'settlements') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type='SALES_SETTLEMENT' AND s.target_id=(row_value->>'id')::uuid;
   IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,row_value)) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_SETTLEMENT_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at']) key LOOP
   IF current_snap->'header'->field.key IS DISTINCT FROM snap->'header'->field.key THEN RAISE EXCEPTION 'STANDARD_VERIFY_IMMUTABLE_DOCUMENT_ORIGIN_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF kind='SALES' THEN
   header_expected:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
   header_actual:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_line_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.unified_sales_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.sales_line l WHERE sales_id=source_row.target_id;
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_settlement_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_settlement,v))),'{}') INTO settlements_expected FROM jsonb_array_elements(snap->'settlements') v;
   SELECT coalesce(jsonb_object_agg(s.id::text,naijue_erp.unified_sales_settlement_audit_values(s)),'{}') INTO settlements_actual FROM naijue_erp.sales_settlement s WHERE sales_id=source_row.target_id;
  ELSE
   header_expected:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header'));
   header_actual:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.transfer_line_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.transfer_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.transfer_line l WHERE transfer_id=source_row.target_id;
   settlements_expected:='{}';settlements_actual:='{}';
   IF current_snap->'header'->'created_role' IS DISTINCT FROM snap->'header'->'created_role' THEN RAISE EXCEPTION 'STANDARD_VERIFY_CREATION_ROLE_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  FOR step IN SELECT a.*,r.actor_account_id receipt_actor,r.action receipt_action,r.target_type receipt_kind,r.target_id receipt_target,r.completed_at,r.result_data,r.status receipt_status
   FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type=kind AND a.object_id=source_row.target_id AND a.new_version>initial_version AND a.new_version<=current_version ORDER BY a.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version<>expected_version+1 OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE','VOID') OR step.action<>step.receipt_action
    OR step.receipt_kind<>kind OR step.receipt_target<>source_row.target_id OR step.actor_account_id<>step.receipt_actor OR step.receipt_status<>'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.result_data->>'version'<>step.new_version::text THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORDINARY_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header';after_header:=step.after_values->'header';
   FOR field IN SELECT * FROM jsonb_each(before_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    IF header_expected->field.key IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_HEADER_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR field IN SELECT * FROM jsonb_each(after_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    header_expected:=jsonb_set(header_expected,ARRAY[field.key],evidence_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) LOOP
    IF lines_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'lines','[]')) LOOP
    IF lines_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) v WHERE v->>'id'=row_value->>'id') THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    lines_expected:=jsonb_set(lines_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) LOOP
    IF settlements_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id') THEN
     settlements_expected:=settlements_expected-(row_value->>'id');retired:=retired||jsonb_build_object(row_value->>'id',true);
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) LOOP
    IF retired ? (row_value->>'id') OR (settlements_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id')) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    settlements_expected:=jsonb_set(settlements_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   expected_version:=step.new_version;steps:=steps+1;
  END LOOP;
  IF expected_version<>current_version OR header_expected IS DISTINCT FROM header_actual OR lines_expected IS DISTINCT FROM lines_actual OR settlements_expected IS DISTINCT FROM settlements_actual THEN
   RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_NATIVE_PROJECTION_DIFFERS' USING ERRCODE='23514'; END IF;
  IF steps=0 AND current_snap IS DISTINCT FROM snap THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNCHANGED_NATIVE_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  documents:=documents||jsonb_build_array(jsonb_build_object('kind',kind,'id',source_row.target_id,'initial_version',initial_version,'current_version',current_version,'state',CASE WHEN steps=0 THEN 'UNCHANGED' ELSE 'VERIFIED_CHANGED_AFTER_IMPORT' END,'audit_steps',steps));
 END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
  proof:=naijue_erp.standard_inventory_key_proof(stock_key.warehouse_id,stock_key.sku_id);
  IF proof->>'state'='UNKNOWN' THEN
   SELECT * INTO STRICT admission FROM naijue_erp.inventory_key_admission(stock_key.warehouse_id,stock_key.sku_id);
   IF admission.admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNPROVEN_KEY_UNKNOWN_NOT_ZERO' USING ERRCODE='23514'; END IF;
   quantity:=0;proof:=jsonb_build_object('state','POST_CUTOFF_NATIVE');
  ELSE quantity:=(proof->'fields'->>'quantity')::numeric; END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO ledger_total,effects FROM naijue_erp.inventory_ledger WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.operation_receipt r ON r.id=l.operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id
   WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND (r.id IS NULL OR a.operation_id IS NULL OR r.status<>'COMMITTED' OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id
    OR a.object_type<>r.target_type OR a.action<>r.action OR a.occurred_at IS DISTINCT FROM r.completed_at OR NOT(r.result_data->'ledgerEntryIds' ? l.id::text))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_LEDGER_OPERATION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO balance FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;has_balance:=FOUND;
  IF (effects=0 AND (proof->>'state'<>'EXPLICIT_ZERO' OR has_balance)) OR (effects>0 AND (NOT has_balance OR balance.quantity::numeric<>ledger_total OR balance.version::numeric<>effects
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.id=balance.last_operation_id AND l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND r.completed_at=balance.updated_at))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_BALANCE_LEDGER_DIFFERS' USING ERRCODE='23514'; END IF;
  inventory_keys:=inventory_keys||jsonb_build_array(jsonb_build_object('warehouse_id',stock_key.warehouse_id,'sku_id',stock_key.sku_id,'coverage',proof->>'state','baseline_quantity',quantity::text,'ledger_total',ledger_total::text,'ledger_entries',effects,
   'balance_quantity',CASE WHEN has_balance THEN balance.quantity::text ELSE NULL END,'balance_version',CASE WHEN has_balance THEN balance.version ELSE NULL END,'verified',true));
 END LOOP;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','plan_sha256',request->>'plan_sha256','batch_id',documents_batch.id,'baseline_batch_id',baseline.id,'verified',true,'documents',documents,'source_counts',source_counts,
  'inventory_keys',inventory_keys,'scope','CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED','proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $_$;


ALTER FUNCTION "naijue_erp"."standard_import_verify"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_initialize_current_admin("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_initialize_current_admin"("request" "jsonb", "encoded_scrypt" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT naijue_erp.standard_import_command(request,encoded_scrypt,'INITIALIZE'); $$;


ALTER FUNCTION "naijue_erp"."standard_initialize_current_admin"("request" "jsonb", "encoded_scrypt" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_inventory_key_id("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_inventory_key_id"("warehouse" "uuid", "sku" "uuid") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT substring(encode(sha256(convert_to('[s"naijue-cutoff-v1",s"inventory-key-v1",s"'||warehouse::text||'",s"'||sku::text||'"]','UTF8')),'hex') FROM 1 FOR 32)::uuid;
$$;


ALTER FUNCTION "naijue_erp"."standard_inventory_key_id"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_inventory_key_proof("uuid", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_inventory_key_proof"("warehouse" "uuid", "sku" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE s naijue_erp.import_record%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; proof jsonb;
BEGIN
 IF NOT naijue_erp.standard_business_ready() AND current_setting('role')<>'erp_unified27_importer_2393dbc6db9581c2' THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;
 SELECT * INTO b FROM naijue_erp.import_batch WHERE inventory_mode='CUTOFF_STOCK_BASELINE' AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND status='IMPORTED';
 IF NOT FOUND THEN RETURN jsonb_build_object('state','UNKNOWN'); END IF;
 SELECT * INTO s FROM naijue_erp.import_record WHERE import_batch_id=b.id AND target_type='INVENTORY_KEY' AND target_id=naijue_erp.standard_inventory_key_id(warehouse,sku) AND status='IMPORTED';
 IF NOT FOUND THEN RETURN jsonb_build_object('state','UNKNOWN','baseline_batch_id',b.id); END IF;
 proof:=naijue_erp.standard_import_record_proof(s.id);
 IF proof->'fields'->>'warehouse_id'<>warehouse::text OR proof->'fields'->>'sku_id'<>sku::text THEN RAISE EXCEPTION 'STANDARD_KEY_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 RETURN proof||jsonb_build_object('state',CASE WHEN (proof->'fields'->>'quantity')::bigint=0 THEN 'EXPLICIT_ZERO' ELSE 'NONZERO' END,'baseline_batch_id',b.id);
END $$;


ALTER FUNCTION "naijue_erp"."standard_inventory_key_proof"("warehouse" "uuid", "sku" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_publish_import("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_publish_import"("request" "jsonb", "session_token" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$ SELECT naijue_erp.standard_import_command(request,session_token,'PUBLISH'); $$;


ALTER FUNCTION "naijue_erp"."standard_publish_import"("request" "jsonb", "session_token" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_closed_v2("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_closed_v2"("root_operation" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
 baseline_sealed boolean:=false; documents_staged boolean:=false; documents_published boolean:=false;
BEGIN
 SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 init:=root_a.after_values->'request';baseline_id:=(init->>'batch_id')::uuid;documents_id:=(init->'payload'->>'document_batch_id')::uuid;
 IF root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
  OR root_a.after_values->'whole_package_v2'->'ordinal' IS DISTINCT FROM '0'::jsonb
  OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR baseline_id=documents_id
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text
   ORDER BY (after_values->'whole_package_v2'->>'ordinal')::integer LOOP
  ordinal:=(a.after_values->'whole_package_v2'->>'ordinal')::integer;
  IF ordinal IS DISTINCT FROM expected_ordinal THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  IF ordinal>0 AND a.after_values->'whole_package_v2' IS DISTINCT FROM
    jsonb_build_object('root_operation',root_operation,'ordinal',ordinal) THEN
   RAISE EXCEPTION 'WHOLE_CHILD_MARKER_INVALID' USING ERRCODE='23514'; END IF;
  expected_ordinal:=expected_ordinal+1;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  rank:=CASE a.after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 ELSE NULL END;
  command_phase:=CASE a.after_values->>'phase' WHEN 'BASELINE_SEAL' THEN 'PUBLISH' WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' WHEN 'DOCUMENT_STAGE' THEN 'DOCUMENTS' ELSE a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR r.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id NOT IN (baseline_id,documents_id)
   OR r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN baseline_id ELSE documents_id END)
   OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.object_id IS DISTINCT FROM r.target_id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR a.id IS DISTINCT FROM r.id OR a.action IS DISTINCT FROM r.action OR a.occurred_at IS DISTINCT FROM root_r.completed_at OR r.completed_at IS DISTINCT FROM root_r.completed_at
   OR a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR a.after_values->'request'->>'namespace' IS DISTINCT FROM init->>'namespace'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM init->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM init->>'package_manifest_sha256'
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM init->>'cutoff_at'
   OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
   OR (ordinal>0 AND r.request_hash IS DISTINCT FROM encode(sha256(convert_to(command_phase||':'||(a.after_values->'request')::text,'UTF8')),'hex'))
   OR a.before_values IS DISTINCT FROM previous->(r.target_id::text)
   OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1
  THEN RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
  -- A committed receipt must prove the whole lifecycle independently of the writer.
  -- MASTER/KEYS/DOCUMENTS chunks may repeat; boundary transitions may not.
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged)
   OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514'; END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
  last_rank:=rank;previous:=jsonb_set(previous,ARRAY[r.target_id::text],a.after_values->'checkpoint');
  last_status:=jsonb_set(last_status,ARRAY[r.target_id::text],r.result_data->'status');final_result:=r.result_data;
 END LOOP;
 IF NOT baseline_sealed OR NOT documents_staged OR NOT documents_published
  OR last_rank<>6 OR expected_ordinal<4 OR (SELECT count(*) FROM jsonb_object_keys(previous))<>2 THEN
  RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id) LOOP
  -- Reconcile both batch identities and declared totals to the immutable INIT,
  -- not merely to mutually agreeing live checkpoint/count values.
  IF b.source_manifest_ref IS DISTINCT FROM init->'payload'->>'manifest_ref'
   OR b.cutoff_at IS DISTINCT FROM (init->>'cutoff_at')::timestamptz
   OR b.mapping_version IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'STANDARD_INITIAL_EXPLICIT_KEYS_V1' ELSE 'DOCUMENT_CONVERSION_V1' END)
   OR b.inventory_mode IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'CUTOFF_STOCK_BASELINE' ELSE 'DOCUMENT_CONVERSION' END)
   OR b.created_at IS DISTINCT FROM root_r.completed_at
   OR b.completed_at IS DISTINCT FROM root_r.completed_at
   OR b.checkpoint->'expected' IS DISTINCT FROM
     (CASE WHEN b.id=baseline_id THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END)
  THEN RAISE EXCEPTION 'WHOLE_BATCH_INITIALIZATION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_closed_v2"("root_operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_command_v2("jsonb", "text", "text", "uuid", integer); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_command_v2"("request" "jsonb", "private_parameter" "text", "command_phase" "text", "root_operation" "uuid", "child_ordinal" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
 whole_context jsonb; whole_marker jsonb; prior_rank integer; next_rank integer;
 zero_descriptor jsonb;zero_evidence jsonb;zero_fact jsonb;zero_hash text;zero_sibling text;
 zero_index integer;zero_width integer;zero_consumed bigint;zero_unique bigint;
BEGIN
 -- Every mutation and status uses this same real transaction lock barrier.
 PERFORM naijue_erp.cutoff_import_lock();
 IF jsonb_typeof(request) IS DISTINCT FROM 'object' OR request-ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload']<>'{}'
  OR NOT(request ?& ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload'])
  OR request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR jsonb_typeof(request->'payload') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(request) e WHERE e.key<>'payload' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR (request->>'plan_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (request->>'package_manifest_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (request->>'namespace' ~ '^[a-z][a-z0-9_.:-]*$') IS DISTINCT FROM true OR coalesce(length(request->>'request_key'),0)=0 THEN
  RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;batch:=(request->>'batch_id')::uuid;payload:=request->'payload';
 IF operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_REQUIRED' USING ERRCODE='23514'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF root_operation IS DISTINCT FROM operation OR child_ordinal IS DISTINCT FROM 0 OR NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE
  whole_context:=naijue_erp.standard_whole_package_context_v2(root_operation);
  actor:=(whole_context->>'actor')::uuid;
  IF request->>'namespace' IS DISTINCT FROM whole_context->'request'->>'namespace'
   OR request->>'plan_sha256' IS DISTINCT FROM whole_context->'request'->>'plan_sha256'
   OR request->>'package_manifest_sha256' IS DISTINCT FROM whole_context->'request'->>'package_manifest_sha256'
   OR request->>'cutoff_at' IS DISTINCT FROM whole_context->'request'->>'cutoff_at'
   OR batch NOT IN ((whole_context->'request'->>'batch_id')::uuid,(whole_context->'request'->'payload'->>'document_batch_id')::uuid)
   OR private_parameter IS NOT NULL THEN RAISE EXCEPTION 'WHOLE_REQUEST_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF child_ordinal IS NULL OR child_ordinal<1 OR child_ordinal<>(SELECT count(*) FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text)
   OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text)
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  next_rank:=CASE command_phase WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'PUBLISH' THEN CASE payload->>'phase' WHEN 'BASELINE' THEN 3 WHEN 'DOCUMENTS' THEN 6 END WHEN 'DOCUMENTS' THEN CASE payload->>'mode' WHEN 'STAGE' THEN 4 WHEN 'CHUNK' THEN 5 END END;
  SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
   FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;
  IF next_rank IS NULL OR prior_rank IS NULL OR next_rank<prior_rank OR prior_rank=6 THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN RAISE EXCEPTION 'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'schema_declarations_sha256' AND (jsonb_typeof(payload->'schema_declarations_sha256') IS DISTINCT FROM 'string' OR payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')) THEN
   RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_staff_hall_approval' THEN
   expected:=payload->'historical_staff_hall_approval';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR expected-ARRAY['utf8','sha256']<>'{}'
    OR NOT(expected ?& ARRAY['utf8','sha256']) OR jsonb_typeof(expected->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(expected->>'utf8','UTF8')) NOT BETWEEN 1 AND 1048576
    OR (expected->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(expected->>'utf8','UTF8')),'hex') IS DISTINCT FROM expected->>'sha256'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   expected:=(expected->>'utf8')::jsonb;
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
    OR expected-ARRAY['format_version','source_namespace','evidence_sha256','staff']<>'{}'
    OR NOT(expected ?& ARRAY['format_version','source_namespace','evidence_sha256','staff'])
    OR expected->>'format_version' IS DISTINCT FROM 'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'
    OR expected->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (expected->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(expected->'staff') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(expected->'staff') NOT BETWEEN 1 AND 1000
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(expected->'staff') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['source_key','target_id','source_refs']<>'{}'
     OR NOT(item ?& ARRAY['source_key','target_id','source_refs'])
     OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR length(item->>'source_key')=0 OR item->>'source_key' ~ '[[:cntrl:]]' OR item->>'source_key' IS DISTINCT FROM btrim(item->>'source_key',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
     OR (item->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(item->'source_refs')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'source_refs') ref WHERE
     jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647
     OR (ref->'sheet'<>'null'::jsonb AND (length(ref->>'sheet')=0 OR ref->>'sheet' ~ '[[:cntrl:]]' OR ref->>'sheet' IS DISTINCT FROM btrim(ref->>'sheet',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))))
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF (SELECT count(DISTINCT ref) FROM jsonb_array_elements(item->'source_refs') ref)<>jsonb_array_length(item->'source_refs') THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE_REF' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  -- The trusted host derives this descriptor only after independently pinned
  -- complete-file verification. SQL proves membership, not external authority.
  IF payload ? 'explicit_zero_approval' THEN
   zero_descriptor:=payload->'explicit_zero_approval';
   IF jsonb_typeof(zero_descriptor) IS DISTINCT FROM 'object'
    OR zero_descriptor-ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256']<>'{}'
    OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256'])
    OR zero_descriptor->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_APPROVAL_MERKLE_V1'
    OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
    OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) e WHERE e.key<>'record_count' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
    OR (zero_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR (zero_descriptor->>'inventory_file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
    OR (zero_descriptor->>'merkle_root_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(zero_descriptor->'record_count') IS DISTINCT FROM 'number'
    OR (zero_descriptor->>'record_count' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
   IF (zero_descriptor->>'record_count')::numeric NOT BETWEEN 1 AND 250000
    OR (zero_descriptor->>'record_count')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_COUNT_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in.
  -- Its JS typed digests are opaque bindings in the immutable INIT request;
  -- they are never misrepresented as PostgreSQL jsonb::text hashes.
  IF payload ? 'execution_contract' THEN
   execution_contract:=payload->'execution_contract';master_chunks_v2:=true;
   IF jsonb_typeof(execution_contract) IS DISTINCT FROM 'object'
    OR execution_contract-ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256']<>'{}'
    OR NOT(execution_contract ?& ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256'])
    OR execution_contract->>'format_version' IS DISTINCT FROM 'UNIFIED_STANDARD_EXECUTION_PLAN_V2'
    OR execution_contract->>'compiler_version' IS DISTINCT FROM 'DEPENDENCY_ORDERED_STANDARD_PROGRAM_V2'
    OR execution_contract->>'scheduler_version' IS DISTINCT FROM 'UNIFIED_STANDARD_MASTER_CHUNK_PLAN_V2'
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('max_master_chunk_rows','master_chunks') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'number' OR (contract_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    OR (execution_contract->>'max_master_chunk_rows')::numeric NOT BETWEEN 1 AND 500
    OR (execution_contract->>'master_chunks')::numeric NOT BETWEEN 0 AND 2147483646
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'string' OR ((contract_field.value#>>'{}') ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'STANDARD49_V2_EXECUTION_CONTRACT_INVALID' USING ERRCODE='23514'; END IF;
   master_limit:=2147483647;max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_each(payload->'admin') admin_field WHERE jsonb_typeof(admin_field.value) IS DISTINCT FROM 'string') OR octet_length(payload->'admin'->>'login_name')>256 THEN RAISE EXCEPTION 'STANDARD49_V2_ADMIN_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(payload->'expected') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_master_counts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_documents') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(count_key ORDER BY count_key) FROM jsonb_object_keys(payload->'expected') count_key) IS DISTINCT FROM ARRAY['IMPORT_BATCH','INVENTORY_EFFECT','INVENTORY_KEY','MASTER','NAMESPACE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected') count_field WHERE jsonb_typeof(count_field.value) IS DISTINCT FROM 'number' OR (count_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR count_field.value::text::numeric>2147483647) THEN RAISE EXCEPTION 'STANDARD49_INITIAL_COUNTER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>master_limit)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>master_limit OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  IF (payload->'expected'->>'INVENTORY_EFFECT')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected'))>2147483647
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_documents'))>2147483647
   OR (payload->'expected_documents'->>'SALES_HEADER')::numeric+(payload->'expected_documents'->>'TRANSFER_HEADER')::numeric+1>2147483646 THEN RAISE EXCEPTION 'STANDARD49_INITIAL_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  IF master_chunks_v2 AND (((expected_master_chunks=0) IS DISTINCT FROM ((payload->'expected'->>'MASTER')::numeric=0))
   OR expected_master_chunks>(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric*max_master_chunk_rows<(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric+ceil((payload->'expected'->>'INVENTORY_KEY')::numeric/100)+1>2147483646) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_LAYOUT_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  admin:=payload->'admin';
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  -- Validate the original bootstrap pair before publishing the first baseline.
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency IMMEDIATE;
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency DEFERRED;
  expected:=payload->'expected';
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"MASTER":0,"INVENTORY_KEY":0,"INVENTORY_EFFECT":0,"NAMESPACE":0,"IMPORT_BATCH":0}'::jsonb,'expected',expected);
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',payload->>'manifest_ref',request->>'package_manifest_sha256',(request->>'cutoff_at')::timestamptz,'STANDARD_INITIAL_EXPLICIT_KEYS_V1','CUTOFF_STOCK_BASELINE','STAGED',cp,transaction_timestamp());
  phase:='INITIALIZE';action_name:='IMPORT_INITIALIZE_CURRENT_ADMIN';old_cp:=NULL;
 ELSIF command_phase='DOCUMENTS' AND payload->>'mode'='STAGE' THEN
  IF payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}' OR payload->'expected_sequence'<>'null' OR payload->'rows'<>'[]' OR payload->'documents'<>'[]' THEN
   RAISE EXCEPTION 'STANDARD_DOCUMENT_STAGE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid FOR UPDATE;
  IF baseline.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR baseline.status<>'IMPORTED' OR baseline.source_name<>request->>'namespace'
    OR baseline.source_hash<>request->>'package_manifest_sha256' OR baseline.cutoff_at<>(request->>'cutoff_at')::timestamptz THEN RAISE EXCEPTION 'STANDARD_BASELINE_MISMATCH_NO_REBASELINE' USING ERRCODE='23514'; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->'payload'->>'document_batch_id'<>batch::text OR payload->'expected' IS DISTINCT FROM initial_request->'payload'->'expected_documents' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_PLAN_MISMATCH' USING ERRCODE='23514'; END IF;
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"SALES_HEADER":0,"SALES_LINE":0,"SALES_SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0,"IMPORT_BATCH":0}'::jsonb,'expected',payload->'expected');
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',baseline.source_manifest_ref,request->>'package_manifest_sha256',baseline.cutoff_at,'DOCUMENT_CONVERSION_V1','DOCUMENT_CONVERSION','STAGED',cp,transaction_timestamp());
  phase:='DOCUMENT_STAGE';action_name:='IMPORT_STAGE';old_cp:=NULL;
 ELSE
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=batch FOR UPDATE;
  IF b.status NOT IN ('STAGED','VALIDATING') OR b.source_name<>request->>'namespace' OR b.source_hash<>request->>'package_manifest_sha256'
   OR b.cutoff_at<>(request->>'cutoff_at')::timestamptz OR (payload->>'expected_sequence')::integer IS DISTINCT FROM (b.checkpoint->>'sequence')::integer THEN RAISE EXCEPTION 'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT' USING ERRCODE='23514'; END IF;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' THEN baseline:=b;
  ELSE SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->>'plan_sha256'<>request->>'plan_sha256' THEN RAISE EXCEPTION 'STANDARD_EXECUTION_PLAN_CONFLICT' USING ERRCODE='23514'; END IF;
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;
  -- Mode and bounds come only from the original immutable INIT, never a chunk.
  master_chunks_v2:=cfg ? 'execution_contract';
  IF master_chunks_v2 THEN execution_contract:=cfg->'execution_contract';max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF jsonb_typeof(payload->'expected_sequence') IS DISTINCT FROM 'number' OR (payload->>'expected_sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (payload->>'expected_sequence')::numeric>2147483646 THEN RAISE EXCEPTION 'STANDARD49_EXPECTED_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(old_cp->'sequence') IS DISTINCT FROM 'number' OR (old_cp->>'sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (old_cp->>'sequence')::numeric>=2147483646 THEN RAISE EXCEPTION 'STANDARD49_AUDIT_SEQUENCE_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='MASTER' AND (jsonb_array_length(payload->'rows')>max_master_chunk_rows
    OR (old_cp->>'sequence')::numeric>=expected_master_chunks
    OR ((old_cp->>'sequence')::numeric=expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')<>(old_cp->'expected'->>'MASTER')::numeric)
    OR ((old_cp->>'sequence')::numeric<expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')>=(old_cp->'expected'->>'MASTER')::numeric)) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_CHUNK_PROGRESS_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='KEYS' AND ((old_cp->>'sequence')::numeric<expected_master_chunks OR old_cp->'counts'->'MASTER' IS DISTINCT FROM old_cp->'expected'->'MASTER') THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_PHASE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='PUBLISH' THEN
   IF payload-ARRAY['phase','expected_sequence','baseline_batch_id','approval_record_id']<>'{}' OR payload->>'phase' NOT IN ('BASELINE','DOCUMENTS')
    OR (payload->>'baseline_batch_id')::uuid<>baseline.id OR (payload->>'phase'='BASELINE') IS DISTINCT FROM (b.inventory_mode='CUTOFF_STOCK_BASELINE') THEN RAISE EXCEPTION 'STANDARD_PUBLISH_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'STANDARD_COMMAND_KIND_INVALID' USING ERRCODE='23514'; END IF;
  phase:=CASE command_phase WHEN 'MASTER' THEN 'MASTER' WHEN 'KEYS' THEN 'KEYS' WHEN 'DOCUMENTS' THEN 'DOCUMENTS' ELSE CASE payload->>'phase' WHEN 'BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END END;
  action_name:=CASE command_phase WHEN 'PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND source_entity_type='BATCH_NAMESPACE_BINDING') THEN
   fields:=jsonb_build_object('batch_id',batch,'source_system',b.source_name,'manifest_sha256',b.source_hash,'registry_sha256',cfg->>'registry_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',cfg->>'namespace_record_id','entity_type','BATCH_NAMESPACE_BINDING','source_key',batch::text,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,
    'fields',fields,'source_hash',encode(sha256(convert_to(fields::text,'UTF8')),'hex')));
  END IF;
  IF command_phase IN ('MASTER','DOCUMENTS','KEYS') THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows') LOOP
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id','explicit_zero_evidence']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF entry ? 'explicit_zero_evidence' THEN
      IF NOT(cfg ? 'explicit_zero_approval') THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_REQUIRED' USING ERRCODE='23514'; END IF;
      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';
      IF jsonb_typeof(zero_evidence) IS DISTINCT FROM 'object'
       OR zero_evidence-ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof']<>'{}'
       OR NOT(zero_evidence ?& ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])
       OR zero_evidence->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_ABSENCE_V1'
       OR fields->>'quantity' IS DISTINCT FROM '0'
       OR zero_evidence->>'inventory_file_sha256' IS DISTINCT FROM zero_descriptor->>'inventory_file_sha256'
       OR zero_evidence->>'cutoff_at' IS DISTINCT FROM zero_descriptor->>'cutoff_at'
       OR zero_evidence->>'approval_sha256' IS DISTINCT FROM zero_descriptor->>'sha256'
       OR jsonb_typeof(zero_evidence->'approval_row') IS DISTINCT FROM 'number'
       OR (zero_evidence->>'approval_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'approval_line') IS DISTINCT FROM 'string'
       OR octet_length(convert_to(zero_evidence->>'approval_line','UTF8')) NOT BETWEEN 1 AND 65536
       OR strpos(zero_evidence->>'approval_line',chr(10))>0 OR strpos(zero_evidence->>'approval_line',chr(13))>0
       OR left(zero_evidence->>'approval_line',1)=chr(65279)
       OR (zero_evidence->>'approval_line' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'merkle_proof') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_EVIDENCE_INVALID' USING ERRCODE='23514'; END IF;
      IF (zero_evidence->>'approval_row')::numeric>(zero_descriptor->>'record_count')::numeric
       OR jsonb_array_length(zero_evidence->'merkle_proof')>18
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(zero_evidence->'merkle_proof') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string' OR (s#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
       OR entry->'source_refs' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('file_sha256',zero_descriptor->>'sha256','sheet',NULL,'row',(zero_evidence->>'approval_row')::integer))
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
      zero_fact:=(zero_evidence->>'approval_line')::jsonb;
      IF zero_fact IS DISTINCT FROM jsonb_build_object('format_version','EXPLICIT_ZERO_APPROVAL_V1','source_namespace',request->>'namespace',
       'inventory_file_sha256',zero_descriptor->>'inventory_file_sha256','cutoff_at',request->>'cutoff_at','source_key',source_key,
       'warehouse_id',fields->>'warehouse_id','sku_id',fields->>'sku_id','quantity','0','decision','CONFIRMED_ABSENT_IS_ZERO')
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVED_FACT_DIFFERS' USING ERRCODE='23514'; END IF;
      zero_index:=(zero_evidence->>'approval_row')::integer-1;zero_width:=(zero_descriptor->>'record_count')::integer;
      zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_LEAF_V1'||chr(10)||(zero_index+1)::text||chr(10)||(zero_evidence->>'approval_line'),'UTF8')),'hex');
      FOR zero_sibling IN SELECT value FROM jsonb_array_elements_text(zero_evidence->'merkle_proof') LOOP
       IF zero_width<=1 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_DEPTH_INVALID' USING ERRCODE='23514'; END IF;
       IF mod(zero_index,2)=0 THEN
        IF zero_index+1>=zero_width AND zero_sibling IS DISTINCT FROM zero_hash THEN RAISE EXCEPTION 'EXPLICIT_ZERO_ODD_SIBLING' USING ERRCODE='23514'; END IF;
        zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_hash||chr(10)||zero_sibling,'UTF8')),'hex');
       ELSE zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_sibling||chr(10)||zero_hash,'UTF8')),'hex'); END IF;
       zero_index:=zero_index/2;zero_width:=(zero_width+1)/2;
      END LOOP;
      IF zero_width<>1 OR zero_hash IS DISTINCT FROM zero_descriptor->>'merkle_root_sha256' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_MEMBERSHIP_INVALID' USING ERRCODE='23514'; END IF;
     END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF command_phase='DOCUMENTS' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt sealed
       WHERE sealed.action='MIGRATE_DOCUMENT' AND sealed.target_type=CASE WHEN kind IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT') THEN 'SALES' ELSE 'TRANSFER' END
        AND sealed.target_id=CASE WHEN kind IN ('SALES_HEADER','TRANSFER_HEADER') THEN target WHEN kind IN ('SALES_LINE','SALES_SETTLEMENT') THEN (fields->>'sales_id')::uuid ELSE (fields->>'transfer_id')::uuid END)
     THEN RAISE EXCEPTION 'WHOLE_DOCUMENT_ALREADY_SEALED' USING ERRCODE='23514'; END IF;
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind='STAFF' AND fields->>'role'='SALESPERSON' AND fields->'hall_id'='null'::jsonb THEN
      IF fields->>'employment_status' IS DISTINCT FROM '离职'
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(((cfg->'historical_staff_hall_approval'->>'utf8')::jsonb)->'staff','[]'::jsonb)) approved
        WHERE approved->>'source_key'=entry->>'source_key' AND approved->>'target_id'=entry->>'target_id'
         AND (approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (approved->'source_refs'))
       OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=(entry->>'target_id')::uuid)
      THEN RAISE EXCEPTION 'STAFF_HALL_REQUIRED' USING ERRCODE='23514'; END IF;
     END IF;
     -- WHOLE_FIT_PROFILE_GUARD_BEGIN
     -- An installed numeric table constraint does not widen a legacy package.
     -- Select only the original immutable INIT profile; never infer or rewrite codes.
     IF kind='FIT' AND (jsonb_typeof(fields->'code') IS DISTINCT FROM 'string'
      OR (fields->>'code' COLLATE "C" ~ CASE WHEN cfg->>'schema_declarations_sha256' IN
       ('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e')
       THEN '^[A-Z356789]$' ELSE '^[A-Z]$' END) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_END
     IF master_chunks_v2 AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
      IF fields->parent_row.attname IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->parent_row.attname) IS DISTINCT FROM 'string'
        OR (parent_row.atttypid=20 AND (fields->>parent_row.attname ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true)
        OR (parent_row.atttypid=1700 AND (fields->>parent_row.attname ~ '^-?(0|[1-9][0-9]*)[.][0-9]{2}$') IS DISTINCT FROM true)) THEN
       RAISE EXCEPTION 'STANDARD_EXACT_NUMERIC_STRING_REQUIRED: %',parent_row.attname USING ERRCODE='23514'; END IF;
     END LOOP;
    END IF;
    IF entry ? 'zero_amount_archive' THEN
     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'
      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'
      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'
      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'
      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;
     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP
      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'
       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'
       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])
       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'
       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096
       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'
       OR parent_row.archived->'amount' IS DISTINCT FROM '"0.00"'::jsonb
       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'
       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100
       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100
       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
     END LOOP;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');
    IF entry ? 'explicit_zero_evidence' THEN parsed:=parsed||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    IF entry ? 'explicit_zero_evidence' THEN item:=item||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
    'source_hash',CASE phase WHEN 'DOCUMENT_PUBLISH' THEN b.source_hash ELSE encode(sha256(convert_to(fields::text,'UTF8')),'hex') END));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
   kind:=item->>'target_type';counter:=CASE WHEN item->>'entity_type'='BATCH_NAMESPACE_BINDING' THEN 'NAMESPACE' WHEN kind IN ('IMPORT_BATCH','INVENTORY_KEY','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN kind ELSE 'MASTER' END;
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::numeric+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::numeric+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  IF total<0 OR total>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 IF (cp->>'sequence')::numeric>2147483646 OR (cp->>'cursor')::numeric>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
 -- The public request, typed intents and exact result are prepared before native
 -- mutations. All final-state validators run deferred; no guard is disabled.
 result:=jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','operationId',operation,'batchId',batch,'sequence',cp->'sequence','cursor',cp->'cursor',
  'status',CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' WHEN command_phase='INITIALIZE' OR phase='DOCUMENT_STAGE' THEN 'STAGED' ELSE 'VALIDATING' END,
  'ledgerEntryIds',ledger_ids,'sourceRecordIds',source_ids,'phase',phase,'planSha256',request->>'plan_sha256','packageManifestSha256',request->>'package_manifest_sha256',
  'baselineBatchId',CASE WHEN command_phase='INITIALIZE' THEN batch ELSE baseline.id END,'documentBatchId',CASE WHEN command_phase='INITIALIZE' THEN payload->>'document_batch_id' ELSE initial_request->'payload'->>'document_batch_id' END);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END,
    'whole_package_v2',CASE WHEN command_phase='INITIALIZE' THEN jsonb_build_object('root_operation',root_operation,'ordinal',0,'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user) ELSE jsonb_build_object('root_operation',root_operation,'ordinal',child_ordinal) END),transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind COLLATE "C");fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='STAFF' THEN
    IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e') THEN
     IF NOT(fields ? 'departure_date') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT attisdropped AND attgenerated='') THEN RAISE EXCEPTION 'WHOLE_STAFF_SCHEMA_NOT_INSTALLED' USING ERRCODE='23514'; END IF;
     IF fields->'departure_date' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->'departure_date') IS DISTINCT FROM 'string' OR (fields->>'departure_date' COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true OR to_char((fields->>'departure_date')::date,'YYYY-MM-DD') IS DISTINCT FROM fields->>'departure_date') THEN RAISE EXCEPTION 'WHOLE_STAFF_DATE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF fields ? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='' AND NOT(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e'))) THEN
    RAISE EXCEPTION 'STANDARD_EXACT_TYPED_FIELDS_REQUIRED: %',kind USING ERRCODE='23514'; END IF;
   IF actual IS NOT NULL THEN
    IF command_phase<>'MASTER' OR item->>'identity_basis' IS DISTINCT FROM 'EXISTING_VERIFIED' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_EXISTING_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
   ELSE
    IF kind='TRANSFER_LINE' THEN
     INSERT INTO naijue_erp.transfer_line(id,transfer_id,line_no,sku_id,quantity,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot,is_current)
      SELECT t.id,t.transfer_id,t.line_no,t.sku_id,t.quantity,t.product_code_snapshot,t.product_name_snapshot,t.color_name_snapshot,t.fit_name_snapshot,t.size_name_snapshot,t.barcode_snapshot,t.is_current FROM jsonb_populate_record(NULL::naijue_erp.transfer_line,fields) t;
    ELSE EXECUTE format('INSERT INTO naijue_erp.%I SELECT (jsonb_populate_record(NULL::naijue_erp.%I,$1)).*',table_name,table_name) USING fields; END IF;
   END IF;
  END LOOP;
 ELSIF command_phase='KEYS' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'='INVENTORY_KEY' LOOP
   fields:=item->'fields';quantity:=(fields->>'quantity')::bigint;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='WAREHOUSE' AND target_id=(fields->>'warehouse_id')::uuid)
     OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='SKU' AND target_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid) THEN RAISE EXCEPTION 'STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
   IF quantity<>0 THEN
    INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_document_version,endpoint,business_date,posted_at,source_import_batch_id)
     VALUES((item->>'ledger_entry_id')::uuid,operation,'CUTOFF_BASELINE',(fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,NULL,'IMPORT_BASELINE',left(request->>'cutoff_at',10)::date,transaction_timestamp(),batch);
   END IF;
   -- A source-explicit zero is a real current balance, but has no ledger effect.
   -- Only records present in the validated package reach this loop; missing keys remain absent.
   INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
    VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
  END LOOP;
 END IF;
 IF command_phase='DOCUMENTS' AND phase='DOCUMENTS' THEN
  anchor_baseline:=jsonb_build_object('state','CONFIRMED','baselineBatchId',baseline.id,'baselineManifestSha256',baseline.source_hash,'cutoffAt',baseline.cutoff_at,'coverageDigest',cfg->>'alignment_sha256');
  FOR doc IN SELECT value FROM jsonb_array_elements(payload->'documents') LOOP
   IF doc-ARRAY['kind','id','operation_id','request_key','source_record_id']<>'{}' OR doc->>'kind' NOT IN ('SALES','TRANSFER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_MANIFEST_INVALID' USING ERRCODE='23514'; END IF;
   kind:=doc->>'kind';doc_id:=(doc->>'id')::uuid;child_op:=(doc->>'operation_id')::uuid;snap:=naijue_erp.unified_document_snapshot(kind,doc_id);
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE id=(doc->>'source_record_id')::uuid AND import_batch_id=batch AND target_id=doc_id AND target_type=kind||'_HEADER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_SOURCE_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
   child_result:=jsonb_build_object('operationId',child_op,CASE kind WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END,doc_id,'version',(snap->'header'->>'version')::integer,
    'status',snap->'header'->>'status','ledgerEntryIds','[]'::jsonb,'batchId',batch,'sourceRecordId',doc->>'source_record_id','exposureDigest',encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'baseline',anchor_baseline);
   INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
    VALUES(child_op,actor,doc->>'request_key',encode(sha256(convert_to(doc::text||snap::text,'UTF8')),'hex'),'MIGRATE_DOCUMENT',kind,doc_id,'COMMITTED',child_result,transaction_timestamp());
   INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
    VALUES(child_op,child_op,actor,kind,doc_id,'MIGRATE_DOCUMENT',NULL,(snap->'header'->>'version')::integer,NULL,snap||jsonb_build_object('baseline',anchor_baseline,'sourceRecordId',doc->>'source_record_id'),transaction_timestamp());
  END LOOP;
 END IF;
 IF command_phase='PUBLISH' THEN
  IF cp->'counts' IS DISTINCT FROM cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
  IF phase='BASELINE_SEAL' THEN
   IF cfg ? 'explicit_zero_approval' THEN
    SELECT count(*),count(DISTINCT (approved->'explicit_zero_evidence'->>'approval_row')::integer) INTO zero_consumed,zero_unique
     FROM naijue_erp.audit_change prior_audit CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
     WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch
      AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
      AND prior_audit.after_values->>'phase'='KEYS' AND approved->>'target_type'='INVENTORY_KEY' AND approved ? 'explicit_zero_evidence';
    IF zero_consumed<>(cfg->'explicit_zero_approval'->>'record_count')::bigint OR zero_unique<>zero_consumed
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVAL_NOT_EXACTLY_CONSUMED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch sealed_baseline WHERE sealed_baseline.id=baseline.id AND sealed_baseline.status='IMPORTED' AND sealed_baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
     AND sealed_baseline.source_hash=b.source_hash AND sealed_baseline.source_name=b.source_name AND sealed_baseline.cutoff_at=b.cutoff_at) THEN RAISE EXCEPTION 'STANDARD_ACTIVATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch AND s.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.action='MIGRATE_DOCUMENT' AND r.target_id=s.target_id AND r.target_type=CASE s.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN RAISE EXCEPTION 'STANDARD_MIGRATION_CLOSURE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF command_phase<>'INITIALIZE' AND phase<>'DOCUMENT_STAGE' THEN
  UPDATE naijue_erp.import_batch SET checkpoint=cp,status=CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' ELSE 'VALIDATING' END,
    completed_at=CASE WHEN command_phase='PUBLISH' THEN transaction_timestamp() ELSE NULL END WHERE id=batch;
 END IF;
 -- Execute the real retained deferred validators under this finite API owner,
 -- before returning to the execute-only role. No trigger or constraint is skipped.
 -- Whole package: deferred constraints fire only after both final publications.
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','PENDING_TRANSACTION','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $_$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_command_v2"("request" "jsonb", "private_parameter" "text", "command_phase" "text", "root_operation" "uuid", "child_ordinal" integer) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_context_v2("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_context_v2"("root_operation" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; marker jsonb;
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
 IF NOT pg_has_role(session_user,'erp_unified27_initializer_2393dbc6db9581c2','SET') THEN
  RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 marker:=a.after_values->'whole_package_v2';
 IF marker IS DISTINCT FROM jsonb_build_object('root_operation',root_operation,'ordinal',0,
   'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user)
  OR r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR r.target_type IS DISTINCT FROM 'IMPORT'
  OR r.actor_account_id IS DISTINCT FROM a.actor_account_id OR r.target_id IS DISTINCT FROM a.object_id
  OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM root_operation::text
  OR a.after_values->'request'->'payload'->'admin'->>'account_id' IS DISTINCT FROM r.actor_account_id::text
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=r.id AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change x WHERE x.id=a.id AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('actor',r.actor_account_id,'request',a.after_values->'request','marker',marker);
END $$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_context_v2"("root_operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_finish_v2("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_finish_v2"("init_operation" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE result jsonb;
BEGIN
 PERFORM naijue_erp.standard_whole_package_context_v2(init_operation);
 result:=naijue_erp.standard_whole_package_closed_v2(init_operation);
 -- This validates original source rows, native effects, audit/receipt chains and
 -- all retained deferred constraints. It does not COMMIT the caller transaction.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','summary',result);
END $$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_finish_v2"("init_operation" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_inspect_v2("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_inspect_v2"("init_request" "jsonb", "encoded_scrypt" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE actor uuid; operation uuid; batch uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; summary jsonb; assigned_xid xid8;
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 IF encoded_scrypt IS NULL OR (encoded_scrypt COLLATE "C" ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$') IS DISTINCT FROM true
  OR jsonb_typeof(init_request) IS DISTINCT FROM 'object' OR init_request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
  OR init_request->'payload'->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR coalesce(length(init_request->>'request_key'),0)=0
 THEN RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 actor:=(init_request->'payload'->'admin'->>'account_id')::uuid;operation:=(init_request->>'operation_id')::uuid;batch:=(init_request->>'batch_id')::uuid;
 IF actor IS NULL OR operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(init_request->>'request_key'),0));
 SELECT * INTO r FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=init_request->>'request_key';
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation)
   OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id IN (batch,(init_request->'payload'->>'document_batch_id')::uuid))
  THEN RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('state','ABSENT');
 END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 IF r.request_hash IS DISTINCT FROM encode(sha256(convert_to('INITIALIZE:'||init_request::text||':'||encoded_scrypt,'UTF8')),'hex')
  OR r.id IS DISTINCT FROM operation OR r.target_id IS DISTINCT FROM batch OR a.after_values->'request' IS DISTINCT FROM init_request
  OR a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM operation::text THEN
  RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 assigned_xid:=pg_current_xact_id_if_assigned();
 IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=operation AND x.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
 summary:=naijue_erp.standard_whole_package_closed_v2(operation);
 RETURN jsonb_build_object('state','COMMITTED','packageSha256',init_request->>'package_manifest_sha256','planSha256',init_request->>'plan_sha256','summary',summary);
END $_$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_inspect_v2"("init_request" "jsonb", "encoded_scrypt" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_prepare_v2("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_prepare_v2"("init_request" "jsonb", "encoded_scrypt" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 RETURN naijue_erp.standard_whole_package_command_v2(init_request,encoded_scrypt,'INITIALIZE',(init_request->>'operation_id')::uuid,0);
END $$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_prepare_v2"("init_request" "jsonb", "encoded_scrypt" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_step_v2("uuid", integer, "text", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_step_v2"("init_operation" "uuid", "ordinal" integer, "command_phase" "text", "request" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
BEGIN
 IF command_phase IS NULL OR command_phase NOT IN ('MASTER','KEYS','DOCUMENTS','PUBLISH') THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
 RETURN naijue_erp.standard_whole_package_command_v2(request,NULL,command_phase,init_operation,ordinal);
END $$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_step_v2"("init_operation" "uuid", "ordinal" integer, "command_phase" "text", "request" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_whole_package_verify_v2("jsonb", "text"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_whole_package_verify_v2"("init_request" "jsonb", "encoded_scrypt" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $_$
DECLARE request jsonb; inspected jsonb; zero_v2 boolean; zero_operation uuid; source_totals jsonb; current_totals jsonb; actor uuid; publication_status jsonb; documents_batch naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE;
 source_counts jsonb:='{}'; verified_documents bigint:=0; changed_documents bigint:=0; verified_inventory_keys bigint:=0; verified_zero_keys bigint:=0; verified_postcutoff_keys bigint:=0; verified_inventory_quantity numeric:=0; counts bigint; kind text; current_version integer; initial_version integer; expected_version integer; steps integer;
 source_row record; header_row record; step record; stock_key record; row_value jsonb; prior_value jsonb; header_expected jsonb; header_actual jsonb; lines_expected jsonb; lines_actual jsonb;
 settlements_expected jsonb; settlements_actual jsonb; retired jsonb; snap jsonb; current_snap jsonb; before_header jsonb; after_header jsonb; field record; evidence_value jsonb;
 proof jsonb; admission record; quantity numeric; ledger_total numeric; effects bigint; balance naijue_erp.inventory_balance%ROWTYPE; has_balance boolean; item record;
 initial_receipt naijue_erp.operation_receipt%ROWTYPE; initial_audit naijue_erp.audit_change%ROWTYPE; initialized jsonb; source_total bigint; expected_counts jsonb;
BEGIN
 inspected:=naijue_erp.standard_whole_package_inspect_v2(init_request,encoded_scrypt);
 IF inspected->>'state' IS DISTINCT FROM 'COMMITTED' OR NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_VERIFY_COMMITTED_PACKAGE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT a.after_values->'request' INTO STRICT request FROM naijue_erp.audit_change a WHERE a.operation_id=(inspected->'summary'->>'operationId')::uuid;
 publication_status:=jsonb_build_object('state','COMMITTED','receipt',inspected->'summary');
 actor:=(init_request->'payload'->'admin'->>'account_id')::uuid;
 IF publication_status->>'state'<>'COMMITTED' OR publication_status->'receipt'->>'phase'<>'DOCUMENT_PUBLISH' OR NOT naijue_erp.standard_business_ready() THEN RAISE EXCEPTION 'STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(publication_status->'receipt'->>'baselineBatchId')::uuid;
 SELECT a.after_values->'request'->'payload' INTO STRICT initialized FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
 -- Fence every imported header first, then every actual inventory key in the
 -- same global ordering used by ordinary commands. This is a live readback,
 -- not receipt counting and not an attempt to restore original current values.
 FOR header_row IN SELECT h.id FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR header_row IN SELECT h.id FROM naijue_erp.transfer_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id
    FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
     LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
    WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
   PERFORM naijue_erp.inventory_key_lock(stock_key.warehouse_id,stock_key.sku_id);
   PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id FOR SHARE;
 END LOOP;
 FOR kind IN SELECT unnest(ARRAY['HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','INVENTORY_KEY','IMPORT_BATCH']) LOOP
  SELECT count(*) INTO counts FROM naijue_erp.import_record WHERE import_batch_id IN (baseline.id,documents_batch.id) AND target_type=kind AND status='IMPORTED';
  source_counts:=source_counts||jsonb_build_object(kind,counts);
 END LOOP;
 IF source_counts->>'IMPORT_BATCH'<>'3' OR (source_counts->>'INVENTORY_KEY')::numeric<>(baseline.checkpoint->'expected'->>'INVENTORY_KEY')::numeric THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 FOR kind IN SELECT jsonb_object_keys(initialized->'expected_master_counts') LOOP
  IF source_counts->kind IS DISTINCT FROM initialized->'expected_master_counts'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'] LOOP
  IF source_counts->kind IS DISTINCT FROM documents_batch.checkpoint->'expected'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR source_row IN SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' ORDER BY s.id LOOP
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF source_row.target_type NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
   IF source_row.target_type='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.size_group_member t WHERE size_group_id=(proof->'fields'->>'size_group_id')::uuid AND size_id=(proof->'fields'->>'size_id')::uuid FOR SHARE;
   ELSIF source_row.target_type='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(proof->'fields'->>'payment_account_id')::uuid AND hall_id=(proof->'fields'->>'hall_id')::uuid FOR SHARE;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1 FOR SHARE',lower(source_row.target_type COLLATE "C")) INTO row_value USING source_row.target_id; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(source_row.target_type COLLATE "C")) INTO prior_value USING proof->'fields';
   IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR source_row IN SELECT * FROM naijue_erp.import_record WHERE import_batch_id=documents_batch.id AND target_type IN ('SALES_HEADER','TRANSFER_HEADER') ORDER BY target_type,target_id LOOP
  kind:=CASE source_row.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END;
  SELECT * INTO STRICT initial_receipt FROM naijue_erp.operation_receipt WHERE target_type=kind AND target_id=source_row.target_id AND action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT initial_audit FROM naijue_erp.audit_change WHERE operation_id=initial_receipt.id;
  snap:=initial_audit.after_values-ARRAY['baseline','sourceRecordId'];current_snap:=naijue_erp.unified_document_snapshot(kind,source_row.target_id);
  initial_version:=initial_audit.new_version;current_version:=(current_snap->'header'->>'version')::integer;expected_version:=initial_version;steps:=0;retired:='{}';
  IF initial_receipt.actor_account_id<>initial_audit.actor_account_id OR initial_audit.old_version IS NOT NULL OR initial_audit.before_values IS NOT NULL
   OR initial_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
   OR initial_audit.after_values->>'sourceRecordId'<>source_row.id::text OR current_version<initial_version THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORIGINAL_MIGRATION_INVALID' USING ERRCODE='23514'; END IF;
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF kind='SALES' THEN
   row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
  ELSE row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header')); END IF;
  IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'lines') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type=kind||'_LINE' AND s.target_id=(row_value->>'id')::uuid;
   IF kind='SALES' THEN prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof->'fields'));evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,row_value));
   ELSE prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,proof->'fields'))-'current_line_no';evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,row_value))-'current_line_no'; END IF;
   IF prior_value IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'settlements') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type='SALES_SETTLEMENT' AND s.target_id=(row_value->>'id')::uuid;
   IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,row_value)) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_SETTLEMENT_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at']) key LOOP
   IF current_snap->'header'->field.key IS DISTINCT FROM snap->'header'->field.key THEN RAISE EXCEPTION 'STANDARD_VERIFY_IMMUTABLE_DOCUMENT_ORIGIN_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF kind='SALES' THEN
   header_expected:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
   header_actual:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_line_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.unified_sales_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.sales_line l WHERE sales_id=source_row.target_id;
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_settlement_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_settlement,v))),'{}') INTO settlements_expected FROM jsonb_array_elements(snap->'settlements') v;
   SELECT coalesce(jsonb_object_agg(s.id::text,naijue_erp.unified_sales_settlement_audit_values(s)),'{}') INTO settlements_actual FROM naijue_erp.sales_settlement s WHERE sales_id=source_row.target_id;
  ELSE
   header_expected:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header'));
   header_actual:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.transfer_line_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.transfer_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.transfer_line l WHERE transfer_id=source_row.target_id;
   settlements_expected:='{}';settlements_actual:='{}';
   IF current_snap->'header'->'created_role' IS DISTINCT FROM snap->'header'->'created_role' THEN RAISE EXCEPTION 'STANDARD_VERIFY_CREATION_ROLE_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  FOR step IN SELECT a.*,r.actor_account_id receipt_actor,r.action receipt_action,r.target_type receipt_kind,r.target_id receipt_target,r.completed_at,r.result_data,r.status receipt_status
   FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type=kind AND a.object_id=source_row.target_id AND a.new_version>initial_version AND a.new_version<=current_version ORDER BY a.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version<>expected_version+1 OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE','VOID') OR step.action<>step.receipt_action
    OR step.receipt_kind<>kind OR step.receipt_target<>source_row.target_id OR step.actor_account_id<>step.receipt_actor OR step.receipt_status<>'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.result_data->>'version'<>step.new_version::text THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORDINARY_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header';after_header:=step.after_values->'header';
   FOR field IN SELECT * FROM jsonb_each(before_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    IF header_expected->field.key IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_HEADER_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR field IN SELECT * FROM jsonb_each(after_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    header_expected:=jsonb_set(header_expected,ARRAY[field.key],evidence_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) LOOP
    IF lines_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'lines','[]')) LOOP
    IF lines_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) v WHERE v->>'id'=row_value->>'id') THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    lines_expected:=jsonb_set(lines_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) LOOP
    IF settlements_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id') THEN
     settlements_expected:=settlements_expected-(row_value->>'id');retired:=retired||jsonb_build_object(row_value->>'id',true);
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) LOOP
    IF retired ? (row_value->>'id') OR (settlements_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id')) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    settlements_expected:=jsonb_set(settlements_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   expected_version:=step.new_version;steps:=steps+1;
  END LOOP;
  IF expected_version<>current_version OR header_expected IS DISTINCT FROM header_actual OR lines_expected IS DISTINCT FROM lines_actual OR settlements_expected IS DISTINCT FROM settlements_actual THEN
   RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_NATIVE_PROJECTION_DIFFERS' USING ERRCODE='23514'; END IF;
  IF steps=0 AND current_snap IS DISTINCT FROM snap THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNCHANGED_NATIVE_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  verified_documents:=verified_documents+1;
  IF steps>0 THEN changed_documents:=changed_documents+1; END IF;
 END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
  proof:=naijue_erp.standard_inventory_key_proof(stock_key.warehouse_id,stock_key.sku_id);
  IF proof->>'state'='UNKNOWN' THEN
   SELECT * INTO STRICT admission FROM naijue_erp.inventory_key_admission(stock_key.warehouse_id,stock_key.sku_id);
   IF admission.admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNPROVEN_KEY_UNKNOWN_NOT_ZERO' USING ERRCODE='23514'; END IF;
   quantity:=NULL;proof:=jsonb_build_object('state','POST_CUTOFF_NATIVE');
  ELSE quantity:=(proof->'fields'->>'quantity')::numeric; END IF;
  zero_v2:=false;zero_operation:=NULL;
  IF proof->>'state'='EXPLICIT_ZERO' THEN
   zero_operation:=(proof->>'operation_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
     WHERE a.operation_id=zero_operation AND a.after_values->'whole_package_v2'->>'root_operation'=init_request->>'operation_id'
       AND r.target_id=baseline.id AND r.action='IMPORT_CHUNK' AND r.status='COMMITTED'
       AND a.after_values->>'phase'='KEYS' AND a.actor_account_id=r.actor_account_id)
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND l.event_kind='CUTOFF_BASELINE')
   THEN RAISE EXCEPTION 'WHOLE_ZERO_VERIFY_ROOT_REQUIRED' USING ERRCODE='23514'; END IF;
   zero_v2:=true;
  END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO ledger_total,effects FROM naijue_erp.inventory_ledger WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.operation_receipt r ON r.id=l.operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id
   WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND (r.id IS NULL OR a.operation_id IS NULL OR r.status<>'COMMITTED' OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id
    OR a.object_type<>r.target_type OR a.action<>r.action OR a.occurred_at IS DISTINCT FROM r.completed_at OR NOT(r.result_data->'ledgerEntryIds' ? l.id::text))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_LEDGER_OPERATION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO balance FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;has_balance:=FOUND;
  IF (effects=0 AND (NOT zero_v2 OR NOT has_balance OR balance.quantity<>0 OR balance.version<>1 OR balance.last_operation_id IS DISTINCT FROM zero_operation OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.id=zero_operation AND r.completed_at=balance.updated_at))) OR (effects>0 AND (NOT has_balance OR balance.quantity::numeric<>ledger_total OR balance.version::numeric<>effects+CASE WHEN zero_v2 THEN 1 ELSE 0 END
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.id=balance.last_operation_id AND l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND r.completed_at=balance.updated_at))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_BALANCE_LEDGER_DIFFERS' USING ERRCODE='23514'; END IF;
  verified_inventory_keys:=verified_inventory_keys+1;
  IF proof->>'state'='EXPLICIT_ZERO' THEN verified_zero_keys:=verified_zero_keys+1; END IF;
  IF proof->>'state'='POST_CUTOFF_NATIVE' THEN verified_postcutoff_keys:=verified_postcutoff_keys+1; END IF;
  IF has_balance THEN verified_inventory_quantity:=verified_inventory_quantity+balance.quantity; END IF;
 END LOOP;
 -- Numeric totals are exact decimal text. Source totals remain the original
 -- imported snapshot; current totals may legitimately differ after verified edits.
 SELECT jsonb_build_object('inventory_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='INVENTORY_KEY'),0)::text,
 'sales_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='SALES_LINE'),0)::text,
 'sales_line_amount',coalesce(sum((p->'fields'->>'line_amount')::numeric) FILTER(WHERE s.target_type='SALES_LINE'),0)::text,
 'sales_net_due',coalesce(sum((p->'fields'->>'net_due')::numeric) FILTER(WHERE s.target_type='SALES_HEADER'),0)::text,
 'sales_settlement_amount',coalesce(sum((p->'fields'->>'amount')::numeric) FILTER(WHERE s.target_type='SALES_SETTLEMENT'),0)::text,
 'transfer_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='TRANSFER_LINE'),0)::text)
 INTO source_totals FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p
 WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' AND s.target_type IN ('INVENTORY_KEY','SALES_LINE','SALES_HEADER','SALES_SETTLEMENT','TRANSFER_LINE');
 SELECT jsonb_build_object('inventory_quantity',verified_inventory_quantity::text,
 'sales_quantity',(SELECT coalesce(sum(l.quantity::numeric),0)::text FROM naijue_erp.sales_line l JOIN naijue_erp.sales_header h ON h.id=l.sales_id WHERE h.import_batch_id=documents_batch.id),
 'sales_line_amount',(SELECT coalesce(sum(l.line_amount),0)::text FROM naijue_erp.sales_line l JOIN naijue_erp.sales_header h ON h.id=l.sales_id WHERE h.import_batch_id=documents_batch.id),
 'sales_net_due',(SELECT coalesce(sum(h.net_due),0)::text FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id),
 'sales_settlement_amount',(SELECT coalesce(sum(s.amount),0)::text FROM naijue_erp.sales_settlement s JOIN naijue_erp.sales_header h ON h.id=s.sales_id WHERE h.import_batch_id=documents_batch.id),
 'transfer_quantity',(SELECT coalesce(sum(l.quantity::numeric),0)::text FROM naijue_erp.transfer_line l JOIN naijue_erp.transfer_header h ON h.id=l.transfer_id WHERE h.import_batch_id=documents_batch.id)) INTO current_totals;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','plan_sha256',request->>'plan_sha256','batch_id',documents_batch.id,'baseline_batch_id',baseline.id,'verified',true,'document_summary',jsonb_build_object('verified_count',verified_documents,'changed_after_import_count',changed_documents),'source_counts',source_counts,
  'inventory_summary',jsonb_build_object('verified_key_count',verified_inventory_keys),'source_totals',source_totals,'current_totals',current_totals,'unknown_keys_materialized',false,'inventory_coverage',jsonb_build_object('scope','EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS','explicit_source_keys',(source_counts->>'INVENTORY_KEY')::bigint,'explicit_zero_keys',verified_zero_keys,'post_cutoff_effect_keys',verified_postcutoff_keys,'unknown_combinations_not_enumerated',true,'complete_total_inventory',false),'verification_profile','STANDARD_WHOLE_PACKAGE_VERIFY_V2','scope','CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED','proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $_$;


ALTER FUNCTION "naijue_erp"."standard_whole_package_verify_v2"("init_request" "jsonb", "encoded_scrypt" "text") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: standard_zero_amount_archive_trace("uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."standard_zero_amount_archive_trace"("sales" "uuid") RETURNS TABLE("record_id" "uuid", "sales_id" "uuid", "sales_source_key" "text", "source_namespace" "text", "proof" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
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
END $$;


ALTER FUNCTION "naijue_erp"."standard_zero_amount_archive_trace"("sales" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: transfer_header; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."transfer_header" (
    "id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "business_date" "date" NOT NULL,
    "from_warehouse_id" "uuid" NOT NULL,
    "to_warehouse_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "version" integer NOT NULL,
    "note" "text",
    "created_by_account_id" "uuid",
    "created_hall_id" "uuid",
    "created_role" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "approved_by_account_id" "uuid",
    "approved_at" timestamp with time zone,
    "stock_basis" "text" NOT NULL,
    "import_batch_id" "uuid",
    "responsible_staff_id" "uuid",
    "created_by_staff_id" "uuid",
    "approved_by_staff_id" "uuid",
    CONSTRAINT "transfer_header_check" CHECK (("from_warehouse_id" <> "to_warehouse_id")),
    CONSTRAINT "transfer_header_created_role_check" CHECK (("created_role" = ANY (ARRAY['ADMIN'::"text", 'WAREHOUSE'::"text", 'SALESPERSON'::"text"]))),
    CONSTRAINT "transfer_header_number_check" CHECK (("length"("number") > 0)),
    CONSTRAINT "transfer_header_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'VOID'::"text"]))),
    CONSTRAINT "transfer_header_stock_basis_check" CHECK (("stock_basis" = ANY (ARRAY['RUNTIME_LEDGER'::"text", 'CUTOFF_HISTORY'::"text"]))),
    CONSTRAINT "transfer_header_version_check" CHECK (("version" > 0)),
    CONSTRAINT "unified_approval_state" CHECK ((("status" = 'APPROVED'::"text") OR (("approved_by_account_id" IS NULL) AND ("approved_by_staff_id" IS NULL) AND ("approved_at" IS NULL))))
);


ALTER TABLE "naijue_erp"."transfer_header" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "transfer_header"."created_role"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."transfer_header"."created_role" IS 'Immutable normalized trusted authentication snapshot at creation, not request-selected salesperson identity.';


--
-- Name: COLUMN "transfer_header"."stock_basis"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."transfer_header"."stock_basis" IS 'CUTOFF_HISTORY is a fail-closed reserved marker; 0004 enables neither historical import nor historical contribution reversal.';


--
-- Name: transfer_header_audit_values("naijue_erp"."transfer_header"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."transfer_header_audit_values"("source_row" "naijue_erp"."transfer_header") RETURNS "jsonb"
    LANGUAGE "sql" STABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('number',(source_row).number,'businessDate',to_char((source_row).business_date,'YYYY-MM-DD'),
  'fromWarehouseId',(source_row).from_warehouse_id,'toWarehouseId',(source_row).to_warehouse_id,
  'status',(source_row).status,'version',(source_row).version,'note',(source_row).note,'responsibleStaffId',(source_row).responsible_staff_id,
  'createdByStaffId',(source_row).created_by_staff_id,'approvedByStaffId',(source_row).approved_by_staff_id);
$$;


ALTER FUNCTION "naijue_erp"."transfer_header_audit_values"("source_row" "naijue_erp"."transfer_header") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: transfer_line; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."transfer_line" (
    "id" "uuid" NOT NULL,
    "transfer_id" "uuid" NOT NULL,
    "line_no" integer NOT NULL,
    "sku_id" "uuid" NOT NULL,
    "quantity" bigint NOT NULL,
    "product_code_snapshot" "text",
    "product_name_snapshot" "text",
    "color_name_snapshot" "text",
    "fit_name_snapshot" "text",
    "size_name_snapshot" "text",
    "barcode_snapshot" "text",
    "is_current" boolean NOT NULL,
    "current_line_no" integer GENERATED ALWAYS AS (
CASE
    WHEN "is_current" THEN "line_no"
    ELSE NULL::integer
END) STORED,
    CONSTRAINT "transfer_line_line_no_check" CHECK (("line_no" > 0)),
    CONSTRAINT "transfer_line_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "naijue_erp"."transfer_line" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: transfer_line_audit_values("naijue_erp"."transfer_line"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."transfer_line_audit_values"("source_row" "naijue_erp"."transfer_line") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT jsonb_build_object('id', (source_row).id, 'lineNo', (source_row).line_no, 'skuId', (source_row).sku_id,
    'quantity', (source_row).quantity::text, 'snapshot', jsonb_build_object('productCode', (source_row).product_code_snapshot,
      'productName', (source_row).product_name_snapshot, 'colorName', (source_row).color_name_snapshot,
      'fitName', (source_row).fit_name_snapshot, 'sizeName', (source_row).size_name_snapshot, 'barcode', (source_row).barcode_snapshot),
    'isCurrent', (source_row).is_current);
$$;


ALTER FUNCTION "naijue_erp"."transfer_line_audit_values"("source_row" "naijue_erp"."transfer_line") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: unified_document_snapshot("text", "uuid"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."unified_document_snapshot"("kind" "text", "target" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    SET "TimeZone" TO 'UTC'
    AS $$
DECLARE h jsonb; lines jsonb; settlements jsonb;
BEGIN
 IF kind='SALES' THEN
  SELECT to_jsonb(x)||jsonb_build_object('gross_amount',x.gross_amount::text,'order_discount',x.order_discount::text,'net_due',x.net_due::text)
    INTO STRICT h FROM naijue_erp.sales_header x WHERE id=target;
  SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('quantity',x.quantity::text,'reference_price',x.reference_price::text,'deal_price',x.deal_price::text,
    'line_amount',x.line_amount::text,'allocated_discount',x.allocated_discount::text) ORDER BY x.line_no,x.id),'[]') INTO lines FROM naijue_erp.sales_line x WHERE sales_id=target;
  SELECT coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount',x.amount::text) ORDER BY x.line_no,x.id),'[]') INTO settlements FROM naijue_erp.sales_settlement x WHERE sales_id=target;
 ELSIF kind='TRANSFER' THEN
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=target;
  SELECT coalesce(jsonb_agg((to_jsonb(x)-'current_line_no')||jsonb_build_object('quantity',x.quantity::text) ORDER BY x.line_no,x.id),'[]') INTO lines FROM naijue_erp.transfer_line x WHERE transfer_id=target;
  settlements:='[]';
 ELSE RAISE EXCEPTION 'ordinary snapshot kind required' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('header',h,'lines',lines,'settlements',settlements);
END $$;


ALTER FUNCTION "naijue_erp"."unified_document_snapshot"("kind" "text", "target" "uuid") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: sales_header; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."sales_header" (
    "id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "business_type" "text" NOT NULL,
    "business_date" "date" NOT NULL,
    "hall_id" "uuid" NOT NULL,
    "salesperson_id" "uuid",
    "customer_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "gross_amount" numeric(18,2) NOT NULL,
    "order_discount" numeric(18,2) NOT NULL,
    "net_due" numeric(18,2) NOT NULL,
    "note" "text",
    "version" integer NOT NULL,
    "created_by_account_id" "uuid",
    "created_hall_id" "uuid",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "approved_by_account_id" "uuid",
    "approved_at" timestamp with time zone,
    "stock_basis" "text" NOT NULL,
    "import_batch_id" "uuid",
    "responsible_staff_id" "uuid",
    "created_by_staff_id" "uuid",
    "approved_by_staff_id" "uuid",
    CONSTRAINT "sales_header_business_type_check" CHECK (("business_type" = ANY (ARRAY['SALE'::"text", 'RETURN'::"text", 'EXCHANGE'::"text"]))),
    CONSTRAINT "sales_header_number_check" CHECK (("length"("number") > 0)),
    CONSTRAINT "sales_header_order_discount_check" CHECK (("order_discount" >= (0)::numeric)),
    CONSTRAINT "sales_header_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'VOID'::"text"]))),
    CONSTRAINT "sales_header_stock_basis_check" CHECK (("stock_basis" = ANY (ARRAY['RUNTIME_LEDGER'::"text", 'CUTOFF_HISTORY'::"text"]))),
    CONSTRAINT "sales_header_version_check" CHECK (("version" > 0)),
    CONSTRAINT "unified_approval_state" CHECK ((("status" = 'APPROVED'::"text") OR (("approved_by_account_id" IS NULL) AND ("approved_by_staff_id" IS NULL) AND ("approved_at" IS NULL))))
);


ALTER TABLE "naijue_erp"."sales_header" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: unified_sales_header_audit_values("naijue_erp"."sales_header"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."unified_sales_header_audit_values"("h" "naijue_erp"."sales_header") RETURNS "jsonb"
    LANGUAGE "sql" STABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('version',h.version,'createdByStaffId',h.created_by_staff_id,'approvedByStaffId',h.approved_by_staff_id,'responsibleStaffId',h.responsible_staff_id,'number',h.number,'businessType',h.business_type,
  'businessDate',h.business_date,'hallId',h.hall_id,'salespersonId',h.salesperson_id,'customerId',h.customer_id,'warehouseId',h.warehouse_id,
  'status',h.status,'grossAmount',(h.gross_amount*100)::bigint::text,'orderDiscount',(h.order_discount*100)::bigint::text,'netDue',(h.net_due*100)::bigint::text,
  'note',h.note,'updatedAt',h.updated_at,'approvedByAccountId',h.approved_by_account_id,'approvedAt',h.approved_at);
$$;


ALTER FUNCTION "naijue_erp"."unified_sales_header_audit_values"("h" "naijue_erp"."sales_header") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: sales_line; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."sales_line" (
    "id" "uuid" NOT NULL,
    "sales_id" "uuid" NOT NULL,
    "line_no" integer NOT NULL,
    "sku_id" "uuid" NOT NULL,
    "quantity" bigint NOT NULL,
    "reference_price" numeric(18,2),
    "deal_price" numeric(18,2) NOT NULL,
    "line_amount" numeric(18,2) NOT NULL,
    "allocated_discount" numeric(18,2),
    "is_gift" boolean,
    "product_code_snapshot" "text",
    "product_name_snapshot" "text",
    "color_name_snapshot" "text",
    "fit_name_snapshot" "text",
    "size_name_snapshot" "text",
    "barcode_snapshot" "text",
    "is_current" boolean NOT NULL,
    "pricing_rule" "text",
    "discount_tenths" integer,
    "zero_confirmed" boolean,
    CONSTRAINT "sales_line_allocated_discount_check" CHECK (("allocated_discount" >= (0)::numeric)),
    CONSTRAINT "sales_line_deal_price_check" CHECK (("deal_price" >= (0)::numeric)),
    CONSTRAINT "sales_line_line_no_check" CHECK (("line_no" > 0)),
    CONSTRAINT "sales_line_pricing_facts" CHECK (((("pricing_rule" IS NULL) AND ("discount_tenths" IS NULL) AND ("zero_confirmed" IS NULL)) OR (("pricing_rule" IS NOT NULL) AND ("zero_confirmed" IS NOT NULL) AND ((("pricing_rule" = 'UNIT_PRICE'::"text") AND ("discount_tenths" IS NULL)) OR (("pricing_rule" = 'DISCOUNT'::"text") AND ("discount_tenths" IS NOT NULL) AND (("discount_tenths" >= 0) AND ("discount_tenths" <= 100))))))),
    CONSTRAINT "sales_line_reference_price_check" CHECK (("reference_price" >= (0)::numeric))
);


ALTER TABLE "naijue_erp"."sales_line" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "sales_line"."line_amount"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sales_line"."line_amount" IS 'Signed gross: integer quantity times deal price. Net = line_amount minus allocated_discount.';


--
-- Name: COLUMN "sales_line"."pricing_rule"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sales_line"."pricing_rule" IS 'UNIT_PRICE or DISCOUNT; NULL means unknown pre-0002 intent, never derived from price ratio.';


--
-- Name: COLUMN "sales_line"."discount_tenths"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sales_line"."discount_tenths" IS 'Explicit integer 0..100 = 0.0..10.0 折; NULL for direct price or unknown pre-0002 intent.';


--
-- Name: COLUMN "sales_line"."zero_confirmed"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sales_line"."zero_confirmed" IS 'Explicit ordinary-zero confirmation; NULL is unknown and must not be upgraded to true by backfill.';


--
-- Name: unified_sales_line_audit_values("naijue_erp"."sales_line"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."unified_sales_line_audit_values"("ln" "naijue_erp"."sales_line") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('id',ln.id,'lineNo',ln.line_no,'skuId',ln.sku_id,'quantity',ln.quantity::text,
  'referencePrice',(ln.reference_price*100)::bigint::text,'dealPrice',(ln.deal_price*100)::bigint::text,'pricingRule',ln.pricing_rule,'discountTenths',ln.discount_tenths,
  'zeroConfirmed',ln.zero_confirmed,'lineAmount',(ln.line_amount*100)::bigint::text,'allocatedDiscount',(ln.allocated_discount*100)::bigint::text,
  'isGift',ln.is_gift,'isCurrent',ln.is_current,'snapshot',jsonb_build_object('productCode',ln.product_code_snapshot,'productName',ln.product_name_snapshot,
    'colorName',ln.color_name_snapshot,'fitName',ln.fit_name_snapshot,'sizeName',ln.size_name_snapshot,'barcode',ln.barcode_snapshot));
$$;


ALTER FUNCTION "naijue_erp"."unified_sales_line_audit_values"("ln" "naijue_erp"."sales_line") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: sales_settlement; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."sales_settlement" (
    "id" "uuid" NOT NULL,
    "sales_id" "uuid" NOT NULL,
    "line_no" integer NOT NULL,
    "payment_account_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "amount" numeric(18,2) NOT NULL,
    "account_name_snapshot" "text",
    "method_name_snapshot" "text",
    "payment_method_id_snapshot" "uuid",
    CONSTRAINT "sales_settlement_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "sales_settlement_direction_check" CHECK (("direction" = ANY (ARRAY['RECEIVE'::"text", 'REFUND'::"text"]))),
    CONSTRAINT "sales_settlement_line_no_check" CHECK (("line_no" > 0))
);


ALTER TABLE "naijue_erp"."sales_settlement" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "sales_settlement"."payment_method_id_snapshot"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sales_settlement"."payment_method_id_snapshot" IS 'Original payment-method identity, captured server-side. Existing unknown NULL is never inferred from a display name or the account current method; unknown cannot qualify recent-use recommendation.';


--
-- Name: unified_sales_settlement_audit_values("naijue_erp"."sales_settlement"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."unified_sales_settlement_audit_values"("row_value" "naijue_erp"."sales_settlement") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
 SELECT jsonb_build_object('id',(row_value).id,'salesId',(row_value).sales_id,'lineNo',(row_value).line_no,'paymentAccountId',(row_value).payment_account_id,
  'paymentMethodId',(row_value).payment_method_id_snapshot,'direction',(row_value).direction,'amount',((row_value).amount*100)::bigint::text);
$$;


ALTER FUNCTION "naijue_erp"."unified_sales_settlement_audit_values"("row_value" "naijue_erp"."sales_settlement") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: valid_product_season_ids("uuid"[]); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."valid_product_season_ids"("value" "uuid"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
  SELECT value IS NULL OR CASE WHEN cardinality(value)=0 THEN true
    ELSE array_ndims(value)=1 AND array_lower(value,1)=1
      AND NOT EXISTS(SELECT 1 FROM unnest(value) item WHERE item IS NULL)
      AND cardinality(value)=(SELECT count(DISTINCT item) FROM unnest(value) item)
      AND value=ARRAY(SELECT item FROM unnest(value) item ORDER BY item) END;
$$;


ALTER FUNCTION "naijue_erp"."valid_product_season_ids"("value" "uuid"[]) OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_available_administrator_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_available_administrator_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NULL; END IF;
  IF TG_OP='INSERT' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='user_account' THEN
    IF NEW.login_enabled IS NOT DISTINCT FROM OLD.login_enabled AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='staff' THEN
    IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.hall_id IS NOT DISTINCT FROM OLD.hall_id
      AND NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='hall' THEN
    IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN RETURN NULL; END IF;
  END IF;
  PERFORM naijue_erp.maintenance_administrator_mutex();
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
    WHERE a.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'The last usable administrator cannot disappear' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_available_administrator_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_baseline_source_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_baseline_source_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  IF NEW.event_kind='CUTOFF_BASELINE' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
      WHERE s.import_batch_id=NEW.source_import_batch_id AND s.target_type='INVENTORY_KEY' AND s.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
       AND proof->>'ledger_entry_id'=NEW.id::text AND proof->>'operation_id'=NEW.operation_id::text AND (proof->'fields'->>'quantity')::bigint=NEW.quantity_delta)
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt receipt_row WHERE receipt_row.id=NEW.operation_id AND receipt_row.result_data->>'phase'='KEYS' AND receipt_row.completed_at=NEW.posted_at) THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_EXPLICIT_KEY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NEW.event_kind <> 'CUTOFF_BASELINE' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id IS DISTINCT FROM NEW.source_import_batch_id OR r.action <> 'IMPORT_CHUNK'
    OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR NOT (r.result_data->'ledgerEntryIds' ? NEW.id::text)
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = NEW.source_import_batch_id
      AND target_type = 'INVENTORY_LEDGER' AND target_id = NEW.id AND status = 'IMPORTED' AND source_entity_type = 'INVENTORY_BASELINE') THEN
    RAISE EXCEPTION 'baseline requires its native source and actual import operation' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_baseline_source_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_category_final_component(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_category_final_component"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE changed_id uuid; old_parent uuid; new_parent uuid; invalid boolean;
BEGIN
 changed_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF TG_OP<>'INSERT' THEN old_parent:=OLD.parent_id; END IF;
 IF TG_OP<>'DELETE' THEN new_parent:=NEW.parent_id; END IF;
 -- UNION, not UNION ALL, terminates even a malformed cyclic component.
 -- Include both original and proposed edges, then inspect actual final rows.
 WITH RECURSIVE component(id) AS (
  SELECT id FROM unnest(ARRAY[changed_id,old_parent,new_parent]) s(id) WHERE id IS NOT NULL
  UNION
  SELECT adjacent.id FROM component c
  CROSS JOIN LATERAL (
   SELECT n.parent_id AS id FROM naijue_erp.product_category n WHERE n.id=c.id AND n.parent_id IS NOT NULL
   UNION SELECT n.id FROM naijue_erp.product_category n WHERE n.parent_id=c.id
  ) adjacent
 )
 SELECT EXISTS(
  SELECT 1 FROM component c JOIN naijue_erp.product_category n ON n.id=c.id
  LEFT JOIN naijue_erp.product_category p ON p.id=n.parent_id
  WHERE n.deleted_at IS NULL AND n.parent_id IS NOT NULL
   AND (n.parent_id=n.id OR p.id IS NULL OR p.deleted_at IS NOT NULL OR p.parent_id IS NOT NULL)
 ) INTO invalid;
 IF invalid THEN
  RAISE EXCEPTION 'Final retained category component must be acyclic and at most two levels' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_category_final_component"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_document_specification_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_document_specification_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; parent naijue_erp.operation_receipt%ROWTYPE;
  pa naijue_erp.audit_change%ROWTYPE; current_actor record; item jsonb; actual jsonb;
  expected_raw text; barcode_count integer; parent_id uuid; actual_xid bigint; n integer; used boolean; parent_hall uuid;
  js_trim_chars text := chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)
    ||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
  IF NEW.object_type<>'PRODUCT' OR NEW.action<>'EDIT' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO current_actor
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF r.request_key NOT LIKE 'doc-spec:%' AND current_actor.role IS DISTINCT FROM 'SALESPERSON' THEN RETURN NULL; END IF;
  actual_xid:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.id IS NULL OR r.request_key !~ '^doc-spec:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR split_part(r.request_key,':',3)<>NEW.object_id::text OR r.actor_account_id<>NEW.actor_account_id
    OR r.action<>'EDIT' OR r.target_type<>'PRODUCT' OR r.target_id<>NEW.object_id OR r.status<>'COMMITTED'
    OR r.completed_at<>NEW.occurred_at OR r.result_data<>jsonb_build_object('operationId',NEW.operation_id,'kind','PRODUCT','targetId',NEW.object_id,'version',NEW.new_version)
    OR NOT naijue_erp.maintenance_audit_is_current(NEW.operation_id)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=r.id AND q.xmin::text::bigint=actual_xid)
    OR current_actor.login_enabled IS NOT TRUE OR current_actor.employment_status IS DISTINCT FROM '在职'
    OR current_actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') THEN
    RAISE EXCEPTION 'Document append requires the exact original current actor audit and receipt' USING ERRCODE='23514';
  END IF;
  parent_id:=split_part(r.request_key,':',2)::uuid;
  SELECT * INTO parent FROM naijue_erp.operation_receipt q WHERE q.id=parent_id AND q.xmin::text::bigint=actual_xid;
  SELECT * INTO pa FROM naijue_erp.audit_change WHERE operation_id=parent_id;
  IF parent.id IS NULL OR parent.id=NEW.operation_id OR parent.actor_account_id<>NEW.actor_account_id OR parent.action<>'SAVE'
    OR parent.status<>'COMMITTED' OR parent.target_type NOT IN ('SALES','TRANSFER') OR parent.completed_at<>NEW.occurred_at
    OR pa.operation_id IS NULL OR NOT naijue_erp.maintenance_audit_is_current(parent_id)
    OR pa.actor_account_id<>parent.actor_account_id OR pa.object_type<>parent.target_type OR pa.object_id<>parent.target_id
    OR pa.action<>'SAVE' OR pa.occurred_at<>parent.completed_at OR pa.new_version<>coalesce(pa.old_version,0)+1
    OR (pa.after_values->'header' ? 'status' AND pa.after_values->'header'->>'status' IS DISTINCT FROM 'DRAFT') OR pa.after_values->'header'->>'version' IS DISTINCT FROM pa.new_version::text
    OR parent.result_data->>'operationId' IS DISTINCT FROM parent_id::text OR parent.result_data->>'version' IS DISTINCT FROM pa.new_version::text
    OR parent.result_data->>'status' IS DISTINCT FROM 'DRAFT' OR parent.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR NEW.old_version IS NULL OR NEW.new_version<>NEW.old_version+1
    OR NEW.before_values IS DISTINCT FROM (jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb) || CASE WHEN NEW.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
    OR jsonb_typeof(NEW.after_values) IS DISTINCT FROM 'object' OR NEW.after_values-ARRAY['version','skus','barcodes']<>'{}'::jsonb
    OR NEW.after_values->'version' IS DISTINCT FROM to_jsonb(NEW.new_version)
    OR jsonb_typeof(NEW.after_values->'skus') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Append must close with the exact same-transaction original DRAFT SAVE' USING ERRCODE='23514';
  END IF;
  IF pg_catalog.octet_length('['||NEW.before_values::text||','||NEW.after_values::text||']')>16777216 THEN
    RAISE EXCEPTION 'DOCUMENT_APPEND_EVIDENCE_TOO_LARGE' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(NEW.after_values->'skus') NOT BETWEEN 1 AND 5000
    OR jsonb_typeof(pa.after_values->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Bounded nonempty append and actual parent lines required' USING ERRCODE='23514';
  END IF;
  IF current_actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=current_actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current document actor hall unavailable' USING ERRCODE='42501'; END IF;
  ELSIF current_actor.role='SALESPERSON' THEN
    RAISE EXCEPTION 'Salesperson requires an actual hall' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM naijue_erp.product p WHERE p.id=NEW.object_id AND p.enabled AND p.deleted_at IS NULL AND p.version=NEW.new_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact appended product root required' USING ERRCODE='23514'; END IF;
  IF parent.target_type='SALES' THEN
    SELECT h.hall_id INTO parent_hall FROM naijue_erp.sales_header h WHERE h.id=parent.target_id AND h.status='DRAFT' AND h.version=pa.new_version
      AND h.xmin::text::bigint=actual_xid AND parent.result_data->>'salesId'=h.id::text;
    IF NOT FOUND OR (current_actor.role='SALESPERSON' AND parent_hall IS DISTINCT FROM current_actor.hall_id) THEN
      RAISE EXCEPTION 'Append parent sales SAVE is outside current actor scope' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM 1 FROM naijue_erp.transfer_header h JOIN naijue_erp.warehouse f ON f.id=h.from_warehouse_id JOIN naijue_erp.warehouse t ON t.id=h.to_warehouse_id
      WHERE h.id=parent.target_id AND h.status='DRAFT' AND h.version=pa.new_version AND h.xmin::text::bigint=actual_xid
        AND parent.result_data->>'transferId'=h.id::text
        AND (current_actor.role IN ('ADMIN','WAREHOUSE') OR f.hall_id=current_actor.hall_id OR t.hall_id=current_actor.hall_id
          OR (h.created_role='SALESPERSON' AND h.created_hall_id=current_actor.hall_id AND h.created_by_account_id IS NOT NULL));
    IF NOT FOUND THEN RAISE EXCEPTION 'Append parent transfer SAVE is outside current actor scope' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT count(*) INTO n FROM naijue_erp.sku WHERE created_operation_id=NEW.operation_id;
  IF n<>jsonb_array_length(NEW.after_values->'skus') OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.after_values->'skus'))<>n THEN
    RAISE EXCEPTION 'Append evidence must equal the entire actual new SKU set' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.after_values->'skus') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact nine-column SKU evidence required' USING ERRCODE='23514'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item))<>9 OR NOT item ?& ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id'] THEN
      RAISE EXCEPTION 'Exact nine-column SKU evidence required' USING ERRCODE='23514'; END IF;
    SELECT to_jsonb(s) INTO actual FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
      JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=s.size_id
      JOIN naijue_erp.size z ON z.id=m.size_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id
      WHERE s.id=(item->>'id')::uuid AND s.product_id=NEW.object_id AND s.created_operation_id=NEW.operation_id
        AND s.version=1 AND s.enabled AND s.sku_code='NJNEW-'||replace(s.id::text,'-','')
        AND c.enabled AND c.deleted_at IS NULL AND f.enabled AND f.deleted_at IS NULL AND s.xmin::text::bigint=actual_xid;
    IF NOT FOUND OR actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'Actual new SKU differs or lies outside current product group' USING ERRCODE='23514'; END IF;
    IF parent.target_type='SALES' THEN
      SELECT EXISTS(SELECT 1 FROM naijue_erp.sales_line l WHERE l.sales_id=parent.target_id AND EXISTS(SELECT 1 FROM naijue_erp.sku selected_sku WHERE selected_sku.id=l.sku_id AND selected_sku.product_id=NEW.object_id AND selected_sku.color_id=(item->>'color_id')::uuid AND selected_sku.fit_id=(item->>'fit_id')::uuid)
        AND l.is_current AND l.quantity<>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    ELSE
      SELECT EXISTS(SELECT 1 FROM naijue_erp.transfer_line l WHERE l.transfer_id=parent.target_id AND EXISTS(SELECT 1 FROM naijue_erp.sku selected_sku WHERE selected_sku.id=l.sku_id AND selected_sku.product_id=NEW.object_id AND selected_sku.color_id=(item->>'color_id')::uuid AND selected_sku.fit_id=(item->>'fit_id')::uuid)
        AND l.is_current AND l.quantity>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    END IF;
    IF used IS NOT TRUE THEN RAISE EXCEPTION 'Every new SKU must belong to a color/fit pair selected by a nonzero actual parent SAVE line' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- Barcode rows are optional only when generation produced none. No old binding edits.
  SELECT count(*) INTO barcode_count FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.created_operation_id=NEW.operation_id;
  IF NOT (NEW.after_values ? 'barcodes') THEN
    IF barcode_count<>0 THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
  ELSE
    IF jsonb_typeof(NEW.after_values->'barcodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(NEW.after_values->'barcodes') NOT BETWEEN 1 AND 5000
      OR barcode_count<>jsonb_array_length(NEW.after_values->'barcodes')
      OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.after_values->'barcodes'))<>barcode_count
      OR (SELECT count(DISTINCT value->>'sku_id') FROM jsonb_array_elements(NEW.after_values->'barcodes'))<>barcode_count THEN
      RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.after_values->'barcodes') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(item))<>6 OR NOT item ?& ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled'] THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      SELECT to_jsonb(b) INTO actual FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id JOIN naijue_erp.product p ON p.id=s.product_id
        WHERE b.id=(item->>'id')::uuid AND s.product_id=NEW.object_id AND s.created_operation_id=NEW.operation_id
        AND s.xmin::text::bigint=actual_xid AND b.xmin::text::bigint=actual_xid AND b.barcode_kind='MAIN' AND b.enabled
        AND b.scheme_id=p.default_barcode_scheme_id;
      IF NOT FOUND OR actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      SELECT (CASE p.default_barcode_scheme_id::text
        WHEN 'c0b009e7-6f61-447a-b87e-ceea62711ec9' THEN '8'
        WHEN '82656465-2758-4be8-a965-412a971e9c4b' THEN '0'
        WHEN 'bc7ff32c-1025-4c30-8950-0b33a492c538' THEN '6'
        WHEN '48c4fe44-7521-44c1-a0e3-c547a1691028' THEN '2'
        WHEN '9c584ada-9d42-4159-9e51-208577657021' THEN '9'
        WHEN '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef' THEN '5' ELSE NULL END)
        || CASE WHEN p.default_barcode_scheme_id='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef' THEN CASE WHEN f.code ~ '^[0-9]+$' THEN f.code ELSE NULL END ELSE '' END
        || p.system_item_code || c.code || z.code INTO expected_raw
        FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id
        WHERE s.id=(item->>'sku_id')::uuid AND p.system_item_code IS NOT NULL AND btrim(p.system_item_code,js_trim_chars)<>'' AND btrim(c.code,js_trim_chars)<>'' AND btrim(z.code,js_trim_chars)<>'';
      IF expected_raw IS NULL OR (SELECT coalesce(sum(CASE WHEN codepoint>65535 THEN 2 ELSE 1 END),0)
        FROM (SELECT ascii(substr(expected_raw,i,1)) AS codepoint FROM generate_series(1,length(expected_raw)) AS g(i)) cp)>512
        OR EXISTS(SELECT 1 FROM (SELECT ascii(substr(expected_raw,i,1)) AS codepoint FROM generate_series(1,length(expected_raw)) AS g(i)) cp WHERE codepoint BETWEEN 1 AND 31 OR codepoint=127)
        OR item->>'barcode' IS DISTINCT FROM expected_raw THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_RAW_MISMATCH' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $_$;


ALTER FUNCTION "naijue_erp"."validate_document_specification_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_exact_native_reversal(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_exact_native_reversal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE'
      OR original.source_sales_line_id IS DISTINCT FROM NEW.source_sales_line_id
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id
      OR original.endpoint IS DISTINCT FROM NEW.endpoint OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.business_date <> NEW.business_date OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'reversal must match exact original native source and endpoint' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_exact_native_reversal"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_history_numeric_balance_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_history_numeric_balance_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id;
  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') OR r.action='HISTORY_REVISE' THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_BALANCE_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native sparse, sales, transfer and recorded-live balance validators remain attached.
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_history_numeric_balance_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_history_numeric_receipt_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_history_numeric_receipt_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') OR NEW.action='HISTORY_REVISE' THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_RECEIPT_RETIRED' USING ERRCODE='23514';
  END IF;
  -- Native receipt/audit reciprocity and business validators remain attached.
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_history_numeric_receipt_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_accounting_baseline_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_accounting_baseline_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  IF NEW.event_kind IS DISTINCT FROM 'CUTOFF_BASELINE'
    OR b.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
    OR b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
    OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id IS DISTINCT FROM b.id
    OR r.action IS DISTINCT FROM 'IMPORT_CHUNK' OR r.status IS DISTINCT FROM 'COMMITTED'
    OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR r.result_data->>'phase' IS DISTINCT FROM 'KEYS' OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR (SELECT count(*) FROM naijue_erp.import_record s
      CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
      WHERE s.import_batch_id=b.id AND s.target_type='INVENTORY_KEY' AND s.status='IMPORTED'
        AND s.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
        AND proof->>'ledger_entry_id'=NEW.id::text AND proof->>'operation_id'=NEW.operation_id::text
        AND proof->'fields'->>'warehouse_id'=NEW.warehouse_id::text AND proof->'fields'->>'sku_id'=NEW.sku_id::text
        AND (proof->'fields'->>'quantity')::bigint=NEW.quantity_delta) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_BASELINE_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  -- Mandatory receipt and batch triggers retain complete operation/effect-set closure.
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_import_accounting_baseline_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_accounting_checkpoint_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_accounting_checkpoint_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  SELECT x.operation_id INTO core_operation FROM naijue_erp.audit_change x WHERE x.object_type='IMPORT' AND x.object_id=NEW.id AND x.new_version=(NEW.checkpoint->>'sequence')::integer+1 AND x.after_values->>'profile'='STANDARD_IMPORT_SQL_V1';
  IF FOUND THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=core_operation;
    IF a.before_values IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.checkpoint END) OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint THEN RAISE EXCEPTION 'STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_standard_import_operation(core_operation); RETURN NULL;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN RAISE EXCEPTION 'STANDARD_BATCH_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED' USING ERRCODE='23514';
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_import_accounting_checkpoint_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_accounting_final_record_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_accounting_final_record_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; proof jsonb;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id;
  IF NEW.target_type IS DISTINCT FROM 'IMPORT_BATCH' OR NEW.target_id IS DISTINCT FROM b.id
    OR ((b.inventory_mode='CUTOFF_STOCK_BASELINE' AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1')
      OR (b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1')) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  proof:=naijue_erp.standard_import_record_proof(NEW.id);
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(proof->>'operation_id')::uuid;
  IF r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id IS DISTINCT FROM b.id
    OR r.status IS DISTINCT FROM 'COMMITTED' OR r.completed_at IS DISTINCT FROM NEW.reviewed_at
    OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR proof->>'target_type' IS DISTINCT FROM 'IMPORT_BATCH'
    OR proof->>'batch_id' IS DISTINCT FROM b.id::text OR proof->>'target_id' IS DISTINCT FROM b.id::text
    OR proof->>'entity_type' IS DISTINCT FROM NEW.source_entity_type THEN
    RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.source_entity_type='BATCH_NAMESPACE_BINDING' THEN
    IF b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR NEW.source_key IS DISTINCT FROM b.id::text
      OR proof->'fields'->>'batch_id' IS DISTINCT FROM b.id::text
      OR proof->'fields'->>'source_system' IS DISTINCT FROM b.source_name
      OR proof->'fields'->>'manifest_sha256' IS DISTINCT FROM b.source_hash THEN
      RAISE EXCEPTION 'FRESH35_STANDARD_NAMESPACE_PROOF_REQUIRED' USING ERRCODE='23514';
    END IF;
  ELSE
    IF r.action IS DISTINCT FROM 'IMPORT_PUBLISH' OR b.status IS DISTINCT FROM 'IMPORTED'
      OR b.completed_at IS DISTINCT FROM r.completed_at
      OR NEW.source_entity_type IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END
      OR NEW.source_key IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END
      OR r.result_data->>'phase' IS DISTINCT FROM CASE b.inventory_mode WHEN 'CUTOFF_STOCK_BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END THEN
      RAISE EXCEPTION 'FRESH35_STANDARD_FINAL_PROOF_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  -- Full current-actor, source/effect, publication and counter checks remain mandatory.
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_import_accounting_final_record_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_batch_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_batch_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  SELECT x.operation_id INTO core_operation FROM naijue_erp.audit_change x WHERE x.object_type='IMPORT' AND x.object_id=NEW.id AND x.new_version=(NEW.checkpoint->>'sequence')::integer+1 AND x.after_values->>'profile'='STANDARD_IMPORT_SQL_V1';
  IF FOUND THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=core_operation;
    IF a.before_values IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.checkpoint END) OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint THEN RAISE EXCEPTION 'STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_standard_import_operation(core_operation); RETURN NULL;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN RAISE EXCEPTION 'STANDARD_BATCH_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED' USING ERRCODE='23514';
END;
$_$;


ALTER FUNCTION "naijue_erp"."validate_import_batch_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_operation(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_operation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  IF NEW.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN PERFORM naijue_erp.assert_standard_import_operation(NEW.id); RETURN NULL; END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_OPERATION_RETIRED' USING ERRCODE='23514';
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_import_operation"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_publish("uuid", "jsonb"); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_publish"("batch" "uuid", "publishing_checkpoint" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE b naijue_erp.import_batch%ROWTYPE; kind text; actual bigint; expected bigint;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = batch FOR UPDATE;
  b.checkpoint := publishing_checkpoint;
  -- Locks prevent a native identity appearing/disappearing between scope count and publication.
  LOCK TABLE naijue_erp.warehouse, naijue_erp.sku IN SHARE MODE;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH'] LOOP
    IF ((b.checkpoint->'expected'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR ((b.checkpoint->'counts'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'explicit expected and processed scope counts are required' USING ERRCODE = '23514'; END IF;
    expected := (b.checkpoint->'expected'->>kind)::bigint;
    SELECT count(*) INTO actual FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = kind;
    IF actual <> expected OR actual <> (b.checkpoint->'counts'->>kind)::bigint THEN
      RAISE EXCEPTION 'published source count is incomplete' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF (b.checkpoint->'expected'->>'WAREHOUSE')::bigint <> (SELECT count(*) FROM naijue_erp.warehouse)
    OR (b.checkpoint->'expected'->>'SKU')::bigint <> (SELECT count(*) FROM naijue_erp.sku)
    OR (b.checkpoint->'expected'->>'IMPORT_BATCH')::bigint <> 1
    OR EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status <> 'IMPORTED')
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND target_type = 'IMPORT_BATCH' AND target_id = b.id
      AND source_entity_type = 'INVENTORY_SCOPE_APPROVAL' AND source_key = 'FINAL_COMPLETE_SCOPE'
      AND decision_reason = 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND source_record_hash = b.source_hash AND source_file_ref = b.source_manifest_ref) THEN
    RAISE EXCEPTION 'explicit frozen complete-scope and final-increment approval is missing' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.import_record r
      ON r.import_batch_id = b.id AND r.target_type = 'INVENTORY_LEDGER' AND r.target_id = l.id AND r.status = 'IMPORTED'
    LEFT JOIN naijue_erp.inventory_balance q ON q.warehouse_id = l.warehouse_id AND q.sku_id = l.sku_id
    WHERE l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM b.id OR r.id IS NULL
      OR q.quantity IS DISTINCT FROM l.quantity_delta OR q.version IS DISTINCT FROM 1 OR q.last_operation_id IS DISTINCT FROM l.operation_id)
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_balance q WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.source_import_batch_id = b.id AND l.event_kind = 'CUTOFF_BASELINE'
        AND l.warehouse_id = q.warehouse_id AND l.sku_id = q.sku_id)) THEN
    RAISE EXCEPTION 'per-key source baseline and balance reconciliation failed' USING ERRCODE = '23514'; END IF;
END;
$_$;


ALTER FUNCTION "naijue_erp"."validate_import_publish"("batch" "uuid", "publishing_checkpoint" "jsonb") OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_import_source_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_import_source_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE l naijue_erp.inventory_ledger%ROWTYPE; member_root uuid;
BEGIN
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_record_proof(NEW.id);
    SELECT (a.after_values->'whole_package_v2'->>'root_operation')::uuid INTO STRICT member_root
     FROM naijue_erp.audit_change a WHERE a.operation_id=(NEW.decision_reason::jsonb->>'operationId')::uuid;
    IF member_root IS NOT NULL THEN
     PERFORM naijue_erp.standard_whole_package_context_v2(member_root);
     -- Full typed/effect checks remain in the mandatory receipt and batch
     -- deferred triggers, not repeated for every source row in the same chunk.
     RETURN NULL;
    END IF;
    PERFORM naijue_erp.assert_standard_import_operation((NEW.decision_reason::jsonb->>'operationId')::uuid); RETURN NULL;
  END IF;
  IF NEW.target_type = 'INVENTORY_LEDGER' AND NEW.status = 'IMPORTED' THEN
    SELECT * INTO STRICT l FROM naijue_erp.inventory_ledger WHERE id = NEW.target_id;
    IF l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM NEW.import_batch_id
      OR NEW.source_entity_type <> 'INVENTORY_BASELINE' THEN
      RAISE EXCEPTION 'source record does not point at its own immutable baseline' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_import_source_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_ledger_receipt_source(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_ledger_receipt_source"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; owner_id uuid;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF NEW.source_sales_line_id IS NOT NULL THEN
    SELECT sales_id INTO STRICT owner_id FROM naijue_erp.sales_line WHERE id = NEW.source_sales_line_id;
    IF r.target_type <> 'SALES' THEN RAISE EXCEPTION 'sales ledger requires sales receipt' USING ERRCODE = '23514'; END IF;
  ELSE
    SELECT transfer_id INTO STRICT owner_id FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id;
    IF r.target_type <> 'TRANSFER' THEN RAISE EXCEPTION 'transfer ledger requires transfer receipt' USING ERRCODE = '23514'; END IF;
  END IF;
  IF owner_id IS DISTINCT FROM r.target_id OR NEW.event_kind <> r.action
    OR NEW.source_document_version::text IS DISTINCT FROM r.result_data->>'version' THEN
    RAISE EXCEPTION 'ledger source kind target action or version differs from receipt' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_ledger_receipt_source"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_maintenance_receipt_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_maintenance_receipt_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE native_version integer; native_xid bigint; a naijue_erp.audit_change%ROWTYPE; root_table regclass;
BEGIN
  IF NEW.target_type='CATEGORY' AND NEW.action IN ('REORDER','UNDO_REORDER') THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
    PERFORM naijue_erp.maintenance_check_category_order(a);
    RETURN NULL;
  END IF;
  root_table:=naijue_erp.maintenance_root_table(NEW.target_type);
  IF root_table IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT version,xmin::text::bigint FROM %s WHERE id=$1 FOR SHARE',root_table) INTO STRICT native_version,native_xid USING NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
  IF NOT naijue_erp.maintenance_audit_is_current(NEW.id) OR native_xid<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    OR NEW.status<>'COMMITTED' OR (NEW.result_data->>'version')::numeric<>native_version
    OR a.object_type<>NEW.target_type OR a.object_id<>NEW.target_id OR a.actor_account_id<>NEW.actor_account_id
    OR a.action<>NEW.action OR a.new_version<>native_version OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR a.after_values->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR (a.old_version IS NULL AND (a.before_values IS NOT NULL OR a.action<>'CREATE'))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR a.before_values->'version' IS DISTINCT FROM to_jsonb(a.old_version) OR a.action='CREATE'))
    OR NOT naijue_erp.safe_maintenance_evidence(a.before_values) OR NOT naijue_erp.safe_maintenance_evidence(a.after_values) THEN
    RAISE EXCEPTION 'Maintenance receipt audit and final native root must close together' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $_$;


ALTER FUNCTION "naijue_erp"."validate_maintenance_receipt_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_maintenance_root_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_maintenance_root_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NULL; END IF;
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'product_category' THEN 'CATEGORY'
    WHEN 'color' THEN 'COLOR' WHEN 'fit' THEN 'FIT' WHEN 'hall' THEN 'HALL' WHEN 'warehouse' THEN 'WAREHOUSE'
    WHEN 'staff' THEN 'STAFF' WHEN 'user_account' THEN 'ACCOUNT' WHEN 'payment_method' THEN 'PAYMENT_METHOD'
    WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' END;
  IF family IS NULL THEN RAISE EXCEPTION 'Unsupported maintenance root' USING ERRCODE='23514'; END IF;
  IF family='CATEGORY' THEN
    SELECT x.* INTO a FROM naijue_erp.audit_change x WHERE x.object_type='CATEGORY' AND x.action IN ('REORDER','UNDO_REORDER')
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'category_order'->'rows') m WHERE m->>'id'=NEW.id::text);
    IF FOUND THEN
      IF TG_OP<>'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id OR OLD.deleted_at IS NOT NULL
        OR NEW.display_order IS NOT DISTINCT FROM OLD.display_order OR NEW.version::bigint<>OLD.version::bigint+1
        OR to_jsonb(NEW)-ARRAY['display_order','version'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['display_order','version']
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.before_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',OLD.id,'version',OLD.version,'display_order',OLD.display_order))
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',NEW.id,'version',NEW.version,'display_order',NEW.display_order)) THEN
        RAISE EXCEPTION 'Every category sibling update must match its exact aggregate OLD and NEW' USING ERRCODE='23514';
      END IF;
      -- The receipt trigger checks the complete final aggregate once. This row
      -- trigger independently proves every actual OLD/NEW without N full scans.
      RETURN NULL;
    END IF;
  END IF;
  SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  present:=FOUND;
  -- Preserve the original first-import/bootstrap lanes and their separate source
  -- guards. Once a cutoff is published every ordinary root write needs evidence.
  IF NOT present AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NULL; END IF;
  -- Existing authenticated self-password change deliberately has no maintenance
  -- receipt. Preserve only its exact non-secret metadata/password transition;
  -- every D2 reset with a receipt still takes the full closure below.
  IF NOT present AND family='ACCOUNT' THEN
    SELECT * INTO a FROM naijue_erp.audit_change x WHERE x.object_type='STAFF' AND x.object_id=NEW.staff_id
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'accounts') q(v) WHERE v->>'id'=NEW.id::text AND v->'version'=to_jsonb(NEW.version));
    IF FOUND THEN
      PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
      IF EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Changed staff child account cannot retain old sessions' USING ERRCODE='23514';
      END IF;
      RETURN NULL;
    END IF;
  END IF;
  IF NOT present AND family='ACCOUNT' AND TG_OP='UPDATE' THEN
    IF to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at']
        =to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at']
      AND NEW.password_hash IS DISTINCT FROM OLD.password_hash
      AND NEW.password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
      AND NEW.auth_version::bigint=OLD.auth_version::bigint+1 AND NEW.version::bigint=OLD.version::bigint+1 THEN RETURN NULL; END IF;
  END IF;
  IF NOT present OR NOT naijue_erp.maintenance_audit_is_current(a.operation_id) OR a.old_version IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.version END)
    OR a.new_version<>NEW.version OR (TG_OP='INSERT' AND (NEW.version<>1 OR a.action<>'CREATE'))
    OR (TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.version::bigint<>OLD.version::bigint+1 OR a.action='CREATE')) THEN
    RAISE EXCEPTION 'Native root requires its exact one-step maintenance audit' USING ERRCODE='23514';
  END IF;
  new_root:=to_jsonb(NEW)-'password_hash'; old_root:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'password_hash' END;
  after_root:=a.after_values; before_root:=a.before_values;
  IF family='PRODUCT' THEN
    after_root:=after_root-ARRAY['skus','barcodes','images']; before_root:=before_root-ARRAY['skus','barcodes','images'];
    PERFORM naijue_erp.maintenance_check_product_children(a,false);
  ELSIF family='PAYMENT_ACCOUNT' THEN
    after_root:=after_root-'payment_halls'; before_root:=before_root-'payment_halls';
    IF a.before_values ? 'payment_halls' OR a.after_values ? 'payment_halls' THEN
      IF NOT naijue_erp.maintenance_exact_rows_match(a.after_values->'payment_halls',naijue_erp.maintenance_payment_halls(NEW.id),'hall_id') THEN
        RAISE EXCEPTION 'Final payment hall relations differ from complete after evidence' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='STAFF' THEN
    after_root:=after_root-ARRAY['accounts','account_credentials']; before_root:=before_root-'accounts';
    PERFORM naijue_erp.maintenance_check_staff_accounts(a,old_root,new_root,false);
  ELSIF family='ACCOUNT' THEN
    after_root:=after_root-'account_credentials';
    PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
    IF TG_OP='UPDATE' THEN
      IF NEW.staff_id IS DISTINCT FROM OLD.staff_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.auth_version::bigint<>OLD.auth_version::bigint+1 OR EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Account safety epoch provenance and sessions must close together' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.auth_version<>1 OR NEW.created_at IS DISTINCT FROM a.occurred_at THEN
      RAISE EXCEPTION 'New account starts at the original operation' USING ERRCODE='23514';
    END IF;
    IF NEW.updated_at IS DISTINCT FROM a.occurred_at THEN RAISE EXCEPTION 'Account time must match operation' USING ERRCODE='23514'; END IF;
    IF a.action IN ('DISABLE','RESTORE') THEN
      IF TG_OP<>'UPDATE' OR (NEW.login_enabled IS DISTINCT FROM (a.action='RESTORE'))
        OR NEW.login_enabled IS NOT DISTINCT FROM OLD.login_enabled
        OR to_jsonb(NEW)-ARRAY['login_enabled','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['login_enabled','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Account disable or restore must only change its actual login state and epochs' USING ERRCODE='23514';
      END IF;
    ELSIF a.action='RESET_PASSWORD' THEN
      IF TG_OP<>'UPDATE' OR to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Password reset cannot change account identity or scope' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.login_enabled AND NOT EXISTS(SELECT 1 FROM naijue_erp.staff s LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
      WHERE s.id=NEW.staff_id AND s.employment_status='在职' AND s.role IN ('ADMIN','WAREHOUSE','SALESPERSON')
        AND (s.role<>'SALESPERSON' OR s.hall_id IS NOT NULL) AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'Enabled account requires current active staff and usable scope' USING ERRCODE='23514';
    END IF;
  END IF;
  IF jsonb_typeof(after_root) IS DISTINCT FROM 'object' OR (old_root IS NULL AND before_root IS NOT NULL)
    OR (old_root IS NOT NULL AND jsonb_typeof(before_root) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Actual root sparse objects required' USING ERRCODE='23514';
  END IF;
  FOR field IN SELECT * FROM jsonb_each(new_root) LOOP
    IF old_root IS NULL OR field.value IS DISTINCT FROM old_root->field.key THEN
      IF NOT naijue_erp.maintenance_evidence_matches(after_root->field.key,field.value)
        OR (old_root IS NOT NULL AND NOT naijue_erp.maintenance_evidence_matches(before_root->field.key,old_root->field.key)) THEN
        RAISE EXCEPTION 'Audit must contain every actual changed native root value' USING ERRCODE='23514';
      END IF;
    ELSIF after_root ? field.key OR before_root ? field.key THEN
      RAISE EXCEPTION 'Unchanged native values cannot be copied into sparse audit' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(after_root) AS k(name) WHERE NOT new_root ? k.name)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(before_root) AS k(name) WHERE NOT old_root ? k.name) THEN
    RAISE EXCEPTION 'Audit root contains invented fields or credentials' USING ERRCODE='23514';
  END IF;
  IF family='HALL' THEN
    IF NEW.default_sales_warehouse_id IS NOT NULL THEN
      PERFORM 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id FOR SHARE;
      IF NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id AND hall_id=NEW.id) THEN
        RAISE EXCEPTION 'Default sales warehouse must belong to the selected hall' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='WAREHOUSE' THEN
    PERFORM 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id FOR SHARE;
    IF EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id AND id<>NEW.hall_id) THEN
      RAISE EXCEPTION 'Warehouse move would invalidate an actual hall default' USING ERRCODE='23514';
    END IF;
  ELSIF family='CATEGORY' THEN
    parent:=NEW.parent_id; visited:=ARRAY[NEW.id];
    WHILE parent IS NOT NULL LOOP
      IF parent=ANY(visited) THEN RAISE EXCEPTION 'Category parent cycle rejected' USING ERRCODE='23514'; END IF;
      visited:=array_append(visited,parent);
      SELECT parent_id INTO STRICT parent FROM naijue_erp.product_category WHERE id=parent FOR SHARE;
    END LOOP;
  END IF;
  RETURN NULL;
END $_$;


ALTER FUNCTION "naijue_erp"."validate_maintenance_root_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_native_creation_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_native_creation_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  IF NEW.created_operation_id IS NOT NULL AND NOT naijue_erp.native_creation_operation_valid(
    CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' ELSE 'SKU' END,NEW.id,NEW.created_operation_id) THEN
    RAISE EXCEPTION 'Exact native creation operation, root audit and receipt did not close' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_native_creation_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_party_native_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_party_native_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  kind text; next_values jsonb; prior_values jsonb; expected_after jsonb; expected_before jsonb; final_version integer;
BEGIN
  IF TG_OP = 'INSERT' AND naijue_erp.is_native_party_import_insert(
    CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, to_jsonb(NEW)) THEN
    -- The separate deferred import evidence trigger proves source/native/reference completeness.
    -- UPDATE always executes the unchanged online command checks below, even after import.
    RETURN NULL;
  END IF;
  kind := CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' ELSE NULL END;
  IF kind IS NULL THEN RAISE EXCEPTION 'unknown native party kind' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = kind AND object_id = NEW.id AND new_version = NEW.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> kind OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action
    OR NEW.updated_at IS DISTINCT FROM r.completed_at OR a.occurred_at IS DISTINCT FROM r.completed_at THEN
    RAISE EXCEPTION 'native party requires coherent actor operation action and action time' USING ERRCODE = '23514';
  END IF;
  next_values := naijue_erp.party_key_values(NEW.code, NEW.name, NEW.enabled, NEW.version);
  IF TG_OP = 'INSERT' THEN
    IF a.action <> 'CREATE' OR a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR NEW.created_at IS DISTINCT FROM r.completed_at THEN
      RAISE EXCEPTION 'new party requires actual creation evidence' USING ERRCODE = '23514';
    END IF;
    expected_after := next_values;
  ELSE
    IF a.old_version IS DISTINCT FROM OLD.version OR a.action NOT IN ('EDIT', 'DISABLE', 'RESTORE')
      OR (a.action = 'EDIT' AND (NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled))
      OR (a.action = 'DISABLE' AND (NOT OLD.enabled OR NEW.enabled OR NEW.name IS DISTINCT FROM OLD.name))
      OR (a.action = 'RESTORE' AND (OLD.enabled OR NOT NEW.enabled OR NEW.name IS DISTINCT FROM OLD.name)) THEN
      RAISE EXCEPTION 'party command does not describe native transition' USING ERRCODE = '23514';
    END IF;
    prior_values := naijue_erp.party_key_values(OLD.code, OLD.name, OLD.enabled, OLD.version);
    SELECT jsonb_object_agg(key, value) INTO expected_before FROM jsonb_each(prior_values) WHERE value IS DISTINCT FROM next_values->key;
    SELECT jsonb_object_agg(key, value) INTO expected_after FROM jsonb_each(next_values) WHERE value IS DISTINCT FROM prior_values->key;
    IF a.before_values IS DISTINCT FROM expected_before THEN RAISE EXCEPTION 'party sparse before evidence differs from replaced native values' USING ERRCODE = '23514'; END IF;
  END IF;
  IF a.after_values IS DISTINCT FROM expected_after THEN RAISE EXCEPTION 'party sparse after evidence differs from actual changed native values' USING ERRCODE = '23514'; END IF;
  IF kind = 'CUSTOMER' THEN SELECT version INTO STRICT final_version FROM naijue_erp.customer WHERE id = NEW.id;
  ELSE SELECT version INTO STRICT final_version FROM naijue_erp.supplier WHERE id = NEW.id; END IF;
  IF final_version IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'one final party version per transaction is required' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_party_native_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_party_receipt_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_party_receipt_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE native_version integer; native_code text; native_enabled boolean; native_updated_at timestamptz; a naijue_erp.audit_change%ROWTYPE;
BEGIN
  IF NEW.target_type = 'CUSTOMER' THEN SELECT version, code, enabled, updated_at INTO STRICT native_version, native_code, native_enabled, native_updated_at FROM naijue_erp.customer WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'SUPPLIER' THEN SELECT version, code, enabled, updated_at INTO STRICT native_version, native_code, native_enabled, native_updated_at FROM naijue_erp.supplier WHERE id = NEW.target_id;
  ELSE RAISE EXCEPTION 'unknown party receipt target' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF a.object_type <> NEW.target_type OR a.object_id <> NEW.target_id OR a.actor_account_id <> NEW.actor_account_id OR a.action <> NEW.action
    OR a.new_version <> native_version OR a.occurred_at IS DISTINCT FROM NEW.completed_at OR native_updated_at IS DISTINCT FROM NEW.completed_at
    OR NEW.result_data->>'version' IS DISTINCT FROM native_version::text OR NEW.result_data->>'code' IS DISTINCT FROM native_code
    OR NEW.result_data->'enabled' IS DISTINCT FROM to_jsonb(native_enabled)
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id) THEN
    RAISE EXCEPTION 'party receipt must describe final native party without inventory effect' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_party_receipt_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_recorded_live_balance_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_recorded_live_balance_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE;
  prior_quantity numeric; prior_version numeric; total numeric; effects bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=NEW.last_operation_id
    AND warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id AND event_kind IN ('APPROVE','UNAPPROVE')
    AND quantity_before IS NOT NULL AND quantity_after IS NOT NULL) THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id
    AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.target_type NOT IN ('SALES','TRANSFER') OR r.action NOT IN ('APPROVE','UNAPPROVE') OR r.status<>'COMMITTED'
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=r.id
      AND warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id
      AND (event_kind<>r.action OR quantity_before IS NULL OR quantity_after IS NULL OR posted_at IS DISTINCT FROM r.completed_at))
  THEN RAISE EXCEPTION 'Exact new native receipt and recorded current operation required' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL; END IF;
    prior_quantity:=OLD.quantity::numeric; prior_version:=OLD.version::numeric;
  ELSE
    -- Existing sparse INSERT proof, not this branch, authorizes the initial zero.
    prior_quantity:=0; prior_version:=0;
    IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=NEW.warehouse_id
      AND sku_id=NEW.sku_id AND operation_id<>NEW.last_operation_id) THEN
      RAISE EXCEPTION 'A previously used key cannot be rebuilt as zero' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT sum(quantity_delta::numeric),count(*) INTO total,effects FROM naijue_erp.inventory_ledger
    WHERE operation_id=r.id AND warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  IF effects=0 OR final_row.quantity::numeric IS DISTINCT FROM prior_quantity+total
    OR final_row.version::numeric IS DISTINCT FROM prior_version+effects
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at THEN
    RAISE EXCEPTION 'Recorded live balance differs from exact current operation total/version' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_recorded_live_balance_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_sales_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_sales_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb; count_effects bigint;
BEGIN
  IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version THEN
    RAISE EXCEPTION 'receipt/audit do not describe committed document version' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
     THEN
    RAISE EXCEPTION 'receipt does not match immutable inventory effects' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
      LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (sl.sales_id <> NEW.target_id OR l.event_kind <> NEW.action
      OR l.source_document_version <> h.version OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) THEN
    RAISE EXCEPTION 'inventory source or balance is not committed with this operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_sales_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_sales_effect(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_sales_effect"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; ln naijue_erp.sales_line%ROWTYPE; original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.sales_line WHERE id = NEW.source_sales_line_id;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = ln.sales_id;
  IF NOT ln.is_current OR ln.sku_id <> NEW.sku_id OR h.warehouse_id <> NEW.warehouse_id
    OR h.business_date <> NEW.business_date OR h.version + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime sales source' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id <> NEW.source_sales_line_id
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid original runtime reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_sales_effect"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_sales_settlement(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_sales_settlement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE target uuid; h naijue_erp.sales_header%ROWTYPE; total numeric; settlement_count bigint; preserve_missing_original boolean := false; evidence naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 origin_receipt naijue_erp.operation_receipt%ROWTYPE; origin_audit naijue_erp.audit_change%ROWTYPE;
 documents_batch naijue_erp.import_batch%ROWTYPE; baseline_batch naijue_erp.import_batch%ROWTYPE;
 source_record naijue_erp.import_record%ROWTYPE; source_receipt naijue_erp.operation_receipt%ROWTYPE; source_audit naijue_erp.audit_change%ROWTYPE;
 origin_snapshot jsonb; origin_header jsonb; current_snapshot jsonb; baseline_evidence jsonb; source_pointer jsonb; source_item jsonb; source_entry jsonb; source_request jsonb;
 cursor_header jsonb; actual_header jsonb; before_header jsonb; after_header jsonb; actual_effect_ids jsonb; receipt_effect_ids jsonb;
 mutable_header text[]; allowed_header text[]; field text; numeric_field text;
 proof_batch record; proof_target record; step record; origin_version integer; expected_version integer; previous_time timestamptz; previous_approval uuid;
 audit_count bigint; receipt_count bigint; effect_count bigint; expected_effects bigint;
BEGIN
 IF TG_TABLE_NAME='sales_header' THEN target:=NEW.id; ELSIF TG_OP='DELETE' THEN target:=OLD.sales_id; ELSE target:=NEW.sales_id; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=target;
 SELECT * INTO STRICT evidence FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=target AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=evidence.operation_id;
 SELECT coalesce(sum(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END),0),count(*) INTO total,settlement_count FROM naijue_erp.sales_settlement WHERE sales_id=target;
 -- Missing historical settlement evidence is not an inferred zero. Only exact
 -- original migration may preserve this absence; ordinary approval stays strict.
 IF evidence.action='MIGRATE_DOCUMENT' THEN
  PERFORM naijue_erp.assert_document_migration(r.id);
  preserve_missing_original:=h.business_type='SALE' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0
   AND evidence.after_values->'settlements'='[]'::jsonb;
 END IF;
 -- A historical empty settlement set is UNKNOWN even when net_due is zero.
 -- This narrowly admits exact original restoration; it never certifies an edit
 -- and never invokes current-importer/current-actor checks against old events.
 IF h.status='APPROVED' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0 AND evidence.action<>'MIGRATE_DOCUMENT' THEN
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' OR r.action IS DISTINCT FROM 'APPROVE' OR h.version<=1 THEN
   RAISE EXCEPTION 'HISTORICAL_ORIGINAL_RESTORATION_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT origin_receipt FROM naijue_erp.operation_receipt rr
   WHERE rr.target_type='SALES' AND rr.target_id=target AND rr.action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT origin_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=origin_receipt.id;
  origin_version:=origin_audit.new_version;
  origin_snapshot:=origin_audit.after_values-ARRAY['baseline','sourceRecordId'];
  origin_header:=origin_snapshot->'header';
  current_snapshot:=naijue_erp.unified_document_snapshot('SALES',target);
  IF origin_receipt.status IS DISTINCT FROM 'COMMITTED' OR origin_audit.object_type IS DISTINCT FROM 'SALES'
   OR origin_audit.object_id IS DISTINCT FROM target OR origin_audit.action IS DISTINCT FROM 'MIGRATE_DOCUMENT'
   OR origin_audit.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id
   OR origin_audit.occurred_at IS DISTINCT FROM origin_receipt.completed_at OR origin_version IS NULL OR origin_version<1 OR origin_version>=h.version
   OR origin_audit.old_version IS NOT NULL OR origin_audit.before_values IS NOT NULL
   OR jsonb_typeof(origin_snapshot) IS DISTINCT FROM 'object' OR origin_snapshot-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
   OR jsonb_typeof(origin_header) IS DISTINCT FROM 'object' OR jsonb_typeof(origin_snapshot->'lines') IS DISTINCT FROM 'array'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(origin_header) key) IS DISTINCT FROM
    (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.sales_header'::regclass AND attnum>0 AND NOT attisdropped)
   OR origin_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR origin_header->>'id' IS DISTINCT FROM target::text OR origin_header->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_header->>'business_type' IS DISTINCT FROM 'SALE' OR origin_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_header->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
   OR origin_receipt.result_data->>'operationId' IS DISTINCT FROM origin_receipt.id::text
   OR origin_receipt.result_data->>'salesId' IS DISTINCT FROM target::text
   OR origin_receipt.result_data->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_receipt.result_data->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
   OR origin_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(origin_snapshot::text,'UTF8')),'hex')
   OR origin_receipt.result_data->'baseline' IS DISTINCT FROM origin_audit.after_values->'baseline'
   OR origin_receipt.result_data->>'sourceRecordId' IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=origin_receipt.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q WHERE q.last_operation_id=origin_receipt.id) THEN
   RAISE EXCEPTION 'RESTORATION_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
  -- Full physical line rows, including inactive/zero rows and nullable snapshots,
  -- retain exactly their original identities, order, prices and economics.
  mutable_header:=ARRAY['version','status','updated_at','approved_by_account_id','approved_by_staff_id','approved_at','note','responsible_staff_id'];
  IF current_snapshot->'lines' IS DISTINCT FROM origin_snapshot->'lines'
   OR current_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR ((current_snapshot->'header') - mutable_header) IS DISTINCT FROM (origin_header - mutable_header)
   OR jsonb_array_length(origin_snapshot->'lines')=0 THEN
   RAISE EXCEPTION 'RESTORATION_CURRENT_ROWS_DIFFER' USING ERRCODE='23514'; END IF;
  IF h.gross_amount IS DISTINCT FROM (SELECT sum(ln.line_amount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)
   OR h.net_due IS DISTINCT FROM h.gross_amount-h.order_discount
   OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current
    AND (ln.line_amount IS DISTINCT FROM ln.quantity::numeric*ln.deal_price OR ln.deal_price<0))
   OR (SELECT coalesce(sum(ln.allocated_discount),0) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)>h.order_discount
   OR (NOT EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.allocated_discount IS NULL)
    AND (SELECT sum(ln.allocated_discount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current) IS DISTINCT FROM h.order_discount) THEN
   RAISE EXCEPTION 'RESTORATION_KNOWN_ECONOMICS_DIFFER' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch bb WHERE bb.id=h.import_batch_id;
  SELECT * INTO STRICT baseline_batch FROM naijue_erp.import_batch bb WHERE bb.id=(origin_audit.after_values->'baseline'->>'baselineBatchId')::uuid;
  baseline_evidence:=origin_audit.after_values->'baseline';
  IF documents_batch.inventory_mode IS DISTINCT FROM 'DOCUMENT_CONVERSION' OR documents_batch.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
   OR documents_batch.status IS DISTINCT FROM 'IMPORTED' OR baseline_batch.status IS DISTINCT FROM 'IMPORTED'
   OR baseline_batch.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR baseline_batch.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR documents_batch.source_name IS DISTINCT FROM baseline_batch.source_name OR documents_batch.source_hash IS DISTINCT FROM baseline_batch.source_hash
   OR documents_batch.cutoff_at IS DISTINCT FROM baseline_batch.cutoff_at
   OR origin_header->>'import_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR origin_receipt.result_data->>'batchId' IS DISTINCT FROM documents_batch.id::text
   OR baseline_evidence-ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'] IS DISTINCT FROM '{}'::jsonb
   OR baseline_evidence->>'state' IS DISTINCT FROM 'CONFIRMED'
   OR baseline_evidence->>'baselineManifestSha256' IS DISTINCT FROM baseline_batch.source_hash
   OR (baseline_evidence->>'cutoffAt')::timestamptz IS DISTINCT FROM baseline_batch.cutoff_at
   OR (baseline_evidence->>'coverageDigest' ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Both complete publications must be real immutable standard-import events.
  FOR proof_batch IN SELECT documents_batch.id AS id, 'DOCUMENT_PUBLISH'::text AS phase, documents_batch.checkpoint AS checkpoint, documents_batch.completed_at AS completed_at
   UNION ALL SELECT baseline_batch.id,'BASELINE_SEAL',baseline_batch.checkpoint,baseline_batch.completed_at LOOP
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=proof_batch.id
    AND rr.action='IMPORT_PUBLISH' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1';
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   source_request:=source_audit.after_values->'request';
   IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
    OR source_audit.object_id IS DISTINCT FROM proof_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
    OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_receipt.completed_at IS DISTINCT FROM proof_batch.completed_at
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_batch.id::text
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_receipt.result_data->>'baselineBatchId' IS DISTINCT FROM baseline_batch.id::text
    OR source_receipt.result_data->>'documentBatchId' IS DISTINCT FROM documents_batch.id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'status' IS DISTINCT FROM 'IMPORTED' OR source_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_audit.after_values->'checkpoint' IS DISTINCT FROM proof_batch.checkpoint
    OR proof_batch.checkpoint->'counts' IS DISTINCT FROM proof_batch.checkpoint->'expected'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_batch.id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to('PUBLISH:'||source_request::text,'UTF8')),'hex')
    OR source_receipt.completed_at<origin_receipt.completed_at AND proof_batch.phase='DOCUMENT_PUBLISH'
    OR source_receipt.completed_at>r.completed_at THEN
    RAISE EXCEPTION 'RESTORATION_PUBLICATION_INVALID' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- The original initializer pins this document cohort and coverage digest. Its
  -- recorded actor is historical evidence; present employment is irrelevant.
  SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=baseline_batch.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
  IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
   OR source_audit.object_id IS DISTINCT FROM baseline_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
   OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at
   OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR source_audit.after_values->'request'->>'batch_id' IS DISTINCT FROM baseline_batch.id::text
   OR source_audit.after_values->'request'->>'namespace' IS DISTINCT FROM documents_batch.source_name
   OR source_audit.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
   OR source_audit.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR source_audit.after_values->'request'->'payload'->>'alignment_sha256' IS DISTINCT FROM baseline_evidence->>'coverageDigest' THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Inline read-only source proof: no new routine, definer or execution grant.
  -- All source records bind exact typed fields, request rows, locations, original
  -- source-reference arrays and recomputed immutable source hashes.
  FOR proof_target IN
   SELECT documents_batch.id AS batch_id,'SALES_HEADER'::text AS kind,target AS id,origin_header AS fields
   UNION ALL SELECT documents_batch.id,'SALES_LINE',(v->>'id')::uuid,v FROM jsonb_array_elements(origin_snapshot->'lines') v
   UNION ALL SELECT DISTINCT baseline_batch.id,'INVENTORY_KEY',naijue_erp.standard_inventory_key_id(h.warehouse_id,(v->>'sku_id')::uuid),
    jsonb_build_object('warehouse_id',h.warehouse_id,'sku_id',v->>'sku_id') FROM jsonb_array_elements(origin_snapshot->'lines') v
    WHERE v->'is_current'='true'::jsonb AND (v->>'quantity')::bigint<>0 LOOP
   SELECT * INTO STRICT source_record FROM naijue_erp.import_record ss WHERE ss.import_batch_id=proof_target.batch_id AND ss.target_type=proof_target.kind
    AND ss.target_id=proof_target.id AND ss.status='IMPORTED';
   source_pointer:=source_record.decision_reason::jsonb;
   IF source_pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',source_pointer->>'operationId')
    OR (source_pointer->>'operationId')::uuid IS NULL THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.id=(source_pointer->>'operationId')::uuid;
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   SELECT value INTO STRICT source_item FROM jsonb_array_elements(source_audit.after_values->'records') value WHERE value->>'id'=source_record.id::text;
   source_request:=source_audit.after_values->'request';
   SELECT value INTO STRICT source_entry FROM jsonb_array_elements(source_request->'payload'->'rows') value WHERE value->>'record_id'=source_record.id::text;
   IF source_record.source_system IS DISTINCT FROM documents_batch.source_name OR source_record.reviewed_at IS NULL
    OR source_record.source_entity_type IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'INVENTORY_BASELINE' ELSE proof_target.kind END)
    OR source_receipt.target_type IS DISTINCT FROM 'IMPORT' OR source_receipt.target_id IS DISTINCT FROM proof_target.batch_id
    OR source_receipt.action IS DISTINCT FROM 'IMPORT_CHUNK' OR source_receipt.status IS DISTINCT FROM 'COMMITTED'
    OR source_audit.object_type IS DISTINCT FROM 'IMPORT' OR source_audit.object_id IS DISTINCT FROM proof_target.batch_id
    OR source_audit.action IS DISTINCT FROM source_receipt.action OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_record.reviewed_at IS DISTINCT FROM source_receipt.completed_at
    OR source_receipt.completed_at>origin_receipt.completed_at
    OR source_receipt.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_target.batch_id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS' ELSE 'DOCUMENTS' END)
    OR source_audit.after_values->>'phase' IS DISTINCT FROM source_receipt.result_data->>'phase'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_target.batch_id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to(CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS:' ELSE 'DOCUMENTS:' END||source_request::text,'UTF8')),'hex')
    OR source_item->>'id' IS DISTINCT FROM source_record.id::text OR source_item->>'target_id' IS DISTINCT FROM proof_target.id::text
    OR source_item->>'entity_type' IS DISTINCT FROM source_record.source_entity_type OR source_item->>'target_type' IS DISTINCT FROM proof_target.kind
    OR source_item->>'source_key' IS DISTINCT FROM source_record.source_key OR source_item->>'source_hash' IS DISTINCT FROM source_record.source_record_hash
    OR source_item->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('source_key',source_item->>'source_key','fields',source_item->'fields','source_refs',source_item->'source_refs')::text,'UTF8')),'hex')
    OR jsonb_typeof(source_item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(source_item->'source_refs')<1
    OR source_entry->>'source_key' IS DISTINCT FROM source_record.source_key OR source_entry->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR (proof_target.kind<>'INVENTORY_KEY' AND (source_entry->>'entity_type' IS DISTINCT FROM proof_target.kind
     OR source_entry->>'target_id' IS DISTINCT FROM proof_target.id::text OR source_entry->'identity_basis' IS DISTINCT FROM source_item->'identity_basis'))
    OR (proof_target.kind='INVENTORY_KEY' AND source_entry->'ledger_entry_id' IS DISTINCT FROM source_item->'ledger_entry_id')
    OR source_entry->'fields' IS DISTINCT FROM source_item->'fields' OR source_entry->'source_refs' IS DISTINCT FROM source_item->'source_refs'
    OR (source_receipt.result_data->'sourceRecordIds' ? source_record.id::text) IS NOT TRUE THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   IF proof_target.kind<>'INVENTORY_KEY' THEN
    IF jsonb_typeof(source_item->'fields') IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(source_item->'fields') key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    FOR numeric_field IN SELECT attname::text FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
     IF source_item->'fields'->numeric_field IS DISTINCT FROM proof_target.fields->numeric_field THEN
      RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
   END IF;
   IF proof_target.kind='SALES_HEADER' THEN
    IF source_record.id::text IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
     OR source_receipt.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id OR source_receipt.completed_at IS DISTINCT FROM origin_receipt.completed_at
     OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof_target.fields))
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_request->'payload'->'documents') doc
      WHERE doc IS NOT DISTINCT FROM jsonb_build_object('kind','SALES','id',target,'operation_id',origin_receipt.id,'request_key',origin_receipt.request_key,'source_record_id',source_record.id)
       AND origin_receipt.request_hash=encode(sha256(convert_to(doc::text||origin_snapshot::text,'UTF8')),'hex')) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSIF proof_target.kind='SALES_LINE' THEN
    IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof_target.fields)) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
    IF (source_item->'fields')-ARRAY['quantity'] IS DISTINCT FROM proof_target.fields
     OR jsonb_typeof(source_item->'fields'->'quantity') IS DISTINCT FROM 'string'
     OR (source_item->'fields'->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS NOT TRUE THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    IF (source_item->'fields'->>'quantity')::bigint=0 THEN
     IF source_item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.source_import_batch_id=baseline_batch.id
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=(proof_target.fields->>'sku_id')::uuid) THEN
      RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.id=(source_item->>'ledger_entry_id')::uuid AND l.operation_id=source_receipt.id
     AND l.event_kind='CUTOFF_BASELINE' AND l.source_import_batch_id=baseline_batch.id AND l.warehouse_id=h.warehouse_id
     AND l.sku_id=(proof_target.fields->>'sku_id')::uuid AND l.quantity_delta=(source_item->'fields'->>'quantity')::bigint) THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END LOOP;
  -- Every committed SALES event, not just a recent suffix, must be present once.
  SELECT count(*) INTO audit_count FROM naijue_erp.audit_change aa WHERE aa.object_type='SALES' AND aa.object_id=target;
  SELECT count(*) INTO receipt_count FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=target;
  IF audit_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 OR receipt_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  cursor_header:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,origin_header));
  expected_version:=origin_version; previous_time:=origin_receipt.completed_at; previous_approval:=origin_receipt.id;
  FOR step IN SELECT aa.*,rr.actor_account_id AS receipt_actor,rr.action AS receipt_action,rr.target_type AS receipt_kind,rr.target_id AS receipt_target,
   rr.completed_at,rr.result_data,rr.status AS receipt_status FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
   WHERE aa.object_type='SALES' AND aa.object_id=target AND aa.new_version>origin_version ORDER BY aa.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version IS DISTINCT FROM expected_version+1
    OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE') OR step.action IS DISTINCT FROM step.receipt_action
    OR step.receipt_kind IS DISTINCT FROM 'SALES' OR step.receipt_target IS DISTINCT FROM target
    OR step.actor_account_id IS DISTINCT FROM step.receipt_actor OR step.receipt_status IS DISTINCT FROM 'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.completed_at<previous_time
    OR step.result_data->>'operationId' IS DISTINCT FROM step.operation_id::text OR step.result_data->>'salesId' IS DISTINCT FROM target::text
    OR step.result_data->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR step.result_data->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END) THEN
    RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
   IF jsonb_typeof(step.before_values) IS DISTINCT FROM 'object' OR jsonb_typeof(step.after_values) IS DISTINCT FROM 'object'
    OR step.before_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.after_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.before_values->'lines' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'lines' IS DISTINCT FROM '[]'::jsonb
    OR step.before_values->'settlements' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'settlements' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header'; after_header:=step.after_values->'header';
   allowed_header:=CASE step.action WHEN 'SAVE' THEN ARRAY['version','note','responsibleStaffId','updatedAt']
    ELSE ARRAY['version','status','updatedAt','approvedByAccountId','approvedByStaffId','approvedAt'] END;
   IF jsonb_typeof(before_header) IS DISTINCT FROM 'object' OR jsonb_typeof(after_header) IS DISTINCT FROM 'object'
    OR before_header - allowed_header IS DISTINCT FROM '{}'::jsonb OR after_header - allowed_header IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(before_header) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(after_header) key)
    OR (before_header ?& ARRAY['version','updatedAt']) IS NOT TRUE OR (after_header ?& ARRAY['version','updatedAt']) IS NOT TRUE
    OR before_header->'version' IS DISTINCT FROM to_jsonb(expected_version) OR after_header->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR (after_header->>'updatedAt')::timestamptz IS DISTINCT FROM step.completed_at
    OR cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action<>'SAVE' AND ((before_header ? 'status') IS NOT TRUE OR (after_header ? 'status') IS NOT TRUE)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   IF (after_header ? 'note') AND jsonb_typeof(after_header->'note') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   FOREACH field IN ARRAY ARRAY['responsibleStaffId','approvedByAccountId','approvedByStaffId'] LOOP
    IF after_header ? field THEN
     IF jsonb_typeof(after_header->field) NOT IN ('string','null') OR (jsonb_typeof(after_header->field)='string' AND (after_header->>field)::uuid IS NULL) THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
   END LOOP;
   FOR field IN SELECT jsonb_object_keys(before_header) LOOP
    IF field IN ('updatedAt','approvedAt') THEN
     IF jsonb_typeof(before_header->field) NOT IN ('string','null') OR jsonb_typeof(after_header->field) NOT IN ('string','null')
      OR (before_header->>field)::timestamptz IS DISTINCT FROM (cursor_header->>field)::timestamptz THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF before_header->field IS DISTINCT FROM cursor_header->field THEN
     RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    cursor_header:=jsonb_set(cursor_header,ARRAY[field],after_header->field);
   END LOOP;
   IF cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action='APPROVE' AND (cursor_header->>'approvedByAccountId' IS DISTINCT FROM step.receipt_actor::text
     OR cursor_header->>'approvedByStaffId' IS NULL OR (cursor_header->>'approvedAt')::timestamptz IS DISTINCT FROM step.completed_at))
    OR (step.action IN ('SAVE','UNAPPROVE') AND (cursor_header->'approvedByAccountId' IS DISTINCT FROM 'null'::jsonb
     OR cursor_header->'approvedByStaffId' IS DISTINCT FROM 'null'::jsonb OR cursor_header->'approvedAt' IS DISTINCT FROM 'null'::jsonb)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(l.id::text ORDER BY l.id),'[]'::jsonb),count(*) INTO actual_effect_ids,effect_count FROM naijue_erp.inventory_ledger l WHERE l.operation_id=step.operation_id;
   IF jsonb_typeof(step.result_data->'ledgerEntryIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO receipt_effect_ids FROM jsonb_array_elements_text(step.result_data->'ledgerEntryIds');
   SELECT count(*) INTO expected_effects FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0;
   IF actual_effect_ids IS DISTINCT FROM receipt_effect_ids OR (step.action='SAVE' AND effect_count<>0)
    OR (step.action IN ('APPROVE','UNAPPROVE') AND (effect_count<>expected_effects OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln
     WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0 AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l
      WHERE l.operation_id=step.operation_id AND l.source_sales_line_id=ln.id AND l.source_transfer_line_id IS NULL AND l.source_import_batch_id IS NULL
       AND l.endpoint='SALES_WAREHOUSE' AND l.event_kind=step.action AND l.source_document_version=step.new_version
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=ln.sku_id AND l.business_date=h.business_date AND l.posted_at=step.completed_at
       AND l.quantity_delta::numeric=ln.quantity::numeric*CASE step.action WHEN 'APPROVE' THEN -1 ELSE 1 END
       AND ((step.action='APPROVE' AND l.reverses_entry_id IS NULL AND l.baseline_anchor_operation_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version=origin_version AND l.baseline_anchor_operation_id=origin_receipt.id AND l.reverses_entry_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version>origin_version AND l.baseline_anchor_operation_id IS NULL AND EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger prior
         WHERE prior.id=l.reverses_entry_id AND prior.operation_id=previous_approval AND prior.source_sales_line_id=ln.id AND prior.event_kind='APPROVE'
          AND prior.quantity_delta::numeric+l.quantity_delta::numeric=0))))))) THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   IF step.action='APPROVE' THEN previous_approval:=step.operation_id; END IF;
   expected_version:=step.new_version;previous_time:=step.completed_at;
  END LOOP;
  actual_header:=naijue_erp.unified_sales_header_audit_values(h);
  FOR field IN SELECT jsonb_object_keys(actual_header) LOOP
   IF field IN ('updatedAt','approvedAt') THEN
    IF (cursor_header->>field)::timestamptz IS DISTINCT FROM (actual_header->>field)::timestamptz THEN
     RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cursor_header->field IS DISTINCT FROM actual_header->field THEN
    RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF expected_version IS DISTINCT FROM h.version OR cursor_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line ln ON ln.id=l.source_sales_line_id
    LEFT JOIN naijue_erp.operation_receipt rr ON rr.id=l.operation_id WHERE ln.sales_id=target
     AND (rr.target_type IS DISTINCT FROM 'SALES' OR rr.target_id IS DISTINCT FROM target)) THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  preserve_missing_original:=true;
 END IF;
 IF h.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h.net_due THEN
  RAISE EXCEPTION 'ordinary approved state requires settlement net equal to net due' USING ERRCODE='23514'; END IF;
 IF evidence.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL; END IF;
 IF TG_TABLE_NAME='sales_header' AND (TG_OP='INSERT' OR to_jsonb(NEW)->'responsible_staff_id' IS DISTINCT FROM to_jsonb(OLD)->'responsible_staff_id') THEN
  IF evidence.action<>'SAVE' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>target OR r.actor_account_id<>evidence.actor_account_id
    OR evidence.after_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(h)->'responsible_staff_id' THEN
   RAISE EXCEPTION 'ordinary responsibility requires matching SAVE audit/receipt' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (evidence.old_version IS DISTINCT FROM OLD.version OR evidence.before_values->'header'->'responsibleStaffId' IS DISTINCT FROM to_jsonb(OLD)->'responsible_staff_id') THEN
   RAISE EXCEPTION 'ordinary responsibility before evidence mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $_$;


ALTER FUNCTION "naijue_erp"."validate_sales_settlement"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_sparse_balance_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_sparse_balance_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE; baseline naijue_erp.inventory_ledger%ROWTYPE;
  b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; total numeric; effects bigint;
BEGIN
  -- ORDINARY_KNOWN_BALANCE_validate_sparse_balance_commit_BEGIN
  IF TG_OP='INSERT' AND current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
    IF naijue_erp.standard_business_ready() IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514'; END IF;
    RAISE EXCEPTION 'STANDARD_MISSING_BALANCE_IS_UNKNOWN' USING ERRCODE='23514';
  END IF;
  -- ORDINARY_KNOWN_BALANCE_validate_sparse_balance_commit_END
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  -- V2 explicit zero is an actual current stock fact, not a ledger movement.
  -- This branch is limited to the original whole-package transaction and key.
  IF TG_OP='INSERT' AND NEW.quantity=0 AND r.target_type='IMPORT' AND r.action='IMPORT_CHUNK'
     AND r.result_data->>'phase'='KEYS' AND EXISTS(SELECT 1 FROM naijue_erp.audit_change x
       WHERE x.operation_id=r.id AND x.after_values ? 'whole_package_v2') THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
    PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);
    IF r.status IS DISTINCT FROM 'COMMITTED' OR r.completed_at IS DISTINCT FROM NEW.updated_at
      OR NEW.version IS DISTINCT FROM 1 OR NEW.last_operation_id IS DISTINCT FROM r.id
      OR a.actor_account_id IS DISTINCT FROM r.actor_account_id OR a.object_id IS DISTINCT FROM r.target_id
      OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements(a.after_values->'records') item
          WHERE item->>'target_type'='INVENTORY_KEY' AND item->'fields'->>'warehouse_id'=NEW.warehouse_id::text
            AND item->'fields'->>'sku_id'=NEW.sku_id::text AND item->'fields'->>'quantity'='0'
            AND item->>'ledger_entry_id' IS NULL
            AND EXISTS(SELECT 1 FROM naijue_erp.import_record src
              WHERE src.id=(item->>'id')::uuid AND src.import_batch_id=r.target_id
                AND src.target_type='INVENTORY_KEY' AND src.status='IMPORTED'
                AND src.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
                AND naijue_erp.standard_import_record_proof(src.id)->>'operation_id'=r.id::text))<>1
      OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id)
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q WHERE q.warehouse_id=NEW.warehouse_id AND q.sku_id=NEW.sku_id
         AND q.quantity=0 AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at)
    THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_BALANCE_INVALID' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;

  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN
    RAISE EXCEPTION 'FRESH35_HISTORICAL_BALANCE_RETIRED' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF r.target_type = 'IMPORT' THEN RAISE EXCEPTION 'an import receipt cannot overwrite existing stock' USING ERRCODE = '23514'; END IF;
    -- Preserve existing native SALES/TRANSFER transaction contracts and validators.
    RETURN NULL;
  END IF;
  IF r.target_type IN ('SALES', 'TRANSFER') THEN
    -- ONLY a first runtime approval may turn proven absence into an actual native balance.
    IF r.action NOT IN ('APPROVE','UNAPPROVE') OR r.status <> 'COMMITTED' OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
      RAISE EXCEPTION 'first native balance requires published runtime approval' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE';
    IF b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
      IF NOT naijue_erp.standard_business_ready() OR (naijue_erp.standard_inventory_key_proof(NEW.warehouse_id,NEW.sku_id)->>'state' NOT IN ('EXPLICIT_ZERO')
        AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_key_admission(NEW.warehouse_id,NEW.sku_id) k WHERE k.admitted AND (k.warehouse_basis='POST_CUTOFF_CREATED' OR k.sku_basis='POST_CUTOFF_CREATED')))
       THEN RAISE EXCEPTION 'STANDARD_FIRST_BALANCE_REQUIRES_PROVEN_ZERO_OR_NATIVE_CREATION' USING ERRCODE='23514'; END IF;
    ELSE
    IF b.completed_at IS NULL OR (b.checkpoint->>'sequence')::bigint <= 0
      OR b.checkpoint->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
      OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
      OR (b.checkpoint->>'cursor')::numeric IS DISTINCT FROM
        (b.checkpoint->'counts'->>'WAREHOUSE')::numeric + (b.checkpoint->'counts'->>'SKU')::numeric
        + (b.checkpoint->'counts'->>'INVENTORY_LEDGER')::numeric + (b.checkpoint->'counts'->>'IMPORT_BATCH')::numeric
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED'
        AND target_type = 'IMPORT_BATCH' AND target_id = b.id AND source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
        AND source_key = 'FINAL_COMPLETE_SCOPE'
        AND decision_reason = 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
        AND source_record_hash = b.source_hash AND source_file_ref = b.source_manifest_ref) THEN
      RAISE EXCEPTION 'first native balance requires complete immutable publication' USING ERRCODE = '23514'; END IF;
    END IF;
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = r.id;
    IF a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id
      OR a.action IS DISTINCT FROM r.action OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.new_version::text IS DISTINCT FROM r.result_data->>'version' OR a.old_version + 1 IS DISTINCT FROM a.new_version THEN
      RAISE EXCEPTION 'first native balance requires exact native receipt and audit' USING ERRCODE = '23514'; END IF;
    IF (r.target_type = 'SALES' AND NOT EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE h.id = r.target_id
        AND h.status = CASE r.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END AND h.version = a.new_version))
      OR (r.target_type = 'TRANSFER' AND NOT EXISTS (SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id = r.target_id
        AND h.status = CASE r.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END AND h.version = a.new_version)) THEN
      RAISE EXCEPTION 'first native balance cannot use cutoff history or another document' USING ERRCODE = '23514'; END IF;
    -- Prior used keys are retained by ledger_retains_balance. Never rebuild missing history from zero.
    IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.operation_id = r.id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id
          AND (l.event_kind <> r.action OR l.reverses_entry_id IS NOT NULL OR (r.action='UNAPPROVE' AND l.baseline_anchor_operation_id IS NULL) OR (r.action='APPROVE' AND l.baseline_anchor_operation_id IS NOT NULL) OR l.source_import_batch_id IS NOT NULL
            OR l.source_document_version IS DISTINCT FROM a.new_version OR l.posted_at IS DISTINCT FROM r.completed_at
            OR (r.target_type = 'SALES' AND (sl.sales_id IS DISTINCT FROM r.target_id OR l.source_transfer_line_id IS NOT NULL))
            OR (r.target_type = 'TRANSFER' AND (tl.transfer_id IS DISTINCT FROM r.target_id OR l.source_sales_line_id IS NOT NULL)))) THEN
      RAISE EXCEPTION 'first native balance requires only exact new operation effects' USING ERRCODE = '23514'; END IF;
    -- Bounded CURRENT operation/key only, never a full-history SUM. Repeated real lines increment independently.
    SELECT COALESCE(SUM(quantity_delta::numeric), 0), COUNT(*) INTO total, effects FROM naijue_erp.inventory_ledger
      WHERE operation_id = r.id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    IF effects = 0 OR final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects
      OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at THEN
      RAISE EXCEPTION 'first native balance must equal exact cumulative operation delta and effect count' USING ERRCODE = '23514'; END IF;
    RETURN NULL;
  END IF;
  IF r.target_type <> 'IMPORT' OR r.action <> 'IMPORT_CHUNK' THEN
    RAISE EXCEPTION 'unsupported fresh balance receipt' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger WHERE operation_id = r.id
    AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND event_kind = 'CUTOFF_BASELINE';
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF final_row.quantity IS DISTINCT FROM baseline.quantity_delta OR final_row.version <> 1
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR baseline.source_import_batch_id IS DISTINCT FROM r.target_id THEN
    RAISE EXCEPTION 'fresh baseline balance requires its exact nonzero real import effect' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_sparse_balance_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_transfer_balance_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_transfer_balance_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_balance naijue_erp.inventory_balance%ROWTYPE; total numeric; effects bigint;
BEGIN
  IF NEW.last_operation_id IS NULL OR OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF r.target_type <> 'TRANSFER' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT final_balance FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  SELECT COALESCE(SUM(quantity_delta::numeric), 0), COUNT(*) INTO total, effects FROM naijue_erp.inventory_ledger
    WHERE operation_id = NEW.last_operation_id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF effects = 0 OR final_balance.last_operation_id IS DISTINCT FROM NEW.last_operation_id
    OR final_balance.quantity::numeric <> OLD.quantity::numeric + total OR final_balance.version::numeric <> OLD.version::numeric + effects THEN
    RAISE EXCEPTION 'transfer balance quantity or version is not the exact cumulative operation delta' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_transfer_balance_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_transfer_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_transfer_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
  actual_ids jsonb; receipt_ids jsonb; count_effects bigint; current_lines bigint; before_lines jsonb; after_lines jsonb;
BEGIN
  IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version OR a.actor_account_id <> NEW.actor_account_id OR a.object_type <> 'TRANSFER'
    OR a.object_id <> h.id OR a.action <> NEW.action
    OR h.updated_at IS DISTINCT FROM NEW.completed_at OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR (NEW.action = 'APPROVE' AND (h.approved_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.approved_at IS DISTINCT FROM NEW.completed_at))
    OR h.status <> (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR jsonb_typeof(a.after_values->'lines') IS DISTINCT FROM 'array'
    OR (a.after_values - ARRAY['header', 'lines']) <> '{}'::jsonb
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(h)
    OR (a.old_version IS NULL AND (NEW.action <> 'SAVE' OR h.version <> 1 OR a.before_values IS NOT NULL
      OR h.created_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.created_at IS DISTINCT FROM NEW.completed_at))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR jsonb_typeof(a.before_values->'header') IS DISTINCT FROM 'object' OR jsonb_typeof(a.before_values->'lines') IS DISTINCT FROM 'array'
      OR (a.before_values - ARRAY['header', 'lines']) <> '{}'::jsonb
      OR a.before_values->'header'->>'version' IS DISTINCT FROM a.old_version::text
      OR a.before_values->'header'->>'status' IS DISTINCT FROM CASE NEW.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)) THEN
    RAISE EXCEPTION 'receipt audit action status key fields or version does not describe final transfer' USING ERRCODE = '23514';
  END IF;
  before_lines := COALESCE(a.before_values->'lines', '[]'::jsonb);
  after_lines := a.after_values->'lines';
  IF NEW.action <> 'SAVE' AND (before_lines <> '[]'::jsonb OR after_lines <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'posting audit must omit unchanged native transfer lines' USING ERRCODE = '23514';
  END IF;
  -- Deltas contain actual added/changed/deactivated rows only. No whole-native-line scan
  -- or previous-audit reconstruction is required to read or write the current document.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(after_lines) AS delta(value)
    LEFT JOIN naijue_erp.transfer_line ln ON ln.id::text = delta.value->>'id' AND ln.transfer_id = h.id
    WHERE jsonb_typeof(delta.value) IS DISTINCT FROM 'object' OR jsonb_typeof(delta.value->'id') IS DISTINCT FROM 'string'
      OR ln.id IS NULL OR delta.value IS DISTINCT FROM naijue_erp.transfer_line_audit_values(ln)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    WHERE jsonb_typeof(prior.value) IS DISTINCT FROM 'object' OR jsonb_typeof(prior.value->'id') IS DISTINCT FROM 'string'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(after_lines) AS next(value) WHERE next.value->>'id' = prior.value->>'id')
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(before_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(after_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    JOIN jsonb_array_elements(after_lines) AS next(value) ON next.value->>'id' = prior.value->>'id' WHERE next.value = prior.value
  ) THEN
    RAISE EXCEPTION 'invalid duplicate unchanged or non-native sparse transfer line delta' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*) INTO current_lines FROM naijue_erp.transfer_line WHERE transfer_id = h.id AND is_current;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF current_lines = 0 OR actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
    OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND count_effects <> current_lines * 2) THEN
    RAISE EXCEPTION 'transfer receipt does not match exact two-ended inventory effect set' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
    LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (l.source_sales_line_id IS NOT NULL OR tl.transfer_id IS DISTINCT FROM h.id OR NOT tl.is_current
      OR l.event_kind <> NEW.action OR l.source_document_version <> h.version OR l.sku_id <> tl.sku_id OR l.business_date <> h.business_date
      OR l.posted_at IS DISTINCT FROM NEW.completed_at
      OR l.warehouse_id IS DISTINCT FROM CASE l.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END
      OR l.quantity_delta::numeric IS DISTINCT FROM (CASE l.endpoint WHEN 'FROM' THEN -tl.quantity::numeric WHEN 'TO' THEN tl.quantity::numeric ELSE NULL END)
        * CASE NEW.action WHEN 'UNAPPROVE' THEN -1 ELSE 1 END
      OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND EXISTS (
    SELECT 1 FROM naijue_erp.transfer_line tl CROSS JOIN (VALUES ('FROM'), ('TO')) required(endpoint)
    WHERE tl.transfer_id = h.id AND tl.is_current AND NOT EXISTS (
      SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id = NEW.id AND l.source_transfer_line_id = tl.id AND l.endpoint = required.endpoint
    )
  )) THEN
    RAISE EXCEPTION 'transfer endpoint source quantity or covered balance differs from committed operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_transfer_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_transfer_effect(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_transfer_effect"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; ln naijue_erp.transfer_line%ROWTYPE;
  original naijue_erp.inventory_ledger%ROWTYPE; expected_delta numeric;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id FOR SHARE;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = ln.transfer_id FOR UPDATE;
  expected_delta := CASE NEW.endpoint WHEN 'FROM' THEN -ln.quantity::numeric WHEN 'TO' THEN ln.quantity::numeric ELSE NULL END;
  IF NEW.event_kind = 'UNAPPROVE' THEN expected_delta := -expected_delta; END IF;
  IF NOT ln.is_current OR ln.sku_id <> NEW.sku_id
    OR NEW.warehouse_id IS DISTINCT FROM (CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END)
    OR NEW.quantity_delta::numeric IS DISTINCT FROM expected_delta OR h.business_date <> NEW.business_date
    OR h.version::bigint + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime transfer source or endpoint effect' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id FOR UPDATE;
  IF NOT FOUND THEN
    -- ORDINARY_KNOWN_BALANCE_validate_transfer_effect_BEGIN
    IF current_user='erp_unified27_runtime_2393dbc6db9581c2' THEN
      IF naijue_erp.standard_business_ready() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514'; END IF;
      RAISE EXCEPTION 'STANDARD_MISSING_BALANCE_IS_UNKNOWN' USING ERRCODE='23514';
    END IF;
    -- ORDINARY_KNOWN_BALANCE_validate_transfer_effect_END
    IF (NEW.event_kind <> 'APPROVE' AND NEW.baseline_anchor_operation_id IS NULL) OR NEW.reverses_entry_id IS NOT NULL
      OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'transfer inventory coverage is not ready' USING ERRCODE = '23514'; END IF;
    -- The deferred sparse INSERT validator requires this exact operation's native receipt/audit and final real delta.
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' AND NEW.baseline_anchor_operation_id IS NULL THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id IS NOT NULL
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id OR original.endpoint IS DISTINCT FROM NEW.endpoint
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id OR original.business_date <> NEW.business_date
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid exact original transfer reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_transfer_effect"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_transfer_header_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_transfer_header_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = NEW.id AND new_version = NEW.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.action='MIGRATE_DOCUMENT' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary rows only' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
  END IF;
  IF r.target_type <> 'TRANSFER' OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(NEW) THEN
    RAISE EXCEPTION 'native transfer header requires matching operation and key-field audit' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR a.action <> 'SAVE' THEN
      RAISE EXCEPTION 'new transfer requires initial save evidence' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF a.old_version IS DISTINCT FROM OLD.version OR a.before_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(OLD) THEN
      RAISE EXCEPTION 'transfer key-field before evidence differs from replaced native header' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (SELECT version FROM naijue_erp.transfer_header WHERE id = NEW.id) IS DISTINCT FROM NEW.version THEN
    RAISE EXCEPTION 'one final transfer version per command transaction is required' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_transfer_header_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_transfer_line_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_transfer_line_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  before_line jsonb; after_line jsonb; before_count bigint; after_count bigint;
BEGIN
  -- A no-op UPDATE does not create a changed-line audit entry. Generated current_line_no
  -- is derived only; all actual line fields are included in the single-row comparison.
  IF TG_OP = 'UPDATE' THEN
    IF naijue_erp.transfer_line_audit_values(OLD) IS NOT DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.transfer_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = h.id AND new_version = h.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.action='MIGRATE_DOCUMENT' THEN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary rows only' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR h.status <> 'DRAFT' OR a.action <> 'SAVE'
    OR r.target_type <> 'TRANSFER' OR r.target_id <> h.id OR r.action <> 'SAVE' OR r.actor_account_id <> a.actor_account_id THEN
    RAISE EXCEPTION 'native transfer line mutations require matching draft SAVE operation' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO before_count, before_line
    FROM jsonb_array_elements(COALESCE(a.before_values->'lines', '[]'::jsonb)) AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO after_count, after_line
    FROM jsonb_array_elements(a.after_values->'lines') AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  IF after_count <> 1 OR after_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN
    RAISE EXCEPTION 'changed native transfer line requires exact sparse after evidence' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF before_count <> 0 THEN RAISE EXCEPTION 'inserted transfer line cannot have prior-row evidence' USING ERRCODE = '23514'; END IF;
  ELSE
    IF before_count <> 1 OR before_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(OLD) THEN
      RAISE EXCEPTION 'changed native transfer line requires exact sparse before evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "naijue_erp"."validate_transfer_line_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_unified_baseline_reversal(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_unified_baseline_reversal"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; h jsonb; line jsonb; expected numeric; kind text; owner_id uuid; matches bigint;
BEGIN
 IF NEW.baseline_anchor_operation_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.baseline_anchor_operation_id;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 kind:=CASE WHEN NEW.source_sales_line_id IS NOT NULL THEN 'SALES' ELSE 'TRANSFER' END;
 IF kind='SALES' THEN SELECT sales_id INTO STRICT owner_id FROM naijue_erp.sales_line WHERE id=NEW.source_sales_line_id;
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=owner_id FOR UPDATE;
 ELSE SELECT transfer_id INTO STRICT owner_id FROM naijue_erp.transfer_line WHERE id=NEW.source_transfer_line_id;
  SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=owner_id FOR UPDATE;
 END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO matches,line FROM jsonb_array_elements(a.after_values->'lines') WHERE value->>'id'=coalesce(NEW.source_sales_line_id,NEW.source_transfer_line_id)::text;
 expected:=CASE NEW.endpoint WHEN 'SALES_WAREHOUSE' THEN (line->>'quantity')::numeric WHEN 'FROM' THEN (line->>'quantity')::numeric WHEN 'TO' THEN -(line->>'quantity')::numeric ELSE NULL END;
 IF NEW.event_kind<>'UNAPPROVE' OR NEW.reverses_entry_id IS NOT NULL OR r.action<>'MIGRATE_DOCUMENT' OR r.target_type<>kind OR r.target_id<>owner_id
   OR r.status<>'COMMITTED' OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id OR a.object_type<>r.target_type
   OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.old_version IS NOT NULL OR a.new_version::text IS DISTINCT FROM h->>'version'
   OR h->>'status'<>'APPROVED' OR h->>'stock_basis'<>'CUTOFF_HISTORY' OR a.after_values->'header'->>'status'<>'APPROVED'
   OR (h->>'version')::bigint+1<>NEW.source_document_version OR matches<>1 OR line->>'is_current'<>'true'
   OR line->>'sku_id' IS DISTINCT FROM NEW.sku_id::text OR a.after_values->'header'->>'business_date' IS DISTINCT FROM NEW.business_date::text
   OR NEW.quantity_delta::numeric IS DISTINCT FROM expected
   OR NEW.warehouse_id::text IS DISTINCT FROM (CASE NEW.endpoint WHEN 'SALES_WAREHOUSE' THEN a.after_values->'header'->>'warehouse_id'
       WHEN 'FROM' THEN a.after_values->'header'->>'from_warehouse_id' WHEN 'TO' THEN a.after_values->'header'->>'to_warehouse_id' END)
   OR a.after_values->'baseline'->>'state' IS DISTINCT FROM 'CONFIRMED'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE (source_sales_line_id=NEW.source_sales_line_id OR source_transfer_line_id=NEW.source_transfer_line_id)
       AND event_kind='APPROVE') THEN
  RAISE EXCEPTION 'baseline reversal must match exact first approved ordinary exposure, line, endpoint, quantity and version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "naijue_erp"."validate_unified_baseline_reversal"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_unified_ordinary_operation(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_unified_ordinary_operation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; h jsonb; staff_id uuid; effects bigint; expected bigint;
BEGIN
 IF NEW.target_type NOT IN ('SALES','TRANSFER') THEN RETURN NULL; END IF;
 IF NEW.action='MIGRATE_DOCUMENT' THEN PERFORM naijue_erp.assert_document_migration(NEW.id); RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
 IF NEW.target_type='SALES' THEN SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.sales_header x WHERE id=NEW.target_id;
 ELSE SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.transfer_header x WHERE id=NEW.target_id; END IF;
 SELECT ua.staff_id INTO STRICT staff_id FROM naijue_erp.user_account ua WHERE ua.id=NEW.actor_account_id;
 PERFORM naijue_erp.assert_unified_current_actor(NEW.actor_account_id,NEW.completed_at,NEW.target_type,NEW.target_id,NEW.action);
 IF a.object_type<>NEW.target_type OR a.object_id<>NEW.target_id OR a.action<>NEW.action OR a.actor_account_id<>NEW.actor_account_id
  OR h->>'status' IS DISTINCT FROM (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)
  OR a.occurred_at IS DISTINCT FROM NEW.completed_at OR a.new_version::text IS DISTINCT FROM h->>'version'
  OR NEW.result_data->>'version' IS DISTINCT FROM h->>'version' OR NEW.result_data->>'status' IS DISTINCT FROM h->>'status'
  OR (h->>'updated_at')::timestamptz IS DISTINCT FROM NEW.completed_at
  OR (NEW.action='APPROVE' AND (h->>'approved_by_account_id' IS DISTINCT FROM NEW.actor_account_id::text
    OR h->>'approved_by_staff_id' IS DISTINCT FROM staff_id::text OR (h->>'approved_at')::timestamptz IS DISTINCT FROM NEW.completed_at))
  OR (a.old_version IS NOT NULL AND (a.new_version<>a.old_version+1 OR (NEW.target_type='SALES' AND NEW.action IN ('APPROVE','UNAPPROVE','VOID')
     AND a.before_values->'header'->>'status' IS DISTINCT FROM (CASE NEW.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END))))
  OR (a.old_version IS NULL AND (NEW.action<>'SAVE' OR h->>'version'<>'1' OR h->>'created_by_account_id' IS DISTINCT FROM NEW.actor_account_id::text
    OR h->>'created_by_staff_id' IS DISTINCT FROM staff_id::text OR (h->>'created_at')::timestamptz IS DISTINCT FROM NEW.completed_at))
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=NEW.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=NEW.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'ordinary operation requires real current actor/time, exact final state and same-transaction audit/receipt' USING ERRCODE='23514'; END IF;
 -- Sales approval/unapproval must cover each actual NONZERO line once, including
 -- duplicate SKU occurrences; no stock row is invented for zero quantities.
 IF NEW.target_type='SALES' THEN
  SELECT count(*) INTO expected FROM naijue_erp.sales_line WHERE sales_id=NEW.target_id AND is_current AND quantity<>0;
  SELECT count(*) INTO effects FROM naijue_erp.inventory_ledger WHERE operation_id=NEW.id;
  IF NEW.action IN ('APPROVE','UNAPPROVE') AND (effects<>expected OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE sales_id=NEW.target_id AND is_current AND quantity<>0
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE operation_id=NEW.id AND source_sales_line_id=ln.id AND endpoint='SALES_WAREHOUSE'
      AND quantity_delta::numeric=ln.quantity::numeric*CASE NEW.action WHEN 'APPROVE' THEN -1 ELSE 1 END))) THEN
   RAISE EXCEPTION 'ordinary sales requires exact nonzero source-line effects' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_unified_ordinary_operation"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_unified_sales_header_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_unified_sales_header_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; before_header jsonb; after_header jsonb; field text;
BEGIN
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=NEW.id AND new_version=NEW.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary sales only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 after_header:=naijue_erp.unified_sales_header_audit_values(NEW);
 IF TG_OP='INSERT' THEN before_header:=NULL;
 ELSE before_header:=naijue_erp.unified_sales_header_audit_values(OLD); END IF;
 IF r.target_type<>'SALES' OR r.target_id<>NEW.id OR r.action<>a.action OR r.actor_account_id<>a.actor_account_id
   OR (TG_OP='INSERT' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR a.action<>'SAVE'))
   OR (TG_OP='UPDATE' AND a.old_version IS DISTINCT FROM OLD.version) OR jsonb_typeof(a.after_values->'header') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'sales header requires exact ordinary audit/receipt and predecessor version' USING ERRCODE='23514'; END IF;
 FOR field IN SELECT jsonb_object_keys(after_header) LOOP
  IF field='version' OR before_header IS NULL OR before_header->field IS DISTINCT FROM after_header->field THEN
   IF NOT(a.after_values->'header' ? field) OR (before_header IS NOT NULL AND NOT(a.before_values->'header' ? field)) THEN
    RAISE EXCEPTION 'changed header evidence must include explicit NULL rather than omit field: %',field USING ERRCODE='23514'; END IF;
   -- JSON timestamp spellings differ between JS ISO and PostgreSQL; compare
   -- evidenced instants only for these actual action-time fields.
   IF field IN ('updatedAt','approvedAt') THEN
    IF (a.after_values->'header'->>field)::timestamptz IS DISTINCT FROM (after_header->>field)::timestamptz
      OR (before_header IS NOT NULL AND (a.before_values->'header'->>field)::timestamptz IS DISTINCT FROM (before_header->>field)::timestamptz) THEN
     RAISE EXCEPTION 'sales changed timestamp evidence differs: %',field USING ERRCODE='23514'; END IF;
   ELSIF a.after_values->'header'->field IS DISTINCT FROM after_header->field OR
     (before_header IS NOT NULL AND a.before_values->'header'->field IS DISTINCT FROM before_header->field) THEN
    RAISE EXCEPTION 'sales changed header evidence differs: %',field USING ERRCODE='23514';
   END IF;
  END IF;
 END LOOP;
 IF (SELECT version FROM naijue_erp.sales_header WHERE id=NEW.id) IS DISTINCT FROM NEW.version THEN
  RAISE EXCEPTION 'one final ordinary version per transaction required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_unified_sales_header_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_unified_sales_line_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_unified_sales_line_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 final_row naijue_erp.sales_line%ROWTYPE; before_line jsonb; after_line jsonb; prior_event jsonb; next_event jsonb;
 n_before bigint; n_after bigint; direct_event boolean; release_event boolean; continuation_event boolean; old_same_transaction boolean;
BEGIN
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=NEW.sales_id;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=h.id AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes ordinary lines only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR h.status<>'DRAFT' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>h.id OR r.actor_account_id<>a.actor_account_id THEN
  RAISE EXCEPTION 'ordinary sales line mutation requires draft SAVE' USING ERRCODE='23514'; END IF;
 -- Deferred events retain each physical OLD/NEW tuple, not just the final row.
 -- The ordinary UoW releases occupied positions with a pure true->false UPDATE,
 -- then UPSERTs the final line. Validate the native final row once per event,
 -- while still proving every intermediate event rather than normalizing blindly.
 SELECT * INTO STRICT final_row FROM naijue_erp.sales_line WHERE id=NEW.id AND sales_id=NEW.sales_id;
 next_event:=naijue_erp.unified_sales_line_audit_values(NEW);
 IF TG_OP='UPDATE' THEN prior_event:=naijue_erp.unified_sales_line_audit_values(OLD); END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO n_after,after_line FROM jsonb_array_elements(a.after_values->'lines') WHERE value->>'id'=NEW.id::text;
 SELECT count(*),jsonb_agg(value)->0 INTO n_before,before_line FROM jsonb_array_elements(coalesce(a.before_values->'lines','[]')) WHERE value->>'id'=NEW.id::text;
 -- An actual no-op has no sparse delta, but it must already equal the final
 -- native row. Do not blindly return before reading the final audit: a no-op
 -- rewrite of a previously inactive row must not warm xmin for a forged before.
 IF TG_OP='UPDATE' AND n_before=0 AND n_after=0 AND prior_event IS NOT DISTINCT FROM next_event
    AND next_event IS NOT DISTINCT FROM naijue_erp.unified_sales_line_audit_values(final_row) THEN RETURN NULL; END IF;
 IF n_after<>1 OR after_line IS DISTINCT FROM naijue_erp.unified_sales_line_audit_values(final_row) THEN
  RAISE EXCEPTION 'ordinary sales changed-line final after evidence differs' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF n_before<>0 OR next_event IS DISTINCT FROM after_line THEN
   RAISE EXCEPTION 'ordinary inserted sales line requires exact final evidence and no prior row' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF n_before<>1 OR before_line IS NOT DISTINCT FROM after_line THEN
  RAISE EXCEPTION 'ordinary sales changed-line before evidence missing, duplicate or unchanged' USING ERRCODE='23514'; END IF;
 old_same_transaction:=OLD.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
 direct_event:=prior_event IS NOT DISTINCT FROM before_line AND next_event IS NOT DISTINCT FROM after_line;
 release_event:=prior_event IS NOT DISTINCT FROM before_line AND prior_event->'isCurrent'='true'::jsonb
   AND next_event IS NOT DISTINCT FROM jsonb_set(prior_event,'{isCurrent}','false'::jsonb);
 continuation_event:=old_same_transaction AND before_line->'isCurrent'='true'::jsonb AND prior_event->'isCurrent'='false'::jsonb
   AND prior_event IS NOT DISTINCT FROM jsonb_set(before_line,'{isCurrent}','false'::jsonb)
   AND next_event IS NOT DISTINCT FROM after_line;
 IF (direct_event OR release_event OR continuation_event) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'ordinary sales line event is not an exact direct change or proven position-release transition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_unified_sales_line_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: validate_unified_sales_settlement_commit(); Type: FUNCTION; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE FUNCTION "naijue_erp"."validate_unified_sales_settlement_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 target uuid; row_id uuid; before_row jsonb; after_row jsonb; n_before bigint; n_after bigint;
BEGIN
 IF TG_OP='DELETE' THEN target:=OLD.sales_id; row_id:=OLD.id; ELSE target:=NEW.sales_id; row_id:=NEW.id; END IF;
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
 SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id=target;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='SALES' AND object_id=target AND new_version=h.version;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF r.action='MIGRATE_DOCUMENT' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'migration initializes settlement occurrences only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_document_migration(r.id); RETURN NULL;
 END IF;
 IF h.status<>'DRAFT' OR r.action<>'SAVE' OR r.target_type<>'SALES' OR r.target_id<>target OR r.actor_account_id<>a.actor_account_id
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'settlement mutation requires exact same-transaction ordinary draft SAVE' USING ERRCODE='23514'; END IF;
 SELECT count(*),jsonb_agg(value)->0 INTO n_before,before_row FROM jsonb_array_elements(coalesce(a.before_values->'settlements','[]')) WHERE value->>'id'=row_id::text;
 SELECT count(*),jsonb_agg(value)->0 INTO n_after,after_row FROM jsonb_array_elements(a.after_values->'settlements') WHERE value->>'id'=row_id::text;
 IF (TG_OP='INSERT' AND n_before<>0) OR (TG_OP<>'INSERT' AND (n_before<>1 OR before_row IS DISTINCT FROM naijue_erp.unified_sales_settlement_audit_values(OLD)))
   OR (TG_OP='DELETE' AND n_after<>0) OR (TG_OP<>'DELETE' AND (n_after<>1 OR after_row IS DISTINCT FROM naijue_erp.unified_sales_settlement_audit_values(NEW))) THEN
  RAISE EXCEPTION 'settlement exact before/after occurrence evidence differs' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.sales_id IS DISTINCT FROM OLD.sales_id) THEN
  RAISE EXCEPTION 'settlement canonical identity/owner cannot move' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.payment_account_id=OLD.payment_account_id AND ROW(NEW.account_name_snapshot,NEW.method_name_snapshot,NEW.payment_method_id_snapshot)
    IS DISTINCT FROM ROW(OLD.account_name_snapshot,OLD.method_name_snapshot,OLD.payment_method_id_snapshot) THEN
  RAISE EXCEPTION 'unchanged account retains original known/unknown snapshots' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;


ALTER FUNCTION "naijue_erp"."validate_unified_sales_settlement_commit"() OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: auth_session; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."auth_session" (
    "token_hash" "text" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "auth_version" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "auth_session_auth_version_check" CHECK (("auth_version" > 0)),
    CONSTRAINT "auth_session_check" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "auth_session_token_hash_check" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "naijue_erp"."auth_session" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: barcode_scheme; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."barcode_scheme" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "barcode_type" "text" NOT NULL,
    "rule_description" "text" NOT NULL,
    "code_length" integer,
    "rule_version" "text" NOT NULL,
    "status" "text" NOT NULL,
    CONSTRAINT "barcode_scheme_barcode_type_check" CHECK (("length"("btrim"("barcode_type")) > 0)),
    CONSTRAINT "barcode_scheme_code_length_check" CHECK (("code_length" > 0)),
    CONSTRAINT "barcode_scheme_name_check" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "barcode_scheme_rule_description_check" CHECK (("length"("btrim"("rule_description")) > 0)),
    CONSTRAINT "barcode_scheme_rule_version_check" CHECK (("length"("btrim"("rule_version")) > 0)),
    CONSTRAINT "barcode_scheme_status_check" CHECK (("status" = ANY (ARRAY['CURRENT'::"text", 'HISTORICAL'::"text"])))
);


ALTER TABLE "naijue_erp"."barcode_scheme" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: color; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."color" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "color_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."color" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: customer; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."customer" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "customer_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."customer" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: customer_code_sequence; Type: SEQUENCE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE SEQUENCE "naijue_erp"."customer_code_sequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "naijue_erp"."customer_code_sequence" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: fit; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."fit" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "fit_code_check" CHECK (("code" ~ '^[A-Z356789]$'::"text")),
    CONSTRAINT "fit_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."fit" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: hall; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."hall" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_customer_id" "uuid",
    "default_sales_warehouse_id" "uuid",
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    CONSTRAINT "hall_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."hall" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: import_record; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."import_record" (
    "id" "uuid" NOT NULL,
    "import_batch_id" "uuid" NOT NULL,
    "source_entity_type" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "source_record_hash" "text" NOT NULL,
    "source_file_ref" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "status" "text" NOT NULL,
    "decision_reason" "text",
    "reviewed_at" timestamp with time zone,
    "source_system" "text" NOT NULL,
    CONSTRAINT "import_record_check" CHECK ((("target_type" IS NULL) = ("target_id" IS NULL))),
    CONSTRAINT "import_record_check1" CHECK ((("status" <> 'IMPORTED'::"text") OR (("target_type" IS NOT NULL) AND ("reviewed_at" IS NOT NULL)))),
    CONSTRAINT "import_record_source_entity_type_check" CHECK (("length"("btrim"("source_entity_type")) > 0)),
    CONSTRAINT "import_record_source_file_ref_check" CHECK (("length"("btrim"("source_file_ref")) > 0)),
    CONSTRAINT "import_record_source_key_check" CHECK (("length"("source_key") > 0)),
    CONSTRAINT "import_record_source_record_hash_check" CHECK (("source_record_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "import_record_source_system_check" CHECK (("source_system" ~ '^[a-z][a-z0-9_.:-]*$'::"text")),
    CONSTRAINT "import_record_status_check" CHECK (("status" = ANY (ARRAY['ACCEPTED'::"text", 'QUARANTINED'::"text", 'EXCLUDED'::"text", 'CONFLICT'::"text", 'IMPORTED'::"text"]))),
    CONSTRAINT "import_record_target_type_check" CHECK (("target_type" = ANY (ARRAY['HALL'::"text", 'WAREHOUSE'::"text", 'CUSTOMER'::"text", 'SUPPLIER'::"text", 'STAFF'::"text", 'PRODUCT_CATEGORY'::"text", 'COLOR'::"text", 'FIT'::"text", 'SIZE'::"text", 'SIZE_GROUP'::"text", 'SIZE_GROUP_MEMBER'::"text", 'SEASON'::"text", 'PRODUCT'::"text", 'SKU'::"text", 'BARCODE_SCHEME'::"text", 'SKU_BARCODE'::"text", 'PRODUCT_IMAGE'::"text", 'PAYMENT_METHOD'::"text", 'PAYMENT_ACCOUNT'::"text", 'PAYMENT_ACCOUNT_HALL'::"text", 'INVENTORY_KEY'::"text", 'INVENTORY_LEDGER'::"text", 'IMPORT_BATCH'::"text", 'SALES_HEADER'::"text", 'SALES_LINE'::"text", 'SALES_SETTLEMENT'::"text", 'TRANSFER_HEADER'::"text", 'TRANSFER_LINE'::"text"])))
);


ALTER TABLE "naijue_erp"."import_record" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: inventory_balance; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."inventory_balance" (
    "warehouse_id" "uuid" NOT NULL,
    "sku_id" "uuid" NOT NULL,
    "quantity" bigint NOT NULL,
    "version" integer NOT NULL,
    "last_operation_id" "uuid",
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "inventory_balance_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."inventory_balance" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: inventory_ledger; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."inventory_ledger" (
    "id" "uuid" NOT NULL,
    "operation_id" "uuid" NOT NULL,
    "event_kind" "text" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "sku_id" "uuid" NOT NULL,
    "quantity_delta" bigint NOT NULL,
    "source_sales_line_id" "uuid",
    "endpoint" "text" NOT NULL,
    "source_document_version" integer,
    "reverses_entry_id" "uuid",
    "business_date" "date" NOT NULL,
    "posted_at" timestamp with time zone NOT NULL,
    "source_transfer_line_id" "uuid",
    "source_import_batch_id" "uuid",
    "source_history_revision_id" "uuid",
    "source_history_sales_line_id" "uuid",
    "source_history_transfer_line_id" "uuid",
    "quantity_before" bigint,
    "quantity_after" bigint,
    "baseline_anchor_operation_id" "uuid",
    CONSTRAINT "inventory_ledger_check" CHECK ((("event_kind" = 'UNAPPROVE'::"text") = ("num_nonnulls"("reverses_entry_id", "baseline_anchor_operation_id") = 1))),
    CONSTRAINT "inventory_ledger_quantity_delta_check" CHECK (("quantity_delta" <> 0)),
    CONSTRAINT "inventory_ledger_source_document_version_check" CHECK (("source_document_version" > 0)),
    CONSTRAINT "ledger_closed_source" CHECK (((((((("event_kind" = 'CUTOFF_BASELINE'::"text") AND ("source_import_batch_id" IS NOT NULL) AND ("source_sales_line_id" IS NULL) AND ("source_transfer_line_id" IS NULL) AND ("source_document_version" IS NULL) AND ("endpoint" = 'IMPORT_BASELINE'::"text") AND ("reverses_entry_id" IS NULL)) OR (("event_kind" = ANY (ARRAY['APPROVE'::"text", 'UNAPPROVE'::"text"])) AND ("source_import_batch_id" IS NULL) AND ("source_document_version" IS NOT NULL) AND ((("source_sales_line_id" IS NOT NULL) AND ("source_transfer_line_id" IS NULL) AND ("endpoint" = 'SALES_WAREHOUSE'::"text")) OR (("source_sales_line_id" IS NULL) AND ("source_transfer_line_id" IS NOT NULL) AND ("endpoint" = ANY (ARRAY['FROM'::"text", 'TO'::"text"])))))) IS TRUE) AND ("source_history_revision_id" IS NULL) AND ("source_history_sales_line_id" IS NULL) AND ("source_history_transfer_line_id" IS NULL)) OR (("event_kind" = 'HISTORY_REVISION'::"text") AND ("source_history_revision_id" IS NOT NULL) AND ("source_import_batch_id" IS NULL) AND ("source_sales_line_id" IS NULL) AND ("source_transfer_line_id" IS NULL) AND ("reverses_entry_id" IS NULL) AND ("source_document_version" > 1) AND ((("source_history_sales_line_id" IS NOT NULL) AND ("source_history_transfer_line_id" IS NULL) AND ("endpoint" = 'SALES_WAREHOUSE'::"text")) OR (("source_history_sales_line_id" IS NULL) AND ("source_history_transfer_line_id" IS NOT NULL) AND ("endpoint" = ANY (ARRAY['FROM'::"text", 'TO'::"text"])))))) IS TRUE)),
    CONSTRAINT "ledger_event_kind" CHECK (((("event_kind" = ANY (ARRAY['APPROVE'::"text", 'UNAPPROVE'::"text", 'CUTOFF_BASELINE'::"text"])) OR ("event_kind" = 'HISTORY_REVISION'::"text")) IS TRUE)),
    CONSTRAINT "ledger_recorded_balance_pair" CHECK ((((("quantity_before" IS NULL) AND ("quantity_after" IS NULL)) OR (("quantity_before" IS NOT NULL) AND ("quantity_after" IS NOT NULL) AND ("event_kind" = ANY (ARRAY['APPROVE'::"text", 'UNAPPROVE'::"text"])) AND ("quantity_delta" <> 0) AND ("source_import_batch_id" IS NULL) AND ("source_history_revision_id" IS NULL) AND ("source_history_sales_line_id" IS NULL) AND ("source_history_transfer_line_id" IS NULL) AND ("source_document_version" IS NOT NULL) AND ((("source_sales_line_id" IS NOT NULL) AND ("source_transfer_line_id" IS NULL) AND ("endpoint" = 'SALES_WAREHOUSE'::"text")) OR (("source_sales_line_id" IS NULL) AND ("source_transfer_line_id" IS NOT NULL) AND ("endpoint" = ANY (ARRAY['FROM'::"text", 'TO'::"text"])))) AND (("event_kind" = 'UNAPPROVE'::"text") = ("num_nonnulls"("reverses_entry_id", "baseline_anchor_operation_id") = 1)) AND ((("quantity_after")::numeric - ("quantity_before")::numeric) = ("quantity_delta")::numeric))) IS TRUE)),
    CONSTRAINT "ledger_reversal_evidence_xor" CHECK ((((("event_kind" = 'UNAPPROVE'::"text") AND ("num_nonnulls"("reverses_entry_id", "baseline_anchor_operation_id") = 1)) OR (("event_kind" <> 'UNAPPROVE'::"text") AND ("reverses_entry_id" IS NULL) AND ("baseline_anchor_operation_id" IS NULL))) IS TRUE))
);


ALTER TABLE "naijue_erp"."inventory_ledger" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: operation_receipt; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."operation_receipt" (
    "id" "uuid" NOT NULL,
    "actor_account_id" "uuid" NOT NULL,
    "request_key" "text" NOT NULL,
    "request_hash" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "result_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    "completed_at" timestamp with time zone NOT NULL,
    "target_sales_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'SALES'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_transfer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'TRANSFER'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_customer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'CUSTOMER'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_supplier_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'SUPPLIER'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_product_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'PRODUCT'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_category_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'CATEGORY'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_color_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'COLOR'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_fit_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'FIT'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_hall_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'HALL'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_warehouse_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'WAREHOUSE'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_staff_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'STAFF'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_account_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'ACCOUNT'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_payment_method_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'PAYMENT_METHOD'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_payment_account_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'PAYMENT_ACCOUNT'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_history_sales_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'HISTORY_SALES'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    "target_history_transfer_id" "uuid" GENERATED ALWAYS AS (
CASE
    WHEN ("target_type" = 'HISTORY_TRANSFER'::"text") THEN "target_id"
    ELSE NULL::"uuid"
END) STORED,
    CONSTRAINT "migration_result_metadata" CHECK ((("action" <> 'MIGRATE_DOCUMENT'::"text") OR ((("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) AND ("result_data" ?& ARRAY['batchId'::"text", 'sourceRecordId'::"text", 'exposureDigest'::"text", 'baseline'::"text"]) AND (("result_data" -> 'ledgerEntryIds'::"text") = '[]'::"jsonb") AND (("result_data" ->> 'exposureDigest'::"text") ~ '^[0-9a-f]{64}$'::"text") AND ("jsonb_typeof"(("result_data" -> 'baseline'::"text")) = 'object'::"text")) IS TRUE))),
    CONSTRAINT "operation_receipt_request_hash_check" CHECK (("request_hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "operation_receipt_request_key_check" CHECK (("length"("request_key") > 0)),
    CONSTRAINT "operation_receipt_status_check" CHECK (("status" = 'COMMITTED'::"text")),
    CONSTRAINT "receipt_action_by_kind" CHECK ((((((((
CASE
    WHEN ("target_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"])) THEN ("action" = 'HISTORY_REVISE'::"text")
    ELSE (((
    CASE
        WHEN ("target_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[])) THEN "naijue_erp"."maintenance_action_allowed"("target_type", "action")
        ELSE ((("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) AND ("action" = ANY (ARRAY['SAVE'::"text", 'APPROVE'::"text", 'UNAPPROVE'::"text", 'VOID'::"text"]))) OR (("target_type" = ANY (ARRAY['CUSTOMER'::"text", 'SUPPLIER'::"text"])) AND ("action" = ANY (ARRAY['CREATE'::"text", 'EDIT'::"text", 'DISABLE'::"text", 'RESTORE'::"text"]))) OR (("target_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_STAGE'::"text", 'IMPORT_CHUNK'::"text", 'IMPORT_PUBLISH'::"text"]))))
    END IS TRUE) OR (("target_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_CORE_STAGE'::"text", 'IMPORT_BIND_FULL_SOURCE'::"text"])))) IS TRUE)
END IS TRUE) OR (("target_type" = 'IMPORT'::"text") AND ("action" = 'IMPORT_INITIALIZE_BARCODE_SCHEMES'::"text"))) IS TRUE) OR (("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) AND ("action" = 'MIGRATE_DOCUMENT'::"text"))) IS TRUE) OR (("target_type" = 'IMPORT'::"text") AND ("action" = 'IMPORT_INITIALIZE_CURRENT_ADMIN'::"text"))) IS TRUE)),
    CONSTRAINT "receipt_result_by_kind" CHECK ((
CASE
    WHEN (("target_type" = 'IMPORT'::"text") AND (("result_data" ->> 'profile'::"text") = 'STANDARD_IMPORT_SQL_V1'::"text")) THEN (("action" = ANY (ARRAY['IMPORT_INITIALIZE_CURRENT_ADMIN'::"text", 'IMPORT_STAGE'::"text", 'IMPORT_CHUNK'::"text", 'IMPORT_PUBLISH'::"text"])) AND ("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['profile'::"text", 'operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'sourceRecordIds'::"text", 'phase'::"text", 'planSha256'::"text", 'packageManifestSha256'::"text", 'baselineBatchId'::"text", 'documentBatchId'::"text"]) AND (("result_data" - ARRAY['profile'::"text", 'operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'sourceRecordIds'::"text", 'phase'::"text", 'planSha256'::"text", 'packageManifestSha256'::"text", 'baselineBatchId'::"text", 'documentBatchId'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['STAGED'::"text", 'VALIDATING'::"text", 'IMPORTED'::"text"])) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND ("jsonb_typeof"(("result_data" -> 'sourceRecordIds'::"text")) = 'array'::"text") AND (("result_data" ->> 'phase'::"text") = ANY (ARRAY['INITIALIZE'::"text", 'MASTER'::"text", 'KEYS'::"text", 'BASELINE_SEAL'::"text", 'DOCUMENT_STAGE'::"text", 'DOCUMENTS'::"text", 'DOCUMENT_PUBLISH'::"text"])) AND (("result_data" ->> 'planSha256'::"text") ~ '^[0-9a-f]{64}$'::"text") AND (("result_data" ->> 'packageManifestSha256'::"text") ~ '^[0-9a-f]{64}$'::"text"))
    ELSE (
    CASE
        WHEN ("target_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"])) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'dataset'::"text", 'kind'::"text", 'documentId'::"text", 'revisionId'::"text", 'version'::"text", 'ledgerEntryIds'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'dataset'::"text", 'kind'::"text", 'documentId'::"text", 'revisionId'::"text", 'version'::"text", 'ledgerEntryIds'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'dataset'::"text") = 'HISTORY'::"text") AND (("result_data" ->> 'kind'::"text") =
        CASE "target_type"
            WHEN 'HISTORY_SALES'::"text" THEN 'sales'::"text"
            ELSE 'transfers'::"text"
        END) AND (("result_data" ->> 'documentId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'revisionId'::"text")) = 'string'::"text") AND (("result_data" ->> 'revisionId'::"text") ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND (((("result_data" ->> 'version'::"text"))::numeric >= (2)::numeric) AND ((("result_data" ->> 'version'::"text"))::numeric <= (2147483647)::numeric)) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text"))
        ELSE (
        CASE
            WHEN (("target_type" = 'CATEGORY'::"text") AND ("action" = ANY (ARRAY['REORDER'::"text", 'UNDO_REORDER'::"text"]))) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text", 'order'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text", 'order'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'kind'::"text") = 'CATEGORY'::"text") AND ("jsonb_typeof"(("result_data" -> 'targetId'::"text")) = 'string'::"text") AND (("result_data" ->> 'targetId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'order'::"text")) = 'object'::"text") AND (("result_data" -> 'order'::"text") ?& ARRAY['parentId'::"text", 'undoOfOperationId'::"text", 'members'::"text"]) AND ((("result_data" -> 'order'::"text") - ARRAY['parentId'::"text", 'undoOfOperationId'::"text", 'members'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"((("result_data" -> 'order'::"text") -> 'members'::"text")) = 'array'::"text"))
            ELSE (
            CASE
                WHEN (("target_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_CORE_STAGE'::"text", 'IMPORT_BIND_FULL_SOURCE'::"text"]))) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'phase'::"text", 'coreSourceDigest'::"text", 'coreCounts'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'phase'::"text", 'coreSourceDigest'::"text", 'coreCounts'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'sequence'::"text")) = 'number'::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'cursor'::"text")) = 'number'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'status'::"text") = 'STAGED'::"text") AND (("result_data" -> 'ledgerEntryIds'::"text") = '[]'::"jsonb") AND (("result_data" ->> 'phase'::"text") =
                CASE "action"
                    WHEN 'IMPORT_CORE_STAGE'::"text" THEN 'CORE_INITIALIZED_V1'::"text"
                    ELSE 'FULL_SOURCE_BOUND_V1'::"text"
                END) AND (("result_data" ->> 'coreSourceDigest'::"text") ~ '^[a-f0-9]{64}$'::"text") AND (("result_data" -> 'coreCounts'::"text") = '{"HALL": 22, "STAFF": 49, "CUSTOMER": 22, "WAREHOUSE": 22, "USER_ACCOUNT": 49}'::"jsonb"))
                ELSE (
                CASE
                    WHEN ("target_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[])) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND ("jsonb_typeof"(("result_data" -> 'kind'::"text")) = 'string'::"text") AND (("result_data" ->> 'kind'::"text") = "target_type") AND ("jsonb_typeof"(("result_data" -> 'targetId'::"text")) = 'string'::"text") AND (("result_data" ->> 'targetId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text"))
                    ELSE (
                    CASE
                        WHEN ("target_type" = 'IMPORT'::"text") THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND (("result_data" - ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) = '{}'::"jsonb") AND ("result_data" ?& ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['STAGED'::"text", 'VALIDATING'::"text", 'IMPORTED'::"text"])))
                        ELSE ((("jsonb_typeof"("result_data") = 'object'::"text") AND
                        CASE
                            WHEN ("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) THEN (("result_data" ?& ARRAY['operationId'::"text", 'version'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'operationId'::"text") IS DISTINCT FROM ("id")::"text")) AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'status'::"text")) = 'string'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'VOID'::"text"])) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND
                            CASE "target_type"
                                WHEN 'SALES'::"text" THEN (("result_data" ? 'salesId'::"text") AND (NOT ("result_data" ? 'transferId'::"text")) AND ("jsonb_typeof"(("result_data" -> 'salesId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'salesId'::"text") IS DISTINCT FROM ("target_id")::"text")))
                                WHEN 'TRANSFER'::"text" THEN (("result_data" ? 'transferId'::"text") AND (NOT ("result_data" ? 'salesId'::"text")) AND ("jsonb_typeof"(("result_data" -> 'transferId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'transferId'::"text") IS DISTINCT FROM ("target_id")::"text")))
                                ELSE false
                            END)
                            ELSE (("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'partyId'::"text", 'version'::"text", 'code'::"text", 'enabled'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'partyId'::"text", 'version'::"text", 'code'::"text", 'enabled'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND ("jsonb_typeof"(("result_data" -> 'kind'::"text")) = 'string'::"text") AND (("result_data" ->> 'kind'::"text") = "target_type") AND ("jsonb_typeof"(("result_data" -> 'partyId'::"text")) = 'string'::"text") AND (("result_data" ->> 'partyId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'code'::"text")) = 'string'::"text") AND ("length"("btrim"(("result_data" ->> 'code'::"text"))) > 0) AND ("jsonb_typeof"(("result_data" -> 'enabled'::"text")) = 'boolean'::"text"))
                        END) IS TRUE)
                    END IS TRUE)
                END IS TRUE)
            END IS TRUE)
        END IS TRUE)
    END IS TRUE)
END IS TRUE)),
    CONSTRAINT "receipt_target_kind" CHECK (((((("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text", 'CUSTOMER'::"text", 'SUPPLIER'::"text", 'IMPORT'::"text"])) OR ("target_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[]))) IS TRUE) OR ("target_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"]))) IS TRUE))
);


ALTER TABLE "naijue_erp"."operation_receipt" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: payment_account; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."payment_account" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "payment_method_id" "uuid" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    CONSTRAINT "payment_account_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."payment_account" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: payment_account_hall; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."payment_account_hall" (
    "payment_account_id" "uuid" NOT NULL,
    "hall_id" "uuid" NOT NULL
);


ALTER TABLE "naijue_erp"."payment_account_hall" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: payment_method; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."payment_method" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    CONSTRAINT "payment_method_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."payment_method" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: product; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."product" (
    "id" "uuid" NOT NULL,
    "product_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "season_id" "uuid",
    "size_group_id" "uuid" NOT NULL,
    "retail_price" numeric(18,2),
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "year" integer,
    "system_item_code" "text",
    "thickness" "text",
    "collar_pants_type" "text",
    "purchase_price" numeric(18,2),
    "wholesale5_price" numeric(18,2),
    "wholesale6_price" numeric(18,2),
    "wholesale7_price" numeric(18,2),
    "wholesale8_price" numeric(18,2),
    "wholesale9_price" numeric(18,2),
    "wholesale10_price" numeric(18,2),
    "minimum_price" numeric(18,2),
    "deleted_at" timestamp with time zone,
    "default_barcode_scheme_id" "uuid",
    "season_ids" "uuid"[],
    CONSTRAINT "product_minimum_price_check" CHECK (("minimum_price" >= (0)::numeric)),
    CONSTRAINT "product_purchase_price_check" CHECK (("purchase_price" >= (0)::numeric)),
    CONSTRAINT "product_retail_price_check" CHECK (("retail_price" >= (0)::numeric)),
    CONSTRAINT "product_season_ids_shape" CHECK (("naijue_erp"."valid_product_season_ids"("season_ids") IS TRUE)),
    CONSTRAINT "product_version_check" CHECK (("version" > 0)),
    CONSTRAINT "product_wholesale10_price_check" CHECK (("wholesale10_price" >= (0)::numeric)),
    CONSTRAINT "product_wholesale5_price_check" CHECK (("wholesale5_price" >= (0)::numeric)),
    CONSTRAINT "product_wholesale6_price_check" CHECK (("wholesale6_price" >= (0)::numeric)),
    CONSTRAINT "product_wholesale7_price_check" CHECK (("wholesale7_price" >= (0)::numeric)),
    CONSTRAINT "product_wholesale8_price_check" CHECK (("wholesale8_price" >= (0)::numeric)),
    CONSTRAINT "product_wholesale9_price_check" CHECK (("wholesale9_price" >= (0)::numeric))
);


ALTER TABLE "naijue_erp"."product" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "product"."purchase_price"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."product"."purchase_price" IS 'RMB yuan, exact <=2 input decimals; explicitly confirmed unset is NULL, not an unknown-input default.';


--
-- Name: COLUMN "product"."minimum_price"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."product"."minimum_price" IS 'Product-uniform minimum; NULL means confirmed unset only after validated nine-price input completeness. Missing facts must fail closed.';


--
-- Name: product_category; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."product_category" (
    "id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "display_order" integer NOT NULL,
    "version" integer NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "product_category_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."product_category" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: product_image; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."product_image" (
    "id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "file_ref" "text" NOT NULL,
    "mime" "text" NOT NULL,
    "byte_size" bigint NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "created_by_account_id" "uuid",
    "version" integer NOT NULL,
    "image_role" "text",
    "color_id" "uuid",
    CONSTRAINT "product_image_byte_size_check" CHECK ((("byte_size" > 0) AND ("byte_size" <= 8388608))),
    CONSTRAINT "product_image_closed_role" CHECK ((("image_role" IS NULL) OR ("image_role" = ANY (ARRAY['MAIN'::"text", 'WHITE_BACKGROUND'::"text", 'HANG_TAG'::"text", 'DETAIL'::"text", 'COLOR'::"text"])))),
    CONSTRAINT "product_image_file_ref_check" CHECK (("length"("file_ref") > 0)),
    CONSTRAINT "product_image_mime_check" CHECK (("mime" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "product_image_role_color" CHECK (((("image_role" = 'COLOR'::"text") AND ("color_id" IS NOT NULL)) OR (("image_role" IS DISTINCT FROM 'COLOR'::"text") AND ("color_id" IS NULL)))),
    CONSTRAINT "product_image_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."product_image" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: runtime_document_number_allocation; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."runtime_document_number_allocation" (
    "document_kind" "text" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "actor_account_id" "uuid" NOT NULL,
    "allocated_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL,
    CONSTRAINT "runtime_document_number_allocation_document_kind_check" CHECK (("document_kind" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])))
);


ALTER TABLE "naijue_erp"."runtime_document_number_allocation" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: runtime_sales_document_number_seq; Type: SEQUENCE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE SEQUENCE "naijue_erp"."runtime_sales_document_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "naijue_erp"."runtime_sales_document_number_seq" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: runtime_transfer_document_number_seq; Type: SEQUENCE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE SEQUENCE "naijue_erp"."runtime_transfer_document_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "naijue_erp"."runtime_transfer_document_number_seq" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: schema_migration; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."schema_migration" (
    "version" integer NOT NULL,
    "description" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "transaction_timestamp"() NOT NULL
);


ALTER TABLE "naijue_erp"."schema_migration" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: season; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."season" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "display_order" integer NOT NULL
);


ALTER TABLE "naijue_erp"."season" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: size; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."size" (
    "id" "uuid" NOT NULL,
    "code" "text",
    "name" "text" NOT NULL
);


ALTER TABLE "naijue_erp"."size" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: size_group; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."size_group" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "naijue_erp"."size_group" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: size_group_member; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."size_group_member" (
    "size_group_id" "uuid" NOT NULL,
    "size_id" "uuid" NOT NULL,
    "display_order" integer NOT NULL
);


ALTER TABLE "naijue_erp"."size_group_member" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: sku; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."sku" (
    "id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "color_id" "uuid" NOT NULL,
    "fit_id" "uuid" NOT NULL,
    "size_id" "uuid" NOT NULL,
    "sku_code" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "created_operation_id" "uuid",
    CONSTRAINT "sku_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."sku" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: sku_barcode; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."sku_barcode" (
    "id" "uuid" NOT NULL,
    "barcode" "text" NOT NULL COLLATE "pg_catalog"."C",
    "sku_id" "uuid" NOT NULL,
    "barcode_kind" "text" NOT NULL,
    "scheme_id" "uuid",
    "enabled" boolean NOT NULL,
    CONSTRAINT "sku_barcode_barcode_check" CHECK (("length"("barcode") > 0)),
    CONSTRAINT "sku_barcode_barcode_kind_check" CHECK (("barcode_kind" = ANY (ARRAY['MAIN'::"text", 'CONFIRMED_OLD'::"text"])))
);


ALTER TABLE "naijue_erp"."sku_barcode" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "sku_barcode"."barcode"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."sku_barcode"."barcode" IS 'Exact original raw text, including leading zeroes. Never regenerated, trimmed, numeric-converted or rebound across SKUs.';


--
-- Name: staff; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."staff" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "hall_id" "uuid",
    "role" "text" NOT NULL,
    "contact" "text",
    "employment_status" "text" NOT NULL,
    "version" integer NOT NULL,
    "departure_date" "date",
    CONSTRAINT "staff_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."staff" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: COLUMN "staff"."departure_date"; Type: COMMENT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

COMMENT ON COLUMN "naijue_erp"."staff"."departure_date" IS 'Source departure calendar date; NULL means unknown. Not an audit timestamp.';


--
-- Name: supplier; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."supplier" (
    "id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    CONSTRAINT "supplier_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."supplier" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: supplier_code_sequence; Type: SEQUENCE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE SEQUENCE "naijue_erp"."supplier_code_sequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "naijue_erp"."supplier_code_sequence" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: user_account; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."user_account" (
    "id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "login_name" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "login_enabled" boolean NOT NULL,
    "auth_version" integer NOT NULL,
    "version" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "user_account_auth_version_check" CHECK (("auth_version" > 0)),
    CONSTRAINT "user_account_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."user_account" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: warehouse; Type: TABLE; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TABLE "naijue_erp"."warehouse" (
    "id" "uuid" NOT NULL,
    "hall_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean NOT NULL,
    "version" integer NOT NULL,
    "created_operation_id" "uuid",
    CONSTRAINT "warehouse_version_check" CHECK (("version" > 0))
);


ALTER TABLE "naijue_erp"."warehouse" OWNER TO "fresh35_owner_20261105_r1";

--
-- Name: audit_change audit_change_operation_id_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_operation_id_key" UNIQUE ("operation_id");


--
-- Name: audit_change audit_change_operation_id_object_id_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_operation_id_object_id_key" UNIQUE ("operation_id", "object_id");


--
-- Name: audit_change audit_change_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_pkey" PRIMARY KEY ("id");


--
-- Name: audit_change audit_kind_identity; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_kind_identity" UNIQUE ("operation_id", "object_type", "object_id");


--
-- Name: auth_session auth_session_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."auth_session"
    ADD CONSTRAINT "auth_session_pkey" PRIMARY KEY ("token_hash");


--
-- Name: barcode_scheme barcode_scheme_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."barcode_scheme"
    ADD CONSTRAINT "barcode_scheme_pkey" PRIMARY KEY ("id");


--
-- Name: color color_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."color"
    ADD CONSTRAINT "color_code_key" UNIQUE ("code");


--
-- Name: color color_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."color"
    ADD CONSTRAINT "color_pkey" PRIMARY KEY ("id");


--
-- Name: customer customer_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."customer"
    ADD CONSTRAINT "customer_code_key" UNIQUE ("code");


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."customer"
    ADD CONSTRAINT "customer_pkey" PRIMARY KEY ("id");


--
-- Name: fit fit_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."fit"
    ADD CONSTRAINT "fit_code_key" UNIQUE ("code");


--
-- Name: fit fit_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."fit"
    ADD CONSTRAINT "fit_pkey" PRIMARY KEY ("id");


--
-- Name: hall hall_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."hall"
    ADD CONSTRAINT "hall_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_ledger history_sales_operation_endpoint; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "history_sales_operation_endpoint" UNIQUE ("operation_id", "source_history_sales_line_id", "endpoint");


--
-- Name: inventory_ledger history_transfer_operation_endpoint; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "history_transfer_operation_endpoint" UNIQUE ("operation_id", "source_history_transfer_line_id", "endpoint");


--
-- Name: import_batch import_batch_namespace_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_batch"
    ADD CONSTRAINT "import_batch_namespace_key" UNIQUE ("id", "source_name");


--
-- Name: import_batch import_batch_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_batch"
    ADD CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id");


--
-- Name: import_record import_record_accounting_identity; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_record"
    ADD CONSTRAINT "import_record_accounting_identity" UNIQUE ("import_batch_id", "id", "target_type", "target_id");


--
-- Name: import_record import_record_import_batch_id_source_entity_type_source_key_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_record"
    ADD CONSTRAINT "import_record_import_batch_id_source_entity_type_source_key_key" UNIQUE ("import_batch_id", "source_entity_type", "source_key");


--
-- Name: import_record import_record_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_record"
    ADD CONSTRAINT "import_record_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_balance inventory_balance_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_balance"
    ADD CONSTRAINT "inventory_balance_pkey" PRIMARY KEY ("warehouse_id", "sku_id");


--
-- Name: inventory_ledger inventory_ledger_operation_id_source_sales_line_id_endpoint_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_operation_id_source_sales_line_id_endpoint_key" UNIQUE ("operation_id", "source_sales_line_id", "endpoint");


--
-- Name: inventory_ledger inventory_ledger_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_ledger inventory_ledger_reverses_entry_id_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_reverses_entry_id_key" UNIQUE ("reverses_entry_id");


--
-- Name: inventory_ledger ledger_transfer_operation_endpoint; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "ledger_transfer_operation_endpoint" UNIQUE ("operation_id", "source_transfer_line_id", "endpoint");


--
-- Name: operation_receipt operation_receipt_actor_account_id_request_key_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_actor_account_id_request_key_key" UNIQUE ("actor_account_id", "request_key");


--
-- Name: operation_receipt operation_receipt_id_actor_account_id_target_id_action_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_id_actor_account_id_target_id_action_key" UNIQUE ("id", "actor_account_id", "target_id", "action");


--
-- Name: operation_receipt operation_receipt_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_pkey" PRIMARY KEY ("id");


--
-- Name: payment_account_hall payment_account_hall_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_account_hall"
    ADD CONSTRAINT "payment_account_hall_pkey" PRIMARY KEY ("payment_account_id", "hall_id");


--
-- Name: payment_account payment_account_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_account"
    ADD CONSTRAINT "payment_account_pkey" PRIMARY KEY ("id");


--
-- Name: payment_method payment_method_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_method"
    ADD CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id");


--
-- Name: product_category product_category_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_category"
    ADD CONSTRAINT "product_category_pkey" PRIMARY KEY ("id");


--
-- Name: product_image product_image_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_image"
    ADD CONSTRAINT "product_image_pkey" PRIMARY KEY ("id");


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_pkey" PRIMARY KEY ("id");


--
-- Name: product product_product_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_product_code_key" UNIQUE ("product_code");


--
-- Name: operation_receipt receipt_kind_identity; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "receipt_kind_identity" UNIQUE ("id", "actor_account_id", "target_type", "target_id", "action");


--
-- Name: runtime_document_number_allocation runtime_document_number_allocation_number_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."runtime_document_number_allocation"
    ADD CONSTRAINT "runtime_document_number_allocation_number_key" UNIQUE ("number");


--
-- Name: runtime_document_number_allocation runtime_document_number_allocation_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."runtime_document_number_allocation"
    ADD CONSTRAINT "runtime_document_number_allocation_pkey" PRIMARY KEY ("document_kind", "document_id");


--
-- Name: sales_header sales_header_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_pkey" PRIMARY KEY ("id");


--
-- Name: sales_line sales_line_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_line"
    ADD CONSTRAINT "sales_line_pkey" PRIMARY KEY ("id");


--
-- Name: sales_settlement sales_settlement_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_settlement"
    ADD CONSTRAINT "sales_settlement_pkey" PRIMARY KEY ("id");


--
-- Name: sales_settlement sales_settlement_sales_id_line_no_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_settlement"
    ADD CONSTRAINT "sales_settlement_sales_id_line_no_key" UNIQUE ("sales_id", "line_no") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: schema_migration schema_migration_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."schema_migration"
    ADD CONSTRAINT "schema_migration_pkey" PRIMARY KEY ("version");


--
-- Name: season season_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."season"
    ADD CONSTRAINT "season_code_key" UNIQUE ("code");


--
-- Name: season season_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."season"
    ADD CONSTRAINT "season_pkey" PRIMARY KEY ("id");


--
-- Name: size_group size_group_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size_group"
    ADD CONSTRAINT "size_group_code_key" UNIQUE ("code");


--
-- Name: size_group_member size_group_member_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size_group_member"
    ADD CONSTRAINT "size_group_member_pkey" PRIMARY KEY ("size_group_id", "size_id");


--
-- Name: size_group size_group_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size_group"
    ADD CONSTRAINT "size_group_pkey" PRIMARY KEY ("id");


--
-- Name: size size_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size"
    ADD CONSTRAINT "size_pkey" PRIMARY KEY ("id");


--
-- Name: sku_barcode sku_barcode_barcode_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku_barcode"
    ADD CONSTRAINT "sku_barcode_barcode_key" UNIQUE ("barcode");


--
-- Name: sku_barcode sku_barcode_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku_barcode"
    ADD CONSTRAINT "sku_barcode_pkey" PRIMARY KEY ("id");


--
-- Name: sku sku_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_pkey" PRIMARY KEY ("id");


--
-- Name: sku sku_product_id_color_id_fit_id_size_id_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_product_id_color_id_fit_id_size_id_key" UNIQUE ("product_id", "color_id", "fit_id", "size_id");


--
-- Name: sku sku_sku_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_sku_code_key" UNIQUE ("sku_code");


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");


--
-- Name: supplier supplier_code_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."supplier"
    ADD CONSTRAINT "supplier_code_key" UNIQUE ("code");


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."supplier"
    ADD CONSTRAINT "supplier_pkey" PRIMARY KEY ("id");


--
-- Name: transfer_header transfer_header_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_pkey" PRIMARY KEY ("id");


--
-- Name: transfer_line transfer_line_current_position; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_line"
    ADD CONSTRAINT "transfer_line_current_position" UNIQUE ("transfer_id", "current_line_no") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: transfer_line transfer_line_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_line"
    ADD CONSTRAINT "transfer_line_pkey" PRIMARY KEY ("id");


--
-- Name: user_account user_account_login_name_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."user_account"
    ADD CONSTRAINT "user_account_login_name_key" UNIQUE ("login_name");


--
-- Name: user_account user_account_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."user_account"
    ADD CONSTRAINT "user_account_pkey" PRIMARY KEY ("id");


--
-- Name: user_account user_account_staff_id_key; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."user_account"
    ADD CONSTRAINT "user_account_staff_id_key" UNIQUE ("staff_id");


--
-- Name: warehouse warehouse_pkey; Type: CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."warehouse"
    ADD CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id");


--
-- Name: audit_account_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_account_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'ACCOUNT'::"text");


--
-- Name: audit_category_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_category_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'CATEGORY'::"text");


--
-- Name: audit_color_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_color_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'COLOR'::"text");


--
-- Name: audit_customer_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_customer_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'CUSTOMER'::"text");


--
-- Name: audit_fit_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_fit_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'FIT'::"text");


--
-- Name: audit_hall_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_hall_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'HALL'::"text");


--
-- Name: audit_import_checkpoint_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_import_checkpoint_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'IMPORT'::"text");


--
-- Name: audit_payment_account_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_payment_account_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'PAYMENT_ACCOUNT'::"text");


--
-- Name: audit_payment_method_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_payment_method_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'PAYMENT_METHOD'::"text");


--
-- Name: audit_product_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_product_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'PRODUCT'::"text");


--
-- Name: audit_sales_document_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_sales_document_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'SALES'::"text");


--
-- Name: audit_staff_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_staff_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'STAFF'::"text");


--
-- Name: audit_supplier_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_supplier_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'SUPPLIER'::"text");


--
-- Name: audit_transfer_document_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_transfer_document_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'TRANSFER'::"text");


--
-- Name: audit_warehouse_root_version; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "audit_warehouse_root_version" ON "naijue_erp"."audit_change" USING "btree" ("object_id", "new_version") WHERE ("object_type" = 'WAREHOUSE'::"text");


--
-- Name: auth_session_account; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "auth_session_account" ON "naijue_erp"."auth_session" USING "btree" ("account_id");


--
-- Name: auth_session_expiry; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "auth_session_expiry" ON "naijue_erp"."auth_session" USING "btree" ("expires_at");


--
-- Name: baseline_sales_reversal_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "baseline_sales_reversal_once" ON "naijue_erp"."inventory_ledger" USING "btree" ("baseline_anchor_operation_id", "source_sales_line_id", "endpoint") WHERE (("baseline_anchor_operation_id" IS NOT NULL) AND ("source_sales_line_id" IS NOT NULL));


--
-- Name: baseline_transfer_reversal_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "baseline_transfer_reversal_once" ON "naijue_erp"."inventory_ledger" USING "btree" ("baseline_anchor_operation_id", "source_transfer_line_id", "endpoint") WHERE (("baseline_anchor_operation_id" IS NOT NULL) AND ("source_transfer_line_id" IS NOT NULL));


--
-- Name: customer_name_order; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "customer_name_order" ON "naijue_erp"."customer" USING "btree" ("name" COLLATE "C", "id");


--
-- Name: document_migration_anchor_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "document_migration_anchor_once" ON "naijue_erp"."operation_receipt" USING "btree" ("target_type", "target_id") WHERE ("action" = 'MIGRATE_DOCUMENT'::"text");


--
-- Name: hall_enabled_default_customer; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "hall_enabled_default_customer" ON "naijue_erp"."hall" USING "btree" ("default_customer_id") WHERE "enabled";


--
-- Name: import_baseline_key_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "import_baseline_key_once" ON "naijue_erp"."inventory_ledger" USING "btree" ("source_import_batch_id", "warehouse_id", "sku_id") WHERE ("event_kind" = 'CUTOFF_BASELINE'::"text");


--
-- Name: import_batch_namespace_binding_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "import_batch_namespace_binding_once" ON "naijue_erp"."import_record" USING "btree" ("target_id") WHERE (("source_entity_type" = 'BATCH_NAMESPACE_BINDING'::"text") AND ("status" = 'IMPORTED'::"text"));


--
-- Name: import_document_target_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "import_document_target_once" ON "naijue_erp"."import_record" USING "btree" ("target_type", "target_id") WHERE (("status" = ANY (ARRAY['ACCEPTED'::"text", 'IMPORTED'::"text"])) AND ("target_type" = ANY (ARRAY['SALES_HEADER'::"text", 'SALES_LINE'::"text", 'SALES_SETTLEMENT'::"text", 'TRANSFER_HEADER'::"text", 'TRANSFER_LINE'::"text"])));


--
-- Name: import_global_source_identity; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "import_global_source_identity" ON "naijue_erp"."import_record" USING "btree" ("source_system", "source_entity_type", "source_key") WHERE (("target_id" IS NOT NULL) AND ("status" = ANY (ARRAY['ACCEPTED'::"text", 'IMPORTED'::"text"])));


--
-- Name: import_one_published_cutoff; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "import_one_published_cutoff" ON "naijue_erp"."import_batch" USING "btree" ("inventory_mode") WHERE (("status" = 'IMPORTED'::"text") AND ("inventory_mode" = 'CUTOFF_STOCK_BASELINE'::"text"));


--
-- Name: import_record_source_identity; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "import_record_source_identity" ON "naijue_erp"."import_record" USING "btree" ("source_entity_type", "source_key", "import_batch_id");


--
-- Name: import_record_target_lookup; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "import_record_target_lookup" ON "naijue_erp"."import_record" USING "btree" ("target_type", "target_id");


--
-- Name: inventory_ledger_balance_key; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "inventory_ledger_balance_key" ON "naijue_erp"."inventory_ledger" USING "btree" ("warehouse_id", "sku_id");


--
-- Name: inventory_ledger_sales_source; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "inventory_ledger_sales_source" ON "naijue_erp"."inventory_ledger" USING "btree" ("source_sales_line_id", "source_document_version");


--
-- Name: inventory_ledger_transfer_source; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "inventory_ledger_transfer_source" ON "naijue_erp"."inventory_ledger" USING "btree" ("source_transfer_line_id", "source_document_version");


--
-- Name: product_color_image_unique; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "product_color_image_unique" ON "naijue_erp"."product_image" USING "btree" ("product_id", "color_id") WHERE ("image_role" = 'COLOR'::"text");


--
-- Name: product_image_product_order_idx; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "product_image_product_order_idx" ON "naijue_erp"."product_image" USING "btree" ("product_id", "display_order", "id");


--
-- Name: product_season_ids_gin; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "product_season_ids_gin" ON "naijue_erp"."product" USING "gin" ("season_ids");


--
-- Name: runtime_sales_number_unique; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "runtime_sales_number_unique" ON "naijue_erp"."sales_header" USING "btree" ("number") WHERE ("stock_basis" = 'RUNTIME_LEDGER'::"text");


--
-- Name: runtime_transfer_number_unique; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "runtime_transfer_number_unique" ON "naijue_erp"."transfer_header" USING "btree" ("number") WHERE ("stock_basis" = 'RUNTIME_LEDGER'::"text");


--
-- Name: sales_header_statistics_scope; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "sales_header_statistics_scope" ON "naijue_erp"."sales_header" USING "btree" ("business_date", "id") WHERE ("status" = 'APPROVED'::"text");


--
-- Name: sales_line_current_position; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "sales_line_current_position" ON "naijue_erp"."sales_line" USING "btree" ("sales_id", "line_no") WHERE "is_current";


--
-- Name: sku_barcode_one_current_main; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "sku_barcode_one_current_main" ON "naijue_erp"."sku_barcode" USING "btree" ("sku_id") WHERE ("enabled" AND ("barcode_kind" = 'MAIN'::"text"));


--
-- Name: sku_barcode_target; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "sku_barcode_target" ON "naijue_erp"."sku_barcode" USING "btree" ("sku_id", "id");


--
-- Name: standard_baseline_activation_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "standard_baseline_activation_once" ON "naijue_erp"."operation_receipt" USING "btree" ((("result_data" ->> 'baselineBatchId'::"text"))) WHERE (("target_type" = 'IMPORT'::"text") AND ("action" = 'IMPORT_PUBLISH'::"text") AND (("result_data" ->> 'profile'::"text") = 'STANDARD_IMPORT_SQL_V1'::"text") AND (("result_data" ->> 'phase'::"text") = 'DOCUMENT_PUBLISH'::"text"));


--
-- Name: standard_inventory_key_once; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE UNIQUE INDEX "standard_inventory_key_once" ON "naijue_erp"."import_record" USING "btree" ("import_batch_id", "target_id") WHERE (("target_type" = 'INVENTORY_KEY'::"text") AND ("status" = 'IMPORTED'::"text"));


--
-- Name: supplier_name_order; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "supplier_name_order" ON "naijue_erp"."supplier" USING "btree" ("name" COLLATE "C", "id");


--
-- Name: transfer_header_date_order; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "transfer_header_date_order" ON "naijue_erp"."transfer_header" USING "btree" ("business_date" DESC, "id");


--
-- Name: transfer_header_from_scope; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "transfer_header_from_scope" ON "naijue_erp"."transfer_header" USING "btree" ("from_warehouse_id", "business_date", "id");


--
-- Name: transfer_header_to_scope; Type: INDEX; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE INDEX "transfer_header_to_scope" ON "naijue_erp"."transfer_header" USING "btree" ("to_warehouse_id", "business_date", "id");


--
-- Name: user_account account_available_administrator; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "account_available_administrator" AFTER INSERT OR UPDATE ON "naijue_erp"."user_account" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_available_administrator_commit"();


--
-- Name: user_account account_maintenance_event; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "account_maintenance_event" BEFORE INSERT OR UPDATE ON "naijue_erp"."user_account" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_account_event"();


--
-- Name: sku_barcode barcode_maintenance_write; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "barcode_maintenance_write" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."sku_barcode" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_child_write"();


--
-- Name: inventory_ledger baseline_reversal_source; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "baseline_reversal_source" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_unified_baseline_reversal"();


--
-- Name: inventory_ledger baseline_source_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "baseline_source_final_consistency" AFTER INSERT ON "naijue_erp"."inventory_ledger" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."event_kind" = 'CUTOFF_BASELINE'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_baseline_source_commit"();


--
-- Name: product_category category_final_component_depth; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "category_final_component_depth" AFTER INSERT OR DELETE OR UPDATE ON "naijue_erp"."product_category" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_category_final_component"();


--
-- Name: product_category category_retained_delete; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "category_retained_delete" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."product_category" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_delete"();


--
-- Name: product_category category_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "category_retained_reference" BEFORE INSERT OR UPDATE ON "naijue_erp"."product_category" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: product_category category_tree_statement_lock; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "category_tree_statement_lock" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."product_category" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."lock_category_tree_statement"();


--
-- Name: color color_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "color_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."color" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: color color_retained_delete; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "color_retained_delete" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."color" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_delete"();


--
-- Name: color color_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "color_retained_identity" BEFORE DELETE ON "naijue_erp"."color" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: customer customer_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "customer_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."customer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_party_native_commit"();


--
-- Name: customer customer_historical_only_immutable; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "customer_historical_only_immutable" BEFORE DELETE OR UPDATE ON "naijue_erp"."customer" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"();


--
-- Name: customer customer_historical_only_insert; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "customer_historical_only_insert" BEFORE INSERT ON "naijue_erp"."customer" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"();


--
-- Name: customer customer_native_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "customer_native_identity" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."customer" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."keep_party_native_identity"();


--
-- Name: audit_change cutoff_audits_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_audits_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."audit_change" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_balance cutoff_balance_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_balance_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."inventory_balance" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: import_batch cutoff_batch_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_batch_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."import_batch" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_ledger cutoff_ledger_guard; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_ledger_guard" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_cutoff_ledger"();


--
-- Name: inventory_ledger cutoff_ledger_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_ledger_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."inventory_ledger" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: operation_receipt cutoff_receipts_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_receipts_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."operation_receipt" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: sku cutoff_sku_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_sku_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."sku" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: import_record cutoff_sources_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_sources_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."import_record" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: warehouse cutoff_warehouse_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "cutoff_warehouse_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."warehouse" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: barcode_scheme document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."barcode_scheme" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: product_category document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."product_category" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: product_image document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."product_image" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: season document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."season" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: size_group document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."size_group" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: supplier document_runtime_reference_id_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "document_runtime_reference_id_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."supplier" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"();


--
-- Name: audit_change document_specification_commit; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "document_specification_commit" AFTER INSERT ON "naijue_erp"."audit_change" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_document_specification_commit"();


--
-- Name: fit fit_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "fit_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."fit" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: fit fit_retained_delete; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "fit_retained_delete" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."fit" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_delete"();


--
-- Name: fit fit_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "fit_retained_identity" BEFORE DELETE ON "naijue_erp"."fit" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: hall hall_available_administrator; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "hall_available_administrator" AFTER INSERT OR UPDATE ON "naijue_erp"."hall" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_available_administrator_commit"();


--
-- Name: hall hall_default_customer_enabled; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "hall_default_customer_enabled" BEFORE INSERT OR UPDATE OF "default_customer_id", "enabled" ON "naijue_erp"."hall" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."check_hall_default_customer_enabled"();


--
-- Name: hall hall_historical_only_customer; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "hall_historical_only_customer" BEFORE INSERT OR UPDATE OF "default_customer_id" ON "naijue_erp"."hall" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"();


--
-- Name: hall hall_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "hall_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."hall" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: hall hall_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "hall_retained_identity" BEFORE DELETE ON "naijue_erp"."hall" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_balance history_numeric_balance_commit; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "history_numeric_balance_commit" AFTER INSERT OR UPDATE ON "naijue_erp"."inventory_balance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_history_numeric_balance_commit"();


--
-- Name: inventory_ledger history_numeric_ledger_guard; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "history_numeric_ledger_guard" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_history_numeric_ledger"();


--
-- Name: inventory_ledger history_numeric_ledger_set_insert; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "history_numeric_ledger_set_insert" AFTER INSERT ON "naijue_erp"."inventory_ledger" REFERENCING NEW TABLE AS "history_new" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."history_numeric_ledger_set_guard"();


--
-- Name: operation_receipt history_numeric_receipt_commit; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "history_numeric_receipt_commit" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_history_numeric_receipt_commit"();


--
-- Name: import_batch history_typed_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "history_typed_publication" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_history_typed_publication"();


--
-- Name: product_image image_maintenance_write; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "image_maintenance_write" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."product_image" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_child_write"();


--
-- Name: audit_change immutable_audit; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "immutable_audit" BEFORE DELETE OR UPDATE ON "naijue_erp"."audit_change" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: import_record immutable_import_record; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "immutable_import_record" BEFORE DELETE OR UPDATE ON "naijue_erp"."import_record" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_ledger immutable_ledger; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "immutable_ledger" BEFORE DELETE OR UPDATE ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: operation_receipt immutable_receipt; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "immutable_receipt" BEFORE DELETE OR UPDATE ON "naijue_erp"."operation_receipt" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_ledger import_accounting_baseline_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_accounting_baseline_consistency" AFTER INSERT ON "naijue_erp"."inventory_ledger" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."event_kind" = 'CUTOFF_BASELINE'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_import_accounting_baseline_commit"();


--
-- Name: import_batch import_accounting_checkpoint_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_accounting_checkpoint_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."import_batch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_import_accounting_checkpoint_commit"();


--
-- Name: import_record import_accounting_final_record_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_accounting_final_record_consistency" AFTER INSERT ON "naijue_erp"."import_record" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = 'IMPORT_BATCH'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_import_accounting_final_record_commit"();


--
-- Name: import_batch import_accounting_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "import_accounting_publication" BEFORE UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_import_accounting_publication"();


--
-- Name: import_batch import_batch_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_batch_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."import_batch" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_import_batch_commit"();


--
-- Name: import_batch import_batch_history_header_native_reference_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "import_batch_history_header_native_reference_publication" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_header_native_reference_publication"();


--
-- Name: import_batch import_batch_history_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "import_batch_history_publication" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_history_publication"();


--
-- Name: import_batch import_batch_transition; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "import_batch_transition" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_import_batch"();


--
-- Name: operation_receipt import_operation_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_operation_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = 'IMPORT'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_import_operation"();


--
-- Name: import_record import_record_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "import_record_identity" BEFORE INSERT ON "naijue_erp"."import_record" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_import_record"();


--
-- Name: import_record import_source_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "import_source_final_consistency" AFTER INSERT ON "naijue_erp"."import_record" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_import_source_commit"();


--
-- Name: inventory_balance inventory_balance_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "inventory_balance_identity" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."inventory_balance" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_balance_identity"();


--
-- Name: inventory_ledger ledger_receipt_source_coherence; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "ledger_receipt_source_coherence" AFTER INSERT ON "naijue_erp"."inventory_ledger" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."event_kind" = ANY (ARRAY['APPROVE'::"text", 'UNAPPROVE'::"text"]))) EXECUTE FUNCTION "naijue_erp"."validate_ledger_receipt_source"();


--
-- Name: inventory_ledger ledger_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "ledger_retained_reference" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: audit_change maintenance_audit_actor; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "maintenance_audit_actor" BEFORE INSERT ON "naijue_erp"."audit_change" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_audit_actor"();


--
-- Name: operation_receipt maintenance_receipt_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "maintenance_receipt_final_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_receipt_commit"();


--
-- Name: import_batch native_catalogue_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "native_catalogue_publication" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_native_catalogue_publication"();


--
-- Name: import_batch native_payment_publication; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "native_payment_publication" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_native_payment_publication"();


--
-- Name: operation_receipt party_receipt_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "party_receipt_final_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = ANY (ARRAY['CUSTOMER'::"text", 'SUPPLIER'::"text"]))) EXECUTE FUNCTION "naijue_erp"."validate_party_receipt_commit"();


--
-- Name: payment_account payment_account_maintenance_before_root; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "payment_account_maintenance_before_root" BEFORE INSERT OR UPDATE ON "naijue_erp"."payment_account" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_before_root"();


--
-- Name: payment_account payment_account_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "payment_account_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."payment_account" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: payment_account payment_account_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "payment_account_retained_identity" BEFORE DELETE ON "naijue_erp"."payment_account" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: payment_account_hall payment_hall_maintenance_write; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "payment_hall_maintenance_write" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."payment_account_hall" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_child_write"();


--
-- Name: payment_method payment_method_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "payment_method_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."payment_method" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: payment_method payment_method_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "payment_method_retained_identity" BEFORE DELETE ON "naijue_erp"."payment_method" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: product_category product_category_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "product_category_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."product_category" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: product_category product_category_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_category_retained_identity" BEFORE DELETE ON "naijue_erp"."product_category" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: product_image product_image_color_membership; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_image_color_membership" BEFORE INSERT OR UPDATE ON "naijue_erp"."product_image" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_product_image_color"();


--
-- Name: product product_maintenance_before_root; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_maintenance_before_root" BEFORE INSERT OR UPDATE ON "naijue_erp"."product" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_before_root"();


--
-- Name: product product_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "product_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."product" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: product product_retained_delete; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_retained_delete" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."product" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_delete"();


--
-- Name: product product_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_retained_identity" BEFORE DELETE ON "naijue_erp"."product" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: product product_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_retained_reference" BEFORE INSERT OR UPDATE ON "naijue_erp"."product" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: product product_season_selection; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "product_season_selection" BEFORE INSERT OR UPDATE OF "season_ids", "season_id" ON "naijue_erp"."product" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_product_season_selection"();


--
-- Name: inventory_balance recorded_live_balance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "recorded_live_balance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."inventory_balance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_recorded_live_balance_commit"();


--
-- Name: sales_settlement retained_settlement_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "retained_settlement_identity" BEFORE INSERT ON "naijue_erp"."sales_settlement" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_settlement_identity"();


--
-- Name: runtime_document_number_allocation runtime_document_number_assign; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "runtime_document_number_assign" BEFORE INSERT ON "naijue_erp"."runtime_document_number_allocation" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."assign_runtime_document_number"();


--
-- Name: runtime_document_number_allocation runtime_document_number_immutable; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "runtime_document_number_immutable" BEFORE DELETE OR UPDATE ON "naijue_erp"."runtime_document_number_allocation" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: runtime_document_number_allocation runtime_document_number_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "runtime_document_number_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."runtime_document_number_allocation" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: sales_header sales_cutoff_freeze; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_cutoff_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."sales_header" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_unified_document"();


--
-- Name: sales_line sales_cutoff_line_freeze; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_cutoff_line_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."sales_line" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."freeze_cutoff_sales_detail"();


--
-- Name: sales_settlement sales_cutoff_settlement_freeze; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_cutoff_settlement_freeze" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."sales_settlement" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."freeze_cutoff_sales_detail"();


--
-- Name: sales_header sales_header_settlement_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "sales_header_settlement_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."sales_header" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_sales_settlement"();


--
-- Name: sales_header sales_historical_only_customer; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_historical_only_customer" BEFORE INSERT OR UPDATE ON "naijue_erp"."sales_header" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_unified_sales_customer_reference"();


--
-- Name: sales_line sales_line_owner; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_line_owner" BEFORE UPDATE OF "sales_id" ON "naijue_erp"."sales_line" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."keep_sales_line_owner"();


--
-- Name: sales_line sales_line_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_line_retained_reference" BEFORE INSERT OR UPDATE ON "naijue_erp"."sales_line" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: operation_receipt sales_receipt_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "sales_receipt_final_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = 'SALES'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_sales_commit"();


--
-- Name: sales_settlement sales_rows_settlement_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "sales_rows_settlement_consistency" AFTER INSERT OR DELETE OR UPDATE ON "naijue_erp"."sales_settlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_sales_settlement"();


--
-- Name: sales_header sales_runtime_number; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sales_runtime_number" BEFORE INSERT OR UPDATE ON "naijue_erp"."sales_header" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_runtime_document_number"();


--
-- Name: season season_array_no_truncate; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "season_array_no_truncate" BEFORE TRUNCATE ON "naijue_erp"."season" FOR EACH STATEMENT EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: season season_array_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "season_array_reference" BEFORE DELETE OR UPDATE OF "id" ON "naijue_erp"."season" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_referenced_season_identity"();


--
-- Name: sku_barcode sku_barcode_retains_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sku_barcode_retains_identity" BEFORE DELETE OR UPDATE ON "naijue_erp"."sku_barcode" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."keep_barcode_binding_identity"();


--
-- Name: sku sku_creation_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "sku_creation_final_consistency" AFTER INSERT ON "naijue_erp"."sku" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_native_creation_commit"();


--
-- Name: sku sku_creation_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sku_creation_identity" BEFORE INSERT OR UPDATE ON "naijue_erp"."sku" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_native_creation_identity"();


--
-- Name: sku sku_import_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sku_import_identity" BEFORE DELETE OR UPDATE OF "id" ON "naijue_erp"."sku" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."freeze_imported_identity"();


--
-- Name: sku sku_maintenance_write; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sku_maintenance_write" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."sku" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_child_write"();


--
-- Name: sku sku_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "sku_retained_reference" BEFORE INSERT OR UPDATE ON "naijue_erp"."sku" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: inventory_balance sparse_balance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "sparse_balance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."inventory_balance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_sparse_balance_commit"();


--
-- Name: staff staff_available_administrator; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "staff_available_administrator" AFTER INSERT OR UPDATE ON "naijue_erp"."staff" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_available_administrator_commit"();


--
-- Name: staff staff_maintenance_before_root; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "staff_maintenance_before_root" BEFORE INSERT OR UPDATE ON "naijue_erp"."staff" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_maintenance_before_root"();


--
-- Name: staff staff_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "staff_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."staff" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: staff staff_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "staff_retained_identity" BEFORE DELETE ON "naijue_erp"."staff" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: color standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."color" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: customer standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."customer" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: fit standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."fit" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: hall standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."hall" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: payment_account standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."payment_account" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: payment_method standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."payment_method" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: product standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."product" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: size standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."size" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: size_group_member standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "size_group_id" ON "naijue_erp"."size_group_member" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: sku standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."sku" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: sku_barcode standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."sku_barcode" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: staff standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."staff" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: user_account standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."user_account" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: warehouse standard_runtime_reference_lock_only; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "standard_runtime_reference_lock_only" BEFORE UPDATE OF "id" ON "naijue_erp"."warehouse" FOR EACH ROW WHEN (("current_setting"('role'::"text") = 'erp_unified27_runtime_2393dbc6db9581c2'::"text")) EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: import_batch successor_publication26; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "successor_publication26" BEFORE INSERT OR UPDATE ON "naijue_erp"."import_batch" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_successor_publication26"();


--
-- Name: supplier supplier_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "supplier_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."supplier" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_party_native_commit"();


--
-- Name: supplier supplier_native_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "supplier_native_identity" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."supplier" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."keep_party_native_identity"();


--
-- Name: inventory_balance transfer_balance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "transfer_balance_final_consistency" AFTER UPDATE ON "naijue_erp"."inventory_balance" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_transfer_balance_commit"();


--
-- Name: transfer_header transfer_header_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "transfer_header_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."transfer_header" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_transfer_header_commit"();


--
-- Name: transfer_header transfer_header_provenance; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "transfer_header_provenance" BEFORE INSERT OR DELETE OR UPDATE ON "naijue_erp"."transfer_header" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_unified_document"();


--
-- Name: transfer_line transfer_line_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "transfer_line_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."transfer_line" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_transfer_line_commit"();


--
-- Name: transfer_line transfer_line_owner; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "transfer_line_owner" BEFORE DELETE OR UPDATE ON "naijue_erp"."transfer_line" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."keep_transfer_line_owner"();


--
-- Name: transfer_line transfer_line_retained_reference; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "transfer_line_retained_reference" BEFORE INSERT OR UPDATE ON "naijue_erp"."transfer_line" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_retained_catalogue_reference"();


--
-- Name: operation_receipt transfer_receipt_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "transfer_receipt_final_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = 'TRANSFER'::"text")) EXECUTE FUNCTION "naijue_erp"."validate_transfer_commit"();


--
-- Name: transfer_header transfer_runtime_number; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "transfer_runtime_number" BEFORE INSERT OR UPDATE ON "naijue_erp"."transfer_header" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_runtime_document_number"();


--
-- Name: operation_receipt unified_ordinary_operation_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "unified_ordinary_operation_consistency" AFTER INSERT ON "naijue_erp"."operation_receipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (("new"."target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"]))) EXECUTE FUNCTION "naijue_erp"."validate_unified_ordinary_operation"();


--
-- Name: sales_header unified_sales_header_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "unified_sales_header_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."sales_header" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_unified_sales_header_commit"();


--
-- Name: sales_line unified_sales_line_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "unified_sales_line_command_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."sales_line" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_unified_sales_line_commit"();


--
-- Name: sales_settlement unified_sales_settlement_command_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "unified_sales_settlement_command_consistency" AFTER INSERT OR DELETE OR UPDATE ON "naijue_erp"."sales_settlement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_unified_sales_settlement_commit"();


--
-- Name: user_account user_account_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "user_account_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."user_account" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: user_account user_account_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "user_account_retained_identity" BEFORE DELETE ON "naijue_erp"."user_account" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_ledger validate_native_reversal; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "validate_native_reversal" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_exact_native_reversal"();


--
-- Name: inventory_ledger validate_sales_ledger_source; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "validate_sales_ledger_source" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW WHEN (("new"."source_sales_line_id" IS NOT NULL)) EXECUTE FUNCTION "naijue_erp"."validate_sales_effect"();


--
-- Name: inventory_ledger validate_transfer_ledger_source; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "validate_transfer_ledger_source" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW WHEN (("new"."source_transfer_line_id" IS NOT NULL)) EXECUTE FUNCTION "naijue_erp"."validate_transfer_effect"();


--
-- Name: warehouse warehouse_creation_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "warehouse_creation_final_consistency" AFTER INSERT ON "naijue_erp"."warehouse" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_native_creation_commit"();


--
-- Name: warehouse warehouse_creation_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "warehouse_creation_identity" BEFORE INSERT OR UPDATE ON "naijue_erp"."warehouse" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_native_creation_identity"();


--
-- Name: warehouse warehouse_import_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "warehouse_import_identity" BEFORE DELETE OR UPDATE OF "id" ON "naijue_erp"."warehouse" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."freeze_imported_identity"();


--
-- Name: warehouse warehouse_maintenance_final_consistency; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE CONSTRAINT TRIGGER "warehouse_maintenance_final_consistency" AFTER INSERT OR UPDATE ON "naijue_erp"."warehouse" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."validate_maintenance_root_commit"();


--
-- Name: warehouse warehouse_retained_identity; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "warehouse_retained_identity" BEFORE DELETE ON "naijue_erp"."warehouse" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."reject_immutable_change"();


--
-- Name: inventory_ledger zz_live_ledger_balance_snapshot; Type: TRIGGER; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE TRIGGER "zz_live_ledger_balance_snapshot" BEFORE INSERT ON "naijue_erp"."inventory_ledger" FOR EACH ROW EXECUTE FUNCTION "naijue_erp"."guard_recorded_live_balance_pair"();


--
-- Name: audit_change audit_change_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: audit_change audit_change_object_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_account_id_fkey" FOREIGN KEY ("object_account_id") REFERENCES "naijue_erp"."user_account"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_category_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_category_id_fkey" FOREIGN KEY ("object_category_id") REFERENCES "naijue_erp"."product_category"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_color_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_color_id_fkey" FOREIGN KEY ("object_color_id") REFERENCES "naijue_erp"."color"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_customer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_customer_id_fkey" FOREIGN KEY ("object_customer_id") REFERENCES "naijue_erp"."customer"("id");


--
-- Name: audit_change audit_change_object_fit_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_fit_id_fkey" FOREIGN KEY ("object_fit_id") REFERENCES "naijue_erp"."fit"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_hall_id_fkey" FOREIGN KEY ("object_hall_id") REFERENCES "naijue_erp"."hall"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.audit_change
    ADD CONSTRAINT ordinary_only_object_history_sales_id CHECK (object_history_sales_id IS NULL);

-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.audit_change
    ADD CONSTRAINT ordinary_only_object_history_transfer_id CHECK (object_history_transfer_id IS NULL);

-- Name: audit_change audit_change_object_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_payment_account_id_fkey" FOREIGN KEY ("object_payment_account_id") REFERENCES "naijue_erp"."payment_account"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_payment_method_id_fkey" FOREIGN KEY ("object_payment_method_id") REFERENCES "naijue_erp"."payment_method"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_product_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_product_id_fkey" FOREIGN KEY ("object_product_id") REFERENCES "naijue_erp"."product"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_sales_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_sales_id_fkey" FOREIGN KEY ("object_sales_id") REFERENCES "naijue_erp"."sales_header"("id");


--
-- Name: audit_change audit_change_object_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_staff_id_fkey" FOREIGN KEY ("object_staff_id") REFERENCES "naijue_erp"."staff"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_object_supplier_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_supplier_id_fkey" FOREIGN KEY ("object_supplier_id") REFERENCES "naijue_erp"."supplier"("id");


--
-- Name: audit_change audit_change_object_transfer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_transfer_id_fkey" FOREIGN KEY ("object_transfer_id") REFERENCES "naijue_erp"."transfer_header"("id");


--
-- Name: audit_change audit_change_object_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_object_warehouse_id_fkey" FOREIGN KEY ("object_warehouse_id") REFERENCES "naijue_erp"."warehouse"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_change_operation_id_actor_account_id_object_id_actio_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_change_operation_id_actor_account_id_object_id_actio_fkey" FOREIGN KEY ("operation_id", "actor_account_id", "object_id", "action") REFERENCES "naijue_erp"."operation_receipt"("id", "actor_account_id", "target_id", "action") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: audit_change audit_receipt_kind_coherence; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."audit_change"
    ADD CONSTRAINT "audit_receipt_kind_coherence" FOREIGN KEY ("operation_id", "actor_account_id", "object_type", "object_id", "action") REFERENCES "naijue_erp"."operation_receipt"("id", "actor_account_id", "target_type", "target_id", "action") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_session auth_session_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."auth_session"
    ADD CONSTRAINT "auth_session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: hall hall_default_customer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."hall"
    ADD CONSTRAINT "hall_default_customer_id_fkey" FOREIGN KEY ("default_customer_id") REFERENCES "naijue_erp"."customer"("id");


--
-- Name: hall hall_default_sales_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."hall"
    ADD CONSTRAINT "hall_default_sales_warehouse_id_fkey" FOREIGN KEY ("default_sales_warehouse_id") REFERENCES "naijue_erp"."warehouse"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: import_record import_record_batch_namespace; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_record"
    ADD CONSTRAINT "import_record_batch_namespace" FOREIGN KEY ("import_batch_id", "source_system") REFERENCES "naijue_erp"."import_batch"("id", "source_name");


--
-- Name: import_record import_record_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."import_record"
    ADD CONSTRAINT "import_record_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "naijue_erp"."import_batch"("id");


--
-- Name: inventory_balance inventory_balance_last_operation_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_balance"
    ADD CONSTRAINT "inventory_balance_last_operation_id_fkey" FOREIGN KEY ("last_operation_id") REFERENCES "naijue_erp"."operation_receipt"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: inventory_balance inventory_balance_sku_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_balance"
    ADD CONSTRAINT "inventory_balance_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "naijue_erp"."sku"("id");


--
-- Name: inventory_balance inventory_balance_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_balance"
    ADD CONSTRAINT "inventory_balance_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "naijue_erp"."warehouse"("id");


--
-- Name: inventory_ledger inventory_ledger_baseline_anchor_operation_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_baseline_anchor_operation_id_fkey" FOREIGN KEY ("baseline_anchor_operation_id") REFERENCES "naijue_erp"."operation_receipt"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: inventory_ledger inventory_ledger_operation_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "naijue_erp"."operation_receipt"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: inventory_ledger inventory_ledger_reverses_entry_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "naijue_erp"."inventory_ledger"("id");


--
-- Name: inventory_ledger inventory_ledger_sku_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "naijue_erp"."sku"("id");


--
-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.inventory_ledger
    ADD CONSTRAINT ordinary_only_source_history_revision_id CHECK (source_history_revision_id IS NULL);

-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.inventory_ledger
    ADD CONSTRAINT ordinary_only_source_history_sales_line_id CHECK (source_history_sales_line_id IS NULL);

-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.inventory_ledger
    ADD CONSTRAINT ordinary_only_source_history_transfer_line_id CHECK (source_history_transfer_line_id IS NULL);

-- Name: inventory_ledger inventory_ledger_source_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_source_import_batch_id_fkey" FOREIGN KEY ("source_import_batch_id") REFERENCES "naijue_erp"."import_batch"("id");


--
-- Name: inventory_ledger inventory_ledger_source_sales_line_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_source_sales_line_id_fkey" FOREIGN KEY ("source_sales_line_id") REFERENCES "naijue_erp"."sales_line"("id");


--
-- Name: inventory_ledger inventory_ledger_source_transfer_line_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_source_transfer_line_id_fkey" FOREIGN KEY ("source_transfer_line_id") REFERENCES "naijue_erp"."transfer_line"("id");


--
-- Name: inventory_ledger inventory_ledger_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "naijue_erp"."warehouse"("id");


--
-- Name: inventory_ledger ledger_retains_balance; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."inventory_ledger"
    ADD CONSTRAINT "ledger_retains_balance" FOREIGN KEY ("warehouse_id", "sku_id") REFERENCES "naijue_erp"."inventory_balance"("warehouse_id", "sku_id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: operation_receipt operation_receipt_target_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "naijue_erp"."user_account"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_category_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_category_id_fkey" FOREIGN KEY ("target_category_id") REFERENCES "naijue_erp"."product_category"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_color_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_color_id_fkey" FOREIGN KEY ("target_color_id") REFERENCES "naijue_erp"."color"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_customer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "naijue_erp"."customer"("id");


--
-- Name: operation_receipt operation_receipt_target_fit_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_fit_id_fkey" FOREIGN KEY ("target_fit_id") REFERENCES "naijue_erp"."fit"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_hall_id_fkey" FOREIGN KEY ("target_hall_id") REFERENCES "naijue_erp"."hall"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.operation_receipt
    ADD CONSTRAINT ordinary_only_target_history_sales_id CHECK (target_history_sales_id IS NULL);

-- Fresh-only null reference invariant.
ALTER TABLE ONLY naijue_erp.operation_receipt
    ADD CONSTRAINT ordinary_only_target_history_transfer_id CHECK (target_history_transfer_id IS NULL);

-- Name: operation_receipt operation_receipt_target_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_payment_account_id_fkey" FOREIGN KEY ("target_payment_account_id") REFERENCES "naijue_erp"."payment_account"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_payment_method_id_fkey" FOREIGN KEY ("target_payment_method_id") REFERENCES "naijue_erp"."payment_method"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_product_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_product_id_fkey" FOREIGN KEY ("target_product_id") REFERENCES "naijue_erp"."product"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_sales_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_sales_id_fkey" FOREIGN KEY ("target_sales_id") REFERENCES "naijue_erp"."sales_header"("id");


--
-- Name: operation_receipt operation_receipt_target_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_staff_id_fkey" FOREIGN KEY ("target_staff_id") REFERENCES "naijue_erp"."staff"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt operation_receipt_target_supplier_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_supplier_id_fkey" FOREIGN KEY ("target_supplier_id") REFERENCES "naijue_erp"."supplier"("id");


--
-- Name: operation_receipt operation_receipt_target_transfer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_transfer_id_fkey" FOREIGN KEY ("target_transfer_id") REFERENCES "naijue_erp"."transfer_header"("id");


--
-- Name: operation_receipt operation_receipt_target_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "operation_receipt_target_warehouse_id_fkey" FOREIGN KEY ("target_warehouse_id") REFERENCES "naijue_erp"."warehouse"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: payment_account_hall payment_account_hall_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_account_hall"
    ADD CONSTRAINT "payment_account_hall_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: payment_account_hall payment_account_hall_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_account_hall"
    ADD CONSTRAINT "payment_account_hall_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "naijue_erp"."payment_account"("id");


--
-- Name: payment_account payment_account_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."payment_account"
    ADD CONSTRAINT "payment_account_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "naijue_erp"."payment_method"("id");


--
-- Name: product product_category_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "naijue_erp"."product_category"("id");


--
-- Name: product_category product_category_parent_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_category"
    ADD CONSTRAINT "product_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "naijue_erp"."product_category"("id");


--
-- Name: product product_default_barcode_scheme_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_default_barcode_scheme_id_fkey" FOREIGN KEY ("default_barcode_scheme_id") REFERENCES "naijue_erp"."barcode_scheme"("id");


--
-- Name: product_image product_image_color_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_image"
    ADD CONSTRAINT "product_image_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "naijue_erp"."color"("id");


--
-- Name: product_image product_image_created_by_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_image"
    ADD CONSTRAINT "product_image_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: product_image product_image_product_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product_image"
    ADD CONSTRAINT "product_image_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "naijue_erp"."product"("id");


--
-- Name: product product_season_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "naijue_erp"."season"("id");


--
-- Name: product product_size_group_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_size_group_id_fkey" FOREIGN KEY ("size_group_id") REFERENCES "naijue_erp"."size_group"("id");


--
-- Name: product product_supplier_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."product"
    ADD CONSTRAINT "product_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "naijue_erp"."supplier"("id");


--
-- Name: operation_receipt receipt_requires_audit; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "receipt_requires_audit" FOREIGN KEY ("id", "target_id") REFERENCES "naijue_erp"."audit_change"("operation_id", "object_id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: operation_receipt receipt_requires_same_kind_audit; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."operation_receipt"
    ADD CONSTRAINT "receipt_requires_same_kind_audit" FOREIGN KEY ("id", "target_type", "target_id") REFERENCES "naijue_erp"."audit_change"("operation_id", "object_type", "object_id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: runtime_document_number_allocation runtime_document_number_allocation_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."runtime_document_number_allocation"
    ADD CONSTRAINT "runtime_document_number_allocation_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: sales_header sales_header_approved_by_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_approved_by_account_id_fkey" FOREIGN KEY ("approved_by_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: sales_header sales_header_approved_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_approved_by_staff_id_fkey" FOREIGN KEY ("approved_by_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: sales_header sales_header_created_by_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: sales_header sales_header_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: sales_header sales_header_created_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_created_hall_id_fkey" FOREIGN KEY ("created_hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: sales_header sales_header_customer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "naijue_erp"."customer"("id");


--
-- Name: sales_header sales_header_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: sales_header sales_header_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "naijue_erp"."import_batch"("id");


--
-- Name: sales_header sales_header_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: sales_header sales_header_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_header_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "naijue_erp"."warehouse"("id");


--
-- Name: sales_line sales_line_sales_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_line"
    ADD CONSTRAINT "sales_line_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "naijue_erp"."sales_header"("id");


--
-- Name: sales_line sales_line_sku_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_line"
    ADD CONSTRAINT "sales_line_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "naijue_erp"."sku"("id");


--
-- Name: sales_header sales_responsible_staff_fk; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_header"
    ADD CONSTRAINT "sales_responsible_staff_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: sales_settlement sales_settlement_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_settlement"
    ADD CONSTRAINT "sales_settlement_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "naijue_erp"."payment_account"("id");


--
-- Name: sales_settlement sales_settlement_payment_method_id_snapshot_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_settlement"
    ADD CONSTRAINT "sales_settlement_payment_method_id_snapshot_fkey" FOREIGN KEY ("payment_method_id_snapshot") REFERENCES "naijue_erp"."payment_method"("id");


--
-- Name: sales_settlement sales_settlement_sales_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sales_settlement"
    ADD CONSTRAINT "sales_settlement_sales_id_fkey" FOREIGN KEY ("sales_id") REFERENCES "naijue_erp"."sales_header"("id");


--
-- Name: size_group_member size_group_member_size_group_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size_group_member"
    ADD CONSTRAINT "size_group_member_size_group_id_fkey" FOREIGN KEY ("size_group_id") REFERENCES "naijue_erp"."size_group"("id");


--
-- Name: size_group_member size_group_member_size_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."size_group_member"
    ADD CONSTRAINT "size_group_member_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "naijue_erp"."size"("id");


--
-- Name: sku_barcode sku_barcode_scheme_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku_barcode"
    ADD CONSTRAINT "sku_barcode_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "naijue_erp"."barcode_scheme"("id");


--
-- Name: sku_barcode sku_barcode_sku_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku_barcode"
    ADD CONSTRAINT "sku_barcode_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "naijue_erp"."sku"("id");


--
-- Name: sku sku_color_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "naijue_erp"."color"("id");


--
-- Name: sku sku_created_operation_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_created_operation_id_fkey" FOREIGN KEY ("created_operation_id") REFERENCES "naijue_erp"."operation_receipt"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: sku sku_fit_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_fit_id_fkey" FOREIGN KEY ("fit_id") REFERENCES "naijue_erp"."fit"("id");


--
-- Name: sku sku_product_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "naijue_erp"."product"("id");


--
-- Name: sku sku_size_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."sku"
    ADD CONSTRAINT "sku_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "naijue_erp"."size"("id");


--
-- Name: staff staff_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."staff"
    ADD CONSTRAINT "staff_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: transfer_header transfer_header_approved_by_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_approved_by_account_id_fkey" FOREIGN KEY ("approved_by_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: transfer_header transfer_header_approved_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_approved_by_staff_id_fkey" FOREIGN KEY ("approved_by_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: transfer_header transfer_header_created_by_account_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "naijue_erp"."user_account"("id");


--
-- Name: transfer_header transfer_header_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: transfer_header transfer_header_created_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_created_hall_id_fkey" FOREIGN KEY ("created_hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: transfer_header transfer_header_from_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "naijue_erp"."warehouse"("id");


--
-- Name: transfer_header transfer_header_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "naijue_erp"."import_batch"("id");


--
-- Name: transfer_header transfer_header_to_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_header_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "naijue_erp"."warehouse"("id");


--
-- Name: transfer_line transfer_line_sku_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_line"
    ADD CONSTRAINT "transfer_line_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "naijue_erp"."sku"("id");


--
-- Name: transfer_line transfer_line_transfer_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_line"
    ADD CONSTRAINT "transfer_line_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "naijue_erp"."transfer_header"("id");


--
-- Name: transfer_header transfer_responsible_staff_fk; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."transfer_header"
    ADD CONSTRAINT "transfer_responsible_staff_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: user_account user_account_staff_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."user_account"
    ADD CONSTRAINT "user_account_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "naijue_erp"."staff"("id");


--
-- Name: warehouse warehouse_created_operation_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."warehouse"
    ADD CONSTRAINT "warehouse_created_operation_id_fkey" FOREIGN KEY ("created_operation_id") REFERENCES "naijue_erp"."operation_receipt"("id") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: warehouse warehouse_hall_id_fkey; Type: FK CONSTRAINT; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE ONLY "naijue_erp"."warehouse"
    ADD CONSTRAINT "warehouse_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "naijue_erp"."hall"("id");


--
-- Name: audit_change; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."audit_change" ENABLE ROW LEVEL SECURITY;

--
-- Name: barcode_scheme; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."barcode_scheme" ENABLE ROW LEVEL SECURITY;

--
-- Name: color; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."color" ENABLE ROW LEVEL SECURITY;

--
-- Name: customer; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."customer" ENABLE ROW LEVEL SECURITY;

--
-- Name: fit; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."fit" ENABLE ROW LEVEL SECURITY;

--
-- Name: hall; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."hall" ENABLE ROW LEVEL SECURITY;

--
-- Name: import_batch; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."import_batch" ENABLE ROW LEVEL SECURITY;

--
-- Name: import_record; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."import_record" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_balance; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."inventory_balance" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_ledger; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."inventory_ledger" ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_receipt; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."operation_receipt" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_account; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."payment_account" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_account_hall; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."payment_account_hall" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_method; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."payment_method" ENABLE ROW LEVEL SECURITY;

--
-- Name: product; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."product" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_category; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."product_category" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_image; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."product_image" ENABLE ROW LEVEL SECURITY;

--
-- Name: runtime_document_number_allocation; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."runtime_document_number_allocation" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_header; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."sales_header" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_line; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."sales_line" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_settlement; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."sales_settlement" ENABLE ROW LEVEL SECURITY;

--
-- Name: season; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."season" ENABLE ROW LEVEL SECURITY;

--
-- Name: size; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."size" ENABLE ROW LEVEL SECURITY;

--
-- Name: size_group; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."size_group" ENABLE ROW LEVEL SECURITY;

--
-- Name: size_group_member; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."size_group_member" ENABLE ROW LEVEL SECURITY;

--
-- Name: sku; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."sku" ENABLE ROW LEVEL SECURITY;

--
-- Name: sku_barcode; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."sku_barcode" ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."staff" ENABLE ROW LEVEL SECURITY;

--
-- Name: barcode_scheme standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."barcode_scheme" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: color standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."color" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: customer standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."customer" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: fit standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."fit" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: hall standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."hall" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: payment_account standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."payment_account" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: payment_account_hall standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."payment_account_hall" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: payment_method standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."payment_method" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: product standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: product_category standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."product_category" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: product_image standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."product_image" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: season standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."season" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: size standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."size" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: size_group standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."size_group" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: size_group_member standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."size_group_member" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: sku standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: sku_barcode standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: staff standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."staff" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() OR (("role" = 'ADMIN'::"text") AND ("hall_id" IS NULL) AND ("employment_status" = '在职'::"text") AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."user_account" "a"
  WHERE (("a"."staff_id" = "staff"."id") AND "a"."login_enabled" AND ("a"."version" = 1) AND ("a"."auth_version" = 1) AND ("a"."created_at" = "a"."updated_at"))))))) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: supplier standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."supplier" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: warehouse standard_published_master_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_master_runtime" ON "naijue_erp"."warehouse" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: audit_change standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."audit_change" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: import_batch standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."import_batch" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: import_record standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."import_record" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: inventory_balance standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."inventory_balance" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: inventory_ledger standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."inventory_ledger" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: operation_receipt standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."operation_receipt" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: runtime_document_number_allocation standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."runtime_document_number_allocation" TO "erp_unified27_runtime_2393dbc6db9581c2" USING ("naijue_erp"."standard_business_ready"()) WITH CHECK ("naijue_erp"."standard_business_ready"());


--
-- Name: sales_header standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."sales_header" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() AND (("import_batch_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "naijue_erp"."import_batch" "b"
  WHERE (("b"."id" = "sales_header"."import_batch_id") AND ("b"."status" = 'IMPORTED'::"text"))))))) WITH CHECK (("naijue_erp"."standard_business_ready"() AND (("import_batch_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "naijue_erp"."import_batch" "b"
  WHERE (("b"."id" = "sales_header"."import_batch_id") AND ("b"."status" = 'IMPORTED'::"text")))))));


--
-- Name: sales_line standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."sales_line" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."sales_header" "h"
  WHERE ("h"."id" = "sales_line"."sales_id"))))) WITH CHECK (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."sales_header" "h"
  WHERE ("h"."id" = "sales_line"."sales_id")))));


--
-- Name: sales_settlement standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."sales_settlement" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."sales_header" "h"
  WHERE ("h"."id" = "sales_settlement"."sales_id"))))) WITH CHECK (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."sales_header" "h"
  WHERE ("h"."id" = "sales_settlement"."sales_id")))));


--
-- Name: transfer_header standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."transfer_header" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() AND (("import_batch_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "naijue_erp"."import_batch" "b"
  WHERE (("b"."id" = "transfer_header"."import_batch_id") AND ("b"."status" = 'IMPORTED'::"text"))))))) WITH CHECK (("naijue_erp"."standard_business_ready"() AND (("import_batch_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "naijue_erp"."import_batch" "b"
  WHERE (("b"."id" = "transfer_header"."import_batch_id") AND ("b"."status" = 'IMPORTED'::"text")))))));


--
-- Name: transfer_line standard_published_runtime; Type: POLICY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

CREATE POLICY "standard_published_runtime" ON "naijue_erp"."transfer_line" TO "erp_unified27_runtime_2393dbc6db9581c2" USING (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."transfer_header" "h"
  WHERE ("h"."id" = "transfer_line"."transfer_id"))))) WITH CHECK (("naijue_erp"."standard_business_ready"() AND (EXISTS ( SELECT 1
   FROM "naijue_erp"."transfer_header" "h"
  WHERE ("h"."id" = "transfer_line"."transfer_id")))));


--
-- Name: supplier; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."supplier" ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_header; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."transfer_header" ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_line; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."transfer_line" ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouse; Type: ROW SECURITY; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

ALTER TABLE "naijue_erp"."warehouse" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "naijue_erp"; Type: ACL; Schema: -; Owner: fresh35_owner_20261105_r1
--

GRANT USAGE ON SCHEMA "naijue_erp" TO "erp_unified27_initializer_2393dbc6db9581c2";
GRANT USAGE ON SCHEMA "naijue_erp" TO "erp_unified27_importer_2393dbc6db9581c2";
GRANT USAGE ON SCHEMA "naijue_erp" TO "erp_unified27_runtime_2393dbc6db9581c2";
GRANT USAGE ON SCHEMA "naijue_erp" TO "fresh35_controller_20261105_r1";


--
-- Name: TABLE "import_batch"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."import_batch" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "assert_document_conversion_batch"("next_row" "naijue_erp"."import_batch", "prior" "jsonb", "mutation" "text", "final_state" boolean); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."assert_document_conversion_batch"("next_row" "naijue_erp"."import_batch", "prior" "jsonb", "mutation" "text", "final_state" boolean) FROM PUBLIC;


--
-- Name: FUNCTION "assert_document_migration"("operation" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."assert_document_migration"("operation" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "assert_standard_import_operation"("operation" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."assert_standard_import_operation"("operation" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "assert_unified_current_actor"("account" "uuid", "at_time" timestamp with time zone, "kind" "text", "target" "uuid", "command" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."assert_unified_current_actor"("account" "uuid", "at_time" timestamp with time zone, "kind" "text", "target" "uuid", "command" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."assert_unified_current_actor"("account" "uuid", "at_time" timestamp with time zone, "kind" "text", "target" "uuid", "command" "text") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "guard_exact_historical_customer_current_usage"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_exact_historical_customer_current_usage"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_history_numeric_ledger"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_history_numeric_ledger"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_history_typed_publication"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_history_typed_publication"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_recorded_live_balance_pair"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_recorded_live_balance_pair"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_retained_settlement_identity"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_retained_settlement_identity"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_unified_document"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_unified_document"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_unified_sales_customer_reference"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."guard_unified_sales_customer_reference"() FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_count_map"("value" "jsonb", "expected_keys" "text"[]); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_count_map"("value" "jsonb", "expected_keys" "text"[]) FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_encode"("value" "jsonb", "depth" integer); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_encode"("value" "jsonb", "depth" integer) FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_finish"("scope" "text", "row_count" bigint, "state" "bytea"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_finish"("scope" "text", "row_count" bigint, "state" "bytea") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_fold"("state" "bytea", "row_hash" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_fold"("state" "bytea", "row_hash" "text") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_projection"("relation_name" "text", "original" "jsonb"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_projection"("relation_name" "text", "original" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_projection_columns"("relation_name" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_projection_columns"("relation_name" "text") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_projection_key"("relation_name" "text", "projection" "jsonb"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_projection_key"("relation_name" "text", "projection" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_row_hash"("relation_name" "text", "row_key" "text", "projection" "jsonb"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_row_hash"("relation_name" "text", "row_key" "text", "projection" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "history_closure_seed"("scope" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_closure_seed"("scope" "text") FROM PUBLIC;


--
-- Name: FUNCTION "history_numeric_money"("value" "jsonb", "nonnegative" boolean); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."history_numeric_money"("value" "jsonb", "nonnegative" boolean) FROM PUBLIC;


--
-- Name: FUNCTION "is_exact_historical_customer_only"("target" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."is_exact_historical_customer_only"("target" "uuid") FROM PUBLIC;


--
-- Name: TABLE "audit_change"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT ON TABLE "naijue_erp"."audit_change" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "maintenance_check_category_order"("a" "naijue_erp"."audit_change"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."maintenance_check_category_order"("a" "naijue_erp"."audit_change") FROM PUBLIC;


--
-- Name: FUNCTION "reject_document_runtime_reference_id_update_v1"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."reject_document_runtime_reference_id_update_v1"() TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "reject_immutable_change"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."reject_immutable_change"() FROM PUBLIC;


--
-- Name: FUNCTION "standard_business_ready"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_business_ready"() FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_business_ready"() TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_import_baseline_keys"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_baseline_keys"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_command"("request" "jsonb", "private_parameter" "text", "command_phase" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_command"("request" "jsonb", "private_parameter" "text", "command_phase" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_document_chunk"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_document_chunk"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_identity"("session_token" "text", "role_kind" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_identity"("session_token" "text", "role_kind" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_inspect_target"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_inspect_target"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_master_chunk"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_master_chunk"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_record_proof"("record_id" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_record_proof"("record_id" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_row_intent"("kind" "text", "native_row" "jsonb"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_row_intent"("kind" "text", "native_row" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_import_row_intent"("kind" "text", "native_row" "jsonb") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_import_status"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_status"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_import_verify"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_import_verify"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_initialize_current_admin"("request" "jsonb", "encoded_scrypt" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_initialize_current_admin"("request" "jsonb", "encoded_scrypt" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_inventory_key_id"("warehouse" "uuid", "sku" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_inventory_key_id"("warehouse" "uuid", "sku" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_inventory_key_id"("warehouse" "uuid", "sku" "uuid") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_inventory_key_proof"("warehouse" "uuid", "sku" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_inventory_key_proof"("warehouse" "uuid", "sku" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_inventory_key_proof"("warehouse" "uuid", "sku" "uuid") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_publish_import"("request" "jsonb", "session_token" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_publish_import"("request" "jsonb", "session_token" "text") FROM PUBLIC;


--
-- Name: FUNCTION "standard_whole_package_closed_v2"("root_operation" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_closed_v2"("root_operation" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "standard_whole_package_command_v2"("request" "jsonb", "private_parameter" "text", "command_phase" "text", "root_operation" "uuid", "child_ordinal" integer); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_command_v2"("request" "jsonb", "private_parameter" "text", "command_phase" "text", "root_operation" "uuid", "child_ordinal" integer) FROM PUBLIC;


--
-- Name: FUNCTION "standard_whole_package_context_v2"("root_operation" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_context_v2"("root_operation" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "standard_whole_package_finish_v2"("init_operation" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_finish_v2"("init_operation" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_whole_package_finish_v2"("init_operation" "uuid") TO "erp_unified27_importer_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_whole_package_inspect_v2"("init_request" "jsonb", "encoded_scrypt" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_inspect_v2"("init_request" "jsonb", "encoded_scrypt" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_whole_package_inspect_v2"("init_request" "jsonb", "encoded_scrypt" "text") TO "erp_unified27_initializer_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_whole_package_prepare_v2"("init_request" "jsonb", "encoded_scrypt" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_prepare_v2"("init_request" "jsonb", "encoded_scrypt" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_whole_package_prepare_v2"("init_request" "jsonb", "encoded_scrypt" "text") TO "erp_unified27_initializer_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_whole_package_step_v2"("init_operation" "uuid", "ordinal" integer, "command_phase" "text", "request" "jsonb"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_step_v2"("init_operation" "uuid", "ordinal" integer, "command_phase" "text", "request" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_whole_package_step_v2"("init_operation" "uuid", "ordinal" integer, "command_phase" "text", "request" "jsonb") TO "erp_unified27_importer_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_whole_package_verify_v2"("init_request" "jsonb", "encoded_scrypt" "text"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_whole_package_verify_v2"("init_request" "jsonb", "encoded_scrypt" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_whole_package_verify_v2"("init_request" "jsonb", "encoded_scrypt" "text") TO "erp_unified27_initializer_2393dbc6db9581c2";


--
-- Name: FUNCTION "standard_zero_amount_archive_trace"("sales" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."standard_zero_amount_archive_trace"("sales" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."standard_zero_amount_archive_trace"("sales" "uuid") TO "erp_unified27_importer_2393dbc6db9581c2";


--
-- Name: TABLE "transfer_header"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."transfer_header" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "transfer_line"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."transfer_line" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "unified_document_snapshot"("kind" "text", "target" "uuid"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."unified_document_snapshot"("kind" "text", "target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."unified_document_snapshot"("kind" "text", "target" "uuid") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "sales_header"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."sales_header" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "unified_sales_header_audit_values"("h" "naijue_erp"."sales_header"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."unified_sales_header_audit_values"("h" "naijue_erp"."sales_header") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."unified_sales_header_audit_values"("h" "naijue_erp"."sales_header") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "sales_line"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."sales_line" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "unified_sales_line_audit_values"("ln" "naijue_erp"."sales_line"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."unified_sales_line_audit_values"("ln" "naijue_erp"."sales_line") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."unified_sales_line_audit_values"("ln" "naijue_erp"."sales_line") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "sales_settlement"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "naijue_erp"."sales_settlement" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "unified_sales_settlement_audit_values"("row_value" "naijue_erp"."sales_settlement"); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."unified_sales_settlement_audit_values"("row_value" "naijue_erp"."sales_settlement") FROM PUBLIC;
GRANT ALL ON FUNCTION "naijue_erp"."unified_sales_settlement_audit_values"("row_value" "naijue_erp"."sales_settlement") TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: FUNCTION "validate_document_specification_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_document_specification_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_history_numeric_balance_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_history_numeric_balance_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_history_numeric_receipt_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_history_numeric_receipt_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_recorded_live_balance_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_recorded_live_balance_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_sales_settlement"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_sales_settlement"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_unified_baseline_reversal"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_unified_baseline_reversal"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_unified_ordinary_operation"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_unified_ordinary_operation"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_unified_sales_header_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_unified_sales_header_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_unified_sales_line_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_unified_sales_line_commit"() FROM PUBLIC;


--
-- Name: FUNCTION "validate_unified_sales_settlement_commit"(); Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

REVOKE ALL ON FUNCTION "naijue_erp"."validate_unified_sales_settlement_commit"() FROM PUBLIC;


--
-- Name: TABLE "auth_session"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."auth_session" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "barcode_scheme"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."barcode_scheme" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "barcode_scheme"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."barcode_scheme" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "color"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."color" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "color"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."color" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "customer"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."customer" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "customer"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."customer" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "fit"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."fit" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "fit"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."fit" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "hall"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."hall" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "hall"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."hall" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "import_record"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."import_record" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "inventory_balance"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT,UPDATE ON TABLE "naijue_erp"."inventory_balance" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "inventory_ledger"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT ON TABLE "naijue_erp"."inventory_ledger" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "operation_receipt"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT ON TABLE "naijue_erp"."operation_receipt" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "payment_account"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."payment_account" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "payment_account"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."payment_account" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "payment_account_hall"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."payment_account_hall" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "payment_method"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."payment_method" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "payment_method"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."payment_method" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "product"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("id"),UPDATE("id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."product_code"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("product_code"),UPDATE("product_code") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."name"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("name"),UPDATE("name") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."category_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("category_id"),UPDATE("category_id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."supplier_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("supplier_id"),UPDATE("supplier_id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."season_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("season_id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."size_group_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("size_group_id"),UPDATE("size_group_id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."retail_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("retail_price"),UPDATE("retail_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."enabled"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("enabled"),UPDATE("enabled") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."version"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("version"),UPDATE("version") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."year"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("year"),UPDATE("year") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."system_item_code"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("system_item_code"),UPDATE("system_item_code") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."thickness"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("thickness"),UPDATE("thickness") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."collar_pants_type"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("collar_pants_type"),UPDATE("collar_pants_type") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."purchase_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("purchase_price"),UPDATE("purchase_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale5_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale5_price"),UPDATE("wholesale5_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale6_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale6_price"),UPDATE("wholesale6_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale7_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale7_price"),UPDATE("wholesale7_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale8_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale8_price"),UPDATE("wholesale8_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale9_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale9_price"),UPDATE("wholesale9_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."wholesale10_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("wholesale10_price"),UPDATE("wholesale10_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."minimum_price"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("minimum_price"),UPDATE("minimum_price") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."deleted_at"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("deleted_at"),UPDATE("deleted_at") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."default_barcode_scheme_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("default_barcode_scheme_id"),UPDATE("default_barcode_scheme_id") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product"."season_ids"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("season_ids"),UPDATE("season_ids") ON TABLE "naijue_erp"."product" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "product_category"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."product_category" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product_category"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."product_category" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "product_image"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."product_image" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "product_image"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."product_image" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "runtime_document_number_allocation"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT,INSERT ON TABLE "naijue_erp"."runtime_document_number_allocation" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "runtime_document_number_allocation"."document_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("document_id") ON TABLE "naijue_erp"."runtime_document_number_allocation" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: SEQUENCE "runtime_sales_document_number_seq"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT USAGE ON SEQUENCE "naijue_erp"."runtime_sales_document_number_seq" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: SEQUENCE "runtime_transfer_document_number_seq"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT USAGE ON SEQUENCE "naijue_erp"."runtime_transfer_document_number_seq" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "schema_migration"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."schema_migration" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "season"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."season" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "season"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."season" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "size"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."size" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "size"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."size" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "size_group"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."size_group" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "size_group"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."size_group" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "size_group_member"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."size_group_member" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "size_group_member"."size_group_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("size_group_id") ON TABLE "naijue_erp"."size_group_member" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "sku"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("id"),UPDATE("id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."product_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("product_id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."color_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("color_id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."fit_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("fit_id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."size_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("size_id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."sku_code"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("sku_code") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."enabled"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("enabled"),UPDATE("enabled") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."version"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("version"),UPDATE("version") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku"."created_operation_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("created_operation_id") ON TABLE "naijue_erp"."sku" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "sku_barcode"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("id"),UPDATE("id") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."barcode"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("barcode") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."sku_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("sku_id") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."barcode_kind"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("barcode_kind") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."scheme_id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("scheme_id") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "sku_barcode"."enabled"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT INSERT("enabled"),UPDATE("enabled") ON TABLE "naijue_erp"."sku_barcode" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "staff"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."staff" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "staff"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."staff" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "supplier"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."supplier" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "supplier"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."supplier" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "user_account"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."user_account" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "user_account"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."user_account" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: TABLE "warehouse"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT SELECT ON TABLE "naijue_erp"."warehouse" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- Name: COLUMN "warehouse"."id"; Type: ACL; Schema: naijue_erp; Owner: fresh35_owner_20261105_r1
--

GRANT UPDATE("id") ON TABLE "naijue_erp"."warehouse" TO "erp_unified27_runtime_2393dbc6db9581c2";


--
-- PostgreSQL database dump complete
--

\unrestrict 8nCGyBK1hbYRcBPUD7FvGrKIqcAg9m1IP56VJJ3LMRPh0BNTtb0gGf0B3MKLD1V

