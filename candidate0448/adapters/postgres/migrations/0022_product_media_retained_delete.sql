-- C01-20261022-v1 group B: exactly seven columns; no original-data backfill.
-- SQL source only. Runtime field consumers and execution are separately gated.
BEGIN;
ALTER TABLE naijue_erp.product_image
  ADD COLUMN image_role text,
  ADD COLUMN color_id uuid REFERENCES naijue_erp.color(id),
  ADD CONSTRAINT product_image_closed_role CHECK (image_role IS NULL OR image_role IN ('MAIN','WHITE_BACKGROUND','HANG_TAG','DETAIL','COLOR')),
  ADD CONSTRAINT product_image_role_color CHECK (
    (image_role='COLOR' AND color_id IS NOT NULL)
    OR (image_role IS DISTINCT FROM 'COLOR' AND color_id IS NULL));
CREATE UNIQUE INDEX product_color_image_unique ON naijue_erp.product_image(product_id,color_id) WHERE image_role='COLOR';
ALTER TABLE naijue_erp.product ADD COLUMN deleted_at timestamptz,
  ADD COLUMN default_barcode_scheme_id uuid REFERENCES naijue_erp.barcode_scheme(id) ON DELETE NO ACTION;
ALTER TABLE naijue_erp.product_category ADD COLUMN deleted_at timestamptz;
ALTER TABLE naijue_erp.color ADD COLUMN deleted_at timestamptz;
ALTER TABLE naijue_erp.fit ADD COLUMN deleted_at timestamptz;

CREATE FUNCTION naijue_erp.guard_product_image_color() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.image_role='COLOR' AND NOT EXISTS(SELECT 1 FROM naijue_erp.sku
    WHERE product_id=NEW.product_id AND color_id=NEW.color_id) THEN
    RAISE EXCEPTION 'Color image must use an actual color of this product' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_image_color_membership BEFORE INSERT OR UPDATE ON naijue_erp.product_image
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_product_image_color();

-- The retained row remains the target of every historical/receipt FK. DELETE is
-- an irreversible visibility change, never a physical/recursive deletion.
CREATE FUNCTION naijue_erp.guard_retained_catalogue_delete() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retained catalogue identity cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'New catalogue identity cannot start deleted' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Deleted catalogue identity cannot be restored or changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_retained_delete BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.product
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_delete();
CREATE TRIGGER category_retained_delete BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.product_category
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_delete();
CREATE TRIGGER color_retained_delete BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.color
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_delete();
CREATE TRIGGER fit_retained_delete BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.fit
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_delete();

CREATE FUNCTION naijue_erp.assert_retained_sku_reference(target_sku uuid) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
DECLARE valid boolean;
BEGIN
  SELECT p.deleted_at IS NULL AND c.deleted_at IS NULL AND f.deleted_at IS NULL AND pc.deleted_at IS NULL INTO STRICT valid
    FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
    JOIN naijue_erp.product_category pc ON pc.id=p.category_id
    JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id
    WHERE s.id=target_sku FOR SHARE OF s,p,pc,c,f;
  IF NOT valid THEN RAISE EXCEPTION 'Deleted catalogue identity cannot authorize new usage' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION naijue_erp.guard_retained_catalogue_reference() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
DECLARE valid boolean;
BEGIN
  IF TG_TABLE_NAME='product' THEN
    IF TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      SELECT deleted_at IS NULL INTO STRICT valid FROM naijue_erp.product_category WHERE id=NEW.category_id FOR SHARE;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted category cannot be selected' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='product_category' THEN
    IF NEW.parent_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
      SELECT deleted_at IS NULL INTO STRICT valid FROM naijue_erp.product_category WHERE id=NEW.parent_id FOR SHARE;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted parent category cannot be selected' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='sku' THEN
    IF TG_OP='INSERT' OR ROW(NEW.product_id,NEW.color_id,NEW.fit_id) IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id)
      OR (NOT OLD.enabled AND NEW.enabled) THEN
      SELECT p.deleted_at IS NULL AND pc.deleted_at IS NULL AND c.deleted_at IS NULL AND f.deleted_at IS NULL INTO STRICT valid
        FROM naijue_erp.product p JOIN naijue_erp.product_category pc ON pc.id=p.category_id
        CROSS JOIN naijue_erp.color c CROSS JOIN naijue_erp.fit f
        WHERE p.id=NEW.product_id AND c.id=NEW.color_id AND f.id=NEW.fit_id FOR SHARE OF p,pc,c,f;
      IF NOT valid THEN RAISE EXCEPTION 'Deleted catalogue identity cannot be selected by SKU' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('sales_line','transfer_line') THEN
    IF TG_OP='INSERT' OR NEW.sku_id IS DISTINCT FROM OLD.sku_id OR (NOT OLD.is_current AND NEW.is_current) THEN
      PERFORM naijue_erp.assert_retained_sku_reference(NEW.sku_id);
    END IF;
  ELSIF TG_TABLE_NAME='inventory_ledger' THEN
    IF NEW.event_kind='APPROVE' THEN PERFORM naijue_erp.assert_retained_sku_reference(NEW.sku_id); END IF;
  ELSE RAISE EXCEPTION 'Unsupported retained reference guard' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_retained_reference BEFORE INSERT OR UPDATE ON naijue_erp.product
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();
CREATE TRIGGER category_retained_reference BEFORE INSERT OR UPDATE ON naijue_erp.product_category
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();
CREATE TRIGGER sku_retained_reference BEFORE INSERT OR UPDATE ON naijue_erp.sku
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();
CREATE TRIGGER sales_line_retained_reference BEFORE INSERT OR UPDATE ON naijue_erp.sales_line
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();
CREATE TRIGGER transfer_line_retained_reference BEFORE INSERT OR UPDATE ON naijue_erp.transfer_line
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();
CREATE TRIGGER ledger_retained_reference BEFORE INSERT ON naijue_erp.inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_retained_catalogue_reference();

INSERT INTO naijue_erp.schema_migration(version,description)
VALUES(22,'C01-v1 explicit product image roles/default scheme and retained catalogue deletion');
COMMIT;
