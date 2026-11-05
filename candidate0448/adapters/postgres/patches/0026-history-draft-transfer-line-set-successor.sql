-- HUMAN APPROVED source-only DRAFT/EXCLUDED transfer successor. No execution authorization.
-- Same four signatures, owners, trigger bindings and ACLs; no source/FK/table mutation.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp;
DO $parent$
DECLARE f jsonb;
BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements($pins$[{"signature":"naijue_erp.history_numeric_current_facts(text,uuid)","sha256":"dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8"},{"signature":"naijue_erp.history_revision_not_enabled()","sha256":"917601e4a32df8b38047094d05a581883e040876ee091c7de0f5ffe8999a5d16"},{"signature":"naijue_erp.history_effective_set_guard()","sha256":"a2fc6d48df9560e281a7b7a8604624d7b3219623b9dedc55a53284ad9951a900"},{"signature":"naijue_erp.validate_history_numeric_revision_commit()","sha256":"6cc941ed8ea63927fea7f372da6477c5def8e809a8dde1c348d07331ff9be0b6"}]$pins$::jsonb) LOOP
  IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure(f->>'signature')) IS DISTINCT FROM f->>'sha256' THEN
   RAISE EXCEPTION 'Exact approved draft-transfer predecessor body required'; END IF;
 END LOOP;
END $parent$;

CREATE OR REPLACE FUNCTION naijue_erp.history_numeric_current_facts(kind text,target uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE h jsonb; d record; e jsonb; lines jsonb; settlements jsonb; result jsonb; document_version integer; effective_facts jsonb;
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
  IF e IS NOT NULL THEN SELECT after_facts INTO STRICT effective_facts FROM naijue_erp.history_revision WHERE id=(e->>'revision_id')::uuid; END IF;
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
    'businessDate',CASE WHEN effective_facts IS NULL THEN h->'business_date' ELSE effective_facts->'businessDate' END,'responsibleStaffId',coalesce(effective_facts->'responsibleStaffId','null'::jsonb),'warehouseId',CASE kind WHEN 'SALES' THEN h->>'warehouse_id' ELSE NULL END,
    'fromWarehouseId',CASE kind WHEN 'TRANSFER' THEN coalesce(effective_facts->>'fromWarehouseId',h->>'from_warehouse_id') ELSE NULL END,'toWarehouseId',CASE kind WHEN 'TRANSFER' THEN coalesce(effective_facts->>'toWarehouseId',h->>'to_warehouse_id') ELSE NULL END,
    'lines',lines,'totals',CASE kind WHEN 'SALES' THEN jsonb_build_object('grossAmount',coalesce(e->>'gross_amount',(h->>'gross_amount')::numeric(18,2)::text),
      'orderDiscount',coalesce(e->>'order_discount',(h->>'order_discount')::numeric(18,2)::text),'netDue',coalesce(e->>'net_due',(h->>'net_due')::numeric(18,2)::text)) ELSE NULL END,'settlements',settlements);
  -- jsonb numeric head values lose scale; make the money strings canonical.
  IF kind='SALES' AND e IS NOT NULL THEN result:=jsonb_set(result,'{totals}',jsonb_build_object('grossAmount',(e->>'gross_amount')::numeric(18,2)::text,
    'orderDiscount',(e->>'order_discount')::numeric(18,2)::text,'netDue',(e->>'net_due')::numeric(18,2)::text)); END IF;
  IF kind='TRANSFER' THEN
    result:=result||jsonb_build_object('note',CASE WHEN effective_facts ? 'note' THEN effective_facts->'note' ELSE h->'note' END);
    IF effective_facts ? 'draftLineSetVersion' THEN
      IF h->>'source_status'<>'DRAFT' OR effective_facts->'draftLineSetVersion'<>'1'::jsonb
        OR jsonb_typeof(effective_facts->'lines') IS DISTINCT FROM 'array'
        OR jsonb_array_length(effective_facts->'lines') NOT BETWEEN 1 AND 200
        OR jsonb_typeof(effective_facts->'nativeGroups') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Committed draft line set has invalid provenance' USING ERRCODE='23514'; END IF;
      result:=result||jsonb_build_object('draftLineSetVersion',1,'lines',effective_facts->'lines','nativeGroups',effective_facts->'nativeGroups');
    END IF;
  END IF;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $body$
