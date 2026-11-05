-- C01-20261022-v1 group B: twenty generated FKs and closed common maintenance evidence.
-- Source only; original non-maintenance receipt predicates are preserved as catalog expressions.
BEGIN;
CREATE FUNCTION naijue_erp.maintenance_action_allowed(kind text, action text) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN action IN ('CREATE','EDIT','DISABLE','RESTORE','DELETE')
    WHEN 'CATEGORY' THEN action IN ('CREATE','EDIT','DELETE')
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
CREATE FUNCTION naijue_erp.maintenance_root_table(kind text) RETURNS regclass LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT CASE kind
    WHEN 'PRODUCT' THEN 'naijue_erp.product'::regclass
    WHEN 'CATEGORY' THEN 'naijue_erp.product_category'::regclass
    WHEN 'COLOR' THEN 'naijue_erp.color'::regclass
    WHEN 'FIT' THEN 'naijue_erp.fit'::regclass
    WHEN 'HALL' THEN 'naijue_erp.hall'::regclass
    WHEN 'WAREHOUSE' THEN 'naijue_erp.warehouse'::regclass
    WHEN 'STAFF' THEN 'naijue_erp.staff'::regclass
    WHEN 'ACCOUNT' THEN 'naijue_erp.user_account'::regclass
    WHEN 'PAYMENT_METHOD' THEN 'naijue_erp.payment_method'::regclass
    WHEN 'PAYMENT_ACCOUNT' THEN 'naijue_erp.payment_account'::regclass
    ELSE NULL END;
$$;
-- Finite new union: 'PRODUCT','CATEGORY','COLOR','FIT','HALL','WAREHOUSE','STAFF','ACCOUNT','PAYMENT_METHOD','PAYMENT_ACCOUNT'
DO $$
DECLARE old_expression text; rel regclass; column_name text; constraint_name text; kinds text[]:=ARRAY['PRODUCT','CATEGORY','COLOR','FIT','HALL','WAREHOUSE','STAFF','ACCOUNT','PAYMENT_METHOD','PAYMENT_ACCOUNT']; item text;
BEGIN
  FOR rel,column_name,constraint_name IN SELECT * FROM (VALUES ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_target_kind'),('naijue_erp.audit_change'::regclass,'object_type','audit_object_kind')) AS x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=constraint_name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,constraint_name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (((%s) OR %I=ANY(%L::text[])) IS TRUE)',rel,constraint_name,old_expression,column_name,kinds);
  END LOOP;
  FOR rel,column_name,constraint_name IN SELECT * FROM (VALUES ('naijue_erp.operation_receipt'::regclass,'target_type','receipt_action_by_kind'),('naijue_erp.audit_change'::regclass,'object_type','audit_action_by_kind')) AS x(r,c,n) LOOP
    SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid=rel AND conname=constraint_name;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',rel,constraint_name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK ((CASE WHEN %I=ANY(%L::text[]) THEN naijue_erp.maintenance_action_allowed(%I,action) ELSE (%s) END) IS TRUE)',rel,constraint_name,column_name,kinds,column_name,old_expression);
  END LOOP;
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT old_expression FROM pg_constraint WHERE conrelid='naijue_erp.operation_receipt'::regclass AND conname='receipt_result_by_kind';
  ALTER TABLE naijue_erp.operation_receipt DROP CONSTRAINT receipt_result_by_kind;
  EXECUTE format($sql$ALTER TABLE naijue_erp.operation_receipt ADD CONSTRAINT receipt_result_by_kind CHECK ((CASE WHEN target_type=ANY(%L::text[]) THEN
    (jsonb_typeof(result_data)='object' AND result_data ?& ARRAY['operationId','kind','targetId','version']
    AND result_data-ARRAY['operationId','kind','targetId','version']='{}'::jsonb
    AND jsonb_typeof(result_data->'operationId')='string' AND result_data->>'operationId'=id::text
    AND jsonb_typeof(result_data->'kind')='string' AND result_data->>'kind'=target_type
    AND jsonb_typeof(result_data->'targetId')='string' AND result_data->>'targetId'=target_id::text
    AND jsonb_typeof(result_data->'version')='number' AND result_data->>'version' ~ '^[1-9][0-9]*$')
    ELSE (%s) END) IS TRUE)$sql$,kinds,old_expression);
