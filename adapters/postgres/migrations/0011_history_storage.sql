-- VERSION 0011: isolated historical storage. SQL SOURCE ONLY; no engine/import proof.
-- Native live validation and SKU-only barcode bindings are unchanged.
-- Original evidence is immutable; future audited correction commands are NOT enabled here.
BEGIN;
CREATE TABLE naijue_erp.import_source_row (
  id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  entity_type text NOT NULL CHECK (length(entity_type) > 0), source_key text NOT NULL CHECK (length(source_key) > 0),
  file_ref text NOT NULL, sheet text NOT NULL, row_no bigint NOT NULL CHECK (row_no > 0),
  source_file_sha256 text NOT NULL CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  row_sha256 text NOT NULL CHECK (row_sha256 ~ '^[0-9a-f]{64}$'),
  raw_fields jsonb NOT NULL CHECK (jsonb_typeof(raw_fields) = 'object'),
  normalized_fields jsonb NOT NULL CHECK (jsonb_typeof(normalized_fields) = 'object'),
  field_provenance jsonb NOT NULL CHECK ((jsonb_typeof(field_provenance) = 'object'
    AND field_provenance->'schema_version' = '1'::jsonb AND jsonb_typeof(field_provenance->'fields') = 'object') IS TRUE),
  UNIQUE (batch_id, source_file_sha256, sheet, row_no), UNIQUE (batch_id, id)
);
CREATE INDEX import_source_identity ON naijue_erp.import_source_row(batch_id, entity_type, source_key);
-- Explicit native bindings are migration provenance, never guessed from source_key.
CREATE UNIQUE INDEX import_product_native_once ON naijue_erp.import_source_row(batch_id, (field_provenance->>'native_product_id'))
  WHERE entity_type = 'PRODUCT' AND field_provenance ? 'native_product_id';
CREATE UNIQUE INDEX import_barcode_native_once ON naijue_erp.import_source_row(batch_id, (field_provenance->>'native_barcode'))
  WHERE entity_type = 'BARCODE' AND field_provenance ? 'native_barcode';
