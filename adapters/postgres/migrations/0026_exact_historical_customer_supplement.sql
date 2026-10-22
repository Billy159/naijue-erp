-- Registered26 source WIP. Existing JSON only: no new tables/columns.
-- C/QB outside-source approval and actual engine proof are separate prerequisites.
-- Original0012/0013/0014 files and oldschema registrations remain immutable.
BEGIN;
CREATE FUNCTION naijue_erp.exact_historical_customer_source_matches(source jsonb,native jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE pinned record; raw jsonb;
BEGIN
  SELECT * INTO pinned FROM (VALUES
    ('HIST-CUSTOMER:7d256f74-8a8b-d420-2749-a9ca70e21f9d','4278c80d-c380-1561-cfc4-3e1ee0dcfe5f'::uuid,'2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'1','a6f9b9d9548895debb47fc18c69833230e4d7fb49d384d2f18a351e09c792dc7','92f132ff61524e363d31b4ae4a44a1707f2fb40c7db9122756876438d1b50c57'),
    ('HIST-CUSTOMER:d315fc13-fee5-82ca-5716-83fe0e96d5c3','055e00fc-8309-b3d2-e71e-94f8a31c1626'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid,'2','c51d7bf8b1a87420b7d2cbc80fd8935a0f18f491963da31c7ce5f3ca58144fb6','19858e4e8dfb13864c22f9f3997134f4393f224527f68f5d4a3fd0dcbdce635e')) x(source_key,source_id,native_id,row_no,row_hash,raw_hash) WHERE source_key=source->>'source_key';
  IF NOT FOUND THEN RETURN false; END IF;
  raw:=source->'raw_fields';
  RETURN coalesce(source->>'entity_type'='CUSTOMER' AND source->>'id'=pinned.source_id::text
    AND source->>'file_ref'='dictionaries/historical-customers.json' AND source->>'sheet'='JSON_ARRAY_ITEMS'
    AND source->>'row_no'=pinned.row_no AND source->>'row_sha256'=pinned.row_hash
    AND source->>'source_file_sha256'='79305bfcb0545e5bc26601f839508be2b64a6637cd6fb1ef1819c6989fc38e65'
    AND source->'normalized_fields'=raw
    AND naijue_erp.history_closure_row_hash('HISTORICAL_CUSTOMER_SUPPLEMENT_V1',pinned.source_key,raw)=pinned.raw_hash
    AND raw->>'sourceKey'=pinned.source_key AND raw->>'originalPartyIdentity'=substr(pinned.source_key,15)
    AND raw->'historicalOnly'='true'::jsonb AND raw->'visibleInCurrentCustomerList'='false'::jsonb
    AND native=jsonb_build_object('id',pinned.native_id,'code',raw->'originalCode','name',raw->'originalName',
      'enabled',false,'version',1,'created_at',NULL,'updated_at',NULL),false);
END $$;
CREATE FUNCTION naijue_erp.validate_exact_historical_customer_intent(intent naijue_erp.native_party_import_evidence,batch naijue_erp.import_batch) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF intent.entity_type<>'CUSTOMER' OR NOT naijue_erp.exact_historical_customer_source_matches(intent.source_snapshot,intent.native_snapshot)
    OR intent.source_snapshot->>'batch_id' IS DISTINCT FROM batch.id::text
    OR intent.source_snapshot->>'id' IS DISTINCT FROM intent.source_row_id::text
    OR intent.source_snapshot->>'source_key' IS DISTINCT FROM intent.source_key
    OR intent.native_snapshot->>'id' IS DISTINCT FROM intent.native_id::text
    OR intent.validator_version<>'NATIVE_PARTY_IMPORT_V1' OR intent.warehouse_record IS NOT NULL
    OR (intent.selection->>'entity'='CUSTOMER' AND intent.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'
      AND intent.selection->>'path'='dictionaries/historical-customers.json'
      AND intent.selection->>'sourceFileSha256'='79305bfcb0545e5bc26601f839508be2b64a6637cd6fb1ef1819c6989fc38e65'
      AND intent.selection->>'selectionSha256'=batch.source_hash
      AND intent.selection->>'approvalSha256'='e471ccdef09f385688d8f5709e072a033d471f0c6fdba8b7bb1b49ad55a9408a'
      AND intent.selection->>'baseManifestSha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM TRUE
    OR intent."authorization" IS DISTINCT FROM jsonb_build_object('sourceRowId',intent.source_row_id::text,'sourceKey',intent.source_key,
      'nativeId',intent.native_id::text,'rowFingerprint',intent.row_fingerprint,'selectionSha256',intent.selection->>'selectionSha256',
      'approvalSha256',intent.selection->>'approvalSha256') THEN
    RAISE EXCEPTION 'Only independently pinned original historical customer identities are admitted' USING ERRCODE='23514';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION naijue_erp.guard_native_party_import_intent() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; table_name text; expected_keys text[]; expected_fields text[];
  raw jsonb; normalized jsonb; proof jsonb; mapping jsonb; required_field text; enum_field text; enum_fields text[];
  exists_native boolean; source_path text;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
    RAISE EXCEPTION 'native party import staging scope is closed' USING ERRCODE='23514'; END IF;
  -- Same fixed-namespace original source identity discipline as the existing import_record lane.
  PERFORM naijue_erp.import_source_key_lock(b.source_name,NEW.entity_type,NEW.source_key);
  IF EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_batch prior ON prior.id=e.batch_id
    WHERE prior.source_name=b.source_name AND e.entity_type=NEW.entity_type AND e.source_key=NEW.source_key) THEN
    RAISE EXCEPTION 'original source already has immutable native creation evidence; resume its original batch' USING ERRCODE='23505'; END IF;
  IF NEW.creation_xid IS DISTINCT FROM pg_current_xact_id() OR NEW.imported_at IS DISTINCT FROM transaction_timestamp() THEN
    RAISE EXCEPTION 'import metadata must describe the actual current transaction' USING ERRCODE='23514'; END IF;
  table_name:=CASE NEW.entity_type WHEN 'HALL' THEN 'hall' WHEN 'CUSTOMER' THEN 'customer' WHEN 'SUPPLIER' THEN 'supplier' WHEN 'STAFF' THEN 'staff' WHEN 'WAREHOUSE' THEN 'warehouse' END;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I WHERE id=$1)',table_name) INTO exists_native USING NEW.native_id;
  IF exists_native THEN RAISE EXCEPTION 'import creation intent cannot adopt a pre-existing native row' USING ERRCODE='23514'; END IF;
  expected_keys:=CASE NEW.entity_type WHEN 'HALL' THEN ARRAY['id','name','default_customer_id','default_sales_warehouse_id','enabled','version']
    WHEN 'STAFF' THEN ARRAY['id','name','hall_id','role','contact','employment_status','version']
    WHEN 'WAREHOUSE' THEN ARRAY['id','hall_id','name','enabled','version','created_operation_id']
    ELSE ARRAY['id','code','name','enabled','version','created_at','updated_at'] END;
  IF (NEW.native_snapshot ?& expected_keys AND NEW.native_snapshot-expected_keys='{}'::jsonb
    AND NEW.native_snapshot->>'id'=NEW.native_id::text AND NEW.native_snapshot->'version'='1'::jsonb
    AND jsonb_typeof(NEW.native_snapshot->'name')='string' AND length(btrim(NEW.native_snapshot->>'name'))>0) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'exact independent version-one native shape is required' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type IN ('CUSTOMER','SUPPLIER') AND (jsonb_typeof(NEW.native_snapshot->'enabled')='boolean'
    AND jsonb_typeof(NEW.native_snapshot->'code')='string' AND length(btrim(NEW.native_snapshot->>'code'))>0
    AND NEW.native_snapshot->'created_at'='null'::jsonb AND NEW.native_snapshot->'updated_at'='null'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'original party state/code and unknown historical timestamps cannot be fabricated' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='WAREHOUSE' AND NEW.native_snapshot->'created_operation_id' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'Imported warehouse has explicit NULL runtime creation operation' USING ERRCODE='23514';
  END IF;
  IF NEW.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1' THEN
    PERFORM naijue_erp.validate_exact_historical_customer_intent(NEW,b); RETURN NEW;
  END IF;
  source_path:=CASE NEW.entity_type WHEN 'HALL' THEN 'business/06厅.csv' WHEN 'CUSTOMER' THEN 'business/04客户.csv'
    WHEN 'SUPPLIER' THEN 'business/05供应商.csv' WHEN 'WAREHOUSE' THEN 'business/07仓库.csv' ELSE 'business/08员工.csv' END;
  IF (NEW.selection->>'entity'=NEW.entity_type AND NEW.selection->>'source'='BASE_V2' AND NEW.selection->>'path'=source_path
    AND NEW.selection->>'selectionSha256'=b.source_hash AND NEW.selection->>'selectionSha256' ~ '^[0-9a-f]{64}$'
    AND NEW.selection->>'approvalSha256' ~ '^[0-9a-f]{64}$' AND NEW.selection->>'csvSha256' ~ '^[0-9a-f]{64}$'
    AND NEW.selection->>'baseManifestSha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'reviewed exact source selection is required' USING ERRCODE='23514'; END IF;
  IF NEW."authorization" IS DISTINCT FROM jsonb_build_object('sourceRowId',NEW.source_row_id::text,'sourceKey',NEW.source_key,
    'nativeId',NEW.native_id::text,'rowFingerprint',NEW.row_fingerprint,'selectionSha256',NEW.selection->>'selectionSha256',
    'approvalSha256',NEW.selection->>'approvalSha256') THEN
    RAISE EXCEPTION 'exact per-row source/native authorization evidence is required' USING ERRCODE='23514'; END IF;
  raw:=NEW.source_snapshot->'raw_fields'; normalized:=NEW.source_snapshot->'normalized_fields';
  expected_fields:=CASE NEW.entity_type WHEN 'HALL' THEN ARRAY['来源编号','厅名称','默认客户来源编号','默认销货仓来源编号','状态']
    WHEN 'STAFF' THEN ARRAY['来源编号','姓名','角色','所属厅来源编号','联系方式','任职状态']
    WHEN 'WAREHOUSE' THEN ARRAY['来源编号','仓库名称','所属厅来源编号','状态','切换范围'] ELSE ARRAY['来源编号','原编码','名称','状态'] END;
  IF (NEW.source_snapshot->>'id'=NEW.source_row_id::text AND NEW.source_snapshot->>'batch_id'=NEW.batch_id::text
    AND NEW.source_snapshot->>'entity_type'=NEW.entity_type AND NEW.source_snapshot->>'source_key'=NEW.source_key
    AND raw->>'来源编号'=NEW.source_key AND normalized ?& expected_fields AND normalized-expected_fields='{}'::jsonb
    AND jsonb_typeof(raw)='object' AND jsonb_typeof(normalized)='object') IS DISTINCT FROM TRUE
    OR EXISTS(SELECT 1 FROM jsonb_each(normalized) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string' OR raw->f.key IS DISTINCT FROM f.value) THEN
    RAISE EXCEPTION 'exact original source identity and normalized strings are required' USING ERRCODE='23514'; END IF;
  FOREACH required_field IN ARRAY (CASE NEW.entity_type WHEN 'HALL' THEN ARRAY['来源编号','厅名称','状态']
    WHEN 'STAFF' THEN ARRAY['来源编号','姓名','角色','任职状态'] WHEN 'WAREHOUSE' THEN ARRAY['来源编号','仓库名称','所属厅来源编号','状态','切换范围'] ELSE ARRAY['来源编号','原编码','名称','状态'] END) LOOP
    IF length(btrim(raw->>required_field))=0 THEN RAISE EXCEPTION 'unknown native-required source field' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (CASE NEW.entity_type WHEN 'HALL' THEN raw->'厅名称'=NEW.native_snapshot->'name'
    WHEN 'STAFF' THEN raw->'姓名'=NEW.native_snapshot->'name' WHEN 'WAREHOUSE' THEN raw->'仓库名称'=NEW.native_snapshot->'name' ELSE raw->'原编码'=NEW.native_snapshot->'code' AND raw->'名称'=NEW.native_snapshot->'name' END) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'native names and original codes must equal original source fields' USING ERRCODE='23514'; END IF;
  proof:=NEW.source_snapshot->'field_provenance'->CASE WHEN NEW.entity_type IN ('SUPPLIER','WAREHOUSE') THEN 'native_party_import' ELSE 'header_native_reference' END;
  enum_fields:=CASE WHEN NEW.entity_type='STAFF' THEN ARRAY['角色','任职状态'] ELSE ARRAY['状态'] END;
  IF (jsonb_typeof(proof->'enum_mappings')='object' AND (proof->'enum_mappings')-enum_fields='{}'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'explicit original enum mappings are required' USING ERRCODE='23514'; END IF;
  FOREACH enum_field IN ARRAY enum_fields LOOP
    mapping:=proof->'enum_mappings'->enum_field;
    IF (mapping->'raw'=raw->enum_field AND jsonb_typeof(mapping->'evidenceRef')='string' AND length(btrim(mapping->>'evidenceRef'))>0
      AND mapping->'native'=NEW.native_snapshot->(CASE enum_field WHEN '状态' THEN 'enabled' WHEN '角色' THEN 'role' ELSE 'employment_status' END)) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'original enum differs from explicit native mapping' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NEW.native_id::text=NEW.source_key THEN RAISE EXCEPTION 'native UUID must be independently mapped, never source-key reuse' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type IN ('SUPPLIER','WAREHOUSE') THEN
    IF (proof->>'validator_version'='NATIVE_PARTY_IMPORT_V1' AND proof->>'native_id'=NEW.native_id::text
      AND proof->'native_snapshot'=NEW.native_snapshot AND proof->>'row_fingerprint'=NEW.row_fingerprint
      AND proof->'selection'=NEW.selection) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'standalone original source lacks exact native creation provenance' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.entity_type='WAREHOUSE' THEN
    IF (raw->>'切换范围'='本次完整核准' AND jsonb_typeof(NEW.native_snapshot->'enabled')='boolean' AND jsonb_typeof(NEW.native_snapshot->'hall_id')='string'
      AND proof->'bindings' ? '所属厅来源编号' AND (proof->'bindings')-ARRAY['所属厅来源编号']='{}'::jsonb
      AND proof->'bindings'->'所属厅来源编号'->>'sourceKey'=raw->>'所属厅来源编号'
      AND proof->'bindings'->'所属厅来源编号'->'nativeId'=NEW.native_snapshot->'hall_id'
      AND jsonb_typeof(NEW.warehouse_record)='object' AND NEW.warehouse_record ?& ARRAY['id','reviewedAt','decisionReason']
      AND NEW.warehouse_record-ARRAY['id','reviewedAt','decisionReason']='{}'::jsonb
      AND jsonb_typeof(NEW.warehouse_record->'decisionReason')='string' AND length(btrim(NEW.warehouse_record->>'decisionReason'))>0) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'warehouse requires explicit original hall binding and immutable import record metadata' USING ERRCODE='23514'; END IF;
  ELSIF NEW.warehouse_record IS NOT NULL THEN
    RAISE EXCEPTION 'only warehouse import has warehouse record metadata' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_header_native_reference() RETURNS trigger LANGUAGE plpgsql
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
  IF NEW.entity_type='CUSTOMER' AND NEW.source_key LIKE 'HIST-CUSTOMER:%' THEN
    IF NOT naijue_erp.exact_historical_customer_source_matches(to_jsonb(source),actual)
      OR source.field_provenance->>'native_customer_id' IS DISTINCT FROM native_id::text
      OR evidence->'bindings' IS DISTINCT FROM '{}'::jsonb
      OR evidence->'enum_mappings' IS DISTINCT FROM jsonb_build_object('enabled',jsonb_build_object('raw',false,'native',false,
        'evidenceRef','e471ccdef09f385688d8f5709e072a033d471f0c6fdba8b7bb1b49ad55a9408a'))
      OR (evidence->>'validator_version'=NEW.validator_version AND evidence->>'native_id'=native_id::text
        AND evidence->'native_version'=to_jsonb(NEW.native_version) AND evidence->'native_snapshot'=NEW.native_snapshot) IS DISTINCT FROM TRUE
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=NEW.batch_id
        AND e.entity_type='CUSTOMER' AND e.source_row_id=NEW.source_row_id AND e.source_key=NEW.source_key
        AND e.native_id=NEW.native_customer_id AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'
        AND e.native_snapshot=actual AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))=to_jsonb(source)) THEN
      RAISE EXCEPTION 'Exact historical customer header binding differs from immutable original source' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_catalogue_binding() RETURNS trigger LANGUAGE plpgsql
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
  IF NEW.entity_type IN ('CATEGORY','COLOR','FIT') THEN
    IF actual->'deleted_at' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'First source catalogue creation cannot introduce a tombstone' USING ERRCODE='23514';
    END IF;
    -- Approved nullable migration metadata, not a fabricated original field.
    -- Full native snapshot equality still includes deleted_at=NULL.
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
  IF NEW.entity_type IN ('CATEGORY','COLOR','FIT') THEN ignored:=array_append(ignored,'deleted_at'); END IF;
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

-- This is a classification predicate, never a publication/visibility grant.
-- It exposes only a boolean; runtime roles receive no private source SELECT grant.
CREATE FUNCTION naijue_erp.is_exact_historical_customer_only(target uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE matched bigint;
BEGIN
  IF target IS NULL OR target NOT IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid) THEN RETURN false; END IF;
  SELECT count(*) INTO matched FROM naijue_erp.customer c
    JOIN naijue_erp.native_party_import_evidence e ON e.entity_type='CUSTOMER' AND e.native_id=c.id
    JOIN naijue_erp.import_source_row s ON s.id=e.source_row_id AND s.batch_id=e.batch_id
    JOIN naijue_erp.import_header_native_reference h ON h.batch_id=e.batch_id AND h.source_row_id=s.id
      AND h.entity_type='CUSTOMER' AND h.native_customer_id=c.id AND h.source_key=e.source_key
    WHERE c.id=target AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1'
      AND e.selection->>'approvalSha256'='e471ccdef09f385688d8f5709e072a033d471f0c6fdba8b7bb1b49ad55a9408a'
      AND naijue_erp.exact_historical_customer_source_matches(to_jsonb(s),to_jsonb(c))
      AND e.native_snapshot=to_jsonb(c) AND h.native_snapshot=to_jsonb(c) AND h.native_version=c.version
      AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))=to_jsonb(s);
  IF matched<>1 THEN
    RAISE EXCEPTION 'Pinned historical customer source closure is absent or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.is_exact_historical_customer_only(uuid) FROM PUBLIC;

