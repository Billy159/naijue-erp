-- SOURCE CANDIDATE ONLY. No installer/profile dispatch or execution authority.
-- Successor of the exact35 final historical-settlement-difference catalog.
-- A and B are one change: provision one current ADMIN without an import, then
-- admit only that proven account to its first complete real-business import.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;

-- PRIVATE proof. No credentials or session tokens leave this function.
CREATE FUNCTION naijue_erp.standard_admin_provision_proof_v1(provision_operation uuid,provision_fingerprint text,admin jsonb,require_empty boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
 s jsonb; u jsonb; original_account jsonb; relation record; any_rows boolean;
BEGIN
 IF provision_operation IS NULL OR provision_fingerprint IS NULL OR provision_fingerprint !~ '^[0-9a-f]{64}$'
  OR jsonb_typeof(admin) IS DISTINCT FROM 'object' OR NOT(admin ?& ARRAY['staff_id','account_id','staff_name','login_name'])
  OR admin-ARRAY['staff_id','account_id','staff_name','login_name']<>'{}' OR require_empty IS NULL
  OR EXISTS(SELECT 1 FROM jsonb_each(admin) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string') THEN
  RAISE EXCEPTION 'ADMIN_PROVISION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
 IF require_empty THEN
  FOR relation IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' ORDER BY c.relname LOOP
   EXECUTE format('LOCK TABLE naijue_erp.%I IN SHARE ROW EXCLUSIVE MODE',relation.relname);
  END LOOP;
 END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=provision_operation FOR SHARE;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=provision_operation FOR SHARE;
 SELECT to_jsonb(t) INTO STRICT s FROM naijue_erp.staff t WHERE id=(admin->>'staff_id')::uuid FOR SHARE;
 SELECT to_jsonb(t) INTO STRICT u FROM naijue_erp.user_account t WHERE id=(admin->>'account_id')::uuid FOR SHARE;
 original_account:=a.after_values->'accounts'->0;
 IF r.request_key IS DISTINCT FROM 'admin-provision-only-v1:'||provision_operation::text
  OR r.request_hash IS DISTINCT FROM provision_fingerprint OR r.status IS DISTINCT FROM 'COMMITTED'
  OR r.action IS DISTINCT FROM 'CREATE' OR r.target_type IS DISTINCT FROM 'STAFF' OR r.target_id::text IS DISTINCT FROM admin->>'staff_id'
  OR r.actor_account_id::text IS DISTINCT FROM admin->>'account_id'
  OR r.result_data IS DISTINCT FROM jsonb_build_object('operationId',r.id,'kind','STAFF','targetId',r.target_id,'version',1)
  OR a.id IS DISTINCT FROM r.id OR a.actor_account_id IS DISTINCT FROM r.actor_account_id OR a.object_type IS DISTINCT FROM 'STAFF'
  OR a.object_id IS DISTINCT FROM r.target_id OR a.action IS DISTINCT FROM 'CREATE' OR a.old_version IS NOT NULL OR a.new_version IS DISTINCT FROM 1
  OR a.before_values IS NOT NULL OR a.occurred_at IS DISTINCT FROM r.completed_at
  OR a.after_values-ARRAY['accounts','account_credentials'] IS DISTINCT FROM s
  OR a.after_values->'account_credentials' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('account_id',r.actor_account_id,'action','CREATE'))
  OR jsonb_typeof(a.after_values->'accounts') IS DISTINCT FROM 'array' OR jsonb_array_length(a.after_values->'accounts') IS DISTINCT FROM 1
  OR s->>'name' IS DISTINCT FROM admin->>'staff_name' OR s->>'role' IS DISTINCT FROM 'ADMIN'
  OR s->'hall_id' IS DISTINCT FROM 'null'::jsonb OR s->'contact' IS DISTINCT FROM 'null'::jsonb
  OR s->>'employment_status' IS DISTINCT FROM '在职' OR s->>'version' IS DISTINCT FROM '1'
  OR u->>'staff_id' IS DISTINCT FROM admin->>'staff_id' OR u->>'login_name' IS DISTINCT FROM admin->>'login_name'
  OR u->'login_enabled' IS DISTINCT FROM 'true'::jsonb
  OR (u->>'password_hash' ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$') IS DISTINCT FROM true
  OR u-ARRAY['password_hash','auth_version','version','updated_at'] IS DISTINCT FROM original_account-ARRAY['auth_version','version','updated_at']
  OR original_account->>'version' IS DISTINCT FROM '1' OR original_account->>'auth_version' IS DISTINCT FROM '1'
  OR (original_account->>'created_at')::timestamptz IS DISTINCT FROM r.completed_at
  OR (original_account->>'updated_at')::timestamptz IS DISTINCT FROM r.completed_at
  OR (u->>'version')::bigint IS DISTINCT FROM (u->>'auth_version')::bigint OR (u->>'version')::bigint<1
  OR (u->>'updated_at')::timestamptz<r.completed_at THEN
  RAISE EXCEPTION 'ADMIN_PROVISION_IDENTITY_OR_CHAIN_DIFFERS' USING ERRCODE='23514'; END IF;
 IF require_empty THEN
  -- No business adoption. Only this one provisioning chain, credential-reset
  -- receipts for this same account, and its actual auth_session rows may exist.
  IF (SELECT count(*) FROM naijue_erp.staff)<>1 OR (SELECT count(*) FROM naijue_erp.user_account)<>1
   OR EXISTS(SELECT 1 FROM naijue_erp.auth_session x WHERE x.account_id<>r.actor_account_id OR x.auth_version>(u->>'auth_version')::integer OR x.created_at<r.completed_at)
   OR EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id<>r.id AND NOT(
    x.target_type='ACCOUNT' AND x.target_id=r.actor_account_id AND x.actor_account_id=r.actor_account_id AND x.action='RESET_PASSWORD' AND x.completed_at>=r.completed_at
    AND EXISTS(SELECT 1 FROM naijue_erp.audit_change y WHERE y.operation_id=x.id AND y.actor_account_id=x.actor_account_id AND y.object_type=x.target_type AND y.object_id=x.target_id AND y.action=x.action AND y.occurred_at=x.completed_at)))
   OR EXISTS(SELECT 1 FROM naijue_erp.audit_change x WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt y WHERE y.id=x.operation_id)) THEN
   RAISE EXCEPTION 'ADMIN_PROVISION_ONLY_TECHNICAL_CHAIN_REQUIRED' USING ERRCODE='23514'; END IF;
  FOR relation IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname NOT IN ('schema_migration','staff','user_account','operation_receipt','audit_change','auth_session') LOOP
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',relation.relname) INTO any_rows;
   IF any_rows THEN RAISE EXCEPTION 'ADMIN_PROVISION_BUSINESS_NOT_EMPTY' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('provision_operation_id',r.id,'provision_request_sha256',r.request_hash,'staff',s,'account',u-'password_hash');
