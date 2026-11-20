-- SOURCE-ONLY candidate for a NEW, EMPTY direct ordinary-import target.
-- Not registered or executed. This is not an existing-history migration.
-- The seven old FK guarantees are replaced by stricter validated NULL-only
-- checks before any old FK is removed. No historical value can enter the core.
-- Keep every fact/provenance table, column, ordinary FK, CHECK, trigger and ACL.
-- Requires an exclusive schema-writer window and a separately reviewed exact
-- final installation/catalog profile. Old profiles must continue to reject it.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
DO $retire$
DECLARE
  expected_tables constant text[] := ARRAY['audit_change','auth_session','barcode_scheme','color','customer','fit','hall','history_revision','history_sales_effective','history_sales_header','history_sales_line','history_sales_line_effective','history_sales_settlement','history_sales_settlement_effective','history_transfer_effective','history_transfer_header','history_transfer_line','history_transfer_line_effective','import_batch','import_header_native_reference','import_history_closure_manifest','import_history_document_manifest','import_native_catalogue_binding','import_native_payment_binding','import_record','import_record_accounting_claim','import_sku_alias','import_source_row','import_stock_contributor','inventory_balance','inventory_ledger','native_party_import_evidence','operation_receipt','payment_account','payment_account_hall','payment_method','product','product_category','product_image','runtime_document_number_allocation','sales_header','sales_line','sales_settlement','schema_migration','season','size','size_group','size_group_member','sku','sku_barcode','staff','supplier','transfer_header','transfer_line','user_account','warehouse'];
  legacy_tables constant text[] := ARRAY['history_sales_header','history_sales_line','history_sales_settlement','history_transfer_header','history_transfer_line','history_revision','history_sales_effective','history_transfer_effective','history_sales_line_effective','history_transfer_line_effective','history_sales_settlement_effective','import_source_row','import_sku_alias','import_stock_contributor','import_header_native_reference','native_party_import_evidence','import_native_catalogue_binding','import_native_payment_binding','import_record_accounting_claim','import_history_closure_manifest','import_history_document_manifest'];
  expected_edges constant jsonb := $edges$[{"table":"operation_receipt","column":"target_history_sales_id","target":"history_sales_header","fk":"operation_receipt_target_history_sales_id_fkey","check":"ordinary_only_target_history_sales_id","deferred":true,"generated":"s"},{"table":"operation_receipt","column":"target_history_transfer_id","target":"history_transfer_header","fk":"operation_receipt_target_history_transfer_id_fkey","check":"ordinary_only_target_history_transfer_id","deferred":true,"generated":"s"},{"table":"audit_change","column":"object_history_sales_id","target":"history_sales_header","fk":"audit_change_object_history_sales_id_fkey","check":"ordinary_only_object_history_sales_id","deferred":true,"generated":"s"},{"table":"audit_change","column":"object_history_transfer_id","target":"history_transfer_header","fk":"audit_change_object_history_transfer_id_fkey","check":"ordinary_only_object_history_transfer_id","deferred":true,"generated":"s"},{"table":"inventory_ledger","column":"source_history_revision_id","target":"history_revision","fk":"inventory_ledger_source_history_revision_id_fkey","check":"ordinary_only_source_history_revision_id","deferred":true,"generated":""},{"table":"inventory_ledger","column":"source_history_sales_line_id","target":"history_sales_line","fk":"inventory_ledger_source_history_sales_line_id_fkey","check":"ordinary_only_source_history_sales_line_id","deferred":false,"generated":""},{"table":"inventory_ledger","column":"source_history_transfer_line_id","target":"history_transfer_line","fk":"inventory_ledger_source_history_transfer_line_id_fkey","check":"ordinary_only_source_history_transfer_line_id","deferred":false,"generated":""}]$edges$::jsonb;
  ns oid; owner_oid oid; t record; edge jsonb; fk record; col record; replacement record;
  populated boolean; source_oid oid; target_oid oid; target_attnum smallint; expected_expression text;
  old_fk_oids oid[] := ARRAY[]::oid[];
  before_constraints jsonb; before_columns jsonb; before_defaults jsonb;
  before_routines jsonb; before_policies jsonb; before_triggers jsonb;
