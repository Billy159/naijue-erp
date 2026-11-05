-- Narrow V27 successor: absent barcode scheme may be saved; all existing
-- product child, receipt, audit, identity and version checks remain unchanged.
-- Install after 0027 standard initialization and before whole-path hardening.
BEGIN;
DO $preflight$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE p.oid=pg_catalog.to_regprocedure('naijue_erp.validate_maintenance_root_commit()') AND p.prokind='f' AND p.proowner=n.nspowner AND l.lanname='plpgsql' AND NOT p.prosecdef AND NOT p.proretset AND p.provolatile='v' AND p.prosqlbody IS NULL AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')='380af956881696be97d73eab55fe033275802ba97ea4cfef47bc79d535db4c11')
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid='naijue_erp.product'::regclass AND t.tgname='product_maintenance_final_consistency' AND t.tgfoid='naijue_erp.validate_maintenance_root_commit()'::regprocedure AND t.tgtype=21 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgnargs=0 AND t.tgdeferrable AND t.tginitdeferred AND t.tgqual IS NULL AND t.tgattr=''::int2vector)
 THEN RAISE EXCEPTION 'PRODUCT_NULL_SCHEME_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_root_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
  IF TG_OP='INSERT' AND naijue_erp.standard_import_row_intent(upper(TG_TABLE_NAME),to_jsonb(NEW)) THEN RETURN NULL; END IF;
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'product_category' THEN 'CATEGORY'
    WHEN 'color' THEN 'COLOR' WHEN 'fit' THEN 'FIT' WHEN 'hall' THEN 'HALL' WHEN 'warehouse' THEN 'WAREHOUSE'
    WHEN 'staff' THEN 'STAFF' WHEN 'user_account' THEN 'ACCOUNT' WHEN 'payment_method' THEN 'PAYMENT_METHOD'
    WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' END;
  IF family IS NULL THEN RAISE EXCEPTION 'Unsupported maintenance root' USING ERRCODE='23514'; END IF;
  IF family='CATEGORY' THEN
    SELECT x.* INTO a FROM naijue_erp.audit_change x WHERE x.object_type='CATEGORY' AND x.action IN ('REORDER','UNDO_REORDER')
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'category_order'->'rows') m WHERE m->>'id'=NEW.id::text);
    IF FOUND THEN
      IF TG_OP<>'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id OR OLD.deleted_at IS NOT NULL
        OR NEW.display_order IS NOT DISTINCT FROM OLD.display_order OR NEW.version::bigint<>OLD.version::bigint+1
        OR to_jsonb(NEW)-ARRAY['display_order','version'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['display_order','version']
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.before_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',OLD.id,'version',OLD.version,'display_order',OLD.display_order))
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'category_order'->'rows') m
          WHERE m=jsonb_build_object('id',NEW.id,'version',NEW.version,'display_order',NEW.display_order)) THEN
        RAISE EXCEPTION 'Every category sibling update must match its exact aggregate OLD and NEW' USING ERRCODE='23514';
      END IF;
      -- The receipt trigger checks the complete final aggregate once. This row
      -- trigger independently proves every actual OLD/NEW without N full scans.
      RETURN NULL;
    END IF;
  END IF;
  SELECT * INTO a FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  present:=FOUND;
  -- Preserve the original first-import/bootstrap lanes and their separate source
  -- guards. Once a cutoff is published every ordinary root write needs evidence.
  IF NOT present AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NULL; END IF;
  -- Existing authenticated self-password change deliberately has no maintenance
  -- receipt. Preserve only its exact non-secret metadata/password transition;
  -- every D2 reset with a receipt still takes the full closure below.
  IF NOT present AND family='ACCOUNT' THEN
    SELECT * INTO a FROM naijue_erp.audit_change x WHERE x.object_type='STAFF' AND x.object_id=NEW.staff_id
      AND naijue_erp.maintenance_audit_is_current(x.operation_id)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.after_values->'accounts') q(v) WHERE v->>'id'=NEW.id::text AND v->'version'=to_jsonb(NEW.version));
    IF FOUND THEN
      PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
      IF EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Changed staff child account cannot retain old sessions' USING ERRCODE='23514';
      END IF;
      RETURN NULL;
    END IF;
  END IF;
  IF NOT present AND family='ACCOUNT' AND TG_OP='UPDATE' THEN
    IF to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at']
        =to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at']
      AND NEW.password_hash IS DISTINCT FROM OLD.password_hash
      AND NEW.password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
      AND NEW.auth_version::bigint=OLD.auth_version::bigint+1 AND NEW.version::bigint=OLD.version::bigint+1 THEN RETURN NULL; END IF;
  END IF;
  IF NOT present OR NOT naijue_erp.maintenance_audit_is_current(a.operation_id) OR a.old_version IS DISTINCT FROM (CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.version END)
    OR a.new_version<>NEW.version OR (TG_OP='INSERT' AND (NEW.version<>1 OR a.action<>'CREATE'))
    OR (TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.version::bigint<>OLD.version::bigint+1 OR a.action='CREATE')) THEN
    RAISE EXCEPTION 'Native root requires its exact one-step maintenance audit' USING ERRCODE='23514';
  END IF;
  new_root:=to_jsonb(NEW)-'password_hash'; old_root:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'password_hash' END;
  after_root:=a.after_values; before_root:=a.before_values;
  IF family='PRODUCT' THEN
    after_root:=after_root-ARRAY['skus','barcodes','images']; before_root:=before_root-ARRAY['skus','barcodes','images'];
    PERFORM naijue_erp.maintenance_check_product_children(a,false);
  ELSIF family='PAYMENT_ACCOUNT' THEN
    after_root:=after_root-'payment_halls'; before_root:=before_root-'payment_halls';
    IF a.before_values ? 'payment_halls' OR a.after_values ? 'payment_halls' THEN
      IF NOT naijue_erp.maintenance_exact_rows_match(a.after_values->'payment_halls',naijue_erp.maintenance_payment_halls(NEW.id),'hall_id') THEN
        RAISE EXCEPTION 'Final payment hall relations differ from complete after evidence' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='STAFF' THEN
    after_root:=after_root-ARRAY['accounts','account_credentials']; before_root:=before_root-'accounts';
    PERFORM naijue_erp.maintenance_check_staff_accounts(a,old_root,new_root,false);
  ELSIF family='ACCOUNT' THEN
    after_root:=after_root-'account_credentials';
    PERFORM naijue_erp.maintenance_check_account_credential(a,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
    IF TG_OP='UPDATE' THEN
      IF NEW.staff_id IS DISTINCT FROM OLD.staff_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.auth_version::bigint<>OLD.auth_version::bigint+1 OR EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=NEW.id AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'Account safety epoch provenance and sessions must close together' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.auth_version<>1 OR NEW.created_at IS DISTINCT FROM a.occurred_at THEN
      RAISE EXCEPTION 'New account starts at the original operation' USING ERRCODE='23514';
    END IF;
    IF NEW.updated_at IS DISTINCT FROM a.occurred_at THEN RAISE EXCEPTION 'Account time must match operation' USING ERRCODE='23514'; END IF;
    IF a.action IN ('DISABLE','RESTORE') THEN
      IF TG_OP<>'UPDATE' OR (NEW.login_enabled IS DISTINCT FROM (a.action='RESTORE'))
        OR NEW.login_enabled IS NOT DISTINCT FROM OLD.login_enabled
        OR to_jsonb(NEW)-ARRAY['login_enabled','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['login_enabled','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Account disable or restore must only change its actual login state and epochs' USING ERRCODE='23514';
      END IF;
    ELSIF a.action='RESET_PASSWORD' THEN
      IF TG_OP<>'UPDATE' OR to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at'] IS DISTINCT FROM to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at'] THEN
        RAISE EXCEPTION 'Password reset cannot change account identity or scope' USING ERRCODE='23514';
      END IF;
    END IF;
    IF NEW.login_enabled AND NOT EXISTS(SELECT 1 FROM naijue_erp.staff s LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
      WHERE s.id=NEW.staff_id AND s.employment_status='在职' AND s.role IN ('ADMIN','WAREHOUSE','SALESPERSON')
        AND (s.role<>'SALESPERSON' OR s.hall_id IS NOT NULL) AND (s.hall_id IS NULL OR h.enabled)) THEN
      RAISE EXCEPTION 'Enabled account requires current active staff and usable scope' USING ERRCODE='23514';
    END IF;
  END IF;
  IF jsonb_typeof(after_root) IS DISTINCT FROM 'object' OR (old_root IS NULL AND before_root IS NOT NULL)
    OR (old_root IS NOT NULL AND jsonb_typeof(before_root) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Actual root sparse objects required' USING ERRCODE='23514';
  END IF;
  FOR field IN SELECT * FROM jsonb_each(new_root) LOOP
    IF old_root IS NULL OR field.value IS DISTINCT FROM old_root->field.key THEN
      IF NOT naijue_erp.maintenance_evidence_matches(after_root->field.key,field.value)
        OR (old_root IS NOT NULL AND NOT naijue_erp.maintenance_evidence_matches(before_root->field.key,old_root->field.key)) THEN
        RAISE EXCEPTION 'Audit must contain every actual changed native root value' USING ERRCODE='23514';
      END IF;
    ELSIF after_root ? field.key OR before_root ? field.key THEN
      RAISE EXCEPTION 'Unchanged native values cannot be copied into sparse audit' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(after_root) AS k(name) WHERE NOT new_root ? k.name)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(before_root) AS k(name) WHERE NOT old_root ? k.name) THEN
    RAISE EXCEPTION 'Audit root contains invented fields or credentials' USING ERRCODE='23514';
  END IF;
  IF family='HALL' THEN
    IF NEW.default_sales_warehouse_id IS NOT NULL THEN
      PERFORM 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id FOR SHARE;
      IF NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse WHERE id=NEW.default_sales_warehouse_id AND hall_id=NEW.id) THEN
        RAISE EXCEPTION 'Default sales warehouse must belong to the selected hall' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSIF family='WAREHOUSE' THEN
    PERFORM 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id FOR SHARE;
    IF EXISTS(SELECT 1 FROM naijue_erp.hall WHERE default_sales_warehouse_id=NEW.id AND id<>NEW.hall_id) THEN
      RAISE EXCEPTION 'Warehouse move would invalidate an actual hall default' USING ERRCODE='23514';
    END IF;
  ELSIF family='CATEGORY' THEN
    parent:=NEW.parent_id; visited:=ARRAY[NEW.id];
    WHILE parent IS NOT NULL LOOP
      IF parent=ANY(visited) THEN RAISE EXCEPTION 'Category parent cycle rejected' USING ERRCODE='23514'; END IF;
      visited:=array_append(visited,parent);
      SELECT parent_id INTO STRICT parent FROM naijue_erp.product_category WHERE id=parent FOR SHARE;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
COMMIT;
