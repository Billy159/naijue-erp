-- Exact26 v10: isolate polymorphic NEW/OLD record field access by table.
-- Implements the already-authorized original warehouse/SKU creation semantics.
-- Original migrations, authority, evidence, immutable identity and predicates retained.
-- C owns actual PostgreSQL apply/readback; C80 original failure/key is preserved.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.guard_native_creation_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; family text;
BEGIN
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
      AND s.employment_status='在职' AND s.role IN ('ADMIN','WAREHOUSE') AND (s.hall_id IS NULL OR h.enabled)) THEN
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
COMMIT;
