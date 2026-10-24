-- Approved v15: CATEGORY.REORDER / UNDO_REORDER only. SOURCE ONLY; C is the actual executor.
-- Exact predecessor is schema 1..26 with v11 + v14, without v12/v13. Old migrations remain immutable.
-- No table, column, index, enum, FK, trigger or generic write authority is added.
BEGIN;
DO $$
DECLARE required record;
BEGIN
 IF (SELECT array_agg(version ORDER BY version) FROM naijue_erp.schema_migration) IS DISTINCT FROM ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26]
  OR (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND prokind IN ('f','p'))<>123
  OR to_regprocedure('naijue_erp.maintenance_check_category_order(naijue_erp.audit_change)') IS NOT NULL THEN
  RAISE EXCEPTION 'Exact v14 predecessor required for category order v15' USING ERRCODE='23514';
 END IF;
 FOR required IN SELECT * FROM (VALUES
  ('maintenance_action_allowed(text,text)','186f88822ba597874734cb3349d0b9d95f63e5f8d8a34d3d05014e3420033c17'),
  ('validate_maintenance_receipt_commit()','7a42aeef2738c9009bc9eaa4ecbf41feefb43b759fbed2514a005166d20ac384'),
  ('validate_maintenance_root_commit()','8556d1ed234adb3bae1d99c9bb8e867db4070eadafa39dbb8b31752c7e24b512'),
  ('assert_core_initialization_v14(uuid,uuid,boolean)','665501c212a0576bf154ecd230d32fae36e9f50656e3c17d58bb268b50279bd1')
 ) p(signature,sha256) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('naijue_erp.'||required.signature)
    AND encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex')=required.sha256) THEN
   RAISE EXCEPTION 'Category order predecessor routine differs' USING ERRCODE='23514';
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION naijue_erp.maintenance_check_category_order(a naijue_erp.audit_change) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
#variable_conflict use_column
DECLARE r naijue_erp.operation_receipt%ROWTYPE; original_r naijue_erp.operation_receipt%ROWTYPE; original_a naijue_erp.audit_change%ROWTYPE;
 actor record; before_order jsonb; after_order jsonb; metadata jsonb; member jsonb; old_member jsonb; new_member jsonb;
 original_before jsonb; original_after jsonb; expected_result jsonb; actual_rows jsonb; result_members jsonb;
 parent uuid; moved uuid; undo_of uuid; previous_id text; old_ids text[]; new_ids text[]; changed_ids uuid[]; written_ids uuid[];
 current_xid bigint:=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint; audit_command bigint; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('naijue:catalogue-maintenance',0));
 IF (a.object_type='CATEGORY' AND a.action IN ('REORDER','UNDO_REORDER') AND a.old_version IS NOT NULL
   AND a.new_version::bigint=a.old_version::bigint+1 AND naijue_erp.maintenance_audit_is_current(a.operation_id)
   AND jsonb_typeof(a.before_values)='object' AND a.before_values ?& ARRAY['version','display_order','category_order']
   AND a.before_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND jsonb_typeof(a.after_values)='object' AND a.after_values ?& ARRAY['version','display_order','category_order']
   AND a.after_values-ARRAY['version','display_order','category_order']='{}'::jsonb
   AND a.before_values->'version'=to_jsonb(a.old_version) AND a.after_values->'version'=to_jsonb(a.new_version)
   AND naijue_erp.safe_maintenance_evidence(a.before_values) AND naijue_erp.safe_maintenance_evidence(a.after_values)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Exact current category aggregate audit required' USING ERRCODE='23514';
 END IF;
 SELECT cmin::text::bigint INTO STRICT audit_command FROM naijue_erp.audit_change WHERE operation_id=a.operation_id;
 IF (SELECT count(*) FROM naijue_erp.audit_change WHERE xmin::text::bigint=current_xid)<>1
  OR (SELECT count(*) FROM naijue_erp.operation_receipt WHERE xmin::text::bigint=current_xid)<>1 THEN
  RAISE EXCEPTION 'One category operation audit and receipt per transaction required' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT r FROM naijue_erp.operation_receipt WHERE id=a.operation_id;
 IF (r.target_type='CATEGORY' AND r.action=a.action AND r.target_id=a.object_id AND r.actor_account_id=a.actor_account_id
   AND r.status='COMMITTED' AND r.completed_at=a.occurred_at
   AND EXISTS(SELECT 1 FROM naijue_erp.operation_receipt WHERE id=r.id AND xmin::text::bigint=current_xid)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Category operation receipt must close its same transaction audit' USING ERRCODE='23514';
 END IF;
 SELECT u.login_enabled,s.role,s.employment_status,s.hall_id INTO STRICT actor
  FROM naijue_erp.user_account u JOIN naijue_erp.staff s ON s.id=u.staff_id WHERE u.id=a.actor_account_id FOR SHARE OF u,s;
 IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职' OR actor.role NOT IN ('ADMIN','WAREHOUSE') THEN
  RAISE EXCEPTION 'Current category order authority unavailable' USING ERRCODE='42501';
 END IF;
 IF actor.hall_id IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 before_order:=a.before_values->'category_order'; after_order:=a.after_values->'category_order';
 FOREACH metadata IN ARRAY ARRAY[before_order,after_order] LOOP
  IF (jsonb_typeof(metadata)='object' AND metadata ?& ARRAY['parent_id','moved_id','undo_of_operation_id','rows']
    AND metadata-ARRAY['parent_id','moved_id','undo_of_operation_id','rows']='{}'::jsonb
    AND (metadata->'parent_id'='null'::jsonb OR (jsonb_typeof(metadata->'parent_id')='string' AND (metadata->>'parent_id')::uuid::text=metadata->>'parent_id'))
    AND jsonb_typeof(metadata->'moved_id')='string' AND (metadata->>'moved_id')::uuid::text=metadata->>'moved_id'
    AND (metadata->'undo_of_operation_id'='null'::jsonb OR (jsonb_typeof(metadata->'undo_of_operation_id')='string' AND (metadata->>'undo_of_operation_id')::uuid::text=metadata->>'undo_of_operation_id'))
    AND jsonb_typeof(metadata->'rows')='array' AND jsonb_array_length(metadata->'rows') BETWEEN 2 AND 5000) IS NOT TRUE THEN
   RAISE EXCEPTION 'Closed complete category sibling metadata required' USING ERRCODE='23514';
  END IF;
  previous_id:=NULL;
  FOR member IN SELECT value FROM jsonb_array_elements(metadata->'rows') LOOP
   IF (jsonb_typeof(member)='object' AND member ?& ARRAY['id','version','display_order'] AND member-ARRAY['id','version','display_order']='{}'::jsonb
     AND jsonb_typeof(member->'id')='string' AND (member->>'id')::uuid::text=member->>'id'
     AND (previous_id IS NULL OR previous_id COLLATE "C" < (member->>'id') COLLATE "C")
     AND jsonb_typeof(member->'version')='number' AND member->>'version' ~ '^[1-9][0-9]*$' AND (member->>'version')::numeric BETWEEN 1 AND 2147483647
     AND jsonb_typeof(member->'display_order')='number' AND member->>'display_order' ~ '^-?(0|[1-9][0-9]*)$'
     AND (member->>'display_order')::numeric BETWEEN -2147483648 AND 2147483647) IS NOT TRUE THEN
    RAISE EXCEPTION 'Canonical unique bounded category sibling rows required' USING ERRCODE='23514';
   END IF;
   previous_id:=member->>'id';
  END LOOP;
 END LOOP;
 IF before_order-'rows' IS DISTINCT FROM after_order-'rows' OR jsonb_array_length(before_order->'rows')<>jsonb_array_length(after_order->'rows') THEN
  RAISE EXCEPTION 'Category sibling identity and parent cannot change' USING ERRCODE='23514';
 END IF;
 parent:=(after_order->>'parent_id')::uuid; moved:=(after_order->>'moved_id')::uuid; undo_of:=(after_order->>'undo_of_operation_id')::uuid;
 IF (a.action='REORDER') IS DISTINCT FROM (undo_of IS NULL) OR undo_of=a.operation_id THEN
  RAISE EXCEPTION 'Category action and original undo operation differ' USING ERRCODE='23514';
 END IF;
 changed_ids:=ARRAY[]::uuid[];
 FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
  old_member:=before_order->'rows'->n; new_member:=after_order->'rows'->n;
  IF old_member->'id' IS DISTINCT FROM new_member->'id'
    OR (new_member->>'version')::bigint<>(old_member->>'version')::bigint+(CASE WHEN old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'Changed category rows advance exactly once; all siblings retained' USING ERRCODE='23514';
  END IF;
  IF old_member->'display_order' IS DISTINCT FROM new_member->'display_order' THEN changed_ids:=array_append(changed_ids,(new_member->>'id')::uuid); END IF;
  IF new_member->>'id'=a.object_id::text AND (old_member->'version' IS DISTINCT FROM to_jsonb(a.old_version)
    OR new_member->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR old_member->'display_order' IS DISTINCT FROM a.before_values->'display_order'
    OR new_member->'display_order' IS DISTINCT FROM a.after_values->'display_order') THEN
   RAISE EXCEPTION 'Category anchor sparse values differ from its exact member' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF cardinality(changed_ids)=0 OR NOT a.object_id=ANY(changed_ids)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE m->>'id'=moved::text) THEN
  RAISE EXCEPTION 'Actual changed category anchor and moved member required' USING ERRCODE='23514';
 END IF;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO old_ids FROM jsonb_array_elements(before_order->'rows') m;
 SELECT array_agg(m->>'id' ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO new_ids FROM jsonb_array_elements(after_order->'rows') m;
 IF a.action='REORDER' THEN
  IF a.object_id<>changed_ids[1] OR old_ids=new_ids OR array_remove(old_ids,moved::text) IS DISTINCT FROM array_remove(new_ids,moved::text)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(after_order->'rows') m WHERE (m->>'display_order')::integer<>array_position(new_ids,m->>'id')-1) THEN
   RAISE EXCEPTION 'Only the selected sibling may move into contiguous complete order' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT * INTO STRICT original_r FROM naijue_erp.operation_receipt WHERE id=undo_of;
  SELECT * INTO STRICT original_a FROM naijue_erp.audit_change WHERE operation_id=undo_of;
  original_before:=original_a.before_values->'category_order'; original_after:=original_a.after_values->'category_order';
  IF (original_r.target_type='CATEGORY' AND original_r.action='REORDER' AND original_r.status='COMMITTED'
    AND original_r.actor_account_id=a.actor_account_id AND original_r.target_id=a.object_id
    AND original_a.object_type='CATEGORY' AND original_a.action='REORDER' AND original_a.object_id=a.object_id
    AND original_a.actor_account_id=a.actor_account_id AND original_a.occurred_at=original_r.completed_at
    AND original_before-'rows'=original_after-'rows' AND original_after->'undo_of_operation_id'='null'::jsonb
    AND original_after->'parent_id'=after_order->'parent_id' AND original_after->'moved_id'=after_order->'moved_id'
    AND before_order->'rows'=original_after->'rows'
    AND jsonb_array_length(original_before->'rows')=jsonb_array_length(after_order->'rows')) IS NOT TRUE THEN
   RAISE EXCEPTION 'Undo requires the same actor original reorder and its unchanged complete poststate' USING ERRCODE='23514';
  END IF;
  FOR n IN 0..jsonb_array_length(after_order->'rows')-1 LOOP
   IF after_order->'rows'->n->'id' IS DISTINCT FROM original_before->'rows'->n->'id'
     OR after_order->'rows'->n->'display_order' IS DISTINCT FROM original_before->'rows'->n->'display_order' THEN
    RAISE EXCEPTION 'Undo restores only exact original integer orders' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 IF parent IS NOT NULL THEN
  PERFORM 1 FROM naijue_erp.product_category WHERE id=parent AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual retained category parent required' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL ORDER BY id FOR SHARE;
 SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'display_order',display_order) ORDER BY id) INTO actual_rows
  FROM naijue_erp.product_category WHERE parent_id IS NOT DISTINCT FROM parent AND deleted_at IS NULL;
 IF actual_rows IS DISTINCT FROM after_order->'rows' THEN
  RAISE EXCEPTION 'Final complete category siblings differ from aggregate after evidence' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO written_ids FROM naijue_erp.product_category WHERE xmin::text::bigint=current_xid;
 IF written_ids IS DISTINCT FROM changed_ids OR EXISTS(SELECT 1 FROM naijue_erp.product_category
   WHERE id=ANY(changed_ids) AND cmin::text::bigint<=audit_command) THEN
  RAISE EXCEPTION 'Only exact changed siblings may be written after the prepared audit' USING ERRCODE='23514';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',m->'id','version',m->'version','displayOrder',m->'display_order')
   ORDER BY (m->>'display_order')::integer,(m->>'id') COLLATE "C") INTO result_members FROM jsonb_array_elements(after_order->'rows') m;
 expected_result:=jsonb_build_object('operationId',a.operation_id,'kind','CATEGORY','targetId',a.object_id,'version',a.new_version,
  'order',jsonb_build_object('parentId',parent,'undoOfOperationId',undo_of,'members',result_members));
 IF r.result_data IS DISTINCT FROM expected_result THEN
  RAISE EXCEPTION 'Category receipt must return the exact complete aggregate poststate' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION naijue_erp.maintenance_check_category_order(naijue_erp.audit_change) FROM PUBLIC;

