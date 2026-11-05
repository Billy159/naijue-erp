import { TABLE_SCHEMAS, parseStrictJson, sha256, validateUnifiedPackage } from '../../packages/application/src/unified-import-contract.ts';

export const MIXED_SPLIT_EVIDENCE_VERSION = 'MIXED_SALES_SPLIT_EVIDENCE_V1';
const tables = ['sales_header', 'sales_line', 'sales_settlement'];
const excluded = {
  sales_header: new Set(['id', 'version', 'stock_basis', 'import_batch_id', 'business_type']),
  sales_line: new Set(['id', 'is_current', 'sales_id', 'line_no']),
  sales_settlement: new Set(['id', 'sales_id', 'line_no']),
};
// Frozen V1 shape: a future receiving-schema change requires an explicit successor.
const v1FactKeys = {
  "sales_header": [
    "number",
    "business_date",
    "hall_id",
    "salesperson_id",
    "customer_id",
    "warehouse_id",
    "status",
    "gross_amount",
    "order_discount",
    "net_due",
    "note",
    "created_by_account_id",
    "created_hall_id",
    "created_at",
    "updated_at",
    "approved_by_account_id",
    "approved_at",
    "responsible_staff_id",
    "created_by_staff_id",
    "approved_by_staff_id"
  ],
  "sales_line": [
    "sku_id",
    "quantity",
    "reference_price",
    "deal_price",
    "line_amount",
    "allocated_discount",
    "is_gift",
    "product_code_snapshot",
    "product_name_snapshot",
    "color_name_snapshot",
    "fit_name_snapshot",
    "size_name_snapshot",
    "barcode_snapshot",
    "pricing_rule",
    "discount_tenths",
    "zero_confirmed"
  ],
  "sales_settlement": [
    "payment_account_id",
    "direction",
    "amount",
    "account_name_snapshot",
    "method_name_snapshot",
    "payment_method_id_snapshot"
  ]
};
export const mixedSplitFactKeys = Object.freeze(Object.fromEntries(Object.entries(v1FactKeys).map(([t, names]) => [t, Object.freeze(names)])));
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, names) => {
  if (!object(v)) return false;
  const actual = Object.keys(v).sort(), expected = [...names].sort();
  return actual.length === expected.length && actual.every((k, i) => k === expected[i]);
};
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 512 &&
  v.isWellFormed() && v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v);
