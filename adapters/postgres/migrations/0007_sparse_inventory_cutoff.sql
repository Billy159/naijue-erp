-- VERSION 0007: approved sparse cutoff/import foundation. SQL SOURCE ONLY, NOT ENGINE EVIDENCE.
-- Adds only the two previously approved import tables and previously approved provenance columns.
-- No business seed, zero Cartesian product, compatibility store, or historical write enablement.
BEGIN;
CREATE TABLE naijue_erp.import_batch (
  id uuid PRIMARY KEY, source_name text NOT NULL CHECK (source_name ~ '^[a-z][a-z0-9_.:-]*$'),
  source_manifest_ref text NOT NULL CHECK (length(btrim(source_manifest_ref)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'), cutoff_at timestamptz NOT NULL,
  mapping_version text NOT NULL CHECK (length(btrim(mapping_version)) > 0),
  inventory_mode text NOT NULL CHECK (inventory_mode = 'CUTOFF_STOCK_BASELINE'),
  status text NOT NULL CHECK (status IN ('STAGED', 'VALIDATING', 'PASSED', 'IMPORTED', 'FAILED')),
  checkpoint jsonb NOT NULL, created_at timestamptz NOT NULL, completed_at timestamptz,
  CHECK ((status = 'IMPORTED') = (completed_at IS NOT NULL)),
  CHECK ((jsonb_typeof(checkpoint) = 'object' AND checkpoint ?& ARRAY['sequence', 'cursor', 'counts', 'expected']
    AND (checkpoint - ARRAY['sequence', 'cursor', 'counts', 'expected']) = '{}'::jsonb
    AND checkpoint->>'sequence' ~ '^[0-9]+$' AND checkpoint->>'cursor' ~ '^[0-9]+$'
    AND jsonb_typeof(checkpoint->'counts') = 'object' AND jsonb_typeof(checkpoint->'expected') = 'object') IS TRUE)
);
-- Exactly one formal initial takeover. Failed/staged work is not a published scope.
CREATE UNIQUE INDEX import_one_published_cutoff ON naijue_erp.import_batch (inventory_mode) WHERE status = 'IMPORTED';
CREATE TABLE naijue_erp.import_record (
  id uuid PRIMARY KEY, import_batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  source_entity_type text NOT NULL CHECK (length(btrim(source_entity_type)) > 0),
  source_key text NOT NULL CHECK (length(source_key) > 0),
  source_record_hash text NOT NULL CHECK (source_record_hash ~ '^[0-9a-f]{64}$'),
  source_file_ref text NOT NULL CHECK (length(btrim(source_file_ref)) > 0),
  target_type text CHECK (target_type IN ('WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH')),
  target_id uuid, status text NOT NULL CHECK (status IN ('ACCEPTED', 'QUARANTINED', 'EXCLUDED', 'CONFLICT', 'IMPORTED')),
  decision_reason text, reviewed_at timestamptz,
  UNIQUE (import_batch_id, source_entity_type, source_key),
  CHECK ((target_type IS NULL) = (target_id IS NULL)),
  CHECK (status <> 'IMPORTED' OR (target_type IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX import_scope_target_once ON naijue_erp.import_record (import_batch_id, target_type, target_id)
  WHERE status = 'IMPORTED';
CREATE INDEX import_record_source_identity ON naijue_erp.import_record (source_entity_type, source_key, import_batch_id);
ALTER TABLE naijue_erp.sales_header ADD COLUMN import_batch_id uuid REFERENCES naijue_erp.import_batch(id);
ALTER TABLE naijue_erp.transfer_header ADD COLUMN import_batch_id uuid REFERENCES naijue_erp.import_batch(id);
ALTER TABLE naijue_erp.inventory_ledger ADD COLUMN source_import_batch_id uuid REFERENCES naijue_erp.import_batch(id),
  ALTER COLUMN source_document_version DROP NOT NULL,
  DROP CONSTRAINT inventory_ledger_event_kind_check,
  DROP CONSTRAINT ledger_exactly_one_native_source,
  ADD CONSTRAINT ledger_event_kind CHECK (event_kind IN ('APPROVE', 'UNAPPROVE', 'CUTOFF_BASELINE')),
  ADD CONSTRAINT ledger_closed_source CHECK ((
    (event_kind = 'CUTOFF_BASELINE' AND source_import_batch_id IS NOT NULL AND source_sales_line_id IS NULL
      AND source_transfer_line_id IS NULL AND source_document_version IS NULL AND endpoint = 'IMPORT_BASELINE' AND reverses_entry_id IS NULL)
    OR (event_kind IN ('APPROVE', 'UNAPPROVE') AND source_import_batch_id IS NULL AND source_document_version IS NOT NULL
      AND ((source_sales_line_id IS NOT NULL AND source_transfer_line_id IS NULL AND endpoint = 'SALES_WAREHOUSE')
        OR (source_sales_line_id IS NULL AND source_transfer_line_id IS NOT NULL AND endpoint IN ('FROM', 'TO'))))
  ) IS TRUE),
  ADD CONSTRAINT ledger_retains_balance FOREIGN KEY (warehouse_id, sku_id)
    REFERENCES naijue_erp.inventory_balance (warehouse_id, sku_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
-- Existing append-only ledger trigger makes this FK retain previously-used zero balances too.
CREATE UNIQUE INDEX import_baseline_key_once ON naijue_erp.inventory_ledger (source_import_batch_id, warehouse_id, sku_id)
  WHERE event_kind = 'CUTOFF_BASELINE';
CREATE INDEX inventory_ledger_balance_key ON naijue_erp.inventory_ledger (warehouse_id, sku_id);

-- Extend the existing CLOSED receipt/audit union without adding helper columns.
ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_target_kind, DROP CONSTRAINT receipt_action_by_kind,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER', 'IMPORT')),
  ADD CONSTRAINT receipt_action_by_kind CHECK (
    (target_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (target_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))
    OR (target_type = 'IMPORT' AND action IN ('IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH')));
ALTER TABLE naijue_erp.audit_change DROP CONSTRAINT audit_object_kind, DROP CONSTRAINT audit_action_by_kind,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER', 'IMPORT')),
  ADD CONSTRAINT audit_action_by_kind CHECK (
    (object_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (object_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))
    OR (object_type = 'IMPORT' AND action IN ('IMPORT_STAGE', 'IMPORT_CHUNK', 'IMPORT_PUBLISH')));
-- Each locked checkpoint resolves its one audit by an indexed exact native version.
CREATE UNIQUE INDEX audit_import_checkpoint_version ON naijue_erp.audit_change (object_id, new_version) WHERE object_type = 'IMPORT';
-- Preserve the previous complete non-import predicate rather than replacing its semantics.
DO $$
DECLARE previous_expression text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO STRICT previous_expression FROM pg_catalog.pg_constraint
    WHERE conrelid = 'naijue_erp.operation_receipt'::regclass AND conname = 'receipt_result_by_kind';
  ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
  EXECUTE 'ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE WHEN target_type = ''IMPORT'' THEN '
    || '(jsonb_typeof(result_data) = ''object'' AND (result_data - ARRAY[''operationId'', ''batchId'', ''sequence'', ''cursor'', ''status'', ''ledgerEntryIds'']) = ''{}''::jsonb '
    || 'AND result_data ?& ARRAY[''operationId'', ''batchId'', ''sequence'', ''cursor'', ''status'', ''ledgerEntryIds''] '
    || 'AND result_data->>''operationId'' = id::text AND result_data->>''batchId'' = target_id::text '
    || 'AND result_data->>''sequence'' ~ ''^[0-9]+$'' AND result_data->>''cursor'' ~ ''^[0-9]+$'' '
    || 'AND jsonb_typeof(result_data->''ledgerEntryIds'') = ''array'' '
    || 'AND result_data->>''status'' IN (''STAGED'', ''VALIDATING'', ''IMPORTED'')) ELSE (' || previous_expression || ') END) IS TRUE)';
END;
$$;

CREATE FUNCTION naijue_erp.cutoff_import_lock() RETURNS void LANGUAGE sql SET search_path = pg_catalog, naijue_erp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:inventory-cutoff', 0));
$$;
CREATE FUNCTION naijue_erp.import_source_key_lock(source_namespace text, source_entity text, original_key text) RETURNS void LANGUAGE sql
  SET search_path = pg_catalog, naijue_erp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:import-source:' || jsonb_build_array(source_namespace, source_entity, original_key)::text, 0));
$$;
CREATE FUNCTION naijue_erp.guard_import_record() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.import_batch_id FOR UPDATE;
  IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
    RAISE EXCEPTION 'import source scope is frozen' USING ERRCODE = '23514'; END IF;
  -- Cross-batch identity is the fixed namespace + source category + ORIGINAL key, never a filename.
  PERFORM naijue_erp.import_source_key_lock(b.source_name, NEW.source_entity_type, NEW.source_key);
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record r JOIN naijue_erp.import_batch prior ON prior.id = r.import_batch_id
    WHERE prior.source_name = b.source_name AND r.source_entity_type = NEW.source_entity_type AND r.source_key = NEW.source_key) THEN
    RAISE EXCEPTION 'source identity already has an immutable destination; resume original batch' USING ERRCODE = '23505';
  END IF;
  IF NEW.status = 'IMPORTED' THEN
    IF NEW.target_type = 'WAREHOUSE' THEN PERFORM 1 FROM naijue_erp.warehouse WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'SKU' THEN PERFORM 1 FROM naijue_erp.sku WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id = NEW.target_id AND id = b.id;
    ELSIF NEW.target_type = 'INVENTORY_LEDGER' THEN RETURN NEW; -- Reciprocal baseline/source check is deferred below.
    ELSE RAISE EXCEPTION 'unsupported import target' USING ERRCODE = '23514'; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'import target identity does not exist' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_record_identity BEFORE INSERT ON naijue_erp.import_record FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_import_record();
CREATE TRIGGER immutable_import_record BEFORE UPDATE OR DELETE ON naijue_erp.import_record FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();

CREATE FUNCTION naijue_erp.inventory_key_lock(warehouse uuid, sku uuid) RETURNS void LANGUAGE sql
  SET search_path = pg_catalog, naijue_erp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('naijue:inventory:' || warehouse::text || ':' || sku::text, 0));
$$;
CREATE FUNCTION naijue_erp.published_inventory_key(warehouse uuid, sku uuid) RETURNS boolean LANGUAGE sql STABLE
  SET search_path = pg_catalog, naijue_erp AS $$
  SELECT EXISTS (SELECT 1 FROM naijue_erp.import_batch b WHERE b.status = 'IMPORTED' AND b.inventory_mode = 'CUTOFF_STOCK_BASELINE'
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'WAREHOUSE' AND r.target_id = warehouse)
    AND EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = b.id AND r.status = 'IMPORTED' AND r.target_type = 'SKU' AND r.target_id = sku));
$$;
CREATE FUNCTION naijue_erp.guard_cutoff_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id, NEW.sku_id);
  IF NEW.event_kind = 'CUTOFF_BASELINE' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.source_import_batch_id FOR UPDATE;
    IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED')
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'WAREHOUSE' AND target_id = NEW.warehouse_id)
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = 'SKU' AND target_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id) THEN
      RAISE EXCEPTION 'baseline requires owned complete identities and a previously unused key' USING ERRCODE = '23514';
    END IF;
  ELSIF NOT naijue_erp.published_inventory_key(NEW.warehouse_id, NEW.sku_id) THEN
    RAISE EXCEPTION 'inventory scope is not published' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cutoff_ledger_guard BEFORE INSERT ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_cutoff_ledger();

