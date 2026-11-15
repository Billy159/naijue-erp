-- Source candidate. Install only with the matching command and commit guards.
CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_step_v1(
 identity jsonb,work_batch jsonb,step_ordinal integer,command_phase text,request jsonb,private_parameter text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE result jsonb; group_descriptor jsonb:=work_batch; root_operation uuid:=(identity->>'rootOperationId')::uuid;
BEGIN
 result:=naijue_erp.standard_whole_package_command_v2(
   request,private_parameter,command_phase,root_operation,step_ordinal,jsonb_build_object('identity',identity,'work_batch',work_batch));
 IF result->>'state' IS DISTINCT FROM 'PENDING_TRANSACTION' THEN
  RAISE EXCEPTION 'BATCH_STEP_RESULT_INVALID' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','subBatchId',group_descriptor->>'subBatchId',
   'descriptorSha256',group_descriptor->>'descriptorSha256','operationId',request->>'operation_id',
   'ordinal',step_ordinal);
END $function$;

CREATE OR REPLACE FUNCTION naijue_erp.standard_batched_import_complete_v1(identity jsonb,work_batch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,naijue_erp,pg_temp SET TimeZone='UTC' AS $function$
DECLARE root_operation uuid:=(identity->>'rootOperationId')::uuid; group_descriptor jsonb:=work_batch;
 final_summary jsonb;
BEGIN
 -- This validates this transaction's exact group, including both endpoints.
 PERFORM naijue_erp.standard_batched_import_assert_group_v1(root_operation,jsonb_build_object('identity',identity,'work_batch',work_batch));
 IF group_descriptor->>'phase'='FINALIZE' THEN
  PERFORM naijue_erp.standard_whole_package_closed_v2(root_operation);
  final_summary:=jsonb_build_object('rootOperationId',root_operation,
    'batchId',identity->>'batchId','documentBatchId',identity->>'documentBatchId',
    'packageSha256',identity->>'packageSha256','planSha256',identity->>'planSha256','status','IMPORTED');
 END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN jsonb_build_object('state','PENDING_TRANSACTION','subBatchId',group_descriptor->>'subBatchId',
   'descriptorSha256',group_descriptor->>'descriptorSha256','summary',final_summary);
END $function$;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_step_v1(jsonb,jsonb,integer,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION naijue_erp.standard_batched_import_complete_v1(jsonb,jsonb) FROM PUBLIC;
