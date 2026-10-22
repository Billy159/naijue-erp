-- VERSION 0012: historical header native-reference catalogue. SQL SOURCE ONLY.
-- No native writes, guessed identities, import_record changes or publication authority.
-- The full typed native record is certified only at insertion, not after future native edits.
BEGIN;
CREATE TABLE naijue_erp.import_header_native_reference (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  entity_type text NOT NULL CHECK (entity_type IN ('HALL', 'CUSTOMER', 'STAFF')),
  source_key text NOT NULL CHECK (length(btrim(source_key)) > 0),
  source_row_id uuid NOT NULL,
  native_hall_id uuid REFERENCES naijue_erp.hall(id),
  native_customer_id uuid REFERENCES naijue_erp.customer(id),
  native_staff_id uuid REFERENCES naijue_erp.staff(id),
  native_version integer NOT NULL CHECK (native_version > 0),
  native_snapshot jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot) = 'object'),
  validator_version text NOT NULL CHECK (validator_version = 'V3_HISTORY_HEADER_NATIVE_REFERENCE_1'),
  PRIMARY KEY (batch_id, entity_type, source_key),
  UNIQUE (batch_id, source_row_id),
  UNIQUE (batch_id, entity_type, native_hall_id),
  UNIQUE (batch_id, entity_type, native_customer_id),
  UNIQUE (batch_id, entity_type, native_staff_id),
  FOREIGN KEY (batch_id, source_row_id) REFERENCES naijue_erp.import_source_row(batch_id, id),
  CHECK ((entity_type = 'HALL' AND native_hall_id IS NOT NULL AND native_customer_id IS NULL AND native_staff_id IS NULL)
    OR (entity_type = 'CUSTOMER' AND native_customer_id IS NOT NULL AND native_hall_id IS NULL AND native_staff_id IS NULL)
    OR (entity_type = 'STAFF' AND native_staff_id IS NOT NULL AND native_hall_id IS NULL AND native_customer_id IS NULL))
);
CREATE FUNCTION naijue_erp.guard_header_native_reference() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; source naijue_erp.import_source_row%ROWTYPE;
  hall_row naijue_erp.hall%ROWTYPE; customer_row naijue_erp.customer%ROWTYPE; staff_row naijue_erp.staff%ROWTYPE;
  actual jsonb; normalized_snapshot jsonb; native_id uuid; binding_key text; evidence jsonb;
  enum_field text; enum_fields text[]; relation_field text; relation_column text; relation_fields text[];
  mapping jsonb; relation_key text; relation_native text;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.batch_id FOR UPDATE;
  IF b.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED', 'VALIDATING')
    OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
    RAISE EXCEPTION 'historical native-reference staging scope is closed' USING ERRCODE = '23514';
  END IF;
  -- FOR SHARE blocks concurrent non-key updates as well as deletion until commit.
  IF NEW.entity_type = 'HALL' THEN
    SELECT * INTO STRICT hall_row FROM naijue_erp.hall WHERE id = NEW.native_hall_id FOR SHARE;
    actual := to_jsonb(hall_row); native_id := NEW.native_hall_id; binding_key := 'native_hall_id';
  ELSIF NEW.entity_type = 'CUSTOMER' THEN
    SELECT * INTO STRICT customer_row FROM naijue_erp.customer WHERE id = NEW.native_customer_id FOR SHARE;
    actual := to_jsonb(customer_row); native_id := NEW.native_customer_id; binding_key := 'native_customer_id';
  ELSIF NEW.entity_type = 'STAFF' THEN
    SELECT * INTO STRICT staff_row FROM naijue_erp.staff WHERE id = NEW.native_staff_id FOR SHARE;
    actual := to_jsonb(staff_row); native_id := NEW.native_staff_id; binding_key := 'native_staff_id';
  ELSE RAISE EXCEPTION 'unsupported native entity' USING ERRCODE = '23514'; END IF;
  -- Validate shape/types BEFORE typed conversion, which otherwise coerces strings and
  -- ignores unknown keys. Only timestamp spellings may differ from native JSON text.
  IF (jsonb_typeof(NEW.native_snapshot) = 'object'
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.native_snapshot) k)
      = (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(actual) k)) IS DISTINCT FROM TRUE
    OR EXISTS (SELECT 1 FROM jsonb_each(actual) f
      WHERE jsonb_typeof(NEW.native_snapshot->f.key) IS DISTINCT FROM jsonb_typeof(f.value))
    OR (CASE WHEN NEW.entity_type = 'CUSTOMER' THEN NEW.native_snapshot - ARRAY['created_at','updated_at']
      ELSE NEW.native_snapshot END) IS DISTINCT FROM
      (CASE WHEN NEW.entity_type = 'CUSTOMER' THEN actual - ARRAY['created_at','updated_at'] ELSE actual END) THEN
    RAISE EXCEPTION 'native snapshot has inexact keys, types or non-temporal fields' USING ERRCODE = '23514'; END IF;
  IF NEW.entity_type = 'HALL' THEN
    normalized_snapshot := to_jsonb(jsonb_populate_record(NULL::naijue_erp.hall, NEW.native_snapshot));
  ELSIF NEW.entity_type = 'CUSTOMER' THEN
    normalized_snapshot := to_jsonb(jsonb_populate_record(NULL::naijue_erp.customer, NEW.native_snapshot));
  ELSE
    normalized_snapshot := to_jsonb(jsonb_populate_record(NULL::naijue_erp.staff, NEW.native_snapshot));
  END IF;
  IF actual IS DISTINCT FROM normalized_snapshot
    OR actual->'version' IS DISTINCT FROM to_jsonb(NEW.native_version) THEN
    RAISE EXCEPTION 'native snapshot or version differs from locked native row' USING ERRCODE = '23514'; END IF;
  -- Lock all referenced native rows before reading source/catalogue evidence.
  IF NEW.entity_type = 'HALL' THEN
    PERFORM 1 FROM naijue_erp.customer WHERE id = (NEW.native_snapshot->>'default_customer_id')::uuid FOR SHARE;
    PERFORM 1 FROM naijue_erp.warehouse WHERE id = (NEW.native_snapshot->>'default_sales_warehouse_id')::uuid FOR SHARE;
  ELSIF NEW.entity_type = 'STAFF' THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id = (NEW.native_snapshot->>'hall_id')::uuid FOR SHARE;
  END IF;
  SELECT * INTO STRICT source FROM naijue_erp.import_source_row
    WHERE batch_id = NEW.batch_id AND id = NEW.source_row_id FOR SHARE;
  evidence := source.field_provenance->'header_native_reference';
  IF (source.entity_type = NEW.entity_type AND source.source_key = NEW.source_key
    AND source.raw_fields->>'来源编号' = NEW.source_key
    AND source.normalized_fields->>'来源编号' = NEW.source_key
    AND source.field_provenance->>binding_key = native_id::text
    AND evidence->>'validator_version' = NEW.validator_version
    AND evidence->>'native_id' = native_id::text
    AND evidence->'native_version' = to_jsonb(NEW.native_version)
    AND evidence->'native_snapshot' = NEW.native_snapshot) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'native reference differs from immutable source evidence' USING ERRCODE = '23514'; END IF;
  IF (CASE NEW.entity_type
    WHEN 'HALL' THEN source.raw_fields->>'厅名称' = actual->>'name'
    WHEN 'CUSTOMER' THEN source.raw_fields->>'原编码' = actual->>'code' AND source.raw_fields->>'名称' = actual->>'name'
    WHEN 'STAFF' THEN source.raw_fields->>'姓名' = actual->>'name'
    ELSE false END) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'native reference differs from exact original source fields' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(source.normalized_fields) f
    WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string' OR f.value IS DISTINCT FROM source.raw_fields->f.key) THEN
    RAISE EXCEPTION 'native reference requires exact normalized original fields' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(source.field_provenance) k
    WHERE k IN ('native_hall_id','native_customer_id','native_staff_id') AND k <> binding_key) THEN
    RAISE EXCEPTION 'competing native source binding' USING ERRCODE = '23514'; END IF;
  enum_fields := CASE WHEN NEW.entity_type = 'STAFF' THEN ARRAY['角色','任职状态'] ELSE ARRAY['状态'] END;
  IF (jsonb_typeof(evidence->'enum_mappings') = 'object'
    AND (evidence->'enum_mappings') - enum_fields = '{}'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'invalid enum evidence keys' USING ERRCODE = '23514'; END IF;
  FOREACH enum_field IN ARRAY enum_fields LOOP
    mapping := evidence->'enum_mappings'->enum_field;
    IF (jsonb_typeof(mapping) = 'object' AND mapping->'raw' = source.raw_fields->enum_field
      AND jsonb_typeof(mapping->'evidenceRef') = 'string' AND length(btrim(mapping->>'evidenceRef')) > 0
      AND mapping->'native' = actual->(CASE enum_field WHEN '状态' THEN 'enabled'
        WHEN '角色' THEN 'role' ELSE 'employment_status' END)) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'enum evidence differs from original or native field' USING ERRCODE = '23514'; END IF;
  END LOOP;
  IF NEW.entity_type = 'STAFF' AND actual->'contact' IS DISTINCT FROM
    (CASE WHEN source.raw_fields->>'联系方式' = '' THEN 'null'::jsonb ELSE source.raw_fields->'联系方式' END) THEN
    RAISE EXCEPTION 'contact differs from original field' USING ERRCODE = '23514'; END IF;
  relation_fields := CASE NEW.entity_type WHEN 'HALL' THEN ARRAY['默认客户来源编号','默认销货仓来源编号']
    WHEN 'STAFF' THEN ARRAY['所属厅来源编号'] ELSE ARRAY[]::text[] END;
  IF (jsonb_typeof(evidence->'bindings') = 'object'
    AND (evidence->'bindings') - relation_fields = '{}'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'invalid relation evidence keys' USING ERRCODE = '23514'; END IF;
  FOREACH relation_field IN ARRAY relation_fields LOOP
    relation_column := CASE relation_field WHEN '默认客户来源编号' THEN 'default_customer_id'
      WHEN '默认销货仓来源编号' THEN 'default_sales_warehouse_id' ELSE 'hall_id' END;
    relation_key := source.raw_fields->>relation_field;
    relation_native := actual->>relation_column;
    mapping := evidence->'bindings'->relation_field;
    IF relation_key = '' THEN
      IF relation_native IS NOT NULL OR evidence->'bindings' ? relation_field THEN
        RAISE EXCEPTION 'empty original relation cannot acquire a binding' USING ERRCODE = '23514'; END IF;
    ELSE
      IF (length(relation_key) > 0 AND jsonb_typeof(mapping) = 'object'
        AND mapping->>'sourceKey' = relation_key AND mapping->>'nativeId' = relation_native) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'relation differs from explicit source binding' USING ERRCODE = '23514'; END IF;
      IF relation_field = '默认销货仓来源编号' THEN
        IF NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = NEW.batch_id
          AND r.source_entity_type = 'WAREHOUSE' AND r.source_key = relation_key
          AND r.target_type = 'WAREHOUSE' AND r.target_id::text = relation_native AND r.status = 'IMPORTED') THEN
          RAISE EXCEPTION 'warehouse relation lacks exact same-batch import identity' USING ERRCODE = '23514'; END IF;
      ELSIF NOT EXISTS (SELECT 1 FROM naijue_erp.import_header_native_reference r
        WHERE r.batch_id = NEW.batch_id AND r.source_key = relation_key
        AND ((relation_field = '默认客户来源编号' AND r.entity_type = 'CUSTOMER' AND r.native_customer_id::text = relation_native)
          OR (relation_field = '所属厅来源编号' AND r.entity_type = 'HALL' AND r.native_hall_id::text = relation_native))) THEN
        RAISE EXCEPTION 'relation lacks exact same-batch native source identity' USING ERRCODE = '23514'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_header_native_reference_stage BEFORE INSERT ON naijue_erp.import_header_native_reference
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_header_native_reference();
CREATE TRIGGER import_header_native_reference_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_header_native_reference
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER import_header_native_reference_no_truncate BEFORE TRUNCATE ON naijue_erp.import_header_native_reference
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_header_native_reference FROM PUBLIC;
-- Additive publication gate: retains every schema11 count/stock/evidence requirement.
-- Native snapshots certify the binding-time state only. Do NOT compare mutable
-- current names/roles/halls/versions here: normal native maintenance remains legal.
CREATE FUNCTION naijue_erp.guard_header_native_reference_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (
    SELECT 1 FROM naijue_erp.history_sales_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    CROSS JOIN LATERAL (VALUES
      ('所属厅来源编号','HALL',h.hall_id),('客户来源编号','CUSTOMER',h.customer_id),
      ('营业员来源编号','STAFF',h.salesperson_id),('原创建厅编号','HALL',h.created_hall_id)
    ) v(field,entity,native_id)
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND v.native_id IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (v.native_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
          AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
          AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)=v.native_id))))
  ) OR EXISTS (
    SELECT 1 FROM naijue_erp.history_transfer_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->'原创建厅编号') IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>'原创建厅编号'='' AND h.created_hall_id IS NOT NULL)
      OR (s.normalized_fields->>'原创建厅编号'<>'' AND (h.created_hall_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id AND r.entity_type='HALL'
          AND r.source_key=s.normalized_fields->>'原创建厅编号' AND r.native_hall_id=h.created_hall_id))))
  ) THEN RAISE EXCEPTION 'historical header has incomplete same-batch native reference coverage' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT h.batch_id,h.source_row_id,'仓库来源编号'::text AS field,h.warehouse_id AS native_id FROM naijue_erp.history_sales_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调出仓来源编号',h.from_warehouse_id FROM naijue_erp.history_transfer_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调入仓来源编号',h.to_warehouse_id FROM naijue_erp.history_transfer_header h
    ) h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->h.field) IS DISTINCT FROM 'string'
      OR s.normalized_fields->>h.field='' OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
          AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
          AND r.source_key=s.normalized_fields->>h.field AND r.target_id=h.native_id))
  ) THEN RAISE EXCEPTION 'historical header warehouse lacks exact same-batch imported identity' USING ERRCODE='23514'; END IF;
  -- Do not let direct source-only inserts evade relation coverage by omitting
  -- the directory row altogether. Writer atomicity is not a publication proof.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN ('HALL','CUSTOMER','STAFF') AND NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=s.batch_id
          AND r.source_row_id=s.id AND r.entity_type=s.entity_type AND r.source_key=s.source_key)
  ) THEN RAISE EXCEPTION 'historical native dictionary source lacks exact reference directory coverage' USING ERRCODE='23514'; END IF;
  -- Cover nonempty relations in the directory's own original dictionary rows.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_header_native_reference d
    JOIN naijue_erp.import_source_row s ON s.batch_id=d.batch_id AND s.id=d.source_row_id
    CROSS JOIN LATERAL (
      SELECT '默认客户来源编号'::text AS field,'CUSTOMER'::text AS entity,'default_customer_id'::text AS native_column WHERE d.entity_type='HALL'
      UNION ALL SELECT '默认销货仓来源编号','WAREHOUSE','default_sales_warehouse_id' WHERE d.entity_type='HALL'
      UNION ALL SELECT '所属厅来源编号','HALL','hall_id' WHERE d.entity_type='STAFF'
    ) v
    WHERE d.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND d.native_snapshot->>v.native_column IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (d.native_snapshot->>v.native_column IS NULL
        OR (v.entity='WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
            AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
            AND r.source_key=s.normalized_fields->>v.field AND r.target_id::text=d.native_snapshot->>v.native_column))
        OR (v.entity<>'WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
            AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
            AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)::text=d.native_snapshot->>v.native_column)))))
  ) THEN RAISE EXCEPTION 'historical native directory has incomplete original relation coverage' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_batch_history_header_native_reference_publication BEFORE INSERT OR UPDATE ON naijue_erp.import_batch
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_header_native_reference_publication();

INSERT INTO naijue_erp.schema_migration(version, description)
  VALUES (12, 'Immutable explicit historical header native references; SQL source only, not database/runtime/import proof');
COMMIT;
