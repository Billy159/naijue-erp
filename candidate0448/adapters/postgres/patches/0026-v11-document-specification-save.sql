-- Approved v11 group-only document specification SAVE. C alone applies/readbacks.
-- Successor to v10: 2 replacements, 1 function, 1 deferred trigger; no tables/columns/grants.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.guard_maintenance_audit_actor() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE actor record;
BEGIN
  IF naijue_erp.maintenance_root_table(NEW.object_type) IS NULL THEN RETURN NEW; END IF;
  IF NEW.object_type IN ('STAFF','ACCOUNT','HALL') THEN PERFORM naijue_erp.maintenance_administrator_mutex(); END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO actor
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual current maintenance actor required' USING ERRCODE='42501'; END IF;
  IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职'
    OR NOT (actor.role='ADMIN' OR (actor.role='WAREHOUSE' AND NEW.object_type NOT IN ('STAFF','ACCOUNT'))
      OR (actor.role='SALESPERSON' AND actor.hall_id IS NOT NULL AND NEW.object_type='PRODUCT' AND NEW.action='EDIT'
        AND NEW.old_version IS NOT NULL AND NEW.new_version=NEW.old_version+1
        AND NEW.before_values=jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb)
        AND jsonb_typeof(NEW.after_values)='object' AND NEW.after_values-ARRAY['version','skus']='{}'::jsonb
        AND NEW.after_values->'version'=to_jsonb(NEW.new_version) AND jsonb_typeof(NEW.after_values->'skus')='array')) THEN
    RAISE EXCEPTION 'Current actor cannot authorize this maintenance family' USING ERRCODE='42501';
  END IF;
  IF actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall is unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION naijue_erp.guard_native_creation_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; family text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id<>OLD.id OR NEW.created_operation_id IS DISTINCT FROM OLD.created_operation_id THEN
      RAISE EXCEPTION 'Retained native identity cannot acquire or replace a creation operation' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='sku' THEN
      IF ROW(NEW.product_id,NEW.color_id,NEW.fit_id,NEW.size_id,NEW.sku_code)
        IS DISTINCT FROM ROW(OLD.product_id,OLD.color_id,OLD.fit_id,OLD.size_id,OLD.sku_code) THEN
        RAISE EXCEPTION 'Retained SKU coordinates and code cannot be rebound' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.created_operation_id IS NULL THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
      RAISE EXCEPTION 'Post-cutoff native creation requires its original audited operation' USING ERRCODE='23514';
    END IF;
    -- Preserve source-owned initial import INSERT guards, not a zero/adoption lane.
    RETURN NEW;
  END IF;
  IF NEW.version<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    RAISE EXCEPTION 'Runtime creation must start at version1 after cutoff publication' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT audit FROM naijue_erp.audit_change WHERE operation_id=NEW.created_operation_id;
  family:=CASE TG_TABLE_NAME WHEN 'warehouse' THEN 'WAREHOUSE' WHEN 'sku' THEN 'PRODUCT' END;
  IF audit.object_type IS DISTINCT FROM family OR audit.action NOT IN ('CREATE','EDIT')
    OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
      LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE a.id=audit.actor_account_id AND a.login_enabled
      AND s.employment_status='在职' AND (s.role IN ('ADMIN','WAREHOUSE')
        OR (TG_TABLE_NAME='sku' AND s.role='SALESPERSON' AND s.hall_id IS NOT NULL AND h.enabled
          AND audit.object_type='PRODUCT' AND audit.action='EDIT'
          AND audit.before_values=jsonb_build_object('version',audit.old_version,'skus','[]'::jsonb)
          AND audit.after_values-ARRAY['version','skus']='{}'::jsonb
          AND audit.after_values->'version'=to_jsonb(audit.new_version) AND jsonb_typeof(audit.after_values->'skus')='array'))
      AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'Native creation requires current trusted maintenance authority and same-transaction prepared audit' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='warehouse' THEN
    IF audit.object_id<>NEW.id OR audit.action<>'CREATE' THEN
      RAISE EXCEPTION 'Warehouse creation operation targets another root' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='sku' THEN
    IF audit.object_id<>NEW.product_id THEN
      RAISE EXCEPTION 'SKU creation operation targets another product' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Only the prefix identifies a candidate; it is never sufficient authority.