DECLARE actual jsonb; old_line jsonb; next_line jsonb; old_settlement jsonb; next_settlement jsonb;
  actor record; source_header jsonb; item record; effect jsonb; evidence jsonb; expected_effects integer:=0;
  difference numeric; old_effect numeric; next_effect numeric; money_changed boolean:=false; settled numeric;
  target uuid; action_kind text; size_before integer; effect_count integer; ledger_ids jsonb; draft_set boolean; native record; group_fact jsonb; expected_group jsonb; main_count integer; main_code text; before_group jsonb;
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
      WHERE w.id IN ((actual->>'fromWarehouseId')::uuid,(actual->>'toWarehouseId')::uuid) AND w.hall_id=actor.hall_id)
      AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text
        AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
      RAISE EXCEPTION 'History transfer outside current hall' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.stock_effect_basis<>'CUTOFF_BASELINE_DELTA_V1' OR NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId','note','draftLineSetVersion','nativeGroups']
      IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId','note','draftLineSetVersion','nativeGroups']
    OR NEW.after_facts->'version' IS DISTINCT FROM to_jsonb(NEW.to_version) OR NEW.after_facts->>'previousRevisionId' IS DISTINCT FROM NEW.id::text
    OR jsonb_typeof(NEW.after_facts->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.after_facts->'settlements') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'History correction cannot change source identity, scope, status or time' USING ERRCODE='23514'; END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements','draftLineSetVersion','nativeGroups'] IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements','draftLineSetVersion','nativeGroups'] THEN
    IF actual->>'sourceStatus'<>'DRAFT' OR actual->>'baselineEffect'<>'EXCLUDED_NOT_EFFECTIVE' THEN
      RAISE EXCEPTION 'Only original draft historical heads may change' USING ERRCODE='23514'; END IF;
    IF NEW.after_facts->'businessDate' IS DISTINCT FROM actual->'businessDate' THEN
      IF jsonb_typeof(NEW.after_facts->'businessDate') IS DISTINCT FROM 'string'
        OR NEW.after_facts->>'businessDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR (NEW.after_facts->>'businessDate')::date::text IS DISTINCT FROM NEW.after_facts->>'businessDate' THEN
        RAISE EXCEPTION 'Actual nonnull business date required' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.after_facts->'responsibleStaffId' IS DISTINCT FROM actual->'responsibleStaffId' THEN
      IF NOT (NEW.after_facts ? 'responsibleStaffId') THEN
        RAISE EXCEPTION 'Explicit responsible staff fact required' USING ERRCODE='23514';
      ELSIF jsonb_typeof(NEW.after_facts->'responsibleStaffId')='null' THEN
        NULL; -- Approved unknown/clear; never substitute the audit actor.
      ELSIF jsonb_typeof(NEW.after_facts->'responsibleStaffId')='string' THEN
        IF NEW.after_facts->>'responsibleStaffId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'Actual responsible staff UUID required' USING ERRCODE='23514'; END IF;
        PERFORM id FROM naijue_erp.staff WHERE id=(NEW.after_facts->>'responsibleStaffId')::uuid FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Actual responsible staff required' USING ERRCODE='23514'; END IF;
      ELSE
        RAISE EXCEPTION 'Explicit nullable responsible staff required' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.document_kind='SALES' THEN
      IF NEW.after_facts->'fromWarehouseId' IS DISTINCT FROM actual->'fromWarehouseId' OR NEW.after_facts->'toWarehouseId' IS DISTINCT FROM actual->'toWarehouseId' THEN
        RAISE EXCEPTION 'Sales revision cannot change transfer endpoints' USING ERRCODE='23514'; END IF;
    ELSE
      IF jsonb_typeof(NEW.after_facts->'fromWarehouseId') IS DISTINCT FROM 'string' OR jsonb_typeof(NEW.after_facts->'toWarehouseId') IS DISTINCT FROM 'string'
        OR NEW.after_facts->>'fromWarehouseId'=NEW.after_facts->>'toWarehouseId' THEN
        RAISE EXCEPTION 'Two distinct actual warehouse endpoints required' USING ERRCODE='23514'; END IF;
      FOR item IN SELECT value FROM jsonb_array_elements(jsonb_build_array(NEW.after_facts->'fromWarehouseId',NEW.after_facts->'toWarehouseId')) LOOP
        PERFORM w.id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=(item.value #>> '{}')::uuid
          AND (item.value IN(actual->'fromWarehouseId',actual->'toWarehouseId') OR w.enabled OR (item.value=NEW.after_facts->'fromWarehouseId' AND EXISTS(SELECT 1 FROM naijue_erp.inventory_balance stock WHERE stock.warehouse_id=w.id AND stock.quantity<>0))) FOR SHARE OF w,h;
        IF NOT FOUND THEN RAISE EXCEPTION 'Proposed warehouse unavailable' USING ERRCODE='23514'; END IF;
      END LOOP;
      IF actor.role='SALESPERSON' AND NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w WHERE w.id IN((NEW.after_facts->>'fromWarehouseId')::uuid,(NEW.after_facts->>'toWarehouseId')::uuid) AND w.hall_id=actor.hall_id)
        AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
        RAISE EXCEPTION 'Proposed historical endpoints outside current permission' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId'] IS NOT DISTINCT FROM actual-ARRAY['version','previousRevisionId'] THEN
    RAISE EXCEPTION 'Empty historical correction' USING ERRCODE='23514'; END IF;
  IF NEW.after_facts ? 'note' AND NEW.after_facts->'note' IS DISTINCT FROM actual->'note' THEN
    IF NEW.document_kind<>'TRANSFER' OR actual->>'sourceStatus'<>'DRAFT'
      OR jsonb_typeof(NEW.after_facts->'note') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'Only draft transfer note may change' USING ERRCODE='23514'; END IF;
    IF jsonb_typeof(NEW.after_facts->'note')='string' AND
      char_length(NEW.after_facts->>'note')+(SELECT count(*) FROM regexp_split_to_table(NEW.after_facts->>'note','') ch WHERE ascii(ch)>65535)>10000 THEN
      RAISE EXCEPTION 'Draft note exceeds original UTF16 input budget' USING ERRCODE='23514'; END IF;
  END IF;
  IF actual ? 'draftLineSetVersion' AND NOT (NEW.after_facts ? 'draftLineSetVersion') THEN
    RAISE EXCEPTION 'Effective draft line format cannot be downgraded' USING ERRCODE='23514'; END IF;
  draft_set:=NEW.after_facts ? 'draftLineSetVersion';
  IF NOT draft_set AND NEW.after_facts ? 'nativeGroups' THEN
    RAISE EXCEPTION 'Groups require the explicit draft line format' USING ERRCODE='23514'; END IF;
  IF draft_set THEN
    IF NEW.document_kind<>'TRANSFER' OR actual->>'sourceStatus'<>'DRAFT' OR actual->>'baselineEffect'<>'EXCLUDED_NOT_EFFECTIVE'
      OR NEW.after_facts->'draftLineSetVersion' IS DISTINCT FROM '1'::jsonb
      OR jsonb_array_length(NEW.after_facts->'lines') NOT BETWEEN 1 AND 200
      OR jsonb_typeof(NEW.after_facts->'nativeGroups') IS DISTINCT FROM 'array'
      OR NEW.after_facts->'totals' IS DISTINCT FROM 'null'::jsonb OR NEW.after_facts->'settlements' IS DISTINCT FROM '[]'::jsonb
      OR NEW.after_facts->'businessDate'='null'::jsonb THEN
      RAISE EXCEPTION 'Only complete nonempty draft transfer line sets are supported' USING ERRCODE='23514'; END IF;
    PERFORM w.id FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id
      WHERE w.id IN ((NEW.after_facts->>'fromWarehouseId')::uuid,(NEW.after_facts->>'toWarehouseId')::uuid) AND h.enabled
        AND (w.enabled OR w.id=(NEW.after_facts->>'fromWarehouseId')::uuid AND EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=w.id AND b.quantity<>0)) FOR SHARE OF w,h;
    IF (SELECT count(*) FROM naijue_erp.warehouse w JOIN naijue_erp.hall h ON h.id=w.hall_id
      WHERE w.id IN ((NEW.after_facts->>'fromWarehouseId')::uuid,(NEW.after_facts->>'toWarehouseId')::uuid) AND h.enabled
        AND (w.enabled OR w.id=(NEW.after_facts->>'fromWarehouseId')::uuid AND EXISTS(SELECT 1 FROM naijue_erp.inventory_balance b WHERE b.warehouse_id=w.id AND b.quantity<>0)))<>2 THEN
      RAISE EXCEPTION 'Draft transfer endpoint eligibility required' USING ERRCODE='23514'; END IF;
    evidence:=NEW.stock_effect_evidence;
    IF evidence-ARRAY['schemaVersion','importBatchId','publishedOperationId','documentManifestHash','previousRevisionId','oldEffectiveVersion','newEffectiveVersion','sourceStatus','effects','ledgerEntryIds']<>'{}'
      OR NOT evidence ?& ARRAY['schemaVersion','importBatchId','publishedOperationId','documentManifestHash','previousRevisionId','oldEffectiveVersion','newEffectiveVersion','sourceStatus','effects','ledgerEntryIds']
      OR evidence->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR evidence->'importBatchId' IS DISTINCT FROM actual->'importBatchId'
      OR evidence->'publishedOperationId' IS DISTINCT FROM actual->'publishedOperationId' OR evidence->'documentManifestHash' IS DISTINCT FROM actual->'documentManifestHash'
      OR evidence->'previousRevisionId' IS DISTINCT FROM actual->'previousRevisionId' OR evidence->'oldEffectiveVersion' IS DISTINCT FROM actual->'version'
      OR evidence->'newEffectiveVersion' IS DISTINCT FROM to_jsonb(NEW.to_version) OR evidence->'sourceStatus' IS DISTINCT FROM actual->'sourceStatus'
      OR evidence->'effects' IS DISTINCT FROM '[]'::jsonb OR evidence->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb THEN
      RAISE EXCEPTION 'Draft set has no stock effect or ledger identity' USING ERRCODE='23514'; END IF;
    IF (SELECT count(DISTINCT value->>'lineId') FROM jsonb_array_elements(NEW.after_facts->'lines'))<>jsonb_array_length(NEW.after_facts->'lines') THEN
      RAISE EXCEPTION 'Distinct effective line identities required; duplicate SKU rows are retained' USING ERRCODE='23514'; END IF;
    -- One materialization of each side; never merge rows by SKU or labels.
    FOR next_line,old_line IN
      WITH previous_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(actual->'lines')),
      next_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(NEW.after_facts->'lines'))
      SELECT n.value,o.value FROM next_rows n LEFT JOIN previous_rows o ON o.value->>'lineId'=n.value->>'lineId' LOOP
      IF jsonb_typeof(next_line) IS DISTINCT FROM 'object' OR next_line-ARRAY['lineId','skuId','quantity','origin']<>'{}'::jsonb
        OR NOT next_line ?& ARRAY['lineId','skuId','quantity','origin']
        OR jsonb_typeof(next_line->'lineId') IS DISTINCT FROM 'string' OR jsonb_typeof(next_line->'skuId') IS DISTINCT FROM 'string'
        OR next_line->>'lineId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        OR next_line->>'skuId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        OR jsonb_typeof(next_line->'quantity') IS DISTINCT FROM 'string' OR next_line->>'quantity' !~ '^[1-9][0-9]*$'
        OR (next_line->>'quantity')::numeric>9223372036854775807 OR jsonb_typeof(next_line->'origin') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Exact positive draft row with server identity required' USING ERRCODE='23514'; END IF;
      IF old_line IS NOT NULL THEN
        IF next_line->'skuId' IS DISTINCT FROM old_line->'skuId'
          OR next_line->'origin' IS DISTINCT FROM coalesce(old_line->'origin',jsonb_build_object('kind','SOURCE','sourceLineId',old_line->>'lineId')) THEN
          RAISE EXCEPTION 'Retained line identity cannot be replaced with a different SKU or source' USING ERRCODE='23514'; END IF;
      ELSE
        IF (next_line->>'lineId' IN(target::text,NEW.id::text,NEW.operation_id::text) OR next_line->>'lineId' IS NOT DISTINCT FROM actual->>'previousRevisionId')
          OR EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l WHERE l.id=(next_line->>'lineId')::uuid)
          OR next_line->'origin'->>'kind' IS DISTINCT FROM 'REVISION'
          OR next_line->'origin'->>'createdRevisionId' IS DISTINCT FROM NEW.id::text THEN
          RAISE EXCEPTION 'New effective identity must belong to this revision, never an imported source row' USING ERRCODE='23514'; END IF;
      END IF;
      IF next_line->'origin'->>'kind'='REVISION' AND next_line->'origin'->>'createdRevisionId'=NEW.id::text THEN
        IF next_line->'origin'-ARRAY['kind','createdRevisionId','identity','groupId','snapshot']<>'{}'::jsonb
          OR NOT (next_line->'origin') ?& ARRAY['kind','createdRevisionId','identity','groupId','snapshot'] THEN
          RAISE EXCEPTION 'Exact new native origin required' USING ERRCODE='23514'; END IF;
      END IF;
      IF old_line IS NULL OR NOT (actual ? 'draftLineSetVersion') THEN
        -- Same native reference rows/SHARE locks as ordinary SAVE, with explicit publication retention.
        SELECT s.id,s.product_id,s.color_id,s.fit_id,s.size_id,p.size_group_id,p.product_code,p.name product_name,
          c.name color_name,f.name fit_name,z.name size_name INTO STRICT native
          FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id
          JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id
          JOIN naijue_erp.size z ON z.id=s.size_id JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=s.size_id
          WHERE s.id=(next_line->>'skuId')::uuid AND s.enabled AND p.enabled AND c.enabled AND f.enabled
            AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND f.deleted_at IS NULL
            AND NOT EXISTS(SELECT 1 FROM naijue_erp.product_category pc WHERE pc.id=p.category_id AND pc.deleted_at IS NOT NULL)
            AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row src JOIN naijue_erp.import_batch ib ON ib.id=src.batch_id
              WHERE ib.status<>'IMPORTED' AND ((src.entity_type='SKU' AND src.field_provenance->'native_sku_import'->>'native_sku_id'=s.id::text) OR (src.entity_type='BARCODE' AND src.field_provenance->>'native_sku_id'=s.id::text)))
          FOR SHARE OF s,p,c,f,z,m;
        IF old_line IS NULL THEN
          PERFORM id FROM naijue_erp.sku_barcode WHERE sku_id=native.id AND enabled AND barcode_kind='MAIN' FOR SHARE;
          SELECT count(*),min(barcode) INTO main_count,main_code FROM naijue_erp.sku_barcode WHERE sku_id=native.id AND enabled AND barcode_kind='MAIN';
          IF main_count>1 OR next_line->'origin'->'identity' IS DISTINCT FROM jsonb_build_object('productId',native.product_id,'colorId',native.color_id,'fitId',native.fit_id,'sizeId',native.size_id)
            OR next_line->'origin'->>'groupId' IS DISTINCT FROM native.size_group_id::text
            OR next_line->'origin'->'snapshot' IS DISTINCT FROM jsonb_build_object('productCodeSnapshot',native.product_code,'productNameSnapshot',native.product_name,'colorNameSnapshot',native.color_name,'fitNameSnapshot',native.fit_name,'sizeNameSnapshot',native.size_name,'barcodeSnapshot',main_code) THEN
            RAISE EXCEPTION 'New revision snapshot must equal actual locked native facts' USING ERRCODE='23514'; END IF;
        END IF;
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT (value->>'revisionId',value->>'groupId')) FROM jsonb_array_elements(NEW.after_facts->'nativeGroups'))<>jsonb_array_length(NEW.after_facts->'nativeGroups') THEN
      RAISE EXCEPTION 'Distinct revision group snapshot keys required' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(NEW.after_facts->'nativeGroups')>200 OR NEW.after_facts->'nativeGroups' IS DISTINCT FROM
      (SELECT coalesce(jsonb_agg(value ORDER BY value->>'revisionId' COLLATE "C",value->>'groupId' COLLATE "C"),'[]'::jsonb) FROM jsonb_array_elements(NEW.after_facts->'nativeGroups')) THEN
      RAISE EXCEPTION 'Canonical bounded revision group order required' USING ERRCODE='23514'; END IF;
    FOR group_fact IN SELECT value FROM jsonb_array_elements(NEW.after_facts->'nativeGroups') LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.after_facts->'lines') l WHERE l->'origin'->>'kind'='REVISION'
        AND l->'origin'->>'createdRevisionId'=group_fact->>'revisionId' AND l->'origin'->>'groupId'=group_fact->>'groupId') THEN
        RAISE EXCEPTION 'No unrelated native group snapshot may be added' USING ERRCODE='23514'; END IF;
      IF group_fact->>'revisionId'=NEW.id::text THEN
        PERFORM id FROM naijue_erp.size_group WHERE id=(group_fact->>'groupId')::uuid FOR SHARE;
        PERFORM m.size_id FROM naijue_erp.size_group_member m JOIN naijue_erp.size z ON z.id=m.size_id
          WHERE m.size_group_id=(group_fact->>'groupId')::uuid ORDER BY m.display_order,m.size_id FOR SHARE OF m,z;
        SELECT jsonb_build_object('revisionId',NEW.id,'groupId',g.id,'name',g.name,'sizes',
          (SELECT jsonb_agg(jsonb_build_object('sizeId',m.size_id,'name',z.name,'displayOrder',m.display_order) ORDER BY m.display_order,m.size_id)
           FROM naijue_erp.size_group_member m JOIN naijue_erp.size z ON z.id=m.size_id WHERE m.size_group_id=g.id)) INTO STRICT expected_group
          FROM naijue_erp.size_group g WHERE g.id=(group_fact->>'groupId')::uuid;
        IF group_fact IS DISTINCT FROM expected_group OR jsonb_array_length(group_fact->'sizes') NOT BETWEEN 1 AND 1000 THEN
          RAISE EXCEPTION 'Complete actual native size group required, never inventory-trimmed' USING ERRCODE='23514'; END IF;
      ELSE
        SELECT value INTO before_group FROM jsonb_array_elements(coalesce(actual->'nativeGroups','[]'::jsonb)) g(value)
          WHERE value->>'revisionId'=group_fact->>'revisionId' AND value->>'groupId'=group_fact->>'groupId';
        IF before_group IS NULL OR group_fact IS DISTINCT FROM before_group THEN
          RAISE EXCEPTION 'Retained revision group snapshot cannot be rewritten' USING ERRCODE='23514'; END IF;
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.after_facts->'lines') l WHERE l->'origin'->>'kind'='REVISION'
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.after_facts->'nativeGroups') g
        WHERE g->>'revisionId'=l->'origin'->>'createdRevisionId' AND g->>'groupId'=l->'origin'->>'groupId')) THEN
      RAISE EXCEPTION 'Every revision line requires its retained full group snapshot' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
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
  FOR old_line,next_line IN
   WITH old_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(actual->'lines') WITH ORDINALITY),
    next_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(NEW.after_facts->'lines') WITH ORDINALITY)
   SELECT o.value,n.value FROM old_rows o JOIN next_rows n USING(ordinality) ORDER BY o.ordinality LOOP
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
    IF (NEW.after_facts->'totals')-ARRAY['grossAmount','orderDiscount','netDue']<>'{}'::jsonb THEN RAISE EXCEPTION 'Exact original totals fields required' USING ERRCODE='23514'; END IF;
    PERFORM naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'grossAmount'),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'orderDiscount',true),naijue_erp.history_numeric_money(NEW.after_facts->'totals'->'netDue');
    money_changed:=money_changed OR NEW.after_facts->'totals' IS DISTINCT FROM actual->'totals';
    settled:=0;
    FOR old_settlement,next_settlement IN
     WITH old_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(actual->'settlements') WITH ORDINALITY),
      next_rows AS MATERIALIZED(SELECT value,ordinality FROM jsonb_array_elements(NEW.after_facts->'settlements') WITH ORDINALITY)
     SELECT o.value,n.value FROM old_rows o JOIN next_rows n USING(ordinality) ORDER BY o.ordinality LOOP
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
  FOR effect,old_line,next_line IN
   WITH old_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(actual->'lines')),
    next_rows AS MATERIALIZED(SELECT value FROM jsonb_array_elements(NEW.after_facts->'lines')),
    effects AS MATERIALIZED(SELECT value FROM jsonb_array_elements(evidence->'effects'))
   SELECT e.value,o.value,n.value FROM effects e
    LEFT JOIN old_rows o ON o.value->>'lineId'=e.value->>'lineId'
    LEFT JOIN next_rows n ON n.value->>'lineId'=e.value->>'lineId' LOOP
    IF old_line IS NULL OR next_line IS NULL THEN RAISE EXCEPTION 'Original delta line missing' USING ERRCODE='23514'; END IF;
    IF jsonb_typeof(effect) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(effect))<>9
      OR NOT effect ?& ARRAY['lineId','warehouseId','skuId','endpoint','quantityDelta','ledgerEntryId','oldEffect','newEffect','delta']
      OR (effect->>'ledgerEntryId') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Exact bounded delta evidence fields required' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(effect) WHERE jsonb_typeof(value)<>'string') THEN
      RAISE EXCEPTION 'Delta identities and exact numeric evidence must remain strings' USING ERRCODE='23514'; END IF;
    old_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(old_line->>'quantity')::numeric;
    next_effect:=CASE effect->>'endpoint' WHEN 'TO' THEN 1 ELSE -1 END*(next_line->>'quantity')::numeric;
    difference:=next_effect-old_effect;
    IF actual->>'sourceStatus'<>'APPROVED' OR difference=0 OR effect->>'skuId' IS DISTINCT FROM old_line->>'skuId'
      OR effect->>'warehouseId' IS DISTINCT FROM (CASE effect->>'endpoint' WHEN 'SALES_WAREHOUSE' THEN actual->>'warehouseId' WHEN 'FROM' THEN actual->>'fromWarehouseId' WHEN 'TO' THEN actual->>'toWarehouseId' END)
      OR (NEW.document_kind='SALES' AND effect->>'endpoint'<>'SALES_WAREHOUSE') OR (NEW.document_kind='TRANSFER' AND effect->>'endpoint' NOT IN ('FROM','TO'))
      OR effect->>'oldEffect' IS DISTINCT FROM old_effect::text OR effect->>'newEffect' IS DISTINCT FROM next_effect::text OR effect->>'delta' IS DISTINCT FROM difference::text
      OR (effect->>'quantityDelta')::bigint::text IS DISTINCT FROM difference::text THEN
      RAISE EXCEPTION 'Only exact approved historical stock difference is permitted' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $body$;