END $$;
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_product_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='PRODUCT' THEN target_id END) STORED REFERENCES naijue_erp.product(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_product_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='PRODUCT' THEN object_id END) STORED REFERENCES naijue_erp.product(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_product_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='PRODUCT';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_category_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='CATEGORY' THEN target_id END) STORED REFERENCES naijue_erp.product_category(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_category_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='CATEGORY' THEN object_id END) STORED REFERENCES naijue_erp.product_category(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_category_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='CATEGORY';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_color_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='COLOR' THEN target_id END) STORED REFERENCES naijue_erp.color(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_color_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='COLOR' THEN object_id END) STORED REFERENCES naijue_erp.color(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_color_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='COLOR';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_fit_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='FIT' THEN target_id END) STORED REFERENCES naijue_erp.fit(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_fit_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='FIT' THEN object_id END) STORED REFERENCES naijue_erp.fit(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_fit_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='FIT';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_hall_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='HALL' THEN target_id END) STORED REFERENCES naijue_erp.hall(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_hall_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='HALL' THEN object_id END) STORED REFERENCES naijue_erp.hall(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_hall_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='HALL';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_warehouse_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='WAREHOUSE' THEN target_id END) STORED REFERENCES naijue_erp.warehouse(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_warehouse_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='WAREHOUSE' THEN object_id END) STORED REFERENCES naijue_erp.warehouse(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_warehouse_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='WAREHOUSE';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_staff_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='STAFF' THEN target_id END) STORED REFERENCES naijue_erp.staff(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_staff_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='STAFF' THEN object_id END) STORED REFERENCES naijue_erp.staff(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_staff_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='STAFF';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_account_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='ACCOUNT' THEN target_id END) STORED REFERENCES naijue_erp.user_account(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_account_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='ACCOUNT' THEN object_id END) STORED REFERENCES naijue_erp.user_account(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_account_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='ACCOUNT';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_payment_method_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='PAYMENT_METHOD' THEN target_id END) STORED REFERENCES naijue_erp.payment_method(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_payment_method_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='PAYMENT_METHOD' THEN object_id END) STORED REFERENCES naijue_erp.payment_method(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_payment_method_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='PAYMENT_METHOD';
ALTER TABLE naijue_erp.operation_receipt ADD COLUMN target_payment_account_id uuid GENERATED ALWAYS AS (CASE WHEN target_type='PAYMENT_ACCOUNT' THEN target_id END) STORED REFERENCES naijue_erp.payment_account(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE naijue_erp.audit_change ADD COLUMN object_payment_account_id uuid GENERATED ALWAYS AS (CASE WHEN object_type='PAYMENT_ACCOUNT' THEN object_id END) STORED REFERENCES naijue_erp.payment_account(id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX audit_payment_account_root_version ON naijue_erp.audit_change(object_id,new_version) WHERE object_type='PAYMENT_ACCOUNT';

CREATE FUNCTION naijue_erp.safe_maintenance_evidence(value jsonb, depth integer DEFAULT 0) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE item record;
BEGIN
  IF depth>16 OR octet_length(value::text)>16777216 THEN RETURN false; END IF;
  IF value IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(value)='object' THEN
    FOR item IN SELECT * FROM jsonb_each(value) LOOP
      IF lower(item.key) IN ('password','password_hash','passwordhash','currentpassword','newpassword','token','token_hash','tokenhash','cookie','authorization','secret')
        OR NOT naijue_erp.safe_maintenance_evidence(item.value,depth+1) THEN RETURN false; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value)='array' THEN
    FOR item IN SELECT v FROM jsonb_array_elements(value) AS x(v) LOOP
      IF NOT naijue_erp.safe_maintenance_evidence(item.v,depth+1) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;
CREATE FUNCTION naijue_erp.maintenance_evidence_matches(expected jsonb, actual jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF expected IS NULL OR actual IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(actual)='number' AND jsonb_typeof(expected)='string'
    AND expected#>>'{}' ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$' THEN
    RETURN (expected#>>'{}')::numeric=(actual#>>'{}')::numeric;
  END IF;
  IF jsonb_typeof(actual)='string' AND jsonb_typeof(expected)='string'
    AND actual#>>'{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$'
    AND expected#>>'{}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN (expected#>>'{}')::timestamptz=(actual#>>'{}')::timestamptz;
  END IF;
  RETURN expected=actual;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE FUNCTION naijue_erp.maintenance_audit_is_current(operation uuid) RETURNS boolean LANGUAGE sql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT EXISTS(SELECT 1 FROM naijue_erp.audit_change a WHERE a.operation_id=operation
    AND a.xmin::text::bigint=mod(pg_current_xact_id()::text::numeric,4294967296)::bigint);
$$;
CREATE FUNCTION naijue_erp.maintenance_complete_row_matches(expected jsonb,actual jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE field record;
BEGIN
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR jsonb_typeof(actual) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(expected))<>(SELECT count(*) FROM jsonb_object_keys(actual)) THEN RETURN false; END IF;
  FOR field IN SELECT * FROM jsonb_each(actual) LOOP
    IF NOT naijue_erp.maintenance_evidence_matches(expected->field.key,field.value) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE FUNCTION naijue_erp.maintenance_exact_rows_match(expected jsonb,actual jsonb,key_name text DEFAULT 'id') RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE item jsonb; corresponding jsonb;
BEGIN
  IF jsonb_typeof(expected) IS DISTINCT FROM 'array' OR jsonb_typeof(actual) IS DISTINCT FROM 'array'
    OR jsonb_array_length(expected)<>jsonb_array_length(actual)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x(v) GROUP BY v->>key_name HAVING count(*)<>1 OR v->>key_name IS NULL) THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(actual) LOOP
    SELECT value INTO corresponding FROM jsonb_array_elements(expected) WHERE value->>key_name=item->>key_name;
    IF NOT naijue_erp.maintenance_complete_row_matches(corresponding,item) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION naijue_erp.maintenance_payment_halls(target uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY hall_id),'[]'::jsonb) FROM naijue_erp.payment_account_hall h WHERE payment_account_id=target;
$$;
CREATE FUNCTION naijue_erp.maintenance_staff_accounts(target uuid) RETURNS jsonb LANGUAGE sql STABLE
SET search_path=pg_catalog,naijue_erp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a)-'password_hash' ORDER BY id),'[]'::jsonb) FROM naijue_erp.user_account a WHERE staff_id=target;
$$;
CREATE FUNCTION naijue_erp.maintenance_product_child_row(child_kind text,child uuid,product uuid) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE result jsonb;
BEGIN
  CASE child_kind
    WHEN 'skus' THEN SELECT to_jsonb(s) INTO result FROM naijue_erp.sku s WHERE s.id=child AND s.product_id=product;
    WHEN 'barcodes' THEN SELECT to_jsonb(b) INTO result FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE b.id=child AND s.product_id=product;
    WHEN 'images' THEN SELECT to_jsonb(i) INTO result FROM naijue_erp.product_image i WHERE i.id=child AND i.product_id=product;
    ELSE RAISE EXCEPTION 'Unknown maintenance child family' USING ERRCODE='23514';
  END CASE;
  RETURN result;