CREATE FUNCTION naijue_erp.validate_document_specification_commit() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; parent naijue_erp.operation_receipt%ROWTYPE;
  pa naijue_erp.audit_change%ROWTYPE; current_actor record; item jsonb; actual jsonb;
  parent_id uuid; actual_xid bigint; n integer; used boolean; parent_hall uuid;
BEGIN
  IF NEW.object_type<>'PRODUCT' OR NEW.action<>'EDIT' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO current_actor
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF r.request_key NOT LIKE 'doc-spec:%' AND current_actor.role IS DISTINCT FROM 'SALESPERSON' THEN RETURN NULL; END IF;
  actual_xid:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.id IS NULL OR r.request_key !~ '^doc-spec:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR split_part(r.request_key,':',3)<>NEW.object_id::text OR r.actor_account_id<>NEW.actor_account_id
    OR r.action<>'EDIT' OR r.target_type<>'PRODUCT' OR r.target_id<>NEW.object_id OR r.status<>'COMMITTED'
    OR r.completed_at<>NEW.occurred_at OR r.result_data<>jsonb_build_object('operationId',NEW.operation_id,'kind','PRODUCT','targetId',NEW.object_id,'version',NEW.new_version)
    OR NOT naijue_erp.maintenance_audit_is_current(NEW.operation_id)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=r.id AND q.xmin::text::bigint=actual_xid)
    OR current_actor.login_enabled IS NOT TRUE OR current_actor.employment_status IS DISTINCT FROM '在职'
    OR current_actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') THEN
    RAISE EXCEPTION 'Document append requires the exact original current actor audit and receipt' USING ERRCODE='23514';
  END IF;
  parent_id:=split_part(r.request_key,':',2)::uuid;
  SELECT * INTO parent FROM naijue_erp.operation_receipt q WHERE q.id=parent_id AND q.xmin::text::bigint=actual_xid;
  SELECT * INTO pa FROM naijue_erp.audit_change WHERE operation_id=parent_id;
  IF parent.id IS NULL OR parent.id=NEW.operation_id OR parent.actor_account_id<>NEW.actor_account_id OR parent.action<>'SAVE'
    OR parent.status<>'COMMITTED' OR parent.target_type NOT IN ('SALES','TRANSFER') OR parent.completed_at<>NEW.occurred_at
    OR pa.operation_id IS NULL OR NOT naijue_erp.maintenance_audit_is_current(parent_id)
    OR pa.actor_account_id<>parent.actor_account_id OR pa.object_type<>parent.target_type OR pa.object_id<>parent.target_id
    OR pa.action<>'SAVE' OR pa.occurred_at<>parent.completed_at OR pa.new_version<>coalesce(pa.old_version,0)+1
    OR (pa.after_values->'header' ? 'status' AND pa.after_values->'header'->>'status' IS DISTINCT FROM 'DRAFT') OR pa.after_values->'header'->>'version' IS DISTINCT FROM pa.new_version::text
    OR parent.result_data->>'operationId' IS DISTINCT FROM parent_id::text OR parent.result_data->>'version' IS DISTINCT FROM pa.new_version::text
    OR parent.result_data->>'status' IS DISTINCT FROM 'DRAFT' OR parent.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR NEW.old_version IS NULL OR NEW.new_version<>NEW.old_version+1
    OR NEW.before_values<>jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb)
    OR jsonb_typeof(NEW.after_values) IS DISTINCT FROM 'object' OR NEW.after_values-ARRAY['version','skus']<>'{}'::jsonb
    OR NEW.after_values->'version' IS DISTINCT FROM to_jsonb(NEW.new_version)
    OR jsonb_typeof(NEW.after_values->'skus') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Append must close with the exact same-transaction original DRAFT SAVE' USING ERRCODE='23514';
  END IF;
  IF jsonb_array_length(NEW.after_values->'skus') NOT BETWEEN 1 AND 200
    OR jsonb_typeof(pa.after_values->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Bounded nonempty append and actual parent lines required' USING ERRCODE='23514';
  END IF;
  IF current_actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=current_actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current document actor hall unavailable' USING ERRCODE='42501'; END IF;
  ELSIF current_actor.role='SALESPERSON' THEN
    RAISE EXCEPTION 'Salesperson requires an actual hall' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM naijue_erp.product p WHERE p.id=NEW.object_id AND p.enabled AND p.deleted_at IS NULL AND p.version=NEW.new_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact appended product root required' USING ERRCODE='23514'; END IF;
  IF parent.target_type='SALES' THEN
    SELECT h.hall_id INTO parent_hall FROM naijue_erp.sales_header h WHERE h.id=parent.target_id AND h.status='DRAFT' AND h.version=pa.new_version
      AND h.xmin::text::bigint=actual_xid AND parent.result_data->>'salesId'=h.id::text;
    IF NOT FOUND OR (current_actor.role='SALESPERSON' AND parent_hall IS DISTINCT FROM current_actor.hall_id) THEN
      RAISE EXCEPTION 'Append parent sales SAVE is outside current actor scope' USING ERRCODE='42501'; END IF;
  ELSE
    PERFORM 1 FROM naijue_erp.transfer_header h JOIN naijue_erp.warehouse f ON f.id=h.from_warehouse_id JOIN naijue_erp.warehouse t ON t.id=h.to_warehouse_id
      WHERE h.id=parent.target_id AND h.status='DRAFT' AND h.version=pa.new_version AND h.xmin::text::bigint=actual_xid
        AND parent.result_data->>'transferId'=h.id::text
        AND (current_actor.role IN ('ADMIN','WAREHOUSE') OR f.hall_id=current_actor.hall_id OR t.hall_id=current_actor.hall_id
          OR (h.created_role='SALESPERSON' AND h.created_hall_id=current_actor.hall_id AND h.created_by_account_id IS NOT NULL));
    IF NOT FOUND THEN RAISE EXCEPTION 'Append parent transfer SAVE is outside current actor scope' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT count(*) INTO n FROM naijue_erp.sku WHERE created_operation_id=NEW.operation_id;
  IF n<>jsonb_array_length(NEW.after_values->'skus') OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.after_values->'skus'))<>n THEN
    RAISE EXCEPTION 'Append evidence must equal the entire actual new SKU set' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.after_values->'skus') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact nine-column SKU evidence required' USING ERRCODE='23514'; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item))<>9 OR NOT item ?& ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id'] THEN
      RAISE EXCEPTION 'Exact nine-column SKU evidence required' USING ERRCODE='23514'; END IF;
    SELECT to_jsonb(s) INTO actual FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
      JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=s.size_id
      JOIN naijue_erp.size z ON z.id=m.size_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id
      WHERE s.id=(item->>'id')::uuid AND s.product_id=NEW.object_id AND s.created_operation_id=NEW.operation_id
        AND s.version=1 AND s.enabled AND s.sku_code='NJNEW-'||replace(s.id::text,'-','')
        AND c.enabled AND c.deleted_at IS NULL AND f.enabled AND f.deleted_at IS NULL AND s.xmin::text::bigint=actual_xid;
    IF NOT FOUND OR actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'Actual new SKU differs or lies outside current product group' USING ERRCODE='23514'; END IF;
    IF parent.target_type='SALES' THEN
      SELECT EXISTS(SELECT 1 FROM naijue_erp.sales_line l WHERE l.sales_id=parent.target_id AND l.sku_id=(item->>'id')::uuid
        AND l.is_current AND l.quantity<>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    ELSE
      SELECT EXISTS(SELECT 1 FROM naijue_erp.transfer_line l WHERE l.transfer_id=parent.target_id AND l.sku_id=(item->>'id')::uuid
        AND l.is_current AND l.quantity>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    END IF;
    IF used IS NOT TRUE THEN RAISE EXCEPTION 'Every new SKU must be used by a nonzero actual parent SAVE line' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_document_specification_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER document_specification_commit AFTER INSERT ON naijue_erp.audit_change
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_document_specification_commit();

COMMIT;
