-- Source44: three actual-PG-confirmed record/query-alias collision fixes only.
-- Original initialization, account/session, source data and plan are not changed.
-- Installed source42 (680fdac8) and source43 (92f7e48e) remain immutable.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
SET LOCAL TimeZone='UTC';
DO $before$
DECLARE routine_row record; pin jsonb;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT generate_series(1,27))
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD44_EXACT_INSTALLED43_REQUIRED' USING ERRCODE='23514'; END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='naijue_erp.standard_import_command(jsonb,text,text)'::regprocedure)<>'b600d24b88b1a70f6a28b797da3406509a817fd847516681eda6e9711ea6d1d2' THEN RAISE EXCEPTION 'STANDARD44_SOURCE43_LINEAGE_DIFFERS' USING ERRCODE='23514'; END IF;
 FOR pin IN SELECT value FROM jsonb_array_elements($pins$[{"signature":"naijue_erp.assert_standard_import_operation(uuid)","old":"d2b310a7e902c94721ab7d6e6205284b1fd811a5a78da9334fc53744141bb16b","new":"aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4","security_definer":true,"result_type":"void","config":["search_path=pg_catalog, naijue_erp","TimeZone=UTC"],"execute":false,"invariant_sha256":"8843c4cd5e4693ec1feab8b7570e5a8fe31e4219b69ce25fba312958b50eab46","old_definition_sha256":"7c3981815ff3e6b8fd888e6d44a0c38cd2deefe715250cd0ead827d62eca7290"},{"signature":"naijue_erp.validate_baseline_source_commit()","old":"1fcb4ab36f3c008ccaa0a53797aec14e7e4f3a54e0f05bf311cae40e1dafd814","new":"c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4","security_definer":false,"result_type":"trigger","config":["search_path=pg_catalog, naijue_erp"],"execute":true,"invariant_sha256":"503a48751e8a79af7e8b4b1188d1c96126e90ee92626573d154b12be4278a84b","old_definition_sha256":"4881651c070881e6651f8c527eb361365c7f429e56d2dca84e1f5b7a516bdb85"},{"signature":"naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)","old":"e1b06e7343ffe2a4b1048f3a5ca55a814ead2fbb4d984344b3491a5924ae2680","new":"c5b7a0b4d44748df3e19491c3426d547de331385a58c839a76aea90cd5e1c2ff","security_definer":false,"result_type":"void","config":["search_path=pg_catalog, naijue_erp"],"execute":false,"invariant_sha256":"323ee3c65a3352d91edb89483ef77f9adf4bca426c09bdd6a1bdb5c7feb5cd83","old_definition_sha256":"1d989012fc6c9bfd79430f41273a7873fb7779e2dc4ce90f6f0e48a80ebcb39d"}]$pins$::jsonb) LOOP
  SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid=(pin->>'signature')::regprocedure;
  IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>pin->>'old' THEN RAISE EXCEPTION 'STANDARD44_PREDECESSOR_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
  IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>pin->>'invariant_sha256' THEN RAISE EXCEPTION 'STANDARD44_PREDECESSOR_NONBODY_METADATA_DIFFERS' USING ERRCODE='23514'; END IF;
  IF routine_row.prosecdef IS DISTINCT FROM (pin->>'security_definer')::boolean OR routine_row.prokind<>'f' OR routine_row.provolatile<>'v' OR routine_row.prorettype<>(pin->>'result_type')::regtype OR routine_row.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
   OR routine_row.proowner<>(SELECT nspowner FROM pg_namespace WHERE nspname='naijue_erp') OR to_jsonb(routine_row.proconfig) IS DISTINCT FROM pin->'config' THEN RAISE EXCEPTION 'STANDARD44_ROUTINE_ATTRIBUTES_DIFFER' USING ERRCODE='23514'; END IF;
  IF has_function_privilege('erp_unified27_initializer_2393dbc6db9581c2',routine_row.oid,'EXECUTE') IS DISTINCT FROM (pin->>'execute')::boolean
   OR has_function_privilege('erp_unified27_importer_2393dbc6db9581c2',routine_row.oid,'EXECUTE') IS DISTINCT FROM (pin->>'execute')::boolean
   OR has_function_privilege('erp_unified27_runtime_2393dbc6db9581c2',routine_row.oid,'EXECUTE') IS DISTINCT FROM (pin->>'execute')::boolean THEN RAISE EXCEPTION 'STANDARD44_ROUTINE_ACL_DIFFERS' USING ERRCODE='42501'; END IF;
 END LOOP;
END $before$;

