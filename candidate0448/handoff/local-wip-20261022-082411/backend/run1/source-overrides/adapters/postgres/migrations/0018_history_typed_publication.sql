-- Additive18 for fresh synthetic databases only. Complete STAGE readback is under
-- genuine SQL verification; publication remains explicitly closed.
-- Versions1–17 are not modified. A registry maximum is not migration permission.
BEGIN;
DO $$
DECLARE installed integer[];
BEGIN
 SELECT array_agg(version ORDER BY version) INTO installed FROM naijue_erp.schema_migration;
 IF installed IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]
   OR EXISTS(SELECT 1 FROM naijue_erp.import_batch) OR EXISTS(SELECT 1 FROM naijue_erp.product)
   OR EXISTS(SELECT 1 FROM naijue_erp.sku) THEN
  RAISE EXCEPTION 'history18 requires exact empty fresh synthetic17 prefix, never an existing import scope' USING ERRCODE='23514';
 END IF;
END;
$$;

-- This is the application codec's byte grammar, not jsonb::text canonicalization.
CREATE FUNCTION naijue_erp.history_closure_encode(value jsonb, depth integer DEFAULT 0) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE kind text; result bytea; item jsonb; k text; n numeric; raw text; bytes bytea;
BEGIN
 IF value IS NULL OR depth IS NULL OR depth<0 OR depth>64 THEN
  RAISE EXCEPTION 'invalid bounded history closure value' USING ERRCODE='23514'; END IF;
 kind:=jsonb_typeof(value);
 IF kind='null' THEN result:=convert_to('n','UTF8');
 ELSIF kind='boolean' THEN result:=convert_to(CASE WHEN value='true'::jsonb THEN 't' ELSE 'f' END,'UTF8');
 ELSIF kind='string' THEN
  raw:=value#>>'{}'; bytes:=convert_to(raw,'UTF8');
  IF octet_length(bytes)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  result:=convert_to('s'||octet_length(bytes)::text||':','UTF8')||bytes;
 ELSIF kind='number' THEN
  n:=(value#>>'{}')::numeric;
  IF n<>trunc(n) OR abs(n)>9007199254740991 THEN
   RAISE EXCEPTION 'history closure numbers must be safe integers' USING ERRCODE='23514'; END IF;
  result:=convert_to('i'||trunc(n)::text||';','UTF8');
 ELSIF kind='array' THEN
  result:=convert_to('a'||jsonb_array_length(value)::text||':','UTF8');
  FOR item IN SELECT e.value FROM jsonb_array_elements(value) WITH ORDINALITY e(value,ordinal) ORDER BY ordinal LOOP
   result:=result||naijue_erp.history_closure_encode(item,depth+1);
   IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSIF kind='object' THEN
  SELECT count(*)::text INTO raw FROM jsonb_object_keys(value);
  result:=convert_to('o'||raw||':','UTF8');
  FOR k,item IN SELECT e.key,e.value FROM jsonb_each(value) e ORDER BY convert_to(e.key,'UTF8') LOOP
   result:=result||naijue_erp.history_closure_encode(to_jsonb(k),depth+1)||naijue_erp.history_closure_encode(item,depth+1);
   IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
  END LOOP;
 ELSE RAISE EXCEPTION 'unsupported history closure scalar' USING ERRCODE='23514';
 END IF;
 IF octet_length(result)>4194304 THEN RAISE EXCEPTION 'history closure row byte limit' USING ERRCODE='23514'; END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_row_hash(relation_name text,row_key text,projection jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 IF relation_name IS NULL OR row_key IS NULL OR octet_length(convert_to(relation_name,'UTF8')) NOT BETWEEN 1 AND 65536
   OR octet_length(convert_to(row_key,'UTF8')) NOT BETWEEN 1 AND 65536 OR projection IS NULL THEN
  RAISE EXCEPTION 'history closure exact row identity required' USING ERRCODE='23514'; END IF;
 RETURN encode(sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_ROW_V1',relation_name,row_key,projection))),'hex');
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_seed(scope text) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 IF scope IS NULL OR octet_length(convert_to(scope,'UTF8')) NOT BETWEEN 1 AND 65536 THEN
  RAISE EXCEPTION 'history closure stream scope required' USING ERRCODE='23514'; END IF;
 RETURN sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_V1',scope)));
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_fold(state bytea,row_hash text) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 IF state IS NULL OR octet_length(state)<>32 OR row_hash IS NULL OR row_hash!~'^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'history closure exact SHA state required' USING ERRCODE='23514'; END IF;
 RETURN sha256(decode('01','hex')||state||decode(row_hash,'hex'));
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_finish(scope text,row_count bigint,state bytea) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 PERFORM naijue_erp.history_closure_seed(scope);
 IF row_count IS NULL OR row_count<0 OR row_count>2147483645 OR state IS NULL OR octet_length(state)<>32 THEN
  RAISE EXCEPTION 'history closure exact bounded stream final required' USING ERRCODE='23514'; END IF;
 RETURN encode(sha256(naijue_erp.history_closure_encode(jsonb_build_array('HISTORY_CLOSURE_STREAM_FINAL_V1',scope,row_count,encode(state,'hex')))),'hex');
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_count_map(value jsonb,expected_keys text[]) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog AS $$
DECLARE field record;n numeric;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' OR expected_keys IS NULL
  OR array_position(expected_keys,NULL) IS NOT NULL
  OR cardinality(expected_keys)<>(SELECT count(DISTINCT k) FROM unnest(expected_keys) k) THEN RETURN false;END IF;
 IF NOT(value ?& expected_keys AND value-expected_keys='{}'::jsonb) THEN RETURN false;END IF;
 FOR field IN SELECT e.value FROM jsonb_each(value) e LOOP
  IF jsonb_typeof(field.value) IS DISTINCT FROM 'number' THEN RETURN false;END IF;
  n:=(field.value#>>'{}')::numeric;IF n<>trunc(n) OR n<0 OR n>2147483645 THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END;
$$;

-- V2 explicit source-semantic column matrix. Only party imported_at/creation_xid
-- are excluded server metadata; all deterministic GENERATED IDs remain included.
CREATE FUNCTION naijue_erp.history_closure_projection_columns(relation_name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 CASE relation_name
 WHEN 'import_source_row' THEN RETURN ARRAY['id','batch_id','entity_type','source_key','file_ref','sheet','row_no','source_file_sha256','row_sha256','raw_fields','normalized_fields','field_provenance'];
 WHEN 'history_sales_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','business_type','hall_id','customer_id','warehouse_id','salesperson_id','gross_amount','order_discount','net_due'];
 WHEN 'history_transfer_header' THEN RETURN ARRAY['id','source_row_id','batch_id','version','number','business_date','source_status','note','created_by_source_key','approved_by_source_key','created_hall_id','created_hall_provenance','created_hall_reason','created_local_at','updated_local_at','approved_local_at','created_instant','updated_instant','approved_instant','from_warehouse_id','to_warehouse_id','created_role_source'];
 WHEN 'history_sales_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot','reference_price','deal_price','line_amount','allocated_discount','is_gift','pricing_method_source','discount_tenths','ordinary_zero_confirmed'];
 WHEN 'history_transfer_line' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','sku_id','quantity','product_code_snapshot','product_name_snapshot','color_name_snapshot','fit_name_snapshot','size_name_snapshot','barcode_snapshot'];
 WHEN 'history_sales_settlement' THEN RETURN ARRAY['id','source_row_id','batch_id','header_id','line_no','payment_account_id','direction','amount','account_name_snapshot','method_name_snapshot','payment_method_id_snapshot'];
 WHEN 'import_sku_alias' THEN RETURN ARRAY['batch_id','old_source_sku_id','canonical_sku_id','source_row_id','canonical_source_key','mapping_basis'];
 WHEN 'import_stock_contributor' THEN RETURN ARRAY['batch_id','source_row_id','warehouse_id','canonical_sku_id','old_source_sku_id','canonical_stock_source_key','source_unit','signed_quantity','baseline_ledger_id'];
 WHEN 'import_header_native_reference' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_hall_id','native_customer_id','native_staff_id','native_version','native_snapshot','validator_version'];
 WHEN 'native_party_import_evidence' THEN RETURN ARRAY['batch_id','source_row_id','entity_type','source_key','native_id','native_hall_id','native_customer_id','native_supplier_id','native_staff_id','native_warehouse_id','warehouse_record','native_snapshot','source_snapshot','selection','authorization','row_fingerprint','validator_version'];
 WHEN 'import_native_catalogue_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','category_id','color_id','fit_id','size_id','size_group_id','season_id','member_group_id','member_size_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'import_native_payment_binding' THEN RETURN ARRAY['batch_id','entity_type','source_key','source_row_id','native_payment_method_id','native_payment_account_id','native_hall_id','native_snapshot','evidence_fingerprint','validator_version'];
 WHEN 'product' THEN RETURN ARRAY['id','product_code','name','category_id','supplier_id','season_id','size_group_id','retail_price','enabled','version','year','system_item_code','thickness','collar_pants_type','purchase_price','wholesale5_price','wholesale6_price','wholesale7_price','wholesale8_price','wholesale9_price','wholesale10_price','minimum_price'];
 WHEN 'sku' THEN RETURN ARRAY['id','product_id','color_id','fit_id','size_id','sku_code','enabled','version'];
 WHEN 'hall' THEN RETURN ARRAY['id','name','default_customer_id','default_sales_warehouse_id','enabled','version'];
 WHEN 'warehouse' THEN RETURN ARRAY['id','hall_id','name','enabled','version'];
 WHEN 'customer' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'supplier' THEN RETURN ARRAY['id','code','name','enabled','version','created_at','updated_at'];
 WHEN 'staff' THEN RETURN ARRAY['id','name','hall_id','role','contact','employment_status','version'];
 WHEN 'product_category' THEN RETURN ARRAY['id','parent_id','name','display_order','version'];
 WHEN 'color' THEN RETURN ARRAY['id','code','name','enabled','version'];
 WHEN 'fit' THEN RETURN ARRAY['id','code','name','enabled','version'];
 WHEN 'size' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group' THEN RETURN ARRAY['id','code','name'];
 WHEN 'size_group_member' THEN RETURN ARRAY['size_group_id','size_id','display_order'];
 WHEN 'season' THEN RETURN ARRAY['id','code','name','display_order'];
 WHEN 'sku_barcode' THEN RETURN ARRAY['id','barcode','sku_id','barcode_kind','scheme_id','enabled'];
 WHEN 'barcode_scheme' THEN RETURN ARRAY['id','name','barcode_type','rule_description','code_length','rule_version','status'];
 WHEN 'payment_method_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_identity' THEN RETURN ARRAY['id'];
 WHEN 'payment_account_hall' THEN RETURN ARRAY['payment_account_id','hall_id'];
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_projection(relation_name text,original jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE cols text[];allowed text[];result jsonb;
BEGIN
 cols:=naijue_erp.history_closure_projection_columns(relation_name);allowed:=cols;
 IF relation_name='native_party_import_evidence' THEN allowed:=cols||ARRAY['creation_xid','imported_at']; END IF;
 IF relation_name='payment_method_identity' THEN allowed:=cols||ARRAY['name','enabled','version']; END IF;
 IF relation_name='payment_account_identity' THEN allowed:=cols||ARRAY['name','payment_method_id','enabled','version']; END IF;
 IF (jsonb_typeof(original)='object' AND original ?& cols AND original-allowed='{}'::jsonb) IS DISTINCT FROM TRUE THEN
 RAISE EXCEPTION 'closure full explicit column shape required' USING ERRCODE='23514'; END IF;
 CASE relation_name
 WHEN 'import_source_row' THEN result:=jsonb_build_object('id',original->'id','batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','file_ref',original->'file_ref','sheet',original->'sheet','row_no',to_jsonb((original->>'row_no')::bigint::text),'source_file_sha256',original->'source_file_sha256','row_sha256',original->'row_sha256','raw_fields',original->'raw_fields','normalized_fields',original->'normalized_fields','field_provenance',original->'field_provenance');
 WHEN 'history_sales_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'business_type',original->'business_type','hall_id',original->'hall_id','customer_id',original->'customer_id','warehouse_id',original->'warehouse_id','salesperson_id',original->'salesperson_id','gross_amount',to_jsonb((original->>'gross_amount')::numeric(18,2)::text),'order_discount',to_jsonb((original->>'order_discount')::numeric(18,2)::text),'net_due',to_jsonb((original->>'net_due')::numeric(18,2)::text));
 WHEN 'history_transfer_header' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','version',original->'version','number',original->'number','business_date',to_jsonb(to_char((original->>'business_date')::date,'YYYY-MM-DD')),'source_status',original->'source_status','note',original->'note','created_by_source_key',original->'created_by_source_key','approved_by_source_key',original->'approved_by_source_key','created_hall_id',original->'created_hall_id','created_hall_provenance',original->'created_hall_provenance','created_hall_reason',original->'created_hall_reason','created_local_at',to_jsonb(to_char((original->>'created_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'updated_local_at',to_jsonb(to_char((original->>'updated_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'approved_local_at',to_jsonb(to_char((original->>'approved_local_at')::timestamp,'YYYY-MM-DD"T"HH24:MI:SS.US')),'created_instant',to_jsonb(to_char((original->>'created_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_instant',to_jsonb(to_char((original->>'updated_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'approved_instant',to_jsonb(to_char((original->>'approved_instant')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'from_warehouse_id',original->'from_warehouse_id','to_warehouse_id',original->'to_warehouse_id','created_role_source',original->'created_role_source');
 WHEN 'history_sales_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot','reference_price',to_jsonb((original->>'reference_price')::numeric(18,2)::text),'deal_price',to_jsonb((original->>'deal_price')::numeric(18,2)::text),'line_amount',to_jsonb((original->>'line_amount')::numeric(18,2)::text),'allocated_discount',to_jsonb((original->>'allocated_discount')::numeric(18,2)::text),'is_gift',original->'is_gift','pricing_method_source',original->'pricing_method_source','discount_tenths',original->'discount_tenths','ordinary_zero_confirmed',original->'ordinary_zero_confirmed');
 WHEN 'history_transfer_line' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','sku_id',original->'sku_id','quantity',to_jsonb((original->>'quantity')::bigint::text),'product_code_snapshot',original->'product_code_snapshot','product_name_snapshot',original->'product_name_snapshot','color_name_snapshot',original->'color_name_snapshot','fit_name_snapshot',original->'fit_name_snapshot','size_name_snapshot',original->'size_name_snapshot','barcode_snapshot',original->'barcode_snapshot');
 WHEN 'history_sales_settlement' THEN result:=jsonb_build_object('id',original->'id','source_row_id',original->'source_row_id','batch_id',original->'batch_id','header_id',original->'header_id','line_no',original->'line_no','payment_account_id',original->'payment_account_id','direction',original->'direction','amount',to_jsonb((original->>'amount')::numeric(18,2)::text),'account_name_snapshot',original->'account_name_snapshot','method_name_snapshot',original->'method_name_snapshot','payment_method_id_snapshot',original->'payment_method_id_snapshot');
 WHEN 'import_sku_alias' THEN result:=jsonb_build_object('batch_id',original->'batch_id','old_source_sku_id',original->'old_source_sku_id','canonical_sku_id',original->'canonical_sku_id','source_row_id',original->'source_row_id','canonical_source_key',original->'canonical_source_key','mapping_basis',original->'mapping_basis');
 WHEN 'import_stock_contributor' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','warehouse_id',original->'warehouse_id','canonical_sku_id',original->'canonical_sku_id','old_source_sku_id',original->'old_source_sku_id','canonical_stock_source_key',original->'canonical_stock_source_key','source_unit',original->'source_unit','signed_quantity',to_jsonb((original->>'signed_quantity')::bigint::text),'baseline_ledger_id',original->'baseline_ledger_id');
 WHEN 'import_header_native_reference' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_staff_id',original->'native_staff_id','native_version',original->'native_version','native_snapshot',original->'native_snapshot','validator_version',original->'validator_version');
 WHEN 'native_party_import_evidence' THEN result:=jsonb_build_object('batch_id',original->'batch_id','source_row_id',original->'source_row_id','entity_type',original->'entity_type','source_key',original->'source_key','native_id',original->'native_id','native_hall_id',original->'native_hall_id','native_customer_id',original->'native_customer_id','native_supplier_id',original->'native_supplier_id','native_staff_id',original->'native_staff_id','native_warehouse_id',original->'native_warehouse_id','warehouse_record',original->'warehouse_record','native_snapshot',original->'native_snapshot','source_snapshot',original->'source_snapshot','selection',original->'selection','authorization',original->'authorization','row_fingerprint',original->'row_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_catalogue_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','category_id',original->'category_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','size_group_id',original->'size_group_id','season_id',original->'season_id','member_group_id',original->'member_group_id','member_size_id',original->'member_size_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'import_native_payment_binding' THEN result:=jsonb_build_object('batch_id',original->'batch_id','entity_type',original->'entity_type','source_key',original->'source_key','source_row_id',original->'source_row_id','native_payment_method_id',original->'native_payment_method_id','native_payment_account_id',original->'native_payment_account_id','native_hall_id',original->'native_hall_id','native_snapshot',original->'native_snapshot','evidence_fingerprint',original->'evidence_fingerprint','validator_version',original->'validator_version');
 WHEN 'product' THEN result:=jsonb_build_object('id',original->'id','product_code',original->'product_code','name',original->'name','category_id',original->'category_id','supplier_id',original->'supplier_id','season_id',original->'season_id','size_group_id',original->'size_group_id','retail_price',to_jsonb((original->>'retail_price')::numeric(18,2)::text),'enabled',original->'enabled','version',original->'version','year',original->'year','system_item_code',original->'system_item_code','thickness',original->'thickness','collar_pants_type',original->'collar_pants_type','purchase_price',to_jsonb((original->>'purchase_price')::numeric(18,2)::text),'wholesale5_price',to_jsonb((original->>'wholesale5_price')::numeric(18,2)::text),'wholesale6_price',to_jsonb((original->>'wholesale6_price')::numeric(18,2)::text),'wholesale7_price',to_jsonb((original->>'wholesale7_price')::numeric(18,2)::text),'wholesale8_price',to_jsonb((original->>'wholesale8_price')::numeric(18,2)::text),'wholesale9_price',to_jsonb((original->>'wholesale9_price')::numeric(18,2)::text),'wholesale10_price',to_jsonb((original->>'wholesale10_price')::numeric(18,2)::text),'minimum_price',to_jsonb((original->>'minimum_price')::numeric(18,2)::text));
 WHEN 'sku' THEN result:=jsonb_build_object('id',original->'id','product_id',original->'product_id','color_id',original->'color_id','fit_id',original->'fit_id','size_id',original->'size_id','sku_code',original->'sku_code','enabled',original->'enabled','version',original->'version');
 WHEN 'hall' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','default_customer_id',original->'default_customer_id','default_sales_warehouse_id',original->'default_sales_warehouse_id','enabled',original->'enabled','version',original->'version');
 WHEN 'warehouse' THEN result:=jsonb_build_object('id',original->'id','hall_id',original->'hall_id','name',original->'name','enabled',original->'enabled','version',original->'version');
 WHEN 'customer' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'supplier' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version','created_at',to_jsonb(to_char((original->>'created_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),'updated_at',to_jsonb(to_char((original->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
 WHEN 'staff' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','hall_id',original->'hall_id','role',original->'role','contact',original->'contact','employment_status',original->'employment_status','version',original->'version');
 WHEN 'product_category' THEN result:=jsonb_build_object('id',original->'id','parent_id',original->'parent_id','name',original->'name','display_order',original->'display_order','version',original->'version');
 WHEN 'color' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version');
 WHEN 'fit' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','enabled',original->'enabled','version',original->'version');
 WHEN 'size' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name');
 WHEN 'size_group_member' THEN result:=jsonb_build_object('size_group_id',original->'size_group_id','size_id',original->'size_id','display_order',original->'display_order');
 WHEN 'season' THEN result:=jsonb_build_object('id',original->'id','code',original->'code','name',original->'name','display_order',original->'display_order');
 WHEN 'sku_barcode' THEN result:=jsonb_build_object('id',original->'id','barcode',original->'barcode','sku_id',original->'sku_id','barcode_kind',original->'barcode_kind','scheme_id',original->'scheme_id','enabled',original->'enabled');
 WHEN 'barcode_scheme' THEN result:=jsonb_build_object('id',original->'id','name',original->'name','barcode_type',original->'barcode_type','rule_description',original->'rule_description','code_length',original->'code_length','rule_version',original->'rule_version','status',original->'status');
 WHEN 'payment_method_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_identity' THEN result:=jsonb_build_object('id',original->'id');
 WHEN 'payment_account_hall' THEN result:=jsonb_build_object('payment_account_id',original->'payment_account_id','hall_id',original->'hall_id');
 ELSE RAISE EXCEPTION 'unknown closure relation' USING ERRCODE='23514'; END CASE;
 PERFORM naijue_erp.history_closure_encode(result); RETURN result;
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_projection_key(relation_name text,projection jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 CASE relation_name
 WHEN 'import_source_row' THEN RETURN projection->>'id';
 WHEN 'history_sales_header' THEN RETURN projection->>'id';
 WHEN 'history_transfer_header' THEN RETURN projection->>'id';
 WHEN 'history_sales_line' THEN RETURN projection->>'id';
 WHEN 'history_transfer_line' THEN RETURN projection->>'id';
 WHEN 'history_sales_settlement' THEN RETURN projection->>'id';
 WHEN 'import_sku_alias' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'old_source_sku_id')),'hex');
 WHEN 'import_stock_contributor' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'source_row_id')),'hex');
 WHEN 'import_header_native_reference' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'native_party_import_evidence' THEN RETURN projection->>'source_row_id';
 WHEN 'import_native_catalogue_binding' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'import_native_payment_binding' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'batch_id',projection->'entity_type',projection->'source_key')),'hex');
 WHEN 'product' THEN RETURN projection->>'id';
 WHEN 'sku' THEN RETURN projection->>'id';
 WHEN 'hall' THEN RETURN projection->>'id';
 WHEN 'warehouse' THEN RETURN projection->>'id';
 WHEN 'customer' THEN RETURN projection->>'id';
 WHEN 'supplier' THEN RETURN projection->>'id';
 WHEN 'staff' THEN RETURN projection->>'id';
 WHEN 'product_category' THEN RETURN projection->>'id';
 WHEN 'color' THEN RETURN projection->>'id';
 WHEN 'fit' THEN RETURN projection->>'id';
 WHEN 'size' THEN RETURN projection->>'id';
 WHEN 'size_group' THEN RETURN projection->>'id';
 WHEN 'size_group_member' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'size_group_id',projection->'size_id')),'hex');
 WHEN 'season' THEN RETURN projection->>'id';
 WHEN 'sku_barcode' THEN RETURN projection->>'id';
 WHEN 'barcode_scheme' THEN RETURN projection->>'id';
 WHEN 'payment_method_identity' THEN RETURN projection->>'id';
 WHEN 'payment_account_identity' THEN RETURN projection->>'id';
 WHEN 'payment_account_hall' THEN RETURN encode(naijue_erp.history_closure_encode(jsonb_build_array(projection->'payment_account_id',projection->'hall_id')),'hex');
 ELSE RAISE EXCEPTION 'unknown closure relation key' USING ERRCODE='23514'; END CASE;
