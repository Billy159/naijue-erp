-- VERSION 0004: native new-runtime transfers and structured shared posting provenance.
-- SQL source / SQL-text contracts ONLY. Not executed against PostgreSQL; no engine evidence.
-- Additive to immutable 0001/0002; 0003 belongs to authentication. No business seeds or runner.
BEGIN;

CREATE TABLE naijue_erp.transfer_header (
  id uuid PRIMARY KEY, number text NOT NULL CHECK (length(number) > 0), business_date date NOT NULL,
  from_warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id),
  to_warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'VOID')), version integer NOT NULL CHECK (version > 0), note text,
  created_by_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id), created_hall_id uuid REFERENCES naijue_erp.hall(id),
  created_role text NOT NULL CHECK (created_role IN ('ADMIN', 'WAREHOUSE', 'SALESPERSON')),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  approved_by_account_id uuid REFERENCES naijue_erp.user_account(id), approved_at timestamptz,
  stock_basis text NOT NULL CHECK (stock_basis IN ('RUNTIME_LEDGER', 'CUTOFF_HISTORY')),
  CHECK (from_warehouse_id <> to_warehouse_id),
  CHECK ((status = 'APPROVED' AND approved_by_account_id IS NOT NULL AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_by_account_id IS NULL AND approved_at IS NULL))
);
CREATE TABLE naijue_erp.transfer_line (
  id uuid PRIMARY KEY, transfer_id uuid NOT NULL REFERENCES naijue_erp.transfer_header(id),
  line_no integer NOT NULL CHECK (line_no > 0), sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id),
  quantity bigint NOT NULL CHECK (quantity > 0),
  product_code_snapshot text NOT NULL, product_name_snapshot text NOT NULL, color_name_snapshot text NOT NULL,
  fit_name_snapshot text NOT NULL, size_name_snapshot text NOT NULL, barcode_snapshot text, is_current boolean NOT NULL,
  -- Derived uniqueness key only, not an additional business/display position.
  current_line_no integer GENERATED ALWAYS AS (CASE WHEN is_current THEN line_no END) STORED,
  CONSTRAINT transfer_line_current_position UNIQUE (transfer_id, current_line_no) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX transfer_header_date_order ON naijue_erp.transfer_header (business_date DESC, id);
CREATE INDEX transfer_header_from_scope ON naijue_erp.transfer_header (from_warehouse_id, business_date, id);
CREATE INDEX transfer_header_to_scope ON naijue_erp.transfer_header (to_warehouse_id, business_date, id);
COMMENT ON COLUMN naijue_erp.transfer_header.created_role IS 'Immutable normalized trusted authentication snapshot at creation, not request-selected salesperson identity.';
COMMENT ON COLUMN naijue_erp.transfer_header.stock_basis IS 'CUTOFF_HISTORY is a fail-closed reserved marker; 0004 enables neither historical import nor historical contribution reversal.';

-- Preserve shared target_id/object_id values and actor+request-key global uniqueness.
-- Generated nullable FK columns express a CLOSED tagged union, not an unreferenced target string.
ALTER TABLE naijue_erp.operation_receipt
  DROP CONSTRAINT operation_receipt_target_type_check,
  DROP CONSTRAINT operation_receipt_target_id_fkey,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER')),
  ADD COLUMN target_sales_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SALES' THEN target_id END) STORED REFERENCES naijue_erp.sales_header(id),
  ADD COLUMN target_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'TRANSFER' THEN target_id END) STORED REFERENCES naijue_erp.transfer_header(id),
  ADD CONSTRAINT receipt_kind_identity UNIQUE (id, actor_account_id, target_type, target_id, action);
