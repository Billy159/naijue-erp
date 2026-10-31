// Pure original retained-header reconstruction; injected fixed original exports only.
import assert from 'node:assert/strict';
export function prepareRetainedTransferHeaderProjectionWindow(originalExports, w) {
  const s = w.sourceProjection.projection, h = w.typedProjection.projection;
  const { prepareV3HistoryHeaderChunk, validatePreparedHistoryHeaderChunk, transferHeaderProjection26 } = originalExports;
  assert.equal(w.version, 'EXISTING_TRANSFER_HEADER_RETAINED_SINGLE_WINDOW_V1');
  assert.equal(s.entity_type, 'TRANSFER_HEADER'); assert.equal(s.batch_id, w.binding.batchId);
  assert.equal(h.id, w.documentAllocation.headerId); assert.equal(h.source_row_id, s.id);
  assert.equal(w.documentAllocation.headerSourceRowId, s.id); assert.equal(w.documentAllocation.sourceKey, s.source_key);
  // Exact original authorized-header-reader source construction, not reversal of derived fields.
  const fields = Object.fromEntries(Object.entries(s.raw_fields).map(([key, raw]) => [key, { origin: 'ORIGINAL', reason: 'EXACT_ORIGINAL_SNAPSHOT_CELL', raw }]));
  fields.__source_row_hash = { origin: 'ORIGINAL', reason: 'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1', raw: s.row_sha256 };
  const cell = s.field_provenance.history_cell_encoding_evidence;
  const source = { id: s.id, batchId: s.batch_id, entityType: s.entity_type, sourceKey: s.source_key, fileRef: s.file_ref,
    sheet: s.sheet, rowNo: s.row_no, sourceFileSha256: s.source_file_sha256, rowSha256: s.row_sha256,
    rawFields: s.raw_fields, normalizedFields: s.normalized_fields,
    fieldProvenance: { schema_version: 1, fields, history_cell_encoding_evidence: cell } };
  const n = s.normalized_fields;
  const overlay = { evidenceRef: s.field_provenance.fields.created_hall_id.evidence_ref, file: s.file_ref, sheet: s.sheet, row: s.row_no,
    sourceId: s.source_key, documentNumber: n['原单号'], personField: '原制单账号编号', personId: n['原制单账号编号'],
    uploadedWarehouseDerivedHall: s.raw_fields['原创建厅编号'] ?? '', candidateCreatorHall: n['原创建厅编号'],
    provenance: n['创建厅归属来源'], reason: n['创建厅归属原因'] };
  const bindings = { '调出仓来源编号': { sourceKey: n['调出仓来源编号'], nativeId: h.from_warehouse_id },
    '调入仓来源编号': { sourceKey: n['调入仓来源编号'], nativeId: h.to_warehouse_id } };
  if (n['原创建厅编号'] !== '') bindings['原创建厅编号'] = { sourceKey: n['原创建厅编号'], nativeId: h.created_hall_id };
  const input = { batchId: w.binding.batchId, fixedSourceNamespace: w.binding.fixedSourceNamespace,
    source, selection: s.field_provenance.history_header_staging.selection, creatorHallOverlay: overlay,
    temporalEvidence: cell.temporalEvidence, bindings };
  const chunk = prepareV3HistoryHeaderChunk([input]); validatePreparedHistoryHeaderChunk(chunk);
  assert.equal(chunk.rows[0].prepared.fingerprint, s.field_provenance.history_header_staging.fingerprint);
  const expected = transferHeaderProjection26(chunk.rows[0].prepared);
  assert.deepEqual(expected.sourceRow, w.sourceProjection); assert.deepEqual(expected.typedRow, w.typedProjection); assert.deepEqual(expected.document, w.documentAllocation);
  return { chunk, binding: w.binding, retainedProjection: expected,
    sourceAuthority: 'C_SEPARATE_EXACT_RETAINED_SOURCE_AND_TARGET_AUTHORIZATION_REQUIRED_NOT_OLD_READER_LEASE',
    executionAuthorized: false, databaseCalls: 0, newNativeUUIDs: 0 };
}