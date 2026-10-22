-- VERSION 0014: typed native dictionary creation evidence. SOURCE ONLY / PG NOT_RUN.
-- Does not change frozen 0011/0012, live dictionaries, SKU mappings, stock or publication authority.
BEGIN;
CREATE TABLE naijue_erp.import_native_catalogue_binding (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  entity_type text NOT NULL CHECK (entity_type IN ('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','SIZE_GROUP_MEMBER')),
  source_key text NOT NULL CHECK (length(btrim(source_key)) > 0), source_row_id uuid NOT NULL,
  category_id uuid REFERENCES naijue_erp.product_category(id), color_id uuid REFERENCES naijue_erp.color(id),
  fit_id uuid REFERENCES naijue_erp.fit(id), size_id uuid REFERENCES naijue_erp.size(id),
  size_group_id uuid REFERENCES naijue_erp.size_group(id), season_id uuid REFERENCES naijue_erp.season(id),
  member_group_id uuid, member_size_id uuid,
  native_snapshot jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot)='object'),
  evidence_fingerprint text NOT NULL CHECK (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  validator_version text NOT NULL CHECK (validator_version='NATIVE_CATALOGUE_IMPORT_V1'),
  PRIMARY KEY (batch_id,entity_type,source_key), UNIQUE (batch_id,source_row_id),
  UNIQUE (batch_id,category_id), UNIQUE (batch_id,color_id), UNIQUE (batch_id,fit_id), UNIQUE (batch_id,size_id),
  UNIQUE (batch_id,size_group_id), UNIQUE (batch_id,season_id), UNIQUE (batch_id,member_group_id,member_size_id),
  FOREIGN KEY (batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id),
  FOREIGN KEY (member_group_id,member_size_id) REFERENCES naijue_erp.size_group_member(size_group_id,size_id),
  CHECK ((entity_type='CATEGORY' AND category_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='COLOR' AND color_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='FIT' AND fit_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE' AND size_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE_GROUP' AND size_group_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SEASON' AND season_id IS NOT NULL AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=1)
    OR (entity_type='SIZE_GROUP_MEMBER' AND member_group_id IS NOT NULL AND member_size_id IS NOT NULL
      AND num_nonnulls(category_id,color_id,fit_id,size_id,size_group_id,season_id,member_group_id,member_size_id)=2))
);
CREATE FUNCTION naijue_erp.guard_native_catalogue_binding() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; s naijue_erp.import_source_row%ROWTYPE;
  actual jsonb; evidence jsonb; decisions jsonb; d jsonb; f record; field_name text; ref record; dep jsonb;
  table_name text; native_id uuid; ignored text[]; dep_entity text; decision_keys text[];
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
    RAISE EXCEPTION 'native dictionary import scope closed' USING ERRCODE='23514'; END IF;
  table_name:=CASE NEW.entity_type WHEN 'CATEGORY' THEN 'product_category' WHEN 'COLOR' THEN 'color' WHEN 'FIT' THEN 'fit'
    WHEN 'SIZE' THEN 'size' WHEN 'SIZE_GROUP' THEN 'size_group' WHEN 'SEASON' THEN 'season' ELSE 'size_group_member' END;
  native_id:=COALESCE(NEW.category_id,NEW.color_id,NEW.fit_id,NEW.size_id,NEW.size_group_id,NEW.season_id);
  IF NEW.entity_type='SIZE_GROUP_MEMBER' THEN
    SELECT to_jsonb(m) INTO STRICT actual FROM naijue_erp.size_group_member m
      WHERE size_group_id=NEW.member_group_id AND size_id=NEW.member_size_id FOR SHARE;
    PERFORM 1 FROM naijue_erp.size_group WHERE id=NEW.member_group_id FOR SHARE;
    PERFORM 1 FROM naijue_erp.size WHERE id=NEW.member_size_id FOR SHARE;
  ELSE
    EXECUTE format('SELECT to_jsonb(n) FROM naijue_erp.%I n WHERE id=$1 FOR SHARE',table_name) INTO STRICT actual USING native_id;
    IF NEW.entity_type='CATEGORY' AND actual->>'parent_id' IS NOT NULL THEN
      SELECT to_jsonb(n) INTO STRICT dep FROM naijue_erp.product_category n WHERE id=(actual->>'parent_id')::uuid FOR SHARE;
      IF dep->>'parent_id' IS NOT NULL OR actual->>'parent_id'=native_id::text THEN
        RAISE EXCEPTION 'category must preserve existing acyclic two-level contract' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  IF actual IS DISTINCT FROM NEW.native_snapshot OR (NEW.entity_type IN ('CATEGORY','COLOR','FIT') AND actual->'version'<>'1'::jsonb) THEN
    RAISE EXCEPTION 'native dictionary full creation snapshot differs' USING ERRCODE='23514'; END IF;
  -- Every native dependency lock is held before source evidence is consulted.
  SELECT * INTO STRICT s FROM naijue_erp.import_source_row WHERE batch_id=NEW.batch_id AND id=NEW.source_row_id FOR SHARE;
  evidence:=s.field_provenance->'native_catalogue_import'; decisions:=evidence->'decisions';
  IF (s.entity_type=NEW.entity_type AND s.source_key=NEW.source_key AND s.raw_fields=s.normalized_fields
    AND s.raw_fields->>(evidence->>'source_key_field')=NEW.source_key
    AND evidence->>'validator_version'=NEW.validator_version AND evidence->>'fingerprint'=NEW.evidence_fingerprint
    AND evidence->'native_snapshot'=NEW.native_snapshot
    AND evidence->>'target_key'=CASE WHEN NEW.entity_type='SIZE_GROUP_MEMBER' THEN NEW.member_group_id::text||'/'||NEW.member_size_id::text ELSE native_id::text END
    AND evidence->'selection'->>'source'='REVIEWED_DICTIONARY_OCCURRENCES_V1'
    AND evidence->'selection'->>'selectionSha256'=b.source_hash
    AND evidence->'selection'->>'baseManifestSha256' ~ '^[a-f0-9]{64}$'
    AND evidence->'selection'->>'approvalSha256' ~ '^[a-f0-9]{64}$'
    AND evidence->'selection'->>'occurrenceContractSha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(decisions)='object' AND jsonb_typeof(evidence->'references')='object') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'dictionary binding differs from original occurrence/approved creation evidence' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(s.raw_fields) r WHERE
    (s.field_provenance->'fields'->r.key->>'origin'='ORIGINAL'
      AND s.field_provenance->'fields'->r.key->'raw'=r.value) IS DISTINCT FROM TRUE) THEN
    RAISE EXCEPTION 'dictionary raw cell lacks original provenance' USING ERRCODE='23514'; END IF;
  ignored:=CASE NEW.entity_type WHEN 'CATEGORY' THEN ARRAY['id','version','parent_id'] WHEN 'SIZE_GROUP_MEMBER' THEN ARRAY['size_group_id','size_id']
    WHEN 'COLOR' THEN ARRAY['id','version'] WHEN 'FIT' THEN ARRAY['id','version'] ELSE ARRAY['id'] END;
  SELECT array_agg(k ORDER BY k) INTO decision_keys FROM jsonb_object_keys(actual-ignored) k;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(decisions) k) IS DISTINCT FROM decision_keys THEN
    RAISE EXCEPTION 'dictionary decision keys are incomplete or extra' USING ERRCODE='23514'; END IF;
  FOR f IN SELECT * FROM jsonb_each(actual-ignored) LOOP
    d:=decisions->f.key;
    IF d->>'kind'='SOURCE_FIELD' THEN
      field_name:=d->>'field';
      IF NOT s.raw_fields ? field_name OR d->>'origin' IS DISTINCT FROM 'ORIGINAL' OR d->'raw' IS DISTINCT FROM s.raw_fields->field_name
        OR (CASE WHEN f.key='display_order' AND jsonb_typeof(s.raw_fields->field_name)='string'
          THEN (s.raw_fields->>field_name ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$' AND to_jsonb((s.raw_fields->>field_name)::integer)=f.value)
          ELSE s.raw_fields->field_name=f.value END) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'native dictionary source decision differs' USING ERRCODE='23514'; END IF;
    ELSIF d->>'kind'='REVIEWED_VALUE' THEN
      IF (d->'value'=f.value AND d->>'origin'='MIGRATION_DERIVED' AND length(btrim(d->>'ruleId'))>0 AND length(btrim(d->>'evidenceRef'))>0
        AND length(btrim(d->>'reason'))>0 AND d->>'approvalSha256'=evidence->'selection'->>'approvalSha256'
        AND jsonb_typeof(d->'sourceFields')='array' AND jsonb_array_length(d->'sourceFields')>0
        AND jsonb_typeof(d->'inputs')='object'
        AND (SELECT count(*) FROM jsonb_object_keys(d->'inputs'))=jsonb_array_length(d->'sourceFields')
        AND (SELECT count(DISTINCT v) FROM jsonb_array_elements_text(d->'sourceFields') v)=jsonb_array_length(d->'sourceFields')
        AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(d->'inputs') k WHERE NOT (d->'sourceFields') ? k)) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'native dictionary new-property decision lacks reviewed evidence' USING ERRCODE='23514'; END IF;
      FOR field_name IN SELECT jsonb_array_elements_text(d->'sourceFields') LOOP
        IF NOT s.raw_fields ? field_name OR d->'inputs'->field_name IS DISTINCT FROM s.raw_fields->field_name THEN
          RAISE EXCEPTION 'reviewed dictionary decision input differs from original' USING ERRCODE='23514'; END IF;
      END LOOP;
    ELSE RAISE EXCEPTION 'unsupported dictionary creation decision' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (NEW.entity_type NOT IN ('CATEGORY','SIZE_GROUP_MEMBER') AND evidence->'references'<>'{}'::jsonb)
    OR (NEW.entity_type='CATEGORY' AND (evidence->'references')-'parent_id'<>'{}'::jsonb)
    OR (NEW.entity_type='SIZE_GROUP_MEMBER' AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(evidence->'references') k) IS DISTINCT FROM ARRAY['size_group_id','size_id']) THEN
    RAISE EXCEPTION 'native dictionary relation keys differ' USING ERRCODE='23514'; END IF;
  FOR ref IN SELECT * FROM jsonb_each(evidence->'references') LOOP
    dep_entity:=CASE ref.key WHEN 'parent_id' THEN 'CATEGORY' WHEN 'size_group_id' THEN 'SIZE_GROUP' WHEN 'size_id' THEN 'SIZE' END;
    IF (ref.value->>'entity'=dep_entity AND ref.value->>'nativeId'=actual->>ref.key AND ref.value->'nativeSnapshot'->>'id'=actual->>ref.key
      AND EXISTS (SELECT 1 FROM naijue_erp.import_native_catalogue_binding x WHERE x.batch_id=NEW.batch_id AND x.entity_type=dep_entity
        AND x.source_key=ref.value->>'sourceKey' AND x.native_snapshot=ref.value->'nativeSnapshot'
        AND COALESCE(x.category_id,x.size_id,x.size_group_id)::text=actual->>ref.key)) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'dictionary relation lacks exact same-batch source/native binding' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NEW.entity_type='CATEGORY' AND actual->>'parent_id' IS NOT NULL AND NOT evidence->'references' ? 'parent_id' THEN
    RAISE EXCEPTION 'category parent source binding missing' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER native_catalogue_binding_stage BEFORE INSERT ON naijue_erp.import_native_catalogue_binding
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_catalogue_binding();
CREATE TRIGGER native_catalogue_binding_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_native_catalogue_binding
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER native_catalogue_binding_no_truncate BEFORE TRUNCATE ON naijue_erp.import_native_catalogue_binding
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();
REVOKE ALL ON naijue_erp.import_native_catalogue_binding FROM PUBLIC;
CREATE FUNCTION naijue_erp.guard_native_catalogue_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','SIZE_GROUP_MEMBER')
    AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_native_catalogue_binding x
      WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'native dictionary occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER native_catalogue_publication BEFORE INSERT OR UPDATE ON naijue_erp.import_batch
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_catalogue_publication();
INSERT INTO naijue_erp.schema_migration(version,description)
  VALUES (14,'Typed immutable native dictionary creation bindings; exact occurrence and reviewed new-property decisions; SQL source only');
COMMIT;
