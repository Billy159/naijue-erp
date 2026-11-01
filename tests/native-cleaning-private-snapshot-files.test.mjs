import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, stat, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {captureLegacyDocumentAndReferenceSnapshot, captureLegacyCleaningSnapshot} from '../scripts/import-v3/native-cleaning/private-snapshot-files.mjs';

function database({failure} = {}) {
  const calls = [], positions = new Map(); let connections = 0;
  return {calls, get connections() {return connections;}, pool: {connect: async () => {
    connections++;
    return {release: error => calls.push({release: error?.message ?? null}), query: async sql => {
      calls.push(sql);
      if (sql === failure) throw new Error('SYNTHETIC_DATABASE_FAILURE');
      if (sql.includes('pg_current_snapshot')) return {rows: [{database: 'synthetic', role: 'ordinary', snapshot: '1:2:', read_only: 'on', isolation: 'repeatable read'}]};
      if (sql.includes('AS expected FROM')) return {rows: [{expected: '0'}]};
      if (sql.includes(' AS documents,')) return {rows: [{documents: '1', revisions: '1'}]};
      if (sql.startsWith('FETCH')) {
        const cursor = sql.split(' ').at(-1), count = positions.get(cursor) ?? 0;
        positions.set(cursor, count + 1);
        return {rows: cursor.startsWith('cleaning_reference_') || cursor.startsWith('cleaning_inventory_effect_') || count > 0 ? [] :
          [{source_document_id: 'synthetic-id', source_revision: '1', raw_json: '{"amount":9007199254740993.1234,"note":"衣\\n"}'}]};
      }
      return {rows: []};
    }};
  }}};
}
const destination = async () => join(await mkdtemp(join(tmpdir(), 'erp-synthetic-snapshot-')), 'private');

test('complete private snapshot preserves raw numbers, hashes actual files and creates empty tables', async () => {
  const directory = await destination(), db = database();
  const result = await captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory, maxBytes: 1024 * 1024});
  assert.equal(result.status, 'COMPLETE_SCOPED_PRIVATE_SNAPSHOT');
  assert.equal(result.files.length, 50);
  assert.equal(result.files.filter(file => file.rows === '0').length, 48);
  const persisted = JSON.parse(await readFile(join(directory, 'COMPLETE.json'), 'utf8'));
  assert.deepEqual(persisted, result);
  for (const file of result.files) {
    const bytes = await readFile(join(directory, file.filename));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.equal((await stat(join(directory, file.filename))).mode & 0o777, 0o600);
  }
  const doc = JSON.parse(await readFile(join(directory, 'erp_prod_runtime.document.ndjson'), 'utf8'));
  assert.equal(doc.raw_json, '{"amount":9007199254740993.1234,"note":"衣\\n"}');
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal(db.connections, 1);
  assert.equal(db.calls.filter(sql => sql === 'ROLLBACK').length, 1);
});

test('inventory capture writes all93 scopes in the one original RR transaction', async () => {
  const directory = await destination(), db = database();
  const result = await captureLegacyCleaningSnapshot(db.pool, {directory, maxBytes: 1024 * 1024});
  assert.equal(result.files.length, 93);
  assert.equal(result.receipt.inventory.length, 43);
  assert.equal(result.files.find(file => file.table === 'erp_prod_runtime.posting').rows, '0');
  assert.equal(db.connections, 1);
  assert.equal(db.calls.filter(sql => sql === 'ROLLBACK').length, 1);
  assert.ok(result.excludes.includes('credentials'));
  assert.ok(result.excludes.includes('target-conversion-and-writes'));
});

test('existing directory is not touched and no database connection is taken', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'erp-synthetic-existing-')), db = database();
  await assert.rejects(captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory, maxBytes: 1024}), {code: 'EEXIST'});
  assert.equal(db.connections, 0);
});

for (const [name, config, budget, message] of [
  ['payload budget', {}, 1, 'PRIVATE_SNAPSHOT_BYTE_BUDGET_EXCEEDED'],
  ['manifest budget', {}, 500, 'PRIVATE_SNAPSHOT_BYTE_BUDGET_EXCEEDED'],
  ['revision query', {failure: 'FETCH FORWARD 16 FROM cleaning_revisions'}, 1024 * 1024, 'SYNTHETIC_DATABASE_FAILURE'],
  ['rollback unconfirmed', {failure: 'ROLLBACK'}, 1024 * 1024, 'SYNTHETIC_DATABASE_FAILURE'],
]) test(`${name} retains only provisional files without a completion marker`, async () => {
  const directory = await destination(), db = database(config);
  await assert.rejects(captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory, maxBytes: budget}), {message});
  await assert.rejects(access(join(directory, 'COMPLETE.json')), {code: 'ENOENT'});
  assert.equal(typeof db.calls.at(-1), 'object');
});

test('invalid or already cancelled input cannot create private files or take a connection', async () => {
  const db = database(), directory = await destination(), abort = new AbortController(); abort.abort();
  await assert.rejects(captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory, maxBytes: 1024, signal: abort.signal}), {name: 'AbortError'});
  await assert.rejects(access(directory), {code: 'ENOENT'});
  await assert.rejects(captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory: 'relative', maxBytes: 1024}), /ABSOLUTE/);
  await assert.rejects(captureLegacyDocumentAndReferenceSnapshot(db.pool, {directory, maxBytes: undefined}), /BYTE_BUDGET/);
  assert.equal(db.connections, 0);
});
