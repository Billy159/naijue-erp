-- ③B T+ 真实数据 Demo 空间的最小持久化扩展。
-- 执行前由 importer 设置 search_path 到本批次独立 schema；不写 public。

ALTER TABLE business_document ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE business_document ALTER COLUMN created_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS tplus_import_run (
  batch_id text PRIMARY KEY,
  space_key text NOT NULL,
  schema_name text NOT NULL,
  database_name text NOT NULL,
  manifest_path text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  preflight_batch_id text NOT NULL,
  importer_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('IMPORTING','COMMITTED','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  git_sha text NOT NULL,
  workspace_state_sha256 text NOT NULL,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  quarantined_count integer NOT NULL DEFAULT 0,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_note text NOT NULL DEFAULT '',
  error jsonb
);

CREATE TABLE IF NOT EXISTS tplus_import_file (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  dataset_path text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  record_count integer NOT NULL,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  quarantined_count integer NOT NULL DEFAULT 0,
  can_import boolean NOT NULL,
  participates_in_business_calculation boolean NOT NULL,
  load_action text NOT NULL,
  status text NOT NULL CHECK (status IN ('IMPORTED','QUARANTINED','SKIPPED','FAILED')),
  PRIMARY KEY (batch_id, dataset_path)
);

CREATE TABLE IF NOT EXISTS tplus_source_lineage (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  dataset_path text NOT NULL,
  source_id text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  record_sha256 text NOT NULL CHECK (record_sha256 ~ '^[0-9a-f]{64}$'),
  target_type text NOT NULL,
  target_id uuid,
  PRIMARY KEY (batch_id, dataset_path, source_id)
);

CREATE TABLE IF NOT EXISTS tplus_id_map (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  source_id text NOT NULL,
  target_id uuid NOT NULL,
  PRIMARY KEY (batch_id, entity_type, source_id),
  UNIQUE (batch_id, entity_type, target_id)
);

CREATE TABLE IF NOT EXISTS tplus_department (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  source_id text NOT NULL,
  source_code text,
  name text NOT NULL,
  parent_id uuid,
  hall_id uuid,
  is_hall_source boolean NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, id)
);

CREATE TABLE IF NOT EXISTS tplus_hall (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  source_id text NOT NULL,
  source_code text NOT NULL,
  name text NOT NULL,
  department_id uuid,
  default_customer_id uuid,
  default_warehouse_id uuid,
  warehouse_ids uuid[] NOT NULL DEFAULT '{}',
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, id)
);

CREATE TABLE IF NOT EXISTS tplus_employee (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
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
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, id)
);

CREATE TABLE IF NOT EXISTS tplus_party_role (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  party_id uuid NOT NULL,
  source_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer','supplier')),
  name text NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id, role)
);

CREATE TABLE IF NOT EXISTS tplus_payment_method (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  source_id text NOT NULL,
  source_code text,
  configuration_key text,
  name text NOT NULL,
  origin text NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, id)
);

CREATE TABLE IF NOT EXISTS tplus_fund_account (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  id uuid NOT NULL,
  source_id text NOT NULL,
  source_code text NOT NULL,
  account_number text,
  name text NOT NULL,
  bank text,
  account_type text,
  source_department_id uuid,
  primary_payment_method_id uuid,
  hall_ids uuid[] NOT NULL DEFAULT '{}',
  source_latest_balance numeric(18,2),
  balance_initialized boolean NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, id)
);

CREATE TABLE IF NOT EXISTS tplus_product_source (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  source_id text NOT NULL,
  source_code text NOT NULL,
  source_size_group_id uuid,
  category_decision jsonb NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, product_id)
);

CREATE TABLE IF NOT EXISTS tplus_product_barcode (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  source_id text NOT NULL,
  product_id uuid NOT NULL,
  barcode text NOT NULL,
  unit text,
  is_default boolean NOT NULL,
  binding_scope text NOT NULL,
  sku_id uuid,
  sku_binding_known boolean NOT NULL,
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id)
);

CREATE TABLE IF NOT EXISTS tplus_history_document (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  source_dataset text NOT NULL,
  source_id text NOT NULL,
  target_document_id uuid,
  document_kind text NOT NULL CHECK (document_kind IN ('purchase','sale','transfer')),
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
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_record_sha256 text NOT NULL CHECK (source_record_sha256 ~ '^[0-9a-f]{64}$'),
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_dataset, source_id)
);

CREATE TABLE IF NOT EXISTS tplus_history_line (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
  source_dataset text NOT NULL,
  source_id text NOT NULL,
  target_line_id uuid,
  source_document_id text NOT NULL,
  target_document_id uuid,
  line_kind text NOT NULL CHECK (line_kind IN ('purchase','sale','transfer')),
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
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_record_sha256 text NOT NULL CHECK (source_record_sha256 ~ '^[0-9a-f]{64}$'),
  source_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (batch_id, source_dataset, source_id)
);

CREATE TABLE IF NOT EXISTS tplus_sales_fund (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
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
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_record_sha256 text NOT NULL CHECK (source_record_sha256 ~ '^[0-9a-f]{64}$'),
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, settlement_id)
);

CREATE TABLE IF NOT EXISTS tplus_inventory_balance_source (
  batch_id text NOT NULL REFERENCES tplus_import_run(batch_id) ON DELETE RESTRICT,
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
  source_payload jsonb NOT NULL,
  PRIMARY KEY (batch_id, source_id),
  UNIQUE (batch_id, variant_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS tplus_history_document_target_idx ON tplus_history_document(batch_id, target_document_id);
CREATE INDEX IF NOT EXISTS tplus_history_line_target_doc_idx ON tplus_history_line(batch_id, target_document_id);
CREATE INDEX IF NOT EXISTS tplus_history_line_sku_warehouse_idx ON tplus_history_line(batch_id, sku_id, warehouse_id);
CREATE INDEX IF NOT EXISTS tplus_sales_fund_document_idx ON tplus_sales_fund(batch_id, target_document_id);
CREATE INDEX IF NOT EXISTS tplus_lineage_target_idx ON tplus_source_lineage(batch_id, target_type, target_id);

CREATE OR REPLACE FUNCTION tplus_uuid(kind text, source_id text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5('tplus:' || kind || ':' || source_id), 1, 8) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 9, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 13, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 17, 4) || '-' ||
    substr(md5('tplus:' || kind || ':' || source_id), 21, 12)
  )::uuid;
$$;

-- 当前 Demo 运行角色通常不是导入执行角色；只授予本独立空间所需权限。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'business_management') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA ' || quote_ident(current_schema()) || ' TO business_management';
    EXECUTE 'GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ' || quote_ident(current_schema()) || ' TO business_management';
    EXECUTE 'GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ' || quote_ident(current_schema()) || ' TO business_management';
  END IF;
END $$;