END $$;
CREATE FUNCTION naijue_erp.maintenance_check_product_children(audit naijue_erp.audit_change,before_mutation boolean) RETURNS void LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE child_kind text; previous jsonb; following jsonb; item jsonb; old_item jsonb; actual jsonb; target uuid;
BEGIN
  FOREACH child_kind IN ARRAY ARRAY['skus','barcodes','images'] LOOP
    IF NOT (coalesce(audit.after_values,'{}'::jsonb) ? child_kind OR coalesce(audit.before_values,'{}'::jsonb) ? child_kind) THEN CONTINUE; END IF;
    previous:=coalesce(audit.before_values->child_kind,'[]'::jsonb); following:=audit.after_values->child_kind;
    IF jsonb_typeof(previous) IS DISTINCT FROM 'array' OR jsonb_typeof(following) IS DISTINCT FROM 'array'
      OR jsonb_array_length(previous)>20000 OR jsonb_array_length(following)>20000
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(previous) x(v) GROUP BY v->>'id' HAVING count(*)<>1 OR v->>'id' IS NULL)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) GROUP BY v->>'id' HAVING count(*)<>1 OR v->>'id' IS NULL) THEN
      RAISE EXCEPTION 'Exact unique changed child arrays required' USING ERRCODE='23514';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(previous) LOOP
      target:=(item->>'id')::uuid; actual:=naijue_erp.maintenance_product_child_row(child_kind,target,audit.object_id);
      IF before_mutation AND NOT naijue_erp.maintenance_complete_row_matches(item,actual) THEN
        RAISE EXCEPTION 'Child before evidence is not the actual retained row' USING ERRCODE='23514';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) WHERE v->>'id'=target::text) THEN
        IF child_kind<>'images' OR (NOT before_mutation AND actual IS NOT NULL) THEN
          RAISE EXCEPTION 'Only explicitly audited image removal may remove a child' USING ERRCODE='23514';
        END IF;
      END IF;
    END LOOP;
    FOR item IN SELECT value FROM jsonb_array_elements(following) LOOP
      target:=(item->>'id')::uuid; actual:=naijue_erp.maintenance_product_child_row(child_kind,target,audit.object_id);
      SELECT value INTO old_item FROM jsonb_array_elements(previous) WHERE value->>'id'=target::text;
      IF before_mutation THEN
        IF (actual IS NULL AND old_item IS NOT NULL) OR (actual IS NOT NULL AND NOT naijue_erp.maintenance_complete_row_matches(old_item,actual))
          OR (old_item IS NOT NULL AND old_item=item) THEN
          RAISE EXCEPTION 'Changed children must match original existence and contain a real change' USING ERRCODE='23514';
        END IF;
      ELSIF NOT naijue_erp.maintenance_complete_row_matches(item,actual) THEN
        RAISE EXCEPTION 'Final child row differs from its exact prepared audit' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION naijue_erp.maintenance_administrator_mutex() RETURNS void LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Administrator safety requires a fresh read-committed snapshot' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('naijue:maintenance:available-admin:v1',0));