CREATE FUNCTION naijue_erp.guard_exact_historical_customer_current_usage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='customer' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.id IN ('2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid)
        AND NOT naijue_erp.is_native_party_import_insert('CUSTOMER',to_jsonb(NEW)) THEN
        RAISE EXCEPTION 'Pinned historical customer identity only permits exact original source creation' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
    target:=OLD.id;
    IF naijue_erp.is_exact_historical_customer_only(target) THEN
      RAISE EXCEPTION 'Original historical-only customer cannot be maintained or restored' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='hall' THEN target:=NEW.default_customer_id;
  ELSIF TG_TABLE_NAME='sales_header' THEN target:=NEW.customer_id;
  ELSE RAISE EXCEPTION 'Unsupported current historical-customer guard' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME<>'customer' AND naijue_erp.is_exact_historical_customer_only(target) THEN
    RAISE EXCEPTION 'Historical-only customer cannot be used by current business' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.guard_exact_historical_customer_current_usage() FROM PUBLIC;
CREATE TRIGGER customer_historical_only_insert BEFORE INSERT ON naijue_erp.customer
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_exact_historical_customer_current_usage();
CREATE TRIGGER customer_historical_only_immutable BEFORE UPDATE OR DELETE ON naijue_erp.customer
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_exact_historical_customer_current_usage();
CREATE TRIGGER hall_historical_only_customer BEFORE INSERT OR UPDATE OF default_customer_id ON naijue_erp.hall
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_exact_historical_customer_current_usage();
CREATE TRIGGER sales_historical_only_customer BEFORE INSERT OR UPDATE ON naijue_erp.sales_header
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_exact_historical_customer_current_usage();

-- The immutable JSON is a data/transaction proof, not its own execution grant.
-- The EXACT26 issuer must separately verify C's outside files against these hashes.
CREATE FUNCTION naijue_erp.assert_native_bootstrap_accounts(selected_batch uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; e record; proof jsonb; item jsonb; snapshot jsonb;
  common_binding jsonb; common_authority jsonb; binding jsonb; authority jsonb; field record;
  actual jsonb; fresh boolean; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
  accounts uuid[]:=ARRAY[]::uuid[]; staff_ids uuid[]:=ARRAY[]::uuid[]; source_accounts text[]:=ARRAY[]::text[];
  direct_count integer:=0; plan_count integer:=0; seen integer:=0; xid_value bigint:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
  IF b.status<>'STAGED' OR b.mapping_version<>'V2_HISTORY_NULLABLE_1'
    OR b.checkpoint->'sequence'<>'0'::jsonb OR b.checkpoint->'cursor'<>'0'::jsonb
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id<>selected_batch)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=selected_batch AND xmin::text::bigint=xid_value) THEN
    RAISE EXCEPTION 'Bootstrap must belong to the first fresh original STAGE transaction' USING ERRCODE='23514';
  END IF;
  FOR e IN SELECT i.*,s.field_provenance,s.row_sha256,to_jsonb(s) AS actual_source
    FROM naijue_erp.native_party_import_evidence i
    JOIN naijue_erp.import_source_row s ON s.batch_id=i.batch_id AND s.id=i.source_row_id
    WHERE i.batch_id=selected_batch AND (s.field_provenance->'fields') ? 'bootstrap_accounts'
    ORDER BY i.native_id FOR SHARE OF i,s LOOP
    proof:=e.field_provenance->'fields'->'bootstrap_accounts';
    IF e.entity_type<>'STAFF' OR e.creation_xid IS DISTINCT FROM pg_current_xact_id()
      OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot)) IS DISTINCT FROM e.actual_source
      OR (jsonb_typeof(proof)='object' AND proof ?& ARRAY['version','profile','binding','authority','expected_counts','staff','accounts']
        AND proof-ARRAY['version','profile','binding','authority','expected_counts','staff','accounts']='{}'::jsonb
        AND proof->>'version'='NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1' AND proof->>'profile'='EXACT26'
        AND proof->'expected_counts'='{"accounts":49,"direct_original_employee_links":45,"approved_current_person_links":4}'::jsonb
        AND proof->'staff'=jsonb_build_object('source_row_id',e.source_row_id,'source_key',e.source_key,
          'source_row_sha256',e.row_sha256,'native_staff_id',e.native_id)
        AND jsonb_typeof(proof->'accounts')='array' AND jsonb_array_length(proof->'accounts')=1) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Bootstrap requires complete immutable original STAFF account proof' USING ERRCODE='23514';
    END IF;
    binding:=proof->'binding'; authority:=proof->'authority';
    IF (jsonb_typeof(binding)='object'
      AND binding ?& ARRAY['batch_id','fixed_source_namespace','selection_sha256','authorized_payload_sha256','stage_command_sha256','operation_id','actor_account_id']
      AND binding-ARRAY['batch_id','fixed_source_namespace','selection_sha256','authorized_payload_sha256','stage_command_sha256','operation_id','actor_account_id']='{}'::jsonb
      AND binding->>'batch_id'=selected_batch::text AND binding->>'fixed_source_namespace'=b.source_name
      AND binding->>'selection_sha256'=b.source_hash AND binding->>'authorized_payload_sha256' ~ '^[a-f0-9]{64}$'
      AND binding->>'stage_command_sha256' ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof(binding->'operation_id')='string' AND jsonb_typeof(binding->'actor_account_id')='string'
      AND jsonb_typeof(authority)='object'
      AND authority ?& ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256',
        'source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256']
      AND authority-ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256',
        'source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256']='{}'::jsonb
      AND jsonb_typeof(authority->'old_source_batch_id')='string' AND length(btrim(authority->>'old_source_batch_id'))>0) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Bootstrap complete outside-authority binding required' USING ERRCODE='23514';
    END IF;
    FOR field IN SELECT * FROM jsonb_each(authority-'old_source_batch_id') LOOP
      IF jsonb_typeof(field.value) IS DISTINCT FROM 'string' OR field.value#>>'{}' !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Bootstrap outside-source digest is missing or malformed' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF common_binding IS NULL THEN common_binding:=binding; common_authority:=authority;
    ELSIF binding IS DISTINCT FROM common_binding OR authority IS DISTINCT FROM common_authority THEN
      RAISE EXCEPTION 'All bootstrap accounts must share one independently reviewed original execution' USING ERRCODE='23514'; END IF;
    item:=proof->'accounts'->0; snapshot:=item->'native_snapshot';
    IF (jsonb_typeof(item)='object'
      AND item ?& ARRAY['source_account_id','source_account_version','source_employee_native_id','source_employee_code','identity_link_kind','current_person_key','source_plan_row','native_snapshot']
      AND item-ARRAY['source_account_id','source_account_version','source_employee_native_id','source_employee_code','identity_link_kind','current_person_key','source_plan_row','native_snapshot']='{}'::jsonb
      AND jsonb_typeof(item->'source_account_id')='string' AND length(btrim(item->>'source_account_id'))>0
      AND item->>'source_account_version' ~ '^[1-9][0-9]*$'
      AND jsonb_typeof(snapshot)='object' AND snapshot ?& ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']
      AND snapshot-ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']='{}'::jsonb
      AND snapshot->>'staff_id'=e.native_id::text AND snapshot->'auth_version'='1'::jsonb AND snapshot->'version'='1'::jsonb
      AND jsonb_typeof(snapshot->'login_enabled')='boolean') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Bootstrap proof must contain exactly the safe seven-field account snapshot' USING ERRCODE='23514'; END IF;
    IF item->>'identity_link_kind'='DIRECT_ORIGINAL_EMPLOYEE_V1' THEN
      IF (jsonb_typeof(item->'source_employee_native_id')='string' AND length(btrim(item->>'source_employee_native_id'))>0
        AND jsonb_typeof(item->'source_employee_code')='string' AND length(btrim(item->>'source_employee_code'))>0
        AND item->'current_person_key'='null'::jsonb AND item->'source_plan_row'='null'::jsonb) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Direct original account relationship is incomplete' USING ERRCODE='23514'; END IF;
      direct_count:=direct_count+1;
    ELSIF item->>'identity_link_kind'='APPROVED_CURRENT_PERSON_PLAN_V1' THEN
      IF (item->'source_employee_native_id'='null'::jsonb AND item->'source_employee_code'='null'::jsonb
        AND jsonb_typeof(item->'current_person_key')='string' AND length(btrim(item->>'current_person_key'))>0
        AND item->>'source_plan_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Reviewed current-person relationship must preserve missing original employee facts' USING ERRCODE='23514'; END IF;
      plan_count:=plan_count+1;
    ELSE RAISE EXCEPTION 'Unsupported bootstrap identity relationship' USING ERRCODE='23514'; END IF;
    SELECT jsonb_build_object('id',u.id,'staff_id',u.staff_id,'login_enabled',u.login_enabled,'auth_version',u.auth_version,
      'version',u.version,'created_at',u.created_at,'updated_at',u.updated_at),u.xmin::text::bigint=xid_value INTO STRICT actual,fresh
      FROM naijue_erp.user_account u WHERE u.id=(snapshot->>'id')::uuid FOR SHARE;
    IF NOT fresh OR NOT naijue_erp.maintenance_complete_row_matches(snapshot,actual)
      OR NOT naijue_erp.maintenance_evidence_matches(snapshot->'created_at',to_jsonb(b.created_at))
      OR NOT naijue_erp.maintenance_evidence_matches(snapshot->'updated_at',to_jsonb(b.created_at))
      OR (snapshot->>'id')::uuid=ANY(accounts) OR e.native_id=ANY(staff_ids) OR item->>'source_account_id'=ANY(source_accounts)
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff st WHERE st.id=e.native_id AND st.xmin::text::bigint=xid_value AND to_jsonb(st)=e.native_snapshot) THEN
      RAISE EXCEPTION 'Bootstrap cannot adopt, duplicate, or alter actual source-created staff/accounts' USING ERRCODE='23514'; END IF;
    accounts:=array_append(accounts,(snapshot->>'id')::uuid); staff_ids:=array_append(staff_ids,e.native_id);
    source_accounts:=array_append(source_accounts,item->>'source_account_id'); seen:=seen+1;
  END LOOP;
  IF seen<>49 OR direct_count<>45 OR plan_count<>4 OR (SELECT count(*) FROM naijue_erp.user_account)<>49
    OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE NOT id=ANY(accounts))
    OR EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=ANY(accounts))
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE xmin::text::bigint=xid_value) THEN
    RAISE EXCEPTION 'First bootstrap requires complete49 account closure and no session/stock effect' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(common_binding->>'operation_id')::uuid;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
  IF r.actor_account_id::text IS DISTINCT FROM common_binding->>'actor_account_id'
    OR r.request_hash IS DISTINCT FROM common_binding->>'stage_command_sha256'
    OR r.action<>'IMPORT_STAGE' OR r.target_type<>'IMPORT' OR r.target_id<>selected_batch OR r.status<>'COMMITTED'
    OR r.created_at IS DISTINCT FROM b.created_at OR r.completed_at IS DISTINCT FROM b.created_at
    OR r.result_data IS DISTINCT FROM jsonb_build_object('operationId',r.id,'batchId',selected_batch,'sequence',0,'cursor',0,'status','STAGED','ledgerEntryIds','[]'::jsonb)
    OR a.object_type<>'IMPORT' OR a.object_id<>selected_batch OR a.action<>'IMPORT_STAGE' OR a.actor_account_id<>r.actor_account_id
    OR a.old_version IS NOT NULL OR a.new_version<>1 OR a.before_values IS NOT NULL
    OR a.after_values IS DISTINCT FROM b.checkpoint OR a.occurred_at IS DISTINCT FROM b.created_at
    OR (b.checkpoint ?& ARRAY['sequence','cursor','counts','expected'] AND b.checkpoint-ARRAY['sequence','cursor','counts','expected']='{}'::jsonb
      AND b.checkpoint->'counts'='{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb) IS DISTINCT FROM TRUE
    OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE xmin::text::bigint=xid_value)<>1
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=xid_value)
    OR (SELECT count(*) FROM naijue_erp.audit_change WHERE xmin::text::bigint=xid_value)<>1
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE operation_id=r.id AND xmin::text::bigint=xid_value)
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff st ON st.id=u.staff_id
      LEFT JOIN naijue_erp.hall h ON h.id=st.hall_id
      WHERE u.id=r.actor_account_id AND u.id=ANY(accounts) AND u.login_enabled AND st.employment_status='在职'
        AND st.role='ADMIN' AND (st.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'Bootstrap must commit with its one exact original STAGE audit/receipt and actual reviewed ADMIN actor' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_native_party_import_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; s naijue_erp.import_source_row%ROWTYPE; actual jsonb; table_name text; expected_record jsonb; actual_record naijue_erp.import_record%ROWTYPE;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED')
    OR NEW.creation_xid IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'native party creation must commit inside its original open import transaction' USING ERRCODE='23514'; END IF;
  table_name:=CASE NEW.entity_type WHEN 'HALL' THEN 'hall' WHEN 'CUSTOMER' THEN 'customer' WHEN 'SUPPLIER' THEN 'supplier' WHEN 'WAREHOUSE' THEN 'warehouse' ELSE 'staff' END;
  EXECUTE format('SELECT to_jsonb(n) FROM naijue_erp.%I n WHERE id=$1 FOR SHARE',table_name) INTO STRICT actual USING NEW.native_id;
  IF actual IS DISTINCT FROM NEW.native_snapshot THEN
    RAISE EXCEPTION 'final native creation differs from exact import intent' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT s FROM naijue_erp.import_source_row WHERE batch_id=NEW.batch_id AND id=NEW.source_row_id FOR SHARE;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row other_source JOIN naijue_erp.import_batch prior ON prior.id=other_source.batch_id
    WHERE prior.source_name=b.source_name AND other_source.entity_type=NEW.entity_type AND other_source.source_key=NEW.source_key
      AND other_source.id<>NEW.source_row_id) THEN
    RAISE EXCEPTION 'original source already belongs to another immutable binding; resume original batch' USING ERRCODE='23505'; END IF;
  IF to_jsonb(s) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,NEW.source_snapshot)) THEN
    RAISE EXCEPTION 'immutable original source differs from exact import intent' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type NOT IN ('SUPPLIER','WAREHOUSE') AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference r
    WHERE r.batch_id=NEW.batch_id AND r.source_row_id=NEW.source_row_id AND r.entity_type=NEW.entity_type AND r.source_key=NEW.source_key
    AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)=NEW.native_id AND r.native_snapshot=NEW.native_snapshot AND r.native_version=1) THEN
    RAISE EXCEPTION 'native organization creation requires the shared exact 0012 reference proof' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='WAREHOUSE' THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.batch_id AND r.entity_type='HALL'
      AND r.source_key=s.raw_fields->>'所属厅来源编号' AND r.native_hall_id::text=NEW.native_snapshot->>'hall_id') THEN
      RAISE EXCEPTION 'warehouse lacks exact same-batch original hall identity' USING ERRCODE='23514'; END IF;
    expected_record:=jsonb_build_object('id',NEW.warehouse_record->>'id','import_batch_id',NEW.batch_id::text,'source_entity_type','WAREHOUSE',
      'source_key',NEW.source_key,'source_record_hash',s.row_sha256,'source_file_ref',s.file_ref,'target_type','WAREHOUSE','target_id',NEW.native_id::text,
      'status','IMPORTED','decision_reason',NEW.warehouse_record->>'decisionReason','reviewed_at',NEW.warehouse_record->>'reviewedAt');
    SELECT * INTO STRICT actual_record FROM naijue_erp.import_record WHERE id=(NEW.warehouse_record->>'id')::uuid FOR SHARE;
    IF to_jsonb(actual_record) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_record,expected_record)) THEN
      RAISE EXCEPTION 'warehouse import_record differs from reviewed exact source/native metadata' USING ERRCODE='23514'; END IF;
  END IF;
  -- Ordinary source import still cannot manufacture runtime maintenance receipts.
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE target_type=NEW.entity_type AND target_id=NEW.native_id) THEN
    RAISE EXCEPTION 'native source import cannot manufacture live commands' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='STAFF' AND (EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=NEW.native_id)
      OR (s.field_provenance->'fields') ? 'bootstrap_accounts') THEN
    IF NOT ((s.field_provenance->'fields') ? 'bootstrap_accounts') THEN
      RAISE EXCEPTION 'Ordinary STAFF source import cannot create login accounts' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_native_bootstrap_accounts(NEW.batch_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE FUNCTION naijue_erp.assert_native_product_season_source(source naijue_erp.import_source_row) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE p naijue_erp.product%ROWTYPE; evidence jsonb; selection jsonb; ids uuid[]; ref jsonb; actual_season jsonb; position integer:=0;
BEGIN
  IF source.entity_type<>'PRODUCT' THEN
    RAISE EXCEPTION 'Season source closure requires an original PRODUCT row' USING ERRCODE='23514'; END IF;
  evidence:=source.field_provenance->'fields'->'native_product_import'; selection:=evidence->'season_selection';
  SELECT * INTO STRICT p FROM naijue_erp.product WHERE id=(source.field_provenance->>'native_product_id')::uuid FOR SHARE;
  IF (evidence->>'validator_version'='NATIVE_PRODUCT_IMPORT_V2_EXACT26' AND evidence->>'schema_profile'='EXACT26'
      AND evidence->'migration_defaults'=jsonb_build_object('version','NATIVE_PRODUCT_APPROVED_MIGRATION_DEFAULTS_26_V1',
        'deleted_at',NULL,'default_barcode_scheme_id',NULL)) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Exact26 product evidence version and approved technical NULL defaults required' USING ERRCODE='23514'; END IF;
  IF p.version<>1 OR p.deleted_at IS NOT NULL OR p.default_barcode_scheme_id IS NOT NULL
    OR NOT naijue_erp.maintenance_complete_row_matches(evidence->'native_product',to_jsonb(p))
    OR (jsonb_typeof(selection)='object' AND selection ?& ARRAY['version','mapping_sha256','source_key','source_season','state','season_ids','references']
      AND selection-ARRAY['version','mapping_sha256','source_key','source_season','state','season_ids','references']='{}'::jsonb
      AND selection->>'version'='NATIVE_PRODUCT_SEASON_SELECTION_V1'
      AND selection->>'mapping_sha256'='c05e8f46bd20d050877ae431103b52d199c953919b7e8186f822f11081f9f779'
      AND selection->>'source_key'=source.source_key AND source.raw_fields ? '季节'
      AND selection->'source_season'=source.raw_fields->'季节'
      AND source.normalized_fields->'季节'=source.raw_fields->'季节'
      AND selection->'season_ids'=coalesce(to_jsonb(p.season_ids),'null'::jsonb)
      AND jsonb_typeof(selection->'references')='array') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Complete native product season source and reviewed mapping proof required' USING ERRCODE='23514'; END IF;
  ids:=p.season_ids;
  IF selection->>'state'='UNKNOWN' THEN
    IF (ids IS NULL AND selection->'references'='[]'::jsonb AND p.season_id IS NULL AND NOT evidence ? 'legacy_scalar_creation'
      AND (selection->'source_season'='null'::jsonb OR
        (jsonb_typeof(selection->'source_season')='string' AND btrim(selection->>'source_season')=''))) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Unknown original season must retain actual blank and NULL selection' USING ERRCODE='23514'; END IF;
  ELSIF selection->>'state'='KNOWN' THEN
    IF ids IS NULL OR cardinality(ids)<1 OR NOT naijue_erp.valid_product_season_ids(ids)
      OR jsonb_array_length(selection->'references')<>cardinality(ids)
      OR (cardinality(ids)>1 AND p.season_id IS NOT NULL)
      OR (cardinality(ids)=1 AND p.season_id IS DISTINCT FROM ids[1]) THEN
      RAISE EXCEPTION 'Known season requires canonical exact member references and preserved scalar meaning' USING ERRCODE='23514'; END IF;
    IF cardinality(ids)>1 THEN
      IF (evidence->'legacy_scalar_creation'=jsonb_build_object(
        'state','LEGACY_SINGLE_SLOT_NOT_APPLICABLE_TO_CONFIRMED_MULTI_SELECTION','value',NULL,
        'appliesOnlyTo','FRESH_NATIVE_PRODUCT_IN_NEW_DATABASE','originalSeason',selection->'source_season')) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Confirmed multiple seasons require explicit fresh-product legacy-slot nonapplicability' USING ERRCODE='23514'; END IF;
    ELSIF evidence ? 'legacy_scalar_creation' THEN
      RAISE EXCEPTION 'Single season cannot claim multiple-selection legacy-slot exemption' USING ERRCODE='23514';
    END IF;
    FOR ref IN SELECT value FROM jsonb_array_elements(selection->'references') LOOP
      position:=position+1;
      SELECT to_jsonb(n) INTO STRICT actual_season FROM naijue_erp.season n WHERE id=ids[position] FOR SHARE;
      IF (jsonb_typeof(ref)='object' AND ref ?& ARRAY['sourceKey','nativeId','nativeSnapshot']
        AND ref-ARRAY['sourceKey','nativeId','nativeSnapshot']='{}'::jsonb AND ref->>'nativeId'=ids[position]::text
        AND ref->'nativeSnapshot'=actual_season
        AND EXISTS(SELECT 1 FROM naijue_erp.import_native_catalogue_binding c
          WHERE c.batch_id=source.batch_id AND c.entity_type='SEASON' AND c.source_key=ref->>'sourceKey'
            AND c.season_id=ids[position] AND c.native_snapshot=actual_season)) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Each selected season must match its whole same-batch native dictionary proof' USING ERRCODE='23514'; END IF;
    END LOOP;
  ELSE
    -- This exact reviewed map has48 unknown,2598 single,310 multiple and zero
    -- explicit-empty sources. Runtime [] is valid; inventing it during import is not.
    RAISE EXCEPTION 'Original reviewed season mapping contains no other selection state' USING ERRCODE='23514';
  END IF;
END $$;

CREATE FUNCTION naijue_erp.guard_successor_source26() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF (NEW.field_provenance->'fields') ? 'bootstrap_accounts' AND NEW.entity_type<>'STAFF' THEN
    RAISE EXCEPTION 'Account bootstrap proof only belongs to original STAFF source' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type='PRODUCT' THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.product p
      WHERE p.id=(NEW.field_provenance->>'native_product_id')::uuid AND p.xmin::text=pg_current_xact_id()::text) THEN
      RAISE EXCEPTION 'New product source requires native creation in this same transaction; existing targets cannot be adopted' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_native_product_season_source(NEW);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER successor_source26 BEFORE INSERT ON naijue_erp.import_source_row
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_successor_source26();

