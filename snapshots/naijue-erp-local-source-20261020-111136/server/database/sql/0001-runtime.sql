-- Version 0001: structural baseline; no business rows or account seeds.
CREATE FUNCTION __RUNTIME__.deny_revision_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_REVISION'; END $$;

CREATE TABLE __RUNTIME__.barcode_authority_policy (
    singleton boolean DEFAULT true NOT NULL,
    revision text NOT NULL,
    source_sha256 text NOT NULL,
    body jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT barcode_authority_policy_singleton_check CHECK (singleton)
);

CREATE TABLE __RUNTIME__.barcode_authority_product (
    product_id uuid NOT NULL,
    code text NOT NULL,
    origin text NOT NULL
);

CREATE TABLE __RUNTIME__.barcode_authority_record (
    sku_id uuid NOT NULL,
    product_id uuid NOT NULL,
    status text NOT NULL,
    original_barcode text NOT NULL,
    record jsonb NOT NULL,
    CONSTRAINT barcode_authority_record_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DUPLICATE_REMOVED'::text])))
);

CREATE TABLE __RUNTIME__.barcode_scheme_supplement (
    sku_id uuid NOT NULL,
    product_id uuid NOT NULL,
    revision text NOT NULL,
    status text NOT NULL,
    barcode text,
    record jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT barcode_scheme_supplement_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'EXCEPTION'::text, 'NOT_REQUIRED'::text])))
);

CREATE TABLE __RUNTIME__.document (
    id uuid NOT NULL,
    document_type text NOT NULL,
    number text NOT NULL,
    source_identity jsonb,
    status text NOT NULL,
    baseline_was_included boolean NOT NULL,
    current_effect_active boolean NOT NULL,
    active_effect_identity text,
    active_effect_revision integer,
    current_revision integer NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    original_auditor text,
    original_audited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    business_day date,
    CONSTRAINT document_check CHECK (((status = 'APPROVED'::text) = current_effect_active)),
    CONSTRAINT document_check1 CHECK ((current_effect_active = (active_effect_identity IS NOT NULL))),
    CONSTRAINT document_check2 CHECK ((current_effect_active = (active_effect_revision IS NOT NULL))),
    CONSTRAINT document_document_type_check CHECK ((document_type = ANY (ARRAY['SALE'::text, 'TRANSFER'::text, 'PURCHASE'::text]))),
    CONSTRAINT document_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'UNAUDITED'::text, 'APPROVED'::text, 'DELETED'::text])))
);