CREATE FUNCTION naijue_erp.guard_balance_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'inventory balances are retained, including zero' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.warehouse_id, NEW.sku_id) IS DISTINCT FROM ROW(OLD.warehouse_id, OLD.sku_id) THEN
    RAISE EXCEPTION 'inventory balance identity is immutable' USING ERRCODE = '23514'; END IF;
  PERFORM naijue_erp.inventory_key_lock(NEW.warehouse_id, NEW.sku_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_balance_identity BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.inventory_balance FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_balance_identity();
CREATE FUNCTION naijue_erp.validate_sparse_balance_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE; baseline naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF TG_OP = 'UPDATE' THEN
    IF r.target_type = 'IMPORT' THEN RAISE EXCEPTION 'an import receipt cannot overwrite existing stock' USING ERRCODE = '23514'; END IF;
    -- Preserve existing native SALES/TRANSFER transaction contracts and validators.
    -- Generic sparse first-use command integration is deliberately not enabled here.
    RETURN NULL;
  END IF;
  IF r.target_type <> 'IMPORT' OR r.action <> 'IMPORT_CHUNK' THEN
    RAISE EXCEPTION 'native sparse first-use command integration is not implemented' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger WHERE operation_id = r.id
    AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND event_kind = 'CUTOFF_BASELINE';
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF final_row.quantity IS DISTINCT FROM baseline.quantity_delta OR final_row.version <> 1
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR baseline.source_import_batch_id IS DISTINCT FROM r.target_id THEN
    RAISE EXCEPTION 'fresh baseline balance requires its exact nonzero real import effect' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER sparse_balance_final_consistency AFTER INSERT OR UPDATE ON naijue_erp.inventory_balance
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_sparse_balance_commit();

CREATE FUNCTION naijue_erp.validate_import_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE l naijue_erp.inventory_ledger%ROWTYPE;
BEGIN
  IF NEW.target_type = 'INVENTORY_LEDGER' AND NEW.status = 'IMPORTED' THEN
    SELECT * INTO STRICT l FROM naijue_erp.inventory_ledger WHERE id = NEW.target_id;
    IF l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM NEW.import_batch_id
      OR NEW.source_entity_type <> 'INVENTORY_BASELINE' THEN
      RAISE EXCEPTION 'source record does not point at its own immutable baseline' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_source_final_consistency AFTER INSERT ON naijue_erp.import_record
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_import_source_commit();

CREATE FUNCTION naijue_erp.validate_baseline_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  IF NEW.event_kind <> 'CUTOFF_BASELINE' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id IS DISTINCT FROM NEW.source_import_batch_id OR r.action <> 'IMPORT_CHUNK'
    OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR NOT (r.result_data->'ledgerEntryIds' ? NEW.id::text)
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = NEW.source_import_batch_id
      AND target_type = 'INVENTORY_LEDGER' AND target_id = NEW.id AND status = 'IMPORTED' AND source_entity_type = 'INVENTORY_BASELINE') THEN
    RAISE EXCEPTION 'baseline requires its native source and actual import operation' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER baseline_source_final_consistency AFTER INSERT ON naijue_erp.inventory_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.event_kind = 'CUTOFF_BASELINE') EXECUTE FUNCTION naijue_erp.validate_baseline_source_commit();
