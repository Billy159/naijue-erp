-- C01 H01-H08 numeric-only successor. SQL SOURCE, engine acceptance NOT_RUN.
-- C owns SQL review, actual apply, metadata and coordinated PostgreSQL tests.
-- No new columns/tables, historical source mutation, backfill or business seed.
BEGIN;
DO $$
DECLARE rel regclass; col text; name text; old_expression text;
BEGIN
  FOR rel,col,name IN SELECT * FROM (VALUES
    ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_target_kind'),
    ('naijue_erp.audit_change'::regclass,'object_type','audit_object_kind')) x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (((%s) OR %I IN (''HISTORY_SALES'',''HISTORY_TRANSFER'')) IS TRUE)',rel,name,old_expression,col);
  END LOOP;
  FOR rel,col,name IN SELECT * FROM (VALUES
    ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),
    ('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((CASE WHEN %I IN (''HISTORY_SALES'',''HISTORY_TRANSFER'') THEN action=''HISTORY_REVISE'' ELSE (%s) END) IS TRUE)',rel,name,col,old_expression);
  END LOOP;
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
  ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
  EXECUTE format($check$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE
    WHEN target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN
      jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','dataset','kind','documentId','revisionId','version','ledgerEntryIds']
      AND result_data-ARRAY['operationId','dataset','kind','documentId','revisionId','version','ledgerEntryIds']='{}'::jsonb
      AND result_data->>'operationId'=id::text AND result_data->>'dataset'='HISTORY'
      AND result_data->>'kind'=CASE target_type WHEN 'HISTORY_SALES' THEN 'sales' ELSE 'transfers' END
      AND result_data->>'documentId'=target_id::text AND jsonb_typeof(result_data->'revisionId')='string'
      AND result_data->>'revisionId' ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      AND jsonb_typeof(result_data->'version')='number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
      AND (result_data->>'version')::numeric BETWEEN 2 AND 2147483647 AND jsonb_typeof(result_data->'ledgerEntryIds')='array'
    ELSE (%s) END) IS TRUE)$check$,old_expression);
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.inventory_ledger'::regclass AND conname='ledger_event_kind';
  ALTER TABLE naijue_erp.inventory_ledger DROP CONSTRAINT ledger_event_kind;
  EXECUTE format('ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT ledger_event_kind CHECK (((%s) OR event_kind=''HISTORY_REVISION'') IS TRUE)',old_expression);
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint
    WHERE conrelid='naijue_erp.inventory_ledger'::regclass AND conname='ledger_closed_source';
  ALTER TABLE naijue_erp.inventory_ledger DROP CONSTRAINT ledger_closed_source;
  EXECUTE format($check$ALTER TABLE naijue_erp.inventory_ledger ADD CONSTRAINT ledger_closed_source CHECK (((
    (%s) AND source_history_revision_id IS NULL AND source_history_sales_line_id IS NULL AND source_history_transfer_line_id IS NULL)
    OR (event_kind='HISTORY_REVISION' AND source_history_revision_id IS NOT NULL AND source_import_batch_id IS NULL
      AND source_sales_line_id IS NULL AND source_transfer_line_id IS NULL AND reverses_entry_id IS NULL AND source_document_version>1
      AND ((source_history_sales_line_id IS NOT NULL AND source_history_transfer_line_id IS NULL AND endpoint='SALES_WAREHOUSE')
        OR (source_history_sales_line_id IS NULL AND source_history_transfer_line_id IS NOT NULL AND endpoint IN ('FROM','TO'))))) IS TRUE)$check$,old_expression);
END $$;
ALTER TABLE naijue_erp.inventory_ledger
  ADD CONSTRAINT history_sales_operation_endpoint UNIQUE(operation_id,source_history_sales_line_id,endpoint),
  ADD CONSTRAINT history_transfer_operation_endpoint UNIQUE(operation_id,source_history_transfer_line_id,endpoint);