CREATE TABLE __RUNTIME__.edit_lease (
    document_key text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE __RUNTIME__.generated_barcode (
    sku_id uuid NOT NULL,
    product_id uuid NOT NULL,
    barcode text NOT NULL,
    scheme_id text NOT NULL,
    evidence jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.generated_barcode_retired (
    sku_id uuid NOT NULL,
    product_id uuid NOT NULL,
    barcode text NOT NULL,
    scheme_id text NOT NULL,
    evidence jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.idempotency_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id text NOT NULL,
    command_scope text NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    response jsonb,
    completed_at timestamp with time zone,
    document_id uuid,
    expected_version integer,
    operation text,
    committed_state text
);

CREATE TABLE __RUNTIME__.inventory_opening_cell (
    run_id text NOT NULL,
    warehouse_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    unit text NOT NULL,
    source_cell text NOT NULL,
    source_record jsonb NOT NULL
);

CREATE TABLE __RUNTIME__.inventory_opening_delta_checkpoint (
    run_id text NOT NULL,
    warehouse_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE __RUNTIME__.inventory_opening_run (
    id text NOT NULL,
    source_sha256 text NOT NULL,
    source_file text NOT NULL,
    mode text NOT NULL,
    body jsonb NOT NULL,
    active boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_opening_run_mode_check CHECK ((mode = ANY (ARRAY['DEMO_ONLY'::text, 'CONFIRMED_CUTOVER'::text])))
);

CREATE VIEW __RUNTIME__.inventory_balance_base AS
 WITH active AS (
         SELECT inventory_opening_run.id
           FROM __RUNTIME__.inventory_opening_run
          WHERE inventory_opening_run.active
        ), snapshot_basis AS (
         SELECT inventory_opening_cell.warehouse_id,
            inventory_opening_cell.sku_id AS variant_id,
            inventory_opening_cell.quantity
           FROM __RUNTIME__.inventory_opening_cell
          WHERE (inventory_opening_cell.run_id IN ( SELECT active.id
                   FROM active))
        UNION ALL
         SELECT inventory_opening_delta_checkpoint.warehouse_id,
            inventory_opening_delta_checkpoint.sku_id,
            (- inventory_opening_delta_checkpoint.quantity)
           FROM __RUNTIME__.inventory_opening_delta_checkpoint
          WHERE (inventory_opening_delta_checkpoint.run_id IN ( SELECT active.id
                   FROM active))
        )
 SELECT tplus_inventory_balance_source.warehouse_id,
    tplus_inventory_balance_source.variant_id,
    tplus_inventory_balance_source.quantity
   FROM __SOURCE__.tplus_inventory_balance_source
  WHERE (NOT (EXISTS ( SELECT 1
           FROM active)))
UNION ALL
 SELECT snapshot_basis.warehouse_id,
    snapshot_basis.variant_id,
    sum(snapshot_basis.quantity) AS quantity
   FROM snapshot_basis
  GROUP BY snapshot_basis.warehouse_id, snapshot_basis.variant_id;

CREATE TABLE __RUNTIME__.inventory_delta (
    warehouse_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE __RUNTIME__.inventory_opening_prior_posting (
    run_id text NOT NULL,
    posting_id uuid NOT NULL
);

CREATE TABLE __RUNTIME__.master_reference_overlay (
    kind text NOT NULL,
    id uuid NOT NULL,
    name text NOT NULL,
    enabled boolean NOT NULL,
    method_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT master_reference_overlay_kind_check CHECK ((kind = ANY (ARRAY['warehouses'::text, 'payments'::text, 'fundAccounts'::text])))
);

CREATE TABLE __RUNTIME__.movement (
    posting_id uuid NOT NULL,
    line_index integer NOT NULL,
    warehouse_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL
);

CREATE TABLE __RUNTIME__.operator (
    id text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT operator_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'WAREHOUSE'::text, 'SALESPERSON'::text])))
);

CREATE TABLE __RUNTIME__.posting (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    revision integer NOT NULL,
    reason text NOT NULL,
    reversed_effect_identity text,
    actor_id text NOT NULL,
    request_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT posting_reason_check CHECK ((reason = ANY (ARRAY['BASELINE_EFFECT_REVERSAL'::text, 'REVISION_APPROVAL'::text, 'ACTIVE_EFFECT_REVERSAL'::text])))
);

CREATE TABLE __RUNTIME__.product_barcode_alias (
    barcode text NOT NULL,
    product_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    historical_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'MIGRATED'::text NOT NULL
);

CREATE TABLE __RUNTIME__.product_barcode_alias_retired (
    barcode text NOT NULL,
    product_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    historical_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin text DEFAULT 'MIGRATED'::text NOT NULL
);

CREATE TABLE __RUNTIME__.product_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    path text NOT NULL,
    sha256 text NOT NULL,
    media_type text NOT NULL,
    role text NOT NULL,
    color_name text,
    name text NOT NULL,
    sort_order integer NOT NULL,
    CONSTRAINT product_image_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE SEQUENCE __RUNTIME__.product_item_code_seq
    START WITH 9000000
    INCREMENT BY 1
    NO MINVALUE
    MAXVALUE 9999999
    CACHE 1;

CREATE TABLE __RUNTIME__.product_master_overlay (
    kind text NOT NULL,
    id text NOT NULL,
    body jsonb NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_master_overlay_kind_check CHECK ((kind = ANY (ARRAY['categories'::text, 'colors'::text, 'groups'::text, 'fits'::text, 'seasons'::text])))
);