-- 0004's original function is deliberately unchanged: it validates only native
-- SALES/TRANSFER sources. Its former unconditional ELSE would treat a baseline's
-- NULL transfer source as a real transfer and fail INTO STRICT at commit.
DROP TRIGGER ledger_receipt_source_coherence ON naijue_erp.inventory_ledger;
CREATE CONSTRAINT TRIGGER ledger_receipt_source_coherence AFTER INSERT ON naijue_erp.inventory_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.event_kind IN ('APPROVE', 'UNAPPROVE'))
  EXECUTE FUNCTION naijue_erp.validate_ledger_receipt_source();

CREATE FUNCTION naijue_erp.validate_import_publish(batch uuid, publishing_checkpoint jsonb) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; kind text; actual bigint; expected bigint;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = batch FOR UPDATE;
  b.checkpoint := publishing_checkpoint;
  -- Locks prevent a native identity appearing/disappearing between scope count and publication.
  LOCK TABLE naijue_erp.warehouse, naijue_erp.sku IN SHARE MODE;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH'] LOOP
    IF ((b.checkpoint->'expected'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR ((b.checkpoint->'counts'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'explicit expected and processed scope counts are required' USING ERRCODE = '23514'; END IF;
    expected := (b.checkpoint->'expected'->>kind)::bigint;
    SELECT count(*) INTO actual FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED' AND target_type = kind;
    IF actual <> expected OR actual <> (b.checkpoint->'counts'->>kind)::bigint THEN
      RAISE EXCEPTION 'published source count is incomplete' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF (b.checkpoint->'expected'->>'WAREHOUSE')::bigint <> (SELECT count(*) FROM naijue_erp.warehouse)
    OR (b.checkpoint->'expected'->>'SKU')::bigint <> (SELECT count(*) FROM naijue_erp.sku)
    OR (b.checkpoint->'expected'->>'IMPORT_BATCH')::bigint <> 1
    OR EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status <> 'IMPORTED')
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND target_type = 'IMPORT_BATCH' AND target_id = b.id
      AND source_entity_type = 'INVENTORY_SCOPE_APPROVAL' AND source_key = 'FINAL_COMPLETE_SCOPE'
      AND decision_reason = 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND source_record_hash = b.source_hash AND source_file_ref = b.source_manifest_ref) THEN
    RAISE EXCEPTION 'explicit frozen complete-scope and final-increment approval is missing' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.import_record r
      ON r.import_batch_id = b.id AND r.target_type = 'INVENTORY_LEDGER' AND r.target_id = l.id AND r.status = 'IMPORTED'
    LEFT JOIN naijue_erp.inventory_balance q ON q.warehouse_id = l.warehouse_id AND q.sku_id = l.sku_id
    WHERE l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM b.id OR r.id IS NULL
      OR q.quantity IS DISTINCT FROM l.quantity_delta OR q.version IS DISTINCT FROM 1 OR q.last_operation_id IS DISTINCT FROM l.operation_id)
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_balance q WHERE NOT EXISTS (
      SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.source_import_batch_id = b.id AND l.event_kind = 'CUTOFF_BASELINE'
        AND l.warehouse_id = q.warehouse_id AND l.sku_id = q.sku_id)) THEN
    RAISE EXCEPTION 'per-key source baseline and balance reconciliation failed' USING ERRCODE = '23514'; END IF;
