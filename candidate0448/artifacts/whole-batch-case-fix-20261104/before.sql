-- UNINSTALLED SOURCE CANDIDATE ONLY. Not in the reviewed install/catalog cohort.
-- Requires independent review, new source/catalog pins and real PostgreSQL tests.
-- No roles, permissions, tables, triggers or existing migration files are changed.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $predecessor$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM pg_catalog.pg_proc
 WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure;
 IF p.proowner IS DISTINCT FROM current_user::regrole::oid
  OR p.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM 'd445ccee97d806f1e6a878c6a224ab01a8fd9890b685bfc85df9a7a2ee512c38'
  OR p.prosecdef IS DISTINCT FROM true
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
 THEN RAISE EXCEPTION 'WHOLE_BATCH_CLOSURE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $predecessor$;
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_closed_v2(root_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE root_a naijue_erp.audit_change%ROWTYPE; root_r naijue_erp.operation_receipt%ROWTYPE;
 a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 init jsonb; previous jsonb:='{}'; last_status jsonb:='{}'; expected_ordinal integer:=0; ordinal integer; command_phase text;
 baseline_id uuid; documents_id uuid; final_result jsonb; rank integer; last_rank integer:=-1;
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
  -- A committed receipt must prove the whole lifecycle independently of the writer.
  -- MASTER/KEYS/DOCUMENTS chunks may repeat; boundary transitions may not.
  IF (rank=3 AND baseline_sealed) OR (rank>3 AND NOT baseline_sealed)
   OR (rank=4 AND documents_staged) OR (rank>4 AND NOT documents_staged)
   OR documents_published THEN
   RAISE EXCEPTION 'WHOLE_SINGLETON_PHASE_INVALID' USING ERRCODE='23514'; END IF;
  baseline_sealed:=baseline_sealed OR rank=3;
  documents_staged:=documents_staged OR rank=4;
  documents_published:=documents_published OR rank=6;
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
   OR b.mapping_version IS DISTINCT FROM CASE WHEN b.id=baseline_id THEN 'STANDARD_INITIAL_EXPLICIT_KEYS_V1' ELSE 'DOCUMENT_CONVERSION_V1' END
   OR b.inventory_mode IS DISTINCT FROM CASE WHEN b.id=baseline_id THEN 'CUTOFF_STOCK_BASELINE' ELSE 'DOCUMENT_CONVERSION' END
   OR b.created_at IS DISTINCT FROM root_r.completed_at
   OR b.completed_at IS DISTINCT FROM root_r.completed_at
   OR b.checkpoint->'expected' IS DISTINCT FROM
     CASE WHEN b.id=baseline_id THEN init->'payload'->'expected' ELSE init->'payload'->'expected_documents' END
  THEN RAISE EXCEPTION 'WHOLE_BATCH_INITIALIZATION_BINDING_INVALID' USING ERRCODE='23514'; END IF;
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;
COMMIT;
