-- SOURCE ONLY: not installed or PostgreSQL validated.
BEGIN;
DO $lineage$ DECLARE pin jsonb; BEGIN
 FOR pin IN SELECT value FROM jsonb_array_elements('[{"signature":"naijue_erp.is_native_party_import_insert(text,jsonb)","sha256":"175dfe8176f72b969124581d53a9db07b1a73f5c65d574cb1809710fb802f407"},{"signature":"naijue_erp.guard_history_publication()","sha256":"0b53107aa76b5103d819bb7e8c50fc96ad5216555529ff9eac293d79d4fcd42b"},{"signature":"naijue_erp.guard_header_native_reference_publication()","sha256":"b09bda8d276cd7cd8937dfcb24c479928016fe75b9f16e76cb7e541d9dfb1719"},{"signature":"naijue_erp.guard_native_catalogue_publication()","sha256":"0c2052e7341acea54570fcf0dc541d48f21d106f47ba1ed400ef51ccc63386cf"},{"signature":"naijue_erp.guard_native_payment_publication()","sha256":"c494542b943c2f60dadaa1eb9f355f12c1de8c22b8e2237b3ddb11ef6450bdfe"},{"signature":"naijue_erp.guard_history_typed_publication()","sha256":"d3449e5691c9311d085a85783ff24df6f32b165b50b3cc19b55dbb8f3c30772b"},{"signature":"naijue_erp.guard_import_accounting_publication()","sha256":"7696441bccca815501fe7a51e497abddf966597a8ead707ad37e0b52bc3f2704"},{"signature":"naijue_erp.guard_successor_publication26()","sha256":"0c04d575867921541fe88a4f5300355603b6496fdb7db5f6ef4271372d6c1fdc"}]'::jsonb) LOOP
  IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid=(pin->>'signature')::regprocedure) IS DISTINCT FROM pin->>'sha256' THEN RAISE EXCEPTION 'WHOLE_GUARD_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 END LOOP;
END $lineage$;
-- CODE-ONLY CANDIDATE. Not an installer; host/target metadata review and approval required.
-- No live execution, no grants, no table/trigger/schema changes.

