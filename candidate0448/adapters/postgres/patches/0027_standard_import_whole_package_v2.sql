-- SOURCE ONLY: not installed or PostgreSQL validated. No old entry point is changed.
-- Requires reviewed installer ownership/EXECUTE policy; no role membership is granted here.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
DO $lineage$ BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure) IS DISTINCT FROM '7874ce87039cdc09115916bfd31ee55e6f0c52f42b68f37744e2e37d0914c1e0'
 OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.assert_standard_import_operation(uuid)'::regprocedure) IS DISTINCT FROM 'aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4'
 THEN RAISE EXCEPTION 'WHOLE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $lineage$;
-- Internal capability check. No custom GUC, temporary table, caller actor or session seed.
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_context_v2(root_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; marker jsonb;
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
 IF NOT pg_has_role(session_user,'erp_unified27_initializer_2393dbc6db9581c2','SET') THEN
  RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 marker:=a.after_values->'whole_package_v2';
 IF marker IS DISTINCT FROM jsonb_build_object('root_operation',root_operation,'ordinal',0,
   'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user)
  OR r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR r.target_type IS DISTINCT FROM 'IMPORT'
  OR r.actor_account_id IS DISTINCT FROM a.actor_account_id OR r.target_id IS DISTINCT FROM a.object_id
  OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM root_operation::text
  OR a.after_values->'request'->'payload'->'admin'->>'account_id' IS DISTINCT FROM r.actor_account_id::text
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=r.id AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change x WHERE x.id=a.id AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('actor',r.actor_account_id,'request',a.after_values->'request','marker',marker);
END $$;

-- Reconcile immutable receipt/checkpoint chains. The existing typed-row/effect
-- assertions still execute for EVERY member through the deferred trigger.
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_closed_v2(root_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
BEGIN
 SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 init:=root_a.after_values->'request';baseline_id:=(init->>'batch_id')::uuid;documents_id:=(init->'payload'->>'document_batch_id')::uuid;
 IF root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
  OR root_a.after_values->'whole_package_v2'->'ordinal' IS DISTINCT FROM '0'::jsonb
  OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR baseline_id=documents_id
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text
   ORDER BY (after_values->'whole_package_v2'->>'ordinal')::integer LOOP
  ordinal:=(a.after_values->'whole_package_v2'->>'ordinal')::integer;
  IF ordinal IS DISTINCT FROM expected_ordinal THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  expected_ordinal:=expected_ordinal+1;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  rank:=CASE a.after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 ELSE NULL END;
  command_phase:=CASE a.after_values->>'phase' WHEN 'BASELINE_SEAL' THEN 'PUBLISH' WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' WHEN 'DOCUMENT_STAGE' THEN 'DOCUMENTS' ELSE a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR r.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id NOT IN (baseline_id,documents_id)
   OR r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN baseline_id ELSE documents_id END)
   OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.object_id IS DISTINCT FROM r.target_id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR a.id IS DISTINCT FROM r.id OR a.action IS DISTINCT FROM r.action OR a.occurred_at IS DISTINCT FROM root_r.completed_at OR r.completed_at IS DISTINCT FROM root_r.completed_at
   OR a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR a.after_values->'request'->>'namespace' IS DISTINCT FROM init->>'namespace'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM init->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM init->>'package_manifest_sha256'
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM init->>'cutoff_at'
   OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
   OR (ordinal>0 AND r.request_hash IS DISTINCT FROM encode(sha256(convert_to(command_phase||':'||(a.after_values->'request')::text,'UTF8')),'hex'))
   OR a.before_values IS DISTINCT FROM previous->(r.target_id::text)
   OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1
  THEN RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
  last_rank:=rank;previous:=jsonb_set(previous,ARRAY[r.target_id::text],a.after_values->'checkpoint');
  last_status:=jsonb_set(last_status,ARRAY[r.target_id::text],r.result_data->'status');final_result:=r.result_data;
 END LOOP;
 IF last_rank<>6 OR expected_ordinal<4 OR (SELECT count(*) FROM jsonb_object_keys(previous))<>2 THEN
  RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id) LOOP
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_command_v2(request jsonb,private_parameter text,command_phase text,root_operation uuid,child_ordinal integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
 whole_context jsonb; whole_marker jsonb; prior_rank integer; next_rank integer;
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
  IF root_operation IS DISTINCT FROM operation OR child_ordinal IS DISTINCT FROM 0 OR NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
  PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');actor:=(payload->'admin'->>'account_id')::uuid;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text||':'||coalesce(private_parameter,''),'UTF8')),'hex');
 ELSE
  whole_context:=naijue_erp.standard_whole_package_context_v2(root_operation);
  actor:=(whole_context->>'actor')::uuid;
  IF request->>'namespace' IS DISTINCT FROM whole_context->'request'->>'namespace'
   OR request->>'plan_sha256' IS DISTINCT FROM whole_context->'request'->>'plan_sha256'
   OR request->>'package_manifest_sha256' IS DISTINCT FROM whole_context->'request'->>'package_manifest_sha256'
   OR request->>'cutoff_at' IS DISTINCT FROM whole_context->'request'->>'cutoff_at'
   OR batch NOT IN ((whole_context->'request'->>'batch_id')::uuid,(whole_context->'request'->'payload'->>'document_batch_id')::uuid)
   OR private_parameter IS NOT NULL THEN RAISE EXCEPTION 'WHOLE_REQUEST_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF child_ordinal IS NULL OR child_ordinal<1 OR child_ordinal<>(SELECT count(*) FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text)
   OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text)
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  next_rank:=CASE command_phase WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'PUBLISH' THEN CASE payload->>'phase' WHEN 'BASELINE' THEN 3 WHEN 'DOCUMENTS' THEN 6 END WHEN 'DOCUMENTS' THEN CASE payload->>'mode' WHEN 'STAGE' THEN 4 WHEN 'CHUNK' THEN 5 END END;
  SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
   FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;
  IF next_rank IS NULL OR prior_rank IS NULL OR next_rank<prior_rank OR prior_rank=6 THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN RAISE EXCEPTION 'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'schema_declarations_sha256' AND (jsonb_typeof(payload->'schema_declarations_sha256') IS DISTINCT FROM 'string' OR payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')) THEN
   RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
  -- SQL49: the frozen eight-key planning contract is an explicit V2 opt-in.
  -- Its JS typed digests are opaque bindings in the immutable INIT request;
  -- they are never misrepresented as PostgreSQL jsonb::text hashes.
  IF payload ? 'execution_contract' THEN
   execution_contract:=payload->'execution_contract';master_chunks_v2:=true;
   IF jsonb_typeof(execution_contract) IS DISTINCT FROM 'object'
    OR execution_contract-ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256']<>'{}'
    OR NOT(execution_contract ?& ARRAY['format_version','compiler_version','scheduler_version','max_master_chunk_rows','master_chunks','master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256'])
    OR execution_contract->>'format_version' IS DISTINCT FROM 'UNIFIED_STANDARD_EXECUTION_PLAN_V2'
    OR execution_contract->>'compiler_version' IS DISTINCT FROM 'DEPENDENCY_ORDERED_STANDARD_PROGRAM_V2'
    OR execution_contract->>'scheduler_version' IS DISTINCT FROM 'UNIFIED_STANDARD_MASTER_CHUNK_PLAN_V2'
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('max_master_chunk_rows','master_chunks') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'number' OR (contract_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    OR (execution_contract->>'max_master_chunk_rows')::numeric NOT BETWEEN 1 AND 500
    OR (execution_contract->>'master_chunks')::numeric NOT BETWEEN 0 AND 2147483646
    OR EXISTS(SELECT 1 FROM jsonb_each(execution_contract) contract_field WHERE contract_field.key IN ('master_schedule_layout_sha256','master_chunk_plan_sha256','initialization_identity_sha256') AND (jsonb_typeof(contract_field.value) IS DISTINCT FROM 'string' OR ((contract_field.value#>>'{}') ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'STANDARD49_V2_EXECUTION_CONTRACT_INVALID' USING ERRCODE='23514'; END IF;
   master_limit:=2147483647;max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF EXISTS(SELECT 1 FROM jsonb_each(payload->'admin') admin_field WHERE jsonb_typeof(admin_field.value) IS DISTINCT FROM 'string') OR octet_length(payload->'admin'->>'login_name')>256 THEN RAISE EXCEPTION 'STANDARD49_V2_ADMIN_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(payload->'expected') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_master_counts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'expected_documents') IS DISTINCT FROM 'object'
   OR (SELECT array_agg(count_key ORDER BY count_key) FROM jsonb_object_keys(payload->'expected') count_key) IS DISTINCT FROM ARRAY['IMPORT_BATCH','INVENTORY_EFFECT','INVENTORY_KEY','MASTER','NAMESPACE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected') count_field WHERE jsonb_typeof(count_field.value) IS DISTINCT FROM 'number' OR (count_field.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR count_field.value::text::numeric>2147483647) THEN RAISE EXCEPTION 'STANDARD49_INITIAL_COUNTER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(payload->'admin') IS DISTINCT FROM 'object' OR NOT(payload->'admin' ?& ARRAY['staff_id','account_id','login_name','staff_name'])
   OR (payload->'admin'->>'staff_id')::uuid IS NULL OR actor IS NULL OR (payload->>'document_batch_id')::uuid IS NULL OR (payload->>'namespace_record_id')::uuid IS NULL
   OR payload->>'document_batch_id'=batch::text
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_master_counts') k) IS DISTINCT FROM ARRAY['BARCODE_SCHEME','COLOR','CUSTOMER','FIT','HALL','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','PRODUCT_CATEGORY','PRODUCT_IMAGE','SEASON','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SKU','SKU_BARCODE','STAFF','SUPPLIER','WAREHOUSE']
   OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'expected_documents') k) IS DISTINCT FROM ARRAY['IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE']
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_master_counts') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>master_limit)
   OR EXISTS(SELECT 1 FROM jsonb_each(payload->'expected_documents') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR e.value::text::numeric>2147483646)
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_master_counts')) IS DISTINCT FROM (payload->'expected'->>'MASTER')::numeric
   OR (payload->'expected'->>'MASTER')::numeric>master_limit OR payload->'expected'->>'NAMESPACE' IS DISTINCT FROM '1' OR payload->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1' OR payload->'expected_documents'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   THEN RAISE EXCEPTION 'STANDARD_INITIALIZATION_CLOSED_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  IF (payload->'expected'->>'INVENTORY_EFFECT')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected'))>2147483647
   OR (SELECT sum(value::text::numeric) FROM jsonb_each(payload->'expected_documents'))>2147483647
   OR (payload->'expected_documents'->>'SALES_HEADER')::numeric+(payload->'expected_documents'->>'TRANSFER_HEADER')::numeric+1>2147483646 THEN RAISE EXCEPTION 'STANDARD49_INITIAL_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  IF master_chunks_v2 AND (((expected_master_chunks=0) IS DISTINCT FROM ((payload->'expected'->>'MASTER')::numeric=0))
   OR expected_master_chunks>(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric*max_master_chunk_rows<(payload->'expected'->>'MASTER')::numeric
   OR expected_master_chunks::numeric+ceil((payload->'expected'->>'INVENTORY_KEY')::numeric/100)+1>2147483646) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_LAYOUT_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  admin:=payload->'admin';
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  -- Validate the original bootstrap pair before publishing the first baseline.
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency IMMEDIATE;
  SET CONSTRAINTS naijue_erp.staff_maintenance_final_consistency,naijue_erp.user_account_maintenance_final_consistency DEFERRED;
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
  cfg:=initial_request->'payload';old_cp:=b.checkpoint;
  -- Mode and bounds come only from the original immutable INIT, never a chunk.
  master_chunks_v2:=cfg ? 'execution_contract';
  IF master_chunks_v2 THEN execution_contract:=cfg->'execution_contract';max_master_chunk_rows:=(execution_contract->>'max_master_chunk_rows')::integer;expected_master_chunks:=(execution_contract->>'master_chunks')::integer;
   IF jsonb_typeof(payload->'expected_sequence') IS DISTINCT FROM 'number' OR (payload->>'expected_sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (payload->>'expected_sequence')::numeric>2147483646 THEN RAISE EXCEPTION 'STANDARD49_EXPECTED_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
  IF jsonb_typeof(old_cp->'sequence') IS DISTINCT FROM 'number' OR (old_cp->>'sequence' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true OR (old_cp->>'sequence')::numeric>=2147483646 THEN RAISE EXCEPTION 'STANDARD49_AUDIT_SEQUENCE_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(old_cp,'{sequence}',to_jsonb((old_cp->>'sequence')::integer+1));
  IF command_phase IN ('MASTER','KEYS') THEN
   IF b.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR b.mapping_version<>'STANDARD_INITIAL_EXPLICIT_KEYS_V1' OR payload-ARRAY['expected_sequence','rows']<>'{}'
    OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'STANDARD_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='MASTER' AND (jsonb_array_length(payload->'rows')>max_master_chunk_rows
    OR (old_cp->>'sequence')::numeric>=expected_master_chunks
    OR ((old_cp->>'sequence')::numeric=expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')<>(old_cp->'expected'->>'MASTER')::numeric)
    OR ((old_cp->>'sequence')::numeric<expected_master_chunks-1 AND (old_cp->'counts'->>'MASTER')::numeric+jsonb_array_length(payload->'rows')>=(old_cp->'expected'->>'MASTER')::numeric)) THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_CHUNK_PROGRESS_INVALID' USING ERRCODE='23514'; END IF;
   IF master_chunks_v2 AND command_phase='KEYS' AND ((old_cp->>'sequence')::numeric<expected_master_chunks OR old_cp->'counts'->'MASTER' IS DISTINCT FROM old_cp->'expected'->'MASTER') THEN RAISE EXCEPTION 'STANDARD49_V2_MASTER_PHASE_INCOMPLETE' USING ERRCODE='23514'; END IF;
  ELSIF command_phase='DOCUMENTS' THEN
   IF b.inventory_mode<>'DOCUMENT_CONVERSION' OR payload->>'mode' IS DISTINCT FROM 'CHUNK' OR payload-ARRAY['mode','baseline_batch_id','expected_sequence','expected','rows','documents']<>'{}'
    OR payload->'expected' IS DISTINCT FROM b.checkpoint->'expected' OR jsonb_typeof(payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'rows') NOT BETWEEN 1 AND 500
    OR jsonb_typeof(payload->'documents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'STANDARD_DOCUMENT_CHUNK_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
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
     IF command_phase='DOCUMENTS' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt sealed
       WHERE sealed.action='MIGRATE_DOCUMENT' AND sealed.target_type=CASE WHEN kind IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT') THEN 'SALES' ELSE 'TRANSFER' END
        AND sealed.target_id=CASE WHEN kind IN ('SALES_HEADER','TRANSFER_HEADER') THEN target WHEN kind IN ('SALES_LINE','SALES_SETTLEMENT') THEN (fields->>'sales_id')::uuid ELSE (fields->>'transfer_id')::uuid END)
     THEN RAISE EXCEPTION 'WHOLE_DOCUMENT_ALREADY_SEALED' USING ERRCODE='23514'; END IF;
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_BEGIN
     -- An installed numeric table constraint does not widen a legacy package.
     -- Select only the original immutable INIT profile; never infer or rewrite codes.
     IF kind='FIT' AND (jsonb_typeof(fields->'code') IS DISTINCT FROM 'string'
      OR (fields->>'code' COLLATE "C" ~ CASE WHEN cfg->>'schema_declarations_sha256' IN
       ('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')
       THEN '^[A-Z356789]$' ELSE '^[A-Z]$' END) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_END
     IF master_chunks_v2 AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
     IF kind IN ('SIZE_GROUP_MEMBER','PAYMENT_ACCOUNT_HALL') THEN
      encoded:='[s"naijue-cutoff-v1",s"standard-composite-target-v1",s'||to_json(request->>'namespace')::text||',s'||to_json(kind)::text||',s'||to_json(source_key)::text||']';
      IF registry_basis IS DISTINCT FROM 'DERIVED_COMPOSITE' OR substring(encode(sha256(convert_to(encoded,'UTF8')),'hex') FROM 1 FOR 32)::uuid<>target THEN RAISE EXCEPTION 'STANDARD_COMPOSITE_PROOF_ID_INVALID' USING ERRCODE='23514'; END IF;
     ELSIF fields->>'id' IS DISTINCT FROM target::text OR registry_basis IS NULL OR registry_basis NOT IN ('EXISTING_VERIFIED','STABLE_IMPORT_ID_V1') THEN RAISE EXCEPTION 'STANDARD_REGISTRY_TARGET_INVALID' USING ERRCODE='23514'; END IF;
     IF kind IN ('SALES_HEADER','TRANSFER_HEADER','PRODUCT_IMAGE') AND (fields->>'created_by_account_id' IS NOT NULL OR fields->>'approved_by_account_id' IS NOT NULL) THEN RAISE EXCEPTION 'STANDARD_ORIGINAL_ACCOUNT_MAPPING_UNPROVEN_NEW_TARGET' USING ERRCODE='23514'; END IF;
     IF kind IN ('WAREHOUSE','SKU') AND fields->>'created_operation_id' IS NOT NULL THEN RAISE EXCEPTION 'STANDARD_SOURCE_IDENTITY_IS_NOT_POSTCUTOFF_CREATION' USING ERRCODE='23514'; END IF;
     -- Exact canonical string inputs precede PostgreSQL's typmod coercion. A
     -- decimal(18,2) must never silently round an original three-decimal amount.
     FOR parent_row IN SELECT attname,atttypid FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
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
   cp:=jsonb_set(cp,ARRAY['counts',counter],to_jsonb((cp->'counts'->>counter)::numeric+1));
   IF kind='INVENTORY_KEY' AND (item->'fields'->>'quantity')::bigint<>0 THEN cp:=jsonb_set(cp,'{counts,INVENTORY_EFFECT}',to_jsonb((cp->'counts'->>'INVENTORY_EFFECT')::numeric+1));ledger_ids:=ledger_ids||jsonb_build_array(item->>'ledger_entry_id'); END IF;
   source_ids:=source_ids||jsonb_build_array(item->>'id');
  END LOOP;
  SELECT sum(value::numeric) INTO total FROM jsonb_each_text(cp->'counts');
  IF total<0 OR total>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
  cp:=jsonb_set(cp,'{cursor}',to_jsonb(total));
 END IF;
 IF (cp->>'sequence')::numeric>2147483646 OR (cp->>'cursor')::numeric>2147483647 THEN RAISE EXCEPTION 'STANDARD49_PROGRESS_COUNTER_OVERFLOW' USING ERRCODE='23514'; END IF;
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
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END,
    'whole_package_v2',CASE WHEN command_phase='INITIALIZE' THEN jsonb_build_object('root_operation',root_operation,'ordinal',0,'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user) ELSE jsonb_build_object('root_operation',root_operation,'ordinal',child_ordinal) END),transaction_timestamp());
 FOR item IN SELECT value FROM jsonb_array_elements(records) LOOP
  INSERT INTO naijue_erp.import_record(id,import_batch_id,source_system,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at)
   VALUES((item->>'id')::uuid,batch,request->>'namespace',item->>'entity_type',item->>'source_key',item->>'source_hash',item->>'file_ref',item->>'target_type',(item->>'target_id')::uuid,'IMPORTED',
    jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',operation)::text,transaction_timestamp());
 END LOOP;
 IF command_phase IN ('MASTER','DOCUMENTS') AND phase<>'DOCUMENT_STAGE' THEN
  FOR item IN SELECT value FROM jsonb_array_elements(records) WHERE value->>'target_type'<>'IMPORT_BATCH' ORDER BY
   array_position(ARRAY['BARCODE_SCHEME','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF','PRODUCT','SKU','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','TRANSFER_HEADER','SALES_LINE','TRANSFER_LINE','SALES_SETTLEMENT'],value->>'target_type'),
   CASE WHEN value->>'target_type'='PRODUCT_CATEGORY' THEN value->'fields'->>'parent_id' IS NOT NULL ELSE false END, value->>'target_id' LOOP
   kind:=item->>'target_type';table_name:=lower(kind COLLATE "C");fields:=item->'fields';
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING fields;
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(fields->>'size_group_id')::uuid AND size_id=(fields->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(fields->>'payment_account_id')::uuid AND hall_id=(fields->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='STAFF' THEN
    IF cfg->>'schema_declarations_sha256'='9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a' THEN
     IF NOT(fields ? 'departure_date') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT attisdropped AND attgenerated='') THEN RAISE EXCEPTION 'WHOLE_STAFF_SCHEMA_NOT_INSTALLED' USING ERRCODE='23514'; END IF;
     IF fields->'departure_date' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->'departure_date') IS DISTINCT FROM 'string' OR (fields->>'departure_date' COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true OR to_char((fields->>'departure_date')::date,'YYYY-MM-DD') IS DISTINCT FROM fields->>'departure_date') THEN RAISE EXCEPTION 'WHOLE_STAFF_DATE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF fields ? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='' AND NOT(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND cfg->>'schema_declarations_sha256' IS DISTINCT FROM '9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a')) THEN
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
   END IF;
   -- A source-explicit zero is a real current balance, but has no ledger effect.
   -- Only records present in the validated package reach this loop; missing keys remain absent.
   INSERT INTO naijue_erp.inventory_balance(warehouse_id,sku_id,quantity,version,last_operation_id,updated_at)
    VALUES((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid,quantity,1,operation,transaction_timestamp());
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
 -- Whole package: deferred constraints fire only after both final publications.
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','operation_id',operation,'batch_id',batch,'request_sha256',fingerprint,'state','PENDING_TRANSACTION','sequence',cp->'sequence','cursor',cp->'cursor','receipt',result);
END $$;
CREATE OR REPLACE FUNCTION naijue_erp.assert_standard_import_operation(operation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 item jsonb; actual jsonb; expected jsonb; table_name text; kind text; before_cp jsonb; after_cp jsonb; keys text[]; field text;
 delta numeric; total numeric:=0; ids jsonb; claimed jsonb; account_staff uuid; row_count bigint;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
 IF a.after_values ? 'whole_package_v2' THEN
  PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);
  IF operation=(a.after_values->'whole_package_v2'->>'root_operation')::uuid THEN
   PERFORM naijue_erp.standard_whole_package_closed_v2(operation);
  END IF;
  b.checkpoint:=a.after_values->'checkpoint';b.status:=r.result_data->>'status';
 END IF;
 before_cp:=a.before_values; after_cp:=a.after_values->'checkpoint';
 IF r.target_type<>'IMPORT' OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR a.after_values->>'profile'<>'STANDARD_IMPORT_SQL_V1'
  OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR a.new_version::text IS DISTINCT FROM ((after_cp->>'sequence')::integer+1)::text
  OR after_cp IS DISTINCT FROM b.checkpoint OR r.result_data->>'sequence' IS DISTINCT FROM after_cp->>'sequence'
  OR r.result_data->>'cursor' IS DISTINCT FROM after_cp->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM b.status
  OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM b.id::text OR a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
  OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
  OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at THEN
  RAISE EXCEPTION 'STANDARD_OPERATION_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
  WHERE u.id=r.actor_account_id AND u.login_enabled AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
  RAISE EXCEPTION 'STANDARD_CURRENT_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' AND NOT(a.after_values ? 'whole_package_v2') THEN PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 ELSE PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER'); END IF;
 keys:=CASE WHEN b.inventory_mode='DOCUMENT_CONVERSION' THEN ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH']
  ELSE ARRAY['MASTER','INVENTORY_KEY','INVENTORY_EFFECT','NAMESPACE','IMPORT_BATCH'] END;
 IF (SELECT count(*) FROM jsonb_object_keys(after_cp->'counts'))<>cardinality(keys) OR (SELECT count(*) FROM jsonb_object_keys(after_cp->'expected'))<>cardinality(keys) THEN
  RAISE EXCEPTION 'STANDARD_COUNTER_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY keys LOOP
  IF jsonb_typeof(after_cp->'counts'->field) IS DISTINCT FROM 'number' OR jsonb_typeof(after_cp->'expected'->field) IS DISTINCT FROM 'number'
   OR (after_cp->'counts'->>field ~ '^[0-9]+$') IS DISTINCT FROM true OR (after_cp->'expected'->>field ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (after_cp->'counts'->>field)::numeric>(after_cp->'expected'->>field)::numeric THEN RAISE EXCEPTION 'STANDARD_COUNTER_RANGE_INVALID' USING ERRCODE='23514'; END IF;
  total:=total+(after_cp->'counts'->>field)::numeric;
  SELECT count(*) INTO row_count FROM jsonb_array_elements(a.after_values->'records') value WHERE
   CASE field WHEN 'MASTER' THEN value->>'target_type' NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')
    WHEN 'INVENTORY_EFFECT' THEN value->>'target_type'='INVENTORY_KEY' AND (value->'fields'->>'quantity')::bigint<>0
    WHEN 'NAMESPACE' THEN value->>'entity_type'='BATCH_NAMESPACE_BINDING'
    WHEN 'IMPORT_BATCH' THEN value->>'target_type'='IMPORT_BATCH' AND value->>'entity_type'<>'BATCH_NAMESPACE_BINDING'
    ELSE value->>'target_type'=field END;
  delta:=(after_cp->'counts'->>field)::numeric-coalesce((before_cp->'counts'->>field)::numeric,0);
  IF delta<>row_count THEN RAISE EXCEPTION 'STANDARD_EXACT_PROGRESS_DELTA_INVALID: %',field USING ERRCODE='23514'; END IF;
 END LOOP;
 IF total<>(after_cp->>'cursor')::numeric OR (before_cp IS NULL AND ((after_cp->>'sequence')::integer<>0 OR a.old_version IS NOT NULL))
  OR (before_cp IS NOT NULL AND ((after_cp->>'sequence')::numeric<>(before_cp->>'sequence')::numeric+1 OR a.old_version<>(before_cp->>'sequence')::integer+1 OR a.old_version IS NULL)) THEN
  RAISE EXCEPTION 'STANDARD_CHECKPOINT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.import_record WHERE id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(a.after_values->'records'));
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
 IF ids IS DISTINCT FROM claimed THEN RAISE EXCEPTION 'STANDARD_RECEIPT_SOURCE_SET_INVALID' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
  PERFORM naijue_erp.standard_import_record_proof((item->>'id')::uuid);
  kind:=item->>'target_type';table_name:=lower(kind COLLATE "C");
  IF kind='INVENTORY_KEY' THEN
   IF (item->'fields'->>'quantity')::bigint=0 THEN
    IF item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=b.id AND warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND sku_id=(item->'fields'->>'sku_id')::uuid) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_CANNOT_POST_LEDGER' USING ERRCODE='23514'; END IF;
    IF a.after_values ? 'whole_package_v2' AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q
      WHERE q.warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND q.sku_id=(item->'fields'->>'sku_id')::uuid
        AND q.quantity=0 AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_BALANCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.inventory_balance q ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    WHERE l.id=(item->>'ledger_entry_id')::uuid AND l.operation_id=r.id AND l.source_import_batch_id=b.id AND l.event_kind='CUTOFF_BASELINE'
      AND l.warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND l.sku_id=(item->'fields'->>'sku_id')::uuid AND l.quantity_delta=(item->'fields'->>'quantity')::bigint
      AND q.quantity=l.quantity_delta AND q.version=1 AND q.last_operation_id=r.id AND q.updated_at=r.completed_at) THEN
    RAISE EXCEPTION 'STANDARD_NONZERO_BASELINE_EFFECT_INVALID' USING ERRCODE='23514'; END IF;
  ELSIF kind='IMPORT_BATCH' THEN
   IF item->>'target_id'<>b.id::text THEN RAISE EXCEPTION 'STANDARD_BATCH_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
    RAISE EXCEPTION 'STANDARD_TARGET_KIND_INVALID' USING ERRCODE='23514'; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF kind='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.size_group_member t WHERE size_group_id=(item->'fields'->>'size_group_id')::uuid AND size_id=(item->'fields'->>'size_id')::uuid;
   ELSIF kind='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO actual FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(item->'fields'->>'payment_account_id')::uuid AND hall_id=(item->'fields'->>'hall_id')::uuid;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1',table_name) INTO actual USING (item->>'target_id')::uuid; END IF;
   IF kind='TRANSFER_LINE' THEN expected:=expected-'current_line_no';actual:=actual-'current_line_no'; END IF;
   IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'STANDARD_TYPED_NATIVE_ROW_DIFFERS: %',kind USING ERRCODE='23514'; END IF;
   IF kind='HALL' AND expected->>'default_sales_warehouse_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=(expected->>'default_sales_warehouse_id')::uuid AND hall_id=(expected->>'id')::uuid) THEN RAISE EXCEPTION 'STANDARD_HALL_DEFAULT_OWNERSHIP_INVALID' USING ERRCODE='23514'; END IF;
   IF kind='PRODUCT_CATEGORY' AND EXISTS(WITH RECURSIVE ancestry AS (SELECT c.id,c.parent_id,ARRAY[c.id] visited,false cycle FROM naijue_erp.product_category c WHERE c.id=(expected->>'id')::uuid UNION ALL SELECT c.id,c.parent_id,ancestor_row.visited||c.id,c.id=ANY(ancestor_row.visited) FROM ancestry ancestor_row JOIN naijue_erp.product_category c ON c.id=ancestor_row.parent_id WHERE NOT ancestor_row.cycle) SELECT 1 FROM ancestry WHERE cycle) THEN RAISE EXCEPTION 'STANDARD_CATEGORY_CYCLE_DENIED' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO ids FROM naijue_erp.inventory_ledger WHERE operation_id=r.id;
 SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO claimed FROM jsonb_array_elements_text(r.result_data->'ledgerEntryIds');
 IF ids IS DISTINCT FROM claimed OR (r.result_data->>'phase'<>'KEYS' AND ids<>'[]') THEN RAISE EXCEPTION 'STANDARD_EXACT_EFFECT_SET_INVALID' USING ERRCODE='23514'; END IF;
 IF r.result_data->>'phase'='INITIALIZE' THEN
  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1
   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;
  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN
   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF b.status='IMPORTED' AND after_cp->'counts' IS DISTINCT FROM after_cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLISH_COUNTS_INCOMPLETE' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_prepare_v2(init_request jsonb,encoded_scrypt text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 RETURN naijue_erp.standard_whole_package_command_v2(init_request,encoded_scrypt,'INITIALIZE',(init_request->>'operation_id')::uuid,0);
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_step_v2(init_operation uuid,ordinal integer,command_phase text,request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
BEGIN
 IF command_phase IS NULL OR command_phase NOT IN ('MASTER','KEYS','DOCUMENTS','PUBLISH') THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
 RETURN naijue_erp.standard_whole_package_command_v2(request,NULL,command_phase,init_operation,ordinal);
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_finish_v2(init_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM naijue_erp.standard_whole_package_context_v2(init_operation);
 result:=naijue_erp.standard_whole_package_closed_v2(init_operation);
 -- This validates original source rows, native effects, audit/receipt chains and
 -- all retained deferred constraints. It does not COMMIT the caller transaction.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','summary',result);
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_inspect_v2(init_request jsonb,encoded_scrypt text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE actor uuid; operation uuid; batch uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; summary jsonb; assigned_xid xid8;
BEGIN
 -- Reject the ability to regain privilege after this call and suppress deferred triggers.
 IF current_setting('session_replication_role') IS DISTINCT FROM 'origin'
  OR has_parameter_privilege(session_user,'session_replication_role','SET')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles role_info WHERE pg_has_role(session_user,role_info.oid,'MEMBER') AND
    (role_info.rolsuper OR role_info.rolcreatedb OR role_info.rolcreaterole OR role_info.rolreplication OR role_info.rolbypassrls
     OR has_parameter_privilege(role_info.oid,'session_replication_role','SET')
     OR role_info.rolname NOT IN (session_user,'erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=session_user::regrole::oid AND admin_option)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND pg_has_role(session_user,c.relowner,'USAGE'))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND has_schema_privilege(session_user,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'WHOLE_CONTROLLER_UNSAFE' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
 IF encoded_scrypt IS NULL OR (encoded_scrypt COLLATE "C" ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$') IS DISTINCT FROM true
  OR jsonb_typeof(init_request) IS DISTINCT FROM 'object' OR init_request->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
  OR init_request->'payload'->>'mode' IS DISTINCT FROM 'NEW_EMPTY' OR coalesce(length(init_request->>'request_key'),0)=0
 THEN RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 actor:=(init_request->'payload'->'admin'->>'account_id')::uuid;operation:=(init_request->>'operation_id')::uuid;batch:=(init_request->>'batch_id')::uuid;
 IF actor IS NULL OR operation IS NULL OR batch IS NULL THEN RAISE EXCEPTION 'STANDARD_REQUEST_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(init_request->>'request_key'),0));
 SELECT * INTO r FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=init_request->>'request_key';
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation)
   OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id IN (batch,(init_request->'payload'->>'document_batch_id')::uuid))
  THEN RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('state','ABSENT');
 END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 IF r.request_hash IS DISTINCT FROM encode(sha256(convert_to('INITIALIZE:'||init_request::text||':'||encoded_scrypt,'UTF8')),'hex')
  OR r.id IS DISTINCT FROM operation OR r.target_id IS DISTINCT FROM batch OR a.after_values->'request' IS DISTINCT FROM init_request
  OR a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM operation::text THEN
  RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 assigned_xid:=pg_current_xact_id_if_assigned();
 IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=operation AND x.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
 summary:=naijue_erp.standard_whole_package_closed_v2(operation);
 RETURN jsonb_build_object('state','COMMITTED','packageSha256',init_request->>'package_manifest_sha256','planSha256',init_request->>'plan_sha256','summary',summary);
END $$;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_context_v2(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_closed_v2(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_prepare_v2(jsonb,text) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_finish_v2(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_inspect_v2(jsonb,text) FROM PUBLIC;

COMMIT;
