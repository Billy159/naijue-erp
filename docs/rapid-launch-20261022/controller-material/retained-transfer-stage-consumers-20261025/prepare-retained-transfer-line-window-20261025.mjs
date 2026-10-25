// Original line input recovery only; no source factory, UUID allocation or SQL.
import assert from 'node:assert/strict';
export function prepareRetainedTransferLineWindow(originalExports,{binding,sourceProjection,typedProjection}){
 const s=sourceProjection.projection,t=typedProjection.projection;
 assert.equal(s.entity_type,'TRANSFER_LINE');assert.equal(s.batch_id,binding.batchId);assert.equal(t.source_row_id,s.id);assert.equal(t.batch_id,binding.batchId);
 const {history_staging:proof,...fieldProvenance}=s.field_provenance;
 assert.equal(proof.validator_version,'V3_TRANSFER_LINE_STAGE_1');assert.equal(proof.selection.selectionSha256,binding.selectionSha256);
 const source={id:s.id,batchId:s.batch_id,entityType:s.entity_type,sourceKey:s.source_key,fileRef:s.file_ref,sheet:s.sheet,rowNo:s.row_no,
  sourceFileSha256:s.source_file_sha256,rowSha256:s.row_sha256,rawFields:s.raw_fields,normalizedFields:s.normalized_fields,fieldProvenance};
 const input={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:proof.selection,rows:[{source,
  header:{sourceKey:s.normalized_fields['单据来源编号'],nativeId:t.header_id},sku:{sourceKey:s.normalized_fields['SKU来源编号'],nativeId:t.sku_id}}]};
 const chunk=originalExports.prepareV3HistoryChunk(input);originalExports.validatePreparedHistoryChunk(chunk);
 assert.equal(chunk.rows[0].fingerprint,proof.fingerprint);
 assert.deepEqual(originalExports.historyClosureProjectionRow26('import_source_row',originalExports.transferLineSourceEvidence26(chunk.rows[0],chunk.selection)),sourceProjection);
 assert.deepEqual(originalExports.historyClosureProjectionRow26('history_transfer_line',chunk.rows[0].line),typedProjection);
 return {chunk,sourceAuthority:'ORIGINAL_CONTROLLER_T45_EXACT_RETAINED_SOURCE_AND_TARGET_GRANT_REQUIRED',executionAuthorized:false,databaseCalls:0,newNativeUUIDs:0};
}