END $$;
REVOKE ALL ON FUNCTION naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean) FROM PUBLIC,erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;

CREATE FUNCTION naijue_erp.standard_admin_provision_only_v1(request jsonb,encoded_scrypt text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE operation uuid; admin jsonb; fingerprint text; prior naijue_erp.operation_receipt%ROWTYPE;
 relation record; any_rows boolean; staff_row jsonb; account_row jsonb; result jsonb;
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
 IF NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_TWO_CAPABILITIES_REQUIRED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(request) IS DISTINCT FROM 'object'
  OR NOT(request ?& ARRAY['format_version','mode','operation_id','request_key','admin','installation_record_sha256','setup_reference'])
  OR request-ARRAY['format_version','mode','operation_id','request_key','admin','installation_record_sha256','setup_reference']<>'{}'
  OR EXISTS(SELECT 1 FROM jsonb_each(request) f WHERE f.key<>'admin' AND jsonb_typeof(f.value) IS DISTINCT FROM 'string')
  OR request->>'format_version' IS DISTINCT FROM 'FIRST_ADMIN_SETUP_V1' OR request->>'mode' IS DISTINCT FROM 'ADMIN_PROVISION_ONLY'
  OR (request->>'installation_record_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true OR coalesce(length(btrim(request->>'setup_reference')),0)=0
  OR encoded_scrypt IS NULL OR (encoded_scrypt ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$') IS DISTINCT FROM true
  OR strpos(request::text,encoded_scrypt)>0 THEN
  RAISE EXCEPTION 'ADMIN_PROVISION_REQUEST_INVALID' USING ERRCODE='23514'; END IF;
 operation:=(request->>'operation_id')::uuid;admin:=request->'admin';
 IF operation IS NULL OR request->>'request_key' IS DISTINCT FROM 'admin-provision-only-v1:'||operation::text
  OR jsonb_typeof(admin) IS DISTINCT FROM 'object' OR NOT(admin ?& ARRAY['staff_id','account_id','staff_name','login_name'])
  OR admin-ARRAY['staff_id','account_id','staff_name','login_name']<>'{}'
  OR EXISTS(SELECT 1 FROM jsonb_each(admin) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')
  OR (admin->>'staff_id')::uuid IS NULL OR (admin->>'account_id')::uuid IS NULL
  OR coalesce(length(btrim(admin->>'staff_name')),0)=0 OR coalesce(length(btrim(admin->>'login_name')),0)=0 OR octet_length(admin->>'login_name')>256 THEN
  RAISE EXCEPTION 'ADMIN_PROVISION_IDENTITY_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 PERFORM naijue_erp.maintenance_administrator_mutex();
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:receipt:'||jsonb_build_array(admin->>'account_id',request->>'request_key')::text,0));
 fingerprint:=encode(sha256(convert_to('ADMIN_PROVISION_ONLY:'||request::text||':'||encoded_scrypt,'UTF8')),'hex');
 SELECT * INTO prior FROM naijue_erp.operation_receipt WHERE id=operation OR (actor_account_id=(admin->>'account_id')::uuid AND request_key=request->>'request_key');
 IF FOUND THEN
  IF prior.id IS DISTINCT FROM operation OR prior.request_hash IS DISTINCT FROM fingerprint OR prior.actor_account_id::text IS DISTINCT FROM admin->>'account_id'
   OR prior.request_key IS DISTINCT FROM request->>'request_key' OR prior.target_type IS DISTINCT FROM 'STAFF' OR prior.target_id::text IS DISTINCT FROM admin->>'staff_id' OR prior.action IS DISTINCT FROM 'CREATE' THEN
   RAISE EXCEPTION 'STANDARD_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=prior.id AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN RAISE EXCEPTION 'WHOLE_CURRENT_TRANSACTION_NOT_COMMITTED' USING ERRCODE='25000'; END IF;
  RETURN jsonb_build_object('state','ALREADY_COMMITTED','receipt',prior.result_data,'request_sha256',prior.request_hash);
 END IF;
 FOR relation IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' ORDER BY c.relname LOOP
  EXECUTE format('LOCK TABLE naijue_erp.%I IN SHARE ROW EXCLUSIVE MODE',relation.relname);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',relation.relname) INTO any_rows;
  IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: first administrator requires empty target' USING ERRCODE='23514'; END IF;
 END LOOP;
 INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)
  VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);
 INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)
  VALUES((admin->>'account_id')::uuid,(admin->>'staff_id')::uuid,admin->>'login_name',encoded_scrypt,true,1,1,transaction_timestamp(),transaction_timestamp());
 SELECT to_jsonb(t) INTO STRICT staff_row FROM naijue_erp.staff t WHERE id=(admin->>'staff_id')::uuid;
 SELECT to_jsonb(t)-'password_hash' INTO STRICT account_row FROM naijue_erp.user_account t WHERE id=(admin->>'account_id')::uuid;
 result:=jsonb_build_object('operationId',operation,'kind','STAFF','targetId',admin->>'staff_id','version',1);
 INSERT INTO naijue_erp.operation_receipt(id,actor_account_id,request_key,request_hash,action,target_type,target_id,status,result_data,completed_at)
  VALUES(operation,(admin->>'account_id')::uuid,request->>'request_key',fingerprint,'CREATE','STAFF',(admin->>'staff_id')::uuid,'COMMITTED',result,transaction_timestamp());
 INSERT INTO naijue_erp.audit_change(id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,before_values,after_values,occurred_at)
  VALUES(operation,operation,(admin->>'account_id')::uuid,'STAFF',(admin->>'staff_id')::uuid,'CREATE',NULL,1,NULL,
   staff_row||jsonb_build_object('accounts',jsonb_build_array(account_row),'account_credentials',jsonb_build_array(jsonb_build_object('account_id',admin->>'account_id','action','CREATE'))),transaction_timestamp());
 PERFORM naijue_erp.standard_admin_provision_proof_v1(operation,fingerprint,admin,true);
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','receipt',result,'request_sha256',fingerprint);
END $$;
REVOKE ALL ON FUNCTION naijue_erp.standard_admin_provision_only_v1(jsonb,text) FROM PUBLIC,erp_unified27_importer_2393dbc6db9581c2,erp_unified27_runtime_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION naijue_erp.standard_admin_provision_only_v1(jsonb,text) TO erp_unified27_initializer_2393dbc6db9581c2;

DO $admin_continuation_successor$
DECLARE specs jsonb:=$admin_continuation_changes$[
  {
    "signature": "naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)",
    "predecessor_sha256": "00ee7dd0ba4c52f089db555a1853df7b9bd587ab16952b46501f99617ef985ac",
    "successor_sha256": "071119364504d6a818ea3454514ec139763784f8a914fa5cbc4284fccaaa520b",
    "security_definer": true,
    "replacements": [
      {
        "before": " whole_context jsonb;",
        "after": " admin_provision_snapshot jsonb;\n whole_context jsonb;"
      },
      {
        "before": "  IF payload-ARRAY['mode','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval','historical_hall_approval','historical_line_amount_approval','historical_settlement_retention_approval']<>'{}'",
        "after": "  IF payload-ARRAY['mode','provision_operation_id','provision_request_sha256','manifest_ref','registry_sha256','alignment_sha256','document_batch_id','namespace_record_id','admin','expected','expected_master_counts','expected_documents','execution_contract','schema_declarations_sha256','historical_staff_hall_approval','explicit_zero_approval','historical_hall_approval','historical_line_amount_approval','historical_settlement_retention_approval']<>'{}'"
      },
      {
        "before": "   OR payload->>'mode' IS DISTINCT FROM 'NEW_EMPTY'",
        "after": "   OR (payload->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR payload->>'mode' IS NULL)\n   OR (payload->>'mode'='NEW_EMPTY' AND payload ?| ARRAY['provision_operation_id','provision_request_sha256'])\n   OR (payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' AND (NOT(payload ?& ARRAY['provision_operation_id','provision_request_sha256']) OR (payload->>'provision_operation_id' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM true OR (payload->>'provision_request_sha256' ~ '^[0-9a-f]{64}$') IS DISTINCT FROM true))"
      },
      {
        "before": "  -- No existing baseline/account/master/history adoption is silently enabled.\n  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP\n   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;\n   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;\n  END LOOP;\n  admin:=payload->'admin';\n  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)\n   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);\n  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)\n   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());\n",
        "after": "  admin:=payload->'admin';\n  IF payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN\n   PERFORM naijue_erp.maintenance_administrator_mutex();\n   IF EXISTS(SELECT 1 FROM naijue_erp.operation_receipt x WHERE x.id=(payload->>'provision_operation_id')::uuid AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN\n    RAISE EXCEPTION 'ADMIN_PROVISION_COMMITTED_RECEIPT_REQUIRED' USING ERRCODE='25000'; END IF;\n   admin_provision_snapshot:=naijue_erp.standard_admin_provision_proof_v1((payload->>'provision_operation_id')::uuid,payload->>'provision_request_sha256',admin,true);\n  ELSE\n  -- No existing baseline/account/master/history adoption is silently enabled.\n  FOR parent_row IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='naijue_erp' AND c.relkind IN ('r','p') AND c.relname<>'schema_migration' LOOP\n   EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I)',parent_row.relname) INTO any_rows;\n   IF any_rows THEN RAISE EXCEPTION 'STANDARD_NEW_EMPTY_ONLY: populated target requires separately reviewed adoption' USING ERRCODE='23514'; END IF;\n  END LOOP;\n  INSERT INTO naijue_erp.staff(id,name,hall_id,role,contact,employment_status,version)\n   VALUES((admin->>'staff_id')::uuid,admin->>'staff_name',NULL,'ADMIN',NULL,'在职',1);\n  INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at)\n   VALUES(actor,(admin->>'staff_id')::uuid,admin->>'login_name',private_parameter,true,1,1,transaction_timestamp(),transaction_timestamp());\n  END IF;\n"
      },
      {
        "before": "IF master_chunks_v2 AND command_phase='MASTER' AND kind='STAFF'",
        "after": "IF (master_chunks_v2 OR cfg->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS') AND command_phase='MASTER' AND kind='STAFF'"
      },
      {
        "before": "'current_admin',CASE WHEN command_phase='INITIALIZE' THEN payload->'admin' ELSE NULL END,",
        "after": "'current_admin',CASE WHEN command_phase='INITIALIZE' THEN CASE WHEN payload->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN payload->'admin'||jsonb_build_object('provisioned_snapshot',admin_provision_snapshot) ELSE payload->'admin' END ELSE NULL END,"
      }
    ]
  },
  {
    "signature": "naijue_erp.standard_whole_package_inspect_v2(jsonb,text)",
    "predecessor_sha256": "dda2a78e740416b29f020318bb25c8a2debf4f016b3968f95a7cf86991ad1eea",
    "successor_sha256": "e17c1236b6fca4fc1fe1e6ad91c1ffa0913bee33e8893dd96829101d53e8ae75",
    "security_definer": true,
    "replacements": [
      {
        "before": "OR init_request->'payload'->>'mode' IS DISTINCT FROM 'NEW_EMPTY'",
        "after": "OR (init_request->'payload'->>'mode' NOT IN ('NEW_EMPTY','PROVISIONED_ADMIN_EMPTY_BUSINESS') OR init_request->'payload'->>'mode' IS NULL)"
      }
    ]
  },
  {
    "signature": "naijue_erp.assert_standard_import_operation(uuid)",
    "predecessor_sha256": "6757184cd1c20d0c2ca68f5e37909d919a29b723a2f994973b69af1fb7c5eb52",
    "successor_sha256": "1f649917a82e00192b28ca77aff760976e2d29c3d83b82b98f6d5e3237d8dbfa",
    "security_definer": true,
    "replacements": [
      {
        "before": " IF r.result_data->>'phase'='INITIALIZE' THEN\n  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1\n   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;\n  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'\n   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN\n   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;\n END IF;\n",
        "after": " IF r.result_data->>'phase'='INITIALIZE' THEN\n  IF a.after_values->'request'->'payload'->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN\n   IF a.after_values->'current_admin'->'provisioned_snapshot' IS DISTINCT FROM naijue_erp.standard_admin_provision_proof_v1(\n    (a.after_values->'request'->'payload'->>'provision_operation_id')::uuid,a.after_values->'request'->'payload'->>'provision_request_sha256',a.after_values->'request'->'payload'->'admin',false) THEN\n    RAISE EXCEPTION 'ADMIN_PROVISION_IMPORT_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;\n  ELSE\n  SELECT staff_id INTO STRICT account_staff FROM naijue_erp.user_account WHERE id=r.actor_account_id AND login_enabled AND auth_version=1 AND version=1\n   AND password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' AND created_at=r.completed_at AND updated_at=r.completed_at;\n  IF account_staff::text IS DISTINCT FROM a.after_values->'current_admin'->>'staff_id'\n   OR NOT EXISTS(SELECT 1 FROM naijue_erp.staff WHERE id=account_staff AND role='ADMIN' AND hall_id IS NULL AND employment_status='在职' AND version=1) THEN\n   RAISE EXCEPTION 'STANDARD_CURRENT_PROVISIONING_CLOSURE_INVALID' USING ERRCODE='23514'; END IF;\n  END IF;\n END IF;\n"
      }
    ]
  },
  {
    "signature": "naijue_erp.standard_whole_package_verify_v2(jsonb,text)",
    "predecessor_sha256": "4bd054fef954b15bee8fb8bf2eff41d5a0a86382bd02d33244fa5e415858fcc0",
    "successor_sha256": "103dad3f9486c17f315fb627abf0920305ad6c0df7ec23cc8f3f295679f2f5b1",
    "security_definer": true,
    "replacements": [
      {
        "before": " inspected:=naijue_erp.standard_whole_package_inspect_v2(init_request,encoded_scrypt);",
        "after": " inspected:=naijue_erp.standard_whole_package_inspect_v2(init_request,encoded_scrypt);\n IF init_request->'payload'->>'mode'='PROVISIONED_ADMIN_EMPTY_BUSINESS' THEN\n  PERFORM naijue_erp.standard_admin_provision_proof_v1((init_request->'payload'->>'provision_operation_id')::uuid,init_request->'payload'->>'provision_request_sha256',init_request->'payload'->'admin',false);\n END IF;"
      }
    ]
  }
]$admin_continuation_changes$;
 spec jsonb; routine oid; before_body text; after_body text; definition text; before_meta jsonb; after_meta jsonb; replacement jsonb;
BEGIN
 IF current_user::regrole::oid IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') THEN
  RAISE EXCEPTION 'ADMIN_PROVISION_INSTALL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
  routine:=to_regprocedure(spec->>'signature');
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT before_body,before_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
  IF encode(sha256(convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
   OR before_meta->>'proowner' IS DISTINCT FROM (SELECT nspowner::text FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
   OR before_meta->'prosecdef' IS DISTINCT FROM spec->'security_definer'
   OR before_meta->'proconfig' IS DISTINCT FROM '["search_path=pg_catalog, naijue_erp, pg_temp", "TimeZone=UTC"]'::jsonb THEN
   RAISE EXCEPTION 'ADMIN_PROVISION_EXACT_PREDECESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
  definition:=pg_get_functiondef(routine);after_body:=before_body;
  FOR replacement IN SELECT value FROM jsonb_array_elements(spec->'replacements') LOOP
   IF length(replacement->>'before')=0 OR (length(after_body)-length(replace(after_body,replacement->>'before','')))/length(replacement->>'before')<>1
    OR (length(definition)-length(replace(definition,replacement->>'before','')))/length(replacement->>'before')<>1 THEN
    RAISE EXCEPTION 'ADMIN_PROVISION_EXACT_ANCHOR_REQUIRED' USING ERRCODE='55000'; END IF;
   after_body:=replace(after_body,replacement->>'before',replacement->>'after');definition:=replace(definition,replacement->>'before',replacement->>'after');
  END LOOP;
  IF encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256' THEN
   RAISE EXCEPTION 'ADMIN_PROVISION_SUCCESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO STRICT after_body,after_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
  IF before_meta IS DISTINCT FROM after_meta OR encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256' THEN
   RAISE EXCEPTION 'ADMIN_PROVISION_METADATA_CHANGED' USING ERRCODE='55000'; END IF;
 END LOOP;
END $admin_continuation_successor$;
DO $admin_provision_new_metadata$
DECLARE p record; signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['naijue_erp.standard_admin_provision_proof_v1(uuid,text,jsonb,boolean)','naijue_erp.standard_admin_provision_only_v1(jsonb,text)'] LOOP
  SELECT * INTO STRICT p FROM pg_catalog.pg_proc WHERE oid=signature::regprocedure;
  IF p.proowner IS DISTINCT FROM (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp')
   OR p.prosecdef IS DISTINCT FROM true OR p.prorettype IS DISTINCT FROM 'jsonb'::regtype::oid
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp','TimeZone=UTC']
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
     WHERE x.grantee<>p.proowner AND NOT(p.proname='standard_admin_provision_only_v1'
      AND x.grantee='erp_unified27_initializer_2393dbc6db9581c2'::regrole::oid AND x.privilege_type='EXECUTE' AND NOT x.is_grantable))
   OR (p.proname='standard_admin_provision_only_v1' AND NOT has_function_privilege('erp_unified27_initializer_2393dbc6db9581c2',p.oid,'EXECUTE')) THEN
   RAISE EXCEPTION 'ADMIN_PROVISION_NEW_METADATA_OR_ACL_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $admin_provision_new_metadata$;
COMMIT;