CREATE OR REPLACE FUNCTION naijue_erp.is_native_party_import_insert(kind text, snapshot jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; r naijue_erp.operation_receipt%ROWTYPE;
 b naijue_erp.import_batch%ROWTYPE; item jsonb; expected jsonb; proof jsonb;
 actual_ids jsonb; claimed_ids jsonb; pointer jsonb; phase_name text; intent_count bigint;
BEGIN
 -- STANDARD27_BRANCH_BEGIN
 IF current_setting('role') IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2')
    OR EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN

    PERFORM naijue_erp.standard_import_identity(NULL,'ROLE_IMPORTER');
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE object_type='IMPORT'
      AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND (NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change root_a WHERE root_a.after_values ? 'whole_package_v2' AND root_a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) OR (EXISTS(SELECT 1 FROM jsonb_array_elements(after_values->'records') exact_item WHERE exact_item->>'target_type'=kind AND exact_item->>'target_id'=snapshot->>'id')));
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
    IF a.after_values ? 'whole_package_v2' THEN b.status:=r.result_data->>'status'; END IF;
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

    IF kind IS NULL OR kind NOT IN ('CUSTOMER','SUPPLIER') OR phase_name IS DISTINCT FROM 'MASTER'
      OR b.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
      OR b.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR b.status NOT IN ('STAGED','VALIDATING')
      OR snapshot->'version' IS DISTINCT FROM '1'::jsonb THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_CONTEXT_INVALID' USING ERRCODE='23514'; END IF;
    SELECT count(*) INTO intent_count FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF intent_count<>1 THEN RAISE EXCEPTION 'STANDARD27_PARTY_INTENT_REQUIRED' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT item FROM jsonb_array_elements(a.after_values->'records') value
      WHERE value->>'target_type'=kind AND value->>'target_id'=snapshot->>'id';
    IF item->>'entity_type' IS DISTINCT FROM kind OR item->'fields'->>'id' IS DISTINCT FROM snapshot->>'id'
      OR coalesce(length(item->>'source_key'),0)=0 OR coalesce(length(btrim(item->>'file_ref')),0)=0
      OR jsonb_typeof(item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'source_refs')<1
      OR item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object(
        'source_key',item->>'source_key','fields',item->'fields','source_refs',item->'source_refs')::text,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    IF kind='CUSTOMER' THEN expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.customer,item->'fields'));
    ELSE expected:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.supplier,item->'fields')); END IF;
    IF expected IS DISTINCT FROM snapshot OR naijue_erp.standard_import_row_intent(kind,snapshot) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'STANDARD27_PARTY_ROW_INVALID' USING ERRCODE='23514'; END IF;
    RETURN true;
 END IF;
 -- A nonstandard caller cannot borrow a retained standard identity as legacy
 -- evidence. Return false (not an exception) so an UPDATE caller evaluating
 -- its INSERT predicate eagerly still reaches its unchanged runtime checks.
 IF EXISTS(SELECT 1 FROM naijue_erp.import_record WHERE target_type=kind AND target_id::text=snapshot->>'id'
   AND decision_reason LIKE '%STANDARD_IMPORT_POINTER_V1%') THEN RETURN false; END IF;
 -- STANDARD27_BRANCH_END
 RETURN EXISTS (SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.entity_type=kind
    AND e.native_id::text=snapshot->>'id' AND e.native_snapshot=snapshot AND e.creation_xid=pg_current_xact_id()
    AND e.validator_version='NATIVE_PARTY_IMPORT_V1' AND snapshot->'version'='1'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_publication() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION naijue_erp.guard_header_native_reference_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, naijue_erp AS $$
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR NEW.status <> 'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (
    SELECT 1 FROM naijue_erp.history_sales_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    CROSS JOIN LATERAL (VALUES
      ('所属厅来源编号','HALL',h.hall_id),('客户来源编号','CUSTOMER',h.customer_id),
      ('营业员来源编号','STAFF',h.salesperson_id),('原创建厅编号','HALL',h.created_hall_id)
    ) v(field,entity,native_id)
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND v.native_id IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (v.native_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
          AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
          AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)=v.native_id))))
  ) OR EXISTS (
    SELECT 1 FROM naijue_erp.history_transfer_header h
    JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->'原创建厅编号') IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>'原创建厅编号'='' AND h.created_hall_id IS NOT NULL)
      OR (s.normalized_fields->>'原创建厅编号'<>'' AND (h.created_hall_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id AND r.entity_type='HALL'
          AND r.source_key=s.normalized_fields->>'原创建厅编号' AND r.native_hall_id=h.created_hall_id))))
  ) THEN RAISE EXCEPTION 'historical header has incomplete same-batch native reference coverage' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT h.batch_id,h.source_row_id,'仓库来源编号'::text AS field,h.warehouse_id AS native_id FROM naijue_erp.history_sales_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调出仓来源编号',h.from_warehouse_id FROM naijue_erp.history_transfer_header h
      UNION ALL SELECT h.batch_id,h.source_row_id,'调入仓来源编号',h.to_warehouse_id FROM naijue_erp.history_transfer_header h
    ) h JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id
    WHERE h.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->h.field) IS DISTINCT FROM 'string'
      OR s.normalized_fields->>h.field='' OR NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
          AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
          AND r.source_key=s.normalized_fields->>h.field AND r.target_id=h.native_id))
  ) THEN RAISE EXCEPTION 'historical header warehouse lacks exact same-batch imported identity' USING ERRCODE='23514'; END IF;
  -- Do not let direct source-only inserts evade relation coverage by omitting
  -- the directory row altogether. Writer atomicity is not a publication proof.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN ('HALL','CUSTOMER','STAFF') AND NOT EXISTS (
        SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=s.batch_id
          AND r.source_row_id=s.id AND r.entity_type=s.entity_type AND r.source_key=s.source_key)
  ) THEN RAISE EXCEPTION 'historical native dictionary source lacks exact reference directory coverage' USING ERRCODE='23514'; END IF;
  -- Cover nonempty relations in the directory's own original dictionary rows.
  IF EXISTS (
    SELECT 1 FROM naijue_erp.import_header_native_reference d
    JOIN naijue_erp.import_source_row s ON s.batch_id=d.batch_id AND s.id=d.source_row_id
    CROSS JOIN LATERAL (
      SELECT '默认客户来源编号'::text AS field,'CUSTOMER'::text AS entity,'default_customer_id'::text AS native_column WHERE d.entity_type='HALL'
      UNION ALL SELECT '默认销货仓来源编号','WAREHOUSE','default_sales_warehouse_id' WHERE d.entity_type='HALL'
      UNION ALL SELECT '所属厅来源编号','HALL','hall_id' WHERE d.entity_type='STAFF'
    ) v
    WHERE d.batch_id=NEW.id AND (jsonb_typeof(s.normalized_fields->v.field) IS DISTINCT FROM 'string'
      OR (s.normalized_fields->>v.field='' AND d.native_snapshot->>v.native_column IS NOT NULL)
      OR (s.normalized_fields->>v.field<>'' AND (d.native_snapshot->>v.native_column IS NULL
        OR (v.entity='WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=NEW.id
            AND r.source_entity_type='WAREHOUSE' AND r.target_type='WAREHOUSE' AND r.status='IMPORTED'
            AND r.source_key=s.normalized_fields->>v.field AND r.target_id::text=d.native_snapshot->>v.native_column))
        OR (v.entity<>'WAREHOUSE' AND NOT EXISTS (
          SELECT 1 FROM naijue_erp.import_header_native_reference r WHERE r.batch_id=NEW.id
            AND r.entity_type=v.entity AND r.source_key=s.normalized_fields->>v.field
            AND COALESCE(r.native_hall_id,r.native_customer_id,r.native_staff_id)::text=d.native_snapshot->>v.native_column)))))
  ) THEN RAISE EXCEPTION 'historical native directory has incomplete original relation coverage' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_catalogue_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS (SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','SIZE_GROUP_MEMBER')
    AND NOT EXISTS (SELECT 1 FROM naijue_erp.import_native_catalogue_binding x
      WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'native dictionary occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_native_payment_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
    AND s.entity_type IN ('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL') AND NOT EXISTS(
      SELECT 1 FROM naijue_erp.import_native_payment_binding x WHERE x.batch_id=s.batch_id AND x.source_row_id=s.id
        AND x.entity_type=s.entity_type AND x.source_key=s.source_key)) THEN
    RAISE EXCEPTION 'payment occurrence lacks typed creation binding' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_history_typed_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE m record;plan jsonb;documents jsonb;
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
 IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND NEW.status='IMPORTED' THEN
  IF TG_OP<>'UPDATE' THEN
   RAISE EXCEPTION 'history19 publication requires existing selected batch' USING ERRCODE='23514'; END IF;
  IF OLD.status NOT IN('STAGED','VALIDATING') OR NEW.history_validation_passed IS DISTINCT FROM TRUE
   OR NEW.history_actual_counts IS DISTINCT FROM NEW.history_expected_counts
   OR NEW.checkpoint->'counts' IS DISTINCT FROM NEW.checkpoint->'expected'
   OR NEW.checkpoint->'counts'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
   OR NEW.completed_at IS NULL THEN
   RAISE EXCEPTION 'history19 complete original accounting and readback required' USING ERRCODE='23514'; END IF;
  SELECT * INTO m FROM naijue_erp.import_history_closure_manifest WHERE batch_id=NEW.id;
  IF NOT FOUND OR m.validator_version<>'HISTORY_TYPED_CLOSURE_V1'
   OR m.selection_sha256 IS DISTINCT FROM NEW.source_hash
   OR m.authorized_payload_hash IS DISTINCT FROM NEW.history_payload_hash
   OR m.expected_counts IS DISTINCT FROM NEW.history_expected_counts THEN
   RAISE EXCEPTION 'history19 immutable selected closure manifest required' USING ERRCODE='23514'; END IF;
  plan:=jsonb_build_object('version',m.validator_version,'selectionSha256',m.selection_sha256,'authorizedPayloadHash',m.authorized_payload_hash,
   'sourceManifestSha256',m.source_manifest_sha256,'typedManifestSha256',m.typed_manifest_sha256,'documentManifestSha256',m.document_manifest_sha256,
   'expectedCounts',m.expected_counts,'sourceEntityCounts',m.source_entity_counts,'documentCount',m.document_count);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',d.document_kind,'sourceKey',d.source_key,'headerSourceRowId',d.header_source_row_id::text,
   'headerId',COALESCE(d.sales_header_id,d.transfer_header_id)::text,'headerSourceSha256',d.header_source_sha256,'lineCount',d.line_count,
   'settlementCount',d.settlement_count,'sourceDocumentSha256',d.source_document_sha256,'typedDocumentSha256',d.typed_document_sha256)
   ORDER BY d.document_kind,COALESCE(d.sales_header_id,d.transfer_header_id)),'[]'::jsonb) INTO documents
   FROM naijue_erp.import_history_document_manifest d WHERE d.batch_id=NEW.id;
  -- Independently recompute complete SQL fields, bidirectional source/typed
  -- coverage, global and per-document roots. No count or passed flag shortcut.
  PERFORM naijue_erp.assert_history_typed_closure(NEW.id,plan,documents);
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_import_accounting_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; actual bigint;
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  -- Full readback is an observation at publication, NEVER progress-counter assignment or backfill.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_record r LEFT JOIN naijue_erp.import_record_accounting_claim c
      ON c.import_batch_id=r.import_batch_id AND c.import_record_id=r.id
    WHERE r.import_batch_id=NEW.id AND r.status='IMPORTED' AND c.import_record_id IS NULL) THEN
    RAISE EXCEPTION 'every published native record requires its original once-only accounting ownership' USING ERRCODE='23514'; END IF;
  FOREACH kind IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER','IMPORT_BATCH'] LOOP
    SELECT count(*) INTO actual FROM naijue_erp.import_record_accounting_claim WHERE import_batch_id=NEW.id AND target_type=kind;
    IF actual<>(NEW.checkpoint->'counts'->>kind)::bigint OR actual<>(NEW.checkpoint->'expected'->>kind)::bigint THEN
      RAISE EXCEPTION 'published claim scope differs from frozen native progress' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.guard_successor_publication26() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE original_source record; target uuid; matched bigint;