END $$;
CREATE FUNCTION naijue_erp.guard_maintenance_audit_actor() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE actor record;
BEGIN
  IF naijue_erp.maintenance_root_table(NEW.object_type) IS NULL THEN RETURN NEW; END IF;
  IF NEW.object_type IN ('STAFF','ACCOUNT','HALL') THEN PERFORM naijue_erp.maintenance_administrator_mutex(); END IF;
  SELECT a.login_enabled,s.role,s.employment_status,s.hall_id INTO actor
    FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    WHERE a.id=NEW.actor_account_id FOR SHARE OF a,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actual current maintenance actor required' USING ERRCODE='42501'; END IF;
  IF actor.login_enabled IS NOT TRUE OR actor.employment_status IS DISTINCT FROM '在职'
    OR NOT (actor.role='ADMIN' OR (actor.role='WAREHOUSE' AND NEW.object_type NOT IN ('STAFF','ACCOUNT'))) THEN
    RAISE EXCEPTION 'Current actor cannot authorize this maintenance family' USING ERRCODE='42501';
  END IF;
  IF actor.hall_id IS NOT NULL THEN
    PERFORM 1 FROM naijue_erp.hall WHERE id=actor.hall_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Current actor hall is unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_audit_actor BEFORE INSERT ON naijue_erp.audit_change
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_audit_actor();

