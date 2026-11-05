-- UNINSTALLED REVIEW CANDIDATE. Runtime catalog successor required.
-- PostgreSQL execution and metadata/ACL preservation are NOT VERIFIED.
BEGIN;
-- UNINSTALLED SOURCE CANDIDATE ONLY. Not in the reviewed install/catalog cohort.
-- Requires independent review, new source/catalog pins and real PostgreSQL tests.
-- No roles, permissions, tables, triggers or existing migration files are changed.
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $predecessor$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM pg_catalog.pg_proc
 WHERE oid='naijue_erp.standard_whole_package_closed_v2(uuid)'::regprocedure;
 IF p.proowner IS DISTINCT FROM current_user::regrole::oid
  OR p.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '71ef59766fc69b83dd6494352e4ca8a189d27a8f09fc881d3421574558823601'
  OR p.prosecdef IS DISTINCT FROM true
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
 THEN RAISE EXCEPTION 'WHOLE_CLOSURE_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
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
  IF b.status IS DISTINCT FROM 'IMPORTED' OR last_status->>b.id::text IS DISTINCT FROM 'IMPORTED'
   OR b.checkpoint IS DISTINCT FROM previous->b.id::text OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
   OR b.source_hash IS DISTINCT FROM init->>'package_manifest_sha256' OR b.source_name IS DISTINCT FROM init->>'namespace'
  THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_batch WHERE id IN (baseline_id,documents_id))<>2 THEN RAISE EXCEPTION 'WHOLE_PACKAGE_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN final_result;
END $$;

