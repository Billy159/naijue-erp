-- C-only exact QA successor to C133/C136. SOURCE ONLY; D1 does not execute.
-- C must first verify the full predecessor canonical SHA in the original runtime-role context:
-- 3b896d4fb4abef4f26f3d5c862a06e1b7b5166396b696aec4de5935601e6d0f5.
-- This script additionally binds the exact database/OID, 123 functions and both old bodies.
-- Only the two approved JSON extraction groupings change; no grants/schema/other routine changes.
-- Uninstalled R1 uses the corrected COMPLETE v14 patch instead of this QA-only repair.
BEGIN;
DO $v14_repair$
DECLARE required record; targets oid[]; before_routines jsonb; after_routines jsonb;
BEGIN
 IF current_database()<>'erp_qa_rapid26_core_20261024_01'
   OR (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database())<>'1034834'
   OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]
   OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p'))<>123 THEN
  RAISE EXCEPTION 'Exact C133 QA v14 predecessor required; no v15 or production repair' USING ERRCODE='23514';
 END IF;
 FOR required IN SELECT * FROM (VALUES
  ('assert_core_initialization_v14(uuid,uuid,boolean)','665501c212a0576bf154ecd230d32fae36e9f50656e3c17d58bb268b50279bd1'),
  ('assert_native_bootstrap_accounts(uuid)','21e2cfcc34b0865e4d5bad67c281c41d2884b91fa2ae72c23a100bcc5ca76d87')
 ) x(signature,sha256) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.'||required.signature)
    AND encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex')=required.sha256) THEN
   RAISE EXCEPTION 'Exact original v14 function body required; do not replay repair' USING ERRCODE='23514';
  END IF;
 END LOOP;
 targets:=ARRAY[to_regprocedure('naijue_erp.assert_core_initialization_v14(uuid,uuid,boolean)')::oid,
                to_regprocedure('naijue_erp.assert_native_bootstrap_accounts(uuid)')::oid];
 -- Include every pg_proc field (OID/owner/ACL/config/signature/properties) and
 -- all121 other bodies. Exclude ONLY prosrc for the two explicit target OIDs.
 SELECT jsonb_agg(to_jsonb(p)-(CASE WHEN p.oid=ANY(targets) THEN ARRAY['prosrc']::text[] ELSE ARRAY[]::text[] END) ORDER BY p.oid)
  INTO before_routines FROM pg_catalog.pg_proc p WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p');

 EXECUTE $v14_core_ddl$
CREATE OR REPLACE FUNCTION naijue_erp.assert_core_initialization_v14(selected_batch uuid, selected_operation uuid, creation boolean) RETURNS void
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
 $v14_core_ddl$;

 EXECUTE $v14_accounts_ddl$
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
 $v14_accounts_ddl$;

 FOR required IN SELECT * FROM (VALUES
  ('assert_core_initialization_v14(uuid,uuid,boolean)','3163e6870f5bfa3e3a08f870779221649f13c7d5d6001fcf90503f74a6faba46'),
  ('assert_native_bootstrap_accounts(uuid)','171c59ba962a287dd02bb9eac993512e114783a470063108a07ba5e206cbabca')
 ) x(signature,sha256) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.'||required.signature)
    AND encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex')=required.sha256) THEN
   RAISE EXCEPTION 'Repaired function body differs from the reviewed grouping-only source' USING ERRCODE='23514';
  END IF;
 END LOOP;
 SELECT jsonb_agg(to_jsonb(p)-(CASE WHEN p.oid=ANY(targets) THEN ARRAY['prosrc']::text[] ELSE ARRAY[]::text[] END) ORDER BY p.oid)
  INTO after_routines FROM pg_catalog.pg_proc p WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p');
 IF after_routines IS DISTINCT FROM before_routines THEN
  RAISE EXCEPTION 'Repair must retain both function OIDs/ACLs/attributes and all121 other routines exactly' USING ERRCODE='23514';
 END IF;
END $v14_repair$;
COMMIT;
-- C exports the new complete catalog/ACL and obtains the original QB exact-delta
-- review. The old canonical/review is NOT valid for the two new routine bodies.
