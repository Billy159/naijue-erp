-- VERSION 0015: once-only native import checkpoint claims. SQL SOURCE ONLY; engine acceptance NOT_RUN.
-- DO NOT DEPLOY until the original store explicitly integrates the typed accountant.
-- Old V2 CHUNK/PUBLISH writers without claims deliberately FAIL CLOSED on schema 15.
-- No data migration/backfill, counter repair, new receipt action, zero ledger or runtime-write bypass.
BEGIN;
-- Serialize the legacy preflight with EVERY old/new import_record writer until DDL COMMIT.
SELECT naijue_erp.cutoff_import_lock();
-- An old unaccounted FINAL cannot be adopted as a newly inserted approval.
-- Inspect/recover it explicitly before installing this migration; never delete or backfill it here.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r JOIN naijue_erp.import_batch b ON b.id=r.import_batch_id
    WHERE b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.status IN ('STAGED','VALIDATING') AND r.target_type='IMPORT_BATCH') THEN
    RAISE EXCEPTION 'open legacy V2 FINAL record requires separately authorized recovery before schema 15' USING ERRCODE='23514'; END IF;
END;
$$;
ALTER TABLE naijue_erp.import_record ADD CONSTRAINT import_record_accounting_identity
  UNIQUE (import_batch_id,id,target_type,target_id);
CREATE TABLE naijue_erp.import_record_accounting_claim (
  import_batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id), import_record_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH')),
  target_id uuid NOT NULL, operation_id uuid NOT NULL REFERENCES naijue_erp.operation_receipt(id) DEFERRABLE INITIALLY DEFERRED,
  checkpoint_sequence integer NOT NULL CHECK (checkpoint_sequence > 0 AND checkpoint_sequence < 2147483646),
  claimed_at timestamptz NOT NULL,
  validator_version text NOT NULL CHECK (validator_version='NATIVE_IMPORT_RECORD_ACCOUNTING_V1'),
  PRIMARY KEY (import_batch_id,import_record_id),
  FOREIGN KEY (import_batch_id,import_record_id,target_type,target_id)
    REFERENCES naijue_erp.import_record(import_batch_id,id,target_type,target_id)
);
CREATE INDEX import_accounting_operation_claims ON naijue_erp.import_record_accounting_claim
  (operation_id,target_type,import_batch_id,checkpoint_sequence);
CREATE INDEX import_accounting_checkpoint_claims ON naijue_erp.import_record_accounting_claim
  (import_batch_id,checkpoint_sequence,operation_id);
REVOKE ALL ON naijue_erp.import_record_accounting_claim FROM PUBLIC;
CREATE TRIGGER import_accounting_claim_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_record_accounting_claim
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER import_accounting_claim_no_truncate BEFORE TRUNCATE ON naijue_erp.import_record_accounting_claim
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();

