-- Approved v14 CORE initialization / one-time full binding. SOURCE ONLY; C installs and verifies actual roles.
-- Based on actual v11; no v12/v13 installation, tables, columns, or old migration edits.
BEGIN;
DO $$
DECLARE rel regclass; col text; name text; old_expression text;
BEGIN
 FOR rel,col,name IN SELECT * FROM (VALUES
 ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),
 ('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,c,n) LOOP
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (((%s) OR (%I=''IMPORT'' AND action IN (''IMPORT_CORE_STAGE'',''IMPORT_BIND_FULL_SOURCE''))) IS TRUE)',rel,name,old_expression,col);
 END LOOP;
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
 ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
 EXECUTE format($c$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE
 WHEN target_type='IMPORT' AND action IN ('IMPORT_CORE_STAGE','IMPORT_BIND_FULL_SOURCE') THEN
  jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','batchId','sequence','cursor','status','ledgerEntryIds','phase','coreSourceDigest','coreCounts']
  AND result_data-ARRAY['operationId','batchId','sequence','cursor','status','ledgerEntryIds','phase','coreSourceDigest','coreCounts']='{}'::jsonb
  AND result_data->>'operationId'=id::text AND result_data->>'batchId'=target_id::text
  AND jsonb_typeof(result_data->'sequence')='number' AND result_data->>'sequence'~'^[1-9][0-9]*$'
  AND jsonb_typeof(result_data->'cursor')='number' AND result_data->>'cursor'~'^[0-9]+$'
  AND result_data->>'status'='STAGED' AND result_data->'ledgerEntryIds'='[]'::jsonb
  AND result_data->>'phase'=CASE action WHEN 'IMPORT_CORE_STAGE' THEN 'CORE_INITIALIZED_V1' ELSE 'FULL_SOURCE_BOUND_V1' END
  AND result_data->>'coreSourceDigest'~'^[a-f0-9]{64}$'
  AND result_data->'coreCounts'='{"STAFF":49,"HALL":22,"WAREHOUSE":22,"CUSTOMER":22,"USER_ACCOUNT":49}'::jsonb
 ELSE (%s) END) IS TRUE)$c$,old_expression);
END $$;


