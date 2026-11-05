-- GENERATED SOURCE-ONLY FRESH EMPTY TARGET CANDIDATE. NOT REGISTERED OR ENGINE TESTED.
-- Removes eleven unconditional legacy DECLARE bindings; table reads, typed
-- casts and two composite-input signatures are still separate dependencies.
-- No historical query, branch, actor, time, receipt, audit or data is changed.
-- Preserve exact old-profile rejection; reconcile embedded body pins separately.
-- Requires an exclusive reviewed schema-writer window and exact successor
-- catalog/ACL admission. This file is NOT a physical-retirement authorization.
BEGIN;
SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp;
SET LOCAL row_security=off;
DO $rowtypes$
DECLARE patches constant jsonb := $patches$[{"signature":"naijue_erp.assert_barcode_scheme_initialization_v19(pg_catalog.uuid,pg_catalog.uuid)","before_sha256":"8d4f7d457403d6c4737e5a9b38d6d4f48c0ef3c5e94dd2e8ff408d3b57a198ca","after_sha256":"fd0b0a102b7ef86498920a5c2006a692ec7179eec6f3cff9fdd8db2e14e6b471","old_declaration":"e naijue_erp.native_party_import_evidence%ROWTYPE","new_declaration":"e record","return_type":"void"},{"signature":"naijue_erp.assert_core_initialization_v14(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.bool)","before_sha256":"8a8374fb193ed9e5ddcc388b0141a91dc17420cef0baee4ffbb700cd9737add5","after_sha256":"c83323159c8a36a8115312ad9530230964759b4969cd6b93576a90f26856c542","old_declaration":"e naijue_erp.native_party_import_evidence%ROWTYPE","new_declaration":"e record","return_type":"void"},{"signature":"naijue_erp.guard_header_native_reference()","before_sha256":"1584d2600c763f0d38cd3dd4fa7dd14ea90465ef9376d7165a58d71bce0dec3c","after_sha256":"b9efd63a20a8a66e9ab66025751da35dc481f9e22eb3a5e65d7085d873c2a0f3","old_declaration":"source naijue_erp.import_source_row%ROWTYPE","new_declaration":"source record","return_type":"trigger"},{"signature":"naijue_erp.guard_history_insert()","before_sha256":"98fcf82074f4aaf0712b2af3aca5a12a7e4975933712caffd577e652eca7e12f","after_sha256":"7609c07156e5a8dba605362e10fdb8adc5ab9fa790e49e367732e5731c61d511","old_declaration":"source naijue_erp.import_source_row%ROWTYPE","new_declaration":"source record","return_type":"trigger"},{"signature":"naijue_erp.guard_native_catalogue_binding()","before_sha256":"7418579c0d1c3a1951696a12ad165a421d26b87f0e449d9d7d250497dc2ddc21","after_sha256":"c2e6f8f2e7effbd42e6343e58696b8b1bb7b3963ddd6c340f74dab278e7a9c5d","old_declaration":"s naijue_erp.import_source_row%ROWTYPE","new_declaration":"s record","return_type":"trigger"},{"signature":"naijue_erp.guard_native_payment_binding()","before_sha256":"774cc9b1604a8d0948f73c7298fa67a10233962af218b89fe0b9675107148d35","after_sha256":"ee0e1990c02ca14f3dccc7f8b842d0b19a965ca1826a85b18c4bb2a6535088de","old_declaration":"s naijue_erp.import_source_row%ROWTYPE","new_declaration":"s record","return_type":"trigger"},{"signature":"naijue_erp.history_effective_writes_closed()","before_sha256":"5cfe1d51d7cfa4f30c5fe758ed3b203ec714fa4fc99185a901454d705ea3ba54","after_sha256":"d5e4fbf5ae701d14a70ea7d7934b7c5882d174a38e0a0bdecb22b30716c22f5f","old_declaration":"revision naijue_erp.history_revision%ROWTYPE","new_declaration":"revision record","return_type":"trigger"},{"signature":"naijue_erp.validate_history_closure_commit()","before_sha256":"e61d2c5dd34792f5ca277cada1dc12a6904b1be95031c0a6c4810080b24dd03b","after_sha256":"b3dc8e536075e27b9ddf83d017611176e88cc8160d88c3ef92e6477193547eb7","old_declaration":"m naijue_erp.import_history_closure_manifest%ROWTYPE","new_declaration":"m record","return_type":"trigger"},{"signature":"naijue_erp.validate_history_numeric_balance_commit()","before_sha256":"fab0bf7a3f1681d6034b09dbb5c7ad8efa606c6fa82f24fc101bc5b70636a837","after_sha256":"e7c3b1082f5c5fd5b6634c8db26df08af2e6e7296a7297a5b1af28aa76e6d703","old_declaration":"revision naijue_erp.history_revision%ROWTYPE","new_declaration":"revision record","return_type":"trigger"},{"signature":"naijue_erp.validate_history_product_proofs(pg_catalog.uuid)","before_sha256":"dab49bb495de85d5e66350affd348f85e0595411ea7ab7378104a3963db2a38e","after_sha256":"9d61d7b09a58decc03173044e109b5a8aa3d5300c2d7fa0f379470fe16b83ef6","old_declaration":"source naijue_erp.import_source_row%ROWTYPE","new_declaration":"source record","return_type":"void"},{"signature":"naijue_erp.validate_native_party_import_commit()","before_sha256":"5383c9941e06c7748af6603eee56559b102b09305c11771a813c6cf859ad37e3","after_sha256":"431123fc6d866fad56fbbeaa02393d20e75883f3598d80f782a1c1c60441b3db","old_declaration":"s naijue_erp.import_source_row%ROWTYPE","new_declaration":"s record","return_type":"trigger"}]$patches$::jsonb;
 expected_tables constant text[] := ARRAY['audit_change','auth_session','barcode_scheme','color','customer','fit','hall','history_revision','history_sales_effective','history_sales_header','history_sales_line','history_sales_line_effective','history_sales_settlement','history_sales_settlement_effective','history_transfer_effective','history_transfer_header','history_transfer_line','history_transfer_line_effective','import_batch','import_header_native_reference','import_history_closure_manifest','import_history_document_manifest','import_native_catalogue_binding','import_native_payment_binding','import_record','import_record_accounting_claim','import_sku_alias','import_source_row','import_stock_contributor','inventory_balance','inventory_ledger','native_party_import_evidence','operation_receipt','payment_account','payment_account_hall','payment_method','product','product_category','product_image','runtime_document_number_allocation','sales_header','sales_line','sales_settlement','schema_migration','season','size','size_group','size_group_member','sku','sku_barcode','staff','supplier','transfer_header','transfer_line','user_account','warehouse'];
 ns oid; owner_oid oid; item jsonb; relation record; before_routine record; after_routine record;
 definition text; changed text; populated boolean; before_triggers jsonb; before_metadata jsonb; after_metadata jsonb;