CREATE FUNCTION naijue_erp.guard_import_accounting_claim() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.import_record%ROWTYPE; native_row jsonb;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
    RAISE EXCEPTION 'native accounting requires the original open unpublished V2 scope' USING ERRCODE='23514'; END IF;
  -- Induction starts ONLY at the real original zero checkpoint. Never adopt/backfill old nonzero counters.
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id)
    AND (b.checkpoint->>'sequence'<>'0' OR b.checkpoint->>'cursor'<>'0'
      OR b.checkpoint->'counts' IS DISTINCT FROM '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb) THEN
    RAISE EXCEPTION 'nonzero checkpoint without accounting provenance requires separately authorized recovery' USING ERRCODE='23514'; END IF;
  IF NEW.checkpoint_sequence::bigint<>(b.checkpoint->>'sequence')::bigint+1
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=b.id
      AND c.checkpoint_sequence=NEW.checkpoint_sequence AND c.operation_id<>NEW.operation_id) THEN
    RAISE EXCEPTION 'one next original receipt must own this checkpoint sequence' USING ERRCODE='23514'; END IF;
  -- Primary native identities are locked before immutable source/evidence rows.
  IF NEW.target_type='WAREHOUSE' THEN
    SELECT to_jsonb(w) INTO STRICT native_row FROM naijue_erp.warehouse w WHERE id=NEW.target_id FOR SHARE;
  ELSIF NEW.target_type='SKU' THEN
    SELECT to_jsonb(k) INTO STRICT native_row FROM naijue_erp.sku k WHERE id=NEW.target_id FOR SHARE;
  END IF;
  SELECT * INTO STRICT r FROM naijue_erp.import_record WHERE id=NEW.import_record_id AND import_batch_id=b.id FOR SHARE;
  PERFORM naijue_erp.import_source_key_lock(b.source_name,r.source_entity_type,r.source_key);
  IF r.status<>'IMPORTED' OR r.target_type IS DISTINCT FROM NEW.target_type OR r.target_id IS DISTINCT FROM NEW.target_id THEN
    RAISE EXCEPTION 'claim must consume its exact immutable imported target record' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='WAREHOUSE' AND (r.source_entity_type<>'WAREHOUSE' OR NOT EXISTS(
    SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s
      ON s.batch_id=e.batch_id AND s.id=e.source_row_id
    WHERE e.batch_id=b.id AND e.entity_type='WAREHOUSE' AND e.source_key=r.source_key AND e.native_id=r.target_id
      AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND e.native_snapshot=native_row
      AND e.warehouse_record->>'id'=r.id::text AND e.warehouse_record->>'decisionReason'=r.decision_reason
      AND (e.warehouse_record->>'reviewedAt')::timestamptz=r.reviewed_at
      AND s.entity_type='WAREHOUSE' AND s.source_key=r.source_key AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref
      AND s.normalized_fields->>'切换范围'='本次完整核准')) THEN
    RAISE EXCEPTION 'warehouse claim lacks exact source and native creator evidence' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='SKU' AND (r.source_entity_type<>'SKU' OR NOT EXISTS(
    SELECT 1 FROM naijue_erp.import_source_row s JOIN naijue_erp.import_sku_alias a
      ON a.batch_id=s.batch_id AND a.source_row_id=s.id AND a.old_source_sku_id=s.source_key
    WHERE s.batch_id=b.id AND s.entity_type='SKU' AND s.source_key=r.source_key
      AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref
      AND a.canonical_source_key=r.source_key AND a.canonical_sku_id=r.target_id
      AND s.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
      AND s.field_provenance->'native_sku_import'->>'canonical_source_key'=r.source_key
      AND s.field_provenance->'native_sku_import'->>'native_sku_id'=r.target_id::text
      AND s.field_provenance->'native_sku_import'->'native_sku'=native_row
      AND s.field_provenance->'native_sku_import'->'mapping'->>'isRepresentative'='true')) THEN
    RAISE EXCEPTION 'SKU claim requires one canonical creator record, not one record per alias' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='IMPORT_BATCH' AND (r.target_id<>b.id OR r.source_entity_type<>'INVENTORY_SCOPE_APPROVAL'
    OR r.source_key<>'FINAL_COMPLETE_SCOPE' OR r.source_record_hash<>b.source_hash OR r.source_file_ref<>b.source_manifest_ref
    OR r.decision_reason IS DISTINCT FROM 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
    OR b.checkpoint->'counts'->>'IMPORT_BATCH'<>'0') THEN
    RAISE EXCEPTION 'only the one original exact final complete-scope approval can be claimed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_accounting_claim_identity BEFORE INSERT ON naijue_erp.import_record_accounting_claim
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_import_accounting_claim();

CREATE FUNCTION naijue_erp.validate_import_accounting_claim_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id;
  IF r.target_type<>'IMPORT' OR r.target_id<>b.id OR r.status<>'COMMITTED'
    OR r.action IS DISTINCT FROM (CASE WHEN NEW.target_type='IMPORT_BATCH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
    OR r.completed_at IS DISTINCT FROM NEW.claimed_at OR a.object_type<>'IMPORT' OR a.object_id<>b.id
    OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM NEW.claimed_at
    OR a.old_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint
    OR a.new_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint+1
    OR a.after_values IS DISTINCT FROM b.checkpoint
    OR a.after_values->>'sequence' IS DISTINCT FROM NEW.checkpoint_sequence::text
    OR r.result_data->>'sequence' IS DISTINCT FROM NEW.checkpoint_sequence::text THEN
    RAISE EXCEPTION 'accounting claim requires the one original exact receipt audit and checkpoint' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='INVENTORY_LEDGER' AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.inventory_balance q
      ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    JOIN naijue_erp.import_record s ON s.id=NEW.import_record_id
    WHERE l.id=NEW.target_id AND l.event_kind='CUTOFF_BASELINE' AND l.operation_id=r.id AND l.source_import_batch_id=b.id
      AND s.source_entity_type='INVENTORY_BASELINE' AND q.quantity=l.quantity_delta AND q.version=1
      AND q.last_operation_id=r.id AND q.updated_at=r.completed_at AND l.posted_at=r.completed_at) THEN
    RAISE EXCEPTION 'baseline accounting requires its real exact same-operation record ledger and fresh balance' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_accounting_claim_consistency AFTER INSERT ON naijue_erp.import_record_accounting_claim
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_import_accounting_claim_commit();