CREATE FUNCTION naijue_erp.assert_core_initialization_v14(selected_batch uuid, selected_operation uuid, creation boolean) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
#variable_conflict use_column
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
 cr naijue_erp.operation_receipt%ROWTYPE; ca naijue_erp.audit_change%ROWTYPE; e naijue_erp.native_party_import_evidence%ROWTYPE;
 birth jsonb; members jsonb; item jsonb; cp jsonb; full_binding jsonb; member jsonb; step jsonb; state jsonb; actual jsonb; field record;
 ma naijue_erp.audit_change%ROWTYPE; mr naijue_erp.operation_receipt%ROWTYPE; before_root jsonb; after_root jsonb; table_name text; n bigint;
 zero_cp jsonb:='{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}';
 core_cp jsonb:='{"sequence":1,"cursor":22,"counts":{"WAREHOUSE":22,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}';
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=selected_operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT cr FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action='IMPORT_CORE_STAGE' AND status='COMMITTED';
 SELECT * INTO STRICT ca FROM naijue_erp.audit_change WHERE operation_id=cr.id;
 birth:=ca.after_values; members:=birth->'coreSourceMembers';
 IF (birth ?& ARRAY['schemaVersion','phase','coreSourceDigest','coreCounts','coreSourceMembers','authority','checkpoint','fullBinding','fullFrozen']
  AND birth-ARRAY['schemaVersion','phase','coreSourceDigest','coreCounts','coreSourceMembers','authority','checkpoint','fullBinding','fullFrozen']='{}'::jsonb
  AND birth->'schemaVersion'='1'::jsonb AND birth->>'phase'='CORE_INITIALIZED_V1' AND birth->>'coreSourceDigest'~'^[a-f0-9]{64}$'
  AND birth->'coreCounts'='{"STAFF":49,"HALL":22,"WAREHOUSE":22,"CUSTOMER":22,"USER_ACCOUNT":49}'::jsonb
  AND birth->'checkpoint'=core_cp AND birth->'fullBinding'='null'::jsonb AND birth->'fullFrozen'='false'::jsonb
  AND jsonb_typeof(members)='object' AND members ?& ARRAY['parties','accounts'] AND members-ARRAY['parties','accounts']='{}'::jsonb
  AND jsonb_typeof(members->'parties')='array' AND jsonb_array_length(members->'parties')=115
  AND jsonb_typeof(members->'accounts')='array' AND jsonb_array_length(members->'accounts')=49
  AND birth->'authority' ?& ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256','target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId']
  AND (birth->'authority')-ARRAY['account_capture_sha256','account_decisions_sha256','identity_review_sha256','bootstrap_execution_review_sha256','source_identity_facts_sha256','approved_employee_plan_sha256','old_source_batch_id','old_source_manifest_sha256','target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId']='{}'::jsonb
  AND birth->'authority'->>'actorAccountId'=cr.actor_account_id::text AND birth->'authority'->>'batchId'=b.id::text
  AND birth->'authority'->>'namespace'=b.source_name AND birth->'authority'->>'selectionSha256'=b.source_hash
  AND birth->'authority'->>'commandHash'=cr.request_hash AND birth->'authority'->>'operationId'=cr.id::text
  AND naijue_erp.maintenance_evidence_matches(birth->'authority'->'cutoffAt',to_jsonb(b.cutoff_at))
  AND naijue_erp.maintenance_evidence_matches(birth->'authority'->'bootstrapAt',to_jsonb(b.created_at))
  AND ca.old_version=1 AND ca.new_version=2 AND ca.before_values=zero_cp
  AND ca.object_type='IMPORT' AND ca.object_id=b.id AND ca.action='IMPORT_CORE_STAGE' AND ca.actor_account_id=cr.actor_account_id
  AND ca.occurred_at=cr.completed_at AND cr.created_at=b.created_at AND cr.completed_at=b.created_at
  AND cr.result_data=jsonb_build_object('operationId',cr.id,'batchId',b.id,'sequence',1,'cursor',22,'status','STAGED','ledgerEntryIds','[]'::jsonb,
   'phase','CORE_INITIALIZED_V1','coreSourceDigest',birth->'coreSourceDigest','coreCounts',birth->'coreCounts')) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact immutable CORE birth/audit/receipt required' USING ERRCODE='23514'; END IF;
 IF (SELECT count(DISTINCT x->>'sourceRowId') FROM jsonb_array_elements(members->'parties') x)<>115
  OR (SELECT count(DISTINCT x->>'nativeId') FROM jsonb_array_elements(members->'parties') x)<>115
  OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(members->'accounts') x)<>49
  OR (SELECT count(DISTINCT x->>'staff_id') FROM jsonb_array_elements(members->'accounts') x)<>49 THEN
  RAISE EXCEPTION 'CORE members must retain distinct source/native identities' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(members->'parties') LOOP
  IF (jsonb_typeof(item)='object' AND item ?& ARRAY['sourceRowId','entity','sourceKey','nativeId']
    AND item-ARRAY['sourceRowId','entity','sourceKey','nativeId']='{}'::jsonb AND item->>'entity' IN('STAFF','HALL','WAREHOUSE','CUSTOMER')) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Exact CORE party member tuple required' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT e FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id AND source_row_id=(item->>'sourceRowId')::uuid
   AND entity_type=item->>'entity' AND source_key=item->>'sourceKey' AND native_id=(item->>'nativeId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.id=e.source_row_id AND s.batch_id=e.batch_id
   AND to_jsonb(s)=to_jsonb(jsonb_populate_record(NULL::naijue_erp.import_source_row,e.source_snapshot))) THEN
   RAISE EXCEPTION 'CORE immutable source differs from birth evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['STAFF','HALL','WAREHOUSE','CUSTOMER'] LOOP
  SELECT count(*) INTO n FROM jsonb_array_elements(members->'parties') x WHERE x->>'entity'=table_name;
  IF n<>(birth->'coreCounts'->>table_name)::bigint THEN RAISE EXCEPTION 'CORE exact entity member counts required' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(members->'accounts') LOOP
  IF (item ?& ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']
   AND item-ARRAY['id','staff_id','login_enabled','auth_version','version','created_at','updated_at']='{}'::jsonb
   AND item->'version'='1'::jsonb AND item->'auth_version'='1'::jsonb
   AND EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s ON s.id=e.source_row_id
    WHERE e.batch_id=b.id AND e.entity_type='STAFF' AND e.native_id=(item->>'staff_id')::uuid
    AND s.field_provenance->'fields'->'bootstrap_accounts'->'raw'->'accounts'->0->'native_snapshot'=item)
   AND EXISTS(SELECT 1 FROM naijue_erp.user_account u WHERE u.id=(item->>'id')::uuid AND u.staff_id=(item->>'staff_id')::uuid)) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'CORE retains original safe account birth proof and live identity only' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM naijue_erp.import_record_accounting_claim WHERE operation_id=cr.id)<>22
  OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c LEFT JOIN naijue_erp.import_record rec ON rec.id=c.import_record_id
   LEFT JOIN naijue_erp.native_party_import_evidence e ON e.batch_id=c.import_batch_id AND e.entity_type='WAREHOUSE' AND e.native_id=c.target_id
   WHERE c.operation_id=cr.id AND (c.import_batch_id<>b.id OR c.target_type<>'WAREHOUSE' OR c.checkpoint_sequence<>1 OR c.claimed_at<>b.created_at
    OR rec.import_batch_id IS DISTINCT FROM b.id OR rec.target_type IS DISTINCT FROM 'WAREHOUSE' OR rec.target_id IS DISTINCT FROM c.target_id
    OR rec.status IS DISTINCT FROM 'IMPORTED' OR rec.source_entity_type IS DISTINCT FROM 'WAREHOUSE'
    OR rec.source_key IS DISTINCT FROM e.source_key OR rec.source_record_hash IS DISTINCT FROM e.source_snapshot->>'row_sha256'
    OR rec.source_file_ref IS DISTINCT FROM e.source_snapshot->>'file_ref'
    OR e.warehouse_record IS DISTINCT FROM jsonb_build_object('id',rec.id,'reviewedAt',e.warehouse_record->'reviewedAt','decisionReason',rec.decision_reason)
    OR rec.reviewed_at IS DISTINCT FROM (e.warehouse_record->>'reviewedAt')::timestamptz
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(members->'parties') x WHERE x->>'entity'='WAREHOUSE' AND x->>'nativeId'=c.target_id::text))) THEN
  RAISE EXCEPTION 'CORE must retain its22 exact original warehouse claims and creator records' USING ERRCODE='23514'; END IF;
 IF creation THEN
  IF r.id<>cr.id OR b.status<>'STAGED' OR b.checkpoint<>core_cp OR b.history_payload_hash IS NOT NULL OR b.history_expected_counts IS NOT NULL
   OR b.history_actual_counts IS NOT NULL OR b.history_validation_passed OR b.completed_at IS NOT NULL
   OR b.xmin::text::bigint<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
   OR (SELECT count(*) FROM naijue_erp.import_batch)<>1
   OR (SELECT count(*) FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id)<>115
   OR (SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=b.id)<>115
   OR (SELECT count(*) FROM naijue_erp.import_header_native_reference WHERE batch_id=b.id)<>93
   OR (SELECT count(*) FROM naijue_erp.import_record WHERE import_batch_id=b.id)<>22 THEN
   RAISE EXCEPTION 'First CORE must commit its exact fresh11549 and22 record scope only' USING ERRCODE='23514'; END IF;
  PERFORM naijue_erp.assert_native_bootstrap_accounts(b.id);
  RETURN;
 END IF;
 -- Binding/current typed closure verifies historical birth without rerunning fresh/no-session bootstrap.
 IF r.target_type<>'IMPORT' OR r.target_id<>b.id OR r.action<>'IMPORT_BIND_FULL_SOURCE' OR r.status<>'COMMITTED'
  OR a.action<>r.action OR a.object_type<>'IMPORT' OR a.object_id<>b.id OR a.actor_account_id<>r.actor_account_id
  OR a.occurred_at<>r.completed_at OR a.new_version<>a.old_version+1
  OR a.after_values->>'phase'<>'FULL_SOURCE_BOUND_V1' OR a.after_values->'fullFrozen'<>'true'::jsonb
  OR a.after_values->>'coreReceiptId'<>cr.id::text OR a.after_values->>'coreSourceDigest'<>birth->>'coreSourceDigest'
  OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=b.id AND action='IMPORT_BIND_FULL_SOURCE')<>1 THEN
  RAISE EXCEPTION 'Exactly one original full binding operation required' USING ERRCODE='23514'; END IF;
 full_binding:=a.after_values->'fullBinding'; cp:=a.after_values->'checkpoint';
 IF (a.after_values ?& ARRAY['schemaVersion','phase','coreSourceDigest','coreReceiptId','checkpoint','fullBinding','fullFrozen']
  AND a.after_values-ARRAY['schemaVersion','phase','coreSourceDigest','coreReceiptId','checkpoint','fullBinding','fullFrozen']='{}'::jsonb
  AND a.after_values->'schemaVersion'='1'::jsonb AND a.after_values->>'phase'='FULL_SOURCE_BOUND_V1' AND a.after_values->'fullFrozen'='true'::jsonb
  AND full_binding ?& ARRAY['authorizedPayloadHash','historyExpectedCounts','inventoryExpectedCounts','sourceClosurePins','coreReceiptId','coreSourceDigest','coreMaintenanceBinding']
  AND full_binding-ARRAY['authorizedPayloadHash','historyExpectedCounts','inventoryExpectedCounts','sourceClosurePins','coreReceiptId','coreSourceDigest','coreMaintenanceBinding']='{}'::jsonb
  AND full_binding->>'coreReceiptId'=cr.id::text AND full_binding->>'coreSourceDigest'=birth->>'coreSourceDigest'
  AND full_binding->>'authorizedPayloadHash'=b.history_payload_hash AND full_binding->'historyExpectedCounts'=b.history_expected_counts
  AND full_binding->'inventoryExpectedCounts'=b.checkpoint->'expected' AND cp->'expected'=b.checkpoint->'expected'
  AND cp->>'sequence'=a.old_version::text AND a.new_version=(cp->>'sequence')::integer+1
  AND a.before_values=jsonb_build_object('checkpoint',jsonb_set(cp,'{sequence}',to_jsonb((cp->>'sequence')::integer-1))||jsonb_build_object('expected','{}'::jsonb),
   'fullBinding',NULL,'fullFrozen',false,'coreReceiptId',cr.id,'coreSourceDigest',birth->'coreSourceDigest')
  AND r.result_data=jsonb_build_object('operationId',r.id,'batchId',b.id,'sequence',cp->'sequence','cursor',cp->'cursor','status','STAGED','ledgerEntryIds','[]'::jsonb,
   'phase','FULL_SOURCE_BOUND_V1','coreSourceDigest',birth->'coreSourceDigest','coreCounts',birth->'coreCounts')
  AND jsonb_typeof(full_binding->'sourceClosurePins')='array' AND jsonb_array_length(full_binding->'sourceClosurePins')=11
  AND (SELECT count(DISTINCT x->>'group') FROM jsonb_array_elements(full_binding->'sourceClosurePins') x)=11
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(full_binding->'sourceClosurePins') x WHERE
   (x ?& ARRAY['group','sha256'] AND x-ARRAY['group','sha256']='{}'::jsonb AND length(x->>'group')>0 AND x->>'sha256'~'^[a-f0-9]{64}$') IS DISTINCT FROM TRUE)
  AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id)) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Full binding must preserve progress and freeze genuine complete metadata once' USING ERRCODE='23514'; END IF;

 IF r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint THEN
  IF b.status<>'STAGED' OR b.completed_at IS NOT NULL OR b.history_validation_passed OR b.history_actual_counts IS NOT NULL
   OR b.checkpoint IS DISTINCT FROM cp
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
     WHERE u.id=r.actor_account_id AND u.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) THEN
   RAISE EXCEPTION 'Binding requires current real ADMIN and exact unbound unpublished state' USING ERRCODE='23514'; END IF;
  FOREACH table_name IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line',
    'sales_header','sales_line','sales_settlement','transfer_header','transfer_line','product','sku','sku_barcode','barcode_scheme','product_image',
    'import_sku_alias','import_stock_contributor','inventory_ledger','inventory_balance','import_history_closure_manifest','import_history_document_manifest',
    'payment_method','payment_account','payment_account_hall','history_revision'] LOOP
   EXECUTE format('SELECT count(*) FROM naijue_erp.%I',table_name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Full binding refuses preexisting out-of-scope business effect in %',table_name USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=b.id AND target_type<>'WAREHOUSE')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id AND target_type<>'WAREHOUSE') THEN
   RAISE EXCEPTION 'Only separately granted exact warehouse accounting may precede binding' USING ERRCODE='23514'; END IF;
 END IF;
 -- Exact current master versions: reconstruct each sparse authorized audit link from immutable source birth.
 IF (full_binding->'coreMaintenanceBinding' ?& ARRAY['version','members']
  AND (full_binding->'coreMaintenanceBinding')-ARRAY['version','members']='{}'::jsonb
  AND full_binding->'coreMaintenanceBinding'->>'version'='CORE_MAINTENANCE_BINDING_V1'
  AND jsonb_typeof(full_binding->'coreMaintenanceBinding'->'members')='array'
  AND jsonb_array_length(full_binding->'coreMaintenanceBinding'->'members')=115
  AND (SELECT count(DISTINCT x->>'sourceRowId') FROM jsonb_array_elements(full_binding->'coreMaintenanceBinding'->'members') x)=115) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Exact115 current core maintenance projections required' USING ERRCODE='23514'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(full_binding->'coreMaintenanceBinding'->'members') LOOP
  IF (member ?& ARRAY['sourceRowId','entity','sourceKey','nativeId','version','nativeSnapshot','operations']
   AND member-ARRAY['sourceRowId','entity','sourceKey','nativeId','version','nativeSnapshot','operations']='{}'::jsonb
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(members->'parties') x WHERE x=member-ARRAY['version','nativeSnapshot','operations'])
   AND jsonb_typeof(member->'operations')='array') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Maintenance member not original CORE identity' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT e FROM naijue_erp.native_party_import_evidence WHERE batch_id=b.id AND source_row_id=(member->>'sourceRowId')::uuid;
  state:=e.native_snapshot;
  FOR step IN SELECT value FROM jsonb_array_elements(member->'operations') LOOP
   SELECT * INTO STRICT ma FROM naijue_erp.audit_change WHERE operation_id=(step->>'operationId')::uuid;
   SELECT * INTO STRICT mr FROM naijue_erp.operation_receipt WHERE id=ma.operation_id;
   IF (step ?& ARRAY['operationId','fromVersion','toVersion'] AND step-ARRAY['operationId','fromVersion','toVersion']='{}'::jsonb
    AND ma.object_type=e.entity_type AND ma.object_id=e.native_id AND mr.target_type=ma.object_type AND mr.target_id=ma.object_id
    AND mr.action=ma.action AND mr.actor_account_id=ma.actor_account_id AND mr.status='COMMITTED' AND mr.completed_at=ma.occurred_at
    AND ma.old_version=(state->>'version')::integer AND ma.new_version=ma.old_version+1
    AND step->>'fromVersion'=ma.old_version::text AND step->>'toVersion'=ma.new_version::text
    AND mr.result_data->>'operationId'=ma.operation_id::text
    AND coalesce(mr.result_data->>'targetId',mr.result_data->>'customerId')=ma.object_id::text
    AND mr.result_data->>'version'=ma.new_version::text
    AND ma.occurred_at>=cr.completed_at AND ma.occurred_at<=r.completed_at) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Exact authorized master maintenance version chain required' USING ERRCODE='23514'; END IF;
   before_root:=ma.before_values-ARRAY['accounts','account_credentials']; after_root:=ma.after_values-ARRAY['accounts','account_credentials'];
   FOR field IN SELECT * FROM jsonb_each(before_root) LOOP
    IF NOT state ? field.key OR NOT naijue_erp.maintenance_evidence_matches(field.value,state->field.key) THEN
     RAISE EXCEPTION 'Maintenance before chain differs from original source birth/current link' USING ERRCODE='23514'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(after_root) x(k) WHERE NOT state ? k) THEN RAISE EXCEPTION 'Invented master fields forbidden' USING ERRCODE='23514'; END IF;
   IF NOT (before_root ? 'version') OR NOT (after_root ? 'version') THEN RAISE EXCEPTION 'Maintenance versions must be explicitly evidenced' USING ERRCODE='23514'; END IF;
   state:=state||after_root;
   IF state->>'version'<>ma.new_version::text THEN RAISE EXCEPTION 'Maintenance version link missing' USING ERRCODE='23514'; END IF;
  END LOOP;
  table_name:=CASE e.entity_type WHEN 'HALL' THEN 'hall' WHEN 'WAREHOUSE' THEN 'warehouse' WHEN 'STAFF' THEN 'staff' WHEN 'CUSTOMER' THEN 'customer' END;
  EXECUTE format('SELECT to_jsonb(n) FROM naijue_erp.%I n WHERE id=$1 FOR SHARE',table_name) INTO STRICT actual USING e.native_id;
  IF NOT naijue_erp.maintenance_complete_row_matches(state,actual) OR NOT naijue_erp.maintenance_complete_row_matches(member->'nativeSnapshot',actual)
   OR member->>'version'<>actual->>'version' THEN RAISE EXCEPTION 'Current typed CORE projection changed outside frozen maintenance chain' USING ERRCODE='23514'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean) FROM PUBLIC;


