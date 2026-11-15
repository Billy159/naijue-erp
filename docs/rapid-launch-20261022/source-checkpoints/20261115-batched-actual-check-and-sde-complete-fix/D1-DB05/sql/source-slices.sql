-- SOURCE CANDIDATE. Host/model admission and PostgreSQL validation pending.
BEGIN;
DO $owner$
BEGIN
 IF current_user::regrole::oid IS DISTINCT FROM (SELECT proowner FROM pg_catalog.pg_proc
   WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)'::regprocedure) THEN
  RAISE EXCEPTION 'BATCH_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
END $owner$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE actor uuid; operation uuid; batch uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; summary jsonb; assigned_xid xid8;
 member_a naijue_erp.audit_change%ROWTYPE; member_r naijue_erp.operation_receipt%ROWTYPE;
 init jsonb; previous jsonb:='{}'; statuses jsonb:='{}'; operations jsonb:='[]';
 next_ordinal integer:=0; ordinal integer; rank integer; last_rank integer:=-1; command_phase text;
 documents_id uuid; target_batch naijue_erp.import_batch%ROWTYPE;
 baseline_sealed boolean:=false; documents_staged boolean:=false; documents_published boolean:=false;
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
  OR (init_request->'payload'->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR init_request->'payload'->>'mode' IS NULL) OR coalesce(length(init_request->>'request_key'),0)=0
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
 -- Persisted prefix inspection. A receipt status is meaningful only after
 -- excluding this transaction and validating the original input/key chain.
 init:=a.after_values->'request';
 documents_id:=(init->'payload'->>'document_batch_id')::uuid;
 IF documents_id IS NULL OR documents_id=batch
  OR a.after_values->'whole_package_v2'->'ordinal' IS DISTINCT FROM '0'::jsonb THEN
  RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='23514';
 END IF;
 FOR member_a IN SELECT * FROM naijue_erp.audit_change
   WHERE after_values->'whole_package_v2'->>'root_operation'=operation::text
   ORDER BY (after_values->'whole_package_v2'->>'ordinal')::integer LOOP
  ordinal:=(member_a.after_values->'whole_package_v2'->>'ordinal')::integer;
  IF ordinal IS DISTINCT FROM next_ordinal THEN
   RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT * INTO STRICT member_r FROM naijue_erp.operation_receipt WHERE id=member_a.operation_id;
  IF assigned_xid IS NOT NULL AND (
    EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=member_r.id
      AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint)
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change q WHERE q.id=member_a.id
      AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint)) THEN
   RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000';
  END IF;
  rank:=CASE member_a.after_values->>'phase'
    WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2
    WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4
    WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END;
  command_phase:=CASE rank WHEN 3 THEN 'PUBLISH' WHEN 4 THEN 'DOCUMENTS'
    WHEN 6 THEN 'PUBLISH' ELSE member_a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR (ordinal>0 AND member_a.after_values->'whole_package_v2' IS DISTINCT FROM
       jsonb_build_object('root_operation',operation,'ordinal',ordinal))
   OR member_r.status IS DISTINCT FROM 'COMMITTED' OR member_r.target_type IS DISTINCT FROM 'IMPORT'
   OR member_r.actor_account_id IS DISTINCT FROM actor
   OR member_r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN batch ELSE documents_id END)
   OR member_a.object_type IS DISTINCT FROM 'IMPORT' OR member_a.object_id IS DISTINCT FROM member_r.target_id
   OR member_a.id IS DISTINCT FROM member_r.id OR member_a.action IS DISTINCT FROM member_r.action
   OR member_a.actor_account_id IS DISTINCT FROM member_r.actor_account_id
   OR member_a.occurred_at IS DISTINCT FROM member_r.completed_at
   OR member_a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR member_r.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR member_a.after_values->'request'->>'namespace' IS DISTINCT FROM init->>'namespace'
   OR member_a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM init->>'plan_sha256'
   OR member_a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM init->>'package_manifest_sha256'
   OR member_a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM init->>'cutoff_at'
   OR member_a.after_values->'request'->>'batch_id' IS DISTINCT FROM member_r.target_id::text
   OR member_a.after_values->'request'->>'operation_id' IS DISTINCT FROM member_r.id::text
   OR member_a.after_values->'request'->>'request_key' IS DISTINCT FROM member_r.request_key
   OR (ordinal>0 AND member_r.request_hash IS DISTINCT FROM
       encode(sha256(convert_to(command_phase||':'||(member_a.after_values->'request')::text,'UTF8')),'hex'))
   OR member_a.before_values IS DISTINCT FROM previous->(member_r.target_id::text)
   OR member_a.new_version IS DISTINCT FROM (member_a.after_values->'checkpoint'->>'sequence')::integer+1
   OR member_r.result_data->>'sequence' IS DISTINCT FROM member_a.after_values->'checkpoint'->>'sequence'
   OR member_r.result_data->>'cursor' IS DISTINCT FROM member_a.after_values->'checkpoint'->>'cursor'
  THEN RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged) OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514';
  END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
  previous:=jsonb_set(previous,ARRAY[member_r.target_id::text],member_a.after_values->'checkpoint');
  statuses:=jsonb_set(statuses,ARRAY[member_r.target_id::text],member_r.result_data->'status');
  operations:=operations||jsonb_build_array(jsonb_build_object('ordinal',ordinal,
    'operationId',member_r.id,'requestKey',member_r.request_key,'requestHash',member_r.request_hash,
    'phase',member_a.after_values->>'phase','batchId',member_r.target_id));
  next_ordinal:=next_ordinal+1;last_rank:=rank;
 END LOOP;
 FOR target_batch IN SELECT * FROM naijue_erp.import_batch WHERE id IN (batch,documents_id) LOOP
  IF target_batch.source_hash IS DISTINCT FROM init->>'package_manifest_sha256'
   OR target_batch.source_name IS DISTINCT FROM init->>'namespace'
   OR target_batch.source_manifest_ref IS DISTINCT FROM init->'payload'->>'manifest_ref'
   OR target_batch.cutoff_at IS DISTINCT FROM (init->>'cutoff_at')::timestamptz
   OR target_batch.checkpoint IS DISTINCT FROM previous->(target_batch.id::text)
   OR target_batch.status IS DISTINCT FROM statuses->>target_batch.id::text
   OR target_batch.checkpoint->'expected' IS DISTINCT FROM
      (CASE WHEN target_batch.id=batch THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END)
  THEN RAISE EXCEPTION 'WHOLE_BATCH_INITIALIZATION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (batch,documents_id))
    IS DISTINCT FROM (SELECT count(*) FROM jsonb_object_keys(previous)) THEN
  RAISE EXCEPTION 'WHOLE_RECEIPT_CHAIN_INVALID' USING ERRCODE='23514';
 END IF;
 IF NOT documents_published THEN
  RETURN jsonb_build_object('state','PARTIAL','packageSha256',init->>'package_manifest_sha256',
    'planSha256',init->>'plan_sha256','rootOperationId',operation,'nextOrdinal',next_ordinal,
    'operations',operations,'checkpoints',previous);
 END IF;
 -- COMPLETE remains gated by the full existing final reconciliation.
 summary:=naijue_erp.standard_whole_package_closed_v2(operation);
 RETURN jsonb_build_object('state','COMMITTED','packageSha256',init_request->>'package_manifest_sha256','planSha256',init_request->>'plan_sha256','summary',summary);
END 
$body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_whole_package_inspect_v2(jsonb,text)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'e17c1236b6fca4fc1fe1e6ad91c1ffa0913bee33e8893dd96829101d53e8ae75' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_whole_package_inspect_v2(jsonb,text)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; marker jsonb; root_values jsonb; proof_xid xid8; proof_low_xid bigint; compact_marker jsonb;
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

 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 compact_marker:=r.result_data->'batched_import_v1';
 IF NOT include_request AND compact_marker IS NOT NULL THEN
  -- The root's compact receipt was validated against its immutable audit when
  -- committed. Per-row write checks do not detoast the large INIT approvals.
  IF compact_marker->'identity'->>'rootOperationId' IS DISTINCT FROM root_operation::text
   OR compact_marker->>'controller' IS DISTINCT FROM session_user
   OR r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_id IS DISTINCT FROM (compact_marker->'identity'->>'batchId')::uuid
   OR compact_marker->'descriptor'->>'phase' IS DISTINCT FROM 'CORE' THEN
   RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
  proof_xid:=pg_current_xact_id_if_assigned();
  IF proof_xid IS NULL THEN
   RAISE EXCEPTION 'BATCH_CURRENT_OPERATION_REQUIRED' USING ERRCODE='42501'; END IF;
  proof_low_xid:=mod(proof_xid::text::numeric,4294967296)::bigint;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt rr
    JOIN naijue_erp.audit_change aa ON aa.operation_id=rr.id
    WHERE rr.target_type='IMPORT' AND rr.status='COMMITTED' AND rr.actor_account_id=r.actor_account_id
      AND rr.xmin::text::bigint=proof_low_xid AND aa.xmin::text::bigint=proof_low_xid
      AND rr.completed_at=transaction_timestamp() AND aa.occurred_at=rr.completed_at
      AND aa.id=rr.id AND aa.actor_account_id=rr.actor_account_id AND aa.object_type='IMPORT'
      AND aa.object_id=rr.target_id AND aa.action=rr.action
      AND rr.result_data->'batched_import_v1'=aa.after_values->'batched_import_v1'
      AND rr.result_data->'batched_import_v1'->'identity'=compact_marker->'identity'
      AND rr.result_data->'batched_import_v1'->>'full_xid'=proof_xid::text
      AND rr.result_data->'batched_import_v1'->>'controller'=session_user
      AND aa.after_values->'whole_package_v2'->>'root_operation'=root_operation::text) THEN
   RAISE EXCEPTION 'BATCH_CURRENT_OPERATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN NULL;
 END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=root_operation;
 -- Detoast the immutable JSONB once for this call.
 root_values:=a.after_values #> ARRAY[]::text[];
 marker:=root_values->'whole_package_v2';
 IF jsonb_typeof(marker) IS DISTINCT FROM 'object'
  OR marker-ARRAY['root_operation','ordinal','full_xid','backend_pid','controller']<>'{}'
  OR marker->>'root_operation' IS DISTINCT FROM root_operation::text
  OR marker->'ordinal' IS DISTINCT FROM '0'::jsonb
  OR marker->>'controller' IS DISTINCT FROM session_user
  OR (marker->>'full_xid' ~ '^[0-9]+$') IS DISTINCT FROM true
  OR (marker->>'backend_pid' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
  OR r.status IS DISTINCT FROM 'COMMITTED'
  OR r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN' OR r.target_type IS DISTINCT FROM 'IMPORT'
  OR a.id IS DISTINCT FROM r.id OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.action IS DISTINCT FROM r.action
  OR r.actor_account_id IS DISTINCT FROM a.actor_account_id OR r.target_id IS DISTINCT FROM a.object_id
  OR root_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
  OR root_values->'request'->>'operation_id' IS DISTINCT FROM root_operation::text
  OR root_values->'request'->>'request_key' IS DISTINCT FROM r.request_key
  OR root_values->'request'->>'batch_id' IS DISTINCT FROM r.target_id::text
  OR root_values->'request'->'payload'->'admin'->>'account_id' IS DISTINCT FROM r.actor_account_id::text
  OR a.occurred_at IS DISTINCT FROM r.completed_at
 THEN RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 IF NOT(r.result_data ? 'batched_import_v1') AND (
   marker IS DISTINCT FROM jsonb_build_object('root_operation',root_operation,'ordinal',0,
     'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user)
   OR r.completed_at IS DISTINCT FROM transaction_timestamp()
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=r.id
     AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change q WHERE q.id=a.id
     AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)) THEN
  RAISE EXCEPTION 'WHOLE_ROOT_CONTEXT_INVALID' USING ERRCODE='42501'; END IF;
 IF NOT include_request THEN
  -- Current writes prove their own transaction, independently of root creation.
  proof_xid:=pg_current_xact_id_if_assigned();
  IF proof_xid IS NULL THEN
   RAISE EXCEPTION 'BATCH_CURRENT_OPERATION_REQUIRED' USING ERRCODE='42501';
  END IF;
  proof_low_xid:=mod(proof_xid::text::numeric,4294967296)::bigint;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt rr
    JOIN naijue_erp.audit_change aa ON aa.operation_id=rr.id
    WHERE rr.target_type='IMPORT' AND rr.status='COMMITTED'
      AND rr.actor_account_id=r.actor_account_id
      AND rr.xmin::text::bigint=proof_low_xid AND aa.xmin::text::bigint=proof_low_xid
      AND rr.completed_at=transaction_timestamp() AND aa.occurred_at=rr.completed_at
      AND aa.id=rr.id AND aa.actor_account_id=rr.actor_account_id
      AND aa.object_type='IMPORT' AND aa.object_id=rr.target_id AND aa.action=rr.action
      AND aa.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND aa.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
      AND aa.after_values->'request'->>'operation_id'=rr.id::text
      AND aa.after_values->'request'->>'request_key'=rr.request_key
      AND aa.after_values->'request'->>'plan_sha256'=root_values->'request'->>'plan_sha256'
      AND aa.after_values->'request'->>'package_manifest_sha256'=root_values->'request'->>'package_manifest_sha256'
      AND aa.after_values->'request'->>'namespace'=root_values->'request'->>'namespace'
      AND aa.after_values->'request'->>'cutoff_at'=root_values->'request'->>'cutoff_at') THEN
   RAISE EXCEPTION 'BATCH_CURRENT_OPERATION_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NULL;
 END IF;
 RETURN jsonb_build_object('actor',r.actor_account_id,'request',root_values->'request','marker',marker);
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_whole_package_validate_context_v2(uuid,bool)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '9ff5c301c61390f0eb762ccc1b336995b7c2dc9426278c1a9f8f7495ac371f6f' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_whole_package_validate_context_v2(uuid,bool)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 item jsonb; actual jsonb; expected jsonb; table_name text; kind text; before_cp jsonb; after_cp jsonb; keys text[]; field text;
 delta numeric; total numeric:=0; ids jsonb; claimed jsonb; account_staff uuid; row_count bigint;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
 IF a.after_values ? 'whole_package_v2' THEN
  PERFORM naijue_erp.standard_whole_package_validate_context_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid,false);
  -- The exact operation being validated must belong to this transaction.
  -- A different current sibling cannot authorize a historical operation.
  IF r.completed_at IS DISTINCT FROM transaction_timestamp()
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=r.id
     AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint)
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change q WHERE q.id=a.id
     AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
   RAISE EXCEPTION 'BATCH_EXACT_CURRENT_OPERATION_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF a.after_values ? 'batched_import_v1' THEN
   IF r.result_data->'batched_import_v1' IS DISTINCT FROM a.after_values->'batched_import_v1' THEN
    RAISE EXCEPTION 'BATCH_RECEIPT_AUDIT_MARKER_DIFFERS' USING ERRCODE='23514'; END IF;
   PERFORM naijue_erp.standard_batched_import_assert_group_v1(
     (a.after_values->'whole_package_v2'->>'root_operation')::uuid,
     jsonb_build_object('identity',a.after_values->'batched_import_v1'->'identity',
       'work_batch',a.after_values->'batched_import_v1'->'descriptor'));
  ELSIF operation=(a.after_values->'whole_package_v2'->>'root_operation')::uuid THEN
   PERFORM naijue_erp.standard_whole_package_closed_v2(operation);
  END IF;
  IF r.result_data->>'phase'='DOCUMENT_PUBLISH' THEN
   PERFORM naijue_erp.standard_whole_package_closed_v2((a.after_values->'whole_package_v2'->>'root_operation')::uuid);
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
  actual:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
  IF item->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
   AND item->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb
   AND NOT(actual ? 'historical_hall_target_capture') THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
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
  IF a.after_values->'request'->'payload'->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN
   IF a.after_values->'current_admin'->'provisioned_snapshot' IS DISTINCT FROM naijue_erp.standard_admin_provision_proof_v1(
    (a.after_values->'request'->'payload'->>'provision_operation_id')::uuid,a.after_values->'request'->'payload'->>'provision_request_sha256',a.after_values->'request'->'payload'->'admin',false) THEN
    RAISE EXCEPTION 'ADMIN_PROVISION_IMPORT_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  ELSE
  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1
   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;
  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN
   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF b.status='IMPORTED' AND after_cp->'counts' IS DISTINCT FROM after_cp->'expected' THEN RAISE EXCEPTION 'STANDARD_PUBLISH_COUNTS_INCOMPLETE' USING ERRCODE='23514'; END IF;
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.assert_standard_import_operation(uuid)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM 'f34d6d25c260bb3ddbeb4e66707f7bd68df9a52a2a4d1b8f784ca048aa2677bb' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.assert_standard_import_operation(uuid)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE context jsonb; actor uuid; prior naijue_erp.operation_receipt%ROWTYPE;
 prior_a naijue_erp.audit_change%ROWTYPE; assigned_xid xid8;
BEGIN
 -- This is the same barrier used by every existing import mutation. A lost
 -- COMMIT acknowledgement is resolved only after the old writer releases it.
 PERFORM naijue_erp.cutoff_import_lock();
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=init_operation
   AND q.result_data ? 'batched_import_v1') THEN
  RAISE EXCEPTION 'BATCH_ENTRYPOINT_REQUIRED' USING ERRCODE='42501'; END IF;
 context:=naijue_erp.standard_whole_package_context_v2(init_operation);
 actor:=(context->>'actor')::uuid;
 IF ordinal IS NULL OR ordinal<1 OR command_phase IS NULL
  OR command_phase NOT IN ('MASTER','KEYS','DOCUMENTS','PUBLISH')
  OR jsonb_typeof(request) IS DISTINCT FROM 'object'
  OR coalesce(length(request->>'request_key'),0)=0 THEN
  RAISE EXCEPTION 'BATCH_STEP_INVALID' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
   'naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt
   WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN
  SELECT * INTO STRICT prior_a FROM naijue_erp.audit_change WHERE operation_id=prior.id;
  IF prior.id IS DISTINCT FROM (request->>'operation_id')::uuid
   OR prior.target_type IS DISTINCT FROM 'IMPORT' OR prior.target_id IS DISTINCT FROM (request->>'batch_id')::uuid
   OR prior.status IS DISTINCT FROM 'COMMITTED'
   OR prior.request_hash IS DISTINCT FROM encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex')
   OR prior_a.after_values->'request' IS DISTINCT FROM request
   OR prior_a.after_values->'whole_package_v2' IS DISTINCT FROM
      jsonb_build_object('root_operation',init_operation,'ordinal',ordinal)
   OR prior_a.id IS DISTINCT FROM prior.id OR prior_a.action IS DISTINCT FROM prior.action
   OR prior_a.actor_account_id IS DISTINCT FROM actor OR prior_a.object_type IS DISTINCT FROM 'IMPORT'
   OR prior_a.object_id IS DISTINCT FROM prior.target_id OR prior_a.occurred_at IS DISTINCT FROM prior.completed_at
   OR prior_a.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR prior.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1' THEN
   RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  assigned_xid:=pg_current_xact_id_if_assigned();
  IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q
    WHERE q.id=prior.id AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN
   RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000';
  END IF;
  -- No PG digest is compared to a JS typed-canonical digest.
  RETURN jsonb_build_object('state','COMMITTED','operationId',prior.id,
    'rootOperationId',init_operation,'ordinal',ordinal,
    'sequence',prior.result_data->'sequence','cursor',prior.result_data->'cursor');
 END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=(request->>'operation_id')::uuid) THEN
  RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 RETURN naijue_erp.standard_whole_package_command_v2(request,NULL,command_phase,init_operation,ordinal);
