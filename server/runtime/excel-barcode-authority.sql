-- Approved Excel strings replace inferred historical barcode bindings only.
CREATE TABLE IF NOT EXISTS barcode_authority_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision text NOT NULL, source_sha256 text NOT NULL, body jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS barcode_authority_product (
 product_id uuid PRIMARY KEY, code text NOT NULL, origin text NOT NULL
);
CREATE TABLE IF NOT EXISTS barcode_authority_record (
 sku_id uuid PRIMARY KEY, product_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','DUPLICATE_REMOVED')),
 original_barcode text NOT NULL, record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS barcode_authority_record_product ON barcode_authority_record(product_id);
