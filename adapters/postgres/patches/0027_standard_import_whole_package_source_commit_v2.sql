-- SOURCE ONLY; retains per-row source proof and full operation/batch deferred checks.
BEGIN;
DO $lineage$ BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.validate_import_source_commit()'::regprocedure) IS DISTINCT FROM '2d3d13dd739d0a00250fdf7aa20ecb6cdce941b1a941cb4c7512bf7aa8d35403' THEN RAISE EXCEPTION 'WHOLE_SOURCE_COMMIT_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $lineage$;
CREATE OR REPLACE FUNCTION naijue_erp.validate_import_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
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
COMMIT;