ALTER TABLE naijue_erp.audit_change
  DROP CONSTRAINT audit_change_object_type_check,
  DROP CONSTRAINT audit_change_object_id_fkey,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER')),
  ADD COLUMN object_sales_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SALES' THEN object_id END) STORED REFERENCES naijue_erp.sales_header(id),
  ADD COLUMN object_transfer_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'TRANSFER' THEN object_id END) STORED REFERENCES naijue_erp.transfer_header(id),
  ADD CONSTRAINT audit_kind_identity UNIQUE (operation_id, object_type, object_id),
  ADD CONSTRAINT audit_receipt_kind_coherence FOREIGN KEY (operation_id, actor_account_id, object_type, object_id, action)
    REFERENCES naijue_erp.operation_receipt (id, actor_account_id, target_type, target_id, action) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_requires_same_kind_audit
  FOREIGN KEY (id, target_type, target_id) REFERENCES naijue_erp.audit_change (operation_id, object_type, object_id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_transfer_document_version ON naijue_erp.audit_change (object_id, new_version) WHERE object_type = 'TRANSFER';

-- 0001's result CHECK was unnamed. Discover ONLY that check by its referenced column,
-- rather than guessing PostgreSQL's generated constraint name or dropping unrelated guards.
DO $$
DECLARE constraint_name name;
BEGIN
  FOR constraint_name IN
    SELECT c.conname FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'naijue_erp.operation_receipt'::regclass AND c.contype = 'c' AND a.attname = 'result_data'
  LOOP
    EXECUTE format('ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK (
  jsonb_typeof(result_data) = 'object' AND result_data ?& ARRAY['operationId', 'version', 'status', 'ledgerEntryIds']
  AND jsonb_typeof(result_data->'operationId') = 'string'
  AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
  AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
  AND jsonb_typeof(result_data->'status') = 'string' AND result_data->>'status' IN ('DRAFT', 'APPROVED', 'VOID')
  AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array'
  AND CASE target_type
    WHEN 'SALES' THEN result_data ? 'salesId' AND NOT (result_data ? 'transferId')
      AND jsonb_typeof(result_data->'salesId') = 'string' AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
    WHEN 'TRANSFER' THEN result_data ? 'transferId' AND NOT (result_data ? 'salesId')
      AND jsonb_typeof(result_data->'transferId') = 'string' AND (result_data->>'transferId') IS NOT DISTINCT FROM target_id::text
    ELSE false END
);

ALTER TABLE naijue_erp.inventory_ledger
  ALTER COLUMN source_sales_line_id DROP NOT NULL,
  ADD COLUMN source_transfer_line_id uuid REFERENCES naijue_erp.transfer_line(id),
  DROP CONSTRAINT inventory_ledger_endpoint_check,
  ADD CONSTRAINT ledger_exactly_one_native_source CHECK (
    (source_sales_line_id IS NOT NULL AND source_transfer_line_id IS NULL AND endpoint = 'SALES_WAREHOUSE')
    OR (source_sales_line_id IS NULL AND source_transfer_line_id IS NOT NULL AND endpoint IN ('FROM', 'TO'))
  ),
  ADD CONSTRAINT ledger_transfer_operation_endpoint UNIQUE (operation_id, source_transfer_line_id, endpoint);
-- Existing sales source FK/operation+line+endpoint uniqueness, one-original-one-reversal
-- unique FK, event check, and all append-only ledger/audit/receipt triggers remain intact.
CREATE INDEX inventory_ledger_transfer_source ON naijue_erp.inventory_ledger (source_transfer_line_id, source_document_version);

CREATE FUNCTION naijue_erp.keep_transfer_header_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'retained transfer header cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.stock_basis <> 'RUNTIME_LEDGER' THEN
    RAISE EXCEPTION 'historical transfer writes are not enabled' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'runtime transfer must start as version one draft' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR OLD.stock_basis <> 'RUNTIME_LEDGER'
      OR ROW(NEW.created_by_account_id, NEW.created_hall_id, NEW.created_role, NEW.created_at, NEW.stock_basis)
        IS DISTINCT FROM ROW(OLD.created_by_account_id, OLD.created_hall_id, OLD.created_role, OLD.created_at, OLD.stock_basis) THEN
      RAISE EXCEPTION 'immutable transfer identity or creator provenance' USING ERRCODE = '23514';
    END IF;
    IF NEW.version::bigint <> OLD.version::bigint + 1 OR OLD.status = 'VOID'
      OR (OLD.status = 'APPROVED' AND NEW.status <> 'DRAFT') THEN
      RAISE EXCEPTION 'invalid transfer version or state transition' USING ERRCODE = '23514';
    END IF;
    IF NOT (OLD.status = 'DRAFT' AND NEW.status = 'DRAFT')
      AND ROW(NEW.number, NEW.business_date, NEW.from_warehouse_id, NEW.to_warehouse_id, NEW.note)
        IS DISTINCT FROM ROW(OLD.number, OLD.business_date, OLD.from_warehouse_id, OLD.to_warehouse_id, OLD.note) THEN
      RAISE EXCEPTION 'posting actions cannot edit transfer business facts' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER transfer_header_provenance BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.transfer_header
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_transfer_header_provenance();
CREATE FUNCTION naijue_erp.keep_transfer_line_owner() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'retained transfer line cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id THEN
    RAISE EXCEPTION 'retained transfer line cannot move between documents or identities' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER transfer_line_owner BEFORE UPDATE OR DELETE ON naijue_erp.transfer_line
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_transfer_line_owner();

-- Keep both original sales validation function bodies unchanged. WHEN dispatch prevents
-- a TRANSFER insert from being interpreted as SALES, without weakening SALES validation.
DROP TRIGGER validate_sales_ledger_source ON naijue_erp.inventory_ledger;
CREATE TRIGGER validate_sales_ledger_source BEFORE INSERT ON naijue_erp.inventory_ledger
  FOR EACH ROW WHEN (NEW.source_sales_line_id IS NOT NULL) EXECUTE FUNCTION naijue_erp.validate_sales_effect();
CREATE FUNCTION naijue_erp.validate_transfer_effect() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; ln naijue_erp.transfer_line%ROWTYPE;
  original naijue_erp.inventory_ledger%ROWTYPE; expected_delta numeric;
BEGIN
  SELECT * INTO STRICT ln FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id FOR SHARE;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = ln.transfer_id FOR UPDATE;
  expected_delta := CASE NEW.endpoint WHEN 'FROM' THEN -ln.quantity::numeric WHEN 'TO' THEN ln.quantity::numeric ELSE NULL END;
  IF NEW.event_kind = 'UNAPPROVE' THEN expected_delta := -expected_delta; END IF;
  IF h.stock_basis <> 'RUNTIME_LEDGER' OR NOT ln.is_current OR ln.sku_id <> NEW.sku_id
    OR NEW.warehouse_id IS DISTINCT FROM (CASE NEW.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END)
    OR NEW.quantity_delta::numeric IS DISTINCT FROM expected_delta OR h.business_date <> NEW.business_date
    OR h.version::bigint + 1 <> NEW.source_document_version
    OR (NEW.event_kind = 'APPROVE' AND h.status <> 'DRAFT') OR (NEW.event_kind = 'UNAPPROVE' AND h.status <> 'APPROVED') THEN
    RAISE EXCEPTION 'inconsistent runtime transfer source or endpoint effect' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer inventory coverage is not ready' USING ERRCODE = '23514'; END IF;
  IF NEW.event_kind = 'UNAPPROVE' THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE' OR original.source_sales_line_id IS NOT NULL
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id OR original.endpoint IS DISTINCT FROM NEW.endpoint
      OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id OR original.business_date <> NEW.business_date
      OR original.source_document_version <> h.version OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'invalid exact original transfer reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_transfer_ledger_source BEFORE INSERT ON naijue_erp.inventory_ledger
  FOR EACH ROW WHEN (NEW.source_transfer_line_id IS NOT NULL) EXECUTE FUNCTION naijue_erp.validate_transfer_effect();

-- Nullable source columns must not let a sales reversal point at a transfer (SQL <> NULL
-- alone would not reject it). This supplements, never replaces, validate_sales_effect.
CREATE FUNCTION naijue_erp.validate_exact_native_reversal() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE original naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  IF NEW.event_kind = 'UNAPPROVE' THEN
    SELECT * INTO STRICT original FROM naijue_erp.inventory_ledger WHERE id = NEW.reverses_entry_id;
    IF original.event_kind <> 'APPROVE'
      OR original.source_sales_line_id IS DISTINCT FROM NEW.source_sales_line_id
      OR original.source_transfer_line_id IS DISTINCT FROM NEW.source_transfer_line_id
      OR original.endpoint IS DISTINCT FROM NEW.endpoint OR original.warehouse_id <> NEW.warehouse_id OR original.sku_id <> NEW.sku_id
      OR original.business_date <> NEW.business_date OR original.quantity_delta::numeric + NEW.quantity_delta::numeric <> 0 THEN
      RAISE EXCEPTION 'reversal must match exact original native source and endpoint' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_native_reversal BEFORE INSERT ON naijue_erp.inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_exact_native_reversal();
CREATE FUNCTION naijue_erp.validate_ledger_receipt_source() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; owner_id uuid;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF NEW.source_sales_line_id IS NOT NULL THEN
    SELECT sales_id INTO STRICT owner_id FROM naijue_erp.sales_line WHERE id = NEW.source_sales_line_id;
    IF r.target_type <> 'SALES' THEN RAISE EXCEPTION 'sales ledger requires sales receipt' USING ERRCODE = '23514'; END IF;
  ELSE
    SELECT transfer_id INTO STRICT owner_id FROM naijue_erp.transfer_line WHERE id = NEW.source_transfer_line_id;
    IF r.target_type <> 'TRANSFER' THEN RAISE EXCEPTION 'transfer ledger requires transfer receipt' USING ERRCODE = '23514'; END IF;
  END IF;
  IF owner_id IS DISTINCT FROM r.target_id OR NEW.event_kind <> r.action
    OR NEW.source_document_version::text IS DISTINCT FROM r.result_data->>'version' THEN
    RAISE EXCEPTION 'ledger source kind target action or version differs from receipt' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_receipt_source_coherence AFTER INSERT ON naijue_erp.inventory_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_ledger_receipt_source();

-- Sparse key-field / actual changed-line audit only. Native rows remain business facts;
-- no full-document reconstruction, prior-draft snapshots, or whole-version audit chain.
-- The adapter writes each materially changed line once, with no deactivate-all rewrite.
CREATE FUNCTION naijue_erp.transfer_header_audit_values(source_row naijue_erp.transfer_header) RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, naijue_erp AS $$
  SELECT jsonb_build_object('number', (source_row).number, 'businessDate', to_char((source_row).business_date, 'YYYY-MM-DD'),
    'fromWarehouseId', (source_row).from_warehouse_id, 'toWarehouseId', (source_row).to_warehouse_id,
    'status', (source_row).status, 'version', (source_row).version, 'note', (source_row).note);
$$;
CREATE FUNCTION naijue_erp.transfer_line_audit_values(source_row naijue_erp.transfer_line) RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, naijue_erp AS $$
  SELECT jsonb_build_object('id', (source_row).id, 'lineNo', (source_row).line_no, 'skuId', (source_row).sku_id,
    'quantity', (source_row).quantity::text, 'snapshot', jsonb_build_object('productCode', (source_row).product_code_snapshot,
      'productName', (source_row).product_name_snapshot, 'colorName', (source_row).color_name_snapshot,
      'fitName', (source_row).fit_name_snapshot, 'sizeName', (source_row).size_name_snapshot, 'barcode', (source_row).barcode_snapshot),
    'isCurrent', (source_row).is_current);
$$;
CREATE FUNCTION naijue_erp.validate_transfer_header_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = NEW.id AND new_version = NEW.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> 'TRANSFER' OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(NEW) THEN
    RAISE EXCEPTION 'native transfer header requires matching operation and key-field audit' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR a.action <> 'SAVE' THEN
      RAISE EXCEPTION 'new transfer requires initial save evidence' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF a.old_version IS DISTINCT FROM OLD.version OR a.before_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(OLD) THEN
      RAISE EXCEPTION 'transfer key-field before evidence differs from replaced native header' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (SELECT version FROM naijue_erp.transfer_header WHERE id = NEW.id) IS DISTINCT FROM NEW.version THEN
    RAISE EXCEPTION 'one final transfer version per command transaction is required' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE FUNCTION naijue_erp.validate_transfer_line_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  before_line jsonb; after_line jsonb; before_count bigint; after_count bigint;
BEGIN
  -- A no-op UPDATE does not create a changed-line audit entry. Generated current_line_no
  -- is derived only; all actual line fields are included in the single-row comparison.
  IF TG_OP = 'UPDATE' THEN
    IF naijue_erp.transfer_line_audit_values(OLD) IS NOT DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.transfer_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'TRANSFER' AND object_id = h.id AND new_version = h.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF h.stock_basis <> 'RUNTIME_LEDGER' OR h.status <> 'DRAFT' OR a.action <> 'SAVE'
    OR r.target_type <> 'TRANSFER' OR r.target_id <> h.id OR r.action <> 'SAVE' OR r.actor_account_id <> a.actor_account_id THEN
    RAISE EXCEPTION 'native transfer line mutations require matching draft SAVE operation' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO before_count, before_line
    FROM jsonb_array_elements(COALESCE(a.before_values->'lines', '[]'::jsonb)) AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  SELECT COUNT(*), (jsonb_agg(delta.value))->0 INTO after_count, after_line
    FROM jsonb_array_elements(a.after_values->'lines') AS delta(value) WHERE delta.value->>'id' = NEW.id::text;
  IF after_count <> 1 OR after_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(NEW) THEN
    RAISE EXCEPTION 'changed native transfer line requires exact sparse after evidence' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF before_count <> 0 THEN RAISE EXCEPTION 'inserted transfer line cannot have prior-row evidence' USING ERRCODE = '23514'; END IF;
  ELSE
    IF before_count <> 1 OR before_line IS DISTINCT FROM naijue_erp.transfer_line_audit_values(OLD) THEN
      RAISE EXCEPTION 'changed native transfer line requires exact sparse before evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER transfer_header_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.transfer_header
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_transfer_header_commit();
CREATE CONSTRAINT TRIGGER transfer_line_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.transfer_line
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_transfer_line_commit();

CREATE FUNCTION naijue_erp.validate_transfer_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE h naijue_erp.transfer_header%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
  actual_ids jsonb; receipt_ids jsonb; count_effects bigint; current_lines bigint; before_lines jsonb; after_lines jsonb;
BEGIN
  SELECT * INTO STRICT h FROM naijue_erp.transfer_header WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF h.stock_basis <> 'RUNTIME_LEDGER' OR NEW.result_data->>'version' IS DISTINCT FROM h.version::text OR NEW.result_data->>'status' IS DISTINCT FROM h.status
    OR a.new_version <> h.version OR a.actor_account_id <> NEW.actor_account_id OR a.object_type <> 'TRANSFER'
    OR a.object_id <> h.id OR a.action <> NEW.action
    OR h.updated_at IS DISTINCT FROM NEW.completed_at OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR (NEW.action = 'APPROVE' AND (h.approved_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.approved_at IS DISTINCT FROM NEW.completed_at))
    OR h.status <> (CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END)
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR jsonb_typeof(a.after_values->'lines') IS DISTINCT FROM 'array'
    OR (a.after_values - ARRAY['header', 'lines']) <> '{}'::jsonb
    OR a.after_values->'header' IS DISTINCT FROM naijue_erp.transfer_header_audit_values(h)
    OR (a.old_version IS NULL AND (NEW.action <> 'SAVE' OR h.version <> 1 OR a.before_values IS NOT NULL
      OR h.created_by_account_id IS DISTINCT FROM NEW.actor_account_id OR h.created_at IS DISTINCT FROM NEW.completed_at))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR jsonb_typeof(a.before_values->'header') IS DISTINCT FROM 'object' OR jsonb_typeof(a.before_values->'lines') IS DISTINCT FROM 'array'
      OR (a.before_values - ARRAY['header', 'lines']) <> '{}'::jsonb
      OR a.before_values->'header'->>'version' IS DISTINCT FROM a.old_version::text
      OR a.before_values->'header'->>'status' IS DISTINCT FROM CASE NEW.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)) THEN
    RAISE EXCEPTION 'receipt audit action status key fields or version does not describe final transfer' USING ERRCODE = '23514';
  END IF;
  before_lines := COALESCE(a.before_values->'lines', '[]'::jsonb);
  after_lines := a.after_values->'lines';
  IF NEW.action <> 'SAVE' AND (before_lines <> '[]'::jsonb OR after_lines <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'posting audit must omit unchanged native transfer lines' USING ERRCODE = '23514';
  END IF;
  -- Deltas contain actual added/changed/deactivated rows only. No whole-native-line scan
  -- or previous-audit reconstruction is required to read or write the current document.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(after_lines) AS delta(value)
    LEFT JOIN naijue_erp.transfer_line ln ON ln.id::text = delta.value->>'id' AND ln.transfer_id = h.id
    WHERE jsonb_typeof(delta.value) IS DISTINCT FROM 'object' OR jsonb_typeof(delta.value->'id') IS DISTINCT FROM 'string'
      OR ln.id IS NULL OR delta.value IS DISTINCT FROM naijue_erp.transfer_line_audit_values(ln)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    WHERE jsonb_typeof(prior.value) IS DISTINCT FROM 'object' OR jsonb_typeof(prior.value->'id') IS DISTINCT FROM 'string'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(after_lines) AS next(value) WHERE next.value->>'id' = prior.value->>'id')
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(before_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT delta.value->>'id' FROM jsonb_array_elements(after_lines) AS delta(value) GROUP BY delta.value->>'id' HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(before_lines) AS prior(value)
    JOIN jsonb_array_elements(after_lines) AS next(value) ON next.value->>'id' = prior.value->>'id' WHERE next.value = prior.value
  ) THEN
    RAISE EXCEPTION 'invalid duplicate unchanged or non-native sparse transfer line delta' USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*) INTO current_lines FROM naijue_erp.transfer_line WHERE transfer_id = h.id AND is_current;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb), COUNT(*) INTO actual_ids, count_effects
    FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF current_lines = 0 OR actual_ids <> receipt_ids OR (NEW.action IN ('SAVE', 'VOID') AND count_effects <> 0)
    OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND count_effects <> current_lines * 2) THEN
    RAISE EXCEPTION 'transfer receipt does not match exact two-ended inventory effect set' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM naijue_erp.inventory_ledger l
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
    LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id = l.warehouse_id AND b.sku_id = l.sku_id
    WHERE l.operation_id = NEW.id AND (l.source_sales_line_id IS NOT NULL OR tl.transfer_id IS DISTINCT FROM h.id OR NOT tl.is_current
      OR l.event_kind <> NEW.action OR l.source_document_version <> h.version OR l.sku_id <> tl.sku_id OR l.business_date <> h.business_date
      OR l.posted_at IS DISTINCT FROM NEW.completed_at
      OR l.warehouse_id IS DISTINCT FROM CASE l.endpoint WHEN 'FROM' THEN h.from_warehouse_id WHEN 'TO' THEN h.to_warehouse_id ELSE NULL END
      OR l.quantity_delta::numeric IS DISTINCT FROM (CASE l.endpoint WHEN 'FROM' THEN -tl.quantity::numeric WHEN 'TO' THEN tl.quantity::numeric ELSE NULL END)
        * CASE NEW.action WHEN 'UNAPPROVE' THEN -1 ELSE 1 END
      OR b.last_operation_id IS DISTINCT FROM NEW.id)
  ) OR (NEW.action IN ('APPROVE', 'UNAPPROVE') AND EXISTS (
    SELECT 1 FROM naijue_erp.transfer_line tl CROSS JOIN (VALUES ('FROM'), ('TO')) required(endpoint)
    WHERE tl.transfer_id = h.id AND tl.is_current AND NOT EXISTS (
      SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id = NEW.id AND l.source_transfer_line_id = tl.id AND l.endpoint = required.endpoint
    )
  )) THEN
    RAISE EXCEPTION 'transfer endpoint source quantity or covered balance differs from committed operation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
