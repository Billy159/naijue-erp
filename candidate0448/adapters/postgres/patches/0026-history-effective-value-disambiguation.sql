-- B0703 verified history-revise:put-line/value ambiguity only, after exact v16-from-v14.
-- Same function identity/guards/ACL/129 routines; no business/table/column/constraint changes.
-- Old sealed current-base patch is retained. T45 alone installs after its exact target review.
BEGIN;
DO $predecessor$
DECLARE required record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN('f','p'))<>129 THEN
  RAISE EXCEPTION 'Exact schema26/129 v16-from-v14 predecessor required' USING ERRCODE='23514'; END IF;
 FOR required IN SELECT * FROM (VALUES
  ('assert_core_initialization_v14','5ca42bcac20e7ad3affb3ac09829fd27c481752a303b1090133f23ecee3ad99d'),
  ('history_numeric_current_facts','dadecb6cce657834ce3719eb339f56f95dbbf27d6e0a92216940ed91697cadc8'),
  ('history_revision_not_enabled','1e69497d7023ab61fdac15e358707c9b9b73b7f3b281a01c306c2fd25d3c985c'),
  ('history_effective_writes_closed','c06027597f11a9cf7f2ae06bf5e47e5c21349b54851fb21df6895ef22a2855b7')
 ) expected(name,body_sha256) LOOP
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.proname=required.name AND p.prokind='f'
   AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=required.body_sha256)<>1 THEN
   RAISE EXCEPTION 'Exact v16 predecessor differs; do not replay or adopt unknown routines' USING ERRCODE='23514'; END IF;
 END LOOP;
END $predecessor$;

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
    SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') AS fact(item) WHERE fact.item->>'lineId'=value->>'line_id';
    actual:=jsonb_build_object('quantity',(value->>'quantity')::bigint::text,'dealPrice',(value->>'deal_price')::numeric(18,2)::text,
      'lineAmount',(value->>'line_amount')::numeric(18,2)::text,'allocatedDiscount',CASE WHEN value->'allocated_discount'='null'::jsonb THEN NULL ELSE (value->>'allocated_discount')::numeric(18,2)::text END);
    IF revision.document_kind<>'SALES' OR parent<>target OR actual IS DISTINCT FROM expected-ARRAY['lineId','skuId']
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective sales line must retain original parent and exact numeric facts' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_transfer_line_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_transfer_line WHERE id=(value->>'line_id')::uuid FOR SHARE;
    SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'lines') AS fact(item) WHERE fact.item->>'lineId'=value->>'line_id';
    IF revision.document_kind<>'TRANSFER' OR parent<>target OR (value->>'quantity')::bigint::text IS DISTINCT FROM expected->>'quantity'
      OR (TG_OP='UPDATE' AND previous->'line_id' IS DISTINCT FROM value->'line_id') THEN
      RAISE EXCEPTION 'Effective transfer quantity must retain original parent' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='history_sales_settlement_effective' THEN
    SELECT header_id INTO STRICT parent FROM naijue_erp.history_sales_settlement WHERE id=(value->>'settlement_id')::uuid FOR SHARE;
    SELECT fact.item INTO STRICT expected FROM jsonb_array_elements(revision.after_facts->'settlements') AS fact(item) WHERE fact.item->>'settlementId'=value->>'settlement_id';
    IF revision.document_kind<>'SALES' OR parent<>target OR (value->>'amount')::numeric(18,2)::text IS DISTINCT FROM expected->>'amount'
      OR (TG_OP='UPDATE' AND previous->'settlement_id' IS DISTINCT FROM value->'settlement_id') THEN
      RAISE EXCEPTION 'Effective settlement retains original account and direction' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown historical projection' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

DO $successor$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('naijue_erp.history_effective_writes_closed()')
  AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='4fbbebd6b335359b80c7df38efc99a30cb666902158c3e1f911e3c869ebac363')
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN('f','p'))<>129 THEN
  RAISE EXCEPTION 'Exact qualified history projection successor required' USING ERRCODE='23514'; END IF;
END $successor$;
COMMIT;
