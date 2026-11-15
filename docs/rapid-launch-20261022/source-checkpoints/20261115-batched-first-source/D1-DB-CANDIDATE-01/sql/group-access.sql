-- Existing roles only. Controller keeps its existing SET ROLE authority.
REVOKE ALL ON FUNCTION
 naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text),
 naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_assert_group_v1(uuid,jsonb),
 naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer,jsonb)
FROM PUBLIC,erp_unified27_runtime_2393dbc6db9581c2,
 erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION
 naijue_erp.standard_batched_import_inspect_v1(jsonb,jsonb),
 naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb)
TO erp_unified27_importer_2393dbc6db9581c2;
GRANT EXECUTE ON FUNCTION
 naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text)
TO erp_unified27_initializer_2393dbc6db9581c2,erp_unified27_importer_2393dbc6db9581c2;