-- The old SALES final-state validator stays unchanged and is now dispatched only for SALES.
DROP TRIGGER sales_receipt_final_consistency ON naijue_erp.operation_receipt;
CREATE CONSTRAINT TRIGGER sales_receipt_final_consistency AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.target_type = 'SALES') EXECUTE FUNCTION naijue_erp.validate_sales_commit();
CREATE CONSTRAINT TRIGGER transfer_receipt_final_consistency AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.target_type = 'TRANSFER') EXECUTE FUNCTION naijue_erp.validate_transfer_commit();

-- Validate the first OLD balance per operation/key against the final cumulative effect.
-- Repeated same-SKU real lines advance version once per effect, not once per aggregate.
-- Dispatch is TRANSFER-only and leaves old sales balance behavior unchanged. These
-- integrity guards supplement least-privilege runtime DB grants, not authentication/RLS.
CREATE FUNCTION naijue_erp.validate_transfer_balance_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_balance naijue_erp.inventory_balance%ROWTYPE; total numeric; effects bigint;
BEGIN
  IF NEW.last_operation_id IS NULL OR OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF r.target_type <> 'TRANSFER' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT final_balance FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  SELECT COALESCE(SUM(quantity_delta::numeric), 0), COUNT(*) INTO total, effects FROM naijue_erp.inventory_ledger
    WHERE operation_id = NEW.last_operation_id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF effects = 0 OR final_balance.last_operation_id IS DISTINCT FROM NEW.last_operation_id
    OR final_balance.quantity::numeric <> OLD.quantity::numeric + total OR final_balance.version::numeric <> OLD.version::numeric + effects THEN
    RAISE EXCEPTION 'transfer balance quantity or version is not the exact cumulative operation delta' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER transfer_balance_final_consistency AFTER UPDATE ON naijue_erp.inventory_balance
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_transfer_balance_commit();

INSERT INTO naijue_erp.schema_migration (version, description) VALUES (4, 'Native runtime transfer commands and closed shared SALES/TRANSFER provenance; SQL source only');
COMMIT;
