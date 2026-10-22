-- Additive native payment creation directory. No existing database migration or history publication grant.
BEGIN;
SELECT naijue_erp.cutoff_import_lock();
DO $$ BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)
    IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] THEN
    RAISE EXCEPTION 'payment17 requires exact reviewed prefix1-16' USING ERRCODE='23514'; END IF;
END $$;
CREATE TABLE naijue_erp.import_native_payment_binding (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  entity_type text NOT NULL CHECK(entity_type IN ('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL')),
  source_key text NOT NULL CHECK(length(btrim(source_key))>0), source_row_id uuid NOT NULL,
  native_payment_method_id uuid REFERENCES naijue_erp.payment_method(id),
  native_payment_account_id uuid REFERENCES naijue_erp.payment_account(id), native_hall_id uuid REFERENCES naijue_erp.hall(id),
  native_snapshot jsonb NOT NULL CHECK(jsonb_typeof(native_snapshot)='object'),
  evidence_fingerprint text NOT NULL CHECK(evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  validator_version text NOT NULL CHECK(validator_version='NATIVE_PAYMENT_IMPORT_V1'),
  PRIMARY KEY(batch_id,entity_type,source_key), UNIQUE(batch_id,source_row_id),
  FOREIGN KEY(batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id),
  CHECK((entity_type='PAYMENT_METHOD' AND native_payment_method_id IS NOT NULL AND native_payment_account_id IS NULL AND native_hall_id IS NULL)
    OR (entity_type='PAYMENT_ACCOUNT' AND native_payment_method_id IS NOT NULL AND native_payment_account_id IS NOT NULL AND native_hall_id IS NULL)
    OR (entity_type='PAYMENT_ACCOUNT_HALL' AND native_payment_method_id IS NULL AND native_payment_account_id IS NOT NULL AND native_hall_id IS NOT NULL))
);
-- The composite relation FK is conditional: ACCOUNT has hall NULL, so does not acquire a hall restriction.
ALTER TABLE naijue_erp.import_native_payment_binding ADD CONSTRAINT native_payment_relation_fk
  FOREIGN KEY(native_payment_account_id,native_hall_id) REFERENCES naijue_erp.payment_account_hall(payment_account_id,hall_id);
CREATE UNIQUE INDEX native_payment_method_identity ON naijue_erp.import_native_payment_binding(batch_id,native_payment_method_id) WHERE entity_type='PAYMENT_METHOD';
CREATE UNIQUE INDEX native_payment_account_identity ON naijue_erp.import_native_payment_binding(batch_id,native_payment_account_id) WHERE entity_type='PAYMENT_ACCOUNT';
CREATE UNIQUE INDEX native_payment_hall_identity ON naijue_erp.import_native_payment_binding(batch_id,native_payment_account_id,native_hall_id) WHERE entity_type='PAYMENT_ACCOUNT_HALL';
CREATE FUNCTION naijue_erp.guard_native_payment_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; s naijue_erp.import_source_row%ROWTYPE;
  actual jsonb; evidence jsonb; expected_fields text[]; expected_refs text[]; mapping jsonb; field record; ref record;
  fresh boolean; dep_entity text; dep_id text;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
    RAISE EXCEPTION 'native payment scope closed' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='PAYMENT_METHOD' THEN
    SELECT to_jsonb(n),n.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) INTO STRICT actual,fresh
      FROM naijue_erp.payment_method n WHERE id=NEW.native_payment_method_id FOR SHARE;
    expected_fields:=ARRAY['来源编号','方式名称','状态'];expected_refs:=ARRAY[]::text[];
  ELSIF NEW.entity_type='PAYMENT_ACCOUNT' THEN
    SELECT to_jsonb(n),n.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) INTO STRICT actual,fresh
      FROM naijue_erp.payment_account n WHERE id=NEW.native_payment_account_id FOR SHARE;
    expected_fields:=ARRAY['来源编号','账户显示名称','收款方式来源编号','状态'];expected_refs:=ARRAY['收款方式来源编号'];
  ELSE
    SELECT to_jsonb(n),n.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) INTO STRICT actual,fresh
      FROM naijue_erp.payment_account_hall n WHERE payment_account_id=NEW.native_payment_account_id AND hall_id=NEW.native_hall_id FOR SHARE;
    expected_fields:=ARRAY['账户来源编号','厅来源编号'];expected_refs:=expected_fields;
  END IF;
  IF fresh IS DISTINCT FROM TRUE OR actual IS DISTINCT FROM NEW.native_snapshot
    OR (NEW.entity_type<>'PAYMENT_ACCOUNT_HALL' AND actual->'version'<>'1'::jsonb)
    OR (NEW.entity_type='PAYMENT_ACCOUNT' AND actual->>'payment_method_id' IS DISTINCT FROM NEW.native_payment_method_id::text) THEN
    RAISE EXCEPTION 'payment binding requires fresh exact native creation, never adoption' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT s FROM naijue_erp.import_source_row WHERE batch_id=NEW.batch_id AND id=NEW.source_row_id FOR SHARE;
  evidence:=s.field_provenance->'native_payment_import';
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row x WHERE x.id=s.id
      AND x.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296))
    OR (s.entity_type=NEW.entity_type AND s.source_key=NEW.source_key AND s.raw_fields=s.normalized_fields
      AND s.raw_fields ?& expected_fields AND s.raw_fields-expected_fields='{}'::jsonb
      AND evidence->>'validator_version'=NEW.validator_version AND evidence->>'evidence_fingerprint'=NEW.evidence_fingerprint
      AND evidence->'native_snapshot'=actual AND evidence->>'fixed_source_namespace'=b.source_name
      AND evidence->'selection'->>'entity'=NEW.entity_type AND evidence->'selection'->>'source'='BASE_V2'
      AND evidence->'selection'->>'selectionSha256'=b.source_hash
      AND evidence->'selection'->>'path'=(CASE NEW.entity_type WHEN 'PAYMENT_METHOD' THEN 'business/09收款方式.csv'
        WHEN 'PAYMENT_ACCOUNT' THEN 'business/10收款账户.csv' ELSE 'business/11账户适用厅.csv' END)
      AND jsonb_typeof(evidence->'references')='object' AND evidence->'references' ?& expected_refs
      AND (evidence->'references')-expected_refs='{}'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'payment source/creation evidence differs' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(s.raw_fields) f WHERE jsonb_typeof(f.value)<>'string' OR length(btrim(f.value#>>'{}'))=0
    OR (s.field_provenance->'fields'->f.key->>'origin'='ORIGINAL'
      AND s.field_provenance->'fields'->f.key->'raw'=f.value
      AND length(btrim(s.field_provenance->'fields'->f.key->>'reason'))>0) IS DISTINCT FROM TRUE)
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['baseManifestSha256','selectionSha256','approvalSha256','csvSha256']) k
      WHERE (evidence->'selection'->>k ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE) THEN
    RAISE EXCEPTION 'payment original cells or approval identity missing' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='PAYMENT_ACCOUNT_HALL' THEN
    IF NEW.source_key IS DISTINCT FROM ('['||to_json(s.raw_fields->>'账户来源编号')::text||','||to_json(s.raw_fields->>'厅来源编号')::text||']')
      OR evidence->'enabled_mapping' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'recommendation must retain original compound identity only' USING ERRCODE='23514'; END IF;
  ELSE
    mapping:=evidence->'enabled_mapping';
    IF (NEW.source_key=s.raw_fields->>'来源编号' AND actual->>'name'=s.raw_fields->>(CASE NEW.entity_type WHEN 'PAYMENT_METHOD' THEN '方式名称' ELSE '账户显示名称' END)
      AND jsonb_typeof(mapping)='object' AND mapping->>'raw'=s.raw_fields->>'状态'
      AND mapping->'native'=actual->'enabled' AND jsonb_typeof(mapping->'native')='boolean'
      AND length(btrim(mapping->>'evidenceRef'))>0) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'payment name/state mapping differs from original' USING ERRCODE='23514'; END IF;
  END IF;
  FOR ref IN SELECT * FROM jsonb_each(evidence->'references') LOOP
    dep_entity:=CASE ref.key WHEN '收款方式来源编号' THEN 'PAYMENT_METHOD' WHEN '账户来源编号' THEN 'PAYMENT_ACCOUNT' ELSE 'HALL' END;
    dep_id:=CASE ref.key WHEN '收款方式来源编号' THEN NEW.native_payment_method_id::text WHEN '账户来源编号' THEN NEW.native_payment_account_id::text ELSE NEW.native_hall_id::text END;
    IF (ref.value ?& ARRAY['entity','sourceKey','nativeId','nativeSnapshot'] AND ref.value-ARRAY['entity','sourceKey','nativeId','nativeSnapshot']='{}'::jsonb
      AND ref.value->>'entity'=dep_entity AND ref.value->>'sourceKey'=s.raw_fields->>ref.key AND ref.value->>'nativeId'=dep_id
      AND ref.value->'nativeSnapshot'->>'id'=dep_id
      AND ((dep_entity='HALL' AND EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference x WHERE x.batch_id=NEW.batch_id
        AND x.entity_type='HALL' AND x.source_key=ref.value->>'sourceKey' AND x.native_hall_id::text=dep_id AND x.native_snapshot=ref.value->'nativeSnapshot'))
      OR (dep_entity<>'HALL' AND EXISTS(SELECT 1 FROM naijue_erp.import_native_payment_binding x WHERE x.batch_id=NEW.batch_id
        AND x.entity_type=dep_entity AND x.source_key=ref.value->>'sourceKey' AND x.native_snapshot=ref.value->'nativeSnapshot'
        AND (CASE dep_entity WHEN 'PAYMENT_METHOD' THEN x.native_payment_method_id ELSE x.native_payment_account_id END)::text=dep_id)))) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'payment dependency lacks typed same-batch identity' USING ERRCODE='23514'; END IF;
    IF NEW.entity_type='PAYMENT_ACCOUNT' AND NOT EXISTS(SELECT 1 FROM naijue_erp.payment_method n
      WHERE id=NEW.native_payment_method_id AND to_jsonb(n)=ref.value->'nativeSnapshot') THEN
      RAISE EXCEPTION 'new account requires exact current method dependency snapshot' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER native_payment_binding_stage BEFORE INSERT ON naijue_erp.import_native_payment_binding FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_payment_binding();
CREATE TRIGGER native_payment_binding_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_native_payment_binding FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER native_payment_binding_no_truncate BEFORE TRUNCATE ON naijue_erp.import_native_payment_binding EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_native_payment_binding FROM PUBLIC;
CREATE FUNCTION naijue_erp.guard_native_payment_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL') AND NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_native_payment_binding x WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id
        AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'payment occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER native_payment_publication BEFORE INSERT OR UPDATE ON naijue_erp.import_batch FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_payment_publication();
INSERT INTO naijue_erp.schema_migration(version,description) VALUES(17,'Typed payment native creation and original optional recommendation facts; settlement/publication readiness not granted');
COMMIT;
