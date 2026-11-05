-- SOURCE CANDIDATE ONLY. Not installed, PostgreSQL parsed, or DB accepted.
-- Exact unchanged original approved SALE restoration only. Any earlier economic
-- edit, even later reversed, remains unsupported and rejects. No row is created.
-- Requires the reviewed whole-package source-profile and missing-settlement
-- successors, exact hardened dependency cohort and existing immutable guards.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_original_restoration$
DECLARE
 spec jsonb := $source_changes${"predecessor_sha256":"fc876ce73e260cd690205d1297cbac71649ae4b2fb81d88784d260e1e2ff1f86","successor_sha256":"4d8c62b7383a82871be4217d6bd79f3b1ceb35ffe35302224d507f82765bd268","dependencies":[{"name":"assert_document_migration","signature":"naijue_erp.assert_document_migration(uuid)","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"2bed9652283f7bd640c45e16f5ac820369022f249da60678123271a649c2a9c8","security_definer":false},{"name":"unified_document_snapshot","signature":"naijue_erp.unified_document_snapshot(text,uuid)","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"5b5b17b5b977321452ebe545825c2df19527a9e0072cb9ed0ab3ec102e02e7ed","security_definer":false},{"name":"unified_sales_header_audit_values","signature":"naijue_erp.unified_sales_header_audit_values(naijue_erp.sales_header)","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"cb5c332b2f8aaf99cca4a7c24234060fb74d8990a9d1cac252d13862cc23e91d","security_definer":false},{"name":"validate_unified_ordinary_operation","signature":"naijue_erp.validate_unified_ordinary_operation()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"4df5ec2f7c3a25d2461a56586f83f20d63773f01e6ca80b9c45429676a1969a4","security_definer":false},{"name":"validate_unified_sales_header_commit","signature":"naijue_erp.validate_unified_sales_header_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"a8ce6dd5da8e1098f097ffed58304b2ab857b5b576e4e868804f76d5018a6339","security_definer":false},{"name":"validate_unified_sales_line_commit","signature":"naijue_erp.validate_unified_sales_line_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"a31692ba5b18b9da6701ccd12d3101af1a5e85ba15b60e1e7150a6e4723d8ef5","security_definer":false},{"name":"validate_unified_sales_settlement_commit","signature":"naijue_erp.validate_unified_sales_settlement_commit()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"d2da5c47e935406e114fc06a487f128fbbe7d370d9b204ac10df956cba7d9abd","security_definer":false},{"name":"guard_unified_document","signature":"naijue_erp.guard_unified_document()","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"fa51aa3c79074a829c685127f6638152e26def788d919c19eb38bfffcb50f961","security_definer":false},{"name":"validate_unified_baseline_reversal","signature":"naijue_erp.validate_unified_baseline_reversal()","source":"adapters/postgres/migrations/0027_unified_business_documents.sql","sha256":"e79f446269183dc9af235f7408344462e933f4ddd687231a671fc8b195923aed","security_definer":false},{"name":"standard_inventory_key_id","signature":"naijue_erp.standard_inventory_key_id(uuid,uuid)","source":"adapters/postgres/patches/0027_standard_import_initialization.sql","sha256":"370852266a17d0c3797b1fb5d704c281c4418a99c3be0faf1bd7796ed7815720","security_definer":false},{"name":"reject_immutable_change","signature":"naijue_erp.reject_immutable_change()","source":"adapters/postgres/migrations/0001_runtime_sales.sql","sha256":"3daef49e525ad973be82350a1551e979198d21ff58f3f1bb92a4f7292e4d038c","security_definer":false},{"name":"standard_whole_package_command_v2","signature":"naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)","source":"adapters/postgres/patches/0027_historical_sales_source_profile_successor.sql","from_candidate":true,"sha256":"febd7953e7e14ffb5c7ed84705c02d71e152ec765db8bad12b132a574649b4f8","security_definer":true}],"triggers":[{"table":"operation_receipt","name":"immutable_receipt","function":"reject_immutable_change","type":27,"deferred":false},{"table":"audit_change","name":"immutable_audit","function":"reject_immutable_change","type":27,"deferred":false},{"table":"inventory_ledger","name":"immutable_ledger","function":"reject_immutable_change","type":27,"deferred":false},{"table":"import_record","name":"immutable_import_record","function":"reject_immutable_change","type":27,"deferred":false},{"table":"inventory_ledger","name":"baseline_reversal_source","function":"validate_unified_baseline_reversal","type":7,"deferred":false},{"table":"operation_receipt","name":"unified_ordinary_operation_consistency","function":"validate_unified_ordinary_operation","type":5,"deferred":true},{"table":"sales_header","name":"sales_cutoff_freeze","function":"guard_unified_document","type":31,"deferred":false},{"table":"sales_header","name":"unified_sales_header_command_consistency","function":"validate_unified_sales_header_commit","type":21,"deferred":true},{"table":"sales_line","name":"unified_sales_line_command_consistency","function":"validate_unified_sales_line_commit","type":21,"deferred":true},{"table":"sales_settlement","name":"unified_sales_settlement_command_consistency","function":"validate_unified_sales_settlement_commit","type":29,"deferred":true}],"replacements":[{"before":"r naijue_erp.operation_receipt%ROWTYPE;","after":"r naijue_erp.operation_receipt%ROWTYPE;\n origin_receipt naijue_erp.operation_receipt%ROWTYPE; origin_audit naijue_erp.audit_change%ROWTYPE;\n documents_batch naijue_erp.import_batch%ROWTYPE; baseline_batch naijue_erp.import_batch%ROWTYPE;\n source_record naijue_erp.import_record%ROWTYPE; source_receipt naijue_erp.operation_receipt%ROWTYPE; source_audit naijue_erp.audit_change%ROWTYPE;\n origin_snapshot jsonb; origin_header jsonb; current_snapshot jsonb; baseline_evidence jsonb; source_pointer jsonb; source_item jsonb; source_entry jsonb; source_request jsonb;\n cursor_header jsonb; actual_header jsonb; before_header jsonb; after_header jsonb; actual_effect_ids jsonb; receipt_effect_ids jsonb;\n mutable_header text[]; allowed_header text[]; field text; numeric_field text;\n proof_batch record; proof_target record; step record; origin_version integer; expected_version integer; previous_time timestamptz; previous_approval uuid;\n audit_count bigint; receipt_count bigint; effect_count bigint; expected_effects bigint;"},{"before":" IF h.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h.net_due THEN","after":"$RESTORATION_PROOF"}]}$source_changes$::jsonb;
 extension text := $restoration_proof$ -- A historical empty settlement set is UNKNOWN even when net_due is zero.
 -- This narrowly admits exact original restoration; it never certifies an edit
 -- and never invokes current-importer/current-actor checks against old events.
 IF h.status='APPROVED' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0 AND evidence.action<>'MIGRATE_DOCUMENT' THEN
  IF current_setting('session_replication_role') IS DISTINCT FROM 'origin' OR r.action IS DISTINCT FROM 'APPROVE' OR h.version<=1 THEN
   RAISE EXCEPTION 'HISTORICAL_ORIGINAL_RESTORATION_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT origin_receipt FROM naijue_erp.operation_receipt rr
   WHERE rr.target_type='SALES' AND rr.target_id=target AND rr.action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT origin_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=origin_receipt.id;
  origin_version:=origin_audit.new_version;
  origin_snapshot:=origin_audit.after_values-ARRAY['baseline','sourceRecordId'];
  origin_header:=origin_snapshot->'header';
  current_snapshot:=naijue_erp.unified_document_snapshot('SALES',target);
  IF origin_receipt.status IS DISTINCT FROM 'COMMITTED' OR origin_audit.object_type IS DISTINCT FROM 'SALES'
   OR origin_audit.object_id IS DISTINCT FROM target OR origin_audit.action IS DISTINCT FROM 'MIGRATE_DOCUMENT'
   OR origin_audit.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id
   OR origin_audit.occurred_at IS DISTINCT FROM origin_receipt.completed_at OR origin_version IS NULL OR origin_version<1 OR origin_version>=h.version
   OR origin_audit.old_version IS NOT NULL OR origin_audit.before_values IS NOT NULL
   OR jsonb_typeof(origin_snapshot) IS DISTINCT FROM 'object' OR origin_snapshot-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
   OR jsonb_typeof(origin_header) IS DISTINCT FROM 'object' OR jsonb_typeof(origin_snapshot->'lines') IS DISTINCT FROM 'array'
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(origin_header) key) IS DISTINCT FROM
    (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid='naijue_erp.sales_header'::regclass AND attnum>0 AND NOT attisdropped)
   OR origin_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR origin_header->>'id' IS DISTINCT FROM target::text OR origin_header->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_header->>'business_type' IS DISTINCT FROM 'SALE' OR origin_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_header->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'
   OR origin_receipt.result_data->>'operationId' IS DISTINCT FROM origin_receipt.id::text
   OR origin_receipt.result_data->>'salesId' IS DISTINCT FROM target::text
   OR origin_receipt.result_data->'version' IS DISTINCT FROM to_jsonb(origin_version)
   OR origin_receipt.result_data->>'status' IS DISTINCT FROM 'APPROVED'
   OR origin_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
   OR origin_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(origin_snapshot::text,'UTF8')),'hex')
   OR origin_receipt.result_data->'baseline' IS DISTINCT FROM origin_audit.after_values->'baseline'
   OR origin_receipt.result_data->>'sourceRecordId' IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=origin_receipt.id)
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_balance q WHERE q.last_operation_id=origin_receipt.id) THEN
   RAISE EXCEPTION 'RESTORATION_ORIGIN_INVALID' USING ERRCODE='23514'; END IF;
  -- Full physical line rows, including inactive/zero rows and nullable snapshots,
  -- retain exactly their original identities, order, prices and economics.
  mutable_header:=ARRAY['version','status','updated_at','approved_by_account_id','approved_by_staff_id','approved_at','note','responsible_staff_id'];
  IF current_snapshot->'lines' IS DISTINCT FROM origin_snapshot->'lines'
   OR current_snapshot->'settlements' IS DISTINCT FROM '[]'::jsonb
   OR (current_snapshot->'header' - mutable_header) IS DISTINCT FROM (origin_header - mutable_header)
   OR jsonb_array_length(origin_snapshot->'lines')=0 THEN
   RAISE EXCEPTION 'RESTORATION_CURRENT_ROWS_DIFFER' USING ERRCODE='23514'; END IF;
  IF h.gross_amount IS DISTINCT FROM (SELECT sum(ln.line_amount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)
   OR h.net_due IS DISTINCT FROM h.gross_amount-h.order_discount
   OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current
    AND (ln.line_amount IS DISTINCT FROM ln.quantity::numeric*ln.deal_price OR ln.deal_price<0))
   OR (SELECT coalesce(sum(ln.allocated_discount),0) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current)>h.order_discount
   OR (NOT EXISTS(SELECT 1 FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.allocated_discount IS NULL)
    AND (SELECT sum(ln.allocated_discount) FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current) IS DISTINCT FROM h.order_discount) THEN
   RAISE EXCEPTION 'RESTORATION_KNOWN_ECONOMICS_DIFFER' USING ERRCODE='23514'; END IF;
  SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch bb WHERE bb.id=h.import_batch_id;
  SELECT * INTO STRICT baseline_batch FROM naijue_erp.import_batch bb WHERE bb.id=(origin_audit.after_values->'baseline'->>'baselineBatchId')::uuid;
  baseline_evidence:=origin_audit.after_values->'baseline';
  IF documents_batch.inventory_mode IS DISTINCT FROM 'DOCUMENT_CONVERSION' OR documents_batch.mapping_version IS DISTINCT FROM 'DOCUMENT_CONVERSION_V1'
   OR documents_batch.status IS DISTINCT FROM 'IMPORTED' OR baseline_batch.status IS DISTINCT FROM 'IMPORTED'
   OR baseline_batch.inventory_mode IS DISTINCT FROM 'CUTOFF_STOCK_BASELINE' OR baseline_batch.mapping_version IS DISTINCT FROM 'STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR documents_batch.source_name IS DISTINCT FROM baseline_batch.source_name OR documents_batch.source_hash IS DISTINCT FROM baseline_batch.source_hash
   OR documents_batch.cutoff_at IS DISTINCT FROM baseline_batch.cutoff_at
   OR origin_header->>'import_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR origin_receipt.result_data->>'batchId' IS DISTINCT FROM documents_batch.id::text
   OR baseline_evidence-ARRAY['state','baselineBatchId','baselineManifestSha256','cutoffAt','coverageDigest'] IS DISTINCT FROM '{}'::jsonb
   OR baseline_evidence->>'state' IS DISTINCT FROM 'CONFIRMED'
   OR baseline_evidence->>'baselineManifestSha256' IS DISTINCT FROM baseline_batch.source_hash
   OR (baseline_evidence->>'cutoffAt')::timestamptz IS DISTINCT FROM baseline_batch.cutoff_at
   OR (baseline_evidence->>'coverageDigest' ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Both complete publications must be real immutable standard-import events.
  FOR proof_batch IN SELECT documents_batch.id AS id, 'DOCUMENT_PUBLISH'::text AS phase, documents_batch.checkpoint AS checkpoint, documents_batch.completed_at AS completed_at
   UNION ALL SELECT baseline_batch.id,'BASELINE_SEAL',baseline_batch.checkpoint,baseline_batch.completed_at LOOP
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=proof_batch.id
    AND rr.action='IMPORT_PUBLISH' AND rr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1';
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   source_request:=source_audit.after_values->'request';
   IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
    OR source_audit.object_id IS DISTINCT FROM proof_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
    OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_receipt.completed_at IS DISTINCT FROM proof_batch.completed_at
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_batch.id::text
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_receipt.result_data->>'baselineBatchId' IS DISTINCT FROM baseline_batch.id::text
    OR source_receipt.result_data->>'documentBatchId' IS DISTINCT FROM documents_batch.id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'status' IS DISTINCT FROM 'IMPORTED' OR source_receipt.result_data->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'phase' IS DISTINCT FROM proof_batch.phase
    OR source_audit.after_values->'checkpoint' IS DISTINCT FROM proof_batch.checkpoint
    OR proof_batch.checkpoint->'counts' IS DISTINCT FROM proof_batch.checkpoint->'expected'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_batch.id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to('PUBLISH:'||source_request::text,'UTF8')),'hex')
    OR source_receipt.completed_at<origin_receipt.completed_at AND proof_batch.phase='DOCUMENT_PUBLISH'
    OR source_receipt.completed_at>r.completed_at THEN
    RAISE EXCEPTION 'RESTORATION_PUBLICATION_INVALID' USING ERRCODE='23514'; END IF;
  END LOOP;
  -- The original initializer pins this document cohort and coverage digest. Its
  -- recorded actor is historical evidence; present employment is irrelevant.
  SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.target_type='IMPORT' AND rr.target_id=baseline_batch.id AND rr.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
  SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
  IF source_receipt.status IS DISTINCT FROM 'COMMITTED' OR source_audit.object_type IS DISTINCT FROM 'IMPORT'
   OR source_audit.object_id IS DISTINCT FROM baseline_batch.id OR source_audit.action IS DISTINCT FROM source_receipt.action
   OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at
   OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
   OR source_audit.after_values->'request'->>'batch_id' IS DISTINCT FROM baseline_batch.id::text
   OR source_audit.after_values->'request'->>'namespace' IS DISTINCT FROM documents_batch.source_name
   OR source_audit.after_values->'request'->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
   OR source_audit.after_values->'request'->'payload'->>'document_batch_id' IS DISTINCT FROM documents_batch.id::text
   OR source_audit.after_values->'request'->'payload'->>'alignment_sha256' IS DISTINCT FROM baseline_evidence->>'coverageDigest' THEN
   RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
  -- Inline read-only source proof: no new routine, definer or execution grant.
  -- All source records bind exact typed fields, request rows, locations, original
  -- source-reference arrays and recomputed immutable source hashes.
  FOR proof_target IN
   SELECT documents_batch.id AS batch_id,'SALES_HEADER'::text AS kind,target AS id,origin_header AS fields
   UNION ALL SELECT documents_batch.id,'SALES_LINE',(v->>'id')::uuid,v FROM jsonb_array_elements(origin_snapshot->'lines') v
   UNION ALL SELECT DISTINCT baseline_batch.id,'INVENTORY_KEY',naijue_erp.standard_inventory_key_id(h.warehouse_id,(v->>'sku_id')::uuid),
    jsonb_build_object('warehouse_id',h.warehouse_id,'sku_id',v->>'sku_id') FROM jsonb_array_elements(origin_snapshot->'lines') v
    WHERE v->'is_current'='true'::jsonb AND (v->>'quantity')::bigint<>0 LOOP
   SELECT * INTO STRICT source_record FROM naijue_erp.import_record ss WHERE ss.import_batch_id=proof_target.batch_id AND ss.target_type=proof_target.kind
    AND ss.target_id=proof_target.id AND ss.status='IMPORTED';
   source_pointer:=source_record.decision_reason::jsonb;
   IF source_pointer IS DISTINCT FROM jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',source_pointer->>'operationId')
    OR (source_pointer->>'operationId')::uuid IS NULL THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   SELECT * INTO STRICT source_receipt FROM naijue_erp.operation_receipt rr WHERE rr.id=(source_pointer->>'operationId')::uuid;
   SELECT * INTO STRICT source_audit FROM naijue_erp.audit_change aa WHERE aa.operation_id=source_receipt.id;
   SELECT value INTO STRICT source_item FROM jsonb_array_elements(source_audit.after_values->'records') value WHERE value->>'id'=source_record.id::text;
   source_request:=source_audit.after_values->'request';
   SELECT value INTO STRICT source_entry FROM jsonb_array_elements(source_request->'payload'->'rows') value WHERE value->>'record_id'=source_record.id::text;
   IF source_record.source_system IS DISTINCT FROM documents_batch.source_name OR source_record.reviewed_at IS NULL
    OR source_record.source_entity_type IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'INVENTORY_BASELINE' ELSE proof_target.kind END)
    OR source_receipt.target_type IS DISTINCT FROM 'IMPORT' OR source_receipt.target_id IS DISTINCT FROM proof_target.batch_id
    OR source_receipt.action IS DISTINCT FROM 'IMPORT_CHUNK' OR source_receipt.status IS DISTINCT FROM 'COMMITTED'
    OR source_audit.object_type IS DISTINCT FROM 'IMPORT' OR source_audit.object_id IS DISTINCT FROM proof_target.batch_id
    OR source_audit.action IS DISTINCT FROM source_receipt.action OR source_audit.actor_account_id IS DISTINCT FROM source_receipt.actor_account_id
    OR source_audit.occurred_at IS DISTINCT FROM source_receipt.completed_at OR source_record.reviewed_at IS DISTINCT FROM source_receipt.completed_at
    OR source_receipt.completed_at>origin_receipt.completed_at
    OR source_receipt.result_data->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_audit.after_values->>'profile' IS DISTINCT FROM 'STANDARD_IMPORT_SQL_V1'
    OR source_receipt.result_data->>'operationId' IS DISTINCT FROM source_receipt.id::text
    OR source_receipt.result_data->>'batchId' IS DISTINCT FROM proof_target.batch_id::text
    OR source_receipt.result_data->>'packageManifestSha256' IS DISTINCT FROM documents_batch.source_hash
    OR source_receipt.result_data->>'phase' IS DISTINCT FROM (CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS' ELSE 'DOCUMENTS' END)
    OR source_audit.after_values->>'phase' IS DISTINCT FROM source_receipt.result_data->>'phase'
    OR source_request->>'operation_id' IS DISTINCT FROM source_receipt.id::text
    OR source_request->>'request_key' IS DISTINCT FROM source_receipt.request_key
    OR source_request->>'batch_id' IS DISTINCT FROM proof_target.batch_id::text
    OR source_request->>'namespace' IS DISTINCT FROM documents_batch.source_name
    OR source_request->>'package_manifest_sha256' IS DISTINCT FROM documents_batch.source_hash
    OR (source_request->>'cutoff_at')::timestamptz IS DISTINCT FROM documents_batch.cutoff_at
    OR source_receipt.request_hash IS DISTINCT FROM encode(sha256(convert_to(CASE proof_target.kind WHEN 'INVENTORY_KEY' THEN 'KEYS:' ELSE 'DOCUMENTS:' END||source_request::text,'UTF8')),'hex')
    OR source_item->>'id' IS DISTINCT FROM source_record.id::text OR source_item->>'target_id' IS DISTINCT FROM proof_target.id::text
    OR source_item->>'entity_type' IS DISTINCT FROM source_record.source_entity_type OR source_item->>'target_type' IS DISTINCT FROM proof_target.kind
    OR source_item->>'source_key' IS DISTINCT FROM source_record.source_key OR source_item->>'source_hash' IS DISTINCT FROM source_record.source_record_hash
    OR source_item->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR source_item->>'source_hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_object('source_key',source_item->>'source_key','fields',source_item->'fields','source_refs',source_item->'source_refs')::text,'UTF8')),'hex')
    OR jsonb_typeof(source_item->'source_refs') IS DISTINCT FROM 'array' OR jsonb_array_length(source_item->'source_refs')<1
    OR source_entry->>'source_key' IS DISTINCT FROM source_record.source_key OR source_entry->>'file_ref' IS DISTINCT FROM source_record.source_file_ref
    OR (proof_target.kind<>'INVENTORY_KEY' AND (source_entry->>'entity_type' IS DISTINCT FROM proof_target.kind
     OR source_entry->>'target_id' IS DISTINCT FROM proof_target.id::text OR source_entry->'identity_basis' IS DISTINCT FROM source_item->'identity_basis'))
    OR (proof_target.kind='INVENTORY_KEY' AND source_entry->'ledger_entry_id' IS DISTINCT FROM source_item->'ledger_entry_id')
    OR source_entry->'fields' IS DISTINCT FROM source_item->'fields' OR source_entry->'source_refs' IS DISTINCT FROM source_item->'source_refs'
    OR (source_receipt.result_data->'sourceRecordIds' ? source_record.id::text) IS NOT TRUE THEN
    RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   IF proof_target.kind<>'INVENTORY_KEY' THEN
    IF jsonb_typeof(source_item->'fields') IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(source_item->'fields') key) IS DISTINCT FROM
      (SELECT array_agg(attname::text ORDER BY attname) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND attgenerated='') THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    FOR numeric_field IN SELECT attname::text FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('naijue_erp.'||lower(proof_target.kind COLLATE "C")) AND attnum>0 AND NOT attisdropped AND atttypid IN (20,1700) LOOP
     IF source_item->'fields'->numeric_field IS DISTINCT FROM proof_target.fields->numeric_field THEN
      RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
    END LOOP;
   END IF;
   IF proof_target.kind='SALES_HEADER' THEN
    IF source_record.id::text IS DISTINCT FROM origin_audit.after_values->>'sourceRecordId'
     OR source_receipt.actor_account_id IS DISTINCT FROM origin_receipt.actor_account_id OR source_receipt.completed_at IS DISTINCT FROM origin_receipt.completed_at
     OR to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof_target.fields))
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_request->'payload'->'documents') doc
      WHERE doc IS NOT DISTINCT FROM jsonb_build_object('kind','SALES','id',target,'operation_id',origin_receipt.id,'request_key',origin_receipt.request_key,'source_record_id',source_record.id)
       AND origin_receipt.request_hash=encode(sha256(convert_to(doc::text||origin_snapshot::text,'UTF8')),'hex')) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSIF proof_target.kind='SALES_LINE' THEN
    IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,source_item->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof_target.fields)) THEN
     RAISE EXCEPTION 'RESTORATION_SOURCE_INVALID' USING ERRCODE='23514'; END IF;
   ELSE
    IF source_item->'fields'-ARRAY['quantity'] IS DISTINCT FROM proof_target.fields
     OR jsonb_typeof(source_item->'fields'->'quantity') IS DISTINCT FROM 'string'
     OR (source_item->'fields'->>'quantity' ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$') IS NOT TRUE THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    IF (source_item->'fields'->>'quantity')::bigint=0 THEN
     IF source_item->>'ledger_entry_id' IS NOT NULL OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.source_import_batch_id=baseline_batch.id
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=(proof_target.fields->>'sku_id')::uuid) THEN
      RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.id=(source_item->>'ledger_entry_id')::uuid AND l.operation_id=source_receipt.id
     AND l.event_kind='CUTOFF_BASELINE' AND l.source_import_batch_id=baseline_batch.id AND l.warehouse_id=h.warehouse_id
     AND l.sku_id=(proof_target.fields->>'sku_id')::uuid AND l.quantity_delta=(source_item->'fields'->>'quantity')::bigint) THEN
     RAISE EXCEPTION 'RESTORATION_BASELINE_INVALID' USING ERRCODE='23514'; END IF;
   END IF;
  END LOOP;
  -- Every committed SALES event, not just a recent suffix, must be present once.
  SELECT count(*) INTO audit_count FROM naijue_erp.audit_change aa WHERE aa.object_type='SALES' AND aa.object_id=target;
  SELECT count(*) INTO receipt_count FROM naijue_erp.operation_receipt rr WHERE rr.target_type='SALES' AND rr.target_id=target;
  IF audit_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 OR receipt_count IS DISTINCT FROM h.version::bigint-origin_version::bigint+1 THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  cursor_header:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,origin_header));
  expected_version:=origin_version; previous_time:=origin_receipt.completed_at; previous_approval:=origin_receipt.id;
  FOR step IN SELECT aa.*,rr.actor_account_id AS receipt_actor,rr.action AS receipt_action,rr.target_type AS receipt_kind,rr.target_id AS receipt_target,
   rr.completed_at,rr.result_data,rr.status AS receipt_status FROM naijue_erp.audit_change aa JOIN naijue_erp.operation_receipt rr ON rr.id=aa.operation_id
   WHERE aa.object_type='SALES' AND aa.object_id=target AND aa.new_version>origin_version ORDER BY aa.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version IS DISTINCT FROM expected_version+1
    OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE') OR step.action IS DISTINCT FROM step.receipt_action
    OR step.receipt_kind IS DISTINCT FROM 'SALES' OR step.receipt_target IS DISTINCT FROM target
    OR step.actor_account_id IS DISTINCT FROM step.receipt_actor OR step.receipt_status IS DISTINCT FROM 'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.completed_at<previous_time
    OR step.result_data->>'operationId' IS DISTINCT FROM step.operation_id::text OR step.result_data->>'salesId' IS DISTINCT FROM target::text
    OR step.result_data->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR step.result_data->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END) THEN
    RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
   IF jsonb_typeof(step.before_values) IS DISTINCT FROM 'object' OR jsonb_typeof(step.after_values) IS DISTINCT FROM 'object'
    OR step.before_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.after_values-ARRAY['header','lines','settlements'] IS DISTINCT FROM '{}'::jsonb
    OR step.before_values->'lines' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'lines' IS DISTINCT FROM '[]'::jsonb
    OR step.before_values->'settlements' IS DISTINCT FROM '[]'::jsonb OR step.after_values->'settlements' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header'; after_header:=step.after_values->'header';
   allowed_header:=CASE step.action WHEN 'SAVE' THEN ARRAY['version','note','responsibleStaffId','updatedAt']
    ELSE ARRAY['version','status','updatedAt','approvedByAccountId','approvedByStaffId','approvedAt'] END;
   IF jsonb_typeof(before_header) IS DISTINCT FROM 'object' OR jsonb_typeof(after_header) IS DISTINCT FROM 'object'
    OR before_header - allowed_header IS DISTINCT FROM '{}'::jsonb OR after_header - allowed_header IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA' USING ERRCODE='23514'; END IF;
   IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(before_header) key) IS DISTINCT FROM (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(after_header) key)
    OR (before_header ?& ARRAY['version','updatedAt']) IS NOT TRUE OR (after_header ?& ARRAY['version','updatedAt']) IS NOT TRUE
    OR before_header->'version' IS DISTINCT FROM to_jsonb(expected_version) OR after_header->'version' IS DISTINCT FROM to_jsonb(step.new_version)
    OR (after_header->>'updatedAt')::timestamptz IS DISTINCT FROM step.completed_at
    OR cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'UNAPPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action<>'SAVE' AND ((before_header ? 'status') IS NOT TRUE OR (after_header ? 'status') IS NOT TRUE)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   IF (after_header ? 'note') AND jsonb_typeof(after_header->'note') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   FOREACH field IN ARRAY ARRAY['responsibleStaffId','approvedByAccountId','approvedByStaffId'] LOOP
    IF after_header ? field THEN
     IF jsonb_typeof(after_header->field) NOT IN ('string','null') OR (jsonb_typeof(after_header->field)='string' AND (after_header->>field)::uuid IS NULL) THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    END IF;
   END LOOP;
   FOR field IN SELECT jsonb_object_keys(before_header) LOOP
    IF field IN ('updatedAt','approvedAt') THEN
     IF jsonb_typeof(before_header->field) NOT IN ('string','null') OR jsonb_typeof(after_header->field) NOT IN ('string','null')
      OR (before_header->>field)::timestamptz IS DISTINCT FROM (cursor_header->>field)::timestamptz THEN
      RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    ELSIF before_header->field IS DISTINCT FROM cursor_header->field THEN
     RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
    cursor_header:=jsonb_set(cursor_header,ARRAY[field],after_header->field);
   END LOOP;
   IF cursor_header->>'status' IS DISTINCT FROM (CASE step.action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'DRAFT' END)
    OR (step.action='APPROVE' AND (cursor_header->>'approvedByAccountId' IS DISTINCT FROM step.receipt_actor::text
     OR cursor_header->>'approvedByStaffId' IS NULL OR (cursor_header->>'approvedAt')::timestamptz IS DISTINCT FROM step.completed_at))
    OR (step.action IN ('SAVE','UNAPPROVE') AND (cursor_header->'approvedByAccountId' IS DISTINCT FROM 'null'::jsonb
     OR cursor_header->'approvedByStaffId' IS DISTINCT FROM 'null'::jsonb OR cursor_header->'approvedAt' IS DISTINCT FROM 'null'::jsonb)) THEN
    RAISE EXCEPTION 'RESTORATION_SPARSE_HEADER_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(l.id::text ORDER BY l.id),'[]'::jsonb),count(*) INTO actual_effect_ids,effect_count FROM naijue_erp.inventory_ledger l WHERE l.operation_id=step.operation_id;
   IF jsonb_typeof(step.result_data->'ledgerEntryIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO receipt_effect_ids FROM jsonb_array_elements_text(step.result_data->'ledgerEntryIds');
   SELECT count(*) INTO expected_effects FROM naijue_erp.sales_line ln WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0;
   IF actual_effect_ids IS DISTINCT FROM receipt_effect_ids OR (step.action='SAVE' AND effect_count<>0)
    OR (step.action IN ('APPROVE','UNAPPROVE') AND (effect_count<>expected_effects OR EXISTS(SELECT 1 FROM naijue_erp.sales_line ln
     WHERE ln.sales_id=target AND ln.is_current AND ln.quantity<>0 AND NOT EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l
      WHERE l.operation_id=step.operation_id AND l.source_sales_line_id=ln.id AND l.source_transfer_line_id IS NULL AND l.source_import_batch_id IS NULL
       AND l.endpoint='SALES_WAREHOUSE' AND l.event_kind=step.action AND l.source_document_version=step.new_version
       AND l.warehouse_id=h.warehouse_id AND l.sku_id=ln.sku_id AND l.business_date=h.business_date AND l.posted_at=step.completed_at
       AND l.quantity_delta::numeric=ln.quantity::numeric*CASE step.action WHEN 'APPROVE' THEN -1 ELSE 1 END
       AND ((step.action='APPROVE' AND l.reverses_entry_id IS NULL AND l.baseline_anchor_operation_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version=origin_version AND l.baseline_anchor_operation_id=origin_receipt.id AND l.reverses_entry_id IS NULL)
        OR (step.action='UNAPPROVE' AND expected_version>origin_version AND l.baseline_anchor_operation_id IS NULL AND EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger prior
         WHERE prior.id=l.reverses_entry_id AND prior.operation_id=previous_approval AND prior.source_sales_line_id=ln.id AND prior.event_kind='APPROVE'
          AND prior.quantity_delta::numeric+l.quantity_delta::numeric=0))))))) THEN
    RAISE EXCEPTION 'RESTORATION_EFFECTS_INVALID' USING ERRCODE='23514'; END IF;
   IF step.action='APPROVE' THEN previous_approval:=step.operation_id; END IF;
   expected_version:=step.new_version;previous_time:=step.completed_at;
  END LOOP;
  actual_header:=naijue_erp.unified_sales_header_audit_values(h);
  FOR field IN SELECT jsonb_object_keys(actual_header) LOOP
   IF field IN ('updatedAt','approvedAt') THEN
    IF (cursor_header->>field)::timestamptz IS DISTINCT FROM (actual_header->>field)::timestamptz THEN
     RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
   ELSIF cursor_header->field IS DISTINCT FROM actual_header->field THEN
    RAISE EXCEPTION 'RESTORATION_FINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF expected_version IS DISTINCT FROM h.version OR cursor_header->>'status' IS DISTINCT FROM 'APPROVED'
   OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sales_line ln ON ln.id=l.source_sales_line_id
    LEFT JOIN naijue_erp.operation_receipt rr ON rr.id=l.operation_id WHERE ln.sales_id=target
     AND (rr.target_type IS DISTINCT FROM 'SALES' OR rr.target_id IS DISTINCT FROM target)) THEN
   RAISE EXCEPTION 'RESTORATION_CHAIN_INCOMPLETE' USING ERRCODE='23514'; END IF;
  preserve_missing_original:=true;
 END IF;