CREATE TABLE naijue_erp.import_sku_alias (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id), old_source_sku_id text NOT NULL,
  canonical_sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id), source_row_id uuid NOT NULL,
  canonical_source_key text NOT NULL, mapping_basis text NOT NULL,
  PRIMARY KEY (batch_id, old_source_sku_id), UNIQUE (batch_id, source_row_id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id)
);
CREATE INDEX import_alias_target ON naijue_erp.import_sku_alias(canonical_sku_id);
CREATE TABLE naijue_erp.history_sales_header (
  id uuid PRIMARY KEY, source_row_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  version integer NOT NULL CHECK (version > 0), number text NOT NULL, business_date date,
  source_status text NOT NULL CHECK (source_status IN ('DRAFT', 'APPROVED', 'VOID')), note text,
  created_by_source_key text, approved_by_source_key text,
  created_hall_id uuid REFERENCES naijue_erp.hall(id),
  created_hall_provenance text NOT NULL CHECK (created_hall_provenance IN ('ORIGINAL', 'MIGRATION_DERIVED', 'UNKNOWN')),
  created_hall_reason text NOT NULL CHECK (length(btrim(created_hall_reason)) > 0),
  created_local_at timestamp without time zone, updated_local_at timestamp without time zone,
  approved_local_at timestamp without time zone, created_instant timestamptz, updated_instant timestamptz, approved_instant timestamptz,
  CHECK ((created_hall_provenance = 'UNKNOWN') = (created_hall_id IS NULL)),
  UNIQUE (batch_id, id),
  business_type text NOT NULL CHECK (business_type IN ('SALE', 'RETURN', 'EXCHANGE')),
  hall_id uuid NOT NULL REFERENCES naijue_erp.hall(id), customer_id uuid NOT NULL REFERENCES naijue_erp.customer(id),
  warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id), salesperson_id uuid REFERENCES naijue_erp.staff(id),
  gross_amount numeric(18,2) NOT NULL, order_discount numeric(18,2) NOT NULL, net_due numeric(18,2) NOT NULL
);
CREATE TABLE naijue_erp.history_transfer_header (
  id uuid PRIMARY KEY, source_row_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  version integer NOT NULL CHECK (version > 0), number text NOT NULL, business_date date,
  source_status text NOT NULL CHECK (source_status IN ('DRAFT', 'APPROVED', 'VOID')), note text,
  created_by_source_key text, approved_by_source_key text,
  created_hall_id uuid REFERENCES naijue_erp.hall(id),
  created_hall_provenance text NOT NULL CHECK (created_hall_provenance IN ('ORIGINAL', 'MIGRATION_DERIVED', 'UNKNOWN')),
  created_hall_reason text NOT NULL CHECK (length(btrim(created_hall_reason)) > 0),
  created_local_at timestamp without time zone, updated_local_at timestamp without time zone,
  approved_local_at timestamp without time zone, created_instant timestamptz, updated_instant timestamptz, approved_instant timestamptz,
  CHECK ((created_hall_provenance = 'UNKNOWN') = (created_hall_id IS NULL)),
  UNIQUE (batch_id, id),
  from_warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id),
  to_warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id), created_role_source text,
  CHECK (from_warehouse_id <> to_warehouse_id)
);
CREATE TABLE naijue_erp.history_sales_line (
  id uuid PRIMARY KEY, source_row_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  header_id uuid NOT NULL, line_no integer NOT NULL CHECK (line_no > 0),
  FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_sales_header(batch_id, id),
  sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id), quantity bigint NOT NULL,
  product_code_snapshot text, product_name_snapshot text, color_name_snapshot text,
  fit_name_snapshot text, size_name_snapshot text, barcode_snapshot text,
  reference_price numeric(18,2), deal_price numeric(18,2) NOT NULL, line_amount numeric(18,2) NOT NULL,
  allocated_discount numeric(18,2), is_gift boolean, pricing_method_source text,
  discount_tenths integer, ordinary_zero_confirmed boolean,
  UNIQUE (header_id, line_no)
);
CREATE TABLE naijue_erp.history_transfer_line (
  id uuid PRIMARY KEY, source_row_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  header_id uuid NOT NULL, line_no integer NOT NULL CHECK (line_no > 0),
  FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_transfer_header(batch_id, id),
  sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id), quantity bigint NOT NULL,
  product_code_snapshot text, product_name_snapshot text, color_name_snapshot text,
  fit_name_snapshot text, size_name_snapshot text, barcode_snapshot text,
  UNIQUE (header_id, line_no)
);
CREATE TABLE naijue_erp.history_sales_settlement (
  id uuid PRIMARY KEY, source_row_id uuid NOT NULL UNIQUE,
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  header_id uuid NOT NULL, line_no integer NOT NULL CHECK (line_no > 0),
  FOREIGN KEY (batch_id, header_id) REFERENCES naijue_erp.history_sales_header(batch_id, id),
  payment_account_id uuid NOT NULL REFERENCES naijue_erp.payment_account(id),
  direction text NOT NULL CHECK (direction IN ('RECEIVE', 'REFUND')), amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  account_name_snapshot text, method_name_snapshot text,
  payment_method_id_snapshot uuid REFERENCES naijue_erp.payment_method(id), UNIQUE (header_id, line_no)
);
CREATE TABLE naijue_erp.import_stock_contributor (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id), source_row_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES naijue_erp.warehouse(id), canonical_sku_id uuid NOT NULL REFERENCES naijue_erp.sku(id),
  old_source_sku_id text NOT NULL, canonical_stock_source_key text NOT NULL, source_unit text NOT NULL,
  signed_quantity bigint NOT NULL, baseline_ledger_id uuid REFERENCES naijue_erp.inventory_ledger(id),
  PRIMARY KEY (batch_id, source_row_id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  FOREIGN KEY (batch_id, old_source_sku_id) REFERENCES naijue_erp.import_sku_alias(batch_id, old_source_sku_id)
);
CREATE TABLE naijue_erp.history_revision (
  id uuid PRIMARY KEY, document_kind text NOT NULL CHECK (document_kind IN ('SALES', 'TRANSFER')),
  sales_id uuid REFERENCES naijue_erp.history_sales_header(id), transfer_id uuid REFERENCES naijue_erp.history_transfer_header(id),
  from_version integer NOT NULL CHECK (from_version > 0), to_version integer NOT NULL CHECK (to_version = from_version + 1),
  actor_account_id uuid NOT NULL REFERENCES naijue_erp.user_account(id), request_key text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0), changed_at timestamptz NOT NULL,
  before_facts jsonb NOT NULL CHECK (jsonb_typeof(before_facts) = 'object'),
  after_facts jsonb NOT NULL CHECK (jsonb_typeof(after_facts) = 'object'), stock_effect_basis text NOT NULL,
  stock_effect_evidence jsonb NOT NULL CHECK (jsonb_typeof(stock_effect_evidence) = 'object'),
  CHECK ((document_kind = 'SALES' AND sales_id IS NOT NULL AND transfer_id IS NULL)
    OR (document_kind = 'TRANSFER' AND transfer_id IS NOT NULL AND sales_id IS NULL)),
  UNIQUE (actor_account_id, request_key)
);
CREATE UNIQUE INDEX history_sales_revision_once ON naijue_erp.history_revision(sales_id, to_version) WHERE sales_id IS NOT NULL;
CREATE UNIQUE INDEX history_transfer_revision_once ON naijue_erp.history_revision(transfer_id, to_version) WHERE transfer_id IS NOT NULL;
-- No correction API/privilege is shipped before baseline-aware effect semantics are approved.
CREATE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audited historical correction command not enabled' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER history_revision_closed BEFORE INSERT ON naijue_erp.history_revision FOR EACH ROW EXECUTE FUNCTION naijue_erp.history_revision_not_enabled();