CREATE OR REPLACE FUNCTION naijue_erp.assert_native_bootstrap_accounts(selected_batch uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE core_mode boolean; core_a jsonb; b naijue_erp.import_batch%ROWTYPE; e record; proof jsonb; item jsonb; snapshot jsonb;
  common_binding jsonb; common_authority jsonb; binding jsonb; authority jsonb; field record;
  actual jsonb; fresh boolean; r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE;
  accounts uuid[]:=ARRAY[]::uuid[]; staff_ids uuid[]:=ARRAY[]::uuid[]; source_accounts text[]:=ARRAY[]::text[];
  direct_count integer:=0; plan_count integer:=0; seen integer:=0; xid_value bigint:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
  SELECT birth_audit.after_values INTO core_a FROM naijue_erp.operation_receipt birth_receipt JOIN naijue_erp.audit_change birth_audit ON birth_audit.operation_id=birth_receipt.id
    WHERE birth_receipt.target_type='IMPORT' AND birth_receipt.target_id=b.id AND birth_receipt.action='IMPORT_CORE_STAGE';
  core_mode:=core_a IS NOT NULL;
  IF b.status<>'STAGED' OR b.mapping_version<>'V2_HISTORY_NULLABLE_1'
    OR b.checkpoint->'sequence'<>(CASE WHEN core_mode THEN '1'::jsonb ELSE '0'::jsonb END) OR b.checkpoint->'cursor'<>(CASE WHEN core_mode THEN '22'::jsonb ELSE '0'::jsonb END)
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
    IF core_mode AND (binding->>'authorized_payload_sha256' IS DISTINCT FROM core_a->>'coreSourceDigest'
      OR authority IS DISTINCT FROM (core_a->'authority')-ARRAY['target','actorAccountId','batchId','namespace','selectionSha256','cutoffAt','bootstrapAt','commandHash','operationId']
      OR binding->>'stage_command_sha256' IS DISTINCT FROM core_a->'authority'->>'commandHash'
      OR binding->>'operation_id' IS DISTINCT FROM core_a->'authority'->>'operationId'
      OR binding->>'actor_account_id' IS DISTINCT FROM core_a->'authority'->>'actorAccountId') THEN
      RAISE EXCEPTION 'CORE proof must bind original exact CORE digest/authority/command operation' USING ERRCODE='23514'; END IF;
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
    OR r.action<>(CASE WHEN core_mode THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_STAGE' END) OR r.target_type<>'IMPORT' OR r.target_id<>selected_batch OR r.status<>'COMMITTED'
    OR r.created_at IS DISTINCT FROM b.created_at OR r.completed_at IS DISTINCT FROM b.created_at
    OR r.result_data IS DISTINCT FROM jsonb_build_object('operationId',r.id,'batchId',selected_batch,'sequence',CASE WHEN core_mode THEN 1 ELSE 0 END,'cursor',CASE WHEN core_mode THEN 22 ELSE 0 END,'status','STAGED','ledgerEntryIds','[]'::jsonb)||(CASE WHEN core_mode THEN jsonb_build_object('phase','CORE_INITIALIZED_V1','coreSourceDigest',core_a->'coreSourceDigest','coreCounts',core_a->'coreCounts') ELSE '{}'::jsonb END)
    OR a.object_type<>'IMPORT' OR a.object_id<>selected_batch OR a.action<>(CASE WHEN core_mode THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_STAGE' END) OR a.actor_account_id<>r.actor_account_id
    OR (CASE WHEN core_mode THEN a.old_version IS DISTINCT FROM 1 OR a.new_version<>2 OR a.before_values IS DISTINCT FROM '{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb ELSE a.old_version IS NOT NULL OR a.new_version<>1 OR a.before_values IS NOT NULL END)
    OR (CASE WHEN core_mode THEN a.after_values->'checkpoint' ELSE a.after_values END) IS DISTINCT FROM b.checkpoint OR a.occurred_at IS DISTINCT FROM b.created_at
    OR (b.checkpoint ?& ARRAY['sequence','cursor','counts','expected'] AND b.checkpoint-ARRAY['sequence','cursor','counts','expected']='{}'::jsonb
      AND b.checkpoint->'counts'=CASE WHEN core_mode THEN '{"WAREHOUSE":22,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb ELSE '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb END) IS DISTINCT FROM TRUE
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_batch() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_publication() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN
  -- Legacy published batches remain valid. No alternative mapping can carry this data.
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' THEN
    IF NEW.history_expected_counts IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_payload_hash IS NOT NULL OR NEW.history_validation_passed THEN
      RAISE EXCEPTION 'history metadata requires the explicit v2 mapping' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF NEW.history_expected_counts IS NULL AND NEW.history_payload_hash IS NULL THEN
    IF NEW.status<>'STAGED' OR NEW.completed_at IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed
      OR NEW.checkpoint->'expected'<>'{}'::jsonb THEN RAISE EXCEPTION 'Only closed unbound CORE structure may omit future full metadata' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.history_expected_counts IS NULL AND OLD.history_payload_hash IS NULL THEN
    IF NEW.status<>'STAGED' OR NEW.completed_at IS NOT NULL OR NEW.history_actual_counts IS NOT NULL OR NEW.history_validation_passed
      OR NOT naijue_erp.valid_history_counts(NEW.history_expected_counts) OR NEW.history_payload_hash !~ '^[a-f0-9]{64}$'
      OR NEW.checkpoint->'counts' IS DISTINCT FROM OLD.checkpoint->'counts' OR NEW.checkpoint->'cursor' IS DISTINCT FROM OLD.checkpoint->'cursor' THEN
      RAISE EXCEPTION 'Full binding changes only one real metadata/expected/sequence transition' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.history_expected_counts IS NULL OR NEW.history_payload_hash IS NULL THEN
    RAISE EXCEPTION 'v2 requires frozen expected counts and exact payload hash at staging' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.history_expected_counts IS DISTINCT FROM OLD.history_expected_counts
    OR NEW.history_payload_hash IS DISTINCT FROM OLD.history_payload_hash) THEN
    RAISE EXCEPTION 'historical input identity cannot change on retry' USING ERRCODE = '23514'; END IF;
  IF NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  IF NOT NEW.history_validation_passed OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts THEN
    RAISE EXCEPTION 'historical validation and exact counts required for atomic publication' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor'] LOOP
    EXECUTE format('SELECT count(*) FROM naijue_erp.%I WHERE batch_id = $1', kind) INTO actual USING NEW.id;
    IF actual::numeric <> (NEW.history_expected_counts->>kind)::numeric THEN
      RAISE EXCEPTION 'historical table count mismatch: %', kind USING ERRCODE = '23514'; END IF;
  END LOOP;
  PERFORM naijue_erp.validate_history_product_proofs(NEW.id);
  -- Only imported SKU bindings; no PRODUCT carrier or native barcode schema change.
  SELECT count(*) INTO actual FROM naijue_erp.import_source_row s
    JOIN naijue_erp.sku_barcode bc ON bc.barcode = s.field_provenance->>'native_barcode'
      AND bc.sku_id::text = s.field_provenance->>'native_sku_id'
    WHERE s.batch_id = NEW.id AND s.entity_type = 'BARCODE';
  IF actual::numeric <> (NEW.history_expected_counts->>'barcodes')::numeric
    OR actual <> (SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id = NEW.id AND entity_type = 'BARCODE') THEN
    RAISE EXCEPTION 'SKU barcode evidence does not reconcile' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id = NEW.id AND business_date IS NULL)
    OR EXISTS (SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id = NEW.id AND business_date IS NULL) THEN
    RAISE EXCEPTION 'unresolved business dates cannot publish' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id = NEW.id AND NOT EXISTS (
    SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = a.batch_id AND r.target_type = 'SKU'
      AND r.status = 'IMPORTED' AND r.target_id = a.canonical_sku_id AND r.source_key = a.canonical_source_key)) THEN
    RAISE EXCEPTION 'alias canonical source does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c JOIN naijue_erp.import_source_row s ON s.id = c.source_row_id
    WHERE c.batch_id = NEW.id AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
      AND r.target_type = 'WAREHOUSE' AND r.status = 'IMPORTED' AND r.target_id = c.warehouse_id
      AND r.source_key = s.field_provenance->'stock_contribution'->>'warehouseSourceId')) THEN
    RAISE EXCEPTION 'contributor source warehouse does not match native imported scope' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor c LEFT JOIN naijue_erp.inventory_ledger l ON l.id = c.baseline_ledger_id
    WHERE c.batch_id = NEW.id AND (l.id IS NULL OR l.event_kind <> 'CUTOFF_BASELINE' OR l.source_import_batch_id <> c.batch_id
      OR l.warehouse_id <> c.warehouse_id OR l.sku_id <> c.canonical_sku_id
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id = c.batch_id
        AND r.target_type = 'INVENTORY_LEDGER' AND r.status = 'IMPORTED' AND r.target_id = c.baseline_ledger_id
        AND r.source_key = c.canonical_stock_source_key))) THEN
    RAISE EXCEPTION 'stock contributor must bind its exact baseline' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.import_stock_contributor WHERE batch_id = NEW.id
    GROUP BY warehouse_id, canonical_sku_id HAVING count(DISTINCT source_unit) <> 1 OR bool_or(length(btrim(source_unit)) = 0)) THEN
    RAISE EXCEPTION 'incompatible or unknown stock units require explicit resolution' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN (
      SELECT baseline_ledger_id, sum(signed_quantity::numeric) total FROM naijue_erp.import_stock_contributor
      WHERE batch_id = NEW.id GROUP BY baseline_ledger_id) c ON c.baseline_ledger_id = l.id
    WHERE l.source_import_batch_id = NEW.id AND (c.total IS NULL OR c.total <> l.quantity_delta)) THEN
    RAISE EXCEPTION 'stock contribution sums differ from cutoff baseline' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_batch_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; processed numeric; counted numeric := 0;
