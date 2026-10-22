-- VERSION 0013: isolated original organization/party creation. SQL SOURCE ONLY until engine rehearsal.
-- No publication, native numbering changes, auth account, login, password, API key, actor or fake live receipt.
-- Existing 0006 runtime paths are retained verbatim, with ONLY same-xact exact INSERT intent branches.
BEGIN;
CREATE TABLE naijue_erp.native_party_import_evidence (
  batch_id uuid NOT NULL REFERENCES naijue_erp.import_batch(id),
  source_row_id uuid PRIMARY KEY, entity_type text NOT NULL CHECK (entity_type IN ('HALL','CUSTOMER','SUPPLIER','STAFF','WAREHOUSE')),
  source_key text NOT NULL CHECK (length(btrim(source_key))>0), native_id uuid NOT NULL,
  native_hall_id uuid GENERATED ALWAYS AS (CASE WHEN entity_type='HALL' THEN native_id END) STORED
    REFERENCES naijue_erp.hall(id) DEFERRABLE INITIALLY DEFERRED,
  native_customer_id uuid GENERATED ALWAYS AS (CASE WHEN entity_type='CUSTOMER' THEN native_id END) STORED
    REFERENCES naijue_erp.customer(id) DEFERRABLE INITIALLY DEFERRED,
  native_supplier_id uuid GENERATED ALWAYS AS (CASE WHEN entity_type='SUPPLIER' THEN native_id END) STORED
    REFERENCES naijue_erp.supplier(id) DEFERRABLE INITIALLY DEFERRED,
  native_staff_id uuid GENERATED ALWAYS AS (CASE WHEN entity_type='STAFF' THEN native_id END) STORED
    REFERENCES naijue_erp.staff(id) DEFERRABLE INITIALLY DEFERRED,
  native_warehouse_id uuid GENERATED ALWAYS AS (CASE WHEN entity_type='WAREHOUSE' THEN native_id END) STORED
    REFERENCES naijue_erp.warehouse(id) DEFERRABLE INITIALLY DEFERRED,
  warehouse_record jsonb CHECK (warehouse_record IS NULL OR jsonb_typeof(warehouse_record)='object'),
  native_snapshot jsonb NOT NULL CHECK (jsonb_typeof(native_snapshot)='object'),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object'),
  selection jsonb NOT NULL CHECK (jsonb_typeof(selection)='object'),
  "authorization" jsonb NOT NULL CHECK (jsonb_typeof("authorization")='object'),
  row_fingerprint text NOT NULL CHECK (row_fingerprint ~ '^[0-9a-f]{64}$'),
  validator_version text NOT NULL CHECK (validator_version='NATIVE_PARTY_IMPORT_V1'),
  creation_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  imported_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (batch_id,entity_type,source_key), UNIQUE (entity_type,native_id),
  FOREIGN KEY (batch_id,source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id) DEFERRABLE INITIALLY DEFERRED
);
REVOKE ALL ON naijue_erp.native_party_import_evidence FROM PUBLIC;
CREATE TRIGGER native_party_import_evidence_immutable BEFORE UPDATE OR DELETE ON naijue_erp.native_party_import_evidence
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER native_party_import_evidence_no_truncate BEFORE TRUNCATE ON naijue_erp.native_party_import_evidence
  EXECUTE FUNCTION naijue_erp.reject_immutable_change();

CREATE FUNCTION naijue_erp.guard_native_party_import_intent() RETURNS trigger LANGUAGE plpgsql
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
    WHEN 'WAREHOUSE' THEN ARRAY['id','hall_id','name','enabled','version']
    ELSE ARRAY['id','code','name','enabled','version','created_at','updated_at'] END;
  IF (NEW.native_snapshot ?& expected_keys AND NEW.native_snapshot-expected_keys='{}'::jsonb
    AND NEW.native_snapshot->>'id'=NEW.native_id::text AND NEW.native_snapshot->'version'='1'::jsonb
    AND jsonb_typeof(NEW.native_snapshot->'name')='string' AND length(btrim(NEW.native_snapshot->>'name'))>0) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'exact independent version-one native shape is required' USING ERRCODE='23514'; END IF;
  IF NEW.entity_type IN ('CUSTOMER','SUPPLIER') AND (jsonb_typeof(NEW.native_snapshot->'enabled')='boolean'
    AND jsonb_typeof(NEW.native_snapshot->'code')='string' AND length(btrim(NEW.native_snapshot->>'code'))>0
    AND NEW.native_snapshot->'created_at'='null'::jsonb AND NEW.native_snapshot->'updated_at'='null'::jsonb) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'original party state/code and unknown historical timestamps cannot be fabricated' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER native_party_import_intent_guard BEFORE INSERT ON naijue_erp.native_party_import_evidence
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_native_party_import_intent();

-- NOT a mode flag or general bypass: only exact immutable intent created in THIS transaction.
-- Source/native existence and equality, open batch and 0012 coverage are mandatory at COMMIT below.
CREATE FUNCTION naijue_erp.is_native_party_import_insert(kind text, snapshot jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT EXISTS (SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.entity_type=kind
    AND e.native_id::text=snapshot->>'id' AND e.native_snapshot=snapshot AND e.creation_xid=pg_current_xact_id()
    AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND snapshot->'version'='1'::jsonb);
$$;
-- A read-only predicate preserves ordinary non-owner runtime INSERT trigger execution.
-- It grants no evidence access, mutation or import creation authority.
GRANT EXECUTE ON FUNCTION naijue_erp.is_native_party_import_insert(text,jsonb) TO PUBLIC;

CREATE FUNCTION naijue_erp.validate_native_party_import_commit() RETURNS trigger LANGUAGE plpgsql
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
  -- No auth record, runtime operation/audit or inventory effect is manufactured by an import.
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE target_type=NEW.entity_type AND target_id=NEW.native_id)
    OR (NEW.entity_type='STAFF' AND EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=NEW.native_id)) THEN
    RAISE EXCEPTION 'native source import cannot manufacture live commands or login accounts' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER native_party_import_commit AFTER INSERT ON naijue_erp.native_party_import_evidence
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_native_party_import_commit();

-- Original 0006 runtime function bodies below remain unchanged after the narrow INSERT branches.
CREATE OR REPLACE FUNCTION naijue_erp.keep_party_native_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
  IF TG_OP = 'INSERT' AND naijue_erp.is_native_party_import_insert(
    CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, to_jsonb(NEW)) THEN
    -- Same code lock as live CREATE. No sequence, generated code or runtime actor is used.
    PERFORM pg_advisory_xact_lock(hashtextextended('naijue:party-code:' ||
      CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, 0));
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.validate_party_native_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
  kind text; next_values jsonb; prior_values jsonb; expected_after jsonb; expected_before jsonb; final_version integer;
BEGIN
  IF TG_OP = 'INSERT' AND naijue_erp.is_native_party_import_insert(
    CASE TG_TABLE_NAME WHEN 'customer' THEN 'CUSTOMER' WHEN 'supplier' THEN 'SUPPLIER' END, to_jsonb(NEW)) THEN
    -- The separate deferred import evidence trigger proves source/native/reference completeness.
    -- UPDATE always executes the unchanged online command checks below, even after import.
    RETURN NULL;
  END IF;
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
      OR (a.action = 'EDIT' AND (NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled))
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

INSERT INTO naijue_erp.schema_migration(version,description) VALUES(13,'Exact same-transaction original organization/party creation and immutable source evidence; SQL source only');
COMMIT;