END
$body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_whole_package_step_v2(uuid,int4,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '178d956433f015e739cf60530afc6006ff267471e8d98edb6decbeed4d87d1e4' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_whole_package_step_v2(uuid,int4,text,jsonb)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE s naijue_erp.import_record%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE; pointer jsonb; item jsonb;
 captures jsonb;capture jsonb;target_snapshot jsonb;master_proof jsonb;approval jsonb;approved jsonb;
 master_s naijue_erp.import_record%ROWTYPE;master_a naijue_erp.audit_change%ROWTYPE;
 root_a naijue_erp.audit_change%ROWTYPE;root_r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
 SELECT * INTO STRICT s FROM naijue_erp.import_record WHERE id=record_id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=s.import_batch_id;
 pointer:=s.decision_reason::jsonb;
 IF pointer->>'format'<>'STANDARD_IMPORT_POINTER_V1' OR pointer-ARRAY['format','code','operationId']<>'{}' OR pointer->>'code'<>'SOURCE_BOUND' THEN
  RAISE EXCEPTION 'STANDARD_RECORD_POINTER_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=(pointer->>'operationId')::uuid;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'id'=s.id::text;
 IF s.status<>'IMPORTED' OR s.reviewed_at IS NULL OR s.source_system<>b.source_name OR r.target_type<>'IMPORT' OR r.target_id<>b.id
  OR r.result_data->>'profile'<>'STANDARD_IMPORT_SQL_V1' OR r.status<>'COMMITTED' OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.action<>r.action
  OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR item->>'source_key'<>s.source_key OR item->>'entity_type'<>s.source_entity_type OR item->>'target_type'<>s.target_type
  OR item->>'target_id'<>s.target_id::text OR item->>'source_hash'<>s.source_record_hash OR item->>'file_ref'<>s.source_file_ref
  OR r.result_data->>'packageManifestSha256'<>b.source_hash OR a.after_values->'request'->>'namespace'<>b.source_name THEN
  RAISE EXCEPTION 'STANDARD_RECORD_PROOF_INVALID' USING ERRCODE='23514'; END IF;
 -- The row digest covers the original null intent, never the captured output.
 IF item ? 'historical_hall_evidence' THEN
  IF item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to((jsonb_build_object('source_key',item->'source_key','fields',item->'fields','source_refs',item->'source_refs')
   ||CASE WHEN item ? 'zero_amount_archive' THEN jsonb_build_object('zero_amount_archive',item->'zero_amount_archive') ELSE '{}'::jsonb END
   ||CASE WHEN item ? 'explicit_zero_evidence' THEN jsonb_build_object('explicit_zero_evidence',item->'explicit_zero_evidence') ELSE '{}'::jsonb END
   ||jsonb_build_object('historical_hall_evidence',item->'historical_hall_evidence'))::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_INPUT_HASH_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 captures:=a.after_values->'historical_hall_target_captures';
 IF captures IS NOT NULL THEN
  IF jsonb_typeof(captures) IS DISTINCT FROM 'object' OR captures='{}' OR a.after_values->>'phase' IS DISTINCT FROM 'DOCUMENTS'
   OR r.result_data->>'historicalHallTargetCapturesSha256' IS DISTINCT FROM encode(sha256(convert_to(captures::text,'UTF8')),'hex')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(captures) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'records') x
    WHERE x->>'id'=k AND x->>'entity_type'='SALES_HEADER' AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
     AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'records') x WHERE x->>'entity_type'='SALES_HEADER'
    AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
    AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb AND NOT(captures ? (x->>'id'))) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MAP_INVALID' USING ERRCODE='23514'; END IF;
 ELSIF r.result_data ? 'historicalHallTargetCapturesSha256' THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MAP_REQUIRED' USING ERRCODE='23514'; END IF;
 IF item->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
  AND item->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb THEN
  target_snapshot:=item->'historical_hall_evidence'->'target_snapshot';capture:=captures->(s.id::text);
  IF s.source_entity_type IS DISTINCT FROM 'SALES_HEADER' OR s.target_type IS DISTINCT FROM 'SALES_HEADER'
   OR jsonb_typeof(capture) IS DISTINCT FROM 'object'
   OR capture-ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at']<>'{}'
   OR NOT(capture ?& ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at'])
   OR capture->>'input_source_record_hash' IS DISTINCT FROM s.source_record_hash
   OR capture->'warehouse_id' IS DISTINCT FROM target_snapshot->'warehouse_id'
   OR capture->'hall_id' IS DISTINCT FROM target_snapshot->'hall_id' OR capture->'version' IS DISTINCT FROM target_snapshot->'version'
   OR item->'fields'->'warehouse_id' IS DISTINCT FROM capture->'warehouse_id' OR item->'fields'->'hall_id' IS DISTINCT FROM capture->'hall_id'
   OR jsonb_typeof(capture->'version') IS DISTINCT FROM 'number' OR (capture->>'version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (capture->>'version')::numeric>2147483647 OR jsonb_typeof(capture->'captured_at') IS DISTINCT FROM 'string'
   OR (capture->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((capture->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_CAPTURE_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT root_a FROM naijue_erp.audit_change WHERE operation_id=(a.after_values->'whole_package_v2'->>'root_operation')::uuid;
  SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_a.operation_id;
  SELECT * INTO STRICT master_s FROM naijue_erp.import_record WHERE id=(capture->>'warehouse_source_record_id')::uuid;
  master_proof:=naijue_erp.standard_import_record_proof(master_s.id);
  SELECT * INTO STRICT master_a FROM naijue_erp.audit_change WHERE operation_id=(capture->>'warehouse_operation_id')::uuid;
  approval:=(root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'utf8')::jsonb;
  SELECT x INTO STRICT approved FROM jsonb_array_elements(approval->'records') x WHERE x->>'target_id'=s.target_id::text;
  IF root_r.status IS DISTINCT FROM 'COMMITTED' OR root_r.target_type IS DISTINCT FROM 'IMPORT' OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN'
   OR root_a.object_id IS DISTINCT FROM root_r.target_id OR root_a.object_type IS DISTINCT FROM 'IMPORT' OR root_a.action IS DISTINCT FROM root_r.action
   OR root_a.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR root_a.occurred_at IS DISTINCT FROM root_r.completed_at
   OR root_r.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR root_r.result_data->>'packageManifestSha256' IS DISTINCT FROM b.source_hash
   OR root_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_r.id::text
   OR root_a.after_values->'request'->>'batch_id' IS DISTINCT FROM root_r.target_id::text
   OR root_a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
   OR root_a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR root_a.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM b.id::text
   OR root_a.after_values->'request'->'payload'->>'schema_declarations_sha256' IS DISTINCT FROM 'b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'
   OR encode(sha256(convert_to(root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'utf8','UTF8')),'hex') IS DISTINCT FROM root_a.after_values->'request'->'payload'->'historical_hall_approval'->>'sha256'
   OR approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_APPROVAL_V2' OR approval->>'source_namespace' IS DISTINCT FROM b.source_name
   OR approved->'evidence' IS DISTINCT FROM item->'historical_hall_evidence' OR approved->>'source_key' IS DISTINCT FROM s.source_key
   OR NOT((approved->'source_refs') @> (item->'source_refs') AND (item->'source_refs') @> (approved->'source_refs'))
   OR jsonb_array_length(approved->'source_refs')<>jsonb_array_length(item->'source_refs')
   OR s.reviewed_at IS DISTINCT FROM r.completed_at OR master_s.reviewed_at IS DISTINCT FROM master_a.occurred_at
   OR master_s.import_batch_id IS DISTINCT FROM root_r.target_id OR master_s.source_system IS DISTINCT FROM b.source_name
   OR master_s.source_entity_type IS DISTINCT FROM 'WAREHOUSE' OR master_s.target_type IS DISTINCT FROM 'WAREHOUSE'
   OR master_s.target_id::text IS DISTINCT FROM capture->>'warehouse_id'
   OR master_s.source_key IS DISTINCT FROM approved->'target_initialization'->>'warehouse_source_key'
   OR master_proof->>'operation_id' IS DISTINCT FROM capture->>'warehouse_operation_id'
   OR master_proof->'fields'->'id' IS DISTINCT FROM capture->'warehouse_id'
   OR master_proof->'fields'->'hall_id' IS DISTINCT FROM capture->'hall_id' OR master_proof->'fields'->'version' IS DISTINCT FROM capture->'version'
   OR master_s.source_record_hash IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('source_key',master_proof->'source_key','fields',master_proof->'fields','source_refs',master_proof->'source_refs')::text,'UTF8')),'hex')
   OR master_a.after_values->>'phase' IS DISTINCT FROM 'MASTER' OR master_a.object_id IS DISTINCT FROM root_r.target_id
   OR master_a.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_r.id::text
   OR (master_a.after_values->'whole_package_v2'->>'ordinal')::integer >= (a.after_values->'whole_package_v2'->>'ordinal')::integer
   -- Warehouse provenance can have committed in an earlier work batch.
   -- Root/actor/input/order are persistent identities; heap xmin is local.
   OR master_a.actor_account_id IS DISTINCT FROM root_r.actor_account_id
   OR master_a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM root_a.after_values->'request'->>'plan_sha256'
   OR master_a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR master_a.after_values->'request'->>'namespace' IS DISTINCT FROM b.source_name
   OR master_a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM root_a.after_values->'request'->>'cutoff_at'
   OR a.after_values->'request'->>'plan_sha256' IS DISTINCT FROM root_a.after_values->'request'->>'plan_sha256'
   OR a.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash
   OR a.after_values->'request'->>'cutoff_at' IS DISTINCT FROM root_a.after_values->'request'->>'cutoff_at'
   OR a.after_values->'request'->>'batch_id' IS DISTINCT FROM b.id::text
   OR root_a.id IS DISTINCT FROM root_r.id
   OR (capture->>'captured_at')::timestamptz<root_r.completed_at THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MASTER_LINK_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN item||CASE WHEN capture IS NOT NULL THEN jsonb_build_object('historical_hall_target_capture',capture) ELSE '{}'::jsonb END||jsonb_build_object('operation_id',r.id,'batch_id',b.id,'source_system',b.source_name,'source_hash',b.source_hash,'cutoff_at',b.cutoff_at,
  'current_operation',EXISTS(SELECT 1 FROM naijue_erp.operation_receipt rr
    JOIN naijue_erp.audit_change aa ON aa.operation_id=rr.id
    JOIN naijue_erp.import_record ss ON ss.id=s.id
    WHERE rr.id=r.id AND pg_current_xact_id_if_assigned() IS NOT NULL
      AND rr.xmin::text::bigint=mod(pg_current_xact_id_if_assigned()::text::numeric,4294967296)::bigint
      AND aa.xmin::text::bigint=rr.xmin::text::bigint
      AND ss.xmin::text::bigint=rr.xmin::text::bigint
      AND rr.completed_at=transaction_timestamp() AND aa.occurred_at=rr.completed_at
      AND ss.reviewed_at=rr.completed_at));
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_import_record_proof(uuid)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '02c67d1131ce27141fc0d86eeaafdcd2f0766735dab5b23627cb41ac37b8c282' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_import_record_proof(uuid)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
 first_completed jsonb:='{}'; last_completed jsonb:='{}';
 baseline_sealed boolean:=false; documents_staged boolean:=false; documents_published boolean:=false;
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
  IF ordinal>0 AND a.after_values->'whole_package_v2' IS DISTINCT FROM
    jsonb_build_object('root_operation',root_operation,'ordinal',ordinal) THEN
   RAISE EXCEPTION 'WHOLE_CHILD_MARKER_INVALID' USING ERRCODE='23514'; END IF;
  expected_ordinal:=expected_ordinal+1;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  rank:=CASE a.after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 ELSE NULL END;
  command_phase:=CASE a.after_values->>'phase' WHEN 'BASELINE_SEAL' THEN 'PUBLISH' WHEN 'DOCUMENT_PUBLISH' THEN 'PUBLISH' WHEN 'DOCUMENT_STAGE' THEN 'DOCUMENTS' ELSE a.after_values->>'phase' END;
  IF rank IS NULL OR rank<last_rank OR (ordinal=0) IS DISTINCT FROM (rank=0)
   OR r.actor_account_id IS DISTINCT FROM root_r.actor_account_id OR r.status IS DISTINCT FROM 'COMMITTED'
   OR r.target_type IS DISTINCT FROM 'IMPORT' OR r.target_id NOT IN (baseline_id,documents_id)
   OR r.target_id IS DISTINCT FROM (CASE WHEN rank<=3 THEN baseline_id ELSE documents_id END)
   OR a.object_type IS DISTINCT FROM 'IMPORT' OR a.object_id IS DISTINCT FROM r.target_id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
   OR a.id IS DISTINCT FROM r.id OR a.action IS DISTINCT FROM r.action OR a.occurred_at IS DISTINCT FROM r.completed_at
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
  -- A committed receipt must prove the whole lifecycle independently of the writer.
  -- MASTER/KEYS/DOCUMENTS chunks may repeat; boundary transitions may not.
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged)
   OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514'; END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
  IF NOT(first_completed ? r.target_id::text) THEN
   first_completed:=jsonb_set(first_completed,ARRAY[r.target_id::text],to_jsonb(r.completed_at));
  END IF;
  last_completed:=jsonb_set(last_completed,ARRAY[r.target_id::text],to_jsonb(r.completed_at));
  last_rank:=rank;previous:=jsonb_set(previous,ARRAY[r.target_id::text],a.after_values->'checkpoint');
  last_status:=jsonb_set(last_status,ARRAY[r.target_id::text],r.result_data->'status');final_result:=r.result_data;
 END LOOP;
 IF NOT baseline_sealed OR NOT documents_staged OR NOT documents_published
  OR last_rank<>6 OR expected_ordinal<4 OR (SELECT count(*) FROM jsonb_object_keys(previous))<>2 THEN
  RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 FOR b IN SELECT * FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id) LOOP
  -- Reconcile both batch identities and declared totals to the immutable INIT,
  -- not merely to mutually agreeing live checkpoint/count values.
  IF b.source_manifest_ref IS DISTINCT FROM init->'payload'->>'manifest_ref'
   OR b.cutoff_at IS DISTINCT FROM (init->>'cutoff_at')::timestamptz
   OR b.mapping_version IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'STANDARD_INITIAL_EXPLICIT_KEYS_V1' ELSE 'DOCUMENT_CONVERSION_V1' END)
   OR b.inventory_mode IS DISTINCT FROM (CASE WHEN b.id=baseline_id THEN 'CUTOFF_STOCK_BASELINE' ELSE 'DOCUMENT_CONVERSION' END)
   OR b.created_at IS DISTINCT FROM (first_completed->>b.id::text)::timestamptz
   OR b.completed_at IS DISTINCT FROM (last_completed->>b.id::text)::timestamptz
   OR b.checkpoint->'expected' IS DISTINCT FROM
     (CASE WHEN b.id=baseline_id THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END)
  THEN RAISE EXCEPTION 'WHOLE_BATCH_INITIALIZATION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '01e39386859cbb3e0617b9c89d1d7670a6b9db97af0a4e02b1d9a74460e30d5f' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 visible_root_count bigint; foreign_import_found boolean;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
 admin_provision_snapshot jsonb;
 whole_context jsonb; whole_marker jsonb; prior_rank integer; next_rank integer;
 hall_approval jsonb; hall_approved jsonb; hall_approvals jsonb; hall_evidence jsonb;
 hall_capture jsonb;hall_bridge jsonb;hall_resolution jsonb;hall_target jsonb;hall_member_count integer;
 hall_target_captures jsonb:='{}';hall_observation jsonb;hall_master_id uuid;hall_master_proof jsonb;hall_master_audit naijue_erp.audit_change%ROWTYPE;hall_actual jsonb;hall_actual_xid bigint;
 amount_descriptor jsonb; amount_approval jsonb; amount_fact jsonb; amount_parent jsonb; amount_evidence jsonb; amount_facts_by_id jsonb;
 amount_ref_key text; amount_consumed bigint; amount_unique bigint;
 zero_descriptor jsonb;zero_evidence jsonb;zero_fact jsonb;zero_hash text;zero_sibling text;
 zero_index integer;zero_width integer;zero_consumed bigint;zero_unique bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=root_operation
   AND q.result_data ? 'batched_import_v1') THEN
  RAISE EXCEPTION 'BATCH_ENTRYPOINT_REQUIRED' USING ERRCODE='42501'; END IF;
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
  IF child_ordinal IS NULL OR child_ordinal<1
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  EXECUTE $root_branches$
SELECT counted.root_count,foreign_rows.foreign_found
FROM (
SELECT count(*) AS root_count FROM naijue_erp.audit_change
WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=$1
) counted CROSS JOIN (
SELECT EXISTS(
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)<$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)>$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NULL AND xmin::text::bigint=$2
) AS foreign_found
) foreign_rows
$root_branches$
INTO visible_root_count,foreign_import_found
USING root_operation,mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
IF child_ordinal<>visible_root_count OR foreign_import_found
THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  next_rank:=CASE command_phase WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'PUBLISH' THEN CASE payload->>'phase' WHEN 'BASELINE' THEN 3 WHEN 'DOCUMENTS' THEN 6 END WHEN 'DOCUMENTS' THEN CASE payload->>'mode' WHEN 'STAGE' THEN 4 WHEN 'CHUNK' THEN 5 END END;
  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change
     WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
     CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END) IS NULL) THEN
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;
  ELSE
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
       CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal-1;
  END IF;
  IF next_rank IS NULL OR prior_rank IS NULL OR next_rank<prior_rank OR prior_rank=6 THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN RAISE EXCEPTION 'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','provision_operation_id','provision_request_sha256','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval','historical_hall_approval','historical_line_amount_approval','historical_settlement_retention_approval']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR (payload->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR payload->>'mode' IS NULL)
   OR (payload->>'mode'='NEW_EMPTY' AND payload ?| ARRAY['provision_operation_id','provision_request_sha256'])
   OR (payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' AND (NOT(payload ?& ARRAY['provision_operation_id','provision_request_sha256']) OR (payload->>'provision_operation_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM true OR (payload->>'provision_request_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'schema_declarations_sha256' AND (jsonb_typeof(payload->'schema_declarations_sha256') IS DISTINCT FROM 'string' OR payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')) THEN
   RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_staff_hall_approval' THEN
   expected:=payload->'historical_staff_hall_approval';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR expected-ARRAY['utf8','sha256']<>'{}'
    OR NOT(expected ?& ARRAY['utf8','sha256']) OR jsonb_typeof(expected->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(expected->>'utf8','UTF8')) NOT BETWEEN 1 AND 1048576
    OR (expected->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(expected->>'utf8','UTF8')),'hex') IS DISTINCT FROM expected->>'sha256'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   expected:=(expected->>'utf8')::jsonb;
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
    OR expected-ARRAY['format_version','source_namespace','evidence_sha256','staff']<>'{}'
    OR NOT(expected ?& ARRAY['format_version','source_namespace','evidence_sha256','staff'])
    OR expected->>'format_version' IS DISTINCT FROM 'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'
    OR expected->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (expected->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(expected->'staff') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(expected->'staff') NOT BETWEEN 1 AND 1000
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(expected->'staff') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['source_key','target_id','source_refs']<>'{}'
     OR NOT(item ?& ARRAY['source_key','target_id','source_refs'])
     OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR length(item->>'source_key')=0 OR item->>'source_key' ~ '[[:cntrl:]]' OR item->>'source_key' IS DISTINCT FROM btrim(item->>'source_key',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
     OR (item->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(item->'source_refs')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'source_refs') ref WHERE
     jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647
     OR (ref->'sheet'<>'null'::jsonb AND (length(ref->>'sheet')=0 OR ref->>'sheet' ~ '[[:cntrl:]]' OR ref->>'sheet' IS DISTINCT FROM btrim(ref->>'sheet',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))))
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF (SELECT count(DISTINCT ref) FROM jsonb_array_elements(item->'source_refs') ref)<>jsonb_array_length(item->'source_refs') THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE_REF' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  -- The trusted host derives this descriptor only after independently pinned
  -- complete-file verification. SQL proves membership, not external authority.
  IF payload ? 'explicit_zero_approval' THEN
   zero_descriptor:=payload->'explicit_zero_approval';
   IF zero_descriptor->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    IF zero_descriptor-ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals']<>'{}'
     OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals'])
     OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace' OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('sha256','inventory_file_sha256','input_manifest_sha256','registry_sha256') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true))
     OR zero_descriptor->>'registry_sha256' IS DISTINCT FROM payload->>'registry_sha256'
     OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
     OR coalesce(length(btrim(zero_descriptor->>'batch_key')),0)=0
     OR jsonb_typeof(zero_descriptor->'warehouse_totals') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('universe_count','nonzero_count') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'number' OR (v.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT zero_descriptor->k FROM unnest(ARRAY['warehouses','skus','explicit_values']) k LOOP
     IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['sha256','records_sha256','count']<>'{}' OR NOT(item ?& ARRAY['sha256','records_sha256','count'])
      OR (item->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (item->>'records_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
      OR jsonb_typeof(item->'count') IS DISTINCT FROM 'number' OR (item->>'count' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true
     THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_PIN_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF (zero_descriptor->'warehouses'->>'count')::numeric<1 OR (zero_descriptor->'skus'->>'count')::numeric<1
     OR (zero_descriptor->>'universe_count')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric*(zero_descriptor->'skus'->>'count')::numeric
     OR zero_descriptor->'explicit_values'->'count' IS DISTINCT FROM payload->'expected'->'INVENTORY_KEY'
     OR zero_descriptor->'nonzero_count' IS DISTINCT FROM payload->'expected'->'INVENTORY_EFFECT'
     OR jsonb_array_length(zero_descriptor->'warehouse_totals')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
   IF jsonb_typeof(zero_descriptor) IS DISTINCT FROM 'object'
    OR zero_descriptor-ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256']<>'{}'
    OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256'])
    OR zero_descriptor->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_APPROVAL_MERKLE_V1'
    OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
    OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) e WHERE e.key<>'record_count' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
    OR (zero_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR (zero_descriptor->>'inventory_file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
    OR (zero_descriptor->>'merkle_root_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(zero_descriptor->'record_count') IS DISTINCT FROM 'number'
    OR (zero_descriptor->>'record_count' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
   IF (zero_descriptor->>'record_count')::numeric NOT BETWEEN 1 AND 250000
    OR (zero_descriptor->>'record_count')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_COUNT_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
  IF payload->>'schema_declarations_sha256' IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') AND NOT(payload ? 'historical_hall_approval') THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_REQUIRED_PROFILE_APPROVAL' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_hall_approval' THEN
   hall_approval:=payload->'historical_hall_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-ARRAY['utf8','sha256']<>'{}' OR NOT(hall_approval ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(hall_approval->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(hall_approval->>'utf8','UTF8')) NOT BETWEEN 1 AND 67108864
    OR (hall_approval->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(hall_approval->>'utf8','UTF8')),'hex') IS DISTINCT FROM hall_approval->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   hall_approval:=(hall_approval->>'utf8')::jsonb;
   IF jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-(ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END)<>'{}'
    OR NOT(hall_approval ?& (ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END))
    OR hall_approval->>'format_version' IS DISTINCT FROM (CASE WHEN payload->>'schema_declarations_sha256'='b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b' THEN 'HISTORICAL_SALES_HALL_APPROVAL_V2' ELSE 'HISTORICAL_SALES_HALL_APPROVAL_V1' END)
    OR hall_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (hall_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(hall_approval->'records') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(hall_approval->'records') NOT BETWEEN 1 AND 250000
    OR jsonb_array_length(hall_approval->'records')::numeric IS DISTINCT FROM (payload->'expected_documents'->>'SALES_HEADER')::numeric
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records')
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records') THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN
 IF jsonb_typeof(hall_approval->'source_captures') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'source_captures') NOT BETWEEN 1 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'identity_bridges') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'identity_bridges') NOT BETWEEN 1 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'resolutions') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'resolutions') NOT BETWEEN 0 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR hall_approved IN SELECT value FROM jsonb_array_elements(hall_approval->'records') LOOP
    IF jsonb_typeof(hall_approved) IS DISTINCT FROM 'object' OR hall_approved-(ARRAY['source_key','target_id','source_refs','evidence']||CASE WHEN hall_approved->'evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_approved->'evidence'->'target_snapshot'->'captured_at'='null'::jsonb THEN ARRAY['target_initialization'] ELSE ARRAY[]::text[] END)<>'{}'
     OR NOT(hall_approved ?& ARRAY['source_key','target_id','source_refs','evidence'])
     OR jsonb_typeof(hall_approved->'source_key') IS DISTINCT FROM 'string' OR length(btrim(hall_approved->>'source_key'))=0
     OR (hall_approved->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(hall_approved->'source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(hall_approved->'source_refs') NOT BETWEEN 1 AND 100
     OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(hall_approved->'source_refs') ref)<>jsonb_array_length(hall_approved->'source_refs')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approved->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object'
      OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
      OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
      OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647) THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    hall_evidence:=hall_approved->'evidence';
    IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_evidence->'target_snapshot'->'captured_at'='null'::jsonb THEN
     IF jsonb_typeof(hall_approved->'target_initialization') IS DISTINCT FROM 'object'
      OR (hall_approved->'target_initialization')-ARRAY['warehouse_source_key']<>'{}'
      OR jsonb_typeof(hall_approved->'target_initialization'->'warehouse_source_key') IS DISTINCT FROM 'string'
      OR length(btrim(hall_approved->'target_initialization'->>'warehouse_source_key'))=0
      OR hall_approved->'target_initialization'->>'warehouse_source_key' ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
    ELSIF hall_approved ? 'target_initialization' THEN RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_UNEXPECTED' USING ERRCODE='23514'; END IF;

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_bridge_member WHERE hall_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

   END LOOP;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' AND (
    EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'source_capture'=c))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_registered_bridge_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'identity_bridge'->'evidence_sha256'=hall_registered_bridge_member->'evidence_sha256' AND r->'evidence'->'identity_bridge'->'record_key'=hall_registered_bridge_member->'record_key'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'resolutions') hall_registered_resolution_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'resolution'->'evidence_sha256'=hall_registered_resolution_member->'evidence_sha256' AND r->'evidence'->'resolution'->'record_key'=hall_registered_resolution_member->'record_key')))
   THEN RAISE EXCEPTION 'HISTORICAL_HALL_UNUSED_MEMBER' USING ERRCODE='23514'; END IF;
  END IF;
  -- Independent reviewed bytes are an attestation, not evidence of source truth
  -- by themselves. The trusted host supplies the separately approved SHA.
  IF payload ? 'historical_line_amount_approval' THEN
   amount_descriptor:=payload->'historical_line_amount_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(amount_descriptor) IS DISTINCT FROM 'object'
    OR amount_descriptor-ARRAY['utf8','sha256']<>'{}' OR NOT(amount_descriptor ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(amount_descriptor->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(amount_descriptor->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
    OR (amount_descriptor->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR (amount_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR encode(sha256(convert_to(amount_descriptor->>'utf8','UTF8')),'hex') IS DISTINCT FROM amount_descriptor->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH' USING ERRCODE='23514'; END IF;
   amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   IF amount_approval-ARRAY['format_version','source_namespace','evidence_sha256','lines']<>'{}'
    OR NOT(amount_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','lines'])
    OR amount_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1'
    OR amount_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (amount_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(amount_approval->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(amount_approval->'lines') NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_COUNT' USING ERRCODE='23514'; END IF;
   FOR amount_fact IN SELECT value FROM jsonb_array_elements(amount_approval->'lines') LOOP
    IF jsonb_typeof(amount_fact) IS DISTINCT FROM 'object'
     OR amount_fact-ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount']<>'{}'
     OR NOT(amount_fact ?& ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount'])
     OR jsonb_typeof(amount_fact->'sales_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'sales_source_key' ~ '[[:cntrl:]]'
     OR jsonb_typeof(amount_fact->'line_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'line_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'line_source_key' ~ '[[:cntrl:]]'
     OR (amount_fact->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR (amount_fact->>'line_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'quantity') IS DISTINCT FROM 'string'
     OR (amount_fact->>'quantity' ~ '^-?[1-9][0-9]{0,18}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'deal_price') IS DISTINCT FROM 'string'
     OR (amount_fact->>'deal_price' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'line_amount') IS DISTINCT FROM 'string'
     OR (amount_fact->>'line_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'source_refs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(amount_fact->'sales_source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_FACT' USING ERRCODE='23514'; END IF;
    IF (amount_fact->>'quantity')::bigint::text IS DISTINCT FROM amount_fact->>'quantity'
     OR (amount_fact->>'line_amount')::numeric(18,2)::text IS DISTINCT FROM amount_fact->>'line_amount'
     OR (amount_fact->>'line_amount')::numeric=(amount_fact->>'quantity')::numeric*(amount_fact->>'deal_price')::numeric THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    FOREACH amount_ref_key IN ARRAY ARRAY['source_refs','sales_source_refs'] LOOP
     IF jsonb_array_length(amount_fact->amount_ref_key) NOT BETWEEN 1 AND 100
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_fact->amount_ref_key) ref)<>jsonb_array_length(amount_fact->amount_ref_key)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_fact->amount_ref_key) ref
       WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}'
        OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
        OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
        OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
        OR (jsonb_typeof(ref->'sheet')='string' AND (length(ref->>'sheet') NOT BETWEEN 1 AND 65536 OR ref->>'sheet' ~ '[[:cntrl:]]'))
        OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number'
        OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE true END)) THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    END LOOP;
   END LOOP;
   IF (SELECT count(DISTINCT fact->>'line_id') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT fact->>'line_source_key') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT (SELECT jsonb_agg(ref ORDER BY ref::text) FROM jsonb_array_elements(fact->'source_refs') ref)) FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines') THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
  END IF;
  IF payload ? 'historical_settlement_retention_approval' THEN
   DECLARE sr_wire jsonb:=payload->'historical_settlement_retention_approval';sr_approval jsonb;sr_doc jsonb;sr_row jsonb;sr_ref jsonb;sr_refs jsonb;sr_seen uuid[]:='{}';sr_rows uuid[]:='{}';sr_keys text[]:='{}';sr_row_keys text[]:='{}';sr_total numeric;sr_last integer;sr_used boolean:=false;
   BEGIN
    IF jsonb_typeof(sr_wire) IS DISTINCT FROM 'object' OR sr_wire-ARRAY['utf8','sha256']<>'{}' OR NOT(sr_wire ?& ARRAY['utf8','sha256'])
     OR jsonb_typeof(sr_wire->'utf8') IS DISTINCT FROM 'string' OR octet_length(convert_to(sr_wire->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
     OR (sr_wire->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
     OR (sr_wire->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR encode(sha256(convert_to(sr_wire->>'utf8','UTF8')),'hex') IS DISTINCT FROM sr_wire->>'sha256' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
    sr_approval:=(sr_wire->>'utf8')::jsonb;
    IF jsonb_typeof(sr_approval) IS DISTINCT FROM 'object' OR sr_approval-ARRAY['format_version','source_namespace','evidence_sha256','documents']<>'{}'
     OR NOT(sr_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','documents'])
     OR sr_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SETTLEMENT_RETENTION_V1'
     OR sr_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
     OR (sr_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR jsonb_typeof(sr_approval->'documents') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b') THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
    FOR sr_doc IN SELECT value FROM jsonb_array_elements(sr_approval->'documents') LOOP
     IF jsonb_typeof(sr_doc) IS DISTINCT FROM 'object' OR sr_doc-ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements']<>'{}'
      OR NOT(sr_doc ?& ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements'])
      OR jsonb_typeof(sr_doc->'sales_source_key') IS DISTINCT FROM 'string' OR length(sr_doc->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR sr_doc->>'sales_source_key' ~ '[[:cntrl:]]'
      OR (sr_doc->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
      OR coalesce(sr_doc->>'business_type','') NOT IN ('SALE','RETURN') OR sr_doc->>'status' IS DISTINCT FROM 'APPROVED'
      OR jsonb_typeof(sr_doc->'gross_amount') IS DISTINCT FROM 'string' OR (sr_doc->>'gross_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'order_discount') IS DISTINCT FROM 'string' OR (sr_doc->>'order_discount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'net_due') IS DISTINCT FROM 'string' OR (sr_doc->>'net_due' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'settlements') IS DISTINCT FROM 'array' OR (sr_doc->>'sales_id')::uuid=ANY(sr_seen) OR sr_doc->>'sales_source_key'=ANY(sr_keys) THEN
      RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_DOCUMENT' USING ERRCODE='23514'; END IF;
     sr_seen:=array_append(sr_seen,(sr_doc->>'sales_id')::uuid);sr_keys:=array_append(sr_keys,sr_doc->>'sales_source_key');sr_total:=0;sr_last:=0;
     IF jsonb_array_length(sr_doc->'settlements')<1 THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
     sr_refs:=jsonb_build_array(sr_doc->'source_refs');
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_doc->'settlements') LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'object' OR sr_row-ARRAY['source_key','fields','source_refs']<>'{}' OR NOT(sr_row ?& ARRAY['source_key','fields','source_refs'])
       OR jsonb_typeof(sr_row->'source_key') IS DISTINCT FROM 'string' OR length(sr_row->>'source_key') NOT BETWEEN 1 AND 65536 OR sr_row->>'source_key' ~ '[[:cntrl:]]'
       OR jsonb_typeof(sr_row->'fields') IS DISTINCT FROM 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(sr_row->'fields') key) IS DISTINCT FROM (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='naijue_erp.sales_settlement'::regclass AND attnum>0 AND NOT attisdropped)
       OR sr_row->'fields'->>'sales_id' IS DISTINCT FROM sr_doc->>'sales_id'
       OR (sr_row->'fields'->>'id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
       OR jsonb_typeof(sr_row->'fields'->'line_no') IS DISTINCT FROM 'number' OR (sr_row->'fields'->>'line_no')::integer<=sr_last
       OR coalesce(sr_row->'fields'->>'direction','') NOT IN ('RECEIVE','REFUND') OR jsonb_typeof(sr_row->'fields'->'amount') IS DISTINCT FROM 'string'
       OR (sr_row->'fields'->>'amount' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
       OR (sr_row->'fields'->>'id')::uuid=ANY(sr_rows) OR sr_row->>'source_key'=ANY(sr_row_keys) THEN
       RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
      sr_last:=(sr_row->'fields'->>'line_no')::integer;sr_rows:=array_append(sr_rows,(sr_row->'fields'->>'id')::uuid);sr_row_keys:=array_append(sr_row_keys,sr_row->>'source_key');
      sr_total:=sr_total+(sr_row->'fields'->>'amount')::numeric*CASE sr_row->'fields'->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END;
      sr_refs:=sr_refs||jsonb_build_array(sr_row->'source_refs');
     END LOOP;
     IF sr_total=(sr_doc->>'net_due')::numeric THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_refs) LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(sr_row) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(sr_row) ref)<>jsonb_array_length(sr_row) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      FOR sr_ref IN SELECT value FROM jsonb_array_elements(sr_row) LOOP
       IF jsonb_typeof(sr_ref) IS DISTINCT FROM 'object' OR sr_ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(sr_ref ?& ARRAY['file_sha256','sheet','row'])
        OR (sr_ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(sr_ref->'sheet') NOT IN ('string','null')
        OR jsonb_typeof(sr_ref->'row') IS DISTINCT FROM 'number' OR (sr_ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (sr_ref->>'row')::numeric>2147483647 THEN
        RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
       sr_used:=sr_used OR sr_ref->>'file_sha256'=sr_approval->>'evidence_sha256';
      END LOOP;
     END LOOP;
    END LOOP;
    IF cardinality(sr_rows)<>(CASE jsonb_array_length(sr_approval->'documents') WHEN 24 THEN 26 ELSE 27 END) OR NOT sr_used THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END;
  END IF;
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
  admin:=payload->'admin';
  IF payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN
   PERFORM naijue_erp.maintenance_administrator_mutex();
   IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=(payload->>'provision_operation_id')::uuid AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
    RAISE EXCEPTION 'ADMIN_PROVISION_COMMITTED_RECEIPT_REQUIRED' USING ERRCODE='25000'; END IF;
   admin_provision_snapshot:=naijue_erp.standard_admin_provision_proof_v1((payload->>'provision_operation_id')::uuid,payload->>'provision_request_sha256',admin,true);
  ELSE
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  END IF;
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
  IF cfg ? 'historical_line_amount_approval' THEN
   amount_descriptor:=cfg->'historical_line_amount_approval';amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   SELECT jsonb_object_agg(fact->>'line_id',fact) INTO amount_facts_by_id FROM jsonb_array_elements(amount_approval->'lines') fact;
  END IF;
  IF command_phase='DOCUMENTS' AND cfg ? 'historical_hall_approval' THEN
   hall_approval:=(cfg->'historical_hall_approval'->>'utf8')::jsonb;
   SELECT jsonb_object_agg(value->>'target_id',value) INTO hall_approvals FROM jsonb_array_elements(((cfg->'historical_hall_approval'->>'utf8')::jsonb)->'records');
  END IF;
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
    hall_observation:=NULL;
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id','explicit_zero_evidence']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' AND entry ? 'explicit_zero_evidence' THEN RAISE EXCEPTION 'INVENTORY_SCOPE_REQUIRES_REAL_EXPLICIT_ROWS' USING ERRCODE='23514'; END IF;
     IF entry ? 'explicit_zero_evidence' THEN
      IF NOT(cfg ? 'explicit_zero_approval') THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_REQUIRED' USING ERRCODE='23514'; END IF;
      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';
      IF jsonb_typeof(zero_evidence) IS DISTINCT FROM 'object'
       OR zero_evidence-ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof']<>'{}'
       OR NOT(zero_evidence ?& ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])
       OR zero_evidence->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_ABSENCE_V1'
       OR fields->>'quantity' IS DISTINCT FROM '0'
       OR zero_evidence->>'inventory_file_sha256' IS DISTINCT FROM zero_descriptor->>'inventory_file_sha256'
       OR zero_evidence->>'cutoff_at' IS DISTINCT FROM zero_descriptor->>'cutoff_at'
       OR zero_evidence->>'approval_sha256' IS DISTINCT FROM zero_descriptor->>'sha256'
       OR jsonb_typeof(zero_evidence->'approval_row') IS DISTINCT FROM 'number'
       OR (zero_evidence->>'approval_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'approval_line') IS DISTINCT FROM 'string'
       OR octet_length(convert_to(zero_evidence->>'approval_line','UTF8')) NOT BETWEEN 1 AND 65536
       OR strpos(zero_evidence->>'approval_line',chr(10))>0 OR strpos(zero_evidence->>'approval_line',chr(13))>0
       OR left(zero_evidence->>'approval_line',1)=chr(65279)
       OR (zero_evidence->>'approval_line' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'merkle_proof') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_EVIDENCE_INVALID' USING ERRCODE='23514'; END IF;
      IF (zero_evidence->>'approval_row')::numeric>(zero_descriptor->>'record_count')::numeric
       OR jsonb_array_length(zero_evidence->'merkle_proof')>18
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(zero_evidence->'merkle_proof') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string' OR (s#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
       OR entry->'source_refs' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('file_sha256',zero_descriptor->>'sha256','sheet',NULL,'row',(zero_evidence->>'approval_row')::integer))
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
      zero_fact:=(zero_evidence->>'approval_line')::jsonb;
      IF zero_fact IS DISTINCT FROM jsonb_build_object('format_version','EXPLICIT_ZERO_APPROVAL_V1','source_namespace',request->>'namespace',
       'inventory_file_sha256',zero_descriptor->>'inventory_file_sha256','cutoff_at',request->>'cutoff_at','source_key',source_key,
       'warehouse_id',fields->>'warehouse_id','sku_id',fields->>'sku_id','quantity','0','decision','CONFIRMED_ABSENT_IS_ZERO')
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVED_FACT_DIFFERS' USING ERRCODE='23514'; END IF;
      zero_index:=(zero_evidence->>'approval_row')::integer-1;zero_width:=(zero_descriptor->>'record_count')::integer;
      zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_LEAF_V1'||chr(10)||(zero_index+1)::text||chr(10)||(zero_evidence->>'approval_line'),'UTF8')),'hex');
      FOR zero_sibling IN SELECT value FROM jsonb_array_elements_text(zero_evidence->'merkle_proof') LOOP
       IF zero_width<=1 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_DEPTH_INVALID' USING ERRCODE='23514'; END IF;
       IF mod(zero_index,2)=0 THEN
        IF zero_index+1>=zero_width AND zero_sibling IS DISTINCT FROM zero_hash THEN RAISE EXCEPTION 'EXPLICIT_ZERO_ODD_SIBLING' USING ERRCODE='23514'; END IF;
        zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_hash||chr(10)||zero_sibling,'UTF8')),'hex');
       ELSE zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_sibling||chr(10)||zero_hash,'UTF8')),'hex'); END IF;
       zero_index:=zero_index/2;zero_width:=(zero_width+1)/2;
      END LOOP;
      IF zero_width<>1 OR zero_hash IS DISTINCT FROM zero_descriptor->>'merkle_root_sha256' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_MEMBERSHIP_INVALID' USING ERRCODE='23514'; END IF;
     END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive','historical_hall_evidence']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF command_phase='DOCUMENTS' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt sealed
       WHERE sealed.action='MIGRATE_DOCUMENT' AND sealed.target_type=CASE WHEN kind IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT') THEN 'SALES' ELSE 'TRANSFER' END
        AND sealed.target_id=CASE WHEN kind IN ('SALES_HEADER','TRANSFER_HEADER') THEN target WHEN kind IN ('SALES_LINE','SALES_SETTLEMENT') THEN (fields->>'sales_id')::uuid ELSE (fields->>'transfer_id')::uuid END)
     THEN RAISE EXCEPTION 'WHOLE_DOCUMENT_ALREADY_SEALED' USING ERRCODE='23514'; END IF;
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind='STAFF' AND fields->>'role'='SALESPERSON' AND fields->'hall_id'='null'::jsonb THEN
      IF fields->>'employment_status' IS DISTINCT FROM '离职'
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(((cfg->'historical_staff_hall_approval'->>'utf8')::jsonb)->'staff','[]'::jsonb)) approved
        WHERE approved->>'source_key'=entry->>'source_key' AND approved->>'target_id'=entry->>'target_id'
         AND (approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (approved->'source_refs'))
       OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=(entry->>'target_id')::uuid)
      THEN RAISE EXCEPTION 'STAFF_HALL_REQUIRED' USING ERRCODE='23514'; END IF;
     END IF;
     -- WHOLE_FIT_PROFILE_GUARD_BEGIN
     -- An installed numeric table constraint does not widen a legacy package.
     -- Select only the original immutable INIT profile; never infer or rewrite codes.
     IF kind='FIT' AND (jsonb_typeof(fields->'code') IS DISTINCT FROM 'string'
      OR (fields->>'code' COLLATE "C" ~ CASE WHEN cfg->>'schema_declarations_sha256' IN
       ('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
       THEN '^[A-Z356789]$' ELSE '^[A-Z]$' END) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_END
     IF (master_chunks_v2 OR cfg->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS') AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
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
    IF kind='SALES_HEADER' AND cfg ? 'historical_hall_approval' AND NOT(entry ? 'historical_hall_evidence') THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    IF entry ? 'historical_hall_evidence' THEN
     IF command_phase<>'DOCUMENTS' OR kind<>'SALES_HEADER' OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR fields->>'import_batch_id' IS DISTINCT FROM batch::text THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_SCOPE' USING ERRCODE='23514'; END IF;
     hall_evidence:=entry->'historical_hall_evidence';hall_approved:=hall_approvals->(entry->>'target_id');

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_step_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_step_bridge_member WHERE hall_step_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_step_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

     IF hall_approved IS NULL OR hall_approved->>'source_key' IS DISTINCT FROM source_key
      OR NOT((hall_approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (hall_approved->'source_refs'))
      OR jsonb_array_length(hall_approved->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs')
      OR hall_approved->'evidence' IS DISTINCT FROM hall_evidence
      OR fields->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR fields->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_MEMBERSHIP' USING ERRCODE='23514'; END IF;
     IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
      -- Observe only the locked target; the original input intent is immutable.
      SELECT to_jsonb(w),w.xmin::text::bigint INTO hall_actual,hall_actual_xid FROM naijue_erp.warehouse w WHERE w.id=(hall_target->>'warehouse_id')::uuid
       AND w.hall_id=(hall_target->>'hall_id')::uuid AND w.version=(hall_target->>'version')::integer
       AND w.version>0 FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
      IF hall_target->'captured_at'='null'::jsonb THEN
       IF hall_actual_xid IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
        RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_TARGET_NOT_NEW' USING ERRCODE='23514'; END IF;
       SELECT s.id INTO STRICT hall_master_id FROM naijue_erp.import_record s
        WHERE s.import_batch_id=baseline.id AND s.source_system=request->>'namespace' AND s.source_entity_type='WAREHOUSE'
         AND s.target_type='WAREHOUSE' AND s.target_id=(hall_target->>'warehouse_id')::uuid
         AND s.source_key=hall_approved->'target_initialization'->>'warehouse_source_key' AND s.status='IMPORTED';
       hall_master_proof:=naijue_erp.standard_import_record_proof(hall_master_id);
       SELECT * INTO STRICT hall_master_audit FROM naijue_erp.audit_change WHERE operation_id=(hall_master_proof->>'operation_id')::uuid;
       IF hall_master_proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR hall_master_audit.after_values->>'phase' IS DISTINCT FROM 'MASTER'
        OR hall_master_audit.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
        OR (SELECT ma.xmin::text::bigint FROM naijue_erp.audit_change ma WHERE ma.operation_id=hall_master_audit.operation_id)<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
        OR hall_master_proof->'fields'->'id' IS DISTINCT FROM hall_actual->'id'
        OR hall_master_proof->'fields'->'hall_id' IS DISTINCT FROM hall_actual->'hall_id'
        OR hall_master_proof->'fields'->'version' IS DISTINCT FROM hall_actual->'version' THEN
        RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MASTER_REQUIRED' USING ERRCODE='23514'; END IF;
       hall_observation:=jsonb_build_object('warehouse_source_record_id',hall_master_id,'warehouse_operation_id',hall_master_proof->'operation_id',
        'warehouse_id',hall_actual->'id','hall_id',hall_actual->'hall_id','version',hall_actual->'version',
        'captured_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
      END IF;
     ELSE
     IF hall_evidence->'warehouse_version'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
      WHERE w.id=(hall_evidence->>'warehouse_id')::uuid AND w.version=(hall_evidence->>'warehouse_version')::integer
       AND to_jsonb(w.hall_id) IS NOT DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture') THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
    IF entry ? 'zero_amount_archive' THEN
     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'
      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'
      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'
      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'
      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;
     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP
      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'
       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'
       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])
       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'
       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096
       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'
       OR parent_row.archived->'amount' IS DISTINCT FROM '"0.00"'::jsonb
       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'
       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100
       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100
       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
     END LOOP;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;
    END IF;
    amount_evidence:=NULL;
    IF kind='SALES_LINE' AND (fields->>'line_amount')::numeric IS DISTINCT FROM (fields->>'quantity')::numeric*(fields->>'deal_price')::numeric THEN
     IF command_phase IS DISTINCT FROM 'DOCUMENTS'
      OR coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
      OR NOT(cfg ? 'historical_line_amount_approval') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     amount_fact:=amount_facts_by_id->target::text;
     IF amount_fact IS NULL THEN RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     IF amount_fact->>'line_source_key' IS DISTINCT FROM source_key
      OR amount_fact->>'sales_id' IS DISTINCT FROM fields->>'sales_id'
      OR amount_fact->'quantity' IS DISTINCT FROM fields->'quantity'
      OR amount_fact->'deal_price' IS DISTINCT FROM fields->'deal_price'
      OR amount_fact->'line_amount' IS DISTINCT FROM fields->'line_amount'
      OR NOT((amount_fact->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (amount_fact->'source_refs'))
      OR jsonb_array_length(amount_fact->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
     SELECT parent INTO STRICT amount_parent FROM (
      SELECT parent FROM jsonb_array_elements(payload->'rows') parent WHERE parent->>'entity_type'='SALES_HEADER' AND parent->>'target_id'=amount_fact->>'sales_id'
      UNION ALL SELECT naijue_erp.standard_import_record_proof(s.id) FROM naijue_erp.import_record s
       WHERE s.import_batch_id=batch AND s.target_type='SALES_HEADER' AND s.target_id=(amount_fact->>'sales_id')::uuid) parents;
     IF amount_parent->>'source_key' IS DISTINCT FROM amount_fact->>'sales_source_key'
      OR amount_parent->'fields'->>'id' IS DISTINCT FROM amount_fact->>'sales_id'
      OR amount_parent->'fields'->>'import_batch_id' IS DISTINCT FROM batch::text
      OR amount_parent->'fields'->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(amount_parent->'source_refs') IS DISTINCT FROM 'array'
      OR NOT((amount_parent->'source_refs') @> (amount_fact->'sales_source_refs') AND (amount_fact->'sales_source_refs') @> (amount_parent->'source_refs'))
      OR jsonb_array_length(amount_parent->'source_refs')<>jsonb_array_length(amount_fact->'sales_source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_parent->'source_refs') ref)<>jsonb_array_length(amount_parent->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_PARENT_DIFFERS' USING ERRCODE='23514'; END IF;
     amount_evidence:=jsonb_build_object('format_version','HISTORICAL_LINE_AMOUNT_BOUND_V1',
      'attestation_sha256',amount_descriptor->>'sha256','evidence_sha256',amount_approval->>'evidence_sha256','fact',amount_fact);
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');
    IF amount_evidence IS NOT NULL THEN parsed:=parsed||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    IF entry ? 'explicit_zero_evidence' THEN parsed:=parsed||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF entry ? 'historical_hall_evidence' THEN parsed:=parsed||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    IF hall_observation IS NOT NULL THEN
     hall_target_captures:=hall_target_captures||jsonb_build_object(record_id::text,hall_observation||jsonb_build_object('input_source_record_hash',source_hash));
    END IF;
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF entry ? 'historical_hall_evidence' THEN item:=item||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    IF entry ? 'explicit_zero_evidence' THEN item:=item||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF amount_evidence IS NOT NULL THEN item:=item||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   IF phase='BASELINE_SEAL' AND cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN fields:=fields||jsonb_build_object('inventory_baseline_scope',cfg->'explicit_zero_approval'); END IF;
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN CASE WHEN cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN 'FINAL_BASELINE_SCOPE_V1' ELSE 'FINAL_EXPLICIT_KEYS' END ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
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
 IF hall_target_captures<>'{}' THEN result:=result||jsonb_build_object('historicalHallTargetCapturesSha256',encode(sha256(convert_to(hall_target_captures::text,'UTF8')),'hex')); END IF;
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN CASE WHEN payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN payload->'admin'||jsonb_build_object('provisioned_snapshot',admin_provision_snapshot) ELSE payload->'admin' END ELSE NULL END,
    'whole_package_v2',CASE WHEN command_phase='INITIALIZE' THEN jsonb_build_object('root_operation',root_operation,'ordinal',0,'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user) ELSE jsonb_build_object('root_operation',root_operation,'ordinal',child_ordinal) END)||CASE WHEN hall_target_captures<>'{}' THEN jsonb_build_object('historical_hall_target_captures',hall_target_captures) ELSE '{}'::jsonb END,transaction_timestamp());
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
    IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') THEN
     IF NOT(fields ? 'departure_date') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT attisdropped AND attgenerated='') THEN RAISE EXCEPTION 'WHOLE_STAFF_SCHEMA_NOT_INSTALLED' USING ERRCODE='23514'; END IF;
     IF fields->'departure_date' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->'departure_date') IS DISTINCT FROM 'string' OR (fields->>'departure_date' COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true OR to_char((fields->>'departure_date')::date,'YYYY-MM-DD') IS DISTINCT FROM fields->>'departure_date') THEN RAISE EXCEPTION 'WHOLE_STAFF_DATE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF fields ? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='' AND NOT(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'))) THEN
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
   IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    zero_descriptor:=cfg->'explicit_zero_approval';
    FOR kind IN SELECT unnest(ARRAY['WAREHOUSE','SKU']) LOOP
     SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(format('{"id":"%s"}',src.target_id)||chr(10),'' ORDER BY src.target_id),''),'UTF8')),'hex') INTO n,zero_hash
      FROM naijue_erp.import_record src WHERE src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type=kind;
     item:=zero_descriptor->CASE kind WHEN 'WAREHOUSE' THEN 'warehouses' ELSE 'skus' END;
     IF n IS DISTINCT FROM (item->>'count')::numeric OR zero_hash IS DISTINCT FROM item->>'records_sha256' THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_MEMBERS_DIFFERS' USING ERRCODE='23514'; END IF;
    END LOOP;
    WITH actual AS MATERIALIZED (
     SELECT approved->'fields' AS f FROM naijue_erp.audit_change prior_audit
      CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
      JOIN naijue_erp.import_record src ON src.id=(approved->>'id')::uuid AND src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type='INVENTORY_KEY'
      WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch AND prior_audit.after_values->>'phase'='KEYS'
       AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
    ), totals AS (
     SELECT w.target_id, count(f)::integer explicit_count,count(f) FILTER(WHERE f->>'quantity'<>'0')::integer nonzero_count,coalesce(sum((f->>'quantity')::numeric),0)::text quantity
      FROM naijue_erp.import_record w LEFT JOIN actual ON (f->>'warehouse_id')::uuid=w.target_id
      WHERE w.import_batch_id=batch AND w.status='IMPORTED' AND w.target_type='WAREHOUSE' GROUP BY w.target_id
    )
    SELECT (SELECT count(*) FROM actual),(SELECT count(*) FROM actual WHERE f->>'quantity'<>'0'),
     (SELECT encode(sha256(convert_to(coalesce(string_agg(format('{"warehouse_id":"%s","sku_id":"%s","quantity":"%s"}',f->>'warehouse_id',f->>'sku_id',f->>'quantity')||chr(10),'' ORDER BY f->>'warehouse_id' COLLATE "C",f->>'sku_id' COLLATE "C"),''),'UTF8')),'hex') FROM actual),
     (SELECT jsonb_agg(jsonb_build_object('warehouse_id',t.target_id,'explicit_count',t.explicit_count,'nonzero_count',t.nonzero_count,'quantity',t.quantity) ORDER BY t.target_id) FROM totals AS t)
     INTO zero_consumed,zero_unique,zero_hash,actual;
    IF zero_consumed IS DISTINCT FROM (zero_descriptor->'explicit_values'->>'count')::bigint OR zero_unique IS DISTINCT FROM (zero_descriptor->>'nonzero_count')::bigint
     OR zero_hash IS DISTINCT FROM zero_descriptor->'explicit_values'->>'records_sha256' OR actual IS DISTINCT FROM zero_descriptor->'warehouse_totals'
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cfg ? 'explicit_zero_approval' THEN
    SELECT count(*),count(DISTINCT (approved->'explicit_zero_evidence'->>'approval_row')::integer) INTO zero_consumed,zero_unique
     FROM naijue_erp.audit_change prior_audit CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
     WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch
      AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
      AND prior_audit.after_values->>'phase'='KEYS' AND approved->>'target_type'='INVENTORY_KEY' AND approved ? 'explicit_zero_evidence';
    IF zero_consumed<>(cfg->'explicit_zero_approval'->>'record_count')::bigint OR zero_unique<>zero_consumed
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVAL_NOT_EXACTLY_CONSUMED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF cfg ? 'historical_settlement_retention_approval' THEN
    DECLARE sr_doc jsonb;sr_count bigint;sr_rows bigint;sr_operation uuid;
    BEGIN
     SELECT count(*),coalesce(sum((SELECT count(*) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)),0) INTO sr_count,sr_rows
      FROM naijue_erp.sales_header hh WHERE hh.import_batch_id=batch AND hh.status='APPROVED' AND hh.stock_basis='CUTOFF_HISTORY'
       AND EXISTS(SELECT 1 FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)
       AND hh.net_due IS DISTINCT FROM (SELECT sum(st.amount*CASE st.direction WHEN 'RECEIVE' THEN 1 ELSE -1 END) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id);
     IF sr_count<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 24 ELSE 25 END) OR sr_rows<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 26 ELSE 27 END) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_doc IN SELECT value FROM jsonb_array_elements(((cfg->'historical_settlement_retention_approval'->>'utf8')::jsonb)->'documents') LOOP
      SELECT rr.id INTO STRICT sr_operation FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=(sr_doc->>'sales_id')::uuid AND rr.action='MIGRATE_DOCUMENT' AND rr.status='COMMITTED';
      PERFORM naijue_erp.assert_document_migration(sr_operation);
     END LOOP;
    END;
   END IF;
   IF cfg ? 'historical_line_amount_approval' THEN
    amount_approval:=(cfg->'historical_line_amount_approval'->>'utf8')::jsonb;
    SELECT count(*),count(DISTINCT s.target_id) INTO amount_consumed,amount_unique FROM naijue_erp.import_record s
     CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
     WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND proof ? 'historical_line_amount_evidence';
    IF amount_consumed<>jsonb_array_length(amount_approval->'lines') OR amount_unique<>amount_consumed
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_approval->'lines') fact WHERE NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
       WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND s.target_id=(fact->>'line_id')::uuid
        AND proof->'historical_line_amount_evidence'->'fact'=fact
        AND proof->'historical_line_amount_evidence'->>'attestation_sha256'=cfg->'historical_line_amount_approval'->>'sha256')) THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
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
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '60860e4c0dc6dd58bf0382e8c40b383b6c7a581104ec9d5e1ca96919b1fc62f5' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,int4)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
DO $install$
DECLARE original text; definition text; metadata jsonb;
 next_body text := $body$
DECLARE a naijue_erp.audit_change%ROWTYPE; item jsonb; expected jsonb; table_name text; audit_records jsonb; intent_operation uuid; intent_whole boolean; intent_root text; intent_proof jsonb;
BEGIN
 IF current_setting('role') NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') THEN RETURN false; END IF;
 IF native_row ? 'id' AND native_row->>'id' IS NOT NULL THEN
  DECLARE source_ids uuid[]; proof jsonb; exact_audit naijue_erp.audit_change%ROWTYPE;
  BEGIN
   SELECT array_agg(s.id) INTO source_ids FROM naijue_erp.import_batch b JOIN naijue_erp.import_record s
    ON s.import_batch_id=b.id AND s.target_type=kind AND s.target_id=(native_row->>'id')::uuid AND s.status='IMPORTED' AND s.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%'
    WHERE b.mapping_version IN ('STANDARD_INITIAL_EXPLICIT_KEYS_V1','DOCUMENT_CONVERSION_V1')
     AND s.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
   IF cardinality(source_ids)=1 THEN
    SELECT intent_audit.* INTO STRICT exact_audit FROM naijue_erp.audit_change intent_audit JOIN naijue_erp.import_record source_record ON intent_audit.operation_id=(source_record.decision_reason::jsonb->>'operationId')::uuid WHERE source_record.id=source_ids[1];
    IF exact_audit.after_values ? 'whole_package_v2' THEN
     proof:=naijue_erp.standard_import_record_proof(source_ids[1]);
     PERFORM naijue_erp.standard_whole_package_validate_context_v2((exact_audit.after_values->'whole_package_v2'->>'root_operation')::uuid,false);
     IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') OR proof->'current_operation' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
     EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(kind COLLATE "C")) INTO expected USING proof->'fields';
     RETURN expected=native_row;
    END IF;
   END IF;
  END;
 END IF;
 table_name:=lower(kind);
 IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN RETURN false; END IF;
 FOR intent_operation,intent_whole,intent_root,audit_records IN
  SELECT source_a.operation_id,selected_values.value ? 'whole_package_v2',
   selected_values.value->'whole_package_v2'->>'root_operation',selected_values.value->'records'
  FROM naijue_erp.audit_change source_a
  CROSS JOIN LATERAL (
   SELECT source_a.after_values #> ARRAY[]::text[] AS value
   OFFSET 0
  ) selected_values
  WHERE source_a.object_type='IMPORT' AND selected_values.value->>'profile'='STANDARD_IMPORT_SQL_V1'
   AND source_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(audit_records) WHERE value->>'target_type'=kind LOOP
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF expected=native_row THEN
    IF intent_whole THEN
     intent_proof:=naijue_erp.standard_import_record_proof((item->>'id')::uuid);
     IF intent_proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
      OR intent_proof->>'operation_id' IS DISTINCT FROM intent_operation::text
      OR intent_proof->>'target_type' IS DISTINCT FROM kind
      OR intent_proof->'id' IS DISTINCT FROM item->'id'
      OR intent_proof->'target_id' IS DISTINCT FROM item->'target_id'
      OR intent_proof->'fields' IS DISTINCT FROM item->'fields' THEN
      RAISE EXCEPTION 'STANDARD_ROW_INTENT_CURRENT_PROOF_REQUIRED' USING ERRCODE='23514';
     END IF;
     PERFORM naijue_erp.standard_whole_package_validate_context_v2(intent_root::uuid,false);
    END IF;
    RETURN true;
   END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $body$;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid),to_jsonb(p)-'prosrc' INTO STRICT original,definition,metadata
 FROM pg_catalog.pg_proc p WHERE oid='naijue_erp.standard_import_row_intent(text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') IS DISTINCT FROM '2f5e59f30d3b4c36c80840e226cbcbdf4d15c23a1cb9f0f18ee842d7b5184ed7' THEN
  RAISE EXCEPTION 'BATCH_PREDECESSOR_DIFFERS' USING ERRCODE='55000';
 END IF;
 IF strpos(definition,original)=0 OR strpos(substr(definition,strpos(definition,original)+length(original)),original)>0 THEN
  RAISE EXCEPTION 'BATCH_DEFINITION_DIFFERS' USING ERRCODE='55000';
 END IF;
 EXECUTE replace(definition,original,next_body);
 IF (SELECT to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p
   WHERE oid='naijue_erp.standard_import_row_intent(text,jsonb)'::regprocedure) IS DISTINCT FROM metadata THEN
  RAISE EXCEPTION 'BATCH_METADATA_DIFFERS' USING ERRCODE='55000';
 END IF;
