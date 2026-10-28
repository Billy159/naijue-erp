-- Reference only. T45 must recheck target and recorded grant delta before executing.
BEGIN;
REVOKE SELECT (status, inventory_mode) ON naijue_erp.import_batch FROM hv2_b14_runtime_20261028_01;
REVOKE SELECT (id, operation_id, actor_account_id, object_type, object_id, action, old_version, new_version, before_values, after_values, occurred_at, object_sales_id, object_transfer_id, object_customer_id, object_supplier_id, object_product_id, object_category_id, object_color_id, object_fit_id, object_hall_id, object_warehouse_id, object_staff_id, object_account_id, object_payment_method_id, object_payment_account_id, object_history_sales_id, object_history_transfer_id) ON naijue_erp.audit_change FROM hv2_b14_runtime_20261028_01;
REVOKE UPDATE (parent_id) ON naijue_erp.product_category FROM hv2_b14_runtime_20261028_01;
REVOKE INSERT (id, parent_id, name, display_order, version) ON naijue_erp.product_category FROM hv2_b14_runtime_20261028_01;
REVOKE SELECT (id, parent_id, deleted_at) ON naijue_erp.product_category FROM hv2_b14_runtime_20261028_01;
REVOKE USAGE ON SCHEMA naijue_erp FROM hv2_b14_runtime_20261028_01;
COMMIT;
