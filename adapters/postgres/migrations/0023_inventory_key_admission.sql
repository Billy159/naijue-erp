-- C01-20261022-v1 group C: exactly two immutable creation columns.
-- SQL SOURCE ONLY. No runtime prefix is admitted until coordinated engine,
-- function/trigger/ACL verification supplies an independent exact23/24 capability.
BEGIN;
ALTER TABLE naijue_erp.warehouse ADD COLUMN created_operation_id uuid REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.sku ADD COLUMN created_operation_id uuid REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION naijue_erp.native_creation_operation_valid(kind text,target uuid,operation uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE receipt naijue_erp.operation_receipt%ROWTYPE; audit naijue_erp.audit_change%ROWTYPE; item jsonb; actual jsonb;
BEGIN
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

CREATE FUNCTION naijue_erp.guard_native_creation_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; family text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id THEN
      RAISE EXCEPTION 'Retained native identity cannot acquire or replace a creation operation' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='sku' AND ROW(NEW.product_id,NEW.color_id,NEW.fit_id,NEW.size_id,NEW.sku_code)
      IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id,OLD.size_id,OLD.sku_code) THEN
      RAISE EXCEPTION 'Retained SKU coordinates and code cannot be rebound' USING ERRCODE='23514';
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
      AND s.employment_status='在职' AND s.role IN ('ADMIN','WAREHOUSE') AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'Native creation requires current trusted maintenance authority and same-transaction prepared audit' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='warehouse' AND (audit.object_id<>NEW.id OR audit.action<>'CREATE') THEN
    RAISE EXCEPTION 'Warehouse creation operation targets another root' USING ERRCODE='23514';
  ELSIF TG_TABLE_NAME='sku' AND audit.object_id<>NEW.product_id THEN
    RAISE EXCEPTION 'SKU creation operation targets another product' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION naijue_erp.validate_native_creation_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.created_operation_id IS NOT NULL AND NOT naijue_erp.native_creation_operation_valid(
    CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' ELSE 'SKU' END,NEW.id,NEW.created_operation_id) THEN
    RAISE EXCEPTION 'Exact native creation operation, root audit and receipt did not close' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER warehouse_creation_identity BEFORE INSERT OR UPDATE ON naijue_erp.warehouse FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_creation_identity();
CREATE TRIGGER sku_creation_identity BEFORE INSERT OR UPDATE ON naijue_erp.sku FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_creation_identity();
CREATE CONSTRAINT TRIGGER warehouse_creation_final_consistency AFTER INSERT ON naijue_erp.warehouse
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_native_creation_commit();
CREATE CONSTRAINT TRIGGER sku_creation_final_consistency AFTER INSERT ON naijue_erp.sku
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_native_creation_commit();

CREATE FUNCTION naijue_erp.inventory_key_admission(warehouse uuid,sku uuid)
RETURNS TABLE(admitted boolean,published_batch_id uuid,warehouse_basis text,sku_basis text,warehouse_created_operation_id uuid,sku_created_operation_id uuid)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE batches uuid[]; batch naijue_erp.import_batch%ROWTYPE; valid_sku boolean;
BEGIN
  admitted:=false; published_batch_id:=NULL; warehouse_basis:=NULL; sku_basis:=NULL;
  warehouse_created_operation_id:=NULL; sku_created_operation_id:=NULL;
  SELECT array_agg(id ORDER BY id) INTO batches FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE';
  IF coalesce(cardinality(batches),0)<>1 THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO STRICT batch FROM naijue_erp.import_batch WHERE id=batches[1];
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
CREATE FUNCTION naijue_erp.inventory_runtime_key_admitted(warehouse uuid,sku uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,naijue_erp AS $$ SELECT admitted FROM naijue_erp.inventory_key_admission(warehouse,sku) $$;

-- The following three reviewed bodies preserve baseline import, original
-- receipt/audit/line/reversal checks, effect-count versions and key lock ordering.
-- Only the runtime membership call changes; published_inventory_key stays intact.
CREATE OR REPLACE FUNCTION naijue_erp.guard_cutoff_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
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
    IF r.action <> 'APPROVE' OR r.status <> 'COMMITTED' OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
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
      OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id)
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

INSERT INTO naijue_erp.schema_migration(version,description) VALUES(23,'C01-v1 immutable post-cutoff native creation and independent exact key admission');
COMMIT;