CREATE FUNCTION naijue_erp.maintenance_account_credential_action(audit naijue_erp.audit_change,account uuid) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE metadata jsonb; item jsonb; result text;
BEGIN
  IF coalesce(audit.before_values,'{}'::jsonb) ? 'account_credentials' THEN
    RAISE EXCEPTION 'Credential events occur only in the current after evidence' USING ERRCODE='23514';
  END IF;
  IF NOT (audit.after_values ? 'account_credentials') THEN RETURN NULL; END IF;
  metadata:=audit.after_values->'account_credentials';
  IF jsonb_typeof(metadata) IS DISTINCT FROM 'array' OR jsonb_array_length(metadata)=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(metadata) x(v) GROUP BY v->>'account_id' HAVING count(*)<>1 OR v->>'account_id' IS NULL) THEN
    RAISE EXCEPTION 'Exact unique account credential event metadata required' USING ERRCODE='23514';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(metadata) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['account_id','action'])
      OR item-ARRAY['account_id','action']<>'{}'::jsonb OR jsonb_typeof(item->'account_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'action') IS DISTINCT FROM 'string' OR item->>'action' NOT IN ('CREATE','RESET_PASSWORD') THEN
      RAISE EXCEPTION 'Credential metadata cannot contain secrets or extra values' USING ERRCODE='23514';
    END IF;
    IF audit.object_type='STAFF' THEN
      IF audit.action NOT IN ('CREATE','EDIT') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->'accounts') x(v) WHERE v->>'id'=item->>'account_id') THEN
        RAISE EXCEPTION 'Credential event must name a same-operation staff child' USING ERRCODE='23514';
      END IF;
    ELSIF audit.object_type='ACCOUNT' THEN
      IF item->>'account_id' IS DISTINCT FROM audit.object_id::text OR audit.action NOT IN ('CREATE','RESET_PASSWORD')
        OR item->>'action' IS DISTINCT FROM audit.action THEN
        RAISE EXCEPTION 'Credential event must match its account root action' USING ERRCODE='23514';
      END IF;
    ELSE RAISE EXCEPTION 'Unexpected credential event root' USING ERRCODE='23514'; END IF;
    IF item->>'account_id'=account::text THEN result:=item->>'action'; END IF;
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION naijue_erp.maintenance_check_account_credential(audit naijue_erp.audit_change,old_account jsonb,new_account jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE credential_action text;
BEGIN
  credential_action:=naijue_erp.maintenance_account_credential_action(audit,(new_account->>'id')::uuid);
  IF old_account IS NULL THEN
    IF credential_action IS DISTINCT FROM 'CREATE' OR coalesce(new_account->>'password_hash','') !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' THEN
      RAISE EXCEPTION 'New account requires the exact current credential event and encoding' USING ERRCODE='23514';
    END IF;
  ELSIF credential_action='RESET_PASSWORD' THEN
    IF new_account->'password_hash' IS NOT DISTINCT FROM old_account->'password_hash'
      OR coalesce(new_account->>'password_hash','') !~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$' THEN
      RAISE EXCEPTION 'Password reset must change the actual credential to the current encoding' USING ERRCODE='23514';
    END IF;
  ELSIF credential_action IS NOT NULL OR new_account->'password_hash' IS DISTINCT FROM old_account->'password_hash' THEN
    RAISE EXCEPTION 'Credential changes require an exact create or reset event' USING ERRCODE='23514';
  END IF;
END $$;
CREATE FUNCTION naijue_erp.maintenance_check_staff_accounts(audit naijue_erp.audit_change,old_staff jsonb,new_staff jsonb,before_mutation boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,naijue_erp AS $$
DECLARE previous jsonb; following jsonb; item jsonb; prior jsonb; credential_action text; access_changed boolean; must_advance boolean; actual jsonb;
BEGIN
  IF (old_staff IS NULL AND (audit.action<>'CREATE' OR new_staff->>'employment_status' IS DISTINCT FROM '在职'))
    OR (old_staff IS NOT NULL AND audit.action='CREATE')
    OR (audit.action='EDIT' AND new_staff->'employment_status' IS DISTINCT FROM old_staff->'employment_status')
    OR (audit.action='LEAVE' AND (old_staff->>'employment_status' IS DISTINCT FROM '在职' OR new_staff->>'employment_status' IS DISTINCT FROM '离职'))
    OR (audit.action='REINSTATE' AND (old_staff->>'employment_status' IS DISTINCT FROM '离职' OR new_staff->>'employment_status' IS DISTINCT FROM '在职'))
    OR (audit.action IN ('LEAVE','REINSTATE') AND new_staff-ARRAY['employment_status','version'] IS DISTINCT FROM old_staff-ARRAY['employment_status','version']) THEN
    RAISE EXCEPTION 'Exact staff create/edit/leave/reinstate transition required' USING ERRCODE='23514';
  END IF;
  access_changed:=old_staff IS NOT NULL AND (new_staff->'role' IS DISTINCT FROM old_staff->'role'
    OR new_staff->'hall_id' IS DISTINCT FROM old_staff->'hall_id' OR new_staff->'employment_status' IS DISTINCT FROM old_staff->'employment_status');
  actual:=naijue_erp.maintenance_staff_accounts(audit.object_id);
  IF NOT (audit.after_values ? 'accounts') THEN
    IF coalesce(audit.before_values,'{}'::jsonb) ? 'accounts' OR audit.after_values ? 'account_credentials'
      OR audit.action IN ('LEAVE','REINSTATE') OR (access_changed AND actual<>'[]'::jsonb) THEN
      RAISE EXCEPTION 'Staff safety transition requires complete safe account sets' USING ERRCODE='23514';
    END IF;
    RETURN;
  END IF;
  previous:=CASE WHEN old_staff IS NULL THEN '[]'::jsonb ELSE audit.before_values->'accounts' END;
  following:=audit.after_values->'accounts';
  IF jsonb_typeof(previous) IS DISTINCT FROM 'array' OR jsonb_typeof(following) IS DISTINCT FROM 'array'
    OR jsonb_array_length(previous)>1 OR jsonb_array_length(following)>1
    OR (before_mutation AND NOT naijue_erp.maintenance_exact_rows_match(previous,actual))
    OR (NOT before_mutation AND NOT naijue_erp.maintenance_exact_rows_match(following,actual)) THEN
    RAISE EXCEPTION 'Staff account evidence must equal the complete actual unique linked set' USING ERRCODE='23514';
  END IF;
  FOR prior IN SELECT value FROM jsonb_array_elements(previous) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(following) x(v) WHERE v->>'id'=prior->>'id') THEN
      RAISE EXCEPTION 'Existing linked account identity cannot be removed or rebound' USING ERRCODE='23514';
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(following) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ?& ARRAY['id','staff_id','login_name','login_enabled','auth_version','version','created_at','updated_at'])
      OR item-ARRAY['id','staff_id','login_name','login_enabled','auth_version','version','created_at','updated_at']<>'{}'::jsonb
      OR item->>'staff_id' IS DISTINCT FROM audit.object_id::text OR jsonb_typeof(item->'login_enabled') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(item->'login_name') IS DISTINCT FROM 'string' OR coalesce(item->>'login_name','')=''
      OR jsonb_typeof(item->'auth_version') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Complete credential-free actual linked account row required' USING ERRCODE='23514';
    END IF;
    credential_action:=naijue_erp.maintenance_account_credential_action(audit,(item->>'id')::uuid);
    SELECT value INTO prior FROM jsonb_array_elements(previous) WHERE value->>'id'=item->>'id';
    IF prior IS NULL THEN
      IF audit.action NOT IN ('CREATE','EDIT') OR credential_action IS DISTINCT FROM 'CREATE'
        OR item->'version' IS DISTINCT FROM '1'::jsonb OR item->'auth_version' IS DISTINCT FROM '1'::jsonb
        OR NOT naijue_erp.maintenance_evidence_matches(item->'created_at',to_jsonb(audit.occurred_at))
        OR NOT naijue_erp.maintenance_evidence_matches(item->'updated_at',to_jsonb(audit.occurred_at)) THEN
        RAISE EXCEPTION 'Optional staff account creation needs version one and exact original operation' USING ERRCODE='23514';
      END IF;
    ELSE
      IF item->'id' IS DISTINCT FROM prior->'id' OR item->'staff_id' IS DISTINCT FROM prior->'staff_id'
        OR NOT naijue_erp.maintenance_evidence_matches(item->'created_at',prior->'created_at') OR credential_action='CREATE' THEN
        RAISE EXCEPTION 'Existing account provenance cannot change' USING ERRCODE='23514';
      END IF;
      must_advance:=access_changed OR credential_action='RESET_PASSWORD'
        OR item->'login_name' IS DISTINCT FROM prior->'login_name' OR item->'login_enabled' IS DISTINCT FROM prior->'login_enabled';
      IF must_advance IS TRUE THEN
        IF (item->>'version')::bigint IS DISTINCT FROM (prior->>'version')::bigint+1
          OR (item->>'auth_version')::bigint IS DISTINCT FROM (prior->>'auth_version')::bigint+1
          OR NOT naijue_erp.maintenance_evidence_matches(item->'updated_at',to_jsonb(audit.occurred_at)) THEN
          RAISE EXCEPTION 'Combined account/security changes advance epochs exactly once' USING ERRCODE='23514';
        END IF;
        IF NOT before_mutation AND EXISTS(SELECT 1 FROM naijue_erp.auth_session WHERE account_id=(item->>'id')::uuid AND revoked_at IS NULL) THEN
          RAISE EXCEPTION 'Every old linked session must be revoked in the original operation' USING ERRCODE='23514';
        END IF;
      ELSIF NOT naijue_erp.maintenance_complete_row_matches(item,prior) THEN
        RAISE EXCEPTION 'Unchanged linked account cannot advance epochs independently' USING ERRCODE='23514';
      END IF;
    END IF;
    IF audit.action IN ('LEAVE','REINSTATE') AND (item->'login_enabled' IS DISTINCT FROM 'false'::jsonb
      OR item->'login_name' IS DISTINCT FROM prior->'login_name' OR credential_action IS NOT NULL) THEN
      RAISE EXCEPTION 'Leave and reinstate retain credentials and disable linked login' USING ERRCODE='23514';
    END IF;
    IF item->'login_enabled'='true'::jsonb THEN
      IF new_staff->>'employment_status' IS DISTINCT FROM '在职' OR new_staff->>'role' NOT IN ('ADMIN','WAREHOUSE','SALESPERSON')
        OR (new_staff->>'role'='SALESPERSON' AND new_staff->>'hall_id' IS NULL)
        OR (new_staff->>'hall_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM naijue_erp.hall WHERE id=(new_staff->>'hall_id')::uuid AND enabled)) THEN
        RAISE EXCEPTION 'Enabled linked login requires actual active staff and usable hall' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  -- Validate even an empty final account set cannot hide unmatched metadata.
  PERFORM naijue_erp.maintenance_account_credential_action(audit,NULL);
END $$;

CREATE FUNCTION naijue_erp.guard_maintenance_before_root() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; audit naijue_erp.audit_change%ROWTYPE; actual jsonb; before_accounts jsonb; after_accounts jsonb; item jsonb; following jsonb;
BEGIN
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' WHEN 'staff' THEN 'STAFF' END;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=NEW.id AND new_version=NEW.version;
  IF NOT FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Prepare original root audit before aggregate mutation' USING ERRCODE='23514';
    RETURN NEW;
  END IF;
  IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id) THEN
    RAISE EXCEPTION 'Prepared root audit must belong to this original transaction' USING ERRCODE='23514';
  END IF;
  IF family='PRODUCT' THEN PERFORM naijue_erp.maintenance_check_product_children(audit,true);
  ELSIF family='PAYMENT_ACCOUNT' AND (audit.before_values ? 'payment_halls' OR audit.after_values ? 'payment_halls') THEN
    actual:=naijue_erp.maintenance_payment_halls(NEW.id);
    IF (TG_OP='INSERT' AND actual<>'[]'::jsonb) OR (TG_OP='UPDATE' AND NOT naijue_erp.maintenance_exact_rows_match(audit.before_values->'payment_halls',actual,'hall_id'))
      OR jsonb_typeof(audit.after_values->'payment_halls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Payment hall before evidence must equal the complete actual relation set' USING ERRCODE='23514';
    END IF;
  ELSIF family='STAFF' THEN
    PERFORM naijue_erp.maintenance_check_staff_accounts(audit,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_maintenance_before_root BEFORE INSERT OR UPDATE ON naijue_erp.product FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_before_root();
CREATE TRIGGER payment_account_maintenance_before_root BEFORE INSERT OR UPDATE ON naijue_erp.payment_account FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_before_root();
CREATE TRIGGER staff_maintenance_before_root BEFORE INSERT OR UPDATE ON naijue_erp.staff FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_before_root();

CREATE FUNCTION naijue_erp.guard_maintenance_child_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; child_kind text; root_id uuid; root_version integer; row_before jsonb; row_after jsonb;
  audit naijue_erp.audit_change%ROWTYPE; before_item jsonb; after_item jsonb;
BEGIN
  row_before:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  row_after:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='payment_account_hall' THEN
    family:='PAYMENT_ACCOUNT'; child_kind:='payment_halls'; root_id:=(coalesce(row_after,row_before)->>'payment_account_id')::uuid;
    SELECT version INTO STRICT root_version FROM naijue_erp.payment_account WHERE id=root_id;
    IF TG_OP='UPDATE' AND row_before IS DISTINCT FROM row_after THEN
      RAISE EXCEPTION 'Payment hall relation identities require explicit delete/insert' USING ERRCODE='23514';
    END IF;
  ELSE
    family:='PRODUCT'; child_kind:=CASE TG_TABLE_NAME WHEN 'sku' THEN 'skus' WHEN 'sku_barcode' THEN 'barcodes' WHEN 'product_image' THEN 'images' END;
    IF child_kind IS NULL THEN RAISE EXCEPTION 'Unsupported child relation' USING ERRCODE='23514'; END IF;
    IF child_kind='barcodes' THEN SELECT product_id INTO STRICT root_id FROM naijue_erp.sku WHERE id=(coalesce(row_after,row_before)->>'sku_id')::uuid;
    ELSE root_id:=(coalesce(row_after,row_before)->>'product_id')::uuid; END IF;
    SELECT version INTO STRICT root_version FROM naijue_erp.product WHERE id=root_id;
    IF TG_OP='DELETE' AND child_kind<>'images' THEN RAISE EXCEPTION 'SKU and barcode identity must be retained' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type=family AND object_id=root_id AND new_version=root_version;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF audit.operation_id IS NULL OR NOT naijue_erp.maintenance_audit_is_current(audit.operation_id)
    OR jsonb_typeof(audit.after_values->child_kind) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Every child mutation requires the same prepared current root operation' USING ERRCODE='23514';
  END IF;
  IF child_kind='payment_halls' THEN
    IF row_before IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.before_values->child_kind) x(v) WHERE v=row_before)
      OR row_after IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v=row_after) THEN
      RAISE EXCEPTION 'Payment relation event is outside complete prepared before/after sets' USING ERRCODE='23514';
    END IF;
  ELSE
    IF row_before IS NOT NULL THEN
      SELECT value INTO before_item FROM jsonb_array_elements(audit.before_values->child_kind) WHERE value->>'id'=row_before->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(before_item,row_before) THEN
        RAISE EXCEPTION 'Actual original child differs from before evidence' USING ERRCODE='23514';
      END IF;
    END IF;
    IF row_after IS NOT NULL THEN
      SELECT value INTO after_item FROM jsonb_array_elements(audit.after_values->child_kind) WHERE value->>'id'=row_after->>'id';
      IF NOT naijue_erp.maintenance_complete_row_matches(after_item,row_after) THEN
        RAISE EXCEPTION 'Actual new child differs from after evidence' USING ERRCODE='23514';
      END IF;
    ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(audit.after_values->child_kind) x(v) WHERE v->>'id'=row_before->>'id') THEN
      RAISE EXCEPTION 'Removed child cannot remain in after evidence' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER payment_hall_maintenance_write BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.payment_account_hall FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_child_write();