END $install$;
-- SOURCE CANDIDATE. Requires matching group-writing command and commit guards.
-- No runtime EXECUTE grant is issued by this slice.
CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_inspect_kernel_v1(identity jsonb,work_batch jsonb,required_capability text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE root_operation uuid:=(identity->>'rootOperationId')::uuid; root_r naijue_erp.operation_receipt%ROWTYPE;
 last_r naijue_erp.operation_receipt%ROWTYPE; previous_r naijue_erp.operation_receipt%ROWTYPE;
 marker jsonb; sub_batch uuid; previous_id uuid;
 assigned_xid xid8;
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
 IF required_capability IS NULL OR required_capability NOT IN ('INITIALIZER','ROLE_IMPORTER') THEN
  RAISE EXCEPTION 'BATCH_INSPECT_CAPABILITY_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM naijue_erp.standard_import_identity(NULL,required_capability);
 IF NOT pg_has_role(session_user,'erp_unified27_initializer_2393dbc6db9581c2','SET') THEN
  RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;

 IF jsonb_typeof(identity) IS DISTINCT FROM 'object'
  OR NOT(identity ?& ARRAY['rootOperationId','batchId','documentBatchId','packageSha256','planSha256','namespace','cutoffAt'])
  OR identity-ARRAY['rootOperationId','batchId','documentBatchId','packageSha256','planSha256','namespace','cutoffAt']<>'{}'
  OR jsonb_typeof(work_batch) IS DISTINCT FROM 'object' OR octet_length(work_batch::text)>8192
  OR NOT(work_batch ?& ARRAY['phase','first','last','rows','bytes','ordinal','subBatchId','predecessor','descriptorSha256',
     'firstOperationId','lastOperationId','previousLastOperationId','previousDescriptorSha256'])
  OR work_batch-ARRAY['phase','first','last','rows','bytes','ordinal','subBatchId','predecessor','descriptorSha256',
     'firstOperationId','lastOperationId','previousLastOperationId','previousDescriptorSha256']<>'{}'
  OR (work_batch->>'descriptorSha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR (identity->>'packageSha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR (identity->>'planSha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
  OR EXISTS(SELECT 1 FROM jsonb_each(identity) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR EXISTS(SELECT 1 FROM jsonb_each(work_batch) e WHERE e.key IN ('first','last','ordinal','rows','bytes')
     AND (jsonb_typeof(e.value) IS DISTINCT FROM 'number' OR (e.value::text ~ '^[0-9]+$') IS DISTINCT FROM true))
 THEN RAISE EXCEPTION 'BATCH_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 sub_batch:=(work_batch->>'subBatchId')::uuid;
 IF root_operation IS NULL OR sub_batch IS NULL
  OR (identity->>'batchId')::uuid IS NULL OR (identity->>'documentBatchId')::uuid IS NULL
  OR (work_batch->>'firstOperationId')::uuid IS NULL OR (work_batch->>'lastOperationId')::uuid IS NULL
  OR (identity->>'batchId')::uuid=(identity->>'documentBatchId')::uuid
  OR (work_batch->>'first')::bigint>(work_batch->>'last')::bigint
  OR (work_batch->>'last')::bigint>2147483647
  OR (work_batch->>'ordinal')::bigint>2147483647
  OR (work_batch->>'phase' NOT IN ('CORE','MASTER','KEYS','BASELINE_CLOSE','DOCUMENT_OPEN','HISTORY','FINALIZE'))
  OR work_batch->>'phase' IS NULL
 THEN RAISE EXCEPTION 'BATCH_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 -- Every writer takes these locks in this order before checking visibility.
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-work-batch:'||sub_batch::text,0));
 SELECT * INTO root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 IF NOT FOUND THEN
  IF work_batch->>'phase' IS DISTINCT FROM 'CORE' OR work_batch->'ordinal' IS DISTINCT FROM '0'::jsonb
   OR work_batch->'first' IS DISTINCT FROM '0'::jsonb OR work_batch->'last' IS DISTINCT FROM '0'::jsonb
   OR work_batch->>'firstOperationId' IS DISTINCT FROM root_operation::text
   OR work_batch->>'lastOperationId' IS DISTINCT FROM root_operation::text
   OR work_batch->'predecessor' IS DISTINCT FROM 'null'::jsonb
   OR work_batch->'previousLastOperationId' IS DISTINCT FROM 'null'::jsonb
   OR work_batch->'previousDescriptorSha256' IS DISTINCT FROM 'null'::jsonb
   OR EXISTS(SELECT 1 FROM naijue_erp.import_batch
      WHERE id IN ((identity->>'batchId')::uuid,(identity->>'documentBatchId')::uuid))
  THEN RAISE EXCEPTION 'BATCH_ROOT_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('state','ABSENT','subBatchId',sub_batch,
    'descriptorSha256',work_batch->>'descriptorSha256','summary',NULL);
 END IF;
 marker:=root_r.result_data->'batched_import_v1';
 IF marker->'identity' IS DISTINCT FROM identity OR marker->>'controller' IS DISTINCT FROM session_user
  OR root_r.action IS DISTINCT FROM 'IMPORT_INITIALIZE_CURRENT_ADMIN'
  OR root_r.target_type IS DISTINCT FROM 'IMPORT' OR root_r.status IS DISTINCT FROM 'COMMITTED'
  OR root_r.target_id IS DISTINCT FROM (identity->>'batchId')::uuid THEN
  RAISE EXCEPTION 'BATCH_ROOT_CONFLICT' USING ERRCODE='23505'; END IF;
 assigned_xid:=pg_current_xact_id_if_assigned();
 IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q
   WHERE q.id=root_r.id AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
 IF work_batch->>'phase'<>'CORE' THEN
  previous_id:=(work_batch->>'previousLastOperationId')::uuid;
  SELECT * INTO STRICT previous_r FROM naijue_erp.operation_receipt WHERE id=previous_id;
  marker:=previous_r.result_data->'batched_import_v1';
  IF marker->'identity' IS DISTINCT FROM identity OR marker->>'controller' IS DISTINCT FROM session_user
   OR marker->'descriptor'->>'subBatchId' IS DISTINCT FROM work_batch->>'predecessor'
   OR marker->'descriptor'->>'descriptorSha256' IS DISTINCT FROM work_batch->>'previousDescriptorSha256'
   OR (marker->'descriptor'->>'ordinal')::bigint+1 IS DISTINCT FROM (work_batch->>'ordinal')::bigint
   OR (marker->'descriptor'->>'last')::bigint+1 IS DISTINCT FROM (work_batch->>'first')::bigint
   OR marker->'descriptor'->>'lastOperationId' IS DISTINCT FROM previous_r.id::text
   OR previous_r.status IS DISTINCT FROM 'COMMITTED' OR previous_r.target_type IS DISTINCT FROM 'IMPORT'
   OR previous_r.actor_account_id IS DISTINCT FROM root_r.actor_account_id THEN
   RAISE EXCEPTION 'BATCH_PREDECESSOR_CONFLICT' USING ERRCODE='23505'; END IF;
  IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=previous_r.id
    AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN
   RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
 END IF;
 SELECT * INTO last_r FROM naijue_erp.operation_receipt WHERE id=(work_batch->>'lastOperationId')::uuid;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=(work_batch->>'firstOperationId')::uuid) THEN
   RAISE EXCEPTION 'BATCH_PARTIAL_GROUP_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('state','ABSENT','subBatchId',sub_batch,
    'descriptorSha256',work_batch->>'descriptorSha256','summary',NULL);
 END IF;
 marker:=last_r.result_data->'batched_import_v1';
 IF marker->'identity' IS DISTINCT FROM identity OR marker->'descriptor' IS DISTINCT FROM work_batch
  OR marker->>'controller' IS DISTINCT FROM session_user
  OR last_r.status IS DISTINCT FROM 'COMMITTED' OR last_r.target_type IS DISTINCT FROM 'IMPORT'
  OR last_r.actor_account_id IS DISTINCT FROM root_r.actor_account_id
  OR (work_batch->>'phase'='FINALIZE' AND (last_r.result_data->>'phase' IS DISTINCT FROM 'DOCUMENT_PUBLISH'
     OR last_r.result_data->>'status' IS DISTINCT FROM 'IMPORTED')) THEN
  RAISE EXCEPTION 'BATCH_COMMITTED_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF assigned_xid IS NOT NULL AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=last_r.id
   AND q.xmin::text::bigint=mod(assigned_xid::text::numeric,4294967296)::bigint) THEN
  RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
 RETURN jsonb_build_object('state','COMMITTED','subBatchId',sub_batch,
   'descriptorSha256',work_batch->>'descriptorSha256',
   'summary',CASE WHEN work_batch->>'phase'='FINALIZE' THEN jsonb_build_object(
     'rootOperationId',root_operation,'batchId',identity->>'batchId',
     'documentBatchId',identity->>'documentBatchId','packageSha256',identity->>'packageSha256',
     'planSha256',identity->>'planSha256','status','IMPORTED') ELSE NULL END);