CREATE OR REPLACE FUNCTION naijue_erp.assert_standard_import_operation(operation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; b naijue_erp.import_batch%ROWTYPE;
 item jsonb; actual jsonb; expected jsonb; table_name text; kind text; before_cp jsonb; after_cp jsonb; keys text[]; field text;
 delta numeric; total numeric:=0; ids jsonb; claimed jsonb; account_staff uuid; row_count bigint;
BEGIN
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=operation;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=r.id;
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=r.target_id;
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
 IF r.result_data->>'phase'='INITIALIZE' THEN PERFORM naijue_erp.standard_import_identity(NULL,'INITIALIZER');
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
  kind:=item->>'target_type';table_name:=lower(kind);
  IF kind='INVENTORY_KEY' THEN
   IF (item->'fields'->>'quantity')::bigint=0 THEN
    IF item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=b.id AND warehouse_id=(item->'fields'->>'warehouse_id')::uuid AND sku_id=(item->'fields'->>'sku_id')::uuid) THEN
     RAISE EXCEPTION 'STANDARD_EXPLICIT_ZERO_CANNOT_POST_LEDGER' USING ERRCODE='23514'; END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.validate_baseline_source_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
  IF NEW.event_kind='CUTOFF_BASELINE' AND EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id=NEW.source_import_batch_id AND mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1') THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) proof
      WHERE s.import_batch_id=NEW.source_import_batch_id AND s.target_type='INVENTORY_KEY' AND s.target_id=naijue_erp.standard_inventory_key_id(NEW.warehouse_id,NEW.sku_id)
       AND proof->>'ledger_entry_id'=NEW.id::text AND proof->>'operation_id'=NEW.operation_id::text AND (proof->'fields'->>'quantity')::bigint=NEW.quantity_delta)
      OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt receipt_row WHERE receipt_row.id=NEW.operation_id AND receipt_row.result_data->>'phase'='KEYS' AND receipt_row.completed_at=NEW.posted_at) THEN
      RAISE EXCEPTION 'STANDARD_BASELINE_EXPLICIT_KEY_SOURCE_REQUIRED' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NEW.event_kind <> 'CUTOFF_BASELINE' THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.operation_id;
  IF r.target_type <> 'IMPORT' OR r.target_id IS DISTINCT FROM NEW.source_import_batch_id OR r.action <> 'IMPORT_CHUNK'
    OR r.completed_at IS DISTINCT FROM NEW.posted_at
    OR NOT (r.result_data->'ledgerEntryIds' ? NEW.id::text)
    OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = NEW.source_import_batch_id
      AND target_type = 'INVENTORY_LEDGER' AND target_id = NEW.id AND status = 'IMPORTED' AND source_entity_type = 'INVENTORY_BASELINE') THEN
    RAISE EXCEPTION 'baseline requires its native source and actual import operation' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.assert_document_conversion_batch(next_row naijue_erp.import_batch, prior jsonb, mutation text, final_state boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; actual bigint; total numeric:=0; a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 IF mutation='DELETE' OR next_row.inventory_mode<>'DOCUMENT_CONVERSION' OR next_row.mapping_version<>'DOCUMENT_CONVERSION_V1'
   OR next_row.history_payload_hash IS NOT NULL OR next_row.history_expected_counts IS NOT NULL
   OR next_row.history_actual_counts IS NOT NULL OR next_row.history_validation_passed IS TRUE
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE' AND cutoff_at=next_row.cutoff_at)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger WHERE source_import_batch_id=next_row.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.operation_receipt receipt_row JOIN naijue_erp.inventory_ledger l ON l.operation_id=receipt_row.id WHERE receipt_row.target_type='IMPORT' AND receipt_row.target_id=next_row.id) THEN
  RAISE EXCEPTION 'conversion cannot post or rebaseline inventory; one exact previously published cutoff is required' USING ERRCODE='23514'; END IF;
 IF mutation='INSERT' THEN
  IF next_row.status<>'STAGED' OR next_row.checkpoint->>'sequence'<>'0' OR next_row.checkpoint->>'cursor'<>'0' THEN
   RAISE EXCEPTION 'conversion must stage at zero' USING ERRCODE='23514'; END IF;
 ELSE
  IF prior IS NULL OR prior->>'status' IN ('IMPORTED','FAILED')
    OR (to_jsonb(next_row)-ARRAY['status','checkpoint','completed_at']) IS DISTINCT FROM (prior-ARRAY['status','checkpoint','completed_at'])
    OR next_row.checkpoint->'expected' IS DISTINCT FROM prior->'checkpoint'->'expected'
    OR (next_row.checkpoint->>'sequence')::numeric<>(prior->'checkpoint'->>'sequence')::numeric+1
    OR (next_row.checkpoint->>'cursor')::numeric<(prior->'checkpoint'->>'cursor')::numeric
    OR next_row.status NOT IN ('VALIDATING','IMPORTED','FAILED') THEN
   RAISE EXCEPTION 'immutable conversion source or invalid checkpoint/state transition' USING ERRCODE='23514'; END IF;
 END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'expected'))<>6
  OR (SELECT count(*) FROM jsonb_object_keys(next_row.checkpoint->'counts'))<>6 THEN
  RAISE EXCEPTION 'conversion requires exactly six ordinary target counters' USING ERRCODE='23514'; END IF;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','IMPORT_BATCH'] LOOP
  IF jsonb_typeof(next_row.checkpoint->'expected'->kind) IS DISTINCT FROM 'number'
   OR jsonb_typeof(next_row.checkpoint->'counts'->kind) IS DISTINCT FROM 'number'
   OR (next_row.checkpoint->'expected'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind ~ '^[0-9]+$') IS DISTINCT FROM true
   OR (next_row.checkpoint->'counts'->>kind)::numeric>(next_row.checkpoint->'expected'->>kind)::numeric
   OR (prior IS NOT NULL AND (next_row.checkpoint->'counts'->>kind)::numeric<(prior->'checkpoint'->'counts'->>kind)::numeric) THEN
   RAISE EXCEPTION 'conversion counter type/range/monotonicity mismatch' USING ERRCODE='23514'; END IF;
  total:=total+(next_row.checkpoint->'counts'->>kind)::numeric;
  IF final_state THEN
   SELECT count(*) INTO actual FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type=kind AND status='IMPORTED';
   IF actual::numeric<>(next_row.checkpoint->'counts'->>kind)::numeric THEN
    RAISE EXCEPTION 'conversion counters must equal exact committed ordinary identities: %',kind USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 IF total<>(next_row.checkpoint->>'cursor')::numeric OR next_row.checkpoint->'expected'->>'IMPORT_BATCH'<>'1' THEN
  RAISE EXCEPTION 'conversion exact cursor/final approval scope mismatch' USING ERRCODE='23514'; END IF;
 IF NOT final_state THEN RETURN; END IF;
 SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND object_id=next_row.id AND new_version=(next_row.checkpoint->>'sequence')::integer+1;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN a.after_values->'checkpoint' ELSE a.after_values END) IS DISTINCT FROM next_row.checkpoint OR a.actor_account_id<>r.actor_account_id OR a.occurred_at IS DISTINCT FROM r.completed_at
   OR r.target_type<>'IMPORT' OR r.target_id<>next_row.id OR r.result_data->>'sequence' IS DISTINCT FROM next_row.checkpoint->>'sequence'
   OR r.result_data->>'cursor' IS DISTINCT FROM next_row.checkpoint->>'cursor' OR r.result_data->>'status' IS DISTINCT FROM next_row.status
   OR (mutation='INSERT' AND (a.old_version IS NOT NULL OR a.before_values IS NOT NULL OR r.action<>'IMPORT_STAGE'))
   OR (mutation='UPDATE' AND (a.old_version IS DISTINCT FROM (prior->'checkpoint'->>'sequence')::integer+1 OR a.before_values IS DISTINCT FROM prior->'checkpoint'))
   OR r.action IS DISTINCT FROM (CASE next_row.status WHEN 'STAGED' THEN 'IMPORT_STAGE' WHEN 'IMPORTED' THEN 'IMPORT_PUBLISH' ELSE 'IMPORT_CHUNK' END)
   OR r.result_data->'ledgerEntryIds'<>'[]'
   OR (next_row.status='IMPORTED' AND next_row.completed_at IS DISTINCT FROM r.completed_at) THEN
  RAISE EXCEPTION 'conversion checkpoint requires its exact atomic import audit/receipt' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account ua JOIN naijue_erp.staff st ON st.id=ua.staff_id
   WHERE ua.id=r.actor_account_id AND ua.login_enabled AND st.employment_status='在职' AND st.role='ADMIN')
  OR r.completed_at IS DISTINCT FROM transaction_timestamp() THEN
  RAISE EXCEPTION 'conversion batch requires actual current administrator and transaction time' USING ERRCODE='42501'; END IF;
 IF next_row.status='IMPORTED' THEN
  IF next_row.checkpoint->'counts' IS DISTINCT FROM next_row.checkpoint->'expected'
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND status NOT IN ('IMPORTED','EXCLUDED'))
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id=next_row.id AND target_type='IMPORT_BATCH' AND target_id=next_row.id
      AND status='IMPORTED' AND source_entity_type='DOCUMENT_CONVERSION_APPROVAL' AND source_key='FINAL_DOCUMENT_CONVERSION'
      AND source_record_hash=next_row.source_hash AND source_file_ref=next_row.source_manifest_ref
      AND (CASE WHEN r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' THEN decision_reason::jsonb->>'format'='STANDARD_IMPORT_POINTER_V1' AND decision_reason::jsonb->>'operationId'=r.id::text ELSE decision_reason='DOCUMENT_CONVERSION_V1;CURRENT_EFFECTIVE;ARCHIVE_RESTORE_VERIFIED;BASELINE_COVERAGE_CONFIRMED;NO_REBASELINE;NO_UNRESOLVED_EXCEPTIONS' END))
    OR EXISTS(SELECT 1 FROM naijue_erp.import_record m WHERE m.import_batch_id=next_row.id AND m.status='IMPORTED'
      AND m.target_type IN ('SALES_HEADER','TRANSFER_HEADER') AND NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt anchor
        WHERE anchor.action='MIGRATE_DOCUMENT' AND anchor.target_id=m.target_id
          AND anchor.target_type=CASE m.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END)) THEN
   RAISE EXCEPTION 'conversion publication requires complete ordinary anchors and exact retained approval/archive evidence' USING ERRCODE='23514'; END IF;
 END IF;
