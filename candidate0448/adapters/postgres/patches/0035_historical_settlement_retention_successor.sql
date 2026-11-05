-- SOURCE CANDIDATE ONLY. Not installed or PostgreSQL accepted.
-- Historical 0..N settlement evidence applies to SALE, RETURN and EXCHANGE.
-- Exact original migration/restoration only; nonempty mismatches and edits
-- retain the existing balance, source, audit and inventory requirements.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $historical_settlement_retention$
DECLARE
 specs jsonb:=$settlement_source_changes$[{"signature":"naijue_erp.validate_sales_settlement()","predecessor_sha256":"4d4c05554603d473a24f3281cf285916d3eeaf8ff6d5547914b6574973e7ee7e","successor_sha256":"6264718f906a4d90a12547bbdf2c7aee91b49374beee2b1372147af2f13af953","replacements":[{"before":"preserve_missing_original:=h.business_type='SALE' AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0","after":"preserve_missing_original:=h.business_type IN ('SALE','RETURN','EXCHANGE') AND h.stock_basis='CUTOFF_HISTORY' AND settlement_count=0"},{"before":"OR origin_header->>'business_type' IS DISTINCT FROM 'SALE' OR origin_header->>'status' IS DISTINCT FROM 'APPROVED'","after":"OR coalesce(origin_header->>'business_type','') NOT IN ('SALE','RETURN','EXCHANGE') OR origin_header->>'status' IS DISTINCT FROM 'APPROVED'"}],"security_definer":false,"returns":"trigger"}]$settlement_source_changes$::jsonb;
 spec jsonb; change jsonb; routine oid; before_body text; after_body text; definition text;
 before_meta jsonb; after_meta jsonb;
BEGIN
 IF (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relkind IN ('r','p')) IS DISTINCT FROM ARRAY['audit_change','auth_session','barcode_scheme','color','customer','fit','hall','import_batch','import_record','inventory_balance','inventory_ledger','operation_receipt','payment_account','payment_account_hall','payment_method','product','product_category','product_image','runtime_document_number_allocation','sales_header','sales_line','sales_settlement','schema_migration','season','size','size_group','size_group_member','sku','sku_barcode','staff','supplier','transfer_header','transfer_line','user_account','warehouse']::text[]
  OR (SELECT count(*) FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p'))<>152 THEN
  RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_EXACT35_PREDECESSOR_REQUIRED' USING ERRCODE='55000'; END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements(specs) LOOP
  routine:=to_regprocedure(spec->>'signature');
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO before_body,before_meta FROM pg_proc p WHERE p.oid=routine;
  IF before_body IS NULL OR encode(sha256(convert_to(before_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'predecessor_sha256' THEN
   RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_PREDECESSOR_DIFFERS: %',spec->>'signature' USING ERRCODE='55000'; END IF;
  IF before_meta->'prosecdef' IS DISTINCT FROM spec->'security_definer'
   OR before_meta->>'prorettype' IS DISTINCT FROM (spec->>'returns')::regtype::oid::text
   OR before_meta->>'proowner' IS DISTINCT FROM (SELECT nspowner::text FROM pg_namespace WHERE nspname='naijue_erp')
   OR (before_meta->'proconfig' @> '["search_path=pg_catalog, naijue_erp, pg_temp"]'::jsonb) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_METADATA_UNSAFE' USING ERRCODE='55000'; END IF;
  definition:=pg_get_functiondef(routine);after_body:=before_body;
  FOR change IN SELECT value FROM jsonb_array_elements(spec->'replacements') LOOP
   IF coalesce(length(change->>'before'),0)=0
    OR (length(after_body)-length(replace(after_body,change->>'before','')))/length(change->>'before')<>1
    OR (length(definition)-length(replace(definition,change->>'before','')))/length(change->>'before')<>1 THEN
    RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_ANCHOR_DIFFERS' USING ERRCODE='55000'; END IF;
   after_body:=replace(after_body,change->>'before',change->>'after');
   definition:=replace(definition,change->>'before',change->>'after');
  END LOOP;
  IF encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256' THEN
   RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_OUTPUT_DIFFERS' USING ERRCODE='55000'; END IF;
  EXECUTE definition;
  SELECT p.prosrc,to_jsonb(p)-'prosrc' INTO after_body,after_meta FROM pg_proc p WHERE p.oid=routine;
  IF before_meta IS DISTINCT FROM after_meta OR encode(sha256(convert_to(after_body,'UTF8')),'hex') IS DISTINCT FROM spec->>'successor_sha256' THEN
   RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_POSTCONDITION_FAILED' USING ERRCODE='55000'; END IF;
 END LOOP;
END $historical_settlement_retention$;
COMMIT;
