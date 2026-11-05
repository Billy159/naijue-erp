-- REVIEW ONLY. Requires a separately admitted project-schema successor.
BEGIN;
DO $source_review_not_admitted$ BEGIN
 RAISE EXCEPTION 'SOURCE_REVIEW_SCHEMA_SUCCESSOR_NOT_ADMITTED' USING ERRCODE='55000';
END $source_review_not_admitted$;
DO $source_review_predecessor$
DECLARE item record;
BEGIN
 IF current_user IS DISTINCT FROM (SELECT r.rolname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='naijue_erp')
  OR (SELECT count(*) FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='r')<>35
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>152 THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_EXACT_OWNER_35_152_REQUIRED' USING ERRCODE='55000'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($source_review_pins$[{"signature":"naijue_erp.guard_import_batch()","sha256":"b22fb07f37a04ef8ae7c03df0780c0025588947ce85693bd49a3c53f34c4d702"},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"6907bdc9cbe683e5a3f839a5ab7a6456824bc04ec3d2f5fb84768f1cd9f6ce38"},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"06d8c74d5571d3e7093e0845b7dccd17184b5a302a196c0d4af7bb654c538ea6"},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf"},{"signature":"naijue_erp.guard_history_publication()","sha256":"06d8c74d5571d3e7093e0845b7dccd17184b5a302a196c0d4af7bb654c538ea6"},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf"},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"917f5a7fcc48a0da093da9cc36ea7fa3d58bb6d0524c1da2373c6d69f7ed5fbf"},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"f14a1b571542a6d13e31b8b86fee4bc1a4a1988cdf08cb91b1ba0a59e96d23d0"},{"signature":"naijue_erp.validate_import_batch_commit()","sha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d"},{"signature":"naijue_erp.validate_import_accounting_checkpoint_commit()","sha256":"b6e35be539a377241faedf36c616fe941e26b4b132baf822b9fa35e9d7ffbe3d"},{"signature":"naijue_erp.guard_import_record()","sha256":"11342296be2355918e0b305801db0c3506c436d0c95600a6c86ab2da2465c4eb"},{"signature":"naijue_erp.validate_import_source_commit()","sha256":"72d8f8bb1e78de21848df2be29ba75dd8e5c97c5349164ca32c432b433e007ae"},{"signature":"naijue_erp.validate_import_operation()","sha256":"4f5f0c85675b2505cf8f86c17d43a7082e4cf1e0be990c4840e452cdaa03fae6"}]$source_review_pins$::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(item.value->>'signature')
    AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=item.value->>'sha256') THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_PREDECESSOR_BODY_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $source_review_predecessor$;
-- SOURCE ONLY, NOT AN INSTALL ENTRY. The candidate compiler supplies exact
-- predecessor gates, trigger branches, CHECKs and replacement RLS policies.
-- No ordinary target, inventory effect, source-time substitution or resolution
-- is implemented here. Every original capture is append-only and ADMIN-only.

CREATE FUNCTION naijue_erp.source_review_keys_v1(value jsonb, keys text[]) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR NOT(value ?& keys)
  OR value-keys IS DISTINCT FROM '{}'::jsonb THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_EXACT_KEYS_REQUIRED' USING ERRCODE='23514'; END IF;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_command_v1(request jsonb, session_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE actor uuid; operation uuid; batch uuid; phase text; payload jsonb; request_sha text; prior naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; old_cp jsonb; cp jsonb; counts jsonb; expected jsonb; field text; stage jsonb;
 approved jsonb; approved_by_key jsonb; item jsonb; source jsonb; part bytea; ordinal integer; received integer;
 result jsonb; ids jsonb:='[]'::jsonb; next_status text; action_name text; actual_set jsonb; expected_set jsonb;
