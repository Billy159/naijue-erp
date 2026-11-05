-- Whole-transaction deferred checkpoints retain exact immutable prefix counts.
BEGIN;
DO $parent$ BEGIN IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)'::regprocedure) IS DISTINCT FROM 'c5b7a0b4d44748df3e19491c3426d547de331385a58c839a76aea90cd5e1c2ff' THEN RAISE EXCEPTION 'WHOLE_CONVERSION_PARENT_DIFFERS'; END IF; END $parent$;
CREATE OR REPLACE FUNCTION naijue_erp.assert_document_conversion_batch(next_row naijue_erp.import_batch, prior jsonb, mutation text, final_state boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
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
END $$;
COMMIT;
