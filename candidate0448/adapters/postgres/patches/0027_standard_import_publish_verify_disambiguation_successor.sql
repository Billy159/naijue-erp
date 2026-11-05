-- Source46: actual-PG-reproduced scalar/column disambiguation only.
-- Qualify final publication baseline columns and rename verifier local status.
-- No predicate, result, permission, source42-45 or committed plan/data changes.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
SET LOCAL TimeZone='UTC';
DO $before$
DECLARE routine_row record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD46_EXACT_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.guard_retained_settlement_identity()'::regprocedure)<>'3bd3d7cb19a1418ffe340cd72eda7fe8ec7b43023461f763b74a2d54b5ddc345' THEN RAISE EXCEPTION 'STANDARD46_SOURCE45_LINEAGE_DIFFERS' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'b600d24b88b1a70f6a28b797da3406509a817fd847516681eda6e9711ea6d1d2' THEN RAISE EXCEPTION 'STANDARD46_BEFORE_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'b017d792379dbe8d974b3e6e0cec0dd07f288d965b8c898a11c3dfba190f3bfc' OR NOT routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD46_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.standard_import_verify(jsonb,text)'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'250d797ee52b7c5cf1d76ae9c07ba7b4903f8ea4b4f25074c17b1c0b9af70b33' THEN RAISE EXCEPTION 'STANDARD46_BEFORE_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'3ee3dbca4075deda383bfa41f19af14e9d54c866682c326ff06f9e950d686a70' OR NOT routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD46_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
END $before$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_import_command(request jsonb,private_parameter text,command_phase text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
BEGIN
 -- Every mutation and status uses this same real transaction lock barrier.
 PERFORM naijue_erp.cutoff_import_lock();
 IF jsonb_typeof(request) IS DISTINCT FROM 'object' OR request-ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload']<>'{}'
  OR NOT(request ?& ARRAY['protocol','operation_id','request_key','batch_id','plan_sha256','package_manifest_sha256','namespace','cutoff_at','payload'])
  OR request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR jsonb_typeof(request->'payload') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(request) e WHERE e.key<>'payload' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR (request->>'plan_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (request->>'package_manifest_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
  OR (request->>'namespace' ~ '^[a-z][a-z0-9_.:-]*$') IS DISTINCT FROM true OR coalesce(length(request->>'request_key'),0)=0 THEN
  RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;batch:=(request->>'batch_id')::uuid;payload:=request->'payload';
 IF operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_REQUIRED' USING ERRCODE='23514'; END IF;
 IF command_phase='INITIALIZE' THEN
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE actor:=naijue_erp.standard_import_identity(private_parameter,'IMPORTER');fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN
  SELECT * INTO STRICT prior_a FROM naijue_erp.audit_change WHERE operation_id=prior.id;
  IF prior.id<>operation OR prior.target_id<>batch OR prior.target_type<>'IMPORT' OR prior.request_hash<>fingerprint OR prior_a.after_values->'request' IS DISTINCT FROM request THEN
   RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',prior.id,'batch_id',batch,'request_sha256',prior.request_hash,'state','COMMITTED','sequence',prior.result_data->'sequence','cursor',prior.result_data->'cursor','receipt',prior.result_data);
 END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>500)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>500 OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  admin:=payload->'admin';
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  expected:=payload->'expected';
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"MASTER":0,"INVENTORY_KEY":0,"INVENTORY_EFFECT":0,"NAMESPACE":0,"IMPORT_BATCH":0}'::jsonb,'expected',expected);
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',payload->>'manifest_ref',request->>'package_manifest_sha256',(request->>'cutoff_at')::timestamptz,'STANDARD_INITIAL_EXPLICIT_KEYS_V1','CUTOFF_STOCK_BASELINE','STAGED',cp,transaction_timestamp());
  phase:='INITIALIZE';action_name:='IMPORT_INITIALIZE_CURRENT_ADMIN';old_cp:=NULL;
 ELSIF command_phase='DOCUMENTS' AND payload->>'mode'='STAGE' THEN
  IF payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}' OR payload->'expected_sequence'<>'null' OR payload->'rows'<>'[]' OR payload->'documents'<>'[]' THEN
   RAISE EXCEPTION 'STANDARD_DOCUMENT_STAGE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid FOR UPDATE;
  IF baseline.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR baseline.status<>'IMPORTED' OR baseline.source_name<>request->>'namespace'
    OR baseline.source_hash<>request->>'package_manifest_sha256' OR baseline.cutoff_at<>(request->>'cutoff_at')::timestamptz THEN RAISE EXCEPTION 'STANDARD_BASELINE_MISMATCH_NO_REBASELINE' USING ERRCODE='23514'; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->'payload'->>'document_batch_id'<>batch::text OR payload->'expected' IS DISTINCT FROM initial_request->'payload'->'expected_documents' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_PLAN_MISMATCH' USING ERRCODE='23514'; END IF;
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts','{"SALES_HEADER":0,"SALES_LINE":0,"SALES_SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0,"IMPORT_BATCH":0}'::jsonb,'expected',payload->'expected');
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at)
   VALUES(batch,request->>'namespace',baseline.source_manifest_ref,request->>'package_manifest_sha256',baseline.cutoff_at,'DOCUMENT_CONVERSION_V1','DOCUMENT_CONVERSION','STAGED',cp,transaction_timestamp());
  phase:='DOCUMENT_STAGE';action_name:='IMPORT_STAGE';old_cp:=NULL;
 ELSE
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=batch FOR UPDATE;
  IF b.status NOT IN ('STAGED','VALIDATING') OR b.source_name<>request->>'namespace' OR b.source_hash<>request->>'package_manifest_sha256'
   OR b.cutoff_at<>(request->>'cutoff_at')::timestamptz OR (payload->>'expected_sequence')::integer IS DISTINCT FROM (b.checkpoint->>'sequence')::integer THEN RAISE EXCEPTION 'STANDARD_BATCH_CAS_OR_SOURCE_CONFLICT' USING ERRCODE='23514'; END IF;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' THEN baseline:=b;
  ELSE SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(payload->>'baseline_batch_id')::uuid; END IF;
  SELECT a.after_values->'request' INTO STRICT initial_request FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  IF initial_request->>'plan_sha256'<>request->>'plan_sha256' THEN RAISE EXCEPTION 'STANDARD_EXECUTION_PLAN_CONFLICT' USING ERRCODE='23514'; END IF;
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'documents')<1 THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='PUBLISH' THEN
   IF payload-ARRAY['phase','expected_sequence','baseline_batch_id','approval_record_id']<>'{}' OR payload->>'phase' NOT IN ('BASELINE','DOCUMENTS')
    OR (payload->>'baseline_batch_id')::uuid<>baseline.id OR (payload->>'phase'='BASELINE') IS DISTINCT FROM (b.inventory_mode='CUTOFF_STOCK_BASELINE') THEN RAISE EXCEPTION 'STANDARD_PUBLISH_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'STANDARD_COMMAND_KIND_INVALID' USING ERRCODE='23514'; END IF;
  phase:=CASE command_phase WHEN 'MASTER' THEN 'MASTER' WHEN 'KEYS' THEN 'KEYS' WHEN 'DOCUMENTS' THEN 'DOCUMENTS' ELSE CASE payload->>'phase' WHEN 'BASELINE' THEN 'BASELINE_SEAL' ELSE 'DOCUMENT_PUBLISH' END END;
  action_name:=CASE command_phase WHEN 'PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END;
  IF b.inventory_mode='CUTOFF_STOCK_BASELINE' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND source_entity_type='BATCH_NAMESPACE_BINDING') THEN
   fields:=jsonb_build_object('batch_id',batch,'source_system',b.source_name,'manifest_sha256',b.source_hash,'registry_sha256',cfg->>'registry_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',cfg->>'namespace_record_id','entity_type','BATCH_NAMESPACE_BINDING','source_key',batch::text,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,
    'fields',fields,'source_hash',encode(sha256(convert_to(fields::text,'UTF8')),'hex')));
  END IF;
  IF command_phase IN ('MASTER','DOCUMENTS','KEYS') THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(payload->'rows') LOOP
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind)) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
      IF fields->parent_row.attname IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->parent_row.attname) IS DISTINCT FROM 'string'
        OR (parent_row.atttypid=20 AND (fields->>parent_row.attname ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true)
        OR (parent_row.atttypid=1700 AND (fields->>parent_row.attname ~ '^-?(0|[1-9][0-9]*)[.][0-9]{2}$') IS DISTINCT FROM true)) THEN
       RAISE EXCEPTION 'STANDARD_EXACT_NUMERIC_STRING_REQUIRED: %',parent_row.attname USING ERRCODE='23514'; END IF;
     END LOOP;
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN 'FINAL_EXPLICIT_KEYS' ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
    'source_hash',CASE phase WHEN 'DOCUMENT_PUBLISH' THEN b.source_hash ELSE encode(sha256(convert_to(fields::text,'UTF8')),'hex') END));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
   kind:=item->>'target_type';counter:=CASE WHEN item->>'entity_type'='BATCH_NAMESPACE_BINDING' THEN 'NAMESPACE' WHEN kind IN ('IMPORT_BATCH','INVENTORY_KEY','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN kind ELSE 'MASTER' END;
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::integer+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::integer+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 -- The public request, typed intents and exact result are prepared before native
 -- mutations. All final-state validators run deferred; no guard is disabled.
 result:=jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','operationId',operation,'batchId',batch,'sequence',cp->'sequence','cursor',cp->'cursor',
  'status',CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' WHEN command_phase='INITIALIZE' OR phase='DOCUMENT_STAGE' THEN 'STAGED' ELSE 'VALIDATING' END,
  'ledgerEntryIds',ledger_ids,'sourceRecordIds',source_ids,'phase',phase,'planSha256',request->>'plan_sha256','packageManifestSha256',request->>'package_manifest_sha256',
  'baselineBatchId',CASE WHEN command_phase='INITIALIZE' THEN batch ELSE baseline.id END,'documentBatchId',CASE WHEN command_phase='INITIALIZE' THEN payload->>'document_batch_id' ELSE initial_request->'payload'->>'document_batch_id' END);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END),transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind);fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
    RAISE EXCEPTION 'STANDARD_EXACT_TYPED_FIELDS_REQUIRED: %',kind USING ERRCODE='23514'; END IF;
   IF actual IS NOT NULL THEN
    IF command_phase<>'MASTER' OR item->>'identity_basis' IS DISTINCT FROM 'EXISTING_VERIFIED' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_EXISTING_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
   ELSE
    IF kind='TRANSFER_LINE' THEN
     INSERT INTO naijue_erp.transfer_line(id,transfer_id,line_no,sku_id,quantity,product_code_snapshot,product_name_snapshot,color_name_snapshot,fit_name_snapshot,size_name_snapshot,barcode_snapshot,is_current)
      SELECT t.id,t.transfer_id,t.line_no,t.sku_id,t.quantity,t.product_code_snapshot,t.product_name_snapshot,t.color_name_snapshot,t.fit_name_snapshot,t.size_name_snapshot,t.barcode_snapshot,t.is_current FROM jsonb_populate_record(NULL::naijue_erp.transfer_line,fields) t;
    ELSE EXECUTE format('INSERT INTO naijue_erp.%I SELECT (jsonb_populate_record(NULL::naijue_erp.%I,$1)).*',table_name,table_name) USING fields; END IF;
   END IF;
  END LOOP;
 ELSIF command_phase='KEYS' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'='INVENTORY_KEY' LOOP
   fields:=item->'fields';quantity:=(fields->>'quantity')::bigint;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='WAREHOUSE' AND target_id=(fields->>'warehouse_id')::uuid)
     OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type='SKU' AND target_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid)
     OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id=(fields->>'warehouse_id')::uuid AND sku_id=(fields->>'sku_id')::uuid) THEN RAISE EXCEPTION 'STANDARD_KEY_SCOPE_OR_REBASELINE_DENIED' USING ERRCODE='23514'; END IF;
   IF quantity<>0 THEN
    INSERT INTO naijue_erp.inventory_ledger(id,operation_id,event_kind,warehouse_id,sku_id,quantity_delta,source_document_version,endpoint,business_date,posted_at,source_import_batch_id)
     VALUES((item->>'ledger_entry_id')::uuid,operation,'CUTOFF_BASELINE',(fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,NULL,'IMPORT_BASELINE',left(request->>'cutoff_at',10)::date,transaction_timestamp(),batch);
    INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
     VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
   END IF;
  END LOOP;
 END IF;
 IF command_phase='DOCUMENTS' AND phase='DOCUMENTS' THEN
  anchor_baseline:=jsonb_build_object('state','CONFIRMED','baselineBatchId',baseline.id,'baselineManifestSha256',baseline.source_hash,'cutoffAt',baseline.cutoff_at,'coverageDigest',cfg->>'alignment_sha256');
  FOR doc IN SELECT value FROM jsonb_array_elements(payload->'documents') LOOP
   IF doc-ARRAY['kind','id','operation_id','request_key','source_record_id']<>'{}' OR doc->>'kind' NOT IN ('SALES','TRANSFER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_MANIFEST_INVALID' USING ERRCODE='23514'; END IF;
   kind:=doc->>'kind';doc_id:=(doc->>'id')::uuid;child_op:=(doc->>'operation_id')::uuid;snap:=naijue_erp.unified_document_snapshot(kind,doc_id);
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE id=(doc->>'source_record_id')::uuid AND import_batch_id=batch AND target_id=doc_id AND target_type=kind||'_HEADER') THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_SOURCE_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
   child_result:=jsonb_build_object('operationId',child_op,CASE kind WHEN 'SALES' THEN 'salesId' ELSE 'transferId' END,doc_id,'version',(snap->'header'->>'version')::integer,
    'status',snap->'header'->>'status','ledgerEntryIds','[]'::jsonb,'batchId',batch,'sourceRecordId',doc->>'source_record_id','exposureDigest',encode(sha256(convert_to(snap::text,'UTF8')),'hex'),'baseline',anchor_baseline);
   INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
    VALUES(child_op,actor,doc->>'request_key',encode(sha256(convert_to(doc::text||snap::text,'UTF8')),'hex'),'MIGRATE_DOCUMENT',kind,doc_id,'COMMITTED',child_result,transaction_timestamp());
   INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
    VALUES(child_op,child_op,actor,kind,doc_id,'MIGRATE_DOCUMENT',NULL,(snap->'header'->>'version')::integer,NULL,snap||jsonb_build_object('baseline',anchor_baseline,'sourceRecordId',doc->>'source_record_id'),transaction_timestamp());
  END LOOP;
 END IF;
 IF command_phase='PUBLISH' THEN
  IF cp->'counts' IS DISTINCT FROM cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLICATION_INCOMPLETE' USING ERRCODE='23514'; END IF;
  IF phase='BASELINE_SEAL' THEN
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch sealed_baseline WHERE sealed_baseline.id=baseline.id AND sealed_baseline.status='IMPORTED' AND sealed_baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
     AND sealed_baseline.source_hash=b.source_hash AND sealed_baseline.source_name=b.source_name AND sealed_baseline.cutoff_at=b.cutoff_at) THEN RAISE EXCEPTION 'STANDARD_ACTIVATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM naijue_erp.import_record s WHERE s.import_batch_id=batch AND s.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.action='MIGRATE_DOCUMENT' AND r.target_id=s.target_id AND r.target_type=CASE s.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN RAISE EXCEPTION 'STANDARD_MIGRATION_CLOSURE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF command_phase<>'INITIALIZE' AND phase<>'DOCUMENT_STAGE' THEN
  UPDATE naijue_erp.import_batch SET checkpoint=cp,status=CASE WHEN command_phase='PUBLISH' THEN 'IMPORTED' ELSE 'VALIDATING' END,
    completed_at=CASE WHEN command_phase='PUBLISH' THEN transaction_timestamp() ELSE NULL END WHERE id=batch;
 END IF;
 -- Execute the real retained deferred validators under this finite API owner,
 -- before returning to the execute-only role. No trigger or constraint is skipped.
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','COMMITTED','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_import_verify(request jsonb,session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; publication_status jsonb; documents_batch naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE;
 source_counts jsonb:='{}'; documents jsonb:='[]'; inventory_keys jsonb:='[]'; counts bigint; kind text; current_version integer; initial_version integer; expected_version integer; steps integer;
 source_row record; header_row record; step record; stock_key record; row_value jsonb; prior_value jsonb; header_expected jsonb; header_actual jsonb; lines_expected jsonb; lines_actual jsonb;
 settlements_expected jsonb; settlements_actual jsonb; retired jsonb; snap jsonb; current_snap jsonb; before_header jsonb; after_header jsonb; field record; evidence_value jsonb;
 proof jsonb; admission record; quantity numeric; ledger_total numeric; effects bigint; balance naijue_erp.inventory_balance%ROWTYPE; has_balance boolean; item record;
 initial_receipt naijue_erp.operation_receipt%ROWTYPE; initial_audit naijue_erp.audit_change%ROWTYPE; initialized jsonb; source_total bigint; expected_counts jsonb;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER');
 publication_status:=naijue_erp.standard_import_status(request,session_token);
 IF publication_status->>'state'<>'COMMITTED' OR publication_status->'receipt'->>'phase'<>'DOCUMENT_PUBLISH' OR NOT naijue_erp.standard_business_ready() THEN RAISE EXCEPTION 'STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(publication_status->'receipt'->>'baselineBatchId')::uuid;
 SELECT a.after_values->'request'->'payload' INTO STRICT initialized FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
 -- Fence every imported header first, then every actual inventory key in the
 -- same global ordering used by ordinary commands. This is a live readback,
 -- not receipt counting and not an attempt to restore original current values.
 FOR header_row IN SELECT h.id FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR header_row IN SELECT h.id FROM naijue_erp.transfer_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id
    FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
     LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
    WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
   PERFORM naijue_erp.inventory_key_lock(stock_key.warehouse_id,stock_key.sku_id);
   PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id FOR SHARE;
 END LOOP;
 FOR kind IN SELECT unnest(ARRAY['HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','INVENTORY_KEY','IMPORT_BATCH']) LOOP
  SELECT count(*) INTO counts FROM naijue_erp.import_record WHERE import_batch_id IN (baseline.id,documents_batch.id) AND target_type=kind AND status='IMPORTED';
  source_counts:=source_counts||jsonb_build_object(kind,counts);
 END LOOP;
 IF source_counts->>'IMPORT_BATCH'<>'3' OR (source_counts->>'INVENTORY_KEY')::numeric<>(baseline.checkpoint->'expected'->>'INVENTORY_KEY')::numeric THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 FOR kind IN SELECT jsonb_object_keys(initialized->'expected_master_counts') LOOP
  IF source_counts->kind IS DISTINCT FROM initialized->'expected_master_counts'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'] LOOP
  IF source_counts->kind IS DISTINCT FROM documents_batch.checkpoint->'expected'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR source_row IN SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' ORDER BY s.id LOOP
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF source_row.target_type NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
   IF source_row.target_type='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.size_group_member t WHERE size_group_id=(proof->'fields'->>'size_group_id')::uuid AND size_id=(proof->'fields'->>'size_id')::uuid FOR SHARE;
   ELSIF source_row.target_type='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(proof->'fields'->>'payment_account_id')::uuid AND hall_id=(proof->'fields'->>'hall_id')::uuid FOR SHARE;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1 FOR SHARE',lower(source_row.target_type)) INTO row_value USING source_row.target_id; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(source_row.target_type)) INTO prior_value USING proof->'fields';
   IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR source_row IN SELECT * FROM naijue_erp.import_record WHERE import_batch_id=documents_batch.id AND target_type IN ('SALES_HEADER','TRANSFER_HEADER') ORDER BY target_type,target_id LOOP
  kind:=CASE source_row.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END;
  SELECT * INTO STRICT initial_receipt FROM naijue_erp.operation_receipt WHERE target_type=kind AND target_id=source_row.target_id AND action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT initial_audit FROM naijue_erp.audit_change WHERE operation_id=initial_receipt.id;
  snap:=initial_audit.after_values-ARRAY['baseline','sourceRecordId'];current_snap:=naijue_erp.unified_document_snapshot(kind,source_row.target_id);
  initial_version:=initial_audit.new_version;current_version:=(current_snap->'header'->>'version')::integer;expected_version:=initial_version;steps:=0;retired:='{}';
  IF initial_receipt.actor_account_id<>initial_audit.actor_account_id OR initial_audit.old_version IS NOT NULL OR initial_audit.before_values IS NOT NULL
   OR initial_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
   OR initial_audit.after_values->>'sourceRecordId'<>source_row.id::text OR current_version<initial_version THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORIGINAL_MIGRATION_INVALID' USING ERRCODE='23514'; END IF;
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF kind='SALES' THEN
   row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
  ELSE row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header')); END IF;
  IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'lines') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type=kind||'_LINE' AND s.target_id=(row_value->>'id')::uuid;
   IF kind='SALES' THEN prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof->'fields'));evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,row_value));
   ELSE prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,proof->'fields'))-'current_line_no';evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,row_value))-'current_line_no'; END IF;
   IF prior_value IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'settlements') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type='SALES_SETTLEMENT' AND s.target_id=(row_value->>'id')::uuid;
   IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,row_value)) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_SETTLEMENT_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at']) key LOOP
   IF current_snap->'header'->field.key IS DISTINCT FROM snap->'header'->field.key THEN RAISE EXCEPTION 'STANDARD_VERIFY_IMMUTABLE_DOCUMENT_ORIGIN_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF kind='SALES' THEN
   header_expected:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
   header_actual:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_line_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.unified_sales_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.sales_line l WHERE sales_id=source_row.target_id;
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_settlement_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_settlement,v))),'{}') INTO settlements_expected FROM jsonb_array_elements(snap->'settlements') v;
   SELECT coalesce(jsonb_object_agg(s.id::text,naijue_erp.unified_sales_settlement_audit_values(s)),'{}') INTO settlements_actual FROM naijue_erp.sales_settlement s WHERE sales_id=source_row.target_id;
  ELSE
   header_expected:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header'));
   header_actual:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.transfer_line_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.transfer_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.transfer_line l WHERE transfer_id=source_row.target_id;
   settlements_expected:='{}';settlements_actual:='{}';
   IF current_snap->'header'->'created_role' IS DISTINCT FROM snap->'header'->'created_role' THEN RAISE EXCEPTION 'STANDARD_VERIFY_CREATION_ROLE_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  FOR step IN SELECT a.*,r.actor_account_id receipt_actor,r.action receipt_action,r.target_type receipt_kind,r.target_id receipt_target,r.completed_at,r.result_data,r.status receipt_status
   FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type=kind AND a.object_id=source_row.target_id AND a.new_version>initial_version AND a.new_version<=current_version ORDER BY a.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version<>expected_version+1 OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE','VOID') OR step.action<>step.receipt_action
    OR step.receipt_kind<>kind OR step.receipt_target<>source_row.target_id OR step.actor_account_id<>step.receipt_actor OR step.receipt_status<>'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.result_data->>'version'<>step.new_version::text THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORDINARY_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header';after_header:=step.after_values->'header';
   FOR field IN SELECT * FROM jsonb_each(before_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    IF header_expected->field.key IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_HEADER_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR field IN SELECT * FROM jsonb_each(after_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    header_expected:=jsonb_set(header_expected,ARRAY[field.key],evidence_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) LOOP
    IF lines_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'lines','[]')) LOOP
    IF lines_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) v WHERE v->>'id'=row_value->>'id') THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    lines_expected:=jsonb_set(lines_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) LOOP
    IF settlements_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id') THEN
     settlements_expected:=settlements_expected-(row_value->>'id');retired:=retired||jsonb_build_object(row_value->>'id',true);
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) LOOP
    IF retired ? (row_value->>'id') OR (settlements_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id')) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    settlements_expected:=jsonb_set(settlements_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   expected_version:=step.new_version;steps:=steps+1;
  END LOOP;
  IF expected_version<>current_version OR header_expected IS DISTINCT FROM header_actual OR lines_expected IS DISTINCT FROM lines_actual OR settlements_expected IS DISTINCT FROM settlements_actual THEN
   RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_NATIVE_PROJECTION_DIFFERS' USING ERRCODE='23514'; END IF;
  IF steps=0 AND current_snap IS DISTINCT FROM snap THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNCHANGED_NATIVE_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  documents:=documents||jsonb_build_array(jsonb_build_object('kind',kind,'id',source_row.target_id,'initial_version',initial_version,'current_version',current_version,'state',CASE WHEN steps=0 THEN 'UNCHANGED' ELSE 'VERIFIED_CHANGED_AFTER_IMPORT' END,'audit_steps',steps));
 END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
  proof:=naijue_erp.standard_inventory_key_proof(stock_key.warehouse_id,stock_key.sku_id);
  IF proof->>'state'='UNKNOWN' THEN
   SELECT * INTO STRICT admission FROM naijue_erp.inventory_key_admission(stock_key.warehouse_id,stock_key.sku_id);
   IF admission.admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNPROVEN_KEY_UNKNOWN_NOT_ZERO' USING ERRCODE='23514'; END IF;
   quantity:=0;proof:=jsonb_build_object('state','POST_CUTOFF_NATIVE');
  ELSE quantity:=(proof->'fields'->>'quantity')::numeric; END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO ledger_total,effects FROM naijue_erp.inventory_ledger WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.operation_receipt r ON r.id=l.operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id
   WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND (r.id IS NULL OR a.operation_id IS NULL OR r.status<>'COMMITTED' OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id
    OR a.object_type<>r.target_type OR a.action<>r.action OR a.occurred_at IS DISTINCT FROM r.completed_at OR NOT(r.result_data->'ledgerEntryIds' ? l.id::text))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_LEDGER_OPERATION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO balance FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;has_balance:=FOUND;
  IF (effects=0 AND (proof->>'state'<>'EXPLICIT_ZERO' OR has_balance)) OR (effects>0 AND (NOT has_balance OR balance.quantity::numeric<>ledger_total OR balance.version::numeric<>effects
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.id=balance.last_operation_id AND l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND r.completed_at=balance.updated_at))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_BALANCE_LEDGER_DIFFERS' USING ERRCODE='23514'; END IF;
  inventory_keys:=inventory_keys||jsonb_build_array(jsonb_build_object('warehouse_id',stock_key.warehouse_id,'sku_id',stock_key.sku_id,'coverage',proof->>'state','baseline_quantity',quantity::text,'ledger_total',ledger_total::text,'ledger_entries',effects,
   'balance_quantity',CASE WHEN has_balance THEN balance.quantity::text ELSE NULL END,'balance_version',CASE WHEN has_balance THEN balance.version ELSE NULL END,'verified',true));
 END LOOP;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','plan_sha256',request->>'plan_sha256','batch_id',documents_batch.id,'baseline_batch_id',baseline.id,'verified',true,'documents',documents,'source_counts',source_counts,
  'inventory_keys',inventory_keys,'scope','CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED','proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $$;

DO $after$
DECLARE routine_row record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27)) OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD46_EXACT_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'451708aa41f1ffe91ae3008491f1679da19e45d844e06fd054d4108c3215f498' THEN RAISE EXCEPTION 'STANDARD46_AFTER_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'b017d792379dbe8d974b3e6e0cec0dd07f288d965b8c898a11c3dfba190f3bfc' OR NOT routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD46_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid='naijue_erp.standard_import_verify(jsonb,text)'::regprocedure;
 IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>'5ab152bdedb516e2994f1b4201c4803ce837f7b096848c3651ad88ac052c23af' THEN RAISE EXCEPTION 'STANDARD46_AFTER_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
 IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>'3ee3dbca4075deda383bfa41f19af14e9d54c866682c326ff06f9e950d686a70' OR NOT routine_row.prosecdef OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'STANDARD46_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
END $after$;
COMMIT;
