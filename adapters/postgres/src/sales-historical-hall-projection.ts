import {parseHistoricalSalesHallEvidence,type HistoricalSalesHallEvidence} from '../../../packages/application/src/historical-sales-hall-evidence.ts';
import {requireDomain} from '../../../packages/domain/src/errors.ts';

/** Fixed SQL after header authorization. Existing runtime import_record SELECT
 * and publication RLS locate exact source chunk operation IDs before expansion.
 * Work is bounded by the selected page and its chunks, not the entire batch.
 * No new grant, security-definer or current warehouse inference occurs. */
const migrationRows=`hall_migration AS MATERIALIZED (
 SELECT h.id AS document_id,to_jsonb(h)->>'import_batch_id' AS current_batch_id,
  m.*,r.result_data,r.status AS receipt_status,r.actor_account_id AS receipt_actor,r.completed_at,
  m.after_values->'header' AS original_header,m.after_values->>'sourceRecordId' AS source_record_id
 FROM authorized_hall_headers h JOIN naijue_erp.audit_change m ON m.object_type='SALES' AND m.object_id=h.id
 JOIN naijue_erp.operation_receipt r ON r.id=m.operation_id
 WHERE h.stock_basis='CUTOFF_HISTORY' AND m.action='MIGRATE_DOCUMENT'
  AND r.target_type='SALES' AND r.target_id=h.id AND r.action=m.action
), hall_pointers AS MATERIALIZED (
 SELECT s.*,CASE WHEN left(s.decision_reason,1)='{' AND strpos(s.decision_reason,'"STANDARD_IMPORT_POINTER_V1"')>0
  THEN s.decision_reason::jsonb ELSE NULL END AS pointer
 FROM hall_migration m JOIN naijue_erp.import_record s ON s.id=(m.source_record_id)::uuid
  AND s.import_batch_id::text=m.current_batch_id
), hall_roots AS MATERIALIZED (
 SELECT h.id AS document_id,init_r.id AS root_operation_id,
  init_a.after_values AS root_values,init_a.xmin AS root_xmin,init_r.xmin AS root_receipt_xmin,
  init_r.completed_at AS root_completed_at,baseline.id AS baseline_batch_id,
  init_a.after_values->'request'->'payload'->>'schema_declarations_sha256' AS source_profile,
  (known_baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   OR init_a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
   OR EXISTS(SELECT 1 FROM hall_pointers p WHERE p.id::text=m.source_record_id AND p.pointer->>'format'='STANDARD_IMPORT_POINTER_V1')
  ) IS TRUE AS standard_family,
  (m.receipt_status='COMMITTED' AND m.receipt_actor=m.actor_account_id AND m.occurred_at=m.completed_at
   AND m.old_version IS NULL AND m.before_values IS NULL
   AND m.result_data->>'sourceRecordId'=m.source_record_id
   AND m.result_data->>'salesId'=h.id::text AND m.result_data->>'batchId'=b.id::text
   AND m.result_data->>'exposureDigest'=encode(sha256(convert_to((m.after_values-ARRAY['baseline','sourceRecordId'])::text,'UTF8')),'hex')
   AND m.original_header->>'id'=h.id::text AND m.original_header->>'import_batch_id'=b.id::text
   AND m.original_header->>'stock_basis'='CUTOFF_HISTORY'
   AND m.result_data->'baseline'=m.after_values->'baseline'
   AND m.after_values->'baseline'->>'state'='CONFIRMED'
   AND m.after_values->'baseline'->>'baselineBatchId'=baseline.id::text
   AND m.after_values->'baseline'->>'baselineManifestSha256'=baseline.source_hash
   AND (m.after_values->'baseline'->>'cutoffAt')::timestamptz=baseline.cutoff_at
   AND baseline.inventory_mode='CUTOFF_STOCK_BASELINE' AND baseline.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1'
   AND baseline.status='IMPORTED' AND baseline.source_name=b.source_name AND baseline.source_hash=b.source_hash
   AND baseline.cutoff_at=b.cutoff_at AND init_r.target_type='IMPORT' AND init_r.target_id=baseline.id
   AND init_r.action='IMPORT_INITIALIZE_CURRENT_ADMIN' AND init_r.status='COMMITTED'
   AND init_a.object_id=init_r.target_id AND init_a.actor_account_id=init_r.actor_account_id
   AND init_a.occurred_at=init_r.completed_at AND init_a.action=init_r.action
   AND init_r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
   AND init_r.result_data->>'packageManifestSha256'=b.source_hash
   AND init_a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
   AND init_a.after_values->'request'->>'namespace'=b.source_name
   AND init_a.after_values->'request'->>'package_manifest_sha256'=b.source_hash
   AND init_a.after_values->'request'->>'batch_id'=baseline.id::text
  ) IS TRUE AS root_verified
 FROM authorized_hall_headers h JOIN naijue_erp.import_batch b ON b.id=h.import_batch_id
 LEFT JOIN hall_migration m ON m.document_id=h.id
 LEFT JOIN naijue_erp.import_batch known_baseline ON known_baseline.id::text=m.after_values->'baseline'->>'baselineBatchId'
 LEFT JOIN naijue_erp.audit_change init_a ON init_a.object_type='IMPORT' AND init_a.action='IMPORT_INITIALIZE_CURRENT_ADMIN'
  AND init_a.after_values->'request'->'payload'->>'document_batch_id'=b.id::text
 LEFT JOIN naijue_erp.operation_receipt init_r ON init_r.id=init_a.operation_id
 LEFT JOIN naijue_erp.import_batch baseline ON baseline.id=init_r.target_id
 WHERE h.stock_basis='CUTOFF_HISTORY' AND b.status='IMPORTED'
  AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1'
), hall_chunks AS MATERIALIZED (
 SELECT a.xmin AS source_audit_xmin,r.xmin AS source_receipt_xmin,a.after_values,a.operation_id,b.id AS source_batch_id,b.source_name AS source_namespace,b.source_hash AS package_manifest_sha256,
  a.object_id AS source_audit_batch,a.actor_account_id AS source_audit_actor,a.occurred_at AS source_occurred_at,
  a.action AS source_audit_action,r.actor_account_id AS source_receipt_actor,r.completed_at AS source_completed_at,
  r.result_data AS source_receipt_result,r.status AS source_receipt_status,r.action AS source_receipt_action,
  r.target_type AS source_receipt_type,r.target_id AS source_receipt_batch
 FROM naijue_erp.audit_change a JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id
 JOIN naijue_erp.import_batch b ON b.id=a.object_id
 WHERE a.operation_id IN(SELECT (pointer->>'operationId')::uuid FROM hall_pointers WHERE pointer->>'format'='STANDARD_IMPORT_POINTER_V1')
  AND a.object_type='IMPORT' AND a.action='IMPORT_CHUNK'
  AND b.status='IMPORTED' AND b.inventory_mode='DOCUMENT_CONVERSION' AND b.mapping_version='DOCUMENT_CONVERSION_V1'
), hall_import_records AS MATERIALIZED (
 SELECT item.value AS source_record,a.*
 FROM hall_chunks a CROSS JOIN LATERAL jsonb_array_elements(a.after_values->'records') item(value)
 WHERE item.value->>'id' IN(SELECT source_record_id FROM hall_migration) AND item.value ? 'historical_hall_evidence'
), hall_source AS (
 SELECT m.*,source.source_audit_xmin,source.source_receipt_xmin,source.source_record,source.source_batch_id,source.source_namespace,source.package_manifest_sha256,
  source.source_audit_batch,source.source_audit_actor,source.source_occurred_at,source.source_audit_action,
  source.source_receipt_actor,source.source_completed_at,source.source_receipt_result,source.source_receipt_status,
  source.source_receipt_action,source.source_receipt_type,source.source_receipt_batch,
  source.after_values AS source_audit_values,source.operation_id AS source_operation_id,
  p.pointer,p.source_system AS pointer_namespace,p.status AS pointer_status,p.reviewed_at AS pointer_reviewed_at,
  p.source_key AS pointer_source_key,p.source_entity_type AS pointer_entity_type,p.source_record_hash AS pointer_hash,
  p.source_file_ref AS pointer_file_ref,p.target_type AS pointer_target_type,p.target_id AS pointer_target_id
 FROM hall_migration m JOIN hall_pointers p ON p.id::text=m.source_record_id
 JOIN hall_import_records source ON source.source_batch_id::text=m.current_batch_id
  AND source.source_record->>'id'=m.source_record_id AND source.operation_id::text=p.pointer->>'operationId'
), hall_capture_proofs AS (
 SELECT s.document_id,c.capture,
  (roots.root_verified
   AND roots.source_profile='b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'
   AND jsonb_typeof(c.captures)='object' AND c.captures<>'{}'
   AND s.source_audit_values->>'phase'='DOCUMENTS'
   AND s.source_receipt_result->>'historicalHallTargetCapturesSha256'=encode(sha256(convert_to(c.captures::text,'UTF8')),'hex')
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(c.captures) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_audit_values->'records') x
    WHERE x->>'id'=k AND x->>'entity_type'='SALES_HEADER' AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
     AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.source_audit_values->'records') x WHERE x->>'entity_type'='SALES_HEADER'
    AND x->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
    AND x->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb AND NOT(c.captures ? (x->>'id')))
   AND jsonb_typeof(c.capture)='object'
   AND c.capture-ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at']='{}'
   AND c.capture ?& ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash','warehouse_id','hall_id','version','captured_at']
   AND c.capture->>'input_source_record_hash'=s.pointer_hash
   AND c.capture->'warehouse_id'=s.source_record->'historical_hall_evidence'->'target_snapshot'->'warehouse_id'
   AND c.capture->'hall_id'=s.source_record->'historical_hall_evidence'->'target_snapshot'->'hall_id'
   AND c.capture->'version'=s.source_record->'historical_hall_evidence'->'target_snapshot'->'version'
   AND c.capture->'warehouse_id'=s.source_record->'fields'->'warehouse_id'
   AND c.capture->'hall_id'=s.source_record->'fields'->'hall_id'
   AND jsonb_typeof(c.capture->'captured_at')='string'
   AND (c.capture->>'captured_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$')
   AND isfinite((c.capture->>'captured_at')::timestamptz)
   AND (c.capture->>'captured_at')::timestamptz>=roots.root_completed_at
   AND s.source_audit_xmin=roots.root_xmin AND s.source_receipt_xmin=roots.root_xmin
   AND roots.root_receipt_xmin=roots.root_xmin
   AND roots.root_xmin::text::bigint=mod((roots.root_values->'whole_package_v2'->>'full_xid')::numeric,4294967296)::bigint
   AND roots.root_values->'whole_package_v2'->>'root_operation'=roots.root_operation_id::text
   AND encode(sha256(convert_to(roots.root_values->'request'->'payload'->'historical_hall_approval'->>'utf8','UTF8')),'hex')=roots.root_values->'request'->'payload'->'historical_hall_approval'->>'sha256'
   AND EXISTS(
    SELECT 1 FROM naijue_erp.import_record ms
    JOIN naijue_erp.audit_change ma ON ma.operation_id::text=c.capture->>'warehouse_operation_id'
    JOIN naijue_erp.operation_receipt mr ON mr.id=ma.operation_id
    CROSS JOIN LATERAL (SELECT count(*) AS members,min(mi::text)::jsonb AS item
     FROM jsonb_array_elements(ma.after_values->'records') mi WHERE mi->>'id'=ms.id::text) master
    CROSS JOIN LATERAL (SELECT count(*) AS members,min(ap::text)::jsonb AS item
     FROM jsonb_array_elements(((roots.root_values->'request'->'payload'->'historical_hall_approval'->>'utf8')::jsonb)->'records') ap
     WHERE ap->>'target_id'=s.document_id::text) approved
    WHERE ms.id::text=c.capture->>'warehouse_source_record_id' AND ms.import_batch_id=roots.baseline_batch_id
     AND ms.source_system=s.source_namespace AND ms.status='IMPORTED' AND ms.reviewed_at=mr.completed_at
     AND ms.source_entity_type='WAREHOUSE' AND ms.target_type='WAREHOUSE' AND ms.target_id::text=c.capture->>'warehouse_id'
     AND left(ms.decision_reason,1)='{' AND ms.decision_reason::jsonb=jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',mr.id)
     AND ma.object_type='IMPORT' AND ma.object_id=ms.import_batch_id AND ma.action=mr.action AND mr.target_type='IMPORT' AND mr.target_id=ms.import_batch_id
     AND mr.status='COMMITTED' AND ma.actor_account_id=mr.actor_account_id AND mr.actor_account_id=s.source_audit_actor
     AND ma.occurred_at=mr.completed_at AND ma.xmin=roots.root_xmin AND mr.xmin=roots.root_xmin
     AND ma.after_values->>'profile'='STANDARD_IMPORT_SQL_V1' AND ma.after_values->>'phase'='MASTER'
     AND mr.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND mr.result_data->>'packageManifestSha256'=s.package_manifest_sha256
     AND ma.after_values->'request'->>'namespace'=s.source_namespace
     AND ma.after_values->'request'->>'package_manifest_sha256'=s.package_manifest_sha256
     AND ma.after_values->'whole_package_v2'->>'root_operation'=roots.root_operation_id::text
     AND (ma.after_values->'whole_package_v2'->>'ordinal')::integer<(s.source_audit_values->'whole_package_v2'->>'ordinal')::integer
     AND master.members=1 AND approved.members=1
     AND master.item->>'entity_type'='WAREHOUSE' AND master.item->>'target_type'='WAREHOUSE'
     AND master.item->>'source_key'=ms.source_key AND master.item->>'target_id'=ms.target_id::text AND master.item->>'file_ref'=ms.source_file_ref
     AND master.item->>'source_hash'=ms.source_record_hash
     AND ms.source_record_hash=encode(sha256(convert_to(jsonb_build_object('source_key',master.item->'source_key','fields',master.item->'fields','source_refs',master.item->'source_refs')::text,'UTF8')),'hex')
     AND master.item->'fields'->'id'=c.capture->'warehouse_id' AND master.item->'fields'->'hall_id'=c.capture->'hall_id' AND master.item->'fields'->'version'=c.capture->'version'
     AND approved.item->'evidence'=s.source_record->'historical_hall_evidence' AND approved.item->>'source_key'=s.pointer_source_key
     AND (approved.item->'source_refs') @> (s.source_record->'source_refs') AND (s.source_record->'source_refs') @> (approved.item->'source_refs')
     AND jsonb_array_length(approved.item->'source_refs')=jsonb_array_length(s.source_record->'source_refs')
     AND ms.source_key=approved.item->'target_initialization'->>'warehouse_source_key'
   )
  ) IS TRUE AS capture_verified
 FROM hall_source s JOIN hall_roots roots ON roots.document_id=s.document_id
 CROSS JOIN LATERAL (SELECT s.source_audit_values->'historical_hall_target_captures' AS captures,
  s.source_audit_values->'historical_hall_target_captures'->s.source_record_id AS capture) c
 WHERE s.source_record->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
  AND s.source_record->'historical_hall_evidence'->'target_snapshot'->'captured_at'='null'::jsonb

), hall_proofs AS (
 SELECT s.document_id,jsonb_build_object('evidence',CASE WHEN captured.capture_verified THEN
   jsonb_set(s.source_record->'historical_hall_evidence','{target_snapshot}',captured.capture-ARRAY['warehouse_source_record_id','warehouse_operation_id','input_source_record_hash'])
   ELSE s.source_record->'historical_hall_evidence' END,'verified',(
  roots.root_verified AND ((roots.source_profile='f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66'
    AND s.source_record->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V1')
   OR (roots.source_profile='b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b'
    AND s.source_record->'historical_hall_evidence'->>'format_version'='HISTORICAL_SALES_HALL_EVIDENCE_V2'
    AND (s.source_record->'historical_hall_evidence'->'target_snapshot'->'captured_at'<>'null'::jsonb OR captured.capture_verified IS TRUE)))
  AND s.source_audit_values->'whole_package_v2'->>'root_operation'=roots.root_operation_id::text
  AND s.receipt_status='COMMITTED' AND s.receipt_actor=s.actor_account_id AND s.occurred_at=s.completed_at
  AND s.old_version IS NULL AND s.before_values IS NULL
  AND s.result_data->>'sourceRecordId'=s.source_record_id
  AND s.result_data->>'salesId'=s.document_id::text AND s.result_data->>'batchId'=s.source_batch_id::text
  AND s.result_data->>'exposureDigest'=encode(sha256(convert_to((s.after_values-ARRAY['baseline','sourceRecordId'])::text,'UTF8')),'hex')
  AND s.original_header->>'id'=s.document_id::text AND s.original_header->>'import_batch_id'=s.source_batch_id::text
  AND s.original_header->>'stock_basis'='CUTOFF_HISTORY'
  AND s.source_receipt_status='COMMITTED' AND s.source_receipt_type='IMPORT' AND s.source_receipt_batch=s.source_batch_id
  AND s.source_audit_actor=s.source_receipt_actor AND s.source_occurred_at=s.source_completed_at
  AND s.source_receipt_action=s.source_audit_action
  AND s.pointer=jsonb_build_object('format','STANDARD_IMPORT_POINTER_V1','code','SOURCE_BOUND','operationId',s.source_operation_id)
  AND s.pointer_status='IMPORTED' AND s.pointer_reviewed_at=s.source_completed_at AND s.pointer_namespace=s.source_namespace
  AND s.pointer_source_key=s.source_record->>'source_key' AND s.pointer_entity_type=s.source_record->>'entity_type'
  AND s.pointer_hash=s.source_record->>'source_hash' AND s.pointer_file_ref=s.source_record->>'file_ref'
  AND s.pointer_target_type=s.source_record->>'target_type' AND s.pointer_target_id::text=s.source_record->>'target_id'
  AND s.source_receipt_result->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND s.source_receipt_result->>'packageManifestSha256'=s.package_manifest_sha256
  AND s.source_audit_values->>'profile'='STANDARD_IMPORT_SQL_V1'
  AND s.source_audit_values->'request'->>'namespace'=s.source_namespace
  AND s.source_record->>'entity_type'='SALES_HEADER' AND s.source_record->>'target_type'='SALES_HEADER'
  AND s.source_record->>'target_id'=s.document_id::text
  AND s.source_record->'fields'->>'id'=s.document_id::text AND s.source_record->'fields'->>'stock_basis'='CUTOFF_HISTORY'
  AND s.source_record->'fields'->>'import_batch_id'=s.source_batch_id::text
  AND to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,s.source_record->'fields'))=to_jsonb(jsonb_populate_record(NULL::naijue_erp.sales_header,s.original_header))
  AND s.source_record->'fields'->'hall_id' IS NOT DISTINCT FROM s.original_header->'hall_id'
  AND s.source_record->'fields'->'warehouse_id' IS NOT DISTINCT FROM s.original_header->'warehouse_id'
  AND s.source_record->'historical_hall_evidence'->'selected_hall_id' IS NOT DISTINCT FROM s.original_header->'hall_id'
  AND s.source_record->'historical_hall_evidence'->'warehouse_id' IS NOT DISTINCT FROM s.original_header->'warehouse_id'
  AND jsonb_typeof(s.source_record->'source_refs')='array' AND jsonb_array_length(s.source_record->'source_refs')>0
  AND s.source_record->>'source_hash'=encode(sha256(convert_to((jsonb_build_object(
   'source_key',s.source_record->'source_key','fields',s.source_record->'fields','source_refs',s.source_record->'source_refs')
   || CASE WHEN s.source_record ? 'zero_amount_archive' THEN jsonb_build_object('zero_amount_archive',s.source_record->'zero_amount_archive') ELSE '{}'::jsonb END
   || CASE WHEN s.source_record ? 'explicit_zero_evidence' THEN jsonb_build_object('explicit_zero_evidence',s.source_record->'explicit_zero_evidence') ELSE '{}'::jsonb END
   || jsonb_build_object('historical_hall_evidence',s.source_record->'historical_hall_evidence'))::text,'UTF8')),'hex')
 ) IS TRUE) AS proof FROM hall_source s LEFT JOIN hall_roots roots ON roots.document_id=s.document_id
 LEFT JOIN hall_capture_proofs captured ON captured.document_id=s.document_id
), hall_results AS (
 SELECT document_id,jsonb_agg(proof) AS historical_hall_proofs FROM (
  SELECT document_id,proof FROM hall_proofs
  UNION ALL
  SELECT roots.document_id,jsonb_build_object('verified',false,'evidence',NULL)
  FROM hall_roots roots WHERE (roots.source_profile IN ('f5d4e26d8cfae8cc96d42a43b01c6c49217a9927d1b0dc42af0c1b4c3ce29b66','b460db7ded610e6afe0fc8d506fedb8eda9d947819571211a25ecc5b52a39c0b')
    OR (roots.standard_family AND roots.root_verified IS NOT TRUE))
   AND NOT EXISTS(SELECT 1 FROM hall_proofs p WHERE p.document_id=roots.document_id)
 ) required_and_present GROUP BY document_id
)`;
/** Page scope/pagination precedes immutable record pointers and exact chunk IDs.
 * Each selected source chunk is expanded once; unrelated batch chunks are absent.
 * Query-plan/engine performance still requires separate PostgreSQL acceptance. */