-- Complete original/effective facts. This helper never changes the immutable source.
CREATE FUNCTION naijue_erp.history_numeric_current_facts(kind text,target uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h jsonb; d record; e jsonb; lines jsonb; settlements jsonb; result jsonb; document_version integer;
BEGIN
  IF kind='SALES' THEN
    SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.history_sales_header x WHERE x.id=target FOR UPDATE;
    SELECT to_jsonb(x) INTO e FROM naijue_erp.history_sales_effective x WHERE x.header_id=target FOR UPDATE;
  ELSIF kind='TRANSFER' THEN
    SELECT to_jsonb(x) INTO STRICT h FROM naijue_erp.history_transfer_header x WHERE x.id=target FOR UPDATE;
    SELECT to_jsonb(x) INTO e FROM naijue_erp.history_transfer_effective x WHERE x.header_id=target FOR UPDATE;
  ELSE RAISE EXCEPTION 'Actual historical document kind required' USING ERRCODE='23514'; END IF;
  document_version:=coalesce((e->>'version')::integer,(h->>'version')::integer);
  SELECT md.typed_document_sha256,md.line_count,md.settlement_count,r.id AS published_operation_id INTO STRICT d
    FROM naijue_erp.import_batch b JOIN naijue_erp.import_history_closure_manifest m ON m.batch_id=b.id
    JOIN naijue_erp.import_history_document_manifest md ON md.batch_id=b.id AND md.document_kind=kind
      AND (CASE kind WHEN 'SALES' THEN md.sales_header_id ELSE md.transfer_header_id END)=target
      AND md.header_source_row_id=(h->>'source_row_id')::uuid
    JOIN naijue_erp.import_record f ON f.import_batch_id=b.id AND f.target_type='IMPORT_BATCH' AND f.target_id=b.id
    JOIN naijue_erp.import_record_accounting_claim c ON c.import_batch_id=b.id AND c.import_record_id=f.id AND c.target_type=f.target_type AND c.target_id=f.target_id
    JOIN naijue_erp.operation_receipt r ON r.id=c.operation_id JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    WHERE b.id=(h->>'batch_id')::uuid AND b.mapping_version='V2_HISTORY_NULLABLE_1' AND b.inventory_mode='CUTOFF_STOCK_BASELINE'
      AND b.status='IMPORTED' AND b.completed_at IS NOT NULL AND b.history_validation_passed IS TRUE
      AND b.history_actual_counts=b.history_expected_counts AND b.checkpoint->'counts'=b.checkpoint->'expected'
      AND b.checkpoint->'counts'->>'IMPORT_BATCH'='1' AND m.validator_version='HISTORY_TYPED_CLOSURE_V1'
      AND m.selection_sha256=b.source_hash AND m.authorized_payload_hash=b.history_payload_hash AND m.expected_counts=b.history_expected_counts
      AND m.document_count=(SELECT count(*) FROM naijue_erp.import_history_document_manifest x WHERE x.batch_id=b.id)
      AND f.status='IMPORTED' AND f.source_entity_type='INVENTORY_SCOPE_APPROVAL' AND f.source_key='FINAL_COMPLETE_SCOPE'
      AND f.source_record_hash=b.source_hash AND f.source_file_ref=b.source_manifest_ref
      AND f.decision_reason='COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
      AND c.checkpoint_sequence=(b.checkpoint->>'sequence')::integer AND r.target_type='IMPORT' AND r.target_id=b.id
      AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED' AND r.result_data->>'status'='IMPORTED'
      AND r.result_data->>'batchId'=b.id::text AND r.result_data->>'sequence'=b.checkpoint->>'sequence' AND r.result_data->>'cursor'=b.checkpoint->>'cursor'
      AND a.object_type='IMPORT' AND a.object_id=b.id AND a.action=r.action AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
      AND b.xmin::text::bigint<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
      AND r.xmin::text::bigint<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    FOR SHARE OF b,m,md,f,c,r,a;
  IF e IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision x WHERE x.id=(e->>'revision_id')::uuid
    AND x.document_kind=kind AND (CASE kind WHEN 'SALES' THEN x.sales_id ELSE x.transfer_id END)=target
    AND x.to_version=document_version AND x.to_version=x.from_version+1 AND x.operation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Original effective head has no exact revision' USING ERRCODE='23514'; END IF;
  IF kind='SALES' THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l JOIN naijue_erp.history_sales_line_effective v ON v.line_id=l.id
      LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE l.header_id=target
      AND (x.id IS NULL OR x.document_kind<>'SALES' OR x.sales_id<>target OR x.transfer_id IS NOT NULL OR x.to_version>document_version))
      OR EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement s JOIN naijue_erp.history_sales_settlement_effective v ON v.settlement_id=s.id
        LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE s.header_id=target
        AND (x.id IS NULL OR x.document_kind<>'SALES' OR x.sales_id<>target OR x.transfer_id IS NOT NULL OR x.to_version>document_version)) THEN
      RAISE EXCEPTION 'Foreign or future effective row' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',l.id,'skuId',l.sku_id,'quantity',coalesce(v.quantity,l.quantity)::text,
      'dealPrice',coalesce(v.deal_price,l.deal_price)::text,'lineAmount',coalesce(v.line_amount,l.line_amount)::text,
      'allocatedDiscount',(CASE WHEN v.line_id IS NULL THEN l.allocated_discount ELSE v.allocated_discount END)::text) ORDER BY l.line_no,l.id),'[]') INTO lines
      FROM naijue_erp.history_sales_line l LEFT JOIN naijue_erp.history_sales_line_effective v ON v.line_id=l.id WHERE l.header_id=target;
    SELECT coalesce(jsonb_agg(jsonb_build_object('settlementId',s.id,'direction',s.direction,'amount',coalesce(v.amount,s.amount)::text) ORDER BY s.line_no,s.id),'[]') INTO settlements
      FROM naijue_erp.history_sales_settlement s LEFT JOIN naijue_erp.history_sales_settlement_effective v ON v.settlement_id=s.id WHERE s.header_id=target;
  ELSE
    IF EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l JOIN naijue_erp.history_transfer_line_effective v ON v.line_id=l.id
      LEFT JOIN naijue_erp.history_revision x ON x.id=v.revision_id WHERE l.header_id=target
      AND (x.id IS NULL OR x.document_kind<>'TRANSFER' OR x.transfer_id<>target OR x.sales_id IS NOT NULL OR x.to_version>document_version)) THEN
      RAISE EXCEPTION 'Foreign or future effective row' USING ERRCODE='23514'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',l.id,'skuId',l.sku_id,'quantity',coalesce(v.quantity,l.quantity)::text) ORDER BY l.line_no,l.id),'[]') INTO lines
      FROM naijue_erp.history_transfer_line l LEFT JOIN naijue_erp.history_transfer_line_effective v ON v.line_id=l.id WHERE l.header_id=target;
    settlements:='[]';
  END IF;
  IF jsonb_array_length(lines)<>d.line_count OR d.line_count NOT BETWEEN 1 AND 10000
    OR jsonb_array_length(settlements)<>d.settlement_count OR d.settlement_count NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Complete bounded original line and settlement set required' USING ERRCODE='23514'; END IF;
  result:=jsonb_build_object('kind',CASE kind WHEN 'SALES' THEN 'sales' ELSE 'transfers' END,'documentId',target,'version',document_version,
    'previousRevisionId',e->>'revision_id','importBatchId',h->>'batch_id','publishedOperationId',d.published_operation_id,'documentManifestHash',d.typed_document_sha256,
    'sourceStatus',h->>'source_status','baselineEffect',CASE h->>'source_status' WHEN 'APPROVED' THEN 'INCLUDED_APPROVED' ELSE 'EXCLUDED_NOT_EFFECTIVE' END,
    'businessDate',h->>'business_date','warehouseId',CASE kind WHEN 'SALES' THEN h->>'warehouse_id' ELSE NULL END,
    'fromWarehouseId',CASE kind WHEN 'TRANSFER' THEN h->>'from_warehouse_id' ELSE NULL END,'toWarehouseId',CASE kind WHEN 'TRANSFER' THEN h->>'to_warehouse_id' ELSE NULL END,
    'lines',lines,'totals',CASE kind WHEN 'SALES' THEN jsonb_build_object('grossAmount',coalesce(e->>'gross_amount',(h->>'gross_amount')::numeric(18,2)::text),
      'orderDiscount',coalesce(e->>'order_discount',(h->>'order_discount')::numeric(18,2)::text),'netDue',coalesce(e->>'net_due',(h->>'net_due')::numeric(18,2)::text)) ELSE NULL END,'settlements',settlements);
  -- jsonb numeric head values lose scale; make the money strings canonical.
  IF kind='SALES' AND e IS NOT NULL THEN result:=jsonb_set(result,'{totals}',jsonb_build_object('grossAmount',(e->>'gross_amount')::numeric(18,2)::text,
    'orderDiscount',(e->>'order_discount')::numeric(18,2)::text,'netDue',(e->>'net_due')::numeric(18,2)::text)); END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.history_numeric_current_facts(text,uuid) FROM PUBLIC;

