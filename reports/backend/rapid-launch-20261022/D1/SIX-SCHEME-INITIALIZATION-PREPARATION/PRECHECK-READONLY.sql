-- Query fragments for T45's ORIGINAL readonly wrapper. Not an owner write script, no transaction here.
-- Original inputs remain T45-held parameter data: :batch_id, :actor_id, :request_key.
SELECT current_database() AS database,d.oid::text AS database_oid,current_user AS role,session_user,
 inet_server_addr()::text AS server_address,inet_server_port() AS server_port,
 pg_postmaster_start_time()::text AS postmaster_started_at
 FROM pg_catalog.pg_database d WHERE d.datname=current_database();
SELECT id,source_name,source_hash,cutoff_at::text,mapping_version,status,checkpoint,
 history_payload_hash,history_expected_counts,history_validation_passed,completed_at
 FROM naijue_erp.import_batch WHERE id=:'batch_id'::uuid;
SELECT r.id,r.actor_account_id,r.request_key,r.request_hash,r.status,r.result_data,
 a.before_values,a.after_values,a.old_version,a.new_version
 FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id
 WHERE r.target_type='IMPORT' AND r.target_id=:'batch_id'::uuid AND r.action='IMPORT_CORE_STAGE';
SELECT count(*)::text AS entire_scheme_count,
 coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb) AS entire_scheme_rows
 FROM naijue_erp.barcode_scheme s;
SELECT EXISTS(SELECT 1 FROM naijue_erp.import_source_row WHERE batch_id=:'batch_id'::uuid AND entity_type='BARCODE') AS barcode_source_exists,
 EXISTS(SELECT 1 FROM naijue_erp.sku_barcode) AS any_sku_barcode_exists;
SELECT id,action,target_type,target_id,status,request_hash,result_data FROM naijue_erp.operation_receipt
 WHERE actor_account_id=:'actor_id'::uuid AND request_key=:'request_key';
SELECT col AS column_name,has_column_privilege(current_user,'naijue_erp.barcode_scheme',col,'INSERT') AS can_insert,
 has_column_privilege(current_user,'naijue_erp.barcode_scheme',col,'UPDATE') AS can_update
 FROM unnest(ARRAY['id','name','barcode_type','rule_description','code_length','rule_version','status']) col;
SELECT has_table_privilege(current_user,'naijue_erp.barcode_scheme','SELECT') AS table_select,
 has_table_privilege(current_user,'naijue_erp.barcode_scheme','UPDATE') AS table_update,
 has_table_privilege(current_user,'naijue_erp.barcode_scheme','MAINTAIN') AS table_maintain,
 has_table_privilege(current_user,'naijue_erp.barcode_scheme','DELETE') AS table_delete,
 has_table_privilege(current_user,'naijue_erp.barcode_scheme','TRUNCATE') AS table_truncate,
 has_function_privilege(current_user,'naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)','EXECUTE') AS helper_execute;
-- Capture raw ACL metadata in the ORIGINAL owner observation, no catalog updates:
SELECT c.relacl::text,a.attname,a.attacl::text FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE c.oid='naijue_erp.barcode_scheme'::regclass ORDER BY a.attnum;
SELECT proacl::text FROM pg_catalog.pg_proc
 WHERE oid='naijue_erp.assert_barcode_scheme_initialization_v19(uuid,uuid)'::regprocedure;
