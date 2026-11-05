-- VERSION 0016: additive history polymorphic trigger field-dispatch repair.
-- Frozen 0001–0015 files are not rewritten by this migration. No data repair/publication.
BEGIN;
SELECT naijue_erp.cutoff_import_lock();
DO $$
BEGIN
  IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)
    IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] THEN
    RAISE EXCEPTION 'history dispatch repair requires exact reviewed schema1–15' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.guard_history_insert()')
    AND md5(prosrc)='913289835be74bcf6203f9e7a4d4d4c5') THEN
    RAISE EXCEPTION 'history dispatch repair requires unchanged original source function' USING ERRCODE='23514'; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION naijue_erp.guard_history_insert() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, naijue_erp AS $$
DECLARE b naijue_erp.import_batch%ROWTYPE; source naijue_erp.import_source_row%ROWTYPE; duplicate_found boolean;
BEGIN
  PERFORM naijue_erp.cutoff_import_lock();
  SELECT * INTO STRICT b FROM naijue_erp.import_batch WHERE id = NEW.batch_id FOR UPDATE;
  IF b.mapping_version <> 'V2_HISTORY_NULLABLE_1' OR b.status NOT IN ('STAGED', 'VALIDATING') THEN
    RAISE EXCEPTION 'historical staging scope is closed' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'import_source_row' THEN
    -- Reject known original PRODUCT scope even when caller relabels its entity/normalized scope.
    IF NEW.raw_fields->>'绑定范围' = 'PRODUCT' OR NEW.normalized_fields->>'绑定范围' = 'PRODUCT' THEN
      RAISE EXCEPTION 'excluded original PRODUCT barcode is not a database source row' USING ERRCODE = '23514'; END IF;
    -- Excluded PRODUCT-bound barcodes remain file-level evidence outside this database.
    IF NEW.entity_type = 'BARCODE' AND ((NEW.field_provenance->>'native_sku_id') IS NULL
      OR NEW.field_provenance ? 'native_product_id'
      OR (NEW.normalized_fields->>'绑定范围') IS DISTINCT FROM 'SKU'
      OR (NEW.field_provenance->>'native_barcode') IS DISTINCT FROM (NEW.normalized_fields->>'条码')) THEN
      RAISE EXCEPTION 'only effective SKU barcode source rows may be staged' USING ERRCODE = '23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(NEW.field_provenance->'fields') f
      WHERE (jsonb_typeof(f.value) = 'object' AND f.value->>'origin' IN ('ORIGINAL','MIGRATION_DERIVED','UNKNOWN')
        AND jsonb_typeof(f.value->'reason') = 'string' AND f.value ? 'raw'
        AND (f.value->>'origin' <> 'MIGRATION_DERIVED' OR length(f.value->>'evidence_ref') > 0)) IS DISTINCT FROM TRUE) THEN
      RAISE EXCEPTION 'invalid versioned field provenance' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO STRICT source FROM naijue_erp.import_source_row WHERE id = NEW.source_row_id AND batch_id = NEW.batch_id;
  IF source.entity_type <> TG_ARGV[0] THEN RAISE EXCEPTION 'historical source entity differs' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME LIKE 'history_%' THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM naijue_erp.%I p JOIN naijue_erp.import_source_row s ON s.id = p.source_row_id WHERE p.batch_id = $1 AND s.source_key = $2)', TG_TABLE_NAME)
      INTO duplicate_found USING NEW.batch_id, source.source_key;
    IF duplicate_found THEN RAISE EXCEPTION 'duplicate canonical historical source identity' USING ERRCODE = '23505'; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('history_sales_header', 'history_transfer_header') THEN
    IF NEW.version <> 1 THEN RAISE EXCEPTION 'initial historical version must be one' USING ERRCODE = '23514'; END IF;
    IF NEW.created_hall_provenance = 'MIGRATION_DERIVED' AND
      (length(source.field_provenance->'fields'->'created_hall_id'->>'evidence_ref') > 0) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'derived creator hall needs evidence' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'import_sku_alias' THEN
    IF source.source_key IS DISTINCT FROM NEW.old_source_sku_id THEN
      RAISE EXCEPTION 'alias must retain its original source identity' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'import_stock_contributor' THEN
    -- Exact original lineage CSV row lives in immutable evidence, not only aggregate totals.
    IF (source.field_provenance->'stock_contribution'->>'validator_version' = 'STOCK_CONTRIBUTOR_LINEAGE_V1'
      AND source.field_provenance->'stock_contribution'->>'oldStockSourceId' = source.source_key
      AND source.raw_fields->>'来源编号' = source.source_key
      AND source.field_provenance->'stock_contribution'->>'canonicalStockRowSourceId' = NEW.canonical_stock_source_key
      AND source.field_provenance->'stock_contribution'->>'oldSkuSourceId' = NEW.old_source_sku_id
      AND source.field_provenance->'stock_contribution'->>'signedQuantity' = NEW.signed_quantity::text
      AND source.field_provenance->'stock_contribution'->>'sourceUnit' = NEW.source_unit
      AND source.field_provenance->'stock_contribution'->>'sourceFile' = source.file_ref
      AND source.field_provenance->'stock_contribution'->>'sourceSheet' = source.sheet
      AND source.field_provenance->'stock_contribution'->>'sourceRow' = source.row_no::text
      AND source.field_provenance->'stock_contribution'->>'sourceSha256' = source.source_file_sha256
      AND source.raw_fields->>'SKU来源编号' = NEW.old_source_sku_id
      AND source.raw_fields->>'仓库来源编号' = source.field_provenance->'stock_contribution'->>'warehouseSourceId'
      AND source.raw_fields->>'核准库存数量' ~ '^(0|-?[1-9][0-9]*)$') IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'contributor differs from its original occurrence lineage' USING ERRCODE = '23514'; END IF;
    IF (source.raw_fields->>'核准库存数量')::numeric <> NEW.signed_quantity THEN
      RAISE EXCEPTION 'contributor quantity differs from original signed quantity' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias a WHERE a.batch_id = NEW.batch_id
      AND a.old_source_sku_id = NEW.old_source_sku_id AND a.canonical_source_key = source.field_provenance->'stock_contribution'->>'canonicalSkuSourceId') THEN
      RAISE EXCEPTION 'contributor canonical source differs from alias' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_TABLE_NAME = 'import_stock_contributor' THEN
    IF NOT EXISTS (SELECT 1 FROM naijue_erp.import_sku_alias WHERE batch_id = NEW.batch_id
      AND old_source_sku_id = NEW.old_source_sku_id AND canonical_sku_id = NEW.canonical_sku_id) THEN
      RAISE EXCEPTION 'contributor alias target differs' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
INSERT INTO naijue_erp.schema_migration(version,description) VALUES(16,'Polymorphic history trigger uses table-specific NEW fields only inside its table branch');
COMMIT;