BEGIN
 -- A host must execute one command in its own top-level transaction, not a
 -- SAVEPOINT/EXCEPTION subtransaction. Current-XID proof intentionally fails
 -- closed in an unsupported subtransaction. No transaction wrapper is supplied.
 -- This checks protected IMPORTER and a live current ADMIN before touching data.
 -- Actor/session never come from the source package or stored request.
 actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER');
 PERFORM naijue_erp.source_review_keys_v1(request,ARRAY['protocol','operation_id','request_key','batch_id','expected_sequence',
  'source_namespace','package_manifest_sha256','approval_sha256','phase','payload']);
 IF octet_length(convert_to(request::text,'UTF8'))>8388608
  OR request->>'protocol' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  OR jsonb_typeof(request->'operation_id') IS DISTINCT FROM 'string'
  OR (request->>'operation_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(request->'batch_id') IS DISTINCT FROM 'string'
  OR (request->>'batch_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(request->'request_key') IS DISTINCT FROM 'string' OR length(request->>'request_key') NOT BETWEEN 1 AND 512
  OR jsonb_typeof(request->'source_namespace') IS DISTINCT FROM 'string'
  OR length(request->>'source_namespace')>256
  OR (request->>'source_namespace' ~ '^[a-z][a-z0-9_.:-]*$') IS DISTINCT FROM true
  OR jsonb_typeof(request->'expected_sequence') IS DISTINCT FROM 'number'
  OR (request->>'expected_sequence' ~ '^(0|[1-9][0-9]{0,9})$') IS DISTINCT FROM true
  OR (request->>'expected_sequence')::numeric>2147483645
  OR jsonb_typeof(request->'package_manifest_sha256') IS DISTINCT FROM 'string'
  OR (request->>'package_manifest_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR jsonb_typeof(request->'approval_sha256') IS DISTINCT FROM 'string'
  OR (request->>'approval_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_REQUEST_SHAPE' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;batch:=(request->>'batch_id')::uuid;phase:=request->>'phase';payload:=request->'payload';
 IF phase='REVIEW_RESOLVE' THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_RESOLUTION_NOT_IMPLEMENTED' USING ERRCODE='0A000'; END IF;
 IF coalesce(phase,'') NOT IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL') THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_PHASE_INVALID' USING ERRCODE='23514'; END IF;
 request_sha:=encode(sha256(convert_to('SOURCE_REVIEW:'||request::text,'UTF8')),'hex');
 -- Namespace serialization closes cross-batch duplicate occurrences even when
 -- their original business keys repeat. It is not a warehouse inference.
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:source-review:namespace:'||(request->>'source_namespace'),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:source-review:request:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN
  IF prior.id IS DISTINCT FROM operation OR prior.request_hash IS DISTINCT FROM request_sha
   OR prior.target_type IS DISTINCT FROM 'IMPORT' OR prior.target_id IS DISTINCT FROM batch
   OR prior.status IS DISTINCT FROM 'COMMITTED' OR prior.result_data->>'profile' IS DISTINCT FROM request->>'protocol' THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  PERFORM naijue_erp.source_review_operation_v1(prior.id,false);
  RETURN prior.result_data;
 END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_OPERATION_ID_REUSED' USING ERRCODE='23505'; END IF;
 SET CONSTRAINTS naijue_erp.import_accounting_checkpoint_consistency,
  naijue_erp.import_batch_command_consistency,
  naijue_erp.import_accounting_final_record_consistency,
  naijue_erp.import_source_final_consistency,
  naijue_erp.document_specification_commit,
  naijue_erp.history_numeric_receipt_commit,
  naijue_erp.import_operation_consistency,
  naijue_erp.maintenance_receipt_final_consistency,
  naijue_erp.party_receipt_final_consistency,
  naijue_erp.sales_receipt_final_consistency,
  naijue_erp.transfer_receipt_final_consistency,
  naijue_erp.unified_ordinary_operation_consistency,
  naijue_erp.audit_change_operation_id_actor_account_id_object_id_actio_fkey,
  naijue_erp.audit_receipt_kind_coherence,
  naijue_erp.receipt_requires_audit,
  naijue_erp.receipt_requires_same_kind_audit DEFERRED;
 IF phase='REVIEW_STAGE' THEN
  PERFORM naijue_erp.source_review_keys_v1(payload,ARRAY['source_manifest_ref','approval_bytes','expected']);
  expected:=payload->'expected';
  PERFORM naijue_erp.source_review_keys_v1(expected,ARRAY['occurrences','headers','lines','settlements','known_groups','ungrouped_occurrences']);
  FOREACH field IN ARRAY ARRAY['occurrences','headers','lines','settlements','known_groups','ungrouped_occurrences'] LOOP
   IF jsonb_typeof(expected->field) IS DISTINCT FROM 'number' OR (expected->>field ~ '^(0|[1-9][0-9]{0,5})$') IS DISTINCT FROM true
    OR (expected->>field)::integer>250000 THEN RAISE EXCEPTION 'SOURCE_REVIEW_EXPECTED_COUNTS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF request->'expected_sequence'<>'0'::jsonb
   OR jsonb_typeof(payload->'source_manifest_ref') IS DISTINCT FROM 'string' OR length(btrim(payload->>'source_manifest_ref'))=0
   OR jsonb_typeof(payload->'approval_bytes') IS DISTINCT FROM 'number'
   OR (payload->>'approval_bytes' ~ '^[1-9][0-9]{0,7}$') IS DISTINCT FROM true
   OR (payload->>'approval_bytes')::integer>67108864
   OR (expected->>'occurrences')::integer=0
   OR (expected->>'occurrences')::integer<>(expected->>'headers')::integer+(expected->>'lines')::integer+(expected->>'settlements')::integer
   OR (expected->>'known_groups')::integer>(expected->>'headers')::integer
   OR (expected->>'ungrouped_occurrences')::integer>(expected->>'occurrences')::integer THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_STAGE_DECLARATION' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=batch)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE inventory_mode='CUTOFF_STOCK_BASELINE'
    AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND status='IMPORTED')
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE target_type='IMPORT'
    AND action='IMPORT_INITIALIZE_CURRENT_ADMIN' AND status='COMMITTED' AND result_data->>'profile'='STANDARD_IMPORT_SQL_V1') THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_EXISTING_INITIALIZATION_AND_BASELINE_REQUIRED' USING ERRCODE='23514'; END IF;
  counts:=jsonb_build_object('approval_bytes',0,'occurrences',0,'headers',0,'lines',0,'settlements',0,'known_groups',0,'ungrouped_occurrences',0);
  cp:=jsonb_build_object('sequence',0,'cursor',0,'counts',counts,'expected',expected);next_status:='STAGED';
 ELSE
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=batch FOR UPDATE;
  IF b.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' OR b.mapping_version IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_V1'
   OR b.source_name IS DISTINCT FROM request->>'source_namespace' OR b.source_hash IS DISTINCT FROM request->>'package_manifest_sha256'
   OR b.status NOT IN ('STAGED','VALIDATING') OR b.checkpoint->'sequence' IS DISTINCT FROM request->'expected_sequence' THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_OR_SEQUENCE_CONFLICT' USING ERRCODE='23514'; END IF;
  SELECT after_values->'request' INTO STRICT stage FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=batch
   AND after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' AND after_values->>'phase'='REVIEW_STAGE';
  IF stage->>'approval_sha256' IS DISTINCT FROM request->>'approval_sha256' THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_BINDING_MISMATCH' USING ERRCODE='23514'; END IF;
  old_cp:=b.checkpoint;counts:=old_cp->'counts';expected:=old_cp->'expected';next_status:='VALIDATING';
  IF phase='REVIEW_APPROVAL' THEN
   PERFORM naijue_erp.source_review_keys_v1(payload,ARRAY['offset','bytes_base64']);
   IF jsonb_typeof(payload->'offset') IS DISTINCT FROM 'number' OR payload->'offset' IS DISTINCT FROM counts->'approval_bytes'
    OR jsonb_typeof(payload->'bytes_base64') IS DISTINCT FROM 'string'
    OR length(payload->>'bytes_base64') NOT BETWEEN 4 AND 1398104
    OR (payload->>'bytes_base64' ~ '^[A-Za-z0-9+/]*={0,2}$') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_OFFSET_OR_ENCODING' USING ERRCODE='23514'; END IF;
   part:=decode(payload->>'bytes_base64','base64');received:=(counts->>'approval_bytes')::integer+octet_length(part);
   IF octet_length(part) NOT BETWEEN 1 AND 1048576 OR replace(encode(part,'base64'),E'\n','') IS DISTINCT FROM payload->>'bytes_base64'
    OR received>(stage->'payload'->>'approval_bytes')::integer THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_SEGMENT_BOUND' USING ERRCODE='23514'; END IF;
   counts:=jsonb_set(counts,'{approval_bytes}',to_jsonb(received));
  ELSE
   approved:=naijue_erp.source_review_approval_v1(batch);
   IF phase='REVIEW_CAPTURE' THEN
    PERFORM naijue_erp.source_review_keys_v1(payload,ARRAY['records']);
    IF jsonb_typeof(payload->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'records') NOT BETWEEN 1 AND 1000 THEN
     RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_BOUND' USING ERRCODE='23514'; END IF;
    SELECT jsonb_object_agg(naijue_erp.source_review_occurrence_v1(b.source_name,value),value) INTO approved_by_key
     FROM jsonb_array_elements(approved->'records');
    IF (SELECT count(DISTINCT value->>'occurrence_key') FROM jsonb_array_elements(payload->'records'))<>jsonb_array_length(payload->'records') THEN
     RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_DUPLICATE' USING ERRCODE='23505'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(payload->'records') LOOP
     source:=naijue_erp.source_review_wrapper_v1(b.source_name,item);
     IF approved_by_key->(item->>'occurrence_key') IS DISTINCT FROM source THEN
      RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_NOT_APPROVED' USING ERRCODE='23514'; END IF;
     PERFORM naijue_erp.import_source_key_lock(b.source_name,source->>'source_entity_type',item->>'occurrence_key');
     IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE source_system=b.source_name
      AND source_entity_type=source->>'source_entity_type' AND source_key=item->>'occurrence_key') THEN
      RAISE EXCEPTION 'SOURCE_REVIEW_OCCURRENCE_ALREADY_RETAINED' USING ERRCODE='23505'; END IF;
     field:=CASE source->>'source_entity_type' WHEN 'SALES_HEADER' THEN 'headers' WHEN 'SALES_LINE' THEN 'lines' ELSE 'settlements' END;
     counts:=jsonb_set(counts,ARRAY[field],to_jsonb((counts->>field)::integer+1));
     IF source->>'grouping'<>'COMPLETE_GROUP' THEN
      counts:=jsonb_set(counts,'{ungrouped_occurrences}',to_jsonb((counts->>'ungrouped_occurrences')::integer+1)); END IF;
    END LOOP;
    counts:=jsonb_set(counts,'{occurrences}',to_jsonb((counts->>'occurrences')::integer+jsonb_array_length(payload->'records')));
    SELECT jsonb_agg(value->>'id' ORDER BY value->>'id') INTO ids FROM jsonb_array_elements(payload->'records');
   ELSE
    PERFORM naijue_erp.source_review_keys_v1(payload,ARRAY[]::text[]);
    IF naijue_erp.source_review_expected_v1(approved) IS DISTINCT FROM expected THEN
     RAISE EXCEPTION 'SOURCE_REVIEW_SEAL_EXPECTED_COUNTS' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(naijue_erp.source_review_occurrence_v1(b.source_name,value)
     ORDER BY naijue_erp.source_review_occurrence_v1(b.source_name,value)),'[]'::jsonb) INTO expected_set FROM jsonb_array_elements(approved->'records');
    SELECT coalesce(jsonb_agg(source_key ORDER BY source_key),'[]'::jsonb) INTO actual_set FROM naijue_erp.import_record WHERE import_batch_id=batch;
    IF actual_set IS DISTINCT FROM expected_set THEN
     RAISE EXCEPTION 'SOURCE_REVIEW_SEAL_EXACT_SET_INCOMPLETE' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT to_jsonb(s) FROM naijue_erp.import_record s WHERE s.import_batch_id=batch LOOP
     source:=naijue_erp.source_review_record_proof_v1(item,false);
    END LOOP;
    counts:=jsonb_set(counts,'{known_groups}',expected->'known_groups');next_status:='PASSED';
   END IF;
  END IF;
  cp:=jsonb_build_object('sequence',(old_cp->>'sequence')::integer+1,'cursor',(counts->>'occurrences')::integer,'counts',counts,'expected',expected);
 END IF;
 action_name:=CASE phase WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END;
 result:=jsonb_build_object('profile','HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1','operationId',operation,'batchId',batch,
  'sequence',cp->'sequence','cursor',cp->'cursor','status',next_status,'ledgerEntryIds','[]'::jsonb,'sourceRecordIds',ids,
  'phase',phase,'packageManifestSha256',request->>'package_manifest_sha256','approvalSha256',request->>'approval_sha256',
  'captureState',CASE phase WHEN 'REVIEW_SEAL' THEN 'PENDING_REVIEW' ELSE 'CAPTURING' END);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,created_at,completed_at)
  VALUES(operation,actor,request->>'request_key',request_sha,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp(),transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE phase WHEN 'REVIEW_STAGE' THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,
   (cp->>'sequence')::integer+1,old_cp,jsonb_build_object('profile',request->>'protocol','phase',phase,'request',request,'checkpoint',cp),transaction_timestamp());
 IF phase='REVIEW_STAGE' THEN
  INSERT INTO naijue_erp.import_batch(id,source_name,source_manifest_ref,source_hash,cutoff_at,mapping_version,inventory_mode,status,checkpoint,created_at,completed_at)
   VALUES(batch,request->>'source_namespace',payload->>'source_manifest_ref',request->>'package_manifest_sha256',NULL,
    'HISTORICAL_SALES_SOURCE_REVIEW_V1','SOURCE_REVIEW','STAGED',cp,transaction_timestamp(),NULL);
 ELSE
  IF phase='REVIEW_CAPTURE' THEN
   ordinal:=0;
   FOR item IN SELECT value FROM jsonb_array_elements(payload->'records') LOOP
    source:=item->'source';
    INSERT INTO naijue_erp.import_record(id,import_batch_id,source_entity_type,source_key,source_record_hash,source_file_ref,target_type,target_id,status,decision_reason,reviewed_at,source_system)
     VALUES((item->>'id')::uuid,batch,source->>'source_entity_type',item->>'occurrence_key',item->>'source_record_sha256',(source->'source_ref')::text,
      NULL,NULL,'QUARANTINED',jsonb_build_object('format','SOURCE_REVIEW_POINTER_V1','operationId',operation,'recordOrdinal',ordinal)::text,NULL,b.source_name);
    ordinal:=ordinal+1;
   END LOOP;
  END IF;
  IF phase='REVIEW_APPROVAL' AND received=(stage->'payload'->>'approval_bytes')::integer THEN
   approved:=naijue_erp.source_review_approval_v1(batch);
   IF naijue_erp.source_review_expected_v1(approved) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_DECLARED_SET_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  UPDATE naijue_erp.import_batch SET status=next_status,checkpoint=cp WHERE id=batch;
 END IF;
 PERFORM naijue_erp.source_review_complete_operation_v1(operation);
 SET CONSTRAINTS naijue_erp.import_accounting_checkpoint_consistency,
  naijue_erp.import_batch_command_consistency,
  naijue_erp.import_accounting_final_record_consistency,
  naijue_erp.import_source_final_consistency,
  naijue_erp.document_specification_commit,
  naijue_erp.history_numeric_receipt_commit,
  naijue_erp.import_operation_consistency,
  naijue_erp.maintenance_receipt_final_consistency,
  naijue_erp.party_receipt_final_consistency,
  naijue_erp.sales_receipt_final_consistency,
  naijue_erp.transfer_receipt_final_consistency,
  naijue_erp.unified_ordinary_operation_consistency,
  naijue_erp.audit_change_operation_id_actor_account_id_object_id_actio_fkey,
  naijue_erp.audit_receipt_kind_coherence,
  naijue_erp.receipt_requires_audit,
  naijue_erp.receipt_requires_same_kind_audit IMMEDIATE;
 SET CONSTRAINTS naijue_erp.import_accounting_checkpoint_consistency,
  naijue_erp.import_batch_command_consistency,
  naijue_erp.import_accounting_final_record_consistency,
  naijue_erp.import_source_final_consistency,
  naijue_erp.document_specification_commit,
  naijue_erp.history_numeric_receipt_commit,
  naijue_erp.import_operation_consistency,
  naijue_erp.maintenance_receipt_final_consistency,
  naijue_erp.party_receipt_final_consistency,
  naijue_erp.sales_receipt_final_consistency,
  naijue_erp.transfer_receipt_final_consistency,
  naijue_erp.unified_ordinary_operation_consistency,
  naijue_erp.audit_change_operation_id_actor_account_id_object_id_actio_fkey,
  naijue_erp.audit_receipt_kind_coherence,
  naijue_erp.receipt_requires_audit,
  naijue_erp.receipt_requires_same_kind_audit DEFERRED;
 RETURN result;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_read_v1(request jsonb, session_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE actor uuid; b naijue_erp.import_batch%ROWTYPE; stage jsonb; rows jsonb; next_cursor text; total integer;
BEGIN
 actor:=naijue_erp.standard_import_identity(session_token,'IMPORTER');
 PERFORM naijue_erp.source_review_keys_v1(request,ARRAY['protocol','batch_id','source_namespace','package_manifest_sha256','approval_sha256','after_occurrence_key','limit']);
 IF request->>'protocol' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  OR jsonb_typeof(request->'limit') IS DISTINCT FROM 'number' OR (request->>'limit' ~ '^[1-9][0-9]{0,2}$') IS DISTINCT FROM true
  OR (request->>'limit')::integer>100
  OR (request->'after_occurrence_key'<>'null'::jsonb AND (jsonb_typeof(request->'after_occurrence_key') IS DISTINCT FROM 'string'
   OR (request->>'after_occurrence_key' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_BOUNDED_READ_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT after_values->'request' INTO STRICT stage FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=b.id
  AND after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' AND after_values->>'phase'='REVIEW_STAGE';
 IF b.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' OR b.source_name IS DISTINCT FROM request->>'source_namespace'
  OR b.source_hash IS DISTINCT FROM request->>'package_manifest_sha256' OR stage->>'approval_sha256' IS DISTINCT FROM request->>'approval_sha256' THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_READ_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 -- Page first, then use the exact immutable operation pointer for each row.
 -- No full approval reconstruction, all-chunk scan or current staff/hall relabel.
 WITH page AS MATERIALIZED (SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id=b.id
  AND (request->'after_occurrence_key'='null'::jsonb OR s.source_key>request->>'after_occurrence_key')
  ORDER BY s.source_key LIMIT (request->>'limit')::integer)
 SELECT coalesce(jsonb_agg(jsonb_build_object('record',naijue_erp.source_review_record_proof_v1(to_jsonb(page),false),
  'state',CASE b.status WHEN 'PASSED' THEN 'PENDING_REVIEW' ELSE 'CAPTURING' END) ORDER BY source_key),'[]'::jsonb),max(source_key)
  INTO rows,next_cursor FROM page;
 total:=(b.checkpoint->>'cursor')::integer;
 RETURN jsonb_build_object('profile','HISTORICAL_SALES_SOURCE_REVIEW_READ_V1','batchId',b.id,
  'state',CASE b.status WHEN 'PASSED' THEN 'PENDING_REVIEW' ELSE 'CAPTURING' END,
  'rows',rows,'nextOccurrenceKey',next_cursor,'durablePendingOccurrences',total,
  'expectedButNotReceived',(b.checkpoint->'expected'->>'occurrences')::integer-total,
  'materializedOccurrences',0,'excludedOccurrences',0,'partitionSealed',b.status='PASSED',
  'reprocessingImplemented',false,'resolutionImplemented',false);
END $sr$;

CREATE FUNCTION naijue_erp.source_review_occurrence_v1(source_namespace text, source jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
 SELECT encode(sha256(convert_to('['||to_json(source_namespace)::text||','||
  to_json(source->>'source_entity_type')::text||','||to_json(source->'source_ref'->>'file_sha256')::text||','||
  coalesce(to_json(source->'source_ref'->>'sheet')::text,'null')||','||
  ((source->'source_ref'->>'row')::numeric::integer)::text||','||
  ((source->'source_ref'->>'occurrence')::numeric::integer)::text||']','UTF8')),'hex');
$sr$;

CREATE FUNCTION naijue_erp.source_review_record_id_v1(occurrence_key text) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
 SELECT (substr(occurrence_key,1,8)||'-'||substr(occurrence_key,9,4)||'-8'||substr(occurrence_key,14,3)||'-'||
  substr('89ab',((get_byte(decode(substr(occurrence_key,17,2),'hex'),0)/16)%4)+1,1)||
  substr(occurrence_key,18,3)||'-'||substr(occurrence_key,21,12))::uuid;
$sr$;

CREATE FUNCTION naijue_erp.source_review_utf16_length_v1(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
 -- PostgreSQL text has already rejected NUL and invalid Unicode/surrogates.
 -- One extra UTF-16 unit for each non-BMP scalar matches JavaScript length.
 SELECT length(value)+regexp_count(value COLLATE "C",'['||chr(65536)||'-'||chr(1114111)||']');
$sr$;

CREATE FUNCTION naijue_erp.source_review_source_v1(source jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE field text; ref jsonb; cells jsonb; cell record;
BEGIN
 PERFORM naijue_erp.source_review_keys_v1(source,ARRAY['source_entity_type','source_key','group_key','source_ref',
  'raw_fields','normalized_fields','normalization_version','raw_warehouse_value','reliable_original_hall_evidence','reason','grouping']);
 IF source->>'source_entity_type' NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT')
  OR jsonb_typeof(source->'source_entity_type') IS DISTINCT FROM 'string'
  OR jsonb_typeof(source->'source_key') IS DISTINCT FROM 'string'
  OR naijue_erp.source_review_utf16_length_v1(source->>'source_key')>65536
  OR source->>'reason' IS DISTINCT FROM 'WAREHOUSE_UNRESOLVED'
  OR coalesce(source->>'grouping','') NOT IN ('COMPLETE_GROUP','ORPHAN','AMBIGUOUS') THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_SOURCE_SHAPE' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY ARRAY['group_key','raw_warehouse_value','reliable_original_hall_evidence','normalization_version'] LOOP
  IF jsonb_typeof(source->field) NOT IN ('string','null')
   OR (source->field<>'null'::jsonb AND (naijue_erp.source_review_utf16_length_v1(source->>field)>
     CASE field WHEN 'normalization_version' THEN 256 ELSE 65536 END
    OR (field<>'raw_warehouse_value' AND length(source->>field)=0))) THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_ORIGINAL_STRING_OR_NULL' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF source->>'grouping'='COMPLETE_GROUP' AND (source->'group_key'='null'::jsonb OR length(source->>'group_key')=0
  OR (source->>'source_entity_type'='SALES_HEADER' AND source->>'source_key' IS DISTINCT FROM source->>'group_key')) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_COMPLETE_GROUP_KEY' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(source->'raw_fields') IS DISTINCT FROM 'object'
  OR jsonb_typeof(source->'normalized_fields') NOT IN ('object','null')
  OR (source->'normalized_fields'='null'::jsonb) IS DISTINCT FROM (source->'normalization_version'='null'::jsonb)
  OR (source->'normalization_version'<>'null'::jsonb AND length(source->>'normalization_version')=0) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_RAW_NORMALIZED_SEPARATION' USING ERRCODE='23514'; END IF;
 FOREACH field IN ARRAY ARRAY['raw_fields','normalized_fields'] LOOP
  cells:=source->field;
  IF cells='null'::jsonb THEN CONTINUE; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(cells))>2048 THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_FIELD_COUNT' USING ERRCODE='23514'; END IF;
  FOR cell IN SELECT key,value FROM jsonb_each(cells) LOOP
   IF naijue_erp.source_review_utf16_length_v1(cell.key) NOT BETWEEN 1 AND 1024
    OR cell.key IN ('__proto__','prototype','constructor') OR jsonb_typeof(cell.value) NOT IN ('string','null')
    OR (cell.value<>'null'::jsonb AND naijue_erp.source_review_utf16_length_v1(cell.value#>>'{}')>262144) THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_CELL_KEY_OR_VALUE' USING ERRCODE='23514'; END IF;
  END LOOP;
 END LOOP;
 ref:=source->'source_ref';
 PERFORM naijue_erp.source_review_keys_v1(ref,ARRAY['file_sha256','sheet','row','occurrence']);
 IF jsonb_typeof(ref->'file_sha256') IS DISTINCT FROM 'string' OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
  OR (ref->'sheet'<>'null'::jsonb AND naijue_erp.source_review_utf16_length_v1(ref->>'sheet') NOT BETWEEN 1 AND 1024)
  OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number'
  OR (ref->>'row')::numeric NOT BETWEEN 1 AND 2147483647 OR trunc((ref->>'row')::numeric)<>(ref->>'row')::numeric
  OR jsonb_typeof(ref->'occurrence') IS DISTINCT FROM 'number'
  OR (ref->>'occurrence')::numeric NOT BETWEEN 0 AND 2147483647 OR trunc((ref->>'occurrence')::numeric)<>(ref->>'occurrence')::numeric THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_ORIGINAL_OCCURRENCE_REQUIRED' USING ERRCODE='23514'; END IF;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_wrapper_v1(source_namespace text, item jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE source jsonb; tuple jsonb; key text;
BEGIN
 PERFORM naijue_erp.source_review_keys_v1(item,ARRAY['id','occurrence_key','source_record_sha256','source_hash_preimage','source']);
 source:=item->'source'; PERFORM naijue_erp.source_review_source_v1(source);
 key:=naijue_erp.source_review_occurrence_v1(source_namespace,source);
 tuple:=jsonb_build_array(source_namespace,source->'source_entity_type',source->'source_key',source->'group_key',
  source->'source_ref'->'file_sha256',source->'source_ref'->'sheet',source->'source_ref'->'row',source->'source_ref'->'occurrence',
  source->'raw_fields',source->'normalized_fields',source->'normalization_version',source->'raw_warehouse_value',
  source->'reliable_original_hall_evidence',source->'reason',source->'grouping');
 IF item->>'occurrence_key' IS DISTINCT FROM key OR item->>'id' IS DISTINCT FROM naijue_erp.source_review_record_id_v1(key)::text
  OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'occurrence_key') IS DISTINCT FROM 'string'
  OR jsonb_typeof(item->'source_record_sha256') IS DISTINCT FROM 'string'
  OR jsonb_typeof(item->'source_hash_preimage') IS DISTINCT FROM 'string'
  OR octet_length(convert_to(item->>'source_hash_preimage','UTF8'))>1048576
  OR ((item->>'source_hash_preimage') IS JSON ARRAY WITH UNIQUE KEYS) IS DISTINCT FROM true
  OR (item->>'source_hash_preimage')::jsonb IS DISTINCT FROM tuple
  OR encode(sha256(convert_to(item->>'source_hash_preimage','UTF8')),'hex') IS DISTINCT FROM item->>'source_record_sha256' THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_EXACT_ORIGINAL_HASH_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN source;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_approval_v1(batch uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE stage jsonb; segment record; bytes bytea:=''::bytea; part bytea; text_value text; approved jsonb;
BEGIN
 SELECT after_values->'request' INTO STRICT stage FROM naijue_erp.audit_change
  WHERE object_type='IMPORT' AND object_id=batch AND after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
   AND after_values->>'phase'='REVIEW_STAGE';
 FOR segment IN SELECT after_values->'request'->'payload' AS payload FROM naijue_erp.audit_change
  WHERE object_type='IMPORT' AND object_id=batch AND after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
   AND after_values->>'phase'='REVIEW_APPROVAL' ORDER BY new_version LOOP
  part:=decode(segment.payload->>'bytes_base64','base64');
  IF (segment.payload->>'offset')::integer<>octet_length(bytes) OR octet_length(part) NOT BETWEEN 1 AND 1048576
   OR replace(encode(part,'base64'),E'\n','') IS DISTINCT FROM segment.payload->>'bytes_base64' THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_SEGMENT_CONTIGUITY' USING ERRCODE='23514'; END IF;
  bytes:=bytes||part;
  IF octet_length(bytes)>(stage->'payload'->>'approval_bytes')::integer OR octet_length(bytes)>67108864 THEN
   RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_BYTE_OVERFLOW' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF octet_length(bytes) IS DISTINCT FROM (stage->'payload'->>'approval_bytes')::integer
  OR encode(sha256(bytes),'hex') IS DISTINCT FROM stage->>'approval_sha256' THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_COMPLETE_EXTERNAL_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
 text_value:=convert_from(bytes,'UTF8');
 IF left(text_value,1)=chr(65279) OR position(chr(13) IN text_value)>0
  OR (text_value IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_UTF8_JSON_REQUIRED' USING ERRCODE='23514'; END IF;
 approved:=text_value::jsonb;
 PERFORM naijue_erp.source_review_keys_v1(approved,ARRAY['format_version','source_namespace','package_manifest_sha256','records']);
 IF approved->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_APPROVAL_V1'
  OR jsonb_typeof(approved->'source_namespace') IS DISTINCT FROM 'string' OR length(approved->>'source_namespace')>256
  OR approved->>'source_namespace' IS DISTINCT FROM stage->>'source_namespace'
  OR approved->>'package_manifest_sha256' IS DISTINCT FROM stage->>'package_manifest_sha256'
  OR jsonb_typeof(approved->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(approved->'records') NOT BETWEEN 1 AND 250000 THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_APPROVAL_SCOPE' USING ERRCODE='23514'; END IF;
 RETURN approved;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_expected_v1(approved jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE source jsonb; counts jsonb;
BEGIN
 FOR source IN SELECT value FROM jsonb_array_elements(approved->'records') LOOP
  PERFORM naijue_erp.source_review_source_v1(source);
 END LOOP;
 IF (SELECT count(DISTINCT naijue_erp.source_review_occurrence_v1(approved->>'source_namespace',value))
  FROM jsonb_array_elements(approved->'records'))<>jsonb_array_length(approved->'records') THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_DUPLICATE_OCCURRENCE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT value->>'group_key' FROM jsonb_array_elements(approved->'records')
  WHERE value->>'grouping'='COMPLETE_GROUP' GROUP BY value->>'group_key'
  HAVING count(*) FILTER(WHERE value->>'source_entity_type'='SALES_HEADER')<>1)
  OR EXISTS(SELECT value->>'group_key' FROM jsonb_array_elements(approved->'records')
   WHERE value->'group_key'<>'null'::jsonb GROUP BY value->>'group_key'
   HAVING bool_or(value->>'grouping'='COMPLETE_GROUP') AND bool_or(value->>'grouping'<>'COMPLETE_GROUP')) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_GROUP_CLOSURE' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('occurrences',count(*),'headers',count(*) FILTER(WHERE value->>'source_entity_type'='SALES_HEADER'),
  'lines',count(*) FILTER(WHERE value->>'source_entity_type'='SALES_LINE'),
  'settlements',count(*) FILTER(WHERE value->>'source_entity_type'='SALES_SETTLEMENT'),
  'known_groups',count(DISTINCT value->>'group_key') FILTER(WHERE value->>'grouping'='COMPLETE_GROUP'),
  'ungrouped_occurrences',count(*) FILTER(WHERE value->>'grouping'<>'COMPLETE_GROUP')) INTO counts
  FROM jsonb_array_elements(approved->'records');
 RETURN counts;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_operation_v1(operation uuid, current_only boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; request jsonb; phase text;
BEGIN
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=operation;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 request:=a.after_values->'request';phase:=request->>'phase';
 PERFORM naijue_erp.source_review_keys_v1(request,ARRAY['protocol','operation_id','request_key','batch_id','expected_sequence',
  'source_namespace','package_manifest_sha256','approval_sha256','phase','payload']);
 PERFORM naijue_erp.source_review_keys_v1(a.after_values,ARRAY['profile','phase','request','checkpoint']);
 IF a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
  OR a.object_type IS DISTINCT FROM 'IMPORT' OR r.target_type IS DISTINCT FROM 'IMPORT'
  OR a.object_id IS DISTINCT FROM r.target_id OR a.action IS DISTINCT FROM r.action
  OR a.action IS DISTINCT FROM CASE phase WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END
  OR coalesce(phase,'') NOT IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL')
  OR a.after_values->>'profile' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  OR request->>'protocol' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  OR a.after_values->>'phase' IS DISTINCT FROM phase OR r.status IS DISTINCT FROM 'COMMITTED'
  OR a.occurred_at IS DISTINCT FROM r.completed_at OR r.created_at IS DISTINCT FROM r.completed_at
  OR request->>'operation_id' IS DISTINCT FROM r.id::text OR request->>'batch_id' IS DISTINCT FROM r.target_id::text
  OR request->>'request_key' IS DISTINCT FROM r.request_key
  OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to('SOURCE_REVIEW:'||request::text,'UTF8')),'hex')
  OR r.result_data->>'operationId' IS DISTINCT FROM r.id::text OR r.result_data->>'batchId' IS DISTINCT FROM r.target_id::text
  OR r.result_data->>'phase' IS DISTINCT FROM phase OR r.result_data->>'profile' IS DISTINCT FROM request->>'protocol'
  OR r.result_data->>'approvalSha256' IS DISTINCT FROM request->>'approval_sha256'
  OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM request->>'package_manifest_sha256'
  OR r.result_data->'sequence' IS DISTINCT FROM a.after_values->'checkpoint'->'sequence'
  OR r.result_data->'cursor' IS DISTINCT FROM a.after_values->'checkpoint'->'cursor'
  OR r.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
  OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1
  OR a.old_version IS DISTINCT FROM CASE phase WHEN 'REVIEW_STAGE' THEN NULL ELSE (request->>'expected_sequence')::integer+1 END THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_OPERATION_CLOSURE' USING ERRCODE='23514'; END IF;
 IF current_only AND (a.occurred_at IS DISTINCT FROM transaction_timestamp()
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE id=a.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
  OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
   LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
   AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled))) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_CURRENT_ADMIN_PREPARED_OPERATION' USING ERRCODE='42501'; END IF;
 RETURN a.after_values;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_transition_v1(next_batch jsonb, prior_batch jsonb, event text, final_check boolean) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE a naijue_erp.audit_change%ROWTYPE; prepared jsonb; request jsonb; cp jsonb; old_cp jsonb; stage jsonb;
BEGIN
 PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
 IF event NOT IN ('INSERT','UPDATE') OR next_batch->>'inventory_mode' IS DISTINCT FROM 'SOURCE_REVIEW'
  OR next_batch->>'mapping_version' IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_V1'
  OR next_batch->'cutoff_at' IS DISTINCT FROM 'null'::jsonb OR next_batch->'completed_at' IS DISTINCT FROM 'null'::jsonb
  OR next_batch->'history_payload_hash' IS DISTINCT FROM 'null'::jsonb
  OR next_batch->'history_expected_counts' IS DISTINCT FROM 'null'::jsonb
  OR next_batch->'history_actual_counts' IS DISTINCT FROM 'null'::jsonb
  OR next_batch->'history_validation_passed' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_PROFILE' USING ERRCODE='23514'; END IF;
 cp:=next_batch->'checkpoint';old_cp:=prior_batch->'checkpoint';
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=(next_batch->>'id')::uuid
  AND new_version=(cp->>'sequence')::integer+1;
 prepared:=naijue_erp.source_review_operation_v1(a.operation_id,true);request:=prepared->'request';
 IF prepared->'checkpoint' IS DISTINCT FROM cp OR a.before_values IS DISTINCT FROM old_cp
  OR request->>'source_namespace' IS DISTINCT FROM next_batch->>'source_name'
  OR request->>'package_manifest_sha256' IS DISTINCT FROM next_batch->>'source_hash'
  OR (event='INSERT' AND (request->>'phase' IS DISTINCT FROM 'REVIEW_STAGE' OR cp->'sequence'<>'0'::jsonb
   OR cp->'cursor'<>'0'::jsonb OR next_batch->>'status' IS DISTINCT FROM 'STAGED'))
  OR (event='UPDATE' AND ((next_batch-ARRAY['status','checkpoint']) IS DISTINCT FROM (prior_batch-ARRAY['status','checkpoint'])
   OR cp->'expected' IS DISTINCT FROM old_cp->'expected' OR prior_batch->>'status'='PASSED'
   OR (cp->>'sequence')::integer<>(old_cp->>'sequence')::integer+1
   OR request->'expected_sequence' IS DISTINCT FROM old_cp->'sequence')) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_EXACT_PREPARED_TRANSITION' USING ERRCODE='23514'; END IF;
 SELECT after_values->'request' INTO STRICT stage FROM naijue_erp.audit_change WHERE object_type='IMPORT'
  AND object_id=a.object_id AND after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' AND after_values->>'phase'='REVIEW_STAGE';
 IF request->>'approval_sha256' IS DISTINCT FROM stage->>'approval_sha256'
  OR cp->'expected' IS DISTINCT FROM stage->'payload'->'expected'
  OR next_batch->>'source_manifest_ref' IS DISTINCT FROM stage->'payload'->>'source_manifest_ref'
  OR next_batch->>'status' IS DISTINCT FROM CASE request->>'phase' WHEN 'REVIEW_STAGE' THEN 'STAGED' WHEN 'REVIEW_SEAL' THEN 'PASSED' ELSE 'VALIDATING' END
  OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE import_batch_id=a.object_id)
  OR EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE import_batch_id=a.object_id)
  OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=a.object_id OR operation_id=a.operation_id)
  OR EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=a.object_id AND
   (status<>'QUARANTINED' OR target_type IS NOT NULL OR target_id IS NOT NULL OR reviewed_at IS NOT NULL)) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_NO_BUSINESS_EFFECT' USING ERRCODE='23514'; END IF;
 IF final_check THEN
  PERFORM naijue_erp.source_review_complete_operation_v1(a.operation_id);
 END IF;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_record_proof_v1(source_row jsonb, current_only boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE b naijue_erp.import_batch%ROWTYPE; pointer jsonb; prepared jsonb; item jsonb; source jsonb;
BEGIN
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=(source_row->>'import_batch_id')::uuid;
 pointer:=(source_row->>'decision_reason')::jsonb;
 PERFORM naijue_erp.source_review_keys_v1(pointer,ARRAY['format','operationId','recordOrdinal']);
 IF pointer->>'format' IS DISTINCT FROM 'SOURCE_REVIEW_POINTER_V1'
  OR jsonb_typeof(pointer->'recordOrdinal') IS DISTINCT FROM 'number' OR (pointer->>'recordOrdinal' ~ '^(0|[1-9][0-9]{0,2})$') IS DISTINCT FROM true
  OR b.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' OR b.mapping_version IS DISTINCT FROM 'HISTORICAL_SALES_SOURCE_REVIEW_V1'
  OR source_row->>'status' IS DISTINCT FROM 'QUARANTINED' OR source_row->'target_type' IS DISTINCT FROM 'null'::jsonb
  OR source_row->'target_id' IS DISTINCT FROM 'null'::jsonb OR source_row->'reviewed_at' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_IMMUTABLE_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
 prepared:=naijue_erp.source_review_operation_v1((pointer->>'operationId')::uuid,current_only);
 item:=prepared->'request'->'payload'->'records'->(pointer->>'recordOrdinal')::integer;
 source:=naijue_erp.source_review_wrapper_v1(b.source_name,item);
 IF prepared->>'phase' IS DISTINCT FROM 'REVIEW_CAPTURE' OR prepared->'request'->>'batch_id' IS DISTINCT FROM b.id::text
  OR source_row->>'id' IS DISTINCT FROM item->>'id' OR source_row->>'source_system' IS DISTINCT FROM b.source_name
  OR source_row->>'source_entity_type' IS DISTINCT FROM source->>'source_entity_type'
  OR source_row->>'source_key' IS DISTINCT FROM item->>'occurrence_key'
  OR source_row->>'source_record_hash' IS DISTINCT FROM item->>'source_record_sha256'
  OR source_row->>'source_file_ref' IS DISTINCT FROM (source->'source_ref')::text THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_POINTER_RECORD_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN item;
END $sr$;

CREATE FUNCTION naijue_erp.source_review_complete_operation_v1(operation uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $sr$
DECLARE prepared jsonb; request jsonb; b naijue_erp.import_batch%ROWTYPE; rec record; claimed jsonb; actual jsonb;
BEGIN
 prepared:=naijue_erp.source_review_operation_v1(operation,true);request:=prepared->'request';
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 IF b.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' OR request->>'source_namespace' IS DISTINCT FROM b.source_name
  OR request->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_OPERATION_BATCH_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT coalesce(jsonb_agg(s.id::text ORDER BY s.id::text),'[]'::jsonb) INTO actual FROM naijue_erp.import_record s
  WHERE s.import_batch_id=b.id AND s.decision_reason::jsonb->>'operationId'=operation::text;
 SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO claimed
  FROM jsonb_array_elements(CASE request->>'phase' WHEN 'REVIEW_CAPTURE' THEN request->'payload'->'records' ELSE '[]'::jsonb END);
 IF actual IS DISTINCT FROM claimed OR (SELECT result_data->'sourceRecordIds' FROM naijue_erp.operation_receipt WHERE id=operation) IS DISTINCT FROM claimed THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_OPERATION_OCCURRENCE_SET' USING ERRCODE='23514'; END IF;
 FOR rec IN SELECT to_jsonb(s) AS source_row FROM naijue_erp.import_record s WHERE s.import_batch_id=b.id
  AND s.decision_reason::jsonb->>'operationId'=operation::text LOOP
  PERFORM naijue_erp.source_review_record_proof_v1(rec.source_row,true);
 END LOOP;
 IF (prepared->'checkpoint'->>'cursor')::integer<>(SELECT count(*) FROM naijue_erp.import_record WHERE import_batch_id=b.id)
  OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE import_batch_id=b.id)
  OR EXISTS(SELECT 1 FROM naijue_erp.transfer_header WHERE import_batch_id=b.id)
  OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=b.id OR operation_id=operation) THEN
  RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_COUNT_OR_EFFECT' USING ERRCODE='23514'; END IF;
END $sr$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_import_batch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN
    PERFORM naijue_erp.cutoff_import_lock();
    IF TG_OP='DELETE' OR NEW.inventory_mode<>'CUTOFF_STOCK_BASELINE' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
      IF NEW.status<>'STAGED' OR NEW.checkpoint->>'sequence' IS DISTINCT FROM '0' OR NEW.checkpoint->>'cursor' IS DISTINCT FROM '0' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch) THEN RAISE EXCEPTION 'STANDARD_BASELINE_MUST_START_EMPTY_ZERO' USING ERRCODE='23514'; END IF;
    ELSE
      PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
      IF OLD.status IN ('IMPORTED','FAILED') OR (to_jsonb(NEW)-ARRAY['checkpoint','status','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['checkpoint','status','completed_at'])
       OR NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' OR (NEW.checkpoint->>'sequence')::numeric<>(OLD.checkpoint->>'sequence')::numeric+1
       OR (NEW.checkpoint->>'cursor')::numeric<(OLD.checkpoint->>'cursor')::numeric OR NEW.status NOT IN ('VALIDATING','IMPORTED') THEN RAISE EXCEPTION 'STANDARD_BASELINE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false); RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'import batch is retained' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'STAGED' OR NEW.checkpoint->>'sequence' <> '0' OR NEW.checkpoint->>'cursor' <> '0'
      OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
      RAISE EXCEPTION 'import must start staged at a stable zero checkpoint' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD.status IN ('IMPORTED', 'FAILED') OR ROW(NEW.id, NEW.source_name, NEW.source_manifest_ref, NEW.source_hash, NEW.cutoff_at, NEW.mapping_version, NEW.inventory_mode, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.source_name, OLD.source_manifest_ref, OLD.source_hash, OLD.cutoff_at, OLD.mapping_version, OLD.inventory_mode, OLD.created_at)
      OR (NEW.checkpoint->'expected' IS DISTINCT FROM OLD.checkpoint->'expected' AND NOT (OLD.history_payload_hash IS NULL AND OLD.history_expected_counts IS NULL AND OLD.checkpoint->'expected'='{}'::jsonb AND NEW.history_payload_hash IS NOT NULL AND NEW.history_expected_counts IS NOT NULL AND NEW.status='STAGED'))
      OR (NEW.checkpoint->>'sequence')::bigint <> (OLD.checkpoint->>'sequence')::bigint + 1
      OR (NEW.checkpoint->>'cursor')::bigint < (OLD.checkpoint->>'cursor')::bigint THEN
      RAISE EXCEPTION 'immutable source or invalid checkpoint transition' USING ERRCODE = '23514'; END IF;
    IF NEW.status = 'IMPORTED' THEN PERFORM naijue_erp.validate_import_publish(NEW.id, NEW.checkpoint); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_history_typed_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE m record;plan jsonb;documents jsonb;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_import_accounting_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE kind text; actual bigint;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_header_native_reference_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_history_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE kind text; actual bigint;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_native_catalogue_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_native_payment_publication"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_successor_publication26"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE original_source record; target uuid; matched bigint;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,false);
    RETURN NEW;
  END IF;

 -- STANDARD27_BRANCH_BEGIN
 IF NEW.inventory_mode='DOCUMENT_CONVERSION' AND (current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash)) THEN
  DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    IF NEW.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
      OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      AND inventory_mode='CUTOFF_STOCK_BASELINE' AND status='IMPORTED'
      AND source_name=NEW.source_name AND source_hash=NEW.source_hash AND cutoff_at=NEW.cutoff_at;
    SELECT aa.* INTO STRICT a FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
      WHERE rr.target_type='IMPORT' AND rr.target_id=b.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
      AND rr.status='COMMITTED' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.object_type='IMPORT' AND aa.object_id=b.id AND aa.action=rr.action
      AND aa.actor_account_id=rr.actor_account_id AND aa.occurred_at=rr.completed_at;
    IF a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM NEW.id::text
      OR a.after_values->'request'->'payload'->'expected_documents' IS DISTINCT FROM NEW.checkpoint->'expected'
      OR a.after_values->'request'->>'namespace' IS DISTINCT FROM NEW.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM NEW.source_hash THEN
      RAISE EXCEPTION 'STANDARD27_DOCUMENT_INITIAL_PLAN_INVALID' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      -- Stage is inserted before its receipt/audit. Only immutable INITIALIZE
      -- plan authorizes this exact identity; existing deferred validator closes it.
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,NULL,TG_OP,false);
    ELSE

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (object_id=NEW.id AND new_version=(NEW.checkpoint->>'sequence')::integer+1));
    IF a.after_values ? 'whole_package_v2' THEN PERFORM naijue_erp.standard_whole_package_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid); END IF;
    SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id
      AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
    phase_name:=a.after_values->>'phase';
    IF phase_name IS NULL OR phase_name NOT IN ('MASTER','DOCUMENTS','DOCUMENT_PUBLISH')
      OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.object_id IS DISTINCT FROM r.target_id OR r.target_type IS DISTINCT FROM 'IMPORT'
      OR a.action IS DISTINCT FROM r.action OR r.status IS DISTINCT FROM 'COMMITTED'
      OR r.action IS DISTINCT FROM (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
      OR r.completed_at IS DISTINCT FROM transaction_timestamp() OR a.occurred_at IS DISTINCT FROM r.completed_at
      OR r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR r.result_data->>'phase' IS DISTINCT FROM phase_name
      OR a.after_values->>'origin' IS DISTINCT FROM 'STANDARD_SOURCE'
      OR a.after_values->'request'->>'protocol' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
      OR a.after_values->'request'->>'operation_id' IS DISTINCT FROM r.id::text
      OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
      OR a.after_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
      OR r.request_hash IS DISTINCT FROM encode(sha256(convert_to(
        (CASE phase_name WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' ELSE phase_name END)||':'||(a.after_values->'request')::text,'UTF8')),'hex')
      OR jsonb_typeof(a.after_values->'records') IS DISTINCT FROM 'array'
      OR jsonb_typeof(r.result_data->'sourceRecordIds') IS DISTINCT FROM 'array'
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id
        LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id WHERE u.id=r.actor_account_id AND u.login_enabled
        AND s.role='ADMIN' AND s.employment_status='在职' AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_OPERATION_INVALID' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
    IF a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
      OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
      OR (a.after_values->'request'->>'cutoff_at')::timestamptz IS DISTINCT FROM b.cutoff_at
      OR r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
      OR r.result_data->>'planSha256' IS DISTINCT FROM a.after_values->'request'->>'plan_sha256'
      OR a.new_version IS DISTINCT FROM (a.after_values->'checkpoint'->>'sequence')::integer+1 THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_TARGET_INVALID' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(value->>'id' ORDER BY value->>'id'),'[]'::jsonb) INTO actual_ids
      FROM jsonb_array_elements(a.after_values->'records');
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO claimed_ids
      FROM jsonb_array_elements_text(r.result_data->'sourceRecordIds');
    IF actual_ids IS DISTINCT FROM claimed_ids OR jsonb_array_length(actual_ids)=0
      OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(actual_ids))<>jsonb_array_length(actual_ids) THEN
      RAISE EXCEPTION 'STANDARD27_PREPARED_RECORD_SET_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') LOOP
      SELECT decision_reason::jsonb INTO pointer FROM naijue_erp.import_record WHERE id=(item->>'id')::uuid AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'STANDARD27_CURRENT_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
      IF pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',r.id) THEN
        RAISE EXCEPTION 'STANDARD27_EXACT_POINTER_REQUIRED' USING ERRCODE='23514'; END IF;
      proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
      IF proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR proof->>'operation_id' IS DISTINCT FROM r.id::text OR proof->>'batch_id' IS DISTINCT FROM b.id::text THEN
        RAISE EXCEPTION 'STANDARD27_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;

      IF phase_name NOT IN ('DOCUMENTS','DOCUMENT_PUBLISH') OR r.target_id IS DISTINCT FROM NEW.id
        OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint
        OR a.before_values IS DISTINCT FROM OLD.checkpoint
        OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'STANDARD27_DOCUMENT_PREPARED_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
      PERFORM naijue_erp.assert_document_conversion_batch(NEW,to_jsonb(OLD),TG_OP,NOT(a.after_values ? 'whole_package_v2' AND NEW.status='VALIDATING'));
    END IF;
    RETURN NEW;
  END;
 END IF;
 -- STANDARD27_BRANCH_END
 -- This profile is admitted only before any application/source rows exist.
 -- The original standard document branch above remains byte-identical.
 -- A document that failed that branch cannot fall through to a legacy probe.
 IF NEW.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE'
   OR NEW.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
   OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FRESH27_STANDARD_PUBLICATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- INITIALIZE may run before its receipt exists; the existing prepared batch
 -- and deferred validators still close the exact baseline operation at COMMIT.
 PERFORM naijue_erp.standard_import_identity(NULL,CASE current_setting('role')
   WHEN 'erp_unified27_initializer_2393dbc6db9581c2' THEN 'INITIALIZER' ELSE 'ROLE_IMPORTER' END);
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."validate_import_batch_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $_$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true);
    RETURN NULL;
  END IF;
  SELECT x.operation_id INTO core_operation FROM naijue_erp.audit_change x WHERE x.object_type='IMPORT' AND x.object_id=NEW.id AND x.new_version=(NEW.checkpoint->>'sequence')::integer+1 AND x.after_values->>'profile'='STANDARD_IMPORT_SQL_V1';
  IF FOUND THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=core_operation;
    IF a.before_values IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.checkpoint END) OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint THEN RAISE EXCEPTION 'STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_standard_import_operation(core_operation); RETURN NULL;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN RAISE EXCEPTION 'STANDARD_BATCH_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED' USING ERRCODE='23514';
END;
$_$;

CREATE OR REPLACE FUNCTION "naijue_erp"."validate_import_accounting_checkpoint_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  -- SOURCE_REVIEW branch: one strict prepared-operation validator in every attached guard.
  IF TG_OP='DELETE' AND OLD.inventory_mode='SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_BATCH_RETAINED' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.inventory_mode='SOURCE_REVIEW' AND NEW.inventory_mode IS DISTINCT FROM 'SOURCE_REVIEW' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_MODE_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP<>'DELETE' AND NEW.inventory_mode='SOURCE_REVIEW' THEN
    PERFORM naijue_erp.source_review_transition_v1(to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true);
    RETURN NULL;
  END IF;
  SELECT x.operation_id INTO core_operation FROM naijue_erp.audit_change x WHERE x.object_type='IMPORT' AND x.object_id=NEW.id AND x.new_version=(NEW.checkpoint->>'sequence')::integer+1 AND x.after_values->>'profile'='STANDARD_IMPORT_SQL_V1';
  IF FOUND THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=core_operation;
    IF a.before_values IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.checkpoint END) OR a.after_values->'checkpoint' IS DISTINCT FROM NEW.checkpoint THEN RAISE EXCEPTION 'STANDARD_BATCH_ACTUAL_TRANSITION_DIFFERS' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.assert_standard_import_operation(core_operation); RETURN NULL;
  END IF;
  IF NEW.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' THEN RAISE EXCEPTION 'STANDARD_BATCH_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    PERFORM naijue_erp.assert_document_conversion_batch(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,TG_OP,true); RETURN NULL;
  END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_BATCH_RETIRED' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."guard_import_record"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='SOURCE_REVIEW') THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    PERFORM 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND status IN ('STAGED','VALIDATING') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_REVIEW_CAPTURE_CLOSED' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE source_system=NEW.source_system AND source_entity_type=NEW.source_entity_type AND source_key=NEW.source_key) THEN
      RAISE EXCEPTION 'SOURCE_REVIEW_OCCURRENCE_ALREADY_RETAINED' USING ERRCODE='23505'; END IF;
    PERFORM naijue_erp.source_review_record_proof_v1(to_jsonb(NEW),true);
    RETURN NEW;
  END IF;
  IF NEW.decision_reason LIKE '{%"SOURCE_REVIEW_POINTER_V1"%' THEN
    RAISE EXCEPTION 'SOURCE_REVIEW_POINTER_WRONG_BATCH' USING ERRCODE='23514'; END IF;
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.status NOT IN ('STAGED','VALIDATING') OR NEW.status<>'IMPORTED' OR NEW.source_system IS DISTINCT FROM b.source_name OR NEW.reviewed_at IS DISTINCT FROM transaction_timestamp()
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
       CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item
       WHERE a.operation_id=(NEW.decision_reason::jsonb->>'operationId')::uuid AND a.object_type='IMPORT' AND a.object_id=b.id AND a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
        AND a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint AND r.actor_account_id=a.actor_account_id AND r.completed_at=NEW.reviewed_at
        AND item->>'id'=NEW.id::text AND item->>'entity_type'=NEW.source_entity_type AND item->>'source_key'=NEW.source_key AND item->>'target_type'=NEW.target_type
        AND item->>'target_id'=NEW.target_id::text AND item->>'source_hash'=NEW.source_record_hash AND item->>'file_ref'=NEW.source_file_ref) THEN
      RAISE EXCEPTION 'STANDARD_SOURCE_PREPARED_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='DOCUMENT_CONVERSION') THEN
    PERFORM naijue_erp.cutoff_import_lock();
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
    PERFORM naijue_erp.import_source_key_lock(NEW.source_system,NEW.source_entity_type,NEW.source_key);
    IF b.mapping_version<>'DOCUMENT_CONVERSION_V1' OR b.status NOT IN ('STAGED','VALIDATING') OR NEW.source_system<>b.source_name
      OR NEW.target_type NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH')
      OR NEW.status NOT IN ('IMPORTED','EXCLUDED') OR (NEW.status='IMPORTED' AND NEW.reviewed_at IS NULL)
      OR (NEW.status='EXCLUDED' AND (NEW.target_id IS NOT NULL OR coalesce(length(btrim(NEW.decision_reason)),0)=0)) THEN
      RAISE EXCEPTION 'closed standard conversion identity/decision scope mismatch' USING ERRCODE='23514'; END IF;
    IF NEW.status='IMPORTED' THEN
      IF NEW.target_type='SALES_HEADER' THEN PERFORM 1 FROM naijue_erp.sales_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_LINE' THEN PERFORM 1 FROM naijue_erp.sales_line x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='SALES_SETTLEMENT' THEN PERFORM 1 FROM naijue_erp.sales_settlement x JOIN naijue_erp.sales_header h ON h.id=x.sales_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_HEADER' THEN PERFORM 1 FROM naijue_erp.transfer_header WHERE id=NEW.target_id AND import_batch_id=b.id;
      ELSIF NEW.target_type='TRANSFER_LINE' THEN PERFORM 1 FROM naijue_erp.transfer_line x JOIN naijue_erp.transfer_header h ON h.id=x.transfer_id WHERE x.id=NEW.target_id AND h.import_batch_id=b.id;
      ELSIF NEW.target_type='IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id=NEW.target_id AND id=b.id;
      END IF;
      IF NOT FOUND THEN RAISE EXCEPTION 'ordinary conversion target identity/owner does not exist' USING ERRCODE='23503'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.import_batch_id FOR UPDATE;
  IF b.status NOT IN ('STAGED', 'VALIDATING') OR EXISTS (SELECT 1 FROM naijue_erp.import_batch WHERE status = 'IMPORTED') THEN
    RAISE EXCEPTION 'import source scope is frozen' USING ERRCODE = '23514'; END IF;
  -- Cross-batch identity is the fixed namespace + source category + ORIGINAL key, never a filename.
  PERFORM naijue_erp.import_source_key_lock(b.source_name, NEW.source_entity_type, NEW.source_key);
  IF EXISTS (SELECT 1 FROM naijue_erp.import_record r JOIN naijue_erp.import_batch prior ON prior.id = r.import_batch_id
    WHERE prior.source_name = b.source_name AND r.source_entity_type = NEW.source_entity_type AND r.source_key = NEW.source_key) THEN
    RAISE EXCEPTION 'source identity already has an immutable destination; resume original batch' USING ERRCODE = '23505';
  END IF;
  IF NEW.status = 'IMPORTED' THEN
    IF NEW.target_type = 'WAREHOUSE' THEN PERFORM 1 FROM naijue_erp.warehouse WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'SKU' THEN PERFORM 1 FROM naijue_erp.sku WHERE id = NEW.target_id FOR KEY SHARE;
    ELSIF NEW.target_type = 'IMPORT_BATCH' THEN PERFORM 1 FROM naijue_erp.import_batch WHERE id = NEW.target_id AND id = b.id;
    ELSIF NEW.target_type = 'INVENTORY_LEDGER' THEN RETURN NEW; -- Reciprocal baseline/source check is deferred below.
    ELSE RAISE EXCEPTION 'unsupported import target' USING ERRCODE = '23514'; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'import target identity does not exist' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."validate_import_source_commit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE l naijue_erp.inventory_ledger%ROWTYPE; member_root uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id AND inventory_mode='SOURCE_REVIEW') THEN
    PERFORM naijue_erp.source_review_record_proof_v1(to_jsonb(NEW),true); RETURN NULL;
  END IF;
  IF NEW.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%' THEN
    PERFORM naijue_erp.standard_import_record_proof(NEW.id);
    SELECT (a.after_values->'whole_package_v2'->>'root_operation')::uuid INTO STRICT member_root
     FROM naijue_erp.audit_change a WHERE a.operation_id=(NEW.decision_reason::jsonb->>'operationId')::uuid;
    IF member_root IS NOT NULL THEN
     PERFORM naijue_erp.standard_whole_package_context_v2(member_root);
     -- Full typed/effect checks remain in the mandatory receipt and batch
     -- deferred triggers, not repeated for every source row in the same chunk.
     RETURN NULL;
    END IF;
    PERFORM naijue_erp.assert_standard_import_operation((NEW.decision_reason::jsonb->>'operationId')::uuid); RETURN NULL;
  END IF;
  IF NEW.target_type = 'INVENTORY_LEDGER' AND NEW.status = 'IMPORTED' THEN
    SELECT * INTO STRICT l FROM naijue_erp.inventory_ledger WHERE id = NEW.target_id;
    IF l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id IS DISTINCT FROM NEW.import_batch_id
      OR NEW.source_entity_type <> 'INVENTORY_BASELINE' THEN
      RAISE EXCEPTION 'source record does not point at its own immutable baseline' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "naijue_erp"."validate_import_operation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'naijue_erp', 'pg_temp'
    AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  IF NEW.result_data->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN
    PERFORM naijue_erp.source_review_complete_operation_v1(NEW.id); RETURN NULL;
  END IF;
  IF NEW.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN PERFORM naijue_erp.assert_standard_import_operation(NEW.id); RETURN NULL; END IF;
  RAISE EXCEPTION 'FRESH35_LEGACY_IMPORT_OPERATION_RETIRED' USING ERRCODE='23514';
