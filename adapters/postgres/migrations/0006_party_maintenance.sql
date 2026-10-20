-- VERSION 0006: independent customer/supplier maintenance and native command evidence.
-- SQL source / SQL-text contracts ONLY. Not executed against PostgreSQL; no engine evidence.
-- Existing codes and historical null timestamps stay verbatim. No seeds/import/backfill.
BEGIN;

-- User-approved independent new-code counters: KH000001 and GYS000001 onward.
-- Six digits is a MINIMUM display width, not a 999999 business limit. Signed bigint
-- is only the technical sequence boundary; NO CYCLE and explicit adapter exhaustion.
-- CACHE 1 plus the matching per-kind advisory transaction lock serialize reservation.
-- setval reservations are not transactional: failed commands can leave gaps. No gapless claim.
-- Existing/imported exact-prefix suffixes are inspected at allocation time, not rewritten.
CREATE SEQUENCE naijue_erp.customer_code_sequence AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE SEQUENCE naijue_erp.supplier_code_sequence AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- 0001 already defines physically separate tables, each with its own UNIQUE(code).
-- Extend the CLOSED shared receipt/audit union; never use a dual-role subject table.
ALTER TABLE naijue_erp.operation_receipt
  DROP CONSTRAINT receipt_target_kind,
  DROP CONSTRAINT operation_receipt_action_check,
  ADD CONSTRAINT receipt_target_kind CHECK (target_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER')),
  ADD CONSTRAINT receipt_action_by_kind CHECK (
    (target_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (target_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))),
  ADD COLUMN target_customer_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'CUSTOMER' THEN target_id END) STORED REFERENCES naijue_erp.customer(id),
  ADD COLUMN target_supplier_id uuid GENERATED ALWAYS AS (CASE WHEN target_type = 'SUPPLIER' THEN target_id END) STORED REFERENCES naijue_erp.supplier(id);
ALTER TABLE naijue_erp.audit_change
  DROP CONSTRAINT audit_object_kind,
  DROP CONSTRAINT audit_change_action_check,
  ADD CONSTRAINT audit_object_kind CHECK (object_type IN ('SALES', 'TRANSFER', 'CUSTOMER', 'SUPPLIER')),
  ADD CONSTRAINT audit_action_by_kind CHECK (
    (object_type IN ('SALES', 'TRANSFER') AND action IN ('SAVE', 'APPROVE', 'UNAPPROVE', 'VOID'))
    OR (object_type IN ('CUSTOMER', 'SUPPLIER') AND action IN ('CREATE', 'EDIT', 'DISABLE', 'RESTORE'))),
  ADD COLUMN object_customer_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'CUSTOMER' THEN object_id END) STORED REFERENCES naijue_erp.customer(id),
  ADD COLUMN object_supplier_id uuid GENERATED ALWAYS AS (CASE WHEN object_type = 'SUPPLIER' THEN object_id END) STORED REFERENCES naijue_erp.supplier(id);
-- Retain all 0004 reciprocal same-kind FKs and global UNIQUE(actor_account_id, request_key).
CREATE UNIQUE INDEX audit_customer_version ON naijue_erp.audit_change (object_id, new_version) WHERE object_type = 'CUSTOMER';
CREATE UNIQUE INDEX audit_supplier_version ON naijue_erp.audit_change (object_id, new_version) WHERE object_type = 'SUPPLIER';
CREATE INDEX customer_name_order ON naijue_erp.customer (name COLLATE "C", id);
CREATE INDEX supplier_name_order ON naijue_erp.supplier (name COLLATE "C", id);
CREATE INDEX hall_enabled_default_customer ON naijue_erp.hall (default_customer_id) WHERE enabled;

ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((
  jsonb_typeof(result_data) = 'object'
  AND CASE WHEN target_type IN ('SALES', 'TRANSFER') THEN
    result_data ?& ARRAY['operationId', 'version', 'status', 'ledgerEntryIds']
    AND jsonb_typeof(result_data->'operationId') = 'string' AND (result_data->>'operationId') IS NOT DISTINCT FROM id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(result_data->'status') = 'string' AND result_data->>'status' IN ('DRAFT', 'APPROVED', 'VOID')
    AND jsonb_typeof(result_data->'ledgerEntryIds') = 'array'
    AND CASE target_type
      WHEN 'SALES' THEN result_data ? 'salesId' AND NOT (result_data ? 'transferId')
        AND jsonb_typeof(result_data->'salesId') = 'string' AND (result_data->>'salesId') IS NOT DISTINCT FROM target_id::text
      WHEN 'TRANSFER' THEN result_data ? 'transferId' AND NOT (result_data ? 'salesId')
        AND jsonb_typeof(result_data->'transferId') = 'string' AND (result_data->>'transferId') IS NOT DISTINCT FROM target_id::text
      ELSE false END
  ELSE
    result_data ?& ARRAY['operationId', 'kind', 'partyId', 'version', 'code', 'enabled']
    AND (result_data - ARRAY['operationId', 'kind', 'partyId', 'version', 'code', 'enabled']) = '{}'::jsonb
    AND jsonb_typeof(result_data->'operationId') = 'string' AND result_data->>'operationId' = id::text
    AND jsonb_typeof(result_data->'kind') = 'string' AND result_data->>'kind' = target_type
    AND jsonb_typeof(result_data->'partyId') = 'string' AND result_data->>'partyId' = target_id::text
    AND jsonb_typeof(result_data->'version') = 'number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(result_data->'code') = 'string' AND length(btrim(result_data->>'code')) > 0
    AND jsonb_typeof(result_data->'enabled') = 'boolean'
  END
) IS TRUE);