CREATE FUNCTION naijue_erp.history_numeric_money(value jsonb,nonnegative boolean DEFAULT false) RETURNS numeric LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE amount text;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact original money string required' USING ERRCODE='23514'; END IF;
  amount:=value #>> '{}';
  IF amount !~ '^-?(0|[1-9][0-9]{0,15})\.[0-9]{2}$' OR amount='-0.00' OR (nonnegative AND amount LIKE '-%') THEN
    RAISE EXCEPTION 'Exact bounded yuan amount required' USING ERRCODE='23514'; END IF;
  RETURN amount::numeric(18,2);
END $$;
REVOKE ALL ON FUNCTION naijue_erp.history_numeric_money(jsonb,boolean) FROM PUBLIC;

-- Keep the existing closed trigger attached; replace it with complete admission.
CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE actual jsonb; old_line jsonb; next_line jsonb; old_settlement jsonb; next_settlement jsonb;
  actor record; source_header jsonb; item record; effect jsonb; evidence jsonb; expected_effects integer:=0;
  difference numeric; old_effect numeric; next_effect numeric; money_changed boolean:=false; settled numeric;
  target uuid; action_kind text; size_before integer; effect_count integer; ledger_ids jsonb;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History revisions are append-only' USING ERRCODE='23514'; END IF;
  target:=CASE NEW.document_kind WHEN 'SALES' THEN NEW.sales_id WHEN 'TRANSFER' THEN NEW.transfer_id END;
  action_kind:=CASE NEW.document_kind WHEN 'SALES' THEN 'sales' WHEN 'TRANSFER' THEN 'transfers' END;
  IF target IS NULL OR NEW.operation_id IS NULL OR NEW.operation_id=NEW.id OR length(NEW.request_key) NOT BETWEEN 1 AND 200
    OR length(btrim(NEW.reason)) NOT BETWEEN 1 AND 2000 OR NEW.to_version<>NEW.from_version+1 THEN
    RAISE EXCEPTION 'Original bounded historical revision identity required' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:receipt:['||to_json(NEW.actor_account_id::text)::text||','||to_json(NEW.request_key)::text||']',0));
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:history:'||action_kind||':'||target::text,0));
  actual:=naijue_erp.history_numeric_current_facts(NEW.document_kind,target);
  IF NEW.before_facts IS DISTINCT FROM actual OR (actual->>'version')::integer<>NEW.from_version THEN
    RAISE EXCEPTION 'Locked original effective version changed' USING ERRCODE='40001'; END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT actor FROM naijue_erp.user_account a
    JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职' OR actor.role NOT IN ('ADMIN','WAREHOUSE','SALESPERSON') THEN
    RAISE EXCEPTION 'Current historical correction actor unavailable' USING ERRCODE='42501'; END IF;
  IF actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current hall unavailable' USING ERRCODE='42501'; END IF;
  ELSIF actor.role='SALESPERSON' THEN RAISE EXCEPTION 'Salesperson hall required' USING ERRCODE='42501'; END IF;
  IF NEW.document_kind='SALES' THEN
    SELECT to_jsonb(h) INTO STRICT source_header FROM naijue_erp.history_sales_header h WHERE h.id=target;
    IF actor.role='SALESPERSON' AND source_header->>'hall_id' IS DISTINCT FROM actor.hall_id::text THEN
      RAISE EXCEPTION 'History sales outside current hall' USING ERRCODE='42501'; END IF;
  ELSE
    SELECT to_jsonb(h) INTO STRICT source_header FROM naijue_erp.history_transfer_header h WHERE h.id=target;
    IF actor.role='SALESPERSON' AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
      WHERE w.id IN ((source_header->>'from_warehouse_id')::uuid,(source_header->>'to_warehouse_id')::uuid) AND w.hall_id=actor.hall_id)
      AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text
        AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
      RAISE EXCEPTION 'History transfer outside current hall' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.stock_effect_basis<>'CUTOFF_BASELINE_DELTA_V1' OR NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements']
      IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements']
    OR NEW.after_facts->'version' IS DISTINCT FROM to_jsonb(NEW.to_version) OR NEW.after_facts->>'previousRevisionId' IS DISTINCT FROM NEW.id::text
    OR jsonb_typeof(NEW.after_facts->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.after_facts->'settlements') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'History correction cannot change source identity, scope, status or time' USING ERRCODE='23514'; END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId'] IS NOT DISTINCT FROM actual-ARRAY['version','previousRevisionId'] THEN
    RAISE EXCEPTION 'Empty historical correction' USING ERRCODE='23514'; END IF;
  size_before:=jsonb_array_length(actual->'lines');
  IF jsonb_array_length(NEW.after_facts->'lines')<>size_before OR jsonb_array_length(NEW.after_facts->'settlements')<>jsonb_array_length(actual->'settlements') THEN
    RAISE EXCEPTION 'Cannot add or remove original historical rows' USING ERRCODE='23514'; END IF;
  evidence:=NEW.stock_effect_evidence;
  IF evidence-ARRAY['schemaVersion','importBatchId','publishedOperationId','documentManifestHash','previousRevisionId','oldEffectiveVersion','newEffectiveVersion','sourceStatus','effects','ledgerEntryIds']<>'{}'
    OR evidence->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR evidence->'importBatchId' IS DISTINCT FROM actual->'importBatchId'
    OR evidence->'publishedOperationId' IS DISTINCT FROM actual->'publishedOperationId' OR evidence->'documentManifestHash' IS DISTINCT FROM actual->'documentManifestHash'
    OR evidence->'previousRevisionId' IS DISTINCT FROM actual->'previousRevisionId' OR evidence->'oldEffectiveVersion' IS DISTINCT FROM actual->'version'
    OR evidence->'newEffectiveVersion' IS DISTINCT FROM to_jsonb(NEW.to_version) OR evidence->'sourceStatus' IS DISTINCT FROM actual->'sourceStatus'
    OR jsonb_typeof(evidence->'effects') IS DISTINCT FROM 'array' OR jsonb_typeof(evidence->'ledgerEntryIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Exact original publication and effective version evidence required' USING ERRCODE='23514'; END IF;
  FOR item IN SELECT value,ordinality FROM jsonb_array_elements(actual->'lines') WITH ORDINALITY LOOP
    old_line:=item.value;next_line:=NEW.after_facts->'lines'->(item.ordinality::integer-1);
    IF jsonb_typeof(next_line) IS DISTINCT FROM 'object' OR next_line-ARRAY['quantity','dealPrice','lineAmount','allocatedDiscount']
      IS DISTINCT FROM old_line-ARRAY['quantity','dealPrice','lineAmount','allocatedDiscount'] OR jsonb_typeof(next_line->'quantity') IS DISTINCT FROM 'string'
      OR (next_line->>'quantity') !~ '^-?(0|[1-9][0-9]*)$' OR (next_line->>'quantity')::bigint::text<>next_line->>'quantity' THEN
      RAISE EXCEPTION 'Only original line numeric values may change' USING ERRCODE='23514'; END IF;
    IF NEW.document_kind='SALES' THEN
      PERFORM naijue_erp.history_numeric_money(next_line->'dealPrice',true),naijue_erp.history_numeric_money(next_line->'lineAmount');
      IF next_line->'allocatedDiscount' IS DISTINCT FROM 'null'::jsonb THEN PERFORM naijue_erp.history_numeric_money(next_line->'allocatedDiscount',true); END IF;
      IF next_line-'quantity' IS DISTINCT FROM old_line-'quantity' THEN money_changed:=true; END IF;
    ELSIF next_line-ARRAY['lineId','skuId','quantity']<>'{}'::jsonb THEN
      RAISE EXCEPTION 'Transfer supports only original quantity corrections' USING ERRCODE='23514'; END IF;
    difference:=(next_line->>'quantity')::numeric-(old_line->>'quantity')::numeric;
    IF actual->>'sourceStatus'='APPROVED' AND difference<>0 THEN
      IF actual->'businessDate'='null'::jsonb THEN RAISE EXCEPTION 'Original business date required for a stock delta' USING ERRCODE='23514'; END IF;
      expected_effects:=expected_effects+CASE NEW.document_kind WHEN 'SALES' THEN 1 ELSE 2 END;
    END IF;
  END LOOP;
  IF NEW.document_kind='SALES' THEN
    IF NEW.after_facts->'totals'-ARRAY['grossAmount','orderDiscount','netDue']<>'{}'::jsonb THEN RAISE EXCEPTION 'Exact original totals fields required' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'grossAmount'),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'orderDiscount',true),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'netDue');
    money_changed:=money_changed OR NEW.after_facts->'totals' IS DISTINCT FROM actual->'totals';
    settled:=0;
    FOR item IN SELECT value,ordinality FROM jsonb_array_elements(actual->'settlements') WITH ORDINALITY LOOP
      old_settlement:=item.value;next_settlement:=NEW.after_facts->'settlements'->(item.ordinality::integer-1);
      IF next_settlement-'amount' IS DISTINCT FROM old_settlement-'amount' THEN RAISE EXCEPTION 'Original settlement identity and direction cannot change' USING ERRCODE='23514'; END IF;
      settled:=settled+CASE next_settlement->>'direction' WHEN 'RECEIVE' THEN 1 ELSE -1 END*naijue_erp.history_numeric_money(next_settlement->'amount',true);
      money_changed:=money_changed OR next_settlement IS DISTINCT FROM old_settlement;
    END LOOP;
    IF money_changed AND settled<>naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'netDue') THEN
      RAISE EXCEPTION 'Corrected receive/refund must balance exact effective net due' USING ERRCODE='23514'; END IF;
  ELSIF NEW.after_facts->'totals' IS DISTINCT FROM 'null'::jsonb OR NEW.after_facts->'settlements'<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Transfer has no money correction branch' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(evidence->'effects')<>expected_effects OR jsonb_array_length(evidence->'ledgerEntryIds')<>expected_effects
    OR (SELECT count(DISTINCT value->>'ledgerEntryId') FROM jsonb_array_elements(evidence->'effects'))<>expected_effects
    OR (SELECT count(DISTINCT (value->>'lineId',value->>'endpoint')) FROM jsonb_array_elements(evidence->'effects'))<>expected_effects THEN
    RAISE EXCEPTION 'Exact nonzero original line/endpoint delta set required' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(value->'ledgerEntryId' ORDER BY ordinality),'[]') INTO ledger_ids FROM jsonb_array_elements(evidence->'effects') WITH ORDINALITY;
  IF evidence->'ledgerEntryIds' IS DISTINCT FROM ledger_ids THEN RAISE EXCEPTION 'Exact delta ledger identity list required' USING ERRCODE='23514'; END IF;
  FOR effect IN SELECT value FROM jsonb_array_elements(evidence->'effects') LOOP
    IF jsonb_typeof(effect) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(effect))<>9
      OR NOT effect ?& ARRAY['lineId','warehouseId','skuId','endpoint','quantityDelta','ledgerEntryId','oldEffect','newEffect','delta']
      OR (effect->>'ledgerEntryId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Exact bounded delta evidence fields required' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(effect) WHERE jsonb_typeof(value)<>'string') THEN
      RAISE EXCEPTION 'Delta identities and exact numeric evidence must remain strings' USING ERRCODE='23514'; END IF;
    SELECT value INTO STRICT old_line FROM jsonb_array_elements(actual->'lines') WHERE value->>'lineId'=effect->>'lineId';
    SELECT value INTO STRICT next_line FROM jsonb_array_elements(NEW.after_facts->'lines') WHERE value->>'lineId'=effect->>'lineId';
    old_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(old_line->>'quantity')::numeric;
    next_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(next_line->>'quantity')::numeric;
    difference:=next_effect-old_effect;
    IF actual->>'sourceStatus'<>'APPROVED' OR difference=0 OR effect->>'skuId' IS DISTINCT FROM old_line->>'skuId'
      OR effect->>'warehouseId' IS DISTINCT FROM CASE effect->>'endpoint' WHEN 'SALES_WAREHOUSE' THEN actual->>'warehouseId' WHEN 'FROM' THEN actual->>'fromWarehouseId' WHEN 'TO' THEN actual->>'toWarehouseId' END
      OR (NEW.document_kind='SALES' AND effect->>'endpoint'<>'SALES_WAREHOUSE') OR (NEW.document_kind='TRANSFER' AND effect->>'endpoint' NOT IN ('FROM','TO'))
      OR effect->>'oldEffect' IS DISTINCT FROM old_effect::text OR effect->>'newEffect' IS DISTINCT FROM next_effect::text OR effect->>'delta' IS DISTINCT FROM difference::text
      OR (effect->>'quantityDelta')::bigint::text IS DISTINCT FROM difference::text THEN
      RAISE EXCEPTION 'Only exact approved historical stock difference is permitted' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.history_effective_writes_closed() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE revision naijue_erp.history_revision%ROWTYPE; value jsonb; previous jsonb; expected jsonb; actual jsonb; parent uuid; target uuid;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historical effective identities cannot be deleted' USING ERRCODE='23514'; END IF;
  value:=to_jsonb(NEW); IF TG_OP='UPDATE' THEN previous:=to_jsonb(OLD); END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision r WHERE r.id=(value->>'revision_id')::uuid
    AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  target:=CASE revision.document_kind WHEN 'SALES' THEN revision.sales_id ELSE revision.transfer_id END;
  IF TG_TABLE_NAME IN ('history_sales_effective','history_transfer_effective') THEN
    IF (value->>'header_id')::uuid<>target OR (value->>'version')::integer<>revision.to_version
      OR (TG_TABLE_NAME='history_sales_effective') IS DISTINCT FROM (revision.document_kind='SALES')
      OR (TG_OP='INSERT' AND (revision.from_version<>1 OR revision.before_facts->'previousRevisionId'<>'null'::jsonb))
      OR (TG_OP='UPDATE' AND ((previous->>'header_id')::uuid<>target OR (previous->>'version')::integer<>revision.from_version
        OR previous->'revision_id' IS DISTINCT FROM revision.before_facts->'previousRevisionId')) THEN
      RAISE EXCEPTION 'Effective head requires the exact original revision CAS' USING ERRCODE='40001'; END IF;
    IF TG_TABLE_NAME='history_sales_effective' THEN
      actual:=jsonb_build_object('grossAmount',(value->>'gross_amount')::numeric(18,2)::text,'orderDiscount',(value->>'order_discount')::numeric(18,2)::text,'netDue',(value->>'net_due')::numeric(18,2)::text);
      IF actual IS DISTINCT FROM revision.after_facts->'totals' THEN RAISE EXCEPTION 'Effective sales head differs from approved numeric facts' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='history_sales_line_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_sales_line WHERE id=(value->>'line_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') item WHERE item->>'lineId'=value->>'line_id';
    actual:=jsonb_build_object('quantity',(value->>'quantity')::bigint::text,'dealPrice',(value->>'deal_price')::numeric(18,2)::text,
      'lineAmount',(value->>'line_amount')::numeric(18,2)::text,'allocatedDiscount',CASE WHEN value->'allocated_discount'='null'::jsonb THEN NULL ELSE (value->>'allocated_discount')::numeric(18,2)::text END);
    IF revision.document_kind<>'SALES' OR parent<>target OR actual IS DISTINCT FROM expected-ARRAY['lineId','skuId']
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective sales line must retain original parent and exact numeric facts' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_transfer_line_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_transfer_line WHERE id=(value->>'line_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') item WHERE item->>'lineId'=value->>'line_id';
    IF revision.document_kind<>'TRANSFER' OR parent<>target OR (value->>'quantity')::bigint::text IS DISTINCT FROM expected->>'quantity'
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective transfer quantity must retain original parent' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_sales_settlement_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_sales_settlement WHERE id=(value->>'settlement_id')::uuid FOR SHARE;
    SELECT item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'settlements') item WHERE item->>'settlementId'=value->>'settlement_id';
    IF revision.document_kind<>'SALES' OR parent<>target OR (value->>'amount')::numeric(18,2)::text IS DISTINCT FROM expected->>'amount'
      OR (TG_OP='UPDATE' AND previous->'settlement_id' IS DISTINCT FROM value->'settlement_id') THEN
      RAISE EXCEPTION 'Effective settlement retains original account and direction' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown historical projection' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION naijue_erp.guard_history_numeric_ledger() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE revision naijue_erp.history_revision%ROWTYPE; effect jsonb;