END;
$$;
ALTER TABLE naijue_erp.import_batch ALTER COLUMN cutoff_at DROP NOT NULL;
ALTER TABLE naijue_erp.import_batch DROP CONSTRAINT import_batch_inventory_mode_check;
ALTER TABLE naijue_erp.import_batch ADD CONSTRAINT import_batch_inventory_mode_check CHECK (inventory_mode IN ('CUTOFF_STOCK_BASELINE','DOCUMENT_CONVERSION','SOURCE_REVIEW'));
ALTER TABLE naijue_erp.import_batch ADD CONSTRAINT source_review_mode_cutoff CHECK (
 CASE WHEN inventory_mode='SOURCE_REVIEW' THEN cutoff_at IS NULL AND mapping_version='HISTORICAL_SALES_SOURCE_REVIEW_V1'
  AND status IN ('STAGED','VALIDATING','PASSED') AND completed_at IS NULL AND history_payload_hash IS NULL
  AND history_expected_counts IS NULL AND history_actual_counts IS NULL AND NOT history_validation_passed
 ELSE cutoff_at IS NOT NULL AND mapping_version<>'HISTORICAL_SALES_SOURCE_REVIEW_V1' END IS TRUE);
ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK (
 CASE WHEN target_type='IMPORT' AND result_data->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN (
  jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','packageManifestSha256','approvalSha256','captureState']
  AND result_data-ARRAY['profile','operationId','batchId','sequence','cursor','status','ledgerEntryIds','sourceRecordIds','phase','packageManifestSha256','approvalSha256','captureState']='{}'::jsonb
  AND action=CASE result_data->>'phase' WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END
  AND result_data->>'phase' IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL')
  AND result_data->>'operationId'=id::text AND result_data->>'batchId'=target_id::text
  AND jsonb_typeof(result_data->'sequence')='number' AND result_data->>'sequence' ~ '^(0|[1-9][0-9]*)$'
  AND jsonb_typeof(result_data->'cursor')='number' AND result_data->>'cursor' ~ '^(0|[1-9][0-9]*)$'
  AND result_data->'ledgerEntryIds'='[]'::jsonb AND jsonb_typeof(result_data->'sourceRecordIds')='array'
  AND result_data->>'status'=CASE result_data->>'phase' WHEN 'REVIEW_STAGE' THEN 'STAGED' WHEN 'REVIEW_SEAL' THEN 'PASSED' ELSE 'VALIDATING' END
  AND result_data->>'captureState'=CASE result_data->>'phase' WHEN 'REVIEW_SEAL' THEN 'PENDING_REVIEW' ELSE 'CAPTURING' END
  AND result_data->>'packageManifestSha256' ~ '^[a-f0-9]{64}$' AND result_data->>'approvalSha256' ~ '^[a-f0-9]{64}$'
 ) IS TRUE ELSE ((
CASE
    WHEN (("target_type" = 'IMPORT'::"text") AND (("result_data" ->> 'profile'::"text") = 'STANDARD_IMPORT_SQL_V1'::"text")) THEN (("action" = ANY (ARRAY['IMPORT_INITIALIZE_CURRENT_ADMIN'::"text", 'IMPORT_STAGE'::"text", 'IMPORT_CHUNK'::"text", 'IMPORT_PUBLISH'::"text"])) AND ("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['profile'::"text", 'operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'sourceRecordIds'::"text", 'phase'::"text", 'planSha256'::"text", 'packageManifestSha256'::"text", 'baselineBatchId'::"text", 'documentBatchId'::"text"]) AND (("result_data" - ARRAY['profile'::"text", 'operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'sourceRecordIds'::"text", 'phase'::"text", 'planSha256'::"text", 'packageManifestSha256'::"text", 'baselineBatchId'::"text", 'documentBatchId'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['STAGED'::"text", 'VALIDATING'::"text", 'IMPORTED'::"text"])) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND ("jsonb_typeof"(("result_data" -> 'sourceRecordIds'::"text")) = 'array'::"text") AND (("result_data" ->> 'phase'::"text") = ANY (ARRAY['INITIALIZE'::"text", 'MASTER'::"text", 'KEYS'::"text", 'BASELINE_SEAL'::"text", 'DOCUMENT_STAGE'::"text", 'DOCUMENTS'::"text", 'DOCUMENT_PUBLISH'::"text"])) AND (("result_data" ->> 'planSha256'::"text") ~ '^[0-9a-f]{64}$'::"text") AND (("result_data" ->> 'packageManifestSha256'::"text") ~ '^[0-9a-f]{64}$'::"text"))
    ELSE (
    CASE
        WHEN ("target_type" = ANY (ARRAY['HISTORY_SALES'::"text", 'HISTORY_TRANSFER'::"text"])) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'dataset'::"text", 'kind'::"text", 'documentId'::"text", 'revisionId'::"text", 'version'::"text", 'ledgerEntryIds'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'dataset'::"text", 'kind'::"text", 'documentId'::"text", 'revisionId'::"text", 'version'::"text", 'ledgerEntryIds'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'dataset'::"text") = 'HISTORY'::"text") AND (("result_data" ->> 'kind'::"text") =
        CASE "target_type"
            WHEN 'HISTORY_SALES'::"text" THEN 'sales'::"text"
            ELSE 'transfers'::"text"
        END) AND (("result_data" ->> 'documentId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'revisionId'::"text")) = 'string'::"text") AND (("result_data" ->> 'revisionId'::"text") ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND (((("result_data" ->> 'version'::"text"))::numeric >= (2)::numeric) AND ((("result_data" ->> 'version'::"text"))::numeric <= (2147483647)::numeric)) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text"))
        ELSE (
        CASE
            WHEN (("target_type" = 'CATEGORY'::"text") AND ("action" = ANY (ARRAY['REORDER'::"text", 'UNDO_REORDER'::"text"]))) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text", 'order'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text", 'order'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'kind'::"text") = 'CATEGORY'::"text") AND ("jsonb_typeof"(("result_data" -> 'targetId'::"text")) = 'string'::"text") AND (("result_data" ->> 'targetId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'order'::"text")) = 'object'::"text") AND (("result_data" -> 'order'::"text") ?& ARRAY['parentId'::"text", 'undoOfOperationId'::"text", 'members'::"text"]) AND ((("result_data" -> 'order'::"text") - ARRAY['parentId'::"text", 'undoOfOperationId'::"text", 'members'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"((("result_data" -> 'order'::"text") -> 'members'::"text")) = 'array'::"text"))
            ELSE (
            CASE
                WHEN (("target_type" = 'IMPORT'::"text") AND ("action" = ANY (ARRAY['IMPORT_CORE_STAGE'::"text", 'IMPORT_BIND_FULL_SOURCE'::"text"]))) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'phase'::"text", 'coreSourceDigest'::"text", 'coreCounts'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text", 'phase'::"text", 'coreSourceDigest'::"text", 'coreCounts'::"text"]) = '{}'::"jsonb") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'sequence'::"text")) = 'number'::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'cursor'::"text")) = 'number'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'status'::"text") = 'STAGED'::"text") AND (("result_data" -> 'ledgerEntryIds'::"text") = '[]'::"jsonb") AND (("result_data" ->> 'phase'::"text") =
                CASE "action"
                    WHEN 'IMPORT_CORE_STAGE'::"text" THEN 'CORE_INITIALIZED_V1'::"text"
                    ELSE 'FULL_SOURCE_BOUND_V1'::"text"
                END) AND (("result_data" ->> 'coreSourceDigest'::"text") ~ '^[a-f0-9]{64}$'::"text") AND (("result_data" -> 'coreCounts'::"text") = '{"HALL": 22, "STAFF": 49, "CUSTOMER": 22, "WAREHOUSE": 22, "USER_ACCOUNT": 49}'::"jsonb"))
                ELSE (
                CASE
                    WHEN ("target_type" = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::"text"[])) THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND ("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'targetId'::"text", 'version'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND ("jsonb_typeof"(("result_data" -> 'kind'::"text")) = 'string'::"text") AND (("result_data" ->> 'kind'::"text") = "target_type") AND ("jsonb_typeof"(("result_data" -> 'targetId'::"text")) = 'string'::"text") AND (("result_data" ->> 'targetId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text"))
                    ELSE (
                    CASE
                        WHEN ("target_type" = 'IMPORT'::"text") THEN (("jsonb_typeof"("result_data") = 'object'::"text") AND (("result_data" - ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) = '{}'::"jsonb") AND ("result_data" ?& ARRAY['operationId'::"text", 'batchId'::"text", 'sequence'::"text", 'cursor'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND (("result_data" ->> 'batchId'::"text") = ("target_id")::"text") AND (("result_data" ->> 'sequence'::"text") ~ '^[0-9]+$'::"text") AND (("result_data" ->> 'cursor'::"text") ~ '^[0-9]+$'::"text") AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['STAGED'::"text", 'VALIDATING'::"text", 'IMPORTED'::"text"])))
                        ELSE ((("jsonb_typeof"("result_data") = 'object'::"text") AND
                        CASE
                            WHEN ("target_type" = ANY (ARRAY['SALES'::"text", 'TRANSFER'::"text"])) THEN (("result_data" ?& ARRAY['operationId'::"text", 'version'::"text", 'status'::"text", 'ledgerEntryIds'::"text"]) AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'operationId'::"text") IS DISTINCT FROM ("id")::"text")) AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'status'::"text")) = 'string'::"text") AND (("result_data" ->> 'status'::"text") = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'VOID'::"text"])) AND ("jsonb_typeof"(("result_data" -> 'ledgerEntryIds'::"text")) = 'array'::"text") AND
                            CASE "target_type"
                                WHEN 'SALES'::"text" THEN (("result_data" ? 'salesId'::"text") AND (NOT ("result_data" ? 'transferId'::"text")) AND ("jsonb_typeof"(("result_data" -> 'salesId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'salesId'::"text") IS DISTINCT FROM ("target_id")::"text")))
                                WHEN 'TRANSFER'::"text" THEN (("result_data" ? 'transferId'::"text") AND (NOT ("result_data" ? 'salesId'::"text")) AND ("jsonb_typeof"(("result_data" -> 'transferId'::"text")) = 'string'::"text") AND (NOT (("result_data" ->> 'transferId'::"text") IS DISTINCT FROM ("target_id")::"text")))
                                ELSE false
                            END)
                            ELSE (("result_data" ?& ARRAY['operationId'::"text", 'kind'::"text", 'partyId'::"text", 'version'::"text", 'code'::"text", 'enabled'::"text"]) AND (("result_data" - ARRAY['operationId'::"text", 'kind'::"text", 'partyId'::"text", 'version'::"text", 'code'::"text", 'enabled'::"text"]) = '{}'::"jsonb") AND ("jsonb_typeof"(("result_data" -> 'operationId'::"text")) = 'string'::"text") AND (("result_data" ->> 'operationId'::"text") = ("id")::"text") AND ("jsonb_typeof"(("result_data" -> 'kind'::"text")) = 'string'::"text") AND (("result_data" ->> 'kind'::"text") = "target_type") AND ("jsonb_typeof"(("result_data" -> 'partyId'::"text")) = 'string'::"text") AND (("result_data" ->> 'partyId'::"text") = ("target_id")::"text") AND ("jsonb_typeof"(("result_data" -> 'version'::"text")) = 'number'::"text") AND (("result_data" ->> 'version'::"text") ~ '^[1-9][0-9]*$'::"text") AND ("jsonb_typeof"(("result_data" -> 'code'::"text")) = 'string'::"text") AND ("length"("btrim"(("result_data" ->> 'code'::"text"))) > 0) AND ("jsonb_typeof"(("result_data" -> 'enabled'::"text")) = 'boolean'::"text"))
                        END) IS TRUE)
                    END IS TRUE)
                END IS TRUE)
            END IS TRUE)
        END IS TRUE)
    END IS TRUE)
