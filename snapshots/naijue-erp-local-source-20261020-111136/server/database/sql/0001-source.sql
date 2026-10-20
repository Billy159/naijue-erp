-- Version 0001: structural baseline; no business rows or account seeds.
CREATE TYPE __SOURCE__.app_role AS ENUM (
    'ADMIN',
    'WAREHOUSE',
    'SALES'
);

CREATE TYPE __SOURCE__.barcode_role AS ENUM (
    'CURRENT',
    'HISTORICAL'
);

CREATE TYPE __SOURCE__.barcode_status AS ENUM (
    'ACTIVE',
    'QUARANTINED',
    'RETIRED'
);

CREATE TYPE __SOURCE__.document_status AS ENUM (
    'DRAFT',
    'APPROVED',
    'UNAPPROVED',
    'COMPLETED',
    'REVERSED',
    'NO_CHANGE'
);

CREATE TYPE __SOURCE__.document_type AS ENUM (
    'TRANSFER',
    'SALE',
    'RETURN_EXCHANGE',
    'ADJUSTMENT',
    'HISTORICAL_SALE'
);

CREATE TYPE __SOURCE__.import_status AS ENUM (
    'UPLOADED',
    'INSPECTED',
    'VALIDATED',
    'NEEDS_REVIEW',
    'READY',
    'COMMITTED',
    'FAILED'
);

CREATE TYPE __SOURCE__.mapping_decision AS ENUM (
    'AUTO_CANDIDATE',
    'CONFIRMED',
    'REJECTED',
    'CONFLICT'
);

CREATE FUNCTION __SOURCE__.tplus_uuid(kind text, source_id text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (
    substr(md5('tplus:' || kind || ':' || source_id), 1, 8) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 9, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 13, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 17, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 21, 12)
  )::uuid;
$$;

CREATE TABLE __SOURCE__.app_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    role __SOURCE__.app_role NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.barcode (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    value text NOT NULL,
    variant_id uuid NOT NULL,
    status __SOURCE__.barcode_status NOT NULL,
    role __SOURCE__.barcode_role NOT NULL,
    scheme_version_id uuid,
    source text NOT NULL,
    generated_input_snapshot jsonb,
    quarantine_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.barcode_encoding_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheme_version_id uuid NOT NULL,
    dimension_id uuid,
    spec_value_id uuid,
    product_id uuid,
    encoded_value text NOT NULL
);

CREATE TABLE __SOURCE__.barcode_scheme (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.barcode_scheme_segment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheme_version_id uuid NOT NULL,
    segment_order integer NOT NULL,
    type text NOT NULL,
    length integer NOT NULL,
    pad_side text,
    pad_char text,
    value_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
    dimension_id uuid,
    literal text,
    CONSTRAINT barcode_scheme_segment_length_check CHECK ((length > 0)),
    CONSTRAINT barcode_scheme_segment_pad_char_check CHECK ((length(pad_char) = 1)),
    CONSTRAINT barcode_scheme_segment_pad_side_check CHECK ((pad_side = ANY (ARRAY['LEFT'::text, 'RIGHT'::text]))),
    CONSTRAINT barcode_scheme_segment_segment_order_check CHECK ((segment_order >= 0))
);

CREATE TABLE __SOURCE__.barcode_scheme_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheme_id uuid NOT NULL,
    version integer NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT barcode_scheme_version_version_check CHECK ((version > 0))
);

