import { entityId } from '../../../packages/domain/src/values.ts';
import { requireDomain } from '../../../packages/domain/src/errors.ts';

type Client = { query(sql: string, values?: unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }> };
/**
 * NOT AN ISSUER OR CAPACITY PROOF. This bounded collection candidate is not
 * wired into runtime. Guard is a borrowed transaction-lifetime assertion, not
 * a source, schema, ACL, RLS or publication proof. No caller may authorize a
 * write using this output. It reads bounded metadata, not audit bodies. Publication, source hash, exact schema, pending
 * audit, race safety and actual metadata still require independent verification.
 */
export async function collectStandard27ProductFacts(client: Client, productId: string,
  assertSameActiveClient: (client: Client) => Promise<void>): Promise<{
  verification: 'UNVERIFIED_CANDIDATE_ONLY'; context: Record<string, unknown>; root: Record<string, unknown>; skus: readonly Record<string, unknown>[];
  barcodes: readonly Record<string, unknown>[]; images: readonly Record<string, unknown>[];
  maintenance: readonly Record<string, unknown>[]; receipts: readonly Record<string, unknown>[]; importedRoot: readonly Record<string, unknown>[]; sourceBindingV1: readonly Record<string, unknown>[]; publicationV1: readonly Record<string, unknown>[];
}> {
  entityId('product',productId);
  if (!client || typeof client.query !== 'function' || typeof assertSameActiveClient !== 'function') throw new TypeError('Original transaction client required');
  const read = async (sql:string,limit:number) => {
    const before:unknown=assertSameActiveClient(client);if(!(before instanceof Promise)) throw new TypeError('Async original-client guard required');if(await before!==undefined)throw new TypeError('Original-client guard must resolve without a substitute');
    const output=await client.query(sql,[productId,limit+1]);
    const after:unknown=assertSameActiveClient(client);if(!(after instanceof Promise)) throw new TypeError('Async original-client guard required');if(await after!==undefined)throw new TypeError('Original-client guard must resolve without a substitute');
    requireDomain(Array.isArray(output.rows)&&output.rows.length<=limit,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Product source collection missing or exceeds bounds');return output.rows;
  };
  const contexts=await read("/* std27-product:context */ SELECT current_setting('transaction_isolation') AS transaction_isolation,current_database()::text AS database_name,current_user::text AS current_role,session_user::text AS session_user WHERE $1::uuid IS NOT NULL LIMIT $2",1);
  requireDomain(contexts.length===1 && typeof contexts[0]!.transaction_isolation==='string' && ['read committed','repeatable read','serializable'].includes(contexts[0]!.transaction_isolation) && ['database_name','current_role','session_user'].every(k=>typeof contexts[0]![k]==='string' && (contexts[0]![k] as string).length>0),'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Original transaction context required');
  const root=await read('/* std27-product:root */ SELECT p.id,p.version,p.enabled,p.deleted_at FROM naijue_erp.product p WHERE p.id=$1::uuid ORDER BY p.id LIMIT $2 FOR SHARE OF p',1);
  requireDomain(root.length===1&&root[0]!.id===productId,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Exact current product root required');
  const skus=await read('/* std27-product:skus */ SELECT s.id,s.product_id,s.version,s.enabled FROM naijue_erp.sku s WHERE s.product_id=$1::uuid ORDER BY s.id LIMIT $2 FOR SHARE OF s',5000);
  const barcodes=await read('/* std27-product:barcodes */ SELECT b.id,b.sku_id,b.barcode_kind,b.enabled FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=$1::uuid ORDER BY b.id LIMIT $2 FOR SHARE OF b',20000);
  const images=await read('/* std27-product:images */ SELECT i.id,i.product_id,i.version FROM naijue_erp.product_image i WHERE i.product_id=$1::uuid ORDER BY i.id LIMIT $2 FOR SHARE OF i',1000);
  const maintenance=await read("/* std27-product:maintenance */ SELECT a.id,a.operation_id,a.object_type,a.object_id,a.action,a.old_version,a.new_version,a.actor_account_id,a.occurred_at,r.id AS receipt_id,r.status AS receipt_status,r.target_type,r.target_id,r.action AS receipt_action,r.actor_account_id AS receipt_actor,r.request_hash,r.completed_at,(octet_length(coalesce(a.before_values::text,''))+octet_length(a.after_values::text))::text AS audit_bytes FROM naijue_erp.audit_change a LEFT JOIN naijue_erp.operation_receipt r ON r.id=a.operation_id WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid ORDER BY a.new_version,a.id LIMIT $2 FOR SHARE OF a",1024);
  const receipts=await read("/* std27-product:receipts */ SELECT r.id,r.status,r.target_type,r.target_id,r.action,r.actor_account_id,r.request_hash,r.completed_at FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid ORDER BY r.id LIMIT $2 FOR SHARE OF r",1024);
  const auditIds=new Set(maintenance.map(row=>row.operation_id)), receiptIds=new Set(receipts.map(row=>row.id));
  requireDomain(auditIds.size===maintenance.length&&receiptIds.size===receipts.length&&auditIds.size===receiptIds.size&&maintenance.every(row=>typeof row.operation_id==='string'&&row.operation_id===row.receipt_id&&receiptIds.has(row.operation_id)), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Incomplete product receipt and audit identity set');
  let auditBytes=0n;
  for(const row of maintenance) { requireDomain(typeof row.audit_bytes==='string' && /^(0|[1-9][0-9]*)$/.test(row.audit_bytes), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY', 'Missing exact audit size'); auditBytes+=BigInt(row.audit_bytes); requireDomain(auditBytes<=16777216n, 'PRODUCT_EVIDENCE_CAPACITY_EXCEEDED', 'Audit evidence exceeds existing bound'); }
  const importedRoot=await read("/* std27-product:source */ SELECT i.id,i.import_batch_id,i.source_record_hash,i.target_type,i.target_id,i.status,b.status AS batch_status,b.source_hash,r.id AS receipt_id,r.status AS receipt_status,a.id AS audit_id,octet_length(a.after_values::text)::text AS source_audit_bytes FROM naijue_erp.import_record i JOIN naijue_erp.import_batch b ON b.id=i.import_batch_id LEFT JOIN naijue_erp.operation_receipt r ON r.id=(i.decision_reason::jsonb->>'operationId')::uuid LEFT JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE i.target_type='PRODUCT' AND i.target_id=$1::uuid ORDER BY i.id LIMIT $2 FOR SHARE OF i,b",1);
  if(importedRoot.length) {
    const size=importedRoot[0]!.source_audit_bytes;
    requireDomain(typeof size==='string' && /^(0|[1-9][0-9]*)$/.test(size) && BigInt(size)<=16777216n,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Bounded original source audit required');
  }
  // Metadata reproduction of fixed V1 record linkage, not the private helper
  // and not a publication/authorisation proof. No V2 inference is made.
  const sourceBindingV1=await read(`/* std27-product:source-binding-v1 */ SELECT i.id AS record_id,b.id AS batch_id,r.id AS operation_id,a.id AS audit_id
    FROM naijue_erp.import_record i JOIN naijue_erp.import_batch b ON b.id=i.import_batch_id
    JOIN naijue_erp.operation_receipt r ON r.id=(i.decision_reason::jsonb->>'operationId')::uuid
    JOIN naijue_erp.audit_change a ON a.operation_id=r.id
    CROSS JOIN LATERAL (SELECT value AS item,count(*) OVER () AS id_count FROM jsonb_array_elements(CASE WHEN octet_length(a.after_values::text)<=16777216 AND jsonb_typeof(a.after_values->'records')='array' THEN a.after_values->'records' ELSE '[]'::jsonb END) WHERE value->>'id'=i.id::text) AS x
    WHERE i.target_type='PRODUCT' AND i.target_id=$1::uuid AND i.status='IMPORTED' AND i.reviewed_at IS NOT NULL
      AND i.decision_reason::jsonb->>'format'='STANDARD_IMPORT_POINTER_V1' AND i.decision_reason::jsonb->>'code'='SOURCE_BOUND'
      AND (i.decision_reason::jsonb-ARRAY['format','code','operationId'])='{}'::jsonb AND i.source_system=b.source_name
      AND r.target_type='IMPORT' AND r.target_id=b.id AND r.status='COMMITTED' AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND r.result_data->>'packageManifestSha256'=b.source_hash AND a.object_type=r.target_type AND a.object_id=r.target_id
      AND a.action=r.action AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
      AND a.after_values->'request'->>'namespace'=b.source_name AND x.id_count=1 AND item->>'id'=i.id::text AND item->>'source_key'=i.source_key
      AND item->>'entity_type'=i.source_entity_type AND item->>'target_type'=i.target_type AND item->>'target_id'=i.target_id::text
      AND item->>'source_hash'=i.source_record_hash AND item->>'file_ref'=i.source_file_ref AND item->'fields'->>'id'=i.target_id::text
    ORDER BY i.id LIMIT $2 FOR SHARE OF i,b,r,a`,1);
  requireDomain(importedRoot.length===sourceBindingV1.length && (!importedRoot.length || (importedRoot[0]!.id===sourceBindingV1[0]!.record_id && importedRoot[0]!.import_batch_id===sourceBindingV1[0]!.batch_id)), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Stable unique original V1 source binding required');
  // This strictly scoped V1 observation is not a complete publication proof;
  // V2 publication has a different contract and must never be inferred here.
  const publicationV1=await read(`/* std27-product:publication-v1 */ SELECT b.id AS baseline_id,d.id AS document_id,r.id AS publication_id,a.id AS audit_id
    FROM naijue_erp.import_record i JOIN naijue_erp.import_batch b ON b.id=i.import_batch_id
    JOIN naijue_erp.operation_receipt r ON r.target_type='IMPORT' AND r.action='IMPORT_PUBLISH' AND r.status='COMMITTED'
      AND r.result_data->>'profile'='STANDARD_IMPORT_SQL_V1' AND r.result_data->>'phase'='DOCUMENT_PUBLISH' AND r.result_data->>'baselineBatchId'=b.id::text
    JOIN naijue_erp.import_batch d ON d.id=r.target_id
    JOIN naijue_erp.audit_change a ON a.operation_id=r.id AND a.object_type=r.target_type AND a.object_id=r.target_id
      AND a.action=r.action AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at
    WHERE i.target_type='PRODUCT' AND i.target_id=$1::uuid AND b.inventory_mode='CUTOFF_STOCK_BASELINE'
      AND b.mapping_version='STANDARD_INITIAL_EXPLICIT_KEYS_V1' AND b.status='IMPORTED'
      AND d.inventory_mode='DOCUMENT_CONVERSION' AND d.mapping_version='DOCUMENT_CONVERSION_V1' AND d.status='IMPORTED'
      AND d.source_hash=b.source_hash AND d.source_name=b.source_name AND d.cutoff_at=b.cutoff_at
      AND r.result_data->>'packageManifestSha256'=b.source_hash AND a.after_values->>'profile'='STANDARD_IMPORT_SQL_V1'
      AND a.after_values->>'phase'='DOCUMENT_PUBLISH' AND a.after_values->'checkpoint'=d.checkpoint
    ORDER BY r.id LIMIT $2 FOR SHARE OF i,b,r,d,a`,1);
  requireDomain(!publicationV1.length || (sourceBindingV1.length===1 && publicationV1[0]!.baseline_id===sourceBindingV1[0]!.batch_id), 'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Publication observation differs from source batch');
  return {verification:'UNVERIFIED_CANDIDATE_ONLY',context:contexts[0]!,root:root[0]!,skus,barcodes,images,maintenance,receipts,importedRoot,sourceBindingV1,publicationV1};
}

/** A single-snapshot absence observation, NOT a reservation or create proof.
 * No lock can protect an absent key here; a real issuer must independently
 * establish transaction identity, serialisation and immutable source closure. */
export async function observeStandard27ProductAbsence(client: Client, productId: string,
 assertSameActiveClient: (client: Client) => Promise<void>): Promise<{verification:'UNVERIFIED_CANDIDATE_ONLY'; absent:boolean}> {
 entityId('product',productId);
 if (!client || typeof client.query !== 'function' || typeof assertSameActiveClient !== 'function') throw new TypeError('Original transaction client required');
 const before:unknown=assertSameActiveClient(client);if(!(before instanceof Promise)||await before!==undefined)throw new TypeError('Original-client guard must resolve without a substitute');
 const result=await client.query("/* std27-product:absence */ SELECT EXISTS(SELECT 1 FROM naijue_erp.product p WHERE p.id=$1::uuid) AS product_exists, EXISTS(SELECT 1 FROM naijue_erp.import_record i WHERE i.target_type='PRODUCT' AND i.target_id=$1::uuid) AS source_exists, EXISTS(SELECT 1 FROM naijue_erp.audit_change a WHERE a.object_type='PRODUCT' AND a.object_id=$1::uuid) AS audit_exists, EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r WHERE r.target_type='PRODUCT' AND r.target_id=$1::uuid) AS receipt_exists",[productId]);
 const after:unknown=assertSameActiveClient(client);if(!(after instanceof Promise)||await after!==undefined)throw new TypeError('Original-client guard must resolve without a substitute');
 requireDomain(Array.isArray(result.rows)&&result.rows.length===1&&['product_exists','source_exists','audit_exists','receipt_exists'].every(k=>typeof result.rows[0]![k]==='boolean'),'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Exact product absence observation required');
 return {verification:'UNVERIFIED_CANDIDATE_ONLY',absent:['product_exists','source_exists','audit_exists','receipt_exists'].every(k=>result.rows[0]![k]===false)};
}