CREATE TABLE __RUNTIME__.product_overlay (
    id uuid NOT NULL,
    code text NOT NULL,
    body jsonb NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.product_profile_overlay (
    product_id uuid NOT NULL,
    body jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.revision (
    document_id uuid NOT NULL,
    revision integer NOT NULL,
    original_imported boolean NOT NULL,
    body jsonb NOT NULL,
    actor_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.size_overlay (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_name text NOT NULL,
    name text NOT NULL
);

CREATE TABLE __RUNTIME__.variant_overlay (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid NOT NULL,
    size_id uuid NOT NULL,
    size_name text NOT NULL,
    group_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fit_id text DEFAULT 'A'::text NOT NULL,
    size_code text DEFAULT ''::text NOT NULL
);

CREATE TABLE __RUNTIME__.version_history (
    document_id uuid NOT NULL,
    version integer NOT NULL,
    operation text NOT NULL,
    revision integer NOT NULL,
    actor_id text NOT NULL,
    request_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.work_event (
    document_key text NOT NULL,
    id text NOT NULL,
    body jsonb NOT NULL,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __RUNTIME__.work_record (
    document_key text NOT NULL,
    id text NOT NULL,
    body jsonb NOT NULL,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY __RUNTIME__.barcode_authority_policy
    ADD CONSTRAINT barcode_authority_policy_pkey PRIMARY KEY (singleton);

ALTER TABLE ONLY __RUNTIME__.barcode_authority_product
    ADD CONSTRAINT barcode_authority_product_pkey PRIMARY KEY (product_id);

ALTER TABLE ONLY __RUNTIME__.barcode_authority_record
    ADD CONSTRAINT barcode_authority_record_pkey PRIMARY KEY (sku_id);

ALTER TABLE ONLY __RUNTIME__.barcode_scheme_supplement
    ADD CONSTRAINT barcode_scheme_supplement_pkey PRIMARY KEY (sku_id);

ALTER TABLE ONLY __RUNTIME__.document
    ADD CONSTRAINT document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.edit_lease
    ADD CONSTRAINT edit_lease_pkey PRIMARY KEY (document_key);

ALTER TABLE ONLY __RUNTIME__.generated_barcode
    ADD CONSTRAINT generated_barcode_barcode_key UNIQUE (barcode);

ALTER TABLE ONLY __RUNTIME__.generated_barcode
    ADD CONSTRAINT generated_barcode_pkey PRIMARY KEY (sku_id);

ALTER TABLE ONLY __RUNTIME__.idempotency_request
    ADD CONSTRAINT idempotency_request_actor_id_command_scope_idempotency_key_key UNIQUE (actor_id, command_scope, idempotency_key);

ALTER TABLE ONLY __RUNTIME__.idempotency_request
    ADD CONSTRAINT idempotency_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.inventory_delta
    ADD CONSTRAINT inventory_delta_pkey PRIMARY KEY (warehouse_id, sku_id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_cell
    ADD CONSTRAINT inventory_opening_cell_pkey PRIMARY KEY (run_id, warehouse_id, sku_id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_delta_checkpoint
    ADD CONSTRAINT inventory_opening_delta_checkpoint_pkey PRIMARY KEY (run_id, warehouse_id, sku_id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_prior_posting
    ADD CONSTRAINT inventory_opening_prior_posting_pkey PRIMARY KEY (run_id, posting_id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_run
    ADD CONSTRAINT inventory_opening_run_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.master_reference_overlay
    ADD CONSTRAINT master_reference_overlay_pkey PRIMARY KEY (kind, id);

ALTER TABLE ONLY __RUNTIME__.movement
    ADD CONSTRAINT movement_pkey PRIMARY KEY (posting_id, line_index, warehouse_id);

ALTER TABLE ONLY __RUNTIME__.operator
    ADD CONSTRAINT operator_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.posting
    ADD CONSTRAINT posting_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.product_barcode_alias
    ADD CONSTRAINT product_barcode_alias_pkey PRIMARY KEY (barcode);

ALTER TABLE ONLY __RUNTIME__.product_image
    ADD CONSTRAINT product_image_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.product_image
    ADD CONSTRAINT product_image_product_id_role_name_sha256_key UNIQUE (product_id, role, name, sha256);

ALTER TABLE ONLY __RUNTIME__.product_master_overlay
    ADD CONSTRAINT product_master_overlay_pkey PRIMARY KEY (kind, id);

ALTER TABLE ONLY __RUNTIME__.product_overlay
    ADD CONSTRAINT product_overlay_code_key UNIQUE (code);

ALTER TABLE ONLY __RUNTIME__.product_overlay
    ADD CONSTRAINT product_overlay_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.product_profile_overlay
    ADD CONSTRAINT product_profile_overlay_pkey PRIMARY KEY (product_id);

ALTER TABLE ONLY __RUNTIME__.revision
    ADD CONSTRAINT revision_pkey PRIMARY KEY (document_id, revision);

ALTER TABLE ONLY __RUNTIME__.size_overlay
    ADD CONSTRAINT size_overlay_group_name_name_key UNIQUE (group_name, name);

ALTER TABLE ONLY __RUNTIME__.size_overlay
    ADD CONSTRAINT size_overlay_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.variant_overlay
    ADD CONSTRAINT variant_overlay_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __RUNTIME__.version_history
    ADD CONSTRAINT version_history_pkey PRIMARY KEY (document_id, version);

ALTER TABLE ONLY __RUNTIME__.work_event
    ADD CONSTRAINT work_event_pkey PRIMARY KEY (document_key, id);

ALTER TABLE ONLY __RUNTIME__.work_record
    ADD CONSTRAINT work_record_pkey PRIMARY KEY (document_key, id);

CREATE INDEX barcode_authority_record_product ON __RUNTIME__.barcode_authority_record USING btree (product_id);

CREATE INDEX document_type_day ON __RUNTIME__.document USING btree (document_type, business_day DESC);

CREATE INDEX document_type_number ON __RUNTIME__.document USING btree (document_type, number);

CREATE UNIQUE INDEX inventory_opening_one_active ON __RUNTIME__.inventory_opening_run USING btree (active) WHERE active;

CREATE INDEX movement_key ON __RUNTIME__.movement USING btree (warehouse_id, sku_id);

CREATE INDEX product_barcode_alias_product ON __RUNTIME__.product_barcode_alias USING btree (product_id);

CREATE INDEX product_image_product_order ON __RUNTIME__.product_image USING btree (product_id, sort_order);

CREATE INDEX product_overlay_active_code ON __RUNTIME__.product_overlay USING btree (code) WHERE (deleted = false);

CREATE UNIQUE INDEX variant_overlay_identity ON __RUNTIME__.variant_overlay USING btree (product_id, color_id, size_id, fit_id);

CREATE INDEX variant_overlay_product ON __RUNTIME__.variant_overlay USING btree (product_id);

CREATE TRIGGER revision_immutable BEFORE DELETE OR UPDATE ON __RUNTIME__.revision FOR EACH ROW EXECUTE FUNCTION __RUNTIME__.deny_revision_mutation();

ALTER TABLE ONLY __RUNTIME__.idempotency_request
    ADD CONSTRAINT idempotency_request_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_cell
    ADD CONSTRAINT inventory_opening_cell_run_id_fkey FOREIGN KEY (run_id) REFERENCES __RUNTIME__.inventory_opening_run(id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_delta_checkpoint
    ADD CONSTRAINT inventory_opening_delta_checkpoint_run_id_fkey FOREIGN KEY (run_id) REFERENCES __RUNTIME__.inventory_opening_run(id);

ALTER TABLE ONLY __RUNTIME__.inventory_opening_prior_posting
    ADD CONSTRAINT inventory_opening_prior_posting_run_id_fkey FOREIGN KEY (run_id) REFERENCES __RUNTIME__.inventory_opening_run(id);

ALTER TABLE ONLY __RUNTIME__.movement
    ADD CONSTRAINT movement_posting_id_fkey FOREIGN KEY (posting_id) REFERENCES __RUNTIME__.posting(id);

ALTER TABLE ONLY __RUNTIME__.posting
    ADD CONSTRAINT posting_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);

ALTER TABLE ONLY __RUNTIME__.posting
    ADD CONSTRAINT posting_document_id_fkey FOREIGN KEY (document_id) REFERENCES __RUNTIME__.document(id);

ALTER TABLE ONLY __RUNTIME__.revision
    ADD CONSTRAINT revision_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);

ALTER TABLE ONLY __RUNTIME__.revision
    ADD CONSTRAINT revision_document_id_fkey FOREIGN KEY (document_id) REFERENCES __RUNTIME__.document(id);

ALTER TABLE ONLY __RUNTIME__.version_history
    ADD CONSTRAINT version_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);

ALTER TABLE ONLY __RUNTIME__.version_history
    ADD CONSTRAINT version_history_document_id_fkey FOREIGN KEY (document_id) REFERENCES __RUNTIME__.document(id);

ALTER TABLE ONLY __RUNTIME__.work_event
    ADD CONSTRAINT work_event_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);

ALTER TABLE ONLY __RUNTIME__.work_record
    ADD CONSTRAINT work_record_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __RUNTIME__.operator(id);