END $function$;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_inspect_kernel_v1(jsonb,jsonb,text) FROM PUBLIC;

-- Public inspect retains its original IMPORTER-only entry requirement.
CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_inspect_v1(identity jsonb,work_batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
BEGIN
 PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
 RETURN naijue_erp.standard_batched_import_inspect_kernel_v1(identity,work_batch,'ROLE_IMPORTER');
END $function$;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb) FROM PUBLIC;

-- Internal group commit check, source only.
CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_assert_group_v1(root_operation uuid,work_batch jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE identity jsonb:=work_batch->'identity'; descriptor jsonb:=work_batch->'work_batch';
 root_r naijue_erp.operation_receipt%ROWTYPE; expected_marker jsonb;
 member_count bigint; ordinal_count bigint; valid boolean; first_ordinal integer; last_ordinal integer;
BEGIN
 PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT root_r FROM naijue_erp.operation_receipt WHERE id=root_operation;
 first_ordinal:=(descriptor->>'first')::integer;last_ordinal:=(descriptor->>'last')::integer;
 IF root_r.result_data->'batched_import_v1'->'identity' IS DISTINCT FROM identity
  OR identity->>'rootOperationId' IS DISTINCT FROM root_operation::text
  OR first_ordinal IS NULL OR last_ordinal IS NULL OR first_ordinal<0 OR last_ordinal<first_ordinal THEN
  RAISE EXCEPTION 'BATCH_GROUP_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 expected_marker:=jsonb_build_object('identity',identity,'descriptor',descriptor,
   'full_xid',pg_current_xact_id()::text,'controller',session_user);
 SELECT count(*),count(DISTINCT (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)),bool_and((
   a.after_values->'batched_import_v1'=expected_marker
   AND r.result_data->'batched_import_v1'=expected_marker
   AND a.operation_id=r.id AND a.id=r.id AND a.object_type='IMPORT' AND r.target_type='IMPORT'
   AND a.object_id=r.target_id AND a.action=r.action
   AND a.actor_account_id=r.actor_account_id AND r.actor_account_id=root_r.actor_account_id
   AND r.status='COMMITTED' AND r.completed_at=transaction_timestamp() AND a.occurred_at=r.completed_at
   AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
   AND a.xmin::text::bigint=r.xmin::text::bigint
   AND ((CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)<>first_ordinal OR r.id=(descriptor->>'firstOperationId')::uuid)
   AND ((CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)<>last_ordinal OR r.id=(descriptor->>'lastOperationId')::uuid)) IS TRUE)
 INTO member_count,ordinal_count,valid
 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
 WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END) BETWEEN first_ordinal AND last_ordinal;
 IF member_count<>last_ordinal::bigint-first_ordinal+1 OR ordinal_count<>member_count OR valid IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BATCH_COMPLETE_CURRENT_GROUP_REQUIRED' USING ERRCODE='23514'; END IF;
END $function$;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_command_v2(request jsonb, private_parameter text, command_phase text, root_operation uuid, child_ordinal integer, work_batch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'naijue_erp', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE actor uuid; operation uuid; batch uuid; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE; prior_a naijue_erp.audit_change%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE; initial_request jsonb; payload jsonb; cp jsonb; old_cp jsonb; records jsonb:='[]';
 entry jsonb; fields jsonb; item jsonb; result jsonb; source_ids jsonb:='[]'; ledger_ids jsonb:='[]'; expected jsonb; actual jsonb; cfg jsonb; admin jsonb;
 table_name text; kind text; target uuid; record_id uuid; source_hash text; quantity bigint; counter text; action_name text; phase text; source_key text; file_ref text;
 n integer; source_count integer; total numeric; parsed jsonb; doc jsonb; doc_id uuid; child_op uuid; child_result jsonb; snap jsonb; anchor_baseline jsonb; key_proof jsonb; endpoints record;
 pk_exists boolean; registry_basis text; encoded text; parent_row record; any_rows boolean;
 visible_root_count bigint; foreign_import_found boolean;
 group_identity jsonb; group_descriptor jsonb; group_marker jsonb; group_read jsonb; first_r naijue_erp.operation_receipt%ROWTYPE;
 execution_contract jsonb; master_chunks_v2 boolean:=false; master_limit numeric:=500;
 max_master_chunk_rows integer:=500; expected_master_chunks integer;
 admin_provision_snapshot jsonb;
 whole_context jsonb; whole_marker jsonb; prior_rank integer; next_rank integer;
 hall_approval jsonb; hall_approved jsonb; hall_approvals jsonb; hall_evidence jsonb;
 hall_capture jsonb;hall_bridge jsonb;hall_resolution jsonb;hall_target jsonb;hall_member_count integer;
 hall_target_captures jsonb:='{}';hall_observation jsonb;hall_master_id uuid;hall_master_proof jsonb;hall_master_audit naijue_erp.audit_change%ROWTYPE;hall_actual jsonb;hall_actual_xid bigint;
 amount_descriptor jsonb; amount_approval jsonb; amount_fact jsonb; amount_parent jsonb; amount_evidence jsonb; amount_facts_by_id jsonb;
 amount_ref_key text; amount_consumed bigint; amount_unique bigint;
 zero_descriptor jsonb;zero_evidence jsonb;zero_fact jsonb;zero_hash text;zero_sibling text;
 zero_index integer;zero_width integer;zero_consumed bigint;zero_unique bigint;
BEGIN
 group_identity:=work_batch->'identity';group_descriptor:=work_batch->'work_batch';
 IF group_identity->>'rootOperationId' IS DISTINCT FROM root_operation::text
  OR group_identity->>'namespace' IS DISTINCT FROM request->>'namespace'
  OR group_identity->>'packageSha256' IS DISTINCT FROM request->>'package_manifest_sha256'
  OR group_identity->>'planSha256' IS DISTINCT FROM request->>'plan_sha256'
  OR group_identity->>'cutoffAt' IS DISTINCT FROM request->>'cutoff_at'
  OR child_ordinal NOT BETWEEN (group_descriptor->>'first')::integer AND (group_descriptor->>'last')::integer
  OR child_ordinal IS NULL
  OR (command_phase='INITIALIZE' AND (request->>'batch_id' IS DISTINCT FROM group_identity->>'batchId'
      OR request->'payload'->>'document_batch_id' IS DISTINCT FROM group_identity->>'documentBatchId'))
  OR (CASE group_descriptor->>'phase'
    WHEN 'CORE' THEN command_phase='INITIALIZE'
    WHEN 'MASTER' THEN command_phase='MASTER'
    WHEN 'KEYS' THEN command_phase='KEYS'
    WHEN 'BASELINE_CLOSE' THEN command_phase='PUBLISH' AND request->'payload'->>'phase'='BASELINE'
    WHEN 'DOCUMENT_OPEN' THEN command_phase='DOCUMENTS' AND request->'payload'->>'mode'='STAGE'
    WHEN 'HISTORY' THEN command_phase='DOCUMENTS' AND request->'payload'->>'mode'='CHUNK'
    WHEN 'FINALIZE' THEN command_phase='PUBLISH' AND request->'payload'->>'phase'='DOCUMENTS'
    ELSE false END) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'BATCH_STEP_BINDING_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-work-batch:'||(group_descriptor->>'subBatchId'),0));
 IF child_ordinal=(group_descriptor->>'first')::integer THEN
  IF command_phase='INITIALIZE' THEN
   PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
   group_read:=naijue_erp.standard_batched_import_inspect_kernel_v1(group_identity,group_descriptor,'INITIALIZER');
  ELSE
   group_read:=naijue_erp.standard_batched_import_inspect_v1(group_identity,group_descriptor);
  END IF;
  IF group_read->>'state' IS DISTINCT FROM 'ABSENT' THEN
   RAISE EXCEPTION 'BATCH_ALREADY_COMMITTED_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
  IF group_descriptor->>'firstOperationId' IS DISTINCT FROM request->>'operation_id' THEN
   RAISE EXCEPTION 'BATCH_FIRST_OPERATION_INVALID' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT first_r FROM naijue_erp.operation_receipt
    WHERE id=(group_descriptor->>'firstOperationId')::uuid;
  IF first_r.result_data->'batched_import_v1'->'identity' IS DISTINCT FROM group_identity
   OR first_r.result_data->'batched_import_v1'->'descriptor' IS DISTINCT FROM group_descriptor
   OR first_r.result_data->'batched_import_v1'->>'full_xid' IS DISTINCT FROM pg_current_xact_id()::text
   OR first_r.result_data->'batched_import_v1'->>'controller' IS DISTINCT FROM session_user
   OR first_r.completed_at IS DISTINCT FROM transaction_timestamp()
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt q WHERE q.id=first_r.id
       AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
   RAISE EXCEPTION 'BATCH_CURRENT_FIRST_OPERATION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF child_ordinal=(group_descriptor->>'last')::integer
  AND group_descriptor->>'lastOperationId' IS DISTINCT FROM request->>'operation_id' THEN
  RAISE EXCEPTION 'BATCH_LAST_OPERATION_INVALID' USING ERRCODE='23514'; END IF;
 group_marker:=jsonb_build_object('identity',group_identity,'descriptor',group_descriptor,
   'full_xid',pg_current_xact_id()::text,'controller',session_user);
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
  IF child_ordinal IS NULL OR child_ordinal<1
  THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  EXECUTE $root_branches$
SELECT counted.root_count,foreign_rows.foreign_found
FROM (
SELECT 0::bigint AS root_count
) counted CROSS JOIN (
SELECT EXISTS(
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)<$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)>$1 AND xmin::text::bigint=$2
 UNION ALL
 SELECT 1 FROM naijue_erp.audit_change
 WHERE object_type='IMPORT' AND (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NULL AND xmin::text::bigint=$2
) AS foreign_found
) foreign_rows
$root_branches$
INTO visible_root_count,foreign_import_found
USING root_operation,mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
IF foreign_import_found OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
 (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
 THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
 CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647
 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal)
