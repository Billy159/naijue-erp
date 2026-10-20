-- VERSION 0005: approved product read fields and controlled image metadata.
-- Review-only additive artifact. NOT executed; no dictionaries, files, backfill, or made-up timestamps.
BEGIN;
ALTER TABLE naijue_erp.product
  ADD COLUMN year integer,
  ADD COLUMN system_item_code text,
  ADD COLUMN thickness text,
  ADD COLUMN collar_pants_type text;
-- Unknown historical values stay NULL. No candidate minimum-price or parallel SKU-price column.
CREATE TABLE naijue_erp.product_image (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES naijue_erp.product(id),
  file_ref text NOT NULL CHECK (length(file_ref) > 0),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  display_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  created_by_account_id uuid REFERENCES naijue_erp.user_account(id),
  version integer NOT NULL CHECK (version > 0)
);
CREATE INDEX product_image_product_order_idx ON naijue_erp.product_image (product_id, display_order, id);
INSERT INTO naijue_erp.schema_migration(version, description)
VALUES (5, 'Approved nullable product read fields and controlled image metadata');
COMMIT;