END;
$$;


-- Fixed selected native scope; no current account method/name substitution.
CREATE FUNCTION naijue_erp.history_closure_rows(selected_batch uuid)
RETURNS TABLE(relation_name text,row_key text,projection jsonb) LANGUAGE sql STABLE
SET search_path=pg_catalog,naijue_erp AS $$
WITH RECURSIVE src AS(SELECT * FROM naijue_erp.import_source_row WHERE batch_id=selected_batch),
 party AS(SELECT * FROM naijue_erp.native_party_import_evidence WHERE batch_id=selected_batch),
 refs AS(SELECT * FROM naijue_erp.import_header_native_reference WHERE batch_id=selected_batch),
 cat AS(SELECT * FROM naijue_erp.import_native_catalogue_binding WHERE batch_id=selected_batch),
 pay AS(SELECT * FROM naijue_erp.import_native_payment_binding WHERE batch_id=selected_batch),
 sh AS(SELECT * FROM naijue_erp.history_sales_header WHERE batch_id=selected_batch),
 th AS(SELECT * FROM naijue_erp.history_transfer_header WHERE batch_id=selected_batch),
 aliases AS(SELECT * FROM naijue_erp.import_sku_alias WHERE batch_id=selected_batch),
 contributors AS(SELECT * FROM naijue_erp.import_stock_contributor WHERE batch_id=selected_batch),
 skus AS(SELECT n.* FROM naijue_erp.sku n WHERE n.id IN(SELECT canonical_sku_id FROM aliases
   UNION SELECT sku_id FROM naijue_erp.history_sales_line WHERE batch_id=selected_batch
   UNION SELECT sku_id FROM naijue_erp.history_transfer_line WHERE batch_id=selected_batch)),
 products AS(SELECT n.* FROM naijue_erp.product n WHERE n.id::text IN(SELECT field_provenance->>'native_product_id' FROM src WHERE entity_type='PRODUCT'
   UNION SELECT product_id::text FROM skus)),
 categories(id) AS(SELECT category_id FROM products UNION SELECT category_id FROM cat WHERE category_id IS NOT NULL
   UNION SELECT n.parent_id FROM naijue_erp.product_category n JOIN categories c ON c.id=n.id WHERE n.parent_id IS NOT NULL),
 warehouses AS(SELECT n.* FROM naijue_erp.warehouse n WHERE n.id IN(SELECT native_warehouse_id FROM party
   UNION SELECT warehouse_id FROM sh UNION SELECT from_warehouse_id FROM th UNION SELECT to_warehouse_id FROM th UNION SELECT warehouse_id FROM contributors)),
 staffs AS(SELECT n.* FROM naijue_erp.staff n WHERE n.id IN(SELECT native_staff_id FROM party UNION SELECT native_staff_id FROM refs UNION SELECT salesperson_id FROM sh)),
 halls AS(SELECT n.* FROM naijue_erp.hall n WHERE n.id IN(SELECT native_hall_id FROM party UNION SELECT native_hall_id FROM refs UNION SELECT native_hall_id FROM pay
   UNION SELECT hall_id FROM sh UNION SELECT created_hall_id FROM sh UNION SELECT created_hall_id FROM th UNION SELECT hall_id FROM warehouses UNION SELECT hall_id FROM staffs)),
 customers AS(SELECT n.* FROM naijue_erp.customer n WHERE n.id IN(SELECT native_customer_id FROM party UNION SELECT native_customer_id FROM refs UNION SELECT customer_id FROM sh)),
 suppliers AS(SELECT n.* FROM naijue_erp.supplier n WHERE n.id IN(SELECT native_supplier_id FROM party UNION SELECT supplier_id FROM products)),
 colors AS(SELECT n.* FROM naijue_erp.color n WHERE n.id IN(SELECT color_id FROM cat UNION SELECT color_id FROM skus)),
 fits AS(SELECT n.* FROM naijue_erp.fit n WHERE n.id IN(SELECT fit_id FROM cat UNION SELECT fit_id FROM skus)),
 sizes AS(SELECT n.* FROM naijue_erp.size n WHERE n.id IN(SELECT size_id FROM cat UNION SELECT size_id FROM skus)),
 groups AS(SELECT n.* FROM naijue_erp.size_group n WHERE n.id IN(SELECT size_group_id FROM cat UNION SELECT size_group_id FROM products)),
 seasons AS(SELECT n.* FROM naijue_erp.season n WHERE n.id IN(SELECT season_id FROM cat UNION SELECT season_id FROM products)),
 members AS(SELECT n.* FROM naijue_erp.size_group_member n WHERE n.size_group_id IN(SELECT id FROM groups)),
 barcodes AS(SELECT n.* FROM naijue_erp.sku_barcode n WHERE n.sku_id IN(SELECT id FROM skus)),
 schemes AS(SELECT n.* FROM naijue_erp.barcode_scheme n WHERE n.id IN(SELECT scheme_id FROM barcodes)),
 settlements AS(SELECT * FROM naijue_erp.history_sales_settlement WHERE batch_id=selected_batch),
 methods AS(SELECT n.* FROM naijue_erp.payment_method n WHERE n.id IN(SELECT native_payment_method_id FROM pay UNION SELECT payment_method_id_snapshot FROM settlements)),
 accounts AS(SELECT n.* FROM naijue_erp.payment_account n WHERE n.id IN(SELECT native_payment_account_id FROM pay UNION SELECT payment_account_id FROM settlements)),
 account_halls AS(SELECT n.* FROM naijue_erp.payment_account_hall n WHERE EXISTS(SELECT 1 FROM pay e WHERE e.entity_type='PAYMENT_ACCOUNT_HALL'
   AND e.native_payment_account_id=n.payment_account_id AND e.native_hall_id=n.hall_id))
