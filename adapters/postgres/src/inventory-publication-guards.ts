/** Exact table/trigger pairs, not a same-name count over arbitrary tables. This is capability evidence,
 * not protection against a privileged owner disabling/corrupting/re-enabling guards. */
export const GUARD_CAPABILITY = `/* inventory:guards */ SELECT
  EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'naijue_erp.inventory_ledger'::regclass
    AND confrelid = 'naijue_erp.inventory_balance'::regclass AND conname = 'ledger_retains_balance'
    AND contype = 'f' AND convalidated AND condeferrable AND confdeltype = 'a')
  AND NOT EXISTS (SELECT 1 FROM (VALUES
    ('inventory_ledger', 'immutable_ledger'), ('import_record', 'immutable_import_record'),
    ('audit_change', 'immutable_audit'), ('operation_receipt', 'immutable_receipt'),
    ('import_batch', 'import_batch_transition'), ('import_batch', 'import_batch_command_consistency'),
    ('inventory_balance', 'inventory_balance_identity'), ('inventory_balance', 'sparse_balance_final_consistency'),
    ('inventory_ledger', 'cutoff_ledger_guard'), ('import_record', 'import_record_identity'),
    ('warehouse', 'warehouse_import_identity'), ('sku', 'sku_import_identity'),
    ('import_record', 'import_source_final_consistency'), ('inventory_ledger', 'baseline_source_final_consistency'),
    ('operation_receipt', 'import_operation_consistency'), ('inventory_ledger', 'cutoff_ledger_no_truncate'),
    ('inventory_balance', 'cutoff_balance_no_truncate'), ('import_record', 'cutoff_sources_no_truncate'),
    ('import_batch', 'cutoff_batch_no_truncate'), ('operation_receipt', 'cutoff_receipts_no_truncate'),
    ('audit_change', 'cutoff_audits_no_truncate'), ('warehouse', 'cutoff_warehouse_no_truncate'), ('sku', 'cutoff_sku_no_truncate')
  ) AS required(table_name, trigger_name) WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'naijue_erp' AND c.relname = required.table_name AND t.tgname = required.trigger_name AND t.tgenabled = 'O'))
  AND NOT EXISTS (SELECT 1 FROM (VALUES ('import_batch', 'import_one_published_cutoff'), ('import_record', 'import_scope_target_once'))
    AS required(table_name, index_name) WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid = i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_class x ON x.oid = i.indexrelid WHERE n.nspname = 'naijue_erp' AND c.relname = required.table_name
      AND x.relname = required.index_name AND i.indisunique AND i.indisvalid AND i.indisready)) AS integrity_guards_present`;
