/** Fixed catalogue/reference inputs, not all legacy business tables.
 * Called within the document reader same RR READ ONLY transaction.
 * Retired tables have no PK: ctid is only a snapshot-local physical locator,
 * never a target SKU, barcode or durable business identity. Raw JSON stays text.
 */
export const legacyReferenceTables = Object.freeze([
  {"table":"erp_prod_source.category","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.fit","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.brand","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.unit","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.product","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.product_price","keys":["product_id","price_type_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.product_option","keys":["product_id","spec_value_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.spec_dimension","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.spec_value","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.size_group","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.size_group_item","keys":["size_group_id","spec_value_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.variant","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.variant_option","keys":["variant_id","dimension_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.warehouse","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.counterparty","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_import_run","keys":["batch_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_product_source","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_hall","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_department","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_employee","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_party_role","keys":["batch_id","source_id","role"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_payment_method","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_fund_account","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.tplus_product_barcode","keys":["batch_id","source_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.barcode","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.barcode_encoding_mapping","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.barcode_scheme","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.barcode_scheme_segment","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.barcode_scheme_version","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_source.product_image","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_overlay","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_profile_overlay","keys":["product_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_master_overlay","keys":["kind","id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.variant_overlay","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.size_overlay","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.master_data_entity","keys":["kind","id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.operator","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_image","keys":["id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_barcode_alias","keys":["barcode"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.product_barcode_alias_retired","keys":["ctid"],"keyKind":"SNAPSHOT_PHYSICAL_NOT_BUSINESS_ID"},
  {"table":"erp_prod_runtime.generated_barcode","keys":["sku_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.generated_barcode_retired","keys":["ctid"],"keyKind":"SNAPSHOT_PHYSICAL_NOT_BUSINESS_ID"},
  {"table":"erp_prod_runtime.barcode_scheme_supplement","keys":["sku_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.barcode_authority_policy","keys":["singleton"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.barcode_authority_product","keys":["product_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.barcode_authority_record","keys":["sku_id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.master_reference_overlay","keys":["kind","id"],"keyKind":"PRIMARY_KEY"},
  {"table":"erp_prod_runtime.master_data_history","keys":["kind","id","version"],"keyKind":"PRIMARY_KEY"},
].map(row => Object.freeze({...row, keys: Object.freeze(row.keys)})));

export function readLegacyReferenceTables(client, options) {
  return readFixedLegacyTableSet(client, legacyReferenceTables, options);
}

/** Exact missing inputs used by original SALE/TRANSFER currentSourceBinding
 * consumers. Original source records stay opaque private JSON, not CSV evidence
 * or automatically authorized historical identities. No authentication tables. */
export const legacySourceProofTables = Object.freeze([
  Object.freeze({table:'erp_prod_source.import_batch',keys:Object.freeze(['id']),keyKind:'PRIMARY_KEY'}),
  Object.freeze({table:'erp_prod_source.source_record',keys:Object.freeze(['id']),keyKind:'PRIMARY_KEY'}),
]);
export function readLegacySourceProofTables(client, {pageRows,onSourceProof,signal}) {
  return readFixedLegacyTableSet(client, legacySourceProofTables, {
    pageRows,onReferences:onSourceProof,signal,cursorPrefix:'cleaning_source_proof',progressProperty:'sourceProofSnapshotProgress',
  });
}

/** Internal reuse for fixed catalogue-derived table lists, inside the caller's RRRO.
 * This does not authorize arbitrary callers or establish target identity/permissions.
 */
export async function readFixedLegacyTableSet(client, specifications, {pageRows, onReferences, signal, cursorPrefix = 'cleaning_reference', progressProperty = 'referenceSnapshotProgress'}) {
  if (!Number.isSafeInteger(pageRows) || pageRows < 1 || pageRows > 500) throw new Error('INVALID_REFERENCE_PAGE_SIZE');
  if (typeof onReferences !== 'function') throw new Error('REFERENCE_SNAPSHOT_SINK_REQUIRED');
  if (!['referenceSnapshotProgress', 'inventorySnapshotProgress', 'sourceProofSnapshotProgress'].includes(progressProperty)
    || !/^[a-z_]+$/.test(cursorPrefix) || !Array.isArray(specifications) || !specifications.length
    || new Set(specifications.map(row => row.table)).size !== specifications.length
    || specifications.some(row => !/^erp_prod_(source|runtime)\.[a-z_]+$/.test(row.table)
      || !Array.isArray(row.keys) || !row.keys.length || row.keys.some(key => !/^[a-z_]+$/.test(key))
      || (row.selection !== undefined && !(row.selection === 'STANDARD_SIZE_MAPPING_ONLY' && row.table === 'erp_prod_source.system_setting' && JSON.stringify(row.keys) === '["key"]'))
      || !['PRIMARY_KEY','SNAPSHOT_PHYSICAL_NOT_BUSINESS_ID'].includes(row.keyKind))) throw new Error('FIXED_LEGACY_TABLE_SPECIFICATION_REQUIRED');
  const progress = [];
  try {
    for (let index = 0; index < specifications.length; index++) {
      signal?.throwIfAborted();
      const {table, keys, keyKind, selection} = specifications[index];
      // Only this fixed, source-consumer-proven setting is in scope. Never read
      // unrelated settings, which may contain private runtime configuration.
      const where = selection === 'STANDARD_SIZE_MAPPING_ONLY' ? " WHERE r.key='inventory.standard-size-mappings'" : '';
      const cursor = `${cursorPrefix}_${index}`;
      const receipt = {table, keyKind, expected: null, rowsRead: '0', eofObserved: false,
        rawJsonUtf8Bytes: '0', largestRawJsonRowUtf8Bytes: '0'};
      progress.push(receipt);
      const count = await client.query(`SELECT count(*)::text AS expected FROM ${table}${where ? ' r' + where : ''}`);
      const expected = count.rows[0]?.expected;
      if (typeof expected !== 'string' || !/^(0|[1-9][0-9]*)$/.test(expected)) throw new Error('INVALID_REFERENCE_COUNT');
      receipt.expected = expected;
      await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT
        jsonb_build_array(${keys.map(key => `r.${key}::text`).join(', ')})::text AS source_key_json,
        to_jsonb(r)::text AS raw_json FROM ${table} r${where} ORDER BY ${keys.map(key => `r.${key}`).join(', ')}`);
      const seen = new Set(); let rowsRead = 0n, jsonBytes = 0n, largestRowBytes = 0n;
      for (;;) {
        signal?.throwIfAborted();
        const page = await client.query(`FETCH FORWARD ${pageRows} FROM ${cursor}`);
        if (!Array.isArray(page.rows) || page.rows.length > pageRows) throw new Error('INVALID_REFERENCE_PAGE');
        if (page.rows.length === 0) { receipt.eofObserved = true; break; }
        for (const row of page.rows) {
          if (typeof row.source_key_json !== 'string' || typeof row.raw_json !== 'string') throw new Error('INVALID_REFERENCE_ROW');
          let key;
          try { key = JSON.parse(row.source_key_json); } catch { throw new Error('INVALID_REFERENCE_KEY'); }
          if (!Array.isArray(key) || key.length !== keys.length || key.some(value => typeof value !== 'string')) throw new Error('INVALID_REFERENCE_KEY');
          // Tuple encoding preserves composite identities without delimiter collisions.
          const identity = JSON.stringify(key);
          if (seen.has(identity)) throw new Error('DUPLICATE_REFERENCE_KEY');
          seen.add(identity);
          const bytes = BigInt(Buffer.byteLength(row.raw_json, 'utf8'));
          jsonBytes += bytes;
          if (bytes > largestRowBytes) largestRowBytes = bytes;
        }
        rowsRead += BigInt(page.rows.length);
        receipt.rowsRead = rowsRead.toString();
        receipt.rawJsonUtf8Bytes = jsonBytes.toString();
        receipt.largestRawJsonRowUtf8Bytes = largestRowBytes.toString();
        if (rowsRead > BigInt(expected)) throw new Error('REFERENCE_COUNT_EXCEEDED');
        await onReferences(table, page.rows);
        signal?.throwIfAborted();
      }
      if (rowsRead !== BigInt(expected)) throw new Error('REFERENCE_EOF_COUNT_MISMATCH');
      await client.query(`CLOSE ${cursor}`);
    }
    return progress;
  } catch (error) {
    if (error instanceof Error && Object.isExtensible(error)) {
      error[progressProperty] = Object.freeze(progress.map(row => Object.freeze({...row})));
    }
    throw error;
  }
}