BEGIN
 SELECT oid,nspowner INTO STRICT ns,owner_oid FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp';
 IF owner_oid IS DISTINCT FROM current_user::regrole::oid
   OR pg_catalog.current_setting('session_replication_role') IS DISTINCT FROM 'origin'
   OR pg_catalog.current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
   OR pg_catalog.current_setting('transaction_read_only') IS DISTINCT FROM 'off'
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE oid=owner_oid AND (rolsuper OR rolbypassrls OR rolreplication)) THEN
   RAISE EXCEPTION 'LEGACY_ROWTYPE_ORDINARY_OWNER_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF (SELECT pg_catalog.array_agg(relname::text ORDER BY relname) FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f'))
      IS DISTINCT FROM expected_tables
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind IN('r','p','f')
     AND (relkind<>'r' OR relpersistence<>'p' OR relispartition))
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid IN(i.inhrelid,i.inhparent) WHERE c.relnamespace=ns) THEN
   RAISE EXCEPTION 'LEGACY_ROWTYPE_EXACT_TABLE_COHORT_REQUIRED' USING ERRCODE='23514';
 END IF;
 -- Acquire every table lock before observing emptiness. Read committed ensures
 -- a committed row that raced a lock wait cannot disappear in a stale snapshot.
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind='r' ORDER BY relname LOOP
   IF relation.relowner IS DISTINCT FROM owner_oid OR relation.relforcerowsecurity THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_VISIBLE_OWNER_TABLE_REQUIRED' USING ERRCODE='42501';
   END IF;
   EXECUTE pg_catalog.format('LOCK TABLE naijue_erp.%I IN ACCESS EXCLUSIVE MODE',relation.relname);
 END LOOP;
 FOR relation IN SELECT * FROM pg_catalog.pg_class WHERE relnamespace=ns AND relkind='r' AND relname<>'schema_migration' ORDER BY relname LOOP
   EXECUTE pg_catalog.format('SELECT EXISTS(SELECT 1 FROM naijue_erp.%I LIMIT 1)',relation.relname) INTO populated;
   IF populated IS DISTINCT FROM false THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_FRESH_EMPTY_TARGET_REQUIRED: %',relation.relname USING ERRCODE='23514';
   END IF;
 END LOOP;
 IF (SELECT pg_catalog.array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY(SELECT pg_catalog.generate_series(1,27))
   OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace=ns)<>177
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE connamespace=ns AND NOT convalidated)
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid IN(SELECT oid FROM pg_catalog.pg_class WHERE relnamespace=ns) AND tgenabled<>'O') THEN
   RAISE EXCEPTION 'LEGACY_ROWTYPE_PREDECESSOR_GUARDS_DIFFER' USING ERRCODE='23514';
 END IF;
 SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) INTO before_triggers FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=ns;
 SELECT pg_catalog.jsonb_agg(CASE WHEN p.oid IN(SELECT (value->>'signature')::regprocedure FROM pg_catalog.jsonb_array_elements(patches))
   THEN pg_catalog.to_jsonb(p)-'prosrc' ELSE pg_catalog.to_jsonb(p) END ORDER BY p.oid) INTO before_metadata FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns;
 -- Check the entire predecessor cohort before replacing even one declaration.
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256'
     OR before_routine.proowner IS DISTINCT FROM owner_oid OR before_routine.prosecdef
     OR before_routine.prokind<>'f' OR before_routine.provolatile<>'v'
     OR before_routine.proisstrict OR before_routine.proretset OR before_routine.proleakproof OR before_routine.proparallel<>'u'
     OR before_routine.prorettype IS DISTINCT FROM ('pg_catalog.'||(item->>'return_type'))::regtype::oid
     OR before_routine.prolang IS DISTINCT FROM (SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
     OR before_routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, naijue_erp, pg_temp'] THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_PREDECESSOR_DIFFERS: %',item->>'signature' USING ERRCODE='23514';
   END IF;
 END LOOP;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(patches) LOOP
   SELECT * INTO STRICT before_routine FROM pg_catalog.pg_proc WHERE oid=(item->>'signature')::regprocedure;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(before_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'before_sha256' THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_PREDECESSOR_CHANGED' USING ERRCODE='23514';
   END IF;
   definition:=pg_catalog.pg_get_functiondef(before_routine.oid);
   IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,item->>'old_declaration','')))
      IS DISTINCT FROM pg_catalog.length(item->>'old_declaration') THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_DECLARATION_OCCURRENCE_DIFFERS' USING ERRCODE='23514';
   END IF;
   changed:=pg_catalog.replace(definition,item->>'old_declaration',item->>'new_declaration');
   EXECUTE changed;
   SELECT * INTO STRICT after_routine FROM pg_catalog.pg_proc WHERE oid=before_routine.oid;
   IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(after_routine.prosrc,'UTF8')),'hex') IS DISTINCT FROM item->>'after_sha256'
     OR (pg_catalog.to_jsonb(after_routine)-'prosrc') IS DISTINCT FROM (pg_catalog.to_jsonb(before_routine)-'prosrc') THEN
     RAISE EXCEPTION 'LEGACY_ROWTYPE_UNEXPECTED_CHANGE' USING ERRCODE='23514';
   END IF;
 END LOOP;
 SELECT pg_catalog.jsonb_agg(CASE WHEN p.oid IN(SELECT (value->>'signature')::regprocedure FROM pg_catalog.jsonb_array_elements(patches))
   THEN pg_catalog.to_jsonb(p)-'prosrc' ELSE pg_catalog.to_jsonb(p) END ORDER BY p.oid) INTO after_metadata FROM pg_catalog.pg_proc p WHERE p.pronamespace=ns;
 IF after_metadata IS DISTINCT FROM before_metadata OR (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.oid) FROM pg_catalog.pg_trigger t
   JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=ns) IS DISTINCT FROM before_triggers THEN
   RAISE EXCEPTION 'LEGACY_ROWTYPE_CATALOG_CHANGED' USING ERRCODE='23514';
 END IF;
END $rowtypes$;
COMMIT;