CREATE FUNCTION naijue_erp.guard_history_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; source naijue_erp.import_source_row%ROWTYPE; duplicate_found boolean;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.batch_id FOR UPDATE;
  IF b.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED', 'VALIDATING') THEN
    RAISE EXCEPTION 'historical staging scope is closed' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'import_source_row' THEN
    -- Reject known original PRODUCT scope even when caller relabels its entity/normalized scope.
    IF NEW.raw_fields->>'绑定范围' = 'PRODUCT' OR NEW.normalized_fields->>'绑定范围' = 'PRODUCT' THEN
      RAISE EXCEPTION 'excluded original PRODUCT barcode is not a database source row' USING ERRCODE = '23514'; END IF;
    -- Excluded PRODUCT-bound barcodes remain file-level evidence outside this database.
    IF NEW.entity_type = 'BARCODE' AND ((NEW.field_provenance->>'native_sku_id') IS NULL
      OR NEW.field_provenance ? 'native_product_id'
      OR (NEW.normalized_fields->>'绑定范围') IS DISTINCT FROM 'SKU'
      OR (NEW.field_provenance->>'native_barcode') IS DISTINCT FROM (NEW.normalized_fields->>'条码')) THEN
      RAISE EXCEPTION 'only effective SKU barcode source rows may be staged' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(NEW.field_provenance->'fields') f
      WHERE (jsonb_typeof(f.value) = 'object' AND f.value->>'origin' IN ('ORIGINAL','MIGRATION_DERIVED','UNKNOWN')
        AND jsonb_typeof(f.value->'reason') = 'string' AND f.value ? 'raw'
        AND (f.value->>'origin' <> 'MIGRATION_DERIVED' OR length(f.value->>'evidence_ref') > 0)) IS DISTINCT FROM TRUE) THEN
      RAISE EXCEPTION 'invalid versioned field provenance' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO STRICT source FROM naijue_erp.import_source_row WHERE id = NEW.source_row_id AND batch_id = NEW.batch_id;
  IF source.entity_type <> TG_ARGV[0] THEN RAISE EXCEPTION 'historical source entity differs' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME LIKE 'history_%' THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM naijue_erp.%I p JOIN naijue_erp.import_source_row s ON s.id = p.source_row_id WHERE p.batch_id = $1 AND s.source_key = $2)', TG_TABLE_NAME)
      INTO duplicate_found USING NEW.batch_id, source.source_key;
    IF duplicate_found THEN RAISE EXCEPTION 'duplicate canonical historical source identity' USING ERRCODE = '23505'; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('history_sales_header', 'history_transfer_header') THEN
    IF NEW.version <> 1 THEN RAISE EXCEPTION 'initial historical version must be one' USING ERRCODE = '23514'; END IF;
    IF NEW.created_hall_provenance = 'MIGRATION_DERIVED' AND
      (length(source.field_provenance->'fields'->'created_hall_id'->>'evidence_ref') > 0) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'derived creator hall needs evidence' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'import_sku_alias' AND source.source_key IS DISTINCT FROM NEW.old_source_sku_id THEN
    RAISE EXCEPTION 'alias must retain its original source identity' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'import_stock_contributor' THEN
    -- Exact original lineage CSV row lives in immutable evidence, not only aggregate totals.
    IF (source.field_provenance->'stock_contribution'->>'validator_version' = 'STOCK_CONTRIBUTOR_LINEAGE_V1'
      AND source.field_provenance->'stock_contribution'->>'oldStockSourceId' = source.source_key
      AND source.raw_fields->>'来源编号' = source.source_key
      AND source.field_provenance->'stock_contribution'->>'canonicalStockRowSourceId' = NEW.canonical_stock_source_key
      AND source.field_provenance->'stock_contribution'->>'oldSkuSourceId' = NEW.old_source_sku_id
      AND source.field_provenance->'stock_contribution'->>'signedQuantity' = NEW.signed_quantity::text
      AND source.field_provenance->'stock_contribution'->>'sourceUnit' = NEW.source_unit
      AND source.field_provenance->'stock_contribution'->>'sourceFile' = source.file_ref
      AND source.field_provenance->'stock_contribution'->>'sourceSheet' = source.sheet
      AND source.field_provenance->'stock_contribution'->>'sourceRow' = source.row_no::text
      AND source.field_provenance->'stock_contribution'->>'sourceSha256' = source.source_file_sha256
      AND source.raw_fields->>'SKU来源编号' = NEW.old_source_sku_id
      AND source.raw_fields->>'仓库来源编号' = source.field_provenance->'stock_contribution'->>'warehouseSourceId'
      AND source.raw_fields->>'核准库存数量' ~ '^(0|-?[1-9][0-9]*)$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'contributor differs from its original occurrence lineage' USING ERRCODE = '23514'; END IF;
    IF (source.raw_fields->>'核准库存数量')::numeric <> NEW.signed_quantity THEN
      RAISE EXCEPTION 'contributor quantity differs from original signed quantity' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id = NEW.batch_id
      AND a.old_source_sku_id = NEW.old_source_sku_id AND a.canonical_source_key = source.field_provenance->'stock_contribution'->>'canonicalSkuSourceId') THEN
      RAISE EXCEPTION 'contributor canonical source differs from alias' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'import_stock_contributor' AND NOT EXISTS (
    SELECT 1 FROM naijue_erp.import_sku_alias WHERE batch_id = NEW.batch_id AND old_source_sku_id = NEW.old_source_sku_id AND canonical_sku_id = NEW.canonical_sku_id) THEN
    RAISE EXCEPTION 'contributor alias target differs' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_source_row_stage BEFORE INSERT ON naijue_erp.import_source_row FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('');