CREATE TABLE __SOURCE__.brand (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.business_document (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    number text NOT NULL,
    type __SOURCE__.document_type NOT NULL,
    status __SOURCE__.document_status NOT NULL,
    document_date date NOT NULL,
    source_warehouse_id uuid,
    target_warehouse_id uuid,
    actor_id uuid,
    version integer DEFAULT 0 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    inventory_mode text DEFAULT 'POSTING'::text NOT NULL,
    original_document_id uuid,
    reversal_reason text,
    totals jsonb DEFAULT '{}'::jsonb NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT business_document_check CHECK (((source_warehouse_id IS NULL) OR (target_warehouse_id IS NULL) OR (source_warehouse_id <> target_warehouse_id)))
);

CREATE TABLE __SOURCE__.category (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 0 NOT NULL
);

CREATE TABLE __SOURCE__.counterparty (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.document_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    warehouse_id uuid,
    direction text,
    barcode text,
    product_code text NOT NULL,
    product_name text NOT NULL,
    options_snapshot jsonb NOT NULL,
    color_name text,
    size_name text,
    unit_name text NOT NULL,
    quantity numeric(18,4) NOT NULL,
    unit_price numeric(18,4),
    retail_price numeric(18,4),
    amount numeric(18,2),
    historical_returned_quantity numeric(18,4) DEFAULT 0 NOT NULL,
    note text,
    CONSTRAINT document_line_historical_returned_quantity_check CHECK ((historical_returned_quantity >= (0)::numeric)),
    CONSTRAINT document_line_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT document_line_retail_price_check CHECK ((retail_price >= (0)::numeric)),
    CONSTRAINT document_line_unit_price_check CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE __SOURCE__.fit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.idempotency_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    command_scope text NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    response jsonb,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.import_batch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_name text NOT NULL,
    sha256 text NOT NULL,
    importer_version text NOT NULL,
    status __SOURCE__.import_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    committed_at timestamp with time zone,
    CONSTRAINT import_batch_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.inventory_balance (
    variant_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    quantity numeric(18,4) DEFAULT 0 NOT NULL,
    version integer DEFAULT 0 NOT NULL
);

CREATE TABLE __SOURCE__.inventory_movement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    posting_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_line_id uuid,
    variant_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    delta numeric(18,4) NOT NULL,
    balance_after numeric(18,4) NOT NULL,
    business_type text NOT NULL,
    reversal_of uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid NOT NULL,
    CONSTRAINT inventory_movement_delta_check CHECK ((delta <> (0)::numeric))
);

CREATE TABLE __SOURCE__.inventory_posting (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_key text NOT NULL,
    business_type text NOT NULL,
    document_id uuid NOT NULL,
    action text NOT NULL,
    status text NOT NULL,
    reversal_of_posting_id uuid,
    actor_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.migration_checkpoint (
    batch_id uuid NOT NULL,
    stage text NOT NULL,
    cursor jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.migration_issue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    source_record_id uuid,
    code text NOT NULL,
    severity text NOT NULL,
    details jsonb NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid
);

CREATE TABLE __SOURCE__.opening_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ledger_key text DEFAULT 'CURRENT'::text NOT NULL,
    batch_id uuid NOT NULL,
    committed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT opening_ledger_ledger_key_check CHECK ((ledger_key = 'CURRENT'::text))
);

CREATE TABLE __SOURCE__.price_type (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    category_id uuid NOT NULL,
    brand_id uuid,
    unit_id uuid NOT NULL,
    fit_id uuid,
    counterparty_id uuid,
    current_barcode_scheme_version_id uuid,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.product_image (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    path text NOT NULL,
    sha256 text NOT NULL,
    media_type text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT product_image_sha256_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.product_option (
    product_id uuid NOT NULL,
    spec_value_id uuid NOT NULL
);

CREATE TABLE __SOURCE__.product_price (
    product_id uuid NOT NULL,
    price_type_id uuid NOT NULL,
    amount numeric(18,4) NOT NULL,
    CONSTRAINT product_price_amount_check CHECK ((amount >= (0)::numeric))
);

CREATE TABLE __SOURCE__.return_line_reference (
    return_line_id uuid NOT NULL,
    original_sale_line_id uuid NOT NULL
);

CREATE TABLE __SOURCE__.schema_migration (
    version text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.size_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.size_group_item (
    size_group_id uuid NOT NULL,
    spec_value_id uuid NOT NULL,
    sort_order integer NOT NULL
);

CREATE TABLE __SOURCE__.source_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_record_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    decision __SOURCE__.mapping_decision NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone
);

CREATE TABLE __SOURCE__.source_record (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    source_type text NOT NULL,
    sheet_name text NOT NULL,
    row_number integer NOT NULL,
    column_name text,
    raw_value jsonb,
    source_key text NOT NULL,
    CONSTRAINT source_record_row_number_check CHECK ((row_number > 0))
);

CREATE TABLE __SOURCE__.spec_dimension (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.spec_value (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dimension_id uuid NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE __SOURCE__.system_setting (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.tplus_department (
    batch_id text NOT NULL,
    id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text,
    name text NOT NULL,
    parent_id uuid,
    hall_id uuid,
    is_hall_source boolean NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_employee (
    batch_id text NOT NULL,
    id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text,
    name text NOT NULL,
    department_id uuid,
    hall_id uuid,
    role text,
    source_salesperson boolean NOT NULL,
    login_enabled boolean NOT NULL,
    login_identity_created boolean NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_fund_account (
    batch_id text NOT NULL,
    id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text NOT NULL,
    account_number text,
    name text NOT NULL,
    bank text,
    account_type text,
    source_department_id uuid,
    primary_payment_method_id uuid,
    hall_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_latest_balance numeric(18,2),
    balance_initialized boolean NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_hall (
    batch_id text NOT NULL,
    id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text NOT NULL,
    name text NOT NULL,
    department_id uuid,
    default_customer_id uuid,
    default_warehouse_id uuid,
    warehouse_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_history_document (
    batch_id text NOT NULL,
    source_dataset text NOT NULL,
    source_id text NOT NULL,
    target_document_id uuid,
    document_kind text NOT NULL,
    source_number text,
    business_date date NOT NULL,
    source_business_type_code text,
    source_business_type_name text,
    source_party_id uuid,
    source_department_id uuid,
    source_employee_id uuid,
    source_warehouse_id uuid,
    source_from_warehouse_id uuid,
    source_to_warehouse_id uuid,
    line_count integer NOT NULL,
    quantity_total numeric(18,4),
    amount_total numeric(18,2),
    read_only boolean NOT NULL,
    audit_status text,
    audited_by text,
    audited_at text,
    created_by text,
    created_at text,
    runtime_audit_replay_allowed boolean NOT NULL,
    stock_effect boolean NOT NULL,
    source_sha256 text NOT NULL,
    source_record_sha256 text NOT NULL,
    source_payload jsonb NOT NULL,
    CONSTRAINT tplus_history_document_document_kind_check CHECK ((document_kind = ANY (ARRAY['purchase'::text, 'sale'::text, 'transfer'::text]))),
    CONSTRAINT tplus_history_document_source_record_sha256_check CHECK ((source_record_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_history_document_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.tplus_history_line (
    batch_id text NOT NULL,
    source_dataset text NOT NULL,
    source_id text NOT NULL,
    target_line_id uuid,
    source_document_id text NOT NULL,
    target_document_id uuid,
    line_kind text NOT NULL,
    product_id uuid NOT NULL,
    color_id uuid NOT NULL,
    size_id uuid NOT NULL,
    sku_id uuid NOT NULL,
    warehouse_id uuid,
    from_warehouse_id uuid,
    to_warehouse_id uuid,
    source_product_code text NOT NULL,
    source_product_name text NOT NULL,
    source_color_code text,
    source_color_name text,
    source_size_code text,
    source_size_name text,
    source_quantity numeric(18,4) NOT NULL,
    stock_quantity_contribution numeric(18,4) NOT NULL,
    amount numeric(18,2),
    unit_price numeric(18,4),
    unit text NOT NULL,
    stock_effect boolean NOT NULL,
    read_only boolean NOT NULL,
    source_sha256 text NOT NULL,
    source_record_sha256 text NOT NULL,
    source_lineage jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tplus_history_line_line_kind_check CHECK ((line_kind = ANY (ARRAY['purchase'::text, 'sale'::text, 'transfer'::text]))),
    CONSTRAINT tplus_history_line_source_record_sha256_check CHECK ((source_record_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_history_line_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.tplus_id_map (
    batch_id text NOT NULL,
    entity_type text NOT NULL,
    source_id text NOT NULL,
    target_id uuid NOT NULL
);

CREATE TABLE __SOURCE__.tplus_import_file (
    batch_id text NOT NULL,
    dataset_path text NOT NULL,
    source_sha256 text NOT NULL,
    record_count integer NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    quarantined_count integer DEFAULT 0 NOT NULL,
    can_import boolean NOT NULL,
    participates_in_business_calculation boolean NOT NULL,
    load_action text NOT NULL,
    status text NOT NULL,
    CONSTRAINT tplus_import_file_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_import_file_status_check CHECK ((status = ANY (ARRAY['IMPORTED'::text, 'QUARANTINED'::text, 'SKIPPED'::text, 'FAILED'::text])))
);

CREATE TABLE __SOURCE__.tplus_import_run (
    batch_id text NOT NULL,
    space_key text NOT NULL,
    schema_name text NOT NULL,
    database_name text NOT NULL,
    manifest_path text NOT NULL,
    manifest_sha256 text NOT NULL,
    preflight_batch_id text NOT NULL,
    importer_version text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    committed_at timestamp with time zone,
    git_sha text NOT NULL,
    workspace_state_sha256 text NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    quarantined_count integer DEFAULT 0 NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    rollback_note text DEFAULT ''::text NOT NULL,
    error jsonb,
    CONSTRAINT tplus_import_run_manifest_sha256_check CHECK ((manifest_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_import_run_status_check CHECK ((status = ANY (ARRAY['IMPORTING'::text, 'COMMITTED'::text, 'FAILED'::text])))
);

CREATE TABLE __SOURCE__.tplus_inventory_balance_source (
    batch_id text NOT NULL,
    source_id text NOT NULL,
    variant_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    quantity numeric(18,4) NOT NULL,
    unit text NOT NULL,
    opening_quantity numeric(18,4) NOT NULL,
    cutoff_source_date date NOT NULL,
    snapshot_used boolean NOT NULL,
    apply_historical_documents_again boolean NOT NULL,
    source_event_count integer NOT NULL,
    components jsonb NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_party_role (
    batch_id text NOT NULL,
    party_id uuid NOT NULL,
    source_id text NOT NULL,
    role text NOT NULL,
    name text NOT NULL,
    source_payload jsonb NOT NULL,
    CONSTRAINT tplus_party_role_role_check CHECK ((role = ANY (ARRAY['customer'::text, 'supplier'::text])))
);

CREATE TABLE __SOURCE__.tplus_payment_method (
    batch_id text NOT NULL,
    id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text,
    configuration_key text,
    name text NOT NULL,
    origin text NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_product_barcode (
    batch_id text NOT NULL,
    source_id text NOT NULL,
    product_id uuid NOT NULL,
    barcode text NOT NULL,
    unit text,
    is_default boolean NOT NULL,
    binding_scope text NOT NULL,
    sku_id uuid,
    sku_binding_known boolean NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_product_source (
    batch_id text NOT NULL,
    product_id uuid NOT NULL,
    source_id text NOT NULL,
    source_code text NOT NULL,
    source_size_group_id uuid,
    category_decision jsonb NOT NULL,
    source_payload jsonb NOT NULL
);

CREATE TABLE __SOURCE__.tplus_sales_fund (
    batch_id text NOT NULL,
    source_id text NOT NULL,
    settlement_id text NOT NULL,
    source_document_id text NOT NULL,
    target_document_id uuid NOT NULL,
    payment_method_id uuid,
    fund_account_id uuid,
    source_payment_method_code text,
    source_payment_method_name text,
    source_fund_account_code text,
    source_fund_account_name text,
    amount numeric(18,2) NOT NULL,
    direction text NOT NULL,
    source_business_date date,
    settled_at text,
    read_only boolean NOT NULL,
    runtime_funds_effect boolean NOT NULL,
    source_sha256 text NOT NULL,
    source_record_sha256 text NOT NULL,
    source_payload jsonb NOT NULL,
    CONSTRAINT tplus_sales_fund_source_record_sha256_check CHECK ((source_record_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_sales_fund_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.tplus_source_lineage (
    batch_id text NOT NULL,
    dataset_path text NOT NULL,
    source_id text NOT NULL,
    source_sha256 text NOT NULL,
    record_sha256 text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    CONSTRAINT tplus_source_lineage_record_sha256_check CHECK ((record_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tplus_source_lineage_source_sha256_check CHECK ((source_sha256 ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE __SOURCE__.unit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    quantity_scale smallint DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT unit_quantity_scale_check CHECK (((quantity_scale >= 0) AND (quantity_scale <= 4)))
);

CREATE TABLE __SOURCE__.user_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.user_view_setting (
    user_id uuid NOT NULL,
    view_key text NOT NULL,
    settings jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE __SOURCE__.variant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    option_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 0 NOT NULL
);

CREATE TABLE __SOURCE__.variant_option (
    variant_id uuid NOT NULL,
    dimension_id uuid NOT NULL,
    spec_value_id uuid NOT NULL
);

CREATE TABLE __SOURCE__.warehouse (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    code_normalized text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    version integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY __SOURCE__.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.app_user
    ADD CONSTRAINT app_user_username_key UNIQUE (username);

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_scheme_version_id_dimension_id_spe_key UNIQUE NULLS NOT DISTINCT (scheme_version_id, dimension_id, spec_value_id, product_id);

ALTER TABLE ONLY __SOURCE__.barcode
    ADD CONSTRAINT barcode_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.barcode_scheme
    ADD CONSTRAINT barcode_scheme_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.barcode_scheme
    ADD CONSTRAINT barcode_scheme_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.barcode_scheme_segment
    ADD CONSTRAINT barcode_scheme_segment_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.barcode_scheme_segment
    ADD CONSTRAINT barcode_scheme_segment_scheme_version_id_segment_order_key UNIQUE (scheme_version_id, segment_order);

ALTER TABLE ONLY __SOURCE__.barcode_scheme_version
    ADD CONSTRAINT barcode_scheme_version_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.barcode_scheme_version
    ADD CONSTRAINT barcode_scheme_version_scheme_id_version_key UNIQUE (scheme_id, version);

ALTER TABLE ONLY __SOURCE__.barcode
    ADD CONSTRAINT barcode_value_key UNIQUE (value);

ALTER TABLE ONLY __SOURCE__.brand
    ADD CONSTRAINT brand_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.brand
    ADD CONSTRAINT brand_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_number_key UNIQUE (number);

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.category
    ADD CONSTRAINT category_parent_id_code_normalized_key UNIQUE (parent_id, code_normalized);

ALTER TABLE ONLY __SOURCE__.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.counterparty
    ADD CONSTRAINT counterparty_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.counterparty
    ADD CONSTRAINT counterparty_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.document_line
    ADD CONSTRAINT document_line_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.fit
    ADD CONSTRAINT fit_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.fit
    ADD CONSTRAINT fit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.idempotency_request
    ADD CONSTRAINT idempotency_request_actor_id_command_scope_idempotency_key_key UNIQUE (actor_id, command_scope, idempotency_key);

ALTER TABLE ONLY __SOURCE__.idempotency_request
    ADD CONSTRAINT idempotency_request_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.import_batch
    ADD CONSTRAINT import_batch_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.inventory_balance
    ADD CONSTRAINT inventory_balance_pkey PRIMARY KEY (variant_id, warehouse_id);

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.inventory_posting
    ADD CONSTRAINT inventory_posting_action_key_key UNIQUE (action_key);

ALTER TABLE ONLY __SOURCE__.inventory_posting
    ADD CONSTRAINT inventory_posting_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.migration_checkpoint
    ADD CONSTRAINT migration_checkpoint_pkey PRIMARY KEY (batch_id, stage);

ALTER TABLE ONLY __SOURCE__.migration_issue
    ADD CONSTRAINT migration_issue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.opening_ledger
    ADD CONSTRAINT opening_ledger_batch_id_key UNIQUE (batch_id);

ALTER TABLE ONLY __SOURCE__.opening_ledger
    ADD CONSTRAINT opening_ledger_ledger_key_key UNIQUE (ledger_key);

ALTER TABLE ONLY __SOURCE__.opening_ledger
    ADD CONSTRAINT opening_ledger_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.price_type
    ADD CONSTRAINT price_type_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.price_type
    ADD CONSTRAINT price_type_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.product_image
    ADD CONSTRAINT product_image_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.product_option
    ADD CONSTRAINT product_option_pkey PRIMARY KEY (product_id, spec_value_id);

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.product_price
    ADD CONSTRAINT product_price_pkey PRIMARY KEY (product_id, price_type_id);

ALTER TABLE ONLY __SOURCE__.return_line_reference
    ADD CONSTRAINT return_line_reference_pkey PRIMARY KEY (return_line_id);

ALTER TABLE ONLY __SOURCE__.schema_migration
    ADD CONSTRAINT schema_migration_pkey PRIMARY KEY (version);

ALTER TABLE ONLY __SOURCE__.size_group
    ADD CONSTRAINT size_group_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.size_group_item
    ADD CONSTRAINT size_group_item_pkey PRIMARY KEY (size_group_id, spec_value_id);

ALTER TABLE ONLY __SOURCE__.size_group_item
    ADD CONSTRAINT size_group_item_size_group_id_sort_order_key UNIQUE (size_group_id, sort_order);

ALTER TABLE ONLY __SOURCE__.size_group
    ADD CONSTRAINT size_group_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.source_mapping
    ADD CONSTRAINT source_mapping_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.source_record
    ADD CONSTRAINT source_record_batch_id_source_key_key UNIQUE (batch_id, source_key);

ALTER TABLE ONLY __SOURCE__.source_record
    ADD CONSTRAINT source_record_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.spec_dimension
    ADD CONSTRAINT spec_dimension_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.spec_dimension
    ADD CONSTRAINT spec_dimension_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.spec_value
    ADD CONSTRAINT spec_value_dimension_id_code_normalized_key UNIQUE (dimension_id, code_normalized);

ALTER TABLE ONLY __SOURCE__.spec_value
    ADD CONSTRAINT spec_value_id_dimension_id_key UNIQUE (id, dimension_id);

ALTER TABLE ONLY __SOURCE__.spec_value
    ADD CONSTRAINT spec_value_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.system_setting
    ADD CONSTRAINT system_setting_pkey PRIMARY KEY (key);

ALTER TABLE ONLY __SOURCE__.tplus_department
    ADD CONSTRAINT tplus_department_batch_id_id_key UNIQUE (batch_id, id);

ALTER TABLE ONLY __SOURCE__.tplus_department
    ADD CONSTRAINT tplus_department_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_employee
    ADD CONSTRAINT tplus_employee_batch_id_id_key UNIQUE (batch_id, id);

ALTER TABLE ONLY __SOURCE__.tplus_employee
    ADD CONSTRAINT tplus_employee_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_fund_account
    ADD CONSTRAINT tplus_fund_account_batch_id_id_key UNIQUE (batch_id, id);

ALTER TABLE ONLY __SOURCE__.tplus_fund_account
    ADD CONSTRAINT tplus_fund_account_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_hall
    ADD CONSTRAINT tplus_hall_batch_id_id_key UNIQUE (batch_id, id);

ALTER TABLE ONLY __SOURCE__.tplus_hall
    ADD CONSTRAINT tplus_hall_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_history_document
    ADD CONSTRAINT tplus_history_document_pkey PRIMARY KEY (batch_id, source_dataset, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_history_line
    ADD CONSTRAINT tplus_history_line_pkey PRIMARY KEY (batch_id, source_dataset, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_id_map
    ADD CONSTRAINT tplus_id_map_batch_id_entity_type_target_id_key UNIQUE (batch_id, entity_type, target_id);

ALTER TABLE ONLY __SOURCE__.tplus_id_map
    ADD CONSTRAINT tplus_id_map_pkey PRIMARY KEY (batch_id, entity_type, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_import_file
    ADD CONSTRAINT tplus_import_file_pkey PRIMARY KEY (batch_id, dataset_path);

ALTER TABLE ONLY __SOURCE__.tplus_import_run
    ADD CONSTRAINT tplus_import_run_pkey PRIMARY KEY (batch_id);

ALTER TABLE ONLY __SOURCE__.tplus_inventory_balance_source
    ADD CONSTRAINT tplus_inventory_balance_sourc_batch_id_variant_id_warehouse_key UNIQUE (batch_id, variant_id, warehouse_id);

ALTER TABLE ONLY __SOURCE__.tplus_inventory_balance_source
    ADD CONSTRAINT tplus_inventory_balance_source_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_party_role
    ADD CONSTRAINT tplus_party_role_pkey PRIMARY KEY (batch_id, source_id, role);

ALTER TABLE ONLY __SOURCE__.tplus_payment_method
    ADD CONSTRAINT tplus_payment_method_batch_id_id_key UNIQUE (batch_id, id);

ALTER TABLE ONLY __SOURCE__.tplus_payment_method
    ADD CONSTRAINT tplus_payment_method_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_product_barcode
    ADD CONSTRAINT tplus_product_barcode_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_product_source
    ADD CONSTRAINT tplus_product_source_batch_id_product_id_key UNIQUE (batch_id, product_id);

ALTER TABLE ONLY __SOURCE__.tplus_product_source
    ADD CONSTRAINT tplus_product_source_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_sales_fund
    ADD CONSTRAINT tplus_sales_fund_batch_id_settlement_id_key UNIQUE (batch_id, settlement_id);

ALTER TABLE ONLY __SOURCE__.tplus_sales_fund
    ADD CONSTRAINT tplus_sales_fund_pkey PRIMARY KEY (batch_id, source_id);

ALTER TABLE ONLY __SOURCE__.tplus_source_lineage
    ADD CONSTRAINT tplus_source_lineage_pkey PRIMARY KEY (batch_id, dataset_path, source_id);

ALTER TABLE ONLY __SOURCE__.unit
    ADD CONSTRAINT unit_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.unit
    ADD CONSTRAINT unit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.user_session
    ADD CONSTRAINT user_session_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY __SOURCE__.user_view_setting
    ADD CONSTRAINT user_view_setting_pkey PRIMARY KEY (user_id, view_key);

ALTER TABLE ONLY __SOURCE__.variant_option
    ADD CONSTRAINT variant_option_pkey PRIMARY KEY (variant_id, dimension_id);

ALTER TABLE ONLY __SOURCE__.variant_option
    ADD CONSTRAINT variant_option_variant_id_spec_value_id_key UNIQUE (variant_id, spec_value_id);

ALTER TABLE ONLY __SOURCE__.variant
    ADD CONSTRAINT variant_pkey PRIMARY KEY (id);

ALTER TABLE ONLY __SOURCE__.variant
    ADD CONSTRAINT variant_product_id_option_key_key UNIQUE (product_id, option_key);

ALTER TABLE ONLY __SOURCE__.warehouse
    ADD CONSTRAINT warehouse_code_normalized_key UNIQUE (code_normalized);

ALTER TABLE ONLY __SOURCE__.warehouse
    ADD CONSTRAINT warehouse_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX barcode_one_active_current_per_variant ON __SOURCE__.barcode USING btree (variant_id) WHERE ((status = 'ACTIVE'::__SOURCE__.barcode_status) AND (role = 'CURRENT'::__SOURCE__.barcode_role));

CREATE UNIQUE INDEX category_root_code_uq ON __SOURCE__.category USING btree (code_normalized) WHERE (parent_id IS NULL);

CREATE UNIQUE INDEX movement_one_reversal ON __SOURCE__.inventory_movement USING btree (reversal_of) WHERE (reversal_of IS NOT NULL);

CREATE UNIQUE INDEX posting_one_reversal ON __SOURCE__.inventory_posting USING btree (reversal_of_posting_id) WHERE (reversal_of_posting_id IS NOT NULL);

CREATE INDEX return_line_original_idx ON __SOURCE__.return_line_reference USING btree (original_sale_line_id);

CREATE INDEX tplus_history_document_target_idx ON __SOURCE__.tplus_history_document USING btree (batch_id, target_document_id);

CREATE INDEX tplus_history_line_sku_warehouse_idx ON __SOURCE__.tplus_history_line USING btree (batch_id, sku_id, warehouse_id);

CREATE INDEX tplus_history_line_target_doc_idx ON __SOURCE__.tplus_history_line USING btree (batch_id, target_document_id);

CREATE INDEX tplus_lineage_target_idx ON __SOURCE__.tplus_source_lineage USING btree (batch_id, target_type, target_id);

CREATE INDEX tplus_sales_fund_document_idx ON __SOURCE__.tplus_sales_fund USING btree (batch_id, target_document_id);

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES __SOURCE__.spec_dimension(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_product_id_fkey FOREIGN KEY (product_id) REFERENCES __SOURCE__.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_scheme_version_id_fkey FOREIGN KEY (scheme_version_id) REFERENCES __SOURCE__.barcode_scheme_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_encoding_mapping
    ADD CONSTRAINT barcode_encoding_mapping_spec_value_id_fkey FOREIGN KEY (spec_value_id) REFERENCES __SOURCE__.spec_value(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_scheme_segment
    ADD CONSTRAINT barcode_scheme_segment_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES __SOURCE__.spec_dimension(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_scheme_segment
    ADD CONSTRAINT barcode_scheme_segment_scheme_version_id_fkey FOREIGN KEY (scheme_version_id) REFERENCES __SOURCE__.barcode_scheme_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode
    ADD CONSTRAINT barcode_scheme_version_id_fkey FOREIGN KEY (scheme_version_id) REFERENCES __SOURCE__.barcode_scheme_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode_scheme_version
    ADD CONSTRAINT barcode_scheme_version_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES __SOURCE__.barcode_scheme(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.barcode
    ADD CONSTRAINT barcode_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES __SOURCE__.variant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_original_document_id_fkey FOREIGN KEY (original_document_id) REFERENCES __SOURCE__.business_document(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_source_warehouse_id_fkey FOREIGN KEY (source_warehouse_id) REFERENCES __SOURCE__.warehouse(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.business_document
    ADD CONSTRAINT business_document_target_warehouse_id_fkey FOREIGN KEY (target_warehouse_id) REFERENCES __SOURCE__.warehouse(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.category
    ADD CONSTRAINT category_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES __SOURCE__.category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.document_line
    ADD CONSTRAINT document_line_document_id_fkey FOREIGN KEY (document_id) REFERENCES __SOURCE__.business_document(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.document_line
    ADD CONSTRAINT document_line_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES __SOURCE__.variant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.document_line
    ADD CONSTRAINT document_line_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES __SOURCE__.warehouse(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.idempotency_request
    ADD CONSTRAINT idempotency_request_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_balance
    ADD CONSTRAINT inventory_balance_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES __SOURCE__.variant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_balance
    ADD CONSTRAINT inventory_balance_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES __SOURCE__.warehouse(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_document_id_fkey FOREIGN KEY (document_id) REFERENCES __SOURCE__.business_document(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_document_line_id_fkey FOREIGN KEY (document_line_id) REFERENCES __SOURCE__.document_line(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_posting_id_fkey FOREIGN KEY (posting_id) REFERENCES __SOURCE__.inventory_posting(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES __SOURCE__.inventory_movement(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES __SOURCE__.variant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_movement
    ADD CONSTRAINT inventory_movement_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES __SOURCE__.warehouse(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_posting
    ADD CONSTRAINT inventory_posting_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_posting
    ADD CONSTRAINT inventory_posting_document_id_fkey FOREIGN KEY (document_id) REFERENCES __SOURCE__.business_document(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.inventory_posting
    ADD CONSTRAINT inventory_posting_reversal_of_posting_id_fkey FOREIGN KEY (reversal_of_posting_id) REFERENCES __SOURCE__.inventory_posting(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.migration_checkpoint
    ADD CONSTRAINT migration_checkpoint_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.import_batch(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.migration_issue
    ADD CONSTRAINT migration_issue_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.import_batch(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.migration_issue
    ADD CONSTRAINT migration_issue_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.migration_issue
    ADD CONSTRAINT migration_issue_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES __SOURCE__.source_record(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.opening_ledger
    ADD CONSTRAINT opening_ledger_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.import_batch(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES __SOURCE__.brand(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_category_id_fkey FOREIGN KEY (category_id) REFERENCES __SOURCE__.category(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES __SOURCE__.counterparty(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_current_barcode_scheme_version_id_fkey FOREIGN KEY (current_barcode_scheme_version_id) REFERENCES __SOURCE__.barcode_scheme_version(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_fit_id_fkey FOREIGN KEY (fit_id) REFERENCES __SOURCE__.fit(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product_image
    ADD CONSTRAINT product_image_product_id_fkey FOREIGN KEY (product_id) REFERENCES __SOURCE__.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product_option
    ADD CONSTRAINT product_option_product_id_fkey FOREIGN KEY (product_id) REFERENCES __SOURCE__.product(id) ON DELETE CASCADE;

ALTER TABLE ONLY __SOURCE__.product_option
    ADD CONSTRAINT product_option_spec_value_id_fkey FOREIGN KEY (spec_value_id) REFERENCES __SOURCE__.spec_value(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product_price
    ADD CONSTRAINT product_price_price_type_id_fkey FOREIGN KEY (price_type_id) REFERENCES __SOURCE__.price_type(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product_price
    ADD CONSTRAINT product_price_product_id_fkey FOREIGN KEY (product_id) REFERENCES __SOURCE__.product(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.product
    ADD CONSTRAINT product_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES __SOURCE__.unit(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.return_line_reference
    ADD CONSTRAINT return_line_reference_original_sale_line_id_fkey FOREIGN KEY (original_sale_line_id) REFERENCES __SOURCE__.document_line(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.return_line_reference
    ADD CONSTRAINT return_line_reference_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES __SOURCE__.document_line(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.size_group_item
    ADD CONSTRAINT size_group_item_size_group_id_fkey FOREIGN KEY (size_group_id) REFERENCES __SOURCE__.size_group(id) ON DELETE CASCADE;

ALTER TABLE ONLY __SOURCE__.size_group_item
    ADD CONSTRAINT size_group_item_spec_value_id_fkey FOREIGN KEY (spec_value_id) REFERENCES __SOURCE__.spec_value(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.source_mapping
    ADD CONSTRAINT source_mapping_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES __SOURCE__.app_user(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.source_mapping
    ADD CONSTRAINT source_mapping_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES __SOURCE__.source_record(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.source_record
    ADD CONSTRAINT source_record_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.import_batch(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.spec_value
    ADD CONSTRAINT spec_value_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES __SOURCE__.spec_dimension(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_department
    ADD CONSTRAINT tplus_department_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_employee
    ADD CONSTRAINT tplus_employee_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_fund_account
    ADD CONSTRAINT tplus_fund_account_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_hall
    ADD CONSTRAINT tplus_hall_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_history_document
    ADD CONSTRAINT tplus_history_document_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_history_line
    ADD CONSTRAINT tplus_history_line_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_id_map
    ADD CONSTRAINT tplus_id_map_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_import_file
    ADD CONSTRAINT tplus_import_file_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_inventory_balance_source
    ADD CONSTRAINT tplus_inventory_balance_source_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_party_role
    ADD CONSTRAINT tplus_party_role_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_payment_method
    ADD CONSTRAINT tplus_payment_method_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_product_barcode
    ADD CONSTRAINT tplus_product_barcode_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_product_source
    ADD CONSTRAINT tplus_product_source_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_sales_fund
    ADD CONSTRAINT tplus_sales_fund_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.tplus_source_lineage
    ADD CONSTRAINT tplus_source_lineage_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES __SOURCE__.tplus_import_run(batch_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.user_session
    ADD CONSTRAINT user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES __SOURCE__.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY __SOURCE__.user_view_setting
    ADD CONSTRAINT user_view_setting_user_id_fkey FOREIGN KEY (user_id) REFERENCES __SOURCE__.app_user(id) ON DELETE CASCADE;

ALTER TABLE ONLY __SOURCE__.variant_option
    ADD CONSTRAINT variant_option_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES __SOURCE__.spec_dimension(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.variant_option
    ADD CONSTRAINT variant_option_spec_value_id_dimension_id_fkey FOREIGN KEY (spec_value_id, dimension_id) REFERENCES __SOURCE__.spec_value(id, dimension_id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.variant_option
    ADD CONSTRAINT variant_option_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES __SOURCE__.variant(id) ON DELETE RESTRICT;

ALTER TABLE ONLY __SOURCE__.variant
    ADD CONSTRAINT variant_product_id_fkey FOREIGN KEY (product_id) REFERENCES __SOURCE__.product(id) ON DELETE RESTRICT;