END;
$$;
CREATE FUNCTION naijue_erp.guard_import_batch() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'import batch is retained' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'STAGED' OR NEW.checkpoint->>'sequence' <> '0' OR NEW.checkpoint->>'cursor' <> '0'
      OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
      RAISE EXCEPTION 'import must start staged at a stable zero checkpoint' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status IN ('IMPORTED', 'FAILED') OR ROW(NEW.id, NEW.source_name, NEW.source_manifest_ref, NEW.source_hash, NEW.cutoff_at, NEW.mapping_version, NEW.inventory_mode, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.source_name, OLD.source_manifest_ref, OLD.source_hash, OLD.cutoff_at, OLD.mapping_version, OLD.inventory_mode, OLD.created_at)
      OR NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected'
      OR (NEW.checkpoint->>'sequence')::bigint <> (OLD.checkpoint->>'sequence')::bigint + 1
      OR (NEW.checkpoint->>'cursor')::bigint < (OLD.checkpoint->>'cursor')::bigint THEN
      RAISE EXCEPTION 'immutable source or invalid checkpoint transition' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'IMPORTED' THEN PERFORM naijue_erp.validate_import_publish(NEW.id, NEW.checkpoint); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_batch_transition BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.import_batch FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_import_batch();

CREATE FUNCTION naijue_erp.validate_import_batch_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'IMPORT' AND object_id = NEW.id
    AND new_version = ((NEW.checkpoint->>'sequence')::bigint + 1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id <> NEW.id OR a.after_values IS DISTINCT FROM NEW.checkpoint
    OR (SELECT checkpoint FROM naijue_erp.import_batch WHERE id = NEW.id) IS DISTINCT FROM NEW.checkpoint THEN
    RAISE EXCEPTION 'one atomic native import checkpoint audit and receipt are required' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action <> 'IMPORT_STAGE' THEN
      RAISE EXCEPTION 'stage requires initial import evidence' USING ERRCODE = '23514'; END IF;
  ELSIF a.old_version::bigint IS DISTINCT FROM (OLD.checkpoint->>'sequence')::bigint + 1 OR a.before_values IS DISTINCT FROM OLD.checkpoint THEN
    RAISE EXCEPTION 'checkpoint before evidence differs from replaced progress' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'counts')) <> 4
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'expected')) <> 4 THEN
    RAISE EXCEPTION 'only the four approved target counters are accepted' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH'] LOOP
    IF ((NEW.checkpoint->'counts'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR ((NEW.checkpoint->'expected'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'missing exact import counters' USING ERRCODE = '23514'; END IF;
    -- Constant-sized metadata check only. Successful bounded INSERT results advance
    -- counts in the application transaction; the one full source reconciliation is publication.
    processed := (NEW.checkpoint->'counts'->>kind)::numeric;
    IF processed > (NEW.checkpoint->'expected'->>kind)::numeric
      OR (TG_OP = 'UPDATE' AND processed < (OLD.checkpoint->'counts'->>kind)::numeric) THEN
      RAISE EXCEPTION 'invalid monotonic bounded source progress' USING ERRCODE = '23514'; END IF;
    counted := counted + processed;
  END LOOP;
  IF counted <> (NEW.checkpoint->>'cursor')::numeric THEN RAISE EXCEPTION 'checkpoint cursor must match its bounded progress counters' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_batch_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.import_batch
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_import_batch_commit();


CREATE FUNCTION naijue_erp.validate_import_operation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) INTO actual_ids FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids IS DISTINCT FROM receipt_ids THEN RAISE EXCEPTION 'import receipt requires exact bounded baseline effect set' USING ERRCODE = '23514'; END IF;
  IF a.object_type <> 'IMPORT' OR a.object_id <> b.id OR a.action <> NEW.action
    OR a.actor_account_id <> NEW.actor_account_id OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR a.after_values IS DISTINCT FROM b.checkpoint OR a.new_version::bigint <> (b.checkpoint->>'sequence')::bigint + 1
    OR NEW.result_data->>'sequence' IS DISTINCT FROM b.checkpoint->>'sequence'
    OR NEW.result_data->>'cursor' IS DISTINCT FROM b.checkpoint->>'cursor' OR NEW.result_data->>'status' IS DISTINCT FROM b.status
    OR (NEW.action = 'IMPORT_STAGE' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR b.status <> 'STAGED'))
    OR (NEW.action = 'IMPORT_CHUNK' AND b.status <> 'VALIDATING') OR (NEW.action = 'IMPORT_PUBLISH' AND b.status <> 'IMPORTED')
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id AND (event_kind <> 'CUTOFF_BASELINE' OR source_import_batch_id IS DISTINCT FROM b.id))
    OR (NEW.action <> 'IMPORT_CHUNK' AND EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id)) THEN
    RAISE EXCEPTION 'import receipt audit checkpoint or exact baseline operation differs' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_operation_consistency AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.target_type = 'IMPORT') EXECUTE FUNCTION naijue_erp.validate_import_operation();