END IS TRUE)) END IS TRUE);
ALTER TABLE naijue_erp.audit_change ADD CONSTRAINT source_review_audit_shape CHECK (
 CASE WHEN after_values->>'profile'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' THEN (
  object_type='IMPORT' AND jsonb_typeof(after_values)='object'
  AND after_values ?& ARRAY['profile','phase','request','checkpoint'] AND after_values-ARRAY['profile','phase','request','checkpoint']='{}'::jsonb
  AND after_values->>'phase' IN ('REVIEW_STAGE','REVIEW_APPROVAL','REVIEW_CAPTURE','REVIEW_SEAL')
  AND action=CASE after_values->>'phase' WHEN 'REVIEW_STAGE' THEN 'IMPORT_STAGE' ELSE 'IMPORT_CHUNK' END
  AND after_values->'request'->>'protocol'='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1'
  AND after_values->'request'->>'operation_id'=operation_id::text AND after_values->'request'->>'batch_id'=object_id::text
 ) IS TRUE ELSE true END);
ALTER POLICY standard_published_runtime ON naijue_erp.import_batch TO erp_unified27_runtime_2393dbc6db9581c2
 USING (naijue_erp.standard_business_ready() AND (inventory_mode<>'SOURCE_REVIEW'))
 WITH CHECK (naijue_erp.standard_business_ready() AND (inventory_mode<>'SOURCE_REVIEW'));
