CREATE TABLE IF NOT EXISTS barcode_scheme_supplement (
 sku_id uuid PRIMARY KEY,
 product_id uuid NOT NULL,
 revision text NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','EXCEPTION','NOT_REQUIRED')),
 barcode text,
 record jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='barcode_scheme_supplement'::regclass AND conname='barcode_scheme_supplement_status_check' AND position('NOT_REQUIRED' in pg_get_constraintdef(oid))>0) THEN
  ALTER TABLE barcode_scheme_supplement DROP CONSTRAINT IF EXISTS barcode_scheme_supplement_status_check;
  ALTER TABLE barcode_scheme_supplement ADD CONSTRAINT barcode_scheme_supplement_status_check CHECK(status IN ('ACTIVE','EXCEPTION','NOT_REQUIRED'));
 END IF;
END $$;