BEGIN
  IF NEW.event_kind<>'HISTORY_REVISION' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision r WHERE r.id=NEW.source_history_revision_id
    AND r.operation_id=NEW.operation_id AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  SELECT value INTO STRICT effect FROM jsonb_array_elements(revision.stock_effect_evidence->'effects') WHERE value->>'ledgerEntryId'=NEW.id::text;
  IF NEW.source_document_version IS DISTINCT FROM revision.to_version OR NEW.reverses_entry_id IS NOT NULL OR NEW.source_import_batch_id IS NOT NULL
    OR NEW.source_sales_line_id IS NOT NULL OR NEW.source_transfer_line_id IS NOT NULL
    OR NEW.business_date::text IS DISTINCT FROM revision.before_facts->>'businessDate' OR NEW.posted_at IS DISTINCT FROM revision.changed_at
    OR NEW.warehouse_id::text IS DISTINCT FROM effect->>'warehouseId' OR NEW.sku_id::text IS DISTINCT FROM effect->>'skuId'
    OR NEW.endpoint IS DISTINCT FROM effect->>'endpoint' OR NEW.quantity_delta::text IS DISTINCT FROM effect->>'quantityDelta'
    OR (revision.document_kind='SALES' AND (NEW.source_history_sales_line_id::text IS DISTINCT FROM effect->>'lineId' OR NEW.source_history_transfer_line_id IS NOT NULL))
    OR (revision.document_kind='TRANSFER' AND (NEW.source_history_transfer_line_id::text IS DISTINCT FROM effect->>'lineId' OR NEW.source_history_sales_line_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Exact current historical revision delta source required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.guard_history_numeric_ledger() FROM PUBLIC;
CREATE TRIGGER history_numeric_ledger_guard BEFORE INSERT ON naijue_erp.inventory_ledger FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_numeric_ledger();

CREATE FUNCTION naijue_erp.validate_history_numeric_revision_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; actual jsonb; expected jsonb; target uuid; target_kind text;
BEGIN
  target:=CASE NEW.document_kind WHEN 'SALES' THEN NEW.sales_id ELSE NEW.transfer_id END;
  target_kind:=CASE NEW.document_kind WHEN 'SALES' THEN 'HISTORY_SALES' ELSE 'HISTORY_TRANSFER' END;
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt q WHERE q.id=NEW.operation_id
    AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change q WHERE q.operation_id=r.id
    AND q.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.target_type<>target_kind OR r.target_id<>target OR r.action<>'HISTORY_REVISE' OR r.status<>'COMMITTED'
    OR r.actor_account_id<>NEW.actor_account_id OR r.request_key<>NEW.request_key OR r.completed_at<>NEW.changed_at
    OR r.result_data->>'revisionId' IS DISTINCT FROM NEW.id::text OR r.result_data->>'version' IS DISTINCT FROM NEW.to_version::text
    OR r.result_data->'ledgerEntryIds' IS DISTINCT FROM NEW.stock_effect_evidence->'ledgerEntryIds'
    OR a.object_type<>r.target_type OR a.object_id<>r.target_id OR a.actor_account_id<>r.actor_account_id OR a.action<>r.action
    OR a.old_version<>NEW.from_version OR a.new_version<>NEW.to_version OR a.occurred_at<>NEW.changed_at
    OR a.before_values IS DISTINCT FROM NEW.before_facts OR a.after_values IS DISTINCT FROM NEW.after_facts THEN
    RAISE EXCEPTION 'Historical revision must close with its original audit and receipt' USING ERRCODE='23514'; END IF;
  actual:=naijue_erp.history_numeric_current_facts(NEW.document_kind,target);
  IF actual IS DISTINCT FROM NEW.after_facts THEN RAISE EXCEPTION 'Full committed effective document differs from revision' USING ERRCODE='23514'; END IF;
  SELECT coalesce(jsonb_agg(l.id::text ORDER BY l.id),'[]') INTO actual FROM naijue_erp.inventory_ledger l WHERE l.operation_id=NEW.operation_id;
  SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') INTO expected FROM jsonb_array_elements_text(NEW.stock_effect_evidence->'ledgerEntryIds');
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Historical delta ledger set must be exact, including empty money-only set' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=NEW.operation_id
    AND (l.event_kind<>'HISTORY_REVISION' OR l.source_history_revision_id IS DISTINCT FROM NEW.id)) THEN
    RAISE EXCEPTION 'Historical operation cannot piggyback another stock source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_revision_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_revision_commit AFTER INSERT ON naijue_erp.history_revision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_revision_commit();

CREATE FUNCTION naijue_erp.validate_history_numeric_receipt_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NEW.target_type NOT IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision r WHERE r.operation_id=NEW.id AND r.id::text=NEW.result_data->>'revisionId'
    AND r.actor_account_id=NEW.actor_account_id AND r.request_key=NEW.request_key AND r.changed_at=NEW.completed_at
    AND r.to_version::text=NEW.result_data->>'version' AND r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    AND ((NEW.target_type='HISTORY_SALES' AND r.document_kind='SALES' AND r.sales_id=NEW.target_id AND r.transfer_id IS NULL)
      OR (NEW.target_type='HISTORY_TRANSFER' AND r.document_kind='TRANSFER' AND r.transfer_id=NEW.target_id AND r.sales_id IS NULL))) THEN
    RAISE EXCEPTION 'Historical receipt cannot commit without its original current revision' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_receipt_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_receipt_commit AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_receipt_commit();

