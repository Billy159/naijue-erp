-- SOURCE ONLY; no index or permission expansion. PostgreSQL EXPLAIN/performance untested.
BEGIN;
DO $lineage$ BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_catalog.pg_proc WHERE oid='naijue_erp.standard_import_row_intent(text,jsonb)'::regprocedure) IS DISTINCT FROM 'df6adcf79b1922517e68d0cf22e0f8cb2fe375aeca41f1f699087cef844677bd' THEN RAISE EXCEPTION 'WHOLE_INTENT_PREDECESSOR_DIFFERS' USING ERRCODE='55000'; END IF;
END $lineage$;
CREATE OR REPLACE FUNCTION naijue_erp.standard_import_row_intent(kind text,native_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp SET TimeZone='UTC' AS $$
DECLARE a naijue_erp.audit_change%ROWTYPE; item jsonb; expected jsonb; table_name text;
BEGIN
 IF current_setting('role') NOT IN ('erp_unified27_initializer_2393dbc6db9581c2','erp_unified27_importer_2393dbc6db9581c2') THEN RETURN false; END IF;
 IF native_row ? 'id' AND native_row->>'id' IS NOT NULL THEN
  DECLARE source_ids uuid[]; proof jsonb; exact_audit naijue_erp.audit_change%ROWTYPE;
  BEGIN
   SELECT array_agg(s.id) INTO source_ids FROM naijue_erp.import_batch b JOIN naijue_erp.import_record s
    ON s.import_batch_id=b.id AND s.target_type=kind AND s.target_id=(native_row->>'id')::uuid AND s.status='IMPORTED' AND s.decision_reason LIKE '{%"STANDARD_IMPORT_POINTER_V1"%'
    WHERE b.mapping_version IN ('STANDARD_INITIAL_EXPLICIT_KEYS_V1','DOCUMENT_CONVERSION_V1')
     AND s.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint;
   IF cardinality(source_ids)=1 THEN
    SELECT intent_audit.* INTO STRICT exact_audit FROM naijue_erp.audit_change intent_audit JOIN naijue_erp.import_record source_record ON intent_audit.operation_id=(source_record.decision_reason::jsonb->>'operationId')::uuid WHERE source_record.id=source_ids[1];
    IF exact_audit.after_values ? 'whole_package_v2' THEN
     proof:=naijue_erp.standard_import_record_proof(source_ids[1]);
     PERFORM naijue_erp.standard_whole_package_context_v2((exact_audit.after_values->'whole_package_v2'->>'root_operation')::uuid);
     IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') OR proof->'current_operation' IS DISTINCT FROM 'true'::jsonb THEN RETURN false; END IF;
     EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',lower(kind COLLATE "C")) INTO expected USING proof->'fields';
     RETURN expected=native_row;
    END IF;
   END IF;
  END;
 END IF;
 table_name:=lower(kind);
 IF kind NOT IN ('HALL','WAREHOUSE','CUSTOMER','SUPPLIER','STAFF','PRODUCT_CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE_SCHEME','SKU_BARCODE','PRODUCT_IMAGE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SALES_SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE') THEN RETURN false; END IF;
 FOR a IN SELECT * FROM naijue_erp.audit_change WHERE object_type='IMPORT' AND after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint LOOP
  FOR item IN SELECT value FROM jsonb_array_elements(a.after_values->'records') WHERE value->>'target_type'=kind LOOP
   EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::naijue_erp.%I,$1))',table_name) INTO expected USING item->'fields';
   IF expected=native_row THEN RETURN true; END IF;
  END LOOP;
 END LOOP;
 RETURN false;
END $$;
COMMIT;
