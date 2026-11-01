import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLegacyDocumentAndReferenceSnapshot} from '../scripts/import-v3/native-cleaning/document-snapshot-reader.mjs';
import {legacyReferenceTables, readLegacyReferenceTables} from '../scripts/import-v3/native-cleaning/reference-snapshot-reader.mjs';

function database({tables = {}, counts = {}} = {}) {
  const calls = [], positions = new Map(); let connections = 0;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_current_snapshot')) return {rows: [{database: 'isolated', role: 'ordinary', snapshot: '10:20:', read_only: 'on', isolation: 'repeatable read'}]};
      const count = /AS expected FROM (\w+\.\w+)/.exec(sql);
      if (count) return {rows: [{expected: counts[count[1]] ?? String((tables[count[1]] ?? []).length)}]};
      if (sql.includes(' AS documents,')) return {rows: [{documents: '1', revisions: '1'}]};
      if (sql.startsWith('FETCH')) {
        const cursor = sql.split(' ').at(-1), size = Number(sql.split(' ')[2]);
        const index = /^cleaning_reference_(\d+)$/.exec(cursor);
        const rows = index ? tables[legacyReferenceTables[Number(index[1])].table] ?? []
          : [{source_document_id: 'a', source_revision: '1', raw_json: '{"amount":9007199254740993.01}'}];
        const offset = positions.get(cursor) ?? 0;
        positions.set(cursor, offset + size);
        return {rows: rows.slice(offset, offset + size)};
      }
      return {rows: []};
    },
    release(error) { calls.push({release: error?.message ?? null}); },
  };
  return {calls, get connections() { return connections; }, pool: {connect: async () => { connections++; return client; }}};
}
const row = (...keys) => ({source_key_json: JSON.stringify(keys), raw_json: '{"price":9007199254740993.01,"missing":null}'});
const sinks = () => ({pageRows: 1, onDocuments: async () => {}, onRevisions: async () => {}, onReferences: async () => {}});

test('48 reference tables and documents use one transaction, explicit EOF and independent counts', async () => {
  const input = [row('p1'), row('p2')], db = database({tables: {'erp_prod_source.product': input}}), seen = [];
  const result = await readLegacyDocumentAndReferenceSnapshot(db.pool, {...sinks(), onReferences: async (table, rows) => seen.push({table, rows})});
  assert.equal(result.status, 'COMPLETE_DOCUMENT_AND_REFERENCE_SNAPSHOT');
  assert.equal(db.connections, 1);
  assert.equal(db.calls.filter(sql => typeof sql === 'string' && sql.startsWith('BEGIN')).length, 1);
  assert.equal(db.calls.filter(sql => sql === 'ROLLBACK').length, 1);
  assert.equal(result.references.length, 48);
  assert.ok(result.references.every(receipt => receipt.eofObserved && receipt.expected === receipt.rowsRead));
  assert.equal(result.references.find(receipt => receipt.table === 'erp_prod_source.product').rowsRead, '2');
  assert.equal(result.references.find(receipt => receipt.table === 'erp_prod_source.product').rawJsonUtf8Bytes, String(input.reduce((sum, item) => sum + Buffer.byteLength(item.raw_json), 0)));
  assert.equal(result.references.find(receipt => receipt.table === 'erp_prod_source.product').largestRawJsonRowUtf8Bytes, String(Buffer.byteLength(input[0].raw_json)));
  assert.equal(result.rawJsonUtf8Bytes.documents, String(Buffer.byteLength('{"amount":9007199254740993.01}')));
  assert.ok(seen.flatMap(batch => batch.rows).every(value => value.raw_json.includes('9007199254740993.01')));
  assert.equal(JSON.stringify(result).includes('p1'), false); // Receipt is metadata/counts only.
  assert.deepEqual(db.calls.at(-1), {release: null});
});

test('retired rows with identical business JSON retain independent snapshot-local locators', async () => {
  const table = 'erp_prod_runtime.product_barcode_alias_retired', db = database({tables: {[table]: [row('(0,1)'), row('(0,2)')]}}), seen = [];
  const result = await readLegacyDocumentAndReferenceSnapshot(db.pool, {...sinks(), onReferences: async (name, rows) => {if (name === table) seen.push(...rows);}});
  assert.equal(seen.length, 2);
  assert.equal(result.references.find(receipt => receipt.table === table).keyKind, 'SNAPSHOT_PHYSICAL_NOT_BUSINESS_ID');
  assert.ok(db.calls.some(sql => typeof sql === 'string' && sql.includes('r.ctid::text')));
});

