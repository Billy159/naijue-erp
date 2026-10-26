-- DISABLED EXAMPLE ONLY, for exactly the all-absent baseline -> three grants above.
-- Actual inverse MUST be generated from the recorded fresh missing-only delta, not blanket-revoke old rights.
REVOKE EXECUTE ON FUNCTION naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)
 FROM "erp_rewrite_runtime_20261022";
REVOKE UPDATE (id) ON naijue_erp.barcode_scheme FROM "erp_rewrite_runtime_20261022";
REVOKE INSERT (id,name,barcode_type,rule_description,code_length,rule_version,status)
 ON naijue_erp.barcode_scheme FROM "erp_rewrite_runtime_20261022";
-- Preserve pre-existing SELECT/column/function grants and every other role.
-- Verify original effective permissions, then read actual canonical again; do not assume b5d8/old review restored.
-- This only rolls back new privileges, never deletes the six committed scheme rows or original receipts.