CREATE TRIGGER sku_maintenance_write BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sku FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_child_write();
CREATE TRIGGER barcode_maintenance_write BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.sku_barcode FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_child_write();
CREATE TRIGGER image_maintenance_write BEFORE INSERT OR UPDATE OR DELETE ON naijue_erp.product_image FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_child_write();

CREATE FUNCTION naijue_erp.guard_maintenance_account_event() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE audit naijue_erp.audit_change%ROWTYPE; previous jsonb; following jsonb;
BEGIN
  SELECT * INTO audit FROM naijue_erp.audit_change a WHERE a.object_type='STAFF' AND a.object_id=NEW.staff_id
    AND naijue_erp.maintenance_audit_is_current(a.operation_id)
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.after_values->'accounts') x(v) WHERE v->>'id'=NEW.id::text AND v->'version'=to_jsonb(NEW.version));
  IF FOUND THEN
    IF EXISTS(SELECT 1 FROM naijue_erp.audit_change WHERE object_type='ACCOUNT' AND object_id=NEW.id AND new_version=NEW.version) THEN
      RAISE EXCEPTION 'Linked account cannot be claimed by a second operation' USING ERRCODE='23514';
    END IF;
    previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
    SELECT value INTO following FROM jsonb_array_elements(audit.after_values->'accounts') WHERE value->>'id'=NEW.id::text;
    IF NOT naijue_erp.maintenance_complete_row_matches(following,to_jsonb(NEW)-'password_hash')
      OR (TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audit.before_values->'accounts') x(v)
        WHERE naijue_erp.maintenance_complete_row_matches(v,previous-'password_hash'))) THEN
      RAISE EXCEPTION 'Actual linked account event differs from exact prepared safe evidence' USING ERRCODE='23514';
    END IF;
    PERFORM naijue_erp.maintenance_check_account_credential(audit,previous,to_jsonb(NEW));
  ELSE
    SELECT * INTO audit FROM naijue_erp.audit_change WHERE object_type='ACCOUNT' AND object_id=NEW.id AND new_version=NEW.version;
    IF FOUND THEN
      IF NOT naijue_erp.maintenance_audit_is_current(audit.operation_id) THEN
        RAISE EXCEPTION 'Account audit must be prepared in this original transaction' USING ERRCODE='23514';
      END IF;
      PERFORM naijue_erp.maintenance_check_account_credential(audit,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW));
    ELSIF EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN
      IF TG_OP='UPDATE' THEN
        IF to_jsonb(NEW)-ARRAY['password_hash','auth_version','version','updated_at']=to_jsonb(OLD)-ARRAY['password_hash','auth_version','version','updated_at']
          AND NEW.password_hash IS DISTINCT FROM OLD.password_hash
          AND NEW.password_hash ~ '^naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$'
          AND NEW.auth_version::bigint=OLD.auth_version::bigint+1 AND NEW.version::bigint=OLD.version::bigint+1 THEN RETURN NEW; END IF;
      END IF;
      RAISE EXCEPTION 'Prepare original account or staff audit before account mutation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_maintenance_event BEFORE INSERT OR UPDATE ON naijue_erp.user_account
  FOR EACH ROW EXECUTE FUNCTION naijue_erp.guard_maintenance_account_event();

