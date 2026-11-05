-- New whole-package verifier. SOURCE ONLY; no engine execution claimed.
BEGIN;
CREATE OR REPLACE FUNCTION naijue_erp.standard_whole_package_verify_v2(init_request jsonb,encoded_scrypt text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $$
DECLARE request jsonb; inspected jsonb; zero_v2 boolean; zero_operation uuid; source_totals jsonb; current_totals jsonb; actor uuid; publication_status jsonb; documents_batch naijue_erp.import_batch%ROWTYPE; baseline naijue_erp.import_batch%ROWTYPE;
 source_counts jsonb:='{}'; verified_documents bigint:=0; changed_documents bigint:=0; verified_inventory_keys bigint:=0; verified_zero_keys bigint:=0; verified_postcutoff_keys bigint:=0; verified_inventory_quantity numeric:=0; counts bigint; kind text; current_version integer; initial_version integer; expected_version integer; steps integer;
 source_row record; header_row record; step record; stock_key record; row_value jsonb; prior_value jsonb; header_expected jsonb; header_actual jsonb; lines_expected jsonb; lines_actual jsonb;
 settlements_expected jsonb; settlements_actual jsonb; retired jsonb; snap jsonb; current_snap jsonb; before_header jsonb; after_header jsonb; field record; evidence_value jsonb;
 proof jsonb; admission record; quantity numeric; ledger_total numeric; effects bigint; balance naijue_erp.inventory_balance%ROWTYPE; has_balance boolean; item record;
 initial_receipt naijue_erp.operation_receipt%ROWTYPE; initial_audit naijue_erp.audit_change%ROWTYPE; initialized jsonb; source_total bigint; expected_counts jsonb;
BEGIN
 inspected:=naijue_erp.standard_whole_package_inspect_v2(init_request,encoded_scrypt);
 IF inspected->>'state' IS DISTINCT FROM 'COMMITTED' OR NOT pg_has_role(session_user,'erp_unified27_importer_2393dbc6db9581c2','SET') THEN RAISE EXCEPTION 'WHOLE_VERIFY_COMMITTED_PACKAGE_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT a.after_values->'request' INTO STRICT request FROM naijue_erp.audit_change a WHERE a.operation_id=(inspected->'summary'->>'operationId')::uuid;
 publication_status:=jsonb_build_object('state','COMMITTED','receipt',inspected->'summary');
 actor:=(init_request->'payload'->'admin'->>'account_id')::uuid;
 IF publication_status->>'state'<>'COMMITTED' OR publication_status->'receipt'->>'phase'<>'DOCUMENT_PUBLISH' OR NOT naijue_erp.standard_business_ready() THEN RAISE EXCEPTION 'STANDARD_VERIFY_PUBLISHED_PACKAGE_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT documents_batch FROM naijue_erp.import_batch WHERE id=(request->>'batch_id')::uuid;
 SELECT * INTO STRICT baseline FROM naijue_erp.import_batch WHERE id=(publication_status->'receipt'->>'baselineBatchId')::uuid;
 SELECT a.after_values->'request'->'payload' INTO STRICT initialized FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.target_type='IMPORT' AND r.target_id=baseline.id AND r.action='IMPORT_INITIALIZE_CURRENT_ADMIN';
 -- Fence every imported header first, then every actual inventory key in the
 -- same global ordering used by ordinary commands. This is a live readback,
 -- not receipt counting and not an attempt to restore original current values.
 FOR header_row IN SELECT h.id FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR header_row IN SELECT h.id FROM naijue_erp.transfer_header h WHERE h.import_batch_id=documents_batch.id ORDER BY h.id FOR SHARE LOOP NULL; END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id
    FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
     LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id
    WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
   PERFORM naijue_erp.inventory_key_lock(stock_key.warehouse_id,stock_key.sku_id);
   PERFORM 1 FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id FOR SHARE;
 END LOOP;
 FOR kind IN SELECT unnest(ARRAY['HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE','INVENTORY_KEY','IMPORT_BATCH']) LOOP
  SELECT count(*) INTO counts FROM naijue_erp.import_record WHERE import_batch_id IN (baseline.id,documents_batch.id) AND target_type=kind AND status='IMPORTED';
  source_counts:=source_counts||jsonb_build_object(kind,counts);
 END LOOP;
 IF source_counts->>'IMPORT_BATCH'<>'3' OR (source_counts->>'INVENTORY_KEY')::numeric<>(baseline.checkpoint->'expected'->>'INVENTORY_KEY')::numeric THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 FOR kind IN SELECT jsonb_object_keys(initialized->'expected_master_counts') LOOP
  IF source_counts->kind IS DISTINCT FROM initialized->'expected_master_counts'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOREACH kind IN ARRAY ARRAY['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'] LOOP
  IF source_counts->kind IS DISTINCT FROM documents_batch.checkpoint->'expected'->kind THEN RAISE EXCEPTION 'STANDARD_VERIFY_DOCUMENT_SOURCE_COUNTS_INVALID' USING ERRCODE='23514'; END IF;
 END LOOP;
 FOR source_row IN SELECT s.* FROM naijue_erp.import_record s WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' ORDER BY s.id LOOP
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF source_row.target_type NOT IN ('INVENTORY_KEY','IMPORT_BATCH','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN
   IF source_row.target_type='SIZE_GROUP_MEMBER' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.size_group_member t WHERE size_group_id=(proof->'fields'->>'size_group_id')::uuid AND size_id=(proof->'fields'->>'size_id')::uuid FOR SHARE;
   ELSIF source_row.target_type='PAYMENT_ACCOUNT_HALL' THEN SELECT to_jsonb(t) INTO row_value FROM naijue_erp.payment_account_hall t WHERE payment_account_id=(proof->'fields'->>'payment_account_id')::uuid AND hall_id=(proof->'fields'->>'hall_id')::uuid FOR SHARE;
   ELSE EXECUTE format('SELECT to_jsonb(t) FROM naijue_erp.%I t WHERE id=$1 FOR SHARE',lower(source_row.target_type COLLATE "C")) INTO row_value USING source_row.target_id; END IF;
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(source_row.target_type COLLATE "C")) INTO prior_value USING proof->'fields';
   IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_MASTER_NATIVE_FACTS_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 FOR source_row IN SELECT * FROM naijue_erp.import_record WHERE import_batch_id=documents_batch.id AND target_type IN ('SALES_HEADER','TRANSFER_HEADER') ORDER BY target_type,target_id LOOP
  kind:=CASE source_row.target_type WHEN 'SALES_HEADER' THEN 'SALES' ELSE 'TRANSFER' END;
  SELECT * INTO STRICT initial_receipt FROM naijue_erp.operation_receipt WHERE target_type=kind AND target_id=source_row.target_id AND action='MIGRATE_DOCUMENT';
  SELECT * INTO STRICT initial_audit FROM naijue_erp.audit_change WHERE operation_id=initial_receipt.id;
  snap:=initial_audit.after_values-ARRAY['baseline','sourceRecordId'];current_snap:=naijue_erp.unified_document_snapshot(kind,source_row.target_id);
  initial_version:=initial_audit.new_version;current_version:=(current_snap->'header'->>'version')::integer;expected_version:=initial_version;steps:=0;retired:='{}';
  IF initial_receipt.actor_account_id<>initial_audit.actor_account_id OR initial_audit.old_version IS NOT NULL OR initial_audit.before_values IS NOT NULL
   OR initial_receipt.result_data->>'exposureDigest' IS DISTINCT FROM encode(sha256(convert_to(snap::text,'UTF8')),'hex')
   OR initial_audit.after_values->>'sourceRecordId'<>source_row.id::text OR current_version<initial_version THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORIGINAL_MIGRATION_INVALID' USING ERRCODE='23514'; END IF;
  proof:=naijue_erp.standard_import_record_proof(source_row.id);
  IF kind='SALES' THEN
   row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
  ELSE row_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,proof->'fields'));prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header')); END IF;
  IF row_value IS DISTINCT FROM prior_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_HEADER_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'lines') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type=kind||'_LINE' AND s.target_id=(row_value->>'id')::uuid;
   IF kind='SALES' THEN prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,proof->'fields'));evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_line,row_value));
   ELSE prior_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,proof->'fields'))-'current_line_no';evidence_value:=to_jsonb(jsonb_populate_record(NULL::naijue_erp.transfer_line,row_value))-'current_line_no'; END IF;
   IF prior_value IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_LINE_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(snap->'settlements') LOOP
   SELECT naijue_erp.standard_import_record_proof(s.id) INTO STRICT proof FROM naijue_erp.import_record s WHERE s.import_batch_id=documents_batch.id AND s.target_type='SALES_SETTLEMENT' AND s.target_id=(row_value->>'id')::uuid;
   IF to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,proof->'fields')) IS DISTINCT FROM to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_settlement,row_value)) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SOURCE_TO_ORIGINAL_SETTLEMENT_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR field IN SELECT unnest(ARRAY['id','number','stock_basis','import_batch_id','created_by_account_id','created_by_staff_id','created_hall_id','created_at']) key LOOP
   IF current_snap->'header'->field.key IS DISTINCT FROM snap->'header'->field.key THEN RAISE EXCEPTION 'STANDARD_VERIFY_IMMUTABLE_DOCUMENT_ORIGIN_DIFFERS' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF kind='SALES' THEN
   header_expected:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,snap->'header'));
   header_actual:=naijue_erp.unified_sales_header_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_line_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.unified_sales_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.sales_line l WHERE sales_id=source_row.target_id;
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.unified_sales_settlement_audit_values(jsonb_populate_record(NULL::naijue_erp.sales_settlement,v))),'{}') INTO settlements_expected FROM jsonb_array_elements(snap->'settlements') v;
   SELECT coalesce(jsonb_object_agg(s.id::text,naijue_erp.unified_sales_settlement_audit_values(s)),'{}') INTO settlements_actual FROM naijue_erp.sales_settlement s WHERE sales_id=source_row.target_id;
  ELSE
   header_expected:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,snap->'header'));
   header_actual:=naijue_erp.transfer_header_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_header,current_snap->'header'));
   SELECT coalesce(jsonb_object_agg(v->>'id',naijue_erp.transfer_line_audit_values(jsonb_populate_record(NULL::naijue_erp.transfer_line,v))),'{}') INTO lines_expected FROM jsonb_array_elements(snap->'lines') v;
   SELECT coalesce(jsonb_object_agg(l.id::text,naijue_erp.transfer_line_audit_values(l)),'{}') INTO lines_actual FROM naijue_erp.transfer_line l WHERE transfer_id=source_row.target_id;
   settlements_expected:='{}';settlements_actual:='{}';
   IF current_snap->'header'->'created_role' IS DISTINCT FROM snap->'header'->'created_role' THEN RAISE EXCEPTION 'STANDARD_VERIFY_CREATION_ROLE_DIFFERS' USING ERRCODE='23514'; END IF;
  END IF;
  FOR step IN SELECT a.*,r.actor_account_id receipt_actor,r.action receipt_action,r.target_type receipt_kind,r.target_id receipt_target,r.completed_at,r.result_data,r.status receipt_status
   FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type=kind AND a.object_id=source_row.target_id AND a.new_version>initial_version AND a.new_version<=current_version ORDER BY a.new_version LOOP
   IF step.old_version IS DISTINCT FROM expected_version OR step.new_version<>expected_version+1 OR step.action NOT IN ('SAVE','APPROVE','UNAPPROVE','VOID') OR step.action<>step.receipt_action
    OR step.receipt_kind<>kind OR step.receipt_target<>source_row.target_id OR step.actor_account_id<>step.receipt_actor OR step.receipt_status<>'COMMITTED'
    OR step.occurred_at IS DISTINCT FROM step.completed_at OR step.result_data->>'version'<>step.new_version::text THEN RAISE EXCEPTION 'STANDARD_VERIFY_ORDINARY_CHAIN_INVALID' USING ERRCODE='23514'; END IF;
   before_header:=step.before_values->'header';after_header:=step.after_values->'header';
   FOR field IN SELECT * FROM jsonb_each(before_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    IF header_expected->field.key IS DISTINCT FROM evidence_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_HEADER_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR field IN SELECT * FROM jsonb_each(after_header) LOOP
    evidence_value:=field.value;
    IF field.key IN ('updatedAt','approvedAt') THEN evidence_value:=coalesce(to_jsonb((evidence_value#>>'{}')::timestamptz),'null'); END IF;
    header_expected:=jsonb_set(header_expected,ARRAY[field.key],evidence_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) LOOP
    IF lines_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'lines','[]')) LOOP
    IF lines_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'lines','[]')) v WHERE v->>'id'=row_value->>'id') THEN RAISE EXCEPTION 'STANDARD_VERIFY_LINE_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    lines_expected:=jsonb_set(lines_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) LOOP
    IF settlements_expected->(row_value->>'id') IS DISTINCT FROM row_value THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_BEFORE_DIFFERS' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id') THEN
     settlements_expected:=settlements_expected-(row_value->>'id');retired:=retired||jsonb_build_object(row_value->>'id',true);
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(coalesce(step.after_values->'settlements','[]')) LOOP
    IF retired ? (row_value->>'id') OR (settlements_expected ? (row_value->>'id') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(step.before_values->'settlements','[]')) v WHERE v->>'id'=row_value->>'id')) THEN RAISE EXCEPTION 'STANDARD_VERIFY_SETTLEMENT_IDENTITY_REBOUND' USING ERRCODE='23514'; END IF;
    settlements_expected:=jsonb_set(settlements_expected,ARRAY[row_value->>'id'],row_value);
   END LOOP;
   expected_version:=step.new_version;steps:=steps+1;
  END LOOP;
  IF expected_version<>current_version OR header_expected IS DISTINCT FROM header_actual OR lines_expected IS DISTINCT FROM lines_actual OR settlements_expected IS DISTINCT FROM settlements_actual THEN
   RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_NATIVE_PROJECTION_DIFFERS' USING ERRCODE='23514'; END IF;
  IF steps=0 AND current_snap IS DISTINCT FROM snap THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNCHANGED_NATIVE_SNAPSHOT_DIFFERS' USING ERRCODE='23514'; END IF;
  verified_documents:=verified_documents+1;
  IF steps>0 THEN changed_documents:=changed_documents+1; END IF;
 END LOOP;
 FOR stock_key IN
  SELECT DISTINCT k.warehouse_id,k.sku_id FROM (
   SELECT (p->'fields'->>'warehouse_id')::uuid warehouse_id,(p->'fields'->>'sku_id')::uuid sku_id FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p WHERE s.import_batch_id=baseline.id AND s.target_type='INVENTORY_KEY'
   UNION ALL SELECT l.warehouse_id,l.sku_id FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.sales_line sl ON sl.id=l.source_sales_line_id LEFT JOIN naijue_erp.sales_header sh ON sh.id=sl.sales_id
    LEFT JOIN naijue_erp.transfer_line tl ON tl.id=l.source_transfer_line_id LEFT JOIN naijue_erp.transfer_header th ON th.id=tl.transfer_id WHERE sh.import_batch_id=documents_batch.id OR th.import_batch_id=documents_batch.id
  ) k ORDER BY k.warehouse_id,k.sku_id LOOP
  proof:=naijue_erp.standard_inventory_key_proof(stock_key.warehouse_id,stock_key.sku_id);
  IF proof->>'state'='UNKNOWN' THEN
   SELECT * INTO STRICT admission FROM naijue_erp.inventory_key_admission(stock_key.warehouse_id,stock_key.sku_id);
   IF admission.admitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'STANDARD_VERIFY_UNPROVEN_KEY_UNKNOWN_NOT_ZERO' USING ERRCODE='23514'; END IF;
   quantity:=NULL;proof:=jsonb_build_object('state','POST_CUTOFF_NATIVE');
  ELSE quantity:=(proof->'fields'->>'quantity')::numeric; END IF;
  zero_v2:=false;zero_operation:=NULL;
  IF proof->>'state'='EXPLICIT_ZERO' THEN
   zero_operation:=(proof->>'operation_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
     WHERE a.operation_id=zero_operation AND a.after_values->'whole_package_v2'->>'root_operation'=init_request->>'operation_id'
       AND r.target_id=baseline.id AND r.action='IMPORT_CHUNK' AND r.status='COMMITTED'
       AND a.after_values->>'phase'='KEYS' AND a.actor_account_id=r.actor_account_id)
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND l.event_kind='CUTOFF_BASELINE')
   THEN RAISE EXCEPTION 'WHOLE_ZERO_VERIFY_ROOT_REQUIRED' USING ERRCODE='23514'; END IF;
   zero_v2:=true;
  END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO ledger_total,effects FROM naijue_erp.inventory_ledger WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l LEFT JOIN naijue_erp.operation_receipt r ON r.id=l.operation_id LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id
   WHERE l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND (r.id IS NULL OR a.operation_id IS NULL OR r.status<>'COMMITTED' OR a.actor_account_id<>r.actor_account_id OR a.object_id<>r.target_id
    OR a.object_type<>r.target_type OR a.action<>r.action OR a.occurred_at IS DISTINCT FROM r.completed_at OR NOT(r.result_data->'ledgerEntryIds' ? l.id::text))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_LEDGER_OPERATION_PROOF_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO balance FROM naijue_erp.inventory_balance WHERE warehouse_id=stock_key.warehouse_id AND sku_id=stock_key.sku_id;has_balance:=FOUND;
  IF (effects=0 AND (NOT zero_v2 OR NOT has_balance OR balance.quantity<>0 OR balance.version<>1 OR balance.last_operation_id IS DISTINCT FROM zero_operation OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.id=zero_operation AND r.completed_at=balance.updated_at))) OR (effects>0 AND (NOT has_balance OR balance.quantity::numeric<>ledger_total OR balance.version::numeric<>effects+CASE WHEN zero_v2 THEN 1 ELSE 0 END
   OR NOT EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.inventory_ledger l ON l.operation_id=r.id WHERE r.id=balance.last_operation_id AND l.warehouse_id=stock_key.warehouse_id AND l.sku_id=stock_key.sku_id AND r.completed_at=balance.updated_at))) THEN RAISE EXCEPTION 'STANDARD_VERIFY_CURRENT_BALANCE_LEDGER_DIFFERS' USING ERRCODE='23514'; END IF;
  verified_inventory_keys:=verified_inventory_keys+1;
  IF proof->>'state'='EXPLICIT_ZERO' THEN verified_zero_keys:=verified_zero_keys+1; END IF;
  IF proof->>'state'='POST_CUTOFF_NATIVE' THEN verified_postcutoff_keys:=verified_postcutoff_keys+1; END IF;
  IF has_balance THEN verified_inventory_quantity:=verified_inventory_quantity+balance.quantity; END IF;
 END LOOP;
 -- Numeric totals are exact decimal text. Source totals remain the original
 -- imported snapshot; current totals may legitimately differ after verified edits.
 SELECT jsonb_build_object('inventory_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='INVENTORY_KEY'),0)::text,
 'sales_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='SALES_LINE'),0)::text,
 'sales_line_amount',coalesce(sum((p->'fields'->>'line_amount')::numeric) FILTER(WHERE s.target_type='SALES_LINE'),0)::text,
 'sales_net_due',coalesce(sum((p->'fields'->>'net_due')::numeric) FILTER(WHERE s.target_type='SALES_HEADER'),0)::text,
 'sales_settlement_amount',coalesce(sum((p->'fields'->>'amount')::numeric) FILTER(WHERE s.target_type='SALES_SETTLEMENT'),0)::text,
 'transfer_quantity',coalesce(sum((p->'fields'->>'quantity')::numeric) FILTER(WHERE s.target_type='TRANSFER_LINE'),0)::text)
 INTO source_totals FROM naijue_erp.import_record s CROSS JOIN LATERAL naijue_erp.standard_import_record_proof(s.id) p
 WHERE s.import_batch_id IN (baseline.id,documents_batch.id) AND s.status='IMPORTED' AND s.target_type IN ('INVENTORY_KEY','SALES_LINE','SALES_HEADER','SALES_SETTLEMENT','TRANSFER_LINE');
 SELECT jsonb_build_object('inventory_quantity',verified_inventory_quantity::text,
 'sales_quantity',(SELECT coalesce(sum(l.quantity::numeric),0)::text FROM naijue_erp.sales_line l JOIN naijue_erp.sales_header h ON h.id=l.sales_id WHERE h.import_batch_id=documents_batch.id),
 'sales_line_amount',(SELECT coalesce(sum(l.line_amount),0)::text FROM naijue_erp.sales_line l JOIN naijue_erp.sales_header h ON h.id=l.sales_id WHERE h.import_batch_id=documents_batch.id),
 'sales_net_due',(SELECT coalesce(sum(h.net_due),0)::text FROM naijue_erp.sales_header h WHERE h.import_batch_id=documents_batch.id),
 'sales_settlement_amount',(SELECT coalesce(sum(s.amount),0)::text FROM naijue_erp.sales_settlement s JOIN naijue_erp.sales_header h ON h.id=s.sales_id WHERE h.import_batch_id=documents_batch.id),
 'transfer_quantity',(SELECT coalesce(sum(l.quantity::numeric),0)::text FROM naijue_erp.transfer_line l JOIN naijue_erp.transfer_header h ON h.id=l.transfer_id WHERE h.import_batch_id=documents_batch.id)) INTO current_totals;
 RETURN jsonb_build_object('protocol','STANDARD_IMPORT_SQL_V1','plan_sha256',request->>'plan_sha256','batch_id',documents_batch.id,'baseline_batch_id',baseline.id,'verified',true,'document_summary',jsonb_build_object('verified_count',verified_documents,'changed_after_import_count',changed_documents),'source_counts',source_counts,
  'inventory_summary',jsonb_build_object('verified_key_count',verified_inventory_keys),'source_totals',source_totals,'current_totals',current_totals,'unknown_keys_materialized',false,'inventory_coverage',jsonb_build_object('scope','EXPLICIT_SOURCE_KEYS_PLUS_VERIFIED_POST_CUTOFF_EFFECT_KEYS','explicit_source_keys',(source_counts->>'INVENTORY_KEY')::bigint,'explicit_zero_keys',verified_zero_keys,'post_cutoff_effect_keys',verified_postcutoff_keys,'unknown_combinations_not_enumerated',true,'complete_total_inventory',false),'verification_profile','STANDARD_WHOLE_PACKAGE_VERIFY_V2','scope','CURRENT_NATIVE_AND_IMMUTABLE_IMPORT_PROOF_FENCED','proof_scope','SET_ROLE_ONLY_NOT_NONOWNER_LOGIN');
END $$;
REVOKE ALL ON FUNCTION naijue_erp.standard_whole_package_verify_v2(jsonb,text) FROM PUBLIC;
COMMIT;
