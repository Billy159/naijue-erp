-- HV2-B07 exact single-body successor. Execution requires current target and C/B01 metadata binding.
-- This source file grants no execution authority. Original SQL remains immutable.
BEGIN;
DO $parent$ BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p'))<>131
 OR (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]
 OR (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.history_revision_not_enabled()'::regprocedure)<>'1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c'
 THEN RAISE EXCEPTION 'Exact historical nullable responsible predecessor required'; END IF;
END $parent$;
CREATE OR REPLACE FUNCTION naijue_erp.history_revision_not_enabled() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $nullable$
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
      WHERE w.id IN ((actual->>'fromWarehouseId')::uuid,(actual->>'toWarehouseId')::uuid) AND w.hall_id=actor.hall_id)
      AND NOT coalesce((source_header->>'created_role_source'='SALESPERSON' AND source_header->>'created_hall_id'=actor.hall_id::text
        AND source_header->>'created_hall_provenance'<>'UNKNOWN' AND source_header->>'created_by_source_key' IS NOT NULL),false) THEN
      RAISE EXCEPTION 'History transfer outside current hall' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.stock_effect_basis<>'CUTOFF_BASELINE_DELTA_V1' OR NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId']
      IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements','businessDate','fromWarehouseId','toWarehouseId','responsibleStaffId']
    OR NEW.after_facts->'version' IS DISTINCT FROM to_jsonb(NEW.to_version) OR NEW.after_facts->>'previousRevisionId' IS DISTINCT FROM NEW.id::text
    OR jsonb_typeof(NEW.after_facts->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(NEW.after_facts->'settlements') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'History correction cannot change source identity, scope, status or time' USING ERRCODE='23514'; END IF;
  IF NEW.after_facts-ARRAY['version','previousRevisionId','lines','totals','settlements'] IS DISTINCT FROM actual-ARRAY['version','previousRevisionId','lines','totals','settlements'] THEN
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
    IF (NEW.after_facts->'totals')-ARRAY['grossAmount','orderDiscount','netDue']<>'{}'::jsonb THEN RAISE EXCEPTION 'Exact original totals fields required' USING ERRCODE='23514'; END IF;
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
      OR effect->>'warehouseId' IS DISTINCT FROM (CASE effect->>'endpoint' WHEN 'SALES_WAREHOUSE' THEN actual->>'warehouseId' WHEN 'FROM' THEN actual->>'fromWarehouseId' WHEN 'TO' THEN actual->>'toWarehouseId' END)
      OR (NEW.document_kind='SALES' AND effect->>'endpoint'<>'SALES_WAREHOUSE') OR (NEW.document_kind='TRANSFER' AND effect->>'endpoint' NOT IN ('FROM','TO'))
      OR effect->>'oldEffect' IS DISTINCT FROM old_effect::text OR effect->>'newEffect' IS DISTINCT FROM next_effect::text OR effect->>'delta' IS DISTINCT FROM difference::text
      OR (effect->>'quantityDelta')::bigint::text IS DISTINCT FROM difference::text THEN
      RAISE EXCEPTION 'Only exact approved historical stock difference is permitted' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $nullable$;
DO $result$ BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.history_revision_not_enabled()'::regprocedure)<>'581a44ad13d184d594731b7c9ded219a3933fdb8a6c58f2ed63463fdc795ac4f'
 THEN RAISE EXCEPTION 'Exact nullable responsible successor body required'; END IF;
END $result$;
COMMIT;
