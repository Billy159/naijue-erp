-- SOURCE-ONLY CANDIDATE. No current migration/installer references this file.
-- Advisory cooperation is NOT authorization or complete security. The stop
-- below must remain until exact target/roles/guards and lock hierarchy have
-- independent approval and real isolated concurrency/rollback verification.
BEGIN;
DO $closed$
BEGIN
 RAISE EXCEPTION 'STANDARD27_PRODUCT_PROVENANCE_BARRIER_NOT_ADMITTED';
END
$closed$;

CREATE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp, pg_temp
AS $body$
DECLARE
 lock_key bigint := hashtextextended('naijue:standard27:product-provenance',0);
 required boolean := false;
 frames jsonb[] := ARRAY[]::jsonb[];
 frame jsonb;
BEGIN
 IF TG_TABLE_SCHEMA<>'naijue_erp' OR TG_WHEN<>'BEFORE'
  OR current_setting('session_replication_role')<>'origin'
  OR TG_TABLE_NAME NOT IN ('import_batch','import_record','audit_change','operation_receipt')
 THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PROVENANCE_SCOPE_INVALID'; END IF;
 IF TG_LEVEL='STATEMENT' AND TG_OP='TRUNCATE' THEN required := true;
 ELSIF TG_LEVEL='ROW' AND TG_OP IN ('INSERT','UPDATE','DELETE') THEN
  IF TG_TABLE_NAME IN ('import_batch','import_record') THEN required := true;
  ELSE
   IF TG_OP <> 'INSERT' THEN frames := array_append(frames,to_jsonb(OLD)); END IF;
   IF TG_OP <> 'DELETE' THEN frames := array_append(frames,to_jsonb(NEW)); END IF;
   FOREACH frame IN ARRAY frames LOOP
    IF (TG_TABLE_NAME='audit_change' AND frame->>'object_type' = 'IMPORT')
     OR (TG_TABLE_NAME='operation_receipt' AND frame->>'target_type' = 'IMPORT')
    THEN required := true; END IF;
   END LOOP;
  END IF;
 ELSE RAISE EXCEPTION 'STANDARD27_PRODUCT_PROVENANCE_SCOPE_INVALID'; END IF;
 IF required THEN
  -- Do not let reentrant advisory-lock upgrade silently mix a capacity reader
  -- and import writer in one transaction. Own shared ownership is conservative:
  -- session-level ownership also refuses, rather than claiming a safe scope.
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND granted
    AND pid=pg_backend_pid() AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND classid=((lock_key >> 32) & 4294967295)::oid AND objid=(lock_key & 4294967295)::oid
    AND objsubid=1 AND mode='ShareLock')
  THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PROVENANCE_MIXED_TRANSACTION'; END IF;
  -- This BEFORE trigger may run after row/relation locks were taken. Never
  -- wait here for an advisory lock in an inverse order; fail the transaction.
  IF NOT pg_try_advisory_xact_lock(lock_key)
  THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PROVENANCE_BUSY' USING ERRCODE='55P03'; END IF;
 END IF;
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$body$;
REVOKE ALL ON FUNCTION naijue_erp.lock_standard27_product_provenance_candidate() FROM PUBLIC;

CREATE TRIGGER standard27_product_provenance_barrier BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.import_batch
FOR EACH ROW EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.import_record
FOR EACH ROW EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.audit_change
FOR EACH ROW EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.operation_receipt
FOR EACH ROW EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier_truncate BEFORE TRUNCATE ON naijue_erp.import_batch
FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier_truncate BEFORE TRUNCATE ON naijue_erp.import_record
FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier_truncate BEFORE TRUNCATE ON naijue_erp.audit_change
FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
CREATE TRIGGER standard27_product_provenance_barrier_truncate BEFORE TRUNCATE ON naijue_erp.operation_receipt
FOR EACH STATEMENT EXECUTE FUNCTION naijue_erp.lock_standard27_product_provenance_candidate();
COMMIT;