SELECT 'import_source_row'::text,naijue_erp.history_closure_projection_key('import_source_row',p.value),p.value FROM src n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_source_row',to_jsonb(n)) value) p
UNION ALL
SELECT 'history_sales_header'::text,naijue_erp.history_closure_projection_key('history_sales_header',p.value),p.value FROM sh n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('history_sales_header',to_jsonb(n)) value) p
UNION ALL
SELECT 'history_transfer_header'::text,naijue_erp.history_closure_projection_key('history_transfer_header',p.value),p.value FROM th n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('history_transfer_header',to_jsonb(n)) value) p
UNION ALL
SELECT 'history_sales_line'::text,naijue_erp.history_closure_projection_key('history_sales_line',p.value),p.value FROM naijue_erp.history_sales_line n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('history_sales_line',to_jsonb(n)) value) p WHERE n.batch_id=selected_batch
UNION ALL
SELECT 'history_transfer_line'::text,naijue_erp.history_closure_projection_key('history_transfer_line',p.value),p.value FROM naijue_erp.history_transfer_line n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('history_transfer_line',to_jsonb(n)) value) p WHERE n.batch_id=selected_batch
UNION ALL
SELECT 'history_sales_settlement'::text,naijue_erp.history_closure_projection_key('history_sales_settlement',p.value),p.value FROM settlements n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('history_sales_settlement',to_jsonb(n)) value) p
UNION ALL
SELECT 'import_sku_alias'::text,naijue_erp.history_closure_projection_key('import_sku_alias',p.value),p.value FROM aliases n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_sku_alias',to_jsonb(n)) value) p
UNION ALL
SELECT 'import_stock_contributor'::text,naijue_erp.history_closure_projection_key('import_stock_contributor',p.value),p.value FROM contributors n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_stock_contributor',to_jsonb(n)) value) p
UNION ALL
SELECT 'import_header_native_reference'::text,naijue_erp.history_closure_projection_key('import_header_native_reference',p.value),p.value FROM refs n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_header_native_reference',to_jsonb(n)) value) p
UNION ALL
SELECT 'native_party_import_evidence'::text,naijue_erp.history_closure_projection_key('native_party_import_evidence',p.value),p.value FROM party n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('native_party_import_evidence',to_jsonb(n)) value) p
UNION ALL
SELECT 'import_native_catalogue_binding'::text,naijue_erp.history_closure_projection_key('import_native_catalogue_binding',p.value),p.value FROM cat n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_native_catalogue_binding',to_jsonb(n)) value) p
UNION ALL
SELECT 'import_native_payment_binding'::text,naijue_erp.history_closure_projection_key('import_native_payment_binding',p.value),p.value FROM pay n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('import_native_payment_binding',to_jsonb(n)) value) p
UNION ALL
SELECT 'product'::text,naijue_erp.history_closure_projection_key('product',p.value),p.value FROM products n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('product',to_jsonb(n)) value) p
UNION ALL
SELECT 'sku'::text,naijue_erp.history_closure_projection_key('sku',p.value),p.value FROM skus n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('sku',to_jsonb(n)) value) p
UNION ALL
SELECT 'hall'::text,naijue_erp.history_closure_projection_key('hall',p.value),p.value FROM halls n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('hall',to_jsonb(n)) value) p
UNION ALL
SELECT 'warehouse'::text,naijue_erp.history_closure_projection_key('warehouse',p.value),p.value FROM warehouses n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('warehouse',to_jsonb(n)) value) p
UNION ALL
SELECT 'customer'::text,naijue_erp.history_closure_projection_key('customer',p.value),p.value FROM customers n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('customer',to_jsonb(n)) value) p
UNION ALL
SELECT 'supplier'::text,naijue_erp.history_closure_projection_key('supplier',p.value),p.value FROM suppliers n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('supplier',to_jsonb(n)) value) p
UNION ALL
SELECT 'staff'::text,naijue_erp.history_closure_projection_key('staff',p.value),p.value FROM staffs n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('staff',to_jsonb(n)) value) p
UNION ALL
SELECT 'product_category'::text,naijue_erp.history_closure_projection_key('product_category',p.value),p.value FROM naijue_erp.product_category n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('product_category',to_jsonb(n)) value) p WHERE n.id IN(SELECT id FROM categories)
UNION ALL
SELECT 'color'::text,naijue_erp.history_closure_projection_key('color',p.value),p.value FROM colors n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('color',to_jsonb(n)) value) p
UNION ALL
SELECT 'fit'::text,naijue_erp.history_closure_projection_key('fit',p.value),p.value FROM fits n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('fit',to_jsonb(n)) value) p
UNION ALL
SELECT 'size'::text,naijue_erp.history_closure_projection_key('size',p.value),p.value FROM sizes n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('size',to_jsonb(n)) value) p
UNION ALL
SELECT 'size_group'::text,naijue_erp.history_closure_projection_key('size_group',p.value),p.value FROM groups n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('size_group',to_jsonb(n)) value) p
UNION ALL
SELECT 'size_group_member'::text,naijue_erp.history_closure_projection_key('size_group_member',p.value),p.value FROM members n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('size_group_member',to_jsonb(n)) value) p
UNION ALL
SELECT 'season'::text,naijue_erp.history_closure_projection_key('season',p.value),p.value FROM seasons n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('season',to_jsonb(n)) value) p
UNION ALL
SELECT 'sku_barcode'::text,naijue_erp.history_closure_projection_key('sku_barcode',p.value),p.value FROM barcodes n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('sku_barcode',to_jsonb(n)) value) p
UNION ALL
SELECT 'barcode_scheme'::text,naijue_erp.history_closure_projection_key('barcode_scheme',p.value),p.value FROM schemes n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('barcode_scheme',to_jsonb(n)) value) p
UNION ALL
SELECT 'payment_method_identity'::text,naijue_erp.history_closure_projection_key('payment_method_identity',p.value),p.value FROM methods n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('payment_method_identity',to_jsonb(n)) value) p
UNION ALL
SELECT 'payment_account_identity'::text,naijue_erp.history_closure_projection_key('payment_account_identity',p.value),p.value FROM accounts n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('payment_account_identity',to_jsonb(n)) value) p
UNION ALL
SELECT 'payment_account_hall'::text,naijue_erp.history_closure_projection_key('payment_account_hall',p.value),p.value FROM account_halls n CROSS JOIN LATERAL(SELECT naijue_erp.history_closure_projection('payment_account_hall',to_jsonb(n)) value) p;
$$;

