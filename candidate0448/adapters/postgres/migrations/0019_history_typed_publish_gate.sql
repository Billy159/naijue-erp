BEGIN;
-- Additive successor only: migrations1–18 and their historical evidence stay fixed.
-- Application/source authorization, exact19 runtime pins and original accounting
-- transaction are independent requirements. Installing this DDL grants no caller access.
CREATE OR REPLACE FUNCTION naijue_erp.guard_history_typed_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE m naijue_erp.import_history_closure_manifest%ROWTYPE;plan jsonb;documents jsonb;
BEGIN
 IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND NEW.status='IMPORTED' THEN
  IF TG_OP<>'UPDATE' THEN
   RAISE EXCEPTION 'history19 publication requires existing selected batch' USING ERRCODE='23514'; END IF;
  IF OLD.status NOT IN('STAGED','VALIDATING') OR NEW.history_validation_passed IS DISTINCT FROM TRUE
   OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts
   OR NEW.checkpoint->'counts' IS DISTINCT FROM NEW.checkpoint->'expected'
   OR NEW.checkpoint->'counts'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   OR NEW.completed_at IS NULL THEN
   RAISE EXCEPTION 'history19 complete original accounting and readback required' USING ERRCODE='23514'; END IF;
  SELECT * INTO m FROM naijue_erp.import_history_closure_manifest WHERE batch_id=NEW.id;
  IF NOT FOUND OR m.validator_version<>'HISTORY_TYPED_CLOSURE_V1'
   OR m.selection_sha256 IS DISTINCT FROM NEW.source_hash
   OR m.authorized_payload_hash IS DISTINCT FROM NEW.history_payload_hash
   OR m.expected_counts IS DISTINCT FROM NEW.history_expected_counts THEN
   RAISE EXCEPTION 'history19 immutable selected closure manifest required' USING ERRCODE='23514'; END IF;
  plan:=jsonb_build_object('version',m.validator_version,'selectionSha256',m.selection_sha256,'authorizedPayloadHash',m.authorized_payload_hash,
   'sourceManifestSha256',m.source_manifest_sha256,'typedManifestSha256',m.typed_manifest_sha256,'documentManifestSha256',m.document_manifest_sha256,
   'expectedCounts',m.expected_counts,'sourceEntityCounts',m.source_entity_counts,'documentCount',m.document_count);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',d.document_kind,'sourceKey',d.source_key,'headerSourceRowId',d.header_source_row_id::text,
   'headerId',COALESCE(d.sales_header_id,d.transfer_header_id)::text,'headerSourceSha256',d.header_source_sha256,'lineCount',d.line_count,
   'settlementCount',d.settlement_count,'sourceDocumentSha256',d.source_document_sha256,'typedDocumentSha256',d.typed_document_sha256)
   ORDER BY d.document_kind,COALESCE(d.sales_header_id,d.transfer_header_id)),'[]'::jsonb) INTO documents
   FROM naijue_erp.import_history_document_manifest d WHERE d.batch_id=NEW.id;
  -- Independently recompute complete SQL fields, bidirectional source/typed
  -- coverage, global and per-document roots. No count or passed flag shortcut.
  PERFORM naijue_erp.assert_history_typed_closure(NEW.id,plan,documents);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION naijue_erp.guard_history_typed_publication() FROM PUBLIC;
INSERT INTO naijue_erp.schema_migration(version,description) VALUES(19,'Exact immutable typed history publication readback; original FINAL accounting/receipt/audit transaction retained');
COMMIT;