CREATE FUNCTION naijue_erp.validate_maintenance_receipt_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE native_version integer; native_xid bigint; a naijue_erp.audit_change%ROWTYPE; root_table regclass;
BEGIN
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
CREATE CONSTRAINT TRIGGER maintenance_receipt_final_consistency AFTER INSERT ON naijue_erp.operation_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_maintenance_receipt_commit();

CREATE FUNCTION naijue_erp.validate_maintenance_root_commit() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,naijue_erp AS $$
DECLARE family text; a naijue_erp.audit_change%ROWTYPE; new_root jsonb; old_root jsonb; after_root jsonb; before_root jsonb;
  field record; present boolean; parent uuid; visited uuid[];
BEGIN
  family:=CASE TG_TABLE_NAME WHEN 'product' THEN 'PRODUCT' WHEN 'product_category' THEN 'CATEGORY'
    WHEN 'color' THEN 'COLOR' WHEN 'fit' THEN 'FIT' WHEN 'hall' THEN 'HALL' WHEN 'warehouse' THEN 'WAREHOUSE'
    WHEN 'staff' THEN 'STAFF' WHEN 'user_account' THEN 'ACCOUNT' WHEN 'payment_method' THEN 'PAYMENT_METHOD'
    WHEN 'payment_account' THEN 'PAYMENT_ACCOUNT' END;
  IF family IS NULL THEN RAISE EXCEPTION 'Unsupported maintenance root' USING ERRCODE='23514'; END IF;
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
DO $$
DECLARE root text;
BEGIN
  FOREACH root IN ARRAY ARRAY['product','product_category','color','fit','hall','warehouse','staff','user_account','payment_method','payment_account'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON naijue_erp.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_maintenance_root_commit()',root||'_maintenance_final_consistency',root);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON naijue_erp.%I FOR EACH ROW EXECUTE FUNCTION naijue_erp.reject_immutable_change()',root||'_retained_identity',root);
  END LOOP;
