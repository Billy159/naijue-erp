-- Applied only in an explicitly selected V2 overlay schema, never source schema.
CREATE TABLE IF NOT EXISTS operator (
 id text PRIMARY KEY, name text NOT NULL, role text NOT NULL CHECK(role='ADMIN'), enabled boolean NOT NULL DEFAULT true
);
INSERT INTO operator VALUES ('local-admin','管理员','ADMIN',true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS document (
 id uuid PRIMARY KEY, document_type text NOT NULL CHECK(document_type IN ('SALE','TRANSFER','PURCHASE')),
 number text NOT NULL, source_identity jsonb, status text NOT NULL CHECK(status IN ('DRAFT','UNAUDITED','APPROVED','DELETED')),
 baseline_was_included boolean NOT NULL, current_effect_active boolean NOT NULL,
 active_effect_identity text, active_effect_revision integer, current_revision integer NOT NULL,
 version integer NOT NULL DEFAULT 1, original_auditor text, original_audited_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='APPROVED')=current_effect_active),
 CHECK (current_effect_active=(active_effect_identity IS NOT NULL)),
 CHECK (current_effect_active=(active_effect_revision IS NOT NULL))
);
-- Existing runtime schemas need the same state constraint as a fresh install.
ALTER TABLE document DROP CONSTRAINT IF EXISTS document_status_check;
ALTER TABLE document ADD CONSTRAINT document_status_check CHECK(status IN ('DRAFT','UNAUDITED','APPROVED','DELETED'));
CREATE TABLE IF NOT EXISTS revision (
 document_id uuid NOT NULL REFERENCES document(id), revision integer NOT NULL,
 original_imported boolean NOT NULL, body jsonb NOT NULL, actor_id text REFERENCES operator(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,revision)
);
CREATE TABLE IF NOT EXISTS idempotency_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL REFERENCES operator(id),
 command_scope text NOT NULL, idempotency_key text NOT NULL, payload_hash text NOT NULL,
 response jsonb, completed_at timestamptz,
 UNIQUE(actor_id,command_scope,idempotency_key)
);
CREATE TABLE IF NOT EXISTS posting (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES document(id), revision integer NOT NULL,
 reason text NOT NULL CHECK(reason IN ('BASELINE_EFFECT_REVERSAL','REVISION_APPROVAL','ACTIVE_EFFECT_REVERSAL')),
 reversed_effect_identity text, actor_id text NOT NULL REFERENCES operator(id),
 request_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS movement (
 posting_id uuid NOT NULL REFERENCES posting(id), line_index integer NOT NULL,
 warehouse_id uuid NOT NULL, sku_id uuid NOT NULL, quantity numeric(18,4) NOT NULL,
 PRIMARY KEY(posting_id,line_index,warehouse_id)
);
CREATE TABLE IF NOT EXISTS inventory_delta (
 warehouse_id uuid NOT NULL, sku_id uuid NOT NULL, quantity numeric(18,4) NOT NULL,
 PRIMARY KEY(warehouse_id,sku_id)
);
-- Basic-setting references created or disabled in the V2 Demo. Source T+ rows stay immutable.
CREATE TABLE IF NOT EXISTS master_reference_overlay (
 kind text NOT NULL CHECK(kind IN ('warehouses','payments','fundAccounts')),
 id uuid NOT NULL, name text NOT NULL, enabled boolean NOT NULL,
 method_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS version_history (
 document_id uuid NOT NULL REFERENCES document(id), version integer NOT NULL,
 operation text NOT NULL, revision integer NOT NULL, actor_id text NOT NULL REFERENCES operator(id),
 request_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,version)
);
CREATE INDEX IF NOT EXISTS movement_key ON movement(warehouse_id,sku_id);
CREATE INDEX IF NOT EXISTS document_type_number ON document(document_type,number);
-- Search and display dates use a day-only projection. Imported revisions remain immutable.
ALTER TABLE document ADD COLUMN IF NOT EXISTS business_day date;
UPDATE document d SET business_day=left(r.body->'header'->>'business_date',10)::date
FROM revision r WHERE r.document_id=d.id AND r.revision=d.current_revision AND d.business_day IS NULL
 AND r.body->'header'->>'business_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';
CREATE INDEX IF NOT EXISTS document_type_day ON document(document_type,business_day DESC);
-- Revisions are append-only, including original imported source snapshots.
CREATE OR REPLACE FUNCTION deny_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_REVISION'; END $$;
CREATE OR REPLACE TRIGGER revision_immutable BEFORE UPDATE OR DELETE ON revision FOR EACH ROW EXECUTE FUNCTION deny_revision_mutation();
ALTER TABLE idempotency_request ADD COLUMN IF NOT EXISTS document_id uuid;
ALTER TABLE idempotency_request ADD COLUMN IF NOT EXISTS expected_version integer;
ALTER TABLE idempotency_request ADD COLUMN IF NOT EXISTS operation text;
ALTER TABLE idempotency_request ADD COLUMN IF NOT EXISTS committed_state text;
CREATE TABLE IF NOT EXISTS edit_lease(document_key text PRIMARY KEY,token text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS work_record(document_key text NOT NULL,id text NOT NULL,body jsonb NOT NULL,actor_id text NOT NULL REFERENCES operator(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_key,id));
CREATE TABLE IF NOT EXISTS work_event(document_key text NOT NULL,id text NOT NULL,body jsonb NOT NULL,actor_id text NOT NULL REFERENCES operator(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_key,id));
-- Demo-owned media overlay. Historical T+ product rows remain unchanged.
CREATE TABLE IF NOT EXISTS product_image (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL,
 path text NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 media_type text NOT NULL, role text NOT NULL, color_name text,
 name text NOT NULL, sort_order integer NOT NULL,
 UNIQUE(product_id,role,name,sha256)
);
CREATE INDEX IF NOT EXISTS product_image_product_order ON product_image(product_id,sort_order);
-- Editable V2 product profile. T+ product and SKU source rows remain immutable.
CREATE TABLE IF NOT EXISTS product_profile_overlay (
 product_id uuid PRIMARY KEY, body jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_overlay (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE, body jsonb NOT NULL,
 deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_overlay_active_code ON product_overlay(code) WHERE deleted=false;
CREATE SEQUENCE IF NOT EXISTS product_item_code_seq START WITH 9000000 MAXVALUE 9999999;
CREATE TABLE IF NOT EXISTS product_barcode_alias (
 barcode text PRIMARY KEY, product_id uuid NOT NULL, sku_id uuid NOT NULL,
 historical_note text NOT NULL DEFAULT '', origin text NOT NULL DEFAULT 'MIGRATED',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_barcode_alias ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'MIGRATED';
CREATE INDEX IF NOT EXISTS product_barcode_alias_product ON product_barcode_alias(product_id);
-- V2-owned product master edits. Imported T+ reference rows remain immutable.
CREATE TABLE IF NOT EXISTS product_master_overlay (
 kind text NOT NULL CHECK(kind IN ('categories','colors','groups','fits','seasons')),
 id text NOT NULL, body jsonb NOT NULL, deleted boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS generated_barcode (
 sku_id uuid PRIMARY KEY, product_id uuid NOT NULL, barcode text UNIQUE NOT NULL,
 scheme_id text NOT NULL, evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Exact strings from the user-approved workbook; old C8/C9 generators are superseded.
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
CREATE TABLE IF NOT EXISTS barcode_scheme_supplement (
 sku_id uuid PRIMARY KEY,product_id uuid NOT NULL,revision text NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','EXCEPTION','NOT_REQUIRED')),
 barcode text,record jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='barcode_scheme_supplement'::regclass AND conname='barcode_scheme_supplement_status_check' AND position('NOT_REQUIRED' in pg_get_constraintdef(oid))>0) THEN
  ALTER TABLE barcode_scheme_supplement DROP CONSTRAINT IF EXISTS barcode_scheme_supplement_status_check;
  ALTER TABLE barcode_scheme_supplement ADD CONSTRAINT barcode_scheme_supplement_status_check CHECK(status IN ('ACTIVE','EXCEPTION','NOT_REQUIRED'));
 END IF;
END $$;
-- New size combinations belong to the V2 overlay; imported T+ variants remain unchanged.
CREATE TABLE IF NOT EXISTS size_overlay (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_name text NOT NULL, name text NOT NULL,
 UNIQUE(group_name,name)
);
CREATE TABLE IF NOT EXISTS variant_overlay (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL, color_id uuid NOT NULL,
 size_id uuid NOT NULL, fit_id text NOT NULL DEFAULT 'A', size_name text NOT NULL, size_code text NOT NULL DEFAULT '', group_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,color_id,size_id,fit_id)
);
ALTER TABLE variant_overlay ADD COLUMN IF NOT EXISTS fit_id text NOT NULL DEFAULT 'A';
ALTER TABLE variant_overlay ADD COLUMN IF NOT EXISTS size_code text NOT NULL DEFAULT '';
ALTER TABLE variant_overlay DROP CONSTRAINT IF EXISTS variant_overlay_product_id_color_id_size_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS variant_overlay_identity ON variant_overlay(product_id,color_id,size_id,fit_id);
CREATE INDEX IF NOT EXISTS variant_overlay_product ON variant_overlay(product_id);