END $$;

DO $after$
DECLARE routine_row record; pin jsonb;
BEGIN
 FOR pin IN SELECT value FROM jsonb_array_elements($pins$[{"signature":"naijue_erp.assert_standard_import_operation(uuid)","old":"d2b310a7e902c94721ab7d6e6205284b1fd811a5a78da9334fc53744141bb16b","new":"aa0df41c4376343dd206361452aae3d59ff517c041e4654be52816e21c40f9f4","security_definer":true,"result_type":"void","config":["search_path=pg_catalog, naijue_erp","TimeZone=UTC"],"execute":false,"invariant_sha256":"8843c4cd5e4693ec1feab8b7570e5a8fe31e4219b69ce25fba312958b50eab46","old_definition_sha256":"7c3981815ff3e6b8fd888e6d44a0c38cd2deefe715250cd0ead827d62eca7290"},{"signature":"naijue_erp.validate_baseline_source_commit()","old":"1fcb4ab36f3c008ccaa0a53797aec14e7e4f3a54e0f05bf311cae40e1dafd814","new":"c5f0eb66c654852f8cb4dfa181e594304b65400f1538135f91701afabe14b1f4","security_definer":false,"result_type":"trigger","config":["search_path=pg_catalog, naijue_erp"],"execute":true,"invariant_sha256":"503a48751e8a79af7e8b4b1188d1c96126e90ee92626573d154b12be4278a84b","old_definition_sha256":"4881651c070881e6651f8c527eb361365c7f429e56d2dca84e1f5b7a516bdb85"},{"signature":"naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,jsonb,text,boolean)","old":"e1b06e7343ffe2a4b1048f3a5ca55a814ead2fbb4d984344b3491a5924ae2680","new":"c5b7a0b4d44748df3e19491c3426d547de331385a58c839a76aea90cd5e1c2ff","security_definer":false,"result_type":"void","config":["search_path=pg_catalog, naijue_erp"],"execute":false,"invariant_sha256":"323ee3c65a3352d91edb89483ef77f9adf4bca426c09bdd6a1bdb5c7feb5cd83","old_definition_sha256":"1d989012fc6c9bfd79430f41273a7873fb7779e2dc4ce90f6f0e48a80ebcb39d"}]$pins$::jsonb) LOOP
  SELECT p.* INTO STRICT routine_row FROM pg_proc p WHERE p.oid=(pin->>'signature')::regprocedure;
  IF encode(sha256(convert_to(routine_row.prosrc,'UTF8')),'hex')<>pin->>'new' THEN RAISE EXCEPTION 'STANDARD44_REPLACEMENT_BODY_DIFFERS' USING ERRCODE='23514'; END IF;
  IF encode(sha256(convert_to((to_jsonb(routine_row)-'prosrc')::text,'UTF8')),'hex')<>pin->>'invariant_sha256' THEN RAISE EXCEPTION 'STANDARD44_NONBODY_METADATA_CHANGED' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace)<>168 THEN RAISE EXCEPTION 'STANDARD44_ROUTINE_COUNT_CHANGED' USING ERRCODE='23514'; END IF;
END $after$;
COMMIT;
