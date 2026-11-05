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