-- Explicit installation access, SOURCE ONLY / NOT EXECUTED.
-- No role creation, membership, login, session or table grants.
SET LOCAL search_path=pg_catalog,naijue_erp;
DO $access$ DECLARE item jsonb; p record; role_row record; recipient oid; BEGIN
 IF current_user::regrole::oid<>(SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') THEN RAISE EXCEPTION 'WHOLE_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR role_row IN SELECT * FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') LOOP
  IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole OR role_row.rolreplication OR role_row.rolbypassrls
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=role_row.oid)
   OR role_row.oid IN ((SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp'),(SELECT datdba FROM pg_catalog.pg_database WHERE datname=current_database()))
   OR has_parameter_privilege(role_row.oid,'session_replication_role','SET')
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE has_schema_privilege(role_row.oid,n.oid,'CREATE'))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND
     (c.relowner=role_row.oid OR (c.relkind IN ('r','p','v','m','f') AND
      (has_table_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(role_row.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      OR (c.relkind='S' AND has_sequence_privilege(role_row.oid,c.oid,'USAGE,SELECT,UPDATE'))))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=role_row.oid)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_type WHERE typowner=role_row.oid)

  THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLE_UNSAFE' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2'))<>2 THEN RAISE EXCEPTION 'WHOLE_INSTALL_ROLES_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements('[{"signature":"naijue_erp.standard_whole_package_context_v2(uuid)","sha256":"ef1631ee8ac06527c13253aad1eec7d8902dd6411d46b1db729fdbf589b2b4e2","new":true},{"signature":"naijue_erp.standard_whole_package_closed_v2(uuid)","sha256":"d445ccee97d806f1e6a878c6a224ab01a8fd9890b685bfc85df9a7a2ee512c38","new":true},{"signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","sha256":"0d0547318a5a940639f288a73f08ebd9396b079b0c88810b7fa016870652d840","new":true},{"signature":"naijue_erp.assert_standard_import_operation(uuid)","sha256":"4be1b13f9eb70edca20d05941ff0205677abb312dd29063a7b6cf93386bbc9f8","new":false},{"signature":"naijue_erp.standard_whole_package_prepare_v2(jsonb,text)","sha256":"57d682fb7066de41287b6bf03d6c430cc89572c413a8aba02a7ac81a4e3c84a1","new":true},{"signature":"naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb)","sha256":"178d956433f015e739cf60530afc6006ff267471e8d98edb6decbeed4d87d1e4","new":true},{"signature":"naijue_erp.standard_whole_package_finish_v2(uuid)","sha256":"f0786b4001d586a6d268aa579a68e338d12522dc4b7aec88578d2d9289b1cb58","new":true},{"signature":"naijue_erp.standard_whole_package_inspect_v2(jsonb,text)","sha256":"dda2a78e740416b29f020318bb25c8a2debf4f016b3968f95a7cf86991ad1eea","new":true},{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","sha256":"9e9842673283ceabe9b1c48a45d8a3dd829f6c1217b7e46cfb27ac0ffd65998b","new":false},{"signature":"naijue_erp.guard_history_publication()","sha256":"1368f91865d8d694fa9685e6b6c54485cb31d3d19a7deae1c8d521408ae5c84b","new":false},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"ba5b4b041d9986c25cb3d0b195c5e4e5a08e9c8465fc95046c96e776cd53fa62","new":false},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"eb30d86ff11a3ed314ab82f80bf6a4e3c840efe0f59cba9693a76af04c460844","new":false},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"5a8c4a4ae7e0fdc0c6ce2590676b18254c335be6af1d72364ffdf16e9dd791a9","new":false},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"8fb4e55740e80cea6fbe87b3419b1e1dd6c2824376d7bea990b16ed0cf464e70","new":false},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"874e33905c6d75eceafec0c554e0b28af5ed495825b21cbc694522d7d4d57863","new":false},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"edb6cbed80a77826cb2b698af14ae1ac6ee8cd99b0da3d4f8985a7c2563e0699","new":false},{"signature":"naijue_erp.standard_import_row_intent(text,jsonb)","sha256":"4ea68e6eee19a05be7ad9aaa7eefcfb33bbf9af2d41a790c808e3b2693aef3ed","new":false},{"signature":"naijue_erp.validate_import_source_commit()","sha256":"72d8f8bb1e78de21848df2be29ba75dd8e5c97c5349164ca32c432b433e007ae","new":false},{"signature":"naijue_erp.validate_import_operation()","sha256":"e500e06a4630bf0ae1fb38a40fb868d0c0df0a5ebb025beeed2314cf62fe388e","new":false},{"signature":"naijue_erp.validate_import_batch_commit()","sha256":"0975bb6321f78cbd1c6158145c4f458fe609d273d63bbe344be4ac2a5316ab9f","new":false},{"signature":"naijue_erp.validate_sparse_balance_commit()","sha256":"c071e1159a52b192e9526645c02febaaccd9c390cbe63c7850cdf2be4440077d","new":false},{"signature":"naijue_erp.standard_whole_package_verify_v2(jsonb,text)","sha256":"85a011555b44af125b4b90553719fc686300dd11fa832f7fddd8779b71f61336","new":true}]'::jsonb) LOOP
  SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
  IF encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'sha256' OR p.proowner<>current_user::regrole::oid THEN RAISE EXCEPTION 'WHOLE_INSTALL_SOURCE_DIFFERS' USING ERRCODE='55000'; END IF;
  IF (item->>'new')::boolean THEN
   IF NOT p.prosecdef OR p.proleakproof OR p.proisstrict OR p.proretset OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proparallel<>'u' OR p.prorettype<>'jsonb'::regtype OR p.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC'] THEN RAISE EXCEPTION 'WHOLE_INSTALL_METADATA_DIFFERS' USING ERRCODE='55000'; END IF;
   recipient:=CASE WHEN p.proname IN ('standard_whole_package_prepare_v2','standard_whole_package_inspect_v2','standard_whole_package_verify_v2') THEN 'erp_unified27_initializer_2393dbc6db9581c2'::regrole::oid
    WHEN p.proname IN ('standard_whole_package_step_v2','standard_whole_package_finish_v2') THEN 'erp_unified27_importer_2393dbc6db9581c2'::regrole::oid ELSE p.proowner END;
   IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.privilege_type='EXECUTE' AND (acl.grantee NOT IN (p.proowner,recipient) OR (acl.grantee<>p.proowner AND acl.is_grantable))) THEN RAISE EXCEPTION 'WHOLE_INSTALL_ACL_UNSAFE' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.operation_receipt'::regclass AND tgname='import_operation_consistency' AND tgfoid='naijue_erp.validate_import_operation()'::regprocedure AND tgtype=5 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND strpos(pg_get_triggerdef(oid,false),' WHEN ((new.target_type = ''IMPORT''::text)) EXECUTE FUNCTION ')>0)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.import_batch'::regclass AND tgname='import_batch_command_consistency' AND tgfoid='naijue_erp.validate_import_batch_commit()'::regprocedure AND tgtype=21 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='naijue_erp.import_record'::regclass AND tgname='import_source_final_consistency' AND tgfoid='naijue_erp.validate_import_source_commit()'::regprocedure AND tgtype=5 AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
 THEN RAISE EXCEPTION 'WHOLE_INSTALL_DEFERRED_TRIGGER_REQUIRED' USING ERRCODE='55000'; END IF;
END $access$;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_whole_package_prepare_v2(jsonb,text),naijue_erp.standard_whole_package_inspect_v2(jsonb,text),naijue_erp.standard_whole_package_verify_v2(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_whole_package_step_v2(uuid,integer,text,jsonb),naijue_erp.standard_whole_package_finish_v2(uuid) TO erp_unified27_importer_2393dbc6db9581c2;
-- This opt-in whole installation exposes only whole entrypoints. Legacy source/installation is unchanged.
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_initialize_current_admin(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_master_chunk(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_baseline_keys(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_document_chunk(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_publish_import(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_status(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_inspect_target(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
REVOKE EXECUTE ON FUNCTION naijue_erp.standard_import_verify(jsonb,text) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
COMMIT;