CREATE FUNCTION naijue_erp.history_closure_document_rows(selected_batch uuid,kind text,header uuid,source_rows boolean)
RETURNS TABLE(relation_name text,row_key text,projection jsonb) LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE header_source uuid;source_identity text;
BEGIN
 IF kind='SALES' THEN SELECT h.source_row_id,s.source_key INTO STRICT header_source,source_identity FROM naijue_erp.history_sales_header h
  JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id WHERE h.batch_id=selected_batch AND h.id=header;
 ELSIF kind='TRANSFER' THEN SELECT h.source_row_id,s.source_key INTO STRICT header_source,source_identity FROM naijue_erp.history_transfer_header h
  JOIN naijue_erp.import_source_row s ON s.batch_id=h.batch_id AND s.id=h.source_row_id WHERE h.batch_id=selected_batch AND h.id=header;
 ELSE RAISE EXCEPTION 'exact document kind required' USING ERRCODE='23514'; END IF;
 IF source_rows THEN
  RETURN QUERY SELECT 'import_source_row'::text,s.id::text,naijue_erp.history_closure_projection('import_source_row',to_jsonb(s))
   FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND(s.id=header_source OR(
    s.entity_type=ANY(CASE WHEN kind='SALES' THEN ARRAY['SALES_LINE','SETTLEMENT'] ELSE ARRAY['TRANSFER_LINE'] END)
    AND s.normalized_fields->>'单据来源编号'=source_identity));
 ELSIF kind='SALES' THEN
  RETURN QUERY SELECT 'history_sales_header'::text,h.id::text,naijue_erp.history_closure_projection('history_sales_header',to_jsonb(h)) FROM naijue_erp.history_sales_header h WHERE h.batch_id=selected_batch AND h.id=header
   UNION ALL SELECT 'history_sales_line',l.id::text,naijue_erp.history_closure_projection('history_sales_line',to_jsonb(l)) FROM naijue_erp.history_sales_line l WHERE l.batch_id=selected_batch AND l.header_id=header
   UNION ALL SELECT 'history_sales_settlement',s.id::text,naijue_erp.history_closure_projection('history_sales_settlement',to_jsonb(s)) FROM naijue_erp.history_sales_settlement s WHERE s.batch_id=selected_batch AND s.header_id=header;
 ELSE
  RETURN QUERY SELECT 'history_transfer_header'::text,h.id::text,naijue_erp.history_closure_projection('history_transfer_header',to_jsonb(h)) FROM naijue_erp.history_transfer_header h WHERE h.batch_id=selected_batch AND h.id=header
   UNION ALL SELECT 'history_transfer_line',l.id::text,naijue_erp.history_closure_projection('history_transfer_line',to_jsonb(l)) FROM naijue_erp.history_transfer_line l WHERE l.batch_id=selected_batch AND l.header_id=header;
 END IF;