-- Original routines below preserve every other family and bootstrap branch.
-- D1 inserts only narrow new CATEGORY branches; exact bodies are pinned by the v15 runtime probe.


CREATE OR REPLACE FUNCTION naijue_erp.maintenance_action_allowed(kind text, action text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE','REORDER','UNDO_REORDER')
    WHEN 'COLOR' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'FIT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'HALL' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'WAREHOUSE' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'STAFF' THEN action IN ('CREATE','EDIT','LEAVE','REINSTATE')
    WHEN 'ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','RESET_PASSWORD')
    WHEN 'PAYMENT_METHOD' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    WHEN 'PAYMENT_ACCOUNT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE')
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_receipt_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE native_version integer; native_xid bigint; a naijue_erp.audit_change%ROWTYPE; root_table regclass;
BEGIN
  IF NEW.target_type='CATEGORY' AND NEW.action IN ('REORDER','UNDO_REORDER') THEN
    SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
    PERFORM naijue_erp.maintenance_check_category_order(a);
    RETURN NULL;
  END IF;
  root_table:=naijue_erp.maintenance_root_table(NEW.target_type);
  IF root_table IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT version,xmin::text::bigint FROM %s WHERE id=$1 FOR SHARE',root_table) INTO STRICT native_version,native_xid USING NEW.target_id;
  SELECT * INTO STRICT a FROM naijue_erp.audit_change WHERE operation_id=NEW.id;
  IF NOT naijue_erp.maintenance_audit_is_current(NEW.id) OR native_xid<>mod(pg_current_xact_id()::text::numeric,4294967296)::bigint
    OR NEW.status<>'COMMITTED' OR (NEW.result_data->>'version')::numeric<>native_version
    OR a.object_type<>NEW.target_type OR a.object_id<>NEW.target_id OR a.actor_account_id<>NEW.actor_account_id
    OR a.action<>NEW.action OR a.new_version<>native_version OR a.occurred_at IS DISTINCT FROM NEW.completed_at
    OR jsonb_typeof(a.after_values) IS DISTINCT FROM 'object' OR a.after_values->'version' IS DISTINCT FROM to_jsonb(a.new_version)
    OR (a.old_version IS NULL AND (a.before_values IS NOT NULL OR a.action<>'CREATE'))
    OR (a.old_version IS NOT NULL AND (jsonb_typeof(a.before_values) IS DISTINCT FROM 'object'
      OR a.before_values->'version' IS DISTINCT FROM to_jsonb(a.old_version) OR a.action='CREATE'))
    OR NOT naijue_erp.safe_maintenance_evidence(a.before_values) OR NOT naijue_erp.safe_maintenance_evidence(a.after_values) THEN
    RAISE EXCEPTION 'Maintenance receipt audit and final native root must close together' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_root_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
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
    IF TG_OP='INSERT' AND (new_root->>'default_barcode_scheme_id') IS NULL THEN
      RAISE EXCEPTION 'New runtime product requires an explicit real default barcode scheme' USING ERRCODE='23514';
    END IF;
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

