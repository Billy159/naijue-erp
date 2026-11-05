-- Versioned document append barcode guard. No installation has been executed.
BEGIN;
DO $guard$ DECLARE x record; BEGIN FOR x IN SELECT * FROM (VALUES ('guard_maintenance_audit_actor()', 'ac0ce9c91f34b9d8d34eb5e7d26f595319bfa6ad3dfe3ae33a4f2f5edf1eb217'),('guard_native_creation_identity()', 'b9995c98e2efb3aa0e7f76ab678ceb3de30073730d14b7c295f43d79199e7b97'),('validate_document_specification_commit()', 'b02bff6115bcf2c87758f8313a57a1a693733ba3ea192fcb1657bd176c587c06')) v(signature,sha) LOOP IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('naijue_erp.'||x.signature) AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=x.sha AND NOT p.prosecdef) THEN RAISE EXCEPTION 'DOCUMENT_APPEND_GUARD_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF; END LOOP; END $guard$;
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
        AND NEW.before_values=(jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb) || CASE WHEN NEW.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
        AND jsonb_typeof(NEW.after_values)='object' AND NEW.after_values-ARRAY['version','skus','barcodes']='{}'::jsonb
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
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN
    IF NEW.created_operation_id IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF; RETURN NEW;
  END IF;
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
          AND audit.before_values=(jsonb_build_object('version',audit.old_version,'skus','[]'::jsonb) || CASE WHEN audit.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
          AND audit.after_values-ARRAY['version','skus','barcodes']='{}'::jsonb
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
CREATE OR REPLACE FUNCTION naijue_erp.validate_document_specification_commit() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; parent naijue_erp.operation_receipt%ROWTYPE;
  pa naijue_erp.audit_change%ROWTYPE; current_actor record; item jsonb; actual jsonb;
  expected_raw text; barcode_count integer; parent_id uuid; actual_xid bigint; n integer; used boolean; parent_hall uuid;
  js_trim_chars text := chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)
    ||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
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
    OR NEW.before_values IS DISTINCT FROM (jsonb_build_object('version',NEW.old_version,'skus','[]'::jsonb) || CASE WHEN NEW.after_values ? 'barcodes' THEN jsonb_build_object('barcodes','[]'::jsonb) ELSE '{}'::jsonb END)
    OR jsonb_typeof(NEW.after_values) IS DISTINCT FROM 'object' OR NEW.after_values-ARRAY['version','skus','barcodes']<>'{}'::jsonb
    OR NEW.after_values->'version' IS DISTINCT FROM to_jsonb(NEW.new_version)
    OR jsonb_typeof(NEW.after_values->'skus') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Append must close with the exact same-transaction original DRAFT SAVE' USING ERRCODE='23514';
  END IF;
  IF pg_catalog.octet_length('['||NEW.before_values::text||','||NEW.after_values::text||']')>16777216 THEN
    RAISE EXCEPTION 'DOCUMENT_APPEND_EVIDENCE_TOO_LARGE' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(NEW.after_values->'skus') NOT BETWEEN 1 AND 5000
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
      SELECT EXISTS(SELECT 1 FROM naijue_erp.sales_line l WHERE l.sales_id=parent.target_id AND EXISTS(SELECT 1 FROM naijue_erp.sku selected_sku WHERE selected_sku.id=l.sku_id AND selected_sku.product_id=NEW.object_id AND selected_sku.color_id=(item->>'color_id')::uuid AND selected_sku.fit_id=(item->>'fit_id')::uuid)
        AND l.is_current AND l.quantity<>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    ELSE
      SELECT EXISTS(SELECT 1 FROM naijue_erp.transfer_line l WHERE l.transfer_id=parent.target_id AND EXISTS(SELECT 1 FROM naijue_erp.sku selected_sku WHERE selected_sku.id=l.sku_id AND selected_sku.product_id=NEW.object_id AND selected_sku.color_id=(item->>'color_id')::uuid AND selected_sku.fit_id=(item->>'fit_id')::uuid)
        AND l.is_current AND l.quantity>0 AND l.xmin::text::bigint=actual_xid AND EXISTS(SELECT 1 FROM jsonb_array_elements(pa.after_values->'lines') a
          WHERE a->>'id'=l.id::text AND a->>'skuId'=l.sku_id::text AND a->>'quantity'=l.quantity::text AND a->'isCurrent'='true'::jsonb)) INTO used;
    END IF;
    IF used IS NOT TRUE THEN RAISE EXCEPTION 'Every new SKU must belong to a color/fit pair selected by a nonzero actual parent SAVE line' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- Barcode rows are optional only when generation produced none. No old binding edits.
  SELECT count(*) INTO barcode_count FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.created_operation_id=NEW.operation_id;
  IF NOT (NEW.after_values ? 'barcodes') THEN
    IF barcode_count<>0 THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
  ELSE
    IF jsonb_typeof(NEW.after_values->'barcodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(NEW.after_values->'barcodes') NOT BETWEEN 1 AND 5000
      OR barcode_count<>jsonb_array_length(NEW.after_values->'barcodes')
      OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.after_values->'barcodes'))<>barcode_count
      OR (SELECT count(DISTINCT value->>'sku_id') FROM jsonb_array_elements(NEW.after_values->'barcodes'))<>barcode_count THEN
      RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_SET_MISMATCH' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.after_values->'barcodes') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(item))<>6 OR NOT item ?& ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled'] THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      SELECT to_jsonb(b) INTO actual FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id JOIN naijue_erp.product p ON p.id=s.product_id
        WHERE b.id=(item->>'id')::uuid AND s.product_id=NEW.object_id AND s.created_operation_id=NEW.operation_id
        AND s.xmin::text::bigint=actual_xid AND b.xmin::text::bigint=actual_xid AND b.barcode_kind='MAIN' AND b.enabled
        AND b.scheme_id=p.default_barcode_scheme_id;
      IF NOT FOUND OR actual IS DISTINCT FROM item THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_ROW_MISMATCH' USING ERRCODE='23514'; END IF;
      SELECT (CASE p.default_barcode_scheme_id::text
        WHEN 'c0b009e7-6f61-447a-b87e-ceea62711ec9' THEN '8'
        WHEN '82656465-2758-4be8-a965-412a971e9c4b' THEN '0'
        WHEN 'bc7ff32c-1025-4c30-8950-0b33a492c538' THEN '6'
        WHEN '48c4fe44-7521-44c1-a0e3-c547a1691028' THEN '2'
        WHEN '9c584ada-9d42-4159-9e51-208577657021' THEN '9'
        WHEN '0e70e45e-1a51-4d44-afe8-0002cf3fb7ef' THEN '5' ELSE NULL END)
        || CASE WHEN p.default_barcode_scheme_id='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef' THEN CASE WHEN f.code ~ '^[0-9]+$' THEN f.code ELSE NULL END ELSE '' END
        || p.system_item_code || c.code || z.code INTO expected_raw
        FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id JOIN naijue_erp.size z ON z.id=s.size_id
        WHERE s.id=(item->>'sku_id')::uuid AND p.system_item_code IS NOT NULL AND btrim(p.system_item_code,js_trim_chars)<>'' AND btrim(c.code,js_trim_chars)<>'' AND btrim(z.code,js_trim_chars)<>'';
      IF expected_raw IS NULL OR (SELECT coalesce(sum(CASE WHEN codepoint>65535 THEN 2 ELSE 1 END),0)
        FROM (SELECT ascii(substr(expected_raw,i,1)) AS codepoint FROM generate_series(1,length(expected_raw)) AS g(i)) cp)>512
        OR EXISTS(SELECT 1 FROM (SELECT ascii(substr(expected_raw,i,1)) AS codepoint FROM generate_series(1,length(expected_raw)) AS g(i)) cp WHERE codepoint BETWEEN 1 AND 31 OR codepoint=127)
        OR item->>'barcode' IS DISTINCT FROM expected_raw THEN RAISE EXCEPTION 'DOCUMENT_APPEND_BARCODE_RAW_MISMATCH' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
COMMIT;
