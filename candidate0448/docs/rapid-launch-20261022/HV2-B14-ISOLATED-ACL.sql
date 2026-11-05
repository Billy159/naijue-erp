BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $target$ BEGIN
  IF current_database() <> 'erp_hv2_b14_20261028_01' OR (SELECT oid FROM pg_database WHERE datname=current_database()) <> 16399
     OR current_user <> 'hv2_b14_owner_20261028_01' OR session_user <> current_user
     OR pg_postmaster_start_time() <> '2026-10-28 08:36:13.490836+00'::timestamptz
  THEN RAISE EXCEPTION 'EXACT_B14_ISOLATED_TARGET_REQUIRED'; END IF;
  IF has_schema_privilege('hv2_b14_runtime_20261028_01','naijue_erp','USAGE') THEN RAISE EXCEPTION 'ORIGINAL_NO_GRANT_BASELINE_REQUIRED'; END IF;
  IF has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','parent_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','deleted_at','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','id','INSERT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','parent_id','INSERT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','name','INSERT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','display_order','INSERT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','version','INSERT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.product_category','parent_id','UPDATE')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','operation_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','actor_account_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_type','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','action','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','old_version','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','new_version','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','before_values','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','after_values','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','occurred_at','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_sales_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_transfer_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_customer_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_supplier_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_product_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_category_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_color_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_fit_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_hall_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_warehouse_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_staff_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_account_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_payment_method_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_payment_account_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_history_sales_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.audit_change','object_history_transfer_id','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.import_batch','status','SELECT')
     OR has_column_privilege('hv2_b14_runtime_20261028_01','naijue_erp.import_batch','inventory_mode','SELECT') THEN RAISE EXCEPTION 'ORIGINAL_COLUMN_NO_GRANT_BASELINE_REQUIRED'; END IF;
END $target$;
GRANT USAGE ON SCHEMA naijue_erp TO hv2_b14_runtime_20261028_01;
GRANT SELECT (id, parent_id, deleted_at) ON naijue_erp.product_category TO hv2_b14_runtime_20261028_01;
GRANT INSERT (id, parent_id, name, display_order, version) ON naijue_erp.product_category TO hv2_b14_runtime_20261028_01;
GRANT UPDATE (parent_id) ON naijue_erp.product_category TO hv2_b14_runtime_20261028_01;
GRANT SELECT (id, operation_id, actor_account_id, object_type, object_id, action, old_version, new_version, before_values, after_values, occurred_at, object_sales_id, object_transfer_id, object_customer_id, object_supplier_id, object_product_id, object_category_id, object_color_id, object_fit_id, object_hall_id, object_warehouse_id, object_staff_id, object_account_id, object_payment_method_id, object_payment_account_id, object_history_sales_id, object_history_transfer_id) ON naijue_erp.audit_change TO hv2_b14_runtime_20261028_01;
GRANT SELECT (status, inventory_mode) ON naijue_erp.import_batch TO hv2_b14_runtime_20261028_01;
COMMIT;
