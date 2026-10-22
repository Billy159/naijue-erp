-- C01 supplement v3-A: exactly one product column, zero tables.
-- Source DDL only. Conversion and actual concurrent-reference checks are C-owned.
-- The rejected product_season relation proposal is not implemented.
BEGIN;
ALTER TABLE naijue_erp.product ADD COLUMN season_ids uuid[];
CREATE FUNCTION naijue_erp.valid_product_season_ids(value uuid[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
  SELECT value IS NULL OR CASE WHEN cardinality(value)=0 THEN true
    ELSE array_ndims(value)=1 AND array_lower(value,1)=1
      AND NOT EXISTS(SELECT 1 FROM unnest(value) item WHERE item IS NULL)
      AND cardinality(value)=(SELECT count(DISTINCT item) FROM unnest(value) item)
      AND value=ARRAY(SELECT item FROM unnest(value) item ORDER BY item) END;
$$;
ALTER TABLE naijue_erp.product ADD CONSTRAINT product_season_ids_shape
  CHECK (naijue_erp.valid_product_season_ids(season_ids) IS TRUE);
CREATE INDEX product_season_ids_gin ON naijue_erp.product USING gin(season_ids);

CREATE FUNCTION naijue_erp.guard_product_season_selection() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
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
CREATE TRIGGER product_season_selection BEFORE INSERT OR UPDATE OF season_ids,season_id ON naijue_erp.product
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_product_season_selection();
CREATE FUNCTION naijue_erp.guard_referenced_season_identity() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
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
CREATE TRIGGER season_array_reference BEFORE DELETE OR UPDATE OF id ON naijue_erp.season
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_referenced_season_identity();
CREATE TRIGGER season_array_no_truncate BEFORE TRUNCATE ON naijue_erp.season
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();
INSERT INTO naijue_erp.schema_migration(version,description)
  VALUES(25,'Approved product season_ids array; retained scalar, exact selection and two-way dictionary references');
COMMIT;