-- Wrap only the approved two actions around the complete original result expression.
-- All other predicates (including IMPORT CORE/full binding) remain byte-derived from the predecessor catalog.
DO $$
DECLARE old_expression text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_catalog.pg_constraint
  WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
 ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
 EXECUTE format($constraint$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE
  WHEN target_type='CATEGORY' AND action IN ('REORDER','UNDO_REORDER') THEN
   jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','kind','targetId','version','order']
   AND result_data-ARRAY['operationId','kind','targetId','version','order']='{}'::jsonb
   AND jsonb_typeof(result_data->'operationId')='string' AND result_data->>'operationId'=id::text
   AND result_data->>'kind'='CATEGORY' AND jsonb_typeof(result_data->'targetId')='string' AND result_data->>'targetId'=target_id::text
   AND jsonb_typeof(result_data->'version')='number' AND result_data->>'version' ~ '^[1-9][0-9]*$'
   AND jsonb_typeof(result_data->'order')='object' AND result_data->'order' ?& ARRAY['parentId','undoOfOperationId','members']
   AND result_data->'order'-ARRAY['parentId','undoOfOperationId','members']='{}'::jsonb
   AND jsonb_typeof(result_data->'order'->'members')='array'
  ELSE (%s) END) IS TRUE)$constraint$,old_expression);
END $$;
-- C must review/grant only this INVOKER helper's exact EXECUTE to the original runtime role.
COMMIT;
