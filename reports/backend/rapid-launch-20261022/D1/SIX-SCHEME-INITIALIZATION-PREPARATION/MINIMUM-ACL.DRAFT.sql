-- DISABLED DRAFT ONLY. T45 owns a separate serial owner window and fresh before/after ACL evidence.
-- Use acl-delta.mjs with the fresh baseline to emit ONLY missing permissions and its exact inverse.
-- The three statements below are the maximum required delta when all are absent, not blind grants.
GRANT INSERT (id,name,barcode_type,rule_description,code_length,rule_version,status)
 ON naijue_erp.barcode_scheme TO "erp_rewrite_runtime_20261022";
GRANT UPDATE (id) ON naijue_erp.barcode_scheme TO "erp_rewrite_runtime_20261022";
GRANT EXECUTE ON FUNCTION naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)
 TO "erp_rewrite_runtime_20261022";
-- No MAINTAIN, table UPDATE/DELETE/TRUNCATE, PUBLIC, GRANT OPTION, new definer or table SHARE.
-- UPDATE(id) is for retained SELECT FOR SHARE rows, not permission for the removed table LOCK.
