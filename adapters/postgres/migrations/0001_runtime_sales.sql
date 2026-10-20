-- VERSION 0001: bounded new-runtime sales persistence, NOT the complete 32-table ERP.
-- Review-only migration artifact. It has not been executed against PostgreSQL.
-- No business seeds, dictionaries, balances, imported records, accounts or credentials.
BEGIN;
CREATE SCHEMA naijue_erp;
CREATE TABLE naijue_erp.schema_migration (
  version integer PRIMARY KEY,
  description text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

-- Minimal native reference shapes for foreign keys, not implemented maintenance/authentication modules.
CREATE TABLE naijue_erp.customer (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, enabled boolean NOT NULL,
  version integer NOT NULL CHECK (version > 0), created_at timestamptz, updated_at timestamptz
);
CREATE TABLE naijue_erp.supplier (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, enabled boolean NOT NULL,
  version integer NOT NULL CHECK (version > 0), created_at timestamptz, updated_at timestamptz
);
CREATE TABLE naijue_erp.hall (
  id uuid PRIMARY KEY, name text NOT NULL, default_customer_id uuid REFERENCES naijue_erp.customer(id),
  default_sales_warehouse_id uuid, enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.warehouse (
  id uuid PRIMARY KEY, hall_id uuid NOT NULL REFERENCES naijue_erp.hall(id), name text NOT NULL,
  enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
ALTER TABLE naijue_erp.hall ADD FOREIGN KEY (default_sales_warehouse_id) REFERENCES naijue_erp.warehouse(id);
CREATE TABLE naijue_erp.staff (
  id uuid PRIMARY KEY, name text NOT NULL, hall_id uuid REFERENCES naijue_erp.hall(id),
  role text NOT NULL, contact text, employment_status text NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.user_account (
  id uuid PRIMARY KEY, staff_id uuid NOT NULL UNIQUE REFERENCES naijue_erp.staff(id), login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL, login_enabled boolean NOT NULL, auth_version integer NOT NULL CHECK (auth_version > 0),
  version integer NOT NULL CHECK (version > 0), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE naijue_erp.product_category (
  id uuid PRIMARY KEY, parent_id uuid REFERENCES naijue_erp.product_category(id), name text NOT NULL,
  display_order integer NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.color (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, enabled boolean NOT NULL,
  version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.fit (
  id uuid PRIMARY KEY, code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]$'), name text NOT NULL,
  enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.size (
  id uuid PRIMARY KEY, code text, name text NOT NULL
  -- Deliberately NO global UNIQUE(code): approved source groups legitimately repeat code 900.
);
CREATE TABLE naijue_erp.size_group (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE naijue_erp.size_group_member (
  size_group_id uuid NOT NULL REFERENCES naijue_erp.size_group(id), size_id uuid NOT NULL REFERENCES naijue_erp.size(id),
  display_order integer NOT NULL, PRIMARY KEY (size_group_id, size_id)
);
CREATE TABLE naijue_erp.season (id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, display_order integer NOT NULL);
CREATE TABLE naijue_erp.product (
  id uuid PRIMARY KEY, product_code text NOT NULL UNIQUE, name text NOT NULL,
  category_id uuid NOT NULL REFERENCES naijue_erp.product_category(id), supplier_id uuid REFERENCES naijue_erp.supplier(id),
  season_id uuid REFERENCES naijue_erp.season(id), size_group_id uuid NOT NULL REFERENCES naijue_erp.size_group(id),
  retail_price decimal(18,2) CHECK (retail_price >= 0), enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.sku (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES naijue_erp.product(id),
  color_id uuid NOT NULL REFERENCES naijue_erp.color(id), fit_id uuid NOT NULL REFERENCES naijue_erp.fit(id),
  size_id uuid NOT NULL REFERENCES naijue_erp.size(id), sku_code text NOT NULL UNIQUE,
  enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0), UNIQUE (product_id, color_id, fit_id, size_id)
);
CREATE TABLE naijue_erp.payment_method (
  id uuid PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.payment_account (
  id uuid PRIMARY KEY, name text NOT NULL, payment_method_id uuid NOT NULL REFERENCES naijue_erp.payment_method(id),
  enabled boolean NOT NULL, version integer NOT NULL CHECK (version > 0)
);
CREATE TABLE naijue_erp.payment_account_hall (
  payment_account_id uuid NOT NULL REFERENCES naijue_erp.payment_account(id), hall_id uuid NOT NULL REFERENCES naijue_erp.hall(id),
  PRIMARY KEY (payment_account_id, hall_id)
);

CREATE TABLE naijue_erp.sales_header (
  id uuid PRIMARY KEY, number text NOT NULL CHECK (length(number) > 0),
  business_type text NOT NULL CHECK (business_type IN ('SALE', 'RETURN', 'EXCHANGE')), business_date date NOT NULL,
  hall_id uuid NOT NULL REFERENCES naijue_erp.hall(id), salesperson_id uuid REFERENCES naijue_erp.staff(id),
  customer_id uuid NOT NULL REFERENCES naijue_erp.customer(id), warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'VOID')), gross_amount decimal(18,2) NOT NULL,
  order_discount decimal(18,2) NOT NULL CHECK (order_discount >= 0), net_due decimal(18,2) NOT NULL, note text,
  version integer NOT NULL CHECK (version > 0), created_by_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id),
  created_hall_id uuid REFERENCES naijue_erp.hall(id), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  approved_by_account_id uuid REFERENCES naijue_erp.user_account(id), approved_at timestamptz,
  stock_basis text NOT NULL CHECK (stock_basis IN ('RUNTIME_LEDGER', 'CUTOFF_HISTORY')),
  CHECK ((status = 'APPROVED' AND approved_by_account_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_by_account_id IS NULL AND approved_at IS NULL))
  -- No invented uniqueness scope for preserved document numbers; no original sale/line link.
  -- CUTOFF_HISTORY is a fail-closed marker, NOT an enabled historical import/edit schema.
);
CREATE TABLE naijue_erp.sales_line (
  id uuid PRIMARY KEY, sales_id uuid NOT NULL REFERENCES naijue_erp.sales_header(id), line_no integer NOT NULL CHECK (line_no > 0),
  sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id), quantity bigint NOT NULL,
  reference_price decimal(18,2) CHECK (reference_price >= 0), deal_price decimal(18,2) NOT NULL CHECK (deal_price >= 0),
  line_amount decimal(18,2) NOT NULL, allocated_discount decimal(18,2) NOT NULL CHECK (allocated_discount >= 0), is_gift boolean NOT NULL,
  product_code_snapshot text NOT NULL, product_name_snapshot text NOT NULL, color_name_snapshot text NOT NULL,
  fit_name_snapshot text NOT NULL, size_name_snapshot text NOT NULL, barcode_snapshot text, is_current boolean NOT NULL
);
-- Retained inactive provenance lines may have old positions reused by new actual lines.
CREATE UNIQUE INDEX sales_line_current_position ON naijue_erp.sales_line (sales_id, line_no) WHERE is_current;
CREATE TABLE naijue_erp.sales_settlement (
  id uuid PRIMARY KEY, sales_id uuid NOT NULL REFERENCES naijue_erp.sales_header(id), line_no integer NOT NULL CHECK (line_no > 0),
  payment_account_id uuid NOT NULL REFERENCES naijue_erp.payment_account(id), direction text NOT NULL CHECK (direction IN ('RECEIVE', 'REFUND')),
  amount decimal(18,2) NOT NULL CHECK (amount >= 0), account_name_snapshot text NOT NULL, method_name_snapshot text NOT NULL,
  UNIQUE (sales_id, line_no) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE naijue_erp.operation_receipt (
  id uuid PRIMARY KEY, actor_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id),
  request_key text NOT NULL CHECK (length(request_key) > 0), request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID')),
  target_type text NOT NULL CHECK (target_type = 'SALES'), target_id uuid NOT NULL REFERENCES naijue_erp.sales_header(id),
  status text NOT NULL CHECK (status = 'COMMITTED'), result_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), completed_at timestamptz NOT NULL,
  UNIQUE (actor_account_id, request_key), UNIQUE (id, actor_account_id, target_id, action),
  CHECK (jsonb_typeof(result_data) = 'object' AND result_data ?& ARRAY['operationId', 'salesId', 'version', 'status', 'ledgerEntryIds']
    AND jsonb_typeof(result_data->'operationId') = 'string' AND jsonb_typeof(result_data->'salesId') = 'string'
    AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
    AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND jsonb_typeof(result_data->'status') = 'string'
    AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array')
);
CREATE TABLE naijue_erp.audit_change (
  id uuid PRIMARY KEY, operation_id uuid NOT NULL UNIQUE, actor_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id),
  object_type text NOT NULL CHECK (object_type = 'SALES'), object_id uuid NOT NULL REFERENCES naijue_erp.sales_header(id),
  action text NOT NULL CHECK (action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID')),
  old_version integer CHECK (old_version > 0), new_version integer NOT NULL CHECK (new_version > 0),
  before_values jsonb, after_values jsonb NOT NULL, occurred_at timestamptz NOT NULL,
  UNIQUE (operation_id, object_id), CHECK (new_version = COALESCE(old_version, 0) + 1),
  FOREIGN KEY (operation_id, actor_account_id, object_id, action)
    REFERENCES naijue_erp.operation_receipt (id, actor_account_id, target_id, action) DEFERRABLE INITIALLY DEFERRED
);
-- Reciprocal deferred FK: neither a successful receipt without its audit nor an audit without its successful receipt can commit.
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_requires_audit
  FOREIGN KEY (id, target_id) REFERENCES naijue_erp.audit_change (operation_id, object_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE naijue_erp.inventory_ledger (
  id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED,
  event_kind text NOT NULL CHECK (event_kind IN ('APPROVE', 'UNAPPROVE')), warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id),
  sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id), quantity_delta bigint NOT NULL CHECK (quantity_delta <> 0),
  source_sales_line_id uuid NOT NULL REFERENCES naijue_erp.sales_line(id), endpoint text NOT NULL CHECK (endpoint = 'SALES_WAREHOUSE'),
  source_document_version integer NOT NULL CHECK (source_document_version > 0),
  reverses_entry_id uuid UNIQUE REFERENCES naijue_erp.inventory_ledger(id), business_date date NOT NULL, posted_at timestamptz NOT NULL,
  UNIQUE (operation_id, source_sales_line_id, endpoint),
  CHECK ((event_kind = 'UNAPPROVE') = (reverses_entry_id IS NOT NULL))
);
CREATE TABLE naijue_erp.inventory_balance (
  warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id), sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id),
  quantity bigint NOT NULL, version integer NOT NULL CHECK (version > 0),
  last_operation_id uuid REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED,
  updated_at timestamptz NOT NULL, PRIMARY KEY (warehouse_id, sku_id)
  -- Negative quantities are explicitly legal. Missing rows remain missing, never implicit zero.
);
CREATE INDEX inventory_ledger_sales_source ON naijue_erp.inventory_ledger (source_sales_line_id, source_document_version);
CREATE INDEX sales_header_statistics_scope ON naijue_erp.sales_header (business_date, id) WHERE status = 'APPROVED';

CREATE FUNCTION naijue_erp.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  RAISE EXCEPTION 'append-only relation % cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON naijue_erp.audit_change FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER immutable_receipt BEFORE UPDATE OR DELETE ON naijue_erp.operation_receipt FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();

-- Validate the source at insertion time; later permitted draft edits must not rewrite historical SKU/warehouse facts.
CREATE FUNCTION naijue_erp.validate_sales_effect() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; ln naijue_erp.sales_line%ROWTYPE; original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.sales_line WHERE id = NEW.source_sales_line_id;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = ln.sales_id;
  IF h.stock_basis <> 'RUNTIME_LEDGER' OR NOT ln.is_current OR ln.sku_id <> NEW.sku_id OR h.warehouse_id <> NEW.warehouse_id
    OR h.business_date <> NEW.business_date OR h.version + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime sales source' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_kind = 'UNAPPROVE' THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id <> NEW.source_sales_line_id
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid original runtime reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_sales_ledger_source BEFORE INSERT ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_sales_effect();

-- Enforce approval equality/row count on the final transaction state, not an intermediate header/settlement write.
CREATE FUNCTION naijue_erp.validate_sales_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE target uuid; h naijue_erp.sales_header%ROWTYPE; total numeric; count_rows bigint;
BEGIN
  IF TG_TABLE_NAME = 'sales_header' THEN target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN target := OLD.sales_id;
  ELSE target := NEW.sales_id;
  END IF;
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = target;
  SELECT COUNT(*), COALESCE(SUM(CASE direction WHEN 'RECEIVE' THEN amount ELSE -amount END), 0)
    INTO count_rows, total FROM naijue_erp.sales_settlement WHERE sales_id = target;
  IF count_rows > 3 OR (h.status = 'APPROVED' AND total <> h.net_due) THEN
    RAISE EXCEPTION 'invalid final sales settlement count or approval equality' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sales_header_settlement_consistency AFTER INSERT OR UPDATE ON naijue_erp.sales_header
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_sales_settlement();
CREATE CONSTRAINT TRIGGER sales_rows_settlement_consistency AFTER INSERT OR UPDATE OR DELETE ON naijue_erp.sales_settlement
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_sales_settlement();


CREATE FUNCTION naijue_erp.keep_sales_line_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.sales_id <> OLD.sales_id THEN
    RAISE EXCEPTION 'retained sales line cannot move between documents' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_line_owner BEFORE UPDATE OF sales_id ON naijue_erp.sales_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_sales_line_owner();

-- Validate one command's final native rows, append-only evidence and compact result together.
CREATE FUNCTION naijue_erp.validate_sales_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.sales_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb; count_effects bigint;
BEGIN
  SELECT * INTO STRICT h FROM naijue_erp.sales_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version THEN
    RAISE EXCEPTION 'receipt/audit do not describe committed document version' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
    OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND count_effects = 0) THEN
    RAISE EXCEPTION 'receipt does not match immutable inventory effects' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
      LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (sl.sales_id <> NEW.target_id OR l.event_kind <> NEW.action
      OR l.source_document_version <> h.version OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) THEN
    RAISE EXCEPTION 'inventory source or balance is not committed with this operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sales_receipt_final_consistency AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_sales_commit();

COMMENT ON COLUMN naijue_erp.audit_change.before_values IS 'Audit bigint strings encode integer quantities and integer minor units at scale 2; no float amounts or credentials.';
COMMENT ON COLUMN naijue_erp.audit_change.after_values IS 'Key before/after evidence only; native headers/actual lines/settlements remain the business facts.';
INSERT INTO naijue_erp.schema_migration (version, description) VALUES (1, 'Bounded runtime sales pg adapter; not a full ERP or historical import');
COMMIT;
