-- REVIEW PROPOSAL ONLY: user approval required before any execution.
CREATE OR REPLACE FUNCTION naijue_erp.guard_maintenance_child_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; child_kind text; root_id uuid; root_version integer; row_before jsonb; row_after jsonb;
  audit naijue_erp.audit_change%ROWTYPE; before_item jsonb; after_item jsonb;
BEGIN
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
END $$;