END;
$$;
CREATE FUNCTION naijue_erp.history_closure_digest(selected_batch uuid,scope text,segment text,kind text DEFAULT NULL,header uuid DEFAULT NULL,documents jsonb DEFAULT '[]'::jsonb) RETURNS text
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE state bytea;previous bytea;identity bytea;r record;row_count bigint:=0;
BEGIN
 IF segment NOT IN('source','typed','document-source','document-typed','manifest') THEN
  RAISE EXCEPTION 'exact closure segment required' USING ERRCODE='23514';END IF;
 state:=naijue_erp.history_closure_seed(scope);
 FOR r IN SELECT * FROM(
  SELECT 'import_source_row'::text relation_name,s.id::text row_key,naijue_erp.history_closure_projection('import_source_row',to_jsonb(s)) projection
   FROM naijue_erp.import_source_row s WHERE segment='source' AND s.batch_id=selected_batch
  UNION ALL SELECT p.* FROM naijue_erp.history_closure_rows(selected_batch) p WHERE segment='typed' AND p.relation_name<>'import_source_row'
  UNION ALL SELECT d.* FROM naijue_erp.history_closure_document_rows(selected_batch,kind,header,segment='document-source') d WHERE segment IN('document-source','document-typed')
  UNION ALL SELECT 'document_manifest',encode(naijue_erp.history_closure_encode(jsonb_build_array(d->'kind',d->'headerId')),'hex'),d
   FROM jsonb_array_elements(documents) d WHERE segment='manifest'
 ) q ORDER BY convert_to(q.relation_name,'UTF8'),convert_to(q.row_key,'UTF8') LOOP
  identity:=convert_to(r.relation_name,'UTF8')||decode('00','hex')||convert_to(r.row_key,'UTF8');
  IF previous IS NOT NULL AND identity<=previous THEN RAISE EXCEPTION 'strict unique closure row ordering required' USING ERRCODE='23514';END IF;
  row_count:=row_count+1;IF row_count>2147483645 THEN RAISE EXCEPTION 'closure stream row limit' USING ERRCODE='23514';END IF;
  state:=naijue_erp.history_closure_fold(state,naijue_erp.history_closure_row_hash(r.relation_name,r.row_key,r.projection));previous:=identity;
 END LOOP;
 RETURN naijue_erp.history_closure_finish(scope,row_count,state);
END;
$$;