class EvidenceFailure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new EvidenceFailure(code); };
const require = (ok, code) => { if (!ok) fail(code); };
const total = v => {
  require(typeof v === 'string' && v.length <= 128 && /^-?(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(v), 'INVALID_EXACT_MONEY');
  return BigInt(v.replace('.', ''));
};
const sum = (rows, fn) => rows.reduce((n, r) => n + fn(r), 0n);
const refKey = r => JSON.stringify([r.file_sha256, r.sheet, r.row]);
const same = (a, b) => a === b; // All declared fact fields are scalar, preserving null and exact strings.

/** Version guard only; it does not validate input records or grant admission. */
export function isMixedSplitReceiverSchemaSupported(schema) {
  return object(schema) && tables.every(t => {
    if (!object(schema[t])) return false;
    const current = Object.keys(schema[t]).filter(k => !excluded[t].has(k)).sort();
    const fixed = [...mixedSplitFactKeys[t]].sort();
    return current.length === fixed.length && current.every((k, i) => k === fixed[i]);
  });
}

/** Pure, bounded declaration verification, NOT an importer/admission issuer.
 * Existing V1 receiving code checks normalized output records. Its table-count
 * report is NOT reinterpreted as original counts: this separate successor carries
 * original counts explicitly. SQL persistence and streaming integration remain open.
 * Hashes bind declarations to bytes; they never attest actual source-file truth.
 */
export function validateMixedSplitEvidenceV1(outputPackage, evidenceJson, { allowSynthetic = false } = {}) {
  try {
    require(typeof evidenceJson === 'string' && Buffer.byteLength(evidenceJson) <= 16 * 1024 * 1024, 'EVIDENCE_SIZE_OR_TYPE');
    let e;
    try { e = parseStrictJson(evidenceJson); } catch { fail('INVALID_EVIDENCE_JSON'); }
    require(keys(e, ['format_version', 'output_manifest_sha256', 'original_counts', 'output_counts', 'groups']) &&
      e.format_version === MIXED_SPLIT_EVIDENCE_VERSION, 'EVIDENCE_CONTRACT');
    require(isMixedSplitReceiverSchemaSupported(TABLE_SCHEMAS), 'RECEIVER_FACT_SCHEMA_CHANGED');
    require(validateUnifiedPackage(outputPackage, { allowSynthetic }).valid === true, 'OUTPUT_PACKAGE_INVALID');
    const manifestHash = sha256(JSON.stringify(outputPackage.manifest));
    require(e.output_manifest_sha256 === manifestHash, 'OUTPUT_MANIFEST_BINDING');
    require(Array.isArray(e.groups) && e.groups.length > 0 && e.groups.length <= 10000, 'GROUPS_REQUIRED_OR_LIMIT');
    for (const counts of [e.original_counts, e.output_counts]) require(keys(counts, tables) &&
      Object.values(counts).every(n => Number.isSafeInteger(n) && n >= 0), 'COUNT_CONTRACT');
    for (const t of tables) require(e.output_counts[t] === outputPackage.records[t].length, 'OUTPUT_COUNT_MISMATCH');
    const sources = new Set(outputPackage.manifest.source_files.map(f => f.sha256));
    const indexes = Object.fromEntries(tables.map(t => [t, new Map(outputPackage.records[t].map(r => [r.fields.id, r]))]));
    const children = Object.fromEntries(['sales_line', 'sales_settlement'].map(t => {
      const grouped = new Map();
      for (const row of outputPackage.records[t]) {
        const list = grouped.get(row.fields.sales_id) ?? []; list.push(row); grouped.set(row.fields.sales_id, list);
      }
      return [t, grouped];
    }));
    const usedOutputs = Object.fromEntries(tables.map(t => [t, new Set()]));
    const usedSources = Object.fromEntries(tables.map(t => [t, new Set()]));
    const usedRefs = Object.fromEntries(tables.map(t => [t, new Set()]));
    const groupKeys = new Set();
    function refs(rs) {
      require(Array.isArray(rs) && rs.length > 0 && rs.length <= 256, 'SOURCE_REFERENCES_REQUIRED');
      const seen = new Set();
      for (const r of rs) {
        require(keys(r, ['file_sha256', 'sheet', 'row']) && sources.has(r.file_sha256) &&
          (r.sheet === null || text(r.sheet)) && Number.isSafeInteger(r.row) && r.row > 0 && r.row <= 2147483647,
        'INVALID_SOURCE_REFERENCE');
        const key = refKey(r); require(!seen.has(key), 'DUPLICATE_SOURCE_REFERENCE'); seen.add(key);
      }
    }
    function source(t, row) {
      require(keys(row, t === 'sales_header' ? ['source_key', 'source_refs', 'fields'] :
        ['source_key', 'source_refs', 'original_line_no', 'output_id', 'fields']), 'SOURCE_RECORD_CONTRACT');
      require(text(row.source_key) && !usedSources[t].has(row.source_key), 'SOURCE_ID_REUSED'); usedSources[t].add(row.source_key);
      refs(row.source_refs);
      for (const r of row.source_refs) { const key = refKey(r); require(!usedRefs[t].has(key), 'SOURCE_LOCATOR_REUSED'); usedRefs[t].add(key); }
      require(keys(row.fields, mixedSplitFactKeys[t]), 'SOURCE_FACT_KEYS');
      if (t !== 'sales_header') require(Number.isSafeInteger(row.original_line_no) && row.original_line_no > 0, 'ORIGINAL_LINE_NUMBER');
    }
    function output(t, id) {
      const row = indexes[t].get(id);
      require(row && !usedOutputs[t].has(id), 'OUTPUT_ID_MISSING_OR_REUSED'); usedOutputs[t].add(id);
      return row;
    }
    function carriesRefs(original, normalized) {
      const actual = new Set(normalized.source_refs.map(refKey));
      require(original.source_refs.every(r => actual.has(refKey(r))), 'OUTPUT_SOURCE_TRACE_MISSING');
    }
    for (const g of e.groups) {
      require(keys(g, ['group_key', 'original_header', 'output_header_ids', 'lines', 'settlements']) &&
        text(g.group_key) && !groupKeys.has(g.group_key), 'GROUP_CONTRACT_OR_DUPLICATE'); groupKeys.add(g.group_key);
      source('sales_header', g.original_header);
      require(Array.isArray(g.output_header_ids) && g.output_header_ids.length === 2, 'EXACT_SALE_RETURN_PAIR_REQUIRED');
      const headers = g.output_header_ids.map(id => output('sales_header', id));
      require(headers.filter(r => r.fields.business_type === 'SALE').length === 1 &&
        headers.filter(r => r.fields.business_type === 'RETURN').length === 1 &&
        headers.every(r => r.fields.stock_basis === 'CUTOFF_HISTORY'), 'EXACT_HISTORICAL_SALE_RETURN_PAIR_REQUIRED');
      const original = g.original_header.fields;
      require(text(original.number), 'ORIGINAL_NUMBER_REQUIRED');
      for (const h of headers) {
        carriesRefs(g.original_header, h);
        for (const k of mixedSplitFactKeys.sales_header.filter(k => !['number', 'gross_amount', 'order_discount', 'net_due'].includes(k)))
          require(same(h.fields[k], original[k]), 'HEADER_FACT_CHANGED');
      }
      const headerIDs = new Set(g.output_header_ids);
      for (const [t, rows] of [['sales_line', g.lines], ['sales_settlement', g.settlements]]) {
        require(Array.isArray(rows) && rows.length <= 100000 && (t !== 'sales_line' || rows.length > 0), 'GROUP_ROWS_LIMIT');
        const originalNumbers = new Set();
        for (const row of rows) {
          source(t, row);
          require(!originalNumbers.has(row.original_line_no), 'ORIGINAL_LINE_NUMBER_REUSED'); originalNumbers.add(row.original_line_no);
          const out = output(t, row.output_id);
          require(headerIDs.has(out.fields.sales_id), 'CROSS_GROUP_OUTPUT'); carriesRefs(row, out);
          for (const k of mixedSplitFactKeys[t]) require(same(row.fields[k], out.fields[k]), 'ROW_FACT_CHANGED');
        }
        const actual = g.output_header_ids.flatMap(id => children[t].get(id) ?? []);
        require(actual.length === rows.length && actual.every(r => usedOutputs[t].has(r.fields.id)), 'GROUP_OUTPUT_ROWS_UNACCOUNTED');
      }
      // This profile does not distribute a line or infer discount evidence.
      require(g.lines.every(r => r.fields.allocated_discount !== null), 'ALLOCATION_EVIDENCE_REQUIRED');
      const gross = sum(g.lines, r => total(r.fields.line_amount));
      const discount = sum(g.lines, r => total(r.fields.allocated_discount));
      const net = total(original.net_due);
      require(gross === total(original.gross_amount) && discount === total(original.order_discount) && gross - discount === net,
        'ORIGINAL_GROUP_ECONOMIC_MISMATCH');
      for (const k of ['gross_amount', 'order_discount', 'net_due'])
        require(sum(headers, r => total(r.fields[k])) === total(original[k]), 'SPLIT_GROUP_TOTAL_MISMATCH');
      if (original.status === 'APPROVED') require(sum(g.settlements, r => total(r.fields.amount) *
        (r.fields.direction === 'RECEIVE' ? 1n : -1n)) === net, 'ORIGINAL_GROUP_SETTLEMENT_MISMATCH');
    }
    // Unsplit output documents/lines/settlements retain their existing 1:1 count.
    for (const t of tables) require(e.original_counts[t] === e.output_counts[t] - usedOutputs[t].size + usedSources[t].size,
      'ORIGINAL_OUTPUT_COUNT_MISMATCH');
    return { valid: true, state: 'DECLARATION_CONSERVATION_VERIFIED', format_version: MIXED_SPLIT_EVIDENCE_VERSION,
      evidence_sha256: sha256(evidenceJson), output_manifest_sha256: manifestHash, groups_verified: e.groups.length,
      source_truth_verified: false, database_proof_verified: false, import_admission_ready: false };
  } catch (error) {
    const code = error instanceof EvidenceFailure ? error.code : 'INVALID_EVIDENCE_INPUT';
    return { valid: false, state: 'REJECTED', code, source_truth_verified: false,
      database_proof_verified: false, import_admission_ready: false };
  }
}