CREATE OR REPLACE FUNCTION naijue_erp.history_effective_set_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,naijue_erp AS $set$
DECLARE invalid boolean;
BEGIN
 WITH revisions AS MATERIALIZED(
  SELECT r.* FROM naijue_erp.history_revision r JOIN(SELECT DISTINCT revision_id FROM history_new) n ON r.id=n.revision_id
  WHERE r.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
 ), expected AS MATERIALIZED(
  SELECT r.id revision_id,r.document_kind,r.sales_id,r.transfer_id,e.value
  FROM revisions r CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN r.after_facts->'settlements' ELSE r.after_facts->'lines' END)e(value)
 ), actual AS MATERIALIZED(SELECT to_jsonb(n) value FROM history_new n)
 SELECT EXISTS(SELECT 1 FROM actual a LEFT JOIN expected e
  ON e.revision_id=(a.value->>'revision_id')::uuid
   AND e.value->>CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN 'settlementId' ELSE 'lineId' END
    =a.value->>CASE WHEN TG_TABLE_NAME='history_sales_settlement_effective' THEN 'settlement_id' ELSE 'line_id' END
  WHERE e.revision_id IS NULL OR CASE TG_TABLE_NAME
   WHEN 'history_sales_line_effective' THEN e.document_kind<>'SALES'
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l WHERE l.id=(a.value->>'line_id')::uuid AND l.header_id=e.sales_id)
    OR jsonb_build_object('quantity',(a.value->>'quantity')::bigint::text,'dealPrice',(a.value->>'deal_price')::numeric(18,2)::text,'lineAmount',(a.value->>'line_amount')::numeric(18,2)::text,'allocatedDiscount',CASE WHEN a.value->'allocated_discount'='null'::jsonb THEN NULL ELSE (a.value->>'allocated_discount')::numeric(18,2)::text END) IS DISTINCT FROM e.value-ARRAY['lineId','skuId']
   WHEN 'history_transfer_line_effective' THEN e.document_kind<>'TRANSFER' OR EXISTS(SELECT 1 FROM revisions d WHERE d.id=e.revision_id AND d.after_facts ? 'draftLineSetVersion')
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l WHERE l.id=(a.value->>'line_id')::uuid AND l.header_id=e.transfer_id)
    OR (a.value->>'quantity')::bigint::text IS DISTINCT FROM e.value->>'quantity'
   WHEN 'history_sales_settlement_effective' THEN e.document_kind<>'SALES'
    OR NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement l WHERE l.id=(a.value->>'settlement_id')::uuid AND l.header_id=e.sales_id)
    OR (a.value->>'amount')::numeric(18,2)::text IS DISTINCT FROM e.value->>'amount'
   ELSE true END) INTO invalid;
 IF invalid THEN RAISE EXCEPTION 'Historical projection set differs from original revision facts' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $set$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_history_numeric_revision_commit() RETURNS trigger LANGUAGE plpgsql
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
  IF NEW.after_facts ? 'draftLineSetVersion' AND (
    NEW.document_kind<>'TRANSFER' OR NEW.after_facts->>'sourceStatus'<>'DRAFT'
    OR NEW.stock_effect_evidence->'effects' IS DISTINCT FROM '[]'::jsonb
    OR NEW.stock_effect_evidence->'ledgerEntryIds' IS DISTINCT FROM '[]'::jsonb
    OR EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line_effective v WHERE v.revision_id=NEW.id)
    OR EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.operation_id=NEW.operation_id)) THEN
    RAISE EXCEPTION 'Draft complete set cannot write quantity FK projections or inventory' USING ERRCODE='23514'; END IF;
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

COMMIT;