CREATE FUNCTION naijue_erp.party_key_values(code_value text, name_value text, enabled_value boolean, version_value integer) RETURNS jsonb
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, naijue_erp AS $$
  SELECT jsonb_build_object('code', code_value, 'name', name_value, 'enabled', enabled_value, 'version', version_value);
$$;
CREATE FUNCTION naijue_erp.keep_party_native_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'retained customer/supplier cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF length(btrim(NEW.code)) = 0 OR length(btrim(NEW.name)) = 0 OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'new runtime party values cannot be empty or undated' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Serialize any explicit native insert with generation too. Existing codes are never
    -- changed to resolve collisions: the native table's own UNIQUE(code) still decides.
    PERFORM pg_advisory_xact_lock(hashtextextended('naijue:party-code:' ||
      CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, 0));
    IF NEW.version <> 1 OR NOT NEW.enabled OR NEW.created_at IS NULL OR NEW.created_at IS DISTINCT FROM NEW.updated_at THEN
      RAISE EXCEPTION 'new runtime party starts enabled at version one and actual creation time' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF ROW(NEW.id, NEW.code, NEW.created_at) IS DISTINCT FROM ROW(OLD.id, OLD.code, OLD.created_at) THEN
      RAISE EXCEPTION 'party identity original code and creation time are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.version::bigint <> OLD.version::bigint + 1 THEN RAISE EXCEPTION 'party version must advance exactly once' USING ERRCODE = '23514'; END IF;
    IF TG_TABLE_NAME = 'customer' AND OLD.enabled AND NOT NEW.enabled
      AND EXISTS (SELECT 1 FROM naijue_erp.hall WHERE enabled AND default_customer_id = NEW.id) THEN
      RAISE EXCEPTION 'enabled hall still uses this default customer' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_native_identity BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.customer FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_party_native_identity();
CREATE TRIGGER supplier_native_identity BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.supplier FOR EACH ROW EXECUTE FUNCTION naijue_erp.keep_party_native_identity();

-- Both sides of the enabled-default relation lock the same actual customer row.
-- Assignment/reenabling cannot race successfully against customer disable.
CREATE FUNCTION naijue_erp.check_hall_default_customer_enabled() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE customer_enabled boolean;
BEGIN
  IF NEW.enabled AND NEW.default_customer_id IS NOT NULL THEN
    SELECT enabled INTO STRICT customer_enabled FROM naijue_erp.customer WHERE id = NEW.default_customer_id FOR SHARE;
    IF NOT customer_enabled THEN RAISE EXCEPTION 'enabled hall requires an enabled default customer' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hall_default_customer_enabled BEFORE INSERT OR UPDATE OF default_customer_id, enabled ON naijue_erp.hall FOR EACH ROW EXECUTE FUNCTION naijue_erp.check_hall_default_customer_enabled();