BEGIN
  IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND (NEW.history_payload_hash IS NULL OR (TG_OP='UPDATE' AND OLD.history_payload_hash IS NULL)) THEN
    SELECT core_receipt.id INTO STRICT core_operation FROM naijue_erp.operation_receipt core_receipt WHERE core_receipt.target_type='IMPORT' AND core_receipt.target_id=NEW.id
      AND core_receipt.action=CASE WHEN NEW.history_payload_hash IS NULL THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_BIND_FULL_SOURCE' END;
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.id,core_operation,NEW.history_payload_hash IS NULL);
    IF NEW.history_payload_hash IS NULL THEN
      IF TG_OP='INSERT' THEN
        IF NEW.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
          OR NEW.status<>'STAGED' OR NEW.created_at IS DISTINCT FROM (SELECT created_at FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
          RAISE EXCEPTION 'CORE initial deferred INSERT must retain actual zero image' USING ERRCODE='23514'; END IF;
      ELSIF OLD.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
        OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'CORE deferred UPDATE must be its one actual zero-to22 transition' USING ERRCODE='23514'; END IF;
    ELSE
      IF TG_OP<>'UPDATE' OR OLD.checkpoint->'expected'<>'{}'::jsonb OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'Full binding must be the exact once-only current checkpoint transition' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type = 'IMPORT' AND object_id = NEW.id
    AND new_version = ((NEW.checkpoint->>'sequence')::bigint + 1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = a.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id <> NEW.id OR a.after_values IS DISTINCT FROM NEW.checkpoint
    OR (SELECT checkpoint FROM naijue_erp.import_batch WHERE id = NEW.id) IS DISTINCT FROM NEW.checkpoint THEN
    RAISE EXCEPTION 'one atomic native import checkpoint audit and receipt are required' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action <> 'IMPORT_STAGE' THEN
      RAISE EXCEPTION 'stage requires initial import evidence' USING ERRCODE = '23514'; END IF;
  ELSIF a.old_version::bigint IS DISTINCT FROM (OLD.checkpoint->>'sequence')::bigint + 1 OR a.before_values IS DISTINCT FROM OLD.checkpoint THEN
    RAISE EXCEPTION 'checkpoint before evidence differs from replaced progress' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'counts')) <> 4
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.checkpoint->'expected')) <> 4 THEN
    RAISE EXCEPTION 'only the four approved target counters are accepted' USING ERRCODE = '23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE', 'SKU', 'INVENTORY_LEDGER', 'IMPORT_BATCH'] LOOP
    IF ((NEW.checkpoint->'counts'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE
      OR ((NEW.checkpoint->'expected'->>kind) ~ '^[0-9]+$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'missing exact import counters' USING ERRCODE = '23514'; END IF;
    -- Constant-sized metadata check only. Successful bounded INSERT results advance
    -- counts in the application transaction; the one full source reconciliation is publication.
    processed := (NEW.checkpoint->'counts'->>kind)::numeric;
    IF processed > (NEW.checkpoint->'expected'->>kind)::numeric
      OR (TG_OP = 'UPDATE' AND processed < (OLD.checkpoint->'counts'->>kind)::numeric) THEN
      RAISE EXCEPTION 'invalid monotonic bounded source progress' USING ERRCODE = '23514'; END IF;
    counted := counted + processed;
  END LOOP;
  IF counted <> (NEW.checkpoint->>'cursor')::numeric THEN RAISE EXCEPTION 'checkpoint cursor must match its bounded progress counters' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_accounting_checkpoint_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE core_operation uuid; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE; kind text; actual bigint; total bigint;
BEGIN
  IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND (NEW.history_payload_hash IS NULL OR (TG_OP='UPDATE' AND OLD.history_payload_hash IS NULL)) THEN
    SELECT core_receipt.id INTO STRICT core_operation FROM naijue_erp.operation_receipt core_receipt WHERE core_receipt.target_type='IMPORT' AND core_receipt.target_id=NEW.id
      AND core_receipt.action=CASE WHEN NEW.history_payload_hash IS NULL THEN 'IMPORT_CORE_STAGE' ELSE 'IMPORT_BIND_FULL_SOURCE' END;
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.id,core_operation,NEW.history_payload_hash IS NULL);
    IF NEW.history_payload_hash IS NULL THEN
      IF TG_OP='INSERT' THEN
        IF NEW.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
          OR NEW.status<>'STAGED' OR NEW.created_at IS DISTINCT FROM (SELECT created_at FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
          RAISE EXCEPTION 'CORE initial deferred INSERT must retain actual zero image' USING ERRCODE='23514'; END IF;
      ELSIF OLD.checkpoint<>'{"sequence":0,"cursor":0,"counts":{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0},"expected":{}}'::jsonb
        OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'CORE deferred UPDATE must be its one actual zero-to22 transition' USING ERRCODE='23514'; END IF;
    ELSE
      IF TG_OP<>'UPDATE' OR OLD.checkpoint->'expected'<>'{}'::jsonb OR NEW.checkpoint IS DISTINCT FROM (SELECT checkpoint FROM naijue_erp.import_batch WHERE id=NEW.id) THEN
        RAISE EXCEPTION 'Full binding must be the exact once-only current checkpoint transition' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' THEN RETURN NULL; END IF;
  IF jsonb_typeof(NEW.checkpoint->'sequence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(NEW.checkpoint->'cursor') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'V2 checkpoint sequence and cursor must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    IF jsonb_typeof(NEW.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
      OR jsonb_typeof(NEW.checkpoint->'expected'->kind) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'V2 native counters must retain JSON integer number types' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF TG_OP='INSERT' THEN
    IF NEW.checkpoint->>'sequence'<>'0' OR NEW.checkpoint->>'cursor'<>'0'
      OR NEW.checkpoint->'counts' IS DISTINCT FROM '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb
      OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id) THEN
      RAISE EXCEPTION 'V2 accounting must stage at the original unclaimed zero checkpoint' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=NEW.id
    AND new_version=((NEW.checkpoint->>'sequence')::bigint+1)::integer;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
  SELECT count(*) INTO total FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id;
  IF (r.action='IMPORT_CHUNK' AND (total<1 OR total>500)) OR (r.action='IMPORT_PUBLISH' AND total<>1)
    OR r.action NOT IN ('IMPORT_CHUNK','IMPORT_PUBLISH')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.operation_id=r.id
      AND (c.import_batch_id<>NEW.id OR c.checkpoint_sequence::bigint<>(NEW.checkpoint->>'sequence')::bigint))
    OR (NEW.checkpoint->>'cursor')::bigint-(OLD.checkpoint->>'cursor')::bigint<>total THEN
    RAISE EXCEPTION 'checkpoint cursor and original action require the exact bounded new claim set' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type=kind;
    IF (NEW.checkpoint->'counts'->>kind)::bigint-(OLD.checkpoint->'counts'->>kind)::bigint<>actual THEN
      RAISE EXCEPTION 'checkpoint target delta differs from its original receipt-owned new claims' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (r.action='IMPORT_CHUNK' AND EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH'))
    OR (r.action='IMPORT_PUBLISH' AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE operation_id=r.id AND target_type='IMPORT_BATCH')) THEN
    RAISE EXCEPTION 'final approval is accounted once only by original PUBLISH' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_operation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual_ids jsonb; receipt_ids jsonb;
BEGIN
  IF NEW.action IN('IMPORT_CORE_STAGE','IMPORT_BIND_FULL_SOURCE') THEN
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.target_id,NEW.id,NEW.action='IMPORT_CORE_STAGE');
    IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id=NEW.id) THEN RAISE EXCEPTION 'CORE/binding has no ledger effect' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(id::text ORDER BY id), '[]'::jsonb) INTO actual_ids FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id;
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) INTO receipt_ids FROM jsonb_array_elements_text(NEW.result_data->'ledgerEntryIds');
  IF actual_ids IS DISTINCT FROM receipt_ids THEN RAISE EXCEPTION 'import receipt requires exact bounded baseline effect set' USING ERRCODE = '23514'; END IF;
  IF a.object_type <> 'IMPORT' OR a.object_id <> b.id OR a.action <> NEW.action
    OR a.actor_account_id <> NEW.actor_account_id OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR a.after_values IS DISTINCT FROM b.checkpoint OR a.new_version::bigint <> (b.checkpoint->>'sequence')::bigint + 1
    OR NEW.result_data->>'sequence' IS DISTINCT FROM b.checkpoint->>'sequence'
    OR NEW.result_data->>'cursor' IS DISTINCT FROM b.checkpoint->>'cursor' OR NEW.result_data->>'status' IS DISTINCT FROM b.status
    OR (NEW.action = 'IMPORT_STAGE' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR b.status <> 'STAGED'))
    OR (NEW.action = 'IMPORT_CHUNK' AND b.status <> 'VALIDATING') OR (NEW.action = 'IMPORT_PUBLISH' AND b.status <> 'IMPORTED')
    OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id AND (event_kind <> 'CUTOFF_BASELINE' OR source_import_batch_id IS DISTINCT FROM b.id))
    OR (NEW.action <> 'IMPORT_CHUNK' AND EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE operation_id = NEW.id)) THEN
    RAISE EXCEPTION 'import receipt audit checkpoint or exact baseline operation differs' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_accounting_claim() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; r naijue_erp.import_record%ROWTYPE; native_row jsonb;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id FOR UPDATE;
  IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED','VALIDATING')
    OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
    RAISE EXCEPTION 'native accounting requires the original open unpublished V2 scope' USING ERRCODE='23514'; END IF;
  IF b.history_payload_hash IS NULL AND (NEW.target_type<>'WAREHOUSE' OR NEW.checkpoint_sequence<>1 OR b.checkpoint->>'sequence'<>'0') THEN
    RAISE EXCEPTION 'Unbound CORE claims only22 fresh warehouses at original next sequence1' USING ERRCODE='23514'; END IF;
  -- Induction starts ONLY at the real original zero checkpoint. Never adopt/backfill old nonzero counters.
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=b.id)
    AND (b.checkpoint->>'sequence'<>'0' OR b.checkpoint->>'cursor'<>'0'
      OR b.checkpoint->'counts' IS DISTINCT FROM '{"WAREHOUSE":0,"SKU":0,"INVENTORY_LEDGER":0,"IMPORT_BATCH":0}'::jsonb) THEN
    RAISE EXCEPTION 'nonzero checkpoint without accounting provenance requires separately authorized recovery' USING ERRCODE='23514'; END IF;
  IF NEW.checkpoint_sequence::bigint<>(b.checkpoint->>'sequence')::bigint+1
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record_accounting_claim c WHERE c.import_batch_id=b.id
      AND c.checkpoint_sequence=NEW.checkpoint_sequence AND c.operation_id<>NEW.operation_id) THEN
    RAISE EXCEPTION 'one next original receipt must own this checkpoint sequence' USING ERRCODE='23514'; END IF;
  -- Primary native identities are locked before immutable source/evidence rows.
  IF NEW.target_type='WAREHOUSE' THEN
    SELECT to_jsonb(w) INTO STRICT native_row FROM naijue_erp.warehouse w WHERE id=NEW.target_id FOR SHARE;
  ELSIF NEW.target_type='SKU' THEN
    SELECT to_jsonb(k) INTO STRICT native_row FROM naijue_erp.sku k WHERE id=NEW.target_id FOR SHARE;
  END IF;
  SELECT * INTO STRICT r FROM naijue_erp.import_record WHERE id=NEW.import_record_id AND import_batch_id=b.id FOR SHARE;
  PERFORM naijue_erp.import_source_key_lock(b.source_name,r.source_entity_type,r.source_key);
  IF r.status<>'IMPORTED' OR r.target_type IS DISTINCT FROM NEW.target_type OR r.target_id IS DISTINCT FROM NEW.target_id THEN
    RAISE EXCEPTION 'claim must consume its exact immutable imported target record' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='WAREHOUSE' AND (r.source_entity_type<>'WAREHOUSE' OR NOT EXISTS(
    SELECT 1 FROM naijue_erp.native_party_import_evidence e JOIN naijue_erp.import_source_row s
      ON s.batch_id=e.batch_id AND s.id=e.source_row_id
    WHERE e.batch_id=b.id AND e.entity_type='WAREHOUSE' AND e.source_key=r.source_key AND e.native_id=r.target_id
      AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND e.native_snapshot=native_row
      AND e.warehouse_record->>'id'=r.id::text AND e.warehouse_record->>'decisionReason'=r.decision_reason
      AND (e.warehouse_record->>'reviewedAt')::timestamptz=r.reviewed_at
      AND s.entity_type='WAREHOUSE' AND s.source_key=r.source_key AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref
      AND s.normalized_fields->>'切换范围'='本次完整核准')) THEN
    RAISE EXCEPTION 'warehouse claim lacks exact source and native creator evidence' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='SKU' AND (r.source_entity_type<>'SKU' OR NOT EXISTS(
    SELECT 1 FROM naijue_erp.import_source_row s JOIN naijue_erp.import_sku_alias a
      ON a.batch_id=s.batch_id AND a.source_row_id=s.id AND a.old_source_sku_id=s.source_key
    WHERE s.batch_id=b.id AND s.entity_type='SKU' AND s.source_key=r.source_key
      AND s.row_sha256=r.source_record_hash AND s.file_ref=r.source_file_ref
      AND a.canonical_source_key=r.source_key AND a.canonical_sku_id=r.target_id
      AND s.field_provenance->'native_sku_import'->>'validator_version'='NATIVE_SKU_IMPORT_V1'
      AND s.field_provenance->'native_sku_import'->>'canonical_source_key'=r.source_key
      AND s.field_provenance->'native_sku_import'->>'native_sku_id'=r.target_id::text
      AND s.field_provenance->'native_sku_import'->'native_sku'=native_row
      AND s.field_provenance->'native_sku_import'->'mapping'->>'isRepresentative'='true')) THEN
    RAISE EXCEPTION 'SKU claim requires one canonical creator record, not one record per alias' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='IMPORT_BATCH' AND (r.target_id<>b.id OR r.source_entity_type<>'INVENTORY_SCOPE_APPROVAL'
    OR r.source_key<>'FINAL_COMPLETE_SCOPE' OR r.source_record_hash<>b.source_hash OR r.source_file_ref<>b.source_manifest_ref
    OR r.decision_reason IS DISTINCT FROM 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
    OR b.checkpoint->'counts'->>'IMPORT_BATCH'<>'0') THEN
    RAISE EXCEPTION 'only the one original exact final complete-scope approval can be claimed' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_import_accounting_claim_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.operation_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.import_batch_id;
  IF r.action='IMPORT_CORE_STAGE' THEN
    PERFORM naijue_erp.assert_core_initialization_v14(NEW.import_batch_id,r.id,true);
    RETURN NULL;
  END IF;
  IF r.target_type<>'IMPORT'  OR r.target_id<>b.id OR r.status<>'COMMITTED'
    OR r.action IS DISTINCT FROM (CASE WHEN NEW.target_type='IMPORT_BATCH' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
    OR r.completed_at IS DISTINCT FROM NEW.claimed_at OR a.object_type<>'IMPORT' OR a.object_id<>b.id
    OR a.action<>r.action OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM NEW.claimed_at
    OR a.old_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint
    OR a.new_version::bigint IS DISTINCT FROM NEW.checkpoint_sequence::bigint+1
    OR a.after_values IS DISTINCT FROM b.checkpoint
    OR a.after_values->>'sequence' IS DISTINCT FROM NEW.checkpoint_sequence::text
    OR r.result_data->>'sequence' IS DISTINCT FROM NEW.checkpoint_sequence::text THEN
    RAISE EXCEPTION 'accounting claim requires the one original exact receipt audit and checkpoint' USING ERRCODE='23514'; END IF;
  IF NEW.target_type='INVENTORY_LEDGER' AND NOT EXISTS(
    SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.inventory_balance q
      ON q.warehouse_id=l.warehouse_id AND q.sku_id=l.sku_id
    JOIN naijue_erp.import_record s ON s.id=NEW.import_record_id
    WHERE l.id=NEW.target_id AND l.event_kind='CUTOFF_BASELINE' AND l.operation_id=r.id AND l.source_import_batch_id=b.id
      AND s.source_entity_type='INVENTORY_BASELINE' AND q.quantity=l.quantity_delta AND q.version=1
      AND q.last_operation_id=r.id AND q.updated_at=r.completed_at AND l.posted_at=r.completed_at) THEN
    RAISE EXCEPTION 'baseline accounting requires its real exact same-operation record ledger and fresh balance' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.assert_history_typed_closure(selected_batch uuid,plan jsonb,documents jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE core_operation uuid; b naijue_erp.import_batch%ROWTYPE;actual_counts jsonb;entity_counts jsonb;d jsonb;closure_header_source record;r record;
 expected_keys text[]:=ARRAY['version','selectionSha256','authorizedPayloadHash','sourceManifestSha256','typedManifestSha256','documentManifestSha256','expectedCounts','sourceEntityCounts','documentCount'];
 doc_keys text[]:=ARRAY['kind','sourceKey','headerSourceRowId','headerId','headerSourceSha256','lineCount','settlementCount','sourceDocumentSha256','typedDocumentSha256'];
 entity_keys text[]:=ARRAY['HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER','CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE','INVENTORY_BASELINE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'];
 count_keys text[]:=ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'];
 key text;scope text;bytes bigint;lines bigint;settlements bigint;source_lines bigint;source_settlements bigint;
BEGIN
 SELECT id INTO core_operation FROM naijue_erp.operation_receipt WHERE target_type='IMPORT' AND target_id=selected_batch AND action='IMPORT_BIND_FULL_SOURCE';
 IF core_operation IS NOT NULL THEN PERFORM naijue_erp.assert_core_initialization_v14(selected_batch,core_operation,false); END IF;
 IF jsonb_typeof(plan) IS DISTINCT FROM 'object' OR jsonb_typeof(documents) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'exact object plan and document array required' USING ERRCODE='23514';END IF;
 IF (jsonb_typeof(plan)='object' AND plan ?& expected_keys AND plan-expected_keys='{}'::jsonb
   AND plan->>'version'='HISTORY_TYPED_CLOSURE_V1' AND jsonb_typeof(documents)='array') IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'exact full history closure plan/documents required' USING ERRCODE='23514';END IF;
 FOREACH key IN ARRAY ARRAY['selectionSha256','authorizedPayloadHash','sourceManifestSha256','typedManifestSha256','documentManifestSha256'] LOOP
  IF (jsonb_typeof(plan->key)='string' AND plan->>key~'^[0-9a-f]{64}$') IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'exact authenticated closure SHA required' USING ERRCODE='23514';END IF;
 END LOOP;
 IF NOT naijue_erp.history_closure_count_map(plan->'expectedCounts',count_keys)
  OR NOT naijue_erp.history_closure_count_map(plan->'sourceEntityCounts',entity_keys)
  OR NOT naijue_erp.history_closure_count_map(jsonb_build_object('n',plan->'documentCount'),ARRAY['n']) THEN
  RAISE EXCEPTION 'exact finite closure count maps required' USING ERRCODE='23514';END IF;
 IF jsonb_array_length(documents)>100000 OR (plan->>'documentCount')::integer<>jsonb_array_length(documents) THEN
  RAISE EXCEPTION 'complete bounded document set required' USING ERRCODE='23514';END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
 IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN('STAGED','VALIDATING','PASSED','IMPORTED')
  OR EXISTS(SELECT 1 FROM naijue_erp.import_batch x WHERE x.status='IMPORTED' AND x.id<>selected_batch)
  OR b.source_hash IS DISTINCT FROM plan->>'selectionSha256' OR b.history_payload_hash IS DISTINCT FROM plan->>'authorizedPayloadHash'
  OR b.history_expected_counts IS DISTINCT FROM plan->'expectedCounts' THEN
  RAISE EXCEPTION 'exact selected closure source/metadata scope required' USING ERRCODE='23514';END IF;
 FOREACH key IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER'] LOOP
  IF (b.checkpoint->'counts'->>key)::bigint IS DISTINCT FROM (b.checkpoint->'expected'->>key)::bigint THEN
   RAISE EXCEPTION 'all original nonfinal accounting must be complete' USING ERRCODE='23514';END IF;
 END LOOP;
 -- Offline STAGE takes a fixed-order SHARE table lock to exclude ordinary native
 -- writes and phantoms while all semantic facts are compared. This is stronger
 -- than row locks and is explicitly not a live request path.
 LOCK TABLE naijue_erp.product,naijue_erp.sku,naijue_erp.product_category,naijue_erp.color,naijue_erp.fit,naijue_erp.size,
  naijue_erp.size_group,naijue_erp.season,naijue_erp.hall,naijue_erp.customer,naijue_erp.staff,naijue_erp.warehouse,
  naijue_erp.supplier,naijue_erp.size_group_member,naijue_erp.sku_barcode,naijue_erp.barcode_scheme,
  naijue_erp.payment_method,naijue_erp.payment_account,naijue_erp.payment_account_hall IN SHARE MODE;
 PERFORM s.id FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch ORDER BY s.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND NOT s.entity_type=ANY(entity_keys)) THEN
  RAISE EXCEPTION 'unknown or unsupported source entity' USING ERRCODE='23514';END IF;
 SELECT jsonb_object_agg(k,(SELECT count(*) FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND s.entity_type=k))
  INTO entity_counts FROM unnest(entity_keys) k;
 SELECT jsonb_build_object('import_source_row',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=selected_batch),
  'import_sku_alias',(SELECT count(*) FROM naijue_erp.import_sku_alias WHERE batch_id=selected_batch),
  'import_stock_contributor',(SELECT count(*) FROM naijue_erp.import_stock_contributor WHERE batch_id=selected_batch),
  'barcodes',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=selected_batch AND entity_type='BARCODE'),
  'history_sales_header',(SELECT count(*) FROM naijue_erp.history_sales_header WHERE batch_id=selected_batch),
  'history_sales_line',(SELECT count(*) FROM naijue_erp.history_sales_line WHERE batch_id=selected_batch),
  'history_sales_settlement',(SELECT count(*) FROM naijue_erp.history_sales_settlement WHERE batch_id=selected_batch),
  'history_transfer_header',(SELECT count(*) FROM naijue_erp.history_transfer_header WHERE batch_id=selected_batch),
  'history_transfer_line',(SELECT count(*) FROM naijue_erp.history_transfer_line WHERE batch_id=selected_batch)) INTO actual_counts;
 IF entity_counts IS DISTINCT FROM plan->'sourceEntityCounts' OR actual_counts IS DISTINCT FROM plan->'expectedCounts' THEN
  RAISE EXCEPTION 'complete independent source and typed counts differ' USING ERRCODE='23514';END IF;
 -- Every selected original occurrence must have its exact typed/native carrier.
 FOR r IN SELECT s.* FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch ORDER BY s.id LOOP
  IF r.entity_type IN('HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key
    AND naijue_erp.history_closure_projection('import_source_row',e.source_snapshot)=naijue_erp.history_closure_projection('import_source_row',to_jsonb(r))) THEN
    RAISE EXCEPTION 'original party occurrence/creation carrier missing or changed' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type IN('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key) THEN RAISE EXCEPTION 'original catalogue carrier missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type IN('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_native_payment_binding e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key) THEN RAISE EXCEPTION 'original payment carrier missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='PRODUCT' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.product n WHERE n.id::text=r.field_provenance->>'native_product_id') THEN RAISE EXCEPTION 'original product binding missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SKU' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id=selected_batch AND a.source_row_id=r.id AND a.old_source_sku_id=r.source_key) THEN RAISE EXCEPTION 'original SKU alias missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='INVENTORY_BASELINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=selected_batch AND c.source_row_id=r.id AND c.old_source_sku_id=r.raw_fields->>'SKU来源编号') THEN RAISE EXCEPTION 'original contributor missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='BARCODE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.sku_barcode bc WHERE bc.barcode=r.field_provenance->>'native_barcode' AND bc.sku_id::text=r.field_provenance->>'native_sku_id'
    AND r.raw_fields->>'绑定范围'='SKU' AND r.normalized_fields->>'绑定范围'='SKU') THEN RAISE EXCEPTION 'effective SKU barcode missing or product scope forbidden' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SALES_HEADER' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h WHERE h.batch_id=selected_batch AND h.source_row_id=r.id) THEN RAISE EXCEPTION 'original sales header missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='TRANSFER_HEADER' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header h WHERE h.batch_id=selected_batch AND h.source_row_id=r.id) THEN RAISE EXCEPTION 'original transfer header missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SALES_LINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l JOIN naijue_erp.history_sales_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original sales line missing or wrong document' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='TRANSFER_LINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l JOIN naijue_erp.history_transfer_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original transfer line missing or wrong document' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SETTLEMENT' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement l JOIN naijue_erp.history_sales_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original settlement missing or wrong document' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 -- Reverse coverage is separate from source counts/digest. Extra typed identities
 -- cannot disappear into counts or a different source kind.
 IF EXISTS(SELECT 1 FROM (
  SELECT 'SALES_HEADER'::text entity_type,h.source_row_id FROM naijue_erp.history_sales_header h WHERE h.batch_id=selected_batch
  UNION ALL SELECT 'SALES_LINE',l.source_row_id FROM naijue_erp.history_sales_line l WHERE l.batch_id=selected_batch
  UNION ALL SELECT 'SETTLEMENT',l.source_row_id FROM naijue_erp.history_sales_settlement l WHERE l.batch_id=selected_batch
  UNION ALL SELECT 'TRANSFER_HEADER',h.source_row_id FROM naijue_erp.history_transfer_header h WHERE h.batch_id=selected_batch
  UNION ALL SELECT 'TRANSFER_LINE',l.source_row_id FROM naijue_erp.history_transfer_line l WHERE l.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.import_native_payment_binding e WHERE e.batch_id=selected_batch
  UNION ALL SELECT 'SKU',a.source_row_id FROM naijue_erp.import_sku_alias a WHERE a.batch_id=selected_batch
  UNION ALL SELECT 'INVENTORY_BASELINE',c.source_row_id FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=selected_batch
 ) t WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND s.id=t.source_row_id AND s.entity_type=t.entity_type)) THEN
  RAISE EXCEPTION 'extra wrong-kind or orphan typed carrier' USING ERRCODE='23514';END IF;
 bytes:=octet_length(naijue_erp.history_closure_encode(jsonb_build_object('batchId',selected_batch::text,'fixedSourceNamespace',b.source_name,'plan',plan)));
 FOR d IN SELECT value FROM jsonb_array_elements(documents) LOOP
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'exact document object required' USING ERRCODE='23514';END IF;
  IF (jsonb_typeof(d)='object' AND d ?& doc_keys AND d-doc_keys='{}'::jsonb AND d->>'kind' IN('SALES','TRANSFER')
    AND jsonb_typeof(d->'sourceKey')='string' AND length(btrim(d->>'sourceKey'))>0 AND octet_length(convert_to(d->>'sourceKey','UTF8'))<=65536) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'exact document descriptor shape required' USING ERRCODE='23514';END IF;
  FOREACH key IN ARRAY ARRAY['headerSourceRowId','headerId'] LOOP
   IF (jsonb_typeof(d->key)='string' AND d->>key~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'exact document UUID required' USING ERRCODE='23514';END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['headerSourceSha256','sourceDocumentSha256','typedDocumentSha256'] LOOP
   IF (jsonb_typeof(d->key)='string' AND d->>key~'^[0-9a-f]{64}$') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'exact document digest required' USING ERRCODE='23514';END IF;
  END LOOP;
  IF NOT naijue_erp.history_closure_count_map(jsonb_build_object('lineCount',d->'lineCount','settlementCount',d->'settlementCount'),ARRAY['lineCount','settlementCount'])
   OR (d->>'lineCount')::integer=0 OR(d->>'kind'='TRANSFER' AND (d->>'settlementCount')::integer<>0) THEN
   RAISE EXCEPTION 'bounded nonempty original document lines required; no implicit zero-header permission' USING ERRCODE='23514';END IF;
  bytes:=bytes+octet_length(naijue_erp.history_closure_encode(d));IF bytes>67108864 THEN RAISE EXCEPTION 'closure document byte limit' USING ERRCODE='23514';END IF;
  SELECT s.*,actual_header.id header_id INTO STRICT closure_header_source FROM naijue_erp.import_source_row s JOIN(
    SELECT x.id,x.source_row_id FROM naijue_erp.history_sales_header x WHERE d->>'kind'='SALES' AND x.batch_id=selected_batch
    UNION ALL SELECT x.id,x.source_row_id FROM naijue_erp.history_transfer_header x WHERE d->>'kind'='TRANSFER' AND x.batch_id=selected_batch
   ) actual_header ON actual_header.source_row_id=s.id WHERE s.batch_id=selected_batch AND actual_header.id=(d->>'headerId')::uuid;
  IF closure_header_source.id::text IS DISTINCT FROM d->>'headerSourceRowId' OR closure_header_source.source_key IS DISTINCT FROM d->>'sourceKey'
   OR naijue_erp.history_closure_row_hash('import_source_row',closure_header_source.id::text,naijue_erp.history_closure_projection('import_source_row',to_jsonb(closure_header_source)-'header_id')) IS DISTINCT FROM d->>'headerSourceSha256' THEN
   RAISE EXCEPTION 'document header/source identity or complete source hash differs' USING ERRCODE='23514';END IF;
  SELECT count(*) FILTER(WHERE s.entity_type=CASE WHEN d->>'kind'='SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END),
   count(*) FILTER(WHERE s.entity_type='SETTLEMENT') INTO source_lines,source_settlements FROM naijue_erp.import_source_row s
   WHERE s.batch_id=selected_batch AND s.normalized_fields->>'单据来源编号'=d->>'sourceKey'
    AND s.entity_type=ANY(CASE WHEN d->>'kind'='SALES' THEN ARRAY['SALES_LINE','SETTLEMENT'] ELSE ARRAY['TRANSFER_LINE'] END);
  IF d->>'kind'='SALES' THEN SELECT count(*) INTO lines FROM naijue_erp.history_sales_line WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;
   SELECT count(*) INTO settlements FROM naijue_erp.history_sales_settlement WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;
  ELSE SELECT count(*) INTO lines FROM naijue_erp.history_transfer_line WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;settlements:=0;END IF;
  IF lines IS DISTINCT FROM (d->>'lineCount')::bigint OR lines IS DISTINCT FROM source_lines OR settlements IS DISTINCT FROM (d->>'settlementCount')::bigint OR settlements IS DISTINCT FROM source_settlements THEN
   RAISE EXCEPTION 'per-document original/typed line or settlement coverage differs' USING ERRCODE='23514';END IF;
  scope:=selected_batch::text||':'||(d->>'kind')||':'||(d->>'headerId');
  IF naijue_erp.history_closure_digest(selected_batch,'document-source:'||scope,'document-source',d->>'kind',(d->>'headerId')::uuid) IS DISTINCT FROM d->>'sourceDocumentSha256'
   OR naijue_erp.history_closure_digest(selected_batch,'document-typed:'||scope,'document-typed',d->>'kind',(d->>'headerId')::uuid) IS DISTINCT FROM d->>'typedDocumentSha256' THEN
   RAISE EXCEPTION 'complete original/typed document digest differs' USING ERRCODE='23514';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(documents) closure_document_values(value) GROUP BY closure_document_values.value->>'headerSourceRowId' HAVING count(*)<>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents) closure_document_values(value) GROUP BY closure_document_values.value->>'kind',closure_document_values.value->>'headerId' HAVING count(*)<>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents) closure_document_values(value) GROUP BY closure_document_values.value->>'kind',closure_document_values.value->>'sourceKey' HAVING count(*)<>1)
  OR jsonb_array_length(documents)<>(actual_counts->>'history_sales_header')::bigint+(actual_counts->>'history_transfer_header')::bigint THEN
  RAISE EXCEPTION 'complete unique bidirectional document coverage required' USING ERRCODE='23514';END IF;
 IF naijue_erp.history_closure_digest(selected_batch,'source:'||selected_batch::text,'source') IS DISTINCT FROM plan->>'sourceManifestSha256'
  OR naijue_erp.history_closure_digest(selected_batch,'typed:'||selected_batch::text,'typed') IS DISTINCT FROM plan->>'typedManifestSha256'
  OR naijue_erp.history_closure_digest(selected_batch,'documents:'||selected_batch::text,'manifest',NULL,NULL,documents) IS DISTINCT FROM plan->>'documentManifestSha256' THEN
  RAISE EXCEPTION 'complete authenticated source/typed/document manifest digest differs' USING ERRCODE='23514';END IF;
END;
$$;

-- New helper is INVOKER; C must grant its exact EXECUTE to the independently reviewed runtime role, never PUBLIC.
COMMIT;
