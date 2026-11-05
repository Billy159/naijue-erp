-- SOURCE-ONLY, UNINSTALLABLE CANDIDATE. Not a migration or current catalog pin.
-- IMPORT_BATCH_AND_PRIVILEGED_WRITERS_UNRESOLVED: this does not cover import
-- batch state, all source-record mutations, privileged SQL or disabled triggers.
-- Existing imports/locks/roles remain untouched. Admission needs independently
-- reviewed authorization, complete writer closure, exact catalog predecessor,
-- and live concurrency/rollback tests. Do not remove this stop to run a test.
BEGIN;
DO $closed$
BEGIN
  RAISE EXCEPTION 'STANDARD27_PRODUCT_WRITER_CLOSURE_NOT_ADMITTED';
END
$closed$;

CREATE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp, pg_temp
AS $body$
DECLARE
  frames jsonb[] := ARRAY[]::jsonb[];
  frame jsonb;
  product_ids uuid[] := ARRAY[]::uuid[];
  absent_create_ids uuid[] := ARRAY[]::uuid[];
  sku_ids uuid[] := ARRAY[]::uuid[];
  sku_parent_ids uuid[] := ARRAY[]::uuid[];
  product_id uuid;
  resolved_product uuid;
  sku_id uuid;
  position integer;
BEGIN
  IF TG_TABLE_SCHEMA <> 'naijue_erp' OR TG_WHEN <> 'BEFORE'
    OR TG_LEVEL <> 'ROW' OR current_setting('session_replication_role') <> 'origin'
    OR TG_TABLE_NAME NOT IN ('product','sku','sku_barcode','product_image','audit_change','operation_receipt')
  THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_WRITER_SCOPE_INVALID'; END IF;
  IF TG_OP <> 'INSERT' THEN frames := array_append(frames,to_jsonb(OLD)); END IF;
  IF TG_OP <> 'DELETE' THEN frames := array_append(frames,to_jsonb(NEW)); END IF;
  FOREACH frame IN ARRAY frames LOOP
    resolved_product := NULL;
    CASE TG_TABLE_NAME
      WHEN 'product' THEN resolved_product := (frame->>'id')::uuid;
      WHEN 'sku' THEN resolved_product := (frame->>'product_id')::uuid;
      WHEN 'product_image' THEN resolved_product := (frame->>'product_id')::uuid;
      WHEN 'sku_barcode' THEN
        sku_id := (frame->>'sku_id')::uuid;
        SELECT s.product_id INTO resolved_product FROM naijue_erp.sku s WHERE s.id=sku_id;
        IF resolved_product IS NULL THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PARENT_UNRESOLVED'; END IF;
        sku_ids := array_append(sku_ids,sku_id);
        sku_parent_ids := array_append(sku_parent_ids,resolved_product);
      WHEN 'audit_change' THEN
        IF frame->>'object_type' = 'PRODUCT' THEN resolved_product := (frame->>'object_id')::uuid;
        ELSE CONTINUE; END IF;
      WHEN 'operation_receipt' THEN
        IF frame->>'target_type' = 'PRODUCT' THEN resolved_product := (frame->>'target_id')::uuid;
        ELSE CONTINUE; END IF;
    END CASE;
    IF resolved_product IS NULL THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PARENT_UNRESOLVED'; END IF;
    product_ids := array_append(product_ids,resolved_product);
    -- CREATE audit is intentionally prepared before the new root exists. This
    -- is an absence-lock exception, never authorization for an audit or CREATE.
    IF TG_OP='INSERT' AND (TG_TABLE_NAME='product' OR
      (TG_TABLE_NAME='audit_change' AND frame->>'action'='CREATE'
       AND frame->'old_version'='null'::jsonb AND frame->>'new_version'='1'))
    THEN absent_create_ids := array_append(absent_create_ids,resolved_product); END IF;
  END LOOP;
  FOR product_id IN SELECT DISTINCT value FROM unnest(product_ids) AS ids(value) ORDER BY value LOOP
    -- BEFORE-row triggers can run after PostgreSQL acquired a row lock. Never
    -- wait for another writer's advisory/root lock in that inverted order.
    -- Contention is a transaction failure; no retry is performed by this guard.
    IF NOT pg_try_advisory_xact_lock(hashtextextended('naijue:product:' || product_id::text,0))
    THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_WRITER_BUSY' USING ERRCODE='55P03'; END IF;
    PERFORM 1 FROM naijue_erp.product WHERE id = product_id FOR UPDATE NOWAIT;
    IF NOT FOUND AND NOT (product_id=ANY(absent_create_ids))
    THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PARENT_UNRESOLVED'; END IF;
  END LOOP;
  -- A barcode's SKU could have changed between parent lookup and root locking.
  -- Recheck the exact observed mapping after all root locks; never choose a new
  -- parent silently. Full safety still requires every SKU writer to be guarded.
  IF cardinality(sku_ids)>0 THEN
    FOR position IN 1..cardinality(sku_ids) LOOP
      SELECT s.product_id INTO resolved_product FROM naijue_erp.sku s WHERE s.id=sku_ids[position];
      IF resolved_product IS DISTINCT FROM sku_parent_ids[position]
      THEN RAISE EXCEPTION 'STANDARD27_PRODUCT_PARENT_CHANGED'; END IF;
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$body$;
REVOKE ALL ON FUNCTION naijue_erp.serialize_standard27_product_writer_candidate() FROM PUBLIC;

CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.product
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sku
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sku_barcode
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.product_image
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.audit_change
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
CREATE TRIGGER standard27_product_writer_serialization BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.operation_receipt
FOR EACH ROW EXECUTE FUNCTION naijue_erp.serialize_standard27_product_writer_candidate();
COMMIT;