THEN RAISE EXCEPTION 'WHOLE_ORDINAL_INVALID' USING ERRCODE='23514'; END IF;
  next_rank:=CASE command_phase WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'PUBLISH' THEN CASE payload->>'phase' WHEN 'BASELINE' THEN 3 WHEN 'DOCUMENTS' THEN 6 END WHEN 'DOCUMENTS' THEN CASE payload->>'mode' WHEN 'STAGE' THEN 4 WHEN 'CHUNK' THEN 5 END END;
  IF EXISTS(SELECT 1 FROM naijue_erp.audit_change
     WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
  (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
     CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END) IS NULL) THEN
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (after_values->'whole_package_v2'->>'ordinal')::integer=child_ordinal-1;
  ELSE
    SELECT CASE after_values->>'phase' WHEN 'INITIALIZE' THEN 0 WHEN 'MASTER' THEN 1 WHEN 'KEYS' THEN 2 WHEN 'BASELINE_SEAL' THEN 3 WHEN 'DOCUMENT_STAGE' THEN 4 WHEN 'DOCUMENTS' THEN 5 WHEN 'DOCUMENT_PUBLISH' THEN 6 END INTO STRICT prior_rank
     FROM naijue_erp.audit_change WHERE (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END)=root_operation AND after_values->'whole_package_v2'->>'root_operation'=root_operation::text AND (CASE WHEN (CASE WHEN octet_length(after_values->'whole_package_v2'->>'root_operation')=36 AND
    (after_values->'whole_package_v2'->>'root_operation') COLLATE "C" ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN (after_values->'whole_package_v2'->>'root_operation')::uuid END) IS NOT NULL THEN (CASE WHEN after_values->'whole_package_v2'->>'ordinal' ~ '^[0-9]{1,10}$' THEN
       CASE WHEN (after_values->'whole_package_v2'->>'ordinal')::bigint<=2147483647 THEN (after_values->'whole_package_v2'->>'ordinal')::integer END END) END)=child_ordinal-1;
  END IF;
  IF next_rank IS NULL OR prior_rank IS NULL OR next_rank<prior_rank OR prior_rank=6 THEN RAISE EXCEPTION 'WHOLE_PHASE_ORDER_INVALID' USING ERRCODE='23514'; END IF;
  fingerprint:=encode(sha256(convert_to(command_phase||':'||request::text,'UTF8')),'hex'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:standard-receipt:'||actor::text||':'||(request->>'request_key'),0));
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE actor_account_id=actor AND request_key=request->>'request_key';
 IF FOUND THEN RAISE EXCEPTION 'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'STANDARD_ONE_MUTATION_PER_TRANSACTION' USING ERRCODE='25000'; END IF;
 IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=operation) THEN RAISE EXCEPTION 'STANDARD_OPERATION_ID_CONFLICT' USING ERRCODE='23505'; END IF;
 IF command_phase='INITIALIZE' THEN
  IF payload-ARRAY['mode','provision_operation_id','provision_request_sha256','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval','historical_hall_approval','historical_line_amount_approval','historical_settlement_retention_approval']<>'{}'
   OR NOT(payload ?& ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents'])
   OR (payload->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR payload->>'mode' IS NULL)
   OR (payload->>'mode'='NEW_EMPTY' AND payload ?| ARRAY['provision_operation_id','provision_request_sha256'])
   OR (payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' AND (NOT(payload ?& ARRAY['provision_operation_id','provision_request_sha256']) OR (payload->>'provision_operation_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM true OR (payload->>'provision_request_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true)) OR (payload->'admin') - ARRAY['staff_id','account_id','login_name','staff_name']<>'{}'
   OR private_parameter IS NULL OR private_parameter !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
   OR coalesce(length(btrim(payload->>'manifest_ref')),0)=0 OR (payload->>'registry_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR (payload->>'alignment_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true
   OR coalesce(length(btrim(payload->'admin'->>'login_name')),0)=0 OR coalesce(length(btrim(payload->'admin'->>'staff_name')),0)=0 THEN
   RAISE EXCEPTION 'STANDARD_INITIALIZATION_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'schema_declarations_sha256' AND (jsonb_typeof(payload->'schema_declarations_sha256') IS DISTINCT FROM 'string' OR payload->>'schema_declarations_sha256' NOT IN ('e929e89fe7f026d10e6fd35af37d1eb48cd07db2f7da4eed76352e497b134cb9','7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')) THEN
   RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_staff_hall_approval' THEN
   expected:=payload->'historical_staff_hall_approval';
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR expected-ARRAY['utf8','sha256']<>'{}'
    OR NOT(expected ?& ARRAY['utf8','sha256']) OR jsonb_typeof(expected->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(expected->>'utf8','UTF8')) NOT BETWEEN 1 AND 1048576
    OR (expected->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(expected->>'utf8','UTF8')),'hex') IS DISTINCT FROM expected->>'sha256'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   expected:=(expected->>'utf8')::jsonb;
   IF jsonb_typeof(expected) IS DISTINCT FROM 'object'
    OR expected-ARRAY['format_version','source_namespace','evidence_sha256','staff']<>'{}'
    OR NOT(expected ?& ARRAY['format_version','source_namespace','evidence_sha256','staff'])
    OR expected->>'format_version' IS DISTINCT FROM 'HISTORICAL_STAFF_NULL_HALL_APPROVAL_V1'
    OR expected->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (expected->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(expected->'staff') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(expected->'staff') NOT BETWEEN 1 AND 1000
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(expected->'staff'))<>jsonb_array_length(expected->'staff')
   THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(expected->'staff') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['source_key','target_id','source_refs']<>'{}'
     OR NOT(item ?& ARRAY['source_key','target_id','source_refs'])
     OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR length(item->>'source_key')=0 OR item->>'source_key' ~ '[[:cntrl:]]' OR item->>'source_key' IS DISTINCT FROM btrim(item->>'source_key',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')
     OR (item->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(item->'source_refs')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'source_refs') ref WHERE
     jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
     OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
     OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647
     OR (ref->'sheet'<>'null'::jsonb AND (length(ref->>'sheet')=0 OR ref->>'sheet' ~ '[[:cntrl:]]' OR ref->>'sheet' IS DISTINCT FROM btrim(ref->>'sheet',U&' \00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'))))
    THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF (SELECT count(DISTINCT ref) FROM jsonb_array_elements(item->'source_refs') ref)<>jsonb_array_length(item->'source_refs') THEN RAISE EXCEPTION 'STAFF_HALL_APPROVAL_DUPLICATE_REF' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  -- The trusted host derives this descriptor only after independently pinned
  -- complete-file verification. SQL proves membership, not external authority.
  IF payload ? 'explicit_zero_approval' THEN
   zero_descriptor:=payload->'explicit_zero_approval';
   IF zero_descriptor->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    IF zero_descriptor-ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals']<>'{}'
     OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','source_namespace','inventory_file_sha256','cutoff_at','batch_key','input_manifest_sha256','registry_sha256','warehouses','skus','explicit_values','universe_count','nonzero_count','warehouse_totals'])
     OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace' OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('sha256','inventory_file_sha256','input_manifest_sha256','registry_sha256') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'string' OR (v.value#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true))
     OR zero_descriptor->>'registry_sha256' IS DISTINCT FROM payload->>'registry_sha256'
     OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
     OR coalesce(length(btrim(zero_descriptor->>'batch_key')),0)=0
     OR jsonb_typeof(zero_descriptor->'warehouse_totals') IS DISTINCT FROM 'array'
     OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) v WHERE v.key IN ('universe_count','nonzero_count') AND (jsonb_typeof(v.value) IS DISTINCT FROM 'number' OR (v.value::text ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true))
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT zero_descriptor->k FROM unnest(ARRAY['warehouses','skus','explicit_values']) k LOOP
     IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['sha256','records_sha256','count']<>'{}' OR NOT(item ?& ARRAY['sha256','records_sha256','count'])
      OR (item->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (item->>'records_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
      OR jsonb_typeof(item->'count') IS DISTINCT FROM 'number' OR (item->>'count' ~ '^(0|[1-9][0-9]*)$') IS DISTINCT FROM true
     THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_PIN_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF (zero_descriptor->'warehouses'->>'count')::numeric<1 OR (zero_descriptor->'skus'->>'count')::numeric<1
     OR (zero_descriptor->>'universe_count')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric*(zero_descriptor->'skus'->>'count')::numeric
     OR zero_descriptor->'explicit_values'->'count' IS DISTINCT FROM payload->'expected'->'INVENTORY_KEY'
     OR zero_descriptor->'nonzero_count' IS DISTINCT FROM payload->'expected'->'INVENTORY_EFFECT'
     OR jsonb_array_length(zero_descriptor->'warehouse_totals')::numeric IS DISTINCT FROM (zero_descriptor->'warehouses'->>'count')::numeric
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
   IF jsonb_typeof(zero_descriptor) IS DISTINCT FROM 'object'
    OR zero_descriptor-ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256']<>'{}'
    OR NOT(zero_descriptor ?& ARRAY['format_version','sha256','inventory_file_sha256','source_namespace','cutoff_at','record_count','merkle_root_sha256'])
    OR zero_descriptor->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_APPROVAL_MERKLE_V1'
    OR zero_descriptor->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR zero_descriptor->>'cutoff_at' IS DISTINCT FROM request->>'cutoff_at'
    OR EXISTS(SELECT 1 FROM jsonb_each(zero_descriptor) e WHERE e.key<>'record_count' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
    OR (zero_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR (zero_descriptor->>'inventory_file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR zero_descriptor->>'sha256'=zero_descriptor->>'inventory_file_sha256'
    OR (zero_descriptor->>'merkle_root_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(zero_descriptor->'record_count') IS DISTINCT FROM 'number'
    OR (zero_descriptor->>'record_count' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_INVALID' USING ERRCODE='23514'; END IF;
   IF (zero_descriptor->>'record_count')::numeric NOT BETWEEN 1 AND 250000
    OR (zero_descriptor->>'record_count')::numeric>(payload->'expected'->>'INVENTORY_KEY')::numeric
   THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_COUNT_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
  IF payload->>'schema_declarations_sha256' IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') AND NOT(payload ? 'historical_hall_approval') THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_REQUIRED_PROFILE_APPROVAL' USING ERRCODE='23514'; END IF;
  IF payload ? 'historical_hall_approval' THEN
   hall_approval:=payload->'historical_hall_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-ARRAY['utf8','sha256']<>'{}' OR NOT(hall_approval ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(hall_approval->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(hall_approval->>'utf8','UTF8')) NOT BETWEEN 1 AND 67108864
    OR (hall_approval->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR encode(sha256(convert_to(hall_approval->>'utf8','UTF8')),'hex') IS DISTINCT FROM hall_approval->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
   hall_approval:=(hall_approval->>'utf8')::jsonb;
   IF jsonb_typeof(hall_approval) IS DISTINCT FROM 'object' OR hall_approval-(ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END)<>'{}'
    OR NOT(hall_approval ?& (ARRAY['format_version','source_namespace','evidence_sha256','records']||CASE WHEN hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN ARRAY['source_captures','identity_bridges','resolutions'] ELSE ARRAY[]::text[] END))
    OR hall_approval->>'format_version' IS DISTINCT FROM (CASE WHEN payload->>'schema_declarations_sha256'='b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b' THEN 'HISTORICAL_SALES_HALL_APPROVAL_V2' ELSE 'HISTORICAL_SALES_HALL_APPROVAL_V1' END)
    OR hall_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (hall_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(hall_approval->'records') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(hall_approval->'records') NOT BETWEEN 1 AND 250000
    OR jsonb_array_length(hall_approval->'records')::numeric IS DISTINCT FROM (payload->'expected_documents'->>'SALES_HEADER')::numeric
    OR (SELECT count(DISTINCT value->>'target_id') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records')
    OR (SELECT count(DISTINCT value->>'source_key') FROM jsonb_array_elements(hall_approval->'records'))<>jsonb_array_length(hall_approval->'records') THEN
    RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' THEN
 IF jsonb_typeof(hall_approval->'source_captures') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'source_captures') NOT BETWEEN 1 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'identity_bridges') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'identity_bridges') NOT BETWEEN 1 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_approval->'resolutions') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_approval->'resolutions') NOT BETWEEN 0 AND 250000 THEN RAISE EXCEPTION 'HISTORICAL_HALL_MEMBERS_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR hall_approved IN SELECT value FROM jsonb_array_elements(hall_approval->'records') LOOP
    IF jsonb_typeof(hall_approved) IS DISTINCT FROM 'object' OR hall_approved-(ARRAY['source_key','target_id','source_refs','evidence']||CASE WHEN hall_approved->'evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_approved->'evidence'->'target_snapshot'->'captured_at'='null'::jsonb THEN ARRAY['target_initialization'] ELSE ARRAY[]::text[] END)<>'{}'
     OR NOT(hall_approved ?& ARRAY['source_key','target_id','source_refs','evidence'])
     OR jsonb_typeof(hall_approved->'source_key') IS DISTINCT FROM 'string' OR length(btrim(hall_approved->>'source_key'))=0
     OR (hall_approved->>'target_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(hall_approved->'source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_RECORD' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(hall_approved->'source_refs') NOT BETWEEN 1 AND 100
     OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(hall_approved->'source_refs') ref)<>jsonb_array_length(hall_approved->'source_refs')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approved->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object'
      OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
      OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
      OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (ref->>'row')::numeric>2147483647) THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    hall_evidence:=hall_approved->'evidence';
    IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' AND hall_evidence->'target_snapshot'->'captured_at'='null'::jsonb THEN
     IF jsonb_typeof(hall_approved->'target_initialization') IS DISTINCT FROM 'object'
      OR (hall_approved->'target_initialization')-ARRAY['warehouse_source_key']<>'{}'
      OR jsonb_typeof(hall_approved->'target_initialization'->'warehouse_source_key') IS DISTINCT FROM 'string'
      OR length(btrim(hall_approved->'target_initialization'->>'warehouse_source_key'))=0
      OR hall_approved->'target_initialization'->>'warehouse_source_key' ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
    ELSIF hall_approved ? 'target_initialization' THEN RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MEMBER_UNEXPECTED' USING ERRCODE='23514'; END IF;

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_bridge_member WHERE hall_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

   END LOOP;
   IF hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2' AND (
    EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'source_capture'=c))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_registered_bridge_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'identity_bridge'->'evidence_sha256'=hall_registered_bridge_member->'evidence_sha256' AND r->'evidence'->'identity_bridge'->'record_key'=hall_registered_bridge_member->'record_key'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'resolutions') hall_registered_resolution_member WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_approval->'records') r WHERE r->'evidence'->'resolution'->'evidence_sha256'=hall_registered_resolution_member->'evidence_sha256' AND r->'evidence'->'resolution'->'record_key'=hall_registered_resolution_member->'record_key')))
   THEN RAISE EXCEPTION 'HISTORICAL_HALL_UNUSED_MEMBER' USING ERRCODE='23514'; END IF;
  END IF;
  -- Independent reviewed bytes are an attestation, not evidence of source truth
  -- by themselves. The trusted host supplies the separately approved SHA.
  IF payload ? 'historical_line_amount_approval' THEN
   amount_descriptor:=payload->'historical_line_amount_approval';
   IF coalesce(payload->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR jsonb_typeof(amount_descriptor) IS DISTINCT FROM 'object'
    OR amount_descriptor-ARRAY['utf8','sha256']<>'{}' OR NOT(amount_descriptor ?& ARRAY['utf8','sha256'])
    OR jsonb_typeof(amount_descriptor->'utf8') IS DISTINCT FROM 'string'
    OR octet_length(convert_to(amount_descriptor->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
    OR (amount_descriptor->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
    OR (amount_descriptor->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR encode(sha256(convert_to(amount_descriptor->>'utf8','UTF8')),'hex') IS DISTINCT FROM amount_descriptor->>'sha256' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_HASH' USING ERRCODE='23514'; END IF;
   amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   IF amount_approval-ARRAY['format_version','source_namespace','evidence_sha256','lines']<>'{}'
    OR NOT(amount_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','lines'])
    OR amount_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1'
    OR amount_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
    OR (amount_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
    OR jsonb_typeof(amount_approval->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SHAPE' USING ERRCODE='23514'; END IF;
   IF jsonb_array_length(amount_approval->'lines') NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_COUNT' USING ERRCODE='23514'; END IF;
   FOR amount_fact IN SELECT value FROM jsonb_array_elements(amount_approval->'lines') LOOP
    IF jsonb_typeof(amount_fact) IS DISTINCT FROM 'object'
     OR amount_fact-ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount']<>'{}'
     OR NOT(amount_fact ?& ARRAY['sales_source_key','sales_id','sales_source_refs','line_source_key','line_id','source_refs','quantity','deal_price','line_amount'])
     OR jsonb_typeof(amount_fact->'sales_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'sales_source_key' ~ '[[:cntrl:]]'
     OR jsonb_typeof(amount_fact->'line_source_key') IS DISTINCT FROM 'string'
     OR length(amount_fact->>'line_source_key') NOT BETWEEN 1 AND 65536 OR amount_fact->>'line_source_key' ~ '[[:cntrl:]]'
     OR (amount_fact->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR (amount_fact->>'line_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'quantity') IS DISTINCT FROM 'string'
     OR (amount_fact->>'quantity' ~ '^-?[1-9][0-9]{0,18}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'deal_price') IS DISTINCT FROM 'string'
     OR (amount_fact->>'deal_price' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'line_amount') IS DISTINCT FROM 'string'
     OR (amount_fact->>'line_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
     OR jsonb_typeof(amount_fact->'source_refs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(amount_fact->'sales_source_refs') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_FACT' USING ERRCODE='23514'; END IF;
    IF (amount_fact->>'quantity')::bigint::text IS DISTINCT FROM amount_fact->>'quantity'
     OR (amount_fact->>'line_amount')::numeric(18,2)::text IS DISTINCT FROM amount_fact->>'line_amount'
     OR (amount_fact->>'line_amount')::numeric=(amount_fact->>'quantity')::numeric*(amount_fact->>'deal_price')::numeric THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    FOREACH amount_ref_key IN ARRAY ARRAY['source_refs','sales_source_refs'] LOOP
     IF jsonb_array_length(amount_fact->amount_ref_key) NOT BETWEEN 1 AND 100
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_fact->amount_ref_key) ref)<>jsonb_array_length(amount_fact->amount_ref_key)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_fact->amount_ref_key) ref
       WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}'
        OR NOT(ref ?& ARRAY['file_sha256','sheet','row'])
        OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
        OR jsonb_typeof(ref->'sheet') NOT IN ('string','null')
        OR (jsonb_typeof(ref->'sheet')='string' AND (length(ref->>'sheet') NOT BETWEEN 1 AND 65536 OR ref->>'sheet' ~ '[[:cntrl:]]'))
        OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number'
        OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE true END)) THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    END LOOP;
   END LOOP;
   IF (SELECT count(DISTINCT fact->>'line_id') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT fact->>'line_source_key') FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines')
    OR (SELECT count(DISTINCT (SELECT jsonb_agg(ref ORDER BY ref::text) FROM jsonb_array_elements(fact->'source_refs') ref)) FROM jsonb_array_elements(amount_approval->'lines') fact)<>jsonb_array_length(amount_approval->'lines') THEN
    RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_APPROVAL_DUPLICATE' USING ERRCODE='23514'; END IF;
  END IF;
  IF payload ? 'historical_settlement_retention_approval' THEN
   DECLARE sr_wire jsonb:=payload->'historical_settlement_retention_approval';sr_approval jsonb;sr_doc jsonb;sr_row jsonb;sr_ref jsonb;sr_refs jsonb;sr_seen uuid[]:='{}';sr_rows uuid[]:='{}';sr_keys text[]:='{}';sr_row_keys text[]:='{}';sr_total numeric;sr_last integer;sr_used boolean:=false;
   BEGIN
    IF jsonb_typeof(sr_wire) IS DISTINCT FROM 'object' OR sr_wire-ARRAY['utf8','sha256']<>'{}' OR NOT(sr_wire ?& ARRAY['utf8','sha256'])
     OR jsonb_typeof(sr_wire->'utf8') IS DISTINCT FROM 'string' OR octet_length(convert_to(sr_wire->>'utf8','UTF8')) NOT BETWEEN 1 AND 4194304
     OR (sr_wire->>'utf8' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
     OR (sr_wire->>'sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR encode(sha256(convert_to(sr_wire->>'utf8','UTF8')),'hex') IS DISTINCT FROM sr_wire->>'sha256' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_HASH' USING ERRCODE='23514'; END IF;
    sr_approval:=(sr_wire->>'utf8')::jsonb;
    IF jsonb_typeof(sr_approval) IS DISTINCT FROM 'object' OR sr_approval-ARRAY['format_version','source_namespace','evidence_sha256','documents']<>'{}'
     OR NOT(sr_approval ?& ARRAY['format_version','source_namespace','evidence_sha256','documents'])
     OR sr_approval->>'format_version' IS DISTINCT FROM 'HISTORICAL_SETTLEMENT_RETENTION_V1'
     OR sr_approval->>'source_namespace' IS DISTINCT FROM request->>'namespace'
     OR (sr_approval->>'evidence_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true
     OR jsonb_typeof(sr_approval->'documents') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(sr_approval->'documents')<>25 AND NOT(jsonb_array_length(sr_approval->'documents')=24 AND sr_wire->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b') THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
    FOR sr_doc IN SELECT value FROM jsonb_array_elements(sr_approval->'documents') LOOP
     IF jsonb_typeof(sr_doc) IS DISTINCT FROM 'object' OR sr_doc-ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements']<>'{}'
      OR NOT(sr_doc ?& ARRAY['sales_source_key','sales_id','source_refs','business_type','status','gross_amount','order_discount','net_due','settlements'])
      OR jsonb_typeof(sr_doc->'sales_source_key') IS DISTINCT FROM 'string' OR length(sr_doc->>'sales_source_key') NOT BETWEEN 1 AND 65536 OR sr_doc->>'sales_source_key' ~ '[[:cntrl:]]'
      OR (sr_doc->>'sales_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
      OR coalesce(sr_doc->>'business_type','') NOT IN ('SALE','RETURN') OR sr_doc->>'status' IS DISTINCT FROM 'APPROVED'
      OR jsonb_typeof(sr_doc->'gross_amount') IS DISTINCT FROM 'string' OR (sr_doc->>'gross_amount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'order_discount') IS DISTINCT FROM 'string' OR (sr_doc->>'order_discount' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'net_due') IS DISTINCT FROM 'string' OR (sr_doc->>'net_due' ~ '^-?(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
      OR jsonb_typeof(sr_doc->'settlements') IS DISTINCT FROM 'array' OR (sr_doc->>'sales_id')::uuid=ANY(sr_seen) OR sr_doc->>'sales_source_key'=ANY(sr_keys) THEN
      RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_DOCUMENT' USING ERRCODE='23514'; END IF;
     sr_seen:=array_append(sr_seen,(sr_doc->>'sales_id')::uuid);sr_keys:=array_append(sr_keys,sr_doc->>'sales_source_key');sr_total:=0;sr_last:=0;
     IF jsonb_array_length(sr_doc->'settlements')<1 THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
     sr_refs:=jsonb_build_array(sr_doc->'source_refs');
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_doc->'settlements') LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'object' OR sr_row-ARRAY['source_key','fields','source_refs']<>'{}' OR NOT(sr_row ?& ARRAY['source_key','fields','source_refs'])
       OR jsonb_typeof(sr_row->'source_key') IS DISTINCT FROM 'string' OR length(sr_row->>'source_key') NOT BETWEEN 1 AND 65536 OR sr_row->>'source_key' ~ '[[:cntrl:]]'
       OR jsonb_typeof(sr_row->'fields') IS DISTINCT FROM 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(sr_row->'fields') key) IS DISTINCT FROM (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='naijue_erp.sales_settlement'::regclass AND attnum>0 AND NOT attisdropped)
       OR sr_row->'fields'->>'sales_id' IS DISTINCT FROM sr_doc->>'sales_id'
       OR (sr_row->'fields'->>'id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
       OR jsonb_typeof(sr_row->'fields'->'line_no') IS DISTINCT FROM 'number' OR (sr_row->'fields'->>'line_no')::integer<=sr_last
       OR coalesce(sr_row->'fields'->>'direction','') NOT IN ('RECEIVE','REFUND') OR jsonb_typeof(sr_row->'fields'->'amount') IS DISTINCT FROM 'string'
       OR (sr_row->'fields'->>'amount' ~ '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$') IS DISTINCT FROM true
       OR (sr_row->'fields'->>'id')::uuid=ANY(sr_rows) OR sr_row->>'source_key'=ANY(sr_row_keys) THEN
       RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_ROW' USING ERRCODE='23514'; END IF;
      sr_last:=(sr_row->'fields'->>'line_no')::integer;sr_rows:=array_append(sr_rows,(sr_row->'fields'->>'id')::uuid);sr_row_keys:=array_append(sr_row_keys,sr_row->>'source_key');
      sr_total:=sr_total+(sr_row->'fields'->>'amount')::numeric*CASE sr_row->'fields'->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END;
      sr_refs:=sr_refs||jsonb_build_array(sr_row->'source_refs');
     END LOOP;
     IF sr_total=(sr_doc->>'net_due')::numeric THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_DIFFERENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_row IN SELECT value FROM jsonb_array_elements(sr_refs) LOOP
      IF jsonb_typeof(sr_row) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(sr_row) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(sr_row) ref)<>jsonb_array_length(sr_row) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
      FOR sr_ref IN SELECT value FROM jsonb_array_elements(sr_row) LOOP
       IF jsonb_typeof(sr_ref) IS DISTINCT FROM 'object' OR sr_ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(sr_ref ?& ARRAY['file_sha256','sheet','row'])
        OR (sr_ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(sr_ref->'sheet') NOT IN ('string','null')
        OR jsonb_typeof(sr_ref->'row') IS DISTINCT FROM 'number' OR (sr_ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true OR (sr_ref->>'row')::numeric>2147483647 THEN
        RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_APPROVAL_SOURCE' USING ERRCODE='23514'; END IF;
       sr_used:=sr_used OR sr_ref->>'file_sha256'=sr_approval->>'evidence_sha256';
      END LOOP;
     END LOOP;
    END LOOP;
    IF cardinality(sr_rows)<>(CASE jsonb_array_length(sr_approval->'documents') WHEN 24 THEN 26 ELSE 27 END) OR NOT sr_used THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END;
  END IF;
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
  admin:=payload->'admin';
  IF payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN
   PERFORM naijue_erp.maintenance_administrator_mutex();
   IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=(payload->>'provision_operation_id')::uuid AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
    RAISE EXCEPTION 'ADMIN_PROVISION_COMMITTED_RECEIPT_REQUIRED' USING ERRCODE='25000'; END IF;
   admin_provision_snapshot:=naijue_erp.standard_admin_provision_proof_v1((payload->>'provision_operation_id')::uuid,payload->>'provision_request_sha256',admin,true);
  ELSE
  -- No existing baseline/account/master/history adoption is silently enabled.
  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;
  END LOOP;
  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());
  END IF;
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
  IF cfg ? 'historical_line_amount_approval' THEN
   amount_descriptor:=cfg->'historical_line_amount_approval';amount_approval:=(amount_descriptor->>'utf8')::jsonb;
   SELECT jsonb_object_agg(fact->>'line_id',fact) INTO amount_facts_by_id FROM jsonb_array_elements(amount_approval->'lines') fact;
  END IF;
  IF command_phase='DOCUMENTS' AND cfg ? 'historical_hall_approval' THEN
   hall_approval:=(cfg->'historical_hall_approval'->>'utf8')::jsonb;
   SELECT jsonb_object_agg(value->>'target_id',value) INTO hall_approvals FROM jsonb_array_elements(((cfg->'historical_hall_approval'->>'utf8')::jsonb)->'records');
  END IF;
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
    hall_observation:=NULL;
    fields:=entry->'fields';source_key:=entry->>'source_key';file_ref:=entry->>'file_ref';record_id:=(entry->>'record_id')::uuid;
    IF jsonb_typeof(fields) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'source_refs')<1
     OR coalesce(length(source_key),0)=0 OR coalesce(length(btrim(file_ref)),0)=0 THEN RAISE EXCEPTION 'STANDARD_SOURCE_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
    IF command_phase='KEYS' THEN
     IF entry-ARRAY['record_id','source_key','file_ref','source_refs','fields','ledger_entry_id','explicit_zero_evidence']<>'{}' OR fields-ARRAY['warehouse_id','sku_id','quantity']<>'{}'
      OR jsonb_typeof(fields->'quantity') IS DISTINCT FROM 'string' OR (fields->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_EXPLICIT_KEY_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     quantity:=(fields->>'quantity')::bigint;kind:='INVENTORY_KEY';target:=naijue_erp.standard_inventory_key_id((fields->>'warehouse_id')::uuid,(fields->>'sku_id')::uuid);
     IF (quantity=0) IS DISTINCT FROM (entry->>'ledger_entry_id' IS NULL) THEN RAISE EXCEPTION 'STANDARD_ZERO_LEDGER_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' AND entry ? 'explicit_zero_evidence' THEN RAISE EXCEPTION 'INVENTORY_SCOPE_REQUIRES_REAL_EXPLICIT_ROWS' USING ERRCODE='23514'; END IF;
     IF entry ? 'explicit_zero_evidence' THEN
      IF NOT(cfg ? 'explicit_zero_approval') THEN RAISE EXCEPTION 'EXPLICIT_ZERO_DESCRIPTOR_REQUIRED' USING ERRCODE='23514'; END IF;
      zero_descriptor:=cfg->'explicit_zero_approval';zero_evidence:=entry->'explicit_zero_evidence';
      IF jsonb_typeof(zero_evidence) IS DISTINCT FROM 'object'
       OR zero_evidence-ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof']<>'{}'
       OR NOT(zero_evidence ?& ARRAY['format_version','inventory_file_sha256','cutoff_at','approval_sha256','approval_row','approval_line','merkle_proof'])
       OR zero_evidence->>'format_version' IS DISTINCT FROM 'EXPLICIT_ZERO_ABSENCE_V1'
       OR fields->>'quantity' IS DISTINCT FROM '0'
       OR zero_evidence->>'inventory_file_sha256' IS DISTINCT FROM zero_descriptor->>'inventory_file_sha256'
       OR zero_evidence->>'cutoff_at' IS DISTINCT FROM zero_descriptor->>'cutoff_at'
       OR zero_evidence->>'approval_sha256' IS DISTINCT FROM zero_descriptor->>'sha256'
       OR jsonb_typeof(zero_evidence->'approval_row') IS DISTINCT FROM 'number'
       OR (zero_evidence->>'approval_row' ~ '^[1-9][0-9]*$') IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'approval_line') IS DISTINCT FROM 'string'
       OR octet_length(convert_to(zero_evidence->>'approval_line','UTF8')) NOT BETWEEN 1 AND 65536
       OR strpos(zero_evidence->>'approval_line',chr(10))>0 OR strpos(zero_evidence->>'approval_line',chr(13))>0
       OR left(zero_evidence->>'approval_line',1)=chr(65279)
       OR (zero_evidence->>'approval_line' IS JSON OBJECT WITH UNIQUE KEYS) IS DISTINCT FROM true
       OR jsonb_typeof(zero_evidence->'merkle_proof') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_EVIDENCE_INVALID' USING ERRCODE='23514'; END IF;
      IF (zero_evidence->>'approval_row')::numeric>(zero_descriptor->>'record_count')::numeric
       OR jsonb_array_length(zero_evidence->'merkle_proof')>18
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(zero_evidence->'merkle_proof') s WHERE jsonb_typeof(s) IS DISTINCT FROM 'string' OR (s#>>'{}' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true)
       OR entry->'source_refs' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('file_sha256',zero_descriptor->>'sha256','sheet',NULL,'row',(zero_evidence->>'approval_row')::integer))
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
      zero_fact:=(zero_evidence->>'approval_line')::jsonb;
      IF zero_fact IS DISTINCT FROM jsonb_build_object('format_version','EXPLICIT_ZERO_APPROVAL_V1','source_namespace',request->>'namespace',
       'inventory_file_sha256',zero_descriptor->>'inventory_file_sha256','cutoff_at',request->>'cutoff_at','source_key',source_key,
       'warehouse_id',fields->>'warehouse_id','sku_id',fields->>'sku_id','quantity','0','decision','CONFIRMED_ABSENT_IS_ZERO')
      THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVED_FACT_DIFFERS' USING ERRCODE='23514'; END IF;
      zero_index:=(zero_evidence->>'approval_row')::integer-1;zero_width:=(zero_descriptor->>'record_count')::integer;
      zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_LEAF_V1'||chr(10)||(zero_index+1)::text||chr(10)||(zero_evidence->>'approval_line'),'UTF8')),'hex');
      FOR zero_sibling IN SELECT value FROM jsonb_array_elements_text(zero_evidence->'merkle_proof') LOOP
       IF zero_width<=1 THEN RAISE EXCEPTION 'EXPLICIT_ZERO_PROOF_DEPTH_INVALID' USING ERRCODE='23514'; END IF;
       IF mod(zero_index,2)=0 THEN
        IF zero_index+1>=zero_width AND zero_sibling IS DISTINCT FROM zero_hash THEN RAISE EXCEPTION 'EXPLICIT_ZERO_ODD_SIBLING' USING ERRCODE='23514'; END IF;
        zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_hash||chr(10)||zero_sibling,'UTF8')),'hex');
       ELSE zero_hash:=encode(sha256(convert_to('EXPLICIT_ZERO_NODE_V1'||chr(10)||zero_sibling||chr(10)||zero_hash,'UTF8')),'hex'); END IF;
       zero_index:=zero_index/2;zero_width:=(zero_width+1)/2;
      END LOOP;
      IF zero_width<>1 OR zero_hash IS DISTINCT FROM zero_descriptor->>'merkle_root_sha256' THEN RAISE EXCEPTION 'EXPLICIT_ZERO_MEMBERSHIP_INVALID' USING ERRCODE='23514'; END IF;
     END IF;
    ELSE
     IF entry-ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields','zero_amount_archive','historical_hall_evidence']<>'{}' OR NOT(entry ?& ARRAY['record_id','entity_type','source_key','target_id','identity_basis','file_ref','source_refs','fields']) THEN RAISE EXCEPTION 'STANDARD_TYPED_ROW_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     kind:=entry->>'entity_type';target:=(entry->>'target_id')::uuid;registry_basis:=entry->>'identity_basis';
     IF command_phase='DOCUMENTS' AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt sealed
       WHERE sealed.action='MIGRATE_DOCUMENT' AND sealed.target_type=CASE WHEN kind IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT') THEN 'SALES' ELSE 'TRANSFER' END
        AND sealed.target_id=CASE WHEN kind IN ('SALES_HEADER','TRANSFER_HEADER') THEN target WHEN kind IN ('SALES_LINE','SALES_SETTLEMENT') THEN (fields->>'sales_id')::uuid ELSE (fields->>'transfer_id')::uuid END)
     THEN RAISE EXCEPTION 'WHOLE_DOCUMENT_ALREADY_SEALED' USING ERRCODE='23514'; END IF;
     IF (command_phase='MASTER' AND kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL'))
      OR (command_phase='DOCUMENTS' AND kind NOT IN ('SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE')) THEN RAISE EXCEPTION 'STANDARD_FINITE_TARGET_REQUIRED' USING ERRCODE='23514'; END IF;
     IF kind='STAFF' AND fields->>'role'='SALESPERSON' AND fields->'hall_id'='null'::jsonb THEN
      IF fields->>'employment_status' IS DISTINCT FROM '离职'
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(((cfg->'historical_staff_hall_approval'->>'utf8')::jsonb)->'staff','[]'::jsonb)) approved
        WHERE approved->>'source_key'=entry->>'source_key' AND approved->>'target_id'=entry->>'target_id'
         AND (approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (approved->'source_refs'))
       OR EXISTS(SELECT 1 FROM naijue_erp.user_account WHERE staff_id=(entry->>'target_id')::uuid)
      THEN RAISE EXCEPTION 'STAFF_HALL_REQUIRED' USING ERRCODE='23514'; END IF;
     END IF;
     -- WHOLE_FIT_PROFILE_GUARD_BEGIN
     -- An installed numeric table constraint does not widen a legacy package.
     -- Select only the original immutable INIT profile; never infer or rewrite codes.
     IF kind='FIT' AND (jsonb_typeof(fields->'code') IS DISTINCT FROM 'string'
      OR (fields->>'code' COLLATE "C" ~ CASE WHEN cfg->>'schema_declarations_sha256' IN
       ('7b8b084f726078b65a98b92fdddce504a985d3eaa08adb69938035991ebbe274','9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
       THEN '^[A-Z356789]$' ELSE '^[A-Z]$' END) IS DISTINCT FROM true) THEN
      RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
     -- WHOLE_FIT_PROFILE_GUARD_END
     IF (master_chunks_v2 OR cfg->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS') AND command_phase='MASTER' AND kind='STAFF' AND target=(cfg->'admin'->>'staff_id')::uuid THEN RAISE EXCEPTION 'STANDARD_V2_INITIALIZATION_STAFF_SOURCE_COLLISION' USING ERRCODE='23514'; END IF;
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
    IF kind='SALES_HEADER' AND cfg ? 'historical_hall_approval' AND NOT(entry ? 'historical_hall_evidence') THEN
     RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
    IF entry ? 'historical_hall_evidence' THEN
     IF command_phase<>'DOCUMENTS' OR kind<>'SALES_HEADER' OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR fields->>'import_batch_id' IS DISTINCT FROM batch::text THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_SCOPE' USING ERRCODE='23514'; END IF;
     hall_evidence:=entry->'historical_hall_evidence';hall_approved:=hall_approvals->(entry->>'target_id');

 IF (hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2') IS DISTINCT FROM (hall_approval->>'format_version'='HISTORICAL_SALES_HALL_APPROVAL_V2') THEN RAISE EXCEPTION 'HISTORICAL_HALL_PROFILE_VERSION' USING ERRCODE='23514'; END IF;
 IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object' OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']<>'{}' OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']) OR hall_evidence->>'basis' IS DISTINCT FROM 'MIGRATION_DERIVED' OR hall_evidence->'original_hall_id' IS DISTINCT FROM 'null'::jsonb OR (jsonb_typeof(hall_evidence->'warehouse_id')='string' AND (hall_evidence->'warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'selected_hall_id')='string' AND (hall_evidence->'selected_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'HISTORICAL_HALL_V2_SHAPE' USING ERRCODE='23514'; END IF;
 hall_target:=hall_evidence->'target_snapshot';hall_capture:=hall_evidence->'source_capture';
 IF jsonb_typeof(hall_target) IS DISTINCT FROM 'object' OR hall_target-ARRAY['warehouse_id','hall_id','version','captured_at']<>'{}' OR NOT(hall_target ?& ARRAY['warehouse_id','hall_id','version','captured_at']) OR hall_target->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_target->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR (CASE WHEN jsonb_typeof(hall_target->'version')='number' THEN (hall_target->'version'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (hall_target->'version'#>>'{}')::numeric=trunc((hall_target->'version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR (hall_target->'captured_at'<>'null'::jsonb AND (jsonb_typeof(hall_target->'captured_at') IS DISTINCT FROM 'string' OR ((hall_target->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_target->'captured_at'#>>'{}')::timestamptz))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_capture) IS DISTINCT FROM 'object' OR hall_capture-ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']<>'{}' OR NOT(hall_capture ?& ARRAY['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']) OR (jsonb_typeof(hall_capture->'capture_evidence_sha256')='string' AND (hall_capture->'capture_evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'source_namespace')='string' AND length(hall_capture->'source_namespace'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'source_namespace'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'source_namespace'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'source_namespace'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'warehouse_source_key')='string' AND length(hall_capture->'warehouse_source_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'warehouse_source_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'warehouse_source_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'warehouse_source_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'transaction_snapshot')='string' AND length(hall_capture->'transaction_snapshot'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'transaction_snapshot'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'transaction_snapshot'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'transaction_snapshot'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'relation_basis')='string' AND length(hall_capture->'relation_basis'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_capture->'relation_basis'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_capture->'relation_basis'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_capture->'relation_basis'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true OR (jsonb_typeof(hall_capture->'runtime_warehouse_id')='string' AND (hall_capture->'runtime_warehouse_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (hall_capture->'source_native_version'<>'null'::jsonb AND ((CASE WHEN jsonb_typeof(hall_capture->'source_native_version')='number' THEN (hall_capture->'source_native_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'source_native_version'#>>'{}')::numeric=trunc((hall_capture->'source_native_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(hall_capture->'effective_version')='number' THEN (hall_capture->'effective_version'#>>'{}')::numeric BETWEEN 0 AND 2147483647 AND (hall_capture->'effective_version'#>>'{}')::numeric=trunc((hall_capture->'effective_version'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true OR jsonb_typeof(hall_capture->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_capture->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_capture->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR jsonb_typeof(hall_capture->'captured_at') IS DISTINCT FROM 'string' OR ((hall_capture->'captured_at'#>>'{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true OR NOT isfinite((hall_capture->'captured_at'#>>'{}')::timestamptz) THEN RAISE EXCEPTION 'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(hall_approval->'source_captures') c WHERE c=hall_capture)<>1 THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_MEMBER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_evidence->'identity_bridge') IS DISTINCT FROM 'object' OR (hall_evidence->'identity_bridge')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'identity_bridge' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'identity_bridge'->'evidence_sha256')='string' AND (hall_evidence->'identity_bridge'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'identity_bridge'->'record_key')='string' AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'identity_bridge'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'identity_bridge'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'identity_bridge'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(hall_step_bridge_member::text)::jsonb INTO hall_member_count,hall_bridge FROM jsonb_array_elements(hall_approval->'identity_bridges') hall_step_bridge_member WHERE hall_step_bridge_member->'evidence_sha256'=hall_evidence->'identity_bridge'->'evidence_sha256' AND hall_step_bridge_member->'record_key'=hall_evidence->'identity_bridge'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_bridge) IS DISTINCT FROM 'object' OR hall_bridge-ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']<>'{}' OR NOT(hall_bridge ?& ARRAY['evidence_sha256','record_key','entity_type','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','hall_links','source_refs','scope']) OR hall_bridge->>'entity_type' IS DISTINCT FROM 'WAREHOUSE' OR hall_bridge->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_bridge->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_bridge->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_bridge->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_bridge->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_bridge->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_bridge->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_bridge->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_bridge->'source_refs') r)<>jsonb_array_length(hall_bridge->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(hall_bridge->'hall_links') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_bridge->'hall_links')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR (SELECT count(DISTINCT h->'runtime_hall_id') FROM jsonb_array_elements(hall_bridge->'hall_links') h)<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE jsonb_typeof(h) IS DISTINCT FROM 'object' OR h-ARRAY['runtime_hall_id','target_hall_id']<>'{}' OR NOT(h ?& ARRAY['runtime_hall_id','target_hall_id']) OR (jsonb_typeof(h->'runtime_hall_id')='string' AND (h->'runtime_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR (jsonb_typeof(h->'target_hall_id')='string' AND (h->'target_hall_id'#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true OR NOT((hall_capture->'runtime_hall_ids') @> jsonb_build_array(h->'runtime_hall_id'))) THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (jsonb_array_length(hall_capture->'runtime_hall_ids')>1) OR hall_evidence->'review_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(hall_capture->'runtime_hall_ids')=1 THEN
 IF hall_evidence->'resolution' IS DISTINCT FROM 'null'::jsonb OR hall_bridge->'hall_links'->0->'target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' THEN RAISE EXCEPTION 'HISTORICAL_HALL_BRIDGE_HALL_DIFFERS' USING ERRCODE='23514'; END IF;
 ELSE
 IF jsonb_typeof(hall_evidence->'resolution') IS DISTINCT FROM 'object' OR (hall_evidence->'resolution')-ARRAY['evidence_sha256','record_key']<>'{}' OR NOT(hall_evidence->'resolution' ?& ARRAY['evidence_sha256','record_key']) OR (jsonb_typeof(hall_evidence->'resolution'->'evidence_sha256')='string' AND (hall_evidence->'resolution'->'evidence_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (jsonb_typeof(hall_evidence->'resolution'->'record_key')='string' AND length(hall_evidence->'resolution'->'record_key'#>>'{}') BETWEEN 1 AND 4096 AND length(hall_evidence->'resolution'->'record_key'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(hall_evidence->'resolution'->'record_key'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (hall_evidence->'resolution'->'record_key'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT count(*),min(r::text)::jsonb INTO hall_member_count,hall_resolution FROM jsonb_array_elements(hall_approval->'resolutions') r WHERE r->'evidence_sha256'=hall_evidence->'resolution'->'evidence_sha256' AND r->'record_key'=hall_evidence->'resolution'->'record_key';
 IF hall_member_count<>1 OR jsonb_typeof(hall_resolution) IS DISTINCT FROM 'object' OR hall_resolution-ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']<>'{}' OR NOT(hall_resolution ?& ARRAY['evidence_sha256','record_key','source_namespace','warehouse_source_key','runtime_warehouse_id','target_namespace','target_warehouse_id','source_capture_sha256','selected_target_hall_id','runtime_hall_ids','source_refs','scope']) OR hall_resolution->'source_namespace' IS DISTINCT FROM hall_capture->'source_namespace' OR hall_resolution->'warehouse_source_key' IS DISTINCT FROM hall_capture->'warehouse_source_key' OR hall_resolution->'runtime_warehouse_id' IS DISTINCT FROM hall_capture->'runtime_warehouse_id' OR hall_resolution->'target_namespace' IS DISTINCT FROM hall_approval->'source_namespace' OR hall_resolution->'target_warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' OR hall_resolution->'source_capture_sha256' IS DISTINCT FROM hall_capture->'capture_evidence_sha256' OR hall_resolution->>'scope' IS DISTINCT FROM 'FIXED_CAPTURE_SCOPE_ONLY' OR (jsonb_typeof(hall_resolution->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'source_refs') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'source_refs') r)<>jsonb_array_length(hall_resolution->'source_refs') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'source_refs') r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR r-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(r ?& ARRAY['file_sha256','sheet','row']) OR (jsonb_typeof(r->'file_sha256')='string' AND (r->'file_sha256'#>>'{}') ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR (r->'sheet'<>'null'::jsonb AND ((jsonb_typeof(r->'sheet')='string' AND length(r->'sheet'#>>'{}') BETWEEN 1 AND 4096 AND length(r->'sheet'#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(r->'sheet'#>>'{}','') cp(ch) WHERE ascii(ch)>65535)<=4096 AND (r->'sheet'#>>'{}') !~ '[[:cntrl:]]') IS DISTINCT FROM true)) OR (CASE WHEN jsonb_typeof(r->'row')='number' THEN (r->'row'#>>'{}')::numeric BETWEEN 1 AND 2147483647 AND (r->'row'#>>'{}')::numeric=trunc((r->'row'#>>'{}')::numeric) ELSE false END) IS DISTINCT FROM true)) OR hall_resolution->'selected_target_hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR jsonb_typeof(hall_resolution->'runtime_hall_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(hall_resolution->'runtime_hall_ids') NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT r) FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r)<>jsonb_array_length(hall_resolution->'runtime_hall_ids') OR EXISTS(SELECT 1 FROM jsonb_array_elements(hall_resolution->'runtime_hall_ids') r WHERE (jsonb_typeof(r)='string' AND (r#>>'{}') ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true) OR NOT((hall_resolution->'runtime_hall_ids') @> (hall_capture->'runtime_hall_ids') AND (hall_capture->'runtime_hall_ids') @> (hall_resolution->'runtime_hall_ids')) OR jsonb_array_length(hall_resolution->'runtime_hall_ids')<>jsonb_array_length(hall_capture->'runtime_hall_ids') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(hall_bridge->'hall_links') h WHERE h->'target_hall_id'=hall_evidence->'selected_hall_id') THEN RAISE EXCEPTION 'HISTORICAL_HALL_RESOLUTION_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 ELSE

 IF jsonb_typeof(hall_evidence) IS DISTINCT FROM 'object'
  OR hall_evidence-ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required']<>'{}'
  OR NOT(hall_evidence ?& ARRAY['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'])
  OR hall_evidence->>'format_version' IS DISTINCT FROM 'HISTORICAL_SALES_HALL_EVIDENCE_V1'
  OR coalesce(hall_evidence->>'basis','') NOT IN ('ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW')
  OR (hall_evidence->>'warehouse_id' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true
  OR jsonb_typeof(hall_evidence->'has_difference') IS DISTINCT FROM 'boolean' OR jsonb_typeof(hall_evidence->'review_required') IS DISTINCT FROM 'boolean'
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['original_hall_id','selected_hall_id','warehouse_hall_id_at_capture']) field
   WHERE hall_evidence->field IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(hall_evidence->field) IS DISTINCT FROM 'string'
    OR (hall_evidence->>field ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') IS DISTINCT FROM true)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_SHAPE' USING ERRCODE='23514'; END IF;
 IF (hall_evidence->'warehouse_version'='null'::jsonb) IS DISTINCT FROM (hall_evidence->'captured_at'='null'::jsonb)
  OR (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_version'='null'::jsonb) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 IF hall_evidence->'warehouse_version'<>'null'::jsonb THEN
  IF jsonb_typeof(hall_evidence->'warehouse_version') IS DISTINCT FROM 'number'
   OR (hall_evidence->>'warehouse_version' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true
   OR (hall_evidence->>'warehouse_version')::numeric>2147483647
   OR jsonb_typeof(hall_evidence->'captured_at') IS DISTINCT FROM 'string'
   OR (hall_evidence->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$') IS DISTINCT FROM true
   OR NOT isfinite((hall_evidence->>'captured_at')::timestamptz) THEN
   RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 IF (hall_evidence->>'basis'='ORIGINAL' AND (hall_evidence->'original_hall_id'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'original_hall_id'
    OR (hall_evidence->>'has_difference')::boolean IS DISTINCT FROM (hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb AND hall_evidence->'warehouse_hall_id_at_capture'<>hall_evidence->'original_hall_id')
    OR (hall_evidence->>'review_required')::boolean IS DISTINCT FROM ((hall_evidence->>'has_difference')::boolean OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb)))
  OR (hall_evidence->>'basis'='MIGRATION_DERIVED' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'warehouse_hall_id_at_capture'='null'::jsonb
    OR hall_evidence->'selected_hall_id' IS DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture' OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'false'::jsonb))
  OR (hall_evidence->>'basis'='PENDING_REVIEW' AND (hall_evidence->'original_hall_id'<>'null'::jsonb OR hall_evidence->'selected_hall_id'<>'null'::jsonb
    OR hall_evidence->'warehouse_hall_id_at_capture'<>'null'::jsonb OR hall_evidence->'has_difference'<>'false'::jsonb OR hall_evidence->'review_required'<>'true'::jsonb)) THEN
  RAISE EXCEPTION 'HISTORICAL_HALL_EVIDENCE_CONTRADICTION' USING ERRCODE='23514'; END IF;
 END IF;

     IF hall_approved IS NULL OR hall_approved->>'source_key' IS DISTINCT FROM source_key
      OR NOT((hall_approved->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (hall_approved->'source_refs'))
      OR jsonb_array_length(hall_approved->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs')
      OR hall_approved->'evidence' IS DISTINCT FROM hall_evidence
      OR fields->'hall_id' IS DISTINCT FROM hall_evidence->'selected_hall_id' OR fields->'warehouse_id' IS DISTINCT FROM hall_evidence->'warehouse_id' THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_APPROVAL_MEMBERSHIP' USING ERRCODE='23514'; END IF;
     IF hall_evidence->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2' THEN
      -- Observe only the locked target; the original input intent is immutable.
      SELECT to_jsonb(w),w.xmin::text::bigint INTO hall_actual,hall_actual_xid FROM naijue_erp.warehouse w WHERE w.id=(hall_target->>'warehouse_id')::uuid
       AND w.hall_id=(hall_target->>'hall_id')::uuid AND w.version=(hall_target->>'version')::integer
       AND w.version>0 FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
      IF hall_target->'captured_at'='null'::jsonb THEN
       IF hall_actual_xid IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
        RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_TARGET_NOT_NEW' USING ERRCODE='23514'; END IF;
       SELECT s.id INTO STRICT hall_master_id FROM naijue_erp.import_record s
        WHERE s.import_batch_id=baseline.id AND s.source_system=request->>'namespace' AND s.source_entity_type='WAREHOUSE'
         AND s.target_type='WAREHOUSE' AND s.target_id=(hall_target->>'warehouse_id')::uuid
         AND s.source_key=hall_approved->'target_initialization'->>'warehouse_source_key' AND s.status='IMPORTED';
       hall_master_proof:=naijue_erp.standard_import_record_proof(hall_master_id);
       SELECT * INTO STRICT hall_master_audit FROM naijue_erp.audit_change WHERE operation_id=(hall_master_proof->>'operation_id')::uuid;
       IF hall_master_proof->'current_operation' IS DISTINCT FROM 'true'::jsonb
        OR hall_master_audit.after_values->>'phase' IS DISTINCT FROM 'MASTER'
        OR hall_master_audit.after_values->'whole_package_v2'->>'root_operation' IS DISTINCT FROM root_operation::text
        OR (SELECT ma.xmin::text::bigint FROM naijue_erp.audit_change ma WHERE ma.operation_id=hall_master_audit.operation_id)<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
        OR hall_master_proof->'fields'->'id' IS DISTINCT FROM hall_actual->'id'
        OR hall_master_proof->'fields'->'hall_id' IS DISTINCT FROM hall_actual->'hall_id'
        OR hall_master_proof->'fields'->'version' IS DISTINCT FROM hall_actual->'version' THEN
        RAISE EXCEPTION 'HISTORICAL_HALL_INITIALIZATION_MASTER_REQUIRED' USING ERRCODE='23514'; END IF;
       hall_observation:=jsonb_build_object('warehouse_source_record_id',hall_master_id,'warehouse_operation_id',hall_master_proof->'operation_id',
        'warehouse_id',hall_actual->'id','hall_id',hall_actual->'hall_id','version',hall_actual->'version',
        'captured_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
      END IF;
     ELSE
     IF hall_evidence->'warehouse_version'<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
      WHERE w.id=(hall_evidence->>'warehouse_id')::uuid AND w.version=(hall_evidence->>'warehouse_version')::integer
       AND to_jsonb(w.hall_id) IS NOT DISTINCT FROM hall_evidence->'warehouse_hall_id_at_capture') THEN
      RAISE EXCEPTION 'HISTORICAL_HALL_CAPTURE_CHANGED' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
    IF entry ? 'zero_amount_archive' THEN
     IF kind IS DISTINCT FROM 'SALES_HEADER' OR fields->>'business_type' IS DISTINCT FROM 'SALE'
      OR fields->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(entry->'zero_amount_archive') IS DISTINCT FROM 'object'
      OR (entry->'zero_amount_archive')-ARRAY['profile','records']<>'{}'
      OR entry->'zero_amount_archive'->>'profile' IS DISTINCT FROM 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1'
      OR jsonb_typeof(entry->'zero_amount_archive'->'records') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SHAPE_INVALID' USING ERRCODE='23514'; END IF;
     IF jsonb_array_length(entry->'zero_amount_archive'->'records') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ZERO_ARCHIVE_COUNT_INVALID' USING ERRCODE='23514'; END IF;
     FOR parent_row IN SELECT value AS archived FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') LOOP
      IF jsonb_typeof(parent_row.archived) IS DISTINCT FROM 'object'
       OR parent_row.archived-ARRAY['source_key','amount','source_refs','original_values']<>'{}'
       OR NOT(parent_row.archived ?& ARRAY['source_key','amount','source_refs','original_values'])
       OR jsonb_typeof(parent_row.archived->'source_key') IS DISTINCT FROM 'string'
       OR (length(parent_row.archived->>'source_key')+(SELECT count(*) FROM regexp_split_to_table(parent_row.archived->>'source_key','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096
       OR parent_row.archived->>'source_key' ~ '[[:cntrl:]]'
       OR parent_row.archived->'amount' IS DISTINCT FROM '"0.00"'::jsonb
       OR jsonb_typeof(parent_row.archived->'source_refs') IS DISTINCT FROM 'array'
       OR jsonb_typeof(parent_row.archived->'original_values') IS DISTINCT FROM 'object'
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_RECORD_INVALID' USING ERRCODE='23514'; END IF;
      IF jsonb_array_length(parent_row.archived->'source_refs') NOT BETWEEN 1 AND 100
       OR (SELECT count(*) FROM jsonb_each(parent_row.archived->'original_values')) NOT BETWEEN 1 AND 100
       OR EXISTS(SELECT 1 FROM jsonb_each(parent_row.archived->'original_values') v WHERE (length(v.key)+(SELECT count(*) FROM regexp_split_to_table(v.key,'') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR v.key ~ '[[:cntrl:]]' OR v.key ~* '(password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)' OR v.key IN ('__proto__','constructor','prototype') OR jsonb_typeof(v.value) NOT IN ('string','null') OR (length(v.value#>>'{}')+(SELECT count(*) FROM regexp_split_to_table(v.value#>>'{}','') AS cp(ch) WHERE ascii(ch)>65535))>16384)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(parent_row.archived->'source_refs') ref WHERE jsonb_typeof(ref) IS DISTINCT FROM 'object' OR ref-ARRAY['file_sha256','sheet','row']<>'{}' OR NOT(ref ?& ARRAY['file_sha256','sheet','row']) OR (ref->>'file_sha256' ~ '^[a-f0-9]{64}$') IS DISTINCT FROM true OR jsonb_typeof(ref->'sheet') NOT IN ('string','null') OR (jsonb_typeof(ref->'sheet')='string' AND ((length(ref->>'sheet')+(SELECT count(*) FROM regexp_split_to_table(ref->>'sheet','') AS cp(ch) WHERE ascii(ch)>65535)) NOT BETWEEN 1 AND 4096 OR ref->>'sheet' ~ '[[:cntrl:]]')) OR (CASE WHEN ref->>'row' ~ '^[1-9][0-9]{0,9}$' THEN (ref->>'row')::numeric>2147483647 ELSE false END) OR jsonb_typeof(ref->'row') IS DISTINCT FROM 'number' OR (ref->>'row' ~ '^[1-9][0-9]{0,9}$') IS DISTINCT FROM true)
      THEN RAISE EXCEPTION 'ZERO_ARCHIVE_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
     END LOOP;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'zero_amount_archive'->'records') x GROUP BY x->>'source_key' HAVING count(*)>1) THEN RAISE EXCEPTION 'ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY' USING ERRCODE='23514'; END IF;
    END IF;
    amount_evidence:=NULL;
    IF kind='SALES_LINE' AND (fields->>'line_amount')::numeric IS DISTINCT FROM (fields->>'quantity')::numeric*(fields->>'deal_price')::numeric THEN
     IF command_phase IS DISTINCT FROM 'DOCUMENTS'
      OR coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
      OR NOT(cfg ? 'historical_line_amount_approval') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     amount_fact:=amount_facts_by_id->target::text;
     IF amount_fact IS NULL THEN RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EVIDENCE_REQUIRED' USING ERRCODE='23514'; END IF;
     IF amount_fact->>'line_source_key' IS DISTINCT FROM source_key
      OR amount_fact->>'sales_id' IS DISTINCT FROM fields->>'sales_id'
      OR amount_fact->'quantity' IS DISTINCT FROM fields->'quantity'
      OR amount_fact->'deal_price' IS DISTINCT FROM fields->'deal_price'
      OR amount_fact->'line_amount' IS DISTINCT FROM fields->'line_amount'
      OR NOT((amount_fact->'source_refs') @> (entry->'source_refs') AND (entry->'source_refs') @> (amount_fact->'source_refs'))
      OR jsonb_array_length(amount_fact->'source_refs')<>jsonb_array_length(entry->'source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(entry->'source_refs') ref)<>jsonb_array_length(entry->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_SOURCE_DIFFERS' USING ERRCODE='23514'; END IF;
     SELECT parent INTO STRICT amount_parent FROM (
      SELECT parent FROM jsonb_array_elements(payload->'rows') parent WHERE parent->>'entity_type'='SALES_HEADER' AND parent->>'target_id'=amount_fact->>'sales_id'
      UNION ALL SELECT naijue_erp.standard_import_record_proof(s.id) FROM naijue_erp.import_record s
       WHERE s.import_batch_id=batch AND s.target_type='SALES_HEADER' AND s.target_id=(amount_fact->>'sales_id')::uuid) parents;
     IF amount_parent->>'source_key' IS DISTINCT FROM amount_fact->>'sales_source_key'
      OR amount_parent->'fields'->>'id' IS DISTINCT FROM amount_fact->>'sales_id'
      OR amount_parent->'fields'->>'import_batch_id' IS DISTINCT FROM batch::text
      OR amount_parent->'fields'->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
      OR jsonb_typeof(amount_parent->'source_refs') IS DISTINCT FROM 'array'
      OR NOT((amount_parent->'source_refs') @> (amount_fact->'sales_source_refs') AND (amount_fact->'sales_source_refs') @> (amount_parent->'source_refs'))
      OR jsonb_array_length(amount_parent->'source_refs')<>jsonb_array_length(amount_fact->'sales_source_refs')
      OR (SELECT count(DISTINCT ref) FROM jsonb_array_elements(amount_parent->'source_refs') ref)<>jsonb_array_length(amount_parent->'source_refs') THEN
      RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_PARENT_DIFFERS' USING ERRCODE='23514'; END IF;
     amount_evidence:=jsonb_build_object('format_version','HISTORICAL_LINE_AMOUNT_BOUND_V1',
      'attestation_sha256',amount_descriptor->>'sha256','evidence_sha256',amount_approval->>'evidence_sha256','fact',amount_fact);
    END IF;
    parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');
    IF amount_evidence IS NOT NULL THEN parsed:=parsed||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    IF entry ? 'explicit_zero_evidence' THEN parsed:=parsed||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN parsed:=parsed||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF entry ? 'historical_hall_evidence' THEN parsed:=parsed||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    source_hash:=encode(sha256(convert_to(parsed::text,'UTF8')),'hex');
    IF hall_observation IS NOT NULL THEN
     hall_target_captures:=hall_target_captures||jsonb_build_object(record_id::text,hall_observation||jsonb_build_object('input_source_record_hash',source_hash));
    END IF;
    item:=jsonb_build_object('id',record_id,'entity_type',CASE WHEN command_phase='KEYS' THEN 'INVENTORY_BASELINE' ELSE kind END,'source_key',source_key,'target_type',kind,'target_id',target,'file_ref',file_ref,
      'fields',fields,'source_refs',entry->'source_refs','identity_basis',entry->'identity_basis','source_hash',source_hash);
    IF entry ? 'historical_hall_evidence' THEN item:=item||jsonb_build_object('historical_hall_evidence',entry->'historical_hall_evidence'); END IF;
    IF entry ? 'zero_amount_archive' THEN item:=item||jsonb_build_object('zero_amount_archive',entry->'zero_amount_archive'); END IF;
    IF command_phase='KEYS' THEN item:=item||jsonb_build_object('ledger_entry_id',entry->>'ledger_entry_id'); END IF;
    IF entry ? 'explicit_zero_evidence' THEN item:=item||jsonb_build_object('explicit_zero_evidence',entry->'explicit_zero_evidence'); END IF;
    IF amount_evidence IS NOT NULL THEN item:=item||jsonb_build_object('historical_line_amount_evidence',amount_evidence); END IF;
    records:=records||jsonb_build_array(item);
   END LOOP;
  ELSE
   fields:=jsonb_build_object('baseline_batch_id',baseline.id,'manifest_sha256',b.source_hash,'cutoff_at',b.cutoff_at,'alignment_sha256',cfg->>'alignment_sha256');
   IF phase='BASELINE_SEAL' AND cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN fields:=fields||jsonb_build_object('inventory_baseline_scope',cfg->'explicit_zero_approval'); END IF;
   records:=records||jsonb_build_array(jsonb_build_object('id',payload->>'approval_record_id','entity_type',CASE phase WHEN 'BASELINE_SEAL' THEN 'STANDARD_BASELINE_APPROVAL' ELSE 'DOCUMENT_CONVERSION_APPROVAL' END,
    'source_key',CASE phase WHEN 'BASELINE_SEAL' THEN CASE WHEN cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN 'FINAL_BASELINE_SCOPE_V1' ELSE 'FINAL_EXPLICIT_KEYS' END ELSE 'FINAL_DOCUMENT_CONVERSION' END,'target_type','IMPORT_BATCH','target_id',batch,'file_ref',b.source_manifest_ref,'fields',fields,
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
 result:=result||jsonb_build_object('batched_import_v1',group_marker);
 IF hall_target_captures<>'{}' THEN result:=result||jsonb_build_object('historicalHallTargetCapturesSha256',encode(sha256(convert_to(hall_target_captures::text,'UTF8')),'hex')); END IF;
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,actor,request->>'request_key',fingerprint,action_name,'IMPORT',batch,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,actor,'IMPORT',batch,action_name,CASE WHEN old_cp IS NULL THEN NULL ELSE (old_cp->>'sequence')::integer+1 END,(cp->>'sequence')::integer+1,old_cp,
   jsonb_build_object('profile','STANDARD_IMPORT_SQL_V1','phase',phase,'request',request,'checkpoint',cp,'records',records,'origin',CASE WHEN command_phase='INITIALIZE' THEN 'CURRENT_PROVISIONING' ELSE 'STANDARD_SOURCE' END,
    'current_admin',CASE WHEN command_phase='INITIALIZE' THEN CASE WHEN payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN payload->'admin'||jsonb_build_object('provisioned_snapshot',admin_provision_snapshot) ELSE payload->'admin' END ELSE NULL END,
    'batched_import_v1',group_marker,'whole_package_v2',CASE WHEN command_phase='INITIALIZE' THEN jsonb_build_object('root_operation',root_operation,'ordinal',0,'full_xid',pg_current_xact_id()::text,'backend_pid',pg_backend_pid(),'controller',session_user) ELSE jsonb_build_object('root_operation',root_operation,'ordinal',child_ordinal) END)||CASE WHEN hall_target_captures<>'{}' THEN jsonb_build_object('historical_hall_target_captures',hall_target_captures) ELSE '{}'::jsonb END,transaction_timestamp());
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
    IF cfg->>'schema_declarations_sha256' IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b') THEN
     IF NOT(fields ? 'departure_date') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.staff'::regclass AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND NOT attisdropped AND attgenerated='') THEN RAISE EXCEPTION 'WHOLE_STAFF_SCHEMA_NOT_INSTALLED' USING ERRCODE='23514'; END IF;
     IF fields->'departure_date' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(fields->'departure_date') IS DISTINCT FROM 'string' OR (fields->>'departure_date' COLLATE "C" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') IS DISTINCT FROM true OR to_char((fields->>'departure_date')::date,'YYYY-MM-DD') IS DISTINCT FROM fields->>'departure_date') THEN RAISE EXCEPTION 'WHOLE_STAFF_DATE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF fields ? 'departure_date' THEN RAISE EXCEPTION 'WHOLE_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(fields) key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||table_name) AND attnum>0 AND NOT attisdropped AND attgenerated='' AND NOT(kind='STAFF' AND attname='departure_date' AND atttypid='date'::regtype AND NOT attnotnull AND coalesce(cfg->>'schema_declarations_sha256','') NOT IN ('9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a','89117aebb5064a3f42065aaab077ffd0e90ec0fee07898e5416ee3c1ff18130e','f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'))) THEN
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
   IF cfg->'explicit_zero_approval'->>'format_version'='INVENTORY_BASELINE_SCOPE_V1' THEN
    zero_descriptor:=cfg->'explicit_zero_approval';
    FOR kind IN SELECT unnest(ARRAY['WAREHOUSE','SKU']) LOOP
     SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(format('{"id":"%s"}',src.target_id)||chr(10),'' ORDER BY src.target_id),''),'UTF8')),'hex') INTO n,zero_hash
      FROM naijue_erp.import_record src WHERE src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type=kind;
     item:=zero_descriptor->CASE kind WHEN 'WAREHOUSE' THEN 'warehouses' ELSE 'skus' END;
     IF n IS DISTINCT FROM (item->>'count')::numeric OR zero_hash IS DISTINCT FROM item->>'records_sha256' THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_MEMBERS_DIFFERS' USING ERRCODE='23514'; END IF;
    END LOOP;
    WITH actual AS MATERIALIZED (
     SELECT approved->'fields' AS f FROM naijue_erp.audit_change prior_audit
      CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
      JOIN naijue_erp.import_record src ON src.id=(approved->>'id')::uuid AND src.import_batch_id=batch AND src.status='IMPORTED' AND src.target_type='INVENTORY_KEY'
      WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch AND prior_audit.after_values->>'phase'='KEYS'
       AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
    ), totals AS (
     SELECT w.target_id, count(f)::integer explicit_count,count(f) FILTER(WHERE f->>'quantity'<>'0')::integer nonzero_count,coalesce(sum((f->>'quantity')::numeric),0)::text quantity
      FROM naijue_erp.import_record w LEFT JOIN actual ON (f->>'warehouse_id')::uuid=w.target_id
      WHERE w.import_batch_id=batch AND w.status='IMPORTED' AND w.target_type='WAREHOUSE' GROUP BY w.target_id
    )
    SELECT (SELECT count(*) FROM actual),(SELECT count(*) FROM actual WHERE f->>'quantity'<>'0'),
     (SELECT encode(sha256(convert_to(coalesce(string_agg(format('{"warehouse_id":"%s","sku_id":"%s","quantity":"%s"}',f->>'warehouse_id',f->>'sku_id',f->>'quantity')||chr(10),'' ORDER BY f->>'warehouse_id' COLLATE "C",f->>'sku_id' COLLATE "C"),''),'UTF8')),'hex') FROM actual),
     (SELECT jsonb_agg(jsonb_build_object('warehouse_id',t.target_id,'explicit_count',t.explicit_count,'nonzero_count',t.nonzero_count,'quantity',t.quantity) ORDER BY t.target_id) FROM totals AS t)
     INTO zero_consumed,zero_unique,zero_hash,actual;
    IF zero_consumed IS DISTINCT FROM (zero_descriptor->'explicit_values'->>'count')::bigint OR zero_unique IS DISTINCT FROM (zero_descriptor->>'nonzero_count')::bigint
     OR zero_hash IS DISTINCT FROM zero_descriptor->'explicit_values'->>'records_sha256' OR actual IS DISTINCT FROM zero_descriptor->'warehouse_totals'
    THEN RAISE EXCEPTION 'INVENTORY_BASELINE_SCOPE_VALUES_OR_WAREHOUSE_TOTAL_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cfg ? 'explicit_zero_approval' THEN
    SELECT count(*),count(DISTINCT (approved->'explicit_zero_evidence'->>'approval_row')::integer) INTO zero_consumed,zero_unique
     FROM naijue_erp.audit_change prior_audit CROSS JOIN LATERAL jsonb_array_elements(prior_audit.after_values->'records') approved
     WHERE prior_audit.object_type='IMPORT' AND prior_audit.object_id=batch
      AND prior_audit.after_values->'whole_package_v2'->>'root_operation'=root_operation::text
      AND prior_audit.after_values->>'phase'='KEYS' AND approved->>'target_type'='INVENTORY_KEY' AND approved ? 'explicit_zero_evidence';
    IF zero_consumed<>(cfg->'explicit_zero_approval'->>'record_count')::bigint OR zero_unique<>zero_consumed
    THEN RAISE EXCEPTION 'EXPLICIT_ZERO_APPROVAL_NOT_EXACTLY_CONSUMED' USING ERRCODE='23514'; END IF;
   END IF;
   FOR kind IN SELECT jsonb_object_keys(cfg->'expected_master_counts') LOOP
    SELECT count(*) INTO n FROM naijue_erp.import_record WHERE import_batch_id=batch AND target_type=kind AND status='IMPORTED';
    IF n<>(cfg->'expected_master_counts'->>kind)::integer THEN RAISE EXCEPTION 'STANDARD_MASTER_CLOSURE_INCOMPLETE: %',kind USING ERRCODE='23514'; END IF;
   END LOOP;
  ELSE
   IF cfg ? 'historical_settlement_retention_approval' THEN
    DECLARE sr_doc jsonb;sr_count bigint;sr_rows bigint;sr_operation uuid;
    BEGIN
     SELECT count(*),coalesce(sum((SELECT count(*) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)),0) INTO sr_count,sr_rows
      FROM naijue_erp.sales_header hh WHERE hh.import_batch_id=batch AND hh.status='APPROVED' AND hh.stock_basis='CUTOFF_HISTORY'
       AND EXISTS(SELECT 1 FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id)
       AND hh.net_due IS DISTINCT FROM (SELECT sum(st.amount*CASE st.direction WHEN 'RECEIVE' THEN 1 ELSE -1 END) FROM naijue_erp.sales_settlement st WHERE st.sales_id=hh.id);
     IF sr_count<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 24 ELSE 25 END) OR sr_rows<>(CASE WHEN cfg->'historical_settlement_retention_approval'->>'sha256'='4b7181e4ff37fe02f75154350a0064fd6a4df3d34fc9ee1243bdcaed6dbc7d9b' THEN 26 ELSE 27 END) THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
     FOR sr_doc IN SELECT value FROM jsonb_array_elements(((cfg->'historical_settlement_retention_approval'->>'utf8')::jsonb)->'documents') LOOP
      SELECT rr.id INTO STRICT sr_operation FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=(sr_doc->>'sales_id')::uuid AND rr.action='MIGRATE_DOCUMENT' AND rr.status='COMMITTED';
      PERFORM naijue_erp.assert_document_migration(sr_operation);
     END LOOP;
    END;
   END IF;
   IF cfg ? 'historical_line_amount_approval' THEN
    amount_approval:=(cfg->'historical_line_amount_approval'->>'utf8')::jsonb;
    SELECT count(*),count(DISTINCT s.target_id) INTO amount_consumed,amount_unique FROM naijue_erp.import_record s
     CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
     WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND proof ? 'historical_line_amount_evidence';
    IF amount_consumed<>jsonb_array_length(amount_approval->'lines') OR amount_unique<>amount_consumed
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(amount_approval->'lines') fact WHERE NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
       WHERE s.import_batch_id=batch AND s.target_type='SALES_LINE' AND s.target_id=(fact->>'line_id')::uuid
        AND proof->'historical_line_amount_evidence'->'fact'=fact
        AND proof->'historical_line_amount_evidence'->>'attestation_sha256'=cfg->'historical_line_amount_approval'->>'sha256')) THEN
     RAISE EXCEPTION 'HISTORICAL_LINE_AMOUNT_EXACT_SET_REQUIRED' USING ERRCODE='23514'; END IF;
   END IF;
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
END $function$;

REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb) FROM PUBLIC;
-- Source candidate. Install only with the matching command and commit guards.
CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_step_v1(
 identity jsonb,work_batch jsonb,step_ordinal integer,command_phase text,request jsonb,private_parameter text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE result jsonb; group_descriptor jsonb:=work_batch; root_operation uuid:=(identity->>'rootOperationId')::uuid;
BEGIN
 result:=naijue_erp.standard_whole_package_command_v2(
   request,private_parameter,command_phase,root_operation,step_ordinal,jsonb_build_object('identity',identity,'work_batch',work_batch));
 IF result->>'state' IS DISTINCT FROM 'PENDING_TRANSACTION' THEN
  RAISE EXCEPTION 'BATCH_STEP_RESULT_INVALID' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','subBatchId',group_descriptor->>'subBatchId',
   'descriptorSha256',group_descriptor->>'descriptorSha256','operationId',request->>'operation_id',
   'ordinal',step_ordinal);
END $function$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_complete_v1(identity jsonb,work_batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE root_operation uuid:=(identity->>'rootOperationId')::uuid; group_descriptor jsonb:=work_batch;
 final_summary jsonb;
BEGIN
 -- This validates this transaction's exact group, including both endpoints.
 PERFORM naijue_erp.standard_batched_import_assert_group_v1(root_operation,jsonb_build_object('identity',identity,'work_batch',work_batch));
 IF group_descriptor->>'phase'='FINALIZE' THEN
  PERFORM naijue_erp.standard_whole_package_closed_v2(root_operation);
  final_summary:=jsonb_build_object('rootOperationId',root_operation,
    'batchId',identity->>'batchId','documentBatchId',identity->>'documentBatchId',
    'packageSha256',identity->>'packageSha256','planSha256',identity->>'planSha256','status','IMPORTED');
 END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','subBatchId',group_descriptor->>'subBatchId',
   'descriptorSha256',group_descriptor->>'descriptorSha256','summary',final_summary);
END $function$;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb) FROM PUBLIC;

-- Existing roles only. Controller keeps its existing SET ROLE authority.
REVOKE ALL ON FUNCTION
 naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text),
 naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb),
 naijue_erp.standard_batched_import_inspect_kernel_v1(jsonb,jsonb,text),
 naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb)
FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,
 erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION
 naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb)
TO erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION
 naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text)
TO erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;

-- One exact CHECK successor; all other kinds and metadata are preserved.
DO $batched_receipt_constraint$
DECLARE
 spec jsonb:=$batched_receipt_spec${"relation":"operation_receipt","name":"receipt_result_by_kind","before":{"kind":"c","name":"receipt_result_by_kind","index":null,"local":true,"columns":[6,9,5,1,7],"relation":"operation_receipt","matchType":" ","noInherit":false,"validated":true,"deferrable":false,"definition":"CHECK ((\nCASE\n    WHEN ((target_type = 'IMPORT'::text) AND ((result_data ->> 'profile'::text) = 'STANDARD_IMPORT_SQL_V1'::text)) THEN ((action = ANY (ARRAY['IMPORT_INITIALIZE_CURRENT_ADMIN'::text, 'IMPORT_STAGE'::text, 'IMPORT_CHUNK'::text, 'IMPORT_PUBLISH'::text])) AND (jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['profile'::text, 'operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'sourceRecordIds'::text, 'phase'::text, 'planSha256'::text, 'packageManifestSha256'::text, 'baselineBatchId'::text, 'documentBatchId'::text]) AND (((result_data - ARRAY['profile'::text, 'operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'sourceRecordIds'::text, 'phase'::text, 'planSha256'::text, 'packageManifestSha256'::text, 'baselineBatchId'::text, 'documentBatchId'::text]) - 'historicalHallTargetCapturesSha256'::text) = '{}'::jsonb) AND ((NOT (result_data ? 'historicalHallTargetCapturesSha256'::text)) OR ((action = 'IMPORT_CHUNK'::text) AND ((result_data ->> 'phase'::text) = 'DOCUMENTS'::text) AND (jsonb_typeof((result_data -> 'historicalHallTargetCapturesSha256'::text)) = 'string'::text) AND ((result_data ->> 'historicalHallTargetCapturesSha256'::text) ~ '^[0-9a-f]{64}$'::text))) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND ((result_data ->> 'sequence'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['STAGED'::text, 'VALIDATING'::text, 'IMPORTED'::text])) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND (jsonb_typeof((result_data -> 'sourceRecordIds'::text)) = 'array'::text) AND ((result_data ->> 'phase'::text) = ANY (ARRAY['INITIALIZE'::text, 'MASTER'::text, 'KEYS'::text, 'BASELINE_SEAL'::text, 'DOCUMENT_STAGE'::text, 'DOCUMENTS'::text, 'DOCUMENT_PUBLISH'::text])) AND ((result_data ->> 'planSha256'::text) ~ '^[0-9a-f]{64}$'::text) AND ((result_data ->> 'packageManifestSha256'::text) ~ '^[0-9a-f]{64}$'::text))\n    ELSE (\n    CASE\n        WHEN (target_type = ANY (ARRAY['HISTORY_SALES'::text, 'HISTORY_TRANSFER'::text])) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'dataset'::text, 'kind'::text, 'documentId'::text, 'revisionId'::text, 'version'::text, 'ledgerEntryIds'::text]) AND ((result_data - ARRAY['operationId'::text, 'dataset'::text, 'kind'::text, 'documentId'::text, 'revisionId'::text, 'version'::text, 'ledgerEntryIds'::text]) = '{}'::jsonb) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'dataset'::text) = 'HISTORY'::text) AND ((result_data ->> 'kind'::text) =\n        CASE target_type\n            WHEN 'HISTORY_SALES'::text THEN 'sales'::text\n            ELSE 'transfers'::text\n        END) AND ((result_data ->> 'documentId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'revisionId'::text)) = 'string'::text) AND ((result_data ->> 'revisionId'::text) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND ((((result_data ->> 'version'::text))::numeric >= (2)::numeric) AND (((result_data ->> 'version'::text))::numeric <= (2147483647)::numeric)) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text))\n        ELSE (\n        CASE\n            WHEN ((target_type = 'CATEGORY'::text) AND (action = ANY (ARRAY['REORDER'::text, 'UNDO_REORDER'::text]))) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text, 'order'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text, 'order'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'kind'::text) = 'CATEGORY'::text) AND (jsonb_typeof((result_data -> 'targetId'::text)) = 'string'::text) AND ((result_data ->> 'targetId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'order'::text)) = 'object'::text) AND ((result_data -> 'order'::text) ?& ARRAY['parentId'::text, 'undoOfOperationId'::text, 'members'::text]) AND (((result_data -> 'order'::text) - ARRAY['parentId'::text, 'undoOfOperationId'::text, 'members'::text]) = '{}'::jsonb) AND (jsonb_typeof(((result_data -> 'order'::text) -> 'members'::text)) = 'array'::text))\n            ELSE (\n            CASE\n                WHEN ((target_type = 'IMPORT'::text) AND (action = ANY (ARRAY['IMPORT_CORE_STAGE'::text, 'IMPORT_BIND_FULL_SOURCE'::text]))) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'phase'::text, 'coreSourceDigest'::text, 'coreCounts'::text]) AND ((result_data - ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'phase'::text, 'coreSourceDigest'::text, 'coreCounts'::text]) = '{}'::jsonb) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'sequence'::text)) = 'number'::text) AND ((result_data ->> 'sequence'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'cursor'::text)) = 'number'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'status'::text) = 'STAGED'::text) AND ((result_data -> 'ledgerEntryIds'::text) = '[]'::jsonb) AND ((result_data ->> 'phase'::text) =\n                CASE action\n                    WHEN 'IMPORT_CORE_STAGE'::text THEN 'CORE_INITIALIZED_V1'::text\n                    ELSE 'FULL_SOURCE_BOUND_V1'::text\n                END) AND ((result_data ->> 'coreSourceDigest'::text) ~ '^[a-f0-9]{64}$'::text) AND ((result_data -> 'coreCounts'::text) = '{\"HALL\": 22, \"STAFF\": 49, \"CUSTOMER\": 22, \"WAREHOUSE\": 22, \"USER_ACCOUNT\": 49}'::jsonb))\n                ELSE (\n                CASE\n                    WHEN (target_type = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::text[])) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND (jsonb_typeof((result_data -> 'kind'::text)) = 'string'::text) AND ((result_data ->> 'kind'::text) = target_type) AND (jsonb_typeof((result_data -> 'targetId'::text)) = 'string'::text) AND ((result_data ->> 'targetId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text))\n                    ELSE (\n                    CASE\n                        WHEN (target_type = 'IMPORT'::text) THEN ((jsonb_typeof(result_data) = 'object'::text) AND ((result_data - ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text]) = '{}'::jsonb) AND (result_data ?& ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text]) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND ((result_data ->> 'sequence'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['STAGED'::text, 'VALIDATING'::text, 'IMPORTED'::text])))\n                        ELSE (((jsonb_typeof(result_data) = 'object'::text) AND\n                        CASE\n                            WHEN (target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])) THEN ((result_data ?& ARRAY['operationId'::text, 'version'::text, 'status'::text, 'ledgerEntryIds'::text]) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'operationId'::text) IS DISTINCT FROM (id)::text)) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'status'::text)) = 'string'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'VOID'::text])) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND\n                            CASE target_type\n                                WHEN 'SALES'::text THEN ((result_data ? 'salesId'::text) AND (NOT (result_data ? 'transferId'::text)) AND (jsonb_typeof((result_data -> 'salesId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'salesId'::text) IS DISTINCT FROM (target_id)::text)))\n                                WHEN 'TRANSFER'::text THEN ((result_data ? 'transferId'::text) AND (NOT (result_data ? 'salesId'::text)) AND (jsonb_typeof((result_data -> 'transferId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'transferId'::text) IS DISTINCT FROM (target_id)::text)))\n                                ELSE false\n                            END)\n                            ELSE ((result_data ?& ARRAY['operationId'::text, 'kind'::text, 'partyId'::text, 'version'::text, 'code'::text, 'enabled'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'partyId'::text, 'version'::text, 'code'::text, 'enabled'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND (jsonb_typeof((result_data -> 'kind'::text)) = 'string'::text) AND ((result_data ->> 'kind'::text) = target_type) AND (jsonb_typeof((result_data -> 'partyId'::text)) = 'string'::text) AND ((result_data ->> 'partyId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'code'::text)) = 'string'::text) AND (length(btrim((result_data ->> 'code'::text))) > 0) AND (jsonb_typeof((result_data -> 'enabled'::text)) = 'boolean'::text))\n                        END) IS TRUE)\n                    END IS TRUE)\n                END IS TRUE)\n            END IS TRUE)\n        END IS TRUE)\n    END IS TRUE)\nEND IS TRUE))","deleteAction":" ","inheritCount":0,"updateAction":" ","deleteColumns":null,"initiallyDeferred":false,"referencedColumns":null,"referencedRelation":null},"after":{"kind":"c","name":"receipt_result_by_kind","index":null,"local":true,"columns":[6,9,5,1,7],"relation":"operation_receipt","matchType":" ","noInherit":false,"validated":true,"deferrable":false,"definition":"CHECK ((\nCASE\n    WHEN ((target_type = 'IMPORT'::text) AND ((result_data ->> 'profile'::text) = 'STANDARD_IMPORT_SQL_V1'::text)) THEN ((action = ANY (ARRAY['IMPORT_INITIALIZE_CURRENT_ADMIN'::text, 'IMPORT_STAGE'::text, 'IMPORT_CHUNK'::text, 'IMPORT_PUBLISH'::text])) AND (jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['profile'::text, 'operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'sourceRecordIds'::text, 'phase'::text, 'planSha256'::text, 'packageManifestSha256'::text, 'baselineBatchId'::text, 'documentBatchId'::text]) AND ((((result_data - ARRAY['profile'::text, 'operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'sourceRecordIds'::text, 'phase'::text, 'planSha256'::text, 'packageManifestSha256'::text, 'baselineBatchId'::text, 'documentBatchId'::text]) - 'historicalHallTargetCapturesSha256'::text) - 'batched_import_v1'::text) = '{}'::jsonb) AND ((NOT (result_data ? 'historicalHallTargetCapturesSha256'::text)) OR ((action = 'IMPORT_CHUNK'::text) AND ((result_data ->> 'phase'::text) = 'DOCUMENTS'::text) AND (jsonb_typeof((result_data -> 'historicalHallTargetCapturesSha256'::text)) = 'string'::text) AND ((result_data ->> 'historicalHallTargetCapturesSha256'::text) ~ '^[0-9a-f]{64}$'::text))) AND ((NOT (result_data ? 'batched_import_v1'::text)) OR ((jsonb_typeof((result_data -> 'batched_import_v1'::text)) = 'object'::text) AND ((result_data -> 'batched_import_v1'::text) ?& ARRAY['identity'::text, 'descriptor'::text, 'full_xid'::text, 'controller'::text]) AND (((result_data -> 'batched_import_v1'::text) - ARRAY['identity'::text, 'descriptor'::text, 'full_xid'::text, 'controller'::text]) = '{}'::jsonb) AND (jsonb_typeof(((result_data -> 'batched_import_v1'::text) -> 'identity'::text)) = 'object'::text) AND (((result_data -> 'batched_import_v1'::text) -> 'identity'::text) ?& ARRAY['rootOperationId'::text, 'batchId'::text, 'documentBatchId'::text, 'packageSha256'::text, 'planSha256'::text, 'namespace'::text, 'cutoffAt'::text]) AND ((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) - ARRAY['rootOperationId'::text, 'batchId'::text, 'documentBatchId'::text, 'packageSha256'::text, 'planSha256'::text, 'namespace'::text, 'cutoffAt'::text]) = '{}'::jsonb) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'rootOperationId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'batchId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'documentBatchId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'packageSha256'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'planSha256'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'namespace'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'identity'::text) -> 'cutoffAt'::text)) = 'string'::text) AND (jsonb_typeof(((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text)) = 'object'::text) AND (((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) ?& ARRAY['phase'::text, 'first'::text, 'last'::text, 'rows'::text, 'bytes'::text, 'ordinal'::text, 'subBatchId'::text, 'predecessor'::text, 'descriptorSha256'::text, 'firstOperationId'::text, 'lastOperationId'::text, 'previousLastOperationId'::text, 'previousDescriptorSha256'::text]) AND ((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) - ARRAY['phase'::text, 'first'::text, 'last'::text, 'rows'::text, 'bytes'::text, 'ordinal'::text, 'subBatchId'::text, 'predecessor'::text, 'descriptorSha256'::text, 'firstOperationId'::text, 'lastOperationId'::text, 'previousLastOperationId'::text, 'previousDescriptorSha256'::text]) = '{}'::jsonb) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'phase'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'subBatchId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'descriptorSha256'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'firstOperationId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'lastOperationId'::text)) = 'string'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'first'::text)) = 'number'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'last'::text)) = 'number'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'rows'::text)) = 'number'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'bytes'::text)) = 'number'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'ordinal'::text)) = 'number'::text) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'predecessor'::text)) = ANY (ARRAY['string'::text, 'null'::text])) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'previousLastOperationId'::text)) = ANY (ARRAY['string'::text, 'null'::text])) AND (jsonb_typeof((((result_data -> 'batched_import_v1'::text) -> 'descriptor'::text) -> 'previousDescriptorSha256'::text)) = ANY (ARRAY['string'::text, 'null'::text])) AND (jsonb_typeof(((result_data -> 'batched_import_v1'::text) -> 'full_xid'::text)) = 'string'::text) AND (((result_data -> 'batched_import_v1'::text) ->> 'full_xid'::text) ~ '^[0-9]+$'::text) AND (jsonb_typeof(((result_data -> 'batched_import_v1'::text) -> 'controller'::text)) = 'string'::text) AND (length(((result_data -> 'batched_import_v1'::text) ->> 'controller'::text)) > 0))) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND ((result_data ->> 'sequence'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['STAGED'::text, 'VALIDATING'::text, 'IMPORTED'::text])) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND (jsonb_typeof((result_data -> 'sourceRecordIds'::text)) = 'array'::text) AND ((result_data ->> 'phase'::text) = ANY (ARRAY['INITIALIZE'::text, 'MASTER'::text, 'KEYS'::text, 'BASELINE_SEAL'::text, 'DOCUMENT_STAGE'::text, 'DOCUMENTS'::text, 'DOCUMENT_PUBLISH'::text])) AND ((result_data ->> 'planSha256'::text) ~ '^[0-9a-f]{64}$'::text) AND ((result_data ->> 'packageManifestSha256'::text) ~ '^[0-9a-f]{64}$'::text))\n    ELSE (\n    CASE\n        WHEN (target_type = ANY (ARRAY['HISTORY_SALES'::text, 'HISTORY_TRANSFER'::text])) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'dataset'::text, 'kind'::text, 'documentId'::text, 'revisionId'::text, 'version'::text, 'ledgerEntryIds'::text]) AND ((result_data - ARRAY['operationId'::text, 'dataset'::text, 'kind'::text, 'documentId'::text, 'revisionId'::text, 'version'::text, 'ledgerEntryIds'::text]) = '{}'::jsonb) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'dataset'::text) = 'HISTORY'::text) AND ((result_data ->> 'kind'::text) =\n        CASE target_type\n            WHEN 'HISTORY_SALES'::text THEN 'sales'::text\n            ELSE 'transfers'::text\n        END) AND ((result_data ->> 'documentId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'revisionId'::text)) = 'string'::text) AND ((result_data ->> 'revisionId'::text) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND ((((result_data ->> 'version'::text))::numeric >= (2)::numeric) AND (((result_data ->> 'version'::text))::numeric <= (2147483647)::numeric)) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text))\n        ELSE (\n        CASE\n            WHEN ((target_type = 'CATEGORY'::text) AND (action = ANY (ARRAY['REORDER'::text, 'UNDO_REORDER'::text]))) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text, 'order'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text, 'order'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'kind'::text) = 'CATEGORY'::text) AND (jsonb_typeof((result_data -> 'targetId'::text)) = 'string'::text) AND ((result_data ->> 'targetId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'order'::text)) = 'object'::text) AND ((result_data -> 'order'::text) ?& ARRAY['parentId'::text, 'undoOfOperationId'::text, 'members'::text]) AND (((result_data -> 'order'::text) - ARRAY['parentId'::text, 'undoOfOperationId'::text, 'members'::text]) = '{}'::jsonb) AND (jsonb_typeof(((result_data -> 'order'::text) -> 'members'::text)) = 'array'::text))\n            ELSE (\n            CASE\n                WHEN ((target_type = 'IMPORT'::text) AND (action = ANY (ARRAY['IMPORT_CORE_STAGE'::text, 'IMPORT_BIND_FULL_SOURCE'::text]))) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'phase'::text, 'coreSourceDigest'::text, 'coreCounts'::text]) AND ((result_data - ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text, 'phase'::text, 'coreSourceDigest'::text, 'coreCounts'::text]) = '{}'::jsonb) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'sequence'::text)) = 'number'::text) AND ((result_data ->> 'sequence'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'cursor'::text)) = 'number'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'status'::text) = 'STAGED'::text) AND ((result_data -> 'ledgerEntryIds'::text) = '[]'::jsonb) AND ((result_data ->> 'phase'::text) =\n                CASE action\n                    WHEN 'IMPORT_CORE_STAGE'::text THEN 'CORE_INITIALIZED_V1'::text\n                    ELSE 'FULL_SOURCE_BOUND_V1'::text\n                END) AND ((result_data ->> 'coreSourceDigest'::text) ~ '^[a-f0-9]{64}$'::text) AND ((result_data -> 'coreCounts'::text) = '{\"HALL\": 22, \"STAFF\": 49, \"CUSTOMER\": 22, \"WAREHOUSE\": 22, \"USER_ACCOUNT\": 49}'::jsonb))\n                ELSE (\n                CASE\n                    WHEN (target_type = ANY ('{PRODUCT,CATEGORY,COLOR,FIT,HALL,WAREHOUSE,STAFF,ACCOUNT,PAYMENT_METHOD,PAYMENT_ACCOUNT}'::text[])) THEN ((jsonb_typeof(result_data) = 'object'::text) AND (result_data ?& ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'targetId'::text, 'version'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND (jsonb_typeof((result_data -> 'kind'::text)) = 'string'::text) AND ((result_data ->> 'kind'::text) = target_type) AND (jsonb_typeof((result_data -> 'targetId'::text)) = 'string'::text) AND ((result_data ->> 'targetId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text))\n                    ELSE (\n                    CASE\n                        WHEN (target_type = 'IMPORT'::text) THEN ((jsonb_typeof(result_data) = 'object'::text) AND ((result_data - ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text]) = '{}'::jsonb) AND (result_data ?& ARRAY['operationId'::text, 'batchId'::text, 'sequence'::text, 'cursor'::text, 'status'::text, 'ledgerEntryIds'::text]) AND ((result_data ->> 'operationId'::text) = (id)::text) AND ((result_data ->> 'batchId'::text) = (target_id)::text) AND ((result_data ->> 'sequence'::text) ~ '^[0-9]+$'::text) AND ((result_data ->> 'cursor'::text) ~ '^[0-9]+$'::text) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['STAGED'::text, 'VALIDATING'::text, 'IMPORTED'::text])))\n                        ELSE (((jsonb_typeof(result_data) = 'object'::text) AND\n                        CASE\n                            WHEN (target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])) THEN ((result_data ?& ARRAY['operationId'::text, 'version'::text, 'status'::text, 'ledgerEntryIds'::text]) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'operationId'::text) IS DISTINCT FROM (id)::text)) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'status'::text)) = 'string'::text) AND ((result_data ->> 'status'::text) = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'VOID'::text])) AND (jsonb_typeof((result_data -> 'ledgerEntryIds'::text)) = 'array'::text) AND\n                            CASE target_type\n                                WHEN 'SALES'::text THEN ((result_data ? 'salesId'::text) AND (NOT (result_data ? 'transferId'::text)) AND (jsonb_typeof((result_data -> 'salesId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'salesId'::text) IS DISTINCT FROM (target_id)::text)))\n                                WHEN 'TRANSFER'::text THEN ((result_data ? 'transferId'::text) AND (NOT (result_data ? 'salesId'::text)) AND (jsonb_typeof((result_data -> 'transferId'::text)) = 'string'::text) AND (NOT ((result_data ->> 'transferId'::text) IS DISTINCT FROM (target_id)::text)))\n                                ELSE false\n                            END)\n                            ELSE ((result_data ?& ARRAY['operationId'::text, 'kind'::text, 'partyId'::text, 'version'::text, 'code'::text, 'enabled'::text]) AND ((result_data - ARRAY['operationId'::text, 'kind'::text, 'partyId'::text, 'version'::text, 'code'::text, 'enabled'::text]) = '{}'::jsonb) AND (jsonb_typeof((result_data -> 'operationId'::text)) = 'string'::text) AND ((result_data ->> 'operationId'::text) = (id)::text) AND (jsonb_typeof((result_data -> 'kind'::text)) = 'string'::text) AND ((result_data ->> 'kind'::text) = target_type) AND (jsonb_typeof((result_data -> 'partyId'::text)) = 'string'::text) AND ((result_data ->> 'partyId'::text) = (target_id)::text) AND (jsonb_typeof((result_data -> 'version'::text)) = 'number'::text) AND ((result_data ->> 'version'::text) ~ '^[1-9][0-9]*$'::text) AND (jsonb_typeof((result_data -> 'code'::text)) = 'string'::text) AND (length(btrim((result_data ->> 'code'::text))) > 0) AND (jsonb_typeof((result_data -> 'enabled'::text)) = 'boolean'::text))\n                        END) IS TRUE)\n                    END IS TRUE)\n                END IS TRUE)\n            END IS TRUE)\n        END IS TRUE)\n    END IS TRUE)\nEND IS TRUE))","deleteAction":" ","inheritCount":0,"updateAction":" ","deleteColumns":null,"initiallyDeferred":false,"referencedColumns":null,"referencedRelation":null}}$batched_receipt_spec$::jsonb;
 observed jsonb; before_meta jsonb; after_meta jsonb;
 previous_quote text:=current_setting('quote_all_identifiers');
BEGIN
 LOCK TABLE naijue_erp.operation_receipt IN ACCESS EXCLUSIVE MODE;
 PERFORM set_config('quote_all_identifiers','off',true);
 SELECT pg_catalog.jsonb_build_object('relation',r.relname,'name',c.conname,'definition',pg_catalog.pg_get_constraintdef(c.oid,false),'kind',c.contype,'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred,'noInherit',c.connoinherit,'local',c.conislocal,'inheritCount',c.coninhcount,'referencedRelation',rr.relname,'index',ix.relname,'columns',c.conkey,'referencedColumns',c.confkey,'deleteAction',c.confdeltype,'updateAction',c.confupdtype,'matchType',c.confmatchtype,'deleteColumns',c.confdelsetcols),to_jsonb(c)-ARRAY['oid','conbin'] INTO STRICT observed,before_meta
  FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=c.confrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=c.conindid WHERE c.conrelid='naijue_erp.operation_receipt'::regclass AND c.conname='receipt_result_by_kind';
 IF observed IS DISTINCT FROM spec->'before' THEN
  RAISE EXCEPTION 'BATCH_RECEIPT_CONSTRAINT_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
 EXECUTE 'ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind '||(spec->'after'->>'definition');
 SELECT pg_catalog.jsonb_build_object('relation',r.relname,'name',c.conname,'definition',pg_catalog.pg_get_constraintdef(c.oid,false),'kind',c.contype,'validated',c.convalidated,'deferrable',c.condeferrable,'initiallyDeferred',c.condeferred,'noInherit',c.connoinherit,'local',c.conislocal,'inheritCount',c.coninhcount,'referencedRelation',rr.relname,'index',ix.relname,'columns',c.conkey,'referencedColumns',c.confkey,'deleteAction',c.confdeltype,'updateAction',c.confupdtype,'matchType',c.confmatchtype,'deleteColumns',c.confdelsetcols),to_jsonb(c)-ARRAY['oid','conbin'] INTO STRICT observed,after_meta
  FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid LEFT JOIN pg_catalog.pg_class rr ON rr.oid=c.confrelid LEFT JOIN pg_catalog.pg_class ix ON ix.oid=c.conindid WHERE c.conrelid='naijue_erp.operation_receipt'::regclass AND c.conname='receipt_result_by_kind';
 IF observed IS DISTINCT FROM spec->'after' OR before_meta IS DISTINCT FROM after_meta THEN
  RAISE EXCEPTION 'BATCH_RECEIPT_CONSTRAINT_POSTCONDITION_DIFFERS' USING ERRCODE='55000'; END IF;
 PERFORM set_config('quote_all_identifiers',previous_quote,true);
END $batched_receipt_constraint$;

COMMIT;