END $$;

CREATE FUNCTION naijue_erp.validate_available_administrator_commit() RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,naijue_erp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.import_batch WHERE status='IMPORTED' AND inventory_mode='CUTOFF_STOCK_BASELINE') THEN RETURN NULL; END IF;
  IF TG_OP='INSERT' THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME='user_account' THEN
    IF NEW.login_enabled IS NOT DISTINCT FROM OLD.login_enabled AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='staff' THEN
    IF NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.hall_id IS NOT DISTINCT FROM OLD.hall_id
      AND NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME='hall' THEN
    IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN RETURN NULL; END IF;
  END IF;
  PERFORM naijue_erp.maintenance_administrator_mutex();
  IF NOT EXISTS(SELECT 1 FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id
    LEFT JOIN naijue_erp.hall h ON h.id=s.hall_id
    WHERE a.login_enabled AND s.employment_status='在职' AND s.role='ADMIN' AND (s.hall_id IS NULL OR h.enabled)) THEN
    RAISE EXCEPTION 'The last usable administrator cannot disappear' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER account_available_administrator AFTER INSERT OR UPDATE ON naijue_erp.user_account
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_available_administrator_commit();
CREATE CONSTRAINT TRIGGER staff_available_administrator AFTER INSERT OR UPDATE ON naijue_erp.staff
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_available_administrator_commit();
CREATE CONSTRAINT TRIGGER hall_available_administrator AFTER INSERT OR UPDATE ON naijue_erp.hall
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION naijue_erp.validate_available_administrator_commit();

INSERT INTO naijue_erp.schema_migration(version,description)
VALUES(21,'C01-v1 typed maintenance receipts and exact sparse root audit closure; legacy branches preserved');
COMMIT;