CREATE FUNCTION naijue_erp.freeze_imported_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE status = 'IMPORTED'
    AND target_type = CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' ELSE 'SKU' END AND target_id = OLD.id) THEN
    RAISE EXCEPTION 'imported formal identity is retained in frozen scope' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_import_identity BEFORE DELETE OR UPDATE OF id ON naijue_erp.warehouse FOR EACH ROW EXECUTE FUNCTION naijue_erp.freeze_imported_identity();
CREATE TRIGGER sku_import_identity BEFORE DELETE OR UPDATE OF id ON naijue_erp.sku FOR EACH ROW EXECUTE FUNCTION naijue_erp.freeze_imported_identity();

-- This foundation DOES NOT enable historical header/line insertion or first-unapprove.
-- Existing application guards and transfer provenance validator remain closed. Sales gets
-- the same explicit native cutoff freeze; there is no second header/line or contribution store.
CREATE FUNCTION naijue_erp.reject_unimplemented_cutoff_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.stock_basis = 'CUTOFF_HISTORY' THEN RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.stock_basis = 'CUTOFF_HISTORY' OR (TG_OP = 'UPDATE' AND OLD.stock_basis = 'CUTOFF_HISTORY') THEN
    RAISE EXCEPTION 'historical command integration not implemented' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_cutoff_freeze BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sales_header FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_unimplemented_cutoff_write();