BEGIN
  SELECT oid,nspowner INTO STRICT ns,owner_oid FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp';
  IF owner_oid IS DISTINCT FROM current_user::regrole::oid
    OR pg_catalog.current_setting('session_replication_role') IS DISTINCT FROM 'origin'
    OR pg_catalog.current_setting('transaction_read_only') IS DISTINCT FROM 'off'
    OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=owner_oid AND (rolsuper OR rolbypassrls))
  THEN RAISE EXCEPTION 'CORE_HISTORY_FK_ORDINARY_SCHEMA_OWNER_REQUIRED' USING ERRCODE='23514'; END IF;
  IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration)
       IS DISTINCT FROM ARRAY(SELECT generate_series(1,27))
    OR (SELECT array_agg(relname::text ORDER BY relname) FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f'))
       IS DISTINCT FROM expected_tables
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f')
      AND (relkind<>'r' OR relpersistence<>'p' OR relispartition))
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid IN(i.inhrelid,i.inhparent) WHERE c.relnamespace=ns)
  THEN RAISE EXCEPTION 'CORE_HISTORY_FK_EXACT_PREDECESSOR_COHORT_REQUIRED' USING ERRCODE='23514'; END IF;
  -- Lock before emptiness and shape checks. A populated or forced-RLS target
  -- must never be treated as empty because an installing role cannot see rows.
  FOR t IN SELECT c.* FROM pg_catalog.pg_class c WHERE c.relnamespace=ns AND c.relkind='r' ORDER BY c.relname LOOP
    IF t.relowner IS DISTINCT FROM owner_oid OR t.relforcerowsecurity
    THEN RAISE EXCEPTION 'CORE_HISTORY_FK_VISIBLE_OWNER_TABLE_REQUIRED: %',t.relname USING ERRCODE='23514'; END IF;
    EXECUTE format('LOCK TABLE naijue_erp.%I IN ACCESS EXCLUSIVE MODE',t.relname);
  END LOOP;
  FOR t IN SELECT c.relname FROM pg_catalog.pg_class c WHERE c.relnamespace=ns AND c.relkind='r' AND c.relname<>'schema_migration' ORDER BY c.relname LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)',t.relname) INTO populated;
    IF populated THEN RAISE EXCEPTION 'CORE_HISTORY_FK_NEW_EMPTY_TARGET_REQUIRED: %',t.relname USING ERRCODE='23514'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace=ns AND NOT convalidated)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns) AND tgenabled<>'O')
  THEN RAISE EXCEPTION 'CORE_HISTORY_FK_PREDECESSOR_GUARD_DISABLED' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class source ON source.oid=c.conrelid
      JOIN pg_catalog.pg_class target ON target.oid=c.confrelid
      WHERE c.contype='f' AND source.relnamespace=ns AND target.relnamespace=ns
        AND NOT(source.relname=ANY(legacy_tables)) AND target.relname=ANY(legacy_tables))<>7
  THEN RAISE EXCEPTION 'CORE_HISTORY_FK_PREDECESSOR_EDGE_COUNT_DIFFERS' USING ERRCODE='23514'; END IF;
  FOR edge IN SELECT value FROM pg_catalog.jsonb_array_elements(expected_edges) LOOP
    source_oid:=pg_catalog.to_regclass('naijue_erp.'||(edge->>'table'));
    target_oid:=pg_catalog.to_regclass('naijue_erp.'||(edge->>'target'));
    SELECT * INTO STRICT col FROM pg_catalog.pg_attribute WHERE attrelid=source_oid AND attname=edge->>'column' AND NOT attisdropped;
    SELECT attnum INTO STRICT target_attnum FROM pg_catalog.pg_attribute WHERE attrelid=target_oid AND attname='id' AND NOT attisdropped;
    SELECT * INTO STRICT fk FROM pg_catalog.pg_constraint WHERE conrelid=source_oid AND conname=edge->>'fk';
    IF col.atttypid<>'pg_catalog.uuid'::regtype OR col.attnotnull OR col.attgenerated::text<>edge->>'generated'
      OR fk.contype<>'f' OR fk.connamespace<>ns OR fk.confrelid<>target_oid
      OR fk.conkey IS DISTINCT FROM ARRAY[col.attnum]::smallint[] OR fk.confkey IS DISTINCT FROM ARRAY[target_attnum]::smallint[]
      OR NOT fk.convalidated OR fk.condeferrable IS DISTINCT FROM (edge->>'deferred')::boolean
      OR fk.condeferred IS DISTINCT FROM (edge->>'deferred')::boolean
      OR fk.confupdtype<>'a' OR fk.confdeltype<>'a' OR fk.confmatchtype<>'s'
      OR fk.conparentid<>0 OR NOT fk.conislocal OR fk.coninhcount<>0
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=source_oid AND conname=edge->>'check')
    THEN RAISE EXCEPTION 'CORE_HISTORY_FK_PREDECESSOR_EDGE_DIFFERS: %',edge->>'fk' USING ERRCODE='23514'; END IF;
    IF edge->>'generated'='s' THEN
      expected_expression:=format('CASE WHEN (%s_type = %L::text) THEN %s_id ELSE NULL::uuid END',
        CASE WHEN edge->>'table'='operation_receipt' THEN 'target' ELSE 'object' END,
        CASE WHEN edge->>'target'='history_sales_header' THEN 'HISTORY_SALES' ELSE 'HISTORY_TRANSFER' END,
        CASE WHEN edge->>'table'='operation_receipt' THEN 'target' ELSE 'object' END);
      IF (SELECT btrim(regexp_replace(pg_catalog.pg_get_expr(adbin,adrelid),'\s+',' ','g'))
           FROM pg_catalog.pg_attrdef WHERE adrelid=source_oid AND adnum=col.attnum) IS DISTINCT FROM expected_expression
      THEN RAISE EXCEPTION 'CORE_HISTORY_FK_GENERATED_EXPRESSION_DIFFERS' USING ERRCODE='23514'; END IF;
    ELSIF EXISTS(SELECT 1 FROM pg_catalog.pg_attrdef WHERE adrelid=source_oid AND adnum=col.attnum) THEN
      RAISE EXCEPTION 'CORE_HISTORY_FK_UNEXPECTED_COLUMN_DEFAULT' USING ERRCODE='23514';
    END IF;
    old_fk_oids:=array_append(old_fk_oids,fk.oid);
  END LOOP;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) INTO before_constraints FROM pg_catalog.pg_constraint c WHERE c.connamespace=ns AND NOT(c.oid=ANY(old_fk_oids));
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) INTO before_columns FROM pg_catalog.pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns);
  SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) INTO before_defaults FROM pg_catalog.pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns);
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) INTO before_routines FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) INTO before_policies FROM pg_catalog.pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns);
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO before_triggers FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns) AND NOT(t.tgconstraint=ANY(old_fk_oids));
  -- All seven new guarantees exist and are validated while all seven old FKs
  -- still exist. NULL always passes the old MATCH SIMPLE FK; non-NULL is closed.
  FOR edge IN SELECT value FROM pg_catalog.jsonb_array_elements(expected_edges) LOOP
    EXECUTE format('ALTER TABLE naijue_erp.%I ADD CONSTRAINT %I CHECK(%I IS NULL)',edge->>'table',edge->>'check',edge->>'column');
    SELECT * INTO STRICT replacement FROM pg_catalog.pg_constraint
      WHERE conrelid=pg_catalog.to_regclass('naijue_erp.'||(edge->>'table')) AND conname=edge->>'check';
    IF replacement.contype<>'c' OR NOT replacement.convalidated OR replacement.connoinherit
      OR pg_catalog.pg_get_expr(replacement.conbin,replacement.conrelid) IS DISTINCT FROM '('||(edge->>'column')||' IS NULL)'
    THEN RAISE EXCEPTION 'CORE_HISTORY_FK_REPLACEMENT_NOT_VALIDATED' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOR edge IN SELECT value FROM pg_catalog.jsonb_array_elements(expected_edges) LOOP
    EXECUTE format('ALTER TABLE naijue_erp.%I DROP CONSTRAINT %I',edge->>'table',edge->>'fk');
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class source ON source.oid=c.conrelid JOIN pg_catalog.pg_class target ON target.oid=c.confrelid
      WHERE c.contype='f' AND source.relnamespace=ns AND target.relnamespace=ns AND NOT(source.relname=ANY(legacy_tables)) AND target.relname=ANY(legacy_tables))
    OR before_constraints IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_catalog.pg_constraint c WHERE c.connamespace=ns AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(expected_edges) e WHERE c.conrelid=pg_catalog.to_regclass('naijue_erp.'||(e.value->>'table')) AND c.conname=e.value->>'check'))
    OR before_columns IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns))
    OR before_defaults IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_catalog.pg_attrdef d WHERE d.adrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns))
    OR before_routines IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns)
    OR before_policies IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_catalog.pg_policy p WHERE p.polrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns))
    OR before_triggers IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t WHERE t.tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns))
  THEN RAISE EXCEPTION 'CORE_HISTORY_FK_UNEXPECTED_REPLACEMENT_CHANGE' USING ERRCODE='23514'; END IF;
END $retire$;
COMMIT;