CREATE FUNCTION naijue_erp.guard_successor_publication26() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE original_source naijue_erp.import_source_row%ROWTYPE; target uuid; matched bigint;
BEGIN
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  -- Original19 conservation, typed closure, approval/audit/accounting and no-STAGED
  -- visibility guards remain enabled. This adds actual successor-field readback.
  FOR original_source IN SELECT * FROM naijue_erp.import_source_row WHERE batch_id=NEW.id AND entity_type='PRODUCT' ORDER BY id FOR SHARE LOOP
    PERFORM naijue_erp.assert_native_product_season_source(original_source);
  END LOOP;
  -- The two original identities form one reviewed supplement; neither can be
  -- omitted, replaced, promoted to current business or attached to another batch.
  FOREACH target IN ARRAY ARRAY['2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid] LOOP
    PERFORM naijue_erp.is_exact_historical_customer_only(target);
    SELECT count(*) INTO matched FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
      WHERE e.batch_id=NEW.id AND e.entity_type='CUSTOMER' AND e.native_id=target
        AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
    IF matched<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h
      JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
      JOIN naijue_erp.import_source_row cs ON cs.batch_id=h.batch_id AND cs.entity_type='CUSTOMER'
        AND cs.field_provenance->>'native_customer_id'=target::text
      WHERE h.batch_id=NEW.id AND h.customer_id=target AND h.number=cs.raw_fields->>'sourceDocumentNumber')
      OR EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id=target)
      OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id=target) THEN
      RAISE EXCEPTION 'Both exact historical customers must close with their original history and no current usage' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER successor_publication26 BEFORE INSERT OR UPDATE ON naijue_erp.import_batch
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_successor_publication26();