$restoration_proof$;
 signature text := 'naijue_erp.validate_sales_settlement()';
 routine oid; before_body text; after_body text; definition text; replacement text; change jsonb; dep jsonb; guard jsonb; dep_row record;
 before_meta jsonb; after_meta jsonb;
BEGIN
 routine:=pg_catalog.to_regprocedure(signature);
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO before_body,before_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_body IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
 IF before_meta->>'prosecdef' IS DISTINCT FROM 'false'
  OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p, LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
   WHERE p.oid=routine AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'RESTORATION_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27]
 THEN RAISE EXCEPTION 'RESTORATION_COHORT_DIFFERS' USING ERRCODE='55000'; END IF;
 FOR dep IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'dependencies') LOOP
  SELECT p.* INTO STRICT dep_row FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(dep->>'signature');
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(dep_row.prosrc,'UTF8')),'hex') IS DISTINCT FROM dep->>'sha256'
   OR dep_row.prosecdef IS DISTINCT FROM (dep->>'security_definer')::boolean
   OR (pg_catalog.to_jsonb(dep_row.proconfig) @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS NOT TRUE
   OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(dep_row.proacl,pg_catalog.acldefault('f',dep_row.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
  THEN RAISE EXCEPTION 'RESTORATION_DEPENDENCY_DIFFERS: %',dep->>'signature' USING ERRCODE='55000'; END IF;
 END LOOP;
 FOR guard IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'triggers') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('naijue_erp.'||(guard->>'table'))
   AND t.tgname=guard->>'name' AND t.tgfoid=pg_catalog.to_regprocedure('naijue_erp.'||(guard->>'function')||'()')
   AND t.tgenabled='O' AND t.tgtype=(guard->>'type')::smallint
   AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgargs=''::bytea AND t.tgattr=''::int2vector
   AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL
   AND CASE WHEN guard->>'name'='unified_ordinary_operation_consistency' THEN t.tgqual IS NOT NULL
    AND split_part(split_part(pg_catalog.pg_get_triggerdef(t.oid,false),' WHEN ',2),' EXECUTE FUNCTION ',1)=$trigger$((new.target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])))$trigger$
    ELSE t.tgqual IS NULL END
   AND t.tgdeferrable=(guard->>'deferred')::boolean AND t.tginitdeferred=(guard->>'deferred')::boolean)
  THEN RAISE EXCEPTION 'RESTORATION_TRIGGER_DIFFERS: %',guard->>'name' USING ERRCODE='55000'; END IF;
 END LOOP;
 definition:=pg_catalog.pg_get_functiondef(routine);after_body:=before_body;
 FOR change IN SELECT value FROM pg_catalog.jsonb_array_elements(spec->'replacements') LOOP
  replacement:=CASE WHEN change->>'after'='$RESTORATION_PROOF' THEN extension||(change->>'before') ELSE change->>'after' END;
  IF coalesce(pg_catalog.length(change->>'before'),0)=0
   OR (pg_catalog.length(after_body)-pg_catalog.length(pg_catalog.replace(after_body,change->>'before','')))/pg_catalog.length(change->>'before')<>1
   OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,change->>'before','')))/pg_catalog.length(change->>'before')<>1
  THEN RAISE EXCEPTION 'RESTORATION_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
  after_body:=pg_catalog.replace(after_body,change->>'before',replacement);
  definition:=pg_catalog.replace(definition,change->>'before',replacement);
 END LOOP;
 IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
 EXECUTE definition;
 SELECT p.prosrc,pg_catalog.to_jsonb(p)-'prosrc' INTO after_body,after_meta FROM pg_catalog.pg_proc p WHERE p.oid=routine;
 IF before_meta IS DISTINCT FROM after_meta
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256'
 THEN RAISE EXCEPTION 'RESTORATION_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
END $historical_original_restoration$;
COMMIT;
