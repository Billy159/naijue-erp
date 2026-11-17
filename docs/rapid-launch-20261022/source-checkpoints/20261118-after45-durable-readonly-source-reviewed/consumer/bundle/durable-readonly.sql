BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH expected AS MATERIALIZED (
 SELECT '{"rootOperationId":"7e820f8b-0770-9773-6249-9999b0e0d758","batchId":"ee6716e0-d983-c718-bff7-98d9f872d116","documentBatchId":"9629d837-776e-7f61-4fd4-0cebd4e1a097","packageSha256":"7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679","planSha256":"afa9a6722b9b6d24d8945048695b32a1191a2670e8b61acf98624930b768eb0e","namespace":"naijue:tplus:20261102","cutoffAt":"2026-11-16T11:40:00+08:00"}'::jsonb AS identity
), root_receipt AS MATERIALIZED (
 SELECT id, status, action, target_type, target_id, actor_account_id, result_data->'batched_import_v1' AS marker
 FROM naijue_erp.operation_receipt WHERE id='7e820f8b-0770-9773-6249-9999b0e0d758'::uuid
), receipts AS MATERIALIZED (
 SELECT id,status,action,target_type,target_id,actor_account_id,result_data->'batched_import_v1' AS marker
 FROM naijue_erp.operation_receipt
 WHERE id='7e820f8b-0770-9773-6249-9999b0e0d758'::uuid
 OR result_data->'batched_import_v1'->'identity'->>'rootOperationId'='7e820f8b-0770-9773-6249-9999b0e0d758'
), same_root AS MATERIALIZED (
 SELECT *,marker->'descriptor' AS descriptor FROM receipts
 WHERE marker->'identity'->>'rootOperationId'='7e820f8b-0770-9773-6249-9999b0e0d758'
), group_members AS MATERIALIZED (
 SELECT descriptor, count(*) AS member_count,
 count(*) FILTER (WHERE status='COMMITTED') AS committed_member_count,
 bool_or(id::text=descriptor->>'firstOperationId') AS first_endpoint_present,
 bool_or(id::text=descriptor->>'lastOperationId') AS last_endpoint_present
 FROM same_root GROUP BY descriptor
), groups AS MATERIALIZED (
 SELECT *,
 CASE WHEN jsonb_typeof(descriptor->'ordinal')='number' AND descriptor->>'ordinal' ~ '^[0-9]{1,10}$' THEN (descriptor->>'ordinal')::bigint END AS ordinal,
 CASE WHEN jsonb_typeof(descriptor->'first')='number' AND descriptor->>'first' ~ '^[0-9]{1,10}$' THEN (descriptor->>'first')::bigint END AS first_step,
 CASE WHEN jsonb_typeof(descriptor->'last')='number' AND descriptor->>'last' ~ '^[0-9]{1,10}$' THEN (descriptor->>'last')::bigint END AS last_step
 FROM group_members
), links AS MATERIALIZED (
 SELECT g.descriptor, count(previous.descriptor) AS candidate_count
 FROM groups g LEFT JOIN groups previous ON previous.ordinal=g.ordinal-1 AND previous.last_step=g.first_step-1
 AND previous.descriptor->>'subBatchId'=g.descriptor->>'predecessor'
 AND previous.descriptor->>'lastOperationId'=g.descriptor->>'previousLastOperationId'
 AND previous.descriptor->>'descriptorSha256'=g.descriptor->>'previousDescriptorSha256'
 GROUP BY g.descriptor
), batches AS MATERIALIZED (
 SELECT id,status,completed_at,source_name,source_hash,cutoff_at FROM naijue_erp.import_batch
 WHERE id IN ('ee6716e0-d983-c718-bff7-98d9f872d116'::uuid,'9629d837-776e-7f61-4fd4-0cebd4e1a097'::uuid)
 OR source_name='naijue:tplus:20261102'
), namespace_records AS MATERIALIZED (
 SELECT import_batch_id,source_key,target_type,target_id,status FROM naijue_erp.import_record
 WHERE source_system='naijue:tplus:20261102' AND source_entity_type='BATCH_NAMESPACE_BINDING'
), audits AS MATERIALIZED (
 SELECT operation_id,object_type,object_id,action,actor_account_id,after_values->'batched_import_v1' AS marker
 FROM naijue_erp.audit_change
 WHERE operation_id='7e820f8b-0770-9773-6249-9999b0e0d758'::uuid
 OR after_values->'batched_import_v1'->'identity'->>'rootOperationId'='7e820f8b-0770-9773-6249-9999b0e0d758'
 OR after_values->'whole_package_v2'->>'root_operation'='7e820f8b-0770-9773-6249-9999b0e0d758'
), evidence AS (SELECT jsonb_build_object(
 'format','T45_R3_AFTER45_DURABLE_READONLY_V1',
 'databaseMatches',current_database()='erp_fresh35_20261110_r3',
 'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),
 'serverVersionNum',current_setting('server_version_num'),
 'transactionReadOnly',current_setting('transaction_read_only')='on',
 'defaultTransactionReadOnly',current_setting('default_transaction_read_only')='on',
 'root',jsonb_build_object(
  'count',(SELECT count(*) FROM root_receipt),
  'committedCount',(SELECT count(*) FROM root_receipt WHERE status='COMMITTED'),
  'otherStatusCount',(SELECT count(*) FROM root_receipt WHERE status IS DISTINCT FROM 'COMMITTED'),
  'initializationSemanticsMatch',COALESCE((SELECT bool_and(action='IMPORT_INITIALIZE_CURRENT_ADMIN' AND target_type='IMPORT' AND target_id='ee6716e0-d983-c718-bff7-98d9f872d116'::uuid) FROM root_receipt),false),
  'markerObject',COALESCE((SELECT bool_and(jsonb_typeof(marker)='object') FROM root_receipt),false),
  'identityExact',COALESCE((SELECT bool_and(marker->'identity'=e.identity) FROM root_receipt),false),
  'identityFields',(SELECT jsonb_object_agg(k,COALESCE((SELECT bool_and(marker->'identity'->k=e.identity->k) FROM root_receipt),false)) FROM unnest(ARRAY['rootOperationId','batchId','documentBatchId','packageSha256','planSha256','namespace','cutoffAt']) AS k),
  'coreDescriptor',COALESCE((SELECT bool_and(marker->'descriptor'->>'phase'='CORE' AND marker->'descriptor'->'ordinal'='0'::jsonb AND marker->'descriptor'->'first'='0'::jsonb AND marker->'descriptor'->'last'='0'::jsonb AND marker->'descriptor'->>'firstOperationId'='7e820f8b-0770-9773-6249-9999b0e0d758' AND marker->'descriptor'->>'lastOperationId'='7e820f8b-0770-9773-6249-9999b0e0d758' AND marker->'descriptor'->'predecessor'='null'::jsonb AND marker->'descriptor'->'previousLastOperationId'='null'::jsonb AND marker->'descriptor'->'previousDescriptorSha256'='null'::jsonb) FROM root_receipt),false)
 ),
 'batches',(SELECT jsonb_object_agg(label,jsonb_build_object(
  'count',(SELECT count(*) FROM batches WHERE id=b.id),
  'status',COALESCE((SELECT CASE WHEN status IN ('STAGED','VALIDATING','PASSED','IMPORTED','FAILED') THEN status ELSE 'OTHER' END FROM batches WHERE id=b.id),'ABSENT'),
  'completedAtPresent',COALESCE((SELECT completed_at IS NOT NULL FROM batches WHERE id=b.id),false),
  'sourceNameMatches',COALESCE((SELECT source_name='naijue:tplus:20261102' FROM batches WHERE id=b.id),false),
  'sourceHashMatches',COALESCE((SELECT source_hash='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679' FROM batches WHERE id=b.id),false),
  'cutoffMatches',COALESCE((SELECT cutoff_at='2026-11-16T11:40:00+08:00'::timestamptz FROM batches WHERE id=b.id),false)
 )) FROM (VALUES ('baseline','ee6716e0-d983-c718-bff7-98d9f872d116'::uuid),('document','9629d837-776e-7f61-4fd4-0cebd4e1a097'::uuid)) AS b(label,id)),
 'namespace',jsonb_build_object(
  'extraMatchingBatchCount',(SELECT count(*) FROM batches WHERE source_name='naijue:tplus:20261102' AND source_hash='7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679' AND id NOT IN ('ee6716e0-d983-c718-bff7-98d9f872d116'::uuid,'9629d837-776e-7f61-4fd4-0cebd4e1a097'::uuid)),
  'otherHashBatchCount',(SELECT count(*) FROM batches WHERE source_name='naijue:tplus:20261102' AND source_hash IS DISTINCT FROM '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679'),
  'bindingRecordCount',(SELECT count(*) FROM namespace_records),
  'bindingIdentityMatchCount',(SELECT count(*) FROM namespace_records WHERE import_batch_id='ee6716e0-d983-c718-bff7-98d9f872d116'::uuid AND source_key='ee6716e0-d983-c718-bff7-98d9f872d116' AND target_type='IMPORT_BATCH' AND target_id='ee6716e0-d983-c718-bff7-98d9f872d116'::uuid),
  'bindingIdentityConflictCount',(SELECT count(*) FROM namespace_records WHERE (import_batch_id='ee6716e0-d983-c718-bff7-98d9f872d116'::uuid AND source_key='ee6716e0-d983-c718-bff7-98d9f872d116' AND target_type='IMPORT_BATCH' AND target_id='ee6716e0-d983-c718-bff7-98d9f872d116'::uuid) IS NOT TRUE),
  'importedBindingCount',(SELECT count(*) FROM namespace_records WHERE status='IMPORTED')
 ),
 'progress',jsonb_build_object(
  'receiptCount',(SELECT count(*) FROM same_root),
  'committedReceiptCount',(SELECT count(*) FROM same_root WHERE status='COMMITTED'),
  'otherStatusReceiptCount',(SELECT count(*) FROM same_root WHERE status IS DISTINCT FROM 'COMMITTED'),
  'identityMatchCount',(SELECT count(*) FROM same_root WHERE marker->'identity'=e.identity),
  'identityConflictCount',(SELECT count(*) FROM same_root WHERE marker->'identity' IS DISTINCT FROM e.identity),
  'nonImportOrActorConflictCount',(SELECT count(*) FROM same_root s WHERE target_type IS DISTINCT FROM 'IMPORT' OR actor_account_id IS DISTINCT FROM (SELECT actor_account_id FROM root_receipt)),
  'groupCount',(SELECT count(*) FROM groups),
  'ordinalMin',(SELECT min(ordinal) FROM groups),'ordinalMax',(SELECT max(ordinal) FROM groups),
  'firstStepMin',(SELECT min(first_step) FROM groups),'lastStepMax',(SELECT max(last_step) FROM groups),
  'invalidRangeCount',(SELECT count(*) FROM groups WHERE ordinal IS NULL OR first_step IS NULL OR last_step IS NULL OR ordinal>2147483647 OR first_step>last_step OR last_step>=44910),
  'duplicateOrdinalCount',(SELECT count(*) FROM (SELECT ordinal FROM groups GROUP BY ordinal HAVING count(*)>1) AS d),
  'duplicateSubBatchIdCount',(SELECT count(*) FROM (SELECT descriptor->>'subBatchId' FROM groups GROUP BY descriptor->>'subBatchId' HAVING count(*)>1) AS d),
  'invalidDescriptorHashCount',(SELECT count(*) FROM groups WHERE (descriptor->>'descriptorSha256' ~ '^[a-f0-9]{64}$') IS NOT TRUE),
  'descriptorHashConflictCount',(SELECT count(*) FROM (SELECT descriptor->>'subBatchId' FROM groups GROUP BY descriptor->>'subBatchId' HAVING count(DISTINCT descriptor->>'descriptorSha256')>1) AS d),
  'memberClosureConflictCount',(SELECT count(*) FROM groups WHERE (member_count=last_step-first_step+1 AND committed_member_count=member_count AND first_endpoint_present AND last_endpoint_present) IS NOT TRUE),
  'predecessorConflictCount',(SELECT count(*) FROM groups g LEFT JOIN links l ON l.descriptor=g.descriptor WHERE (CASE WHEN g.descriptor->>'phase'='CORE' THEN ordinal=0 AND first_step=0 AND last_step=0 AND g.descriptor->'predecessor'='null'::jsonb AND g.descriptor->'previousLastOperationId'='null'::jsonb AND g.descriptor->'previousDescriptorSha256'='null'::jsonb ELSE COALESCE(l.candidate_count,0)=1 END) IS NOT TRUE),
  'phaseGroupCounts',(SELECT jsonb_object_agg(phase,(SELECT count(*) FROM groups WHERE CASE WHEN descriptor->>'phase' IN ('CORE','MASTER','KEYS','BASELINE_CLOSE','DOCUMENT_OPEN','HISTORY','FINALIZE') THEN descriptor->>'phase' ELSE 'OTHER' END=phase)) FROM unnest(ARRAY['CORE','MASTER','KEYS','BASELINE_CLOSE','DOCUMENT_OPEN','HISTORY','FINALIZE','OTHER']) AS phase),
  'expectedDescriptorBinding','UNKNOWN_NOT_READ_FROM_ORIGINAL_PLAN'
 ),
 'audit',jsonb_build_object(
  'count',(SELECT count(*) FROM audits),
  'rootCount',(SELECT count(*) FROM audits WHERE operation_id='7e820f8b-0770-9773-6249-9999b0e0d758'::uuid),
  'receiptWithoutAuditCount',(SELECT count(*) FROM receipts r LEFT JOIN audits a ON a.operation_id=r.id WHERE a.operation_id IS NULL),
  'auditWithoutReceiptCount',(SELECT count(*) FROM audits a LEFT JOIN receipts r ON r.id=a.operation_id WHERE r.id IS NULL),
  'identityOrDescriptorConflictCount',(SELECT count(*) FROM audits a JOIN receipts r ON r.id=a.operation_id WHERE a.marker IS DISTINCT FROM r.marker OR a.object_type IS DISTINCT FROM r.target_type OR a.object_id IS DISTINCT FROM r.target_id OR a.action IS DISTINCT FROM r.action OR a.actor_account_id IS DISTINCT FROM r.actor_account_id)
 )
 ) AS value FROM expected e)
SELECT 'T45_R3_AFTER45_DURABLE_HEX_V1:' || pg_catalog.encode(pg_catalog.convert_to(value::text,'UTF8'),'hex') AS durable_readonly_evidence FROM evidence;
ROLLBACK;