ALTER POLICY standard_published_runtime ON naijue_erp.import_record TO erp_unified27_runtime_2393dbc6db9581c2
 USING (naijue_erp.standard_business_ready() AND (EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=import_record.import_batch_id AND b.inventory_mode<>'SOURCE_REVIEW')))
 WITH CHECK (naijue_erp.standard_business_ready() AND (EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=import_record.import_batch_id AND b.inventory_mode<>'SOURCE_REVIEW')));
ALTER POLICY standard_published_runtime ON naijue_erp.audit_change TO erp_unified27_runtime_2393dbc6db9581c2
 USING (naijue_erp.standard_business_ready() AND ((object_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=audit_change.object_id AND b.inventory_mode<>'SOURCE_REVIEW'))))
 WITH CHECK (naijue_erp.standard_business_ready() AND ((object_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=audit_change.object_id AND b.inventory_mode<>'SOURCE_REVIEW'))));
ALTER POLICY standard_published_runtime ON naijue_erp.operation_receipt TO erp_unified27_runtime_2393dbc6db9581c2
 USING (naijue_erp.standard_business_ready() AND ((target_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=operation_receipt.target_id AND b.inventory_mode<>'SOURCE_REVIEW'))))
 WITH CHECK (naijue_erp.standard_business_ready() AND ((target_type<>'IMPORT' OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=operation_receipt.target_id AND b.inventory_mode<>'SOURCE_REVIEW'))));
REVOKE ALL ON FUNCTION naijue_erp.source_review_keys_v1(jsonb,text[]) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_occurrence_v1(text,jsonb) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_record_id_v1(text) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_utf16_length_v1(text) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_source_v1(jsonb) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_wrapper_v1(text,jsonb) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_approval_v1(uuid) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_expected_v1(jsonb) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_operation_v1(uuid,boolean) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_transition_v1(jsonb,jsonb,text,boolean) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_record_proof_v1(jsonb,boolean) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_complete_operation_v1(uuid) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_command_v1(jsonb,text) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
REVOKE ALL ON FUNCTION naijue_erp.source_review_read_v1(jsonb,text) FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.source_review_command_v1(jsonb,text) TO erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.source_review_read_v1(jsonb,text) TO erp_unified27_importer_2393dbc6db9581c2;

COMMIT;