CREATE TABLE naijue_erp.import_history_closure_manifest (
 batch_id uuid PRIMARY KEY REFERENCES naijue_erp.import_batch(id),
 validator_version text NOT NULL CHECK(validator_version='HISTORY_TYPED_CLOSURE_V1'),
 selection_sha256 text NOT NULL CHECK(selection_sha256~'^[0-9a-f]{64}$'),
 authorized_payload_hash text NOT NULL CHECK(authorized_payload_hash~'^[0-9a-f]{64}$'),
 source_manifest_sha256 text NOT NULL CHECK(source_manifest_sha256~'^[0-9a-f]{64}$'),
 typed_manifest_sha256 text NOT NULL CHECK(typed_manifest_sha256~'^[0-9a-f]{64}$'),
 document_manifest_sha256 text NOT NULL CHECK(document_manifest_sha256~'^[0-9a-f]{64}$'),
 expected_counts jsonb NOT NULL CHECK(naijue_erp.history_closure_count_map(expected_counts,ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'])),
 source_entity_counts jsonb NOT NULL CHECK(naijue_erp.history_closure_count_map(source_entity_counts,ARRAY['HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER','CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE','INVENTORY_BASELINE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'])),
 document_count integer NOT NULL CHECK(document_count BETWEEN 0 AND 100000)
);
CREATE TABLE naijue_erp.import_history_document_manifest (
 batch_id uuid NOT NULL REFERENCES naijue_erp.import_history_closure_manifest(batch_id),
 document_kind text NOT NULL CHECK(document_kind IN('SALES','TRANSFER')),source_key text NOT NULL CHECK(length(btrim(source_key))>0),
 header_source_row_id uuid NOT NULL, sales_header_id uuid, transfer_header_id uuid,
 header_source_sha256 text NOT NULL CHECK(header_source_sha256~'^[0-9a-f]{64}$'),
 line_count integer NOT NULL CHECK(line_count>0),settlement_count integer NOT NULL CHECK(settlement_count>=0),
 source_document_sha256 text NOT NULL CHECK(source_document_sha256~'^[0-9a-f]{64}$'),
 typed_document_sha256 text NOT NULL CHECK(typed_document_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(batch_id,document_kind,source_key),UNIQUE(batch_id,header_source_row_id),UNIQUE(batch_id,sales_header_id),UNIQUE(batch_id,transfer_header_id),
 FOREIGN KEY(batch_id,header_source_row_id) REFERENCES naijue_erp.import_source_row(batch_id,id),
 FOREIGN KEY(batch_id,sales_header_id) REFERENCES naijue_erp.history_sales_header(batch_id,id),
 FOREIGN KEY(batch_id,transfer_header_id) REFERENCES naijue_erp.history_transfer_header(batch_id,id),
 CHECK((document_kind='SALES' AND sales_header_id IS NOT NULL AND transfer_header_id IS NULL)
  OR(document_kind='TRANSFER' AND sales_header_id IS NULL AND transfer_header_id IS NOT NULL AND settlement_count=0))
);



-- Complete STAGE readback. Expected roots come only from independently authenticated
-- source/prepared facts supplied by the trusted application authorizer, never SQL->expected.
CREATE FUNCTION naijue_erp.assert_history_typed_closure(selected_batch uuid,plan jsonb,documents jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;actual_counts jsonb;entity_counts jsonb;d jsonb;h record;r record;
 expected_keys text[]:=ARRAY['version','selectionSha256','authorizedPayloadHash','sourceManifestSha256','typedManifestSha256','documentManifestSha256','expectedCounts','sourceEntityCounts','documentCount'];
 doc_keys text[]:=ARRAY['kind','sourceKey','headerSourceRowId','headerId','headerSourceSha256','lineCount','settlementCount','sourceDocumentSha256','typedDocumentSha256'];
 entity_keys text[]:=ARRAY['HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER','CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON','PRODUCT','SKU','BARCODE','INVENTORY_BASELINE','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','SALES_HEADER','SALES_LINE','SETTLEMENT','TRANSFER_HEADER','TRANSFER_LINE'];
 count_keys text[]:=ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','import_source_row','import_sku_alias','import_stock_contributor','barcodes'];
 key text;scope text;bytes bigint;lines bigint;settlements bigint;source_lines bigint;source_settlements bigint;
BEGIN
 IF jsonb_typeof(plan) IS DISTINCT FROM 'object' OR jsonb_typeof(documents) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'exact object plan and document array required' USING ERRCODE='23514';END IF;
 IF (jsonb_typeof(plan)='object' AND plan ?& expected_keys AND plan-expected_keys='{}'::jsonb
   AND plan->>'version'='HISTORY_TYPED_CLOSURE_V1' AND jsonb_typeof(documents)='array') IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'exact full history closure plan/documents required' USING ERRCODE='23514';END IF;
 FOREACH key IN ARRAY ARRAY['selectionSha256','authorizedPayloadHash','sourceManifestSha256','typedManifestSha256','documentManifestSha256'] LOOP
  IF (jsonb_typeof(plan->key)='string' AND plan->>key~'^[0-9a-f]{64}$') IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'exact authenticated closure SHA required' USING ERRCODE='23514';END IF;
 END LOOP;
 IF NOT naijue_erp.history_closure_count_map(plan->'expectedCounts',count_keys)
  OR NOT naijue_erp.history_closure_count_map(plan->'sourceEntityCounts',entity_keys)
  OR NOT naijue_erp.history_closure_count_map(jsonb_build_object('n',plan->'documentCount'),ARRAY['n']) THEN
  RAISE EXCEPTION 'exact finite closure count maps required' USING ERRCODE='23514';END IF;
 IF jsonb_array_length(documents)>100000 OR (plan->>'documentCount')::integer<>jsonb_array_length(documents) THEN
  RAISE EXCEPTION 'complete bounded document set required' USING ERRCODE='23514';END IF;
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=selected_batch FOR UPDATE;
 IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN('STAGED','VALIDATING','PASSED','IMPORTED')
  OR EXISTS(SELECT 1 FROM naijue_erp.import_batch x WHERE x.status='IMPORTED' AND x.id<>selected_batch)
  OR b.source_hash IS DISTINCT FROM plan->>'selectionSha256' OR b.history_payload_hash IS DISTINCT FROM plan->>'authorizedPayloadHash'
  OR b.history_expected_counts IS DISTINCT FROM plan->'expectedCounts' THEN
  RAISE EXCEPTION 'exact selected closure source/metadata scope required' USING ERRCODE='23514';END IF;
 FOREACH key IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER'] LOOP
  IF (b.checkpoint->'counts'->>key)::bigint IS DISTINCT FROM (b.checkpoint->'expected'->>key)::bigint THEN
   RAISE EXCEPTION 'all original nonfinal accounting must be complete' USING ERRCODE='23514';END IF;
 END LOOP;
 -- Offline STAGE takes a fixed-order SHARE table lock to exclude ordinary native
 -- writes and phantoms while all semantic facts are compared. This is stronger
 -- than row locks and is explicitly not a live request path.
 LOCK TABLE naijue_erp.product,naijue_erp.sku,naijue_erp.product_category,naijue_erp.color,naijue_erp.fit,naijue_erp.size,
  naijue_erp.size_group,naijue_erp.season,naijue_erp.hall,naijue_erp.customer,naijue_erp.staff,naijue_erp.warehouse,
  naijue_erp.supplier,naijue_erp.size_group_member,naijue_erp.sku_barcode,naijue_erp.barcode_scheme,
  naijue_erp.payment_method,naijue_erp.payment_account,naijue_erp.payment_account_hall IN SHARE MODE;
 PERFORM s.id FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch ORDER BY s.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND NOT s.entity_type=ANY(entity_keys)) THEN
  RAISE EXCEPTION 'unknown or unsupported source entity' USING ERRCODE='23514';END IF;
 SELECT jsonb_object_agg(k,(SELECT count(*) FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND s.entity_type=k))
  INTO entity_counts FROM unnest(entity_keys) k;
 SELECT jsonb_build_object('import_source_row',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=selected_batch),
  'import_sku_alias',(SELECT count(*) FROM naijue_erp.import_sku_alias WHERE batch_id=selected_batch),
  'import_stock_contributor',(SELECT count(*) FROM naijue_erp.import_stock_contributor WHERE batch_id=selected_batch),
  'barcodes',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=selected_batch AND entity_type='BARCODE'),
  'history_sales_header',(SELECT count(*) FROM naijue_erp.history_sales_header WHERE batch_id=selected_batch),
  'history_sales_line',(SELECT count(*) FROM naijue_erp.history_sales_line WHERE batch_id=selected_batch),
  'history_sales_settlement',(SELECT count(*) FROM naijue_erp.history_sales_settlement WHERE batch_id=selected_batch),
  'history_transfer_header',(SELECT count(*) FROM naijue_erp.history_transfer_header WHERE batch_id=selected_batch),
  'history_transfer_line',(SELECT count(*) FROM naijue_erp.history_transfer_line WHERE batch_id=selected_batch)) INTO actual_counts;
 IF entity_counts IS DISTINCT FROM plan->'sourceEntityCounts' OR actual_counts IS DISTINCT FROM plan->'expectedCounts' THEN
  RAISE EXCEPTION 'complete independent source and typed counts differ' USING ERRCODE='23514';END IF;
 -- Every selected original occurrence must have its exact typed/native carrier.
 FOR r IN SELECT s.* FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch ORDER BY s.id LOOP
  IF r.entity_type IN('HALL','WAREHOUSE','STAFF','CUSTOMER','SUPPLIER') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key
    AND naijue_erp.history_closure_projection('import_source_row',e.source_snapshot)=naijue_erp.history_closure_projection('import_source_row',to_jsonb(r))) THEN
    RAISE EXCEPTION 'original party occurrence/creation carrier missing or changed' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type IN('CATEGORY','COLOR','FIT','SIZE','SIZE_GROUP','SIZE_GROUP_MEMBER','SEASON') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key) THEN RAISE EXCEPTION 'original catalogue carrier missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type IN('PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL') THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_native_payment_binding e WHERE e.batch_id=selected_batch AND e.source_row_id=r.id
    AND e.entity_type=r.entity_type AND e.source_key=r.source_key) THEN RAISE EXCEPTION 'original payment carrier missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='PRODUCT' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.product n WHERE n.id::text=r.field_provenance->>'native_product_id') THEN RAISE EXCEPTION 'original product binding missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SKU' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id=selected_batch AND a.source_row_id=r.id AND a.old_source_sku_id=r.source_key) THEN RAISE EXCEPTION 'original SKU alias missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='INVENTORY_BASELINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=selected_batch AND c.source_row_id=r.id AND c.old_source_sku_id=r.raw_fields->>'SKU来源编号') THEN RAISE EXCEPTION 'original contributor missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='BARCODE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.sku_barcode bc WHERE bc.barcode=r.field_provenance->>'native_barcode' AND bc.sku_id::text=r.field_provenance->>'native_sku_id'
    AND r.raw_fields->>'绑定范围'='SKU' AND r.normalized_fields->>'绑定范围'='SKU') THEN RAISE EXCEPTION 'effective SKU barcode missing or product scope forbidden' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SALES_HEADER' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_header h WHERE h.batch_id=selected_batch AND h.source_row_id=r.id) THEN RAISE EXCEPTION 'original sales header missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='TRANSFER_HEADER' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_header h WHERE h.batch_id=selected_batch AND h.source_row_id=r.id) THEN RAISE EXCEPTION 'original transfer header missing' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SALES_LINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_line l JOIN naijue_erp.history_sales_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original sales line missing or wrong document' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='TRANSFER_LINE' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_transfer_line l JOIN naijue_erp.history_transfer_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original transfer line missing or wrong document' USING ERRCODE='23514';END IF;
  ELSIF r.entity_type='SETTLEMENT' THEN
   IF NOT EXISTS(SELECT 1 FROM naijue_erp.history_sales_settlement l JOIN naijue_erp.history_sales_header h ON h.batch_id=l.batch_id AND h.id=l.header_id
    JOIN naijue_erp.import_source_row hs ON hs.batch_id=h.batch_id AND hs.id=h.source_row_id
    WHERE l.batch_id=selected_batch AND l.source_row_id=r.id AND r.normalized_fields->>'单据来源编号'=hs.source_key AND r.raw_fields->>'单据来源编号'=hs.source_key) THEN RAISE EXCEPTION 'original settlement missing or wrong document' USING ERRCODE='23514';END IF;
  END IF;
 END LOOP;
 -- Reverse coverage is separate from source counts/digest. Extra typed identities
 -- cannot disappear into counts or a different source kind.
 IF EXISTS(SELECT 1 FROM (
  SELECT 'SALES_HEADER'::text entity_type,h.source_row_id FROM naijue_erp.history_sales_header h WHERE h.batch_id=selected_batch
  UNION ALL SELECT 'SALES_LINE',l.source_row_id FROM naijue_erp.history_sales_line l WHERE l.batch_id=selected_batch
  UNION ALL SELECT 'SETTLEMENT',l.source_row_id FROM naijue_erp.history_sales_settlement l WHERE l.batch_id=selected_batch
  UNION ALL SELECT 'TRANSFER_HEADER',h.source_row_id FROM naijue_erp.history_transfer_header h WHERE h.batch_id=selected_batch
  UNION ALL SELECT 'TRANSFER_LINE',l.source_row_id FROM naijue_erp.history_transfer_line l WHERE l.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.native_party_import_evidence e WHERE e.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.import_native_catalogue_binding e WHERE e.batch_id=selected_batch
  UNION ALL SELECT e.entity_type,e.source_row_id FROM naijue_erp.import_native_payment_binding e WHERE e.batch_id=selected_batch
  UNION ALL SELECT 'SKU',a.source_row_id FROM naijue_erp.import_sku_alias a WHERE a.batch_id=selected_batch
  UNION ALL SELECT 'INVENTORY_BASELINE',c.source_row_id FROM naijue_erp.import_stock_contributor c WHERE c.batch_id=selected_batch
 ) t WHERE NOT EXISTS(SELECT 1 FROM naijue_erp.import_source_row s WHERE s.batch_id=selected_batch AND s.id=t.source_row_id AND s.entity_type=t.entity_type)) THEN
  RAISE EXCEPTION 'extra wrong-kind or orphan typed carrier' USING ERRCODE='23514';END IF;
 bytes:=octet_length(naijue_erp.history_closure_encode(jsonb_build_object('batchId',selected_batch::text,'fixedSourceNamespace',b.source_name,'plan',plan)));
 FOR d IN SELECT value FROM jsonb_array_elements(documents) LOOP
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'exact document object required' USING ERRCODE='23514';END IF;
  IF (jsonb_typeof(d)='object' AND d ?& doc_keys AND d-doc_keys='{}'::jsonb AND d->>'kind' IN('SALES','TRANSFER')
    AND jsonb_typeof(d->'sourceKey')='string' AND length(btrim(d->>'sourceKey'))>0 AND octet_length(convert_to(d->>'sourceKey','UTF8'))<=65536) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'exact document descriptor shape required' USING ERRCODE='23514';END IF;
  FOREACH key IN ARRAY ARRAY['headerSourceRowId','headerId'] LOOP
   IF (jsonb_typeof(d->key)='string' AND d->>key~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'exact document UUID required' USING ERRCODE='23514';END IF;
  END LOOP;
  FOREACH key IN ARRAY ARRAY['headerSourceSha256','sourceDocumentSha256','typedDocumentSha256'] LOOP
   IF (jsonb_typeof(d->key)='string' AND d->>key~'^[0-9a-f]{64}$') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'exact document digest required' USING ERRCODE='23514';END IF;
  END LOOP;
  IF NOT naijue_erp.history_closure_count_map(jsonb_build_object('lineCount',d->'lineCount','settlementCount',d->'settlementCount'),ARRAY['lineCount','settlementCount'])
   OR (d->>'lineCount')::integer=0 OR(d->>'kind'='TRANSFER' AND (d->>'settlementCount')::integer<>0) THEN
   RAISE EXCEPTION 'bounded nonempty original document lines required; no implicit zero-header permission' USING ERRCODE='23514';END IF;
  bytes:=bytes+octet_length(naijue_erp.history_closure_encode(d));IF bytes>67108864 THEN RAISE EXCEPTION 'closure document byte limit' USING ERRCODE='23514';END IF;
  SELECT s.*,actual_header.id header_id INTO STRICT h FROM naijue_erp.import_source_row s JOIN(
    SELECT x.id,x.source_row_id FROM naijue_erp.history_sales_header x WHERE d->>'kind'='SALES' AND x.batch_id=selected_batch
    UNION ALL SELECT x.id,x.source_row_id FROM naijue_erp.history_transfer_header x WHERE d->>'kind'='TRANSFER' AND x.batch_id=selected_batch
   ) actual_header ON actual_header.source_row_id=s.id WHERE s.batch_id=selected_batch AND actual_header.id=(d->>'headerId')::uuid;
  IF h.id::text IS DISTINCT FROM d->>'headerSourceRowId' OR h.source_key IS DISTINCT FROM d->>'sourceKey'
   OR naijue_erp.history_closure_row_hash('import_source_row',h.id::text,naijue_erp.history_closure_projection('import_source_row',to_jsonb(h)-'header_id')) IS DISTINCT FROM d->>'headerSourceSha256' THEN
   RAISE EXCEPTION 'document header/source identity or complete source hash differs' USING ERRCODE='23514';END IF;
  SELECT count(*) FILTER(WHERE s.entity_type=CASE WHEN d->>'kind'='SALES' THEN 'SALES_LINE' ELSE 'TRANSFER_LINE' END),
   count(*) FILTER(WHERE s.entity_type='SETTLEMENT') INTO source_lines,source_settlements FROM naijue_erp.import_source_row s
   WHERE s.batch_id=selected_batch AND s.normalized_fields->>'单据来源编号'=d->>'sourceKey'
    AND s.entity_type=ANY(CASE WHEN d->>'kind'='SALES' THEN ARRAY['SALES_LINE','SETTLEMENT'] ELSE ARRAY['TRANSFER_LINE'] END);
  IF d->>'kind'='SALES' THEN SELECT count(*) INTO lines FROM naijue_erp.history_sales_line WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;
   SELECT count(*) INTO settlements FROM naijue_erp.history_sales_settlement WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;
  ELSE SELECT count(*) INTO lines FROM naijue_erp.history_transfer_line WHERE batch_id=selected_batch AND header_id=(d->>'headerId')::uuid;settlements:=0;END IF;
  IF lines IS DISTINCT FROM (d->>'lineCount')::bigint OR lines IS DISTINCT FROM source_lines OR settlements IS DISTINCT FROM (d->>'settlementCount')::bigint OR settlements IS DISTINCT FROM source_settlements THEN
   RAISE EXCEPTION 'per-document original/typed line or settlement coverage differs' USING ERRCODE='23514';END IF;
  scope:=selected_batch::text||':'||(d->>'kind')||':'||(d->>'headerId');
  IF naijue_erp.history_closure_digest(selected_batch,'document-source:'||scope,'document-source',d->>'kind',(d->>'headerId')::uuid) IS DISTINCT FROM d->>'sourceDocumentSha256'
   OR naijue_erp.history_closure_digest(selected_batch,'document-typed:'||scope,'document-typed',d->>'kind',(d->>'headerId')::uuid) IS DISTINCT FROM d->>'typedDocumentSha256' THEN
   RAISE EXCEPTION 'complete original/typed document digest differs' USING ERRCODE='23514';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(documents) d GROUP BY d->>'headerSourceRowId' HAVING count(*)<>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents) d GROUP BY d->>'kind',d->>'headerId' HAVING count(*)<>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(documents) d GROUP BY d->>'kind',d->>'sourceKey' HAVING count(*)<>1)
  OR jsonb_array_length(documents)<>(actual_counts->>'history_sales_header')::bigint+(actual_counts->>'history_transfer_header')::bigint THEN
  RAISE EXCEPTION 'complete unique bidirectional document coverage required' USING ERRCODE='23514';END IF;
 IF naijue_erp.history_closure_digest(selected_batch,'source:'||selected_batch::text,'source') IS DISTINCT FROM plan->>'sourceManifestSha256'
  OR naijue_erp.history_closure_digest(selected_batch,'typed:'||selected_batch::text,'typed') IS DISTINCT FROM plan->>'typedManifestSha256'
  OR naijue_erp.history_closure_digest(selected_batch,'documents:'||selected_batch::text,'manifest',NULL,NULL,documents) IS DISTINCT FROM plan->>'documentManifestSha256' THEN
  RAISE EXCEPTION 'complete authenticated source/typed/document manifest digest differs' USING ERRCODE='23514';END IF;