CREATE TRIGGER import_sku_alias_stage BEFORE INSERT ON naijue_erp.import_sku_alias FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('SKU');
CREATE TRIGGER history_sales_header_stage BEFORE INSERT ON naijue_erp.history_sales_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('SALES_HEADER');
CREATE TRIGGER history_transfer_header_stage BEFORE INSERT ON naijue_erp.history_transfer_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('TRANSFER_HEADER');
CREATE TRIGGER history_sales_line_stage BEFORE INSERT ON naijue_erp.history_sales_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('SALES_LINE');
CREATE TRIGGER history_transfer_line_stage BEFORE INSERT ON naijue_erp.history_transfer_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('TRANSFER_LINE');
CREATE TRIGGER history_sales_settlement_stage BEFORE INSERT ON naijue_erp.history_sales_settlement FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('SETTLEMENT');
CREATE TRIGGER import_stock_contributor_stage BEFORE INSERT ON naijue_erp.import_stock_contributor FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_insert('INVENTORY_BASELINE');
CREATE TRIGGER import_source_row_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_source_row FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER import_source_row_no_truncate BEFORE TRUNCATE ON naijue_erp.import_source_row EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_source_row FROM PUBLIC;
CREATE TRIGGER import_sku_alias_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_sku_alias FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER import_sku_alias_no_truncate BEFORE TRUNCATE ON naijue_erp.import_sku_alias EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_sku_alias FROM PUBLIC;
CREATE TRIGGER history_sales_header_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_sales_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_sales_header_no_truncate BEFORE TRUNCATE ON naijue_erp.history_sales_header EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_sales_header FROM PUBLIC;
CREATE TRIGGER history_transfer_header_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_transfer_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_transfer_header_no_truncate BEFORE TRUNCATE ON naijue_erp.history_transfer_header EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_transfer_header FROM PUBLIC;
CREATE TRIGGER history_sales_line_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_sales_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_sales_line_no_truncate BEFORE TRUNCATE ON naijue_erp.history_sales_line EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_sales_line FROM PUBLIC;
CREATE TRIGGER history_transfer_line_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_transfer_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_transfer_line_no_truncate BEFORE TRUNCATE ON naijue_erp.history_transfer_line EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_transfer_line FROM PUBLIC;
CREATE TRIGGER history_sales_settlement_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_sales_settlement FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_sales_settlement_no_truncate BEFORE TRUNCATE ON naijue_erp.history_sales_settlement EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_sales_settlement FROM PUBLIC;
CREATE TRIGGER import_stock_contributor_immutable BEFORE DELETE ON naijue_erp.import_stock_contributor FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER import_stock_contributor_no_truncate BEFORE TRUNCATE ON naijue_erp.import_stock_contributor EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_stock_contributor FROM PUBLIC;
CREATE TRIGGER history_revision_immutable BEFORE UPDATE OR DELETE ON naijue_erp.history_revision FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_revision_no_truncate BEFORE TRUNCATE ON naijue_erp.history_revision EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.history_revision FROM PUBLIC;