-- Actual engine parse/negative/transaction proofs and the reviewed EXACT26 issuer
-- are separate prerequisites. No executable profile is issued by this source file.

-- Exact26 typed native projections include all already-approved current fields.
-- Original18 bytes and all other relation projections stay unchanged.
CREATE OR REPLACE FUNCTION naijue_erp.history_closure_projection_columns(relation_name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 CASE relation_name
 WHEN 'import_source_row' THEN RETURN ARRAY['id','batch_id','entity_type','source_key','file_ref','sheet','row_no','source_file_sha256','row_sha256','raw_fields','normalized_fields','field_provenance'];
 WHEN 'history_sales_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','business_type','hall_id','customer_id','warehouse_id','salesperson_id','gross_amount','order_discount','net_due'];
 WHEN 'history_transfer_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','from_warehouse_id','to_warehouse_id','created_role_source'];
 WHEN 'history_sales_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot','reference_price','deal_price','line_amount','allocated_discount','is_gift','pricing_method_source','discount_tenths','ordinary_zero_confirmed'];
 WHEN 'history_transfer_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot'];
 WHEN 'history_sales_settlement' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','payment_account_id','direction','amount','account_name_snapshot','method_name_snapshot','payment_method_id_snapshot'];
 WHEN 'import_sku_alias' THEN RETURN ARRAY['batch_id','old_source_sku_id','canonical_sku_id','source_row_id','canonical_source_key','mapping_basis'];
 WHEN 'import_stock_contributor' THEN RETURN ARRAY['batch_id','source_row_id','warehouse_id','canonical_sku_id','old_source_sku_id','canonical_stock_source_key','source_unit','signed_quantity','baseline_ledger_id'];
 WHEN 'import_header_native_reference' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_hall_id','native_customer_id','native_staff_id','native_version','native_snapshot','validator_version'];
 WHEN 'native_party_import_evidence' THEN RETURN ARRAY['batch_id','source_row_id','entity_type','source_key','native_id','native_hall_id','native_customer_id','native_supplier_id','native_staff_id','native_warehouse_id','warehouse_record','native_snapshot','source_snapshot','selection','authorization','row_fingerprint','validator_version'];
 WHEN 'import_native_catalogue_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','category_id','color_id','fit_id','size_id','size_group_id','season_id','member_group_id','member_size_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'import_native_payment_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_payment_method_id','native_payment_account_id','native_hall_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'product' THEN RETURN ARRAY['id','product_code','name','category_id','supplier_id','season_id','size_group_id','retail_price','enabled','version','year','system_item_code','thickness','collar_pants_type','purchase_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price','season_ids','deleted_at','default_barcode_scheme_id'];
 WHEN 'sku' THEN RETURN ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version','created_operation_id'];
 WHEN 'hall' THEN RETURN ARRAY['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'];
 WHEN 'warehouse' THEN RETURN ARRAY['id','hall_id','name','enabled','version','created_operation_id'];
 WHEN 'customer' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'supplier' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'staff' THEN RETURN ARRAY['id','name','hall_id','role','contact','employment_status','version'];
 WHEN 'product_category' THEN RETURN ARRAY['id','parent_id','name','display_order','version','deleted_at'];
 WHEN 'color' THEN RETURN ARRAY['id','code','name','enabled','version','deleted_at'];
 WHEN 'fit' THEN RETURN ARRAY['id','code','name','enabled','version','deleted_at'];
 WHEN 'size' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group_member' THEN RETURN ARRAY['size_group_id','size_id','display_order'];
 WHEN 'season' THEN RETURN ARRAY['id','code','name','display_order'];
 WHEN 'sku_barcode' THEN RETURN ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled'];
 WHEN 'barcode_scheme' THEN RETURN ARRAY['id','name','barcode_type','rule_description','code_length','rule_version','status'];
 WHEN 'payment_method_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_hall' THEN RETURN ARRAY['payment_account_id','hall_id'];
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.history_closure_projection(relation_name text,original jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE cols text[];allowed text[];result jsonb;
BEGIN
 cols:=naijue_erp.history_closure_projection_columns(relation_name);allowed:=cols;
 IF relation_name='native_party_import_evidence' THEN allowed:=cols||ARRAY['creation_xid','imported_at']; END IF;
 IF relation_name='payment_method_identity' THEN allowed:=cols||ARRAY['name','enabled','version']; END IF;
 IF relation_name='payment_account_identity' THEN allowed:=cols||ARRAY['name','payment_method_id','enabled','version']; END IF;
 IF (jsonb_typeof(original)='object' AND original ?& cols AND original-allowed='{}'::jsonb) IS DISTINCT FROM TRUE THEN
 RAISE EXCEPTION 'closure full explicit column shape required' USING ERRCODE='23514'; END IF;
 CASE relation_name
 WHEN 'import_source_row' THEN result:=jsonb_build_object('id',original->'id','batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','file_ref',original->'file_ref','sheet',original->'sheet','row_no',to_jsonb((original->>'row_no')::bigint::text),'source_file_sha256',original->'source_file_sha256','row_sha256',original->'row_sha256','raw_fields',original->'raw_fields','normalized_fields',original->'normalized_fields','field_provenance',original->'field_provenance');
 WHEN 'history_sales_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'business_type',original->'business_type','hall_id',original->'hall_id','customer_id',original->'customer_id','warehouse_id',original->'warehouse_id','salesperson_id',original->'salesperson_id','gross_amount',to_jsonb((original->>'gross_amount')::numeric(18,2)::text),'order_discount',to_jsonb((original->>'order_discount')::numeric(18,2)::text),'net_due',to_jsonb((original->>'net_due')::numeric(18,2)::text));
 WHEN 'history_transfer_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'from_warehouse_id',original->'from_warehouse_id','to_warehouse_id',original->'to_warehouse_id','created_role_source',original->'created_role_source');
 WHEN 'history_sales_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot','reference_price',to_jsonb((original->>'reference_price')::numeric(18,2)::text),'deal_price',to_jsonb((original->>'deal_price')::numeric(18,2)::text),'line_amount',to_jsonb((original->>'line_amount')::numeric(18,2)::text),'allocated_discount',to_jsonb((original->>'allocated_discount')::numeric(18,2)::text),'is_gift',original->'is_gift','pricing_method_source',original->'pricing_method_source','discount_tenths',original->'discount_tenths','ordinary_zero_confirmed',original->'ordinary_zero_confirmed');
 WHEN 'history_transfer_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot');
 WHEN 'history_sales_settlement' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','payment_account_id',original->'payment_account_id','direction',original->'direction','amount',to_jsonb((original->>'amount')::numeric(18,2)::text),'account_name_snapshot',original->'account_name_snapshot','method_name_snapshot',original->'method_name_snapshot','payment_method_id_snapshot',original->'payment_method_id_snapshot');
 WHEN 'import_sku_alias' THEN result:=jsonb_build_object('batch_id',original->'batch_id','old_source_sku_id',original->'old_source_sku_id','canonical_sku_id',original->'canonical_sku_id','source_row_id',original->'source_row_id','canonical_source_key',original->'canonical_source_key','mapping_basis',original->'mapping_basis');
 WHEN 'import_stock_contributor' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','warehouse_id',original->'warehouse_id','canonical_sku_id',original->'canonical_sku_id','old_source_sku_id',original->'old_source_sku_id','canonical_stock_source_key',original->'canonical_stock_source_key','source_unit',original->'source_unit','signed_quantity',to_jsonb((original->>'signed_quantity')::bigint::text),'baseline_ledger_id',original->'baseline_ledger_id');
 WHEN 'import_header_native_reference' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_staff_id',original->'native_staff_id','native_version',original->'native_version','native_snapshot',original->'native_snapshot','validator_version',original->'validator_version');
 WHEN 'native_party_import_evidence' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','entity_type',original->'entity_type','source_key',original->'source_key','native_id',original->'native_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_supplier_id',original->'native_supplier_id','native_staff_id',original->'native_staff_id','native_warehouse_id',original->'native_warehouse_id','warehouse_record',original->'warehouse_record','native_snapshot',original->'native_snapshot','source_snapshot',original->'source_snapshot','selection',original->'selection','authorization',original->'authorization','row_fingerprint',original->'row_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_catalogue_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','category_id',original->'category_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','size_group_id',original->'size_group_id','season_id',original->'season_id','member_group_id',original->'member_group_id','member_size_id',original->'member_size_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_payment_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_payment_method_id',original->'native_payment_method_id','native_payment_account_id',original->'native_payment_account_id','native_hall_id',original->'native_hall_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'product' THEN result:=jsonb_build_object('id',original->'id','product_code',original->'product_code','name',original->'name','category_id',original->'category_id','supplier_id',original->'supplier_id','season_id',original->'season_id','size_group_id',original->'size_group_id','retail_price',to_jsonb((original->>'retail_price')::numeric(18,2)::text),'enabled',original->'enabled','version',original->'version','year',original->'year','system_item_code',original->'system_item_code','thickness',original->'thickness','collar_pants_type',original->'collar_pants_type','purchase_price',to_jsonb((original->>'purchase_price')::numeric(18,2)::text),'wholesale5_price',to_jsonb((original->>'wholesale5_price')::numeric(18,2)::text),'wholesale6_price',to_jsonb((original->>'wholesale6_price')::numeric(18,2)::text),'wholesale7_price',to_jsonb((original->>'wholesale7_price')::numeric(18,2)::text),'wholesale8_price',to_jsonb((original->>'wholesale8_price')::numeric(18,2)::text),'wholesale9_price',to_jsonb((original->>'wholesale9_price')::numeric(18,2)::text),'wholesale10_price',to_jsonb((original->>'wholesale10_price')::numeric(18,2)::text),'minimum_price',to_jsonb((original->>'minimum_price')::numeric(18,2)::text),'season_ids',original->'season_ids','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'default_barcode_scheme_id',original->'default_barcode_scheme_id');
 WHEN 'sku' THEN result:=jsonb_build_object('id',original->'id','product_id',original->'product_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','sku_code',original->'sku_code','enabled',original->'enabled','version',original->'version','created_operation_id',original->'created_operation_id');
 WHEN 'hall' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','default_customer_id',original->'default_customer_id','default_sales_warehouse_id',original->'default_sales_warehouse_id','enabled',original->'enabled','version',original->'version');
 WHEN 'warehouse' THEN result:=jsonb_build_object('id',original->'id','hall_id',original->'hall_id','name',original->'name','enabled',original->'enabled','version',original->'version','created_operation_id',original->'created_operation_id');
 WHEN 'customer' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'supplier' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'staff' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','hall_id',original->'hall_id','role',original->'role','contact',original->'contact','employment_status',original->'employment_status','version',original->'version');
 WHEN 'product_category' THEN result:=jsonb_build_object('id',original->'id','parent_id',original->'parent_id','name',original->'name','display_order',original->'display_order','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'color' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'fit' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','deleted_at',to_jsonb(to_char((original->>'deleted_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'size' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group_member' THEN result:=jsonb_build_object('size_group_id',original->'size_group_id','size_id',original->'size_id','display_order',original->'display_order');
 WHEN 'season' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','display_order',original->'display_order');
 WHEN 'sku_barcode' THEN result:=jsonb_build_object('id',original->'id','barcode',original->'barcode','sku_id',original->'sku_id','barcode_kind',original->'barcode_kind','scheme_id',original->'scheme_id','enabled',original->'enabled');
 WHEN 'barcode_scheme' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','barcode_type',original->'barcode_type','rule_description',original->'rule_description','code_length',original->'code_length','rule_version',original->'rule_version','status',original->'status');
 WHEN 'payment_method_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_hall' THEN result:=jsonb_build_object('payment_account_id',original->'payment_account_id','hall_id',original->'hall_id');
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
 PERFORM naijue_erp.history_closure_encode(result); RETURN result;
END;
$$;
INSERT INTO naijue_erp.schema_migration(version,description)
  VALUES(26,'Exact reviewed source supplement, bootstrap closure, season readback and whole-current-snapshot successor guards');
COMMIT;