END;
$$;

CREATE FUNCTION naijue_erp.guard_history_closure_stage() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE;target text;
BEGIN
 PERFORM naijue_erp.cutoff_import_lock();
 SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id=NEW.batch_id FOR UPDATE;
 IF b.mapping_version<>'V2_HISTORY_NULLABLE_1' OR b.status NOT IN('STAGED','VALIDATING')
   OR EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED') THEN
  RAISE EXCEPTION 'history closure selected staging scope closed' USING ERRCODE='23514'; END IF;
 FOREACH target IN ARRAY ARRAY['WAREHOUSE','SKU','INVENTORY_LEDGER'] LOOP
  IF (b.checkpoint->'counts'->>target)::bigint IS DISTINCT FROM (b.checkpoint->'expected'->>target)::bigint THEN
   RAISE EXCEPTION 'history closure requires completed nonfinal accounting scope' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF TG_TABLE_NAME='import_history_closure_manifest' THEN
  IF NEW.selection_sha256 IS DISTINCT FROM b.source_hash OR NEW.authorized_payload_hash IS DISTINCT FROM b.history_payload_hash
    OR NEW.expected_counts IS DISTINCT FROM b.history_expected_counts OR (b.checkpoint->'counts'->>'IMPORT_BATCH')::bigint<>0 THEN
   RAISE EXCEPTION 'history closure original metadata differs' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_history_closure_manifest m WHERE m.batch_id=NEW.batch_id
    AND m.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296)) THEN
   RAISE EXCEPTION 'history document closure requires the same new manifest transaction' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER history_closure_stage BEFORE INSERT ON naijue_erp.import_history_closure_manifest FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_closure_stage();
