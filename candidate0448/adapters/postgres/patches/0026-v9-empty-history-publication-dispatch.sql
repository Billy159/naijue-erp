-- User approved v7 empty-history initial publication dispatch, 2026-10-23.
-- Exact26 successor: 26_v9_empty_history_publication_dispatch.
-- One existing function only; original migrations and v8 bootstrap stay unchanged.
-- C owns installation, exact target readback and original PUBLISH continuation.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.guard_successor_publication26() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE original_source naijue_erp.import_source_row%ROWTYPE; target uuid; matched bigint;
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  -- Original19 conservation, typed closure, approval/audit/accounting and no-STAGED
  -- visibility guards remain enabled. This adds actual successor-field readback.
  FOR original_source IN SELECT * FROM naijue_erp.import_source_row WHERE batch_id=NEW.id AND entity_type='PRODUCT' ORDER BY id FOR SHARE LOOP
    PERFORM naijue_erp.assert_native_product_season_source(original_source);
  END LOOP;
  -- Only a complete, genuinely customer/history-free first baseline has no
  -- historical supplement to prove. Missing or unknown declarations never match.
  -- Original19 still independently re-reads the whole closure and FINAL facts.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_history_closure_manifest m
      WHERE m.batch_id=NEW.id AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
        AND m.selection_sha256=NEW.source_hash AND m.authorized_payload_hash=NEW.history_payload_hash
        AND m.expected_counts=NEW.history_expected_counts AND m.document_count=0
        AND m.source_entity_counts @> '{"CUSTOMER":0,"SALES_HEADER":0,"SALES_LINE":0,"SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0}'::jsonb
        AND m.expected_counts @> '{"history_sales_header":0,"history_sales_line":0,"history_sales_settlement":0,"history_transfer_header":0,"history_transfer_line":0}'::jsonb)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id<>NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN('CUSTOMER','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'))
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_history_document_manifest WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.customer)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e
      WHERE e.entity_type='CUSTOMER' OR e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference
      WHERE entity_type='CUSTOMER' OR native_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s
      WHERE s.field_provenance->>'native_customer_id' IS NOT NULL
        OR s.file_ref='dictionaries/historical-customers.json'
        OR s.field_provenance->'history_header_reference_staging'->'selection'->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  -- The two original identities form one reviewed supplement; neither can be
  -- omitted, replaced, promoted to current business or attached to another batch.
  FOREACH target IN ARRAY ARRAY['2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid] LOOP
    PERFORM naijue_erp.is_exact_historical_customer_only(target);
    SELECT count(*) INTO matched FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
      WHERE e.batch_id=NEW.id AND e.entity_type='CUSTOMER' AND e.native_id=target
        AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
    IF matched<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h
      JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
      JOIN naijue_erp.import_source_row cs ON cs.batch_id=h.batch_id AND cs.entity_type='CUSTOMER'
        AND cs.field_provenance->>'native_customer_id'=target::text
      WHERE h.batch_id=NEW.id AND h.customer_id=target AND h.number=cs.raw_fields->>'sourceDocumentNumber')
      OR EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id=target)
      OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id=target) THEN
      RAISE EXCEPTION 'Both exact historical customers must close with their original history and no current usage' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
COMMIT;