test('JSON byte measurements count UTF8 rather than JavaScript character units', async () => {
  const table = 'erp_prod_source.product', input = {...row('p'), raw_json: '{"值":"衣"}'};
  const db = database({tables: {[table]: [input]}});
  const result = await readLegacyDocumentAndReferenceSnapshot(db.pool, sinks());
  const receipt = result.references.find(item => item.table === table);
  assert.equal(receipt.rawJsonUtf8Bytes, '13');
  assert.equal(receipt.largestRawJsonRowUtf8Bytes, '13');
});

test('composite keys do not collide when their values contain delimiters', async () => {
  const table = 'erp_prod_source.variant_option';
  assert.equal(legacyReferenceTables.find(item => item.table === table).keys.length, 2);
  const db = database({tables: {[table]: [row('a', 'b:c'), row('a:b', 'c')]}});
  const result = await readLegacyDocumentAndReferenceSnapshot(db.pool, sinks());
  assert.equal(result.references.find(receipt => receipt.table === table).rowsRead, '2');
});

for (const [name, config, message] of [
  ['cross-page duplicate', {tables: {'erp_prod_source.product': [row('same'), row('same')]}}, 'DUPLICATE_REFERENCE_KEY'],
  ['missing rows', {tables: {'erp_prod_source.product': [row('only')]}, counts: {'erp_prod_source.product': '2'}}, 'REFERENCE_EOF_COUNT_MISMATCH'],
  ['invalid key', {tables: {'erp_prod_source.product': [{source_key_json: '[123]', raw_json: '{}'}]}}, 'INVALID_REFERENCE_KEY'],
]) test(`${name} rolls back and never completes the combined snapshot`, async () => {
  const db = database(config);
  await assert.rejects(readLegacyDocumentAndReferenceSnapshot(db.pool, sinks()), error => {
    assert.equal(error.message, message);
    assert.ok(error.referenceSnapshotProgress);
    assert.equal(JSON.stringify(error.referenceSnapshotProgress).includes('same'), false);
    return true;
  });
  assert.equal(db.calls.at(-2), 'ROLLBACK');
  assert.deepEqual(db.calls.at(-1), {release: null});
  assert.equal(db.calls.some(sql => typeof sql === 'string' && sql.includes('DECLARE cleaning_documents')), false);
});

test('reference sink failure preserves the original exception and releases the transaction', async () => {
  const db = database({tables: {'erp_prod_source.product': [row('p')]}}), failure = new Error('PRIVATE_OUTPUT_FAILED');
  await assert.rejects(readLegacyDocumentAndReferenceSnapshot(db.pool, {...sinks(), onReferences: async () => {throw failure;}}), error => error === failure);
  assert.equal(db.calls.at(-2), 'ROLLBACK');
  assert.deepEqual(db.calls.at(-1), {release: null});
});

test('cancellation after a reference page stops before document reading', async () => {
  const db = database({tables: {'erp_prod_source.product': [row('p'), row('q')]}}), controller = new AbortController();
  await assert.rejects(readLegacyDocumentAndReferenceSnapshot(db.pool, {...sinks(), signal: controller.signal, onReferences: async () => controller.abort()}), {name: 'AbortError'});
  assert.equal(db.calls.at(-2), 'ROLLBACK');
  assert.equal(db.calls.some(sql => typeof sql === 'string' && sql.includes('DECLARE cleaning_documents')), false);
});

test('missing reference consumer refuses before taking a connection', async () => {
  const db = database();
  await assert.rejects(readLegacyDocumentAndReferenceSnapshot(db.pool, {...sinks(), onReferences: undefined}), /REFERENCE_SNAPSHOT_SINK_REQUIRED/);
  assert.equal(db.connections, 0);
});

test('the reference reader rejects an invalid SQL page bound before sending a query', async () => {
  const client = {query: async () => assert.fail('No SQL may be sent')};
  for (const pageRows of [0, 501, 1.5, '16 FROM other;']) {
    await assert.rejects(readLegacyReferenceTables(client, {pageRows, onReferences: async () => {}}), /INVALID_REFERENCE_PAGE_SIZE/);
  }
});
