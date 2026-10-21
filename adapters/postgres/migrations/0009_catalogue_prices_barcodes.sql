-- VERSION 0009: already-approved whole-product nine prices and raw barcode authority.
-- SQL SOURCE ONLY. Not executed; no production migration, seeds, import, codes or defaults.
-- Apply 0001-0008, THEN 0009 while product is still empty, BEFORE first product creation/import.
-- This deliberately is NOT an upgrade/backfill for an already-populated product catalogue.
BEGIN;
LOCK TABLE naijue_erp.product IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE installed integer[];
BEGIN
  SELECT array_agg(version ORDER BY version) INTO installed FROM naijue_erp.schema_migration;
  IF installed IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8] THEN
    RAISE EXCEPTION 'catalogue authority requires the exact reviewed 0001-0008 prefix' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.product) THEN
    RAISE EXCEPTION 'catalogue authority requires an empty product table before first validated import' USING ERRCODE = '23514';
  END IF;
END;
$$;

-- retail_price already represents frozen Demo `price`. No SKU price authority.
-- NULL is only an explicitly confirmed unset input in the validated creation/import path.
-- Missing source keys are unknown and must fail that path's nine-key completeness gate.
ALTER TABLE naijue_erp.product
  ADD COLUMN purchase_price decimal(18,2) CHECK (purchase_price >= 0),
  ADD COLUMN wholesale5_price decimal(18,2) CHECK (wholesale5_price >= 0),
  ADD COLUMN wholesale6_price decimal(18,2) CHECK (wholesale6_price >= 0),
  ADD COLUMN wholesale7_price decimal(18,2) CHECK (wholesale7_price >= 0),
  ADD COLUMN wholesale8_price decimal(18,2) CHECK (wholesale8_price >= 0),
  ADD COLUMN wholesale9_price decimal(18,2) CHECK (wholesale9_price >= 0),
  ADD COLUMN wholesale10_price decimal(18,2) CHECK (wholesale10_price >= 0),
  ADD COLUMN minimum_price decimal(18,2) CHECK (minimum_price >= 0);

-- Read-only scheme descriptions, not an executable rule engine or maintenance API.
CREATE TABLE naijue_erp.barcode_scheme (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  barcode_type text NOT NULL CHECK (length(btrim(barcode_type)) > 0),
  rule_description text NOT NULL CHECK (length(btrim(rule_description)) > 0),
  code_length integer CHECK (code_length > 0),
  rule_version text NOT NULL CHECK (length(btrim(rule_version)) > 0),
  status text NOT NULL CHECK (status IN ('CURRENT', 'HISTORICAL'))
);
CREATE TABLE naijue_erp.sku_barcode (
  id uuid PRIMARY KEY,
  barcode text COLLATE "C" NOT NULL UNIQUE CHECK (length(barcode) > 0),
  sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id),
  barcode_kind text NOT NULL CHECK (barcode_kind IN ('MAIN', 'CONFIRMED_OLD')),
  scheme_id uuid REFERENCES naijue_erp.barcode_scheme(id),
  enabled boolean NOT NULL
);
-- Disabled bindings retain their raw identity too: disable is not a cross-SKU rebind.
CREATE UNIQUE INDEX sku_barcode_one_current_main ON naijue_erp.sku_barcode (sku_id)
  WHERE enabled AND barcode_kind = 'MAIN';
CREATE INDEX sku_barcode_target ON naijue_erp.sku_barcode (sku_id, id);
CREATE FUNCTION naijue_erp.keep_barcode_binding_identity() RETURNS trigger LANGUAGE plpgsql
  SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'raw barcode bindings are retained; disable rather than delete' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.barcode IS DISTINCT FROM OLD.barcode OR NEW.sku_id IS DISTINCT FROM OLD.sku_id THEN
    RAISE EXCEPTION 'raw barcode identity and canonical SKU binding cannot be rewritten' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sku_barcode_retains_identity BEFORE UPDATE OR DELETE ON naijue_erp.sku_barcode
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_barcode_binding_identity();

COMMENT ON COLUMN naijue_erp.product.purchase_price IS 'RMB yuan, exact <=2 input decimals; explicitly confirmed unset is NULL, not an unknown-input default.';
COMMENT ON COLUMN naijue_erp.product.minimum_price IS 'Product-uniform minimum; NULL means confirmed unset only after validated nine-price input completeness. Missing facts must fail closed.';
COMMENT ON COLUMN naijue_erp.sku_barcode.barcode IS 'Exact original raw text, including leading zeroes. Never regenerated, trimmed, numeric-converted or rebound across SKUs.';
INSERT INTO naijue_erp.schema_migration (version, description)
VALUES (9, 'Approved product nine-price and retained raw barcode authority; empty catalogue precondition; SQL source only');
COMMIT;
