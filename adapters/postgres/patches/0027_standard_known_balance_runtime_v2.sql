-- SOURCE ONLY; not installed or executed on PostgreSQL. No source data are consulted for ordinary current stock.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $lineage$ DECLARE pin jsonb; BEGIN
 FOR pin IN SELECT value FROM pg_catalog.jsonb_array_elements('[{"signature":"naijue_erp.guard_cutoff_ledger()","sha256":"460592fbf61138bba76de24305b373c2ffc6abf53873d9b502cbabe3cafc9c34"},{"signature":"naijue_erp.guard_recorded_live_balance_pair()","sha256":"950250c9b3c619ac9b407a837cac5a199cf4707fad66eeebda628fffa2814939"},{"signature":"naijue_erp.validate_sparse_balance_commit()","sha256":"248a6f6a8195ab737e5a4e3f95539f1054c0039264898c9939aa9960af789c1c"},{"signature":"naijue_erp.validate_transfer_effect()","sha256":"fb480e5d0b18d3ede9861261ed6523d357cbc51f8b57cf0798c39a72891e5507"}]'::jsonb) LOOP
  IF (SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc p WHERE p.oid=(pin->>'signature')::pg_catalog.regprocedure) IS DISTINCT FROM pin->>'sha256' THEN RAISE EXCEPTION 'STANDARD_KNOWN_BALANCE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $lineage$;
CREATE OR REPLACE FUNCTION naijue_erp.guard_cutoff_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp,pg_temp AS $$
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
CREATE OR REPLACE FUNCTION naijue_erp.guard_recorded_live_balance_pair() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp,pg_temp AS $pair$
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
END $pair$;
CREATE OR REPLACE FUNCTION naijue_erp.validate_sparse_balance_commit() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp,pg_temp AS $$
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
    IF r.action<>'HISTORY_REVISE' OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision x WHERE x.operation_id=r.id
      AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
      RAISE EXCEPTION 'Exact current historical revision required for sparse dispatch' USING ERRCODE='23514'; END IF;
    -- The installed history_numeric_balance_commit validates this exact key/operation.
    RETURN NULL;
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
CREATE OR REPLACE FUNCTION naijue_erp.validate_transfer_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp,pg_temp AS $$
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
COMMIT;