CREATE TRIGGER history_document_closure_stage BEFORE INSERT ON naijue_erp.import_history_document_manifest FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_closure_stage();
CREATE TRIGGER history_closure_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_history_closure_manifest FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_document_closure_immutable BEFORE UPDATE OR DELETE ON naijue_erp.import_history_document_manifest FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_closure_no_truncate BEFORE TRUNCATE ON naijue_erp.import_history_closure_manifest EXECUTE FUNCTION naijue_erp.reject_immutable_change();
CREATE TRIGGER history_document_closure_no_truncate BEFORE TRUNCATE ON naijue_erp.import_history_document_manifest EXECUTE FUNCTION naijue_erp.reject_immutable_change();
-- Complete STAGE commit validation; publication remains a separate explicit closed gate.
CREATE FUNCTION naijue_erp.validate_history_closure_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE m naijue_erp.import_history_closure_manifest%ROWTYPE;plan jsonb;documents jsonb;
BEGIN
 SELECT * INTO STRICT m FROM naijue_erp.import_history_closure_manifest WHERE batch_id=NEW.batch_id;
 plan:=jsonb_build_object('version',m.validator_version,'selectionSha256',m.selection_sha256,'authorizedPayloadHash',m.authorized_payload_hash,
  'sourceManifestSha256',m.source_manifest_sha256,'typedManifestSha256',m.typed_manifest_sha256,'documentManifestSha256',m.document_manifest_sha256,
  'expectedCounts',m.expected_counts,'sourceEntityCounts',m.source_entity_counts,'documentCount',m.document_count);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',d.document_kind,'sourceKey',d.source_key,'headerSourceRowId',d.header_source_row_id::text,
  'headerId',COALESCE(d.sales_header_id,d.transfer_header_id)::text,'headerSourceSha256',d.header_source_sha256,'lineCount',d.line_count,
  'settlementCount',d.settlement_count,'sourceDocumentSha256',d.source_document_sha256,'typedDocumentSha256',d.typed_document_sha256)
  ORDER BY d.document_kind,COALESCE(d.sales_header_id,d.transfer_header_id)),'[]'::jsonb) INTO documents FROM naijue_erp.import_history_document_manifest d WHERE d.batch_id=m.batch_id;
 PERFORM naijue_erp.assert_history_typed_closure(m.batch_id,plan,documents);RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER history_closure_complete AFTER INSERT ON naijue_erp.import_history_closure_manifest
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_history_closure_commit();
CREATE FUNCTION naijue_erp.guard_history_typed_publication() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
 IF NEW.mapping_version='V2_HISTORY_NULLABLE_1' AND NEW.status='IMPORTED' THEN
  RAISE EXCEPTION 'history18 complete typed publication not integrated' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER history_typed_publication BEFORE INSERT OR UPDATE ON naijue_erp.import_batch FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_history_typed_publication();
REVOKE ALL ON naijue_erp.import_history_closure_manifest,naijue_erp.import_history_document_manifest FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.history_closure_encode(jsonb,integer),naijue_erp.history_closure_row_hash(text,text,jsonb),naijue_erp.history_closure_seed(text),naijue_erp.history_closure_fold(bytea,text),naijue_erp.history_closure_finish(text,bigint,bytea),naijue_erp.history_closure_count_map(jsonb,text[]),naijue_erp.guard_history_closure_stage(),naijue_erp.validate_history_closure_commit(),naijue_erp.guard_history_typed_publication() FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.history_closure_projection_columns(text),naijue_erp.history_closure_projection(text,jsonb),naijue_erp.history_closure_projection_key(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.history_closure_rows(uuid),naijue_erp.history_closure_document_rows(uuid,text,uuid,boolean),naijue_erp.history_closure_digest(uuid,text,text,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.assert_history_typed_closure(uuid,jsonb,jsonb) FROM PUBLIC;
INSERT INTO naijue_erp.schema_migration(version,description) VALUES(18,'Bounded semantic closure STAGE readback and immutable manifests; publication explicitly closed pending joint acceptance');
COMMIT;
