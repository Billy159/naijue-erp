-- Applied only in an explicitly selected V2 overlay schema, never source schema.
CREATE TABLE IF NOT EXISTS operator (
 id text PRIMARY KEY, name text NOT NULL, role text NOT NULL CHECK(role='ADMIN'), enabled boolean NOT NULL DEFAULT true
);
INSERT INTO operator VALUES ('local-admin','管理员','ADMIN',true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS document (
 id uuid PRIMARY KEY, document_type text NOT NULL CHECK(document_type IN ('SALE','TRANSFER','PURCHASE')),
 number text NOT NULL, source_identity jsonb, status text NOT NULL CHECK(status IN ('DRAFT','UNAUDITED','APPROVED')),
 baseline_was_included boolean NOT NULL, current_effect_active boolean NOT NULL,
 active_effect_identity text, active_effect_revision integer, current_revision integer NOT NULL,
 version integer NOT NULL DEFAULT 1, original_auditor text, original_audited_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='APPROVED')=current_effect_active),
 CHECK (current_effect_active=(active_effect_identity IS NOT NULL)),
 CHECK (current_effect_active=(active_effect_revision IS NOT NULL))
);
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
CREATE TABLE IF NOT EXISTS version_history (
 document_id uuid NOT NULL REFERENCES document(id), version integer NOT NULL,
 operation text NOT NULL, revision integer NOT NULL, actor_id text NOT NULL REFERENCES operator(id),
 request_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,version)
);
CREATE INDEX IF NOT EXISTS movement_key ON movement(warehouse_id,sku_id);
CREATE INDEX IF NOT EXISTS document_type_number ON document(document_type,number);
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