BEGIN

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
  IF NEW.inventory_mode='DOCUMENT_CONVERSION' THEN
    IF NEW.mapping_version<>'DOCUMENT_CONVERSION_V1' OR NEW.history_payload_hash IS NOT NULL OR NEW.history_expected_counts IS NOT NULL
      OR EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=NEW.id) THEN
      RAISE EXCEPTION 'standard conversion cannot enter the legacy raw/history publication pipeline' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.mapping_version<>'V2_HISTORY_NULLABLE_1' OR NEW.status<>'IMPORTED' THEN RETURN NEW; END IF;
  PERFORM naijue_erp.cutoff_import_lock();
  -- Original19 conservation, typed closure, approval/audit/accounting and no-STAGED
  -- visibility guards remain enabled. This adds actual successor-field readback.
  FOR original_source IN SELECT * FROM naijue_erp.import_source_row WHERE batch_id=NEW.id AND entity_type='PRODUCT' ORDER BY id FOR SHARE LOOP
    PERFORM naijue_erp.assert_native_product_season_source(original_source::naijue_erp.import_source_row);
  END LOOP;
  -- Only a complete, genuinely customer/history-free first baseline has no
  -- historical supplement to prove. Missing or unknown declarations never match.
  -- Original19 still independently re-reads the whole closure and FINAL facts.
  IF EXISTS(SELECT 1 FROM naijue_erp.import_history_closure_manifest m
      WHERE m.batch_id=NEW.id AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
        AND m.selection_sha256=NEW.source_hash AND m.authorized_payload_hash=NEW.history_payload_hash
        AND m.expected_counts=NEW.history_expected_counts AND m.document_count=0
        AND m.source_entity_counts @> '{"CUSTOMER":0,"SALES_HEADER":0,"SALES_LINE":0,"SETTLEMENT":0,"TRANSFER_HEADER":0,"TRANSFER_LINE":0}'::jsonb
        AND m.expected_counts @> '{"history_sales_header":0,"history_sales_line":0,"history_sales_settlement":0,"history_transfer_header":0,"history_transfer_line":0}'::jsonb)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE id<>NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=NEW.id
      AND s.entity_type IN('CUSTOMER','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'))
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_history_document_manifest WHERE batch_id=NEW.id)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.customer)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e
      WHERE e.entity_type='CUSTOMER' OR e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_header_native_reference
      WHERE entity_type='CUSTOMER' OR native_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s
      WHERE s.field_provenance->>'native_customer_id' IS NOT NULL
        OR s.file_ref='dictionaries/historical-customers.json'
        OR s.field_provenance->'history_header_reference_staging'->'selection'->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1')
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  -- The two original identities form one reviewed supplement; neither can be
  -- omitted, replaced, promoted to current business or attached to another batch.
  FOREACH target IN ARRAY ARRAY['2e5bd72a-c1cb-4090-90be-091deb49bb2e'::uuid,'f8a29ce8-e296-4b95-9612-ca7bb62507bd'::uuid] LOOP
    PERFORM naijue_erp.is_exact_historical_customer_only(target);
    SELECT count(*) INTO matched FROM naijue_erp.native_party_import_evidence e
      JOIN naijue_erp.import_source_row s ON s.batch_id=e.batch_id AND s.id=e.source_row_id
      WHERE e.batch_id=NEW.id AND e.entity_type='CUSTOMER' AND e.native_id=target
        AND e.selection->>'source'='HISTORICAL_CUSTOMER_SUPPLEMENT_V1';
    IF matched<>1 OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h
      JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
      JOIN naijue_erp.import_source_row cs ON cs.batch_id=h.batch_id AND cs.entity_type='CUSTOMER'
        AND cs.field_provenance->>'native_customer_id'=target::text
      WHERE h.batch_id=NEW.id AND h.customer_id=target AND h.number=cs.raw_fields->>'sourceDocumentNumber')
      OR EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_customer_id=target)
      OR EXISTS(SELECT 1 FROM naijue_erp.sales_header WHERE customer_id=target) THEN
      RAISE EXCEPTION 'Both exact historical customers must close with their original history and no current usage' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

COMMIT;
