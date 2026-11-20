import type { NativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { checkedNativeRuntime26Capability } from "../../../packages/application/src/native-import-schema-contract.ts";
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import type { CutoffImportBatch } from '../../../packages/application/src/inventory-cutoff-import.ts';
import type { HistoryTypedClosurePlan } from '../../../packages/application/src/history-typed-closure.ts';
import { captureHistoryTypedClosureStageInput } from '../../../packages/application/src/history-typed-closure.ts';
import { assertHistoryPublicationSchema19, captureHistoryTypedClosurePlan } from '../../../packages/application/src/history-typed-publication.ts';
import { HISTORY_IMPORT_READBACK_VERSION } from '../../../packages/application/src/history-import-lifecycle.ts';
import type { HistoryImportReconciliation } from '../../../packages/application/src/history-import-lifecycle.ts';
import { requestHash } from '../../../packages/application/src/request-hash.ts';
import { assertNativeImportAccountingSchema19Guards } from './native-import-accounting-capability.ts';
import type { PgSalesClient } from './sales-unit-of-work.ts';

/** Same original receipt/cutoff/batch-locked transaction only. Source authorization
 * has already received the complete MAIN command on every attempt/replay. This
 * function cannot substitute SQL observations for that independent authorization. */
export async function reconcileHistoryTypedPublication(client: PgSalesClient, batch: CutoffImportBatch,
  originalPlan: HistoryTypedClosurePlan, schemaVersions: readonly number[], runtime26?: NativeRuntime26Capability): Promise<HistoryImportReconciliation> {
  const plan = captureHistoryTypedClosurePlan(originalPlan);
  const runtime = checkedNativeRuntime26Capability(runtime26);
  if (runtime) {
    requireDomain(Array.isArray(schemaVersions) && schemaVersions.length === 26 && schemaVersions.every((v, i) => v === i + 1),
      "HISTORY_PUBLICATION_SCHEMA_NOT_READY", "Exact26 complete prefix required with successor runtime");
    await runtime.assertReady(client, "IMPORT_PUBLISH");
  } else {
    assertHistoryPublicationSchema19(schemaVersions);
    await assertNativeImportAccountingSchema19Guards(client);
  }
  requireDomain(batch.mappingVersion === 'V2_HISTORY_NULLABLE_1' && batch.historyMetadata !== undefined
    && plan.selectionSha256 === batch.sourceHash && plan.authorizedPayloadHash === batch.historyMetadata.payloadHash
    && requestHash(plan.expectedCounts) === requestHash(batch.historyMetadata.expectedCounts),
  'HISTORY_PUBLICATION_PLAN_MISMATCH', 'Exact independently authorized batch and complete history plan required');
  const expected = { batch_id: batch.id, validator_version: plan.version, selection_sha256: plan.selectionSha256, authorized_payload_hash: plan.authorizedPayloadHash,
    source_manifest_sha256: plan.sourceManifestSha256, typed_manifest_sha256: plan.typedManifestSha256, document_manifest_sha256: plan.documentManifestSha256,
    expected_counts: plan.expectedCounts, source_entity_counts: plan.sourceEntityCounts, document_count: plan.documentCount };
  const manifest = (await client.query('/* history-publication:manifest */ SELECT to_jsonb(m)=$2::jsonb exact FROM naijue_erp.import_history_closure_manifest m WHERE m.batch_id=$1::uuid FOR SHARE', [batch.id, JSON.stringify(expected)])).rows;
  requireDomain(manifest.length === 1 && manifest[0]!.exact === true, 'HISTORY_PUBLICATION_MANIFEST_MISMATCH', 'Exact immutable whole closure manifest required; STAGE success alone cannot publish');
  const documents = (await client.query(`/* history-publication:documents */ SELECT document_kind AS kind,source_key AS "sourceKey",header_source_row_id::text AS "headerSourceRowId",
    COALESCE(sales_header_id,transfer_header_id)::text AS "headerId",header_source_sha256 AS "headerSourceSha256",line_count AS "lineCount",settlement_count AS "settlementCount",
    source_document_sha256 AS "sourceDocumentSha256",typed_document_sha256 AS "typedDocumentSha256"
    FROM naijue_erp.import_history_document_manifest WHERE batch_id=$1::uuid
    ORDER BY document_kind COLLATE "C",COALESCE(sales_header_id,transfer_header_id) LIMIT 100001 FOR SHARE`, [batch.id])).rows;
  // Revalidate size, every descriptor and count, then independently recompute all
  // SQL row/document roots and bidirectional source coverage under original locks.
  const input = captureHistoryTypedClosureStageInput({ batchId: batch.id, fixedSourceNamespace: batch.sourceName, plan, documents });
  await client.query('/* history-publication:deep-readback */ SELECT naijue_erp.assert_history_typed_closure($1::uuid,$2::jsonb,$3::jsonb)', [batch.id, JSON.stringify(input.plan), JSON.stringify(input.documents)]);
  const counts = (await client.query(`/* history-publication:counts */ SELECT
    (SELECT expected_counts FROM naijue_erp.import_history_closure_manifest WHERE batch_id=$1::uuid) AS manifest_counts,
    jsonb_build_object('import_source_row',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid),
     'import_sku_alias',(SELECT count(*) FROM naijue_erp.import_sku_alias WHERE batch_id=$1::uuid),
     'import_stock_contributor',(SELECT count(*) FROM naijue_erp.import_stock_contributor WHERE batch_id=$1::uuid),
     'barcodes',(SELECT count(*) FROM naijue_erp.import_source_row WHERE batch_id=$1::uuid AND entity_type='BARCODE'),
     'history_sales_header',(SELECT count(*) FROM naijue_erp.history_sales_header WHERE batch_id=$1::uuid),
     'history_sales_line',(SELECT count(*) FROM naijue_erp.history_sales_line WHERE batch_id=$1::uuid),
     'history_sales_settlement',(SELECT count(*) FROM naijue_erp.history_sales_settlement WHERE batch_id=$1::uuid),
     'history_transfer_header',(SELECT count(*) FROM naijue_erp.history_transfer_header WHERE batch_id=$1::uuid),
     'history_transfer_line',(SELECT count(*) FROM naijue_erp.history_transfer_line WHERE batch_id=$1::uuid)) AS actual_counts`, [batch.id])).rows;
  requireDomain(counts.length === 1 && requestHash(counts[0]!.actual_counts) === requestHash(plan.expectedCounts)
    && requestHash(counts[0]!.manifest_counts) === requestHash(plan.expectedCounts), 'HISTORY_PUBLICATION_COUNTS_MISMATCH', 'Independent complete actual SQL counts must match authenticated expected after deep readback');
  // Return observed SQL values only; expected is never copied into actual.
  return { actualCounts: structuredClone(counts[0]!.actual_counts) as HistoryImportReconciliation['actualCounts'], authorizedPayloadHash: plan.authorizedPayloadHash,
    sourcePayloadHashRecomputed: false, sqlFieldValidation: HISTORY_IMPORT_READBACK_VERSION };
}