CREATE FUNCTION naijue_erp.freeze_cutoff_sales_detail() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE owner_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN owner_id := OLD.sales_id; ELSE owner_id := NEW.sales_id; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.sales_header WHERE id = owner_id AND stock_basis = 'CUTOFF_HISTORY') THEN
    RAISE EXCEPTION 'frozen first native historical version cannot be edited' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sales_cutoff_line_freeze BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sales_line FOR EACH ROW EXECUTE FUNCTION naijue_erp.freeze_cutoff_sales_detail();
CREATE TRIGGER sales_cutoff_settlement_freeze BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sales_settlement FOR EACH ROW EXECUTE FUNCTION naijue_erp.freeze_cutoff_sales_detail();
-- Row triggers do not cover TRUNCATE. Protect the same retained facts at statement level.
CREATE TRIGGER cutoff_ledger_no_truncate BEFORE TRUNCATE ON naijue_erp.inventory_ledger EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_balance_no_truncate BEFORE TRUNCATE ON naijue_erp.inventory_balance EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_sources_no_truncate BEFORE TRUNCATE ON naijue_erp.import_record EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_batch_no_truncate BEFORE TRUNCATE ON naijue_erp.import_batch EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_receipts_no_truncate BEFORE TRUNCATE ON naijue_erp.operation_receipt EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_audits_no_truncate BEFORE TRUNCATE ON naijue_erp.audit_change EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_warehouse_no_truncate BEFORE TRUNCATE ON naijue_erp.warehouse EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER cutoff_sku_no_truncate BEFORE TRUNCATE ON naijue_erp.sku EXECUTE FUNCTION naijue_erp.reject_immutable_change();
INSERT INTO naijue_erp.schema_migration (version, description) VALUES (7, 'Approved sparse cutoff/import foundation; historical commands remain closed; SQL source only');
COMMIT;