-- Sparse audit contains actual changed native keys only, never whole-row/time snapshots.
-- Creation naturally includes the four initial key values. No old-version platform.
CREATE FUNCTION naijue_erp.validate_party_native_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  kind text; next_values jsonb; prior_values jsonb; expected_after jsonb; expected_before jsonb; final_version integer;
BEGIN
  kind := CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' ELSE NULL END;
  IF kind IS NULL THEN RAISE EXCEPTION 'unknown native party kind' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = kind AND object_id = NEW.id AND new_version = NEW.version;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> kind OR r.target_id <> NEW.id OR r.actor_account_id <> a.actor_account_id OR r.action <> a.action
    OR NEW.updated_at IS DISTINCT FROM r.completed_at OR a.occurred_at IS DISTINCT FROM r.completed_at THEN
    RAISE EXCEPTION 'native party requires coherent actor operation action and action time' USING ERRCODE = '23514';
  END IF;
  next_values := naijue_erp.party_key_values(NEW.code, NEW.name, NEW.enabled, NEW.version);
  IF TG_OP = 'INSERT' THEN
    IF a.action <> 'CREATE' OR a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR NEW.created_at IS DISTINCT FROM r.completed_at THEN
      RAISE EXCEPTION 'new party requires actual creation evidence' USING ERRCODE = '23514';
    END IF;
    expected_after := next_values;
  ELSE
    IF a.old_version IS DISTINCT FROM OLD.version OR a.action NOT IN ('EDIT', 'DISABLE', 'RESTORE')
      OR (a.action = 'EDIT' AND (NEW.name IS NOT DISTINCT FROM OLD.name OR NEW.enabled IS DISTINCT FROM OLD.enabled))
      OR (a.action = 'DISABLE' AND (NOT OLD.enabled OR NEW.enabled OR NEW.name IS DISTINCT FROM OLD.name))
      OR (a.action = 'RESTORE' AND (OLD.enabled OR NOT NEW.enabled OR NEW.name IS DISTINCT FROM OLD.name)) THEN
      RAISE EXCEPTION 'party command does not describe native transition' USING ERRCODE = '23514';
    END IF;
    prior_values := naijue_erp.party_key_values(OLD.code, OLD.name, OLD.enabled, OLD.version);
    SELECT jsonb_object_agg(key, value) INTO expected_before FROM jsonb_each(prior_values) WHERE value IS DISTINCT FROM next_values->key;
    SELECT jsonb_object_agg(key, value) INTO expected_after FROM jsonb_each(next_values) WHERE value IS DISTINCT FROM prior_values->key;
    IF a.before_values IS DISTINCT FROM expected_before THEN RAISE EXCEPTION 'party sparse before evidence differs from replaced native values' USING ERRCODE = '23514'; END IF;
  END IF;
  IF a.after_values IS DISTINCT FROM expected_after THEN RAISE EXCEPTION 'party sparse after evidence differs from actual changed native values' USING ERRCODE = '23514'; END IF;
  IF kind = 'CUSTOMER' THEN SELECT version INTO STRICT final_version FROM naijue_erp.customer WHERE id = NEW.id;
  ELSE SELECT version INTO STRICT final_version FROM naijue_erp.supplier WHERE id = NEW.id; END IF;
  IF final_version IS DISTINCT FROM NEW.version THEN RAISE EXCEPTION 'one final party version per transaction is required' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.customer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_party_native_commit();
CREATE CONSTRAINT TRIGGER supplier_command_consistency AFTER INSERT OR UPDATE ON naijue_erp.supplier DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_party_native_commit();

CREATE FUNCTION naijue_erp.validate_party_receipt_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE native_version integer; native_code text; native_enabled boolean; native_updated_at timestamptz; a naijue_erp.audit_change%ROWTYPE;
BEGIN
  IF NEW.target_type = 'CUSTOMER' THEN SELECT version, code, enabled, updated_at INTO STRICT native_version, native_code, native_enabled, native_updated_at FROM naijue_erp.customer WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'SUPPLIER' THEN SELECT version, code, enabled, updated_at INTO STRICT native_version, native_code, native_enabled, native_updated_at FROM naijue_erp.supplier WHERE id = NEW.target_id;
  ELSE RAISE EXCEPTION 'unknown party receipt target' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  IF a.object_type <> NEW.target_type OR a.object_id <> NEW.target_id OR a.actor_account_id <> NEW.actor_account_id OR a.action <> NEW.action
    OR a.new_version <> native_version OR a.occurred_at IS DISTINCT FROM NEW.completed_at OR native_updated_at IS DISTINCT FROM NEW.completed_at
    OR NEW.result_data->>'version' IS DISTINCT FROM native_version::text OR NEW.result_data->>'code' IS DISTINCT FROM native_code
    OR NEW.result_data->'enabled' IS DISTINCT FROM to_jsonb(native_enabled)
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id) THEN
    RAISE EXCEPTION 'party receipt must describe final native party without inventory effect' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER party_receipt_final_consistency AFTER INSERT ON naijue_erp.operation_receipt DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.target_type IN ('CUSTOMER', 'SUPPLIER')) EXECUTE FUNCTION naijue_erp.validate_party_receipt_commit();

INSERT INTO naijue_erp.schema_migration (version, description) VALUES (6, 'Independent native customer/supplier maintenance with sparse evidence; SQL source only');
COMMIT;