-- The only staging amendment is filling a previously unknown baseline reference.
CREATE FUNCTION naijue_erp.guard_contributor_link() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE state text;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT status INTO STRICT state FROM naijue_erp.import_batch WHERE id = OLD.batch_id FOR UPDATE;
  IF state NOT IN ('STAGED','VALIDATING') OR OLD.baseline_ledger_id IS NOT NULL OR NEW.baseline_ledger_id IS NULL
    OR (to_jsonb(NEW) - 'baseline_ledger_id') IS DISTINCT FROM (to_jsonb(OLD) - 'baseline_ledger_id') THEN
    RAISE EXCEPTION 'only initial staged baseline attachment is allowed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_stock_contributor_link BEFORE UPDATE ON naijue_erp.import_stock_contributor
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_contributor_link();

-- Fixed counts are separate from the existing four native cutoff counters.
CREATE FUNCTION naijue_erp.valid_history_counts(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes']
    AND value - ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'] = '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(value) e WHERE jsonb_typeof(e.value) <> 'number' OR e.value::text !~ '^[0-9]+$')) IS TRUE;
$$;
ALTER TABLE naijue_erp.import_batch
  ADD COLUMN history_expected_counts jsonb CHECK (history_expected_counts IS NULL OR naijue_erp.valid_history_counts(history_expected_counts)),
  ADD COLUMN history_actual_counts jsonb CHECK (history_actual_counts IS NULL OR naijue_erp.valid_history_counts(history_actual_counts)),
  ADD COLUMN history_payload_hash text CHECK (history_payload_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN history_validation_passed boolean NOT NULL DEFAULT false;

-- Optional per-product nine-input proof: absence is NOT completeness.
-- The live SALES reader must recheck current version/prices in its own transaction.
CREATE FUNCTION naijue_erp.validate_history_product_proofs(batch uuid) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE source naijue_erp.import_source_row%ROWTYPE; product_row jsonb; proof jsonb; prices jsonb; key text; raw_key text; raw_value jsonb;
  keys text[] := ARRAY['purchase_price','retail_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'];
  raw_keys text[] := ARRAY['采购价','零售价','五级批发价（工厂店供货价）','六级批发价（贴牌价）','七级批发价（批发价）','八级批发价（代理商供货价）','九级批发价（工厂店零售价）','十级批发价（葛玉珠）','最低售价'];
  i integer;
BEGIN
  FOR source IN SELECT * FROM naijue_erp.import_source_row WHERE batch_id = batch AND entity_type = 'PRODUCT' LOOP
    IF NOT source.field_provenance ? 'native_product_id' THEN
      RAISE EXCEPTION 'product evidence needs an explicit native binding' USING ERRCODE = '23514'; END IF;
    SELECT to_jsonb(p) INTO product_row FROM naijue_erp.product p WHERE p.id::text = source.field_provenance->>'native_product_id' FOR SHARE;
    IF product_row IS NULL THEN RAISE EXCEPTION 'product evidence target missing' USING ERRCODE = '23503'; END IF;
    IF NOT source.field_provenance ? 'product_input_proof' THEN CONTINUE; END IF;
    proof := source.field_provenance->'product_input_proof'; prices := proof->'prices';
    IF (jsonb_typeof(proof) = 'object' AND proof->'schema_version' = '1'::jsonb
      AND proof->>'validator_version' = 'NINE_PRICE_EXPLICIT_V1'
      AND proof->>'blank_price_policy' IN ('EXPLICIT_NULL_ONLY','V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET')
      AND proof->'product_version' = product_row->'version'
      AND proof ?& ARRAY['schema_version','validator_version','blank_price_policy','product_version','prices']
      AND proof - ARRAY['schema_version','validator_version','blank_price_policy','product_version','prices'] = '{}'::jsonb
      AND jsonb_typeof(prices) = 'object' AND prices ?& keys AND prices - keys = '{}'::jsonb) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'invalid nine-price completeness proof' USING ERRCODE = '23514'; END IF;
    FOR i IN 1..9 LOOP
      key := keys[i]; raw_key := raw_keys[i]; raw_value := source.raw_fields->raw_key;
      IF NOT source.raw_fields ? raw_key THEN RAISE EXCEPTION 'missing original price input' USING ERRCODE = '23514'; END IF;
      IF prices->key = 'null'::jsonb THEN
        IF (raw_value = 'null'::jsonb OR (proof->>'blank_price_policy' = 'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET' AND raw_value = '""'::jsonb)) IS DISTINCT FROM TRUE
          OR product_row->key IS DISTINCT FROM 'null'::jsonb THEN
          RAISE EXCEPTION 'unset price needs explicit original null or versioned exact-column blank evidence, never missing' USING ERRCODE = '23514'; END IF;
      ELSE
        IF (jsonb_typeof(prices->key) = 'string' AND prices->>key ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$'
          AND jsonb_typeof(raw_value) = 'string' AND source.raw_fields->>raw_key ~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,2})?$') IS DISTINCT FROM TRUE THEN
          RAISE EXCEPTION 'invalid explicit decimal price input' USING ERRCODE = '23514'; END IF;
        IF (prices->>key)::numeric IS DISTINCT FROM (product_row->>key)::numeric
          OR (prices->>key)::numeric <> (source.raw_fields->>raw_key)::numeric THEN
          RAISE EXCEPTION 'price proof differs from original input or native value' USING ERRCODE = '23514'; END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION naijue_erp.guard_history_publication() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN
  -- Legacy published batches remain valid. No alternative mapping can carry this data.
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' THEN
    IF NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_payload_hash IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'history metadata requires the explicit v2 mapping' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF NEW.history_expected_counts IS NULL OR NEW.history_payload_hash IS NULL THEN
    RAISE EXCEPTION 'v2 requires frozen expected counts and exact payload hash at staging' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.history_expected_counts IS DISTINCT FROM OLD.history_expected_counts
    OR NEW.history_payload_hash IS DISTINCT FROM OLD.history_payload_hash) THEN
    RAISE EXCEPTION 'historical input identity cannot change on retry' USING ERRCODE = '23514'; END IF;
  IF NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  IF NOT NEW.history_validation_passed OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts THEN
    RAISE EXCEPTION 'historical validation and exact counts required for atomic publication' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor'] LOOP
    EXECUTE format('SELECT count(*) FROM naijue_erp.%I WHERE batch_id = $1', kind) INTO actual USING NEW.id;
    IF actual::numeric <> (NEW.history_expected_counts->>kind)::numeric THEN
      RAISE EXCEPTION 'historical table count mismatch: %', kind USING ERRCODE = '23514'; END IF;
  END LOOP;
  PERFORM naijue_erp.validate_history_product_proofs(NEW.id);
  -- Only imported SKU bindings; no PRODUCT carrier or native barcode schema change.
  SELECT count(*) INTO actual FROM naijue_erp.import_source_row s
    JOIN naijue_erp.sku_barcode bc ON bc.barcode = s.field_provenance->>'native_barcode'
      AND bc.sku_id::text = s.field_provenance->>'native_sku_id'
    WHERE s.batch_id = NEW.id AND s.entity_type = 'BARCODE';
  IF actual::numeric <> (NEW.history_expected_counts->>'barcodes')::numeric
    OR actual <> (SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id = NEW.id AND entity_type = 'BARCODE') THEN
    RAISE EXCEPTION 'SKU barcode evidence does not reconcile' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id = NEW.id AND business_date IS NULL)
    OR EXISTS (SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id = NEW.id AND business_date IS NULL) THEN
    RAISE EXCEPTION 'unresolved business dates cannot publish' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id = NEW.id AND NOT EXISTS (
    SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = a.batch_id AND r.target_type = 'SKU'
      AND r.status = 'IMPORTED' AND r.target_id = a.canonical_sku_id AND r.source_key = a.canonical_source_key)) THEN
    RAISE EXCEPTION 'alias canonical source does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c JOIN naijue_erp.import_source_row s ON s.id = c.source_row_id
    WHERE c.batch_id = NEW.id AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
      AND r.target_type = 'WAREHOUSE' AND r.status = 'IMPORTED' AND r.target_id = c.warehouse_id
      AND r.source_key = s.field_provenance->'stock_contribution'->>'warehouseSourceId')) THEN
    RAISE EXCEPTION 'contributor source warehouse does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c LEFT JOIN naijue_erp.inventory_ledger l ON l.id = c.baseline_ledger_id
    WHERE c.batch_id = NEW.id AND (l.id IS NULL OR l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id <> c.batch_id
      OR l.warehouse_id <> c.warehouse_id OR l.sku_id <> c.canonical_sku_id
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
        AND r.target_type = 'INVENTORY_LEDGER' AND r.status = 'IMPORTED' AND r.target_id = c.baseline_ledger_id
        AND r.source_key = c.canonical_stock_source_key))) THEN
    RAISE EXCEPTION 'stock contributor must bind its exact baseline' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor WHERE batch_id = NEW.id
    GROUP BY warehouse_id, canonical_sku_id HAVING count(DISTINCT source_unit) <> 1 OR bool_or(length(btrim(source_unit)) = 0)) THEN
    RAISE EXCEPTION 'incompatible or unknown stock units require explicit resolution' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN (
      SELECT baseline_ledger_id, sum(signed_quantity::numeric) total FROM naijue_erp.import_stock_contributor
      WHERE batch_id = NEW.id GROUP BY baseline_ledger_id) c ON c.baseline_ledger_id = l.id
    WHERE l.source_import_batch_id = NEW.id AND (c.total IS NULL OR c.total <> l.quantity_delta)) THEN
    RAISE EXCEPTION 'stock contribution sums differ from cutoff baseline' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
-- Runs alongside (not instead of) 0007's stock, receipt, audit and transition guards.
CREATE TRIGGER import_batch_history_publication BEFORE INSERT OR UPDATE ON naijue_erp.import_batch
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_publication();
INSERT INTO naijue_erp.schema_migration(version, description)
  VALUES (11, 'Nullable historical projections and immutable import evidence; atomic v2 publication; corrections not yet enabled; SQL source only');
COMMIT;
