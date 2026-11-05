-- User approved v6 bootstrap provenance envelope, 2026-10-23.
-- Exact26 successor: 26_v8_bootstrap_field_provenance.
-- Original migrations0011/0016/0026 and schema_migration1..26 remain unchanged.
-- One existing function body only; C owns installation and exact target readback.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.assert_native_bootstrap_accounts(selected_batch uuid) RETURNS void
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
    proof:=e.field_provenance->'fields'->'bootstrap_accounts'->'raw';
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
COMMIT;
