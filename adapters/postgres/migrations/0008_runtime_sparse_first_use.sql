-- VERSION 0008: bounded runtime SALES/TRANSFER sparse first use. SQL SOURCE ONLY, NOT ENGINE EVIDENCE.
-- Replaces exactly two guard bodies. No table/column/index/trigger changes, no business data or zero seeds.
-- Historical commands, native catalogue CREATE proof and missing-balance UNAPPROVE remain closed.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.validate_sparse_balance_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE; baseline naijue_erp.inventory_ledger%ROWTYPE;
  b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; total numeric; effects bigint;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF TG_OP = 'UPDATE' THEN
    IF r.target_type = 'IMPORT' THEN RAISE EXCEPTION 'an import receipt cannot overwrite existing stock' USING ERRCODE = '23514'; END IF;
    -- Preserve existing native SALES/TRANSFER transaction contracts and validators.
    RETURN NULL;
  END IF;
  IF r.target_type IN ('SALES', 'TRANSFER') THEN
    -- ONLY a first runtime approval may turn proven absence into an actual native balance.
    IF r.action <> 'APPROVE' OR r.status <> 'COMMITTED' OR NOT naijue_erp.published_inventory_key(NEW.warehouse_id, NEW.sku_id) THEN
      RAISE EXCEPTION 'first native balance requires published runtime approval' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE';
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
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = r.id;
    IF a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id
      OR a.action IS DISTINCT FROM 'APPROVE' OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.new_version::text IS DISTINCT FROM r.result_data->>'version' OR a.old_version + 1 IS DISTINCT FROM a.new_version THEN
      RAISE EXCEPTION 'first native balance requires exact native receipt and audit' USING ERRCODE = '23514'; END IF;
    IF (r.target_type = 'SALES' AND NOT EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version))
      OR (r.target_type = 'TRANSFER' AND NOT EXISTS (SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version)) THEN
      RAISE EXCEPTION 'first native balance cannot use cutoff history or another document' USING ERRCODE = '23514'; END IF;
    -- Prior used keys are retained by ledger_retains_balance. Never rebuild missing history from zero.
    IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.operation_id = r.id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id
          AND (l.event_kind <> 'APPROVE' OR l.reverses_entry_id IS NOT NULL OR l.source_import_batch_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_effect() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; ln naijue_erp.transfer_line%ROWTYPE;
  original naijue_erp.inventory_ledger%ROWTYPE; expected_delta numeric;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id FOR SHARE;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = ln.transfer_id FOR UPDATE;
  expected_delta := CASE NEW.endpoint WHEN 'FROM' THEN -ln.quantity::numeric WHEN 'TO' THEN ln.quantity::numeric ELSE NULL END;
  IF NEW.event_kind = 'UNAPPROVE' THEN expected_delta := -expected_delta; END IF;
  IF h.stock_basis <> 'RUNTIME_LEDGER' OR NOT ln.is_current OR ln.sku_id <> NEW.sku_id
    OR NEW.warehouse_id IS DISTINCT FROM (CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END)
    OR NEW.quantity_delta::numeric IS DISTINCT FROM expected_delta OR h.business_date <> NEW.business_date
    OR h.version::bigint + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime transfer source or endpoint effect' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id FOR UPDATE;
  IF NOT FOUND THEN
    IF NEW.event_kind <> 'APPROVE' OR NEW.reverses_entry_id IS NOT NULL
      OR NOT naijue_erp.published_inventory_key(NEW.warehouse_id, NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'transfer inventory coverage is not ready' USING ERRCODE = '23514'; END IF;
    -- The deferred sparse INSERT validator requires this exact operation's native receipt/audit and final real delta.
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' THEN
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

INSERT INTO naijue_erp.schema_migration (version, description) VALUES (8, 'Exact published-zero first runtime approval; native atomic effects only; SQL source only');
COMMIT;