export const HISTORICAL_SALES_HALL_BATCH_CTES=`authorized_hall_headers AS MATERIALIZED (SELECT * FROM page_headers),${migrationRows}`;
/** Detail use is one authorized header. */
export const HISTORICAL_SALES_HALL_PROJECTION_SQL=`(WITH authorized_hall_headers AS (SELECT h.*),${migrationRows}
 SELECT coalesce((SELECT historical_hall_proofs FROM hall_results),'[]'::jsonb)) AS historical_hall_proofs`;

/** Provenance is optional for old records. Malformed/present but unverified
 * evidence fails closed; it must not be laundered into a source-original label. */
export function decodeHistoricalSalesHallProjection(row:Record<string,unknown>):{readonly historicalHallEvidence?:HistoricalSalesHallEvidence;readonly historicalHallDiffersFromCurrent?:boolean} {
 const proofs=row.historical_hall_proofs;
 if(proofs===undefined||proofs===null)return {};
 requireDomain(Array.isArray(proofs)&&proofs.length<=1,'INVALID_DATABASE_VALUE','One sealed historical hall source is required');
 if(proofs.length===0)return {};
 const proof=proofs[0];requireDomain(proof&&typeof proof==='object'&&proof.verified===true,'INVALID_DATABASE_VALUE','Historical hall source audit and receipt must verify');
 let evidence:HistoricalSalesHallEvidence;
 try{evidence=parseHistoricalSalesHallEvidence(proof.evidence);}catch{requireDomain(false,'INVALID_DATABASE_VALUE','Invalid historical hall observation');}
 requireDomain(row.stock_basis==='CUTOFF_HISTORY','INVALID_DATABASE_VALUE','Historical hall observation requires a historical document');
 return {historicalHallEvidence:evidence!,historicalHallDiffersFromCurrent:evidence!.selected_hall_id!==row.hall_id||evidence!.warehouse_id!==row.warehouse_id};
}

/** Already published, scope-checked typed legacy source, with its immutable
 * field_provenance carried by the same read snapshot. */
export function decodeLegacySalesHallProjection(row:Record<string,unknown>):{readonly historicalHallEvidence?:HistoricalSalesHallEvidence;readonly historicalHallDiffersFromCurrent?:boolean} {
 if(row.historical_hall_evidence===undefined||row.historical_hall_evidence===null)return {};
 return decodeHistoricalSalesHallProjection({...row,stock_basis:'CUTOFF_HISTORY',historical_hall_proofs:[{verified:true,evidence:row.historical_hall_evidence}]});
}