-- Additive to, NOT a replacement for, original 0007 receipt/audit/CAS/cursor guards.
CREATE FUNCTION naijue_erp.validate_import_accounting_checkpoint_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; actual bigint; total bigint;
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' THEN RETURN NULL; END IF;
  IF jsonb_typeof(NEW.checkpoint->'sequence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(NEW.checkpoint->'cursor') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'V2 checkpoint sequence and cursor must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    IF jsonb_typeof(NEW.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
      OR jsonb_typeof(NEW.checkpoint->'expected'->kind) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'V2 native counters must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF TG_OP='INSERT' THEN
    IF NEW.checkpoint->>'sequence'<>'0' OR NEW.checkpoint->>'cursor'<>'0'
      OR NEW.checkpoint->'counts' IS DISTINCT FROM '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb
      OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id) THEN
      RAISE EXCEPTION 'V2 accounting must stage at the original unclaimed zero checkpoint' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=NEW.id
    AND new_version=((NEW.checkpoint->>'sequence')::bigint+1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  SELECT count(*) INTO total FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id;
  IF (r.action='IMPORT_CHUNK' AND (total<1 OR total>500)) OR (r.action='IMPORT_PUBLISH' AND total<>1)
    OR r.action NOT IN ('IMPORT_CHUNK','IMPORT_PUBLISH')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.operation_id=r.id
      AND (c.import_batch_id<>NEW.id OR c.checkpoint_sequence::bigint<>(NEW.checkpoint->>'sequence')::bigint))
    OR (NEW.checkpoint->>'cursor')::bigint-(OLD.checkpoint->>'cursor')::bigint<>total THEN
    RAISE EXCEPTION 'checkpoint cursor and original action require the exact bounded new claim set' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type=kind;
    IF (NEW.checkpoint->'counts'->>kind)::bigint-(OLD.checkpoint->'counts'->>kind)::bigint<>actual THEN
      RAISE EXCEPTION 'checkpoint target delta differs from its original receipt-owned new claims' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (r.action='IMPORT_CHUNK' AND EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH'))
    OR (r.action='IMPORT_PUBLISH' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH')) THEN
    RAISE EXCEPTION 'final approval is accounted once only by original PUBLISH' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_accounting_checkpoint_consistency AFTER INSERT OR UPDATE ON naijue_erp.import_batch
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_import_accounting_checkpoint_commit();

CREATE FUNCTION naijue_erp.validate_import_accounting_baseline_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF (SELECT mapping_version FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id)<>'V2_HISTORY_NULLABLE_1' THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=NEW.source_import_batch_id
    AND c.target_type='INVENTORY_LEDGER' AND c.target_id=NEW.id AND c.operation_id=NEW.operation_id) THEN
    RAISE EXCEPTION 'a new V2 real baseline must commit with its own new accounting claim' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_accounting_baseline_consistency AFTER INSERT ON naijue_erp.inventory_ledger
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.event_kind='CUTOFF_BASELINE')
  EXECUTE FUNCTION naijue_erp.validate_import_accounting_baseline_commit();

CREATE FUNCTION naijue_erp.validate_import_accounting_final_record_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.target_type<>'IMPORT_BATCH' OR (SELECT mapping_version FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id)<>'V2_HISTORY_NULLABLE_1' THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id
    JOIN naijue_erp.import_batch b ON b.id=c.import_batch_id
    WHERE c.import_batch_id=NEW.import_batch_id AND c.import_record_id=NEW.id AND c.target_type='IMPORT_BATCH'
      AND c.target_id=NEW.import_batch_id AND r.target_type='IMPORT' AND r.target_id=b.id AND r.action='IMPORT_PUBLISH'
      AND r.completed_at=NEW.reviewed_at AND b.status='IMPORTED') THEN
    RAISE EXCEPTION 'a new V2 FINAL record must commit atomically with its own original publication claim' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER import_accounting_final_record_consistency AFTER INSERT ON naijue_erp.import_record
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.target_type='IMPORT_BATCH')
  EXECUTE FUNCTION naijue_erp.validate_import_accounting_final_record_commit();

CREATE FUNCTION naijue_erp.guard_import_accounting_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  -- Full readback is an observation at publication, NEVER progress-counter assignment or backfill.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r LEFT JOIN naijue_erp.import_record_accounting_claim c
      ON c.import_batch_id=r.import_batch_id AND c.import_record_id=r.id
    WHERE r.import_batch_id=NEW.id AND r.status='IMPORTED' AND c.import_record_id IS NULL) THEN
    RAISE EXCEPTION 'every published native record requires its original once-only accounting ownership' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id AND target_type=kind;
    IF actual<>(NEW.checkpoint->'counts'->>kind)::bigint OR actual<>(NEW.checkpoint->'expected'->>kind)::bigint THEN
      RAISE EXCEPTION 'published claim scope differs from frozen native progress' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_accounting_publication BEFORE UPDATE ON naijue_erp.import_batch
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_import_accounting_publication();
INSERT INTO naijue_erp.schema_migration(version,description)
  VALUES (15,'Once-only typed native import record accounting; original receipt audit checkpoint delta guards; integration and engine acceptance required');
COMMIT;