CREATE FUNCTION naijue_erp.validate_history_numeric_balance_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; revision naijue_erp.history_revision%ROWTYPE;
  final_row naijue_erp.inventory_balance%ROWTYPE; total numeric; effects bigint; prior_quantity numeric; prior_version numeric;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=NEW.last_operation_id;
  IF r.target_type NOT IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN RETURN NULL; END IF;
  SELECT * INTO STRICT revision FROM naijue_erp.history_revision x WHERE x.operation_id=r.id
    AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
  IF r.action<>'HISTORY_REVISE' OR r.status<>'COMMITTED' OR revision.changed_at<>r.completed_at
    OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id,NEW.sku_id) THEN
    RAISE EXCEPTION 'History balance requires original admitted revision operation' USING ERRCODE='23514'; END IF;
  -- Only the first event for this same operation/key validates its final cumulative delta.
  -- A previously committed operation cannot be reused: current revision xmin was checked above.
  IF TG_OP='UPDATE' THEN
    IF OLD.last_operation_id IS NOT DISTINCT FROM NEW.last_operation_id THEN RETURN NULL; END IF;
    prior_quantity:=OLD.quantity::numeric;prior_version:=OLD.version::numeric;
  ELSE
    prior_quantity:=0;prior_version:=0;
    IF EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id AND l.operation_id<>r.id) THEN
      RAISE EXCEPTION 'Previously used historical key cannot be reconstructed from zero' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT coalesce(sum(quantity_delta::numeric),0),count(*) INTO total,effects FROM naijue_erp.inventory_ledger
    WHERE operation_id=r.id AND warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id=NEW.warehouse_id AND sku_id=NEW.sku_id;
  IF effects=0 OR final_row.quantity::numeric IS DISTINCT FROM prior_quantity+total OR final_row.version::numeric IS DISTINCT FROM prior_version+effects
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=r.id AND l.warehouse_id=NEW.warehouse_id AND l.sku_id=NEW.sku_id
      AND (l.event_kind<>'HISTORY_REVISION' OR l.source_history_revision_id IS DISTINCT FROM revision.id OR l.posted_at IS DISTINCT FROM r.completed_at)) THEN
    RAISE EXCEPTION 'Historical balance must equal current operation/key delta and effect count' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.validate_history_numeric_balance_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER history_numeric_balance_commit AFTER INSERT OR UPDATE ON naijue_erp.inventory_balance
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_numeric_balance_commit();

-- Original sparse validator is retained below with one finite HISTORY dispatch.
-- C applies only after reviewing the complete exact source and original target.
CREATE OR REPLACE FUNCTION naijue_erp.validate_sparse_balance_commit() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE r naijue_erp.operation_receipt%ROWTYPE; final_row naijue_erp.inventory_balance%ROWTYPE; baseline naijue_erp.inventory_ledger%ROWTYPE;
  b naijue_erp.import_batch%ROWTYPE; a naijue_erp.audit_change%ROWTYPE; total numeric; effects bigint;
BEGIN
  SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id = NEW.last_operation_id;
  IF r.target_type IN ('HISTORY_SALES','HISTORY_TRANSFER') THEN
    IF r.action<>'HISTORY_REVISE' OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_revision x WHERE x.operation_id=r.id
      AND x.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint) THEN
      RAISE EXCEPTION 'Exact current historical revision required for sparse dispatch' USING ERRCODE='23514'; END IF;
    -- The installed history_numeric_balance_commit validates this exact key/operation.
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF r.target_type = 'IMPORT' THEN RAISE EXCEPTION 'an import receipt cannot overwrite existing stock' USING ERRCODE = '23514'; END IF;
    -- Preserve existing native SALES/TRANSFER transaction contracts and validators.
    RETURN NULL;
  END IF;
  IF r.target_type IN ('SALES', 'TRANSFER') THEN
    -- ONLY a first runtime approval may turn proven absence into an actual native balance.
    IF r.action <> 'APPROVE' OR r.status <> 'COMMITTED' OR NOT naijue_erp.inventory_runtime_key_admitted(NEW.warehouse_id, NEW.sku_id) THEN
      RAISE EXCEPTION 'first native balance requires published runtime approval' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE status = 'IMPORTED' AND inventory_mode = 'CUTOFF_STOCK_BASELINE';
    IF b.completed_at IS NULL OR (b.checkpoint->>'sequence')::bigint <= 0
      OR b.checkpoint->'expected'->>'IMPORT_BATCH' IS DISTINCT FROM '1'
      OR b.checkpoint->'counts' IS DISTINCT FROM b.checkpoint->'expected'
      OR (b.checkpoint->>'cursor')::numeric IS DISTINCT FROM
        (b.checkpoint->'counts'->>'WAREHOUSE')::numeric + (b.checkpoint->'counts'->>'SKU')::numeric
        + (b.checkpoint->'counts'->>'INVENTORY_LEDGER')::numeric + (b.checkpoint->'counts'->>'IMPORT_BATCH')::numeric
      OR NOT EXISTS (SELECT 1 FROM naijue_erp.import_record WHERE import_batch_id = b.id AND status = 'IMPORTED'
        AND target_type = 'IMPORT_BATCH' AND target_id = b.id AND source_entity_type = 'INVENTORY_SCOPE_APPROVAL'
        AND source_key = 'FINAL_COMPLETE_SCOPE'
        AND decision_reason = 'COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS'
        AND source_record_hash = b.source_hash AND source_file_ref = b.source_manifest_ref) THEN
      RAISE EXCEPTION 'first native balance requires complete immutable publication' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id = r.id;
    IF a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id
      OR a.action IS DISTINCT FROM 'APPROVE' OR a.actor_account_id IS DISTINCT FROM r.actor_account_id
      OR a.new_version::text IS DISTINCT FROM r.result_data->>'version' OR a.old_version + 1 IS DISTINCT FROM a.new_version THEN
      RAISE EXCEPTION 'first native balance requires exact native receipt and audit' USING ERRCODE = '23514'; END IF;
    IF (r.target_type = 'SALES' AND NOT EXISTS (SELECT 1 FROM naijue_erp.sales_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version))
      OR (r.target_type = 'TRANSFER' AND NOT EXISTS (SELECT 1 FROM naijue_erp.transfer_header h WHERE h.id = r.target_id
        AND h.stock_basis = 'RUNTIME_LEDGER' AND h.status = 'APPROVED' AND h.version = a.new_version)) THEN
      RAISE EXCEPTION 'first native balance cannot use cutoff history or another document' USING ERRCODE = '23514'; END IF;
    -- Prior used keys are retained by ledger_retains_balance. Never rebuild missing history from zero.
    IF EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND operation_id <> r.id)
      OR EXISTS (SELECT 1 FROM naijue_erp.inventory_ledger l
        LEFT JOIN naijue_erp.sales_line sl ON sl.id = l.source_sales_line_id
        LEFT JOIN naijue_erp.transfer_line tl ON tl.id = l.source_transfer_line_id
        WHERE l.operation_id = r.id AND l.warehouse_id = NEW.warehouse_id AND l.sku_id = NEW.sku_id
          AND (l.event_kind <> 'APPROVE' OR l.reverses_entry_id IS NOT NULL OR l.source_import_batch_id IS NOT NULL
            OR l.source_document_version IS DISTINCT FROM a.new_version OR l.posted_at IS DISTINCT FROM r.completed_at
            OR (r.target_type = 'SALES' AND (sl.sales_id IS DISTINCT FROM r.target_id OR l.source_transfer_line_id IS NOT NULL))
            OR (r.target_type = 'TRANSFER' AND (tl.transfer_id IS DISTINCT FROM r.target_id OR l.source_sales_line_id IS NOT NULL)))) THEN
      RAISE EXCEPTION 'first native balance requires only exact new operation effects' USING ERRCODE = '23514'; END IF;
    -- Bounded CURRENT operation/key only, never a full-history SUM. Repeated real lines increment independently.
    SELECT COALESCE(SUM(quantity_delta::numeric), 0), COUNT(*) INTO total, effects FROM naijue_erp.inventory_ledger
      WHERE operation_id = r.id AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
    IF effects = 0 OR final_row.quantity::numeric IS DISTINCT FROM total OR final_row.version::numeric IS DISTINCT FROM effects
      OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at THEN
      RAISE EXCEPTION 'first native balance must equal exact cumulative operation delta and effect count' USING ERRCODE = '23514'; END IF;
    RETURN NULL;
  END IF;
  IF r.target_type <> 'IMPORT' OR r.action <> 'IMPORT_CHUNK' THEN
    RAISE EXCEPTION 'unsupported fresh balance receipt' USING ERRCODE = '23514'; END IF;
  SELECT * INTO STRICT baseline FROM naijue_erp.inventory_ledger WHERE operation_id = r.id
    AND warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id AND event_kind = 'CUTOFF_BASELINE';
  SELECT * INTO STRICT final_row FROM naijue_erp.inventory_balance WHERE warehouse_id = NEW.warehouse_id AND sku_id = NEW.sku_id;
  IF final_row.quantity IS DISTINCT FROM baseline.quantity_delta OR final_row.version <> 1
    OR final_row.last_operation_id IS DISTINCT FROM r.id OR final_row.updated_at IS DISTINCT FROM r.completed_at
    OR baseline.source_import_batch_id IS DISTINCT FROM r.target_id THEN
    RAISE EXCEPTION 'fresh baseline balance requires its exact nonzero real import effect' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;

-- No issuer/read purpose is widened here. C must export/review exact successor
-- metadata and independently opt into HISTORY_REVISION before mounting writes.
COMMIT;
